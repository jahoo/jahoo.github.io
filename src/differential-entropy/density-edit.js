// ================================================================
//  Differential entropy — density-edit.js
//  Drag handles for an editable density drawn in a Plot.
//    mixture:  one handle per component, on the curve at its mean;
//              horizontal = mean, vertical = density height there.
//    uniform:  a handle on each top corner; horizontal = that edge.
//  While a drag is live the owning figure should hold its data window
//  fixed (check `editor.dragging`), growing it only if the shape presses
//  against an edge. Cursor motion maps to data through the window as it
//  was when the handle was grabbed, extrapolated past its edges, so the
//  response stays linear even if the display window grows mid-drag.
// ================================================================

import { clamp, setPeak } from './dist.js';
import { el } from './svgplot.js';

const HIT_R = 16;          // hit radius, in viewBox units
const MIN_WIDTH = 2 ** -6; // narrowest uniform
const MIN_Y = 1e-3;        // lowest draggable peak height

// opts: { getShape(), setShape(shape), onEnd() }
export function createDensityEditor(P, opts) {
    let handles = [];   // [{ type: 'peak', i } | { type: 'edge', side }, with x, y in data coords]
    let drag = null;    // { h, dx, dy, f }: grabbed handle, cursor offset from it (px), frame at grab

    const editor = {
        get dragging() { return drag !== null; },

        // Draw the handles for distribution d (the current shape's dist).
        draw(d) {
            const shape = opts.getShape();
            handles = [];
            if (shape.kind === 'unif') {
                const ht = Math.min(1 / (shape.b - shape.a), P.y1);
                handles.push({ type: 'edge', side: 'a', x: shape.a, y: ht });
                handles.push({ type: 'edge', side: 'b', x: shape.b, y: ht });
            } else {
                shape.comps.forEach((c, i) => handles.push({ type: 'peak', i, x: c.m, y: Math.min(d.pdf(c.m), P.y1) }));
            }
            for (const h of handles) {
                const cls = 'handle grab' + (drag && drag.h.type === h.type && drag.h.i === h.i && drag.h.side === h.side ? ' active' : '');
                el('circle', { cx: P.X(h.x), cy: P.Y(h.y), r: 7, class: cls }, P.front);
            }
        },
    };

    function hit(pt) {
        let best = null, bestD = HIT_R;
        for (const h of handles) {
            const dd = Math.hypot(pt.x - P.X(h.x), pt.y - P.Y(h.y));
            if (dd < bestD) { bestD = dd; best = h; }
        }
        return best;
    }

    // Pixel -> data through the frame captured at grab time.
    const fx = (f, px) => f.x0 + (px - f.pl) / (f.pr - f.pl) * (f.x1 - f.x0);
    const fy = (f, py) => f.y0 + (f.pb - py) / (f.pb - f.pt) * (f.y1 - f.y0);

    function move(pt) {
        const f = drag.f, span = f.x1 - f.x0;
        const x = clamp(fx(f, pt.x - drag.dx), f.x0 - span, f.x1 + span);
        const shape = opts.getShape();
        if (drag.h.type === 'edge') {
            const a = drag.h.side === 'a' ? Math.min(x, shape.b - MIN_WIDTH) : shape.a;
            const b = drag.h.side === 'b' ? Math.max(x, shape.a + MIN_WIDTH) : shape.b;
            opts.setShape({ kind: 'unif', a, b });
        } else {
            const y = Math.max(fy(f, pt.y - drag.dy), MIN_Y);
            opts.setShape({ kind: 'mix', comps: setPeak(shape.comps, drag.h.i, x, y) });
        }
    }

    const svg = P.svg;
    svg.addEventListener('pointerdown', e => {
        const pt = P.svgPoint(e);
        const h = hit(pt);
        if (!h) return;
        const { x0, x1, y0, y1, pl, pr, pt: top, pb } = P;
        drag = { h, dx: pt.x - P.X(h.x), dy: pt.y - P.Y(h.y), f: { x0, x1, y0, y1, pl, pr, pt: top, pb } };
        svg.setPointerCapture(e.pointerId);
        svg.style.cursor = 'grabbing';
        e.preventDefault();
    });
    svg.addEventListener('pointermove', e => {
        const pt = P.svgPoint(e);
        if (drag) { move(pt); return; }
        svg.style.cursor = hit(pt) ? 'grab' : '';
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
