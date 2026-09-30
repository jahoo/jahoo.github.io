(() => {
  // src/lib/prob/dist.js
  var LN2 = Math.LN2;
  var log2 = (x) => Math.log(x) / LN2;
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  var SQ2PI = Math.sqrt(2 * Math.PI);
  function gPdf(x, m, s) {
    const z = (x - m) / s;
    return Math.exp(-0.5 * z * z) / (s * SQ2PI);
  }
  function gCdf(x, m, s) {
    return 0.5 * erfc(-(x - m) / (s * Math.SQRT2));
  }
  function gMass(a, b, m, s) {
    if (b <= a) return 0;
    if (b - a < 0.5 * s) {
      const c = (a + b) / 2;
      return (b - a) / 6 * (gPdf(a, m, s) + 4 * gPdf(c, m, s) + gPdf(b, m, s));
    }
    const za = (a - m) / (s * Math.SQRT2), zb = (b - m) / (s * Math.SQRT2);
    if (za >= 0) return 0.5 * (erfc(za) - erfc(zb));
    if (zb <= 0) return 0.5 * (erfc(-zb) - erfc(-za));
    return 1 - 0.5 * erfc(-za) - 0.5 * erfc(zb);
  }
  function numEntropy(pdf, lo, hi, N = 6e3) {
    const dx = (hi - lo) / N;
    let s = 0;
    for (let i = 0; i <= N; i++) {
      const f = pdf(lo + i * dx);
      const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
      if (f > 0) s -= w * f * Math.log(f);
    }
    return s * dx / 3 / LN2;
  }
  function sampleXs(comps, x0, x1, n = 500) {
    const xs = [];
    for (let i = 0; i <= n; i++) xs.push(x0 + (x1 - x0) * i / n);
    for (const c of comps) {
      for (let i = 0; i <= 240; i++) {
        const x = c.m + c.s * (-7 + 14 * i / 240);
        if (x > x0 && x < x1) xs.push(x);
      }
    }
    return xs.sort((a, b) => a - b);
  }
  function mixDist(comps) {
    const pdf = (x) => {
      let v = 0;
      for (const c of comps) v += c.w * gPdf(x, c.m, c.s);
      return v;
    };
    const cdf = (x) => {
      let v = 0;
      for (const c of comps) v += c.w * gCdf(x, c.m, c.s);
      return v;
    };
    const mass = (a, b) => {
      let v = 0;
      for (const c of comps) v += c.w * gMass(a, b, c.m, c.s);
      return v;
    };
    const lo = Math.min(...comps.map((c) => c.m - 9 * c.s));
    const hi = Math.max(...comps.map((c) => c.m + 9 * c.s));
    const minScale = Math.min(...comps.map((c) => c.s));
    const N = 2 * Math.ceil(Math.min(1e5, Math.max(3e3, 20 * (hi - lo) / minScale)));
    const h = comps.length === 1 ? 0.5 * log2(2 * Math.PI * Math.E * comps[0].s * comps[0].s) : numEntropy(pdf, lo, hi, N);
    let peak = 0;
    for (const x of sampleXs(comps, lo, hi, 1e3)) peak = Math.max(peak, pdf(x));
    return { kind: "smooth", comps, pdf, cdf, mass, lo, hi, minScale, h, peak };
  }
  function stepsDist(ts, ms) {
    const K = ms.length;
    const ws = ms.map((_, i) => ts[i + 1] - ts[i]);
    const hs = ms.map((m, i) => m / ws[i]);
    const cum = [0];
    for (let i = 0; i < K; i++) cum.push(cum[i] + ms[i]);
    const cdf = (x) => {
      if (x <= ts[0]) return 0;
      if (x >= ts[K]) return 1;
      let i = 0;
      while (x > ts[i + 1]) i++;
      return cum[i] + hs[i] * (x - ts[i]);
    };
    return {
      kind: "steps",
      ts,
      ms,
      ws,
      hs,
      pdf: (x) => {
        if (x < ts[0] || x > ts[K]) return 0;
        let i = 0;
        while (i < K - 1 && x > ts[i + 1]) i++;
        return hs[i];
      },
      cdf,
      mass: (u, v) => Math.max(0, cdf(v) - cdf(u)),
      lo: ts[0],
      hi: ts[K],
      minScale: Math.min(...ws),
      h: ms.reduce((t, m, i) => t + (m > 0 ? m * log2(ws[i] / m) : 0), 0),
      peak: Math.max(...hs)
    };
  }
  function unifDist(a, b) {
    return stepsDist([a, b], [1]);
  }
  var BIMODAL = (() => {
    const c = [{ w: 0.62, m: -0.9, s: 0.42 }, { w: 0.38, m: 1.3, s: 0.55 }];
    const mu = c.reduce((t, k) => t + k.w * k.m, 0);
    const v = c.reduce((t, k) => t + k.w * (k.s * k.s + k.m * k.m), 0) - mu * mu;
    const sd = Math.sqrt(v);
    return c.map((k) => ({ w: k.w, m: (k.m - mu) / sd, s: k.s / sd }));
  })();
  function family(name, sd) {
    if (name === "gauss") return mixDist([{ w: 1, m: 0, s: sd }]);
    if (name === "unif") {
      const w = sd * Math.sqrt(12);
      return unifDist(-w / 2, w / 2);
    }
    return mixDist(BIMODAL.map((k) => ({ w: k.w, m: k.m * sd, s: k.s * sd })));
  }
  function densityPts(d, x0, x1, N = 500) {
    if (d.kind === "steps") {
      const { ts, hs } = d, K = hs.length;
      const pts = [[x0, 0]];
      if (ts[0] > x0) pts.push([ts[0], 0]);
      for (let i = 0; i < K; i++) {
        const a = clamp(ts[i], x0, x1), b = clamp(ts[i + 1], x0, x1);
        pts.push([a, hs[i]], [b, hs[i]]);
      }
      if (ts[K] < x1) pts.push([ts[K], 0]);
      pts.push([x1, 0]);
      return pts;
    }
    return sampleXs(d.comps, x0, x1, N).map((x) => [x, d.pdf(x)]);
  }
  function binRange(d, D) {
    return [Math.floor(d.lo / D + 0.5), Math.floor(d.hi / D + 0.5)];
  }
  function quantH(d, D) {
    const [k0, k1] = binRange(d, D);
    if (k1 - k0 > 4e5) return d.h - log2(D);
    let H = 0;
    for (let k = k0; k <= k1; k++) {
      const p = d.mass((k - 0.5) * D, (k + 0.5) * D);
      if (p > 0) H -= p * Math.log(p);
    }
    return Math.max(0, H / LN2);
  }
  function softmax(logits, beta) {
    const ex = logits.map((l) => Math.exp(beta * l));
    const Z = ex.reduce((a, b) => a + b, 0);
    return ex.map((v) => v / Z);
  }
  function shannonH(p) {
    return -p.reduce((t, q) => t + (q > 0 ? q * log2(q) : 0), 0);
  }
  function quantile(d, q) {
    let lo = d.lo, hi = d.hi;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (d.cdf(m) < q) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  }
  function temper(p, beta) {
    const q = p.map((v) => v > 0 ? Math.pow(v, beta) : 0);
    const Z = q.reduce((a, b) => a + b, 0);
    return q.map((v) => v / Z);
  }
  function withProb(p, i, target, minP) {
    target = clamp(target, minP, 1 - (p.length - 1) * minP);
    const scale = (1 - target) / (1 - p[i]);
    const q = p.map((v, j) => j === i ? target : Math.max(minP, v * scale));
    const Z = q.reduce((a, b) => a + b, 0);
    return q.map((v) => v / Z);
  }
  var S_MIN = 2 ** -7;
  var S_MAX = 16;
  var MIN_WIDTH = 2 ** -6;
  var MIN_MASS = 0.01;
  var STEP_MASSES = [0.1, 0.28, 0.34, 0.18, 0.1];
  function familyShape(name, sd) {
    if (name === "unif") {
      const w = sd * Math.sqrt(12);
      return { kind: "steps", ts: [-w / 2, w / 2], ms: [1] };
    }
    if (name === "steps") {
      const K = STEP_MASSES.length;
      const shape = { kind: "steps", ts: STEP_MASSES.map((_, i) => i - K / 2).concat(K / 2), ms: STEP_MASSES.slice() };
      const { mean } = shapeMoments(shape);
      return rescaleShape({ kind: "steps", ts: shape.ts.map((t) => t - mean), ms: shape.ms }, sd);
    }
    const comps = name === "gauss" ? [{ w: 1, m: 0, s: 1 }] : BIMODAL;
    return { kind: "mix", comps: comps.map((k) => ({ w: k.w, m: k.m * sd, s: k.s * sd })) };
  }
  function shapeDist(shape) {
    return shape.kind === "steps" ? stepsDist(shape.ts, shape.ms) : mixDist(shape.comps);
  }
  function shapeMoments(shape) {
    if (shape.kind === "steps") {
      const { ts, ms } = shape;
      let mean2 = 0, m2 = 0;
      ms.forEach((m, i) => {
        const c2 = (ts[i] + ts[i + 1]) / 2, w = ts[i + 1] - ts[i];
        mean2 += m * c2;
        m2 += m * (c2 * c2 + w * w / 12);
      });
      return { mean: mean2, sd: Math.sqrt(Math.max(m2 - mean2 * mean2, 0)) };
    }
    const c = shape.comps;
    const mean = c.reduce((t, k) => t + k.w * k.m, 0);
    const v = c.reduce((t, k) => t + k.w * (k.s * k.s + k.m * k.m), 0) - mean * mean;
    return { mean, sd: Math.sqrt(Math.max(v, 0)) };
  }
  function rescaleShape(shape, sd) {
    const { mean, sd: sd0 } = shapeMoments(shape);
    const k = sd / sd0;
    if (shape.kind === "steps") {
      return { kind: "steps", ts: shape.ts.map((t) => mean + (t - mean) * k), ms: shape.ms.slice() };
    }
    return {
      kind: "mix",
      comps: shape.comps.map((c) => ({ w: c.w, m: mean + (c.m - mean) * k, s: clamp(c.s * k, S_MIN, S_MAX) }))
    };
  }
  function setPeak(comps, i, x, y) {
    const c = comps[i];
    let other = 0;
    comps.forEach((k, j) => {
      if (j !== i) other += k.w * gPdf(x, k.m, k.s);
    });
    const own = y - other;
    const s = own > 0 ? clamp(c.w / (own * SQ2PI), S_MIN, S_MAX) : S_MAX;
    return comps.map((k, j) => j === i ? { w: k.w, m: x, s } : k);
  }
  function setBreak(shape, j, x) {
    const ts = shape.ts.slice(), K = shape.ms.length;
    const lo = j > 0 ? ts[j - 1] + MIN_WIDTH : -Infinity;
    const hi = j < K ? ts[j + 1] - MIN_WIDTH : Infinity;
    ts[j] = clamp(x, lo, hi);
    return { kind: "steps", ts, ms: shape.ms.slice() };
  }
  function setLevel(shape, i, y) {
    const w = shape.ts[i + 1] - shape.ts[i];
    return { kind: "steps", ts: shape.ts.slice(), ms: withProb(shape.ms, i, y * w, MIN_MASS) };
  }

  // src/differential-entropy/svgplot.js
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, attrs) {
    const t = el("text", Object.assign({ x, y, class: cls }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }
  function tfmt(v) {
    if (Math.abs(v) < 1e-9) return "0";
    return String(+v.toPrecision(4)).replace("-", "\u2212");
  }
  function niceTicks(a, b, n = 5) {
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
  var uid = 0;
  var Plot = class {
    // o: { w, h, m: { l, r, t, b } } — viewBox size and margins, in px.
    constructor(svg, o = {}) {
      this.W = o.w || 520;
      this.H = o.h || 320;
      this.m = Object.assign({ l: 48, r: 14, t: 14, b: 40 }, o.m || {});
      svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
      svg.classList.add("de-plot");
      this.svg = svg;
      const id = "de-clip" + uid++;
      this.id = id;
      const defs = el("defs", null, svg);
      this.cr = el("rect", null, el("clipPath", { id }, defs));
      this.ca = el("rect", null, el("clipPath", { id: id + "a" }, defs));
      this.cb = el("rect", null, el("clipPath", { id: id + "b" }, defs));
      this.back = el("g", null, svg);
      this.data = el("g", { "clip-path": `url(#${id})` }, svg);
      this.front = el("g", null, svg);
    }
    // Set the data window and clear all layers; call at the top of each redraw.
    domain(x0, x1, y0, y1) {
      Object.assign(this, { x0, x1, y0, y1 });
      const { l, r, t, b } = this.m;
      this.pl = l;
      this.pr = this.W - r;
      this.pt = t;
      this.pb = this.H - b;
      const set = (e, x, y, w, h) => {
        e.setAttribute("x", x);
        e.setAttribute("y", y);
        e.setAttribute("width", Math.max(0, w));
        e.setAttribute("height", Math.max(0, h));
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
    X(x) {
      return this.pl + (x - this.x0) / (this.x1 - this.x0) * (this.pr - this.pl);
    }
    // Clamped a couple of spans past the window so huge values stay finite.
    Y(y) {
      const span = this.y1 - this.y0;
      y = clamp(y, this.y0 - 2 * span, this.y1 + 2 * span);
      return this.pb - (y - this.y0) / span * (this.pb - this.pt);
    }
    invX(px) {
      return this.x0 + (px - this.pl) / (this.pr - this.pl) * (this.x1 - this.x0);
    }
    invY(py) {
      return this.y0 + (this.pb - py) / (this.pb - this.pt) * (this.y1 - this.y0);
    }
    // Pointer event -> SVG user coordinates (the viewBox frame).
    svgPoint(e) {
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
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
        if (x < this.pl - 0.5 || x > this.pr + 0.5) continue;
        if (o.grid !== false) el("line", { x1: x, x2: x, y1: this.pt, y2: this.pb, class: "gl" }, g);
        txt(g, x, this.pb + 15, xf(v), "tk", { "text-anchor": "middle" });
      }
      for (const v of yt) {
        const y = this.Y(v);
        if (y < this.pt - 0.5 || y > this.pb + 0.5) continue;
        if (o.grid !== false) el("line", { x1: this.pl, x2: this.pr, y1: y, y2: y, class: "gl" }, g);
        txt(g, this.pl - 6, y + 3.5, yf(v), "tk", { "text-anchor": "end" });
      }
      el("line", { x1: this.pl, x2: this.pr, y1: this.pb, y2: this.pb, class: "ax" }, g);
      el("line", { x1: this.pl, x2: this.pl, y1: this.pt, y2: this.pb, class: "ax" }, g);
      if (this.y0 < 0 && this.y1 > 0) {
        el("line", { x1: this.pl, x2: this.pr, y1: this.Y(0), y2: this.Y(0), class: "ax zero" }, g);
      }
      if (o.xlabel) txt(g, (this.pl + this.pr) / 2, this.H - 6, o.xlabel, "axl", { "text-anchor": "middle" });
      if (o.ylabel) {
        const cy = (this.pt + this.pb) / 2;
        txt(g, 12, cy, o.ylabel, "axl", { "text-anchor": "middle", transform: `rotate(-90 12 ${cy})` });
      }
    }
    d(pts) {
      let s = "";
      for (let i = 0; i < pts.length; i++) {
        s += (i ? "L" : "M") + this.X(pts[i][0]).toFixed(2) + " " + this.Y(pts[i][1]).toFixed(2);
      }
      return s;
    }
    path(pts, cls, g, extra) {
      if (!pts.length) return null;
      return el("path", Object.assign({ d: this.d(pts), class: cls }, extra || {}), g || this.data);
    }
    // Filled region between the polyline and y = 0.
    area(pts, cls, g, extra) {
      if (!pts.length) return null;
      const yb = this.Y(clamp(0, this.y0, this.y1)).toFixed(2);
      let s = `M${this.X(pts[0][0]).toFixed(2)} ${yb}`;
      for (const p of pts) s += `L${this.X(p[0]).toFixed(2)} ${this.Y(p[1]).toFixed(2)}`;
      s += `L${this.X(pts[pts.length - 1][0]).toFixed(2)} ${yb}Z`;
      return el("path", Object.assign({ d: s, class: cls }, extra || {}), g || this.data);
    }
    rect(xa, ya, xb, yb, cls, g) {
      const X0 = this.X(Math.min(xa, xb)), X1 = this.X(Math.max(xa, xb));
      const Y0 = this.Y(Math.max(ya, yb)), Y1 = this.Y(Math.min(ya, yb));
      return el("rect", {
        x: X0.toFixed(2),
        y: Y0.toFixed(2),
        width: Math.max(0, X1 - X0).toFixed(2),
        height: Math.max(0, Y1 - Y0).toFixed(2),
        class: cls
      }, g || this.data);
    }
    line(xa, ya, xb, yb, cls, g) {
      return el("line", { x1: this.X(xa), y1: this.Y(ya), x2: this.X(xb), y2: this.Y(yb), class: cls }, g || this.data);
    }
    hline(y, cls, g) {
      return el("line", { x1: this.pl, x2: this.pr, y1: this.Y(y), y2: this.Y(y), class: cls }, g || this.data);
    }
    circle(x, y, r, cls, g) {
      return el("circle", { cx: this.X(x), cy: this.Y(y), r, class: cls }, g || this.data);
    }
    // Groups clipped to the part of the plot above / below y = 0.
    gAbove() {
      return el("g", { "clip-path": `url(#${this.id}a)` }, this.data);
    }
    gBelow() {
      return el("g", { "clip-path": `url(#${this.id}b)` }, this.data);
    }
  };

  // src/differential-entropy/ui.js
  var MINUS = "\u2212";
  function fmt(v, d = 2) {
    if (!isFinite(v)) return v > 0 ? "\u221E" : MINUS + "\u221E";
    const s = Math.abs(v).toFixed(d);
    const neg = v < 0 && Number(s) !== 0;
    return (neg ? MINUS : "") + s;
  }
  function setSigned(node, v, d = 2) {
    if (!node) return;
    node.textContent = fmt(v, d);
    node.classList.toggle("neg", v < 0 && Number(Math.abs(v).toFixed(d)) !== 0);
  }
  function setText(node, s) {
    if (node) node.textContent = s;
  }
  function powLabel(v) {
    const k = Math.round(-log2(v));
    if (Math.abs(-log2(v) - k) < 1e-6 && k > 0) return "1/" + 2 ** k;
    return v < 1 ? v.toPrecision(2) : String(+v.toPrecision(3));
  }
  function segButtons(container, onChange) {
    if (!container) return;
    const btns = [...container.querySelectorAll("button")];
    btns.forEach((b) => b.addEventListener("click", () => {
      btns.forEach((x) => x.setAttribute("aria-checked", x === b ? "true" : "false"));
      onChange(b.dataset.v);
    }));
    container.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = btns.findIndex((b) => b.getAttribute("aria-checked") === "true");
      const j = (i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length;
      btns[j].click();
      btns[j].focus();
      e.preventDefault();
    });
  }

  // src/differential-entropy/fig-discrete.js
  var NAMES = "abcdefgh".split("");
  var MIN_P = 0.01;
  var PRESETS = {
    default: softmax([1.9, 0.2, 1.1, -0.6, 0.7, -1.3, 0.1, -0.3], 1),
    unimodal: [0.05, 0.08, 0.12, 0.3, 0.2, 0.12, 0.08, 0.05],
    uniform: [1, 1, 1, 1, 1, 1, 1, 1],
    peaked: [0.02, 0.03, 0.05, 0.62, 0.13, 0.07, 0.05, 0.03],
    bimodal: [0.05, 0.28, 0.09, 0.03, 0.03, 0.09, 0.28, 0.15],
    zipf: [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8]
  };
  var normalize = (p) => {
    const Z = p.reduce((a, b) => a + b, 0);
    return p.map((v) => v / Z);
  };
  function initDiscrete() {
    const svgPmf = document.getElementById("de-a-pmf");
    const svgArea = document.getElementById("de-a-area");
    const slider = document.getElementById("de-a-beta");
    if (!svgPmf || !svgArea || !slider) return;
    const preset = document.getElementById("de-a-preset");
    const P1 = new Plot(svgPmf, { w: 520, h: 300 });
    const P2 = new Plot(svgArea, { w: 520, h: 300 });
    let base = PRESETS.default.slice();
    const order = base.map((_, i) => i);
    let dragK = -1;
    function draw() {
      const beta = +slider.value;
      setText(document.getElementById("de-a-betav"), beta.toFixed(2));
      const p = temper(base, beta);
      const H = shannonH(p);
      const tempered = Math.abs(beta - 1) > 1e-9;
      P1.domain(0.4, 8.6, 0, 1.12);
      P1.axes({ xticks: [], yticks: [0, 0.25, 0.5, 0.75, 1], ylabel: "p(x)" });
      order.forEach((k, j) => {
        const x = j + 1;
        P1.rect(x - 0.32, 0, x + 0.32, p[k], "bar");
        if (tempered) P1.rect(x - 0.32, 0, x + 0.32, base[k], "bar-base");
        P1.line(x - 0.32, base[k], x + 0.32, base[k], "grip" + (k === dragK ? " active" : ""));
        txt(P1.back, P1.X(x), P1.pb + 16, NAMES[k], "axl", { "text-anchor": "middle" });
      });
      P1.hline(1, "ref");
      txt(P1.front, P1.pr - 4, P1.Y(1) - 6, "a probability never exceeds 1", "lbl soft", { "text-anchor": "end" });
      P2.domain(0, 1, 0, 10);
      P2.axes({
        xticks: [0, 0.25, 0.5, 0.75, 1],
        yticks: [0, 2, 4, 6, 8, 10],
        xlabel: "cumulative probability",
        ylabel: "\u2212log\u2082 p(x)"
      });
      let u = 0;
      for (const k of order) {
        const s = -log2(p[k]);
        P2.rect(u, 0, u + p[k], s, "bar");
        if (p[k] > 0.045) {
          txt(P2.data, P2.X(u + p[k] / 2), P2.Y(Math.min(s, 9.4)) - 5, NAMES[k], "axl", { "text-anchor": "middle" });
        }
        u += p[k];
      }
      P2.hline(H, "hmark");
      txt(P2.front, P2.pr - 4, P2.Y(H) - 6, "H = average height = " + H.toFixed(2), "lbl b", { "text-anchor": "end" });
      setText(document.getElementById("de-a-H"), H.toFixed(3));
      setText(document.getElementById("de-a-Hbase"), shannonH(base).toFixed(3));
    }
    function slotAt(pt) {
      if (pt.y < P1.pt - 8 || pt.y > P1.pb + 8) return -1;
      const j = Math.round(P1.invX(pt.x)) - 1;
      return j >= 0 && j < order.length && Math.abs(P1.invX(pt.x) - (j + 1)) < 0.45 ? j : -1;
    }
    function dragTo(pt) {
      base = withProb(base, dragK, clamp(P1.invY(pt.y), 0, 1), MIN_P);
      if (preset) preset.value = "custom";
      draw();
    }
    svgPmf.addEventListener("pointerdown", (e) => {
      const j = slotAt(P1.svgPoint(e));
      if (j === -1) return;
      dragK = order[j];
      svgPmf.setPointerCapture(e.pointerId);
      e.preventDefault();
      dragTo(P1.svgPoint(e));
    });
    svgPmf.addEventListener("pointermove", (e) => {
      const pt = P1.svgPoint(e);
      if (dragK !== -1) dragTo(pt);
      else svgPmf.style.cursor = slotAt(pt) === -1 ? "" : "ns-resize";
    });
    const end = () => {
      if (dragK !== -1) {
        dragK = -1;
        draw();
      }
    };
    svgPmf.addEventListener("pointerup", end);
    svgPmf.addEventListener("pointercancel", end);
    slider.addEventListener("input", draw);
    preset?.addEventListener("change", () => {
      if (PRESETS[preset.value]) {
        base = normalize(PRESETS[preset.value]);
        draw();
      }
    });
    const unshuffle = document.getElementById("de-a-unshuffle");
    const setOrder = (next) => {
      next.forEach((k, j) => {
        order[j] = k;
      });
      if (unshuffle) unshuffle.disabled = order.every((k, j) => k === j);
      draw();
    };
    document.getElementById("de-a-shuffle")?.addEventListener("click", () => {
      const next = order.slice();
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      setOrder(next);
    });
    unshuffle?.addEventListener("click", () => setOrder(order.map((_, j) => j)));
    draw();
  }

  // src/differential-entropy/density-edit.js
  var HIT_R = 16;
  var GRIP_PAD = 9;
  var MIN_Y = 1e-3;
  var CURSOR = { peak: "grab", break: "ew-resize", level: "ns-resize" };
  function createDensityEditor(P, opts) {
    let dots = [];
    let drag = null;
    const same = (a, b) => a && b && a.type === b.type && a.i === b.i && a.j === b.j;
    const editor = {
      get dragging() {
        return drag !== null;
      },
      // Draw the handles for distribution d (the current shape's dist).
      draw(d) {
        const shape = opts.getShape();
        dots = [];
        if (shape.kind === "steps") {
          if (shape.ms.length > 1) {
            d.hs.forEach((ht, i) => {
              const y = Math.min(ht, P.y1);
              const cls = "grip" + (same(drag?.h, { type: "level", i }) ? " active" : "");
              P.line(shape.ts[i], y, shape.ts[i + 1], y, cls, P.front);
            });
          }
          shape.ts.forEach((t, j) => dots.push({ type: "break", j, x: t, y: 0 }));
        } else {
          shape.comps.forEach((c, i) => dots.push({ type: "peak", i, x: c.m, y: Math.min(d.pdf(c.m), P.y1) }));
        }
        for (const h of dots) {
          const cls = "handle " + (h.type === "break" ? "handle-break" : "grab") + (same(drag?.h, h) ? " active" : "");
          el("circle", { cx: P.X(h.x), cy: P.Y(h.y), r: h.type === "break" ? 5.5 : 7, class: cls }, P.front);
        }
      }
    };
    function hit(pt) {
      let best = null, bestD = HIT_R;
      for (const h of dots) {
        const dd = Math.hypot(pt.x - P.X(h.x), pt.y - P.Y(h.y));
        if (dd < bestD) {
          bestD = dd;
          best = h;
        }
      }
      if (best) return best;
      const shape = opts.getShape();
      if (shape.kind !== "steps" || shape.ms.length < 2) return null;
      const x = P.invX(pt.x);
      const i = shape.ts.findIndex((t, k) => k < shape.ms.length && x >= t && x <= shape.ts[k + 1]);
      if (i === -1) return null;
      const top = P.Y(Math.min(shape.ms[i] / (shape.ts[i + 1] - shape.ts[i]), P.y1));
      if (pt.y < top - GRIP_PAD || pt.y > P.pb) return null;
      return { type: "level", i, x, y: P.invY(top) };
    }
    const fx = (f, px) => f.x0 + (px - f.pl) / (f.pr - f.pl) * (f.x1 - f.x0);
    const fy = (f, py) => f.y0 + (f.pb - py) / (f.pb - f.pt) * (f.y1 - f.y0);
    function move(pt) {
      const f = drag.f, span = f.x1 - f.x0, shape = opts.getShape();
      const x = clamp(fx(f, pt.x - drag.dx), f.x0 - span, f.x1 + span);
      const y = Math.max(fy(f, pt.y - drag.dy), MIN_Y);
      const h = drag.h;
      if (h.type === "break") opts.setShape(setBreak(shape, h.j, x));
      else if (h.type === "level") opts.setShape(setLevel(shape, h.i, y));
      else opts.setShape({ kind: "mix", comps: setPeak(shape.comps, h.i, x, y) });
    }
    const svg = P.svg;
    svg.addEventListener("pointerdown", (e) => {
      const pt = P.svgPoint(e);
      const h = hit(pt);
      if (!h) return;
      const { x0, x1, y0, y1, pl, pr, pt: top, pb } = P;
      const off = h.type === "level" ? { dx: 0, dy: 0 } : { dx: pt.x - P.X(h.x), dy: pt.y - P.Y(h.y) };
      drag = { h, ...off, f: { x0, x1, y0, y1, pl, pr, pt: top, pb } };
      svg.setPointerCapture(e.pointerId);
      if (h.type === "peak") svg.style.cursor = "grabbing";
      e.preventDefault();
      if (h.type === "level") move(pt);
    });
    svg.addEventListener("pointermove", (e) => {
      const pt = P.svgPoint(e);
      if (drag) {
        move(pt);
        return;
      }
      const h = hit(pt);
      svg.style.cursor = h ? CURSOR[h.type] : "";
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      svg.style.cursor = "";
      opts.onEnd?.();
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    return editor;
  }

  // src/differential-entropy/shape-controls.js
  function bindShapeControls(opts) {
    const { slider, label, famGroup } = opts;
    let sliding = false;
    slider.addEventListener("input", () => {
      sliding = true;
      opts.set(rescaleShape(opts.get(), 2 ** +slider.value));
      sliding = false;
    });
    segButtons(famGroup, (name) => {
      opts.set(familyShape(name, shapeMoments(opts.get()).sd));
    });
    return {
      sync() {
        const { sd } = shapeMoments(opts.get());
        if (label) label.textContent = powLabel(sd);
        if (!sliding) slider.value = String(clamp(log2(sd), +slider.min, +slider.max));
      }
    };
  }
  function shapeWindow(shape, d, yFloor) {
    const { mean, sd } = shapeMoments(shape);
    let x0 = mean - 4.2 * sd, x1 = mean + 4.2 * sd;
    if (shape.kind === "mix") {
      for (const c of shape.comps) {
        x0 = Math.min(x0, c.m - 4 * c.s);
        x1 = Math.max(x1, c.m + 4 * c.s);
      }
    } else {
      const a = shape.ts[0], b = shape.ts[shape.ts.length - 1], pad = 0.15 * (b - a);
      x0 = Math.min(x0, a - pad);
      x1 = Math.max(x1, b + pad);
    }
    return { x0, x1, y1: Math.max(yFloor, d.peak * 1.12) };
  }
  function growWindow(win, shape, d) {
    if (d.peak > 0.92 * win.y1) win.y1 = d.peak * 1.15;
    const span = win.x1 - win.x0, edge = 0.04 * span;
    const xs = shape.kind === "steps" ? shape.ts : shape.comps.map((c) => c.m);
    if (Math.min(...xs) < win.x0 + edge) win.x0 -= 0.1 * span;
    if (Math.max(...xs) > win.x1 - edge) win.x1 += 0.1 * span;
  }

  // src/differential-entropy/fig-density.js
  function initDensity() {
    const svgPdf = document.getElementById("de-b-pdf");
    const svgArea = document.getElementById("de-b-area");
    const slider = document.getElementById("de-b-sd");
    if (!svgPdf || !svgArea || !slider) return;
    const P1 = new Plot(svgPdf, { w: 520, h: 320 });
    const P2 = new Plot(svgArea, { w: 520, h: 320 });
    let shape = familyShape("gauss", 2 ** +slider.value);
    let win = null;
    const controls = bindShapeControls({
      slider,
      label: document.getElementById("de-b-sdv"),
      famGroup: document.getElementById("de-b-fam"),
      get: () => shape,
      set: (s) => {
        shape = s;
        draw();
      }
    });
    const editor = createDensityEditor(P1, {
      getShape: () => shape,
      setShape: (s) => {
        shape = s;
        draw();
      },
      onEnd: () => draw()
    });
    function draw() {
      const d = shapeDist(shape);
      const { mean } = shapeMoments(shape);
      if (!editor.dragging || !win) win = shapeWindow(shape, d, 1.35);
      else growWindow(win, shape, d);
      controls.sync();
      P1.domain(win.x0, win.x1, 0, win.y1);
      P1.axes({ nx: 6, ny: 5, xlabel: "x", ylabel: "f(x)" });
      const pts = densityPts(d, win.x0, win.x1, 600);
      P1.area(pts, "fm");
      let pneg = 0;
      if (d.kind === "steps") {
        d.hs.forEach((ht, i) => {
          if (ht > 1) {
            P1.rect(d.ts[i], 0, d.ts[i + 1], ht, "fn");
            pneg += d.ms[i];
          }
        });
      } else {
        let seg = [], start = null;
        const flush = (end) => {
          if (seg.length > 1) {
            P1.area(seg, "fn");
            pneg += d.cdf(end) - d.cdf(start);
          }
          seg = [];
          start = null;
        };
        for (const pt of pts) {
          if (pt[1] > 1) {
            if (start === null) start = pt[0];
            seg.push(pt);
          } else if (start !== null) flush(pt[0]);
        }
        if (start !== null) flush(win.x1);
      }
      P1.path(pts, "curve");
      P1.hline(1, "ref");
      txt(P1.front, P1.pr - 4, P1.Y(1) - 6, "f = 1", "lbl soft", { "text-anchor": "end" });
      const eff = 2 ** d.h;
      P1.rect(mean - eff / 2, 0, mean + eff / 2, 1 / eff, "eqbox");
      editor.draw(d);
      P2.domain(0, 1, -5, 9);
      P2.axes({
        xticks: [0, 0.25, 0.5, 0.75, 1],
        yticks: [-4, -2, 0, 2, 4, 6, 8],
        xlabel: "cumulative probability u = F(x)",
        ylabel: "\u2212log\u2082 f(x)"
      });
      let mp;
      if (d.kind === "steps") {
        mp = [];
        let u = 0;
        d.ms.forEach((m, i) => {
          const v = -log2(d.hs[i]);
          mp.push([u, v], [u + m, v]);
          u += m;
        });
      } else {
        mp = [];
        for (const x of sampleXs(d.comps, d.lo, d.hi, 1200)) {
          const f = d.pdf(x);
          if (f > 1e-300) mp.push([d.cdf(x), -log2(f)]);
        }
      }
      P2.area(mp, "fm", P2.gAbove());
      P2.area(mp, "fn", P2.gBelow());
      P2.path(mp, "curve");
      P2.hline(d.h, "hmark");
      const lblY = d.h > 7.5 ? P2.Y(d.h) + 16 : P2.Y(d.h) - 7;
      txt(P2.front, P2.pr - 4, lblY, "h = net area = " + fmt(d.h), "lbl b", { "text-anchor": "end" });
      setSigned(document.getElementById("de-b-h"), d.h, 3);
      setText(document.getElementById("de-b-peak"), d.peak.toFixed(2));
      setText(document.getElementById("de-b-pneg"), pneg.toFixed(2));
      setText(document.getElementById("de-b-eff"), String(+eff.toPrecision(3)));
    }
    draw();
  }

  // src/differential-entropy/fig-quantize.js
  var T_MIN = -3;
  var T_MAX = 12;
  function deltaLabel(t) {
    if (Math.abs(t - Math.round(t)) < 1e-9) {
      const k = Math.round(t);
      return k > 0 ? "1/" + 2 ** k : String(2 ** -k);
    }
    const D = 2 ** -t;
    return D < 0.01 ? D.toExponential(2) : String(+D.toPrecision(3));
  }
  function initQuantize() {
    const svgCurve = document.getElementById("de-c-curve");
    const svgPdf = document.getElementById("de-c-pdf");
    const sS = document.getElementById("de-c-sd");
    const sD = document.getElementById("de-c-d");
    if (!svgCurve || !svgPdf || !sS || !sD) return;
    const P1 = new Plot(svgCurve, { w: 600, h: 380, m: { l: 48, r: 16, t: 14, b: 42 } });
    const P2 = new Plot(svgPdf, { w: 440, h: 380, m: { l: 44, r: 12, t: 14, b: 42 } });
    let shape = familyShape("gauss", 2 ** +sS.value);
    let win = null;
    let cacheKey = "", curve = null;
    const controls = bindShapeControls({
      slider: sS,
      label: document.getElementById("de-c-sdv"),
      famGroup: document.getElementById("de-c-fam"),
      get: () => shape,
      set: (s) => {
        shape = s;
        draw();
      }
    });
    const editor = createDensityEditor(P2, {
      getShape: () => shape,
      setShape: (s) => {
        shape = s;
        draw();
      },
      onEnd: () => draw()
    });
    function draw() {
      const t = +sD.value, D = 2 ** -t;
      setText(document.getElementById("de-c-dv"), deltaLabel(t));
      const d = shapeDist(shape);
      controls.sync();
      const key = JSON.stringify(shape) + (editor.dragging ? "|drag" : "");
      if (key !== cacheKey) {
        cacheKey = key;
        curve = [];
        const step = editor.dragging ? 0.25 : 0.0625;
        for (let tt = T_MIN; tt <= T_MAX + 1e-4; tt += step) {
          const DD = 2 ** -tt;
          curve.push([tt, DD < d.minScale / 64 ? d.h + tt : quantH(d, DD)]);
        }
      }
      const Hq = quantH(d, D);
      P1.domain(T_MIN, T_MAX, -7, 16);
      P1.axes({
        xticks: [-3, -2, -1, 0, 2, 4, 6, 8, 10, 12],
        yticks: [-6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16],
        xlabel: "log\u2082(1/\u0394)   (finer bins \u2192)",
        ylabel: "bits"
      });
      P1.rect(T_MIN, -7, T_MAX, 0, "negzone");
      txt(P1.data, P1.X(11.8), P1.Y(-6.3), "no discrete entropy is ever down here", "lbl neg", { "text-anchor": "end" });
      P1.path(curve, "qcurve");
      P1.path([[T_MIN, d.h + T_MIN], [T_MAX, d.h + T_MAX]], "asym");
      const yA = d.h + t;
      if (Math.abs(Hq - yA) > 0.02) P1.line(t, yA, t, Hq, "gap");
      P1.circle(0, d.h, 5.5, "ptm", P1.front);
      if (d.h < 0) txt(P1.front, P1.X(0) + 9, P1.Y(d.h) + 17, "h(X) = " + fmt(d.h), "lbl mass b", {});
      else txt(P1.front, P1.X(0) - 9, P1.Y(d.h) + (d.h > 13 ? 18 : -9), "h(X) = " + fmt(d.h), "lbl mass b", { "text-anchor": "end" });
      P1.circle(t, Hq, 6, "pt", P1.front);
      const anchorEnd = t > 6;
      const hl = txt(
        P1.front,
        P1.X(t) + (anchorEnd ? -10 : 10),
        P1.Y(Hq) + (Hq > yA ? -10 : 16),
        "H(X",
        "lbl atom b",
        { "text-anchor": anchorEnd ? "end" : "start" }
      );
      el("tspan", { "baseline-shift": "sub", "font-size": "9" }, hl).textContent = "\u0394";
      el("tspan", null, hl).textContent = ") = " + Hq.toFixed(2);
      const yEnd = d.h + 11.9;
      txt(P1.front, P1.X(11.9), P1.Y(Math.min(15.2, yEnd)) + (yEnd > 15.2 ? 14 : -8), "h(X) + log\u2082(1/\u0394)", "lbl mass", { "text-anchor": "end" });
      if (!editor.dragging || !win) {
        win = shapeWindow(shape, d, 1.2);
        const { mean } = shapeMoments(shape), half = Math.max((win.x1 - win.x0) / 2, 0.75 * D);
        win.x0 = Math.min(win.x0, mean - half);
        win.x1 = Math.max(win.x1, mean + half);
      } else growWindow(win, shape, d);
      const [k0, k1] = binRange(d, D);
      const kv0 = Math.max(k0, Math.floor(win.x0 / D - 1)), kv1 = Math.min(k1, Math.ceil(win.x1 / D + 1));
      const drawBars = kv1 - kv0 <= 360;
      let barMax = 0;
      const bars = [];
      if (drawBars) for (let k = kv0; k <= kv1; k++) {
        const hgt = d.mass((k - 0.5) * D, (k + 0.5) * D) / D;
        bars.push([k, hgt]);
        barMax = Math.max(barMax, hgt);
      }
      if (!editor.dragging) win.y1 = Math.max(win.y1, barMax * 1.05);
      P2.domain(win.x0, win.x1, 0, win.y1);
      P2.axes({ nx: 5, ny: 5, xlabel: "x", ylabel: "density" });
      for (const [k, hgt] of bars) if (hgt > 0) P2.rect((k - 0.5) * D, 0, (k + 0.5) * D, hgt, "bar");
      const pts = densityPts(d, win.x0, win.x1, 500);
      P2.area(pts, "fm");
      P2.path(pts, "curve");
      P2.hline(1, "ref");
      editor.draw(d);
      if (!drawBars) txt(P2.front, P2.pl + 8, P2.pt + 16, "bins are finer than the plot can show", "lbl soft", {});
      setText(document.getElementById("de-c-H"), Hq.toFixed(3));
      setText(document.getElementById("de-c-L"), fmt(t, 2));
      setSigned(document.getElementById("de-c-diff"), Hq - t, 3);
      setSigned(document.getElementById("de-c-h"), d.h, 3);
    }
    sD.addEventListener("input", draw);
    draw();
  }

  // src/differential-entropy/fig-stretch.js
  var XS = [-0.75, -0.3, 0.1, 0.45, 0.8];
  var PS = [0.15, 0.3, 0.25, 0.2, 0.1];
  function initStretch() {
    const svgDisc = document.getElementById("de-d-disc");
    const svgCont = document.getElementById("de-d-cont");
    const slider = document.getElementById("de-d-a");
    if (!svgDisc || !svgCont || !slider) return;
    const Hd = shannonH(PS);
    const base = family("bimodal", 0.5);
    const q25 = quantile(base, 0.25), q75 = quantile(base, 0.75);
    const P1 = new Plot(svgDisc, { w: 520, h: 300 });
    const P2 = new Plot(svgCont, { w: 520, h: 300 });
    function draw() {
      const la = +slider.value, a = 2 ** la;
      setText(document.getElementById("de-d-av"), a >= 1 ? String(+a.toPrecision(3)) : Math.abs(la - Math.round(la)) < 1e-9 ? "1/" + 2 ** -Math.round(la) : a.toPrecision(2));
      const moved = Math.abs(a - 1) > 1e-6;
      P1.domain(-7, 7, 0, 0.42);
      P1.axes({ xticks: [-6, -4, -2, 0, 2, 4, 6], yticks: [0, 0.1, 0.2, 0.3, 0.4], xlabel: "a\xB7x", ylabel: "p" });
      XS.forEach((x, i) => {
        if (moved) {
          P1.line(x, 0, x, PS[i], "stem ghost");
          P1.circle(x, PS[i], 3.5, "dot ghost");
        }
        P1.line(a * x, 0, a * x, PS[i], "stem");
        P1.circle(a * x, PS[i], 4.5, "dot");
      });
      txt(P1.front, P1.pr - 4, P1.pt + 14, "heights unchanged: H = " + Hd.toFixed(2) + " bits", "lbl atom b", { "text-anchor": "end" });
      const ymax = 3.2;
      P2.domain(-7, 7, 0, ymax);
      P2.axes({ xticks: [-6, -4, -2, 0, 2, 4, 6], yticks: [0, 1, 2, 3], xlabel: "y = a x", ylabel: "f(y)" });
      const fy = (y) => base.pdf(y / a) / a;
      const N = 900, pts = [], band = [], ghost = [];
      for (let i = 0; i <= N; i++) {
        const y = -7 + 14 * i / N, v = fy(y);
        pts.push([y, v]);
        ghost.push([y, base.pdf(y)]);
        if (y >= a * q25 && y <= a * q75) band.push([y, v]);
      }
      P2.area(pts, "fm");
      P2.area([[a * q25, fy(a * q25)], ...band, [a * q75, fy(a * q75)]], "band");
      if (moved) P2.path(ghost, "curve ghost");
      P2.path(pts, "curve");
      P2.hline(1, "ref");
      const hY = base.h + la, eff = 2 ** hY;
      P2.rect(-eff / 2, 0, eff / 2, 1 / eff, "eqbox");
      const pk = base.peak / a;
      if (pk > ymax) txt(P2.front, P2.X(0), P2.pt + 12, "peak " + pk.toFixed(1) + " (off the chart)", "lbl soft", { "text-anchor": "middle" });
      txt(P2.front, P2.pr - 4, P2.pt + (pk > ymax ? 28 : 14), "ochre area = 0.5 at every a", "lbl atom", { "text-anchor": "end" });
      setText(document.getElementById("de-d-H"), Hd.toFixed(3));
      setText(document.getElementById("de-d-hx"), fmt(base.h, 3));
      setText(document.getElementById("de-d-la"), (la >= 0 ? "+ " : MINUS + " ") + Math.abs(la).toFixed(2));
      setSigned(document.getElementById("de-d-h"), hY, 3);
    }
    slider.addEventListener("input", draw);
    draw();
  }

  // src/lib/prng.js
  function createPRNG(seed) {
    seed = seed | 0 || 1;
    const state = [
      seed,
      seed * 2654435761 | 0,
      seed * 16777619 | 0,
      seed * 2246822519 | 0
    ];
    for (let i = 0; i < 20; i++) next();
    function next() {
      let t = state[3];
      t ^= t << 11;
      t ^= t >>> 8;
      state[3] = state[2];
      state[2] = state[1];
      state[1] = state[0];
      t ^= state[0];
      t ^= state[0] >>> 19;
      state[0] = t;
      return (t >>> 0) / 4294967296;
    }
    return { random: next };
  }

  // src/differential-entropy/fig-mi.js
  var N_SAMPLES = 500;
  function normalPairs(n, seed) {
    const { random } = createPRNG(seed);
    const Z = [];
    for (let i = 0; i < n; i++) {
      const u1 = Math.max(random(), 1e-12), u2 = random(), r = Math.sqrt(-2 * Math.log(u1));
      Z.push([r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)]);
    }
    return Z;
  }
  function initMI() {
    const svgSc = document.getElementById("de-e-sc");
    const svgBars = document.getElementById("de-e-bars");
    const sR = document.getElementById("de-e-rho");
    const sA = document.getElementById("de-e-a");
    if (!svgSc || !svgBars || !sR || !sA) return;
    const Z = normalPairs(N_SAMPLES, 20260928);
    const P1 = new Plot(svgSc, { w: 520, h: 320 });
    const P2 = new Plot(svgBars, { w: 520, h: 320, m: { l: 44, r: 14, t: 14, b: 44 } });
    const K = 0.5 * log2(2 * Math.PI * Math.E);
    function draw() {
      const rho = +sR.value, la = +sA.value, a = 2 ** la;
      setText(document.getElementById("de-e-rhov"), rho.toFixed(3).replace(/0$/, ""));
      setText(document.getElementById("de-e-av"), String(+a.toPrecision(3)));
      const c = Math.sqrt(1 - rho * rho);
      P1.domain(-9, 9, -3.6, 3.6);
      P1.axes({ xticks: [-8, -4, 0, 4, 8], yticks: [-3, -2, -1, 0, 1, 2, 3], xlabel: "a\xB7X", ylabel: "Y" });
      for (const [z1, z2] of Z) P1.circle(a * (rho * z1 + c * z2), z1, 2.1, "sc");
      const hx = K + la, hxy = K + la + log2(c), I = -log2(c);
      P2.domain(0, 3, -6, 8);
      P2.axes({ xticks: [], yticks: [-6, -4, -2, 0, 2, 4, 6, 8], ylabel: "bits" });
      const bar = (i, v, cls, label) => {
        P2.rect(i + 0.22, 0, i + 0.78, v, cls);
        txt(P2.back, P2.X(i + 0.5), P2.pb + 18, label, "axl", { "text-anchor": "middle" });
        const y = v >= 0 ? P2.Y(Math.min(v, 8)) - 6 : P2.Y(Math.max(v, -6)) + 15;
        txt(P2.front, P2.X(i + 0.5), y, fmt(v), "lbl b", { "text-anchor": "middle" });
      };
      bar(0, hx, hx >= 0 ? "hbar pos" : "hbar neg", "h(aX)");
      bar(1, hxy, hxy >= 0 ? "hbar pos" : "hbar neg", "h(aX | Y)");
      bar(2, I, "hbar mi", "I(aX; Y)");
      const bx = 1.86;
      P2.line(bx, hxy, bx, hx, "brk");
      P2.line(0.78, hx, bx, hx, "ref");
      P2.line(1.78, hxy, bx, hxy, "ref");
      setSigned(document.getElementById("de-e-hx"), hx, 3);
      setSigned(document.getElementById("de-e-hxy"), hxy, 3);
      setText(document.getElementById("de-e-I"), I.toFixed(3));
    }
    sR.addEventListener("input", draw);
    sA.addEventListener("input", draw);
    draw();
  }

  // src/differential-entropy/main.js
  function init() {
    initDiscrete();
    initDensity();
    initQuantize();
    initStretch();
    initMI();
  }

  // src/differential-entropy/index.js
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
