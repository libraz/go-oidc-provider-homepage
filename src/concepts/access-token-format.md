---
title: Access token format — JWT vs opaque
description: A design-judgment page. JWT is the default; opaque is an opt-in. The two formats put the verification load in different places — pick the one that matches your trust boundary and operational shape.
---

# Access token format — JWT vs opaque

`go-oidc-provider` issues **JWT (RFC 9068) access tokens by default**, with **opaque access tokens as an opt-in**. Both shapes pass through the same `Authorization: Bearer …` header on the wire; the difference is **who validates the token** and **how revocation propagates**.

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

The on-the-wire surface is identical. The RS reads `Authorization: Bearer <token>` and decides whether to honour the call. What changes is **how the RS reaches that decision**.

### JWT (RFC 9068) — the RS validates locally

<style scoped>
.atf-t1{fill:var(--vp-c-text-1)}.atf-t2{fill:var(--vp-c-text-2)}.atf-op{fill:var(--vp-c-brand-2)}.atf-rs{fill:var(--vp-c-text-3)}.atf-b{font-family:var(--vp-font-family-base);font-size:13px}.atf-c{font-family:var(--vp-font-family-base);font-size:12px}.atf-s{font-family:var(--vp-font-family-base);font-size:11px}.atf-m{font-family:var(--vp-font-family-mono);font-size:12px}.atf-sop{stroke:var(--vp-c-brand-2)}.atf-srs{stroke:var(--vp-c-text-3)}
</style>

<svg class="atf" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="atf-jwt-local-title" viewBox="0 0 684 188" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="atf-jwt-local-title">JWT access tokens: the RP presents a Bearer JWT that the RS verifies locally against a cached OP JWKS, keeping the OP off the request hot path.</title>
  <rect x="28" y="38" width="118" height="56" rx="6"/>
  <text class="atf-b atf-t1" x="87" y="70" text-anchor="middle">RP</text>
  <rect x="420" y="24" width="236" height="84" rx="6"/>
  <text class="atf-b atf-t1" x="538" y="56" text-anchor="middle">RS</text>
  <text class="atf-c atf-t1" x="538" y="78" text-anchor="middle">verifies sig + <tspan class="atf-m">aud</tspan> + <tspan class="atf-m">exp</tspan> locally</text>
  <line x1="146" y1="66" x2="416" y2="66"/>
  <path d="M409 62 L416 66 L409 70"/>
  <text class="atf-m atf-t2" x="282" y="54" text-anchor="middle">Bearer JWT</text>
  <rect class="atf-sop" x="28" y="118" width="176" height="52" rx="6"/>
  <text class="atf-b atf-op" x="116" y="149" text-anchor="middle">OP <tspan class="atf-m">/jwks</tspan></text>
  <line x1="204" y1="144" x2="414" y2="98" stroke-dasharray="5 4"/>
  <path d="M407 94 L414 98 L407 102"/>
  <text class="atf-s atf-t2" x="312" y="114" text-anchor="middle">fetched &amp; cached (once)</text>
</svg>

The RS holds a cached JWKS, validates the JWT signature offline, checks `aud` and `exp`, and serves the request. The OP is **not on the request hot path**. The JWT itself carries the claims (`sub`, `scope`, `aud`, `auth_time`, `acr`, `cnf`, …) so the RS has everything it needs.

### Opaque — the RS asks the OP every time

<style scoped>
.atf-t1{fill:var(--vp-c-text-1)}.atf-t2{fill:var(--vp-c-text-2)}.atf-op{fill:var(--vp-c-brand-2)}.atf-rs{fill:var(--vp-c-text-3)}.atf-b{font-family:var(--vp-font-family-base);font-size:13px}.atf-c{font-family:var(--vp-font-family-base);font-size:12px}.atf-s{font-family:var(--vp-font-family-base);font-size:11px}.atf-m{font-family:var(--vp-font-family-mono);font-size:12px}.atf-sop{stroke:var(--vp-c-brand-2)}.atf-srs{stroke:var(--vp-c-text-3)}
</style>

