#!/usr/bin/env node
// Optimize a glTF/GLB for the web: clean up, resize + recompress textures, compress geometry.
// Safe by default: node/mesh/material names are preserved so the viewer config can still
// target parts (windows, paint, wheels…). Pass --merge only for display-only models.
//
//   node optimize_model.mjs <in.glb|.gltf> [out.glb] [options]
//
//   --compress meshopt|draco|none   geometry compression (default meshopt: smaller decoder,
//                                   faster decode, also compresses animation)
//   --texture-size N                max texture edge in px (default 2048; 1024 for mobile-first)
//   --texture-format webp|avif|jpeg|png|keep   (default webp)
//   --quality N                     lossy texture quality 1-100 (default 85)
//   --simplify R                    keep ~R of the triangles (0-1), e.g. 0.5; off by default
//   --unit-scale S                  multiply the whole model by S (0.01 for cm, 0.001 for mm)
//   --verbose                       show gltf-transform step logs
//   --merge                         join meshes / flatten hierarchy for fewer draw calls
//                                   (destroys per-part targeting — don't use on configurable parts)
//
// KTX2/Basis textures (lowest GPU memory) need KTX-Software's `toktx` on PATH; run the CLI afterwards:
//   npx --prefix "$WEB3D_TOOLS_DIR" gltf-transform uastc out.glb out.glb --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}"
//   npx --prefix "$WEB3D_TOOLS_DIR" gltf-transform etc1s out.glb out.glb

import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { load, createIO, fmtBytes } from './_deps.mjs';

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const key = a.slice(2);
  if (key === 'merge' || key === 'verbose') flags[key] = true;
  else flags[key] = argv[++i];
}

const [input, outArg] = positional;
if (!input) {
  console.error('Usage: node optimize_model.mjs <in.glb|.gltf> [out.glb] [--compress meshopt|draco|none] [--texture-size 2048] [--texture-format webp] [--quality 85] [--simplify 0.5] [--unit-scale 0.01] [--merge]');
  process.exit(1);
}
if (!existsSync(input)) { console.error(`File not found: ${input}`); process.exit(1); }

const output = outArg || input.replace(/\.(glb|gltf)$/i, '') + '.optimized.glb';
const compress = flags.compress || 'meshopt';
const texSize = Number(flags['texture-size'] || 2048);
const texFormat = flags['texture-format'] || 'webp';
const quality = Number(flags.quality || 85);
const simplifyRatio = flags.simplify ? Number(flags.simplify) : null;
const unitScale = flags['unit-scale'] ? Number(flags['unit-scale']) : null;

if (!['meshopt', 'draco', 'none'].includes(compress)) { console.error(`--compress must be meshopt, draco, or none`); process.exit(1); }
if (!['webp', 'avif', 'jpeg', 'png', 'keep'].includes(texFormat)) { console.error(`--texture-format must be webp, avif, jpeg, png, or keep`); process.exit(1); }

const F = await load('@gltf-transform/functions');
const { MeshoptSimplifier, MeshoptEncoder } = await load('meshoptimizer');
const sharp = (await load('sharp')).default;
const { Logger } = await load('@gltf-transform/core');
const io = (await createIO()).setLogger(new Logger(flags.verbose ? Logger.Verbosity.INFO : Logger.Verbosity.ERROR));

const doc = await io.read(input);
const root = doc.getRoot();

const stats = () => {
  let tris = 0;
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices(); const pos = p.getAttribute('POSITION');
    const n = idx ? idx.getCount() : pos ? pos.getCount() : 0;
    tris += p.getMode() === 4 ? n / 3 : 0;
  }
  return { tris: Math.round(tris), meshes: root.listMeshes().length, materials: root.listMaterials().length, textures: root.listTextures().length, nodes: root.listNodes().length };
};
const before = stats();
const inBytes = statSync(input).size;

// Unit fix: scale scene roots rather than vertices so the hierarchy (and names) stay intact.
if (unitScale) {
  for (const scene of root.listScenes()) for (const node of scene.listChildren()) {
    node.setTranslation(node.getTranslation().map((v) => v * unitScale));
    node.setScale(node.getScale().map((v) => v * unitScale));
  }
}

const steps = [
  F.dedup(),                       // identical accessors/textures/materials → one copy
  F.instance({ min: 5 }),          // many copies of one mesh (bolts, lug nuts) → GPU instancing
  ...(flags.merge ? [F.palette({ min: 5 }), F.flatten(), F.join()] : []),
  F.weld(),                        // merge duplicate vertices (required before simplify)
  ...(simplifyRatio ? [F.simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.001, lockBorder: true })] : []),
  F.resample(),                    // drop redundant animation keyframes
  F.prune({ keepExtras: true }),   // remove unused nodes/materials/textures (variant materials are kept: they're still referenced)
  F.sparse({ ratio: 0.2 }),        // compact morph targets
];

if (texFormat !== 'keep') {
  const resize = [texSize, texSize];
  // Normal maps are data, not color: lossy WebP/JPEG artifacts show up as bumpy "noise" in
  // reflections, so they get near-lossless encoding. Everything else uses normal lossy quality.
  steps.push(F.textureCompress({ encoder: sharp, targetFormat: texFormat, resize, quality, slots: /^(?!normalTexture$).*/ }));
  steps.push(F.textureCompress({ encoder: sharp, targetFormat: texFormat === 'jpeg' ? 'png' : texFormat, resize, nearLossless: texFormat === 'webp', quality: 95, slots: /^normalTexture$/ }));
} else {
  steps.push(F.textureCompress({ encoder: sharp, resize: [texSize, texSize] }));
}

if (compress === 'meshopt') steps.push(F.meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
if (compress === 'draco') steps.push(F.draco({ method: 'edgebreaker' }));

await doc.transform(...steps);
await io.write(output, doc);

const after = stats();
const outBytes = statSync(output).size;
const pct = (a, b) => (b ? `${Math.round((1 - a / b) * 100)}% smaller` : '');

console.log(`Optimized ${path.basename(input)} → ${output}`);
console.log(`  size:      ${fmtBytes(inBytes)} → ${fmtBytes(outBytes)}  (${pct(outBytes, inBytes)})`);
console.log(`  triangles: ${before.tris.toLocaleString()} → ${after.tris.toLocaleString()}`);
console.log(`  meshes ${before.meshes}→${after.meshes}, materials ${before.materials}→${after.materials}, textures ${before.textures}→${after.textures}, nodes ${before.nodes}→${after.nodes}`);
console.log(`  settings:  compress=${compress}, textures=${texFormat}@${texSize}px q${quality}${simplifyRatio ? `, simplify=${simplifyRatio}` : ''}${unitScale ? `, unit-scale=${unitScale}` : ''}${flags.merge ? ', merge' : ''}`);
if (compress === 'meshopt') console.log('  viewer:    needs MeshoptDecoder (GLTFLoader.setMeshoptDecoder) — the viewer template sets this up.');
if (compress === 'draco') console.log('  viewer:    needs DRACOLoader (GLTFLoader.setDRACOLoader) — the viewer template sets this up.');
if (texFormat === 'webp' || texFormat === 'avif') console.log(`  viewer:    ${texFormat.toUpperCase()} textures use EXT_texture_${texFormat} — supported by three.js GLTFLoader in all modern browsers.`);
if (flags.merge) console.log('  note:      --merge joined meshes; per-part names may be gone. Re-run inspect_model.mjs before writing the viewer config.');
