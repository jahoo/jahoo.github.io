## Workflow

Built with a Pandoc + Make + esbuild pipeline. Content authored as markdown in `content/`; homepage publications driven by `pubs.yaml` (a list of bib keys) plus a gitignored `source.bib` symlink at the repo root pointing at the local BibLaTeX library.

Docs:
- [docs/authoring.md](docs/authoring.md) — authoring guide (new posts, front matter, math, citations, build commands).
- [docs/pubs.md](docs/pubs.md) — `pubs.yaml` schema (fields, merge rules with `source.bib`, validation).

#### Local development
- Edit on the `source` branch.
- `make serve` — dev server at `localhost:4000` (watches content, filters, templates, assets, and the bib).
- `make -j4` — parallel build to `_site/`.
- `make test` — JS tests via `node --test`.

Requires Node 20+ and Pandoc.

#### Deploy

`make deploy` on `source` builds the site and pushes `_site/` to the `static` branch; GitHub Pages serves from there.

There's no CI. The build runs locally because `source.bib` (the symlink to the user's bib library) isn't available on a runner. `make deploy` is the only path that pushes to `static`.

#### Branch structure
- `source` — Pandoc source (edit this branch)
- `static` — built HTML output (deployed automatically via `make deploy`, do not edit directly)
- `source-jekyll-deprecated` — read-only archive of the pre-Pandoc Jekyll history

GitHub may show `source` and `static` as "ahead/behind" each other — this is normal. They have independent commit histories.