<svg class="atf" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="atf-opaque-introspect-title" viewBox="0 0 720 112" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="atf-opaque-introspect-title">Opaque access tokens: the RP presents a Bearer opaque token and the RS resolves it by calling the OP introspection endpoint on every request.</title>
  <rect x="28" y="38" width="112" height="52" rx="6"/>
  <text class="atf-b atf-t1" x="84" y="68" text-anchor="middle">RP</text>
  <rect class="atf-srs" x="248" y="38" width="112" height="52" rx="6"/>
  <text class="atf-b atf-rs" x="304" y="68" text-anchor="middle">RS</text>
  <rect class="atf-sop" x="576" y="38" width="116" height="52" rx="6"/>
  <text class="atf-b atf-op" x="634" y="68" text-anchor="middle">OP</text>
  <line x1="140" y1="64" x2="246" y2="64"/>
  <path d="M239 60 L246 64 L239 68"/>
  <text class="atf-m atf-t2" x="194" y="54" text-anchor="middle">Bearer opaque</text>
  <line x1="360" y1="52" x2="574" y2="52"/>
  <path d="M567 48 L574 52 L567 56"/>
  <text class="atf-m atf-t2" x="468" y="42" text-anchor="middle">POST /introspect</text>
  <line x1="576" y1="76" x2="362" y2="76"/>
  <path d="M369 72 L362 76 L369 80"/>
  <text class="atf-m atf-t2" x="468" y="94" text-anchor="middle">{active, sub, scope, …}</text>
</svg>

The opaque token is a 32-byte random identifier (base64url, 43 characters). It carries no claims. The RS resolves the token by calling the OP's `/introspect` endpoint (RFC 7662) on every request — or caches the result for a short, deliberate window. The OP is **on the request hot path**.

::: details `jti` — what is it?
`jti` is a standard JWT claim (RFC 7519 §4.1.7) — "JWT ID." A unique identifier per token, used to reference, revoke, or deduplicate that specific token. JWT access tokens carry a `jti`; the OP uses it as the key in the legacy JTI registry strategy and as the deduplication key in the deny-list table. Opaque tokens don't have a `jti` because the bearer string itself is already a unique identifier.
:::

::: details `gid` — what is it?
A library-private JWT claim that holds the **GrantID** — the OP-side identifier of the authorization grant the token was issued under. One grant typically maps to "this user logged into this client at this time, with this scope set." The OP needs `gid` to revoke *every* access token under a grant in one tombstone write, instead of chasing each `jti` individually. Resource servers MUST ignore the claim — it's an OP-internal concern.

- **When to care:** only if you're writing introspection-aware RS code or auditing the JWT bytes. Standard RFC 9068 verifiers won't see it.
- **Easy to confuse with:** `sid` (session ID, OIDC Core) — `sid` references the *user session*, `gid` references the *grant* (a session can issue multiple grants).
:::

::: tip The wire shape gives the RS no hint
Both formats arrive as `Authorization: Bearer <opaque-string>`. RFC 6750 makes no distinction. The RS knows which format to expect because the deployment told it — typically by audience, the same way the RS already knows which JWKS to trust. The library's discovery document does **not** advertise the format.
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

The classical advice "JWT is stateless, opaque is stateful" is half true. With this library the OP keeps an OP-side row for **both** shapes (see the "Storage cost is the same" note below) — what differs is whether the **RS** also has to talk to the OP per request.

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

<style scoped>
.atf-t1{fill:var(--vp-c-text-1)}.atf-t2{fill:var(--vp-c-text-2)}.atf-op{fill:var(--vp-c-brand-2)}.atf-rs{fill:var(--vp-c-text-3)}.atf-b{font-family:var(--vp-font-family-base);font-size:13px}.atf-c{font-family:var(--vp-font-family-base);font-size:12px}.atf-s{font-family:var(--vp-font-family-base);font-size:11px}.atf-m{font-family:var(--vp-font-family-mono);font-size:12px}.atf-sop{stroke:var(--vp-c-brand-2)}.atf-srs{stroke:var(--vp-c-text-3)}
</style>

