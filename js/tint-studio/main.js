// Tint Studio controller: vehicle cards, per-window shades (tap a window on the car or use
// the list), film choice, live configuration summary, booking hand-off, and the lazily
// loaded 3D viewer. Everything here works without WebGL — the 3D car is an
// enhancement layered on top (viewer.js is only imported when the studio nears the screen).
import { VEHICLES, DEFAULT_VEHICLE_ID, vehicleById } from './vehicles/index.js';
import { ZONES, PACKAGES, DEFAULT_ZONES, EXTRAS, SHADES, DEFAULT_VLT, zoneById, shadeByVlt } from './zones.js';
import { quote, formatPrice, pricingFor } from './pricing.js';

const $ = (id) => document.getElementById(id);
const els = {
  section: $('tint-studio'),
  stage: $('studioStage'),
  poster: $('studioPoster'),
  photo: $('studioPhoto'),
  loading: $('studioLoading'),
  loadingText: $('studioLoadingText'),
  progress: $('studioProgressBar'),
  note: $('studioNote'),
  hint: $('studioHint'),
  credit: $('studioCredit'),
  badgeVlt: $('studioBadgeVlt'),
  badgeCount: $('studioBadgeCount'),
  compare: $('studioCompare'),
  fullscreen: $('studioFullscreen'),
  vehicles: $('studioVehicles'),
  packages: $('studioPackages'),
  zoneMap: $('zoneMap'),
  count: $('studioCount'),
  ceramic: $('ceramicUpgradeToggle'),
  carbon: $('filmCarbon'),
  ceramicAmount: $('ceramicUpgradeAmount'),
  summary: $('configSummary'),
  pop: $('zonePop'),
  popTitle: $('zonePopTitle'),
  popKicker: $('zonePopKicker'),
  popValue: $('zonePopValue'),
  popChips: $('zonePopChips'),
  popAll: $('zonePopAll'),
  popClose: $('zonePopClose'),
  pin: $('zonePin'),
  leader: $('zoneLeader'),
  leaderLine: $('zoneLeaderLine'),
  stripShades: $('stripShades'),
  resultLabel: $('pricingResultLabel'),
  resultPrice: $('pricingResultPrice'),
  resultNote: $('pricingResultNote'),
  nudge: $('studioNudge'),
  book: $('pricingContinueBtn'),
  bar: $('studioBar'),
  barPrice: $('studioBarPrice'),
  barDetail: $('studioBarDetail'),
  barBook: $('studioBarBook'),
  customQuote: $('studioCustomQuote'),
  strip: $('windshieldStripToggle'),
  stripLabel: $('stripToggleLabel'),
  stripPrice: $('stripPrice'),
  stripStep: $('studioStripStep'),
};
const debug = new URLSearchParams(location.search).has('studio-debug');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const initialVlt = window.dnaShade || Number(document.getElementById('shadeSlider')?.value) || DEFAULT_VLT;
const state = {
  // ?studio-vehicle=<id> previews any registered vehicle, including hidden ones (dev only).
  vehicle: vehicleById(new URLSearchParams(location.search).get('studio-vehicle') || DEFAULT_VEHICLE_ID),
  // Every tinted window and its own shade (VLT %). A window that isn't here stays factory
  // glass. Shades can be mixed freely — price depends only on how many windows are tinted.
  tints: new Map(DEFAULT_ZONES.map((id) => [id, initialVlt])),
  strip: false,
  stripVlt: 20,
  vlt: initialVlt,        // the "every window" shade from the slider; new windows start here
  compare: false,
  open: null,             // window whose picker is open
};
const tintedIds = () => ZONES.filter((z) => state.tints.has(z.id)).map((z) => z.id);
const zoneMapForViewer = () => ({ ...Object.fromEntries(state.tints), ...(state.strip ? { windshieldStrip: state.stripVlt } : {}) });
const shadeName = (vlt) => shadeByVlt(vlt)?.name || '';
const zoneLabel = (id) => (id === 'windshieldStrip' ? EXTRAS.windshieldStrip.label : zoneById(id)?.label || id);
let viewer = null;          // set once the 3D engine is up
let viewerFailed = false;

