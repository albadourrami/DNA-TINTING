// Resolves the toolchain from the shared tools dir (see setup_tools.sh), falling back to
// the current project's node_modules. ESM resolves imports relative to the *script's*
// location, which lives inside the skill folder, so plain `import` would never find them.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOLS_DIR = process.env.WEB3D_TOOLS_DIR || path.join(homedir(), '.cache', 'web3d-tools');
const roots = [TOOLS_DIR, process.cwd()].filter((r) => existsSync(path.join(r, 'node_modules')));

export async function load(pkg) {
  for (const root of roots) {
    try {
      const req = createRequire(path.join(root, 'noop.js'));
      return await import(pathToFileURL(req.resolve(pkg)).href);
    } catch { /* try next root */ }
  }
  console.error(`Missing dependency "${pkg}". Run: bash ${path.join(path.dirname(new URL(import.meta.url).pathname), 'setup_tools.sh')}`);
  process.exit(2);
}

// A NodeIO that can read every extension, including Draco- and Meshopt-compressed files.
export async function createIO() {
  const { NodeIO } = await load('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
  const draco3d = (await load('draco3dgltf')).default;
  const { MeshoptDecoder, MeshoptEncoder } = await load('meshoptimizer');
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
}

export const fmtBytes = (n) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