<svg class="atf" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="atf-jwt-revocation-title" viewBox="0 0 720 252" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="atf-jwt-revocation-title">JWT revocation reach: an end_session flip in the grant-tombstone store is consulted at the OP userinfo and introspect endpoints but not by a resource server doing offline JWT verification.</title>
  <rect x="24" y="98" width="150" height="52" rx="6"/>
  <text class="atf-m atf-t1" x="99" y="129" text-anchor="middle">/end_session</text>
  <rect x="214" y="84" width="190" height="80" rx="6" stroke-dasharray="5 4"/>
  <text class="atf-c atf-t1" x="309" y="116" text-anchor="middle">grant tombstone (default)</text>
  <text class="atf-c atf-t1" x="309" y="136" text-anchor="middle">or registry <tspan class="atf-m">RevokeByGrant</tspan></text>
  <line x1="174" y1="124" x2="212" y2="124"/>
  <path d="M205 120 L212 124 L205 128"/>
  <rect class="atf-sop" x="540" y="20" width="170" height="48" rx="6"/>
  <text class="atf-b atf-op" x="625" y="49" text-anchor="middle">OP <tspan class="atf-m">/userinfo</tspan></text>
  <rect class="atf-sop" x="540" y="100" width="170" height="48" rx="6"/>
  <text class="atf-b atf-op" x="625" y="129" text-anchor="middle">OP <tspan class="atf-m">/introspect</tspan></text>
  <rect class="atf-srs" x="540" y="180" width="170" height="52" rx="6"/>
  <text class="atf-b atf-rs" x="625" y="200" text-anchor="middle">RS</text>
  <text class="atf-c atf-rs" x="625" y="218" text-anchor="middle">offline JWT verify</text>
  <line x1="404" y1="112" x2="537" y2="47" stroke-dasharray="5 4"/>
  <path d="M530 43 L537 47 L530 51"/>
  <text class="atf-s atf-t2" x="470" y="72" text-anchor="middle">consulted by</text>
  <line x1="404" y1="124" x2="537" y2="124" stroke-dasharray="5 4"/>
  <path d="M530 120 L537 124 L530 128"/>
  <text class="atf-s atf-t2" x="468" y="116" text-anchor="middle">consulted by</text>
  <line x1="404" y1="136" x2="532" y2="197" stroke-dasharray="5 4"/>
  <path d="M534 193 L546 205 M546 193 L534 205"/>
  <text class="atf-s atf-t2" x="458" y="160" text-anchor="middle">not consulted by</text>
</svg>

**Opaque format:**

<style scoped>
.atf-t1{fill:var(--vp-c-text-1)}.atf-t2{fill:var(--vp-c-text-2)}.atf-op{fill:var(--vp-c-brand-2)}.atf-rs{fill:var(--vp-c-text-3)}.atf-b{font-family:var(--vp-font-family-base);font-size:13px}.atf-c{font-family:var(--vp-font-family-base);font-size:12px}.atf-s{font-family:var(--vp-font-family-base);font-size:11px}.atf-m{font-family:var(--vp-font-family-mono);font-size:12px}.atf-sop{stroke:var(--vp-c-brand-2)}.atf-srs{stroke:var(--vp-c-text-3)}
</style>

