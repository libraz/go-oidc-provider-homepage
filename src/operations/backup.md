---
title: Backup & disaster recovery
description: What to back up, what to skip, and the RPO targets per substore.
outline: 2
pageClass: pg-operations-backup
---

# Backup & disaster recovery

The OP itself is stateless. Recovery posture is entirely a property of your `store.Store` — what's persistent, what's volatile, and what your recovery point objective (RPO) is per substore.

<svg role="img" aria-labelledby="backup-split-title" viewBox="0 0 760 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="backup-split-title">Backup policy: the OP process is stateless, durable substores are restored, short-lived state is discarded and recreated, and the replay-defence set is never restored.</title>
<rect class="bkp-main" x="38" y="112" width="152" height="74" rx="8"/>
  <text class="bkp-text" x="114" y="142" text-anchor="middle">OP process</text>
  <text class="bkp-sub" x="114" y="164" text-anchor="middle">stateless</text>

  <rect class="bkp-box" x="300" y="34" width="178" height="62" rx="8"/>
  <text class="bkp-text" x="389" y="64" text-anchor="middle">Durable substores</text>
  <text class="bkp-sub" x="389" y="82" text-anchor="middle">Clients / Grants / MFA</text>

  <rect class="bkp-box" x="300" y="119" width="178" height="62" rx="8"/>
  <text class="bkp-text" x="389" y="149" text-anchor="middle">Short-lived state</text>
  <text class="bkp-sub" x="389" y="167" text-anchor="middle">PAR / code / interaction</text>

  <rect class="bkp-box" x="300" y="204" width="178" height="62" rx="8"/>
  <text class="bkp-text" x="389" y="234" text-anchor="middle">Never restore</text>
  <text class="bkp-sub" x="389" y="252" text-anchor="middle">ConsumedJTIs</text>

  <rect class="bkp-box" x="578" y="34" width="144" height="62" rx="8"/>
  <text class="bkp-text" x="650" y="64" text-anchor="middle">Back up</text>
  <text class="bkp-sub" x="650" y="82" text-anchor="middle">set an RPO</text>

  <rect class="bkp-box" x="578" y="119" width="144" height="62" rx="8"/>
  <text class="bkp-text" x="650" y="149" text-anchor="middle">Retry</text>
  <text class="bkp-sub" x="650" y="167" text-anchor="middle">recovers on its own</text>

  <rect class="bkp-box" x="578" y="204" width="144" height="62" rx="8"/>
  <text class="bkp-text" x="650" y="234" text-anchor="middle">Discard</text>
  <text class="bkp-sub" x="650" y="252" text-anchor="middle">never roll back</text>

  <path class="bkp-flow" d="M190 150 C238 132 260 66 296 66"/>
  <path class="bkp-flow" d="M190 150 H296"/>
  <path class="bkp-flow" d="M190 150 C238 168 260 234 296 234"/>
  <path class="bkp-flow" d="M478 65 H574"/>
  <path class="bkp-flow" d="M566 61 L575 65 L566 69"/>
  <path class="bkp-flow" d="M478 150 H574"/>
  <path class="bkp-flow" d="M566 146 L575 150 L566 154"/>
  <path class="bkp-flow" d="M478 235 H574"/>
  <path class="bkp-flow" d="M566 231 L575 235 L566 239"/>
</svg>

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
| `Sessions` | embedder choice | depends on `WithSessionDurabilityPosture` |
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
3. **Optionally**, fan-out an invalidation:
   - If the backup is more than `WithAccessTokenTTL` old, every issued access token has expired — no action needed.
   - If the backup is more than the JWKS cache window old, RPs may still verify tokens against keys you've since rotated — issue a manual JWKS refresh (curl from each RP) if you're paranoid.
4. Notify users that re-login is required for any session established after the backup point.

### Total loss of volatile backend (Redis)

1. Bring up a fresh Redis instance.
2. Restart the OP replicas.
3. Active sessions — gone. Users re-login.
4. The audit log shows a spike in `bcl.no_sessions_for_subject` for any logout fan-out invoked during the gap. Expected; resolve.

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
- Existing tokens still verify against `/jwks` if the public half is recoverable from the JWKS document an RP has cached. The OP itself also verifies its own tokens — losing the key is fatal.
- Refresh tokens are still mintable as opaque values, but the bound access tokens fail to sign.

Mitigation: store the private signing key in a service that has its own backup / replication (KMS, Vault), and never hold the only copy in process memory. The library accepts any `crypto.Signer` — see [JWKS endpoint § HSM / KMS integration](/operations/jwks#hsm-kms-integration).

## Rehearsal

Run a recovery drill before you go live:

1. Take a backup at `t0`.
2. Issue 100 tokens at `t0 + 1 min`.
3. Restore the backup.
4. Confirm the 100 issued tokens are unverifiable (which is the correct behaviour — the chain was rolled back).
5. Confirm new login + token issuance works.

A 30-minute drill catches more issues than a written runbook ever will.
