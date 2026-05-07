

import * as THREE from "../../../libs/three.js/build/three.module.js";
import {MeasurePanel} from "./MeasurePanel.js";
import {Utils} from "../../utils.js";

export class DrawLineStringPanel extends MeasurePanel{
	constructor(viewer, measurement, propertiesPanel){
		super(viewer, measurement, propertiesPanel);

		let removeIconPath = Potree.resourcePath + '/icons/remove.svg';
		this.elContent = $(`
			<div class="measurement_content selectable">
				<span class="way_tags_container"></span>
				<span class="nodes_table_container"></span>
				<span class="node_tags_container"></span>
				<br>
				<table id="distances_table" class="measurement_value_table"></table>

				<!-- ACTIONS -->
				<div style="display: flex; margin-top: 12px">
					<span style="flex-grow: 1"></span>
					<img name="remove" class="button-icon" src="${removeIconPath}" style="width: 16px; height: 16px" title="Remove LineString"/>
				</div>
			</div>
		`);

		this.elRemove = this.elContent.find("img[name=remove]");
		this.elRemove.click( () => {
			this.viewer.scene.removeDrawLineString(measurement);
		});

		this.propertiesPanel.addVolatileListener(measurement, "marker_added", this._update);
		this.propertiesPanel.addVolatileListener(measurement, "marker_removed", this._update);
		this.propertiesPanel.addVolatileListener(measurement, "marker_moved", this._update);
		this.propertiesPanel.addVolatileListener(measurement, "node_selected", this._update);

		this.update();
	}

	_buildWayTagEditor(measurement) {
		let removeIconPath = Potree.resourcePath + '/icons/remove.svg';
		let addIconPath    = Potree.resourcePath + '/icons/add.svg';

		if (!measurement._wayTags) measurement._wayTags = {};
		let tags = measurement._wayTags;

		let container = $(`<div style="margin-bottom: 12px; border-bottom: 1px solid #444; padding-bottom: 10px"></div>`);
		container.append($(`<div style="font-size: 11px; color: #999; margin-bottom: 6px">Way Tags</div>`));

		let table = $(`<table style="width: 100%; border-collapse: collapse"></table>`);
		table.append($(`
			<tr>
				<th style="text-align:left; font-size:10px; padding:2px 4px; color:#666; font-weight:normal">Key</th>
				<th style="text-align:left; font-size:10px; padding:2px 4px; color:#666; font-weight:normal">Value</th>
				<th style="width:18px"></th>
			</tr>
		`));
		container.append(table);

		const inputStyle = [
			'width:100%',
			'box-sizing:border-box',
			'background:#1a1a1a',
			'color:#ddd',
			'border:1px solid #444',
			'padding:2px 5px',
			'font-size:11px',
			'font-family:inherit',
		].join(';');

		const addTagRow = (key, value) => {
			let row = $(`<tr></tr>`);

			let keyInput = $(`<input type="text" style="${inputStyle}"/>`);
			keyInput.val(key);

			let valInput = $(`<input type="text" style="${inputStyle}"/>`);
			valInput.val(value);

			let delBtn = $(`<img class="button-icon" src="${removeIconPath}" style="width:12px; height:12px; cursor:pointer; opacity:0.55; display:block"/>`);

			let currentKey = key;

			keyInput.on('blur', () => {
				let newKey = keyInput.val().trim();
				if (newKey === currentKey) return;
				let val = (currentKey in tags) ? tags[currentKey] : valInput.val();
				if (currentKey) delete tags[currentKey];
				if (newKey) tags[newKey] = val;
				currentKey = newKey;
			});

			valInput.on('input', () => {
				if (currentKey) tags[currentKey] = valInput.val();
			});

			keyInput.on('keydown', (e) => { if (e.key === 'Enter') valInput.focus(); });
			valInput.on('keydown', (e) => { if (e.key === 'Enter') valInput.blur(); });

			delBtn.click(() => {
				if (currentKey) delete tags[currentKey];
				row.remove();
			});

			delBtn.hover(
				() => delBtn.css('opacity', '1'),
				() => delBtn.css('opacity', '0.55')
			);

			row.append($('<td style="padding:2px 2px; width:42%"></td>').append(keyInput));
			row.append($('<td style="padding:2px 2px"></td>').append(valInput));
			row.append($('<td style="padding:2px 2px; vertical-align:middle"></td>').append(delBtn));
			table.append(row);

			return row;
		};

		for (let [k, v] of Object.entries(tags)) {
			addTagRow(k, String(v));
		}

		let addBtn = $(`<div style="margin-top:7px; cursor:pointer; font-size:11px; color:#777; display:inline-flex; align-items:center; gap:4px; user-select:none"></div>`);
		addBtn.append($(`<img src="${addIconPath}" style="width:11px; height:11px"/>`));
		addBtn.append($('<span>Add tag</span>'));
		addBtn.hover(
			() => addBtn.css('color', '#bbb'),
			() => addBtn.css('color', '#777')
		);
		addBtn.click(() => {
			let row = addTagRow('', '');
			row.find('input').first().focus();
		});
		container.append(addBtn);

		return container;
	}

