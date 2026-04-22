# Phase 4 Remove-Jekyll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Jekyll entirely from the active pipeline. The site ends up building and deploying through Pandoc + Make, with a new `make deploy` target replacing the GitHub Actions workflow. Jekyll's history is preserved on an archive branch.

**Architecture:** All code changes happen on the current `pandoc-migration` branch (which gets renamed to `source` at the end). File deletions + the `make deploy` target + doc updates land as normal commits. Branch renames happen last, via GitHub's UI to preserve refs and redirects.

**Tech Stack:** Make, bash, git worktrees, rsync. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-04-17-phase4-remove-jekyll.md`

---

## Prerequisites

Before starting: the working tree should be clean, or the uncommitted edits should be ones you're willing to include in the Phase 4 sequence. Tasks below assume fresh commits can be made without stepping on in-progress work.

Also: the user's local `source.bib` symlink must point at a readable bib file throughout (so `make all` continues to succeed after each deletion).

---

## File Structure (post-Phase-4)

### Deleted
- `Gemfile`, `Gemfile.lock`, `_config.yml`
- `_layouts/` (whole directory)
- `_includes/` (whole directory)
- `_sass/` (whole directory)
- `_plugins/` (whole directory; contains only `jekyll-file-last-modified.rb`)
- `_bibliography/` (whole directory; contains only `pubs.bib`)
- `_posts/` (whole directory)
- `_explorations/smc-resampling.md` (migrated in Phase 1 to `content/explorations/`)
- `index.md` and `pubs.md` at repo root (Jekyll-era pages)
- `bin/cite` (and `bin/` if it ends up empty)
- `.github/workflows/deploy.yml` (and `.github/workflows/` if empty; keep `.github/`)

### Relocated
- `_explorations/interactive-divergence-fitting.html` → `assets/frozen/interactive-divergence-fitting.html`.
  Content update: `content/posts/2026-04-02-interactive-divergence-fitting.md` frontmatter `external: _explorations/...` → `external: assets/frozen/...`.

### Modified
- `Makefile` — new `.PHONY: deploy` target
- `.gitignore` — add `_deploy/`
- `CLAUDE.md` — Build/Serve/Deploy/Architecture/Citations/Conventions sections
- `README.md` — drop legacy Jekyll paragraph, add deploy paragraph
- `docs/authoring.md` — skim for Jekyll leftovers

### Untouched (explicitly)
- `_explorations/smc-resampling-notes.md` and its `.scholia.*` sidecars — gitignored per `.gitignore: _explorations/*-notes*`; they live on the user's machine, not in the repo, so `git rm` leaves them alone.
- `source-jekyll-deprecated` branch on origin — kept as archive; no future pushes.
- `assets/bibliography/default.bib` — empty but referenced by `site.yaml`'s `bibliography:` field for post-level citeproc fallback. Leave in place.

---

## Task 1: Relocate `interactive-divergence-fitting.html` to `assets/frozen/`

**Why first:** The file is referenced by `content/posts/2026-04-02-interactive-divergence-fitting.md` via the `external:` field. Moving it first means subsequent deletion of `_explorations/` leaves no dangling reference.

**Files:**
- Move: `_explorations/interactive-divergence-fitting.html` → `assets/frozen/interactive-divergence-fitting.html`
- Modify: `content/posts/2026-04-02-interactive-divergence-fitting.md`

- [ ] **Step 1: Move the HTML file**

Run:
```bash
git mv _explorations/interactive-divergence-fitting.html assets/frozen/interactive-divergence-fitting.html
```

Expected: git reports the rename.

- [ ] **Step 2: Update the external: reference**

Edit `/Users/v/Websites/jahoo.github.io/content/posts/2026-04-02-interactive-divergence-fitting.md`. Replace:
```yaml
external: _explorations/interactive-divergence-fitting.html
```
with:
```yaml
external: assets/frozen/interactive-divergence-fitting.html
```

- [ ] **Step 3: Rebuild and verify the post still loads the external HTML**

```bash
trash _site && make 2>&1 | grep -v "ERROR: failed to copy trust" | tail -12
```

Expected output includes a line like:
```
External: assets/frozen/interactive-divergence-fitting.html → _site/posts/interactive-divergence-fitting/index.html
```

Then check the file was copied:
```bash
ls _site/posts/interactive-divergence-fitting/index.html
```

Expected: file exists, non-empty.

- [ ] **Step 4: Commit**

```bash
git add _explorations/interactive-divergence-fitting.html assets/frozen/interactive-divergence-fitting.html content/posts/2026-04-02-interactive-divergence-fitting.md
git commit -m "Phase 4: relocate interactive-divergence-fitting.html to assets/frozen/"
```

---

## Task 2: Delete Jekyll scaffolding (config + layouts + includes + sass + plugins + bib)

**Files (all deleted via `git rm -r`):**
- `Gemfile`, `Gemfile.lock`, `_config.yml`
- `_layouts/`, `_includes/`, `_sass/`, `_plugins/`, `_bibliography/`

None of these are referenced by the Pandoc pipeline. Safe to remove as one commit.

- [ ] **Step 1: Remove the tracked Jekyll files**

```bash
git rm Gemfile Gemfile.lock _config.yml
git rm -r _layouts _includes _sass _plugins _bibliography
```

Expected: git reports each deletion.

- [ ] **Step 2: Rebuild to verify nothing in the pipeline depended on them**

```bash
trash _site && make 2>&1 | grep -v "ERROR: failed to copy trust" | tail -8
```

Expected: build completes without errors. Lines like "Build: content/posts/...", "Generated: _generated/index.md (14 entries)", "Bundle: src/smc-resampling/index.js", "Assets synced", "Static HTML copied".

- [ ] **Step 3: Sanity-check homepage still renders**

```bash
grep -c "pub-title" _site/index.html
```

Expected: `14` (the 14 publications on the homepage).

- [ ] **Step 4: Commit**

```bash
git commit -m "Phase 4: delete Jekyll scaffolding (Gemfile, _config.yml, _layouts, _includes, _sass, _plugins, _bibliography)"
```

---

## Task 3: Delete migrated legacy content

**Files (all deleted via `git rm -r`):**
- `_posts/` — 16 markdown files, fully migrated to `content/posts/` in Phase 2.
- `_explorations/smc-resampling.md` — migrated in Phase 1 to `content/explorations/smc-resampling.md`.
- Repo-root `index.md` and `pubs.md` — Jekyll-era root pages, replaced by `content/_about.md` + generated `_generated/index.md`.

The user's gitignored notes files under `_explorations/` (`smc-resampling-notes.md`, `.scholia.*`) are untouched because they aren't tracked.

- [ ] **Step 1: Remove the tracked legacy files**

```bash
git rm -r _posts
git rm _explorations/smc-resampling.md
git rm index.md pubs.md
```

Expected: each deletion reported.

- [ ] **Step 2: Verify `_explorations/` still exists locally with only gitignored files**

```bash
ls _explorations/ 2>&1
```

Expected output something like (depending on what's in there):
```
interactive-divergence-fitting.html  # wait — this was moved in Task 1
smc-resampling-notes.md
smc-resampling-notes.md.scholia.jsonl
smc-resampling-notes.md.scholia.state.json
```

If only the notes files remain, the directory itself is fine to leave; git sees it as untracked+gitignored. If you already moved interactive-divergence-fitting.html in Task 1, it shouldn't appear here.

- [ ] **Step 3: Rebuild and verify**

```bash
trash _site && make 2>&1 | grep -v "ERROR: failed to copy trust" | tail -6
```

Expected: build completes, no errors.

- [ ] **Step 4: Confirm all 17 posts listed in _generated/posts.md still exist at their destinations**

```bash
grep 'class="post-link' _generated/posts.md | wc -l
```

Expected: a number matching the pre-deletion count (roughly 17). No dropped entries.

- [ ] **Step 5: Commit**

```bash
git commit -m "Phase 4: delete migrated Jekyll content (_posts/, _explorations/smc-resampling.md, index.md, pubs.md)"
```

---

## Task 4: Delete `bin/cite` and CI workflow

Two small unrelated deletions grouped into one commit since they're both "remove Jekyll-era tooling."

**Files:**
- Delete: `bin/cite`
- Delete: `.github/workflows/deploy.yml`

- [ ] **Step 1: Remove the files**

```bash
git rm bin/cite
git rm .github/workflows/deploy.yml
```

- [ ] **Step 2: Remove empty directories if applicable**

```bash
rmdir bin 2>/dev/null || true
rmdir .github/workflows 2>/dev/null || true
```

(Empty-dir removal is a no-op if there are still files in those directories. `.github/` itself should remain.)

- [ ] **Step 3: Verify no build reference to bin/cite**

```bash
grep -r "bin/cite" --include="*.sh" --include="Makefile" --include="*.lua" --include="*.js" . 2>/dev/null | grep -v "^.git/" | grep -v "node_modules"
```

Expected: no matches (or only matches in docs/ and CLAUDE.md, which will be updated in a later task).

- [ ] **Step 4: Commit**

```bash
git commit -m "Phase 4: delete bin/cite and .github/workflows/deploy.yml"
```

---

## Task 5: Add `make deploy` target and `_deploy/` gitignore

**Files:**
- Modify: `Makefile`
- Modify: `.gitignore`

- [ ] **Step 1: Append the `deploy` target to the Makefile**

Edit `/Users/v/Websites/jahoo.github.io/Makefile`. At the end of the file, append:

```make

# ---- Deploy: build on `source`, push _site/ to `static` ----
# Preconditions (fail loudly):
#   - Working tree is clean (uncommitted changes wouldn't ship — deploys
#     reflect HEAD only).
#   - Current branch is `source`.
# Steps:
#   1. `make clean all` for a fresh build.
#   2. Push `source` so the deploy commit on `static` can reference a
#      pushed source commit by short-SHA.
#   3. Check out `static` via a git worktree under `_deploy/`.
#   4. rsync _site/ into the worktree (preserving .git).
#   5. Commit + push `static` if the build changed anything.
#   6. Remove the worktree.
.PHONY: deploy
deploy:
	@git diff --quiet && git diff --cached --quiet || \
	  { echo "error: uncommitted changes on $$(git branch --show-current); commit or stash first"; exit 1; }
	@[ "$$(git branch --show-current)" = "source" ] || \
	  { echo "error: must be on 'source' branch (currently on $$(git branch --show-current))"; exit 1; }
	@$(MAKE) clean all
	@git push origin source
	@git worktree add _deploy static 2>/dev/null || \
	  { echo "error: _deploy worktree already exists; run 'git worktree remove _deploy' first"; exit 1; }
	@rsync -a --delete --exclude='.git' _site/ _deploy/
	@cd _deploy && git add -A && \
	  ( git diff --cached --quiet && echo "static: no changes to deploy" || \
	    ( git commit -m "Deploy $$(cd .. && git rev-parse --short HEAD)" && \
	      git push origin static ) )
	@git worktree remove _deploy
```

- [ ] **Step 2: Add `_deploy/` to .gitignore**

Edit `/Users/v/Websites/jahoo.github.io/.gitignore`. Append a new line:
```
_deploy
```

Verify the file looks like:
```bash
cat .gitignore
```

Expected: gitignore ends with `_deploy` as the last line.

- [ ] **Step 3: Dry-test the Makefile syntax**

```bash
make -n deploy 2>&1 | head -20
```

Expected: prints the commands that would run without executing them. No syntax errors.

- [ ] **Step 4: Commit**

```bash
git add Makefile .gitignore
git commit -m "Phase 4: add make deploy target and gitignore _deploy/"
```

---

## Task 6: Update `CLAUDE.md`

Rewrite the Jekyll-era sections to reflect the Pandoc pipeline and `make deploy`.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the current `CLAUDE.md`**

```bash
cat CLAUDE.md
```

Note the existing sections and their Jekyll-specific wording. The sections to rewrite are: **Build & Serve**, **Deploy**, **Architecture**, **Citations**, **Conventions**.

- [ ] **Step 2: Rewrite the Build & Serve section**

Replace the existing section (which mentions Ruby/chruby/`bundle exec jekyll serve`) with:

```markdown
## Build & Serve

Requires Node 20+ and Pandoc.

```bash
make serve    # dev server at localhost:4000 (fswatch + esbuild --watch + browser-sync)
make -j4      # parallel build
make test     # JS tests via `npm test`
make clean    # remove _site/
```
```

- [ ] **Step 3: Rewrite the Deploy section**

Replace the section (currently about the GitHub Actions workflow) with:

```markdown
## Deploy

Run `make deploy` on the `source` branch. It builds the site and pushes `_site/` to the `static` branch via a git worktree under `_deploy/`. GitHub Pages serves from `static`.

The `source` and `static` branches have independent commit histories — do not merge between them. There's no CI; the build runs on your local machine, so `source.bib` (symlink to your Zotero-exported bib) is available during the build.

Precondition checks in `make deploy`:
- Working tree must be clean (uncommitted changes wouldn't ship).
- Current branch must be `source`.

The `source-jekyll-deprecated` branch on origin is a read-only archive of the pre-Pandoc Jekyll history; it never deploys.
```

- [ ] **Step 4: Rewrite the Architecture section**

Replace the "Jekyll academic site using jekyll-scholar..." paragraph with:

```markdown
## Architecture

Pandoc + Make + esbuild pipeline. Content markdown lives in `content/`, compiled by `scripts/build-content.sh` using `templates/base.html` and Lua filters in `filters/`. JS bundles are produced by esbuild from entry points at `src/*/index.js`.

**Homepage** (`_generated/index.md`, generated): `scripts/build-pubs.js` reads `pubs.yaml` (list of bib keys + website-specific extras) and `source.bib` (symlink to `~/all-biblatex.bib`), then composes `content/_about.md` + a bib-driven publications list into the homepage.

**Blog listing** (`_generated/posts.md`, generated): `scripts/build-index.lua` scans `content/posts/` and emits the listing page.

**Custom filter**: `filters/*.lua` (sidenotes, callouts, viz-mount points, mathjax-macros). Per-page MathJax macros come from JSON files referenced in front matter.

**Site config**: `site.yaml` (site title, nav, bib-source path).
```

- [ ] **Step 5: Delete the Citations section entirely**

The current `## Citations` section describes `bin/cite`, which is removed. Delete the whole section including its heading.

- [ ] **Step 6: Update the Conventions section**

Replace any mention of "push to source triggers deploy" with "run `make deploy` to deploy; `git push origin source` alone doesn't deploy — it just pushes source without touching `static`."

Keep the other conventions (no Co-Authored-By lines, let user review commit messages, etc.).

- [ ] **Step 7: Re-read the whole file and fix any remaining Jekyll crumbs**

```bash
grep -niE "jekyll|kramdown|bundle exec|_layouts|_includes|_sass|bin/cite|jekyll-scholar" CLAUDE.md
```

Expected: no matches (or at most matches in an explicit "history" paragraph you wrote intentionally).

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "Phase 4: rewrite CLAUDE.md for the Pandoc pipeline (no Jekyll, no CI)"
```

---

## Task 7: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

```bash
cat README.md
```

Note the paragraph mentioning `_layouts/exploration.html` and `assets/explorations-base.css`.

- [ ] **Step 2: Replace that paragraph**

Find the paragraph starting with `Interactive essays live in _explorations/` (or similar Jekyll-era wording). Replace it with a short description of the new pipeline:

```markdown
Content is authored as markdown in `content/`, built by Pandoc through the pipeline in `scripts/`. The publications list on the homepage is driven by `pubs.yaml` (a list of bib keys) + a local symlink `source.bib` that points at the user's BibLaTeX file. See `docs/authoring.md` for the full authoring guide.
```

- [ ] **Step 3: Add a Deploy paragraph**

If the README has a "Deploy" section or similar, update it. If not, add a short paragraph:

```markdown
### Deploy

`make deploy` on the `source` branch builds the site and pushes to the `static` branch; GitHub Pages serves from there. No CI — the build runs locally because `source.bib` (the user's bib symlink) isn't available on a runner.
```

- [ ] **Step 4: Verify no leftover Jekyll refs**

```bash
grep -niE "jekyll|kramdown|_layouts|_includes|_sass|bin/cite" README.md
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Phase 4: README — drop Jekyll paragraph, add deploy note"
```

---

## Task 8: Skim `docs/authoring.md` for Jekyll leftovers

**Files:**
- Possibly modify: `docs/authoring.md`

- [ ] **Step 1: Grep for Jekyll terms**

```bash
grep -niE "jekyll|kramdown|_layouts|_includes|_sass|bin/cite" docs/authoring.md
```

- [ ] **Step 2: If matches found, clean them up**

For each match, update the wording to reflect the Pandoc pipeline. If no matches, no action needed.

- [ ] **Step 3: Commit (only if changes were made)**

```bash
git add docs/authoring.md
git commit -m "Phase 4: docs/authoring — remove stray Jekyll references"
```

(Skip if step 1 yielded no matches.)

---

## Task 9: Final build verification

**No files modified — this is pure verification.**

- [ ] **Step 1: Full clean build**

```bash
trash _site && make 2>&1 | grep -v "ERROR: failed to copy trust" | tail -15
```

Expected: clean build, includes:
- `Generated: _generated/index.md (14 entries)`
- `Generated: assets/bibliography/pubs.bib (14 entries)`
- `Generated: _generated/posts.md (N entries)`
- `Build:` lines for each post and the homepage
- `Bundle: src/smc-resampling/index.js`
- `Assets synced`
- `Static HTML copied`

No errors.

- [ ] **Step 2: Run tests**

```bash
make test 2>&1 | grep -v "ERROR: failed to copy trust" | grep -E "(fail|pass|tests)" | tail -3
```

Expected: `pass` count > 0, `fail` = 0.

- [ ] **Step 3: Spot-check the rendered site**

```bash
ls _site/
grep -c 'pub-title' _site/index.html
ls _site/posts/ | wc -l
ls _site/assets/bibliography/pubs.bib
```

Expected: `_site/` has `index.html`, `posts/`, `assets/`, presentation directories. Homepage has 14 pub-titles. Posts count matches the listing. `pubs.bib` exists.

- [ ] **Step 4: Verify no Jekyll artifacts leaked into `_site/`**

```bash
find _site -name 'Gemfile*' -o -name '_config.yml' -o -name '*.scss' 2>&1 | head
```

Expected: no output (empty). Nothing Jekyll-shaped shipped.

If everything above checks out: no commit; proceed to Task 10.
If anything fails: debug, commit the fix, re-run Task 9.

---

## Task 10: Branch rename operations (user-driven)

This task must be performed by the user (requires GitHub UI access for the branch renames). It is included here as a checklist because the overall Phase 4 can't complete without it.

**Order matters.** Do not skip steps or reorder.

- [ ] **Step 1: Push all local commits to the remote first**

```bash
git push origin pandoc-migration
```

Expected: all Phase 4 commits now on origin.

- [ ] **Step 2: Rename `source` → `source-jekyll-deprecated` on GitHub**

Open the repo on GitHub. Go to: **branches** tab (or `https://github.com/<user>/<repo>/branches`). Find the `source` branch. Click the pencil/rename icon. Enter `source-jekyll-deprecated`. Confirm.

GitHub preserves refs and adds an automatic redirect from the old name. Pages is not served from `source`, so this has no deploy impact.

- [ ] **Step 3: Rename `master` → `static` on GitHub**

Same flow. Find `master`. Rename to `static`.

GitHub will auto-update the "Source" under **Settings → Pages** to point at `static`. Verify at **Settings → Pages** that the source branch is now `static`.

- [ ] **Step 4: Rename `pandoc-migration` → `source` on GitHub**

Same flow. Find `pandoc-migration`. Rename to `source`.

Verify on the branches page that the three branches now named: `source`, `static`, `source-jekyll-deprecated`.

- [ ] **Step 5: Sync local branches to match**

```bash
git fetch --prune
git branch -m pandoc-migration source
git branch -m master static 2>/dev/null || true  # only if you have a local master
git branch -D source 2>/dev/null || true         # delete old local source if present
git branch --set-upstream-to=origin/source source
```

Verify:
```bash
git branch -vv
```

Expected: `source` tracks `origin/source`, `static` tracks `origin/static` (if you kept a local copy).

- [ ] **Step 6: Verify GitHub Pages is still serving**

Open the site URL (`https://jahoo.github.io`). It should load from the `static` branch's current content (which is the pre-Phase-4 Jekyll build until the first `make deploy` runs in Task 11). That's expected — Pages keeps serving the old content until new content is pushed.

No commit for this task — it's all remote-state changes.

---

## Task 11: First `make deploy` (user-driven)

Pushes the first real Pandoc-built deploy to `static`.

- [ ] **Step 1: Ensure clean working tree on source**

```bash
git status --short
```

Expected: empty output. If there are uncommitted changes, commit or stash them first.

- [ ] **Step 2: Run the deploy**

```bash
make deploy
```

Expected output (in order):
- `make clean` output → `make all` output (full build)
- Commands from `git push origin source` → `Everything up-to-date` (if already pushed) or new push output
- `Preparing worktree (new working tree)` etc. from `git worktree add`
- rsync silent
- `git commit ... -m "Deploy <sha>"` (or `static: no changes to deploy`)
- Final `git worktree remove _deploy`

No errors. `_deploy/` directory should not exist after the command finishes.

- [ ] **Step 3: Verify the site updated**

Open `https://jahoo.github.io`. It should show the Pandoc-rendered homepage (about + publications, no post-title, new nav, etc.). GitHub Pages may take ~1 minute to pick up the push.

- [ ] **Step 4: Verify no trailing `_deploy/` or leftover state**

```bash
git worktree list
ls _deploy 2>&1
```

Expected: `git worktree list` shows only the main worktree. `ls _deploy` shows "No such file or directory".

If anything looks off: report and we'll fix before declaring Phase 4 done.

---

## Spec coverage check

| Spec section | Tasks |
|---|---|
| Branch operations (source → deprecated, master → static, pandoc-migration → source) | 10 |
| Jekyll scaffolding deletions (Gemfile, _config.yml, _layouts, _includes, _sass, _plugins, _bibliography) | 2 |
| Migrated content deletions (_posts, _explorations/smc-resampling.md, index.md, pubs.md) | 3 |
| bin/cite removal | 4 |
| CI workflow deletion | 4 |
| `make deploy` target + `.gitignore` | 5 |
| `interactive-divergence-fitting.html` relocation + external: update | 1 |
| CLAUDE.md updates | 6 |
| README.md updates | 7 |
| docs/authoring.md skim | 8 |
| Final build verification | 9 |
| First deploy to test end-to-end | 11 |

No gaps.
