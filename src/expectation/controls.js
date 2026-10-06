// ================================================================
//  Expectation — controls.js
//  This post's control bar: the common controls (case, p_X, reset)
//  plus g (a menu with typeset options), play and the whole area.
// ================================================================

import { bindCommonControls } from '../lib/prob/controls.js';
import { createMenu } from './menu.js';

const $ = id => document.getElementById(id);

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

    // ---- case, p_X, reset: the common controls, with this post's hooks ----
    const common = bindCommonControls({ model, pos, redraw }, {
        stopPlay,
        // a custom g lives on the atoms; drop it before setCase redraws
        beforeCase: k => { if (k === 'cont' && ui.g === 'custom') ui.g = ui.gBase; },
        afterCase: () => pos.setU(0.6),
        onReset: () => Object.assign(ui, { g: 'neglog', gBase: 'neglog', gc: null }),
    });

    // ---- g ----
    const gsel = $('ex-gsel') && createMenu($('ex-gsel'));
    gsel?.addEventListener('change', () => {
        if (gsel.value === 'custom') customG(false); else ui.g = ui.gBase = gsel.value;
        redraw();
    });

    function update() {
        common.update();
        if (gsel) {
            gsel.hide('custom', model.kase !== 'disc');
            if (gsel.value !== ui.g) gsel.value = ui.g;
        }
    }

    return { update, stopPlay };
}
