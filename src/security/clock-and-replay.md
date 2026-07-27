---
title: Clock skew and replay windows
description: Every signed artifact in OIDC has an issuance timestamp and an expiration. Servers without a sane clock accept stale things; servers without dedup tables accept replays. This page lists every time-related window go-oidc-provider uses, in one place.
pageClass: pg-security-clock-and-replay
---

# Clock skew and replay windows

Every signed artifact OIDC produces — codes, refresh tokens, DPoP proofs, JAR objects, PAR records, ID tokens, access tokens, client assertions — carries an issuance timestamp (`iat`) and an expiration (`exp`). A server whose clock has drifted will accept stale artifacts long after the issuer thinks they have expired. A server with no replay table will accept the *same* signed artifact a second time. Defending the OP against both is mostly bookkeeping: pick a window, store seen identifiers until the window closes, and reject anything outside the window.

This page collects every window the library applies, the constant or option that controls it, and the page where the surrounding feature is explained. If you are reviewing the OP for embedding, the table below is the one-pager you want.

## Clock source

Every TTL the OP enforces is computed against `op.Clock.Now()`, the wall-clock interface defined in `op/clock.go`:

```go
type Clock interface {
    Now() time.Time
}
```

Production deployments leave the field unset and the library installs a `time.Now()`-backed implementation. Test suites and deterministic replay harnesses pass a fake `Clock` so token TTLs, audit timestamps, and rate-limit windows all advance under their control. There is no place in the codebase that reads `time.Now()` directly for a freshness decision — every freshness gate funnels through this interface so that "what time is it?" is one mockable seam, not a hundred.

The implication for embedders: **NTP / chronyd is mandatory**. The OP trusts its own wall clock to compare `iat` and `exp` against the current instant. A machine whose clock has drifted by minutes will silently accept proofs that the issuing client believes are stale, or reject proofs that the issuing client just signed. Run an OP only on hosts with disciplined time sync.

## Window summary table

