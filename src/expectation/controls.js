// ================================================================
//  Expectation — controls.js
//  The case toggle in the opening sentence, the sticky control bar
//  (its copy of the case toggle, distribution, g, play, atom steps).
//  Every element is optional.
// ================================================================

import { clamp } from '../lib/prob/dist.js';
import { DISC_PRESETS, CONT_PRESETS } from '../lib/prob/model.js';

const $ = id => document.getElementById(id);


// A group of buttons with aria-pressed, calling onChange(value).
function seg(box, onChange) {
    if (!box) return;
    const btns = [...box.querySelectorAll('button')];
    btns.forEach(b => b.addEventListener('click', () => {
        btns.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        onChange(b.dataset.v);
    }));
}

export function bindControls({ model, pos, ui, redraw, customG }) {
    // ---- play: sweep x (or u) from its start to its end at a steady pace over ~7 s ----
    let raf = 0, t0 = 0, which = null;
    const playLabel = { x: '▶ sweep x', u: '▶ sweep u' };
    function stopPlay() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0; which = null;
        for (const w of ['x', 'u']) { const b = $('ex-play' + w); if (b) b.textContent = playLabel[w]; }
    }
    function tick(t) {
        if (!t0) t0 = t;
        const f = Math.min(1, (t - t0) / 7000);
        if (which === 'x') { const [lo, hi] = model.view().xRange; pos.setX(lo + f * (hi - lo)); } else pos.setU(f);
        redraw();
        if (f < 1) raf = requestAnimationFrame(tick); else stopPlay();
    }
    function play(w) {
        const was = which;
        stopPlay();
        if (was === w) return;
        which = w; t0 = 0; raf = requestAnimationFrame(tick);
        const b = $('ex-play' + w); if (b) b.textContent = '❚❚ pause';
    }
    $('ex-playx')?.addEventListener('click', () => play('x'));
    $('ex-playu')?.addEventListener('click', () => play('u'));

    // ---- atom to atom (discrete): x jumps to the next or previous atom ----
    function step(dir) {
        stopPlay();
        const n = model.view().n;
        const p = model.view().p;
        let next = dir > 0 ? Math.floor(pos.x + 1e-9) + 1 : Math.ceil(pos.x - 1e-9) - 1;
        while (next >= 1 && next <= n && p[next - 1] <= 0) next += dir; // skip atoms without mass
        pos.setX(clamp(next, 0.5, n + 0.5));
        redraw();
    }
    $('ex-fwd')?.addEventListener('click', () => step(1));
    $('ex-back')?.addEventListener('click', () => step(-1));

    // ---- case, distribution, g ----
    const preset = $('ex-preset');
    function fillPresets() {
        if (!preset) return;
        const disc = model.kase === 'disc', src = disc ? DISC_PRESETS : CONT_PRESETS, cur = disc ? model.discKey : model.contKey;
        const opts = Object.entries(src).map(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.label; return o; });
        // discrete: custom is a choice, the last edited pmf; continuous: shown only once edited
        const custom = document.createElement('option'); custom.value = 'custom'; custom.textContent = 'custom'; custom.hidden = !disc && cur !== 'custom';
        preset.replaceChildren(...opts, custom);
        preset.value = cur;
    }
    // the case toggle sits in the opening sentence, and a copy in the bar
    const cases = [...document.querySelectorAll('.ex-case')];
    for (const box of cases) seg(box, k => {
        if (k === model.kase) return;
        stopPlay();
        if (k === 'cont' && ui.g === 'custom') ui.g = ui.gBase; // a custom g lives on the atoms; before setCase redraws
        model.setCase(k); fillPresets(); pos.setU(0.6);
        redraw();
    });
    preset?.addEventListener('change', () => { stopPlay(); model.setPreset(preset.value); });
    const gsel = $('ex-gsel');
    gsel?.addEventListener('change', () => {
        if (gsel.value === 'custom') customG(false); else ui.g = ui.gBase = gsel.value;
        redraw();
    });
    fillPresets();

    // ---- the bar's copy of the case toggle appears once the sentence's has scrolled under the bar ----
    const bar = $('ex-bar'), inText = cases.find(box => !bar?.contains(box));
    if (bar && inText) {
        let queued = false;
        const place = () => {
            queued = false;
            const b = bar.getBoundingClientRect();
            bar.classList.toggle('ex-with-case', b.top <= 1 && inText.getBoundingClientRect().bottom < b.bottom);
        };
        const queue = () => { if (!queued) { queued = true; requestAnimationFrame(place); } };
        addEventListener('scroll', queue, { passive: true });
        addEventListener('resize', queue);
        place();
    }

    // ---- keep the case attribute and the preset menu in step with the model ----
    function update() {
        document.body.dataset.exCase = model.kase;
        for (const b of cases.flatMap(box => [...box.querySelectorAll('button')])) b.setAttribute('aria-pressed', b.dataset.v === model.kase ? 'true' : 'false');
        const key = model.kase === 'disc' ? model.discKey : model.contKey;
        if (preset && preset.value !== key) preset.value = key;
        if (gsel) {
            const opt = gsel.querySelector('option[value="custom"]');
            if (opt) opt.hidden = model.kase !== 'disc';
            if (gsel.value !== ui.g) gsel.value = ui.g;
        }
    }

    return { update, stopPlay };
}
