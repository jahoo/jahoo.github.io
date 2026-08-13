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
  - src/my-topic               # dir of the bundle's source; built and served as /assets/js/my-topic.bundle.js
css:
  - assets/css/my-topic.css    # served as /assets/css/my-topic.css
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

### Unlisted posts

To deploy a post without linking it from the blog listing — e.g. to share a
work-in-progress with a few people before it goes live — add:

```yaml
unlisted: true
```

The page builds and deploys at its normal URL (`/posts/<slug>/`), so the link
works for anyone you send it to, but it doesn't appear on `/posts/` and it gets
a `<meta name="robots" content="noindex, nofollow">` header so search engines
skip it. Nothing else about the page changes. Delete the line and redeploy to
make it a real post.

Two caveats: the URL is guessable, and the markdown source is public on the
`source` branch — this is "not advertised", not "private". For something less
guessable, give the file a random-ish slug while it's unlisted (the URL changes
when you rename it later).

Compare `published: false`, which is for drafts that shouldn't be reachable at
all — it also hides the post from the listing, but the page is still built, so
prefer `unlisted: true` when you actually want to share the link.

For an unlisted post that shouldn't visibly point back to the site — e.g. a
one-off page you want to share without it looking like part of the blog — add:

```yaml
standalone-page: true
```

