#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# build-api-lambda.sh — packages apps/api into a Lambda-ready zip.
#
# Strategy: esbuild bundles the entire monorepo (incl. workspace deps) into
# a single CJS file. Output: infra/terraform/builds/api-lambda.zip.
#
# Usage:
#   ./infra/terraform/scripts/build-api-lambda.sh
#
# Requires: pnpm, node 20+, npx (for esbuild auto-fetch).
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
BUILD_DIR="$REPO_ROOT/infra/terraform/builds"
ZIP_PATH="$BUILD_DIR/api-lambda.zip"

mkdir -p "$BUILD_DIR"

echo "==> [1/3] Building @nexus-aec/api (and workspace deps via Turbo)..."
cd "$REPO_ROOT"
pnpm --filter @nexus-aec/api... build

echo "==> [2/3] Bundling with esbuild (single CJS, includes workspace deps)..."
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

cd "$API_DIR"
npx --yes esbuild@0.25.0 dist/lambda.js \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$STAGING/lambda.cjs" \
  --external:@aws-sdk/* \
  --external:aws-sdk \
  --legal-comments=none \
  --log-level=warning

BUNDLE_SIZE=$(du -sh "$STAGING/lambda.cjs" | cut -f1)
echo "    bundle size: $BUNDLE_SIZE"

echo "==> [3/3] Creating zip..."
rm -f "$ZIP_PATH"
( cd "$STAGING" && zip -q "$ZIP_PATH" lambda.cjs )

ZIP_SIZE=$(du -sh "$ZIP_PATH" | cut -f1)
echo ""
echo "✓ Built: $ZIP_PATH ($ZIP_SIZE)"
echo "  Lambda handler: lambda.handler"
echo ""
echo "Next: cd infra/terraform/envs/prod && terraform plan -out=api.tfplan"
