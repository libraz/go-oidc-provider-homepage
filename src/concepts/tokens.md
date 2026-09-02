---
title: ID Token, access token, userinfo
description: Understand the ID Token, access token, and UserInfo contracts, including JWT or opaque access tokens, OP-side revocation, and introspection authorization.
pageClass: pg-concepts-tokens
---

# ID Token, access token, and userinfo

OIDC produces three identity artefacts. They look interchangeable at a glance — all of them carry user info, all of them are produced by the OP. They are not interchangeable. Mixing them up is a classic source of bugs.

::: tip Mental model in 30 seconds
- **ID Token** — a signed receipt for the RP that says "this user logged in here." Audience: the RP. Don't send it to APIs.
- **Access token** — the bearer credential the RP hands to the API. Audience: the resource server. **Default format is JWT (RFC 9068); opaque is opt-in.**
- **UserInfo** — `GET /userinfo` with the access token to fetch fresh claims. Not a token at all — a JSON response.
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
A **JWT** (JSON Web Token, RFC 7519) is a string of three base64url chunks joined by dots: `header.payload.signature`. The header and payload are JSON; the signature is a cryptographic check that the token came from the holder of the matching private key.

In OIDC, **ID Tokens are always JWTs**. Access tokens issued by `go-oidc-provider` are JWTs by default (RFC 9068), but you can opt into opaque access tokens globally or per audience. UserInfo is not a JWT — it's a plain JSON HTTP response.
:::

## At a glance

