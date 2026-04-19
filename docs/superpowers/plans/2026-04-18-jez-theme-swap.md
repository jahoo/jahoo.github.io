# Jez theme swap — Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap our custom Tufte-inspired post CSS/template/filters for Jez Zimmerman's `pandoc-markdown-css-theme`, vendored by direct copy. Scope is v1: the raw swap only. Custom styling (navbar, homepage, listing, per-page CSS, collapsible sections) is explicit follow-up.

**Architecture:** Vendor three of Jez's files (`template.html5`, `theme.css`, `pandoc-sidenote.lua`) into `assets/vendor/pandoc-markdown-css-theme/` with one local edit to the template (MathJax v4 replacement for `$math$` slot). Rewire `scripts/build-content.sh` to point at the vendored template + filter, add `--include-before-body templates/navbar.html` for a hardcoded navbar snippet, pass `--css /assets/vendor/pandoc-markdown-css-theme/theme.css`. Delete our old `templates/base.html`, `assets/css/{base,post,site}.css`, and `filters/{sidenotes,block-marginnotes}.lua`.

**Tech Stack:** Pandoc (existing), Make (existing), bash build script (existing). No new runtime dependencies; MathJax v4 stays (no switch to KaTeX).

**Spec:** [`docs/superpowers/specs/2026-04-18-jez-theme-swap-design.md`](../specs/2026-04-18-jez-theme-swap-design.md)

**Upstream reference:** `jez/pandoc-markdown-css-theme` at commit `a8046cc48ed68d219206d98ebb5604cc09104096` (captured 2026-04-18).

---

## File structure

### Created

| Path | Responsibility |
|---|---|
| `assets/vendor/pandoc-markdown-css-theme/template.html5` | Pandoc HTML template, one local edit |
| `assets/vendor/pandoc-markdown-css-theme/theme.css` | Visual styling for body + sidenotes + headings + code + TOC |
| `assets/vendor/pandoc-markdown-css-theme/pandoc-sidenote.lua` | Lua filter: transforms Pandoc footnotes to sidenote markup |
| `assets/vendor/pandoc-markdown-css-theme/VENDORED.md` | Upstream URL, commit SHA, list of local edits |
| `templates/navbar.html` | Static HTML snippet, included before `<body>` |

### Deleted

| Path | Reason |
|---|---|
| `templates/base.html` | Replaced by vendored Jez template |
| `assets/css/base.css` | Jez's `theme.css` owns base styling |
| `assets/css/post.css` | Jez's `theme.css` owns post styling |
| `assets/css/site.css` | Jez's `theme.css` owns site styling (homepage has no custom CSS in v1) |
| `filters/sidenotes.lua` | Replaced by vendored `pandoc-sidenote.lua` |
| `filters/block-marginnotes.lua` | Jez's filter doesn't support fenced-div marginnotes; the one post affected is a known v1 regression |

### Modified

| Path | Change |
|---|---|
| `scripts/build-content.sh` | Point `--template` at vendored file, add `--include-before-body`, `--css`, explicit Jez `--lua-filter` |
| `Makefile` | Add `assets/vendor` to `STATIC_DIRS` so the vendored theme ships to `_site/` |
| `content/posts/2026-04-08-smc-resampling.md` | Front-matter `css: - smc-resampling.css` → `css: - /assets/css/smc-resampling.css` (Jez's template doesn't prefix `/assets/css/`) |

### Kept (unchanged)

`filters/callouts.lua`, `filters/mathjax-macros.lua`, `filters/viz-mount.lua`, `assets/js/*`, `assets/css/smc-resampling.css`, `_generated/*.md`, `scripts/build-*.{js,lua,sh}`, `site.yaml`, `content/**` except the one post with the `css:` front-matter fix.

---

## Task 1: Branch setup + vendor Jez's files

**Files:**
- Create: `assets/vendor/pandoc-markdown-css-theme/template.html5`
- Create: `assets/vendor/pandoc-markdown-css-theme/theme.css`
- Create: `assets/vendor/pandoc-markdown-css-theme/pandoc-sidenote.lua`
- Create: `assets/vendor/pandoc-markdown-css-theme/VENDORED.md`

- [ ] **Step 1: Create and check out the new branch**

Run from repo root:
```bash
git checkout -b jez-theme-swap
```
Expected: `Switched to a new branch 'jez-theme-swap'`

