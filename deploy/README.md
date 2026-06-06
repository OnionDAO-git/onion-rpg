# Deploying the Onion RPG game server

Two independent targets, one shared image (`Dockerfile`). Both run the
SvelteKit (`adapter-node`) server on Bun, apply the idempotent Postgres schema
on boot (`bun scripts/db-init.ts`), and health-check `GET /api/gauge`.

The beacon firmware, badge Lua, and simulator are **not** deployed here — only
the HTTP game server + its Postgres DB.

## Required secrets

`.env` (copied from `.env.example`) drives both targets. The scripts
auto-generate the secrets the app owns and warn about the ones only you can
provide:

| Variable | Source |
| --- | --- |
| `BEACON_API_KEY` | auto-generated (use it when flashing beacons) |
| `ONION_CALLBACK_SECRET` | auto-generated |
| `ANTHROPIC_API_KEY` | **you** — Claude API key |
| `ONION_EXTERNAL_API_KEY` | **you** — issued by the Onion DAO API |
| `DATABASE_URL` | managed by the target (compose service / Railway plugin) |

Optional: `STT_*` (voice), `SOLANA_RPC_URL`, `STORYTELLER_MODEL_*`.

---

## Target 1 — Docker Compose (self-hosted)

```bash
./deploy/docker.sh          # prepares .env, builds, starts Postgres + app
```

App: <http://localhost:3000> · health: `/api/gauge`.

```bash
./deploy/docker.sh logs     # tail logs
./deploy/docker.sh down     # stop (keeps DB volume)
./deploy/docker.sh destroy  # stop + delete DB volume
```

`DATABASE_URL` is wired to the compose `postgres` service automatically, so the
localhost value in `.env` (used for `bun dev`) is ignored inside the stack.

---

## Target 2 — Railway

One-time setup (everything else is automated):

1. Create a Railway account → <https://railway.com>
2. `brew install railway` (or `npm i -g @railway/cli`)
3. `railway login` — opens a browser. The script auto-runs this if you're not
   logged in.
4. _Optional:_ create a workspace/team in the dashboard if you want to deploy
   somewhere other than your personal workspace — you'll pick it in step ↓.

Then:

```bash
./deploy/railway.sh         # pick workspace + project, add Postgres, push vars, deploy
```

On the first run (or any run with `RELINK=1`) the script asks whether to **link
an existing project** or **create a new one**, and in both cases lets you
**choose the workspace/team** to deploy into:

```bash
RELINK=1 ./deploy/railway.sh   # re-pick workspace/project for this directory
```

After selection it provisions a `Postgres` service, references it as
`DATABASE_URL=${{Postgres.DATABASE_URL}}`, pushes every other key from `.env`,
runs the idempotent schema migration against Railway Postgres, deploys via the
`Dockerfile`, assigns a `*.up.railway.app` domain, and points
`ONION_CALLBACK_URL` at it. Nothing else needs clicking in the dashboard.

Override names with env vars: `PROJECT_NAME` (used when creating a new project),
`APP_SERVICE`, `PG_SERVICE`, `ENVIRONMENT`. Set `RUN_DB_MIGRATIONS=false` to
skip the explicit pre-deploy schema apply. Re-run anytime to push new vars or
redeploy.

---

## After deploy

Flash beacons against the deployed server:

```bash
cd beacon
./scripts/flash_spiffs.sh --challenge 0.1 --beacon-id b-ketchup-01 \
  --server-url "https://<your-host>" --api-key "$BEACON_API_KEY" ...
```

`BEACON_API_KEY` is printed at the end of both deploy scripts.
