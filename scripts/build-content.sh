#!/bin/bash
# Build all content from content/posts/ and content/*.md into _site/
# Handles: date-stripping from URLs, external HTML files, root pages.
#
# Usage: bash scripts/build-content.sh

set -e

OUTDIR="_site"
PANDOC_COMMON="--standalone \
  --metadata-file site.yaml \
  --from markdown+tex_math_single_backslash \
  --template assets/vendor/pandoc-markdown-css-theme/template.html5 \
  --include-before-body templates/navbar.html \
  --section-divs --number-sections --mathjax \
  --filter pandoc-crossref --citeproc \
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

# Per-page front-matter dependencies: a page embeds its mathjax-macros
# JSON (injected into the head by the template) and resolves citations
# against its bibliography at build time, so it must rebuild when either
# file changes — not only when the markdown does.
deps_newer() {
  local src="$1" dest="$2" dep
  for dep in $(head -30 "$src" | sed -nE 's/^(mathjax-macros|bibliography): *//p' | tr -d '"'"'"); do
    [ -f "$dep" ] && [ "$dep" -nt "$dest" ] && return 0
  done
  return 1
}

# Build a single markdown file to an output path
build_one() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  local lastmod
  lastmod=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$src" 2>/dev/null || date -r "$src" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "")
  local extra_flags=""
  head -30 "$src" | grep -q '^toc: *true' && extra_flags="$extra_flags --toc"
  # A post generated from a sibling .qmd offers that source for download, so a
  # reader can re-run the code. Detected from the file system rather than from
  # front matter, so it needs no marker in the document and works for any
  # notebook-backed post automatically. The .qmd itself is copied beside the
  # page further down.
  local qmd_src="${src%.md}.qmd"
  [ -f "$qmd_src" ] && \
    extra_flags="$extra_flags --metadata qmd-source=$(basename "$qmd_src")"
  # `shift-headings: true` promotes every heading one level (h2 -> h1).
  # Quarto documents idiomatically start their sections at `##`, because the
  # title occupies the `h1`; this site starts them at `#`. Without the shift,
  # citeproc's own `# References` makes pandoc treat h1 as the document's top
  # level, so h2 sections number from zero ("0.1 Definitions").
  head -30 "$src" | grep -q '^shift-headings: *true' && \
    extra_flags="$extra_flags --shift-heading-level-by=-1"
  # `unlisted: true` keeps a post out of the blog listing (see build-index.lua);
  # the noindex header keeps it out of search results, so the URL is
  # shareable-by-link without the page becoming publicly discoverable.
  head -30 "$src" | grep -q '^unlisted: *true' && \
    extra_flags="$extra_flags --include-in-header templates/noindex.html"
  # `redirect-to: /some/url/` turns the page into a redirect stub. Written as a
  # generated --include-in-header rather than a `header-includes:` field in the
  # document, because --include-in-header *sets* the header-includes template
  # variable and so silently displaces any front-matter value — which is easy to
  # hit here, since `unlisted: true` already adds one for the noindex header.
  # Repeated --include-in-header flags accumulate, so both survive.
  local redirect_to
  redirect_to=$(head -30 "$src" | sed -nE 's/^redirect-to: *//p' | tr -d '"'"'")
  if [ -n "$redirect_to" ]; then
    mkdir -p _build
    local rfile="_build/redirect-$(basename "$src" .md).html"
    printf '<meta http-equiv="refresh" content="0; url=%s">\n<link rel="canonical" href="%s">\n' \
      "$redirect_to" "$redirect_to" > "$rfile"
    extra_flags="$extra_flags --include-in-header $rfile"
  fi
  # `standalone-page: true` (intended for unlisted posts) drops the site
  # navbar so the page doesn't visibly link back to the site; the template
  # gates the include-before block on it.
  if head -30 "$src" | grep -q '^standalone-page: *true' && \
     ! head -30 "$src" | grep -q '^unlisted: *true'; then
    echo "Warning: $src has standalone-page: true without unlisted: true" >&2
  fi
  echo "Build: $src"
  pandoc "$src" $PANDOC_COMMON $FILTER_FLAGS $extra_flags --metadata last-modified="$lastmod" -o "$dest"
}

# ---- Blog posts (content/posts/*.md) ----
for src in content/posts/*.md; do
  [ -f "$src" ] || continue
  basename=$(basename "$src" .md)
  # Quarto writes its pre-pandoc intermediate as <name>.markdown.md next to the
  # .qmd. A failed render can leave one behind; it must never build as a post.
  case "$basename" in *.markdown) continue ;; esac
  slug=$(strip_date "$basename")
  dest="$OUTDIR/posts/$slug/index.html"

  # Check if source (or a per-page dependency) is newer than destination
  if [ "$src" -nt "$dest" ] || [ assets/vendor/pandoc-markdown-css-theme/template.html5 -nt "$dest" ] || [ templates/navbar.html -nt "$dest" ] || [ site.yaml -nt "$dest" ] || deps_newer "$src" "$dest"; then
    build_one "$src" "$dest"
  fi

  # Publish the .qmd source beside the page it generated, for the download link
  # added in build_one. Done outside the staleness check so a `make clean`
  # rebuild restores it even when the page itself is up to date.
  if [ -f "${src%.md}.qmd" ]; then
    mkdir -p "$(dirname "$dest")"
    cp "${src%.md}.qmd" "$(dirname "$dest")/"
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
  if [ "$src" -nt "$dest" ] || [ assets/vendor/pandoc-markdown-css-theme/template.html5 -nt "$dest" ] || [ templates/navbar.html -nt "$dest" ] || deps_newer "$src" "$dest"; then
    build_one "$src" "$dest"
  fi
done

# ---- Generated pages (_generated/*.md) ----
# Special case: _generated/index.md is the homepage; it goes to _site/index.html
# directly (no index/ subdirectory). Everything else follows the usual pattern.
# `_`-prefixed files are partials consumed by other build steps (e.g.
# _generated/_pub-list.md is spliced into the homepage by expand-includes.js),
# not standalone pages.
for src in _generated/*.md; do
  [ -f "$src" ] || continue
  basename=$(basename "$src" .md)
  case "$basename" in _*) continue ;; esac
  if [ "$basename" = "index" ]; then
    dest="$OUTDIR/index.html"
  else
    dest="$OUTDIR/$basename/index.html"
  fi
  if [ "$src" -nt "$dest" ] || [ assets/vendor/pandoc-markdown-css-theme/template.html5 -nt "$dest" ] || [ templates/navbar.html -nt "$dest" ] || deps_newer "$src" "$dest"; then
    build_one "$src" "$dest"
  fi
done
