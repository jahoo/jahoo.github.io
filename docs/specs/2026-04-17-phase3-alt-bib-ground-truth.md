# Phase 3 alternative: bib-ground-truth publications page

**Date:** 2026-04-17
**Status:** Draft (exploration)
**Parallel to:** `docs/specs/2026-04-17-phase3-publications-page.md` (YAML-ground-truth version, now built and deployed at `/pubs/`)

## Motivation

The YAML-ground-truth version (`pubs.yaml` → `scripts/build-pubs.js`) duplicates bibliographic data that already lives in the user's global Zotero-generated bib file at `~/all-biblatex.bib`. Every new publication requires hand-typing authors, title, venue, year, DOI, and URL — data the bib already holds authoritatively.

This alternative uses the global bib as the bibliographic source of truth. A small config file lists which bib keys to include and supplies only the website-specific extras (short venue labels, custom links, awards, status tags, equal-contribution marks) that the bib does not carry.

Goal: compare both versions live at different URLs, then keep one.

## Scope

Both implementations coexist during the comparison. The current one builds `/pubs/` from `pubs.yaml`; the new one builds `/pubs-bib/` from `pubs-bib.yaml` + the global bib. When the comparison is done, the chosen version stays and the other is deleted (and the survivor may be renamed to drop the `-bib` suffix).

Out of scope:
- Custom CSL style. Rendering reuses the existing `generateHtmlEntry` from `scripts/build-pubs.js`. Citations are not rendered by citeproc.
- Supporting pubs that aren't in the global bib. All 14 current entries live in `~/all-biblatex.bib`.

## Bib source location

Convention: a gitignored symlink `source.bib` at the repo root points at the actual bib file.

```bash
ln -s ~/all-biblatex.bib source.bib
```

`site.yaml` references this symlink by its relative name:

```yaml
bib-source: source.bib
```

`.gitignore` gains one line: `source.bib`. The repo never references a machine-specific absolute path.

If `source.bib` is missing or a broken symlink, `node scripts/build-pubs-bib.js` exits non-zero with:

```
error: source.bib not found. Create a symlink pointing to your bib, e.g.:
  ln -s ~/all-biblatex.bib source.bib
```

## Config file (`pubs-bib.yaml`)

Top-level is a list of objects. Only `key` is required. All other fields are website-specific overlays on bib data.

```yaml
# Bibliographic fields (title, authors, year, venue, DOI, URL) are drawn from
# source.bib. This file holds only website-specific overlays.
#
# Required: key
# Optional: venue, venue_url, note, status, equal_contribution, links

- key: chan.r:2026arxiv
  status: preprint

- key: lipkin.b:2025
  venue: CoLM 2025
  venue_url: https://colmweb.org/
  note: "Outstanding Paper Award"
  links:
    code: https://github.com/...
    openreview: https://openreview.net/forum?id=3BmPSFAdq3

- key: hoover.j:2023
  venue: Open Mind
  links:
    preprint: https://doi.org/10.31234/osf.io/qjnpv
    code: https://github.com/mcqll/plausibility-sampling-processing/
    other:
      - label: surprisal explorer
        url: https://jahoo.shinyapps.io/surprisal_explorer/
```

### Initial key list (14 entries)

```
chan.r:2026arxiv
vigly.j:2025cogsci
clark.t:2025cogsci
vigly.j:2025psyarxiv
lipkin.b:2025
vigly.j:2025HSP
clark.t:2025HSP
hoover.j:2024phd
rahimi.h:2024
hoover.j:2023
socolof.m:2022
hoover.j:2022poster
hoover.j:2021EMNLP
hoover.j:2021WCCFL
```

Some of these don't exist in the legacy `_bibliography/pubs.bib` (`clark.t:2025cogsci`, `vigly.j:2025HSP`, `clark.t:2025HSP`, `rahimi.h:2024`, `hoover.j:2022poster`), and others have different casing (`hoover.j:2021EMNLP` vs. legacy `hoover.j:2021emnlp`). Pulling from Zotero's canonical keys naturally picks up the updates.

## Merge rules (bib data + extras)

