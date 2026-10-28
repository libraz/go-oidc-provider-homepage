---
title: OAuth 2.0 / OIDC primer
description: A from-scratch explainer of OAuth 2.0 roles and what OpenID Connect adds. Written for engineers seeing this for the first time.
pageClass: pg-concepts-oauth2-oidc-primer
---

# OAuth 2.0 / OpenID Connect — a from-scratch primer

To someone new to authentication and authorization, the standards look like alphabet soup: OAuth, OIDC, JWT, OP, RP, RS, PAR, JAR, JARM, DPoP, mTLS, PKCE, FAPI. There are **only three roles**, though, and almost every standard refines the same flow between them.

::: details Acronym cheat sheet (open me first)
**The three roles**
- **OP** (OpenID Provider) — the server that authenticates users and issues tokens. `go-oidc-provider` is this. Also called **AS** (Authorization Server) in pure-OAuth contexts.
- **RP** (Relying Party) — the client app that uses the OP to log users in. Also called **Client**.
- **RS** (Resource Server) — the API that accepts the access token and returns data.

**Tokens and crypto**
- **JWT** (JSON Web Token, RFC 7519) — `header.payload.signature` JSON, base64url-encoded. Self-describing, signature-verifiable.
- **JWS** (JSON Web Signature, RFC 7515) — the signing scheme JWTs use.
- **JWE** (JSON Web Encryption, RFC 7516) — encrypted variant; outer envelope wraps an inner JWS.
- **JWK** / **JWKS** (RFC 7517) — JSON Web Key / Key **Set**. The OP's public keys, fetched from `/jwks`. See [JOSE basics](/concepts/jose-basics).
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
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html)
:::

## The three roles

<figure class="fig">
  <div class="fig-head">Login is delegated; the API only checks a token</div>
  <svg class="fig-svg" role="img" aria-labelledby="primer-roles-title" viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg">
    <title id="primer-roles-title">The three OAuth and OIDC roles. The Relying Party delegates login to the OpenID Provider and receives tokens back; it then calls the Resource Server with a Bearer access token, which the Resource Server validates against the provider's keys.</title>
    <!-- arches above the row: delegate (inner), tokens back (outer) -->
    <path class="fg-edge" d="M208,152 V104 H432 V152" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="320" y="94" text-anchor="middle">delegate the login</text>
    <path class="fg-edge fg-edge--accent" d="M560,152 V56 H96 V152" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="328" y="46" text-anchor="middle">id_token · access_token</text>
    <!-- Relying Party -->
    <rect class="fg-box" x="32" y="152" width="272" height="96" rx="8"/>
    <text class="fg-t" x="48" y="180">Relying Party</text>
    <text class="fg-s" x="48" y="204">your app: starts the login</text>
    <text class="fg-s" x="48" y="228">holds tokens, calls the API</text>
    <!-- OpenID Provider -->
    <rect class="fg-box fg-box--accent" x="344" y="152" width="272" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="180">OpenID Provider</text>
    <text class="fg-mxs" x="360" y="204">go-oidc-provider</text>
    <text class="fg-s" x="360" y="228">authenticates, signs tokens</text>
    <!-- Resource Server -->
    <rect class="fg-box" x="656" y="152" width="272" height="96" rx="8"/>
    <text class="fg-t" x="672" y="180">Resource Server</text>
    <text class="fg-s" x="672" y="204">your API: checks the token</text>
    <text class="fg-s" x="672" y="228">returns the data</text>
    <!-- arches below the row: signature check (inner), Bearer call (outer) -->
    <path class="fg-edge fg-edge--muted" d="M720,248 V320 H480 V248" marker-end="url(#fg-am)"/>
    <text class="fg-s" x="600" y="286" text-anchor="middle">check the signature</text>
    <text class="fg-mxs" x="600" y="308" text-anchor="middle">/jwks · /introspect</text>
    <path class="fg-edge" d="M96,248 V376 H864 V248" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="480" y="366" text-anchor="middle">Authorization: Bearer &lt;access_token&gt;</text>
  </svg>
  <figcaption class="fig-note">The Resource Server never sees a credential — only a token, and only for as long as that token lives. That is the whole point of delegating: your API trusts the provider's signature instead of holding the user's password.</figcaption>
</figure>

