# Authoring Guide

How to write content for this site using the Pandoc + Make pipeline.

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

## Build commands

```bash
make            # full parallel build (content + JS + assets)
make serve      # dev server with live reload
make content    # rebuild only markdown → HTML
make js         # rebundle only JS
make assets     # sync only static assets (CSS, fonts, images)
make test       # run JS tests
make clean      # remove _site/
```
