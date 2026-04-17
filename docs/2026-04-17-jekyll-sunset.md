# Jekyll sunset — 2026-04-17

On 2026-04-17 the site moved off Jekyll entirely.

**Before:** Jekyll + kramdown + jekyll-scholar. CI (`.github/workflows/deploy.yml`) ran `bundle exec jekyll build` on pushes to `source` and published to `master`. GitHub Pages served `master`.

**After:** Pandoc + Make + esbuild. The homepage's publications section is driven by `pubs.yaml` + a local `source.bib` symlink (→ the user's `~/all-biblatex.bib`). Deploys run locally via `make deploy` — no CI. GitHub Pages now serves `static`.

See [`docs/specs/2026-04-15-pandoc-migration-design.md`](specs/2026-04-15-pandoc-migration-design.md) for the original migration design, and the Phase 3 / Phase 4 specs in `docs/specs/` for the details of the switchover.

## Branch layout after the sunset

- `source` — the Pandoc source you edit and commit to
- `static` — built HTML, served by GitHub Pages (updated only by `make deploy`)
- `source-jekyll-deprecated` — the pre-sunset Jekyll source branch, archived on origin. Never deploys. Never pushed to.

## Browsing the archived Jekyll branch

The Jekyll branch lives on origin and is fetched into your local git object store, but there's no local tracking branch by default — so `git branch` won't list it. Use these:

```bash
git branch -a                                       # see everything including origin/*
git log origin/source-jekyll-deprecated             # scroll the Jekyll history
git show origin/source-jekyll-deprecated:_layouts/post.html   # view a single file
git diff origin/source-jekyll-deprecated HEAD -- some/path    # compare vs. current
```

If you want to poke around on disk (read-only detached HEAD):

```bash
git switch --detach origin/source-jekyll-deprecated
# ... browse files at this revision ...
git switch source                                   # back to the Pandoc source branch
```

Or create a local tracking branch to treat it like a regular branch (still read-only in practice — don't push to it):

```bash
git switch -c source-jekyll-deprecated origin/source-jekyll-deprecated
```

Nothing is re-fetched; the Jekyll history is already in the local object store. It persists indefinitely because `origin/source-jekyll-deprecated` is a reachable ref — git's garbage collector won't prune it.
