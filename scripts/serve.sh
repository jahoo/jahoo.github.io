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
make 2>&1 | grep -v '^make\[' || true
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
    content/ filters/ templates/ assets/css/ assets/fonts/ site.yaml \
    2>/dev/null \
| while IFS= read -r changed; do
    case "$changed" in
        *.md)
            rel="${changed#$(pwd)/}"
            echo "Content changed: $rel"
            # Rebuild listing + all content (build-content.sh is incremental)
            pandoc lua scripts/build-index.lua 2>/dev/null || true
            bash scripts/build-content.sh 2>&1 || true
            ;;
        *.lua|*.html|*site.yaml)
            echo "Template/filter/config changed — rebuilding all content"
            bash scripts/build-content.sh 2>&1 || true
            ;;
        *.css|*.woff|*.woff2|*.ttf|*.otf|*.eot)
            echo "Asset changed — syncing"
            make assets 2>&1 | grep -v '^make\[' || true
            ;;
    esac
done &
PIDS+=($!)

echo ""
echo "Dev server running at http://localhost:4000"
echo "Watching: content/, filters/, templates/, assets/css/, assets/fonts/, site.yaml"
echo "Press Ctrl+C to stop."
echo ""

# Wait for all background processes
wait
