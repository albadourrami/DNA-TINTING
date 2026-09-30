// The windows a customer can tint. Every vehicle maps these ids to its own meshes
// (see vehicles/*.js), so the UI, pricing and 3D all speak the same language.
//
// The windshield isn't one of these: it's a separately priced add-on (top strip or the
// full windshield, see WINDSHIELD_MODES) with its own shade.
// `view` is the camera angle that best shows the window (see VIEWS in viewer.js).
export const ZONES = [
  { id: 'frontDriver', group: 'front', label: 'Front driver', short: 'Driver', view: 'driver' },
  { id: 'frontPassenger', group: 'front', label: 'Front passenger', short: 'Passenger', view: 'passenger' },
  { id: 'rearDriver', group: 'rear', label: 'Rear driver', short: 'Driver', view: 'driver' },
  { id: 'rearPassenger', group: 'rear', label: 'Rear passenger', short: 'Passenger', view: 'passenger' },
  { id: 'rearWindow', group: 'rearWindow', label: 'Rear windshield', short: 'Rear windshield', view: 'rear' },
  // Extra windows behind the rear doors (third row / cargo). Only on vehicles whose config maps
  // them, and only counted when the customer says their SUV has them (priced as extras).
  { id: 'quarterDriver', group: 'quarter', label: 'Rear quarter (driver)', short: 'Quarter', view: 'driver', extra: true },
  { id: 'quarterPassenger', group: 'quarter', label: 'Rear quarter (passenger)', short: 'Quarter', view: 'passenger', extra: true },
];

// How the picker groups them (in this order).
export const ZONE_GROUPS = [
  { id: 'front', label: 'Front windows' },
  { id: 'rear', label: 'Rear windows' },
  { id: 'rearWindow', label: 'Rear windshield' },
];

export const ZONE_IDS = ZONES.map((z) => z.id);
export const BASE_ZONE_IDS = ZONES.filter((z) => !z.extra).map((z) => z.id);
export const EXTRA_ZONE_IDS = ZONES.filter((z) => z.extra).map((z) => z.id);
export const zoneById = (id) => ZONES.find((z) => z.id === id);

// Separately priced add-on services (price lives in pricing.js / the vehicle config).
export const EXTRAS = {
  windshield: { id: 'windshield', label: 'Windshield', view: 'front' },
};
// How much of the windshield to tint (price per mode in pricing.js).
export const WINDSHIELD_MODES = [
  { id: 'strip', label: 'Top strip', description: 'The top band of the windshield' },
  { id: 'full', label: 'Full windshield', description: 'The whole windshield' },
];

// One-tap packages shown above the window picker.
export const PACKAGES = [
  { id: 'front-two', label: 'Front two', zones: ['frontDriver', 'frontPassenger'] },
  { id: 'rear-two', label: 'Rear two', zones: ['rearDriver', 'rearPassenger'] },
  { id: 'back-half', label: 'Back half', zones: ['rearDriver', 'rearPassenger', 'quarterDriver', 'quarterPassenger', 'rearWindow'] },
  { id: 'all', label: 'All windows', zones: ZONE_IDS },
];
// (Packages only ever apply the windows the current vehicle actually has.)

// What the studio shows before the customer touches anything.
export const DEFAULT_ZONES = BASE_ZONE_IDS;

// The VLT shades DNA Tinting installs — the only list to edit to add/remove a shade.
// Keep in sync with ALLOWED_SHADES in js/script.js (the "all windows" slider).
export const SHADES = [
  { vlt: 5, name: 'Limo', desc: 'Limo black — maximum privacy' },
  { vlt: 20, name: 'Dark', desc: 'Dark, high privacy' },
  { vlt: 35, name: 'Popular', desc: 'Most popular daily-driver shade' },
  { vlt: 70, name: 'Light', desc: 'Light — near factory glass' },
];
export const DEFAULT_VLT = 35;
export const shadeByVlt = (vlt) => SHADES.find((s) => s.vlt === vlt);
