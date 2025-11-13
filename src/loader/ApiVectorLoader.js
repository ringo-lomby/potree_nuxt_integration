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

  static async loadGeoJson(vectormap) {
    const features = vectormap || [];
    return ApiVectorLoader.loadFeatures(features, {});
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

      const matNode = new THREE.MeshBasicMaterial({
        color: 0x0000ff,
        transparent: true,
        opacity: 0.5,
      });

      const matLine = new LineMaterial({
        color: new THREE.Color().setRGB(...color),
        linewidth: params.linewidth || 8,
        resolution: new THREE.Vector2(1000, 1000),
        dashed: false,
      });

      let object = null;

      if (geomType === "LineString") {
        object = ApiVectorLoader.createLineWithNodes(coords, matLine, matNode);
      } else if (geomType === "Polygon") {
        object = ApiVectorLoader.createPolygon(coords, matLine, matNode);
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

  static createLineWithNodes(
    coords,
    matLine,
    nodeColor = 0x0000ff,
    nodeSize = 0.3
  ) {
    const group = new THREE.Group();
    group.type = "LineString";

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    coords.forEach(([x, y, z = 0]) => {
      min.x = Math.min(min.x, x);
      min.y = Math.min(min.y, y);
      min.z = Math.min(min.z, z);
    });

    const relPositions = new Float32Array(coords.length * 3);
    coords.forEach(([x, y, z = 0], i) => {
      relPositions[i * 3] = x - min.x;
      relPositions[i * 3 + 1] = y - min.y;
      relPositions[i * 3 + 2] = z - min.z;
    });

    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(relPositions);
    const line = new Line2(lineGeometry, matLine);
    line.computeLineDistances();
    group.add(line);

    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(relPositions, 3)
    );

    const canvas = document.createElement("canvas");
    const texSize = 16;
    canvas.width = texSize;
    canvas.height = texSize;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, texSize, texSize);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(
      texSize / 2,
      texSize / 2,
      (texSize / 2) * (nodeSize / 0.5),
      0,
      Math.PI * 2
    );
    ctx.fill();
    const circleTexture = new THREE.CanvasTexture(canvas);
    circleTexture.needsUpdate = true;

    const pointsMaterial = new THREE.PointsMaterial({
      size: nodeSize,
      map: circleTexture,
      color: nodeColor,
      transparent: true,
      alphaTest: 0.5,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    points.name = "Nodes";
    points.frustumCulled = false; // keep nodes visible
    group.add(points);

    group.position.copy(min);

    const updateArray = new Float32Array(relPositions.length);
    group.userData.updateLineFromNodes = function () {
      const posAttr = points.geometry.getAttribute("position");
      for (let i = 0; i < posAttr.count; i++) {
        updateArray[i * 3] = posAttr.getX(i);
        updateArray[i * 3 + 1] = posAttr.getY(i);
        updateArray[i * 3 + 2] = posAttr.getZ(i);
      }
      line.geometry.setPositions(updateArray);
      line.geometry.computeBoundingBox();
      line.geometry.computeBoundingSphere();
      line.geometry.needsUpdate = true;
    };

    return group;
  }

  static createPolygon(coords, matLine, nodeColor = 0xffffff, nodeSize = 0.3) {
    const group = new THREE.Group();
    group.type = "Polygon";

    const closedCoords = [...coords];
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1] || first[2] !== last[2]) {
      closedCoords.push(first);
    }

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    closedCoords.forEach(([x, y, z = 0]) => {
      min.x = Math.min(min.x, x);
      min.y = Math.min(min.y, y);
      min.z = Math.min(min.z, z);
    });

    const localPositions = closedCoords.map(([x, y, z = 0]) => [
      x - min.x,
      y - min.y,
      z - min.z,
    ]);

    const contour = localPositions.map(([x, y]) => new THREE.Vector2(x, y));
    const indices = THREE.ShapeUtils.triangulateShape(contour, []);

    const flatPositions = localPositions.flat();
    const meshGeo = new THREE.BufferGeometry();
    meshGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(flatPositions, 3)
    );
    meshGeo.setIndex(indices.flat());
    meshGeo.computeVertexNormals();

    const meshMat = new THREE.MeshBasicMaterial({
      color: matLine.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });

    const mesh = new THREE.Mesh(meshGeo, meshMat);
    group.add(mesh);

    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(flatPositions, 3)
    );

    const texSize = 16; // smaller texture = faster
    const canvas = document.createElement("canvas");
    canvas.width = texSize;
    canvas.height = texSize;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, texSize, texSize);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    const radius = (texSize / 2) * (nodeSize / 0.5);
    ctx.arc(texSize / 2, texSize / 2, radius, 0, Math.PI * 2);
    ctx.fill();
    const circleTexture = new THREE.CanvasTexture(canvas);
    circleTexture.needsUpdate = true;

    const pointsMat = new THREE.PointsMaterial({
      size: nodeSize,
      map: circleTexture,
      color: nodeColor,
      transparent: true,
      alphaTest: 0.5,
      sizeAttenuation: true,
      depthWrite: false,
    });

    const points = new THREE.Points(pointsGeo, pointsMat);
    points.name = "Nodes";
    group.add(points);

    group.position.copy(min);

    group.userData.updateLineFromNodes = () => {
      const posAttr = points.geometry.getAttribute("position");
      const updated = [];
      const contour = [];

      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        updated.push(x, y, z);
        contour.push(new THREE.Vector2(x, y));
      }

      const newIndices = THREE.ShapeUtils.triangulateShape(contour, []);
      const newGeo = new THREE.BufferGeometry();
      newGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(updated, 3)
      );
      newGeo.setIndex(newIndices.flat());
      newGeo.computeVertexNormals();

      mesh.geometry.dispose();
      mesh.geometry = newGeo;
    };

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
