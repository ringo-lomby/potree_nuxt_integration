
export class OSMPatcher {

	// Format a position number with up to 4 decimal places, no trailing zeros.
	static _fmt (n) { return String(parseFloat(n.toFixed(4))); }

	// Detect indentation style from the raw XML string.
	static _detectIndent (xml) {
		let outerMatch = xml.match(/\n([ \t]+)<(?:node|way|relation|bounds)\b/);
		let outer = outerMatch ? outerMatch[1] : '  ';
		let innerMatch = xml.match(/\n([ \t]+)<(?:tag|nd)\b/);
		let inner = innerMatch ? innerMatch[1] : (outer + '  ');
		return { outer, inner };
	}

	// Update local_x / local_y / ele tags on an existing <node> element.
	// Updates each tag's value IN PLACE so the original tag order is preserved.
	// Only inserts a tag (at the front) if it was absent in the original node.
	static _setPositionTags (doc, nodeEl, pos, inner, outer) {
		const posValues = { 'local_x': pos.x, 'local_y': pos.y, 'ele': pos.z };
		const found     = { 'local_x': false, 'local_y': false, 'ele': false };

		// Update existing position tags in place — no reordering.
		for (let tagEl of nodeEl.querySelectorAll('tag')) {
			let k = tagEl.getAttribute('k');
			if (k in posValues) {
				tagEl.setAttribute('v', OSMPatcher._fmt(posValues[k]));
				found[k] = true;
			}
		}

		// Insert any missing position tag at the front of the node's children.
		for (let [k, v] of [['local_x', pos.x], ['local_y', pos.y], ['ele', pos.z]]) {
			if (found[k]) continue;
			let tagEl = doc.createElement('tag');
			tagEl.setAttribute('k', k);
			tagEl.setAttribute('v', OSMPatcher._fmt(v));
			let textNode = doc.createTextNode('\n' + inner);
			if (!nodeEl.firstChild) {
				nodeEl.appendChild(doc.createTextNode('\n' + outer));
			}
			nodeEl.insertBefore(tagEl,  nodeEl.firstChild);
			nodeEl.insertBefore(textNode, tagEl);
		}
	}

	// Build a brand-new <node> element with proper indentation text nodes.
	static _createNodeEl (doc, nid, lat, lon, pos, extraTags, inner, outer) {
		let nodeEl = doc.createElement('node');
		nodeEl.setAttribute('id',  String(nid));
		nodeEl.setAttribute('lat', lat || '0');
		nodeEl.setAttribute('lon', lon || '0');
		for (let [k, v] of [['local_x', pos.x], ['local_y', pos.y], ['ele', pos.z]]) {
			nodeEl.appendChild(doc.createTextNode('\n' + inner));
			let tagEl = doc.createElement('tag');
			tagEl.setAttribute('k', k);
			tagEl.setAttribute('v', OSMPatcher._fmt(v));
			nodeEl.appendChild(tagEl);
		}
		for (let k in (extraTags || {})) {
			nodeEl.appendChild(doc.createTextNode('\n' + inner));
			let tagEl = doc.createElement('tag');
			tagEl.setAttribute('k', k);
			tagEl.setAttribute('v', extraTags[k]);
			nodeEl.appendChild(tagEl);
		}
		nodeEl.appendChild(doc.createTextNode('\n' + outer));
		return nodeEl;
	}

	// Rebuild a <way> element's children from scratch with proper indentation.
	static _rebuildWay (doc, wayEl, ls, newPointNodeIds, inner, outer) {
		while (wayEl.firstChild) wayEl.removeChild(wayEl.firstChild);

		for (let pt of ls.points) {
			let nid = (pt._osmNodeId != null) ? pt._osmNodeId : newPointNodeIds.get(pt);
			wayEl.appendChild(doc.createTextNode('\n' + inner));
			let ndEl = doc.createElement('nd');
			ndEl.setAttribute('ref', String(nid));
			wayEl.appendChild(ndEl);
		}

		let wayTags = ls._wayTags || (ls._osmMeta ? ls._osmMeta.wayTags : {});
		for (let k in wayTags) {
			wayEl.appendChild(doc.createTextNode('\n' + inner));
			let tagEl = doc.createElement('tag');
			tagEl.setAttribute('k', k);
			tagEl.setAttribute('v', wayTags[k]);
			wayEl.appendChild(tagEl);
		}

		let hasChildren = ls.points.length > 0 || Object.keys(wayTags || {}).length > 0;
		if (hasChildren) wayEl.appendChild(doc.createTextNode('\n' + outer));
	}