// ---------- Vehicle cards ----------
function renderVehicles() {
  els.vehicles.innerHTML = '';
  for (const v of VEHICLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vehicle-card';
    b.setAttribute('role', 'radio');
    b.dataset.vehicle = v.id;
    const bodyLabel = v.bodyType === 'suv_truck' ? 'SUV' : 'Sedan / Coupe';
    const tag = v.modelUrl ? (v.badge || '3D') : 'Photo';
    b.innerHTML = `
      <span class="vehicle-card-img">${v.thumb ? `<img src="${v.thumb}" alt="" loading="lazy" width="360" height="270">` : ''}
        <span class="vehicle-card-tag${v.modelUrl ? ' is-3d' : ''}">${tag}</span></span>
      <span class="vehicle-card-text"><strong>${v.make === 'DNA Studio' ? v.model : `${v.make} ${v.model}`}</strong>
        <em>${bodyLabel}</em></span>`;
    b.addEventListener('click', () => selectVehicle(v.id));
    els.vehicles.appendChild(b);
  }
  syncVehicleCards();
}
function syncVehicleCards() {
  els.vehicles.querySelectorAll('.vehicle-card').forEach((b) => {
    const on = b.dataset.vehicle === state.vehicle.id;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}
els.vehicles.addEventListener('keydown', (e) => {
  const cards = [...els.vehicles.querySelectorAll('.vehicle-card')];
  const i = cards.indexOf(document.activeElement);
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (i < 0 || !d) return;
  e.preventDefault();
  const next = cards[(i + d + cards.length) % cards.length];
  next.focus();
  next.click();
});

// ---------- Per-window list: each window is Off or one of the shades we offer ----------
const chipHtml = (vlt, on) => `<button type="button" role="radio" class="shade-chip${vlt ? '' : ' shade-chip--off'}" data-vlt="${vlt}" aria-checked="${on}"
  aria-label="${vlt ? `${vlt}% VLT${shadeName(vlt) ? `, ${shadeName(vlt)}` : ''}` : 'No tint'}"><span class="shade-chip-glass" style="--vlt:${vlt || 100}" aria-hidden="true"></span><span>${vlt ? `${vlt}%` : 'Off'}</span></button>`;

function renderZones() {
  els.zoneMap.innerHTML = '';
  for (const z of ZONES) {
    const row = document.createElement('div');
    row.className = 'zone-row';
    row.dataset.zone = z.id;
    row.innerHTML = `
      <div class="zone-row-head">
        <button type="button" class="zone-row-name" aria-label="Show the ${z.label.toLowerCase()} window on the car">${z.label}</button>
        <span class="zone-row-value" aria-hidden="true"></span>
      </div>
      <div class="zone-row-chips" role="radiogroup" aria-label="${z.label} tint">${[0, ...SHADES.map((x) => x.vlt)].map((v) => chipHtml(v, false)).join('')}</div>`;
    row.querySelector('.zone-row-name').addEventListener('click', () => showZone(z.id));
    row.querySelectorAll('.shade-chip').forEach((c) => c.addEventListener('click', () => {
      setZoneTint(z.id, Number(c.dataset.vlt), { from: 'list' });
    }));
    els.zoneMap.appendChild(row);
  }
  for (const p of PACKAGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'studio-package';
    b.dataset.package = p.id;
    b.textContent = p.label;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => setZones(p.zones, { pulse: true }));
    els.packages.appendChild(b);
  }
  els.stripShades.innerHTML = SHADES.map((x) => chipHtml(x.vlt, false)).join('');
  els.stripShades.querySelectorAll('.shade-chip').forEach((c) => c.addEventListener('click', () => setZoneTint('windshieldStrip', Number(c.dataset.vlt), { from: 'list' })));
}

/** Tint one window (vlt 0 = no tint). The single entry point for list, popover and car. */
function setZoneTint(id, vlt, { from = 'list' } = {}) {
  if (id === 'windshieldStrip') {
    if (vlt) { state.stripVlt = vlt; state.strip = true; } else state.strip = false;
    els.strip.checked = state.strip;
  } else if (vlt) state.tints.set(id, vlt);
  else state.tints.delete(id);
  syncViewer();
  if (vlt) viewer?.pulse([id]);
  if (from === 'list' && viewer && !reducedMotion && state.open !== id) viewer.view(id === 'windshieldStrip' ? EXTRAS.windshieldStrip.view : zoneById(id).view, 800);
  update();
  flashRow(id);
}

/** Replace the tinted set (packages): keeps each window's shade, new ones get the slider shade. */
function setZones(ids, { pulse = false } = {}) {
  const next = new Map();
  for (const id of ids) if (zoneById(id)) next.set(id, state.tints.get(id) ?? state.vlt);
  state.tints = next;
  syncViewer();
  if (pulse && viewer) viewer.pulse(pulse === true ? tintedIds() : pulse);
  update();
}

const syncViewer = () => viewer?.setZoneTints(zoneMapForViewer());

function flashRow(id) {
  const row = id === 'windshieldStrip' ? els.stripShades : els.zoneMap.querySelector(`[data-zone="${id}"]`);
  if (!row || reducedMotion) return;
  row.classList.remove('is-flash');
  void row.offsetWidth;
  row.classList.add('is-flash');
}

// Name in the list → swing the camera to that window and open its picker.
async function showZone(id) {
  if (!viewer) return;
  if (!reducedMotion) await viewer.view(id === 'windshieldStrip' ? EXTRAS.windshieldStrip.view : zoneById(id).view, 800);
  openPicker(id);
}

// ---------- Windshield strip add-on ----------
function setStrip(on) {
  setZoneTint('windshieldStrip', on ? state.stripVlt : 0, { from: 'list' });
}
els.strip.addEventListener('change', () => setStrip(els.strip.checked));

// ---------- On-car window picker (popover pinned to the tapped window) ----------
const compactStage = () => els.stage.clientWidth < 620;
function openPicker(id) {
  if (!viewer || !viewer.availableZones().includes(id)) return;
  const isStrip = id === 'windshieldStrip';
  const was = state.open;
  state.open = id;
  viewer.focusZone(id);
  els.popTitle.textContent = zoneLabel(id);
  els.popKicker.textContent = isStrip ? `Add-on · +${formatPrice(pricing().windshieldStrip)}` : 'Window tint';
  els.popChips.innerHTML = [0, ...SHADES.map((x) => x.vlt)].map((v) => chipHtml(v, false)).join('');
  els.popChips.querySelectorAll('.shade-chip').forEach((c) => c.addEventListener('click', () => {
    setZoneTint(id, Number(c.dataset.vlt), { from: 'picker' });
    syncPicker();
  }));
  els.popAll.hidden = isStrip;
  els.pop.hidden = false;
  els.pin.hidden = false;
  setDocked(compactStage());
  if (was !== id) {
    els.pop.classList.remove('is-in');
    void els.pop.offsetWidth;
    els.pop.classList.add('is-in');
  }
  syncPicker();
  if (!was) {
    // First open: appear in place (no slide from the previous spot).
    els.pop.style.transition = 'none';
    placePicker();
    void els.pop.offsetWidth;
    els.pop.style.transition = '';
  } else placePicker();
  els.hint.classList.add('is-hidden');
}
function closePicker() {
  if (!state.open) return;
  state.open = null;
  viewer?.focusZone(null);
  els.pop.hidden = true;
  els.pin.hidden = true;
  els.leader.toggleAttribute('hidden', true);
  els.stage.classList.remove('has-pop');
  viewer?.setFrameInset(0);
}
// Phones: the picker docks under the car and the stage grows a little to make room for it.
function setDocked(on) {
  els.pop.classList.toggle('is-docked', on);
  els.leader.toggleAttribute('hidden', on);
  els.stage.classList.toggle('has-pop', on);
  viewer?.setFrameInset(on ? els.pop.offsetHeight + 16 : 0);
}
function currentVlt(id) {
  if (id === 'windshieldStrip') return state.strip ? state.stripVlt : 0;
  return state.tints.get(id) || 0;
}
function syncPicker() {
  const id = state.open;
  if (!id) return;
  const vlt = currentVlt(id);
  els.popValue.textContent = vlt ? `${vlt}%` : 'Off';
  els.popValue.classList.toggle('is-off', !vlt);
  els.popChips.querySelectorAll('.shade-chip').forEach((c) => c.setAttribute('aria-checked', String(Number(c.dataset.vlt) === vlt)));
  els.popAll.disabled = !vlt;
  const docked = els.pop.classList.contains('is-docked');
  els.popAll.textContent = docked ? (vlt ? `${vlt}% on all` : 'All windows') : vlt ? `Use ${vlt}% on every window` : 'Use this shade on every window';
}
function placePicker() {
  const id = state.open;
  if (!id || !viewer) return;
  const p = viewer.projectZone(id);
  if (!p) return;
  const W = els.stage.clientWidth, H = els.stage.clientHeight;
  els.pin.style.transform = `translate(${p.x}px, ${p.y}px)`;
  els.pin.classList.toggle('is-behind', !p.facing || !p.onScreen);
  if (els.pop.classList.contains('is-docked')) return; // phones: docked at the bottom of the stage
  // Desktop: a corner of the stage that covers as little of the car as possible (never the
  // window itself), with a leader line to the window.
  const pw = els.pop.offsetWidth, ph = els.pop.offsetHeight, m = 16;
  const car = viewer.projectBounds();
  // the box's corners overshoot the body (roof is narrower than the wheels): trim a little
  const tx = (car.x1 - car.x0) * 0.06, ty = (car.y1 - car.y0) * 0.08;
  car.x0 += tx; car.x1 -= tx; car.y0 += ty; car.y1 -= ty;
  const corners = [[W - pw - m, m], [m, 76], [W - pw - m, H - ph - 64], [m, H - ph - 64]];
  const cost = ([cx, cy]) => {
    const ox = Math.max(0, Math.min(cx + pw, car.x1) - Math.max(cx, car.x0));
    const oy = Math.max(0, Math.min(cy + ph, car.y1) - Math.max(cy, car.y0));
    const onPin = p.x > cx - 12 && p.x < cx + pw + 12 && p.y > cy - 12 && p.y < cy + ph + 12;
    return ox * oy + (onPin ? 1e9 : 0);
  };
  let [x, y] = corners[0];
  let best = Infinity;
  for (const c of corners) { const k = cost(c); if (k < best - 1) { best = k; [x, y] = c; } }
  els.pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  // Leader: from the pin to the nearest point on the popover's edge.
  const ex = Math.max(x, Math.min(x + pw, p.x)), ey = Math.max(y, Math.min(y + ph, p.y));
  const show = p.onScreen && Math.hypot(ex - p.x, ey - p.y) > 24;
  els.leader.toggleAttribute('hidden', !show); // (SVG has no .hidden property)
  if (show) {
    els.leaderLine.setAttribute('x1', p.x); els.leaderLine.setAttribute('y1', p.y);
    els.leaderLine.setAttribute('x2', ex); els.leaderLine.setAttribute('y2', ey);
    els.leader.classList.toggle('is-behind', !p.facing);
  }
}
els.popClose.addEventListener('click', closePicker);
els.popAll.addEventListener('click', () => {
  const vlt = currentVlt(state.open);
  if (!vlt) return;
  applyToAll(vlt);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.open) closePicker(); });

