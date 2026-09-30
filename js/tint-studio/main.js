// Tint Studio controller: vehicle cards, window picker, live price, booking hand-off, and
// the lazily loaded 3D viewer. Everything here works without WebGL — the 3D car is an
// enhancement layered on top (viewer.js is only imported when the studio nears the screen).
import { VEHICLES, DEFAULT_VEHICLE_ID, vehicleById } from './vehicles/index.js';
import { ZONES, PACKAGES, DEFAULT_ZONES, zoneById } from './zones.js';
import { quote, formatPrice, CERAMIC_UPGRADE } from './pricing.js';

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
  ceramicLabel: $('ceramicToggleLabel'),
  ceramicAmount: $('ceramicUpgradeAmount'),
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
};
const debug = new URLSearchParams(location.search).has('studio-debug');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  vehicle: vehicleById(DEFAULT_VEHICLE_ID),
  zones: new Set(DEFAULT_ZONES),
  vlt: window.dnaShade || Number(document.getElementById('shadeSlider')?.value) || 35,
  compare: false,
};
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
      <span class="vehicle-card-text"><strong>${v.make === 'DNA Studio' ? v.model : `${v.make.replace('Mercedes-Benz', 'Mercedes')} ${v.model}`}</strong>
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

// ---------- Window picker ----------
function renderZones() {
  for (const z of ZONES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `zone-btn zone-btn--${z.id}`;
    b.dataset.zone = z.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="zone-btn-check" aria-hidden="true"></span><span>${z.label}</span>`;
    b.addEventListener('click', () => toggleZone(z.id, { fromList: true }));
    els.zoneMap.appendChild(b);
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
}

function toggleZone(id, { fromList = false } = {}) {
  const next = new Set(state.zones);
  const adding = !next.has(id);
  if (adding) next.add(id); else next.delete(id);
  setZones([...next], { pulse: adding ? [id] : [] });
  // From the list, swing the camera to the window that was just added.
  if (fromList && adding && viewer && !reducedMotion) viewer.view(zoneById(id).view, 800);
}

function setZones(ids, { pulse = false } = {}) {
  state.zones = new Set(ids);
  viewer?.setSelectedZones([...state.zones]);
  if (pulse && viewer) viewer.pulse(pulse === true ? [...state.zones] : pulse);
  update();
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
function currentQuote() {
  return quote(state.vehicle.bodyType, state.zones.size, els.ceramic.checked);
}

function update() {
  const q = currentQuote();
  const n = state.zones.size;
  const film = q.ceramic ? 'Ceramic' : 'Carbon';

  // Window buttons + packages.
  els.zoneMap.querySelectorAll('.zone-btn').forEach((b) => b.setAttribute('aria-pressed', String(state.zones.has(b.dataset.zone))));
  els.packages.querySelectorAll('.studio-package').forEach((b) => {
    const p = PACKAGES.find((x) => x.id === b.dataset.package);
    b.setAttribute('aria-pressed', String(p.zones.length === n && p.zones.every((z) => state.zones.has(z))));
  });
  els.count.textContent = `${n} of ${ZONES.length}`;
  els.badgeCount.textContent = n ? windowWord(n) : 'none selected';

  // Film compare highlight + ceramic amount.
  els.ceramicAmount.textContent = formatPrice(n ? q.upgrade : CERAMIC_UPGRADE.perWindow);
  els.ceramicLabel.classList.toggle('is-checked', q.ceramic);
  document.querySelectorAll('.film-compare-card').forEach((c) => c.classList.toggle('is-selected', c.dataset.film === film));

  if (!n) {
    els.resultLabel.textContent = `${q.categoryLabel} · ${film}`;
    els.resultPrice.textContent = '—';
    shownPrice = null;
    els.resultNote.textContent = 'Tap the windows on the car or pick a package to see your price.';
    els.nudge.hidden = true;
    els.book.disabled = true;
    els.barPrice.textContent = '—';
    els.barDetail.textContent = 'Pick your windows';
    els.barBook.disabled = true;
    return;
  }
  els.book.disabled = false;
  els.barBook.disabled = false;
  els.resultLabel.textContent = `${q.categoryLabel} · ${q.ceramic ? 'Carbon + Ceramic Upgrade' : 'Carbon'} · ${windowWord(n)}`;
  animatePrice(q.total);
  els.resultNote.textContent = q.ceramic
    ? `${formatPrice(q.carbon)} Carbon + ${formatPrice(q.upgrade)} Ceramic upgrade.`
    : q.isFull
      ? 'Full-vehicle bundle price — our best per-window value.'
      : `${windowWord(n)} × ${formatPrice(q.perWindow)} per window.`;
  if (q.bundleNudge !== null) {
    const missing = ZONES.find((z) => !state.zones.has(z.id));
    els.nudge.hidden = false;
    els.nudge.innerHTML = `Add the ${missing.label.toLowerCase()} for just <strong>${formatPrice(q.bundleNudge)}</strong> more &mdash; full-vehicle bundle. <button type="button" class="link-btn" data-add-zone="${missing.id}">Add it</button>`;
  } else els.nudge.hidden = true;
  els.barPrice.textContent = formatPrice(q.total);
  els.barDetail.textContent = `${windowWord(n)} · ${state.vlt}% · ${film}`;
}
els.nudge.addEventListener('click', (e) => {
  const id = e.target.closest('[data-add-zone]')?.dataset.addZone;
  if (id) toggleZone(id, { fromList: true });
});
els.ceramic.addEventListener('change', update);

// ---------- Booking hand-off (js/script.js owns the form) ----------
function book() {
  const q = currentQuote();
  if (!q.windowCount) return;
  const v = state.vehicle;
  const labels = ZONES.filter((z) => state.zones.has(z.id)).map((z) => z.label);
  const film = q.ceramic ? 'Ceramic' : 'Carbon';
  document.dispatchEvent(new CustomEvent('dna:book', {
    detail: {
      vehicleType: q.categoryLabel,
      filmType: film,
      windowCount: q.windowCount,
      windowsSelected: q.isFull ? `Full vehicle (${labels.join(', ')})` : labels.join(', '),
      estimatedPrice: formatPrice(q.total),
      summaryTitle: q.categoryLabel,
      summaryDetail: ` — ${film}, ${state.vlt}% VLT, ${q.isFull ? 'full vehicle' : labels.join(', ')}`,
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
  els.ceramic.checked = false;
  if (state.vehicle.id !== DEFAULT_VEHICLE_ID) selectVehicle(DEFAULT_VEHICLE_ID);
  setZones(DEFAULT_ZONES);
});

// ---------- Shade (from the slider in js/script.js) ----------
document.addEventListener('dna:shade', (e) => {
  const { vlt, committed } = e.detail;
  state.vlt = vlt;
  els.badgeVlt.textContent = `${vlt}%`;
  viewer?.setTint(vlt);
  if (committed) {
    viewer?.pulse();
    els.stage.classList.remove('is-tinting');
    void els.stage.offsetWidth;
    els.stage.classList.add('is-tinting'); // brief sheen sweep over the stage
  }
  update();
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
    showNote(`<strong>${v.make} ${v.model}</strong> — interactive 3D coming soon. Your price below uses ${v.bodyType === 'suv_truck' ? 'SUV / Truck' : 'Sedan / Coupe'} rates.`);
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
  showLoading(true, `Loading ${v.make === 'DNA Studio' ? v.model : `${v.make} ${v.model}`}…`);
  try {
    const done = await viewer.loadVehicle(v);
    if (!done) return; // another vehicle was picked meanwhile
    viewer.setSelectedZones([...state.zones]);
    viewer.setTint(state.vlt);
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
    viewer.on('zoneclick', ({ zoneId }) => toggleZone(zoneId));
    viewer.on('interaction', () => els.hint.classList.add('is-hidden'));
    window.tintStudio = { viewer, state, selectVehicle, setZones }; // console debugging / tests
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
els.badgeVlt.textContent = `${state.vlt}%`;
els.credit.textContent = state.vehicle.credit || '';
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
