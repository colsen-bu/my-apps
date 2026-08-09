#!/usr/bin/env bash
# Prove a deployed container is actually serving and actually reachable by
# nginx-proxy-manager -- the two things that break silently after a deploy.
#
#   wp-verify.sh <container-name> [--port N] [--path /health]
set -euo pipefail

NAME="${1:-}"; shift || true
PORT=3000; UPATH="/health"
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --path) UPATH="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done
[ -n "$NAME" ] || { echo "usage: wp-verify.sh <container-name> [--port N] [--path /health]" >&2; exit 1; }

fail=0
say() { printf '%-28s %s\n' "$1" "$2"; }

state=$(docker inspect -f '{{.State.Status}}' "$NAME" 2>/dev/null || echo missing)
say "container state" "$state"
[ "$state" = "running" ] || { echo "not running -- last logs:"; docker logs --tail 40 "$NAME" 2>&1 || true; exit 1; }

health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$NAME")
say "healthcheck" "$health"
[ "$health" = "unhealthy" ] && { docker inspect -f '{{json .State.Health.Log}}' "$NAME"; fail=1; }

nets=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$NAME")
say "networks" "$nets"
case "$nets" in *npm_proxy*) ;; *) echo "  !! not on npm_proxy -- nginx-proxy-manager cannot route to it"; fail=1 ;; esac

# In-container: catches a server bound to 127.0.0.1-only or the wrong port.
if docker exec "$NAME" sh -c "wget -qO- http://127.0.0.1:$PORT$UPATH" >/dev/null 2>&1; then
  say "in-container $UPATH" "ok"
else
  say "in-container $UPATH" "FAILED (try: docker exec $NAME wget -qO- http://127.0.0.1:$PORT$UPATH)"
  fail=1
fi

# From the live NPM container: this is the exact path a proxy host will take.
npm=$(docker ps --filter name=nginx-proxy-manager --format '{{.Names}}' | head -1)
if [ -n "$npm" ]; then
  # curl emits one %{http_code} per connection attempt; keep only the last.
  code=$(docker exec "$npm" curl -s -o /dev/null -m 10 -w '%{http_code}' "http://$NAME:$PORT/" 2>/dev/null || echo 000)
  code="${code: -3}"
  say "from nginx-proxy-manager" "http=$code"
  [ "$code" = "000" ] && fail=1
else
  say "from nginx-proxy-manager" "SKIPPED (npm container not found)"
fi

[ "$fail" -eq 0 ] && echo "==> $NAME verified" || { echo "==> $NAME has problems"; exit 1; }
