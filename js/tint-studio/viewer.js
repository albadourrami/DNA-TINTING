// Tint Studio 3D engine. Knows nothing about prices or page layout — it loads a vehicle
// (see vehicles/*.js), finds its windows, and tints them. Loaded lazily by main.js so the
// page never waits on three.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
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

// ---------- Studio lighting: a dark dealership studio with softbox strips ----------
// Long, thin light strips are what make car paint look expensive: they draw crisp highlight
// lines along the body. A cool rim from behind separates the car from the dark stage.
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const panel = (w, h, intensity, pos, lookAt, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.material.color.multiplyScalar(intensity);
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), new THREE.MeshBasicMaterial({ color: 0x12161e, side: THREE.BackSide }));
  room.position.y = 7;
  env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x1d222b }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.95;
  env.add(floor);
  panel(18, 4.5, 3.4, [0, 14.8, 0], [0, 0, 0]);                  // big overhead softbox
  panel(24, 0.7, 7.0, [0, 14.2, -4.5], [0, 0, -2]);              // thin overhead strips → roof/hood lines
  panel(24, 0.7, 7.0, [0, 14.2, 4.5], [0, 0, 2]);
  panel(26, 1.8, 3.6, [-19.5, 4.2, 0], [0, 3.6, 0]);             // side strips → door-line reflections
  panel(26, 1.8, 3.6, [19.5, 4.2, 0], [0, 3.6, 0]);
  panel(26, 0.5, 5.5, [-19.5, 7.5, 0], [0, 5, 0]);               // thin upper strips: shoulder-line sparkle
  panel(26, 0.5, 5.5, [19.5, 7.5, 0], [0, 5, 0]);
  panel(14, 5, 1.5, [0, 5, 19.5], [0, 3, 0]);                    // soft front fill
  panel(14, 4, 2.6, [0, 6, -19.5], [0, 3, 0], 0xcfe0ff);         // cool rim from behind
  panel(4, 10, 2.6, [-13, 5, 13], [0, 3, 0]);                    // vertical kickers
  panel(4, 10, 1.6, [13, 5, -13], [0, 3, 0], 0xd6e6ff);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
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
  renderer.localClippingEnabled = true; // windshield strip is cut with a clipping plane
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
  scene.environmentRotation = new THREE.Euler();

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

  // Showroom floor reflection (desktop tier only: it re-renders the car mirrored). A
  // radial fade keeps it a soft pool under the car instead of a hard mirror edge.
  let reflector = null;
  let reflectPass = null;
  if (tier === 'ultra' && !new URLSearchParams(location.search).has('no-reflection')) {
    reflector = new Reflector(new THREE.PlaneGeometry(1, 1), {
      textureWidth: 1024, textureHeight: 1024, color: 0x8a94a6,
      shader: {
        name: 'FadingReflector',
        uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, strength: { value: 0.32 } },
        vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vPlane;
          #include <common>
          #include <logdepthbuf_pars_vertex>
          void main() { vUv = textureMatrix * vec4(position, 1.0); vPlane = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
          }`,
        fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float strength; varying vec4 vUv; varying vec2 vPlane;
          #include <logdepthbuf_pars_fragment>
          void main() {
            #include <logdepthbuf_fragment>
            vec4 base = texture2DProj(tDiffuse, vUv);
            float d = length((vPlane - 0.5) * vec2(1.0, 1.15)) * 2.0;
            float fade = strength * (1.0 - smoothstep(0.18, 0.62, d));
            gl_FragColor = vec4(base.rgb * color, fade);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      },
    });
    reflector.material.transparent = true;
    reflector.material.depthWrite = false;
    reflector.rotation.x = -Math.PI / 2;
    reflector.renderOrder = -1;
    // Run the mirror pass ourselves, before the main render: nested inside the main render
    // (Reflector's default) it leaves the canvas blank with transmission glass in the scene.
    reflectPass = reflector.onBeforeRender;
    reflector.onBeforeRender = () => {};
    scene.add(reflector);
  }

  // A soft fill inside the cabin keeps seats readable through the glass, so each shade's
  // darkening is visible instead of every window reading as black.
  const cabinLight = new THREE.PointLight(0xfff1dd, 0, 0, 2);
  scene.add(cabinLight);

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
  let defaultTint = 0.35;
  let tints = new Map();            // zoneId → VLT 0..1 for every tinted window (mixable)
  let focusId = null;               // window being edited (breathing highlight)
  let anchors = new Map();          // zoneId → { point, out } for placing UI next to a window
  let compare = false;
  let entrance = null;              // camera sweep + lights-up when a car arrives
  let idleSpin = tier === 'ultra';  // slow turntable when nobody's touching the car (desktop: saves phone battery)
  let lastInteraction = performance.now();
  let envTurn = 0;                  // drifting reflections while the turntable runs
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const baseEnvIntensity = 1.3;
  const baseKey = 1.6;
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
    applyViewShift();
    if (model && Math.abs(prevAspect - camera.aspect) > 1e-3 && !userInteracted) frame(currentHeroView(), 0);
    else if (model) updateLimits();
    // setSize() clears the canvas: draw right away so a resizing stage never flashes empty.
    if (model && visible) { controls.update(); draw(); }
    invalidate();
  }

  // Vertical frame shift (px): lifts the car when UI docks over the bottom of the stage.
  let viewShift = 0;
  let viewShiftTarget = 0;
  function applyViewShift() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    if (Math.abs(viewShift) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(w, h, 0, viewShift, w, h);
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
    entrance = null;
    userInteracted = true;
    controls.autoRotate = false;
    lastInteraction = performance.now();
    emit('interaction');
  });
  controls.addEventListener('end', () => { lastInteraction = performance.now(); });
  controls.addEventListener('change', invalidate);

  // ---------- Zone state → materials ----------
  function applyZoneTargets() {
    for (const [id, z] of zones) {
      const vlt = tints.get(id);
      z.set({ amount: !compare && vlt !== undefined ? 1 : 0, vlt: vlt ?? z.target.vlt });
      z.focus = id === focusId;
    }
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
    // Skip hidden meshes and the clipped-away side of clipped glass (the strip and the rest
    // of the windshield share one surface; only the visible part may answer a click).
    const hit = raycaster.intersectObject(model, true)
      .find((h) => isShown(h.object) && (!h.object.userData.clip || h.object.userData.clip.distanceToPoint(h.point) >= 0));
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
    lastInteraction = performance.now();
    if (zoneId) {
      const r = renderer.domElement.getBoundingClientRect();
      emit('zoneclick', { zoneId, x: e.clientX - r.left, y: e.clientY - r.top });
    } else emit('emptyclick');
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
  // Desktop: the studio light and reflections lean slightly toward the cursor.
  if (!mobile) container.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const r = container.getBoundingClientRect();
    parallax.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    parallax.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    parallax.tx = parallax.ty = 0;
    if (hoverId) { zones.get(hoverId).hover = false; hoverId = null; renderer.domElement.style.cursor = ''; emit('zonehover', { zoneId: null }); invalidate(); }
  });

  // ---------- Render loop (only renders when something changed) ----------
  function loop(now) {
    if (disposed) return;
    requestAnimationFrame(loop);
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (!visible || !model) return;
    if (stepEntrance(now)) needsRender = true;
    else if (stepTween(now)) needsRender = true;
    else {
      // Idle turntable: after a few quiet seconds the car slowly turns and its reflections drift.
      const idle = idleSpin && !focusId && !reducedMotion() && now - lastInteraction > 7000;
      controls.autoRotate = idle;
      if (idle) { envTurn += dt * 0.05; scene.environmentRotation.y = envTurn; }
      if (controls.update(dt)) needsRender = true;
    }
    if (Math.abs(viewShiftTarget - viewShift) > 0.3) {
      viewShift += (viewShiftTarget - viewShift) * (reducedMotion() ? 1 : 1 - Math.exp(-9 * dt));
      if (Math.abs(viewShiftTarget - viewShift) <= 0.3) viewShift = viewShiftTarget;
      applyViewShift();
      needsRender = true;
    }
    // cursor parallax: ease the light toward the pointer
    if (!mobile && Math.abs(parallax.tx - parallax.x) + Math.abs(parallax.ty - parallax.y) > 1e-3) {
      parallax.x += (parallax.tx - parallax.x) * (1 - Math.exp(-4 * dt));
      parallax.y += (parallax.ty - parallax.y) * (1 - Math.exp(-4 * dt));
      scene.environmentRotation.y = envTurn + parallax.x * 0.22;
      placeKeyLight();
      needsRender = true;
    }
    for (const z of zones.values()) if (z.update(dt)) needsRender = true;
    if (!needsRender) return;
    needsRender = false;
    draw();
    emit('render');
  }

  function draw() {
    if (reflectPass) reflectPass.call(reflector, renderer, scene, camera);
    renderer.render(scene, camera);
  }

  // Key light position, nudged by the cursor so the shadow shifts a touch (desktop).
  let lightRadius = 3;
  function placeKeyLight() {
    const r = lightRadius;
    key.position.set(r * (0.6 + parallax.x * 0.35), r * 3.2, r * (1.2 + parallax.y * 0.3));
    key.target.position.copy(target);
    renderer.shadowMap.needsUpdate = true;
  }

  // Entrance: the camera glides in from a wide, low angle while the studio lights come up.
  function playEntrance(ms = 2400) {
    if (reducedMotion() || !model) { scene.environmentIntensity = baseEnvIntensity; key.intensity = baseKey; frame(currentHeroView(), 0); return; }
    const hero = currentHeroView();
    const start = { ...hero, azimuth: hero.azimuth - 62, elevation: 3, distance: 1.55 };
    frame(start, 0);
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    const end = new THREE.Spherical().setFromVector3(positionFor(hero).sub(target));
    entrance = { from, end, t0: performance.now(), ms };
    scene.environmentIntensity = 0.15;
    key.intensity = 0;
    invalidate();
  }
  function stepEntrance(now) {
    if (!entrance) return false;
    const k = Math.min(1, (now - entrance.t0) / entrance.ms);
    const e = 1 - Math.pow(1 - k, 4); // easeOutQuart: fast arrival, long graceful settle
    camera.position.setFromSpherical(new THREE.Spherical(
      THREE.MathUtils.lerp(entrance.from.radius, entrance.end.radius, e),
      THREE.MathUtils.lerp(entrance.from.phi, entrance.end.phi, e),
      THREE.MathUtils.lerp(entrance.from.theta, entrance.end.theta, e),
    )).add(target);
    controls.target.copy(target);
    const lights = Math.min(1, k * 1.6);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.15, baseEnvIntensity, lights);
    key.intensity = baseKey * lights;
    if (k >= 1) { entrance = null; lastInteraction = performance.now(); emit('entrance-done'); }
    return true;
  }

  // Anchor per window: a point on the glass plus the direction it faces (for UI placement).
  function computeAnchors() {
    anchors = new Map();
    const center = bounds.getCenter(new THREE.Vector3());
    for (const [id, z] of zones) {
      if (id === 'windshield') continue;
      const box = new THREE.Box3();
      for (const m of z.meshes) box.expandByObject(m);
      let point = box.getCenter(new THREE.Vector3());
      if (id === 'windshieldStrip' && stripAnchor) point = stripAnchor.clone();
      const out = point.clone().sub(center).setY(0).normalize();
      anchors.set(id, { point, out });
    }
  }
  let stripAnchor = null;
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

  // ---------- Windshield strip: the top band of the windshield, as its own zone ----------
  // Works on any model without re-cutting geometry: the windshield meshes are drawn twice,
  // each copy clipped by one side of a plane `depth` meters below the top edge (measured
  // along the glass). The upper copy is the tintable strip; the lower stays factory glass.
  function setupWindshieldStrip(v) {
    const ws = zones.get('windshield');
    const spec = v.windshield?.strip;
    if (!ws || !spec) return;
    const pts = [];
    const p = new THREE.Vector3();
    for (const m of ws.meshes) {
      m.updateWorldMatrix(true, false);
      const pos = m.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += step) pts.push(p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone());
    }
    const ys = pts.map((q) => q.y);
    const yMin = Math.min(...ys), yMax = Math.max(...ys), band = (yMax - yMin) * 0.1;
    const avg = (list) => list.reduce((a, q) => a.add(q), new THREE.Vector3()).divideScalar(list.length || 1);
    const top = avg(pts.filter((q) => q.y > yMax - band));
    const bottom = avg(pts.filter((q) => q.y < yMin + band));
    const up = top.clone().sub(bottom).normalize();          // up the glass, toward the roof
    const topEdge = Math.max(...pts.map((q) => q.dot(up)));
    const cut = topEdge - (spec.depth ?? 0.127);
    const stripPlane = new THREE.Plane(up.clone(), -cut);          // keeps the band above the cut
    const topPts = pts.filter((q) => q.dot(up) > cut);
    stripAnchor = avg(topPts.length ? topPts : pts);
    const restPlane = new THREE.Plane(up.clone().negate(), cut);   // keeps everything below
    const stripMeshes = ws.meshes.map((m) => {
      const c = new THREE.Mesh(m.geometry, m.material);
      c.name = `${m.name}__strip`;
      c.position.copy(m.position); c.quaternion.copy(m.quaternion); c.scale.copy(m.scale);
      c.renderOrder = m.renderOrder + 1;
      c.userData.zoneId = 'windshieldStrip';
      c.userData.clip = stripPlane;
      m.parent.add(c);
      m.userData.clip = restPlane;
      return c;
    });
    ws.setClip(restPlane);
    const strip = new GlassZone('windshieldStrip', stripMeshes, tier, scene.environment);
    strip.setClip(stripPlane);
    zones.set('windshieldStrip', strip);
    pickables.push(...stripMeshes);
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
        if (m.transparent) m.depthWrite = false; // lamp covers etc.: no sorting holes
      }
    });

    // Windows → zones.
    const { zones: zoneMeshes, otherGlass, report } = buildGlassZones(pivot, model, v);
    for (const [id, meshes] of zoneMeshes) {
      // The windshield itself is never selectable (only its strip is), so it has no zoneId.
      for (const m of meshes) m.userData.zoneId = id === 'windshield' ? null : id;
      zones.set(id, new GlassZone(id, meshes, tier, scene.environment));
      pickables.push(...meshes);
    }
    setupWindshieldStrip(v);
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
      const palette = { windshieldStrip: '#ff2d55', windshield: '#8e8e93', frontDriver: '#34c759', frontPassenger: '#0a84ff', rearDriver: '#ffcc00', rearPassenger: '#bf5af2', rearWindow: '#ff9500' };
      for (const [id, z] of zones) z.setDebugColor(palette[id]);
      console.log('Zones found:', [...zones.keys()]);
      console.groupEnd();
    }

    // Floor + key light sized to this vehicle.
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const extent = Math.max(size.x, size.z);
    floorGlow.scale.set(extent * 2.6, extent * 2.6, 1);
    if (reflector) { reflector.scale.set(extent * 2.2, extent * 2.2, 1); reflector.position.y = 0; }
    cabinLight.position.set(0, size.y * 0.62, 0);
    cabinLight.intensity = 0.9 * radius;
    contact.scale.set(size.x * 1.25, size.z * 1.12, 1);
    shadowCatcher.scale.set(extent * 3, extent * 3, 1);
    floorGlow.position.y = 0.001;
    contact.position.y = 0.002;
    shadowCatcher.position.y = 0.003;
    lightRadius = radius;
    placeKeyLight();
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
    focusId = null;
    applyZoneTargets();
    for (const z of zones.values()) { z.cur = { ...z.target }; z.apply(); } // no fade-in on load
    computeAnchors();
    userInteracted = false;
    frame(currentHeroView(), 0);
    controls.autoRotate = false;
    lastInteraction = performance.now();

    // Compile shaders now so the first interaction doesn't hitch.
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera).catch(() => {});
    else renderer.compile(scene, camera);
    playEntrance();
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
    /** Per-window tints: { zoneId: vltPercent }. Windows not listed show factory glass. */
    setZoneTints(map) {
      tints = new Map(Object.entries(map).map(([id, v]) => [id, THREE.MathUtils.clamp(v / 100, 0.01, 1)]));
      applyZoneTargets();
    },
    getZoneTints: () => Object.fromEntries([...tints].map(([id, v]) => [id, Math.round(v * 100)])),
    /** Every tinted window to one VLT (percent). Continuous values are fine (slider drag). */
    setTint(vltPercent) {
      defaultTint = THREE.MathUtils.clamp(vltPercent / 100, 0.01, 1);
      for (const id of tints.keys()) tints.set(id, defaultTint);
      applyZoneTargets();
    },
    /** Which windows are tinted (keeps each one's shade; new ones get the last slider shade). */
    setSelectedZones(ids) {
      tints = new Map(ids.map((id) => [id, tints.get(id) ?? defaultTint]));
      applyZoneTargets();
    },
    /** Highlight the window being edited (null to clear). */
    focusZone(id) { focusId = id || null; lastInteraction = performance.now(); applyZoneTargets(); },
    /** Where a window is on screen, for pinning UI to it: container px + whether it faces us. */
    projectZone(id) {
      const a = anchors.get(id);
      if (!a) return null;
      camera.updateMatrixWorld();
      const p = a.point.clone().project(camera);
      const w = container.clientWidth, h = container.clientHeight;
      const toCam = camera.position.clone().sub(a.point).setY(0).normalize();
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, onScreen: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1, facing: a.out.dot(toCam) > -0.15 };
    },
    /** Where the whole vehicle is on screen (container px), to keep UI off the car. */
    projectBounds() {
      if (!model) return null;
      camera.updateMatrixWorld();
      const w = container.clientWidth, h = container.clientHeight, p = new THREE.Vector3();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        p.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).project(camera);
        const x = ((p.x + 1) / 2) * w, y = ((1 - p.y) / 2) * h;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return { x0, y0, x1, y1 };
    },
    /** Reserve space at the bottom of the stage (px): the car glides up to stay clear of it. */
    setFrameInset(bottom = 0) { viewShiftTarget = bottom / 2; invalidate(); },
    playEntrance,
    setIdleSpin(on) { idleSpin = !!on; lastInteraction = performance.now(); invalidate(); },
    /** Show factory glass everywhere (before/after comparison). */
    setCompare(on) { compare = !!on; applyZoneTargets(); },
    /** Subtle glow on the given zones — "these windows just changed". */
    pulse(ids = [...tints.keys()]) { for (const id of ids) zones.get(id)?.set({ glow: 0.55 }); invalidate(); },
    availableZones: () => [...zones.keys()].filter((id) => id !== 'windshield'),
    view(name, ms) { userInteracted = true; entrance = null; lastInteraction = performance.now(); return frame(viewFor(name), ms); },
    resetView(ms) { userInteracted = false; return frame(currentHeroView(), ms); },
    setAutoRotate(on) { controls.autoRotate = !!on && !reducedMotion(); invalidate(); },
    /** Full control (fullscreen): let one-finger drags orbit freely on phones. */
    setFreeTouch(on) { setTouchAction(on || !mobile ? 'none' : 'pan-y'); },
    resize,
    screenshot() { draw(); return renderer.domElement.toDataURL('image/webp', 0.9); },
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
    get _internals() { return { scene, camera, controls, renderer, zones, anchors }; },
  };
  resize();
  return api;
}
