# Rejection-Sampling Native Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the iframe-embedded Quarto HTML in the 2022 rejection-sampling post with a native site post, driven by a `.qmd` that is the single editable source of truth for both prose and figures.

**Architecture:** Quarto is used purely as a Julia execution engine, never as a renderer. The `.qmd` is written in site-flavoured markdown that Quarto does not recognise and passes through verbatim; Julia cells write SVGs to disk with explicit `savefig`; the existing pandoc pipeline does citations, cross-references, callouts, and templating. Generated `.md` and SVGs are committed so an ordinary `make` never needs Julia.

**Tech Stack:** Quarto 1.8.26, Julia 1.10.11 (juliaup lts) + IJulia kernel `julia-1.10`, Plots.jl/GR, pandoc 3.9.0.2 with pandoc-crossref + citeproc, Lua filters, Node 20+ for `node --test`, GNU make.

**Spec:** `docs/superpowers/specs/2026-08-12-rejection-sampling-native-port-design.md`

## Global Constraints

- The default `make` build MUST NOT invoke Quarto or Julia. The `notebooks` target is on-demand only and is NOT wired into `all`.
- Generated artifacts (`content/posts/2022-08-29-rejection-sampling.md`, `assets/rejection-sampling/*.svg`) ARE committed to git.
- Phase 1 only: the new post carries `unlisted: true`. `content/posts/2022-08-29-rejection-sampling-expo.md` and `assets/rejection-sampling-expo/**` MUST NOT be modified. No redirect stub in this plan.
- Cross-reference labels use pandoc-crossref syntax `#fig:name` / `@fig:name`, never Quarto's `fig-name`.
- Callouts in `.qmd` sources use the Quarto-safe aliases `.note-callout` / `.warning-callout` / `.tip-callout` / `.important-callout`. The existing `.callout-*` names keep working unchanged for hand-written `.md` posts.
- Figures ship byte-for-byte as Plots.jl produced them. No SVG post-processing. Theming is CSS-only ("figure card": white panel, padding, border, rounded corners, identical in light and dark).
- Julia `savefig` paths are relative to `content/posts/` (Quarto's working directory), i.e. `../../assets/rejection-sampling/…`.
- Do not add `Co-Authored-By` lines to commits.

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `content/posts/2022-08-29-rejection-sampling.qmd` | create | Source of truth: prose + Julia cells |
| `content/posts/2022-08-29-rejection-sampling.md` | generated, committed | Pandoc input produced from the qmd |
| `assets/rejection-sampling/fig-*.svg` | generated, committed | The 9 figures |
| `assets/rejection-sampling/references.bib` | create | Per-page bib, 5 keys |
| `assets/css/rejection-sampling.css` | create | Figure cards + folded-code styling |
| `scripts/qmd-frontmatter.js` | create | Swap Quarto's rewritten YAML for the qmd's verbatim YAML |
| `test/qmd-frontmatter.test.js` | create | Unit tests for the above |
| `test/callouts.test.js` | create | Filter tests via pandoc round-trip |
| `filters/callouts.lua` | modify | Add aliases + `collapse` support |
| `Makefile` | modify | `notebooks` target; `assets/rejection-sampling` in `STATIC_DIRS`; `_build` handling |
| `.gitignore` | modify | Ignore `_build/` |
| `docs/authoring.md` | modify | Document the qmd-backed post workflow |

---

### Task 1: Callout aliases and collapsible callouts

`filters/callouts.lua` currently maps four `.callout-*` classes to a static header + body div. It ignores any `collapse` attribute. Quarto rewrites any div whose class it recognises (including `callout-note`) into a blockquote, so `.qmd` sources need alias class names Quarto ignores, and the three collapsible asides in the source notebook need real `<details>` behaviour.

**Files:**
- Modify: `filters/callouts.lua`
- Test: `test/callouts.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: markdown authors may write `::: {.note-callout}`, `::: {.warning-callout}`, `::: {.tip-callout}`, `::: {.important-callout}`, each optionally with `collapse="true"` (starts closed) or `collapse="false"` (collapsible, starts open), and optionally `title="…"`. Emitted HTML for a collapsible callout is `<div class="callout note-callout"><details class="callout-details"[ open]><summary>TITLE</summary><div class="callout-body">…</div></details></div>`. Non-collapsible output is unchanged from today: `<div class="callout …"><div class="callout-header">TITLE</div><div class="callout-body">…</div></div>`.

- [ ] **Step 1: Write the failing test**

Create `test/callouts.test.js`:

```javascript
// test/callouts.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const FILTER = resolve(import.meta.dirname, '../filters/callouts.lua');

function render(markdown) {
  return execFileSync(
    'pandoc',
    ['--from', 'markdown', '--to', 'html', '--lua-filter', FILTER],
    { input: markdown, encoding: 'utf8' }
  );
}

test('existing .callout-note syntax still renders a header and body', () => {
  const html = render('::: {.callout-note}\nBody text.\n:::\n');
  assert.match(html, /class="callout callout-note"/);
  assert.match(html, /class="callout-header"/);
  assert.match(html, /Note/);
  assert.match(html, /Body text\./);
  assert.doesNotMatch(html, /<details/);
});

test('the .note-callout alias renders like callout-note', () => {
  const html = render('::: {.note-callout}\nAlias body.\n:::\n');
  assert.match(html, /class="callout note-callout"/);
  assert.match(html, /class="callout-header"/);
  assert.match(html, /Note/);
  assert.match(html, /Alias body\./);
});

test('.warning-callout, .tip-callout and .important-callout aliases map to their labels', () => {
  assert.match(render('::: {.warning-callout}\nx\n:::\n'), /Warning/);
  assert.match(render('::: {.tip-callout}\nx\n:::\n'), /Tip/);
  assert.match(render('::: {.important-callout}\nx\n:::\n'), /Important/);
});

test('collapse="true" produces a closed <details> with the title as summary', () => {
  const html = render('::: {.note-callout collapse="true"}\nHidden body.\n:::\n');
  assert.match(html, /<details class="callout-details">/);
  assert.match(html, /<summary>Note<\/summary>/);
  assert.match(html, /Hidden body\./);
  assert.doesNotMatch(html, /<details class="callout-details" open>/);
});

test('collapse="false" produces an open <details>', () => {
  const html = render('::: {.note-callout collapse="false"}\nShown body.\n:::\n');
  assert.match(html, /<details class="callout-details" open>/);
});

test('title attribute overrides the default label and does not leak as an attribute', () => {
  const html = render('::: {.note-callout title="Custom heading" collapse="true"}\nx\n:::\n');
  assert.match(html, /<summary>Custom heading<\/summary>/);
  assert.doesNotMatch(html, /title="Custom heading"/);
});

test('collapse attribute does not leak into the emitted div', () => {
  const html = render('::: {.note-callout collapse="true"}\nx\n:::\n');
  assert.doesNotMatch(html, /collapse="true"/);
});

test('a div with no callout class is left alone', () => {
  const html = render('::: {.something-else}\nx\n:::\n');
  assert.doesNotMatch(html, /class="callout/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/callouts.test.js`
Expected: FAIL — the alias, collapse, and title-leak tests fail because `callouts.lua` knows only `callout-*` and ignores `collapse`.

- [ ] **Step 3: Rewrite the filter**

Replace the whole of `filters/callouts.lua` with:

```lua
--- callouts.lua — Convert fenced divs with callout classes to styled HTML.
---
--- Input:
---   ::: {.callout-note}
---   Some text.
---   :::
---
---   ::: {.note-callout collapse="true"}
---   Collapsed by default; click to open.
---   :::
---
--- Supported types: callout-note, callout-warning, callout-tip,
--- callout-important, plus the bare aliases note-callout, warning-callout, tip-callout, important-callout.
---
--- The bare aliases exist for .qmd-backed posts. Quarto rewrites any div whose
--- class it recognises (callout-note and friends) into a blockquote before we
--- ever see it, but it passes divs with unknown classes through verbatim — so
--- qmd sources use `.note-callout` where hand-written .md posts use `.callout-note`.
---
--- Attributes:
---   title="…"        overrides the default header text
---   collapse="true"  render as a <details> that starts closed
---   collapse="false" render as a <details> that starts open

local callout_types = {
  ["callout-note"]      = "Note",
  ["callout-warning"]   = "Warning",
  ["callout-tip"]       = "Tip",
  ["callout-important"] = "Important",
  ["note-callout"]      = "Note",
  ["warning-callout"]   = "Warning",
  ["tip-callout"]       = "Tip",
  ["important-callout"] = "Important",
}

-- Deterministic order so a div carrying several callout classes always
-- resolves the same way (pairs() over a Lua table has no defined order).
local lookup_order = {
  "callout-note", "callout-warning", "callout-tip", "callout-important",
  "note-callout", "warning-callout", "tip-callout", "important-callout",
}

local function escape_html(s)
  return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

function Div(el)
  for _, cls in ipairs(lookup_order) do
    if el.classes:includes(cls) then
      local label = callout_types[cls]
      local title = el.attributes["title"] or label
      local collapse = el.attributes["collapse"]

      -- Strip attributes we consume so they don't leak into the output div.
      local attrs = {}
      for k, v in pairs(el.attributes) do
        if k ~= "title" and k ~= "collapse" then
          attrs[k] = v
        end
      end

      local body = pandoc.Div(el.content, pandoc.Attr("", {"callout-body"}))
      local outer_attr = pandoc.Attr(el.identifier, {"callout", cls}, attrs)

      if collapse ~= nil then
        local open = (collapse == "false") and " open" or ""
        return pandoc.Div({
          pandoc.RawBlock("html",
            '<details class="callout-details"' .. open .. '><summary>'
            .. escape_html(title) .. '</summary>'),
          body,
          pandoc.RawBlock("html", "</details>"),
        }, outer_attr)
      end

      local header = pandoc.Div(
        pandoc.Plain(pandoc.Str(title)),
        pandoc.Attr("", {"callout-header"})
      )
      return pandoc.Div({header, body}, outer_attr)
    end
  end
end
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/callouts.test.js`
Expected: PASS, 8/8.

- [ ] **Step 5: Verify no existing page regressed**

Run: `make clean && make && node --test`
Expected: build succeeds; full test suite passes. Then confirm an existing callout user still renders:
Run: `grep -rl 'callout' _site/posts/ | head -3`
Expected: at least one file; spot-check that it contains `class="callout-header"`.

- [ ] **Step 6: Commit**

```bash
git add filters/callouts.lua test/callouts.test.js
git commit -m "callouts: add bare aliases and collapsible <details> support"
```

---

### Task 2: Per-page bibliography

The post cites five works. The site resolves citations per page from a `bibliography:` path in front matter, following the pattern of `assets/smc-resampling/references.bib`.

**Files:**
- Create: `assets/rejection-sampling/references.bib`

**Interfaces:**
- Consumes: nothing.
- Produces: `assets/rejection-sampling/references.bib` containing exactly the keys `bishop.c:2006book`, `chopin.n:2020book`, `freer.c:2010`, `mackay.d:2003book`, `neal.r:2003`, referenced later by the qmd front matter.

- [ ] **Step 1: Create the directory and extract the entries**

All five keys were verified present in `source.bib` (a symlink to `~/all-biblatex.bib`). Extract them:

```bash
mkdir -p assets/rejection-sampling
python3 - <<'PY'
import re
src = open('source.bib', encoding='utf-8').read()
keys = ['bishop.c:2006book', 'chopin.n:2020book', 'freer.c:2010',
        'mackay.d:2003book', 'neal.r:2003']
out = []
for k in keys:
    # Match from @type{key, to the balanced closing brace.
    m = re.search(r'@\w+\{' + re.escape(k) + r',', src)
    if not m:
        raise SystemExit(f'MISSING KEY: {k}')
    i = src.index('{', m.start())
    depth, j = 0, i
    while j < len(src):
        if src[j] == '{': depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0: break
        j += 1
    out.append(src[m.start():j+1])

# Drop Zotero-local metadata. `file` holds absolute paths into the user's
# Zotero library and `project` is a personal organisational tag; this .bib is
# rsynced into _site/ and published, so neither belongs in it. The existing
# assets/smc-resampling/references.bib carries no `file` fields either.
#
# Brace-aware rather than line-based: a line regex silently corrupts an entry
# whose field value spans lines (it deletes the first line and leaves the rest
# orphaned), and would miss an unindented field. The word boundary keeps
# `filename`/`projecttitle` from matching.
def drop_fields(entry, names):
    pattern = re.compile(r'\n[ \t]*(?:' + '|'.join(names) + r')[ \t]*=[ \t]*', re.I)
    while True:
        m = pattern.search(entry)
        if not m:
            # Removing the last field leaves the previous one's comma dangling
            # before the closing brace. Legal BibTeX, but untidy.
            return re.sub(r',(\s*)\}\s*$', r'\1}', entry)
        i = m.end()
        if i < len(entry) and entry[i] == '{':      # brace-delimited value
            depth = 0
            while i < len(entry):
                if entry[i] == '{':
                    depth += 1
                elif entry[i] == '}':
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
                i += 1
        else:                                        # bare value
            while i < len(entry) and entry[i] not in ',\n':
                i += 1
        if i < len(entry) and entry[i] == ',':
            i += 1
        entry = entry[:m.start()] + entry[i:]

out = [drop_fields(e, ['file', 'project']) for e in out]

open('assets/rejection-sampling/references.bib', 'w', encoding='utf-8').write(
    '\n\n'.join(out) + '\n')
print(f'wrote {len(out)} entries')
PY
```

Expected: `wrote 5 entries`, and no `MISSING KEY` failure.

- [ ] **Step 2: Verify each key resolves through citeproc**

```bash
printf -- '---\nbibliography: assets/rejection-sampling/references.bib\n---\n\n[@bishop.c:2006book] [@chopin.n:2020book] [@freer.c:2010] [@mackay.d:2003book] [@neal.r:2003]\n' \
  | pandoc --citeproc --csl assets/bibliography/apa.csl --to plain
```

Expected: five rendered citations and a reference list. **No `[?]` markers** — a `[?]` means the key failed to resolve and the entry extraction is wrong.

- [ ] **Step 3: Commit**

```bash
git add assets/rejection-sampling/references.bib
git commit -m "rejection-sampling: per-page bibliography"
```

---

### Task 3: Front-matter swap script

Quarto rewrites front matter on render. Probed behaviour: `title`, `date`, `author`, `tags`, `unlisted`, `link-citations`, `reference-section-title` survive; `css:`, `toc:`, and `bibliography:` are consumed as format options and vanish; a duplicate `authors:` key and a stray `toc-title:` are added. Since `scripts/build-content.sh` greps the generated `.md` for `^toc: *true` and `filters/asset-paths.lua` resolves `css:` from front matter, those losses would silently break the page. This script restores the qmd's YAML verbatim.

**Files:**
- Create: `scripts/qmd-frontmatter.js`
- Test: `test/qmd-frontmatter.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: an ES module exporting `swapFrontMatter(generatedMd: string, qmdSource: string) => string`. Also runnable as a CLI: `node scripts/qmd-frontmatter.js <generated.md> <source.qmd>` writes the result to stdout. Throws `Error` if the qmd has no YAML block.

- [ ] **Step 1: Write the failing test**

Create `test/qmd-frontmatter.test.js`:

```javascript
// test/qmd-frontmatter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { swapFrontMatter } from '../scripts/qmd-frontmatter.js';

const QMD = `---
title: Rejection sampling
date: 2022-08-29
tags: [note]
unlisted: true
toc: true
css:
  - assets/css/rejection-sampling.css
bibliography: assets/rejection-sampling/references.bib
---

Prose that should be ignored.
`;

const GENERATED = `---
author:
- Jacob Hoover Vigly
authors:
- Jacob Hoover Vigly
date: 2022-08-29
tags:
- note
title: Rejection sampling
toc-title: Table of contents
unlisted: true
---

Real body.
`;

test('restores keys Quarto ate', () => {
  const out = swapFrontMatter(GENERATED, QMD);
  assert.match(out, /^toc: true$/m);
  assert.match(out, /assets\/css\/rejection-sampling\.css/);
  assert.match(out, /^bibliography: assets\/rejection-sampling\/references\.bib$/m);
});

test('drops the noise Quarto added', () => {
  const out = swapFrontMatter(GENERATED, QMD);
  assert.doesNotMatch(out, /^authors:$/m);
  assert.doesNotMatch(out, /toc-title:/);
});

test('keeps the generated body, not the qmd body', () => {
  const out = swapFrontMatter(GENERATED, QMD);
  assert.match(out, /Real body\./);
  assert.doesNotMatch(out, /Prose that should be ignored\./);
});

test('marks the file as generated using a YAML comment', () => {
  const out = swapFrontMatter(GENERATED, QMD);
  // A YAML comment never reaches the rendered HTML.
  assert.match(out, /^# GENERATED FILE/m);
  const firstDelim = out.indexOf('---');
  const secondDelim = out.indexOf('\n---', firstDelim + 3);
  assert.ok(out.indexOf('# GENERATED FILE') < secondDelim,
    'marker must sit inside the YAML block');
});

test('output starts with a YAML block so pandoc parses it', () => {
  assert.ok(swapFrontMatter(GENERATED, QMD).startsWith('---\n'));
});

test('handles a generated file that has no front matter at all', () => {
  const out = swapFrontMatter('Just a body.\n', QMD);
  assert.match(out, /^---\n/);
  assert.match(out, /Just a body\./);
});

test('throws when the qmd has no front matter', () => {
  assert.throws(() => swapFrontMatter(GENERATED, 'no yaml here\n'),
    /no YAML front matter/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/qmd-frontmatter.test.js`
Expected: FAIL — `Cannot find module '../scripts/qmd-frontmatter.js'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/qmd-frontmatter.js`:

```javascript
#!/usr/bin/env node
// scripts/qmd-frontmatter.js
//
// Quarto rewrites front matter when it renders: it consumes `css:`, `toc:` and
// `bibliography:` as format options (so they vanish from the emitted YAML) and
// adds a duplicate `authors:` plus a stray `toc-title:`. The site build reads
// `toc:` and `css:` straight out of the generated markdown, so we put the
// source .qmd's YAML back verbatim and keep only Quarto's body.
//
// Usage: node scripts/qmd-frontmatter.js <generated.md> <source.qmd>  > out.md

import { readFileSync } from 'node:fs';

const DELIM = /^---\r?\n/;

/** Return the YAML block's inner text, or null when there is no block. */
function extractFrontMatter(text) {
  if (!DELIM.test(text)) return null;
  const rest = text.slice(text.indexOf('\n') + 1);
  const end = rest.search(/^---\r?$/m);
  if (end === -1) return null;
  return rest.slice(0, end).replace(/\s+$/, '');
}

/** Return the document body with any leading YAML block removed. */
function stripFrontMatter(text) {
  if (!DELIM.test(text)) return text;
  const rest = text.slice(text.indexOf('\n') + 1);
  const end = rest.search(/^---\r?$/m);
  if (end === -1) return text;
  const afterDelim = rest.indexOf('\n', end);
  return afterDelim === -1 ? '' : rest.slice(afterDelim + 1).replace(/^\s+/, '');
}

export function swapFrontMatter(generatedMd, qmdSource) {
  const yaml = extractFrontMatter(qmdSource);
  if (yaml === null) {
    throw new Error('source .qmd has no YAML front matter');
  }
  const marker = [
    '# GENERATED FILE — DO NOT EDIT.',
    '# Source of truth is the sibling .qmd; regenerate with `make notebooks`.',
  ].join('\n');
  return `---\n${marker}\n${yaml}\n---\n\n${stripFrontMatter(generatedMd)}`;
}

// CLI entry point: only runs when invoked directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [, , generatedPath, qmdPath] = process.argv;
  if (!generatedPath || !qmdPath) {
    console.error('usage: qmd-frontmatter.js <generated.md> <source.qmd>');
    process.exit(1);
  }
  process.stdout.write(
    swapFrontMatter(
      readFileSync(generatedPath, 'utf8'),
      readFileSync(qmdPath, 'utf8')
    )
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/qmd-frontmatter.test.js`
Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add scripts/qmd-frontmatter.js test/qmd-frontmatter.test.js
git commit -m "scripts: restore qmd front matter after quarto render"
```

---

### Task 4: Makefile `notebooks` target

**Files:**
- Modify: `Makefile`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `scripts/qmd-frontmatter.js` from Task 3.
- Produces: `make notebooks`, which regenerates `content/posts/2022-08-29-rejection-sampling.md` from the sibling `.qmd` only when the `.qmd` is newer. Not a prerequisite of `all`.

- [ ] **Step 1: Add `_build/` to .gitignore**

Append to `.gitignore`:

```
_build/
```

- [ ] **Step 2: Add `assets/rejection-sampling` to STATIC_DIRS**

In `Makefile`, edit the `STATIC_DIRS` assignment to include the new directory. The existing block reads:

```make
STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography \
               assets/CV assets/frozen assets/pdfs assets/rejection-sampling-expo \
               assets/simplest_linear_regression_example assets/smc-resampling \
               assets/transform-pdf assets/2022-01-25-MCQLL-talk \
               assets/vendor
```

Change the third line so it becomes:

```make
               assets/rejection-sampling assets/simplest_linear_regression_example \
               assets/smc-resampling \
```

- [ ] **Step 3: Add the notebooks target**

Add near the content-compilation section of the `Makefile`, after the `content:` rule:

```make
# ---- Notebook-backed posts (on demand; NOT part of `all`) ----
# Quarto is used purely as a Julia execution engine here: it runs the code
# cells, the cells write their SVGs to assets/ via savefig, and the prose is
# passed through verbatim for the normal pandoc build to compile. Requires
# Quarto + the julia-1.10 Jupyter kernel; a plain `make` never invokes it.
NB_QMD := content/posts/2022-08-29-rejection-sampling.qmd
NB_MD  := content/posts/2022-08-29-rejection-sampling.md
# Quarto names its default output after the input file's basename, and puts it
# where --output-dir says. --output-dir resolves relative to the INPUT FILE's
# directory (verified against Quarto 1.8.26), so ../../_build from
# content/posts/ lands at the repo-root _build/.
#
# Do NOT add `-o <name>` to rename the output. Combining -o with --output-dir
# is broken in 1.8.26 when quarto is invoked from the repo root, as make does:
# it resolves to ../../../<name> — three levels up — and writes OUTSIDE the
# repository. Verified by reproduction. Consume the default-named file instead.
# We consume Quarto's PRE-pandoc intermediate (`keep-md: true` in the .qmd),
# not its final output. Quarto's pandoc pass rewrites prose it was supposed to
# pass through: it turns `/assets/x.svg` into `./assets/x.svg` (breaking every
# figure URL), injects its own `# References` heading that the site's citeproc
# then duplicates, and drops a fenced div. The intermediate has the Julia
# executed and the prose byte-identical. Verified by comparing both artifacts.
#
# --resource-path=../.. is needed only so Quarto's own (discarded) pandoc pass
# exits 0: Quarto resolves `bibliography:` relative to the .qmd's directory,
# while the site build needs it repo-root-relative.
NB_KEEP := $(NB_QMD:.qmd=.markdown.md)
NB_RAW  := _build/$(notdir $(NB_KEEP))

notebooks: $(NB_MD)

$(NB_MD): $(NB_QMD) scripts/qmd-frontmatter.js
	@mkdir -p _build assets/rejection-sampling
	@echo "Render (quarto + julia): $<"
	@quarto render $< --to markdown --execute --output-dir ../../_build --resource-path=../..
	@mv $(NB_KEEP) $(NB_RAW)
	@node scripts/qmd-frontmatter.js $(NB_RAW) $(NB_QMD) > $@
	@echo "Generated: $@"
```

Also add `notebooks` to the `.PHONY` line, which currently reads:

```make
.PHONY: all clean content js assets static-html serve test generate pubs homepage posts-index deploy
```

Append ` notebooks` to the end of that list.

- [ ] **Step 4: Verify the target is not reachable from `all`**

Run: `make -n all | grep -c quarto`
Expected: `0`. If nonzero, `notebooks` has been wired into `all` — remove that dependency.

- [ ] **Step 5: Commit**

```bash
git add Makefile .gitignore
git commit -m "make: on-demand notebooks target for qmd-backed posts"
```

---

### Task 5: Author the .qmd

This is the port itself. Start from a Quarto-converted copy of the notebook, then apply the transformations below.

**Files:**
- Create: `content/posts/2022-08-29-rejection-sampling.qmd`

**Interfaces:**
- Consumes: `assets/rejection-sampling/references.bib` (Task 2); the `.note` alias and `collapse` attribute (Task 1); `assets/css/rejection-sampling.css` (Task 7, referenced by path before it exists — that is fine, `asset-paths.lua` only rewrites the string).
- Produces: the source of truth consumed by `make notebooks` (Task 4) and rendered in Task 6.

- [ ] **Step 1: Convert the notebook to a qmd starting point**

```bash
mkdir -p _build
cp /Users/v/GitLab/diss/notebook/notebooks/rejection-sampling-expo.ipynb _build/
cd _build && quarto convert rejection-sampling-expo.ipynb && cd ..
cp _build/rejection-sampling-expo.qmd content/posts/2022-08-29-rejection-sampling.qmd
```

Expected: a ~499-line, ~21KB qmd.

- [ ] **Step 2: Replace the front matter**

Replace the qmd's existing YAML block (the converted `title`/`subtitle`/`author`/`date`/`format` block) with exactly:

```yaml
---
title: Rejection sampling
date: 2022-08-29
author: Jacob Louis Hoover
tags: [note]
unlisted: true
toc: true
link-citations: true
reference-section-title: References
bibliography: assets/rejection-sampling/references.bib
css:
  - assets/css/rejection-sampling.css
jupyter: julia-1.10
keep-md: true
---
```

`jupyter:` names the kernel explicitly rather than leaving Quarto to infer it
from the code fences. `keep-md: true` makes Quarto retain its pre-pandoc
intermediate, which is the artifact the build actually consumes — see the
`notebooks` rule in Task 4 for why.

Notes: `author` keeps the original 2022 byline. `unlisted: true` is Phase 1 and keeps the post out of the blog listing while giving it a shareable URL. The `format:` block from the notebook is dropped entirely — Quarto's HTML options are irrelevant now.

- [ ] **Step 3: Add the opening paragraph**

Immediately after the front matter, insert the lede from the current post so the native version keeps it:

```markdown
_Rejection sampling_ refers to a particular algorithm involving drawing samples from one distribution in order to estimate some other distribution, by rejecting or accepting the samples obtained in a smart way. In this note I'm exploring this algorithm a little with some simulations, and also showing how a different, similar, algorithm can be seen as a special case of the general version (because it wasn't at all obvious to me at first how they were related).
```

- [ ] **Step 4: (removed)**

An earlier revision added `mkpath("../../assets/rejection-sampling")` to the
setup cell. It is redundant — the `notebooks` rule already runs
`mkdir -p assets/rejection-sampling` before invoking Quarto — so the Julia
stays as the 2022 original wrote it.

- [ ] **Step 5: Convert the nine figure-producing cells**

For each cell below: delete any `#| label:` and `#| fig-cap:` directives, add `#| output: false`, bind the plot to `p`, and add a `savefig`. Then place the figure with a markdown image line immediately after the cell.

The nine figures, in document order:

| Cell begins with | SVG filename | crossref label |
|---|---|---|
| `plot_rejection_sampling_setup(target_density=πstar, …plot_accept_prob=true)` | `fig-setup.svg` | `#fig:rejection-sampling` |
| `plot_rejection_sampling_estimate(target_density=πstar, proposal_distribution=Q)` | `fig-simulation.svg` | `#fig:rejection-sampling-simulation` |
| `# Define a "bad" proposal distribution` | `fig-badproposal.svg` | `#fig:rejection-sampling-simulation-badproposal` |
| `# Make a target density that equals pdf(Q)` | `fig-special.svg` | `#fig:rejection-sampling-special` |
| `plot_rejection_sampling_estimate(target_density=special_πstar, …Z=Z)` | `fig-simulation-special.svg` | `#fig:rejection-sampling-simulation-special` |
| first `plot_rejection_sampling_estimate(` inside *sampling until success* | `fig-until-success-good.svg` | *(none)* |
| second, with `Q_bad` | `fig-until-success-bad.svg` | *(none)* |
| third, with `special_πstar` | `fig-until-success-special.svg` | *(none)* |
| `plot_slice_sampling_estimate(target_density=πstar)` | `fig-slice-sampling.svg` | `#fig:slice-sampling` |

The pattern, shown for the first figure:

````markdown
```{julia}
#| code-fold: true
#| output: false
p = plot_rejection_sampling_setup(target_density=πstar, proposal_distribution=Q, plot_accept_prob=true)
savefig(p, "../../assets/rejection-sampling/fig-setup.svg")
```

![A setup for rejection sampling. Samples are to be drawn from the proposal distribution, and accepted or rejected according to the ratio of the target density to the scaled proposal density.](/assets/rejection-sampling/fig-setup.svg){#fig:rejection-sampling}
````

Note the two different paths: `savefig` uses the repo-relative `../../assets/…` (Quarto's cwd is `content/posts/`), while the image line uses the served URL `/assets/…`. Carry each caption over verbatim from the cell's original `fig-cap`. The three unlabelled figures get an image line with a caption but no `{#fig:…}` attribute.

- [ ] **Step 6: Rewrite cross-reference uses**

Replace every `@fig-` with `@fig:` in prose and in captions. There are five uses, of two distinct labels: `fig-rejection-sampling` and `fig-rejection-sampling-special`. Two of them sit inside captions that are now markdown image alt-text, and still resolve there.

Run: `grep -c '@fig-' content/posts/2022-08-29-rejection-sampling.qmd`
Expected: `0`.

- [ ] **Step 7: Rewrite the callouts**

There are seven `.callout-note` divs. Change every `::: {.callout-note}` opener to `::: {.note-callout}`, and for the three that carry `collapse="true"`, keep the attribute: `::: {.note-callout collapse="true"}`. The three collapsible ones are titled *What about a different proposal?*, *What about sampling until success?*, and *Related algorithms*; each currently opens with a `### …` heading as its first line. Move that heading text into a `title` attribute and delete the heading, so the summary line carries it:

```markdown
::: {.note-callout collapse="true" title="What about a different proposal?"}
The proposal above …
:::
```

Run: `grep -c 'callout-note' content/posts/2022-08-29-rejection-sampling.qmd`
Expected: `0`.

- [ ] **Step 8: Convert the folded code cells**

Six cells carry `#| code-fold: true`. Quarto's `--to markdown` emits `<details class="code-fold">` for these, but only as an artifact of its HTML machinery; make it explicit instead. Remove the `#| code-fold: true` directive from each and wrap the fence by hand:

````markdown
<details class="code-fold">
<summary>Show/hide code</summary>

```{julia}
#| output: false
p = plot_rejection_sampling_setup(…)
savefig(p, "../../assets/rejection-sampling/fig-setup.svg")
```

</details>
````

The blank lines around the fence are required — without them pandoc treats the fence as raw HTML content and will not highlight it.

Run: `grep -c 'code-fold: true' content/posts/2022-08-29-rejection-sampling.qmd`
Expected: `0`.

- [ ] **Step 9: Drop the trailing References heading**

The converted qmd ends with `## References {.unnumbered}`. Delete it — `reference-section-title: References` in the front matter makes citeproc emit that heading itself, so leaving it produces two.

- [ ] **Step 10: Sanity-check the source before rendering**

```bash
grep -nE '@fig-|callout-note|code-fold: true|fig-cap|#\| label' content/posts/2022-08-29-rejection-sampling.qmd
```

Expected: no output. Any hit is a leftover Quarto idiom.

- [ ] **Step 11: Commit the source**

```bash
git add content/posts/2022-08-29-rejection-sampling.qmd
git commit -m "rejection-sampling: qmd source of truth ported from the notebook"
```

---

### Task 6: First generation run

**Files:**
- Create (generated): `content/posts/2022-08-29-rejection-sampling.md`
- Create (generated): `assets/rejection-sampling/fig-*.svg`

**Interfaces:**
- Consumes: Tasks 3, 4, 5.
- Produces: the committed generated artifacts every later build depends on.

- [ ] **Step 1: Confirm the Julia kernel is visible**

Run: `jupyter kernelspec list`
Expected: a `julia-1.10` entry. If missing, register it from Julia with `using IJulia; installkernel("Julia")`.

- [ ] **Step 2: Render**

Run: `make notebooks`
Expected: Quarto executes the Julia cells (slow on first run — Plots.jl precompilation can take several minutes) and prints `Generated: content/posts/2022-08-29-rejection-sampling.md`.

- [ ] **Step 3: Verify the nine SVGs exist and are non-trivial**

```bash
ls -la assets/rejection-sampling/*.svg | wc -l
find assets/rejection-sampling -name '*.svg' -size -5k
```

Expected: `9`, and the `find` returns nothing (every SVG is at least 5KB — a smaller file means an empty plot).

- [ ] **Step 4: Verify the generated front matter survived the swap**

```bash
sed -n '1,20p' content/posts/2022-08-29-rejection-sampling.md
```

Expected: `# GENERATED FILE` marker, `toc: true`, `unlisted: true`, the `css:` list, and the `bibliography:` line all present; no `authors:` and no `toc-title:`.

- [ ] **Step 5: Verify site syntax survived the render**

```bash
grep -c '::: {\.note-callout' content/posts/2022-08-29-rejection-sampling.md
grep -c '{#fig:' content/posts/2022-08-29-rejection-sampling.md
grep -c '</details>' content/posts/2022-08-29-rejection-sampling.md
```

Expected: `7`, `6`, `6`. Any shortfall means Quarto rewrote something it should have passed through — re-check the alias spelling in the qmd.

- [ ] **Step 6: Commit the generated artifacts**

```bash
git add content/posts/2022-08-29-rejection-sampling.md assets/rejection-sampling
git commit -m "rejection-sampling: generated markdown and figures"
```

---

### Task 7: Figure-card and folded-code styling

Plots.jl SVGs carry a hardcoded `#ffffff` background rect and `#000000` axes and text, so they stay light in both themes by design. The CSS frames them so that reads as a deliberate panel rather than an accident of the export.

**Files:**
- Create: `assets/css/rejection-sampling.css`

**Interfaces:**
- Consumes: the `css:` front-matter entry written in Task 5.
- Produces: page-scoped styling. Because the file loads only on this page (via `css:` front matter), bare element selectors are already page-scoped and need no wrapper class.

- [ ] **Step 1: Write the stylesheet**

Create `assets/css/rejection-sampling.css`:

```css
/* Page-scoped styles for the rejection-sampling post.
   Loaded only on this page via the `css:` front-matter key, so bare element
   selectors are safe here. */

/* --- Figure cards -------------------------------------------------------
   The figures are Plots.jl SVG exports with a baked-in white background and
   black axes. Rather than rewriting the SVGs, we present them as deliberate
   light panels that look the same in light and dark mode. */

figure {
  margin: 2rem 0;
}

figure img {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: auto;
  background: #fff;
  padding: 0.75rem;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 6px;
}

/* The caption sits outside the panel so it picks up the page's own colours
   and stays readable in dark mode. */
figure figcaption {
  margin-top: 0.6rem;
  font-size: 0.9em;
  line-height: 1.45;
  opacity: 0.8;
}

/* --- Folded code --------------------------------------------------------
   `<details class="code-fold">` wraps the setup and plotting cells, which are
   noise for most readers but worth keeping available. */

details.code-fold {
  margin: 1.25rem 0;
}

details.code-fold > summary {
  cursor: pointer;
  font-size: 0.9em;
  opacity: 0.75;
  user-select: none;
}

details.code-fold > summary:hover {
  opacity: 1;
}

details.code-fold[open] > summary {
  margin-bottom: 0.5rem;
}

/* --- Collapsible callouts ----------------------------------------------
   Emitted by filters/callouts.lua when a callout carries `collapse`. */

.callout details.callout-details > summary {
  cursor: pointer;
  font-weight: 600;
  user-select: none;
}
```

- [ ] **Step 2: Build and confirm the stylesheet is linked**

```bash
make && grep -c 'rejection-sampling.css' _site/posts/rejection-sampling/index.html
```

Expected: `1`. A `0` means `asset-paths.lua` did not resolve the `css:` entry — check that the front-matter swap preserved it.

- [ ] **Step 3: Commit**

```bash
git add assets/css/rejection-sampling.css
git commit -m "rejection-sampling: figure-card and folded-code styling"
```

---

### Task 8: Full build verification

**Files:** none modified — this task is the acceptance gate from the spec.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a verified `_site/posts/rejection-sampling/index.html`.

- [ ] **Step 1: Clean build with the full test suite**

```bash
make clean && make && node --test
```

Expected: build completes, all tests pass.

- [ ] **Step 2: Verify the build needs no Julia**

```bash
env PATH=/usr/bin:/bin:/usr/sbin:/sbin make clean all
```

Expected: succeeds. This is the load-bearing check for the committed-outputs design — the build must not reach for Quarto or Julia. (If `npx`/`pandoc` are not on that reduced PATH, prepend only their directories, never Julia's.)

- [ ] **Step 3: Verify cross-references resolved**

```bash
grep -o '@fig:[a-z-]*' _site/posts/rejection-sampling/index.html | head
```

Expected: no output — every `@fig:` became a numbered link. Any literal `@fig:` text means pandoc-crossref did not match the label.

- [ ] **Step 4: Verify citations and references**

```bash
grep -c 'csl-entry' _site/posts/rejection-sampling/index.html
grep -c '\[?\]' _site/posts/rejection-sampling/index.html
```

Expected: `5` reference entries and `0` unresolved-citation markers.

- [ ] **Step 5: Verify figures and collapsibles**

```bash
grep -c '<img[^>]*rejection-sampling/fig-' _site/posts/rejection-sampling/index.html
grep -c 'callout-details' _site/posts/rejection-sampling/index.html
grep -c 'code-fold' _site/posts/rejection-sampling/index.html
```

Expected: `9`, `3`, `6`.

- [ ] **Step 6: Verify the SVGs were copied into the built site**

```bash
ls _site/assets/rejection-sampling/*.svg | wc -l
```

Expected: `9`. A `0` means `assets/rejection-sampling` is missing from `STATIC_DIRS`.

- [ ] **Step 7: Verify Phase 1 isolation of the old post**

```bash
git status --short content/posts/2022-08-29-rejection-sampling-expo.md assets/rejection-sampling-expo
grep -c 'rejection-sampling-expo' _site/posts.html
```

Expected: `git status` reports nothing (the old post is untouched), and the old post is still listed. Also confirm the new post is *not* listed:

```bash
grep -c 'posts/rejection-sampling/' _site/posts.html
```

Expected: `0` — `unlisted: true` keeps it out during Phase 1.

- [ ] **Step 8: Visual check in a browser**

Run: `make serve`, then open `http://localhost:4000/posts/rejection-sampling/`.

Confirm by eye: the nine figures render as framed light cards; captions are readable in both light and dark mode (toggle the OS appearance); the three asides start collapsed and open on click; the six code blocks start folded; the table of contents appears; MathJax renders the display equations; the References section is present once, not twice.

- [ ] **Step 9: Commit any fixes**

If Steps 1–8 required changes, commit them:

```bash
git add -A
git commit -m "rejection-sampling: build verification fixes"
```

If nothing changed, skip this step.

---

### Task 9: Document the workflow

**Files:**
- Modify: `docs/authoring.md`

**Interfaces:**
- Consumes: the finished pipeline.
- Produces: documentation so the next qmd-backed post does not require rediscovering any of this.

- [ ] **Step 1: Add a section to docs/authoring.md**

Insert after the existing `## Interactive JavaScript` section:

````markdown
## Notebook-backed posts (Quarto + Julia)

Some posts are generated from a Quarto `.qmd` so that the code producing their
figures stays editable. `content/posts/2022-08-29-rejection-sampling.qmd` is the
worked example.

Quarto is used **purely as an execution engine**, never as a renderer: it runs
the code cells and passes the prose through untouched, and the ordinary pandoc
build then does citations, cross-references, callouts, and templating. Both the
generated `.md` and the figures are committed, so a normal `make` never needs
Julia or Quarto installed.

```bash
make notebooks   # re-run the code and regenerate; needs Quarto + a Julia kernel
make             # ordinary build; uses the committed .md and .svg files
```

Because Quarto rewrites anything it recognises, `.qmd` sources must use
site-flavoured syntax rather than Quarto's:

| Write this in a `.qmd` | Not this | Why |
|---|---|---|
| `::: {.note-callout}` | `::: {.callout-note}` | Quarto flattens classes it knows into blockquotes |
| `::: {.note-callout collapse="true"}` | Quarto's `collapse` | same, and `callouts.lua` renders it as `<details>` |
| `@fig:name`, `{#fig:name}` | `@fig-name`, `#| label: fig-name` | pandoc-crossref's syntax; Quarto's figure nodes do not survive `--to markdown` |
| `savefig(p, "../../assets/…")` + a markdown image line | `#| fig-cap:` | Quarto inlines SVGs rather than writing files |
| `<details>` written by hand | `#| code-fold: true` | keeps folding under our control |

Two gotchas worth remembering:

- `savefig` paths are relative to `content/posts/` (Quarto's working directory),
  while the markdown image line uses the served URL — so the same figure is
  `../../assets/rejection-sampling/fig-setup.svg` in Julia and
  `/assets/rejection-sampling/fig-setup.svg` in the prose.
- Quarto eats `css:`, `toc:`, and `bibliography:` from front matter and adds a
  duplicate `authors:`. `scripts/qmd-frontmatter.js` puts the source YAML back;
  the `make notebooks` rule already runs it.
````

- [ ] **Step 2: Commit**

```bash
git add docs/authoring.md
git commit -m "docs: notebook-backed post workflow"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: architecture and the `notebooks` target → Task 4; qmd conventions (figures, cross-refs, callouts, citations, folded code) → Task 5; the five site-side changes → Tasks 1 (callouts.lua), 7 (CSS), 4 (Makefile), 2 (bib), 9 (authoring docs); front-matter swap → Task 3; the phasing constraint → Task 5 Step 2 and Task 8 Step 7; every verification bullet → Task 8. Phase 2 (redirect stub) is deliberately out of scope per the spec and has no task.

**Placeholder scan.** No TBDs; every code step carries literal content; no "similar to Task N" references.

**Type consistency.** `swapFrontMatter(generatedMd, qmdSource)` is defined in Task 3 and called with that argument order by the Makefile CLI in Task 4. SVG filenames in Task 5's table match the counts asserted in Tasks 6 and 8 (9 figures, 6 labelled, 6 folded cells, 3 collapsible callouts, 7 total callouts). The `callout-details` and `code-fold` class names in Task 1's filter match the selectors in Task 7's CSS and the greps in Task 8.

**Known soft spot.** Task 4 Step 3 assumes `quarto render --output-dir ../../_build -o rejection-sampling.raw.md` resolves relative to the input file's directory. Task 6 Step 2 will surface it immediately if that is wrong: the `node` step will fail on a missing `_build/rejection-sampling.raw.md`, and the fix is to correct the `--output-dir` value before continuing.
