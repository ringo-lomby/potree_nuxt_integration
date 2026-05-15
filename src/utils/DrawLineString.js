
import * as THREE from "../../libs/three.js/build/three.module.js";
import {Utils} from "../utils.js";
import {Line2} from "../../libs/three.js/lines/Line2.js";
import {LineGeometry} from "../../libs/three.js/lines/LineGeometry.js";
import {LineMaterial} from "../../libs/three.js/lines/LineMaterial.js";

// Shared across all DrawLineString instances — created once, never recreated.
let _sharedNodeGeometry = null;
let _sharedNodeMaterial = null;

// Track Ctrl key state so InstancedMesh click can yield to the Ctrl+click
// multi-node handler in DrawLineStringTool without race conditions.
let _ctrlDown = false;
document.addEventListener('keydown', (e) => { if (e.key === 'Control') _ctrlDown = true; });
document.addEventListener('keyup',   (e) => { if (e.key === 'Control') _ctrlDown = false; });

function getSharedNodeGeometry () {
	if (!_sharedNodeGeometry) _sharedNodeGeometry = new THREE.SphereGeometry(0.4, 6, 6);
	return _sharedNodeGeometry;
}
function getSharedNodeMaterial () {
	if (!_sharedNodeMaterial) _sharedNodeMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, depthTest: true, depthWrite: true });
	return _sharedNodeMaterial;
}

export class DrawLineString extends THREE.Object3D {
	constructor () {
		super();

		this.constructor.counter = (this.constructor.counter === undefined) ? 0 : this.constructor.counter + 1;

		this.name = 'LineString_' + this.constructor.counter;
		this.points = [];
		this.closed = false;
		this.color = new THREE.Color(0x00ff00);
		this.selectedNodeIndex = -1;
		this._hoveredNodeIndex = -1;
		this._selected = false;
		this._snapHighlighted = false; // set by DrawLineStringTool during endpoint snap
		this.ghostIndex = -1;

		// boundingBox, _nodeMatrix, _nodeColor are created lazily on first use
		// so the constructor stays cheap for bulk imports.
		this.boundingBox       = null;
		this._boundingBoxDirty = true;
		this._geometryDirty    = true;

		this._nodeGeometry = getSharedNodeGeometry();
		this._nodeMaterial = getSharedNodeMaterial();

		this._nodesMesh    = null;
		this._nodeCapacity = 0;
		this._nodeMatrix   = null;
		this._nodeColor    = null;

		// One Line2 for all committed segments, one for the ghost preview segment.
		// Both created lazily in _ensureLineObjects().
		this._lineEdge    = null;   // coloured line,  linewidth 3
		this._lineOutline = null;   // dark outline,   linewidth 5
		this._ghostLine   = null;   // grey preview,   linewidth 3 (created on demand)

		// Set true during bulk loads to skip intermediate geometry rebuilds.
		this._suppressUpdates = false;

		// Multi-node selection (Ctrl+click accumulates nodes; adjacent pairs define edges)
		this.selectedNodeIndices = new Set();
		this._multiDragStartPositions = null;

		// Highlight overlay for selected edges (orange Line2 pair, created lazily)
		this._highlightEdgeLine    = null;
		this._highlightEdgeOutline = null;
	}

	// ─── bounding box ────────────────────────────────────────────────────────

	getBoundingBox () {
		if (!this.boundingBox) this.boundingBox = new THREE.Box3();
		if (this._boundingBoxDirty) {
			this.boundingBox.makeEmpty();
			for (let p of this.points) {
				this.boundingBox.expandByPoint(p.position);
			}
			this._boundingBoxDirty = false;
		}
		return this.boundingBox;
	}

	// ─── polyline objects ─────────────────────────────────────────────────────

