
import * as THREE from "../../libs/three.js/build/three.module.js";
import {Utils} from "../utils.js";
import {Line2} from "../../libs/three.js/lines/Line2.js";
import {LineGeometry} from "../../libs/three.js/lines/LineGeometry.js";
import {LineMaterial} from "../../libs/three.js/lines/LineMaterial.js";

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

		this.edges = [];
		this.outlineEdges = [];
		this.ghostIndex = -1;

		this.boundingBox = new THREE.Box3();
		this._boundingBoxDirty = true;
		this._geometryDirty = true;

		// Shared geometry/material for all nodes across all linestrings
		this._nodeGeometry = new THREE.SphereGeometry(0.4, 6, 6);
		this._nodeMaterial = new THREE.MeshLambertMaterial({
			color: 0xffffff,   // white so instance colors show through directly
			depthTest: true,
			depthWrite: true,
		});

		// InstancedMesh — created on first addMarker, grown as needed
		this._nodesMesh = null;
		this._nodeCapacity = 0;

		// Reusable temporaries
		this._nodeMatrix = new THREE.Matrix4();
		this._nodeColor  = new THREE.Color();
	}

	// ─── bounding box ────────────────────────────────────────────────────────

	getBoundingBox () {
		if (this._boundingBoxDirty) {
			this.boundingBox.makeEmpty();
			for (let p of this.points) {
				this.boundingBox.expandByPoint(p.position);
			}
			this._boundingBoxDirty = false;
		}
		return this.boundingBox;
	}

	// ─── edge helpers ────────────────────────────────────────────────────────

	_createEdge (color, linewidth) {
		let lineGeometry = new LineGeometry();
		lineGeometry.setPositions([0, 0, 0, 0, 0, 0]);
		let lineMaterial = new LineMaterial({
			color: color,
			linewidth: linewidth,
			resolution: new THREE.Vector2(1000, 1000),
			depthTest: true,
		});
		let edge = new Line2(lineGeometry, lineMaterial);
		edge.visible = true;
		return edge;
	}

	// ─── InstancedMesh management ────────────────────────────────────────────

	_ensureNodeCapacity (count) {
		if (count <= this._nodeCapacity) return;

		let newCapacity = Math.max(16, this._nodeCapacity);
		while (newCapacity < count) newCapacity *= 2;

		let oldMesh = this._nodesMesh;

		this._nodesMesh = new THREE.InstancedMesh(this._nodeGeometry, this._nodeMaterial, newCapacity);
		this._nodesMesh.name = this.name + '_nodes';
		this._nodesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this._nodesMesh.frustumCulled = false;  // visibility managed by the tool
		this._nodesMesh.count = this.points.length;

		// Three.js r124 allocates instanceColor at this.count * 3, which is too small
		// once nodes are added later. Pre-allocate at full capacity so setColorAt(i)
		// is always in-bounds regardless of how many nodes exist at creation time.
		this._nodesMesh.instanceColor = new THREE.BufferAttribute(
			new Float32Array(newCapacity * 3),
			3
		);

		// Copy instance matrices (and colors if available) from the old mesh
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

			let I = Utils.getMousePointCloudIntersection(
				mouse, camera, e.viewer, e.viewer.scene.pointclouds,
				{pickClipped: true});

			if (I) {
				this.setPosition(i, I.location);
			} else {
				let currentZ = this.points[i].position.z;
				let plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -currentZ);
				let raycaster = new THREE.Raycaster();
				raycaster.setFromCamera(nmouse, camera);
				let hit = new THREE.Vector3();
				if (raycaster.ray.intersectPlane(plane, hit)) {
					this.setPosition(i, hit);
				}
			}
		});

		mesh.addEventListener('drop', (e) => {
			dragging = false;
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
			let i = e.instanceId;
			if (i != null && i >= 0 && i < this.points.length) {
				this.selectNode(i === this.selectedNodeIndex ? -1 : i);
			}
		});
	}

	// ─── node selection ──────────────────────────────────────────────────────

	selectNode (index) {
		this.selectedNodeIndex = index;
		this.applyHighlight();

		this.dispatchEvent({
			type: 'node_selected',
			measurement: this,
			index: index
		});
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
		this.applyHighlight();
	}

	// ─── highlight / colors ──────────────────────────────────────────────────

	applyHighlight () {
		if (!this._nodesMesh) return;

		for (let i = 0; i < this.points.length; i++) {
			if (i === this.selectedNodeIndex && i !== this.ghostIndex) {
				this._nodeColor.set(0xff0000);
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

		for (let edge of this.edges) {
			edge.material.color.copy(this.color);
		}
		for (let outline of this.outlineEdges) {
			outline.material.color.set(0x111111);
		}

		if (this.ghostIndex > 0 && this.edges[this.ghostIndex - 1]) {
			this.edges[this.ghostIndex - 1].material.color.set(0xaaaaaa);
			if (this.outlineEdges[this.ghostIndex - 1]) {
				this.outlineEdges[this.ghostIndex - 1].material.color.set(0x444444);
			}
		}

		let i = this.selectedNodeIndex;
		if (i >= 0 && i < this.points.length && i !== this.ghostIndex) {
			if (i > 0 && this.edges[i - 1])           this.edges[i - 1].material.color.set(0xffff00);
			if (i < this.edges.length && this.edges[i]) this.edges[i].material.color.set(0xffff00);
		}
	}

	// ─── marker add / remove / insert ────────────────────────────────────────

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

		let outlineEdge = this._createEdge(0x111111, 5);
		this.add(outlineEdge);
		this.outlineEdges.push(outlineEdge);

		let edge = this._createEdge(this.color.getHex(), 3);
		this.add(edge);
		this.edges.push(edge);

		this.dispatchEvent({
			type: 'marker_added',
			measurement: this,
			sphere: null,
		});

		this.setMarker(this.points.length - 1, point);
	}

	insertMarkerAfter (index) {
		if (index < 0 || index >= this.points.length - 1) return;

		let p0 = this.points[index].position;
		let p1 = this.points[index + 1].position;
		let midpoint = p0.clone().add(p1).multiplyScalar(0.5);

		let point = {position: midpoint};
		this.points.splice(index + 1, 0, point);

		this._ensureNodeCapacity(this.points.length);

		// Shift instance matrices right to make room at index+1
		for (let i = this.points.length - 1; i > index + 1; i--) {
			this._nodesMesh.getMatrixAt(i - 1, this._nodeMatrix);
			this._nodesMesh.setMatrixAt(i, this._nodeMatrix);
		}
		this._nodeMatrix.identity();
		this._nodeMatrix.setPosition(midpoint);
		this._nodesMesh.setMatrixAt(index + 1, this._nodeMatrix);
		this._nodesMesh.count = this.points.length;
		this._nodesMesh.instanceMatrix.needsUpdate = true;

		let outlineEdge = this._createEdge(0x111111, 5);
		this.add(outlineEdge);
		this.outlineEdges.splice(index + 1, 0, outlineEdge);

		let edge = this._createEdge(this.color.getHex(), 3);
		this.add(edge);
		this.edges.splice(index + 1, 0, edge);

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

		// Shift instance matrices left to fill the gap
		for (let i = index; i < this.points.length; i++) {
			this._nodesMesh.getMatrixAt(i + 1, this._nodeMatrix);
			this._nodesMesh.setMatrixAt(i, this._nodeMatrix);
		}
		this._nodesMesh.count = this.points.length;
		this._nodesMesh.instanceMatrix.needsUpdate = true;

		let edgeIndex = (index === 0) ? 0 : (index - 1);
		this.remove(this.edges[edgeIndex]);
		this.edges.splice(edgeIndex, 1);

		this.remove(this.outlineEdges[edgeIndex]);
		this.outlineEdges.splice(edgeIndex, 1);

		if (this.selectedNodeIndex === index) {
			this.selectedNodeIndex = -1;
		} else if (this.selectedNodeIndex > index) {
			this.selectedNodeIndex--;
		}

		this.update();
		this.applyHighlight();

		this.dispatchEvent({type: 'marker_removed', measurement: this});
	}

	// ─── position setters ────────────────────────────────────────────────────

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

	// ─── per-frame updates ───────────────────────────────────────────────────

	// Called every frame by the tool for visible linestrings.
	// Writes position + camera-distance scale into each instance matrix.
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

	// Called when geometry is dirty (position change, add/remove marker).
	// Only rebuilds edge geometry — node transforms are handled by updateNodeTransforms.
	update () {
		if (!this._geometryDirty || this.points.length === 0) return;
		this._geometryDirty = false;

		if (this.points.length === 1) {
			this.applyHighlight();
			return;
		}

		let lastIndex = this.points.length - 1;

		for (let i = 0; i <= lastIndex; i++) {
			let nextIndex = (i + 1 > lastIndex) ? 0 : i + 1;

			let point     = this.points[i];
			let nextPoint = this.points[nextIndex];

			let positions = [
				0, 0, 0,
				...nextPoint.position.clone().sub(point.position).toArray(),
			];
			let isVisible = i < lastIndex || this.closed;

			let outlineEdge = this.outlineEdges[i];
			outlineEdge.position.copy(point.position);
			outlineEdge.geometry.setPositions(positions);
			outlineEdge.geometry.verticesNeedUpdate = true;
			outlineEdge.geometry.computeBoundingSphere();
			outlineEdge.computeLineDistances();
			outlineEdge.visible = isVisible;

			let edge = this.edges[i];
			edge.position.copy(point.position);
			edge.geometry.setPositions(positions);
			edge.geometry.verticesNeedUpdate = true;
			edge.geometry.computeBoundingSphere();
			edge.computeLineDistances();
			edge.visible = isVisible;
		}

		this.applyHighlight();
	}

	// ─── raycasting ──────────────────────────────────────────────────────────

	raycast (raycaster, intersects) {
		if (this._nodesMesh && this._nodesMesh.visible) {
			this._nodesMesh.raycast(raycaster, intersects);
		}
	}
}
