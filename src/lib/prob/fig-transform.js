// ================================================================
//  Probability figures — fig-transform.js
//  Why the inverse CDF works: 40 evenly spaced u from the uniform,
//  carried through the graph of F_X⁻¹ to x and on to p_X(x). A line is
//  coloured iff it lands at or below x (⟺ u ≤ F_X(x)). u runs across,
//  as in the area figure: the uniform on top, the graph x = F_X⁻¹(u),
//  and p_X on the right with x vertical.
//  Dragging: the uniform and the graph set u; the p_X panel sets x;
//  a p_X handle takes precedence.
//  With width: true the figure also shows entropy as a size: the run
//  of the tread (pmf) or the slope (density) at the cursor on the graph
//  of F_X⁻¹, the uniform with the same entropy as a dashed box in the
//  p_X panel, and a readout of H or h and 2^H or 2^h.
// ================================================================

import { clamp, discCdfAt, discQuantile, atX, atU, lerp } from './dist.js';
import { Region, el, svgContext, svgPoint } from './region.js';
import { createEditor, regionAdapter } from './edit.js';
import { densityAt } from './frame.js';
import { createMathLayer, texNum } from './mathlabels.js';
import { fitWidth } from './fit.js';
import { boxOf } from './width.js';

const TW = 1000, TH = 566, N_LINES = 40;
const READOUT = 56; // a line of math under the panels, in width mode
// a readout value: magenta when negative
const val = x => { const t = texNum(x); return t.startsWith('-') ? `\\class{ex-neg}{${t}}` : t; };

