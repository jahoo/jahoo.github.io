# Expectation Post (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish-ready (unlisted) post `content/posts/2026-09-29-expectation.md` with the area figure and the transform figure from the prototype, sharing one editable p_X and one (x, u) position.

**Architecture:** Shared, tested pure modules in `src/lib/prob/` (distributions moved from the entropy post, a distribution model with change notification, the (x, u) position) plus two DOM helpers there (a multi-panel SVG region class and a p_X drag editor working through coordinate adapters). The post's bundle `src/expectation/` wires one model and one position to a sticky control bar and two SVG figures ported from the prototype's `drawD` and `drawT`.

**Tech Stack:** Vanilla ES modules bundled by esbuild (`src/*/index.js` → `/assets/js/*.bundle.js`), `node --test`, Pandoc markdown with raw `{=html}` blocks, MathJax v4 (site template), headless Chrome over CDP for browser checks.

**Spec:** `docs/superpowers/specs/2026-09-29-expectation-post-design.md`. Reference implementation: `docs/superpowers/specs/2026-09-29-expectation-prototype.html` (port its `Region`, `drawD`, `drawT`, drag and control code; line numbers below refer to it).

## Global Constraints

- Work on branch `differential-entropy` in the main checkout. Commit freely; do not push (the user consolidates before pushing). No `Co-Authored-By` lines.
- 4-space indentation, single quotes, semicolons, `// ---- section ----` comments, as in `src/differential-entropy/*.js`.
- Page text: math statements only (spec, "Text policy"). No interaction prose, no panel titles restating the math.
- Site is light-only; CSS tokens prefixed `ex-` in `assets/css/expectation.css`; figures inside `::: {.wide .extra-wide}`; SVG `min-width: 640px`, frame scrolls horizontally below that.
- Discrete atoms at x = 1..8; pmf edit floor 0.01; g default −log₂ p_X.
- Build `make -j4`; tests `make test` (runs `node --test 'src/**/*.test.js' 'test/**/*.test.js'`).

## Review Focus

- Editing p_X while the position is x-driven between two atoms: u must jump to the new F_X(x), and the running integral, area plot and transform shading must all agree afterwards. Covered by the position test "driver is kept across a model change" (Task 3) and the browser check (Task 7).
- Dragging a mixture peak far up or sideways during a position drag's zone: handle hits must win over position drags, and the shared window must not rescale under the cursor mid-drag. Browser check (Task 7).
- Switching case or preset while u-driven at u = 1 or u = 0: no NaN in readouts, the fiber and E[g(X)] display behave (E shows only at u = 1). Position tests pin the endpoints (Task 3).
- Steps/Uniform with a zero-width chunk attempt (dragging a step point onto its neighbour): clamped by `setBreak`'s MIN_WIDTH; sampled CDF must stay monotone. Dist test "sampled CDF is monotone for steps" (Task 1).
- g = −log p_X on a Gaussian's far tails: heights clipped to [−5, 9] for display only; the running integral uses the unclipped values and matches h to 1e-3. Dist test (Task 1).

---

### Task 1: Move `dist.js` to `src/lib/prob/` and add sampled helpers

**Files:**
- Move: `src/differential-entropy/dist.js` → `src/lib/prob/dist.js`; `src/differential-entropy/dist.test.js` → `src/lib/prob/dist.test.js`
- Modify: every `import … from './dist.js'` in `src/differential-entropy/*.js` → `'../lib/prob/dist.js'`
- Modify: `src/lib/prob/dist.js` (append the helpers below), `src/lib/prob/dist.test.js` (append tests)

