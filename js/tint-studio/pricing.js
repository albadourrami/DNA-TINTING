// Tint Studio pricing — the single place to change prices.
//
// Every window starts with Carbon film; Ceramic is an optional upgrade. Picking every
// tintable window uses the "allWindows" price. The windshield strip is a separate add-on.
// A vehicle can override any of these in its config (vehicles/*.js → `pricing`).

// Windshield strip add-on price (USD). Change it here — or per vehicle via pricing.windshieldStrip.
export const WINDSHIELD_STRIP_PRICE = 25;

export const DEFAULT_PRICING = {
  sedan: {
    label: 'Sedan / Coupe',
    perWindow: 50,
    allWindows: 250,          // all 5 windows (+ $25 strip = the old $275 full-vehicle price)
    ceramic: { perWindow: 20, allWindows: 100 },
    windshieldStrip: WINDSHIELD_STRIP_PRICE,
    windshieldStripCeramic: 0, // extra for a ceramic strip; 0 = same price for either film
  },
  suv_truck: {
    label: 'SUV / Truck',
    perWindow: 50,
    allWindows: 274,          // all 5 windows (+ $25 strip = the old $299 full-vehicle price)
    ceramic: { perWindow: 20, allWindows: 100 },
    windshieldStrip: WINDSHIELD_STRIP_PRICE,
    windshieldStripCeramic: 0,
  },
};

const merge = (base, over = {}) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] || {}, v) : v;
  return out;
};

/** The effective price table for a vehicle: body-type defaults + the vehicle's own overrides. */
export function pricingFor(vehicle) {
  return merge(DEFAULT_PRICING[vehicle.bodyType] || DEFAULT_PRICING.sedan, vehicle.pricing);
}

/**
 * @param {object} pricing      from pricingFor(vehicle)
 * @param {number} windowCount  selected tintable windows
 * @param {number} totalWindows tintable windows the vehicle has
 * @param {{ ceramic?: boolean, strip?: boolean }} options
 */
export function quote(pricing, windowCount, totalWindows, { ceramic = false, strip = false } = {}) {
  const isAll = windowCount > 0 && windowCount >= totalWindows;
  const carbon = isAll ? pricing.allWindows : pricing.perWindow * windowCount;
  const upgrade = !windowCount ? 0 : isAll ? pricing.ceramic.allWindows : pricing.ceramic.perWindow * windowCount;
  const stripPrice = strip ? pricing.windshieldStrip + (ceramic ? pricing.windshieldStripCeramic : 0) : 0;
  return {
    categoryLabel: pricing.label,
    windowCount,
    isAll,
    carbon: Math.round(carbon),
    upgrade: Math.round(upgrade),
    strip: Math.round(stripPrice),
    stripPrice: Math.round(pricing.windshieldStrip),
    total: Math.round(carbon + (ceramic ? upgrade : 0) + stripPrice),
    ceramic,
    perWindow: pricing.perWindow,
    ceramicPerWindow: pricing.ceramic.perWindow,
  };
}

export const formatPrice = (n) => `$${Math.round(n)}`;
