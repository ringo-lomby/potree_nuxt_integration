
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

	// Build a spatial grid index of world-space XYZ points from the root and
	// level-1 children of every loaded point cloud. The grid enables O(1)
	// amortized nearest-neighbour elevation queries instead of a brute-force
	// linear scan.
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

		if (!buf.length) return null;

		const points = new Float32Array(buf);

		// Find XY bounding box.
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (let i = 0; i < points.length; i += 3) {
			if (points[i]     < minX) minX = points[i];
			if (points[i]     > maxX) maxX = points[i];
			if (points[i + 1] < minY) minY = points[i + 1];
			if (points[i + 1] > maxY) maxY = points[i + 1];
		}

		const GRID  = 128;
		const cellW = (maxX - minX) / GRID || 1;
		const cellH = (maxY - minY) / GRID || 1;
		const grid  = new Array(GRID * GRID);
		for (let i = 0; i < grid.length; i++) grid[i] = [];

		for (let i = 0; i < points.length; i += 3) {
			let cx = Math.min(Math.floor((points[i]     - minX) / cellW), GRID - 1);
			let cy = Math.min(Math.floor((points[i + 1] - minY) / cellH), GRID - 1);
			grid[cy * GRID + cx].push(i);
		}

		return { points, grid, minX, minY, cellW, cellH, GRID };
	}

	// Query the spatial grid for the Z of the nearest XY point.
	// Expands outward ring by ring and exits as soon as no closer point is possible.
	static _queryElevation (index, x, y) {
		if (!index) return null;

		const { points, grid, minX, minY, cellW, cellH, GRID } = index;

		let cx = Math.max(0, Math.min(GRID - 1, Math.floor((x - minX) / cellW)));
		let cy = Math.max(0, Math.min(GRID - 1, Math.floor((y - minY) / cellH)));

		let closestSq = Infinity;
		let closestZ  = null;

		for (let r = 0; r <= GRID; r++) {
			// Once we have a candidate, stop expanding if the nearest possible
			// point in ring r is already farther away.
			if (r > 0 && closestZ !== null) {
				let minRingDist = (r - 1) * Math.min(cellW, cellH);
				if (minRingDist * minRingDist > closestSq) break;
			}

			let gx0 = Math.max(0, cx - r), gx1 = Math.min(GRID - 1, cx + r);
			let gy0 = Math.max(0, cy - r), gy1 = Math.min(GRID - 1, cy + r);

			for (let gy = gy0; gy <= gy1; gy++) {
				for (let gx = gx0; gx <= gx1; gx++) {
					// Skip interior cells already visited in a smaller ring.
					if (r > 0 && gx > gx0 && gx < gx1 && gy > gy0 && gy < gy1) continue;

					let cell = grid[gy * GRID + gx];
					for (let k = 0; k < cell.length; k++) {
						let i  = cell[k];
						let dx = points[i]     - x;
						let dy = points[i + 1] - y;
						let sq = dx * dx + dy * dy;
						if (sq < closestSq) { closestSq = sq; closestZ = points[i + 2]; }
					}
				}
			}

			if (r === 0 && closestZ !== null) break;
		}

		return closestZ;
	}

	// ── Scene loader ──────────────────────────────────────────────────────────

	static async loadToScene (viewer, osmXmlString, options = {}) {
		let { ways, fileMeta } = OSMImporter.parse(osmXmlString);
		let color           = options.color           || 0x00ff00;
		let onProgress      = options.onProgress      || null;
		let elevationOffset = (options.elevationOffset != null) ? options.elevationOffset : 8;

		const BATCH = 100;

		// Pre-compute local XY for nodes that lack local_x/y tags.
		for (let wi = 0; wi < ways.length; wi++) {
			let way = ways[wi];
			for (let j = 0; j < way.points.length; j++) {
				if (!way.nodeHasLocalXY[j]) {
					let { x, y } = OSMImporter._latLonToLocal(viewer, way.nodeLats[j], way.nodeLons[j]);
					way.points[j].x = x;
					way.points[j].y = y;
				}
			}
		}

		let elevIndex = null;
		if (ways.some(w => w.nodeHasEle.some(v => !v))) {
			elevIndex = OSMImporter._buildElevationIndex(viewer);
		}

		let linestrings = [];

		for (let wi = 0; wi < ways.length; wi++) {
			let way = ways[wi];
			let ls  = new DrawLineString();
			ls.name  = way.name;
			ls.color.setHex(color);

			ls._osmMeta = { wayId: way.id, wayTags: way.wayTags, fileMeta };
			ls._wayTags = way.wayTags;

			for (let j = 0; j < way.points.length; j++) {
				ls.points.push({
					position:     way.points[j],
					_osmNodeId:   way.nodeIds[j],
					_osmNodeTags: way.nodeTags[j],
					_osmLat:      way.nodeLats[j],
					_osmLon:      way.nodeLons[j],
				});
			}
			ls._boundingBoxDirty = true;

			if (elevIndex) {
				for (let j = 0; j < ls.points.length; j++) {
					if (!way.nodeHasEle[j]) {
						let p = ls.points[j].position;
						let z = OSMImporter._queryElevation(elevIndex, p.x, p.y);
						if (z !== null) p.z = z + elevationOffset;
					}
				}
			}

			ls._geometryDirty = true;
			linestrings.push(ls);
			viewer.scene.addDrawLineString(ls);

			// Yield to the event loop every BATCH ways so the UI stays responsive
			// and progress updates are visible.
			if ((wi + 1) % BATCH === 0) {
				if (onProgress) onProgress(wi + 1, ways.length);
				await new Promise(r => setTimeout(r, 0));
			}
		}

		if (onProgress) onProgress(ways.length, ways.length);

		return { linestrings, wayCount: ways.length };
	}

	static async loadFromURL (viewer, url, options = {}) {
		let response = await fetch(url);
		let text = await response.text();
		return OSMImporter.loadToScene(viewer, text, options);
	}

	static loadFromFile (viewer, file, options = {}) {
		return new Promise((resolve, reject) => {
			let reader = new FileReader();
			reader.onload = async (e) => {
				try {
					let result = await OSMImporter.loadToScene(viewer, e.target.result, options);
					resolve(result);
				} catch (err) {
					reject(err);
				}
			};
			reader.onerror = reject;
			reader.readAsText(file);
		});
	}
}
