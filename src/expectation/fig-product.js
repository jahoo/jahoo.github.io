// ================================================================
//  Expectation — fig-product.js
//  The same expectation over the real line, straight from the
//  definition: g(x) p_X(x) over x, its part up to x shaded, and that
//  sum or integral. Discrete: one lollipop per outcome, a point mass
//  of weight g(x) p_X(x). The panel sits under the area figure's p_X
//  panel, on the same x-axis (across the full width when narrow).
//  Dragging sets x.
// ================================================================

import { Region, el, svgContext, svgPoint } from '../lib/prob/region.js';
import { createMathLayer, texNum } from '../lib/prob/mathlabels.js';
import { fitWidth } from '../lib/prob/fit.js';
import { productFrame } from './frame.js';

// the area figure's columns (see fig-area.js), so the x-axes line up
const GAP = 28, WL0 = 400, WL_FORMULA = 340;
const HP = 240, HF = 70; // the panel; the formula's own row above it on a narrow layout

export function createProductFigure(svg, { model, pos, redraw, stopPlay }) {
    const ctx = svgContext(svg, 1000, HP);
    const R = new Region(ctx, { ox: 0, oy: 0, w: 0, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const math = createMathLayer(svg.parentElement, 1000, HP);
    let lastFr = null, colL = WL0, layoutW = 1000, row = false;
    function layout(W) {
        const WL = Math.round((W - GAP) * WL0 / (1000 - GAP));
        colL = WL; layoutW = W; row = WL < WL_FORMULA;
        // under the p_X panel; on a narrow layout, with the formula above, across the full width
        Object.assign(R.o, row ? { ox: 0, w: W, oy: HF } : { ox: WL + GAP, w: W - WL - GAP, oy: 0 });
        const H = HP + (row ? HF : 0);
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        math.resize(W, H);
        if (lastFr) draw(lastFr);
    }

    function draw(fr) {
        lastFr = fr;
        const v = model.view(), pr = productFrame(fr);
        const finite = fr.disc ? pr.ys.filter(Number.isFinite) : pr.ys.filter((y, i) => fr.S.Fs[i] > 1e-4 && fr.S.Fs[i] < 1 - 1e-4);
        let lo = Math.min(0, ...finite), hi = Math.max(0, ...finite);
        if (hi - lo < 1e-9) hi = lo + 1;
        const pad = 0.08 * (hi - lo);
        const [x0, x1] = fr.disc ? [0.4, fr.n + 0.6] : v.xRange;
        R.domain(x0, x1, lo < 0 ? lo - pad : 0, hi + pad);
        R.axes(fr.disc ? { xticks: fr.p.map((_, i) => i + 1) } : {});
        math.begin();
        const [lx, ly] = R.ylabelAt(); math.set('y', lx, ly, 'g(x)\\,p_X(x)', { rotate: -90 });
        const [bx, by] = R.xlabelAt(); math.set('x', bx, by, 'x');

        if (fr.disc) {
            // atoms at or below x are counted, each whole
            pr.ys.forEach((y, i) => {
                if (fr.p[i] <= 0) { el('circle', { cx: R.X(i + 1), cy: R.Y(0), r: 4, class: 'pin-null' }, R.data); return; }
                const c = i + 1 <= fr.x + 1e-9 ? 'done' : 'todo', neg = c === 'done' && y < 0 ? ' neg' : '';
                el('line', { x1: R.X(i + 1), x2: R.X(i + 1), y1: R.Y(0), y2: R.Y(y), class: 'stem-' + c + neg }, R.data);
                el('circle', { cx: R.X(i + 1), cy: R.Y(y), r: 4.5, class: 'pin-' + c + neg }, R.data);
            });
        } else {
            const pts = fr.S.xs.map((x, i) => [x, pr.ys[i]]).filter(q => q[0] >= x0 - .05 && q[0] <= x1 + .05);
            R.path(pts, 'curve later');
            const done = pts.filter(q => q[0] <= fr.x);
            if (done.length) {
                const yNow = done[done.length - 1][1];
                const run = Number.isFinite(fr.x) ? done.concat([[fr.x, yNow]]) : done;
                R.area(run, 'fm', R.gAbove()); R.area(run, 'fn', R.gBelow());
                R.path(run, 'curve');
            }
        }
        if (R.inX(fr.x)) R.vline(fr.x, 'cursor');

        // the sum or integral so far, in the left column (or its own row above, when narrow)
        const t = texNum(pr.upto), val = Number.isNaN(pr.upto) ? '\\text{undefined}' : t.startsWith('-') ? `\\class{ex-neg}{${t}}` : t;
        const tex = fr.disc
            ? `\\displaystyle\\sum_{x' \\le x} g(x')\\,p_X(x') \\;=\\; ${val}`
            : `\\displaystyle\\int_{-\\infty}^{${Number.isFinite(fr.x) ? 'x' : '\\infty'}} g(x')\\,p_X(x') \\dee{x'} \\;=\\; ${val}`;
        if (row) math.set('sum', layoutW / 2, HF / 2 + 4, tex, { cls: 'ex-ml-formula' });
        else math.set('sum', colL / 2, (R.pt + R.pb) / 2, tex, { cls: 'ex-ml-formula' });
        math.end();
    }

    // ---- dragging sets x ----
    let dragging = false;
    const moveTo = p => { pos.setX(R.invX(p.x)); redraw(); };
    svg.addEventListener('pointerdown', e => {
        const p = svgPoint(svg, e);
        if (!R.contains(p, 4)) return;
        stopPlay(); dragging = true; svg.setPointerCapture(e.pointerId); e.preventDefault();
        moveTo(p);
    });
    svg.addEventListener('pointermove', e => {
        const p = svgPoint(svg, e);
        if (dragging) { moveTo(p); return; }
        svg.style.cursor = R.contains(p, 4) ? 'ew-resize' : '';
    });
    const end = () => { dragging = false; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    fitWidth(svg.parentElement, layout);
    return { draw };
}
