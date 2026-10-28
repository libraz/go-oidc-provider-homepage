---
title: Bring your own store backend
description: Implement store.Store with the hashing, transaction, and equality-only concurrency contracts required by custom tables or non-SQL backends.
pageClass: pg-use-cases-byo-store
---

# Use case — Bring your own store backend

The bundled [SQL adapter](/use-cases/sql-store) lets you rename tables with `WithNaming`, but it owns the column layout. When you need custom **column** names too — an existing schema you cannot reshape, encrypted columns, a table shared with other systems, or a non-SQL backend entirely — you implement the `store` substore interfaces yourself and pass your aggregate to `op.WithStore`. The library observes none of the physical names; it only sees the `store.*` Go structs your code maps rows onto.

Choose this path only when the SQL adapter cannot represent your persistence boundary. It gives maximum control, but it also makes you responsible for bearer-secret hashing, sentinel errors, concurrency, and transactions. If default columns are acceptable, use the SQL adapter; if only user lookup is custom, replace only the user store.

The split is not negotiable in one direction and fully open in the other. The library fixes what each operation must *mean*; your backend decides how the bytes are stored.

| What the library fixes | What you choose |
|---|---|
| Which substores must be non-nil | Every table and column name |
| Which extensions `op.New` verifies | SQL, key-value, or no database at all |
| The sentinel error for each failure mode | Encryption, sharding, tenancy |
| Single-winner transitions and atomicity | How a transaction is implemented |
| Hash-on-store for bearer secrets | How a digest is computed and peppered |

`op.WithStore` is the seam between the two columns:

<figure class="fig">
  <div class="fig-head">Only structs and errors cross the store seam</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-byostore-title" viewBox="0 0 960 360" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-byostore-title">The library holds what each store operation has to guarantee; your backend holds how the data is actually kept. Only the store package's Go structs and its sentinel errors cross between the two.</title>
    <!-- library -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="896" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="52">The library holds the meaning</text>
    <text class="fg-s" x="48" y="76">what "consume this code" has to guarantee</text>
    <text class="fg-s" x="48" y="100">and which error stands for which outcome</text>
    <!-- seam -->
    <path class="fg-rule fg-rule--dashed fg-rule--strong" d="M32,180 H928"/>
    <text class="fg-tab fg-accent" x="32" y="172">op.WithStore</text>
    <!-- structs down, sentinel errors back -->
    <path class="fg-edge" d="M224,120 V240" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="236" y="156">store.*</text>
    <path class="fg-edge fg-edge--muted" d="M736,240 V120" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl fg-halo" x="748" y="156">store.Err*</text>
    <!-- backend -->
    <rect class="fg-box" x="32" y="240" width="896" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="268">Your backend holds the representation</text>
    <text class="fg-s" x="48" y="292">rows, items, keys, TTLs — whatever fits</text>
    <text class="fg-s" x="48" y="316">the database you already run</text>
  </svg>
  <figcaption class="fig-note">Nothing else crosses. That is what makes an adapter reviewable: the questions it can get wrong are all about representation, and every one of them has an answer in the interface contract.</figcaption>
</figure>

Only the `store.*` Go structs and the sentinel errors cross that seam. Everything on your side of it — names, engine, encoding — is invisible to the OP.

