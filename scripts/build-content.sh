#!/bin/bash
# Build all content from content/posts/ and content/*.md into _site/
# Handles: date-stripping from URLs, external HTML files, root pages.
#
# Usage: bash scripts/build-content.sh

set -e

OUTDIR="_site"
PANDOC_COMMON="--standalone \
  --metadata-file site.yaml \
  --template assets/vendor/pandoc-markdown-css-theme/template.html5 \
  --include-before-body templates/navbar.html \
  --section-divs --mathjax --citeproc \
  --csl assets/bibliography/apa.csl"
FILTER_FLAGS=""
for f in filters/*.lua; do
  [ -f "$f" ] && FILTER_FLAGS="$FILTER_FLAGS --lua-filter $f"
done
FILTER_FLAGS="$FILTER_FLAGS --lua-filter assets/vendor/pandoc-markdown-css-theme/pandoc-sidenote.lua"

# Strip YYYY-MM-DD- prefix from a filename
strip_date() {
  echo "$1" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//'
}

# Build a single markdown file to an output path
build_one() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  local lastmod
  lastmod=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$src" 2>/dev/null || date -r "$src" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "")
  local extra_flags=""
  head -30 "$src" | grep -q '^toc: *true' && extra_flags="--toc"
  echo "Build: $src"
  pandoc "$src" $PANDOC_COMMON $FILTER_FLAGS $extra_flags --metadata last-modified="$lastmod" -o "$dest"
}

# ---- Blog posts (content/posts/*.md) ----
for src in content/posts/*.md; do
  [ -f "$src" ] || continue
  basename=$(basename "$src" .md)
  slug=$(strip_date "$basename")
  dest="$OUTDIR/posts/$slug/index.html"

  # Check if source is newer than destination
  if [ "$src" -nt "$dest" ] || [ assets/vendor/pandoc-markdown-css-theme/template.html5 -nt "$dest" ] || [ templates/navbar.html -nt "$dest" ] || [ site.yaml -nt "$dest" ]; then
    build_one "$src" "$dest"
  fi

  # Check for external field — if present, copy the external file over index.html
  external=$(grep '^external:' "$src" 2>/dev/null | sed 's/^external: *//' | tr -d '"'"'" || true)
  if [ -n "$external" ] && [ -f "$external" ]; then
    # Strip Jekyll front matter (--- delimited) if present
    if head -1 "$external" | grep -q '^---$'; then
      awk 'BEGIN{n=0} /^---$/{n++;next} n>=2{print}' "$external" > "$dest"
    else
      cp "$external" "$dest"
    fi
    echo "External: $external → $dest"
  fi
done

# ---- Root pages ----
# Pages with basename starting with `_` are partials consumed by other build
# steps (e.g. content/_about.md is read by build-pubs.js into the homepage);
# they aren't built as standalone pages.
for src in content/*.md; do
  [ -f "$src" ] || continue
  basename=$(basename "$src" .md)
  case "$basename" in _*) continue ;; esac
  dest="$OUTDIR/$basename/index.html"
  if [ "$src" -nt "$dest" ] || [ assets/vendor/pandoc-markdown-css-theme/template.html5 -nt "$dest" ] || [ templates/navbar.html -nt "$dest" ]; then
    build_one "$src" "$dest"
  fi
done

# ---- Generated pages (_generated/*.md) ----
# Special case: _generated/index.md is the homepage; it goes to _site/index.html
# directly (no index/ subdirectory). Everything else follows the usual pattern.
for src in _generated/*.md; do
  [ -f "$src" ] || continue
  basename=$(basename "$src" .md)
  if [ "$basename" = "index" ]; then
    dest="$OUTDIR/index.html"
  else
    dest="$OUTDIR/$basename/index.html"
  fi
  if [ "$src" -nt "$dest" ] || [ assets/vendor/pandoc-markdown-css-theme/template.html5 -nt "$dest" ] || [ templates/navbar.html -nt "$dest" ]; then
    build_one "$src" "$dest"
  fi
done
