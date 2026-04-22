# Phase 1: Pandoc Migration — SMC Resampling End-to-End

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the full Pandoc + Make + esbuild pipeline working end-to-end for the SMC resampling exploration, validating every piece before migrating the rest of the site.

**Architecture:** Pandoc compiles markdown to HTML via a custom template and Lua filters. esbuild bundles ES module JavaScript. Make orchestrates both. browser-sync serves the output with live reload. See `docs/superpowers/specs/2026-04-15-pandoc-migration-design.md` for the full design spec.

**Tech Stack:** Pandoc 3.9, Make, esbuild, browser-sync, fswatch, Node.js (v24)

---

## File Map

Files created or modified in this plan:

```
# New files (create)
Makefile
site.yaml
templates/base.html
filters/sidenotes.lua          # vendored from pandoc-sidenote, may extend
filters/callouts.lua
filters/viz-mount.lua
content/explorations/smc-resampling.md    # converted from _explorations/smc-resampling.md
assets/css/base.css            # adapted from assets/explorations-base.css
assets/css/smc-resampling.css  # copied from assets/smc-resampling/style.css
assets/bibliography/apa.csl    # downloaded from CSL repo
assets/js/collapse.js          # simplified collapsible sections
scripts/serve.sh               # dev server wrapper
src/smc-resampling/index.js    # ES module entry point
src/smc-resampling/config.js   # extracted config + utilities
src/smc-resampling/algorithms.js  # resampling algorithms (ES module)
src/smc-resampling/drawing.js  # canvas rendering (ES module)
src/smc-resampling/main.js     # state + DOM wiring (ES module)
src/smc-resampling/particle-filter.js  # PF viz factory (ES module)
src/smc-resampling/toolbar.js  # toolbar (ES module)
src/lib/prng.js                # seedable PRNG extracted for reuse
test/lib/prng.test.js          # PRNG tests
test/smc-resampling/algorithms.test.js  # resampling correctness tests
package.json                   # for esbuild + browser-sync deps

# Existing files (copy/reference, not modify)
assets/smc-resampling/references.bib  # stays in place, referenced by front matter
assets/fonts/et-book/           # stays in place
assets/explorations-base.css    # source for assets/css/base.css
```

---

## Task 1: Branch, scaffolding, and tool installation

**Files:**
- Create: `package.json`
- Create: `site.yaml`
- Create directory structure: `templates/`, `filters/`, `content/explorations/`, `src/lib/`, `src/smc-resampling/`, `scripts/`, `test/lib/`, `test/smc-resampling/`, `assets/css/`, `assets/bibliography/`, `docs/superpowers/plans/`

- [ ] **Step 1: Create the migration branch**

```bash
git checkout -b pandoc-migration
```

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p templates filters content/explorations src/lib src/smc-resampling \
  scripts test/lib test/smc-resampling assets/css assets/bibliography
```

- [ ] **Step 3: Create package.json for JS tooling**

Create `package.json`:

```json
{
  "private": true,
  "scripts": {
    "test": "node --test test/**/*.test.js"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "browser-sync": "^3.0.0"
  }
}
```

- [ ] **Step 4: Install npm dependencies and system tools**

```bash
npm install
brew install fswatch
```

Run: `npx esbuild --version` — expect version number.
Run: `npx browser-sync --version` — expect version number.
Run: `which fswatch` — expect path.

- [ ] **Step 5: Create site.yaml**

Create `site.yaml`:

```yaml
site-title: jacob hoover vigly
url: https://jahoo.github.io
author: Jacob Hoover Vigly
description: >
  Scientific Program Coordinator at CHI FRO, LLC.
  Formerly Postdoc at MIT, Department of Brain and Cognitive Sciences.
  PhD in Linguistics from McGill University.
bibliography: assets/bibliography/default.bib
nav:
  - text: home
    url: /
  - text: publications
    url: /pubs.html
  - text: posts
    url: /posts.html
  - text: cv
    url: /assets/CV/jlhv-academic_cv.pdf
```

Note: `site-title` (not `title`) avoids collision with per-page `title` in front matter. `bibliography` sets the default bib file for all pages; pages with their own `bibliography:` in front matter override it.

- [ ] **Step 6: Download APA citation style**

```bash
curl -L -o assets/bibliography/apa.csl \
  https://raw.githubusercontent.com/citation-style-language/styles/master/apa.csl
```

Run: `head -5 assets/bibliography/apa.csl` — expect XML header with `<style>` tag.

- [ ] **Step 7: Commit scaffolding**

```bash
git add package.json package-lock.json site.yaml assets/bibliography/apa.csl
git commit -m "Scaffold Pandoc migration: package.json, site.yaml, APA CSL"
```

---

## Task 2: Pandoc HTML template

**Files:**
- Create: `templates/base.html`

The template uses Pandoc's template syntax (`$variable$` for interpolation, `$if(var)$...$endif$` for conditionals, `$for(var)$...$endfor$` for loops). Variables come from the page's YAML front matter and from `site.yaml` (passed via `--metadata-file`).

- [ ] **Step 1: Create templates/base.html**

Create `templates/base.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>$title$ — $site-title$</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <!-- MathJax v4 -->
$if(mathjax-macros)$
    <script>
        MathJax = {
            tex: {
                inlineMath: [['\$$', '\$$'], ['\\(', '\\)']],
                displayMath: [['\$$\$$', '\$$\$$'], ['\\[', '\\]']],
                macros: $mathjax-macros/json$
            }
        };
    </script>
$else$
    <script>
        MathJax = {
            tex: {
                inlineMath: [['\$$', '\$$'], ['\\(', '\\)']],
                displayMath: [['\$$\$$', '\$$\$$'], ['\\[', '\\]']]
            }
        };
    </script>
