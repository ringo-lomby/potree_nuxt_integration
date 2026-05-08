
import * as THREE from "../../libs/three.js/build/three.module.js";
import {DrawLineString} from "./DrawLineString.js";
import {Utils} from "../utils.js";
import { EventDispatcher } from "../EventDispatcher.js";

export class DrawLineStringTool extends EventDispatcher {
	constructor (viewer) {
		super();

		this.viewer = viewer;
		this.renderer = viewer.renderer;

		this.addEventListener('start_inserting_linestring', e => {
			this.viewer.dispatchEvent({
				type: 'cancel_insertions'
			});
		});

		this._insertingLinestring = null;
		this._undoStack = [];
		this._redoStack = [];
		this._lsListeners    = new Map();
		this._dragSnapshots  = new Map();

		// Expose the tool on the viewer so panels can reach it without a separate reference.
		viewer._drawLineStringTool = this;

		this.scene = new THREE.Scene();
		this.scene.name = 'scene_draw_linestring';
		this.light = new THREE.PointLight(0xffffff, 1.0);
		this.scene.add(this.light);

		// Pre-allocated objects — reused every frame to avoid GC pressure
		this._frustum = new THREE.Frustum();
		this._projScreenMatrix = new THREE.Matrix4();
		this._renderAreaSize = new THREE.Vector2();
		this._tempCenter = new THREE.Vector3();
		this._tempSpherePos = new THREE.Vector3();
		this._nmouse = new THREE.Vector2();
		this._raycaster = new THREE.Raycaster();
		this._fallbackPlane = new THREE.Plane();
		this._fallbackHit = new THREE.Vector3();
		this._lastClientWidth = 0;
		this._lastClientHeight = 0;

		this.viewer.inputHandler.registerInteractiveScene(this.scene);

		this.onRemove = (e) => {
			let ls = e.linestring;
			// Only remove from the Three.js render scene if it was added there.
			// Imported linestrings that were never visible skip this.
			if (ls._inToolScene) {
				this.scene.remove(ls);
				ls._inToolScene = false;
			}
			let h = this._lsListeners.get(ls);
			if (h) {
				ls.removeEventListener('drag_start',     h.onDragStart);
				ls.removeEventListener('marker_dropped', h.onDropped);
				this._lsListeners.delete(ls);
			}
			// Purge stale undo/redo entries referencing this linestring so it can
			// be fully garbage-collected (no dangling references to its Three.js objects).
			const notThis = e => e.ls !== ls && e.original !== ls && e.wayA !== ls && e.wayB !== ls;
			this._undoStack = this._undoStack.filter(notThis);
			this._redoStack = this._redoStack.filter(notThis);
			this._dragSnapshots.delete(ls);
			// Release GPU resources (geometries, materials) owned by this linestring.
			ls.dispose();
		};

		this.onAdd = (e) => {
			let ls = e.linestring;

			// startInsertion calls this.scene.add(ls) BEFORE addDrawLineString,
			// so ls.parent is already this.scene when onAdd fires.
			// For imports, ls.parent is null — deferred to the render loop.
			ls._inToolScene = (ls.parent === this.scene);

			let onDragStart = () => {
				this._dragSnapshots.set(ls, this._snapshotPoints(ls));
			};
			let onDropped = () => {
				let before = this._dragSnapshots.get(ls);
				if (before !== undefined) {
					this._pushHistory(ls, before);
					this._dragSnapshots.delete(ls);
				}
			};

			ls.addEventListener('drag_start',     onDragStart);
			ls.addEventListener('marker_dropped', onDropped);
			this._lsListeners.set(ls, { onDragStart, onDropped });
		};

		for (let ls of viewer.scene.drawLineStrings) {
			this.onAdd({linestring: ls});
		}

		viewer.addEventListener("update", this.update.bind(this));
		viewer.addEventListener("render.pass.scene", this.render.bind(this));
		viewer.addEventListener("scene_changed", this.onSceneChange.bind(this));

		viewer.scene.addEventListener('draw_linestring_added', this.onAdd);
		viewer.scene.addEventListener('draw_linestring_removed', this.onRemove);

		// Keyboard handling for selected nodes
		this._onKeyDown = (e) => {
			if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
				e.preventDefault();
				let entry = this._undoStack.pop();
				if (entry) {
					this._redoStack.push(entry);
					if (entry.type === 'split') {
						// Undo split: remove the two halves, restore the original way.
						this.viewer.scene.removeDrawLineString(entry.wayA);
						this.viewer.scene.removeDrawLineString(entry.wayB);
						this.viewer.scene.addDrawLineString(entry.original);
					} else {
						this._applySnapshot(entry.ls, entry.before);
					}
				}
			} else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
				e.preventDefault();
				let entry = this._redoStack.pop();
				if (entry) {
					this._undoStack.push(entry);
					if (entry.type === 'split') {
						// Redo split: remove the original way, restore the two halves.
						this.viewer.scene.removeDrawLineString(entry.original);
						this.viewer.scene.addDrawLineString(entry.wayA);
						this.viewer.scene.addDrawLineString(entry.wayB);
					} else {
						this._applySnapshot(entry.ls, entry.after);
					}
				}
			} else if (e.key === 'Delete') {
				for (let ls of this.viewer.scene.drawLineStrings) {
					if (ls.selectedNodeIndex >= 0) {
						let before = this._snapshotPoints(ls);
						ls.deleteSelectedNode();
						this._pushHistory(ls, before);
						break;
					}
				}
			} else if (e.key === 'Escape') {
				let deselectedNode = false;
				for (let ls of this.viewer.scene.drawLineStrings) {
					if (ls.selectedNodeIndex >= 0) {
						ls.selectNode(-1);
						deselectedNode = true;
						break;
					}
				}
				if (!deselectedNode) {
					for (let ls of this.viewer.scene.drawLineStrings) {
						if (ls._selected) {
							ls._selected = false;
							ls.applyHighlight();
						}
					}
					this.viewer.dispatchEvent({ type: 'linestring_selected_in_3d', linestring: null });
				}
			} else if (e.key === 'Insert') {
				for (let ls of this.viewer.scene.drawLineStrings) {
					if (ls.selectedNodeIndex >= 0) {
						e.preventDefault();
						let i = ls.selectedNodeIndex;
						let before = this._snapshotPoints(ls);
						if (i < ls.points.length - 1) {
							ls.insertMarkerAfter(i);
							ls.selectNode(i + 1);
						} else {
							ls.addMarker(ls.points[i].position.clone());
							ls.selectNode(ls.points.length - 1);
						}
						this._pushHistory(ls, before);
						break;
					}
				}
			} else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
				// Priority 1: move a selected individual node
				let handledByNode = false;
				for (let ls of this.viewer.scene.drawLineStrings) {
					if (ls.selectedNodeIndex >= 0) {
						e.preventDefault();

						let i      = ls.selectedNodeIndex;
						let pos    = ls.points[i].position.clone();
						let before = this._snapshotPoints(ls);
						let camera = this.viewer.scene.getActiveCamera();

						let step = camera.position.distanceTo(pos) * 0.005;
						if (e.shiftKey) step *= 10;

						let right = new THREE.Vector3();
						let up    = new THREE.Vector3();
						camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
						right.z = 0; if (right.length() > 0.001) right.normalize(); else right.set(1, 0, 0);
						up.z    = 0; if (up.length()    > 0.001) up.normalize();    else up.set(0, 1, 0);

						if (e.key === 'ArrowLeft')  pos.addScaledVector(right, -step);
						if (e.key === 'ArrowRight') pos.addScaledVector(right,  step);
						if (e.key === 'ArrowUp')    pos.addScaledVector(up,     step);
						if (e.key === 'ArrowDown')  pos.addScaledVector(up,    -step);

						ls.setPosition(i, pos);
						this._pushHistory(ls, before);
						handledByNode = true;
						break;
					}
				}

