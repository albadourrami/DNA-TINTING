// Tint Studio 3D engine. Knows nothing about prices or page layout — it loads a vehicle
// (see vehicles/*.js), finds its windows, and tints them. Loaded lazily by main.js so the
// page never waits on three.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildGlassZones } from './glass-zones.js';
import { GlassZone, factoryGlassMaterial } from './glass.js';

const DEG = Math.PI / 180;
const LIBS = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}/examples/jsm/libs/`;

// Named camera angles (the car faces +Z; its driver side is +X).
export const VIEWS = {
  hero: null, // from the vehicle config
  front: { azimuth: 0, elevation: 7 },
  driver: { azimuth: 90, elevation: 6 },
  passenger: { azimuth: -90, elevation: 6 },
  rear: { azimuth: 180, elevation: 9 },
  top: { azimuth: 35, elevation: 62 },
};

const coarsePointer = () => matchMedia('(pointer: coarse)').matches;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function pickTier() {
  const forced = new URLSearchParams(location.search).get('glass');
  if (forced === 'ultra' || forced === 'fast') return forced;
  const lowMemory = (navigator.deviceMemory || 8) <= 4;
  return coarsePointer() || lowMemory ? 'fast' : 'ultra';
}

// ---------- Studio lighting: a dark photo studio with softbox strips ----------
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const panel = (w, h, intensity, pos, lookAt, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.material.color.multiplyScalar(intensity);
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), new THREE.MeshBasicMaterial({ color: 0x161a22, side: THREE.BackSide }));
  room.position.y = 7;
  env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x1b1f27 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.95;
  env.add(floor);
  panel(16, 3.2, 4, [0, 14.8, 0], [0, 0, 0]);                 // long overhead strip → hood/roof highlight
  panel(22, 2.2, 3.2, [-19.5, 5, 0], [0, 4, 0]);                // side strips → door-line reflections
  panel(22, 2.2, 3.2, [19.5, 5, 0], [0, 4, 0]);
  panel(12, 5, 1.6, [0, 5, 19.5], [0, 3, 0]);                    // soft front fill
  panel(12, 4, 2.2, [0, 6, -19.5], [0, 3, 0], 0xdbe7ff);         // cool rim from behind
  panel(4, 9, 2.4, [-13, 5, 13], [0, 3, 0]);                     // vertical kicker, front-left
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  pmrem.dispose();
  return tex;
}

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Box-based framing: distance at which the vehicle's box fills the frame from a view.
function fitDistance(box, camera, target, view, margin = 1.1) {
  const tanV = Math.tan((camera.fov * DEG) / 2);
  const tanH = tanV * camera.aspect;
  const eye = new THREE.Vector3().setFromSphericalCoords(1, (90 - view.elevation) * DEG, view.azimuth * DEG);
  const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  new THREE.Matrix4().lookAt(eye, new THREE.Vector3(), camera.up).extractBasis(right, up, back);
  const p = new THREE.Vector3();
  let d = 0;
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target);
    const z = p.dot(back);
    d = Math.max(d, z + (margin * Math.abs(p.dot(right))) / tanH, z + (margin * Math.abs(p.dot(up))) / tanV);
  }
  return d;
}

export async function createTintViewer(container, { tier = pickTier(), debug = false } = {}) {
  const events = new EventTarget();
  const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
  const mobile = coarsePointer();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === 'fast' ? 1.5 : 2));
  renderer.domElement.className = 'studio-canvas';
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', '3D vehicle — drag to rotate, pinch or scroll to zoom, tap a window to select it');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1.3;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.castShadow = true;
  scene.add(key, key.target);

  // Floor: a soft pool of light under the car plus a shadow catcher on top of it.
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(120,140,170,0.30)'], [0.45, 'rgba(90,105,130,0.12)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false,
  }));
  floorGlow.rotation.x = -Math.PI / 2;
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(0,0,0,0.85)'], [0.55, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false,
  }));
  contact.rotation.x = -Math.PI / 2;
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.55 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.receiveShadow = true;
  scene.add(floorGlow, contact, shadowCatcher);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.rotateSpeed = mobile ? 0.85 : 0.6;
  controls.zoomSpeed = 0.7;
  controls.minPolarAngle = 22 * DEG;      // no straight-down views
  controls.maxPolarAngle = 87 * DEG;      // stay above the floor
  controls.autoRotateSpeed = 0.45;
  // Phones: vertical swipes keep scrolling the page; horizontal swipes rotate, pinch zooms.
  const setTouchAction = (v) => { renderer.domElement.style.touchAction = v; };
  setTouchAction(mobile ? 'pan-y' : 'none');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(new DRACOLoader().setDecoderPath(`${LIBS}draco/gltf/`));
  loader.setKTX2Loader(new KTX2Loader().setTranscoderPath(`${LIBS}basis/`).detectSupport(renderer));
  loader.setMeshoptDecoder(MeshoptDecoder);

  // ---------- State ----------
  let vehicle = null;
  let pivot = null;
  let model = null;
  let bounds = new THREE.Box3();
  let target = new THREE.Vector3();
  let zones = new Map();          // zoneId → GlassZone
  let pickables = [];
  let extraMaterials = [];
  let tint = 0.35;
  let selected = new Set();
  let compare = false;
  let needsRender = true;
  let visible = true;
  let tween = null;
  let loadToken = 0;
  let disposed = false;
  let userInteracted = false;
  const timer = new THREE.Timer();
  timer.connect(document);
  const invalidate = () => { needsRender = true; };

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const prevAspect = camera.aspect;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (model && Math.abs(prevAspect - camera.aspect) > 1e-3 && !userInteracted) frame(currentHeroView(), 0);
    else if (model) updateLimits();
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) invalidate(); }, { threshold: 0 });
  io.observe(container);

  const currentHeroView = () => ({ azimuth: 35, elevation: 8, distance: 1, ...(vehicle?.camera || {}) });
  function viewFor(name) { return name === 'hero' || !VIEWS[name] ? currentHeroView() : { distance: 1, ...VIEWS[name] }; }

  function updateLimits() {
    const hero = fitDistance(bounds, camera, target, currentHeroView());
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    // Never inside the car: the bounding sphere is the hard floor for zoom.
    controls.minDistance = Math.max(radius * 1.02, hero * 0.5);
    controls.maxDistance = hero * 1.7;
  }

  function positionFor(view) {
    const d = fitDistance(bounds, camera, target, view) * (view.distance ?? 1);
    return new THREE.Vector3().setFromSphericalCoords(
      THREE.MathUtils.clamp(d, controls.minDistance || 0, controls.maxDistance || Infinity),
      THREE.MathUtils.clamp((90 - view.elevation) * DEG, controls.minPolarAngle, controls.maxPolarAngle),
      view.azimuth * DEG,
    ).add(target);
  }

  function frame(view, ms = 900) {
    updateLimits();
    const to = positionFor(view);
    if (!ms || reducedMotion()) {
      tween = null;
      camera.position.copy(to);
      controls.target.copy(target);
      controls.update();
      invalidate();
      return Promise.resolve();
    }
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    const end = new THREE.Spherical().setFromVector3(to.clone().sub(target));
    let dT = end.theta - from.theta;
    dT = ((dT + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    end.theta = from.theta + dT;
    return new Promise((resolve) => { tween = { from, end, t0: performance.now(), ms, resolve }; invalidate(); });
  }

  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.t0) / tween.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.setFromSpherical(new THREE.Spherical(
      THREE.MathUtils.lerp(tween.from.radius, tween.end.radius, e),
      THREE.MathUtils.lerp(tween.from.phi, tween.end.phi, e),
      THREE.MathUtils.lerp(tween.from.theta, tween.end.theta, e),
    )).add(target);
    controls.target.copy(target);
    if (k >= 1) { const r = tween.resolve; tween = null; r(); }
    return true;
  }

  controls.addEventListener('start', () => {
    tween = null;
    userInteracted = true;
    controls.autoRotate = false;
    emit('interaction');
  });
  controls.addEventListener('change', invalidate);

  // ---------- Zone state → materials ----------
  function applyZoneTargets() {
    for (const [id, z] of zones) z.set({ amount: !compare && selected.has(id) ? 1 : 0, vlt: tint });
    invalidate();
  }

  // ---------- Picking windows (tap/click) + hover highlight ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const isShown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function zoneAt(clientX, clientY) {
    if (!model) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(model, true).find((h) => isShown(h.object));
    return hit?.object.userData.zoneId || null;
  }
  let down = null;
  // A tap/click is a short press that barely moves. Event timestamps (not "now") so a slow
  // frame between down and up can't turn a click into a long press.
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: e.timeStamp }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = e.timeStamp - down.t < 500;
    down = null;
    if (moved > 6 || !quick) return;
    const zoneId = zoneAt(e.clientX, e.clientY);
    if (zoneId) emit('zoneclick', { zoneId });
  });
  let hoverId = null;
  let hoverPending = false;
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (mobile || e.buttons || hoverPending) return;
    hoverPending = true;
    setTimeout(() => {
      hoverPending = false;
      const id = zoneAt(e.clientX, e.clientY);
      if (id === hoverId) return;
      if (hoverId) zones.get(hoverId).hover = false;
      hoverId = id;
      if (id) zones.get(id).hover = true;
      renderer.domElement.style.cursor = id ? 'pointer' : '';
      emit('zonehover', { zoneId: id });
      invalidate();
    }, 70);
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    if (hoverId) { zones.get(hoverId).hover = false; hoverId = null; renderer.domElement.style.cursor = ''; emit('zonehover', { zoneId: null }); invalidate(); }
  });

  // ---------- Render loop (only renders when something changed) ----------
  function loop(now) {
    if (disposed) return;
    requestAnimationFrame(loop);
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (!visible || !model) return;
    if (stepTween(now)) needsRender = true;
    else if (controls.update(dt)) needsRender = true;
    for (const z of zones.values()) if (z.update(dt)) needsRender = true;
    if (!needsRender) return;
    needsRender = false;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);

  // ---------- Loading ----------
  function disposeModel() {
    for (const z of zones.values()) z.dispose();
    zones = new Map();
    for (const m of extraMaterials) m.dispose();
    extraMaterials = [];
    if (pivot) {
      scene.remove(pivot);
      pivot.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) {
          for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
          m.dispose();
        }
      });
    }
    pivot = model = null;
    pickables = [];
  }

  async function loadVehicle(v) {
    const token = ++loadToken;
    emit('progress', { ratio: 0 });
    let gltf;
    try {
      gltf = await loader.loadAsync(v.modelUrl, (e) => emit('progress', { ratio: e.total ? e.loaded / e.total : null }));
    } catch (error) {
      if (token === loadToken) emit('error', { error, vehicle: v });
      throw error;
    }
    if (token !== loadToken || disposed) return false; // superseded by a newer selection

    disposeModel();
    vehicle = v;
    model = gltf.scene;
    pivot = new THREE.Group();
    const [rx, ry, rz] = v.rotation || [0, 0, 0];
    model.rotation.set(rx * DEG, ry * DEG, rz * DEG);
    pivot.add(model);
    scene.add(pivot);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot);
    const c = box.getCenter(new THREE.Vector3());
    pivot.position.set(-c.x, -box.min.y, -c.z);   // centered, wheels on the floor
    pivot.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(pivot);
    const size = bounds.getSize(new THREE.Vector3());
    target = new THREE.Vector3(0, size.y * 0.42, 0);

    // Paint/trim overrides from the vehicle config.
    const overrides = v.appearance || {};
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      for (const m of [].concat(o.material)) {
        const ov = overrides[m.name];
        if (ov) for (const [k, val] of Object.entries(ov)) { if (m[k]?.isColor) m[k].set(val); else m[k] = val; }
        if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      }
    });

    // Windows → zones.
    const { zones: zoneMeshes, otherGlass, report } = buildGlassZones(pivot, model, v);
    for (const [id, meshes] of zoneMeshes) {
      for (const m of meshes) m.userData.zoneId = id;
      zones.set(id, new GlassZone(id, meshes, tier, scene.environment));
      pickables.push(...meshes);
    }
    for (const m of otherGlass) {
      if (tier === 'fast' && [].concat(m.material).some((x) => x.transmission > 0)) {
        const fm = factoryGlassMaterial(tier, [].concat(m.material)[0].side);
        extraMaterials.push(fm);
        m.material = fm;
      }
    }
    if (debug) {
      console.groupCollapsed(`[tint-studio] ${v.make} ${v.model}: glass analysis`);
      console.table(report);
      const palette = { windshield: '#ff3b30', frontDriver: '#34c759', frontPassenger: '#0a84ff', rearDriver: '#ffcc00', rearPassenger: '#bf5af2', rearWindow: '#ff9500' };
      for (const [id, z] of zones) z.setDebugColor(palette[id]);
      console.log('Zones found:', [...zones.keys()]);
      console.groupEnd();
    }

    // Floor + key light sized to this vehicle.
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const extent = Math.max(size.x, size.z);
    floorGlow.scale.set(extent * 2.6, extent * 2.6, 1);
    contact.scale.set(size.x * 1.25, size.z * 1.12, 1);
    shadowCatcher.scale.set(extent * 3, extent * 3, 1);
    floorGlow.position.y = 0.001;
    contact.position.y = 0.002;
    shadowCatcher.position.y = 0.003;
    key.position.set(radius * 0.6, radius * 3.2, radius * 1.2);
    key.target.position.copy(target);
    const s = key.shadow;
    s.mapSize.setScalar(mobile ? 1024 : 2048);
    s.camera.left = s.camera.bottom = -radius * 1.1;
    s.camera.right = s.camera.top = radius * 1.1;
    s.camera.near = radius * 0.5;
    s.camera.far = radius * 6;
    s.camera.updateProjectionMatrix();
    s.bias = -0.0004;
    s.normalBias = radius * 0.003;
    s.radius = 5;
    renderer.shadowMap.needsUpdate = true;

    camera.near = radius / 50;
    camera.far = radius * 60;
    camera.updateProjectionMatrix();
    applyZoneTargets();
    for (const z of zones.values()) { z.cur = { ...z.target }; z.apply(); } // no fade-in on load
    userInteracted = false;
    frame(currentHeroView(), 0);
    controls.autoRotate = false;

    // Compile shaders now so the first interaction doesn't hitch.
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera).catch(() => {});
    else renderer.compile(scene, camera);
    invalidate();
    emit('load', { vehicle: v, zones: [...zones.keys()] });
    return true;
  }

  // ---------- Public API ----------
  const api = {
    tier,
    events,
    on(type, fn) { const h = (e) => fn(e.detail); events.addEventListener(type, h); return () => events.removeEventListener(type, h); },
    loadVehicle,
    /** Film VLT in percent (5–70). Continuous values are fine (slider drag). */
    setTint(vltPercent) { tint = THREE.MathUtils.clamp(vltPercent / 100, 0.01, 1); applyZoneTargets(); },
    setSelectedZones(ids) { selected = new Set(ids); applyZoneTargets(); },
    /** Show factory glass everywhere (before/after comparison). */
    setCompare(on) { compare = !!on; applyZoneTargets(); },
    /** Subtle glow on the given zones — "these windows just changed". */
    pulse(ids = [...selected]) { for (const id of ids) zones.get(id)?.set({ glow: 0.55 }); invalidate(); },
    availableZones: () => [...zones.keys()],
    view(name, ms) { userInteracted = true; return frame(viewFor(name), ms); },
    resetView(ms) { userInteracted = false; return frame(currentHeroView(), ms); },
    setAutoRotate(on) { controls.autoRotate = !!on && !reducedMotion(); invalidate(); },
    /** Full control (fullscreen): let one-finger drags orbit freely on phones. */
    setFreeTouch(on) { setTouchAction(on || !mobile ? 'none' : 'pan-y'); },
    resize,
    screenshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/webp', 0.9); },
    dispose() {
      disposed = true;
      ro.disconnect();
      io.disconnect();
      timer.dispose();
      controls.dispose();
      disposeModel();
      scene.environment?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    // for tests / debugging
    get _internals() { return { scene, camera, controls, renderer, zones }; },
  };
  resize();
  return api;
}
