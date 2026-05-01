---
title: CORS for SPA
description: Allow a SPA on a different origin to call the OP's user-facing endpoints.
---

# Use case — CORS for SPA

## What is a "SPA" and why does it need CORS?

A **Single-Page Application (SPA)** is a JavaScript front-end (React,
Vue, Svelte, ...) that runs entirely in the browser and talks to APIs
via `fetch()`. Two things make it different from a server-rendered RP:

1. It **cannot keep a `client_secret`** — anyone can read the JS
   bundle. So a SPA is a *public client* and uses **PKCE (RFC 7636)**
   to protect the authorization code in lieu of a secret.
2. It is typically served from a **different origin** to the OP
   (`app.example.com` vs `op.example.com`). Browser **CORS** (Fetch
   spec, "Cross-Origin Resource Sharing") then requires the OP to
   explicitly allow the SPA's origin on every endpoint the SPA calls
   from JavaScript.

This page covers the CORS layer. PKCE itself is covered in
[Authorization Code + PKCE](/concepts/authorization-code-pkce).

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE (Proof Key for Code Exchange)
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1 (browser-side public clients)
- [Fetch Standard](https://fetch.spec.whatwg.org/) (WHATWG) — defines CORS / preflight semantics
- [RFC 6265bis](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis) — Cookies, `SameSite`, `__Host-` prefix
:::

::: details Vocabulary refresher
- **Origin** — The triple `(scheme, host, port)` — `https://app.example.com:443` and `https://app.example.com:8443` are different origins. The browser's same-origin policy isolates pages from each other; CORS is the controlled escape hatch.
- **CORS preflight** — For non-trivial XHR (`Authorization` header, custom headers, methods other than GET/HEAD/POST), the browser first sends an `OPTIONS` request asking the server "may this origin make this request?". If the server's headers allow it, the actual request follows. The OP responds to preflight on every CORS-enabled endpoint without bothering your app code.
- **Public vs confidential client** — A *public* client (a SPA, a mobile app) cannot keep a secret — anyone can read the bundle. A *confidential* client (a backend) can. Public clients must use PKCE on the authorization-code flow because the secret-equivalent (the code) would otherwise be unprotected on the wire.
:::

> **Source:** [`examples/14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa)

## What the OP allows

Two layers compose:

1. **Static allowlist** — `op.WithCORSOrigins("https://app.example.com", ...)`
2. **Auto-derived allowlist** — every registered client's `redirect_uris`
   contributes its origin automatically. So `WithStaticClients` already
   gets you most of the way.

## Code

```go
op.New(
  /* required options */
  op.WithCORSOrigins(
    "https://app.example.com",       // production SPA
    "https://staging.example.com",
    "http://localhost:5173",          // local dev — Vite default
  ),
  op.WithStaticClients(op.ClientSeed{
    ID:           "spa-client",
    RedirectURIs: []string{"https://app.example.com/callback"},
    /* ... */
  }),
)
```

Both static and auto-derived origins land on the same internal list;
duplicates are de-duped.

## What endpoints get CORS headers

| Endpoint | CORS-enabled? | Why |
|---|---|---|
| `/.well-known/openid-configuration` | ✅ | RPs and SPAs fetch it. |
| `/jwks` | ✅ | RPs and SPAs verify ID Tokens. |
| `/userinfo` | ✅ | SPAs call it with a Bearer token. |
| `/interaction/*` (when SPA driver is in use) | ✅ | The SPA polls these. |
| `/session/*` | ✅ | SPA reads session state. |
| `/authorize` | ❌ | Browser navigation, not XHR. |
| `/token` | ❌ | RPs are server-side; SPAs use `code+PKCE` via redirect, not XHR. |
| `/par`, `/introspect`, `/revoke` | ❌ | Backend-to-backend. |

::: tip credentialed XHR
The CORS layer sets `Access-Control-Allow-Credentials: true` so the
SPA's `fetch(url, { credentials: 'include' })` can carry the OP's
session cookie. The browser also requires `Access-Control-Allow-Origin`
to be a specific origin (not `*`); the library honors this — every
match is the requesting origin verbatim, never a wildcard.
:::

## Public client + PKCE

A SPA is a **public client** (`token_endpoint_auth_method=none`).
It cannot keep a `client_secret`. It uses PKCE to compensate:

```go
op.WithStaticClients(op.ClientSeed{
  ID:                      "spa-client",
  TokenEndpointAuthMethod: op.AuthNone,
  GrantTypes:              []grant.Type{grant.AuthorizationCode, grant.RefreshToken},
  RedirectURIs:            []string{"https://app.example.com/callback"},
})
```

The OP refuses `code_challenge_method=plain` for any client — `S256`
only — so the SPA's PKCE is real PKCE, not the legacy variant.

## OP-issued cookies and cross-site

Even with CORS allowing the origin, the OP's session cookie is set on
**op.example.com** — that's where it lives. The SPA on **app.example.com**
cannot read or write it directly. The session cookie's job is to keep
the user signed in at the OP across `/authorize` redirects; the SPA's
session lives in the SPA's own cookie or storage.
