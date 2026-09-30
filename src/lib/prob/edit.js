// ================================================================
//  Drag handles for editing p_X, in any panel that draws it.
//    discrete:  each lollipop head; along the density axis = its mass
//               (the others rescale, floor 0.01).
//    mixture:   one handle per component on the curve at its mean;
//               along x = mean, along the density axis = the density
//               there (so the sd).
//    steps:     a dot at each step point (along x; chunks keep their
//               mass) and each chunk's top edge (along the density axis;
//               the other masses rescale). Uniform = one chunk.
//  The panel is described by an adapter over a Region, upright (x
//  across) or rotated (x up), so one editor works in every panel.
//  Drags map through the panel's window as it was at grab time, so the
//  response stays linear while the shared window grows.
// ================================================================

import { clamp, gPdf, setPeak, setBreak, setLevel } from './dist.js';
import { el } from './region.js';

const HIT_R = 14;   // hit radius for handles, in viewBox units
const GRIP_PAD = 9; // slop past a chunk's top edge, in viewBox units
const MIN_D = 1e-3; // lowest draggable density

// Adapter for a Region that plots (x, density): upright has x on its
// horizontal axis, rotated has x on its vertical axis.
export function regionAdapter(R, rotated) {
    const frameOf = () => ({ x0: R.x0, x1: R.x1, y0: R.y0, y1: R.y1, pl: R.pl, pr: R.pr, pt: R.pt, pb: R.pb });
    const hx = (f, px) => f.x0 + (px - f.pl) / (f.pr - f.pl) * (f.x1 - f.x0);
    const vy = (f, py) => f.y0 + (f.pb - py) / (f.pb - f.pt) * (f.y1 - f.y0);
    return {
        rotated,
        toScreen: (x, d) => (rotated ? [R.X(d), R.Y(x)] : [R.X(x), R.Y(d)]),
        // pixel -> (x, density) through a frame (the current one, or one taken at grab time)
        frame: frameOf,
        fromScreen: (f, px, py) => (rotated ? [vy(f, py), hx(f, px)] : [hx(f, px), vy(f, py)]),
        // the x-range of a frame, whichever axis x is on
        xSpan: f => (rotated ? [f.y0, f.y1] : [f.x0, f.x1]),
        dTop: () => (rotated ? R.x1 : R.y1),
        // screen coordinate that grows with density, for "past the top" tests
        densPx: pt => (rotated ? pt.x : -pt.y),
        contains: (pt, pad) => R.contains(pt, pad),
    };
}

const mixPdf = (comps, x) => comps.reduce((t, c) => t + c.w * gPdf(x, c.m, c.s), 0);

