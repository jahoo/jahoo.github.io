// ================================================================
//  Differential entropy — svgplot.js
//  A small SVG plotting helper: data-to-pixel scales, axes, and
//  primitives. Every figure draws into a viewBox, so it scales with
//  its container. Styling lives in CSS under svg.de-plot.
// ================================================================

import { clamp } from './dist.js';

const NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
}

export function txt(parent, x, y, s, cls, attrs) {
    const t = el('text', Object.assign({ x, y, class: cls }, attrs || {}), parent);
    t.textContent = s;
    return t;
}

// Tick formatter: up to 4 significant figures, typographic minus.
export function tfmt(v) {
    if (Math.abs(v) < 1e-9) return '0';
    return String(+v.toPrecision(4)).replace('-', '−');
}

export function niceTicks(a, b, n = 5) {
    const span = b - a;
    if (span <= 0) return [a];
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const r = step0 / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9 * step; v += step) out.push(+v.toFixed(10));
    return out;
}

let uid = 0;

export class Plot {
    // o: { w, h, m: { l, r, t, b } } — viewBox size and margins, in px.
    constructor(svg, o = {}) {
        this.W = o.w || 520;
        this.H = o.h || 320;
        this.m = Object.assign({ l: 48, r: 14, t: 14, b: 40 }, o.m || {});
        svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
        svg.classList.add('de-plot');
        this.svg = svg;
        const id = 'de-clip' + (uid++);
        this.id = id;
        const defs = el('defs', null, svg);
        this.cr = el('rect', null, el('clipPath', { id }, defs));        // plot area
        this.ca = el('rect', null, el('clipPath', { id: id + 'a' }, defs)); // above y = 0
        this.cb = el('rect', null, el('clipPath', { id: id + 'b' }, defs)); // below y = 0
        this.back = el('g', null, svg);
        this.data = el('g', { 'clip-path': `url(#${id})` }, svg);
        this.front = el('g', null, svg);
    }

    // Set the data window and clear all layers; call at the top of each redraw.
    domain(x0, x1, y0, y1) {
        Object.assign(this, { x0, x1, y0, y1 });
        const { l, r, t, b } = this.m;
        this.pl = l; this.pr = this.W - r; this.pt = t; this.pb = this.H - b;
        const set = (e, x, y, w, h) => {
            e.setAttribute('x', x); e.setAttribute('y', y);
            e.setAttribute('width', Math.max(0, w)); e.setAttribute('height', Math.max(0, h));
        };
        set(this.cr, l, t, this.pr - l, this.pb - t);
        const yz = this.Y(clamp(0, y0, y1));
        set(this.ca, l, t - 1, this.pr - l, yz - t + 1);
        set(this.cb, l, yz, this.pr - l, this.pb - yz + 1);
        this.back.replaceChildren();
        this.data.replaceChildren();
        this.front.replaceChildren();
        return this;
    }

    X(x) { return this.pl + (x - this.x0) / (this.x1 - this.x0) * (this.pr - this.pl); }

    // Clamped a couple of spans past the window so huge values stay finite.
    Y(y) {
        const span = this.y1 - this.y0;
        y = clamp(y, this.y0 - 2 * span, this.y1 + 2 * span);
        return this.pb - (y - this.y0) / span * (this.pb - this.pt);
    }

    invX(px) { return this.x0 + (px - this.pl) / (this.pr - this.pl) * (this.x1 - this.x0); }

    invY(py) { return this.y0 + (this.pb - py) / (this.pb - this.pt) * (this.y1 - this.y0); }

    // Pointer event -> SVG user coordinates (the viewBox frame).
    svgPoint(e) {
        const pt = this.svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        return pt.matrixTransform(this.svg.getScreenCTM().inverse());
    }