/** The slider / "every window" shade: every tinted window takes it. */
function applyToAll(vlt, { committed = true } = {}) {
  state.vlt = vlt;
  for (const id of state.tints.keys()) state.tints.set(id, vlt);
  syncViewer();
  if (committed) {
    viewer?.pulse(tintedIds());
    window.dnaSetShade?.(vlt); // keep the slider in step when the change came from the picker
  }
  update();
  syncPicker();
}

// ---------- Price + summary ----------
let priceFrame = null;
let shownPrice = null;
function animatePrice(target) {
  cancelAnimationFrame(priceFrame);
  const el = els.resultPrice;
  const start = shownPrice ?? target;
  shownPrice = target;
  el.classList.remove('pricing-price-bump');
  void el.offsetWidth;
  el.classList.add('pricing-price-bump');
  if (reducedMotion || start === target) { el.textContent = formatPrice(target); return; }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / 380);
    el.textContent = formatPrice(start + (target - start) * (1 - (1 - t) ** 3));
    if (t < 1) priceFrame = requestAnimationFrame(step);
  };
  priceFrame = requestAnimationFrame(step);
}

const windowWord = (n) => `${n} window${n === 1 ? '' : 's'}`;
const pricing = () => pricingFor(state.vehicle);
function currentQuote() {
  return quote(pricing(), state.tints.size, ZONES.length, { ceramic: els.ceramic.checked, strip: state.strip });
}
const selectionText = (q) => [q.windowCount ? (q.isAll ? `all ${q.windowCount} windows` : windowWord(q.windowCount)) : '', q.strip ? 'windshield strip' : ''].filter(Boolean).join(' + ');
const vehicleName = (v) => (v.make === 'DNA Studio' ? v.model : `${v.make} ${v.model}`);
const uniformVlt = () => { const s = new Set(state.tints.values()); return s.size === 1 ? [...s][0] : null; };
const shadeText = () => (state.tints.size ? (uniformVlt() != null ? `${uniformVlt()}%` : 'mixed shades') : '');