				// Priority 2: move the whole selected line (no node selected)
				if (!handledByNode) {
					for (let ls of this.viewer.scene.drawLineStrings) {
						if (!ls._selected) continue;
						e.preventDefault();

						let camera = this.viewer.scene.getActiveCamera();
						let center = ls.getBoundingBox().getCenter(new THREE.Vector3());

						let step = camera.position.distanceTo(center) * 0.005;
						if (e.shiftKey) step *= 10;

						let right = new THREE.Vector3();
						let up    = new THREE.Vector3();
						camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
						right.z = 0; if (right.length() > 0.001) right.normalize(); else right.set(1, 0, 0);
						up.z    = 0; if (up.length()    > 0.001) up.normalize();    else up.set(0, 1, 0);

						let delta = new THREE.Vector3();
						if (e.key === 'ArrowLeft')  delta.addScaledVector(right, -step);
						if (e.key === 'ArrowRight') delta.addScaledVector(right,  step);
						if (e.key === 'ArrowUp')    delta.addScaledVector(up,     step);
						if (e.key === 'ArrowDown')  delta.addScaledVector(up,    -step);

						let before = this._snapshotPoints(ls);
						for (let i = 0; i < ls.points.length; i++) {
							ls.points[i].position.add(delta);
						}
						ls._boundingBoxDirty = true;
						ls._geometryDirty    = true;
						ls.update();
						this._pushHistory(ls, before);
						ls.dispatchEvent({ type: 'markers_all_moved', measurement: ls });
						break;
					}
				}
			}
		};
		document.addEventListener('keydown', this._onKeyDown);

		// Ctrl + left-click to select a node, bypassing Potree's inputHandler
		this._onDblClick = (e) => {
			if (!e.ctrlKey || e.button !== 0) return;

			let rect = this.viewer.renderer.domElement.getBoundingClientRect();
			let x = e.clientX - rect.left;
			let y = e.clientY - rect.top;
			let renderAreaSize = this.renderer.getSize(new THREE.Vector2());

			let nmouse = new THREE.Vector2(
				 (x / renderAreaSize.width)  * 2 - 1,
				-(y / renderAreaSize.height) * 2 + 1
			);

			let raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(nmouse, this.viewer.scene.getActiveCamera());

			let hitLs   = null;
			let hitIdx  = -1;
			let hitDist = Infinity;

			for (let ls of this.viewer.scene.drawLineStrings) {
				if (!ls._nodesMesh || !ls._nodesMesh.visible) continue;
				let hits = [];
				ls._nodesMesh.raycast(raycaster, hits);
				for (let hit of hits) {
					if (hit.distance < hitDist) {
						hitDist = hit.distance;
						hitLs   = ls;
						hitIdx  = hit.instanceId;
					}
				}
			}

			if (hitLs) {
				// deselect nodes on other linestrings
				for (let ls of this.viewer.scene.drawLineStrings) {
					if (ls !== hitLs) ls.selectNode(-1);
				}
				hitLs.selectNode(hitIdx);
			}
		};
		this.viewer.renderer.domElement.addEventListener('click', this._onDblClick);

		// Shift + left-click: insert a new node on the nearest line segment
		this._onShiftClick = (e) => {
			if (!e.shiftKey || e.button !== 0) return;
			if (this._insertingLinestring) return;

			let hit = this._findLineSegmentHit(e.clientX, e.clientY, 8);
			if (hit) {
				let before = this._snapshotPoints(hit.ls);
				hit.ls.insertMarkerAfter(hit.segIdx, hit.pos);
				this._pushHistory(hit.ls, before);
			}
		};
		this.viewer.renderer.domElement.addEventListener('click', this._onShiftClick);

		// Plain left-click on a line segment → select the whole LineString
		this._lineDragJustHappened = false; // suppresses the click that follows a drag

		this._onPlainClick = (e) => {
			if (e.ctrlKey || e.shiftKey || e.button !== 0) return;
			if (this._insertingLinestring) return;
			// Don't deselect the line if the mouse-up ended a drag
			if (this._lineDragJustHappened) {
				this._lineDragJustHappened = false;
				return;
			}
			// If the click landed on a node sphere the mesh click handler already
			// ran (Three.js events fire before DOM listeners). Let it win — skip
			// line selection so the node selection is not immediately cleared.
			if (this._findNodeHit(e.clientX, e.clientY)) return;

			let hit = this._findLineSegmentHit(e.clientX, e.clientY, 12);

			let changed = false;
			for (let ls of this.viewer.scene.drawLineStrings) {
				let next = (hit && hit.ls === ls);
				if (ls._selected !== next) {
					ls._selected = next;
					changed = true;
				}
				// Selecting the whole line clears any node selection so the two modes are exclusive.
				if (next && ls.selectedNodeIndex >= 0) {
					ls.selectedNodeIndex = -1;
					changed = true;
				}
				ls.applyHighlight();
			}

			if (changed || hit) {
				this.viewer.dispatchEvent({
					type: 'linestring_selected_in_3d',
					linestring: hit ? hit.ls : null,
				});
			}
		};
		this.viewer.renderer.domElement.addEventListener('click', this._onPlainClick);

		// ── Whole-LineString drag ─────────────────────────────────────────────
		// Dragging the line body (no node selected) translates every node by the
		// same delta, computed on a horizontal plane at the line's centroid Z.
		this._lineDragPending = null; // set on mousedown; cleared on mouseup
		this._lineDragging    = false;

		this._onLineDragDown = (e) => {
			if (e.button !== 0 || e.ctrlKey || e.shiftKey) return;
			if (this._insertingLinestring) return;

			// Require a selected line with no individual node selected
			let selectedLs = null;
			for (let ls of this.viewer.scene.drawLineStrings) {
				if (ls._selected && ls.selectedNodeIndex < 0) { selectedLs = ls; break; }
			}
			if (!selectedLs) return;

			// Only engage if the cursor is actually over the selected line
			let hit = this._findLineSegmentHit(e.clientX, e.clientY, 12);
			if (!hit || hit.ls !== selectedLs) return;

			let rect    = this.viewer.renderer.domElement.getBoundingClientRect();
			let camera  = this.viewer.scene.getActiveCamera();
			let sz      = this.renderer.getSize(new THREE.Vector2());
			let x       = e.clientX - rect.left;
			let y       = e.clientY - rect.top;

			let nmouse = new THREE.Vector2(
				 (x / sz.width)  *  2 - 1,
				-(y / sz.height) *  2 + 1
			);
			let raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(nmouse, camera);

			// Horizontal plane at centroid Z for consistent XYZ translation
			let planeZ    = selectedLs.getBoundingBox().getCenter(new THREE.Vector3()).z;
			let dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);
			let startWorld = new THREE.Vector3();
			if (!raycaster.ray.intersectPlane(dragPlane, startWorld)) return;

			this._lineDragPending = {
				ls:             selectedLs,
				startScreenX:   e.clientX,
				startScreenY:   e.clientY,
				startWorld,
				dragPlane,
				before:         this._snapshotPoints(selectedLs),
				startPositions: selectedLs.points.map(p => p.position.clone()),
			};

			// Use document-level handlers so the drag works even if the cursor
			// leaves the canvas mid-move.
			const onMove = (me) => {
				let { ls, startScreenX, startScreenY, startWorld, dragPlane, startPositions } = this._lineDragPending;

				let dx = me.clientX - startScreenX;
				let dy = me.clientY - startScreenY;

				// Engage drag only after crossing a 5 px threshold
				if (!this._lineDragging && dx * dx + dy * dy < 25) return;

				if (!this._lineDragging) {
					this._lineDragging = true;
					this.viewer.renderer.domElement.style.cursor = 'grabbing';
					// Claim the InputHandler drag so OrbitControls sees a non-null
					// drag.object and skips camera movement for this drag session.
					if (this.viewer.inputHandler.drag) {
						this.viewer.inputHandler.drag.object = ls;
					}
				}

				let rect2  = this.viewer.renderer.domElement.getBoundingClientRect();
				let camera2 = this.viewer.scene.getActiveCamera();
				let sz2    = this.renderer.getSize(new THREE.Vector2());
				let mx     = me.clientX - rect2.left;
				let my     = me.clientY - rect2.top;

				let nmouse2 = new THREE.Vector2(
					 (mx / sz2.width)  *  2 - 1,
					-(my / sz2.height) *  2 + 1
				);
				let ray2 = new THREE.Raycaster();
				ray2.setFromCamera(nmouse2, camera2);

				let newWorld = new THREE.Vector3();
				if (!ray2.ray.intersectPlane(dragPlane, newWorld)) return;

				let delta = newWorld.clone().sub(startWorld);

				// Move all points directly — suppress per-point rebuilds during drag
				for (let i = 0; i < ls.points.length; i++) {
					ls.points[i].position.copy(startPositions[i]).add(delta);
				}
				ls._boundingBoxDirty = true;
				ls._geometryDirty    = true;
				ls.update();
			};

			const onUp = () => {
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup',   onUp);

				if (this._lineDragging && this._lineDragPending) {
					let { ls, before } = this._lineDragPending;
					this._pushHistory(ls, before);
					// Single event — panel rebuilds node table + distances once
					ls.dispatchEvent({ type: 'markers_all_moved', measurement: ls });
					this._lineDragJustHappened = true;
				}

				this.viewer.renderer.domElement.style.cursor = '';
				this._lineDragging    = false;
				this._lineDragPending = null;
			};

			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup',   onUp);
		};
		this.viewer.renderer.domElement.addEventListener('mousedown', this._onLineDragDown);
	}

	_findNodeHit (clientX, clientY) {
		let rect = this.viewer.renderer.domElement.getBoundingClientRect();
		let x = clientX - rect.left;
		let y = clientY - rect.top;
		let sz = this.renderer.getSize(new THREE.Vector2());
		let nmouse = new THREE.Vector2(
			 (x / sz.width)  *  2 - 1,
			-(y / sz.height) *  2 + 1
		);
		let raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(nmouse, this.viewer.scene.getActiveCamera());
		for (let ls of this.viewer.scene.drawLineStrings) {
			if (!ls._nodesMesh || !ls._nodesMesh.visible) continue;
			let hits = [];
			ls._nodesMesh.raycast(raycaster, hits);
			if (hits.length > 0) return true;
		}
		return false;
	}

	_findLineSegmentHit (clientX, clientY, thresholdPx) {
		let rect = this.viewer.renderer.domElement.getBoundingClientRect();
		let x = clientX - rect.left;
		let y = clientY - rect.top;
		let renderAreaSize = this.renderer.getSize(new THREE.Vector2());
		let camera = this.viewer.scene.getActiveCamera();

		let nmouse = new THREE.Vector2(
			 (x / renderAreaSize.width)  *  2 - 1,
			-(y / renderAreaSize.height) *  2 + 1
		);
		let raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(nmouse, camera);
		let rayDir = raycaster.ray.direction;
		let rayOrigin = raycaster.ray.origin;

		let hitLs         = null;
		let hitSegIdx     = -1;
		let hitPos        = null;
		let hitScreenDist = Infinity;

		let d2n      = new THREE.Vector3();
		let rVec     = new THREE.Vector3();
		let segPoint = new THREE.Vector3();
		let ndc      = new THREE.Vector3();

		for (let ls of this.viewer.scene.drawLineStrings) {
			if (!ls.visible || !ls._inToolScene) continue;

			for (let i = 0; i < ls.points.length - 1; i++) {
				let p0 = ls.points[i].position;
				let p1 = ls.points[i + 1].position;

				d2n.subVectors(p1, p0);
				let segLen = d2n.length();
				if (segLen < 1e-10) continue;
				d2n.divideScalar(segLen);

				rVec.subVectors(p0, rayOrigin);
				let cosTheta = rayDir.dot(d2n);
				let e1 = rayDir.dot(rVec);
				let e2 = d2n.dot(rVec);
				let denom = 1 - cosTheta * cosTheta;

				let t = (Math.abs(denom) < 1e-10)
					? e2
					: (e1 * cosTheta - e2) / denom;
				t = Math.max(0, Math.min(segLen, t));

				segPoint.copy(p0).addScaledVector(d2n, t);

				ndc.copy(segPoint).project(camera);
				if (ndc.z > 1) continue;

				let sx = (ndc.x + 1) / 2 * renderAreaSize.width;
				let sy = (1 - ndc.y) / 2 * renderAreaSize.height;
				let screenDist = Math.sqrt((sx - x) ** 2 + (sy - y) ** 2);

				if (screenDist < thresholdPx && screenDist < hitScreenDist) {
					hitScreenDist = screenDist;
					hitLs         = ls;
					hitSegIdx     = i;
					hitPos        = segPoint.clone();
				}
			}
		}

		return hitLs ? { ls: hitLs, segIdx: hitSegIdx, pos: hitPos } : null;
	}

	_snapshotPoints (ls) {
		// Capture position AND all original OSM node metadata so undo/redo doesn't strip it
		return ls.points.map(p => ({
			position:     p.position.clone(),
			_osmNodeId:   p._osmNodeId,
			_osmNodeTags: p._osmNodeTags,
			_osmLat:      p._osmLat,
			_osmLon:      p._osmLon,
		}));
	}

	_pushHistory (ls, before) {
		let after = this._snapshotPoints(ls);

		// Skip no-ops (e.g. delete attempted on a 2-point linestring)
		if (after.length === before.length &&
			after.every((p, i) => p.position.equals(before[i].position))) return;

		if (this._undoStack.length >= 50) this._undoStack.shift();
		this._undoStack.push({ ls, before, after });

		this._redoStack = [];
	}

	_applySnapshot (ls, snapshot) {
		while (ls.points.length > snapshot.length) {
			ls.removeMarker(ls.points.length - 1);
		}
		while (ls.points.length < snapshot.length) {
			ls.addMarker(snapshot[ls.points.length].position.clone());
		}
		for (let i = 0; i < snapshot.length; i++) {
			ls.setPosition(i, snapshot[i].position.clone());
			// Restore all original OSM node metadata after position is applied
			ls.points[i]._osmNodeId   = snapshot[i]._osmNodeId;
			ls.points[i]._osmNodeTags = snapshot[i]._osmNodeTags;
			ls.points[i]._osmLat      = snapshot[i]._osmLat;
			ls.points[i]._osmLon      = snapshot[i]._osmLon;
		}
		ls.selectNode(-1);
	}

	splitLineString (ls, nodeIndex) {
		let result = ls.splitAt(nodeIndex);
		if (!result) return;
		let wayA = result[0];
		let wayB = result[1];

		if (this._undoStack.length >= 50) this._undoStack.shift();
		this._undoStack.push({ type: 'split', original: ls, wayA: wayA, wayB: wayB });
		this._redoStack = [];

		this.viewer.scene.removeDrawLineString(ls);
		this.viewer.scene.addDrawLineString(wayA);
		this.viewer.scene.addDrawLineString(wayB);
	}

	onSceneChange (e) {
		if (e.oldScene) {
			e.oldScene.removeEventListener('draw_linestring_added',   this.onAdd);
			e.oldScene.removeEventListener('draw_linestring_removed', this.onRemove);
		}

		e.scene.addEventListener('draw_linestring_added',   this.onAdd);
		e.scene.addEventListener('draw_linestring_removed', this.onRemove);
	}

	startInsertion (args = {}) {
		let domElement = this.viewer.renderer.domElement;

		let linestring = new DrawLineString();
		linestring.color = new THREE.Color(args.color || 0x00ff00);
		linestring.name = args.name || 'LineString';
		linestring._wayTags = { cost_factor: '1.000000', speed_limit: '10' };

		this.dispatchEvent({
			type: 'start_inserting_linestring',
			linestring: linestring
		});

		this.scene.add(linestring);

		// Cursor ghost point — follows the mouse each frame via update()
		linestring.addMarker(new THREE.Vector3(0, 0, 0));
		linestring.setGhostIndex(0);
		this._insertingLinestring = linestring;

		let cancel = {
			removeLastMarker: true,
			callback: null
		};

		let lastClickTime = 0;

		// Click to commit the current cursor position as a permanent node
		let insertionCallback = (e) => {
			if (e.button === THREE.MOUSE.LEFT) {
				let now = Date.now();
				let isDoubleClick = (now - lastClickTime) < 300;
				lastClickTime = now;

				if (isDoubleClick) {
					cancel.removeLastMarker = true;
					cancel.callback();
					return;
				}

				// Commit cursor position, then start a new cursor at the same spot
				let cursorPos = linestring.points[linestring.ghostIndex].position.clone();
				linestring.setGhostIndex(-1);
				linestring.addMarker(cursorPos);
				linestring.setGhostIndex(linestring.points.length - 1);

			} else if (e.button === THREE.MOUSE.RIGHT) {
				cancel.callback();
			}
		};

		let insertionKeyHandler = (e) => {
			if (e.key === 'Backspace') {
				e.preventDefault();
				// Remove the last committed node (second-to-last; last is the cursor)
				if (linestring.points.length >= 2) {
					linestring.removeMarker(linestring.points.length - 2);
					linestring.setGhostIndex(linestring.points.length - 1);
				}
			} else if (e.key === 'Enter' || e.key === 'Escape') {
				e.preventDefault();
				cancel.removeLastMarker = true;
				cancel.callback();
			}
		};

		cancel.callback = () => {
			if (cancel.removeLastMarker && linestring.points.length > 0) {
				linestring.removeMarker(linestring.points.length - 1);
			}
			linestring.setGhostIndex(-1);
			this._insertingLinestring = null;
			domElement.removeEventListener('mouseup', insertionCallback, false);
			document.removeEventListener('keydown', insertionKeyHandler);
			this.viewer.removeEventListener('cancel_insertions', cancel.callback);

			if (linestring.points.length < 2) {
				this.viewer.scene.removeDrawLineString(linestring);
			}
		};

		this.viewer.addEventListener('cancel_insertions', cancel.callback);
		domElement.addEventListener('mouseup', insertionCallback, false);
		document.addEventListener('keydown', insertionKeyHandler);

		this.viewer.scene.addDrawLineString(linestring);

		return linestring;
	}

	update () {
		let camera = this.viewer.scene.getActiveCamera();
		let linestrings = this.viewer.scene.drawLineStrings;

		const renderAreaSize = this.renderer.getSize(this._renderAreaSize);
		let clientWidth = renderAreaSize.width;
		let clientHeight = renderAreaSize.height;

		let resolutionChanged = (clientWidth !== this._lastClientWidth || clientHeight !== this._lastClientHeight);
		if (resolutionChanged) {
			this._lastClientWidth = clientWidth;
			this._lastClientHeight = clientHeight;
		}

		// JOSM-style cursor: snap to point cloud when available, else fall back to a
		// horizontal plane at the elevation of the last committed node.
		if (this._insertingLinestring) {
			let ls = this._insertingLinestring;
			let ghostIdx = ls.ghostIndex;
			if (ghostIdx >= 0) {
				let mouse = this.viewer.inputHandler.mouse;

				let I = Utils.getMousePointCloudIntersection(
					mouse, camera, this.viewer,
					this.viewer.scene.pointclouds,
					{pickClipped: true});

				if (I) {
					ls.setPosition(ghostIdx, I.location);
				} else {
					// Fallback: intersect mouse ray with a horizontal plane at the
					// elevation of the last committed node (Z-up coordinate system).
					let refZ = ghostIdx > 0
						? ls.points[ghostIdx - 1].position.z
						: (ls.points[ghostIdx].position.z || 0);

					this._nmouse.set(
						(mouse.x / clientWidth)  *  2 - 1,
						-(mouse.y / clientHeight) *  2 + 1);
					this._raycaster.setFromCamera(this._nmouse, camera);

					// Plane: z = refZ  →  normal=(0,0,1), constant=-refZ
					this._fallbackPlane.normal.set(0, 0, 1);
					this._fallbackPlane.constant = -refZ;
					if (this._raycaster.ray.intersectPlane(this._fallbackPlane, this._fallbackHit)) {
						ls.setPosition(ghostIdx, this._fallbackHit);
					}
				}
			}
		}

		this.light.position.copy(camera.position);

		// Frustum culling — only update linestrings visible to the camera
		this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		this._frustum.setFromProjectionMatrix(this._projScreenMatrix);

		let camPos = camera.position;
		// Distance threshold: hide spheres beyond this distance from camera
		let maxSphereDistance = this._maxSphereDistance || 500;

		// Rate-limit first-time Line2 / InstancedMesh creation per frame.
		let initsThisFrame = 0;
		const MAX_INITS_PER_FRAME = 40;

		for (let ls of linestrings) {
			let bbox = ls.getBoundingBox();

			if (bbox.isEmpty()) {
				ls.update();
				continue;
			}

			// Frustum cull: physically remove from the Three.js scene when not
			// visible so Three.js doesn't traverse/sort 19K+ objects every frame.
			if (!this._frustum.intersectsBox(bbox)) {
				if (ls._inToolScene) {
					this.scene.remove(ls);
					ls._inToolScene = false;
				}
				continue;
			}

			// Re-add when back in frustum. Rate-limit only the first-time init
			// (Line2 creation is expensive); re-adds of already-initialized
			// linestrings are cheap and always allowed.
			if (!ls._inToolScene) {
				if (!ls._lineEdge && initsThisFrame >= MAX_INITS_PER_FRAME) continue;
				if (!ls._lineEdge) initsThisFrame++;
				this.scene.add(ls);
				ls._inToolScene = true;
			}

			ls.visible = true;
			ls.update();

			// Distance-based sphere LOD
			let center = bbox.getCenter(this._tempCenter);
			let dist = camPos.distanceTo(center);
			let showSpheres = (dist < maxSphereDistance);

			if (showSpheres && !ls._nodesMesh && ls.points.length > 0) {
				if (initsThisFrame < MAX_INITS_PER_FRAME) {
					initsThisFrame++;
					ls._ensureNodeCapacity(ls.points.length);
					ls._nodesMesh.count = ls.points.length;
					ls.applyHighlight();
				}
			}

			if (ls._nodesMesh) {
				ls._nodesMesh.visible = showSpheres;
				if (showSpheres) {
					ls.updateNodeTransforms(camPos, camera, clientWidth, clientHeight);
				}
			}

			if (resolutionChanged && ls._lineEdge) {
				ls._lineEdge.material.resolution.set(clientWidth, clientHeight);
				ls._lineOutline.material.resolution.set(clientWidth, clientHeight);
				if (ls._ghostLine) ls._ghostLine.material.resolution.set(clientWidth, clientHeight);
			}
		}
	}

	render (e) {
		// Skip sub-passes that target an offscreen render target (e.g. EDL's rtRegular pass).
		// We only want to render when drawing to the screen so depth-testing works correctly.
		if (e && e.renderTarget) return;
		this.viewer.renderer.render(this.scene, this.viewer.scene.getActiveCamera());
		this.viewer.renderer.getContext().depthMask(true);
	}
}
