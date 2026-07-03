---
title: OAuth 2.0 / OIDC primer
description: A from-scratch explainer of OAuth 2.0 roles and what OpenID Connect adds. Written for engineers seeing this for the first time.
---

# OAuth 2.0 / OpenID Connect — a from-scratch primer

If you're new to authentication and authorization, the standards stack looks like an alphabet soup: OAuth, OIDC, JWT, OP, RP, RS, PAR, JAR, JARM, DPoP, mTLS, PKCE, FAPI. The good news: there are **only three roles**, and almost every standard is a refinement of the same flow between them.

::: details Acronym cheat sheet (open me first)
**The three roles**
- **OP** (OpenID Provider) — the server that authenticates users and issues tokens. `go-oidc-provider` is this. Also called **AS** (Authorization Server) in pure-OAuth contexts.
- **RP** (Relying Party) — the client app that uses the OP to log users in. Also called **Client**.
- **RS** (Resource Server) — the API that accepts the access token and returns data.

**Tokens and crypto**
- **JWT** (JSON Web Token, RFC 7519) — `header.payload.signature` JSON, base64url-encoded. Self-describing, signature-verifiable.
- **JWS** (JSON Web Signature, RFC 7515) — the signing scheme JWTs use.
- **JWE** (JSON Web Encryption, RFC 7516) — encrypted variant; outer envelope wraps an inner JWS.
- **JWK** / **JWKS** (RFC 7517) — JSON Web Key / Key **Set**. The OP's public keys, fetched from `/jwks`.
- **PKCE** (RFC 7636) — proof of possession on the authorization code; stops code-interception attacks. Pronounced "pixie."

**Profile / hardening acronyms**
- **PAR** (RFC 9126) — Pushed Authorization Request. The RP POSTs the authorize request to the OP first; the browser only carries a `request_uri` reference.
- **JAR** (RFC 9101) — JWT-Secured Authorization Request. The authorize request is itself a signed JWT.
- **JARM** (OpenID FAPI) — JWT-Secured Authorization Response Mode. The authorize **response** is a signed JWT.
- **DPoP** (RFC 9449) — Demonstrating Proof of Possession. Binds a token to a key the client holds, on every request.
- **mTLS** (RFC 8705) — mutual TLS. Same idea as DPoP, but the binding is the client's TLS certificate.
- **FAPI** (Financial-grade API) — the OpenID profile that pins all of the above into one set.
- **CIBA** — Client-Initiated Backchannel Authentication. Push-to-phone flow, no browser on the device.

**Identity claims you'll see early**
- **`sub`** — Subject. The user's opaque identifier on this OP.
- **`aud`** — Audience. Who the token is for.
- **`iss`** — Issuer. The OP that signed the token.
- **`scope`** — space-separated permission list (`openid profile email`).
- **`acr`** (Authentication Context Class Reference) — assurance level the auth method provided. Used by step-up.
- **`amr`** (Authentication Methods References) — RFC 8176 codes for the factors actually used (`pwd`, `otp`, `mfa`, `hwk`, `face`, `fpt`).
- **`cnf`** — confirmation. The key the token is bound to (DPoP `jkt` thumbprint or mTLS `x5t#S256`).
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — Bearer Token Usage
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token (JWT)
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — Token Introspection
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

## The three roles

