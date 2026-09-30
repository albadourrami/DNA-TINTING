// The windows a customer can pick. Every vehicle maps these ids to its own meshes
// (see vehicles/*.js), so the UI, pricing and 3D all speak the same language.
//
// `view` is the camera angle that best shows the window (see VIEWS in viewer.js).
export const ZONES = [
  { id: 'windshield', label: 'Windshield', view: 'front' },
  { id: 'frontDriver', label: 'Front driver', view: 'driver' },
  { id: 'frontPassenger', label: 'Front passenger', view: 'passenger' },
  { id: 'rearDriver', label: 'Rear driver', view: 'driver' },
  { id: 'rearPassenger', label: 'Rear passenger', view: 'passenger' },
  { id: 'rearWindow', label: 'Rear windshield', view: 'rear' },
];

export const ZONE_IDS = ZONES.map((z) => z.id);
export const zoneById = (id) => ZONES.find((z) => z.id === id);

// One-tap packages shown above the window picker.
export const PACKAGES = [
  { id: 'front-two', label: 'Front two', zones: ['frontDriver', 'frontPassenger'] },
  { id: 'back-half', label: 'Back half', zones: ['rearDriver', 'rearPassenger', 'rearWindow'] },
  { id: 'sides-rear', label: 'Sides + rear', zones: ['frontDriver', 'frontPassenger', 'rearDriver', 'rearPassenger', 'rearWindow'] },
  { id: 'full', label: 'Full vehicle', zones: ZONE_IDS },
];

// What the studio shows before the customer touches anything: the most common package.
export const DEFAULT_ZONES = ['frontDriver', 'frontPassenger', 'rearDriver', 'rearPassenger', 'rearWindow'];

// The VLT shades DNA Tinting installs (must match ALLOWED_SHADES in js/script.js).
export const SHADES = [
  { vlt: 5, name: 'Limo Black', desc: 'Limo black — maximum privacy' },
  { vlt: 20, name: 'Dark', desc: 'Dark, high privacy' },
  { vlt: 35, name: 'Most Popular', desc: 'Most popular daily-driver shade' },
  { vlt: 70, name: 'Light', desc: 'Light — near factory glass' },
];
