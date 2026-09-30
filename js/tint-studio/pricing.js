// Tint Studio pricing — the single place to change prices.
//
// Every window starts with Carbon film at a per-window price; tinting all five standard
// windows uses the "allWindows" price. Tint percentage never changes the price, so customers
// can mix shades freely. SUVs with extra windows behind the rear doors (third row / cargo)
// pay `extraWindow` for each of those. Ceramic is ONE flat upgrade for the whole vehicle
// (film type can't be mixed between windows). The windshield is a separate add-on: the top
// strip or the full windshield.
// A vehicle can override any of these in its config (vehicles/*.js → `pricing`).

// Windshield add-on prices (USD). Change them here — or per vehicle via pricing.windshieldStrip / windshieldFull.
export const WINDSHIELD_STRIP_PRICE = 25;
export const WINDSHIELD_FULL_PRICE = 75;
// Ceramic upgrade (USD), charged once per vehicle — not per window.
export const CERAMIC_UPGRADE_PRICE = 100;
// Each extra SUV window beyond the standard five (USD).
export const EXTRA_WINDOW_PRICE = 50;

const shared = {
  perWindow: 50,
  allWindows: 250,          // the five standard windows
  extraWindow: EXTRA_WINDOW_PRICE,
  ceramicUpgrade: CERAMIC_UPGRADE_PRICE,
  windshieldStrip: WINDSHIELD_STRIP_PRICE,
  windshieldFull: WINDSHIELD_FULL_PRICE,
};
export const DEFAULT_PRICING = {
  sedan: { label: 'Sedan / Coupe', ...shared },
  suv_truck: { label: 'SUV / Truck', ...shared },
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
 * @param {object} pricing  from pricingFor(vehicle)
 * @param {{ base: number, baseTotal?: number, extra?: number, ceramic?: boolean, windshield?: 'none'|'strip'|'full' }} sel
 *   base       tinted standard windows (of baseTotal, normally 5)
 *   extra      tinted extra SUV windows (quarter / third row)
 */
export function quote(pricing, { base = 0, baseTotal = 5, extra = 0, ceramic = false, windshield = 'none' } = {}) {
  const isAll = base > 0 && base >= baseTotal;
  const baseCost = isAll ? pricing.allWindows : pricing.perWindow * base;
  const extraCost = pricing.extraWindow * extra;
  const carbon = baseCost + extraCost;
  const ws = windshield === 'full' ? pricing.windshieldFull : windshield === 'strip' ? pricing.windshieldStrip : 0;
  const anything = base + extra > 0 || ws > 0;
  const upgrade = ceramic && anything ? pricing.ceramicUpgrade : 0;
  const r = Math.round;
  return {
    categoryLabel: pricing.label,
    windowCount: base + extra,
    base, extra, isAll,
    baseCost: r(baseCost),
    extraCost: r(extraCost),
    carbon: r(carbon),
    windshield,
    windshieldCost: r(ws),
    stripPrice: r(pricing.windshieldStrip),
    fullPrice: r(pricing.windshieldFull),
    extraWindowPrice: r(pricing.extraWindow),
    upgrade: r(upgrade),
    ceramicPrice: r(pricing.ceramicUpgrade),
    subtotal: r(carbon + ws),
    total: r(carbon + ws + upgrade),
    ceramic,
    perWindow: pricing.perWindow,
    allWindows: pricing.allWindows,
  };
}

export const formatPrice = (n) => `$${Math.round(n)}`;
