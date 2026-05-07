---
title: Bring your own user store
description: Project an application-owned users table onto OIDC without moving user records into the bundled OP schema.
---

# Use case — Bring your own user store

You already have a users, members, employees, or accounts table, and it is not shaped like the OP's bundled `oidc_users` table. Keep that table as the source of truth. The OP only needs a projection that can resolve a subject, release authorised claims, and, if you use password login, read the password hash through the `store.UserPasswordStore` contract.

> **Source:** [`examples/24-byo-userstore`](https://github.com/libraz/go-oidc-provider/tree/main/examples/24-byo-userstore)

## Shape

The example uses two storage halves:

| Responsibility | Backing store |
|---|---|
| OAuth / OIDC records: clients, authorization codes, refresh tokens, grants, sessions, PAR, IATs, RATs, access tokens | bundled `op/storeadapter/sql` schema |
| End-user records: subject, email, name, locale, password hash, tenant metadata | embedder-owned `members` table |

`hybridStore` embeds `*oidcsql.Store` and overrides only `Users()`. Go method promotion leaves every other substore on the SQL adapter, while `/userinfo`, ID Token assembly, and password login read from the application-owned member projection.

```go
type hybridStore struct {
  *oidcsql.Store
  users store.UserPasswordStore
}

func (h *hybridStore) Users() store.UserStore { return h.users }
```

The login flow then uses the same projection for password verification:

```go
members := &MemberUserStore{db: db}
storage := &hybridStore{Store: durable, users: members}

flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: members},
}

provider, err := op.New(
  op.WithStore(storage),
  op.WithLoginFlow(flow),
  // required options...
)
```

## Projection contract

Your user-store adapter normally implements:

| Method | What it does |
|---|---|
| `FindBySubject(ctx, sub)` | Loads the stable OIDC subject and claim map for `/userinfo` and token assembly. |
| `FindByUsername(ctx, username)` | Resolves a login identifier such as email address to the same stable subject. |
| `ReadPasswordHash(ctx, subject)` | Returns the PHC-encoded password hash for `op.PrimaryPassword`; return `store.ErrNotFound` for unknown or passwordless users. |

Column names are irrelevant. In the example, `member_id`, `email_address`, `password_phc`, `full_name`, `locale_pref`, and `tenant_id` are projected onto `store.User.Subject` and `store.User.Claims`.

## Claim release

Putting a value in `store.User.Claims` does not automatically release it to every RP. The OP still applies scope and claims-request filtering. The example deliberately loads a custom `tenant` claim from the member row, but the demo RP does not receive it because no granted scope authorises it.

Use [Public / internal scopes](/use-cases/scopes) when you want to release application-specific claims through a scope, or [Claims request](/use-cases/claims-request) when an RP needs fine-grained claim selection.

## When to use composite instead

This pattern replaces only the `Users()` substore. It does not require `storeadapter/composite` because the transactional OAuth cluster stays on one SQL adapter.

Use [Hot/cold + Redis](/use-cases/hot-cold-redis) when you want to route multiple substores to different backends, for example durable grants and refresh tokens on SQL, but interactions and consumed JTIs on Redis.

## Run it

```sh
go run -tags example ./examples/24-byo-userstore
```

The example starts the OP on `:8080` and a paired RP on `:9090`. Sign in as `demo@example.test` / `demo`; the RP's `/me` page shows the released ID Token claims.

## Read next

- [Persistent storage (SQL)](/use-cases/sql-store) — the bundled SQL adapter used for OIDC records.
- [MFA / step-up](/use-cases/mfa-step-up) — built-in password, TOTP, captcha, and step-up wiring.
- [Custom authenticator](/use-cases/custom-authenticator) — add a new credential factor such as SMS OTP or hardware token.
