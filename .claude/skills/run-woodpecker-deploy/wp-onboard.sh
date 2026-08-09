#!/usr/bin/env bash
# Register a GitHub repo with the Woodpecker server on this host and put it in
# a state where a push actually deploys. Replaces the click-through in the UI.
#
#   wp-onboard.sh <owner/repo> [--secret NAME=VALUE]... [--config .woodpecker.yml]
#                 [--no-trust] [--dry-run]
#
# Auth: reads WOODPECKER_SERVER / WOODPECKER_TOKEN from the environment, or from
# ~/.config/woodpecker/env (mode 0600). Create a token at:
#   <woodpecker>/user  ->  "API" tab  ->  copy Token
set -euo pipefail

ENV_FILE="${WOODPECKER_ENV_FILE:-$HOME/.config/woodpecker/env}"
CLI_IMAGE="woodpeckerci/woodpecker-cli:v3"
REPO=""; CONFIG_PATH=""; TRUST=1; DRY=0; SECRETS=()

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --secret) SECRETS+=("$2"); shift 2 ;;
    --config) CONFIG_PATH="$2"; shift 2 ;;
    --no-trust) TRUST=0; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage 0 ;;
    -*) echo "unknown flag: $1" >&2; usage ;;
    *) REPO="$1"; shift ;;
  esac
done

[ -n "$REPO" ] || usage
case "$REPO" in */*) ;; *) echo "repo must be <owner>/<name>, got: $REPO" >&2; exit 1 ;; esac

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi
: "${WOODPECKER_SERVER:=https://woodpecker.mcvcllmhgb.com}"
if [ -z "${WOODPECKER_TOKEN:-}" ]; then
  echo "No WOODPECKER_TOKEN. Set it in the environment or write $ENV_FILE:" >&2
  echo "  install -m 600 /dev/null $ENV_FILE" >&2
  echo "  printf 'WOODPECKER_SERVER=%s\\nWOODPECKER_TOKEN=%s\\n' <server> <token> > $ENV_FILE" >&2
  exit 1
fi

wp() { # run the woodpecker CLI against the server
  # --user 0 + XDG_CONFIG_HOME: the CLI insists on creating a config dir before
  # running any command, and its default user can write neither ~ nor /tmp.
  docker run --rm --user 0 \
    -e WOODPECKER_SERVER="$WOODPECKER_SERVER" \
    -e WOODPECKER_TOKEN="$WOODPECKER_TOKEN" \
    -e WOODPECKER_DISABLE_UPDATE_CHECK=true \
    -e XDG_CONFIG_HOME=/tmp \
    "$CLI_IMAGE" "$@"
}
run() { # echo + execute, or just echo under --dry-run
  echo "  + woodpecker-cli $*"
  [ "$DRY" -eq 1 ] && return 0
  wp "$@"
}

echo "==> server $WOODPECKER_SERVER"

# forge-remote-id is GitHub's numeric repo id; `repo add` takes that, not a name.
gh_api="https://api.github.com/repos/$REPO"
gh_hdr=()
[ -n "${GITHUB_TOKEN:-}" ] && gh_hdr=(-H "Authorization: Bearer $GITHUB_TOKEN")
gh_json=$(curl -sS "${gh_hdr[@]}" "$gh_api")
FORGE_ID=$(printf '%s' "$gh_json" | jq -r '.id // empty')
if [ -z "$FORGE_ID" ]; then
  echo "cannot resolve $REPO on GitHub: $(printf '%s' "$gh_json" | jq -r '.message // "unknown error"')" >&2
  echo "(private repo? export GITHUB_TOKEN=<pat> and retry)" >&2
  exit 1
fi
echo "==> $REPO is forge-remote-id $FORGE_ID"

if wp repo show "$REPO" >/dev/null 2>&1; then
  echo "==> already registered, updating"
else
  echo "==> registering"
  run repo sync >/dev/null || true
  run repo add "$FORGE_ID"
fi

upd=(repo update)
# Volumes trust is what lets the deploy step mount /var/run/docker.sock. Without
# it every pipeline dies at validation: "Insufficient trust level to use volumes".
[ "$TRUST" -eq 1 ] && upd+=(--trusted-volumes --trusted-network --trusted-security)
[ -n "$CONFIG_PATH" ] && upd+=(--config "$CONFIG_PATH")
if [ ${#upd[@]} -gt 2 ]; then
  echo "==> applying settings"
  run "${upd[@]}" "$REPO"
fi

for kv in "${SECRETS[@]:-}"; do
  [ -n "$kv" ] || continue
  name="${kv%%=*}"; value="${kv#*=}"
  echo "==> secret $name"
  if [ "$DRY" -eq 1 ]; then
    echo "  + woodpecker-cli repo secret add --repository $REPO --name $name --value *** --event push"
    continue
  fi
  # --event is mandatory on `update` (422 "no event specified" without it) and
  # `add` on an existing name is a hard 500, so try add, fall back to update.
  if wp repo secret add --repository "$REPO" --name "$name" --value "$value" \
       --event push >/dev/null 2>&1; then
    echo "     created"
  elif wp repo secret update --repository "$REPO" --name "$name" --value "$value" \
       --event push >/dev/null 2>&1; then
    echo "     updated (already existed)"
  else
    echo "     FAILED -- run manually to see the error:" >&2
    echo "     wp repo secret add --repository $REPO --name $name --value ... --event push" >&2
    exit 1
  fi
done

[ "$DRY" -eq 1 ] && { echo "==> dry run, nothing changed"; exit 0; }

echo "==> final state"
# `repo show` omits the trust flags -- and those are the whole point of this
# script -- so read them back off the API instead.
curl -sS -H "Authorization: Bearer $WOODPECKER_TOKEN" \
  "$WOODPECKER_SERVER/api/repos/lookup/$REPO" \
  | jq '{full_name, active, default_branch, trusted}' | sed 's/^/  /'
echo
echo "Push to the default branch to trigger a deploy, then verify with the"
echo "container_name from docker-compose.yml:"
echo "  ~/.claude/skills/run-woodpecker-deploy/wp-verify.sh <container-name>"
