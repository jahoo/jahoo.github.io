# Native port of the rejection-sampling post

**Date:** 2026-08-12
**Status:** design approved, ready for planning

## Goal

Replace the iframe-embedded Quarto HTML in the 2022 rejection-sampling post
with a native site post, and make the original Quarto document the single
editable source of truth for both prose and figures.

Today `content/posts/2022-08-29-rejection-sampling-expo.md` is a stub whose
whole body is an 8150px-tall `<iframe>` pointing at a frozen Quarto export
(`assets/rejection-sampling-expo/q/notebooks/rejection-sampling-expo.html`).
The page therefore has no sidenotes, no site typography, no dark mode, no
working in-page navigation, and nothing about it can be edited without
regenerating the export by hand.

## Source material

`/Users/v/GitLab/diss/notebook/notebooks/rejection-sampling-expo.ipynb` — a
4.5MB Julia notebook (kernel `julia-1.10`), 30 cells: 15 markdown, 14 code, 1
raw front-matter cell. It uses Distributions, Plots, StatsPlots, LaTeXStrings,
IntervalUnionArithmetic, StatsBase, LinearAlgebra.

Structure:

- `## Definitions` → `### Rejection sampling algorithm`, `### Guess-and-check sampling algorithm`
- `## Demonstrations` → `### Rejection sampling` (with `### Simulation {.unnumbered}`),
  `### The guess-and-check algorithm, a special case`
- Three collapsible asides: *What about a different proposal?*, *What about
  sampling until success?*, *Related algorithms* (containing `### Slice sampling algorithm`)
- `## References {.unnumbered}`

Inventory: 9 figures, 6 with `#| label: fig-*` and `fig-cap`; 5 cross-reference
uses; 5 citations; 7 `.callout-note` divs, 3 with `collapse="true"`; 6 cells
with `#| code-fold: true`; 14 Julia code fences.

## Decisions

These were settled with the user before writing this spec.

1. **Quarto `.qmd` as source of truth, with committed computed outputs.** Normal
   `make` must not require Julia; re-running the Julia is an explicit, opt-in step.
2. **Figures render as deliberate light "figure cards"** — white plot panel,
   padding, subtle border, rounded corners, identical in light and dark mode. No
   SVG post-processing; the Plots.jl output ships byte-for-byte as produced.
3. **Phased rollout.** Phase 1: the new post is `unlisted: true` and the existing
   expo post is left completely untouched and still listed. Phase 2, only after
   the user confirms the new version is good: the old post becomes an unlisted
   redirect stub preserving its URL, and the new post becomes the listed one.
4. **Approach B — Quarto as a pure execution engine** (see below).

## Why approach B

Two rejected alternatives:

- **A. Quarto-native, then translate.** Keep Quarto idioms and write a Lua filter
  to convert Quarto's output to site conventions. Rejected: it means maintaining a
  translation layer against two moving targets, and Quarto degrades figure nodes
  before any filter of ours would see them.
- **C. Split source.** A Julia figure-only script plus a separate native `.md`.
  Rejected: two sources of truth, the thing this work exists to avoid.

The site's pandoc pipeline already does everything Quarto would do for this
document — citeproc citations, pandoc-crossref, `filters/callouts.lua`, MathJax,
section numbering via `--number-sections`. The only capability it lacks is
executing Julia.

So Quarto should not render the document. It should execute the Julia, write the
figures, and pass the prose through untouched, after which the existing site
build compiles it exactly like every other post.

### Evidence

Probes run against Quarto 1.8.26 during design:

| Behaviour | `--to markdown` | `--to gfm` |
|---|---|---|
| Quarto callout (`.callout-note`) | → blockquote | → blockquote |
| Div class Quarto does not know | **preserved as `::: sitenote-note`** | raw HTML |
| `[@mackay.d:2003book]` | **verbatim** | escaped `\[@…\]` |
| `![cap](p){#fig:x}` | **attributes preserved** | attributes dropped |
| Quarto figure nodes | `WARNING … does not support FloatRefTarget` | n/a |

`--to markdown` is therefore the target, **provided the document avoids Quarto's
own callout, figure, and cross-reference machinery** and uses site-flavoured
syntax that Quarto does not recognise and passes through verbatim.

Two further probe results shape the design:

- **Quarto inlines figures; it writes no image files.** The user's successful
  `quarto render --execute` produced a 2MB HTML containing 9 inline `<svg>` tags
  and zero figure files. Getting SVGs onto disk requires explicit `savefig`.
- **Quarto rewrites front matter.** `title`, `date`, `author`, `tags`, `unlisted`,
  `link-citations`, `reference-section-title` survive; `css:`, `toc:`, and
  `bibliography:` are consumed as format options and vanish from the emitted YAML;
  a duplicate `authors:` and a stray `toc-title:` are added. Since
  `build-content.sh` greps the generated `.md` for `^toc: *true` and
  `filters/asset-paths.lua` resolves `css:` from front matter, these losses would
  silently break the page.

### Toolchain status

Verified present: Quarto 1.8.26, pandoc 3.9.0.2, juliaup with **lts 1.10.11 as
default** (the notebook wants 1.10.8), IJulia installed, Jupyter kernel
`julia-1.10` registered. The user confirmed `quarto render
rejection-sampling-expo.ipynb --execute` runs the 2022 code successfully. The
original toolchain risk in this design is therefore **closed**.

All five citation keys — `bishop.c:2006book`, `chopin.n:2020book`,
`freer.c:2010`, `mackay.d:2003book`, `neal.r:2003` — exist in `source.bib`.

## Architecture

