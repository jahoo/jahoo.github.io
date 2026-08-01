# Anchored-KL post: f(α)/f′(α) plot + Lambert-W aside

**Date:** 2026-08-01
**Status:** approved (design discussed and accepted in session)

## Goal

In `content/posts/2026-07-31-anchored-forward-kl.md`, make the Step-2
one-variable calculus argument visible: a live plot of `f(α)` and `f′(α)`
that updates with β, marking the unique interior minimizer `α_β`, flowing
into the fixed-point expression. Separately, add a self-contained collapsible
note deriving the Lambert-W closed form for `α_β`, easy to delete if the
author decides against including it.

## Placement and coupling (decided)

- The plot lives **inside the folded Step-2 derivation** `<details>` block,
  right after the `f′/f″` display and the uniqueness sentence.
- It is driven by the **shared global β and Z** (the post's "one β, many
  views" convention). A small **local β slider** inside the fold is two-way
  synced with the main slider (same log scale, same snap endpoints 0 and ∞).
  Z is the live Z of the viz's configured prior/potential.
- The `α_β` marker on the plot is **draggable** (sets β via `betaOfAlpha`,
  like the segment dot).

## Content changes (markdown)

1. Step-2 fold: extend the uniqueness sentence to point at the figure;
   insert `.viz` canvas `#cv-akl-f` (~280px tall) plus a local β slider row;
   then a transition sentence ("that marked point is what the fixed-point
   expression describes") into the existing fixed-point math.
2. New `<details>` aside directly after the derivation fold, before the
   "how the weight moves" aside: **"Aside: solving the fixed point in closed
   form (Lambert W)"**. Contents: substitution `x = 1/α_β` → `(x−1)e^{x/β} =
   (1−Z)/Z` → canonical `s e^s` form →
   `α_β = 1/(1 + β·W₀(((1−Z)/(Zβ))·e^{−1/β}))`;
   argument positive ⇒ principal branch, unique (matches convexity);
   both asymptotics of the neighboring aside fall out of `W₀(u) ≈ u`.
   Self-contained, one block, trivially deletable.

## Plot design

Two stacked panels sharing the α axis (α from 0 to 1):

- **Top: f(α)** — convex curve, dot at the minimum.
- **Bottom: f′(α)** — increasing curve, dashed horizontal zero line, dot at
  the zero-crossing.
- Dashed vertical line through both panels at `α_β`; light reference tick
  at `Z` on the α axis.
- y-ranges clipped (f → ∞ as α → 0⁺; f′ → ±∞ at both ends): window chosen
  from the curve on a central sub-interval, curves clipped to the panel
  like the margin plot's approx curve.

Endpoint handling (slider snap points):

- β = 0: draw the limit `f = log(1/α)` (minimizer at boundary α = 1, dot
  there; f′ = −1/α has no interior zero).
- β = ∞: draw the normalized limit `f/β = d(α‖Z)` with a small label saying
  so; minimizer at Z.

## JS changes (existing module split)

- `src/anchored-kl/model.js`: pure `fOfAlpha(Z, beta, a)` and
  `fPrimeOfAlpha(Z, beta, a)`.
- `src/anchored-kl/model.test.js`: f′ vanishes at `solveAlpha`'s root;
  f′ strictly increasing; f′ matches numeric derivative of f.
- `src/anchored-kl/drawing.js`: `drawFPlot(ctx, w, h, data)` renders the
  two panels; returns dot hit-info (`{dot, alphaOfX}`) for dragging.
- `src/anchored-kl/main.js`: bind `#cv-akl-f` and the local slider; local
  slider sets global β (all views update) and is kept in sync on every
  redraw; `bindBetaDot` on the new canvas; redraw on the parent
  `<details>` toggle (canvas has zero size while folded — same trick as
  the margin-toggle listener).
- CSS: reuse existing `.akl-*` styles; add minimal rules in
  `assets/css/anchored-kl.css` only if the fold slider row needs them.

## Not doing (YAGNI)

- No new colors (reuse neutral/accent scheme).
- No Z control inside the fold (Z stays the viz's).
- No changes to the continuous-potential section.

## Testing

- `make test` for the new model functions.
- Visual check via `make serve`: open the fold, move both sliders, drag
  all three dots, hit both endpoints, resize.
