// ================================================================
//  Differential entropy — main.js
//  The opening figure is the expectation post's area figure with g
//  fixed to −log p_X and no sweep: it always shows the whole area,
//  u = 1. The draft section's transform figure shares the model but
//  keeps a position of its own. The later figures bind to their own
//  elements and no-op if they're absent.
// ================================================================

import { createModel } from '../lib/prob/model.js';
import { createPosition } from '../lib/prob/position.js';
import { computeFrame } from '../lib/prob/frame.js';
import { createAreaFigure } from '../lib/prob/fig-area.js';
import { createTransformFigure } from '../lib/prob/fig-transform.js';
import { bindControls } from './controls.js';
import { initQuantize } from './fig-quantize.js';
import { initStretch } from './fig-stretch.js';
import { initMI } from './fig-mi.js';

// Where the pinned figure stands: the whole area, and x past every outcome, so every
// part of p_X and of the height counts as integrated.
const WHOLE = { x: Infinity, u: 1 };

function initEntropyFigure() {
    const areaSvg = document.getElementById('de-area');
    const transformSvg = document.getElementById('ex-transform');
    if (!areaSvg && !transformSvg) return;
    const model = createModel(), pos = createPosition(model);
    // g is fixed: entropy is the expectation of −log p_X
    const ui = { g: 'neglog', gBase: 'neglog', gc: null, ghost: true };
    let controls = null, area = null, transform = null;
    function redraw() {
        area?.draw(computeFrame(model, WHOLE, ui.g));
        transform?.draw(computeFrame(model, pos, ui.g));
        controls?.update();
    }
    const ctx = { model, pos, ui, redraw, customG: () => {}, stopPlay: () => {} };
    controls = bindControls(ctx);
    if (areaSvg) area = createAreaFigure(areaSvg, ctx, { sweep: false, notes: 'entropy' });
    if (transformSvg) transform = createTransformFigure(transformSvg, ctx);
    model.subscribe(() => { pos.refresh(); redraw(); });
    redraw();
}

export function init() {
    initEntropyFigure();
    initQuantize();
    initStretch();
    initMI();
}