    // o: { xticks, yticks, nx, ny, xfmt, yfmt, grid, xlabel, ylabel }
    axes(o = {}) {
        const g = this.back;
        const xt = o.xticks || niceTicks(this.x0, this.x1, o.nx || 6);
        const yt = o.yticks || niceTicks(this.y0, this.y1, o.ny || 5);
        const xf = o.xfmt || tfmt, yf = o.yfmt || tfmt;
        for (const v of xt) {
            const x = this.X(v);
            if (x < this.pl - .5 || x > this.pr + .5) continue;
            if (o.grid !== false) el('line', { x1: x, x2: x, y1: this.pt, y2: this.pb, class: 'gl' }, g);
            txt(g, x, this.pb + 15, xf(v), 'tk', { 'text-anchor': 'middle' });
        }
        for (const v of yt) {
            const y = this.Y(v);
            if (y < this.pt - .5 || y > this.pb + .5) continue;
            if (o.grid !== false) el('line', { x1: this.pl, x2: this.pr, y1: y, y2: y, class: 'gl' }, g);
            txt(g, this.pl - 6, y + 3.5, yf(v), 'tk', { 'text-anchor': 'end' });
        }
        el('line', { x1: this.pl, x2: this.pr, y1: this.pb, y2: this.pb, class: 'ax' }, g);
        el('line', { x1: this.pl, x2: this.pl, y1: this.pt, y2: this.pb, class: 'ax' }, g);
        if (this.y0 < 0 && this.y1 > 0) {
            el('line', { x1: this.pl, x2: this.pr, y1: this.Y(0), y2: this.Y(0), class: 'ax zero' }, g);
        }
        if (o.xlabel) txt(g, (this.pl + this.pr) / 2, this.H - 6, o.xlabel, 'axl', { 'text-anchor': 'middle' });
        if (o.ylabel) {
            const cy = (this.pt + this.pb) / 2;
            txt(g, 12, cy, o.ylabel, 'axl', { 'text-anchor': 'middle', transform: `rotate(-90 12 ${cy})` });
        }
    }

    d(pts) {
        let s = '';
        for (let i = 0; i < pts.length; i++) {
            s += (i ? 'L' : 'M') + this.X(pts[i][0]).toFixed(2) + ' ' + this.Y(pts[i][1]).toFixed(2);
        }
        return s;
    }

    path(pts, cls, g, extra) {
        if (!pts.length) return null;
        return el('path', Object.assign({ d: this.d(pts), class: cls }, extra || {}), g || this.data);
    }

    // Filled region between the polyline and y = 0.
    area(pts, cls, g, extra) {
        if (!pts.length) return null;
        const yb = this.Y(clamp(0, this.y0, this.y1)).toFixed(2);
        let s = `M${this.X(pts[0][0]).toFixed(2)} ${yb}`;
        for (const p of pts) s += `L${this.X(p[0]).toFixed(2)} ${this.Y(p[1]).toFixed(2)}`;
        s += `L${this.X(pts[pts.length - 1][0]).toFixed(2)} ${yb}Z`;
        return el('path', Object.assign({ d: s, class: cls }, extra || {}), g || this.data);
    }

    rect(xa, ya, xb, yb, cls, g) {
        const X0 = this.X(Math.min(xa, xb)), X1 = this.X(Math.max(xa, xb));
        const Y0 = this.Y(Math.max(ya, yb)), Y1 = this.Y(Math.min(ya, yb));
        return el('rect', {
            x: X0.toFixed(2), y: Y0.toFixed(2),
            width: Math.max(0, X1 - X0).toFixed(2), height: Math.max(0, Y1 - Y0).toFixed(2),
            class: cls,
        }, g || this.data);
    }

    line(xa, ya, xb, yb, cls, g) {
        return el('line', { x1: this.X(xa), y1: this.Y(ya), x2: this.X(xb), y2: this.Y(yb), class: cls }, g || this.data);
    }

    hline(y, cls, g) {
        return el('line', { x1: this.pl, x2: this.pr, y1: this.Y(y), y2: this.Y(y), class: cls }, g || this.data);
    }

    circle(x, y, r, cls, g) {
        return el('circle', { cx: this.X(x), cy: this.Y(y), r, class: cls }, g || this.data);
    }

    // Groups clipped to the part of the plot above / below y = 0.
    gAbove() { return el('g', { 'clip-path': `url(#${this.id}a)` }, this.data); }
    gBelow() { return el('g', { 'clip-path': `url(#${this.id}b)` }, this.data); }
}
