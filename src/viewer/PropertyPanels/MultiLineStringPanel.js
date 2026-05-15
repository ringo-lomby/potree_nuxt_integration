
export class MultiLineStringPanel {
	constructor (viewer, linestrings, propertiesPanel) {
		this.viewer = viewer;
		this.linestrings = linestrings;
		this._batchTags = {};

		let removeIconPath = Potree.resourcePath + '/icons/remove.svg';
		let addIconPath    = Potree.resourcePath + '/icons/add.svg';

		this.elContent = $(`
			<div class="measurement_content selectable">
				<div style="font-size:12px; color:#ccc; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #444">
					<strong>${linestrings.length} linestrings selected</strong>
					<span style="font-size:10px; color:#777; display:block; margin-top:2px">Ctrl+A to select all visible &nbsp;|&nbsp; Esc to deselect</span>
				</div>
				<span class="batch_tags_container"></span>
				<div style="margin-top:10px; display:flex; gap:6px">
					<button class="btn_apply_tags" style="flex:1; padding:5px; font-size:11px; background:#2a3a2a; color:#8f8; border:1px solid #484; cursor:pointer; border-radius:3px">
						Apply tags to all
					</button>
					<button class="btn_clear_selection" style="flex:1; padding:5px; font-size:11px; background:#2a2a2a; color:#aaa; border:1px solid #555; cursor:pointer; border-radius:3px">
						Clear selection
					</button>
				</div>
				<div style="font-size:10px; color:#666; margin-top:6px">
					Entered tags will be merged into each selected linestring's way tags.
				</div>
			</div>
		`);

		this._buildBatchTagEditor(removeIconPath, addIconPath);

		this.elContent.find('.btn_apply_tags').click(() => this._applyTagsToAll());
		this.elContent.find('.btn_clear_selection').click(() => {
			let tool = viewer._drawLineStringTool;
			if (tool) {
				for (let ls of tool._selectedLinestrings) {
					ls._selected = false;
					ls.applyHighlight();
				}
				tool._selectedLinestrings.clear();
				viewer.dispatchEvent({ type: 'linestrings_multi_selected', linestrings: [] });
			}
		});
	}

	_buildBatchTagEditor (removeIconPath, addIconPath) {
		let elContainer = this.elContent.find('.batch_tags_container');
		elContainer.empty();

		let tags = this._batchTags;

		let container = $(`<div style="margin-bottom:8px"></div>`);
		container.append($(`<div style="font-size:11px; color:#999; margin-bottom:6px">Tags to apply</div>`));

		let table = $(`<table style="width:100%; border-collapse:collapse"></table>`);
		table.append($(`
			<tr>
				<th style="text-align:left; font-size:10px; padding:2px 4px; color:#666; font-weight:normal">Key</th>
				<th style="text-align:left; font-size:10px; padding:2px 4px; color:#666; font-weight:normal">Value</th>
				<th style="width:18px"></th>
			</tr>
		`));
		container.append(table);

		const inputStyle = [
			'width:100%', 'box-sizing:border-box', 'background:#1a1a1a', 'color:#ddd',
			'border:1px solid #444', 'padding:2px 5px', 'font-size:11px', 'font-family:inherit',
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

		let addBtn = $(`<div style="margin-top:7px; cursor:pointer; font-size:11px; color:#777; display:inline-flex; align-items:center; gap:4px; user-select:none"></div>`);
		addBtn.append($(`<img src="${addIconPath}" style="width:11px; height:11px"/>`));
		addBtn.append($('<span>Add tag</span>'));
		addBtn.hover(() => addBtn.css('color', '#bbb'), () => addBtn.css('color', '#777'));
		addBtn.click(() => { let row = addTagRow('', ''); row.find('input').first().focus(); });
		container.append(addBtn);

		elContainer.append(container);
	}

	_applyTagsToAll () {
		let count = 0;
		for (let ls of this.linestrings) {
			if (!ls._wayTags) ls._wayTags = {};
			for (let [k, v] of Object.entries(this._batchTags)) {
				if (k) { ls._wayTags[k] = v; count++; }
			}
		}

		let btn = this.elContent.find('.btn_apply_tags');
		let orig = btn.text();
		btn.text(`Applied ✓ (${this.linestrings.length} ways)`).css('background', '#1a4a1a');
		setTimeout(() => btn.text(orig).css('background', '#2a3a2a'), 2000);
	}
}
