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
  <svg class="fig-svg" role="img" aria-labelledby="uc-byouserstore-title" viewBox="0 0 960 352" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-byouserstore-title">The library keeps the OAuth and OIDC records in its own store; your application keeps the end-user rows where they already are. The provider reaches across the boundary through three read calls and nothing else.</title>
    <!-- library side -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="432" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="52">The library owns the protocol records</text>
    <text class="fg-m" x="48" y="76">clients · codes · grants · sessions</text>
    <text class="fg-m" x="48" y="100">refresh/access tokens · PAR · IAT · RAT</text>
    <!-- seam -->
    <path class="fg-rule fg-rule--dashed fg-rule--strong" d="M480,24 V120"/>
    <!-- your side -->
    <rect class="fg-box" x="496" y="24" width="432" height="96" rx="8"/>
    <text class="fg-t2" x="512" y="52">You own the end-user rows</text>
    <text class="fg-m" x="512" y="76">members: member_id · email_address</text>
    <text class="fg-m" x="512" y="100">password_phc · full_name · locale_pref</text>
    <!-- three reads -->
    <text class="fg-lbl" x="32" y="168">the three reads that cross</text>
    <text class="fg-tab fg-accent" x="928" y="168" text-anchor="end">op.WithUserStore</text>
    <rect class="fg-box fg-box--accent" x="32" y="184" width="896" height="144" rx="8"/>
    <path class="fg-rule" d="M32,232 H928 M32,280 H928"/>
    <text class="fg-m fg-accent" x="48" y="214">FindBySubject</text>
    <text class="fg-s" x="256" y="214">reads a subject's member row — the source of ID token and /userinfo claims</text>
    <text class="fg-m fg-accent" x="48" y="262">FindByUsername</text>
    <text class="fg-s" x="256" y="262">turns a login identifier into a subject (matched on email_address here)</text>
    <text class="fg-m fg-accent" x="48" y="310">ReadPasswordHash</text>
    <text class="fg-s" x="256" y="310">returns password_phc for op.PrimaryPassword to verify</text>
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

Only `FindBySubject` belongs to `store.UserStore`; the other two come from `store.UserPasswordStore`, which the built-in password step needs. A passkey-only deployment implements `store.UserStore` alone.

Column names are irrelevant. In the example, `member_id`, `email_address`, `password_phc`, `full_name`, `locale_pref`, and `tenant_id` are projected onto `store.User.Subject` and `store.User.Claims`.

Pass the same value to `op.WithUserStore` and to `op.PrimaryPassword`. They are wired separately because a step may authenticate against something other than the claim source, but when they differ by accident nothing fails: the login succeeds, resolves a subject from one set of records, and the ID token and `/userinfo` are then built from another. `op.New` logs a warning when the two values differ.

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

Use [Hot/cold + Redis](/use-cases/hot-cold-redis) when you want to route multiple substores to different backends, for example durable grants and refresh tokens on SQL, but interactions and sessions on Redis.

## Run it

```sh
(cd examples/24-byo-userstore && GOWORK=off go run -tags example .)
```

The example starts the OP on `:8080` and a paired RP on `:9090`. Sign in as `demo@example.test` / `demo`; the RP's `/me` page shows the released ID Token claims.

## Read next

- [Persistent storage (SQL)](/use-cases/sql-store) — the bundled SQL adapter used for OIDC records.
- [MFA / step-up](/use-cases/mfa-step-up) — built-in password, TOTP, captcha, and step-up wiring.
- [Custom authenticator](/use-cases/custom-authenticator) — add a new credential factor such as SMS OTP or hardware token.
