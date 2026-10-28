---
title: Refresh tokens
description: Rotation, reuse detection, grace periods, and the offline_access TTL bucket.
pageClass: pg-concepts-refresh-tokens
---

# Refresh tokens

A **refresh token** is a long-lived credential the RP exchanges for a fresh [access token](/concepts/tokens) without re-authenticating the user. It's how "stay signed in" works: access tokens stay short-lived, and the refresh token quietly replaces them.

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework (§6 refresh)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice (rotation, reuse detection)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §11 (`offline_access`)
:::

::: details Vocabulary refresher
- **Rotation** — every successful refresh-token exchange invalidates the old refresh token and issues a new one. The pair (old, new) form a **chain** of refreshes for the same login.
- **Reuse detection** — if a refresh token that's already been rotated shows up again, the OP treats it as a stolen-credential signal and invalidates the entire chain. See the warning below.
- **Grace period** — a short window in which a retry can recover the same successor refresh token without rotating the chain again. A sender-constrained retry may receive a newly bound access token.
- **`offline_access` scope** — OIDC's standard way for the user to consent to "the app may keep working when I'm not present." By default it selects the offline TTL bucket; `op.WithStrictOfflineAccess()` makes it an issuance gate.
:::

## How rotation works

Every successful `grant_type=refresh_token` call **rotates** the refresh token: the old one is invalidated and a new one is returned.

<figure class="fig">
  <div class="fig-head">Rotation, and what happens when a rotated token comes back</div>
  <svg class="fig-svg" role="img" aria-labelledby="rt-rotation-title" viewBox="0 0 960 904" xmlns="http://www.w3.org/2000/svg">
    <title id="rt-rotation-title">Refresh token rotation. Each exchange invalidates the presented token and issues a new one in the same chain. When an already-rotated token is replayed, the OP detects reuse and revokes the whole chain, including the token the legitimate client holds.</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="416" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">normal renewal</text>
    <rect class="fg-group" x="32" y="544" width="896" height="336" rx="8"/>
    <text class="fg-lbl fg-danger fg-halo" x="56" y="572">a stolen token comes back</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="880"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="880"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="880"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP / client</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">renews its tokens</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box fg-box--danger" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Attacker</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">holds a copy of rt1</text>
    <!-- normal renewal -->
    <path class="fg-edge" d="M192,176 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="166" text-anchor="middle">POST /token · code</text>
    <path class="fg-edge fg-edge--accent" d="M512,224 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="214" text-anchor="middle">200 · access_token · rt1</text>
    <path class="fg-edge" d="M192,280 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="270" text-anchor="middle">refresh_token grant · rt1</text>
    <path class="fg-edge fg-edge--accent" d="M512,304 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="568" y="310">Rotate</text>
    <text class="fg-mxs" x="568" y="332">invalidate rt1 · mint rt2</text>
    <path class="fg-edge fg-edge--accent" d="M512,384 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="374" text-anchor="middle">200 · access_token · rt2</text>
    <path class="fg-edge" d="M192,440 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="430" text-anchor="middle">refresh_token grant · rt2</text>
    <path class="fg-edge fg-edge--accent" d="M512,496 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="486" text-anchor="middle">200 · access_token · rt3</text>
    <!-- stolen token -->
    <path class="fg-edge fg-edge--muted" d="M192,632 H824" marker-end="url(#fg-am)"/>
    <text class="fg-s fg-halo" x="508" y="620" text-anchor="middle">rt1 copied earlier</text>
    <path class="fg-edge fg-edge--danger" d="M824,688 H512" marker-end="url(#fg-ad)"/>
    <text class="fg-edge-lbl" x="668" y="678" text-anchor="middle">refresh_token=rt1 (replay)</text>
    <path class="fg-edge fg-edge--danger" d="M512,720 h40 v24 h-40" marker-end="url(#fg-ad)"/>
    <text class="fg-s fg-danger" x="568" y="726">Reuse detected</text>
    <text class="fg-mxs" x="568" y="748">RevokeChain(rt1…rt3)</text>
    <text class="fg-mxs" x="568" y="770">refresh.replay_detected</text>
    <path class="fg-edge fg-edge--danger" d="M512,856 H192" marker-end="url(#fg-ad)"/>
    <text class="fg-m" x="352" y="822" text-anchor="middle">400 invalid_grant</text>
    <text class="fg-mxs" x="352" y="844" text-anchor="middle">later, RP presents rt3</text>
  </svg>
  <figcaption class="fig-note">The last arrow is the point of the design: the legitimate client loses its working token as well. Reuse means one of the two holders is an attacker and the OP cannot tell which, so it ends the chain and makes both re-authenticate.</figcaption>
