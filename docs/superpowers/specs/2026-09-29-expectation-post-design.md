# Expectation post, and the entropy post rebuilt on it

**Date:** 2026-09-29
**Status:** approved (design worked out in session through artifact v14; decisions below are the user's)
**Prototype:** `docs/superpowers/specs/2026-09-29-expectation-prototype.html` (the artifact
https://claude.ai/artifact/QpG5Gm7gcCRWmDsLKztSWC, version 14). It is the reference implementation
for both figures; the port keeps its behavior except where this spec says otherwise.

## Goal

Two posts, built on one visualization of expectation.

1. **Expectation as an area** (new). An expectation is a weighted sum. Lay the weights out along
   [0, 1] with the CDF and it becomes an ordinary area under g ∘ F_X⁻¹. A second figure shows why
   the inverse CDF does this.
2. **Differential entropy** (existing, `content/posts/2026-09-28-differential-entropy.md`). Reuses
   the expectation figures with g = −log p_X instead of explaining its own area plots, and gains a
   section on h as the average log-slope of the quantile function.

Post 1 is phase 1 of this work and gets a detailed plan. Post 2's revision is phase 2; it gets its
own plan once phase 1 is merged.

## Throughline of post 1

- Setup: X, F_X, p_X, E[g(X)].
- An expectation is an area: in the discrete case, blocks of width p(x) and height g(x); the only
  thing to explain for densities is "line the mass up", which is x ↦ u = F_X(x).
- Why the inverse CDF works, as a deeper reading after the area figure: F_X⁻¹(u) ≤ x ⟺ u ≤ F_X(x).

## Text policy (user's standing preference)

- Page text is math statements defining the objects and stating the facts. No paragraphs
  describing how to interact, no captions restating the math, no panel titles that repeat the
  page's equations, no readout key duplicating the plots.
- Axis labels and control labels are fine.

## Content of post 1

`content/posts/2026-09-29-expectation.md`, `unlisted: true`, tags `[exploration]`, on branch
`differential-entropy` (the user chose one branch for everything).

1. Definitions (display math and one defining sentence):
   - "Let X be a real random variable with cumulative distribution function F_X(x) = P(X ≤ x),
     and let p_X be the density of its law with respect to a reference measure μ:" followed by
     the case-dependent clause — counting measure (p_X is the probability mass function) or
     Lebesgue measure (p_X is the probability density function). The clause follows the
     discrete/continuous toggle.
   - E[g(X)] = ∫ g(x) p_X(x) μ(dx) = Σ_x g(x) p_X(x)  (discrete) / = ∫ g(x) p_X(x) dx  (continuous).
   - F_X⁻¹(u) = inf{x : F_X(x) ≥ u}      E[g(X)] = ∫₀¹ g(F_X⁻¹(u)) du.
2. The control bar (sticky), then **Figure 1** (the area figure).
3. Display math:
   - F_X⁻¹(u) ≤ x ⟺ u ≤ F_X(x) ⟹ ∫₀^{F_X(x)} p_U(u) du = ∫_{(−∞, x]} p_X dμ,
     {u : F_X⁻¹(u) = x} = (F_X(x⁻), F_X(x)].
   - F_X⁻¹(U) =d X for U ~ Uniform[0, 1] ⟹ E[g(X)] = E[g(F_X⁻¹(U))].
4. **Figure 2** (the transform figure) with its orientation toggle.

## Shared state (both figures)

- **Case:** discrete or continuous.
- **Distribution p_X**, editable, shared by both figures:
  - Discrete: 8 atoms at x = 1, …, 8. Presets: default (softmax of the entropy post's logits),
    unimodal, uniform, peaked, bimodal, zipf (the temperature post's set). Edited by dragging a
    lollipop's head up or down; the other masses rescale to keep the total 1, with floor 0.01
    (the temperature post's rule, `withProb`).
  - Continuous: shapes from the entropy post's model — Gaussian mixtures and piecewise-constant
    "steps". Presets: Gaussian (σ = 0.2), Bimodal (w .62/.38, m −.35/.4, s .13/.2), Steps
    (ts −.55,−.3,−.1,.1,.3,.55; ms .1,.28,.34,.18,.1), Uniform (on [−0.35, 0.35]). Edited with the
    entropy post's handles: a mixture component's peak handle moves its mean sideways and sets its
    height (so its sd) vertically (`setPeak`); steps have step-point dots (`setBreak`) and chunk
    tops (`setLevel`); the uniform is the one-chunk steps shape.
  - Handles appear wherever p_X is drawn: Figure 1's top-right panel, and Figure 2's p_X panel in
    either orientation (so the editor works through a coordinate adapter, not a fixed
    x-horizontal plot).
- **g:** −log₂ p_X(x) (default, "entropy"), p_X(x), x, x².
- **Position (x, u):** one pair, set by whichever was dragged last (`driver`):
  - setting x gives u = F_X(x) (right-continuous: an atom counts once x reaches it);
  - setting u gives x = F_X⁻¹(u) (generalized inverse; in the discrete case, the atom whose block
    holds u; x = 0.5 before any atom when u = 0).
  - After an edit of p_X, the driver's value is kept and the other is recomputed.
- **Plot window (continuous):** computed from the shape (the entropy post's `shapeWindow`), held
  fixed while any drag is live, growing only when the shape presses against an edge
  (`growWindow`), recomputed on release. Shared by both figures so their x-axes agree.
- **Other controls:** grid spacing δ = 1/64 (continuous, Figure 1's bridge; fixed, no slider — user decision),
  the unbuilt rest always shown ghosted (no toggle; user decision), play sweeping x or u (~7 s, steady pace), discrete
  atom-to-atom steps, readouts x, u, g now, area so far, and the total (shown as "–" until
  u = 1).

## Figure 1: the area figure (port of the prototype's `drawD`)

Single SVG, viewBox 1000 × 806, two columns (left 400, gap 28, right 572):
- Top right: p_X over x — lollipops (discrete) or the density with the mass up to x shaded.
  Editable.
- Bottom left: g over x (lollipops or curve), negative values shaded magenta.
- Middle right: the area plot of g(F_X⁻¹(u)) over u; discrete blocks (the current block fills up
  to u), continuous curve with signed fill.
- Between top right and middle right: the map x ↦ F_X(x). Discrete: one line per atom to the end
  of its block. Continuous: lines on an equal-x grid of spacing δ. Its foot is a warped x-axis
  line with labels beneath (segments 1–8, or selected x values) and an "x" legend at its left.
- Bottom right: the running integral ∫₀^u g ∘ F_X⁻¹, over u. The dashed total line appears only
  at u = 1.
- Bottom left, level with the running integral: the integral with its live upper limit and value;
  at u = 1 a large line "E[g(X)] = value" (prefixed "H(X) =" or "h(X) =" when g = −log p_X).
- Crosshair from the point in the area plot to the g panel (height) and to the warped axis
  (position).
- Dragging: top-right and left panels set x; the two lower-right panels set u; the map band moves
  both (solve for x under the cursor along the map line). Handle hits take precedence over
  position drags.

## Figure 2: the transform figure (port of the prototype's `drawT`)

Single SVG, viewBox 1000 × 566; toggle "horizontal axis: x | u" (default x):
- x across: p_X upright on top (x horizontal); the graph u against x below it; the uniform on the
  right (u vertical) so no lines cross.
- u across: the uniform on top; the graph x = F_X⁻¹(u); p_X on the right with x vertical.
- The curve drawn is F_X⁻¹'s graph. Discrete: x = k on (F(k−1), F(k)], open dot at the block's
  start, closed at its end; F_X's flats appear as faint dotted context.
- 40 evenly spaced u-lines, each carried from the uniform through the curve to its x and on to
  p_X(x). A line is coloured iff it lands at or below the current x (⟺ u_j ≤ F_X(x)). The uniform
  shades [0, F_X(x)]; p_X shades the mass up to x.
- If x drives: the blue reading is x ↦ F_X(x) across to the edge of the shaded run (discrete: it
  meets the dotted flat between atoms).
- If u drives: the fiber {u : F_X⁻¹(u) = x} — the discrete block is bracketed on the uniform, its
  lines turn blue, and u is marked inside it; continuous: the single line through u.
- Dragging: uniform and graph panels set u; the p_X panel sets x (unless a handle is hit).

## Visual style

- Site theme (light only), et-book for prose. Figure text in the system sans stack, axis labels in
  italic serif, as in the entropy post's figures.
- Palette: teal = mass/density, magenta = negative values, ochre = discrete quantities,
  blue = "now". Tokens in the post's CSS file, prefixed `ex-`.
- Figures in `::: {.wide .extra-wide}`; the SVG has `min-width: 640px` and the frame scrolls
  horizontally below that (user's decision for phones).

## Code layout

- Shared by both posts, in `src/lib/prob/`:
  - `dist.js` — moved from `src/differential-entropy/dist.js` (distributions, shapes, edit
    rules), plus sampled CDF/quantile helpers.
  - `model.js` — the shared distribution model (case, pmf, shape, presets, samples, window,
    change notification). Pure, tested.
  - `position.js` — the (x, u) pair and its driver. Pure, tested.
  - `region.js` — the multi-panel SVG region helper from the prototype (with sub/superscript
    labels).
  - `edit.js` — drag handles for p_X (lollipop heads; mixture peaks; step points and tops)
    through a coordinate adapter.
- Post 1, in `src/expectation/`: `index.js`, `main.js` (wiring), `controls.js` (the bar),
  `fig-area.js`, `fig-transform.js`.
- The entropy post keeps working unchanged in phase 1 except for its import path to `dist.js`.

## Testing

- `node --test`: dist helpers (sampled CDF/quantile, running integrals, discrete generalized
  inverse), model (presets, edits, window), position (setX/setU, the Galois property
  F⁻¹(u) ≤ x ⟺ u ≤ F(x) on random draws, driver kept across edits).
- Browser: headless Chrome over CDP (the session's `drive*.mjs` pattern) — every drag zone in both
  figures, both cases, both orientations, one lollipop edit and one peak edit reflected in both
  figures, no console errors; screenshots checked.

## Phase 2 (the entropy post, separate plan)

1. §1 discrete: Figure 1 with g fixed to −log p_X; the draggable pmf with β tempering and
   shuffle/reset moves into the shared model/editor.
2. §2 density: the same figure, continuous, with the editable shapes; negativity where p_X > 1.
3. New §3: h = ∫₀¹ log (F_X⁻¹)′(u) du, the average log-slope of the quantile function; Figure 2
   with a slope-1 reference; slope < 1 ⟺ p_X > 1.
4. §4 quantize: the bridge's equal-x grid lines as bins; the H(X_δ) vs h + log(1/δ) readout
   returns here.
5. §5 stretching: explained by §3 (every slope scales by a).
6. §6 differences and the table, unchanged.
Its existing figures A (discrete area) and B (density area) are replaced; C–E stay.
