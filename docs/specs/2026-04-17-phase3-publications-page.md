# Phase 3: Publications page

**Date:** 2026-04-17
**Status:** Draft
**Depends on:** Phase 2 (Pandoc pipeline for site content, complete)

## Goal

Replace the jekyll-scholar publications page with a Pandoc-compatible build that reads a YAML source of truth. After this phase, every page on the site (posts, explorations, index, listing, pubs) builds via `make`, with no dependency on Jekyll.

## Approach

`pubs.yaml` at the repo root is the canonical publication list. A Node script (`scripts/build-pubs.js`) reads it and emits:

- `_generated/pubs.md` — Pandoc markdown with an HTML block listing entries. Pandoc compiles it into `_site/pubs/index.html` using the standard `base.html` template (with `page-style: site`).
- `assets/bibliography/pubs.bib` — generated BibTeX, linked from the page as a download for readers who want to cite.

**Why YAML, not the existing `.bib`?** Explicit schema (no `mypubstate`/`myurltitle` magic field names), nicer to maintain by hand, easier to evolve. Translating the 9 existing entries is a one-time cost. The generated `.bib` preserves BibTeX availability for readers.

**Why Node?** Already in the build pipeline (esbuild, browser-sync). `js-yaml` adds one dependency. Keeps the runtime set at {Node, Pandoc}. Lua rules itself out — `pandoc lua` has no stdlib YAML parser, and hand-rolling one is more code than it's worth.

**Style:** Flat reverse-chronological list. Title, authors, venue, link buttons. No per-entry abstract or raw-bibtex dropdowns (those are the main simplifications vs. the current Jekyll page). Modeled on `timvieira/timvieira.github.com`'s `papers.yaml` + `build.py` pattern.

## Source schema (`pubs.yaml`)

Top-level is a list. Each entry:

### Required fields

- `id` — stable string key, used as BibTeX cite key. Convention: `surname.f:YEARsuffix` (e.g., `hoover.j:2021emnlp`).
- `title` — string. Use `{braces}` around words that must preserve capitalization for BibTeX (e.g., `"Ensembling Language Models with Sequential {Monte Carlo}"`). Braces stripped for HTML display.
- `authors` — list of `"First Last"` strings in natural order.
- `year` — integer.
- `type` — one of: `article`, `inproceedings`, `thesis`, `misc`, `online`.
- `venue` — short display label (e.g., `EMNLP 2021`, `Open Mind`, `Preprint`). Shown on the page.

### Optional fields

- `month` — integer (1–12) or month name. Used for sorting within a year and for BibTeX output.
- `day` — integer.
- `venue_full` — full proceedings/journal name for BibTeX `booktitle`/`journal`.
- `venue_url` — link for the venue label on the page.
- `publisher`, `address`, `pages`, `doi`, `editor`, `school` — BibTeX passthroughs.
- `note` — short note shown in parens after the venue on the page (e.g., `"Outstanding Paper Award 🏆"`).
- `status` — one of `preprint`, `forthcoming`, `in-press`, `submitted`, `in-preparation`. Rendered as a small tag after the venue when present. Omit for published work.
- `equal_contribution` — list of 0-based author indices. Appends `*` to those authors' names and renders a `* Equal contribution` footnote under the entry.

### Links (`links:` map)

Any subset of these keys. Each maps to a URL or a path.

- `url` — primary link for the entry (used as the title link on the page). If absent, the script falls back to the first of `{arxiv, preprint, doi_url, openreview}` that exists. If none of those exist either, the title renders as plain text (no link).
- `arxiv` — arXiv URL or bare arXiv ID (the script builds `https://arxiv.org/abs/<id>`).
- `pdf` — relative filename → `/assets/pdfs/<name>`; absolute URL passed through.
- `preprint` — preprint URL (OSF, PsyArXiv, etc.).
- `code` — code repository URL.
- `slides` — relative filename → `/assets/pdfs/<name>`; absolute URL passed through.
- `poster` — relative filename → `/assets/pdfs/<name>`; absolute URL passed through.
- `handout` — same path rules as slides.
- `video` — URL.
- `openreview` — URL.
- `lingbuzz` — bare lingbuzz ID (the script builds `https://ling.auf.net/lingbuzz/<id>`).
- `doi_url` — explicit DOI link; if absent but `doi` is set, the script builds `https://doi.org/<doi>`.
- `other` — list of `{label: "text", url: "…"}` for miscellaneous links (e.g., `{label: "surprisal explorer", url: "…"}`).

