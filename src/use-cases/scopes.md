---
title: Public / internal scopes
description: Split scopes into discovery-visible (public) and admin-only (internal) — the OP advertises one, accepts both.
---

# Use case — public / internal scopes

## What is a "scope"?

In OAuth 2.0 (RFC 6749 §3.3), a **scope** is a string the client adds to its `/authorize` request to say *what kind of access it wants* — for example `email`, `profile`, `billing.read`. The OP decides which scopes to grant; the access token carries the granted scopes; the resource server inspects them to authorise API calls.

OIDC Core 1.0 §5.4 reserves the special scope `openid` (which switches the request from plain OAuth to OIDC) and the user-claim scopes `profile`, `email`, `address`, `phone`. Everything else is your own catalogue — and that catalogue is what this page lets you split into a **public** half (advertised + consented) and an **internal** half (usable by allow-listed clients but invisible to discovery).

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §3.3 (scope)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.4 (`profile`, `email`, ... mapped to claim sets)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — `scopes_supported`
:::

::: details Vocabulary refresher
- **Scope vs claim** — A *scope* is a string the client requests at `/authorize` to say *what kind of access it wants* (e.g. `email`, `billing.read`). A *claim* is a key/value piece of identity that ends up in the `id_token` or `/userinfo` response (e.g. `email`, `email_verified`). Scopes are coarse — one scope authorises a *bundle* of claims. For per-claim control see [Claims request](/use-cases/claims-request).
- **`scopes_supported`** — A discovery field listing the scopes the OP advertises. RPs read it to know what they can request. Scopes that don't appear here can still be issued — `scopes_supported` is *advertisement*, not *authorisation*.
:::

> **Source:** [`examples/12-scopes-public-private`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-scopes-public-private)

## The split

`op.PublicScope(name, label)` and `op.InternalScope(name)` are constructors that return a `Scope` value. Pass each to `op.WithScope`:

```go
op.WithScope(op.PublicScope("billing.read",  "Read your billing history")),
op.WithScope(op.PublicScope("billing.write", "Manage your invoices")),
op.WithScope(op.InternalScope("internal:audit")),
```

`PublicScope`:
- Surfaces in `scopes_supported` of the discovery document.
- Renders on the consent screen with its label.
- Available to any registered RP that lists it in its seed's `Scopes`.

`InternalScope`:
- **Not** in `scopes_supported`.
- **Not** rendered on consent (the OP issues it without prompting).
- Acceptance is governed by `Scope.AllowedClients`: an empty list means any RP may request it; a non-empty list scopes acceptance to the named clients (any other client requesting the scope is rejected with `invalid_scope` per RFC 6749 §5.2).
- `op.New` rejects an `InternalScope` whose name collides with an OIDC standard scope, so the discovery document never violates OIDC Discovery 1.0 §3.

## Releasing custom claims via `Scope.Claims`

A custom scope can declare which `/userinfo` claim names it unlocks by populating the `Scope.Claims` slice. When the scope is granted, the OP releases those claim names from the `/userinfo` response alongside the standard OIDC mappings:

```go
op.WithScope(op.Scope{
    Name:        "billing.read",
    Title:       "Billing",
    Description: "Read your billing history",
    Claims:      []string{"billing_tier", "billing_account_id"},
    Public:      true,
}),
```

When a client is granted `billing.read`, the `/userinfo` response surfaces `billing_tier` and `billing_account_id` (in addition to whatever `profile`, `email`, etc. release) — provided your `UserStore` (or the claim resolver wired into the interaction driver) actually carries those claim names for the subject.

::: tip Released since v0.9.x
Earlier builds populated `Scope.Claims` only for the consent prompt's "this scope grants…" copy; the field documented intent but the runtime never honoured it for `/userinfo` release. v0.9.x projects the configured catalogue onto a runtime scope → claim-name map so granted custom scopes now release their declared claims through `/userinfo` automatically. Embedders who hand-rolled out-of-band release hooks for the same purpose can drop them.
:::

::: info Standard OIDC scopes are unaffected
`profile`, `email`, `address`, `phone` keep their RFC-defined claim mappings (OIDC Core §5.4). `Scope.Claims` is the custom-scope hook — overriding a standard scope's claims is not necessary in normal usage, and unsetting `Public: true` on the standard scopes is rejected at `op.New`.
:::

::: tip OIDC standard scopes
`openid`, `profile`, `email`, `address`, `phone`, and `offline_access` are auto-registered with built-in defaults; you don't need to declare them. The example focuses on **your** scope catalogue.
:::

## Per-client allow-list

Add the scope to the client's `Scopes`:

```go
op.WithStaticClients(
  op.PublicClient{
    ID:           "billing-app",
    RedirectURIs: []string{"https://billing.example.com/callback"},
    Scopes:       []string{"openid", "billing.read"},
  },
  op.PublicClient{
    ID:           "audit-dashboard",
    RedirectURIs: []string{"https://audit.example.com/callback"},
    Scopes:       []string{"openid", "internal:audit"},
  },
)
```

A client requesting a scope it doesn't list gets `invalid_scope` — the catalogue and the per-client list are **AND**ed. Internal scopes add a second AND with `Scope.AllowedClients`: a client absent from that list is rejected even if it lists the scope on its own seed.

## Verifying

```sh
curl -s http://localhost:8080/.well-known/openid-configuration | jq .scopes_supported
# [
#   "openid", "profile", "email", "address", "phone", "offline_access",
#   "billing.read", "billing.write"
# ]
```

`internal:audit` is absent — and that's the point.

## When to use it

| Scenario | Pick |
|---|---|
| Internal admin app on the same OP, want it hidden from user-facing discovery | `InternalScope` |
| Beta scope you're rolling out to a small allow-list | `InternalScope` + populate the scope's `AllowedClients` |
| Public API marketplace where every scope is shoppable | All `PublicScope` |