	// Insert an element into osmEl before refEl, with a preceding indent text node.
	static _insertBefore (doc, osmEl, el, refEl, outer) {
		if (refEl) {
			osmEl.insertBefore(doc.createTextNode('\n' + outer), refEl);
			osmEl.insertBefore(el, refEl);
		} else {
			osmEl.appendChild(doc.createTextNode('\n' + outer));
			osmEl.appendChild(el);
		}
	}

	// Remove an element from osmEl, also stripping its preceding whitespace text node.
	static _removeWithIndent (osmEl, el) {
		let prev = el.previousSibling;
		if (prev && prev.nodeType === 3) osmEl.removeChild(prev);
		osmEl.removeChild(el);
	}

	/**
	 * Patch an original OSM XML string with the current state of drawLineStrings.
	 *
	 * Only elements that changed are touched. Everything else — <relation>,
	 * <bounds>, custom top-level elements, and ways that were never imported —
	 * is preserved intact, including original whitespace/indentation.
	 *
	 * @param {string} originalXml    - The raw XML text loaded at import time.
	 * @param {Array}  drawLineStrings - Current scene drawLineStrings array.
	 * @param {Set}    importedWayIds  - Way IDs that existed at import time
	 *                                   (to detect user-deleted ways).
	 * @returns {string} Patched XML string.
	 */
	static patch (originalXml, drawLineStrings, importedWayIds) {
		let parser = new DOMParser();
		let doc    = parser.parseFromString(originalXml, 'application/xml');
		let osmEl  = doc.querySelector('osm');
		if (!osmEl) return originalXml;

		let { outer, inner } = OSMPatcher._detectIndent(originalXml);

		// ── 1. Categorise linestrings ─────────────────────────────────────────
		let importedWays   = new Map();  // wayId (string) → DrawLineString
		let newLineStrings = [];         // user-drawn, no original wayId

		for (let ls of drawLineStrings) {
			if (ls.points.length < 2) continue;
			if (ls._osmMeta && ls._osmMeta.wayId != null) {
				importedWays.set(String(ls._osmMeta.wayId), ls);
			} else {
				newLineStrings.push(ls);
			}
		}

		// ── 2. Detect deleted ways ────────────────────────────────────────────
		// A way is deleted when it was in the original import but is no longer
		// in the scene (user removed it).
		let deletedWayIds = new Set();
		if (importedWayIds) {
			for (let wid of importedWayIds) {
				if (!importedWays.has(String(wid))) deletedWayIds.add(String(wid));
			}
		}

		// ── 3. Snapshot original <nd> refs per way ────────────────────────────
		let domWayNodeRefs = new Map();  // wayId → string[]
		for (let wayEl of doc.querySelectorAll('way')) {
			let refs = [];
			for (let nd of wayEl.querySelectorAll('nd')) refs.push(nd.getAttribute('ref'));
			domWayNodeRefs.set(wayEl.getAttribute('id'), refs);
		}

		// ── 4. Build the final set of surviving node refs ─────────────────────
		let finalSurvivingRefs = new Set();

		// Nodes still used by imported ways in their current scene state.
		for (let [, ls] of importedWays) {
			for (let pt of ls.points) {
				if (pt._osmNodeId != null) finalSurvivingRefs.add(String(pt._osmNodeId));
			}
		}
		// Nodes used by ways we never touched (not imported, not deleted).
		for (let [wid, refs] of domWayNodeRefs) {
			if (!importedWays.has(wid) && !deletedWayIds.has(wid)) {
				for (let ref of refs) finalSurvivingRefs.add(ref);
			}
		}
		// Nodes referenced by relation members — never delete.
		for (let memberEl of doc.querySelectorAll('relation > member[type="node"]')) {
			finalSurvivingRefs.add(memberEl.getAttribute('ref'));
		}

		// ── 5. Nodes to delete ────────────────────────────────────────────────
		let nodesToDelete = new Set();
		for (let wid of deletedWayIds) {
			for (let ref of (domWayNodeRefs.get(wid) || [])) {
				if (!finalSurvivingRefs.has(ref)) nodesToDelete.add(ref);
			}
		}

		// ── 6. Next available IDs ─────────────────────────────────────────────
		let maxNodeId = 0, maxWayId = 0;
		for (let el of doc.querySelectorAll('node')) {
			let id = parseInt(el.getAttribute('id'));
			if (id > 0 && id > maxNodeId) maxNodeId = id;
		}
		for (let el of doc.querySelectorAll('way')) {
			let id = parseInt(el.getAttribute('id'));
			if (id > 0 && id > maxWayId) maxWayId = id;
		}
		let nextNodeId = maxNodeId + 1;
		let nextWayId  = maxWayId  + 1;

		// ── 7. Assign IDs to brand-new points inside existing ways ────────────
		let newPointNodeIds = new Map();  // point object → nodeId
		for (let [, ls] of importedWays) {
			for (let pt of ls.points) {
				if (pt._osmNodeId == null) newPointNodeIds.set(pt, nextNodeId++);
			}
		}

		// ── 8. Insert DOM <node> elements for those new points ────────────────
		let firstWayEl = osmEl.querySelector('way');
		for (let [pt, nid] of newPointNodeIds) {
			let nodeEl = OSMPatcher._createNodeEl(
				doc, nid, pt._osmLat, pt._osmLon, pt.position, pt._osmNodeTags, inner, outer
			);
			OSMPatcher._insertBefore(doc, osmEl, nodeEl, firstWayEl, outer);
		}

		// ── 9. Update existing ways and their nodes ───────────────────────────
		for (let [wayId, ls] of importedWays) {
			let wayEl = doc.querySelector(`way[id="${wayId}"]`);
			if (!wayEl) continue;

			OSMPatcher._rebuildWay(doc, wayEl, ls, newPointNodeIds, inner, outer);

			for (let pt of ls.points) {
				if (pt._osmNodeId == null) continue;
				let nodeEl = doc.querySelector(`node[id="${pt._osmNodeId}"]`);
				if (nodeEl) OSMPatcher._setPositionTags(doc, nodeEl, pt.position, inner, outer);
			}
		}

		// ── 10. Remove deleted ways and their orphaned nodes ──────────────────
		for (let wid of deletedWayIds) {
			let wayEl = doc.querySelector(`way[id="${wid}"]`);
			if (wayEl) OSMPatcher._removeWithIndent(osmEl, wayEl);
		}
		for (let nid of nodesToDelete) {
			let nodeEl = doc.querySelector(`node[id="${nid}"]`);
			if (nodeEl) OSMPatcher._removeWithIndent(osmEl, nodeEl);
		}

		// ── 11. Append brand-new linestrings (drawn after import) ─────────────
		for (let ls of newLineStrings) {
			let wayNodeIds = [];
			for (let pt of ls.points) {
				let nid = nextNodeId++;
				wayNodeIds.push(nid);
				let nodeEl = OSMPatcher._createNodeEl(
					doc, nid, pt._osmLat, pt._osmLon, pt.position, pt._osmNodeTags, inner, outer
				);
				osmEl.appendChild(doc.createTextNode('\n' + outer));
				osmEl.appendChild(nodeEl);
			}

			let wayEl = doc.createElement('way');
			wayEl.setAttribute('id', String(nextWayId++));
			for (let nid of wayNodeIds) {
				wayEl.appendChild(doc.createTextNode('\n' + inner));
				let ndEl = doc.createElement('nd');
				ndEl.setAttribute('ref', String(nid));
				wayEl.appendChild(ndEl);
			}
			if (ls.closed && wayNodeIds.length > 0) wayNodeIds.push(wayNodeIds[0]);
			let wayTags = Object.assign({}, ls._wayTags || {});
			if (ls.name && !wayTags['name']) wayTags['name'] = ls.name;
			for (let k in wayTags) {
				wayEl.appendChild(doc.createTextNode('\n' + inner));
				let tagEl = doc.createElement('tag');
				tagEl.setAttribute('k', k);
				tagEl.setAttribute('v', wayTags[k]);
				wayEl.appendChild(tagEl);
			}
			if (wayNodeIds.length > 0 || Object.keys(wayTags).length > 0) {
				wayEl.appendChild(doc.createTextNode('\n' + outer));
			}
			osmEl.appendChild(doc.createTextNode('\n' + outer));
			osmEl.appendChild(wayEl);
		}

		// ── 12. Serialise ─────────────────────────────────────────────────────
		let xml = new XMLSerializer().serializeToString(doc);
		// Remove spurious empty-namespace declarations some browsers add.
		xml = xml.replace(/ xmlns=""/g, '');
		return xml;
	}
}
