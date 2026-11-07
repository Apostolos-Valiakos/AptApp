#!/usr/bin/env bash
# Deploys the last commit of this local repo to the VPS, without building on
# the VPS: builds the app image here, uploads it over SSH, then runs
# scripts/vps_run_image.sh there (database backup, start, health check,
# automatic rollback if it doesn't come up).
#
# Usage, from the repo on the laptop:
#   ./scripts/deploy_image.sh              # build HEAD, upload, run it
#   ./scripts/deploy_image.sh --no-run     # build and upload only
#   ./scripts/deploy_image.sh --rollback   # run the image before the current one
#
# Only committed code goes in: the image is built from a clean copy of HEAD,
# so uncommitted changes (the landing page, local .env files) never do.
# Settings: VPS (default root@185.246.164.136, petalouda's server), APP_DIR on
# the VPS (default /opt/petalouda), IMAGE (default petalouda-app). First time
# on a server: ./scripts/setup_vps.sh (backups). See DEPLOY.md.

set -euo pipefail

VPS="${VPS:-root@185.246.164.136}"
APP_DIR="${APP_DIR:-/opt/petalouda}"
IMAGE="${IMAGE:-petalouda-app}"
MODE="deploy"
case "${1:-}" in
  "") ;;
  --no-run) MODE="upload" ;;
  --rollback) MODE="rollback" ;;
  *) echo "usage: $0 [--no-run | --rollback]" >&2; exit 1 ;;
esac

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO"

# One SSH connection for every step, so the password is asked once.
SOCKET="$(mktemp -u /tmp/petalouda-deploy-XXXXXX)"
SSH=(ssh -o ControlPath="$SOCKET")
WORKTREE=""
cleanup() {
  [ -n "$WORKTREE" ] && git worktree remove --force "$WORKTREE" 2>/dev/null || true
  "${SSH[@]}" -O exit "$VPS" 2>/dev/null || true
}
trap cleanup EXIT
echo "== Connecting to $VPS"
ssh -o ControlMaster=yes -o ControlPath="$SOCKET" -o ControlPersist=yes -fN "$VPS"

# The VPS script is copied to a file there and run from it with its input
# closed. Piped straight into bash, any command in it that reads input (as
# docker compose exec does, even with -T) swallows the rest of the script:
# bash then stops early and still reports success.
REMOTE_SCRIPT="/tmp/petalouda_vps_run_image.sh"
run_on_vps() {
  "${SSH[@]}" "$VPS" "cat > $REMOTE_SCRIPT" < scripts/vps_run_image.sh
  "${SSH[@]}" "$VPS" "APP_DIR='$APP_DIR' IMAGE='$IMAGE' bash $REMOTE_SCRIPT '$1' </dev/null; rc=\$?; rm -f $REMOTE_SCRIPT; exit \$rc"
}

if [ "$MODE" = "rollback" ]; then
  echo "== Rolling back to the previous image"
  run_on_vps previous
  exit 0
fi

TAG="$(git rev-parse --short HEAD)"
echo "== Deploying commit $(git log --oneline -1 HEAD) on $(git branch --show-current)"
if [ -n "$(git status --porcelain)" ]; then
  echo "   (uncommitted changes in this folder are left out)"
fi

if docker image inspect "$IMAGE:$TAG" >/dev/null 2>&1; then
  echo "== $IMAGE:$TAG already built here"
else
  echo "== Building $IMAGE:$TAG from a clean copy of $TAG"
  WORKTREE="$(mktemp -d /tmp/petalouda-build-XXXXXX)"
  rmdir "$WORKTREE"
  git worktree add --detach "$WORKTREE" HEAD >/dev/null
  docker build --platform linux/amd64 -t "$IMAGE:$TAG" "$WORKTREE"
fi

if "${SSH[@]}" "$VPS" "docker image inspect $IMAGE:$TAG" >/dev/null 2>&1; then
  echo "== $IMAGE:$TAG is already on the VPS, not uploading again"
else
  echo "== Uploading $IMAGE:$TAG (about 150 MB compressed)"
  docker save "$IMAGE:$TAG" | gzip | "${SSH[@]}" "$VPS" 'gunzip | docker load'
fi

if [ "$MODE" = "upload" ]; then
  echo "== Uploaded. To run it later: ./scripts/deploy_image.sh (it skips the build and upload)"
  exit 0
fi

echo "== Running it on the VPS"
run_on_vps "$TAG"
echo "== Done: commit $TAG is live"
