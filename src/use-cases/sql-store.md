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

> **Sources:**
> - [`examples/06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store) — SQLite quick start (CGO-free).
> - [`examples/07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) — MySQL with a production-shaped pool, paired with an in-process RP and shipped as a docker-compose stack.

## Why a sub-module

The SQL adapter is published as a **separate Go module**, so its driver dependencies (the SQL driver, migration libraries) don't pollute your `go.sum` until you opt in:

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/sql@latest
```

The Redis and DynamoDB adapters are separate modules for the same reason.

## Architecture

<figure class="fig">
  <div class="fig-head">One adapter, one table per substore</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-sqlstore-title" viewBox="0 0 960 144" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-sqlstore-title">The provider talks to the SQL store adapter over the Store interface, and the adapter persists each substore into its own table inside the database you already run.</title>
    <!-- provider -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-m" x="48" y="52">op.Provider</text>
    <text class="fg-s" x="48" y="76">knows nothing about SQL</text>
    <text class="fg-mxs" x="48" y="100">via the Store interface</text>
    <path class="fg-edge" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <!-- adapter -->
    <rect class="fg-box fg-box--accent" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-m fg-accent" x="360" y="52">storeadapter/sql</text>
    <text class="fg-s" x="360" y="76">the only SQL-speaking layer</text>
    <text class="fg-s" x="360" y="100">one table per substore</text>
    <path class="fg-edge fg-edge--accent" d="M616,72 H656" marker-end="url(#fg-ac)"/>
    <!-- database -->
    <rect class="fg-box" x="656" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="672" y="52">Your SQL database</text>
    <text class="fg-mxs" x="672" y="76">oidc_* tables</text>
    <text class="fg-s" x="672" y="100">the schema you already run</text>
  </svg>
  <figcaption class="fig-note">The tables carry an <code>oidc_</code> prefix so they can sit in a schema you already own without colliding with anything. Nothing above them knows the schema exists.</figcaption>
</figure>

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

::: info Tables that fill only on demand
`oidc_opaque_access_tokens` is populated only when `op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)` or `op.WithAccessTokenFormatPerAudience(...)` names an opaque format. `oidc_grant_revocations` and `oidc_revoked_jtis` back the default `RevocationStrategyGrantTombstone`. Both groups commit in the same transaction as the grant or refresh write that triggers them, so a half-committed cascade cannot leave a revoked grant next to a still-redeemable token.

A hand-written `Store` has different rules for which of these substores may be `nil`; see [Bring your own store backend](/use-cases/byo-store).
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

db, err := databasesql.Open("sqlite", "file:op.db?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
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
`Store.Migrate(ctx)` runs the bundled `CREATE TABLE IF NOT EXISTS` statements for the active dialect, then re-reads the tables and fails when a required column is missing. It never alters an existing table, so it suits a fresh database or development. For an existing installation, apply the `ALTER` statements in [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) with your own migration tool first; otherwise `Migrate` stops with an error naming the missing columns. `Schema()` returns the current DDL as a string for review or for that tool. The schema files are embedded under [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql/schema).
:::

## Before the first request on an existing database {#sql-migration-before-first-request}

Apply the migration before starting a binary that uses the current schema. The additive columns are:

| Table | Columns | Purpose |
|---|---|---|
| `oidc_registration_access_tokens` | `allowed_scopes` (nullable) | Scope ceiling of a registration access token; `NULL` means unrestricted, including tokens created before ceilings were stored |
| `oidc_totp_secrets`, `oidc_email_otps` | `row_version` (`NOT NULL DEFAULT 1`) | Adapter-managed opaque compare-and-swap state; applications must not increment, reuse, or interpret it |
| `oidc_authorization_codes` | `auth_time`, `acr`, `amr`, `authorization_details`, `claims`, `authorization_recorded` | `auth_time`, `acr`, `amr`, authorization details and claims request of the authorization that issued the row |
| `oidc_refresh_tokens` | `claims`, `authorization_recorded`, `chain_id` | Same per-authorization state, plus the rotation chain the row belongs to |
| `oidc_opaque_access_tokens` | `authorization_details`, `claims`, `authorization_recorded`, `chain_id` | Same, so introspection and `/userinfo` read the issuing authorization rather than the shared grant |
| `oidc_grant_revocations` | `access_revoked_at` | Cutoff of the tombstone that covers only a grant's access tokens (the cascade of a single refresh-token revocation) |

Column types differ per engine (`TEXT`/`INTEGER` on SQLite, `JSON`/`BIGINT` on MySQL and MariaDB, `JSONB`/`BIGINT` on PostgreSQL), so copy the statements for your engine from `MIGRATIONS.md` rather than writing them by hand. A row left at the default `authorization_recorded = 0` is read from its grant, as it was before the columns existed, and a `chain_id` left empty makes a rotation fall back to the grant.

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

SQLite and PostgreSQL can acquire these indexes through `Migrate()` because their DDL uses separate `CREATE INDEX IF NOT EXISTS` statements. MySQL and MariaDB declare them inside `CREATE TABLE`, so an existing table needs explicit `ALTER TABLE ... ADD INDEX` statements. Existing MySQL and MariaDB installs also need the `MODIFY ... COLLATE utf8mb4_bin` statements in `MIGRATIONS.md` for `oidc_users.username`, `oidc_users.subject`, `oidc_clients.id`, and every `client_id` and `subject` column. MySQL's default collation ignores case and accents, so without them `PutUserWithPassword("Alice", ...)` overwrites the row `alice` already owns and `GetClient("MYAPP")` resolves `myapp`. Apply them before provisioning identifiers that differ only by case or accent; a `MODIFY` fails when two existing values collide under the binary collation, and the error names the rows to reconcile first. PostgreSQL and SQLite compare bytes already and need no equivalent change.

Do not rely on a fresh `v1.sql` run to upgrade an existing database.

Two rollout rules follow from the columns:

- **MFA tables.** Do not run old and current writers against `oidc_totp_secrets` and `oidc_email_otps` together. An old writer omits `row_version` from its updates and bypasses the compare-and-swap protocol. Drain old writers, apply and validate the columns, then start only current writers.
- **Authorization-state and revocation columns.** Old and current writers may run side by side once the columns exist: an old binary leaves `authorization_recorded` at zero and the current binary resolves such a row from its grant. One difference remains: an old node does not read `access_revoked_at`, so until every node runs the current binary, a JWT access token revoked through a single refresh-token revocation still verifies on the old nodes.

The [storage-maintenance](/operations/storage-maintenance) page gives the full rollout order.

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
db, err := databasesql.Open("mysql",
  "oidc:secret@tcp(mysql:3306)/op?parseTime=true&charset=utf8mb4&loc=UTC")
db.SetMaxOpenConns(50)
db.SetMaxIdleConns(10)
db.SetConnMaxLifetime(30 * time.Minute)
db.SetConnMaxIdleTime(5 * time.Minute)
```

