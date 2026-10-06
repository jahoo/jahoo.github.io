# Differential entropy, phase 2a: the opening, rebuilt on the expectation figure

**Date:** 2026-10-06
**Status:** approved in conversation; written spec for review
**Scope:** the entropy post's opening (definitions + one shared figure), the shared code and
macros this needs, and the removal of the post's own figures A and B. The properties sections
(relabel vs stretch, quantize-then-subtract, the new log-slope section, differences, the table)
are **phase 2b**, with their own spec. They keep working unchanged through this phase.
**Parent spec:** `2026-09-29-expectation-post-design.md` (post 2's revision is its phase 2).

## Goal

Entropy is an expectation. The entropy post should show it with the *same* figure the
expectation post uses, with $g$ fixed to $x \mapsto -\log p_X(x)$, instead of explaining its own
area plots. Two posts, one component, one notation.

## The user's decisions (2026-10-06)

- **One figure instance**, with the discrete | continuous toggle, as in the expectation post.
  Not one per case: the prose is cut down so the opening no longer has separate discrete and
  continuous sections.
- **No sweep.** The figure is pinned at $u = 1$. Nothing in this post is about how the
  expectation builds up as $u$ slides; other things want the reader's attention. This is an
  option on the shared figure, not a fork.
- **Same layout** otherwise: $p_X$ top right, the map $x \mapsto F_X(x)$ to $[0, 1]$, the
  height $-\log p_X$ on the left, the area at full width, the average-height line.
- **Notes kept**, lightly rewritten where the expectation post speaks of a general $g$ and a
  general "expectation": here $g$ is fixed and the expectation is (differential) entropy.
- **Controls differ per post.** The entropy post has the **β tempering slider** for the discrete
  case (it slides any pmf between maximal and zero entropy). The continuous case has no σ
  slider: dragging the density does that, as in the expectation post.
- **Prose minimal.** State the discrete definition, say it will be visualized below, give the
  natural continuous generalization, state it, then the figure. The text supports the math;
  wordiness is expensive. Formal detail goes to sidenotes.
- **Dropped** from the opening: figure A's label shuffle (relabeling invariance is a property
  and goes to 2b, paired with stretching), its $H(p)$ vs $H(p^\beta)$ readouts, and figure B's
  σ slider, family buttons and readouts (peak density, $P(f > 1)$, $2^h$). Some may return in 2b.
- **Notation**: the expectation post's. $p_X$ for the pmf or the pdf (that post already
  introduces this convention), $F_X$, $\E$.

## The opening, as it reads

1. Intro paragraph: the current one, trimmed. The "it can be negative, it changes with units, it
   is not the limit of any Shannon entropy" promise stays; it is what 2b delivers.
2. **Discrete.** $H(X) \defeq \E[-\log p_X(X)] = -\sum_x p_X(x)\log p_X(x)$. One sentence:
   $-\log p_X(x)$ is the surprisal of $x$; it is the height in the figure below.
3. **Continuous.** "First, the natural generalization." $h(X) \defeq \E[-\log p_X(X)] =
   -\int p_X(x)\log p_X(x)\,\dee x$, the *differential entropy*. The "looks the same, is not the
   same object" caveat is a sidenote here, with the detail deferred to the properties sections.
4. **The figure**, preceded by only the shared form from the expectation post, with a link to it:
   $\E[-\log p_X(X)] = \int_0^1 -\log p_X\big(F_X^{-1}(u)\big)\,\dee u$. No explanation of the
   layout: the expectation post does that, and the notes in the figure carry the rest.

Everything currently in §1 and §2 beyond this (the "two facts", the uniform-on-$[0, w]$ example,
"what breaks is the first fact") moves out of the opening and is 2b material. §1 and §2 as
headings disappear; the opening is the post's lead, before the first properties heading.

## The figure in this post

The expectation post's area figure (`fig-area.js`) with two options:

- **`sweep: false`.** The position is $u = 1$, always. Suppressed: the $x$ and $u$ cursor lines
  in every panel, the current-pair line in the map, the crosshair, the running-integral panel
  (the bottom row is the formula's, as at $u = 1$ today), the position-drag zones (the pointer
  only edits $p_X$), $g$-lollipop dragging, and the "slide $u$ to 1" wording. The $u = 1$ state
  the figure already has, with the finished area, its average-height line and the result box, is
  exactly what remains. `pos` is not shared with anything else on the page, so the figure can
  simply hold `u = 1` (`pos.setU(1)` after every model change) rather than grow a second mode.
