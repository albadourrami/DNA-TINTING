#!/usr/bin/env node
// Inspect a glTF/GLB model: structure, meshes, materials, textures, animations, size,
// scale, and performance/interactivity warnings. Run BEFORE writing any viewer code.
//
//   node inspect_model.mjs <model.glb|.gltf> [--json] [--full]
//
//   --json  machine-readable output (pipe into jq, or save next to the model)
//   --full  print the entire node tree (default caps it at 120 lines)

import path from 'node:path';

import { existsSync, statSync } from 'node:fs';
import { load, createIO, fmtBytes } from './_deps.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const asJSON = args.includes('--json');
const full = args.includes('--full');

if (!file) {
  console.error('Usage: node inspect_model.mjs <model.glb|.gltf> [--json] [--full]');
  process.exit(1);
}
const ext = path.extname(file).toLowerCase();
if (['.obj', '.fbx', '.stl', '.dae', '.blend', '.usdz'].includes(ext)) {
  console.error(`${ext} can't be inspected directly — convert to GLB first:\n  bash ${path.join(path.dirname(new URL(import.meta.url).pathname), 'convert_to_glb.sh')} ${file}`);
  process.exit(1);
}

const { ImageUtils, getBounds } = await load('@gltf-transform/core');
const { listTextureSlots, getTextureColorSpace } = await load('@gltf-transform/functions');
if (!existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}
const io = await createIO();
let doc;
try {
  doc = await io.read(file);
} catch (err) {
  // Most common causes: external .bin/textures missing next to a .gltf, or a truncated download.
  console.error(`Could not parse ${file}: ${err.message}\nIf this is a .gltf, make sure its .bin and texture files sit next to it with the same relative paths.`);
  process.exit(1);
}
const root = doc.getRoot();
// Document.getAsset() reports gltf-transform itself after a read; the raw JSON keeps the
// original exporter (Blender, Sketchfab, obj2gltf…), which helps explain material quirks.
const sourceGenerator = (await io.readAsJSON(file)).json.asset?.generator || null;

// Words that usually mark parts a site will want to recolor, hide, or highlight.
// Matching is only a hint for writing the viewer config — always confirm visually.
// "exclude" drops common false positives (window gaskets, wiper blades, steering wheels…).
const HINTS = {
  glass: { re: /glass|window|windshield|windscreen|visor|lens|tint/i, exclude: /gasket|wiper|frame|trim|seal|switch/i },
  paint: { re: /paint|color\d|colour\d|carpaint|exterior|livery/i, exclude: /interior/i },
  wheel: { re: /wheel|rim|tire|tyre/i, exclude: /steering/i },
  light: { re: /light|lamp|emiss/i, exclude: /panel|housing/i },
};
const hintFor = (name) =>
  Object.entries(HINTS)
    .filter(([, h]) => h.re.test(name || '') && !h.exclude.test(name || ''))
    .map(([k]) => k);

const warnings = [];
const warn = (level, msg) => warnings.push({ level, msg });

// ---------- Scene bounds & scale ----------
const scene = root.getDefaultScene() || root.listScenes()[0];
let bounds = null;
if (scene) {
  const { min, max } = getBounds(scene);
  const size = max.map((v, i) => v - min[i]);
  const center = max.map((v, i) => (v + min[i]) / 2);
  const maxDim = Math.max(...size);
  let unitsGuess = 'meters (looks correct for web)';
  if (maxDim > 1000) unitsGuess = 'likely millimeters — scale by 0.001';
  else if (maxDim > 50) unitsGuess = 'likely centimeters — scale by 0.01';
  else if (maxDim < 0.05) unitsGuess = 'very small — scale up, or it was exported in km/odd units';
  bounds = { min, max, size, center, maxDim, unitsGuess };
  if (maxDim > 50 || maxDim < 0.05) warn('warn', `Unusual scale (largest dimension ${maxDim.toFixed(3)} units): ${unitsGuess}. The viewer template auto-fits, but physics/lighting presets assume ~meters.`);
  const off = Math.hypot(...center);
  if (off > maxDim * 0.5) warn('info', `Model origin is far from its center (offset ${off.toFixed(2)}). Auto-centering in the viewer handles this; pivot-based animations may not.`);
}

