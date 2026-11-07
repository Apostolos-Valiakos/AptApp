#!/usr/bin/env bash
# Runs an app image already loaded on the VPS: backs up the database, starts
# the image, waits until it's healthy, and goes back to the image that was
# running if it doesn't come up. Older image versions are cleaned up, keeping
# the last few for rollback.
#
# Normally run for you by ./scripts/deploy_image.sh on the laptop (it copies
# this file over SSH, so it doesn't have to be on the VPS). By hand, from the
# app folder on the VPS:
#   ./scripts/vps_run_image.sh f485654     # a version that was uploaded
#   ./scripts/vps_run_image.sh previous    # back to the one before
#
# The app runs the image tagged $IMAGE:current; docker-compose.override.yml
# (created here the first time) points Compose at it instead of building.
# See DEPLOY.md, "Deploying an update".

set -euo pipefail

TAG="${1:?usage: vps_run_image.sh <image tag | previous>}"
APP_DIR="${APP_DIR:-/opt/petalouda}"
IMAGE="${IMAGE:-petalouda-app}"   # the app's image name on this server
KEEP="${KEEP_IMAGES:-3}"   # uploaded versions kept besides current/previous
cd "$APP_DIR"

if ! docker image inspect "$IMAGE:$TAG" >/dev/null 2>&1; then
  echo "No image $IMAGE:$TAG on this server. Upload it first (./scripts/deploy_image.sh)." >&2
  exit 1
fi
TARGET="$(docker image inspect -f '{{.Id}}' "$IMAGE:$TAG")"

if [ ! -f docker-compose.override.yml ]; then
  echo "Creating docker-compose.override.yml (the app runs $IMAGE:current)"
  cat > docker-compose.override.yml <<EOF
services:
  app:
    image: $IMAGE:current
    pull_policy: never
EOF
fi

# What runs now, kept as "$IMAGE:previous" for a rollback.
RUNNING_ID="$(docker compose ps -q app 2>/dev/null || true)"
RUNNING_IMAGE=""
if [ -n "$RUNNING_ID" ]; then
  RUNNING_IMAGE="$(docker inspect -f '{{.Image}}' "$RUNNING_ID")"
fi
if [ "$RUNNING_IMAGE" = "$TARGET" ]; then
  echo "$IMAGE:$TAG is already running. Nothing to do."
  exit 0
fi

echo "== Backing up the database"
./scripts/backup_db.sh </dev/null

echo "== Starting $IMAGE:$TAG"
OLD_PREVIOUS="$(docker image inspect -f '{{.Id}}' "$IMAGE:previous" 2>/dev/null || true)"
[ -n "$RUNNING_IMAGE" ] && docker tag "$RUNNING_IMAGE" "$IMAGE:previous"
docker tag "$TARGET" "$IMAGE:current"
# Compose doesn't notice a new image under the same tag: recreate the app
# container (only it; the database keeps running).
docker compose up -d --no-build --no-deps --force-recreate app

# Healthy within ~3 minutes (migrations run at startup), or roll back. A
# container without a Docker health check (petalouda's compose file has none)
# is asked for /health directly.
app_status() {
  local id
  id="$(docker compose ps -q app 2>/dev/null)"
  [ -z "$id" ] && { echo missing; return; }
  local s
  s="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo missing)"
  if [ "$s" = "none" ]; then
    if [ "$(docker inspect -f '{{.State.Running}}' "$id" 2>/dev/null)" != "true" ]; then echo exited; return; fi
    if docker exec "$id" node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" >/dev/null 2>&1; then
      echo healthy
    else
      echo starting
    fi
    return
  fi
  echo "$s"
}
status="starting"
for _ in $(seq 1 36); do
  sleep 5
  status="$(app_status)"
  [ "$status" = "healthy" ] && break
  [ "$status" = "unhealthy" ] && break
done

if [ "$status" != "healthy" ]; then
  echo "!! $IMAGE:$TAG did not become healthy (status: $status). Last log lines:" >&2
  docker compose logs --tail=40 app >&2 || true
  if [ -n "$RUNNING_IMAGE" ]; then
    echo "!! Going back to the image that was running before." >&2
    docker tag "$RUNNING_IMAGE" "$IMAGE:current"
    [ -n "$OLD_PREVIOUS" ] && docker tag "$OLD_PREVIOUS" "$IMAGE:previous"
    docker compose up -d --no-build --no-deps --force-recreate app
    echo "!! Rolled back. A migration that did run is NOT undone; the backup above has the data before it." >&2
  fi
  exit 1
fi

# Healthy isn't enough: make sure it's the new image that's running.
NOW_RUNNING="$(docker inspect -f '{{.Image}}' "$(docker compose ps -q app)")"
if [ "$NOW_RUNNING" != "$TARGET" ]; then
  echo "!! The app is healthy but runs $NOW_RUNNING, not $IMAGE:$TAG ($TARGET). Nothing was switched." >&2
  exit 1
fi
echo "== $IMAGE:$TAG is running and healthy"
docker compose logs --tail=200 app 2>/dev/null | grep "Migration applied" || true

# Keep the newest few uploaded versions; current/previous/latest stay.
docker image ls "$IMAGE" --format '{{.Tag}}' | grep -vxE 'current|previous|latest|<none>' \
  | tail -n +"$((KEEP + 1))" | while read -r old; do docker rmi "$IMAGE:$old" >/dev/null || true; done
docker image prune -f >/dev/null
echo "== Images kept:"
docker image ls "$IMAGE" --format '  {{.Tag}}\t{{.CreatedSince}}\t{{.Size}}'
