
import {DrawLineString} from "../utils/DrawLineString.js";
import {Measure} from "../utils/Measure.js";

export class OSMExporter {

	static toOSM (items) {
		if (!(items instanceof Array)) {
			items = [items];
		}

		// collect linestrings from DrawLineString and unclosed Measure objects
		let linestrings = [];
		for (let item of items) {
			if (item instanceof DrawLineString && item.points.length >= 2) {
				linestrings.push({
					name: item.name,
					points: item.points.map(p => p.position)
				});
			} else if (item instanceof Measure && !item.closed && item.points.length >= 2) {
				linestrings.push({
					name: item.name,
					points: item.points.map(p => p.position)
				});
			}
		}

		let nodeId = -1;
		let wayId = -1;
		let allNodes = [];
		let allWays = [];

		for (let ls of linestrings) {
			let wayNodeIds = [];

			for (let point of ls.points) {
				let nid = nodeId--;
				wayNodeIds.push(nid);

				allNodes.push({
					id: nid,
					x: point.x,
					y: point.y,
					z: point.z
				});
			}

			allWays.push({
				id: wayId--,
				name: ls.name,
				nodeIds: wayNodeIds
			});
		}

		let lines = [];
		lines.push('<?xml version="1.0" encoding="UTF-8"?>');
		lines.push('<osm generator="Potree">');

		for (let node of allNodes) {
			lines.push(`  <node id="${node.id}" lat="0" lon="0">`);
			lines.push(`    <tag k="local_x" v="${node.x.toFixed(4)}"/>`);
			lines.push(`    <tag k="local_y" v="${node.y.toFixed(4)}"/>`);
			lines.push(`    <tag k="ele" v="${node.z.toFixed(4)}"/>`);
			lines.push(`  </node>`);
		}

		for (let way of allWays) {
			lines.push(`  <way id="${way.id}">`);
			for (let nid of way.nodeIds) {
				lines.push(`    <nd ref="${nid}"/>`);
			}
			lines.push(`    <tag k="name" v="${way.name}"/>`);
			lines.push(`  </way>`);
		}

		lines.push('</osm>');

		return lines.join('\n');
	}
}