<svg class="atf" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="atf-opaque-revocation-title" viewBox="0 0 720 252" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="atf-opaque-revocation-title">Opaque revocation reach: an end_session flip in the opaque store is consulted at the OP userinfo and introspect endpoints and by every resource-server introspect call.</title>
  <rect x="24" y="98" width="150" height="52" rx="6"/>
  <text class="atf-m atf-t1" x="99" y="129" text-anchor="middle">/end_session</text>
  <rect x="214" y="84" width="190" height="80" rx="6" stroke-dasharray="5 4"/>
  <text class="atf-c atf-t1" x="309" y="116" text-anchor="middle">opaque store</text>
  <text class="atf-m atf-t1" x="309" y="136" text-anchor="middle">RevokeByGrant</text>
  <line x1="174" y1="124" x2="212" y2="124"/>
  <path d="M205 120 L212 124 L205 128"/>
  <rect class="atf-sop" x="540" y="20" width="170" height="48" rx="6"/>
  <text class="atf-b atf-op" x="625" y="49" text-anchor="middle">OP <tspan class="atf-m">/userinfo</tspan></text>
  <rect class="atf-sop" x="540" y="100" width="170" height="48" rx="6"/>
  <text class="atf-b atf-op" x="625" y="129" text-anchor="middle">OP <tspan class="atf-m">/introspect</tspan></text>
  <rect class="atf-srs" x="540" y="180" width="170" height="52" rx="6"/>
  <text class="atf-b atf-rs" x="625" y="200" text-anchor="middle">RS</text>
  <text class="atf-c atf-rs" x="625" y="218" text-anchor="middle"><tspan class="atf-m">/introspect</tspan> call</text>
  <line x1="404" y1="112" x2="537" y2="47" stroke-dasharray="5 4"/>
  <path d="M530 43 L537 47 L530 51"/>
  <text class="atf-s atf-t2" x="470" y="72" text-anchor="middle">consulted by</text>
  <line x1="404" y1="124" x2="537" y2="124" stroke-dasharray="5 4"/>
  <path d="M530 120 L537 124 L530 128"/>
  <text class="atf-s atf-t2" x="468" y="116" text-anchor="middle">consulted by</text>
  <line x1="404" y1="136" x2="537" y2="199" stroke-dasharray="5 4"/>
  <path d="M530 195 L537 199 L530 203"/>
  <text class="atf-s atf-t2" x="460" y="160" text-anchor="middle">consulted by</text>
</svg>

- **JWT path.** The library consults the registry whenever the token reaches an OP-served boundary (`/userinfo`, `/introspect`, `/revoke`). A revoked JWT presented there is rejected immediately. **A resource server that validates the JWT offline against the JWKS does not consult the registry** — because that's the whole point of self-contained tokens. The revoked JWT remains usable at that RS until its `exp` claim elapses.
- **Opaque path.** Every use of the token has to round-trip through `/introspect`. The cascade reaches every RS by definition.

::: info Opaque introspection collapses to a uniform inactive shape + same-client gate
For an opaque token presented to `/introspect`, every miss path — different client, no row, revoked, expired, DPoP/mTLS proof mismatch — collapses to the same `{"active": false}` response (RFC 7662 §2.2). Introspection-based enumeration and state probing are structurally closed. Matching the same property under JWT requires additional RS-side implementation.
:::

::: danger Pick the form that matches your "what does logged out mean" requirement
- "Logged out means the user can no longer call any RS for the access token's lifetime, even RSes outside the OP's control" → opaque, **or** JWT with introspection mandated for all RSes.
- "Logged out means the OP-served boundaries (`/userinfo`, `/introspect`) reject the token, and the RS will pick up the change on the next refresh-token rotation" → JWT is fine.

There is no third option that gives you "stateless RS-side validation" **and** "instant logout cascade through the RS". You have to pick.
:::

Refresh-token rotation is the related soft handle. The library always issues a new access token on every refresh-token rotation; the JWT form **leaves the prior access token alive until its own `exp`** (so the cascade gap closes within the access-token TTL), while the opaque form calls `RevokeByGrant` against the opaque substore on every rotation, retiring the prior access token as well — **the window in which a leaked refresh token could let an attacker replay the prior access token shrinks to roughly clock skew**.

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
| **`RevocationStrategyGrantTombstone`** (default) | **0** | 1 (tombstone row) | `O(revoked grants + revoked JTIs)` | The OP embeds a `gid` private claim (the GrantID) in every JWT and consults a per-grant tombstone table at verification. FAPI 2.0 SP §5.3.2.2 conformant. |
| `RevocationStrategyJTIRegistry` | 1 (shadow row) | N (one UPDATE per AT under the grant) | `O(issuance_rate × AT_TTL)` | Every issued AT is shadowed by a row in `store.AccessTokenRegistry`. Pin this when per-AT audit trails are a regulatory requirement. FAPI 2.0 SP §5.3.2.2 conformant. |
| `RevocationStrategyNone` | 0 | 0 | 0 | `/revocation` returns 200 idempotently (RFC 7009 §2.2) but is a no-op. JWT ATs live until `exp`. **Rejected at `op.New` under any FAPI profile** (FAPI 2.0 SP §5.3.2.2 mandates server-side revocation). |