function summaryRows(q) {
  const film = q.ceramic ? 'Ceramic' : 'Carbon';
  const rows = [
    ['Vehicle', `${vehicleName(state.vehicle)}`, q.categoryLabel],
    ['Windows', q.windowCount ? `${q.windowCount} of ${ZONES.length}` : 'None yet', q.windowCount ? (q.isAll ? `All-windows price ${formatPrice(q.carbon)}` : `${q.windowCount} × ${formatPrice(q.perWindow)} = ${formatPrice(q.carbon)}`) : ''],
  ];
  const list = ZONES.filter((z) => state.tints.has(z.id)).map((z) => `<li><span>${z.label}</span><b>${state.tints.get(z.id)}%</b></li>`);
  if (q.strip) list.push(`<li><span>Windshield strip</span><b>${state.stripVlt}%</b></li>`);
  return { rows, list, film };
}

let lastSummaryKey = '';
function renderSummary(q) {
  const { rows, list, film } = summaryRows(q);
  const key = JSON.stringify([rows, list, film, q.total, q.upgrade, q.strip]);
  if (key === lastSummaryKey) return;
  lastSummaryKey = key;
  const html = [
    ...rows.map(([k, v, sub]) => `<div class="cs-row"><dt>${k}</dt><dd>${v}${sub ? `<small>${sub}</small>` : ''}</dd></div>`),
    list.length ? `<div class="cs-row cs-row--list"><dt>Tint by window</dt><dd><ul class="cs-shades">${list.join('')}</ul></dd></div>` : '',
    q.strip ? `<div class="cs-row"><dt>Windshield strip</dt><dd>+${formatPrice(q.strip)}<small>Top ${state.vehicle.windshield?.strip?.depth ? `${Math.round(state.vehicle.windshield.strip.depth / 0.0254)}-inch` : ''} strip</small></dd></div>` : '',
    `<div class="cs-row"><dt>Film</dt><dd>${film}<small>${q.ceramic ? 'Every tinted window' : 'Included · every tinted window'}</small></dd></div>`,
    q.ceramic ? `<div class="cs-row cs-row--upgrade"><dt>Ceramic upgrade</dt><dd>+${formatPrice(q.ceramicPrice)}<small>Flat, whole vehicle</small></dd></div>` : '',
  ].join('');
  els.summary.innerHTML = html;
}