// ---------- Meshes ----------
let totalTris = 0, totalVerts = 0, drawCalls = 0;
const meshes = root.listMeshes().map((mesh) => {
  const instances = mesh.listParents().filter((p) => p.propertyType === 'Node').length || 1;
  const prims = mesh.listPrimitives().map((prim) => {
    const pos = prim.getAttribute('POSITION');
    const verts = pos ? pos.getCount() : 0;
    const idx = prim.getIndices();
    const mode = prim.getMode();
    const tris = mode === 4 ? (idx ? idx.getCount() : verts) / 3 : 0;
    return {
      material: prim.getMaterial()?.getName() || '(unnamed material)',
      verts, tris, mode,
      attributes: prim.listSemantics(),
      morphTargets: prim.listTargets().length,
    };
  });
  const tris = prims.reduce((s, p) => s + p.tris, 0);
  const verts = prims.reduce((s, p) => s + p.verts, 0);
  totalTris += tris * instances;
  totalVerts += verts * instances;
  drawCalls += prims.length * instances;
  prims.forEach((p) => {
    if (!p.attributes.includes('NORMAL')) warn('warn', `Mesh "${mesh.getName()}" has no normals — it will look flat/faceted. Fix: optimize_model.mjs --normals, or re-export with normals.`);
  });
  return { name: mesh.getName() || '(unnamed)', instances, primitives: prims.length, tris, verts, prims, hints: hintFor(mesh.getName()) };
});
if (meshes.some((m) => m.name === '(unnamed)')) warn('warn', 'Some meshes are unnamed — you can\'t target them by name for interactivity. Name them in Blender (Outliner) and re-export.');
if (totalTris > 1_500_000) warn('error', `${totalTris.toLocaleString()} triangles — too heavy for phones. Target < 300k for mobile hero models. Use --simplify.`);
else if (totalTris > 500_000) warn('warn', `${totalTris.toLocaleString()} triangles — fine on desktop, heavy on low-end phones. Consider --simplify 0.5.`);
if (drawCalls > 300) warn('warn', `~${drawCalls} draw calls — merge meshes that never change independently (optimize_model.mjs joins them by default; use --keep-names to preserve interactive parts).`);

// ---------- Materials ----------
const matUsage = new Map();
meshes.forEach((m) => m.prims.forEach((p) => matUsage.set(p.material, (matUsage.get(p.material) || 0) + 1)));
const materials = root.listMaterials().map((mat) => {
  const tex = (t) => (t ? t.getName() || t.getURI() || '(embedded)' : null);
  const exts = mat.listExtensions().map((e) => e.extensionName);
  const name = mat.getName() || '(unnamed material)';
  const info = {
    name,
    alphaMode: mat.getAlphaMode(),
    doubleSided: mat.getDoubleSided(),
    baseColor: mat.getBaseColorFactor().map((v) => +v.toFixed(3)),
    metallic: +mat.getMetallicFactor().toFixed(3),
    roughness: +mat.getRoughnessFactor().toFixed(3),
    emissive: mat.getEmissiveFactor().map((v) => +v.toFixed(3)),
    textures: {
      baseColor: tex(mat.getBaseColorTexture()),
      metallicRoughness: tex(mat.getMetallicRoughnessTexture()),
      normal: tex(mat.getNormalTexture()),
      occlusion: tex(mat.getOcclusionTexture()),
      emissive: tex(mat.getEmissiveTexture()),
    },
    extensions: exts,
    usedByPrimitives: matUsage.get(name) || 0,
    hints: hintFor(name),
  };
  if (exts.includes('KHR_materials_transmission') || (info.alphaMode === 'BLEND' && info.baseColor[3] < 1)) {
    if (!info.hints.includes('glass')) info.hints.push('glass');
  }
  if (exts.includes('KHR_materials_pbrSpecularGlossiness')) warn('warn', `Material "${name}" uses legacy spec/gloss. Convert with optimize_model.mjs (runs metalRough) for correct rendering.`);
  if (info.alphaMode === 'BLEND' && !exts.includes('KHR_materials_transmission')) warn('info', `Material "${name}" uses alpha BLEND — may show sorting artifacts; for glass prefer transmission or set depthWrite=false in the viewer.`);
  return info;
});
if (materials.length === 0) warn('warn', 'No materials — model will render as default gray. Materials were likely lost in export (common with OBJ without .mtl, or FBX with external textures).');

