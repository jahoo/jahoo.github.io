// ================================================================
//  Through the quantile function — main.js
//  The transform figure on its own: a uniform U carried through F_X⁻¹
//  to X, with the common controls (case, p_X, reset).
// ================================================================

import { createModel } from '../lib/prob/model.js';
import { createPosition } from '../lib/prob/position.js';
import { createTransformFigure } from '../lib/prob/fig-transform.js';
import { bindCommonControls } from '../lib/prob/controls.js';

export function init() {
    const svg = document.getElementById('qt-transform');
    if (!svg) return;
    const model = createModel(), pos = createPosition(model);
    const ui = { g: 'neglog', gBase: 'neglog', gc: null, ghost: true };
    let fig = null, controls = null;
    const redraw = () => { fig?.draw(); controls?.update(); };
    const ctx = { model, pos, ui, redraw, customG: () => {}, stopPlay: () => {} };
    controls = bindCommonControls({ model, pos, redraw }, { afterCase: () => pos.setU(0.6) });
    fig = createTransformFigure(svg, ctx);
    model.subscribe(() => { pos.refresh(); redraw(); });
    redraw();
}