function update() {
  const q = currentQuote();
  const n = state.tints.size;
  const film = q.ceramic ? 'Ceramic' : 'Carbon';
  const hasStrip = !!state.vehicle.windshield?.strip;

  // Per-window rows + packages.
  els.zoneMap.querySelectorAll('.zone-row').forEach((row) => {
    const vlt = state.tints.get(row.dataset.zone) || 0;
    row.classList.toggle('is-on', !!vlt);
    row.querySelector('.zone-row-value').textContent = vlt ? `${vlt}% · ${shadeName(vlt)}` : 'Factory glass';
    row.querySelectorAll('.shade-chip').forEach((c) => c.setAttribute('aria-checked', String(Number(c.dataset.vlt) === vlt)));
  });
  els.packages.querySelectorAll('.studio-package').forEach((b) => {
    const p = PACKAGES.find((x) => x.id === b.dataset.package);
    b.setAttribute('aria-pressed', String(p.zones.length === n && p.zones.every((z) => state.tints.has(z))));
  });
  els.count.textContent = `${n} of ${ZONES.length}`;
  const u = uniformVlt();
  els.badgeVlt.textContent = n ? (u != null ? `${u}%` : 'Mix') : '—';
  els.badgeCount.textContent = n || state.strip ? selectionText(q).replace('windshield strip', 'strip') : 'none selected';

  // Add-on + film.
  els.stripStep.hidden = !hasStrip;
  els.stripPrice.textContent = `+${formatPrice(q.stripPrice)}`;
  els.stripLabel.classList.toggle('is-checked', state.strip);
  els.stripShades.hidden = !state.strip;
  els.stripShades.querySelectorAll('.shade-chip').forEach((c) => c.setAttribute('aria-checked', String(Number(c.dataset.vlt) === state.stripVlt)));
  els.ceramicAmount.textContent = formatPrice(q.ceramicPrice);
  document.querySelectorAll('.film-option').forEach((c) => c.classList.toggle('is-selected', c.dataset.film === film));
  document.querySelectorAll('.film-compare-card').forEach((c) => c.classList.toggle('is-selected', c.dataset.film === film));
  els.nudge.hidden = true;
  renderSummary(q);

  if (!n && !state.strip) {
    els.resultLabel.textContent = 'Total';
    els.resultPrice.textContent = '—';
    shownPrice = null;
    els.resultNote.textContent = 'Tap a window on the car or pick a package to see your price.';
    els.book.disabled = true;
    els.barPrice.textContent = '—';
    els.barDetail.textContent = 'Pick your windows';
    els.barBook.disabled = true;
    return;
  }
  els.book.disabled = false;
  els.barBook.disabled = false;
  els.resultLabel.textContent = 'Total';
  animatePrice(q.total);
  const parts = [];
  if (n) parts.push(q.isAll ? `All ${n} windows ${formatPrice(q.carbon)}` : `${windowWord(n)} × ${formatPrice(q.perWindow)}`);
  if (q.strip) parts.push(`${formatPrice(q.strip)} windshield strip`);
  if (q.ceramic) parts.push(`${formatPrice(q.upgrade)} Ceramic upgrade`);
  els.resultNote.textContent = `${parts.join(' + ')} = ${formatPrice(q.total)}.`;
  els.barPrice.textContent = formatPrice(q.total);
  els.barDetail.textContent = [selectionText(q), shadeText(), film].filter(Boolean).join(' · ');
}
const onFilm = () => {
  update();
  const card = document.querySelector(`.film-option[data-film="${els.ceramic.checked ? 'Ceramic' : 'Carbon'}"]`);
  if (card && !reducedMotion) { card.classList.remove('is-pop'); void card.offsetWidth; card.classList.add('is-pop'); }
};
els.ceramic.addEventListener('change', onFilm);
els.carbon.addEventListener('change', onFilm);

