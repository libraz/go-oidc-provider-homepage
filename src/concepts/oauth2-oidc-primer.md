---
title: OAuth 2.0 / OIDC primer
description: A from-scratch explainer of OAuth 2.0 roles and what OpenID Connect adds. Written for engineers seeing this for the first time.
pageClass: pg-concepts-oauth2-oidc-primer
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
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html)
:::

## The three roles

<figure class="fig">
  <div class="fig-head">The three roles</div>
  <svg class="fig-svg" role="img" aria-labelledby="primer-roles-title" viewBox="0 48 960 180" xmlns="http://www.w3.org/2000/svg">
    <title id="primer-roles-title">The three OAuth and OIDC roles. The Relying Party delegates login to the OpenID Provider and receives tokens back; it then calls the Resource Server with a Bearer access token, which the Resource Server validates against the provider's keys.</title>
    <!-- Relying Party -->
    <rect class="fg-box" x="56" y="64" width="176" height="104" rx="8"/>
    <text class="fg-lbl" x="70" y="83">RP</text>
    <text class="fg-t" x="144" y="105" text-anchor="middle">Relying Party</text>
    <text class="fg-mxs" x="144" y="119" text-anchor="middle">your app</text>
    <line class="fg-rule" x1="70" y1="129" x2="218" y2="129"/>
    <text class="fg-xs" x="144" y="145" text-anchor="middle">starts the login</text>
    <text class="fg-xs" x="144" y="158" text-anchor="middle">holds tokens, calls the API</text>
    <!-- OpenID Provider -->
    <rect class="fg-box fg-box--accent" x="392" y="64" width="176" height="104" rx="8"/>
    <text class="fg-lbl fg-accent" x="406" y="83">OP</text>
    <text class="fg-t fg-accent" x="480" y="105" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="480" y="119" text-anchor="middle">go-oidc-provider</text>
    <line class="fg-rule" x1="406" y1="129" x2="554" y2="129"/>
    <text class="fg-xs" x="480" y="145" text-anchor="middle">authenticates the user</text>
    <text class="fg-xs" x="480" y="158" text-anchor="middle">mints and signs the tokens</text>
    <!-- Resource Server -->
    <rect class="fg-box" x="728" y="64" width="176" height="104" rx="8"/>
    <text class="fg-lbl" x="742" y="83">RS</text>
    <text class="fg-t" x="816" y="105" text-anchor="middle">Resource Server</text>
    <text class="fg-mxs" x="816" y="119" text-anchor="middle">your API</text>
    <line class="fg-rule" x1="742" y1="129" x2="890" y2="129"/>
    <text class="fg-xs" x="816" y="145" text-anchor="middle">validates the access token</text>
    <text class="fg-xs" x="816" y="158" text-anchor="middle">returns the data</text>
    <!-- RP to OP and back -->
    <path class="fg-edge" d="M236,106 H388" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="312" y="99" text-anchor="middle">delegate the login</text>
    <path class="fg-edge fg-edge--accent" d="M388,140 H236" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="312" y="133" text-anchor="middle">id_token · access_token</text>
    <!-- RS back to OP -->
    <path class="fg-edge fg-edge--muted" d="M724,128 H572" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="648" y="121" text-anchor="middle">check the signature</text>
    <text class="fg-mxs" x="648" y="145" text-anchor="middle">/jwks · /introspect</text>
    <!-- RP to RS, routed under the provider -->
    <path class="fg-edge" d="M144,172 V206 H816 V176" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo--plain fg-halo" x="480" y="200" text-anchor="middle">Authorization: Bearer &lt;access_token&gt;</text>
  </svg>
  <figcaption class="fig-note">The Resource Server never sees a credential — only a token, and only for as long as that token lives. That is the whole point of delegating: your API trusts the provider's signature instead of holding the user's password.</figcaption>
</figure>

