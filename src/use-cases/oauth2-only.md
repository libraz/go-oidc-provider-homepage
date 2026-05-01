---
title: Plain OAuth 2.0 (no openid scope)
description: Serve OAuth 2.0 alongside OIDC. The same OP issues access-only tokens to non-OIDC clients.
---

# Use case — Plain OAuth 2.0

OIDC Core 1.0 §3.1.2.1 requires the `openid` scope on every authorize
request — without it, the OP must reject. That's the right default,
but you may have non-OIDC RPs that just want a Bearer token to call
your API. The library lets the same OP serve **both** shapes via a
single relaxation.

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — OAuth 2.0 Bearer Token Usage
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.1 (the `openid` scope is the OIDC switch)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — `scopes_supported`
:::

::: details Vocabulary refresher
- **OAuth 2.0 vs OIDC** — OAuth 2.0 issues `access_token`s for *delegated API access* — the token says "this client may call this API on this user's behalf". OIDC layers identity on top: when the request includes the `openid` scope, the OP additionally returns an `id_token` that asserts *who* the user is. Without `openid`, the OP behaves as a plain OAuth 2.0 server.
- **Bearer token** — An access token whose presentation alone proves authorisation (RFC 6750). The resource server validates it (by introspection or by JWT signature) and then enforces the granted scopes.
- **`/userinfo`** — Defined by OIDC, but callable with any access token whose scopes admit user claims. In OAuth-only mode, it returns whatever the access token's scopes authorise (often nothing useful).
:::

> **Source:** [`examples/15-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/15-oauth2-only)

## The seam

```go
op.New(
  /* required options */
  op.WithOpenIDScopeOptional(),
)
```

After this option:

| Request | Behaviour |
|---|---|
| `scope=openid profile email` | Full OIDC: `id_token` + `userinfo` + (when configured) `refresh_token` |
| `scope=api:read` | Plain OAuth 2.0: `access_token` only, no `id_token` |
| `scope=`(empty) | Rejected — at least one scope must be requested |

The choice is **per request**, not a global toggle. A client whose
`Scopes` list includes `openid` can still request it; a client whose
`Scopes` list omits `openid` stays in OAuth-only mode permanently.

## Side effects

| Field | OIDC mode | OAuth-only mode |
|---|---|---|
| `id_token` in `/token` response | ✅ | ❌ |
| `/userinfo` callable with the access token | ✅ | ✅ — but returns only what the access token's scopes authorise |
| Discovery `claims_supported` | populated | unaffected |
| `nonce` validation | enforced when present | bypassed |
| `auth_time` claim | included when prompted | n/a |

## Mutual exclusion

`op.WithOpenIDScopeOptional` is **incompatible** with active FAPI 2.0
profiles. FAPI 2.0 mandates OIDC; the constructor rejects the
combination at build time.

```go
op.New(
  op.WithProfile(profile.FAPI2Baseline),
  op.WithOpenIDScopeOptional(), // ← op.New returns an error
)
```

`op.WithStrictOfflineAccess()` is also incompatible (strict mode has
no meaning when `openid` itself is optional).

## When to use it

| Scenario | Pick |
|---|---|
| OAuth 2.0 only, no users (machine-to-machine) | [`client_credentials`](/use-cases/client-credentials) — `WithOpenIDScopeOptional` not needed |
| OAuth 2.0 + OIDC on the same OP for different RPs | This option |
| FAPI 2.0 deployment | Don't use this option |

## Read next

- [Tokens primer](/concepts/tokens) — what's in an access token vs an ID Token.
- [Client Credentials](/use-cases/client-credentials) — the other "no end-user" path.