| Artifact | Defense | Default window | Verify path |
|---|---|---|---|
| Authorization code | one-time consumption + TTL | `DefaultAuthCodeTTL = 60 s` | [/concepts/authorization-code-pkce](/concepts/authorization-code-pkce) |
| Refresh token (rotation grace) | acceptance of the just-rotated previous token | `refresh.GraceTTLDefault = 60 s` (configurable via `op.WithRefreshGracePeriod`) | [/concepts/refresh-tokens](/concepts/refresh-tokens) |
| DPoP proof — `iat` window | symmetric tolerance around server time | 60 s | [/concepts/dpop](/concepts/dpop) |
| DPoP proof — `jti` cache | dedup against replay | approximately 120 s | [/concepts/dpop](/concepts/dpop) |
| JAR (RFC 9101) request object — `jti` cache | dedup against replay | OP-side cache evicted at the request object's own `exp` | [/security/design-judgments#dj-6](/security/design-judgments#dj-6) |
| JAR — future skew | `nbf` / `iat` tolerance | `jar.DefaultMaxFutureSkew = 60 s` | [/security/design-judgments#dj-6](/security/design-judgments#dj-6) |
| PAR (RFC 9126) `request_uri` lifetime | one-time, short-lived | `parendpoint.DefaultTTL = 60 s` | [/concepts/fapi](/concepts/fapi) |
| Back-Channel Logout token | OP signs once, RP dedups | OP does not enforce a `jti` cache; RP-side responsibility | [/use-cases/back-channel-logout](/use-cases/back-channel-logout) |
| ID Token | `iat` + `exp` | `exp - iat = defaultIDTokenTTL = 10 min` (fixed, independent of the request's access-token TTL) | [/concepts/tokens](/concepts/tokens) |
| Access token (JWT or opaque) | `iat` + `exp` | `DefaultAccessTokenTTL = 5 min`, capped at `AccessTokenTTLMax = 24 h` (FAPI profile caps at 10 min) | [/concepts/tokens](/concepts/tokens) |
| Refresh token (absolute lifetime) | `exp` from issuance | `timex.RefreshTokenTTLDefault = 30 days` | [/concepts/refresh-tokens](/concepts/refresh-tokens) |
| `client_assertion` (private_key_jwt) | `iat` + `exp` + `jti` dedup, ±60 s leeway | jti marked with `expiresAt = assertion.exp + leeway` (60 s), capped at `now + maxAssertionLifetime + leeway` | [/concepts/client-types](/concepts/client-types) |

The constants in the "Default window" column are the source of truth — every entry in the table comes from a `grep` against the library's `internal/...` packages rather than from documentation alone. If the library raises or lowers a default, this table is the page to refresh first.

The same windows, drawn to scale on a logarithmic time axis, make the shape obvious at a glance: every replay-and-clock window collapses into a tight band at or just past 60 seconds, token lifetimes step up to a few minutes, and only the refresh token's absolute lifetime lives out at 30 days — with nothing in between.

<svg id="crws" role="img" aria-labelledby="clock-replay-window-scale-title" viewBox="0 0 752 392" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<title id="clock-replay-window-scale-title">Logarithmic comparison of every clock and replay window go-oidc-provider enforces, from the 60-second replay band to the 30-day refresh-token lifetime.</title>
<line class="d-grid" x1="278.9" y1="58" x2="278.9" y2="362"/>
<line class="d-grid" x1="374.9" y1="58" x2="374.9" y2="362"/>
<line class="d-grid" x1="449.6" y1="58" x2="449.6" y2="362"/>
<line class="d-grid" x1="582.1" y1="58" x2="582.1" y2="362"/>
<line class="d-grid" x1="724" y1="58" x2="724" y2="362"/>
<line class="d-axis" x1="250" y1="362" x2="724" y2="362"/>
<line class="d-lane" x1="250" y1="70" x2="724" y2="70"/>
<line class="d-lane" x1="250" y1="101" x2="724" y2="101"/>
<line class="d-lane" x1="250" y1="132" x2="724" y2="132"/>
<line class="d-lane" x1="250" y1="163" x2="724" y2="163"/>
<line class="d-lane" x1="250" y1="194" x2="724" y2="194"/>
<line class="d-lane" x1="250" y1="225" x2="724" y2="225"/>
<line class="d-lane" x1="250" y1="256" x2="724" y2="256"/>
<line class="d-lane" x1="250" y1="287" x2="724" y2="287"/>
<line class="d-lane" x1="250" y1="318" x2="724" y2="318"/>
<line class="d-lane" x1="250" y1="349" x2="724" y2="349"/>
<rect class="d-op-store" x="274.4" y="65.5" width="9" height="9" rx="1"/>
<rect class="d-op-store" x="274.4" y="96.5" width="9" height="9" rx="1"/>
<circle class="d-op-fill" cx="278.9" cy="132" r="4.5"/>
<circle class="d-op-fill" cx="278.9" cy="163" r="4.5"/>
<circle class="d-op-fill" cx="278.9" cy="194" r="4.5"/>
<rect class="d-op-store" x="274.4" y="220.5" width="9" height="9" rx="1"/>
<rect class="d-op-store" x="303.3" y="251.5" width="9" height="9" rx="1"/>
<circle class="d-op-fill" cx="346" cy="287" r="4.5"/>
<circle class="d-op-fill" cx="374.9" cy="318" r="4.5"/>
<circle class="d-op-fill" cx="724" cy="349" r="4.5"/>
<text class="d-cap" x="8" y="18">Clock and replay windows, to scale</text>
<text class="d-sub" x="8" y="34">logarithmic axis — window length after issuance</text>
<circle class="d-op-fill" cx="470" cy="14" r="4.5"/>
<text class="d-leg" x="480" y="18">clock / TTL freshness</text>
<rect class="d-op-store" x="465.5" y="29.5" width="9" height="9" rx="1"/>
<text class="d-leg" x="480" y="37">store-backed replay dedup</text>
<text class="d-lbl" x="238" y="73.5" text-anchor="end">Authorization code</text>
<text class="d-lbl" x="238" y="104.5" text-anchor="end">PAR <tspan class="d-mono">request_uri</tspan></text>
<text class="d-lbl" x="238" y="135.5" text-anchor="end">Refresh token — grace</text>
<text class="d-lbl" x="238" y="166.5" text-anchor="end">DPoP proof — <tspan class="d-mono">iat</tspan></text>
<text class="d-lbl" x="238" y="197.5" text-anchor="end">JAR — future skew</text>
<text class="d-lbl" x="238" y="228.5" text-anchor="end"><tspan class="d-mono">client_assertion</tspan></text>
<text class="d-lbl" x="238" y="259.5" text-anchor="end">DPoP proof — <tspan class="d-mono">jti</tspan> cache</text>
<text class="d-lbl" x="238" y="290.5" text-anchor="end">Access token</text>
<text class="d-lbl" x="238" y="321.5" text-anchor="end">ID token</text>
<text class="d-lbl" x="238" y="352.5" text-anchor="end">Refresh token — absolute</text>
<text class="d-val" x="289" y="73.5">60 s</text>
<text class="d-val" x="289" y="104.5">60 s</text>
<text class="d-val" x="289" y="135.5">60 s</text>
<text class="d-val" x="289" y="166.5">±60 s</text>
<text class="d-val" x="289" y="197.5">60 s</text>
<text class="d-val" x="289" y="228.5">±60 s</text>
<text class="d-val" x="318" y="259.5">≈120 s</text>
<text class="d-val" x="356" y="290.5">5 min · FAPI 10 min</text>
<text class="d-val" x="385" y="321.5">10 min</text>
<text class="d-val" x="715" y="352.5" text-anchor="end">30 days</text>
<text class="d-tick" x="278.9" y="375" text-anchor="middle">1 min</text>
<text class="d-tick" x="374.9" y="375" text-anchor="middle">10 min</text>
<text class="d-tick" x="449.6" y="375" text-anchor="middle">1 h</text>
<text class="d-tick" x="582.1" y="375" text-anchor="middle">1 day</text>
<text class="d-tick" x="724" y="375" text-anchor="middle">30 days</text>
</svg>

## What "replay" means here

"Replay" is one word in the spec and three different defenses in the code.

**Token replay** — the same bearer-shaped credential is presented twice. Authorization codes are *consumed* on first use (the row is marked spent in `AuthorizationCodeStore`). Refresh tokens *rotate* on every redemption and reuse-detection cascades a revoke when the previous token is presented after the grace window closes. DPoP proofs are *deduped* by `jti`: the verifier marks every accepted proof's `jti` into `ConsumedJTIStore` before any further work, so a second proof carrying the same `jti` returns `ErrProofReplayed` regardless of whether the second submission's nonce was fresh.

**Request replay** — the same authorize request is submitted again with the same parameters. PAR makes this structurally impossible by issuing a one-time `request_uri`: once `/authorize` consumes the URN it is gone from `PushedAuthRequestStore`. JAR (request objects passed inline as `request=`) defends with `jti` dedup against the same `ConsumedJTIStore` substore, scoped to `jar:<clientID>:<jti>` keys and evicted at the request object's own `exp`.

**Logout replay** — the same `logout_token` is POSTed to the RP a second time. Back-Channel Logout 1.0 §2.6 places the dedup responsibility on the *RP*, not the OP: the OP signs and delivers once, and each RP is expected to track recently-seen logout-token `jti` values for its own purposes. The OP does not maintain a logout-token replay cache because the relevant boundary is the RP.

Read these three together as the model: the artifact's *use* defines the defense. Codes are spent, refresh tokens rotate, DPoP / JAR / `client_assertion` carry an explicit `jti` and rely on a shared dedup table, and logout tokens delegate dedup to the receiver.

## Recommended deployment knobs

`ConsumedJTIStore` (declared in `op/store/jti.go`) is the contract every `jti`-based defense routes through. DPoP, JAR, and `client_assertion` all call `Mark(ctx, key, expiresAt)` on the same substore; the namespacing of the key (`jar:<clientID>:<jti>`, the bare `jti` for DPoP and assertions) keeps them from colliding.

For multi-instance deployments, the substore must be shared across instances or every instance must be sticky-routed for the lifetime of a given `jti`. Backing it with the in-memory implementation across multiple replicas defeats the defense — replica A and replica B will each accept the same proof exactly once. A fast shared cache (Redis, Memcached) is the typical choice; the deployment guidance in [/operations/multi-instance](/operations/multi-instance) discusses the volatile / durable split that this implies.

`ConsumedJTIStore` is explicitly outside the transactional cluster (see `op/store/tx.go`). The operations are idempotent ("first writer wins; subsequent writers see already-consumed") and a total cache flush opens at most a window of attacker-controlled replay equal to each artifact's remaining lifetime — bounded by twice the `iat` window for DPoP, by `exp` for JAR / `client_assertion`. This is why none of the windows above is much larger than 120 seconds.

The other deployment knob is the wall clock itself. Every replica runs the same OP code with the same defaults; if their clocks disagree by more than the relevant window, the replicas will disagree about whether a given artifact is fresh. NTP discipline across the whole fleet is part of the security posture, not a "nice to have".

## Edge cases

**Daylight saving and leap seconds are not relevant.** Every timestamp the OP stores is a Unix epoch second. DST transitions and leap-second adjustments do not move the epoch. The constants above are pure `time.Duration` values and a 60-second grace stays 60 seconds across midnight on the last Sunday of October.

**Long-lived tokens versus short windows.** Refresh tokens default to 30 days; the rotation grace is 60 seconds. This pairing is deliberate: the long lifetime supports background-sync clients across reasonable network outages, while the short grace bounds how long a leaked previous token remains usable after the legitimate client has rotated. The trade-off is documented in [/security/design-judgments](/security/design-judgments) — the library prefers correctness (cascade-revoke on reuse) over availability (silently accept replays) under network blips, and the 60-second window is the smallest interval that covers the typical mobile retry without leaving the previous token usable for long.

**DPoP nonce vs DPoP `iat`.** The `iat` claim is signed by the *client*, so a compromised client can pre-stage proofs valid for the full 60-second window. DPoP nonces (RFC 9449 §8) close that gap by adding a server-controlled freshness signal that the client must echo. Both are validated independently — a proof that passes the `iat` window but fails the nonce check is rejected, and a proof that carries a fresh nonce but a stale `iat` is also rejected. See [/concepts/dpop](/concepts/dpop) and [/use-cases/dpop-nonce](/use-cases/dpop-nonce) for the detailed flow.

**Stale-nonce ordering and jti consumption.** The DPoP verifier marks `jti` *after* the nonce gate passes, not before. A proof that fails the nonce check never advances the `ConsumedJTIStore`, so a client retrying with a fresh nonce can resubmit the same `jti` once. A proof that passes the nonce gate and is then resubmitted with a fresher nonce returns `ErrProofReplayed` because the `jti` is already marked. The order is documented inline in `internal/dpop/verify.go`.

## Read next

- [/concepts/dpop](/concepts/dpop) — DPoP `iat` / `jti` / nonce in detail
- [/concepts/refresh-tokens](/concepts/refresh-tokens) — rotation, grace window, reuse detection cascade
- [/security/design-judgments](/security/design-judgments) — why these specific windows, traded against what
- [/operations/multi-instance](/operations/multi-instance) — sharing `ConsumedJTIStore` across replicas
