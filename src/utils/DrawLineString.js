
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

		this.sphereGeometry = new THREE.SphereGeometry(0.4, 6, 6);
		this.spheres = [];
		this.edges = [];
		this.outlineEdges = [];
		this.ghostIndex = -1;

		this._ghostRing = null;

		this.boundingBox = new THREE.Box3();
		this._boundingBoxDirty = true;
		this._geometryDirty = true;
	}

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

	createSphereMaterial () {
		return new THREE.MeshLambertMaterial({
			color: this.color,
			depthTest: false,
			depthWrite: false
		});
	}

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

	_setupSphereEvents (sphere) {
		let dragging = false;

		let drag = (e) => {
			let i = this.spheres.indexOf(e.drag.object);
			if (i === -1) return;

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

			// Try point cloud first for Z-accurate snapping, fall back to a
			// horizontal plane at the node's current elevation so the node can
			// be moved freely even when the cursor is off the cloud.
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
		};

		let drop = e => {
			dragging = false;
			let i = this.spheres.indexOf(e.drag.object);
			if (i !== -1) {
				this.dispatchEvent({
					'type': 'marker_dropped',
					'measurement': this,
					'index': i
				});
			}
		};

		let mouseover = (e) => {
			let i = this.spheres.indexOf(e.object);
			if (i !== this.selectedNodeIndex) {
				e.object.material.emissive.setHex(0x888888);
			}
		};

		let mouseleave = (e) => {
			let i = this.spheres.indexOf(e.object);
			if (i !== this.selectedNodeIndex) {
				e.object.material.emissive.setHex(0x000000);
			}
		};

		let click = (e) => {
			let obj = e.object || (e.drag && e.drag.object);
			let i = this.spheres.indexOf(obj);
			if (i !== -1) {
				if (this.selectedNodeIndex === i) {
					this.selectNode(-1);
				} else {
					this.selectNode(i);
				}
			}
		};

		sphere.addEventListener('drag', drag);
		sphere.addEventListener('drop', drop);
		sphere.addEventListener('mouseover', mouseover);
		sphere.addEventListener('mouseleave', mouseleave);
		sphere.addEventListener('click', click);
	}

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

	applyHighlight () {
		for (let i = 0; i < this.spheres.length; i++) {
			let sphere = this.spheres[i];
			sphere.visible = true;
			sphere.material.color.copy(this.color);
			sphere.material.emissive.setHex(0x000000);
		}
		for (let edge of this.edges) {
			edge.material.color.copy(this.color);
		}
		for (let outline of this.outlineEdges) {
			outline.material.color.set(0x111111);
		}

		// ghost edge gets a lighter color so it's visually distinct from committed edges
		if (this.ghostIndex > 0 && this.edges[this.ghostIndex - 1]) {
			this.edges[this.ghostIndex - 1].material.color.set(0xaaaaaa);
			if (this.outlineEdges[this.ghostIndex - 1]) {
				this.outlineEdges[this.ghostIndex - 1].material.color.set(0x444444);
			}
		}

		// highlight selected node (skip if it's the ghost)
		let i = this.selectedNodeIndex;
		if (i >= 0 && i < this.spheres.length && i !== this.ghostIndex) {
			this.spheres[i].material.color.set(0xff0000);
			this.spheres[i].material.emissive.setHex(0xff0000);
			if (i > 0 && this.edges[i - 1]) this.edges[i - 1].material.color.set(0xffff00);
			if (i < this.edges.length && this.edges[i]) this.edges[i].material.color.set(0xffff00);
		}
	}

	addMarker (point) {
		if (point.x != null) {
			point = {position: point};
		} else if (point instanceof Array) {
			point = {position: new THREE.Vector3(...point)};
		}
		this.points.push(point);
		this._boundingBoxDirty = true;

		// sphere
		let sphere = new THREE.Mesh(this.sphereGeometry, this.createSphereMaterial());
		this.add(sphere);
		this.spheres.push(sphere);

		// outline edge added first so it renders behind the colored edge
		let outlineEdge = this._createEdge(0x111111, 5);
		this.add(outlineEdge);
		this.outlineEdges.push(outlineEdge);

		// colored edge on top of outline
		let edge = this._createEdge(this.color.getHex(), 3);
		this.add(edge);
		this.edges.push(edge);

		this._setupSphereEvents(sphere);

		this.dispatchEvent({
			type: 'marker_added',
			measurement: this,
			sphere: sphere
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

		// sphere
		let sphere = new THREE.Mesh(this.sphereGeometry, this.createSphereMaterial());
		this.add(sphere);
		this.spheres.splice(index + 1, 0, sphere);

		// outline edge
		let outlineEdge = this._createEdge(0x111111, 5);
		this.add(outlineEdge);
		this.outlineEdges.splice(index + 1, 0, outlineEdge);

		// colored edge
		let edge = this._createEdge(this.color.getHex(), 3);
		this.add(edge);
		this.edges.splice(index + 1, 0, edge);

		this._setupSphereEvents(sphere);

		// adjust selected index if needed
		if (this.selectedNodeIndex > index) {
			this.selectedNodeIndex++;
		}

		this._geometryDirty = true;
		this.update();

		this.dispatchEvent({
			type: 'marker_added',
			measurement: this,
			sphere: sphere
		});
	}

	removeMarker (index) {
		this.points.splice(index, 1);
		this._boundingBoxDirty = true;
		this._geometryDirty = true;

		this.remove(this.spheres[index]);

		let edgeIndex = (index === 0) ? 0 : (index - 1);
		this.remove(this.edges[edgeIndex]);
		this.edges.splice(edgeIndex, 1);

		this.remove(this.outlineEdges[edgeIndex]);
		this.outlineEdges.splice(edgeIndex, 1);

		this.spheres.splice(index, 1);

		// adjust selected index
		if (this.selectedNodeIndex === index) {
			this.selectedNodeIndex = -1;
		} else if (this.selectedNodeIndex > index) {
			this.selectedNodeIndex--;
		}

		this.update();
		this.applyHighlight();

		this.dispatchEvent({type: 'marker_removed', measurement: this});
	}

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

	update () {
		if (!this._geometryDirty || this.points.length === 0) return;
		this._geometryDirty = false;

		if (this.points.length === 1) {
			this.spheres[0].position.copy(this.points[0].position);
			this.applyHighlight();
			return;
		}

		let lastIndex = this.points.length - 1;

		for (let i = 0; i <= lastIndex; i++) {
			let nextIndex = (i + 1 > lastIndex) ? 0 : i + 1;

			let point = this.points[i];
			let nextPoint = this.points[nextIndex];
			let sphere = this.spheres[i];

			sphere.position.copy(point.position);

			let positions = [
				0, 0, 0,
				...nextPoint.position.clone().sub(point.position).toArray(),
			];
			let isVisible = i < lastIndex || this.closed;

			// outline
			let outlineEdge = this.outlineEdges[i];
			outlineEdge.position.copy(point.position);
			outlineEdge.geometry.setPositions(positions);
			outlineEdge.geometry.verticesNeedUpdate = true;
			outlineEdge.geometry.computeBoundingSphere();
			outlineEdge.computeLineDistances();
			outlineEdge.visible = isVisible;

			// colored edge
			let edge = this.edges[i];
			edge.position.copy(point.position);
			edge.geometry.setPositions(positions);
			edge.geometry.verticesNeedUpdate = true;
			edge.geometry.computeBoundingSphere();
			edge.computeLineDistances();
			edge.visible = isVisible;
		}

		// reapply highlight colors after geometry update
		this.applyHighlight();
	}

	raycast (raycaster, intersects) {
		for (let i = 0; i < this.points.length; i++) {
			this.spheres[i].raycast(raycaster, intersects);
		}

		for (let i = 0; i < intersects.length; i++) {
			intersects[i].distance = raycaster.ray.origin.distanceTo(intersects[i].point);
		}
		intersects.sort((a, b) => a.distance - b.distance);
	}
}
