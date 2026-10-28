---
title: CORS for SPA
description: Configure explicit CORS origins for SPA API calls while keeping interaction and end-session ceremony origins narrowly scoped.
pageClass: pg-use-cases-cors-spa
---

# Use case — CORS for SPA

## What is a "SPA" and why does it need CORS?

A **Single-Page Application (SPA)** is a JavaScript front end (React, Vue, Svelte, ...) that runs in the browser and calls APIs with `fetch()`. Two things set it apart from a server-rendered RP:

1. It **cannot keep a `client_secret`**, because anyone can read the JS bundle. A SPA is therefore a *public client* ([client types](/concepts/client-types)) and uses **PKCE (RFC 7636)** instead of a secret to protect the authorization code.
2. It is usually served from a **different origin** than the OP (`app.example.com` versus `op.example.com`). The browser's **CORS** rules (Cross-Origin Resource Sharing, from the Fetch standard) then require the OP to allow the SPA's origin explicitly on every endpoint the SPA calls from JavaScript.

Two origins can still be *same-site* when their hosts share a registrable domain (`app.example.com` and `op.example.com`). That matters here because the OP's ceremony cookies are same-site only.

This page covers the CORS layer. PKCE is covered in [Authorization Code + PKCE](/concepts/authorization-code-pkce).

<figure class="fig">
  <div class="fig-head">Why a browser asks first</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-cors-title" viewBox="0 0 960 568" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-cors-title">The SPA calls fetch. The browser, not the SPA, sends a preflight carrying the page's origin, and the OP answers from its allow-list. Only an approved origin lets the SPA read the response to the real request.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="544"/>
    <line class="fg-life" x1="512" y1="88" x2="512" y2="544"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="544"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">The SPA</text>
    <text class="fg-mxs" x="192" y="72" text-anchor="middle">app.example.com</text>
    <rect class="fg-box" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="512" y="50" text-anchor="middle">The browser</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">runs the preflight</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- fetch -->
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">fetch()</text>
    <!-- preflight -->
    <path class="fg-edge" d="M512,200 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="190" text-anchor="middle">OPTIONS + Origin</text>
    <!-- allow-list check -->
    <path class="fg-edge fg-edge--accent" d="M824,232 h-40 v24 h40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="768" y="238" text-anchor="end">check the origin</text>
    <text class="fg-s" x="768" y="260" text-anchor="end">against the allow-list</text>
    <!-- answer -->
    <path class="fg-edge fg-edge--accent" d="M824,320 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="668" y="310" text-anchor="middle">Access-Control-Allow-Origin</text>
    <!-- real request -->
    <path class="fg-edge" d="M512,392 H824" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="382" text-anchor="middle">the real request · Bearer</text>
    <!-- response -->
    <path class="fg-edge fg-edge--accent" d="M824,456 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="668" y="446" text-anchor="middle">the response</text>
    <!-- read gate -->
    <path class="fg-edge fg-edge--muted" d="M512,520 H192" marker-end="url(#fg-am)"/>
    <text class="fg-s" x="352" y="510" text-anchor="middle">readable only if the origin matched</text>
  </svg>
  <figcaption class="fig-note">The allow-list is not an authentication check. It only decides whether a page at that origin may read the answer; the token still has to stand on its own.</figcaption>