**Interfaces:**
- Produces:
  - `cdfOf(p: number[]) -> number[]` — F with F[0] = 0, F[k] = p[0] + … + p[k−1], length n+1.
  - `discCdfAt(F, x) -> number` — F_X(x) for atoms at 1..n: `F[clamp(floor(x + 1e-9), 0, n)]`.
  - `discQuantile(F, u) -> number` — F_X⁻¹(u) as an atom value in 1..n; returns 0 when u ≤ 0.
  - `sampleShape(shape) -> { xs, fs, Fs, peak }` — sorted samples of a `mix` or `steps` shape covering its support (mix: 1601 points over min(m − 7s)..max(m + 7s); steps: 41 points per chunk, ends nudged inward by 1e-9).
  - `atX(S, x) -> { j, t }`, `atU(S, u) -> { j, t }`, `lerp(arr, L) -> number` — interpolation indices (port of prototype `idxAtX`, `idxAtU`, `at`, lines 397–414).
  - `runningIntegral(Fs, gs) -> number[]` — trapezoid ∫ g du along the samples, I[0] = 0.

- [ ] **Step 1: Move the files with git and fix imports**

```bash
mkdir -p src/lib/prob
git mv src/differential-entropy/dist.js src/lib/prob/dist.js
git mv src/differential-entropy/dist.test.js src/lib/prob/dist.test.js
grep -l "from './dist.js'" src/differential-entropy/*.js | xargs sed -i '' "s#from './dist.js'#from '../lib/prob/dist.js'#"
make test   # expect: all pass (the moved tests import './dist.js', still valid)
```

- [ ] **Step 2: Write the failing tests** (append to `src/lib/prob/dist.test.js`, extend its import with `cdfOf, discCdfAt, discQuantile, sampleShape, atX, atU, lerp, runningIntegral, familyShape` as needed)

```js
describe('sampled helpers', () => {
    it('discrete CDF and generalized inverse satisfy F⁻¹(u) ≤ x ⟺ u ≤ F(x)', () => {
        const p = [0.1, 0.4, 0.2, 0.3], F = cdfOf(p);
        assert.deepEqual(F.map(v => +v.toFixed(12)), [0, 0.1, 0.5, 0.7, 1]);
        for (let i = 0; i < 500; i++) {
            const u = Math.random(), x = 0.5 + Math.random() * 4;
            assert.equal(discQuantile(F, u) <= x + 1e-12, u <= discCdfAt(F, x) + 1e-12);
        }
        assert.equal(discQuantile(F, 0), 0);
        assert.equal(discQuantile(F, 0.1), 1);      // closed at the block's end
        assert.equal(discQuantile(F, 0.1000001), 2);
    });
    it('sampled CDF is monotone and ends at 1, for mixtures and steps', () => {
        for (const shape of [familyShape('gauss', 0.2), familyShape('bimodal', 0.3),
            { kind: 'steps', ts: [-.55, -.3, -.1, .1, .3, .55], ms: [.1, .28, .34, .18, .1] }]) {
            const S = sampleShape(shape);
            for (let i = 1; i < S.Fs.length; i++) assert.ok(S.Fs[i] >= S.Fs[i - 1] - 1e-12);
            close(S.Fs[S.Fs.length - 1], 1, 1e-6);
        }
    });
    it('quantile and CDF invert each other through the samples', () => {
        const S = sampleShape(familyShape('gauss', 0.2));
        const x = lerp(S.xs, atU(S, 0.3));
        close(x, 0.2 * -0.5244005, 1e-3);
        close(lerp(S.Fs, atX(S, x)), 0.3, 1e-4);
    });
    it('running integral of −log₂ f recovers h, and of 1 gives u', () => {
        const S = sampleShape(familyShape('gauss', 0.2));
        const I = runningIntegral(S.Fs, S.fs.map(f => -log2(f)));
        close(I[I.length - 1], 0.5 * log2(2 * Math.PI * Math.E * 0.04), 1e-3);
        const one = runningIntegral(S.Fs, S.fs.map(() => 1));
        close(one[one.length - 1], 1, 1e-9);
    });
});
```

- [ ] **Step 3: Run to see them fail** — `node --test src/lib/prob/dist.test.js` → FAIL (`cdfOf is not a function`).

- [ ] **Step 4: Implement** (append to `src/lib/prob/dist.js`)