// ---------- Textures ----------
let texBytes = 0, gpuBytes = 0;
const textures = root.listTextures().map((t) => {
  const img = t.getImage();
  const mime = t.getMimeType();
  const size = img ? ImageUtils.getSize(img, mime) : null;
  const bytes = img ? img.byteLength : 0;
  texBytes += bytes;
  const [w, h] = size || [0, 0];
  gpuBytes += w * h * 4 * 1.33; // RGBA8 + mip chain, unless KTX2-compressed
  const info = {
    name: t.getName() || t.getURI() || '(embedded)',
    mimeType: mime, width: w, height: h, bytes,
    slots: listTextureSlots(t),
    colorSpace: getTextureColorSpace(t) || 'linear',
  };
  if (w > 2048 || h > 2048) warn('warn', `Texture "${info.name}" is ${w}×${h} — resize to ≤2048 (≤1024 for mobile). optimize_model.mjs --texture-size 2048.`);
  if (w && (w & (w - 1) || h & (h - 1))) warn('info', `Texture "${info.name}" is not power-of-two (${w}×${h}); fine in WebGL2 but mipmaps/compression work best at POT sizes.`);
  if (!img && t.getURI()) warn('error', `Texture "${t.getURI()}" is referenced but its file is missing — it will render black/white. Keep textures next to the .gltf or pack to GLB.`);
  return info;
});

// ---------- Animations ----------
const animations = root.listAnimations().map((a) => {
  let duration = 0;
  a.listSamplers().forEach((s) => { const inp = s.getInput(); if (inp) duration = Math.max(duration, inp.getMax([])[0] ?? 0); });
  const targets = [...new Set(a.listChannels().map((c) => `${c.getTargetNode()?.getName() || '?'}.${c.getTargetPath()}`))];
  return { name: a.getName() || '(unnamed)', channels: a.listChannels().length, duration: +duration.toFixed(3), targets: targets.slice(0, 12), moreTargets: Math.max(0, targets.length - 12) };
});

// ---------- Variants, skins, cameras, lights ----------
const variantsExt = root.listExtensionsUsed().find((e) => e.extensionName === 'KHR_materials_variants');
const variants = variantsExt ? variantsExt.listVariants().map((v) => v.getName()) : [];
const skins = root.listSkins().map((s) => ({ name: s.getName() || '(unnamed)', joints: s.listJoints().length }));
const cameras = root.listCameras().map((c) => c.getName() || '(unnamed)');
const lightsExt = root.listExtensionsUsed().find((e) => e.extensionName === 'KHR_lights_punctual');
const lights = lightsExt ? root.listNodes().filter((n) => n.getExtension('KHR_lights_punctual')).map((n) => n.getName()) : [];
if (lights.length) warn('info', `${lights.length} embedded light(s). Exported lights are often far too bright/dim in three.js — the viewer template ignores them by default (config.useEmbeddedLights).`);

