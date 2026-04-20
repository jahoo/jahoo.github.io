# Authoring Guide

How to write content for this site using the Pandoc + Make pipeline.

> **Theme source.** The visual theme, markdown conventions, and
> Pandoc template are all based on Jake Zimmerman's
> [pandoc-markdown-css-theme](https://jez.io/pandoc-markdown-css-theme)
> (vendored under `assets/vendor/pandoc-markdown-css-theme/`). For the
> canonical reference on what markdown features are supported — sidenotes,
> margin notes, figure captions, code block options, TOC, tables, etc. —
> see his [kitchen-sink page](https://jez.io/pandoc-markdown-css-theme/kitchen-sink/)
> (also rendered locally at `/kitchen-sink/`). This guide focuses on
> project-specific bits: front-matter fields, per-page assets, and
> site-specific conventions.

## Quick start

1. Create a markdown file in `content/` (e.g., `content/explorations/my-topic.md`)
2. Add front matter (see below)
3. Run `make serve` to preview at `http://localhost:4000`
4. Saving the file triggers an automatic rebuild + browser reload

## Front matter

```yaml
---
title: My Exploration Title
date: 2026-04-15
author: Jacob Hoover Vigly
js:
  - my-topic              # loads /assets/js/my-topic.bundle.js (built by esbuild from src/my-topic/index.js)
css:
  - my-topic.css          # loads /assets/css/my-topic.css
bibliography: assets/my-topic/references.bib   # per-page bib (overrides site default)
link-citations: true
mathjax-macros: assets/my-topic/macros.json     # custom LaTeX macros for MathJax
---
```

All fields except `title` are optional. A simple blog post needs only `title` and `date`.

### Page styles

Pages use one of two visual styles, controlled by `page-style`:

- **Default (omit `page-style`)** — et-book Tufte style with sidenotes, 60% content width. Use for blog posts and explorations.
- **`page-style: site`** — Linux Biolinum/Libertine fonts, wider content column (800px). Use for the index, listing, publications, and other site-chrome pages.

The template adds `page-style-{value}` as a class on `<body>`, so all visual differences are CSS-only.

### Highlighted posts

To highlight a post in the blog listing (bold title), add:

```yaml
highlighted: true
```

Posts tagged `paper` or `dissertation` typically get this.

### Tags

Preserve tags for categorization. Use inline list format:

```yaml
tags: [note, paper]
```

### External content

Not all content is rendered by Pandoc. Some pages are standalone HTML, pre-rendered notebooks, or frozen output from another tool. Every piece of listable content has a `.md` stub in `content/` — even if the actual content lives elsewhere. The `external` field (a repo-relative path) tells `build-content.sh` where to copy the standalone file from:

```yaml
# Standalone HTML exploration, now living under assets/frozen/
external: assets/frozen/interactive-divergence-fitting.html

# Frozen Klipse post (originally rendered by Jekyll, kept as static HTML)
external: assets/frozen/klipse-clojure.html
```

The Pandoc-rendered stub serves as a landing page (brief description + link). Source files for frozen content are kept in `assets/frozen/` for future re-rendering.

Content types and how they work:

| Type | Rendered by | `external` field? | Example |
|------|------------|-------------------|---------|
| Normal post/exploration | Pandoc | no | smc-resampling |
| Standalone HTML | not rendered | yes — points to HTML | interactive-divergence-fitting |
| Frozen post | Jekyll/other tool | yes — points to frozen HTML | klipse-clojure |
| Notebook (iframe) | Pandoc wraps iframe | no — Pandoc page is the landing | rejection-sampling-expo |

## Math

Write LaTeX math directly — Pandoc handles it correctly (no underscore bugs):

```markdown
Inline: $x_{n+1} = f(x_n)$

Display:
$$\sum_{i=1}^N w^i \delta_{s^i}(\cdot)$$
```

### Custom macros

Define macros in a JSON file (e.g., `assets/my-topic/macros.json`):

```json
{
  "state": "s",
  "target": "\\pi",
  "normwt": "w"
}
```

Reference it in front matter with `mathjax-macros: assets/my-topic/macros.json`. Then use `$\target(\cdot)$` in your markdown. The JSON file avoids backslash escaping issues that arise with YAML metadata.

## Sidenotes and marginnotes

Three mechanisms, chosen by content complexity:

### Numbered sidenotes (inline text)

```markdown
This is the main text.^[This appears as a numbered sidenote in the right margin.]
```

Produces a superscript number in the text and the note in the margin. Use for short annotations, citations, asides.

### Unnumbered marginnotes (inline text)

```markdown
This is the main text.^[{-} This appears in the margin without a number.]
```

The `{-}` prefix makes it an unnumbered margin note. Use for parenthetical remarks that don't need a reference number.

### Block marginnotes (for widgets and complex HTML)

```markdown
::: {.marginnote #my-widget-note}
<canvas id="my-canvas" style="width:100%; height:200px;"></canvas>
<button id="btn-rerun">Re-run</button>
**Caption.** Description of the visualization.
:::
```

Use `::: {.marginnote}` when the note contains block-level HTML elements (canvas, buttons, sliders, toggle switches) that would break inside `^[...]` inline footnotes. The fenced div protects the HTML from Pandoc's parser.

Trade-off: block marginnotes have no inline marker (⊕ or number) in the paragraph text — they just appear in the margin at the point where they're placed in the document flow. Position the `:::` block between the paragraphs where you want it to appear.

### Block sidenotes/marginnotes (hoisted text)

pandoc-sidenote also supports `{^}` and `{^-}` for text-heavy notes that benefit from block formatting:

```markdown
Main text.^[{^} This is a numbered sidenote rendered as a block div rather than an inline span.
It can contain multiple paragraphs.]

Main text.^[{^-} Same but unnumbered (marginnote).]
```

These keep the label inline in the paragraph (like regular sidenotes) but hoist the content to a `<div>` after the paragraph. Use for longer text notes. Don't use for HTML widgets — Pandoc's footnote parser may mangle the HTML.

### Preserving footnotes

```markdown
Main text.^[{.} This stays as a traditional footnote at the page bottom.]
```

### Summary

| Content | Syntax | Inline marker? | HTML-safe? |
|---------|--------|---------------|------------|
| Short text | `^[text]` | numbered | no |
| Short text, no number | `^[{-} text]` | ⊕ | no |
| Long text | `^[{^} text]` | numbered | no |
| Long text, no number | `^[{^-} text]` | ⊕ | no |
| Widgets/canvas/buttons | `::: {.marginnote}` | none | yes |
| Traditional footnote | `^[{.} text]` | numbered | no |

## Citations

Use Pandoc citeproc syntax with your `.bib` file:

```markdown
In-text: @douc.r:2005 showed that...        → Douc et al. (2005) showed that...
Parenthetical: [@douc.r:2005]               → (Douc et al., 2005)
With locator: @douc.r:2005 [Section 3.4]    → Douc et al. (2005, Section 3.4)
Multiple: [@douc.r:2005; @li.t:2015]        → (Douc et al., 2005; Li et al., 2015)
```

Pandoc auto-generates the bibliography at the end of the page. Add `link-citations: true` to front matter for clickable links from in-text citations to the bibliography.

## Cross-references

The build runs [pandoc-crossref](https://lierdakil.github.io/pandoc-crossref/)
before citeproc, so `@sec:foo` / `@fig:foo` / `@tbl:foo` / `@eq:foo` syntax
creates numbered, clickable references to labeled sections, figures, tables,
and equations.

```markdown
Label a section:     ## Comparison {#sec:comparison}
Reference it:        see @sec:comparison              → see §2.4
Parenthetical:       (see [@sec:comparison])          → (see §2.4)
```

**Prefix defaults** (set site-wide in `site.yaml`):

| Kind     | Prefix (singular / plural) |
|----------|----------------------------|
| Section  | `§` / `§§`                 |
| Figure   | `Figure` / `Figures`       |
| Table    | `Table` / `Tables`         |
| Equation | `Eq.` / `Eqs.`             |

No per-post setup is needed to use the defaults. To override for a single
post, put the key in its front matter:

```yaml
---
title: ...
secPrefix: ["section", "sections"]   # "see section 2.4" instead of "see §2.4"
---
```

(Same pattern for `figPrefix`, `tblPrefix`, `eqnPrefix`.)

Section numbering reflects the heading hierarchy (h1.h2.h3), so how many
top-level `#` headings you use affects the numbers. If you want flat numbering
like "§5", keep the post at a single h1 or none; use h2+ for content sections.

## Callouts

```markdown
::: {.callout-note}
This is a note callout.
:::

::: {.callout-warning title="Careful"}
Custom title with warning styling.
:::
```

Supported types: `callout-note`, `callout-warning`, `callout-tip`, `callout-important`.

## Interactive JavaScript

### Simple mount points (shortcode)

For elements the JS finds by ID:

```markdown
::: {.viz #my-canvas canvas="true" height="300px" width="100%"}
:::
```

This produces `<canvas id="my-canvas" class="viz-mount" style="height:300px;width:100%">`. Omit `canvas="true"` for a `<div>` instead. Your JS binds to the element by ID.

### Complex interactive HTML

For control panels, toggle switches, grouped buttons, sliders — write raw HTML directly in the markdown. Pandoc passes it through:

```markdown
<div class="controls">
  <button id="btn-run">Run</button>
  <select id="method-select">
    <option value="multinomial">Multinomial</option>
    <option value="stratified">Stratified</option>
  </select>
  <input type="range" id="slider-n" min="4" max="64" value="8">
</div>
```

### JS architecture

Each exploration has an entry point at `src/<name>/index.js` that esbuild bundles. Shared code goes in `src/lib/`. Reference the bundle in front matter:

```yaml
js:
  - my-exploration    # → /assets/js/my-exploration.bundle.js
```

The JS runs after the DOM is ready. Find elements by ID:

```javascript
import { createPRNG } from '../lib/prng.js';

export function init() {
  const canvas = document.getElementById('my-canvas');
  if (!canvas) return;
  // ... bindsimulation to canvas
}
```

## Collapsible sections

Pandoc's `--section-divs` wraps each heading and its content in a `<section>` element. The `collapse.js` script adds click-to-collapse behavior automatically. No special markup needed — just use headings.

Hash links (e.g., `#section-name`) auto-uncollapse ancestor sections when navigated to.

## Blog listing

The listing page at `/posts.html` is auto-generated from post front matter by `scripts/build-index.lua`. It runs automatically as part of `make`. To regenerate manually:

```bash
pandoc lua scripts/build-index.lua
```

The script scans `content/posts/` and `content/explorations/`, reads front matter, and writes `_generated/posts.md`.

## Adding a publication

The publications page at `/pubs/` is generated from two inputs:

1. **`source.bib`** at the repo root — a gitignored symlink pointing at your local BibLaTeX file (the bibliographic source of truth). Create it once:

   ```bash
   ln -s ~/all-biblatex.bib source.bib
   ```

   Wherever on the right-hand side your bib actually lives; `source.bib` is what the build reads. The file must be in BibLaTeX format — Zotero's "Better BibLaTeX" export works; classic BibTeX largely works modulo a few field-name differences. If the symlink is missing or broken, `node scripts/build-pubs.js` exits with a clear error pointing at this command.

2. **`pubs.yaml`** at the repo root — a list of the bib keys to include, with only website-specific extras layered on top. Bibliographic data (title, authors, year, venue_full, DOI, URL, arxiv ID) is pulled from the bib; you don't retype it.

### `pubs.yaml` entry schema

```yaml
- key: surname.f:YEARkey           # required; must exist in source.bib
  venue: SHORT 2024                # optional: short display label
                                   #   (falls back to bib shortjournal/eventtitle/
                                   #    container-title; "arXiv" for arxiv-only
                                   #    preprints with no other venue info)
  venue_url: https://…             # optional: link for the venue label
  note: "Outstanding Paper Award"  # optional: shown in parens after venue
  status: preprint                 # optional: small tag (preprint | dissertation |
                                   #   forthcoming | in-press | submitted | …)
  equal_contribution: [0, 1]       # optional: 0-based author indices get a *
  link_label: "Open Mind"          # optional: override the auto-derived label
                                   #   on the first link button (the one going
                                   #   to the primary URL). By default the label
                                   #   is inferred from the URL — known
                                   #   publishers / preprint servers get a name
                                   #   like [ACL Anthology], [arXiv], [PsyArXiv],
                                   #   [OpenReview], [OSF], [bioRxiv], [DOI];
                                   #   everything else falls back to [link].
  links:
    url: https://…                 # optional: override the primary title link
    code: https://…                # link buttons — any subset of:
    slides: talk.pdf               #   code, slides, poster, handout, pdf
    poster: poster.pdf             #   (bare filename → /assets/pdfs/; URL passes through)
    handout: handout.pdf           #   preprint, openreview, video, lingbuzz (URL)
    pdf: paper.pdf                 #   other: [{label, url}, ...] for custom buttons
    preprint: https://…
    openreview: https://…
    video: https://…
    lingbuzz: "000371"
    other:
      - label: "surprisal explorer"
        url: https://…
```

### Merge rules (bib + extras)

| Entry field | Source |
|---|---|
| `title`, `authors`, `year`, `month`, `day`, `type` | from bib |
| `venue` | extras override; else bib short-form; else full container-title; else "arXiv" for arxiv-only |
| `venue_full`, `pages`, `publisher`, `address`, `doi`, `editor` | from bib |
| `venue_url`, `status`, `equal_contribution` | extras only |
| `note` | extras override; else bib note |
| `links.url` | extras override; else bib URL |
| `links.doi_url` | derived from bib DOI |
| `links.arxiv` | derived from bib's `eprint`+`eprinttype=arXiv` (citation-js drops these, so we regex-scan the raw bib for them) |
| `links.{code, preprint, slides, poster, handout, video, openreview, lingbuzz, pdf, other}` | extras only |

Primary URL priority for the title link: `links.url` → `links.doi_url` → `links.arxiv` → `links.openreview` → `links.preprint`. The canonical DOI wins over any preprint when a paper is published.

### Running the build

Save `pubs.yaml` (or `source.bib`) with `make serve` running and the page regenerates automatically. Otherwise run `make pubs` (just the pubs build) or `make` (full site).

The build also writes `assets/bibliography/pubs.bib` — a verbatim extract of the entries you listed, with Zotero's private `file` field (and other internal metadata like `abstract`, `keywords`, `urldate`) stripped. The BibTeX link at the top of the page points at this download.

### Validation

`scripts/build-pubs.js` checks:

- All `key`s exist in `source.bib` (errors with a list of missing keys)
- `type` is one of the allowed values
- `equal_contribution` indices are in range
- `links.other` entries have both `label` and `url`

It warns (not errors) if `pdf` / `slides` / `poster` / `handout` reference a file not found under `assets/pdfs/`.

## Build commands

```bash
make            # full parallel build (generate listing + pubs + content + JS + assets)
make serve      # dev server with live reload
make content    # rebuild only markdown → HTML
make pubs       # regenerate pubs.md + pubs.bib from pubs.yaml + source.bib
make js         # rebundle only JS
make assets     # sync only static assets (CSS, fonts, images)
make test       # run JS tests
make clean      # remove _site/
```