| Artefact | Format | Audience (`aud`) | Where it goes | Lifetime | Who reads it |
|---|---|---|---|---|---|
| **ID Token** | Signed JWT (always) | The RP's `client_id` | OP → RP only | Minutes (default 10) | The RP, to know who logged in. |
| **Access token** | JWT by default (RFC 9068); opaque when configured — see below | The RS identifier | RP → RS via `Authorization: Bearer` | Minutes | The RS, to authorize an API call. |
| **UserInfo response** | JSON | n/a (RP's `client_id` implied) | RP → OP `/userinfo` (with access token) → RP | Per-request | The RP, to get fresh claims. |

<figure class="fig">
  <div class="fig-head">Who issues what, and who checks it</div>
  <svg class="fig-svg" role="img" aria-labelledby="tokens-flow-title" viewBox="0 30 960 240" xmlns="http://www.w3.org/2000/svg">
    <title id="tokens-flow-title">The OpenID Provider issues an ID token and an access token to the Relying Party. The Relying Party presents the access token to the Resource Server, and to the provider's userinfo endpoint, which answers with claims about the signed-in user.</title>
    <!-- OP -->
    <rect class="fg-box fg-box--accent" x="40" y="44" width="240" height="100" rx="8"/>
    <text class="fg-lbl fg-accent" x="54" y="64">OP</text>
    <text class="fg-t fg-accent" x="160" y="88" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="160" y="102" text-anchor="middle">go-oidc-provider</text>
    <line class="fg-rule" x1="54" y1="114" x2="266" y2="114"/>
    <text class="fg-xs" x="160" y="132" text-anchor="middle">mints and signs every token</text>
    <!-- RP -->
    <rect class="fg-box" x="400" y="44" width="240" height="100" rx="8"/>
    <text class="fg-lbl" x="414" y="64">RP</text>
    <text class="fg-t" x="520" y="88" text-anchor="middle">Relying Party</text>
    <text class="fg-mxs" x="520" y="102" text-anchor="middle">client app</text>
    <line class="fg-rule" x1="414" y1="114" x2="626" y2="114"/>
    <text class="fg-xs" x="520" y="132" text-anchor="middle">holds the tokens</text>
    <!-- RS -->
    <rect class="fg-box" x="760" y="44" width="160" height="100" rx="8"/>
    <text class="fg-lbl" x="774" y="64">RS</text>
    <text class="fg-t" x="840" y="88" text-anchor="middle">Resource Server</text>
    <text class="fg-mxs" x="840" y="102" text-anchor="middle">your API</text>
    <line class="fg-rule" x1="774" y1="114" x2="906" y2="114"/>
    <text class="fg-xs" x="840" y="132" text-anchor="middle">validates the token</text>
    <!-- userinfo -->
    <rect class="fg-box fg-box--sub" x="40" y="196" width="240" height="56" rx="8"/>
    <text class="fg-m" x="160" y="220" text-anchor="middle">/userinfo</text>
    <text class="fg-xs" x="160" y="236" text-anchor="middle">claims about the signed-in user</text>
    <!-- issuance -->
    <path class="fg-edge fg-edge--accent" d="M284,74 H396" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="340" y="67" text-anchor="middle">id_token</text>
    <path class="fg-edge fg-edge--accent" d="M284,112 H396" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="340" y="105" text-anchor="middle">access_token</text>
    <!-- API call -->
    <path class="fg-edge" d="M644,100 H756" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="700" y="74" text-anchor="middle">Authorization:</text>
    <text class="fg-mxs" x="700" y="88" text-anchor="middle">Bearer &lt;access_token&gt;</text>
    <!-- userinfo round trip -->
    <path class="fg-edge" d="M520,148 V218 H288" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="410" y="211" text-anchor="middle">GET /userinfo · Bearer</text>
    <path class="fg-edge fg-edge--accent" d="M284,240 H560 V152" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="420" y="233" text-anchor="middle">200 { claims }</text>
  </svg>
  <figcaption class="fig-note">The ID token is for the RP and stops there — it answers "who signed in". The access token is a credential the RP carries outward, to your API and to <code>/userinfo</code> alike; neither of those ever sees the ID token.</figcaption>
</figure>

## ID Token — "who logged in"

A signed JWT defined by **OIDC Core 1.0 §2**. The RP verifies its signature against the OP's JWKS (RFC 7517) and checks `iss`, `aud`, `exp`, and (if present) `nonce`. Standard claims:

| Claim | Meaning | Spec |
|---|---|---|
| `iss` | Issuer (the OP). Must match the RP's expectation. | OIDC Core §2 |
| `sub` | Subject identifier — opaque per-OP user ID. | OIDC Core §2 |
| `aud` | Audience — must contain the RP's `client_id`. | OIDC Core §2 |
| `azp` | Authorized party — the `client_id` requesting the token (when `aud` has multiple values). | OIDC Core §2 |
| `exp`, `iat` | Expiry / issued-at. | RFC 7519 |
| `nonce` | Echoes the `nonce` from the authorize request. Replay defence. | OIDC Core §3.1.2.1 |
| `auth_time` | When the user authenticated (vs. when the token was issued). | OIDC Core §2 |
| `acr` | Authentication Context Class Reference — assurance level the auth method provided. | OIDC Core §2 / RFC 9470 |
| `amr` | Authentication Methods References — `pwd`, `otp`, `mfa`, `hwk`, etc. | RFC 8176 |

::: details `acr` — what's that?
**`acr`** (Authentication Context Class Reference) is a single string that names *how strong* the login was. Your OP decides the vocabulary; common values are `urn:mace:incommon:iap:silver`, NIST SP 800-63 levels, or the FAPI-style `urn:openbanking:psd2:sca`. The RP requests a minimum with `acr_values=...` on `/auth`; if the user's session can't satisfy it, the OP either re-prompts (step-up, RFC 9470) or rejects the request. Don't confuse it with `amr` — `acr` is the *level*, `amr` is the *methods used to reach that level*.
:::

::: details `amr` — what's that?
**`amr`** (Authentication Methods References, RFC 8176) is a JSON array of short strings describing *which factors* the user actually presented this session: `pwd` for password, `otp` for one-time code, `mfa` when more than one factor was used, `hwk` for hardware key, `face` for facial recognition, and so on. RPs typically read it for audit and policy ("require `mfa` for the admin console") rather than for trust decisions — that's what `acr` is for.
:::

::: details `auth_time` — what's that?
**`auth_time`** is the Unix timestamp of when the user *authenticated to the OP*, which is **not** the same as `iat` (when *this* token was issued). A user who logged in an hour ago and just refreshed gets a fresh `iat` but the old `auth_time`. RPs use it to enforce a `max_age` policy ("force re-auth if it's been more than 30 minutes") and the OP enforces it server-side when the RP passes `max_age` on `/auth`.
:::

::: details `azp` — what's that?
**`azp`** (Authorized Party) is the `client_id` that *requested* the ID Token. It only matters when `aud` carries multiple values — in that case, `azp` disambiguates which of those audiences actually drove the authorize request. For the common single-RP case, `aud` is just `[client_id]` and `azp` is omitted. RPs should reject ID Tokens where `aud` has many entries and `azp` is missing or doesn't match their `client_id`.
:::

::: details JWKS — what's that?
**JWKS** (JSON Web Key Set, RFC 7517) is a JSON document the OP serves at `/jwks` (advertised via the discovery document). It lists the OP's **public** keys; RPs fetch it once, cache it, and use it to verify ID Token signatures offline. The OP rotates keys by adding the new key ahead of time and publishing it before signing with it, so RPs that re-fetch the JWKS find it.
:::

::: warning Don't put the ID Token on `Authorization: Bearer`
The ID Token's audience is the RP, not the RS. Sending it as a Bearer token to your API works *technically* (it's a JWT) but it's semantically wrong and exposes the RP's secret-equivalent claims (email, etc.) to every API the user touches. **Use the access token for APIs.**
:::