```js
// ---- sampled CDFs and quantiles (both figures of the expectation post) ----

// F with F[0] = 0 and F[k] = P(X ≤ k) for atoms at 1..n.
export function cdfOf(p) {
    const F = [0];
    p.forEach((v, i) => F.push(F[i] + v));
    return F;
}

// F_X(x) for atoms at 1..n: right-continuous, so the atom at x counts once x reaches it.
export function discCdfAt(F, x) {
    return F[clamp(Math.floor(x + 1e-9), 0, F.length - 1)];
}

// F_X⁻¹(u) = min{x : F_X(x) ≥ u}: the atom whose block (F[k−1], F[k]] holds u; 0 for u ≤ 0.
export function discQuantile(F, u) {
    if (u <= 0) return 0;
    const k = F.findIndex((f, i) => i > 0 && f >= u - 1e-12);
    return k === -1 ? F.length - 1 : k;
}

// Sorted samples of a shape over its support: x, density, CDF.
export function sampleShape(shape) {
    const xs = [], fs = [], Fs = [];
    if (shape.kind === 'steps') {
        const { ts, ms } = shape, e = 1e-9;
        let F = 0;
        ms.forEach((m, i) => {
            const w = ts[i + 1] - ts[i], h = m / w;
            for (let j = 0; j <= 40; j++) {
                const x = ts[i] + (j === 0 ? e : j === 40 ? w - e : w * j / 40);
                xs.push(x); fs.push(h); Fs.push(F + h * (x - ts[i]));
            }
            F += m;
        });
    } else {
        const c = shape.comps, N = 1600;
        const lo = Math.min(...c.map(k => k.m - 7 * k.s)), hi = Math.max(...c.map(k => k.m + 7 * k.s));
        for (let i = 0; i <= N; i++) {
            const x = lo + (hi - lo) * i / N;
            let f = 0, F = 0;
            for (const k of c) { f += k.w * gPdf(x, k.m, k.s); F += k.w * gCdf(x, k.m, k.s); }
            xs.push(x); fs.push(f); Fs.push(F);
        }
    }
    return { xs, fs, Fs, peak: Math.max(...fs) };
}

// Interpolation index into sorted samples, by x or by u.
function bisect(arr, v) {
    const n = arr.length;
    if (v <= arr[0]) return { j: 0, t: 0 };
    if (v >= arr[n - 1]) return { j: n - 2, t: 1 };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
    const d = arr[hi] - arr[lo];
    return { j: lo, t: d > 0 ? (v - arr[lo]) / d : 0 };
}
export const atX = (S, x) => bisect(S.xs, x);
export const atU = (S, u) => bisect(S.Fs, u);
export const lerp = (arr, L) => arr[L.j] + (arr[L.j + 1] - arr[L.j]) * L.t;

// ∫ g du along the samples (trapezoid), I[0] = 0.
export function runningIntegral(Fs, gs) {
    const I = [0];
    for (let i = 1; i < gs.length; i++) I.push(I[i - 1] + (Fs[i] - Fs[i - 1]) * (gs[i] + gs[i - 1]) / 2);
    return I;
}
```

- [ ] **Step 5: Run** — `make test` → all pass; `make -j4` → entropy post still builds.
- [ ] **Step 6: Commit** — `git add -A src/lib/prob src/differential-entropy && git commit -m "prob lib: move dist.js to src/lib/prob, add sampled CDF/quantile helpers"`

---

### Task 2: The shared distribution model

**Files:**
- Create: `src/lib/prob/model.js`, `src/lib/prob/model.test.js`