	_ensureLineObjects () {
		if (this._lineEdge) return;

		this._lineOutline = new Line2(
			new LineGeometry(),
			new LineMaterial({
				color: 0x111111,
				linewidth: 5,
				resolution: new THREE.Vector2(1000, 1000),
				depthTest: true,
			})
		);
		this._lineOutline.visible = false;
		this.add(this._lineOutline);

		this._lineEdge = new Line2(
			new LineGeometry(),
			new LineMaterial({
				color: this.color.getHex(),
				linewidth: 3,
				resolution: new THREE.Vector2(1000, 1000),
				depthTest: true,
			})
		);
		this._lineEdge.visible = false;
		this.add(this._lineEdge);
	}

	_ensureGhostLine () {
		if (this._ghostLine) return;

		this._ghostLine = new Line2(
			new LineGeometry(),
			new LineMaterial({
				color: 0xaaaaaa,
				linewidth: 3,
				resolution: new THREE.Vector2(1000, 1000),
				depthTest: true,
			})
		);
		this._ghostLine.visible = false;
		this.add(this._ghostLine);
	}

	_ensureHighlightEdgeLine () {
		if (this._highlightEdgeLine) return;

		this._highlightEdgeOutline = new Line2(
			new LineGeometry(),
			new LineMaterial({
				color: 0x440000,
				linewidth: 5,
				resolution: new THREE.Vector2(1000, 1000),
				depthTest: true,
			})
		);
		this._highlightEdgeOutline.visible = false;
		this.add(this._highlightEdgeOutline);

		this._highlightEdgeLine = new Line2(
			new LineGeometry(),
			new LineMaterial({
				color: 0xff0000,
				linewidth: 3,
				resolution: new THREE.Vector2(1000, 1000),
				depthTest: true,
			})
		);
		this._highlightEdgeLine.visible = false;
		this.add(this._highlightEdgeLine);
	}

	// ─── InstancedMesh management ─────────────────────────────────────────────

	_ensureNodeCapacity (count) {
		if (!this._nodeMatrix) this._nodeMatrix = new THREE.Matrix4();
		if (count <= this._nodeCapacity) return;

		let newCapacity = Math.max(16, this._nodeCapacity);
		while (newCapacity < count) newCapacity *= 2;

		let oldMesh = this._nodesMesh;

		this._nodesMesh = new THREE.InstancedMesh(this._nodeGeometry, this._nodeMaterial, newCapacity);
		this._nodesMesh.name = this.name + '_nodes';
		this._nodesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this._nodesMesh.frustumCulled = false;
		this._nodesMesh.count = this.points.length;

		// Three.js r124 allocates instanceColor at this.count * 3, which is too
		// small once nodes are added later. Pre-allocate at full capacity.
		this._nodesMesh.instanceColor = new THREE.BufferAttribute(
			new Float32Array(newCapacity * 3),
			3
		);

		if (oldMesh) {
			for (let i = 0; i < oldMesh.count; i++) {
				oldMesh.getMatrixAt(i, this._nodeMatrix);
				this._nodesMesh.setMatrixAt(i, this._nodeMatrix);
			}
			this.remove(oldMesh);
		}

		this._nodeCapacity = newCapacity;
		this.add(this._nodesMesh);
		this._setupNodesMeshEvents();
	}