- **`notes: 'entropy'`.** The wording table below. The default is the expectation post's.

When $\beta \ne 1$ the $p_X$ panel shows the **base** pmf as faint lollipops behind the tempered
ones (figure A's `bar-base` treatment), and the handles sit on the base: dragging edits the
base, the figure shows $p^\beta$. The result is for the tempered pmf.

### Notes and result, entropy variant

| key | expectation post | entropy post |
|---|---|---|
| `n-dist` | The distribution of $X$: what the expectation averages over. | The distribution of $X$: what the entropy averages over. |
| `n-map` | $F_X$ rescales the real line into $[0, 1]$, so that each outcome takes up as much room as its probability. This gives us our horizontal axis. | unchanged |
| `n-g` | The function $g$ gives the height to integrate. | The height is the surprisal, $-\log_2 p_X(x)$. |
| `n-area` | The expectation is the whole area: | The entropy is the whole area: |
| `integral` | $\int_0^1 g\big(F_X^{-1}(v)\big)\,\dee v = 2.31$ | $\int_0^1 -\log_2 p_X\big(F_X^{-1}(v)\big)\,\dee v = 2.31$ |
| `expectation` | $\E[g(X)] = \underbrace{H(X)}_{\text{entropy}} = 2.31\text{ bits}$ | $H(X) = \E[-\log_2 p_X(X)] = 2.31\text{ bits}$; $h(X)$ in the continuous case |
| axis label `rg-y` | $g(x) = -\log_2 p_X(x)$ | $-\log_2 p_X(x)$ |
| axis label `ra-y` | $g(F_X^{-1}(u))$ | $-\log_2 p_X(F_X^{-1}(u))$ |

Negative values print magenta as today. The figure takes bits throughout; the post's prose
writes $\log$ and says once (sidenote) that the figure uses base 2.

### Controls

One sticky bar, built from the expectation post's parts, in this order:

discrete | continuous &nbsp;·&nbsp; $p_X$ preset menu &nbsp;·&nbsp; **β slider** (discrete only) &nbsp;·&nbsp; ↺ reset

- The β slider has figure A's range, 0 to 5 in steps of 0.05, with the label
  "$\beta$ = 1.00". It is hidden in the continuous case through the existing
  `body[data-ex-case]` rule (class `ex-disc`).
- Presets: the shared model's (`DISC_PRESETS`, `CONT_PRESETS`), the same as the expectation
  post, including `custom` once edited.
- Reset: case, preset, window, β = 1, as the page loads.
- Not present: the $g$ menu, the play buttons, "whole area".

## Shared code

### Model (`src/lib/prob/model.js`)

- `m.beta` (default 1) and `m.setBeta(b)`.
- `m.p` stays the **base** pmf: presets set it, `editPmf` edits it, `customP` remembers it.
- `view()` in the discrete case returns the **tempered** pmf as `p` (and `F` from it), and
  `base: m.p` when `beta ≠ 1` (absent otherwise, so the expectation post's view is unchanged).
  Tempering is `dist.js`'s `temper(p, beta)`.
- `reset()` sets `beta = 1`.

### Editor (`src/lib/prob/edit.js`)

Discrete handles sit on `v.base ?? v.p`, so a drag edits the base pmf. `editPmf`'s rule
(`withMass`, `SNAP_P`) is unchanged.

### Figure modules move to the lib

`src/expectation/{fig-area,frame,fig-transform}.js` and `frame.test.js` move to
`src/lib/prob/`. `fig-product.js`, `menu.js` and the play/g-menu parts of `controls.js` stay in
`src/expectation/`: they are that post's alone. `fig-transform.js` is used by the entropy post's
parked draft section, so it moves too.

`createAreaFigure(svg, ctx, opts)` gains `opts = { sweep = true, notes = 'expectation' }`.
The notes live in one table in `fig-area.js` keyed by variant, so adding a variant is adding a
row, not editing the draw code.

### Controls split

`src/lib/prob/controls.js` gets the common part of today's `bindControls`: the case toggle
(`.ex-case` groups), the preset menu (`#ex-preset`, `fillPresets`), reset (`#ex-reset`), and
`update()`. It takes an `onReset` hook and a `stopPlay` hook (a no-op by default) so each
post's extras plug in:

- `src/expectation/controls.js`: play, the $g$ menu, "whole area" (as now, minus the common
  part).
- `src/differential-entropy/controls.js`: the β slider (`#de-beta`, label `#de-betav`), bound to
  `model.setBeta`; reset also puts it back to 1.

### Entry points

- `src/expectation/main.js`: unchanged in behavior; imports from the new paths.
- `src/differential-entropy/main.js`: mounts `createAreaFigure(#de-area, ctx, { sweep: false,
  notes: 'entropy' })` with `ui.g = 'neglog'` fixed, keeps `u = 1` through `pos.setU(1)` on
  every model change, binds the common controls plus the β slider, and still initializes
  figures C–E and the draft section's transform figure as today.
- The entropy post's `js:` list drops `src/expectation`: it loaded that bundle only for the
  draft section's transform figure, which its own `main.js` now mounts from the lib. Two
  bundles each running an `init` on one page was only ever a stopgap. It keeps
  `assets/css/expectation.css`.
- Removed: `src/differential-entropy/fig-discrete.js`, `fig-density.js`, and their markup in the
  post (the `de-a-*` and `de-b-*` blocks). `density-edit.js`, `shape-controls.js`, `svgplot.js`,
  `ui.js` stay while figures C–E need them (2b decides their fate).

### Macros

- New shared file `assets/prob/macros.json`: `dee`, `defeq`, `E` (`\mathbb{E}`), and the
  expectation post's `pmf`/`pdf` (one argument: `\mathrm{pmf}_{#1}`, `\mathrm{pdf}_{#1}`).
- Per-post files keep only what is theirs. Expectation: none left (the file goes). Entropy:
  `bw`, `Xq`, `DKL`, `KL`, dropping its old `E`/`dee`/`defeq`. It **keeps** `pmf: p` and
  `pdf: f` for now, overriding the shared argument-taking ones: the properties sections still
  use them some fifty times and must keep working unchanged through this phase. The opening
  writes $p_X$ literally. 2b removes the two overrides when it rewrites those sections.
- `filters/mathjax-macros.lua` accepts a **list** as well as a string; later files override
  earlier keys. Front matter: `mathjax-macros: [assets/prob/macros.json,
  assets/differential-entropy/macros.json]`. `scripts/build-content.sh`'s dependency scan
  (`deps_newer`) must see every path in the list, so the generated page rebuilds when any
  changes.
- The expectation post's eight literal `\mathbb{E}` become `\E`. The figure labels in JS keep
  `\mathbb{E}`: they are typeset by the page's MathJax, where the macro also exists, but spelling
  it out keeps the lib independent of any post's macro file.

### Styling

`assets/css/expectation.css` already styles everything the figure and bar need, and the entropy
post already loads it. The β slider reuses the entropy post's existing slider styles
(`.de-controls`); the faint base lollipops get `stem-base`/`pin-base` classes next to the
existing `stem-*`/`pin-*` rules.

## Testing

Pure-function tests, as the lib has now (`node --test`):

- `model.test.js`: `view().p` is the tempered pmf and `view().base` the edited one when
  `beta ≠ 1`; `base` is absent at `beta = 1`; `editPmf` edits the base, not the tempered pmf;
  `reset()` restores `beta = 1`; `setBeta(0)` gives the uniform, large β concentrates on the
  argmax.
- `fig-area` notes: the variant table is exported and tested for both variants having the same
  keys (so a missing string can't silently fall back to the other post's wording).
- `frame.test.js` moves with `frame.js`, unchanged.
- `mathjax-macros.lua`: a build-level check that a list front matter merges (the existing
  `make test` has no Lua tests; verify by building the entropy post and grepping the emitted
  `macros:` object for a key from each file).

Manual: both posts at `make serve`, phone width included; the expectation post must be pixel-
identical in behavior (sweep, play, $g$ menu, notes); the entropy figure must show no cursor at
any time and the result box from the first paint; dragging a lollipop at β = 2 moves the faint
base and the tempered one follows.

## Out of scope (phase 2b)

The properties sections and their order; relabel vs stretch as a pair; the log-slope section
built on the transform figure; whether figures C–E move to the lib's `Region`/`mathlabels`
stack; the readouts dropped here; whether the post stays `unlisted` after 2a (it does: 2b
finishes it).