</figure>

::: warning Reuse detection invalidates the chain
If a previously-rotated refresh token is presented again, the OP answers `400 invalid_grant`, emits `refresh.replay_detected`, and **revokes the entire chain** — both the stolen token and the legitimate token derived from it. It also retires the access tokens under the grant, since an attacker who redeemed the stolen token holds one. Both parties have to re-authenticate. This is intentional: it's the strongest signal the OP can give that something has gone wrong.

The scope is the whole grant, which is shared by every session of one user on one client. Under the default grant-tombstone strategy the grant is closed to further issuance, so the user's other refresh chains on that client are refused at their next refresh too. The cascade runs once the `invalid_grant` response is settled and is best effort: a store fault raises a warn-level audit event and does not change the answer the client already got.
:::

::: details Rotation, reuse detection, family revocation — what's that?
Three terms that get used interchangeably in blog posts but mean different things in this codebase:

- **Rotation** — the *normal* successful path. Each `grant_type=refresh_token` returns a new refresh token and invalidates the previous one. Single-use by default.
- **Reuse detection** — the OP saw an already-rotated refresh token come back. That can only happen if it leaked, was caught by malware, or a confused client kept a copy. The library treats it as theft.
- **Family revocation** (also called *chain revocation*) — the OP's response to reuse: every refresh token in the same lineage as the offending one is invalidated, including the legitimate descendant the real client is currently using. The next legitimate refresh fails, the user re-authenticates, and the attacker's stolen token is dead too. The OP walks the parent pointers to the chain root and revokes from there; if no root resolves, it revokes the grant's refresh tokens instead.

RFC 9700 §4.14.2 requires replay detection for public-client refresh tokens through sender constraint or rotation. When rotation detects reuse, it describes revoking the active refresh token. This library invalidates the whole lineage for every client type.
:::

## Grace period

A racing legitimate client (e.g. a tab that double-fetched the same refresh) would otherwise hit reuse detection. `op.WithRefreshGracePeriod(d)` widens the rotation acceptance window:

```go
op.WithRefreshGracePeriod(2 * time.Second)
```

Within `d` seconds of a successful rotation, a valid retry can recover the same successor refresh token. For a sender-constrained request, the OP may issue a new access token bound to the key or certificate presented on the retry. After `d` seconds, replay is treated as reuse.

The retry works because the rotation stores the response sealed with the cookie keys (`op.WithCookieKeys`) next to the successor. The bundled `inmem`, `sql`, and `dynamodb` adapters implement the optional `store.RefreshRetryResponseStore` for this; a [custom store](/use-cases/byo-store) that does not has no stored response to replay, so a retry inside the window gets `invalid_grant`.

::: details What the grace period permits
The OP does not rotate the refresh-token chain again during a grace retry: it returns the saved successor refresh token. Bearer responses can be replayed unchanged. For DPoP or mTLS, the OP reissues the access token for the sender constraint on the retry while keeping the same successor refresh token and ID token. If no saved retry response is available, the retry returns `invalid_grant` without revoking the live successor. Once the window closes, presenting the predecessor triggers reuse detection and chain revocation. Pass zero to disable the window, accepting a greater chance that a legitimate lost-response retry is treated as reuse.
:::