	_setupNodesMeshEvents () {
		let mesh = this._nodesMesh;
		let dragging = false;

		mesh.addEventListener('drag', (e) => {
			let i = e.drag != null ? e.drag.instanceId : null;
			if (i == null || i < 0 || i >= this.points.length) return;

			if (!dragging) {
				dragging = true;
				this.dispatchEvent({ type: 'drag_start', measurement: this });
			}

			let camera = e.viewer.scene.getActiveCamera();
			let renderAreaSize = e.viewer.renderer.getSize(new THREE.Vector2());
			let mouse = e.drag.end;

			let nmouse = new THREE.Vector2(
				 (mouse.x / renderAreaSize.width)  *  2 - 1,
				-(mouse.y / renderAreaSize.height) *  2 + 1
			);

			// Helper: apply newPos to node i, or to all multi-selected nodes by same delta
			const applyMove = (newPos) => {
				if (this.selectedNodeIndices.has(i) && this.selectedNodeIndices.size > 1) {
					if (!this._multiDragStartPositions) {
						this._multiDragStartPositions = new Map();
						for (let idx of this.selectedNodeIndices) {
							if (idx < this.points.length)
								this._multiDragStartPositions.set(idx, this.points[idx].position.clone());
						}
					}
					let startPos = this._multiDragStartPositions.get(i);
					if (startPos) {
						let delta = newPos.clone().sub(startPos);
						for (let idx of this.selectedNodeIndices) {
							let sp = this._multiDragStartPositions.get(idx);
							if (sp) this.setPosition(idx, sp.clone().add(delta));
						}
					}
				} else {
					this.setPosition(i, newPos);
				}
			};

			let I = Utils.getMousePointCloudIntersection(
				mouse, camera, e.viewer, e.viewer.scene.pointclouds,
				{pickClipped: true});

			if (I) {
				applyMove(I.location);
			} else {
				let currentZ = this.points[i].position.z;
				let plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -currentZ);
				let raycaster = new THREE.Raycaster();
				raycaster.setFromCamera(nmouse, camera);
				let hit = new THREE.Vector3();
				if (raycaster.ray.intersectPlane(plane, hit)) {
					applyMove(hit);
				}
			}
		});

		mesh.addEventListener('drop', (e) => {
			dragging = false;
			this._multiDragStartPositions = null;
			let i = e.drag != null ? e.drag.instanceId : null;
			if (i != null && i >= 0 && i < this.points.length) {
				this.dispatchEvent({
					type: 'marker_dropped',
					measurement: this,
					index: i
				});
			}
		});

		mesh.addEventListener('mouseover', (e) => {
			let i = e.instanceId;
			if (i != null && i !== this.selectedNodeIndex) {
				this._hoveredNodeIndex = i;
				this.applyHighlight();
			}
		});

		mesh.addEventListener('mouseleave', () => {
			this._hoveredNodeIndex = -1;
			this.applyHighlight();
		});