- [ ] **Step 2: Create the vendor directory**

```bash
mkdir -p assets/vendor/pandoc-markdown-css-theme
```
Expected: silent success. Verify with `ls assets/vendor/pandoc-markdown-css-theme/`.

- [ ] **Step 3: Fetch `template.html5`, `theme.css`, and `pandoc-sidenote.lua` from upstream**

GitHub may need sandbox-disabled curl on this machine; use `dangerouslyDisableSandbox: true` if the first attempt fails with TLS errors.

```bash
UPSTREAM_SHA=a8046cc48ed68d219206d98ebb5604cc09104096
BASE="https://raw.githubusercontent.com/jez/pandoc-markdown-css-theme/${UPSTREAM_SHA}"

curl -sSL "${BASE}/template.html5" -o assets/vendor/pandoc-markdown-css-theme/template.html5
curl -sSL "${BASE}/public/css/theme.css" -o assets/vendor/pandoc-markdown-css-theme/theme.css
curl -sSL "${BASE}/pandoc-sidenote.lua" -o assets/vendor/pandoc-markdown-css-theme/pandoc-sidenote.lua
```

Expected: three files written, each non-empty.

- [ ] **Step 4: Verify the files are non-empty and have the expected first lines**

```bash
wc -l assets/vendor/pandoc-markdown-css-theme/{template.html5,theme.css,pandoc-sidenote.lua}
head -1 assets/vendor/pandoc-markdown-css-theme/template.html5
head -1 assets/vendor/pandoc-markdown-css-theme/theme.css
head -3 assets/vendor/pandoc-markdown-css-theme/pandoc-sidenote.lua
```

Expected:
- `template.html5` line 1 starts with `<!DOCTYPE html>`
- `theme.css` line 1 is blank or a `/* ----- ... */` comment block
- `pandoc-sidenote.lua` starts with `--` comment lines and contains `pandoc-sidenote.lua` in the header comment
- All three files have at least 100 lines

- [ ] **Step 5: Write `VENDORED.md`**

Create `assets/vendor/pandoc-markdown-css-theme/VENDORED.md` with the following exact contents:

```markdown
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

### `template.html5` — MathJax v4 replaces the `$math$` slot

Upstream ships a `$math$` slot that Pandoc populates based on the `--katex` / `--mathjax` flag. This site uses MathJax v4 with per-page macros loaded from JSON via our `filters/mathjax-macros.lua` filter, which sets the `$mathjax-macros-json$` template variable. We replace the `$math$` slot with an explicit MathJax v4 configuration block so the per-page macros are picked up.

Search upstream for:

```
$if(math)$
  $math$
$endif$
```

Replace with:

```
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

## Re-syncing with upstream

1. Fetch the upstream file at the new commit.
2. Re-apply the MathJax edit above.
3. Update the Commit + Vendored on fields at the top of this file.
```

- [ ] **Step 6: Commit**

```bash
git add assets/vendor/pandoc-markdown-css-theme/
git commit -m "Vendor jez/pandoc-markdown-css-theme at a8046cc"
```

Expected: clean commit, no pre-commit hook failures (none configured).

---

## Task 2: Apply MathJax v4 edit to the vendored template

**Files:**
- Modify: `assets/vendor/pandoc-markdown-css-theme/template.html5`

- [ ] **Step 1: Locate the `$math$` block**

```bash
grep -n -B1 -A3 '^  \$math\$$' assets/vendor/pandoc-markdown-css-theme/template.html5
```

Expected output (line numbers may vary slightly if upstream moves things):

```
XX-$if(math)$
XX:  $math$
XX-$endif$
```

Note the line numbers.

- [ ] **Step 2: Apply the edit**

Using the Edit tool (exact whitespace matters):

```
old_string:
$if(math)$
  $math$
$endif$

new_string:
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

- [ ] **Step 3: Verify the edit**

```bash
grep -c 'MathJax-script' assets/vendor/pandoc-markdown-css-theme/template.html5
grep -c 'mathjax-macros-json' assets/vendor/pandoc-markdown-css-theme/template.html5
grep -c '^  \$math\$$' assets/vendor/pandoc-markdown-css-theme/template.html5
```

Expected: `1`, `1`, `0` — the MathJax script is inserted once, the macros JSON placeholder is present, and the old `$math$` slot is gone.

- [ ] **Step 4: Commit**