$endif$
    <script defer src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js"></script>

    <!-- Base styles -->
    <link rel="stylesheet" href="/assets/css/base.css">

    <!-- Per-page CSS -->
$for(css)$
    <link rel="stylesheet" href="/assets/css/$css$">
$endfor$
</head>
<body>

    <nav class="site-nav">
        <a class="site-title" href="/">$site-title$</a>
        <ul class="nav-links">
$for(nav)$
            <li><a href="$nav.url$">$nav.text$</a></li>
$endfor$
        </ul>
    </nav>

    <article class="content">
        <header class="post-header">
            <h1 class="post-title">$title$</h1>
$if(date)$
            <div class="post-meta">$author$<span class="meta-sep">&ensp;&middot;&ensp;</span>$date$</div>
$endif$
        </header>

        $body$

$if(references)$
        <section id="references" class="references" role="doc-bibliography">
            <h2>References</h2>
            $references$
        </section>
$endif$
    </article>

    <footer class="site-footer">
        <p>&copy; $author$</p>
    </footer>

    <!-- Collapsible sections -->
    <script src="/assets/js/collapse.js"></script>

    <!-- Per-page JS bundles -->
$for(js)$
    <script src="/assets/js/$js$.bundle.js"></script>
$endfor$

</body>
</html>
```

Note: `$site-title$` comes from `site.yaml`, while `$title$` comes from the page's front matter. This avoids the collision where page-level `title:` would override the site-level value.

- [ ] **Step 2: Commit template**

```bash
git add templates/base.html
git commit -m "Add Pandoc base.html template with MathJax, nav, per-page JS/CSS"
```

---

## Task 3: Minimal Makefile + test build

**Files:**
- Create: `Makefile`
- Create: `content/explorations/test-page.md` (temporary, deleted after verification)

- [ ] **Step 1: Create initial Makefile**

Create `Makefile`:

```makefile
# ============================================================
#  Site build — Pandoc + esbuild
# ============================================================

PANDOC     := pandoc
ESBUILD    := npx esbuild
OUTDIR     := _site

# Pandoc flags shared by all content
PANDOC_COMMON := --standalone \
    --metadata-file site.yaml \
    --template templates/base.html \
    --section-divs \
    --mathjax \
    --citeproc \
    --csl assets/bibliography/apa.csl

# Lua filters (order matters)
FILTERS := $(wildcard filters/*.lua)
FILTER_FLAGS := $(foreach f,$(FILTERS),--lua-filter $(f))

# ---- Content sources ----
MD_SOURCES := $(shell find content -name '*.md' -type f)
HTML_TARGETS := $(patsubst content/%.md,$(OUTDIR)/%.html,$(MD_SOURCES))

# ---- JS entry points ----
JS_ENTRIES := $(wildcard src/*/index.js)
JS_BUNDLES := $(patsubst src/%/index.js,$(OUTDIR)/assets/js/%.bundle.js,$(JS_ENTRIES))

# ---- Static assets ----
STATIC_DIRS := assets/css assets/fonts assets/images assets/bibliography assets/CV

.PHONY: all clean content js assets serve test

all: content js assets

# ---- Content compilation ----
content: $(HTML_TARGETS)

$(OUTDIR)/%.html: content/%.md templates/base.html site.yaml $(FILTERS)
	@mkdir -p $(dir $@)
	@echo "Build: $<"
	@$(PANDOC) $< $(PANDOC_COMMON) $(FILTER_FLAGS) -o $@

# ---- JS bundling ----
js: $(JS_BUNDLES)

$(OUTDIR)/assets/js/%.bundle.js: src/%/index.js $(shell find src/lib -name '*.js' 2>/dev/null)
	@mkdir -p $(dir $@)
	@echo "Bundle: $<"
	@$(ESBUILD) $< --bundle --outfile=$@

# ---- Static assets ----
assets:
	@for dir in $(STATIC_DIRS); do \
		if [ -d "$$dir" ]; then \
			mkdir -p $(OUTDIR)/$$dir && \
			rsync -a --quiet $$dir/ $(OUTDIR)/$$dir/; \
		fi; \
	done
	@echo "Assets synced"

# ---- Dev server ----
serve:
	@bash scripts/serve.sh

# ---- Tests ----
test:
	@node --test test/**/*.test.js

# ---- Clean ----
clean:
	rm -rf $(OUTDIR)
```

- [ ] **Step 2: Create a minimal test page**

Create `content/explorations/test-page.md`:

```markdown
---
title: Test Page
date: 2026-04-15
author: Jacob Hoover Vigly
---

## Hello world

This is a test of the Pandoc pipeline. Here is inline math: $x^2 + y^2 = z^2$.

And display math:

$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$

Underscores in math should work: $x_{n+1} = f(x_n)$ and $\sum_{i=1}^N w_i$.
```

- [ ] **Step 3: Run test build**

```bash
make content
```

Expected: `Build: content/explorations/test-page.md` printed, file created at `_site/explorations/test-page.html`.

- [ ] **Step 4: Verify output**

```bash
cat _site/explorations/test-page.html | head -30
```

Check that:
- HTML structure has `<nav>`, `<article>`, `<footer>`
- Math expressions are wrapped in `\(...\)` or `\[...\]` for MathJax
- Underscores in math are NOT interpreted as emphasis (no `<em>` tags inside math)
- Navigation links from `site.yaml` appear in the nav

- [ ] **Step 5: Delete test page and commit**

```bash
rm content/explorations/test-page.md
rm -rf _site
git add Makefile
git commit -m "Add Makefile with content compilation, JS bundling, asset sync"
```

---

## Task 4: Sidenotes Lua filter

**Files:**
- Create: `filters/sidenotes.lua`
- Create: `content/explorations/test-sidenotes.md` (temporary)

- [ ] **Step 1: Vendor the pandoc-sidenote Lua filter**

Download the Lua filter from the pandoc-sidenote repository:

```bash
curl -L -o filters/sidenotes.lua \
  https://raw.githubusercontent.com/jez/pandoc-sidenote/master/lua/sidenote.lua
