---
title: Storage maintenance
description: Apply SQL schema changes in the right order, schedule retention GC, and monitor the storage work that keeps an OP safe to restart.
outline: 2
---

# Storage maintenance

An OP restart is routine only when the schema, the writers, and the retention jobs agree on the same storage contract. Use this page as the checklist for upgrading an existing deployment. It covers the SQL adapter in detail, then calls out what DynamoDB and custom stores need.

::: info Why a schema step exists
`Store.Migrate` runs `CREATE TABLE IF NOT EXISTS`, which leaves an existing table untouched. A release that adds columns therefore needs explicit `ALTER TABLE` statements on a database created by an earlier release. `Migrate` re-reads the tables afterwards and fails when a required column is missing, so a forgotten `ALTER` stops the start-up instead of surfacing later as a query error. If your deployment never calls `Migrate`, the first request that touches a missing column fails instead.
:::

## The order of work

Complete these steps before sending traffic to a binary that expects the current storage shape:

1. **Quiesce old MFA writers.** Drain the workers that write TOTP or Email OTP records. Do not run an old writer beside a writer that uses the `row_version` compare-and-swap columns: the old statements do not participate in the opaque version protocol and can overwrite a generation without checking it. The authorization-state and chain columns below do not need this: older binaries can keep writing alongside newer ones.
2. **Take a backup and record the migration.** Keep the schema backup, the exact statements applied, and the validation result with the deployment record. Confirm that the recovery procedure in [Backup & disaster recovery](/operations/backup) can restore the durable stores and signing material.
3. **Apply the additive schema changes.** Run the dialect-specific statements from [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) through the normal migration tool. `Store.Migrate` creates missing objects for a new database or development, but `CREATE TABLE IF NOT EXISTS` does not alter an existing table. Do not drop and recreate protocol tables to make the new shape appear.
4. **Validate before starting writers.** Check every added column, all retention and client-deletion indexes, the MySQL/MariaDB collations, and the migration tool's recorded state. On MySQL and MariaDB, existing tables need explicit `ALTER TABLE ... ADD INDEX` statements and the explicit collation changes; a fresh `CREATE TABLE` definition cannot upgrade them.
5. **Start the version-aware writers and run a smoke test.** Verify one TOTP or Email OTP write and conditional update, then exercise the protocol path that uses the store. Start the OP replicas only after this check passes.
6. **Enable the retention schedule.** Run the GC job from one scheduler or a leader-elected worker, then watch its counts and latency as traffic resumes.

### Additive SQL shape

Before the first request against an existing SQL database, add the columns below. [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) has the exact statement and column type for each dialect.

| Table | Columns | What they hold |
|---|---|---|
| `oidc_registration_access_tokens` | `allowed_scopes` | scope ceiling of a registration access token; nullable, and `NULL` means unrestricted |
| `oidc_totp_secrets`, `oidc_email_otps` | `row_version` | opaque compare-and-swap token; `NOT NULL DEFAULT 1` |
| `oidc_authorization_codes` | `auth_time`, `acr`, `amr`, `authorization_details`, `claims`, `authorization_recorded` | the authentication result and `claims` request of the authorization that issued the code |
| `oidc_refresh_tokens` | `claims`, `authorization_recorded`, `chain_id` | the same per-authorization state, and the rotation chain the row belongs to |
| `oidc_opaque_access_tokens` | `authorization_details`, `claims`, `authorization_recorded`, `chain_id` | the same per-authorization state, and the refresh chain that minted the token |
| `oidc_grant_revocations` | `access_revoked_at` | cutoff of a tombstone that covers a grant's access tokens only |

Existing MySQL/MariaDB installs also need the `MODIFY` statements that pin `oidc_users.username` and every `client_id` and `subject` column to `utf8mb4_bin`, so identifiers that differ only in case or accents stay distinct rows. Apply them before provisioning such identifiers. A `MODIFY` fails when two existing values collide under the binary collation, and you resolve those rows first. SQLite and PostgreSQL already compare these columns byte for byte.

