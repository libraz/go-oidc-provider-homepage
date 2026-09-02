---
title: Bring your own user store
description: Project an application-owned users table onto OIDC without moving user records into the bundled OP schema.
---

# Use case — Bring your own user store

You already have a users, members, employees, or accounts table, and it is not shaped like the OP's bundled `oidc_users` table. Keep that table as the source of truth. The OP only needs a projection that can resolve a subject, release authorised claims, and, if you use password login, read the password hash through the `store.UserPasswordStore` contract.

The seam runs between the OAuth records and the end-user records. The library keeps the first half; your application keeps the second, and hands the OP three read methods across the boundary.

<svg role="img" aria-labelledby="byo-userstore-seam-title" viewBox="0 0 760 280" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="byo-userstore-seam-title">The seam between the two halves: the library keeps the OAuth and OIDC records in its bundled store, the application keeps the end-user rows, and the OP reads across the boundary through FindBySubject, FindByUsername, and ReadPasswordHash.</title>

  <path d="M380 26 V268" style="stroke:var(--vp-c-divider);stroke-width:1.5;stroke-dasharray:6 5"/>
  <text x="380" y="16" text-anchor="middle" font-size="11" style="fill:var(--vp-c-brand-2);font-family:var(--vp-font-family-mono)">op.WithUserStore</text>

  <rect x="20" y="28" width="280" height="88" rx="8" style="fill:var(--vp-c-brand-soft);stroke:var(--vp-c-brand-2)"/>
  <text x="160" y="56" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--vp-c-brand-2)">The library owns</text>
  <text x="160" y="80" text-anchor="middle" font-size="11" style="fill:var(--vp-c-text-2)">clients · codes · refresh tokens · grants</text>
  <text x="160" y="100" text-anchor="middle" font-size="11" style="fill:var(--vp-c-text-2)">sessions · PAR · IATs · RATs · access tokens</text>

  <rect x="460" y="28" width="280" height="88" rx="8" style="fill:var(--vp-c-bg-soft);stroke:var(--vp-c-text-3)"/>
  <text x="600" y="56" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor">You own</text>
  <text x="600" y="80" text-anchor="middle" font-size="11" style="fill:var(--vp-c-text-2)">members: member_id · email_address</text>
  <text x="600" y="100" text-anchor="middle" font-size="11" style="fill:var(--vp-c-text-2)">password_phc · full_name · locale_pref</text>

  <text x="300" y="156" text-anchor="end" font-size="11" style="fill:var(--vp-c-text-2)">ID Token and /userinfo claims</text>
  <path d="M310 152 H450" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M444 147 L450 152 L444 157" style="stroke:var(--vp-c-brand-2)"/>
  <text x="380" y="142" text-anchor="middle" font-size="11" style="fill:var(--vp-c-brand-2);font-family:var(--vp-font-family-mono)">FindBySubject</text>
  <text x="460" y="156" font-size="11" style="fill:var(--vp-c-text-2)">reads the member row</text>

  <text x="300" y="202" text-anchor="end" font-size="11" style="fill:var(--vp-c-text-2)">login identifier to subject</text>
  <path d="M310 198 H450" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M444 193 L450 198 L444 203" style="stroke:var(--vp-c-brand-2)"/>
  <text x="380" y="188" text-anchor="middle" font-size="11" style="fill:var(--vp-c-brand-2);font-family:var(--vp-font-family-mono)">FindByUsername</text>
  <text x="460" y="202" font-size="11" style="fill:var(--vp-c-text-2)">matches email_address</text>

  <text x="300" y="248" text-anchor="end" font-size="11" style="fill:var(--vp-c-text-2)">op.PrimaryPassword</text>
  <path d="M310 244 H450" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M444 239 L450 244 L444 249" style="stroke:var(--vp-c-brand-2)"/>
  <text x="380" y="234" text-anchor="middle" font-size="11" style="fill:var(--vp-c-brand-2);font-family:var(--vp-font-family-mono)">ReadPasswordHash</text>
  <text x="460" y="248" font-size="11" style="fill:var(--vp-c-text-2)">returns password_phc</text>
</svg>

> **Source:** [`examples/24-byo-userstore`](https://github.com/libraz/go-oidc-provider/tree/main/examples/24-byo-userstore)

## Shape

The example uses two storage halves:

| Responsibility | Backing store |
|---|---|
| OAuth / OIDC records: clients, authorization codes, refresh tokens, grants, sessions, PAR, IATs, RATs, access tokens | bundled `op/storeadapter/sql` schema |
| End-user records: subject, email, name, locale, password hash, tenant metadata | embedder-owned `members` table |

`op.WithUserStore` directs `/userinfo` and ID Token claim reads to the application-owned projection without wrapping the SQL store. The login flow uses the same projection for password verification:

```go
members := &MemberUserStore{db: db}

flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: members},
}

provider, err := op.New(
  op.WithStore(durable),
  op.WithUserStore(members),
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

## Application-owned reauthentication

Account pages that change a password or enrol a second factor should re-authenticate the user before making the change. Read the stored hash through `ReadPasswordHash`, then pass it to `op.VerifyPassword(hash, plain)`; do not parse the PHC encoding in application code. The helper accepts valid PHC Argon2id hashes and returns `false` for a wrong password, a malformed record, or parameters outside the verifier's bounds.

```go
hash, err := members.ReadPasswordHash(ctx, subject)
if err != nil || !op.VerifyPassword(hash, submittedPassword) {
    // Use the same generic response for unknown, malformed, and wrong passwords.
    return ErrReauthenticationFailed
}
```

`op.VerifyPassword` only performs the comparison. The OP's brute-force gate covers its authentication flow, not an application-owned password-change or factor-enrolment endpoint, so the caller must add its own rate limiting or lockout policy.

## Claim release

Putting a value in `store.User.Claims` does not automatically release it to every RP. The OP still applies scope and claims-request filtering. The example deliberately loads a custom `tenant` claim from the member row, but the demo RP does not receive it because no granted scope authorises it.

Use [Public / internal scopes](/use-cases/scopes) when you want to release application-specific claims through a scope, or [Claims request](/use-cases/claims-request) when an RP needs fine-grained claim selection.

## When to use composite instead

This pattern replaces only the source of end-user claims. It does not require `storeadapter/composite` because the transactional OAuth cluster stays on one SQL adapter. `WithUserStore` avoids a wrapper that might hide optional capabilities of that adapter.

Use [Hot/cold + Redis](/use-cases/hot-cold-redis) when you want to route multiple substores to different backends, for example durable grants and refresh tokens on SQL, but interactions and consumed JTIs on Redis.

## Run it

```sh
(cd examples/24-byo-userstore && go run -tags example .)
```

The example starts the OP on `:8080` and a paired RP on `:9090`. Sign in as `demo@example.test` / `demo`; the RP's `/me` page shows the released ID Token claims.

## Read next

- [Persistent storage (SQL)](/use-cases/sql-store) — the bundled SQL adapter used for OIDC records.
- [MFA / step-up](/use-cases/mfa-step-up) — built-in password, TOTP, captcha, and step-up wiring.
- [Custom authenticator](/use-cases/custom-authenticator) — add a new credential factor such as SMS OTP or hardware token.