::: tip The default writes nothing on issuance
The hot path of `/token` does not touch the database under the default strategy. Instead, when a grant is revoked (logout, code-replay cascade, refresh chain compromise), the OP writes one tombstone row keyed on the grant ID. Verification at `/userinfo` and `/introspect` checks the gid against the tombstone table, so a revoked grant's JWTs are rejected immediately at OP-served boundaries.

A single-AT `/revocation` (RFC 7009) by `jti` writes one denylist row under the same substore. It does **not** coalesce into a grant tombstone — other ATs under the grant stay alive.
:::

::: info The `gid` claim is private
JWT access tokens carry a `gid` private claim (RFC 7519 §4.3, omitempty) that holds the OP-side GrantID. It is consumed by the OP only — resource servers MUST ignore it. Existing RFC 9068 verifiers keep working unchanged; the claim is invisible to anything that doesn't look for it.
:::

::: details Selecting a strategy
```go
// Default — RevocationStrategyGrantTombstone, no extra option needed.
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
)

// Pin the legacy per-jti registry model.
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithAccessTokenRevocationStrategy(op.RevocationStrategyJTIRegistry),
)

// Disable server-side JWT revocation (non-FAPI deployments only).
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone),
)
```
:::

::: warning FAPI rejects `RevocationStrategyNone` at construction time
Selecting `RevocationStrategyNone` together with any FAPI profile fails at `op.New`. FAPI 2.0 Security Profile §5.3.2.2 mandates server-side revocation; the library refuses to boot a configuration that disables it.
:::

::: warning Substore presence is enforced at `op.New` (BREAKING)
The default `RevocationStrategyGrantTombstone` requires `Store.GrantRevocations()` to return a non-nil substore; `RevocationStrategyJTIRegistry` requires `Store.AccessTokens()`. Both gates run at construction time, so a missing substore now surfaces as a configuration error from `op.New` instead of a silent half-wired cascade at the first `/revoke` / refresh-replay event. The bundled `inmem`, `sql`, and composite adapters all return both substores; embedders shipping a custom `Store` aggregator MUST implement them (or pin `RevocationStrategyNone` outside FAPI when no revocation is needed).
:::

## Choosing a format

The decision is mostly about who you trust, what you can ask of the RS, and how short the access-token TTL is.

<style scoped>
.atf-t1{fill:var(--vp-c-text-1)}.atf-t2{fill:var(--vp-c-text-2)}.atf-op{fill:var(--vp-c-brand-2)}.atf-rs{fill:var(--vp-c-text-3)}.atf-b{font-family:var(--vp-font-family-base);font-size:13px}.atf-c{font-family:var(--vp-font-family-base);font-size:12px}.atf-s{font-family:var(--vp-font-family-base);font-size:11px}.atf-m{font-family:var(--vp-font-family-mono);font-size:12px}.atf-sop{stroke:var(--vp-c-brand-2)}.atf-srs{stroke:var(--vp-c-text-3)}
</style>