Two properties of the new columns shape the rollout:

- **Defaults read as "not recorded".** A row with `authorization_recorded = 0` or an empty `chain_id` resolves from its grant, which is how a row written before the columns existed behaves. Old and new binaries may therefore write the same tables side by side.
- **Old nodes do not see the new tombstone.** An older binary never reads `access_revoked_at`. Until every node runs the new binary, a JWT access token whose grant was revoked by revoking a single refresh token still verifies on the older nodes.

`row_version` is an adapter-managed opaque equality token. Applications must not increment it, compare its order, reuse it after delete/recreate, or assign it meaning. Existing rows start at `1`; a successful conditional transition receives a fresh token.

The current retention and client-deletion indexes are:

| Index | Table and columns |
|---|---|
| `idx_oidc_grants_client_subject` | `oidc_grants(client_id, subject, updated_at)` |
| `idx_oidc_grants_client` | `oidc_grants(client_id)` |
| `idx_oidc_authorization_codes_expires` | `oidc_authorization_codes(expires_at)` |
| `idx_oidc_refresh_tokens_expires` | `oidc_refresh_tokens(expires_at)` |
| `idx_oidc_refresh_tokens_client` | `oidc_refresh_tokens(client_id)` |
| `idx_oidc_access_tokens_expires` | `oidc_access_tokens(expires_at)` |
| `idx_oidc_access_tokens_client` | `oidc_access_tokens(client_id)` |
| `idx_oidc_opaque_access_tokens_client` | `oidc_opaque_access_tokens(client_id)` |
| `idx_oidc_sessions_expires` | `oidc_sessions(expires_at)` |
| `idx_oidc_par_records_expires` | `oidc_par_records(expires_at)` |
| `idx_oidc_interactions_expires` | `oidc_interactions(expires_at)` |
| `idx_oidc_consumed_jtis_expires` | `oidc_consumed_jtis(expires_at)` |

