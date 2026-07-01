#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# build-agent-image.sh — builds the LiveKit agent Docker image and pushes
# to ECR.
#
# Builds for linux/amd64 (EC2 t3.small architecture). On Apple Silicon Macs
# this requires Docker Desktop with buildx (default since 2022).
#
# Usage:
#   ./infra/terraform/scripts/build-agent-image.sh           # tag: latest
#   ./infra/terraform/scripts/build-agent-image.sh v1.2.3    # custom tag
#
# Env overrides:
#   AWS_PROFILE   — default: nexusAEC-prod
#   AWS_REGION    — default: us-east-1
#   ECR_REGISTRY  — default: 843792057554.dkr.ecr.us-east-1.amazonaws.com
#   ECR_REPO      — default: nexus-aec-prod-agent
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TAG="${1:-latest}"

AWS_PROFILE="${AWS_PROFILE:-nexusAEC-prod}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REGISTRY="${ECR_REGISTRY:-843792057554.dkr.ecr.us-east-1.amazonaws.com}"
ECR_REPO="${ECR_REPO:-nexus-aec-prod-agent}"
DOCKERFILE="$REPO_ROOT/packages/livekit-agent/Dockerfile"

# Preflight checks
if ! command -v docker > /dev/null 2>&1; then
  echo "✗ docker not found. Install Docker Desktop: https://docs.docker.com/desktop/install/mac-install/"
  exit 1
fi

if ! docker buildx version > /dev/null 2>&1; then
  echo "✗ docker buildx not found. Update Docker Desktop (buildx is bundled since 2022)."
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  echo "✗ Docker daemon not running. Start Docker Desktop."
  exit 1
fi

if [ ! -f "$DOCKERFILE" ]; then
  echo "✗ Dockerfile not found at $DOCKERFILE"
  exit 1
fi

echo "==> [1/2] Logging in to ECR ($ECR_REGISTRY)..."
aws ecr get-login-password --region "$AWS_REGION" --profile "$AWS_PROFILE" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo ""
echo "==> [2/2] Building & pushing $ECR_REPO:$TAG (linux/amd64)..."
cd "$REPO_ROOT"
docker buildx build \
  --platform linux/amd64 \
  --tag "$ECR_REGISTRY/$ECR_REPO:$TAG" \
  --file "$DOCKERFILE" \
  --push \
  .

echo ""
echo "✓ Pushed: $ECR_REGISTRY/$ECR_REPO:$TAG"
echo ""
echo "Next steps:"
echo "  - First deploy:  cd infra/terraform/envs/prod && terraform plan -out=agent.tfplan && terraform apply agent.tfplan"
echo "  - Code update:   re-run this script, then SSM into the instance and run:"
echo "                     sudo docker pull $ECR_REGISTRY/$ECR_REPO:$TAG && sudo docker restart nexus-agent"