**Interfaces:**
- Consumes: `withProb`, `softmax`, `setPeak`, `setBreak`, `setLevel`, `shapeMoments`, `cdfOf`, `sampleShape`, `clamp` from `dist.js`.
- Produces: `createModel() -> model` with
  - `model.kase` ('disc' | 'cont'), `model.discKey`, `model.contKey`, `model.p` (array of 8), `model.shape`;
  - `DISC_PRESETS`, `CONT_PRESETS` (exported objects of `{ label, p }` / `{ label, shape }`);
  - `model.setCase(k)`, `model.setPreset(key)`, `model.editPmf(i, target)`, `model.setShape(shape)`;
  - `model.view()` → discrete `{ disc: true, p, F, n, xRange: [0.5, n + 0.5] }` or continuous `{ disc: false, shape, S, win: { x0, x1, y1 }, xRange: [win.x0, win.x1] }` (S from `sampleShape`, cached until the shape changes);
  - `model.hold(on)` — while held, `win` stays fixed except that it grows when the shape presses an edge (port `shapeWindow`/`growWindow` from `src/differential-entropy/shape-controls.js`, with `d.peak` taken from `S.peak`); releasing recomputes it;
  - `model.subscribe(fn)` — called with no arguments after every change.

- [ ] **Step 1: Write the failing tests** (`src/lib/prob/model.test.js`)

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel, DISC_PRESETS, CONT_PRESETS } from './model.js';

const sum = a => a.reduce((x, y) => x + y, 0);

describe('model', () => {
    it('starts discrete on the default preset, normalized', () => {
        const m = createModel();
        assert.equal(m.kase, 'disc');
        assert.equal(m.p.length, 8);
        assert.ok(Math.abs(sum(m.p) - 1) < 1e-12);
        assert.deepEqual(m.view().xRange, [0.5, 8.5]);
    });
    it('every preset is normalized', () => {
        for (const k of Object.keys(DISC_PRESETS)) { const m = createModel(); m.setPreset(k); assert.ok(Math.abs(sum(m.p) - 1) < 1e-12, k); }
        for (const k of Object.keys(CONT_PRESETS)) { const m = createModel(); m.setCase('cont'); m.setPreset(k); const S = m.view().S; assert.ok(Math.abs(S.Fs[S.Fs.length - 1] - 1) < 1e-6, k); }
    });
    it('editPmf hits the target, keeps the total, notifies', () => {
        const m = createModel(); let n = 0; m.subscribe(() => n++);
        m.editPmf(3, 0.5);
        assert.ok(Math.abs(m.p[3] - 0.5) < 1e-12);
        assert.ok(Math.abs(sum(m.p) - 1) < 1e-12);
        assert.equal(n, 1);
    });
    it('setShape replaces the samples', () => {
        const m = createModel(); m.setCase('cont');
        const before = m.view().S;
        m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0.1, s: 0.3 }] });
        assert.notEqual(m.view().S, before);
        assert.ok(Math.abs(m.view().S.peak - 1 / (0.3 * Math.sqrt(2 * Math.PI))) < 1e-3);
    });
    it('the window holds during a drag, grows when pressed, recomputes on release', () => {
        const m = createModel(); m.setCase('cont');
        const w0 = { ...m.view().win };
        m.hold(true);
        m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0, s: 0.19 }] });   // slightly narrower: no change
        assert.deepEqual(m.view().win, w0);
        m.setShape({ kind: 'mix', comps: [{ w: 1, m: 0, s: 0.02 }] });   // peak far above the top: grows
        assert.ok(m.view().win.y1 > w0.y1);
        m.hold(false);
        assert.ok(m.view().win.x1 < w0.x1);                             // refit to the narrow shape
    });
});
```

- [ ] **Step 2: Run** — `node --test src/lib/prob/model.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/prob/model.js`**

```js
// ================================================================
//  Probability model shared by figures: the case, the distribution
//  (an editable pmf on 1..8, or an editable density shape), its
//  samples, and the plotting window. Pure: no DOM.
// ================================================================

import { softmax, withProb, shapeMoments, cdfOf, sampleShape } from './dist.js';

const norm = p => { const Z = p.reduce((a, b) => a + b, 0); return p.map(v => v / Z); };
const MIN_P = 0.01;

