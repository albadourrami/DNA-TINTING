// Finds a vehicle's windows and splits them into the studio's zones (windshield, front
// driver, …). Works on any model: explicit name mappings from the vehicle config, or
// 'auto' detection from glass-looking meshes.
//
// Coordinates: runs in the vehicle's "frame" (the centered, rotated pivot) where the car
// faces +Z, +Y is up, and the centerline is x = 0. The driver's side (US, left-hand
// drive) is therefore +X.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/+esm';

const GLASS_MATERIAL_RE = /glass|window|windshield|windscreen|screen|glazing/i;
const NOT_GLASS_RE = /gasket|wiper|mirror|light|lamp|lens|trim|frame|seal|chrome|rubber|handle|headlight|taillight|reflector/i;
const ROOF_RE = /roof|sun ?roof|panoram|moon/i;

const sanitize = (s) => THREE.PropertyBinding.sanitizeNodeName(s || '');
function matcher(patterns = []) {
  const res = patterns.flatMap((p) => {
    const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return [new RegExp(`^${esc(p)}$`, 'i'), new RegExp(`^${esc(sanitize(p))}$`, 'i')];
  });
  return (name) => !!name && res.some((r) => r.test(name));
}

const materialsOf = (mesh) => [].concat(mesh.material || []);

function looksLikeGlass(mesh, glassRe) {
  const names = `${mesh.name} ${materialsOf(mesh).map((m) => m.name).join(' ')}`;
  if (NOT_GLASS_RE.test(names)) return false;
  return materialsOf(mesh).some((m) =>
    glassRe.test(m.name) || GLASS_MATERIAL_RE.test(mesh.name) || m.transmission > 0 || (m.transparent && m.opacity < 0.95));
}

