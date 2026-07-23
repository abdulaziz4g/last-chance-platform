# Last Chance — Deployment Blueprint & Security Policies (Phase 6)

## Topology

```
Internet ── Cloudflare (WAF · DDoS · CDN · bot mgmt · TLS)
                │  authenticated origin pulls, origin locked to CF IPs
                ▼
        NGINX Ingress (cert-manager TLS)
        ├── api.…      → backend Service  → Deployment ×3–20 (HPA, PDB ≥2)
        │                 HTTP + /ws/availability (WebSocket)
        └── console.…  → web Service      → Deployment ×2
                │
     Managed PostgreSQL 16 + PostGIS          Managed Redis 7
     (Multi-AZ, PITR, read replica)           (AOF, replica, maxmemory-policy noeviction*)
```

\* `noeviction` is mandatory: BullMQ jobs and rate-limit state must never be
silently evicted. Size the instance, don't let it lie.

- **Data stores are managed services** — never in-cluster StatefulSets for the
  money path. The migrations in `db/migrations/` are the schema authority and
  run as a pre-deploy job (`0001..NNNN` strictly ordered, additive-only once
  released).
- **Scale-out is safe by construction**: double-booking is impossible at the
  DB engine; Redis locks are contention shields; every queue consumer and
  webhook handler is idempotent. Adding pods is purely a throughput decision.
- **OpenSearch** (discovery/search) joins as a managed domain in the search
  phase; the WS availability gateway already fans out per pod via Redis
  Pub/Sub, so no sticky sessions are required anywhere.

## Environments & promotion

| Env | Purpose | Data | Promotion |
|---|---|---|---|
| `dev` | docker compose (`--profile full`) | throwaway | — |
| `staging` | K8s, prod-shaped, MOCK provider enabled | anonymized | auto on main after CI green |
| `production` | K8s, real PSPs | live | manual approval, tag-pinned images |

Images are stamped with the git SHA by CI; `latest` is a convenience alias —
production pins SHAs. Rollback = re-apply the previous SHA (DB migrations are
additive, so old code always runs against new schema).

## Security policies (enforced in code today)

- **AuthN**: JWT (HS256 via jose; issuer-pinned, 1h TTL). Passwords scrypt
  (N=16384, r=8, p=1, per-user salt, self-describing format). Login is
  timing-equalized against unknown emails. Header-based actor fallback exists
  ONLY when `NODE_ENV != production`; the boot fails in production if
  `JWT_SECRET` is left at the dev default.
- **AuthZ**: role guard (`platform_role` ADMIN + derived HOST capability);
  admin reporting surface is ADMIN-gated. Every DB transaction is stamped with
  the *verified* actor — the audit trail attributes real identities.
- **Webhooks**: authenticated by provider HMAC over the raw body (constant-time
  compare, replay-window on Stripe timestamps), idempotent by
  `UNIQUE (provider, event_id)`.
- **Rate limiting**: Redis fixed-window per route+IP across all pods
  (default 120/min; login 10/min; holds 20/min; webhooks 600/min). Fails open
  on Redis outage — availability over throttling; correctness lives in the DB.
- **Containers**: non-root, read-only root FS, all capabilities dropped,
  resource-limited; probes on `/health`.
- **Database**: app role `lastchance_app` cannot DELETE business rows or
  rewrite history (audit/ledger append-only at trigger AND privilege level).
- **Secrets**: External Secrets/Vault → K8s Secrets; nothing real in git
  (`secret.example.yaml` is a template). PCI scope: no PAN/CVV/bank numbers
  anywhere — provider tokens only.

## Operations

- **Backups/DR**: managed PG PITR (≤5 min RPO) + daily logical dumps to
  object storage (30-day retention, restore drilled monthly). Redis: AOF +
  replica; queue loss is tolerable by design (DB sweeper re-derives expiries;
  webhooks redeliver).
- **Observability** (next iteration): pino JSON → log pipeline; request-id
  correlation is already end-to-end; OpenTelemetry traces + RED dashboards
  per route; alerts on `payment_webhook_events.processing_status='FAILED'`,
  ledger imbalance probes, hold-sweeper activity, p99 > 150ms.
- **Zero-downtime deploys**: maxUnavailable=0 rollouts + PDB; BullMQ workers
  close gracefully on SIGTERM (Nest shutdown hooks are enabled).

## CI/CD (.github/workflows/ci.yml)

PRs run the full verification ladder — SQL invariant suite, backend
type-check + unit tests + all three LIVE integration smokes against real
PostGIS/Redis service containers, web build, Flutter analyze+test. `main`
additionally builds and pushes SHA-tagged images to GHCR after all jobs pass.
