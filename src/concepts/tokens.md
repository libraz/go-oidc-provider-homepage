---
title: ID Token, access token, userinfo
description: Understand the ID Token, access token, and UserInfo contracts, including JWT or opaque access tokens, OP-side revocation, and introspection authorization.
pageClass: pg-concepts-tokens
---

# ID Token, access token, and userinfo

OIDC uses three identity-related artefacts. They look interchangeable at a glance because each belongs to the same OP flow, but they serve different contracts. Mixing them up is a classic source of bugs.

::: tip Mental model in 30 seconds
- **ID Token** — a signed receipt for the RP that says "this user logged in here." Audience: the RP. Don't send it to APIs.
- **Access token** — the credential the client presents to the API. Audience: the resource server. **Default format is an RFC 9068-shaped JWT; opaque is opt-in.** A DPoP-bound token is presented with `Authorization: DPoP` and a proof.
- **UserInfo** — `GET /userinfo` with the access token to fetch fresh claims. It is not a token: JSON is the default response, while OIDC also supports signed or signed-and-encrypted JWT responses.
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — Bearer Token Usage
- [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — Token Revocation
- [RFC 7517](https://datatracker.ietf.org/doc/html/rfc7517) — JSON Web Key (JWK)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token (JWT)
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — Token Introspection
- [RFC 8176](https://datatracker.ietf.org/doc/html/rfc8176) — Authentication Method Reference Values
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 9470](https://datatracker.ietf.org/doc/html/rfc9470) — Step-up Authentication
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2 (ID Token), §5.3 (UserInfo), §3.1.2.1 (nonce), §5.5 (claims request)
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
:::

::: details JWT — what's that?
A **signed compact JWT** (JSON Web Token, RFC 7519) is a string of three base64url-encoded parts joined by dots: `header.payload.signature`. The header and payload are JSON; the signature is a cryptographic check that the token came from the holder of the matching private key. An encrypted JWT uses compact JWE serialization with five parts and can carry a signed JWT inside it.

In OIDC, **ID Tokens are always JWTs**. Access tokens issued by `go-oidc-provider` are JWTs by default, using the RFC 9068 shape, but you can opt into opaque access tokens globally or per audience. The library's ES256-only issuance and permissive inbound `jti` check mean its RFC 9068 support is [partial](/compliance/rfc-matrix). UserInfo is JSON by default, but this library can return a signed JWT or a signed-and-encrypted nested JWT when the request and client metadata call for it.
:::

## At a glance

| Artefact | Format | Audience (`aud`) | Where it goes | Lifetime | Who reads it |
|---|---|---|---|---|---|
| **ID Token** | Signed JWT (always) | The RP's `client_id` | OP → RP only | Minutes (default 10) | The RP, to know who logged in. |
| **Access token** | JWT by default; opaque when configured — see below | The RS identifier | Client → RS via `Authorization: Bearer`, or `Authorization: DPoP` plus proof when DPoP-bound | Minutes | The RS, to authorize an API call. |
| **UserInfo response** | JSON by default; signed JWT or signed-and-encrypted nested JWT when requested/configured | RP (the signed form carries the RP's `client_id` as `aud`) | RP → OP `/userinfo` (with access token) → RP | Per-request | The RP, to get fresh claims. |

<figure class="fig">
  <div class="fig-head">Who issues what, and who checks it</div>
  <svg class="fig-svg" role="img" aria-labelledby="tokens-flow-title" viewBox="0 0 960 320" xmlns="http://www.w3.org/2000/svg">
    <title id="tokens-flow-title">The OpenID Provider issues an ID token and an access token to the Relying Party. The Relying Party presents the access token to the Resource Server, and to the provider's userinfo endpoint, which answers with claims about the signed-in user.</title>
    <!-- OP -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="192" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="52">OP</text>
    <text class="fg-s" x="48" y="76">OpenID Provider</text>
    <text class="fg-mxs" x="48" y="100">go-oidc-provider</text>
    <!-- RP -->
    <rect class="fg-box" x="384" y="24" width="192" height="96" rx="8"/>
    <text class="fg-t" x="400" y="52">RP</text>
    <text class="fg-s" x="400" y="76">Relying Party</text>
    <text class="fg-s" x="400" y="100">client app</text>
    <!-- RS -->
    <rect class="fg-box" x="736" y="24" width="192" height="96" rx="8"/>
    <text class="fg-t" x="752" y="52">RS</text>
    <text class="fg-s" x="752" y="76">Resource Server</text>
    <text class="fg-s" x="752" y="100">your API</text>
    <!-- issuance -->
    <path class="fg-edge fg-edge--accent" d="M224,48 H384" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="304" y="38" text-anchor="middle">id_token</text>
    <path class="fg-edge fg-edge--accent" d="M224,104 H384" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="304" y="94" text-anchor="middle">access_token</text>
    <!-- API call -->
    <path class="fg-edge" d="M576,72 H736" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="656" y="62" text-anchor="middle">access_token</text>
    <!-- userinfo -->
    <path class="fg-leader" d="M128,120 V200"/>
    <rect class="fg-box fg-box--sub" x="32" y="200" width="256" height="96" rx="8"/>
    <text class="fg-m" x="48" y="228">/userinfo</text>
    <text class="fg-s" x="48" y="252">claims about the user</text>
    <text class="fg-s" x="48" y="276">served by the OP</text>
    <path class="fg-edge" d="M512,120 V232 H288" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="400" y="222" text-anchor="middle">GET /userinfo</text>
    <path class="fg-edge fg-edge--accent" d="M288,288 H544 V120" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="416" y="278" text-anchor="middle">200 { claims }</text>
  </svg>
  <figcaption class="fig-note">The ID token is for the RP and stops there — it answers "who signed in". The access token is a credential the RP carries outward, to your API and to <code>/userinfo</code> alike; neither of those ever sees the ID token.</figcaption>
</figure>

## ID Token — "who logged in"

A signed JWT defined by **OIDC Core 1.0 §2**. The RP verifies its signature against the OP's JWKS (RFC 7517) and validates the required claims, including `iss`, `aud`, and `exp`. If the authorization request sent a `nonce`, the ID Token must contain the same value and the RP must compare it. Standard claims:

| Claim | Meaning | Spec |
|---|---|---|
| `iss` | Issuer (the OP). Must match the RP's expectation. | OIDC Core §2 |
| `sub` | Subject identifier — opaque per-OP user ID. | OIDC Core §2 |
| `aud` | Audience — must contain the RP's `client_id`. | OIDC Core §2 |
| `azp` | Authorized party — the `client_id` requesting the token (when `aud` has multiple values). This library issues single-audience ID Tokens and does not set it. | OIDC Core §2 |
| `exp`, `iat` | Expiry / issued-at. | RFC 7519 |
| `nonce` | Echoes the `nonce` from the authorize request. Replay defence. | OIDC Core §3.1.2.1 |
| `auth_time` | When the user authenticated (vs. when the token was issued). | OIDC Core §2 |
| `acr` | Authentication Context Class Reference — assurance level the auth method provided. | OIDC Core §2 / RFC 9470 |
| `amr` | Authentication Methods References — `pwd`, `otp`, `mfa`, `hwk`, etc. | RFC 8176 |
| `at_hash`, `c_hash` | Hashes of the access token and authorization code issued alongside, so the RP can tie the ID Token to them. | OIDC Core §3.1.3.6 |

`auth_time`, `acr`, and `amr` describe the authentication behind the authorization that issued the token. A later login by the same user at the same client does not rewrite them on tokens already issued, and every refresh keeps the values of the chain's original authorization.

::: details `acr` — what's that?
**`acr`** (Authentication Context Class Reference) is a string identifying the authentication context. Your OP decides the vocabulary; examples include `urn:mace:incommon:iap:silver` and `urn:openbanking:psd2:sca`. The RP sends `acr_values=...` as an ordered preference list; OIDC Core treats it as a voluntary claim request. For a hard requirement, request `claims.id_token.acr` with `essential: true` and `value` or `values`; this library then steps up or returns an interaction error if the current session does not match. `amr` instead lists the methods used.
:::

::: details `amr` — what's that?
**`amr`** (Authentication Methods References, RFC 8176) is a JSON array of short strings describing *which factors* the user actually presented this session: `pwd` for password, `otp` for one-time code, `mfa` when more than one factor was used, `hwk` for hardware key, `face` for facial recognition, and so on. RPs typically read it for audit and policy ("require `mfa` for the admin console") rather than for trust decisions — that's what `acr` is for.
:::

::: details `auth_time` — what's that?
**`auth_time`** is the Unix timestamp of when the user *authenticated to the OP*, which is **not** the same as `iat` (when *this* token was issued). A user who logged in an hour ago and just refreshed gets a fresh `iat` but the old `auth_time`. RPs use it to enforce a `max_age` policy ("force re-auth if it's been more than 30 minutes"), and the OP enforces `max_age` itself when the RP passes it on `/auth`.
:::

::: details `azp` — what's that?
**`azp`** (Authorized Party) is the `client_id` that *requested* the ID Token. It only matters when `aud` carries multiple values — in that case, `azp` disambiguates which of those audiences actually drove the authorize request. For the common single-RP case, `aud` is just `[client_id]` and `azp` is omitted. RPs should reject ID Tokens where `aud` has many entries and `azp` is missing or doesn't match their `client_id`.
:::

::: details JWKS — what's that?
**JWKS** (JSON Web Key Set, RFC 7517) is a JSON document the OP serves at `/jwks` (advertised via the discovery document). It lists the OP's **public** keys; RPs fetch it once, cache it, and use it to verify ID Token signatures offline. The OP rotates keys by adding the new key ahead of time and publishing it before signing with it, so RPs that re-fetch the JWKS find it.
:::

::: warning Don't put the ID Token on `Authorization: Bearer`
The ID Token's audience is the RP, not the RS. A correctly configured RS rejects it; an API with incomplete token validation might accept it and expose identity claims such as email. **Use the access token for APIs.**

```http
# Wrong: aud is the RP's client_id, so this is not a token the RS should accept
GET /api/invoices HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...id_token...

# Right: an access token whose aud names the API / resource server
GET /api/invoices HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...access_token...
```
:::

## Access token — "this client may call this API"

The access token your resource server validates. An unbound or mTLS-bound token uses the Bearer authorization scheme (RFC 6750); a DPoP-bound token uses the DPoP scheme plus a proof (RFC 9449 §7.1). Two formats are available:

| Format | Validation | State on the OP |
|---|---|---|
| **Opaque** | RS calls `/introspect` (RFC 7662) every request. | OP keeps a row keyed on the token. |
| **JWT (RFC 9068 shape)** | RS verifies signature/allowed algorithm, `typ=at+jwt`, `iss`, `aud`, `exp`, `iat`, and required claims; sender-bound tokens also need proof validation. | Verification is local; the OP may keep grant tombstones or JTI rows for OP-served revocation. |

A JWT access token carries these claims:

| Claim | Meaning | Who reads it |
|---|---|---|
| `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, `client_id` | The RFC 9068 required set. `aud` is the resource server; `sub` is the per-client subject, so it matches the ID Token's. | The RS |
| `scope` | The granted scopes, space-separated. | The RS |
| `cnf` | Sender-constraint binding: `jkt` for DPoP, `x5t#S256` for mTLS. Absent for a Bearer token. | The RS |
| `auth_time`, `acr`, `amr` | The authentication behind the authorization that issued the token. | The RS, for step-up policy |
| `authorization_details` | RFC 9396 details, when the grant carries them. | The RS |
| `gid` | Private claim: the grant ID, matched against grant tombstones. | The OP only |
| `userinfo_claims` | Private claim: the `userinfo` member of the claims request, or `{}` when none was made. `/userinfo` releases claims from it. | The OP only |

Resource servers should ignore `gid` and `userinfo_claims`. Both names are reserved: a custom grant cannot set them through its extra claims.

### Why this matters: session_end, userinfo, and revocation depend on history

::: warning Offline JWT verification cannot see OP-side revocation
The RS can validate a JWT without calling the OP, but that path cannot observe grant tombstones, JTI revocation rows, logout cascades, or code-replay revocation. OP-served `/userinfo` and `/introspect` paths still consult the configured OP-side state; an offline RS must use introspection, an audit-fed denylist, or a short access-token lifetime when it needs that state.
:::

| Flow | What it should answer | What breaks under stateless JWT |
|---|---|---|
| **`/userinfo`** (OIDC Core §5.3) | "Is this token still valid for the user it represents?" | The OP checks the JWT's grant/JTI state before projecting claims. |
| **`/end_session`** (RP-Initiated Logout) | Ends the session | The OP records revocation; an offline RS keeps accepting the JWT until `exp`. |
| **`/revoke`** (RFC 7009) | Invalidates a specific token | The configured OP-side strategy records the token's revocation; offline RSes do not see it. |
| **`/introspect`** (RFC 7662) | Returns `active: false` for revoked tokens | The OP checks signature, lifetime, issuer, and configured revocation state. |

Pages comparing "JWT vs opaque" sometimes gloss over this. In production the trade-off is real.

### What `go-oidc-provider` does

The library defaults to an RFC 9068-shaped JWT and offers opaque as opt-in. Both shapes are **revocable on the OP**. The two axes that matter are: **(1) does the RS consult the OP per request?** and **(2) how far does the logout cascade reach?**

| | **Default — JWT (RFC 9068 shape)** | **Opt-in — Opaque** |
|---|---|---|
| Wire format | base64url JWT (`header.payload.signature`) | random opaque string |
| RS validation | offline against the JWKS | calls `/introspect` per request |
| OP-side state on issuance | no row under the default grant-tombstone strategy; optional JTI shadow row when selected | hashed row in `store.OpaqueAccessTokenStore` |
| Revocation reach | OP-served boundaries (`/userinfo`, `/introspect`) | every RS request |
| Audit trail of issuance | none by default; opt in via `RevocationStrategyJTIRegistry` for one shadow row per issuance | one row per issuance, automatically |
| Configured via | (default) | `op.WithAccessTokenFormat(...)` or `op.WithAccessTokenFormatPerAudience(...)` (RFC 8707) |

::: warning Cascade scope depends on the format
`/userinfo`, `/introspect`, `/revoke`, `/end_session`, and the code-replay cascade all use OP-side revocation state. A revoked or logout-cascaded token is rejected at `/userinfo` with `WWW-Authenticate: Bearer error="invalid_token"` even when its JWT signature still verifies — **but only when the request reaches the OP**. An RS that validates a JWT offline against the JWKS does not see the cascade until it receives equivalent denylist state or the token expires. Opaque format closes that gap because every RS validation reaches `/introspect`.
:::

How much each event retires depends on the event:

| Event | JWT access tokens | Opaque access tokens | Refresh tokens |
|---|---|---|---|
| `/revoke` on one access token | That token (denylisted by `jti`) | That token | none |
| `/revoke` on a refresh token | All of the grant's access tokens | All of the grant's access tokens | That token's rotation chain; the grant's other chains keep working |
| Refresh-token rotation | none (they expire) | Those of the same chain | The old token is replaced |
| Code or refresh-token replay | The whole grant | The whole grant | The whole grant |
| `/end_session`, Grant Management revoke, `RevokeSubject` | The whole grant | The whole grant | The whole grant |

The JWT column assumes the default grant-tombstone strategy; under `RevocationStrategyNone` the OP records nothing for JWTs. "Whole grant" covers the user's other sessions at the same client. That is why a replay or a logout reaches everywhere, while a rotation or a single-token `/revoke` stays narrow.

### Introspection is for confidential callers

`/introspect` authenticates the caller before it examines a token. Public clients and clients registered with token-endpoint authentication method `none` receive `401` with `invalid_client`; they cannot use introspection. A confidential caller can introspect its own access or refresh tokens. Cross-client access is inactive by default and becomes active only when the caller is listed in the matching protected resource's `IntrospectionClients` and the access token's `aud` names that resource. This delegation never applies to refresh tokens.

An active opaque access-token introspection response includes `iss` alongside the usual `active`, `client_id`, `token_type`, `exp`, `iat`, `sub`, `aud`, and `scope` fields, plus `auth_time`, `acr`, `amr`, and `authorization_details` when the token has them. Resource servers should validate `iss` and `aud` as part of their local policy. A refresh token's response has no `token_type`: RFC 7662 defines that member as the access-token type, and a `Bearer` tag would invite a resource server to treat the refresh token as an access token.

::: details `jti`? `gid`? Tombstones?
Each access token JWT issued by this library includes a `jti` (RFC 7519 §4.1.7, unique per-token). Tokens with grant lineage also carry a `gid` private claim (the OP-side GrantID, consumed by the OP only — RSes ignore it); it is omitted when no grant ID exists.

**Default — grant-tombstone strategy.** The OP keeps a small per-grant tombstone table; verification matches the JWT's `gid` against it. A single-AT `/revoke` writes one denylist row keyed on `jti`. Steady state is `O(revoked grants + revoked JTIs)`, not `O(issued)`.

**Opt-in — JTI registry strategy** (`RevocationStrategyJTIRegistry`). The OP writes one shadow row per issuance keyed on `jti`, and revocation flips the row's `Revoked` column. Useful when audit policy requires a per-issuance trail.

**Opaque format.** Uses a separate substore: the row is indexed by the SHA-256 digest of the bearer ID, and the RS reaches it through `/introspect` instead of decoding a JWT.
:::

::: tip Choosing JWT or opaque is a deliberate decision
The trade-off, the load shape, and the configuration knobs live on the dedicated page: [Access token format — JWT vs opaque](/concepts/access-token-format). Read it before you flip `WithAccessTokenFormat` — the decision is load-bearing on RS code, on operational latency, and on what "logged out" means to your deployment.
:::

::: info Note on `aud`
The access token's `aud` is **not** the `client_id`; it's the resource server's identifier (set via the client seed's `Resources []string` field, or via the RFC 8707 `resource` request parameter at runtime).
:::

## Caching `/introspect` responses on the resource server

The OP's response to `/introspect` (RFC 7662) is authoritative *at the moment it is issued*. Caching that response on the resource server is supported by the spec, and is sometimes necessary for latency. It also changes the **revocation reach** of the token: the gap between "this token was revoked at the OP" and "this RS will refuse it" widens to the cache TTL.

| Caching strategy | Latency / OP load | Revocation gap |
|---|---|---|
| **No cache** — RS calls `/introspect` on every API call. | Highest latency on the RS hot path; OP `/introspect` becomes a per-call dependency. | Zero — every API call observes the OP's current state. |
| **Long cache** (e.g. 5 minutes) | Lowest OP load; revocation does not propagate until the cache entry expires. | Up to the TTL — a logged-out user's token keeps working for the rest of the cache window. |
| **Short cache** (≤ 60 seconds) | Bounded OP load; latency hit only on the first call per window. | Up to the TTL — short enough to make most operator security regimes happy, long enough to absorb a burst. |

::: tip Recommended defaults
- **Cache key is the access-token hash** (SHA-256 of the bearer string), never `client_id` alone — different sessions for the same client must not share a cache row.
- **TTL ≤ 60 s** for security-sensitive APIs (account changes, financial actions, admin endpoints). 30 s is a reasonable default that bounds the gap to "less than the user notices."
- **Invalidate on `op.AuditTokenRevoked`** if the RS subscribes to the OP's audit stream — that turns the bounded gap into "as fast as your audit pipeline propagates," which is usually sub-second.
- **Don't cache for destructive actions.** Account deletion, fund transfers, role grants, irreversible writes — always revalidate against the OP. The latency cost is real but the alternative is "the user clicked logout, the attacker still drained the account during the cache window."
:::

This trade-off applies symmetrically to JWT access tokens with revocation enabled. JWT verification is offline against the JWKS — the RS does not have to call the OP at all — but **offline verification cannot see revocation**. The OP-served boundaries (`/introspect`, `/userinfo`) and the grant-tombstone consultation that lives behind them are the revocation source of truth (see [#19 in design judgments](/security/design-judgments#dj-19) for the tombstone strategy). An RS that wants the same revocation reach as `/userinfo` either:

1. Calls `/introspect` (with one of the cache strategies above), or
2. Subscribes to the OP audit stream and treats `op.AuditTokenRevoked` as a denylist source for offline JWT verification.

Doing neither — pure offline JWT validation, no introspection, no audit subscription — means a previously issued JWT can continue to validate until its `exp`, even after the OP revokes its grant. Revocation reaches that RS only when it consults OP state, receives equivalent denylist state, or the token expires; rotating a refresh token does not retroactively invalidate an already issued JWT. That can be acceptable for low-risk APIs but it is a deliberate trade, not a default that the spec entitles you to.

## UserInfo — "give me fresh claims for this access token"

By default, `GET /userinfo` (OIDC Core §5.3) with the access token returns a JSON document of the user's claims, scoped to whatever the access token's scopes allow. OIDC also defines a JWT-shaped response; this library returns a signed response when the client sends `Accept: application/jwt`, and registered encryption metadata can make it a nested signed-and-encrypted JWE.

The curl example uses an unbound Bearer token. For a DPoP-bound token, use `Authorization: DPoP` and supply a valid `DPoP` proof header.

```sh
curl -H "Authorization: Bearer <access_token>" https://op.example.com/oidc/userinfo
# {
#   "sub": "alice123",
#   "email": "alice@example.com",
#   "email_verified": true,
#   ...
# }
```

::: tip When to use UserInfo
- **ID Token claims** are a snapshot at login time.
- **UserInfo** is the live source — call it when you need a value (e.g. display name) that the user might have changed.

For most apps, ID Token claims are enough. UserInfo is for the cases where you need freshness. Behind the scenes, the library verifies the access token and consults the configured OP-side revocation state, so a token revoked between login and the UserInfo call is rejected even though its JWT signature may still be valid.

Before using any UserInfo claim, the RP must check that the response's `sub` exactly matches the `sub` in the ID Token. OIDC Core §5.3.4 requires the RP to discard the UserInfo response if they differ. For a signed UserInfo JWT, verify its signature and claims as well.
:::

## Configuration knobs

| Option | What it controls | Default |
|---|---|---|
| `op.WithAccessTokenTTL(d)` | Lifetime of access tokens. At most 24 hours, and at most 10 minutes under a FAPI 2.0 profile. | 5 min |
| `op.WithRefreshTokenTTL(d)` | Lifetime of refresh tokens. | 30 days |
| `op.WithRefreshTokenOfflineTTL(d)` | Lifetime of `offline_access` refresh tokens. | inherits `WithRefreshTokenTTL` |
| `op.WithAccessTokenRevocationStrategy(s)` | How a JWT access token is revoked on the OP: grant tombstone, JTI registry, or none. | grant tombstone |
| `op.WithClaimsSupported(...)` | Claims the OP can return. Surfaced in the discovery document. | — |
| `op.WithClaimsParameterSupported(false)` | Stop advertising and projecting valid OIDC §5.5 `claims` requests; malformed JSON is still rejected. | on |
| `op.WithStrictOfflineAccess()` | Switch issuance and refresh exchange to the strict OIDC Core §11 reading: refresh tokens are issued only when the granted scope contains `offline_access`. See callout below. | off (lax — `openid` + client `refresh_token` grant suffices) |

::: details `offline_access` — what's that?
**`offline_access`** is a standard OIDC scope (Core §11) that means "I want to keep working on the user's behalf when they're not present." In practice, it's the user-facing consent gate for issuing a refresh token. The OP typically shows a stronger consent prompt ("this app may act for you while you're away") and, in this library, routes the resulting refresh token to a separate TTL bucket (`WithRefreshTokenOfflineTTL`) so stay-signed-in flows can outlive everyday short-session refreshes.
:::

::: details Why `WithStrictOfflineAccess`?
The default (lax) reading of OIDC Core §11 lets the OP issue refresh tokens whenever the granted scope contains `openid` and the client's `GrantTypes` includes `refresh_token`; `offline_access` only governs consent-prompt UX and which TTL bucket applies. Pick the strict reading when you want consent prompts and the actual issuance gate to agree byte-for-byte on what the user authorised — at the cost of every RP that wants stay-signed-in behaviour explicitly requesting `offline_access`.
:::

## Read next

- [Access token format — JWT vs opaque](/concepts/access-token-format) — the design judgment between the default JWT path and the opt-in opaque path: load shape, header size, revocation reach, and the per-audience option for mixed deployments.
- [Sender constraint](/concepts/sender-constraint) — DPoP (RFC 9449) / mTLS (RFC 8705) bind the access token to a key the client holds.
- [Use case: client_credentials](/use-cases/client-credentials) — access tokens with no end-user attached.
- [Back-Channel Logout](/use-cases/back-channel-logout) — how the OP fans out logout to other RPs and cascades shadow-row revocation.
