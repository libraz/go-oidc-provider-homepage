---
title: Backup & disaster recovery
description: Back up durable OIDC state, schema, and keys, then rehearse recovery with per-substore RPOs.
outline: 2
pageClass: pg-operations-backup
---

# Backup & disaster recovery

The OP itself is stateless. Recovery posture is entirely a property of your `store.Store`: which substores are durable, which are volatile, and how much data you can afford to lose from each. That last quantity is the recovery point objective (RPO), the age of the newest data a restore may be missing.

<figure class="fig">
  <div class="fig-head">What to restore, and what never to</div>
  <svg class="fig-svg" role="img" aria-labelledby="backup-policy-title" viewBox="0 0 960 480" xmlns="http://www.w3.org/2000/svg">
    <title id="backup-policy-title">A backup policy in four rows. The OP process itself holds nothing. Durable substores are backed up and restored. Short-lived state is discarded and recreated by a retry. The consumed-JTI set is never restored, because restoring it would reopen a replay window.</title>
    <text class="fg-lbl" x="32" y="40">what it is</text>
    <text class="fg-lbl" x="472" y="40">what to do with it</text>
    <path class="fg-rule fg-rule--strong" d="M32,52 H928"/>
    <!-- process -->
    <rect class="fg-box" x="32" y="72" width="392" height="72" rx="8"/>
    <text class="fg-t" x="48" y="100">OP process</text>
    <text class="fg-s" x="48" y="124">holds no state of its own</text>
    <path class="fg-edge fg-edge--thin" d="M424,108 H472" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--muted" x="472" y="72" width="456" height="72" rx="8"/>
    <text class="fg-t" x="488" y="100">Nothing to back up</text>
    <text class="fg-s" x="488" y="124">a replacement instance is equivalent</text>
    <!-- durable -->
    <rect class="fg-box" x="32" y="176" width="392" height="72" rx="8"/>
    <text class="fg-t" x="48" y="204">Durable substores</text>
    <text class="fg-mxs" x="48" y="228">Clients · Grants · MFA enrolments</text>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M424,212 H472" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="472" y="176" width="456" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="488" y="204">Back up — set an RPO</text>
    <text class="fg-s" x="488" y="228">losing these loses consent and registrations</text>
    <!-- short-lived -->
    <rect class="fg-box" x="32" y="280" width="392" height="72" rx="8"/>
    <text class="fg-t" x="48" y="308">Short-lived state</text>
    <text class="fg-mxs" x="48" y="332">PAR requests · codes · interactions</text>
    <path class="fg-edge fg-edge--thin" d="M424,316 H472" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="472" y="280" width="456" height="72" rx="8"/>
    <text class="fg-t" x="488" y="308">Discard</text>
    <text class="fg-s" x="488" y="332">the client retries and the flow recreates it</text>
    <!-- never -->
    <rect class="fg-box" x="32" y="384" width="392" height="72" rx="8"/>
    <text class="fg-t" x="48" y="412">Replay-defence set</text>
    <text class="fg-mxs" x="48" y="436">ConsumedJTIs</text>
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M424,420 H472" marker-end="url(#fg-ad)"/>
    <rect class="fg-box fg-box--danger" x="472" y="384" width="456" height="72" rx="8"/>
    <text class="fg-t fg-danger" x="488" y="412">Never restore</text>
    <text class="fg-s" x="488" y="436">rolling it back reopens the windows it closed</text>
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
| `GrantRevocations` | **critical** | minutes | revocation tombstones; a backup older than a revocation brings the revoked grant back to life |
| `AccessTokens`, `OpaqueAccessTokens` | medium | low priority | bounded by access-token TTL (default 5 min) — natural recovery |
| `IATs` (DCR initial-access tokens) | medium | hours | issued out-of-band; loss requires reissue |
| `RATs` (DCR registration-access tokens) | medium | hours | required for the RP to read / update its own metadata |
| `AuthorizationCodes` | low | n/a | one-shot, 60 s lifetime; never restore |
| `PARs` | low | n/a | one-shot, 60 s lifetime by default (`WithPARLifetime`); never restore |
| `Sessions` | embedder choice | — | depends on `WithSessionDurabilityPosture` |
| `Interactions` | low | n/a | per-attempt; users retry |
| `ConsumedJTIs` | **must not restore** | — | restoring a `jti` set rolls back replay protection |
| `Passkeys`, `TOTPs`, `EmailOTPs`, `Recovery` | **critical** | minutes | MFA factor records; loss locks users out |
| `Metadata` | high | hours | the subject-issuance mode (public, pairwise, or custom) the OP checks at start-up; small, written once, carries no TTL |
| `AuthnLockouts` (`WithAuthnLockoutStore`) | medium | hours | failure counters over a rolling 24 h window; an older copy only resets guess budgets |

The "must not restore" row deserves emphasis: replay-protection substores are intentionally one-way write logs. Restoring one reopens the replay window between the backup point and now, because a proof (a DPoP proof, a `private_key_jwt` assertion, a request object) already spent after the backup would be accepted again. Treat them like sequence counters, not data.

## What to skip

These are safe to discard on recovery, because a retry recreates them:

- **DPoP server-nonce state.** Nonces are short-lived. A client that presents a stale one gets a `use_dpop_nonce` challenge carrying a fresh value and retries.
- **JAR / DPoP `jti` consumed set.** Do not restore it. See above.
- **PARs and authorization codes.** Both live 60 seconds by default and are expired by the time a restore finishes.
- **Discovery cache (RP-side).** RPs revalidate on `kid` mismatch during a JWKS rotation.

## Backup mechanics per backend

### SQL adapter (`storeadapter/sql`)

Standard DB backup tooling applies. Two modes that matter:

- **Logical (mysqldump / pg_dump)** — point-in-time consistent snapshot. Use this if you can pause writes briefly during the snapshot.
- **Physical (binlog / WAL streaming)** — continuous replication. Use this for sub-minute RPO. The OP does not require any specific backup mode; pick what your DB ops team already runs.

Schema is documented in the source repo under [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql).

### Existing SQL schema before start

Back up the database before upgrading the adapter, and apply the additive schema changes before starting a binary that uses the new shape. `Store.Migrate` suits a new database or development: its `CREATE TABLE IF NOT EXISTS` statements do not alter existing tables, and it fails when a required column is missing. Do not drop and recreate protocol tables as a shortcut. [Storage maintenance](/operations/storage-maintenance#the-order-of-work) gives the order of work, the full column and index list, and the MySQL and MariaDB collation changes. The dialect-specific statements are in [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md); keep that migration record with the backup and recovery runbook.

### Schedule SQL retention GC

The SQL adapter starts no background GC goroutine. Schedule `(*oidcsql.Store).GC(ctx, cutoff)` and the per-substore sweeps from the same maintenance system that records backup health; [Storage maintenance](/operations/storage-maintenance#schedule-retention-gc) has the code and what each sweep covers. A cutoff in the past leaves a grace window, which is useful here: rows that expired just before an incident stay readable for forensics.

### DynamoDB adapter (`storeadapter/dynamodb`)

Back up the durable DynamoDB tables with the account's point-in-time recovery or on-demand backup policy, and record the table definitions and TTL settings used for provisioning. The refresh-token table definition has no `by_handle` global secondary index. Index reconciliation only adds indexes, so an existing table can retain an old `by_handle` index until you remove it through the normal DynamoDB infrastructure procedure (for example, `UpdateTable`). Writes do not need that index, and a restore or re-provisioning must not add it back.

### Redis adapter (`storeadapter/redis`)

The bundled Redis adapter implements the volatile substores plus one small durable record:

- `Sessions` (`WithSessionDurabilityPosture` records which placement you chose)
- `Interactions`
- `ConsumedJTIs`, the replay-defence set. Unlike the first two it must not be evicted: run it on a `noeviction` instance, or route it to a durable backend through the composite store.
- `Metadata`, a hash with no TTL that holds the subject-issuance mode. It is the one Redis key whose loss does not heal itself; keep it on a persistent instance (or in a durable backend) rather than a purely volatile one.

A DPoP server-nonce source is a separate seam you implement, not a Redis substore of the adapter.

RDB snapshots and AOF persistence are the standard Redis options:

- **AOF off, RDB off** — purely volatile; sessions are lost on restart. This is a valid posture for `Sessions` and `Interactions`; set `WithSessionDurabilityPosture` accordingly. It does not suit `ConsumedJTIs` or `Metadata`.
- **RDB only** — periodic snapshot; sessions survive a restart but recent activity may be lost.
- **AOF + fsync everysec** — durability close to SQL; rarely worth it for volatile substores.

### Embedder-implemented store

If you wrote your own `store.Store`, the contract test suite at [`op/store/contract`](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) verifies your implementation against the same expectations the bundled adapters meet. The contract does not prescribe a backup shape; that is up to you.

## Recovery procedure

### Total loss of durable backend

1. Restore the durable backend from backup.
2. Bring up the OP against the restored store.
3. Restore or verify the signing key material and its JWKS publication independently of the database restore. A database restore does not invalidate already-issued JWT signatures: a JWT remains cryptographically verifiable until `exp` wherever the corresponding public key is available. The restored grant and revocation state can still change whether the OP accepts that token, so check cryptographic verification and server-side state separately. If key rotation happened after the backup, restore the intended keyset and JWKS coherently; a database restore alone does not roll back that rotation.
4. Confirm that durable state written after the backup point was rolled back, including any grant or token revocation changes covered by the restored store. Re-apply from your own records any revocation or user deprovisioning made after the backup point; the restored store treats those grants as live again.
5. Notify users that re-login is required for any session established after the backup point.

### Total loss of volatile backend (Redis)

1. Bring up a fresh Redis instance.
2. Restart the OP replicas.
3. Active sessions — gone. Users re-login.
4. If the instance held `ConsumedJTIs`, proofs spent before the loss are accepted again until they expire. DPoP proofs and client assertions are short-lived, so the window is brief, and it is the reason to run that substore on `noeviction` or a persistent instance. If it held `Metadata`, restore the record before starting the OP: started against an empty record, the OP stores whatever subject-issuance mode its configuration names and can no longer detect a switch from the mode your existing grants were issued under.
5. A Redis loss does not by itself cause `bcl.no_sessions_for_subject` to spike. `/end_session` snapshots the session before notifying; the event is emitted only when a session-bearing logout notice has zero eligible RP targets derived from grants. If eviction happened before the snapshot, neither the back-channel notification nor the event occurs. Investigate any zero-target events against the logout snapshot and grant state.

### Partial loss (one substore corrupted)

1. Stop writes to the affected substore.
2. Restore that substore in isolation.
3. Resume writes.

The transactional cluster invariant guarantees authorization codes / refresh tokens / grants / PARs / access tokens / grant revocations share one backend, so partial restore inside that cluster is a SQL-level operation (table-level restore from binlog or PITR). Volatile substores are independent — losing `Sessions` doesn't impact `RefreshTokens`.

## Cookie key recovery

If the cookie key is lost (HSM destroyed, secret manager wiped) every encrypted cookie in flight becomes invalid:

- Active browser sessions are dead: the OP can no longer open the cookie, treats the browser as signed out, and users sign in again.
- Pending consent and interaction flows are dead, and users restart them.
- Refresh tokens are unaffected. The cookie key seals the browser cookies (session, interaction, CSRF), not refresh tokens.

There is no recovery path for the cookie key itself. Treat it like a HSM-stored secret with the same redundancy posture as your signing keys.

## Signing key recovery

If the signing key is lost:

- New tokens cannot be issued until you provision a fresh `op.Keyset`.
- Losing the private signer does not by itself invalidate existing JWTs: an RP that already cached the corresponding public JWK can verify them until `exp`. The OP cannot recreate the same `op.Keyset` for its own verification paths from a public JWK alone; recover the signer or intentionally replace the key and handle the old tokens.
- Refresh tokens are opaque and stored, so they survive, but any token response that needs a new signature fails until a signer is configured.

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
