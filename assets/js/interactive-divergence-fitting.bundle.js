(() => {
  // src/interactive-divergence-fitting/config.js
  var X_MIN = -8;
  var X_MAX = 8;
  var N_GRID = 400;
  var LAND_RES = 60;
  var LAND_RES_LO = 20;

  // src/interactive-divergence-fitting/state.js
  function makeQ(mu, logSigma) {
    return { mu, logSigma, get sigma() {
      return Math.exp(this.logSigma);
    } };
  }
  function freshAdam() {
    return { mMu: 0, vMu: 0, mSig: 0, vSig: 0, t: 0 };
  }
  var _initMu = (Math.random() - 0.5) * 12;
  var _initLs = Math.log(1 + Math.random() * 2);
  var S = {
    // Target p: a mixture of two Gaussians.
    pComps: [
      { mu: -3, sigma: 0.9, w: 0.5 },
      { mu: 2, sigma: 0.7, w: 0.5 }
    ],
    // Fitted distributions (one per panel).
    qFwd: makeQ(_initMu, _initLs),
    qRev: makeQ(_initMu, _initLs),
    // Mode / method selectors.
    reverseMethod: "reinforce",
    // 'reinforce' or 'reparam'
    gradientMode: "mc",
    // 'mc' or 'deterministic'
    divergenceType: "kl",
    // 'kl' or 'chisq'
    landParam: "mu-sigma",
    // key into the PARAMS registry
    natGrad: true,
    // apply Fisher inverse to gradients
    gradClip: true,
    // clip gradient norm (mitigates reverse χ² blowup)
    // Optimal solutions (recomputed when p changes).
    optFwd: null,
    // { mu, sigma }
    optRev: [],
    // [{ mu, sigma, kl }, ...]
    // Optimizer settings / run state.
    running: true,
    K: 64,
    baseLR: 0.08,
    adamFwd: freshAdam(),
    adamRev: freshAdam(),
    // Loss-landscape grid + color range (set by computeLandscapes).
    landCurRes: LAND_RES,
    landMuMin: 0,
    landMuMax: 1,
    landLsMin: 0,
    landLsMax: 1,
    landFwdGrid: null,
    landRevGrid: null,
    landVmin: 0,
    landVmax: 1,
    // Interaction.
    hoveredHandle: null,
    dragState: null,
    landDragActive: false,
    // Last MC step result (particles) for the rug plot.
    lastFwd: null,
    lastRev: null
  };
  function resetAdam() {
    S.adamFwd = freshAdam();
    S.adamRev = freshAdam();
  }

  // src/interactive-divergence-fitting/mathutils.js
  var sqrt2pi = Math.sqrt(2 * Math.PI);
  function gaussPdf(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * sqrt2pi);
  }
  function gaussLogPdf(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return -0.5 * z * z - Math.log(sigma * sqrt2pi);
  }
  function mixturePdf(x, comps) {
    let s = 0;
    for (const c of comps) s += c.w * gaussPdf(x, c.mu, c.sigma);
    return s;
  }
  function mixtureLogPdf(x, comps) {
    let maxL = -Infinity;
    const lts = [];
    for (const c of comps) {
      const lt = Math.log(c.w) + gaussLogPdf(x, c.mu, c.sigma);
      lts.push(lt);
      if (lt > maxL) maxL = lt;
    }
    let s = 0;
    for (const lt of lts) s += Math.exp(lt - maxL);
    return maxL + Math.log(s);
  }
  function randn() {
    const u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function softmax(arr) {
    let mx = -Infinity;
    for (let i = 0; i < arr.length; i++) if (arr[i] > mx) mx = arr[i];
    const e = new Float64Array(arr.length);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      e[i] = Math.exp(arr[i] - mx);
      s += e[i];
    }
    for (let i = 0; i < arr.length; i++) e[i] /= s;
    return e;
  }
  function integrate(f, a, b, n) {
    const h = (b - a) / n;
    let s = 0.5 * (f(a) + f(b));
    for (let i = 1; i < n; i++) s += f(a + i * h);
    return s * h;
  }
  function fmtNum(v) {
    if (v === Infinity) return "\u221E";
    if (v === -Infinity) return "\u2212\u221E";
    if (!isFinite(v)) return "NaN";
    const a = Math.abs(v);
    if (a < 1e-3) return v.toExponential(2);
    if (a < 100) return v.toFixed(4);
    if (a < 1e6) return v.toFixed(1);
    return v.toExponential(2);
  }

  // src/interactive-divergence-fitting/parameterizations.js
  var PARAMS = {
    "natural": {
      label: "\u03B7\u2081, \u03B7\u2082",
      formula: "\\textcolor{#7B2D8E}{q_\\phi}(x) \\propto \\exp(\\eta_1 x + \\eta_2 x^2)",
      tooltip() {
        return S.divergenceType === "chisq" ? "Natural (exponential family) parameters. Both forward KL and forward \u03C7\xB2 are convex in \u03C6 (\u03C7\xB2 is even log-convex). The only parameterization here where gradient descent is guaranteed to find the global optimum." : "Natural (exponential family) parameters. Forward KL is convex in \u03C6 \u2014 the only parameterization here where gradient descent is guaranteed to find the global optimum.";
      },
      axes: ["\u03B7\u2081", "\u03B7\u2082"],
      fromQ(q) {
        const s2 = q.sigma * q.sigma;
        return [q.mu / s2, -1 / (2 * s2)];
      },
      toQ(a1, a2, q) {
        a2 = Math.min(-0.02, a2);
        const s2 = -1 / (2 * a2);
        q.mu = a1 * s2;
        q.logSigma = 0.5 * Math.log(s2);
      },
      toMuSigma(a1, a2) {
        a2 = Math.min(-0.02, a2);
        const s2 = -1 / (2 * a2);
        return [a1 * s2, Math.sqrt(s2)];
      },
      fromMuSigma(mu, sigma) {
        const s2 = sigma * sigma;
        return [mu / s2, -1 / (2 * s2)];
      },
      transformGrad(gMu, gLs, q) {
        const s2 = q.sigma * q.sigma;
        return [s2 * gMu, 2 * q.mu * s2 * gMu + s2 * gLs];
      },
      // F^{-1} for natural params: full 2×2, det(F) = 2σ⁶
      fisherInv(g1, g2, q) {
        const s2 = q.sigma * q.sigma, s4 = s2 * s2, mu = q.mu;
        const det = 2 * s2 * s4;
        return [
          ((4 * mu * mu * s2 + 2 * s4) * g1 - 2 * mu * s2 * g2) / det,
          (-2 * mu * s2 * g1 + s2 * g2) / det
        ];
      },
      hoverLabel(a1, a2) {
        return "\u03B7\u2081 = " + a1.toFixed(2) + "<br>\u03B7\u2082 = " + a2.toFixed(3);
      },
      bounds(pComps, optFwd, optRev, qs, divType) {
        const pts = [];
        for (const c of pComps) {
          const s2 = c.sigma * c.sigma;
          pts.push([c.mu / s2, -1 / (2 * s2)]);
        }
        if (optFwd) {
          const s2 = optFwd.sigma * optFwd.sigma;
          pts.push([optFwd.mu / s2, -1 / (2 * s2)]);
        }
        for (const o of optRev) {
          const s2 = o.sigma * o.sigma;
          pts.push([o.mu / s2, -1 / (2 * s2)]);
        }
        for (const q of qs) {
          const s2 = q.sigma * q.sigma;
          pts.push([q.mu / s2, -1 / (2 * s2)]);
        }
        let a1Lo = Infinity, a1Hi = -Infinity, a2Lo = Infinity, a2Hi = -Infinity;
        for (const [a1, a2] of pts) {
          a1Lo = Math.min(a1Lo, a1);
          a1Hi = Math.max(a1Hi, a1);
          a2Lo = Math.min(a2Lo, a2);
          a2Hi = Math.max(a2Hi, a2);
        }
        const tight = divType === "chisq" ? 0.15 : 0.3;
        const a1Pad = Math.max(1, (a1Hi - a1Lo) * tight);
        const a2Pad = Math.max(0.1, (a2Hi - a2Lo) * tight);
        const eta2Max = divType === "chisq" ? -0.05 : -0.02;
        return [a1Lo - a1Pad, a1Hi + a1Pad, a2Lo - a2Pad, Math.min(eta2Max, a2Hi + a2Pad)];
      }
    },
    "mu-sigma": {
      label: "\u03BC, \u03C3",
      formula: "\\textcolor{#7B2D8E}{q_\\phi}(x) = \\mathcal{N}(x;\\, \\mu,\\, \\sigma^2)",
      tooltip() {
        return "Direct parameterization. The optimum is moment matching: \u03BC* = \u{1D53C}\u209A[x], \u03C3* = \u221AVar\u209A(x). Simple and interpretable, but requires \u03C3 > 0 and the landscape is not globally convex.";
      },
      axes: ["\u03BC", "\u03C3"],
      fromQ(q) {
        return [q.mu, q.sigma];
      },
      toQ(a1, a2, q) {
        q.mu = a1;
        q.logSigma = Math.log(Math.max(0.1, a2));
      },
      toMuSigma(a1, a2) {
        return [a1, Math.max(0.1, a2)];
      },
      fromMuSigma(mu, sigma) {
        return [mu, sigma];
      },
      transformGrad(gMu, gLs, q) {
        return [gMu, gLs / q.sigma];
      },
      // F^{-1} = diag(σ², σ²/2)
      fisherInv(g1, g2, q) {
        const s2 = q.sigma * q.sigma;
        return [s2 * g1, s2 / 2 * g2];
      },
      hoverLabel(a1, a2) {
        return "\u03BC = " + a1.toFixed(2) + "<br>\u03C3 = " + a2.toFixed(2);
      },
      bounds(pComps, optFwd, optRev, qs, divType) {
        const pad = divType === "chisq" ? 1.15 : 1.5;
        let sLo = 0.3, sHi = divType === "chisq" ? 2 : 3;
        if (optFwd) {
          sLo = Math.min(sLo, optFwd.sigma * 0.5);
          sHi = Math.max(sHi, optFwd.sigma * pad);
        }
        for (const o of optRev) {
          sLo = Math.min(sLo, o.sigma * 0.5);
          sHi = Math.max(sHi, o.sigma * pad);
        }
        for (const c of pComps) sHi = Math.max(sHi, c.sigma * pad);
        for (const q of qs) {
          sLo = Math.min(sLo, q.sigma * 0.8);
          sHi = Math.max(sHi, q.sigma * 1.2);
        }
        return [X_MIN, X_MAX, Math.max(0.1, sLo), sHi];
      }
    },
    "mu-logsigma": {
      label: "\u03BC, log \u03C3",
      formula: "\\textcolor{#7B2D8E}{q_\\phi}(x) = \\mathcal{N}(x;\\, \\mu,\\, e^{2\\log\\sigma})",
      tooltip() {
        return "The standard ML parameterization (VAEs, normalizing flows). Unconstrained: \u03C6 \u2208 \u211D\xB2, no positivity constraints needed. Still non-convex, but log \u03C3 compresses the large-\u03C3 region where non-convexity lives.";
      },
      axes: ["\u03BC", "log \u03C3"],
      fromQ(q) {
        return [q.mu, q.logSigma];
      },
      toQ(a1, a2, q) {
        q.mu = a1;
        q.logSigma = a2;
      },
      toMuSigma(a1, a2) {
        return [a1, Math.exp(a2)];
      },
      fromMuSigma(mu, sigma) {
        return [mu, Math.log(sigma)];
      },
      transformGrad(gMu, gLs, _q) {
        return [gMu, gLs];
      },
      // F^{-1} = diag(σ², 1/2)
      fisherInv(g1, g2, q) {
        return [q.sigma * q.sigma * g1, g2 / 2];
      },
      hoverLabel(a1, a2) {
        return "\u03BC = " + a1.toFixed(2) + "<br>log \u03C3 = " + a2.toFixed(2);
      },
      bounds(pComps, optFwd, optRev, qs, divType) {
        const pad = divType === "chisq" ? 0.3 : 0.5;
        let lsLo = -0.5, lsHi = divType === "chisq" ? 0.8 : 1.5;
        if (optFwd) {
          lsLo = Math.min(lsLo, Math.log(optFwd.sigma) - pad);
          lsHi = Math.max(lsHi, Math.log(optFwd.sigma) + pad);
        }
        for (const o of optRev) {
          lsLo = Math.min(lsLo, Math.log(o.sigma) - pad);
          lsHi = Math.max(lsHi, Math.log(o.sigma) + pad);
        }
        for (const c of pComps) lsHi = Math.max(lsHi, Math.log(c.sigma) + pad);
        for (const q of qs) {
          lsLo = Math.min(lsLo, q.logSigma - 0.3);
          lsHi = Math.max(lsHi, q.logSigma + 0.3);
        }
        return [X_MIN, X_MAX, lsLo, lsHi];
      }
    },
    "mu-tau": {
      label: "\u03BC, \u03C4",
      formula: "\\textcolor{#7B2D8E}{q_\\phi}(x) \\propto \\sqrt{\\tau}\\,\\exp\\!\\bigl({-}\\tfrac{\\tau}{2}(x{-}\\mu)^2\\bigr)",
      tooltip() {
        return "Precision parameterization: \u03C4 = 1/\u03C3\xB2. Since \u03B7\u2082 = \u2212\u03C4/2, \u03C4 is linear in one natural parameter. But \u03B7\u2081 = \u03BC\u03C4 is bilinear in (\u03BC,\u03C4), so the joint map is nonlinear \u2014 partial linearity is not enough for convexity.";
      },
      axes: ["\u03BC", "\u03C4"],
      fromQ(q) {
        return [q.mu, 1 / (q.sigma * q.sigma)];
      },
      toQ(a1, a2, q) {
        a2 = Math.max(0.04, a2);
        q.mu = a1;
        q.logSigma = -0.5 * Math.log(a2);
      },
      toMuSigma(a1, a2) {
        a2 = Math.max(0.04, a2);
        return [a1, 1 / Math.sqrt(a2)];
      },
      fromMuSigma(mu, sigma) {
        return [mu, 1 / (sigma * sigma)];
      },
      transformGrad(gMu, gLs, q) {
        const s2 = q.sigma * q.sigma;
        return [gMu, -gLs * s2 / 2];
      },
      // F^{-1} = diag(1/τ, 2τ²) = diag(σ², 2/σ⁴)
      fisherInv(g1, g2, q) {
        const s2 = q.sigma * q.sigma;
        return [s2 * g1, 2 * g2 / (s2 * s2)];
      },
      hoverLabel(a1, a2) {
        return "\u03BC = " + a1.toFixed(2) + "<br>\u03C4 = " + a2.toFixed(2);
      },
      bounds(pComps, optFwd, optRev, qs, divType) {
        const pad = divType === "chisq" ? 1.15 : 1.5;
        let tLo = 0.2, tHi = 3;
        if (optFwd) {
          const t = 1 / (optFwd.sigma * optFwd.sigma);
          tLo = Math.min(tLo, t * 0.5);
          tHi = Math.max(tHi, t * pad);
        }
        for (const o of optRev) {
          const t = 1 / (o.sigma * o.sigma);
          tLo = Math.min(tLo, t * 0.5);
          tHi = Math.max(tHi, t * pad);
        }
        for (const c of pComps) {
          const t = 1 / (c.sigma * c.sigma);
          tLo = Math.min(tLo, t * 0.5);
          tHi = Math.max(tHi, t * pad);
        }
        for (const q of qs) {
          const t = 1 / (q.sigma * q.sigma);
          tLo = Math.min(tLo, t * 0.7);
          tHi = Math.max(tHi, t * 1.3);
        }
        const tLoFloor = divType === "chisq" ? 0.1 : 0.04;
        return [X_MIN, X_MAX, Math.max(tLoFloor, tLo), tHi];
      }
    }
  };
  function curP() {
    return PARAMS[S.landParam];
  }
  function qToLand(q) {
    return curP().fromQ(q);
  }
  function setQFromLand(a1, a2, q) {
    curP().toQ(a1, a2, q);
  }
  function landToMuSigma(a1, a2) {
    return curP().toMuSigma(a1, a2);
  }
  function muSigmaToLand(mu, sigma) {
    return curP().fromMuSigma(mu, sigma);
  }
  function transformGrad(g1, g2, q) {
    return curP().transformGrad(g1, g2, q);
  }

  // src/interactive-divergence-fitting/algorithms.js
  function intRange() {
    let lo = Infinity, hi = -Infinity;
    for (const c of S.pComps) {
      lo = Math.min(lo, c.mu - 6 * c.sigma);
      hi = Math.max(hi, c.mu + 6 * c.sigma);
    }
    return [Math.min(lo, -10), Math.max(hi, 10)];
  }
  function computeOptimal() {
    if (S.divergenceType === "chisq") {
      S.optFwd = null;
    } else {
      let Ep = 0, Ep2 = 0;
      for (const c of S.pComps) {
        Ep += c.w * c.mu;
        Ep2 += c.w * (c.sigma * c.sigma + c.mu * c.mu);
      }
      const fwdVar = Ep2 - Ep * Ep;
      S.optFwd = { mu: Ep, sigma: Math.sqrt(Math.max(0.01, fwdVar)) };
    }
    S.optRev = [];
  }
  function computeLandBounds() {
    const [a1Lo, a1Hi, a2Lo, a2Hi] = curP().bounds(S.pComps, S.optFwd, S.optRev, [S.qFwd, S.qRev], S.divergenceType);
    S.landMuMin = a1Lo;
    S.landMuMax = a1Hi;
    S.landLsMin = a2Lo;
    S.landLsMax = a2Hi;
  }
  function computeLandscapes(res, _retry) {
    res = res || LAND_RES;
    computeLandBounds();
    const mus = new Float64Array(res);
    const lss = new Float64Array(res);
    S.landCurRes = res;
    for (let i = 0; i < res; i++) {
      mus[i] = S.landMuMin + (S.landMuMax - S.landMuMin) * i / (res - 1);
      lss[i] = S.landLsMin + (S.landLsMax - S.landLsMin) * i / (res - 1);
    }
    S.landFwdGrid = new Float64Array(res * res);
    S.landRevGrid = new Float64Array(res * res);
    const [intA, intB] = intRange();
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const [mu, sigma] = landToMuSigma(mus[i], lss[j]);
        const idx = j * res + i;
        if (!isFinite(mu) || !isFinite(sigma) || sigma > 30 || Math.abs(mu) > 50) {
          S.landFwdGrid[idx] = 100;
          S.landRevGrid[idx] = 100;
          continue;
        }
        const lo = Math.min(intA, mu - 5 * sigma);
        const hi = Math.max(intB, mu + 5 * sigma);
        const nInt = res < 30 ? 100 : 300;
        if (S.divergenceType === "chisq") {
          S.landFwdGrid[idx] = integrate((x) => {
            const px = mixturePdf(x, S.pComps);
            const qx = gaussPdf(x, mu, sigma);
            return qx > 1e-15 ? px * px / qx : 0;
          }, lo, hi, nInt) - 1;
          S.landRevGrid[idx] = integrate((x) => {
            const px = mixturePdf(x, S.pComps);
            const qx = gaussPdf(x, mu, sigma);
            return px > 1e-15 ? qx * qx / px : 0;
          }, lo, hi, nInt) - 1;
        } else {
          S.landFwdGrid[idx] = integrate((x) => {
            const px = mixturePdf(x, S.pComps);
            if (px < 1e-15) return 0;
            return px * (mixtureLogPdf(x, S.pComps) - gaussLogPdf(x, mu, sigma));
          }, lo, hi, nInt);
          S.landRevGrid[idx] = integrate((x) => {
            const qx = gaussPdf(x, mu, sigma);
            if (qx < 1e-15) return 0;
            return qx * (gaussLogPdf(x, mu, sigma) - mixtureLogPdf(x, S.pComps));
          }, lo, hi, nInt);
        }
        if (S.landFwdGrid[idx] < 0) S.landFwdGrid[idx] = Infinity;
        if (S.landRevGrid[idx] < 0) S.landRevGrid[idx] = Infinity;
      }
    }
    const allVals = [];
    for (let i = 0; i < S.landFwdGrid.length; i++) {
      allVals.push(Math.max(S.landFwdGrid[i], 1e-3));
      allVals.push(Math.max(S.landRevGrid[i], 1e-3));
    }
    allVals.sort((a, b) => a - b);
    S.landVmin = Math.log10(1e-3);
    S.landVmax = Math.log10(allVals[Math.floor(allVals.length * 0.85)]);
    function chisqFwdEval(mu, sigma) {
      const lo = Math.min(intA, mu - 6 * sigma);
      const hi = Math.max(intB, mu + 6 * sigma);
      return integrate((z) => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        return qz > 1e-15 ? pz * pz / qz : 0;
      }, lo, hi, 800) - 1;
    }
    function gradChisqFwd(mu, sigma) {
      const lo = Math.min(intA, mu - 6 * sigma);
      const hi = Math.max(intB, mu + 6 * sigma);
      const sig2 = sigma * sigma;
      const gMu = -integrate((z) => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        if (qz < 1e-15) return 0;
        return pz * pz / qz * (z - mu) / sig2;
      }, lo, hi, 800);
      const gSigma = -integrate((z) => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        if (qz < 1e-15) return 0;
        return pz * pz / qz * ((z - mu) * (z - mu) / (sig2 * sigma) - 1 / sigma);
      }, lo, hi, 800);
      return { dmu: gMu, dsigma: gSigma };
    }
    function chisqRevEval(mu, sigma) {
      const lo = Math.min(intA, mu - 6 * sigma);
      const hi = Math.max(intB, mu + 6 * sigma);
      return integrate((z) => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        return pz > 1e-15 ? qz * qz / pz : 0;
      }, lo, hi, 800) - 1;
    }
    function gradChisqRev(mu, sigma) {
      const lo = Math.min(intA, mu - 6 * sigma);
      const hi = Math.max(intB, mu + 6 * sigma);
      const sig2 = sigma * sigma;
      const gMu = 2 * integrate((z) => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        if (pz < 1e-15) return 0;
        return qz * qz / pz * (z - mu) / sig2;
      }, lo, hi, 800);
      const gSigma = 2 * integrate((z) => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, mu, sigma);
        if (pz < 1e-15) return 0;
        return qz * qz / pz * ((z - mu) * (z - mu) / (sig2 * sigma) - 1 / sigma);
      }, lo, hi, 800);
      return { dmu: gMu, dsigma: gSigma };
    }
    function klRevEval(mu, sigma) {
      const lo = Math.min(intA, mu - 6 * sigma);
      const hi = Math.max(intB, mu + 6 * sigma);
      return integrate((x) => {
        const qx = gaussPdf(x, mu, sigma);
        if (qx < 1e-15) return 0;
        return qx * (gaussLogPdf(x, mu, sigma) - mixtureLogPdf(x, S.pComps));
      }, lo, hi, 800);
    }
    function gradRevRefine(mu, sigma) {
      const lo = Math.min(intA, mu - 6 * sigma);
      const hi = Math.max(intB, mu + 6 * sigma);
      function dLogP(x) {
        const px = mixturePdf(x, S.pComps);
        if (px < 1e-15) return 0;
        let dp = 0;
        for (const c of S.pComps)
          dp += c.w * gaussPdf(x, c.mu, c.sigma) * (-(x - c.mu) / (c.sigma * c.sigma));
        return dp / px;
      }
      const Eq_dlogp = integrate((x) => gaussPdf(x, mu, sigma) * dLogP(x), lo, hi, 800);
      const Eq_z_dlogp = integrate((x) => gaussPdf(x, mu, sigma) * ((x - mu) / sigma) * dLogP(x), lo, hi, 800);
      return { dmu: -Eq_dlogp, dsigma: -1 / sigma - Eq_z_dlogp };
    }
    function optimizeGeneric(evalFn, gradFn, startMu, startSigma) {
      let mu = startMu, sigma = startSigma;
      let f = evalFn(mu, sigma);
      for (let i = 0; i < 300; i++) {
        const g = gradFn(mu, sigma);
        const s2 = sigma * sigma;
        let dMu = s2 * g.dmu;
        let dSig = s2 / 2 * g.dsigma;
        const norm = Math.hypot(dMu, dSig);
        if (norm < 1e-7) break;
        if (norm > 10) {
          const s = 10 / norm;
          dMu *= s;
          dSig *= s;
        }
        let t = 1, improved = false;
        for (let b = 0; b < 12; b++) {
          const nmu = mu - t * dMu;
          const nsig = Math.max(0.1, sigma - t * dSig);
          const nf = evalFn(nmu, nsig);
          if (isFinite(nf) && nf < f) {
            mu = nmu;
            sigma = nsig;
            f = nf;
            improved = true;
            break;
          }
          t *= 0.5;
        }
        if (!improved) break;
      }
      return { mu, sigma, kl: f };
    }
    function multiStartOptimize(evalFn, gradFn) {
      const results = [];
      for (const c of S.pComps) results.push(optimizeGeneric(evalFn, gradFn, c.mu, c.sigma));
      const meanMu = S.pComps.reduce((s, c) => s + c.w * c.mu, 0);
      results.push(optimizeGeneric(evalFn, gradFn, meanMu, 1.5));
      for (let i = 0; i < S.pComps.length; i++)
        for (let j = i + 1; j < S.pComps.length; j++)
          results.push(optimizeGeneric(evalFn, gradFn, (S.pComps[i].mu + S.pComps[j].mu) / 2, 1.5));
      const optima = [];
      for (const r of results) {
        if (!isFinite(r.kl) || r.kl < -0.01) continue;
        const dup = optima.find((o) => Math.abs(o.mu - r.mu) < 0.3 && Math.abs(o.sigma - r.sigma) < 0.3);
        if (dup) {
          if (r.kl < dup.kl) {
            dup.mu = r.mu;
            dup.sigma = r.sigma;
            dup.kl = r.kl;
          }
        } else optima.push({ ...r });
      }
      optima.sort((a, b) => a.kl - b.kl);
      return optima;
    }
    if (S.divergenceType === "chisq") {
      const fwdOptima = multiStartOptimize(chisqFwdEval, gradChisqFwd);
      S.optFwd = fwdOptima.length > 0 ? fwdOptima[0] : { mu: 0, sigma: 1 };
      S.optRev = multiStartOptimize(chisqRevEval, gradChisqRev);
    } else {
      S.optRev = multiStartOptimize(klRevEval, gradRevRefine);
    }
    function optimumInBounds(o) {
      const [a1, a2] = muSigmaToLand(o.mu, o.sigma);
      return a1 >= S.landMuMin && a1 <= S.landMuMax && a2 >= S.landLsMin && a2 <= S.landLsMax;
    }
    let needRecompute = false;
    if (S.optFwd && !optimumInBounds(S.optFwd)) needRecompute = true;
    for (const o of S.optRev) if (!optimumInBounds(o)) needRecompute = true;
    if (needRecompute && !_retry) return computeLandscapes(res, true);
  }
  function adamUpdate(q, gradMu, gradLogSigma, state) {
    let [g1, g2] = transformGrad(gradMu, gradLogSigma, q);
    if (S.natGrad) [g1, g2] = curP().fisherInv(g1, g2, q);
    if (S.gradClip) {
      const gNorm = Math.sqrt(g1 * g1 + g2 * g2);
      if (gNorm > 5) {
        const s = 5 / gNorm;
        g1 *= s;
        g2 *= s;
      }
    }
    const [p1, p2] = qToLand(q);
    state.t++;
    const lr = S.baseLR / (1 + 1e-3 * state.t);
    if (S.natGrad) {
      const beta = 0.9;
      state.mMu = beta * state.mMu + (1 - beta) * g1;
      state.mSig = beta * state.mSig + (1 - beta) * g2;
      setQFromLand(p1 - lr * state.mMu, p2 - lr * state.mSig, q);
    } else {
      const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
      state.mMu = beta1 * state.mMu + (1 - beta1) * g1;
      state.vMu = beta2 * state.vMu + (1 - beta2) * g1 * g1;
      const mh = state.mMu / (1 - Math.pow(beta1, state.t));
      const vh = state.vMu / (1 - Math.pow(beta2, state.t));
      state.mSig = beta1 * state.mSig + (1 - beta1) * g2;
      state.vSig = beta2 * state.vSig + (1 - beta2) * g2 * g2;
      const mhs = state.mSig / (1 - Math.pow(beta1, state.t));
      const vhs = state.vSig / (1 - Math.pow(beta2, state.t));
      setQFromLand(
        p1 - lr * mh / (Math.sqrt(vh) + eps),
        p2 - lr * mhs / (Math.sqrt(vhs) + eps),
        q
      );
    }
  }
  function stepForwardKL() {
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) z[i] = S.qFwd.mu + S.qFwd.sigma * randn();
    const logw = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++)
      logw[i] = mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qFwd.mu, S.qFwd.sigma);
    const w = softmax(logw);
    const sig2 = S.qFwd.sigma * S.qFwd.sigma;
    let gMu = 0, gLs = 0;
    for (let i = 0; i < S.K; i++) {
      const score_mu = (z[i] - S.qFwd.mu) / sig2;
      const score_ls = (z[i] - S.qFwd.mu) * (z[i] - S.qFwd.mu) / sig2 - 1;
      gMu += w[i] * score_mu;
      gLs += w[i] * score_ls;
    }
    adamUpdate(S.qFwd, -gMu, -gLs, S.adamFwd);
    return { z, alpha: w };
  }
  function stepREINFORCE() {
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) z[i] = S.qRev.mu + S.qRev.sigma * randn();
    const reward = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++)
      reward[i] = mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qRev.mu, S.qRev.sigma);
    const sig2 = S.qRev.sigma * S.qRev.sigma;
    let gMu = 0, gLs = 0;
    for (let i = 0; i < S.K; i++) {
      const score_mu = (z[i] - S.qRev.mu) / sig2;
      const score_ls = (z[i] - S.qRev.mu) * (z[i] - S.qRev.mu) / sig2 - 1;
      gMu += reward[i] * score_mu / S.K;
      gLs += reward[i] * score_ls / S.K;
    }
    adamUpdate(S.qRev, -gMu, -gLs, S.adamRev);
    const alpha = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) alpha[i] = reward[i] / S.K;
    return { z, alpha };
  }
  function stepReverseKL() {
    const eps = new Float64Array(S.K);
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) {
      eps[i] = randn();
      z[i] = S.qRev.mu + S.qRev.sigma * eps[i];
    }
    let gMu = 0, gLs = 0;
    for (let i = 0; i < S.K; i++) {
      const px = mixturePdf(z[i], S.pComps);
      if (px < 1e-15) continue;
      let dpx = 0;
      for (const c of S.pComps)
        dpx += c.w * gaussPdf(z[i], c.mu, c.sigma) * (-(z[i] - c.mu) / (c.sigma * c.sigma));
      const score_p = dpx / px;
      gMu += score_p / S.K;
      gLs += score_p * S.qRev.sigma * eps[i] / S.K;
    }
    gLs += 1;
    adamUpdate(S.qRev, -gMu, -gLs, S.adamRev);
    const alpha = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++)
      alpha[i] = (mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qRev.mu, S.qRev.sigma)) / S.K;
    return { z, alpha };
  }
  function stepForwardKL_deterministic() {
    const mu = S.qFwd.mu, sigma = S.qFwd.sigma, sig2 = sigma * sigma;
    let Epx = 0, Epxmu2 = 0;
    for (const c of S.pComps) {
      Epx += c.w * c.mu;
      Epxmu2 += c.w * (c.sigma * c.sigma + (c.mu - mu) * (c.mu - mu));
    }
    adamUpdate(S.qFwd, (mu - Epx) / sig2, 1 - Epxmu2 / sig2, S.adamFwd);
  }
  function stepReverseKL_deterministic() {
    const mu = S.qRev.mu, sigma = S.qRev.sigma;
    const [iA, iB] = intRange();
    const lo = Math.min(iA, mu - 6 * sigma);
    const hi = Math.max(iB, mu + 6 * sigma);
    function dLogP(x) {
      const px = mixturePdf(x, S.pComps);
      if (px < 1e-15) return 0;
      let dpx = 0;
      for (const c of S.pComps)
        dpx += c.w * gaussPdf(x, c.mu, c.sigma) * (-(x - c.mu) / (c.sigma * c.sigma));
      return dpx / px;
    }
    const Eq_dlogp = integrate((x) => gaussPdf(x, mu, sigma) * dLogP(x), lo, hi, 400);
    const Eq_xmu_dlogp = integrate((x) => gaussPdf(x, mu, sigma) * (x - mu) * dLogP(x), lo, hi, 400);
    adamUpdate(S.qRev, -Eq_dlogp, -1 - Eq_xmu_dlogp, S.adamRev);
  }
  function stepForwardChisq() {
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) z[i] = S.qFwd.mu + S.qFwd.sigma * randn();
    const logw = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++)
      logw[i] = mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qFwd.mu, S.qFwd.sigma);
    const w = softmax(logw);
    const sig2 = S.qFwd.sigma * S.qFwd.sigma;
    let gMu = 0, gLs = 0;
    for (let i = 0; i < S.K; i++) {
      const w2 = w[i] * w[i];
      const score_mu = (z[i] - S.qFwd.mu) / sig2;
      const score_ls = (z[i] - S.qFwd.mu) * (z[i] - S.qFwd.mu) / sig2 - 1;
      gMu += S.K * w2 * score_mu;
      gLs += S.K * w2 * score_ls;
    }
    adamUpdate(S.qFwd, -gMu, -gLs, S.adamFwd);
    const alpha = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) alpha[i] = w[i] * w[i];
    return { z, alpha };
  }
  function stepReverseChisq() {
    const z = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) z[i] = S.qRev.mu + S.qRev.sigma * randn();
    const sig2 = S.qRev.sigma * S.qRev.sigma;
    let gMu = 0, gLs = 0;
    const alpha = new Float64Array(S.K);
    for (let i = 0; i < S.K; i++) {
      const r = mixtureLogPdf(z[i], S.pComps) - gaussLogPdf(z[i], S.qRev.mu, S.qRev.sigma);
      const qOverP = Math.exp(-r);
      const score_mu = (z[i] - S.qRev.mu) / sig2;
      const score_ls = (z[i] - S.qRev.mu) * (z[i] - S.qRev.mu) / sig2 - 1;
      gMu += 2 * qOverP * score_mu / S.K;
      gLs += 2 * qOverP * score_ls / S.K;
      alpha[i] = -qOverP;
    }
    adamUpdate(S.qRev, gMu, gLs, S.adamRev);
    return { z, alpha };
  }
  function stepForwardChisq_deterministic() {
    const mu = S.qFwd.mu, sigma = S.qFwd.sigma, sig2 = sigma * sigma;
    const [iA, iB] = intRange();
    const lo = Math.min(iA, mu - 6 * sigma);
    const hi = Math.max(iB, mu + 6 * sigma);
    const gMu = -integrate((z) => {
      const pz = mixturePdf(z, S.pComps);
      const qz = gaussPdf(z, mu, sigma);
      if (qz < 1e-15) return 0;
      return pz * pz / qz * (z - mu) / sig2;
    }, lo, hi, 400);
    const gLs = -integrate((z) => {
      const pz = mixturePdf(z, S.pComps);
      const qz = gaussPdf(z, mu, sigma);
      if (qz < 1e-15) return 0;
      return pz * pz / qz * ((z - mu) * (z - mu) / sig2 - 1);
    }, lo, hi, 400);
    adamUpdate(S.qFwd, gMu, gLs, S.adamFwd);
  }
  function stepReverseChisq_deterministic() {
    const mu = S.qRev.mu, sigma = S.qRev.sigma, sig2 = sigma * sigma;
    const [iA, iB] = intRange();
    const lo = Math.min(iA, mu - 6 * sigma);
    const hi = Math.max(iB, mu + 6 * sigma);
    const gMu = 2 * integrate((z) => {
      const pz = mixturePdf(z, S.pComps);
      const qz = gaussPdf(z, mu, sigma);
      if (pz < 1e-15) return 0;
      return qz * qz / pz * (z - mu) / sig2;
    }, lo, hi, 400);
    const gLs = 2 * integrate((z) => {
      const pz = mixturePdf(z, S.pComps);
      const qz = gaussPdf(z, mu, sigma);
      if (pz < 1e-15) return 0;
      return qz * qz / pz * ((z - mu) * (z - mu) / sig2 - 1);
    }, lo, hi, 400);
    adamUpdate(S.qRev, gMu, gLs, S.adamRev);
  }
  function chisqEval(qMu, qSigma, direction) {
    const [iA, iB] = intRange();
    const lo = Math.min(iA, qMu - 6 * qSigma);
    const hi = Math.max(iB, qMu + 6 * qSigma);
    if (direction === "forward") {
      return integrate((z) => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, qMu, qSigma);
        return qz > 1e-15 ? pz * pz / qz : 0;
      }, lo, hi, 400) - 1;
    } else {
      return integrate((z) => {
        const pz = mixturePdf(z, S.pComps);
        const qz = gaussPdf(z, qMu, qSigma);
        return pz > 1e-15 ? qz * qz / pz : 0;
      }, lo, hi, 400) - 1;
    }
  }
  function klEval(qMu, qSigma, direction) {
    const [iA, iB] = intRange();
    const lo = Math.min(iA, qMu - 6 * qSigma);
    const hi = Math.max(iB, qMu + 6 * qSigma);
    if (direction === "forward") {
      return integrate((x) => {
        const px = mixturePdf(x, S.pComps);
        if (px < 1e-15) return 0;
        return px * (mixtureLogPdf(x, S.pComps) - gaussLogPdf(x, qMu, qSigma));
      }, lo, hi, 400);
    } else {
      return integrate((x) => {
        const qx = gaussPdf(x, qMu, qSigma);
        if (qx < 1e-15) return 0;
        return qx * (gaussLogPdf(x, qMu, qSigma) - mixtureLogPdf(x, S.pComps));
      }, lo, hi, 400);
    }
  }
  function divForward() {
    return S.divergenceType === "chisq" ? chisqEval(S.qFwd.mu, S.qFwd.sigma, "forward") : klEval(S.qFwd.mu, S.qFwd.sigma, "forward");
  }
  function divReverse() {
    return S.divergenceType === "chisq" ? chisqEval(S.qRev.mu, S.qRev.sigma, "reverse") : klEval(S.qRev.mu, S.qRev.sigma, "reverse");
  }

  // src/interactive-divergence-fitting/drawing.js
  var PURPLE = "#7B2D8E";
  function xToC(x, c) {
    return (x - X_MIN) / (X_MAX - X_MIN) * c.width;
  }
  function cToX(cx, c) {
    return X_MIN + cx / c.width * (X_MAX - X_MIN);
  }
  function yToC(y, c, yMax) {
    const dpr = window.devicePixelRatio || 1;
    const margin = 20 * dpr;
    return c.height - margin - y / yMax * (c.height - margin);
  }
  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }
  function heatmap(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [
      [0, 1, 1, 1],
      // white (KL = 0)
      [0.4, 1, 1, 0.55],
      // yellow
      [0.65, 1, 0.65, 0.15],
      // orange
      [0.85, 0.85, 0.2, 0.05],
      // red
      [1, 0.5, 0, 0]
      // dark red
    ];
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, r0, g0, b0] = stops[i];
    const [t1, r1, g1, b1] = stops[i + 1];
    const f = (t - t0) / (t1 - t0);
    const r = Math.round(255 * (r0 + f * (r1 - r0)));
    const g = Math.round(255 * (g0 + f * (g1 - g0)));
    const b = Math.round(255 * (b0 + f * (b1 - b0)));
    return `rgb(${r},${g},${b})`;
  }
  function computeYMax(q, optima) {
    const dx = (X_MAX - X_MIN) / N_GRID;
    let yMax = 0;
    for (let i = 0; i <= N_GRID; i++) {
      const x = X_MIN + i * dx;
      yMax = Math.max(yMax, mixturePdf(x, S.pComps), gaussPdf(x, q.mu, q.sigma));
    }
    if (optima) for (const opt of optima)
      for (let i = 0; i <= N_GRID; i++)
        yMax = Math.max(yMax, gaussPdf(X_MIN + i * dx, opt.mu, opt.sigma));
    return yMax * 1.15;
  }
  function drawLandscape(canvas, grid, q, optima) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const margin = 25 * dpr;
    const plotW = canvas.width - margin;
    const plotH = canvas.height - margin;
    function muToX(mu) {
      return margin + (mu - S.landMuMin) / (S.landMuMax - S.landMuMin) * plotW;
    }
    function lsToY(ls) {
      return (1 - (ls - S.landLsMin) / (S.landLsMax - S.landLsMin)) * plotH;
    }
    const cellW = plotW / (S.landCurRes - 1);
    const cellH = plotH / (S.landCurRes - 1);
    ctx.globalAlpha = 0.12;
    for (let j = 0; j < S.landCurRes; j++) {
      for (let i = 0; i < S.landCurRes; i++) {
        const v = Math.log10(Math.max(grid[j * S.landCurRes + i], 0.01));
        const t = (v - S.landVmin) / (S.landVmax - S.landVmin + 1e-8);
        ctx.fillStyle = heatmap(t);
        const cx = margin + i * cellW;
        const cy = (S.landCurRes - 1 - j) * cellH;
        ctx.fillRect(cx - cellW / 2, cy - cellH / 2, cellW + 1, cellH + 1);
      }
    }
    ctx.globalAlpha = 1;
    const rawLogGrid = new Float64Array(S.landCurRes * S.landCurRes);
    for (let k = 0; k < rawLogGrid.length; k++) {
      const v = Math.log10(Math.max(grid[k], 1e-3));
      rawLogGrid[k] = isFinite(v) ? v : 100;
    }
    const logGrid = new Float64Array(rawLogGrid.length);
    const _med = new Float64Array(25);
    for (let j = 0; j < S.landCurRes; j++) {
      for (let i = 0; i < S.landCurRes; i++) {
        let n = 0;
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const jj = Math.max(0, Math.min(S.landCurRes - 1, j + dj));
            const ii = Math.max(0, Math.min(S.landCurRes - 1, i + di));
            _med[n++] = rawLogGrid[jj * S.landCurRes + ii];
          }
        _med.sort();
        logGrid[j * S.landCurRes + i] = _med[12];
      }
    }
    const sorted = Float64Array.from(logGrid).filter((v) => isFinite(v) && v > S.landVmin).sort();
    const panelVknee = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.85)] : S.landVmax;
    const panelVtop = sorted.length > 0 ? sorted[sorted.length - 1] : S.landVmax;
    const CS = [
      [],
      [[0, 2]],
      [[0, 1]],
      [[2, 1]],
      [[3, 1]],
      [[0, 2], [3, 1]],
      [[0, 3]],
      [[2, 3]],
      [[3, 2]],
      [[0, 3]],
      [[0, 1], [3, 2]],
      [[3, 1]],
      [[2, 1]],
      [[0, 1]],
      [[0, 2]],
      []
    ];
    const nMain = 20, nTail = 5;
    for (let li = 1; li <= nMain + nTail; li++) {
      const level = li <= nMain ? S.landVmin + (panelVknee - S.landVmin) * li / nMain : panelVknee + (panelVtop - panelVknee) * (li - nMain) / nTail;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(80,80,80,0.3)";
      ctx.lineWidth = 1 * dpr;
      for (let j = 0; j < S.landCurRes - 1; j++) {
        for (let i = 0; i < S.landCurRes - 1; i++) {
          const sw = logGrid[j * S.landCurRes + i];
          const se = logGrid[j * S.landCurRes + i + 1];
          const ne = logGrid[(j + 1) * S.landCurRes + i + 1];
          const nw = logGrid[(j + 1) * S.landCurRes + i];
          const c = (sw >= level ? 1 : 0) | (se >= level ? 2 : 0) | (ne >= level ? 4 : 0) | (nw >= level ? 8 : 0);
          if (c === 0 || c === 15) continue;
          const x0 = margin + i * cellW, x1 = x0 + cellW;
          const yBot = (S.landCurRes - 1 - j) * cellH;
          const lerp = (a, b) => (level - a) / (b - a + 1e-15);
          const ep = [
            { x: x0 + lerp(sw, se) * cellW, y: yBot },
            { x: x1, y: yBot - lerp(se, ne) * cellH },
            { x: x0, y: yBot - lerp(sw, nw) * cellH },
            { x: x0 + lerp(nw, ne) * cellW, y: yBot - cellH }
          ];
          for (const [e1, e2] of CS[c]) {
            ctx.moveTo(ep[e1].x, ep[e1].y);
            ctx.lineTo(ep[e2].x, ep[e2].y);
          }
        }
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(margin, 0);
    ctx.lineTo(margin, plotH);
    ctx.lineTo(margin + plotW, plotH);
    ctx.stroke();
    ctx.fillStyle = "#666";
    ctx.font = 9 * dpr + "px sans-serif";
    function tickStep(range) {
      const rough = range / 6;
      const mag = Math.pow(10, Math.floor(Math.log10(rough)));
      const norm = rough / mag;
      return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
    }
    function fmtTick(v, step) {
      return step >= 1 ? v.toFixed(0) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2);
    }
    const xStep = tickStep(S.landMuMax - S.landMuMin);
    const yStep = tickStep(S.landLsMax - S.landLsMin);
    ctx.textAlign = "center";
    for (let t = Math.ceil(S.landMuMin / xStep) * xStep; t <= S.landMuMax; t += xStep) {
      const x = muToX(t);
      ctx.fillText(fmtTick(t, xStep), x, plotH + 13 * dpr);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let t = Math.ceil(S.landLsMin / yStep) * yStep; t <= S.landLsMax; t += yStep) {
      const y = lsToY(t);
      ctx.fillText(fmtTick(t, yStep), margin - 4 * dpr, y);
    }
    const [xLabel, yLabel] = curP().axes;
    ctx.textAlign = "center";
    ctx.fillText(xLabel, margin + plotW / 2, plotH + 22 * dpr);
    ctx.save();
    ctx.translate(8 * dpr, plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    if (optima) {
      for (let oi = 0; oi < optima.length; oi++) {
        const opt = optima[oi];
        const isGlobal = oi === 0;
        const [oa1, oa2] = muSigmaToLand(opt.mu, opt.sigma);
        const ox = muToX(oa1);
        const oy = lsToY(oa2);
        const s = isGlobal ? 5 * dpr : 4 * dpr;
        ctx.lineWidth = (isGlobal ? 2 : 1.5) * dpr;
        ctx.lineCap = "round";
        ctx.strokeStyle = isGlobal ? "rgba(123,45,142,0.9)" : "rgba(123,45,142,0.5)";
        ctx.beginPath();
        ctx.moveTo(ox - s, oy - s);
        ctx.lineTo(ox + s, oy + s);
        ctx.moveTo(ox + s, oy - s);
        ctx.lineTo(ox - s, oy + s);
        if (isGlobal) {
          ctx.moveTo(ox, oy - s);
          ctx.lineTo(ox, oy + s);
          ctx.moveTo(ox - s, oy);
          ctx.lineTo(ox + s, oy);
        }
        ctx.stroke();
      }
    }
    const [qa1, qa2] = qToLand(q);
    const qx = muToX(qa1);
    const qy = lsToY(qa2);
    ctx.beginPath();
    ctx.arc(qx, qy, 7 * dpr, 0, 2 * Math.PI);
    ctx.strokeStyle = PURPLE;
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();
  }
  function drawPanel(canvas, q, optima, particles, label) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dx = (X_MAX - X_MIN) / N_GRID;
    const yMax = computeYMax(q, optima);
    const margin = 20 * dpr;
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - margin);
    ctx.lineTo(canvas.width, canvas.height - margin);
    ctx.stroke();
    ctx.fillStyle = "#aaa";
    ctx.font = 10 * dpr + "px sans-serif";
    ctx.textAlign = "center";
    for (let t = Math.ceil(X_MIN); t <= Math.floor(X_MAX); t++) {
      const cx = xToC(t, canvas);
      ctx.beginPath();
      ctx.moveTo(cx, canvas.height - margin);
      ctx.lineTo(cx, canvas.height - margin + 3 * dpr);
      ctx.stroke();
      ctx.fillText(t, cx, canvas.height - 4 * dpr);
    }
    ctx.beginPath();
    ctx.moveTo(xToC(X_MIN, canvas), yToC(0, canvas, yMax));
    for (let i = 0; i <= N_GRID; i++) {
      const x = X_MIN + i * dx;
      ctx.lineTo(xToC(x, canvas), yToC(mixturePdf(x, S.pComps), canvas, yMax));
    }
    ctx.lineTo(xToC(X_MAX, canvas), yToC(0, canvas, yMax));
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    if (optima) {
      for (let oi = optima.length - 1; oi >= 0; oi--) {
        const opt = optima[oi];
        const isGlobal = oi === 0;
        ctx.beginPath();
        ctx.setLineDash(isGlobal ? [6 * dpr, 4 * dpr] : [3 * dpr, 4 * dpr]);
        for (let i = 0; i <= N_GRID; i++) {
          const x = X_MIN + i * dx;
          const y = gaussPdf(x, opt.mu, opt.sigma);
          if (i === 0) ctx.moveTo(xToC(x, canvas), yToC(y, canvas, yMax));
          else ctx.lineTo(xToC(x, canvas), yToC(y, canvas, yMax));
        }
        ctx.strokeStyle = isGlobal ? "rgba(123,45,142,0.6)" : "rgba(123,45,142,0.3)";
        ctx.lineWidth = (isGlobal ? 1.5 : 1) * dpr;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const stemMax = 0.15 * yMax;
    const baselineY = yToC(0, canvas, yMax);
    const isFwd = label === "fwd";
    if (isFwd && S.gradientMode === "mc") {
      const curveW = new Float64Array(N_GRID + 1);
      let wMax = 0;
      const useWSquared = S.divergenceType === "chisq";
      for (let i = 0; i <= N_GRID; i++) {
        const x = X_MIN + i * dx;
        const r = mixtureLogPdf(x, S.pComps) - gaussLogPdf(x, q.mu, q.sigma);
        const w = Math.exp(r);
        curveW[i] = useWSquared ? w * w : w;
        if (curveW[i] > wMax) wMax = curveW[i];
      }
      if (wMax > 0) {
        ctx.beginPath();
        ctx.setLineDash([2 * dpr, 2 * dpr]);
        for (let i = 0; i <= N_GRID; i++) {
          const cx = xToC(X_MIN + i * dx, canvas);
          const cy = yToC(curveW[i] / wMax * stemMax, canvas, yMax);
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        }
        ctx.strokeStyle = "rgba(50,100,220,0.4)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (particles && particles.alpha) {
      const rugH = 8 * dpr;
      const axisY = canvas.height - margin;
      let maxAbs = 0;
      for (let i = 0; i < particles.alpha.length; i++) {
        const a = Math.abs(particles.alpha[i]);
        if (a > maxAbs) maxAbs = a;
      }
      if (maxAbs === 0) maxAbs = 1;
      for (let i = 0; i < particles.alpha.length; i++) {
        const px = xToC(particles.z[i], canvas);
        const ai = particles.alpha[i];
        const opacity = (0.1 + 0.9 * Math.abs(ai) / maxAbs).toFixed(2);
        ctx.strokeStyle = ai >= 0 ? `rgba(50,100,220,${opacity})` : `rgba(200,50,50,${opacity})`;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, axisY);
        ctx.lineTo(px, axisY + rugH);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    for (let i = 0; i <= N_GRID; i++) {
      const x = X_MIN + i * dx;
      const y = gaussPdf(x, q.mu, q.sigma);
      if (i === 0) ctx.moveTo(xToC(x, canvas), yToC(y, canvas, yMax));
      else ctx.lineTo(xToC(x, canvas), yToC(y, canvas, yMax));
    }
    ctx.strokeStyle = PURPLE;
    ctx.lineWidth = 2.5 * dpr;
    ctx.stroke();
    for (const c of S.pComps) {
      const cx = xToC(c.mu, canvas);
      const cy = yToC(c.w * gaussPdf(c.mu, c.mu, c.sigma), canvas, yMax);
      ctx.beginPath();
      ctx.arc(cx, cy, 5 * dpr, 0, 2 * Math.PI);
      ctx.fillStyle = S.hoveredHandle && S.hoveredHandle.comp === c ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.2)";
      ctx.fill();
    }
    const qcx = xToC(q.mu, canvas);
    const qcy = yToC(gaussPdf(q.mu, q.mu, q.sigma), canvas, yMax);
    ctx.beginPath();
    ctx.arc(qcx, qcy, 5 * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = S.hoveredHandle && S.hoveredHandle.q === q ? PURPLE : "rgba(123,45,142,0.35)";
    ctx.fill();
  }

  // src/interactive-divergence-fitting/interaction.js
  function getHandles(canvas, q, optima) {
    const yMax = computeYMax(q, optima);
    const handles = [];
    for (const c of S.pComps) {
      handles.push({
        target: "p",
        comp: c,
        cx: xToC(c.mu, canvas),
        cy: yToC(c.w * gaussPdf(c.mu, c.mu, c.sigma), canvas, yMax)
      });
    }
    handles.push({
      target: "q",
      q,
      cx: xToC(q.mu, canvas),
      cy: yToC(gaussPdf(q.mu, q.mu, q.sigma), canvas, yMax)
    });
    return handles;
  }
  function hitTest(canvas, q, optima, mx, my) {
    const dpr = window.devicePixelRatio || 1;
    const handles = getHandles(canvas, q, optima);
    let best = null, bestD = 18 * dpr;
    for (const h of handles) {
      const d = Math.hypot(mx - h.cx, my - h.cy);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }
  function getPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * dpr, y: (cy - rect.top) * dpr };
  }
  function setupCanvas(canvas, q, getOptima) {
    function onDown(e) {
      e.preventDefault();
      const pos = getPos(canvas, e);
      const h = hitTest(canvas, q, getOptima(), pos.x, pos.y);
      if (h) {
        const startSigma = h.target === "p" ? h.comp.sigma : h.q.sigma;
        S.dragState = { handle: h, canvas, startY: pos.y, startSigma };
        canvas.style.cursor = "grabbing";
      }
    }
    function onMove(e) {
      const pos = getPos(canvas, e);
      if (S.dragState && S.dragState.canvas === canvas) {
        e.preventDefault();
        const dpr = window.devicePixelRatio || 1;
        const newMu = cToX(pos.x, canvas);
        const dy = pos.y - S.dragState.startY;
        const newSigma = Math.max(0.1, S.dragState.startSigma + dy / (150 * dpr));
        if (S.dragState.handle.target === "p") {
          S.dragState.handle.comp.mu = newMu;
          S.dragState.handle.comp.sigma = newSigma;
          computeOptimal();
          computeLandscapes(LAND_RES_LO);
        } else {
          S.dragState.handle.q.mu = newMu;
          S.dragState.handle.q.logSigma = Math.log(newSigma);
        }
      } else {
        const h = hitTest(canvas, q, getOptima(), pos.x, pos.y);
        S.hoveredHandle = h;
        canvas.style.cursor = h ? "grab" : "crosshair";
      }
    }
    function onUp() {
      if (S.dragState) {
        S.dragState.canvas.style.cursor = "crosshair";
        if (S.dragState.handle.target === "p") {
          computeOptimal();
          computeLandscapes();
        }
        resetAdam();
        S.lastFwd = null;
        S.lastRev = null;
        S.dragState = null;
      }
    }
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
  }
  var _landTip = null;
  function landTipEl() {
    if (!_landTip) _landTip = document.getElementById("land-tooltip");
    return _landTip;
  }
  function showTip(html, clientX, clientY) {
    const landTip = landTipEl();
    if (!landTip) return;
    landTip.innerHTML = html;
    landTip.style.display = "block";
    let x = clientX + 14, y = clientY - 60;
    const w = landTip.offsetWidth, h = landTip.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + w > vw - 4) x = clientX - w - 10;
    if (y < 4) y = 4;
    if (y + h > vh - 4) y = vh - h - 4;
    landTip.style.left = x + "px";
    landTip.style.top = y + "px";
  }
  function hideTip() {
    const landTip = landTipEl();
    if (landTip) landTip.style.display = "none";
  }
  function setupLandscape(canvas, q, getGrid) {
    let landDrag = null;
    function getLandPos(e) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (cx - rect.left) * dpr, y: (cy - rect.top) * dpr, cx, cy };
    }
    function posToParams(pos) {
      const dpr = window.devicePixelRatio || 1;
      const margin = 25 * dpr;
      const plotW = canvas.width - margin;
      const plotH = canvas.height - margin;
      const a1 = S.landMuMin + (pos.x - margin) / plotW * (S.landMuMax - S.landMuMin);
      const a2 = S.landLsMax - pos.y / plotH * (S.landLsMax - S.landLsMin);
      return { a1, a2 };
    }
    function isNearQ(pos) {
      const dpr = window.devicePixelRatio || 1;
      const margin = 25 * dpr;
      const plotW = canvas.width - margin;
      const plotH = canvas.height - margin;
      const [qa1, qa2] = qToLand(q);
      const qx = margin + (qa1 - S.landMuMin) / (S.landMuMax - S.landMuMin) * plotW;
      const qy = (1 - (qa2 - S.landLsMin) / (S.landLsMax - S.landLsMin)) * plotH;
      return Math.hypot(pos.x - qx, pos.y - qy) < 15 * dpr;
    }
    function onDown(e) {
      const pos = getLandPos(e);
      if (isNearQ(pos)) {
        e.preventDefault();
        landDrag = true;
        S.landDragActive = true;
        canvas.style.cursor = "grabbing";
      }
    }
    function onMove(e) {
      const pos = getLandPos(e);
      if (landDrag) {
        e.preventDefault();
        const p = posToParams(pos);
        const a1 = Math.max(S.landMuMin, Math.min(S.landMuMax, p.a1));
        const a2 = Math.max(S.landLsMin, Math.min(S.landLsMax, p.a2));
        setQFromLand(a1, a2, q);
      } else {
        canvas.style.cursor = isNearQ(pos) ? "grab" : "crosshair";
      }
    }
    function onHover(e) {
      const pos = getLandPos(e);
      const p = posToParams(pos);
      if (p.a1 >= S.landMuMin && p.a1 <= S.landMuMax && p.a2 >= S.landLsMin && p.a2 <= S.landLsMax) {
        const grid = getGrid();
        const fi = (p.a1 - S.landMuMin) / (S.landMuMax - S.landMuMin) * (S.landCurRes - 1);
        const fj = (p.a2 - S.landLsMin) / (S.landLsMax - S.landLsMin) * (S.landCurRes - 1);
        const i = Math.round(Math.max(0, Math.min(S.landCurRes - 1, fi)));
        const j = Math.round(Math.max(0, Math.min(S.landCurRes - 1, fj)));
        const kl = grid[j * S.landCurRes + i];
        const divLabel = S.divergenceType === "chisq" ? "\u03C7\xB2" : "KL";
        const paramLabel = curP().hoverLabel(p.a1, p.a2);
        showTip(divLabel + " = " + fmtNum(kl) + "<br>" + paramLabel, pos.cx, pos.cy);
      }
    }
    canvas.addEventListener("mousemove", onHover);
    canvas.addEventListener("mouseleave", hideTip);
    function onUp() {
      if (landDrag) {
        landDrag = false;
        S.landDragActive = false;
        canvas.style.cursor = "default";
        resetAdam();
        S.lastFwd = null;
        S.lastRev = null;
      }
    }
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("touchstart", function(e) {
      onDown(e);
      if (!landDrag) onMove(e);
    }, { passive: false });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", function() {
      onUp();
      hideTip();
    });
  }

  // src/interactive-divergence-fitting/main.js
  var canvasFwd;
  var canvasRev;
  var canvasLandFwd;
  var canvasLandRev;
  var btnPlayPause;
  var btnStep;
  var sliderK;
  var selectDiv;
  var selectParam;
  var qFormulaEl;
  var btnDeterministic;
  var btnMC;
  var btnReinforce;
  var btnReparam;
  var sliderMix;
  var doOneStep = false;
  var stepsPerSec = 60;
  var stepsAccum = 0;
  var lastFrameTime = 0;
  var fpsFrames = 0;
  var fpsLast = 0;
  var fpsVal = 0;
  var recomputeTimer = null;
  function initCanvases() {
    resizeCanvas(canvasFwd);
    resizeCanvas(canvasRev);
    resizeCanvas(canvasLandFwd);
    resizeCanvas(canvasLandRev);
  }
  function updatePlayState() {
    btnPlayPause.innerHTML = S.running ? '\u23F8 <span class="key">\u2423</span>' : '\u25B6 <span class="key">\u2423</span>';
    btnPlayPause.classList.toggle("active", !S.running);
    btnStep.disabled = S.running;
  }
  var LOG_K_MAX = Math.log(512);
  function kToSlider(k) {
    return Math.round(Math.log(Math.max(1, k)) / LOG_K_MAX * 1e3);
  }
  function sliderToK(s) {
    return Math.max(1, Math.round(Math.exp(s / 1e3 * LOG_K_MAX)));
  }
  function setK(v) {
    S.K = Math.max(1, Math.min(512, v));
    sliderK.value = kToSlider(S.K);
    document.getElementById("val-K").textContent = S.K;
  }
  var LOG_SPEED_MIN = 1;
  var LOG_SPEED_MAX = 12;
  function speedFromSlider(v) {
    return Math.pow(2, LOG_SPEED_MIN + v / 1e3 * (LOG_SPEED_MAX - LOG_SPEED_MIN));
  }
  function updateViaLabels() {
    const fwdVia = document.getElementById("fwd-via");
    const revVia = document.getElementById("rev-via");
    if (S.divergenceType === "kl") {
      fwdVia.textContent = S.gradientMode === "mc" ? ", via importance sampling" : ", via closed-form moments of p";
      revVia.textContent = S.gradientMode === "mc" ? ", via " : ", via numerical integration";
    } else {
      fwdVia.textContent = S.gradientMode === "mc" ? ", via IS (w\xB2 weights)" : ", via numerical integration";
      revVia.textContent = S.gradientMode === "mc" ? ", via pathwise estimator" : ", via numerical integration";
    }
    fitRowLabels();
  }
  function setDivergence(type) {
    S.divergenceType = type;
    selectDiv.value = type;
    document.body.classList.toggle("div-kl", type === "kl");
    document.body.classList.toggle("div-chisq", type === "chisq");
    updateViaLabels();
    renderQFormula();
    updateOptimizerNote();
    computeOptimal();
    computeLandscapes();
    resetAdam();
    S.lastFwd = null;
    S.lastRev = null;
  }
  function renderQFormula() {
    if (typeof katex !== "undefined" && qFormulaEl) {
      katex.render(curP().formula, qFormulaEl, { throwOnError: false });
      qFormulaEl.title = curP().tooltip() || "";
    }
  }
  function updateOptimizerNote() {
    const el = document.getElementById("optimizer-note");
    let s = "<b>Optimizer</b>: With <b>natural gradient</b> on (default), gradients are premultiplied by <b>F\u207B\xB9</b> (Fisher information inverse of <i>q<sub>\u03C6</sub></i>) and fed to <b>SGD with momentum</b> (\u03B2 = 0.9) \u2014 this makes the update parameterization-invariant. With natural gradient off, <b>Adam</b> is used instead (\u03B2\u2081 = 0.9, \u03B2\u2082 = 0.999, \u03B5 = 10\u207B\u2078). Learning rate decays as lr<sub>t</sub> = lr\u2080 / (1 + 0.001t). Optimization is over the selected \u03C6.";
    if (S.divergenceType === "chisq") {
      s += " Note: F\u207B\xB9 is the Fisher of <i>q</i>, not the Hessian of \u03C7\xB2, so natural gradient is not Newton's method here (unlike forward KL in natural parameters). The forward \u03C7\xB2 landscape is still convex in natural parameters (in fact log-convex), so convergence is guaranteed.";
    }
    el.innerHTML = s;
  }
  function setGradientMode(mode) {
    S.gradientMode = mode;
    btnDeterministic.classList.toggle("active", mode === "deterministic");
    btnMC.classList.toggle("active", mode === "mc");
    document.body.className = (mode === "mc" ? "mode-mc" : "mode-det") + " " + (S.divergenceType === "kl" ? "div-kl" : "div-chisq");
    updateViaLabels();
    document.getElementById("subtitle").textContent = mode === "mc" ? "Monte Carlo gradient estimation \u2014 drag the target modes or the fitted distribution" : "Deterministic gradient computation \u2014 drag the target modes or the fitted distribution";
    resetAdam();
    S.lastFwd = null;
    S.lastRev = null;
  }
  function isOffGrid(q) {
    const [a1, a2] = qToLand(q);
    return a1 < S.landMuMin || a1 > S.landMuMax || a2 < S.landLsMin || a2 > S.landLsMax;
  }
  function scheduleRecompute() {
    if (recomputeTimer !== null) return;
    recomputeTimer = setTimeout(() => {
      recomputeTimer = null;
      if (!isOffGrid(S.qFwd) && !isOffGrid(S.qRev)) return;
      const prev = [S.landMuMin, S.landMuMax, S.landLsMin, S.landLsMax];
      computeLandBounds();
      const delta = Math.abs(S.landMuMin - prev[0]) + Math.abs(S.landMuMax - prev[1]) + Math.abs(S.landLsMin - prev[2]) + Math.abs(S.landLsMax - prev[3]);
      const range = prev[1] - prev[0] + (prev[3] - prev[2]);
      if (delta / (range + 1e-8) > 0.08) {
        computeLandscapes();
      }
    }, 250);
  }
  function doStep() {
    if (S.divergenceType === "chisq") {
      if (S.gradientMode === "deterministic") {
        stepForwardChisq_deterministic();
        stepReverseChisq_deterministic();
        S.lastFwd = null;
        S.lastRev = null;
      } else {
        S.lastFwd = stepForwardChisq();
        S.lastRev = stepReverseChisq();
      }
    } else {
      if (S.gradientMode === "deterministic") {
        stepForwardKL_deterministic();
        stepReverseKL_deterministic();
        S.lastFwd = null;
        S.lastRev = null;
      } else {
        S.lastFwd = stepForwardKL();
        S.lastRev = S.reverseMethod === "reinforce" ? stepREINFORCE() : stepReverseKL();
      }
    }
    fpsFrames++;
    if (isOffGrid(S.qFwd) || isOffGrid(S.qRev)) scheduleRecompute();
  }
  function updateKLDisplay(id, klVal) {
    const el = document.getElementById(id);
    const numEl = el.querySelector(".kl-num");
    numEl.textContent = fmtNum(klVal);
    const t = (Math.log10(Math.max(klVal, 1e-3)) - S.landVmin) / (S.landVmax - S.landVmin);
    numEl.style.borderBottomColor = heatmap(t);
  }
  function updateQParams(id, q) {
    const [a1, a2] = qToLand(q);
    const [n1, n2] = curP().axes;
    document.getElementById(id).textContent = n1 + "=" + fmtNum(a1) + "  " + n2 + "=" + fmtNum(a2);
  }
  function frame(now) {
    if (now - fpsLast >= 1e3) {
      fpsVal = fpsFrames;
      fpsFrames = 0;
      fpsLast = now;
      document.getElementById("fps-display").textContent = fpsVal + " steps/s";
    }
    const dt = lastFrameTime ? now - lastFrameTime : 0;
    lastFrameTime = now;
    if (!S.dragState && !S.landDragActive) {
      if (S.running) {
        stepsAccum += stepsPerSec * dt / 1e3;
        const n = Math.min(Math.floor(stepsAccum), 256);
        stepsAccum -= n;
        for (let i = 0; i < n; i++) doStep();
      } else if (doOneStep) {
        doStep();
        doOneStep = false;
      }
    } else {
      stepsAccum = 0;
    }
    drawPanel(canvasFwd, S.qFwd, S.optFwd ? [S.optFwd] : null, S.lastFwd, "fwd");
    drawPanel(canvasRev, S.qRev, S.optRev, S.lastRev, S.reverseMethod === "reinforce" ? "rf" : "rev");
    drawLandscape(canvasLandFwd, S.landFwdGrid, S.qFwd, S.optFwd ? [S.optFwd] : null);
    drawLandscape(canvasLandRev, S.landRevGrid, S.qRev, S.optRev);
    updateKLDisplay("kl-fwd", divForward());
    updateKLDisplay("kl-rev", divReverse());
    updateQParams("q-params-fwd", S.qFwd);
    updateQParams("q-params-rev", S.qRev);
    requestAnimationFrame(frame);
  }
  function fitRowLabels() {
    for (const el of document.querySelectorAll('.row-label, .control-row:not([style*="flex-wrap:wrap"])')) {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > 6) {
        size -= 0.5;
        el.style.fontSize = size + "px";
      }
    }
  }
  function init() {
    canvasFwd = document.getElementById("canvas-fwd");
    canvasRev = document.getElementById("canvas-rev");
    canvasLandFwd = document.getElementById("canvas-land-fwd");
    canvasLandRev = document.getElementById("canvas-land-rev");
    if (!canvasFwd) return;
    btnPlayPause = document.getElementById("btn-playpause");
    btnStep = document.getElementById("btn-step");
    sliderK = document.getElementById("slider-K");
    selectDiv = document.getElementById("select-divergence");
    selectParam = document.getElementById("select-parameterization");
    qFormulaEl = document.getElementById("q-formula");
    btnDeterministic = document.getElementById("btn-deterministic");
    btnMC = document.getElementById("btn-mc");
    btnReinforce = document.getElementById("btn-reinforce");
    btnReparam = document.getElementById("btn-reparam");
    sliderMix = document.getElementById("slider-mix");
    computeOptimal();
    computeLandscapes();
    initCanvases();
    window.addEventListener("resize", initCanvases);
    setupCanvas(canvasFwd, S.qFwd, () => S.optFwd ? [S.optFwd] : null);
    setupCanvas(canvasRev, S.qRev, () => S.optRev);
    setupLandscape(canvasLandFwd, S.qFwd, () => S.landFwdGrid);
    setupLandscape(canvasLandRev, S.qRev, () => S.landRevGrid);
    btnPlayPause.addEventListener("click", function() {
      S.running = !S.running;
      updatePlayState();
    });
    btnStep.addEventListener("click", function() {
      if (!S.running) doOneStep = true;
    });
    document.getElementById("btn-reset").addEventListener("click", function() {
      const mu0 = (Math.random() - 0.5) * 8;
      const sig0 = 0.3 + Math.random() * 2;
      const ls0 = Math.log(sig0);
      S.qFwd.mu = mu0;
      S.qFwd.logSigma = ls0;
      S.qRev.mu = mu0;
      S.qRev.logSigma = ls0;
      resetAdam();
    });
    sliderK.addEventListener("input", function() {
      setK(sliderToK(+this.value));
    });
    document.getElementById("btn-K-minus").addEventListener("click", () => setK(S.K - 1));
    document.getElementById("btn-K-plus").addEventListener("click", () => setK(S.K + 1));
    document.getElementById("slider-speed").addEventListener("input", function() {
      stepsPerSec = speedFromSlider(+this.value);
    });
    document.getElementById("slider-lr").addEventListener("input", function() {
      S.baseLR = +this.value / 100;
      document.getElementById("val-lr").textContent = S.baseLR.toFixed(2);
    });
    sliderMix.addEventListener("input", function() {
      const w2 = +this.value / 100;
      document.getElementById("val-mix").textContent = w2.toFixed(2);
      S.pComps[0].w = 1 - w2;
      S.pComps[1].w = w2;
      S.lastFwd = null;
      S.lastRev = null;
      computeOptimal();
      computeLandscapes(LAND_RES_LO);
    });
    sliderMix.addEventListener("change", function() {
      computeOptimal();
      computeLandscapes();
      resetAdam();
    });
    selectDiv.addEventListener("change", function() {
      setDivergence(this.value);
    });
    for (const [key, param] of Object.entries(PARAMS)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = param.label;
      selectParam.appendChild(opt);
    }
    selectParam.value = S.landParam;
    window.renderQFormula = renderQFormula;
    renderQFormula();
    selectParam.addEventListener("change", function() {
      S.landParam = this.value;
      resetAdam();
      S.lastFwd = null;
      S.lastRev = null;
      renderQFormula();
      computeLandscapes();
    });
    updateOptimizerNote();
    document.getElementById("chk-natgrad").addEventListener("change", function() {
      S.natGrad = this.checked;
      resetAdam();
    });
    document.getElementById("chk-gradclip").addEventListener("change", function() {
      S.gradClip = this.checked;
    });
    btnDeterministic.addEventListener("click", () => setGradientMode("deterministic"));
    btnMC.addEventListener("click", () => setGradientMode("mc"));
    btnReinforce.addEventListener("click", function() {
      if (S.reverseMethod === "reinforce") return;
      S.reverseMethod = "reinforce";
      this.classList.add("active");
      btnReparam.classList.remove("active");
      resetAdam();
    });
    btnReparam.addEventListener("click", function() {
      if (S.reverseMethod === "reparam") return;
      S.reverseMethod = "reparam";
      this.classList.add("active");
      btnReinforce.classList.remove("active");
      resetAdam();
    });
    document.addEventListener("keydown", function(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        S.running = !S.running;
        updatePlayState();
      } else if ((e.key === ">" || e.key === ".") && !S.running) {
        doOneStep = true;
      }
    });
    fpsLast = performance.now();
    requestAnimationFrame(frame);
    updateViaLabels();
    fitRowLabels();
    window.addEventListener("resize", fitRowLabels);
  }

  // src/interactive-divergence-fitting/index.js
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