// ---------- Triangle analysis: split each mesh into connected pieces (= individual windows) ----------
function analyzeMesh(mesh, toFrame) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const index = geo.index ? geo.index.array : null;
  const triCount = index ? index.length / 3 : pos.count / 3;
  const vi = (t, k) => (index ? index[t * 3 + k] : t * 3 + k);

  // Union-find over vertices sharing a (quantized) position — UV seams split vertices,
  // so indices alone would break one window into many pieces.
  geo.computeBoundingBox();
  const q = Math.max(...geo.boundingBox.getSize(new THREE.Vector3()).toArray()) * 1e-4 || 1e-6;
  const keyOf = new Map();
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) / q)},${Math.round(pos.getY(i) / q)},${Math.round(pos.getZ(i) / q)}`;
    const j = keyOf.get(k);
    if (j === undefined) keyOf.set(k, i); else union(i, j);
  }
  for (let t = 0; t < triCount; t++) { union(vi(t, 0), vi(t, 1)); union(vi(t, 1), vi(t, 2)); }

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const pieces = new Map();
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, vi(t, 0)).applyMatrix4(toFrame);
    b.fromBufferAttribute(pos, vi(t, 1)).applyMatrix4(toFrame);
    c.fromBufferAttribute(pos, vi(t, 2)).applyMatrix4(toFrame);
    const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
    const root = find(vi(t, 0));
    let p = pieces.get(root);
    if (!p) { p = { mesh, tris: [], area: 0, centroid: new THREE.Vector3(), box: new THREE.Box3() }; pieces.set(root, p); }
    p.tris.push(t);
    p.area += area;
    p.centroid.addScaledVector(a.clone().add(b).add(c).divideScalar(3), area);
    p.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  }
  for (const p of pieces.values()) p.centroid.divideScalar(p.area || 1);
  return { mesh, pieces: [...pieces.values()].filter((p) => p.area > 0) };
}

// ---------- Classification ----------
function classifyAuto(pieces, vehicleBox) {
  const size = vehicleBox.getSize(new THREE.Vector3());
  const center = vehicleBox.getCenter(new THREE.Vector3());
  const out = new Map(); // piece → zoneId | 'roof'
  const sides = { driver: [], passenger: [] };
  for (const p of pieces) {
    const ps = p.box.getSize(new THREE.Vector3());
    const names = `${p.mesh.name} ${materialsOf(p.mesh).map((m) => m.name).join(' ')}`;
    if (ROOF_RE.test(names)) { out.set(p, 'roof'); continue; }
    const isSide = ps.x < size.x * 0.45 && Math.abs(p.centroid.x) > size.x * 0.18;
    if (isSide) (p.centroid.x > 0 ? sides.driver : sides.passenger).push(p);
    else out.set(p, p.centroid.z > center.z ? 'windshield' : 'rearWindow');
  }
  // Per side, the front-most window is the front door; everything behind it is "rear"
  // (rear door + quarter glass). A tiny piece in front of the door glass (fixed vent
  // window) is treated as part of the front door.
  for (const [side, list] of Object.entries(sides)) {
    list.sort((p, q) => q.centroid.z - p.centroid.z);
    const len = (p) => p.box.max.z - p.box.min.z;
    let frontCount = list.length ? 1 : 0;
    if (list.length > 2 && len(list[0]) < 0.35 * len(list[1])) frontCount = 2;
    list.forEach((p, i) => out.set(p, `${i < frontCount ? 'front' : 'rear'}${side === 'driver' ? 'Driver' : 'Passenger'}`));
  }
  return out;
}

function classifyExplicit(analyses, glassConfig) {
  const out = new Map();
  for (const [zoneId, def] of Object.entries(glassConfig)) {
    const byMesh = matcher(def.meshes || def.nodes || []);
    const byMat = matcher(def.materials || []);
    let pieces = analyses
      .filter(({ mesh }) => byMesh(mesh.name) || byMesh(mesh.parent?.name) || materialsOf(mesh).some((m) => byMat(m.name)))
      .flatMap((a) => a.pieces);
    if (def.side) pieces = pieces.filter((p) => (def.side === 'driver' ? p.centroid.x > 0 : p.centroid.x <= 0));
    if (def.part) {
      const zs = pieces.map((p) => p.centroid.z);
      const split = (Math.max(...zs) + Math.min(...zs)) / 2;
      pieces = pieces.filter((p) => (def.part === 'front' ? p.centroid.z >= split : p.centroid.z < split));
    }
    if (!pieces.length) console.warn(`[tint-studio] Glass zone "${zoneId}" matched no triangles — check its names in the vehicle config.`);
    for (const p of pieces) out.set(p, zoneId);
  }
  return out;
}

// Geometry that reuses the source attributes and only carries its own index buffer.
function subGeometry(src, tris) {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  const srcIndex = src.index ? src.index.array : null;
  const Arr = src.attributes.position.count > 65535 ? Uint32Array : Uint16Array;
  const idx = new Arr(tris.length * 3);
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) idx[i * 3 + k] = srcIndex ? srcIndex[t * 3 + k] : t * 3 + k;
  });
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * @param {THREE.Object3D} frame   pivot the model sits in (centered, rotated)
 * @param {THREE.Object3D} model   gltf.scene
 * @param {object} vehicle         vehicle config
 * @returns {{ zones: Map<string, THREE.Mesh[]>, otherGlass: THREE.Mesh[], report: object[] }}
 */
export function buildGlassZones(frame, model, vehicle) {
  frame.updateMatrixWorld(true);
  const inv = frame.matrixWorld.clone().invert();
  const vehicleBox = new THREE.Box3().setFromObject(model);
  vehicleBox.applyMatrix4(inv);

  const glassRe = vehicle.glassMaterials ? new RegExp(vehicle.glassMaterials, 'i') : GLASS_MATERIAL_RE;
  const auto = vehicle.glass === 'auto' || !vehicle.glass;
  // The windshield isn't a tintable window, but the viewer needs it (factory glass + strip),
  // so it's resolved like one under the internal id 'windshield'.
  const glassConfig = auto ? null : { ...vehicle.glass, ...(vehicle.windshield?.meshes || vehicle.windshield?.materials ? { windshield: vehicle.windshield } : {}) };
  const explicitMesh = auto ? null : matcher(Object.values(glassConfig).flatMap((d) => d.meshes || d.nodes || []));
  const explicitMat = auto ? null : matcher(Object.values(glassConfig).flatMap((d) => d.materials || []));

  const candidates = [];
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes.position) return;
    const picked = auto
      ? looksLikeGlass(o, glassRe)
      : explicitMesh(o.name) || explicitMesh(o.parent?.name) || materialsOf(o).some((m) => explicitMat(m.name));
    if (picked) candidates.push(o);
  });

  const analyses = candidates.map((mesh) => analyzeMesh(mesh, inv.clone().multiply(mesh.matrixWorld)));
  const allPieces = analyses.flatMap((a) => a.pieces);
  const assignment = auto ? classifyAuto(allPieces, vehicleBox) : classifyExplicit(analyses, glassConfig);

  const zones = new Map();
  const otherGlass = [];
  const report = [];
  for (const { mesh, pieces } of analyses) {
    // Group this mesh's triangles by zone.
    const byZone = new Map();
    for (const p of pieces) {
      const z = assignment.get(p) || null;
      if (!byZone.has(z)) byZone.set(z, []);
      byZone.get(z).push(...p.tris);
      report.push({
        mesh: mesh.name, material: materialsOf(mesh).map((m) => m.name).join(','), zone: z || '(none)',
        x: +p.centroid.x.toFixed(2), y: +p.centroid.y.toFixed(2), z: +p.centroid.z.toFixed(2), tris: p.tris.length,
      });
    }
    const add = (zone, m) => {
      m.castShadow = false;
      m.receiveShadow = false;
      if (zone && zone !== 'roof') {
        if (!zones.has(zone)) zones.set(zone, []);
        zones.get(zone).push(m);
      } else otherGlass.push(m);
    };
    if (byZone.size === 1) { add([...byZone.keys()][0], mesh); continue; } // whole mesh → one zone

    // Several windows in one mesh: replace it with one sub-mesh per zone (shared vertex data).
    for (const [zone, tris] of byZone) {
      const part = new THREE.Mesh(subGeometry(mesh.geometry, tris), mesh.material);
      part.name = `${mesh.name}__${zone || 'other'}`;
      part.position.copy(mesh.position);
      part.quaternion.copy(mesh.quaternion);
      part.scale.copy(mesh.scale);
      part.renderOrder = mesh.renderOrder;
      mesh.parent.add(part);
      add(zone, part);
    }
    mesh.visible = false;
  }
  return { zones, otherGlass, report };
}
