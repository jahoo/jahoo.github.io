#!/usr/bin/env bash
set -euo pipefail

FSWATCH=/opt/homebrew/bin/fswatch

# Collect background PIDs for cleanup
PIDS=()

cleanup() {
    echo ""
    echo "Shutting down..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM

# Initial full build
echo "Building site..."
make -j4 2>&1 | grep -v '^make\[' || true
echo "Build complete."

# 1. browser-sync: serve _site/ with live reload
npx browser-sync start \
    --server _site \
    --files "_site/**/*" \
    --no-ui \
    --no-notify \
    --port 4000 \
    2>/dev/null &
PIDS+=($!)

# 2. esbuild watcher: rebundle JS on source changes
npx esbuild src/*/index.js \
    --bundle \
    --outdir=_site/assets/js \
    --out-extension:.js=.bundle.js \
    --watch \
    2>&1 | grep -v 'certificate\|SSL\|https://' &
PIDS+=($!)

# 3. Content/asset watcher using fswatch
"$FSWATCH" -r --event Updated \
    content/ filters/ templates/ assets/css/ assets/fonts/ \
    2>/dev/null \
| while IFS= read -r changed; do
    case "$changed" in
        *.md)
            # Derive the make target from the file path
            rel="${changed#$(pwd)/}"
            target="_site/$(echo "$rel" | sed 's|^content/||; s|\.md$|.html|')"
            echo "Content changed: $rel -> building $target"
            make "$target" 2>&1 | grep -v '^make\[' || true
            ;;
        *.lua|*.html)
            echo "Template/filter changed: $changed -> rebuilding all content"
            make content 2>&1 | grep -v '^make\[' || true
            ;;
        *.css|*.woff|*.woff2|*.ttf|*.otf|*.eot)
            echo "Asset changed: $changed -> syncing assets"
            make assets 2>&1 | grep -v '^make\[' || true
            ;;
    esac
done &
PIDS+=($!)

echo ""
echo "Dev server running at http://localhost:4000"
echo "Watching: content/, filters/, templates/, assets/css/, assets/fonts/"
echo "Press Ctrl+C to stop."
echo ""

# Wait for all background processes
wait