### Example entry

```yaml
- id: hoover.j:2021emnlp
  title: "Linguistic Dependencies and Statistical Dependence"
  authors:
    - Jacob Louis Hoover
    - Wenyu Du
    - Alessandro Sordoni
    - Timothy J. O'Donnell
  year: 2021
  month: 11
  type: inproceedings
  venue: EMNLP 2021
  venue_full: Proceedings of the 2021 Conference on Empirical Methods in Natural Language Processing
  venue_url: https://aclanthology.org/2021.emnlp-main.234
  pages: "2941--2963"
  publisher: Association for Computational Linguistics
  links:
    code: https://github.com/mcqll/cpmi-dependencies
    slides: 2021.10.11.EMNLP.talk-slides.pdf
    poster: 2021.10.11.EMNLP.poster.pdf
```

## Build script (`scripts/build-pubs.js`)

Plain Node (no framework). Dependencies: `js-yaml`. Structured into small pure functions for testability.

### Responsibilities

1. **Load + validate `pubs.yaml`**
   - Parse YAML via `js-yaml`.
   - Validate required fields present, `type` in allowed set, `equal_contribution` indices in range, `links.other` entries have both `label` and `url`.
   - Warnings (not errors) if a local PDF path doesn't resolve in `assets/pdfs/`.
   - On error: print a clear message (entry `id` + what's wrong) and exit non-zero.

2. **Sort entries** reverse-chronologically by `(year, month, day)`. Missing `month`/`day` treated as 0 (sort last within the year).

3. **Write `_generated/pubs.md`**
   - Front matter: `title: research`, `page-style: site`.
   - Top-of-page header: Google Scholar link + BibTeX download link, as a `<ul class="social-media-list">`.
   - Main list as a `<ul class="pub-list">` inside a `` ```{=html} `` block so Pandoc passes it through verbatim.
   - Per-entry HTML: title (linked), authors (with `*` for equal-contrib), venue (linked if `venue_url`), optional note in parens, status tag if present, `<div class="pub-extras">` with link buttons.
   - Bottom: equal-contribution footnote (only if any entry uses it), name-change note (always).

4. **Write `assets/bibliography/pubs.bib`**
   - One BibTeX entry per YAML entry.
   - Type mapping: `thesis` → `@phdthesis`, others passthrough.
   - Fields: `title` (braces preserved), `author` (converted to `Last, First and Last, First` form with surname-prefix handling for names like "Van Durme"), `year`, `month`, `booktitle`/`journal`/`school` per type, `pages`, `publisher`, `address`, `doi`, `url`, `note` (emoji stripped for BibTeX compatibility).
   - LaTeX-escape non-ASCII chars (`ü` → `{\"u}`, `é` → `{\'e}`, `ñ`, `ã`, `ö`, `æ`, `ç`, capitalized variants).

### Pure functions (for unit tests)

- `stripTitleBraces(title)` — removes `{` / `}` for HTML display.
- `formatAuthorsHtml(authors, equalContribution)` — joins with commas, appends `*` for equal-contribution indices.
- `formatAuthorsBibtex(authors)` — converts to `Last, First and Last, First` with surname-prefix handling.
- `latexEscape(s)` — escapes diacritics for BibTeX.
- `buildPdfUrl(path)` — absolute URLs pass through; bare filenames prepended with `/assets/pdfs/`.
- `buildArxivUrl(id)`, `buildLingbuzzUrl(id)`, `buildDoiUrl(doi)` — link-builders.
- `generateHtmlEntry(paper)` — returns `<li>` string.
- `generateBibtexEntry(paper)` — returns `@type{id, …}` string.

### Output format (HTML, condensed)

```html
<li class="pub">
  <a class="pub-title" href="{primary url}">Title with braces stripped</a>
  <span class="pub-author">Jacob Louis Hoover, Wenyu Du, …</span>
  <a class="pub-venue" href="{venue_url}">EMNLP 2021</a>
  <span class="pub-status">preprint</span>   <!-- only if status present -->
  (Outstanding Paper Award 🏆)                <!-- only if note present -->
  <div class="pub-extras">
    <a class="extra arxiv" href="…">arXiv</a>
    <a class="extra code" href="…">code</a>
    <a class="extra slides" href="…">slides</a>
  </div>
</li>
```

Primary URL for the title link: `links.url` if present, else first of `{arxiv, preprint, doi_url, openreview}` that exists. If none exist, the title is plain text (no anchor wrapper).

## Makefile integration

```makefile
.PHONY: pubs
pubs:
	@node scripts/build-pubs.js

generate:
	@pandoc lua scripts/build-index.lua
	@node scripts/build-pubs.js

all: generate content js assets static-html
```

`scripts/build-content.sh` already picks up `_generated/posts.md` (the blog listing); extending it to find `_generated/pubs.md` should require no change if it globs `_generated/*.md`. Verify during implementation; add a glob entry if needed.

For `make serve`: watch `pubs.yaml` and re-run `pubs` on change. Existing watcher infrastructure in `scripts/serve.sh` gets `pubs.yaml` added to the watched set.

## Testing

`test/build-pubs.test.js` via `node --test`. Covers the pure helper functions only; skip end-to-end file I/O tests.

- `formatAuthorsBibtex` — simple case, surname prefixes (`Van Durme`, `De La Cruz`), single-name authors, `O'Donnell` apostrophe handling.
- `stripTitleBraces` — with and without braces.
- `latexEscape` — each diacritic, empty string.
- `buildPdfUrl` — relative, absolute URL, no trailing slash issues.
- `generateHtmlEntry` — snapshot-style test on a fixture entry, asserts key substrings present (title, each author, each link).
- `generateBibtexEntry` — same style.

## Styling

Add a new section to `assets/css/site.css` (the `page-style: site` stylesheet, introduced in Phase 2):

- `.pub-list` — unstyled `<ul>`, generous vertical spacing between `<li>`.
- `.pub-title` — distinct weight from body.
- `.pub-author` — slightly muted.
- `.pub-venue` — italicized or small-caps.
- `.pub-status` — small tag, muted background.
- `.pub-extras .extra` — bracket-styled link buttons (`[arXiv]`, `[code]`), matching the current Jekyll look.

No new CSS file; these join `site.css`.

## Migration

1. Create `pubs.yaml` at repo root. Translate all 9 entries from `_bibliography/pubs.bib` by hand. Verify the generated `pubs.bib` round-trips reasonably (not field-for-field, but equivalent information preserved).
2. Add `js-yaml` to a new `package.json` (first use of npm dependencies for build tooling; esbuild + browser-sync were invoked via `npx`).
3. Implement `scripts/build-pubs.js` incrementally — start with YAML load + HTML output, add BibTeX generation second.
4. Wire up Makefile target + `make serve` watcher.
5. Replace `content/pubs.md` placeholder with generated output — delete the placeholder once `_generated/pubs.md` is picked up.
6. Update `docs/authoring.md` with a "How to add a publication" section.

On the `pandoc-migration` branch, leave `_bibliography/pubs.bib` in place — it becomes obsolete once `pubs.yaml` is authoritative, but doesn't hurt anything. Phase 4 (removing Jekyll) deletes `_bibliography/` along with the rest of the Jekyll scaffolding. The `source` branch (where Jekyll still runs) is untouched throughout.

## Scope

### In scope

- `pubs.yaml` schema + 9-entry migration
- `scripts/build-pubs.js` with validation, HTML generation, BibTeX generation
- Makefile integration (new `pubs` target, `generate` update, watcher update)
- Unit tests for pure functions
- Styling additions to `site.css`
- `docs/authoring.md` update

### Deferred

- In-text citations of Jacob's own papers in blog posts (not a current use case; would require separate citeproc wiring).
- Theme/topic grouping or filtering on the page (Tim has `themes` for a research graph; not needed here yet).
- Per-entry abstract expansion (explicitly dropped — simpler page).
- Redirects from old Jekyll `/pubs.html` URL (handled in Phase 4 with the overall URL migration).

## Open questions

None at this point. All schema fields, layout decisions, and tooling choices are settled above.
