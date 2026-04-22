# Publications: `pubs.yaml` schema

The publications section of the homepage is generated from two inputs:

- **`source.bib`** (symlink at the repo root) — bibliographic source of truth, a Zotero-exported BibLaTeX file.
- **`pubs.yaml`** (repo root) — the list of bib keys to include, with website-specific overlays only.

Bibliographic data (title, authors, year, venue_full, DOI, URL, arXiv ID) comes from the bib; `pubs.yaml` only layers on site-specific extras.

## Entry shape

```yaml
- key: surname.f:YEARkey           # required; must exist in source.bib

  venue: SHORT 2024                # optional: short venue label. Falls back to
                                   #   bib shortjournal / eventtitle / container-title;
                                   #   "arXiv" for arxiv-only preprints with no other venue info
  venue_url: https://…             # optional: link wrapped around the venue label

  note: "Outstanding Paper Award"  # optional: shown in parens after venue
  status: preprint                 # optional: small tag (preprint | dissertation |
                                   #   forthcoming | in-press | submitted | …)

  co_first: 2                      # optional: first N authors marked with ∗
                                   #   (co-first authorship). See below.
  co_last: 3                       # optional: last M authors marked with ‡
                                   #   (co-senior authorship). See below.

  link_label: "Open Mind"          # optional: override the auto-derived label
                                   #   on the primary-URL link button

  links:
    url: https://…                 # optional: override the primary title link

    # Extra link-button row beneath the title (any subset):
    code: https://…
    slides: talk.pdf               # bare filename → /assets/pdfs/; URL passes through
    poster: poster.pdf
    handout: handout.pdf
    pdf: paper.pdf
    preprint: https://…
    openreview: https://…
    video: https://…
    lingbuzz: "000371"
    other:
      - label: "surprisal explorer"
        url: https://…
```

## Merge rules (bib + extras)

Bib data fills in; extras override.

| Entry field | Source |
|---|---|
| `title`, `authors`, `year`, `month`, `day`, `type` | from bib |
| `venue` | extras override; else bib short-form; else full container-title; else "arXiv" for arxiv-only |
| `venue_full`, `pages`, `publisher`, `address`, `doi`, `editor` | from bib |
| `venue_url`, `status`, `co_first`, `co_last`, `link_label` | extras only |
| `note` | extras override; else bib `note` |
| `links.url` | extras override; else bib `URL` |
| `links.doi_url` | derived from bib `DOI` |
| `links.arxiv` | derived from bib's `eprint` + `eprinttype=arXiv` (citation-js drops these, so the script regex-scans the raw bib) |
| `links.{code, preprint, slides, poster, handout, video, openreview, lingbuzz, pdf, other}` | extras only |

Primary URL priority for the title link: `links.url` → `links.doi_url` → `links.arxiv` → `links.openreview` → `links.preprint`. The canonical DOI wins over a preprint when a paper is published.

## Author marks: `co_first` / `co_last`

| Field | Type | Effect |
|---|---|---|
| `co_first: N` | integer in `[0, authors.length]` | first N authors get ∗ |
| `co_last: M`  | integer in `[0, authors.length]` | last M authors get ‡ |

Either field may be omitted (default 0 = no marks). Ranges may overlap — a two-author paper with `co_first: 2, co_last: 2` marks both authors `∗‡`.

When any entry has `co_first > 0`, the rendered page gains the legend *∗ Co-first authorship*; similarly for `co_last` and *‡ Co-senior authorship*. Omit both fields (or set to 0) and the entry renders with plain author names — no marks, no legend.

## Validation

`scripts/build-pubs.js` fails the build if:

- a `key` is missing from `source.bib`
- `type` is not one of `article | inproceedings | thesis | misc | online`
- `co_first` or `co_last` is not an integer in `[0, authors.length]`
- a `links.other` entry lacks `label` or `url`

It warns (does not fail) when `pdf` / `slides` / `poster` / `handout` name a file that doesn't exist under `assets/pdfs/`.

## Build targets

- `make pubs` regenerates `_generated/_pub-list.md` (the pub-list partial) from `pubs.yaml` + `source.bib`.
- `make homepage` splices that into `content/_index.md` via [scripts/expand-includes.js](../scripts/expand-includes.js) → `_generated/index.md`.
- `make serve` re-runs both automatically whenever `pubs.yaml` or `source.bib` change.

Each publication's raw bib entry is embedded on the page in a `[bib]` expand-box — click it to see the source. Private Zotero fields (`file`, `abstract`, `keywords`, `urldate`, `langid`, `pubstate`, `eprintclass`) are stripped before rendering.
