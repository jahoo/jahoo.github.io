// ================================================================
//  Differential entropy — density-edit.js
//  Drag handles for an editable density drawn in a Plot.
//    mixture:  one handle per component, on the curve at its mean;
//              horizontal = mean, vertical = density height there.
//    steps:    a dot on the axis at each step point; horizontal = that
//              point (chunks keep their mass). Each chunk's top edge is
//              a grip; vertical = its height (the other chunks' masses
//              rescale). The uniform is the one-chunk case: edges only.
//  While a drag is live the owning figure should hold its data window
//  fixed (check `editor.dragging`), growing it only if the shape presses
//  against an edge. Cursor motion maps to data through the window as it
//  was when the handle was grabbed, extrapolated past its edges, so the
//  response stays linear even if the display window grows mid-drag.
// ================================================================

import { clamp, setPeak, setBreak, setLevel } from '../lib/prob/dist.js';
import { el } from './svgplot.js';

const HIT_R = 16;   // hit radius for dots, in viewBox units
const GRIP_PAD = 9; // vertical slop around a chunk's top edge, in viewBox units
const MIN_Y = 1e-3; // lowest draggable height

const CURSOR = { peak: 'grab', break: 'ew-resize', level: 'ns-resize' };

// opts: { getShape(), setShape(shape), onEnd() }
export function createDensityEditor(P, opts) {
    let dots = [];      // [{ type: 'peak', i } | { type: 'break', j }, with x, y in data coords]
    let drag = null;    // { h, dx, dy, f }: grabbed handle, cursor offset from it (px), frame at grab

    const same = (a, b) => a && b && a.type === b.type && a.i === b.i && a.j === b.j;

    const editor = {
        get dragging() { return drag !== null; },

        // Draw the handles for distribution d (the current shape's dist).
        draw(d) {
            const shape = opts.getShape();
            dots = [];
            if (shape.kind === 'steps') {
                if (shape.ms.length > 1) {
                    d.hs.forEach((ht, i) => {
                        const y = Math.min(ht, P.y1);
                        const cls = 'grip' + (same(drag?.h, { type: 'level', i }) ? ' active' : '');
                        P.line(shape.ts[i], y, shape.ts[i + 1], y, cls, P.front);
                    });
                }
                shape.ts.forEach((t, j) => dots.push({ type: 'break', j, x: t, y: 0 }));
            } else {
                shape.comps.forEach((c, i) => dots.push({ type: 'peak', i, x: c.m, y: Math.min(d.pdf(c.m), P.y1) }));
            }
            for (const h of dots) {
                const cls = 'handle ' + (h.type === 'break' ? 'handle-break' : 'grab') + (same(drag?.h, h) ? ' active' : '');
                el('circle', { cx: P.X(h.x), cy: P.Y(h.y), r: h.type === 'break' ? 5.5 : 7, class: cls }, P.front);
            }
        },
    };

    // Dots first; otherwise, for a step density, the chunk whose top edge
    // (or the column beneath it) is under the pointer.
    function hit(pt) {
        let best = null, bestD = HIT_R;
        for (const h of dots) {
            const dd = Math.hypot(pt.x - P.X(h.x), pt.y - P.Y(h.y));
            if (dd < bestD) { bestD = dd; best = h; }
        }
        if (best) return best;
        const shape = opts.getShape();
        if (shape.kind !== 'steps' || shape.ms.length < 2) return null;
        const x = P.invX(pt.x);
        const i = shape.ts.findIndex((t, k) => k < shape.ms.length && x >= t && x <= shape.ts[k + 1]);
        if (i === -1) return null;
        const top = P.Y(Math.min(shape.ms[i] / (shape.ts[i + 1] - shape.ts[i]), P.y1));
        if (pt.y < top - GRIP_PAD || pt.y > P.pb) return null;
        return { type: 'level', i, x, y: P.invY(top) };
    }

    // Pixel -> data through the frame captured at grab time.
    const fx = (f, px) => f.x0 + (px - f.pl) / (f.pr - f.pl) * (f.x1 - f.x0);
    const fy = (f, py) => f.y0 + (f.pb - py) / (f.pb - f.pt) * (f.y1 - f.y0);

    function move(pt) {
        const f = drag.f, span = f.x1 - f.x0, shape = opts.getShape();
        const x = clamp(fx(f, pt.x - drag.dx), f.x0 - span, f.x1 + span);
        const y = Math.max(fy(f, pt.y - drag.dy), MIN_Y);
        const h = drag.h;
        if (h.type === 'break') opts.setShape(setBreak(shape, h.j, x));
        else if (h.type === 'level') opts.setShape(setLevel(shape, h.i, y));
        else opts.setShape({ kind: 'mix', comps: setPeak(shape.comps, h.i, x, y) });
    }

    const svg = P.svg;
    svg.addEventListener('pointerdown', e => {
        const pt = P.svgPoint(e);
        const h = hit(pt);
        if (!h) return;
        const { x0, x1, y0, y1, pl, pr, pt: top, pb } = P;
        // a chunk's height follows the cursor itself (as the pmf bars do);
        // dots keep the offset they were grabbed at
        const off = h.type === 'level' ? { dx: 0, dy: 0 } : { dx: pt.x - P.X(h.x), dy: pt.y - P.Y(h.y) };
        drag = { h, ...off, f: { x0, x1, y0, y1, pl, pr, pt: top, pb } };
        svg.setPointerCapture(e.pointerId);
        if (h.type === 'peak') svg.style.cursor = 'grabbing';
        e.preventDefault();
        if (h.type === 'level') move(pt); // a click in a column sets that height, like the pmf bars
    });
    svg.addEventListener('pointermove', e => {
        const pt = P.svgPoint(e);
        if (drag) { move(pt); return; }
        const h = hit(pt);
        svg.style.cursor = h ? CURSOR[h.type] : '';
    });
    const end = () => {
        if (!drag) return;
        drag = null;
        svg.style.cursor = '';
        opts.onEnd?.();
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    return editor;
}
