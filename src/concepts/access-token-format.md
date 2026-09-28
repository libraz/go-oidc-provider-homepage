---
title: Access token format — JWT vs opaque
description: Choose JWT or opaque access tokens with their current revocation, introspection authorization, issuer, and resource-server trade-offs.
pageClass: pg-concepts-access-token-format
---

# Access token format — JWT vs opaque

`go-oidc-provider` issues **RFC 9068-shaped JWT access tokens by default**, with **opaque access tokens as an opt-in**. Token format determines **who validates the token** and **how revocation propagates**. Presentation depends on sender constraint: unbound and mTLS-bound tokens use `Authorization: Bearer`, while DPoP-bound tokens use `Authorization: DPoP` with a DPoP proof header.

The library signs JWT access tokens with ES256 only, while RFC 9068 §2.1 requires RS256 support; its verifier also accepts a missing `jti` even though §2.2 requires it. See the [RFC status matrix](/compliance/rfc-matrix) before claiming full RFC 9068 conformance.

This is a judgment the library cannot make for you — it is yours to make as the embedder. The right answer depends on where the resource server (RS) sits relative to the OP, what your immediate-revocation requirements look like, and how you want load distributed.

::: tip TL;DR
- **JWT (RFC 9068) is the default.** RS validates offline against the JWKS. The `/end_session` cascade reaches OP-served boundaries (`/userinfo`, `/introspect`) only — an RS doing offline JWT verification keeps honouring the token until its `exp`.
- **Opaque is opt-in** (`op.WithAccessTokenFormat`). Every RS request goes through `/introspect` so the cascade reaches every RS — at the price of putting the OP on the request hot path.
- **The deciding question:** does "logged out" have to mean the user can no longer call any RS for the token's lifetime, or is rejection at OP-served boundaries enough? User-side bandwidth vs OP capacity is a secondary axis. Mixed deployments are supported per RFC 8707 resource indicator (`op.WithAccessTokenFormatPerAudience`).
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — Bearer Token Usage
- [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — Token Revocation
- [RFC 7517](https://datatracker.ietf.org/doc/html/rfc7517) — JSON Web Key (JWK)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token (JWT)
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — Token Introspection
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
:::

## Two shapes for the same wire slot

For a given sender-constraint mode, either format uses the same authorization scheme: `Bearer` for unbound or mTLS-bound tokens, or `DPoP` plus a proof header for DPoP-bound tokens. The difference here is **how the RS validates the token**. The diagrams show an unbound Bearer example.

### JWT (RFC 9068) — the RS validates locally

<figure class="fig">
  <div class="fig-head">JWT — the resource server decides on its own</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-jwt-title" viewBox="0 30 960 140" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-jwt-title">With a JWT access token the resource server validates its signature, type, issuer, audience, lifetime, and required claims against cached OP keys, refreshing those keys when needed. A DPoP-bound token also requires proof verification. The OP is not on the routine request path.</title>
    <rect class="fg-box" x="36" y="54" width="190" height="68" rx="8"/>
    <text class="fg-t" x="56" y="84">RP</text>
    <text class="fg-xs" x="56" y="104">holds the access token</text>
    <path class="fg-edge" d="M230,96 H316" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="273" y="89" text-anchor="middle">Bearer &lt;JWT&gt;</text>
    <rect class="fg-box" x="320" y="48" width="320" height="98" rx="8"/>
    <text class="fg-t" x="340" y="80">RS</text>
    <text class="fg-xs" x="340" y="102">verifies JWT claims and binding proof</text>
    <text class="fg-xs" x="340" y="120">nothing to ask, nothing to wait for</text>
    <text class="fg-mxs fg-ok" x="340" y="138">0 network calls per request</text>
    <path class="fg-edge fg-edge--muted" d="M644,96 H730" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="687" y="89" text-anchor="middle">once</text>
    <rect class="fg-box fg-box--accent" x="734" y="54" width="190" height="68" rx="8"/>
    <text class="fg-m fg-accent" x="754" y="84">OP /jwks</text>
    <text class="fg-xs" x="754" y="104">fetched and cached by the RS</text>
  </svg>
  <figcaption class="fig-note">Fast, and offline — which is also the catch: nothing the OP does after issuance reaches this resource server until the token's own <code>exp</code> passes.</figcaption>
</figure>

The RS uses cached JWKS keys to verify the signature and allowed algorithm, then checks `typ=at+jwt`, the expected `iss` and `aud`, `exp` and `iat`, and required claims including `sub`, `client_id`, and `jti`. For a sender-constrained token it also checks `cnf` against the presented proof or client certificate. The OP is **not on the routine request path**. Refresh the JWKS cache when a new signing `kid` appears.

### Opaque — the RS asks the OP every time

<figure class="fig">
  <div class="fig-head">Opaque — the resource server asks, every time</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-opaque-title" viewBox="0 30 960 140" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-opaque-title">An opaque access token carries no readable content, so the resource server resolves it by calling the OP's introspection endpoint on every request and reading the answer back.</title>
    <rect class="fg-box" x="36" y="54" width="190" height="68" rx="8"/>
    <text class="fg-t" x="56" y="84">RP</text>
    <text class="fg-xs" x="56" y="104">holds the access token</text>
    <path class="fg-edge" d="M230,96 H316" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="273" y="89" text-anchor="middle">Bearer &lt;opaque&gt;</text>
    <rect class="fg-box" x="320" y="48" width="320" height="98" rx="8"/>
    <text class="fg-t" x="340" y="80">RS</text>
    <text class="fg-xs" x="340" y="102">the token says nothing on its own</text>
    <text class="fg-xs" x="340" y="120">it has to ask the OP what this is</text>
    <text class="fg-mxs fg-warn" x="340" y="138">1 network call per request</text>
    <path class="fg-edge" d="M644,80 H730" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="687" y="73" text-anchor="middle">every request</text>
    <path class="fg-edge fg-edge--accent" d="M730,120 H648" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="689" y="138" text-anchor="middle">answer</text>
    <rect class="fg-box fg-box--accent" x="734" y="54" width="190" height="68" rx="8"/>
    <text class="fg-m fg-accent" x="754" y="84">OP /introspect</text>
    <text class="fg-mxs" x="754" y="104">{ active, sub, scope, … }</text>
  </svg>
  <figcaption class="fig-note">A round trip on every call, in exchange for an answer that is true at the moment it is given. Revoke a token here and the very next request already knows.</figcaption>
</figure>

The opaque token is a 32-byte random identifier (base64url, 43 characters). It carries no claims. The RS resolves the token by calling the OP's `/introspect` endpoint (RFC 7662) on every request — or caches the result for a short, deliberate window. The OP is **on the request hot path**.

`/introspect` is a confidential-client endpoint. A public client or a client registered with token-endpoint authentication method `none` receives `401 invalid_client`, even when it presents a token. A confidential caller may introspect its own tokens. A resource server may inspect another client's access token only when its client ID appears in the protected resource's `IntrospectionClients` and the token's `aud` names that resource. The delegation is audience-scoped and never applies to refresh tokens.

When the opaque access token is active, the RFC 7662 response includes `iss` as well as the available `client_id`, `token_type`, `exp`, `iat`, `sub`, `aud`, and `scope` values. The issuer is present so an RS can apply the same issuer check after switching between JWT and opaque formats.

::: details `jti` — what is it?
`jti` is a standard JWT claim (RFC 7519 §4.1.7) — "JWT ID." A unique identifier per token, used to reference, revoke, or deduplicate that specific token. JWT access tokens carry a `jti`; the OP uses it as the key in the legacy JTI registry strategy and as the deduplication key in the deny-list table. Opaque tokens don't have a `jti` because the bearer string itself is already a unique identifier.
:::

::: details `gid` — what is it?
A library-private JWT claim that holds the **GrantID** — the OP-side identifier of the authorization grant the token was issued under. One grant typically maps to "this user logged into this client at this time, with this scope set." The OP needs `gid` to revoke *every* access token under a grant in one tombstone write, instead of chasing each `jti` individually. Resource servers MUST ignore the claim — it's an OP-internal concern.

- **When to care:** only if you're writing introspection-aware RS code or auditing the JWT bytes. Standard RFC 9068 verifiers won't see it.
- **Easy to confuse with:** `sid` (session ID, OIDC Core) — `sid` references the *user session*, `gid` references the *grant* (a session can issue multiple grants).
:::

::: tip The wire shape gives the RS no hint
Neither the `Bearer` nor the `DPoP` authorization scheme identifies JWT versus opaque format. The RS knows which format to expect from deployment policy, typically by audience. DPoP-bound tokens use `Authorization: DPoP` and a separate proof regardless of token format. The library's discovery document does **not** advertise the format.
:::

## The trade-off

| Axis | JWT (default) | Opaque |
|---|---|---|
| Validation location | RS, offline against JWKS | OP, via `/introspect` |
| OP load profile | Default strategy writes **zero rows** on issuance, one row per revoked grant; opt-in JTI registry writes one row per issuance. See [JWT revocation strategy](#jwt-access-token-revocation-strategy) below. | One row per issuance; one introspection round-trip per RS request |
| Header size | Larger — header / claims / signature | Small — 43 base64url characters |
| RS latency floor | Local crypto only | Adds an OP round-trip (or cache TTL) |
| Cache surface | RS caches JWKS (rarely refreshed) | RS caches introspection responses (per token) |
| Logged-out token reach | Cascade visible at OP-served boundaries only | Cascade visible at every RS request |
| Refresh rotation | Prior access token lives until `exp` | Prior access token revoked on rotation |
| Token-bytes leakage | Reveals `sub`, `scope`, `aud`, `cnf`, `acr`, `gid` | Reveals nothing |
| RS-side debugging | Decode the JWT and read claims directly | Must call `/introspect` |
| Sender constraint (DPoP / mTLS) | `cnf` claim in JWT | `cnf` rebuilt from the OP-side record |

The two columns are not "secure vs insecure" — both shapes are honest designs with different operational assumptions. The next two sections explain the load and revocation halves of the trade-off, since those are the ones most often underweighted at design time.

## Where the load lands

JWT distributes verification across resource servers. Each RS holds a JWKS cache (rotated on a calendar measured in days, not requests), validates signatures locally, and never blocks on the OP for routine calls. Adding a tenth RS is free for the OP.

Opaque concentrates verification on the OP. Every RS call ultimately becomes an `/introspect` call (modulo any RS-side cache the operator chose to allow). Adding a tenth RS multiplies introspection traffic. The OP becomes a single point of capacity for the data plane, not just the control plane.

The classical advice "JWT is stateless, opaque is stateful" describes the RS path only. With this library the OP keeps an issuance row for opaque tokens and may keep grant tombstones or JTI rows for JWTs; what differs is whether the **RS** also has to talk to the OP per request.

::: info User-side bandwidth and server-to-server RTT are separate axes
"OP load concentration vs RS distribution" is a different axis from **"bytes carried over the user's connection vs server-to-server RTT"**. Don't conflate them.

- **JWT path.** Every RP → RS request carries a JWT of a few hundred bytes to ~1 KB in the header. That cost lands on the **user's connection** — it adds up on mobile, metered, or satellite-linked IoT deployments. Server-to-server traffic is quiet: the RS does not call back to the OP.
- **Opaque path.** The bearer string on RP → RS is 43 base64url characters, **easy on the user's connection**. The cost moves to **server-to-server traffic** as each RS calls `/introspect` on the OP — usually inside the same trust zone, never paid by the user's link.

So "OP capacity planning" and "the user's perceived bytes-on-the-wire" are not the same problem. For an API with mobile-heavy clients, opaque can feel lighter to the user even though the OP needs to be sized larger; for a system where the OP is intentionally low-capacity but user connections are fat, JWT is the better fit. Evaluate the two axes independently.
:::

::: info Storage cost is **not** symmetric on the OP side
The default JWT strategy (grant tombstone) writes **zero rows on issuance** and one row per revoked grant — steady-state row count is `O(revoked grants)`. The opt-in JTI registry strategy keeps one row per issued JWT (the `jti`-keyed shadow row). Opaque format always keeps one row per issued token (hashed bearer ID). The "JWT and opaque both keep one row per token" framing was true under the legacy JTI registry default; the current default reduces JWT issuance to a pure compute path. See [JWT revocation strategy](#jwt-access-token-revocation-strategy) for the full breakdown. The RS-side difference (JWT stateless for the RS, opaque not) is unchanged.
:::

## Where revocation lands — and the `/end_session` gap

This is the half of the trade-off most often glossed over.

`/end_session` (and `/revoke`, and the code-replay cascade) flips the OP-side row to revoked for every access token tied to the subject's grants. Both formats register that flip; the question is **who notices**.

**JWT format:**

<figure class="fig">
  <div class="fig-head">JWT — where the revocation stops</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-revoke-jwt-title" viewBox="0 20 960 220" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-revoke-jwt-title">With JWT access tokens, ending a session writes a grant tombstone. The OP consults it at its userinfo and introspection endpoints, but a resource server doing offline JWT verification never sees it.</title>
    <rect class="fg-box fg-box--accent" x="36" y="90" width="180" height="60" rx="8"/>
    <text class="fg-m fg-accent" x="126" y="116" text-anchor="middle">/end_session</text>
    <text class="fg-xs" x="126" y="136" text-anchor="middle">RP-initiated logout</text>
    <path class="fg-edge fg-edge--accent" d="M220,120 H316" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="320" y="84" width="240" height="72" rx="8"/>
    <text class="fg-t2" x="340" y="110">grant tombstone</text>
    <text class="fg-xs" x="340" y="128">the default, or a registry's</text>
    <text class="fg-mxs" x="340" y="146">RevokeByGrant</text>
    <path class="fg-leader" d="M564,120 H620 M620,54 V193"/>
    <path class="fg-edge fg-edge--thin" d="M620,54 H696" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="658" y="47" text-anchor="middle">consulted</text>
    <path class="fg-edge fg-edge--thin" d="M620,120 H696" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="658" y="113" text-anchor="middle">consulted</text>
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M620,193 H696" marker-end="url(#fg-ad)"/>
    <text class="fg-xs fg-danger" x="658" y="186" text-anchor="middle">never reaches</text>
    <rect class="fg-box" x="700" y="34" width="224" height="40" rx="6"/>
    <text class="fg-m" x="718" y="59">OP /userinfo</text>
    <rect class="fg-box" x="700" y="100" width="224" height="40" rx="6"/>
    <text class="fg-m" x="718" y="125">OP /introspect</text>
    <rect class="fg-box fg-box--danger" x="700" y="166" width="224" height="54" rx="6"/>
    <text class="fg-t2" x="718" y="188">RS</text>
    <text class="fg-xs" x="718" y="208">offline JWT verification</text>
  </svg>
  <figcaption class="fig-note">This is the gap the page is about. It is bounded by the access-token TTL and nothing else — which is the argument for keeping that TTL short when the format is JWT.</figcaption>
</figure>

**Opaque format:**

<figure class="fig">
  <div class="fig-head">Opaque — the revocation reaches everywhere</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-revoke-opaque-title" viewBox="0 20 960 220" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-revoke-opaque-title">With opaque access tokens, ending a session flips the rows in the token store. The OP consults that store at its userinfo and introspection endpoints, and so does every resource server, because each one has to call introspection anyway.</title>
    <rect class="fg-box fg-box--accent" x="36" y="90" width="180" height="60" rx="8"/>
    <text class="fg-m fg-accent" x="126" y="116" text-anchor="middle">/end_session</text>
    <text class="fg-xs" x="126" y="136" text-anchor="middle">RP-initiated logout</text>
    <path class="fg-edge fg-edge--accent" d="M220,120 H316" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="320" y="84" width="240" height="72" rx="8"/>
    <text class="fg-t2" x="340" y="110">opaque token store</text>
    <text class="fg-xs" x="340" y="128">rows flipped to revoked by</text>
    <text class="fg-mxs" x="340" y="146">RevokeByGrant</text>
    <path class="fg-leader" d="M564,120 H620 M620,54 V193"/>
    <path class="fg-edge fg-edge--thin" d="M620,54 H696" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="658" y="47" text-anchor="middle">consulted</text>
    <path class="fg-edge fg-edge--thin" d="M620,120 H696" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="658" y="113" text-anchor="middle">consulted</text>
    <path class="fg-edge fg-edge--ok fg-edge--thin" d="M620,193 H696" marker-end="url(#fg-ao)"/>
    <text class="fg-xs fg-ok" x="658" y="186" text-anchor="middle">consulted</text>
    <rect class="fg-box" x="700" y="34" width="224" height="40" rx="6"/>
    <text class="fg-m" x="718" y="59">OP /userinfo</text>
    <rect class="fg-box" x="700" y="100" width="224" height="40" rx="6"/>
    <text class="fg-m" x="718" y="125">OP /introspect</text>
    <rect class="fg-box fg-box--ok" x="700" y="166" width="224" height="54" rx="6"/>
    <text class="fg-t2" x="718" y="188">RS</text>
    <text class="fg-xs" x="718" y="208">its own /introspect call</text>
  </svg>
  <figcaption class="fig-note">The reach is complete because there is no independent path: a resource server that cannot read the token has no way to accept it without asking, and asking is what closes the gap.</figcaption>
</figure>

- **JWT path.** The library consults the registry whenever the token reaches an OP-served boundary (`/userinfo`, `/introspect`, `/revoke`). A revoked JWT presented there is rejected immediately. **A resource server that validates the JWT offline against the JWKS does not consult the registry** — because that's the whole point of self-contained tokens. The revoked JWT remains usable at that RS until its `exp` claim elapses.
- **Opaque path.** Every use of the token has to round-trip through `/introspect`. The cascade reaches every RS by definition.

::: info Opaque introspection collapses to a uniform inactive shape
After confidential client authentication, every inactive path — an unauthorized client, no row, revoked, expired, DPoP/mTLS proof mismatch, or an audience that does not authorize delegation — collapses to the same `{"active": false}` response (RFC 7662 §2.2). Before successful client authentication, the endpoint returns the protocol error instead. Introspection-based enumeration and state probing are structurally closed.
:::

::: danger Pick the form that matches your "what does logged out mean" requirement
- "Logged out means the user can no longer call any RS for the access token's lifetime, even RSes outside the OP's control" → opaque, **or** JWT with introspection mandated for all RSes.
- "Logged out means the OP-served boundaries (`/userinfo`, `/introspect`) reject the token, and the RS will pick up the change on the next refresh-token rotation" → JWT is fine.

There is no third option that gives you "stateless RS-side validation" **and** "instant logout cascade through the RS". You have to pick.
:::

Refresh-token rotation is the related adjustment point. Every rotation issues a new access token whichever format is in play; the two formats differ in what happens to the old one. The JWT form **leaves the prior access token alive until its own `exp`**, so the cascade gap closes within the access-token TTL. The opaque form calls `RevokeByGrant` against the opaque substore on every rotation and retires the prior access token too — **the window in which a leaked refresh token lets an attacker replay the prior access token shrinks to roughly clock skew**.

The other cascade source is **authorization-code re-use detection (RFC 6749 §4.1.2)**. The moment a stolen code is presented twice, every access token under its grant is retired — JWT format writes a grant tombstone (or flips registry rows under the opt-in JTI strategy); opaque format flips opaque-store rows. Both propagate with the same visibility shown in the diagrams above. `/end_session` is not the only trigger.

::: details Cascade revocation — what is it?
"Cascade" here means: one revocation event reaches every artefact that descends from the same grant. If `/end_session` fires once, the OP marks the grant revoked, and from that moment every access token, every refresh token, and every shadow row under that grant is treated as invalid wherever the OP is consulted. The opposite would be "leaf revocation" — revoke this one specific token, leave its siblings alive — which is what RFC 7009 `/revocation` does for a single `jti`.
:::

## JWT access-token revocation strategy

The JWT path has its own knob — **how the OP persists revocation state**. Opaque tokens are intrinsically per-token in storage (the verifier needs the row), so the strategy applies to JWT only.

::: details Tombstone, shadow row, JTI registry — what are these?
Storage-layer vocabulary that shows up when discussing revocation strategies.

- **Tombstone** — a single row that records "the thing identified by this key is dead." The token itself isn't stored; only its grant ID and the fact that it's revoked. Verification reads the tombstone table by key.
- **Shadow row** — a row that "shadows" each issued token: one row per `jti` that carries `revoked_at`, audit fields, and so on. Heavier than a tombstone (one write per issuance, not per revocation), but it gives you a full audit log of every token that ever existed.
- **JTI registry** — the table that holds those shadow rows, keyed by `jti`. The default strategy *doesn't* use it; the opt-in `RevocationStrategyJTIRegistry` does.
- **When to care:** when sizing the database. Tombstones grow `O(revoked grants)`, shadow rows grow `O(issuance_rate × TTL)`. For a high-traffic OP that is the difference between thousands and millions of rows.
:::

`go-oidc-provider` ships three strategies, selected via `op.WithAccessTokenRevocationStrategy`. The default (`RevocationStrategyGrantTombstone`) has been the baseline since the strategy abstraction landed; the legacy per-`jti` model is preserved behind `RevocationStrategyJTIRegistry` for embedders that need it.

| Strategy | Writes per AT issuance | Writes per grant revoke | Steady-state row count | Notes |
|---|---|---|---|---|
| **`RevocationStrategyGrantTombstone`** (default) | **0** | 1 (tombstone row) | `O(revoked grants + revoked JTIs)` | The OP embeds a `gid` private claim (the GrantID) in JWTs with grant lineage and consults a per-grant tombstone table at its verification endpoints. |
| `RevocationStrategyJTIRegistry` | 1 (shadow row) | N (one UPDATE per AT under the grant) | `O(issuance_rate × AT_TTL)` | Every issued AT is shadowed by a row in `store.AccessTokenRegistry`. Pin this when per-AT audit trails are a regulatory requirement. |
| `RevocationStrategyNone` | 0 | 0 | 0 | `/revocation` returns 200 idempotently (RFC 7009 §2.2) but is a no-op. JWT ATs live until `exp`. **Rejected at `op.New` under this library's FAPI profiles** as a library policy. |

::: tip The default writes nothing on issuance
The hot path of `/token` does not touch the database under the default strategy. Instead, when a grant is revoked (logout, code-replay cascade, refresh chain compromise), the OP writes one tombstone row keyed on the grant ID. Verification at `/userinfo` and `/introspect` checks the gid against the tombstone table, so a revoked grant's JWTs are rejected immediately at OP-served boundaries.

A single-AT `/revocation` (RFC 7009) by `jti` writes one denylist row under the same substore. It does **not** coalesce into a grant tombstone — other ATs under the grant stay alive.
:::

::: info The `gid` claim is private
JWT access tokens with grant lineage carry a `gid` private claim (RFC 7519 §4.3, omitempty) that holds the OP-side GrantID. It is consumed by the OP only; resource servers can ignore it. Existing RFC 9068 verifiers keep working unchanged when they ignore this private claim.
:::

::: details Selecting a strategy
These are option diffs to the complete browser-provider configuration in “Configuration” below; they intentionally omit the shared issuer, store, keyset, cookie-key, and login-flow wiring.

```go
// Default — RevocationStrategyGrantTombstone, so no extra option is needed.

// Add this option to the complete configuration to pin the legacy per-jti
// registry model.
op.WithAccessTokenRevocationStrategy(op.RevocationStrategyJTIRegistry)

// Add this option only for non-FAPI deployments that intentionally disable
// server-side JWT revocation.
op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)
```
:::

::: warning FAPI rejects `RevocationStrategyNone` at construction time
Selecting `RevocationStrategyNone` together with any library FAPI profile fails at `op.New`. This is a library safeguard. The final FAPI 2.0 Security Profile §5.3.4(3) requires resource servers to verify access-token revocation status; the OP's local revocation strategy alone cannot establish a resource server's compliance.
:::

::: warning Substore presence is enforced at `op.New` (BREAKING)
The default `RevocationStrategyGrantTombstone` requires `Store.GrantRevocations()` to return a non-nil substore; `RevocationStrategyJTIRegistry` requires `Store.AccessTokens()`. Both gates run at construction time, so a missing substore now surfaces as a configuration error from `op.New` instead of a silent half-wired cascade at the first `/revoke` / refresh-replay event. The bundled `inmem`, `sql`, and composite adapters all return both substores; embedders shipping a custom `Store` aggregator MUST implement them (or pin `RevocationStrategyNone` outside FAPI when no revocation is needed).
:::

## Choosing a format

The decision is mostly about who you trust, what you can ask of the RS, and how short the access-token TTL is.

<figure class="fig">
  <div class="fig-head">Choosing a format</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-choice-title" viewBox="0 0 960 374" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-choice-title">Three questions decide the access-token format: whether every resource server can be made to call introspection, whether a gap bounded by the token's expiry is acceptable, and whether internal and external resource servers coexist.</title>
    <!-- 1 -->
    <rect class="fg-box" x="36" y="24" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="52">Can every RS be required to call /introspect</text>
    <text class="fg-xs" x="56" y="74">on every request, including the ones you do not own</text>
    <path class="fg-edge" d="M434,57 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="50" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="530" y="28" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="52">Opaque</text>
    <text class="fg-xs" x="550" y="72">revocation reaches everywhere, at one round trip each</text>
    <path class="fg-edge" d="M233,94 V116" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="110">no</text>
    <!-- 2 -->
    <rect class="fg-box" x="36" y="120" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="148">Is the access-token TTL short enough</text>
    <text class="fg-xs" x="56" y="170">that a gap bounded by exp is acceptable</text>
    <path class="fg-edge" d="M434,153 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="146" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="530" y="124" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="148">JWT — the default</text>
    <text class="fg-xs" x="550" y="168">no call on the request path; the gap closes at exp</text>
    <path class="fg-edge" d="M233,190 V212" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="206">no</text>
    <!-- 3 -->
    <rect class="fg-box" x="36" y="216" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="244">Do internal and external resource servers coexist</text>
    <text class="fg-xs" x="56" y="266">different audiences, different things you can demand of them</text>
    <path class="fg-edge" d="M434,249 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="242" text-anchor="middle">yes</text>
    <rect class="fg-box" x="530" y="220" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="244">A per-audience mix</text>
    <text class="fg-xs" x="550" y="264">JWT inward, opaque outward — the format is per audience</text>
    <path class="fg-edge" d="M233,286 V308" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="302">no</text>
    <!-- default -->
    <rect class="fg-box" x="36" y="312" width="888" height="54" rx="8"/>
    <text class="fg-t2" x="56" y="334">Opaque</text>
    <text class="fg-xs" x="56" y="354">when the gap is unacceptable and you cannot shorten the TTL, the round trip is what you are left with</text>
  </svg>
  <figcaption class="fig-note">The format is a property of the audience, not of the deployment. Nothing stops you issuing a JWT for a service you operate and an opaque token for one you do not, from the same OP.</figcaption>
</figure>

Per-audience selection is the realistic answer for many production shapes: an internal RS that already has cheap network access to the OP runs opaque (so logout reaches it immediately), while a public-facing RS that the OP shouldn't gate runs JWT (so the OP never becomes a hot dependency).

## Configuration

Default — JWT for every audience:

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(browserFlow),
    // No format option — defaults to AccessTokenFormatJWT.
)
```

`browserFlow` is a `LoginFlow` whose primary step binds the user; `cookieKey` is a 32-byte AES-256-GCM key. The default grant set is `authorization_code` + `refresh_token`, so a browser provider needs cookie keys and a login flow (or the legacy authenticator wiring).

For a machine-to-machine provider, select only the client-credentials grant. It has no browser authorization step, login flow, or cookie-key requirement:

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithGrants(grant.ClientCredentials),
)
```

Switch every issued access token to opaque:

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(browserFlow),
    op.WithAccessTokenFormat(op.AccessTokenFormatOpaque),
)
```

::: details Mix formats per RFC 8707 resource indicator
The map key is a resource URI; the empty key is reserved — use `WithAccessTokenFormat` for the default audience.

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(browserFlow),
    op.WithAccessTokenFormatPerAudience(map[string]op.AccessTokenFormat{
        "https://api.internal.example.com": op.AccessTokenFormatOpaque,
        "https://reports.example.com":      op.AccessTokenFormatJWT,
    }),
)
```

Each key is canonicalised at construction time (scheme and host lowercased, default port stripped, trailing slash normalised) and stored in canonical form. The token endpoint canonicalises every wire-form `resource=` value through the same helper before the map lookup, so a request that differs from the registered key only by case or trailing slash still selects the correct format. Two keys that canonicalise to the same value are rejected as a configuration error. Fragments and `userinfo` segments are forbidden in any key — RFC 8707 §2 prohibits them in resource indicators.
:::

::: tip Construction-time guard
If any selected format is opaque but the configured `Store` returns `nil` from `OpaqueAccessTokens()`, `op.New` rejects the configuration at construction time. A misconfiguration surfaces at startup, not on the first `/token` request.
:::

::: details How the OP stores opaque tokens (implementation detail)
The opaque substore follows the same hash-on-store posture the refresh-token store uses:

- The OP mints 32 random bytes from `crypto/rand`, base64url-encodes them (no padding, 43 characters), and hands the raw value to the client.
- The substore persists a SHA-256 digest of the raw value, never the raw bytes. The reference in-memory adapter uses an unkeyed digest for transparency in tests; the SQL adapter accepts an HMAC pepper for the digest so a database dump alone is not equivalent to the bearer credential.
- Lookups (`Find`, `RevokeByID`) hash the presented token and compare by digest in constant time.
- Expired rows are dropped by the periodic `GC` sweeper that already cleans codes, refresh tokens, and PAR records.

The wire bytes carry no prefix and no checksum — leaking a brand prefix would help a passive observer fingerprint deployments without helping the introspection-side dispatch.
:::

## What this means for resource-server code

- **JWT format.** Cache and refresh the JWKS; verify the signature and allowed algorithm, `typ=at+jwt`, expected `iss` and `aud`, `exp` and `iat`, and required claims (`sub`, `client_id`, `jti`). For DPoP or mTLS, verify `cnf` against the proof or certificate. Routine validation needs no call back to the OP. Use `/introspect` where you cannot tolerate a revocation gap.
- **Opaque format.** RS code calls `POST /introspect` for every token presentation (or every "cache miss" if the operator allows short-lived caching). The introspection response carries the same `sub` / `scope` / `aud` / `cnf` an RFC 9068 JWT would, so the rest of the RS pipeline does not need to change shape — only the validation step does.

Both shapes propagate sender constraints (DPoP RFC 9449, mTLS RFC 8705): the JWT path embeds `cnf` directly, the opaque path re-emits `cnf` from the OP-side record so the RS sees the same proof requirement.

## Read next

- [ID Token, access token, userinfo](/concepts/tokens) — what each artefact is for, why they're not interchangeable.
- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — how `cnf` survives the JWT-vs-opaque choice.
- [Back-channel logout](/use-cases/back-channel-logout) — how the OP fans logout out to other RPs and cascades shadow-row revocation.