Bib data fills in; extras override. Rendering reuses the existing entry shape, so the result flows into the same `generateHtmlEntry`.

| Entry field | Source |
|---|---|
| `title` | bib `title` |
| `authors` | bib `author` array (each entry's `given` + `family`, with `non-dropping-particle` preserved) |
| `year` | bib `issued.date-parts[0][0]` |
| `month` | bib `issued.date-parts[0][1]` (optional) |
| `day` | bib `issued.date-parts[0][2]` (optional) |
| `type` | mapped from bib CSL type: `article-journal` → `article`; `paper-conference` → `inproceedings`; `thesis` → `thesis`; `post` / `post-weblog` / `webpage` / `manuscript` → `online`; else `misc` |
| `venue` | extras override; else bib `shortjournal` / `shortseries` / `eventtitle`; else full `container-title` |
| `venue_full` | bib `container-title` / `journal` / `booktitle` (whichever present) |
| `venue_url` | extras only |
| `pages` | bib `page` |
| `publisher` | bib `publisher` |
| `address` | bib `event-place` / `publisher-place` |
| `doi` | bib `DOI` |
| `editor` | bib `editor` array |
| `note` | extras override; else bib `note` |
| `status` | extras only |
| `equal_contribution` | extras only |
| `links.url` | extras override; else bib `URL` |
| `links.doi_url` | derived from bib `DOI` |
| `links.arxiv` | derived from bib `archiveprefix`=arXiv + `eprint`, or a dedicated `arxiv` field if present |
| `links.{code, preprint, slides, poster, handout, video, openreview, lingbuzz, other}` | extras only |
| `links.pdf` | extras only (Zotero's bib often points to local PDFs that shouldn't be exposed) |

## Build script (`scripts/build-pubs-bib.js`)

ES module, same style as `scripts/build-pubs.js`. New dependencies: `@citation-js/core`, `@citation-js/plugin-bibtex`. Not needed: `@citation-js/plugin-csl` (we don't render via CSL).

Flow:

1. Read `site.yaml`, resolve `bib-source` (relative to repo root).
2. Read `pubs-bib.yaml`.
3. `loadBibSource()` — readFileSync on resolved bib path. Fail cleanly if missing/broken symlink.
4. `parseBib(text)` — feed to citation-js:
   ```js
   import Cite from '@citation-js/core';
   import '@citation-js/plugin-bibtex';
   const entries = new Cite(text).data; // array of CSL-JSON objects
   ```
5. Index entries by `id`. For each key in `pubs-bib.yaml`:
   - Look up the CSL-JSON entry. Error if missing: `[key] not found in source.bib`.
   - Call `adaptEntry(cslJson, extras)` → our entry shape.
6. `entries.forEach(validateEntry)` — reuse existing validator.
7. `sortEntries(entries)` — reuse.
8. Write `_generated/pubs-bib.md` via `generateMarkdown(sorted)` — reuse. Page title stays `research`; only the URL (`/pubs-bib/`) and the underlying filename distinguish the two versions during comparison.
9. Write `assets/bibliography/pubs-bib.bib` — serialize the selected CSL-JSON entries back to biblatex via citation-js:
   ```js
   const bib = new Cite(selectedCslJson).format('biblatex', { format: 'text' });
   ```

### Pure helper functions

Exported for unit testing:
- `parseBib(text)` — thin wrapper around citation-js returning CSL-JSON array.
- `indexByKey(entries)` — `Map<id, entry>`.
- `mapCslType(cslType)` — CSL type string → our type enum.
- `cslAuthorsToStrings(authorArray)` — `[{given, family, "non-dropping-particle"?}, ...]` → `["First Last", ...]`.
- `adaptEntry(cslJson, extras)` — returns an entry object in the shape `generateHtmlEntry` consumes.

### Reused from `scripts/build-pubs.js`

No changes to that file except adding missing exports if any current helpers are currently file-local. Reused: `generateHtmlEntry`, `generateMarkdown`, `sortEntries`, `validateEntry`, `stripTitleBraces`, `escapeHtml`, URL builders, `formatAuthorsHtml`. Not reused: `generateBibtexEntry` / `generateBibtexFile` / `formatAuthorsBibtex` / `latexEscape` — the bib-variant serializes to biblatex via citation-js instead of our hand-written emitter.

### Output

- `_generated/pubs-bib.md` — Pandoc picks up automatically (existing `_generated/*.md` glob); builds to `_site/pubs-bib/index.html`.
- `assets/bibliography/pubs-bib.bib` — regenerated at build from the selected CSL-JSON entries, serialized back to biblatex. Linked from the page as a download.

## Makefile integration

```makefile
.PHONY: pubs-bib

generate: pubs pubs-bib
	@pandoc lua scripts/build-index.lua

pubs-bib:
	@node scripts/build-pubs-bib.js
```

`make all` / `make` picks up `pubs-bib` via `generate`. `make pubs-bib` runs it standalone. If `source.bib` is missing, `pubs-bib` fails; `pubs` and `content` still build, but `all` exits non-zero.

## `serve.sh` watcher

Add `pubs-bib.yaml`, `scripts/build-pubs-bib.js`, and `source.bib` to the watched set. `source.bib` is a symlink; `fswatch` follows symlinks by default, so edits to `~/all-biblatex.bib` trigger a rebuild.

Case handler:

```bash
*pubs-bib.yaml|*build-pubs-bib.js|*source.bib|*all-biblatex.bib)
    echo "Bib or pubs-bib changed — regenerating pubs-bib"
    node scripts/build-pubs-bib.js || true
    bash scripts/build-content.sh 2>&1 || true
    ;;
```

(Adding `*all-biblatex.bib` explicitly catches edits through the symlink target on macOS, where fswatch event paths sometimes report the resolved path.)

## Testing

`test/build-pubs-bib.test.js` (new). Uses a fixture bib inline so tests don't depend on the user's real bib.

Test cases:
- `parseBib` — produces CSL-JSON for a 2-entry fixture (inproceedings + article)
- `mapCslType` — all 5 mappings + fallback to `misc`
- `cslAuthorsToStrings` — simple name, Van-prefix surname via `non-dropping-particle`, single-name author, diacritics decoded
- `adaptEntry` — basic merge (no extras), extras override (venue, venue_url, note), status extras-only, equal_contribution extras-only, links merge (bib url + extras code), links.arxiv derived from eprint+archiveprefix, links.doi_url derived from DOI
- `adaptEntry` — unknown key throws

End-to-end: no separate test, but a smoke-run from the existing `make pubs-bib` target against the real bib validates the full pipeline during Task verification.

## Styling

No new CSS. Reuses `.pub-list` / `.pub-title` / `.pub-author` / `.pub-venue` / `.pub-status` / `.pub-extras` / `.pub-footnote` / `.social-media-list` from `assets/css/site.css`. Since the renderer is the same, visual differences between `/pubs/` and `/pubs-bib/` come only from the data source (bib-derived fields vs. hand-entered YAML fields), which is the point of the comparison.

## `.gitignore` change

Add one line:

```
source.bib
```

## Authoring guide update

Add a short "Bib-ground-truth variant (exploration)" section to `docs/authoring.md` covering:

- **Setup:** create a gitignored symlink `source.bib` at the repo root pointing at your local bib file. The file must be in BibLaTeX format (Zotero's "Better BibLaTeX" export works; classic BibTeX largely works too, modulo a few field-name differences).

  ```bash
  ln -s ~/all-biblatex.bib source.bib
  ```

  The path on the right-hand side is wherever your bib actually lives; `source.bib` is what the build reads. If missing, `node scripts/build-pubs-bib.js` fails with a clear message (same command as the example above).

- **Adding a publication:** append an entry to `pubs-bib.yaml` with the bib `key` and any website-specific extras (short `venue` label, `venue_url`, `note`, `status`, `equal_contribution`, `links.{code, slides, poster, ...}`). All bibliographic data is pulled from the bib.

- **Config file shape:** brief example block.

- **Differences from the YAML variant:** one short paragraph noting which one builds `/pubs/` vs. `/pubs-bib/` during the comparison, and a pointer to this spec.

This section gets removed when the comparison concludes and one version is chosen.

## Open questions

None remaining. All schema, path, and rendering decisions resolved above.
