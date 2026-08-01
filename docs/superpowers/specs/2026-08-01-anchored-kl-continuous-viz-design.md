# Anchored-KL post: continuous-potential visualization

**Date:** 2026-08-01
**Status:** draft (design discussed in session; β-independence decided)

## Goal

Replace the "TODO: build the visualization of the continuous-potential
setting" block in `content/posts/2026-07-31-anchored-forward-kl.md` with an
interactive visualization of the anchored optimum for a **continuous**
potential `φ ∈ [0, 1]` — a compact second instance of the binary viz, plus
a new "reshaping curve" plot that is the continuous analogue of the segment
diagram.

## Math (new model code)

Stationarity of the anchored objective gives, per element, with
`r(y) = q*(y)/p(y)` and one global constant `c` fixed by normalization:

```
φ(y) = Z · r · (β·log r + c)   ≡  g(r)      (increasing branch, r ≥ e^{-c/β})
```

so the optimum is `q* = p · g⁻¹(φ)`: **elements enter only through their
potential value**, via one monotone reshaping curve. `g⁻¹(0) = e^{-c/β}` is
the floor (the binary case's ε_β); the top is compressed (g ~ r log r).

Solver (`model.js`):

- `contOptimum(prior, phi, beta) -> { q, c, rOfPhi, eps, Z }` — nested
  bisection: inner 1-D root for each `r_i(c)` on the increasing branch;
  outer bisection on `c` so that `Σ p_i r_i(c) = 1` (total mass is strictly
  decreasing in `c`). Endpoints: `beta = 0` → posterior `∝ p·φ`
  (handle Z=0 degenerately as in the binary case); `beta = ∞` → prior.
- The displayed "softened potential" is the normalized curve
  `φ̃(φ) = r(φ)/r(1) ∈ (0, 1]`, so `φ̃(0) = ε_β` generalizes the binary
  floor exactly, `φ̃ = identity` at β → 0, and `φ̃ → 1` (flat) at β → ∞.

Tests (`model.test.js`): binary-valued φ recovers `anchoredOptimum`
exactly; β → 0 recovers the posterior and β → ∞ the prior; the returned q
is normalized; the stationarity residual `φ_i − Z·r_i(β log r_i + c)`
vanishes at the solution; `φ̃` is monotone in φ.

## Interface (decided)

- **Own compact instance, fully separate state** — its own prior, its own
  potential array, its own β (and own K, default 10). Nothing linked to the
  binary section's state: same-looking controls, different problem.
- **Nearly identical main canvas**: four columns `φ | p | π | q*β` over one
  row grid. The φ column is *continuous*: horizontal bars in [0, 1] with
  draggable tips (same interaction as the prior column) instead of
  click-to-toggle. Bar colors blend the existing valid-blue ↔ invalid-red
  by φ value. Prior column draggable as in the binary viz; π and q*
  computed.
- **Default potential: a smooth ramp** across the support (≈ sigmoid in the
  element index, spanning ~0.05 to ~0.95), so the floor and the top
  compression are both visible immediately.
- **Hero plot: the reshaping curve** `φ̃(φ)` on [0, 1]² — dashed identity
  diagonal for reference, dashed horizontal at the floor ε_β, dots at the
  currently configured φ_i values. Slides with β: hugs the diagonal for
  small β, flattens toward 1 for large β. No dot-drag on this plot (the
  curve is a function of φ, not β).
- **Controls**: a sticky β bar for the section (`.akl-controls.akl-sticky`
  pattern), same log-scale slider with 0/∞ snaps; readouts β, ε_β, Z. K
  dropdown chip like the main toolbar if a K control is wanted (default:
  include, matching the binary section's toolbar pattern).

## Code structure (share where appropriate)

- `src/anchored-kl/model.js`: add the continuous solver + the normalized
  softened-potential curve helper (pure, tested).
- `src/anchored-kl/drawing.js`: add `drawReshapeCurve`; reuse
  `drawHBarCol` for all four columns (the φ column is `drawHBarCol` with
  `xmax = 1` and `handles: true` — the binary-only `drawPotentialCol`
  stays as-is for the binary section).
- `src/anchored-kl/controls.js` (new): extract the slider log-scale
  mapping (`sliderToBeta`/`betaToSlider`/`SLIDER_MAX`), tick-label
  builder, accent color, and `bindBetaDot` from `main.js` so both
  instances share them. `main.js` keeps the binary instance's state and
  wiring, importing the shared helpers.
- `src/anchored-kl/main-continuous.js` (new): the continuous instance's
  state + wiring (own prior/φ/β/K, own canvases, drag handling), mirroring
  `main.js`'s patterns. `index.js` calls both inits.
- Markdown: replace the TODO block with the section's toolbar, main
  canvas mount, reshaping-curve mount, and connecting prose. New DOM ids
  namespaced `akl-c-*` / `cv-akl-c-*`.
- CSS: reuse `.akl-*` styles; additions only if the new plots need them.

## Not doing (YAGNI)

- No linking of any state (prior, φ, β, K) between the two sections.
- No β-drag on the reshaping curve; no extra margin plots (ε(β) etc.).
- No changes to the binary section's behavior.

## Testing

- `make test` for the solver and curve invariants (the numerical checks
  listed above).
- Visual pass: drag φ bars (floor/compression visibly move), both β
  endpoints, K change resets the instance, sticky bar scoping, binary
  section unaffected.