// ---------- Byte breakdown ----------
let geomBytes = 0, animBytes = 0;
const animAccessors = new Set();
root.listAnimations().forEach((a) => a.listSamplers().forEach((s) => { animAccessors.add(s.getInput()); animAccessors.add(s.getOutput()); }));
root.listAccessors().forEach((acc) => {
  const n = acc.getArray()?.byteLength || 0;
  if (animAccessors.has(acc)) animBytes += n; else geomBytes += n;
});
const fileBytes = statSync(file).size;
if (fileBytes > 15 * 1048576) warn('error', `File is ${fmtBytes(fileBytes)} — too large for a web hero. Target < 5 MB (ideally < 3 MB) after optimization.`);
else if (fileBytes > 5 * 1048576) warn('warn', `File is ${fmtBytes(fileBytes)} — optimize before shipping (target < 5 MB).`);
if (gpuBytes > 256 * 1048576) warn('warn', `~${fmtBytes(gpuBytes)} of GPU texture memory — can crash mobile Safari. Resize textures or use KTX2.`);

const extUsed = root.listExtensionsUsed().map((e) => e.extensionName);
const compressed = extUsed.some((e) => e === 'KHR_draco_mesh_compression' || e === 'EXT_meshopt_compression');
if (!compressed && geomBytes > 1048576) warn('info', 'Geometry is uncompressed — Meshopt/Draco would shrink it 5–10×.');

// ---------- Node tree ----------
const treeLines = [];
const walk = (node, depth) => {
  const mesh = node.getMesh();
  const bits = [];
  if (mesh) bits.push(`mesh:${mesh.getName() || '?'}`);
  if (node.getCamera()) bits.push('camera');
  if (node.getSkin()) bits.push('skin');
  if (node.getExtension('KHR_lights_punctual')) bits.push('light');
  const h = hintFor(node.getName());
  treeLines.push(`${'  '.repeat(depth)}- ${node.getName() || '(unnamed node)'}${bits.length ? ` [${bits.join(', ')}]` : ''}${h.length ? `  ← ${h.join('/')}?` : ''}`);
  node.listChildren().forEach((c) => walk(c, depth + 1));
};
scene?.listChildren().forEach((n) => walk(n, 0));

const report = {
  file: path.resolve(file),
  fileBytes,
  generator: sourceGenerator,
  extensionsUsed: extUsed,
  extensionsRequired: root.listExtensionsRequired().map((e) => e.extensionName),
  bounds,
  totals: { nodes: root.listNodes().length, meshes: meshes.length, materials: materials.length, textures: textures.length, animations: animations.length, triangles: Math.round(totalTris), vertices: totalVerts, drawCalls },
  bytes: { geometry: geomBytes, textures: texBytes, animation: animBytes, gpuTextureEstimate: Math.round(gpuBytes) },
  meshes: meshes.map(({ prims, ...m }) => ({ ...m, materials: [...new Set(prims.map((p) => p.material))], morphTargets: Math.max(0, ...prims.map((p) => p.morphTargets)) })),
  materials, textures, animations, variants, skins, cameras, lights,
  interactiveCandidates: {
    materials: materials.filter((m) => m.hints.length).map((m) => ({ name: m.name, hints: m.hints })),
    meshes: meshes.filter((m) => m.hints.length).map((m) => ({ name: m.name, hints: m.hints })),
  },
  tree: treeLines,
  warnings,
};

