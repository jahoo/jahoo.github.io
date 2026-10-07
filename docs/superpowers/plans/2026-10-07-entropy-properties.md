# Differential Entropy Phase 2b: Properties on One Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild everything after the entropy post's opening figure on the shared probability model: a new "h is a width" section on the transform figure, quantize and stretch figures rewritten on the shared drawing stack, the prose cut to the budget, the table extended, and the draft section moved to its own unlisted page.

**Architecture:** Three new pure modules in `src/lib/prob/` (`width.js`, `quantize.js`, `stretch.js`) carry the math and are unit-tested. The transform figure gains a `width` option. Two new DOM figures in `src/differential-entropy/` draw on `Region`/`createMathLayer` and read `model.view()`; a small shared helper `panel-px.js` draws p_X in an upright panel. `main.js` holds one model and one position and redraws every figure on any change. The MI figure and its old plotting stack stay.

**Tech Stack:** ES modules bundled by esbuild (entries `src/*/index.js`), `node --test` (`make test`), pandoc markdown posts with Lua filters, MathJax v4, modern CSS.

**Spec:** `docs/superpowers/specs/2026-10-07-entropy-properties-design.md`

## Global Constraints

- Branch: `entropy-opening` (phase 2a is there, unmerged). Commit on it.
- `log` means `log_2` with no subscript anywhere in text or labels; units are bits.
- Notation: `p_X` for pmf and pdf alike. No `\pmf`/`\pdf` in the entropy post.
- Text budget per section: a few lines, one display equation where named, a figure, a one-or-two-sentence caption; formal detail in sidenotes (`^[...]`).
- `a = 2^s`, `s ∈ [-3, 3]`: `a > 0` always.
- Quantize bins: a density's grid starts at 0, a pmf's at 0.5.
- The MI figure (`fig-mi.js`, `svgplot.js`, `ui.js`, its markup and CSS) is unchanged.
- Commit messages: no `Co-Authored-By`; end with `Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd`.
- Never `rm -rf`; delete files with `git rm` (tracked files) or `trash`.
- Run `make test` after each task; the whole suite must stay green (408 tests before this plan).

## Review Focus

1. **One-hot pmf (H = 0) in width mode:** the box must be 1 slot wide, height 1, centred on the atom, and the readout `2^H = 1.00`; no NaN, no division by zero. → Task 1 test "one-hot pmf has a box of one slot".
2. **Tempered pmf (β ≠ 1) in the new figures:** `v.p` is the tempered pmf and `v.base` the edited one; quantize and stretch must use `v.p` for every number and draw `v.base` faint only where the panel is editable. → Task 2 test "a tempered view quantizes its tempered pmf".
3. **An atom without mass (p = 0) under permutation and quantization:** `shannonH` skips zeros; `stretchView` must keep the zero at its new slot; the box of a pmf with zeros is still correct. → Task 3 test "a permutation carries an atom without mass".
4. **Large stretch with a narrow density (a = 1/8 on the Gaussian preset):** the stretched σ = 0.025 stays above `S_MIN`; `sampleShape` still covers it; h drops by 3 bits. → Task 3 test "stretching a density by a adds log a to h" uses a = 1/4 and a = 3; add a = 1/8 there.
5. **Very fine Δ (2⁻¹²) on the bimodal preset:** ~15k bins; the histogram must be one path, and the curve cached per distribution so sliding Δ does not recompute all 61 points. → Task 5 draws the histogram as one `R.area` path; the cache key is tested by inspection in the browser check (DOM code).

---

### Task 1: `width.js` — entropy as a size

**Files:**
- Create: `src/lib/prob/width.js`
- Test: `src/lib/prob/width.test.js`

**Interfaces:**
- Consumes: `createModel()` from `./model.js` (`m.setCase('disc'|'cont')`, `m.setPreset(key)`, `m.view()` → `{ disc, p, F, n, base?, xRange }` or `{ disc: false, shape, S: { xs, fs, Fs, peak }, win: { x0, x1, y1 }, xRange }`); `log2`, `runningIntegral`, `shapeMoments` from `./dist.js`.
- Produces: `entropyOf(v) → number` (bits); `meanOf(v) → number`; `boxOf(v) → { H, cx, w, ht }`. A discrete view may carry `xs` (atom positions); then `meanOf` and the slot width use them.

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/prob/width.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { entropyOf, meanOf, boxOf } from './width.js';

export const view = (kase, key) => { const m = createModel(); m.setCase(kase); m.setPreset(key); return m.view(); };
export const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) < tol, `${msg} ${a} vs ${b} (tol ${tol})`);

