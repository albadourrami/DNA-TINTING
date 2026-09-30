// Tinted-glass rendering for one window zone.
//
// Two quality tiers, same look:
//  - 'ultra' (desktop): one physically based material. transmission = 1 renders the car's
//    interior through the glass, and the film's darkness multiplies what comes through
//    (color = VLT). IOR 1.5 gives real Fresnel reflections of the studio environment.
//  - 'fast' (phones/tablets): two cheap layers on the same geometry. A tint layer blends
//    the interior toward the film color (opacity = 1 − VLT), then an additive reflection
//    layer adds environment reflections on top, so dark glass still reads as glossy glass
//    instead of a flat black panel. No extra full-scene render pass is needed.
//
// All changes are eased per frame (update(dt)), so tint and selection changes fade
// smoothly instead of snapping.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/+esm';

// Factory (untinted) automotive glass: ~80% VLT with the usual faint green cast.
const FACTORY = { vlt: 0.8, color: new THREE.Color('#d9ebe3') };
// Film: neutral charcoal, very slightly cool.
const FILM = { color: new THREE.Color('#1b2129') };
const HIGHLIGHT = new THREE.Color('#4f9bff');

// Perceived darkness: a studio interior is brighter than a real cabin, so linear VLT alone
// looks too light. The exponent pulls mid shades darker, matching real-world photos
// (35% should read as clearly tinted, 5% as near-black but still glassy).
const perceived = (vlt) => Math.pow(THREE.MathUtils.clamp(vlt, 0, 1), 1.35);

const damp = (cur, target, dt, speed = 11) => cur + (target - cur) * (1 - Math.exp(-speed * dt));

export class GlassZone {
  // envMap is passed explicitly: with only scene.environment, three.js ignores a material's
  // envMapIntensity (it uses scene.environmentIntensity), and glass needs its own level.
  constructor(id, meshes, tier, envMap) {
    this.id = id;
    this.envMap = envMap;
    this.meshes = meshes;
    this.tier = tier;
    // amount: 0 = factory glass, 1 = film. vlt: film VLT (0..1). glow: highlight 0..1.
    this.cur = { amount: 0, vlt: 0.35, glow: 0 };
    this.target = { amount: 0, vlt: 0.35, glow: 0 };
    this.hover = false;
    this.focus = false;     // the window the customer is editing: soft breathing glow
    this.time = 0;
    this.layers = [];
    const side = meshes[0] ? [].concat(meshes[0].material)[0]?.side ?? THREE.DoubleSide : THREE.DoubleSide;
    if (tier === 'ultra') this.buildUltra(side); else this.buildFast(side);
    this.apply();
  }

  buildUltra(side) {
    this.mat = new THREE.MeshPhysicalMaterial({
      name: `tint-${this.id}`,
      color: 0xffffff,
      metalness: 0,
      roughness: 0.035,
      transmission: 1,
      thickness: 0,          // thin automotive glass: no visible refraction offset
      ior: 1.5,
      specularIntensity: 1,
      envMap: this.envMap,
      envMapIntensity: 0.6,
      emissive: HIGHLIGHT,
      emissiveIntensity: 0,
      side,
    });
    for (const m of this.meshes) m.material = this.mat;
  }

  buildFast(side) {
    this.tintMat = new THREE.MeshBasicMaterial({
      name: `tint-${this.id}`, color: FILM.color, transparent: true, opacity: 0.5, depthWrite: false, side,
    });
    this.reflectMat = new THREE.MeshPhysicalMaterial({
      name: `reflect-${this.id}`,
      color: 0x000000,         // no diffuse: only the specular reflection is added
      metalness: 0,
      roughness: 0.035,
      ior: 1.5,
      specularIntensity: 1,
      // Additive blending happens after tone mapping, so the same reflection comes out much
      // brighter than in the 'ultra' tier; this intensity matches the two visually.
      envMap: this.envMap,
      envMapIntensity: 0.35,
      emissive: HIGHLIGHT,
      emissiveIntensity: 0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side,
    });
    for (const m of this.meshes) {
      m.material = this.tintMat;
      m.renderOrder = 2;
      const r = new THREE.Mesh(m.geometry, this.reflectMat);
      r.name = `${m.name}__reflect`;
      r.renderOrder = 3;
      r.raycast = () => {}; // clicks resolve on the tint layer
      m.add(r);
      this.layers.push(r);
    }
  }

