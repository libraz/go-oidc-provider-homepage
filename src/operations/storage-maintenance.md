---
title: Storage maintenance
description: Apply SQL schema changes in the right order, schedule retention GC, and monitor the storage work that keeps an OP safe to restart.
outline: 2
pageClass: pg-operations-storage-maintenance
---

# Storage maintenance

An OP restart is routine only when the schema, writers, and retention jobs agree on the same storage contract. Use this page as the checklist for an existing deployment. It covers the SQL adapter in detail and calls out the equivalent work for DynamoDB and custom stores.

## The order of work

Complete these steps before sending traffic to a binary that expects the current storage shape:

1. **Quiesce old MFA writers.** Drain the workers that write TOTP or Email OTP records. Do not run an old writer beside a writer that uses the `row_version` compare-and-swap columns: the old statements do not participate in the opaque version protocol and can overwrite a generation without checking it.
2. **Take a backup and record the migration.** Keep the schema backup, the exact statements applied, and the validation result with the deployment record. Confirm that the recovery procedure in [Backup & disaster recovery](/operations/backup) can restore the durable stores and signing material.
3. **Apply the additive schema changes.** Run the dialect-specific statements from [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) through the normal migration tool. `Store.Migrate` creates missing objects for a new database or development, but `CREATE TABLE IF NOT EXISTS` does not alter an existing table. Do not drop and recreate protocol tables to make the new shape appear.
4. **Validate before starting writers.** Check the three columns, the retention indexes, and the migration tool's recorded state. On MySQL and MariaDB, existing tables need explicit `ALTER TABLE ... ADD INDEX` statements; a fresh `CREATE TABLE` definition cannot upgrade them.
5. **Start the version-aware writers and run a smoke test.** Verify one TOTP or Email OTP write and conditional update, then exercise the protocol path that uses the store. Start the OP replicas only after this check passes.
6. **Enable the retention schedule.** Run the GC job from one scheduler or a leader-elected worker, then watch its counts and latency as traffic resumes.

### Additive SQL shape

Before the first request against an existing SQL database, add:

- `oidc_registration_access_tokens.allowed_scopes`: nullable `TEXT` on SQLite, `JSON` on MySQL/MariaDB, or `JSONB` on PostgreSQL. `NULL` means an unrestricted registration-access-token ceiling, including a token created before this column existed.
- `oidc_totp_secrets.row_version`: `INTEGER NOT NULL DEFAULT 1` on SQLite, or `BIGINT NOT NULL DEFAULT 1` on MySQL/MariaDB and PostgreSQL.
- `oidc_email_otps.row_version`: the same dialect-specific definition as `oidc_totp_secrets.row_version`.

`row_version` is an adapter-managed opaque equality token. Applications must not increment it, compare its order, reuse it after delete/recreate, or assign it meaning. Existing rows start at `1`; a successful conditional transition receives a fresh token.

The current retention and client-deletion indexes are:

| Index | Table and columns |
|---|---|
| `idx_oidc_grants_client_subject` | `oidc_grants(client_id, subject, updated_at)` |
| `idx_oidc_grants_client` | `oidc_grants(client_id)` |
| `idx_oidc_authorization_codes_expires` | `oidc_authorization_codes(expires_at)` |
| `idx_oidc_refresh_tokens_expires` | `oidc_refresh_tokens(expires_at)` |
| `idx_oidc_access_tokens_expires` | `oidc_access_tokens(expires_at)` |
| `idx_oidc_sessions_expires` | `oidc_sessions(expires_at)` |
| `idx_oidc_par_records_expires` | `oidc_par_records(expires_at)` |
| `idx_oidc_interactions_expires` | `oidc_interactions(expires_at)` |
| `idx_oidc_consumed_jtis_expires` | `oidc_consumed_jtis(expires_at)` |

If `WithNaming` changes physical table names, use those names in the migration while keeping the logical index coverage. The [SQL storage guide](/use-cases/sql-store#sql-migration-before-first-request) has the same list with dialect notes.

## Schedule retention GC

The SQL adapter exposes `(*oidcsql.Store).GC(ctx, cutoff) (oidcsql.GCStats, error)`. It does not start a background goroutine or timer, so the application must schedule it:

```go
cutoff := time.Now().UTC().Add(-15 * time.Minute) // keep a short grace window
stats, err := storage.GC(ctx, cutoff)
if err != nil {
  return err
}
log.Printf("oidc GC removed %d rows", stats.Total())
```

The call removes rows whose `expires_at` is strictly before the cutoff from authorization codes, pushed authorization requests (PAR), interactions, sessions, and refresh-token rotation histories. Refresh history remains while a grant still has a live refresh token. When a predecessor has expired, sealed retry-response blobs are cleared even if the containing row remains; that cleanup does not increase a row count. A cutoff in the past leaves a grace period. Passing `time.Now()` reclaims everything already expired.

Run the job at a cadence that keeps expired-row growth within the database's capacity. Use a cron, a leader-elected worker, or an equivalent single scheduler for each store. Record `GCStats`, duration, errors, and the remaining table sizes; alert when the sweep fails or the backlog grows. A transient failure can be investigated and the sweep rerun. Access-token, opaque-token, grant-revocation, and consumed-JTI stores have their own GC methods and policies. DynamoDB device-code and CIBA stores evict expired records on insert, and DynamoDB reads still enforce expiry while TTL cleanup is pending.

## When the job or migration fails

Do not start new writers against a partially validated schema. Check the migration tool's state, inspect the three columns and indexes, and follow the dialect-specific rollback or retry procedure. Keep old MFA writers stopped until the version-aware path is ready; a mixed deployment is unsupported.

GC is a retention operation, not a backup. Keep the durable-store backup and the migration record separate from the GC schedule. After a transient GC error, fix the backend problem, run the same cutoff policy again, and confirm that the next `GCStats` and table-size measurements move in the expected direction.

## Choose the rest of the storage plan

- [Choosing a storage layout](/use-cases/storage-decision) — choose SQL, DynamoDB, a hot/cold split, or a custom boundary.
- [Backup & disaster recovery](/operations/backup) — decide what to restore, what to discard, and how to rehearse recovery.
- [Persistent storage (SQL)](/use-cases/sql-store) — apply the SQL schema and schedule `GC`.
- [DynamoDB storage](/use-cases/dynamodb-store) — provision tables, transactional device-code reservations, and TTL-aware reads.
- [Bring your own store backend](/use-cases/byo-store) — implement hashing, transactions, and concurrency contracts for a custom backend.
