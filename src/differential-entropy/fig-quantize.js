// ================================================================
//  Differential entropy — fig-quantize.js
//  Quantize, then subtract. Left: H(X_Δ) against log(1/Δ), the region
//  below zero shaded; a density's curve climbs the dashed asymptote
//  h + log(1/Δ), a pmf's is flat at H once Δ < 1. Right: the shared
//  p_X (editable) with the histogram at the current Δ in the panel's
//  own units: bin mass for a pmf, mass/Δ for a density. The Δ slider
//  is this figure's own; p_X is the page's.
// ================================================================

import { Region, el, svgContext, svgPoint } from '../lib/prob/region.js';
import { createMathLayer, texNum } from '../lib/prob/mathlabels.js';
import { fitWidth } from '../lib/prob/fit.js';
import { createEditor, regionAdapter } from '../lib/prob/edit.js';
import { windowPX, drawPX } from '../lib/prob/panel-px.js';
import { binMasses, quantizedH, quantizeCurve } from '../lib/prob/quantize.js';
import { entropyOf, positionsOf } from '../lib/prob/width.js';

const W0 = 1000, HP = 400, H0 = HP + 56; // the panels, then a line of readouts
const T_MIN = -3, T_MAX = 12, T_STEP = 0.25; // t = log(1/Δ): Δ from 8 down to 2^-12
const TS = Array.from({ length: Math.round((T_MAX - T_MIN) / T_STEP) + 1 }, (_, i) => T_MIN + i * T_STEP);

// Δ = 2^-t as "1/2^k" for a positive integer k, an integer for t ≤ 0, else ≤ 3 significant figures.
export function deltaLabel(t) {
    if (Math.abs(t - Math.round(t)) < 1e-9) { const k = Math.round(t); return k > 0 ? '1/' + 2 ** k : String(2 ** -k); }
    const D = 2 ** -t;
    return D < 0.01 ? D.toExponential(2) : String(+D.toPrecision(3));
}
const val = x => { const t = texNum(x); return t.startsWith('-') ? `\\class{ex-neg}{${t}}` : t; };

export function createQuantizeFigure(svg, { model }, { slider, label }) {
    const ctx = svgContext(svg, W0, H0);
    const RC = new Region(ctx, { ox: 0, oy: 0, w: 560, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const RP = new Region(ctx, { ox: 584, oy: 0, w: 416, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const handles = el('g', null, ctx.root);
    const math = createMathLayer(svg.parentElement, W0, H0);
    const editor = createEditor({ model, adapter: regionAdapter(RP, false) });
    let layoutW = W0, drawn = false;
    function layout(W) {
        const wl = Math.round(0.56 * W), gap = Math.round(0.024 * W);
        RC.o.w = wl; Object.assign(RP.o, { ox: wl + gap, w: W - wl - gap });
        layoutW = W;
        svg.setAttribute('viewBox', `0 0 ${W} ${H0}`); math.resize(W, H0);
        if (drawn) draw();
    }
    // the curve over the whole range depends only on the distribution
    let cacheKey = null, curve = null;
    function curveFor(v) {
        const key = v.disc ? v.p.join(',') : v.S;
        if (key !== cacheKey) { cacheKey = key; curve = quantizeCurve(v, TS); }
        return curve;
    }
    const yLabel = (key, R, tex) => { const [x, y] = R.ylabelAt(); math.set(key, x, y, tex, { rotate: -90 }); };
    const xLabel = (key, R, tex) => { const [x, y] = R.xlabelAt(); math.set(key, x, y, tex); };

    function draw() {
        drawn = true;
        const v = model.view(), t = +slider.value, D = 2 ** -t, Hq = quantizedH(v, D), H = entropyOf(v);
        if (label) label.textContent = deltaLabel(t);
        math.begin();
        // ---- left: H(X_Δ) against log(1/Δ) ----
        const ys = curveFor(v), top = Math.max(1, ...ys) * 1.08;
        RC.domain(T_MIN, T_MAX, -1.5, top);
        RC.rect(T_MIN, -1.5, T_MAX, 0, 'negzone');
        RC.axes({ xticks: [-2, 0, 2, 4, 6, 8, 10, 12] });
        yLabel('c-y', RC, 'H(X_\\Delta)\\ \\text{(bits)}'); xLabel('c-x', RC, '\\log(1/\\Delta)');
        if (v.disc) RC.hline(H, 'asym'); else RC.path([[T_MIN, H + T_MIN], [T_MAX, H + T_MAX]], 'asym');
        RC.path(TS.map((tt, i) => [tt, ys[i]]), 'qcurve');
        el('circle', { cx: RC.X(t), cy: RC.Y(Hq), r: 5, class: 'dot' }, RC.front);
        // ---- right: p_X with the histogram at Δ, in the panel's own units ----
        const w = windowPX(v);
        RP.domain(w.x0, w.x1, 0, w.y1);
        RP.axes(v.disc ? { xticks: positionsOf(v), yticks: [0, .5, 1] } : {});
        yLabel('p-y', RP, 'p_X(x)'); xLabel('p-x', RP, 'x');
        const { edges, masses } = binMasses(v, D), pts = [];
        masses.forEach((m, j) => {
            if (edges[j + 1] < w.x0 || edges[j] > w.x1) return;
            const h = v.disc ? m : m / D;
            pts.push([edges[j], h], [edges[j + 1], h]);
        });
        if (pts.length) RP.area(pts, 'bin'); // one path, however many bins
        drawPX(RP, v);
        handles.replaceChildren(); editor.draw(handles);
        // ---- readouts ----
        math.set('readout', layoutW / 2, HP + 30,
            `H(X_\\Delta) = ${val(Hq)}\\text{ bits}, \\quad \\log(1/\\Delta) = ${texNum(t, 2)}, \\quad H(X_\\Delta) - \\log(1/\\Delta) = ${val(Hq - t)}, \\quad ${v.disc ? 'H' : 'h'}(X) = ${val(H)}`,
            { cls: 'ex-ml-formula' });
        math.end();
    }

    // ---- editing p_X in the right panel (the model notifies, and the page redraws) ----
    let editing = false;
    svg.addEventListener('pointerdown', e => {
        const p = svgPoint(svg, e), h = editor.hit(p);
        if (!h) return;
        editing = true; svg.setPointerCapture(e.pointerId); e.preventDefault();
        editor.begin(h, p);
    });
    svg.addEventListener('pointermove', e => {
        const p = svgPoint(svg, e);
        if (editing) { editor.move(p); return; }
        svg.style.cursor = editor.cursorFor(editor.hit(p));
    });
    const end = () => { if (editing) { editing = false; editor.end(); } };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    slider.addEventListener('input', draw);
    fitWidth(svg.parentElement, layout);
    // back to the Δ the page loads with (the page redraws after a reset)
    const reset = () => { slider.value = slider.defaultValue; };
    return { draw, reset };
}