export const DISC_PRESETS = {
    default:  { label: 'default', p: softmax([1.9, 0.2, 1.1, -0.6, 0.7, -1.3, 0.1, -0.3], 1) },
    unimodal: { label: 'unimodal', p: norm([0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05]) },
    uniform:  { label: 'uniform', p: norm([1, 1, 1, 1, 1, 1, 1, 1]) },
    peaked:   { label: 'peaked', p: norm([0.02, 0.03, 0.05, 0.62, 0.13, 0.07, 0.05, 0.03]) },
    bimodal:  { label: 'bimodal', p: norm([0.05, 0.28, 0.09, 0.03, 0.03, 0.09, 0.28, 0.15]) },
    zipf:     { label: 'zipf', p: norm([1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8]) },
};
export const CONT_PRESETS = {
    gauss:   { label: 'Gaussian', shape: { kind: 'mix', comps: [{ w: 1, m: 0, s: 0.2 }] } },
    bimodal: { label: 'Bimodal', shape: { kind: 'mix', comps: [{ w: .62, m: -.35, s: .13 }, { w: .38, m: .4, s: .2 }] } },
    steps:   { label: 'Steps', shape: { kind: 'steps', ts: [-.55, -.3, -.1, .1, .3, .55], ms: [.1, .28, .34, .18, .1] } },
    uniform: { label: 'Uniform', shape: { kind: 'steps', ts: [-0.35, 0.35], ms: [1] } },
};

// Plot window for a shape: its ±4.2σ, widened to each component's ±4σ or past
// the outer step points, with room above f = 1 and above the peak.
function fitWindow(shape, peak) {
    const { mean, sd } = shapeMoments(shape);
    let x0 = mean - 4.2 * sd, x1 = mean + 4.2 * sd;
    if (shape.kind === 'mix') {
        for (const c of shape.comps) { x0 = Math.min(x0, c.m - 4 * c.s); x1 = Math.max(x1, c.m + 4 * c.s); }
    } else {
        const a = shape.ts[0], b = shape.ts[shape.ts.length - 1], pad = 0.15 * (b - a);
        x0 = Math.min(x0, a - pad); x1 = Math.max(x1, b + pad);
    }
    return { x0, x1, y1: Math.max(1.1, peak * 1.12) };
}
function growWindow(win, shape, peak) {
    if (peak > 0.92 * win.y1) win.y1 = peak * 1.15;
    const span = win.x1 - win.x0, edge = 0.04 * span;
    const xs = shape.kind === 'steps' ? shape.ts : shape.comps.map(c => c.m);
    if (Math.min(...xs) < win.x0 + edge) win.x0 -= 0.1 * span;
    if (Math.max(...xs) > win.x1 - edge) win.x1 += 0.1 * span;
}

export function createModel() {
    const subs = [];
    let S = null, win = null, held = false;
    const m = {
        kase: 'disc', discKey: 'default', contKey: 'gauss',
        p: DISC_PRESETS.default.p.slice(),
        shape: structuredClone(CONT_PRESETS.gauss.shape),
    };
    const resample = () => {
        S = sampleShape(m.shape);
        if (held && win) growWindow(win, m.shape, S.peak); else win = fitWindow(m.shape, S.peak);
    };
    const changed = () => subs.forEach(f => f());
    resample();

    m.subscribe = fn => { subs.push(fn); };
    m.setCase = k => { m.kase = k; changed(); };
    m.setPreset = key => {
        if (m.kase === 'disc') { m.discKey = key; m.p = DISC_PRESETS[key].p.slice(); }
        else { m.contKey = key; m.shape = structuredClone(CONT_PRESETS[key].shape); resample(); }
        changed();
    };
    m.editPmf = (i, target) => { m.p = withProb(m.p, i, target, MIN_P); m.discKey = 'custom'; changed(); };
    m.setShape = shape => { m.shape = shape; m.contKey = 'custom'; resample(); changed(); };
    m.hold = on => { held = on; if (!on) { win = fitWindow(m.shape, S.peak); changed(); } };
    m.view = () => m.kase === 'disc'
        ? { disc: true, p: m.p, F: cdfOf(m.p), n: m.p.length, xRange: [0.5, m.p.length + 0.5] }
        : { disc: false, shape: m.shape, S, win, xRange: [win.x0, win.x1] };
    return m;
}
```

- [ ] **Step 4: Run** — `node --test src/lib/prob/model.test.js` → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/prob/model.js src/lib/prob/model.test.js && git commit -m "prob lib: shared distribution model"`