The diagram above shows who is responsible for what. The login steps themselves (redirect to `/auth`, code exchange, token retrieval) are in the [authorization code + PKCE flow](#authorization-code-pkce) below.

::: tip One program, two roles
A backend-for-frontend can be both the **RP** (it logs users in) and the **RS** (it serves APIs that the SPA calls with the access token).
:::

## OAuth 2.0 vs OpenID Connect

OAuth 2.0 is **delegated authorization**: "Alice's app gets permission to read Alice's data on Service X." It does not tell the app **who Alice is**. An access token only represents the granted authorization, and the authorization server decides whether it is opaque or self-contained.

OpenID Connect (OIDC) is **OAuth 2.0 plus identity**. Alongside the access token, the OP issues an **ID Token**, a signed JWT saying "this token was issued for user `sub=alice123`, audience `client_id=myapp`, at this time, and these claims about her are true." OIDC also adds the `/userinfo` endpoint, a [discovery document](/concepts/discovery), RP-Initiated Logout, and Back-Channel Logout notifications.

::: details JWT — what's that?
A **signed compact JWT** (JSON Web Token, RFC 7519) is a string of three base64url-encoded parts joined by dots: `header.payload.signature`. The header and payload are JSON; the signature is what lets a receiver verify the issuer cryptographically using a public key. An encrypted JWT uses compact JWE serialization with five parts and can carry a signed JWT inside it.

In OIDC, **ID Tokens are always JWTs**. Access tokens issued by `go-oidc-provider` are JWTs by default and become opaque tokens if you opt in. Anyone who can read JSON and check a signature can read the default format.
:::

::: details Opaque vs JWT — quick refresher
- **Opaque token**: a random string that means nothing to whoever holds it. To learn what it grants, the receiver calls the issuer's introspection endpoint (RFC 7662), which looks the token up.
- **JWT**: the contents are encoded in the token and a signature lets the receiver verify it offline.

The trade-off: an opaque token costs a round trip to the OP on every check but can be revoked at once. A JWT is checked locally but stays valid until it expires, unless the receiver also checks for revocation. See [tokens](/concepts/tokens) for how this library splits the difference.
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
A common beginner mistake is sending the ID Token to your API. An ID Token's audience is the RP, not the RS, and passing it as a Bearer token exposes RP-oriented claims (such as the email address) to every API the user touches. The API should validate the **access token**, either through introspection (RFC 7662) or as a self-contained JWT (RFC 9068).

```http
# Wrong: the ID Token the OP issued to the RP is sent to the API
GET /orders HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...id_token...

# Right: the access token whose audience is the API
GET /orders HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...access_token...
```
:::

## The flow you'll see most often: Authorization Code + PKCE {#authorization-code-pkce}

<figure class="fig">
  <div class="fig-head">The code travels by browser, the tokens do not</div>
  <svg class="fig-svg" role="img" aria-labelledby="primer-seq-title" viewBox="0 0 960 728" xmlns="http://www.w3.org/2000/svg">
    <title id="primer-seq-title">The Authorization Code flow with PKCE in short: the browser carries the user between the Relying Party and the OpenID Provider for login and consent, the Relying Party swaps the returned code for tokens directly at the token endpoint, and then calls the Resource Server with the access token.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="704"/>
    <line class="fg-life" x1="512" y1="88" x2="512" y2="704"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="704"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Relying Party</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">your app</text>
    <rect class="fg-box" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="512" y="50" text-anchor="middle">User</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">browser</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- open the app, redirect to the OP -->
    <path class="fg-edge" d="M512,144 H192" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="352" y="134" text-anchor="middle">open the app</text>
    <path class="fg-edge" d="M192,216 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="182" text-anchor="middle">302 → /auth</text>
    <text class="fg-mxs" x="352" y="204" text-anchor="middle">redirect_uri · code_challenge</text>
    <path class="fg-edge" d="M512,272 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="262" text-anchor="middle">GET /auth</text>
    <!-- login and consent -->
    <path class="fg-edge" d="M824,312 h-40 v24 h40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="768" y="318" text-anchor="end">login and consent</text>
    <text class="fg-xs" x="768" y="340" text-anchor="end">the user signs in, approves</text>
    <!-- redirect back with the code -->
    <path class="fg-edge" d="M824,412 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="378" text-anchor="middle">302 → redirect_uri</text>
    <text class="fg-mxs" x="668" y="400" text-anchor="middle">?code=xyz&amp;state=…</text>
    <path class="fg-edge" d="M512,468 H192" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="458" text-anchor="middle">GET /callback?code=xyz</text>
    <!-- back channel: skips the browser lane -->
    <path class="fg-edge" d="M192,540 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="506" text-anchor="middle">POST /token · client auth</text>
    <text class="fg-mxs fg-halo" x="508" y="528" text-anchor="middle">code · code_verifier</text>
    <path class="fg-edge fg-edge--accent" d="M824,612 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="602" text-anchor="middle">{ access_token · id_token · refresh_token }</text>
    <!-- call the API -->
    <path class="fg-edge" d="M192,652 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="658">call the Resource Server</text>
    <text class="fg-mxs" x="248" y="680">Bearer &lt;access_token&gt;</text>
  </svg>
  <figcaption class="fig-note">Everything before <code>/token</code> travels through the browser, which is why <code>state</code> and <code>code_challenge</code> are sent that early: they are the only things tying the redirect that comes back to the request that went out. The token call skips the browser lane entirely — a direct back-channel request the browser never sees.</figcaption>
</figure>

The PKCE part (`code_challenge` on the redirect to `/auth`, `code_verifier` on `POST /token`) stops a malicious app from using an authorization code it intercepted. See the [detailed walk-through](/concepts/authorization-code-pkce).

## Concepts you'll see in this site's docs

| Term | Meaning |
|---|---|
| **[Scope](/concepts/scopes-and-claims)** | Space-separated list of permissions, e.g. `openid profile email`. The user consents to these. |
| **[Claim](/concepts/scopes-and-claims)** | A field inside a token, e.g. `sub`, `email`, `email_verified`. |
| **[Consent](/concepts/consent)** | The "this app wants to read your email" screen. The OP records the answer and skips the screen on later logins for the same scopes. |
| **Audience (`aud`)** | Who the token is for. ID Tokens have `aud = client_id`; access tokens have `aud = resource server`. |
| **[Issuer](/concepts/issuer) (`iss`)** | The OP that signed the token. RP and RS both check it against the value they expect. |
| **[JWKS](/concepts/jose-basics)** | JSON Web Key Set, the OP's public keys, fetched from `/jwks`. RPs use it to verify ID Tokens. |
| **[Discovery document](/concepts/discovery)** | `/.well-known/openid-configuration`, a JSON catalog of the OP's endpoints, scopes, algorithms and features. |

::: details `acr` and `amr` in one paragraph
`acr` says **how strong** the authentication was (an assurance-level label like `aal2`); `amr` says **which factors** were used (`["pwd","otp"]`). An RP that needs stronger assurance for a sensitive operation asks for a higher `acr` through `acr_values`, and the OP runs step-up authentication and issues a new ID Token. RFC 8176 lists the standard `amr` codes; RFC 9470 standardises step-up through `WWW-Authenticate: error="insufficient_user_authentication"`. See [MFA / step-up](/use-cases/mfa-step-up) for the setup.
:::

## What FAPI 2.0 adds

A banking-grade or healthcare-grade OP needs the **FAPI 2.0 Security Profile** on top of OIDC: sender-constrained tokens (DPoP / mTLS), PAR (the authorization request is pushed server-to-server first), and a tighter algorithm allow-list. The profile does not mandate JAR (a signed authorization request), although this library's `FAPI2Baseline` configuration turns it on. One option enables the configuration:

```go
op.WithProfile(profile.FAPI2Baseline)
```

A primer with all the acronyms expanded lives at [FAPI 2.0 primer](/concepts/fapi). For mechanics, see [sender constraint](/concepts/sender-constraint); for the full wiring, see [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline).

## Read these next

- [Authorization Code + PKCE flow](/concepts/authorization-code-pkce) — the flow above as a full sequence diagram, with a parameter glossary.
- [Client Credentials](/concepts/client-credentials) — service-to-service, no end user.
- [Refresh tokens](/concepts/refresh-tokens) — rotation, reuse detection, grace period.
- [ID Token vs access token vs userinfo](/concepts/tokens) — they look the same, they're not.
- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — what FAPI 2.0 actually adds.
- [FAPI 2.0 primer](/concepts/fapi) — what the FAPI profile is, what each acronym (PAR, JAR, JARM, …) does, and why a profile beats "OIDC + best practices."
