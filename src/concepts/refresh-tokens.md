---
title: Refresh tokens
description: Rotation, reuse detection, grace periods, and the offline_access TTL bucket.
pageClass: pg-concepts-refresh-tokens
---

# Refresh tokens

A **refresh token** is a long-lived credential the RP exchanges for a fresh access token without re-authenticating the user. It's how "stay signed in" works.

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
  <svg class="fig-svg" role="img" aria-labelledby="rt-rotation-title" viewBox="0 0 960 566" xmlns="http://www.w3.org/2000/svg">
    <title id="rt-rotation-title">Refresh-token rotation. Every exchange invalidates the token that was presented and mints a new one in the same chain. When a token that has already been rotated is replayed, the OP detects reuse and revokes the entire chain, including the tokens the legitimate client still holds.</title>
    <!-- phase bands -->
    <rect class="fg-group" x="30" y="70" width="916" height="300" rx="8"/>
    <rect class="fg-group" x="30" y="378" width="916" height="172" rx="8"/>
    <text class="fg-lbl" x="42" y="88">normal renewal</text>
    <text class="fg-lbl fg-danger" x="42" y="396">a stolen token comes back</text>
    <!-- lifelines -->
    <line class="fg-life" x1="150" y1="62" x2="150" y2="550"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="550"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="550"/>
    <!-- actors -->
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">RP / client</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">renews its tokens</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box fg-box--danger" x="740" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">Attacker</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">holds a copy of rt1</text>
    <!-- initial issue -->
    <path class="fg-edge" d="M150,110 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="104" text-anchor="middle">POST /token · grant_type=authorization_code</text>
    <path class="fg-edge fg-edge--accent" d="M500,140 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="134" text-anchor="middle">200 · access_token · refresh_token: rt1</text>
    <!-- expiry -->
    <path class="fg-edge fg-edge--muted" d="M150,166 h28 v14 h-28" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="190" y="178">the access token expires</text>
    <!-- first rotation -->
    <path class="fg-edge" d="M150,212 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="206" text-anchor="middle">grant_type=refresh_token · refresh_token=rt1</text>
    <path class="fg-edge fg-edge--accent" d="M500,244 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="542" y="248">Rotate</text>
    <text class="fg-mxs" x="542" y="261">invalidate rt1 · mint rt2 in the same chain</text>
    <path class="fg-edge fg-edge--accent" d="M500,290 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="284" text-anchor="middle">200 · access_token · refresh_token: rt2</text>
    <!-- second rotation -->
    <path class="fg-edge" d="M150,322 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="316" text-anchor="middle">grant_type=refresh_token · refresh_token=rt2</text>
    <path class="fg-edge fg-edge--accent" d="M500,354 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="348" text-anchor="middle">200 · access_token · refresh_token: rt3</text>
    <!-- theft -->
    <path class="fg-edge fg-edge--muted" d="M150,424 H830" marker-end="url(#fg-am)"/>
    <text class="fg-xs fg-halo" x="490" y="418" text-anchor="middle">rt1 leaked earlier — the attacker kept the copy</text>
    <!-- replay -->
    <path class="fg-edge fg-edge--danger" d="M830,456 H500" marker-end="url(#fg-ad)"/>
    <text class="fg-mxs" x="665" y="450" text-anchor="middle">replay refresh_token=rt1 — already consumed</text>
    <path class="fg-edge fg-edge--danger" d="M500,484 h30 v16 h-30" marker-end="url(#fg-ad)"/>
    <text class="fg-s fg-danger" x="542" y="488">Reuse detected</text>
    <text class="fg-mxs" x="542" y="501">RevokeChain(rt1…rt3) · refresh.replay_detected</text>
    <path class="fg-edge fg-edge--danger" d="M500,536 H150" marker-end="url(#fg-ad)"/>
    <text class="fg-mxs" x="325" y="530" text-anchor="middle">400 invalid_grant — rt3 is gone too</text>
  </svg>
  <figcaption class="fig-note">The last arrow is the point of the design: the legitimate client loses its working token as well. Reuse means one of the two holders is an attacker and the OP cannot tell which, so it ends the chain and makes both re-authenticate.</figcaption>
