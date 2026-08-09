#!/usr/bin/env bash
# Run a .woodpecker.yml on THIS host exactly as the Woodpecker agent would,
# without pushing to GitHub. Uses the official woodpecker-cli in a container
# with the host docker socket, so the deploy step creates real containers.
#
#   wp-exec.sh [--dir PATH] [--file .woodpecker.yml] [--branch main]
#              [--event push|manual|pull_request] [--secret k=v]... [--quiet]
#   wp-exec.sh --github <owner/repo> [--ref main] ...
#
# --github downloads the repo tarball from GitHub (no git needed on this host)
# into a temp dir and runs the pipeline there -- for projects you author on
# another machine. Set GITHUB_TOKEN for private repos.
#
# Exit 0 = pipeline green. Anything else = the pipeline would have failed.
set -euo pipefail

DIR="$PWD"; FILE=".woodpecker.yml"; BRANCH="main"; EVENT="push"; QUIET=0
REPO="local/$(basename "$PWD")"
CLI_IMAGE="woodpeckerci/woodpecker-cli:v3"
GITHUB_REPO=""; REF=""; TMPDIR_CLONE=""
SECRETS=()

usage() { sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

cleanup() { [ -n "$TMPDIR_CLONE" ] && rm -rf "$TMPDIR_CLONE"; }
trap cleanup EXIT

while [ $# -gt 0 ]; do
  case "$1" in
    --github) GITHUB_REPO="$2"; shift 2 ;;
    --ref)    REF="$2"; shift 2 ;;
    --dir)    DIR="$2"; shift 2 ;;
    --file)   FILE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --event)  EVENT="$2"; shift 2 ;;
    --repo)   REPO="$2"; shift 2 ;;
    --secret) SECRETS+=(--secrets "$2"); shift 2 ;;
    --quiet)  QUIET=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown flag: $1" >&2; usage ;;
  esac
done

if [ -n "$GITHUB_REPO" ]; then
  case "$GITHUB_REPO" in */*) ;; *) echo "--github wants <owner>/<repo>" >&2; exit 1 ;; esac
  [ -n "$REF" ] || REF="$BRANCH"
  hdr=(); [ -n "${GITHUB_TOKEN:-}" ] && hdr=(-H "Authorization: Bearer $GITHUB_TOKEN")
  TMPDIR_CLONE=$(mktemp -d)
  echo "==> fetching $GITHUB_REPO@$REF from GitHub"
  # Tarball, not git clone -- this host has no git installed.
  if ! curl -fsSL "${hdr[@]}" \
        "https://api.github.com/repos/$GITHUB_REPO/tarball/$REF" \
        | tar xz -C "$TMPDIR_CLONE" --strip-components=1; then
    echo "download of $GITHUB_REPO@$REF failed: does that ref exist?" >&2
    echo "(--ref is what to download, --branch is only what the pipeline sees;" >&2
    echo " private repo? export GITHUB_TOKEN=<pat>)" >&2
    exit 1
  fi
  DIR="$TMPDIR_CLONE"
  REPO="$GITHUB_REPO"
fi

DIR="$(cd "$DIR" && pwd)"
[ -f "$DIR/$FILE" ] || { echo "no $FILE in $DIR" >&2; exit 1; }
[ "$REPO" = "local/$(basename "$PWD")" ] && REPO="local/$(basename "$DIR")"

echo "==> exec $DIR/$FILE   repo=$REPO event=$EVENT branch=$BRANCH"

# --user 0            : the cli image's default user cannot open the docker socket
# --repo-trusted-*    : mirrors the per-repo "Trusted" toggles set in the UI;
#                       without it the docker.sock volume is rejected outright
# bind DIR at its own path so compose build contexts resolve identically
set +e
docker run --rm --user 0 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$DIR":"$DIR" -w "$DIR" \
  "$CLI_IMAGE" exec \
    --repo "$REPO" \
    --pipeline-event "$EVENT" \
    --commit-branch "$BRANCH" \
    --repo-default-branch main \
    --repo-trusted-volumes --repo-trusted-network --repo-trusted-security \
    "${SECRETS[@]}" \
    "$FILE" 2>&1 | { [ "$QUIET" -eq 1 ] && grep -E "^\[[a-z_-]+:L[0-9]+" | tail -25 || cat; }
rc=${PIPESTATUS[0]}
set -e

if [ "$rc" -ne 0 ]; then
  echo "==> PIPELINE FAILED (exit $rc)"
  exit "$rc"
fi
echo "==> pipeline green"
