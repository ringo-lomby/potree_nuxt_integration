
import * as THREE from "../../libs/three.js/build/three.module.js";
import {DrawLineString} from "../utils/DrawLineString.js";

export class OSMImporter {

	static parse (osmXmlString) {
		let parser = new DOMParser();
		let doc = parser.parseFromString(osmXmlString, 'application/xml');

		// build node lookup: id -> {x, y, z}
		let nodeLookup = {};
		let nodeElements = doc.querySelectorAll('node');
		for (let nodeEl of nodeElements) {
			let id = nodeEl.getAttribute('id');
			let tags = {};
			for (let tag of nodeEl.querySelectorAll('tag')) {
				tags[tag.getAttribute('k')] = tag.getAttribute('v');
			}

			nodeLookup[id] = {
				x: parseFloat(tags['local_x'] || 0),
				y: parseFloat(tags['local_y'] || 0),
				z: parseFloat(tags['ele'] || 0),
			};
		}

		// parse ways into linestring data
		let ways = [];
		let wayElements = doc.querySelectorAll('way');
		for (let wayEl of wayElements) {
			let wayId = wayEl.getAttribute('id');
			let ndRefs = wayEl.querySelectorAll('nd');
			let points = [];

			for (let nd of ndRefs) {
				let ref = nd.getAttribute('ref');
				let node = nodeLookup[ref];
				if (node) {
					points.push(new THREE.Vector3(node.x, node.y, node.z));
				}
			}

			let tags = {};
			for (let tag of wayEl.querySelectorAll('tag')) {
				tags[tag.getAttribute('k')] = tag.getAttribute('v');
			}

			if (points.length >= 2) {
				ways.push({
					id: wayId,
					name: tags['name'] || `Way_${wayId}`,
					points: points,
					tags: tags,
				});
			}
		}

		return ways;
	}

	static loadToScene (viewer, osmXmlString, options = {}) {
		let ways = OSMImporter.parse(osmXmlString);
		let color = options.color || 0x00ff00;
		let batchSize = options.batchSize || 30;
		let onProgress = options.onProgress || null;

		let linestrings = [];
		let index = 0;

		let promise = new Promise((resolve) => {
			function processBatch () {
				let end = Math.min(index + batchSize, ways.length);

				for (let i = index; i < end; i++) {
					let way = ways[i];
					let ls = new DrawLineString();
					ls.name = way.name;
					ls.color = new THREE.Color(color);

					for (let point of way.points) {
						ls.addMarker(point);
					}

					viewer.scene.addDrawLineString(ls);
					linestrings.push(ls);
				}

				index = end;

				if (onProgress) {
					onProgress(index, ways.length);
				}

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
