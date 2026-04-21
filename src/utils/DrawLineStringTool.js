
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

		let cancel = {
			removeLastMarker: true,
			callback: null
		};

		let lastClickTime = 0;

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

				// commit ghost → normal, then add new ghost at same position
				linestring.setGhostIndex(-1);
				linestring.addMarker(linestring.points[linestring.points.length - 1].position.clone());
				linestring.setGhostIndex(linestring.points.length - 1);

				this.viewer.inputHandler.startDragging(
					linestring.spheres[linestring.spheres.length - 1]);
			} else if (e.button === THREE.MOUSE.RIGHT) {
				cancel.callback();
			}
		};

		// active only during insertion: Backspace = undo last point, Enter = finish
		let insertionKeyHandler = (e) => {
			if (e.key === 'Backspace') {
				e.preventDefault();
				if (linestring.points.length >= 2) {
					linestring.removeMarker(linestring.points.length - 2);
					linestring.setGhostIndex(linestring.points.length - 1);
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				cancel.removeLastMarker = true;
				cancel.callback();
			}
		};

		cancel.callback = e => {
			if (cancel.removeLastMarker && linestring.points.length > 0) {
				linestring.removeMarker(linestring.points.length - 1);
			}
			linestring.setGhostIndex(-1);
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

		linestring.addMarker(new THREE.Vector3(0, 0, 0));
		linestring.setGhostIndex(0);
		this.viewer.inputHandler.startDragging(
			linestring.spheres[linestring.spheres.length - 1]);

		this.viewer.scene.addDrawLineString(linestring);

		return linestring;
	}

	update () {
		let camera = this.viewer.scene.getActiveCamera();
		let linestrings = this.viewer.scene.drawLineStrings;

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
