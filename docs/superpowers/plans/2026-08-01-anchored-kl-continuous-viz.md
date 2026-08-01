# Anchored-KL Continuous-Potential Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An interactive visualization of the anchored optimum for a continuous potential φ ∈ [0, 1] — a compact, fully independent second instance of the binary viz (draggable continuous potential bars) plus the "softened potential" reshaping-curve plot — replacing the post's TODO block.

**Architecture:** Pure math (nested-bisection solver) goes in `model.js` (tested). Shared slider/readout helpers are extracted from `main.js` into a new `controls.js` so two instances can use them without duplicating; `main.js` keeps the binary instance unchanged in behavior. A new `main-continuous.js` holds the continuous instance's own state (prior, φ, β, K — nothing linked to the binary section). `drawing.js` gains `drawReshapeCurve` plus two small backward-compatible options (`layoutMain` potential-column width; `drawHBarCol` uniform-reference suppression). The markdown section replaces the TODO with a sticky controls bar, the columns canvas, and the curve canvas.

**Tech Stack:** Vanilla ES modules (esbuild bundle), canvas 2D, `node --test`, Pandoc markdown with the `viz-mount.lua` filter and per-page MathJax macros (`\potential`, `\prior`, `\proposal`, `\Z`, `\str` all exist).

## Global Constraints

- Node 20+ and Pandoc; build `make -j4`, tests `make test` (or `node --test src/anchored-kl/model.test.js`), dev server `make serve`.
- 4-space indentation, single quotes, trailing semicolons; match existing `src/anchored-kl/*.js` style including `// ---` section comments.
- No Co-Authored-By lines in commits; lowercase descriptive commit messages.
- **Fully separate state**: nothing (prior, φ, β, K) may be linked between the binary and continuous instances.
- **No behavior change to the binary section** — Task 2 is a behavior-preserving refactor; every existing interaction (sliders, dots, painting, bar drags, K chip) must work identically after it.
- DOM ids for the new section are namespaced `akl-c-*` / `cv-akl-c-*` exactly as written in Tasks 4–5.
- Spec: `docs/superpowers/specs/2026-08-01-anchored-kl-continuous-viz-design.md`. One deliberate deviation from the spec's code-structure list: `bindBetaDot` is NOT extracted to `controls.js` — the continuous instance has no draggable β dots (spec's own YAGNI list), so `bindBetaDot` keeps its single consumer in `main.js`. The generic helpers that ARE shared: slider mapping, tick labels, accent color, formatters, `dotHit`, and the K-dropdown close handler.

---

### Task 1: Continuous solver in model.js + defaultPhi in config.js (TDD)

**Files:**
- Modify: `src/anchored-kl/model.js` (append at end)
- Modify: `src/anchored-kl/config.js` (append at end)
- Test: `src/anchored-kl/model.test.js` (append; extend imports)

**Interfaces:**
- Consumes: existing `normalize`, `anchoredOptimum` from `model.js`; `DEFAULT_K`, `defaultPrior`, `defaultValid` from `config.js`.
- Produces (used by Task 5):
  - `contOptimum(prior, phi, beta) -> { q, rOf, softened, c, eps, Z }` — `q` normalized optimum array; `rOf(x)` the ratio curve `g⁻¹` on [0, 1]; `softened(x) = rOf(x)/rOf(1)` in (0, 1]; `c` the multiplier (NaN at endpoints/degenerate); `eps = softened(0)`; `Z = Σ p·φ`.
  - `defaultPhi(k) -> number[]` — smooth increasing sigmoid ramp in (0, 1), length k.

- [ ] **Step 1: Write the failing tests**

Extend the imports in `src/anchored-kl/model.test.js`:

```js
import { MIN_P, DEFAULT_K, defaultPrior, defaultValid, defaultPhi } from './config.js';
import { normalize, withProb, solveAlpha, betaOfAlpha, epsBeta, anchoredOptimum, bernKL, fOfAlpha, fPrimeOfAlpha, bernKLPrime, contOptimum } from './model.js';
```

(Keep any existing imported names; only add `defaultPhi` and `contOptimum`.) Append at the end of the file:

```js
const phiRamp = defaultPhi(DEFAULT_K);

test('defaultPhi is an increasing ramp strictly inside (0, 1)', () => {
    for (let kk = 2; kk <= 40; kk++) {
        const f = defaultPhi(kk);
        assert.equal(f.length, kk);
        f.forEach(v => assert.ok(v > 0 && v < 1, `phi in (0,1), got ${v}`));
        for (let i = 1; i < kk; i++) {
            assert.ok(f[i] > f[i - 1], `ramp increasing at ${i}`);
        }
    }
});

test('contOptimum with binary phi recovers anchoredOptimum', () => {
    const phi = valid.map(v => (v ? 1 : 0));
    for (const beta of [0.05, 0.5, 2, 20]) {
        const bin = anchoredOptimum(prior, valid, beta);
        const cont = contOptimum(prior, phi, beta);
        cont.q.forEach((v, i) => close(v, bin.q[i], 1e-6));
        close(cont.eps, bin.eps, 1e-6);
        close(cont.Z, bin.Z, 1e-9);
    }
});

test('contOptimum endpoints: posterior at beta = 0, prior at beta = infinity', () => {
    const posterior = normalize(prior.map((p, i) => p * phiRamp[i]));
    contOptimum(prior, phiRamp, 0).q.forEach((v, i) => close(v, posterior[i], 1e-9));
    contOptimum(prior, phiRamp, Infinity).q.forEach((v, i) => close(v, prior[i], 1e-9));
    // the limits are approached continuously
    contOptimum(prior, phiRamp, 1e-4).q.forEach((v, i) => close(v, posterior[i], 1e-3));
    contOptimum(prior, phiRamp, 1e5).q.forEach((v, i) => close(v, prior[i], 1e-3));
});

test('contOptimum is normalized and satisfies stationarity', () => {
    for (const beta of [0.1, 1, 10]) {
        const { q, c, Z } = contOptimum(prior, phiRamp, beta);
        close(sum(q), 1, 1e-9);
        // phi_i = Z * r_i * (beta*log r_i + c) at the solution
        q.forEach((v, i) => {
            const r = v / prior[i];
            close(phiRamp[i], Z * r * (beta * Math.log(r) + c), 1e-5);
        });
    }
});

test('softened potential is monotone, floored at eps, topped at 1', () => {
    for (const beta of [0.1, 1, 10]) {
        const { softened, eps } = contOptimum(prior, phiRamp, beta);
        close(softened(0), eps, 1e-9);
        close(softened(1), 1, 1e-9);
        assert.ok(eps > 0 && eps < 1, `floor in (0,1), got ${eps}`);
        let prev = -1;
        for (let i = 0; i <= 50; i++) {
            const v = softened(i / 50);
            assert.ok(v >= prev - 1e-12, `softened monotone at ${i / 50}`);
            prev = v;
        }
    }
});

test('contOptimum degenerate all-zero phi falls back to the prior', () => {
    const zero = prior.map(() => 0);
    contOptimum(prior, zero, 0.5).q.forEach((v, i) => close(v, prior[i]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/anchored-kl/model.test.js`
Expected: FAIL — `does not provide an export named 'defaultPhi'` (config.js) or `'contOptimum'` (model.js).

- [ ] **Step 3: Implement**

Append to `src/anchored-kl/config.js`:

```js
// Default continuous potential for support size k: a smooth increasing
// ramp (sigmoid in the element index) spanning ~0.05 to ~0.95, so both
// the floor and the top compression of the softened potential show.
export const defaultPhi = k => Array.from({ length: k }, (_, i) => {
    const t = (i - (k - 1) / 2) / (k / 6);
    return 0.05 + 0.9 / (1 + Math.exp(-t));
});
```

Append to `src/anchored-kl/model.js`:

```js
// --- Continuous potential ---
// Stationarity of the anchored objective gives, per element, with
// r = q*/p and one global constant c fixed by normalization:
//     phi = Z * r * (beta*log r + c)  =: g(r),
// on the increasing branch r >= exp(-c/beta) (where g = 0). So the
// optimum is q* = p * gInverse(phi): elements enter only through their
// potential value, via one monotone reshaping curve.

// Solve g(r) = phi for r on the increasing branch: bisection with an
// expanding upper bracket (g is strictly increasing there).
function rOfPhiAt(phi, Z, beta, c) {
    const r0 = Math.exp(-c / beta); // g(r0) = 0
    if (phi <= 0) return r0;
    const g = r => Z * r * (beta * Math.log(r) + c);
    let hi = Math.max(r0 * 2, 1);
    while (g(hi) < phi) hi *= 2;
    let lo = r0;
    for (let it = 0; it < 80; it++) {
        const mid = (lo + hi) / 2;
        if (g(mid) < phi) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

// The anchored optimum for a continuous potential phi (values in [0, 1])
// and beta in [0, Infinity]. Returns { q, rOf, softened, c, eps, Z }:
// q the normalized optimum, rOf the ratio curve gInverse on [0, 1],
// softened(x) = rOf(x)/rOf(1) the displayed softened potential (so
// softened(0) = eps generalizes the binary floor), c the multiplier.
// Total mass sum p_i * r_i(c) is strictly decreasing in c, so the outer
// bisection on c is well posed; brackets are found by doubling steps.
export function contOptimum(prior, phi, beta) {
    const p = normalize(prior);
    const Z = p.reduce((s, v, i) => s + v * phi[i], 0);
    const flat = { rOf: () => 1, softened: () => 1, c: NaN, eps: 1, Z };
    if (Z <= 0) return { q: p.slice(), ...flat };           // no valid mass
    if (beta === Infinity) return { q: p.slice(), ...flat }; // the prior
    if (beta === 0) {
        // the exact posterior; r is linear in phi
        return {
            q: normalize(p.map((v, i) => v * phi[i])),
            rOf: x => x / Z,
            softened: x => x,
            c: NaN, eps: 0, Z,
        };
    }
    const T = c => p.reduce((s, v, i) => s + v * rOfPhiAt(phi[i], Z, beta, c), 0);
    let cLo = 0, cHi = 0, step = 1;
    while (T(cLo) < 1) { cLo -= step; step *= 2; }
    step = 1;
    while (T(cHi) > 1) { cHi += step; step *= 2; }
    for (let it = 0; it < 80; it++) {
        const mid = (cLo + cHi) / 2;
        if (T(mid) > 1) cLo = mid; else cHi = mid;
    }
    const c = (cLo + cHi) / 2;
    const rOf = x => rOfPhiAt(x, Z, beta, c);
    const r1 = rOf(1);
    const softened = x => rOf(x) / r1;
    return {
        q: normalize(p.map((v, i) => v * rOf(phi[i]))), // tidy bisection residue
        rOf, softened, c, eps: softened(0), Z,
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `make test`
Expected: PASS (all existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/anchored-kl/model.js src/anchored-kl/config.js src/anchored-kl/model.test.js
git commit -m "add continuous-potential solver and default ramp potential"
```

