# Site migration: Jekyll to Pandoc + Make

**Date:** 2026-04-15
**Status:** Draft

## Motivation

The current Jekyll-based site works but has friction for interactive scientific content:

- Kramdown confuses underscores in math with markdown emphasis
- Sidenotes require verbose inline HTML (`<label><input><span>` pattern)
- No native citation support in explorations (jekyll-scholar only works in the main site layout)
- The exploration layout already bypasses most of Jekyll's pipeline — it's essentially standalone HTML that Jekyll happens to serve
- No good story for callouts, cross-references, or other structured content

The goal is a build system that:

- Processes markdown correctly (math, citations, structured content) without fighting the tool
- Gives full control over typography, layout, and HTML output
- Supports custom JavaScript interactivity cleanly
- Keeps JS modular, testable, and reusable across documents
- Separates prose authoring from interactivity code

## Decision

**Pandoc + Make + esbuild.** No framework. Pandoc handles markdown-to-HTML, math, and citations. Lua filters handle sidenotes, callouts, and custom directives. Make orchestrates the build with parallel compilation and incremental rebuilds. esbuild bundles ES module JavaScript.

### Alternatives considered

- **Quarto:** Built on Pandoc, batteries-included (callouts, citations, cross-refs, sidenotes). Rejected because it brings a large framework with opinions about project structure, theming, and output format designed for computational notebooks. Ongoing dependency on a complex project with features we don't need. Better to reimplement the few Quarto features we want (callout boxes, hover citations) as small Lua filters.
- **Eleventy (11ty) + Pandoc:** 11ty handles site structure (collections, templates, dev server), Pandoc handles content. Rejected because it adds a second "brain" for the build (must understand both 11ty and Pandoc), brings a Node.js framework dependency, and the site is small enough that the features 11ty provides (collections, pagination, data cascade) can be handled by a small Lua script.
- **Jekyll with Pandoc as markdown processor:** Keeps Jekyll, swaps Kramdown for Pandoc. Rejected because it retains the Jekyll dependency and its limitations while adding complexity.

## Project structure

```
jahoo.github.io/
├── Makefile
├── site.yaml                     # site-wide metadata (title, URL, nav links)
├── templates/
│   ├── base.html                 # Pandoc template: full page (nav, sidenotes, MathJax, footer)
│   ├── bare.html                 # minimal shell for standalone interactive pieces
│   └── partials/                 # shared HTML fragments included by templates
├── filters/
│   ├── sidenotes.lua             # footnotes → Tufte sidenotes/marginnotes
│   ├── callouts.lua              # ::: {.callout-note} → styled callout boxes
│   ├── viz-mount.lua             # ::: {.viz #id} → DOM mount points for JS
│   ├── citations-hover.lua       # citation hover-to-popup
│   └── ...                       # additional filters as needed
├── content/
│   ├── explorations/
│   │   └── smc-resampling.md
│   ├── posts/                    # blog posts
│   ├── pubs.md                   # publications page (citeproc from .bib)
│   ├── index.md                  # homepage
│   └── about.md
├── src/                          # JS source (ES modules)
│   ├── lib/                      # shared: prng, canvas utils, distribution helpers
│   ├── components/               # web components (complex reusable widgets)
│   ├── smc-resampling/
│   │   └── index.js              # entry point — imports from lib/, binds to DOM
│   └── ...
├── assets/
│   ├── css/                      # modern CSS (custom properties, nesting, no preprocessor)
│   ├── fonts/                    # et-book, Linux Libertine/Biolinum, etc.
│   ├── images/
│   └── bibliography/
│       ├── default.bib           # main site bibliography
│       └── apa.csl               # citation style
├── scripts/
│   ├── build-index.lua           # generates blog listing page from post front matter
│   └── build-pubs.lua            # generates publications page from .bib
├── test/                         # JS tests (against src/lib/ and src/<exploration>/)
└── _site/                        # build output (git-ignored)
```

### Organizing principle

**Content** (markdown prose in `content/`) is separate from **source** (JS modules in `src/`) is separate from **filters** (build-time Lua transforms in `filters/`) is separate from **templates** (page chrome in `templates/`). An exploration has its prose in `content/explorations/`, its JS in `src/<name>/`, and its per-page CSS in `assets/css/`. They come together at build time.

## Templates

### `base.html` — the one main template

Used for everything: explorations, blog posts, regular pages. Provides:

- Site navigation and footer
- Tufte-style layout with sidenotes
- MathJax with custom macros (read from front matter `mathjax-macros` field)
- Per-page JS bundles (read from front matter `js` field → `<script>` tags)
- Per-page CSS (read from front matter `css` field → `<link>` tags)
- Citation bibliography rendering

A simple blog post and an interactive exploration use the same template. The difference is that a blog post has no `js` or `css` fields in its front matter.

### `bare.html` — minimal standalone shell

For one-off interactive pieces that have their own layout entirely (e.g., the divergence-fitting demo). Just `<html>`, `<head>`, `<body>` — no site chrome. Pages opt into this via `template: bare` in front matter.

