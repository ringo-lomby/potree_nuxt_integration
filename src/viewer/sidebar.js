
import * as THREE from "../../libs/three.js/build/three.module.js";
import {GeoJSONExporter} from "../exporter/GeoJSONExporter.js"
import {DXFExporter} from "../exporter/DXFExporter.js"
import {OSMExporter} from "../exporter/OSMExporter.js"
import {OSMPatcher} from "../exporter/OSMPatcher.js"
import {OSMImporter} from "../importer/OSMImporter.js"
import {Volume, BoxVolume, SphereVolume} from "../utils/Volume.js"
import {PolygonClipVolume} from "../utils/PolygonClipVolume.js"
import {PropertiesPanel} from "./PropertyPanels/PropertiesPanel.js"
import {DrawLineStringPanel} from "./PropertyPanels/DrawLineStringPanel.js"
import {MultiLineStringPanel} from "./PropertyPanels/MultiLineStringPanel.js"
import {DrawLineString} from "../utils/DrawLineString.js"
import {PointCloudTree} from "../PointCloudTree.js"
import {Profile} from "../utils/Profile.js"
import {Measure} from "../utils/Measure.js"
import {Annotation} from "../Annotation.js"
import {CameraMode, ClipTask, ClipMethod} from "../defines.js"
import {ScreenBoxSelectTool} from "../utils/ScreenBoxSelectTool.js"
import {Utils} from "../utils.js"
import {CameraAnimation} from "../modules/CameraAnimation/CameraAnimation.js"
import {HierarchicalSlider} from "./HierarchicalSlider.js"
import {OrientedImage} from "../modules/OrientedImages/OrientedImages.js";
import {Images360} from "../modules/Images360/Images360.js";

import JSON5 from "../../libs/json5-2.1.3/json5.mjs";
import {showConfirmDialog} from "../utils/ConfirmDialog.js";
import {showSaveOSMDialog} from "../utils/SaveOSMDialog.js";

export class Sidebar{

	constructor(viewer){
		this.viewer = viewer;

		this.measuringTool = viewer.measuringTool;
		this.profileTool = viewer.profileTool;
		this.volumeTool = viewer.volumeTool;
		this.drawLineStringTool = viewer.drawLineStringTool;

		this.dom = $("#sidebar_root");
	}

	createToolIcon(icon, title, callback){
		let element = $(`
			<img src="${icon}"
				style="width: 32px; height: 32px"
				class="button-icon"
				data-i18n="${title}" />
		`);

		element.click(callback);

		return element;
	}

	init(){

		this.initAccordion();
		this.initAppearance();
		this.initToolbar();
		this.initRoadElements();
		this.initScene();
		this.initNavigation();
		this.initFilters();
		this.initClippingTool();
		this.initSettings();
		
		$('#potree_version_number').html(Potree.version.major + "." + Potree.version.minor + Potree.version.suffix);
	}

		

