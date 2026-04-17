PANDOC     := pandoc
ESBUILD    := npx esbuild
OUTDIR     := _site

# ---- JS ----
JS_ENTRIES := $(wildcard src/*/index.js)
JS_BUNDLES := $(patsubst src/%/index.js,$(OUTDIR)/assets/js/%.bundle.js,$(JS_ENTRIES))

# ---- Static assets ----
STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography \
               assets/CV assets/frozen assets/pdfs assets/rejection-sampling-expo \
               assets/simplest_linear_regression_example assets/smc-resampling \
               assets/transform-pdf assets/2022-01-25-MCQLL-talk

ROOT_HTML   := interactive-divergence-fitting.html interactive-kl-fitting.html
PRESENTATION_DIRS := $(wildcard 20[0-9][0-9]-*/)

.PHONY: all clean content js assets static-html serve test generate pubs deploy

all: generate content js assets static-html

# ---- Generate listing + publications ----
generate: pubs
	@pandoc lua scripts/build-index.lua

pubs:
	@node scripts/build-pubs.js

# ---- Content compilation (delegates to script for date-stripping + external files) ----
content:
	@bash scripts/build-content.sh

# ---- JS bundling ----
js: $(JS_BUNDLES)

$(OUTDIR)/assets/js/%.bundle.js: src/%/index.js $(shell find src/lib -name '*.js' 2>/dev/null)
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
	@node --test 'test/**/*.test.js'

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
	@rsync -a --delete --exclude='.git' _site/ _deploy/
	@cd _deploy && git add -A && \
	  ( git diff --cached --quiet && echo "static: no changes to deploy" || \
	    ( git commit -m "Deploy $$(cd .. && git rev-parse --short HEAD)" && \
	      git push origin static ) )
	@git worktree remove _deploy
