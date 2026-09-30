// Pricing rules for the Tint Studio — the single place to change prices.
// Every window starts with Carbon film; Ceramic is an optional flat-fee upgrade.
// Picking all six windows unlocks the full-vehicle bundle price.
export const PRICING = {
  sedan: { label: 'Sedan / Coupe', carbon: { perWindow: 50, fullVehicle: 275 } },
  suv_truck: { label: 'SUV / Truck', carbon: { perWindow: 50, fullVehicle: 299 } },
};
export const CERAMIC_UPGRADE = { perWindow: 20, fullVehicle: 100 };
export const FULL_VEHICLE_WINDOWS = 6;

/**
 * @param {'sedan'|'suv_truck'} category
 * @param {number} windowCount  number of selected windows
 * @param {boolean} ceramic
 */
export function quote(category, windowCount, ceramic) {
  const rates = PRICING[category].carbon;
  const isFull = windowCount >= FULL_VEHICLE_WINDOWS;
  const carbon = isFull ? rates.fullVehicle : rates.perWindow * windowCount;
  const upgrade = isFull ? CERAMIC_UPGRADE.fullVehicle : CERAMIC_UPGRADE.perWindow * windowCount;
  return {
    category,
    categoryLabel: PRICING[category].label,
    windowCount,
    isFull,
    carbon: Math.round(carbon),
    upgrade: Math.round(upgrade),
    total: Math.round(ceramic ? carbon + upgrade : carbon),
    ceramic,
    perWindow: rates.perWindow,
    // What adding the remaining windows would cost when one away from the bundle.
    bundleNudge: windowCount === FULL_VEHICLE_WINDOWS - 1 ? rates.fullVehicle - rates.perWindow * windowCount : null,
  };
}

export const formatPrice = (n) => `$${Math.round(n)}`;
