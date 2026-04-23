
import * as THREE from "../../libs/three.js/build/three.module.js";
import {DrawLineString} from "../utils/DrawLineString.js";

export class OSMImporter {

	static parse (osmXmlString) {
		let parser = new DOMParser();
		let doc = parser.parseFromString(osmXmlString, 'application/xml');

		// ── File-level metadata ───────────────────────────────────────────────
		let osmEl = doc.querySelector('osm');
		let generator = osmEl ? (osmEl.getAttribute('generator') || 'Potree') : 'Potree';

		// Capture every top-level element that is NOT <node> or <way> verbatim
		// from the raw string so we don't lose anything (e.g. <MetaInfo .../>).
		let topLevelElements = '';
		if (osmEl) {
			let osmOpenTag = osmXmlString.match(/<osm[^>]*>/);
			if (osmOpenTag) {
				let afterOsm = osmXmlString.indexOf(osmOpenTag[0]) + osmOpenTag[0].length;
				let firstNode = osmXmlString.indexOf('<node');
				let firstWay  = osmXmlString.indexOf('<way');
				let firstData = Math.min(
					firstNode >= 0 ? firstNode : Infinity,
					firstWay  >= 0 ? firstWay  : Infinity
				);
				if (firstData < Infinity && firstData > afterOsm) {
					topLevelElements = osmXmlString.substring(afterOsm, firstData).trim();
				}
			}
		}

		let fileMeta = { generator, topLevelElements };

		// ── Node lookup: id → position + original lat/lon + non-position tags ─
		let nodeLookup = {};
		for (let nodeEl of doc.querySelectorAll('node')) {
			let id  = nodeEl.getAttribute('id');
			let lat = nodeEl.getAttribute('lat');
			let lon = nodeEl.getAttribute('lon');

			let tags = {};
			for (let tag of nodeEl.querySelectorAll('tag')) {
				tags[tag.getAttribute('k')] = tag.getAttribute('v');
			}

			// Keep every tag except the three Potree position keys —
			// those will be updated with the current position on export.
			let preservedTags = {};
			for (let k in tags) {
				if (k !== 'local_x' && k !== 'local_y' && k !== 'ele') {
					preservedTags[k] = tags[k];
				}
			}

			nodeLookup[id] = {
				x: parseFloat(tags['local_x'] || 0),
				y: parseFloat(tags['local_y'] || 0),
				z: parseFloat(tags['ele']     || 0),
				lat,
				lon,
				preservedTags,
			};
		}

		// ── Ways ─────────────────────────────────────────────────────────────
		let ways = [];
		for (let wayEl of doc.querySelectorAll('way')) {
			let wayId = wayEl.getAttribute('id');

			let points   = [];
			let nodeIds  = [];
			let nodeLats = [];
			let nodeLons = [];
			let nodeTags = [];

			for (let nd of wayEl.querySelectorAll('nd')) {
				let ref  = nd.getAttribute('ref');
				let node = nodeLookup[ref];
				if (node) {
					points.push(new THREE.Vector3(node.x, node.y, node.z));
					nodeIds.push(ref);
					nodeLats.push(node.lat);
					nodeLons.push(node.lon);
					nodeTags.push(node.preservedTags);
				}
			}

			// Collect ALL original way tags — written back verbatim on export.
			let wayTags = {};
			for (let tag of wayEl.querySelectorAll('tag')) {
				wayTags[tag.getAttribute('k')] = tag.getAttribute('v');
			}

			if (points.length >= 2) {
				ways.push({
					id: wayId,
					name: wayTags['name'] || `Way_${wayId}`,
					points,
					nodeIds,
					nodeLats,
					nodeLons,
					nodeTags,
					wayTags,
				});
			}
		}

		return { ways, fileMeta };
	}

	static loadToScene (viewer, osmXmlString, options = {}) {
		let { ways, fileMeta } = OSMImporter.parse(osmXmlString);
		let color     = options.color     || 0x00ff00;
		let batchSize = options.batchSize || 30;
		let onProgress = options.onProgress || null;

		let linestrings = [];
		let index = 0;

		let promise = new Promise((resolve) => {
			function processBatch () {
				let end = Math.min(index + batchSize, ways.length);

				for (let i = index; i < end; i++) {
					let way = ways[i];
					let ls  = new DrawLineString();
					ls.name  = way.name;
					ls.color = new THREE.Color(color);

					// Attach all original OSM metadata so the exporter can
					// write it back without losing anything.
					ls._osmMeta = {
						wayId:    way.id,
						wayTags:  way.wayTags,   // ALL original tags, written verbatim
						fileMeta: fileMeta,       // shared across the whole import batch
					};

					for (let j = 0; j < way.points.length; j++) {
						ls.addMarker(way.points[j]);
						ls.points[j]._osmNodeId   = way.nodeIds[j];
						ls.points[j]._osmNodeTags = way.nodeTags[j];
						ls.points[j]._osmLat      = way.nodeLats[j];
						ls.points[j]._osmLon      = way.nodeLons[j];
					}

					viewer.scene.addDrawLineString(ls);
					linestrings.push(ls);
				}

				index = end;
				if (onProgress) onProgress(index, ways.length);

				if (index < ways.length) {
					requestAnimationFrame(processBatch);
				} else {
					resolve(linestrings);
				}
			}

			requestAnimationFrame(processBatch);
		});

		return { promise, wayCount: ways.length };
	}

	static async loadFromURL (viewer, url, options = {}) {
		let response = await fetch(url);
		let text = await response.text();
		return OSMImporter.loadToScene(viewer, text, options);
	}

	static loadFromFile (viewer, file, options = {}) {
		return new Promise((resolve, reject) => {
			let reader = new FileReader();
			reader.onload = (e) => {
				let result = OSMImporter.loadToScene(viewer, e.target.result, options);
				resolve(result);
			};
			reader.onerror = reject;
			reader.readAsText(file);
		});
	}
}
