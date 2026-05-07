
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

			let hasLocalXY = ('local_x' in tags) && ('local_y' in tags);
			let hasEle     = 'ele' in tags;

			nodeLookup[id] = {
				x: hasLocalXY ? parseFloat(tags['local_x']) : 0,
				y: hasLocalXY ? parseFloat(tags['local_y']) : 0,
				z: hasEle     ? parseFloat(tags['ele'])     : 0,
				lat,
				lon,
				hasLocalXY,
				hasEle,
				preservedTags,
			};
		}

		// ── Ways ─────────────────────────────────────────────────────────────
		let ways = [];
		for (let wayEl of doc.querySelectorAll('way')) {
			let wayId = wayEl.getAttribute('id');

			let points        = [];
			let nodeIds       = [];
			let nodeLats      = [];
			let nodeLons      = [];
			let nodeTags      = [];
			let nodeHasLocalXY = [];
			let nodeHasEle    = [];

			for (let nd of wayEl.querySelectorAll('nd')) {
				let ref  = nd.getAttribute('ref');
				let node = nodeLookup[ref];
				if (node) {
					points.push(new THREE.Vector3(node.x, node.y, node.z));
					nodeIds.push(ref);
					nodeLats.push(node.lat);
					nodeLons.push(node.lon);
					nodeTags.push(node.preservedTags);
					nodeHasLocalXY.push(node.hasLocalXY);
					nodeHasEle.push(node.hasEle);
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
					nodeHasLocalXY,
					nodeHasEle,
					wayTags,
				});
			}
		}

		return { ways, fileMeta };
	}

	// ── Coordinate helpers ────────────────────────────────────────────────────

	// Convert lat/lon (degrees) to local XY using the viewer's projection.
	// Falls back to UTM → MGRS 100 km-square coordinates if no projection is
	// set on the viewer (matches the local_x / local_y encoding used by this
	// project: easting/northing within the MGRS 100 km grid square).
	static _latLonToLocal (viewer, lat, lon) {
		lat = parseFloat(lat);
		lon = parseFloat(lon);
		if (isNaN(lat) || isNaN(lon)) return { x: 0, y: 0 };

		// Primary: use the point-cloud projection already registered on viewer.
		try {
			let projection = viewer && viewer.getProjection ? viewer.getProjection() : null;
			if (projection) {
				/* global proj4 */
				proj4.defs('_wgs84_osm', '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs');
				proj4.defs('_pc_osm',    projection);
				let [x, y] = proj4('_wgs84_osm', '_pc_osm', [lon, lat]);
				if (isFinite(x) && isFinite(y)) return { x, y };
			}
		} catch (_) {}

		// Fallback: UTM → extract easting/northing within the MGRS 100 km square.
		// This matches the local_x / local_y values used by files from this project.
		try {
			let zone  = Math.floor((lon + 180) / 6) + 1;
			let south = lat < 0;
			let utmProj = `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
			let [utmE, utmN] = proj4('+proj=longlat +datum=WGS84', utmProj, [lon, lat]);
			return {
				x: ((utmE % 100000) + 100000) % 100000,
				y: ((utmN % 100000) + 100000) % 100000,
			};
		} catch (_) {}

		return { x: 0, y: 0 };
	}

	// Build a flat Float32Array of world-space [x, y, z, x, y, z, …] from the
	// root node of every loaded point cloud. Only the root is sampled for
	// performance; it contains a representative spread of the full cloud.
	static _buildElevationIndex (viewer) {
		if (!viewer || !viewer.scene || !viewer.scene.pointclouds || !viewer.scene.pointclouds.length) return null;

		let buf = [];
		let tmp = new THREE.Vector3();

		for (let pc of viewer.scene.pointclouds) {
			// Sample root + all level-1 children for better spatial coverage.
			let nodes = [];
			if (pc.root) {
				nodes.push(pc.root);
				if (pc.root.children) {
					for (let ci = 0; ci < pc.root.children.length; ci++) {
						if (pc.root.children[ci]) nodes.push(pc.root.children[ci]);
					}
				}
			}

			// pc.matrixWorld is reliable at import time; sceneNode.matrixWorld
			// may not be computed yet (before the first render frame).
			let mat = pc.matrixWorld || null;

			for (let ni = 0; ni < nodes.length; ni++) {
				let node = nodes[ni];
				if (!node.geometryNode || !node.geometryNode.geometry) continue;
				let posAttr = node.geometryNode.geometry.attributes.position;
				if (!posAttr || !posAttr.array) continue;

				let arr = posAttr.array;
				for (let i = 0; i < arr.length; i += 3) {
					tmp.set(arr[i], arr[i + 1], arr[i + 2]);
					if (mat) tmp.applyMatrix4(mat);
					buf.push(tmp.x, tmp.y, tmp.z);
				}
			}
		}

		return buf.length ? new Float32Array(buf) : null;
	}

	// Query the pre-built elevation index for the Z of the nearest XY point.
	static _queryElevation (index, x, y) {
		if (!index || index.length === 0) return null;
		let closestSq = Infinity;
		let closestZ  = null;
		for (let i = 0; i < index.length; i += 3) {
			let dx = index[i]     - x;
			let dy = index[i + 1] - y;
			let sq = dx * dx + dy * dy;
			if (sq < closestSq) {
				closestSq = sq;
				closestZ  = index[i + 2];
			}
		}
		return closestZ;
	}

	// ── Scene loader ──────────────────────────────────────────────────────────

	static loadToScene (viewer, osmXmlString, options = {}) {
		let { ways, fileMeta } = OSMImporter.parse(osmXmlString);
		let color           = options.color           || 0x00ff00;
		let batchSize       = options.batchSize       || 30;
		let onProgress      = options.onProgress      || null;
		let elevationOffset = (options.elevationOffset != null) ? options.elevationOffset : 8;

		// Build elevation index once — shared across all ways in this import.
		// Only built if at least one node is missing an ele tag.
		let elevIndex = null;
		let needsElev = ways.some(w => w.nodeHasEle.some(v => !v));
		if (needsElev) {
			elevIndex = OSMImporter._buildElevationIndex(viewer);
		}

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
						wayTags:  way.wayTags,
						fileMeta: fileMeta,
					};
					ls._wayTags = Object.assign({}, way.wayTags);

					for (let j = 0; j < way.points.length; j++) {
						let pos = way.points[j].clone();

						// ── Convert lat/lon to local XY if tags were absent ──
						if (!way.nodeHasLocalXY[j]) {
							let { x, y } = OSMImporter._latLonToLocal(
								viewer, way.nodeLats[j], way.nodeLons[j]
							);
							pos.x = x;
							pos.y = y;
						}

						ls.addMarker(pos);
						ls.points[j]._osmNodeId   = way.nodeIds[j];
						ls.points[j]._osmNodeTags = way.nodeTags[j];
						ls.points[j]._osmLat      = way.nodeLats[j];
						ls.points[j]._osmLon      = way.nodeLons[j];
					}

					// ── Fill missing elevation from closest PCD point ────────
					if (elevIndex) {
						let zChanged = false;
						for (let j = 0; j < ls.points.length; j++) {
							if (!way.nodeHasEle[j]) {
								let p = ls.points[j].position;
								let z = OSMImporter._queryElevation(elevIndex, p.x, p.y);
								if (z !== null) {
									p.z = z + elevationOffset;
									zChanged = true;
								}
							}
						}
						// Rebuild edge geometry so the lines follow the updated z values.
						// addMarker already called update() with z=0; we must force a rebuild.
						if (zChanged) {
							ls._geometryDirty = true;
							ls.update();
						}
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