</figure>

::: warning Reuse detection invalidates the chain
If a previously-rotated refresh token is presented again, the OP treats it as a stolen-credential signal and **revokes the entire chain** — both the stolen token and the legitimate token derived from it. Both parties have to re-authenticate. This is intentional: it's the strongest signal the OP can give that something has gone wrong.
:::

::: details Rotation, reuse detection, family revocation — what's that?
Three terms that get used interchangeably in blog posts but mean different things in this codebase:

- **Rotation** — the *normal* successful path. Each `grant_type=refresh_token` returns a new refresh token and invalidates the previous one. Single-use by default.
- **Reuse detection** — the OP saw an already-rotated refresh token come back. That can only happen if it leaked, was caught by malware, or a confused client kept a copy. The library treats it as theft.
- **Family revocation** (also called *chain revocation*) — the OP's response to reuse: every refresh token in the same lineage as the offending one is invalidated, including the legitimate descendant the real client is currently using. The next legitimate refresh fails, the user re-authenticates, and the attacker's stolen token is dead too.

RFC 9700 §4.14.2 requires replay detection for public-client refresh tokens through sender constraint or rotation. When rotation detects reuse, it describes revoking the active refresh token. This library invalidates the whole lineage for every client type.
:::

## Grace period

A racing legitimate client (e.g. a tab that double-fetched the same refresh) would otherwise hit reuse detection. `op.WithRefreshGracePeriod(d)` widens the rotation acceptance window:

```go
op.WithRefreshGracePeriod(2 * time.Second)
```

Within `d` seconds of a successful rotation, a valid retry can recover the same successor refresh token. For a sender-constrained request, the OP may issue a new access token bound to the key or certificate presented on the retry. After `d` seconds, replay is treated as reuse.

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

A refresh token carries the original login's authentication context, not just the subject and scope. When a refresh exchange mints a fresh id_token or JWT access token, the OP reproduces the context the user actually authenticated with — `auth_time`, `acr`, `amr`, and the granted `authorization_details` — rather than stamping the moment of the refresh. So an RP that asked for `acr_values=aal2` at login still sees `acr` reflect that strength after a week of background refreshes, and a step-up's freshness signal does not silently reset on every rotation. The refresh record persists these fields (alongside the token's `origin`) so a stored chain reproduces them faithfully.

## At rest: hashed, constant-time

Refresh-token handles are opaque bearer secrets: possession alone redeems them. The OP never stores the presented value — it stores a hash, and on `Find` / `Consume` it hashes the presented value to look the digest up, comparing in constant time. That holds the public store lookups to a hash-only, timing-flat shape, hardening against both store disclosure and timing side channels. The internal reuse-detection chain walk resolves stored handles through a separate `RefreshChainResolver` path so the public lookups stay hash-only. A [custom store](/use-cases/byo-store) must persist hashed ids to satisfy the contract.

## Audit trail

The token endpoint emits two slog audit events through `op.WithAuditLogger`:

| Event | Fired on |
|---|---|
| `op.AuditTokenIssued` | Refresh minted on `authorization_code` exchange. |
| `op.AuditTokenRefreshed` | Refresh rotated on `refresh_token` grant. |

A `refresh.replay_detected` event is emitted before the best-effort chain revoke when an already-rotated token is presented (reuse detection).

Both records carry an `offline_access` boolean and a `ttl_bucket` string (`"offline"` or `"default"`) in `extras`, so SOC dashboards can split stay-signed-in chains from conventional rotation without re-reading the granted scope set.

## Read next

- [ID Token vs access token vs userinfo](/concepts/tokens) — what each token actually contains.
- [Sender constraint](/concepts/sender-constraint) — bind the access token (and the refresh token) to a key the client holds.
