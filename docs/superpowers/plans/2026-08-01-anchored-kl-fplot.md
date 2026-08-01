# Anchored-KL f(α)/f′(α) Plot + Lambert-W Aside Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live two-panel plot of the reduced objective `f(α)` and its derivative `f′(α)` inside the anchored-KL post's Step-2 derivation fold, marking the unique interior minimizer `α_β`, driven by the shared global β/Z — plus a self-contained, deletable `<details>` aside deriving the Lambert-W closed form for `α_β`.

**Architecture:** The post's viz is one ES-module bundle (`src/anchored-kl/`) with global state (β, prior, validity mask) and several canvases as views of it. We add pure math to `model.js` (tested), a renderer `drawFPlot` to `drawing.js` (untested, like all canvas code here), and wiring in `main.js` (new canvas `#cv-akl-f`, a local β slider `#akl-beta-f` two-way synced with the main one, draggable marker dots). Markdown gets the canvas mount + slider row inside the Step-2 fold and a new Lambert-W `<details>` aside.

**Tech Stack:** Vanilla ES modules bundled by esbuild, `node --test`, Pandoc markdown with the `viz-mount.lua` filter (`::: {.viz ...}` → `<canvas>`), MathJax v4 with per-page macros (`\Z`, `\defeq`, `\explain` exist in `assets/anchored-kl/macros.json`).

## Global Constraints

- Node 20+ and Pandoc required; build via `make -j4`, tests via `make test` (or `node --test src/anchored-kl/model.test.js`), dev server via `make serve`.
- 4-space indentation, single quotes, trailing semicolons — match the existing `src/anchored-kl/*.js` style, including the `// ---` section-comment convention.
- No `Co-Authored-By` lines in commits. Commit freely during development (lowercase, descriptive messages); the user consolidates before push.
- Do not touch the deploy path (`make deploy`), the `static` branch, or the continuous-potential section of the post.
- Spec: `docs/superpowers/specs/2026-08-01-anchored-kl-fplot-design.md`.

---

### Task 1: Pure math — `fOfAlpha`, `fPrimeOfAlpha`, `bernKL` in model.js

**Files:**
- Modify: `src/anchored-kl/model.js` (append after `withProb`, before `solveAlpha`)
- Test: `src/anchored-kl/model.test.js` (append; extend the import line)

