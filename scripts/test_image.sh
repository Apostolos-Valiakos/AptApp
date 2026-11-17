#!/usr/bin/env bash
# Tests the app image of the last commit here, before ./scripts/deploy_image.sh
# sends it to the VPS: builds it the same way (from a clean copy of HEAD, so
# uncommitted files never count), runs it against a throwaway PostgreSQL 17
# (as on the VPS) holding a copy of the local database, and checks that it
# starts, applies its migrations and serves the home page, the app and the API.
#
# Usage, from the repo:
#   ./scripts/test_image.sh            # build (if needed) and test HEAD
#   KEEP=1 ./scripts/test_image.sh     # leave it running afterwards, to look around
#
# The copy holds real clients' data: scheduled jobs are off (RUN_JOBS=0) and
# mail goes nowhere, and every container is removed at the end. Only the
# image stays, so deploy_image.sh then skips building it again. Needs Docker,
# the local database (POSTGRES_URI in .env) and pg_dump; the browser check
# also needs node_modules and Chrome (CHROME_PATH, default
# /usr/bin/google-chrome) and is skipped without them.

set -euo pipefail

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO"

TAG="$(git rev-parse --short HEAD)"
IMAGE="pure-app:$TAG"
PORT="${TEST_PORT:-3290}"
BASE="http://localhost:$PORT"
RUN="pure-test-$$"
DB_NAME="pure_test"
DB_PASSWORD="test-$RANDOM$RANDOM"
WORKTREE=""
FAILED=0

cleanup() {
  if [ "${KEEP:-}" = "1" ] && [ "$FAILED" = "0" ]; then
    echo "== Left running at $BASE (KEEP=1). Remove with:"
    echo "   docker rm -f $RUN-app $RUN-db && docker network rm $RUN"
  else
    docker rm -f "$RUN-app" "$RUN-db" >/dev/null 2>&1 || true
    docker network rm "$RUN" >/dev/null 2>&1 || true
  fi
  [ -n "$WORKTREE" ] && git worktree remove --force "$WORKTREE" 2>/dev/null || true
}
trap cleanup EXIT