::: tip Default is 60 seconds
The default grace period is **60 seconds** (`refresh.GraceTTLDefault`) when `WithRefreshGracePeriod` is not supplied. Pass `op.WithRefreshGracePeriod(0)` to disable grace entirely (strict single-use), or a non-negative duration to set the window explicitly. Negative values are rejected at construction time. The OFCS refresh-token regression test waits ~32 s between rotation and retry, so any grace below that range will regress conformance.

Under `profile.FAPI2Baseline` and `profile.FAPI2MessageSigning`, explicitly configured values from zero through the default **60 seconds** (inclusive) are accepted. Only a grace period wider than 60 seconds is rejected at `op.New`; omitting the option keeps the default. This limit is a library setting, not a final FAPI conformance rule: Security Profile §5.3.2.1(9) prohibits routine refresh-token rotation except under extraordinary circumstances. `profile.FAPICIBA` does not apply this refresh-grace gate and may use a wider window.

```go
// Rejected: FAPI Baseline caps an explicit grace period at 60 seconds.
op.New(
  op.WithProfile(profile.FAPI2Baseline),
  op.WithRefreshGracePeriod(61*time.Second),
)

// Accepted: the 60-second default may be configured explicitly.
op.New(
  op.WithProfile(profile.FAPI2Baseline),
  op.WithRefreshGracePeriod(60*time.Second),
)
```
:::

## Current client registration scopes apply on rotation

A refresh token records the scope granted when its chain started, but rotation does not bypass a later registration change. Before consuming the presented token, the OP derives the effective scope. It intersects the requested scope with the token's bound scope — an omitted request reuses the bound scope — and then re-intersects the result with the client's current `Scopes` registration, checking any per-scope `AllowedClients` policy. Every scope to issue must still be registered; if the re-check would remove one, `/token` returns `invalid_scope` and leaves the presented token unconsumed. This lets an operator narrow a client's registration without allowing an existing chain to keep minting the removed scope.

A request that asks for a narrower scope only narrows the access token it receives. The rotated refresh token keeps the scope of the token it replaces, so a later refresh can still ask for the full set.

## TTL buckets

| Option | Default | Applies to |
|---|---|---|
| `op.WithRefreshTokenTTL(d)` | 30 days | Conventional refresh tokens. |
| `op.WithRefreshTokenOfflineTTL(d)` | inherits `WithRefreshTokenTTL` | Refresh tokens issued under the `offline_access` scope. |

Splitting the buckets lets `offline_access` carry an operationally observable difference (longer lifetime for stay-signed-in flows) while conventional refresh keeps a shorter rotation cadence.

## Issuance gate

By default, refresh-token issuance requires all three conditions:

1. The Provider enables the `refresh_token` grant.
2. The client lists `refresh_token` in its `GrantTypes`.
3. The granted scope contains `openid`.

If a gate fails, the authorization-code exchange can still succeed with an access token but without a refresh token. An ID token is included only when the granted scope contains `openid`. `op.WithOpenIDScopeOptional()` removes the `openid` condition for OAuth-only grants; `op.WithStrictOfflineAccess()` adds an `offline_access` condition instead. These two options cannot be combined.

In the default (lax) reading of OIDC Core 1.0 §11, `offline_access` is **not** an issuance gate: it only governs consent-prompt UX and which TTL bucket the refresh token falls into (`WithRefreshTokenTTL` vs `WithRefreshTokenOfflineTTL`). To make `offline_access` a hard gate, opt in with `op.WithStrictOfflineAccess()` — see the section below.

::: details `op.WithStrictOfflineAccess` — strict OIDC Core §11 reading
`op.WithStrictOfflineAccess()` switches the issuance and refresh exchange paths to the strict §11 reading: refresh tokens are issued (and accepted on `grant_type=refresh_token`) only when the granted scope contains `offline_access`. Pick this when you want consent prompts and the actual issuance gate to agree byte-for-byte on what the user authorised — at the cost of every RP that wants stay-signed-in behaviour explicitly requesting `offline_access`.