  set({ amount, vlt, glow }) {
    if (amount !== undefined) this.target.amount = amount;
    if (vlt !== undefined) this.target.vlt = vlt;
    if (glow !== undefined) { this.target.glow = glow; this.cur.glow = Math.max(this.cur.glow, glow); }
  }

  /** Eases toward the target; returns true while still changing (keeps rendering). */
  update(dt) {
    const c = this.cur, t = this.target;
    this.time += dt;
    // Tint changes ease in like film being laid down: quick start, soft landing.
    c.amount = damp(c.amount, t.amount, dt, 7);
    c.vlt = damp(c.vlt, t.vlt, dt, 7);
    // Glow: focus breathes gently, hover holds steady, change-pulses decay.
    const breathe = this.focus ? 0.34 + 0.12 * Math.sin(this.time * 3.2) : 0;
    t.glow = Math.max(this.hover ? 0.26 : 0, breathe);
    c.glow = damp(c.glow, t.glow, dt, this.hover || this.focus ? 12 : 3.2);
    this.apply();
    return this.focus || Math.abs(c.amount - t.amount) > 1e-3 || Math.abs(c.vlt - t.vlt) > 1e-3 || Math.abs(c.glow - t.glow) > 2e-3;
  }

  apply() {
    const { amount, vlt, glow } = this.cur;
    if (this.debugColor) {
      if (this.tier === 'ultra') this.mat.color.copy(this.debugColor); else { this.tintMat.color.copy(this.debugColor); this.tintMat.opacity = 0.9; }
      return;
    }
    // Effective light transmission, blended between factory glass and the film.
    const transmit = THREE.MathUtils.lerp(FACTORY.vlt, perceived(vlt), amount);
    if (this.tier === 'ultra') {
      const hue = FACTORY.color.clone().lerp(new THREE.Color(0.93, 0.96, 1), amount);
      this.mat.color.copy(hue).multiplyScalar(transmit);
      this.mat.emissiveIntensity = glow * 0.9;
    } else {
      this.tintMat.color.copy(FACTORY.color).lerp(FILM.color, amount);
      this.tintMat.opacity = THREE.MathUtils.clamp(1 - transmit, 0.06, 0.95);
      this.reflectMat.emissiveIntensity = glow * 0.9;
    }
  }

  /** Clip this zone's glass by a plane (used to split the windshield into strip + rest). */
  setClip(plane) {
    for (const m of [this.mat, this.tintMat, this.reflectMat]) if (m) { m.clippingPlanes = [plane]; m.needsUpdate = true; }
    return this;
  }

  /** ?studio-debug: paint each zone a solid color to check the window mapping. */
  setDebugColor(color) {
    this.debugColor = color ? new THREE.Color(color) : null;
    this.apply();
  }

  dispose() {
    this.mat?.dispose();
    this.tintMat?.dispose();
    this.reflectMat?.dispose();
    for (const r of this.layers) r.removeFromParent();
  }
}

/** Unmapped glass (sunroof, lamps' covers mis-tagged as glass…) → cheap static factory glass. */
export function factoryGlassMaterial(tier, side = THREE.DoubleSide) {
  if (tier === 'ultra') {
    return new THREE.MeshPhysicalMaterial({
      color: FACTORY.color.clone().multiplyScalar(FACTORY.vlt), transmission: 1, thickness: 0, ior: 1.5, roughness: 0.035, side,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: FACTORY.color, transparent: true, opacity: 1 - FACTORY.vlt, roughness: 0.035, metalness: 0, depthWrite: false, side,
  });
}
