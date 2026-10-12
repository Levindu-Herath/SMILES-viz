#!/usr/bin/env bash
# Deploy one release on the EC2 box. Runs ON THE BOX as `ubuntu`, started by
# GitHub Actions through SSM Run Command (deploy.yml / rollback.yml):
#   bash deploy.sh <full-40-char-git-sha>
# Rebuilds .env.prod from SSM Parameter Store, pulls that SHA's images from ECR
# and restarts the stack. Re-running with the same SHA is safe.
set -euo pipefail

TAG="${1:?usage: deploy.sh <full-40-char-git-sha>}"
if [[ ! "$TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "error: '$TAG' is not a full 40-char git SHA" >&2
  exit 1
fi

REPO="Levindu-Herath/SMILES-viz"
APP_DIR="$HOME/smiles-viz"
PARAM_PATH="/smiles-viz/prod/"
export AWS_DEFAULT_REGION="ap-northeast-2"

cd "$APP_DIR"
umask 077 # every file this script creates is readable by ubuntu only

previous=$(grep -s '^IMAGE_TAG=' .env.prod | cut -d= -f2 || true)
echo "==> Deploying $TAG (currently running: ${previous:-none})"

echo "==> Fetching docker-compose.prod.yml at $TAG"
curl -fsSL "https://raw.githubusercontent.com/$REPO/$TAG/docker-compose.prod.yml" \
  -o docker-compose.prod.yml.next

echo "==> Building .env.prod from SSM $PARAM_PATH"
{
  aws ssm get-parameters-by-path --path "$PARAM_PATH" --with-decryption \
    --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do
      printf '%s=%s\n' "${name##*/}" "$value"
    done
  printf 'IMAGE_TAG=%s\n' "$TAG"
} > .env.prod.next

dc_next() { docker compose --env-file .env.prod.next -f docker-compose.prod.yml.next "$@"; }
dc_next config --quiet # fails here if a required variable is missing

registry=$(grep '^ECR_REGISTRY=' .env.prod.next | cut -d= -f2)
echo "==> Logging in to $registry"
aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"

echo "==> Pulling images"
dc_next pull

# Pull succeeded: promote the new config. From here .env.prod is the record of
# what is live, and manual `dc` commands agree with it.
mv docker-compose.prod.yml.next docker-compose.prod.yml
mv .env.prod.next .env.prod

echo "==> Starting containers"
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  up -d --remove-orphans --wait --wait-timeout 180

echo "==> Removing unused images"
docker image prune -af

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $TAG" >> deploy-history.log
echo "==> Deployed $TAG"
