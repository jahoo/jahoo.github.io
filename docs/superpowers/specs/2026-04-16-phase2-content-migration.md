# Phase 2: Migrate remaining content

**Date:** 2026-04-16
**Status:** Draft
**Depends on:** Phase 1 (Pandoc pipeline for smc-resampling, complete)

## Goal

Migrate all blog posts, static pages, and standalone HTML from the Jekyll pipeline to the Pandoc + Make pipeline. After this phase, all site content (except the publications page) builds via `make`.

## Scope

### In scope

- 13 simple blog posts (markdown text with links to PDFs/slides)
- 2 Quarto-notebook posts (iframe-embedded pre-rendered HTML)
- 1 Julia-notebook post (iframe-embedded)
- 1 Klipse+Vega post (frozen as static HTML)
- 1 unpublished draft (jekyll.md — skip or discard)
- Root pages: index (about), posts (listing), pubs (placeholder)
- Standalone HTML: interactive-divergence-fitting, redirect stubs
- Blog listing page generator (`scripts/build-index.lua`)
- CSS: site-chrome styling (nav/footer matching current Jekyll look) plus page-style switching
- Makefile updates for posts, static HTML, generated pages

### Deferred

- Publications page with bib rendering (Phase 3)
- Nav slimming for individual post/exploration views (later tweak)
- Re-rendering Quarto notebooks from source
- Klipse+Vega integration into Pandoc pipeline

## Template: one template, CSS-switched

`base.html` remains the single template. A front matter field `page-style` controls which CSS loads:

- `page-style: site` — index, listing, pubs placeholder. Loads `site.css` (Biolinum/Libertine fonts, wider content column, current Jekyll look).
- Default (no `page-style`, or `page-style: post`) — posts and explorations. Loads `post.css` (et-book Tufte style, 60% content width, sidenotes).

The template adds `page-style-{value}` as a class on `<body>`, enabling CSS-only differentiation for any element (nav, content width, fonts). This also allows future nav slimming for posts via CSS without a template change.

## CSS structure

```
assets/css/
  base.css              # shared: nav, footer, sidenotes, callouts, collapse, code highlighting
  post.css              # et-book Tufte style (serif body, 60% width) — loaded for posts/explorations
  site.css              # Biolinum/Libertine style (wider, sans body) — loaded for index/listing/pubs
  smc-resampling.css    # per-exploration overrides (existing)
```

`base.css` already has nav and footer styles from Phase 1, plus sidenotes, callouts, and collapsible sections. Phase 2 splits it:

- Nav/footer, code highlighting, and structural layout stay in `base.css` (always loaded)
- The et-book typography, sidenote column layout, and content width rules move to `post.css`
- `site.css` provides the current Jekyll look: Biolinum/Libertine fonts, wider content column, standard paragraph styling

The template loads `base.css` always, then conditionally loads `post.css` or `site.css` based on `page-style`.

## Blog listing generator

`scripts/build-index.lua` (run via `pandoc lua`):

1. Scans `content/posts/*.md` and `content/explorations/*.md`
2. Parses YAML front matter from each file (title, date, highlighted)
3. Sorts by date descending
4. Emits a markdown file at `_generated/posts.md` with:
   - Front matter: `title: blog`, `page-style: site`
   - A formatted list of posts, with highlighted posts visually distinguished (bold title or marker)
   - Links to `/posts/<slug>.html` or `/explorations/<name>.html`

The Makefile runs this script before content compilation and includes `_generated/` as a content source.

## Content migration

### Simple blog posts (~13)

Move each `_posts/YYYY-MM-DD-slug.md` to `content/posts/slug.md`. Conversion:

- Remove `layout:` from front matter
- Keep `title`, `date`, `author`
- Convert `tags: [paper, presentation]` or similar — only used for listing purposes, replaced by `highlighted: true` where appropriate (papers, dissertations)
- Remove Kramdown-specific syntax (`{:.class}`)
- Math: Pandoc handles `$...$` and `$$...$$` natively (no conversion needed for most posts; a few use KaTeX `\(...\)` which also works)
- Links to assets (PDFs, images): adjust paths if needed

Posts that should get `highlighted: true`:
- Posts with tags `paper` or `dissertation`: WCCFL, EMNLP dependency-dependence, plausibility-sampling-processing, dissertation

### Iframe-embedded notebook posts (3)

These posts are thin wrappers around pre-rendered HTML:

- `rejection-sampling-expo` — embeds `/assets/rejection-sampling-expo/q/notebooks/rejection-sampling-expo.html`
- `transform-pdf` — embeds `/assets/transform-pdf/q/notebooks/transform-pdf.html`
- `simplest-linear-regression` — embeds `/assets/simplest_linear_regression_example.html`

Migration: copy the post markdown to `content/posts/` with the iframe intact. The pre-rendered HTML and its `site_libs/` dependencies are copied by the Makefile's asset sync.

### Klipse+Vega post (1)

`2019-10-03-klipse-clojure.md` requires the Klipse runtime (Clojure-in-browser) and Vega. Building infrastructure for one post is not worthwhile.

Approach: render the post once with the current Jekyll pipeline, save the output HTML to `assets/frozen/klipse-clojure.html`, and have the Makefile copy it to `_site/posts/klipse-clojure.html`. The listing page links to it like any other post. If the post needs updating later, it can be re-rendered with Jekyll or rebuilt with a different approach.

### Root pages

**Index (about):** `content/index.md` with `page-style: site`. Simple markdown — bio text, links. Currently the homepage.

**Posts listing:** Generated by `build-index.lua` → `_generated/posts.md`. Uses `page-style: site`.

**Pubs placeholder:** `content/pubs.md` with `page-style: site`. Simple text: "Publications page — coming soon" or similar, linking to the current live publications page as a stopgap.

### Standalone HTML

- `_explorations/interactive-divergence-fitting.html` has `layout: null` — it's self-contained HTML. Copy to `_site/explorations/` as-is.
- Redirect stubs at root (`interactive-divergence-fitting.html`, `interactive-kl-fitting.html`) — copy as-is.
- Presentation directories (2022-11-10, 2023-04, etc.) — copy as-is. These are self-contained HTML/PDF presentations.

## Makefile changes

- Add `content/posts/` to content sources (already handled by the `find content -name '*.md'` pattern)
- Add `_generated/` as a content source for the listing page
- Add a `generate` target that runs `pandoc lua scripts/build-index.lua` before content compilation
- Add static HTML copying rules for standalone files and presentation directories
- Ensure asset sync covers all presentation directories and notebook assets

## URL structure

Current Jekyll URLs:
- Posts: `/:year/:month/:day/:slug.html` (e.g., `/2024/08/02/dissertation.html`)
- Explorations: `/explorations/:name.html`
- Pages: `/about.html`, `/posts.html`, `/pubs.html`

New URLs:
- Posts: `/posts/:slug.html` (simpler, no date in URL)
- Explorations: `/explorations/:name.html` (same)
- Pages: `/index.html`, `/posts.html`, `/pubs.html`

This is a URL change for posts. Since this is a personal academic site (not high-traffic SEO-sensitive), the simplification is worth it. Old URLs will 404 until Phase 4 when we can add redirects if needed.
