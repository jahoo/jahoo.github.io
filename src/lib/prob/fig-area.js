// ================================================================
//  Probability figures — fig-area.js
//  E[g(X)] as the area under g ∘ F_X⁻¹ over [0, 1]. Panels, in one SVG:
//    top right:    p_X over x (editable)
//    bottom left:  g over x (the height marginal)
//    middle right: the area plot over u
//    between:      the map x ↦ F_X(x), from x down to [0, 1] in u
//    bottom right: the running integral over u
//    bottom left:  the integral so far, and E[g(X)] once u = 1
//  Dragging: the two x-panels set x, the two u-panels set u, the map
//  moves both; a p_X handle takes precedence over a position drag.
//  In the discrete case g's lollipops can be dragged too, which makes
//  g custom.
//  With sweep: false the figure is pinned at u = 1: no cursors, no
//  crosshair, no running integral, and only p_X can be dragged. When
//  the model is tempered (view().base), the base pmf is drawn faint
//  behind the tempered one.
// ================================================================

import { clamp, discCdfAt, atX, atU, lerp } from './dist.js';
import { Region, el, svgContext, svgPoint } from './region.js';
import { createMathLayer, texNum } from './mathlabels.js';
import { fitWidth } from './fit.js';
import { createEditor, regionAdapter } from './edit.js';
import { G, meaning } from './frame.js';
import { NOTES } from './area-notes.js';

// Layout in viewBox units, for the full width of 1000: a left column of 400 and a right
// column of 572. A narrower layout (see fit.js) narrows both columns; once the left one
// is too narrow for the integral and E[g(X)], the running integral is dropped and
// they take its row, across the full width.
const GAP = 28, WL0 = 400, WL_FORMULA = 340, N_MAP = 64;
const HT = 200, HB = 150, HA = 250, HI = 200, H0 = HT + HB + HA + HI + 6;
const mA = { l: 58, r: 16, t: 50, b: 30 };

// an atom is integrated (up to and including the one u is in) or not yet
const cls2 = (i, k) => (i <= k ? 'done' : 'todo');

// g's extent over the support (clipped for −log p on the tails), always including 0:
// the vertical extent of the area under g ∘ F_X⁻¹.
function gExtent(fr, g) {
    let lo = Infinity, hi = -Infinity;
    const vals = fr.disc ? fr.gs.filter(Number.isFinite) : fr.gs.filter((y, i) => fr.S.Fs[i] > 1e-4 && fr.S.Fs[i] < 1 - 1e-4);
    for (const v of vals) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const c = G[g].clip;
    if (c) { lo = Math.max(lo, c[0]); hi = Math.min(hi, c[1]); }
    return [Math.min(lo, 0), Math.max(hi, 0)];
}

// Vertical range for g: its extent, with a little room.
function gRange(fr, g) {
    let [lo, hi] = gExtent(fr, g);
    if (hi - lo < 1e-9) hi = lo + 1; // a g that is 0 wherever there is mass still gets a unit of room
    const pad = 0.08 * (hi - lo);
    return [lo < 0 ? lo - pad : 0, hi + pad];
}