// ---------- Booking hand-off (js/script.js owns the form) ----------
function book() {
  const q = currentQuote();
  if (!q.windowCount && !q.strip) return;
  const v = state.vehicle;
  const labels = ZONES.filter((z) => state.tints.has(z.id)).map((z) => `${z.label} ${state.tints.get(z.id)}%`);
  const film = q.ceramic ? 'Ceramic' : 'Carbon';
  const windowsText = [q.isAll ? `All windows (${labels.join(', ')})` : labels.join(', '), q.strip ? `Windshield strip ${state.stripVlt}% (+${formatPrice(q.strip)})` : ''].filter(Boolean).join(' + ');
  const u = uniformVlt();
  document.dispatchEvent(new CustomEvent('dna:book', {
    detail: {
      vehicleType: q.categoryLabel,
      filmType: q.ceramic ? `Ceramic (+${formatPrice(q.upgrade)} upgrade)` : 'Carbon',
      windowCount: q.windowCount,
      shadeLevel: u != null ? u : 'mixed',
      windowsSelected: windowsText,
      windshieldStrip: q.strip ? `Yes — ${state.stripVlt}% (+${formatPrice(q.strip)})` : 'No',
      estimatedPrice: formatPrice(q.total),
      summaryTitle: q.categoryLabel,
      summaryDetail: ` — ${vehicleName(v)}, ${film}, ${u != null ? `${u}% VLT` : 'mixed shades'}, ${selectionText(q)}`,
      previewVehicle: `${v.make} ${v.model}`,
    },
  }));
}
function customQuote() {
  document.dispatchEvent(new CustomEvent('dna:book', {
    detail: {
      vehicleType: 'Van / Other (Custom Quote)',
      filmType: '', windowCount: 0, windowsSelected: '',
      estimatedPrice: 'Custom Quote',
      summaryTitle: 'Van / Other', summaryDetail: ' — Custom Quote',
    },
  }));
}
els.book.addEventListener('click', book);
els.barBook.addEventListener('click', book);
els.customQuote.addEventListener('click', customQuote);
document.addEventListener('dna:custom-quote', customQuote);
document.addEventListener('dna:quote-reset', () => {
  els.carbon.checked = true;
  if (state.vehicle.id !== DEFAULT_VEHICLE_ID) selectVehicle(DEFAULT_VEHICLE_ID);
  closePicker();
  state.strip = false;
  els.strip.checked = false;
  state.tints = new Map();
  setZones(DEFAULT_ZONES);
});