## Access token — "this client may call this API"

The Bearer token your resource server validates (RFC 6750). Two classical formats are described in the OAuth literature:

| Format | Validation | State on the OP |
|---|---|---|
| **Opaque** | RS calls `/introspect` (RFC 7662) every request. | OP keeps a row keyed on the token. |
| **JWT (RFC 9068)** | RS validates signature + `aud` + `exp` locally. | Verification is self-contained; the OP may keep grant tombstones or JTI rows for OP-served revocation. |

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

The library defaults to JWT (RFC 9068) and offers opaque as opt-in. Both shapes are **revocable on the OP**. The two axes that matter are: **(1) does the RS consult the OP per request?** and **(2) how far does the logout cascade reach?**

| | **Default — JWT (RFC 9068)** | **Opt-in — Opaque** |
|---|---|---|
| Wire format | base64url JWT (`header.payload.signature`) | random bearer string |
| RS validation | offline against the JWKS | calls `/introspect` per request |
| OP-side state on issuance | no row under the default grant-tombstone strategy; optional JTI shadow row when selected | hashed row in `store.OpaqueAccessTokenStore` |
| Revocation reach | OP-served boundaries (`/userinfo`, `/introspect`) | every RS request |
| Audit trail of issuance | none by default; opt in via `RevocationStrategyJTIRegistry` for one shadow row per issuance | one row per issuance, automatically |
| Configured via | (default) | `op.WithAccessTokenFormat(...)` or `op.WithAccessTokenFormatPerAudience(...)` (RFC 8707) |

::: warning Cascade scope depends on the format
`/userinfo`, `/introspect`, `/revoke`, `/end_session`, and the code-replay cascade all use OP-side revocation state. A revoked or logout-cascaded token is rejected at `/userinfo` with `WWW-Authenticate: Bearer error="invalid_token"` even when its JWT signature still verifies — **but only when the request reaches the OP**. An RS that validates a JWT offline against the JWKS does not see the cascade until it receives equivalent denylist state or the token expires. Opaque format closes that gap because every RS validation reaches `/introspect`.
:::

### Introspection is for confidential callers

`/introspect` authenticates the caller before it examines a token. Public clients and clients registered with token-endpoint authentication method `none` receive `401` with `invalid_client`; they cannot use introspection. A confidential caller can introspect its own access or refresh tokens. Cross-client access is inactive by default and becomes active only when the caller is listed in the matching protected resource's `IntrospectionClients` and the access token's `aud` names that resource. This delegation never applies to refresh tokens.

An active opaque access-token introspection response includes `iss` alongside the usual `active`, `client_id`, `token_type`, `exp`, `iat`, `sub`, `aud`, and `scope` fields when those values exist. Resource servers should validate `iss` and `aud` as part of their local policy.

::: details `jti`? `gid`? Tombstones?
Each access token JWT includes a `jti` (RFC 7519 §4.1.7, unique per-token) and a `gid` private claim (the OP-side GrantID, omitempty, consumed by the OP only — RSes ignore it).

**Default — grant-tombstone strategy.** The OP keeps a small per-grant tombstone table; verification matches the JWT's `gid` against it. A single-AT `/revocation` writes one denylist row keyed on `jti`. Steady state is `O(revoked grants + revoked JTIs)`, not `O(issued)`.

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

Doing neither — pure offline JWT validation, no introspection, no audit subscription — means revocation propagates only at the next refresh-token rotation. That can be acceptable for low-risk APIs but it is a deliberate trade, not a default that the spec entitles you to.

## UserInfo — "give me fresh claims for this access token"

A simple `GET /userinfo` (OIDC Core §5.3) with the access token. Returns a JSON document of the user's claims, scoped to whatever the access token's scopes allow.

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
:::

## Configuration knobs

| Option | What it controls | Default |
|---|---|---|
| `op.WithAccessTokenTTL(d)` | Lifetime of access tokens. | 5 min |
| `op.WithRefreshTokenTTL(d)` | Lifetime of refresh tokens. | 30 days |
| `op.WithRefreshTokenOfflineTTL(d)` | Lifetime of `offline_access` refresh tokens. | inherits `WithRefreshTokenTTL` |
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
