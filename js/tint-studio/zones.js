// The windows a customer can tint. Every vehicle maps these ids to its own meshes
// (see vehicles/*.js), so the UI, pricing and 3D all speak the same language.
//
// The full windshield is deliberately NOT a tintable window — only the separate
// "Windshield strip" add-on (EXTRAS) touches the windshield.
// `view` is the camera angle that best shows the window (see VIEWS in viewer.js).
export const ZONES = [
  { id: 'frontDriver', group: 'front', label: 'Front driver', short: 'Driver', view: 'driver' },
  { id: 'frontPassenger', group: 'front', label: 'Front passenger', short: 'Passenger', view: 'passenger' },
  { id: 'rearDriver', group: 'rear', label: 'Rear driver', short: 'Driver', view: 'driver' },
  { id: 'rearPassenger', group: 'rear', label: 'Rear passenger', short: 'Passenger', view: 'passenger' },
  { id: 'rearWindow', group: 'rearWindow', label: 'Rear windshield', short: 'Rear windshield', view: 'rear' },
];

// How the picker groups them (in this order).
export const ZONE_GROUPS = [
  { id: 'front', label: 'Front windows' },
  { id: 'rear', label: 'Rear windows' },
  { id: 'rearWindow', label: 'Rear windshield' },
];

export const ZONE_IDS = ZONES.map((z) => z.id);
export const zoneById = (id) => ZONES.find((z) => z.id === id);

// Separately priced add-on services (price lives in pricing.js / the vehicle config).
export const EXTRAS = {
  windshieldStrip: { id: 'windshieldStrip', label: 'Windshield strip', description: 'Top windshield strip', view: 'front' },
};

// One-tap packages shown above the window picker.
export const PACKAGES = [
  { id: 'front-two', label: 'Front two', zones: ['frontDriver', 'frontPassenger'] },
  { id: 'rear-two', label: 'Rear two', zones: ['rearDriver', 'rearPassenger'] },
  { id: 'back-half', label: 'Back half', zones: ['rearDriver', 'rearPassenger', 'rearWindow'] },
  { id: 'all', label: 'All windows', zones: ZONE_IDS },
];

// What the studio shows before the customer touches anything.
export const DEFAULT_ZONES = ZONE_IDS;

// The VLT shades DNA Tinting installs — the only list to edit to add/remove a shade.
// Keep in sync with ALLOWED_SHADES in js/script.js (the "all windows" slider).
export const SHADES = [
  { vlt: 5, name: 'Limo', desc: 'Limo black — maximum privacy' },
  { vlt: 20, name: 'Dark', desc: 'Dark, high privacy' },
  { vlt: 35, name: 'Popular', desc: 'Most popular daily-driver shade' },
  { vlt: 50, name: 'Medium', desc: 'Light tint, subtle heat cut' },
  { vlt: 70, name: 'Light', desc: 'Light — near factory glass' },
];
export const DEFAULT_VLT = 35;
export const shadeByVlt = (vlt) => SHADES.find((s) => s.vlt === vlt);