```bash
git add assets/vendor/pandoc-markdown-css-theme/template.html5
git commit -m "Vendored template: swap \$math\$ slot for MathJax v4 config"
```

---

## Task 3: Create `templates/navbar.html`

**Files:**
- Create: `templates/navbar.html`

- [ ] **Step 1: Write the navbar file**

Create `templates/navbar.html` with these exact contents:

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

- [ ] **Step 2: Verify the file**

```bash
grep -c 'site-header' templates/navbar.html
grep -c 'site-title-full' templates/navbar.html
grep -c '/posts/' templates/navbar.html
```

Expected: `1`, `1`, `1`.

- [ ] **Step 3: Commit**

```bash
git add templates/navbar.html
git commit -m "Add templates/navbar.html for include-before-body"
```

---

## Task 4: Rewire `scripts/build-content.sh` and `Makefile`

These two changes are committed together because the build is only valid with both in place: the script references the vendored template + CSS (must exist in `_site/` via STATIC_DIRS), and the Makefile is what rsyncs it there.

**Files:**
- Modify: `scripts/build-content.sh:10-14`
- Modify: `Makefile:10-13`

- [ ] **Step 1: Read current build-content.sh**

Check current content of the relevant lines first:

```bash
sed -n '1,20p' scripts/build-content.sh
```

Expected: see existing `PANDOC_COMMON` variable and filter discovery loop.

- [ ] **Step 2: Update `PANDOC_COMMON` in `scripts/build-content.sh`**

Using the Edit tool:

```
old_string:
PANDOC_COMMON="--standalone --metadata-file site.yaml --template templates/base.html --section-divs --mathjax --citeproc --csl assets/bibliography/apa.csl"
FILTER_FLAGS=""
for f in filters/*.lua; do
  [ -f "$f" ] && FILTER_FLAGS="$FILTER_FLAGS --lua-filter $f"
done

new_string:
PANDOC_COMMON="--standalone \
  --metadata-file site.yaml \
  --template assets/vendor/pandoc-markdown-css-theme/template.html5 \
  --include-before-body templates/navbar.html \
  --css /assets/vendor/pandoc-markdown-css-theme/theme.css \
  --section-divs --mathjax --citeproc \
  --csl assets/bibliography/apa.csl"
FILTER_FLAGS=""
for f in filters/*.lua; do
  [ -f "$f" ] && FILTER_FLAGS="$FILTER_FLAGS --lua-filter $f"
done
FILTER_FLAGS="$FILTER_FLAGS --lua-filter assets/vendor/pandoc-markdown-css-theme/pandoc-sidenote.lua"
```

- [ ] **Step 3: Update the three `-nt` template-staleness checks**

`scripts/build-content.sh` has three places that use `[ templates/base.html -nt "$dest" ]` to rebuild when the template changes. These must be updated to reference the vendored template, otherwise template edits won't trigger rebuilds. Also add `templates/navbar.html` to the staleness check since it's now part of the build input.

Lines 39, 65, 81 (line numbers relative to current file). Using the Edit tool with `replace_all: true`:

```
old_string:
|| [ templates/base.html -nt "$dest" ]

new_string:
|| [ assets/vendor/pandoc-markdown-css-theme/template.html5 -nt "$dest" ] || [ templates/navbar.html -nt "$dest" ]
```

- [ ] **Step 4: Verify the script change**

```bash
grep -c 'pandoc-markdown-css-theme/template.html5' scripts/build-content.sh
grep -c 'include-before-body templates/navbar.html' scripts/build-content.sh
grep -c 'pandoc-markdown-css-theme/pandoc-sidenote.lua' scripts/build-content.sh
grep -c 'templates/base.html' scripts/build-content.sh
grep -c 'templates/navbar.html -nt' scripts/build-content.sh
```

Expected: `4` (once in PANDOC_COMMON + three times in `-nt` checks), `1`, `1`, `0`, `3` — new paths present, old template reference fully gone, navbar is part of staleness check in all three loops.

- [ ] **Step 5: Update `STATIC_DIRS` in `Makefile`**

Using the Edit tool:

```
old_string:
STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography \
               assets/CV assets/frozen assets/pdfs assets/rejection-sampling-expo \
               assets/simplest_linear_regression_example assets/smc-resampling \
               assets/transform-pdf assets/2022-01-25-MCQLL-talk

new_string:
STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography \
               assets/CV assets/frozen assets/pdfs assets/rejection-sampling-expo \
               assets/simplest_linear_regression_example assets/smc-resampling \
               assets/transform-pdf assets/2022-01-25-MCQLL-talk \
               assets/vendor
```

