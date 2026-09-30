// Config-driven Three.js model viewer engine (no build step — ES modules + import map).
//
//   import { createViewer } from './viewer/viewer.js';
//   const viewer = await createViewer(containerEl, config);   // config: see model.config.js
//   viewer.setOption('tint', '35');  viewer.goToView('front');  viewer.on('load', fn);
//
// This file never mentions a specific model. Everything model-specific (file path, which
// meshes/materials are "windows" or "paint", camera angles, choices) lives in the config,
// so replacing the model means editing model.config.js only.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Decoders are WASM/worker files loaded at runtime; pin them to the same three.js release.
const LIBS = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}/examples/jsm/libs/`;
const DEG = Math.PI / 180;

const DEFAULTS = {
  model: { url: '', poster: '', alt: '3D model', center: true, normalizeSize: null, rotation: [0, 0, 0] },
  camera: {
    fov: 35,
    start: { azimuth: 30, elevation: 12, distance: 1 },
    minDistance: 0.45, maxDistance: 2.2, // multiples of the "fit" distance
    minElevation: -2, maxElevation: 80,  // degrees above the ground; negative lets users peek under
    enablePan: false,
    autoRotate: true, autoRotateSpeed: 0.6, autoRotateResumeMs: 6000,
    views: [],
  },
  environment: { preset: 'room', intensity: 1, rotation: 0, background: 'transparent' },
  lighting: { toneMapping: 'neutral', exposure: 1, keyLight: { intensity: 1.2, azimuth: 40, elevation: 55 }, shadows: 'soft', shadowOpacity: 0.35 },
  quality: { maxPixelRatio: 2, mobileMaxPixelRatio: 1.5, antialias: true, shadowMapSize: 2048, mobileShadowMapSize: 1024 },
  interaction: { touchGuard: 'auto' },
  decoders: { draco: `${LIBS}draco/gltf/`, basis: `${LIBS}basis/` },
  parts: {},
  options: [],
  hotspots: [],
};

const TONE_MAPPING = {
  none: THREE.NoToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping, // Khronos PBR Neutral: keeps brand/product colors true
};

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] ? merge(base[k], v) : v;
  return out;
}

// GLTFLoader sanitizes node names (spaces → "_", strips []:./). Materials keep raw names.
// Patterns accept exact names or * wildcards ("BodyDoor*Window"), matched against both forms.
function nameMatcher(patterns = []) {
  const res = patterns.map((p) => {
    const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return [new RegExp(`^${esc(p)}$`, 'i'), new RegExp(`^${esc(THREE.PropertyBinding.sanitizeNodeName(p))}$`, 'i')];
  });
  return (name) => !!name && res.some(([a, b]) => a.test(name) || b.test(name));
}

const isCoarsePointer = () => matchMedia('(pointer: coarse)').matches;
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// Shorthand for tinted/see-through glass. Transmission (true refraction) costs an extra render
// pass and looks muddy on phones; a transparent reflective surface reads as glass and is cheap.
// visibleLight is the fraction of light that passes through (window-film "VLT"): 0.05 = limo.
function glassProps({ tint = '#0b0f14', visibleLight = 0.7, reflectivity = 1 }) {
  const vlt = THREE.MathUtils.clamp(visibleLight, 0, 1);
  return {
    color: tint,
    transmission: 0,
    metalness: 0,
    roughness: 0.04,
    transparent: true,
    opacity: THREE.MathUtils.lerp(0.97, 0.12, vlt), // darker film → more opaque
    envMapIntensity: 1.1 * reflectivity,
    depthWrite: false,
    side: THREE.DoubleSide,
  };
}

function applyMaterialProps(material, props) {
  const p = props.glass ? { ...glassProps(props.glass), ...props, glass: undefined } : props;
  for (const [key, value] of Object.entries(p)) {
    if (value === undefined) continue;
    if (key === 'map' || key === 'glass') continue;
    const cur = material[key];
    if (cur && cur.isColor) cur.set(value);
    else if (key in material) material[key] = value;
  }
  if (p.opacity !== undefined && p.transparent === undefined) material.transparent = p.opacity < 1;
  material.needsUpdate = true;
}

export async function createViewer(container, userConfig) {
  const config = merge(DEFAULTS, userConfig);
  const events = new EventTarget();
  const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
  const mobile = isCoarsePointer();
  const reducedMotion = prefersReducedMotion();

  if (!webglAvailable()) {
    const err = new Error('WebGL is not available on this device/browser.');
    setTimeout(() => emit('error', { error: err, reason: 'webgl' })); // after the caller subscribes
    return { on: (t, f) => events.addEventListener(t, (e) => f(e.detail)), off() {}, dispose() {}, failed: true, config, error: err };
  }

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: config.quality.antialias, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[config.lighting.toneMapping] ?? THREE.NeutralToneMapping;
  renderer.toneMappingExposure = config.lighting.exposure;
  renderer.shadowMap.enabled = config.lighting.shadows === 'soft';
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r18x; shadow.radius softens PCF
  const maxDPR = mobile ? config.quality.mobileMaxPixelRatio : config.quality.maxPixelRatio;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDPR));
  renderer.domElement.classList.add('m3d-canvas');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', config.model.alt);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.01, 1000);
  scene.add(camera);

  // ---------- Environment (image-based lighting = realistic reflections) ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = config.environment;
  if (env.preset === 'room' || !env.preset) {
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => o.geometry?.dispose());
  } else {
    // An .hdr URL (Poly Haven 1k/2k studio HDRIs are ideal; keep them < 2 MB).
    const hdr = await new HDRLoader().loadAsync(env.preset);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    if (env.background === 'environment') { hdr.mapping = THREE.EquirectangularReflectionMapping; scene.background = hdr; scene.backgroundBlurriness = env.backgroundBlur ?? 0.4; }
    else hdr.dispose();
  }
  scene.environmentIntensity = env.intensity;
  scene.environmentRotation.y = env.rotation * DEG;
  if (env.background && env.background !== 'transparent' && env.background !== 'environment') scene.background = new THREE.Color(env.background);

  const key = config.lighting.keyLight;
  const keyLight = new THREE.DirectionalLight(0xffffff, key.intensity);
  scene.add(keyLight, keyLight.target);

  // ---------- Controls ----------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = config.camera.enablePan;
  controls.rotateSpeed = mobile ? 0.9 : 0.7;
  controls.zoomSpeed = 0.8;
  controls.minPolarAngle = (90 - config.camera.maxElevation) * DEG;
  controls.maxPolarAngle = (90 - config.camera.minElevation) * DEG;
  controls.autoRotate = config.camera.autoRotate && !reducedMotion;
  controls.autoRotateSpeed = config.camera.autoRotateSpeed;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: config.camera.enablePan ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE };

  // ---------- State ----------
  let model = null;         // gltf.scene
  let pivot = null;         // group we center/scale/rotate
  let gltf = null;
  let mixer = null;
  let fitDistance = 1;
  let radius = 1;
  let size = new THREE.Vector3(1, 1, 1);
  let bounds = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  let needsRender = true;
  let visible = true;
  let tween = null;
  let resumeTimer = 0;
  let disposed = false;
  const timer = new THREE.Timer();
  timer.connect(document); // no giant delta after the tab was hidden
  const partCache = new Map(); // part id → { meshes, materials }
  const selections = {};       // option id → choice id / boolean
  const hotspots = [];
  const invalidate = () => { needsRender = true; };

  // ---------- Layout / resize ----------
  // Distance at which the model's bounding box exactly fills the frame from the start view
  // (+ margin). Box-based, not sphere-based: long flat objects (cars, sofas) would otherwise
  // sit tiny in the middle. Portrait phones get a narrow horizontal FOV and back off further.
  function computeFitDistance(view = config.camera.start) {
    const tanV = Math.tan((camera.fov * DEG) / 2);
    const tanH = tanV * camera.aspect;
    const margin = config.camera.fitMargin ?? 1.12;
    const target = defaultTarget();
    const eye = new THREE.Vector3().setFromSphericalCoords(1, (90 - (view.elevation ?? 15)) * DEG, (view.azimuth ?? 0) * DEG);
    const basis = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(), camera.up);
    const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
    basis.extractBasis(right, up, back);
    let d = 0;
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).sub(target);
      const z = p.dot(back);
      d = Math.max(d, z + (margin * Math.abs(p.dot(right))) / tanH, z + (margin * Math.abs(p.dot(up))) / tanV);
    }
    return Math.max(d, radius * 0.5);
  }
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (model) {
      const newFit = computeFitDistance();
      const offset = camera.position.clone().sub(controls.target);
      offset.multiplyScalar(newFit / fitDistance);
      camera.position.copy(controls.target).add(offset);
      fitDistance = newFit;
      controls.minDistance = fitDistance * config.camera.minDistance;
      controls.maxDistance = fitDistance * config.camera.maxDistance;
    }
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) invalidate(); emit('visibility', { visible, ratio: e.intersectionRatio }); }, { threshold: [0, 0.3] });
  io.observe(container);

  // ---------- Camera helpers ----------
  function sphericalFor({ azimuth = 0, elevation = 15, distance = 1 }) {
    const phi = THREE.MathUtils.clamp((90 - elevation) * DEG, controls.minPolarAngle, controls.maxPolarAngle);
    const r = THREE.MathUtils.clamp(distance * fitDistance, controls.minDistance || 0, controls.maxDistance || Infinity);
    return new THREE.Spherical(r, phi, azimuth * DEG);
  }
  function currentSpherical() {
    return new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  }
  function animateCamera(view, ms = 900) {
    const from = currentSpherical();
    const to = sphericalFor(view);
    // Take the short way around.
    let dTheta = to.theta - from.theta;
    dTheta = ((dTheta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    to.theta = from.theta + dTheta;
    const fromTarget = controls.target.clone();
    const toTarget = view.target ? new THREE.Vector3(...view.target).applyMatrix4(pivot.matrixWorld) : defaultTarget();
    if (reducedMotion || ms === 0) {
      controls.target.copy(toTarget);
      camera.position.setFromSpherical(to).add(toTarget);
      controls.update(); invalidate();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      tween = { t0: performance.now(), ms, from, to, fromTarget, toTarget, resolve };
    });
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function stepTween(now) {
    if (!tween) return;
    const t = Math.min(1, (now - tween.t0) / tween.ms);
    const k = ease(t);
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(tween.from.radius, tween.to.radius, k),
      THREE.MathUtils.lerp(tween.from.phi, tween.to.phi, k),
      THREE.MathUtils.lerp(tween.from.theta, tween.to.theta, k),
    );
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    camera.position.setFromSpherical(s).add(controls.target);
    if (t >= 1) { const r = tween.resolve; tween = null; r(); }
    invalidate();
  }
  const defaultTarget = () => new THREE.Vector3(0, size.y * 0.45, 0);

  function pauseAutoRotate() {
    if (!config.camera.autoRotate || reducedMotion) return;
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    if (config.camera.autoRotateResumeMs > 0) resumeTimer = setTimeout(() => { controls.autoRotate = userAutoRotate; invalidate(); }, config.camera.autoRotateResumeMs);
  }
  let userAutoRotate = controls.autoRotate;
  controls.addEventListener('start', () => { tween = null; pauseAutoRotate(); emit('interaction'); });
  controls.addEventListener('change', invalidate);

  // Keyboard support (the container is focusable): arrows orbit, +/- zoom, 0 resets.
  container.addEventListener('keydown', (e) => {
    if (!model || e.target !== container) return;
    const s = currentSpherical();
    const view = { azimuth: s.theta / DEG, elevation: 90 - s.phi / DEG, distance: s.radius / fitDistance };
    const map = { ArrowLeft: ['azimuth', -20], ArrowRight: ['azimuth', 20], ArrowUp: ['elevation', 10], ArrowDown: ['elevation', -10], '+': ['distance', -0.15], '=': ['distance', -0.15], '-': ['distance', 0.15] };
    if (e.key === '0') { api.resetView(); e.preventDefault(); return; }
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    view[m[0]] += m[1];
    pauseAutoRotate();
    animateCamera(view, 350);
  });

  // ---------- Load ----------
  const loader = new GLTFLoader();
  loader.setDRACOLoader(new DRACOLoader().setDecoderPath(config.decoders.draco));
  loader.setKTX2Loader(new KTX2Loader().setTranscoderPath(config.decoders.basis).detectSupport(renderer));
  loader.setMeshoptDecoder(MeshoptDecoder);

  async function load(url) {
    emit('progress', { ratio: 0, loaded: 0, total: 0 });
    let result;
    try {
      result = await loader.loadAsync(url, (e) => {
        const total = e.total || 0;
        emit('progress', { loaded: e.loaded, total, ratio: total ? e.loaded / total : null });
      });
    } catch (error) {
      console.error('[viewer] Failed to load model:', url, error);
      emit('error', { error, reason: 'load', url });
      throw error;
    }
    if (disposed) return;
    if (model) { scene.remove(pivot); disposeObject(model); }
    gltf = result;
    model = gltf.scene;
    setupModel();
    // Compile shaders now so the first drag / option click doesn't stutter.
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera).catch(() => {});
    else renderer.compile(scene, camera);
    emit('load', { gltf, variants: listVariants(), animations: gltf.animations.map((a) => a.name) });
  }

  function setupModel() {
    const m = config.model;
    pivot = new THREE.Group();
    pivot.name = '__pivot';
    model.rotation.set(m.rotation[0] * DEG, m.rotation[1] * DEG, m.rotation[2] * DEG);
    pivot.add(model);
    scene.add(pivot);

    if (m.normalizeSize) {
      const s0 = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      pivot.scale.setScalar(m.normalizeSize / Math.max(s0.x, s0.y, s0.z));
    }
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot);
    if (m.center) {
      const c = box.getCenter(new THREE.Vector3());
      pivot.position.set(-c.x, -box.min.y, -c.z); // centered on x/z, resting on the ground
      pivot.updateMatrixWorld(true);
      box.setFromObject(pivot);
    }
    size = box.getSize(new THREE.Vector3());
    bounds = box.clone();
    radius = box.getBoundingSphere(new THREE.Sphere()).radius;

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = config.lighting.shadows === 'soft';
      o.receiveShadow = false; // self-shadowing on glossy paint causes acne; the ground receives
      if (o.material?.map) o.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });

    camera.near = radius / 100;
    camera.far = radius * 100;
    fitDistance = computeFitDistance();
    controls.minDistance = fitDistance * config.camera.minDistance;
    controls.maxDistance = fitDistance * config.camera.maxDistance;
    controls.target.copy(defaultTarget());
    camera.position.setFromSpherical(sphericalFor(config.camera.start)).add(controls.target);
    camera.updateProjectionMatrix();
    controls.update();

    setupGround(box);
    setupKeyLight();

    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      const auto = config.model.animation;
      if (auto) {
        const clip = auto === true ? gltf.animations[0] : THREE.AnimationClip.findByName(gltf.animations, auto);
        if (clip) mixer.clipAction(clip).play();
      }
      renderer.shadowMap.autoUpdate = true;
    } else {
      renderer.shadowMap.autoUpdate = false; // static model: render the shadow once
      renderer.shadowMap.needsUpdate = true;
    }

    partCache.clear();
    for (const opt of config.options) {
      const def = opt.default ?? (opt.type === 'toggle' ? true : opt.choices?.[0]?.id);
      if (def !== undefined && opt.type !== 'views') api.setOption(opt.id, def, { silent: true });
    }
    setupHotspots();
    invalidate();
  }

  let ground = null;
  function setupGround(box) {
    if (ground) { scene.remove(ground); ground.geometry.dispose(); ground.material.map?.dispose(); ground.material.dispose(); ground = null; }
    const mode = config.lighting.shadows;
    if (mode === 'none') return;
    const extent = Math.max(size.x, size.z);
    if (mode === 'soft') {
      ground = new THREE.Mesh(new THREE.PlaneGeometry(extent * 4, extent * 4), new THREE.ShadowMaterial({ opacity: config.lighting.shadowOpacity }));
      ground.receiveShadow = true;
    } else {
      // "blob": a blurred radial gradient — nearly free, good for phones and busy pages.
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c);
      ground = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.5, size.z * 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: config.lighting.shadowOpacity * 1.6, depthWrite: false }));
    }
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = box.min.y + radius * 0.0005;
    ground.name = '__ground';
    scene.add(ground);
  }

  function setupKeyLight() {
    const k = config.lighting.keyLight;
    const dist = radius * 3;
    keyLight.position.setFromSphericalCoords(dist, (90 - k.elevation) * DEG, k.azimuth * DEG).add(defaultTarget());
    keyLight.target.position.copy(defaultTarget());
    keyLight.castShadow = config.lighting.shadows === 'soft';
    if (keyLight.castShadow) {
      const s = keyLight.shadow;
      const mapSize = mobile ? config.quality.mobileShadowMapSize : config.quality.shadowMapSize;
      s.mapSize.set(mapSize, mapSize);
      s.camera.left = s.camera.bottom = -radius * 1.3;
      s.camera.right = s.camera.top = radius * 1.3;
      s.camera.near = radius * 0.5;
      s.camera.far = radius * 6;
      s.camera.updateProjectionMatrix();
      s.bias = -0.0005;
      s.normalBias = radius * 0.004;
      s.radius = 4;
    }
  }

  // ---------- Parts (friendly names → meshes/materials, from config.parts) ----------
  function resolvePart(partId) {
    if (partCache.has(partId)) return partCache.get(partId);
    const def = config.parts[partId];
    if (!def) { console.warn(`[viewer] Unknown part "${partId}" — add it to config.parts.`); return { meshes: [], materials: [] }; }
    const byMat = nameMatcher(def.materials);
    const byMesh = nameMatcher([...(def.meshes || []), ...(def.nodes || [])]);
    const meshes = new Set();
    const materials = new Set();
    model.traverse((o) => {
      if (byMesh(o.name)) o.traverse((c) => { if (c.isMesh) meshes.add(c); });
      if (!o.isMesh) return;
      for (const mat of [].concat(o.material)) if (byMat(mat.name)) { meshes.add(o); materials.add(mat); }
    });
    // Meshes picked by name may share a material with non-part meshes (e.g. all glass).
    // Give them a private clone so edits don't leak onto other parts.
    for (const mesh of meshes) {
      const mats = [].concat(mesh.material);
      const next = mats.map((mat) => {
        if (materials.has(mat)) return mat;
        const clone = mat.clone();
        clone.name = mat.name;
        materials.add(clone);
        return clone;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    }
    const entry = { meshes: [...meshes], materials: [...materials] };
    if (!entry.meshes.length) console.warn(`[viewer] Part "${partId}" matched nothing. Run inspect_model.mjs and check names in config.parts.${partId}.`);
    partCache.set(partId, entry);
    return entry;
  }

  // ---------- Variants (KHR_materials_variants) ----------
  function listVariants() {
    return gltf?.userData?.gltfExtensions?.KHR_materials_variants?.variants?.map((v) => v.name) ?? [];
  }
  async function selectVariant(name) {
    const ext = gltf?.userData?.gltfExtensions?.KHR_materials_variants;
    if (!ext) return;
    const index = ext.variants.findIndex((v) => v.name === name);
    const jobs = [];
    model.traverse((o) => {
      const def = o.isMesh && o.userData.gltfExtensions?.KHR_materials_variants;
      if (!def) return;
      o.userData.originalMaterial ??= o.material;
      const mapping = def.mappings.find((mp) => mp.variants.includes(index));
      if (mapping) jobs.push(gltf.parser.getDependency('material', mapping.material).then((mat) => { o.material = mat; }));
      else o.material = o.userData.originalMaterial;
    });
    await Promise.all(jobs);
    partCache.clear(); // materials changed; re-resolve parts on next use
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  // A variant swaps whole materials, which would drop e.g. a tint picked earlier: re-layer them.
  async function reapplyNonVariantOptions(exceptId) {
    for (const o of config.options) {
      if (o.id === exceptId || o.type === 'variants' || o.type === 'views' || selections[o.id] === undefined) continue;
      const c = o.choices?.find((x) => x.id === selections[o.id]);
      if (c?.variant) continue;
      await api.setOption(o.id, selections[o.id], { silent: true });
    }
  }

  // ---------- Hotspots (HTML labels pinned to 3D points) ----------
  const raycaster = new THREE.Raycaster();
  let hotspotLayer = null;
  let lastOcclusionCheck = 0;
  function setupHotspots() {
    hotspotLayer?.remove();
    hotspots.length = 0;
    if (!config.hotspots.length) return;
    hotspotLayer = document.createElement('div');
    hotspotLayer.className = 'm3d-hotspots';
    container.appendChild(hotspotLayer);
    for (const h of config.hotspots) {
      let local;
      if (h.node) {
        const node = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(h.node)) || model.getObjectByName(h.node);
        if (!node) { console.warn(`[viewer] Hotspot "${h.id}": node "${h.node}" not found`); continue; }
        local = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
        pivot.worldToLocal(local);
      } else local = new THREE.Vector3(...h.position);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'm3d-hotspot';
      el.dataset.id = h.id;
      el.setAttribute('aria-label', h.label);
      el.innerHTML = `<span class="m3d-hotspot-dot" aria-hidden="true"></span><span class="m3d-hotspot-label">${h.label}</span>`;
      el.addEventListener('click', () => {
        emit('hotspot', { id: h.id, hotspot: h });
        if (h.view) api.goToView(h.view);
      });
      hotspotLayer.appendChild(el);
      hotspots.push({ def: h, local, el, occluded: false });
    }
  }
  function updateHotspots(now) {
    if (!hotspots.length) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const checkOcclusion = now - lastOcclusionCheck > 150;
    if (checkOcclusion) lastOcclusionCheck = now;
    for (const hs of hotspots) {
      const world = hs.local.clone().applyMatrix4(pivot.matrixWorld);
      const ndc = world.clone().project(camera);
      hs.el.style.transform = `translate(${((ndc.x + 1) / 2) * w}px, ${((1 - ndc.y) / 2) * h}px)`;
      if (checkOcclusion) {
        const dir = world.clone().sub(camera.position);
        const dist = dir.length();
        raycaster.set(camera.position, dir.normalize());
        raycaster.far = dist;
        const hit = raycaster.intersectObject(model, true)[0];
        hs.occluded = !!hit && hit.distance < dist - radius * 0.02;
      }
      hs.el.classList.toggle('is-occluded', hs.occluded || ndc.z > 1);
    }
  }

  // ---------- Render loop (renders only when something changed — saves phone batteries) ----------
  function frame(now) {
    if (disposed) return;
    requestAnimationFrame(frame);
    timer.update(now); // always tick so an off-screen pause doesn't produce one huge step
    if (!visible || !model) return;
    const dt = timer.getDelta();
    stepTween(now);
    if (!tween && controls.update(dt)) needsRender = true;
    if (mixer) { mixer.update(dt); needsRender = true; }
    if (!needsRender) return;
    needsRender = false;
    renderer.render(scene, camera);
    updateHotspots(now);
  }
  requestAnimationFrame(frame);

  // ---------- Touch guard: on phones a full-width canvas would swallow page scrolling ----------
  const guardEnabled = config.interaction.touchGuard === true || (config.interaction.touchGuard === 'auto' && mobile);
  function setInteractive(on) {
    controls.enabled = on;
    renderer.domElement.style.touchAction = on ? 'none' : 'pan-y';
    container.classList.toggle('is-interactive', on);
    emit('interactive', { interactive: on });
  }
  if (guardEnabled) setInteractive(false);
  events.addEventListener('visibility', (e) => { if (guardEnabled && e.detail.ratio < 0.3) setInteractive(false); });

  // ---------- Cleanup ----------
  function disposeObject(root) {
    root.traverse((o) => {
      o.geometry?.dispose();
      for (const mat of [].concat(o.material || [])) {
        for (const v of Object.values(mat)) if (v && v.isTexture) v.dispose();
        mat.dispose();
      }
    });
  }

  // ---------- Public API ----------
  const api = {
    config, scene, camera, renderer, controls, events,
    get model() { return model; },
    get gltf() { return gltf; },
    get selections() { return { ...selections }; },
    on(type, fn) { const h = (e) => fn(e.detail); events.addEventListener(type, h); return () => events.removeEventListener(type, h); },
    load,
    invalidate,
    listVariants,
    part: resolvePart,

    /** Apply an option from config.options: a choice id for swatches/variants, a boolean for toggles. */
    async setOption(id, value, { silent = false } = {}) {
      const opt = config.options.find((o) => o.id === id);
      if (!opt || !model) return;
      if (opt.type === 'toggle') {
        for (const mesh of resolvePart(opt.part).meshes) mesh.visible = !!value;
      } else if (opt.type === 'variants') {
        await selectVariant(value);
        await reapplyNonVariantOptions(id);
      } else {
        const choice = opt.choices.find((c) => c.id === value);
        if (!choice) return console.warn(`[viewer] Option "${id}" has no choice "${value}"`);
        if (choice.variant) { await selectVariant(choice.variant); await reapplyNonVariantOptions(id); }
        if (choice.material) for (const mat of resolvePart(opt.part).materials) {
          // envMapIntensity is ignored for materials that only inherit scene.environment.
          if ((choice.material.glass || choice.material.envMapIntensity !== undefined) && !mat.envMap) mat.envMap = scene.environment;
          applyMaterialProps(mat, choice.material);
        }
        if (choice.visible) for (const [partId, on] of Object.entries(choice.visible)) for (const mesh of resolvePart(partId).meshes) mesh.visible = on;
      }
      selections[id] = value;
      renderer.shadowMap.needsUpdate = true;
      invalidate();
      if (!silent) emit('change', { id, value, selections: { ...selections } });
    },

    /** Directly set material properties on a part: viewer.setPartMaterial('paint', { color: '#c00' }). */
    setPartMaterial(partId, props) {
      for (const mat of resolvePart(partId).materials) applyMaterialProps(mat, props);
      invalidate();
    },
    setPartVisible(partId, on) {
      for (const mesh of resolvePart(partId).meshes) mesh.visible = on;
      renderer.shadowMap.needsUpdate = true;
      invalidate();
    },
    goToView(viewId, ms) {
      const view = config.camera.views.find((v) => v.id === viewId);
      if (!view) return Promise.resolve();
      pauseAutoRotate();
      return animateCamera(view, ms);
    },
    resetView(ms) {
      return animateCamera(config.camera.start, ms);
    },
    setAutoRotate(on) {
      userAutoRotate = on && !reducedMotion;
      controls.autoRotate = userAutoRotate;
      clearTimeout(resumeTimer);
      invalidate();
    },
    get autoRotate() { return userAutoRotate; },
    playAnimation(name, { loop = true, fade = 0.3 } = {}) {
      if (!mixer) return;
      const clip = THREE.AnimationClip.findByName(gltf.animations, name) || gltf.animations[0];
      mixer.stopAllAction();
      const action = mixer.clipAction(clip);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity).fadeIn(fade).play();
      action.clampWhenFinished = !loop;
    },
    setInteractive,
    guardEnabled,
    /** PNG data URL of the current view (e.g. "save my build" / share images). */
    screenshot(type = 'image/png') {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL(type);
    },
    dispose() {
      disposed = true;
      ro.disconnect();
      io.disconnect();
      clearTimeout(resumeTimer);
      timer.dispose();
      controls.dispose();
      if (model) disposeObject(model);
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      hotspotLayer?.remove();
    },
  };

  resize();
  if (config.model.url) load(config.model.url).catch(() => {});
  return api;
}
