---
title: Persistent storage (SQL)
description: Run the OP against SQLite / MySQL / PostgreSQL via the database/sql adapter.
pageClass: pg-use-cases-sql-store
---

# Use case — Persistent storage (SQL)

## What does the OP store, and why does it matter where?

The OP holds rows the OAuth/OIDC specs require to be **persistent across restarts**:

- **Refresh-token chains** (RFC 6749 §6, RFC 9700 §4.14) — losing them signs every user out.
- **Registered clients** (OIDC Dynamic Client Registration 1.0 / RFC 7591 when enabled, or static seeds otherwise) — losing them breaks every RP.
- **Sessions** (OIDC RP-Initiated Logout 1.0, Back-Channel Logout 1.0) — needed to fan out logout to other RPs.
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

<svg role="img" aria-labelledby="sql-store-arch-title" viewBox="0 0 816 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="sql-store-arch-title">op.Provider talks to the storeadapter/sql package over the Store interface, which persists each substore to its own table inside the SQL database.</title>
  <rect x="12" y="123" width="142" height="54" rx="8" class="arch-op"/>
  <text x="83" y="150" text-anchor="middle" dominant-baseline="central" class="mono" font-size="13.5" font-weight="600">op.Provider</text>
  <path d="M154 150 H300"/>
  <path d="M294 145 l6 5 -6 5"/>
  <text x="227" y="136" text-anchor="middle" class="lbl" font-size="11.5"><tspan class="mono">Store</tspan> interface</text>
  <rect x="300" y="123" width="170" height="54" rx="8"/>
  <text x="385" y="150" text-anchor="middle" dominant-baseline="central" class="mono" font-size="13.5">storeadapter/sql</text>
  <path d="M470 150 H520"/>
  <path d="M514 145 l6 5 -6 5"/>
  <rect x="520" y="20" width="282" height="260" rx="10" class="arch-db"/>
  <text x="538" y="45" class="mono" font-size="12.5" font-weight="600">SQL DB</text>
  <path d="M538 58 H784" class="arch-db"/>
  <text x="538" y="82" dominant-baseline="central" class="mono" font-size="11.5">oidc_authorization_codes</text>
  <text x="538" y="102" dominant-baseline="central" class="mono" font-size="11.5">oidc_refresh_tokens</text>
  <text x="538" y="122" dominant-baseline="central" class="mono" font-size="11.5">oidc_clients</text>
  <text x="538" y="142" dominant-baseline="central" class="mono" font-size="11.5">oidc_sessions</text>
  <text x="538" y="162" dominant-baseline="central" class="mono" font-size="11.5">oidc_consumed_jtis</text>
  <text x="538" y="182" dominant-baseline="central" class="mono" font-size="11.5">oidc_access_tokens</text>
  <text x="538" y="202" dominant-baseline="central" class="mono" font-size="11.5">oidc_opaque_access_tokens</text>
  <text x="538" y="222" dominant-baseline="central" class="mono" font-size="11.5">oidc_grant_revocations</text>
  <text x="538" y="242" dominant-baseline="central" class="mono" font-size="11.5">oidc_revoked_jtis</text>
  <text x="538" y="262" dominant-baseline="central" class="lbl" font-size="11.5" fill="var(--vp-c-text-3)">… and more</text>
</svg>

Every substore (`AuthorizationCodeStore`, `RefreshTokenStore`, `ClientStore`, `SessionStore`, etc.) maps to a table.

::: info New substores
The SQL adapter bundles tables for the opaque-access-token substore (`oidc_opaque_access_tokens`, populated only when `op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)` or `op.WithAccessTokenFormatPerAudience(...)` is configured) and for the grant-revocation substore (`oidc_grant_revocations` plus `oidc_revoked_jtis`, the backing store for the default `RevocationStrategyGrantTombstone`). Both are part of the transactional cluster — they commit alongside the grant or refresh write that triggered them, so a half-committed cascade cannot leave a revoked grant next to a still-redeemable token.

Embedders shipping a custom `Store` aggregator (rather than reusing the bundled adapters) MUST implement `OpaqueAccessTokens()` and `GrantRevocations()`. `OpaqueAccessTokens()` may return `nil` when neither `WithAccessTokenFormat(op.AccessTokenFormatOpaque)` nor `WithAccessTokenFormatPerAudience` ever names an opaque audience. `GrantRevocations()` may return `nil` only when the embedder also pins `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` (non-FAPI deployments only) — the default `RevocationStrategyGrantTombstone` strategy requires it at construction time. `op.New` fails fast otherwise.
:::

## Code

```go
import (
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
)
```

::: tip Migrations
`*sql.Store.Migrate(ctx)` applies the bundled schema for the active dialect. Run it at deploy time before the first request lands. `Schema()` returns the same DDL as a string for callers that want to hand it to their own migration tool. Schema files are embedded under [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql/schema).
:::

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

The map keys are logical record kinds, not physical names. All eighteen are accepted: `clients`, `authorization_codes`, `refresh_tokens`, `access_tokens`, `opaque_access_tokens`, `grant_revocations`, `revoked_jtis`, `grants`, `sessions`, `par_records`, `interactions`, `consumed_jtis`, `users`, `initial_access_tokens`, `registration_access_tokens`, `op_metadata`, `device_codes`, `ciba_requests`. An unknown key makes `oidcsql.New` fail fast, so a typo is caught at construction time rather than at the first query.

Every resolved physical table name must be distinct. If two logical stores map to the same table, or an override collides with an unlisted default table name, `oidcsql.New` fails at construction time. The schema rewrite is exact-name based, so overriding `clients` cannot accidentally rewrite `client_secrets`-style substrings in the embedded DDL.

> **Source:** [`examples/25-byo-table-names`](https://github.com/libraz/go-oidc-provider/tree/main/examples/25-byo-table-names) renames all eighteen tables under an `auth_` prefix and logs them back from `sqlite_master` to prove the rewrite took effect.

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

## When to add Redis on top

Hot data (interactions, consumed JTIs) churns fast and bloats the durable DB if you put it there. The next page, [Hot/cold + Redis](/use-cases/hot-cold-redis), shows how to route the volatile substores to Redis while keeping the durable substores on SQL.
