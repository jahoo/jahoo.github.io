# Vendored: pandoc-markdown-css-theme

**Upstream:** https://github.com/jez/pandoc-markdown-css-theme
**Commit:** a8046cc48ed68d219206d98ebb5604cc09104096
**Vendored on:** 2026-04-18
**Author:** Jacob Zimmerman ([@jez](https://github.com/jez))
**License:** Blue Oak Model License 1.0.0 (code); CC-BY-SA 4.0 (text/images). Fonts are not distributed here.

## Files vendored

- `template.html5` — Pandoc HTML template. **Contains one local edit** (see below).
- `theme.css` — CSS. Unmodified from upstream.
- `pandoc-sidenote.lua` — Lua filter. Unmodified from upstream.

## Local edits

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