```

Read the downloaded file to understand its behavior — it should convert Pandoc `Note` elements to Tufte-style sidenote HTML. Check what classes/HTML structure it emits and whether it distinguishes sidenotes from marginnotes.

- [ ] **Step 2: Create a test page with footnotes**

Create `content/explorations/test-sidenotes.md`:

```markdown
---
title: Sidenote Test
date: 2026-04-15
---

## Test sidenotes

This paragraph has a numbered sidenote.^[This is a sidenote. It should
appear in the margin with a number.]

This paragraph has content with math in a sidenote.^[The effective sample
size is $\text{ESS} = 1/\sum_i (w^i)^2$, ranging from 1 to $N$.]
```

- [ ] **Step 3: Build and verify sidenote output**

```bash
make clean && make content
```

Inspect `_site/explorations/test-sidenotes.html` and verify:
- Footnotes are converted to sidenote markup (not traditional footnotes at page bottom)
- The HTML includes the expected classes for Tufte CSS (`.sidenote`, `.sidenote-number`, `.margin-toggle`)
- Math inside sidenotes is preserved correctly

- [ ] **Step 4: Check if marginnote syntax is supported**

Review the vendored filter to see how unnumbered marginnotes are triggered. pandoc-sidenote may use a convention like wrapping the note content in a specific class. Document the syntax for future reference.

If the filter doesn't support marginnotes, note this as a future extension — we can add a check for a `{.margin}` class on the footnote span.

- [ ] **Step 5: Clean up test file and commit**

```bash
rm content/explorations/test-sidenotes.md
rm -rf _site
git add filters/sidenotes.lua
git commit -m "Add sidenotes Lua filter (vendored from pandoc-sidenote)"
```

---

## Task 5: Callouts and viz-mount Lua filters

**Files:**
- Create: `filters/callouts.lua`
- Create: `filters/viz-mount.lua`

- [ ] **Step 1: Write callouts.lua**

Create `filters/callouts.lua`:

```lua
-- callouts.lua — Convert fenced divs with .callout-* classes to styled HTML
--
-- Input:   ::: {.callout-note}
--          Adaptive resampling triggers when ESS drops below a threshold.
--          :::
--
-- Output:  <div class="callout callout-note">
--            <div class="callout-header">Note</div>
--            <div class="callout-body">
--              <p>Adaptive resampling triggers when ESS drops below a threshold.</p>
--            </div>
--          </div>

local callout_types = {
  ["callout-note"]      = "Note",
  ["callout-warning"]   = "Warning",
  ["callout-tip"]       = "Tip",
  ["callout-important"] = "Important",
}

function Div(el)
  for cls, label in pairs(callout_types) do
    if el.classes:includes(cls) then
      -- Check for custom title in attributes
      local title = el.attributes["title"] or label

      local header = pandoc.Div(
        pandoc.Plain(pandoc.Str(title)),
        pandoc.Attr("", {"callout-header"})
      )
      local body = pandoc.Div(el.content, pandoc.Attr("", {"callout-body"}))
      return pandoc.Div(
        {header, body},
        pandoc.Attr(el.identifier, {"callout", cls}, el.attributes)
      )
    end
  end