- [ ] **Step 6: Verify the Makefile change**

```bash
grep -c 'assets/vendor' Makefile
```

Expected: at least `1`.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-content.sh Makefile
git commit -m "Build pipeline: point at vendored jez theme, ship vendor dir"
```

---

## Task 5: Fix `smc-resampling.md` front-matter `css:` path

**Files:**
- Modify: `content/posts/2026-04-08-smc-resampling.md` (front-matter block at top)

- [ ] **Step 1: Locate the current `css:` block**

```bash
grep -n -A1 '^css:' content/posts/2026-04-08-smc-resampling.md
```

Expected:
```
8:css:
9-  - smc-resampling.css
```

- [ ] **Step 2: Apply the edit**

Using the Edit tool:

```
old_string:
css:
  - smc-resampling.css

new_string:
css:
  - /assets/css/smc-resampling.css
```

- [ ] **Step 3: Verify**

```bash
grep -A1 '^css:' content/posts/2026-04-08-smc-resampling.md
```

Expected:
```
css:
  - /assets/css/smc-resampling.css
```

- [ ] **Step 4: Commit**

```bash
git add content/posts/2026-04-08-smc-resampling.md
git commit -m "smc-resampling: absolute css path (Jez template doesn't prefix /assets/css/)"
```

---

## Task 6: Delete old theming files

Deleting the old CSS and template has no behavioral effect (they're no longer referenced after Task 4) but cleans up the tree. Deleting the old filters is load-bearing — their presence in `filters/*.lua` would make the build-content.sh discovery loop pick them up and fight with Jez's filter.

**Files:**
- Delete: `templates/base.html`
- Delete: `assets/css/base.css`
- Delete: `assets/css/post.css`
- Delete: `assets/css/site.css`
- Delete: `filters/sidenotes.lua`
- Delete: `filters/block-marginnotes.lua`

- [ ] **Step 1: Move the six files to trash**

Use `trash` (not `rm -rf` — blocked by command-validator hook). Needs `dangerouslyDisableSandbox: true` for `~/.Trash` write access.

```bash
trash templates/base.html \
      assets/css/base.css \
      assets/css/post.css \
      assets/css/site.css \
      filters/sidenotes.lua \
      filters/block-marginnotes.lua
```

- [ ] **Step 2: Verify the deletions**

```bash
ls templates/ assets/css/ filters/
```

Expected:
- `templates/` contains only `navbar.html`
- `assets/css/` contains only `smc-resampling.css`
- `filters/` contains only `callouts.lua`, `mathjax-macros.lua`, `viz-mount.lua`

- [ ] **Step 3: Verify no dangling references in the repo**

```bash
grep -rn 'templates/base.html' --include='*.sh' --include='*.lua' --include='Makefile' --include='*.md' . 2>/dev/null | grep -v '^./docs/superpowers/' | grep -v '^./_site/' | grep -v '^./node_modules/'
grep -rn 'filters/sidenotes.lua' --include='*.sh' --include='*.lua' --include='Makefile' --include='*.md' . 2>/dev/null | grep -v '^./docs/superpowers/' | grep -v '^./_site/' | grep -v '^./node_modules/'
```

Expected: both empty (references in `docs/superpowers/` are expected — those are the spec/plan themselves — and excluded).

- [ ] **Step 4: Commit**

```bash
git add -A templates/ assets/css/ filters/
git commit -m "Remove old theming: base.html, base/post/site.css, sidenote filters"
```

---

## Task 7: Programmatic build verification

This is the automated checkpoint before handing off to manual visual preview. It confirms the build succeeds and emits the expected markup — but does not evaluate visual correctness.

**Files:**
- No file changes in this task.

- [ ] **Step 1: Clean and rebuild**

```bash
make clean && make -j4
```

Expected: build completes without errors. Look for warnings but they're not fatal.

- [ ] **Step 2: Verify the vendored theme is in `_site/`**

```bash
ls -la _site/assets/vendor/pandoc-markdown-css-theme/
```

Expected: `template.html5`, `theme.css`, `pandoc-sidenote.lua`, `VENDORED.md` all present (the template/lua files getting rsynced is harmless noise — they're not linked; only `theme.css` matters).

- [ ] **Step 3: Pick a simple post and grep its rendered HTML**

```bash
POST=_site/posts/noisy-channel-coding/index.html
test -f "$POST" || { echo "post not built: $POST"; exit 1; }

grep -c 'site-header' "$POST"                                                        # navbar present
grep -c '/assets/vendor/pandoc-markdown-css-theme/theme.css' "$POST"                 # theme CSS linked
grep -c 'MathJax-script' "$POST"                                                     # MathJax config present
grep -c 'sidenote-wrapper' "$POST"                                                   # Jez's sidenote markup emitted
grep -c 'templates/base.html\|/assets/css/base.css\|/assets/css/post.css' "$POST"    # no old refs
```

Expected: `1+`, `1`, `1`, `1+`, `0`.

- [ ] **Step 4: Verify smc-resampling page has its per-page CSS resolved**

```bash
POST=_site/posts/smc-resampling/index.html
grep -c '/assets/css/smc-resampling.css' "$POST"
```

Expected: `1`.

- [ ] **Step 5: Verify homepage builds**

```bash
test -f _site/index.html && grep -c 'theme.css' _site/index.html
```

Expected: file exists, `1+` matches.

- [ ] **Step 6: No commit**

Build artifacts aren't tracked.

---

## Task 8: Manual visual preview (handoff)

This task cannot be automated — it's the core verification the whole branch exists for. It hands off to the user or whoever is implementing: start the dev server, open the browser, form opinions.

**Files:**
- No file changes.

- [ ] **Step 1: Start the dev server**

```bash
make serve
```

Expected: server starts on `http://localhost:4000` with file watchers running.

- [ ] **Step 2: Open these five pages and record visual impressions**

The spec lists what to expect on each — capture deviations for the v2 follow-up list, not for fixing now.

1. `http://localhost:4000/posts/noisy-channel-coding/` — inline-footnote post; sidenotes should render in the right margin using Jez's theme
2. `http://localhost:4000/posts/surprisal-and-KL/` — math-heavy post; confirm MathJax v4 renders inline + display math with macros expanded
3. `http://localhost:4000/posts/smc-resampling/` — the litmus-test post; expect partial breakage (fenced marginnotes as plain divs, some `--s-*` vars falling through to defaults); document specifics for follow-up #1
4. `http://localhost:4000/` — homepage; expect stripped appearance (no custom site typography, visible "home" h1, pubs list as generic markdown)
5. `http://localhost:4000/posts/` — posts listing; expect generic list

- [ ] **Step 3: Check browser console on each page**

Open dev tools → Console tab. Record any:
- 404s (missing assets, broken paths)
- JS errors
- MathJax errors

- [ ] **Step 4: Spot-check navbar**

From any post page, click `home` → land on `/`. Click `blog` → land on `/posts/`. Both should work even without CSS (the nav is just links).

- [ ] **Step 5: Decide next step**

Open the spec's "Out of scope" priority list. The follow-up queue is already ordered by priority:
1. smc-resampling reconciliation (highest)
2. Homepage styling
3. Posts listing styling
4. Navbar styling
5. Collapsible sections
6. `no-sidenotes` mode
7. KaTeX/MathJax decision

If the raw preview reveals Jez's theme is a keeper: proceed to follow-up #1. If the preview reveals the theme isn't a good fit: abandon the branch without merging and revisit assumptions.

- [ ] **Step 6: No commit**

No file changes in this task.

---

## Definition of done (v1)

- [ ] Branch `jez-theme-swap` exists with commits from Tasks 1–6
- [ ] `make clean && make -j4` completes without error
- [ ] All programmatic checks in Task 7 pass
- [ ] A human has previewed the five pages in Task 8 and recorded impressions
- [ ] Branch is NOT merged to `source`/`static` yet — merge is a separate decision gated on follow-ups

## Accepted known regressions in v1 (do not fix here)

These are called out in the spec. Don't be tempted to "just fix" them mid-plan — each is follow-up work:

- Navbar unstyled
- Homepage looks stripped; "home" renders as visible h1
- Posts listing looks generic
- Collapsible sections don't collapse
- Active-nav highlighting disabled
- `no-sidenotes` mode gone
- `::: {.marginnote}` in smc-resampling renders as plain divs
- `smc-resampling.css` `--s-*` variables partially undefined