> **Source:** [`examples/26-byo-store-from-scratch`](https://github.com/libraz/go-oidc-provider/tree/main/examples/26-byo-store-from-scratch) — a complete `store.Store` over SQLite with a hand-rolled `vault_*` schema, driven through a real browser login round-trip in CI.

## What you implement

`store.Store` is an aggregate of small substore interfaces (each owns one record kind and exposes one to six methods). Which ones must be non-nil depends on the grants and features you enable; `op.New` checks each against the configuration and names the missing one in its error. A full authorization-code OP needs these:

| Substore | Interface | Methods | Must be non-nil when |
|---|---|---|---|
| Clients | `store.ClientStore` | `GetClient` (skip `ClientRegistry` unless you support dynamic registration) | always |
| Users | `store.UserStore`, or `store.UserPasswordStore` for `op.PrimaryPassword` | `FindBySubject` / `FindByUsername` / `ReadPasswordHash` | always (or supply [`op.WithUserStore`](/use-cases/byo-userstore)) |
| Consumed JTIs | `store.ConsumedJTIStore` | `Mark` / `Has` | always |
| Authorization codes | `store.AuthorizationCodeStore` | `Save` / `Find` / `Consume` | `grant.AuthorizationCode` |
| Refresh tokens | `store.RefreshTokenStore` | `Save` / `Find` / `Consume` / `RevokeChain` / `RevokeByGrant` | `grant.RefreshToken` |
| Grants | `store.GrantStore` | `Save` / `Find` / `FindBySubjectClient` / `ListBySubject` / `Delete` / `HasAny` | any grant other than `client_credentials` |
| Sessions | `store.SessionStore` | `Save` / `Find` / `Touch` / `Delete` / `ListByChooserGroup` | a grant mounts `/auth` |
| Interactions | `store.InteractionStoreCAS` | `Save` / `Find` / `Delete` / `CompareAndSwap` / `DeleteIfUnchanged` | a grant mounts `/auth` |
| PAR | `store.PushedAuthRequestStore` | `Save` / `Find` / `Consume` | `feature.PAR` |
| Access tokens | `store.AccessTokenRegistry` | `Register` / `Find` / `RevokeByJTI` / `RevokeByGrant` / `GC` | revocation strategy `RevocationStrategyJTIRegistry` |
| Grant revocations | `store.GrantRevocationStore` | `RevokeGrant` / `RevokeJTI` / `IsRevoked` / `GC` | default strategy `RevocationStrategyGrantTombstone` |
| Metadata | `store.MetadataStore` | `Get` / `Set` | recommended (see below) |

The other accessors may return `nil` when you do not enable the matching feature: `OpaqueAccessTokens` (only with an opaque access-token format), `InitialAccessTokens` and `RegistrationAccessTokens` (dynamic registration), `DeviceCodes`, and `CIBARequests`. `op.New` detects the `nil` and rejects the option that would have needed it, rather than panicking later. To skip `GrantRevocations` you must also pin `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` (non-FAPI deployments only).

`Metadata` holds the subject-issuance mode (public or pairwise) that `op.New` checks on every start. A `nil` accessor only logs a startup warning, but then nothing detects a switch between public and pairwise subjects against an existing grant store, and every affected user's `sub` changes silently. Implement it.

## Capabilities the constructor requires

Beyond the substores themselves, the OP detects a handful of **extension interfaces** by runtime type assertion. A capability lives on an extension rather than on a core substore whenever some constructible OP does not need it — a machine-to-machine backend that never mounts `/auth` should not have to implement browser-flow machinery. What matters for a backend author is that an extension whose absence would break a configured flow is verified at `op.New`, not discovered on a live request. The error names both the interface and the condition that made it mandatory.

| Extension | Asserted on | Required when |
|---|---|---|
| `store.Transactional` | the aggregate `Store` | a grant mounts `/auth` |
| `store.InteractionStoreCAS` | `Store.Interactions()` | a grant mounts `/auth` |
| `store.GrantClientLister` | `Store.Grants()` | a grant mounts `/auth` |
| `store.RefreshRetryResponseStore` | `Store.RefreshTokens()` | `refresh_token` is enabled and cookie keys are configured |
| `store.ClientRegistry` | the aggregate `Store` | `op.WithDynamicRegistration` |
| `store.StaticClientReconciler` | the aggregate `Store` | `op.WithStaticClients` |

Only `grant.AuthorizationCode` currently mounts `/auth`, so a store backing only `client_credentials`, `device_code`, or CIBA needs none of the first three.

`store.StaticClientReconciler` seeds `op.WithStaticClients` in one atomic call at the end of `op.New`; without it, `op.New` refuses the option.

- **`Transactional`** hands out a `store.Tx` whose `AuthorizationCodes()`, `Grants()`, `RefreshTokens()`, `PushedAuthRequests()`, `AccessTokens()`, `OpaqueAccessTokens()`, and `GrantRevocations()` are bound to one underlying transaction. Authorization completion commits the grant, PAR consumption, and code persistence together, so a signing or persistence fault cannot consume a `request_uri` without emitting a code. Grant reads inside a transaction must lock rows, run serializable, or surface an equivalent conflict before `Save` — grouping an unlocked `SELECT` with an unconditional `Save` still loses concurrent consent updates. `Sessions`, `Interactions`, and `ConsumedJTIs` are deliberately absent from `Tx`.
- **`InteractionStoreCAS`** makes a terminal interaction immutable before those durable writes start. `CompareAndSwap` replaces a record only while its `RawState` is unchanged (`ErrConflict` otherwise, `ErrNotFound` when absent or expired), and `DeleteIfUnchanged` removes it only if nothing raced.
- **`GrantClientLister`** is the bounded audience view Back-Channel Logout fans out from: `ListClientIDsBySubject(ctx, subject, cursor, limit)` returns at most `limit` distinct client IDs in a stable ascending order, plus a `NextCursor` when another page exists. Bound the query itself to `limit+1` rows — implementing it by calling `ListBySubject` and slicing the result defeats the point, which is capping database and client-registry work per logout notice.
- **`RefreshRetryResponseStore`** persists an already-sealed token response against its consumed predecessor so this library's refresh retry grace window can re-emit the same successor instead of branching the chain. RFC 9700 §4.14.2 describes rotation and replay detection, not this grace window. `SaveRotationWithRetry` must write the successor and the sealed blob in one operation; a backend that cannot make that atomic must not expose the interface at all. Treat the blob as opaque, key it by a one-way digest of the predecessor, and retain it no longer than the predecessor's own lifetime.

These stay optional, and the OP degrades rather than refusing to start:

| Extension | Asserted on | What you lose |
|---|---|---|
| `store.RevokeByClient` | `Store.RefreshTokens()` and the access-token substores | deleting a dynamically registered client skips that substore's bulk credential cascade |
| `store.RefreshChainResolver` | `Store.RefreshTokens()` | chain walks resolve through `Find` instead of the stored-handle lookup |
| `store.OpaqueAccessTokenChainRevoker` | `Store.OpaqueAccessTokens()` | a refresh rotation retires the opaque access tokens of the whole grant, not only its own chain |
| `store.IssuanceRevocationChecker` | `Store.GrantRevocations()` | revoking one refresh token refuses the grant's other refresh chains and unredeemed codes too |

::: tip Verify the placement, don't infer it
[`op/store/contract`](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) runs the core contract against your backend and skips each extension you do not implement, so the suite tells you which capabilities you actually landed.
:::

## Concurrency contracts to implement

The current `store` interfaces make several security-sensitive read-modify-write rules explicit. They are backend contracts, not hints to approximate:

- `store.TOTPRecord.Version` and `store.EmailOTPRecord.Version` are non-zero, store-issued opaque tokens after persistence. They are **equality-only**: do not increment them, compare their order, reuse one after delete/recreate, or expose them in the JSON document. `Put` assigns a fresh token without mutating the caller's record; `CompareAndSwap` requires `next.Version == previous.Version`, carries the token read by the caller, compares the stored record field-for-field (including `Version`), and assigns a fresh successor without mutating either input. A stale or malformed snapshot returns `store.ErrAlreadyConsumed`.
- `store.CIBARequestStore.Approve` is an atomic Pending → Approved transition. If a deferred record already has a non-empty `Subject`, a different subject returns `store.ErrConflict` and leaves the record untouched; an empty subject may be populated exactly once. Approving a missing or expired record returns `store.ErrNotFound`, and approving a record that is no longer Pending returns `store.ErrConflict`. `Consume` separately performs the Approved → Consumed single-use transition, returning `store.ErrAlreadyConsumed` for a consumed record and `store.ErrConflict` for Pending or Denied.
- CIBA is outside the aggregate's `store.Transactional` cluster; `Approve` and `Consume` must provide their own atomic transitions rather than approximating them with a read followed by a write.
- `store.InteractionStoreCAS` compares `RawState` byte-for-byte. Preserve the bytes exactly and make `CompareAndSwap` / `DeleteIfUnchanged` atomic; re-encoding JSON or normalizing whitespace changes the version and causes a legitimate completion to lose with `store.ErrConflict`. A replacement whose `RawState` and other fields are identical is still a successful apply; do not infer a conflict from an affected-row count of zero.
- `store.GrantRevocationStore.RevokeGrant` is idempotent and only ever widens a tombstone: concurrent calls converge on the latest `RevokedAt` and `ExpiresAt`. Use a row lock, `GREATEST()`, or a conditional write; a read followed by a write of the value the caller decided lets the cascade that read first land last and revive access tokens the other cascade just revoked.
- `store.GrantStore.Save` amends an existing grant. Lock the row through the transaction, use serializable isolation, or reject a stale basis with `store.ErrConflict`; an unlocked read followed by an unconditional save can silently drop a concurrent consent update.

The SQL adapter stores these version tokens in `oidc_totp_secrets.row_version` and `oidc_email_otps.row_version`; see [the SQL migration order](/use-cases/sql-store#sql-migration-before-first-request) before starting a version-aware writer. The [contract suite](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) is the executable reference for each sentinel and transition.

The contract harness's `contract.TOTPFactory` returns a `contract.TOTPBackend`, whose `Store` field carries the `store.TOTPStore`; it does not return a bare `store.TOTPStore`. Its optional `Diverge` hook can mutate a stored record out of band while keeping `Version` unchanged, so the backend must enforce the full-record compare-and-swap rule.

Those SQL names are adapter-specific. A BYO backend may choose different columns or a non-SQL representation, but its registration-token store still has to persist `RegistrationAccessToken.AllowedScopes`, and its MFA stores still need equivalent opaque compare-and-swap state before the first request.

## Per-authorization state and refresh chains

A grant is shared by every authorization of one subject on one client, and each new authorization rewrites it. To keep an earlier code, refresh chain, or access token from reporting a later authorization, the OP copies the state of the authorization onto the record it issues. Persist these fields and return them unchanged:

| Record | Fields to round-trip |
|---|---|
| `store.AuthorizationCode` | `AuthTime`, `ACR`, `AMR`, `AuthorizationDetails`, `Claims`, `AuthorizationRecorded` |
| `store.RefreshToken` | `AuthTime`, `ACR`, `AMR`, `AuthorizationDetails`, `Claims`, `AuthorizationRecorded`, `ChainID` |
| `store.OpaqueAccessToken` | `AuthTime`, `ACR`, `AMR`, `AuthorizationDetails`, `Claims`, `AuthorizationRecorded`, `ChainID` |
| `store.GrantTombstone` | `AccessTokensOnly` |

- **`AuthorizationRecorded`** is `true` when the other fields were written at issuance. A row that reads back `false` is resolved from its grant instead. A backend that stores none of these fields therefore still works, but a later authorization by the same user and client changes what its earlier tokens report. Store the fields together or not at all.
- **`ChainID`** is a random, non-secret value allocated at the chain root and copied onto every rotation. A refresh rotation retires only the opaque access tokens that carry its own `ChainID`, so refreshing on one device does not end the user's other sessions on the same client. Implement `store.OpaqueAccessTokenChainRevoker.RevokeByChain(ctx, grantID, chainID)` to enable this; an empty `chainID` matches nothing.
- **`AccessTokensOnly`** marks the tombstone that `/revoke` writes for a single refresh token. It covers the grant's access tokens but must not refuse the grant's other refresh chains or unredeemed codes. Keep its cutoff apart from the whole-grant one: `IsRevoked` honours both, and `store.IssuanceRevocationChecker.IsIssuanceRevoked` honours only the whole-grant cutoff. A backend that drops the field over-revokes: every tombstone then ends the whole grant.

A store that implements neither optional interface keeps the grant-wide behaviour: revoking or rotating one chain affects every chain under the grant.

## Column names are yours

The example proves the point by giving every table and column a deliberately non-OIDC name. Nothing in the library cares:

| Store record | Example table | Example columns |
|---|---|---|
| Client | `vault_relying_parties` | `relying_party`, `redirect_targets`, `permitted_scope` |
| User | `vault_principals` | `principal` (the subject), `login_handle`, `secret_phc` |
| Authorization code | `vault_grant_codes` | `token_secret_digest`, `principal`, `relying_party`, `ledger_id`, `requested_scope`, `expires_epoch`, `consumed_epoch` |
| Refresh token | `vault_renewal_slips` | `token_secret_digest`, `ledger_id`, `is_void` |
| Grant | `vault_consent_ledger` | `ledger_id`, `principal`, `relying_party`, `requested_scope`, `is_revoked` |
| PAR | `vault_pushed_handles` | `handle_digest` |
| Session | `vault_browser_seats` | `seat_id`, `chooser_band` |
| Access token | `vault_wire_tokens` | `ticket_id` (the jti), `ledger_id`, `is_void` |

`principal` is the subject, `relying_party` is the client id, and `ledger_id` is the grant id. The substore implementations are the only place the physical schema is mapped onto the `store.*` structs.

## Contracts you must honour

The substore godoc is normative. A backend that compiles but ignores these does not satisfy the interface:

1. **Hash-on-store.** `AuthorizationCode.ID`, `RefreshToken.ID`, and `PushedAuthRequest.URI` are opaque bearer secrets: possession alone redeems them. Hash the presented value (SHA-256, ideally HMAC'd with a server-side pepper) before persisting, store only the digest, and on `Find` / `Consume` hash the presented value to look the digest up, comparing in constant time. The example uses SHA-256 without a pepper to stay self-contained, matching the in-memory reference; production backends SHOULD add the pepper.
2. **Sentinel errors.** Return `store.ErrNotFound`, `store.ErrAlreadyExists`, `store.ErrAlreadyConsumed`, `store.ErrConflict`, and `store.ErrTxRequired` exactly where the method godoc says (map `sql.ErrNoRows` → `ErrNotFound`; a second `Consume` → `ErrAlreadyConsumed`). Callers switch on these with `errors.Is`; returning a different error for a listed failure mode breaks the contract even though it compiles.
3. **Atomicity and single-winner transitions.** Exchanging a code, rotating a refresh token, and consuming a PAR each cross several record kinds. The library relies on each substore's `Save` / `Consume` being individually atomic, and a backend serving the browser authorization-code flow MUST implement `store.Transactional` so multi-substore writes share one underlying transaction (see [Capabilities the constructor requires](#capabilities-the-constructor-requires)). For every valid live single-use or conditional transition, exactly one concurrent caller may succeed and losers must receive the documented sentinel; an idempotent replacement whose complete record is unchanged is still a success. A backend must not infer a conflict from an affected-row count of zero. Single-use `Consume` / TOTP `Accept` must persist the consumed or progress state before returning nil, and Email OTP `Consume` must persist a non-zero `ConsumedAt` even when its input `ConsumedAt` was zero. The example implements transactions the same way the bundled adapter does: substores take a small `querier` interface that both `*sql.DB` and `*sql.Tx` satisfy, and `BeginTx` hands out cluster substores bound to one `*sql.Tx`.
4. **Authorization-code expiry precedes consumed-state checks.** `AuthorizationCodeStore.Consume` must return `store.ErrNotFound` when a code is both expired and already consumed; expiry wins. A live consumed code returns `store.ErrAlreadyConsumed` (and SHOULD return the record when available so the caller can recover its `GrantID` for the RFC 6749 §4.1.2 replay cascade). That `ErrAlreadyConsumed` result is replay evidence and triggers the cascade; expiry alone must remain an ordinary invalid-grant failure. A successful consume returns a non-zero `ConsumedAt`.
5. **Refresh rotation preserves replay evidence.** `RefreshTokenStore.Consume` applies the same expiry-first rule: an expired-and-consumed row returns `store.ErrNotFound`, while a live replay returns `store.ErrAlreadyConsumed` together with the record so the OP can recover the chain root. A rotation save must atomically refuse a parent marked `Revoked` with `store.ErrAlreadyConsumed`, without leaving a redeemable child. A parent that is absent—possibly because retention already collected it—does not prove revocation, so the child is kept. `SaveRotationWithRetry` follows the same parent rule.
6. **Session, interaction, and device-code records have narrow lifecycle contracts.** `SessionStore.Touch` changes only `ExpiresAt` and `UpdatedAt`, preserves every other field and secondary index, and treats an unchanged replacement as success. A past-dated `SessionStore.Save` or `InteractionStore.Save` may omit the expired record, but it must remove or supersede a live record with the same ID rather than silently leaving it active. `DeviceCodeStore.FindByUserCode` returns the matching public state with `ID` blank so a user code cannot disclose the redeemable `device_code` credential.
7. **PAR expiry belongs to `Find`, not `Consume`.** `PushedAuthRequestStore.Find` is the presentation-time expiry gate when the browser brings `request_uri` to `/auth`. `Consume` enforces single-use only and must not reject solely because `ExpiresAt` passed after presentation; otherwise a long login / MFA / consent interaction could fail at code emission after the OP had already accepted the request.

## Which approach fits

| You want | Use |
|---|---|
| Default tables, just persistence | [SQL adapter](/use-cases/sql-store) |
| Your own **table** names, default columns | SQL adapter + [`WithNaming`](/use-cases/sql-store#renaming-the-tables) |
| Keep your existing **users** table, default OIDC records | [Bring your own user store](/use-cases/byo-userstore) |
| Your own table **and column** names everywhere, or a non-SQL backend | This page |

## Run it

```sh
(cd examples/26-byo-store-from-scratch && GOWORK=off go run -tags example .)
```

The example starts the OP on `:8080` and a paired RP on `:9090`. Sign in as `demo@example.test` / `demo`; the RP's `/me` page shows the released ID Token claims, served entirely from the `vault_*` schema.

## Read next

- [Persistent storage (SQL)](/use-cases/sql-store) — the bundled adapter and `WithNaming` table renaming.
- [Bring your own user store](/use-cases/byo-userstore) — replace only the `Users()` substore while the bundled adapter keeps the OIDC records.
- [Hot/cold split (Redis volatile)](/use-cases/hot-cold-redis) — route substores to different backends with the composite adapter.