// opts: { model, adapter, visible(i) — which discrete atoms are drawn (default all), onHold(on) }
export function createEditor({ model, adapter, visible = () => true, onHold }) {
    let drag = null; // { h, dx, dy, f }

    // Handle positions for the current distribution, in (x, density).
    function handles() {
        const v = model.view(), top = adapter.dTop();
        if (v.disc) return v.p.map((d, i) => ({ type: 'atom', i, x: i + 1, d: Math.min(d, top) })).filter(h => visible(h.i));
        const s = v.shape;
        if (s.kind === 'steps') return s.ts.map((t, j) => ({ type: 'break', j, x: t, d: 0 }));
        return s.comps.map((c, i) => ({ type: 'peak', i, x: c.m, d: Math.min(mixPdf(s.comps, c.m), top) }));
    }

    function hit(pt) {
        if (!adapter.contains(pt, 8)) return null;
        let best = null, bestD = HIT_R;
        for (const h of handles()) {
            const [px, py] = adapter.toScreen(h.x, h.d);
            const dd = Math.hypot(pt.x - px, pt.y - py);
            if (dd < bestD) { bestD = dd; best = h; }
        }
        if (best) return best;
        // a step chunk's top edge (not the column beneath it, which is for moving x)
        const v = model.view();
        if (v.disc || v.shape.kind !== 'steps' || v.shape.ms.length < 2) return null;
        const s = v.shape, [x, d] = adapter.fromScreen(adapter.frame(), pt.x, pt.y);
        const i = s.ts.findIndex((t, k) => k < s.ms.length && x >= t && x <= s.ts[k + 1]);
        if (i === -1 || d < 0) return null;
        const h = Math.min(s.ms[i] / (s.ts[i + 1] - s.ts[i]), adapter.dTop());
        const [tx, ty] = adapter.toScreen(x, h);
        if (Math.abs(adapter.densPx(pt) - adapter.densPx({ x: tx, y: ty })) > GRIP_PAD) return null;
        return { type: 'level', i, x, d: h };
    }

    function cursorFor(h) {
        if (!h) return '';
        if (h.type === 'peak') return drag ? 'grabbing' : 'grab';
        const alongX = h.type === 'break';
        return alongX !== adapter.rotated ? 'ew-resize' : 'ns-resize';
    }

    function begin(h, pt) {
        const [px, py] = adapter.toScreen(h.x, h.d);
        // a chunk's height follows the cursor itself; other handles keep their grab offset
        const off = h.type === 'level' ? { dx: 0, dy: 0 } : { dx: pt.x - px, dy: pt.y - py };
        drag = { h, ...off, f: adapter.frame() };
        if (!model.view().disc) { model.hold(true); onHold?.(true); }
        if (h.type === 'level') move(pt);
    }

    function move(pt) {
        if (!drag) return;
        const h = drag.h;
        const [x, d] = adapter.fromScreen(drag.f, pt.x - drag.dx, pt.y - drag.dy);
        if (h.type === 'atom') { model.editPmf(h.i, clamp(d, 0, 1)); return; }
        const s = model.view().shape, [lo, hi] = adapter.xSpan(drag.f), span = hi - lo;
        const xc = clamp(x, lo - span, hi + span), dc = Math.max(d, MIN_D);
        if (h.type === 'break') model.setShape(setBreak(s, h.j, xc));
        else if (h.type === 'level') model.setShape(setLevel(s, h.i, dc));
        else model.setShape({ kind: 'mix', comps: setPeak(s.comps, h.i, xc, dc) });
    }

    function end() {
        if (!drag) return;
        const wasCont = !model.view().disc;
        drag = null;
        if (wasCont) { model.hold(false); onHold?.(false); }
    }

    // Draw the handles and grips into a group (after the figure has drawn p_X).
    function draw(g) {
        const v = model.view();
        const active = h => drag && drag.h.type === h.type && drag.h.i === h.i && drag.h.j === h.j;
        if (!v.disc && v.shape.kind === 'steps' && v.shape.ms.length > 1) {
            const s = v.shape, top = adapter.dTop();
            s.ms.forEach((m, i) => {
                const ht = Math.min(m / (s.ts[i + 1] - s.ts[i]), top);
                const [ax, ay] = adapter.toScreen(s.ts[i], ht), [bx, by] = adapter.toScreen(s.ts[i + 1], ht);
                el('line', { x1: ax, y1: ay, x2: bx, y2: by, class: 'grip-hit' }, g);
                el('line', { x1: ax, y1: ay, x2: bx, y2: by, class: 'grip' + (active({ type: 'level', i }) ? ' active' : '') }, g);
            });
        }
        if (v.disc) {
            // the lollipop heads are the handles; give each a larger invisible touch target
            for (const h of handles()) { const [px, py] = adapter.toScreen(h.x, h.d); el('circle', { cx: px, cy: py, r: HIT_R, class: 'hit' }, g); }
            return;
        }
        for (const h of handles()) {
            const [px, py] = adapter.toScreen(h.x, h.d);
            const cls = 'handle' + (h.type === 'break' ? ' handle-break' : '') + (active(h) ? ' active' : '');
            el('circle', { cx: px, cy: py, r: h.type === 'break' ? 5.5 : 7, class: cls }, g);
        }
    }

    return { hit, begin, move, end, draw, cursorFor, get dragging() { return drag !== null; } };
}
