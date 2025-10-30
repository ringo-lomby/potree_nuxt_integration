import * as THREE from "../../libs/three.js/build/three.module.js";
import { Line2 } from "../../libs/three.js/lines/Line2.js";
import { LineGeometry } from "../../libs/three.js/lines/LineGeometry.js";
import { LineMaterial } from "../../libs/three.js/lines/LineMaterial.js";

const defaultColors = {
  roads: [1.0, 1.0, 0.0],
  waterways: [0.0, 0.0, 1.0],
  landuse: [0.5, 0.5, 0.5],
  points: [0.0, 1.0, 1.0],
  mrm_area: [0.6, 0.8, 1.0],
  detection_area: [0.6, 0.8, 1.0],
  default: [0.9, 0.6, 0.1],
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
      body: JSON.stringify(params),
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

      const matNode = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.5 });
      
      const matLine = new LineMaterial({
        color: new THREE.Color().setRGB(...color),
        linewidth: params.linewidth || 2,
        resolution: new THREE.Vector2(1000, 1000),
        dashed: false,
      });

      let object = null;

      if (geomType === "LineString") {
        object = ApiVectorLoader.createLineWithNodes(coords, matLine, matNode);
      } else if (geomType === "Polygon") {
        object = ApiVectorLoader.createPolygon(coords, matLine);
      } else if (geomType === "Point") {
        object = ApiVectorLoader.createPoint(coords, matLine);
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

  static createLineWithNodes(coords, matLine, nodeColor = 0x0000ff, nodeSize = 0.5) {
    const group = new THREE.Group();

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    coords.forEach(([x, y, z = 0]) => {
      min.x = Math.min(min.x, x);
      min.y = Math.min(min.y, y);
      min.z = Math.min(min.z, z);
    });

    const positions = [];
    coords.forEach(([x, y, z = 0]) => {
      positions.push(x - min.x, y - min.y, z - min.z);
    });
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(positions);
    const line = new Line2(lineGeometry, matLine);
    line.computeLineDistances();
    group.add(line);

    const pointsGeometry = new THREE.BufferGeometry();
    const pointsArray = new Float32Array(coords.length * 3);
    coords.forEach(([x, y, z = 0], i) => {
      pointsArray[i * 3 + 0] = x - min.x;
      pointsArray[i * 3 + 1] = y - min.y;
      pointsArray[i * 3 + 2] = z - min.z;
    });
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(pointsArray, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    const circleTexture = new THREE.CanvasTexture(canvas);

    const pointsMaterial = new THREE.PointsMaterial({
      size: nodeSize,
      map: circleTexture,
      color: nodeColor,
      alphaTest: 0.5,
      transparent: true,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    group.add(points);

    group.position.copy(min);

    return group;
  }


  static createPolygon(rings, matLine) {
    const group = new THREE.Object3D();

    if (rings.length && typeof rings[0][0] === "number") {
      rings = [rings];
    }

    for (const ring of rings) {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      ring.forEach(([x, y, z = 0]) => {
        min.x = Math.min(min.x, x);
        min.y = Math.min(min.y, y);
        min.z = Math.min(min.z, z);
      });

      const closedRing = [...ring];
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1] || first[2] !== last[2]) {
        closedRing.push(first);
      }

      const linePositions = [];
      closedRing.forEach(([x, y, z = 0]) => {
        linePositions.push(x - min.x, y - min.y, z - min.z);
      });
      const lineGeometry = new LineGeometry();
      lineGeometry.setPositions(linePositions);
      const line = new Line2(lineGeometry, matLine);
      line.computeLineDistances();
      group.add(line);

      const shape = new THREE.Shape();
      shape.moveTo(closedRing[0][0] - min.x, closedRing[0][1] - min.y);
      for (let i = 1; i < closedRing.length; i++) {
        shape.lineTo(closedRing[i][0] - min.x, closedRing[i][1] - min.y);
      }

      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color: matLine.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = closedRing[0][2] - min.z || 0;

      group.add(mesh);

      group.position.copy(min);
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
