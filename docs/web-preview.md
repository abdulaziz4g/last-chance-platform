# Web preview deployments

A throwaway deployment of the web client per pull request, so a UI change can be
inspected on a real device — including a phone — instead of reviewed as a diff.

`.github/workflows/preview.yml` builds and deploys `web/` on any PR that touches
it, then posts the URL as a single comment that updates in place.

## Why not GitHub Pages

Pages serves static files only. This app is not static:

| Feature | Where | Static export |
|---|---|---|
| Middleware | `web/src/middleware.ts` | unsupported |
| Server actions | 10 files using `'use server'` | unsupported |
| API routes | `src/app/api/**/route.ts` (2) | unsupported |
| Dynamic segments | 8 (`[unitId]`, `[dealId]`, `[propertyId]`, …) | needs prerender of every value |

Setting `output: 'export'` would mean removing all four. That is a rewrite of
the application, not a hosting configuration, so Pages is genuinely not an
option here — Vercel is used instead, which runs Next.js natively.

## One-time setup

**Three steps only you can do.** Creating accounts and handling tokens is not
something to hand to an automated agent, so the workflow ships inert and skips
with a notice until these exist.

### 1. Create the Vercel project

1. Sign in at <https://vercel.com> with the GitHub account that owns the repo.
2. **Add New → Project**, import `last-chance-platform`.
3. Set **Root Directory** to `web`. This matters: the repo root has no
   `package.json` for Next.js and the build fails without it.
4. Framework preset should auto-detect as **Next.js**.
5. **Do not** enable Vercel's own Git integration for pull requests if you want
   the workflow to own deployments — otherwise every PR gets deployed twice.
   Using the integration *instead* of this workflow is also fine; see below.

### 2. Add three repository secrets

In GitHub → **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret | Where to find it |
|---|---|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens → Create |
| `VERCEL_ORG_ID` | Vercel project → Settings → General → Team/Account ID |
| `VERCEL_PROJECT_ID` | Vercel project → Settings → General → Project ID |

Scope the token to the project rather than the whole account if the plan allows
it. A token that can only redeploy one preview project is a much smaller thing
to lose than one that can touch everything.

### 3. Point the preview at a backend (optional, see below)

In the Vercel project → **Settings → Environment Variables**, add `BACKEND_URL`
for the **Preview** environment.

## What a preview shows without a backend

**There is no backend deployed.** `deploy/k8s/` holds templates pointing at
`api.lastchance.example`, which is a placeholder, and `BACKEND_URL` falls back
to `http://localhost:3000` — unreachable from Vercel.

So, with no `BACKEND_URL` configured:

- **Renders correctly:** layout, palette, typography, spacing, card shadows and
  radii, navigation, RTL, dark/light, loading skeletons, empty and error states.
- **Does not render:** listings, deals, map pins with prices, bookings, anything
  behind auth.

That is enough to review a **design** change and not enough to review a
**feature**. Since the design system was the reason for wanting previews, it is
useful immediately — but do not mistake an empty Discover page for a bug.

To get full previews, deploy the backend somewhere public and set `BACKEND_URL`
to it. The `images` CI job already pushes `ghcr.io/<owner>/last-chance-platform/backend`
on every merge to `main`, so the artifact exists; it needs a host, a Postgres, a
Redis and an OpenSearch. That is a bigger piece of work than this file.

## Security notes

- **Fork PRs get no preview, deliberately.** GitHub withholds secrets from fork
  workflows, and the guard step skips cleanly rather than failing. Handing
  deployment credentials to a fork would let anyone with a pull request deploy
  arbitrary code as you.
- **The comment step needs `pull-requests: write`** and nothing else. The job
  declares its permissions explicitly rather than inheriting the repository
  default, which is usually wider.
- Previews are **publicly reachable by URL** by default. If a preview is ever
  pointed at real data, turn on Vercel's deployment protection first.

## Alternative: Vercel's own Git integration

Vercel can deploy PRs by itself with no workflow and no secrets in GitHub — it
comments preview URLs directly. It is less code, at the cost of the deployment
being configured in a dashboard rather than in a file that diffs and reviews.

If you prefer that, delete `.github/workflows/preview.yml` and enable the
integration. Do not run both: two deployments per PR, two comments, and the
second URL to appear is not reliably the newer one.

## Seeing it on a phone right now

Previews are the durable answer, but for an immediate look the dev server can be
started locally and reached over the LAN:

```bash
# from web/, with the backend running on :3000
npx next dev -p 3001 -H 0.0.0.0
```

Then open `http://<your-pc-lan-ip>:3001` from the phone on the same Wi-Fi. Find
the IP with `ipconfig` (look for IPv4 under your active adapter). This needs the
PC's firewall to allow inbound 3001 on a private network, and it exposes the dev
server to everything on that network — fine at home, not on café Wi-Fi.