The adapter does not tune the pool, so the limits are yours to choose.

Keep `charset=utf8mb4` so 4-byte UTF-8 (emoji, CJK extensions in display names) round-trips through claim values without truncation.

The DSN's connection collation does not replace the explicit `utf8mb4_bin` column definitions. On an existing MySQL or MariaDB database, apply the `MODIFY` statements from [the migration section](#sql-migration-before-first-request) separately.

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

`GC` returns an `oidcsql.GCStats` value with per-table counts for expired authorization codes, PAR records, interactions, sessions, and refresh-token rotation history. The refresh sweep retains history until no refresh token under the grant is live (a per-grant anti-join, so it is the expensive one on a large table), and clears sealed retry-response blobs once the predecessor's own expiry has passed even when the row itself is retained; clearing a blob does not increase a row count. A cutoff in the past keeps a grace window, while `time.Now()` reclaims everything already expired. The adapter starts no background GC goroutine and owns no timer, so schedule and monitor the call yourself. Publish `GCStats`, duration, errors, and remaining table sizes so a stalled sweep is visible. Access-token, opaque-token, grant-revocation, and consumed-JTI stores expose their own policy-sensitive GC methods; device-code and CIBA rows are evicted on their insert paths.

## When to add Redis on top

Hot data (interactions, and sessions if you accept re-login after a cache flush) churns fast and bloats the durable DB if you put it there. The next page, [Hot/cold + Redis](/use-cases/hot-cold-redis), shows how to route the volatile substores to Redis while keeping the durable substores on SQL.