	initToolbar(){

		// ANGLE
		let elToolbar = $('#tools');
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/angle.png',
			'[title]tt.angle_measurement',
			() => {
				$('#menu_measurements').next().slideDown();
				let measurement = this.measuringTool.startInsertion({
					showDistances: false,
					showAngles: true,
					showArea: false,
					closed: true,
					maxMarkers: 3,
					name: 'Angle'});

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === measurement.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// POINT
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/point.svg',
			'[title]tt.point_measurement',
			() => {
				$('#menu_measurements').next().slideDown();
				let measurement = this.measuringTool.startInsertion({
					showDistances: false,
					showAngles: false,
					showCoordinates: true,
					showArea: false,
					closed: true,
					maxMarkers: 1,
					name: 'Point'});

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === measurement.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// DISTANCE
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/distance.svg',
			'[title]tt.distance_measurement',
			() => {
				$('#menu_measurements').next().slideDown();
				let measurement = this.measuringTool.startInsertion({
					showDistances: true,
					showArea: false,
					closed: false,
					name: 'Distance'});

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === measurement.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// HEIGHT
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/height.svg',
			'[title]tt.height_measurement',
			() => {
				$('#menu_measurements').next().slideDown();
				let measurement = this.measuringTool.startInsertion({
					showDistances: false,
					showHeight: true,
					showArea: false,
					closed: false,
					maxMarkers: 2,
					name: 'Height'});

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === measurement.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// CIRCLE
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/circle.svg',
			'[title]tt.circle_measurement',
			() => {
				$('#menu_measurements').next().slideDown();
				let measurement = this.measuringTool.startInsertion({
					showDistances: false,
					showHeight: false,
					showArea: false,
					showCircle: true,
					showEdges: false,
					closed: false,
					maxMarkers: 3,
					name: 'Circle'});

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === measurement.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// AZIMUTH
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/azimuth.svg',
			'Azimuth',
			() => {
				$('#menu_measurements').next().slideDown();
				let measurement = this.measuringTool.startInsertion({
					showDistances: false,
					showHeight: false,
					showArea: false,
					showCircle: false,
					showEdges: false,
					showAzimuth: true,
					closed: false,
					maxMarkers: 2,
					name: 'Azimuth'});

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === measurement.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// AREA
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/area.svg',
			'[title]tt.area_measurement',
			() => {
				$('#menu_measurements').next().slideDown();
				let measurement = this.measuringTool.startInsertion({
					showDistances: true,
					showArea: true,
					closed: true,
					name: 'Area'});

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === measurement.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// VOLUME
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/volume.svg',
			'[title]tt.volume_measurement',
			() => {
				let volume = this.volumeTool.startInsertion(); 

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === volume.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// SPHERE VOLUME
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/sphere_distances.svg',
			'[title]tt.volume_measurement',
			() => { 
				let volume = this.volumeTool.startInsertion({type: SphereVolume}); 

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === volume.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// PROFILE
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/profile.svg',
			'[title]tt.height_profile',
			() => {
				$('#menu_measurements').next().slideDown(); ;
				let profile = this.profileTool.startInsertion();

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === profile.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// DRAW LINESTRING
		$('#map_tools').append(this.createToolIcon(
			Potree.resourcePath + '/icons/linestring.svg',
			'[title]Draw LineString',
			() => {
				$('#menu_scene').next().slideDown();
				let linestring = this.drawLineStringTool.startInsertion({
					name: 'LineString'
				});

				let vectorsRoot = $("#jstree_scene").jstree().get_json("vectors");
				let jsonNode = vectorsRoot.children.find(child => child.data.uuid === linestring.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// IMPORT LINESTRINGS (OSM)
		{
			let elImportFile = $('<input type="file" accept=".osm,.xml" style="display:none"/>');
			$('body').append(elImportFile);

			let elImportBtn;

			const doImport = async (file, fileHandle) => {
				elImportBtn.css({ opacity: '0.4', 'pointer-events': 'none' });
				let loadingMsg = this.viewer.postMessage(`Importing linestrings from ${file.name}…`);
				try {
					let rawXml = await file.text();
					let result = await OSMImporter.loadToScene(this.viewer, rawXml, {
						onProgress: (done, total) => {
							loadingMsg.setMessage(`Importing linestrings: ${done} / ${total}`);
						}
					});
					this._osmFileHandle = fileHandle;
					this._osmFileName = file.name;
					this._osmOriginalXml = rawXml;
					this._osmImportedWayIds = new Set(
						result.linestrings
							.filter(ls => ls._osmMeta && ls._osmMeta.wayId != null)
							.map(ls => String(ls._osmMeta.wayId))
					);
					loadingMsg.setMessage(`Imported ${result.wayCount} linestrings from ${file.name}`);
					setTimeout(() => loadingMsg.element.slideUp(200), 3000);
				} catch (err) {
					loadingMsg.element.slideUp(100);
					this.viewer.postError(`Failed to import OSM: ${err.message}`);
				} finally {
					elImportBtn.css({ opacity: '', 'pointer-events': '' });
					elImportFile.val('');
				}
			};

			elImportBtn = this.createToolIcon(
				Potree.resourcePath + '/icons/arrow_up.svg',
				'[title]Import LineStrings (OSM)',
				async () => {
					$('#menu_scene').next().slideDown();

					if (window.showOpenFilePicker) {
						try {
							let [fileHandle] = await window.showOpenFilePicker({
								types: [{ description: 'OSM Files', accept: { 'application/xml': ['.osm', '.xml'] } }],
								multiple: false
							});
							let file = await fileHandle.getFile();
							await doImport(file, fileHandle);
						} catch (err) {
							if (err.name !== 'AbortError') {
								this.viewer.postError(`Failed to open file: ${err.message}`);
							}
						}
					} else {
						elImportFile.click();
					}
				}
			);
			$('#map_tools').append(elImportBtn);

			// Fallback for browsers without File System Access API
			elImportFile.on('change', async (event) => {
				let file = event.target.files[0];
				if (!file) return;
				await doImport(file, null);
			});
		}

		// SAVE LINESTRINGS (OSM)
		$('#map_tools').append(this.createToolIcon(
			Potree.resourcePath + '/icons/arrow_down.svg',
			'[title]Save all LineStrings as OSM',
			async () => {
				let linestrings = this.viewer.scene.drawLineStrings;

				if (!this._osmOriginalXml && linestrings.length === 0) {
					this.viewer.postError("no linestrings to save");
					return;
				}

				// Ask the user where to save when an original file is present.
				// Default to 'new' so that when no file was imported, OSMExporter.toOSM
				// is used instead of OSMPatcher.patch(undefined, ...) which returns undefined.
				let choice = 'new';
				if (this._osmOriginalXml) {
					choice = await showSaveOSMDialog(this._osmFileName);
					if (!choice) return; // cancelled
				}

				const downloadAs = (content, filename) => {
					let url = window.URL.createObjectURL(new Blob([content], {type: 'application/octet-stream'}));
					let a = document.createElement('a');
					a.href = url;
					a.download = filename;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					window.URL.revokeObjectURL(url);
				};

				if (choice === 'existing') {
					let osm = OSMPatcher.patch(this._osmOriginalXml, linestrings, this._osmImportedWayIds);
					if (this._osmFileHandle) {
						try {
							let writable = await this._osmFileHandle.createWritable();
							await writable.write(osm);
							await writable.close();
							let msg = this.viewer.postMessage(`Saved to ${this._osmFileName}`);
							setTimeout(() => msg.element.slideUp(200), 3000);
						} catch (err) {
							this.viewer.postError(`Failed to save: ${err.message}`);
						}
					} else {
						downloadAs(osm, this._osmFileName);
					}
				} else {
					// 'new' — same patched content, downloaded as a new file
					let osm = this._osmOriginalXml
						? OSMPatcher.patch(this._osmOriginalXml, linestrings, this._osmImportedWayIds)
						: OSMExporter.toOSM(linestrings);
					if (!osm) {
						this.viewer.postError("no linestrings to export");
						return;
					}
					downloadAs(osm, 'linestrings.osm');
				}
			}
		));

		// EXPORT LINESTRINGS (GeoJSON)
		$('#map_tools').append(this.createToolIcon(
			Potree.resourcePath + '/icons/file_geojson.svg',
			'[title]Export LineStrings as GeoJSON',
			() => {
				let linestrings = this.viewer.scene.drawLineStrings;

				if (linestrings.length === 0) {
					this.viewer.postError("no linestrings to export");
					return;
				}

				let features = linestrings.map(ls => {
					let coordinates = ls.points.map(pt => {
						let pos = pt.position;
						if (pt._osmLat != null && pt._osmLon != null) {
							return [parseFloat(pt._osmLon), parseFloat(pt._osmLat), pos.z];
						}
						return [pos.x, pos.y, pos.z];
					});

					let properties = { name: ls.name };

					if (ls._wayTags && Object.keys(ls._wayTags).length > 0) {
						properties.tags = ls._wayTags;
					}

					let nodeTags = ls.points.map(pt => pt._osmNodeTags || {});
					if (nodeTags.some(t => Object.keys(t).length > 0)) {
						properties.nodes = nodeTags.map(t => ({ tags: t }));
					}

					return {
						type: 'Feature',
						geometry: { type: 'LineString', coordinates },
						properties,
					};
				});

				let geojson = JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
				let url = window.URL.createObjectURL(new Blob([geojson], { type: 'application/json' }));
				let a = document.createElement('a');
				a.href = url;
				a.download = 'linestrings.geojson';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				window.URL.revokeObjectURL(url);
			}
		));

		// CLEAR ALL LINESTRINGS
		$('#map_tools').append(this.createToolIcon(
			Potree.resourcePath + '/icons/remove.svg',
			'[title]Remove all LineStrings',
			async () => {
				let count = this.viewer.scene.drawLineStrings.length;
				if (count === 0) {
					this.viewer.postError("no linestrings to remove");
					return;
				}
				let confirmed = await showConfirmDialog({
					title: 'Remove all LineStrings',
					message: `Remove all ${count} linestring${count !== 1 ? 's' : ''} from the scene? This cannot be undone.`,
					confirmLabel: 'Remove all',
				});
				if (!confirmed) return;
				while (this.viewer.scene.drawLineStrings.length > 0) {
					this.viewer.scene.removeDrawLineString(this.viewer.scene.drawLineStrings[0]);
				}
				this.viewer.postMessage(`Removed ${count} linestring${count !== 1 ? 's' : ''}`, { duration: 3000 });
			}
		));

		// CLIPPED MAP
		$('#map_tools').append(this.createToolIcon(
			Potree.resourcePath + '/icons/clip_volume.svg',
			'[title]Clipped Map',
			() => {
				const scene = this.viewer.scene;
				const box = scene.getBoundingBox();

				if (box.isEmpty()) return;

				const center = box.getCenter(new THREE.Vector3());
				const size = box.getSize(new THREE.Vector3());

				// small padding so edge points are not clipped
				size.multiplyScalar(1.05);

				const volume = new BoxVolume();
				volume.name = 'Clipped Map';
				volume.clip = true;
				volume.position.copy(center);
				volume.scale.copy(size);

				scene.addVolume(volume);

				// activate show-inside clipping so the box takes effect immediately
				this.viewer.setClipTask(ClipTask.SHOW_INSIDE);
				$('#cliptask_options_show_inside').trigger('click');
			}
		));

		// LINESTRING HELP
		{
			const _guideMarkdown = `# LineString Tool — User Guide

---

## 1. Starting a New LineString

1. In the **Map Tools** sidebar, click the **LineString** icon (green line icon).
2. A new LineString entry appears in the Scene panel on the left.
3. Move your cursor over the 3D viewport — a **ghost node** follows your mouse, snapping to the point cloud surface.

---

## 2. Drawing Nodes

| Action | Result |
|---|---|
| **Left click** | Commit the current cursor position as a permanent node |
| **Double-click** | Finish drawing (removes the dangling ghost node) |
| **Right click** | Finish drawing |
| **Enter** | Finish drawing |
| **Escape** | Finish drawing |
| **Backspace** | Remove the last committed node (ghost stays active) |

> A LineString must have at least **2 nodes** to be kept. If you finish with fewer, it is discarded automatically.

---

## 3. Selecting a LineString or Node

Selection is **mutually exclusive** — selecting the line clears any node selection, and selecting a node clears the line selection. Only the selected item turns **red**.

### Select the whole LineString

| Action | Result |
|---|---|
| **Left click** on a line segment in the 3D view | Select that LineString — edges turn **red** |
| **Click a LineString row** in the Scene panel | Select that LineString |
| **Escape** (no node selected) | Deselect the LineString |

When a LineString is selected its edges turn **red** and the Properties panel opens. Any previously selected node is deselected.

### Select an individual node

| Action | Result |
|---|---|
| **Left click** on a node sphere in the 3D view | Select that node — sphere turns **red** |
| **Click a row** in the Properties panel node table | Select that node |
| **Click the same row / sphere again** | Deselect the node |
| **Escape** (node selected) | Deselect the current node |

When a node is selected only that sphere turns **red**; the line edges return to their original colour. Any previous whole-line selection is cleared.

> Node spheres are only visible (and clickable) when the camera is within ~500 m of the line.

---

## 4. Moving a Node

| Action | Result |
|---|---|
| **Drag** a node sphere | Move it; snaps to the point cloud surface, or stays on the same Z-plane if no surface is found |
| **Arrow keys** (node selected) | Nudge the node in camera-relative X/Y |
| **Shift + Arrow keys** | Nudge 10× faster |

> Arrow key step size is proportional to camera distance — zoom in for finer control.

---

## 5. Moving the Whole LineString

When the **whole line is selected** (no individual node selected), all nodes can be translated together.

| Action | Result |
|---|---|
| **Drag** the line body | Moves all nodes by the same XYZ offset; camera stays fixed |
| **Arrow keys** (line selected) | Nudge the whole line in camera-relative X/Y |
| **Shift + Arrow keys** | Nudge 10× faster |

The drag plane is horizontal at the line's bounding-box centroid Z, so the relative elevation of all nodes is preserved.

---

## 6. Undo / Redo

All move, insert, delete, and split operations are undoable.

| Action | Result |
|---|---|
| **Ctrl + Z** | Undo last change |
| **Ctrl + Y** or **Ctrl + Shift + Z** | Redo |

Up to **50** history steps are kept per session.

---

## 7. Adding Nodes to an Existing LineString

### Insert on a segment (Shift + Click)

1. Hold **Shift** and left-click on any **line segment** (within ~8 px on screen).
2. A new node is inserted at the nearest point on that segment.

### Insert via the Properties panel

- Click the small **+** icon that appears **between two rows** in the node table.
- A new node is placed at the midpoint of that segment.

### Insert after a selected node (keyboard)

1. Select a node (see §3).
2. Press **Insert** — inserts a node immediately after the selected one (or appends at the end if the last node is selected).

---

## 8. Deleting a Node

> Minimum 2 nodes must remain — delete is blocked if only 2 are left.

| Action | Result |
|---|---|
| Select a node then press **Delete** | Deletes the selected node |
| Click the **trash icon** on a row in the Properties panel | Deletes that node |

---

## 9. Splitting a Way

Split divides one LineString into two at a selected node. Both resulting ways share the split node ID so the exported OSM topology is properly connected.

1. **Select a middle node** (not the first or last).
2. Click **✂ Split way at node N** in the Properties panel.
3. The original way is replaced by two new ways:
   - **Way A** — start to selected node, keeps the original way ID and all tags.
   - **Way B** — selected node to end, gets a new way ID on export, copies all tags.

| Condition | Result |
|---|---|
| Way has fewer than 3 nodes | Split button disabled |
| First or last node selected | Split button disabled |
| Any middle node selected | Split enabled |

> Split is fully undoable with **Ctrl+Z** and redoable with **Ctrl+Y**, sharing the same 50-step history.

---

## 10. Way Tags (Cost Factor, Speed Limit, and Custom Tags)

**Way tags** are key-value metadata that apply to the **entire LineString**. They appear at the top of the Properties panel whenever a LineString is selected.

### Add / Edit / Delete a way tag

1. Click **Add tag** at the bottom of the Way Tags section.
2. Type the **key**, press **Enter** to jump to **value**, press **Enter** to save.
3. Click the **×** icon to delete a tag.

> Way tags from imported OSM files are loaded into this editor and are fully editable.

---

## 11. Adding and Editing Tags on a Node

Tags are **custom key-value metadata** stored per node. Exported with the linestring in OSM and GeoJSON.

1. **Select a node** (click the sphere in the 3D view, or click a row in the panel).
2. The **Tags** section appears below the node table.
3. Click **Add tag**, type key + value, press **Enter** to save.
4. Click the **×** icon to delete a tag.

> Tags are preserved through undo/redo and carried into export files.

---

## 12. Deleting LineStrings

### Delete a single LineString

- In the Properties panel, click the **remove icon** (bottom-right corner).
- A confirmation dialog appears — click **Remove** to confirm or **Cancel** to abort.

### Delete all LineStrings

- Click the **remove icon** in the **Map Tools** toolbar (between the GeoJSON export and Clipped Map buttons).
- A confirmation dialog shows the count of linestrings to be removed.

> Deletion cannot be undone — undo history is cleared for removed linestrings.

---

## 13. Exporting LineStrings

Both export buttons are in the **Map Tools** sidebar.

### Save as OSM

Click the **arrow down icon**.

If no file was imported, \`linestrings.osm\` downloads immediately. If a file was imported this session, a dialog lets you choose: **Save to [filename]**, **Create new file**, or **Cancel**.

New nodes and ways receive fresh **positive** IDs that do not conflict with existing IDs.

### Export as GeoJSON

Click the **GeoJSON file icon** → downloads \`linestrings.geojson\`. Way tags appear under \`properties.tags\` and per-node tags under \`properties.nodes\` (both omitted when empty). Imported nodes export \`[lon, lat, z]\` coordinates; drawn nodes export \`[x, y, z]\`.

---

## 14. Importing LineStrings

Click the **arrow up icon** — opens a file picker. Accepts \`.osm\` and \`.xml\` files.

A **loading status** message appears showing progress (\`Importing linestrings: N / total\`). It auto-dismisses when complete.

Nodes missing \`local_x\` / \`local_y\` are converted from \`lat\` / \`lon\` automatically. Nodes missing \`ele\` get their elevation from the nearest point in the loaded point cloud (+8 m offset).

> Requires a point cloud to already be loaded. Defaults to 0 if none is present.

---

## 15. Connecting Two LineStrings

Drag the **first or last node** of one linestring toward the **first or last node** of another. When the dragged node comes within ~20 px of the target endpoint, that endpoint turns **cyan**. Release the mouse to open the **Connect LineStrings** dialog.

| Button | Effect |
|---|---|
| **Merge into one** | Joins the two ways into one. The dragging way keeps its name and tags. |
| **Link endpoints** | Both ways stay separate but share the same OSM node ID at their junction. |
| **Cancel** | Dragged endpoint snaps back to its original position. |

All four endpoint combinations are supported (end→start, end→end, start→start, start→end). Both modes are fully undoable with **Ctrl+Z**.
`;

			const _esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

			const _inline = (text) => {
				text = _esc(text);
				text = text.replace(/`([^`]+)`/g, '<code style="background:#2a2a2a;padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>');
				text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
				text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
				return text;
			};

			const _renderMd = (md) => {
				const lines = md.split('\n');
				let html = '';
				let i = 0;
				while (i < lines.length) {
					const line = lines[i];

					if (line.startsWith('```')) {
						let code = '';
						i++;
						while (i < lines.length && !lines[i].startsWith('```')) { code += lines[i] + '\n'; i++; }
						html += `<pre style="background:#1a1a1a;padding:10px;border-radius:4px;overflow-x:auto;font-size:12px;margin:8px 0"><code>${_esc(code.trimEnd())}</code></pre>`;
						i++; continue;
					}
					if (/^-{3,}$/.test(line)) { html += '<hr style="border-color:#444;margin:12px 0">'; i++; continue; }
					if (line.startsWith('### ')) { html += `<h3 style="color:#ddd;font-size:13px;margin:12px 0 4px">${_inline(line.slice(4))}</h3>`; i++; continue; }
					if (line.startsWith('## '))  { html += `<h2 style="color:#fff;font-size:15px;margin:14px 0 6px;border-bottom:1px solid #444;padding-bottom:4px">${_inline(line.slice(3))}</h2>`; i++; continue; }
					if (line.startsWith('# '))   { html += `<h1 style="color:#fff;font-size:18px;margin:0 0 10px">${_inline(line.slice(2))}</h1>`; i++; continue; }

					if (line.startsWith('> ')) {
						let bq = '';
						while (i < lines.length && lines[i].startsWith('> ')) { bq += _inline(lines[i].slice(2)) + ' '; i++; }
						html += `<blockquote style="border-left:3px solid #555;margin:8px 0;padding:4px 10px;color:#aaa;font-style:italic">${bq.trim()}</blockquote>`;
						continue;
					}

					if (line.startsWith('|')) {
						const rows = [];
						while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++; }
						const parseCells = (r) => r.split('|').map(c => c.trim()).filter(c => c && !/^[-:]+$/.test(c));
						const hCells = parseCells(rows[0]);
						const tblStyle = 'width:100%;border-collapse:collapse;font-size:12px;margin:8px 0';
						const thStyle = 'text-align:left;padding:5px 8px;background:#2a2a2a;color:#ccc;border:1px solid #444';
						const tdStyle = 'padding:4px 8px;border:1px solid #333;color:#bbb;vertical-align:top';
						let t = `<table style="${tblStyle}"><thead><tr>${hCells.map(c=>`<th style="${thStyle}">${_inline(c)}</th>`).join('')}</tr></thead><tbody>`;
						for (let r = 0; r < rows.length; r++) {
							if (r === 0 || /^\|[-|: ]+\|$/.test(rows[r])) continue;
							const cells = parseCells(rows[r]);
							t += `<tr>${cells.map(c=>`<td style="${tdStyle}">${_inline(c)}</td>`).join('')}</tr>`;
						}
						t += '</tbody></table>';
						html += t; continue;
					}

					if (/^\d+\. /.test(line)) {
						let items = '';
						while (i < lines.length && /^\d+\. /.test(lines[i])) { items += `<li style="margin:3px 0">${_inline(lines[i].replace(/^\d+\. /,''))}</li>`; i++; }
						html += `<ol style="padding-left:20px;margin:6px 0;color:#bbb;font-size:13px">${items}</ol>`;
						continue;
					}
					if (line.startsWith('- ')) {
						let items = '';
						while (i < lines.length && lines[i].startsWith('- ')) { items += `<li style="margin:3px 0">${_inline(lines[i].slice(2))}</li>`; i++; }
						html += `<ul style="padding-left:20px;margin:6px 0;color:#bbb;font-size:13px">${items}</ul>`;
						continue;
					}
					if (line.trim() === '') { i++; continue; }

					let para = '';
					while (i < lines.length && lines[i].trim() !== '' &&
						!lines[i].startsWith('#') && !lines[i].startsWith('|') &&
						!lines[i].startsWith('- ') && !/^\d+\. /.test(lines[i]) &&
						!lines[i].startsWith('> ') && !lines[i].startsWith('```') &&
						!/^-{3,}$/.test(lines[i])) {
						para += _inline(lines[i]) + ' '; i++;
					}
					if (para.trim()) html += `<p style="color:#bbb;font-size:13px;margin:6px 0;line-height:1.5">${para.trim()}</p>`;
				}
				return html;
			};

			const _showHelpDialog = () => {
				if ($('#ls_help_overlay').length) return;

				const overlay = $(`<div id="ls_help_overlay" style="
					position:fixed;inset:0;z-index:9999;
					background:rgba(0,0,0,0.75);
					display:flex;align-items:center;justify-content:center;
				"></div>`);

				const dialog = $(`<div style="
					background:#1e1e1e;border:1px solid #444;border-radius:6px;
					width:min(700px,90vw);max-height:85vh;
					display:flex;flex-direction:column;
					box-shadow:0 8px 32px rgba(0,0,0,0.7);
				"></div>`);

				const header = $(`<div style="
					display:flex;align-items:center;justify-content:space-between;
					padding:12px 16px;border-bottom:1px solid #444;flex-shrink:0;
				">
					<span style="color:#fff;font-weight:bold;font-size:15px">LineString Tool — User Guide</span>
					<span id="ls_help_close" style="color:#aaa;cursor:pointer;font-size:20px;line-height:1;padding:0 4px" title="Close">&times;</span>
				</div>`);

				const body = $(`<div style="
					overflow-y:auto;padding:16px 20px;flex:1;
				">${_renderMd(_guideMarkdown)}</div>`);

				dialog.append(header).append(body);
				overlay.append(dialog);
				$('body').append(overlay);

				overlay.on('click', (e) => { if (e.target === overlay[0]) overlay.remove(); });
				header.find('#ls_help_close').on('click', () => overlay.remove());
				$(document).on('keydown.ls_help', (e) => { if (e.key === 'Escape') { overlay.remove(); $(document).off('keydown.ls_help'); } });
			};

			$('#map_tools').append(this.createToolIcon(
				Potree.resourcePath + '/icons/help.svg',
				'[title]LineString Guide',
				_showHelpDialog
			));
		}

		// ANNOTATION
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/annotation.svg',
			'[title]tt.annotation',
			() => {
				$('#menu_measurements').next().slideDown(); ;
				let annotation = this.viewer.annotationTool.startInsertion();

				let annotationsRoot = $("#jstree_scene").jstree().get_json("annotations");
				let jsonNode = annotationsRoot.children.find(child => child.data.uuid === annotation.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// REMOVE ALL
		elToolbar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/reset_tools.svg',
			'[title]tt.remove_all_measurement',
			() => {
				this.viewer.scene.removeAllMeasurements();
			}
		));


		{ // SHOW / HIDE Measurements
			let elShow = $("#measurement_options_show");
			elShow.selectgroup({title: "Show/Hide labels"});

			elShow.find("input").click( (e) => {
				const show = e.target.value === "SHOW";
				this.measuringTool.showLabels = show;
			});

			let currentShow = this.measuringTool.showLabels ? "SHOW" : "HIDE";
			elShow.find(`input[value=${currentShow}]`).trigger("click");
		}
	}

	initRoadElements () {
		const STORAGE_KEY = 'potree_tag_presets_v2';
		const DEFAULTS = [
			{ name: 'Stop Line',          color: '#ff4444', type: 'way',  wayTags: { type: 'stop_line',         subtype: 'solid'             }, nodeTags: {} },
			{ name: 'Traffic Light',      color: '#ffcc00', type: 'way',  wayTags: { type: 'traffic_light',      subtype: 'red_yellow_green', height: '0.6' }, nodeTags: {} },
			{ name: 'Lane Marking',       color: '#aaaaaa', type: 'way',  wayTags: { type: 'line_thin',          subtype: 'solid'             }, nodeTags: {} },
			{ name: 'Traffic Sign',       color: '#ff8800', type: 'way',  wayTags: { type: 'traffic_sign',       subtype: 'stop_sign'         }, nodeTags: {} },
			{ name: 'Light Bulbs',        color: '#ffffff', type: 'way',  wayTags: { type: 'light_bulbs',        subtype: 'solid'             }, nodeTags: {} },
			{ name: 'Detection Area',     color: '#44aaff', type: 'way',  wayTags: { type: 'detection_area',     subtype: 'detection_area'    }, nodeTags: {} },
			{ name: 'Regulatory Element', color: '#aa44ff', type: 'way',  wayTags: { type: 'regulatory_element'                               }, nodeTags: {} },
			{ name: 'Guard Rail',         color: '#44ff88', type: 'way',  wayTags: { type: 'guard_rail'                                       }, nodeTags: {} },
			{ name: 'Goal Point',         color: '#ff44aa', type: 'node', wayTags: {},                                                          nodeTags: { stop_point_type: 'goal_point', color: 'red' } },
			{ name: 'Speed and Cost factor',               color: '#00ff00', type: 'way',  wayTags: { cost_factor: '1.000000', speed_limit: '10'               }, nodeTags: {} },
			{ name: 'Custom',             color: '#00ff00', type: 'way',  wayTags: {                                                          }, nodeTags: {} },
		];

		const inferPresetType = (p) => {
			if (p.type) return p.type;
			return (p.nodeTags && Object.keys(p.nodeTags).length > 0) ? 'node' : 'way';
		};
		const loadPresets = () => {
			try {
				let stored = localStorage.getItem(STORAGE_KEY);
				if (stored) return JSON.parse(stored).map(p => ({ ...p, type: inferPresetType(p) }));
			} catch (e) { /* ignore */ }
			return DEFAULTS.map(p => ({ ...p, id: crypto.randomUUID() }));
		};
		const savePresets = (ps) => {
			try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ps)); } catch (e) { /* ignore */ }
		};

		let presets = loadPresets();

		const elList            = $('#road_elements_tools');
		const elAddBtn          = $('#preset_add_btn');
		const elEditorContainer = $('#preset_editor_container');

		// ── Apply preset to the currently open panel ─────────────────────────
		const applyPreset = (preset) => {
			const panel = this._inlinePanelInstance;
			if (!panel) {
				this.viewer.postError('Select a linestring or node first.');
				return;
			}

			if (panel.measurement) {
				const ls = panel.measurement;
				const hasNodeSelection = ls.selectedNodeIndices.size > 0 || ls.selectedNodeIndex >= 0;
				const presetType = preset.type || 'way';

				if (presetType === 'node') {
					if (!hasNodeSelection) {
						this.viewer.postError(`"${preset.name}" is a node preset — Ctrl+click nodes first.`);
						return;
					}
					const indices = new Set(ls.selectedNodeIndices);
					if (ls.selectedNodeIndex >= 0) indices.add(ls.selectedNodeIndex);
					for (let i of indices) {
						if (!ls.points[i]) continue;
						if (!ls.points[i]._osmNodeTags) ls.points[i]._osmNodeTags = {};
						Object.assign(ls.points[i]._osmNodeTags, preset.nodeTags);
					}
				} else {
					if (hasNodeSelection) {
						this.viewer.postError(`"${preset.name}" is a way preset — click the linestring without nodes selected.`);
						return;
					}
					if (!ls._wayTags) ls._wayTags = {};
					Object.assign(ls._wayTags, preset.wayTags);
				}

				panel._refreshTagEditors();
				this.viewer.postMessage(`Preset "${preset.name}" applied`, { duration: 2000 });

			} else if (panel.linestrings) {
				if ((preset.type || 'way') === 'node') {
					this.viewer.postError(`"${preset.name}" is a node preset — cannot apply to multi-linestring selection.`);
					return;
				}
				for (let ls of panel.linestrings) {
					if (!ls._wayTags) ls._wayTags = {};
					Object.assign(ls._wayTags, preset.wayTags);
				}
				this.viewer.postMessage(`Preset "${preset.name}" applied to ${panel.linestrings.length} linestrings`, { duration: 2000 });
			} else {
				this.viewer.postError('Select a linestring or node first.');
			}
		};

		// ── Tag table builder (shared by preset editor) ──────────────────────
		const buildTagTable = (tags, label) => {
			let removeIconPath = Potree.resourcePath + '/icons/remove.svg';
			let addIconPath    = Potree.resourcePath + '/icons/add.svg';

			const inputStyle = [
				'width:100%', 'box-sizing:border-box', 'background:#1a1a1a', 'color:#ddd',
				'border:1px solid #444', 'padding:2px 5px', 'font-size:11px', 'font-family:inherit',
			].join(';');

			let container = $(`<div style="margin-bottom:8px"></div>`);
			container.append($(`<div style="font-size:11px; color:#999; margin-bottom:4px">${label}</div>`));

			let table = $(`<table style="width:100%; border-collapse:collapse"></table>`);
			table.append($(`
				<tr>
					<th style="text-align:left; font-size:10px; padding:2px 4px; color:#666; font-weight:normal">Key</th>
					<th style="text-align:left; font-size:10px; padding:2px 4px; color:#666; font-weight:normal">Value</th>
					<th style="width:18px"></th>
				</tr>
			`));
			container.append(table);

			const addTagRow = (key, value) => {
				let row = $(`<tr></tr>`);
				let keyInput = $(`<input type="text" style="${inputStyle}"/>`).val(key);
				let valInput = $(`<input type="text" style="${inputStyle}"/>`).val(value);
				let delBtn   = $(`<img class="button-icon" src="${removeIconPath}" style="width:12px; height:12px; cursor:pointer; opacity:0.55; display:block"/>`);
				let currentKey = key;

				keyInput.on('blur', () => {
					let newKey = keyInput.val().trim();
					if (newKey === currentKey) return;
					let val = (currentKey in tags) ? tags[currentKey] : valInput.val();
					if (currentKey) delete tags[currentKey];
					if (newKey) tags[newKey] = val;
					currentKey = newKey;
				});
				valInput.on('input', () => { if (currentKey) tags[currentKey] = valInput.val(); });
				keyInput.on('keydown', (e) => { if (e.key === 'Enter') valInput.focus(); });
				valInput.on('keydown', (e) => { if (e.key === 'Enter') valInput.blur(); });
				delBtn.click(() => { if (currentKey) delete tags[currentKey]; row.remove(); });
				delBtn.hover(() => delBtn.css('opacity', '1'), () => delBtn.css('opacity', '0.55'));

				row.append($('<td style="padding:2px 2px; width:42%"></td>').append(keyInput));
				row.append($('<td style="padding:2px 2px"></td>').append(valInput));
				row.append($('<td style="padding:2px 2px; vertical-align:middle"></td>').append(delBtn));
				table.append(row);
				return row;
			};

			for (let [k, v] of Object.entries(tags)) addTagRow(k, String(v));

			let addBtn = $(`<div style="margin-top:5px; cursor:pointer; font-size:11px; color:#777; display:inline-flex; align-items:center; gap:4px; user-select:none"></div>`);
			addBtn.append($(`<img src="${addIconPath}" style="width:11px; height:11px"/>`));
			addBtn.append($('<span>Add tag</span>'));
			addBtn.hover(() => addBtn.css('color', '#bbb'), () => addBtn.css('color', '#777'));
			addBtn.click(() => { let row = addTagRow('', ''); row.find('input').first().focus(); });
			container.append(addBtn);

			return container;
		};

		// ── Inline preset editor ─────────────────────────────────────────────
		const openEditor = (existing = null) => {
			elEditorContainer.show().empty();

			let currentType = existing ? inferPresetType(existing) : 'way';
			let editTags = existing
				? { ...(currentType === 'way' ? existing.wayTags : existing.nodeTags) }
				: {};

			let editor = $(`<div style="background:#1c1c1c; border:1px solid #444; border-radius:3px; padding:8px; font-size:12px"></div>`);
			editor.append($(`<div style="color:#aaa; margin-bottom:8px; font-size:11px">${existing ? 'Edit Preset' : 'New Preset'}</div>`));

			let nameRow = $(`<div style="display:flex; gap:6px; margin-bottom:8px; align-items:center"></div>`);
			let nameInput  = $(`<input type="text" placeholder="Name" style="flex:1; background:#1a1a1a; color:#ddd; border:1px solid #444; padding:3px 6px; font-size:11px; font-family:inherit; border-radius:2px">`).val(existing ? existing.name : '');
			let colorInput = $(`<input type="color" style="width:28px; height:22px; padding:0; border:1px solid #444; cursor:pointer">`).val(existing ? existing.color : '#888888');
			nameRow.append(nameInput).append(colorInput);
			editor.append(nameRow);

			// Type toggle
			let typeRow = $(`<div style="display:flex; gap:4px; margin-bottom:8px"></div>`);
			let wayBtn  = $(`<button class="preset-type-btn ${currentType === 'way'  ? 'active' : ''}">Way</button>`);
			let nodeBtn = $(`<button class="preset-type-btn preset-type-btn-node ${currentType === 'node' ? 'active' : ''}">Node</button>`);
			typeRow.append(wayBtn).append(nodeBtn);
			editor.append(typeRow);

			// Single tag table — rebuilt when type changes
			let tagContainer = $(`<div></div>`);
			const rebuildTable = () => {
				tagContainer.empty();
				tagContainer.append(buildTagTable(editTags, currentType === 'way' ? 'Way Tags' : 'Node Tags'));
			};
			rebuildTable();
			editor.append(tagContainer);

			wayBtn.click(() => {
				if (currentType === 'way') return;
				currentType = 'way'; editTags = {};
				wayBtn.addClass('active'); nodeBtn.removeClass('active');
				rebuildTable();
			});
			nodeBtn.click(() => {
				if (currentType === 'node') return;
				currentType = 'node'; editTags = {};
				nodeBtn.addClass('active'); wayBtn.removeClass('active');
				rebuildTable();
			});

			let btnRow  = $(`<div style="display:flex; gap:6px; margin-top:8px"></div>`);
			let saveBtn = $(`<button style="flex:1; padding:4px; font-size:11px; background:#2a3a2a; color:#8f8; border:1px solid #484; cursor:pointer; border-radius:2px">Save</button>`);
			let cancelBtn = $(`<button style="flex:1; padding:4px; font-size:11px; background:#2a2a2a; color:#aaa; border:1px solid #555; cursor:pointer; border-radius:2px">Cancel</button>`);
			btnRow.append(saveBtn).append(cancelBtn);
			editor.append(btnRow);

			saveBtn.click(() => {
				let name = nameInput.val().trim();
				if (!name) { nameInput.css('border-color', '#f44'); return; }
				nameInput.blur();
				const wayTags  = currentType === 'way'  ? editTags : {};
				const nodeTags = currentType === 'node' ? editTags : {};
				if (existing) {
					Object.assign(existing, { name, color: colorInput.val(), type: currentType, wayTags, nodeTags });
				} else {
					presets.push({ id: crypto.randomUUID(), name, color: colorInput.val(), type: currentType, wayTags, nodeTags });
				}
				savePresets(presets);
				renderList();
				elEditorContainer.hide().empty();
			});

			cancelBtn.click(() => elEditorContainer.hide().empty());

			elEditorContainer.append(editor);
		};

		// ── Render preset list ────────────────────────────────────────────────
		const renderList = () => {
			elList.empty();
			for (let preset of presets) {
				const pType = preset.type || 'way';
				const isNode = pType === 'node';

				let item = $(`<div class="preset-item"></div>`);
				item.append($(`<span class="preset-dot" style="background:${preset.color}"></span>`));
				item.append($(`<span class="preset-type-badge preset-type-${pType}">${isNode ? 'N' : 'W'}</span>`));
				item.append($(`<span class="preset-name" title="${preset.name}">${preset.name}</span>`));

				let drawBtn  = $(`<button class="preset-btn" title="Draw new linestring with this preset">Draw</button>`);
				let applyBtn = $(`<button class="preset-btn" title="Apply tags to selection">Apply</button>`);
				let editBtn  = $(`<button class="preset-btn preset-btn-icon" title="Edit preset">✎</button>`);
				let delBtn   = $(`<button class="preset-btn preset-btn-icon preset-btn-delete" title="Delete preset">✕</button>`);

				if (isNode) drawBtn.hide();

				drawBtn.click(() => {
					let tool = this.viewer._drawLineStringTool;
					if (tool) tool.startInsertion({ name: preset.name, wayTags: { ...preset.wayTags } });
				});
				applyBtn.click(() => applyPreset(preset));
				editBtn.click(() => openEditor(preset));
				delBtn.click(() => {
					presets = presets.filter(p => p.id !== preset.id);
					savePresets(presets);
					renderList();
				});

				item.append(drawBtn).append(applyBtn).append(editBtn).append(delBtn);
				elList.append(item);
			}
		};

		elAddBtn.click(() => openEditor());
		renderList();
	}

	initScene(){

		let elScene = $("#menu_scene");
		let elObjects = elScene.next().find("#scene_objects");
		let elProperties = elScene.next().find("#scene_object_properties");
		

		{
			let elExport = elScene.next().find("#scene_export");

			let geoJSONIcon = `${Potree.resourcePath}/icons/file_geojson.svg`;
			let dxfIcon = `${Potree.resourcePath}/icons/file_dxf.svg`;
			let potreeIcon = `${Potree.resourcePath}/icons/file_potree.svg`;
			let osmIcon = `${Potree.resourcePath}/icons/linestring.svg`;

			elExport.append(`
				Export: <br>
				<a href="#" download="measure.json"><img name="geojson_export_button" src="${geoJSONIcon}" class="button-icon" style="height: 24px" /></a>
				<a href="#" download="measure.dxf"><img name="dxf_export_button" src="${dxfIcon}" class="button-icon" style="height: 24px" /></a>
				<a href="#" download="export.osm" title="OSM"><img name="osm_export_button" src="${osmIcon}" class="button-icon" style="height: 24px" /></a>
				<a href="#" download="potree.json5"><img name="potree_export_button" src="${potreeIcon}" class="button-icon" style="height: 24px" /></a>
			`);

			let elDownloadJSON = elExport.find("img[name=geojson_export_button]").parent();
			elDownloadJSON.click( (event) => {
				let scene = this.viewer.scene;
				let measurements = [...scene.measurements, ...scene.profiles, ...scene.volumes, ...scene.drawLineStrings];

				if(measurements.length > 0){
					let geoJson = GeoJSONExporter.toString(measurements);

					let url = window.URL.createObjectURL(new Blob([geoJson], {type: 'data:application/octet-stream'}));
					elDownloadJSON.attr('href', url);
				}else{
					this.viewer.postError("no measurements to export");
					event.preventDefault();
				}
			});

			let elDownloadDXF = elExport.find("img[name=dxf_export_button]").parent();
			elDownloadDXF.click( (event) => {
				let scene = this.viewer.scene;
				let measurements = [...scene.measurements, ...scene.profiles, ...scene.volumes];

				if(measurements.length > 0){
					let dxf = DXFExporter.toString(measurements);

					let url = window.URL.createObjectURL(new Blob([dxf], {type: 'data:application/octet-stream'}));
					elDownloadDXF.attr('href', url);
				}else{
					this.viewer.postError("no measurements to export");
					event.preventDefault();
				}
			});

			let elDownloadOSM = elExport.find("img[name=osm_export_button]").parent();
			elDownloadOSM.click( (event) => {
				let scene = this.viewer.scene;
				let items = [...scene.measurements, ...scene.drawLineStrings];

				if(items.length > 0){
					let osm = OSMExporter.toOSM(items);

					let url = window.URL.createObjectURL(new Blob([osm], {type: 'data:application/octet-stream'}));
					elDownloadOSM.attr('href', url);
				}else{
					this.viewer.postError("no linestrings to export");
					event.preventDefault();
				}
			});

			let elDownloadPotree = elExport.find("img[name=potree_export_button]").parent();
			elDownloadPotree.click( (event) => {

				let data = Potree.saveProject(this.viewer);
				let dataString = JSON5.stringify(data, null, "\t")

				let url = window.URL.createObjectURL(new Blob([dataString], {type: 'data:application/octet-stream'}));
				elDownloadPotree.attr('href', url);
			});
		}


		let propertiesPanel = new PropertiesPanel(elProperties, this.viewer);
		propertiesPanel.setScene(this.viewer.scene);
		
		localStorage.removeItem('jstree');

		let tree = $(`<div id="jstree_scene"></div>`);
		elObjects.append(tree);

		// ── Inline LineString properties panel (Tools > Map section) ─────────
		let elInlinePanel = $('#linestring_inline_panel');
		let _inlinePanelContext = null;
		this._inlinePanelInstance = null;

		const showInlinePanel = (ls) => {
			if (!ls) {
				if (_inlinePanelContext) {
					for (let task of _inlinePanelContext.cleanupTasks) task();
					_inlinePanelContext = null;
					this._inlinePanelInstance = null;
				}
				elInlinePanel.empty();
				elInlinePanel.hide();
				return;
			}
			// If already showing for the same linestring, just refresh the node tag area
			if (this._inlinePanelInstance && this._inlinePanelInstance.measurement === ls) {
				this._inlinePanelInstance._buildNodeTagEditor();
				return;
			}
			if (_inlinePanelContext) {
				for (let task of _inlinePanelContext.cleanupTasks) task();
				_inlinePanelContext = null;
				this._inlinePanelInstance = null;
			}
			elInlinePanel.empty();

			_inlinePanelContext = {
				cleanupTasks: [],
				addVolatileListener(target, type, callback) {
					target.addEventListener(type, callback);
					this.cleanupTasks.push(() => target.removeEventListener(type, callback));
				},
			};
			this._inlinePanelInstance = new DrawLineStringPanel(this.viewer, ls, _inlinePanelContext);
			elInlinePanel.append(this._inlinePanelInstance.elContent);
			elInlinePanel.show();
			$('#menu_tools').next().slideDown();
		};
		const showMultiInlinePanel = (linestrings) => {
			if (_inlinePanelContext) {
				for (let task of _inlinePanelContext.cleanupTasks) task();
				_inlinePanelContext = null;
				this._inlinePanelInstance = null;
			}
			elInlinePanel.empty();
			if (!linestrings || linestrings.length === 0) { elInlinePanel.hide(); return; }

			_inlinePanelContext = { cleanupTasks: [] };
			this._inlinePanelInstance = new MultiLineStringPanel(this.viewer, linestrings, _inlinePanelContext);
			elInlinePanel.append(this._inlinePanelInstance.elContent);
			elInlinePanel.show();
			$('#menu_tools').next().slideDown();
		};
		// ─────────────────────────────────────────────────────────────────────

		tree.jstree({
			'plugins': ["checkbox", "state"],
			'core': {
				"dblclick_toggle": false,
				"state": {
					"checked" : true
				},
				'check_callback': true,
				"expand_selected_onload": true
			},
			"checkbox" : {
				"keep_selected_style": true,
				"three_state": false,
				"whole_node": false,
				"tie_selection": false,
			},
		});

		let createNode = (parent, text, icon, object) => {
			let nodeID = tree.jstree('create_node', parent, { 
					"text": text, 
					"icon": icon,
					"data": object
				}, 
				"last", false, false);
			
			if(object.visible){
				tree.jstree('check_node', nodeID);
			}else{
				tree.jstree('uncheck_node', nodeID);
			}

			return nodeID;
		}

		let pcID = tree.jstree('create_node', "#", { "text": "<b>Point Clouds</b>", "id": "pointclouds"}, "last", false, false);
		let measurementID = tree.jstree('create_node', "#", { "text": "<b>Measurements</b>", "id": "measurements" }, "last", false, false);
		let annotationsID = tree.jstree('create_node', "#", { "text": "<b>Annotations</b>", "id": "annotations" }, "last", false, false);
		let otherID = tree.jstree('create_node', "#", { "text": "<b>Other</b>", "id": "other" }, "last", false, false);
		let vectorsID = tree.jstree('create_node', "#", { "text": "<b>Vectors</b>", "id": "vectors" }, "last", false, false);
		let imagesID = tree.jstree('create_node', "#", { "text": "<b> Images</b>", "id": "images" }, "last", false, false);

		tree.jstree("check_node", pcID);
		tree.jstree("check_node", measurementID);
		tree.jstree("check_node", annotationsID);
		tree.jstree("check_node", otherID);
		tree.jstree("check_node", vectorsID);
		tree.jstree("check_node", imagesID);

		tree.on('create_node.jstree', (e, data) => {
			tree.jstree("open_all");
		});

		tree.on("select_node.jstree", (e, data) => {
			let object = data.node.data;
			propertiesPanel.set(object);

			if (object instanceof DrawLineString) {
				showInlinePanel(object);
			}

			this.viewer.inputHandler.deselectAll();

			if(object instanceof Volume){
				this.viewer.inputHandler.toggleSelection(object);
			}

			$(this.viewer.renderer.domElement).focus();
		});

		tree.on("deselect_node.jstree", (e, data) => {
			propertiesPanel.set(null);
			showInlinePanel(null);
			// Clear all highlight state when deselected from the tree
			for (let ls of this.viewer.scene.drawLineStrings) {
				ls._selected = false;
				ls.selectedNodeIndex = -1;
				ls.selectedNodeIndices.clear();
				if (ls._highlightEdgeLine) {
					ls._highlightEdgeLine.visible = false;
					ls._highlightEdgeOutline.visible = false;
				}
				ls.applyHighlight();
			}
		});

		tree.on("delete_node.jstree", (e, data) => {
			propertiesPanel.set(null);
		});

		tree.on('dblclick','.jstree-anchor', (e) => {

			let instance = $.jstree.reference(e.target);
			let node = instance.get_node(e.target);
			let object = node.data;

			// ignore double click on checkbox
			if(e.target.classList.contains("jstree-checkbox")){
				return;
			}

			if(object instanceof PointCloudTree){
				let box = this.viewer.getBoundingBox([object]);
				let node = new THREE.Object3D();
				node.boundingBox = box;
				this.viewer.zoomTo(node, 1, 500);
			}else if(object instanceof Measure){
				let points = object.points.map(p => p.position);
				let box = new THREE.Box3().setFromPoints(points);
				if(box.getSize(new THREE.Vector3()).length() > 0){
					let node = new THREE.Object3D();
					node.boundingBox = box;
					this.viewer.zoomTo(node, 2, 500);
				}
			}else if(object instanceof Profile){
				let points = object.points;
				let box = new THREE.Box3().setFromPoints(points);
				if(box.getSize(new THREE.Vector3()).length() > 0){
					let node = new THREE.Object3D();
					node.boundingBox = box;
					this.viewer.zoomTo(node, 1, 500);
				}
			}else if(object instanceof Volume){
				
				let box = object.boundingBox.clone().applyMatrix4(object.matrixWorld);

				if(box.getSize(new THREE.Vector3()).length() > 0){
					let node = new THREE.Object3D();
					node.boundingBox = box;
					this.viewer.zoomTo(node, 1, 500);
				}
			}else if(object instanceof Annotation){
				object.moveHere(this.viewer.scene.getActiveCamera());
			}else if(object instanceof PolygonClipVolume){
				let dir = object.camera.getWorldDirection(new THREE.Vector3());
				let target;

				if(object.camera instanceof THREE.OrthographicCamera){
					dir.multiplyScalar(object.camera.right)
					target = new THREE.Vector3().addVectors(object.camera.position, dir);
					this.viewer.setCameraMode(CameraMode.ORTHOGRAPHIC);
				}else if(object.camera instanceof THREE.PerspectiveCamera){
					dir.multiplyScalar(this.viewer.scene.view.radius);
					target = new THREE.Vector3().addVectors(object.camera.position, dir);
					this.viewer.setCameraMode(CameraMode.PERSPECTIVE);
				}
				
				this.viewer.scene.view.position.copy(object.camera.position);
				this.viewer.scene.view.lookAt(target);
			}else if(object.type === "SpotLight"){
				let distance = (object.distance > 0) ? object.distance / 4 : 5 * 1000;
				let position = object.position;
				let target = new THREE.Vector3().addVectors(
					position, 
					object.getWorldDirection(new THREE.Vector3()).multiplyScalar(distance));

				this.viewer.scene.view.position.copy(object.position);
				this.viewer.scene.view.lookAt(target);
			}else if(object instanceof THREE.Object3D){
				let box = new THREE.Box3().setFromObject(object);

				if(box.getSize(new THREE.Vector3()).length() > 0){
					let node = new THREE.Object3D();
					node.boundingBox = box;
					this.viewer.zoomTo(node, 1, 500);
				}
			}else if(object instanceof OrientedImage){
				// TODO zoom to images

				// let box = new THREE.Box3().setFromObject(object);

				// if(box.getSize(new THREE.Vector3()).length() > 0){
				// 	let node = new THREE.Object3D();
				// 	node.boundingBox = box;
				// 	this.viewer.zoomTo(node, 1, 500);
				// }
			}else if(object instanceof Images360){
				// TODO
			}else if(object instanceof Geopackage){
				// TODO
			}
		});

		tree.on("uncheck_node.jstree", (e, data) => {
			let object = data.node.data;

			if(object){
				object.visible = false;
			}
		});

		tree.on("check_node.jstree", (e, data) => {
			let object = data.node.data;

			if(object){
				object.visible = true;
			}
		});


		let onPointCloudAdded = (e) => {
			let pointcloud = e.pointcloud;
			let cloudIcon = `${Potree.resourcePath}/icons/cloud.svg`;
			let node = createNode(pcID, pointcloud.name, cloudIcon, pointcloud);

			pointcloud.addEventListener("visibility_changed", () => {
				if(pointcloud.visible){
					tree.jstree('check_node', node);
				}else{
					tree.jstree('uncheck_node', node);
				}
			});
		};

		let onMeasurementAdded = (e) => {
			let measurement = e.measurement;
			let icon = Utils.getMeasurementIcon(measurement);
			createNode(measurementID, measurement.name, icon, measurement);
		};

		let onVolumeAdded = (e) => {
			let volume = e.volume;
			let icon = Utils.getMeasurementIcon(volume);
			let node = createNode(measurementID, volume.name, icon, volume);

			volume.addEventListener("visibility_changed", () => {
				if(volume.visible){
					tree.jstree('check_node', node);
				}else{
					tree.jstree('uncheck_node', node);
				}
			});
		};

		let onDrawLineStringAdded = (e) => {
			let linestring = e.linestring;
			if (linestring._osmMeta) return;
			let icon = Utils.getMeasurementIcon(linestring);
			createNode("vectors", linestring.name, icon, linestring);
		};

		let onProfileAdded = (e) => {
			let profile = e.profile;
			let icon = Utils.getMeasurementIcon(profile);
			createNode(measurementID, profile.name, icon, profile);
		};

		let onAnnotationAdded = (e) => {
			let annotation = e.annotation;

			let annotationIcon = `${Potree.resourcePath}/icons/annotation.svg`;
			let parentID = this.annotationMapping.get(annotation.parent);
			let annotationID = createNode(parentID, annotation.title, annotationIcon, annotation);
			this.annotationMapping.set(annotation, annotationID);

			annotation.addEventListener("annotation_changed", (e) => {
				let annotationsRoot = $("#jstree_scene").jstree().get_json("annotations");
				let jsonNode = annotationsRoot.children.find(child => child.data.uuid === annotation.uuid);
				
				$.jstree.reference(jsonNode.id).rename_node(jsonNode.id, annotation.title);
			});
		};

		let onCameraAnimationAdded = (e) => {
			const animation = e.animation;

			const animationIcon = `${Potree.resourcePath}/icons/camera_animation.svg`;
			createNode(otherID, "animation", animationIcon, animation);
		};

		let onOrientedImagesAdded = (e) => {
			const images = e.images;

			const imagesIcon = `${Potree.resourcePath}/icons/picture.svg`;
			const node = createNode(imagesID, "images", imagesIcon, images);

			images.addEventListener("visibility_changed", () => {
				if(images.visible){
					tree.jstree('check_node', node);
				}else{
					tree.jstree('uncheck_node', node);
				}
			});
		};

		let onImages360Added = (e) => {
			const images = e.images;

			const imagesIcon = `${Potree.resourcePath}/icons/picture.svg`;
			const node = createNode(imagesID, "360° images", imagesIcon, images);

			images.addEventListener("visibility_changed", () => {
				if(images.visible){
					tree.jstree('check_node', node);
				}else{
					tree.jstree('uncheck_node', node);
				}
			});
		};

		const onGeopackageAdded = (e) => {
			const geopackage = e.geopackage;

			const geopackageIcon = `${Potree.resourcePath}/icons/triangle.svg`;
			const tree = $(`#jstree_scene`);
			const parentNode = "vectors";

			for(const layer of geopackage.node.children){
				const name = layer.name;

				let shpPointsID = tree.jstree('create_node', parentNode, { 
						"text": name, 
						"icon": geopackageIcon,
						"object": layer,
						"data": layer,
					}, 
					"last", false, false);
				tree.jstree(layer.visible ? "check_node" : "uncheck_node", shpPointsID);
			}

		};

		this.viewer.scene.addEventListener("pointcloud_added", onPointCloudAdded);
		this.viewer.scene.addEventListener("measurement_added", onMeasurementAdded);

		let onPointCloudRemoved = (e) => {
			let tree = $("#jstree_scene").jstree(true);
			if(!tree){
				return;
			}
			let pointcloudsNode = tree.get_node('pointclouds');

			let nodeToDelete = null;
			for(const childId of pointcloudsNode.children){
				const childNode = tree.get_node(childId);
				if(childNode.data.uuid === e.pointcloud.uuid){
					nodeToDelete = childNode;
					break;
				}
			}

			if(nodeToDelete){
				tree.delete_node(nodeToDelete.id);
			}
		};

		this.viewer.scene.addEventListener("pointcloud_removed", onPointCloudRemoved);

		this.viewer.scene.addEventListener("draw_linestring_added", onDrawLineStringAdded);
		this.viewer.scene.addEventListener("profile_added", onProfileAdded);
		this.viewer.scene.addEventListener("volume_added", onVolumeAdded);
		this.viewer.scene.addEventListener("camera_animation_added", onCameraAnimationAdded);
		this.viewer.scene.addEventListener("oriented_images_added", onOrientedImagesAdded);
		this.viewer.scene.addEventListener("360_images_added", onImages360Added);
		this.viewer.scene.addEventListener("geopackage_added", onGeopackageAdded);
		this.viewer.scene.addEventListener("polygon_clip_volume_added", onVolumeAdded);
		this.viewer.scene.annotations.addEventListener("annotation_added", onAnnotationAdded);

		let onMeasurementRemoved = (e) => {
			let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
			let jsonNode = measurementsRoot.children.find(child => child.data.uuid === e.measurement.uuid);
			
			tree.jstree("delete_node", jsonNode.id);
		};

		let onVolumeRemoved = (e) => {
			let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
			let jsonNode = measurementsRoot.children.find(child => child.data.uuid === e.volume.uuid);
			
			tree.jstree("delete_node", jsonNode.id);
		};

		let onPolygonClipVolumeRemoved = (e) => {
			let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
			let jsonNode = measurementsRoot.children.find(child => child.data.uuid === e.volume.uuid);
			
			tree.jstree("delete_node", jsonNode.id);
		};

		let onProfileRemoved = (e) => {
			let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
			let jsonNode = measurementsRoot.children.find(child => child.data.uuid === e.profile.uuid);
			
			tree.jstree("delete_node", jsonNode.id);
		};

		let onDrawLineStringRemoved = (e) => {
			// Imported linestrings (_osmMeta set) are never added to the jstree,
			// so there is no node to delete — guard against that case.
			if (e.linestring._osmMeta) return;
			let vectorsRoot = $("#jstree_scene").jstree().get_json("vectors");
			let jsonNode = vectorsRoot.children.find(child => child.data.uuid === e.linestring.uuid);
			if (!jsonNode) return;
			tree.jstree("delete_node", jsonNode.id);
		};

		this.viewer.scene.addEventListener("measurement_removed", onMeasurementRemoved);
		this.viewer.scene.addEventListener("volume_removed", onVolumeRemoved);
		this.viewer.scene.addEventListener("polygon_clip_volume_removed", onPolygonClipVolumeRemoved);
		this.viewer.scene.addEventListener("profile_removed", onProfileRemoved);
		this.viewer.scene.addEventListener("draw_linestring_removed", onDrawLineStringRemoved);

		this.viewer.addEventListener('linestring_selected_in_3d', (e) => {
			let ls = e.linestring;
			showInlinePanel(ls);
			if (ls) {
				let vectorsRoot = $("#jstree_scene").jstree().get_json("vectors");
				if (!vectorsRoot || !vectorsRoot.children) return;
				let jsonNode = vectorsRoot.children.find(child => child.data && child.data.uuid === ls.uuid);
				if (jsonNode) {
					tree.jstree('deselect_all', true);
					// suppress=true so select_node.jstree doesn't double-call showInlinePanel
					tree.jstree('select_node', jsonNode.id, true);
					propertiesPanel.set(ls);
				}
			} else {
				tree.jstree('deselect_all');
			}
		});

		this.viewer.addEventListener('linestrings_multi_selected', (e) => {
			showMultiInlinePanel(e.linestrings);
			// Clear single-linestring panel / jstree selection when entering multi-select
			if (e.linestrings && e.linestrings.length > 0) {
				tree.jstree('deselect_all');
			}
		});

		// Hide inline panel when linestring is removed
		this.viewer.scene.addEventListener("draw_linestring_removed", (e) => {
			if (this._inlinePanelInstance && this._inlinePanelInstance.measurement === e.linestring) {
				showInlinePanel(null);
			}
		});

		{
			let annotationIcon = `${Potree.resourcePath}/icons/annotation.svg`;
			this.annotationMapping = new Map(); 
			this.annotationMapping.set(this.viewer.scene.annotations, annotationsID);
			this.viewer.scene.annotations.traverseDescendants(annotation => {
				let parentID = this.annotationMapping.get(annotation.parent);
				let annotationID = createNode(parentID, annotation.title, annotationIcon, annotation);
				this.annotationMapping.set(annotation, annotationID);
			});
		}

		const scene = this.viewer.scene;
		for(let pointcloud of scene.pointclouds){
			onPointCloudAdded({pointcloud: pointcloud});
		}

		for(let measurement of scene.measurements){
			onMeasurementAdded({measurement: measurement});
		}

		for(let volume of [...scene.volumes, ...scene.polygonClipVolumes]){
			onVolumeAdded({volume: volume});
		}

		for(let animation of scene.cameraAnimations){
			onCameraAnimationAdded({animation: animation});
		}

		for(let images of scene.orientedImages){
			onOrientedImagesAdded({images: images});
		}

		for(let images of scene.images360){
			onImages360Added({images: images});
		}

		for(const geopackage of scene.geopackages){
			onGeopackageAdded({geopackage: geopackage});
		}

		for(let profile of scene.profiles){
			onProfileAdded({profile: profile});
		}

		for(let linestring of scene.drawLineStrings){
			onDrawLineStringAdded({linestring: linestring});
		}

		{
			createNode(otherID, "Camera", null, new THREE.Camera());
		}

		this.viewer.addEventListener("scene_changed", (e) => {
			propertiesPanel.setScene(e.scene);

			e.oldScene.removeEventListener("pointcloud_added", onPointCloudAdded);
			e.oldScene.removeEventListener("pointcloud_removed", onPointCloudRemoved);
			e.oldScene.removeEventListener("measurement_added", onMeasurementAdded);
			e.oldScene.removeEventListener("profile_added", onProfileAdded);
			e.oldScene.removeEventListener("volume_added", onVolumeAdded);
			e.oldScene.removeEventListener("polygon_clip_volume_added", onVolumeAdded);
			e.oldScene.removeEventListener("measurement_removed", onMeasurementRemoved);
			e.oldScene.removeEventListener("draw_linestring_added", onDrawLineStringAdded);
			e.oldScene.removeEventListener("draw_linestring_removed", onDrawLineStringRemoved);

			e.scene.addEventListener("pointcloud_added", onPointCloudAdded);
			e.scene.addEventListener("pointcloud_removed", onPointCloudRemoved);
			e.scene.addEventListener("measurement_added", onMeasurementAdded);
			e.scene.addEventListener("profile_added", onProfileAdded);
			e.scene.addEventListener("volume_added", onVolumeAdded);
			e.scene.addEventListener("polygon_clip_volume_added", onVolumeAdded);
			e.scene.addEventListener("measurement_removed", onMeasurementRemoved);
			e.scene.addEventListener("draw_linestring_added", onDrawLineStringAdded);
			e.scene.addEventListener("draw_linestring_removed", onDrawLineStringRemoved);
		});

	}

	initClippingTool(){


		this.viewer.addEventListener("cliptask_changed", (event) => {
			console.log("TODO");
		});

		this.viewer.addEventListener("clipmethod_changed", (event) => {
			console.log("TODO");
		});

		{
			let elClipTask = $("#cliptask_options");
			elClipTask.selectgroup({title: "Clip Task"});

			elClipTask.find("input").click( (e) => {
				this.viewer.setClipTask(ClipTask[e.target.value]);
			});

			let currentClipTask = Object.keys(ClipTask)
				.filter(key => ClipTask[key] === this.viewer.clipTask);
			elClipTask.find(`input[value=${currentClipTask}]`).trigger("click");
		}

		{
			let elClipMethod = $("#clipmethod_options");
			elClipMethod.selectgroup({title: "Clip Method"});

			elClipMethod.find("input").click( (e) => {
				this.viewer.setClipMethod(ClipMethod[e.target.value]);
			});

			let currentClipMethod = Object.keys(ClipMethod)
				.filter(key => ClipMethod[key] === this.viewer.clipMethod);
			elClipMethod.find(`input[value=${currentClipMethod}]`).trigger("click");
		}

		let clippingToolBar = $("#clipping_tools");

		// CLIP VOLUME
		clippingToolBar.append(this.createToolIcon(
			Potree.resourcePath + '/icons/clip_volume.svg',
			'[title]tt.clip_volume',
			() => {
				let item = this.volumeTool.startInsertion({clip: true}); 

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === item.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		// CLIP POLYGON
		clippingToolBar.append(this.createToolIcon(
			Potree.resourcePath + "/icons/clip-polygon.svg",
			"[title]tt.clip_polygon",
			() => {
				let item = this.viewer.clippingTool.startInsertion({type: "polygon"});

				let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
				let jsonNode = measurementsRoot.children.find(child => child.data.uuid === item.uuid);
				$.jstree.reference(jsonNode.id).deselect_all();
				$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
			}
		));

		{// SCREEN BOX SELECT
			let boxSelectTool = new ScreenBoxSelectTool(this.viewer);

			clippingToolBar.append(this.createToolIcon(
				Potree.resourcePath + "/icons/clip-screen.svg",
				"[title]tt.screen_clip_box",
				() => {
					if(!(this.viewer.scene.getActiveCamera() instanceof THREE.OrthographicCamera)){
						this.viewer.postMessage(`Switch to Orthographic Camera Mode before using the Screen-Box-Select tool.`, 
							{duration: 2000});
						return;
					}
					
					let item = boxSelectTool.startInsertion();

					let measurementsRoot = $("#jstree_scene").jstree().get_json("measurements");
					let jsonNode = measurementsRoot.children.find(child => child.data.uuid === item.uuid);
					$.jstree.reference(jsonNode.id).deselect_all();
					$.jstree.reference(jsonNode.id).select_node(jsonNode.id);
				}
			));
		}

		{ // REMOVE CLIPPING TOOLS
			clippingToolBar.append(this.createToolIcon(
				Potree.resourcePath + "/icons/remove.svg",
				"[title]tt.remove_all_clipping_volumes",
				() => {

					this.viewer.scene.removeAllClipVolumes();
				}
			));
		}

	}

	initFilters(){
		this.initClassificationList();
		this.initReturnFilters();
		this.initGPSTimeFilters();
		this.initPointSourceIDFilters();

	}

	initReturnFilters(){
		let elReturnFilterPanel = $('#return_filter_panel');

		{ // RETURN NUMBER
			let sldReturnNumber = elReturnFilterPanel.find('#sldReturnNumber');
			let lblReturnNumber = elReturnFilterPanel.find('#lblReturnNumber');

			sldReturnNumber.slider({
				range: true,
				min: 0, max: 7, step: 1,
				values: [0, 7],
				slide: (event, ui) => {
					this.viewer.setFilterReturnNumberRange(ui.values[0], ui.values[1])
				}
			});

			let onReturnNumberChanged = (event) => {
				let [from, to] = this.viewer.filterReturnNumberRange;

				lblReturnNumber[0].innerHTML = `${from} to ${to}`;
				sldReturnNumber.slider({values: [from, to]});
			};

			this.viewer.addEventListener('filter_return_number_range_changed', onReturnNumberChanged);

			onReturnNumberChanged();
		}

		{ // NUMBER OF RETURNS
			let sldNumberOfReturns = elReturnFilterPanel.find('#sldNumberOfReturns');
			let lblNumberOfReturns = elReturnFilterPanel.find('#lblNumberOfReturns');

			sldNumberOfReturns.slider({
				range: true,
				min: 0, max: 7, step: 1,
				values: [0, 7],
				slide: (event, ui) => {
					this.viewer.setFilterNumberOfReturnsRange(ui.values[0], ui.values[1])
				}
			});

			let onNumberOfReturnsChanged = (event) => {
				let [from, to] = this.viewer.filterNumberOfReturnsRange;

				lblNumberOfReturns[0].innerHTML = `${from} to ${to}`;
				sldNumberOfReturns.slider({values: [from, to]});
			};

			this.viewer.addEventListener('filter_number_of_returns_range_changed', onNumberOfReturnsChanged);

			onNumberOfReturnsChanged();
		}
	}

	initGPSTimeFilters(){

		let elGPSTimeFilterPanel = $('#gpstime_filter_panel');

		{
			let slider = new HierarchicalSlider({
				levels: 4,
				slide: (event) => {
					this.viewer.setFilterGPSTimeRange(...event.values);
				},
			});

			let initialized = false;

			let initialize = () => {
				
				let elRangeContainer = $("#gpstime_multilevel_range_container");
				elRangeContainer[0].prepend(slider.element);

				let extent = this.viewer.getGpsTimeExtent();

				slider.setRange(extent);
				slider.setValues(extent);


				initialized = true;
			};

			this.viewer.addEventListener("update", (e) => {
				let extent = this.viewer.getGpsTimeExtent();
				let gpsTimeAvailable = extent[0] !== Infinity;

				if(!initialized && gpsTimeAvailable){
					initialize();
				}

				slider.setRange(extent);
			});
		}


		{
			
			const txtGpsTime = elGPSTimeFilterPanel.find("#txtGpsTime");
			const btnFindGpsTime = elGPSTimeFilterPanel.find("#btnFindGpsTime");

			let targetTime = null;

			txtGpsTime.on("input", (e) => {
				const str = txtGpsTime.val();

				if(!isNaN(str)){
					const value = parseFloat(str);
					targetTime = value;

					txtGpsTime.css("background-color", "")
				}else{
					targetTime = null;

					txtGpsTime.css("background-color", "#ff9999")
				}

			});

			btnFindGpsTime.click( () => {
				
				if(targetTime !== null){
					viewer.moveToGpsTimeVicinity(targetTime);
				}
			});
		}

	}

	initPointSourceIDFilters() {
		let elPointSourceIDFilterPanel = $('#pointsourceid_filter_panel');

		{
			let slider = new HierarchicalSlider({
				levels: 4,
				range: [0, 65535],
				precision: 1,
				slide: (event) => {
					let values = event.values;
					this.viewer.setFilterPointSourceIDRange(values[0], values[1]);
				}
			});

			let initialized = false;

			let initialize = () => {
				elPointSourceIDFilterPanel[0].prepend(slider.element);

				initialized = true;
			};

			this.viewer.addEventListener("update", (e) => {
				let extent = this.viewer.filterPointSourceIDRange;

				if(!initialized){
					initialize();

					slider.setValues(extent);
				}
				
			});
		}

		// let lblPointSourceID = elPointSourceIDFilterPanel.find("#lblPointSourceID");
		// let elPointSourceID = elPointSourceIDFilterPanel.find("#spnPointSourceID");

		// let slider = new ZoomableSlider();
		// elPointSourceID[0].appendChild(slider.element);
		// slider.update();

		// slider.change( () => {
		// 	let range = slider.chosenRange;
		// 	this.viewer.setFilterPointSourceIDRange(range[0], range[1]);
		// });

		// let onPointSourceIDExtentChanged = (event) => {
		// 	let range = this.viewer.filterPointSourceIDExtent;
		// 	slider.setVisibleRange(range);
		// };

		// let onPointSourceIDChanged = (event) => {
		// 	let range = this.viewer.filterPointSourceIDRange;

		// 	let precision = 1;
		// 	let from = `${Utils.addCommas(range[0].toFixed(precision))}`;
		// 	let to = `${Utils.addCommas(range[1].toFixed(precision))}`;
		// 	lblPointSourceID[0].innerHTML = `${from} to ${to}`;

		// 	slider.setRange(range);
		// };

		// this.viewer.addEventListener('filter_point_source_id_range_changed', onPointSourceIDChanged);
		// this.viewer.addEventListener('filter_point_source_id_extent_changed', onPointSourceIDExtentChanged);

	}

	initClassificationList(){
		let elClassificationList = $('#classificationList');

		let addClassificationItem = (code, name) => {
			const classification = this.viewer.classifications[code];
			const inputID = 'chkClassification_' + code;
			const colorPickerID = 'colorPickerClassification_' + code;

			const checked = classification.visible ? "checked" : "";

			let element = $(`
				<li>
					<label style="whitespace: nowrap; display: flex">
						<input id="${inputID}" type="checkbox" ${checked}/>
						<span style="flex-grow: 1">${name}</span>
						<input id="${colorPickerID}" style="zoom: 0.5" />
					</label>
				</li>
			`);

			const elInput = element.find('input');
			const elColorPicker = element.find(`#${colorPickerID}`);

			elInput.click(event => {
				this.viewer.setClassificationVisibility(code, event.target.checked);
			});

			let defaultColor = classification.color.map(c => c *  255).join(", ");
			defaultColor = `rgb(${defaultColor})`;


			elColorPicker.spectrum({
				// flat: true,
				color: defaultColor,
				showInput: true,
				preferredFormat: 'rgb',
				cancelText: '',
				chooseText: 'Apply',
				move: color => {
					let rgb = color.toRgb();
					const c = [rgb.r / 255, rgb.g / 255, rgb.b / 255, 1];
					classification.color = c;
				},
				change: color => {
					let rgb = color.toRgb();
					const c = [rgb.r / 255, rgb.g / 255, rgb.b / 255, 1];
					classification.color = c;
				}
			});

			elClassificationList.append(element);
		};

		const addToggleAllButton = () => { // toggle all button
			const element = $(`
				<li>
					<label style="whitespace: nowrap">
						<input id="toggleClassificationFilters" type="checkbox" checked/>
						<span>show/hide all</span>
					</label>
				</li>
			`);

			let elInput = element.find('input');

			elInput.click(event => {
				this.viewer.toggleAllClassificationsVisibility();
			});

			elClassificationList.append(element);
		}

		const addInvertButton = () => { 
			const element = $(`
				<li>
					<input type="button" value="invert" />
				</li>
			`);

			let elInput = element.find('input');

			elInput.click( () => {
				const classifications = this.viewer.classifications;
	
				for(let key of Object.keys(classifications)){
					let value = classifications[key];
					this.viewer.setClassificationVisibility(key, !value.visible);
				}
			});

			elClassificationList.append(element);
		};

		const populate = () => {
			addToggleAllButton();
			for (let classID in this.viewer.classifications) {
				addClassificationItem(classID, this.viewer.classifications[classID].name);
			}
			addInvertButton();
		};

		populate();

		this.viewer.addEventListener("classifications_changed", () => {
			elClassificationList.empty();
			populate();
		});

		this.viewer.addEventListener("classification_visibility_changed", () => {

			{ // set checked state of classification buttons
				for(const classID of Object.keys(this.viewer.classifications)){
					const classValue = this.viewer.classifications[classID];

					let elItem = elClassificationList.find(`#chkClassification_${classID}`);
					elItem.prop("checked", classValue.visible);
				}
			}

			{ // set checked state of toggle button based on state of all other buttons
				let numVisible = 0;
				let numItems = 0;
				for(const key of Object.keys(this.viewer.classifications)){
					if(this.viewer.classifications[key].visible){
						numVisible++;
					}
					numItems++;
				}
				const allVisible = numVisible === numItems;

				let elToggle = elClassificationList.find("#toggleClassificationFilters");
				elToggle.prop("checked", allVisible);
			}
		});
	}

	initAccordion(){
		$('.accordion > h3').each(function(){
			let header = $(this);
			let content = $(this).next();

			//header.addClass('accordion-header ui-widget');
			//content.addClass('accordion-content ui-widget');

			content.hide();

			header.click(() => {
				content.slideToggle();
			});
		});

		let languages = [
			["EN", "en"],
			["FR", "fr"],
			["DE", "de"],
			["JP", "jp"],
			["ES", "es"],
			["SE", "se"],
			["ZH", "zh"],
			["IT", "it"],
			["CA", "ca"]
		];

		let elLanguages = $('#potree_languages');
		for(let i = 0; i < languages.length; i++){
			let [key, value] = languages[i];
			let element = $(`<a>${key}</a>`);
			element.click(() => this.viewer.setLanguage(value));

			if(i === 0){
				element.css("margin-left", "30px");
			}
			
			elLanguages.append(element);

			if(i < languages.length - 1){
				elLanguages.append($(document.createTextNode(' - ')));	
			}
		}


		// to close all, call
		// $(".accordion > div").hide()

		// to open the, for example, tool menu, call:
		// $("#menu_tools").next().show()
	}

	initAppearance(){

		const sldPointBudget = this.dom.find('#sldPointBudget');

		sldPointBudget.slider({
			value: this.viewer.getPointBudget(),
			min: 100 * 1000,
			max: 10 * 1000 * 1000,
			step: 1000,
			slide: (event, ui) => { this.viewer.setPointBudget(ui.value); }
		});

		this.dom.find('#sldFOV').slider({
			value: this.viewer.getFOV(),
			min: 20,
			max: 100,
			step: 1,
			slide: (event, ui) => { this.viewer.setFOV(ui.value); }
		});

		$('#sldEDLRadius').slider({
			value: this.viewer.getEDLRadius(),
			min: 1,
			max: 4,
			step: 0.01,
			slide: (event, ui) => { this.viewer.setEDLRadius(ui.value); }
		});

		$('#sldEDLStrength').slider({
			value: this.viewer.getEDLStrength(),
			min: 0,
			max: 5,
			step: 0.01,
			slide: (event, ui) => { this.viewer.setEDLStrength(ui.value); }
		});

		$('#sldEDLOpacity').slider({
			value: this.viewer.getEDLOpacity(),
			min: 0,
			max: 1,
			step: 0.01,
			slide: (event, ui) => { this.viewer.setEDLOpacity(ui.value); }
		});

		this.viewer.addEventListener('point_budget_changed', (event) => {
			$('#lblPointBudget')[0].innerHTML = Utils.addCommas(this.viewer.getPointBudget());
			sldPointBudget.slider({value: this.viewer.getPointBudget()});
		});

		this.viewer.addEventListener('fov_changed', (event) => {
			$('#lblFOV')[0].innerHTML = parseInt(this.viewer.getFOV());
			$('#sldFOV').slider({value: this.viewer.getFOV()});
		});

		this.viewer.addEventListener('use_edl_changed', (event) => {
			$('#chkEDLEnabled')[0].checked = this.viewer.getEDLEnabled();
		});

		this.viewer.addEventListener('edl_radius_changed', (event) => {
			$('#lblEDLRadius')[0].innerHTML = this.viewer.getEDLRadius().toFixed(1);
			$('#sldEDLRadius').slider({value: this.viewer.getEDLRadius()});
		});

		this.viewer.addEventListener('edl_strength_changed', (event) => {
			$('#lblEDLStrength')[0].innerHTML = this.viewer.getEDLStrength().toFixed(1);
			$('#sldEDLStrength').slider({value: this.viewer.getEDLStrength()});
		});

		this.viewer.addEventListener('background_changed', (event) => {
			$("input[name=background][value='" + this.viewer.getBackground() + "']").prop('checked', true);
		});

		$('#lblPointBudget')[0].innerHTML = Utils.addCommas(this.viewer.getPointBudget());
		$('#lblFOV')[0].innerHTML = parseInt(this.viewer.getFOV());
		$('#lblEDLRadius')[0].innerHTML = this.viewer.getEDLRadius().toFixed(1);
		$('#lblEDLStrength')[0].innerHTML = this.viewer.getEDLStrength().toFixed(1);
		$('#chkEDLEnabled')[0].checked = this.viewer.getEDLEnabled();
		
		{
			let elBackground = $(`#background_options`);
			elBackground.selectgroup();

			elBackground.find("input").click( (e) => {
				this.viewer.setBackground(e.target.value);
			});

			let currentBackground = this.viewer.getBackground();
			$(`input[name=background_options][value=${currentBackground}]`).trigger("click");
		}

		$('#chkEDLEnabled').click( () => {
			this.viewer.setEDLEnabled($('#chkEDLEnabled').prop("checked"));
		});
	}

	initNavigation(){
		let elNavigation = $('#navigation');
		let sldMoveSpeed = $('#sldMoveSpeed');
		let lblMoveSpeed = $('#lblMoveSpeed');

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + '/icons/earth_controls_1.png',
			'[title]tt.earth_control',
			() => { this.viewer.setControls(this.viewer.earthControls); }
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + '/icons/fps_controls.svg',
			'[title]tt.flight_control',
			() => {
				this.viewer.setControls(this.viewer.fpControls);
				this.viewer.fpControls.lockElevation = false;
			}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + '/icons/helicopter_controls.svg',
			'[title]tt.heli_control',
			() => { 
				this.viewer.setControls(this.viewer.fpControls);
				this.viewer.fpControls.lockElevation = true;
			}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + '/icons/orbit_controls.svg',
			'[title]tt.orbit_control',
			() => { this.viewer.setControls(this.viewer.orbitControls); }
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + '/icons/focus.svg',
			'[title]tt.focus_control',
			() => { this.viewer.fitToScreen(); }
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/icons/navigation_cube.svg",
			"[title]tt.navigation_cube_control",
			() => {this.viewer.toggleNavigationCube()}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/images/compas.svg",
			"[title]tt.compass",
			() => {
				const visible = !this.viewer.compass.isVisible();
				this.viewer.compass.setVisible(visible);
			}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/icons/camera_animation.svg",
			"[title]tt.camera_animation",
			() => {
				const animation = CameraAnimation.defaultFromView(this.viewer);

				viewer.scene.addCameraAnimation(animation);
			}
		));


		elNavigation.append("<br>");


		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/icons/left.svg",
			"[title]tt.left_view_control",
			() => {this.viewer.setLeftView()}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/icons/right.svg",
			"[title]tt.right_view_control",
			() => {this.viewer.setRightView()}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/icons/front.svg",
			"[title]tt.front_view_control",
			() => {this.viewer.setFrontView()}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/icons/back.svg",
			"[title]tt.back_view_control",
			() => {this.viewer.setBackView()}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/icons/top.svg",
			"[title]tt.top_view_control",
			() => {this.viewer.setTopView()}
		));

		elNavigation.append(this.createToolIcon(
			Potree.resourcePath + "/icons/bottom.svg",
			"[title]tt.bottom_view_control",
			() => {this.viewer.setBottomView()}
		));





		let elCameraProjection = $(`
			<selectgroup id="camera_projection_options">
				<option id="camera_projection_options_perspective" value="PERSPECTIVE">Perspective</option>
				<option id="camera_projection_options_orthigraphic" value="ORTHOGRAPHIC">Orthographic</option>
			</selectgroup>
		`);
		elNavigation.append(elCameraProjection);
		elCameraProjection.selectgroup({title: "Camera Projection"});
		elCameraProjection.find("input").click( (e) => {
			this.viewer.setCameraMode(CameraMode[e.target.value]);
		});
		let cameraMode = Object.keys(CameraMode)
			.filter(key => CameraMode[key] === this.viewer.scene.cameraMode);
		elCameraProjection.find(`input[value=${cameraMode}]`).trigger("click");

		let speedRange = new THREE.Vector2(1, 10 * 1000);

		let toLinearSpeed = (value) => {
			return Math.pow(value, 4) * speedRange.y + speedRange.x;
		};

		let toExpSpeed = (value) => {
			return Math.pow((value - speedRange.x) / speedRange.y, 1 / 4);
		};

		sldMoveSpeed.slider({
			value: toExpSpeed(this.viewer.getMoveSpeed()),
			min: 0,
			max: 1,
			step: 0.01,
			slide: (event, ui) => { this.viewer.setMoveSpeed(toLinearSpeed(ui.value)); }
		});

		this.viewer.addEventListener('move_speed_changed', (event) => {
			lblMoveSpeed.html(this.viewer.getMoveSpeed().toFixed(1));
			sldMoveSpeed.slider({value: toExpSpeed(this.viewer.getMoveSpeed())});
		});

		lblMoveSpeed.html(this.viewer.getMoveSpeed().toFixed(1));
	}


	initSettings(){

		{
			$('#sldMinNodeSize').slider({
				value: this.viewer.getMinNodeSize(),
				min: 0,
				max: 1000,
				step: 0.01,
				slide: (event, ui) => { this.viewer.setMinNodeSize(ui.value); }
			});

			this.viewer.addEventListener('minnodesize_changed', (event) => {
				$('#lblMinNodeSize').html(parseInt(this.viewer.getMinNodeSize()));
				$('#sldMinNodeSize').slider({value: this.viewer.getMinNodeSize()});
			});
			$('#lblMinNodeSize').html(parseInt(this.viewer.getMinNodeSize()));
		}

		{
			let elSplatQuality = $("#splat_quality_options");
			elSplatQuality.selectgroup({title: "Splat Quality"});

			elSplatQuality.find("input").click( (e) => {
				if(e.target.value === "standard"){
					this.viewer.useHQ = false;
				}else if(e.target.value === "hq"){
					this.viewer.useHQ = true;
				}
			});

			let currentQuality = this.viewer.useHQ ? "hq" : "standard";
			elSplatQuality.find(`input[value=${currentQuality}]`).trigger("click");
		}

		$('#show_bounding_box').click(() => {
			this.viewer.setShowBoundingBox($('#show_bounding_box').prop("checked"));
		});

		$('#set_freeze').click(() => {
			this.viewer.setFreeze($('#set_freeze').prop("checked"));
		});
	}

}
