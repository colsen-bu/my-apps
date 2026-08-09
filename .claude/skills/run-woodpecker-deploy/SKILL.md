---
name: run-woodpecker-deploy
description: Ship a new personal web project to this Oracle Cloud host with Woodpecker CI. Use when creating a new project, adding a .woodpecker.yml, wiring docker-compose for deployment, registering a repo with Woodpecker, adding CI secrets, exposing a site through nginx-proxy-manager with SSL, debugging a failing pipeline, or dry-running a deploy before pushing. Scaffolds the pipeline, registers the repo, runs the pipeline against the live docker daemon, and verifies the container is serving and reachable by the proxy.
---

# Shipping a project to this host with Woodpecker

This host runs Docker Swarm (manager) with three long-lived pieces:
`woodpecker-server` + `woodpecker-agent` (stack `woodpecker`),
`nginx-proxy-manager` (stack `npm`), and every personal project as a **plain
compose container** attached to the external overlay network `npm_proxy`.

The agent has `/var/run/docker.sock` bind-mounted, so a pipeline's deploy step
talks to the **host** docker daemon: `docker compose up -d --build` inside CI
creates a real container on the box. That is the whole deployment mechanism —
no registry push, no swarm service for app projects.

## Where each script runs

Code is authored on the laptop and pushed to GitHub; everything else happens
here. `wp-scaffold.sh` is pure bash+awk and runs on either machine (copy this
skill directory to the laptop if you want it there). The other four need this
host's docker daemon.

| Script | Machine | Purpose |
|---|---|---|
| `wp-scaffold.sh` | laptop or server | write `.woodpecker.yml` + `docker-compose.yml` (+ `Dockerfile`) |
| `wp-onboard.sh` | server | register the repo in Woodpecker, set trust, push secrets |
| `wp-exec.sh` | server | **the driver** — run the pipeline for real, no push needed |
| `wp-verify.sh` | server | prove the container is healthy and reachable by the proxy |

All are under `~/.claude/skills/run-woodpecker-deploy/`. Publishing the domain
in nginx-proxy-manager stays a manual UI step by choice — see step 4.

## Prerequisites

Nothing to install — no git or gh on this host and none needed. The scripts pull
`woodpeckerci/woodpecker-cli:v3` and use `curl` + `jq`, which are present. The
invoking user must be in the `docker` group (`opc` is).

`wp-onboard.sh` authenticates from `~/.config/woodpecker/env` (mode 0600,
already created):

```bash
WOODPECKER_SERVER=https://woodpecker.mcvcllmhgb.com
WOODPECKER_TOKEN=<token>
```

New token: <https://woodpecker.mcvcllmhgb.com/user> → **API** tab. No
nginx-proxy-manager credentials are stored anywhere.

## 1. Scaffold (laptop, in the repo)

```bash
~/.claude/skills/run-woodpecker-deploy/wp-scaffold.sh my-project \
  --port 3000 --domain my-project.mcvcllmhgb.com --dockerfile
```

Flags: `--dir PATH`, `--port N`, `--domain HOST`, `--type node|python|static`,
`--health-path /health`, `--dockerfile`, `--force`, `--stdout`.
`--type static` defaults `--health-path` to `/`.

If the repo is on the laptop and you are working from the server, emit the files
and paste them across:

```bash
~/.claude/skills/run-woodpecker-deploy/wp-scaffold.sh my-project --port 3000 --stdout --dockerfile
```

The project name is slugified and used for **all three** of: compose project
name, `container_name`, and the proxy forward host. Keep them identical.

Commit both files and push to GitHub.

## 2. Register the repo (server, once per project)

```bash
~/.claude/skills/run-woodpecker-deploy/wp-onboard.sh colsen-bu/my-project \
  --secret OPENAI_API_KEY=sk-... \
  --secret RESEND_API_KEY=re-...
```

Resolves the GitHub numeric repo id (what `repo add` actually takes), registers
the repo, enables **trusted volumes/network/security**, and creates or updates
each secret. Idempotent — safe to re-run. `--dry-run` prints the CLI calls
without touching anything; `--no-trust` skips the trust flags.

Verified output tail:

```
==> final state
  {
    "full_name": "colsen-bu/AIAvatarWebsite",
    "active": true,
    "default_branch": "main",
    "trusted": { "network": true, "volumes": true, "security": true }
  }
```

Private repos need `export GITHUB_TOKEN=<pat>` for the id lookup.

