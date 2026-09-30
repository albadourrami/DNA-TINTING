// Framework-agnostic helpers shared by the React viewer. Same behavior and config schema as
// viewer-template/viewer/viewer.js, so a model.config.js works in either template.
import * as THREE from 'three';

export const DEG = Math.PI / 180;

// GLTFLoader sanitizes node names (spaces → "_", strips []:./); material names stay raw.
// Patterns: exact names or * wildcards, case-insensitive, matched against both forms.
export function nameMatcher(patterns = []) {
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const res = patterns.map((p) => [new RegExp(`^${esc(p)}$`, 'i'), new RegExp(`^${esc(THREE.PropertyBinding.sanitizeNodeName(p))}$`, 'i')]);
  return (name) => !!name && res.some(([a, b]) => a.test(name) || b.test(name));
}

// Tinted glass without transmission (transmission = extra render pass, muddy on phones).
// visibleLight = fraction of light passing through (window film "VLT").
export function glassProps({ tint = '#0b0f14', visibleLight = 0.7, reflectivity = 1 }) {
  const vlt = THREE.MathUtils.clamp(visibleLight, 0, 1);
  return {
    color: tint, transmission: 0, metalness: 0, roughness: 0.04, transparent: true,
    opacity: THREE.MathUtils.lerp(0.97, 0.12, vlt), envMapIntensity: 1.1 * reflectivity,
    depthWrite: false, side: THREE.DoubleSide,
  };
}

export function applyMaterialProps(material, props) {
  const p = props.glass ? { ...glassProps(props.glass), ...props, glass: undefined } : props;
  for (const [key, value] of Object.entries(p)) {
    if (value === undefined || key === 'glass' || key === 'map') continue;
    const cur = material[key];
    if (cur && cur.isColor) cur.set(value);
    else if (key in material) material[key] = value;
  }
  if (p.opacity !== undefined && p.transparent === undefined) material.transparent = p.opacity < 1;
  material.needsUpdate = true;
}

/** Resolve a config.parts entry to meshes + materials (materials cloned when shared outside the part). */
export function resolvePart(root, partDef) {
  if (!partDef) return { meshes: [], materials: [] };
  const byMat = nameMatcher(partDef.materials);
  const byMesh = nameMatcher([...(partDef.meshes || []), ...(partDef.nodes || [])]);
  const meshes = new Set();
  const materials = new Set();
  root.traverse((o) => {
    if (byMesh(o.name)) o.traverse((c) => { if (c.isMesh) meshes.add(c); });
    if (!o.isMesh) return;
    for (const mat of [].concat(o.material)) if (byMat(mat.name)) { meshes.add(o); materials.add(mat); }
  });
  for (const mesh of meshes) {
    const next = [].concat(mesh.material).map((mat) => {
      if (materials.has(mat)) return mat;
      const clone = mat.clone();
      materials.add(clone);
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  }
  return { meshes: [...meshes], materials: [...materials] };
}

export const listVariants = (gltf) => gltf?.userData?.gltfExtensions?.KHR_materials_variants?.variants?.map((v) => v.name) ?? [];

/** KHR_materials_variants: swap every mapped primitive to the variant's material. */
export async function selectVariant(gltf, root, name) {
  const ext = gltf?.userData?.gltfExtensions?.KHR_materials_variants;
  if (!ext) return;
  const index = ext.variants.findIndex((v) => v.name === name);
  const jobs = [];
  root.traverse((o) => {
    const def = o.isMesh && o.userData.gltfExtensions?.KHR_materials_variants;
    if (!def) return;
    o.userData.originalMaterial ??= o.material;
    const mapping = def.mappings.find((m) => m.variants.includes(index));
    if (mapping) jobs.push(gltf.parser.getDependency('material', mapping.material).then((mat) => { o.material = mat; }));
    else o.material = o.userData.originalMaterial;
  });
  await Promise.all(jobs);
}

/** Camera distance at which `bounds` fills the frame from a view (box-based, handles portrait). */
export function fitDistance(bounds, camera, target, view, margin = 1.12) {
  const tanV = Math.tan((camera.fov * DEG) / 2);
  const tanH = tanV * camera.aspect;
  const eye = new THREE.Vector3().setFromSphericalCoords(1, (90 - (view.elevation ?? 15)) * DEG, (view.azimuth ?? 0) * DEG);
  const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  new THREE.Matrix4().lookAt(eye, new THREE.Vector3(), camera.up).extractBasis(right, up, back);
  const p = new THREE.Vector3();
  let d = 0;
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).sub(target);
    const z = p.dot(back);
    d = Math.max(d, z + (margin * Math.abs(p.dot(right))) / tanH, z + (margin * Math.abs(p.dot(up))) / tanV);
  }
  return d;
}

export function viewPosition(view, target, distance) {
  return new THREE.Vector3()
    .setFromSphericalCoords(distance * (view.distance ?? 1), (90 - (view.elevation ?? 15)) * DEG, (view.azimuth ?? 0) * DEG)
    .add(target);
}

/** Apply every option in config.options for the given selections (missing → option default). */
export async function applySelections({ gltf, root, config, selections, partCache }) {
  const part = (id) => {
    if (!partCache.has(id)) partCache.set(id, resolvePart(root, config.parts?.[id]));
    return partCache.get(id);
  };
  // Variants replace whole materials, so apply them first and layer other options on top.
  const isVariant = (o) => o.type === 'variants' || o.choices?.some((c) => c.variant);
  const ordered = [...(config.options || [])].sort((a, b) => isVariant(b) - isVariant(a));
  for (const opt of ordered) {
    const value = selections[opt.id] ?? opt.default ?? (opt.type === 'toggle' ? true : opt.choices?.[0]?.id);
    if (value === undefined || opt.type === 'views') continue;
    if (opt.type === 'toggle') part(opt.part).meshes.forEach((m) => { m.visible = !!value; });
    else if (opt.type === 'variants') { await selectVariant(gltf, root, value); partCache.clear(); }
    else {
      const choice = opt.choices?.find((c) => c.id === value);
      if (!choice) continue;
      if (choice.variant) { await selectVariant(gltf, root, choice.variant); partCache.clear(); }
      if (choice.material) part(opt.part).materials.forEach((m) => applyMaterialProps(m, choice.material));
      if (choice.visible) for (const [pid, on] of Object.entries(choice.visible)) part(pid).meshes.forEach((m) => { m.visible = on; });
    }
  }
}
