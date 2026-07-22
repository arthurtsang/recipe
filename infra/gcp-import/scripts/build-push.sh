#!/usr/bin/env bash
# Build and push import-worker image via Cloud Build (no local Docker required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT_ID="${GCP_PROJECT_ID:-kung-fu-mgmt-system}"
REGION="${GCP_REGION:-us-central1}"
REPO="${AR_REPO:-metrobistro}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/import-worker"
TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"

gcloud builds submit "${ROOT}/workers/import" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --tag="${IMAGE}:${TAG}" \
  --quiet

gcloud artifacts docker tags add "${IMAGE}:${TAG}" "${IMAGE}:latest" --quiet 2>/dev/null \
  || gcloud container images add-tag "${IMAGE}:${TAG}" "${IMAGE}:latest" --quiet

echo "Pushed ${IMAGE}:${TAG} (and :latest if tagging succeeded)"
echo "IMAGE=${IMAGE}:${TAG}"
