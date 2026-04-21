
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

		this.scene = new THREE.Scene();
		this.scene.name = 'scene_draw_linestring';
		this.light = new THREE.PointLight(0xffffff, 1.0);
		this.scene.add(this.light);

		this.viewer.inputHandler.registerInteractiveScene(this.scene);

		this.onRemove = (e) => { this.scene.remove(e.linestring); };
		this.onAdd = (e) => { this.scene.add(e.linestring); };

		for (let ls of viewer.scene.drawLineStrings) {
			this.onAdd({linestring: ls});
		}

		viewer.addEventListener("update", this.update.bind(this));
		viewer.addEventListener("render.pass.perspective_overlay", this.render.bind(this));
		viewer.addEventListener("scene_changed", this.onSceneChange.bind(this));

		viewer.scene.addEventListener('draw_linestring_added', this.onAdd);
		viewer.scene.addEventListener('draw_linestring_removed', this.onRemove);

		// Delete key to remove selected node on any linestring
		this._onKeyDown = (e) => {
			if (e.key === 'Delete') {
				for (let ls of this.viewer.scene.drawLineStrings) {
					if (ls.selectedNodeIndex >= 0) {
						ls.deleteSelectedNode();
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
			}
		};
		document.addEventListener('keydown', this._onKeyDown);
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

		// JOSM-style cursor: move the ghost node to wherever the mouse intersects the point cloud
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
				}
			}
		}

		const renderAreaSize = this.renderer.getSize(new THREE.Vector2());
		let clientWidth = renderAreaSize.width;
		let clientHeight = renderAreaSize.height;

		this.light.position.copy(camera.position);

		// Frustum culling — only update linestrings visible to the camera
		let frustum = new THREE.Frustum();
		let projScreenMatrix = new THREE.Matrix4();
		projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		frustum.setFromProjectionMatrix(projScreenMatrix);

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
			if (!frustum.intersectsBox(bbox)) {
				ls.visible = false;
				continue;
			}

			ls.visible = true;

			// Distance LOD — only show spheres if close enough
			let center = bbox.getCenter(new THREE.Vector3());
			let dist = camPos.distanceTo(center);
			let showSpheres = (dist < maxSphereDistance);

			ls.update();

			for (let i = 0; i < ls.spheres.length; i++) {
				let sphere = ls.spheres[i];
				if (showSpheres) {
					sphere.visible = true;
					let distance = camPos.distanceTo(sphere.getWorldPosition(new THREE.Vector3()));
					let pr = Utils.projectedRadius(1, camera, distance, clientWidth, clientHeight);
					let scale = (15 / pr);
					sphere.scale.set(scale, scale, scale);
				} else {
					sphere.visible = false;
				}
			}

			// Update edge material resolution
			for (let edge of ls.edges) {
				edge.material.resolution.set(clientWidth, clientHeight);
			}
		}
	}

	render () {
		this.viewer.renderer.render(this.scene, this.viewer.scene.getActiveCamera());
		// depthWrite:false on overlay materials leaves gl.depthMask(false), which prevents
		// renderer.clear() from clearing the EDL render target's depth buffer next frame.
		this.viewer.renderer.getContext().depthMask(true);
	}
}
