PANDOC     := pandoc
ESBUILD    := npx esbuild
OUTDIR     := _site

PANDOC_COMMON := --standalone \
    --metadata-file site.yaml \
    --template templates/base.html \
    --section-divs \
    --mathjax \
    --citeproc \
    --csl assets/bibliography/apa.csl

FILTERS := $(wildcard filters/*.lua)
FILTER_FLAGS := $(foreach f,$(FILTERS),--lua-filter $(f))

# ---- Content sources ----

# Blog posts and explorations: content/blog/*.md → _site/blog/<slug>/index.html
BLOG_SOURCES := $(wildcard content/blog/*.md)
BLOG_TARGETS := $(patsubst content/blog/%.md,$(OUTDIR)/blog/%/index.html,$(BLOG_SOURCES))

# Root pages: content/index.md → _site/index.html, content/pubs.md → _site/pubs/index.html
ROOT_PAGES := $(filter-out content/index.md,$(wildcard content/*.md))
ROOT_TARGETS := $(OUTDIR)/index.html $(patsubst content/%.md,$(OUTDIR)/%/index.html,$(ROOT_PAGES))

# Generated pages: _generated/blog.md → _site/blog/index.html
GEN_SOURCES := $(wildcard _generated/*.md)
GEN_TARGETS := $(patsubst _generated/%.md,$(OUTDIR)/%/index.html,$(GEN_SOURCES))

HTML_TARGETS := $(BLOG_TARGETS) $(ROOT_TARGETS) $(GEN_TARGETS)

# ---- JS ----
JS_ENTRIES := $(wildcard src/*/index.js)
JS_BUNDLES := $(patsubst src/%/index.js,$(OUTDIR)/assets/js/%.bundle.js,$(JS_ENTRIES))

# ---- Static assets ----
STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography \
               assets/CV assets/frozen assets/pdfs assets/rejection-sampling-expo \
               assets/simplest_linear_regression_example assets/smc-resampling \
               assets/transform-pdf assets/2022-01-25-MCQLL-talk

# Standalone HTML files
STATIC_HTML := _explorations/interactive-divergence-fitting.html
ROOT_HTML   := interactive-divergence-fitting.html interactive-kl-fitting.html
PRESENTATION_DIRS := $(wildcard 20[0-9][0-9]-*/)

.PHONY: all clean content js assets static-html serve test generate _build

all: generate
	@$(MAKE) _build

_build: content js assets static-html

# ---- Generate listing ----
generate: _generated/blog.md

_generated/blog.md: scripts/build-index.lua $(BLOG_SOURCES)
	@mkdir -p _generated
	@pandoc lua $<

# ---- Content compilation ----
content: $(HTML_TARGETS)

# Blog posts: content/blog/slug.md → _site/blog/slug/index.html
$(OUTDIR)/blog/%/index.html: content/blog/%.md templates/base.html site.yaml $(FILTERS)
	@mkdir -p $(dir $@)
	@echo "Build: $<"
	@$(PANDOC) $< $(PANDOC_COMMON) $(FILTER_FLAGS) -o $@

# Root index: content/index.md → _site/index.html (not /index/index.html)
$(OUTDIR)/index.html: content/index.md templates/base.html site.yaml $(FILTERS)
	@mkdir -p $(dir $@)
	@echo "Build: $<"
	@$(PANDOC) $< $(PANDOC_COMMON) $(FILTER_FLAGS) -o $@

# Other root pages: content/pubs.md → _site/pubs/index.html
$(OUTDIR)/%/index.html: content/%.md templates/base.html site.yaml $(FILTERS)
	@mkdir -p $(dir $@)
	@echo "Build: $<"
	@$(PANDOC) $< $(PANDOC_COMMON) $(FILTER_FLAGS) -o $@

# Generated pages: _generated/blog.md → _site/blog/index.html
$(OUTDIR)/%/index.html: _generated/%.md templates/base.html site.yaml $(FILTERS)
	@mkdir -p $(dir $@)
	@echo "Build: $<"
	@$(PANDOC) $< $(PANDOC_COMMON) $(FILTER_FLAGS) -o $@

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
	@mkdir -p $(OUTDIR)/explorations $(OUTDIR)/blog/2026-04-02-interactive-divergence-fitting
	@for f in $(STATIC_HTML); do \
		awk 'BEGIN{n=0} /^---$$/{n++;next} n>=2{print}' "$$f" > "$(OUTDIR)/explorations/$$(basename $$f)"; \
		awk 'BEGIN{n=0} /^---$$/{n++;next} n>=2{print}' "$$f" > "$(OUTDIR)/blog/2026-04-02-interactive-divergence-fitting/raw.html"; \
	done
	@for f in $(ROOT_HTML); do cp "$$f" "$(OUTDIR)/$$f"; done
	@for d in $(PRESENTATION_DIRS); do \
		mkdir -p "$(OUTDIR)/$$d" && \
		rsync -a --quiet "$$d/" "$(OUTDIR)/$$d/"; \
	done
	@echo "Static HTML copied"

serve:
	@bash scripts/serve.sh

test:
	@node --test test/**/*.test.js

clean:
	@if [ -d "$(OUTDIR)" ]; then trash "$(OUTDIR)"; fi
