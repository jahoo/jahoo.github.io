(() => {
  // src/resampling-trained-proposals/model.js
  var OPEN = 0;
  var CLOSE = 1;
  var EOS = 2;
  var BOS = 0;
  var LA = 1;
  var LB = 2;
  var CTX_OF_CLS = [BOS, LA, LA, LB, LB];
  var D_CAP = 200;
  var UNIFORM = [
    [1 / 3, 1 / 3, 1 / 3],
    [1 / 3, 1 / 3, 1 / 3],
    [1 / 3, 1 / 3, 1 / 3]
  ];
  var STICKY = [
    [0.4, 0.4, 0.2],
    [0.55, 0.25, 0.2],
    [0.25, 0.55, 0.2]
  ];
  function clsOf(phase, last, depth) {
    return phase === 0 ? 0 : 1 + 2 * last + (depth >= 1 ? 1 : 0);
  }
  function twist(P, D = D_CAP) {
    let U = [new Float64Array(D + 2), new Float64Array(D + 2)];
    for (let iter = 0; iter < 2e5; iter++) {
      const next = [new Float64Array(D + 2), new Float64Array(D + 2)];
      let delta = 0;
      for (const [li, ctx] of [[0, LA], [1, LB]]) {
        next[li][0] = P[ctx][EOS] + P[ctx][OPEN] * U[0][1];
        for (let d = 1; d <= D; d++) {
          next[li][d] = P[ctx][OPEN] * U[0][d + 1] + P[ctx][CLOSE] * U[1][d - 1];
        }
        for (let d = 0; d <= D; d++) delta = Math.max(delta, Math.abs(next[li][d] - U[li][d]));
      }
      U = next;
      if (delta < 1e-15) break;
    }
    const Z = P[BOS][OPEN] * U[0][1];
    const a2 = P[LA][OPEN] * P[LB][OPEN];
    const a1 = P[LA][OPEN] * P[LB][CLOSE] + P[LB][OPEN] * P[LA][CLOSE] - 1;
    const a0 = P[LA][CLOSE] * P[LB][CLOSE];
    const Q = a2 > 0 ? (-a1 - Math.sqrt(a1 * a1 - 4 * a2 * a0)) / (2 * a2) : a0 / -a1;
    const f = [P[LA][CLOSE] + P[LA][OPEN] * Q, P[LB][CLOSE] + P[LB][OPEN] * Q];
    return { U, Z, f };
  }
  function qstarTable(P, U) {
    const q = [];
    q[0] = normalizeRow([P[BOS][OPEN] * U[0][1], 0, 0]);
    for (const [li, ctx] of [[0, LA], [1, LB]]) {
      q[1 + 2 * li] = normalizeRow([P[ctx][OPEN] * U[0][1], 0, P[ctx][EOS]]);
      q[2 + 2 * li] = normalizeRow([P[ctx][OPEN] * U[0][2], P[ctx][CLOSE] * U[1][0], 0]);
    }
    return q;
  }
  function normalizeRow(r) {
    const s = r[0] + r[1] + r[2];
    return s > 0 ? [r[0] / s, r[1] / s, r[2] / s] : [0, 0, 0];
  }
  function qMix(P, s) {
    const { U, Z, f } = twist(P);
    const p0cls = CTX_OF_CLS.map((ctx) => P[ctx].slice());
    const qs = qstarTable(P, U);
    const q = p0cls.map((row, c) => row.map((p, t) => (1 - s) * p + s * qs[c][t]));
    return { q, p0cls, U, Z, f, qstar: qs };
  }
  function analyticSis(P, q, D = D_CAP) {
    const p0cls = CTX_OF_CLS.map((ctx) => P[ctx]);
    const out = [];
    for (const k of [1, 2]) {
      let m = [new Float64Array(D + 2), new Float64Array(D + 2)];
      for (let iter = 0; iter < 2e5; iter++) {
        const next = [new Float64Array(D + 2), new Float64Array(D + 2)];
        let delta = 0;
        for (const li of [0, 1]) {
          const c0 = 1 + 2 * li, c1 = 2 + 2 * li;
          let t = 0;
          if (q[c0][OPEN] > 0) t += q[c0][OPEN] * Math.pow(p0cls[c0][OPEN] / q[c0][OPEN], k) * m[0][1];
          if (q[c0][EOS] > 0) t += q[c0][EOS] * Math.pow(p0cls[c0][EOS] / q[c0][EOS], k);
          next[li][0] = t;
          const a = q[c1][OPEN] > 0 ? q[c1][OPEN] * Math.pow(p0cls[c1][OPEN] / q[c1][OPEN], k) : 0;
          const b = q[c1][CLOSE] > 0 ? q[c1][CLOSE] * Math.pow(p0cls[c1][CLOSE] / q[c1][CLOSE], k) : 0;
          for (let d = 1; d <= D; d++) next[li][d] = a * m[0][d + 1] + b * m[1][d - 1];
          for (let d = 0; d <= D; d++) delta = Math.max(delta, Math.abs(next[li][d] - m[li][d]));
        }
        m = next;
        if (delta < 1e-16) break;
      }
      out.push(q[0][OPEN] > 0 ? q[0][OPEN] * Math.pow(p0cls[0][OPEN] / q[0][OPEN], k) * m[0][1] : 0);
    }
    return { Z: out[0], m2: out[1] };
  }
  function analyticSisRelstd(P, s, M) {
    const { q } = qMix(P, s);
    const { m2 } = analyticSis(P, q);
    const Z = twist(P).Z;
    const relvar = Math.max(0, (m2 - Z * Z) / (Z * Z) / M);
    return Math.sqrt(relvar);
  }

  // src/resampling-trained-proposals/simulate.js
  var TAU = 0.5;
  var T_MAX = 60;
  function rng(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function sampleTok(row, u) {
    return u < row[0] ? 0 : u < row[0] + row[1] ? 1 : 2;
  }
  function runOne(P, s, arm, M, seed) {
    const { q, p0cls, Z } = qMix(P, s);
    const tokRand = rng(seed);
    const resRand = rng(seed ^ 2654435769);
    const U = [];
    for (let t = 0; t < T_MAX; t++) {
      U.push(Array.from({ length: M }, () => tokRand()));
    }
    const depth = new Array(M).fill(0);
    const last = new Array(M).fill(0);
    const phase = new Array(M).fill(0);
    const w = new Array(M).fill(1);
    const cumR = new Array(M).fill(0);
    const steps = [];
    const events = [];
    for (let t = 0; t < T_MAX; t++) {
      if (!phase.some((p) => p <= 1)) break;
      const tok = new Array(M).fill(-1);
      for (let m = 0; m < M; m++) {
        if (phase[m] > 1) continue;
        const c = clsOf(phase[m], last[m], depth[m]);
        const x = sampleTok(q[c], U[t][m]);
        tok[m] = x;
        const r = q[c][x] > 0 ? p0cls[c][x] / q[c][x] : 1;
        if (arm === "QT") cumR[m] += Math.log(r);
        else w[m] *= r;
        if (x === OPEN) {
          depth[m] += 1;
          last[m] = 0;
          phase[m] = 1;
        } else if (x === CLOSE) {
          if (depth[m] === 0) {
            phase[m] = 2;
            w[m] = 0;
          } else {
            depth[m] -= 1;
            last[m] = 1;
          }
        } else {
          const valid = phase[m] === 1 && depth[m] === 0;
          if (arm === "QT") w[m] *= Math.exp(cumR[m]);
          phase[m] = 3;
          if (!valid) w[m] = 0;
        }
      }
      steps.push({ depth: depth.slice(), last: last.slice(), phase: phase.slice(), w: w.slice(), tok });
      if (arm === "SIS") continue;
      const pool = [];
      for (let m = 0; m < M; m++) if (phase[m] !== 3) pool.push(m);
      if (pool.length < 2) continue;
      let sw = 0, sw2 = 0;
      for (const m of pool) {
        sw += w[m];
        sw2 += w[m] * w[m];
      }
      if (sw <= 0) continue;
      const ess = sw * sw / sw2;
      if (ess >= TAU * pool.length) continue;
      const wBefore = pool.map((m) => w[m]);
      const anc = pool.map(() => {
        let u = resRand() * sw, acc = 0;
        for (const m of pool) {
          acc += w[m];
          if (u < acc) return m;
        }
        return pool[pool.length - 1];
      });
      const snap = { depth: depth.slice(), last: last.slice(), phase: phase.slice(), cumR: cumR.slice() };
      const wbar = sw / pool.length;
      pool.forEach((m, i) => {
        const a = anc[i];
        depth[m] = snap.depth[a];
        last[m] = snap.last[a];
        phase[m] = snap.phase[a];
        cumR[m] = snap.cumR[a];
        w[m] = wbar;
      });
      events.push({ afterT: t, pool, anc, wBefore });
    }
    const zhat = w.reduce((a, b) => a + b, 0) / M;
    return { steps, events, zhat, Z };
  }
  function crossoverPoint(P, s, arm, M, R, seedBase) {
    let sum = 0, sum2 = 0;
    let Z = null;
    for (let i = 0; i < R; i++) {
      const out = runOne(P, s, arm, M, seedBase + i * 2654435761 >>> 0);
      Z = out.Z;
      sum += out.zhat;
      sum2 += out.zhat * out.zhat;
    }
    const mean = sum / R;
    const va = Math.max(0, sum2 / R - mean * mean);
    return { mean, relstd: Math.sqrt(va) / Z, se: Math.sqrt(va / R) / Z, Z };
  }

  // src/resampling-trained-proposals/config.js
  var COL = {
    axis: "#999",
    grid: "#eee",
    eventLine: "#c33",
    connector: "rgba(0,0,0,0.25)",
    killMark: "#c33",
    validEnd: "#2a7a2a",
    invalidEnd: "#c33",
    sis: "#555",
    pt: "#c0392b",
    qt: "#2980b9"
  };
  var S_GRID_MC = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1];
  function setupCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // src/resampling-trained-proposals/draw-trajectories.js
  var DEPTH_COLORS = [
    "#dbe9f6",
    "#b5d2ec",
    "#8fbbe1",
    "#69a3d3",
    "#4a8ac2",
    "#3270ad",
    "#215694",
    "#123f7c",
    "#082a63"
  ];
  function depthColor(d) {
    return DEPTH_COLORS[Math.min(d, DEPTH_COLORS.length - 1)];
  }
  var T_DRAW_CAP = 40;
  var BAND_FRAC = 0.62;
  var registry = /* @__PURE__ */ new WeakMap();
  function poolTotal(step, M) {
    let sw = 0;
    for (let m = 0; m < M; m++) if (step.phase[m] !== 3) sw += step.w[m];
    return sw > 0 ? sw : 1e-300;
  }
  function drawRun(canvas, run, M, title, opts = {}) {
    const wCss = canvas.parentElement.clientWidth;
    const hCss = parseInt(canvas.dataset.h || "280", 10);
    const ctx = setupCanvas(canvas, wCss, hCss);
    const { steps, events } = run;
    const T = Math.min(steps.length, T_DRAW_CAP);
    const padL = 26, padR = opts.padR ?? 10;
    const padT = opts.padT ?? 20, padB = opts.padB ?? 18;
    const laneH = (hCss - padT - padB) / M;
    const cellW = (wCss - padL - padR) / Math.max(T, 1);
    const bandW = cellW * BAND_FRAC;
    const X = (t) => padL + cellW * t;
    const laneY = (m) => padT + laneH * (m + 0.5);
    const cutX = (t) => X(t) + bandW;
    const geom = { padL, padT, padB, laneH, cellW, bandW, T, wCss, hCss, cutX };
    registry.set(canvas, { run, M, geom });
    const evByT = new Map(events.map((e) => [e.afterT, e]));
    ctx.clearRect(0, 0, wCss, hCss);
    ctx.fillStyle = "#333";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(title, padL, 13);
    ctx.fillStyle = COL.axis;
    ctx.font = "10px sans-serif";
    ctx.fillText("t \u2192", wCss - padR - 22, hCss - 4);
    ctx.save();
    ctx.translate(9, (padT + hCss - padB) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("particles", 0, 0);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 0.9;
    for (let t = 0; t + 1 < T; t++) {
      const ev = evByT.get(t);
      const ancOf = (m) => {
        if (!ev) return m;
        const i = ev.pool.indexOf(m);
        return i >= 0 ? ev.anc[i] : m;
      };
      const st = steps[t];
      for (let m = 0; m < M; m++) {
        const a = ancOf(m);
        if (st.phase[a] > 1) continue;
        ctx.beginPath();
        ctx.moveTo(X(t) + bandW, laneY(a));
        ctx.lineTo(X(t + 1), laneY(m));
        ctx.stroke();
      }
    }
    const doneAt = new Array(M).fill(Infinity);
    for (let t = 0; t < T; t++) {
      const st = steps[t];
      const sw = poolTotal(st, M);
      for (let m = 0; m < M; m++) {
        if (t > doneAt[m]) continue;
        const y = laneY(m);
        if (st.phase[m] === 3) {
          if (doneAt[m] === Infinity) {
            doneAt[m] = t;
            const valid = st.w[m] > 0;
            ctx.fillStyle = valid ? COL.validEnd : COL.invalidEnd;
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("\xA4", X(t) + bandW * 0.5, y + 4);
          }
          continue;
        }
        if (st.phase[m] === 2) {
          const stillDead = t + 1 < T && steps[t + 1].phase[m] === 2;
          ctx.strokeStyle = "rgba(200, 80, 80, 0.38)";
          ctx.lineWidth = 1;
          ctx.setLineDash([1.5, 3]);
          ctx.beginPath();
          ctx.moveTo(X(t), y);
          ctx.lineTo(stillDead ? X(t + 1) : X(t) + bandW, y);
          ctx.stroke();
          ctx.setLineDash([]);
          if (t === 0 || steps[t - 1].phase[m] <= 1) {
            ctx.strokeStyle = "rgba(195, 60, 60, 0.75)";
            ctx.lineWidth = 1.5;
            const cx = X(t) + bandW * 0.5;
            ctx.beginPath();
            ctx.moveTo(cx - 3.5, y - 3.5);
            ctx.lineTo(cx + 3.5, y + 3.5);
            ctx.moveTo(cx - 3.5, y + 3.5);
            ctx.lineTo(cx + 3.5, y - 3.5);
            ctx.stroke();
          }
          continue;
        }
        const share = st.w[m] / sw;
        const bh = Math.min(laneH - 2, 1.6 + (laneH - 3.5) * Math.sqrt(share));
        ctx.fillStyle = depthColor(st.depth[m]);
        ctx.fillRect(X(t), y - bh / 2, bandW, bh);
      }
    }
    for (const e of events) {
      if (e.afterT >= T) continue;
      const x = cutX(e.afterT);
      ctx.strokeStyle = COL.eventLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, hCss - padB);
      ctx.stroke();
      ctx.setLineDash([]);
      const st = steps[e.afterT];
      const chosen = new Set(e.anc);
      for (const m of e.pool) {
        if (!chosen.has(m) && st.phase[m] <= 1) {
          const y = laneY(m);
          ctx.strokeStyle = COL.killMark;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 4);
          ctx.lineTo(x + 4, y + 4);
          ctx.moveTo(x - 4, y + 4);
          ctx.lineTo(x + 4, y - 4);
          ctx.stroke();
        }
      }
    }
    if (opts.annotate) opts.annotate({ ctx, X, laneY, geom });
    return { X, laneY, geom };
  }
  function label(ctx, text, tx, ty, color = "#8a4b0f") {
    ctx.save();
    ctx.font = "italic 11px sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }
  function curveArrow(ctx, x0, y0, x1, y1, color = "#c26d21", bend = 1) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.hypot(dx, dy) || 1;
    const off = bend * Math.min(22, n * 0.3);
    const cx = mx - dy / n * off, cy = my + dx / n * off;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
    const ang = Math.atan2(y1 - cy, x1 - cx);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 7 * Math.cos(ang - 0.38), y1 - 7 * Math.sin(ang - 0.38));
    ctx.lineTo(x1 - 7 * Math.cos(ang + 0.38), y1 - 7 * Math.sin(ang + 0.38));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function ring(ctx, x, y, r, color = "#c26d21") {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }
  function attachHover(canvas, tooltip) {
    canvas.addEventListener("mousemove", (ev) => {
      const entry = registry.get(canvas);
      if (!entry) return;
      const { run, M, geom } = entry;
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      const t = Math.floor((mx - geom.padL) / geom.cellW);
      const m = Math.floor((my - geom.padT) / geom.laneH);
      if (t < 0 || t >= geom.T || m < 0 || m >= M) {
        tooltip.style.display = "none";
        return;
      }
      const st = run.steps[t];
      const parts = [`particle ${m}`, `after step ${t + 1}`];
      if (st.phase[m] === 3) {
        if (st.w[m] > 0) parts.push("completed \u2713 valid", `final w = ${st.w[m].toPrecision(3)}`);
        else parts.push("completed \u2717 invalid", "w = 0");
      } else if (st.phase[m] === 2) {
        parts.push("dead (emitted > at depth 0)", "w = 0");
      } else {
        const sw = poolTotal(st, M);
        parts.push(
          `depth ${st.depth[m]}`,
          `w = ${st.w[m].toPrecision(3)} (${(100 * st.w[m] / sw).toFixed(0)}% of pool)`
        );
      }
      tooltip.innerHTML = parts.map((p) => `<span>${p}</span>`).join("");
      tooltip.style.display = "block";
      const host = tooltip.parentElement.getBoundingClientRect();
      tooltip.style.left = ev.clientX - host.left + 12 + "px";
      tooltip.style.top = ev.clientY - host.top + 14 + "px";
    });
    canvas.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  }
  function renderTrajectories(state2, els2) {
    const runPT = runOne(state2.P, state2.s, "PT", state2.M, state2.seed);
    const runQT = runOne(state2.P, state2.s, "QT", state2.M, state2.seed);
    drawRun(els2.cvPT, runPT, state2.M, "SMC, prior targets (standard)");
    drawRun(els2.cvQT, runQT, state2.M, "SMC, proposal targets (the fix)");
    const fmt = (r) => `\u1E90 = ${r.zhat.toPrecision(3)} (Z = ${r.Z.toPrecision(3)}), ${r.events.length} resampling event${r.events.length === 1 ? "" : "s"}`;
    els2.info.textContent = `prior targets: ${fmt(runPT)}  |  proposal targets: ${fmt(runQT)}`;
  }

  // src/resampling-trained-proposals/annotated.js
  var FIXED = { P: UNIFORM, s: 0.9, M: 16, seed: 826 };
  var PADS = { padT: 42, padB: 32 };
  var ANNO = "#c26d21";
  function clampX(ctx, text, tx, wCss) {
    const half = ctx.measureText(text).width / 2 + 4;
    return Math.min(Math.max(tx, half), wCss - half);
  }
  function renderAnnotated(els2) {
    const { P, s, M, seed } = FIXED;
    const pt = runOne(P, s, "PT", M, seed);
    const qt = runOne(P, s, "QT", M, seed);
    const e = pt.events[0];
    const st = pt.steps[e.afterT];
    const chosen = new Set(e.anc);
    const killed = e.pool.filter((m) => !chosen.has(m) && st.phase[m] <= 1);
    const anc = [...chosen].sort((a, b) => st.depth[b] - st.depth[a])[0];
    const nClones = e.anc.filter((a) => a === anc).length;
    drawRun(els2.cvA1, pt, M, "SMC, prior targets \u2014 a hand-picked run", {
      ...PADS,
      annotate: ({ ctx, X, laneY, geom }) => {
        const cx = geom.cutX(e.afterT);
        const t1 = `deep = heavy: cloned \xD7${nClones}`;
        const tx1 = clampX(ctx, t1, cx + 90, geom.wCss);
        label(ctx, t1, tx1, 36);
        curveArrow(ctx, tx1 - 30, 40, X(e.afterT) + geom.bandW - 3, laneY(anc) - 5, ANNO, -1);
        killed.forEach((m) => ring(ctx, cx, laneY(m), 7, ANNO));
        const lowest = killed.reduce((a, b) => laneY(a) > laneY(b) ? a : b);
        const t2 = `shallow = light: ${killed.length} killed, about to finish`;
        const tx2 = clampX(ctx, t2, cx + 120, geom.wCss);
        label(ctx, t2, tx2, geom.hCss - 8);
        curveArrow(ctx, tx2 - 40, geom.hCss - 18, cx + 6, laneY(lowest) + 6, ANNO, 1);
      }
    });
    const fates = killed.map((m) => {
      for (let t = e.afterT; t < qt.steps.length; t++) {
        if (qt.steps[t].phase[m] === 3) return { m, t, valid: qt.steps[t].w[m] > 0 };
      }
      return null;
    }).filter(Boolean);
    const qe = qt.events[0];
    drawRun(els2.cvA2, qt, M, "SMC, proposal targets \u2014 same randomness", {
      ...PADS,
      annotate: ({ ctx, X, laneY, geom }) => {
        const gx = (t) => X(t) + geom.bandW * 0.5;
        if (fates.length) {
          fates.forEach((f) => ring(ctx, gx(f.t), laneY(f.m), 8, ANNO));
          const top = fates.reduce((a, b) => laneY(a.m) < laneY(b.m) ? a : b);
          const t3 = `the same ${fates.length} particles, left alone: all finish validly`;
          const tx3 = clampX(ctx, t3, gx(top.t) + 60, geom.wCss);
          label(ctx, t3, tx3, 36);
          curveArrow(ctx, tx3 - 50, 40, gx(top.t) + 6, laneY(top.m) - 8, ANNO, -1);
        }
        if (qe) {
          const qx = geom.cutX(qe.afterT);
          const t4 = "fires only to recycle dead slots";
          const tx4 = clampX(ctx, t4, qx, geom.wCss);
          label(ctx, t4, tx4, geom.hCss - 8);
          curveArrow(ctx, tx4, geom.hCss - 18, qx, geom.hCss - geom.padB - 2, ANNO, 1);
        }
      }
    });
  }

  // src/resampling-trained-proposals/draw-crossover.js
  var runToken = 0;
  var cache = null;
  async function renderCrossover(state2, els2) {
    const token = ++runToken;
    const { P, M } = state2;
    const R = state2.R;
    const sisGrid = [];
    for (let s = 0; s <= 1.0001; s += 0.02) sisGrid.push([s, analyticSisRelstd(P, s, M)]);
    const pts = { PT: [], QT: [] };
    cache = { sisGrid, pts };
    draw(els2.cvX, sisGrid, pts, state2.s);
    els2.progress.textContent = "computing\u2026";
    for (const s of S_GRID_MC) {
      for (const arm of ["PT", "QT"]) {
        await new Promise((r) => setTimeout(r, 0));
        if (token !== runToken) return;
        const p = crossoverPoint(P, s, arm, M, R, 1e3 + Math.round(s * 1e4));
        pts[arm].push({ s, ...p });
        draw(els2.cvX, sisGrid, pts, state2.s);
      }
    }
    if (token === runToken) els2.progress.textContent = `M = ${M}, ${R} runs per point, \xB11 SE`;
  }
  function redrawCrossover(state2, els2) {
    if (cache) draw(els2.cvX, cache.sisGrid, cache.pts, state2.s);
  }
  function draw(canvas, sisGrid, pts, sMark) {
    const wCss = canvas.parentElement.clientWidth;
    const hCss = parseInt(canvas.dataset.h || "280", 10);
    const ctx = setupCanvas(canvas, wCss, hCss);
    const padL = 44, padR = 10, padT = 14, padB = 30;
    const ymax = Math.max(
      ...sisGrid.map((p) => p[1]),
      ...pts.PT.map((p) => p.relstd),
      0.1
    ) * 1.12;
    const X = (s) => padL + (wCss - padL - padR) * s;
    const Y = (v) => hCss - padB - (hCss - padT - padB) * v / ymax;
    ctx.clearRect(0, 0, wCss, hCss);
    ctx.strokeStyle = COL.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, wCss - padL - padR, hCss - padT - padB);
    ctx.fillStyle = COL.axis;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    for (const s of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(s.toFixed(2), X(s), hCss - padB + 14);
    ctx.fillText("training progress s (prior \u2192 optimal proposal)", (padL + wCss - padR) / 2, hCss - 4);
    ctx.textAlign = "right";
    const step = niceStep(ymax);
    for (let v = 0; v <= ymax; v += step) {
      ctx.fillText(v.toFixed(step < 0.2 ? 1 : 1), padL - 5, Y(v) + 3);
      ctx.strokeStyle = COL.grid;
      ctx.beginPath();
      ctx.moveTo(padL, Y(v));
      ctx.lineTo(wCss - padR, Y(v));
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(10, (padT + hCss - padB) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("rel. std of \u1E90", 0, 0);
    ctx.restore();
    if (sMark !== null && sMark !== void 0) {
      ctx.strokeStyle = "#bbb";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(X(sMark), padT);
      ctx.lineTo(X(sMark), hCss - padB);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#999";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("current s", X(sMark), padT - 3);
    }
    ctx.strokeStyle = COL.sis;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    sisGrid.forEach(([s, v], i) => i ? ctx.lineTo(X(s), Y(v)) : ctx.moveTo(X(s), Y(v)));
    ctx.stroke();
    const colOf = { PT: COL.pt, QT: COL.qt };
    for (const arm of ["PT", "QT"]) {
      ctx.strokeStyle = colOf[arm];
      ctx.fillStyle = colOf[arm];
      ctx.lineWidth = 1.4;
      const ps = pts[arm];
      ctx.beginPath();
      ps.forEach((p, i) => i ? ctx.lineTo(X(p.s), Y(p.relstd)) : ctx.moveTo(X(p.s), Y(p.relstd)));
      ctx.stroke();
      for (const p of ps) {
        ctx.beginPath();
        ctx.arc(X(p.s), Y(p.relstd), 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(X(p.s), Y(Math.max(0, p.relstd - p.se)));
        ctx.lineTo(X(p.s), Y(p.relstd + p.se));
        ctx.stroke();
      }
    }
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    const entries = [["SIS (no resampling; exact)", COL.sis], ["SMC, prior targets", COL.pt], ["SMC, proposal targets", COL.qt]];
    entries.forEach(([label2, c], i) => {
      const y = padT + 14 + 15 * i;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padL + 10, y - 3);
      ctx.lineTo(padL + 32, y - 3);
      ctx.stroke();
      ctx.fillStyle = "#333";
      ctx.fillText(label2, padL + 38, y);
    });
  }
  function niceStep(ymax) {
    for (const s of [0.05, 0.1, 0.2, 0.5, 1]) if (ymax / s <= 8) return s;
    return 2;
  }

  // src/resampling-trained-proposals/dist-widget.js
  var TOKENS = ["<", ">", "\xA4"];
  var BAR = "#7d92a8";
  var BAR_RO = "#93a5b7";
  var MIN_P = 0.02;
  var ROW_H = 21;
  var TITLE_H = 15;
  var PAD_B = 5;
  var PAD_GLYPH = 16;
  var GAP = 16;
  function withProb(dist, i, target) {
    target = Math.max(MIN_P, Math.min(1 - (dist.length - 1) * MIN_P, target));
    const scale = (1 - target) / (1 - dist[i]);
    const out = dist.map((p, j) => j === i ? target : Math.max(MIN_P, p * scale));
    const s = out.reduce((a, b) => a + b, 0);
    return out.map((v) => v / s);
  }
  function createDistBlock(canvas, opts) {
    const colW = opts.colW ?? 112;
    let drag = null;
    function geom(ncols) {
      return {
        ncols,
        colX: (c) => PAD_GLYPH + c * (colW + GAP),
        rowY: (r) => TITLE_H + ROW_H * (r + 0.5),
        barMax: colW - 32,
        w: PAD_GLYPH + ncols * colW + (ncols - 1) * GAP + 4,
        h: TITLE_H + 3 * ROW_H + PAD_B
      };
    }
    function draw2() {
      const cols = opts.getColumns();
      const g = geom(cols.length);
      const ctx = setupCanvas(canvas, g.w, g.h);
      ctx.clearRect(0, 0, g.w, g.h);
      const color = opts.editable ? BAR : BAR_RO;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "#555";
      for (let r = 0; r < 3; r++) ctx.fillText(TOKENS[r], 2, g.rowY(r) + 4);
      cols.forEach((col, c) => {
        const x0 = g.colX(c);
        ctx.fillStyle = "#666";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(col.title, x0, 9);
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, TITLE_H);
        ctx.lineTo(x0, g.h - 2);
        ctx.stroke();
        col.dist.forEach((v, r) => {
          const y = g.rowY(r);
          const len = v * g.barMax;
          const bh = 13;
          if (v < 1e-9) {
            ctx.strokeStyle = "#c9ced4";
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.lineTo(x0 + 5, y);
            ctx.stroke();
            ctx.fillStyle = "#aaa";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("0", x0 + 8, y + 3);
            return;
          }
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.38;
          ctx.fillRect(x0, y - bh / 2, len, bh);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.strokeRect(x0, y - bh / 2, len, bh);
          if (opts.editable) {
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x0 + len, y - bh / 2 - 1.5);
            ctx.lineTo(x0 + len, y + bh / 2 + 1.5);
            ctx.stroke();
          }
          ctx.fillStyle = "#777";
          ctx.font = "9px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(v.toFixed(2), x0 + len + 4, y + 3);
        });
      });
    }
    function pick(ev) {
      const cols = opts.getColumns();
      const g = geom(cols.length);
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      for (let c = 0; c < g.ncols; c++) {
        if (x >= g.colX(c) - 4 && x <= g.colX(c) + colW + 4) {
          const r = Math.floor((y - TITLE_H) / ROW_H);
          if (r >= 0 && r < 3) return { col: c, row: r };
        }
      }
      return null;
    }
    if (opts.editable) {
      canvas.style.touchAction = "none";
      const apply = (ev) => {
        const cols = opts.getColumns();
        const g = geom(cols.length);
        const rect = canvas.getBoundingClientRect();
        const target = (ev.clientX - rect.left - g.colX(drag.col)) / g.barMax;
        opts.onEdit(drag.col, withProb(cols[drag.col].dist, drag.row, target));
      };
      canvas.addEventListener("pointerdown", (ev) => {
        const hit = pick(ev);
        if (!hit) return;
        drag = hit;
        canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        apply(ev);
      });
      canvas.addEventListener("pointermove", (ev) => {
        if (!drag) {
          canvas.style.cursor = pick(ev) ? "ew-resize" : "default";
          return;
        }
        apply(ev);
      });
      canvas.addEventListener("pointerup", () => {
        drag = null;
      });
      canvas.addEventListener("pointercancel", () => {
        drag = null;
      });
    }
    return { draw: draw2 };
  }

  // src/resampling-trained-proposals/main.js
  var state = {
    P: UNIFORM.map((r) => r.slice()),
    bigram: false,
    s: FIXED.s,
    // interactive panel starts from the annotated figure's run
    M: FIXED.M,
    R: 1500,
    seed: FIXED.seed
  };
  var els = {};
  var priorBlock = null;
  var qstarBlock = null;
  var xoverTimer = null;
  var CTX_TITLES = ["after BOS", "after <", "after >"];
  var CLS_TITLES = ["start", "\u27E8<, d=0\u27E9", "\u27E8<, d\u22651\u27E9", "\u27E8>, d=0\u27E9", "\u27E8>, d\u22651\u27E9"];
  function legendHTML() {
    const sw = (d) => `<span class="rtp-swatch" style="background:${depthColor(d)}"></span>`;
    return `depth ${[0, 1, 2, 3, 4, 5].map(sw).join("")} (darker = deeper) \xB7
        band thickness = share of resampling weight \xB7
        <span style="color:#c33">\xD7</span> killed/died \xB7
        <span style="color:#2a7a2a">\xA4</span>/<span style="color:#c33">\xA4</span> valid/invalid completion \xB7
        dashed line = resampling event \xB7 hover for exact state`;
  }
  function init() {
    const mountA = document.getElementById("viz-annotated");
    const mountT = document.getElementById("viz-trajectories");
    const mountX = document.getElementById("viz-crossover");
    if (!mountT || !mountX) return;
    [mountA, mountT, mountX].forEach((m) => {
      if (m) m.style.height = "auto";
    });
    if (mountA) {
      mountA.innerHTML = `
          <div class="rtp-panel"><canvas id="rtp-cv-a1" data-h="250"></canvas></div>
          <div class="rtp-panel"><canvas id="rtp-cv-a2" data-h="250"></canvas></div>
          <div class="rtp-legend">${legendHTML()}</div>
          <div class="rtp-tooltip" id="rtp-tip-a"></div>`;
    }
    mountT.innerHTML = `
      <div class="rtp-prior-box">
        <div class="rtp-prior-head">
          <span>prior \\(\\prior_0\\)</span>
          <label><input type="radio" name="rtp-order" value="unigram" checked> unigram</label>
          <label><input type="radio" name="rtp-order" value="bigram"> bigram</label>
          <button id="rtp-sticky" title="bigram prior with repetition bias">sticky preset</button>
        </div>
        <div class="rtp-prior-row">
          <canvas id="rtp-prior"></canvas>
          <span class="rtp-readout">
            \\(\\Z = \\)<span id="rtp-z" class="rtp-num"></span><br>
            weight growth per depth \\(1/f_{\\mathtt{>}} = \\)<span id="rtp-g" class="rtp-num"></span>
          </span>
        </div>
        <details class="rtp-qstar" id="rtp-qstar-details">
          <summary>optimal proposal \\(\\proposal^*(\\cdot \\mid \\text{state})\\)</summary>
          <canvas id="rtp-qstar"></canvas>
        </details>
      </div>
      <div class="rtp-runbar">
        <label>training \\(s\\) <input type="range" id="rtp-s" min="0" max="1" step="0.05">
          <span id="rtp-s-val" class="rtp-num"></span></label>
        <label>particles \\(M\\) <select id="rtp-m">
          <option>4</option><option>8</option><option selected>16</option></select></label>
        <button id="rtp-rerun">re-run</button>
      </div>
      <div class="rtp-panels">
        <div class="rtp-panel"><canvas id="rtp-cv-pt" data-h="290"></canvas></div>
        <div class="rtp-panel"><canvas id="rtp-cv-qt" data-h="290"></canvas></div>
      </div>
      <div class="rtp-info" id="rtp-info"></div>
      <div class="rtp-legend">${legendHTML()}</div>
      <div class="rtp-tooltip" id="rtp-tip-t"></div>`;
    mountX.innerHTML = `
      <div class="rtp-panel"><canvas id="rtp-cv-x" data-h="290"></canvas></div>
      <div class="rtp-info"><span id="rtp-progress"></span></div>`;
    els.cvPT = document.getElementById("rtp-cv-pt");
    els.cvQT = document.getElementById("rtp-cv-qt");
    els.cvX = document.getElementById("rtp-cv-x");
    els.info = document.getElementById("rtp-info");
    els.progress = document.getElementById("rtp-progress");
    els.zVal = document.getElementById("rtp-z");
    els.gVal = document.getElementById("rtp-g");
    els.sVal = document.getElementById("rtp-s-val");
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([mountT]).catch(() => {
      });
    }
    els.qstarDetails = document.getElementById("rtp-qstar-details");
    const tipT = document.getElementById("rtp-tip-t");
    attachHover(els.cvPT, tipT);
    attachHover(els.cvQT, tipT);
    if (mountA) {
      els.cvA1 = document.getElementById("rtp-cv-a1");
      els.cvA2 = document.getElementById("rtp-cv-a2");
      const tipA = document.getElementById("rtp-tip-a");
      attachHover(els.cvA1, tipA);
      attachHover(els.cvA2, tipA);
      renderAnnotated(els);
    }
    priorBlock = createDistBlock(document.getElementById("rtp-prior"), {
      editable: true,
      getColumns: () => state.bigram ? CTX_TITLES.map((title, c) => ({ title, dist: state.P[c] })) : [{ title: "any context", dist: state.P[0] }],
      onEdit: (col, dist) => {
        if (state.bigram) state.P[col] = dist;
        else state.P = [dist.slice(), dist.slice(), dist.slice()];
        refreshAll();
      }
    });
    qstarBlock = createDistBlock(document.getElementById("rtp-qstar"), {
      editable: false,
      colW: 100,
      getColumns: () => {
        const { qstar } = qMix(state.P, 1);
        return CLS_TITLES.map((title, c) => ({ title, dist: qstar[c] }));
      }
    });
    els.qstarDetails.addEventListener("toggle", () => {
      if (els.qstarDetails.open) qstarBlock.draw();
    });
    document.querySelectorAll('input[name="rtp-order"]').forEach((radio) => radio.addEventListener("change", () => {
      state.bigram = radio.value === "bigram" && radio.checked;
      if (!state.bigram) {
        state.P = [0, 1, 2].map(() => state.P[0].slice());
      }
      refreshAll();
    }));
    document.getElementById("rtp-sticky").addEventListener("click", () => {
      state.P = STICKY.map((r) => r.slice());
      state.bigram = true;
      document.querySelector('input[name="rtp-order"][value="bigram"]').checked = true;
      refreshAll();
    });
    const sSlider = document.getElementById("rtp-s");
    sSlider.value = state.s;
    sSlider.addEventListener("input", () => {
      state.s = Number(sSlider.value);
      els.sVal.textContent = state.s.toFixed(2);
      renderTrajectories(state, els);
      redrawCrossover(state, els);
    });
    document.getElementById("rtp-m").addEventListener("change", (e) => {
      state.M = Number(e.target.value);
      refreshAll();
    });
    document.getElementById("rtp-rerun").addEventListener("click", () => {
      state.seed = state.seed * 69069 + 1 >>> 0;
      renderTrajectories(state, els);
    });
    window.addEventListener("resize", debounce(() => {
      if (els.cvA1) renderAnnotated(els);
      renderTrajectories(state, els);
      scheduleCrossover(0);
    }, 200));
    refreshAll();
  }
  function refreshAll() {
    els.sVal.textContent = state.s.toFixed(2);
    priorBlock.draw();
    if (els.qstarDetails.open) qstarBlock.draw();
    const { Z, f } = twist(state.P);
    els.zVal.textContent = Z.toPrecision(3);
    els.gVal.textContent = (1 / f[1]).toFixed(2);
    renderTrajectories(state, els);
    scheduleCrossover(400);
  }
  function scheduleCrossover(delay) {
    clearTimeout(xoverTimer);
    xoverTimer = setTimeout(() => renderCrossover(state, els), delay);
  }
  function debounce(fn, ms) {
    let t = null;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  // src/resampling-trained-proposals/index.js
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