// ---------- Shade (from the slider in js/script.js) ----------
// The slider sets every tinted window at once (a window tapped on the car can then differ).
document.addEventListener('dna:shade', (e) => {
  const { vlt, committed, source } = e.detail;
  if (source === 'studio') return; // echo of our own applyToAll
  applyToAll(vlt, { committed: false });
  if (committed) {
    viewer?.pulse(tintedIds());
    els.stage.classList.remove('is-tinting');
    void els.stage.offsetWidth;
    els.stage.classList.add('is-tinting'); // brief sheen sweep over the stage
  }
});

// ---------- Stage: vehicle display ----------
function showNote(html) {
  els.note.innerHTML = html || '';
  els.note.hidden = !html;
}
function showLoading(on, text = 'Loading 3D studio…') {
  els.loading.hidden = !on;
  els.loadingText.textContent = text;
  if (on) els.progress.style.width = '0%';
}

async function selectVehicle(id) {
  const v = vehicleById(id);
  const changedBody = v.bodyType !== state.vehicle.bodyType;
  state.vehicle = v;
  syncVehicleCards();
  els.credit.textContent = v.credit || '';
  if (v.poster && !els.stage.classList.contains('is-ready')) els.poster.src = v.poster;
  closePicker();
  if (!v.windshield?.strip && state.strip) setStrip(false);
  update();
  if (changedBody) animatePrice(currentQuote().total);

  if (!v.modelUrl) {
    // No licensed 3D model yet: show the real photo; pricing and selection still work.
    els.stage.classList.add('is-photo');
    els.stage.classList.remove('is-3d');
    els.photo.src = v.photo;
    els.photo.alt = `${v.make} ${v.model}`;
    els.photo.hidden = false;
    showLoading(false);
    showNote(`<strong>${vehicleName(v)}</strong> — interactive 3D coming soon. Your price below uses ${v.bodyType === 'suv_truck' ? 'SUV / Truck' : 'Sedan / Coupe'} rates.`);
    return;
  }
  els.photo.hidden = true;
  els.stage.classList.remove('is-photo');
  showNote('');
  if (viewerFailed) { showFallback(); return; }
  if (!viewer) return; // the viewer loads this vehicle when it starts
  await loadInViewer(v);
}

async function loadInViewer(v) {
  els.stage.classList.add('is-switching');
  showLoading(true, `Loading ${vehicleName(v)}…`);
  try {
    const done = await viewer.loadVehicle(v);
    if (!done) return; // another vehicle was picked meanwhile
    syncViewer();
    viewer.setCompare(state.compare);
    const missing = ZONES.filter((z) => !viewer.availableZones().includes(z.id));
    if (missing.length && debug) console.warn('[tint-studio] zones without glass on this model:', missing.map((z) => z.id));
    els.stage.classList.add('is-3d', 'is-ready');
    showLoading(false);
  } catch (err) {
    console.error('[tint-studio] model failed to load', err);
    showLoading(false);
    showNote('We couldn’t load the 3D car. <button type="button" class="link-btn" data-retry>Try again</button> — your selections and price still work below.');
  } finally {
    els.stage.classList.remove('is-switching');
  }
}
els.note.addEventListener('click', (e) => {
  if (e.target.closest('[data-retry]')) { showNote(''); loadInViewer(state.vehicle); }
});

function showFallback() {
  showLoading(false);
  els.stage.classList.add('is-fallback');
  showNote('Your browser can’t show the 3D preview here — pick your shade and windows below to get your price.');
}

// ---------- Toolbar ----------
els.stage.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewer?.view(b.dataset.view)));
function setCompare(on) {
  state.compare = on;
  els.compare.setAttribute('aria-pressed', String(on));
  els.compare.querySelector('span').textContent = on ? 'Showing factory glass' : 'Before / After';
  viewer?.setCompare(on);
}
els.compare.addEventListener('click', () => setCompare(!state.compare));

