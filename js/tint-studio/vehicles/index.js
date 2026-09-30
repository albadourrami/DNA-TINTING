// ─────────────────────────────────────────────────────────────────────────────
//  Vehicle registry for the Tint Studio.
//
//  To add a vehicle:
//   1. Put its optimized model at assets/vehicles/<id>/<id>.glb
//      (node .claude/skills/web-3d-models/scripts/optimize_model.mjs in.glb out.glb --texture-size 1024)
//   2. Copy c-class.js to <id>.js, fill in the fields, import it below and add it to VEHICLES.
//   3. Map its glass (see "glass" below). Open the site with ?studio-debug to print the
//      glass meshes the viewer found and the zone mapping it would use.
//
//  Vehicle fields:
//    id, make, model, bodyType ('sedan' | 'suv_truck' → which price table applies)
//    modelUrl     GLB path, or null while the 3D model isn't available yet (the card then
//                 shows the photo and still works for pricing)
//    photo, thumb real photos for the vehicle card / placeholder stage
//    credit       attribution shown under the stage (required for CC BY assets)
//    rotation     [x, y, z] degrees so the car faces +Z (front) with +Y up
//    camera       { azimuth, elevation, distance } start view overrides
//    windshield   { meshes: [...], strip: { depth: 0.127 }, full: true } — the windshield glass,
//                 how deep the top-strip option reaches down from its top edge (meters, along the
//                 glass; 0.127 = 5 in; cut in 3D with a clipping plane), and whether the full
//                 windshield can be tinted. Omit `strip` / `full` to not offer that option.
//    glass.quarterDriver / quarterPassenger (SUVs) — extra windows behind the rear doors; the
//                 studio then asks the customer whether their SUV has them.
//    pricing      overrides for pricing.js defaults: { perWindow, allWindows, extraWindow,
//                 ceramicUpgrade, windshieldStrip, windshieldFull } — e.g. { windshieldStrip: 30 }
//    glass        how the viewer finds each window. Either:
//                   'auto' — detect windows from glass-looking meshes by position, or
//                   { zoneId: { meshes: [...], materials: [...], side: 'driver'|'passenger',
//                               part: 'front'|'rear' }, ... }
//                 Names match exactly or with * wildcards. `side`/`part` split a mesh that
//                 holds several windows (e.g. both rear side windows in one mesh).
//    glassMaterials  material names that are glass (used by 'auto'; default /glass|window/i)
//    appearance   { 'Material name': { color, roughness, metalness } } paint/trim overrides
// ─────────────────────────────────────────────────────────────────────────────
import amgC63 from './amg-c63.js';
import audiA3 from './audi-a3.js';
import mercedesGls from './mercedes-gls.js';
import cClass from './c-class.js';
import gle from './gle.js';
import conceptDemo from './concept-demo.js';

// Every vehicle the studio knows about. Entries with `enabled: false` stay available to
// developers (?studio-vehicle=<id>) but are never shown to customers.
export const ALL_VEHICLES = [amgC63, mercedesGls, audiA3, cClass, gle, conceptDemo];
export const VEHICLES = ALL_VEHICLES.filter((v) => v.enabled !== false);

// Shown first.
export const DEFAULT_VEHICLE_ID = 'amg-c63';

export const vehicleById = (id) => VEHICLES.find((v) => v.id === id) || ALL_VEHICLES.find((v) => v.id === id) || VEHICLES[0];