The actual login steps (redirect to `/auth`, code exchange, token retrieval) are spelled out in the [authorization code + PKCE flow](#authorization-code-pkce) below. The diagram above is the static "who's responsible for what" view.

::: tip Same actor, different hat
A single piece of software can wear two hats. Your "backend for frontend" might be both the **RP** (it logs users in) and the **RS** (it has APIs the SPA calls with the access token).
:::

## OAuth 2.0 vs OpenID Connect

OAuth 2.0 is **delegated authorization** — "Alice's app gets permission to read Alice's data on Service X." OAuth 2.0 by itself does not tell the app **who Alice is**; it defines an access token as a string representing granted authorization without assigning it an identity meaning. The token may be opaque or self-contained, depending on the authorization server's choice.

OpenID Connect (OIDC) is **OAuth 2.0 plus identity**. On top of the access token, the OP issues an **ID Token** — a signed JWT that says "this token was issued for user `sub=alice123`, audience `client_id=myapp`, at this time, and the following claims about her are true." OIDC also adds a userinfo endpoint (`/userinfo`), a discovery document, RP-Initiated Logout, and a back-channel logout notification.

::: details JWT — what's that?
A **signed compact JWT** (JSON Web Token, RFC 7519) is a string of three base64url-encoded parts joined by dots: `header.payload.signature`. The header and payload are JSON; the signature is what lets a receiver verify the issuer cryptographically using a public key. An encrypted JWT uses compact JWE serialization with five parts and can carry a signed JWT inside it.

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

## The flow you'll see most often: Authorization Code + PKCE {#authorization-code-pkce}

<figure class="fig">
  <div class="fig-head">Authorization Code + PKCE — the short version</div>
  <svg class="fig-svg" role="img" aria-labelledby="primer-seq-title" viewBox="0 0 960 520" xmlns="http://www.w3.org/2000/svg">
    <title id="primer-seq-title">The Authorization Code flow with PKCE in eleven steps: the browser carries the user between the Relying Party and the OpenID Provider for login and consent, the Relying Party swaps the code for tokens at the token endpoint, and then calls the Resource Server with the access token.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="110" y1="62" x2="110" y2="502"/>
    <line class="fg-life" x1="340" y1="62" x2="340" y2="502"/>
    <line class="fg-life fg-life--accent" x1="590" y1="62" x2="590" y2="502"/>
    <line class="fg-life" x1="850" y1="62" x2="850" y2="502"/>
    <!-- actors -->
    <rect class="fg-box" x="34" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="110" y="35" text-anchor="middle">User</text>
    <text class="fg-xs" x="110" y="49" text-anchor="middle">browser</text>
    <rect class="fg-box" x="264" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="340" y="35" text-anchor="middle">RP</text>
    <text class="fg-xs" x="340" y="49" text-anchor="middle">your app</text>
    <rect class="fg-box fg-box--accent" x="510" y="16" width="160" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="590" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="590" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="774" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="850" y="35" text-anchor="middle">RS</text>
    <text class="fg-xs" x="850" y="49" text-anchor="middle">your API</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="96" r="8.5"/>
    <text class="fg-badge-t" x="15" y="99" text-anchor="middle">1</text>
    <path class="fg-edge" d="M110,96 H340" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="225" y="90" text-anchor="middle">open the app</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="140" r="8.5"/>
    <text class="fg-badge-t" x="15" y="143" text-anchor="middle">2</text>
    <path class="fg-edge" d="M340,140 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="225" y="120" text-anchor="middle">302 to the OP</text>
    <text class="fg-mxs" x="225" y="133" text-anchor="middle">client_id · redirect_uri · scope · state · code_challenge</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="176" r="8.5"/>
    <text class="fg-badge-t" x="15" y="179" text-anchor="middle">3</text>
    <path class="fg-edge" d="M110,176 H590" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo fg-halo--plain" x="420" y="170" text-anchor="middle">GET /authorize</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="212" r="8.5"/>
    <text class="fg-badge-t" x="15" y="215" text-anchor="middle">4</text>
    <path class="fg-edge" d="M590,212 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo fg-halo--plain" x="420" y="206" text-anchor="middle">200 login and consent UI</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="248" r="8.5"/>
    <text class="fg-badge-t" x="15" y="251" text-anchor="middle">5</text>
    <path class="fg-edge" d="M110,248 H590" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo fg-halo--plain" x="420" y="242" text-anchor="middle">POST credentials · consent</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="292" r="8.5"/>
    <text class="fg-badge-t" x="15" y="295" text-anchor="middle">6</text>
    <path class="fg-edge" d="M590,292 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo fg-halo--plain" x="420" y="272" text-anchor="middle">302 to the RP callback</text>
    <text class="fg-mxs fg-halo fg-halo--plain" x="420" y="285" text-anchor="middle">?code=xyz&amp;state=…</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="328" r="8.5"/>
    <text class="fg-badge-t" x="15" y="331" text-anchor="middle">7</text>
    <path class="fg-edge" d="M110,328 H340" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="225" y="322" text-anchor="middle">GET /callback?code=xyz</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="372" r="8.5"/>
    <text class="fg-badge-t" x="15" y="375" text-anchor="middle">8</text>
    <path class="fg-edge" d="M340,372 H590" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="465" y="352" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="465" y="365" text-anchor="middle">code · code_verifier · client auth</text>
    <!-- 9 -->
    <circle class="fg-badge" cx="15" cy="408" r="8.5"/>
    <text class="fg-badge-t" x="15" y="411" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M590,408 H340" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="465" y="402" text-anchor="middle">{ access_token · id_token · refresh_token }</text>
    <!-- 10 -->
    <circle class="fg-badge" cx="15" cy="452" r="8.5"/>
    <text class="fg-badge-t" x="15" y="455" text-anchor="middle">10</text>
    <path class="fg-edge" d="M340,452 H850" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo fg-halo--plain" x="595" y="432" text-anchor="middle">GET /api/…</text>
    <text class="fg-mxs fg-halo fg-halo--plain" x="595" y="445" text-anchor="middle">Authorization: Bearer &lt;access_token&gt;</text>
    <!-- 11 -->
    <circle class="fg-badge" cx="15" cy="488" r="8.5"/>
    <text class="fg-badge-t" x="15" y="491" text-anchor="middle">11</text>
    <path class="fg-edge" d="M850,488 H340" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo fg-halo--plain" x="595" y="482" text-anchor="middle">200 OK { data }</text>
  </svg>
  <figcaption class="fig-note">Steps 1 to 7 all travel through the browser, which is why <code>state</code> and <code>code_challenge</code> are sent that early: they are the only things tying the redirect that comes back to the request that went out. Steps 8 and 9 are a direct back-channel call the browser never sees.</figcaption>
</figure>

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

If you're building a banking-grade or healthcare-grade OP, you need the **FAPI 2.0 Security Profile** on top of OIDC — sender-constrained tokens (DPoP / mTLS), PAR (the authorization request is pushed server-to-server first), and a tighter algorithm allow-list. JAR (a signed authorization request) is supported by the library but is not mandated by the FAPI 2.0 Security Profile. The library enables its `FAPI2Baseline` configuration with one option:

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
