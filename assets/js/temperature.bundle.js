(() => {
  // src/temperature/config.js
  var K = 8;
  var MIN_P = 0.01;
  var T_MIN = 0.05;
  var T_MAX = 20;
  var LOG_FLOOR = -9;
  var BASE_COLOR = "rgb(150, 156, 164)";
  var COLD_RGB = [41, 128, 185];
  var NEUTRAL_RGB = [150, 156, 164];
  var HOT_RGB = [224, 102, 46];
  var VIOLET_RGB = [142, 68, 173];
  var PRESETS = {
    unimodal: [0.05, 0.08, 0.12, 0.3, 0.2, 0.12, 0.08, 0.05],
    uniform: [1, 1, 1, 1, 1, 1, 1, 1],
    peaked: [0.02, 0.03, 0.05, 0.62, 0.13, 0.07, 0.05, 0.03],
    bimodal: [0.05, 0.28, 0.09, 0.03, 0.03, 0.09, 0.28, 0.15],
    zipf: [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8]
  };

  // src/temperature/model.js
  function normalize(arr) {
    const s = arr.reduce((a, b) => a + b, 0);
    return arr.map((v) => v / s);
  }
  function isNegativeTemp(T2) {
    return T2 < 0 || Object.is(T2, -0);
  }
  function temper(p, T2) {
    if (Object.is(T2, -0)) {
      const min = Math.min(...p.filter((v) => v > 0));
      return normalize(p.map((v) => v === min ? 1 : 0));
    }
    if (T2 === 0) {
      const max = Math.max(...p);
      return normalize(p.map((v) => v === max ? 1 : 0));
    }
    if (T2 === Infinity || T2 === -Infinity) {
      return normalize(p.map((v) => v > 0 ? 1 : 0));
    }
    const logp = p.map((v) => v > 0 ? Math.log(v) / T2 : -Infinity);
    const m = Math.max(...logp.filter(Number.isFinite));
    return normalize(logp.map((l) => Math.exp(l - m)));
  }

  // src/temperature/sliderscale.js
  var SLIDER_MAX = 1e3;
  var LO = Math.log(1 / T_MAX);
  var HI = Math.log(1 / T_MIN);
  function betaToFrac(b) {
    return (Math.log(b) - LO) / (HI - LO);
  }
  function fracToBeta(f) {
    return Math.exp(LO + (HI - LO) * f);
  }
  var clamp01 = (x) => Math.max(0, Math.min(1, x));
  function sliderToT(v, negative2) {
    if (!negative2) {
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
  function tToSlider(t, negative2) {
    if (!negative2) {
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

  // src/temperature/drawing.js
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
  function lerpRGB(a, b, t) {
    return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
  }
  function tempColor(T2) {
    const absT = Math.abs(T2);
    let s;
    if (absT === 0) s = -1;
    else if (absT === Infinity) s = 1;
    else s = Math.max(-1, Math.min(1, Math.log(absT) / Math.log(T_MAX)));
    const rgb = isNegativeTemp(T2) ? lerpRGB(HOT_RGB, VIOLET_RGB, (1 - s) / 2) : s < 0 ? lerpRGB(NEUTRAL_RGB, COLD_RGB, -s) : lerpRGB(NEUTRAL_RGB, HOT_RGB, s);
    return `rgb(${rgb.join(",")})`;
  }
  function layout(w, h) {
    const m = { top: 24, bottom: 28, left: 34, right: 10 };
    const colGap = 36;
    const rowGap = 24;
    const colW = (w - m.left - m.right - colGap) / 2;
    const rowH = (h - m.top - m.bottom - rowGap) / 2;
    const inset = 8;
    const slotW = (colW - 2 * inset) / K;
    const barW = Math.min(slotW * 0.62, 40);
    function panel(col, row) {
      return {
        col,
        row,
        x: m.left + col * (colW + colGap),
        y: m.top + row * (rowH + rowGap),
        w: colW,
        h: rowH
      };
    }
    function barX(P, i) {
      return P.x + inset + (i + 0.5) * slotW;
    }
    function probY(P, v) {
      return P.y + P.h - v * P.h;
    }
    function logY(P, l) {
      return P.y + Math.max(l, LOG_FLOOR) / LOG_FLOOR * P.h;
    }
    return { inset, slotW, barW, panel, barX, probY, logY };
  }
  var SANS = "-apple-system, BlinkMacSystemFont, sans-serif";
  function drawPanelLabel(ctx, cx, y, { pre, sym, sup }) {
    const parts = [
      pre && { font: "12px Georgia, serif", text: pre },
      { font: "italic 13px Georgia, serif", text: sym, gapAfter: sup ? 1 : 0 },
      sup && { font: "italic 9px Georgia, serif", text: sup, dy: -5 }
    ].filter(Boolean);
    const widths = parts.map((p) => {
      ctx.font = p.font;
      return ctx.measureText(p.text).width;
    });
    const total = parts.reduce((sum, p, i) => sum + widths[i] + (p.gapAfter || 0), 0);
    let x = cx - total / 2;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#555";
    parts.forEach((p, i) => {
      ctx.font = p.font;
      ctx.fillText(p.text, x, y + (p.dy || 0));
      x += widths[i] + (p.gapAfter || 0);
    });
  }
  function drawTick(ctx, x, y, label) {
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.font = "10px " + SANS;
    ctx.fillStyle = "#888";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x - 7, y);
  }
  function drawUniformRef(ctx, P, y, label) {
    ctx.save();
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(P.x + 2, y);
    ctx.lineTo(P.x + P.w - 2, y);
    ctx.stroke();
    ctx.restore();
    if (P.col === 0) {
      ctx.font = "italic 9px Georgia, serif";
      ctx.fillStyle = "#aaa";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, P.x + P.w + 4, y);
    }
  }
  function drawProbPanel(ctx, L2, P, values, opts) {
    const y0 = L2.probY(P, 0);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.x, y0);
    ctx.lineTo(P.x + P.w, y0);
    ctx.stroke();
    if (P.col === 0) {
      drawTick(ctx, P.x, L2.probY(P, 0), "0");
      drawTick(ctx, P.x, L2.probY(P, 1), "1");
    }
    drawUniformRef(ctx, P, L2.probY(P, 1 / K), "1/K");
    values.forEach((v, i) => {
      const cx = L2.barX(P, i);
      const yTop = L2.probY(P, v);
      ctx.fillStyle = opts.color;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(cx - L2.barW / 2, yTop, L2.barW, y0 - yTop);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - L2.barW / 2, yTop, L2.barW, y0 - yTop);
      if (opts.handles) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - L2.barW / 2, yTop);
        ctx.lineTo(cx + L2.barW / 2, yTop);
        ctx.stroke();
      }
    });
    drawPanelLabel(ctx, P.x + P.w / 2, P.y - 8, opts.label);
  }
  function drawLogPanel(ctx, L2, P, values, opts) {
    const y0 = L2.logY(P, 0);
    const yFloor = L2.logY(P, LOG_FLOOR);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.x, y0);
    ctx.lineTo(P.x + P.w, y0);
    ctx.stroke();
    if (P.col === 0) {
      drawTick(ctx, P.x, y0, "0");
      drawTick(ctx, P.x, yFloor, String(LOG_FLOOR));
    }
    drawUniformRef(ctx, P, L2.logY(P, Math.log(1 / K)), "log 1/K");
    values.forEach((v, i) => {
      const cx = L2.barX(P, i);
      const clamped = v < LOG_FLOOR;
      const yBot = L2.logY(P, v);
      ctx.fillStyle = opts.color;
      ctx.globalAlpha = clamped ? 0.25 : 0.45;
      ctx.fillRect(cx - L2.barW / 2, y0, L2.barW, yBot - y0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - L2.barW / 2, y0, L2.barW, yBot - y0);
      if (clamped) {
        ctx.beginPath();
        ctx.moveTo(cx - 4, yFloor + 3);
        ctx.lineTo(cx + 4, yFloor + 3);
        ctx.lineTo(cx, yFloor + 9);
        ctx.closePath();
        ctx.fillStyle = opts.color;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
    if (opts.ghost) {
      opts.ghost.forEach((g, i) => {
        const cx = L2.barX(P, i);
        const yG = L2.logY(P, g);
        ctx.strokeStyle = "#444";
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx, yG);
        ctx.lineTo(cx, L2.logY(P, values[i]));
        ctx.stroke();
        ctx.restore();
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        if (g < LOG_FLOOR) {
          ctx.moveTo(cx - L2.barW / 2 - 2, yFloor + 3);
          ctx.lineTo(cx, yFloor + 9);
          ctx.lineTo(cx + L2.barW / 2 + 2, yFloor + 3);
        } else {
          ctx.moveTo(cx - L2.barW / 2 - 2, yG);
          ctx.lineTo(cx + L2.barW / 2 + 2, yG);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    drawPanelLabel(ctx, P.x + P.w / 2, P.y + P.h + 22, opts.label);
  }

  // src/temperature/main.js
  var probs = normalize(PRESETS.unimodal);
  var T = 1;
  var negative = false;
  var L = null;
  var cv;
  var slider;
  var readout;
  var readoutBeta;
  var preset;
  var negToggle;
  var ticksWrap;
  var dirsWrap;
  var typeset = (s) => s.replace("-", "\u2212");
  function fmtT(t) {
    if (Object.is(t, -0)) return "\u22120  (argmin)";
    if (t === 0) return "0  (argmax)";
    if (t === Infinity) return negative ? "\xB1\u221E  (uniform)" : "\u221E  (uniform)";
    return typeset(Number(t.toPrecision(3)).toString());
  }
  function fmtBeta(t) {
    if (Object.is(t, -0)) return "\u2212\u221E";
    if (t === 0) return "\u221E";
    if (t === Infinity) return "0";
    return typeset(Number((1 / t).toPrecision(3)).toString());
  }
  var THUMB_W = 14;
  var thumbX = (f) => `calc(${THUMB_W / 2}px + ${f} * (100% - ${THUMB_W}px))`;
  function updateTickLabels() {
    if (!ticksWrap) return;
    const labels = negative ? ["\u2212\u221E", "\u22121", "0", "1", "\u221E"] : ["0", "1", "\u221E"];
    ticksWrap.replaceChildren(...labels.map((text, i) => {
      const s = document.createElement("span");
      s.textContent = text;
      s.style.left = thumbX(i / (labels.length - 1));
      return s;
    }));
  }
  function updateDirLabels() {
    if (!dirsWrap) return;
    const items = negative ? [
      { html: "<i>T</i> \u2191 0", f: 0, color: tempColor(-0), edge: "left" },
      { html: "<i>T</i> = \u22121", f: 0.25, color: tempColor(-1) },
      { html: "<i>T</i> = \xB1\u221E", f: 0.5, color: tempColor(Infinity) },
      { html: "<i>T</i> = 1", f: 0.75, color: tempColor(1) },
      { html: "<i>T</i> \u2193 0", f: 1, color: tempColor(0), edge: "right" }
    ] : [
      { html: "\u2190 higher temperature", f: 0, color: tempColor(Infinity), edge: "left" },
      { html: "<i>T</i> = 1", f: 0.5, color: tempColor(1) },
      { html: "lower temperature \u2192", f: 1, color: tempColor(0), edge: "right" }
    ];
    dirsWrap.replaceChildren(...items.map(({ html, f, color, edge }) => {
      const s = document.createElement("span");
      s.innerHTML = html;
      s.style.color = color;
      if (edge === "left") {
        s.style.left = "0";
      } else if (edge === "right") {
        s.style.right = "0";
      } else {
        s.style.left = thumbX(f);
        s.style.transform = "translateX(-50%)";
      }
      return s;
    }));
  }
  function redraw() {
    if (!cv) return;
    const { ctx, w, h } = resetCanvas(cv);
    L = layout(w, h);
    const tempered = temper(probs, T);
    const color = tempColor(T);
    const ghost = isNegativeTemp(T) ? null : probs.map((p) => {
      if (p <= 0) return -Infinity;
      if (T === Infinity) return 0;
      if (T === 0) return -Infinity;
      return Math.log(p) / T;
    });
    drawProbPanel(ctx, L, L.panel(0, 0), probs, {
      color: BASE_COLOR,
      label: { sym: "p" },
      handles: true
    });
    drawProbPanel(ctx, L, L.panel(1, 0), tempered, {
      color,
      label: { sym: "p", sup: "(T)" }
    });
    drawLogPanel(ctx, L, L.panel(0, 1), probs.map(Math.log), {
      color: BASE_COLOR,
      label: { pre: "log ", sym: "p" }
    });
    drawLogPanel(ctx, L, L.panel(1, 1), tempered.map(Math.log), {
      color,
      label: { pre: "log ", sym: "p", sup: "(T)" },
      ghost
    });
    if (readout) readout.textContent = fmtT(T);
    if (readoutBeta) readoutBeta.textContent = fmtBeta(T);
    if (slider) slider.style.setProperty("--temp-accent", color);
  }
  function setProb(i, target) {
    target = Math.max(MIN_P, Math.min(1 - (K - 1) * MIN_P, target));
    const scale = (1 - target) / (1 - probs[i]);
    probs = normalize(probs.map((p, j) => j === i ? target : Math.max(MIN_P, p * scale)));
  }
  var dragIdx = -1;
  function hitBaseSlot(pos) {
    if (!L) return -1;
    const P = L.panel(0, 0);
    if (pos.x < P.x || pos.x > P.x + P.w) return -1;
    if (pos.y < P.y - 6 || pos.y > P.y + P.h + 6) return -1;
    const i = Math.floor((pos.x - P.x - L.inset) / L.slotW);
    return i >= 0 && i < K ? i : -1;
  }
  function dragTo(pos) {
    const P = L.panel(0, 0);
    setProb(dragIdx, (P.y + P.h - pos.y) / P.h);
    if (preset) preset.value = "custom";
    redraw();
  }
  function onDown(e) {
    const idx = hitBaseSlot(getPos(cv, e));
    if (idx === -1) return;
    dragIdx = idx;
    e.preventDefault();
    dragTo(getPos(cv, e));
  }
  function onMove(e) {
    if (dragIdx !== -1) {
      e.preventDefault();
      dragTo(getPos(cv, e));
    } else if (!e.touches) {
      cv.style.cursor = hitBaseSlot(getPos(cv, e)) === -1 ? "" : "ns-resize";
    }
  }
  function onUp() {
    dragIdx = -1;
  }
  function init() {
    cv = document.getElementById("cv-temp");
    slider = document.getElementById("temp-slider");
    readout = document.getElementById("temp-readout");
    readoutBeta = document.getElementById("temp-readout-beta");
    preset = document.getElementById("temp-preset");
    negToggle = document.getElementById("temp-negative");
    ticksWrap = document.querySelector(".temp-slider-ticks");
    dirsWrap = document.querySelector(".temp-slider-dirs");
    if (!cv) return;
    if (slider) {
      slider.max = String(SLIDER_MAX);
      slider.addEventListener("input", () => {
        T = sliderToT(Number(slider.value), negative);
        redraw();
      });
    }
    if (negToggle) {
      negToggle.addEventListener("change", () => {
        negative = negToggle.checked;
        if (!negative) T = Math.abs(T);
        if (slider) slider.value = String(tToSlider(T, negative));
        updateTickLabels();
        updateDirLabels();
        redraw();
      });
    }
    if (preset) {
      preset.addEventListener("change", () => {
        if (PRESETS[preset.value]) {
          probs = normalize(PRESETS[preset.value]);
          redraw();
        }
      });
    }
    cv.addEventListener("mousedown", onDown);
    cv.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    window.addEventListener("resize", redraw);
    updateTickLabels();
    updateDirLabels();
    redraw();
  }

  // src/temperature/index.js
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