	_buildTagEditor(point, nodeIndex) {
		let removeIconPath = Potree.resourcePath + '/icons/remove.svg';
		let addIconPath    = Potree.resourcePath + '/icons/add.svg';

		if (!point._osmNodeTags) point._osmNodeTags = {};
		let tags = point._osmNodeTags;

		let container = $(`<div style="margin-top: 12px; border-top: 1px solid #444; padding-top: 10px"></div>`);

		container.append($(`<div style="font-size: 11px; color: #999; margin-bottom: 6px">Tags — Node ${nodeIndex + 1}</div>`));

		let table = $(`<table style="width: 100%; border-collapse: collapse"></table>`);
		table.append($(`
			<tr>
				<th style="text-align:left; font-size:10px; padding:2px 4px; color:#666; font-weight:normal">Key</th>
				<th style="text-align:left; font-size:10px; padding:2px 4px; color:#666; font-weight:normal">Value</th>
				<th style="width:18px"></th>
			</tr>
		`));
		container.append(table);

		const inputStyle = [
			'width:100%',
			'box-sizing:border-box',
			'background:#1a1a1a',
			'color:#ddd',
			'border:1px solid #444',
			'padding:2px 5px',
			'font-size:11px',
			'font-family:inherit',
		].join(';');

		const addTagRow = (key, value) => {
			let row = $(`<tr></tr>`);

			let keyInput = $(`<input type="text" style="${inputStyle}"/>`);
			keyInput.val(key);

			let valInput = $(`<input type="text" style="${inputStyle}"/>`);
			valInput.val(value);

			let delBtn = $(`<img class="button-icon" src="${removeIconPath}" style="width:12px; height:12px; cursor:pointer; opacity:0.55; display:block"/>`);

			let currentKey = key;

			// on key blur: rename the tag key
			keyInput.on('blur', () => {
				let newKey = keyInput.val().trim();
				if (newKey === currentKey) return;
				let val = (currentKey in tags) ? tags[currentKey] : valInput.val();
				if (currentKey) delete tags[currentKey];
				if (newKey) tags[newKey] = val;
				currentKey = newKey;
			});

			// on value change: save immediately
			valInput.on('input', () => {
				if (currentKey) tags[currentKey] = valInput.val();
			});

			// keyboard convenience
			keyInput.on('keydown', (e) => { if (e.key === 'Enter') valInput.focus(); });
			valInput.on('keydown', (e) => { if (e.key === 'Enter') valInput.blur(); });

			delBtn.click(() => {
				if (currentKey) delete tags[currentKey];
				row.remove();
			});

			delBtn.hover(
				() => delBtn.css('opacity', '1'),
				() => delBtn.css('opacity', '0.55')
			);

			row.append($('<td style="padding:2px 2px; width:42%"></td>').append(keyInput));
			row.append($('<td style="padding:2px 2px"></td>').append(valInput));
			row.append($('<td style="padding:2px 2px; vertical-align:middle"></td>').append(delBtn));
			table.append(row);

			return row;
		};

		for (let [k, v] of Object.entries(tags)) {
			addTagRow(k, String(v));
		}

		let addBtn = $(`<div style="margin-top:7px; cursor:pointer; font-size:11px; color:#777; display:inline-flex; align-items:center; gap:4px; user-select:none"></div>`);
		addBtn.append($(`<img src="${addIconPath}" style="width:11px; height:11px"/>`));
		addBtn.append($('<span>Add tag</span>'));
		addBtn.hover(
			() => addBtn.css('color', '#bbb'),
			() => addBtn.css('color', '#777')
		);
		addBtn.click(() => {
			let row = addTagRow('', '');
			row.find('input').first().focus();
		});
		container.append(addBtn);

		return container;
	}

