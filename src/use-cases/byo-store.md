---
title: Bring your own store backend
description: Implement the store.Store interfaces directly to back the OP with your own tables and your own column names.
---

# Use case — Bring your own store backend

The bundled [SQL adapter](/use-cases/sql-store) lets you rename tables with `WithNaming`, but it owns the column layout. When you need custom **column** names too — an existing schema you cannot reshape, encrypted columns, a table shared with other systems, or a non-SQL backend entirely — you implement the `store` substore interfaces yourself and pass your aggregate to `op.WithStore`. The library observes none of the physical names; it only sees the `store.*` Go structs your code maps rows onto.

Choose this path only when the SQL adapter cannot represent your persistence boundary. It gives maximum control, but it also makes you responsible for bearer-secret hashing, sentinel errors, concurrency, and transactions. If default columns are acceptable, use the SQL adapter; if only user lookup is custom, replace only the user store.

> **Source:** [`examples/26-byo-store-from-scratch`](https://github.com/libraz/go-oidc-provider/tree/main/examples/26-byo-store-from-scratch) — a complete `store.Store` over SQLite with a hand-rolled `vault_*` schema, driven through a real browser login round-trip in CI.

## What you implement

`store.Store` is an aggregate of small substore interfaces (each owns one record kind and exposes one to five methods). For an authorization-code OP you implement these non-nil:

| Substore | Interface | Methods |
|---|---|---|
| Clients | `store.ClientStore` | `GetClient` (skip `ClientRegistry` unless you support dynamic registration) |
| Authorization codes | `store.AuthorizationCodeStore` | `Save` / `Find` / `Consume` |
| Refresh tokens | `store.RefreshTokenStore` | `Save` / `Find` / `Consume` / `RevokeChain` / `RevokeByGrant` |
| Grants | `store.GrantStore` | `Save` / `Find` / `FindBySubjectClient` / `ListBySubject` / `Delete` / `HasAny` |
| Sessions | `store.SessionStore` | `Save` / `Find` / `Touch` / `Delete` / `ListByChooserGroup` |
| PAR | `store.PushedAuthRequestStore` | `Save` / `Find` / `Consume` |
| Interactions | `store.InteractionStore` | `Save` / `Find` / `Delete` |
| Consumed JTIs | `store.ConsumedJTIStore` | `Mark` / `Has` |
| Users | `store.UserPasswordStore` | `FindBySubject` / `FindByUsername` / `ReadPasswordHash` |
| Access tokens | `store.AccessTokenRegistry` | `Register` / `Find` / `RevokeByJTI` / `RevokeByGrant` / `GC` |
| Metadata | `store.MetadataStore` | `Get` / `Set` |

The remaining substore accessors may return `nil` when you do not enable the matching feature — `OpaqueAccessTokens`, `InitialAccessTokens`, `RegistrationAccessTokens`, `DeviceCodes`, `CIBARequests`, and `GrantRevocations`. The library detects `nil` at `op.New` and rejects the option that would have needed it, rather than panicking later. To skip `GrantRevocations` you must also pin `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` (non-FAPI deployments only); the default grant-tombstone strategy requires that substore at construction time.

## Column names are yours

The example proves the point by giving every table and column a deliberately non-OIDC name. Nothing in the library cares:

| Store record | Example table | Example columns |
|---|---|---|
| Client | `vault_relying_parties` | `relying_party`, redirect / scope metadata |
| User | `vault_principals` | `principal` (the subject), `login_name`, `secret_phc` |
| Authorization code | `vault_grant_codes` | `code_digest`, `principal`, `relying_party`, `requested_scope`, `issued_epoch`, `expires_epoch`, `consumed_epoch` |
| Refresh token | `vault_renewal_slips` | `token_secret_digest`, `ledger_id`, `is_void` |
| Grant | `vault_consent_ledger` | `ledger_id`, `granted_scope` |
| PAR | `vault_pushed_handles` | `handle_digest` |
| Session | `vault_browser_seats` | `seat_id`, `chooser_band` |
| Access token | `vault_wire_tokens` | jti, `ledger_id`, `is_revoked` |

`principal` is the subject, `relying_party` is the client id, `ledger_id` is the grant id — the substore implementations are the sole place the physical schema is mapped onto the `store.*` structs.

## Three contracts you must honour

The substore godoc is normative. A backend that compiles but ignores these does not satisfy the interface:

1. **Hash-on-store.** `AuthorizationCode.ID`, `RefreshToken.ID`, and `PushedAuthRequest.URI` are opaque bearer secrets: possession alone redeems them. Hash the presented value (SHA-256, ideally HMAC'd with a server-side pepper) before persisting, store only the digest, and on `Find` / `Consume` hash the presented value to look the digest up, comparing in constant time. The example uses SHA-256 without a pepper to stay self-contained, matching the in-memory reference; production backends SHOULD add the pepper.
2. **Sentinel errors.** Return `store.ErrNotFound`, `store.ErrAlreadyExists`, `store.ErrAlreadyConsumed`, `store.ErrConflict`, and `store.ErrTxRequired` exactly where the method godoc says (map `sql.ErrNoRows` → `ErrNotFound`; a second `Consume` → `ErrAlreadyConsumed`). Callers switch on these with `errors.Is`; returning a different error for a listed failure mode breaks the contract even though it compiles.
3. **Atomicity.** Exchanging a code, rotating a refresh token, and consuming a PAR each cross several record kinds. The library relies on each substore's `Save` / `Consume` being individually atomic, and a backend that hosts the transactional cluster SHOULD also implement `store.Transactional` so multi-substore writes share one underlying transaction. The example implements it the same way the bundled adapter does: substores take a small `querier` interface that both `*sql.DB` and `*sql.Tx` satisfy, and `BeginTx` hands out cluster substores bound to one `*sql.Tx`.

## Which approach fits

| You want | Use |
|---|---|
| Default tables, just persistence | [SQL adapter](/use-cases/sql-store) |
| Your own **table** names, default columns | SQL adapter + [`WithNaming`](/use-cases/sql-store#renaming-the-tables) |
| Keep your existing **users** table, default OIDC records | [Bring your own user store](/use-cases/byo-userstore) |
| Your own table **and column** names everywhere, or a non-SQL backend | This page |

## Run it

```sh
(cd examples/26-byo-store-from-scratch && go run -tags example .)
```

The example starts the OP on `:8080` and a paired RP on `:9090`. Sign in as `demo@example.test` / `demo`; the RP's `/me` page shows the released ID Token claims, served entirely from the `vault_*` schema.

## Read next

- [Persistent storage (SQL)](/use-cases/sql-store) — the bundled adapter and `WithNaming` table renaming.
- [Bring your own user store](/use-cases/byo-userstore) — replace only the `Users()` substore while the bundled adapter keeps the OIDC records.
- [Hot/cold split (Redis volatile)](/use-cases/hot-cold-redis) — route substores to different backends with the composite adapter.