if (asJSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ---------- Human-readable report ----------
const out = [];
const h = (t) => out.push(`\n=== ${t} ===`);
out.push(`Model: ${report.file}`);
out.push(`Size: ${fmtBytes(fileBytes)}  (geometry ${fmtBytes(geomBytes)}, textures ${fmtBytes(texBytes)}, animation ${fmtBytes(animBytes)})`);
out.push(`Generator: ${report.generator || 'unknown'}`);
out.push(`Extensions: ${extUsed.join(', ') || 'none'}${report.extensionsRequired.length ? `  (required: ${report.extensionsRequired.join(', ')})` : ''}`);
if (bounds) {
  const f = (a) => a.map((v) => v.toFixed(3)).join(' × ');
  out.push(`Dimensions: ${f(bounds.size)} (x × y × z)   center: [${bounds.center.map((v) => v.toFixed(3)).join(', ')}]`);
  out.push(`Units: ${bounds.unitsGuess}`);
}
const t = report.totals;
out.push(`Totals: ${t.nodes} nodes, ${t.meshes} meshes, ${t.materials} materials, ${t.textures} textures, ${t.animations} animations`);
out.push(`Render cost: ${t.triangles.toLocaleString()} triangles, ~${t.drawCalls} draw calls, ~${fmtBytes(report.bytes.gpuTextureEstimate)} GPU texture memory`);

h('Materials');
materials.forEach((m) => {
  const texs = Object.entries(m.textures).filter(([, v]) => v).map(([k]) => k);
  out.push(`- ${m.name}  [${m.alphaMode}${m.doubleSided ? ', double-sided' : ''}] color=${JSON.stringify(m.baseColor)} metal=${m.metallic} rough=${m.roughness}` +
    `${texs.length ? `  maps: ${texs.join(', ')}` : ''}${m.extensions.length ? `  ext: ${m.extensions.join(', ')}` : ''}  (×${m.usedByPrimitives})${m.hints.length ? `  ← ${m.hints.join('/')}?` : ''}`);
});

h('Meshes (largest first)');
[...meshes].sort((a, b) => b.tris * b.instances - a.tris * a.instances).slice(0, full ? Infinity : 25).forEach((m) => {
  out.push(`- ${m.name}: ${Math.round(m.tris).toLocaleString()} tris, ${m.primitives} prim(s)${m.instances > 1 ? `, ×${m.instances} instances` : ''}  mats: ${[...new Set(m.prims.map((p) => p.material))].join(', ')}${m.hints.length ? `  ← ${m.hints.join('/')}?` : ''}`);
});
if (!full && meshes.length > 25) out.push(`  … ${meshes.length - 25} more (use --full)`);

if (textures.length) {
  h('Textures');
  textures.forEach((x) => out.push(`- ${x.name}: ${x.width}×${x.height} ${x.mimeType}, ${fmtBytes(x.bytes)}, ${x.colorSpace}, slots: ${x.slots.join(', ')}`));
}
if (animations.length) {
  h('Animations');
  animations.forEach((a) => out.push(`- ${a.name}: ${a.duration}s, ${a.channels} channels → ${a.targets.join(', ')}${a.moreTargets ? ` (+${a.moreTargets} more)` : ''}`));
}
if (variants.length) { h('Material variants (KHR_materials_variants)'); out.push(`- ${variants.join(', ')}`); }
if (skins.length) { h('Skins'); skins.forEach((s) => out.push(`- ${s.name}: ${s.joints} joints`)); }
if (cameras.length) { h('Cameras'); out.push(`- ${cameras.join(', ')}`); }

h('Node tree');
out.push(...(full ? treeLines : treeLines.slice(0, 120)));
if (!full && treeLines.length > 120) out.push(`  … ${treeLines.length - 120} more lines (use --full)`);

const cand = report.interactiveCandidates;
if (cand.materials.length || cand.meshes.length) {
  h('Likely interactive parts (name-based hints — verify visually)');
  // Grouped by category so a 100-mesh car stays readable. Prefer targeting materials in the
  // viewer config: one material usually covers every mesh of that part.
  for (const cat of Object.keys(HINTS)) {
    const mats = cand.materials.filter((m) => m.hints.includes(cat)).map((m) => `"${m.name}"`);
    const mesh = cand.meshes.filter((m) => m.hints.includes(cat)).map((m) => `"${m.name}"`);
    if (!mats.length && !mesh.length) continue;
    out.push(`- ${cat}:`);
    if (mats.length) out.push(`    materials: ${mats.join(', ')}`);
    if (mesh.length) out.push(`    meshes: ${full || mesh.length <= 12 ? mesh.join(', ') : `${mesh.slice(0, 12).join(', ')} … +${mesh.length - 12} more (--full)`}`);
  }
}

h(`Warnings (${warnings.length})`);
if (!warnings.length) out.push('- none — model looks web-ready');
const order = { error: 0, warn: 1, info: 2 };
warnings.sort((a, b) => order[a.level] - order[b.level]).forEach((w) => out.push(`- [${w.level.toUpperCase()}] ${w.msg}`));

console.log(out.join('\n'));