```
content/posts/2022-08-29-rejection-sampling.qmd     source of truth (committed)
   │
   │  make notebooks   — only when the .qmd is newer than the .md
   │    1. quarto render --to markdown --execute
   │    2. front-matter swap: drop Quarto's YAML, prepend the .qmd's verbatim
   │    3. Julia savefig() calls have already written the SVGs
   ▼
content/posts/2022-08-29-rejection-sampling.md      generated, committed
assets/rejection-sampling/fig-*.svg                 generated, committed
   │
   │  make content — existing build-content.sh, unchanged
   ▼
_site/posts/rejection-sampling/index.html
```

Both the generated `.md` and the SVGs are committed. That is what makes a plain
`make` work with no Julia present, and it is the same philosophy as Quarto's
`freeze`. The generated `.md` carries a `DO NOT EDIT — generated from .qmd`
header comment.

The `.qmd` and generated `.md` sit adjacent in `content/posts/` because
`build-content.sh` derives the URL slug and date-stripping from a file's
location in `content/posts/`, and `scripts/build-index.lua` scans the same
directory for the listing. `build-content.sh` globs `content/posts/*.md`, so the
`.qmd` is ignored by the existing loop and needs no changes there.

### Conventions inside the .qmd

Written in site-flavoured markdown, not Quarto-flavoured:

- **Figures.** Julia cells set `#| output: false` and call `savefig`. Quarto
  executes with the working directory set to the `.qmd`'s own location, so the
  path is repo-relative *from `content/posts/`*:
  `savefig("../../assets/rejection-sampling/fig-<name>.svg")`. The figure is then
  placed by an ordinary markdown image line with a hand-written caption, using the
  served URL:
  `![Caption text.](/assets/rejection-sampling/fig-setup.svg){#fig:setup}`.
  Captions and cross-references live in prose, editable without re-running Julia.
- **Cross-references.** `#fig:name` / `@fig:name`, pandoc-crossref's syntax, not
  Quarto's `fig-name`. The 6 existing labels are renamed accordingly.
- **Callouts.** Quarto and the site collide on the name `callout-note`: both
  recognise it, and Quarto wins first, flattening it to a blockquote. So `.qmd`
  sources use the Quarto-safe aliases `::: {.note}`, `::: {.warning}`,
  `::: {.tip}`, `::: {.important}`, which Quarto does not treat as callouts and
  passes through verbatim. `filters/callouts.lua` gains these four aliases
  alongside the existing `callout-*` names, which remain the canonical syntax for
  ordinary hand-written `.md` posts. Nothing about existing posts changes.
  Probe-confirmed: `::: {.note}`, `::: {.warning}`, and `::: {.note collapse="true"}`
  all survive `--to markdown` verbatim, the `collapse` attribute included.
- **Citations.** `[@key]` passed through verbatim to citeproc.
- **Folded code.** The 6 `code-fold: true` cells become explicit `<details>`
  blocks in the source.

### Site-side changes

1. **`filters/callouts.lua`** gains support for a `collapse` attribute, rendering
   `<details>`/`<summary>` instead of a plain div, so the three collapsible asides
   keep their original behaviour. Existing callouts without the attribute are
   unaffected.
2. **`assets/css/rejection-sampling.css`** — new, page-scoped: the figure-card
   treatment and `<details>` styling for folded code.
3. **`Makefile`** gains a `notebooks` target and adds `assets/rejection-sampling`
   to `STATIC_DIRS`. The target is *not* wired into `all`; it runs on demand, so
   the default build never invokes Quarto or Julia.
4. **`assets/rejection-sampling/references.bib`** — a per-page bib extracted from
   `source.bib` with the five keys, following the pattern of
   `assets/smc-resampling/references.bib`.
5. **`docs/authoring.md`** gains a short section on the qmd-backed post workflow.

## Phasing

**Phase 1 (this work).** New post at `content/posts/2022-08-29-rejection-sampling.qmd`
with `unlisted: true`, so it gets a shareable URL at `/posts/rejection-sampling/`
and a noindex header but stays out of the blog listing. The existing
`2022-08-29-rejection-sampling-expo.md` and its assets are not touched at all.
Both posts build and deploy side by side.

**Phase 2 (deferred, needs explicit go-ahead).** Remove `unlisted: true` from the
new post. Replace the old post's body with a redirect stub — meta refresh plus
`<link rel="canonical">` — and mark it `unlisted: true` so it leaves the listing
while `/posts/rejection-sampling-expo/` keeps resolving. This preserves the link
in Tim Vieira's `rejection-sampling-alive` README, which points at the old URL.

## Verification

- `make` from a clean tree with no Julia on PATH must build the post. This is the
  load-bearing check for the committed-outputs design.
- `make notebooks` regenerates the `.md` and SVGs. The target must be a no-op when
  the `.qmd` is older than its outputs, so an ordinary build never re-runs Julia.
- The 5 cross-references resolve to numbered figure links, not literal `@fig:` text.
- The 5 citations resolve and a References section appears.
- The 3 collapsible asides render collapsed and open on click.
- Page renders correctly in both light and dark mode; figures read as intentional
  cards in both.
- Old post at `/posts/rejection-sampling-expo/` is byte-identical to before.

## Accepted trade-offs

- **SVG churn on regeneration is fine.** Whether Plots.jl emits byte-identical
  SVGs across runs does not matter here: the figure-generating code changes rarely,
  so regeneration is a deliberate act — once at the start, then a few times while
  tweaking dimensions. Committed figures are the normal state; a noisy diff on the
  rare re-render is an acceptable cost and needs no mitigation.

## Open questions

- **Figure width.** The original renders at 650×325 with `fig-align: right`. The
  site's content column width may want different sizing; to be judged visually
  once the first figures land.
