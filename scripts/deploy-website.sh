#!/usr/bin/env bash
# deploy-website.sh
# Builds the frontend and deploys it to Cloudflare Pages.
#
# Env:
#   SKIP_BUILD=1         deploy the existing dist/ without rebuilding
#   INSECURE_TLS=1       disable Node TLS verification (only for broken corporate/WARP proxies)
#   NODE_FALLBACK_CMD    node binary to run wrangler with (default: ~/.node-fallback/bin/node, then PATH)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Starting deployment to Cloudflare Pages..."

if [ "${INSECURE_TLS:-0}" = "1" ]; then
    echo "⚠️  INSECURE_TLS=1: TLS certificate verification is DISABLED for this run."
    export NODE_TLS_REJECT_UNAUTHORIZED=0
fi

WRANGLER_BIN="$PROJECT_ROOT/node_modules/.bin/wrangler"
if [ -x "$WRANGLER_BIN" ]; then
    NODE_CMD="${NODE_FALLBACK_CMD:-$HOME/.node-fallback/bin/node}"
    if [ ! -x "$NODE_CMD" ]; then
        NODE_CMD="$(command -v node || true)"
    fi
    if [ -n "$NODE_CMD" ]; then
        WRANGLER_CMD=("$NODE_CMD" "$WRANGLER_BIN")
    else
        WRANGLER_CMD=("$WRANGLER_BIN")
    fi
elif command -v bunx >/dev/null 2>&1; then
    WRANGLER_CMD=(bunx wrangler)
else
    echo "❌ Error: wrangler not found. Install it (bun add -d wrangler) or install bun."
    exit 1
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo "🔨 Building..."
    bun run build
fi

if [ ! -f dist/index.html ]; then
    echo "❌ Error: dist/index.html not found. Run the build first."
    exit 1
fi

echo "📦 Deploying dist/ to Cloudflare Pages..."
"${WRANGLER_CMD[@]}" pages deploy dist --project-name jatimetri

echo "✅ Website deployment completed successfully!"
