---
title: CORS for SPA
description: Allow a SPA on a different origin to call the OP's user-facing endpoints.
---

# Use case — CORS for SPA

## What is a "SPA" and why does it need CORS?

A **Single-Page Application (SPA)** is a JavaScript front-end (React, Vue, Svelte, ...) that runs entirely in the browser and talks to APIs via `fetch()`. Two things make it different from a server-rendered RP:

1. It **cannot keep a `client_secret`** — anyone can read the JS bundle. So a SPA is a *public client* and uses **PKCE (RFC 7636)** to protect the authorization code in lieu of a secret.
2. It is typically served from a **different origin** to the OP (`app.example.com` vs `op.example.com`). Browser **CORS** (Fetch spec, "Cross-Origin Resource Sharing") then requires the OP to explicitly allow the SPA's origin on every endpoint the SPA calls from JavaScript.

This page covers the CORS layer. PKCE itself is covered in [Authorization Code + PKCE](/concepts/authorization-code-pkce).

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
2. **Auto-derived allowlist** — every registered client's `redirect_uris` contributes its origin automatically. So `WithStaticClients` already gets you most of the way.

## Code

```go
op.New(
  /* required options */
  op.WithCORSOrigins(
    "https://app.example.com",       // production SPA
    "https://staging.example.com",
    "http://localhost:5173",          // local dev — Vite default
  ),
  op.WithStaticClients(op.PublicClient{
    ID:           "spa-client",
    RedirectURIs: []string{"https://app.example.com/callback"},
    Scopes:       []string{"openid", "profile"},
    /* ... */
  }),
)
```

Both static and auto-derived origins land on the same internal list; duplicates are de-duped.

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
The CORS layer sets `Access-Control-Allow-Credentials: true` so the SPA's `fetch(url, { credentials: 'include' })` can carry the OP's session cookie. The browser also requires `Access-Control-Allow-Origin` to be a specific origin (not `*`); the library honors this — every match is the requesting origin verbatim, never a wildcard.
:::

## Public client + PKCE

A SPA is a **public client** (`token_endpoint_auth_method=none`). It cannot keep a `client_secret`. It uses PKCE to compensate:

```go
op.WithStaticClients(op.PublicClient{
  ID:           "spa-client",
  RedirectURIs: []string{"https://app.example.com/callback"},
  Scopes:       []string{"openid", "profile"},
  GrantTypes:   []string{"authorization_code", "refresh_token"},
})
```

`op.PublicClient` is the typed seed for SPAs / native apps; it sets `token_endpoint_auth_method=none` and `public_client=true` automatically so the embedder cannot accidentally ship a SPA with confidential auth.

The OP refuses `code_challenge_method=plain` for any client — `S256` only — so the SPA's PKCE is real PKCE, not the legacy variant.

## OP-issued cookies and cross-site

Even with CORS allowing the origin, the OP's session cookie is set on **op.example.com** — that's where it lives. The SPA on **app.example.com** cannot read or write it directly. The session cookie's job is to keep the user signed in at the OP across `/authorize` redirects; the SPA's session lives in the SPA's own cookie or storage.

## Per-endpoint CORS guidance

The previous table records which endpoints the library *wraps* with the strict CORS handler. That is an upper bound — every wrapped endpoint can answer a cross-origin request when the origin is allowlisted. The lower bound — which endpoints actually *need* CORS for a typical deployment — is narrower and depends on who calls the endpoint from a browser.

The allowlist is the union of two sources: explicit entries from `WithCORSOrigins` and the origin of every `redirect_uri` registered through the client store. So registering a SPA client with `RedirectURIs: []string{"https://app.example.com/callback"}` already contributes `https://app.example.com` to the CORS allowlist; `WithCORSOrigins` is for the cases where a browser-side origin does not appear as a `redirect_uri` (a separate admin SPA, a status page, a localhost dev origin).

| Endpoint | Does a browser typically call it? | CORS needed in practice? |
|---|---|---|
| `/authorize` | No — full-page redirect, never XHR. | No. |
| `/token` | Yes for SPAs (PKCE code exchange via `fetch`). | Yes for SPAs; no for backend RPs. |
| `/userinfo` | Yes for SPAs (`Authorization: Bearer` from JS). | Yes for SPAs. |
| `/jwks` | Yes — RP SDKs running in the browser fetch it. | Yes (commonly). |
| `/.well-known/openid-configuration` | Yes — discovery via `fetch` is widespread. | Yes. |
| `/introspect` | No — RFC 7662 is RS → OP, server-to-server. | Usually no. |
| `/revoke` | Maybe — only if the SPA itself initiates revocation. | Depends on the SPA design. |
| `/par` | No — RP backend pushes the auth request. | No. |
| `/bc-authorize` | No — CIBA initiation is server-side. | No. |
| `/device_authorization` | No — device-flow start is server-side. | No. |
| `/register` (Dynamic Client Registration) | No by default. | Only if you intentionally expose DCR to a SPA. |
| `/end_session` | No — full-page redirect or back-channel. | No. |

The library wraps several "no" endpoints with `strictCORS` anyway because the cost of wrapping is low and it future-proofs against tooling that does call them from JS (admin consoles, browser-based test harnesses). You don't have to add the origin to your allowlist if you don't intend to use them from the browser; without an allowlist match the strict layer responds with no `Access-Control-Allow-*` headers and the browser refuses the response — which is the correct outcome.

::: tip Audit signal for cross-origin traffic
The strict CORS layer emits `op.AuditCORSPreflightAllowed` (`cors.preflight.allowed`) every time it admits an `OPTIONS` preflight from an allowlisted origin. SOC dashboards that observe only the actual (non-preflight) request can otherwise miss cross-origin activity entirely, because the preflight is short-circuited at 204 before any inner handler runs. Treat this event as a baseline for "legitimate CORS traffic": a sudden absence on a normally-busy endpoint usually points at a misconfigured `WithCORSOrigins` change, while a sudden burst from an unfamiliar origin is worth checking against your `redirect_uris` registry.
:::

### Pitfalls when wiring the SPA

- **`credentials: 'include'` requires a specific origin, not `*`.** Browsers refuse to send cookies on a CORS request whose response carries `Access-Control-Allow-Origin: *`. The library never returns `*` for an allowlisted origin — the strict layer echoes the requesting `Origin` verbatim and pairs it with `Access-Control-Allow-Credentials: true`. The SPA can therefore call `fetch(url, { credentials: 'include' })` against `/userinfo` and the browser will accept the response. If you see "credentials flag is true, but Access-Control-Allow-Credentials is not 'true'" in DevTools, the request hit the public-CORS profile (`/jwks`, `/.well-known/openid-configuration`) — those endpoints intentionally serve `*` and do not allow credentials, because no browser-side caller needs cookies for them.
- **Wildcard origins are a configuration mistake, not a knob.** `WithCORSOrigins` validates each entry as a real origin and rejects `*` at boot — there is no "allow everything" setting. Make the list explicit: every SPA host, every staging host, every localhost dev port. Embedders frequently forget the `:5173` port for Vite or the `:3000` port for Next.js dev — the browser treats a different port as a different origin, so each must appear separately.
- **A redirect URI registered as `http://localhost:5173/callback` contributes `http://localhost:5173` to the allowlist automatically.** You don't need to repeat it in `WithCORSOrigins`. Repeating it is harmless (duplicates are de-duped) but adds noise.
- **The OP's session cookie lives on the OP's origin, not the SPA's.** CORS allows the SPA to receive a response, but it does not let the SPA read or write `op.example.com` cookies. The SPA's own session state belongs in the SPA's storage — see "OP-issued cookies and cross-site" above.