This drops the site navbar (site name + home/blog links) from the rendered
page; everything else (the post's own title header, styling, assets) is
unchanged. It's meant to be combined with `unlisted: true` — the build prints
a warning if you set it on a listed post, since the listing would then link to
a page with no navigation back.

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

Each exploration has an entry point at `src/<name>/index.js` that esbuild bundles to `/assets/js/<name>.bundle.js`. Shared code goes in `src/lib/`. Tests live next to the code they test (`src/<name>/*.test.js`, run by `make test`); they are not bundled.

Reference the bundle in front matter by its **source directory** — a real path in the repo, so a reader of the YAML can find the code. Like `css:` (and `bibliography:`, `mathjax-macros:`), the value is repo-relative; `filters/asset-paths.lua` resolves both keys to served URLs at build time (`src/<name>` → `/assets/js/<name>.bundle.js`, `assets/...` → `/assets/...`; anything else, e.g. absolute URLs, is emitted verbatim):

```yaml
js:
  - src/my-exploration
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

## Notebook-backed posts (Quarto + Julia)

Some posts are generated from a Quarto `.qmd` so the code producing their
figures stays editable. `content/posts/2022-08-29-rejection-sampling.qmd` is
the worked example.

Quarto is used purely as a Julia execution engine, never as a renderer: it
runs the code cells, and the ordinary pandoc build then does citations,
cross-references, callouts, and templating. Both the generated `.md` and the
figures are committed, so a normal `make` never touches Julia or Quarto.

**The `.qmd` is the source of truth.** The sibling `.md` is a build artifact
that happens to be committed — like a lockfile — so the site builds on a
machine with neither Julia nor Quarto installed. It carries a
`# GENERATED FILE — DO NOT EDIT` header; edit the `.qmd` and regenerate.

### Adding a new one

Every `content/posts/*.qmd` builds to its sibling `.md`, so there is nothing
to register:

1. Write `content/posts/YYYY-MM-DD-slug.qmd` with the front matter below.
2. `make notebooks` — regenerates any `.qmd` whose `.md` is out of date.
3. Commit the `.qmd`, the generated `.md`, and whatever figures the code wrote.

Front matter for a notebook-backed post; everything after `tags:` is the
site's normal post front matter, so `css:`, `toc:`, `bibliography:` and the
rest behave exactly as for a hand-written post:

```yaml
---
title: Your title
date: 2026-01-01
tags: [note]
jupyter: julia-1.10      # name the kernel; don't leave Quarto to infer it
keep-md: true            # required — the build consumes this intermediate
shift-headings: true     # Quarto sources start sections at `##`; see below
css:                     # optional, per-post tweaks
  - assets/css/your-post.css
---
```

`shift-headings: true` promotes every heading one level at build time. Quarto
documents idiomatically start their sections at `##`, because the title takes
the `h1`; this site starts them at `#`. Without the shift, citeproc's own
`# References` makes pandoc treat `h1` as the document's top level and your
sections number from zero (`0.1 Definitions`). Leave it out only if you are
already writing `#` for top-level sections.

Figures come from `#| label: fig-…` and `#| fig-cap:` on the cell — no
`savefig`, no hand-written image line. Quarto writes them beside the source
and the `notebooks` rule copies them into `assets/<slug>/`, where `<slug>` is
the filename with the date stripped — the same slug the post's URL uses. The
rule creates that directory for you on first render.

The build publishes the `.qmd` beside the page it generated and adds a
**source .qmd** download link to the post's metadata line, so a reader can
take the source and re-run the code. This happens automatically whenever a
post has a sibling `.qmd`; there is no front-matter switch. Since the file
is published, treat it as public: it is subject to the same rule as the rest
of the post about not committing anything machine-specific.

```bash
make notebooks   # re-run the Julia and regenerate the .md; needs Quarto + a julia-1.10 Jupyter kernel
make             # ordinary build; uses the committed .md and .svg files
```

Quarto finds that kernel through a Python with `jupyter` installed, not
through Julia directly. Where the default `python3` has no jupyter, Quarto
reports no kernels at all — `Jupyter kernel 'julia-1.10' not found` — which
looks like a missing kernelspec but isn't. The `notebooks` rule points Quarto
at the repo's `.venv` when one exists; override with
`make notebooks QUARTO_PYTHON=/path/to/python`.

The `notebooks` rule in the `Makefile` actually consumes Quarto's pre-pandoc
intermediate (`keep-md: true` in the qmd's front matter), not Quarto's own
rendered markdown. Quarto's pandoc pass rewrites prose it was supposed to pass
through untouched — it turns absolute `/assets/…` image paths into
`./assets/…` (breaking every figure URL), injects its own `# References`
heading (which the site's citeproc then duplicates), and silently drops a
fenced div. The intermediate has the Julia executed but the prose otherwise
byte-identical to the source, so that's what gets kept.

Because Quarto rewrites anything it recognizes, `.qmd` sources use
site-flavoured syntax rather than Quarto's own:

| Write this in a `.qmd` | Not this | Why |
|---|---|---|
| `::: {.note-callout}` (also `.warning-callout`, `.tip-callout`, `.important-callout`) | `::: {.callout-note}` | Quarto flattens any class it recognizes into a blockquote; `filters/callouts.lua` matches the bare aliases instead |
| `::: {.note-callout collapse="true"}` | Quarto's own collapsing | `collapse="true"` starts closed, `collapse="false"` starts open; either renders as `<details class="callout-details">` |
| `@fig:name`, `{#fig:name}` | `@fig-name`, `#\| label: fig-name` | pandoc-crossref's syntax; Quarto's own figure nodes don't survive `--to markdown` |
| `#\| label: fig-name` and `#\| fig-cap:` on the cell | a `savefig` call plus a hand-written image line | idiomatic Quarto; `scripts/qmd-figures.js` moves the figures into `assets/<slug>/`, rewrites their paths, lifts them out of the code fold, and converts `fig-` labels to pandoc-crossref's `fig:` |
| `<details class="code-fold">` written by hand around the fence | `#\| code-fold: true` | keeps the folding markup, and its CSS hook, under the site's control rather than Quarto's |

A few more details worth knowing before writing the next one:

- **Put `#| output: false` on every Julia cell, not just the ones that draw
  figures.** Whatever a cell prints reaches the generated markdown verbatim,
  and that includes stderr — package precompilation warnings, deprecation
  notices, absolute paths into the render machine's Julia depot. Figures get
  onto the page through `savefig` and a markdown image line below the cell,
  so no cell actually needs to emit anything. A setup cell that only loads
  packages will still leak its stderr into the committed `.md` (and from
  there into the published page) if you leave this off.
- Write cross-references Quarto's way (`@fig-name`); the build converts them to
  pandoc-crossref's `@fig:name`. Keeping the source in Quarto's dialect is what
  lets a reader download the `.qmd` and run it unchanged.
- Quarto rewrites front matter on render: it consumes `css:`, `toc:`, and
  `bibliography:` as format options (so they vanish from the emitted YAML) and
  adds a spurious `authors:` plus `toc-title:`. `scripts/qmd-frontmatter.js`
  puts the source `.qmd`'s YAML back verbatim over Quarto's rendered body;
  `make notebooks` runs it automatically.
- `--output-dir` resolves relative to the **input file's** directory, not the
  invocation directory — so the `notebooks` rule's `--output-dir ../../_build`,
  run from `content/posts/`, lands at the repo root's `_build/`. Don't add
  `-o <name>` alongside it: in Quarto 1.8.26, invoked from the repo root the
  way `make` does, that combination resolves one directory too high and writes
  outside the repository. Consume Quarto's default-named output instead.
- `--resource-path=../..` is needed only so Quarto's own (discarded) pandoc
  pass exits 0: Quarto resolves `bibliography:` relative to the `.qmd`'s own
  directory, while the site build needs it resolved repo-root-relative.

## Collapsible sections

Pandoc's `--section-divs` wraps each heading and its content in a `<section>` element. The `collapse.js` script adds click-to-collapse behavior automatically. No special markup needed — just use headings.

Hash links (e.g., `#section-name`) auto-uncollapse ancestor sections when navigated to.

## Blog listing

The listing page at `/posts.html` is auto-generated from post front matter by `scripts/build-index.lua`. It runs automatically as part of `make`. To regenerate manually:

```bash
pandoc lua scripts/build-index.lua
```

The script scans `content/posts/` and `content/explorations/`, reads front matter, and writes `_generated/posts.md`. Posts with `unlisted: true` or `published: false` are skipped (see [Unlisted posts](#unlisted-posts)).

## Adding a publication

The publications section of the homepage is generated from two inputs:

1. **`source.bib`** at the repo root — a gitignored symlink pointing at your local BibLaTeX file (the bibliographic source of truth). Create it once:

   ```bash
   ln -s ~/all-biblatex.bib source.bib
   ```

   Wherever on the right-hand side your bib actually lives; `source.bib` is what the build reads. The file must be in BibLaTeX format — Zotero's "Better BibLaTeX" export works. If the symlink is missing or broken, `node scripts/build-pubs.js` exits with an error pointing at this command.

2. **`pubs.yaml`** at the repo root — a list of the bib keys to include, with only website-specific extras layered on top. Bibliographic data (title, authors, year, venue_full, DOI, URL, arxiv ID) is pulled from the bib; you don't retype it.

Schema, merge rules, and validation: see [docs/pubs.md](pubs.md).

### Running the build

Save `pubs.yaml` (or `source.bib`) with `make serve` running and the page regenerates automatically. Otherwise run `make homepage` (recompose the homepage) or `make` (full site).

## Build commands

```bash
make            # full parallel build (generate listing + pubs + content + JS + assets)
make serve      # dev server with live reload
make content    # rebuild only markdown → HTML
make pubs       # regenerate _generated/_pub-list.md from pubs.yaml + source.bib
make homepage   # recompose _generated/index.md from content/_index.md
make js         # rebundle only JS
make assets     # sync only static assets (CSS, fonts, images)
make test       # run JS tests
make clean      # remove _site/
```
