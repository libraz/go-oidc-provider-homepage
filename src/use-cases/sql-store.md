---
title: Persistent storage (SQL)
description: Run the OP on SQLite, MySQL, or PostgreSQL with additive schema migrations and scheduled retention GC through the database/sql adapter.
pageClass: pg-use-cases-sql-store
---

# Use case — Persistent storage (SQL)

## What does the OP store, and why does it matter where?

The OP holds rows the OAuth/OIDC specs require to be **persistent across restarts**:

- **Refresh-token chains** (RFC 6749 §6, RFC 9700 §4.14) — losing them signs every user out.
- **Registered clients** (OIDC Dynamic Client Registration 1.0 / RFC 7591 when enabled, or static seeds otherwise) — losing them breaks every RP.
- **Sessions** (OIDC RP-Initiated Logout 1.0) — preserve browser login state and RP-initiated logout state across restarts.
- **Consent grants** (OIDC Core 1.0 §3.1.2.4) — losing them re-prompts every user on every restart.
- **Audit / introspection / revocation shadow rows** — the access-token registry described in [Tokens](/concepts/tokens).

The default `inmem` store loses everything on restart, which is fine for tests and demos but unsafe for production. The library ships [`op/storeadapter/sql`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql), a `database/sql` adapter that targets **SQLite, MySQL 8.0+, and PostgreSQL 14+**.

> **Sources:** - [`examples/06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store) — SQLite quick start (CGO-free). - [`examples/07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) — MySQL with production-shaped pool, paired with an in-process RP and shipped as a docker-compose stack.

## Why a sub-module

The SQL adapter is published as a **separate Go module**, so its driver dependencies (the SQL driver, migration libraries) don't pollute your `go.sum` until you opt in:

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/sql@latest
```

The same applies to the Redis adapter.

## Architecture

<svg role="img" aria-labelledby="sql-store-arch-title" viewBox="0 0 760 120" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="sql-store-arch-title">op.Provider talks to the storeadapter/sql package over the Store interface, and the adapter persists each substore to its own table inside the SQL database.</title>
  <rect x="16" y="30" width="180" height="60" rx="8" class="arch-op"/>
  <text x="106" y="60" text-anchor="middle" dominant-baseline="central" class="mono" font-size="13.5" font-weight="600">op.Provider</text>
  <path d="M196 60 H298"/>
  <path d="M292 55 l6 5 -6 5"/>
  <text x="247" y="48" text-anchor="middle" class="lbl" font-size="11.5"><tspan class="mono">Store</tspan> interface</text>
  <rect x="300" y="30" width="190" height="60" rx="8"/>
  <text x="395" y="60" text-anchor="middle" dominant-baseline="central" class="mono" font-size="13.5">storeadapter/sql</text>
  <path d="M490 60 H578"/>
  <path d="M572 55 l6 5 -6 5"/>
  <rect x="580" y="30" width="164" height="60" rx="10" class="arch-db"/>
  <text x="662" y="55" text-anchor="middle" class="mono" font-size="13.5" font-weight="600">SQL DB</text>
  <text x="662" y="75" text-anchor="middle" class="lbl" font-size="11" fill="var(--vp-c-text-3)">oidc_* tables</text>
</svg>

Each substore maps to one table. These are the tables the protocol paths touch most:

| Table | What it holds |
|---|---|
| `oidc_clients` | Registered client metadata — the backing table for `ClientStore`. |
| `oidc_authorization_codes` | Authorization codes waiting to be redeemed at `/token`. |
| `oidc_refresh_tokens` | Refresh-token chains and their rotation state. |
| `oidc_grants` | The grant a code or refresh token hangs off: client, subject, scope. |
| `oidc_access_tokens` | JTI registry for issued access tokens, written only under `RevocationStrategyJTIRegistry`. |
| `oidc_opaque_access_tokens` | Opaque access-token records, written only when an opaque access-token format is configured. |
| `oidc_grant_revocations` | Grant tombstones for the default `RevocationStrategyGrantTombstone`. |
| `oidc_revoked_jtis` | Individually revoked token identifiers, alongside the tombstones above. |
| `oidc_sessions` | Browser login sessions and their chooser groups. |
| `oidc_consumed_jtis` | The consumed-`jti` replay set for request objects, client assertions, and DPoP proofs. |

The adapter also owns tables for users, interactions, PAR records, device and CIBA requests, dynamic-registration tokens, and the authenticator substores. `Schema()` returns the full dialect-specific DDL.

::: info New substores
The SQL adapter bundles tables for the opaque-access-token substore (`oidc_opaque_access_tokens`, populated only when `op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)` or `op.WithAccessTokenFormatPerAudience(...)` is configured) and for the grant-revocation substore (`oidc_grant_revocations` plus `oidc_revoked_jtis`, the backing store for the default `RevocationStrategyGrantTombstone`). Both are part of the transactional cluster — they commit alongside the grant or refresh write that triggered them, so a half-committed cascade cannot leave a revoked grant next to a still-redeemable token.

Embedders shipping a custom `Store` aggregator (rather than reusing the bundled adapters) MUST implement `OpaqueAccessTokens()` and `GrantRevocations()`. `OpaqueAccessTokens()` may return `nil` when neither `WithAccessTokenFormat(op.AccessTokenFormatOpaque)` nor `WithAccessTokenFormatPerAudience` ever names an opaque audience. `GrantRevocations()` may return `nil` only when the embedder also pins `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` (non-FAPI deployments only) — the default `RevocationStrategyGrantTombstone` strategy requires it at construction time. `op.New` fails fast otherwise.
:::

## Code

```go
import (
  "context"
  databasesql "database/sql"
  _ "modernc.org/sqlite" // or your MySQL / Postgres driver

  "github.com/libraz/go-oidc-provider/op"
  oidcsql "github.com/libraz/go-oidc-provider/op/storeadapter/sql"
)