	update(){
		let removeIconPath = Potree.resourcePath + '/icons/remove.svg';
		let addIconPath = Potree.resourcePath + '/icons/add.svg';

		// way tags editor (always visible)
		let elWayTagsContainer = this.elContent.find('.way_tags_container');
		elWayTagsContainer.empty();
		elWayTagsContainer.append(this._buildWayTagEditor(this.measurement));

		// nodes table
		let elNodesContainer = this.elContent.find('.nodes_table_container');
		elNodesContainer.empty();

		let table = $(`
			<table class="measurement_value_table">
				<tr>
					<th>#</th>
					<th>x</th>
					<th>y</th>
					<th>z</th>
					<th></th>
				</tr>
			</table>
		`);

		for (let i = 0; i < this.measurement.points.length; i++) {
			let point = this.measurement.points[i].position;
			let x = Utils.addCommas(point.x.toFixed(3));
			let y = Utils.addCommas(point.y.toFixed(3));
			let z = Utils.addCommas(point.z.toFixed(3));

			let isSelected = (i === this.measurement.selectedNodeIndex);
			let bgStyle = isSelected ? 'background-color: rgba(255, 255, 0, 0.2)' : '';

			let row = $(`
				<tr data-node-index="${i}" style="cursor: pointer; ${bgStyle}">
					<td style="padding: 2px 4px; white-space: nowrap">${i + 1}</td>
					<td style="padding: 2px 4px"><span>${x}</span></td>
					<td style="padding: 2px 4px"><span>${y}</span></td>
					<td style="padding: 2px 4px"><span>${z}</span></td>
					<td align="right" style="white-space: nowrap; padding: 2px 4px">
						<img name="delete_node" title="Delete node" class="button-icon" src="${removeIconPath}" style="width: 14px; height: 14px; cursor: pointer; margin-left: 2px"/>
					</td>
				</tr>
			`);

			// hover: subtle highlight when not selected
			row.hover(
				() => {
					if (i !== this.measurement.selectedNodeIndex) {
						let sphere = this.measurement.spheres[i];
						if (sphere) sphere.material.emissive.setHex(0x888888);
						row.css('background-color', 'rgba(255, 255, 255, 0.1)');
					}
				},
				() => {
					if (i !== this.measurement.selectedNodeIndex) {
						let sphere = this.measurement.spheres[i];
						if (sphere) sphere.material.emissive.setHex(0x000000);
						row.css('background-color', '');
					}
				}
			);

			// click row to select/deselect node (syncs with 3D view)
			row.click(() => {
				if (this.measurement.selectedNodeIndex === i) {
					this.measurement.selectNode(-1);
				} else {
					this.measurement.selectNode(i);
				}
			});

			// delete node button
			row.find("img[name=delete_node]").click((e) => {
				e.stopPropagation();
				if (this.measurement.points.length > 2) {
					this.measurement.selectNode(-1);
					this.measurement.removeMarker(i);
				}
			});

			table.append(row);

			// add node button between this and next node
			if (i < this.measurement.points.length - 1) {
				let addRow = $(`
					<tr>
						<td colspan="5" style="text-align: center; padding: 1px 0">
							<img name="add_node" title="Add node between ${i + 1} and ${i + 2}" class="button-icon" src="${addIconPath}" style="width: 12px; height: 12px; cursor: pointer; opacity: 0.6"/>
						</td>
					</tr>
				`);

				addRow.find("img[name=add_node]").click(() => {
					this.measurement.insertMarkerAfter(i);
				});

				table.append(addRow);
			}
		}

		elNodesContainer.append(table);

		// tag editor — shown only when a node is selected
		let elTagsContainer = this.elContent.find('.node_tags_container');
		elTagsContainer.empty();

		let si = this.measurement.selectedNodeIndex;
		if (si >= 0 && si < this.measurement.points.length) {
			elTagsContainer.append(this._buildTagEditor(this.measurement.points[si], si));
		}

		// distances table
		let positions = this.measurement.points.map(p => p.position);
		let distances = [];
		for (let i = 0; i < positions.length - 1; i++) {
			let d = positions[i].distanceTo(positions[i + 1]);
			distances.push(d.toFixed(3));
		}

		let totalDistance = this.measurement.getTotalDistance().toFixed(3);
		let elDistanceTable = this.elContent.find(`#distances_table`);
		elDistanceTable.empty();

		for (let i = 0; i < distances.length; i++) {
			let label = (i === 0) ? 'Segments: ' : '';
			let distance = distances[i];
			let elDistance = $(`
				<tr>
					<th>${label}</th>
					<td style="width: 100%; padding-left: 10px">${distance}</td>
				</tr>`);
			elDistanceTable.append(elDistance);
		}

		let elTotal = $(`
			<tr>
				<th>Total: </td><td style="width: 100%; padding-left: 10px">${totalDistance}</th>
			</tr>`);
		elDistanceTable.append(elTotal);
	}
};