<svg class="atf" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="atf-choosing-format-title" viewBox="0 0 700 402" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="atf-choosing-format-title">Decision tree for choosing between opaque, JWT, and a per-audience mix based on introspection requirements, access-token TTL, and RS topology.</title>
  <rect x="24" y="24" width="340" height="64" rx="6"/>
  <text class="atf-c atf-t1" x="194" y="48" text-anchor="middle">Can every RS be required</text>
  <text class="atf-c atf-t1" x="194" y="68" text-anchor="middle">to call <tspan class="atf-m">/introspect</tspan> per request?</text>
  <rect x="516" y="32" width="150" height="48" rx="24"/>
  <text class="atf-b atf-t1" x="591" y="60" text-anchor="middle">Opaque</text>
  <line x1="364" y1="56" x2="514" y2="56"/>
  <path d="M507 52 L514 56 L507 60"/>
  <text class="atf-s atf-t2" x="440" y="48" text-anchor="middle">Yes</text>
  <line x1="194" y1="88" x2="194" y2="132"/>
  <path d="M190 125 L194 132 L198 125"/>
  <text class="atf-s atf-t2" x="210" y="112" text-anchor="middle">No</text>
  <rect x="24" y="136" width="340" height="64" rx="6"/>
  <text class="atf-c atf-t1" x="194" y="160" text-anchor="middle">Is the AT TTL short enough that</text>
  <text class="atf-c atf-t1" x="194" y="180" text-anchor="middle">an <tspan class="atf-m">exp</tspan>-bounded gap is acceptable?</text>
  <rect x="516" y="144" width="150" height="48" rx="24"/>
  <text class="atf-b atf-t1" x="591" y="172" text-anchor="middle">JWT (default)</text>
  <line x1="364" y1="168" x2="514" y2="168"/>
  <path d="M507 164 L514 168 L507 172"/>
  <text class="atf-s atf-t2" x="440" y="160" text-anchor="middle">Yes</text>
  <line x1="194" y1="200" x2="194" y2="244"/>
  <path d="M190 237 L194 244 L198 237"/>
  <text class="atf-s atf-t2" x="210" y="224" text-anchor="middle">No</text>
  <rect x="24" y="248" width="340" height="64" rx="6"/>
  <text class="atf-c atf-t1" x="194" y="272" text-anchor="middle">Do internal and external</text>
  <text class="atf-c atf-t1" x="194" y="292" text-anchor="middle">RSes coexist?</text>
  <rect x="502" y="256" width="178" height="48" rx="24"/>
  <text class="atf-b atf-t1" x="591" y="284" text-anchor="middle">per-audience mix</text>
  <line x1="364" y1="280" x2="500" y2="280"/>
  <path d="M493 276 L500 280 L493 284"/>
  <text class="atf-s atf-t2" x="440" y="272" text-anchor="middle">Yes</text>
  <line x1="194" y1="312" x2="194" y2="336"/>
  <path d="M190 329 L194 336 L198 329"/>
  <text class="atf-s atf-t2" x="210" y="326" text-anchor="middle">No</text>
  <rect x="119" y="338" width="150" height="48" rx="24"/>
  <text class="atf-b atf-t1" x="194" y="366" text-anchor="middle">Opaque</text>
</svg>

Per-audience selection is the realistic answer for many production shapes: an internal RS that already has cheap network access to the OP runs opaque (so logout reaches it immediately), while a public-facing RS that the OP shouldn't gate runs JWT (so the OP never becomes a hot dependency).

## Configuration

Default — JWT for every audience:

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    // No format option — defaults to AccessTokenFormatJWT.
)
```

Switch every issued access token to opaque:

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
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

- **JWT format.** RS code looks like any RFC 9068 verifier: cache the JWKS, validate signature + `aud` + `exp`, project the claims. No call back to the OP. **Mandate `/introspect` only on the paths where you cannot tolerate a session-bounded cascade gap.**
- **Opaque format.** RS code calls `POST /introspect` for every token presentation (or every "cache miss" if the operator allows short-lived caching). The introspection response carries the same `sub` / `scope` / `aud` / `cnf` an RFC 9068 JWT would, so the rest of the RS pipeline does not need to change shape — only the validation step does.

Both shapes propagate sender constraints (DPoP RFC 9449, mTLS RFC 8705): the JWT path embeds `cnf` directly, the opaque path re-emits `cnf` from the OP-side record so the RS sees the same proof requirement.

## Read next

- [ID Token, access token, userinfo](/concepts/tokens) — what each artefact is for, why they're not interchangeable.
- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — how `cnf` survives the JWT-vs-opaque choice.
- [Back-channel logout](/use-cases/back-channel-logout) — how the OP fans logout out to other RPs and cascades shadow-row revocation.