db, err := databasesql.Open("sqlite", "file:op.db?_journal=WAL&_busy_timeout=5000")
if err != nil { /* ... */ }

storage, err := oidcsql.New(db, oidcsql.SQLite()) // or oidcsql.MySQL() / oidcsql.Postgres()
if err != nil { /* ... */ }

if err := storage.Migrate(context.Background()); err != nil {
  /* ... */
}

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(storage),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(op.LoginFlow{
    Primary: op.PrimaryPassword{Store: storage.UserPasswords()},
  }),
)
```

::: tip Migrations
`*sql.Store.Migrate(ctx)` applies the bundled schema for the active dialect, but its `CREATE TABLE IF NOT EXISTS` statements do not alter an existing table. It is suitable for a fresh database or development; an existing installation must apply the additive statements in [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) with the deployment's migration tool rather than relying on `Migrate` alone. SQLite and PostgreSQL can use `Migrate` to reapply their standalone index statements, but missing compatibility columns and the MySQL/MariaDB username-collation change still require explicit `ALTER` statements. `Schema()` returns the current DDL as a string for callers that want to review or hand it to that tool. Schema files are embedded under [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql/schema).
:::

## Before the first request on an existing database {#sql-migration-before-first-request}

Apply the migration before starting a binary that uses the current MFA and dynamic-registration contracts. The additive changes are `oidc_registration_access_tokens.allowed_scopes` (nullable), `oidc_totp_secrets.row_version`, and `oidc_email_otps.row_version` (both `NOT NULL DEFAULT 1`). Use `TEXT` / `INTEGER` on SQLite, `JSON` / `BIGINT` on MySQL or MariaDB, and `JSONB` / `BIGINT` on PostgreSQL. `allowed_scopes = NULL` means an unrestricted registration access-token ceiling, including a RAT created before scope ceilings were stored. The `row_version` columns are adapter-managed opaque compare-and-swap state; applications must not increment, reuse, or assign meaning to them.

The current retention and client-deletion queries also require these exact indexes (substitute the physical names selected by `WithNaming`):

| Index | Table and columns | Purpose |
|---|---|---|
| `idx_oidc_grants_client_subject` | `oidc_grants(client_id, subject, updated_at)` | Bounded subject enumeration during client deletion |
| `idx_oidc_grants_client` | `oidc_grants(client_id)` | Client-scoped cascade |
| `idx_oidc_authorization_codes_expires` | `oidc_authorization_codes(expires_at)` | Expired-code retention sweep |
| `idx_oidc_refresh_tokens_expires` | `oidc_refresh_tokens(expires_at)` | Refresh-history retention sweep |
| `idx_oidc_refresh_tokens_client` | `oidc_refresh_tokens(client_id)` | Client-deletion cascade |
| `idx_oidc_access_tokens_expires` | `oidc_access_tokens(expires_at)` | Access-token retention queries |
| `idx_oidc_access_tokens_client` | `oidc_access_tokens(client_id)` | Client-deletion cascade |
| `idx_oidc_opaque_access_tokens_client` | `oidc_opaque_access_tokens(client_id)` | Client-deletion cascade |
| `idx_oidc_sessions_expires` | `oidc_sessions(expires_at)` | Session retention sweep |
| `idx_oidc_par_records_expires` | `oidc_par_records(expires_at)` | PAR retention sweep |
| `idx_oidc_interactions_expires` | `oidc_interactions(expires_at)` | Interaction retention sweep |
| `idx_oidc_consumed_jtis_expires` | `oidc_consumed_jtis(expires_at)` | Replay-marker retention queries |

SQLite and PostgreSQL can acquire these indexes through `Migrate()` because their DDL uses separate `CREATE INDEX IF NOT EXISTS` statements. MySQL and MariaDB declare them inside `CREATE TABLE`, so an existing table needs explicit `ALTER TABLE ... ADD INDEX` statements. Existing MySQL and MariaDB installs also need `oidc_users.username` changed with `ALTER TABLE oidc_users MODIFY username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;`; apply it before provisioning usernames that differ only by case, and resolve any existing case-insensitive collisions first. PostgreSQL and SQLite need no equivalent collation change. Do not rely on a fresh `v1.sql` run to upgrade an existing database, and do not run old and current MFA writers against the same tables: drain old writers, apply and validate the columns, then start only writers that participate in the opaque version protocol. The [storage-maintenance](/operations/storage-maintenance) page gives the rollout order.

## Renaming the tables

The adapter's bundled tables are named `oidc_clients`, `oidc_refresh_tokens`, and so on. If you are grafting the OP onto a database that already owns a `clients` table — or your house style forbids the `oidc_` prefix — `oidcsql.WithNaming` rewrites the physical table name for any of the OP-internal record kinds. The adapter validates every physical name against the SQL standard identifier grammar, rewrites the embedded DDL, and builds every query against the renamed tables, so `Schema()` / `Migrate()` and the runtime queries stay in lockstep.

```go
storage, err := oidcsql.New(db, oidcsql.Postgres(), oidcsql.WithNaming(map[string]string{
  "clients":        "auth_clients",
  "refresh_tokens": "auth_refresh_tokens",
  "authorization_codes": "auth_codes",
  // ...rename as many as you like; unlisted kinds keep their oidc_ default.
}))
```

The map keys are logical record kinds, not physical names. `oidcsql.New` accepts these 23 keys:

| Area | Logical keys |
|---|---|
| Clients and grants | `clients`, `grants`, `authorization_codes`, `refresh_tokens` |
| Access tokens | `access_tokens`, `opaque_access_tokens` |
| Revocation | `grant_revocations`, `revoked_jtis` |
| Browser-facing state | `sessions`, `interactions` |
| PAR and replay markers | `par_records`, `consumed_jtis` |
| Users | `users` |
| Dynamic registration | `initial_access_tokens`, `registration_access_tokens` |
| Provider metadata | `op_metadata` |
| Device flow and CIBA | `device_codes`, `ciba_requests` |
| Authenticator factors | `totp_secrets`, `passkeys`, `recovery_codes`, `email_otps`, `authn_lockouts` |

An unknown key makes `oidcsql.New` fail fast, so a typo is caught at construction time rather than at the first query.

Every resolved physical table name must be distinct. If two logical stores map to the same table, or an override collides with an unlisted default table name, `oidcsql.New` fails at construction time. The schema rewrite is exact-name based, so overriding `clients` cannot accidentally rewrite `client_secrets`-style substrings in the embedded DDL.

> **Source:** [`examples/25-byo-table-names`](https://github.com/libraz/go-oidc-provider/tree/main/examples/25-byo-table-names) renames all 23 tables under an `auth_` prefix and logs them back from `sqlite_master` to prove the rewrite took effect.

::: warning Table names only, not column names
`WithNaming` rewrites table names. The column layout is fixed — the adapter owns it. If you need custom **column** names too (an existing schema you cannot reshape, encrypted columns, a shared table), implement the `store` interfaces yourself instead of using the bundled adapter. See [Bring your own store backend](/use-cases/byo-store).
:::

## MySQL pool sizing

[`examples/07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) demonstrates a production-shaped DSN:

```go
db, err := stdsql.Open("mysql",
  "oidc:secret@tcp(mysql:3306)/op?parseTime=true&charset=utf8mb4&collation=utf8mb4_0900_ai_ci")
db.SetMaxOpenConns(64)
db.SetMaxIdleConns(8)
db.SetConnMaxLifetime(30 * time.Minute)
```

`charset=utf8mb4` is required so 4-byte UTF-8 (emoji, CJK extensions in display names) round-trips through claim values without truncation.

The DSN's connection collation does not replace the explicit `oidc_users.username` definition. On an existing MySQL or MariaDB database, apply the `ALTER TABLE oidc_users MODIFY username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;` migration separately; a case-insensitive collision makes it fail and must be resolved before the change.

## Username + password credentials

The SQL adapter implements `store.UserPasswordStore` (the same surface the inmem reference adapter exposes) so the built-in [`op.PrimaryPassword`](/use-cases/mfa-step-up) Step works against SQL with no glue code:

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: storage.UserPasswords()},
}

provider, err := op.New(
  /* ... */
  op.WithLoginFlow(flow),
)
```

The schema adds two columns on `oidc_users`: a unique `username` lookup index (used by `FindByUsername`) and a PHC-encoded `password_hash` column (read by `ReadPasswordHash`). Hash encoding stays in the embedder's hands — the convenience writer `*sql.Store.PutUserWithPassword(ctx, user, username, hash)` accepts a hash produced by `op.HashPassword` (argon2id with the library defaults) and round-trips through the same upsert as `PutUser`:

```go
hash, _ := op.HashPassword("demo")
_ = storage.PutUserWithPassword(ctx, &store.User{
  Subject: "demo-user",
  Claims:  map[string]any{"name": "Demo User"},
}, "demo", hash)
```

Passing an empty username and `nil` hash clears the credential — useful when a user migrates to passkey-only. `ReadPasswordHash` returns `store.ErrNotFound` both when the subject is unknown and when the row exists but carries no password, so the login orchestrator surfaces an enumeration-safe response either way.

## Contract test harness

The same contract test suite (`op/store/contract`) that exercises `inmem` runs against the SQL adapter under `go test -tags=testcontainers`, spinning up real MySQL / Postgres engines via testcontainers-go. So when the library says "the SQL adapter implements `Store`," it means against a real engine, not a mock. The pinned images (`mysql:8.4`, `postgres:16-alpine`) match the engine matrix the docker-compose stacks under `examples/07-mysql-store` and `examples/09-redis-volatile` use, so adapter-level and example-level integration share a single matrix.

## Schedule retention GC

The SQL adapter does not delete every expired row in the request path. Schedule `(*oidcsql.Store).GC(ctx, cutoff)` from the application's cron, leader-elected worker, or other maintenance scheduler:

```go
cutoff := time.Now().UTC().Add(-15 * time.Minute) // retain a short forensic grace window
stats, err := storage.GC(ctx, cutoff)
if err != nil {
  return err
}
log.Printf("oidc GC removed %d rows", stats.Total())
```

`GC` returns an `oidcsql.GCStats` value with per-table counts for expired authorization codes, PAR records, interactions, sessions, and refresh-token rotation history. The refresh sweep retains history until no refresh token under the grant is live, and clears sealed retry-response blobs once the predecessor's own expiry has passed even when the row itself is retained; clearing a blob does not increase a row count. A cutoff in the past keeps a grace window, while `time.Now()` reclaims everything already expired. The adapter starts no background GC goroutine and owns no timer, so schedule and monitor the call yourself. Publish `GCStats`, duration, errors, and remaining table sizes so a stalled sweep is visible. Access-token, opaque-token, grant-revocation, and consumed-JTI stores expose their own policy-sensitive GC methods; device-code and CIBA rows are evicted on their insert paths.

## When to add Redis on top

Hot data (interactions, consumed JTIs) churns fast and bloats the durable DB if you put it there. The next page, [Hot/cold + Redis](/use-cases/hot-cold-redis), shows how to route the volatile substores to Redis while keeping the durable substores on SQL.
