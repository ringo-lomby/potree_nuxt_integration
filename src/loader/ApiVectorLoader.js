import * as THREE from "../../libs/three.js/build/three.module.js";
import { Line2 } from "../../libs/three.js/lines/Line2.js";
import { LineGeometry } from "../../libs/three.js/lines/LineGeometry.js";
import { LineMaterial } from "../../libs/three.js/lines/LineMaterial.js";

const defaultColors = {
  roads: [1.0, 1.0, 0.0],
  waterways: [0.0, 0.0, 1.0],
  landuse: [0.5, 0.5, 0.5],
  points: [0.0, 1.0, 1.0],
  default: [0.9, 0.6, 0.1],
  mrm_area: [0.6, 0.8, 1.0],
};

function getColor(type) {
  return defaultColors[type] || defaultColors.default;
}

export class ApiVector {
  constructor() {
    this.path = null;
    this.node = null;
  }
}

export class ApiVectorLoader {
  static async loadUrl(url, params = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params), // optional, only if server expects payload
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const json = await response.json();
    const features = json.res_vectormap || [];
    return ApiVectorLoader.loadFeatures(features, params);
  }

  static async loadFeatures(features, params = {}) {
    const rootNode = new THREE.Object3D();
    rootNode.name = params.source || "ApiVectors";

    const layer = new ApiVector();
    layer.node = rootNode;
    layer.path = params.source || "Api";

    for (const feature of features) {
      const geomType = feature.geometry.type;
      const coords = feature.geometry.coordinates;
      const color = getColor(feature.properties.type);

      const matLine = new LineMaterial({
        color: new THREE.Color().setRGB(...color),
        linewidth: params.linewidth || 2,
        resolution: new THREE.Vector2(1000, 1000),
        dashed: false,
      });

      let object = null;

      if (geomType === "LineString" && !feature.properties.type) {
        object = ApiVectorLoader.createLine(coords, matLine); // no transform
      } else if (
        geomType === "LineString" &&
        feature.properties.type === "mrm_area"
      ) {
        debugger;
        object = ApiVectorLoader.createPolygon(coords, matLine); // no transform
      } else if (geomType === "Point") {
        object = ApiVectorLoader.createPoint(coords, matLine); // no transform
      }

      if (object) rootNode.add(object);
    }

    return layer;
  }

  static createLine(coords, matLine) {
    if (!coords.length) return null;
    const positions = [];
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);

    for (let i = 0; i < coords.length; i++) {
      const [x, y, z = 0] = coords[i];
      min.x = Math.min(min.x, x);
      min.y = Math.min(min.y, y);
      min.z = Math.min(min.z, z);
      positions.push(x, y, z);
      if (i > 0 && i < coords.length - 1) positions.push(x, y, z);
    }

    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 0] -= min.x;
      positions[i + 1] -= min.y;
      positions[i + 2] -= min.z;
    }

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const line = new Line2(geometry, matLine);
    line.computeLineDistances();
    line.scale.set(1, 1, 1);
    line.position.copy(min);

    return line;
  }

  static createPolygon(rings, matLine) {
    const group = new THREE.Object3D();

    if (rings.length && typeof rings[0][0] === "number") {
      rings = [rings];
    }

    for (const ring of rings) {
      const closedRing = [...ring];
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (
        first[0] !== last[0] ||
        first[1] !== last[1] ||
        first[2] !== last[2]
      ) {
        closedRing.push(first);
      }

      const line = ApiVectorLoader.createLine(closedRing, matLine);
      if (line) group.add(line);

      const shape = new THREE.Shape();
      shape.moveTo(closedRing[0][0], closedRing[0][1]);
      for (let i = 1; i < closedRing.length; i++) {
        shape.lineTo(closedRing[i][0], closedRing[i][1]);
      }

      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color: matLine.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
      });
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.z = closedRing[0][2] || 0;

      group.add(mesh);
    }

    return group;
  }

  static createPoint(coord, matLine) {
    const [x, y, z = 0] = coord;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(2, 16, 16),
      new THREE.MeshBasicMaterial({ color: matLine.color })
    );
    mesh.position.set(x, y, z);
    return mesh;
  }
}