**Interfaces:**
- Consumes: existing `solveAlpha(Z, beta)` from `model.js`.
- Produces (used by Task 4's `main.js` wiring):
  - `bernKL(a, Z) -> number` — Bernoulli KL `d(a‖Z)`, finite at `a = 0` and `a = 1`.
  - `fOfAlpha(Z, beta, a) -> number` — `f(a) = -log a + beta * d(a‖Z)`, finite β only.
  - `fPrimeOfAlpha(Z, beta, a) -> number` — `f′(a) = -1/a + beta * log(a(1-Z)/(Z(1-a)))`.

- [ ] **Step 1: Write the failing tests**

In `src/anchored-kl/model.test.js`, extend the model import to:

```js
import { normalize, withProb, solveAlpha, betaOfAlpha, epsBeta, anchoredOptimum, bernKL, fOfAlpha, fPrimeOfAlpha } from './model.js';
```

Append at the end of the file (reuses the existing `close` helper):

```js
test('bernKL is the Bernoulli KL, finite at the endpoints', () => {
    close(bernKL(0.3, 0.3), 0);
    close(bernKL(1, 0.3), Math.log(1 / 0.3));
    close(bernKL(0, 0.3), Math.log(1 / 0.7));
    close(bernKL(0.6, 0.2),
        0.6 * Math.log(0.6 / 0.2) + 0.4 * Math.log(0.4 / 0.8));
});

test('fPrimeOfAlpha is the derivative of fOfAlpha', () => {
    const h = 1e-6;
    for (const z of [0.2, 0.6]) {
        for (const beta of [0, 0.4, 3]) {
            for (const a of [0.05, 0.3, 0.62, 0.9]) {
                const num = (fOfAlpha(z, beta, a + h)
                    - fOfAlpha(z, beta, a - h)) / (2 * h);
                close(fPrimeOfAlpha(z, beta, a), num, 1e-4);
            }
        }
    }
});

test('fPrimeOfAlpha vanishes at the solveAlpha root', () => {
    for (const z of [0.1, 0.3, 0.7]) {
        for (const beta of [0.05, 0.5, 2, 20]) {
            const a = solveAlpha(z, beta);
            close(fPrimeOfAlpha(z, beta, a), 0, 1e-6);
        }
    }
});

test('fOfAlpha is minimized at the solveAlpha root', () => {
    for (const z of [0.15, 0.5]) {
        for (const beta of [0.1, 1, 10]) {
            const fmin = fOfAlpha(z, beta, solveAlpha(z, beta));
            for (let i = 1; i < 100; i++) {
                const v = fOfAlpha(z, beta, i / 100);
                assert.ok(v >= fmin - 1e-9,
                    `f(${i / 100}) = ${v} below f(alpha_beta) = ${fmin}`);
            }
        }
    }
});

test('fOfAlpha is finite at alpha = 1', () => {
    close(fOfAlpha(0.3, 2, 1), 2 * Math.log(1 / 0.3));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/anchored-kl/model.test.js`
Expected: FAIL — `SyntaxError: The requested module './model.js' does not provide an export named 'bernKL'`.

- [ ] **Step 3: Implement in model.js**

Insert after `withProb`, before `solveAlpha`:

```js
// x * log(x / y), continuously extended to x = 0.
const xlogx = (x, y) => (x === 0 ? 0 : x * Math.log(x / y));

// KL between Bernoulli(a) and Bernoulli(Z) — d(a || Z) in the post.
export function bernKL(a, Z) {
    return xlogx(a, Z) + xlogx(1 - a, 1 - Z);
}

// The reduced objective f(a) = log(1/a) + beta * d(a || Z): the value of
// L_beta at the segment point with weight a (finite beta only).
export function fOfAlpha(Z, beta, a) {
    return -Math.log(a) + beta * bernKL(a, Z);
}

// f'(a) = -1/a + beta * log( a(1-Z) / (Z(1-a)) ), strictly increasing on
// (0, 1); its unique root is alpha_beta (NaN at a = 1 when beta = 0 —
// callers stay strictly inside the interval).
export function fPrimeOfAlpha(Z, beta, a) {
    return -1 / a + beta * Math.log((a * (1 - Z)) / (Z * (1 - a)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `make test`
Expected: PASS (all existing + 5 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/anchored-kl/model.js src/anchored-kl/model.test.js
git commit -m "add reduced objective f and f' to anchored-kl model"
```

---

### Task 2: Renderer — `drawFPlot` in drawing.js

**Files:**
- Modify: `src/anchored-kl/drawing.js` (append after `drawAlphaCurve`, before `drawSegment`)

**Interfaces:**
- Consumes: file-local helpers already in `drawing.js`: `SANS`, `IT`, `drawLabel`.
- Produces (used by Task 4):
  - `drawFPlot(ctx, w, h, data) -> { dots: [{x, y}, {x, y}], alphaOfX } | null`
  - `data = { fCurve, fpCurve, Z, alpha, fAtAlpha, fpAtAlpha, fLabel, fpLabel, dotColor }` where `fCurve`/`fpCurve` are `[{a, y}]` sampled with `a` increasing strictly inside `(0, 1)`.

No unit tests: canvas rendering is untested throughout this repo; visual verification happens in Task 5.

- [ ] **Step 1: Implement `drawFPlot`**

```js
// --- f plot: the reduced objective and its derivative over alpha ---
// Two stacked panels sharing one alpha axis in [0, 1]: f(alpha) on top,
// f'(alpha) below. The f window shows the valley: from the minimum up to
// FP_WINDOW nats above it (f explodes at alpha -> 0, so a full-range
// y-axis would flatten the interesting region); the f' window spans the
// slopes at the two edges of that visible valley, so both panels always
// describe the same stretch of curve. Curves are clipped to their panels
// like the margin plot's approx curve. data:
//   fCurve, fpCurve     — [{a, y}] samples, a increasing, strictly in (0,1)
//   Z                   — light dashed reference through both panels
//   alpha               — the minimizer alpha_beta (dashed line + dots)
//   fAtAlpha, fpAtAlpha — exact dot heights
//   fLabel, fpLabel     — panel labels ('f'/'f′'; 'f∕β'/'f′∕β' at beta = ∞)
//   dotColor            — css color for the marker dots
// Returns { dots, alphaOfX } for hit-testing/dragging the marker.

const FP_WINDOW = 3; // nats of f shown above its minimum

export function drawFPlot(ctx, w, h, data) {
    const left = 34, right = 10, top = 8, bottom = 20, gap = 16;
    const W = w - left - right;
    const H = h - top - bottom - gap;
    if (W < 40 || H < 60) return null;
    const fh = Math.round(H * 0.55);
    const F = { y: top, h: fh };            // f panel
    const D = { y: top + fh + gap, h: H - fh }; // f' panel
    const xOf = a => left + Math.max(0, Math.min(1, a)) * W;

    // y-window for f: the valley, from the minimum up to FP_WINDOW nats
    // (or the curve's own max, if it never rises that far)
    const ys = data.fCurve.map(p => p.y).filter(Number.isFinite);
    const fmin = Math.min(...ys);
    const fmax = Math.max(fmin + 1e-6,
        Math.min(Math.max(...ys), fmin + FP_WINDOW));
    // alpha-extent of the visible valley; f' spans its slopes
    const vis = data.fCurve.filter(p => p.y <= fmax);
    const nearest = (curve, a) => curve.reduce((b, p) =>
        Math.abs(p.a - a) < Math.abs(b.a - a) ? p : b);
    let pLo = nearest(data.fpCurve, vis[0].a).y;
    let pHi = nearest(data.fpCurve, vis[vis.length - 1].a).y;
    if (!(pHi - pLo > 1e-6)) { pLo -= 1; pHi += 1; } // degenerate window
    const yF = v => F.y + ((fmax - v) / (fmax - fmin)) * F.h;
    const yD = v => D.y + ((pHi - v) / (pHi - pLo)) * D.h;

    // spines: light left edge per panel, alpha axis under the lower one
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    [F, D].forEach(P => {
        ctx.beginPath();
        ctx.moveTo(left, P.y);
        ctx.lineTo(left, P.y + P.h);
        ctx.stroke();
    });
    ctx.strokeStyle = '#999';
    ctx.beginPath();
    ctx.moveTo(left, D.y + D.h);
    ctx.lineTo(left + W, D.y + D.h);
    ctx.stroke();

    // alpha ticks: 0, Z (italic), 1, plus the axis name
    ctx.font = '9px ' + SANS;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ty = D.y + D.h + 5;
    ctx.fillText('0', xOf(0), ty);
    ctx.fillText('1', xOf(1), ty);
    ctx.font = 'italic 9px Georgia, serif';
    ctx.fillText('Z', xOf(data.Z), ty);
    ctx.font = 'italic 10px Georgia, serif';
    ctx.fillText('α', xOf(0.5), ty);

    // panel labels in the left margin
    drawLabel(ctx, left - 18, F.y + 12, [{ text: data.fLabel, font: IT }]);
    drawLabel(ctx, left - 18, D.y + 12, [{ text: data.fpLabel, font: IT }]);

    // light dashed vertical at Z through both panels
    ctx.save();
    ctx.strokeStyle = '#ddd';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(xOf(data.Z), F.y);
    ctx.lineTo(xOf(data.Z), D.y + D.h);
    ctx.stroke();
    ctx.restore();

    // dashed zero line in the f' panel, when zero is in the window
    if (pLo < 0 && pHi > 0) {
        ctx.save();
        ctx.strokeStyle = '#bbb';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(left, yD(0));
        ctx.lineTo(left + W, yD(0));
        ctx.stroke();
        ctx.restore();
        ctx.font = '9px ' + SANS;
        ctx.fillStyle = '#999';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('0', left - 4, yD(0));
    }

    // dashed vertical at the minimizer, through both panels
    ctx.save();
    ctx.strokeStyle = '#aaa';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xOf(data.alpha), F.y);
    ctx.lineTo(xOf(data.alpha), D.y + D.h);
    ctx.stroke();
    ctx.restore();

    // the curves, clipped to their panels
    const drawCurve = (pts, yMap, P) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, P.y - 1, W, P.h + 2);
        ctx.clip();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let pen = false;
        pts.forEach(p => {
            if (!Number.isFinite(p.y)) { pen = false; return; }
            const x = xOf(p.a), y = yMap(p.y);
            if (!pen) { ctx.moveTo(x, y); pen = true; }
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
    };
    drawCurve(data.fCurve, yF, F);
    drawCurve(data.fpCurve, yD, D);

    // marker dots at (alpha, f) and (alpha, f'), clamped into the panels
    const clampY = (y, P) => Math.max(P.y, Math.min(P.y + P.h, y));
    const dots = [
        { x: xOf(data.alpha), y: clampY(yF(data.fAtAlpha), F) },
        { x: xOf(data.alpha), y: clampY(yD(data.fpAtAlpha), D) },
    ];
    ctx.fillStyle = data.dotColor || '#444';
    dots.forEach(d => {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 3.2, 0, 2 * Math.PI);
        ctx.fill();
    });

    return {
        dots,
        alphaOfX: x => Math.max(0, Math.min(1, (x - left) / W)),
    };
}
```

- [ ] **Step 2: Sanity check**

Run: `make test` (unchanged tests still pass; drawing.js has no tests but the esbuild bundle in Task 5 will catch syntax errors early — optionally run `node --check src/anchored-kl/drawing.js` now).
Expected: PASS / no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add src/anchored-kl/drawing.js
git commit -m "add two-panel f/f' renderer to anchored-kl drawing"
```

---

### Task 3: Markdown — plot block in the Step-2 fold + Lambert-W aside

**Files:**
- Modify: `content/posts/2026-07-31-anchored-forward-kl.md` (Step-2 fold ~line 115; new aside after the derivation `</details>` ~line 139)

**Interfaces:**
- Produces DOM ids consumed by Task 4: canvas `#cv-akl-f`, slider `#akl-beta-f`, readout `#akl-readout-beta-f`; the slider row reuses classes `.akl-controls`, `.akl-controls-label`, `.akl-slider-wrap`, `.akl-slider-ticks` (already styled in `assets/css/anchored-kl.css` — no CSS changes needed).

- [ ] **Step 1: Insert the plot block in the Step-2 fold**

Replace the paragraph at line 115:

```markdown
Since $f'(\alpha) \to -\infty$ as $\alpha \to 0^{+}$ and $f'(\alpha) \to +\infty$ as $\alpha \to 1^{-}$, there is a unique interior minimizer $\alpha_\beta$, the root of $f'$:
```

with:

```markdown
Since $f'(\alpha) \to -\infty$ as $\alpha \to 0^{+}$ and $f'(\alpha) \to +\infty$ as $\alpha \to 1^{-}$, there is a unique interior minimizer $\alpha_\beta$, the root of $f'$. Both facts are visible live below: $f$ falls and then rises (top panel), so the strictly increasing $f'$ climbs through zero exactly once (bottom panel) --- at the marked point, $\alpha_\beta$, always strictly between $\Z$ and $1$. Move $\beta$ and watch the balance shift: small $\beta$ leaves the minimizer pinned near the posterior's $\alpha = 1$; large $\beta$ drags it toward the prior's $\alpha = \Z$. (It is the same $\beta$ --- and the same valid mass $\Z$ --- as in the visualization further below; the marker is draggable. At the $\beta = \infty$ endpoint the panels show the normalized limit $f/\beta = d(\alpha \,\|\, \Z)$.)

::: {.viz #cv-akl-f canvas="true" height="280px" width="100%"}
:::

<div class="akl-controls">
<span class="akl-controls-label">$\beta$:</span>
<div class="akl-slider-wrap">
<input type="range" id="akl-beta-f" min="0" max="1000" value="425">
<div class="akl-slider-ticks"><span>0</span><span>1</span><span>∞</span></div>
</div>
<div><span class="akl-controls-label">$\beta$ =&nbsp;</span><span id="akl-readout-beta-f">0.5</span></div>
</div>

Setting $f'(\alpha_\beta) = 0$ and rearranging describes that marked point as a fixed point:
```

(The `$$\begin{aligned} \frac{1}{\alpha_\beta\,\beta} …$$` block that followed stays unchanged.)

- [ ] **Step 2: Insert the Lambert-W aside**

Directly after the derivation fold's closing `</details>` (before the `<details>` opening "Aside: how the weight $\alpha_\beta$ moves with $\beta$"), insert:

```markdown
<details style="font-size:0.9em; margin:0.3em 0 1.2em;">
<summary style="cursor:pointer; color:#444;">Aside: solving the fixed point in closed form (Lambert $W$)</summary>

The fixed point is transcendental --- no *elementary* closed form exists --- but it does untangle into the **Lambert $W$ function**, the inverse of $w \mapsto w\,e^{w}$. Substitute $x \defeq 1/\alpha_\beta$ and clear the denominator:

$$
\begin{aligned}
(x - 1)\, e^{x/\beta}
&= \frac{1-\Z}{\Z}
&& \explain{substitute $x = 1/\alpha_\beta$; rearrange}
\\[6pt]
s\, e^{s}
&= \frac{1-\Z}{\Z\,\beta}\; e^{-1/\beta}
&& \explain{$s \defeq (x - 1)/\beta$; divide by $\beta\, e^{1/\beta}$}
\\[6pt]
\alpha_\beta
&= \frac{1}{1 + \beta\, W_0\!\Bigl(\dfrac{1-\Z}{\Z\,\beta}\, e^{-1/\beta}\Bigr)}
&& \explain{$s = W_0(\cdot)$; invert $x = 1 + \beta s$}
\end{aligned}
$$

The argument of $W$ is positive, so this lands on the principal branch $W_0$, where the solution is unique --- the same uniqueness that strict convexity of $f$ gave above. And since the argument tends to $0$ at *both* ends of the $\beta$ axis, the two asymptotic regimes of the next aside fall out of the single expansion $W_0(u) \approx u$: as $\beta \to 0$, $1 - \alpha_\beta \approx \beta\,W_0(\cdot) \approx \frac{1-\Z}{\Z}\, e^{-1/\beta}$; as $\beta \to \infty$, $\beta\,W_0(\cdot) \to \frac{1-\Z}{\Z}$, so $\alpha_\beta \to \Z$ (and the next order gives $\alpha_\beta - \Z \approx (1-\Z)/\beta$).

</details>
```

- [ ] **Step 3: Build and check the compiled page**

Run: `make -j4 && grep -c 'cv-akl-f\|akl-beta-f\|Lambert' _site/posts/2026-07-31-anchored-forward-kl.html`
Expected: build succeeds; grep count ≥ 3 (canvas mount rendered by `viz-mount.lua`, slider present, aside present).

- [ ] **Step 4: Commit**

```bash
git add content/posts/2026-07-31-anchored-forward-kl.md
git commit -m "add f/f' plot block to step-2 fold and Lambert-W aside"
```

---

### Task 4: Wiring — new canvas, local slider, draggable dots in main.js

**Files:**
- Modify: `src/anchored-kl/main.js`

**Interfaces:**
- Consumes: `bernKL`, `fOfAlpha`, `fPrimeOfAlpha` (Task 1), `drawFPlot` (Task 2), DOM ids `#cv-akl-f`, `#akl-beta-f`, `#akl-readout-beta-f` (Task 3), plus existing `solveAlpha`/`betaOfAlpha`, `resetCanvas`, `bindBetaDot`, `accentColor`, `sliderToBeta`/`betaToSlider`.
- Produces: nothing new for later tasks (final wiring).

- [ ] **Step 1: Extend imports and state**

Imports — extend the two existing import lists:

```js
import {
    normalize, withProb, solveAlpha, betaOfAlpha, anchoredOptimum,
    bernKL, fOfAlpha, fPrimeOfAlpha,
} from './model.js';
import {
    resetCanvas, getPos, layoutMain,
    drawHBarCol, drawPotentialCol, drawAlphaCurve, drawSegment, drawFPlot,
} from './drawing.js';
```

State — extend the declarations:

```js
let L = null;                 // main-canvas layout, set on every redraw
let hitM = null, hitS = null, hitF = null; // dot hit-test info from the beta plots
let cvMain, cvM, cvS, cvF, slider, sliderF, kSlider; // DOM, bound in init()
let roBeta, roAlpha, roZ, roK, roBetaF;
```

(`ticksWrap` is removed — see Step 2.)

- [ ] **Step 2: Generalize tick labels to all sliders**

Replace `buildTickLabels` (and drop the `ticksWrap` variable and its `querySelector` assignment in `init`):

```js
function buildTickLabels() {
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
```

- [ ] **Step 3: Add the f-plot redraw**

Insert after `redrawMargin` (module level):

```js
// The f plot in the derivation fold: the reduced objective f and its
// derivative over alpha, for the current Z and beta. At beta = infinity
// the drawn shape is the normalized limit f/beta = d(alpha || Z).
function fShapes(Z, b) {
    if (b === Infinity) {
        return {
            f: a => bernKL(a, Z),
            fp: a => Math.log((a * (1 - Z)) / (Z * (1 - a))),
            fLabel: 'f∕β', fpLabel: 'f′∕β',
        };
    }
    return {
        f: a => fOfAlpha(Z, b, a),
        fp: a => fPrimeOfAlpha(Z, b, a),
        fLabel: 'f', fpLabel: 'f′',
    };
}

function redrawF(alpha, Z) {
    if (!cvF) return;
    hitF = null;
    const { ctx, w, h } = resetCanvas(cvF);
    if (w < 40) return; // zero-size inside the closed <details>
    if (Z <= 0 || Z >= 1) return; // degenerate mask: nothing to plot
    const { f, fp, fLabel, fpLabel } = fShapes(Z, beta);
    const N = 240, lo = 0.002, hi = 0.998;
    const fCurve = [], fpCurve = [];
    for (let i = 0; i <= N; i++) {
        const a = lo + (i / N) * (hi - lo);
        fCurve.push({ a, y: f(a) });
        fpCurve.push({ a, y: fp(a) });
    }
    // clamp the marker strictly inside (0, 1): at beta = 0 the minimizer
    // sits on the boundary alpha = 1, where f' is not evaluable
    const aDot = Math.max(lo, Math.min(hi, alpha));
    hitF = drawFPlot(ctx, w, h, {
        fCurve, fpCurve, Z, alpha: aDot,
        fAtAlpha: f(aDot), fpAtAlpha: fp(aDot),
        fLabel, fpLabel, dotColor: accentColor(),
    });
}
```

In `redraw()`, call it right after `redrawMargin(alpha, Z);`:

```js
    redrawF(alpha, Z);
```

and extend the readout/slider sync at the bottom of `redraw()` — after the `roZ` line add:

```js
    if (roBetaF) roBetaF.textContent = fmtBeta(beta);
```

and replace the `if (slider) { ... }` block with:

```js
    [slider, sliderF].forEach(s => {
        if (!s) return;
        // beta can also be set by dragging a dot or the other slider;
        // keep every thumb in sync
        s.value = String(betaToSlider(beta));
        s.style.setProperty('--akl-accent', accentColor());
    });
```

- [ ] **Step 4: Make the marker draggable**

Generalize `dotHit` (the f plot has two dots — one per panel):

```js
function dotHit(hit, pos) {
    if (!hit) return false;
    const dots = hit.dots || (hit.dot ? [hit.dot] : []);
    return dots.some(d =>
        Math.abs(pos.x - d.x) < 12 && Math.abs(pos.y - d.y) < 14);
}
```

Add next to `betaFromSegment`:

```js
function betaFromF(x) {
    const Z = probs.reduce((s, p, i) => s + (valid[i] ? p : 0), 0);
    let b = betaOfAlpha(Z, hitF.alphaOfX(x));
    // snap outside the slider's range, consistent with its endpoints
    if (b < BETA_MIN) b = 0;
    if (b > BETA_MAX) b = Infinity;
    return b;
}
```

In `onMove`, add a branch after the `dotS` case:

```js
    } else if (dragKind === 'dotF') {
        e.preventDefault();
        beta = betaFromF(getPos(cvF, e).x);
        redraw();
    }
```

- [ ] **Step 5: Bind everything in `init()`**

Add to the DOM lookups:

```js
    cvF = document.getElementById('cv-akl-f');
    sliderF = document.getElementById('akl-beta-f');
    roBetaF = document.getElementById('akl-readout-beta-f');
```

After the existing `if (slider) { ... }` block:

```js
    if (sliderF) {
        sliderF.max = String(SLIDER_MAX);
        sliderF.value = String(betaToSlider(beta));
        sliderF.addEventListener('input', () => {
            beta = sliderToBeta(Number(sliderF.value));
            redraw();
        });
    }

    // The f plot's canvas has zero size while its <details> is closed;
    // repaint when the fold opens (same trick as the margin toggle).
    const fold = cvF && cvF.closest('details');
    if (fold) fold.addEventListener('toggle', () => redraw());
```

Next to the existing `bindBetaDot` calls:

```js
    bindBetaDot(cvF, 'dotF', () => hitF, betaFromF);
```

- [ ] **Step 6: Run tests and build**

Run: `make test && make -j4`
Expected: tests PASS; esbuild bundles without errors.

- [ ] **Step 7: Commit**

```bash
git add src/anchored-kl/main.js
git commit -m "wire f/f' fold plot: shared beta, local slider, draggable marker"
```

---

### Task 5: Visual verification

**Files:**
- None expected (fix-ups only, committed separately if needed).

**Interfaces:**
- Consumes: everything above, via the built site.

- [ ] **Step 1: Serve and open**

Run: `make serve` (background), open `http://localhost:4000/posts/2026-07-31-anchored-forward-kl.html`.

- [ ] **Step 2: Walk the checklist**

In the browser (claude-in-chrome or the user's own eyes):

1. Open the "Derivation of the optimum" fold → the two-panel plot renders (not blank: the toggle-repaint works).
2. Move the fold's local β slider → curves reshape, marker slides; the main viz slider, readouts, margin plot, and segment dot all follow.
3. Move the *main* β slider → the fold plot follows (two-way sync).
4. Drag the marker dot in either panel → β updates everywhere; cursor shows `grab` on hover.
5. β = 0 endpoint: f panel shows `log(1/α)` falling to 0 at α = 1, marker at the right edge, f′ panel all-negative (no zero crossing, no stray zero line mishaps).
6. β = ∞ endpoint: labels read `f∕β` / `f′∕β`, minimum sits at Z, f′ crosses zero at Z.
7. Large β (e.g. slider near the right): curves visibly clipped at the panel tops without artifacts; dashed α_β line and Z line sensible.
8. Reconfigure the viz below (paint validity, drag prior bars, change K) → the fold plot's Z tick and curves track the new Z.
9. Resize the window; toggle the fold closed and open again.
10. The Lambert-W aside renders: MathJax displays `W_0`, alignment and `\explain` annotations typeset like the neighboring asides.

- [ ] **Step 3: Fix and commit anything the checklist catches**

Any visual fix goes in the file it belongs to, then:

```bash
git add -A src/anchored-kl assets/css/anchored-kl.css content/posts/2026-07-31-anchored-forward-kl.md
git commit -m "polish f/f' fold plot after visual pass"
```

(Skip the commit if nothing needed fixing.)