---

### Task 3: The (x, u) position

**Files:**
- Create: `src/lib/prob/position.js`, `src/lib/prob/position.test.js`

**Interfaces:**
- Consumes: `model.view()` (Task 2); `discCdfAt`, `discQuantile`, `atX`, `atU`, `lerp`, `clamp` (Task 1).
- Produces: `createPosition(model) -> pos` with fields `x`, `u`, `driver` ('x' | 'u'), and methods `setX(x)`, `setU(u)`, `refresh()` (recompute the non-driving coordinate after a model change; keep the driving one, clamped to the new range).

- [ ] **Step 1: Write the failing tests** (`src/lib/prob/position.test.js`)

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { createPosition } from './position.js';

describe('position', () => {
    it('discrete: setX counts an atom once x reaches it', () => {
        const m = createModel(), pos = createPosition(m), F = m.view().F;
        pos.setX(0.99); assert.equal(pos.u, 0);
        pos.setX(1); assert.ok(Math.abs(pos.u - F[1]) < 1e-12);
        pos.setX(1.5); assert.ok(Math.abs(pos.u - F[1]) < 1e-12);
        assert.equal(pos.driver, 'x');
    });
    it('discrete: setU puts x on the atom whose block holds u', () => {
        const m = createModel(), pos = createPosition(m), F = m.view().F;
        pos.setU((F[2] + F[3]) / 2); assert.equal(pos.x, 3);
        pos.setU(0); assert.equal(pos.x, 0.5);
        pos.setU(1); assert.equal(pos.x, 8);
        assert.equal(pos.driver, 'u');
    });
    it('continuous: setX and setU are inverse', () => {
        const m = createModel(); m.setCase('cont');
        const pos = createPosition(m);
        pos.setU(0.3); const x = pos.x;
        pos.setX(x); assert.ok(Math.abs(pos.u - 0.3) < 1e-4);
    });
    it('the driver is kept across a model change', () => {
        const m = createModel(), pos = createPosition(m);
        pos.setX(2.5);
        m.editPmf(0, 0.1); pos.refresh();
        assert.equal(pos.x, 2.5);
        assert.ok(Math.abs(pos.u - m.view().F[2]) < 1e-12);
        pos.setU(0.6);
        m.editPmf(0, 0.7); pos.refresh();
        assert.equal(pos.u, 0.6);
        assert.equal(pos.x, 1);                 // u = 0.6 now falls in atom 1's block
    });
    it('switching case keeps the position in range', () => {
        const m = createModel(), pos = createPosition(m);
        pos.setX(7.9);
        m.setCase('cont'); pos.refresh();
        const [a, b] = m.view().xRange;
        assert.ok(pos.x >= a && pos.x <= b && pos.u >= 0 && pos.u <= 1);
    });
});
```

- [ ] **Step 2: Run** — FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/prob/position.js`**

```js
// ================================================================
//  The (x, u) position shared by figures. Whichever of x, u was set
//  last drives: u = F_X(x) (right-continuous) or x = F_X⁻¹(u)
//  (generalized inverse). Pure: no DOM.
// ================================================================

import { clamp, discCdfAt, discQuantile, atX, atU, lerp } from './dist.js';

export function createPosition(model) {
    const pos = { x: 0, u: 0, driver: 'x' };
    const fromX = () => {
        const v = model.view(), [a, b] = v.xRange;
        pos.x = clamp(pos.x, a, b);
        pos.u = v.disc ? discCdfAt(v.F, pos.x) : lerp(v.S.Fs, atX(v.S, pos.x));
    };
    const fromU = () => {
        const v = model.view();
        pos.u = clamp(pos.u, 0, 1);
        if (v.disc) { const k = discQuantile(v.F, pos.u); pos.x = k === 0 ? 0.5 : k; }
        else pos.x = clamp(lerp(v.S.xs, atU(v.S, pos.u)), v.xRange[0], v.xRange[1]);
    };
    pos.setX = x => { pos.driver = 'x'; pos.x = x; fromX(); };
    pos.setU = u => { pos.driver = 'u'; pos.u = u; fromU(); };
    pos.refresh = () => (pos.driver === 'x' ? fromX() : fromU());
    pos.setX(4.1);
    return pos;
}
```

