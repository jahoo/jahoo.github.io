(() => {
  // src/smc-resampling/config.js
  var N = 8;
  var MIN_W = 0.01;
  var PARTICLE_COLOR = "rgb(176,182,190)";
  var PALETTE = Array.from({ length: N }, () => PARTICLE_COLOR);
  var METHOD_COLORS = {
    multinomial: "#e67e22",
    stratified: "#2980b9",
    systematic: "#27ae60",
    residual: "#8e44ad",
    branchkill: "#795548"
  };

  // src/smc-resampling/algorithms.js
  function cumulativeSum(arr) {
    const out = new Array(arr.length);
    out[0] = arr[0];
    for (let i = 1; i < arr.length; i++) out[i] = out[i - 1] + arr[i];
    return out;
  }
  function searchSorted(cumsum, u) {
    let lo = 0, hi = cumsum.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (cumsum[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(lo, cumsum.length - 1);
  }
  function normalize(arr) {
    const s = arr.reduce((a, b) => a + b, 0);
    if (s > 0) for (let i = 0; i < arr.length; i++) arr[i] /= s;
  }
  function countIndices2(indices, n) {
    const c = new Array(n).fill(0);
    for (const idx of indices) c[idx]++;
    return c;
  }
  function getPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e.changedTouches ? e.changedTouches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
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
  var resample = {
    multinomial(w) {
      const n = w.length;
      const cs = cumulativeSum(w);
      cs[n - 1] = 1;
      return Array.from({ length: n }, () => searchSorted(cs, Math.random()));
    },
    stratified(w) {
      const n = w.length, cs = cumulativeSum(w), idx = [];
      let j = 0;
      for (let k = 0; k < n; k++) {
        const u = (Math.random() + k) / n;
        while (j < n - 1 && u > cs[j]) j++;
        idx.push(j);
      }
      return idx;
    },
    systematic(w, offset) {
      const n = w.length;
      const u0 = offset !== void 0 ? offset : Math.random() / n;
      const cs = cumulativeSum(w), idx = [];
      let j = 0;
      for (let k = 0; k < n; k++) {
        const u = u0 + k / n;
        while (j < n - 1 && u > cs[j]) j++;
        idx.push(j);
      }
      return idx;
    },
    branchkill(w) {
      const n = w.length, idx = [];
      for (let i = 0; i < n; i++) {
        const nw = n * w[i];
        const det = Math.floor(nw);
        const bonus = Math.random() >= 1 - (nw - det) ? 1 : 0;
        for (let c = 0; c < det + bonus; c++) idx.push(i);
      }
      return idx;
    },
    residual(w, phase2Method) {
      const n = w.length, idx = [];
      const copies = w.map((wi) => Math.floor(n * wi));
      for (let i = 0; i < n; i++)
        for (let c = 0; c < copies[i]; c++) idx.push(i);
      const res = w.map((wi, i) => wi - copies[i] / n);
      const resSum = res.reduce((a, b) => a + b, 0);
      const normRes = resSum > 0 ? res.map((r) => r / resSum) : res.map(() => 1 / n);
      const cs = cumulativeSum(normRes);
      cs[n - 1] = 1;
      const R = n - idx.length;
      if (phase2Method === "stratified") {
        let j = 0;
        for (let k = 0; k < R; k++) {
          const u = (Math.random() + k) / R;
          while (j < n - 1 && u > cs[j]) j++;
          idx.push(j);
        }
      } else if (phase2Method === "systematic") {
        const u0 = Math.random() / R;
        let j = 0;
        for (let k = 0; k < R; k++) {
          const u = u0 + k / R;
          while (j < n - 1 && u > cs[j]) j++;
          idx.push(j);
        }
      } else {
        for (let i = 0; i < R; i++) idx.push(searchSorted(cs, Math.random()));
      }
      return idx;
    }
  };
  var testFnKey = "position";
  var indicatorK = 3;
  var residualPhase2 = "multinomial";
  function getTestFnKey() {
    return testFnKey;
  }
  function setTestFnKey(v) {
    testFnKey = v;
  }
  function getResidualPhase2() {
    return residualPhase2;
  }
  function setResidualPhase2(v) {
    residualPhase2 = v;
  }
  var TEST_FNS = {
    position: {
      label: "f(\u03BEi) = i/N",
      latexLabel: "$f(\\xi^i)=i/N$",
      values: () => Array.from({ length: N }, (_, i) => (i + 1) / N)
    },
    indicator: {
      label: () => `f(\u03BEi) = 1[i=${indicatorK + 1}]`,
      latexLabel: () => `$f(\\xi^i)=\\mathbf{1}[i=${indicatorK + 1}]$`,
      values: () => Array.from({ length: N }, (_, i) => i === indicatorK ? 1 : 0)
    },
    tail: {
      label: "f(\u03BEi) = 1[i\u22655]",
      latexLabel: "$f(\\xi^i)=\\mathbf{1}[i\\geq 5]$",
      values: () => Array.from({ length: N }, (_, i) => i >= 4 ? 1 : 0)
    },
    square: {
      label: "f(\u03BEi) = (i/N)\xB2",
      latexLabel: "$f(\\xi^i)=(i/N)^2$",
      values: () => Array.from({ length: N }, (_, i) => ((i + 1) / N) ** 2)
    },
    evenodd: {
      label: "f(\u03BEi) = 1[i even]",
      latexLabel: "$f(\\xi^i)=\\mathbf{1}[i\\text{ even}]$",
      values: () => Array.from({ length: N }, (_, i) => i % 2 === 0 ? 1 : 0)
    }
  };
  function getTestFnLabel() {
    const t = TEST_FNS[testFnKey];
    return typeof t.latexLabel === "function" ? t.latexLabel() : t.latexLabel;
  }
  function getTestFnValues() {
    return TEST_FNS[testFnKey].values();
  }
  function runTrials(method, K, weights2) {
    const sums = new Array(N).fill(0);
    const sumSq = new Array(N).fill(0);
    const allCounts = new Array(K);
    for (let t = 0; t < K; t++) {
      const idx = method(weights2);
      const c = countIndices2(idx, N);
      allCounts[t] = c;
      for (let i = 0; i < N; i++) {
        sums[i] += c[i];
        sumSq[i] += c[i] * c[i];
      }
    }
    const means = sums.map((s) => s / K);
    const stds = means.map((m, i) => Math.sqrt(Math.max(0, sumSq[i] / K - m * m)));
    return { means, stds, allCounts, K };
  }
  function evalEstimators(hist, weights2) {
    if (!hist || !hist.allCounts) return null;
    const fVals = getTestFnValues();
    const K = hist.K;
    const estimators = new Array(K);
    for (let t = 0; t < K; t++) {
      estimators[t] = hist.allCounts[t].reduce((s, ci, i) => s + ci * fVals[i], 0) / N;
    }
    const estMean = estimators.reduce((a, b) => a + b, 0) / K;
    const estVar = estimators.reduce((s, v) => s + (v - estMean) ** 2, 0) / K;
    const trueVal = weights2.reduce((s, w, i) => s + w * fVals[i], 0);
    return { estimators, estVar, trueVal };
  }

  // src/smc-resampling/drawing.js
  function panelLayout(w, h) {
    var margin = { top: 22, bottom: 36, left: 10, right: 10 };
    var plotT = margin.top;
    var plotB = h - margin.bottom;
    var plotH = plotB - plotT;
    var rowH = plotH / N;
    var barH = rowH * 0.65;
    var histFrac = 0.28;
    var gapW = 32;
    var totalW = w - margin.left - margin.right;
    var histW = totalW * histFrac;
    var cdfW = totalW - histW - gapW;
    var histL = margin.left;
    var histR = margin.left + histW;
    var gapL = histR;
    var gapC = histR + gapW / 2;
    var cdfL = histR + gapW;
    var cdfR = w - margin.right;
    function idxToY(i) {
      return plotB - (i + 0.5) * rowH;
    }
    function uToX(u) {
      return cdfL + u * cdfW;
    }
    function xToU(x) {
      return Math.max(0, Math.min(1, (x - cdfL) / cdfW));
    }
    function valToHistX(v, maxVal) {
      return histR - v / maxVal * histW;
    }
    return {
      w,
      h,
      margin,
      plotT,
      plotB,
      plotH,
      rowH,
      barH,
      histL,
      histR,
      histW,
      gapL,
      gapC,
      gapW,
      cdfL,
      cdfR,
      cdfW,
      idxToY,
      uToX,
      xToU,
      valToHistX
    };
  }
  function drawYAxis(ctx, L) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (var i = 0; i < N; i++) {
      ctx.fillStyle = PALETTE[i];
      ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(i + 1, L.gapC, L.idxToY(i));
    }
  }
  function fmtNum(v) {
    if (v % 1 === 0) return v.toString();
    return Number(v.toPrecision(4)).toString();
  }
  function drawLeftHistogram(ctx, L, values, opts) {
    opts = opts || {};
    if (!values) return;
    var maxVal = opts.maxVal || Math.max.apply(null, values.concat([0.01]));
    if (opts.probeCountOverlay && opts.probeCountTotal > 0) {
      var maxProportion = Math.max.apply(null, opts.probeCountOverlay) / opts.probeCountTotal;
      maxVal = Math.max(maxVal, maxProportion * 1.05);
    }
    if (opts.expected) maxVal = Math.max.apply(null, [maxVal].concat(opts.expected));
    for (var i = 0; i < N; i++) {
      var y = L.idxToY(i);
      var barW = values[i] / maxVal * L.histW;
      var x = L.histR - barW;
      ctx.fillStyle = PALETTE[i];
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y - L.barH / 2, barW, L.barH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = PALETTE[i];
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y - L.barH / 2, barW, L.barH);
      ctx.strokeStyle = PALETTE[i];
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - L.barH / 2);
      ctx.lineTo(x, y + L.barH / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (opts.overlayValues) {
        var oW = opts.overlayValues[i] / maxVal * L.histW;
        ctx.fillStyle = PALETTE[i];
        ctx.globalAlpha = 0.9;
        ctx.fillRect(L.histR - oW, y - L.barH / 2, oW, L.barH);
        ctx.globalAlpha = 1;
      }
      if (opts.errors && opts.errors[i]) {
        var errInfo = opts.errors[i];
        var xHi = L.histR - errInfo.hi / maxVal * L.histW;
        var xLo = L.histR - Math.max(0, errInfo.lo) / maxVal * L.histW;
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xHi, y);
        ctx.lineTo(xLo, y);
        ctx.moveTo(xHi, y - 3);
        ctx.lineTo(xHi, y + 3);
        ctx.moveTo(xLo, y - 3);
        ctx.lineTo(xLo, y + 3);
        ctx.stroke();
      }
      if (opts.expected) {
        var ex = L.histR - opts.expected[i] / maxVal * L.histW;
        ctx.strokeStyle = "#c0392b";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(ex, y - L.barH / 2 - 2);
        ctx.lineTo(ex, y + L.barH / 2 + 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = "#333";
      ctx.globalAlpha = 0.5;
      ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      var label = fmtNum(values[i]);
      ctx.fillText(label, x - 3, y + 8);
      ctx.globalAlpha = 1;
    }
    if (opts.detCopies) {
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 3]);
      var maxK = Math.ceil(maxVal * N);
      for (var k = 1; k <= maxK; k++) {
        var gx = L.histR - k / N / maxVal * L.histW;
        if (gx < L.histL) break;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(gx, L.plotT);
        ctx.lineTo(gx, L.plotB);
        ctx.stroke();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#666";
        ctx.font = "8px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(k + "/" + N, gx, L.plotB + 2);
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (opts.detCopies) {
      var extraH = 3;
      var stoCounts = opts.probeCountOverlay && opts.probeCountTotal > 0 ? opts.probeCountOverlay.map(function(tot, i2) {
        return Math.max(0, tot - opts.detCopies[i2]);
      }) : null;
      for (var i = 0; i < N; i++) {
        var y = L.idxToY(i);
        var detW = opts.detCopies[i] / N / maxVal * L.histW;
        var stoW = stoCounts ? stoCounts[i] / N / maxVal * L.histW : 0;
        if (detW > 0) {
          var mc = opts.methodColor;
          var xDet = L.histR - detW;
          ctx.fillStyle = mc;
          ctx.globalAlpha = 0.12;
          ctx.fillRect(xDet, y - L.barH / 2 - extraH, detW, L.barH + 2 * extraH);
          ctx.strokeStyle = mc;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 2;
          ctx.strokeRect(xDet, y - L.barH / 2 - extraH, detW, L.barH + 2 * extraH);
          ctx.globalAlpha = 1;
        }
        if (stoW > 0) {
          var mc = opts.methodColor;
          var xDetEnd = L.histR - detW;
          var xSto = xDetEnd - stoW;
          ctx.fillStyle = mc;
          ctx.globalAlpha = 0.12;
          ctx.fillRect(xSto, y - L.barH / 2 - extraH, stoW, L.barH + 2 * extraH);
          ctx.strokeStyle = mc;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 2]);
          ctx.strokeRect(xSto, y - L.barH / 2 - extraH, stoW, L.barH + 2 * extraH);
          ctx.setLineDash([]);
          var totalCount = opts.detCopies[i] + stoCounts[i];
          ctx.fillStyle = mc;
          ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText(fmtNum(totalCount / N), xSto - 3, y - 6);
          ctx.globalAlpha = 1;
        }
      }
      var detTotal = 0;
      for (var i = 0; i < N; i++) detTotal += opts.detCopies[i];
      var R = N - detTotal;
      ctx.fillStyle = "#777";
      ctx.globalAlpha = 0.7;
      ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      var detLabel = opts.detLabel || detTotal + " deterministic;  R = " + R + " residual";
      ctx.fillText(detLabel, L.histL + 2, L.plotB + 14);
      ctx.globalAlpha = 1;
    }
    if (!opts.detCopies && opts.probeCountOverlay && opts.probeCountTotal > 0) {
      var total = opts.probeCountTotal;
      var extraH = 4;
      for (var i = 0; i < N; i++) {
        var proportion = opts.probeCountOverlay[i] / total;
        if (proportion <= 0) continue;
        var barW = proportion / maxVal * L.histW;
        var x = L.histR - barW;
        var y = L.idxToY(i);
        var mc = opts.methodColor;
        ctx.fillStyle = mc;
        ctx.globalAlpha = 0.12;
        ctx.fillRect(x, y - L.barH / 2 - extraH, barW, L.barH + 2 * extraH);
        ctx.strokeStyle = mc;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(x, y - L.barH / 2 - extraH, barW, L.barH + 2 * extraH);
        ctx.setLineDash([]);
        ctx.fillStyle = mc;
        ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(fmtNum(opts.probeCountOverlay[i] / total), x - 3, y - 6);
        ctx.globalAlpha = 1;
      }
    }
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.histR, L.plotT);
    ctx.lineTo(L.histR, L.plotB);
    ctx.stroke();
    L.histMaxVal = maxVal;
  }
  function drawRightCDF(ctx, L, probeList, probeColor, opts) {
    opts = opts || {};
    var activeWeights = opts.residualWeights || opts.weights;
    var cs = cumulativeSum(activeWeights);
    if (opts.strata) {
      var bandColor = opts.strataColor || "rgba(41,128,185,";
      var nStrata = opts.strataCount || N;
      for (var k = 0; k < nStrata; k++) {
        ctx.fillStyle = k % 2 === 0 ? bandColor + "0.06)" : bandColor + "0.0)";
        ctx.fillRect(L.uToX(k / nStrata), L.plotT, L.cdfW / nStrata, L.plotH);
      }
      for (var k = 0; k <= nStrata; k++) {
        ctx.strokeStyle = bandColor + "0.18)";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(L.uToX(k / nStrata), L.plotT);
        ctx.lineTo(L.uToX(k / nStrata), L.plotB);
        ctx.stroke();
      }
    }
    if (opts.ghostCDF) {
      var gcs = cumulativeSum(opts.ghostCDF.weights);
      drawStaircase(ctx, L, gcs, "#aaa", 1, [4, 3], 0.4);
    }
    for (var i = 0; i < N; i++) {
      var uL = i === 0 ? 0 : cs[i - 1];
      var uR = cs[i];
      var xL = L.uToX(uL), xR = L.uToX(uR);
      var yC = L.idxToY(i);
      ctx.fillStyle = PALETTE[i];
      ctx.globalAlpha = 0.5;
      ctx.fillRect(xL, yC - L.barH / 2, xR - xL, L.barH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = PALETTE[i];
      ctx.lineWidth = 1;
      ctx.strokeRect(xL, yC - L.barH / 2, xR - xL, L.barH);
    }
    drawStaircase(ctx, L, cs, "#555", 1.2, [], 1);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.cdfL, L.plotB);
    ctx.lineTo(L.cdfR, L.plotB);
    ctx.moveTo(L.cdfL, L.plotT);
    ctx.lineTo(L.cdfL, L.plotB);
    ctx.stroke();
    ctx.fillStyle = "#666";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var ticks = [0, 0.25, 0.5, 0.75, 1];
    for (var ti = 0; ti < ticks.length; ti++) {
      var u = ticks[ti];
      ctx.fillText(u.toFixed(u === 0 || u === 1 ? 0 : 2), L.uToX(u), L.plotB + 4);
      ctx.beginPath();
      ctx.moveTo(L.uToX(u), L.plotB);
      ctx.lineTo(L.uToX(u), L.plotB + 3);
      ctx.strokeStyle = "#999";
      ctx.stroke();
    }
    ctx.fillStyle = "#888";
    ctx.font = "italic 10px -apple-system, BlinkMacSystemFont, serif";
    ctx.fillText("x", L.cdfL + L.cdfW / 2, L.plotB + 18);
    if (opts.hoverU != null) {
      drawProbe(ctx, L, cs, opts.hoverU, probeColor || "#333", 0.3);
    }
    if (probeList) {
      for (var pi = 0; pi < probeList.length; pi++) {
        drawProbe(ctx, L, cs, probeList[pi].u, probeColor || "#333", 1);
      }
    }
    if (opts.comb && probeList && probeList.length > 1) {
      ctx.strokeStyle = probeColor || "#333";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(L.uToX(probeList[0].u), L.plotB + 4);
      ctx.lineTo(L.uToX(probeList[probeList.length - 1].u), L.plotB + 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
      var hx = L.uToX(probeList[0].u);
      ctx.fillStyle = probeColor || "#333";
      ctx.beginPath();
      ctx.arc(hx, L.plotB + 4, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  function drawStaircase(ctx, L, cs, color, lineWidth, dash, alpha) {
    var isGhost = dash && dash.length > 0;
    var showCircles = !isGhost && lineWidth >= 1;
    var r = 3.2;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash || []);
    ctx.globalAlpha = alpha != null ? alpha : 1;
    ctx.beginPath();
    for (var i = 0; i < N; i++) {
      var uL = i === 0 ? 0 : cs[i - 1];
      var uR = cs[i];
      var yC = L.idxToY(i);
      var xL = L.uToX(uL);
      var xR = L.uToX(uR);
      var gapPx = showCircles ? r : 0;
      ctx.moveTo(xL + gapPx, yC);
      ctx.lineTo(xR, yC);
      if (i < N - 1) {
        var yNext = L.idxToY(i + 1);
        ctx.moveTo(xR, yC);
        ctx.lineTo(xR, showCircles ? yNext + r : yNext);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (showCircles) {
      for (var i = 0; i < N; i++) {
        var uL = i === 0 ? 0 : cs[i - 1];
        var uR = cs[i];
        var yC = L.idxToY(i);
        var xL = L.uToX(uL);
        var xR = L.uToX(uR);
        ctx.beginPath();
        ctx.arc(xL, yC, r, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(xR, yC, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawProbe(ctx, L, cs, u, color, alpha) {
    var idx = searchSorted(cs, u);
    var x = L.uToX(u);
    var yTarget = L.idxToY(idx);
    ctx.globalAlpha = alpha;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, L.plotB);
    ctx.lineTo(x, yTarget);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, L.plotB);
    ctx.lineTo(x - 3.5, L.plotB + 7);
    ctx.lineTo(x + 3.5, L.plotB + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE[idx];
    ctx.beginPath();
    ctx.arc(x, yTarget, 3.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawPanel(canvas, opts) {
    var result = resetCanvas(canvas);
    var ctx = result.ctx, w = result.w, h = result.h;
    var L = panelLayout(w, h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    drawLeftHistogram(ctx, L, opts.histValues, {
      maxVal: opts.histMax,
      expected: opts.histExpected,
      errors: opts.histErrors,
      overlayValues: opts.histOverlay,
      probeCountOverlay: opts.probeCountOverlay,
      probeCountTotal: opts.probeCountTotal,
      detCopies: opts.detCopies,
      methodColor: opts.probeColor || "#555"
    });
    drawRightCDF(ctx, L, opts.probes, opts.probeColor, {
      strata: opts.strata,
      strataColor: opts.strataColor,
      strataCount: opts.strataCount,
      comb: opts.comb,
      hoverU: opts.hoverU,
      ghostCDF: opts.ghostCDF,
      residualWeights: opts.residualWeights,
      weights: opts.weights || opts.residualWeights
    });
    drawYAxis(ctx, L);
    canvas._L = L;
  }
  function drawMethodSection(canvas, sec, probeColor, opts, weights2) {
    var cs = cumulativeSum(weights2);
    cs[N - 1] = 1;
    var histValues = weights2.slice();
    var histMax = Math.max.apply(null, weights2) * 1.15;
    var overlay = {};
    if (sec.mode === "single" && sec.probes && sec.probes.length > 0) {
      var liveCounts = countIndices(
        sec.probes.map(function(p) {
          return searchSorted(cs, p.u);
        }),
        N
      );
      overlay.probeCountOverlay = liveCounts;
      overlay.probeCountTotal = N;
    }
    if (sec.mode === "ktrials" && sec.hist) {
      overlay.probeCountOverlay = sec.hist.means;
      overlay.probeCountTotal = N;
      overlay.errors = sec.hist.means.map(function(m, i) {
        return {
          lo: (m - sec.hist.stds[i]) / N,
          hi: (m + sec.hist.stds[i]) / N
        };
      });
    }
    var panelOpts = {
      histValues,
      histMax,
      weights: weights2,
      probes: sec.probes,
      probeColor,
      strata: opts && opts.strata,
      strataColor: opts && opts.strataColor,
      comb: opts && opts.comb,
      hoverU: null
    };
    for (var key in overlay) panelOpts[key] = overlay[key];
    drawPanel(canvas, panelOpts);
  }
  function drawResidualSection(cvSec62, sec62, weights2) {
    var histValues = weights2.slice();
    var histMax = Math.max.apply(null, weights2) * 1.15;
    var overlay = {};
    var detCopies = weights2.map(function(wi) {
      return Math.floor(N * wi);
    });
    overlay.detCopies = detCopies;
    if (sec62.mode === "single" && sec62.residualProbes && sec62.residualProbes.length > 0) {
      var res2 = weights2.map(function(wi, i) {
        return wi - detCopies[i] / N;
      });
      var resSum2 = res2.reduce(function(a, b) {
        return a + b;
      }, 0);
      var normRes2 = resSum2 > 0 ? res2.map(function(r) {
        return r / resSum2;
      }) : weights2.slice();
      var resCs = cumulativeSum(normRes2);
      resCs[N - 1] = 1;
      var stoCounts = countIndices(
        sec62.residualProbes.map(function(p) {
          return searchSorted(resCs, p.u);
        }),
        N
      );
      var totalCounts = detCopies.map(function(d, i) {
        return d + stoCounts[i];
      });
      overlay.probeCountOverlay = totalCounts;
      overlay.probeCountTotal = N;
    }
    if (sec62.mode === "ktrials" && sec62.hist) {
      overlay.probeCountOverlay = sec62.hist.means;
      overlay.probeCountTotal = N;
    }
    var res = weights2.map(function(wi, i) {
      return wi - detCopies[i] / N;
    });
    var resSum = res.reduce(function(a, b) {
      return a + b;
    }, 0);
    var normRes = resSum > 0 ? res.map(function(r) {
      return r / resSum;
    }) : weights2.slice();
    var R = N - detCopies.reduce(function(a, b) {
      return a + b;
    }, 0);
    var residualPhase22 = getResidualPhase2();
    var showStrata = (residualPhase22 === "stratified" || residualPhase22 === "systematic") && R > 0;
    var panelOpts = {
      histValues,
      histMax,
      weights: weights2,
      probes: sec62.residualProbes,
      probeColor: METHOD_COLORS.residual,
      ghostCDF: { weights: weights2.slice() },
      residualWeights: normRes,
      strata: showStrata,
      strataColor: "rgba(142,68,173,",
      // residual purple
      strataCount: R,
      // number of strata (R, not N)
      comb: residualPhase22 === "systematic" && R > 0
    };
    for (var key in overlay) panelOpts[key] = overlay[key];
    drawPanel(cvSec62, panelOpts);
  }
  function drawBranchKillSection(cvBK2, secBK2, weights2) {
    if (!cvBK2) return;
    var result = resetCanvas(cvBK2);
    var ctx = result.ctx, w = result.w, h = result.h;
    var L = panelLayout(w, h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    var detCopies = weights2.map(function(wi) {
      return Math.floor(N * wi);
    });
    var histValues = weights2.slice();
    var histMax = Math.max.apply(null, weights2) * 1.15;
    var detTotal = detCopies.reduce(function(a, b) {
      return a + b;
    }, 0);
    var histOpts = { maxVal: histMax, detCopies, methodColor: METHOD_COLORS.branchkill };
    if (secBK2.mode === "single" && secBK2.bonusProbes) {
      for (var i = 0; i < N; i++) {
        var livePi = N * weights2[i] - detCopies[i];
        secBK2.bonusProbes[i].p = livePi;
        secBK2.bonusProbes[i].hit = secBK2.bonusProbes[i].u >= 1 - livePi;
      }
      var liveTotals = detCopies.map(function(d, i2) {
        return d + (secBK2.bonusProbes[i2].hit ? 1 : 0);
      });
      secBK2.totalCounts = liveTotals;
      histOpts.probeCountOverlay = liveTotals;
      histOpts.probeCountTotal = N;
    }
    if (secBK2.mode === "ktrials" && secBK2.hist) {
      histOpts.probeCountOverlay = secBK2.hist.means;
      histOpts.probeCountTotal = N;
    }
    if (secBK2.mode === "ktrials" && secBK2.hist) {
      var avgTotal = secBK2.hist.means.reduce(function(a, b) {
        return a + b;
      }, 0);
      var avgBonus = avgTotal - detTotal;
      histOpts.detLabel = detTotal + " deterministic + " + fmtNum(avgBonus) + " bonuses on avg = " + fmtNum(avgTotal) + " particles on avg";
    } else if (secBK2.mode === "single" && secBK2.totalCounts) {
      var total = secBK2.totalCounts.reduce(function(a, b) {
        return a + b;
      }, 0);
      var bonusTotal = total - detTotal;
      histOpts.detLabel = detTotal + " deterministic + " + bonusTotal + " sampled bonuses = " + total + " particles";
    } else {
      histOpts.detLabel = detTotal + " deterministic + independent Bernoulli bonuses";
    }
    drawLeftHistogram(ctx, L, histValues, histOpts);
    var bkColor = METHOD_COLORS.branchkill;
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.cdfL, L.plotB);
    ctx.lineTo(L.cdfR, L.plotB);
    ctx.moveTo(L.cdfL, L.plotT);
    ctx.lineTo(L.cdfL, L.plotB);
    ctx.stroke();
    ctx.fillStyle = "#666";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var ticks = [0, 0.5, 1];
    for (var ti = 0; ti < ticks.length; ti++) {
      var u = ticks[ti];
      ctx.fillText(u.toFixed(u === 0 || u === 1 ? 0 : 1), L.uToX(u), L.plotB + 4);
      ctx.beginPath();
      ctx.moveTo(L.uToX(u), L.plotB);
      ctx.lineTo(L.uToX(u), L.plotB + 3);
      ctx.strokeStyle = "#999";
      ctx.stroke();
    }
    ctx.fillStyle = "#888";
    ctx.font = "italic 10px -apple-system, BlinkMacSystemFont, serif";
    ctx.fillText("x", L.cdfL + L.cdfW / 2, L.plotB + 18);
    for (var i = 0; i < N; i++) {
      var yC = L.idxToY(i);
      var yTop = yC - L.barH / 2;
      var yBot = yC + L.barH / 2;
      var inset = L.barH * 0.15;
      var yCdfTop = yTop + inset;
      var yCdfBot = yBot - inset;
      var pi = N * weights2[i] - detCopies[i];
      var oneMinusP = 1 - pi;
      var xStep = L.uToX(oneMinusP);
      var pColor = PALETTE[i];
      if (pi > 1e-3) {
        ctx.fillStyle = pColor;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(xStep, yTop, L.cdfR - xStep, yBot - yTop);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = pColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      if (oneMinusP > 1e-3) {
        ctx.moveTo(L.cdfL, yCdfBot);
        ctx.lineTo(xStep, yCdfBot);
      }
      if (pi > 1e-3 && pi < 0.999) {
        ctx.moveTo(xStep, yCdfBot);
        ctx.lineTo(xStep, yCdfTop);
      }
      if (pi < 0.999) {
        ctx.moveTo(oneMinusP > 1e-3 ? xStep : L.cdfL, yCdfTop);
        ctx.lineTo(L.cdfR, yCdfTop);
      } else {
        ctx.moveTo(L.cdfL, yCdfTop);
        ctx.lineTo(L.cdfR, yCdfTop);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      var r = 2.5;
      if (pi > 1e-3 && pi < 0.999) {
        ctx.beginPath();
        ctx.arc(xStep, yCdfBot, r, 0, 2 * Math.PI);
        ctx.strokeStyle = pColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(xStep, yCdfTop, r, 0, 2 * Math.PI);
        ctx.fillStyle = pColor;
        ctx.fill();
      }
      if (secBK2.mode === "single" && secBK2.bonusProbes) {
        var probe = secBK2.bonusProbes[i];
        var xProbe = L.uToX(probe.u);
        var yDot = probe.hit ? yCdfTop : yCdfBot;
        ctx.strokeStyle = bkColor;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 2]);
        ctx.globalAlpha = 0.6;
        var yRowBase = yC + L.rowH / 2;
        ctx.beginPath();
        ctx.moveTo(xProbe, yRowBase);
        ctx.lineTo(xProbe, yDot);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(xProbe, yDot, 3.5, 0, 2 * Math.PI);
        if (probe.hit) {
          ctx.fillStyle = bkColor;
          ctx.fill();
        } else {
          ctx.strokeStyle = bkColor;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
    drawYAxis(ctx, L);
    cvBK2._L = L;
  }
  function drawEstimatorDist(canvas, datasets, trueVal) {
    if (!datasets || datasets.every(function(d) {
      return !d.estimators;
    })) {
      resetCanvas(canvas);
      return;
    }
    var result = resetCanvas(canvas);
    var ctx = result.ctx, w = result.w, h = result.h;
    var nDS = datasets.length;
    var errBarH = 8;
    var rowGap = nDS > 1 ? 4 : 0;
    var margin = { top: 12, right: 12, bottom: 26, left: 12 };
    var pL = margin.left, pR = w - margin.right;
    var pT = margin.top, pB = h - margin.bottom;
    var pW = pR - pL, pH = pB - pT;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    var allVals = datasets.reduce(function(acc, d) {
      return acc.concat(d.estimators || []);
    }, []);
    if (allVals.length === 0) return;
    var spread = Math.max(0.01, Math.max.apply(null, allVals) - Math.min.apply(null, allVals));
    var lo = Math.min.apply(null, allVals) - spread * 0.15;
    var hi = Math.max.apply(null, allVals) + spread * 0.15;
    function xToCanvas(v2) {
      return pL + (v2 - lo) / (hi - lo) * pW;
    }
    var histData = datasets.map(function(d) {
      var freq2 = {};
      if (!d.estimators) return { freq: freq2, maxCount: 0, mean: 0, std: 0 };
      var sum = 0, sumSq = 0, n = d.estimators.length;
      for (var i = 0; i < n; i++) {
        var key2 = d.estimators[i].toFixed(8);
        freq2[key2] = (freq2[key2] || 0) + 1;
        sum += d.estimators[i];
        sumSq += d.estimators[i] * d.estimators[i];
      }
      var maxCount = 0;
      for (var k in freq2) if (freq2[k] > maxCount) maxCount = freq2[k];
      var mean2 = sum / n;
      var std2 = Math.sqrt(Math.max(0, sumSq / n - mean2 * mean2));
      return { freq: freq2, maxCount, mean: mean2, std: std2 };
    });
    var totalErrSpace = nDS * errBarH;
    var totalGaps = Math.max(0, nDS - 1) * rowGap;
    var histAreaH = pH - totalErrSpace - totalGaps;
    var rowH = histAreaH / nDS + errBarH;
    var rowHistH = rowH - errBarH;
    for (var ci = 0; ci < nDS; ci++) {
      var color = datasets[ci].color;
      var freq = histData[ci].freq;
      var rowTop = pT + ci * (rowH + rowGap);
      var rowHistBot = rowTop + rowHistH;
      var localMax = Math.max(1, histData[ci].maxCount);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (var key in freq) {
        var v = parseFloat(key);
        var cx = xToCanvas(v);
        var by = rowHistBot - freq[key] / localMax * rowHistH * 0.9;
        ctx.moveTo(cx, rowHistBot);
        ctx.lineTo(cx, by);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pL, rowHistBot);
      ctx.lineTo(pR, rowHistBot);
      ctx.stroke();
      var mean = histData[ci].mean;
      var std = histData[ci].std;
      var eby = rowHistBot + errBarH / 2 + 1;
      var mx = xToCanvas(mean);
      var loX = xToCanvas(mean - std);
      var hiX = xToCanvas(mean + std);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(loX, eby);
      ctx.lineTo(hiX, eby);
      ctx.moveTo(loX, eby - 3);
      ctx.lineTo(loX, eby + 3);
      ctx.moveTo(hiX, eby - 3);
      ctx.lineTo(hiX, eby + 3);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(mx, eby, 2.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = "9px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText((datasets[ci].label || "") + " \u03C3=" + std.toFixed(4), pL + 2, eby);
    }
    if (trueVal != null && trueVal >= lo && trueVal <= hi) {
      var tx = xToCanvas(trueVal);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(tx, pT);
      ctx.lineTo(tx, pB);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#555";
      ctx.font = "9px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("true", tx, pT - 1);
    }
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pL, pB);
    ctx.lineTo(pR, pB);
    ctx.stroke();
    ctx.fillStyle = "#888";
    ctx.font = "9px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var nTicks = 5;
    for (var t = 0; t <= nTicks; t++) {
      var v = lo + (hi - lo) * t / nTicks;
      ctx.fillText(v.toFixed(2), xToCanvas(v), pB + 3);
    }
    ctx.fillStyle = "#aaa";
    ctx.fillText("estimator value", pL + pW / 2, pB + 14);
  }
  function drawComparisonPanel(weights2, compData2) {
    var cv = document.getElementById("cv-comparison");
    if (!cv) return;
    if (!compData2) {
      let idxToY2 = function(i2) {
        return pB - (i2 + 0.5) * rowH;
      };
      if (cv.offsetWidth === 0 || cv.offsetHeight === 0) return;
      var result = resetCanvas(cv);
      var ctx = result.ctx, w = result.w, h = result.h;
      var margin = { top: 12, right: 12, bottom: 20, left: 12 };
      var pL = margin.left, pR = w - margin.right;
      var pT = margin.top, pB = h - margin.bottom;
      var pH = pB - pT;
      var rowH = pH / N, barH = rowH * 0.65;
      var maxProp = Math.max.apply(null, weights2) * 1.15;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < N; i++) {
        var y = idxToY2(i);
        var wBarW = weights2[i] / maxProp * (pR - pL);
        ctx.fillStyle = "#ddd";
        ctx.fillRect(pR - wBarW, y - barH / 2, wBarW, barH);
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(pR - wBarW, y - barH / 2, wBarW, barH);
        ctx.fillStyle = PALETTE[i];
        ctx.font = "bold 11px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i + 1, pR + 8, y);
      }
      cv._L = {
        histR: pR,
        histW: pR - pL,
        histL: pL,
        barH,
        idxToY: idxToY2,
        histMaxVal: maxProp,
        cdfL: Infinity,
        cdfR: -Infinity,
        uToX: function() {
          return -1;
        }
      };
      return;
    }
    var result = resetCanvas(cv);
    var ctx = result.ctx, w = result.w, h = result.h;
    var margin = { top: 12, right: 12, bottom: 20, left: 12 };
    var pL = margin.left, pR = w - margin.right;
    var pT = margin.top, pB = h - margin.bottom;
    var pH = pB - pT;
    var rowH = pH / N, barH = rowH * 0.65;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    var allHists = [compData2.multi, compData2.strat, compData2.sys, compData2.resid];
    var maxPropVals = weights2.map(function(w2) {
      return w2 * 1.1;
    });
    allHists.forEach(function(hist2) {
      hist2.means.forEach(function(m, i2) {
        maxPropVals.push((m + hist2.stds[i2]) / N);
      });
    });
    var maxProp = Math.max.apply(null, maxPropVals) * 1.05;
    function idxToY(i2) {
      return pB - (i2 + 0.5) * rowH;
    }
    for (var i = 0; i < N; i++) {
      var y = idxToY(i);
      var wBarW = weights2[i] / maxProp * (pR - pL);
      ctx.fillStyle = "#ddd";
      ctx.fillRect(pR - wBarW, y - barH / 2, wBarW, barH);
      ctx.strokeStyle = "#ccc";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(pR - wBarW, y - barH / 2, wBarW, barH);
    }
    var methods = [
      { hist: compData2.multi, color: METHOD_COLORS.multinomial },
      { hist: compData2.strat, color: METHOD_COLORS.stratified },
      { hist: compData2.sys, color: METHOD_COLORS.systematic },
      { hist: compData2.resid, color: METHOD_COLORS.residual }
    ];
    var nMethods = methods.length;
    var slotH = barH / nMethods;
    for (var mi = 0; mi < nMethods; mi++) {
      var hist = methods[mi].hist;
      var color = methods[mi].color;
      var yOff = -barH / 2 + slotH * (mi + 0.5);
      for (var i = 0; i < N; i++) {
        var yBase = idxToY(i);
        var y = yBase + yOff;
        var mProp = hist.means[i] / N;
        var hiProp = (hist.means[i] + hist.stds[i]) / N;
        var loProp = Math.max(0, hist.means[i] - hist.stds[i]) / N;
        var mx = pR - mProp / maxProp * (pR - pL);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(mx, y - slotH * 0.35);
        ctx.lineTo(mx, y + slotH * 0.35);
        ctx.stroke();
        var xHi = pR - hiProp / maxProp * (pR - pL);
        var xLo = pR - loProp / maxProp * (pR - pL);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xHi, y);
        ctx.lineTo(xLo, y);
        ctx.moveTo(xHi, y - 2);
        ctx.lineTo(xHi, y + 2);
        ctx.moveTo(xLo, y - 2);
        ctx.lineTo(xLo, y + 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pR, pT);
    ctx.lineTo(pR, pB);
    ctx.stroke();
    for (var i = 0; i < N; i++) {
      ctx.fillStyle = PALETTE[i];
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(i + 1, pR + 8, idxToY(i));
    }
    cv._L = {
      histR: pR,
      histW: pR - pL,
      histL: pL,
      barH,
      idxToY,
      histMaxVal: maxProp,
      // No CDF in this panel
      cdfL: Infinity,
      cdfR: -Infinity,
      uToX: function() {
        return -1;
      }
    };
  }
  function drawEstDist(canvasId, sec, color, label, weights2) {
    var cv = document.getElementById(canvasId);
    if (!cv) return;
    if (cv.offsetWidth === 0 || cv.offsetHeight === 0) return;
    var hist = sec.hist;
    if (!hist || !hist.allCounts) {
      resetCanvas(cv);
      return;
    }
    var ev = evalEstimators(hist, weights2);
    if (!ev) {
      resetCanvas(cv);
      return;
    }
    drawEstimatorDist(
      cv,
      [{ estimators: ev.estimators, color, label }],
      ev.trueVal
    );
  }
  function drawCompEstDist(compData2, weights2) {
    var cv = document.getElementById("cv-est-all");
    if (!cv || !compData2) {
      if (cv) resetCanvas(cv);
      return;
    }
    var evM = evalEstimators(compData2.multi, weights2);
    var evS = evalEstimators(compData2.strat, weights2);
    var evY = evalEstimators(compData2.sys, weights2);
    var evR = evalEstimators(compData2.resid, weights2);
    if (!evM) {
      resetCanvas(cv);
      return;
    }
    var residualPhase22 = getResidualPhase2();
    drawEstimatorDist(cv, [
      { estimators: evM.estimators, color: METHOD_COLORS.multinomial, label: "Multinomial" },
      { estimators: evS.estimators, color: METHOD_COLORS.stratified, label: "Stratified" },
      { estimators: evY.estimators, color: METHOD_COLORS.systematic, label: "Systematic" },
      { estimators: evR.estimators, color: METHOD_COLORS.residual, label: "Resid-" + ({ multinomial: "Multi", stratified: "Strat", systematic: "Syst" }[residualPhase22] || "Multi") }
    ], evM.trueVal);
  }

  // src/smc-resampling/toolbar.js
  function initToolbar(opts) {
    var getWeights2 = opts.getWeights;
    var sparkline = document.getElementById("smc-toolbar-sparkline");
    var dropdownBtn = document.getElementById("smc-toolbar-dropdown-btn");
    var dropdownText = document.getElementById("smc-toolbar-dropdown-text");
    var dropdownMenu = document.getElementById("smc-toolbar-dropdown-menu");
    var testfnItem = document.getElementById("smc-toolbar-testfn");
    var phase2Item = document.getElementById("smc-toolbar-phase2");
    var phase2Select = document.getElementById("smc-toolbar-phase2-select");
    var mainPhase2 = document.getElementById("select-resid-phase2");
    var PRESET_ORDER = ["skewed", "uniform", "degenerate", "alternating"];
    var PRESET_LABELS = {
      skewed: "Skewed",
      uniform: "Uniform",
      degenerate: "Nearly degenerate",
      alternating: "Alternating"
    };
    var PRESETS2 = {
      skewed: function() {
        return [0.05, 0.08, 0.12, 0.3, 0.2, 0.12, 0.08, 0.05];
      },
      uniform: function() {
        return new Array(N).fill(1 / N);
      },
      degenerate: function() {
        return [0.01, 0.01, 0.02, 0.02, 0.02, 0.02, 0.01, 0.89];
      },
      alternating: function() {
        var w = [];
        for (var i = 0; i < N; i++) w.push(i % 2 === 0 ? 0.2 : 0.05);
        normalize(w);
        return w;
      }
    };
    function drawMiniWeights(canvas, weights2, w, h) {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var maxW = Math.max.apply(null, weights2);
      if (maxW === 0) return;
      var rowH = h / N;
      var barH = rowH * 0.7;
      for (var i = 0; i < N; i++) {
        var y = h - (i + 0.5) * rowH - barH / 2;
        var bw = weights2[i] / maxW * (w - 2);
        ctx.fillStyle = PALETTE[i];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(w - 1 - bw, y, bw, barH);
      }
      ctx.globalAlpha = 1;
    }
    var lastJSON = "";
    function updateSparkline() {
      var weights2 = getWeights2();
      var json = JSON.stringify(weights2);
      if (json === lastJSON) return;
      lastJSON = json;
      if (sparkline) drawMiniWeights(sparkline, weights2, 36, 24);
    }
    function buildMenu() {
      if (!dropdownMenu) return;
      dropdownMenu.innerHTML = "";
      PRESET_ORDER.forEach(function(key) {
        var row = document.createElement("div");
        row.className = "smc-toolbar-dropdown-row";
        var cv = document.createElement("canvas");
        drawMiniWeights(cv, PRESETS2[key](), 36, 24);
        row.appendChild(cv);
        var span = document.createElement("span");
        span.textContent = PRESET_LABELS[key];
        row.appendChild(span);
        row.addEventListener("click", function() {
          dropdownMenu.classList.remove("open");
          lastJSON = "";
          document.dispatchEvent(new CustomEvent("smc-preset-change", { detail: key }));
        });
        dropdownMenu.appendChild(row);
      });
    }
    if (dropdownBtn && dropdownMenu) {
      dropdownBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (dropdownMenu.classList.contains("open")) {
          dropdownMenu.classList.remove("open");
        } else {
          buildMenu();
          dropdownMenu.classList.add("open");
        }
      });
      document.addEventListener("click", function(e) {
        if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
          dropdownMenu.classList.remove("open");
        }
      });
    }
    if (phase2Select && mainPhase2) {
      phase2Select.value = getResidualPhase2();
      phase2Select.addEventListener("change", function() {
        mainPhase2.value = phase2Select.value;
        mainPhase2.dispatchEvent(new Event("change"));
      });
      mainPhase2.addEventListener("change", function() {
        phase2Select.value = mainPhase2.value;
      });
    }
    function tick() {
      updateSparkline();
      var testfnTrigger = document.getElementById("btn-run-multi");
      var phase2Trigger = document.getElementById("cv-sec6");
      if (testfnItem && testfnTrigger) {
        testfnItem.style.display = testfnTrigger.getBoundingClientRect().top < 50 ? "flex" : "none";
      }
      if (phase2Item && phase2Trigger) {
        phase2Item.style.display = phase2Trigger.getBoundingClientRect().top < 50 ? "flex" : "none";
      }
      requestAnimationFrame(tick);
    }
    lastJSON = "";
    updateSparkline();
    requestAnimationFrame(tick);
  }

  // src/smc-resampling/main.js
  var weights = [0.05, 0.08, 0.12, 0.3, 0.2, 0.12, 0.08, 0.05];
  var probes = [];
  var hoverU = null;
  var dragProbeIdx = -1;
  var sec3 = { probes: [], counts: null, hist: null, mode: "none" };
  var sec4 = { probes: [], counts: null, hist: null, mode: "none" };
  var sec5 = { probes: [], counts: null, hist: null, mode: "none", offset: Math.random() / N, dragging: false };
  var sec6 = { detCounts: null, stoCounts: null, totalCounts: null, residualProbes: [], hist: null, mode: "none" };
  var secBK = { detCounts: null, bonusProbes: null, totalCounts: null, hist: null, mode: "none" };
  var compData = null;
  function getWeights() {
    return weights;
  }
  var cvSec2 = document.getElementById("cv-sec2");
  var cvSec3 = document.getElementById("cv-sec3");
  var cvSec4 = document.getElementById("cv-sec4");
  var cvSec5 = document.getElementById("cv-sec5");
  var cvSec6 = document.getElementById("cv-sec6");
  var cvBK = document.getElementById("cv-bk");
  function drawSection2() {
    var cs = cumulativeSum(weights);
    cs[N - 1] = 1;
    var probeCounts = null;
    if (probes.length > 0) {
      probeCounts = new Array(N).fill(0);
      for (var pi = 0; pi < probes.length; pi++)
        probeCounts[searchSorted(cs, probes[pi].u)]++;
    }
    drawPanel(cvSec2, {
      histValues: weights.slice(),
      histMax: Math.max.apply(null, weights) * 1.15,
      weights,
      probeCountOverlay: probeCounts,
      probeCountTotal: probes.length,
      probes,
      probeColor: "#333",
      hoverU
    });
    var L = cvSec2._L;
    if (L) {
      var ctx = cvSec2.getContext("2d");
      var capFont = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.font = capFont;
      ctx.textBaseline = "top";
      ctx.globalAlpha = 0.6;
      var line1Y = L.plotB + 18;
      ctx.fillStyle = "#555";
      ctx.textAlign = "left";
      ctx.fillText("Drag bars to adjust weights.", L.histL + 2, line1Y);
      ctx.fillStyle = "#555";
      ctx.fillText("Click plot to place probes.", L.cdfL, L.plotT - 10);
      cvSec2._clearProbeBtn = null;
      if (probes.length > 0) {
        var clearText = "\xD7 Clear probes";
        var line3Y = L.plotB + 18;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "#467";
        var tw = ctx.measureText(clearText).width;
        var clearX = L.cdfR - tw;
        ctx.fillText(clearText, clearX, line3Y);
        cvSec2._clearProbeBtn = { x: clearX, y: line3Y, w: tw, h: 12 };
      }
      ctx.globalAlpha = 1;
    }
  }
  function setWeight(i, target) {
    target = Math.max(MIN_W, Math.min(1 - (N - 1) * MIN_W, target));
    var sumOthers = weights.reduce(function(s, wi, j2) {
      return j2 === i ? s : s + wi;
    }, 0);
    if (sumOthers > 1e-10) {
      var scale = (1 - target) / sumOthers;
      for (var j = 0; j < N; j++) {
        if (j === i) weights[j] = target;
        else weights[j] = Math.max(MIN_W, weights[j] * scale);
      }
    } else {
      weights[i] = target;
      var rest = (1 - target) / (N - 1);
      for (var j = 0; j < N; j++) if (j !== i) weights[j] = rest;
    }
    normalize(weights);
  }
  var globalWeightDrag = { active: false, idx: -1, canvas: null };
  function initWeightDrag(canvas) {
    function onDown(e) {
      var L = canvas._L;
      if (!L) return;
      var pos = getPos(canvas, e);
      if (pos.x >= L.cdfL - 10 && pos.x <= L.cdfR + 10) {
        var cs = cumulativeSum(weights);
        for (var i = 0; i < N - 1; i++) {
          var bx = L.uToX(cs[i]);
          var by = L.idxToY(i);
          if (Math.abs(pos.x - bx) < 10 && Math.abs(pos.y - by) < 12) {
            globalWeightDrag = { active: true, idx: i, canvas, type: "cdf" };
            e.preventDefault();
            return;
          }
        }
      }
      if (pos.x <= L.histR + 5) {
        for (var i = 0; i < N; i++) {
          var y = L.idxToY(i);
          if (Math.abs(pos.y - y) < L.barH / 2 + 3) {
            globalWeightDrag = { active: true, idx: i, canvas, type: "hist" };
            e.preventDefault();
            return;
          }
        }
      }
    }
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("touchstart", onDown, { passive: false });
  }
  function handleWeightDragMove(e) {
    if (!globalWeightDrag.active) return;
    e.preventDefault();
    var L = globalWeightDrag.canvas._L;
    if (!L) return;
    var pos = getPos(globalWeightDrag.canvas, e);
    if (globalWeightDrag.type === "hist") {
      var barW = Math.max(0, L.histR - pos.x);
      var maxVal = L.histMaxVal || Math.max.apply(null, weights) * 1.15;
      var newW = Math.max(MIN_W, barW / L.histW * maxVal);
      setWeight(globalWeightDrag.idx, newW);
    } else if (globalWeightDrag.type === "cdf") {
      var u = L.xToU(pos.x);
      var cs = cumulativeSum(weights);
      var idx = globalWeightDrag.idx;
      var lo = (idx === 0 ? 0 : cs[idx - 1]) + MIN_W;
      var hi = (idx === N - 1 ? 1 : cs[idx + 1]) - MIN_W;
      var newF = Math.max(lo, Math.min(hi, u));
      var prevF = idx === 0 ? 0 : cs[idx - 1];
      weights[idx] = newF - prevF;
      if (idx < N - 1) {
        var nextF = cs[idx + 1];
        weights[idx + 1] = nextF - newF;
      }
      for (var i = 0; i < N; i++) weights[i] = Math.max(MIN_W, weights[i]);
      normalize(weights);
    }
    redrawAll();
  }
  window.addEventListener("mousemove", handleWeightDragMove);
  window.addEventListener("touchmove", handleWeightDragMove, { passive: false });
  window.addEventListener("mouseup", function() {
    globalWeightDrag.active = false;
  });
  window.addEventListener("touchend", function() {
    globalWeightDrag.active = false;
  });
  function initSec2Events(canvas) {
    var mouseIsDown = false;
    var downPos = null;
    function hitTestProbe(L, pos) {
      for (var i = 0; i < probes.length; i++) {
        var px = L.uToX(probes[i].u);
        if (Math.abs(pos.x - px) < 10 && pos.y >= L.plotB - 5 && pos.y <= L.plotB + 15) return i;
      }
      return -1;
    }
    function onDown(e) {
      var L = canvas._L;
      if (!L) return;
      var pos = getPos(canvas, e);
      var cb = canvas._clearProbeBtn;
      if (cb && pos.x >= cb.x && pos.x <= cb.x + cb.w && pos.y >= cb.y - 2 && pos.y <= cb.y + cb.h + 2) {
        e.preventDefault();
        probes = [];
        redrawAll();
        return;
      }
      if (pos.x <= L.histR + 5) return;
      e.preventDefault();
      mouseIsDown = true;
      downPos = pos;
      var pi = hitTestProbe(L, pos);
      if (pi >= 0) {
        dragProbeIdx = pi;
        return;
      }
    }
    function onMove(e) {
      var L = canvas._L;
      if (!L) return;
      var pos = getPos(canvas, e);
      if (dragProbeIdx >= 0) {
        e.preventDefault();
        probes[dragProbeIdx].u = L.xToU(pos.x);
        redrawAll();
        return;
      }
      var cb = canvas._clearProbeBtn;
      if (cb && pos.x >= cb.x && pos.x <= cb.x + cb.w && pos.y >= cb.y - 2 && pos.y <= cb.y + cb.h + 2) {
        canvas.style.cursor = "pointer";
      } else {
        canvas.style.cursor = "";
      }
      if (!globalWeightDrag.active && pos.x >= L.cdfL && pos.x <= L.cdfR && pos.y >= L.plotT && pos.y <= L.plotB + 10) {
        hoverU = L.xToU(pos.x);
      } else {
        hoverU = null;
      }
      redrawAll();
    }
    function onUp(e) {
      if (!mouseIsDown) return;
      mouseIsDown = false;
      var L = canvas._L;
      if (dragProbeIdx >= 0) {
        dragProbeIdx = -1;
        redrawAll();
        return;
      }
      if (L && downPos) {
        var pos = getPos(canvas, e);
        if (pos.x >= L.cdfL && pos.x <= L.cdfR) {
          if (Math.hypot(pos.x - downPos.x, pos.y - downPos.y) < 5) {
            var u = L.xToU(pos.x);
            if (u >= 0 && u <= 1) {
              if (probes.length >= N) probes.shift();
              probes.push({ u });
              redrawAll();
            }
          }
        }
      }
      downPos = null;
    }
    function onLeave() {
      hoverU = null;
      redrawAll();
    }
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    canvas.addEventListener("mouseleave", onLeave);
  }
  function setMathHTML(id, html) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]);
  }
  function redrawAll() {
    drawSection2();
    drawMethodSection(cvSec3, sec3, METHOD_COLORS.multinomial, null, weights);
    drawMethodSection(cvSec4, sec4, METHOD_COLORS.stratified, { strata: true }, weights);
    var sysProbes = [];
    for (var k = 0; k < N; k++) sysProbes.push({ u: sec5.offset + k / N });
    sec5.probes = sysProbes;
    drawMethodSection(cvSec5, sec5, METHOD_COLORS.systematic, { comb: true, strata: true, strataColor: "rgba(39,174,96," }, weights);
    drawResidualSection(cvSec6, sec6, weights);
    drawBranchKillSection(cvBK, secBK, weights);
    drawComparisonPanel(weights, compData);
    drawEstDist("cv-est-multi", sec3, METHOD_COLORS.multinomial, "Multinomial", weights);
    drawEstDist("cv-est-strat", sec4, METHOD_COLORS.stratified, "Stratified", weights);
    drawEstDist("cv-est-sys", sec5, METHOD_COLORS.systematic, "Systematic", weights);
    var p2 = getResidualPhase2() || "multinomial";
    var p2Short = { multinomial: "Multi", stratified: "Strat", systematic: "Syst" };
    drawEstDist("cv-est-resid", sec6, METHOD_COLORS.residual, "Resid-" + (p2Short[p2] || p2), weights);
    drawEstDist("cv-est-bk", secBK, METHOD_COLORS.branchkill, "Branch-kill", weights);
    drawCompEstDist(compData, weights);
  }
  initSec2Events(cvSec2);
  var cvComparison = document.getElementById("cv-comparison");
  [cvSec2, cvSec3, cvSec4, cvSec5, cvSec6, cvBK, cvComparison].forEach(function(c) {
    if (c) initWeightDrag(c);
  });
  (function() {
    function onDown(e) {
      var L = cvSec5._L;
      if (!L) return;
      var pos = getPos(cvSec5, e);
      var hx = L.uToX(sec5.offset);
      if (Math.abs(pos.x - hx) < 15 && pos.y > L.plotB - 10) {
        sec5.dragging = true;
        e.preventDefault();
      }
    }
    function onMove(e) {
      if (!sec5.dragging) return;
      e.preventDefault();
      var L = cvSec5._L;
      if (!L) return;
      sec5.offset = Math.max(0, Math.min(1 / N - 1e-9, L.xToU(getPos(cvSec5, e).x)));
      sec5.mode = "single";
      var cs = cumulativeSum(weights);
      cs[N - 1] = 1;
      var sysProbes = [];
      for (var k = 0; k < N; k++) sysProbes.push({ u: sec5.offset + k / N });
      sec5.probes = sysProbes;
      sec5.counts = countIndices2(sysProbes.map(function(p) {
        return searchSorted(cs, p.u);
      }), N);
      redrawAll();
    }
    function onUp() {
      sec5.dragging = false;
    }
    cvSec5.addEventListener("mousedown", onDown);
    cvSec5.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
  })();
  function doResampleOnce(sec, method) {
    var cs = cumulativeSum(weights);
    cs[N - 1] = 1;
    var draws = Array.from({ length: N }, function() {
      return Math.random();
    });
    sec.probes = draws.map(function(u) {
      return { u };
    });
    var indices = method(weights);
    sec.counts = countIndices2(indices, N);
    if (method === resample.multinomial) {
      sec.probes = draws.map(function(u) {
        return { u };
      });
      sec.counts = countIndices2(draws.map(function(u) {
        return searchSorted(cs, u);
      }), N);
    } else if (method === resample.stratified) {
      var ps = Array.from({ length: N }, function(_, k) {
        return (Math.random() + k) / N;
      });
      sec.probes = ps.map(function(u) {
        return { u };
      });
      sec.counts = countIndices2(ps.map(function(u) {
        return searchSorted(cs, u);
      }), N);
    }
    sec.mode = "single";
  }
  function wireMethodButtons(prefix, sec, method) {
    document.getElementById("btn-resample-" + prefix).addEventListener("click", function() {
      doResampleOnce(sec, method);
      redrawAll();
    });
    document.getElementById("btn-clear-" + prefix).addEventListener("click", function() {
      sec.probes = [];
      sec.counts = null;
      sec.hist = null;
      sec.mode = "none";
      document.getElementById("var-" + prefix).textContent = "";
      var estEl = document.getElementById("est-" + prefix);
      if (estEl) estEl.classList.remove("visible");
      redrawAll();
    });
    var slider = document.getElementById("slider-K-" + prefix);
    var valSpan = document.getElementById("val-K-" + prefix);
    slider.addEventListener("input", function() {
      valSpan.textContent = slider.value;
    });
    document.getElementById("btn-run-" + prefix).addEventListener("click", function() {
      var K = parseInt(slider.value, 10);
      sec.hist = runTrials(method, K, weights);
      sec.mode = "ktrials";
      sec.probes = [];
      var ev = evalEstimators(sec.hist, weights);
      var estStd = ev ? Math.sqrt(ev.estVar) : 0;
      setMathHTML(
        "var-" + prefix,
        "std of estimator " + getTestFnLabel() + " = " + estStd.toFixed(4) + "  (" + K + " trials)"
      );
      var estEl = document.getElementById("est-" + prefix);
      if (estEl) estEl.classList.add("visible");
      redrawAll();
    });
  }
  wireMethodButtons("multi", sec3, resample.multinomial);
  wireMethodButtons("strat", sec4, resample.stratified);
  document.getElementById("btn-resample-sys").addEventListener("click", function() {
    sec5.offset = Math.random() / N;
    sec5.mode = "single";
    var cs = cumulativeSum(weights);
    cs[N - 1] = 1;
    var sysProbes = [];
    for (var k = 0; k < N; k++) sysProbes.push({ u: sec5.offset + k / N });
    sec5.probes = sysProbes;
    sec5.counts = countIndices2(sysProbes.map(function(p) {
      return searchSorted(cs, p.u);
    }), N);
    redrawAll();
  });
  document.getElementById("btn-clear-sys").addEventListener("click", function() {
    sec5.counts = null;
    sec5.hist = null;
    sec5.mode = "none";
    document.getElementById("var-sys").textContent = "";
    var estEl = document.getElementById("est-sys");
    if (estEl) estEl.classList.remove("visible");
    redrawAll();
  });
  (function() {
    var slider = document.getElementById("slider-K-sys");
    var valSpan = document.getElementById("val-K-sys");
    slider.addEventListener("input", function() {
      valSpan.textContent = slider.value;
    });
    document.getElementById("btn-run-sys").addEventListener("click", function() {
      var K = parseInt(slider.value, 10);
      sec5.hist = runTrials(resample.systematic, K, weights);
      sec5.mode = "ktrials";
      sec5.probes = [];
      var ev = evalEstimators(sec5.hist, weights);
      var estStd = ev ? Math.sqrt(ev.estVar) : 0;
      setMathHTML(
        "var-sys",
        "std of estimator " + getTestFnLabel() + " = " + estStd.toFixed(4) + "  (" + K + " trials)"
      );
      var estEl = document.getElementById("est-sys");
      if (estEl) estEl.classList.add("visible");
      redrawAll();
    });
  })();
  var counterPreWeights = null;
  var counterPreTestFn = null;
  var btnSetCounter = document.getElementById("btn-set-counterexample");
  var btnResetCounter = document.getElementById("btn-reset-counterexample");
  if (btnSetCounter) {
    btnSetCounter.addEventListener("click", function() {
      counterPreWeights = weights.slice();
      counterPreTestFn = getTestFnKey();
      weights = PRESETS.alternating();
      setTestFnKey("evenodd");
      document.querySelectorAll(".testfn-select").forEach(function(s) {
        s.value = "evenodd";
      });
      clearAll();
      redrawAll();
      if (btnResetCounter) btnResetCounter.style.display = "inline";
    });
  }
  if (btnResetCounter) {
    btnResetCounter.addEventListener("click", function() {
      if (counterPreWeights) {
        weights = counterPreWeights;
        counterPreWeights = null;
      }
      if (counterPreTestFn) {
        setTestFnKey(counterPreTestFn);
        document.querySelectorAll(".testfn-select").forEach(function(s) {
          s.value = counterPreTestFn;
        });
        counterPreTestFn = null;
      }
      clearAll();
      redrawAll();
      btnResetCounter.style.display = "none";
    });
  }
  document.getElementById("btn-resample-resid").addEventListener("click", function() {
    var p2 = getResidualPhase2();
    var copies = weights.map(function(wi) {
      return Math.floor(N * wi);
    });
    var R = N - copies.reduce(function(a, b) {
      return a + b;
    }, 0);
    var res = weights.map(function(wi, i2) {
      return wi - copies[i2] / N;
    });
    var resSum = res.reduce(function(a, b) {
      return a + b;
    }, 0);
    var normRes = resSum > 0 ? res.map(function(r) {
      return r / resSum;
    }) : weights.slice();
    var cs = cumulativeSum(normRes);
    cs[N - 1] = 1;
    var residualProbes = [];
    if (p2 === "stratified") {
      for (var k = 0; k < R; k++) residualProbes.push({ u: (Math.random() + k) / R });
    } else if (p2 === "systematic") {
      var u0 = Math.random() / R;
      for (var k = 0; k < R; k++) residualProbes.push({ u: u0 + k / R });
    } else {
      for (var k = 0; k < R; k++) residualProbes.push({ u: Math.random() });
    }
    var stoCounts = new Array(N).fill(0);
    for (var i = 0; i < residualProbes.length; i++) {
      stoCounts[searchSorted(cs, residualProbes[i].u)]++;
    }
    var totalCounts = copies.map(function(d, i2) {
      return d + stoCounts[i2];
    });
    sec6.detCounts = copies;
    sec6.stoCounts = stoCounts;
    sec6.totalCounts = totalCounts;
    sec6.residualProbes = residualProbes;
    sec6.mode = "single";
    redrawAll();
  });
  document.getElementById("select-resid-phase2").addEventListener("change", function(e) {
    setResidualPhase2(e.target.value);
    var commentEl = document.getElementById("resid-phase2-comment");
    var codeEl = document.getElementById("resid-phase2-code");
    if (commentEl && codeEl) {
      commentEl.textContent = getResidualPhase2();
      var codeLines = {
        multinomial: 'positions = random(R)                               <span class="c1"># multinomial: R independent probes</span>',
        stratified: 'positions = (random(R) + range(R)) / R              <span class="c1"># stratified: one probe per stratum</span>',
        systematic: 'positions = (random() + np.arange(R)) / R           <span class="c1"># systematic: single-offset comb</span>'
      };
      codeEl.innerHTML = codeLines[getResidualPhase2()] || codeLines.multinomial;
    }
    sec6.detCounts = null;
    sec6.stoCounts = null;
    sec6.totalCounts = null;
    sec6.residualProbes = [];
    sec6.hist = null;
    sec6.mode = "none";
    document.getElementById("var-resid").textContent = "";
    var estEl = document.getElementById("est-resid");
    if (estEl) estEl.classList.remove("visible");
    redrawAll();
  });
  document.getElementById("btn-clear-resid").addEventListener("click", function() {
    sec6.detCounts = null;
    sec6.stoCounts = null;
    sec6.totalCounts = null;
    sec6.residualProbes = [];
    sec6.hist = null;
    sec6.mode = "none";
    document.getElementById("var-resid").textContent = "";
    var estEl = document.getElementById("est-resid");
    if (estEl) estEl.classList.remove("visible");
    redrawAll();
  });
  (function() {
    var slider = document.getElementById("slider-K-resid");
    var valSpan = document.getElementById("val-K-resid");
    slider.addEventListener("input", function() {
      valSpan.textContent = slider.value;
    });
    document.getElementById("btn-run-resid").addEventListener("click", function() {
      var K = parseInt(slider.value, 10);
      sec6.hist = runTrials(function(w) {
        return resample.residual(w, getResidualPhase2());
      }, K, weights);
      sec6.mode = "ktrials";
      var ev = evalEstimators(sec6.hist, weights);
      var estStd = ev ? Math.sqrt(ev.estVar) : 0;
      setMathHTML(
        "var-resid",
        "std of estimator " + getTestFnLabel() + " = " + estStd.toFixed(4) + "  (" + K + " trials)"
      );
      var estEl = document.getElementById("est-resid");
      if (estEl) estEl.classList.add("visible");
      redrawAll();
    });
  })();
  document.getElementById("btn-resample-bk").addEventListener("click", function() {
    var det = weights.map(function(wi) {
      return Math.floor(N * wi);
    });
    var bonusProbes = weights.map(function(wi, i) {
      var p = N * wi - det[i];
      var u = Math.random();
      return { u, p, hit: u >= 1 - p };
    });
    var total = det.map(function(d, i) {
      return d + (bonusProbes[i].hit ? 1 : 0);
    });
    secBK.detCounts = det;
    secBK.bonusProbes = bonusProbes;
    secBK.totalCounts = total;
    secBK.hist = null;
    secBK.mode = "single";
    redrawAll();
  });
  document.getElementById("btn-clear-bk").addEventListener("click", function() {
    secBK.detCounts = null;
    secBK.bonusProbes = null;
    secBK.totalCounts = null;
    secBK.hist = null;
    secBK.mode = "none";
    document.getElementById("var-bk").textContent = "";
    var estEl = document.getElementById("est-bk");
    if (estEl) estEl.classList.remove("visible");
    redrawAll();
  });
  (function() {
    var slider = document.getElementById("slider-K-bk");
    var valSpan = document.getElementById("val-K-bk");
    slider.addEventListener("input", function() {
      valSpan.textContent = slider.value;
    });
    document.getElementById("btn-run-bk").addEventListener("click", function() {
      var K = parseInt(slider.value, 10);
      secBK.hist = runTrials(resample.branchkill, K, weights);
      secBK.mode = "ktrials";
      var ev = evalEstimators(secBK.hist, weights);
      var estStd = ev ? Math.sqrt(ev.estVar) : 0;
      setMathHTML(
        "var-bk",
        "std of estimator " + getTestFnLabel() + " = " + estStd.toFixed(4) + "  (" + K + " trials)"
      );
      var estEl = document.getElementById("est-bk");
      if (estEl) estEl.classList.add("visible");
      redrawAll();
    });
  })();
  (function() {
    var slider = document.getElementById("slider-K-all");
    var valSpan = document.getElementById("val-K-all");
    slider.addEventListener("input", function() {
      valSpan.textContent = slider.value;
    });
    document.getElementById("btn-run-all").addEventListener("click", function() {
      var K = parseInt(slider.value, 10);
      setTimeout(function() {
        compData = {
          multi: runTrials(resample.multinomial, K, weights),
          strat: runTrials(resample.stratified, K, weights),
          sys: runTrials(resample.systematic, K, weights),
          resid: runTrials(function(w) {
            return resample.residual(w, getResidualPhase2());
          }, K, weights)
        };
        ["multi", "strat", "sys", "resid"].forEach(function(key) {
          var ev = evalEstimators(compData[key], weights);
          var std = ev ? Math.sqrt(ev.estVar).toFixed(4) : "\u2014";
          document.getElementById("comp-std-" + key).textContent = std;
        });
        var estEl = document.getElementById("est-comparison");
        if (estEl) estEl.classList.add("visible");
        redrawAll();
      }, 0);
    });
  })();
  var testFnOptions = [
    { value: "position", label: "i/N  (mean position)" },
    { value: "indicator", label: "1[i=4]  (single particle)" },
    { value: "tail", label: "1[i\u22655]  (upper tail)" },
    { value: "square", label: "(i/N)\xB2  (squared position)" },
    { value: "evenodd", label: "1[i even]  (even/odd class)" }
  ];
  var allTestFnSelects = document.querySelectorAll(".testfn-select");
  allTestFnSelects.forEach(function(sel) {
    testFnOptions.forEach(function(opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.value = getTestFnKey();
    sel.addEventListener("change", function(e) {
      setTestFnKey(e.target.value);
      allTestFnSelects.forEach(function(s) {
        s.value = getTestFnKey();
      });
      [["multi", sec3], ["strat", sec4], ["sys", sec5], ["resid", sec6]].forEach(function(pair) {
        var prefix = pair[0], sec = pair[1];
        if (sec.hist && sec.hist.allCounts) {
          var ev = evalEstimators(sec.hist, weights);
          if (ev) {
            setMathHTML(
              "var-" + prefix,
              "std of estimator " + getTestFnLabel() + " = " + Math.sqrt(ev.estVar).toFixed(4) + "  (" + sec.hist.K + " trials)"
            );
          }
        }
      });
      if (compData) {
        ["multi", "strat", "sys", "resid"].forEach(function(key) {
          var ev = evalEstimators(compData[key], weights);
          if (ev) {
            var std = Math.sqrt(ev.estVar).toFixed(4);
            document.getElementById("comp-var-" + key).textContent = "std=" + std;
            document.getElementById("td-var-" + key).textContent = std;
            document.getElementById("comp-std-" + key).textContent = std;
          }
        });
      }
      if (secBK.hist) {
        var evBK = evalEstimators(secBK.hist, weights);
        if (evBK) setMathHTML(
          "var-bk",
          "std of estimator " + getTestFnLabel() + " = " + Math.sqrt(evBK.estVar).toFixed(4) + "  (" + secBK.hist.K + " trials)"
        );
      }
      setTimeout(redrawAll, 0);
    });
  });
  function clearAll() {
    probes = [];
    [sec3, sec4, sec5, sec6].forEach(function(s) {
      s.probes = [];
      s.counts = null;
      s.hist = null;
      s.mode = "none";
      if (s.offset !== void 0) s.offset = 0.5 / N;
    });
    compData = null;
    document.querySelectorAll(".var-display").forEach(function(el) {
      el.textContent = "";
    });
  }
  var PRESETS = {
    uniform: function() {
      return new Array(N).fill(1 / N);
    },
    skewed: function() {
      return [0.05, 0.08, 0.12, 0.3, 0.2, 0.12, 0.08, 0.05];
    },
    degenerate: function() {
      return [0.01, 0.01, 0.02, 0.02, 0.02, 0.02, 0.01, 0.89];
    },
    alternating: function() {
      var w = [];
      for (var i = 0; i < N; i++) w.push(i % 2 === 0 ? 0.2 : 0.05);
      normalize(w);
      return w;
    }
  };
  var resizeTimer;
  window.addEventListener("resize", function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawAll, 100);
  });
  document.addEventListener("smc-preset-change", function(e) {
    var key = e.detail;
    if (PRESETS[key]) {
      weights = PRESETS[key]();
      clearAll();
      redrawAll();
    }
  });
  initToolbar({ getWeights });
  function init() {
    redrawAll();
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

  // src/smc-resampling/particle-filter.js
  function createPFViz(config) {
    var cv = document.getElementById(config.canvasId);
    if (!cv) return null;
    var nP = N;
    var T = config.nSteps || 8;
    var model = config.model || { sigmaProc: 1, sigmaObs: 0.5, yObs: 2 };
    var sigmaProc = model.sigmaProc;
    var sigmaObs = model.sigmaObs;
    var yObs = model.yObs;
    var selectedLineage = null;
    var history = [];
    var drawLayout = null;
    var hoverInfo = null;
    var rngState = null;
    function seedRng(seed) {
      var prng = createPRNG(seed);
      rngState = prng;
    }
    function random() {
      return rngState ? rngState.random() : Math.random();
    }
    function randn() {
      var u1 = random() || 1e-10, u2 = random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    function gaussLogLik(x, mu, sigma) {
      var z = (x - mu) / sigma;
      return -0.5 * z * z;
    }
    function resampleMultinomial(weights2) {
      var cs = [weights2[0]];
      for (var i = 1; i < nP; i++) cs.push(cs[i - 1] + weights2[i]);
      cs[nP - 1] = 1;
      var ancestors = [];
      for (var k = 0; k < nP; k++) {
        var u = random();
        var j = 0;
        while (j < nP - 1 && u > cs[j]) j++;
        ancestors.push(j);
      }
      return ancestors;
    }
    function run(optSeed) {
      var useSeed = false;
      if (optSeed !== void 0) {
        seedRng(optSeed);
        useSeed = true;
      } else if (config.getSeed) {
        var seed = config.getSeed();
        if (seed !== null) {
          seedRng(seed);
          useSeed = true;
        } else rngState = null;
      } else {
        rngState = null;
      }
      var origMathRandom = Math.random;
      if (useSeed) Math.random = random;
      var resampleFn = config.getResampleFn ? config.getResampleFn() : null;
      history = [];
      selectedLineage = null;
      hoverInfo = null;
      var states = [], logW = [];
      for (var i = 0; i < nP; i++) {
        states.push(randn() * sigmaProc);
        logW.push(gaussLogLik(yObs, states[i], sigmaObs));
      }
      var maxLW = Math.max.apply(null, logW);
      var w0 = logW.map(function(lw) {
        return Math.exp(lw - maxLW);
      });
      var s0 = w0.reduce(function(a, b) {
        return a + b;
      }, 0);
      w0 = w0.map(function(v) {
        return v / s0;
      });
      history.push({ weights: w0, states: states.slice(), ancestors: null });
      for (var t = 1; t <= T; t++) {
        var ancestors = null;
        var curStates = states;
        if (resampleFn) {
          var prevW = history[t - 1].weights;
          ancestors = resampleFn(prevW);
          curStates = ancestors.map(function(a) {
            return states[a];
          });
        }
        var newStates = curStates.map(function(x) {
          return x + randn() * sigmaProc;
        });
        var logW;
        if (resampleFn) {
          logW = newStates.map(function(x) {
            return gaussLogLik(yObs, x, sigmaObs);
          });
        } else {
          var prevW = history[t - 1].weights;
          logW = prevW.map(function(wi, i2) {
            return Math.log(wi) + gaussLogLik(yObs, newStates[i2], sigmaObs);
          });
        }
        var maxLW = Math.max.apply(null, logW);
        var newW = logW.map(function(lw) {
          return Math.exp(lw - maxLW);
        });
        var s = newW.reduce(function(a, b) {
          return a + b;
        }, 0);
        newW = newW.map(function(v) {
          return v / s;
        });
        history.push({
          weights: newW,
          states: newStates.slice(),
          ancestors
        });
        states = newStates;
      }
      if (useSeed) Math.random = origMathRandom;
      draw();
      if (config.onRun) config.onRun(history);
    }
    function computeDisplayPerms() {
      var perms = [];
      var perm0 = [];
      for (var i = 0; i < nP; i++) perm0.push(i);
      perms.push(perm0);
      for (var t = 1; t < history.length; t++) {
        var anc = history[t].ancestors;
        var prevPerm = perms[t - 1];
        var items = [];
        for (var i = 0; i < nP; i++) {
          var parentIdx = anc ? anc[i] : i;
          items.push({ idx: i, ancRow: prevPerm[parentIdx] });
        }
        items.sort(function(a, b) {
          return a.ancRow !== b.ancRow ? a.ancRow - b.ancRow : a.idx - b.idx;
        });
        var perm = new Array(nP);
        for (var row = 0; row < nP; row++) {
          perm[items[row].idx] = row;
        }
        perms.push(perm);
      }
      return perms;
    }
    function traceLineage(clickT, clickI) {
      var lineage = {};
      lineage[clickT + "," + clickI] = true;
      var idx = clickI;
      for (var t = clickT; t > 0; t--) {
        var anc = history[t].ancestors;
        var parent = anc ? anc[idx] : idx;
        lineage[t - 1 + "," + parent] = true;
        idx = parent;
      }
      var current = [clickI];
      for (var t = clickT + 1; t < history.length; t++) {
        var next = [];
        var anc = history[t].ancestors;
        for (var i = 0; i < nP; i++) {
          var parent = anc ? anc[i] : i;
          for (var c = 0; c < current.length; c++) {
            if (parent === current[c]) {
              lineage[t + "," + i] = true;
              next.push(i);
              break;
            }
          }
        }
        current = next;
        if (current.length === 0) break;
      }
      return lineage;
    }
    function traceAllAncestors(clickT) {
      var lineage = {};
      for (var i = 0; i < nP; i++) lineage[clickT + "," + i] = true;
      for (var i = 0; i < nP; i++) {
        var idx = i;
        for (var t = clickT; t > 0; t--) {
          var anc = history[t].ancestors;
          var parent = anc ? anc[idx] : idx;
          lineage[t - 1 + "," + parent] = true;
          idx = parent;
        }
      }
      return lineage;
    }
    function hitTest(x, y) {
      if (!drawLayout || history.length === 0) return null;
      var L = drawLayout;
      var t = Math.floor((x - L.pL) / L.colW);
      if (t < 0 || t >= history.length) return null;
      if (y > L.pB) return { type: "timestep", t };
      var displayRow = Math.floor((L.pB - y) / L.rowH);
      if (displayRow < 0 || displayRow >= nP) return null;
      var i = displayRow;
      if (L.perms && L.perms[t]) {
        var perm = L.perms[t];
        for (var pi = 0; pi < nP; pi++) {
          if (perm[pi] === displayRow) {
            i = pi;
            break;
          }
        }
      }
      return { type: "particle", t, i };
    }
    var tooltip = document.createElement("div");
    tooltip.className = "pf-tooltip";
    tooltip.style.cssText = "display:none; position:fixed; z-index:100; background:rgba(255,255,255,0.95); border:1px solid #ccc; border-radius:4px; padding:4px 7px; font-size:10px; font-family:-apple-system,sans-serif; color:#333; pointer-events:none; box-shadow:0 2px 6px rgba(0,0,0,0.1); line-height:1.4; max-width:180px;";
    document.body.appendChild(tooltip);
    function showTooltip(e, t, i) {
      if (t < 0 || t >= history.length || i < 0 || i >= nP) {
        tooltip.style.display = "none";
        return;
      }
      var h = history[t];
      var lines = [];
      lines.push("<b>t=" + (t + 1) + ", particle " + (i + 1) + "</b>");
      lines.push("state: " + h.states[i].toFixed(3));
      lines.push("weight: " + h.weights[i].toFixed(4));
      if (h.ancestors && h.ancestors[i] !== void 0) {
        lines.push("ancestor: particle " + (h.ancestors[i] + 1) + " at t=" + t);
      }
      if (t < history.length - 1) {
        var nextAnc = history[t + 1].ancestors;
        if (nextAnc) {
          var nChildren = 0;
          for (var c = 0; c < nP; c++) if (nextAnc[c] === i) nChildren++;
          lines.push("children: " + nChildren);
        }
      }
      tooltip.innerHTML = lines.join("<br>");
      tooltip.style.display = "block";
      tooltip.style.left = e.clientX + 12 + "px";
      tooltip.style.top = e.clientY - 10 + "px";
    }
    function draw() {
      var dpr = window.devicePixelRatio || 1;
      var W = cv.clientWidth, H = cv.clientHeight;
      if (W === 0 || H === 0) return;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      var ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      var margin = { top: 10, bottom: 22, left: 22, right: 6 };
      var pL = margin.left, pR = W - margin.right;
      var pT = margin.top, pB = H - margin.bottom;
      var pW = pR - pL, pH = pB - pT;
      var nCols = T + 1;
      var colW = pW / nCols;
      var rowH = pH / nP;
      var barH = rowH * 0.55;
      var maxBarW = colW * 0.8;
      var colors = PALETTE;
      var perms = computeDisplayPerms();
      function particleY(t2, i2) {
        return pB - (perms[t2][i2] + 0.5) * rowH;
      }
      drawLayout = { pL, pT, pB, colW, rowH, nCols, perms };
      ctx.strokeStyle = "#f0f0f0";
      ctx.lineWidth = 0.5;
      for (var t = 0; t < nCols; t++) {
        var gx = pL + (t + 0.5) * colW;
        ctx.beginPath();
        ctx.moveTo(gx, pT);
        ctx.lineTo(gx, pB);
        ctx.stroke();
      }
      var globalMaxW = 0;
      for (var t = 0; t < history.length; t++) {
        var mw = Math.max.apply(null, history[t].weights);
        if (mw > globalMaxW) globalMaxW = mw;
      }
      var hasSelection = selectedLineage !== null;
      for (var t = 0; t < history.length; t++) {
        var h = history[t];
        var cx = pL + (t + 0.5) * colW;
        for (var i = 0; i < nP; i++) {
          var y = particleY(t, i);
          var bw = globalMaxW > 0 ? h.weights[i] / globalMaxW * maxBarW : 0;
          var inLineage = hasSelection && selectedLineage[t + "," + i];
          var dimmed = hasSelection && !inLineage;
          var isHovered = hoverInfo && hoverInfo.t === t && hoverInfo.i === i;
          ctx.fillStyle = colors[i % colors.length];
          ctx.globalAlpha = dimmed ? 0.1 : inLineage ? 0.7 : 0.45;
          ctx.fillRect(cx - bw, y - barH / 2, bw, barH);
          ctx.strokeStyle = isHovered ? "#333" : colors[i % colors.length];
          ctx.globalAlpha = dimmed ? 0.15 : inLineage || isHovered ? 1 : 0.7;
          ctx.lineWidth = isHovered ? 1.5 : inLineage ? 1.2 : 0.7;
          ctx.strokeRect(cx - bw, y - barH / 2, bw, barH);
          ctx.globalAlpha = 1;
        }
        if (t < history.length - 1) {
          var nextH = history[t + 1];
          var nextCx = pL + (t + 1.5) * colW;
          for (var i = 0; i < nP; i++) {
            var srcIdx = nextH.ancestors ? nextH.ancestors[i] : i;
            var srcY = particleY(t, srcIdx);
            var dstY = particleY(t + 1, i);
            var nextBw = globalMaxW > 0 ? nextH.weights[i] / globalMaxW * maxBarW : 0;
            var arrowInLineage = hasSelection && selectedLineage[t + "," + srcIdx] && selectedLineage[t + 1 + "," + i];
            var arrowDimmed = hasSelection && !arrowInLineage;
            var ax1 = cx + 1;
            var ax2 = nextCx - nextBw - 1;
            if (ax2 > ax1 + 3) {
              ctx.strokeStyle = arrowInLineage ? "#555" : "#ccc";
              ctx.lineWidth = arrowInLineage ? 1.2 : 0.6;
              ctx.globalAlpha = arrowDimmed ? 0.1 : arrowInLineage ? 0.8 : 0.5;
              ctx.beginPath();
              ctx.moveTo(ax1, srcY);
              ctx.lineTo(ax2, dstY);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        }
      }
      var showESS = config.showESS !== false;
      ctx.font = "7px -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#999";
      ctx.fillText("t", pL - 3, pB + 1);
      if (showESS) ctx.fillText("ESS", pL - 3, pB + 10);
      ctx.textAlign = "center";
      for (var t = 0; t < nCols; t++) {
        var cx = pL + (t + 0.5) * colW;
        ctx.fillStyle = "#999";
        ctx.fillText(t + 1, cx, pB + 1);
        if (showESS && t < history.length) {
          var w = history[t].weights;
          var ess = 1 / w.reduce(function(s, wi) {
            return s + wi * wi;
          }, 0);
          ctx.fillStyle = ess < nP * 0.3 ? "#c0392b" : "#999";
          ctx.fillText(ess.toFixed(1), cx, pB + 10);
        }
      }
    }
    cv.addEventListener("click", function(e) {
      var rect = cv.getBoundingClientRect();
      var hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (!hit) {
        selectedLineage = null;
        draw();
        return;
      }
      if (hit.type === "timestep") {
        if (selectedLineage && selectedLineage._allAncT === hit.t) {
          selectedLineage = null;
        } else {
          selectedLineage = traceAllAncestors(hit.t);
          selectedLineage._allAncT = hit.t;
        }
      } else {
        var key = hit.t + "," + hit.i;
        if (selectedLineage && selectedLineage[key]) {
          selectedLineage = null;
        } else {
          selectedLineage = traceLineage(hit.t, hit.i);
        }
      }
      draw();
    });
    cv.addEventListener("mousemove", function(e) {
      var rect = cv.getBoundingClientRect();
      var hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit && hit.type === "particle") {
        if (!hoverInfo || hoverInfo.t !== hit.t || hoverInfo.i !== hit.i) {
          hoverInfo = { t: hit.t, i: hit.i };
          draw();
        }
        showTooltip(e, hit.t, hit.i);
        cv.style.cursor = "pointer";
      } else {
        if (hoverInfo) {
          hoverInfo = null;
          draw();
        }
        tooltip.style.display = "none";
        cv.style.cursor = hit ? "pointer" : "default";
      }
    });
    cv.addEventListener("mouseleave", function() {
      if (hoverInfo) {
        hoverInfo = null;
        draw();
      }
      tooltip.style.display = "none";
    });
    var btnRerun = config.rerunBtnId ? document.getElementById(config.rerunBtnId) : null;
    if (btnRerun) btnRerun.addEventListener("click", function() {
      run();
    });
    window.addEventListener("resize", function() {
      draw();
    });
    run();
    return { run, draw, getHistory: function() {
      return history;
    } };
  }

  // src/smc-resampling/pf-instances.js
  function initDegenViz() {
    var chkResample = document.getElementById("chk-degen-resample");
    var captionSpan = document.getElementById("degen-caption");
    function updateCaption() {
      var doResample = chkResample && chkResample.checked;
      var sisLabel = document.getElementById("degen-label-sis");
      var smcLabel = document.getElementById("degen-label-smc");
      if (sisLabel) sisLabel.className = "degen-toggle-label" + (doResample ? "" : " active");
      if (smcLabel) smcLabel.className = "degen-toggle-label" + (doResample ? " active" : "");
      if (!captionSpan) return;
      captionSpan.textContent = doResample ? "With resampling (SMC), we avoid weight degeneracy." : "Without resampling (SIS), weights often become degenerate.";
    }
    var viz = createPFViz({
      canvasId: "cv-degeneracy",
      rerunBtnId: "btn-degen-rerun",
      getResampleFn: function() {
        if (chkResample && chkResample.checked) {
          return function(w) {
            return resample.multinomial(w);
          };
        }
        return null;
      },
      nSteps: 8,
      model: { sigmaProc: 1, sigmaObs: 0.5, yObs: 2 },
      onRun: updateCaption
    });
    if (!viz) return;
    updateCaption();
    if (chkResample) {
      chkResample.addEventListener("change", function() {
        viz.run();
      });
    }
    var toggle = document.getElementById("mn-degen");
    if (toggle) toggle.addEventListener("change", function() {
      setTimeout(function() {
        viz.draw();
      }, 50);
    });
  }
  function initCompareViz() {
    var methodSelect = document.getElementById("select-pf-method");
    var chkSeed = document.getElementById("chk-pf-seed");
    var inputSeed = document.getElementById("input-pf-seed");
    if (!methodSelect) return;
    if (chkSeed && inputSeed) {
      chkSeed.addEventListener("change", function() {
        inputSeed.style.display = chkSeed.checked ? "inline" : "none";
      });
    }
    function getResampleFn() {
      var method = methodSelect.value;
      switch (method) {
        case "stratified":
          return function(w) {
            return resample.stratified(w);
          };
        case "systematic":
          return function(w) {
            return resample.systematic(w);
          };
        case "residual":
          return function(w) {
            return resample.residual(w, getResidualPhase2());
          };
        default:
          return function(w) {
            return resample.multinomial(w);
          };
      }
    }
    function getSeed() {
      if (chkSeed && chkSeed.checked && inputSeed) {
        return parseInt(inputSeed.value, 10) || 42;
      }
      return null;
    }
    function countUniqueAncestors(history, targetT) {
      var ancestors = {};
      for (var i = 0; i < N; i++) {
        var idx = i;
        for (var t = targetT; t > 0; t--) {
          var anc = history[t].ancestors;
          idx = anc ? anc[idx] : idx;
        }
        ancestors[idx] = true;
      }
      return Object.keys(ancestors).length;
    }
    var cvDiag = document.getElementById("cv-pf-diagnostics");
    function drawDiagnostics(history) {
      if (!cvDiag) return;
      var dpr = window.devicePixelRatio || 1;
      var W = cvDiag.clientWidth, H = cvDiag.clientHeight;
      if (W === 0 || H === 0) return;
      cvDiag.width = Math.round(W * dpr);
      cvDiag.height = Math.round(H * dpr);
      var ctx = cvDiag.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      var nT = history.length;
      if (nT === 0) return;
      var margin = { left: 22, right: 6, top: 12, bottom: 4 };
      var pL = margin.left, pR = W - margin.right, pW = pR - pL;
      var nCols = nT;
      var ancValues = [];
      for (var t = 0; t < nT; t++) ancValues.push(countUniqueAncestors(history, t));
      var panelTop = margin.top;
      var panelBot = H - margin.bottom;
      var pH = panelBot - panelTop;
      var color = "#2c3e50";
      ctx.fillStyle = color;
      ctx.font = "9px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("Unique ancestors at t=1 (low \u21D2 path degeneracy)", pL + 2, panelTop - 1);
      ctx.strokeStyle = "#eee";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pL, panelBot);
      ctx.lineTo(pR, panelBot);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      var first = true;
      for (var t = 1; t < nCols; t++) {
        var x = pL + (t + 0.5) / nCols * pW;
        var y = panelBot - ancValues[t] / N * pH;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      for (var t = 1; t < nCols; t++) {
        var x = pL + (t + 0.5) / nCols * pW;
        var y = panelBot - ancValues[t] / N * pH;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.font = "7px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(ancValues[t].toString(), x, y - 3);
      }
      ctx.globalAlpha = 1;
    }
    var viz = createPFViz({
      canvasId: "cv-pf-compare",
      rerunBtnId: "btn-pf-rerun",
      getResampleFn,
      getSeed,
      showESS: true,
      nSteps: 8,
      model: { sigmaProc: 1, sigmaObs: 0.5, yObs: 2 },
      onRun: function(history) {
        drawDiagnostics(history);
      }
    });
    if (!viz) return;
    methodSelect.addEventListener("change", function() {
      viz.run();
    });
    if (inputSeed) inputSeed.addEventListener("change", function() {
      viz.run();
    });
    var p2Short = { multinomial: "Multi", stratified: "Strat", systematic: "Syst" };
    function updateResidualLabel() {
      var opt = methodSelect.querySelector('option[value="residual"]');
      if (opt) opt.textContent = "Residual-" + (p2Short[getResidualPhase2()] || "Multi");
    }
    updateResidualLabel();
    var mainP2 = document.getElementById("select-resid-phase2");
    if (mainP2) mainP2.addEventListener("change", function() {
      updateResidualLabel();
    });
    var toolbarP2 = document.getElementById("smc-toolbar-phase2-select");
    if (toolbarP2) toolbarP2.addEventListener("change", function() {
      updateResidualLabel();
    });
  }
  function initKTrials() {
    var cvK = document.getElementById("cv-pf-ktrials");
    var btnRun = document.getElementById("btn-pf-ktrials");
    var sliderN = document.getElementById("slider-pf-N");
    var sliderK = document.getElementById("slider-pf-K");
    var valN = document.getElementById("val-pf-N");
    var valK = document.getElementById("val-pf-K");
    if (!cvK || !btnRun) return;
    if (sliderN) sliderN.addEventListener("input", function() {
      valN.textContent = sliderN.value;
    });
    if (sliderK) sliderK.addEventListener("input", function() {
      valK.textContent = sliderK.value;
    });
    var T = 8;
    var sigmaProc = 1, sigmaObs = 0.5, yObs = 2;
    function randn() {
      var u1 = Math.random(), u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    function gaussLogLik(x, mu, sigma) {
      var z = (x - mu) / sigma;
      return -0.5 * z * z;
    }
    function runOnePF(nP, resampleFn) {
      var states = [], logW = [];
      for (var i = 0; i < nP; i++) {
        states.push(randn() * sigmaProc);
        logW.push(gaussLogLik(yObs, states[i], sigmaObs));
      }
      var maxLW = Math.max.apply(null, logW);
      var w = logW.map(function(lw) {
        return Math.exp(lw - maxLW);
      });
      var s = w.reduce(function(a, b) {
        return a + b;
      }, 0);
      w = w.map(function(v) {
        return v / s;
      });
      var history = [{ weights: w, ancestors: null }];
      for (var t = 1; t <= T; t++) {
        var ancestors = resampleFn(w);
        var curStates = ancestors.map(function(a) {
          return states[a];
        });
        var newStates = curStates.map(function(x) {
          return x + randn() * sigmaProc;
        });
        var newLogW = newStates.map(function(x) {
          return gaussLogLik(yObs, x, sigmaObs);
        });
        var newMaxLW = Math.max.apply(null, newLogW);
        var newW = newLogW.map(function(lw) {
          return Math.exp(lw - newMaxLW);
        });
        var newS = newW.reduce(function(a, b) {
          return a + b;
        }, 0);
        newW = newW.map(function(v) {
          return v / newS;
        });
        history.push({ weights: newW, ancestors });
        states = newStates;
        w = newW;
      }
      var essPerStep = [], ancPerStep = [];
      for (var t = 0; t <= T; t++) {
        var wt = history[t].weights;
        essPerStep.push(1 / wt.reduce(function(s2, wi) {
          return s2 + wi * wi;
        }, 0));
        var ancs = {};
        for (var i = 0; i < nP; i++) {
          var idx = i;
          for (var tt = t; tt > 0; tt--) {
            idx = history[tt].ancestors[idx];
          }
          ancs[idx] = true;
        }
        ancPerStep.push(Object.keys(ancs).length);
      }
      return { ess: essPerStep, anc: ancPerStep };
    }
    function runAllMethods() {
      var nP = parseInt(sliderN.value, 10) || 8;
      var K = parseInt(sliderK.value, 10) || 50;
      var methods = [
        { name: "Multinomial", color: METHOD_COLORS.multinomial, fn: function(w) {
          return resample.multinomial(w);
        } },
        { name: "Stratified", color: METHOD_COLORS.stratified, fn: function(w) {
          return resample.stratified(w);
        } },
        { name: "Systematic", color: METHOD_COLORS.systematic, fn: function(w) {
          return resample.systematic(w);
        } },
        {
          name: "Resid-" + ({ multinomial: "Multi", stratified: "Strat", systematic: "Syst" }[getResidualPhase2()] || "Multi"),
          color: METHOD_COLORS.residual,
          fn: function(w) {
            return resample.residual(w, getResidualPhase2());
          }
        }
      ];
      var results = methods.map(function(m) {
        var runs = [];
        for (var k = 0; k < K; k++) runs.push(runOnePF(nP, m.fn));
        return { name: m.name, color: m.color, runs };
      });
      drawKTrials(results, nP, K);
    }
    function drawKTrials(results, nP, K) {
      var dpr = window.devicePixelRatio || 1;
      var W = cvK.clientWidth, H = cvK.clientHeight;
      if (W === 0 || H === 0) return;
      cvK.width = Math.round(W * dpr);
      cvK.height = Math.round(H * dpr);
      var ctx = cvK.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      var margin = { top: 12, bottom: 16, left: 22, right: 6 };
      var pL = margin.left, pR = W - margin.right;
      var pW = pR - pL;
      var nCols = T + 1;
      var dataMax = 0;
      for (var m = 0; m < results.length; m++) {
        for (var k = 0; k < K; k++) {
          for (var t = 1; t < nCols; t++) {
            var v = results[m].runs[k].anc[t];
            if (v > dataMax) dataMax = v;
          }
        }
      }
      var maxY = Math.max(nP / 2, Math.min(nP, dataMax * 1.1));
      var colW = pW / nCols;
      var panelTop = margin.top;
      var panelBot = H - margin.bottom;
      var panelH = panelBot - panelTop;
      var startT = 1;
      ctx.fillStyle = "#666";
      ctx.font = "9px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("Unique ancestors at t=1, as proportion of N (low \u21D2 path degeneracy)", pL + 2, panelTop - 1);
      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pL, panelBot);
      ctx.lineTo(pR, panelBot);
      ctx.stroke();
      ctx.strokeStyle = "#f0f0f0";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);
      var yTicks = [0.25, 0.5, 0.75, 1];
      for (var yi = 0; yi < yTicks.length; yi++) {
        var propVal = yTicks[yi] * nP;
        if (propVal > maxY) continue;
        var yy = panelBot - propVal / maxY * panelH;
        ctx.beginPath();
        ctx.moveTo(pL, yy);
        ctx.lineTo(pR, yy);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = "#bbb";
      ctx.font = "7px -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (var yi = 0; yi < yTicks.length; yi++) {
        var propVal = yTicks[yi] * nP;
        if (propVal > maxY) continue;
        var yy = panelBot - propVal / maxY * panelH;
        ctx.fillText((yTicks[yi] * 100).toFixed(0) + "%", pL - 2, yy);
      }
      ctx.fillText("0%", pL - 2, panelBot);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#999";
      for (var t = 0; t < nCols; t++) {
        ctx.fillText(t + 1, pL + (t + 0.5) * colW, panelBot + 2);
      }
      var nMethods = results.length;
      var dotSpread = colW * 0.3;
      var dotStep = nMethods > 1 ? dotSpread / (nMethods - 1) : 0;
      for (var m = 0; m < nMethods; m++) {
        var r = results[m];
        var xOff = -dotSpread / 2 + m * dotStep;
        for (var t = startT; t < nCols; t++) {
          var vals = [];
          for (var k = 0; k < K; k++) vals.push(r.runs[k].anc[t]);
          var sum = 0;
          for (var k = 0; k < K; k++) sum += vals[k];
          var mean = sum / K;
          var sumSq = 0;
          for (var k = 0; k < K; k++) sumSq += (vals[k] - mean) * (vals[k] - mean);
          var sd = Math.sqrt(sumSq / K);
          var x = pL + (t + 0.5) * colW + xOff;
          var yMean = panelBot - mean / maxY * panelH;
          var yLo = panelBot - Math.max(0, mean - sd) / maxY * panelH;
          var yHi = panelBot - Math.min(maxY, mean + sd) / maxY * panelH;
          ctx.strokeStyle = r.color;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(x, yLo);
          ctx.lineTo(x, yHi);
          ctx.moveTo(x - 2, yLo);
          ctx.lineTo(x + 2, yLo);
          ctx.moveTo(x - 2, yHi);
          ctx.lineTo(x + 2, yHi);
          ctx.stroke();
          ctx.fillStyle = r.color;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(x, yMean, 3, 0, 2 * Math.PI);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        var first = true;
        for (var t = startT; t < nCols; t++) {
          var sum = 0;
          for (var k = 0; k < K; k++) sum += r.runs[k].anc[t];
          var mean = sum / K;
          var x = pL + (t + 0.5) * colW + xOff;
          var y = panelBot - mean / maxY * panelH;
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.font = "8px -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (var m = 0; m < results.length; m++) {
        var ly = panelTop + 4 + m * 11;
        ctx.strokeStyle = results[m].color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pR - 60, ly);
        ctx.lineTo(pR - 48, ly);
        ctx.stroke();
        ctx.fillStyle = "#333";
        ctx.textAlign = "left";
        ctx.fillText(results[m].name, pR - 45, ly);
      }
    }
    function triggerRun() {
      setTimeout(runAllMethods, 0);
    }
    btnRun.addEventListener("click", triggerRun);
    if (sliderN) sliderN.addEventListener("change", triggerRun);
    if (sliderK) sliderK.addEventListener("change", triggerRun);
    var mainP2 = document.getElementById("select-resid-phase2");
    var toolbarP2 = document.getElementById("smc-toolbar-phase2-select");
    if (mainP2) mainP2.addEventListener("change", triggerRun);
    if (toolbarP2) toolbarP2.addEventListener("change", triggerRun);
    triggerRun();
  }
  function initPFInstances() {
    initDegenViz();
    initCompareViz();
    initKTrials();
  }

  // src/smc-resampling/index.js
  function startup() {
    init();
    initPFInstances();
  }
  if (document.readyState !== "loading") {
    startup();
  } else {
    document.addEventListener("DOMContentLoaded", startup);
  }
})();
