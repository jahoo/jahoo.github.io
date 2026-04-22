# Phase 2: Content Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all blog posts, static pages, and standalone HTML from Jekyll to the Pandoc pipeline, so everything except the publications page builds via `make`.

**Architecture:** Split `base.css` into shared chrome + two page-style CSS files. Update the Pandoc template to support `page-style` switching. Migrate posts mechanically (front matter cleanup, no content changes). Build a Lua listing-page generator. Freeze the Klipse post as static HTML. Copy iframe-embedded notebooks and standalone HTML as-is.

**Tech Stack:** Pandoc 3.9, Make, Lua (pandoc lua), esbuild, modern CSS

---

## File Map

```
# New files
assets/css/post.css                # et-book Tufte style (extracted from base.css)
assets/css/site.css                # Biolinum/Libertine style (adapted from Jekyll SCSS)
assets/frozen/klipse-clojure.html  # frozen Jekyll-rendered Klipse post
content/posts/banach-tarski.md
content/posts/eq-FSA-MSOL.md
content/posts/klipse-clojure.md    # thin wrapper pointing to frozen HTML
content/posts/wccfl.md
content/posts/noisy-channel-coding.md
content/posts/training-tensor-trains.md
content/posts/simplest-linear-regression.md
content/posts/deterministic-dependency-parsing.md
content/posts/EMNLP-dependency-dependence.md
content/posts/rejection-sampling-expo.md
content/posts/transform-pdf.md
content/posts/LaTeX-tutorial.md
content/posts/plausibility-sampling-processing.md
content/posts/surprisal-and-KL.md
content/posts/dissertation.md
content/index.md
content/pubs.md
scripts/build-index.lua

# Modified files
assets/css/base.css                # strip post-specific typography, keep chrome
templates/base.html                # add page-style conditional CSS loading + body class
Makefile                           # add generate target, static HTML copying
docs/authoring.md                  # update with page-style docs
```

---

## Task 1: CSS split — extract post.css and create site.css

**Files:**
- Modify: `assets/css/base.css`
- Create: `assets/css/post.css`
- Create: `assets/css/site.css`

- [ ] **Step 1: Create post.css by extracting post-specific rules from base.css**

Create `assets/css/post.css` with the et-book typography and Tufte layout rules. These are the rules currently in `base.css` that should only apply to posts/explorations:

```css
/* post.css — et-book Tufte style for posts and explorations */

body.page-style-post {
  font-family: var(--s-body);
  font-size: 1.1rem;
  line-height: 1.7;
  color: var(--s-text);
  background: var(--s-bg);
}

body.page-style-post .post-content {
  width: 60%;
  counter-reset: sidenote-counter;
}

body.page-style-post .sidenote,
body.page-style-post .marginnote {
  float: right;
  clear: right;
  margin-right: -62%;
  width: 55%;
  margin-top: 0.3rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  line-height: 1.4;
  color: #555;
}

body.page-style-post div.marginnote {
  width: 33%;
  margin-right: 3%;
}
```

Read the full `assets/css/base.css`, identify all rules that are post/exploration-specific (font-family on body, `.post-content` width, sidenote positioning, et-book font-face, section collapse chevrons, etc.), and move them to `post.css` wrapped in `body.page-style-post` selectors. Keep in `base.css` only: CSS variables, `@font-face` declarations for all fonts, nav/footer styles, callout styles, code highlighting, and structural layout (`.wrapper`, `.page-content`).

- [ ] **Step 2: Create site.css for the Jekyll-like pages**

Create `assets/css/site.css` with styles matching the current Jekyll site look:

```css
/* site.css — Biolinum/Libertine style for index, listing, pubs */

@font-face {
  font-family: "Linux Biolinum";
  src: url("../fonts/LinBiolinum/LinBiolinum_R.woff") format("woff");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Linux Biolinum";
  src: url("../fonts/LinBiolinum/LinBiolinum_RI.woff") format("woff");
  font-weight: normal;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Linux Biolinum";
  src: url("../fonts/LinBiolinum/LinBiolinum_RB.woff") format("woff");
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Linux Libertine";
  src: url("../fonts/LinLibertine/LinLibertine_R.woff") format("woff");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

body.page-style-site {
  font-family: "Linux Biolinum", "Computer Modern Serif", Times, serif;
  font-size: 18px;
  line-height: 1.5;
  color: #111;
}

body.page-style-site .post-content {
  max-width: 800px;
}

body.page-style-site .site-title {
  font-family: "Linux Biolinum Outline", "Linux Biolinum", sans-serif;
  font-size: 2.75rem;
  letter-spacing: -3px;
  color: #828282;
}

body.page-style-site .site-nav {
  font-family: "Linux Libertine", "Computer Modern Concrete", Times, serif;
  font-size: 1.5rem;
}

body.page-style-site .page-link {
  color: #4a4a4a;
}
body.page-style-site .page-link:hover {
  color: black;
}
```