- [ ] **Step 4: Run** — PASS. Also `make test`.
- [ ] **Step 5: Commit** — `git add src/lib/prob/position.* && git commit -m "prob lib: shared (x, u) position"`

---

### Task 4: SVG region helper

**Files:**
- Create: `src/lib/prob/region.js`, `src/lib/prob/region.test.js`

**Interfaces:**
- Produces: `el(tag, attrs, parent)`, `txt(parent, x, y, s, cls, attrs)` (with `_c`/`_{..}` subscripts and `^c`/`^{..}` superscripts), `niceTicks(a, b, n)`, `tf(v)`, `fmt(v, d)`, `class Region { constructor(svgCtx, { ox, oy, w, h, m }); domain(x0, x1, y0, y1); X(x); Y(y); invX(px); invY(py); inX(x); inY(y); axes(o); path(pts, cls, g); area(pts, cls, g); rect(xa, ya, xb, yb, cls, g); vline(x, cls, g); hline(y, cls, g); gAbove(); gBelow(); clear(); }`, `svgContext(svg, W, H) -> { svg, defs, root }`, `svgPoint(svg, event) -> { x, y }`.
- Port: prototype lines 249–340 (`el`, `txt`, `rich`, `niceTicks`, `tf`, `Region`), adding `invX`, `invY`, `clear`, and the `o.noyl`, `o.noZero`, `o.xnow` axis options it already uses.

- [ ] **Step 1: Write the failing tests** for the pure parts (`niceTicks`, `tf`, `fmt`)

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, tf, fmt } from './region.js';