The option is mutually exclusive with `op.WithOpenIDScopeOptional` (strict §11 has no meaning when `openid` itself is optional) — the constructor refuses the combination.
:::

## Authentication context survives rotation

A refresh token carries the context of the authorization that issued it, not just the subject and scope. When a refresh exchange mints a fresh id_token or access token, the OP reproduces what the user actually authenticated with — `auth_time`, `acr`, `amr`, the granted `authorization_details`, and the OIDC `claims` request — rather than stamping the moment of the refresh. So an RP that asked for `acr_values=aal2` at login still sees `acr` reflect that strength after a week of background refreshes, and a step-up's freshness signal does not silently reset on every rotation.

The context belongs to the chain, not to the grant shared by every session of one user on one client. A second login by the same user on the same client does not change what an existing chain reports. The refresh record persists these fields (alongside the token's `origin`); a [custom store](/use-cases/byo-store) that drops them makes the chain fall back to reading the grant, with the shared-grant behaviour that implies.

## Sender-constrained chains

A chain issued to a client that presented a DPoP proof or a client certificate may be bound to that key or certificate (see [DPoP](/concepts/dpop#what-this-library-binds) and [mTLS](/concepts/mtls)). A bound chain refuses a refresh that omits the proof or certificate, or presents a different one, with `invalid_grant`. Binding is also checked against the current configuration: if DPoP or mTLS has been switched off since the chain was issued, a bound chain is refused rather than downgraded to bearer.

## Revoking a chain

`/revoke` on a refresh token (RFC 7009) revokes that chain and the access tokens under its grant, and nothing more: the user's other refresh chains on the same client and any unredeemed authorization codes stay valid. For a long chain the endpoint still finds the chain root; if none resolves, it revokes the grant's refresh tokens and records `surface: "refresh_grant"` on `token.revoked` instead of `refresh_chain`. A refresh token issued to another client is ignored, and the answer is `200` either way.

When the user is deleted or deprovisioned, the next refresh fails with `invalid_grant` and the OP tears the grant down.

## At rest: hashed, constant-time

Refresh-token handles are opaque bearer secrets: possession alone redeems them. The OP never stores the presented value — it stores a hash, and on `Find` / `Consume` it hashes the presented value to look the digest up, comparing in constant time. That holds the public store lookups to a hash-only, timing-flat shape, hardening against both store disclosure and timing side channels. The internal reuse-detection chain walk resolves stored handles through a separate `RefreshChainResolver` path so the public lookups stay hash-only. A [custom store](/use-cases/byo-store) must persist hashed ids to satisfy the contract.

## Audit trail

The token endpoint emits these slog audit events through `op.WithAuditLogger`:

| Event | Fired on |
|---|---|
| `op.AuditTokenIssued` (`token.issued`) | Refresh minted on `authorization_code` exchange. |
| `op.AuditTokenRefreshed` (`token.refreshed`) | Refresh rotated on `refresh_token` grant, recorded once the rotation is durable. A refresh that lost a concurrent presentation or rolled back records nothing. |
| `op.AuditRefreshReplayDetected` (`refresh.replay_detected`) | An already-rotated token was presented (reuse detection), before the best-effort chain revoke. |
| `op.AuditTokenRevoked` (`token.revoked`) | `/revoke` retired a refresh chain; `surface` is `refresh_chain`, or `refresh_grant` when the fallback ran. |

The issued and refreshed records carry an `offline_access` boolean and a `ttl_bucket` string (`"offline"` or `"default"`) in `extras`, so SOC dashboards can split stay-signed-in chains from conventional rotation without re-reading the granted scope set.

## Read next

- [ID Token vs access token vs userinfo](/concepts/tokens) — what each token actually contains.
- [Sender constraint](/concepts/sender-constraint) — bind the access token (and the refresh token) to a key the client holds.
- [Access token format](/concepts/access-token-format) — what a rotation does to the prior access token under JWT and opaque formats.