## 3. Dry-run the pipeline (server) — do this before trusting a push

The driver runs the real `.woodpecker.yml` through the official Woodpecker CLI
against the live docker socket, so the deploy step actually deploys:

```bash
# project files already on this host
~/.claude/skills/run-woodpecker-deploy/wp-exec.sh --dir /path/to/project --quiet

# project lives on the laptop -- pull the tarball from GitHub (no git needed)
~/.claude/skills/run-woodpecker-deploy/wp-exec.sh --github colsen-bu/my-project --ref main --quiet
```

Options: `--branch main`, `--event push|manual|pull_request`, `--ref` (what to
download; `--branch` is only what the pipeline *sees*), `--file`,
`--secret name=value` (repeatable), `--quiet` (last 25 lines — full buildkit
output is enormous). Exit 0 means green.

```
[verify:L18:15s] attempt 6: healthy
[verify:L19:15s] my-project is up
==> pipeline green
```

Check the branch filter while you are here — a non-default branch must build but
not deploy:

```bash
~/.claude/skills/run-woodpecker-deploy/wp-exec.sh --dir /path/to/project --branch feature/x --quiet
# only the `build` step should appear
```

The CLI also lints: it prints `⚠️ Set an event filter for all steps...` for the
broken `when` shape described in Gotchas. Treat those warnings as errors.

## 4. Publish the domain (manual, once per project)

Do this by hand in the nginx-proxy-manager UI on port **81** → *Hosts → Proxy
Hosts → Add Proxy Host*:

| Field | Value | Why |
|---|---|---|
| Domain Names | `my-project.mcvcllmhgb.com` | point its DNS A record at this host first |
| Scheme | `http` | TLS terminates at NPM, not at the app |
| Forward Hostname | `my-project` | the **container name** — NPM resolves it over the `npm_proxy` overlay, so no host port is published |
| Forward Port | `3000` | the port the app listens on *inside* the container |
| Websockets Support | on | harmless; needed by anything using a live connection |
| Block Common Exploits | on | |
| SSL tab | Request a new certificate, Force SSL, agree to Let's Encrypt | the HTTP-01 challenge fails unless DNS already resolves here |

The forward hostname/port pair is exactly what step 5 checks, so if
`wp-verify.sh` passes, the values above are known-good before you type them.

**Optional, untested:** `wp-npm.sh` in this directory drives NPM's REST API to
create the same proxy host (`add <domain> --target <container> --port N [--ssl
--email you@x]`, plus `ls`). Its request payloads are correct under `--dry-run`,
but no call has ever been made against the live API and no NPM credentials are
stored on this host — it reads `NPM_EMAIL`/`NPM_PASSWORD` from
`~/.config/npm-proxy/env`, which does not exist. Treat it as a starting point to
verify, not a working tool.

## 5. Verify

```bash
~/.claude/skills/run-woodpecker-deploy/wp-verify.sh my-project --port 3000
```

```
container state              running
healthcheck                  healthy
networks                     npm_proxy
in-container /health         ok
from nginx-proxy-manager     http=200
==> my-project verified
```

The last line is the one that matters: it `docker exec`s into the live
nginx-proxy-manager container and curls the app by container name — exactly the
hop a proxy host makes. `http=000` there means the proxy cannot reach it no
matter what the NPM UI shows.

## Gotchas

- **`Insufficient trust level to use `volumes``** — a new repo cannot mount
  `docker.sock` until trusted volumes is enabled; the pipeline dies at
  validation before any step runs. `wp-onboard.sh` sets it. Note `wp-exec.sh`
  passes the equivalent CLI flags, so **a local dry-run cannot catch this** —
  it is the one failure mode only the server sees.

- **`when:` list items are OR'd, not AND'd.** This shape, in every older
  pipeline on this host, deploys on a push to *any* branch:

  ```yaml
  when:
    - event: push      # ← two separate conditions, either one matches
    - branch: main
  ```

  Correct — both keys in one list item:

  ```yaml
  when:
    - event: [push, manual]
      branch: ${CI_REPO_DEFAULT_BRANCH}
  ```

  Confirmed by running both forms with `--branch feature/x`: the first ran, the
  second did not. The same bug makes AIAvatarWebsite's `notify` step fire on a
  manual run of a branch that does not exist.

