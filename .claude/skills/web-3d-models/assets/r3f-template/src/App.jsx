// Example page: a React-owned options panel driving <ModelViewer>. Replace the markup with your
// design system's components — the only contract is `selections` ({ optionId: choiceId | bool }).
import { lazy, Suspense, useState } from 'react';
import config from './3d/model.config.js';
import './3d/viewer.css';

// Lazy-load the 3D bundle (three + R3F ≈ 250 KB gz) so the rest of the page paints first.
const ModelViewer = lazy(() => import('./3d/ModelViewer.jsx'));

export default function App() {
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(config.options.filter((o) => o.default !== undefined).map((o) => [o.id, o.default])));
  const [view, setView] = useState(null);
  const [variants, setVariants] = useState([]);
  const set = (id, value) => setSelections((s) => ({ ...s, [id]: value }));

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <h1>Product in 3D</h1>
      <div className="m3d-layout">
        <Suspense fallback={<div className="m3d-stage" />}>
          <ModelViewer config={config} selections={selections} view={view} onLoad={({ variants }) => setVariants(variants)} />
        </Suspense>

        <div className="m3d-panel">
          {config.options.map((opt) => {
            const choices = opt.type === 'views'
              ? config.camera.views.map((v) => ({ id: v.id, label: v.label }))
              : opt.type === 'variants' && !opt.choices ? variants.map((v) => ({ id: v, label: v })) : opt.choices || [];
            const current = opt.type === 'views' ? view : selections[opt.id];
            return (
              <div className="m3d-group" key={opt.id}>
                <p className="m3d-group-label" id={`opt-${opt.id}`}>{opt.label}</p>
                {opt.type === 'toggle' ? (
                  <button type="button" role="switch" className="m3d-switch" aria-labelledby={`opt-${opt.id}`}
                    aria-checked={String(selections[opt.id] ?? true)} onClick={() => set(opt.id, !(selections[opt.id] ?? true))}>
                    <span className="m3d-switch-thumb" />
                  </button>
                ) : (
                  <div className="m3d-choices" role="radiogroup" aria-labelledby={`opt-${opt.id}`}>
                    {choices.map((c) => (
                      <button key={c.id} type="button" role="radio" aria-checked={String(c.id === current)}
                        className={`m3d-choice${c.swatch ? ' has-swatch' : ''}`}
                        onClick={() => (opt.type === 'views' ? setView(c.id) : set(opt.id, c.id))}>
                        {c.swatch && <span className="m3d-swatch" style={{ '--swatch': c.swatch }} />}
                        <span className="m3d-choice-label">{c.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