SQLite and PostgreSQL pick these indexes up from `Migrate()`, because their DDL emits standalone `CREATE INDEX IF NOT EXISTS` statements. MySQL and MariaDB declare the same indexes inside `CREATE TABLE`, so an existing table gains them only from an explicit `ALTER TABLE ... ADD INDEX`. If `WithNaming` changes the physical table names, write the migration against those names and keep the logical index coverage identical. The [SQL storage guide](/use-cases/sql-store#sql-migration-before-first-request) repeats this list with the dialect notes.

## Schedule retention GC

The SQL adapter exposes `(*oidcsql.Store).GC(ctx, cutoff) (oidcsql.GCStats, error)`. It does not start a background goroutine or timer, so the application must schedule it. Here `storage` is the `*oidcsql.Store` you passed to `op.WithStore`:

```go
cutoff := time.Now().UTC().Add(-15 * time.Minute) // keep a short grace window
stats, err := storage.GC(ctx, cutoff)
if err != nil {
  return err
}
log.Printf("oidc GC removed %d rows", stats.Total())
```

That one call is not the whole retention story. Some substores carry their own `GC` method, and a few records retire themselves without any sweep:

| Swept by | Substores | Notes |
|---|---|---|
| `(*Store).GC(ctx, cutoff)` | authorization codes, pushed authorization requests (PAR), interactions, sessions, refresh-token rotation histories | one call, one cutoff; the per-substore counts come back in `GCStats` |
| the substore's own `GC` method | access tokens, opaque access tokens, grant revocations, consumed JTIs | separate methods, each with its own cutoff |
| nothing — the record retires itself | device codes and CIBA requests | the SQL adapter deletes expired rows on insert; DynamoDB uses a TTL attribute and still enforces expiry on read while TTL cleanup is pending |

The other sweeps are one call per substore. The first three are methods of their `store` interfaces. The consumed-JTI sweep is a method of the adapter's concrete type, so reach it with a type assertion:

```go
for _, gc := range []func(context.Context, time.Time) (int, error){
    storage.AccessTokens().GC,
    storage.OpaqueAccessTokens().GC,
    storage.GrantRevocations().GC,
} {
    if _, err := gc(ctx, cutoff); err != nil {
        return err
    }
}
if j, ok := storage.ConsumedJTIs().(interface {
    GC(context.Context, time.Time) (int64, error)
}); ok {
    if _, err := j.GC(ctx, cutoff); err != nil {
        return err
    }
}
```

Each deletes rows whose `expires_at` is strictly before the cutoff. A grant-revocation tombstone is written with an expiry past the access tokens it covers, so sweeping at the current time never un-revokes a live token.

`(*Store).GC` deletes rows whose `expires_at` is strictly before the cutoff. Refresh history is the exception: a rotation record survives while its grant still has a live refresh token. Once a predecessor has expired, the adapter clears its sealed retry-response blob even when the containing row stays, and that cleanup does not move a row count. The cutoff is how you choose a grace period — a cutoff in the past leaves one, and `time.Now()` reclaims everything already expired.

The refresh-token sweep is the expensive one, because it checks each candidate row against its grant instead of scanning a range. On a large table, schedule it off-peak. If a table fails part-way, `GC` returns the counts collected so far with the error, and repeating the sweep is safe.

Run the job at a cadence that keeps expired-row growth within the database's capacity. Give each store exactly one scheduler: a cron entry, a leader-elected worker, or an equivalent. Record `GCStats`, duration, errors, and the remaining table sizes, and alert when the sweep fails or the backlog grows. A missed sweep costs table size rather than safety: a code, PAR record, interaction, session, or refresh token that has passed its `expires_at` is refused on read whether or not the sweep has reached it.

## When the job or migration fails

Do not start new writers against a partially validated schema. Check the migration tool's state, inspect the added columns, all required indexes, and the MySQL/MariaDB collations, then follow the dialect-specific rollback or retry procedure. Keep old MFA writers stopped until the version-aware path is ready; a mixed deployment is unsupported.

GC is a retention operation, not a backup. Keep the durable-store backup and the migration record separate from the GC schedule. After a transient GC error, fix the backend problem, run the same cutoff policy again, and confirm that the next `GCStats` and table-size measurements move in the expected direction.

## DynamoDB and custom stores

DynamoDB items carry no fixed column set, so there is no `ALTER` step. The adapter implements chain-scoped revocation, but it does not persist the per-authorization fields marked by `AuthorizationRecorded`, so those values resolve from the grant. Provision tables and TTL settings as described in [DynamoDB storage](/use-cases/dynamodb-store).

A bring-your-own store takes the new fields as an opt-in. `store.RefreshToken` and `store.OpaqueAccessToken` carry `ChainID`, `store.GrantTombstone` carries `AccessTokensOnly`, and the authorization code, refresh token, and opaque access token carry the per-authorization fields marked by `AuthorizationRecorded`. Two optional interfaces use them: `store.OpaqueAccessTokenChainRevoker` retires one chain's opaque access tokens, and `store.IssuanceRevocationChecker` lets an access-token-only tombstone leave refresh and code redemption alone. A store that persists none of this keeps the grant-wide behaviour: revoking one refresh token or rotating one device's chain then reaches that user's other sessions on the same client. See [Bring your own store backend](/use-cases/byo-store).

## Choose the rest of the storage plan

- [Choosing a storage layout](/use-cases/storage-decision) — choose SQL, DynamoDB, a hot/cold split, or a custom boundary.
- [Backup & disaster recovery](/operations/backup) — decide what to restore, what to discard, and how to rehearse recovery.
- [Persistent storage (SQL)](/use-cases/sql-store) — apply the SQL schema and schedule `GC`.
- [DynamoDB storage](/use-cases/dynamodb-store) — provision tables, transactional device-code reservations, and TTL-aware reads.
- [Bring your own store backend](/use-cases/byo-store) — implement hashing, transactions, and concurrency contracts for a custom backend.