end
```

- [ ] **Step 2: Write viz-mount.lua**

Create `filters/viz-mount.lua`:

```lua
-- viz-mount.lua — Convert fenced divs with .viz class to DOM mount points
--
-- Input:   ::: {.viz #cv-degeneracy height="200px"}
--          :::
--
-- Output:  <div id="cv-degeneracy" class="viz-mount"
--               style="height:200px"></div>
--
-- If the attribute canvas="true" is present, emits a <canvas> instead.

function Div(el)
  if el.classes:includes("viz") then
    local tag = "div"
    if el.attributes["canvas"] == "true" then
      tag = "canvas"
    end

    local style_parts = {}
    if el.attributes["height"] then
      table.insert(style_parts, "height:" .. el.attributes["height"])
    end
    if el.attributes["width"] then
      table.insert(style_parts, "width:" .. el.attributes["width"])
    end
    local style_str = table.concat(style_parts, ";")

    local attrs = ""
    if el.identifier ~= "" then
      attrs = attrs .. ' id="' .. el.identifier .. '"'
    end
    attrs = attrs .. ' class="viz-mount"'
    if style_str ~= "" then
      attrs = attrs .. ' style="' .. style_str .. '"'
    end

    return pandoc.RawBlock("html",
      "<" .. tag .. attrs .. "></" .. tag .. ">")
  end
end
```

- [ ] **Step 3: Test both filters with a test page**

Create a temporary `content/explorations/test-filters.md`:

```markdown
---
title: Filter Test
date: 2026-04-15
---

## Callout test

::: {.callout-note}
This is a note callout.
:::

::: {.callout-warning title="Careful"}
This has a custom title.
:::

## Viz mount test

::: {.viz #my-canvas canvas="true" height="200px" width="100%"}
:::

::: {.viz #my-div height="300px"}
:::
```

Build and inspect output:

```bash
make clean && make content
```

Verify in `_site/explorations/test-filters.html`:
- Callout divs have `class="callout callout-note"` with header and body children
- Viz mounts are `<canvas id="my-canvas" class="viz-mount" style="height:200px;width:100%">` and `<div id="my-div" ...>`

- [ ] **Step 4: Clean up and commit**

```bash
rm content/explorations/test-filters.md
rm -rf _site
git add filters/callouts.lua filters/viz-mount.lua
git commit -m "Add callouts and viz-mount Lua filters"
```

---

## Task 6: CSS migration

**Files:**
- Create: `assets/css/base.css` (adapted from `assets/explorations-base.css`)
- Copy: `assets/css/smc-resampling.css` (from `assets/smc-resampling/style.css`)

- [ ] **Step 1: Copy and adapt the base stylesheet**

Copy `assets/explorations-base.css` to `assets/css/base.css`. Adjust the font paths — the original references `fonts/et-book/...` relative to itself in `assets/`. In the new location (`assets/css/base.css`), the path to fonts becomes `../fonts/et-book/...`.

```bash
cp assets/explorations-base.css assets/css/base.css
```

Then edit `assets/css/base.css`: replace all `url("fonts/` with `url("../fonts/` in the `@font-face` declarations.

- [ ] **Step 2: Add nav and footer styles to base.css**

The current `explorations-base.css` has no navigation styles (the exploration layout is standalone). Add minimal nav styles at the end of `assets/css/base.css`:

```css
/* ---- Site navigation ---- */
.site-nav {
  max-width: 1440px;
  margin: 0 auto;
  padding: 1rem 6%;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid var(--s-border);
}

.site-title {
  font-family: var(--s-body);
  font-size: 1.1rem;
  text-decoration: none;
  color: var(--s-text);
}

.nav-links {
  list-style: none;
  display: flex;
  gap: 1.5rem;
  margin: 0;
  padding: 0;
}

.nav-links a {
  font-family: var(--s-sans);
  font-size: 0.85rem;
  text-decoration: none;
  color: var(--s-text-dim);
  text-transform: lowercase;
  letter-spacing: 0.03em;
}

.nav-links a:hover {
  color: var(--s-accent);
}

/* ---- Footer ---- */
.site-footer {
  max-width: 1440px;
  margin: 4rem auto 2rem;
  padding: 1rem 6%;
  border-top: 1px solid var(--s-border);
  font-size: 0.8rem;
  color: var(--s-text-dim);
}

/* ---- Callout boxes ---- */
.callout {
  margin: 1.5rem 0;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--s-accent);
  background: var(--s-surface);
  border-radius: var(--s-radius);
}

.callout-header {
  font-family: var(--s-sans);
  font-weight: bold;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.25rem;
  color: var(--s-accent);
}

.callout-warning {
  border-left-color: #c0392b;
}

.callout-warning .callout-header {
  color: #c0392b;
}

.callout-tip {
  border-left-color: #27ae60;
}

.callout-tip .callout-header {
  color: #27ae60;
}
```

- [ ] **Step 3: Copy per-exploration CSS**

```bash
cp assets/smc-resampling/style.css assets/css/smc-resampling.css
```

Review `assets/css/smc-resampling.css` for any path references that need updating. If it references images or other assets with relative paths, adjust them.

- [ ] **Step 4: Build test page and verify styling**

Recreate a simple test page, build it, and open in a browser:

```bash
cat > content/explorations/test-style.md << 'EOF'
---
title: Style Test
date: 2026-04-15
---

## Typography test

This is body text in et-book. Here is *italic* and **bold**.

A sidenote test.^[This should appear in the margin with et-book typography.]

::: {.callout-note}
A callout box should have a left border and subtle background.
:::

Display math: $$\sum_{i=1}^N w^i = 1$$
EOF

make clean && make content
```

Open `_site/explorations/test-style.html` in a browser. Verify:
- et-book font loads (serif body text)
- Sidenote appears in right margin on wide screens
- Callout has left border accent and background
- Navigation bar renders at top with links

- [ ] **Step 5: Clean up and commit**

```bash
rm content/explorations/test-style.md
rm -rf _site
git add assets/css/base.css assets/css/smc-resampling.css
git commit -m "Migrate CSS: base styles with nav/footer/callouts, smc-resampling styles"
```

---

## Task 7: Collapsible sections JS

**Files:**
- Create: `assets/js/collapse.js`

This is a simplified version of the current `assets/explorations-collapse.js`. Pandoc's `--section-divs` flag already wraps headings in `<section>` elements, so we don't need the DOM restructuring that the current script does. We only need click-to-collapse behavior and hash navigation.

- [ ] **Step 1: Write collapse.js**

Create `assets/js/collapse.js`:

```javascript
// collapse.js — click-to-collapse for Pandoc --section-divs output
// Pandoc wraps each heading + content in <section id="heading-id">,
// so we just add click handlers and hash navigation.

(function () {
  'use strict';

  function init() {
    var sections = document.querySelectorAll('article.content > section, article.content section > section');

    sections.forEach(function (sec) {
      var heading = sec.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4');
      if (!heading) return;

      heading.style.cursor = 'pointer';
      heading.addEventListener('click', function (e) {
        // Don't toggle if user clicked a link inside the heading
        if (e.target.tagName === 'A') return;
        sec.classList.toggle('collapsed');
      });
    });

    // Hash navigation: uncollapse ancestors when navigating to a section
    function uncollapseTarget() {
      var hash = window.location.hash;
      if (!hash) return;
      var target = document.querySelector(hash);
      if (!target) return;

      // Walk up to uncollapse all parent sections
      var el = target.closest('section');
      while (el) {
        el.classList.remove('collapsed');
        el = el.parentElement ? el.parentElement.closest('section') : null;
      }

      // If target is itself a section, uncollapse it
      if (target.tagName === 'SECTION') {
        target.classList.remove('collapsed');
      }
    }

    uncollapseTarget();
    window.addEventListener('hashchange', uncollapseTarget);
  }

  // Wait for MathJax if present (it can move elements)
  if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
    MathJax.startup.promise.then(init);
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
```

- [ ] **Step 2: Test with a page that has multiple sections**

Create a temporary test page with nested sections, build, and verify in browser that:
- Clicking a heading collapses/expands the section
- Hash links (e.g., `#section-name`) auto-uncollapse parent sections
- MathJax rendering completes before collapse handlers attach

- [ ] **Step 3: Commit**

```bash
git add assets/js/collapse.js
git commit -m "Add simplified collapsible sections JS for Pandoc section-divs"
```

---

## Task 8: Convert JS to ES modules

**Files:**
- Create: `src/lib/prng.js`
- Create: `src/smc-resampling/config.js`
- Create: `src/smc-resampling/algorithms.js`
- Create: `src/smc-resampling/drawing.js`
- Create: `src/smc-resampling/main.js`
- Create: `src/smc-resampling/particle-filter.js`
- Create: `src/smc-resampling/toolbar.js`
- Create: `src/smc-resampling/index.js`
- Create: `test/lib/prng.test.js`
- Create: `test/smc-resampling/algorithms.test.js`

This is the largest task. The strategy: extract the module boundary (what each file imports/exports) without rewriting internal logic. Each existing IIFE becomes an ES module. The `window.SMC` global namespace is replaced by explicit imports.

### Decomposition

The current `window.SMC` namespace mixes config, algorithms, drawing functions, and mutable state. We split it:

| Current | New module | Exports |
|---------|-----------|---------|
| `algorithms.js` lines 1-35 (config) | `config.js` | `N`, `MIN_W`, `PARTICLE_COLOR`, `PALETTE`, `METHOD_COLORS` |
| `algorithms.js` utility functions | `algorithms.js` | `cumulativeSum`, `searchSorted`, `normalize`, `resample`, test fn system, `runTrials`, etc. |
| `algorithms.js` PRNG (xorshift128) | `src/lib/prng.js` | `createPRNG`, `withSeed` |
| `drawing.js` | `drawing.js` | `panelLayout`, `drawYAxis`, `drawHistogram`, `drawPanel`, etc. |
| `main.js` | `main.js` | `init()` — sets up state, wires DOM, calls redrawAll |
| `particle-filter.js` | `particle-filter.js` | `createPFViz(config)` |
| `toolbar.js` | `toolbar.js` | `initToolbar()` |

The entry point (`index.js`) imports everything and calls the init functions.

- [ ] **Step 1: Extract PRNG to shared library**

Create `src/lib/prng.js`. Extract the xorshift128 PRNG from `particle-filter.js` (it's defined inside `createPFViz`). Make it a standalone, importable module:

```javascript
// src/lib/prng.js — Seedable xorshift128 PRNG

export function createPRNG(seed) {
  // xorshift128 state
  let s0 = seed | 0 || 1;
  let s1 = (seed * 1597334677) | 0 || 1;
  let s2 = (seed * 2850428717) | 0 || 1;
  let s3 = (seed * 4068709577) | 0 || 1;

  return function random() {
    let t = s3;
    t ^= t << 11;
    t ^= t >>> 8;
    s3 = s2; s2 = s1; s1 = s0;
    t ^= s0;
    t ^= s0 >>> 19;
    s0 = t;
    return (t >>> 0) / 4294967296;
  };
}

// Temporarily override Math.random with a seeded PRNG, run fn, restore.
export function withSeed(seed, fn) {
  if (seed == null) return fn();
  const original = Math.random;
  Math.random = createPRNG(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}
```

Note: read the actual PRNG implementation from `particle-filter.js` and use the exact same algorithm. The above is the expected structure — match the constants and bit operations to the original code.

- [ ] **Step 2: Write PRNG test**

Create `test/lib/prng.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPRNG, withSeed } from '../../src/lib/prng.js';

describe('createPRNG', () => {
  it('produces deterministic sequence from same seed', () => {
    const rng1 = createPRNG(42);
    const rng2 = createPRNG(42);
    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());
    assert.deepEqual(seq1, seq2);
  });

  it('produces values in [0, 1)', () => {
    const rng = createPRNG(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createPRNG(1);
    const rng2 = createPRNG(2);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    assert.notDeepEqual(seq1, seq2);
  });
});

describe('withSeed', () => {
  it('restores Math.random after execution', () => {
    const original = Math.random;
    withSeed(42, () => {
      assert.notEqual(Math.random, original);
    });
    assert.equal(Math.random, original);
  });

  it('restores Math.random even if fn throws', () => {
    const original = Math.random;
    assert.throws(() => {
      withSeed(42, () => { throw new Error('test'); });
    });
    assert.equal(Math.random, original);
  });
});
```

- [ ] **Step 3: Run PRNG tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit PRNG module**

```bash
git add src/lib/prng.js test/lib/prng.test.js
git commit -m "Extract seedable PRNG to shared lib with tests"
```

- [ ] **Step 5: Convert config.js**

Create `src/smc-resampling/config.js` by extracting the config constants from the top of `assets/smc-resampling/algorithms.js` (lines ~14-31):

```javascript
// src/smc-resampling/config.js — shared configuration constants

export const N = 8;
export const MIN_W = 0.01;

export const PARTICLE_COLOR = 'rgb(176,182,190)';
export const PALETTE = Array.from({ length: N }, () => PARTICLE_COLOR);

export const METHOD_COLORS = {
  multinomial: '#e67e22',
  stratified:  '#2980b9',
  systematic:  '#27ae60',
  residual:    '#8e44ad',
  branchkill:  '#795548',
};
```

- [ ] **Step 6: Convert algorithms.js to ES module**

Create `src/smc-resampling/algorithms.js`. Transform the IIFE into an ES module:

- Remove the `window.SMC = (function () { ... })()` wrapper
- `import { N, MIN_W, ... } from './config.js'`
- `import { createPRNG } from '../lib/prng.js'` (if algorithms.js uses PRNG directly)
- Convert internal functions to `export function` for those used by other modules
- Keep unexported functions as module-private
- Remove the mutable state properties (`weights`, `probes`, etc.) — those move to `main.js`
- The returned object's properties become named exports

Key exports: `cumulativeSum`, `searchSorted`, `normalize`, `resample`, `resetCanvas`, `TEST_FNS`, `getTestFnLabel`, `getTestFnValues`, `runTrials`, `evalEstimators`, `gaussianKDE`.

Read `assets/smc-resampling/algorithms.js` in full and convert each function. Keep the internal logic exactly as-is — only change the module boundaries.

- [ ] **Step 7: Write algorithms test**

Create `test/smc-resampling/algorithms.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeSum, normalize, resample } from '../../src/smc-resampling/algorithms.js';
import { N } from '../../src/smc-resampling/config.js';

describe('cumulativeSum', () => {
  it('computes prefix sums', () => {
    assert.deepEqual(cumulativeSum([1, 2, 3, 4]), [1, 3, 6, 10]);
  });

  it('handles single element', () => {
    assert.deepEqual(cumulativeSum([5]), [5]);
  });
});

describe('normalize', () => {
  it('normalizes weights to sum to 1', () => {
    const w = normalize([2, 3, 5]);
    const sum = w.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-10, `sum ${sum} not close to 1`);
    assert.ok(Math.abs(w[0] - 0.2) < 1e-10);
    assert.ok(Math.abs(w[1] - 0.3) < 1e-10);
    assert.ok(Math.abs(w[2] - 0.5) < 1e-10);
  });
});

describe('resample', () => {
  it('multinomial: expected counts equal N * weights', () => {
    const weights = [0.1, 0.2, 0.3, 0.4, 0.0, 0.0, 0.0, 0.0];
    // Run many trials and check mean counts
    const trials = 10000;
    const totalCounts = new Array(N).fill(0);
    for (let t = 0; t < trials; t++) {
      const result = resample('multinomial', weights, N);
      for (let i = 0; i < N; i++) totalCounts[i] += result.counts[i];
    }
    // E[count_i] = N * w_i
    for (let i = 0; i < 4; i++) {
      const expected = N * weights[i];
      const observed = totalCounts[i] / trials;
      assert.ok(
        Math.abs(observed - expected) < 0.1,
        `particle ${i}: expected ~${expected}, got ${observed}`
      );
    }
  });

  it('stratified: counts sum to N', () => {
    const weights = [0.05, 0.08, 0.12, 0.30, 0.20, 0.12, 0.08, 0.05];
    const result = resample('stratified', weights, N);
    const sum = result.counts.reduce((a, b) => a + b, 0);
    assert.equal(sum, N);
  });
});
```

Adjust the `resample` function signature to match the actual code — read `algorithms.js` to see the exact API. The `resample` function in the current code takes `(method, weights, N)` and returns an object; match that.

- [ ] **Step 8: Run algorithms tests**

```bash
npm test
```

Expected: all tests pass. If imports fail, check that `package.json` has `"type": "module"` — add it if not present.

- [ ] **Step 9: Commit config and algorithms**

```bash
git add src/smc-resampling/config.js src/smc-resampling/algorithms.js \
  test/smc-resampling/algorithms.test.js
git commit -m "Convert config and algorithms to ES modules with tests"
```

- [ ] **Step 10: Convert drawing.js**

Create `src/smc-resampling/drawing.js`. Transform the IIFE:

- Remove `(function () { ... })()` wrapper
- Replace `var S = window.SMC;` with imports from `config.js`
- Export each drawing function that's assigned back to `S` at the end of the original file: `panelLayout`, `drawYAxis`, `drawHistogram`, `drawPanel`, `drawCDF`, `drawEstHist`, etc.
- Internal helper functions that aren't exported stay as module-private functions
- Functions that read `S.weights` or other state will receive state as a parameter instead — or accept a state object. Look at how each drawing function accesses state and decide the cleanest interface.

The key change: instead of reading mutable state from `window.SMC`, drawing functions accept the data they need as arguments. This makes them pure and testable.

- [ ] **Step 11: Convert particle-filter.js**

Create `src/smc-resampling/particle-filter.js`. This is already nearly standalone:

- `createPFViz` becomes an exported function
- Replace `var S = window.SMC;` with: `import { N, PALETTE } from './config.js';`
- Replace the inline xorshift128 PRNG with: `import { withSeed } from '../lib/prng.js';`
- Keep the rest of the internal logic as-is

```javascript
import { N, PALETTE } from './config.js';
import { withSeed } from '../lib/prng.js';

export function createPFViz(config) {
  // ... rest of existing code, replacing S.N with N, S.PALETTE with PALETTE
}
```

- [ ] **Step 12: Convert toolbar.js**

Create `src/smc-resampling/toolbar.js`:

- Remove IIFE wrapper
- Replace `var S = window.SMC;` with imports from `config.js`
- Export an `initToolbar(state)` function that receives the shared state/config it needs
- DOM element lookups stay as-is (they run at init time)

- [ ] **Step 13: Convert main.js**

Create `src/smc-resampling/main.js`. This is the most complex conversion since it holds mutable state and wires everything together:

- Import from `config.js`, `algorithms.js`, `drawing.js`
- The mutable state (`weights`, `probes`, `sec3`-`sec6`, `secBK`, `compData`) becomes module-level variables in `main.js`
- Canvas references and DOM wiring stay similar
- Export an `init()` function that sets up everything and calls `redrawAll()`
- Drawing functions that previously read from `S.weights` etc. now receive the state as arguments (or read from module-scoped state that `main.js` owns)

- [ ] **Step 14: Create entry point index.js**

Create `src/smc-resampling/index.js`:

```javascript
// Entry point for the SMC resampling exploration.
// Imports all modules and initializes on DOMContentLoaded.

import { init } from './main.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 15: Commit all JS conversions**

```bash
git add src/smc-resampling/ src/lib/
git commit -m "Convert SMC resampling JS from IIFEs to ES modules"
```

---

## Task 9: esbuild integration and full Makefile build

**Files:**
- Modify: `Makefile` (already created in Task 3)
- Modify: `package.json` (add `"type": "module"`)

- [ ] **Step 1: Ensure package.json has ES module support**

Add `"type": "module"` to `package.json` so Node treats `.js` files as ES modules (needed for tests and for esbuild to resolve imports):

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/**/*.test.js"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "browser-sync": "^3.0.0"
  }
}
```

- [ ] **Step 2: Test esbuild bundling manually**

```bash
npx esbuild src/smc-resampling/index.js --bundle --outfile=_site/assets/js/smc-resampling.bundle.js
```

Expected: bundle created without errors. Check the output:

```bash
wc -l _site/assets/js/smc-resampling.bundle.js
```

Should be roughly similar to the total lines of all input files (esbuild preserves code by default, just wraps in module scaffolding).

- [ ] **Step 3: Run full build**

```bash
make clean && make -j4
```

Expected: content compiled, JS bundled, assets synced. No errors.

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json Makefile
git commit -m "Enable ES modules in package.json, verify esbuild bundling"
```

---

## Task 10: Convert smc-resampling.md to Pandoc markdown

**Files:**
- Create: `content/explorations/smc-resampling.md` (converted from `_explorations/smc-resampling.md`)

This is the most labor-intensive task. It involves converting ~600 lines of Jekyll/Kramdown markdown to Pandoc markdown. The conversion is mostly mechanical:

- [ ] **Step 1: Copy the source file**

```bash
cp _explorations/smc-resampling.md content/explorations/smc-resampling.md
```

- [ ] **Step 2: Update front matter**

Replace the Jekyll front matter with Pandoc-compatible front matter:

Old:
```yaml
layout: exploration
title: Resampling in Sequential Monte Carlo
date: 2026-04-08
original-date: 2023-10-10
author: jacob hoover vigly
css:
  - /assets/smc-resampling/style.css
js:
  - /assets/smc-resampling/algorithms.js
  - /assets/smc-resampling/drawing.js
  - /assets/smc-resampling/main.js
  - /assets/smc-resampling/particle-filter.js
  - /assets/smc-resampling/toolbar.js
mathjax_macros: >-
  { ... }
```

New:
```yaml
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
  rstate: "\\widetilde{\\state}"
  target: "\\pi"
  impwt: "\\rho"
  normwt: "w"
  np: "N"
  cnt: "M"
  gen: "{\\mathcal{G}}"
  E: "{\\mathbb{E}}"
  Var: "\\operatorname{Var}"
  cdf: "F"
  invcdf: "{F^{-1}}"
  probe: "u"
  resid: "\\widetilde{\\normwt}"
  idx: "i"
```

Key changes: `layout` removed (template is determined by Makefile), `js` is now a single bundle name, `css` is a single file name, macros are YAML object instead of JSON string.

- [ ] **Step 3: Remove Kramdown-specific syntax**

Search and replace:
- `{:.no_toc}` → remove (Pandoc doesn't use this; if needed, handle via template)
- `{:.some-class}` attribute syntax → Pandoc attribute syntax `{.some-class}` (note: no colon)

- [ ] **Step 4: Convert sidenotes from HTML to footnote syntax**

Find all occurrences of the Tufte sidenote HTML pattern:

```html
<label for="mn-..." class="margin-toggle">&#8853;</label>
<input type="checkbox" id="mn-..." class="margin-toggle"/>
<span class="marginnote">...content...</span>
```

and

```html
<label for="sn-..." class="margin-toggle sidenote-number"></label>
<input type="checkbox" id="sn-..." class="margin-toggle"/>
<span class="sidenote">...content...</span>
```

Replace each with Pandoc footnote syntax:

```markdown
^[...content...]
```

For marginnotes (unnumbered), use whatever syntax the vendored `sidenotes.lua` supports. If the filter doesn't distinguish marginnotes from sidenotes, we may need to extend it in this step — add a convention like starting the footnote with `{-}` (this is what pandoc-sidenote uses: `^[{-} marginnote content]`).

This is the most tedious part — there are many sidenotes/marginnotes in the document, some containing HTML elements (canvas, buttons). For sidenotes that contain interactive HTML (like the degeneracy canvas), keep the HTML inside the footnote:

```markdown
^[<canvas id="cv-degeneracy" style="width:100%; height:200px;"></canvas>
<button id="btn-degen-rerun">Re-run</button>
**Particle weight evolution.** Bars show $\normwt_t^\idx$...]
```

Or use a viz-mount shortcode if the filter supports inline blocks. Test what works.

- [ ] **Step 5: Convert manual citations to [@key] syntax**

Find places where citations are written as plain text (e.g., "Naesseth et al. (2019)") and replace with Pandoc citation syntax:

- Parenthetical: `[@naesseth2019]` renders as "(Naesseth et al., 2019)"
- In-text: `@naesseth2019` renders as "Naesseth et al. (2019)"
- Multiple: `[@douc2005; @li2015]` renders as "(Douc et al., 2005; Li et al., 2015)"

Check `assets/smc-resampling/references.bib` for the exact citation keys.

- [ ] **Step 6: Replace interactive HTML with viz-mount shortcodes where possible**

For canvas elements that are standalone (not inside sidenotes), replace:

```html
<canvas id="cv-sec3-multinomial" style="width:100%; max-width:620px; height:320px;"></canvas>
```

with:

```markdown
::: {.viz #cv-sec3-multinomial canvas="true" height="320px" width="100%"}
:::
```

For complex interactive HTML blocks (toggle switches, grouped buttons, etc.), keep as raw HTML — the viz-mount filter is for simple mount points only.

- [ ] **Step 7: Build and verify**

```bash
make clean && make -j4
```

Open `_site/explorations/smc-resampling.html` in a browser. Check:
- Page structure renders (heading, content, sidenotes)
- Math renders correctly (MathJax with macros)
- Sidenotes appear in margin
- Canvas elements are present in the DOM (even if JS isn't wired yet, the elements should exist)
- Citations render with bibliography at the end

- [ ] **Step 8: Fix issues iteratively**

This step will likely require multiple rounds of:
1. Build
2. Check in browser
3. Find rendering issue
4. Fix in markdown or filter
5. Rebuild

Common issues to watch for:
- HTML inside footnotes may not render correctly — Pandoc may need `{=html}` raw blocks
- Fenced div nesting edge cases
- Math with macros not expanding (check MathJax config in template)
- Missing CSS for elements that had exploration-specific styles

- [ ] **Step 9: Commit converted markdown**

```bash
git add content/explorations/smc-resampling.md
git commit -m "Convert smc-resampling.md to Pandoc markdown"
```

---

## Task 11: Dev server

**Files:**
- Create: `scripts/serve.sh`

- [ ] **Step 1: Write the serve script**

Create `scripts/serve.sh`:

```bash
#!/bin/bash
# Dev server: Pandoc + esbuild watch + browser-sync

set -e

OUTDIR="_site"

# Ensure a clean initial build
echo "Building..."
make -j4

# Start browser-sync in background
echo "Starting browser-sync..."
npx browser-sync start \
  --server "$OUTDIR" \
  --files "$OUTDIR/**/*" \
  --no-ui \
  --no-notify \
  --port 4000 &
BS_PID=$!

# Start esbuild in watch mode (rebuilds JS on change)
echo "Starting esbuild watcher..."
npx esbuild src/*/index.js --bundle \
  --outdir="$OUTDIR/assets/js" \
  --out-extension:.js=.bundle.js \
  --watch &
ES_PID=$!

# Watch content, filters, templates, CSS for Pandoc rebuilds
echo "Watching content for changes..."
fswatch -0 content/ filters/ templates/ assets/css/ | while IFS= read -r -d '' file; do
  ext="${file##*.}"
  if [ "$ext" = "md" ]; then
    # Rebuild just the changed file
    rel="${file#content/}"
    out="$OUTDIR/${rel%.md}.html"
    echo "Rebuilding: $rel"
    make "$out" 2>&1 | grep -v "^make" || true
  elif [ "$ext" = "lua" ] || [ "$ext" = "html" ]; then
    # Filter or template changed — full rebuild
    echo "Template/filter changed, full rebuild..."
    make content 2>&1 | grep -v "^make" || true
  elif [ "$ext" = "css" ]; then
    # CSS changed — just sync assets
    make assets 2>&1 | grep -v "^make" || true
  fi
done &
FS_PID=$!

# Trap to clean up all background processes on exit
cleanup() {
  echo "Shutting down..."
  kill $BS_PID $ES_PID $FS_PID 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

echo ""
echo "Dev server running at http://localhost:4000"
echo "Press Ctrl+C to stop."
echo ""

# Wait for any child to exit
wait
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x scripts/serve.sh
```

- [ ] **Step 3: Test make serve**

```bash
make serve
```

Expected: browser-sync starts and opens `http://localhost:4000`. The SMC resampling page should be accessible at `http://localhost:4000/explorations/smc-resampling.html`.

Test live reload: edit `content/explorations/smc-resampling.md`, save, and verify the browser reloads with the change.

- [ ] **Step 4: Commit**

```bash
git add scripts/serve.sh
git commit -m "Add dev server script with live reload (fswatch + esbuild + browser-sync)"
```

---

## Task 12: End-to-end verification

**Files:** None created — this is a testing/fixing task.

- [ ] **Step 1: Full clean build**

```bash
make clean && make -j4
```

Expected: no errors. All output in `_site/`.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all JS tests pass.

- [ ] **Step 3: Visual comparison in browser**

Start the dev server (`make serve`) and compare the new build with the current Jekyll-served page side by side:

Check:
- [ ] Typography: et-book font loads, text sizing matches
- [ ] Sidenotes: appear in right margin on desktop, collapse on mobile
- [ ] Math: all equations render correctly (inline and display)
- [ ] Math macros: custom macros (`\state`, `\normwt`, etc.) expand correctly
- [ ] Interactive canvases: all canvas elements present and rendering
- [ ] Buttons and controls: all buttons, sliders, toggles functional
- [ ] Particle filter visualizations: all three instances (degeneracy intro, full comparison, K-trials) work
- [ ] Toolbar: sticky toolbar appears on scroll, preset dropdown works
- [ ] Collapsible sections: click headings to collapse/expand
- [ ] Hash navigation: clicking a section link uncollaspes ancestors
- [ ] Citations: bibliography renders at end of page
- [ ] Responsive: sidenotes collapse on narrow viewport

- [ ] **Step 4: Fix any issues found**

Iterate on fixes. Common things that may need adjustment:
- CSS selectors that assume different DOM structure (Pandoc's section-divs vs. Kramdown's flat structure)
- JS selectors that assume specific parent/sibling relationships
- Font path issues
- MathJax macro loading timing

Commit each fix separately with a descriptive message.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "Phase 1 complete: SMC resampling end-to-end on Pandoc pipeline"
```

---

## Deferred to later phases

These items from the spec are intentionally excluded from Phase 1:

- **`citations-hover.lua`** — Hover-to-popup citation previews. Basic citeproc citations render correctly without this; hover popups are a progressive enhancement for Phase 2+.
- **`bare.html` template** — Only needed for the divergence-fitting demo and similar standalone pieces, which are Phase 2 migration items.
- **`scripts/build-index.lua`** — Blog listing page generator. Phase 2 (migrate remaining content).
- **`scripts/build-pubs.lua`** — Publications page generator. Phase 3.
- **GitHub Actions deploy workflow update** — Phase 4 (remove Jekyll).
