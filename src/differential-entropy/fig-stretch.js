// ================================================================
//  Differential entropy — fig-stretch.js
//  Stretching the axis: Y = aX in a panel of its own, the original as
//  a ghost. A pmf's atoms move apart with their heights unchanged
//  (shuffle relabels them too); a density flattens by 1/a. The dashed
//  box is the uniform with the same entropy: 2^H slots, or 2^h long.
//  The slider, the shuffle and the permutation are this figure's own;
//  the model's p_X is untouched, and this panel is not editable.
// ================================================================

import { Region, svgContext } from '../lib/prob/region.js';
import { createMathLayer, texNum } from '../lib/prob/mathlabels.js';
import { fitWidth } from '../lib/prob/fit.js';
import { windowPX, drawPX } from '../lib/prob/panel-px.js';
import { stretchView, randomPerm } from '../lib/prob/stretch.js';
import { boxOf, positionsOf } from '../lib/prob/width.js';

const W0 = 1000, HP = 340, H0 = HP + 56;

// a = 2^s: an integer for an integer s ≥ 0, "1/2^k" for a negative integer s, else 3 figures.
export function stretchLabel(s) {
    if (Math.abs(s - Math.round(s)) < 1e-9) { const k = Math.round(s); return k < 0 ? '1/' + 2 ** -k : String(2 ** k); }
    const a = 2 ** s;
    return a >= 1 ? String(+a.toPrecision(3)) : a.toPrecision(2);
}
const val = x => { const t = texNum(x); return t.startsWith('-') ? `\\class{ex-neg}{${t}}` : t; };

export function createStretchFigure(svg, { model }, { slider, label, shuffle }) {
    const ctx = svgContext(svg, W0, H0);
    const R = new Region(ctx, { ox: 0, oy: 0, w: W0, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const math = createMathLayer(svg.parentElement, W0, H0);
    let layoutW = W0, drawn = false, perm = null;
    function layout(W) {
        R.o.w = W; layoutW = W;
        svg.setAttribute('viewBox', `0 0 ${W} ${H0}`); math.resize(W, H0);
        if (drawn) draw();
    }

    function draw() {
        drawn = true;
        const v = model.view(), s = +slider.value, a = 2 ** s;
        const y = stretchView(v, a, v.disc ? perm : null), moved = Math.abs(s) > 1e-9 || (v.disc && perm !== null);
        if (label) label.textContent = stretchLabel(s);
        math.begin();
        // a window holding both the original and the stretched distribution
        const w0 = windowPX(v), w1 = windowPX(y);
        R.domain(Math.min(w0.x0, w1.x0), Math.max(w0.x1, w1.x1), 0, Math.max(w0.y1, w1.y1));
        R.axes(v.disc ? { xticks: positionsOf(y), yticks: [0, .5, 1] } : {});
        const [xx, xy] = R.xlabelAt(), [yx, yy] = R.ylabelAt();
        math.set('x', xx, xy, 'y = a\\,x'); math.set('y', yx, yy, 'p_{aX}(y)', { rotate: -90 });
        if (moved) drawPX(R, v, { faint: true });
        drawPX(R, y);
        if (!v.disc) R.hline(1, 'hline').setAttribute('opacity', '.5');
        // the uniform with the same entropy as aX
        const b = boxOf(y);
        R.rect(b.cx - b.w / 2, 0, b.cx + b.w / 2, b.ht, 'eqbox');
        math.set('box', R.X(b.cx), R.Y(Math.min(b.ht, R.y1)) - 14,
            v.disc ? `2^{H} = ${texNum(b.w / a, 2)}\\ \\text{outcomes}` : `2^{h} = ${texNum(b.w, 2)}\\ \\text{wide}`, { cls: 'ex-ml-note' });
        // readout
        const h0 = boxOf(v).H;
        math.set('readout', layoutW / 2, HP + 30, v.disc
            ? `H(aX) = H(X) = ${val(b.H)}\\text{ bits}`
            : `h(aX) = h(X) + \\log a = ${val(h0)} ${s < 0 ? '-' : '+'} ${texNum(Math.abs(s))} = ${val(b.H)}\\text{ bits}`,
            { cls: 'ex-ml-formula' });
        math.end();
    }

    slider.addEventListener('input', draw);
    shuffle?.addEventListener('click', () => { perm = randomPerm(model.view().p.length); draw(); });
    fitWidth(svg.parentElement, layout);
    // a = 1 and the atoms in their own order, as the page loads (the page redraws after a reset)
    const reset = () => { slider.value = slider.defaultValue; perm = null; };
    return { draw, reset };
}