pass() { echo "   ok    $1"; }
fail() { echo "   FAIL  $1" >&2; FAILED=1; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

echo "== Testing commit $(git log --oneline -1 HEAD) on $(git branch --show-current)"
[ -n "$(git status --porcelain)" ] && echo "   (uncommitted changes in this folder are left out, as in a deploy)"

# 1. The image, built exactly as deploy_image.sh builds it.
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "== $IMAGE already built here"
else
  echo "== Building $IMAGE from a clean copy of $TAG"
  WORKTREE="$(mktemp -d /tmp/pure-test-build-XXXXXX)"
  rmdir "$WORKTREE"
  git worktree add --detach "$WORKTREE" HEAD >/dev/null
  docker build --platform linux/amd64 -t "$IMAGE" "$WORKTREE"
fi

# 2. What's inside the image.
echo "== Inside the image"
INSIDE="$(docker run --rm --entrypoint sh "$IMAGE" -c 'id -un; ls -a /app; ls /app/dist/index.html /app/landing/out/index.html 2>&1')"
check "runs as a non-root user" '[ "$(echo "$INSIDE" | head -1)" != "root" ]'
check "no .env (no secrets) in the image" '! echo "$INSIDE" | grep -qx ".env"'
check "has the built app (dist/index.html)" 'echo "$INSIDE" | grep -q "^/app/dist/index.html$"'
check "has the built home page (landing/out/index.html)" 'echo "$INSIDE" | grep -q "^/app/landing/out/index.html$"'

# 3. A throwaway PostgreSQL 17 with a copy of the local database.
LOCAL_URI="$(grep -E '^POSTGRES_URI=' .env | cut -d= -f2- | sed 's/[[:space:]]*#.*//')"
echo "== Starting PostgreSQL 17 and copying the local database into it"
docker network create "$RUN" >/dev/null
docker run -d --name "$RUN-db" --network "$RUN" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" -e TZ=Europe/Athens \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$RUN-db" pg_isready -U postgres -d "$DB_NAME" >/dev/null 2>&1 && break
  sleep 1
done
sleep 2 # the image's init restarts the server once
pg_dump --no-owner --no-privileges "$LOCAL_URI" \
  | docker exec -i "$RUN-db" psql -q -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=0 >/dev/null 2>"/tmp/$RUN-restore.log" || true
SHOPS="$(docker exec "$RUN-db" psql -U postgres -d "$DB_NAME" -At -c 'SELECT count(*) FROM shops' 2>/dev/null || echo 0)"
check "database copied ($SHOPS shops)" '[ "$SHOPS" -gt 0 ]'

# 4. The app, set up as docker-compose.yml sets it up.
echo "== Starting $IMAGE"
docker run -d --name "$RUN-app" --network "$RUN" -p "127.0.0.1:$PORT:3000" \
  -e POSTGRES_URI="postgresql://postgres:$DB_PASSWORD@$RUN-db:5432/$DB_NAME" \
  -e JWT_SECRET="test-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  -e MESSAGE_ENCRYPTION_KEY="test-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  -e PORT=3000 -e NODE_ENV=production -e TZ=Europe/Athens -e RUN_JOBS=0 \
  -e ALLOWED_ORIGINS="$BASE" -e FRONTEND_URL="$BASE" -e PUBLIC_BASE_URL="$BASE" \
  -e EMAIL_HOST=mail.invalid -e EMAIL_USER= -e EMAIL_PASS= -e VAPID_PUBLIC_KEY= -e VAPID_PRIVATE_KEY= \
  "$IMAGE" >/dev/null

# Healthy within ~3 minutes, as the VPS script waits.
healthy=0
for _ in $(seq 1 36); do
  sleep 5
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then healthy=1; break; fi
  [ "$(docker inspect -f '{{.State.Running}}' "$RUN-app" 2>/dev/null)" = "true" ] || break
done
check "the app starts and /health answers" '[ "$healthy" = "1" ]'
if [ "$healthy" != "1" ]; then
  echo "   Last log lines:" >&2
  docker logs --tail 40 "$RUN-app" >&2 || true
  exit 1
fi
LOGS="$(docker logs "$RUN-app" 2>&1)"
APPLIED="$(echo "$LOGS" | grep -c "Migration applied" || true)"
if [ "$APPLIED" = "0" ]; then
  echo "   (no migration to apply: the local database already has them all; production may not, so it runs new ones at its own start)"
else
  echo "   ($APPLIED migration(s) applied at startup: $(echo "$LOGS" | grep -o 'Migration applied: [^ ]*' | sed 's/Migration applied: //' | tr '\n' ' '))"
fi
check "no errors while starting" '! echo "$LOGS" | grep -qiE "^(error|fatal)|unhandled|migration.*fail"'

# 5. What visitors and the app get.
echo "== Pages and API"
status() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }
HOME_HTML="$(curl -fsS "$BASE/")"
check "/ is the public home page" 'echo "$HOME_HTML" | grep -q "/_next/"'
NEXT_ASSET="$(echo "$HOME_HTML" | grep -oE '/_next/static/[^"]+\.(js|css)' | head -1)"
check "its files load ($NEXT_ASSET)" '[ -n "$NEXT_ASSET" ] && [ "$(status "$NEXT_ASSET")" = 200 ]'
check "its images load" '[ "$(status /sites/pure/brand/pure-word.png)" = 200 ]'
PRICES="$(curl -fsS "$BASE/api/v1/public/prices" || true)"
check "the home page's price list answers with services" 'echo "$PRICES" | grep -q "\"price\""'
APP_HTML="$(curl -fsS "$BASE/login")"
check "/login is the app" 'echo "$APP_HTML" | grep -q "/assets/"'
APP_ASSET="$(echo "$APP_HTML" | grep -oE '/assets/[^"]+\.js' | head -1)"
check "the app's files load ($APP_ASSET)" '[ -n "$APP_ASSET" ] && [ "$(status "$APP_ASSET")" = 200 ]'
check "a missing build file is a real 404" '[ "$(status /assets/does-not-exist.js)" = 404 ]'
check "the API refuses without a login" '[ "$(status /api/v1/services)" = 401 ]'

# 6. In a real browser: the home page, then logging in to the calendar.
CHROME="${CHROME_PATH:-/usr/bin/google-chrome}"
if [ -d node_modules/puppeteer-core ] && [ -x "$CHROME" ]; then
  echo "== In Chrome"
  ADMIN_ID="$(docker exec "$RUN-db" psql -U postgres -d "$DB_NAME" -At -c "SELECT id FROM users WHERE role='admin' AND is_active IS NOT FALSE ORDER BY id LIMIT 1")"
  HASH="$(node -e 'console.log(require("bcrypt").hashSync("image-test-pass", 4))')"
  docker exec "$RUN-db" psql -U postgres -d "$DB_NAME" -q -c "UPDATE users SET username='image_test_admin', password='$HASH' WHERE id='$ADMIN_ID'" >/dev/null
  if CHROME_PATH="$CHROME" BASE="$BASE" node scripts/test_image_browser.cjs; then pass "home page and login work in Chrome"; else fail "home page and login work in Chrome"; fi
else
  echo "== Chrome check skipped (needs node_modules and $CHROME)"
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "== All checks passed: $IMAGE is ready for ./scripts/deploy_image.sh"
else
  echo "== Some checks FAILED: don't deploy $IMAGE yet" >&2
  exit 1
fi
