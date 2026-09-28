---
title: Backup & disaster recovery
description: Back up durable OIDC state, schema, and keys, then rehearse recovery with per-substore RPOs.
outline: 2
pageClass: pg-operations-backup
---

# Backup & disaster recovery

The OP itself is stateless. Recovery posture is entirely a property of your `store.Store` — what's persistent, what's volatile, and what your recovery point objective (RPO) is per substore.

<figure class="fig">
  <div class="fig-head">What to restore, and what never to</div>
  <svg class="fig-svg" role="img" aria-labelledby="backup-policy-title" viewBox="0 0 960 268" xmlns="http://www.w3.org/2000/svg">
    <title id="backup-policy-title">A backup policy in four rows. The OP process itself holds nothing. Durable substores are backed up and restored. Short-lived state is discarded and recreated by a retry. The consumed-JTI set is never restored, because restoring it would reopen a replay window.</title>
    <text class="fg-lbl" x="40" y="26">what it is</text>
    <text class="fg-lbl" x="484" y="26">what to do with it</text>
    <line class="fg-rule fg-rule--strong" x1="36" y1="36" x2="924" y2="36"/>
    <!-- process -->
    <rect class="fg-box fg-box--muted" x="36" y="48" width="420" height="44" rx="6"/>
    <text class="fg-t2" x="54" y="68">OP process</text>
    <text class="fg-xs" x="54" y="84">holds no state of its own</text>
    <path class="fg-edge fg-edge--thin" d="M460,70 H476" marker-end="url(#fg-a)"/>
    <text class="fg-t2" x="484" y="68">Nothing to back up</text>
    <text class="fg-xs" x="484" y="84">a replacement instance is equivalent</text>
    <!-- durable -->
    <rect class="fg-box fg-box--accent" x="36" y="100" width="420" height="44" rx="6"/>
    <text class="fg-t2 fg-accent" x="54" y="120">Durable substores</text>
    <text class="fg-mxs" x="54" y="136">Clients · Grants · MFA enrolments</text>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M460,122 H476" marker-end="url(#fg-ac)"/>
    <text class="fg-t2 fg-accent" x="484" y="120">Back up — set an RPO</text>
    <text class="fg-xs" x="484" y="136">losing these loses consent and registrations</text>
    <!-- short-lived -->
    <rect class="fg-box" x="36" y="152" width="420" height="44" rx="6"/>
    <text class="fg-t2" x="54" y="172">Short-lived state</text>
    <text class="fg-mxs" x="54" y="188">PAR requests · codes · interactions</text>
    <path class="fg-edge fg-edge--thin" d="M460,174 H476" marker-end="url(#fg-a)"/>
    <text class="fg-t2" x="484" y="172">Discard</text>
    <text class="fg-xs" x="484" y="188">the client retries and the flow recreates it</text>
    <!-- never -->
    <rect class="fg-box fg-box--danger" x="36" y="204" width="420" height="44" rx="6"/>
    <text class="fg-t2" x="54" y="224">Replay-defence set</text>
    <text class="fg-mxs" x="54" y="240">ConsumedJTIs</text>
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M460,226 H476" marker-end="url(#fg-ad)"/>
    <text class="fg-t2 fg-danger" x="484" y="224">Never restore</text>
    <text class="fg-xs" x="484" y="240">rolling it back reopens every window it had closed</text>
  </svg>
  <figcaption class="fig-note">The last row is the one that surprises people. A backup of the consumed-JTI set is a record of which proofs were already spent; restoring an older copy declares them unspent again.</figcaption>
</figure>

## Backup priority

| Substore | Priority | RPO target | Why |
|---|---|---|---|
| `Clients` | **critical** | hours | RP relationships; recovery requires contacting RPs to reissue secrets |
| `Users` (your existing table) | **critical** | minutes | account loss is irrecoverable |
| `Grants` | **critical** | hours | consent records; loss forces every active user to re-consent |
| `RefreshTokens` | high | hours | active sessions; loss forces every active user to re-login |
| `AccessTokens` | medium | low priority | bounded by access-token TTL (default 5 min) — natural recovery |
| `IATs` (DCR initial-access tokens) | medium | hours | issued out-of-band; loss requires reissue |
| `RATs` (DCR registration-access tokens) | medium | hours | required for the RP to read / update its own metadata |
| `AuthorizationCodes` | low | n/a | one-shot, ≤ 60 s lifetime; never restore |
| `PARs` | low | n/a | one-shot, ≤ 90 s lifetime; never restore |
| `Sessions` | embedder choice | — | depends on `WithSessionDurabilityPosture` |
| `Interactions` | low | n/a | per-attempt; users retry |
| `ConsumedJTIs` | **must not restore** | — | restoring a `jti` set rolls back replay protection |
| `Passkeys`, `TOTPs`, `EmailOTPs`, `Recovery` | **critical** | minutes | MFA factor records; loss locks users out |

The "must not restore" row deserves emphasis: replay-protection substores are intentionally one-way write logs. Restoring them from backup re-opens the replay window between the backup point and now. Treat them like sequence counters, not data.

## What to skip

These are safe to discard on recovery — the OP rebuilds them from upstream state:

- **DPoP server-nonce cache.** Reseeded on first request after recovery.
- **JAR / DPoP `jti` consumed set.** See above — restoring it is actively harmful.
- **PARs and authorization codes.** TTL ≤ 90 s; expired anyway.
- **Discovery cache (RP-side).** RPs revalidate on `kid` mismatch during a JWKS rotation.

## Backup mechanics per backend

### SQL adapter (`storeadapter/sql`)

Standard DB backup tooling applies. Two modes that matter:

- **Logical (mysqldump / pg_dump)** — point-in-time consistent snapshot. Use this if you can pause writes briefly during the snapshot.
- **Physical (binlog / WAL streaming)** — continuous replication. Use this for sub-minute RPO. The OP does not require any specific backup mode; pick what your DB ops team already runs.

Schema is documented in the source repo under [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql).

### Existing SQL schema before start

Back up the schema and apply the additive changes before starting a binary that uses the current SQL adapter against an existing database. `Store.Migrate` is useful for a new database or development, but its `CREATE TABLE IF NOT EXISTS` statements do not alter existing tables. Drain old MFA writers first; after the columns are present and validated, start only writers that participate in the current opaque compare-and-swap contract. Do not drop and recreate protocol tables as a shortcut.

Add these columns with the dialect types in the migration guide:

- `oidc_registration_access_tokens.allowed_scopes` — nullable `TEXT` on SQLite, `JSON` on MySQL/MariaDB, and `JSONB` on PostgreSQL. `NULL` means an unrestricted RAT ceiling, including tokens created before this field existed.
- `oidc_totp_secrets.row_version` — `INTEGER NOT NULL DEFAULT 1` on SQLite; `BIGINT NOT NULL DEFAULT 1` on MySQL/MariaDB and PostgreSQL.
- `oidc_email_otps.row_version` — the same `INTEGER` / `BIGINT` definitions as `oidc_totp_secrets.row_version`.

The current retention and client-deletion schema also needs an exact set of indexes. [Storage maintenance](/operations/storage-maintenance#additive-sql-shape) lists them, and the [SQL storage guide](/use-cases/sql-store#sql-migration-before-first-request) repeats the list with a note on what each index is for. Replace the physical table names when using `WithNaming`.

SQLite and PostgreSQL can add the indexes through `Migrate()`; MySQL and MariaDB need explicit `ALTER TABLE ... ADD INDEX` statements for existing tables. Existing MySQL and MariaDB installs also need `ALTER TABLE oidc_users MODIFY username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;`; resolve case-insensitive username collisions before applying it. SQLite and PostgreSQL need no equivalent collation change. Use the dialect-specific statements in [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md), and keep that migration record with the backup/recovery runbook.

### Schedule SQL retention GC

The SQL adapter does not start a background GC goroutine. Schedule `(*oidcsql.Store).GC(ctx, cutoff)` from the same maintenance system that records backup health:

```go
cutoff := time.Now().UTC().Add(-15 * time.Minute) // keep a short recovery grace window
stats, err := storage.GC(ctx, cutoff)
if err != nil {
  return err
}
log.Printf("oidc GC removed %d rows", stats.Total())
```

The returned `oidcsql.GCStats` counts expired authorization codes, PAR records, interactions, sessions, and refresh-token rotation histories. Refresh history remains while a grant still has a live refresh token; expired sealed retry-response blobs are cleared when eligible even if their row remains, and that blob cleanup is not a row count. A past cutoff leaves a grace period; `time.Now()` reclaims everything already expired. Monitor counts, duration, errors, and table sizes, and run the sweep again after a transient failure. Access-token, opaque-token, grant-revocation, and consumed-JTI stores have their own GC policies; device-code and CIBA rows evict expired records on insert.

### DynamoDB adapter (`storeadapter/dynamodb`)

Back up the durable DynamoDB tables with the account's point-in-time recovery or on-demand backup policy, and record the table definitions and TTL settings used for provisioning. The current refresh-token definition has no `by_handle` global secondary index. Index reconciliation only adds indexes, so an existing table can retain an old `by_handle` index until you explicitly remove it through the normal DynamoDB infrastructure procedure (for example, `UpdateTable`). New writes do not need that index, and a restore or re-provisioning must not add it back.

### Redis adapter (`storeadapter/redis`)

Redis stores **only volatile substores** in the bundled adapter:

- `Sessions` (eligible — `WithSessionDurabilityPosture` annotates)
- `Interactions`
- `ConsumedJTIs`
- DPoP nonce cache (if you implemented one)

For these, RDB snapshots and AOF persistence are the standard Redis options. Pick:

- **AOF off, RDB off** — pure volatile; sessions evict on restart. This is a valid posture; set `WithSessionDurabilityPosture` accordingly.
- **RDB only** — periodic snapshot; sessions survive restart but recent activity may be lost.
- **AOF + fsync everysec** — durability close to SQL; rare for volatile substores.

### Embedder-implemented store

If you wrote your own `store.Store`, the contract test suite at [`op/store/contract`](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) verifies your implementation against the same expectations the bundled adapters meet. The contract does not prescribe a backup shape — that's up to you.

## Recovery procedure

### Total loss of durable backend

1. Restore the durable backend from backup.
2. Bring up the OP against the restored store.
3. Restore or verify the signing key material and its JWKS publication independently of the database restore. A database restore does not invalidate already-issued JWT signatures: a JWT remains cryptographically verifiable until `exp` wherever the corresponding public key is available. The restored grant and revocation state can still change whether the OP accepts that token, so check cryptographic verification and server-side state separately. If key rotation happened after the backup, restore the intended keyset and JWKS coherently; a database restore alone does not roll back that rotation.
4. Confirm that durable state written after the backup point was rolled back, including any grant or token revocation changes covered by the restored store.
5. Notify users that re-login is required for any session established after the backup point.

### Total loss of volatile backend (Redis)

1. Bring up a fresh Redis instance.
2. Restart the OP replicas.
3. Active sessions — gone. Users re-login.
4. A Redis loss does not by itself cause `bcl.no_sessions_for_subject` to spike. `/end_session` snapshots the session before notifying; the event is emitted only when a session-bearing logout notice has zero eligible RP targets derived from grants. If eviction happened before the snapshot, neither the back-channel notification nor the event occurs. Investigate any zero-target events against the logout snapshot and grant state.

### Partial loss (one substore corrupted)

1. Stop writes to the affected substore.
2. Restore that substore in isolation.
3. Resume writes.

The transactional cluster invariant guarantees authorization codes / refresh tokens / grants / PARs / access tokens / grant revocations share one backend, so partial restore inside that cluster is a SQL-level operation (table-level restore from binlog or PITR). Volatile substores are independent — losing `Sessions` doesn't impact `RefreshTokens`.

## Cookie key recovery

If the cookie key is lost (HSM destroyed, secret manager wiped) every encrypted cookie in flight becomes invalid:

- Active browser sessions are dead — users re-login.
- Pending consent / interaction flows are dead — users restart.
- Refresh tokens are unaffected — the cookie key seals **session** cookies, not refresh tokens.

There is no recovery path for the cookie key itself. Treat it like a HSM-stored secret with the same redundancy posture as your signing keys.

## Signing key recovery

If the signing key is lost:

- New tokens cannot be issued until you provision a fresh `op.Keyset`.
- Losing the private signer does not by itself invalidate existing JWTs: an RP that already cached the corresponding public JWK can verify them until `exp`. The OP cannot recreate the same `op.Keyset` for its own verification paths from a public JWK alone; recover the signer or intentionally replace the key and handle the old tokens.
- Where the refresh path can still run, opaque refresh tokens may be persisted, but access-token responses that require a new signature fail until a signer is configured.

Mitigation: store the private signing key in a service that has its own backup / replication (KMS, Vault), and never hold the only copy in process memory. The library accepts any `crypto.Signer` — see [JWKS endpoint § HSM / KMS integration](/operations/jwks#hsm-kms-integration).

## Rehearsal

Run a recovery drill before you go live:

1. Take a backup at `t0` and keep the signing key material used at that point available for the drill.
2. Issue 100 signed JWT access tokens at `t0 + 1 min` and retain the tokens with the corresponding public JWK.
3. Make a durable state change after `t0` (for example, create a test client or revoke a grant) and record it.
4. Restore the backup.
5. Confirm the captured JWT signatures still verify with the intended keyset; restoring the database does not break cryptographic continuity.
6. Confirm that the post-`t0` durable state change was rolled back, and check the configured revocation behavior separately.
7. Confirm new login and token issuance works.

A 30-minute drill catches more issues than a written runbook ever will.
