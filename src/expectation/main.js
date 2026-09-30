// ================================================================
//  Expectation — main.js
//  One distribution model and one (x, u) position, shared by the
//  control bar and both figures.
// ================================================================

import { createModel } from '../lib/prob/model.js';
import { createPosition } from '../lib/prob/position.js';
import { computeFrame } from './frame.js';
import { bindControls } from './controls.js';
import { createAreaFigure } from './fig-area.js';
import { createTransformFigure } from './fig-transform.js';
import { createProductFigure } from './fig-product.js';

export function init() {
    const areaSvg = document.getElementById('ex-area');
    const transformSvg = document.getElementById('ex-transform');
    const productSvg = document.getElementById('ex-product');
    if (!areaSvg && !transformSvg && !productSvg) return;

    const model = createModel(), pos = createPosition(model);
    // the unbuilt rest of each plot is always shown, ghosted
    // g is a named function, or 'custom' (discrete only): the values gc at the atoms,
    // which began as those of the named function gBase
    const ui = { g: 'neglog', gBase: 'neglog', gc: null, ghost: true };
    let controls = null, figs = [];
    function redraw() {
        const fr = computeFrame(model, pos, ui.g, ui.gc);
        for (const f of figs) f.draw(fr);
        controls?.update(fr);
    }
    // switch g to custom values: those of the current g if fresh (or none are kept yet)
    function customG(fresh) {
        if (ui.g === 'custom') return;
        // atoms without mass have no value of g; they start at 0 should they gain mass
        if (fresh || !ui.gc) ui.gc = computeFrame(model, pos, ui.g).gs.map(y => (Number.isFinite(y) ? y : 0));
        ui.g = 'custom';
    }
    const ctx = { model, pos, ui, redraw, customG, stopPlay: () => controls?.stopPlay() };
    controls = bindControls(ctx);
    if (areaSvg) figs.push(createAreaFigure(areaSvg, ctx));
    if (transformSvg) figs.push(createTransformFigure(transformSvg, ctx));
    if (productSvg) figs.push(createProductFigure(productSvg, ctx));
    // an edit of p_X keeps the driving coordinate and recomputes the other
    model.subscribe(() => { pos.refresh(); redraw(); });
    redraw();
}