Raw `.html` files in `content/` are copied to `_site/` as-is without going through Pandoc.

## Pandoc pipeline

Each markdown file is compiled with a single Pandoc invocation:

```sh
pandoc content/explorations/smc-resampling.md \
  --template templates/base.html \
  --metadata-file site.yaml \
  --lua-filter filters/sidenotes.lua \
  --lua-filter filters/callouts.lua \
  --lua-filter filters/viz-mount.lua \
  --lua-filter filters/citations-hover.lua \
  --citeproc --bibliography assets/bibliography/default.bib \
  --csl assets/bibliography/apa.csl \
  --mathjax \
  -o _site/explorations/smc-resampling.html
```

### Front matter

```yaml
---
title: Resampling in Sequential Monte Carlo
date: 2026-04-08
author: Jacob Hoover Vigly
js:
  - smc-resampling
css:
  - smc-resampling.css
bibliography: assets/smc-resampling/references.bib
mathjax-macros:
  state: "s"
  target: "\\pi"
  normwt: "w"
---
```

The template reads `js` and emits `<script src="/assets/js/smc-resampling.bundle.js"></script>`. A simple blog post omits `js` and `css` entirely.

Per-page bibliography files (specified in front matter) override the default site bibliography.

### Lua filters

Filters run in order during Pandoc compilation:

- **`sidenotes.lua`**: Converts Pandoc footnotes to Tufte-style sidenotes and marginnotes. Vendored from [pandoc-sidenote](https://github.com/jez/pandoc-sidenote)'s Lua filter (the preferred usage per its README), extended if needed. Supports the full pandoc-sidenote feature set: numbered sidenotes, unnumbered marginnotes, responsive collapse on narrow screens.

- **`callouts.lua`**: Fenced divs like `::: {.callout-note}` become styled callout boxes. Supports note, warning, tip, important variants (borrowed from Quarto's conventions, implemented as a small filter).

- **`viz-mount.lua`**: Fenced divs like `::: {.viz #my-canvas height="200px"}` become DOM mount points (`<div>` or `<canvas>` elements with the specified ID and attributes). JS code finds these by ID at runtime. This is the bridge between prose and interactivity.

- **`citations-hover.lua`**: Wraps citation links with data attributes containing the full reference text, enabling a small client-side JS snippet to show hover popups over citations.

Additional filters can be added as needed — each is a small, focused Lua file.

### Collapsible sections

Pandoc's `--section-divs` flag wraps headings and their content in `<section>` elements automatically — this replaces the current `explorations-collapse.js` DOM rewriting that manually wraps flat Kramdown headings into sections. A small client-side JS script (much simpler than the current one) adds click-to-collapse behavior and hash navigation support.

### Math

Pandoc parses LaTeX math natively — `$...$` for inline, `$$...$$` for display. Underscores inside math are never confused with markdown emphasis (this is the main pain point being solved). The `--mathjax` flag tells Pandoc to emit MathJax-compatible output.

Custom macros are defined in front matter (`mathjax-macros`) and injected into MathJax's configuration by the template.

### Citations

Pandoc's built-in citeproc processes `[@key]` syntax against `.bib` files. Renders as "(Author, Year)" in text with a full reference list at the end. Uses APA style via a `.csl` file. This replaces both jekyll-scholar (for the publications page) and the manual `bin/cite` workflow (for explorations).

## JavaScript architecture

### ES modules + esbuild

JS is authored as standard ES modules (`import`/`export`). esbuild bundles each exploration's entry point into a single browser-ready file:

```sh
esbuild src/smc-resampling/index.js \
  --bundle --outfile=_site/assets/js/smc-resampling.bundle.js
```

All imports are resolved at build time. The browser loads one file per exploration.

### Module structure

```
src/
├── lib/                          # shared across explorations
│   ├── prng.js                   # seedable xorshift128
│   ├── canvas-utils.js           # common canvas drawing helpers
│   └── ...                       # future: distribution helpers, etc.
├── components/                   # web components (complex reusable widgets)
│   └── particle-filter.js        # <pf-visualization> custom element
├── smc-resampling/
│   ├── index.js                  # entry point: imports from lib/, binds to DOM IDs
│   ├── algorithms.js             # resampling method implementations
│   ├── drawing.js                # canvas rendering
│   └── toolbar.js                # toolbar behavior
└── future-exploration/
    └── index.js
```

### Interactivity model

Two mechanisms, chosen by complexity:

- **Shortcode mount points (default):** A fenced div in markdown (`::: {.viz #id}`) becomes a DOM element. A JS entry point imports algorithm code and binds to the element by ID. Used for most interactive elements.

- **Web components (complex widgets):** A custom HTML element (`<pf-visualization>`) that encapsulates its own rendering, state, and controls. Used for complex, reusable, self-contained widgets that may appear across multiple explorations. The component class lives in `src/components/` and is imported by whichever entry point uses it.

### Testing

Tests in `test/` import directly from `src/lib/` and `src/<exploration>/` as ES modules. Node's built-in test runner (`node --test`) handles pure algorithm logic — resampling correctness, PRNG determinism, distribution properties. No browser needed for testing the math; DOM bindings are thin wrappers.

```
test/
├── lib/
│   └── prng.test.js
├── smc-resampling/
│   └── algorithms.test.js
```

## Build system (Makefile)

### Three jobs

1. **Content compilation:** Pattern rule maps each `.md` in `content/` to `.html` in `_site/`. Pandoc is invoked with `base.html` template, all Lua filters, and bibliography. Pages with `template: bare` in front matter use `bare.html` instead. Raw `.html` files are copied as-is.

2. **JS bundling:** For each exploration with JS, esbuild bundles `src/<name>/index.js` → `_site/assets/js/<name>.bundle.js`. Shared library code and web components are pulled in via ES imports.

3. **Static assets:** CSS, fonts, images, and `.bib` files are copied to `_site/`.

### Generated pages

The Makefile also runs Lua scripts (via `pandoc lua`) that generate:

- **Blog listing:** `scripts/build-index.lua` reads front matter from all posts/explorations, sorts by date, emits a listing page.
- **Publications:** `scripts/build-pubs.lua` reads `default.bib`, groups by year/type, emits a publications page. A Lua filter handles custom `.bib` fields (`mypubstate`, `myurl`, `lingbuzz`, etc.) for rendering link buttons.

### Parallelism

`make -j4` runs independent file compilations concurrently. Each `.md` → `.html` and each JS bundle is independent, so parallelism is natural.

### Key targets

- `make` — full parallel build (all content, JS, assets, generated pages)
- `make clean` — removes `_site/`
- `make test` — runs JS tests via `node --test test/`
- `make serve` — dev server (see below)

## Dev workflow

### `make serve`

Runs three processes together:

1. **Content watcher:** `fswatch` on `content/`, `filters/`, `templates/` triggers Pandoc rebuild on the changed file. If a template or filter changed, triggers full rebuild (since those affect all pages).
2. **JS watcher:** esbuild's built-in `--watch` mode rebundles on source changes (near-instant).
3. **browser-sync:** Serves `_site/` with live reload. CSS changes are injected without page reload. HTML/JS changes trigger a page reload.

### Terminal output

Quiet by default. Each successful rebuild prints a one-liner (`Built explorations/smc-resampling.html`). Errors from Pandoc, Lua filters, or esbuild pass through clearly. browser-sync prints the local URL on startup.

### Typical cycle

Save `.md` file → Pandoc compiles (~100ms) → browser-sync detects new `.html` → browser reloads.

## Styling

Modern CSS with custom properties, nesting, `@layer`, and container queries. No preprocessor. Plain `.css` files are copied to `_site/` as-is.

The base exploration stylesheet (`explorations-base.css`) provides:

- Tufte-inspired layout (60% content width, 40% sidenote margin)
- et-book typography with responsive sidenote collapse
- Collapsible section styling
- CSS custom properties for theming

Per-exploration CSS files add exploration-specific styles.

## Site features

### Publications page

`scripts/build-pubs.lua` reads `default.bib` and generates a markdown file with citation keys grouped by year/type. Pandoc + citeproc renders it. A Lua filter handles custom `.bib` fields (`mypubstate`, `myurl`, `myurltitle`, `lingbuzz`, `arxiv`, `pdf`, `poster`, `slides`, `code`) to emit link buttons, matching the current `bib.html` layout's functionality.

### Blog listing

`scripts/build-index.lua` reads YAML front matter from posts and explorations, sorts by date, and emits a listing page as markdown that Pandoc renders.

### Navigation

Defined in `site.yaml` as a list of links. The template reads the nav metadata and renders the header. Static, no generation needed.

## Dependencies

Minimal, stable tools:

- **Pandoc** — markdown processing, math, citations, Lua filter host
- **Make** — build orchestration
- **esbuild** — JS bundling (standalone binary)
- **browser-sync** — dev server with live reload (Node.js)
- **fswatch** — file watching for content rebuilds

Node.js is needed only for browser-sync. Everything else is standalone binaries or system tools.

## Migration strategy

Incremental, on a dedicated branch (`pandoc-migration`). The current site on `source` stays functional throughout.

### Phase 1 — One exploration end-to-end

Get the full pipeline working for `smc-resampling`:

- Makefile with content compilation, JS bundling, asset copying
- `base.html` Pandoc template with MathJax, sidenotes, per-page JS/CSS
- Lua filters: sidenotes, callouts, viz-mount
- esbuild bundling of the SMC resampling JS
- `make serve` with live reload

This validates every piece of the new pipeline before committing to migrating everything.

### Phase 2 — Migrate remaining content

Move blog posts and static pages to `content/`. Convert Jekyll-specific syntax (Liquid tags, `{% bibliography %}`) to Pandoc equivalents. The Klipse/Vega posts may need special handling or can be frozen as static HTML.

### Phase 3 — Publications page

Build the `.bib` → publications page generator, replacing jekyll-scholar.

### Phase 4 — Remove Jekyll

Remove Gemfile, `_config.yml`, Jekyll layouts/includes, and update the GitHub Actions deploy workflow to run `make` instead of `bundle exec jekyll build`.
