# Delete a recipe's target if the recipe fails partway through. Without this,
# a target built via shell redirection (`... > $@`) that fails after the shell
# has already created/truncated $@ leaves a stale (empty or partial) file
# behind — and since it's newer than its prerequisites, `make` then considers
# it up to date and won't try rebuilding it on the next run.
.DELETE_ON_ERROR:

PANDOC     := pandoc
ESBUILD    := npx esbuild
OUTDIR     := _site

# ---- JS ----
JS_ENTRIES := $(wildcard src/*/index.js)
JS_BUNDLES := $(patsubst src/%/index.js,$(OUTDIR)/assets/js/%.bundle.js,$(JS_ENTRIES))

# ---- Static assets ----
STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography \
               assets/CV assets/frozen assets/pdfs assets/rejection-sampling-expo \
               assets/rejection-sampling assets/simplest_linear_regression_example \
               assets/smc-resampling \
               assets/transform-pdf assets/2022-01-25-MCQLL-talk \
               assets/vendor

ROOT_HTML   := interactive-divergence-fitting.html interactive-kl-fitting.html
PRESENTATION_DIRS := $(wildcard 20[0-9][0-9]-*/)

.PHONY: all clean content js assets static-html serve test generate pubs homepage posts-index deploy notebooks

all: generate content js assets static-html

# ---- Generate listing + publications + homepage ----
generate: homepage posts-index

# bib-driven pub list → _generated/_pub-list.md (partial)
pubs:
	@node scripts/build-pubs.js

# splice @cat/@paste includes in content/_index.md → _generated/index.md
homepage: pubs
	@node scripts/expand-includes.js content/_index.md _generated/index.md

# blog listing → _generated/posts.md
posts-index:
	@pandoc lua scripts/build-index.lua

# ---- Content compilation (delegates to script for date-stripping + external files) ----
content:
	@bash scripts/build-content.sh

# ---- Notebook-backed posts (on demand; NOT part of `all`) ----
# Quarto is used purely as a Julia execution engine here: it runs the code
# cells, the cells write their SVGs to assets/ via savefig, and the prose is
# passed through verbatim for the normal pandoc build to compile. Requires
# Quarto + the julia-1.10 Jupyter kernel; a plain `make` never invokes it.
NB_QMD := content/posts/2022-08-29-rejection-sampling.qmd
NB_MD  := content/posts/2022-08-29-rejection-sampling.md
# Quarto names its default output after the input file's basename; that's
# where --output-dir puts it (--output-dir is resolved relative to the input
# file's directory, confirmed against Quarto 1.8.26: from content/posts/,
# ../../_build lands at the repo-root _build/). We deliberately don't pass
# `-o <name>` to rename it: combining -o with --output-dir on a freestanding
# (non-project) markdown render is bugged in 1.8.26 — it silently writes one
# directory too high and drops the --output-dir path entirely. Consuming the
# default-named file instead sidesteps that.
NB_RAW := _build/$(notdir $(NB_QMD:.qmd=.md))

notebooks: $(NB_MD)

$(NB_MD): $(NB_QMD) scripts/qmd-frontmatter.js
	@mkdir -p _build assets/rejection-sampling
	@echo "Render (quarto + julia): $<"
	@quarto render $< --to markdown --execute --output-dir ../../_build
	@node scripts/qmd-frontmatter.js $(NB_RAW) $(NB_QMD) > $@
	@echo "Generated: $@"

# ---- JS bundling ----
js: $(JS_BUNDLES)

$(OUTDIR)/assets/js/%.bundle.js: src/%/index.js $(shell find src -name '*.js' ! -name '*.test.js' 2>/dev/null)
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
	@mkdir -p $(OUTDIR)/assets
	@rsync -a --quiet --include='*.*' --exclude='*/' assets/ $(OUTDIR)/assets/
	@echo "Assets synced"

static-html:
	@for f in $(ROOT_HTML); do cp "$$f" "$(OUTDIR)/$$f" 2>/dev/null || true; done
	@for d in $(PRESENTATION_DIRS); do \
		mkdir -p "$(OUTDIR)/$$d" && \
		rsync -a --quiet "$$d/" "$(OUTDIR)/$$d/"; \
	done
	@touch $(OUTDIR)/.nojekyll
	@echo "Static HTML copied"

serve:
	@bash scripts/serve.sh

test:
	@node --test 'src/**/*.test.js' 'test/**/*.test.js'

clean:
	@if [ -d "$(OUTDIR)" ]; then trash "$(OUTDIR)"; fi

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
deploy:
	@git diff --quiet && git diff --cached --quiet || \
	  { echo "error: uncommitted changes on $$(git branch --show-current); commit or stash first"; exit 1; }
	@[ "$$(git branch --show-current)" = "source" ] || \
	  { echo "error: must be on 'source' branch (currently on $$(git branch --show-current))"; exit 1; }
	@$(MAKE) clean all
	@git push origin source
	@git worktree add _deploy static 2>/dev/null || \
	  { echo "error: _deploy worktree already exists; run 'git worktree remove _deploy' first"; exit 1; }
	@rsync -a --delete --exclude='.git' \
	       --exclude='kitchen-sink' \
	       --exclude='assets/vendor/pandoc-markdown-css-theme/img' \
	       _site/ _deploy/
	@cd _deploy && git add -A && \
	  ( git diff --cached --quiet && echo "static: no changes to deploy" || \
	    ( git commit -m "Deploy $$(cd .. && git rev-parse --short HEAD)" && \
	      git push origin static ) )
	@git worktree remove _deploy
