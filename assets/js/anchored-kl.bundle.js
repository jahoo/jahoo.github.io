(() => {
  // src/anchored-kl/config.js
  var DEFAULT_K = 10;
  var MIN_P = 2e-3;
  var VALID_COLOR = "rgb(41, 128, 185)";
  var INVALID_COLOR = "rgb(192, 57, 43)";
  var BETA_MIN = 0.01;
  var BETA_MAX = 100;
  var DEFAULT_BETA = 0.5;
  var defaultPrior = (k2) => Array.from({ length: k2 }, (_, i) => Math.exp(-((i - (k2 - 1) / 2) ** 2) / (2 * (k2 / 5) ** 2)));
  function defaultValid(k2) {
    const lo = Math.round(0.35 * k2), hi = Math.round(0.65 * k2);
    const v = Array.from({ length: k2 }, (_, i) => !(i >= lo && i < hi));
    if (v.every(Boolean)) v[k2 - 1] = false;
    return v;
  }

  // src/anchored-kl/model.js
  function normalize(arr) {
    const s = arr.reduce((a, b) => a + b, 0);
    return arr.map((v) => v / s);
  }
  function withProb(probs2, i, target) {
    target = Math.max(MIN_P, Math.min(1 - (probs2.length - 1) * MIN_P, target));
    const scale = (1 - target) / (1 - probs2[i]);
    return normalize(probs2.map((p, j) => j === i ? target : Math.max(MIN_P, p * scale)));
  }
  var xlogx = (x, y) => x === 0 ? 0 : x * Math.log(x / y);
  function bernKL(a, Z) {
    return xlogx(a, Z) + xlogx(1 - a, 1 - Z);
  }
  function bernKLPrime(a, Z) {
    return Math.log(a * (1 - Z) / (Z * (1 - a)));
  }
  function fOfAlpha(Z, beta2, a) {
    return -Math.log(a) + beta2 * bernKL(a, Z);
  }
  function fPrimeOfAlpha(Z, beta2, a) {
    return -1 / a + beta2 * Math.log(a * (1 - Z) / (Z * (1 - a)));
  }
  function solveAlpha(Z, beta2) {
    if (Z >= 1) return 1;
    if (Z <= 0) return 0;
    if (beta2 === 0) return 1;
    if (beta2 === Infinity) return Z;
    const g = (a) => Z / (Z + Math.exp(-1 / (a * beta2)) * (1 - Z));
    let lo = Z, hi = 1;
    for (let it = 0; it < 100; it++) {
      const mid = (lo + hi) / 2;
      if (g(mid) > mid) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function betaOfAlpha(Z, alpha) {
    if (alpha >= 1) return 0;
    if (alpha <= Z) return Infinity;
    return 1 / (alpha * Math.log(alpha * (1 - Z) / (Z * (1 - alpha))));
  }
  function epsBeta(alpha, beta2) {
    if (beta2 === Infinity) return 1;
    return Math.exp(-1 / (alpha * beta2));
  }
  function anchoredOptimum(prior, valid2, beta2) {
    const p = normalize(prior);
    const Z = p.reduce((s, v, i) => s + (valid2[i] ? v : 0), 0);
    if (Z <= 0) return { q: p, alpha: 0, eps: 1, Z: 0 };
    if (Z >= 1) return { q: p, alpha: 1, eps: 1, Z: 1 };
    const alpha = solveAlpha(Z, beta2);
    const eps = epsBeta(alpha, beta2);
    const q = normalize(p.map((v, i) => v * (valid2[i] ? 1 : eps)));
    return { q, alpha, eps, Z };
  }

  // src/anchored-kl/drawing.js
  function resetCanvas(canvas) {
    const d = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w, h };
  }
  function getPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e.changedTouches ? e.changedTouches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  var SANS = "-apple-system, BlinkMacSystemFont, sans-serif";
  function drawLabel(ctx, cx, y, parts) {
    const widths = parts.map((p) => {
      ctx.font = p.font;
      return ctx.measureText(p.text).width;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let x = cx - total / 2;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    parts.forEach((p, i) => {
      ctx.font = p.font;
      ctx.fillStyle = p.color || "#555";
      ctx.fillText(p.text, x, y + (p.dy || 0));
      x += widths[i];
    });
  }
  var IT = "italic 14px Georgia, serif";
  var IT_SM = "italic 9px Georgia, serif";
  var fmtTick = (v) => Number(v.toPrecision(2)).toString();
  function layoutMain(w, h, k2) {
    const top = 34, bottom = 24, left = 10, right = 12, gap = 26;
    const potW = 54;
    const probW = Math.max(40, (w - left - right - potW - 3 * gap) / 3);
    const rowsH = h - top - bottom;
    const rowH = rowsH / k2;
    const barH = Math.min(rowH * 0.6, 20);
    const rowY = (i) => top + (i + 0.5) * rowH;
    const rowAt = (y) => {
      const i = Math.floor((y - top) / rowH);
      return i >= 0 && i < k2 ? i : -1;
    };
    const pot = { x: left, w: potW };
    const prior = { x: left + potW + gap, w: probW };
    const post = { x: prior.x + probW + gap, w: probW };
    const opt = { x: post.x + probW + gap, w: probW };
    return { top, bottom, rowsH, rowH, barH, rowY, rowAt, pot, prior, post, opt };
  }
  var TITLES = {
    pot: { parts: [{ text: "r", font: IT }], word: "potential" },
    prior: { parts: [{ text: "p", font: IT }], word: "prior" },
    post: {
      parts: [{ text: "\u03C0", font: IT, color: "rgb(41, 128, 185)" }],
      word: "posterior"
    },
    opt: {
      parts: [
        { text: "q", font: IT },
        { text: "\u2605", font: "7px Georgia, serif", dy: -6 },
        { text: "\u03B2", font: IT_SM, dy: 3 }
      ],
      word: "optimum"
    }
  };
  function drawTitle(ctx, L2, P, key) {
    const t = TITLES[key];
    const cx = P.x + P.w / 2;
    drawLabel(ctx, cx, L2.top - 20, t.parts);
    ctx.font = "9px " + SANS;
    ctx.fillStyle = "#999";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(t.word, cx, L2.top - 8);
  }
  function drawBaseline(ctx, L2, P) {
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.x, L2.top);
    ctx.lineTo(P.x, L2.top + L2.rowsH);
    ctx.stroke();
  }
  function xTick(ctx, L2, x, label, align = "center") {
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, L2.top + L2.rowsH);
    ctx.lineTo(x, L2.top + L2.rowsH + 4);
    ctx.stroke();
    ctx.font = "9px " + SANS;
    ctx.fillStyle = "#888";
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(label, x, L2.top + L2.rowsH + 6);
  }
  function drawHBarCol(ctx, L2, P, values, opts) {
    const k2 = values.length;
    drawBaseline(ctx, L2, P);
    drawTitle(ctx, L2, P, opts.title);
    xTick(ctx, L2, P.x, "0", "left");
    xTick(ctx, L2, P.x + P.w, fmtTick(opts.xmax), "right");
    if (1 / k2 <= opts.xmax) {
      const xU = P.x + 1 / k2 / opts.xmax * P.w;
      ctx.save();
      ctx.strokeStyle = "#ccc";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(xU, L2.top);
      ctx.lineTo(xU, L2.top + L2.rowsH);
      ctx.stroke();
      ctx.restore();
      if (opts.title === "prior") {
        ctx.font = "italic 9px Georgia, serif";
        ctx.fillStyle = "#aaa";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("1/K", xU, L2.top + L2.rowsH + 6);
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.x, L2.top, P.w, L2.rowsH);
    ctx.clip();
    values.forEach((v, i) => {
      const cy = L2.rowY(i);
      const len = v / opts.xmax * P.w;
      const color = opts.colors[i];
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(P.x, cy - L2.barH / 2, len, L2.barH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(P.x, cy - L2.barH / 2, len, L2.barH);
      if (opts.handles) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(P.x + len, cy - L2.barH / 2);
        ctx.lineTo(P.x + len, cy + L2.barH / 2);
        ctx.stroke();
      }
    });
    ctx.restore();
  }
  function drawPotentialCol(ctx, L2, P, valid2, colors) {
    drawBaseline(ctx, L2, P);
    drawTitle(ctx, L2, P, "pot");
    xTick(ctx, L2, P.x, "0", "left");
    xTick(ctx, L2, P.x + P.w, "1", "right");
    valid2.forEach((isValid, i) => {
      const cy = L2.rowY(i);
      const color = isValid ? colors.valid : colors.invalid;
      if (isValid) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(P.x, cy - L2.barH / 2, P.w, L2.barH);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(P.x, cy - L2.barH / 2, P.w, L2.barH);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(P.x + 1.5, cy - L2.barH / 2);
        ctx.lineTo(P.x + 1.5, cy + L2.barH / 2);
        ctx.stroke();
      }
    });
  }
  function drawAlphaCurve(ctx, w, h, data) {
    const left = 18, right = 6, top = 8, bottom = 16;
    const P = { x: left, y: top, w: w - left - right, h: h - top - bottom };
    if (P.w < 20 || P.h < 20) return null;
    const xOf = (f) => P.x + f * P.w;
    const yOf = (a) => P.y + (1 - a) * P.h;
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1;
    [0, 1].forEach((a) => {
      ctx.beginPath();
      ctx.moveTo(P.x, yOf(a));
      ctx.lineTo(P.x + P.w, yOf(a));
      ctx.stroke();
    });
    const showZ = data.Z > 0 && data.Z < 1;
    if (showZ) {
      ctx.save();
      ctx.strokeStyle = "#bbb";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(P.x, yOf(data.Z));
      ctx.lineTo(P.x + P.w, yOf(data.Z));
      ctx.stroke();
      ctx.restore();
    }
    ctx.font = "9px " + SANS;
    ctx.fillStyle = "#999";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("1", P.x - 3, yOf(1));
    ctx.fillText("0", P.x - 3, yOf(0));
    if (showZ && yOf(data.Z) - yOf(1) > 9 && yOf(0) - yOf(data.Z) > 9) {
      ctx.font = "italic 9px Georgia, serif";
      ctx.fillText("Z", P.x - 3, yOf(data.Z));
      ctx.font = "9px " + SANS;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xy = P.y + P.h + 3;
    ctx.fillText("0", xOf(0), xy);
    ctx.fillText("1", xOf(0.5), xy);
    ctx.fillText("\u221E", xOf(1), xy);
    ctx.font = "italic 10px Georgia, serif";
    ctx.fillText("\u03B2", xOf(0.75), xy);
    const drawPath = (pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(p.f), yOf(p.a));
        else ctx.lineTo(xOf(p.f), yOf(p.a));
      });
      ctx.stroke();
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.x, P.y - 1, P.w, P.h + 2);
    ctx.clip();
    if (data.approx) {
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      drawPath(data.approx);
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1.5;
    drawPath(data.curve);
    ctx.restore();
    if (data.dot) {
      ctx.fillStyle = data.dotColor || "#444";
      ctx.beginPath();
      ctx.arc(xOf(data.dot.f), yOf(data.dot.a), 3.2, 0, 2 * Math.PI);
      ctx.fill();
    }
    return {
      dot: data.dot ? { x: xOf(data.dot.f), y: yOf(data.dot.a) } : null,
      fOfX: (x) => Math.max(0, Math.min(1, (x - P.x) / P.w))
    };
  }
  var FP_WINDOW = 3;
  function drawFPlot(ctx, w, h, data) {
    const left = 34, right = 10, top = 8, bottom = 20, gap = 16;
    const W = w - left - right;
    const H = h - top - bottom - gap;
    if (W < 40 || H < 60) return null;
    const fh = Math.round(H * 0.55);
    const F = { y: top, h: fh };
    const D = { y: top + fh + gap, h: H - fh };
    const xOf = (a) => left + Math.max(0, Math.min(1, a)) * W;
    const ys = data.fCurve.map((p) => p.y).filter(Number.isFinite);
    if (!ys.length) return null;
    const fmin = Math.min(...ys);
    const fmax = Math.max(
      fmin + 1e-6,
      Math.min(Math.max(...ys), fmin + FP_WINDOW)
    );
    const vis = data.fCurve.filter((p) => p.y <= fmax);
    const nearest = (curve, a) => curve.reduce((b, p) => Math.abs(p.a - a) < Math.abs(b.a - a) ? p : b);
    let pLo = nearest(data.fpCurve, vis[0].a).y;
    let pHi = nearest(data.fpCurve, vis[vis.length - 1].a).y;
    if (!(pHi - pLo > 1e-6)) {
      pLo -= 1;
      pHi += 1;
    }
    const yF = (v) => F.y + (fmax - v) / (fmax - fmin) * F.h;
    const yD = (v) => D.y + (pHi - v) / (pHi - pLo) * D.h;
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1;
    [F, D].forEach((P) => {
      ctx.beginPath();
      ctx.moveTo(left, P.y);
      ctx.lineTo(left, P.y + P.h);
      ctx.stroke();
    });
    ctx.strokeStyle = "#999";
    ctx.beginPath();
    ctx.moveTo(left, D.y + D.h);
    ctx.lineTo(left + W, D.y + D.h);
    ctx.stroke();
    ctx.font = "9px " + SANS;
    ctx.fillStyle = "#999";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const ty = D.y + D.h + 5;
    ctx.fillText("0", xOf(0), ty);
    ctx.fillText("1", xOf(1), ty);
    ctx.font = "italic 9px Georgia, serif";
    ctx.fillText("Z", xOf(data.Z), ty);
    ctx.font = "italic 10px Georgia, serif";
    ctx.fillText("\u03B1", xOf(0.5), ty);
    drawLabel(ctx, left - 18, F.y + 12, [{ text: data.fLabel, font: IT }]);
    drawLabel(ctx, left - 18, D.y + 12, [{ text: data.fpLabel, font: IT }]);
    ctx.save();
    ctx.strokeStyle = "#ddd";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(xOf(data.Z), F.y);
    ctx.lineTo(xOf(data.Z), D.y + D.h);
    ctx.stroke();
    ctx.restore();
    if (pLo < 0 && pHi > 0) {
      ctx.save();
      ctx.strokeStyle = "#bbb";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(left, yD(0));
      ctx.lineTo(left + W, yD(0));
      ctx.stroke();
      ctx.restore();
      ctx.font = "9px " + SANS;
      ctx.fillStyle = "#999";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText("0", left - 4, yD(0));
    }
    ctx.save();
    ctx.strokeStyle = "#aaa";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xOf(data.alpha), F.y);
    ctx.lineTo(xOf(data.alpha), D.y + D.h);
    ctx.stroke();
    ctx.restore();
    const drawCurve = (pts, yMap, P) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, P.y - 1, W, P.h + 2);
      ctx.clip();
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let pen = false;
      pts.forEach((p) => {
        if (!Number.isFinite(p.y)) {
          pen = false;
          return;
        }
        const x = xOf(p.a), y = yMap(p.y);
        if (!pen) {
          ctx.moveTo(x, y);
          pen = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    };
    drawCurve(data.fCurve, yF, F);
    drawCurve(data.fpCurve, yD, D);
    const clampY = (y, P) => Math.max(P.y, Math.min(P.y + P.h, y));
    const dots = [
      { x: xOf(data.alpha), y: clampY(yF(data.fAtAlpha), F) },
      { x: xOf(data.alpha), y: clampY(yD(data.fpAtAlpha), D) }
    ];
    ctx.fillStyle = data.dotColor || "#444";
    dots.forEach((d) => {
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3.2, 0, 2 * Math.PI);
      ctx.fill();
    });
    return {
      dots,
      alphaOfX: (x) => Math.max(0, Math.min(1, (x - left) / W))
    };
  }
  function drawSegment(ctx, w, h, data) {
    const left = 40, right = 14;
    const x0 = left, x1 = w - right;
    if (x1 - x0 < 60) return null;
    const y = Math.round(h * 0.52);
    const xOf = (a) => x1 - a * (x1 - x0);
    const xZ = xOf(data.Z);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(xZ, y);
    ctx.stroke();
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xZ, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.lineWidth = 2;
    [[x0, data.validColor], [x1, data.invalidColor]].forEach(([x, c]) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
    });
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xZ, y - 6);
    ctx.lineTo(xZ, y + 6);
    ctx.stroke();
    ctx.font = "italic 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = data.validColor;
    ctx.fillText("\u03C0", x0, y + 18);
    const zClear = xZ - x0 > 14 && x1 - xZ > 14;
    if (zClear) {
      ctx.font = IT;
      ctx.fillStyle = "#555";
      ctx.fillText("p", xZ, y + 18);
    }
    ctx.save();
    ctx.translate(x1, y + 18);
    ctx.rotate(Math.PI);
    ctx.font = "italic 15px Georgia, serif";
    ctx.fillStyle = data.invalidColor;
    ctx.fillText("\u03C0", 0, 1);
    ctx.restore();
    const vy = y + 32;
    ctx.font = "9px " + SANS;
    ctx.fillStyle = "#999";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("1", x0, vy);
    ctx.fillText("0", x1, vy);
    if (zClear) {
      ctx.font = "italic 9px Georgia, serif";
      ctx.fillText("Z", xZ, vy);
    }
    drawLabel(ctx, x0 - 20, vy + 3, [
      { text: "\u03B1", font: "italic 11px Georgia, serif", color: "#999" },
      { text: "\u03B2", font: "italic 8px Georgia, serif", dy: 2, color: "#999" },
      { text: ":", font: "9px " + SANS, color: "#999" }
    ]);
    const xA = xOf(data.alpha);
    ctx.fillStyle = data.dotColor || "#444";
    ctx.beginPath();
    ctx.arc(xA, y, 4, 0, 2 * Math.PI);
    ctx.fill();
    drawLabel(ctx, xA, y - 12, [
      { text: "q", font: IT },
      { text: "\u2605", font: "7px Georgia, serif", dy: -5 },
      { text: "\u03B2", font: IT_SM, dy: 3 }
    ]);
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    return {
      dot: { x: xA, y },
      alphaOfX: (x) => clamp01((x1 - x) / (x1 - x0))
    };
  }

  // src/anchored-kl/main.js
  var k = DEFAULT_K;
  var probs = normalize(defaultPrior(k));
  var valid = defaultValid(k);
  var beta = DEFAULT_BETA;
  var L = null;
  var hitM = null;
  var hitS = null;
  var hitF = null;
  var cvMain;
  var cvM;
  var cvS;
  var cvF;
  var slider;
  var sliderF;
  var kSlider;
  var roBeta;
  var roAlpha;
  var roZ;
  var roK;
  var roBetaF;
  var SLIDER_MAX = 1e3;
  function sliderToBeta(v) {
    if (v <= 0) return 0;
    if (v >= SLIDER_MAX) return Infinity;
    return BETA_MIN * Math.pow(BETA_MAX / BETA_MIN, v / SLIDER_MAX);
  }
  function betaToSlider(b) {
    if (b === 0) return 0;
    if (b === Infinity) return SLIDER_MAX;
    const f = Math.log(b / BETA_MIN) / Math.log(BETA_MAX / BETA_MIN);
    return Math.round(Math.max(0, Math.min(1, f)) * SLIDER_MAX);
  }
  var THUMB_W = 14;
  var thumbX = (f) => `calc(${THUMB_W / 2}px + ${f} * (100% - ${THUMB_W}px))`;
  function buildTickLabels() {
    const ticks = [["0", 0], ["1", 0.5], ["\u221E", 1]];
    document.querySelectorAll(".akl-slider-ticks").forEach((wrap) => {
      wrap.replaceChildren(...ticks.map(([text, f]) => {
        const s = document.createElement("span");
        s.textContent = text;
        s.style.left = thumbX(f);
        return s;
      }));
    });
  }
  function accentColor() {
    const f = betaToSlider(beta) / SLIDER_MAX;
    const a = [41, 128, 185], b = [150, 156, 164];
    const rgb = [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * f));
    return `rgb(${rgb.join(",")})`;
  }
  var typeset = (s) => s.replace("-", "\u2212");
  function fmtBeta(b) {
    if (b === 0) return "0";
    if (b === Infinity) return "\u221E";
    return typeset(Number(b.toPrecision(3)).toString());
  }
  var fmtProb = (v) => {
    if (v === 0) return "0";
    if (v === 1) return "1";
    if (v < 1e-3) return typeset(v.toExponential(2));
    return typeset(Number(v.toPrecision(3)).toString());
  };
  function mainHeight() {
    const rowH = k <= 10 ? 28 : k <= 20 ? 22 : 14;
    return 34 + k * rowH + 26;
  }
  var dragXmax = null;
  function niceXmax(m) {
    return Math.min(1, Math.max(0.1, Math.ceil(m * 1.08 * 20) / 20));
  }
  function computePosterior() {
    const Z = probs.reduce((s, p, i) => s + (valid[i] ? p : 0), 0);
    return Z > 0 ? normalize(probs.map((p, i) => valid[i] ? p : 0)) : probs.slice();
  }
  function redraw() {
    if (!cvMain) return;
    const { q, alpha, Z } = anchoredOptimum(probs, valid, beta);
    const posterior = computePosterior();
    const xmax = dragXmax ?? niceXmax(Math.max(...probs, ...posterior, ...q));
    const colors = valid.map((v) => v ? VALID_COLOR : INVALID_COLOR);
    {
      const { ctx, w, h } = resetCanvas(cvMain);
      L = layoutMain(w, h, k);
      drawPotentialCol(ctx, L, L.pot, valid, {
        valid: VALID_COLOR,
        invalid: INVALID_COLOR
      });
      drawHBarCol(ctx, L, L.prior, probs, {
        colors,
        xmax,
        title: "prior",
        handles: true
      });
      drawHBarCol(ctx, L, L.post, posterior, {
        colors,
        xmax,
        title: "post"
      });
      drawHBarCol(ctx, L, L.opt, q, {
        colors,
        xmax,
        title: "opt"
      });
    }
    if (cvS) {
      const { ctx, w, h } = resetCanvas(cvS);
      hitS = drawSegment(ctx, w, h, {
        Z,
        alpha,
        dotColor: accentColor(),
        validColor: VALID_COLOR,
        invalidColor: INVALID_COLOR
      });
    }
    redrawMargin(alpha, Z);
    redrawF(alpha, Z);
    if (roBeta) roBeta.textContent = fmtBeta(beta);
    if (roBetaF) roBetaF.textContent = fmtBeta(beta);
    if (roAlpha) roAlpha.textContent = Z >= 1 ? "1" : fmtProb(alpha);
    if (roZ) roZ.textContent = fmtProb(Z);
    [slider, sliderF].forEach((s) => {
      if (!s) return;
      s.value = String(betaToSlider(beta));
      s.style.setProperty("--akl-accent", accentColor());
    });
  }
  function redrawMargin(alpha, Z) {
    if (!cvM) return;
    hitM = null;
    const { ctx, w, h } = resetCanvas(cvM);
    if (w < 30) return;
    const N = 120;
    const curve = Array.from({ length: N + 1 }, (_, i) => {
      const f = i / N;
      return { f, a: solveAlpha(Z, sliderToBeta(f * SLIDER_MAX)) };
    });
    const approx = Z > 0 && Z < 1 ? curve.map(({ f }) => {
      const b = sliderToBeta(f * SLIDER_MAX);
      const a = b === 0 ? 1 : 1 - (1 - Z) / Z * Math.exp(-1 / b);
      return { f, a };
    }) : null;
    hitM = drawAlphaCurve(ctx, w, h, {
      curve,
      approx,
      Z,
      dot: { f: betaToSlider(beta) / SLIDER_MAX, a: alpha },
      dotColor: accentColor()
    });
  }
  function fShapes(Z, b) {
    if (b === Infinity) {
      return {
        f: (a) => bernKL(a, Z),
        fp: (a) => bernKLPrime(a, Z),
        fLabel: "f\u2215\u03B2",
        fpLabel: "f\u2032\u2215\u03B2"
      };
    }
    return {
      f: (a) => fOfAlpha(Z, b, a),
      fp: (a) => fPrimeOfAlpha(Z, b, a),
      fLabel: "f",
      fpLabel: "f\u2032"
    };
  }
  function redrawF(alpha, Z) {
    if (!cvF) return;
    hitF = null;
    const { ctx, w, h } = resetCanvas(cvF);
    if (w < 40) return;
    if (Z <= 0 || Z >= 1) return;
    const { f, fp, fLabel, fpLabel } = fShapes(Z, beta);
    const N = 240, lo = 2e-3, hi = 0.998;
    const fCurve = [], fpCurve = [];
    for (let i = 0; i <= N; i++) {
      const a = lo + i / N * (hi - lo);
      fCurve.push({ a, y: f(a) });
      fpCurve.push({ a, y: fp(a) });
    }
    const aDot = Math.max(lo, Math.min(hi, alpha));
    hitF = drawFPlot(ctx, w, h, {
      fCurve,
      fpCurve,
      Z,
      alpha: aDot,
      fAtAlpha: f(aDot),
      fpAtAlpha: fp(aDot),
      fLabel,
      fpLabel,
      dotColor: accentColor()
    });
  }
  var dragKind = null;
  var dragIdx = -1;
  var paintVal = null;
  function inCol(pos, P, pad = 10) {
    return pos.x >= P.x - pad && pos.x <= P.x + P.w + pad;
  }
  var countValid = () => valid.reduce((s, v) => s + (v ? 1 : 0), 0);
  function setValid(i, to) {
    if (!to && valid[i] && countValid() === 1) return;
    valid[i] = to;
  }
  function barDragTo(pos) {
    const P = L.prior;
    const target = (pos.x - P.x) / P.w * dragXmax;
    probs = withProb(probs, dragIdx, target);
    redraw();
  }
  function onDown(e) {
    if (!L) return;
    const pos = getPos(cvMain, e);
    const i = L.rowAt(pos.y);
    if (i === -1) return;
    if (inCol(pos, L.pot)) {
      dragKind = "paint";
      paintVal = !valid[i];
      setValid(i, paintVal);
      e.preventDefault();
      redraw();
    } else if (inCol(pos, L.prior)) {
      dragKind = "bar";
      dragIdx = i;
      dragXmax = niceXmax(Math.max(
        ...probs,
        ...computePosterior(),
        ...anchoredOptimum(probs, valid, beta).q
      ));
      e.preventDefault();
      barDragTo(pos);
    }
  }
  function dotHit(hit, pos) {
    if (!hit) return false;
    const dots = hit.dots || (hit.dot ? [hit.dot] : []);
    return dots.some((d) => Math.abs(pos.x - d.x) < 12 && Math.abs(pos.y - d.y) < 14);
  }
  function betaFromMargin(x) {
    return sliderToBeta(Math.round(hitM.fOfX(x) * SLIDER_MAX));
  }
  function betaFromSegment(x) {
    const Z = probs.reduce((s, p, i) => s + (valid[i] ? p : 0), 0);
    let b = betaOfAlpha(Z, hitS.alphaOfX(x));
    if (b < BETA_MIN) b = 0;
    if (b > BETA_MAX) b = Infinity;
    return b;
  }
  function betaFromF(x) {
    const Z = probs.reduce((s, p, i) => s + (valid[i] ? p : 0), 0);
    let b = betaOfAlpha(Z, hitF.alphaOfX(x));
    if (b < BETA_MIN) b = 0;
    if (b > BETA_MAX) b = Infinity;
    return b;
  }
  function bindBetaDot(cv, kind, hitGetter, betaAt) {
    if (!cv) return;
    const onDotDown = (e) => {
      const pos = getPos(cv, e);
      if (!dotHit(hitGetter(), pos)) return;
      dragKind = kind;
      e.preventDefault();
      beta = betaAt(pos.x);
      redraw();
    };
    cv.addEventListener("mousedown", onDotDown);
    cv.addEventListener("touchstart", onDotDown, { passive: false });
    cv.addEventListener("mousemove", (e) => {
      if (dragKind) return;
      cv.style.cursor = dotHit(hitGetter(), getPos(cv, e)) ? "grab" : "";
    });
  }
  function onMove(e) {
    if (dragKind === "dotM") {
      e.preventDefault();
      beta = betaFromMargin(getPos(cvM, e).x);
      redraw();
    } else if (dragKind === "dotS") {
      e.preventDefault();
      beta = betaFromSegment(getPos(cvS, e).x);
      redraw();
    } else if (dragKind === "dotF") {
      e.preventDefault();
      beta = betaFromF(getPos(cvF, e).x);
      redraw();
    } else if (dragKind === "bar") {
      e.preventDefault();
      barDragTo(getPos(cvMain, e));
    } else if (dragKind === "paint") {
      e.preventDefault();
      const pos = getPos(cvMain, e);
      const i = L.rowAt(pos.y);
      if (i !== -1 && valid[i] !== paintVal) {
        setValid(i, paintVal);
        redraw();
      }
    } else if (!e.touches && L && cvMain) {
      const pos = getPos(cvMain, e);
      const i = L.rowAt(pos.y);
      cvMain.style.cursor = i === -1 ? "" : inCol(pos, L.pot) ? "pointer" : inCol(pos, L.prior) ? "ew-resize" : "";
    }
  }
  function onUp() {
    if (dragKind === "bar") {
      dragKind = null;
      dragXmax = null;
      redraw();
    }
    dragKind = null;
    dragIdx = -1;
  }
  function init() {
    cvMain = document.getElementById("cv-akl-main");
    cvM = document.getElementById("cv-akl-alpha");
    cvS = document.getElementById("cv-akl-segment");
    cvF = document.getElementById("cv-akl-f");
    slider = document.getElementById("akl-beta");
    sliderF = document.getElementById("akl-beta-f");
    kSlider = document.getElementById("akl-k");
    roBeta = document.getElementById("akl-readout-beta");
    roAlpha = document.getElementById("akl-readout-alpha");
    roZ = document.getElementById("akl-readout-z");
    roK = document.getElementById("akl-readout-k");
    roBetaF = document.getElementById("akl-readout-beta-f");
    if (!cvMain) return;
    cvMain.style.height = mainHeight() + "px";
    if (slider) {
      slider.max = String(SLIDER_MAX);
      slider.value = String(betaToSlider(beta));
      slider.addEventListener("input", () => {
        beta = sliderToBeta(Number(slider.value));
        redraw();
      });
    }
    if (sliderF) {
      sliderF.max = String(SLIDER_MAX);
      sliderF.value = String(betaToSlider(beta));
      sliderF.addEventListener("input", () => {
        beta = sliderToBeta(Number(sliderF.value));
        redraw();
      });
    }
    const kDrop = document.querySelector(".akl-k-dropdown");
    if (kDrop) {
      document.addEventListener("pointerdown", (e) => {
        if (kDrop.open && !kDrop.contains(e.target)) kDrop.open = false;
      });
    }
    if (kSlider) {
      kSlider.value = String(k);
      if (roK) roK.textContent = String(k);
      kSlider.addEventListener("input", () => {
        const next = Number(kSlider.value);
        if (next === k) return;
        k = next;
        probs = normalize(defaultPrior(k));
        valid = defaultValid(k);
        if (roK) roK.textContent = String(k);
        cvMain.style.height = mainHeight() + "px";
        redraw();
      });
    }
    document.querySelectorAll(".margin-toggle").forEach((t) => t.addEventListener("change", () => setTimeout(redraw, 0)));
    const fold = cvF && cvF.closest("details");
    if (fold) fold.addEventListener("toggle", () => redraw());
    cvMain.addEventListener("mousedown", onDown);
    cvMain.addEventListener("touchstart", onDown, { passive: false });
    bindBetaDot(cvM, "dotM", () => hitM, betaFromMargin);
    bindBetaDot(cvS, "dotS", () => hitS, betaFromSegment);
    bindBetaDot(cvF, "dotF", () => hitF, betaFromF);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    window.addEventListener("resize", redraw);
    buildTickLabels();
    redraw();
  }

  // src/anchored-kl/index.js
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