Read `css/main.scss`, `_sass/_layout.scss`, and `_sass/_base.scss` to get the exact values for font sizes, colors, spacing, header height, etc. Reproduce the current Jekyll look using modern CSS (no SCSS variables — use CSS custom properties or literal values).

- [ ] **Step 3: Strip post-specific rules from base.css**

Remove from `base.css`: the body font/color rules, `.post-content` width rule, sidenote positioning rules, section collapse chevron rules, and anything else that moved to `post.css`. Keep: CSS custom properties (`:root`), `@font-face` for et-book (shared), nav/footer styles, callout styles, `.wrapper` layout, code block styles, responsive media queries for nav.

- [ ] **Step 4: Verify with test pages**

Create two temporary test pages:

`content/test-post.md`:
```markdown
---
title: Post Style Test
date: 2026-04-16
---

Body text in et-book.^[A sidenote in the margin.]

$$E = mc^2$$
```

`content/test-site.md`:
```markdown
---
title: Site Style Test
date: 2026-04-16
page-style: site
---

Body text in Biolinum. This should look like the current Jekyll site pages.
```

Build with `make clean && make` (using `trash` for clean), open both in browser, verify:
- Post page: et-book font, 60% content width, sidenote in margin
- Site page: Biolinum font, 800px content width, no sidenote column

- [ ] **Step 5: Delete test pages and commit**

```bash
git add assets/css/base.css assets/css/post.css assets/css/site.css
git commit -m "Split CSS: base (chrome) + post (et-book) + site (Biolinum)"
```

---

## Task 2: Update template for page-style switching

**Files:**
- Modify: `templates/base.html`

- [ ] **Step 1: Add page-style logic to the template**

Read `templates/base.html`. Make these changes:

1. Add a body class based on `page-style`:
```html
<body class="page-style-$if(page-style)$$page-style$$else$post$endif$">
```

2. Add conditional CSS loading after `base.css`:
```html
  <link rel="stylesheet" href="/assets/css/base.css">
$if(page-style)$
$if(page-style.site)$
  <link rel="stylesheet" href="/assets/css/site.css">
$else$
  <link rel="stylesheet" href="/assets/css/post.css">
$endif$
$else$
  <link rel="stylesheet" href="/assets/css/post.css">
$endif$
```

Note: Pandoc template conditionals can't do string comparison directly. The simplest approach: check `$if(page-style)$` and use the value. Since the only non-default value is `site`, we can check for its presence. Alternative: always load both CSS files and let the body class scope the rules (simpler template, slightly more CSS loaded). Choose whichever approach works with Pandoc's template language — test it.

- [ ] **Step 2: Test template renders correctly**

Build the two test pages from Task 1 (or recreate them). Verify:
- `test-post.html` has `<body class="page-style-post">` and loads `post.css`
- `test-site.html` has `<body class="page-style-site">` and loads `site.css`

- [ ] **Step 3: Commit**

```bash
git add templates/base.html
git commit -m "Add page-style switching to template (body class + conditional CSS)"
```

---

## Task 3: Migrate simple blog posts

**Files:**
- Create: 13 files in `content/posts/`

- [ ] **Step 1: Migrate each post**

For each post in `_posts/`, create the corresponding file in `content/posts/`. The conversion for each:

1. Remove `layout: post` from front matter
2. Keep `title`, `date`, `published` (if false), `tags`
3. Add `highlighted: true` for posts tagged `paper` or `dissertation`
4. Remove Kramdown-specific syntax (`{:.class}`)
5. Inline HTML (images, divs) passes through Pandoc unchanged — no conversion needed

Here are the exact files to create, with their front matter:

**content/posts/banach-tarski.md:**
```yaml
---
title: Banach-Tarski - A basic magic of group theory
date: 2013-05-02
tags: [note]
---
```
Body: copy from `_posts/2013-05-02-banach-tarski.md` after front matter, unchanged.

**content/posts/eq-FSA-MSOL.md:**
```yaml
---
title: An equivalence between generative automata and logical constraints
date: 2018-11-15
tags: [presentation]
---
```

**content/posts/wccfl.md:**
```yaml
---
title: Icelandic agreement talk at WCCFL 38
date: 2020-03-07
tags: [presentation, paper]
highlighted: true
---
```

**content/posts/noisy-channel-coding.md:**
```yaml
---
title: "Shannon's noisy channel-coding theorem"
date: 2020-12-16
tags: [presentation]
---
```

**content/posts/training-tensor-trains.md:**
```yaml
---
title: A practical comparison of tensor train models
date: 2020-12-22
tags: [presentation]
---
```

**content/posts/simplest-linear-regression.md:**
```yaml
---
title: Simplest least-squares in Julia
date: 2021-01-11
tags: [note]
---
```
Body: keep the iframe embedding (`<iframe src="/assets/simplest_linear_regression_example.html" ...>`).

**content/posts/deterministic-dependency-parsing.md:**
```yaml
---
title: "Nivre's parsing examples animated"
date: 2021-04-16
tags: [note]
---
```

**content/posts/EMNLP-dependency-dependence.md:**
```yaml
---
title: Linguistic Dependencies and Statistical Dependence
date: 2021-11-07
tags: [presentation, paper]
highlighted: true
---
```

**content/posts/rejection-sampling-expo.md:**
```yaml
---
title: Rejection sampling
date: 2022-08-29
tags: [note]
---
```
Body: keep the introductory text and iframe embedding. Remove the HTML comment about removing site_libs.

**content/posts/transform-pdf.md:**
```yaml
---
title: Density of transformed random variable
date: 2022-09-02
tags: [note]
---
```
Body: keep the iframe embedding. Remove the HTML comment.

**content/posts/LaTeX-tutorial.md:**
```yaml
---
title: LaTeX for Linguistics tutorial
date: 2022-10-05
tags: [note]
---
```

**content/posts/plausibility-sampling-processing.md:**
```yaml
---
title: Plausibility of Sampling for Processing
date: 2022-10-21
tags: [note, paper]
highlighted: true
---
```

**content/posts/surprisal-and-KL.md:**
```yaml
---
title: surprisal and KL
date: 2023-10-10
tags: [note]
---
```
Body: this post uses `$$\global\def\colorKL{...}$$` for KaTeX macro definitions. These should work with MathJax too — keep as-is.

**content/posts/dissertation.md:**
```yaml
---
title: The Cost of Information
date: 2024-08-02
tags: [dissertation]
highlighted: true
---
```

- [ ] **Step 2: Build and spot-check a few posts**

```bash
make clean && make content
```

Open 3-4 posts in the browser and verify: title, date, body content render correctly. Check that inline HTML (images, iframes) passes through.

- [ ] **Step 3: Commit**

```bash
git add content/posts/
git commit -m "Migrate 13 simple blog posts to content/posts/"
```

---

## Task 4: Handle special posts (Klipse, notebooks)

**Files:**
- Create: `assets/frozen/klipse-clojure.html`
- Create: `content/posts/klipse-clojure.md`

- [ ] **Step 1: Freeze the Klipse post**

Switch to the `source` branch, build with Jekyll, and save the rendered Klipse post:

```bash
git stash
git checkout source
chruby 3.1.7
bundle exec jekyll build
cp _site/2019/10/03/klipse-clojure.html /tmp/klipse-frozen.html
git checkout pandoc-migration
git stash pop
mkdir -p assets/frozen
cp /tmp/klipse-frozen.html assets/frozen/klipse-clojure.html
```

Also save the original markdown source for future re-rendering:

```bash
cp _posts/2019-10-03-klipse-clojure.md assets/frozen/klipse-clojure.md
cp _includes/clojure-preamble.html assets/frozen/clojure-preamble.html
```

- [ ] **Step 2: Create the listing entry for the Klipse post**

Create `content/posts/klipse-clojure.md` — this is a thin redirect/wrapper so the listing generator finds it:

```markdown
---
title: Interactive diagrams with Klipse+Vega
date: 2019-10-03
tags: [note]
frozen: /assets/frozen/klipse-clojure.html
---

This post uses interactive Clojure code via Klipse. [View the full post](/assets/frozen/klipse-clojure.html).
```

The `frozen:` field tells the listing generator to link to the static file instead of the Pandoc-rendered version. We'll handle this in the listing generator (Task 6).

- [ ] **Step 3: Add Makefile rule for frozen HTML**

Add `assets/frozen` to the `STATIC_DIRS` list in the Makefile so it gets copied to `_site/`.

- [ ] **Step 4: Commit**

```bash
git add assets/frozen/ content/posts/klipse-clojure.md Makefile
git commit -m "Freeze Klipse+Vega post as static HTML, save source for future"
```

---

## Task 5: Migrate root pages

**Files:**
- Create: `content/index.md`
- Create: `content/pubs.md`

- [ ] **Step 1: Create content/index.md**

```markdown
---
title: about
page-style: site
---

Hi. [I](/assets/j2024.jpeg)'m Jacob. Some things I'm interested in are human language processing and inference algorithms.
My research builds on probabilistic models of cognition, using information theory, algorithmic complexity, and tools from linguistics and machine learning.

In my current position I research and coordinate at [CHI FRO](https://chi-fro.org/), and I am part of the [GenLM](https://genlm.org/) research consortium.
Previously, I was a postdoctoral fellow at MIT's [Department of Brain and Cognitive Sciences](https://bcs.mit.edu), working with [Roger Levy](https://www.mit.edu/~rplevy/), in the [Computational Psycholinguistics Laboratory](http://cpl.mit.edu/).
```

Copy the full body from the current `index.md` (read it), removing only the `layout: page` from front matter and adding `page-style: site`. Keep all content as-is.

- [ ] **Step 2: Create content/pubs.md (placeholder)**

```markdown
---
title: research
page-style: site
---

Publications page is being migrated. For now, see the [current publications page](https://jahoo.github.io/pubs.html).
```

- [ ] **Step 3: Build and verify**

```bash
make clean && make content
```

Check `_site/index.html` — should show the about page with Biolinum font and Jekyll-like layout.

- [ ] **Step 4: Commit**

```bash
git add content/index.md content/pubs.md
git commit -m "Migrate index (about) and pubs (placeholder) pages"
```

---

## Task 6: Blog listing generator

**Files:**
- Create: `scripts/build-index.lua`
- Modify: `Makefile`

- [ ] **Step 1: Write build-index.lua**

Create `scripts/build-index.lua`:

```lua
-- build-index.lua — Generate blog listing page from post/exploration front matter
-- Run via: pandoc lua scripts/build-index.lua

local lfs = require("lfs")  -- pandoc bundles lfs

-- Parse YAML front matter from a markdown file (simple key: value parser)
local function parse_front_matter(filepath)
  local f = io.open(filepath, "r")
  if not f then return nil end
  local line = f:read("*l")
  if not line or not line:match("^%-%-%-") then f:close(); return nil end

  local meta = {}
  for l in f:lines() do
    if l:match("^%-%-%-") then break end
    -- Simple key: value (handles strings, booleans)
    local key, val = l:match("^(%w[%w%-]*):%s*(.+)$")
    if key and val then
      -- Strip quotes
      val = val:gsub('^"(.*)"$', "%1"):gsub("^'(.*)'$", "%1")
      if val == "true" then val = true
      elseif val == "false" then val = false end
      meta[key] = val
    end
    -- Handle tags as a list (simplified: [tag1, tag2])
    if not key then
      local tag = l:match("^%s+%-%s+(.+)$")
      if tag and meta._in_tags then
        meta.tags = meta.tags or {}
        table.insert(meta.tags, tag)
      end
    end
    if l:match("^tags:") and not l:match(":%s+%[") then
      meta._in_tags = true
    elseif key then
      meta._in_tags = false
    end
    -- Inline tags: tags: [note, paper]
    local inline_tags = l:match("^tags:%s+%[(.+)%]")
    if inline_tags then
      meta.tags = {}
      for tag in inline_tags:gmatch("[^,%s]+") do
        table.insert(meta.tags, tag)
      end
    end
  end
  f:close()
  meta._in_tags = nil
  return meta
end

-- Scan a directory for .md files and collect metadata
local function scan_dir(dir, url_prefix)
  local posts = {}
  for entry in lfs.dir(dir) do
    if entry:match("%.md$") then
      local path = dir .. "/" .. entry
      local meta = parse_front_matter(path)
      if meta and meta.title and meta.published ~= false then
        local slug = entry:gsub("%.md$", "")
        meta.url = url_prefix .. "/" .. slug .. ".html"
        meta.slug = slug
        -- If frozen, link to the frozen URL instead
        if meta.frozen then
          meta.url = meta.frozen
        end
        table.insert(posts, meta)
      end
    end
  end
  return posts
end

-- Collect all posts and explorations
local posts = scan_dir("content/posts", "/posts")
local explorations = scan_dir("content/explorations", "/explorations")

-- Merge and sort by date descending
local all = {}
for _, p in ipairs(posts) do table.insert(all, p) end
for _, e in ipairs(explorations) do table.insert(all, e) end
table.sort(all, function(a, b) return (a.date or "") > (b.date or "") end)

-- Generate markdown
local out = {}
table.insert(out, "---")
table.insert(out, "title: blog")
table.insert(out, "page-style: site")
table.insert(out, "---")
table.insert(out, "")

for _, p in ipairs(all) do
  local title = p.title or p.slug
  local date = p.date or ""
  local link = "[" .. title .. "](" .. p.url .. ")"
  if p.highlighted then
    link = "**" .. link .. "**"
  end
  table.insert(out, "- " .. date .. " &ensp; " .. link)
end

-- Write output
lfs.mkdir("_generated")
local f = io.open("_generated/posts.md", "w")
f:write(table.concat(out, "\n") .. "\n")
f:close()

print("Generated _generated/posts.md (" .. #all .. " entries)")
```

- [ ] **Step 2: Update Makefile**

Add to the Makefile:

1. Add `_generated` to content sources:
```makefile
MD_SOURCES := $(shell find content _generated -name '*.md' -type f 2>/dev/null)
```

2. Add a `generate` target:
```makefile
generate:
	@pandoc lua scripts/build-index.lua

content: generate $(HTML_TARGETS)
```

Wait — this creates a circular dependency since `$(HTML_TARGETS)` depends on `$(MD_SOURCES)` which includes `_generated/`. The fix: make `generate` an order-only prerequisite, and recalculate `HTML_TARGETS` after generation. Simpler approach: run the generate step explicitly in the `all` target:

```makefile
all:
	@pandoc lua scripts/build-index.lua
	@$(MAKE) content js assets
```

Or use a two-phase approach — the Makefile runs the generator first, then the build. The simplest correct approach:

```makefile
.PHONY: all clean content js assets serve test generate

all: generate
	@$(MAKE) _content js assets

generate:
	@pandoc lua scripts/build-index.lua

_content: $(HTML_TARGETS)
```

Read the current Makefile and integrate the generate step cleanly.

3. Add `assets/frozen` and static HTML directories to `STATIC_DIRS`:
```makefile
STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography assets/CV assets/frozen assets/pdfs
```

Also add rules to copy standalone HTML files and presentation directories.

4. Add the content source for `_generated/`:
```makefile
MD_SOURCES := $(shell find content -name '*.md' -type f) $(wildcard _generated/*.md)
```

- [ ] **Step 3: Test the listing generator**

```bash
pandoc lua scripts/build-index.lua
cat _generated/posts.md
```

Verify: markdown with front matter, sorted by date descending, highlighted posts in bold, correct URLs.

- [ ] **Step 4: Build full site and verify listing page**

```bash
make clean && make
```

Open `_site/posts.html` and verify it shows all posts in chronological order with highlighted ones distinguished.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-index.lua Makefile _generated/posts.md
git commit -m "Add blog listing generator and update Makefile for Phase 2"
```

---

## Task 7: Copy standalone HTML and static assets

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Add static HTML copy rules**

Add to the Makefile a rule that copies standalone HTML files to `_site/`:

```makefile
# Standalone HTML files (explorations, redirects)
STATIC_HTML := _explorations/interactive-divergence-fitting.html \
               interactive-divergence-fitting.html \
               interactive-kl-fitting.html

