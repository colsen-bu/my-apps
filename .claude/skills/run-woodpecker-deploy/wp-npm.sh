#!/usr/bin/env bash
# Create/update an nginx-proxy-manager Proxy Host so a deployed container is
# reachable at a real domain, optionally with a Let's Encrypt certificate.
#
# !! UNTESTED against the live NPM API. The request payloads were checked with
# !! --dry-run only; no credentials are stored on this host. Proxy hosts are
# !! currently created by hand in the UI on port 81 (see SKILL.md step 4).
# !! Verify `ls` first, then `add` without --ssl, before relying on this.
#
#   wp-npm.sh add <domain> --target <container> --port N [--ssl [--email you@x]]
#             [--no-websockets] [--dry-run]
#   wp-npm.sh ls
#
# Auth: NPM_URL / NPM_EMAIL / NPM_PASSWORD from the environment or from
# ~/.config/npm-proxy/env (mode 0600). NPM_URL defaults to http://127.0.0.1:81.
set -euo pipefail

ENV_FILE="${NPM_ENV_FILE:-$HOME/.config/npm-proxy/env}"
CMD="${1:-}"; shift || true
DOMAIN=""; TARGET=""; PORT=""; SSL=0; EMAIL=""; WS=1; DRY=0

usage() { sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --ssl) SSL=1; shift ;;
    --email) EMAIL="$2"; shift 2 ;;
    --no-websockets) WS=0; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage 0 ;;
    -*) echo "unknown flag: $1" >&2; usage ;;
    *) DOMAIN="$1"; shift ;;
  esac
done

[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${NPM_URL:=http://127.0.0.1:81}"

need_auth() {
  if [ -z "${NPM_EMAIL:-}" ] || [ -z "${NPM_PASSWORD:-}" ]; then
    echo "No NPM credentials. Set NPM_EMAIL/NPM_PASSWORD or write $ENV_FILE:" >&2
    echo "  mkdir -p ~/.config/npm-proxy && install -m 600 /dev/null $ENV_FILE" >&2
    echo "  printf 'NPM_EMAIL=%s\\nNPM_PASSWORD=%s\\n' <email> <password> > $ENV_FILE" >&2
    exit 1
  fi
  TOKEN=$(curl -sS -X POST "$NPM_URL/api/tokens" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg i "$NPM_EMAIL" --arg s "$NPM_PASSWORD" '{identity:$i,secret:$s}')" \
    | jq -r '.token // empty')
  [ -n "$TOKEN" ] || { echo "NPM login failed for $NPM_EMAIL at $NPM_URL" >&2; exit 1; }
}

api() { # api <method> <path> [json-body]
  local m="$1" p="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$m" "$NPM_URL$p" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' -d "$body"
  else
    curl -sS -X "$m" "$NPM_URL$p" -H "Authorization: Bearer $TOKEN"
  fi
}

case "$CMD" in
  ls)
    need_auth
    api GET /api/nginx/proxy-hosts \
      | jq -r '.[] | "\(.domain_names|join(","))\t-> \(.forward_scheme)://\(.forward_host):\(.forward_port)\tssl=\(if .certificate_id>0 then "yes" else "no" end)\tenabled=\(.enabled)"' \
      | column -t -s $'\t'
    ;;
  add)
    [ -n "$DOMAIN" ] && [ -n "$TARGET" ] && [ -n "$PORT" ] || usage
    # forward_host must be the container name on npm_proxy -- NPM resolves it
    # over the overlay network's embedded DNS, same as wp-verify.sh checks.
    payload=$(jq -nc \
      --arg d "$DOMAIN" --arg h "$TARGET" --argjson p "$PORT" \
      --argjson ws "$( [ "$WS" -eq 1 ] && echo true || echo false )" '
      { domain_names: [$d],
        forward_scheme: "http",
        forward_host: $h,
        forward_port: $p,
        access_list_id: 0,
        certificate_id: 0,
        ssl_forced: false,
        http2_support: false,
        hsts_enabled: false,
        hsts_subdomains: false,
        caching_enabled: false,
        block_exploits: true,
        allow_websocket_upgrade: $ws,
        advanced_config: "",
        locations: [],
        enabled: true,
        meta: { letsencrypt_agree: false, dns_challenge: false } }')

    if [ "$SSL" -eq 1 ]; then
      [ -n "$EMAIL" ] || { echo "--ssl needs --email (Let's Encrypt account address)" >&2; exit 1; }
      payload=$(printf '%s' "$payload" | jq -c \
        --arg e "$EMAIL" '
        .certificate_id = "new"
        | .ssl_forced = true
        | .http2_support = true
        | .meta.letsencrypt_agree = true
        | .meta.letsencrypt_email = $e')
    fi

    if [ "$DRY" -eq 1 ]; then
      echo "POST $NPM_URL/api/nginx/proxy-hosts"
      printf '%s' "$payload" | jq .
      exit 0
    fi

    need_auth
    existing=$(api GET /api/nginx/proxy-hosts \
      | jq -r --arg d "$DOMAIN" '.[] | select(.domain_names | index($d)) | .id' | head -1)

    if [ -n "$existing" ]; then
      echo "==> updating proxy host $existing for $DOMAIN"
      out=$(api PUT "/api/nginx/proxy-hosts/$existing" "$payload")
    else
      echo "==> creating proxy host for $DOMAIN"
      out=$(api POST /api/nginx/proxy-hosts "$payload")
    fi

    if ! printf '%s' "$out" | jq -e '.id' >/dev/null 2>&1; then
      echo "NPM rejected the request:" >&2
      printf '%s' "$out" | jq . >&2 || printf '%s\n' "$out" >&2
      exit 1
    fi
    printf '%s' "$out" | jq '{id, domain_names, forward_host, forward_port, certificate_id, enabled}'
    echo "==> https://$DOMAIN should now resolve once DNS points at this host"
    ;;
  *) usage ;;
esac