		mesh.addEventListener('click', (e) => {
			// Ctrl+click is handled by DrawLineStringTool's multi-node toggle; skip here.
			if (_ctrlDown) return;
			let i = e.instanceId;
			if (i != null && i >= 0 && i < this.points.length) {
				this.selectNode(i === this.selectedNodeIndex ? -1 : i);
			}
		});
	}

	// ─── node selection ───────────────────────────────────────────────────────

	selectNode (index) {
		this.selectedNodeIndex = index;
		// Selecting a single node clears both whole-line and multi-node selection.
		if (index >= 0) {
			this._selected = false;
			if (this.selectedNodeIndices.size > 0) this.selectedNodeIndices.clear();
		}
		this.applyHighlight();

		this.dispatchEvent({
			type: 'node_selected',
			measurement: this,
			index: index
		});
	}

	// Toggle a node in/out of the multi-node selection.
	// Clears single-node selection (selectedNodeIndex) when any multi-node entry exists.
	toggleNodeInSelection (index) {
		if (this.selectedNodeIndices.has(index)) {
			this.selectedNodeIndices.delete(index);
		} else {
			this.selectedNodeIndices.add(index);
		}
		if (this.selectedNodeIndices.size > 0) {
			this.selectedNodeIndex = -1;
			this._selected = false;
		}
		this._geometryDirty = true;
		this.update();
		this.applyHighlight();
		this.dispatchEvent({ type: 'node_selected', measurement: this, index: -1 });
	}

	clearMultiNodeSelection () {
		if (this.selectedNodeIndices.size === 0) return;
		this.selectedNodeIndices.clear();
		// Force geometry rebuild so the edge highlight line is hidden immediately.
		this._geometryDirty = true;
		this.update();
		this.applyHighlight();
		this.dispatchEvent({ type: 'node_selected', measurement: this, index: -1 });
	}

	// Returns array of [i, i+1] pairs where both i and i+1 are in selectedNodeIndices.
	getSelectedEdges () {
		let edges = [];
		for (let i = 0; i < this.points.length - 1; i++) {
			if (this.selectedNodeIndices.has(i) && this.selectedNodeIndices.has(i + 1)) {
				edges.push([i, i + 1]);
			}
		}
		return edges;
	}

	deleteSelectedNode () {
		if (this.selectedNodeIndex >= 0 && this.points.length > 2) {
			let idx = this.selectedNodeIndex;
			this.selectedNodeIndex = -1;
			this.removeMarker(idx);
		}
	}

	setGhostIndex (index) {
		this.ghostIndex = index;
		this._geometryDirty = true;
		this.update();
	}

	// ─── highlight / colors ───────────────────────────────────────────────────

	applyHighlight () {
		if (!this._nodesMesh) return;
		if (!this._nodeColor) this._nodeColor = new THREE.Color();

		for (let i = 0; i < this.points.length; i++) {
			let isEndpoint = (i === 0 || i === this.points.length - 1);
			if (i === this.selectedNodeIndex && i !== this.ghostIndex) {
				this._nodeColor.set(0xff0000);
			} else if (this.selectedNodeIndices.has(i) && i !== this.ghostIndex) {
				this._nodeColor.set(0xff0000); // red — multi-node selected (same as single)
			} else if (this._snapHighlighted && isEndpoint) {
				this._nodeColor.set(0x00ffff); // cyan — snap target
			} else if (i === this._hoveredNodeIndex && i !== this.selectedNodeIndex) {
				this._nodeColor.set(0xffffff);
			} else {
				this._nodeColor.copy(this.color);
			}
			this._nodesMesh.setColorAt(i, this._nodeColor);
		}
		if (this._nodesMesh.instanceColor) {
			this._nodesMesh.instanceColor.needsUpdate = true;
		}

		if (!this._lineEdge) return;

		// Line turns red only when the whole line is selected with no node selected.
		// If a node is selected, the node alone is red and the line keeps its original color.
		const lineHighlighted = this._selected && this.selectedNodeIndex < 0;
		this._lineEdge.material.color.set(lineHighlighted ? 0xff0000 : this.color.getHex());
		this._lineOutline.material.color.set(lineHighlighted ? 0x440000 : 0x111111);
	}

	// ─── marker add / remove / insert ─────────────────────────────────────────

	addMarker (point) {
		if (point.x != null) {
			point = {position: point};
		} else if (point instanceof Array) {
			point = {position: new THREE.Vector3(...point)};
		}
		this.points.push(point);
		this._boundingBoxDirty = true;
		this._geometryDirty = true;

		this._ensureNodeCapacity(this.points.length);
		this._nodesMesh.count = this.points.length;

		this.dispatchEvent({
			type: 'marker_added',
			measurement: this,
			sphere: null,
		});

		this.setMarker(this.points.length - 1, point);
	}

	insertMarkerAfter (index, position) {
		if (index < 0 || index >= this.points.length - 1) return;

		let p0 = this.points[index].position;
		let p1 = this.points[index + 1].position;
		let insertPos = (position != null)
			? position.clone()
			: p0.clone().add(p1).multiplyScalar(0.5);

		let point = {position: insertPos};
		this.points.splice(index + 1, 0, point);

		this._ensureNodeCapacity(this.points.length);

		for (let i = this.points.length - 1; i > index + 1; i--) {
			this._nodesMesh.getMatrixAt(i - 1, this._nodeMatrix);
			this._nodesMesh.setMatrixAt(i, this._nodeMatrix);
		}
		this._nodeMatrix.identity();
		this._nodeMatrix.setPosition(insertPos);
		this._nodesMesh.setMatrixAt(index + 1, this._nodeMatrix);
		this._nodesMesh.count = this.points.length;
		this._nodesMesh.instanceMatrix.needsUpdate = true;

		if (this.selectedNodeIndex > index) {
			this.selectedNodeIndex++;
		}

		this._geometryDirty = true;
		this.update();

		this.dispatchEvent({
			type: 'marker_added',
			measurement: this,
			sphere: null,
		});
	}

	removeMarker (index) {
		this.points.splice(index, 1);
		this._boundingBoxDirty = true;
		this._geometryDirty = true;

		if (this._nodesMesh) {
			for (let i = index; i < this.points.length; i++) {
				this._nodesMesh.getMatrixAt(i + 1, this._nodeMatrix);
				this._nodesMesh.setMatrixAt(i, this._nodeMatrix);
			}
			this._nodesMesh.count = this.points.length;
			this._nodesMesh.instanceMatrix.needsUpdate = true;
		}

		if (this.selectedNodeIndex === index) {
			this.selectedNodeIndex = -1;
		} else if (this.selectedNodeIndex > index) {
			this.selectedNodeIndex--;
		}

		this.update();
		this.applyHighlight();

		this.dispatchEvent({type: 'marker_removed', measurement: this});
	}

	// ─── position setters ─────────────────────────────────────────────────────

	setMarker (index, point) {
		this.points[index] = point;
		this._geometryDirty = true;

		this.dispatchEvent({
			type: 'marker_moved',
			measure: this,
			index: index,
			position: point.position.clone()
		});

		this.update();
	}

	setPosition (index, position) {
		let point = this.points[index];
		point.position.copy(position);
		this._boundingBoxDirty = true;
		this._geometryDirty = true;

		this.dispatchEvent({
			type: 'marker_moved',
			measure: this,
			index: index,
			position: position.clone()
		});

		this.update();
	}

	// ─── split ────────────────────────────────────────────────────────────────

	splitAt (nodeIndex) {
		if (this.points.length < 3) return null;
		if (nodeIndex <= 0 || nodeIndex >= this.points.length - 1) return null;

		let copyPoint = (src, dst) => {
			dst._osmNodeId   = src._osmNodeId;
			dst._osmNodeTags = src._osmNodeTags ? Object.assign({}, src._osmNodeTags) : {};
			dst._osmLat      = src._osmLat;
			dst._osmLon      = src._osmLon;
		};

		let wayA = new DrawLineString();
		wayA.name   = this.name + '_A';
		wayA.color  = this.color.clone();
		wayA._osmMeta = this._osmMeta;
		wayA._wayTags = Object.assign({}, this._wayTags || {});

		for (let i = 0; i <= nodeIndex; i++) {
			let src = this.points[i];
			wayA.addMarker(src.position.clone());
			copyPoint(src, wayA.points[wayA.points.length - 1]);
		}

		let wayB = new DrawLineString();
		wayB.name   = this.name + '_B';
		wayB.color  = this.color.clone();
		wayB._osmMeta = null;
		wayB._wayTags = Object.assign({}, this._wayTags || {});

		for (let i = nodeIndex; i < this.points.length; i++) {
			let src = this.points[i];
			wayB.addMarker(src.position.clone());
			copyPoint(src, wayB.points[wayB.points.length - 1]);
		}

		return [wayA, wayB];
	}

	// ─── merge ───────────────────────────────────────────────────────────────

	_copyOsmMeta (src, dst) {
		dst._osmNodeId   = src._osmNodeId;
		dst._osmNodeTags = src._osmNodeTags ? Object.assign({}, src._osmNodeTags) : {};
		dst._osmLat      = src._osmLat;
		dst._osmLon      = src._osmLon;
	}

	// Merge `otherLS` into `this` by joining their endpoints.
	// `myEndIndex`    — 0 (start) or this.points.length-1 (end): which endpoint was dragged
	// `theirEndIndex` — 0 or otherLS.points.length-1: which endpoint was snapped to
	// Returns `this` (mutated). Caller must remove `otherLS` from the scene.
	mergeWith (otherLS, myEndIndex, theirEndIndex) {
		if (this.points.length < 2 || otherLS.points.length < 2) return this;

		// Normalise: if the dragged endpoint is at the start, reverse this so it is at the end.
		if (myEndIndex === 0) {
			this.points.reverse();
			this.selectedNodeIndex = -1;
			this._boundingBoxDirty = true;
			this._geometryDirty    = true;
		}

		// Now this.points[last] is the junction. Decide the order to append from otherLS:
		// if theirEndIndex is 0 → append [1..N-1] in forward order
		// if theirEndIndex is N-1 → append [N-2..0] in reverse (so their start comes last)
		let N = otherLS.points.length;
		let indices = [];
		if (theirEndIndex === 0) {
			for (let i = 1; i < N; i++) indices.push(i);
		} else {
			for (let i = N - 2; i >= 0; i--) indices.push(i);
		}

		this._suppressUpdates = true;
		for (let idx of indices) {
			let src = otherLS.points[idx];
			this.addMarker(src.position.clone());
			this._copyOsmMeta(src, this.points[this.points.length - 1]);
		}
		this._suppressUpdates = false;
		this._geometryDirty = true;
		this.update();

		return this;
	}

	// ─── metrics ─────────────────────────────────────────────────────────────

	getTotalDistance () {
		if (this.points.length === 0) return 0;

		let distance = 0;
		for (let i = 1; i < this.points.length; i++) {
			distance += this.points[i - 1].position.distanceTo(this.points[i].position);
		}

		if (this.closed && this.points.length > 1) {
			distance += this.points[this.points.length - 1].position.distanceTo(this.points[0].position);
		}

		return distance;
	}

	// ─── per-frame updates ────────────────────────────────────────────────────

	updateNodeTransforms (camPos, camera, clientWidth, clientHeight) {
		if (!this._nodesMesh) return;
		for (let i = 0; i < this.points.length; i++) {
			let pos = this.points[i].position;
			let distance = camPos.distanceTo(pos);
			let pr = Utils.projectedRadius(1, camera, distance, clientWidth, clientHeight);
			let scale = 15 / pr;
			this._nodeMatrix.makeScale(scale, scale, scale);
			this._nodeMatrix.setPosition(pos);
			this._nodesMesh.setMatrixAt(i, this._nodeMatrix);
		}
		this._nodesMesh.instanceMatrix.needsUpdate = true;
	}

	// Rebuilds the two Line2 objects from the current point list.
	// Committed segments go into _lineEdge/_lineOutline.
	// The ghost preview segment (if any) goes into _ghostLine.
	update () {
		if (this._suppressUpdates) return;
		if (!this._geometryDirty || this.points.length === 0) return;
		this._geometryDirty = false;

		// How many points belong to the committed (non-ghost) part.
		// When ghostIndex >= 0, the ghost point is the last one.
		const ghostIdx     = this.ghostIndex;
		const hasGhost     = ghostIdx >= 0 && ghostIdx < this.points.length;
		const committedEnd = hasGhost ? ghostIdx : this.points.length; // exclusive

		// ── Committed line ────────────────────────────────────────────────────
		// Needs at least 2 committed points to draw anything.
		// Closed linestrings repeat the first point at the end.
		const totalPts = committedEnd + (this.closed && committedEnd >= 2 ? 1 : 0);

		if (totalPts >= 2) {
			this._ensureLineObjects();

			const pos = new Float32Array(totalPts * 3);
			for (let i = 0; i < committedEnd; i++) {
				const p = this.points[i].position;
				pos[i * 3]     = p.x;
				pos[i * 3 + 1] = p.y;
				pos[i * 3 + 2] = p.z;
			}
			if (this.closed && committedEnd >= 2) {
				const p = this.points[0].position;
				pos[committedEnd * 3]     = p.x;
				pos[committedEnd * 3 + 1] = p.y;
				pos[committedEnd * 3 + 2] = p.z;
			}

			this._lineEdge.geometry.setPositions(pos);
			// Three.js r124 caches _maxInstanceCount on first render and never
			// recalculates it when setPositions replaces the instanced attributes
			// with new objects of a different count. Deleting it forces a recalculate.
			delete this._lineEdge.geometry._maxInstanceCount;
			this._lineEdge.computeLineDistances();
			this._lineEdge.visible = true;

			this._lineOutline.geometry.setPositions(pos);
			delete this._lineOutline.geometry._maxInstanceCount;
			this._lineOutline.computeLineDistances();
			this._lineOutline.visible = true;
		} else if (this._lineEdge) {
			this._lineEdge.visible    = false;
			this._lineOutline.visible = false;
		}

		// ── Selected edge highlight ───────────────────────────────────────────
		const selectedEdges = this.getSelectedEdges();
		if (selectedEdges.length > 0) {
			// Collect positions for all selected edge segments
			const edgePts = [];
			for (let [a, b] of selectedEdges) {
				if (a < committedEnd && b < committedEnd) {
					const pa = this.points[a].position;
					const pb = this.points[b].position;
					edgePts.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
				}
			}
			if (edgePts.length >= 6) {
				this._ensureHighlightEdgeLine();
				const ePos = new Float32Array(edgePts);
				this._highlightEdgeLine.geometry.setPositions(ePos);
				delete this._highlightEdgeLine.geometry._maxInstanceCount;
				this._highlightEdgeLine.computeLineDistances();
				this._highlightEdgeLine.visible = true;

				this._highlightEdgeOutline.geometry.setPositions(ePos);
				delete this._highlightEdgeOutline.geometry._maxInstanceCount;
				this._highlightEdgeOutline.computeLineDistances();
				this._highlightEdgeOutline.visible = true;
			}
		} else if (this._highlightEdgeLine) {
			this._highlightEdgeLine.visible    = false;
			this._highlightEdgeOutline.visible = false;
		}

		// ── Ghost preview segment ─────────────────────────────────────────────
		if (hasGhost && ghostIdx > 0) {
			const p0 = this.points[ghostIdx - 1].position;
			const p1 = this.points[ghostIdx].position;

			this._ensureGhostLine();
			this._ghostLine.geometry.setPositions(new Float32Array([
				p0.x, p0.y, p0.z,
				p1.x, p1.y, p1.z,
			]));
			delete this._ghostLine.geometry._maxInstanceCount;
			this._ghostLine.computeLineDistances();
			this._ghostLine.visible = true;
		} else if (this._ghostLine) {
			this._ghostLine.visible = false;
		}

		this.applyHighlight();
	}

	// ─── disposal ────────────────────────────────────────────────────────────

	dispose () {
		// Release unique GPU resources. Shared geometry/material (_nodeGeometry,
		// _nodeMaterial) must NOT be disposed here — they are reused by every instance.
		for (let obj of [this._lineEdge, this._lineOutline, this._ghostLine, this._highlightEdgeLine, this._highlightEdgeOutline]) {
			if (!obj) continue;
			obj.geometry.dispose();
			obj.material.dispose();
		}
		// Null out instance-buffer attributes so the renderer's WeakMap entries
		// for instanceMatrix / instanceColor can be collected.
		if (this._nodesMesh) {
			this._nodesMesh.instanceMatrix = null;
			this._nodesMesh.instanceColor  = null;
		}
	}

	// ─── raycasting ──────────────────────────────────────────────────────────

	raycast (raycaster, intersects) {
		if (this._nodesMesh && this._nodesMesh.visible) {
			this._nodesMesh.raycast(raycaster, intersects);
		}
	}
}
