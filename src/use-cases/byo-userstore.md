---
title: Bring your own user store
description: Project an application-owned users table onto OIDC without moving user records into the bundled OP schema.
pageClass: pg-use-cases-byo-userstore
---

# Use case — Bring your own user store

You already have a users, members, employees, or accounts table, and it is not shaped like the OP's bundled `oidc_users` table. Keep that table as the source of truth. The OP only needs a projection that can resolve a subject, release authorised claims, and, if you use password login, read the password hash through the `store.UserPasswordStore` contract.

The seam runs between the OAuth records and the end-user records. The library keeps the first half; your application keeps the second, and hands the OP three read methods across the boundary.

<figure class="fig">
  <div class="fig-head">Protocol records here, people over there</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-byouserstore-title" viewBox="0 0 960 286" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-byouserstore-title">The library keeps the OAuth and OIDC records in its own store; your application keeps the end-user rows where they already are. The provider reaches across the boundary through three read calls and nothing else.</title>
    <text class="fg-lbl fg-accent" x="480" y="18" text-anchor="middle">op.WithUserStore</text>
    <line class="fg-rule fg-rule--dashed fg-rule--strong" x1="480" y1="26" x2="480" y2="270"/>
    <rect class="fg-box" x="36" y="34" width="404" height="106" rx="8"/>
    <text class="fg-t2" x="56" y="60">The library owns</text>
    <text class="fg-mxs" x="56" y="84">clients · codes · refresh tokens · grants</text>
    <text class="fg-mxs" x="56" y="104">sessions · PAR · IATs · RATs · access tokens</text>
    <text class="fg-xs" x="56" y="128">everything that only exists because the protocol says so</text>
    <rect class="fg-box" x="520" y="34" width="404" height="106" rx="8"/>
    <text class="fg-t2" x="540" y="60">You own</text>
    <text class="fg-mxs" x="540" y="84">members: member_id · email_address</text>
    <text class="fg-mxs" x="540" y="104">password_phc · full_name · locale_pref</text>
    <text class="fg-xs" x="540" y="128">the rows your product already had before any of this</text>
    <text class="fg-lbl" x="36" y="172">the three calls that cross</text>
    <rect class="fg-box fg-box--accent" x="36" y="182" width="888" height="34" rx="6"/>
    <text class="fg-m fg-accent" x="56" y="204">FindBySubject</text>
    <text class="fg-xs" x="240" y="204">reads the member row behind a subject — the source of the ID token and /userinfo claims</text>
    <rect class="fg-box fg-box--accent" x="36" y="220" width="888" height="26" rx="6"/>
    <text class="fg-m fg-accent" x="56" y="238">FindByUsername</text>
    <text class="fg-xs" x="240" y="238">turns a login identifier into a subject — matched against email_address here</text>
    <rect class="fg-box fg-box--accent" x="36" y="250" width="888" height="26" rx="6"/>
    <text class="fg-m fg-accent" x="56" y="268">ReadPasswordHash</text>
    <text class="fg-xs" x="240" y="268">returns password_phc for op.PrimaryPassword to verify — the hash never leaves your side</text>
  </svg>
  <figcaption class="fig-note">All three are reads. The library never writes a member row, never invents one, and never needs your schema to look a particular way — only for those three questions to have answers.</figcaption>
</figure>

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
(cd examples/24-byo-userstore && GOWORK=off go run -tags example .)
```

The example starts the OP on `:8080` and a paired RP on `:9090`. Sign in as `demo@example.test` / `demo`; the RP's `/me` page shows the released ID Token claims.

## Read next

- [Persistent storage (SQL)](/use-cases/sql-store) — the bundled SQL adapter used for OIDC records.
- [MFA / step-up](/use-cases/mfa-step-up) — built-in password, TOTP, captcha, and step-up wiring.
- [Custom authenticator](/use-cases/custom-authenticator) — add a new credential factor such as SMS OTP or hardware token.