<svg class="diag diag-roles" role="img" aria-labelledby="roles-title" viewBox="0 0 760 202" style="width:100%;height:auto;max-width:760px;display:block;margin:1.5rem auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="roles-title">The three OAuth/OIDC roles: the RP delegates authentication to the OP and receives tokens, then calls the RS with a Bearer access token.</title>
  <style>
    .diag-roles text{stroke:none;fill:var(--vp-c-text-1)}
    .diag-roles .p{font-family:var(--vp-font-family-base)}
    .diag-roles .m{font-family:var(--vp-font-family-mono)}
    .diag-roles .sub{fill:var(--vp-c-text-2)}
    .diag-roles .op{stroke:var(--vp-c-brand-2)}
    .diag-roles .opf{fill:var(--vp-c-brand-2)}
    .diag-roles .rs{stroke:var(--vp-c-text-3)}
    .diag-roles .rsf{fill:var(--vp-c-text-3)}
  </style>
  <defs>
    <marker id="roles-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <rect x="14" y="16" width="186" height="128" rx="8"/>
  <rect class="op" x="287" y="16" width="186" height="128" rx="8"/>
  <rect class="rs" x="560" y="16" width="186" height="128" rx="8"/>
  <text class="p" x="107" y="50" text-anchor="middle" font-size="18" font-weight="700">RP</text>
  <text class="p sub" x="107" y="72" text-anchor="middle" font-size="11">Relying Party / Client</text>
  <text class="p sub" x="107" y="90" text-anchor="middle" font-size="11">your app</text>
  <text class="p sub" x="107" y="114" text-anchor="middle" font-size="10">initiates login, holds</text>
  <text class="p sub" x="107" y="128" text-anchor="middle" font-size="10">tokens, calls APIs</text>
  <text class="p opf" x="380" y="50" text-anchor="middle" font-size="18" font-weight="700">OP</text>
  <text class="p sub" x="380" y="72" text-anchor="middle" font-size="11">OpenID Provider</text>
  <text class="m opf" x="380" y="91" text-anchor="middle" font-size="11">go-oidc-provider</text>
  <text class="p sub" x="380" y="114" text-anchor="middle" font-size="10">authenticates users,</text>
  <text class="p sub" x="380" y="128" text-anchor="middle" font-size="10">mints tokens</text>
  <text class="p rsf" x="653" y="50" text-anchor="middle" font-size="18" font-weight="700">RS</text>
  <text class="p sub" x="653" y="72" text-anchor="middle" font-size="11">Resource Server</text>
  <text class="p sub" x="653" y="90" text-anchor="middle" font-size="11">your API</text>
  <text class="p sub" x="653" y="114" text-anchor="middle" font-size="10">validates the access</text>
  <text class="p sub" x="653" y="128" text-anchor="middle" font-size="10">token, returns data</text>
  <text class="p sub" x="243" y="60" text-anchor="middle" font-size="10">delegate auth /</text>
  <text class="p sub" x="243" y="74" text-anchor="middle" font-size="10">receive tokens</text>
  <line x1="200" y1="88" x2="287" y2="88" marker-start="url(#roles-ah)" marker-end="url(#roles-ah)"/>
  <path d="M120 144 C 120 200, 640 200, 640 144" marker-end="url(#roles-ah)"/>
  <text class="p sub" x="380" y="178" text-anchor="middle" font-size="10"><tspan class="m">Bearer</tspan> access token</text>
</svg>

