// ================================================================
//  Differential entropy — main.js
//  One model and one position for the whole post. The opening figure
//  is the expectation post's area figure with g fixed to −log p_X and
//  no sweep (always the whole area, u = 1). The properties sections
//  draw the same p_X: the transform figure in width mode on the real
//  position, then the quantize and stretch figures with controls of
//  their own. The MI figure keeps its own distribution. Each figure
//  binds to its element and is skipped if the element is absent.
// ================================================================

import { createModel } from '../lib/prob/model.js';
import { createPosition } from '../lib/prob/position.js';
import { computeFrame } from '../lib/prob/frame.js';
import { createAreaFigure } from '../lib/prob/fig-area.js';
import { createTransformFigure } from '../lib/prob/fig-transform.js';
import { bindControls } from './controls.js';
import { initMI } from './fig-mi.js';

// Where the pinned figure stands: the whole area, and x past every outcome.
const WHOLE = { x: Infinity, u: 1 };
const $ = id => document.getElementById(id);

export function init() {
    const areaSvg = $('de-area'), widthSvg = $('de-width');
    if (areaSvg || widthSvg) {
        const model = createModel(), pos = createPosition(model);
        const ui = { g: 'neglog', gBase: 'neglog', gc: null, ghost: true }; // g is fixed: entropy is E[−log p_X]
        let controls = null, area = null, width = null;
        function redraw() {
            area?.draw(computeFrame(model, WHOLE, ui.g));
            width?.draw();
            controls?.update();
        }
        const ctx = { model, pos, ui, redraw, customG: () => {}, stopPlay: () => {} };
        controls = bindControls(ctx);
        if (areaSvg) area = createAreaFigure(areaSvg, ctx, { sweep: false, notes: 'entropy' });
        if (widthSvg) width = createTransformFigure(widthSvg, ctx, { width: true });
        model.subscribe(() => { pos.refresh(); redraw(); });
        redraw();
    }
    initMI();
}
