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
  var BIMODAL = (() => {
    const c = [{ w: 0.62, m: -0.9, s: 0.42 }, { w: 0.38, m: 1.3, s: 0.55 }];
    const mu = c.reduce((t, k) => t + k.w * k.m, 0);
    const v = c.reduce((t, k) => t + k.w * (k.s * k.s + k.m * k.m), 0) - mu * mu;
    const sd = Math.sqrt(v);
    return c.map((k) => ({ w: k.w, m: (k.m - mu) / sd, s: k.s / sd }));
  })();
  function shannonH(p) {
    return -p.reduce((t, q) => t + (q > 0 ? q * log2(q) : 0), 0);
  }
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

  // src/lib/prob/frame.js
  var G = {
    neglog: {
      f: (x, v) => -log2(v),
      tex: "-\\log p_X(x)",
      clip: [-5, 9],
      unit: "\\text{ bits}",
      means: (disc) => disc ? { tex: "H(X)", name: "entropy" } : { tex: "h(X)", name: "differential entropy" }
    },
    x: { f: (x) => x, tex: "x", means: () => ({ tex: "\\mathbb{E}[X]", name: "mean" }) },
    x2: { f: (x) => x * x, tex: "x^2", means: () => ({ tex: "\\mathbb{E}[X^2]", name: "second moment" }) },
    var: {
      f: (x, v, m) => (x - m) ** 2,
      tex: "(x - \\mathbb{E}[X])^2",
      means: () => ({ tex: "\\operatorname{Var}(X)", name: "variance" })
    },
    // undefined (NaN) when X is constant
    skew: {
      f: (x, v, m, s) => s > 1e-12 ? ((x - m) / s) ** 3 : NaN,
      tex: "\\big((x - \\mathbb{E}[X]) / \\sigma_X\\big)^3",
      means: () => ({ tex: "\\operatorname{Skew}(X)", name: "skewness" })
    },
    // discrete only: one value per atom, set by dragging
    custom: { f: null, tex: "\\text{custom}" }
  };
  function meaning(g, disc) {
    return G[g].means ? G[g].means(disc) : null;
  }
  var cache = { S: null, g: null, m: 0, s: 0, gs: null, I: null };
  function alongSamples(S, g) {
    if (cache.S !== S || cache.g !== g) {
      const m = runningIntegral(S.Fs, S.xs).at(-1);
      const s = Math.sqrt(Math.max(0, runningIntegral(S.Fs, S.xs.map((x) => (x - m) ** 2)).at(-1)));
      const gs = S.xs.map((x, i) => G[g].f(x, S.fs[i], m, s));
      cache = { S, g, m, s, gs, I: runningIntegral(S.Fs, gs) };
    }
    return cache;
  }
  function densityAt(v, x) {
    const s = v.shape;
    if (s.kind === "steps" && (x < s.ts[0] || x > s.ts[s.ts.length - 1])) return 0;
    return lerp(v.S.fs, atX(v.S, x));
  }
  function computeFrame(model, pos, g, custom) {
    const v = model.view(), gf = G[g].f;
    if (v.disc) {
      const { p, F, n } = v;
      const m2 = p.reduce((t, q, i) => t + q * (i + 1), 0);
      const s2 = Math.sqrt(p.reduce((t, q, i) => t + q * (i + 1 - m2) ** 2, 0));
      const gs2 = p.map((q, i) => q <= 0 ? NaN : g === "custom" ? custom[i] : gf(i + 1, q, m2, s2));
      const cum = [0];
      gs2.forEach((y, i) => cum.push(cum[i] + (p[i] > 0 ? p[i] * y : 0)));
      const u = pos.u;
      const k = u <= 0 ? -1 : F.findIndex((f, i) => i > 0 && f >= u - 1e-12) - 1;
      const area = k < 0 ? 0 : cum[k] + (u - F[k]) * gs2[k];
      return { disc: true, p, F, n, base: v.base, gs: gs2, cum, x: pos.x, u, k, gNow: k >= 0 ? gs2[k] : NaN, area, total: cum[n] };
    }
    const { S } = v, { m, s, gs, I } = alongSamples(S, g);
    const xq = lerp(S.xs, atU(S, pos.u));
    return {
      disc: false,
      S,
      gs,
      I,
      x: pos.x,
      u: pos.u,
      fNow: densityAt(v, pos.x),
      gNow: gf(xq, lerp(S.fs, atX(S, xq)), m, s),
      area: lerp(I, atU(S, pos.u)),
      total: I[I.length - 1]
    };
  }
  function gExtent(fr, g) {
    let lo = Infinity, hi = -Infinity;
    const vals = fr.disc ? fr.gs.filter(Number.isFinite) : fr.gs.filter((y, i) => fr.S.Fs[i] > 1e-4 && fr.S.Fs[i] < 1 - 1e-4);
    for (const v of vals) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const c = G[g].clip;
    if (c && !fr.disc) {
      lo = Math.max(lo, c[0]);
      hi = Math.min(hi, c[1]);
    }
    return [Math.min(lo, 0), Math.max(hi, 0)];
  }
  function gRange(fr, g) {
    let [lo, hi] = gExtent(fr, g);
    if (hi - lo < 1e-9) hi = lo + 1;
    const pad = 0.08 * (hi - lo);
    return [lo < 0 ? lo - pad : 0, hi + pad];
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
        const el3 = document.createElement("div");
        el3.dataset.key = key;
        layer.appendChild(el3);
        L = { el: el3, want: null, shown: null, busy: false };
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

  // src/lib/prob/area-notes.js
  var MAP = "\\(F_X\\) rescales the real line into \\([0, 1]\\), so that each outcome takes up as much room as its probability. This gives us our horizontal axis.";
  var NOTES = {
    expectation: {
      dist: "The distribution of \\(X\\): what the expectation averages over.",
      map: MAP,
      g: () => "The function \\(g\\) gives the height to integrate.",
      gLabel: (gtex) => gtex ? "g(x) = " + gtex : "g(x)",
      aLabel: () => "g(F_X^{-1}(u))",
      avg: () => "\\mathbb{E}[g(X)]",
      // the average-height line in the area panel
      area: (done1, uTex) => done1 ? "The expectation is the whole area:" : `The area up to \\(u = \\class{ex-now}{${uTex}}\\) is:`,
      rest: "The expectation is the whole area (slide \\(u\\) to 1).",
      integrand: () => "g\\big(F_X^{-1}(v)\\big)",
      // the label under the brace takes no width, so a long name doesn't spread the equation
      result: ({ mn, val: val4, unit }) => `\\mathbb{E}[g(X)] \\;=\\; ${mn ? `\\underbrace{${mn.tex}}_{\\mathclap{\\text{${mn.name}}}} \\;=\\; ` : ""}${val4}${unit}`
    },
    entropy: {
      dist: "The distribution of \\(X\\): what the entropy averages over.",
      map: MAP,
      // surprisal names the information of an event; a density gives only a log-density
      g: (disc) => `The height is the ${disc ? "surprisal" : "negative log-density"}, \\(-\\log p_X(x)\\).`,
      gLabel: (gtex) => gtex,
      aLabel: () => "-\\log p_X(F_X^{-1}(u))",
      avg: (disc) => disc ? "H(X)" : "h(X)",
      area: () => "The entropy is the whole area:",
      rest: "",
      // never shown: this figure is always at u = 1
      integrand: () => "-\\log p_X\\big(F_X^{-1}(v)\\big)",
      result: ({ val: val4, unit, disc }) => `${disc ? "H(X)" : "h(X)"} \\;=\\; \\mathbb{E}[-\\log p_X(X)] \\;=\\; ${val4}${unit}`
    }
  };

  // src/lib/prob/fig-area.js
  var GAP = 28;
  var WL0 = 400;
  var WL_FORMULA = 340;
  var N_MAP = 64;
  var HT = 200;
  var HB = 150;
  var HA = 250;
  var HI = 200;
  var H0 = HT + HB + HA + HI + 6;
  var mA = { l: 58, r: 16, t: 50, b: 30 };
  var cls2 = (i, k) => i <= k ? "done" : "todo";
  function createAreaFigure(svg, { model, pos, ui, redraw, stopPlay, customG }, { sweep = true, notes = "expectation" } = {}) {
    const T = NOTES[notes];
    const ctx = svgContext(svg, 1e3, H0);
    const RT = new Region(ctx, { ox: 0, oy: 0, w: 0, h: HT, m: { l: 58, r: 16, t: 26, b: 26 } });
    const RA = new Region(ctx, { ox: 0, oy: HT + HB, w: 0, h: HA, m: mA });
    const RG = new Region(ctx, { ox: 0, oy: HT + HB, w: 0, h: HA, m: mA });
    const RI = new Region(ctx, { ox: 0, oy: HT + HB + HA, w: 0, h: HI, m: { l: 58, r: 16, t: 26, b: 42 } });
    const bridge = el("g", null, ctx.root), handles = el("g", null, ctx.root), over = el("g", null, ctx.root);
    const math = createMathLayer(svg.parentElement, 1e3, H0);
    let noRI = false;
    let wideBottom = false;
    let colL = WL0, layoutW = 1e3;
    function layout(W) {
      const WL = Math.round((W - GAP) * WL0 / (1e3 - GAP)), WR = W - WL - GAP;
      colL = WL;
      layoutW = W;
      for (const R of [RT, RA, RI]) Object.assign(R.o, { ox: WL + GAP, w: WR });
      RG.o.w = WL;
      noRI = WL < WL_FORMULA;
      svg.setAttribute("viewBox", `0 0 ${W} ${H0}`);
      math.resize(W, H0);
      if (lastFr) draw(lastFr);
    }
    const yLabel = (key, R, tex) => {
      const [x, y] = R.ylabelAt();
      math.set(key, x, y, tex, { rotate: -90 });
    };
    const xLabel = (key, R, tex) => {
      const [x, y] = R.xlabelAt();
      math.set(key, x, y, tex);
    };
    let lastK = -1;
    const editor = createEditor({ model, adapter: regionAdapter(RT, false), visible: (i) => ui.ghost || i <= lastK });
    const zones = { yTop: 0, yAx: 0 };
    let gDrag = null;
    let lastFr = null;
    function draw(fr) {
      lastFr = fr;
      const defined = Number.isFinite(fr.total);
      const v = model.view(), done1 = fr.u >= 1 - 1e-9, yr = gDrag ? gDrag.yr : gRange(fr, ui.g);
      lastK = fr.disc ? fr.k : -1;
      math.begin();
      const [x0, x1] = v.xRange;
      if (fr.disc) {
        RT.domain(0.4, fr.n + 0.6, 0, 1.05);
        RT.axes({ xticks: fr.p.map((_, i) => i + 1), yticks: [0, 0.5, 1] });
        if (fr.base) fr.base.forEach((q, i) => {
          if (q <= 0) return;
          el("line", { x1: RT.X(i + 1), x2: RT.X(i + 1), y1: RT.Y(0), y2: RT.Y(q), class: "stem-base" }, RT.data);
          el("circle", { cx: RT.X(i + 1), cy: RT.Y(q), r: 4.5, class: "pin-base" }, RT.data);
        });
        fr.p.forEach((q, i) => {
          if (q <= 0) {
            el("circle", { cx: RT.X(i + 1), cy: RT.Y(0), r: 4, class: "pin-null" }, RT.data);
            return;
          }
          const c = cls2(i, fr.k);
          if (c === "todo" && !ui.ghost) return;
          el("line", { x1: RT.X(i + 1), x2: RT.X(i + 1), y1: RT.Y(0), y2: RT.Y(q), class: "stem-" + c }, RT.data);
          el("circle", { cx: RT.X(i + 1), cy: RT.Y(q), r: 4.5, class: "pin-" + c }, RT.data);
        });
        if (sweep) RT.vline(fr.x, "cursor");
      } else {
        RT.domain(x0, x1, 0, v.win.y1);
        RT.axes({});
        const pts = fr.S.xs.map((x, i) => [x, fr.S.fs[i]]).filter((q) => q[0] >= x0 - 0.05 && q[0] <= x1 + 0.05);
        const s = v.shape, edges = s.kind === "steps" ? [[s.ts[0], 0], ...pts, [s.ts[s.ts.length - 1], 0]] : pts;
        if (ui.ghost) RT.area(edges, "fm").setAttribute("opacity", ".35");
        const done = edges.filter((q) => q[0] <= fr.x);
        if (done.length) RT.area(Number.isFinite(fr.x) ? [...done, [fr.x, fr.fNow]] : done, "fm");
        RT.path(edges, "curve");
        RT.hline(1, "hline").setAttribute("opacity", ".5");
        if (sweep) {
          RT.vline(fr.x, "cursor");
          if (RT.inX(fr.x)) el("circle", { cx: RT.X(fr.x), cy: RT.Y(fr.fNow), r: 4.5, class: "dot" }, RT.front);
        }
      }
      yLabel("rt-y", RT, "p_X(x)");
      handles.replaceChildren();
      editor.draw(handles);
      const gtex = T.gLabel(ui.g === "custom" ? null : G[ui.g].tex);
      if (fr.disc) {
        RG.domain(0.4, fr.n + 0.6, yr[0], yr[1]);
        RG.axes({ xticks: fr.p.map((_, i) => i + 1) });
        fr.gs.forEach((y, i) => {
          if (!Number.isFinite(y)) return;
          const c = cls2(i, fr.k);
          if (c === "todo" && !ui.ghost) return;
          el("line", { x1: RG.X(i + 1), x2: RG.X(i + 1), y1: RG.Y(0), y2: RG.Y(y), class: "stem-" + c }, RG.data);
          el("circle", { cx: RG.X(i + 1), cy: RG.Y(y), r: 4, class: "pin-" + c }, RG.data);
          el("circle", { cx: RG.X(i + 1), cy: RG.Y(y), r: 13, class: "hit" }, RG.data);
        });
        if (sweep) RG.vline(fr.x, "cursor");
      } else {
        RG.domain(x0, x1, yr[0], yr[1]);
        RG.axes({});
        xLabel("rg-x", RG, "x");
        const pts = [];
        fr.S.xs.forEach((x, i) => {
          if (x >= x0 - 0.05 && x <= x1 + 0.05) pts.push([x, fr.gs[i]]);
        });
        RG.area(pts, "fn", RG.gBelow());
        RG.path(pts.filter((q) => q[0] > fr.x), "curve later");
        RG.path(pts.filter((q) => q[0] <= fr.x).concat(Number.isFinite(fr.x) ? [[fr.x, fr.gNow]] : []), "curve");
        if (sweep) RG.vline(fr.x, "cursor");
      }
      yLabel("rg-y", RG, gtex);
      RA.domain(0, 1, yr[0], yr[1]);
      RA.axes({ xticks: [0, 0.25, 0.5, 0.75, 1] });
      yLabel("ra-y", RA, T.aLabel(G[ui.g].tex));
      if (fr.disc) {
        fr.p.forEach((q, i) => {
          if (q <= 0 || !Number.isFinite(fr.gs[i])) return;
          const cls = fr.gs[i] < 0 ? "done neg" : "done", end2 = i === fr.k ? fr.u : fr.F[i + 1];
          if (ui.ghost && i >= fr.k) RA.rect(fr.F[i], 0, fr.F[i + 1], fr.gs[i], "todo");
          if (i <= fr.k) RA.rect(fr.F[i], 0, end2, fr.gs[i], cls);
        });
      } else {
        const all = fr.S.Fs.map((u, i) => [u, fr.gs[i]]);
        if (ui.ghost) RA.path(all, "curve later");
        const done = all.filter((q) => q[0] <= fr.u).concat([[fr.u, fr.gNow]]);
        RA.area(done, "fm", RA.gAbove());
        RA.area(done, "fn", RA.gBelow());
        RA.path(done, "curve");
      }
      if (sweep && fr.u > 0) RA.vline(fr.u, "cursor");
      if (done1 && defined && RA.inY(fr.total)) {
        RA.hline(fr.total, "hline avg");
        math.set("avg", RA.pl + 8, RA.Y(fr.total) - 13, T.avg(fr.disc), { anchor: "start", cls: "ex-ml-avg" });
      }
      const fin = done1 && defined, fl = RA.o.ox + 2;
      RA.back.prepend(el("rect", { x: fl, y: RA.pt - 10, width: RA.pr + 10 - fl, height: RA.pb - RA.pt + 36, rx: 4, class: "result-box" + (fin ? " final" : "") }));
      wideBottom = noRI || done1;
      if (wideBottom) RI.clear();
      else {
        const run = (fr.disc ? fr.cum : fr.I).filter(Number.isFinite);
        let ilo = 0, ihi = 0;
        run.forEach((c) => {
          ilo = Math.min(ilo, c);
          ihi = Math.max(ihi, c);
        });
        const ipad = 0.1 * (ihi - ilo || 1);
        RI.domain(0, 1, ilo < 0 ? ilo - ipad : 0, ihi + ipad);
        RI.axes({ xticks: [0, 0.25, 0.5, 0.75, 1] });
        yLabel("ri-y", RI, "\\int_0^u g \\circ F_X^{-1}");
        xLabel("ri-x", RI, "u");
        if (fr.u > 0) RI.vline(fr.u, "cursor");
        if (defined) {
          const ipts = fr.disc ? fr.F.map((u, i) => [u, fr.cum[i]]) : fr.S.Fs.map((u, i) => [u, fr.I[i]]);
          if (ui.ghost) RI.path(ipts, "curve later");
          RI.path(ipts.filter((q) => q[0] <= fr.u + 1e-12).concat([[fr.u, fr.area]]), "curve");
          if (done1) RI.hline(fr.total, "hline");
          if (fr.u > 0 || !fr.disc) el("circle", { cx: RI.X(fr.u), cy: RI.Y(fr.area), r: 4.5, class: "dot" }, RI.front);
        }
      }
      bridge.replaceChildren();
      const yTop = RT.pb + 20, yAx = RA.pt - 34, U = (u) => RA.X(u);
      zones.yTop = yTop;
      zones.yAx = yAx;
      math.set(
        "map",
        RT.o.ox + 12,
        (yTop + yAx) / 2,
        "u \\;\\substack{\\xrightarrow{\\;\\textstyle F_X^{-1}\\;} \\\\ \\xleftarrow[\\;\\textstyle F_X\\;]{}}\\; x",
        { rotate: -90 }
      );
      if (fr.disc) {
        const tri = (top, a, b, cls) => el("path", { d: `M${top} ${yTop}L${a} ${yAx}L${b} ${yAx}Z`, class: cls }, bridge);
        fr.p.forEach((q, i) => {
          const a = U(fr.F[i]), b = U(fr.F[i + 1]), top = RT.X(i + 1), end2 = i === fr.k ? U(fr.u) : b;
          if (q <= 0) return;
          if (i >= fr.k && ui.ghost) tri(top, a, b, "tri-todo");
          if (i <= fr.k) tri(top, a, end2, "tri-done");
        });
        el("line", { x1: U(0), x2: U(1), y1: yAx, y2: yAx, class: "wax" }, bridge);
        el("line", { x1: U(0), x2: U(fr.u), y1: yAx, y2: yAx, class: "wax done" }, bridge);
        if (sweep && fr.k >= 0) el("line", { x1: RT.X(fr.k + 1), y1: yTop, x2: U(fr.u), y2: yAx, class: "br-cur" }, bridge);
      } else {
        el("line", { x1: U(0), x2: U(1), y1: yAx, y2: yAx, class: "wax" }, bridge);
        el("line", { x1: U(0), x2: U(fr.u), y1: yAx, y2: yAx, class: "wax done" }, bridge);
        for (let j = 0; j < N_MAP; j++) {
          const uj = (j + 0.5) / N_MAP, xj = lerp(fr.S.xs, atU(fr.S, uj)), done = uj <= fr.u;
          if (done || ui.ghost) el("line", { x1: RT.X(xj), y1: yTop, x2: U(uj), y2: yAx, class: done ? "br-done" : "br-todo" }, bridge);
        }
        if (sweep && Number.isFinite(fr.x)) el("line", { x1: RT.X(fr.x), y1: yTop, x2: U(fr.u), y2: yAx, class: "br-cur" }, bridge);
      }
      over.replaceChildren();
      const hasPoint = sweep && !done1 && (fr.disc ? fr.k >= 0 : true);
      if (hasPoint && isFinite(fr.gNow) && RA.inY(fr.gNow)) {
        const px = U(fr.u), py = RA.Y(fr.gNow);
        const gx = fr.disc ? RG.X(fr.k + 1) : RG.X(fr.x);
        el("path", { d: `M${px} ${py}L${gx} ${py}`, class: "cross" }, over);
        el("path", { d: `M${px} ${py}L${px} ${yAx}`, class: "cross" }, over);
        if (fr.disc || RG.inX(fr.x)) el("circle", { cx: gx, cy: py, r: 4.5, class: "dot" }, over);
        el("circle", { cx: px, cy: py, r: 4.5, class: "dot" }, over);
        el("circle", { cx: px, cy: yAx, r: 3.5, class: "dot" }, over);
      }
      const val4 = (v2) => {
        if (Number.isNaN(v2)) return "\\text{undefined}";
        const t = texNum(v2);
        return t.startsWith("-") ? `\\class{ex-neg}{${t}}` : t;
      };
      const upper = done1 ? "1" : `\\class{ex-now}{${texNum(fr.u)}}`;
      const note = (key, x, y, t, w, bottom) => math.set(key, x, y, t, { text: true, width: w, cls: "ex-ml-note", bottom });
      const nw = Math.min(colL - 30, 370);
      note("n-dist", colL / 2, (RT.pt + RT.pb) / 2, T.dist, colL - 10);
      note("n-map", colL / 2, (zones.yTop + zones.yAx) / 2 - (noRI ? 30 : 0), T.map, nw);
      note("n-g", colL / 2, RG.pt - 12, T.g(fr.disc), nw, true);
      const riTop = RI.o.oy + RI.o.m.t, fx = wideBottom ? layoutW / 2 : colL / 2, fy1 = riTop + 60, fy2 = riTop + 130;
      const noteW = wideBottom ? layoutW - 32 : nw;
      const areaNote = T.area(done1, texNum(fr.u));
      math.set("n-area", fx, riTop + 2, areaNote, { text: true, width: noteW, cls: "ex-ml-note" });
      if (!done1) math.set("n-rest", fx, fy2, T.rest, { text: true, width: noteW, cls: "ex-ml-note" });
      math.set("integral", fx, fy1, `\\displaystyle\\int_0^{${upper}} ${T.integrand(G[ui.g].tex)} \\dee{v} \\;=\\; ${val4(fr.area)}`, { cls: "ex-ml-formula" });
      if (done1) {
        const mn = meaning(ui.g, fr.disc);
        const tex = T.result({ mn, val: val4(fr.total), unit: defined ? G[ui.g].unit ?? "" : "", disc: fr.disc });
        math.set("expectation", fx, fy2, tex, { cls: "ex-ml-result" + (defined ? " ex-ml-boxed" : "") });
      }
      math.end();
    }
    function zoneAt(p) {
      if (!sweep) return null;
      if (RT.contains(p, 4) || RG.contains(p, 4)) return "x";
      if (RA.contains(p, 4) || !wideBottom && RI.contains(p, 4)) return "u";
      if (p.y > zones.yTop - 6 && p.y < zones.yAx + 18 && p.x >= Math.min(RT.pl, RA.pl) - 4 && p.x <= Math.max(RT.pr, RA.pr) + 4) return "map";
      return null;
    }
    const Fof = (x) => {
      const v = model.view();
      return v.disc ? discCdfAt(v.F, x) : lerp(v.S.Fs, atX(v.S, x));
    };
    function dragMap(p) {
      const t = clamp((p.y - zones.yTop) / (zones.yAx - zones.yTop), 0, 1);
      let [lo, hi] = model.view().xRange;
      const at = (x) => (1 - t) * RT.X(x) + t * RA.X(Fof(x));
      for (let i = 0; i < 50; i++) {
        const m = (lo + hi) / 2;
        if (at(m) < p.x) lo = m;
        else hi = m;
      }
      pos.setX((lo + hi) / 2);
    }
    function gHit(p) {
      if (!sweep) return -1;
      const fr = lastFr;
      if (!fr?.disc || !RG.contains(p, 14)) return -1;
      let best = -1, bd = 13;
      fr.gs.forEach((y, i) => {
        if (!Number.isFinite(y)) return;
        const d = Math.hypot(p.x - RG.X(i + 1), p.y - RG.Y(y));
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    }
    function dragG(p) {
      const [lo, hi] = gDrag.yr, pad = 0.15 * (hi - lo);
      ui.gc[gDrag.i] = clamp(RG.invY(p.y), lo - pad, hi + pad);
      redraw();
    }
    let zone = null, from = null, editing = false;
    function moveTo(p) {
      if (zone === "x") pos.setX(from.invX(p.x));
      else if (zone === "u") pos.setU(RA.invX(p.x));
      else dragMap(p);
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
      const gi = gHit(p);
      if (gi >= 0) {
        stopPlay();
        svg.setPointerCapture(e.pointerId);
        e.preventDefault();
        gDrag = { i: gi, yr: gRange(lastFr, ui.g) };
        customG(true);
        dragG(p);
        return;
      }
      const z = zoneAt(p);
      if (!z) return;
      stopPlay();
      zone = z;
      from = z === "x" ? RT.contains(p, 4) ? RT : RG : null;
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
      if (gDrag) {
        dragG(p);
        return;
      }
      if (zone) {
        moveTo(p);
        return;
      }
      const h = editor.hit(p);
      svg.style.cursor = h ? editor.cursorFor(h) : gHit(p) >= 0 ? "ns-resize" : zoneAt(p) ? "ew-resize" : "";
    });
    const end = () => {
      if (editing) {
        editing = false;
        editor.end();
      }
      if (gDrag) {
        gDrag = null;
        redraw();
      }
      zone = null;
      from = null;
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    fitWidth(svg.parentElement, layout);
    return { draw };
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

  // src/temperature/config.js
  var T_MIN = 0.05;
  var T_MAX = 20;
  var PRESETS = {
    unimodal: [0.05, 0.08, 0.12, 0.3, 0.2, 0.12, 0.08, 0.05],
    uniform: [1, 1, 1, 1, 1, 1, 1, 1],
    peaked: [0.02, 0.03, 0.05, 0.62, 0.13, 0.07, 0.05, 0.03],
    bimodal: [0.05, 0.28, 0.09, 0.03, 0.03, 0.09, 0.28, 0.15],
    zipf: [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8]
  };

  // src/temperature/sliderscale.js
  var SLIDER_MAX = 1e3;
  var LO = Math.log(1 / T_MAX);
  var HI2 = Math.log(1 / T_MIN);
  function betaToFrac(b) {
    return (Math.log(b) - LO) / (HI2 - LO);
  }
  function fracToBeta(f) {
    return Math.exp(LO + (HI2 - LO) * f);
  }
  var clamp01 = (x) => Math.max(0, Math.min(1, x));
  function sliderToT(v, negative) {
    if (!negative) {
      if (v <= 0) return Infinity;
      if (v >= SLIDER_MAX) return 0;
      return 1 / fracToBeta(v / SLIDER_MAX);
    }
    const HALF = SLIDER_MAX / 2;
    if (v <= 0) return -0;
    if (v >= SLIDER_MAX) return 0;
    if (v === HALF) return Infinity;
    if (v > HALF) return 1 / fracToBeta((v - HALF) / HALF);
    return -1 / fracToBeta(1 - v / HALF);
  }
  function tToSlider(t, negative) {
    if (!negative) {
      if (t === Infinity) return 0;
      if (t === 0) return SLIDER_MAX;
      return Math.round(SLIDER_MAX * clamp01(betaToFrac(1 / t)));
    }
    const HALF = SLIDER_MAX / 2;
    if (Object.is(t, -0)) return 0;
    if (t === 0) return SLIDER_MAX;
    if (t === Infinity || t === -Infinity) return HALF;
    if (t > 0) return Math.round(HALF + HALF * clamp01(betaToFrac(1 / t)));
    return Math.round(HALF * clamp01(1 - betaToFrac(-1 / t)));
  }

  // src/differential-entropy/controls.js
  var $2 = (id) => document.getElementById(id);
  var sliderToBeta = (v) => 1 / sliderToT(v, false);
  var betaToSlider = (b) => tToSlider(1 / b, false);
  var fmtBeta = (b) => b === Infinity ? "\u221E" : String(Number(b.toPrecision(3)));
  function bindControls({ model, pos, redraw, onReset }) {
    const slider = $2("de-beta"), label = $2("de-betav");
    const common = bindCommonControls({ model, pos, redraw }, { afterCase: () => pos.setU(0.6), onReset });
    if (slider) slider.max = String(SLIDER_MAX);
    slider?.addEventListener("input", () => model.setBeta(sliderToBeta(+slider.value)));
    function update() {
      common.update();
      if (slider && sliderToBeta(+slider.value) !== model.beta) slider.value = String(betaToSlider(model.beta));
      if (label) label.textContent = fmtBeta(model.beta);
    }
    return { update };
  }

  // src/lib/prob/panel-px.js
  function windowPX(v) {
    if (!v.disc) return { x0: v.xRange[0], x1: v.xRange[1], y1: v.win.y1 };
    const xs = positionsOf(v), gap = xs.length > 1 ? xs[1] - xs[0] : 1;
    return { x0: xs[0] - 0.6 * gap, x1: xs[xs.length - 1] + 0.6 * gap, y1: 1.05 };
  }
  function drawPX(R, v, { faint = false } = {}) {
    if (v.disc) {
      const xs = positionsOf(v), c = faint ? "todo" : "done";
      if (!faint && v.base) v.base.forEach((q, i) => {
        if (q <= 0) return;
        el("line", { x1: R.X(xs[i]), x2: R.X(xs[i]), y1: R.Y(0), y2: R.Y(q), class: "stem-base" }, R.data);
        el("circle", { cx: R.X(xs[i]), cy: R.Y(q), r: 4.5, class: "pin-base" }, R.data);
      });
      v.p.forEach((q, i) => {
        const x = R.X(xs[i]);
        if (q <= 0) {
          if (!faint) el("circle", { cx: x, cy: R.Y(0), r: 4, class: "pin-null" }, R.data);
          return;
        }
        el("line", { x1: x, x2: x, y1: R.Y(0), y2: R.Y(q), class: "stem-" + c }, R.data);
        el("circle", { cx: x, cy: R.Y(q), r: 4.5, class: "pin-" + c }, R.data);
      });
      return;
    }
    const s = v.shape, pts = v.S.xs.map((x, i) => [x, v.S.fs[i]]);
    const edges = s.kind === "steps" ? [[s.ts[0], 0], ...pts, [s.ts[s.ts.length - 1], 0]] : pts;
    if (faint) {
      R.area(edges, "fm").setAttribute("opacity", ".35");
      R.path(edges, "curve later");
    } else {
      R.area(edges, "fm");
      R.path(edges, "curve");
    }
  }

  // src/lib/prob/quantize.js
  function extent(v) {
    if (v.disc) return [1, v.p.length];
    const s = v.shape;
    if (s.kind === "steps") return [s.ts[0], s.ts[s.ts.length - 1]];
    return [Math.min(...s.comps.map((c) => c.m - 9 * c.s)), Math.max(...s.comps.map((c) => c.m + 9 * c.s))];
  }
  function massFn(s) {
    if (s.kind === "steps") return stepsDist(s.ts, s.ms).mass;
    return (a, b) => s.comps.reduce((t, c) => t + c.w * gMass(a, b, c.m, c.s), 0);
  }
  function binMasses(v, D, origin = v.disc ? 0.5 : 0) {
    const [lo, hi] = extent(v);
    const bin = (x) => Math.floor((x - origin) / D + 1e-9);
    const k0 = bin(lo), k1 = bin(hi);
    const masses = new Array(k1 - k0 + 1).fill(0);
    if (v.disc) v.p.forEach((q, i) => {
      masses[bin(i + 1) - k0] += q;
    });
    else {
      const mass = massFn(v.shape);
      for (let k = k0; k <= k1; k++) masses[k - k0] = mass(origin + k * D, origin + (k + 1) * D);
    }
    const edges = masses.map((_, j) => origin + (k0 + j) * D);
    edges.push(origin + (k1 + 1) * D);
    return { edges, masses };
  }
  function quantizedH(v, D, origin) {
    return shannonH(binMasses(v, D, origin).masses);
  }
  function quantizeCurve(v, ts) {
    return ts.map((t) => quantizedH(v, 2 ** -t));
  }

  // src/differential-entropy/fig-quantize.js
  var W0 = 1e3;
  var HP = 400;
  var H02 = HP + 56;
  var T_MIN2 = -3;
  var T_MAX2 = 12;
  var T_STEP = 0.25;
  var TS = Array.from({ length: Math.round((T_MAX2 - T_MIN2) / T_STEP) + 1 }, (_, i) => T_MIN2 + i * T_STEP);
  function deltaLabel(t) {
    if (Math.abs(t - Math.round(t)) < 1e-9) {
      const k = Math.round(t);
      return k > 0 ? "1/" + 2 ** k : String(2 ** -k);
    }
    const D = 2 ** -t;
    return D < 0.01 ? D.toExponential(2) : String(+D.toPrecision(3));
  }
  var val2 = (x) => {
    const t = texNum(x);
    return t.startsWith("-") ? `\\class{ex-neg}{${t}}` : t;
  };
  function createQuantizeFigure(svg, { model }, { slider, label }) {
    const ctx = svgContext(svg, W0, H02);
    const RC = new Region(ctx, { ox: 0, oy: 0, w: 560, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const RP = new Region(ctx, { ox: 584, oy: 0, w: 416, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const handles = el("g", null, ctx.root);
    const math = createMathLayer(svg.parentElement, W0, H02);
    const editor = createEditor({ model, adapter: regionAdapter(RP, false) });
    let layoutW = W0, drawn = false;
    function layout(W) {
      const wl = Math.round(0.56 * W), gap = Math.round(0.024 * W);
      RC.o.w = wl;
      Object.assign(RP.o, { ox: wl + gap, w: W - wl - gap });
      layoutW = W;
      svg.setAttribute("viewBox", `0 0 ${W} ${H02}`);
      math.resize(W, H02);
      if (drawn) draw();
    }
    let cacheKey = null, curve = null;
    function curveFor(v) {
      const key = v.disc ? v.p.join(",") : v.S;
      if (key !== cacheKey) {
        cacheKey = key;
        curve = quantizeCurve(v, TS);
      }
      return curve;
    }
    const yLabel = (key, R, tex) => {
      const [x, y] = R.ylabelAt();
      math.set(key, x, y, tex, { rotate: -90 });
    };
    const xLabel = (key, R, tex) => {
      const [x, y] = R.xlabelAt();
      math.set(key, x, y, tex);
    };
    function draw() {
      drawn = true;
      const v = model.view(), t = +slider.value, D = 2 ** -t, Hq = quantizedH(v, D), H = entropyOf(v);
      if (label) label.textContent = deltaLabel(t);
      math.begin();
      const ys = curveFor(v), top = Math.max(1, ...ys) * 1.08;
      RC.domain(T_MIN2, T_MAX2, -1.5, top);
      RC.rect(T_MIN2, -1.5, T_MAX2, 0, "negzone");
      RC.axes({ xticks: [-2, 0, 2, 4, 6, 8, 10, 12] });
      yLabel("c-y", RC, "H(X_\\Delta)\\ \\text{(bits)}");
      xLabel("c-x", RC, "\\log(1/\\Delta)");
      if (v.disc) RC.hline(H, "asym");
      else RC.path([[T_MIN2, H + T_MIN2], [T_MAX2, H + T_MAX2]], "asym");
      RC.path(TS.map((tt, i) => [tt, ys[i]]), "qcurve");
      el("circle", { cx: RC.X(t), cy: RC.Y(Hq), r: 5, class: "dot" }, RC.front);
      const w = windowPX(v);
      RP.domain(w.x0, w.x1, 0, w.y1);
      RP.axes(v.disc ? { xticks: positionsOf(v), yticks: [0, 0.5, 1] } : {});
      yLabel("p-y", RP, "p_X(x)");
      xLabel("p-x", RP, "x");
      const { edges, masses } = binMasses(v, D), pts = [];
      masses.forEach((m, j) => {
        if (edges[j + 1] < w.x0 || edges[j] > w.x1) return;
        const h = v.disc ? m : m / D;
        pts.push([edges[j], h], [edges[j + 1], h]);
      });
      if (pts.length) RP.area(pts, "bin");
      drawPX(RP, v);
      handles.replaceChildren();
      editor.draw(handles);
      math.set(
        "readout",
        layoutW / 2,
        HP + 30,
        `H(X_\\Delta) = ${val2(Hq)}\\text{ bits}, \\quad \\log(1/\\Delta) = ${texNum(t, 2)}, \\quad H(X_\\Delta) - \\log(1/\\Delta) = ${val2(Hq - t)}, \\quad ${v.disc ? "H" : "h"}(X) = ${val2(H)}`,
        { cls: "ex-ml-formula" }
      );
      math.end();
    }
    let editing = false;
    svg.addEventListener("pointerdown", (e) => {
      const p = svgPoint(svg, e), h = editor.hit(p);
      if (!h) return;
      editing = true;
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      editor.begin(h, p);
    });
    svg.addEventListener("pointermove", (e) => {
      const p = svgPoint(svg, e);
      if (editing) {
        editor.move(p);
        return;
      }
      svg.style.cursor = editor.cursorFor(editor.hit(p));
    });
    const end = () => {
      if (editing) {
        editing = false;
        editor.end();
      }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    slider.addEventListener("input", draw);
    fitWidth(svg.parentElement, layout);
    const reset = () => {
      slider.value = slider.defaultValue;
    };
    return { draw, reset };
  }

  // src/lib/prob/stretch.js
  function stretchShape(s, a) {
    if (s.kind === "steps") return { kind: "steps", ts: s.ts.map((t) => a * t), ms: s.ms.slice() };
    return { kind: "mix", comps: s.comps.map((c) => ({ w: c.w, m: a * c.m, s: a * c.s })) };
  }
  function stretchView(v, a, perm = null) {
    if (v.disc) {
      const p = v.p.slice();
      if (perm) perm.forEach((j, i) => {
        p[j] = v.p[i];
      });
      const n = p.length;
      return { disc: true, p, F: cdfOf(p), n, xs: p.map((_, i) => a * (i + 1)), xRange: [a * 0.5, a * (n + 0.5)] };
    }
    const shape = stretchShape(v.shape, a), S = sampleShape(shape);
    const win = { x0: a * v.win.x0, x1: a * v.win.x1, y1: v.win.y1 / a };
    return { disc: false, shape, S, win, xRange: [win.x0, win.x1] };
  }
  function randomPerm(n, rng = Math.random) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  }

  // src/differential-entropy/fig-stretch.js
  var W02 = 1e3;
  var HP2 = 340;
  var H03 = HP2 + 56;
  function stretchLabel(s) {
    if (Math.abs(s - Math.round(s)) < 1e-9) {
      const k = Math.round(s);
      return k < 0 ? "1/" + 2 ** -k : String(2 ** k);
    }
    const a = 2 ** s;
    return a >= 1 ? String(+a.toPrecision(3)) : a.toPrecision(2);
  }
  var val3 = (x) => {
    const t = texNum(x);
    return t.startsWith("-") ? `\\class{ex-neg}{${t}}` : t;
  };
  function createStretchFigure(svg, { model }, { slider, label, shuffle }) {
    const ctx = svgContext(svg, W02, H03);
    const R = new Region(ctx, { ox: 0, oy: 0, w: W02, h: HP2, m: { l: 58, r: 16, t: 26, b: 42 } });
    const math = createMathLayer(svg.parentElement, W02, H03);
    let layoutW = W02, drawn = false, perm = null;
    function layout(W) {
      R.o.w = W;
      layoutW = W;
      svg.setAttribute("viewBox", `0 0 ${W} ${H03}`);
      math.resize(W, H03);
      if (drawn) draw();
    }
    function draw() {
      drawn = true;
      const v = model.view(), s = +slider.value, a = 2 ** s;
      const y = stretchView(v, a, v.disc ? perm : null), moved = Math.abs(s) > 1e-9 || v.disc && perm !== null;
      if (label) label.textContent = stretchLabel(s);
      math.begin();
      const w0 = windowPX(v), w1 = windowPX(y);
      R.domain(Math.min(w0.x0, w1.x0), Math.max(w0.x1, w1.x1), 0, Math.max(w0.y1, w1.y1));
      R.axes(v.disc ? { xticks: positionsOf(y), yticks: [0, 0.5, 1] } : {});
      const [xx, xy] = R.xlabelAt(), [yx, yy] = R.ylabelAt();
      math.set("x", xx, xy, "y = a\\,x");
      math.set("y", yx, yy, "p_{aX}(y)", { rotate: -90 });
      if (moved) drawPX(R, v, { faint: true });
      drawPX(R, y);
      if (!v.disc) R.hline(1, "hline").setAttribute("opacity", ".5");
      const b = boxOf(y);
      R.rect(b.cx - b.w / 2, 0, b.cx + b.w / 2, b.ht, "eqbox");
      math.set(
        "box",
        R.X(b.cx),
        R.Y(Math.min(b.ht, R.y1)) - 14,
        v.disc ? `2^{H} = ${texNum(b.w / a, 2)}\\ \\text{outcomes}` : `2^{h} = ${texNum(b.w, 2)}\\ \\text{wide}`,
        { cls: "ex-ml-note" }
      );
      const h0 = boxOf(v).H;
      math.set(
        "readout",
        layoutW / 2,
        HP2 + 30,
        v.disc ? `H(aX) = H(X) = ${val3(b.H)}\\text{ bits}` : `h(aX) = h(X) + \\log a = ${val3(h0)} ${s < 0 ? "-" : "+"} ${texNum(Math.abs(s))} = ${val3(b.H)}\\text{ bits}`,
        { cls: "ex-ml-formula" }
      );
      math.end();
    }
    slider.addEventListener("input", draw);
    shuffle?.addEventListener("click", () => {
      perm = randomPerm(model.view().p.length);
      draw();
    });
    fitWidth(svg.parentElement, layout);
    const reset = () => {
      slider.value = slider.defaultValue;
      perm = null;
    };
    return { draw, reset };
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

  // src/differential-entropy/svgplot.js
  var NS2 = "http://www.w3.org/2000/svg";
  function el2(tag, attrs, parent) {
    const e = document.createElementNS(NS2, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt2(parent, x, y, s, cls, attrs) {
    const t = el2("text", Object.assign({ x, y, class: cls }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }
  function tfmt(v) {
    if (Math.abs(v) < 1e-9) return "0";
    return String(+v.toPrecision(4)).replace("-", "\u2212");
  }
  function niceTicks2(a, b, n = 5) {
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
  var uid2 = 0;
  var Plot = class {
    // o: { w, h, m: { l, r, t, b } } — viewBox size and margins, in px.
    constructor(svg, o = {}) {
      this.W = o.w || 520;
      this.H = o.h || 320;
      this.m = Object.assign({ l: 48, r: 14, t: 14, b: 40 }, o.m || {});
      svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
      svg.classList.add("de-plot");
      this.svg = svg;
      const id = "de-clip" + uid2++;
      this.id = id;
      const defs = el2("defs", null, svg);
      this.cr = el2("rect", null, el2("clipPath", { id }, defs));
      this.ca = el2("rect", null, el2("clipPath", { id: id + "a" }, defs));
      this.cb = el2("rect", null, el2("clipPath", { id: id + "b" }, defs));
      this.back = el2("g", null, svg);
      this.data = el2("g", { "clip-path": `url(#${id})` }, svg);
      this.front = el2("g", null, svg);
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
      const xt = o.xticks || niceTicks2(this.x0, this.x1, o.nx || 6);
      const yt = o.yticks || niceTicks2(this.y0, this.y1, o.ny || 5);
      const xf = o.xfmt || tfmt, yf = o.yfmt || tfmt;
      for (const v of xt) {
        const x = this.X(v);
        if (x < this.pl - 0.5 || x > this.pr + 0.5) continue;
        if (o.grid !== false) el2("line", { x1: x, x2: x, y1: this.pt, y2: this.pb, class: "gl" }, g);
        txt2(g, x, this.pb + 15, xf(v), "tk", { "text-anchor": "middle" });
      }
      for (const v of yt) {
        const y = this.Y(v);
        if (y < this.pt - 0.5 || y > this.pb + 0.5) continue;
        if (o.grid !== false) el2("line", { x1: this.pl, x2: this.pr, y1: y, y2: y, class: "gl" }, g);
        txt2(g, this.pl - 6, y + 3.5, yf(v), "tk", { "text-anchor": "end" });
      }
      el2("line", { x1: this.pl, x2: this.pr, y1: this.pb, y2: this.pb, class: "ax" }, g);
      el2("line", { x1: this.pl, x2: this.pl, y1: this.pt, y2: this.pb, class: "ax" }, g);
      if (this.y0 < 0 && this.y1 > 0) {
        el2("line", { x1: this.pl, x2: this.pr, y1: this.Y(0), y2: this.Y(0), class: "ax zero" }, g);
      }
      if (o.xlabel) txt2(g, (this.pl + this.pr) / 2, this.H - 6, o.xlabel, "axl", { "text-anchor": "middle" });
      if (o.ylabel) {
        const cy = (this.pt + this.pb) / 2;
        txt2(g, 12, cy, o.ylabel, "axl", { "text-anchor": "middle", transform: `rotate(-90 12 ${cy})` });
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
      return el2("path", Object.assign({ d: this.d(pts), class: cls }, extra || {}), g || this.data);
    }
    // Filled region between the polyline and y = 0.
    area(pts, cls, g, extra) {
      if (!pts.length) return null;
      const yb = this.Y(clamp(0, this.y0, this.y1)).toFixed(2);
      let s = `M${this.X(pts[0][0]).toFixed(2)} ${yb}`;
      for (const p of pts) s += `L${this.X(p[0]).toFixed(2)} ${this.Y(p[1]).toFixed(2)}`;
      s += `L${this.X(pts[pts.length - 1][0]).toFixed(2)} ${yb}Z`;
      return el2("path", Object.assign({ d: s, class: cls }, extra || {}), g || this.data);
    }
    rect(xa, ya, xb, yb, cls, g) {
      const X0 = this.X(Math.min(xa, xb)), X1 = this.X(Math.max(xa, xb));
      const Y0 = this.Y(Math.max(ya, yb)), Y1 = this.Y(Math.min(ya, yb));
      return el2("rect", {
        x: X0.toFixed(2),
        y: Y0.toFixed(2),
        width: Math.max(0, X1 - X0).toFixed(2),
        height: Math.max(0, Y1 - Y0).toFixed(2),
        class: cls
      }, g || this.data);
    }
    line(xa, ya, xb, yb, cls, g) {
      return el2("line", { x1: this.X(xa), y1: this.Y(ya), x2: this.X(xb), y2: this.Y(yb), class: cls }, g || this.data);
    }
    hline(y, cls, g) {
      return el2("line", { x1: this.pl, x2: this.pr, y1: this.Y(y), y2: this.Y(y), class: cls }, g || this.data);
    }
    circle(x, y, r, cls, g) {
      return el2("circle", { cx: this.X(x), cy: this.Y(y), r, class: cls }, g || this.data);
    }
    // Groups clipped to the part of the plot above / below y = 0.
    gAbove() {
      return el2("g", { "clip-path": `url(#${this.id}a)` }, this.data);
    }
    gBelow() {
      return el2("g", { "clip-path": `url(#${this.id}b)` }, this.data);
    }
  };

  // src/differential-entropy/ui.js
  var MINUS2 = "\u2212";
  function fmt(v, d = 2) {
    if (!isFinite(v)) return v > 0 ? "\u221E" : MINUS2 + "\u221E";
    const s = Math.abs(v).toFixed(d);
    const neg = v < 0 && Number(s) !== 0;
    return (neg ? MINUS2 : "") + s;
  }
  function setSigned(node, v, d = 2) {
    if (!node) return;
    node.textContent = fmt(v, d);
    node.classList.toggle("neg", v < 0 && Number(Math.abs(v).toFixed(d)) !== 0);
  }
  function setText(node, s) {
    if (node) node.textContent = s;
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
        txt2(P2.back, P2.X(i + 0.5), P2.pb + 18, label, "axl", { "text-anchor": "middle" });
        const y = v >= 0 ? P2.Y(Math.min(v, 8)) - 6 : P2.Y(Math.max(v, -6)) + 15;
        txt2(P2.front, P2.X(i + 0.5), y, fmt(v), "lbl b", { "text-anchor": "middle" });
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
  var WHOLE = { x: Infinity, u: 1 };
  var $3 = (id) => document.getElementById(id);
  function init() {
    const areaSvg = $3("de-area"), widthSvg = $3("de-width"), quantSvg = $3("de-quantize"), stretchSvg = $3("de-stretch");
    if (areaSvg || widthSvg || quantSvg || stretchSvg) {
      let redraw = function() {
        area?.draw(computeFrame(model, WHOLE, ui.g));
        width?.draw();
        quant?.draw();
        stretch?.draw();
        controls?.update();
      };
      const model = createModel(), pos = createPosition(model);
      const ui = { g: "neglog", gBase: "neglog", gc: null, ghost: true };
      let controls = null, area = null, width = null, quant = null, stretch = null;
      const ctx = { model, pos, ui, redraw, customG: () => {
      }, stopPlay: () => {
      }, onReset: () => {
        quant?.reset();
        stretch?.reset();
      } };
      controls = bindControls(ctx);
      if (areaSvg) area = createAreaFigure(areaSvg, ctx, { sweep: false, notes: "entropy" });
      if (widthSvg) width = createTransformFigure(widthSvg, ctx, { width: true });
      if (quantSvg) quant = createQuantizeFigure(quantSvg, ctx, { slider: $3("de-q-delta"), label: $3("de-q-deltav") });
      if (stretchSvg) stretch = createStretchFigure(stretchSvg, ctx, { slider: $3("de-s-a"), label: $3("de-s-av"), shuffle: $3("de-s-shuffle") });
      model.subscribe(() => {
        pos.refresh();
        redraw();
      });
      redraw();
    }
    initMI();
  }

  // src/differential-entropy/index.js
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
