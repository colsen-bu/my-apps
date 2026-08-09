#!/usr/bin/env bash
# Scaffold Woodpecker CI/CD + compose wiring for a new project on this host.
#
#   wp-scaffold.sh <project-name> [--dir PATH] [--port N] [--domain HOST]
#                  [--type node|python|static] [--health-path /health]
#                  [--dockerfile] [--force] [--stdout]
#
# Writes .woodpecker.yml and docker-compose.yml (and optionally a Dockerfile)
# into --dir (default: current directory). Never overwrites without --force.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TPL="$SKILL_DIR/templates"

PROJECT=""; DIR="$PWD"; PORT=3000; DOMAIN=""; TYPE="node"; WANT_DOCKERFILE=0; FORCE=0
HEALTH_PATH=""; STDOUT=0

usage() { sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir)        DIR="$2"; shift 2 ;;
    --port)       PORT="$2"; shift 2 ;;
    --domain)     DOMAIN="$2"; shift 2 ;;
    --type)       TYPE="$2"; shift 2 ;;
    --health-path) HEALTH_PATH="$2"; shift 2 ;;
    --dockerfile) WANT_DOCKERFILE=1; shift ;;
    --stdout)     STDOUT=1; shift ;;
    --force)      FORCE=1; shift ;;
    -h|--help)    usage 0 ;;
    -*)           echo "unknown flag: $1" >&2; usage ;;
    *)            PROJECT="$1"; shift ;;
  esac
done

[ -n "$PROJECT" ] || usage
# Slug: compose container names and project names are lowercase/dash only.
SLUG=$(printf '%s' "$PROJECT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g; s/^-//; s/-$//')
[ -n "$SLUG" ] || { echo "project name slugified to nothing" >&2; exit 1; }
[ -n "$DOMAIN" ] || DOMAIN="$SLUG.example.com"
mkdir -p "$DIR"

case "$TYPE" in
  node)   BUILD_IMAGE="node:20-alpine"
          BUILD_COMMANDS=$'      - npm ci\n      - npm run build --if-present' ;;
  python) BUILD_IMAGE="python:3.12-alpine"
          BUILD_COMMANDS=$'      - pip install --no-cache-dir -r requirements.txt\n      - python -c "import sys; print(sys.version)"' ;;
  static) BUILD_IMAGE="alpine:latest"
          BUILD_COMMANDS=$'      - test -f index.html || (echo "no index.html at repo root" && exit 1)'
          # nginx serves the site root; there is no /health endpoint to hit.
          [ -n "$HEALTH_PATH" ] || HEALTH_PATH="/" ;;
  *)      echo "unknown --type: $TYPE (node|python|static)" >&2; exit 1 ;;
esac

write() { # write <dest> <content-producing-command...>
  local dest="$1"; shift
  if [ -e "$dest" ] && [ "$FORCE" -eq 0 ]; then
    echo "  skip   $dest (exists; pass --force to overwrite)"; return 0
  fi
  "$@" > "$dest"
  echo "  write  $dest"
}

render() { # render <template> -- stdin-free, prints to stdout
  awk -v project="$SLUG" -v port="$PORT" -v domain="$DOMAIN" -v health_path="$HEALTH_PATH" \
      -v build_image="$BUILD_IMAGE" -v build_commands="$BUILD_COMMANDS" '
    { gsub(/__PROJECT__/, project)
      gsub(/__PORT__/, port)
      gsub(/__DOMAIN__/, domain)
      gsub(/__HEALTH_PATH__/, health_path)
      gsub(/__BUILD_IMAGE__/, build_image)
      if ($0 ~ /__BUILD_COMMANDS__/) { print build_commands; next }
      print }
  ' "$1"
}

dockerfile_node() {
  cat <<EOF
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE $PORT
CMD ["npm", "start"]
EOF
}
dockerfile_python() {
  cat <<EOF
FROM python:3.12-alpine
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE $PORT
CMD ["python", "app.py"]
EOF
}
dockerfile_static() {
  cat <<EOF
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE $PORT
EOF
}

[ -n "$HEALTH_PATH" ] || HEALTH_PATH="/health"

# --stdout: emit the files instead of writing them, for a repo that lives on
# another machine. Copy each block into the repo at the marked path.
if [ "$STDOUT" -eq 1 ]; then
  echo "########## .woodpecker.yml ##########"
  render "$TPL/woodpecker.yml.tmpl"
  echo
  echo "########## docker-compose.yml ##########"
  render "$TPL/docker-compose.yml.tmpl"
  if [ "$WANT_DOCKERFILE" -eq 1 ]; then
    echo
    echo "########## Dockerfile ##########"
    "dockerfile_$TYPE"
  fi
  exit 0
fi

echo "Scaffolding '$SLUG' (type=$TYPE port=$PORT health=$HEALTH_PATH domain=$DOMAIN) into $DIR"
write "$DIR/.woodpecker.yml"    render "$TPL/woodpecker.yml.tmpl"
write "$DIR/docker-compose.yml" render "$TPL/docker-compose.yml.tmpl"
[ "$WANT_DOCKERFILE" -eq 1 ] && write "$DIR/Dockerfile" "dockerfile_$TYPE"

cat <<EOF

Next:
  1. Make sure the app answers on $HEALTH_PATH (or pass --health-path / edit
     the healthcheck in docker-compose.yml).
  2. Dry-run the pipeline on this host, no push needed:
       $SKILL_DIR/wp-exec.sh --dir "$DIR"
  3. Push to GitHub, add the repo in Woodpecker, then
     repo -> Settings -> Project -> Trusted -> enable "Volumes".
  4. In nginx-proxy-manager (port 81) add a Proxy Host:
       $DOMAIN  ->  http://$SLUG:$PORT
EOF