describe('region helpers', () => {
    it('niceTicks picks 1-2-5 steps inside the range', () => {
        assert.deepEqual(niceTicks(0, 1, 4), [0, 0.2, 0.4, 0.6, 0.8, 1]);
        assert.deepEqual(niceTicks(-0.85, 0.85, 6), [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8]);
    });
    it('tf and fmt use a typographic minus and no −0', () => {
        assert.equal(tf(-0.25), '−0.25');
        assert.equal(tf(1e-12), '0');
        assert.equal(fmt(-0.0001, 3), '0.000');
        assert.equal(fmt(-1.5, 2), '−1.50');
        assert.equal(fmt(Infinity), '∞');
    });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3:** port the prototype code into `region.js` as ES exports (the DOM-dependent functions are fine to define in Node as long as they are not called at import time). **Step 4:** PASS. **Step 5: Commit** — `git commit -m "prob lib: multi-panel SVG region helper"`

---

### Task 5: p_X drag editor through a coordinate adapter

**Files:**
- Create: `src/lib/prob/edit.js`

**Interfaces:**
- Consumes: `model` (Task 2), `setPeak`, `setBreak`, `setLevel`, `clamp` (dist.js), `el` (region.js).
- Produces: `createEditor({ svg, model, adapter, onHold })` returning `{ draw(group), hitTest(pt) -> handle | null, begin(handle, pt), move(pt), end() }` where
  - `adapter.toScreen(x, d) -> [px, py]` and `adapter.fromScreen(px, py) -> [x, d]` map an (outcome, density) pair to viewBox pixels for one p_X panel in either orientation; `adapter.frame()` returns the current `{ x0, x1, d0, d1 }` so drags map through the grab-time frame (entropy post rule);
  - discrete handles: each lollipop head; dragging sets `model.editPmf(k − 1, d)`;
  - continuous handles: mixture peaks (`setPeak`, x from the drag, height from the drag); step points (`setBreak`, x only); chunk tops (`setLevel`, height only; hit anywhere within 9 px of a top edge);
  - `onHold(true/false)` is called at begin/end so the figure wiring can call `model.hold`.
- The figures call `hitTest` first on pointerdown; only when it returns null do they start a position drag.
- Port the behavior of `src/differential-entropy/density-edit.js` (handles, grab offset, frame at grab, level drags with zero offset, `CURSOR` map), replacing `P.X/P.Y/P.invX/P.invY` with the adapter.

- [ ] **Step 1: Implement** (DOM code, verified in the browser in Task 7; no unit test, like the other DOM modules in this repo).
- [ ] **Step 2: Commit** — `git commit -m "prob lib: p_X drag editor through a coordinate adapter"`

---

### Task 6: The post, its bar, and both figures

**Files:**
- Create: `content/posts/2026-09-29-expectation.md`, `assets/css/expectation.css`, `src/expectation/index.js`, `src/expectation/main.js`, `src/expectation/controls.js`, `src/expectation/fig-area.js`, `src/expectation/fig-transform.js`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `createAreaFigure(svg, { model, pos, ui, onChange }) -> { draw() }` — port of prototype `drawD` (lines 486–641) with its zone drags (lines 829–880), p_X handles in the top-right panel via `createEditor`.
  - `createTransformFigure(svg, { model, pos, ui, onChange }) -> { draw() }` — port of prototype `drawT` (lines 642–777) with its drags (lines 880–901); p_X handles in the p_X panel via `createEditor`, adapter chosen by orientation.
  - `ui` = `{ g: 'neglog' | 'p' | 'x' | 'x2', ghost: boolean, dk: 3..6, orient: 'x' | 'u' }` owned by `controls.js`.
  - `main.js`: one model, one position; `model.subscribe(() => { pos.refresh(); drawAll(); })`; controls call `drawAll`.
- Markdown (front matter `title: Expectation as an area`, `date: 2026-09-29`, `tags: [exploration]`, `unlisted: true`, `js: [src/expectation]`, `css: [assets/css/expectation.css]`): the three math blocks of the spec (case-dependent pieces wrapped in `<span class="ex-disc">` / `<span class="ex-cont">`, toggled by `body[data-case]` from `main.js`), then the bar and Figure 1 inside `::: {.wide .extra-wide}` raw html, then the second math block, then Figure 2 with its orientation toggle.

- [ ] **Step 1:** write the markdown and CSS (port the prototype's `.bar`, `.seg`, `.btn`, SVG mark classes, prefixing tokens `--ex-`; drop its page-level typography, which the site theme provides).
- [ ] **Step 2:** write `controls.js` (case, distribution select filled from the presets, g select, δ slider, ghost checkbox, play x/u, atom steps, readouts; port prototype lines 780–829).
- [ ] **Step 3:** write `fig-area.js` and `fig-transform.js`, importing from `src/lib/prob/`.
- [ ] **Step 4:** write `main.js` and `index.js` (the entropy post's `index.js` pattern).
- [ ] **Step 5:** `make -j4` → builds with no warnings; `make test` → all pass.
- [ ] **Step 6: Commit** — `git commit -m "expectation: post with the area and transform figures"`

---

### Task 7: Browser verification

**Files:**
- Create (scratch, not committed): a CDP driver script in the session scratchpad, following the session's `drive*.mjs` pattern.

- [ ] **Step 1:** serve `_site` on 127.0.0.1:4011 and load `/posts/expectation/`.
- [ ] **Step 2:** check, in both cases (and both orientations for Figure 2): every drag zone moves the shared position and both figures agree (readouts); a lollipop drag and a mixture peak drag change p_X in both figures; a step-point drag on Steps; E[g(X)] appears only at u = 1; no console errors.
- [ ] **Step 3:** screenshot each figure in each state and inspect them.
- [ ] **Step 4:** fix anything found, re-run, commit fixes (`git commit -m "expectation: fixes from browser check"`).
