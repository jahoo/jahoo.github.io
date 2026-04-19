# Jez theme swap — design spec

**Branch:** `jez-theme-swap` (from `source`)
**Date:** 2026-04-18
**Status:** Design approved; pending implementation plan.

## Motivation

The current post styling in this repo cribs loosely from an old version of
[tufte-css](https://edwardtufte.github.io/tufte-css/) and has grown ad-hoc. On
[jez/pandoc-sidenote#PR](https://github.com/jez/pandoc-sidenote) the upstream
author explained the double-`<br>` markup we tried to remove is load-bearing
for adjacent-sidenote separation in the old inline markup, and pointed at
newer block-based sidenotes (`{^}` / `{^-}` prefixes) that avoid the
constraint. His companion project
[pandoc-markdown-css-theme](https://jez.io/pandoc-markdown-css-theme) is a
more polished and principled take on the same ideas than our current
implementation.

The goal of this branch is to rebase our post styling on Jez's theme —
starting with a complete swap of our theming machinery for his, then layering
our remaining custom pieces (navbar, homepage, listing, per-page CSS) back on
top only where they prove useful.

This spec covers v1 only: the raw swap. Restoring custom styling is explicit
follow-up work.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Math engine | Keep **MathJax v4** — swap the `$math$` template slot for our existing MathJax config block |
| 2 | Scope | **Complete swap of all pages** (posts, homepage, listing) — raw preview first, restore custom styling as follow-up |
| 3 | Vendoring | **Direct copy** into `assets/vendor/pandoc-markdown-css-theme/` with `VENDORED.md` recording upstream commit + local edits |
| 4 | Navbar | **`--include-before-body templates/navbar.html`** — keeps Jez's template near-pristine; navbar markup lives in its own file |
| 5 | Sidenote filter | **Use Jez's `pandoc-sidenote.lua` only** — disable our `filters/sidenotes.lua` and `filters/block-marginnotes.lua` |

## Architecture

### Files added

- `assets/vendor/pandoc-markdown-css-theme/`
  - `template.html5` — copied from upstream, one local edit (see §Template edits)
  - `theme.css` — copied from upstream, unmodified
  - `pandoc-sidenote.lua` — copied from upstream, unmodified
  - `VENDORED.md` — upstream URL, commit SHA, date, list of local edits
- `templates/navbar.html` — plain HTML snippet with hardcoded site title + nav links

### Files deleted

- `templates/base.html`
- `assets/css/base.css`
- `assets/css/post.css`
- `assets/css/site.css`
- `filters/sidenotes.lua`
- `filters/block-marginnotes.lua`

### Files kept as-is (orthogonal to theming)

- `filters/callouts.lua`, `filters/mathjax-macros.lua`, `filters/viz-mount.lua`
- `assets/js/collapse.js`, `assets/js/active-nav.js` — retained on disk but **not linked** in v1 (their behaviors — collapsible sections, active-nav highlighting — were features of the old theme and are out of scope for the raw swap)
- `assets/css/smc-resampling.css` and other per-page CSS files — retained and still linked via front-matter `css:`; expected to render with some conflict against Jez's CSS variables (resolved as highest-priority follow-up, see §Out of scope)
- `scripts/build-pubs.js`, `scripts/build-index.lua`, `_generated/index.md`, `_generated/posts.md` — still generated; in v1 the homepage and listing simply render through Jez's template with no custom chrome

## Template edits

### `assets/vendor/pandoc-markdown-css-theme/template.html5`

One edit. Replace the `$math$` slot (around line 30 of upstream) with our MathJax v4 config:

**Upstream:**
```
$if(math)$
  $math$
$endif$
```

**Our edit:**
```html
<script>
MathJax = {
  tex: {
    inlineMath: [['\\(', '\\)'], ['$', '$']],
    displayMath: [['\\[', '\\]'], ['$$', '$$']]
$if(mathjax-macros-json)$
    , macros: $mathjax-macros-json$
$endif$
  }
};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js"></script>
```

This preserves the per-page macros pipeline (`filters/mathjax-macros.lua` → `$mathjax-macros-json$`). Pandoc is invoked with `--mathjax`, which emits `\(...\)` / `\[...\]` and skips KaTeX.

`VENDORED.md` records the upstream commit SHA, vendoring date, and this edit explicitly so future re-syncs can re-apply it.

## Build pipeline changes

### `scripts/build-content.sh`

Change `PANDOC_COMMON`:

```bash
PANDOC_COMMON="--standalone \
  --metadata-file site.yaml \
  --template assets/vendor/pandoc-markdown-css-theme/template.html5 \
  --include-before-body templates/navbar.html \
  --css /assets/vendor/pandoc-markdown-css-theme/theme.css \
  --section-divs --mathjax --citeproc \
  --csl assets/bibliography/apa.csl"
```

After the existing `filters/*.lua` discovery loop, append Jez's filter last:

```bash
FILTER_FLAGS="$FILTER_FLAGS --lua-filter assets/vendor/pandoc-markdown-css-theme/pandoc-sidenote.lua"
```

Jez's filter runs last so it sees the post-processed AST from our earlier filters (`callouts`, `mathjax-macros`, `viz-mount`).

### `Makefile`

Add `assets/vendor` to `STATIC_DIRS` so the vendored theme ships to `_site/`:

```makefile
STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography \
               assets/CV assets/frozen assets/pdfs assets/rejection-sampling-expo \
               assets/simplest_linear_regression_example assets/smc-resampling \
               assets/transform-pdf assets/2022-01-25-MCQLL-talk \
               assets/vendor
```

No other Makefile changes needed.

### CSS path convention change (per-page CSS)

Our deleted `templates/base.html` had a `$for(css)$` loop that prefixed each
css entry with `/assets/css/`. Jez's template emits the raw value. Front
matter in `content/posts/2026-04-08-smc-resampling.md` currently has:

```yaml
css:
  - smc-resampling.css
```

In v1 this must change to an absolute path to keep the `<link>` tag resolving:

```yaml
css:
  - /assets/css/smc-resampling.css
```

This is the only post with a `css:` front-matter entry (verified via
`grep -r '^css:' content/`). One-line fix, included in v1 scope so the
smc-resampling page doesn't 404 on its CSS during the initial preview.

## `templates/navbar.html` contents

Plain HTML, no template vars (because `--include-before-body` inserts raw, un-templated):

```html
<header class="site-header">
  <div class="wrapper">
    <a class="site-title" href="/">
      <span class="site-title-full">jacob hoover vigly</span>
      <span class="site-title-short">jacob vigly</span>
      <span class="site-title-xs">jv</span>
    </a>
    <nav class="site-nav">
      <a class="page-link" href="/">home</a>
      <a class="page-link" href="/posts/">blog</a>
    </nav>
  </div>
</header>
```

Accepted tradeoff: site title strings live in both `site.yaml` and
`templates/navbar.html`. Values change rarely; inconsistency risk is low.

In v1 these classes have no CSS — the navbar renders as unstyled inline
elements. This is intentional for the raw-preview pass; minimal navbar
styling is a v2 follow-up.

## Known regressions accepted in v1

Each of these is intentional — part of "see what Jez's theme looks like as-is":

- Navbar renders as unstyled inline links
- Homepage (`_generated/index.md`) renders pubs list and about section as generic markdown through Jez's template; no custom typography or layout. The `hide-post-title: true` front-matter flag is a no-op under Jez's template (its `<header>` block is unconditional), so "home" will render as a visible h1 title. Accept for v1.
- Posts listing renders as generic list; no floated date/tags; no `post-link-highlighted` accent
- Collapsible sections do not collapse (`collapse.js` not linked)
- Active-nav-link highlighting disabled (`active-nav.js` not linked)
- `no-sidenotes` mode gone (Jez's theme has its own responsive sidenote behavior)
- `::: {.marginnote}` fenced divs in `content/posts/2026-04-08-smc-resampling.md` render as plain `<div>`s. This is the only post in the repo using the fenced-div form (verified via grep for `{.marginnote}` across `content/`).
- Per-page CSS files still loaded. `assets/css/smc-resampling.css` references 17 `var(--s-*)` custom properties (e.g. `--s-surface`, `--s-text-dim`, `--s-accent`, `--s-border`) defined in the deleted `assets/css/base.css`. About half have inline fallbacks in the `var()` calls; the rest will resolve to their initial value (usually black text on transparent background). Expected to look partially broken on the smc-resampling page.

## Verification strategy

No automated tests — this is a visual change. Preview-based verification:

1. `make clean all && make serve` on `jez-theme-swap`
2. Load in browser:
   - **Inline-footnote post** (e.g., `2020-12-16-noisy-channel-coding.md`) — confirm Jez's sidenotes render with the new markup
   - **Post with fenced marginnote div** — confirm only the fenced divs are ugly; rest of the page should be fine
   - **Homepage** — confirm it renders through Jez's theme (will look stripped)
   - **Posts listing** — confirm it renders (will look generic)
   - **Math-heavy post** (e.g., `2023-10-10-surprisal-and-KL.md`) — confirm MathJax v4 loads and macros expand
   - **Interactive post** (`2026-04-08-smc-resampling.md`) — confirm viz-mount filter still injects mount points and JS bundle loads; per-page CSS conflicts likely — document them but do not fix in v1
3. Check browser console for 404s and JS errors
4. Smoke-test nav: click `home` and `blog` from a post; confirm pages load

## Out of scope (follow-up work, in priority order)

Explicitly not in v1. Each deserves its own pass:

1. **`smc-resampling` post reconciliation** — highest priority. This single
   post (`content/posts/2026-04-08-smc-resampling.md`) is the intersection of
   multiple hard cases:
   - Most interactively-involved post in the repo (viz-mount, custom JS, sticky toolbar)
   - Only user of `::: {.marginnote}` fenced divs (depends on the deleted `block-marginnotes.lua` filter)
   - `smc-resampling.css` depends on 17 `var(--s-*)` custom properties defined in the deleted `base.css`

   Until this post is reconciled we can't declare the theme swap viable.
   Work likely involves: (a) migrating the fenced marginnotes to Jez's
   `^[{^-} ...]` syntax or keeping a small compatibility filter; (b) either
   porting our `--s-*` variables onto Jez's variable names or reintroducing
   a minimal `--s-*` variable sheet that shadows Jez's theme vars.
2. **Homepage styling restoration** — Linux Libertine typography, custom
   about/pubs layout.
3. **Posts listing styling restoration** — floated date/tags in the
   sidenote column, post-link underline styling.
4. **Navbar styling** — responsive title switching, nav link typography,
   footer styling.
5. **Collapsible sections** — relink `collapse.js`, port `section.collapsed`
   CSS into a small addition on top of `theme.css`.
6. **`no-sidenotes` mode** — per-page front-matter flag to disable sidenotes.
7. **KaTeX vs MathJax decision** — orthogonal to this spec; revisit once we
   know whether Jez's theme is a keeper.

(Note: migrating the fenced `::: {.marginnote}` divs is part of #1 above;
`smc-resampling.css` is the only per-page CSS in the repo, so there's no
separate audit-all-per-page-CSS pass to do.)
