# Vendored: pandoc-markdown-css-theme

**Upstream:** https://github.com/jez/pandoc-markdown-css-theme
**Commit:** a8046cc48ed68d219206d98ebb5604cc09104096
**Vendored on:** 2026-04-18
**Author:** Jacob Zimmerman ([@jez](https://github.com/jez))
**License:** Blue Oak Model License 1.0.0 (code); CC-BY-SA 4.0 (text/images). Fonts are not distributed here.

## Files vendored

- `template.html5` — Pandoc HTML template. **Contains local edits** (see below).
- `theme.css` — CSS. Unmodified from upstream.
- `skylighting-solarized-theme.css` — Syntax highlighting colors (solarized). Unmodified from upstream. Jez's `theme.css` only handles code-block layout — the colors for keyword/string/comment/etc spans live in this separate file.
- `skylighting-paper-theme.css` — Alternative highlighting palette (paper). Unmodified from upstream. Not linked by default; available if you want to swap palettes.
- `pandoc-sidenote.lua` — Lua filter. Unmodified from upstream.

## Local edits

### `theme.css` — align TOC-sidebar breakpoint with main-centering

Upstream has an off-by-one between two breakpoints:
- TOC sidebar (float-left): `min-width: calc(... - 1px)` = 1364px+
- Main centering: `min-width: calc(...)` = 1365px+

At exactly 1364px the TOC floats left but main hasn't yet gained its
centered layout, so there's no left margin for the TOC to occupy — main
text wraps around the TOC instead. Drop the `- 1px` offset on the TOC
rule (line ~1020) so both breakpoints fire together at 1365px+.

### `template.html5` — hard-coded syntax highlighting CSS link

Link `skylighting-solarized-theme.css` in addition to `theme.css`, between the theme link and the overrides link. Jez's `build.sh` does this via `--css` flags; we bake it into the template to keep `--css` available for front-matter per-page CSS.

```
  <link rel="stylesheet" href="/assets/vendor/pandoc-markdown-css-theme/theme.css" />
  <link rel="stylesheet" href="/assets/vendor/pandoc-markdown-css-theme/skylighting-solarized-theme.css" />
```

### `template.html5` — site chrome CSS link

Link `/assets/css/site-chrome.css` on every page. Carries navbar,
post-meta, and footer styling — not theme-specific, shared chrome.

### `template.html5` — `hide-post-title` front-matter flag

Wrap the `<h1 class="title">` emission in `$if(hide-post-title)$$else$...$endif$`
so a page can opt out of rendering its own title (e.g., the homepage where
"home" reads redundantly).

### `template.html5` — `<hr class="post-divider">` between header and TOC

When `$date$` is set in front-matter, the template inserts an `<hr
class="post-divider">` as a sibling between `</header>` and the TOC
(`<nav id="TOC">`). Styled via `.post-divider` in
`assets/css/site-chrome.css` as a subtle 1px line below the post
header and above the content (including the TOC contents).

### `theme.css` — include `hr.post-divider` in header/main/footer layout

Extended six `header, [nav#TOC,] main, footer { ... }` selector lists
to also include `hr.post-divider`. This gives the hr the same width
and alignment as `main` at every media breakpoint (otherwise, as a
sibling of `main` at `body` level, the hr would span the full body
width instead of body-text width).

### `template.html5` — replace `<blockquote class="metadata">` with old-theme post-meta

Drop Jez's stacked metadata paragraphs in favor of a single inline
`<p class="post-meta">` that shows `date · author · tags` under the
title. Markup matches the project's prior theme so existing site-chrome
CSS rules apply cleanly.

### `template.html5` — always-on site-footer with last-modified

Jez's template only renders a footer when `return-url` is set. We
replace that with an unconditional `<footer class="site-footer">`
containing a `last-modified` span (populated by `build-content.sh`
via `--metadata last-modified=...`). Footer renders on every page.

### `template.html5` — hard-coded site overrides link

Immediately after the hardcoded `theme.css` link, we add a second hardcoded link for our site-wide overrides file (`assets/css/overrides.css`), which redefines CSS variables like `--font-family-prose` to customize the theme without editing `theme.css`. Load order: vendored theme → site overrides → per-page `$for(css)$`.

```
  <link rel="stylesheet" href="/assets/vendor/pandoc-markdown-css-theme/theme.css" />
  <link rel="stylesheet" href="/assets/css/overrides.css" />
$for(css)$
  <link rel="stylesheet" href="$css$" />
$endfor$
```

### `template.html5` — hard-coded theme.css link above the `$for(css)$` loop

Pandoc's metadata merge for the `css` key does not compose site-wide defaults with per-page front-matter — a post with a front-matter `css:` list fully replaces any site-level or CLI-provided `css` value. To guarantee `theme.css` is always linked regardless of per-page front-matter, we add a hard-coded `<link>` to it just before the `$for(css)$` loop:

```
  <link rel="stylesheet" href="/assets/vendor/pandoc-markdown-css-theme/theme.css" />
$for(css)$
  <link rel="stylesheet" href="$css$" />
$endfor$
```

### `template.html5` — add `$for(js)$` slot for per-page JS bundles

Jez's template ships no slot for per-page JavaScript (only `$for(include-after)$`, which inserts raw files, not URLs). Our front-matter uses `js: - <name>` to reference bundles built into `/assets/js/<name>.bundle.js`. We add a `$for(js)$` loop just before `</body>`:

```
$for(js)$
<script src="/assets/js/$js$.bundle.js"></script>
$endfor$
```

### `template.html5` — MathJax v4 replaces the `$math$` slot

Upstream ships a `$math$` slot that Pandoc populates based on the `--katex` / `--mathjax` flag. This site uses MathJax v4 with per-page macros loaded from JSON via our `filters/mathjax-macros.lua` filter, which sets the `$mathjax-macros-json$` template variable. We replace the `$math$` slot with an explicit MathJax v4 configuration block so the per-page macros are picked up.

Search upstream for:

```
$if(math)$
  $math$
$endif$
```

Replace with the following. Note: Pandoc templates escape a literal `$` as `$$`, so `'$'` in the emitted JS becomes `'$$'` in the template, and `'$$'` becomes `'$$$$'`.

```
<script>
MathJax = {
  tex: {
    inlineMath: [['\\(', '\\)'], ['$$', '$$']],
    displayMath: [['\\[', '\\]'], ['$$$$', '$$$$']]
$if(mathjax-macros-json)$
    , macros: $mathjax-macros-json$
$endif$
  }
};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js"></script>
```

## Re-syncing with upstream

1. Fetch the upstream file at the new commit.
2. Re-apply the MathJax edit above.
3. Update the Commit + Vendored on fields at the top of this file.
