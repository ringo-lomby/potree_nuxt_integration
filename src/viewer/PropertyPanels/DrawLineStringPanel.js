

import * as THREE from "../../../libs/three.js/build/three.module.js";
import {MeasurePanel} from "./MeasurePanel.js";
import {Utils} from "../../utils.js";
import {showConfirmDialog} from "../../utils/ConfirmDialog.js";

const VIRT_THRESHOLD = 100;
const ROW_H = 22;
const VIEW_H = 360;
const BUFFER_ROWS = 5;

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
		this.elRemove.click(async () => {
			let confirmed = await showConfirmDialog({
				title: 'Remove LineString',
				message: `Remove "${measurement.name}"? This cannot be undone.`,
				confirmLabel: 'Remove',
			});
			if (confirmed) this.viewer.scene.removeDrawLineString(measurement);
		});

		// Cached DOM refs for surgical updates
		this._rowRefs   = [];      // row jQuery refs by node index (full mode only)
		this._distRefs  = [];      // distance value cell refs by segment index
		this._totalRef  = null;    // total distance cell ref
		this._virtual   = false;
		this._pool      = [];      // recycled row divs (virtual mode)
		this._scrollEl  = null;
		this._spacerEl  = null;

		// Build everything once
		this._buildWayTags();
		this._buildNodeTable();
		this._buildDistancesTable();
		this._buildNodeTagEditor();

		// Surgical event handlers
		this.propertiesPanel.addVolatileListener(measurement, "marker_added",      () => this._onTopologyChanged());
		this.propertiesPanel.addVolatileListener(measurement, "marker_removed",    () => this._onTopologyChanged());
		this.propertiesPanel.addVolatileListener(measurement, "marker_moved",      (e) => this._onMarkerMoved(e));
		this.propertiesPanel.addVolatileListener(measurement, "node_selected",     () => this._onNodeSelected());
		// Fired once after a whole-line drag — rebuilds table + distances in one pass
		this.propertiesPanel.addVolatileListener(measurement, "markers_all_moved", () => {
			this._buildNodeTable();
			this._buildDistancesTable();
		});
	}

	// ─── way tags editor ────────────────────────────────────────────────────

	_buildWayTags() {
		let elContainer = this.elContent.find('.way_tags_container');
		elContainer.empty();
		elContainer.append(this._buildWayTagEditor(this.measurement));
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
			'width:100%','box-sizing:border-box','background:#1a1a1a','color:#ddd',
			'border:1px solid #444','padding:2px 5px','font-size:11px','font-family:inherit',
		].join(';');

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
			valInput.on('input',  () => { if (currentKey) tags[currentKey] = valInput.val(); });
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

		let addBtn = $(`<div style="margin-top:7px; cursor:pointer; font-size:11px; color:#777; display:inline-flex; align-items:center; gap:4px; user-select:none"></div>`);
		addBtn.append($(`<img src="${addIconPath}" style="width:11px; height:11px"/>`));
		addBtn.append($('<span>Add tag</span>'));
		addBtn.hover(() => addBtn.css('color', '#bbb'), () => addBtn.css('color', '#777'));
		addBtn.click(() => { let row = addTagRow('', ''); row.find('input').first().focus(); });
		container.append(addBtn);

		return container;
	}

	// ─── node tag editor ────────────────────────────────────────────────────

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
			'width:100%','box-sizing:border-box','background:#1a1a1a','color:#ddd',
			'border:1px solid #444','padding:2px 5px','font-size:11px','font-family:inherit',
		].join(';');

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
			valInput.on('input',  () => { if (currentKey) tags[currentKey] = valInput.val(); });
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

		let addBtn = $(`<div style="margin-top:7px; cursor:pointer; font-size:11px; color:#777; display:inline-flex; align-items:center; gap:4px; user-select:none"></div>`);
		addBtn.append($(`<img src="${addIconPath}" style="width:11px; height:11px"/>`));
		addBtn.append($('<span>Add tag</span>'));
		addBtn.hover(() => addBtn.css('color', '#bbb'), () => addBtn.css('color', '#777'));
		addBtn.click(() => { let row = addTagRow('', ''); row.find('input').first().focus(); });
		container.append(addBtn);

		return container;
	}

	_buildNodeTagEditor() {
		let elContainer = this.elContent.find('.node_tags_container');
		elContainer.empty();

		// Multi-node selection takes priority over single-node
		let multiIndices = Array.from(this.measurement.selectedNodeIndices).sort((a, b) => a - b);
		if (multiIndices.length > 0) {
			this._buildMultiNodeInfo(elContainer, multiIndices);
			return;
		}

		let si = this.measurement.selectedNodeIndex;
		if (si >= 0 && si < this.measurement.points.length) {
			let N = this.measurement.points.length;
			let isEndpoint = (si === 0 || si === N - 1);
			elContainer.append(this._buildSplitButton(si));
			if (isEndpoint) elContainer.append(this._buildConnectButtons(si));
			elContainer.append(this._buildTagEditor(this.measurement.points[si], si));
		}
	}

	_buildConnectButtons(si) {
		let tool = this.viewer._drawLineStringTool;
		let ls   = this.measurement;
		let row  = $(`<div style="display:flex;gap:4px;margin-top:6px;"></div>`);

		let linkBtn = $(`<button style="flex:1;padding:4px 0;font-size:11px;background:#2a2a2a;color:#ccc;border:1px solid #555;cursor:pointer;border-radius:3px" title="Link endpoints at a shared junction node — then click an endpoint on another linestring">Link</button>`);
		linkBtn.click(() => { if (tool) tool.startConnectMode('junction', ls, si); });

		if (!ls.closed) {
			let mergeBtn = $(`<button style="flex:1;padding:4px 0;font-size:11px;background:#2a2a2a;color:#ccc;border:1px solid #555;cursor:pointer;border-radius:3px" title="Merge into one linestring — then click an endpoint on another linestring">Merge</button>`);
			mergeBtn.click(() => { if (tool) tool.startConnectMode('merge', ls, si); });
			row.append(mergeBtn);
		}

		row.append(linkBtn);
		return row;
	}

	_buildMultiNodeInfo(elContainer, indices) {
		let edges = this.measurement.getSelectedEdges();

		let container = $(`<div style="margin-top: 10px; border-top: 1px solid #444; padding-top: 10px"></div>`);
		container.append($(`<div style="font-size: 11px; color: #999; margin-bottom: 4px">${indices.length} node${indices.length > 1 ? 's' : ''} selected (${indices.map(i => i + 1).join(', ')})</div>`));

		if (edges.length > 0) {
			let edgeStr = edges.map(([a, b]) => `${a + 1}→${b + 1}`).join(', ');
			container.append($(`<div style="font-size: 10px; color: #ff8800; margin-bottom: 6px">Edge${edges.length > 1 ? 's' : ''}: ${edgeStr} — way tags apply to the whole linestring</div>`));
		} else {
			container.append($(`<div style="font-size: 10px; color: #888; margin-bottom: 6px">Drag any selected node to move all together</div>`));
		}

		let clearBtn = $(`
			<button style="width:100%; padding:4px 0; font-size:11px; background:#2a2a2a; color:#ccc; border:1px solid #555; cursor:pointer; border-radius:3px; margin-top:4px">
				Clear node selection
			</button>
		`);
		clearBtn.click(() => this.measurement.clearMultiNodeSelection());
		container.append(clearBtn);

		elContainer.append(container);
	}

	_refreshTagEditors () {
		this._buildWayTags();
		this._buildNodeTagEditor();
	}

	_buildSplitButton(nodeIndex) {
		let N = this.measurement.points.length;
		let canSplit = (N >= 3) && (nodeIndex > 0) && (nodeIndex < N - 1);

		let btn = $(`
			<div style="margin-top: 10px; border-top: 1px solid #444; padding-top: 10px">
				<button style="
					width: 100%; padding: 5px 0; font-size: 11px;
					background: ${canSplit ? '#2a2a2a' : '#1a1a1a'};
					color: ${canSplit ? '#ccc' : '#555'};
					border: 1px solid ${canSplit ? '#555' : '#333'};
					cursor: ${canSplit ? 'pointer' : 'not-allowed'};
					border-radius: 3px;
				" ${canSplit ? '' : 'disabled'}>
					✂ Split way at node ${nodeIndex + 1}
				</button>
				${!canSplit ? `<div style="font-size:10px; color:#555; margin-top:4px; text-align:center">
					${N < 3 ? 'Need at least 3 nodes to split' : 'Select a middle node to split'}
				</div>` : ''}
			</div>
		`);

		if (canSplit) {
			btn.find('button').click(() => {
				let tool = this.viewer._drawLineStringTool;
				if (tool) {
					tool.splitLineString(this.measurement, nodeIndex);
				} else {
					let result = this.measurement.splitAt(nodeIndex);
					if (!result) return;
					this.viewer.scene.removeDrawLineString(this.measurement);
					this.viewer.scene.addDrawLineString(result[0]);
					this.viewer.scene.addDrawLineString(result[1]);
				}
			});
		}

		return btn;
	}

	// ─── node table (full or virtualized) ───────────────────────────────────

	_buildNodeTable() {
		let elContainer = this.elContent.find('.nodes_table_container');
		elContainer.empty();
		this._rowRefs = [];
		this._pool    = [];
		this._scrollEl = null;
		this._spacerEl = null;

		let N = this.measurement.points.length;
		this._virtual = (N > VIRT_THRESHOLD);

		if (this._virtual) {
			this._buildNodeTableVirtual(elContainer);
		} else {
			this._buildNodeTableFull(elContainer);
		}
	}

	_buildNodeTableFull(elContainer) {
		let removeIconPath = Potree.resourcePath + '/icons/remove.svg';
		let addIconPath    = Potree.resourcePath + '/icons/add.svg';

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

		let N = this.measurement.points.length;
		for (let i = 0; i < N; i++) {
			let pos = this.measurement.points[i].position;
			let isSelected = (i === this.measurement.selectedNodeIndex);
			let bgStyle = isSelected ? 'background-color: rgba(255, 255, 0, 0.2)' : '';

			let row = $(`
				<tr data-node-index="${i}" style="cursor: pointer; ${bgStyle}">
					<td style="padding: 2px 4px; white-space: nowrap">${i + 1}</td>
					<td style="padding: 2px 4px"><span class="cell_x">${Utils.addCommas(pos.x.toFixed(3))}</span></td>
					<td style="padding: 2px 4px"><span class="cell_y">${Utils.addCommas(pos.y.toFixed(3))}</span></td>
					<td style="padding: 2px 4px"><span class="cell_z">${Utils.addCommas(pos.z.toFixed(3))}</span></td>
					<td align="right" style="white-space: nowrap; padding: 2px 4px">
						<img name="delete_node" title="Delete node" class="button-icon" src="${removeIconPath}" style="width: 14px; height: 14px; cursor: pointer; margin-left: 2px"/>
					</td>
				</tr>
			`);

			let capturedIndex = i;
			row.hover(
				() => {
					if (capturedIndex !== this.measurement.selectedNodeIndex) {
						row.css('background-color', 'rgba(255, 255, 255, 0.1)');
					}
				},
				() => {
					if (capturedIndex !== this.measurement.selectedNodeIndex) {
						row.css('background-color', '');
					}
				}
			);

			row.click(() => {
				if (this.measurement.selectedNodeIndex === capturedIndex) {
					this.measurement.selectNode(-1);
				} else {
					this.measurement.selectNode(capturedIndex);
				}
			});

			row.find("img[name=delete_node]").click((e) => {
				e.stopPropagation();
				if (this.measurement.points.length > 2) {
					this.measurement.selectNode(-1);
					this.measurement.removeMarker(capturedIndex);
				}
			});

			table.append(row);
			this._rowRefs[i] = row;

			// Add-between button
			if (i < N - 1) {
				let addRow = $(`
					<tr>
						<td colspan="5" style="text-align: center; padding: 1px 0">
							<img name="add_node" title="Add node between ${i + 1} and ${i + 2}" class="button-icon" src="${addIconPath}" style="width: 12px; height: 12px; cursor: pointer; opacity: 0.6"/>
						</td>
					</tr>
				`);
				addRow.find("img[name=add_node]").click(() => {
					this.measurement.insertMarkerAfter(capturedIndex);
				});
				table.append(addRow);
			}
		}

		elContainer.append(table);
	}

	_buildNodeTableVirtual(elContainer) {
		let removeIconPath = Potree.resourcePath + '/icons/remove.svg';
		let N = this.measurement.points.length;

		let header = $(`
			<div style="display:grid; grid-template-columns: 36px 1fr 1fr 1fr 22px; padding:4px 6px; font-size:11px; color:#888; border-bottom:1px solid #444; font-weight:bold">
				<span>#</span><span>x</span><span>y</span><span>z</span><span></span>
			</div>
		`);
		elContainer.append(header);

		let info = $(`<div style="font-size:10px; color:#888; padding:3px 6px; background:#222">${N} nodes — scroll to view all</div>`);
		elContainer.append(info);

		let scrollEl = $(`<div style="position:relative; height:${VIEW_H}px; overflow-y:auto; border:1px solid #333; background:#181818"></div>`);
		let spacer   = $(`<div style="height:${N * ROW_H}px; pointer-events:none"></div>`);
		scrollEl.append(spacer);
		elContainer.append(scrollEl);

		this._scrollEl = scrollEl[0];
		this._spacerEl = spacer[0];

		// Pre-create the pool
		let viewportRows = Math.ceil(VIEW_H / ROW_H);
		let poolSize = viewportRows + BUFFER_ROWS * 2;
		for (let p = 0; p < poolSize; p++) {
			let row = this._createPooledRow(removeIconPath);
			scrollEl.append(row);
			this._pool.push(row);
		}

		this._scrollEl.addEventListener('scroll', () => this._renderVirtualWindow());
		this._renderVirtualWindow();
	}

	_createPooledRow(removeIconPath) {
		let row = $(`
			<div data-node-index="-1" style="
				position:absolute; left:0; right:0; height:${ROW_H}px;
				display:grid; grid-template-columns: 36px 1fr 1fr 1fr 22px;
				align-items:center; padding:0 6px; cursor:pointer;
				border-bottom:1px solid rgba(255,255,255,0.04);
				font-size:11px; color:#ccc; box-sizing:border-box;
			">
				<span class="cell_num"></span>
				<span class="cell_x"></span>
				<span class="cell_y"></span>
				<span class="cell_z"></span>
				<img class="cell_del button-icon" src="${removeIconPath}" style="width:12px; height:12px; opacity:0.6"/>
			</div>
		`);

		// Hover
		row.hover(
			() => {
				let idx = parseInt(row.attr('data-node-index'));
				if (idx >= 0 && idx !== this.measurement.selectedNodeIndex) {
					row.css('background-color', 'rgba(255,255,255,0.08)');
				}
			},
			() => {
				let idx = parseInt(row.attr('data-node-index'));
				if (idx !== this.measurement.selectedNodeIndex) {
					row.css('background-color', '');
				}
			}
		);

		// Click → select/deselect
		row.click(() => {
			let idx = parseInt(row.attr('data-node-index'));
			if (idx < 0) return;
			if (this.measurement.selectedNodeIndex === idx) {
				this.measurement.selectNode(-1);
			} else {
				this.measurement.selectNode(idx);
			}
		});

		// Delete
		row.find('.cell_del').click((e) => {
			e.stopPropagation();
			let idx = parseInt(row.attr('data-node-index'));
			if (idx < 0) return;
			if (this.measurement.points.length > 2) {
				this.measurement.selectNode(-1);
				this.measurement.removeMarker(idx);
			}
		});

		return row;
	}

	_renderVirtualWindow() {
		if (!this._virtual || !this._scrollEl) return;

		let N = this.measurement.points.length;
		let scrollTop = this._scrollEl.scrollTop;
		let startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER_ROWS);
		let visibleRows = Math.ceil(VIEW_H / ROW_H) + BUFFER_ROWS * 2;
		let endIdx = Math.min(N, startIdx + visibleRows);
		let needed = endIdx - startIdx;

		for (let p = 0; p < this._pool.length; p++) {
			let row = this._pool[p];
			if (p < needed) {
				let i = startIdx + p;
				this._updatePooledRow(row, i);
			} else {
				row.css('display', 'none');
				row.attr('data-node-index', -1);
			}
		}
	}

	_updatePooledRow(row, i) {
		let pos = this.measurement.points[i].position;
		row.attr('data-node-index', i);
		row.css({
			display: 'grid',
			top: (i * ROW_H) + 'px',
			'background-color': (i === this.measurement.selectedNodeIndex) ? 'rgba(255,255,0,0.2)' : '',
		});
		row.find('.cell_num').text(i + 1);
		row.find('.cell_x').text(Utils.addCommas(pos.x.toFixed(3)));
		row.find('.cell_y').text(Utils.addCommas(pos.y.toFixed(3)));
		row.find('.cell_z').text(Utils.addCommas(pos.z.toFixed(3)));
	}

	// ─── distances table ────────────────────────────────────────────────────

	_buildDistancesTable() {
		let elTable = this.elContent.find('#distances_table');
		elTable.empty();
		this._distRefs = [];
		this._totalRef = null;

		let N = this.measurement.points.length;

		// For very large N, skip per-segment rows (would be thousands of rows)
		if (N <= VIRT_THRESHOLD) {
			for (let i = 0; i < N - 1; i++) {
				let label = (i === 0) ? 'Segments: ' : '';
				let d = this.measurement.points[i].position
					.distanceTo(this.measurement.points[i + 1].position);
				let valCell = $(`<td style="width: 100%; padding-left: 10px">${d.toFixed(3)}</td>`);
				let row = $(`<tr><th>${label}</th></tr>`).append(valCell);
				elTable.append(row);
				this._distRefs[i] = valCell;
			}
		} else {
			elTable.append($(`<tr><th>Segments: </th><td style="width:100%; padding-left:10px; color:#888">${N - 1} (hidden for performance)</td></tr>`));
		}

		let totalCell = $(`<td style="width: 100%; padding-left: 10px">${this.measurement.getTotalDistance().toFixed(3)}</td>`);
		let totalRow = $(`<tr><th>Total: </th></tr>`).append(totalCell);
		elTable.append(totalRow);
		this._totalRef = totalCell;
	}

	// ─── event handlers ─────────────────────────────────────────────────────

	_onMarkerMoved(e) {
		let i = e.index;
		if (i == null) return;

		// Update the moved row's coords
		if (this._virtual) {
			// Re-render the visible window if the moved index is in it
			for (let row of this._pool) {
				if (parseInt(row.attr('data-node-index')) === i) {
					this._updatePooledRow(row, i);
					break;
				}
			}
		} else {
			let row = this._rowRefs[i];
			if (row) {
				let pos = this.measurement.points[i].position;
				row.find('.cell_x').text(Utils.addCommas(pos.x.toFixed(3)));
				row.find('.cell_y').text(Utils.addCommas(pos.y.toFixed(3)));
				row.find('.cell_z').text(Utils.addCommas(pos.z.toFixed(3)));
			}
		}

		// Update affected segment distances + total
		this._updateDistance(i - 1);
		this._updateDistance(i);
		if (this._totalRef) {
			this._totalRef.text(this.measurement.getTotalDistance().toFixed(3));
		}
	}

	_updateDistance(segIdx) {
		if (segIdx < 0 || segIdx >= this.measurement.points.length - 1) return;
		let cell = this._distRefs[segIdx];
		if (!cell) return;
		let d = this.measurement.points[segIdx].position
			.distanceTo(this.measurement.points[segIdx + 1].position);
		cell.text(d.toFixed(3));
	}

	_onTopologyChanged() {
		// add/remove shifts indices — rebuild table and distances
		this._buildNodeTable();
		this._buildDistancesTable();
		this._buildNodeTagEditor();
	}

	_onNodeSelected() {
		// Update row highlight only — way tags editor stays untouched
		if (this._virtual) {
			this._renderVirtualWindow();
		} else {
			for (let i = 0; i < this._rowRefs.length; i++) {
				let row = this._rowRefs[i];
				if (!row) continue;
				row.css('background-color',
					(i === this.measurement.selectedNodeIndex) ? 'rgba(255, 255, 0, 0.2)' : '');
			}
		}
		// Rebuild only the node-tag editor for the new selection
		this._buildNodeTagEditor();
	}

	// Kept for compatibility — full rebuild
	update() {
		this._buildWayTags();
		this._buildNodeTable();
		this._buildDistancesTable();
		this._buildNodeTagEditor();
	}
};
