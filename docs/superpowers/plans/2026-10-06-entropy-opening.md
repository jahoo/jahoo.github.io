# Entropy Opening on the Shared Expectation Figure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the differential-entropy post's opening on the expectation post's area figure, pinned at $u = 1$ with $g = -\log p_X$, driven by a β-tempering slider in the discrete case, with one shared notation across both posts.

**Architecture:** The figure modules (`fig-area`, `frame`, `fig-transform`) move from `src/expectation/` into `src/lib/prob/`, where the model, position and editor they depend on already live. `createAreaFigure` gains two options, `sweep` and `notes`; the shared model gains a tempering exponent `beta` that applies on top of the base pmf you edit. Each post keeps a small `main.js` and `controls.js` of its own; the common controls (case toggle, presets, reset) become a lib function. MathJax macros split into a shared file and per-post extras, merged by the Lua filter.

**Tech Stack:** ES modules bundled by esbuild (`make`), `node --test` (`make test`), pandoc + Lua filters, MathJax v4. No framework, no build step for CSS.

**Spec:** `docs/superpowers/specs/2026-10-06-entropy-opening-design.md`

## Global Constraints

- The expectation post (`/posts/expectation/`) must behave exactly as before: sweep, play, the $g$ menu, the notes wording, the result line. Its only visible change is `\mathbb{E}` → `\E` (identical rendering).
- The entropy figure never shows a cursor, crosshair, current-pair line or running integral; the result box is present from the first paint.
- Figure labels in JS spell `\mathbb{E}` out; they must not depend on any post's macro file.
- Entropy's per-post macros keep `pmf: p` and `pdf: f` through this phase (the properties sections use them ~50 times); the opening writes `p_X` literally.
- The entropy post stays `unlisted: true`.
- Commits: the user reviews commit messages (CLAUDE.md), so at each commit step show the message and wait if the user is present; commit freely otherwise, no `Co-Authored-By`. Do not push; do not deploy.
- `trash`, never `rm`, for deletions (user's global rule); `git rm` is fine for tracked files.

## Review Focus

Inputs the spec implies but no requirement names; each has a test pinned to the owning task.

1. A one-hot pmf under β = 0 (Task 1): `temper` keeps the support, so the result is still one-hot, not uniform; $H = 0$ at every β, no NaN. Test in Task 1.
2. Dragging a lollipop while β ≠ 1 (Task 2): the handle must sit on the **base** value, else a drag at β = 3 grabs empty space. Test in Task 2.
3. A base pmf with zero-mass atoms under tempering (Task 1): `view().p` has zeros exactly where the base does, so the figure's `pin-null` logic and `gs` NaN path keep working. Test in Task 1.
4. The two notes variants drift apart (Task 4): a key present in one and missing in the other would make the entropy page silently fall back to `undefined`. Test in Task 4 pins identical key sets and that the expectation strings equal today's literals.
5. A macros list naming a missing file (Task 6): the filter must warn and still emit the other files' macros, not drop them all. Verified by a build-level check in Task 6.

---

### Task 1: Tempering in the shared model

**Files:**
- Modify: `src/lib/prob/model.js`
- Test: `src/lib/prob/model.test.js`

**Interfaces:**
- Produces: `m.beta` (number, default 1), `m.setBeta(b)`; `m.view()` in the discrete case returns `{ disc: true, p: <tempered>, F: cdfOf(<tempered>), n, xRange, base?: m.p }` where `base` is present only when `beta !== 1`. `m.p` remains the base pmf. `m.reset()` sets `beta = 1`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/prob/model.test.js`, inside `describe('model', …)`:

```js
    it('beta tempers the view, not the base: p is p^beta normalized, base is the edited pmf', () => {
        const m = createModel(); // zipf
        m.setBeta(2);
        const v = m.view();
        assert.equal(m.beta, 2);
        assert.deepEqual(v.base, m.p);
        const Z = sum(m.p.map(q => q * q));
        v.p.forEach((q, i) => assert.ok(Math.abs(q - m.p[i] ** 2 / Z) < 1e-12, `atom ${i}`));
        assert.ok(Math.abs(sum(v.p) - 1) < 1e-12);
        assert.ok(Math.abs(v.F[8] - 1) < 1e-12, 'F is of the tempered pmf');
    });
    it('at beta = 1 the view has no base and p is the pmf itself', () => {
        const m = createModel();
        assert.equal(m.view().base, undefined);
        assert.deepEqual(m.view().p, m.p);
    });
    it('beta = 0 flattens a full-support pmf to uniform; a one-hot pmf stays one-hot', () => {
        const m = createModel(); m.setBeta(0);
        m.view().p.forEach(q => assert.ok(Math.abs(q - 1 / 8) < 1e-12));
        m.setPreset('onehot');
        assert.deepEqual(m.view().p, DISC_PRESETS.onehot.p);
    });
    it('tempering keeps zeros where the base has them', () => {
        const m = createModel(); m.editPmf(2, 0.01); // pops atom 2 to zero
        m.setBeta(3);
        assert.equal(m.view().p[2], 0);
        assert.equal(m.view().base[2], 0);
    });
    it('editPmf edits the base while tempered; setBeta notifies; reset restores beta = 1', () => {
        const m = createModel(); let n = 0; m.subscribe(() => n++);
        m.setBeta(2); assert.equal(n, 1);
        m.editPmf(0, 0.5);
        assert.ok(Math.abs(m.p[0] - 0.5) < 1e-12, 'the base took the target');
        assert.ok(m.view().p[0] > 0.5, 'the tempered value is sharper than the base');
        m.reset();
        assert.equal(m.beta, 1);
        assert.equal(m.view().base, undefined);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/prob/model.test.js`
Expected: FAIL — `m.setBeta is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/prob/model.js`:

Change the import line to include `temper`:
```js
import { withMass, shapeMoments, cdfOf, sampleShape, atU, lerp, temper } from './dist.js';
```

In `createModel`, add `beta: 1` to the initial object:
```js
    const m = {
        kase: 'disc', discKey: 'zipf', contKey: 'gauss', beta: 1,
        p: DISC_PRESETS.zipf.p.slice(),
        shape: structuredClone(CONT_PRESETS.gauss.shape),
    };
```

In `m.reset`, add `beta: 1` to the `Object.assign`:
```js
        Object.assign(m, { kase: 'disc', discKey: 'zipf', contKey: 'gauss', beta: 1, p: DISC_PRESETS.zipf.p.slice(), shape: structuredClone(CONT_PRESETS.gauss.shape) });
```

After `m.setShape`, add:
```js
    // The discrete law shown is the base pmf tempered, p^β / Z: β = 1 is the pmf itself,
    // β = 0 flattens it toward uniform (on its support), large β concentrates it. Edits
    // and presets act on the base; the view carries both when they differ.
    m.setBeta = b => { m.beta = b; changed(); };
```

Replace the discrete branch of `m.view`:
```js
    m.view = () => {
        if (m.kase !== 'disc') return { disc: false, shape: m.shape, S, win, xRange: [win.x0, win.x1] };
        const plain = m.beta === 1;
        const p = plain ? m.p : temper(m.p, m.beta);
        const v = { disc: true, p, F: cdfOf(p), n: p.length, xRange: [0.5, p.length + 0.5] };
        if (!plain) v.base = m.p;
        return v;
    };
```

- [ ] **Step 4: Run the tests**

Run: `node --test src/lib/prob/model.test.js`
Expected: PASS, all tests including the five new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prob/model.js src/lib/prob/model.test.js
git commit -m "prob model: a tempering exponent beta on top of the base pmf"
```

---

### Task 2: Editor handles sit on the base pmf

**Files:**
- Modify: `src/lib/prob/edit.js:52-54`
- Test: `src/lib/prob/edit.test.js`

**Interfaces:**
- Consumes: `model.view().base` from Task 1.
- Produces: discrete handles at `(i + 1, base[i])` when `base` exists, else `(i + 1, p[i])`. Everything else unchanged.

- [ ] **Step 1: Write the failing test**

Append inside `describe('p_X editor hit test', …)` in `src/lib/prob/edit.test.js`:

```js
    it('while tempered, the handles sit on the base pmf, not the tempered one', () => {
        const m = createModel(); m.setBeta(3);
        const ed = createEditor({ model: m, adapter });
        const v = m.view();
        // atom 1 (zipf: base 1/2 ≈ .368 normalized) is far sharper tempered; the handle is at the base height
        const [bx, by] = adapter.toScreen(1, v.base[0]);
        assert.equal(ed.hit({ x: bx, y: by })?.type, 'atom');
        const [tx, ty] = adapter.toScreen(1, v.p[0]);
        assert.ok(Math.abs(ty - by) > 14, 'the two heights differ by more than the hit radius');
        assert.equal(ed.hit({ x: tx, y: ty }), null);
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/prob/edit.test.js`
Expected: FAIL on the first `assert.equal` (hit is `null` at the base height).

- [ ] **Step 3: Implement**

In `src/lib/prob/edit.js`, `handles()`:
```js
    function handles() {
        const v = model.view(), top = adapter.dTop();
        // discrete: the handles are on the pmf you edit, the base, even while the figure shows it tempered
        if (v.disc) return (v.base ?? v.p).map((d, i) => ({ type: 'atom', i, x: i + 1, d: Math.min(d, top) })).filter(h => visible(h.i));
```

- [ ] **Step 4: Run the tests**

Run: `node --test src/lib/prob/edit.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prob/edit.js src/lib/prob/edit.test.js
git commit -m "prob editor: discrete handles on the base pmf while tempered"
```

---

### Task 3: Move the figure modules into the lib

**Files:**
- Move: `src/expectation/fig-area.js` → `src/lib/prob/fig-area.js`
- Move: `src/expectation/frame.js` → `src/lib/prob/frame.js`
- Move: `src/expectation/frame.test.js` → `src/lib/prob/frame.test.js`
- Move: `src/expectation/fig-transform.js` → `src/lib/prob/fig-transform.js`
- Modify: `src/expectation/main.js`, `src/expectation/fig-product.js` (import paths)

**Interfaces:**
- Produces: `import { createAreaFigure } from '../lib/prob/fig-area.js'`, `import { computeFrame, G, meaning, densityAt, productFrame } from '../lib/prob/frame.js'`, `import { createTransformFigure } from '../lib/prob/fig-transform.js'`. Signatures unchanged in this task.

- [ ] **Step 1: Move the files**

```bash
git mv src/expectation/fig-area.js src/lib/prob/fig-area.js
git mv src/expectation/frame.js src/lib/prob/frame.js
git mv src/expectation/frame.test.js src/lib/prob/frame.test.js
git mv src/expectation/fig-transform.js src/lib/prob/fig-transform.js
```

- [ ] **Step 2: Fix the moved files' imports**

`src/lib/prob/frame.js` line 8:
```js
import { log2, atX, atU, lerp, runningIntegral } from './dist.js';
```

`src/lib/prob/frame.test.js` lines 3–6:
```js
import { createModel } from './model.js';
import { createPosition } from './position.js';
import { computeFrame, meaning, productFrame } from './frame.js';
import { atU, lerp } from './dist.js';
```

`src/lib/prob/fig-area.js` lines 16–21:
```js
import { clamp, discCdfAt, atX, atU, lerp } from './dist.js';
import { Region, el, svgContext, svgPoint } from './region.js';
import { createMathLayer, texNum } from './mathlabels.js';
import { fitWidth } from './fit.js';
import { createEditor, regionAdapter } from './edit.js';
import { G, meaning } from './frame.js';
```

`src/lib/prob/fig-transform.js` lines 12–17:
```js
import { clamp, discCdfAt, discQuantile, atX, atU, lerp } from './dist.js';
import { Region, el, svgContext, svgPoint } from './region.js';
import { createEditor, regionAdapter } from './edit.js';
import { densityAt } from './frame.js';
import { createMathLayer } from './mathlabels.js';
import { fitWidth } from './fit.js';
```

Change each moved file's header comment first line from `//  Expectation — <name>` to `//  Probability figures — <name>` (frame.js: `//  Probability figures — frame.js`), leaving the rest of the header as is.

- [ ] **Step 3: Fix the expectation post's imports**

`src/expectation/main.js` lines 7–12:
```js
import { createModel } from '../lib/prob/model.js';
import { createPosition } from '../lib/prob/position.js';
import { computeFrame } from '../lib/prob/frame.js';
import { bindControls } from './controls.js';
import { createAreaFigure } from '../lib/prob/fig-area.js';
import { createTransformFigure } from '../lib/prob/fig-transform.js';
import { createProductFigure } from './fig-product.js';
```

`src/expectation/fig-product.js` line 14:
```js
import { productFrame } from '../lib/prob/frame.js';
```

- [ ] **Step 4: Tests and build**

Run: `make test && make -j4`
Expected: all tests pass (318 before this work; `frame.test.js` now runs from its new path), bundles build, no unresolved import.

Run: `grep -rn "from './frame.js'\|from './fig-area.js'\|from './fig-transform.js'" src/expectation/`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A src/expectation src/lib/prob
git commit -m "prob: the area, frame and transform figure modules move into the lib"
```

---

### Task 4: `sweep` and `notes` options on the area figure

**Files:**
- Create: `src/lib/prob/area-notes.js`
- Test: `src/lib/prob/area-notes.test.js`
- Modify: `src/lib/prob/fig-area.js`
- Modify: `src/lib/prob/frame.js` (pass `base` through)
- Modify: `assets/css/expectation.css` (base lollipop styles)

**Interfaces:**
- Consumes: `view().base` (Task 1).
- Produces: `createAreaFigure(svg, ctx, { sweep = true, notes = 'expectation' } = {})`. `NOTES` exported from `area-notes.js`, keyed `expectation` | `entropy`, each with the same keys (below). `computeFrame`'s discrete result gains `base` (the base pmf, or `undefined`).

- [ ] **Step 1: Write the failing notes test**

Create `src/lib/prob/area-notes.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NOTES } from './area-notes.js';

describe('area figure notes', () => {
    it('both variants define the same keys, with the same kinds of values', () => {
        const a = NOTES.expectation, b = NOTES.entropy;
        assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
        for (const k of Object.keys(a)) assert.equal(typeof a[k], typeof b[k], k);
    });
    it('the expectation variant is the wording the expectation post shipped with', () => {
        const T = NOTES.expectation;
        assert.equal(T.dist, 'The distribution of \\(X\\): what the expectation averages over.');
        assert.equal(T.g, 'The function \\(g\\) gives the height to integrate.');
        assert.equal(T.area(true, '1'), 'The expectation is the whole area:');
        assert.equal(T.area(false, '0.600'), 'The area up to \\(u = \\class{ex-now}{0.600}\\) is:');
        assert.equal(T.rest, 'The expectation is the whole area (slide \\(u\\) to 1).');
        assert.equal(T.gLabel('-\\log_2 p_X(x)'), 'g(x) = -\\log_2 p_X(x)');
        assert.equal(T.gLabel(null), 'g(x)');
        assert.equal(T.aLabel('-\\log_2 p_X(x)'), 'g(F_X^{-1}(u))');
        assert.equal(T.avg(true), '\\mathbb{E}[g(X)]');
        assert.equal(T.integrand('-\\log_2 p_X(x)'), 'g\\big(F_X^{-1}(v)\\big)');
        assert.equal(T.result({ mn: { tex: 'H(X)', name: 'entropy' }, val: '2.310', unit: '\\text{ bits}', disc: true }),
            '\\mathbb{E}[g(X)] \\;=\\; \\underbrace{H(X)}_{\\mathclap{\\text{entropy}}} \\;=\\; 2.310\\text{ bits}');
        assert.equal(T.result({ mn: null, val: '1.5', unit: '', disc: true }), '\\mathbb{E}[g(X)] \\;=\\; 1.5');
    });
    it('the entropy variant names the entropy, with H for a pmf and h for a density', () => {
        const T = NOTES.entropy;
        assert.equal(T.dist, 'The distribution of \\(X\\): what the entropy averages over.');
        assert.equal(T.map, NOTES.expectation.map);
        assert.equal(T.g, 'The height is the surprisal, \\(-\\log_2 p_X(x)\\).');
        assert.equal(T.area(true, '1'), 'The entropy is the whole area:');
        assert.equal(T.gLabel('-\\log_2 p_X(x)'), '-\\log_2 p_X(x)');
        assert.equal(T.aLabel('-\\log_2 p_X(x)'), '-\\log_2 p_X(F_X^{-1}(u))');
        assert.equal(T.avg(true), 'H(X)');
        assert.equal(T.avg(false), 'h(X)');
        assert.equal(T.integrand('-\\log_2 p_X(x)'), '-\\log_2 p_X\\big(F_X^{-1}(v)\\big)');
        assert.equal(T.result({ mn: null, val: '2.310', unit: '\\text{ bits}', disc: true }), 'H(X) \\;=\\; \\mathbb{E}[-\\log_2 p_X(X)] \\;=\\; 2.310\\text{ bits}');
        assert.equal(T.result({ mn: null, val: '\\class{ex-neg}{-0.420}', unit: '\\text{ bits}', disc: false }), 'h(X) \\;=\\; \\mathbb{E}[-\\log_2 p_X(X)] \\;=\\; \\class{ex-neg}{-0.420}\\text{ bits}');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test src/lib/prob/area-notes.test.js`
Expected: FAIL — cannot find module `./area-notes.js`.

- [ ] **Step 3: Write `area-notes.js`**

```js
// ================================================================
//  Probability figures — area-notes.js
//  The words the area figure carries, per post. The expectation post
//  speaks of a general g and "the expectation"; the entropy post has
//  g fixed to −log p_X and calls the expectation (differential) entropy.
//  Pure strings and string functions: no DOM. Every variant has every
//  key (area-notes.test.js checks), so a figure never falls back to
//  another post's wording.
//    gtex: the TeX of g(x) for the chosen g (null when g is custom)
//    mn:   what E[g(X)] is called, { tex, name }, or null
//    val:  the typeset number (already wrapped in \class{ex-neg} if negative)
// ================================================================

const MAP = '\\(F_X\\) rescales the real line into \\([0, 1]\\), so that each outcome takes up as much room as its probability. This gives us our horizontal axis.';

export const NOTES = {
    expectation: {
        dist: 'The distribution of \\(X\\): what the expectation averages over.',
        map: MAP,
        g: 'The function \\(g\\) gives the height to integrate.',
        gLabel: gtex => (gtex ? 'g(x) = ' + gtex : 'g(x)'),
        aLabel: () => 'g(F_X^{-1}(u))',
        avg: () => '\\mathbb{E}[g(X)]', // the average-height line in the area panel
        area: (done1, uTex) => (done1 ? 'The expectation is the whole area:' : `The area up to \\(u = \\class{ex-now}{${uTex}}\\) is:`),
        rest: 'The expectation is the whole area (slide \\(u\\) to 1).',
        integrand: () => 'g\\big(F_X^{-1}(v)\\big)',
        // the label under the brace takes no width, so a long name doesn't spread the equation
        result: ({ mn, val, unit }) => `\\mathbb{E}[g(X)] \\;=\\; ${mn ? `\\underbrace{${mn.tex}}_{\\mathclap{\\text{${mn.name}}}} \\;=\\; ` : ''}${val}${unit}`,
    },
    entropy: {
        dist: 'The distribution of \\(X\\): what the entropy averages over.',
        map: MAP,
        g: 'The height is the surprisal, \\(-\\log_2 p_X(x)\\).',
        gLabel: gtex => gtex,
        aLabel: () => '-\\log_2 p_X(F_X^{-1}(u))',
        avg: disc => (disc ? 'H(X)' : 'h(X)'),
        area: () => 'The entropy is the whole area:',
        rest: '', // never shown: this figure is always at u = 1
        integrand: () => '-\\log_2 p_X\\big(F_X^{-1}(v)\\big)',
        result: ({ val, unit, disc }) => `${disc ? 'H(X)' : 'h(X)'} \\;=\\; \\mathbb{E}[-\\log_2 p_X(X)] \\;=\\; ${val}${unit}`,
    },
};
```

- [ ] **Step 4: Run the notes test**

Run: `node --test src/lib/prob/area-notes.test.js`
Expected: PASS.

- [ ] **Step 5: Pass `base` through the frame**

In `src/lib/prob/frame.js`, `computeFrame`'s discrete return:
```js
        return { disc: true, p, F, n, base: v.base, gs, cum, x: pos.x, u, k, gNow: k >= 0 ? gs[k] : NaN, area, total: cum[n] };
```

- [ ] **Step 6: Wire the options into `fig-area.js`**

Each edit below is to `src/lib/prob/fig-area.js`.

(a) Imports: add
```js
import { NOTES } from './area-notes.js';
```

(b) Signature and header. Replace the `export function createAreaFigure(` line with:
```js
// opts: sweep — the position can move (cursors, crosshair, the running integral, position
//       drags); false pins the figure at u = 1, where only p_X is editable.
//       notes — which post's wording the figure carries (see area-notes.js).
export function createAreaFigure(svg, { model, pos, ui, redraw, stopPlay, customG }, { sweep = true, notes = 'expectation' } = {}) {
    const T = NOTES[notes];
```
Add to the header comment, after the "Dragging:" lines:
```
//  With sweep: false the figure is pinned at u = 1: no cursors, no
//  crosshair, no running integral, and only p_X can be dragged. When
//  the model is tempered (view().base), the base pmf is drawn faint
//  behind the tempered one.
```

(c) Top-right panel, discrete branch. Before `fr.p.forEach((q, i) => {`, draw the base:
```js
            // the pmf being edited, when the figure shows it tempered
            if (fr.base) fr.base.forEach((q, i) => {
                if (q <= 0) return;
                el('line', { x1: RT.X(i + 1), x2: RT.X(i + 1), y1: RT.Y(0), y2: RT.Y(q), class: 'stem-base' }, RT.data);
                el('circle', { cx: RT.X(i + 1), cy: RT.Y(q), r: 4.5, class: 'pin-base' }, RT.data);
            });
```
Replace `RT.vline(fr.x, 'cursor');` (discrete branch) with `if (sweep) RT.vline(fr.x, 'cursor');`.

(d) Top-right panel, continuous branch. Replace
```js
            RT.vline(fr.x, 'cursor');
            if (RT.inX(fr.x)) el('circle', { cx: RT.X(fr.x), cy: RT.Y(fr.fNow), r: 4.5, class: 'dot' }, RT.front);
```
with
```js
            if (sweep) {
                RT.vline(fr.x, 'cursor');
                if (RT.inX(fr.x)) el('circle', { cx: RT.X(fr.x), cy: RT.Y(fr.fNow), r: 4.5, class: 'dot' }, RT.front);
            }
```

(e) Bottom-left panel. Replace
```js
        const gtex = ui.g === 'custom' ? 'g(x)' : 'g(x) = ' + G[ui.g].tex;
```
with
```js
        const gtex = T.gLabel(ui.g === 'custom' ? null : G[ui.g].tex);
```
Replace both `RG.vline(fr.x, 'cursor');` with `if (sweep) RG.vline(fr.x, 'cursor');`.

(f) Area panel. Replace `yLabel('ra-y', RA, 'g(F_X^{-1}(u))');` with `yLabel('ra-y', RA, T.aLabel(G[ui.g].tex));`.
Replace `if (fr.u > 0) RA.vline(fr.u, 'cursor');` with `if (sweep && fr.u > 0) RA.vline(fr.u, 'cursor');`.
Replace the average line's label, `math.set('avg', RA.pl + 8, RA.Y(fr.total) - 13, '\\mathbb{E}[g(X)]', …)`, with `math.set('avg', RA.pl + 8, RA.Y(fr.total) - 13, T.avg(fr.disc), { anchor: 'start', cls: 'ex-ml-avg' })`.

(g) Running integral: no change (at $u = 1$, `wideBottom` is already true and the panel is cleared).

(h) Bridge. Replace both `br-cur` lines so they are guarded:
```js
            if (sweep && fr.k >= 0) el('line', { x1: RT.X(fr.k + 1), y1: yTop, x2: U(fr.u), y2: yAx, class: 'br-cur' }, bridge);
```
and
```js
            if (sweep && Number.isFinite(fr.x)) el('line', { x1: RT.X(fr.x), y1: yTop, x2: U(fr.u), y2: yAx, class: 'br-cur' }, bridge);
```

(i) Crosshair. Replace `const hasPoint = !done1 && (fr.disc ? fr.k >= 0 : true);` with
```js
        const hasPoint = sweep && !done1 && (fr.disc ? fr.k >= 0 : true);
```

(j) Notes and formula. Replace the three `note(...)` calls' strings and the area/rest/integral/expectation strings:
```js
        note('n-dist', colL / 2, (RT.pt + RT.pb) / 2, T.dist, colL - 10);
        note('n-map', colL / 2, (zones.yTop + zones.yAx) / 2 - (noRI ? 30 : 0), T.map, nw);
        note('n-g', colL / 2, RG.pt - 12, T.g, nw, true);
```
```js
        const areaNote = T.area(done1, texNum(fr.u));
        math.set('n-area', fx, riTop + 2, areaNote, { text: true, width: noteW, cls: 'ex-ml-note' });
        if (!done1) math.set('n-rest', fx, fy2, T.rest, { text: true, width: noteW, cls: 'ex-ml-note' });
        math.set('integral', fx, fy1, `\\displaystyle\\int_0^{${upper}} ${T.integrand(G[ui.g].tex)} \\dee{v} \\;=\\; ${val(fr.area)}`, { cls: 'ex-ml-formula' });
        if (done1) {
            const mn = meaning(ui.g, fr.disc);
            const tex = T.result({ mn, val: val(fr.total), unit: defined ? G[ui.g].unit ?? '' : '', disc: fr.disc });
            math.set('expectation', fx, fy2, tex, { cls: 'ex-ml-result' + (defined ? ' ex-ml-boxed' : '') });
        }
```
(Delete the old `named` const and the comment about the brace, which moved into `area-notes.js`.)

(k) Dragging. At the top of `zoneAt`, add `if (!sweep) return null;`. At the top of `gHit`, add `if (!sweep) return -1;`. (A `p_X` handle is still found by `editor.hit`, so editing works.)

- [ ] **Step 7: Base lollipop styles**

In `assets/css/expectation.css`, after the `.pin-null` rule (line ~141), add:
```css
/* the pmf being edited, drawn faint behind its tempered version (the entropy post's β) */
svg.ex-plot .stem-base { stroke: var(--ex-ink-soft); stroke-width: 1; stroke-dasharray: 3 2; opacity: .55; }
svg.ex-plot .pin-base { fill: none; stroke: var(--ex-ink-soft); stroke-width: 1; stroke-dasharray: 2 2; opacity: .55; }
```

- [ ] **Step 8: Tests and build, then eyeball the expectation post**

Run: `make test && make -j4`
Expected: all pass; the bundle builds.

Run `make serve` (or a static server on `_site`) and open `/posts/expectation/`. Check: the notes read as before; the running integral, crosshair and cursors behave as before; the result line at $u = 1$ reads `𝔼[g(X)] = H(X) = … bits` with the brace label. Nothing in this post should look different.

- [ ] **Step 9: Commit**

```bash
git add src/lib/prob/area-notes.js src/lib/prob/area-notes.test.js src/lib/prob/fig-area.js src/lib/prob/frame.js assets/css/expectation.css
git commit -m "area figure: sweep and notes options, the base pmf drawn behind a tempered one"
```

---

### Task 5: Common controls in the lib; the expectation post's controls on top

**Files:**
- Create: `src/lib/prob/controls.js`
- Modify: `src/expectation/controls.js`

**Interfaces:**
- Produces: `bindCommonControls({ model, pos, ui, redraw }, { beforeCase, afterCase, onReset, stopPlay } = {})` → `{ update(), fillPresets() }`. It binds every `.ex-case` group, `#ex-preset`, `#ex-reset`, and sets `document.body.dataset.exCase` in `update()`. Hooks: `beforeCase(k)` runs before `model.setCase(k)`; `afterCase(k)` after `fillPresets()` and before `redraw()`; `onReset()` runs before `model.reset()`; `stopPlay()` runs first on any case/preset/reset action (default no-op).
- `src/expectation/controls.js` keeps its export `bindControls(ctx)` → `{ update, stopPlay }`.

- [ ] **Step 1: Write `src/lib/prob/controls.js`**

```js
// ================================================================
//  Probability figures — controls.js
//  The controls every page with the shared model has: the case toggle
//  (any number of `.ex-case` groups), the p_X preset menu (#ex-preset)
//  and reset (#ex-reset). Each element is optional. A page adds its
//  own controls around these through the hooks.
// ================================================================

import { DISC_PRESETS, CONT_PRESETS } from './model.js';

const $ = id => document.getElementById(id);

// A group of buttons with aria-pressed, calling onChange(value).
export function seg(box, onChange) {
    if (!box) return;
    const btns = [...box.querySelectorAll('button')];
    btns.forEach(b => b.addEventListener('click', () => {
        btns.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        onChange(b.dataset.v);
    }));
}

// hooks: beforeCase(k) runs before the model switches case, afterCase(k) once the presets
// are refilled (before the redraw), onReset() before the model resets, stopPlay() first on
// any action here.
export function bindCommonControls({ model, pos, redraw }, { beforeCase, afterCase, onReset, stopPlay = () => {} } = {}) {
    const preset = $('ex-preset');
    function fillPresets() {
        if (!preset) return;
        const disc = model.kase === 'disc', src = disc ? DISC_PRESETS : CONT_PRESETS, cur = disc ? model.discKey : model.contKey;
        const opts = Object.entries(src).map(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.label; return o; });
        // discrete: custom is a choice, the last edited pmf; continuous: shown only once edited
        const custom = document.createElement('option'); custom.value = 'custom'; custom.textContent = 'custom'; custom.hidden = !disc && cur !== 'custom';
        preset.replaceChildren(...opts, custom);
        preset.value = cur;
    }
    const cases = [...document.querySelectorAll('.ex-case')];
    for (const box of cases) seg(box, k => {
        if (k === model.kase) return;
        stopPlay();
        beforeCase?.(k);
        model.setCase(k); fillPresets();
        afterCase?.(k);
        redraw();
    });
    preset?.addEventListener('change', () => { stopPlay(); model.setPreset(preset.value); });
    fillPresets();

    // reset: everything as the page loads
    $('ex-reset')?.addEventListener('click', () => {
        stopPlay();
        onReset?.();
        model.reset(); // first: the position's start (x = 4.1) is a discrete one
        pos.reset();
        fillPresets();
        redraw();
    });

    // keep the case attribute and the preset menu in step with the model
    function update() {
        document.body.dataset.exCase = model.kase;
        for (const b of cases.flatMap(box => [...box.querySelectorAll('button')])) b.setAttribute('aria-pressed', b.dataset.v === model.kase ? 'true' : 'false');
        const key = model.kase === 'disc' ? model.discKey : model.contKey;
        if (preset && preset.value !== key) preset.value = key;
    }

    return { update, fillPresets };
}
```

- [ ] **Step 2: Rewrite `src/expectation/controls.js` on top of it**

Replace the file's contents with:

```js
// ================================================================
//  Expectation — controls.js
//  This post's control bar: the common controls (case, p_X, reset)
//  plus g (a menu with typeset options), play and the whole area.
// ================================================================

import { bindCommonControls } from '../lib/prob/controls.js';
import { createMenu } from './menu.js';

const $ = id => document.getElementById(id);

export function bindControls({ model, pos, ui, redraw, customG }) {
    // ---- play: sweep x (or u) from its start to its end at a steady pace over ~7 s ----
    let raf = 0, t0 = 0, which = null;
    // each play button holds both labels (typeset); .playing shows the pause one
    function stopPlay() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0; which = null;
        for (const w of ['x', 'u']) $('ex-play' + w)?.classList.remove('playing');
    }
    function tick(t) {
        if (!t0) t0 = t;
        const f = Math.min(1, (t - t0) / 7000);
        if (which === 'x') { const [lo, hi] = model.view().xRange; pos.setX(lo + f * (hi - lo)); } else pos.setU(f);
        redraw();
        if (f < 1) raf = requestAnimationFrame(tick); else stopPlay();
    }
    function play(w) {
        const was = which;
        stopPlay();
        if (was === w) return;
        which = w; t0 = 0; raf = requestAnimationFrame(tick);
        $('ex-play' + w)?.classList.add('playing');
    }
    $('ex-playx')?.addEventListener('click', () => play('x'));
    $('ex-playu')?.addEventListener('click', () => play('u'));

    // ---- the whole area: u = 1 ----
    $('ex-whole')?.addEventListener('click', () => { stopPlay(); pos.setU(1); redraw(); });

    // ---- case, p_X, reset: the common controls, with this post's hooks ----
    const common = bindCommonControls({ model, pos, redraw }, {
        stopPlay,
        // a custom g lives on the atoms; drop it before setCase redraws
        beforeCase: k => { if (k === 'cont' && ui.g === 'custom') ui.g = ui.gBase; },
        afterCase: () => pos.setU(0.6),
        onReset: () => Object.assign(ui, { g: 'neglog', gBase: 'neglog', gc: null }),
    });

    // ---- g ----
    const gsel = $('ex-gsel') && createMenu($('ex-gsel'));
    gsel?.addEventListener('change', () => {
        if (gsel.value === 'custom') customG(false); else ui.g = ui.gBase = gsel.value;
        redraw();
    });

    function update() {
        common.update();
        if (gsel) {
            gsel.hide('custom', model.kase !== 'disc');
            if (gsel.value !== ui.g) gsel.value = ui.g;
        }
    }

    return { update, stopPlay };
}
```

- [ ] **Step 3: Build and check the expectation post by hand**

Run: `make test && make -j4`, then open `/posts/expectation/`.
Check each control once: toggle to continuous (the position lands at $u = 0.6$; a custom $g$ drops back to its base), pick presets in both cases (custom appears after an edit), the $g$ menu (custom hidden in the continuous case), both play buttons and pause, "whole area", reset (back to zipf, $g = -\log_2 p_X$, $x = 4.1$). `document.body.dataset.exCase` follows the toggle (the `.ex-disc`/`.ex-cont` rule).

- [ ] **Step 4: Commit**

```bash
git add src/lib/prob/controls.js src/expectation/controls.js
git commit -m "controls: the case, preset and reset controls move into the lib; the expectation post adds g and play on top"
```

---

### Task 6: Shared macros, a list-valued `mathjax-macros`

**Files:**
- Create: `assets/prob/macros.json`
- Delete: `assets/expectation/macros.json`
- Modify: `assets/differential-entropy/macros.json`
- Modify: `filters/mathjax-macros.lua`
- Modify: `scripts/build-content.sh:33-39` (`deps_newer`)
- Modify: `content/posts/2026-09-29-expectation.md` (front matter, `\mathbb{E}` → `\E`)
- Modify: `content/posts/2026-09-28-differential-entropy.md` (front matter only, in this task)

**Interfaces:**
- Produces: front matter `mathjax-macros:` accepts a string or a YAML list; later files override earlier keys. Shared macros: `dee`, `defeq`, `E`, `pmf{#1}`, `pdf{#1}`.

- [ ] **Step 1: The shared file**

Create `assets/prob/macros.json`:
```json
{
  "dee": "\\mathop{\\mathrm{d}\\!}",
  "defeq": "\\triangleq",
  "E": "\\mathbb{E}",
  "pmf": ["\\mathrm{pmf}_{#1}", 1],
  "pdf": ["\\mathrm{pdf}_{#1}", 1]
}
```

Replace `assets/differential-entropy/macros.json` with:
```json
{
  "pmf": "p",
  "pdf": "f",
  "bw": "\\Delta",
  "Xq": "{X_{\\bw}}",
  "DKL": "{D_{\\mathrm{KL}}}",
  "KL": ["\\DKL(#1\\,\\|\\,#2)", 2]
}
```
(`pmf`/`pdf` here override the shared ones for the properties sections, which still use the bare forms; phase 2b removes them.)

```bash
git rm assets/expectation/macros.json
```

- [ ] **Step 2: The filter takes a list and merges**

Replace `filters/mathjax-macros.lua` with:

```lua
-- mathjax-macros.lua — Read MathJax macros from JSON files and inject
-- them into template metadata.
--
-- Front matter: mathjax-macros: path/to/macros.json
--           or: mathjax-macros: [shared.json, this-post.json]
-- Each file is a JSON object of LaTeX macro definitions. The filter
-- joins the objects' members into one object literal, in order, and
-- stores it in mathjax-macros-json for the template to output verbatim.
-- A later file's key overrides an earlier one's: the template emits a
-- JS object literal, where the last duplicate key wins. A file that
-- cannot be read is reported and skipped; the others still apply.

local function paths_of(field)
  local paths = {}
  if field.t == "MetaList" then
    for _, item in ipairs(field) do paths[#paths + 1] = pandoc.utils.stringify(item) end
  else
    paths[1] = pandoc.utils.stringify(field)
  end
  return paths
end

-- The members of a JSON object file, as one line, without the outer braces.
local function members_of(path)
  local f = io.open(path, "r")
  if not f then
    io.stderr:write("mathjax-macros.lua: cannot open " .. path .. "\n")
    return nil
  end
  local json = f:read("*a")
  f:close()
  json = json:gsub("%s+", " "):gsub("^ ", ""):gsub(" $", "")
  local inner = json:match("^{(.*)}$")
  if not inner then
    io.stderr:write("mathjax-macros.lua: " .. path .. " is not a JSON object\n")
    return nil
  end
  inner = inner:gsub("^ ", ""):gsub(" $", "")
  if inner == "" then return nil end
  return inner
end

function Meta(meta)
  local field = meta["mathjax-macros"]
  if not field then return end
  local parts = {}
  for _, path in ipairs(paths_of(field)) do
    if path ~= "" then
      local m = members_of(path)
      if m then parts[#parts + 1] = m end
    end
  end
  if #parts == 0 then return end
  meta["mathjax-macros-json"] = pandoc.MetaInlines{pandoc.RawInline("html", "{ " .. table.concat(parts, ", ") .. " }")}
  return meta
end
```

- [ ] **Step 3: The build's dependency scan sees every path**

In `scripts/build-content.sh`, `deps_newer`, replace the `for` line with:
```bash
  # a value may be a YAML flow list, `[a.json, b.json]`: drop the brackets and split on commas
  for dep in $(head -30 "$src" | sed -nE 's/^(mathjax-macros|bibliography): *//p' | tr -d "\"'[]" | tr ',' ' '); do
```
and extend the comment above the function with one line: `# \`mathjax-macros\` may list several files.`

- [ ] **Step 4: The posts' front matter**

`content/posts/2026-09-29-expectation.md`: `mathjax-macros: assets/prob/macros.json`.
Then replace every `\mathbb{E}` in that file with `\E` (8 places, lines 16, 21, 32, 43, 48 in the prose and 66, 67 in the menu markup — the menu is `\(…\)` typeset by the page's MathJax, where the macro exists, so `\E` is fine there too):
```bash
sed -i '' 's/\\mathbb{E}/\\E/g' content/posts/2026-09-29-expectation.md
grep -c 'mathbb{E}' content/posts/2026-09-29-expectation.md   # expect 0
grep -c '\\E\[' content/posts/2026-09-29-expectation.md        # expect ≥ 6
```

`content/posts/2026-09-28-differential-entropy.md`:
```yaml
mathjax-macros: [assets/prob/macros.json, assets/differential-entropy/macros.json]
```

- [ ] **Step 5: Build and verify the merge, the override, and the missing-file case**

Run: `make -j4`, then:
```bash
grep -o 'macros: {[^}]*}' _site/posts/differential-entropy/index.html
```
Expected: one object containing `"E": "\\mathbb{E}"` (from the shared file) **and** `"bw"` and both `"pmf"` members, the shared `["\\mathrm{pmf}_{#1}", 1]` first and `"p"` after it. (The template prints the raw string, so the two `pmf` keys are both present in the source; the later one wins when the browser evaluates the literal.)

```bash
grep -o 'macros: {[^}]*}' _site/posts/expectation/index.html
```
Expected: the shared object alone, with `"E"`.

Missing-file check (Review Focus 5): temporarily point a scratch copy at a bad path and build it alone:
```bash
S=$(mktemp -d); cp content/posts/2026-09-28-differential-entropy.md $S/t.md
sed -i '' 's#assets/differential-entropy/macros.json#assets/nope.json#' $S/t.md
pandoc $S/t.md --lua-filter filters/mathjax-macros.lua --template assets/vendor/pandoc-markdown-css-theme/template.html5 --mathjax -o $S/t.html 2>&1 | grep nope
grep -o 'macros: {[^}]*}' $S/t.html | grep -c '"E"'
trash $S
```
Expected: the warning names `assets/nope.json`; the count is 1 (the shared macros still made it in).

Open `/posts/expectation/` and `/posts/differential-entropy/` at `make serve`: every `𝔼` renders in the first; `\dee`, `\Xq`, `\KL{}{}` and the bare `\pmf`, `\pdf` render as before in the second (properties sections).

- [ ] **Step 6: Commit**

```bash
git add assets/prob/macros.json assets/differential-entropy/macros.json filters/mathjax-macros.lua scripts/build-content.sh content/posts/2026-09-29-expectation.md content/posts/2026-09-28-differential-entropy.md
git commit -m "macros: a shared prob set, merged with per-post extras by a list-valued mathjax-macros"
```

---

### Task 7: The entropy post's opening, its wiring and controls

**Files:**
- Modify: `content/posts/2026-09-28-differential-entropy.md` (front matter `js:`; lines 20–139 replaced)
- Modify: `src/differential-entropy/main.js`
- Create: `src/differential-entropy/controls.js`
- Delete: `src/differential-entropy/fig-discrete.js`, `src/differential-entropy/fig-density.js`
- Modify: `assets/css/differential-entropy.css`

**Interfaces:**
- Consumes: `createAreaFigure(svg, ctx, { sweep: false, notes: 'entropy' })` (Task 4); `createTransformFigure` (Task 3); `bindCommonControls` (Task 5); `model.setBeta`, `model.beta` (Task 1).
- Produces: the post's bar `#ex-bar` with `#ex-preset`, `#ex-reset`, `#de-beta`, `#de-betav`, and the figure `<svg id="de-area">`.

- [ ] **Step 1: Confirm nothing else imports the files being deleted**

Run: `grep -rn "fig-discrete\|fig-density" src/ content/ docs/superpowers/plans/2026-10-06-entropy-opening.md`
Expected: only `src/differential-entropy/main.js` (and this plan).

- [ ] **Step 2: Delete the old figures**

```bash
git rm src/differential-entropy/fig-discrete.js src/differential-entropy/fig-density.js
```

- [ ] **Step 3: The post's controls**

Create `src/differential-entropy/controls.js`:

```js
// ================================================================
//  Differential entropy — controls.js
//  This post's control bar: the common controls (case, p_X, reset)
//  plus β, which tempers the pmf (discrete only; the bar hides it in
//  the continuous case through body[data-ex-case]).
// ================================================================

import { bindCommonControls } from '../lib/prob/controls.js';

const $ = id => document.getElementById(id);

export function bindControls({ model, pos, redraw }) {
    const slider = $('de-beta'), label = $('de-betav');
    const common = bindCommonControls({ model, pos, redraw });
    // setBeta notifies the model's subscribers, which redraw
    slider?.addEventListener('input', () => model.setBeta(+slider.value));

    function update() {
        common.update();
        if (slider && +slider.value !== model.beta) slider.value = String(model.beta);
        if (label) label.textContent = model.beta.toFixed(2);
    }

    return { update };
}
```

- [ ] **Step 4: The post's entry**

Replace `src/differential-entropy/main.js` with:

```js
// ================================================================
//  Differential entropy — main.js
//  The opening figure is the expectation post's area figure with g
//  fixed to −log p_X and no sweep: it always shows the whole area,
//  u = 1. The draft section's transform figure shares the model but
//  keeps a position of its own. The later figures bind to their own
//  elements and no-op if they're absent.
// ================================================================

import { createModel } from '../lib/prob/model.js';
import { createPosition } from '../lib/prob/position.js';
import { computeFrame } from '../lib/prob/frame.js';
import { createAreaFigure } from '../lib/prob/fig-area.js';
import { createTransformFigure } from '../lib/prob/fig-transform.js';
import { bindControls } from './controls.js';
import { initQuantize } from './fig-quantize.js';
import { initStretch } from './fig-stretch.js';
import { initMI } from './fig-mi.js';

// Where the pinned figure stands: the whole area, and x past every outcome, so every
// part of p_X and of the height counts as integrated.
const WHOLE = { x: Infinity, u: 1 };

function initEntropyFigure() {
    const areaSvg = document.getElementById('de-area');
    const transformSvg = document.getElementById('ex-transform');
    if (!areaSvg && !transformSvg) return;
    const model = createModel(), pos = createPosition(model);
    // g is fixed: entropy is the expectation of −log p_X
    const ui = { g: 'neglog', gBase: 'neglog', gc: null, ghost: true };
    let controls = null, area = null, transform = null;
    function redraw() {
        area?.draw(computeFrame(model, WHOLE, ui.g));
        transform?.draw(computeFrame(model, pos, ui.g));
        controls?.update();
    }
    const ctx = { model, pos, ui, redraw, customG: () => {}, stopPlay: () => {} };
    controls = bindControls(ctx);
    if (areaSvg) area = createAreaFigure(areaSvg, ctx, { sweep: false, notes: 'entropy' });
    if (transformSvg) transform = createTransformFigure(transformSvg, ctx);
    model.subscribe(() => { pos.refresh(); redraw(); });
    redraw();
}

export function init() {
    initEntropyFigure();
    initQuantize();
    initStretch();
    initMI();
}
```

- [ ] **Step 5: The slider's style in the bar**

Append to `assets/css/differential-entropy.css`:
```css
/* ---- the β slider in the shared control bar (assets/css/expectation.css styles the rest) ---- */
.ex-bar input[type=range] { width: 8rem; margin: 0; accent-color: var(--ex-mass); }
```

- [ ] **Step 6: The post**

In `content/posts/2026-09-28-differential-entropy.md`, front matter: delete the line `  - src/expectation` under `js:` (keep `src/differential-entropy`; keep both `css:` entries).

Replace lines 20–139 (from the intro paragraph through the closing `:::` of the "On the word surprisal" callout, i.e. everything before `# Where $h$ comes from: quantize, then subtract`) with:

````markdown
Shannon's entropy is the expected value of $-\log p_X(X)$. Replace the sum with an integral and the mass function with a density, and you get a formula that looks the same but is not the same kind of object: it can be negative, it changes when you change units, and it is not the limit of any Shannon entropy. Below, the substitution is taken apart one picture at a time.

For a discrete random variable $X$ with pmf $p_X$, the *surprisal* of an outcome $x$ is $-\log p_X(x)$.^[The number of bits an optimal code spends on $x$. The figures take $\log_2$ throughout, so entropies are in bits.] Entropy is its expected value:

$$ H(X) \defeq \E\big[-\log p_X(X)\big] = -\sum_{x} p_X(x)\log p_X(x). $$

We draw this below. First, the natural generalization: let $X$ have a density $p_X$ and keep the formula,

$$ h(X) \defeq \E\big[-\log p_X(X)\big] = -\int p_X(x)\log p_X(x)\,\dee x, $$

the *differential entropy*.^[The recipe looks the same, but $p_X(x)\,\dee x$ is a probability and $p_X(x)$ alone is not: $-\log p_X(x)$ is a log-density, not the information content of an event. The sections after the figure take this apart.]

Both are the expectation of one function, $g(x) = -\log p_X(x)$. As in [Visualizing expected value](/posts/expectation/), lay the probability out along $[0, 1]$ with $u = F_X(x)$, and the expectation is an area:

$$ \E\big[-\log p_X(X)\big] = \int_0^1 -\log p_X\big(F_X^{-1}(u)\big)\,\dee u. $$

```{=html}
<div class="ex-bar wide extra-wide" id="ex-bar">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="ex-preset">\(p_X\)</label><select id="ex-preset"></select></div>
<div class="ex-grp ex-disc"><label class="ex-lab" for="de-beta">\(\beta\) = <b id="de-betav">1.00</b></label><input type="range" id="de-beta" min="0" max="5" step="0.05" value="1"></div>
<div class="ex-grp"><button type="button" id="ex-reset">↺ reset</button></div>
</div>
```

::: {.wide .extra-wide .ex-wrap}
```{=html}
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-area" role="img" aria-label="Entropy as the area under minus log p_X of the inverse CDF over the unit interval, with the surprisal to its left and the map from x to u above it"></svg></div></figure>
```
:::

::: {.de-caption}
Drag $p_X$ to reshape it. In the discrete case, $\beta$ tempers the pmf: the figure shows $p_X^{\beta}(x) \propto p_X(x)^{\beta}$, uniform on its support at $\beta = 0$ and a single outcome as $\beta \to \infty$.^[{-} Temperature scaling with $\beta = 1/T$; see [temperature scaling and truncation](/posts/temperature-scaling/).]
:::

````

Check the result: `grep -n "^# " content/posts/2026-09-28-differential-entropy.md` should list `# Where $h$ comes from…` first, then the other properties headings, then `# Draft: the quantile function`. `grep -c "de-a-\|de-b-" …` should be 0.

- [ ] **Step 7: Build, test, look**

Run: `make test && make -j4`.
Expected: tests pass; both bundles build; no `fig-discrete`/`fig-density` in the entropy bundle (`grep -c initDiscrete _site/assets/js/differential-entropy.bundle.js` → 0).

Open `/posts/differential-entropy/` at `make serve` and check, in order:
1. First paint: the area figure at $u = 1$, the result box showing `H(X) = 𝔼[−log₂ p_X(X)] = 2.xxx bits`, the average-height line labelled `H(X)` in the area panel (`h(X)` once continuous). No cursor line in any panel, no crosshair, no dots on the curves, no running-integral panel, no current-pair line in the map.
2. Hovering the panels: no `ew-resize` cursor anywhere except on a $p_X$ handle. Dragging the area plot does nothing.
3. Drag a lollipop: the pmf changes, the blocks and the result follow.
4. Move β to 2: faint dashed lollipops appear at the base heights; the solid ones sharpen; $H$ falls. Drag a solid lollipop's head: nothing happens unless you grab at the faint base height, where it drags (Review Focus 2). Move β to 0: uniform, $H = 3$ bits; pick one-hot: the one atom stays, $H = 0$.
5. Toggle to continuous: the β group disappears; drag the Gaussian's peak handle up — $h$ turns negative and prints magenta; the result reads `h(X) = …`.
6. Reset: back to zipf, β = 1.00, the label updates.
7. The draft section at the bottom: its transform figure still works, with its own position (click on its uniform strip moves its lines; the opening figure is unaffected).
8. Phone width (devtools, 390px): the bar wraps; the figure scrolls horizontally inside its frame.

Also open `/posts/expectation/` once more: unchanged.

- [ ] **Step 8: Commit**

```bash
git add -A content/posts/2026-09-28-differential-entropy.md src/differential-entropy assets/css/differential-entropy.css
git commit -m "differential-entropy: the opening on the shared expectation figure, pinned at u = 1, with beta tempering"
```

---

### Task 8: Docs, memory, wrap-up

**Files:**
- Modify: `docs/authoring.md` (if it documents `mathjax-macros`)
- Modify: `CLAUDE.md` (the Math paragraph)

- [ ] **Step 1: Document the list form**

Run: `grep -n "mathjax-macros" docs/authoring.md CLAUDE.md`.
In `CLAUDE.md`'s Math paragraph, change `Per-page macros go in assets/<page>/macros.json, referenced via mathjax-macros: <path> in front matter.` to:
```
Macros shared across posts live in `assets/prob/macros.json`; per-page macros go in `assets/<page>/macros.json`. Front matter takes one path or a list, `mathjax-macros: [assets/prob/macros.json, assets/<page>/macros.json]`, later files overriding earlier keys.
```
Make the equivalent edit wherever `docs/authoring.md` describes the key.

- [ ] **Step 2: Build once more and commit**

Run: `make -j4 && make test`.
```bash
git add CLAUDE.md docs/authoring.md
git commit -m "docs: mathjax-macros takes a list; shared macros in assets/prob"
```

- [ ] **Step 3: Report**

Tell the user what to look at: `/posts/differential-entropy/` (the opening) and `/posts/expectation/` (should be unchanged), with the checklist from Task 7 step 7. Leave deployment to them: the post is still `unlisted`, and 2b (the properties sections) is the next spec.