</figure>

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE (Proof Key for Code Exchange)
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1 (browser-side public clients)
- [Fetch Standard](https://fetch.spec.whatwg.org/) (WHATWG) — defines CORS / preflight semantics
- [RFC 6265bis](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis) — Cookies, `SameSite`, `__Host-` prefix
:::

::: details Vocabulary refresher
- **Origin**: the triple `(scheme, host, port)`. `https://app.example.com:443` and `https://app.example.com:8443` are different origins. The browser's same-origin policy isolates pages from each other, and CORS is the controlled exception.
- **CORS preflight**: for a non-trivial request (an `Authorization` header, custom headers, a method other than GET, HEAD, or POST), the browser first sends an `OPTIONS` request asking "may this origin make this request?". The real request follows only if the response allows it. The OP answers preflights on every CORS-enabled endpoint, so your application code never sees them.
- **Public vs confidential client**: a *public* client (a SPA, a mobile app) cannot keep a secret. A *confidential* client (a backend) can. A public client must use PKCE, because without a secret the authorization code would otherwise be unprotected.
:::

> **Source:** [`examples/14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa)

## What the OP allows

The OP applies three CORS profiles, each with its own allow-list:

| Profile | Endpoints | Allowed origins | Response |
|---|---|---|---|
| Public | discovery, `/jwks`, protected resource metadata | any | `Access-Control-Allow-Origin: *`, no credentials |
| API (strict) | `/token`, `/userinfo`, `/par`, `/introspect`, `/revoke`, `/register`, `/bc-authorize`, `/device_authorization`, grant management | the API allow-list below | the requesting origin echoed, with credentials |
| Ceremony (strict) | the interaction state route (`/interaction/{uid}` or `LoginMount/state/{uid}`), `/end_session` | issuer origin and `WithCORSOrigins` only | same as API, narrower list |

`/auth` has no CORS: it is a browser navigation, not a `fetch()`.

The **API allow-list** is the union of:

1. the issuer's own origin;
2. the origins passed to `op.WithCORSOrigins("https://app.example.com", ...)`;
3. the origin of every `redirect_uri` of a client registered through `op.WithStaticClients`. Clients created by dynamic registration or stored in your own client store contribute nothing, so list their origins with `WithCORSOrigins`.

The **ceremony allow-list** is narrower on purpose: the issuer origin plus `WithCORSOrigins` entries, and nothing derived from `redirect_uri`. A page that is on the API list only because some client registered it as a callback must not be able to read another client's CSRF token, account list, or logout confirmation. Each ceremony origin must also be same-site with the issuer (for example `login.example.com` beside `op.example.com`). A genuinely cross-site origin you list explicitly may pass the preflight and receive CORS headers, but the browser withholds the `__Host-` ceremony cookies: `__Host-oidc_interaction` (`SameSite=Lax`), `__Host-oidc_csrf` and `__Host-oidc_logout_csrf` (`SameSite=Strict`). The interaction and end-session requests then return `404`.

## Code

```go
op.New(
  /* required options */
  op.WithCORSOrigins(
    "https://admin.example.com",     // an origin that is not a redirect_uri
    "http://localhost:5173",         // local dev against a remote issuer: API CORS only
  ),
  op.WithStaticClients(op.PublicClient{
    ID:           "spa-client",
    RedirectURIs: []string{"https://app.example.com/callback"}, // contributes https://app.example.com
    Scopes:       []string{"openid", "profile"},
  }),
)
```

Duplicates across the sources are removed. `WithCORSOrigins` rejects `*`, a missing scheme or host, and anything else that is not an absolute origin when `op.New` runs; there is no "allow everything" setting. Each port is its own origin, so list the Vite (`:5173`) and Next.js (`:3000`) dev origins you use.

## Preflight and response headers

The strict profiles behave the same way on both lists:

- A preflight (`OPTIONS` with `Access-Control-Request-Method`) from an allowed origin gets `204`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers` (the requested subset of `Content-Type, Authorization, DPoP, X-CSRF-Token`), and `Access-Control-Max-Age: 600`. The SPA state route additionally allows `DELETE`, which cancels an interaction.
- A preflight from any other origin, or for a method the endpoint does not allow, gets `403` with no CORS headers.
- A normal request from an allowed origin gets the requesting origin echoed in `Access-Control-Allow-Origin` (never `*`), `Access-Control-Allow-Credentials: true`, and `Vary: Origin`. From any other origin the response carries no `Access-Control-Allow-*` headers and the browser refuses to expose it.
- The strict profiles expose `DPoP-Nonce`, `WWW-Authenticate`, and `x-fapi-interaction-id`, so a browser SPA can run the DPoP nonce retry loop and read FAPI interaction IDs without a same-origin proxy.
- The `Access-Control-Allow-Credentials: true` header lets `fetch(url, { credentials: 'include' })` carry cookies, but it cannot override a cookie's `SameSite` attribute.

The OP emits `op.AuditCORSPreflightAllowed` (`cors.preflight.allowed`) each time it admits a preflight. The preflight is answered with `204` before any inner handler runs, so request-level audit and metrics would otherwise miss cross-origin activity. Treat the event as the baseline for legitimate CORS traffic: a sudden absence on a busy endpoint usually means a `WithCORSOrigins` change broke something, and a burst from an unfamiliar origin is worth checking against your registered `redirect_uri` origins.

## Which endpoints a SPA actually calls

Wrapping an endpoint with strict CORS is an upper bound; what a typical SPA needs is smaller.

| Endpoint | Browser calls it? | CORS needed |
|---|---|---|
| `/auth` | No: full-page redirect | No |
| `/token` | Yes: the PKCE code exchange via `fetch` | Yes |
| `/userinfo` | Yes: `Authorization: Bearer` from JS | Yes |
| `/jwks`, discovery | Yes, if an RP SDK in the browser fetches them | Yes (public profile) |
| `/introspect` | No: resource server to OP, server to server | Usually no |
| `/revoke` | Only if the SPA revokes its own tokens | Depends |
| `/par`, `/bc-authorize`, `/device_authorization` | No: the RP backend or a device starts these | No |
| `/register` | No, unless you deliberately expose registration to a SPA | Rarely |
| `/end_session` | No: full-page navigation | No |
| interaction state route | Yes, when the login UI is a SPA on another origin | Yes (ceremony list) |

The OP wraps the "no" endpoints anyway, because a wrapper costs little and helps admin consoles and browser-based test harnesses. If you do not list an origin, the strict layer sends no `Access-Control-Allow-*` headers and the browser refuses the response, which is the right outcome.

## Public client and PKCE

A SPA is a **public client** (`token_endpoint_auth_method=none`). It cannot keep a `client_secret`, so PKCE compensates:

```go
op.WithStaticClients(op.PublicClient{
  ID:           "spa-client",
  RedirectURIs: []string{"https://app.example.com/callback"},
  Scopes:       []string{"openid", "profile"},
  GrantTypes:   []string{"authorization_code", "refresh_token"},
})
```

`op.PublicClient` is the typed seed for SPAs and native apps. It sets `token_endpoint_auth_method=none` and `public_client=true` itself, so a SPA cannot ship with confidential authentication by accident. The strict CORS wrapper covers `/token`, so an allow-listed SPA can do the code exchange from JavaScript without a proxy. The OP accepts only `code_challenge_method=S256`, never `plain`.

## OP cookies and cross-site

The OP's session cookie lives on `op.example.com`; the SPA on `app.example.com` cannot read or write it. A SPA on an issuer-sibling host can send it with `credentials: 'include'`, subject to its `SameSite` attribute. A genuinely cross-site origin cannot drive the cookie-bound ceremony at all. The session cookie keeps the user signed in at the OP across `/auth` redirects; the SPA's own session belongs in the SPA's storage.

## Pitfalls

- **`credentials: 'include'` needs a specific origin, not `*`.** The strict profiles echo the origin, so `/userinfo` and `/token` work with credentials. Discovery and `/jwks` use the public profile (`*`, no credentials). If DevTools reports "credentials flag is true, but Access-Control-Allow-Credentials is not 'true'", you sent credentials to a public-profile endpoint. Drop `credentials: 'include'` for those two.
- **A forgotten port.** A different port is a different origin. A static client whose `redirect_uri` is `http://localhost:5173/callback` puts `http://localhost:5173` on the API list automatically; a dev server on another port, or a dynamically registered client, needs its own `WithCORSOrigins` entry.
- **CORS success is not ceremony success.** An explicit cross-site origin can pass the preflight and still fail the ceremony with `404`; host the login UI on an issuer-sibling, same-site host.
- **The OP cookie is not the SPA's session.** CORS lets the SPA read a response; it does not give the SPA access to `op.example.com` cookies.
