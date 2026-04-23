
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
			this.scene.remove(e.linestring);
			let h = this._lsListeners.get(e.linestring);
			if (h) {
				e.linestring.removeEventListener('drag_start',     h.onDragStart);
				e.linestring.removeEventListener('marker_dropped', h.onDropped);
				this._lsListeners.delete(e.linestring);
			}
		};

		this.onAdd = (e) => {
			this.scene.add(e.linestring);
			let ls = e.linestring;

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
					this._applySnapshot(entry.ls, entry.before);
				}
			} else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
				e.preventDefault();
				let entry = this._redoStack.pop();
				if (entry) {
					this._undoStack.push(entry);
					this._applySnapshot(entry.ls, entry.after);
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
				for (let ls of this.viewer.scene.drawLineStrings) {
					if (ls.selectedNodeIndex >= 0) {
						ls.selectNode(-1);
						break;
					}
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
				for (let ls of this.viewer.scene.drawLineStrings) {
					if (ls.selectedNodeIndex >= 0) {
						e.preventDefault();

						let i   = ls.selectedNodeIndex;
						let pos = ls.points[i].position.clone();
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
				for (let i = 0; i < ls.spheres.length; i++) {
					let sphere = ls.spheres[i];
					if (!sphere.visible) continue;
					let hits = [];
					sphere.raycast(raycaster, hits);
					if (hits.length > 0 && hits[0].distance < hitDist) {
						hitDist = hits[0].distance;
						hitLs   = ls;
						hitIdx  = i;
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
	}

	_snapshotPoints (ls) {
		return ls.points.map(p => p.position.clone());
	}

	_pushHistory (ls, before) {
		let after = this._snapshotPoints(ls);

		// Skip no-ops (e.g. delete attempted on a 2-point linestring)
		if (after.length === before.length && after.every((p, i) => p.equals(before[i]))) return;

		if (this._undoStack.length >= 50) this._undoStack.shift();
		this._undoStack.push({ ls, before, after });

		this._redoStack = [];
	}

	_applySnapshot (ls, snapshot) {
		while (ls.points.length > snapshot.length) {
			ls.removeMarker(ls.points.length - 1);
		}
		while (ls.points.length < snapshot.length) {
			ls.addMarker(snapshot[ls.points.length].clone());
		}
		for (let i = 0; i < snapshot.length; i++) {
			ls.setPosition(i, snapshot[i].clone());
		}
		ls.selectNode(-1);
	}

	onSceneChange (e) {
		if (e.oldScene) {
			e.oldScene.removeEventListener('draw_linestring_added', this.onAdd);
			e.oldScene.removeEventListener('draw_linestring_removed', this.onRemove);
		}

		e.scene.addEventListener('draw_linestring_added', this.onAdd);
		e.scene.addEventListener('draw_linestring_removed', this.onRemove);
	}

	startInsertion (args = {}) {
		let domElement = this.viewer.renderer.domElement;

		let linestring = new DrawLineString();
		linestring.color = new THREE.Color(args.color || 0x00ff00);
		linestring.name = args.name || 'LineString';

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

		for (let ls of linestrings) {
			let bbox = ls.getBoundingBox();

			if (bbox.isEmpty()) {
				ls.update();
				continue;
			}

			// Frustum cull — skip if entirely outside the view
			if (!this._frustum.intersectsBox(bbox)) {
				ls.visible = false;
				continue;
			}

			ls.visible = true;

			// Distance LOD — only show spheres if close enough
			let center = bbox.getCenter(this._tempCenter);
			let dist = camPos.distanceTo(center);
			let showSpheres = (dist < maxSphereDistance);

			ls.update();

			for (let i = 0; i < ls.spheres.length; i++) {
				let sphere = ls.spheres[i];
				if (showSpheres) {
					sphere.visible = true;
					let distance = camPos.distanceTo(sphere.getWorldPosition(this._tempSpherePos));
					let pr = Utils.projectedRadius(1, camera, distance, clientWidth, clientHeight);
					let scale = (15 / pr);
					sphere.scale.set(scale, scale, scale);
				} else {
					sphere.visible = false;
				}
			}

			// Only update edge material resolution when the viewport size changes
			if (resolutionChanged) {
				for (let edge of ls.edges) {
					edge.material.resolution.set(clientWidth, clientHeight);
				}
				for (let edge of ls.outlineEdges) {
					edge.material.resolution.set(clientWidth, clientHeight);
				}
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
