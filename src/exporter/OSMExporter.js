
import {DrawLineString} from "../utils/DrawLineString.js";
import {Measure} from "../utils/Measure.js";

export class OSMExporter {

	static toOSM (items) {
		if (!(items instanceof Array)) {
			items = [items];
		}

		// ── File-level metadata ───────────────────────────────────────────────
		// Use the first linestring that carries import metadata (same for the
		// whole file since fileMeta is shared across the import batch).
		let fileMeta = null;
		for (let item of items) {
			if (item instanceof DrawLineString &&
				item._osmMeta && item._osmMeta.fileMeta) {
				fileMeta = item._osmMeta.fileMeta;
				break;
			}
		}
		let generator = fileMeta ? fileMeta.generator : 'Potree';

		// ── Collect nodes and ways ────────────────────────────────────────────
		// Find the highest existing positive ID so new IDs don't go negative.
		let maxNodeId = 0;
		let maxWayId  = 0;
		for (let item of items) {
			if (item instanceof DrawLineString) {
				for (let point of item.points) {
					if (point._osmNodeId != null && point._osmNodeId > maxNodeId) {
						maxNodeId = point._osmNodeId;
					}
				}
				if (item._osmMeta && item._osmMeta.wayId != null && item._osmMeta.wayId > maxWayId) {
					maxWayId = item._osmMeta.wayId;
				}
			}
		}
		let newNodeId = maxNodeId + 1;
		let newWayId  = maxWayId  + 1;
		let allNodes  = [];
		let allWays   = [];

		for (let item of items) {
			if (item instanceof DrawLineString && item.points.length >= 2) {
				let wayNodeIds = [];

				for (let point of item.points) {
					let pos = point.position;

					// Original node → keep its ID and lat/lon.
					// New node (added in Potree) → mint a fresh negative ID.
					let nid = (point._osmNodeId != null) ? point._osmNodeId : newNodeId++;
					let lat = (point._osmLat    != null) ? point._osmLat    : '0';
					let lon = (point._osmLon    != null) ? point._osmLon    : '0';

					wayNodeIds.push(nid);
					allNodes.push({
						id:            nid,
						lat,
						lon,
						x:             pos.x,
						y:             pos.y,
						z:             pos.z,
						preservedTags: point._osmNodeTags || {},
					});
				}

				// Original way → reuse its ID and write back ALL original tags
				// exactly as they were. No tags are added or removed.
				let wayId   = (item._osmMeta != null) ? item._osmMeta.wayId : newWayId++;
				let wayTags = item._wayTags || (item._osmMeta != null ? item._osmMeta.wayTags : {});

				allWays.push({ id: wayId, nodeIds: wayNodeIds, tags: wayTags });

			} else if (item instanceof Measure &&
				!item.closed && item.points.length >= 2) {

				let wayNodeIds = [];
				for (let point of item.points) {
					let nid = newNodeId++;
					wayNodeIds.push(nid);
					allNodes.push({
						id: nid, lat: '0', lon: '0',
						x: point.position.x,
						y: point.position.y,
						z: point.position.z,
						preservedTags: {},
					});
				}
				allWays.push({
					id: newWayId++,
					nodeIds: wayNodeIds,
					tags: { name: item.name },
				});
			}
		}

		// ── Serialise ─────────────────────────────────────────────────────────
		let lines = [];
		lines.push('<?xml version="1.0" encoding="UTF-8"?>');
		lines.push(`<osm generator="${generator}">`);

		// Write back any top-level custom elements (e.g. <MetaInfo .../>)
		if (fileMeta && fileMeta.topLevelElements) {
			lines.push('  ' + fileMeta.topLevelElements);
		}

		for (let node of allNodes) {
			lines.push(`  <node id="${node.id}" lat="${node.lat}" lon="${node.lon}">`);
			// Update the three position tags with the current Potree values
			lines.push(`    <tag k="local_x" v="${node.x.toFixed(4)}"/>`);
			lines.push(`    <tag k="local_y" v="${node.y.toFixed(4)}"/>`);
			lines.push(`    <tag k="ele"     v="${node.z.toFixed(4)}"/>`);
			// All other original node tags, untouched
			for (let k in node.preservedTags) {
				lines.push(`    <tag k="${k}" v="${node.preservedTags[k]}"/>`);
			}
			lines.push(`  </node>`);
		}

		for (let way of allWays) {
			lines.push(`  <way id="${way.id}">`);
			for (let nid of way.nodeIds) {
				lines.push(`    <nd ref="${nid}"/>`);
			}
			// Write ALL original way tags verbatim — nothing added, nothing removed
			for (let k in way.tags) {
				lines.push(`    <tag k="${k}" v="${way.tags[k]}"/>`);
			}
			lines.push(`  </way>`);
		}

		lines.push('</osm>');

		return lines.join('\n');
	}
}
