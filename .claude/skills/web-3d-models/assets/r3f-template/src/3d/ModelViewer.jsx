// React Three Fiber viewer driven by the same model.config.js schema as the vanilla template.
//
//   <ModelViewer config={config} selections={{ tint: '35' }} view="front" onLoad={...} />
//
// It's a *controlled* component: your React UI owns `selections` (and optionally `view`), so
// the 3D state can live next to prices, forms, carts, etc. Swapping the model = editing config.
//
// Next.js: import with `dynamic(() => import('./3d/ModelViewer'), { ssr: false })` — WebGL
// can't render on the server.

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import { DEG, applySelections, fitDistance, listVariants, viewPosition } from './core.js';

const TONE = { neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, none: THREE.NoToneMapping };
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Built-in "studio" lighting made of light panels: no HDR download, crisp reflections on paint/glass.
function StudioEnvironment({ intensity = 1, rotation = 0 }) {
  return (
    <Environment resolution={256} environmentIntensity={intensity} environmentRotation={[0, rotation * DEG, 0]}>
      <Lightformer form="rect" intensity={2.5} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      <Lightformer form="rect" intensity={1.5} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={1.5} position={[6, 2, -2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
      <Lightformer form="ring" intensity={0.8} position={[0, 1, 8]} scale={4} />
    </Environment>
  );
}

function Model({ config, selections, onLoad, onBounds }) {
  const gltf = useGLTF(config.model.url, config.decoders?.draco ?? true, true);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const partCache = useMemo(() => new Map(), [gltf]);
  const pivot = useRef();

  // Center on x/z, rest on the ground, optional rotate/normalize — same as the vanilla viewer.
  useLayoutEffect(() => {
    const m = config.model;
    const scene = gltf.scene;
    scene.rotation.set(...(m.rotation || [0, 0, 0]).map((d) => d * DEG));
    const g = pivot.current;
    g.position.set(0, 0, 0);
    g.scale.setScalar(1);
    g.updateMatrixWorld(true);
    if (m.normalizeSize) {
      const s = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
      g.scale.setScalar(m.normalizeSize / Math.max(s.x, s.y, s.z));
      g.updateMatrixWorld(true);
    }
    let box = new THREE.Box3().setFromObject(g);
    if (m.center !== false) {
      const c = box.getCenter(new THREE.Vector3());
      g.position.set(-c.x, -box.min.y, -c.z);
      g.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(g);
    }
    scene.traverse((o) => { if (o.isMesh && o.material?.map) o.material.map.anisotropy = gl.capabilities.getMaxAnisotropy(); });
    onBounds(box);
    onLoad?.({ gltf, variants: listVariants(gltf), animations: gltf.animations.map((a) => a.name) });
  }, [gltf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    applySelections({ gltf, root: gltf.scene, config, selections: selections || {}, partCache }).then(() => {
      if (cancelled) return;
      gl.shadowMap.needsUpdate = true; // parts may have been hidden/shown
      invalidate();
    });
    return () => { cancelled = true; };
  }, [gltf, selections, config, partCache, invalidate, gl]);

  return <group ref={pivot}><primitive object={gltf.scene} /></group>;
}

// Frames the model on load/resize and animates to named views.
function CameraRig({ config, bounds, view, controls }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const fit = useRef(1);
  const tween = useRef(null);
  const cam = config.camera;

  useEffect(() => {
    if (!bounds || !controls.current) return;
    const target = new THREE.Vector3(0, bounds.getSize(new THREE.Vector3()).y * 0.45, 0);
    fit.current = Math.max(fitDistance(bounds, camera, target, cam.start, cam.fitMargin), 0.01);
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    camera.near = radius / 100;
    camera.far = radius * 100;
    camera.updateProjectionMatrix();
    const c = controls.current;
    c.minDistance = fit.current * cam.minDistance;
    c.maxDistance = fit.current * cam.maxDistance;
    c.target.copy(target);
    camera.position.copy(viewPosition(cam.start, target, fit.current));
    c.update();
    invalidate();
  }, [bounds, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = cam.views?.find((x) => x.id === view);
    if (!v || !controls.current || !bounds) return;
    const c = controls.current;
    const to = viewPosition(v, c.target, fit.current);
    if (reducedMotion()) { camera.position.copy(to); c.update(); invalidate(); return; }
    tween.current = { from: camera.position.clone(), to, t0: performance.now(), ms: 900 };
    invalidate();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const t = tween.current;
    if (!t || !controls.current) return;
    const k = Math.min(1, (performance.now() - t.t0) / t.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    // Interpolate on the sphere around the target so the camera orbits instead of cutting through.
    const tgt = controls.current.target;
    const a = new THREE.Spherical().setFromVector3(t.from.clone().sub(tgt));
    const b = new THREE.Spherical().setFromVector3(t.to.clone().sub(tgt));
    let dT = b.theta - a.theta;
    dT = ((dT + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    camera.position.setFromSpherical(new THREE.Spherical(
      THREE.MathUtils.lerp(a.radius, b.radius, e), THREE.MathUtils.lerp(a.phi, b.phi, e), a.theta + dT * e,
    )).add(tgt);
    controls.current.update();
    if (k >= 1) tween.current = null;
    invalidate();
  });
  return null;
}

// Soft shadow on an invisible ground (ShadowMaterial). Deliberately not drei <ContactShadows>:
// with three r186 + drei 10.7 it rendered nothing in testing. Static model → shadow map renders once.
function GroundShadow({ bounds, opacity, mapSize, keyLight = {} }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const light = useRef();
  const size = bounds.getSize(new THREE.Vector3());
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const target = new THREE.Vector3(0, size.y * 0.45, 0);
  const pos = new THREE.Vector3().setFromSphericalCoords(radius * 3, (90 - (keyLight.elevation ?? 55)) * DEG, (keyLight.azimuth ?? 40) * DEG).add(target);
  useLayoutEffect(() => {
    scene.traverse((o) => { if (o.isMesh && !o.userData.isGround) o.castShadow = true; });
    light.current.target.position.copy(target);
    light.current.target.updateMatrixWorld();
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  });
  const extent = Math.max(size.x, size.z) * 4;
  const s = radius * 1.3;
  return (
    <>
      <directionalLight ref={light} position={pos} intensity={keyLight.intensity ?? 1.2} castShadow
        shadow-mapSize={[mapSize, mapSize]} shadow-bias={-0.0005} shadow-normalBias={radius * 0.004} shadow-radius={4}
        shadow-camera-left={-s} shadow-camera-right={s} shadow-camera-top={s} shadow-camera-bottom={-s}
        shadow-camera-near={radius * 0.5} shadow-camera-far={radius * 6} />
      <mesh rotation-x={-Math.PI / 2} position-y={bounds.min.y + radius * 0.0005} receiveShadow userData={{ isGround: true }}>
        <planeGeometry args={[extent, extent]} />
        <shadowMaterial opacity={opacity} />
      </mesh>
    </>
  );
}

class LoadBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { this.props.onError?.(error); }
  render() { return this.state.error ? null : this.props.children; }
}

export default function ModelViewer({ config, selections, view, onLoad, onError, className = '', children }) {
  const cam = config.camera;
  const light = config.lighting || {};
  const quality = config.quality || {};
  const mobile = useMemo(coarse, []);
  const [bounds, setBounds] = useState(null);
  const [failed, setFailed] = useState(null);
  const [visible, setVisible] = useState(true);
  const [interactive, setInteractive] = useState(!(config.interaction?.touchGuard === true || (config.interaction?.touchGuard !== false && mobile)));
  const [autoRotate, setAutoRotate] = useState(cam.autoRotate && !reducedMotion());
  const controls = useRef();
  const stage = useRef();
  const { active, progress } = useProgress();

  // Stop rendering entirely while scrolled off-screen.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { setVisible(e.isIntersecting); if (e.intersectionRatio < 0.3 && mobile) setInteractive(false); }, { threshold: [0, 0.3] });
    io.observe(stage.current);
    return () => io.disconnect();
  }, [mobile]);

  const size = bounds ? bounds.getSize(new THREE.Vector3()) : null;
  const loaded = !!bounds;

  return (
    <div className={`m3d m3d--no-panel ${loaded ? 'is-loaded' : ''} ${failed ? 'is-error' : ''} ${className}`}>
      <div ref={stage} className={`m3d-stage ${interactive ? 'is-interactive' : ''}`} tabIndex={0} aria-label={`${config.model.alt || '3D model'} — interactive 3D view`}>
        {config.model.poster && <img className="m3d-poster" src={config.model.poster} alt={config.model.alt || ''} />}
        {!failed && (
          <Canvas
            className="m3d-canvas"
            style={{ touchAction: interactive ? 'none' : 'pan-y' }}
            dpr={[1, mobile ? quality.mobileMaxPixelRatio ?? 1.5 : quality.maxPixelRatio ?? 2]}
            frameloop={!visible ? 'never' : autoRotate ? 'always' : 'demand'}
            shadows={light.shadows === 'none' ? false : 'percentage'}
            camera={{ fov: cam.fov ?? 35, position: [4, 2, 6] }}
            gl={{ antialias: quality.antialias ?? true, alpha: true, toneMapping: TONE[light.toneMapping] ?? THREE.NeutralToneMapping, toneMappingExposure: light.exposure ?? 1 }}
          >
            <LoadBoundary onError={(e) => { setFailed(e); onError?.(e); }}>
              <Suspense fallback={null}>
                {config.environment?.preset && config.environment.preset !== 'room'
                  ? <Environment files={config.environment.preset} environmentIntensity={config.environment.intensity ?? 1} />
                  : <StudioEnvironment intensity={config.environment?.intensity} rotation={config.environment?.rotation} />}
                <Model config={config} selections={selections} onLoad={onLoad} onBounds={setBounds} />
                {bounds && light.shadows !== 'none' && <GroundShadow bounds={bounds} opacity={light.shadowOpacity ?? 0.35} mapSize={mobile ? 1024 : 2048} keyLight={light.keyLight} />}
                {children}
              </Suspense>
            </LoadBoundary>
            <OrbitControls
              ref={controls}
              makeDefault
              enabled={interactive}
              enableDamping
              dampingFactor={0.08}
              enablePan={cam.enablePan ?? false}
              minPolarAngle={(90 - (cam.maxElevation ?? 80)) * DEG}
              maxPolarAngle={(90 - (cam.minElevation ?? -2)) * DEG}
              autoRotate={autoRotate}
              autoRotateSpeed={cam.autoRotateSpeed ?? 0.6}
              onStart={() => setAutoRotate(false)}
            />
            <CameraRig config={config} bounds={bounds} view={view} controls={controls} />
          </Canvas>
        )}

        {!loaded && !failed && (
          <div className="m3d-loading" role="status">
            <div className="m3d-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${active ? progress : 0}%` }} />
            </div>
            <p className="m3d-loading-text">Loading 3D model… {Math.round(progress)}%</p>
          </div>
        )}
        {failed && (
          <div className="m3d-error" role="alert"><p>The 3D model couldn’t load. Check your connection and refresh.</p></div>
        )}
        {loaded && !interactive && (
          <button type="button" className="m3d-activate" onClick={() => setInteractive(true)}>Tap to rotate &amp; zoom</button>
        )}
        {loaded && interactive && mobile && (
          <button type="button" className="m3d-btn m3d-done" onClick={() => setInteractive(false)}>Done</button>
        )}
      </div>
    </div>
  );
}

ModelViewer.preload = (config) => useGLTF.preload(config.model.url, config.decoders?.draco ?? true, true);
