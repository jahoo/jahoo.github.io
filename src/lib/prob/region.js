// ================================================================
//  Multi-panel SVG plotting. One SVG holds several Regions, each a
//  plot area with its own data window, so lines and crosshairs can be
//  drawn across panels in the shared viewBox coordinates. Styling is
//  by class names in the page's CSS.
// ================================================================

import { clamp } from './dist.js';

const NS = 'http://www.w3.org/2000/svg';
export const MINUS = '−';

export function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
}

// Plain text, except "_c" / "_{..}" is a subscript and "^c" / "^{..}" a superscript.
function rich(t, s) {
    if (!/[_^]/.test(s)) { t.textContent = s; return; }
    const re = /([_^])(\{([^}]*)\}|(.))/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
        if (m.index > last) el('tspan', null, t).textContent = s.slice(last, m.index);
        const sc = el('tspan', { 'baseline-shift': m[1] === '_' ? 'sub' : 'super', 'font-size': '72%' }, t);
        sc.textContent = m[3] !== undefined ? m[3] : m[4];
        last = re.lastIndex;
    }
    if (last < s.length) el('tspan', null, t).textContent = s.slice(last);
}

export function txt(parent, x, y, s, cls, attrs) {
    const t = el('text', Object.assign({ x, y, class: cls }, attrs || {}), parent);
    rich(t, s);
    return t;
}

export function niceTicks(a, b, n = 5) {
    const span = b - a;
    if (!(span > 0)) return [a];
    const s0 = span / n, mag = 10 ** Math.floor(Math.log10(s0)), r = s0 / mag;
    const st = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9 * st; v += st) out.push(+v.toFixed(10) || 0); // no −0
    return out;
}

// Tick label: ≤ 3 significant figures, typographic minus.
export const tf = v => (Math.abs(v) < 1e-9 ? '0' : String(+v.toPrecision(3)).replace('-', MINUS));

// Readout: fixed decimals, typographic minus, no "−0.000".
export function fmt(v, d = 3) {
    if (!isFinite(v)) return v > 0 ? '∞' : MINUS + '∞';
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && Number(s) !== 0 ? MINUS : '') + s;
}

// The SVG's defs and drawing root, with its viewBox set.
export function svgContext(svg, W, H) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();
    return { svg, defs: el('defs', null, svg), root: el('g', null, svg) };
}

// Pointer event -> viewBox coordinates.
export function svgPoint(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}

let uid = 0;

export class Region {
    // o: { ox, oy, w, h, m: { l, r, t, b } } in viewBox units
    constructor(ctx, o) {
        this.o = o;
        this.id = 'rg' + (uid++);
        this.clip = el('rect', null, el('clipPath', { id: this.id }, ctx.defs));
        this.clipA = el('rect', null, el('clipPath', { id: this.id + 'a' }, ctx.defs));
        this.clipB = el('rect', null, el('clipPath', { id: this.id + 'b' }, ctx.defs));
        this.back = el('g', null, ctx.root);
        this.data = el('g', { 'clip-path': `url(#${this.id})` }, ctx.root);
        this.front = el('g', null, ctx.root);
    }

    // Set the data window and clear the layers; call at the top of each redraw.
    domain(x0, x1, y0, y1) {
        Object.assign(this, { x0, x1, y0, y1 });
        const { ox, oy, w, h, m } = this.o;
        this.pl = ox + m.l; this.pr = ox + w - m.r; this.pt = oy + m.t; this.pb = oy + h - m.b;
        const set = (r, x, y, ww, hh) => {
            r.setAttribute('x', x); r.setAttribute('y', y);
            r.setAttribute('width', Math.max(0, ww)); r.setAttribute('height', Math.max(0, hh));
        };
        set(this.clip, this.pl, this.pt - 1, this.pr - this.pl, this.pb - this.pt + 2);
        const yz = this.Y(clamp(0, Math.min(y0, y1), Math.max(y0, y1)));
        set(this.clipA, this.pl, this.pt - 1, this.pr - this.pl, yz - this.pt + 1);
        set(this.clipB, this.pl, yz, this.pr - this.pl, this.pb - yz + 1);
        this.clear();
        return this;
    }

    clear() { this.back.replaceChildren(); this.data.replaceChildren(); this.front.replaceChildren(); }

    X(x) { return this.pl + (x - this.x0) / (this.x1 - this.x0) * (this.pr - this.pl); }
    Y(y) {
        const s = this.y1 - this.y0;
        y = clamp(y, this.y0 - 2 * s, this.y1 + 2 * s);
        return this.pb - (y - this.y0) / s * (this.pb - this.pt);
    }
    invX(px) { return this.x0 + (px - this.pl) / (this.pr - this.pl) * (this.x1 - this.x0); }
    invY(py) { return this.y0 + (this.pb - py) / (this.pb - this.pt) * (this.y1 - this.y0); }
    inX(x) { return x >= Math.min(this.x0, this.x1) && x <= Math.max(this.x0, this.x1); }
    inY(y) { return y >= this.y0 && y <= this.y1; }
    contains(p, pad = 0) { return p.x >= this.pl - pad && p.x <= this.pr + pad && p.y >= this.pt - pad && p.y <= this.pb + pad; }