---

### Task 2: Extract shared controls.js (behavior-preserving refactor)

**Files:**
- Create: `src/anchored-kl/controls.js`
- Modify: `src/anchored-kl/main.js`
- Modify: `src/anchored-kl/index.js`

**Interfaces:**
- Consumes: `BETA_MIN`, `BETA_MAX` from `config.js`.
- Produces (used by `main.js` now and Task 5's `main-continuous.js`):
  - `SLIDER_MAX: number` (1000)
  - `sliderToBeta(v: number) -> number`, `betaToSlider(b: number) -> number`
  - `buildTickLabels() -> void` (populates every `.akl-slider-ticks`)
  - `accentColor(beta: number) -> string` — NOTE: now takes β as a parameter (the old `main.js` version read module state)
  - `fmtBeta(b) -> string`, `fmtProb(v) -> string`
  - `dotHit(hit, pos) -> boolean`
  - `bindDropdownClose() -> void` (close-on-outside-click for every `.akl-k-dropdown`; call ONCE per page)

- [ ] **Step 1: Create `src/anchored-kl/controls.js`**

```js
// ================================================================
//  Anchored forward KL — controls.js
//  Slider/readout helpers shared by the binary (main.js) and
//  continuous (main-continuous.js) instances. Pure functions and
//  DOM-generic utilities only: no per-instance state lives here.
// ================================================================

import { BETA_MIN, BETA_MAX } from './config.js';

// ---- Beta slider mapping ----
// Log scale over [BETA_MIN, BETA_MAX] with the exact endpoints
// snapping to beta = 0 (posterior) and beta = infinity (prior).

export const SLIDER_MAX = 1000;

export function sliderToBeta(v) {
    if (v <= 0) return 0;
    if (v >= SLIDER_MAX) return Infinity;
    return BETA_MIN * Math.pow(BETA_MAX / BETA_MIN, v / SLIDER_MAX);
}

export function betaToSlider(b) {
    if (b === 0) return 0;
    if (b === Infinity) return SLIDER_MAX;
    const f = Math.log(b / BETA_MIN) / Math.log(BETA_MAX / BETA_MIN);
    return Math.round(Math.max(0, Math.min(1, f)) * SLIDER_MAX);
}

const THUMB_W = 14; // keep in sync with the slider thumb width in the CSS
const thumbX = f => `calc(${THUMB_W / 2}px + ${f} * (100% - ${THUMB_W}px))`;

export function buildTickLabels() {
    // 1 is the log-midpoint of [BETA_MIN, BETA_MAX]
    const ticks = [['0', 0], ['1', 0.5], ['∞', 1]];
    document.querySelectorAll('.akl-slider-ticks').forEach(wrap => {
        wrap.replaceChildren(...ticks.map(([text, f]) => {
            const s = document.createElement('span');
            s.textContent = text;
            s.style.left = thumbX(f);
            return s;
        }));
    });
}

// Thumb accent for a given beta: valid blue at beta = 0 (posterior)
// fading to neutral gray at beta = infinity (prior). The rgb triples
// mirror VALID_COLOR and NEUTRAL_COLOR in config.js.
export function accentColor(beta) {
    const f = betaToSlider(beta) / SLIDER_MAX;
    const a = [41, 128, 185], b = [150, 156, 164];
    const rgb = [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * f));
    return `rgb(${rgb.join(',')})`;
}

// ---- Readout formatting ----

const typeset = s => s.replace('-', '−');

export function fmtBeta(b) {
    if (b === 0) return '0';
    if (b === Infinity) return '∞';
    return typeset(Number(b.toPrecision(3)).toString());
}

export const fmtProb = v => {
    if (v === 0) return '0';
    if (v === 1) return '1';
    if (v < 1e-3) return typeset(v.toExponential(2));
    return typeset(Number(v.toPrecision(3)).toString());
};

// ---- Shared hit-testing ----

export function dotHit(hit, pos) {
    if (!hit) return false;
    const dots = hit.dots || (hit.dot ? [hit.dot] : []);
    return dots.some(d =>
        Math.abs(pos.x - d.x) < 12 && Math.abs(pos.y - d.y) < 14);
}

// ---- K dropdown chips ----
// Close a chip's floating panel on any click outside it. Call once.

export function bindDropdownClose() {
    document.querySelectorAll('.akl-k-dropdown').forEach(drop =>
        document.addEventListener('pointerdown', e => {
            if (drop.open && !drop.contains(e.target)) drop.open = false;
        }));
}
```

- [ ] **Step 2: Slim `main.js` to consume it**

All of these are DELETIONS of now-duplicated code plus mechanical call-site updates — behavior must be identical:

1. Add the import (after the drawing.js import):

```js
import {
    SLIDER_MAX, sliderToBeta, betaToSlider, buildTickLabels,
    accentColor, fmtBeta, fmtProb, dotHit,
} from './controls.js';
```

2. Delete from `main.js`: the entire "BETA SLIDER" block (the `SLIDER_MAX` const through `accentColor`, including `THUMB_W`, `thumbX`, `buildTickLabels`) and the entire "READOUTS" block (`typeset`, `fmtBeta`, `fmtProb`), and the `dotHit` function. Keep the section banner comments out too (the code now lives in controls.js).
3. Update every `accentColor()` call to `accentColor(beta)` — there are five: the `drawSegment` dotColor, the two in the `[slider, sliderF].forEach` sync block (one call, inside the loop), the `drawAlphaCurve` dotColor in `redrawMargin`, and the `drawFPlot` dotColor in `redrawF`.
4. Delete the K-dropdown block from `init()` (the `const kDrop = ...` through its closing `}`) — replaced by `bindDropdownClose()` in index.js.
5. Delete the `buildTickLabels();` call at the bottom of `init()` — index.js now calls it.

- [ ] **Step 3: Update `index.js`**

```js
// ================================================================
//  Anchored forward KL — index.js
//  Entry point: esbuild bundles this to /assets/js/anchored-kl.bundle.js.
// ================================================================

import { init } from './main.js';
import { buildTickLabels, bindDropdownClose } from './controls.js';

function boot() {
    init();
    buildTickLabels();
    bindDropdownClose();
}

if (document.readyState !== 'loading') {
    boot();
} else {
    document.addEventListener('DOMContentLoaded', boot);
}
```

- [ ] **Step 4: Verify**

Run: `node --check src/anchored-kl/main.js && node --check src/anchored-kl/controls.js && make test && make -j4`
Expected: all clean; 272 tests pass (Task 1's count); bundle builds. Also `grep -n 'SLIDER_MAX\s*=\|function accentColor\|function buildTickLabels\|function dotHit\|fmtBeta\|fmtProb' src/anchored-kl/main.js` must show only the import line (no local definitions remain).

- [ ] **Step 5: Commit**

```bash
git add src/anchored-kl/controls.js src/anchored-kl/main.js src/anchored-kl/index.js
git commit -m "extract shared slider/readout helpers into controls.js"
```

---

### Task 3: drawReshapeCurve + small drawing.js options

**Files:**
- Modify: `src/anchored-kl/drawing.js`

**Interfaces:**
- Consumes: file-local `SANS`, `IT`, `drawLabel` (already defined in drawing.js).
- Produces (used by Task 5):
  - `drawReshapeCurve(ctx, w, h, data) -> {} | null` with `data = { curve: [{x, y}], eps: number, dots: [{x, y, color}] }`.
  - `layoutMain(w, h, k, opts?)` — new optional 4th arg `{ potW = 54 }` (existing callers unchanged).
  - `drawHBarCol(..., opts)` — new optional `opts.uniformRef: false` suppresses the dashed 1/K reference line (default behavior unchanged).

No unit tests (canvas code is untested in this repo); checks are `node --check` and the suite staying green.

- [ ] **Step 1: Make `layoutMain`'s potential-column width an option**

Change the signature line and the `potW` constant:

```js
export function layoutMain(w, h, k, { potW = 54 } = {}) {
    const top = 34, bottom = 24, left = 10, right = 12, gap = 26;
```

(delete the old `const potW = 54;` line; everything else in the function stays).

- [ ] **Step 2: Make the uniform reference line suppressible in `drawHBarCol`**

Change the guard around the dashed uniform-distribution block from

```js
    if (1 / k <= opts.xmax) {
```

to

```js
    if (opts.uniformRef !== false && 1 / k <= opts.xmax) {
```

- [ ] **Step 3: Add `drawReshapeCurve`** (append after `drawFPlot`, before `drawSegment`)

```js
// --- Reshaping curve: the softened potential over the raw potential ---
// The continuous-case analogue of the segment diagram. The anchored
// optimum is q* = p · r(φ) for one increasing ratio curve r, so up to
// normalization it is the exact posterior for the softened potential
// φ̃(φ) = r(φ)/r(1) ∈ (0, 1]: the identity at beta = 0, flat 1 at
// beta = ∞, floored at φ̃(0) = ε_β. data:
//   curve — [{x, y}] samples of φ̃ over x in [0, 1], x increasing
//   eps   — the floor φ̃(0) (dashed reference, skipped when ≈ 1)
//   dots  — [{x, y, color}] the configured potential values on the curve
// Returns {} (nothing draggable here), or null if the area is too small.

export function drawReshapeCurve(ctx, w, h, data) {
    const left = 34, right = 14, top = 10, bottom = 22;
    const W = w - left - right, H = h - top - bottom;
    if (W < 40 || H < 40) return null;
    const xOf = x => left + x * W;
    const yOf = y => top + (1 - y) * H;

    // spines: left and bottom
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + H);
    ctx.lineTo(left + W, top + H);
    ctx.stroke();

    // ticks and axis labels: raw potential r along x, softened r-tilde up y
    ctx.font = '9px ' + SANS;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ty = top + H + 5;
    ctx.fillText('0', xOf(0), ty);
    ctx.fillText('1', xOf(1), ty);
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('r', xOf(0.5), ty);
    ctx.font = '9px ' + SANS;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', left - 4, yOf(1));
    ctx.fillText('0', left - 4, yOf(0));
    drawLabel(ctx, left - 16, yOf(0.5) + 4, [
        { text: 'r̃', font: 'italic 11px Georgia, serif', color: '#999' },
    ]);

    // dashed identity diagonal: the beta -> 0 limit (exact conditioning)
    ctx.save();
    ctx.strokeStyle = '#ddd';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    ctx.lineTo(xOf(1), yOf(1));
    ctx.stroke();
    ctx.restore();

    // dashed floor at eps, labeled in the right margin
    if (data.eps < 0.995) {
        ctx.save();
        ctx.strokeStyle = '#bbb';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(left, yOf(data.eps));
        ctx.lineTo(left + W, yOf(data.eps));
        ctx.stroke();
        ctx.restore();
        ctx.font = 'italic 9px Georgia, serif';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('ε', left + W + 4, yOf(data.eps));
    }

    // the softened-potential curve
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.curve.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(p.x), yOf(p.y));
        else ctx.lineTo(xOf(p.x), yOf(p.y));
    });
    ctx.stroke();

    // the configured potential values, as dots on the curve
    (data.dots || []).forEach(d => {
        ctx.fillStyle = d.color || '#444';
        ctx.beginPath();
        ctx.arc(xOf(d.x), yOf(d.y), 3, 0, 2 * Math.PI);
        ctx.fill();
    });

    return {};
}
```

- [ ] **Step 4: Verify**

Run: `node --check src/anchored-kl/drawing.js && make test && make -j4`
Expected: clean; existing binary viz unaffected (default option values).

- [ ] **Step 5: Commit**

```bash
git add src/anchored-kl/drawing.js
git commit -m "add reshaping-curve renderer and column-layout options"
```

---

### Task 4: Markdown — replace the TODO with the continuous section

**Files:**
- Modify: `content/posts/2026-07-31-anchored-forward-kl.md`

**Interfaces:**
- Produces DOM ids consumed by Task 5: `#cv-akl-c-main`, `#cv-akl-c-reshape`, `#akl-c-beta`, `#akl-c-k`, `#akl-c-readout-beta`, `#akl-c-readout-eps`, `#akl-c-readout-z`, `#akl-c-readout-k`. Reuses classes `.akl-controls`, `.akl-sticky`, `.akl-k-dropdown`, `.akl-k-panel`, `.akl-toolbar-value`, `.akl-controls-label`, `.akl-slider-wrap`, `.akl-slider-ticks`, `.akl-readouts`.

- [ ] **Step 1: Replace the TODO block**

Locate the blockquote near the end of the "A continuous potential" section beginning `> **TODO:** build the visualization of the continuous-potential setting.` (locate by content — line numbers have drifted). Replace the entire blockquote with:

```markdown
Below is the same kind of interactive setup as in the binary section --- except the potential column is now continuous: drag any potential bar to set $\potential(\str)$ anywhere in $[0, 1]$ (the prior bars are draggable as before). This instance is entirely independent of the one above --- a different problem, so nothing is linked.

<div class="akl-controls akl-sticky">
<details class="akl-k-dropdown">
<summary>$K$ = <span class="akl-toolbar-value" id="akl-c-readout-k">10</span></summary>
<div class="akl-k-panel">
<span class="akl-controls-label">support size $K$:</span>
<input type="range" id="akl-c-k" min="2" max="40" value="10">
</div>
</details>
<span class="akl-controls-label">$\beta$:</span>
<div class="akl-slider-wrap">
<input type="range" id="akl-c-beta" min="0" max="1000" value="425">
<div class="akl-slider-ticks"><span>0</span><span>1</span><span>∞</span></div>
</div>
<div class="akl-readouts">
<div><span class="akl-controls-label">$\beta$ =&nbsp;</span><span id="akl-c-readout-beta">0.5</span></div>
<div><span class="akl-controls-label">$\varepsilon_\beta$ =&nbsp;</span><span id="akl-c-readout-eps">–</span></div>
<div><span class="akl-controls-label">$\Z$ =&nbsp;</span><span id="akl-c-readout-z">–</span></div>
</div>
</div>

::: {.viz #cv-akl-c-main canvas="true" height="340px" width="100%"}
:::

Everything the anchor does here is carried by a single monotone curve. The pointwise optimality condition determines the optimum as $\proposal^\star_\beta = \prior \cdot r(\potential)$ for one *increasing* function $r$ --- elements enter only through their potential values --- and normalizing $r$ by its value at $\potential = 1$ gives the **softened potential** $\tilde{\potential}$: the anchored optimum is the exact posterior for the potential $\tilde{\potential}(\potential)$. At $\beta = 0$ the curve is the identity (exact conditioning); as $\beta \to \infty$ it flattens toward the constant $1$ (the prior); in between it *floors* low potentials at $\tilde{\potential}(0) = \varepsilon_\beta$ and *compresses* high ones --- the continuous generalization of $\max\{\potential, \varepsilon_\beta\}$. Watch it below as you move $\beta$; the dots mark the potential values configured above.

::: {.viz #cv-akl-c-reshape canvas="true" height="260px" width="100%"}
:::
```

Layout notes for the implementer: keep one blank line before and after each raw-HTML block and each `:::` fenced div, matching how the binary section's blocks are laid out. Do not touch anything else in the file.

- [ ] **Step 2: Build and check the compiled page**

Run: `make -j4 && grep -c 'cv-akl-c-main\|cv-akl-c-reshape\|akl-c-beta\|softened potential' _site/posts/anchored-forward-kl/index.html`
Expected: build succeeds; count ≥ 4.

- [ ] **Step 3: Commit**

```bash
git add content/posts/2026-07-31-anchored-forward-kl.md
git commit -m "add continuous-potential viz section replacing the todo"
```

---

### Task 5: main-continuous.js instance + index.js boot + CSS scope fix

**Files:**
- Create: `src/anchored-kl/main-continuous.js`
- Modify: `src/anchored-kl/index.js`
- Modify: `assets/css/anchored-kl.css`

**Interfaces:**
- Consumes: `contOptimum`, `normalize`, `withProb` (model.js); `defaultPrior`, `defaultPhi`, `DEFAULT_K`, `DEFAULT_BETA` (config.js); `resetCanvas`, `getPos`, `layoutMain` (with `{ potW }`), `drawHBarCol` (with `uniformRef: false`), `drawReshapeCurve` (drawing.js); `SLIDER_MAX`, `sliderToBeta`, `betaToSlider`, `accentColor(beta)`, `fmtBeta`, `fmtProb` (controls.js); DOM ids from Task 4.
- Produces: `initContinuous()` called from `index.js`.

- [ ] **Step 1: Create `src/anchored-kl/main-continuous.js`**

```js
// ================================================================
//  Anchored forward KL — main-continuous.js
//  The continuous-potential instance: its own state (prior, potential,
//  beta, K), fully separate from the binary instance in main.js. One
//  main canvas with four columns — the potential column is continuous
//  and draggable — plus the softened-potential reshaping curve.
// ================================================================

import {
    DEFAULT_K, DEFAULT_BETA, defaultPrior, defaultPhi,
} from './config.js';
import { normalize, withProb, contOptimum } from './model.js';
import {
    resetCanvas, getPos, layoutMain, drawHBarCol, drawReshapeCurve,
} from './drawing.js';
import {
    SLIDER_MAX, sliderToBeta, betaToSlider, accentColor, fmtBeta, fmtProb,
} from './controls.js';

// ================================================================
//  STATE (nothing here is shared with the binary instance)
// ================================================================

let k = DEFAULT_K;
let probs = normalize(defaultPrior(k));
let phi = defaultPhi(k);
let beta = DEFAULT_BETA;

let L = null;
let cvMain, cvR, slider, kSlider;
let roBeta, roEps, roZ, roK;

// ================================================================
//  REDRAW
// ================================================================

function mainHeight() {
    const rowH = k <= 10 ? 28 : k <= 20 ? 22 : 14;
    return 34 + k * rowH + 26;
}

let dragXmax = null;

function niceXmax(m) {
    return Math.min(1, Math.max(0.1, Math.ceil(m * 1.08 * 20) / 20));
}

// Row color: invalid red at phi = 0 blending to valid blue at phi = 1
// (the binary section's two colors are this scale's endpoints).
function phiColor(v) {
    const red = [192, 57, 43], blue = [41, 128, 185];
    const rgb = [0, 1, 2].map(i => Math.round(red[i] + (blue[i] - red[i]) * v));
    return `rgb(${rgb.join(',')})`;
}

function computePosterior() {
    const Z = probs.reduce((s, p, i) => s + p * phi[i], 0);
    return Z > 0 ? normalize(probs.map((p, i) => p * phi[i])) : probs.slice();
}

function redraw() {
    if (!cvMain) return;
    const { q, softened, eps, Z } = contOptimum(probs, phi, beta);
    const posterior = computePosterior();
    const xmax = dragXmax ?? niceXmax(Math.max(...probs, ...posterior, ...q));
    const colors = phi.map(phiColor);

    {
        const { ctx, w, h } = resetCanvas(cvMain);
        L = layoutMain(w, h, k, { potW: 90 });
        drawHBarCol(ctx, L, L.pot, phi, {
            colors, xmax: 1, title: 'pot', handles: true, uniformRef: false,
        });
        drawHBarCol(ctx, L, L.prior, probs, {
            colors, xmax, title: 'prior', handles: true,
        });
        drawHBarCol(ctx, L, L.post, posterior, {
            colors, xmax, title: 'post',
        });
        drawHBarCol(ctx, L, L.opt, q, {
            colors, xmax, title: 'opt',
        });
    }

    if (cvR) {
        const { ctx, w, h } = resetCanvas(cvR);
        const N = 160;
        const curve = Array.from({ length: N + 1 }, (_, i) => {
            const x = i / N;
            return { x, y: softened(x) };
        });
        const dots = phi.map((v, i) => ({ x: v, y: softened(v), color: colors[i] }));
        drawReshapeCurve(ctx, w, h, { curve, eps, dots });
    }

    if (roBeta) roBeta.textContent = fmtBeta(beta);
    if (roEps) roEps.textContent = fmtProb(eps);
    if (roZ) roZ.textContent = fmtProb(Z);
    if (slider) {
        slider.value = String(betaToSlider(beta));
        slider.style.setProperty('--akl-accent', accentColor(beta));
    }
}

// ================================================================
//  INTERACTION
//  Potential column: drag bar tips to any value in [0, 1].
//  Prior column: drag bar tips horizontally (auto-renormalizing).
// ================================================================

let dragKind = null; // 'phi' | 'bar' | null
let dragIdx = -1;

function inCol(pos, P, pad = 10) {
    return pos.x >= P.x - pad && pos.x <= P.x + P.w + pad;
}

function phiDragTo(pos) {
    const P = L.pot;
    phi[dragIdx] = Math.max(0, Math.min(1, (pos.x - P.x) / P.w));
    redraw();
}

function barDragTo(pos) {
    const P = L.prior;
    const target = ((pos.x - P.x) / P.w) * dragXmax;
    probs = withProb(probs, dragIdx, target);
    redraw();
}

function onDown(e) {
    if (!L) return;
    const pos = getPos(cvMain, e);
    const i = L.rowAt(pos.y);
    if (i === -1) return;
    if (inCol(pos, L.pot)) {
        dragKind = 'phi';
        dragIdx = i;
        e.preventDefault();
        phiDragTo(pos);
    } else if (inCol(pos, L.prior)) {
        dragKind = 'bar';
        dragIdx = i;
        dragXmax = niceXmax(Math.max(...probs, ...computePosterior(),
            ...contOptimum(probs, phi, beta).q));
        e.preventDefault();
        barDragTo(pos);
    }
}

function onMove(e) {
    if (dragKind === 'phi') {
        e.preventDefault();
        phiDragTo(getPos(cvMain, e));
    } else if (dragKind === 'bar') {
        e.preventDefault();
        barDragTo(getPos(cvMain, e));
    } else if (!e.touches && L && cvMain) {
        // hover affordance
        const pos = getPos(cvMain, e);
        const i = L.rowAt(pos.y);
        cvMain.style.cursor =
            i !== -1 && (inCol(pos, L.pot) || inCol(pos, L.prior))
                ? 'ew-resize' : '';
    }
}

function onUp() {
    if (dragKind === 'bar') {
        dragKind = null;
        dragXmax = null;
        redraw(); // unfreeze the x-scale
    }
    dragKind = null;
    dragIdx = -1;
}

// ================================================================
//  INIT
// ================================================================

export function initContinuous() {
    cvMain = document.getElementById('cv-akl-c-main');
    cvR = document.getElementById('cv-akl-c-reshape');
    slider = document.getElementById('akl-c-beta');
    kSlider = document.getElementById('akl-c-k');
    roBeta = document.getElementById('akl-c-readout-beta');
    roEps = document.getElementById('akl-c-readout-eps');
    roZ = document.getElementById('akl-c-readout-z');
    roK = document.getElementById('akl-c-readout-k');
    if (!cvMain) return;

    cvMain.style.height = mainHeight() + 'px';

    if (slider) {
        slider.max = String(SLIDER_MAX);
        slider.value = String(betaToSlider(beta));
        slider.addEventListener('input', () => {
            beta = sliderToBeta(Number(slider.value));
            redraw();
        });
    }

    if (kSlider) {
        kSlider.value = String(k);
        if (roK) roK.textContent = String(k);
        kSlider.addEventListener('input', () => {
            const next = Number(kSlider.value);
            if (next === k) return;
            k = next;
            probs = normalize(defaultPrior(k)); // changing K resets the setup
            phi = defaultPhi(k);
            if (roK) roK.textContent = String(k);
            cvMain.style.height = mainHeight() + 'px';
            redraw();
        });
    }

    cvMain.addEventListener('mousedown', onDown);
    cvMain.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    window.addEventListener('resize', redraw);

    redraw();
}
```

- [ ] **Step 2: Boot it from `index.js`**

Add the import and the call inside `boot()`:

```js
import { init } from './main.js';
import { initContinuous } from './main-continuous.js';
import { buildTickLabels, bindDropdownClose } from './controls.js';

function boot() {
    init();
    initContinuous();
    buildTickLabels();
    bindDropdownClose();
}
```

(The `if (document.readyState ...)` tail stays as Task 2 left it.)

- [ ] **Step 3: CSS — scope the K-slider width by panel, not id**

In `assets/css/anchored-kl.css`, the compact-width rule currently targets only the binary chip's slider. Replace:

```css
.akl-toolbar input#akl-k {
    width: 150px;
    flex: none;
}
```

with:

```css
.akl-k-panel input[type="range"] {
    width: 150px;
    flex: none;
}
```

(Both K chips' sliders live inside `.akl-k-panel`; the β sliders don't, so they keep their flexible width. Keep the comment above the rule, updating it to say the rule targets the dropdown panels' K sliders.)

- [ ] **Step 4: Verify**

Run: `node --check src/anchored-kl/main-continuous.js && make test && make -j4`
Expected: clean build; tests green; `grep -c 'initContinuous' _site/assets/js/anchored-kl.bundle.js` ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add src/anchored-kl/main-continuous.js src/anchored-kl/index.js assets/css/anchored-kl.css
git commit -m "wire the continuous-potential instance"
```

---

### Task 6: Visual verification

**Files:**
- None expected (fix-ups only, committed separately if needed).

- [ ] **Step 1: Serve**

Run `make serve` (background; note the port it prints) and open `/posts/anchored-forward-kl/`.

- [ ] **Step 2: Walk the checklist**

1. The binary section behaves exactly as before the refactor: main slider, fold slider, all three draggable dots, potential painting, prior drags, K chip open/close, readouts.
2. The continuous section renders: four columns with the ramp potential, colors blending red→blue down the rows.
3. Drag potential bars to arbitrary values → posterior, optimum, reshaping curve, ε and Z readouts all track. Drag prior bars → x-scale freezes during the drag.
4. β slider: at β = 0 the curve is the identity diagonal and optimum = posterior; at β = ∞ the curve is flat at 1 and optimum = prior; in between the floor ε and top compression are visible; dots sit on the curve at the configured potential values.
5. All-zero potential (drag everything to 0) → optimum falls back to the prior, nothing crashes.
6. K dropdown chip opens/closes (including click-outside) in BOTH sections independently; changing K in one section does not touch the other.
7. The continuous sticky bar pins while scrolling its section; the binary toolbar's stickiness is unchanged.
8. Both sections' β states are independent: move one slider, the other doesn't move.
9. Resize the window.

- [ ] **Step 3: Fix and commit anything caught**

```bash
git add -A src/anchored-kl assets/css/anchored-kl.css content/posts/2026-07-31-anchored-forward-kl.md
git commit -m "polish continuous viz after visual pass"
```

(Skip if nothing needed fixing.)