const isFullscreen = () => document.fullscreenElement === els.stage || els.stage.classList.contains('is-fullscreen');
els.fullscreen.addEventListener('click', async () => {
  if (isFullscreen()) {
    if (document.fullscreenElement) await document.exitFullscreen();
    else els.stage.classList.remove('is-fullscreen');
  } else if (els.stage.requestFullscreen && document.fullscreenEnabled) {
    await els.stage.requestFullscreen().catch(() => els.stage.classList.add('is-fullscreen'));
  } else els.stage.classList.add('is-fullscreen'); // iPhone Safari: CSS overlay instead
  syncFullscreen();
});
function syncFullscreen() {
  const on = isFullscreen();
  document.documentElement.classList.toggle('studio-fullscreen-open', on);
  els.fullscreen.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  viewer?.setFreeTouch(on);
  viewer?.resize();
}
document.addEventListener('fullscreenchange', syncFullscreen);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && els.stage.classList.contains('is-fullscreen')) { els.stage.classList.remove('is-fullscreen'); syncFullscreen(); } });

// ---------- Mobile price bar: visible while the studio options are on screen ----------
if ('IntersectionObserver' in window) {
  const panel = els.section.querySelector('.studio-panel');
  const priceBox = $('pricingResult');
  let panelVisible = false;
  let priceVisible = false;
  const sync = () => {
    const show = panelVisible && !priceVisible; // the full price box is on screen: no need for the bar
    els.bar.classList.toggle('is-visible', show);
    els.bar.setAttribute('aria-hidden', String(!show));
    els.barBook.tabIndex = show ? 0 : -1;
    document.documentElement.classList.toggle('studio-bar-open', show);
  };
  new IntersectionObserver(([e]) => { panelVisible = e.isIntersecting; sync(); }).observe(panel);
  new IntersectionObserver(([e]) => { priceVisible = e.isIntersecting; sync(); }, { threshold: 0.6 }).observe(priceBox);
}

// ---------- Lazy 3D start ----------
function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

async function startViewer() {
  if (viewer || viewerFailed) return;
  if (!webglAvailable()) { viewerFailed = true; if (state.vehicle.modelUrl) showFallback(); return; }
  if (state.vehicle.modelUrl) showLoading(true);
  try {
    const { createTintViewer } = await import('./viewer.js');
    viewer = await createTintViewer(els.stage, { debug });
    viewer.on('progress', ({ ratio }) => {
      els.progress.style.width = ratio == null ? '60%' : `${Math.round(ratio * 100)}%`;
      if (ratio != null) els.loadingText.textContent = `Loading 3D studio… ${Math.round(ratio * 100)}%`;
    });
    viewer.on('zoneclick', ({ zoneId }) => openPicker(zoneId));
    viewer.on('emptyclick', closePicker);
    viewer.on('render', placePicker);
    viewer.on('interaction', () => els.hint.classList.add('is-hidden'));
    viewer.on('load', () => { els.stage.classList.remove('is-entering'); void els.stage.offsetWidth; els.stage.classList.add('is-entering'); });
    new ResizeObserver(() => { if (state.open) { setDocked(compactStage()); placePicker(); } }).observe(els.stage);
    window.tintStudio = { viewer, state, selectVehicle, setZones, setZoneTint, openPicker, closePicker, applyToAll }; // console debugging / tests
    if (state.vehicle.modelUrl) await loadInViewer(state.vehicle);
  } catch (err) {
    console.error('[tint-studio] 3D unavailable', err);
    viewerFailed = true;
    if (state.vehicle.modelUrl) showFallback();
  }
  window.studioReady = true;
}

renderVehicles();
renderZones();
els.credit.textContent = state.vehicle.credit || '';
if (state.vehicle.poster) els.poster.src = state.vehicle.poster;
update();

// Start downloading three.js + the model once the page itself has loaded and the studio is
// close to the viewport — the hero never waits on 3D.
const whenLoaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }));
whenLoaded.then(() => {
  if (!('IntersectionObserver' in window)) { startViewer(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); startViewer(); }
  }, { rootMargin: '600px 0px' });
  io.observe(els.stage);
});
