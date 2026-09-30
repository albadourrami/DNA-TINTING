#!/usr/bin/env node
// Builds assets/vehicles/concept-demo/concept-demo.glb from Khronos' "Car Concept" sample
// (CC BY 4.0, Eric Chadwick / Darmstadt Graphics Group). It's a stand-in until licensed
// Mercedes-Benz models are supplied.
//
//   curl -L -o /tmp/CarConcept.glb https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb
//   node tools/vehicles/prepare-concept-demo.mjs /tmp/CarConcept.glb /tmp/concept-prepared.glb
//   node .claude/skills/web-3d-models/scripts/optimize_model.mjs /tmp/concept-prepared.glb \
//        assets/vehicles/concept-demo/concept-demo.glb --texture-size 1024
//
// What it changes:
//  - removes the Khronos / 3D Commerce logos (trademarks, not covered by CC BY) by giving
//    the license plate a DNA Tinting plate and dropping the logo texture everywhere else
//  - drops the material variants we don't use (smaller file)
//  - repaints the body silver so window tint reads clearly against it
import { load, createIO } from '../../.claude/skills/web-3d-models/scripts/_deps.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('Usage: node prepare-concept-demo.mjs <CarConcept.glb> <out.glb>'); process.exit(1); }

const sharp = (await load('sharp')).default;
const { prune } = await load('@gltf-transform/functions');
const io = await createIO();
const doc = await io.read(input);
const root = doc.getRoot();
const mat = (name) => root.listMaterials().find((m) => m.getName() === name);

// 1. License plate → DNA Tinting plate (the old texture holds the Khronos logo).
const plateSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="128">
  <rect width="512" height="128" fill="#eef1f5"/>
  <rect x="6" y="6" width="500" height="116" rx="10" fill="none" stroke="#1e293b" stroke-width="5"/>
  <text x="256" y="78" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="58" letter-spacing="6" text-anchor="middle" fill="#0b1220">DNA TINT</text>
  <text x="256" y="110" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" letter-spacing="4" text-anchor="middle" fill="#2563eb">IT RUNS IN OUR BLOOD</text>
</svg>`;
const platePng = await sharp(Buffer.from(plateSvg)).png().toBuffer();
const license = mat('License');
const logoTexture = license.getBaseColorTexture();
const plate = doc.createTexture('dna-plate').setImage(platePng).setMimeType('image/png');
license.setBaseColorTexture(plate).setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
for (const m of root.listMaterials()) {
  // The logo texture doubled as an emissive mask; without it the factor would light up the
  // whole part (wheels, trim) — so turn the emission off too.
  if (m.getEmissiveTexture() === logoTexture) m.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
  if (m.getBaseColorTexture() === logoTexture) m.setBaseColorTexture(null);
}

// 2. Keep only the default look: drop KHR_materials_variants (prune removes variant-only materials).
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_variants') ext.dispose();

// 3. Silver paint + readable names for the configurator.
const paint = mat('Paint 1 Carmine').setName('Paint Primary').setBaseColorFactor([0.62, 0.64, 0.67, 1]).setMetallicFactor(0.85).setRoughnessFactor(0.3);
// Soften the metallic-flake normal map: at web resolutions full strength reads as grain.
paint.getNormalTextureInfo()?.setTexCoord(0);
paint.setNormalScale(0.1);
mat('Paint 2 Carmine').setName('Paint Secondary');

await doc.transform(prune());
await io.write(output, doc);
console.log('Prepared', output);