describe('entropy as a size', () => {
    it('the uniform pmf on 8 outcomes has 2^H = 8: a box 8 slots wide, 1/8 high, centred at 4.5', () => {
        const b = boxOf(view('disc', 'uniform'));
        near(b.H, 3, 1e-12); near(b.w, 8, 1e-9); near(b.ht, 1 / 8, 1e-12); near(b.cx, 4.5, 1e-12);
    });
    it('the one-hot pmf has a box of one slot, height 1, on its atom', () => {
        const b = boxOf(view('disc', 'onehot'));
        near(b.H, 0, 1e-12); near(b.w, 1, 1e-12); near(b.ht, 1, 1e-12); near(b.cx, 3, 1e-12);
    });
    it('the uniform density of width 0.7 has 2^h = 0.7: a box as wide as its support', () => {
        const b = boxOf(view('cont', 'uniform'));
        near(b.w, 0.7, 1e-3); near(b.cx, 0, 1e-9); near(b.w * b.ht, 1, 1e-12);
    });
    it('the Gaussian preset (σ = 0.2) has h = ½ log(2πe σ²): negative, with a width below 1', () => {
        const v = view('cont', 'gauss'), h = 0.5 * Math.log2(2 * Math.PI * Math.E * 0.04);
        near(entropyOf(v), h, 0.01);
        assert.ok(entropyOf(v) < 0);
        assert.ok(boxOf(v).w < 1);
    });
    it('a pmf carried on explicit positions takes its mean and its slot from them', () => {
        const v = view('disc', 'uniform'), s = { ...v, xs: v.p.map((_, i) => 2 * (i + 1)) };
        near(meanOf(s), 9, 1e-12); near(boxOf(s).w, 16, 1e-9); near(boxOf(s).ht, 1 / 8, 1e-12);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/prob/width.test.js 2>&1 | grep -E "^# (pass|fail)|Error" | head -5`
Expected: FAIL — `Cannot find module '.../width.js'`.

- [ ] **Step 3: Write the module**

```js
// src/lib/prob/width.js
// ================================================================
//  Probability figures — width.js
//  Entropy as a size. 2^H is the effective number of outcomes of a
//  pmf and 2^h the effective width of a density: the uniform with the
//  same entropy has that many outcomes, or that length. Pure: no DOM.
// ================================================================

import { log2, runningIntegral, shapeMoments } from './dist.js';

// H(X) for a pmf, h(X) for a density, in bits. The density's is the total of the area
// figure's integrand −log p_X over u, by the same trapezoid sum along the samples, so
// every figure quotes the same number.
export function entropyOf(v) {
    if (v.disc) return v.p.reduce((t, q) => t - (q > 0 ? q * log2(q) : 0), 0);
    return runningIntegral(v.S.Fs, v.S.fs.map(f => -log2(f))).at(-1);
}

// The atoms' positions: 1..n, or the ones the view carries.
export const positionsOf = v => v.xs ?? v.p.map((_, i) => i + 1);

// The mean of X.
export function meanOf(v) {
    if (!v.disc) return shapeMoments(v.shape).mean;
    const xs = positionsOf(v);
    return v.p.reduce((t, q, i) => t + q * xs[i], 0);
}

// The uniform with the same entropy, as a box of area 1 centred on the mean: { H, cx, w, ht }.
// A pmf's box is 2^H atom slots wide (a slot is the atoms' spacing) and 2^-H high; a
// density's is 2^h long and 2^-h high.
export function boxOf(v) {
    const H = entropyOf(v), cx = meanOf(v);
    if (!v.disc) return { H, cx, w: 2 ** H, ht: 2 ** -H };
    const xs = positionsOf(v), slot = xs.length > 1 ? xs[1] - xs[0] : 1;
    return { H, cx, w: 2 ** H * slot, ht: 2 ** -H };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/prob/width.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Run the whole suite, then commit**

Run: `make test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `ℹ pass 413`, `ℹ fail 0`.

```bash
git add src/lib/prob/width.js src/lib/prob/width.test.js
git commit -m "prob: entropy as a size — 2^H outcomes, 2^h wide, and the uniform with the same entropy as a box

Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd"
```

---

### Task 2: `quantize.js` — X in bins of width Δ

**Files:**
- Create: `src/lib/prob/quantize.js`
- Test: `src/lib/prob/quantize.test.js`

**Interfaces:**
- Consumes: `gMass(a, b, m, s)`, `shannonH(p)`, `stepsDist(ts, ms).mass(a, b)` from `./dist.js`; `view`, `near` from `./width.test.js`; `entropyOf` from `./width.js`.
- Produces: `binMasses(v, D, origin?) → { edges, masses }` (edges.length = masses.length + 1); `quantizedH(v, D, origin?) → number`; `quantizeCurve(v, ts) → number[]` (H at Δ = 2^-t for each t).

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/prob/quantize.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shannonH, temper } from './dist.js';
import { createModel } from './model.js';
import { entropyOf } from './width.js';
import { view, near } from './width.test.js';
import { binMasses, quantizedH, quantizeCurve } from './quantize.js';

describe('X quantized to bins of width Δ', () => {
    it('a pmf is flat at H(X) for every Δ below 1, and 0 once one bin holds everything', () => {
        const v = view('disc', 'zipf'), H = shannonH(v.p);
        for (const D of [1, 0.5, 1 / 16]) near(quantizedH(v, D), H, 1e-12, `Δ = ${D}`);
        near(quantizedH(v, 16), 0, 1e-12);
    });
    it("a pmf's bins start at 0.5: Δ = 1 puts each atom alone in its own bin", () => {
        const { edges, masses } = binMasses(view('disc', 'zipf'), 1);
        assert.deepEqual(edges, [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5]);
        assert.equal(masses.length, 8);
    });
    it('a tempered view quantizes its tempered pmf, not the base', () => {
        const m = createModel(); m.setPreset('zipf'); m.setBeta(0);
        const v = m.view(); // uniform on the support; base = zipf
        assert.ok(v.base);
        near(quantizedH(v, 1), 3, 1e-12); // 8 equal atoms
        near(quantizedH(v, 1), shannonH(temper(m.p, 0)), 1e-12);
        assert.ok(Math.abs(quantizedH(v, 1) - shannonH(v.base)) > 0.1);
    });
    it('for the Gaussian preset, H(X_Δ) + log Δ is within 0.05 of h at Δ = 2⁻⁸, and halving Δ adds a bit', () => {
        const v = view('cont', 'gauss'), h = entropyOf(v);
        near(quantizedH(v, 2 ** -8) - 8, h, 0.05);
        near(quantizedH(v, 2 ** -9) - quantizedH(v, 2 ** -8), 1, 0.02);
    });
    it('the uniform density of width 0.7 cut into 4 bins from its left edge has 2 bits', () => {
        near(quantizedH(view('cont', 'uniform'), 0.7 / 4, -0.35), 2, 1e-6);
    });
    it('the curve is H(X_Δ) at Δ = 2^-t, and the bin masses sum to 1', () => {
        const v = view('cont', 'bimodal');
        near(binMasses(v, 0.25).masses.reduce((a, b) => a + b, 0), 1, 1e-6);
        assert.deepEqual(quantizeCurve(v, [0, 2]), [quantizedH(v, 1), quantizedH(v, 0.25)]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/prob/quantize.test.js 2>&1 | grep -E "^# (pass|fail)|Error" | head -5`
Expected: FAIL — `Cannot find module '.../quantize.js'`.

- [ ] **Step 3: Write the module**

```js
// src/lib/prob/quantize.js
// ================================================================
//  Probability figures — quantize.js
//  X quantized to bins of width Δ: the bin masses and the Shannon
//  entropy H(X_Δ). A density's bin grid starts at 0; a pmf's at 0.5,
//  so Δ = 1 is one atom per bin and every Δ < 1 isolates every atom.
//  Pure: no DOM.
// ================================================================

import { gMass, shannonH, stepsDist } from './dist.js';

// The interval to cover: the atoms, a steps shape's ends, or ±9σ of each Gaussian component.
function extent(v) {
    if (v.disc) return [1, v.p.length];
    const s = v.shape;
    if (s.kind === 'steps') return [s.ts[0], s.ts[s.ts.length - 1]];
    return [Math.min(...s.comps.map(c => c.m - 9 * c.s)), Math.max(...s.comps.map(c => c.m + 9 * c.s))];
}

// P(a ≤ X ≤ b) for a density.
function massFn(s) {
    if (s.kind === 'steps') return stepsDist(s.ts, s.ms).mass;
    return (a, b) => s.comps.reduce((t, c) => t + c.w * gMass(a, b, c.m, c.s), 0);
}

// Bins of width D on the grid origin + kD, over the support: { edges, masses }.
export function binMasses(v, D, origin = v.disc ? 0.5 : 0) {
    const [lo, hi] = extent(v);
    const bin = x => Math.floor((x - origin) / D + 1e-9);
    const k0 = bin(lo), k1 = bin(hi);
    const masses = new Array(k1 - k0 + 1).fill(0);
    if (v.disc) v.p.forEach((q, i) => { masses[bin(i + 1) - k0] += q; });
    else {
        const mass = massFn(v.shape);
        for (let k = k0; k <= k1; k++) masses[k - k0] = mass(origin + k * D, origin + (k + 1) * D);
    }
    const edges = masses.map((_, j) => origin + (k0 + j) * D);
    edges.push(origin + (k1 + 1) * D);
    return { edges, masses };
}

// H(X_Δ) in bits.
export function quantizedH(v, D, origin) {
    return shannonH(binMasses(v, D, origin).masses);
}

// H(X_Δ) at Δ = 2^-t, for each t.
export function quantizeCurve(v, ts) {
    return ts.map(t => quantizedH(v, 2 ** -t));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/prob/quantize.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Run the whole suite, then commit**

Run: `make test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `ℹ pass 419`, `ℹ fail 0`.

```bash
git add src/lib/prob/quantize.js src/lib/prob/quantize.test.js
git commit -m "prob: X in bins of width Δ — masses and H(X_Δ), a pmf's grid anchored at 0.5

Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd"
```

---

### Task 3: `stretch.js` — Y = aX, and relabeling

**Files:**
- Create: `src/lib/prob/stretch.js`
- Test: `src/lib/prob/stretch.test.js`

**Interfaces:**
- Consumes: `cdfOf(p)`, `sampleShape(shape)` from `./dist.js`; `entropyOf`, `view`, `near` as above.
- Produces: `stretchShape(shape, a) → shape`; `stretchView(v, a, perm = null) → view` (a discrete result carries `xs`; a continuous one carries `shape`, `S`, `win`, `xRange`); `randomPerm(n, rng = Math.random) → number[]` (p[i] moves to slot perm[i]).

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/prob/stretch.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { entropyOf } from './width.js';
import { view, near } from './width.test.js';
import { stretchView, randomPerm } from './stretch.js';

// a small deterministic generator, so the permutation tests are repeatable
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

describe('Y = aX', () => {
    it('randomPerm is a permutation of 0..n-1', () => {
        assert.deepEqual([...randomPerm(8, lcg(1))].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
    });
    it('a permutation of the atoms leaves H unchanged and moves the probabilities', () => {
        const v = view('disc', 'zipf'), perm = randomPerm(8, lcg(7)), s = stretchView(v, 1, perm);
        near(entropyOf(s), entropyOf(v), 1e-12);
        assert.deepEqual([...s.p].sort(), [...v.p].sort());
        perm.forEach((j, i) => assert.equal(s.p[j], v.p[i]));
        assert.deepEqual(s.xs, [1, 2, 3, 4, 5, 6, 7, 8]);
    });
    it('a permutation carries an atom without mass to its new slot', () => {
        const v = view('disc', 'onehot'), s = stretchView(v, 1, [7, 6, 5, 4, 3, 2, 1, 0]);
        assert.deepEqual(s.p, [0, 0, 0, 0, 1, 0, 0, 0]);
        near(entropyOf(s), 0, 1e-12);
    });
    it('stretching atoms by a moves them to a·k and keeps every probability', () => {
        const v = view('disc', 'zipf'), s = stretchView(v, 2);
        assert.deepEqual(s.p, v.p);
        assert.deepEqual(s.xs, [2, 4, 6, 8, 10, 12, 14, 16]);
        assert.deepEqual(s.xRange, [1, 17]);
        near(entropyOf(s), entropyOf(v), 1e-12);
    });
    it('stretching a density by a adds log a to h', () => {
        const v = view('cont', 'gauss'), h = entropyOf(v);
        for (const a of [1 / 8, 1 / 4, 3]) near(entropyOf(stretchView(v, a)) - h, Math.log2(a), 0.02, `a = ${a}`);
    });
    it('a = 1 with no permutation is the same distribution', () => {
        const v = view('cont', 'bimodal'), s = stretchView(v, 1);
        near(entropyOf(s), entropyOf(v), 1e-9);
        assert.deepEqual(s.xRange, v.xRange);
        near(s.win.y1, v.win.y1, 1e-12);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/prob/stretch.test.js 2>&1 | grep -E "^# (pass|fail)|Error" | head -5`
Expected: FAIL — `Cannot find module '.../stretch.js'`.

- [ ] **Step 3: Write the module**

```js
// src/lib/prob/stretch.js
// ================================================================
//  Probability figures — stretch.js
//  Y = aX as a view: a pmf keeps its probabilities and moves its atoms
//  to a·k (relabeled by a permutation if given); a density stretches
//  to p_X(y/a)/a. a > 0. Pure: no DOM.
// ================================================================

import { cdfOf, sampleShape } from './dist.js';

// The shape of aX.
export function stretchShape(s, a) {
    if (s.kind === 'steps') return { kind: 'steps', ts: s.ts.map(t => a * t), ms: s.ms.slice() };
    return { kind: 'mix', comps: s.comps.map(c => ({ w: c.w, m: a * c.m, s: a * c.s })) };
}

// The view of Y = aX, the atoms relabeled by perm (p[i] moves to slot perm[i]) if given.
export function stretchView(v, a, perm = null) {
    if (v.disc) {
        const p = v.p.slice();
        if (perm) perm.forEach((j, i) => { p[j] = v.p[i]; });
        const n = p.length;
        return { disc: true, p, F: cdfOf(p), n, xs: p.map((_, i) => a * (i + 1)), xRange: [a * 0.5, a * (n + 0.5)] };
    }
    const shape = stretchShape(v.shape, a), S = sampleShape(shape);
    const win = { x0: a * v.win.x0, x1: a * v.win.x1, y1: v.win.y1 / a };
    return { disc: false, shape, S, win, xRange: [win.x0, win.x1] };
}

// A uniformly random permutation of 0..n-1 (Fisher–Yates).
export function randomPerm(n, rng = Math.random) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    return p;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/prob/stretch.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Run the whole suite, then commit**

Run: `make test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `ℹ pass 425`, `ℹ fail 0`.

```bash
git add src/lib/prob/stretch.js src/lib/prob/stretch.test.js
git commit -m "prob: Y = aX as a view — atoms relabeled or spread, a density stretched

Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd"
```

---

### Task 4: the transform figure's width mode, wired into the post as §1

**Files:**
- Modify: `src/lib/prob/fig-transform.js` (signature, viewBox height, the one `math.end()`, the width block)
- Modify: `assets/css/expectation.css` (new SVG classes, after the `.grip` rules)
- Modify: `assets/css/differential-entropy.css` (the `.de-row` control row, at the end)
- Modify: `src/differential-entropy/main.js`, `src/differential-entropy/controls.js`
- Modify: `content/posts/2026-10-05-differential-entropy.md` (new §1 inserted after the opening caption, before `# Where $h$ comes from`)

**Interfaces:**
- Consumes: `boxOf` from `../lib/prob/width.js` (Task 1); `discQuantile`, `clamp` from `./dist.js` (already imported); `texNum` from `./mathlabels.js`.
- Produces: `createTransformFigure(svg, ctx, { width = false } = {})`; element ids `de-width` (svg). The `.de-row` class for per-figure control rows, used by Tasks 5 and 6.

- [ ] **Step 1: The figure takes an option and grows a readout line when it is on**

In `src/lib/prob/fig-transform.js`:

Change the imports to

```js
import { clamp, discCdfAt, discQuantile, atX, atU, lerp } from './dist.js';
import { Region, el, svgContext, svgPoint } from './region.js';
import { createEditor, regionAdapter } from './edit.js';
import { densityAt } from './frame.js';
import { createMathLayer, texNum } from './mathlabels.js';
import { fitWidth } from './fit.js';
import { boxOf } from './width.js';
```

After `const TW = 1000, TH = 566, N_LINES = 40;` add

```js
const READOUT = 56; // a line of math under the panels, in width mode
// a readout value: magenta when negative
const val = x => { const t = texNum(x); return t.startsWith('-') ? `\\class{ex-neg}{${t}}` : t; };
```

Change the signature and the first lines to

```js
export function createTransformFigure(svg, { model, pos, ui, redraw, stopPlay }, { width = false } = {}) {
    const H = width ? TH + READOUT : TH;
    const ctx = svgContext(svg, TW, H);
```

and replace every other `TH` in the function with `H`: `createMathLayer(svg.parentElement, TW, H)`, the viewBox in `layout()` (`\`0 0 ${W} ${H}\``), and `math.resize(W, H)`. Also record the layout width: in `layout(W)` add `layoutW = W;` and declare `let layoutW = TW;` next to `let drawn = false;`.

Update the header comment: add the lines

```js
//  With width: true the figure also shows entropy as a size: the run
//  of the tread (pmf) or the slope (density) at the cursor on the graph
//  of F_X⁻¹, the uniform with the same entropy as a dashed box in the
//  p_X panel, and a readout of H or h and 2^H or 2^h.
```

- [ ] **Step 2: One `math.end()` at the end of `draw()`**

In `draw()`, delete the line `math.end();` that follows `xLabel('x-x', O.X, 'p_X(x)');`. Add `math.end();` as the last line of `draw()`, after `editor.draw(handles);`. (Labels set after an `end()` would be hidden by the next draw; with one `end()` at the end, every label set during a draw stays.)

- [ ] **Step 3: The width block**

In `draw()`, immediately before the new final `editor.draw(handles); math.end();`, add:

```js
        // ---- width mode: the run or slope at u, the box of area 1, and the readout ----
        if (width) {
            const b = boxOf(v);
            // the uniform with the same entropy, in the p_X panel (density across, x up)
            O.X.rect(0, b.cx - b.w / 2, b.ht, b.cx + b.w / 2, 'eqbox');
            const bx = O.X.X(Math.min(b.ht, pmax)), by = O.X.Y(b.cx + b.w / 2);
            const fits = bx < O.X.pr - 90;
            math.set('eq', fits ? bx + 6 : bx - 6, Math.max(by, O.X.pt + 10),
                `2^{${disc ? 'H' : 'h'}} = ${texNum(disc ? b.w : b.w, 2)}`, { anchor: fits ? 'start' : 'end', cls: 'ex-ml-note' });
            if (u > 0) {
                if (disc) {
                    // the tread holding u: its run is p_X at that atom
                    const k = discQuantile(v.F, u);
                    if (k >= 1 && v.p[k - 1] > 0) {
                        polyline(over, [onG(v.F[k - 1], k), onG(v.F[k], k)], 'tread');
                        const [mx, my] = onG((v.F[k - 1] + v.F[k]) / 2, k);
                        math.set('local', mx, my - 16, `\\text{run} = p_X(${k}) = ${texNum(v.p[k - 1])}`, { cls: 'ex-ml-note' });
                    }
                } else {
                    // the tangent at u: its slope is 1 / p_X there
                    const q = quant(u), slope = 1 / q.p, du = 0.06;
                    const seg = [[u - du, q.x - du * slope], [u + du, q.x + du * slope]].map(([uu, xx]) => onG(uu, xx));
                    el('path', { d: 'M' + seg.map(c => c.join(' ')).join('L'), class: 'tangent', 'clip-path': `url(#${O.G.id})` }, over);
                    const [mx, my] = onG(u, q.x);
                    math.set('local', mx + 14, my - 18, `\\text{slope} = 1/p_X(x) = ${texNum(slope, 2)}`, { anchor: 'start', cls: 'ex-ml-note' });
                }
            }
            const name = disc ? 'H' : 'h';
            math.set('readout', layoutW / 2, TH + 30,
                `${name}(X) = ${val(b.H)}\\text{ bits}, \\qquad 2^{${name}(X)} = ${texNum(b.w, 2)}\\ \\text{${disc ? 'effective outcomes' : 'effective width'}}`,
                { cls: 'ex-ml-formula' });
        }
```

`pmax`, `disc`, `u`, `onG`, `quant`, `over` and `polyline` are already in scope in `draw()`.

- [ ] **Step 4: CSS for the new marks**

Append to `assets/css/expectation.css` (these marks belong to shared figures):

```css
/* ---- entropy as a size (the transform figure's width mode, and the entropy post's figures) ---- */
svg.ex-plot .eqbox { fill: none; stroke: var(--ex-ink); stroke-width: 1.3; stroke-dasharray: 6 4; }
svg.ex-plot .tread, svg.ex-plot .tangent { fill: none; stroke: var(--ex-now); stroke-width: 5; stroke-linecap: round; opacity: .85; }
svg.ex-plot .bin { fill: var(--ex-now-soft); stroke: var(--ex-now); stroke-width: 1; }
svg.ex-plot .qcurve { fill: none; stroke: var(--ex-now); stroke-width: 2.6; stroke-linejoin: round; }
svg.ex-plot .asym { fill: none; stroke: var(--ex-mass); stroke-width: 1.6; stroke-dasharray: 7 5; }
svg.ex-plot .negzone { fill: var(--ex-neg-soft); opacity: .45; }
```

Append to `assets/css/differential-entropy.css`:

```css
/* ---- a figure's own control row: not sticky, same controls as the bar ---- */
.de-row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.2rem; margin: .9rem 0 0; font-family: var(--ex-sans); font-size: .82rem; line-height: 1.3; color: var(--ex-ink); }
.de-row button { font: inherit; color: var(--ex-ink); background: #fff; border: 1px solid var(--ex-rule); border-radius: 4px; height: 1.75rem; padding: 0 .5rem; cursor: pointer; white-space: nowrap; }
.de-row input[type=range] { width: 8rem; margin: 0; accent-color: var(--ex-mass); }
```

- [ ] **Step 5: Mount it in `main.js`, and move u after a case switch**

Replace `src/differential-entropy/main.js` with:

```js
// ================================================================
//  Differential entropy — main.js
//  One model and one position for the whole post. The opening figure
//  is the expectation post's area figure with g fixed to −log p_X and
//  no sweep (always the whole area, u = 1). The properties sections
//  draw the same p_X: the transform figure in width mode on the real
//  position, then the quantize and stretch figures with controls of
//  their own. The MI figure keeps its own distribution. Each figure
//  binds to its element and is skipped if the element is absent.
// ================================================================

import { createModel } from '../lib/prob/model.js';
import { createPosition } from '../lib/prob/position.js';
import { computeFrame } from '../lib/prob/frame.js';
import { createAreaFigure } from '../lib/prob/fig-area.js';
import { createTransformFigure } from '../lib/prob/fig-transform.js';
import { bindControls } from './controls.js';
import { initMI } from './fig-mi.js';

// Where the pinned figure stands: the whole area, and x past every outcome.
const WHOLE = { x: Infinity, u: 1 };
const $ = id => document.getElementById(id);

export function init() {
    const areaSvg = $('de-area'), widthSvg = $('de-width');
    if (areaSvg || widthSvg) {
        const model = createModel(), pos = createPosition(model);
        const ui = { g: 'neglog', gBase: 'neglog', gc: null, ghost: true }; // g is fixed: entropy is E[−log p_X]
        let controls = null, area = null, width = null;
        function redraw() {
            area?.draw(computeFrame(model, WHOLE, ui.g));
            width?.draw();
            controls?.update();
        }
        const ctx = { model, pos, ui, redraw, customG: () => {}, stopPlay: () => {} };
        controls = bindControls(ctx);
        if (areaSvg) area = createAreaFigure(areaSvg, ctx, { sweep: false, notes: 'entropy' });
        if (widthSvg) width = createTransformFigure(widthSvg, ctx, { width: true });
        model.subscribe(() => { pos.refresh(); redraw(); });
        redraw();
    }
    initMI();
}
```

(`initQuantize` and `initStretch` are no longer called; their files are replaced in Tasks 5 and 6. Until then the old figures simply do not run.)

In `src/differential-entropy/controls.js`, pass the hook so the cursor lands mid-way after a case switch, as the expectation post does:

```js
    const common = bindCommonControls({ model, pos, redraw }, { afterCase: () => pos.setU(0.6) });
```

- [ ] **Step 6: The section in the post**

In `content/posts/2026-10-05-differential-entropy.md`, insert after the opening figure's caption block (the `::: {.de-caption}` … `:::` that begins "Drag $p_X$ to reshape it") and before `# Where $h$ comes from: quantize, then subtract`:

````markdown
# $h$ is a width

Read the integrand off the graph of $F_X^{-1}$. For a pmf the graph is a staircase, and $p_X(F_X^{-1}(u))$ is the run of the tread under $u$. For a density it is $1/(F_X^{-1})'(u)$, the reciprocal of the slope. So

$$ H(X) = \int_0^1 \log\frac{1}{\operatorname{run}(u)}\,\dee u, \qquad h(X) = \int_0^1 \log (F_X^{-1})'(u)\,\dee u, $$

and $2^{H(X)}$ is the geometric mean of $1/\operatorname{run}$, an **effective number of outcomes**, while $2^{h(X)}$ is the geometric mean of the slope, an **effective width**.^[The perplexity, in the discrete case. A uniform on $n$ outcomes has exactly $n$; a uniform on $[0, L]$ has exactly $L$.] Each is the uniform with the same entropy: on $2^H$ outcomes, or on an interval of length $2^h$. A count is at least 1, so $H \ge 0$; a width can be less than 1, so $h$ can be negative. A count is at most $n$, so $H \le \log n$; a width is at most the support, so $h \le \log L$.^[With the variance fixed instead of the support, the Gaussian is widest: $h \le \tfrac12\log(2\pi e\sigma^2)$ [@cover.t:2006book2, ch. 8].]

::: {.wide .extra-wide .ex-wrap}
```{=html}
<div class="de-row"><div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div></div>
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-width" role="img" aria-label="Evenly spaced u carried through the quantile function to x, with the run or slope at the cursor, and the uniform with the same entropy drawn as a box over p_X"></svg></div></figure>
```
:::

::: {.de-caption}
Drag $u$ to read the run or the slope, and $p_X$ to reshape it. The dashed box is the uniform with the same entropy: $2^H$ slots or $2^h$ long, and 1 over that high. The uniform presets make it coincide with $p_X$.
:::

````

- [ ] **Step 7: Build and check**

Run: `make test 2>&1 | grep -E "^ℹ (pass|fail)"; make -j4 >/dev/null 2>&1 && echo built; grep -c 'id="de-width"' _site/posts/differential-entropy/index.html`
Expected: `ℹ pass 425`, `ℹ fail 0`, `built`, `1`.

Browser (if the Chrome extension is connected; otherwise note it for the final check): serve `_site` on a port, open `/posts/differential-entropy/`, scroll to "h is a width". Expect: the figure draws; dragging the uniform or graph moves u and the highlighted tread or tangent; the dashed box sits in the p_X panel; the readout under the panels shows H and 2^H; switching the case toggle under the figure flips every figure (opening included); the uniform presets make the box coincide with p_X.

- [ ] **Step 8: Commit**

```bash
git add src/lib/prob/fig-transform.js assets/css/expectation.css assets/css/differential-entropy.css src/differential-entropy/main.js src/differential-entropy/controls.js content/posts/2026-10-05-differential-entropy.md
git commit -m "differential-entropy: h is a width — the transform figure's width mode: run or slope at u, the box of area 1, and 2^H or 2^h

Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd"
```

---

### Task 5: the quantize figure on the shared model

**Files:**
- Create: `src/lib/prob/panel-px.js`
- Create: `src/differential-entropy/fig-quantize.js` (replaces the old file's contents entirely)
- Delete: `src/differential-entropy/density-edit.js`, `src/differential-entropy/shape-controls.js`
- Modify: `src/differential-entropy/main.js`
- Modify: `content/posts/2026-10-05-differential-entropy.md` (§2's figure markup)
- Test: `src/differential-entropy/fig-quantize.test.js` (the `deltaLabel` helper)

**Interfaces:**
- Consumes: `binMasses`, `quantizedH`, `quantizeCurve` (Task 2); `entropyOf`, `positionsOf` (Task 1); `Region`, `el`, `svgContext`, `svgPoint` from `../lib/prob/region.js`; `createMathLayer`, `texNum` from `../lib/prob/mathlabels.js`; `fitWidth` from `../lib/prob/fit.js`; `createEditor`, `regionAdapter` from `../lib/prob/edit.js`.
- Produces: `windowPX(v) → { x0, x1, y1 }`, `drawPX(R, v, { faint = false })` in `panel-px.js`; `createQuantizeFigure(svg, { model }, { slider, label }) → { draw }` and `deltaLabel(t) → string` in `fig-quantize.js`; element ids `de-quantize` (svg), `de-q-delta` (range), `de-q-deltav` (label).

- [ ] **Step 1: Write the failing test for the Δ label**

```js
// src/differential-entropy/fig-quantize.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deltaLabel } from './fig-quantize.js';

describe('the Δ slider label', () => {
    it('is a fraction 1/2^k for a positive integer t, an integer for t ≤ 0, else 3 figures', () => {
        assert.equal(deltaLabel(2), '1/4');
        assert.equal(deltaLabel(0), '1');
        assert.equal(deltaLabel(-3), '8');
        assert.equal(deltaLabel(0.5), '0.707');
        assert.equal(deltaLabel(11.5), '3.45e-4');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test src/differential-entropy/fig-quantize.test.js 2>&1 | grep -E "^# (pass|fail)|Error|not a function" | head -3`
Expected: FAIL — the old file has no export `deltaLabel` (`SyntaxError: ... does not provide an export named 'deltaLabel'`).

- [ ] **Step 3: The p_X panel helper**

```js
// src/lib/prob/panel-px.js
// ================================================================
//  Probability figures — panel-px.js
//  p_X in an upright region (x across, probability or density up),
//  for figures that show the distribution without the area figure's
//  sweep: stems and pins for a pmf (at 1..n, or at the positions the
//  view carries), the filled curve for a density. `faint` draws it as
//  a ghost, the way the area figure draws what is not yet integrated.
// ================================================================

import { el } from './region.js';
import { positionsOf } from './width.js';

// The window a view wants: a pmf on its atoms (a little past the end ones), a density on
// the model's window.
export function windowPX(v) {
    if (!v.disc) return { x0: v.xRange[0], x1: v.xRange[1], y1: v.win.y1 };
    const xs = positionsOf(v), gap = xs.length > 1 ? xs[1] - xs[0] : 1;
    return { x0: xs[0] - 0.6 * gap, x1: xs[xs.length - 1] + 0.6 * gap, y1: 1.05 };
}

// Draw p_X into R, whose domain is set.
export function drawPX(R, v, { faint = false } = {}) {
    if (v.disc) {
        const xs = positionsOf(v), c = faint ? 'todo' : 'done';
        // the pmf being edited, when the view shows it tempered
        if (!faint && v.base) v.base.forEach((q, i) => {
            if (q <= 0) return;
            el('line', { x1: R.X(xs[i]), x2: R.X(xs[i]), y1: R.Y(0), y2: R.Y(q), class: 'stem-base' }, R.data);
            el('circle', { cx: R.X(xs[i]), cy: R.Y(q), r: 4.5, class: 'pin-base' }, R.data);
        });
        v.p.forEach((q, i) => {
            const x = R.X(xs[i]);
            if (q <= 0) { if (!faint) el('circle', { cx: x, cy: R.Y(0), r: 4, class: 'pin-null' }, R.data); return; }
            el('line', { x1: x, x2: x, y1: R.Y(0), y2: R.Y(q), class: 'stem-' + c }, R.data);
            el('circle', { cx: x, cy: R.Y(q), r: 4.5, class: 'pin-' + c }, R.data);
        });
        return;
    }
    const s = v.shape, pts = v.S.xs.map((x, i) => [x, v.S.fs[i]]);
    const edges = s.kind === 'steps' ? [[s.ts[0], 0], ...pts, [s.ts[s.ts.length - 1], 0]] : pts;
    if (faint) { R.area(edges, 'fm').setAttribute('opacity', '.35'); R.path(edges, 'curve later'); }
    else { R.area(edges, 'fm'); R.path(edges, 'curve'); }
}
```

- [ ] **Step 4: The figure**

Replace the whole of `src/differential-entropy/fig-quantize.js` with:

```js
// ================================================================
//  Differential entropy — fig-quantize.js
//  Quantize, then subtract. Left: H(X_Δ) against log(1/Δ), the region
//  below zero shaded; a density's curve climbs the dashed asymptote
//  h + log(1/Δ), a pmf's is flat at H once Δ < 1. Right: the shared
//  p_X (editable) with the histogram at the current Δ in the panel's
//  own units: bin mass for a pmf, mass/Δ for a density. The Δ slider
//  is this figure's own; p_X is the page's.
// ================================================================

import { Region, el, svgContext, svgPoint } from '../lib/prob/region.js';
import { createMathLayer, texNum } from '../lib/prob/mathlabels.js';
import { fitWidth } from '../lib/prob/fit.js';
import { createEditor, regionAdapter } from '../lib/prob/edit.js';
import { windowPX, drawPX } from '../lib/prob/panel-px.js';
import { binMasses, quantizedH, quantizeCurve } from '../lib/prob/quantize.js';
import { entropyOf, positionsOf } from '../lib/prob/width.js';

const W0 = 1000, HP = 400, H0 = HP + 56; // the panels, then a line of readouts
const T_MIN = -3, T_MAX = 12, T_STEP = 0.25; // t = log(1/Δ): Δ from 8 down to 2^-12
const TS = Array.from({ length: Math.round((T_MAX - T_MIN) / T_STEP) + 1 }, (_, i) => T_MIN + i * T_STEP);

// Δ = 2^-t as "1/2^k" for a positive integer k, an integer for t ≤ 0, else ≤ 3 significant figures.
export function deltaLabel(t) {
    if (Math.abs(t - Math.round(t)) < 1e-9) { const k = Math.round(t); return k > 0 ? '1/' + 2 ** k : String(2 ** -k); }
    const D = 2 ** -t;
    return D < 0.01 ? D.toExponential(2) : String(+D.toPrecision(3));
}
const val = x => { const t = texNum(x); return t.startsWith('-') ? `\\class{ex-neg}{${t}}` : t; };

export function createQuantizeFigure(svg, { model }, { slider, label }) {
    const ctx = svgContext(svg, W0, H0);
    const RC = new Region(ctx, { ox: 0, oy: 0, w: 560, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const RP = new Region(ctx, { ox: 584, oy: 0, w: 416, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const handles = el('g', null, ctx.root);
    const math = createMathLayer(svg.parentElement, W0, H0);
    const editor = createEditor({ model, adapter: regionAdapter(RP, false) });
    let layoutW = W0, drawn = false;
    function layout(W) {
        const wl = Math.round(0.56 * W), gap = Math.round(0.024 * W);
        RC.o.w = wl; Object.assign(RP.o, { ox: wl + gap, w: W - wl - gap });
        layoutW = W;
        svg.setAttribute('viewBox', `0 0 ${W} ${H0}`); math.resize(W, H0);
        if (drawn) draw();
    }
    // the curve over the whole range depends only on the distribution
    let cacheKey = null, curve = null;
    function curveFor(v) {
        const key = v.disc ? v.p.join(',') : v.S;
        if (key !== cacheKey) { cacheKey = key; curve = quantizeCurve(v, TS); }
        return curve;
    }
    const yLabel = (key, R, tex) => { const [x, y] = R.ylabelAt(); math.set(key, x, y, tex, { rotate: -90 }); };
    const xLabel = (key, R, tex) => { const [x, y] = R.xlabelAt(); math.set(key, x, y, tex); };

    function draw() {
        drawn = true;
        const v = model.view(), t = +slider.value, D = 2 ** -t, Hq = quantizedH(v, D), H = entropyOf(v);
        if (label) label.textContent = deltaLabel(t);
        math.begin();
        // ---- left: H(X_Δ) against log(1/Δ) ----
        const ys = curveFor(v), top = Math.max(1, ...ys) * 1.08;
        RC.domain(T_MIN, T_MAX, -1.5, top);
        RC.rect(T_MIN, -1.5, T_MAX, 0, 'negzone');
        RC.axes({ xticks: [-2, 0, 2, 4, 6, 8, 10, 12] });
        yLabel('c-y', RC, 'H(X_\\Delta)\\ \\text{(bits)}'); xLabel('c-x', RC, '\\log(1/\\Delta)');
        if (v.disc) RC.hline(H, 'asym'); else RC.path([[T_MIN, H + T_MIN], [T_MAX, H + T_MAX]], 'asym');
        RC.path(TS.map((tt, i) => [tt, ys[i]]), 'qcurve');
        el('circle', { cx: RC.X(t), cy: RC.Y(Hq), r: 5, class: 'dot' }, RC.front);
        // ---- right: p_X with the histogram at Δ, in the panel's own units ----
        const w = windowPX(v);
        RP.domain(w.x0, w.x1, 0, w.y1);
        RP.axes(v.disc ? { xticks: positionsOf(v), yticks: [0, .5, 1] } : {});
        yLabel('p-y', RP, 'p_X(x)'); xLabel('p-x', RP, 'x');
        const { edges, masses } = binMasses(v, D), pts = [];
        masses.forEach((m, j) => {
            if (edges[j + 1] < w.x0 || edges[j] > w.x1) return;
            const h = v.disc ? m : m / D;
            pts.push([edges[j], h], [edges[j + 1], h]);
        });
        if (pts.length) RP.area(pts, 'bin'); // one path, however many bins
        drawPX(RP, v);
        handles.replaceChildren(); editor.draw(handles);
        // ---- readouts ----
        math.set('readout', layoutW / 2, HP + 30,
            `H(X_\\Delta) = ${val(Hq)}\\text{ bits}, \\quad \\log(1/\\Delta) = ${texNum(t, 2)}, \\quad H(X_\\Delta) - \\log(1/\\Delta) = ${val(Hq - t)}, \\quad ${v.disc ? 'H' : 'h'}(X) = ${val(H)}`,
            { cls: 'ex-ml-formula' });
        math.end();
    }

    // ---- editing p_X in the right panel (the model notifies, and the page redraws) ----
    let editing = false;
    svg.addEventListener('pointerdown', e => {
        const p = svgPoint(svg, e), h = editor.hit(p);
        if (!h) return;
        editing = true; svg.setPointerCapture(e.pointerId); e.preventDefault();
        editor.begin(h, p);
    });
    svg.addEventListener('pointermove', e => {
        const p = svgPoint(svg, e);
        if (editing) { editor.move(p); return; }
        svg.style.cursor = editor.cursorFor(editor.hit(p));
    });
    const end = () => { if (editing) { editing = false; editor.end(); } };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    slider.addEventListener('input', draw);
    fitWidth(svg.parentElement, layout);
    return { draw };
}
```

- [ ] **Step 5: Run the label test**

Run: `node --test src/differential-entropy/fig-quantize.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 6: Delete the old editor and shape controls, mount the figure**

```bash
git rm -q src/differential-entropy/density-edit.js src/differential-entropy/shape-controls.js
grep -rn "density-edit\|shape-controls" src || echo "no references"
```
Expected: `no references`.

In `src/differential-entropy/main.js`: add `import { createQuantizeFigure } from './fig-quantize.js';` after the `bindControls` import; add `quantSvg = $('de-quantize')` to the element lookups (`const areaSvg = $('de-area'), widthSvg = $('de-width'), quantSvg = $('de-quantize');` and the guard `if (areaSvg || widthSvg || quantSvg)`); declare `quant = null` alongside `area` and `width`; add `quant?.draw();` to `redraw()` after `width?.draw();`; and after the width mount add

```js
        if (quantSvg) quant = createQuantizeFigure(quantSvg, ctx, { slider: $('de-q-delta'), label: $('de-q-deltav') });
```

- [ ] **Step 7: The figure's markup in the post**

In `content/posts/2026-10-05-differential-entropy.md`, in `# Where $h$ comes from: quantize, then subtract`, replace the whole `::: {.wide .extra-wide}` … `:::` block holding `<div class="de-fig">` with ids `de-c-fam`, `de-c-sd`, `de-c-d`, `de-c-curve`, `de-c-pdf`, `de-c-H`, `de-c-L`, `de-c-diff`, `de-c-h` (and nothing else) with:

````markdown
::: {.wide .extra-wide .ex-wrap}
```{=html}
<div class="de-row">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="de-q-delta">bin width \(\Delta\) = <b id="de-q-deltav">1/4</b></label><input type="range" id="de-q-delta" min="-3" max="12" step="0.25" value="2"></div>
</div>
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-quantize" role="img" aria-label="Entropy of the quantized variable against log of one over delta, beside p_X with the histogram at bin width delta"></svg></div></figure>
```
:::
````

Leave the section's prose and caption for Task 8.

- [ ] **Step 8: Build, test, check**

Run: `make test 2>&1 | grep -E "^ℹ (pass|fail)"; make -j4 >/dev/null 2>&1 && echo built; grep -c 'de-c-curve\|de-c-fam' _site/posts/differential-entropy/index.html`
Expected: `ℹ pass 426`, `ℹ fail 0`, `built`, `0`.

Browser (if connected): the quantize figure draws both cases; the ochre curve is flat at H for a pmf once t > 0 and climbs the dashed line for a density; the Δ slider moves the dot and the histogram; dragging p_X in the right panel reshapes every figure.

- [ ] **Step 9: Commit**

```bash
git add -A src/lib/prob/panel-px.js src/differential-entropy content/posts/2026-10-05-differential-entropy.md
git commit -m "differential-entropy: the quantize figure on the shared p_X, both cases — H(X_Δ) flat for a pmf, climbing h + log(1/Δ) for a density

Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd"
```

---

### Task 6: the stretch figure on the shared model

**Files:**
- Create: `src/differential-entropy/fig-stretch.js` (replaces the old file's contents entirely)
- Modify: `src/differential-entropy/main.js`
- Modify: `content/posts/2026-10-05-differential-entropy.md` (§3's figure markup)
- Test: `src/differential-entropy/fig-stretch.test.js` (the `stretchLabel` helper)

**Interfaces:**
- Consumes: `stretchView`, `randomPerm` (Task 3); `boxOf`, `positionsOf` (Task 1); `windowPX`, `drawPX` (Task 5); `Region`, `el`, `svgContext`; `createMathLayer`, `texNum`; `fitWidth`.
- Produces: `createStretchFigure(svg, { model }, { slider, label, shuffle }) → { draw }`, `stretchLabel(s) → string`; element ids `de-stretch` (svg), `de-s-a` (range), `de-s-av` (label), `de-s-shuffle` (button, `.ex-disc`).

- [ ] **Step 1: Write the failing test for the a label**

```js
// src/differential-entropy/fig-stretch.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stretchLabel } from './fig-stretch.js';

describe('the stretch slider label', () => {
    it('is an integer for s ≥ 0 integer, 1/2^k for a negative integer s, else 3 figures', () => {
        assert.equal(stretchLabel(0), '1');
        assert.equal(stretchLabel(3), '8');
        assert.equal(stretchLabel(-2), '1/4');
        assert.equal(stretchLabel(0.5), '1.41');
        assert.equal(stretchLabel(-0.5), '0.71');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test src/differential-entropy/fig-stretch.test.js 2>&1 | grep -E "^# (pass|fail)|Error|export" | head -3`
Expected: FAIL — no export named `stretchLabel`.

- [ ] **Step 3: The figure**

Replace the whole of `src/differential-entropy/fig-stretch.js` with:

```js
// ================================================================
//  Differential entropy — fig-stretch.js
//  Stretching the axis: Y = aX in a panel of its own, the original as
//  a ghost. A pmf's atoms move apart with their heights unchanged
//  (shuffle relabels them too); a density flattens by 1/a. The dashed
//  box is the uniform with the same entropy: 2^H slots, or 2^h long.
//  The slider, the shuffle and the permutation are this figure's own;
//  the model's p_X is untouched, and this panel is not editable.
// ================================================================

import { Region, svgContext } from '../lib/prob/region.js';
import { createMathLayer, texNum } from '../lib/prob/mathlabels.js';
import { fitWidth } from '../lib/prob/fit.js';
import { windowPX, drawPX } from '../lib/prob/panel-px.js';
import { stretchView, randomPerm } from '../lib/prob/stretch.js';
import { boxOf, positionsOf } from '../lib/prob/width.js';

const W0 = 1000, HP = 340, H0 = HP + 56;

// a = 2^s: an integer for an integer s ≥ 0, "1/2^k" for a negative integer s, else 3 figures.
export function stretchLabel(s) {
    if (Math.abs(s - Math.round(s)) < 1e-9) { const k = Math.round(s); return k < 0 ? '1/' + 2 ** -k : String(2 ** k); }
    const a = 2 ** s;
    return a >= 1 ? String(+a.toPrecision(3)) : a.toPrecision(2);
}
const val = x => { const t = texNum(x); return t.startsWith('-') ? `\\class{ex-neg}{${t}}` : t; };

export function createStretchFigure(svg, { model }, { slider, label, shuffle }) {
    const ctx = svgContext(svg, W0, H0);
    const R = new Region(ctx, { ox: 0, oy: 0, w: W0, h: HP, m: { l: 58, r: 16, t: 26, b: 42 } });
    const math = createMathLayer(svg.parentElement, W0, H0);
    let layoutW = W0, drawn = false, perm = null;
    function layout(W) {
        R.o.w = W; layoutW = W;
        svg.setAttribute('viewBox', `0 0 ${W} ${H0}`); math.resize(W, H0);
        if (drawn) draw();
    }

    function draw() {
        drawn = true;
        const v = model.view(), s = +slider.value, a = 2 ** s;
        const y = stretchView(v, a, v.disc ? perm : null), moved = Math.abs(s) > 1e-9 || (v.disc && perm !== null);
        if (label) label.textContent = stretchLabel(s);
        math.begin();
        // a window holding both the original and the stretched distribution
        const w0 = windowPX(v), w1 = windowPX(y);
        R.domain(Math.min(w0.x0, w1.x0), Math.max(w0.x1, w1.x1), 0, Math.max(w0.y1, w1.y1));
        R.axes(v.disc ? { xticks: positionsOf(y), yticks: [0, .5, 1] } : {});
        const [xx, xy] = R.xlabelAt(), [yx, yy] = R.ylabelAt();
        math.set('x', xx, xy, 'y = a\\,x'); math.set('y', yx, yy, 'p_{aX}(y)', { rotate: -90 });
        if (moved) drawPX(R, v, { faint: true });
        drawPX(R, y);
        if (!v.disc) R.hline(1, 'hline').setAttribute('opacity', '.5');
        // the uniform with the same entropy as aX
        const b = boxOf(y);
        R.rect(b.cx - b.w / 2, 0, b.cx + b.w / 2, b.ht, 'eqbox');
        math.set('box', R.X(b.cx), R.Y(Math.min(b.ht, R.y1)) - 14,
            v.disc ? `2^{H} = ${texNum(b.w / a, 2)}\\ \\text{outcomes}` : `2^{h} = ${texNum(b.w, 2)}\\ \\text{wide}`, { cls: 'ex-ml-note' });
        // readout
        const h0 = boxOf(v).H;
        math.set('readout', layoutW / 2, HP + 30, v.disc
            ? `H(aX) = H(X) = ${val(b.H)}\\text{ bits}`
            : `h(aX) = h(X) + \\log a = ${val(h0)} ${s < 0 ? '-' : '+'} ${texNum(Math.abs(s))} = ${val(b.H)}\\text{ bits}`,
            { cls: 'ex-ml-formula' });
        math.end();
    }

    slider.addEventListener('input', draw);
    shuffle?.addEventListener('click', () => { perm = randomPerm(model.view().p.length); draw(); });
    fitWidth(svg.parentElement, layout);
    return { draw };
}
```

- [ ] **Step 4: Run the label test**

Run: `node --test src/differential-entropy/fig-stretch.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 5: Mount it**

In `src/differential-entropy/main.js`: add `import { createStretchFigure } from './fig-stretch.js';`; add `stretchSvg = $('de-stretch')` to the lookups and the guard; declare `stretch = null`; add `stretch?.draw();` to `redraw()` after `quant?.draw();`; after the quantize mount add

```js
        if (stretchSvg) stretch = createStretchFigure(stretchSvg, ctx, { slider: $('de-s-a'), label: $('de-s-av'), shuffle: $('de-s-shuffle') });
```

- [ ] **Step 6: The figure's markup in the post**

In `# Stretching the axis`, replace the whole `::: {.wide .extra-wide}` … `:::` block holding `<div class="de-fig">` with ids `de-d-a`, `de-d-av`, `de-d-disc`, `de-d-cont`, `de-d-H`, `de-d-hx`, `de-d-la`, `de-d-h` with:

````markdown
::: {.wide .extra-wide .ex-wrap}
```{=html}
<div class="de-row">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="de-s-a">stretch \(a\) = <b id="de-s-av">1</b></label><input type="range" id="de-s-a" min="-3" max="3" step="0.05" value="0"></div>
<div class="ex-grp ex-disc"><button type="button" id="de-s-shuffle">shuffle the outcomes</button></div>
</div>
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-stretch" role="img" aria-label="The distribution of a X with the original behind it, and the uniform with the same entropy as a box"></svg></div></figure>
```
:::
````

- [ ] **Step 7: Build, test, check**

Run: `make test 2>&1 | grep -E "^ℹ (pass|fail)"; make -j4 >/dev/null 2>&1 && echo built; grep -c 'de-d-disc\|de-d-cont' _site/posts/differential-entropy/index.html`
Expected: `ℹ pass 427`, `ℹ fail 0`, `built`, `0`.

Browser (if connected): the stretch slider moves atoms apart with heights unchanged and the box label's count unchanged; in the continuous case the density flattens, the box widens and the readout adds log a; shuffle (discrete only) permutes the atoms with H unchanged.

- [ ] **Step 8: Commit**

```bash
git add -A src/differential-entropy content/posts/2026-10-05-differential-entropy.md
git commit -m "differential-entropy: the stretch figure on the shared p_X — atoms relabeled, a density stretched, the box a count or a length

Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd"
```

---

### Task 7: the quantile-transform page, and the draft section removed

**Files:**
- Create: `content/posts/2026-10-07-quantile-transform.md`, `src/quantile-transform/index.js`, `src/quantile-transform/main.js`
- Modify: `content/posts/2026-10-05-differential-entropy.md` (remove the draft comment and section)

**Interfaces:**
- Consumes: `createModel`, `createPosition`, `createTransformFigure` (plain), `bindCommonControls` from `src/lib/prob/`.
- Produces: the page at `/posts/quantile-transform/`, unlisted.

- [ ] **Step 1: The bundle**

```js
// src/quantile-transform/index.js
// ================================================================
//  Through the quantile function — index.js
//  Entry point: esbuild bundles this to /assets/js/quantile-transform.bundle.js.
// ================================================================

import { init } from './main.js';

if (document.readyState !== 'loading') init();
else document.addEventListener('DOMContentLoaded', init);
```

```js
// src/quantile-transform/main.js
// ================================================================
//  Through the quantile function — main.js
//  The transform figure on its own: a uniform U carried through F_X⁻¹
//  to X, with the common controls (case, p_X, reset).
// ================================================================

import { createModel } from '../lib/prob/model.js';
import { createPosition } from '../lib/prob/position.js';
import { createTransformFigure } from '../lib/prob/fig-transform.js';
import { bindCommonControls } from '../lib/prob/controls.js';

export function init() {
    const svg = document.getElementById('qt-transform');
    if (!svg) return;
    const model = createModel(), pos = createPosition(model);
    const ui = { g: 'neglog', gBase: 'neglog', gc: null, ghost: true };
    let fig = null, controls = null;
    const redraw = () => { fig?.draw(); controls?.update(); };
    const ctx = { model, pos, ui, redraw, customG: () => {}, stopPlay: () => {} };
    controls = bindCommonControls({ model, pos, redraw }, { afterCase: () => pos.setU(0.6) });
    fig = createTransformFigure(svg, ctx);
    model.subscribe(() => { pos.refresh(); redraw(); });
    redraw();
}
```

- [ ] **Step 2: The page**

````markdown
---
title: Through the quantile function
subtitle: A uniform carried through the inverse CDF has the law of X
date: 2026-10-07
author: Jacob Hoover Vigly
tags: [exploration]
unlisted: true
js:
  - src/quantile-transform
css:
  - assets/css/expectation.css
mathjax-macros: assets/prob/macros.json
---

Let $U$ be uniform on $[0, 1]$. Then $F_X^{-1}(U)$ has the law of $X$, which is why sampling by the inverse CDF works. Evenly spaced values of $u$ land at $x = F_X^{-1}(u)$ with spacing $\dee u / p_X(x)$, so they bunch where $p_X$ is high: the density is the reciprocal of the quantile function's slope. This builds on an earlier note on the [density of a transformed random variable](/posts/transform-pdf/); here the transformation is the one that produces any law from a uniform.

```{=html}
<div class="ex-bar wide extra-wide" id="ex-bar">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="ex-preset">\(p_X\)</label><select id="ex-preset"></select></div>
<div class="ex-grp"><button type="button" id="ex-reset">↺ reset</button></div>
</div>
```

::: {.wide .extra-wide .ex-wrap}
```{=html}
<figure class="ex-fig">
<div class="ex-canvas"><svg class="ex-plot" id="qt-transform" role="img" aria-label="Evenly spaced values of a uniform U, carried through the quantile function to X"></svg></div>
</figure>
```
:::

::: {.de-caption}
Drag along the uniform or the graph to move $u$; drag in the right panel to move $x$; drag $p_X$ to reshape it.
:::
````

Save as `content/posts/2026-10-07-quantile-transform.md`. (`.de-caption` is styled by the entropy post's stylesheet, which this page does not load; replace that block's class with nothing: use a plain paragraph instead of the `::: {.de-caption}` fence.)

- [ ] **Step 3: Remove the draft from the entropy post**

In `content/posts/2026-10-05-differential-entropy.md`, delete from the line `<!-- DRAFT for phase 2 (moved here from the expectation post, 2026-09-30): the transform figure,` through the end of the file (the comment, `# Draft: the quantile function`, its toggle paragraph and its figure block). The file now ends with the Shannon/Cover citation paragraph.

Run: `tail -3 content/posts/2026-10-05-differential-entropy.md | cut -c1-80; grep -c "ex-transform\|Draft" content/posts/2026-10-05-differential-entropy.md`
Expected: the last non-empty line starts `Shannon [-@shannon.c:1948a, Part III]`; `0`.

- [ ] **Step 4: Build and check**

Run: `make -j4 >/dev/null 2>&1 && echo built; ls _site/posts/quantile-transform/index.html _site/assets/js/quantile-transform.bundle.js; grep -c "quantile-transform" _site/posts/index.html`
Expected: `built`, both files listed, `0` (unlisted).

Browser (if connected): `/posts/quantile-transform/` shows the figure with its controls, both cases, dragging works.

- [ ] **Step 5: Run the suite and commit**

Run: `make test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `ℹ pass 427`, `ℹ fail 0`.

```bash
git add content/posts/2026-10-07-quantile-transform.md src/quantile-transform content/posts/2026-10-05-differential-entropy.md
git commit -m "quantile-transform: the transform figure on a page of its own, unlisted; the entropy post's draft section goes

Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd"
```

---

### Task 8: the prose, the table, and the dead CSS

**Files:**
- Modify: `content/posts/2026-10-05-differential-entropy.md` (§2, §3, §4 prose and captions; §5 table)
- Modify: `assets/css/differential-entropy.css` (remove rules only the deleted figures used)

**Interfaces:** none new.

- [ ] **Step 1: §2 — quantize, then subtract**

Replace everything from the line `# Where $h$ comes from: quantize, then subtract` up to (not including) the `::: {.wide .extra-wide .ex-wrap}` block that holds `id="de-quantize"` with:

```markdown
# Where $h$ comes from: quantize, then subtract

Cut the line into bins of width $\bw$ and let $\Xq$ be the bin $X$ lands in. Its Shannon entropy counts the width in bins, $2^{H(\Xq)} \approx 2^{h(X)}/\bw$:^[For small $\bw$, bin $i$ has mass $p_i \approx p_X(x_i)\,\bw$, so $H(\Xq) = -\sum_i p_i\log p_i \approx -\sum_i p_X(x_i)\log p_X(x_i)\,\bw \;-\; \log\bw\sum_i p_X(x_i)\,\bw$. The first sum is a Riemann sum for $h(X)$; the second tends to 1. The limit holds for any Riemann-integrable density with finite $h$ [@cover.t:2006book2, ch. 8].]

$$ H(\Xq) \approx h(X) + \log\frac{1}{\bw}, \qquad h(X) = \lim_{\bw\to 0}\Big[H(\Xq) + \log\bw\Big]. $$

Pinning down a real number exactly takes infinitely many bits; $h$ is what is left once that cost, the unit, is subtracted. A pmf has nothing to subtract: once the bins are finer than the atoms' spacing, $H(\Xq) = H(X)$. An atom inside a density does the same at its point, which is why a distribution with atoms has no differential entropy.^[$h = -\infty$ for a point mass, and undefined for a mixed distribution, whose $H(\Xq)$ grows like $\log(1/\bw)$ times the mass of its continuous part.]

```

Then replace the caption block after that figure (the `::: {.de-caption}` beginning "The **ochre curve** is the true discrete entropy") and the two paragraphs after it ("This picture also explains the limit…" and "Reading the line off at $\bw = 1$…") with:

```markdown
::: {.de-caption}
The curve is $H(\Xq)$ against $\log(1/\bw)$; the bars are the bin masses at the current $\bw$. For a density it climbs the dashed line $h(X) + \log(1/\bw)$, one bit per halving of $\bw$. For a pmf it is flat at $H(X)$ once $\bw < 1$. Squeeze the density toward a point and the curve slides right, $h \to -\infty$; the curve itself never goes below zero.
:::
```

- [ ] **Step 2: §3 — stretching the axis**

Replace everything from `# Stretching the axis` up to (not including) the `::: {.wide .extra-wide .ex-wrap}` block that holds `id="de-stretch"` with:

```markdown
# Stretching the axis

Relabel the outcomes of a pmf, by shuffling them or by spreading them out, and every probability stays where it was: $H$ and the count do not move. Stretch a density by $a$ and the same mass covers $a$ times the length, so the density drops and the width grows:^[For a smooth invertible $g$, $h(g(X)) = h(X) + \E\log\lvert g'(X)\rvert$: the Jacobian enters the density, and so the log. A shift has Jacobian 1, so $h(X + c) = h(X)$. Recording the same quantity in centimetres instead of metres adds $\log 100 \approx 6.64$ bits, and nothing about the uncertainty has changed. See also the [density of a transformed random variable](/posts/transform-pdf/).]

$$ p_{aX}(y) = \frac{1}{a}\,p_X\!\Big(\frac{y}{a}\Big) \qquad\Longrightarrow\qquad h(aX) = h(X) + \log a. $$

```

Replace the caption block after that figure (beginning "Same stretch, two responses") with:

```markdown
::: {.de-caption}
Same stretch, two responses. Atoms move apart and keep their heights, and the box keeps its count. The density flattens to keep its area, and the box is $a$ times as long. Shuffle relabels the atoms: a different staircase, the same probabilities.
:::
```

- [ ] **Step 3: §4 — what survives**

Replace the three paragraphs after `# What survives: differences` (from "Both anomalies are additive constants." through the Jaynes paragraph and its sidenote, up to the `::: {.wide .extra-wide}` block holding the MI figure) with:

```markdown
Both anomalies are units. The divergent $\log(1/\bw)$ and the shift $\log a$ are the same for every entropy of the same variable, so they cancel in differences: a difference of widths is a ratio, and unit-free. Mutual information is the main example,

$$ I(X;Y) = h(X) - h(X\mid Y) = \lim_{\bw\to0} I(\Xq; Y_{\bw}) \;\ge\; 0, $$

unchanged by any invertible transformation of $X$ or $Y$ separately, as is KL divergence, $\KL{p_X}{g} = \int p_X\log(p_X/g)\,\dee x$, where the Jacobians cancel in the ratio.^[This also says what $h$ is: $h(X) = -\KL{p_X}{1}$, a negative divergence from the flat reference "density" 1, Lebesgue measure with a chosen unit length. Jaynes' *limiting density of discrete points* replaces the 1 with an explicit reference density $m(x)$, $-\int p_X\log(p_X/m)\,\dee x$, which is coordinate-free since $p_X$ and $m$ transform alike [@jaynes.e:1968, sec. VI].]

```

- [ ] **Step 4: §5 — the table**

Replace the paragraph after `# Side by side` and the table with:

```markdown
Each row traces back to one fact: $2^H$ counts outcomes, and $2^h$ measures a length, which needs a unit.

::: {.wide .extra-wide}
| | Shannon entropy, pmf | Differential entropy, pdf | Why |
|--|-----|-----|-----|
| Definition | $-\sum p_X\log p_X$ | $-\int p_X\log p_X\dee x$ | The same expectation of $-\log p_X$, as a sum or an integral. |
| Effective size | $2^H$ outcomes, $\ge 1$ | $2^h$ long, any positive length | The uniform with the same entropy. |
| Inside the log | A probability, $\le 1$ | A density, unbounded | Density is probability per unit length; only its integral is fixed. |
| Sign | $H \ge 0$, zero iff deterministic | [Any real number]{.de-flag}; $\to -\infty$ as the distribution concentrates | A count is at least 1; a width can be less than 1. |
| Quantization | $H(\Xq) = H(X)$ once $\bw < 1$ | $H(\Xq) \approx h(X) + \log(1/\bw)$ | A count is a width in units of $\bw$; $h$ is the width with the unit left out. |
| Invertible transforms | Invariant under any relabeling | [Shifts by $\E\log\lvert g'(X)\rvert$]{.de-flag}; depends on units | The Jacobian rescales the density. |
| Translation | Invariant | Invariant | A shift has Jacobian 1. |
| Maximum | $\log n$, uniform on $n$ outcomes | $\log L$ on a support of length $L$ (uniform); $\tfrac12\log(2\pi e\sigma^2)$ with variance $\sigma^2$ (Gaussian) | A count is at most $n$; a width is at most the support. |
| Mutual information, KL | $\ge 0$, invariant | $\ge 0$, invariant; limits of the discrete versions | Units cancel in differences and ratios. |
:::
```

The closing citation paragraph stays as it is.

- [ ] **Step 5: Dead CSS**

The MI figure uses, from `assets/css/differential-entropy.css`: the `:root` variables, `.de-fig`, `.de-panels` (and its media query), `.de-ptitle`, `.de-controls`, `.de-ctl` (and its `label`, `label b`), `.de-fig input[type=range]`, `.de-fig :focus-visible`, `.de-readouts` (`.k`, `.v`), `.de-fig .neg`, `svg.de-plot` and its `.gl`, `.ax`, `.ax.zero`, `.tk`, `.axl`, `.lbl` (`.soft`, `.neg`, `.mass`, `.atom`, `.b`), `.ref`, `.sc`, `.brk`, `.hbar.pos`, `.hbar.neg`, `.hbar.mi`. The page also uses `.de-caption p`, `.de-caption strong`, `.de-flag`, the `.ex-bar input[type=range]` rule and the `.de-row` rules from Task 4.

Delete these rules, which only the removed figures used: `.de-seg` and `.de-seg button` (both rules, and `.de-btn` from the shared selector, leaving `.de-btn`-only rules deleted too), `.de-seg button[aria-checked="true"]`, `.de-btn`, `.de-btn:hover`; `svg.de-plot .curve`, `.curve.ghost`, `.fm`, `.fn`, `.fmb`, `.fnb`, `.bar`, `.hmark`, `.eqbox`, `.stem`, `.stem.ghost`, `.dot`, `.dot.ghost`, `.handle`, `.edge`, `.asym`, `.qcurve`, `.negzone`, `.gap`, `.pt`, `.ptm`, `.band`; the whole `/* ---- editing affordances ---- */` block (`.de-ctl.de-ctl-narrow`, `.de-fig select`, `.bar-base`, `.grip`, `.grip.active`, `.handle.grab`, `.handle.active`, `.handle-break`, the `touch-action` rule, `.de-btns`, `.de-btn:disabled`, `.de-btn:disabled:hover`).

Run: `grep -c "de-seg\|\.eqbox\|\.qcurve\|de-btn\|bar-base\|de-a-pmf" assets/css/differential-entropy.css`
Expected: `0`.

- [ ] **Step 6: Build, test, read the page**

Run: `make test 2>&1 | grep -E "^ℹ (pass|fail)"; make -j4 >/dev/null 2>&1 && echo built; grep -o "^# .*" content/posts/2026-10-05-differential-entropy.md`
Expected: `ℹ pass 427`, `ℹ fail 0`, `built`, and the headings in order: `# $h$ is a width`, `# Where $h$ comes from: quantize, then subtract`, `# Stretching the axis`, `# What survives: differences`, `# Side by side`.

Browser (if connected): read the whole post top to bottom in both cases; every figure draws; the MI figure is unchanged; no console errors (`read_console_messages` with pattern `Error`).

- [ ] **Step 7: Commit**

```bash
git add content/posts/2026-10-05-differential-entropy.md assets/css/differential-entropy.css
git commit -m "differential-entropy: the properties in the width language — prose cut, table extended, the removed figures' CSS gone

Claude-Session: https://claude.ai/code/session_01U3NhCJhjS467B9Qe3q16Rd"
```

---

## Self-review notes

- Spec coverage: §1 → Task 4; §2 figure → Task 5, prose → Task 8; §3 figure → Task 6, prose → Task 8; §4 and §5 → Task 8; draft removal and new page → Task 7; `width.js`/`quantize.js`/`stretch.js` → Tasks 1–3; `panel-px.js` → Task 5; deletions → Tasks 5 and 8; MI untouched throughout; `afterCase` hook → Task 4.
- Names used across tasks: `entropyOf`, `meanOf`, `boxOf`, `positionsOf` (Task 1) are consumed as spelled in Tasks 4–6; `binMasses(v, D, origin)`, `quantizedH`, `quantizeCurve` (Task 2) in Task 5; `stretchView(v, a, perm)`, `randomPerm` (Task 3) in Task 6; `windowPX`, `drawPX` (Task 5) in Task 6; element ids `de-width`, `de-quantize`, `de-q-delta`, `de-q-deltav`, `de-stretch`, `de-s-a`, `de-s-av`, `de-s-shuffle`, `qt-transform` match between markup and `main.js`.
- Deviation from the spec recorded here: `entropyOf` lives in `width.js` and computes the trapezoid sum directly (one line, identical to the area figure's integrand total) rather than reaching into `frame.js`'s single-entry cache, which the stretched views would otherwise thrash.
- Test count: 408 → 427 (5 + 6 + 6 + 1 + 1).