const polyline = (g, pts, cls) => el('path', { d: 'M' + pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'), class: cls, fill: 'none' }, g);
const closed = (g, pts, cls) => el('path', { d: 'M' + pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z', class: cls }, g);

export function createTransformFigure(svg, { model, pos, ui, redraw, stopPlay }, { width = false } = {}) {
    const H = width ? TH + READOUT : TH;
    const ctx = svgContext(svg, TW, H);
    const lines = el('g', null, ctx.root); // under the panels, so the graphs stay legible where lines run along them
    const O = {
        U: new Region(ctx, { ox: 0, oy: 0, w: 600, h: 170, m: { l: 58, r: 16, t: 26, b: 26 } }),
        G: new Region(ctx, { ox: 0, oy: 170, w: 600, h: 390, m: { l: 58, r: 16, t: 16, b: 42 } }),
        X: new Region(ctx, { ox: 624, oy: 170, w: 376, h: 390, m: { l: 20, r: 16, t: 16, b: 42 } }),
    };
    const handles = el('g', null, ctx.root), over = el('g', null, ctx.root);
    const math = createMathLayer(svg.parentElement, TW, H);
    // at the full width of 1000: the uniform and the graph 600 wide, then a gap of 24 and
    // p_X; a narrower layout (see fit.js) narrows all three in proportion
    let drawn = false, layoutW = TW;
    function layout(W) {
        const wl = Math.round(0.6 * W), gap = Math.round(0.024 * W);
        Object.assign(O.U.o, { w: wl }); Object.assign(O.G.o, { w: wl });
        Object.assign(O.X.o, { ox: wl + gap, w: W - wl - gap });
        layoutW = W;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        math.resize(W, H);
        if (drawn) draw();
    }
    const yLabel = (key, R, tex) => { const [x, y] = R.ylabelAt(); math.set(key, x, y, tex, { rotate: -90 }); };
    const xLabel = (key, R, tex) => { const [x, y] = R.xlabelAt(); math.set(key, x, y, tex); };
    let lastKx = 0; // atoms drawn in the p_X panel: all, or with ghosts off only those at or below x
    const visible = i => ui.ghost || i < lastKx;
    const editor = createEditor({ model, adapter: regionAdapter(O.X, true), visible });

    // x = F_X⁻¹(u) and p_X there
    function quant(u) {
        const v = model.view();
        if (v.disc) { const k = discQuantile(v.F, u); return { x: k, p: v.p[k - 1] }; }
        const x = lerp(v.S.xs, atU(v.S, u));
        return { x, p: lerp(v.S.fs, atX(v.S, x)) };
    }

    function draw() {
        drawn = true;
        const v = model.view(), disc = v.disc;
        lines.replaceChildren(); over.replaceChildren(); handles.replaceChildren();
        const u = pos.u, [xa, xb] = v.xRange;
        const pmax = disc ? 1.05 : v.win.y1;
        const atoms = disc ? v.p.map((_, i) => i + 1) : undefined;
        // screen position of a point in each panel
        const onU = (uu, d) => [O.U.X(uu), O.U.Y(d)];
        const onG = (uu, xx) => [O.G.X(uu), O.G.Y(xx)];
        const onX = (xx, d) => [O.X.X(d), O.X.Y(xx)];

        // ---- panel domains and axes ----
        math.begin();
        O.U.domain(0, 1, 0, 1.35);
        O.U.axes({ xticks: [0, .25, .5, .75, 1], yticks: [0, 1] });
        yLabel('u-y', O.U, 'p_U(u)');
        O.G.domain(0, 1, xa, xb);
        O.G.axes({ xticks: [0, .25, .5, .75, 1], yticks: atoms, noZero: true });
        yLabel('g-y', O.G, 'x = F_X^{-1}(u)'); xLabel('g-x', O.G, 'u');
        O.X.domain(0, pmax, xa, xb);
        O.X.axes({ yticks: atoms, noyl: true, noZero: true });
        xLabel('x-x', O.X, 'p_X(x)');

        // F_X(x) at the current x: every u in [0, F_X(x)] lands at or below x, and no other u does
        const Fnow = disc ? discCdfAt(v.F, pos.x) : u;
        const byU = pos.driver === 'u';

        // ---- the uniform, with [0, F_X(x)] shaded ----
        const uRect = (u0, u1, cls) => closed(O.U.data, [onU(u0, 0), onU(u0, 1), onU(u1, 1), onU(u1, 0)], cls);
        if (ui.ghost) uRect(0, 1, 'fm').setAttribute('opacity', '.35');
        uRect(0, Fnow, 'fm');
        polyline(O.U.data, [onU(0, 0), onU(0, 1), onU(1, 1), onU(1, 0)], 'curve');

        if (disc) {
            const { p: P, F } = v, n = P.length, kx = clamp(Math.floor(pos.x + 1e-9), 0, n); // atoms 1..kx lie at or below x
            lastKx = kx;
            // the pmf of X: atoms at or below x filled
            P.forEach((q, i) => {
                if (q <= 0) { const a = onX(i + 1, 0); el('circle', { cx: a[0], cy: a[1], r: 4, class: 'pin-null' }, O.X.data); return; }
                const c = i < kx ? 'done' : 'todo';
                if (c === 'todo' && !ui.ghost) return;
                const a = onX(i + 1, 0), b = onX(i + 1, q);
                el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'stem-' + c }, O.X.data);
                el('circle', { cx: b[0], cy: b[1], r: 4.5, class: 'pin-' + c }, O.X.data);
            });
            // graph of F_X⁻¹ (ink): x = k on (F(k−1), F(k)], open at the start of the block, closed at the end.
            // Faint dotted: the flats of F_X, u = F(k) for x in [k, k+1), where x lands between atoms.
            P.forEach((q, i) => {
                if (i + 1 < n) { const a = onG(F[i + 1], i + 1), b = onG(F[i + 1], i + 2); el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'jump' }, O.G.data); }
            });
            P.forEach((q, i) => {
                if (q <= 0) return; // F_X⁻¹ never takes the value of an atom without mass
                const k = i + 1;
                polyline(O.G.data, [onG(F[i], k), onG(F[i + 1], k)], 'graphline');
                const o = onG(F[i], k), c = onG(F[i + 1], k);
                el('circle', { cx: o[0], cy: o[1], r: 3.5, class: 'odot' }, O.G.front);
                el('circle', { cx: c[0], cy: c[1], r: 3.5, class: 'cdot' }, O.G.front);
            });
            // each atom's block of u, (F(k−1), F(k)], as one band from the uniform to the graph of
            // F_X⁻¹, then a single line to the atom, since the whole block goes to that one point.
            // Filled when the atom is at or below x; when u was moved, its block is the fiber, in blue.
            const fiberK = byU && kx >= 1 ? kx : 0;
            P.forEach((q, i) => {
                const k = i + 1, a = F[i], b = F[i + 1];
                // an atom without mass has an empty block: only a grey line where it would be
                if (q <= 0) { polyline(lines, [onG(b, k), onX(k, 0)], 'br-null'); return; }
                const c = k <= kx ? 'done' : 'todo';
                closed(lines, [onU(a, 0), onG(a, k), onG(b, k), onU(b, 0)], 'band-' + c);
                polyline(lines, [onG(b, k), onX(k, 0)], 'br-' + c);
            });
            if (byU && fiberK) {
                // u itself, inside its block
                const g = onG(u, fiberK); el('circle', { cx: g[0], cy: g[1], r: 4.5, class: 'dot' }, over);
                const c0 = onU(u, 0), c1 = onU(u, 1); el('line', { x1: c0[0], y1: c0[1], x2: c1[0], y2: c1[1], class: 'cursor' }, over);
            } else if (!byU) {
                // x moved: read x ↦ F_X(x), across to the edge of the shaded run
                polyline(over, [onX(pos.x, 0), onG(Fnow, pos.x), onU(Fnow, 0), onU(Fnow, 1)], 'br-cur');
                const g = onG(Fnow, pos.x); el('circle', { cx: g[0], cy: g[1], r: 4.5, class: 'dot' }, over);
            }
        } else {
            // ---- continuous: the density of X and the graph of the map ----
            const S = v.S, s = v.shape;
            const pts = S.xs.map((x, i) => [x, S.fs[i], S.Fs[i]]).filter(q => q[0] >= xa - .05 && q[0] <= xb + .05);
            const pairs = pts.map(q => [q[0], q[1]]);
            const edge = s.kind === 'steps' ? [[s.ts[0], 0], ...pairs, [s.ts[s.ts.length - 1], 0]] : pairs;
            const shade = (list, cls) => list.length ? closed(O.X.data, [onX(list[0][0], 0), ...list.map(q => onX(q[0], q[1])), onX(list[list.length - 1][0], 0)], cls) : null;
            if (ui.ghost) shade(edge, 'fm')?.setAttribute('opacity', '.35');
            shade(edge.filter(q => q[0] <= pos.x).concat(Number.isFinite(pos.x) ? [[pos.x, densityAt(v, pos.x)]] : []), 'fm');
            polyline(O.X.data, edge.map(q => onX(q[0], q[1])), 'curve');
            polyline(O.G.data, pts.map(q => onG(q[2], q[0])), 'curve');
            // equal-probability lines (quantiles): the same set in either direction, since F_X is a bijection here
            const lineThrough = (uu, xx, pp, cls) => polyline(lines, [onU(uu, 0), onG(uu, xx), onX(xx, 0), onX(xx, pp)], cls);
            for (let j = 0; j < N_LINES; j++) {
                const uj = (j + 0.5) / N_LINES, q = quant(uj), done = uj <= u;
                if (!(q.x >= xa && q.x <= xb)) continue;
                if (!done && !ui.ghost) continue;
                lineThrough(uj, q.x, q.p, done ? 'br-done' : 'br-todo');
            }
            if (u > 0) {
                const q = quant(u);
                if (q.x >= xa && q.x <= xb) {
                    lineThrough(u, q.x, q.p, 'br-cur');
                    const g = onG(u, q.x); el('circle', { cx: g[0], cy: g[1], r: 4.5, class: 'dot' }, over);
                }
            }
        }
        // ---- width mode: the run or slope at u, the box of area 1, and the readout ----
        if (width) {
            const b = boxOf(v);
            // the uniform with the same entropy, in the p_X panel (density across, x up)
            O.X.rect(0, b.cx - b.w / 2, b.ht, b.cx + b.w / 2, 'eqbox');
            const bx = O.X.X(Math.min(b.ht, pmax)), by = O.X.Y(b.cx + b.w / 2);
            const fits = bx < O.X.pr - 90;
            math.set('eq', fits ? bx + 6 : bx - 6, Math.max(by, O.X.pt + 10),
                `2^{${disc ? 'H' : 'h'}} = ${texNum(b.w, 2)}`, { anchor: fits ? 'start' : 'end', cls: 'ex-ml-note' });
            if (u > 0) {
                if (disc) {
                    // the tread holding u: its run is p_X at that atom
                    const k = discQuantile(v.F, u);
                    if (k >= 1 && v.p[k - 1] > 0) {
                        polyline(over, [onG(v.F[k - 1], k), onG(v.F[k], k)], 'tread');
                        const [mx, my] = onG((v.F[k - 1] + v.F[k]) / 2, k);
                        math.set('local', mx, my - 16, `\\text{run} = p_X(${k}) = ${texNum(v.p[k - 1])}`, { cls: 'ex-ml-note' });
                    }
                } else {
                    // the tangent at u: its slope is 1 / p_X there (not past the window's ends, where
                    // u = 0 or 1 lands on the samples' extreme tail and the slope is astronomical)
                    const q = quant(u);
                    if (q.x >= xa && q.x <= xb) {
                        const slope = 1 / q.p, du = 0.06;
                        const seg = [[u - du, q.x - du * slope], [u + du, q.x + du * slope]].map(([uu, xx]) => onG(uu, xx));
                        el('path', { d: 'M' + seg.map(c => c.join(' ')).join('L'), class: 'tangent', 'clip-path': `url(#${O.G.id})` }, over);
                        const [mx, my] = onG(u, q.x);
                        math.set('local', mx + 14, my - 18, `\\text{slope} = 1/p_X(x) = ${texNum(slope, 2)}`, { anchor: 'start', cls: 'ex-ml-note' });
                    }
                }
            }
            const name = disc ? 'H' : 'h';
            math.set('readout', layoutW / 2, TH + 30,
                `${name}(X) = ${val(b.H)}\\text{ bits}, \\qquad 2^{${name}(X)} = ${texNum(b.w, 2)}\\ \\text{${disc ? 'effective outcomes' : 'effective width'}}`,
                { cls: 'ex-ml-formula' });
        }
        editor.draw(handles);
        math.end();
    }

    // ---- dragging ----
    let zone = null, editing = null;
    function zoneAt(p) {
        if (O.U.contains(p, 4) || O.G.contains(p, 4)) return 'u';
        if (O.X.contains(p, 4)) return 'x';
        return null;
    }
    function moveTo(p) {
        if (zone === 'u') pos.setU(O.G.invX(p.x));
        else pos.setX(O.X.invY(p.y));
        redraw();
    }
    svg.addEventListener('pointerdown', e => {
        const p = svgPoint(svg, e), h = editor.hit(p);
        if (h) {
            stopPlay(); editing = true; svg.setPointerCapture(e.pointerId); e.preventDefault();
            editor.begin(h, p);
            return;
        }
        const z = zoneAt(p);
        if (!z) return;
        stopPlay(); zone = z; svg.setPointerCapture(e.pointerId); e.preventDefault();
        moveTo(p);
    });
    svg.addEventListener('pointermove', e => {
        const p = svgPoint(svg, e);
        if (editing) { editor.move(p); return; }
        if (zone) { moveTo(p); return; }
        const h = editor.hit(p), z = zoneAt(p);
        svg.style.cursor = h ? editor.cursorFor(h) : !z ? '' : z === 'u' ? 'ew-resize' : 'ns-resize';
    });
    const end = () => { if (editing) { editor.end(); editing = false; } zone = null; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    fitWidth(svg.parentElement, layout);
    return { draw };
}
