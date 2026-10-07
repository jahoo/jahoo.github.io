# Differential entropy, phase 2b: the properties, on one model

**Date:** 2026-10-07
**Status:** approved in conversation; written spec for review
**Scope:** everything in the entropy post after the opening figure: a new first section on
entropy as a width, the three existing property sections rebuilt on the shared probability
model, the table, and the removal of the draft section into a page of its own. The opening
(phase 2a) is unchanged.
**Parent spec:** `2026-10-06-entropy-opening-design.md` (phase 2a), which deferred this.

## Goal

After the opening figure the post covers what the standard references cover (Cover & Thomas
ch. 8; Shannon 1948 Part III; Jaynes's limiting density), in as little text as possible,
visuals first, with one $p_X$ shared by every figure: drag it in the opening and every later
figure follows. The organizing idea is that $2^H$ is an effective number of outcomes and $2^h$
an effective width, both read off the graph of $F_X^{-1}$.

## The user's decisions (2026-10-07)

- One new section, *h is a width*, first after the opening figure, on the transform figure.
- The quantize and stretch figures are rebuilt on the shared model and the shared drawing
  stack. The mutual-information figure is unchanged (it needs a joint distribution).
- The draft section (the plain transform figure) moves to its own unlisted page with a very
  brief description, as a follow-on to the 2022 post *Transforming a pdf*.
- Text stays minimal: a few lines, an equation, a figure, a short caption per section; formal
  detail in sidenotes. $\log$ means $\log_2$ without saying so; units are bits.
- Notation: $p_X$ for pmf and pdf alike, as in the expectation post. No `\pmf`/`\pdf` here.

## The organizing idea

The integrand of the opening, $-\log p_X(F_X^{-1}(u))$, reads off the graph of $F_X^{-1}$:

- Discrete: $F_X^{-1}$ is a staircase, and $p_X(F_X^{-1}(u))$ is the run of the tread at $u$.
  So $2^{H(X)}$ is the geometric mean of $1/\text{run}$: the **effective number of outcomes**
  (perplexity). Uniform on $n$ outcomes gives exactly $n$.
- Continuous: $p_X(F_X^{-1}(u)) = 1/(F_X^{-1})'(u)$, so $2^{h(X)}$ is the geometric mean of
  the slope: the **effective width**. Uniform on $[0, L]$ gives exactly $L$.

Both are "the uniform with the same entropy": on $2^H$ outcomes, or on an interval of length
$2^h$. Every property then follows:

| Property | Count ($2^H$) | Width ($2^h$) |
|--|--|--|
| Sign | A count is $\ge 1$, so $H \ge 0$ | A width can be $< 1$, so $h < 0$ |
| Maximum | $\le n$, so $H \le \log n$ | $\le$ support length $L$, so $h \le \log L$; for fixed variance the Gaussian is widest, $\sqrt{2\pi e}\,\sigma$ |
| Quantize | — | Counting the width in bins: $2^{H(X_\Delta)} \approx 2^h/\Delta$, i.e. $H(X_\Delta) \approx h + \log(1/\Delta)$ |
| Relabel / stretch | Relabeling moves atoms, keeps the count | Stretching by $a$ multiplies the width: $h(aX) = h(X) + \log\lvert a\rvert$ |
| Differences | — | Ratios of widths are unit-free: MI and KL are Shannon quantities |

## The post after the opening figure

Order and content. Each section: text of a few lines, one display equation where one is
named, a figure, a caption of one or two sentences, sidenotes for the formal detail. The
existing prose is cut to this budget, not rewritten from scratch where it already fits.

### 1. h is a width (new)

Text: the integrand on the graph of $F_X^{-1}$; run and slope; $2^H$ as count, $2^h$ as width;
the two uniform cases; sign and maximum fall out. Equation:
$$ h(X) = \int_0^1 \log (F_X^{-1})'(u)\,\dee u, \qquad 2^{h(X)} = \text{geometric mean of the slope}. $$
Sidenotes: the maximum-entropy results (uniform on bounded support; Gaussian for fixed variance,
$h = \tfrac12\log(2\pi e\sigma^2)$) with the reference. Figure: the transform figure in width
mode (below). Caption: drag $u$ to read the run or slope; the dashed box is the uniform with the
same entropy; the uniform presets make it coincide with $p_X$.

### 2. Where h comes from: quantize, then subtract (rebuilt)

Existing text cut to the width reading: the quantized entropy counts the width in bins; the
divergent $\log(1/\Delta)$ is the unit; $h$ is what is left. One added sentence: an atom keeps
$H(X_\Delta)$ finite at that point as $\Delta \to 0$, so a distribution with atoms has no
differential entropy ($h = -\infty$, or undefined for a mixed distribution). Equation: the
existing $H(X_\Delta) \approx h(X) + \log(1/\Delta)$ with the limit. Sidenote: the Riemann-sum
derivation (the existing aligned display moves into a sidenote) and the Cover & Thomas
reference. Figure: the new quantize figure. Caption: the ochre curve is $H(X_\Delta)$; for a
density it rises one bit per halving along the dashed asymptote; for a pmf it is flat at $H(X)$
once $\Delta < 1$; the bars are the bin masses at the current $\Delta$.

### 3. Stretching the axis (rebuilt; relabel pairing)

Existing text cut. Discrete: any relabeling, a shuffle or a stretch, moves atoms and leaves
every probability, so $H$ and the count stay. Continuous: a stretch spreads the same mass over
$|a|$ times the length, so the density drops and the width grows. Equation: the existing
$p_Y(y) = p_X(y/a)/|a| \Rightarrow h(aX) = h(X) + \log|a|$. Sidenotes: the general
$h(g(X)) = h(X) + \E\log|g'(X)|$; translation invariance; the centimetres example. Figure: the
new stretch figure. Caption: heights unchanged against density flattened; the box's label is a
count on one side and a length on the other.

### 4. What survives: differences (text only)

Existing text lightly cut: the two anomalies are additive constants and cancel; MI and KL;
Jaynes's reference density. Figure: the existing MI figure, unchanged in code and markup.

### 5. Side by side (table)

The existing table, rows reworded in the width language where shorter, plus one row,
*Effective size*: $2^H$ outcomes, $\ge 1$ | $2^h$ length, any positive number | the uniform with
the same entropy. The closing citation sentence stays.

### Removed

The `# Draft: the quantile function` section and the HTML comment above it. The content goes to
the new page (below).

## Figures

All figures share one `createModel()` and one `createPosition()`; `main.js` redraws every
figure on any model change. Every new figure's control row has a discrete | continuous
`.ex-case` toggle, which `bindCommonControls` already binds in any number, so all toggles move
together with the opening's. Presets and reset stay in the opening's bar only.

### Figure 1: the transform figure, width mode

`createTransformFigure(svg, ctx, { width = false } = {})`. Unchanged when off. When on:

- **Highlight at the cursor** on the graph of $F_X^{-1}$. Discrete: the tread of the step that
  contains $u$, drawn heavier, with its run labeled $p_X(x)$ in the math layer. Continuous: a
  tangent segment at $(u, F_X^{-1}(u))$, with its slope labeled $1/p_X(x)$.
- **The box** in the $p_X$ panel: a dashed rectangle of area 1 centred on the mean of $p_X$,
  the uniform with the same entropy. Discrete: width $2^{H}$ in atom slots (atoms sit at unit
  spacing on $1..n$), height $2^{-H}$. Continuous: width $2^{h}$ along $x$, height $2^{-h}$.
  For the uniform presets the box coincides with the distribution. The box is drawn even when
  it leaves the panel's window; it is clipped by the panel.
- **Readout**, one line of math under the figure. Discrete: $H(X) = \text{val bits},\;
  2^{H(X)} = \text{val effective outcomes}$. Continuous: $h(X) = \text{val bits},\;
  2^{h(X)} = \text{val effective width}$. Negative values in the `ex-neg` colour, as the area
  figure does.

The cursor $u$ stays draggable and $p_X$ stays editable, as today.

### Figure 2: quantize

New `src/differential-entropy/fig-quantize.js` on the Region/mathlabels stack. Two panels.

- **Left:** $H(X_\Delta)$ against $t = \log(1/\Delta)$ for $t \in [-3, 12]$ (Δ from 8 down to
  $2^{-12}$), step 0.25 in $t$. The region below 0 is shaded. The current Δ is a dot on the
  curve. Continuous: the dashed asymptote $h(X) + t$. Discrete: a dashed level at $H(X)$.
- **Right:** the shared $p_X$ panel as the area figure draws it (editable, same handles), with
  the histogram at bin width Δ drawn in the panel's own units: bin mass for a pmf, bin mass
  over Δ for a density, so the bars sit on $p_X$'s scale in both cases.
- **Bins.** Continuous: edges at $k\Delta$. Discrete: edges at $0.5 + k\Delta$, so Δ = 1 is one
  atom per bin and every Δ < 1 isolates every atom.
- **Control:** a Δ slider over $t$, labeled with Δ as `1/2^k`, an integer, or 3 significant
  figures (the existing `deltaLabel`). The slider is local to this figure.
- **Readouts** in the math layer: $H(X_\Delta)$, $\log(1/\Delta)$, $H(X_\Delta) - \log(1/\Delta)$,
  and $h(X)$ or $H(X)$.
- The curve over the whole range depends only on the distribution and is cached per view.

### Figure 3: stretch

New `src/differential-entropy/fig-stretch.js` on the Region/mathlabels stack. One panel: the
$p_X$ panel showing $Y = aX$ for the current case, the original as a ghost when $a \ne 1$, the
area-1 box for $Y$, and the panel's window refit to the stretched support.

- **Discrete:** atoms at $a\,k$ with unchanged heights; the box spans $2^{H}$ slots of size $a$
  and is labeled with the count, which does not change.
- **Continuous:** density $p_X(y/a)/|a|$; the box has width $2^h\lvert a\rvert$ and is labeled
  with that width.
- **Controls:** a stretch slider, $a = 2^{s}$ for $s \in [-3, 3]$, labeled as a fraction or a
  3-figure number (the existing label rule). A **shuffle** button, shown in the discrete case
  only, that applies a fresh random permutation to the atoms' probabilities. Both are local to
  this figure: the model's $p_X$ is untouched, and this panel is **not editable**.
- **Readouts:** discrete $H(aX) = H(X) = \text{val bits}$; continuous
  $h(aX) = h(X) + \log a = \text{val} + \text{val} = \text{val bits}$.

Decision recorded: the box stretches with the atoms on the discrete side too, and only its
label says count rather than length. The alternative, no box on the discrete side, was
considered and set aside so the two cases are drawn alike.

### Figure 4: mutual information

`fig-mi.js`, its markup, `svgplot.js` and `ui.js` are unchanged.

## The new page

`content/posts/2026-10-07-quantile-transform.md`, `unlisted: true`, tags `[exploration]`.
Title: *Through the quantile function*. A few lines: a uniform $U$ on $[0,1]$ carried through
$F_X^{-1}$ has the law of $X$, which is why inverse-CDF sampling works; evenly spaced $u$ land
with spacing $\Delta u / p_X(x)$, so they bunch where $p_X$ is high. One sentence names
*Transforming a pdf* (2022) as what it builds on, with a link. Then the case toggle, preset
and reset controls, and the plain transform figure (the markup now in the draft section). Front
matter: `js: src/quantile-transform`, `css: assets/css/expectation.css`,
`mathjax-macros: assets/prob/macros.json`.

`src/quantile-transform/{index.js, main.js}`: one model, one position, `bindCommonControls`
with the expectation post's `afterCase` hook (`pos.setU(0.6)`), the plain transform figure.

## Shared code

### `src/lib/prob/width.js` (new, pure)

- `entropyOf(view)` → `{ disc, H }`: $H(X)$ for a pmf (`shannonH`), $h(X)$ for a shape (the
  running integral of $-\log p_X$ over $u$, as `computeFrame` at `WHOLE` computes it; reuse that
  code, don't duplicate the quadrature).
- `boxOf(view)` → `{ cx, w, h }`: centre = the mean of the view (`shapeMoments` or the pmf
  mean on $1..n$), `w = 2^{H}`, `h = 2^{-H}`.

### `src/lib/prob/quantize.js` (new, pure)

- `binMasses(view, D, origin)` → `{ edges, masses }`; `origin` is the bin edge the grid is
  anchored to and defaults by the rule above (0 for a density, 0.5 for a pmf). Continuous masses
  by `gMass` per mixture component or exactly for a steps shape; discrete by summing atoms.
- `quantizedH(view, D)` → $H$ of the masses in bits.
- `quantizeCurve(view, ts)` → `ts.map(t => quantizedH(view, 2 ** -t))`.

### `src/lib/prob/stretch.js` (new, pure)

- `stretchView(view, a, perm = null)` → a view-shaped object for $Y = aX$: for a pmf, atom
  positions `a * k` (the view gains an explicit `xs` array; the drawing code uses it when
  present) with `p` permuted by `perm`; for a shape, samples with `xs` scaled by `a` and `fs`
  divided by `|a|`, `Fs` unchanged, window scaled.
- `randomPerm(n, rng = Math.random)` → a permutation array.

### `src/lib/prob/fig-transform.js`

Gains the `width` option described above. The plain drawing path is unchanged.

### `src/differential-entropy/`

- `main.js`: one model, one position; mounts the pinned area figure (`WHOLE`), the transform
  figure with `{ width: true }` on the real position, the quantize and stretch figures, and
  `initMI()`; every model change redraws all.
- `fig-quantize.js`, `fig-stretch.js`: rewritten as above.
- Deleted: `density-edit.js`, `shape-controls.js`, and the old figure files' contents. Dead CSS
  for the removed figures (`.de-controls`, `.de-seg`, the old readouts) goes from
  `assets/css/differential-entropy.css`; what the MI figure still uses stays.

## Testing

`node --test`, pure modules only; figures are checked in the browser.

- `quantize.test.js`: a pmf is flat at `shannonH(p)` for Δ in {1, 1/2, 1/16} and is 0 once one
  bin holds everything (Δ = 16 on 8 atoms); for the Gaussian preset, `quantizedH + log2(Δ)` is
  within 0.05 of `h` at Δ = 2⁻⁸, and halving Δ there adds 1 ± 0.02 bits; the uniform shape
  preset of width 0.7 at Δ = 0.7/4 with `origin = -0.35` gives 2 bits.
- `width.test.js`: uniform pmf on 8 gives `2^H = 8` and a box centred at 4.5 with width 8 and
  height 1/8; the uniform shape preset gives `2^h = 0.7 ± 1e-3`; `w * h = 1` for every preset.
- `stretch.test.js`: any permutation leaves `entropyOf` unchanged; for the Gaussian preset,
  `entropyOf(stretchView(v, a)).H − entropyOf(v).H` is `log2(a) ± 0.02` for a in {1/4, 3};
  `stretchView` with a = 1 and no permutation returns the same numbers.
- Existing suites (frame, notes, model, edit) keep passing.

Browser check, both cases: drag $p_X$ in the opening and see figures 1–3 follow; the uniform
presets make the box coincide with $p_X$; the quantize curve is flat for a pmf and rises along
the asymptote for a density; shuffle changes the atoms and not $H$; the new page renders and
its figure works. The Chrome extension was disconnected when this spec was written; the check
needs it reconnected or the user's own preview.

## Out of scope

The MI figure's stack; a joint distribution in the model; listing the post (it stays
`unlisted` until the user decides at deploy time); the quantile-transform page beyond its brief
description.