    // o: { xticks, yticks, xfmt, xnow, noyl, noZero }; axis labels are math, set by the figure's math layer
    axes(o = {}) {
        const g = this.back;
        // by default, as many x ticks as fit about 70 units apart (a narrow panel gets fewer)
        const nx = Math.max(2, Math.min(6, Math.round(Math.abs(this.pr - this.pl) / 70)));
        const xt = o.xticks || niceTicks(this.x0, this.x1, nx), yt = o.yticks || niceTicks(this.y0, this.y1, 4);
        for (const v of xt) {
            const x = this.X(v);
            if (x < Math.min(this.pl, this.pr) - .5 || x > Math.max(this.pl, this.pr) + .5) continue;
            el('line', { x1: x, x2: x, y1: this.pt, y2: this.pb, class: 'gl' }, g);
            txt(g, x, this.pb + 14, o.xfmt ? o.xfmt(v) : tf(v), 'tk' + (o.xnow === v ? ' now' : ''), { 'text-anchor': 'middle' });
        }
        for (const v of yt) {
            const y = this.Y(v);
            if (y < this.pt - .5 || y > this.pb + .5) continue;
            el('line', { x1: this.pl, x2: this.pr, y1: y, y2: y, class: 'gl' }, g);
            if (!o.noyl) txt(g, this.pl - 6, y + 3.5, tf(v), 'tk', { 'text-anchor': 'end' });
        }
        el('line', { x1: this.pl, x2: this.pr, y1: this.pb, y2: this.pb, class: 'ax' }, g);
        el('line', { x1: this.pl, x2: this.pl, y1: this.pt, y2: this.pb, class: 'ax' }, g);
        if (!o.noZero && this.y0 < 0 && this.y1 > 0) el('line', { x1: this.pl, x2: this.pr, y1: this.Y(0), y2: this.Y(0), class: 'ax0' }, g);
    }

    d(pts) {
        let s = '';
        pts.forEach((p, i) => { s += (i ? 'L' : 'M') + this.X(p[0]).toFixed(1) + ' ' + this.Y(p[1]).toFixed(1); });
        return s;
    }
    path(pts, cls, g) { return pts.length ? el('path', { d: this.d(pts), class: cls }, g || this.data) : null; }
    // Filled region between the polyline and y = 0.
    area(pts, cls, g) {
        if (!pts.length) return null;
        const yb = this.Y(clamp(0, this.y0, this.y1)).toFixed(1);
        let s = `M${this.X(pts[0][0]).toFixed(1)} ${yb}`;
        for (const p of pts) s += `L${this.X(p[0]).toFixed(1)} ${this.Y(p[1]).toFixed(1)}`;
        s += `L${this.X(pts[pts.length - 1][0]).toFixed(1)} ${yb}Z`;
        return el('path', { d: s, class: cls }, g || this.data);
    }
    rect(xa, ya, xb, yb, cls, g) {
        const X0 = Math.min(this.X(xa), this.X(xb)), X1 = Math.max(this.X(xa), this.X(xb));
        const Y0 = this.Y(Math.max(ya, yb)), Y1 = this.Y(Math.min(ya, yb));
        return el('rect', {
            x: X0.toFixed(1), y: Y0.toFixed(1),
            width: Math.max(0, X1 - X0).toFixed(1), height: Math.max(0, Y1 - Y0).toFixed(1), class: cls,
        }, g || this.data);
    }
    // (nothing for an x or y off at infinity, such as x = F_X⁻¹(1) for an unbounded support)
    vline(x, cls, g) { if (!Number.isFinite(x)) return null; return el('line', { x1: this.X(x), x2: this.X(x), y1: this.pt, y2: this.pb, class: cls }, g || this.data); }
    hline(y, cls, g) { if (!Number.isFinite(y)) return null; return el('line', { x1: this.pl, x2: this.pr, y1: this.Y(y), y2: this.Y(y), class: cls }, g || this.data); }
    // Anchor points for axis labels (placed by the math layer).
    xlabelAt() { return [(this.pl + this.pr) / 2, this.pb + 30]; }
    ylabelAt() { return [this.o.ox + 12, (this.pt + this.pb) / 2]; }

    // Groups clipped to the part of the plot above / below y = 0.
    gAbove() { return el('g', { 'clip-path': `url(#${this.id}a)` }, this.data); }
    gBelow() { return el('g', { 'clip-path': `url(#${this.id}b)` }, this.data); }
}
