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

MD_SOURCES := $(shell find content -name '*.md' -type f)
HTML_TARGETS := $(patsubst content/%.md,$(OUTDIR)/%.html,$(MD_SOURCES))

JS_ENTRIES := $(wildcard src/*/index.js)
JS_BUNDLES := $(patsubst src/%/index.js,$(OUTDIR)/assets/js/%.bundle.js,$(JS_ENTRIES))

STATIC_DIRS := assets/css assets/js assets/fonts assets/images assets/bibliography assets/CV

.PHONY: all clean content js assets serve test

all: content js assets

content: $(HTML_TARGETS)

$(OUTDIR)/%.html: content/%.md templates/base.html site.yaml $(FILTERS)
	@mkdir -p $(dir $@)
	@echo "Build: $<"
	@$(PANDOC) $< $(PANDOC_COMMON) $(FILTER_FLAGS) -o $@

js: $(JS_BUNDLES)

$(OUTDIR)/assets/js/%.bundle.js: src/%/index.js $(shell find src/lib -name '*.js' 2>/dev/null)
	@mkdir -p $(dir $@)
	@echo "Bundle: $<"
	@$(ESBUILD) $< --bundle --outfile=$@

assets:
	@for dir in $(STATIC_DIRS); do \
		if [ -d "$$dir" ]; then \
			mkdir -p $(OUTDIR)/$$dir && \
			rsync -a --quiet $$dir/ $(OUTDIR)/$$dir/; \
		fi; \
	done
	@echo "Assets synced"

serve:
	@bash scripts/serve.sh

test:
	@node --test test/**/*.test.js

clean:
	@if [ -d "$(OUTDIR)" ]; then trash "$(OUTDIR)"; fi