The actual login steps (redirect to `/auth`, code exchange, token retrieval) are spelled out in the [authorization code + PKCE flow](#the-most-common-flow-authorization-code--pkce) below. The diagram above is the static "who's responsible for what" view.

::: tip Same actor, different hat
A single piece of software can wear two hats. Your "backend for frontend" might be both the **RP** (it logs users in) and the **RS** (it has APIs the SPA calls with the access token).
:::

## OAuth 2.0 vs OpenID Connect

OAuth 2.0 is **delegated authorization** — "Alice's app gets permission to read Alice's data on Service X." OAuth 2.0 by itself does not tell the app **who Alice is**; it only hands out an opaque access token.

OpenID Connect (OIDC) is **OAuth 2.0 plus identity** — the OP additionally issues an **ID Token** (a signed JWT) that says "this token was issued for user `sub=alice123`, audience `client_id=myapp`, at this time, and the following claims about her are true." OIDC adds a userinfo endpoint (`/userinfo`), a discovery document, RP-Initiated Logout, and a back-channel logout notification.

::: details JWT — what's that?
A **JWT** (JSON Web Token, RFC 7519) is a string of three base64url chunks joined by dots: `header.payload.signature`. The header and payload are JSON; the signature is what lets a receiver verify the issuer cryptographically using a public key.

In OIDC, **ID Tokens are always JWTs**. Access tokens issued by `go-oidc-provider` are JWTs by default and can be switched to opaque tokens when you opt in. If you can read JSON and check a signature, you can read the default JWT shape — no proprietary binary format involved.
:::

::: details Opaque vs JWT — quick refresher
- **Opaque token** — a random string that means nothing to whoever holds it. To know what it grants, the receiver calls the issuer's introspection endpoint (RFC 7662), which looks up a row.
- **JWT** — self-describing: the contents are encoded inside the token, and a signature lets the receiver verify it offline.

The trade-off is "every request hits the OP" vs "OP loses fine-grained revocation visibility." See [tokens](/concepts/tokens) for how this library splits the difference.
:::

::: details So when do I use which?
- Pure OAuth 2.0: an API that just needs to say "this token is allowed to call `POST /things`." Common for service-to-service.
- OIDC: anything where a human logs in and the app needs to say "hello, Alice." Almost every web/mobile app login is OIDC.

`go-oidc-provider` defaults to OIDC (the `openid` scope is required) but flips to pure OAuth 2.0 with `op.WithOpenIDScopeOptional()`.
:::

## The four token types you'll meet

| Token | Lifetime | What it is | Where it goes |
|---|---|---|---|
| **Authorization code** | Seconds (default 60s) | Single-use opaque string. | Server-to-server: RP → OP `/token`. |
| **Access token** | Minutes (default 5 min) | The thing you put on `Authorization: Bearer …` to call APIs. JWT or opaque. | RP → RS. |
| **Refresh token** | Days–weeks (30d default) | Long-lived; lets the RP get a new access token without re-authenticating. | RP → OP `/token`. |
| **ID Token** | Minutes (default 10 min) | Signed JWT proving who the user is. *Never* sent to APIs. | OP → RP, consumed inside the RP. |

::: warning Don't put ID Tokens on Bearer
A common beginner mistake: sending the ID Token to your API. Don't — ID Tokens are for the RP to read; access tokens are for the RS. Your API should validate the **access token**, optionally with `Authorization Server`-side **introspection** (RFC 7662) or as a self-contained JWT (RFC 9068).
:::

## The flow you'll see most often: Authorization Code + PKCE

<svg class="diag diag-authcode" role="img" aria-labelledby="authcode-title" viewBox="0 0 772 520" style="width:100%;height:auto;max-width:772px;display:block;margin:1.5rem auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="authcode-title">Authorization Code + PKCE sequence: the browser carries the user between the RP and the OP for login and code exchange, then the RP calls the RS with the access token.</title>
  <style>
    .diag-authcode text{stroke:none;fill:var(--vp-c-text-1)}
    .diag-authcode .p{font-family:var(--vp-font-family-base)}
    .diag-authcode .m{font-family:var(--vp-font-family-mono)}
    .diag-authcode .sub{fill:var(--vp-c-text-2)}
    .diag-authcode .life{stroke:var(--vp-c-divider);stroke-width:1.5}
    .diag-authcode .op{stroke:var(--vp-c-brand-2)}
    .diag-authcode .opf{fill:var(--vp-c-brand-2)}
    .diag-authcode .rs{stroke:var(--vp-c-text-3)}
    .diag-authcode .rsf{fill:var(--vp-c-text-3)}
  </style>
  <defs>
    <marker id="authcode-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <line class="life" x1="70" y1="48" x2="70" y2="506"/>
  <line class="life" x1="280" y1="48" x2="280" y2="506"/>
  <line class="life op" x1="500" y1="48" x2="500" y2="506"/>
  <line class="life rs" x1="700" y1="48" x2="700" y2="506"/>
  <rect x="20" y="12" width="100" height="36" rx="6"/>
  <text class="p" x="70" y="30" text-anchor="middle" font-size="12" font-weight="700">User</text>
  <text class="p sub" x="70" y="43" text-anchor="middle" font-size="9">(browser)</text>
  <rect x="230" y="12" width="100" height="36" rx="6"/>
  <text class="p" x="280" y="30" text-anchor="middle" font-size="12" font-weight="700">RP</text>
  <text class="p sub" x="280" y="43" text-anchor="middle" font-size="9">your app</text>
  <rect class="op" x="440" y="12" width="120" height="36" rx="6"/>
  <text class="p opf" x="500" y="29" text-anchor="middle" font-size="12" font-weight="700">OP</text>
  <text class="m opf" x="500" y="43" text-anchor="middle" font-size="9">go-oidc-provider</text>
  <rect class="rs" x="650" y="12" width="100" height="36" rx="6"/>
  <text class="p rsf" x="700" y="30" text-anchor="middle" font-size="12" font-weight="700">RS</text>
  <text class="p sub" x="700" y="43" text-anchor="middle" font-size="9">your API</text>
  <circle cx="24" cy="92" r="10"/>
  <text class="p" x="24" y="96" text-anchor="middle" font-size="11">1</text>
  <line x1="70" y1="92" x2="280" y2="92" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="83" font-size="11">open app</text>
  <circle cx="24" cy="132" r="10"/>
  <text class="p" x="24" y="136" text-anchor="middle" font-size="11">2</text>
  <line x1="280" y1="132" x2="70" y2="132" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="110" font-size="11">redirect to OP <tspan class="m">/auth</tspan></text>
  <text class="m" x="78" y="122" font-size="9.5">client_id, redirect_uri, scope, state, code_challenge</text>
  <circle cx="24" cy="172" r="10"/>
  <text class="p" x="24" y="176" text-anchor="middle" font-size="11">3</text>
  <line x1="70" y1="172" x2="500" y2="172" marker-end="url(#authcode-ah)"/>
  <text class="m" x="78" y="163" font-size="10">GET /auth …</text>
  <circle cx="24" cy="212" r="10"/>
  <text class="p" x="24" y="216" text-anchor="middle" font-size="11">4</text>
  <line x1="500" y1="212" x2="70" y2="212" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="203" font-size="11">login + consent UI</text>
  <circle cx="24" cy="252" r="10"/>
  <text class="p" x="24" y="256" text-anchor="middle" font-size="11">5</text>
  <line x1="70" y1="252" x2="500" y2="252" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="243" font-size="11">submit credentials</text>
  <circle cx="24" cy="292" r="10"/>
  <text class="p" x="24" y="296" text-anchor="middle" font-size="11">6</text>
  <line x1="500" y1="292" x2="70" y2="292" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="270" font-size="11">302 redirect to RP <tspan class="m">/callback</tspan></text>
  <text class="m" x="78" y="282" font-size="10">?code=xyz&amp;state=…</text>
  <circle cx="24" cy="332" r="10"/>
  <text class="p" x="24" y="336" text-anchor="middle" font-size="11">7</text>
  <line x1="70" y1="332" x2="280" y2="332" marker-end="url(#authcode-ah)"/>
  <text class="m" x="78" y="323" font-size="10">GET /callback?code=xyz</text>
  <circle cx="24" cy="372" r="10"/>
  <text class="p" x="24" y="376" text-anchor="middle" font-size="11">8</text>
  <line x1="280" y1="372" x2="500" y2="372" marker-end="url(#authcode-ah)"/>
  <text class="m" x="288" y="350" font-size="10">POST /token</text>
  <text class="m" x="288" y="362" font-size="9.5">code=xyz, code_verifier=…, client auth</text>
  <circle cx="24" cy="412" r="10"/>
  <text class="p" x="24" y="416" text-anchor="middle" font-size="11">9</text>
  <line x1="500" y1="412" x2="280" y2="412" marker-end="url(#authcode-ah)"/>
  <text class="m" x="288" y="403" font-size="10">{ access_token, id_token, refresh_token }</text>
  <circle cx="24" cy="452" r="10"/>
  <text class="p" x="24" y="456" text-anchor="middle" font-size="11">10</text>
  <line x1="280" y1="452" x2="700" y2="452" marker-end="url(#authcode-ah)"/>
  <text class="m" x="288" y="430" font-size="10">GET /api/…</text>
  <text class="m" x="288" y="442" font-size="9.5">Authorization: Bearer &lt;access_token&gt;</text>
  <circle cx="24" cy="492" r="10"/>
  <text class="p" x="24" y="496" text-anchor="middle" font-size="11">11</text>
  <line x1="700" y1="492" x2="280" y2="492" marker-end="url(#authcode-ah)"/>
  <text class="m" x="288" y="483" font-size="10">200 OK  { data }</text>
</svg>

The "+ PKCE" piece (steps highlighted via `code_challenge`/`code_verifier`) is what stops a malicious app from intercepting the authorization code. [Detailed walk-through](/concepts/authorization-code-pkce).

## Concepts you'll see in this site's docs

| Term | Meaning |
|---|---|
| **Scope** | Space-separated list of permissions, e.g. `openid profile email`. The user consents to these. |
| **Claim** | A field inside a token, e.g. `sub`, `email`, `email_verified`. |
| **Consent** | The "this app wants to read your email" screen. The OP records it; subsequent logins skip it for the same scopes. |
| **Audience (`aud`)** | Who the token is for. ID Tokens have `aud = client_id`; access tokens have `aud = resource server`. |
| **Issuer (`iss`)** | The OP that signed the token. RP and RS both check it matches their expectation. |
| **JWKS** | JSON Web Key Set — the OP's public keys, fetched from `/jwks`. RPs use this to verify ID Tokens. |
| **Discovery document** | `/.well-known/openid-configuration` — a JSON catalog of every endpoint, supported scope, supported algorithm, etc. |

::: details `acr` and `amr` in one paragraph
`acr` says **how strong** the authentication was (an assurance-level label like `aal2`); `amr` says **which factors** were used (`["pwd","otp"]`). RPs that need elevated assurance for sensitive operations request a higher `acr` via `acr_values`; the OP runs step-up authentication and re-issues the ID Token. RFC 8176 catalogs the standard `amr` codes; RFC 9470 standardises step-up via `WWW-Authenticate: error="insufficient_user_authentication"`. See [MFA / step-up](/use-cases/mfa-step-up) for wiring.
:::

## What FAPI 2.0 adds

If you're building a banking-grade or healthcare-grade OP, you need **FAPI 2.0** on top of OIDC — sender-constrained tokens (DPoP / mTLS), PAR (the authorize request goes server-to-server first), JAR (the request is a signed JWT), and a tighter algorithm allow-list. The library makes this one option:

```go
op.WithProfile(profile.FAPI2Baseline)
```

A primer with all the acronyms expanded lives at [FAPI 2.0 primer](/concepts/fapi). For mechanics, see [sender constraint](/concepts/sender-constraint); for the full wiring, see [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline).

## Read these next

- [Authorization Code + PKCE flow](/concepts/authorization-code-pkce) — the flow above, with mermaid sequence and a parameter glossary.
- [Client Credentials](/concepts/client-credentials) — service-to-service, no end user.
- [Refresh tokens](/concepts/refresh-tokens) — rotation, reuse detection, grace period.
- [ID Token vs access token vs userinfo](/concepts/tokens) — they look the same, they're not.
- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — what FAPI 2.0 actually adds.
- [FAPI 2.0 primer](/concepts/fapi) — what the FAPI profile is, what each acronym (PAR, JAR, JARM, …) does, and why a profile beats "OIDC + best practices."
