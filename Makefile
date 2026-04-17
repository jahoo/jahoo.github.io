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

.PHONY: all clean content js assets static-html serve test generate pubs

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
	@echo "Static HTML copied"

serve:
	@bash scripts/serve.sh

test:
	@node --test 'test/**/*.test.js'

clean:
	@if [ -d "$(OUTDIR)" ]; then trash "$(OUTDIR)"; fi