- **Always pin `COMPOSE_PROJECT_NAME`.** Compose derives it from the workspace
  directory — `/woodpecker/src/github.com/<owner>/<repo>` on the agent,
  `/woodpecker/src` under `wp-exec`. When they disagree compose thinks it owns
  nothing, tries to create the container fresh, and dies with
  `Conflict. The container name "/my-project" is already in use`. Fix:
  `docker rm -f my-project`, redeploy. The template pins it.

- **Never use `localhost` in a healthcheck.** In alpine images `localhost`
  resolves to `::1` first; a server bound to `0.0.0.0` is IPv4-only and the check
  gets `can't connect to remote host: Connection refused` while the app is
  demonstrably serving. Cost a 90s `starting` → `unhealthy` cycle. Use `127.0.0.1`.

- **Woodpecker lowercases secret names.** `--secret WP_TOKEN=x` is stored as
  `wp_token`, so the pipeline must say `from_secret: wp_token`. The env var it
  lands in is whatever you name it in the `environment:` block.

- **`${VAR}` in a `commands:` line is eaten by Woodpecker**, which substitutes
  the YAML before the shell sees it — `echo "${MY_TOKEN}"` prints empty. Use
  `$MY_TOKEN` or `$${MY_TOKEN}`. (`${VAR}` in `docker-compose.yml` is fine —
  that is compose's own interpolation, reading the deploy step's env, which is
  where `from_secret` values land.)

- **`docker image prune -f` in CI is broader than it looks.** A bare run
  reclaimed ~100MB by deleting the digest-pinned `woodpecker-server` and
  `woodpecker-agent` images out from under the running swarm services. The
  template uses `--filter "dangling=true"`.

- **The app must join `npm_proxy`** (external, overlay, attachable) and should
  `expose` rather than publish its port. NPM is a swarm service on that same
  overlay and routes by container name; publishing a host port only adds public
  surface.

- **`docker compose up -d --build` alone is enough for a redeploy** — no `down`
  first, so no gap where the site is dead. Verified by changing the served HTML
  and re-running. Only `down` when the compose file's networks or volumes change.

- **`npm.*` labels are documentation.** jc21/nginx-proxy-manager does no
  label-based discovery; the proxy host is created by hand in the UI. The
  labels keep the intended routing next to the service.

- **The `woodpecker-cli` container needs `--user 0` and `XDG_CONFIG_HOME=/tmp`.**
  It insists on creating a config directory before running any command and its
  default user can write neither `~` nor `/tmp`, failing with
  `could not create any of the following paths`. All scripts here handle it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `permission denied ... docker API` from the CLI | The cli image's default user is not in `docker`; the scripts run it `--user 0`. |
| `Conflict. The container name "/x" is already in use` | Stale container from a different compose project. `docker rm -f x`, re-run. |
| Verify step loops `attempt N: starting` then fails | Healthcheck is wrong, not the app. `docker inspect -f '{{json .State.Health}}' <name> \| jq` shows the real error. Usually `localhost` → `127.0.0.1`. |
| `wp-verify.sh` says `not on npm_proxy` | Service is missing `networks: [npm_proxy]`, or `npm_proxy` was not declared `external: true`. |
| `from nginx-proxy-manager http=000` but in-container check ok | Wrong `--port`, or the app binds `127.0.0.1` inside the container instead of `0.0.0.0`. |
| `no .woodpecker.yml in /tmp/...` from `--github` | The repo has no pipeline file at root (e.g. `assay-plate-designer`). Scaffold one first. |
| `download of <repo>@<ref> failed` | `--ref` must be a ref that exists; `--branch` only sets what the pipeline sees. Private repo → `export GITHUB_TOKEN=<pat>`. |
| `Error inserting secret ... duplicate` / `invalid secret event` | Handled by `wp-onboard.sh` (add, fall back to update, always `--event push`). Manually: `repo secret update` requires `--event`. |
| Pipeline green in `wp-exec` but red in Woodpecker | Almost always trusted volumes, or a secret passed with `--secret` locally that was never added to the repo. |

## Host reference

```
woodpecker UI     https://woodpecker.mcvcllmhgb.com
NPM admin UI      http://<host>:81   (proxy hosts are created here, by hand)
proxy network     npm_proxy   (overlay, external, attachable)
stacks            docker stack ls        → npm, woodpecker
app containers    docker ps              → plain compose containers
redeploy infra    /home/opc/deploy-stacks.sh
registered repos  wp-onboard.sh <repo> --dry-run   /   repo ls via the CLI
```