static-html:
	@for f in $(STATIC_HTML); do \
		dest=$(OUTDIR)/$$(echo $$f | sed 's|^_explorations/|explorations/|'); \
		mkdir -p $$(dirname $$dest); \
		cp $$f $$dest; \
	done
	@echo "Static HTML copied"
```

Add `static-html` to the `all` target.

- [ ] **Step 2: Ensure all asset directories are synced**

Review the `STATIC_DIRS` list in the Makefile. Add any missing directories that contain assets referenced by posts:

- `assets/pdfs` (dissertation, banach-tarski, noisy-channel handout, parsing PDF)
- `assets/simplest_linear_regression_example.html` (and its directory)
- `assets/rejection-sampling-expo/` (Quarto notebook HTML + site_libs)
- `assets/transform-pdf/` (Quarto notebook HTML + site_libs)

The `rsync` rule handles directories. For the single HTML file (`simplest_linear_regression_example.html`), add a copy rule or put it in a directory.

Read the Makefile and adjust `STATIC_DIRS` and any individual file copy rules.

- [ ] **Step 3: Verify all assets are accessible**

Build and check that iframe sources resolve:
- `/assets/simplest_linear_regression_example.html`
- `/assets/rejection-sampling-expo/q/notebooks/rejection-sampling-expo.html`
- `/assets/transform-pdf/q/notebooks/transform-pdf.html`
- `/explorations/interactive-divergence-fitting.html`

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "Add static HTML copying and ensure all asset directories sync"
```

---

## Task 8: Update authoring guide

**Files:**
- Modify: `docs/authoring.md`

- [ ] **Step 1: Add page-style documentation**

Add a section to `docs/authoring.md` about the `page-style` front matter field:

```markdown
## Page styles

Pages use one of two visual styles, controlled by the `page-style` front matter field:

- **`page-style: site`** — Biolinum/Libertine fonts, wider content column (800px). Use for the index, listing, publications, and other site-chrome pages.
- **Default (omit `page-style`)** — et-book Tufte style with sidenotes, 60% content width. Use for blog posts and explorations.

The template adds `page-style-{value}` as a class on `<body>`, so all visual differences are CSS-only.
```

Also add a section about the listing generator and highlighted posts:

```markdown
## Blog listing

The listing page is auto-generated from post front matter by `scripts/build-index.lua`. Run `make` to regenerate.

To highlight a post in the listing (bold title), add to front matter:

    highlighted: true

Posts tagged `paper` or `dissertation` typically get this.
```

- [ ] **Step 2: Commit**

```bash
git add docs/authoring.md
git commit -m "Update authoring guide with page-style and listing docs"
```

---

## Task 9: End-to-end verification

**Files:** None — testing task.

- [ ] **Step 1: Full clean build**

```bash
make clean && make
```

Expected: no errors.

- [ ] **Step 2: Verify each page type**

Start the dev server and check:

- [ ] `index.html` — Biolinum font, site-style layout, about content
- [ ] `posts.html` — Biolinum font, listing of all posts, highlighted ones bold
- [ ] `pubs.html` — placeholder with link to current publications
- [ ] A simple post (e.g., `posts/banach-tarski.html`) — et-book font, post layout
- [ ] A post with images (e.g., `posts/noisy-channel-coding.html`) — images display
- [ ] An iframe post (e.g., `posts/rejection-sampling-expo.html`) — iframe loads
- [ ] The Klipse post link — leads to frozen HTML that works
- [ ] The SMC resampling exploration — still works as before (regression check)
- [ ] `explorations/interactive-divergence-fitting.html` — standalone HTML loads
- [ ] Redirect stubs work (root `interactive-divergence-fitting.html` redirects)

- [ ] **Step 3: Fix any issues found**

Iterate. Common things to check:
- Asset paths in posts (images, PDFs)
- CSS scoping (site vs post styles not bleeding)
- Listing page links resolve correctly
- Nav links work from every page type

- [ ] **Step 4: Commit fixes and final commit**

```bash
git add -A
git commit -m "Phase 2 complete: all content migrated to Pandoc pipeline"
```

---

## Deferred

- Publications page with bib rendering (Phase 3)
- Nav slimming for individual posts (future CSS tweak)
- Re-rendering Quarto notebooks from source
- Klipse+Vega Pandoc integration
