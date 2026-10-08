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
  var BIMODAL = (() => {
    const c = [{ w: 0.62, m: -0.9, s: 0.42 }, { w: 0.38, m: 1.3, s: 0.55 }];
    const mu = c.reduce((t, k) => t + k.w * k.m, 0);
    const v = c.reduce((t, k) => t + k.w * (k.s * k.s + k.m * k.m), 0) - mu * mu;
    const sd = Math.sqrt(v);
    return c.map((k) => ({ w: k.w, m: (k.m - mu) / sd, s: k.s / sd }));
  })();
  function temper(p, beta) {
    if (beta === Infinity) {
      const max = Math.max(...p);
      const q2 = p.map((v) => v === max ? 1 : 0);
      const Z2 = q2.reduce((a, b) => a + b, 0);
      return q2.map((v) => v / Z2);
    }
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
  function withMass(p, i, target, snap) {
    const t = target < snap ? 0 : Math.min(target, 1), rest = 1 - p[i], n = p.length;
    return p.map((v, j) => j === i ? t : rest > 1e-12 ? v * (1 - t) / rest : (1 - t) / (n - 1));
  }
  var S_MIN = 2 ** -7;
  var S_MAX = 16;
  var MIN_WIDTH = 2 ** -6;
  var MIN_MASS = 0.01;
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
  var MIN_W = 0.02;
  function setWeight(comps, i, w) {
    w = clamp(w, MIN_W, 1 - MIN_W);
    const rest = 1 - comps[i].w, scale = rest > 0 ? (1 - w) / rest : 0;
    return comps.map((k, j) => ({ ...k, w: j === i ? w : rest > 0 ? k.w * scale : (1 - w) / (comps.length - 1) }));
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
  function cdfOf(p) {
    const F = [0];
    p.forEach((v, i) => F.push(F[i] + v));
    return F;
  }
  function discCdfAt(F, x) {
    return F[clamp(Math.floor(x + 1e-9), 0, F.length - 1)];
  }
  function discQuantile(F, u) {
    if (u <= 0) return 0;
    const k = F.findIndex((f, i) => i > 0 && f >= u - 1e-12);
    return k === -1 ? F.length - 1 : k;
  }
  function sampleShape(shape) {
    const xs = [], fs = [], Fs = [];
    if (shape.kind === "steps") {
      const { ts, ms } = shape, e = 1e-9;
      let F = 0;
      ms.forEach((m, i) => {
        const w = ts[i + 1] - ts[i], h = m / w;
        for (let j = 0; j <= 40; j++) {
          const x = ts[i] + (j === 0 ? e : j === 40 ? w - e : w * j / 40);
          xs.push(x);
          fs.push(h);
          Fs.push(F + h * (x - ts[i]));
        }
        F += m;
      });
    } else {
      const c = shape.comps, N = 1600;
      const lo = Math.min(...c.map((k) => k.m - 7 * k.s)), hi = Math.max(...c.map((k) => k.m + 7 * k.s));
      for (let i = 0; i <= N; i++) {
        const x = lo + (hi - lo) * i / N;
        let f = 0, F = 0;
        for (const k of c) {
          f += k.w * gPdf(x, k.m, k.s);
          F += k.w * gCdf(x, k.m, k.s);
        }
        xs.push(x);
        fs.push(f);
        Fs.push(F);
      }
    }
    return { xs, fs, Fs, peak: Math.max(...fs) };
  }
  function bisect(arr, v) {
    const n = arr.length;
    if (v <= arr[0]) return { j: 0, t: 0 };
    if (v >= arr[n - 1]) return { j: n - 2, t: 1 };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const m = lo + hi >> 1;
      if (arr[m] <= v) lo = m;
      else hi = m;
    }
    const d = arr[hi] - arr[lo];
    return { j: lo, t: d > 0 ? (v - arr[lo]) / d : 0 };
  }
  var atX = (S, x) => bisect(S.xs, x);
  var atU = (S, u) => bisect(S.Fs, u);
  var lerp = (arr, L) => arr[L.j] + (arr[L.j + 1] - arr[L.j]) * L.t;
  function runningIntegral(Fs, gs) {
    const I = [0];
    for (let i = 1; i < gs.length; i++) I.push(I[i - 1] + (Fs[i] - Fs[i - 1]) * (gs[i] + gs[i - 1]) / 2);
    return I;
  }

  // src/lib/prob/model.js
  var norm = (p) => {
    const Z = p.reduce((a, b) => a + b, 0);
    return p.map((v) => v / Z);
  };
  var SNAP_P = 0.03;
  var DISC_PRESETS = {
    uniform: { label: "uniform", p: norm([1, 1, 1, 1, 1, 1, 1, 1]) },
    zipf: { label: "zipf", p: norm([1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8]) },
    onehot: { label: "one-hot", p: [0, 0, 1, 0, 0, 0, 0, 0] }
  };
  var CONT_PRESETS = {
    gauss: { label: "Gaussian", shape: { kind: "mix", comps: [{ w: 1, m: 0, s: 0.2 }] } },
    bimodal: { label: "Bimodal", shape: { kind: "mix", comps: [{ w: 0.62, m: -0.35, s: 0.13 }, { w: 0.38, m: 0.4, s: 0.2 }] } },
    steps: { label: "Steps", shape: { kind: "steps", ts: [-0.55, -0.3, -0.1, 0.1, 0.3, 0.55], ms: [0.1, 0.28, 0.34, 0.18, 0.1] } },
    uniform: { label: "Uniform", shape: { kind: "steps", ts: [-0.35, 0.35], ms: [1] } }
  };
  function fitWindow(shape, peak) {
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
    return { x0, x1, y1: Math.max(1.1, peak * 1.12) };
  }
  function growWindow(win, shape, peak, S) {
    if (peak > 0.92 * win.y1) win.y1 = peak * 1.15;
    const span = win.x1 - win.x0, edge = 0.04 * span;
    const xs = shape.kind === "steps" ? shape.ts : shape.comps.map((c) => c.m);
    if (Math.min(...xs) < win.x0 + edge) win.x0 -= 0.1 * span;
    if (Math.max(...xs) > win.x1 - edge) win.x1 += 0.1 * span;
    const lo = lerp(S.xs, atU(S, 1e-3)), hi = lerp(S.xs, atU(S, 0.999));
    if (lo < win.x0) win.x0 = lo - 0.05 * span;
    if (hi > win.x1) win.x1 = hi + 0.05 * span;
  }
  function createModel() {
    const subs = [];
    let S = null, win = null, held = false, customP = null;
    const m = {
      kase: "disc",
      discKey: "zipf",
      contKey: "gauss",
      beta: 1,
      p: DISC_PRESETS.zipf.p.slice(),
      shape: structuredClone(CONT_PRESETS.gauss.shape)
    };
    const resample = () => {
      S = sampleShape(m.shape);
      if (held && win) growWindow(win, m.shape, S.peak, S);
      else win = fitWindow(m.shape, S.peak);
    };
    const changed = () => subs.forEach((f) => f());
    resample();
    m.subscribe = (fn) => {
      subs.push(fn);
    };
    m.reset = () => {
      Object.assign(m, { kase: "disc", discKey: "zipf", contKey: "gauss", beta: 1, p: DISC_PRESETS.zipf.p.slice(), shape: structuredClone(CONT_PRESETS.gauss.shape) });
      customP = null;
      held = false;
      win = null;
      resample();
      changed();
    };
    m.setCase = (k) => {
      m.kase = k;
      changed();
    };
    m.setPreset = (key) => {
      if (m.kase === "disc") {
        m.discKey = key;
        if (key !== "custom") m.p = DISC_PRESETS[key].p.slice();
        else if (customP) m.p = customP.slice();
      } else {
        m.contKey = key;
        m.shape = structuredClone(CONT_PRESETS[key].shape);
        resample();
      }
      changed();
    };
    m.editPmf = (i, target) => {
      m.p = withMass(m.p, i, target, SNAP_P);
      customP = m.p.slice();
      m.discKey = "custom";
      changed();
    };
    m.setShape = (shape) => {
      m.shape = shape;
      m.contKey = "custom";
      resample();
      changed();
    };
    m.setBeta = (b) => {
      m.beta = b;
      changed();
    };
    m.hold = (on) => {
      held = on;
    };
    m.view = () => {
      if (m.kase !== "disc") return { disc: false, shape: m.shape, S, win, xRange: [win.x0, win.x1] };
      const plain = m.beta === 1;
      const p = plain ? m.p : temper(m.p, m.beta);
      const v = { disc: true, p, F: cdfOf(p), n: p.length, xRange: [0.5, p.length + 0.5] };
      if (!plain) v.base = m.p;
      return v;
    };
    return m;
  }

  // src/lib/prob/position.js
  function createPosition(model) {
    const pos = { x: 0, u: 0, driver: "x" };
    const fromX = () => {
      const v = model.view(), [a, b] = v.xRange;
      pos.x = clamp(pos.x, a, b);
      if (v.disc) {
        pos.u = discCdfAt(v.F, pos.x);
        return;
      }
      const xs = v.S.xs;
      if (pos.x >= Math.min(b, xs[xs.length - 1]) - 1e-12) {
        pos.u = 1;
        if (v.shape.kind === "mix") pos.x = Infinity;
      } else if (pos.x <= Math.max(a, xs[0]) + 1e-12) pos.u = 0;
      else pos.u = lerp(v.S.Fs, atX(v.S, pos.x));
    };
    const fromU = () => {
      const v = model.view();
      pos.u = clamp(pos.u, 0, 1);
      if (v.disc) {
        const k = discQuantile(v.F, pos.u);
        pos.x = k === 0 ? 0.5 : k;
      } else if (pos.u >= 1 && v.shape.kind === "mix") pos.x = Infinity;
      else pos.x = clamp(lerp(v.S.xs, atU(v.S, pos.u)), v.xRange[0], v.xRange[1]);
    };
    pos.setX = (x) => {
      pos.driver = "x";
      pos.x = x;
      fromX();
    };
    pos.setU = (u) => {
      pos.driver = "u";
      pos.u = u;
      fromU();
    };
    pos.refresh = () => pos.driver === "x" ? fromX() : fromU();
    pos.reset = () => pos.setX(4.1);
    pos.reset();
    return pos;
  }

  // src/lib/prob/region.js
  var NS = "http://www.w3.org/2000/svg";
  var MINUS = "\u2212";
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function rich(t, s) {
    if (!/[_^]/.test(s)) {
      t.textContent = s;
      return;
    }
    const re = /([_^])(\{([^}]*)\}|(.))/g;
    let last = 0, m;
    while (m = re.exec(s)) {
      if (m.index > last) el("tspan", null, t).textContent = s.slice(last, m.index);
      const sc = el("tspan", { "baseline-shift": m[1] === "_" ? "sub" : "super", "font-size": "72%" }, t);
      sc.textContent = m[3] !== void 0 ? m[3] : m[4];
      last = re.lastIndex;
    }
    if (last < s.length) el("tspan", null, t).textContent = s.slice(last);
  }
  function txt(parent, x, y, s, cls, attrs) {
    const t = el("text", Object.assign({ x, y, class: cls }, attrs || {}), parent);
    rich(t, s);
    return t;
  }
  function niceTicks(a, b, n = 5) {
    const span = b - a;
    if (!(span > 0)) return [a];
    const s0 = span / n, mag = 10 ** Math.floor(Math.log10(s0)), r = s0 / mag;
    const st = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9 * st; v += st) out.push(+v.toFixed(10) || 0);
    return out;
  }
  var tf = (v) => Math.abs(v) < 1e-9 ? "0" : String(+v.toPrecision(3)).replace("-", MINUS);
  function svgContext(svg, W, H) {
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.replaceChildren();
    return { svg, defs: el("defs", null, svg), root: el("g", null, svg) };
  }
  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  var uid = 0;
  var Region = class {
    // o: { ox, oy, w, h, m: { l, r, t, b } } in viewBox units
    constructor(ctx, o) {
      this.o = o;
      this.id = "rg" + uid++;
      this.clip = el("rect", null, el("clipPath", { id: this.id }, ctx.defs));
      this.clipA = el("rect", null, el("clipPath", { id: this.id + "a" }, ctx.defs));
      this.clipB = el("rect", null, el("clipPath", { id: this.id + "b" }, ctx.defs));
      this.back = el("g", null, ctx.root);
      this.data = el("g", { "clip-path": `url(#${this.id})` }, ctx.root);
      this.front = el("g", null, ctx.root);
    }
    // Set the data window and clear the layers; call at the top of each redraw.
    domain(x0, x1, y0, y1) {
      Object.assign(this, { x0, x1, y0, y1 });
      const { ox, oy, w, h, m } = this.o;
      this.pl = ox + m.l;
      this.pr = ox + w - m.r;
      this.pt = oy + m.t;
      this.pb = oy + h - m.b;
      const set = (r, x, y, ww, hh) => {
        r.setAttribute("x", x);
        r.setAttribute("y", y);
        r.setAttribute("width", Math.max(0, ww));
        r.setAttribute("height", Math.max(0, hh));
      };
      set(this.clip, this.pl, this.pt - 1, this.pr - this.pl, this.pb - this.pt + 2);
      const yz = this.Y(clamp(0, Math.min(y0, y1), Math.max(y0, y1)));
      set(this.clipA, this.pl, this.pt - 1, this.pr - this.pl, yz - this.pt + 1);
      set(this.clipB, this.pl, yz, this.pr - this.pl, this.pb - yz + 1);
      this.clear();
      return this;
    }
    clear() {
      this.back.replaceChildren();
      this.data.replaceChildren();
      this.front.replaceChildren();
    }
    X(x) {
      return this.pl + (x - this.x0) / (this.x1 - this.x0) * (this.pr - this.pl);
    }
    Y(y) {
      const s = this.y1 - this.y0;
      y = clamp(y, this.y0 - 2 * s, this.y1 + 2 * s);
      return this.pb - (y - this.y0) / s * (this.pb - this.pt);
    }
    invX(px) {
      return this.x0 + (px - this.pl) / (this.pr - this.pl) * (this.x1 - this.x0);
    }
    invY(py) {
      return this.y0 + (this.pb - py) / (this.pb - this.pt) * (this.y1 - this.y0);
    }
    inX(x) {
      return x >= Math.min(this.x0, this.x1) && x <= Math.max(this.x0, this.x1);
    }
    inY(y) {
      return y >= this.y0 && y <= this.y1;
    }
    contains(p, pad = 0) {
      return p.x >= this.pl - pad && p.x <= this.pr + pad && p.y >= this.pt - pad && p.y <= this.pb + pad;
    }
    // o: { xticks, yticks, xfmt, xnow, noyl, noZero }; axis labels are math, set by the figure's math layer
    axes(o = {}) {
      const g = this.back;
      const nx = Math.max(2, Math.min(6, Math.round(Math.abs(this.pr - this.pl) / 70)));
      const xt = o.xticks || niceTicks(this.x0, this.x1, nx), yt = o.yticks || niceTicks(this.y0, this.y1, 4);
      for (const v of xt) {
        const x = this.X(v);
        if (x < Math.min(this.pl, this.pr) - 0.5 || x > Math.max(this.pl, this.pr) + 0.5) continue;
        el("line", { x1: x, x2: x, y1: this.pt, y2: this.pb, class: "gl" }, g);
        txt(g, x, this.pb + 14, o.xfmt ? o.xfmt(v) : tf(v), "tk" + (o.xnow === v ? " now" : ""), { "text-anchor": "middle" });
      }
      for (const v of yt) {
        const y = this.Y(v);
        if (y < this.pt - 0.5 || y > this.pb + 0.5) continue;
        el("line", { x1: this.pl, x2: this.pr, y1: y, y2: y, class: "gl" }, g);
        if (!o.noyl) txt(g, this.pl - 6, y + 3.5, tf(v), "tk", { "text-anchor": "end" });
      }
      el("line", { x1: this.pl, x2: this.pr, y1: this.pb, y2: this.pb, class: "ax" }, g);
      el("line", { x1: this.pl, x2: this.pl, y1: this.pt, y2: this.pb, class: "ax" }, g);
      if (!o.noZero && this.y0 < 0 && this.y1 > 0) el("line", { x1: this.pl, x2: this.pr, y1: this.Y(0), y2: this.Y(0), class: "ax0" }, g);
    }
    d(pts) {
      let s = "";
      pts.forEach((p, i) => {
        s += (i ? "L" : "M") + this.X(p[0]).toFixed(1) + " " + this.Y(p[1]).toFixed(1);
      });
      return s;
    }
    path(pts, cls, g) {
      return pts.length ? el("path", { d: this.d(pts), class: cls }, g || this.data) : null;
    }
    // Filled region between the polyline and y = 0.
    area(pts, cls, g) {
      if (!pts.length) return null;
      const yb = this.Y(clamp(0, this.y0, this.y1)).toFixed(1);
      let s = `M${this.X(pts[0][0]).toFixed(1)} ${yb}`;
      for (const p of pts) s += `L${this.X(p[0]).toFixed(1)} ${this.Y(p[1]).toFixed(1)}`;
      s += `L${this.X(pts[pts.length - 1][0]).toFixed(1)} ${yb}Z`;
      return el("path", { d: s, class: cls }, g || this.data);
    }
    rect(xa, ya, xb, yb, cls, g) {
      const X0 = Math.min(this.X(xa), this.X(xb)), X1 = Math.max(this.X(xa), this.X(xb));
      const Y0 = this.Y(Math.max(ya, yb)), Y1 = this.Y(Math.min(ya, yb));
      return el("rect", {
        x: X0.toFixed(1),
        y: Y0.toFixed(1),
        width: Math.max(0, X1 - X0).toFixed(1),
        height: Math.max(0, Y1 - Y0).toFixed(1),
        class: cls
      }, g || this.data);
    }
    // (nothing for an x or y off at infinity, such as x = F_X⁻¹(1) for an unbounded support)
    vline(x, cls, g) {
      if (!Number.isFinite(x)) return null;
      return el("line", { x1: this.X(x), x2: this.X(x), y1: this.pt, y2: this.pb, class: cls }, g || this.data);
    }
    hline(y, cls, g) {
      if (!Number.isFinite(y)) return null;
      return el("line", { x1: this.pl, x2: this.pr, y1: this.Y(y), y2: this.Y(y), class: cls }, g || this.data);
    }
    // Anchor points for axis labels (placed by the math layer).
    xlabelAt() {
      return [(this.pl + this.pr) / 2, this.pb + 30];
    }
    ylabelAt() {
      return [this.o.ox + 12, (this.pt + this.pb) / 2];
    }
    // Groups clipped to the part of the plot above / below y = 0.
    gAbove() {
      return el("g", { "clip-path": `url(#${this.id}a)` }, this.data);
    }
    gBelow() {
      return el("g", { "clip-path": `url(#${this.id}b)` }, this.data);
    }
  };

  // src/lib/prob/edit.js
  var HIT_R = 14;
  var GRIP_PAD = 9;
  var MIN_D = 1e-3;
  function regionAdapter(R, rotated) {
    const frameOf = () => ({ x0: R.x0, x1: R.x1, y0: R.y0, y1: R.y1, pl: R.pl, pr: R.pr, pt: R.pt, pb: R.pb });
    const hx = (f, px) => f.x0 + (px - f.pl) / (f.pr - f.pl) * (f.x1 - f.x0);
    const vy = (f, py) => f.y0 + (f.pb - py) / (f.pb - f.pt) * (f.y1 - f.y0);
    return {
      rotated,
      toScreen: (x, d) => rotated ? [R.X(d), R.Y(x)] : [R.X(x), R.Y(d)],
      // pixel -> (x, density) through a frame (the current one, or one taken at grab time)
      frame: frameOf,
      fromScreen: (f, px, py) => rotated ? [vy(f, py), hx(f, px)] : [hx(f, px), vy(f, py)],
      // the x-range of a frame, whichever axis x is on
      xSpan: (f) => rotated ? [f.y0, f.y1] : [f.x0, f.x1],
      dTop: () => rotated ? R.x1 : R.y1,
      // screen coordinate that grows with density, for "past the top" tests
      densPx: (pt) => rotated ? pt.x : -pt.y,
      contains: (pt, pad) => R.contains(pt, pad)
    };
  }
  var mixPdf = (comps, x) => comps.reduce((t, c) => t + c.w * gPdf(x, c.m, c.s), 0);
  function createEditor({ model, adapter, visible = () => true, onHold }) {
    let drag = null;
    function handles() {
      const v = model.view(), top = adapter.dTop();
      if (v.disc) return (v.base ?? v.p).map((d, i) => ({ type: "atom", i, x: i + 1, d: Math.min(d, top) })).filter((h) => visible(h.i));
      const s = v.shape;
      if (s.kind === "steps") return s.ts.map((t, j) => ({ type: "break", j, x: t, d: 0 }));
      return s.comps.map((c, i) => ({ type: "peak", i, x: c.m, d: Math.min(mixPdf(s.comps, c.m), top) }));
    }
    function hit(pt) {
      if (!adapter.contains(pt, 8)) return null;
      let best = null, bestD = HIT_R;
      for (const h2 of handles()) {
        const [px, py] = adapter.toScreen(h2.x, h2.d);
        const dd = Math.hypot(pt.x - px, pt.y - py);
        if (dd < bestD) {
          bestD = dd;
          best = h2;
        }
      }
      if (best) return best;
      const v = model.view();
      if (v.disc || v.shape.kind !== "steps" || v.shape.ms.length < 2) return null;
      const s = v.shape, [x, d] = adapter.fromScreen(adapter.frame(), pt.x, pt.y);
      const i = s.ts.findIndex((t, k) => k < s.ms.length && x >= t && x <= s.ts[k + 1]);
      if (i === -1 || d < 0) return null;
      const h = Math.min(s.ms[i] / (s.ts[i + 1] - s.ts[i]), adapter.dTop());
      const [tx, ty] = adapter.toScreen(x, h);
      if (Math.abs(adapter.densPx(pt) - adapter.densPx({ x: tx, y: ty })) > GRIP_PAD) return null;
      return { type: "level", i, x, d: h };
    }
    function cursorFor(h) {
      if (!h) return "";
      if (h.type === "peak") return drag ? "grabbing" : "grab";
      const alongX = h.type === "break";
      return alongX !== adapter.rotated ? "ew-resize" : "ns-resize";
    }
    function begin(h, pt) {
      const [px, py] = adapter.toScreen(h.x, h.d);
      const off = h.type === "level" ? { dx: 0, dy: 0 } : { dx: pt.x - px, dy: pt.y - py };
      drag = { h, ...off, f: adapter.frame() };
      if (!model.view().disc) {
        model.hold(true);
        onHold?.(true);
      }
      if (h.type === "level") move(pt);
    }
    function move(pt) {
      if (!drag) return;
      const h = drag.h;
      const [x, d] = adapter.fromScreen(drag.f, pt.x - drag.dx, pt.y - drag.dy);
      if (h.type === "atom") {
        model.editPmf(h.i, clamp(d, 0, 1));
        return;
      }
      const s = model.view().shape, [lo, hi] = adapter.xSpan(drag.f), span = hi - lo;
      const xc = clamp(x, lo - span, hi + span), dc = Math.max(d, MIN_D);
      if (h.type === "break") model.setShape(setBreak(s, h.j, xc));
      else if (h.type === "level") model.setShape(setLevel(s, h.i, dc));
      else model.setShape({ kind: "mix", comps: setPeak(s.comps, h.i, xc, dc) });
    }
    function end() {
      if (!drag) return;
      const wasCont = !model.view().disc;
      drag = null;
      if (wasCont) {
        model.hold(false);
        onHold?.(false);
      }
    }
    function draw(g) {
      const v = model.view();
      const active = (h) => drag && drag.h.type === h.type && drag.h.i === h.i && drag.h.j === h.j;
      if (!v.disc && v.shape.kind === "steps" && v.shape.ms.length > 1) {
        const s = v.shape, top = adapter.dTop();
        s.ms.forEach((m, i) => {
          const ht = Math.min(m / (s.ts[i + 1] - s.ts[i]), top);
          const [ax, ay] = adapter.toScreen(s.ts[i], ht), [bx, by] = adapter.toScreen(s.ts[i + 1], ht);
          el("line", { x1: ax, y1: ay, x2: bx, y2: by, class: "grip-hit" }, g);
          el("line", { x1: ax, y1: ay, x2: bx, y2: by, class: "grip" + (active({ type: "level", i }) ? " active" : "") }, g);
        });
      }
      if (v.disc) {
        for (const h of handles()) {
          const [px, py] = adapter.toScreen(h.x, h.d);
          el("circle", { cx: px, cy: py, r: HIT_R, class: "hit" }, g);
        }
        return;
      }
      for (const h of handles()) {
        const [px, py] = adapter.toScreen(h.x, h.d);
        const cls = "handle" + (h.type === "break" ? " handle-break" : "") + (active(h) ? " active" : "");
        el("circle", { cx: px, cy: py, r: h.type === "break" ? 5.5 : 7, class: cls }, g);
      }
    }
    return { hit, begin, move, end, draw, cursorFor, get dragging() {
      return drag !== null;
    } };
  }

  // src/lib/prob/frame.js
  function densityAt(v, x) {
    const s = v.shape;
    if (s.kind === "steps" && (x < s.ts[0] || x > s.ts[s.ts.length - 1])) return 0;
    return lerp(v.S.fs, atX(v.S, x));
  }

  // src/lib/prob/mathlabels.js
  function mathJaxReady() {
    return new Promise((resolve) => {
      const poll = () => window.MathJax?.startup?.promise ? window.MathJax.startup.promise.then(resolve) : setTimeout(poll, 50);
      poll();
    });
  }
  var chain = Promise.resolve();
  function createMathLayer(canvas, W, H) {
    const layer = document.createElement("div");
    layer.className = "ex-math-layer";
    canvas.appendChild(layer);
    const labels = /* @__PURE__ */ new Map();
    let used = /* @__PURE__ */ new Set();
    function render(L, tex) {
      L.want = tex;
      if (L.busy) return;
      L.busy = true;
      const next = document.createElement("span");
      next.className = "ex-ml-body";
      next.style.visibility = "hidden";
      next.textContent = L.text ? tex : `\\(${tex}\\)`;
      L.el.appendChild(next);
      chain = chain.then(mathJaxReady).then(() => window.MathJax.typesetPromise([next])).then(() => {
        for (const old of [...L.el.children]) if (old !== next) {
          window.MathJax.typesetClear?.([old]);
          old.remove();
        }
        next.style.visibility = "";
        L.shown = tex;
      }).catch(() => {
      }).finally(() => {
        L.busy = false;
        if (L.want !== L.shown) render(L, L.want);
      });
    }
    function set(key, x, y, tex, opts = {}) {
      used.add(key);
      let L = labels.get(key);
      if (!L) {
        const el2 = document.createElement("div");
        el2.dataset.key = key;
        layer.appendChild(el2);
        L = { el: el2, want: null, shown: null, busy: false };
        labels.set(key, L);
      }
      const { anchor = "middle", rotate = 0, cls = "", text = false, width = 0, bottom = false } = opts;
      L.text = text;
      L.el.style.width = width ? width / W * 100 + "%" : "";
      const tx = anchor === "start" ? "0" : anchor === "end" ? "-100%" : "-50%";
      L.el.className = "ex-ml" + (cls ? " " + cls : "");
      L.el.style.left = x / W * 100 + "%";
      L.el.style.top = y / H * 100 + "%";
      L.el.style.transformOrigin = anchor === "start" ? "left center" : anchor === "end" ? "right center" : "center";
      L.el.style.transform = `translate(${tx}, ${bottom ? "-100%" : "-50%"})` + (rotate ? ` rotate(${rotate}deg)` : "");
      L.el.hidden = false;
      if (tex !== L.want) render(L, tex);
    }
    return {
      set,
      begin() {
        used = /* @__PURE__ */ new Set();
      },
      // the SVG's viewBox changed size: labels placed from now on use the new one
      resize(w, h) {
        W = w;
        H = h;
      },
      end() {
        for (const [k, L] of labels) if (!used.has(k)) L.el.hidden = true;
      }
    };
  }
  function texNum(v, d = 3) {
    if (!isFinite(v)) return v > 0 ? "\\infty" : "-\\infty";
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && Number(s) !== 0 ? "-" : "") + s;
  }

  // src/lib/prob/fit.js
  var FULL = 1e3;
  var SCALE = 0.64;
  var FLOOR = 460;
  function layoutWidth(cw) {
    return cw >= FULL * SCALE ? FULL : Math.max(FLOOR, Math.round(cw / SCALE));
  }
  function fitWidth(canvas, onWidth) {
    let W = 0;
    const apply = () => {
      const next = layoutWidth(canvas.clientWidth || FULL);
      if (next === W) return;
      W = next;
      canvas.style.setProperty("--ex-k", String(FULL / W));
      onWidth(W);
    };
    new ResizeObserver(apply).observe(canvas);
    apply();
  }

  // src/lib/prob/width.js
  function entropyOf(v) {
    if (v.disc) return v.p.reduce((t, q) => t - (q > 0 ? q * log2(q) : 0), 0);
    return runningIntegral(v.S.Fs, v.S.fs.map((f) => -log2(f))).at(-1);
  }
  var positionsOf = (v) => v.xs ?? v.p.map((_, i) => i + 1);
  function meanOf(v) {
    if (!v.disc) return shapeMoments(v.shape).mean;
    const xs = positionsOf(v);
    return v.p.reduce((t, q, i) => t + q * xs[i], 0);
  }
  function boxOf(v) {
    const H = entropyOf(v), cx = meanOf(v);
    if (!v.disc) return { H, cx, w: 2 ** H, ht: 2 ** -H };
    const xs = positionsOf(v), slot = xs.length > 1 ? xs[1] - xs[0] : 1;
    return { H, cx, w: 2 ** H * slot, ht: 2 ** -H };
  }

  // src/lib/prob/fig-transform.js
  var TW = 1e3;
  var TH = 566;
  var N_LINES = 40;
  var READOUT = 56;
  var val = (x) => {
    const t = texNum(x);
    return t.startsWith("-") ? `\\class{ex-neg}{${t}}` : t;
  };
  var polyline = (g, pts, cls) => el("path", { d: "M" + pts.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join("L"), class: cls, fill: "none" }, g);
  var closed = (g, pts, cls) => el("path", { d: "M" + pts.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join("L") + "Z", class: cls }, g);
  function createTransformFigure(svg, { model, pos, ui, redraw, stopPlay }, { width = false } = {}) {
    const H = width ? TH + READOUT : TH;
    const ctx = svgContext(svg, TW, H);
    const lines = el("g", null, ctx.root);
    const O = {
      U: new Region(ctx, { ox: 0, oy: 0, w: 600, h: 170, m: { l: 58, r: 16, t: 26, b: 26 } }),
      G: new Region(ctx, { ox: 0, oy: 170, w: 600, h: 390, m: { l: 58, r: 16, t: 16, b: 42 } }),
      X: new Region(ctx, { ox: 624, oy: 170, w: 376, h: 390, m: { l: 20, r: 16, t: 16, b: 42 } })
    };
    const handles = el("g", null, ctx.root), over = el("g", null, ctx.root);
    const math = createMathLayer(svg.parentElement, TW, H);
    let drawn = false, layoutW = TW;
    function layout(W) {
      const wl = Math.round(0.6 * W), gap = Math.round(0.024 * W);
      Object.assign(O.U.o, { w: wl });
      Object.assign(O.G.o, { w: wl });
      Object.assign(O.X.o, { ox: wl + gap, w: W - wl - gap });
      layoutW = W;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      math.resize(W, H);
      if (drawn) draw();
    }
    const yLabel = (key, R, tex) => {
      const [x, y] = R.ylabelAt();
      math.set(key, x, y, tex, { rotate: -90 });
    };
    const xLabel = (key, R, tex) => {
      const [x, y] = R.xlabelAt();
      math.set(key, x, y, tex);
    };
    let lastKx = 0;
    const visible = (i) => ui.ghost || i < lastKx;
    const editor = createEditor({ model, adapter: regionAdapter(O.X, true), visible });
    function quant(u) {
      const v = model.view();
      if (v.disc) {
        const k = discQuantile(v.F, u);
        return { x: k, p: v.p[k - 1] };
      }
      const x = lerp(v.S.xs, atU(v.S, u));
      return { x, p: lerp(v.S.fs, atX(v.S, x)) };
    }
    function draw() {
      drawn = true;
      const v = model.view(), disc = v.disc;
      lines.replaceChildren();
      over.replaceChildren();
      handles.replaceChildren();
      const u = pos.u, [xa, xb] = v.xRange;
      const pmax = disc ? 1.05 : v.win.y1;
      const atoms = disc ? v.p.map((_, i) => i + 1) : void 0;
      const onU = (uu, d) => [O.U.X(uu), O.U.Y(d)];
      const onG = (uu, xx) => [O.G.X(uu), O.G.Y(xx)];
      const onX = (xx, d) => [O.X.X(d), O.X.Y(xx)];
      math.begin();
      O.U.domain(0, 1, 0, 1.35);
      O.U.axes({ xticks: [0, 0.25, 0.5, 0.75, 1], yticks: [0, 1] });
      yLabel("u-y", O.U, "p_U(u)");
      O.G.domain(0, 1, xa, xb);
      O.G.axes({ xticks: [0, 0.25, 0.5, 0.75, 1], yticks: atoms, noZero: true });
      yLabel("g-y", O.G, "x = F_X^{-1}(u)");
      xLabel("g-x", O.G, "u");
      O.X.domain(0, pmax, xa, xb);
      O.X.axes({ yticks: atoms, noyl: true, noZero: true });
      xLabel("x-x", O.X, "p_X(x)");
      const Fnow = disc ? discCdfAt(v.F, pos.x) : u;
      const byU = pos.driver === "u";
      const uRect = (u0, u1, cls) => closed(O.U.data, [onU(u0, 0), onU(u0, 1), onU(u1, 1), onU(u1, 0)], cls);
      if (ui.ghost) uRect(0, 1, "fm").setAttribute("opacity", ".35");
      uRect(0, Fnow, "fm");
      polyline(O.U.data, [onU(0, 0), onU(0, 1), onU(1, 1), onU(1, 0)], "curve");
      if (disc) {
        const { p: P, F } = v, n = P.length, kx = clamp(Math.floor(pos.x + 1e-9), 0, n);
        lastKx = kx;
        P.forEach((q, i) => {
          if (q <= 0) {
            const a2 = onX(i + 1, 0);
            el("circle", { cx: a2[0], cy: a2[1], r: 4, class: "pin-null" }, O.X.data);
            return;
          }
          const c = i < kx ? "done" : "todo";
          if (c === "todo" && !ui.ghost) return;
          const a = onX(i + 1, 0), b = onX(i + 1, q);
          el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "stem-" + c }, O.X.data);
          el("circle", { cx: b[0], cy: b[1], r: 4.5, class: "pin-" + c }, O.X.data);
        });
        P.forEach((q, i) => {
          if (i + 1 < n) {
            const a = onG(F[i + 1], i + 1), b = onG(F[i + 1], i + 2);
            el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "jump" }, O.G.data);
          }
        });
        P.forEach((q, i) => {
          if (q <= 0) return;
          const k = i + 1;
          polyline(O.G.data, [onG(F[i], k), onG(F[i + 1], k)], "graphline");
          const o = onG(F[i], k), c = onG(F[i + 1], k);
          el("circle", { cx: o[0], cy: o[1], r: 3.5, class: "odot" }, O.G.front);
          el("circle", { cx: c[0], cy: c[1], r: 3.5, class: "cdot" }, O.G.front);
        });
        const fiberK = byU && kx >= 1 ? kx : 0;
        P.forEach((q, i) => {
          const k = i + 1, a = F[i], b = F[i + 1];
          if (q <= 0) {
            polyline(lines, [onG(b, k), onX(k, 0)], "br-null");
            return;
          }
          const c = k <= kx ? "done" : "todo";
          closed(lines, [onU(a, 0), onG(a, k), onG(b, k), onU(b, 0)], "band-" + c);
          polyline(lines, [onG(b, k), onX(k, 0)], "br-" + c);
        });
        if (byU && fiberK) {
          const g = onG(u, fiberK);
          el("circle", { cx: g[0], cy: g[1], r: 4.5, class: "dot" }, over);
          const c0 = onU(u, 0), c1 = onU(u, 1);
          el("line", { x1: c0[0], y1: c0[1], x2: c1[0], y2: c1[1], class: "cursor" }, over);
        } else if (!byU) {
          polyline(over, [onX(pos.x, 0), onG(Fnow, pos.x), onU(Fnow, 0), onU(Fnow, 1)], "br-cur");
          const g = onG(Fnow, pos.x);
          el("circle", { cx: g[0], cy: g[1], r: 4.5, class: "dot" }, over);
        }
      } else {
        const S = v.S, s = v.shape;
        const pts = S.xs.map((x, i) => [x, S.fs[i], S.Fs[i]]).filter((q) => q[0] >= xa - 0.05 && q[0] <= xb + 0.05);
        const pairs = pts.map((q) => [q[0], q[1]]);
        const edge = s.kind === "steps" ? [[s.ts[0], 0], ...pairs, [s.ts[s.ts.length - 1], 0]] : pairs;
        const shade = (list, cls) => list.length ? closed(O.X.data, [onX(list[0][0], 0), ...list.map((q) => onX(q[0], q[1])), onX(list[list.length - 1][0], 0)], cls) : null;
        if (ui.ghost) shade(edge, "fm")?.setAttribute("opacity", ".35");
        shade(edge.filter((q) => q[0] <= pos.x).concat(Number.isFinite(pos.x) ? [[pos.x, densityAt(v, pos.x)]] : []), "fm");
        polyline(O.X.data, edge.map((q) => onX(q[0], q[1])), "curve");
        polyline(O.G.data, pts.map((q) => onG(q[2], q[0])), "curve");
        const lineThrough = (uu, xx, pp, cls) => polyline(lines, [onU(uu, 0), onG(uu, xx), onX(xx, 0), onX(xx, pp)], cls);
        for (let j = 0; j < N_LINES; j++) {
          const uj = (j + 0.5) / N_LINES, q = quant(uj), done = uj <= u;
          if (!(q.x >= xa && q.x <= xb)) continue;
          if (!done && !ui.ghost) continue;
          lineThrough(uj, q.x, q.p, done ? "br-done" : "br-todo");
        }
        if (u > 0) {
          const q = quant(u);
          if (q.x >= xa && q.x <= xb) {
            lineThrough(u, q.x, q.p, "br-cur");
            const g = onG(u, q.x);
            el("circle", { cx: g[0], cy: g[1], r: 4.5, class: "dot" }, over);
          }
        }
      }
      if (width) {
        const b = boxOf(v), x0 = b.cx - b.w / 2, x1 = b.cx + b.w / 2;
        O.X.rect(0, x0, b.ht, x1, "eqbox");
        el("path", { d: "M" + [onG(0, x0), onG(1, x1)].map((c) => c.join(" ")).join("L"), class: "eqline", "clip-path": `url(#${O.G.id})` }, O.G.data);
        for (const xe of [x0, x1]) {
          if (xe < xa || xe > xb) continue;
          polyline(lines, [onG(1, xe), onX(xe, 0)], "eqguide");
        }
        const bx = O.X.X(Math.min(b.ht, pmax)), by = O.X.Y(b.cx + b.w / 2);
        const fits = bx < O.X.pr - 90;
        math.set(
          "eq",
          fits ? bx + 6 : bx - 6,
          Math.max(by, O.X.pt + 10),
          `2^{${disc ? "H" : "h"}} = ${texNum(b.w, 2)}`,
          { anchor: fits ? "start" : "end", cls: "ex-ml-note" }
        );
        if (u > 0) {
          if (disc) {
            const k = discQuantile(v.F, u);
            if (k >= 1 && v.p[k - 1] > 0) {
              polyline(over, [onG(v.F[k - 1], k), onG(v.F[k], k)], "tread");
              const [mx, my] = onG((v.F[k - 1] + v.F[k]) / 2, k);
              math.set("local", mx, my - 16, `\\text{step width} = p_X(${k}) = ${texNum(v.p[k - 1])}`, { cls: "ex-ml-note" });
            }
          } else {
            const q = quant(u);
            if (q.x >= xa && q.x <= xb) {
              const slope = 1 / q.p, du = 0.06;
              const seg2 = [[u - du, q.x - du * slope], [u + du, q.x + du * slope]].map(([uu, xx]) => onG(uu, xx));
              el("path", { d: "M" + seg2.map((c) => c.join(" ")).join("L"), class: "tangent", "clip-path": `url(#${O.G.id})` }, over);
              const [mx, my] = onG(u, q.x);
              math.set("local", mx + 14, my - 18, `\\tfrac{\\dee x}{\\dee u} = 1/p_X(x) = ${texNum(slope, 2)}`, { anchor: "start", cls: "ex-ml-note" });
            }
          }
        }
        const name = disc ? "H" : "h";
        const integrand = disc ? "\\frac{1}{p_X(F_X^{-1}(u))}" : "\\frac{\\dee x}{\\dee u}";
        math.set(
          "readout",
          layoutW / 2,
          TH + 30,
          `${name}(X) = \\int_0^1 \\log ${integrand}\\,\\dee u = ${val(b.H)}\\text{ bits}, \\qquad 2^{${name}(X)} = ${texNum(b.w, 2)}\\ \\text{${disc ? "effective outcomes" : "effective width"}}`,
          { cls: "ex-ml-formula" }
        );
      }
      editor.draw(handles);
      math.end();
    }
    let zone = null, editing = null;
    function zoneAt(p) {
      if (O.U.contains(p, 4) || O.G.contains(p, 4)) return "u";
      if (O.X.contains(p, 4)) return "x";
      return null;
    }
    function moveTo(p) {
      if (zone === "u") pos.setU(O.G.invX(p.x));
      else pos.setX(O.X.invY(p.y));
      redraw();
    }
    svg.addEventListener("pointerdown", (e) => {
      const p = svgPoint(svg, e), h = editor.hit(p);
      if (h) {
        stopPlay();
        editing = true;
        svg.setPointerCapture(e.pointerId);
        e.preventDefault();
        editor.begin(h, p);
        return;
      }
      const z = zoneAt(p);
      if (!z) return;
      stopPlay();
      zone = z;
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      moveTo(p);
    });
    svg.addEventListener("pointermove", (e) => {
      const p = svgPoint(svg, e);
      if (editing) {
        editor.move(p);
        return;
      }
      if (zone) {
        moveTo(p);
        return;
      }
      const h = editor.hit(p), z = zoneAt(p);
      svg.style.cursor = h ? editor.cursorFor(h) : !z ? "" : z === "u" ? "ew-resize" : "ns-resize";
    });
    const end = () => {
      if (editing) {
        editor.end();
        editing = false;
      }
      zone = null;
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    fitWidth(svg.parentElement, layout);
    return { draw };
  }

  // src/lib/prob/controls.js
  var $ = (id) => document.getElementById(id);
  function seg(box, onChange) {
    if (!box) return;
    const btns = [...box.querySelectorAll("button")];
    btns.forEach((b) => b.addEventListener("click", () => {
      btns.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      onChange(b.dataset.v);
    }));
  }
  function bindCommonControls({ model, pos, redraw }, { beforeCase, afterCase, onReset, stopPlay = () => {
  } } = {}) {
    const preset = $("ex-preset");
    function fillPresets() {
      if (!preset) return;
      const disc = model.kase === "disc", src = disc ? DISC_PRESETS : CONT_PRESETS, cur = disc ? model.discKey : model.contKey;
      const opts = Object.entries(src).map(([k, v]) => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = v.label;
        return o;
      });
      const custom = document.createElement("option");
      custom.value = "custom";
      custom.textContent = "custom";
      custom.hidden = !disc && cur !== "custom";
      preset.replaceChildren(...opts, custom);
      preset.value = cur;
    }
    const cases = [...document.querySelectorAll(".ex-case")];
    for (const box of cases) seg(box, (k) => {
      if (k === model.kase) return;
      stopPlay();
      beforeCase?.(k);
      model.setCase(k);
      fillPresets();
      afterCase?.(k);
      redraw();
    });
    preset?.addEventListener("change", () => {
      stopPlay();
      model.setPreset(preset.value);
    });
    fillPresets();
    const mix = $("ex-mix"), mixGrp = $("ex-mix-grp"), mixVal = $("ex-mixv");
    const isMix = () => model.kase === "cont" && model.shape.kind === "mix" && model.shape.comps.length > 1;
    mix?.addEventListener("pointerdown", () => {
      stopPlay();
      model.hold(true);
    });
    mix?.addEventListener("input", () => {
      if (!isMix() || Math.abs(+mix.value - model.shape.comps[0].w) < 1e-9) return;
      model.setShape({ kind: "mix", comps: setWeight(model.shape.comps, 0, +mix.value) });
    });
    for (const ev of ["pointerup", "pointercancel", "keyup"]) mix?.addEventListener(ev, () => model.hold(false));
    $("ex-reset")?.addEventListener("click", () => {
      stopPlay();
      onReset?.();
      model.reset();
      pos.reset();
      fillPresets();
      redraw();
    });
    function update() {
      document.body.dataset.exCase = model.kase;
      for (const b of cases.flatMap((box) => [...box.querySelectorAll("button")])) b.setAttribute("aria-pressed", b.dataset.v === model.kase ? "true" : "false");
      const key = model.kase === "disc" ? model.discKey : model.contKey;
      if (preset && preset.value !== key) preset.value = key;
      if (mixGrp) mixGrp.hidden = !isMix();
      if (mix && isMix()) {
        const w = model.shape.comps[0].w;
        if (Math.abs(+mix.value - w) > 5e-3) mix.value = String(w);
        if (mixVal) mixVal.textContent = w.toFixed(2);
      }
    }
    return { update, fillPresets };
  }

  // src/quantile-transform/main.js
  function init() {
    const svg = document.getElementById("qt-transform");
    if (!svg) return;
    const model = createModel(), pos = createPosition(model);
    const ui = { g: "neglog", gBase: "neglog", gc: null, ghost: true };
    let fig = null, controls = null;
    const redraw = () => {
      fig?.draw();
      controls?.update();
    };
    const ctx = { model, pos, ui, redraw, customG: () => {
    }, stopPlay: () => {
    } };
    controls = bindCommonControls({ model, pos, redraw }, { afterCase: () => pos.setU(0.6) });
    fig = createTransformFigure(svg, ctx);
    model.subscribe(() => {
      pos.refresh();
      redraw();
    });
    redraw();
  }

  // src/quantile-transform/index.js
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
