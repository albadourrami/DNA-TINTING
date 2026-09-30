// Builds the viewer UI (loading state, error fallback, toolbar, option controls, touch guard)
// from the same config the engine uses. Swap the model → edit model.config.js; this file
// doesn't change.
//
//   import { mountViewer } from './viewer/ui.js';
//   const { viewer } = await mountViewer(document.querySelector('#product-3d'), config);
//
// Need a completely custom UI instead? Use createViewer() from viewer.js directly and call
// viewer.setOption(id, value) from your own buttons.

import { createViewer } from './viewer.js';

const ICONS = {
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/><path d="M21 3v6h-6"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  shrink: '<path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const h = (tag, attrs = {}, html = '') => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  if (html) el.innerHTML = html;
  return el;
};
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function mountViewer(root, config) {
  const ui = { panel: 'auto', toolbar: true, hint: true, screenshot: false, ...(config.ui || {}) };
  const touch = matchMedia('(pointer: coarse)').matches;
  root.classList.add('m3d');
  if (ui.panel === 'none' || !config.options?.length) root.classList.add('m3d--no-panel');

  // ---------- Stage ----------
  const stage = h('div', {
    class: 'm3d-stage',
    tabindex: '0',
    'aria-label': `${config.model.alt || '3D model'} — interactive 3D view. Use arrow keys to rotate, plus and minus to zoom, 0 to reset.`,
  });
  const poster = config.model.poster ? h('img', { class: 'm3d-poster', src: config.model.poster, alt: config.model.alt || '', decoding: 'async' }) : null;
  poster?.addEventListener('error', () => poster.remove()); // missing poster: no broken-image icon
  const loading = h('div', { class: 'm3d-loading', role: 'status' },
    `<div class="m3d-progress" role="progressbar" aria-label="Loading 3D model" aria-valuemin="0" aria-valuemax="100"><span></span></div><p class="m3d-loading-text">Loading 3D model…</p>`);
  const error = h('div', { class: 'm3d-error', hidden: true, role: 'alert' });
  const hint = ui.hint ? h('p', { class: 'm3d-hint', 'aria-hidden': 'true' }, touch ? 'Drag to rotate · Pinch to zoom' : 'Drag to rotate · Scroll to zoom') : null;
  stage.append(...[poster, loading, error, hint].filter(Boolean));

  const panel = h('div', { class: 'm3d-panel' });
  root.append(stage, panel);

  // ---------- Engine ----------
  const viewer = await createViewer(stage, config);

  const bar = loading.querySelector('.m3d-progress span');
  const progressEl = loading.querySelector('.m3d-progress');
  const loadingText = loading.querySelector('.m3d-loading-text');
  viewer.on('progress', ({ ratio }) => {
    if (ratio == null) { progressEl.classList.add('is-indeterminate'); return; }
    const pct = Math.round(ratio * 100);
    bar.style.width = `${pct}%`;
    progressEl.setAttribute('aria-valuenow', String(pct));
    loadingText.textContent = `Loading 3D model… ${pct}%`;
  });

  viewer.on('error', ({ reason }) => {
    root.classList.add('is-error');
    loading.hidden = true;
    error.hidden = false;
    const msg = reason === 'webgl'
      ? `Your browser can’t display 3D here.${poster ? ' Showing a photo instead.' : ''}`
      : 'The 3D model couldn’t load. Check your connection and try again.';
    error.innerHTML = `<p>${msg}</p>${reason === 'webgl' ? '' : '<button type="button" class="m3d-btn m3d-retry">Try again</button>'}`;
    error.querySelector('.m3d-retry')?.addEventListener('click', () => {
      error.hidden = true; loading.hidden = false; root.classList.remove('is-error');
      viewer.load(config.model.url).catch(() => {});
    });
  });
  if (viewer.failed) return { viewer, root };

  viewer.on('load', ({ variants }) => {
    root.classList.add('is-loaded');
    loading.hidden = true;
    buildPanel(variants);
  });
  viewer.on('interaction', () => hint?.classList.add('is-hidden'));

  // ---------- Touch guard (phones): tap to interact so the page can still scroll ----------
  if (viewer.guardEnabled) {
    const activate = h('button', { type: 'button', class: 'm3d-activate' }, `${icon('hand')}<span>Tap to rotate &amp; zoom</span>`);
    const done = h('button', { type: 'button', class: 'm3d-btn m3d-done', 'aria-label': 'Done — return to scrolling' }, `${icon('check')}<span>Done</span>`);
    stage.append(activate, done);
    activate.addEventListener('click', () => viewer.setInteractive(true));
    done.addEventListener('click', () => viewer.setInteractive(false));
  }

  // ---------- Toolbar ----------
  if (ui.toolbar) {
    const tb = h('div', { class: 'm3d-toolbar', role: 'toolbar', 'aria-label': '3D view controls' });
    const btn = (name, label, onClick, extra = {}) => {
      const b = h('button', { type: 'button', class: 'm3d-tool', 'aria-label': label, title: label, ...extra }, icon(name));
      b.addEventListener('click', onClick);
      tb.appendChild(b);
      return b;
    };
    btn('reset', 'Reset view', () => viewer.resetView());
    if (config.camera?.autoRotate !== false) {
      const rot = btn('rotate', 'Auto-rotate', () => {
        viewer.setAutoRotate(!viewer.autoRotate);
        rot.setAttribute('aria-pressed', String(viewer.autoRotate));
      }, { 'aria-pressed': String(viewer.autoRotate) });
    }
    if (ui.screenshot) {
      btn('camera', 'Save image', () => {
        const a = h('a', { href: viewer.screenshot(), download: `${(config.model.alt || 'model').replace(/\W+/g, '-').toLowerCase()}.png` });
        a.click();
      });
    }
    const fs = btn('expand', 'Full screen', () => toggleFullscreen());
    const toggleFullscreen = async () => {
      const on = !(document.fullscreenElement === root || root.classList.contains('is-fullscreen'));
      // iPhone Safari has no element fullscreen: fall back to a fixed overlay.
      if (root.requestFullscreen && document.fullscreenEnabled) {
        if (on) await root.requestFullscreen().catch(() => root.classList.add('is-fullscreen'));
        else if (document.fullscreenElement) await document.exitFullscreen();
        else root.classList.remove('is-fullscreen');
      } else root.classList.toggle('is-fullscreen', on);
      sync();
    };
    const sync = () => {
      const on = document.fullscreenElement === root || root.classList.contains('is-fullscreen');
      root.classList.toggle('is-fullscreen-active', on);
      fs.innerHTML = icon(on ? 'shrink' : 'expand');
      fs.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      if (on && viewer.guardEnabled) viewer.setInteractive(true);
    };
    document.addEventListener('fullscreenchange', sync);
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('is-fullscreen')) { root.classList.remove('is-fullscreen'); sync(); } });
    stage.appendChild(tb);
  }

  // ---------- Option controls (built from config.options) ----------
  function buildPanel(variants) {
    panel.innerHTML = '';
    for (const opt of config.options || []) {
      const group = h('div', { class: `m3d-group m3d-group--${opt.type}`, 'data-option': opt.id });
      const labelId = `m3d-${opt.id}-label`;
      group.appendChild(h('p', { class: 'm3d-group-label', id: labelId }, esc(opt.label || opt.id)));

      if (opt.type === 'toggle') {
        const sw = h('button', { type: 'button', role: 'switch', class: 'm3d-switch', 'aria-labelledby': labelId, 'aria-checked': String(viewer.selections[opt.id] ?? opt.default ?? true) }, '<span class="m3d-switch-thumb"></span>');
        sw.addEventListener('click', () => {
          const next = sw.getAttribute('aria-checked') !== 'true';
          sw.setAttribute('aria-checked', String(next));
          viewer.setOption(opt.id, next);
        });
        group.appendChild(sw);
      } else {
        // Swatches / variants / views all render as a radio group of buttons.
        let choices = opt.choices || [];
        if (opt.type === 'variants' && !choices.length) choices = variants.map((v) => ({ id: v, label: v }));
        if (opt.type === 'views') choices = (config.camera?.views || []).map((v) => ({ id: v.id, label: v.label || v.id }));
        const list = h('div', { class: 'm3d-choices', role: 'radiogroup', 'aria-labelledby': labelId });
        const desc = h('p', { class: 'm3d-choice-desc', 'aria-live': 'polite' });
        const current = viewer.selections[opt.id] ?? opt.default;
        const buttons = choices.map((c) => {
          const b = h('button', {
            type: 'button', role: 'radio', class: `m3d-choice${c.swatch ? ' has-swatch' : ''}`,
            'aria-checked': String(c.id === current), tabindex: c.id === current || (!current && c === choices[0]) ? '0' : '-1',
            'data-choice': c.id,
          }, `${c.swatch ? `<span class="m3d-swatch" style="--swatch:${esc(c.swatch)}" aria-hidden="true"></span>` : ''}<span class="m3d-choice-label">${esc(c.label ?? c.id)}</span>`);
          b.addEventListener('click', () => select(c));
          return b;
        });
        const select = (c) => {
          buttons.forEach((b) => { const on = b.dataset.choice === c.id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
          desc.textContent = c.description || '';
          if (opt.type === 'views') viewer.goToView(c.id);
          else viewer.setOption(opt.id, c.id);
        };
        // Arrow-key navigation inside the radio group (WAI-ARIA pattern).
        list.addEventListener('keydown', (e) => {
          const i = buttons.indexOf(document.activeElement);
          if (i < 0) return;
          const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!d) return;
          e.preventDefault();
          const n = buttons[(i + d + buttons.length) % buttons.length];
          n.focus();
          n.click();
        });
        list.append(...buttons);
        const sel = choices.find((c) => c.id === current);
        if (sel?.description) desc.textContent = sel.description;
        group.append(list, desc);
      }
      panel.appendChild(group);
    }
  }

  // Keep the panel in sync when site code calls viewer.setOption() directly.
  viewer.on('change', ({ id, value }) => {
    const g = panel.querySelector(`[data-option="${CSS.escape(id)}"]`);
    if (!g) return;
    g.querySelectorAll('[role="radio"]').forEach((b) => { b.setAttribute('aria-checked', String(b.dataset.choice === value)); b.tabIndex = b.dataset.choice === value ? 0 : -1; });
    g.querySelector('[role="switch"]')?.setAttribute('aria-checked', String(!!value));
    const opt = config.options.find((o) => o.id === id);
    const c = opt?.choices?.find((x) => x.id === value);
    const d = g.querySelector('.m3d-choice-desc');
    if (d) d.textContent = c?.description || '';
  });

  return { viewer, root };
}
