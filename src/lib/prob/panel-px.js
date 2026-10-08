// ================================================================
//  Probability figures — panel-px.js
//  p_X in an upright region (x across, probability or density up),
//  for figures that show the distribution without the area figure's
//  sweep: stems and pins for a pmf (at 1..n, or at the positions the
//  view carries), the filled curve for a density. `faint` draws it as
//  a ghost, the way the area figure draws what is not yet integrated.
// ================================================================

import { el } from './region.js';
import { positionsOf } from './width.js';

// The window a view wants: a pmf on its atoms (a little past the end ones), a density on
// the model's window.
export function windowPX(v) {
    if (!v.disc) return { x0: v.xRange[0], x1: v.xRange[1], y1: v.win.y1 };
    const xs = positionsOf(v), gap = xs.length > 1 ? xs[1] - xs[0] : 1;
    return { x0: xs[0] - 0.6 * gap, x1: xs[xs.length - 1] + 0.6 * gap, y1: 1.05 };
}

// Draw p_X into R, whose domain is set.
export function drawPX(R, v, { faint = false } = {}) {
    if (v.disc) {
        const xs = positionsOf(v), c = faint ? 'todo' : 'done';
        // the pmf being edited, when the view shows it tempered
        if (!faint && v.base) v.base.forEach((q, i) => {
            if (q <= 0) return;
            el('line', { x1: R.X(xs[i]), x2: R.X(xs[i]), y1: R.Y(0), y2: R.Y(q), class: 'stem-base' }, R.data);
            el('circle', { cx: R.X(xs[i]), cy: R.Y(q), r: 4.5, class: 'pin-base' }, R.data);
        });
        v.p.forEach((q, i) => {
            const x = R.X(xs[i]);
            if (q <= 0) { if (!faint) el('circle', { cx: x, cy: R.Y(0), r: 4, class: 'pin-null' }, R.data); return; }
            el('line', { x1: x, x2: x, y1: R.Y(0), y2: R.Y(q), class: 'stem-' + c }, R.data);
            el('circle', { cx: x, cy: R.Y(q), r: 4.5, class: 'pin-' + c }, R.data);
        });
        return;
    }
    const s = v.shape, pts = v.S.xs.map((x, i) => [x, v.S.fs[i]]);
    const edges = s.kind === 'steps' ? [[s.ts[0], 0], ...pts, [s.ts[s.ts.length - 1], 0]] : pts;
    if (faint) { R.area(edges, 'fm').setAttribute('opacity', '.35'); R.path(edges, 'curve later'); }
    else { R.area(edges, 'fm'); R.path(edges, 'curve'); }
}
