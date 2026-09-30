// ================================================================
//  Expectation — controls.js
//  The sticky control bar: case, distribution, g (a menu with typeset
//  options), play, the whole area, reset. Every element is optional; a case toggle
//  may also sit elsewhere on the page (the entropy post's draft section).
// ================================================================

import { DISC_PRESETS, CONT_PRESETS } from '../lib/prob/model.js';
import { createMenu } from './menu.js';

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
    // each play button holds both labels (typeset); .playing shows the pause one
    function stopPlay() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0; which = null;
        for (const w of ['x', 'u']) $('ex-play' + w)?.classList.remove('playing');
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
        $('ex-play' + w)?.classList.add('playing');
    }
    $('ex-playx')?.addEventListener('click', () => play('x'));
    $('ex-playu')?.addEventListener('click', () => play('u'));

    // ---- the whole area: u = 1 ----
    $('ex-whole')?.addEventListener('click', () => { stopPlay(); pos.setU(1); redraw(); });

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
    const cases = [...document.querySelectorAll('.ex-case')];
    for (const box of cases) seg(box, k => {
        if (k === model.kase) return;
        stopPlay();
        if (k === 'cont' && ui.g === 'custom') ui.g = ui.gBase; // a custom g lives on the atoms; before setCase redraws
        model.setCase(k); fillPresets(); pos.setU(0.6);
        redraw();
    });
    preset?.addEventListener('change', () => { stopPlay(); model.setPreset(preset.value); });
    const gsel = $('ex-gsel') && createMenu($('ex-gsel'));
    gsel?.addEventListener('change', () => {
        if (gsel.value === 'custom') customG(false); else ui.g = ui.gBase = gsel.value;
        redraw();
    });
    fillPresets();

    // ---- reset: everything as the page loads (case, distributions, window, g, position) ----
    $('ex-reset')?.addEventListener('click', () => {
        stopPlay();
        Object.assign(ui, { g: 'neglog', gBase: 'neglog', gc: null });
        model.reset(); // first: the position's start (x = 4.1) is a discrete one
        pos.reset();
        fillPresets();
        redraw();
    });

    // ---- keep the case attribute and the preset menu in step with the model ----
    function update() {
        document.body.dataset.exCase = model.kase;
        for (const b of cases.flatMap(box => [...box.querySelectorAll('button')])) b.setAttribute('aria-pressed', b.dataset.v === model.kase ? 'true' : 'false');
        const key = model.kase === 'disc' ? model.discKey : model.contKey;
        if (preset && preset.value !== key) preset.value = key;
        if (gsel) {
            gsel.hide('custom', model.kase !== 'disc');
            if (gsel.value !== ui.g) gsel.value = ui.g;
        }
    }

    return { update, stopPlay };
}