// opts: sweep — the position can move (cursors, crosshair, the running integral, position
//       drags); false pins the figure at u = 1, where only p_X is editable.
//       notes — which post's wording the figure carries (see area-notes.js).
export function createAreaFigure(svg, { model, pos, ui, redraw, stopPlay, customG }, { sweep = true, notes = 'expectation' } = {}) {
    const T = NOTES[notes];
    const ctx = svgContext(svg, 1000, H0);
    // column positions are set by layout()
    const RT = new Region(ctx, { ox: 0, oy: 0, w: 0, h: HT, m: { l: 58, r: 16, t: 26, b: 26 } });
    const RA = new Region(ctx, { ox: 0, oy: HT + HB, w: 0, h: HA, m: mA });
    const RG = new Region(ctx, { ox: 0, oy: HT + HB, w: 0, h: HA, m: mA });
    const RI = new Region(ctx, { ox: 0, oy: HT + HB + HA, w: 0, h: HI, m: { l: 58, r: 16, t: 26, b: 42 } });
    const bridge = el('g', null, ctx.root), handles = el('g', null, ctx.root), over = el('g', null, ctx.root);
    const math = createMathLayer(svg.parentElement, 1000, H0);
    let noRI = false; // narrow: no running integral, the integral and E[g(X)] in its row
    let wideBottom = false; // this frame: the bottom row is the formula's alone (narrow, or u = 1)
    let colL = WL0, layoutW = 1000; // the left column's width, and the layout's
    function layout(W) {
        const WL = Math.round((W - GAP) * WL0 / (1000 - GAP)), WR = W - WL - GAP;
        colL = WL; layoutW = W;
        for (const R of [RT, RA, RI]) Object.assign(R.o, { ox: WL + GAP, w: WR });
        RG.o.w = WL;
        noRI = WL < WL_FORMULA;
        svg.setAttribute('viewBox', `0 0 ${W} ${H0}`);
        math.resize(W, H0);
        if (lastFr) draw(lastFr);
    }
    const yLabel = (key, R, tex) => { const [x, y] = R.ylabelAt(); math.set(key, x, y, tex, { rotate: -90 }); };
    const xLabel = (key, R, tex) => { const [x, y] = R.xlabelAt(); math.set(key, x, y, tex); };
    let lastK = -1; // atoms drawn in the p_X panel: all, or with ghosts off only those reached
    const editor = createEditor({ model, adapter: regionAdapter(RT, false), visible: i => ui.ghost || i <= lastK });
    const zones = { yTop: 0, yAx: 0 };
    let gDrag = null; // a g lollipop being dragged: { i, yr }, g's range held while it lasts
    let lastFr = null;

    function draw(fr) {
        lastFr = fr;
        // defined: E[g(X)] exists (the skewness of a constant X does not)
        const defined = Number.isFinite(fr.total);
        const v = model.view(), done1 = fr.u >= 1 - 1e-9, yr = gDrag ? gDrag.yr : gRange(fr, ui.g);
        lastK = fr.disc ? fr.k : -1;
        math.begin();
        const [x0, x1] = v.xRange;

        // ---- top right: p_X over x ----
        if (fr.disc) {
            RT.domain(0.4, fr.n + 0.6, 0, 1.05);
            RT.axes({ xticks: fr.p.map((_, i) => i + 1), yticks: [0, .5, 1] });
            // the pmf being edited, when the figure shows it tempered
            if (fr.base) fr.base.forEach((q, i) => {
                if (q <= 0) return;
                el('line', { x1: RT.X(i + 1), x2: RT.X(i + 1), y1: RT.Y(0), y2: RT.Y(q), class: 'stem-base' }, RT.data);
                el('circle', { cx: RT.X(i + 1), cy: RT.Y(q), r: 4.5, class: 'pin-base' }, RT.data);
            });
            fr.p.forEach((q, i) => {
                // an atom without mass: a hollow pin on the axis, still draggable
                if (q <= 0) { el('circle', { cx: RT.X(i + 1), cy: RT.Y(0), r: 4, class: 'pin-null' }, RT.data); return; }
                const c = cls2(i, fr.k); if (c === 'todo' && !ui.ghost) return;
                el('line', { x1: RT.X(i + 1), x2: RT.X(i + 1), y1: RT.Y(0), y2: RT.Y(q), class: 'stem-' + c }, RT.data);
                el('circle', { cx: RT.X(i + 1), cy: RT.Y(q), r: 4.5, class: 'pin-' + c }, RT.data);
            });
            if (sweep) RT.vline(fr.x, 'cursor');
        } else {
            RT.domain(x0, x1, 0, v.win.y1);
            RT.axes({});
            const pts = fr.S.xs.map((x, i) => [x, fr.S.fs[i]]).filter(q => q[0] >= x0 - .05 && q[0] <= x1 + .05);
            const s = v.shape, edges = s.kind === 'steps' ? [[s.ts[0], 0], ...pts, [s.ts[s.ts.length - 1], 0]] : pts;
            if (ui.ghost) RT.area(edges, 'fm').setAttribute('opacity', '.35');
            const done = edges.filter(q => q[0] <= fr.x);
            if (done.length) RT.area(Number.isFinite(fr.x) ? [...done, [fr.x, fr.fNow]] : done, 'fm');
            RT.path(edges, 'curve');
            RT.hline(1, 'hline').setAttribute('opacity', '.5');
            if (sweep) {
                RT.vline(fr.x, 'cursor');
                if (RT.inX(fr.x)) el('circle', { cx: RT.X(fr.x), cy: RT.Y(fr.fNow), r: 4.5, class: 'dot' }, RT.front);
            }
        }
        yLabel('rt-y', RT, 'p_X(x)');
        handles.replaceChildren();
        editor.draw(handles);

        // ---- bottom left: g over x ----
        const gtex = T.gLabel(ui.g === 'custom' ? null : G[ui.g].tex);
        if (fr.disc) {
            RG.domain(0.4, fr.n + 0.6, yr[0], yr[1]);
            RG.axes({ xticks: fr.p.map((_, i) => i + 1) });
            fr.gs.forEach((y, i) => {
                if (!Number.isFinite(y)) return; // off the support: g has no value there
                const c = cls2(i, fr.k); if (c === 'todo' && !ui.ghost) return;
                el('line', { x1: RG.X(i + 1), x2: RG.X(i + 1), y1: RG.Y(0), y2: RG.Y(y), class: 'stem-' + c }, RG.data);
                el('circle', { cx: RG.X(i + 1), cy: RG.Y(y), r: 4, class: 'pin-' + c }, RG.data);
                el('circle', { cx: RG.X(i + 1), cy: RG.Y(y), r: 13, class: 'hit' }, RG.data);
            });
            if (sweep) RG.vline(fr.x, 'cursor');
        } else {
            RG.domain(x0, x1, yr[0], yr[1]);
            RG.axes({});
            xLabel('rg-x', RG, 'x');
            const pts = [];
            fr.S.xs.forEach((x, i) => { if (x >= x0 - .05 && x <= x1 + .05) pts.push([x, fr.gs[i]]); });
            RG.area(pts, 'fn', RG.gBelow());
            RG.path(pts.filter(q => q[0] > fr.x), 'curve later');
            RG.path(pts.filter(q => q[0] <= fr.x).concat(Number.isFinite(fr.x) ? [[fr.x, fr.gNow]] : []), 'curve');
            if (sweep) RG.vline(fr.x, 'cursor');
        }

        yLabel('rg-y', RG, gtex);

        // ---- middle right: the area plot over u ----
        RA.domain(0, 1, yr[0], yr[1]);
        RA.axes({ xticks: [0, .25, .5, .75, 1] });
        yLabel('ra-y', RA, T.aLabel(G[ui.g].tex));
        if (fr.disc) {
            fr.p.forEach((q, i) => {
                if (q <= 0 || !Number.isFinite(fr.gs[i])) return; // an empty block, or no value of g
                // the block u is in fills up to u
                const cls = fr.gs[i] < 0 ? 'done neg' : 'done', end = i === fr.k ? fr.u : fr.F[i + 1];
                if (ui.ghost && i >= fr.k) RA.rect(fr.F[i], 0, fr.F[i + 1], fr.gs[i], 'todo');
                if (i <= fr.k) RA.rect(fr.F[i], 0, end, fr.gs[i], cls);
            });
        } else {
            const all = fr.S.Fs.map((u, i) => [u, fr.gs[i]]);
            if (ui.ghost) RA.path(all, 'curve later');
            const done = all.filter(q => q[0] <= fr.u).concat([[fr.u, fr.gNow]]);
            RA.area(done, 'fm', RA.gAbove()); RA.area(done, 'fn', RA.gBelow());
            RA.path(done, 'curve');
        }
        if (sweep && fr.u > 0) RA.vline(fr.u, 'cursor');
        // at u = 1: E[g(X)] as the average height of the whole area, which has width 1
        if (done1 && defined && RA.inY(fr.total)) {
            RA.hline(fr.total, 'hline avg');
            math.set('avg', RA.pl + 8, RA.Y(fr.total) - 13, T.avg(fr.disc), { anchor: 'start', cls: 'ex-ml-avg' });
        }
        // the area plot's frame, around its axis labels and ticks, behind everything in the
        // panel; at u = 1 it stands out, with a brighter ground, as the result's box does
        const fin = done1 && defined, fl = RA.o.ox + 2;
        RA.back.prepend(el('rect', { x: fl, y: RA.pt - 10, width: RA.pr + 10 - fl, height: RA.pb - RA.pt + 36, rx: 4, class: 'result-box' + (fin ? ' final' : '') }));

        // ---- bottom right: the running integral (not on a narrow layout, and not at u = 1,
        // when the result takes the whole row) ----
        wideBottom = noRI || done1;
        if (wideBottom) RI.clear();
        else {
            const run = (fr.disc ? fr.cum : fr.I).filter(Number.isFinite);
            let ilo = 0, ihi = 0;
            run.forEach(c => { ilo = Math.min(ilo, c); ihi = Math.max(ihi, c); });
            const ipad = 0.1 * (ihi - ilo || 1);
            RI.domain(0, 1, ilo < 0 ? ilo - ipad : 0, ihi + ipad);
            RI.axes({ xticks: [0, .25, .5, .75, 1] });
            yLabel('ri-y', RI, '\\int_0^u g \\circ F_X^{-1}');
            xLabel('ri-x', RI, 'u');
            if (fr.u > 0) RI.vline(fr.u, 'cursor');
            if (defined) {
                const ipts = fr.disc ? fr.F.map((u, i) => [u, fr.cum[i]]) : fr.S.Fs.map((u, i) => [u, fr.I[i]]);
                if (ui.ghost) RI.path(ipts, 'curve later');
                RI.path(ipts.filter(q => q[0] <= fr.u + 1e-12).concat([[fr.u, fr.area]]), 'curve');
                if (done1) RI.hline(fr.total, 'hline');
                if (fr.u > 0 || !fr.disc) el('circle', { cx: RI.X(fr.u), cy: RI.Y(fr.area), r: 4.5, class: 'dot' }, RI.front);
            }
        }

        // ---- the map between x and [0, 1] in u, read both ways: F_X down, F_X⁻¹ up. It is
        // drawn from u (F_X⁻¹'s direction, the one the area uses), so all of [0, 1] has lines ----
        bridge.replaceChildren();
        const yTop = RT.pb + 20, yAx = RA.pt - 34, U = u => RA.X(u);
        zones.yTop = yTop; zones.yAx = yAx;
        // rotated like the other axis labels, so it reads upward: u, then x = F_X⁻¹(u) above and
        // F_X back down below (on screen: F_X⁻¹ on the left, going up; F_X on the right, going down)
        math.set('map', RT.o.ox + 12, (yTop + yAx) / 2,
            'u \\;\\substack{\\xrightarrow{\\;\\textstyle F_X^{-1}\\;} \\\\ \\xleftarrow[\\;\\textstyle F_X\\;]{}}\\; x', { rotate: -90 });
        if (fr.disc) {
            // each outcome x and its block (P(X < x), P(X ≤ x)] of u, of width p: a triangle between
            // the point and the interval (the current one up to u). An outcome without mass has an
            // empty block, so no u maps to it and nothing is drawn
            const tri = (top, a, b, cls) => el('path', { d: `M${top} ${yTop}L${a} ${yAx}L${b} ${yAx}Z`, class: cls }, bridge);
            fr.p.forEach((q, i) => {
                const a = U(fr.F[i]), b = U(fr.F[i + 1]), top = RT.X(i + 1), end = i === fr.k ? U(fr.u) : b;
                if (q <= 0) return;
                if (i >= fr.k && ui.ghost) tri(top, a, b, 'tri-todo');
                if (i <= fr.k) tri(top, a, end, 'tri-done');
            });
            el('line', { x1: U(0), x2: U(1), y1: yAx, y2: yAx, class: 'wax' }, bridge);
            el('line', { x1: U(0), x2: U(fr.u), y1: yAx, y2: yAx, class: 'wax done' }, bridge);
            // the current pair: x = F_X⁻¹(u) on top, u below (the right side of its triangle once u = F_X(x))
            if (sweep && fr.k >= 0) el('line', { x1: RT.X(fr.k + 1), y1: yTop, x2: U(fr.u), y2: yAx, class: 'br-cur' }, bridge);
        } else {
            el('line', { x1: U(0), x2: U(1), y1: yAx, y2: yAx, class: 'wax' }, bridge);
            el('line', { x1: U(0), x2: U(fr.u), y1: yAx, y2: yAx, class: 'wax done' }, bridge);
            // evenly spaced u, each carried up to x = F_X⁻¹(u): they bunch where p_X is high
            for (let j = 0; j < N_MAP; j++) {
                const uj = (j + 0.5) / N_MAP, xj = lerp(fr.S.xs, atU(fr.S, uj)), done = uj <= fr.u;
                if (done || ui.ghost) el('line', { x1: RT.X(xj), y1: yTop, x2: U(uj), y2: yAx, class: done ? 'br-done' : 'br-todo' }, bridge);
            }
            if (sweep && Number.isFinite(fr.x)) el('line', { x1: RT.X(fr.x), y1: yTop, x2: U(fr.u), y2: yAx, class: 'br-cur' }, bridge);
        }

        // ---- crosshair from the point in the area plot to its two marginals ----
        over.replaceChildren();
        // (not at u = 1, where the finished area and its average height stand on their own)
        const hasPoint = sweep && !done1 && (fr.disc ? fr.k >= 0 : true);
        if (hasPoint && isFinite(fr.gNow) && RA.inY(fr.gNow)) {
            const px = U(fr.u), py = RA.Y(fr.gNow);
            const gx = fr.disc ? RG.X(fr.k + 1) : RG.X(fr.x);
            el('path', { d: `M${px} ${py}L${gx} ${py}`, class: 'cross' }, over);
            el('path', { d: `M${px} ${py}L${px} ${yAx}`, class: 'cross' }, over);
            if (fr.disc || RG.inX(fr.x)) el('circle', { cx: gx, cy: py, r: 4.5, class: 'dot' }, over);
            el('circle', { cx: px, cy: py, r: 4.5, class: 'dot' }, over);
            el('circle', { cx: px, cy: yAx, r: 3.5, class: 'dot' }, over);
        }

        // ---- the integral so far, and E[g(X)] once the upper limit is 1 ----
        // magenta only if negative as shown (a tiny −1e-6 prints as 0.000)
        const val = v => {
            if (Number.isNaN(v)) return '\\text{undefined}';
            const t = texNum(v); return t.startsWith('-') ? `\\class{ex-neg}{${t}}` : t;
        };
        const upper = done1 ? '1' : `\\class{ex-now}{${texNum(fr.u)}}`;
        // what each part is, in the left column's free space (the last one above the integral)
        const note = (key, x, y, t, w, bottom) => math.set(key, x, y, t, { text: true, width: w, cls: 'ex-ml-note', bottom });
        const nw = Math.min(colL - 30, 370);
        note('n-dist', colL / 2, (RT.pt + RT.pb) / 2, T.dist, colL - 10);
        // on a narrow layout the notes run to more lines: the map's sits a little higher, and g's
        // grows upward from just above its plot
        note('n-map', colL / 2, (zones.yTop + zones.yAx) / 2 - (noRI ? 30 : 0), T.map, nw);
        note('n-g', colL / 2, RG.pt - 12, T.g, nw, true);
        // centred in the left column, or across the full width once the running integral is dropped
        const riTop = RI.o.oy + RI.o.m.t, fx = wideBottom ? layoutW / 2 : colL / 2, fy1 = riTop + 60, fy2 = riTop + 130;
        // before u = 1 the integral is the area so far, and the expectation is still to come
        // (in the result's place); at u = 1 the integral is the expectation, and the result shows
        const noteW = wideBottom ? layoutW - 32 : nw;
        const areaNote = T.area(done1, texNum(fr.u));
        math.set('n-area', fx, riTop + 2, areaNote, { text: true, width: noteW, cls: 'ex-ml-note' });
        if (!done1) math.set('n-rest', fx, fy2, T.rest, { text: true, width: noteW, cls: 'ex-ml-note' });
        math.set('integral', fx, fy1, `\\displaystyle\\int_0^{${upper}} ${T.integrand(G[ui.g].tex)} \\dee{v} \\;=\\; ${val(fr.area)}`, { cls: 'ex-ml-formula' });
        if (done1) {
            // what the expectation is, for a named g
            const mn = meaning(ui.g, fr.disc);
            const tex = T.result({ mn, val: val(fr.total), unit: defined ? G[ui.g].unit ?? '' : '', disc: fr.disc });
            math.set('expectation', fx, fy2, tex, { cls: 'ex-ml-result' + (defined ? ' ex-ml-boxed' : '') });
        }
        math.end();
    }

    // ---- dragging ----
    function zoneAt(p) {
        if (!sweep) return null; // pinned: the pointer only edits p_X
        if (RT.contains(p, 4) || RG.contains(p, 4)) return 'x';
        if (RA.contains(p, 4) || (!wideBottom && RI.contains(p, 4))) return 'u';
        if (p.y > zones.yTop - 6 && p.y < zones.yAx + 18 && p.x >= Math.min(RT.pl, RA.pl) - 4 && p.x <= Math.max(RT.pr, RA.pr) + 4) return 'map';
        return null;
    }
    const Fof = x => {
        const v = model.view();
        return v.disc ? discCdfAt(v.F, x) : lerp(v.S.Fs, atX(v.S, x));
    };
    // The map line through (x on top, F(x) on the axis) is at (1 − t)·X(x) + t·U(F(x))
    // at height fraction t, which only grows with x: find the x under the cursor.
    function dragMap(p) {
        const t = clamp((p.y - zones.yTop) / (zones.yAx - zones.yTop), 0, 1);
        let [lo, hi] = model.view().xRange;
        const at = x => (1 - t) * RT.X(x) + t * RA.X(Fof(x));
        for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (at(m) < p.x) lo = m; else hi = m; }
        pos.setX((lo + hi) / 2);
    }
    // the g lollipop under p, in the discrete case
    function gHit(p) {
        if (!sweep) return -1;
        const fr = lastFr;
        if (!fr?.disc || !RG.contains(p, 14)) return -1;
        let best = -1, bd = 13;
        fr.gs.forEach((y, i) => {
            if (!Number.isFinite(y)) return;
            const d = Math.hypot(p.x - RG.X(i + 1), p.y - RG.Y(y)); if (d < bd) { bd = d; best = i; }
        });
        return best;
    }
    // g's new value at the atom: the pointer's height, a little past the held range at most
    function dragG(p) {
        const [lo, hi] = gDrag.yr, pad = 0.15 * (hi - lo);
        ui.gc[gDrag.i] = clamp(RG.invY(p.y), lo - pad, hi + pad);
        redraw();
    }
    let zone = null, from = null, editing = false;
    function moveTo(p) {
        if (zone === 'x') pos.setX(from.invX(p.x));
        else if (zone === 'u') pos.setU(RA.invX(p.x));
        else dragMap(p);
        redraw();
    }
    svg.addEventListener('pointerdown', e => {
        const p = svgPoint(svg, e), h = editor.hit(p);
        if (h) {
            stopPlay(); editing = true; svg.setPointerCapture(e.pointerId); e.preventDefault();
            editor.begin(h, p);
            return;
        }
        const gi = gHit(p);
        if (gi >= 0) {
            stopPlay(); svg.setPointerCapture(e.pointerId); e.preventDefault();
            gDrag = { i: gi, yr: gRange(lastFr, ui.g) };
            customG(true);
            dragG(p);
            return;
        }
        const z = zoneAt(p);
        if (!z) return;
        stopPlay();
        zone = z; from = z === 'x' ? (RT.contains(p, 4) ? RT : RG) : null;
        svg.setPointerCapture(e.pointerId);
        e.preventDefault();
        moveTo(p);
    });
    svg.addEventListener('pointermove', e => {
        const p = svgPoint(svg, e);
        if (editing) { editor.move(p); return; }
        if (gDrag) { dragG(p); return; }
        if (zone) { moveTo(p); return; }
        const h = editor.hit(p);
        svg.style.cursor = h ? editor.cursorFor(h) : gHit(p) >= 0 ? 'ns-resize' : zoneAt(p) ? 'ew-resize' : '';
    });
    const end = () => {
        if (editing) { editing = false; editor.end(); }
        if (gDrag) { gDrag = null; redraw(); } // g's range refits on release
        zone = null; from = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    fitWidth(svg.parentElement, layout);
    return { draw };
}
