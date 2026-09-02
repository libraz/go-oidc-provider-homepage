---
title: Clock skew and replay windows
description: Clock, replay, reauthentication, passkey-challenge, and remote-JWKS freshness rules in go-oidc-provider, with the defaults and bounded limits that affect deployment review.
pageClass: pg-security-clock-and-replay
---

# Clock skew and replay windows

OIDC artifacts do not all have the same freshness or replay shape: authorization codes and PAR records are consumed server-side, while JWTs and proofs carry time claims. A server whose clock has drifted can accept stale artifacts, and a server without replay state can accept the same one twice. The OP therefore combines explicit TTLs, bounded clock tolerance, one-time state, and compare-and-set replay stores.

This page collects the security-relevant defaults that are easy to misread, the constant or option that controls each one, and the page where the surrounding feature is explained. It also records the reauthentication, passkey, and JWKS limits that are not represented by an `iat`/`exp` row.

## Clock source

Every TTL the OP enforces is computed against `op.Clock.Now()`, the wall-clock interface defined in `op/clock.go`:

```go
type Clock interface {
    Now() time.Time
}
```

Production deployments leave the field unset and the library installs a system-clock implementation. Test suites and deterministic replay harnesses pass a fake `Clock` so token TTLs, audit timestamps, and rate-limit windows all advance under their control. Freshness decisions in the core use the clock seam; an adapter that cannot import the seam documents its own fallback and can expose an override. Keep the clock boundary singular in an embedder rather than adding ad-hoc `time.Now()` checks around protocol decisions.

The implication for embedders: **NTP / chronyd is mandatory**. The OP trusts its own wall clock to compare `iat` and `exp` against the current instant. A machine whose clock has drifted by minutes will silently accept proofs that the issuing client believes are stale, or reject proofs that the issuing client just signed. Run an OP only on hosts with disciplined time sync.

## Window summary table

| Artifact | Defense | Default window | Verify path |
|---|---|---|---|
| Authorization code | one-time consumption + TTL | `DefaultAuthCodeTTL = 60 s` | [/concepts/authorization-code-pkce](/concepts/authorization-code-pkce) |
| Refresh token (rotation grace) | acceptance of the just-rotated previous token | `refresh.GraceTTLDefault = 60 s` (configurable via `op.WithRefreshGracePeriod`) | [/concepts/refresh-tokens](/concepts/refresh-tokens) |
| DPoP proof — `iat` window | symmetric tolerance around server time | 60 s | [/concepts/dpop](/concepts/dpop) |
| DPoP proof — `jti` cache | dedup against replay | approximately 120 s | [/concepts/dpop](/concepts/dpop) |
| JAR (RFC 9101) request object — `jti` cache | dedup against replay | server-bounded expiry: `max(exp, now + max-age)`, capped at `now + max(max-age, maxLifetime)`, then clock skew | [/security/design-judgments#dj-6](/security/design-judgments#dj-6) |
| JAR — future skew | `nbf` / `iat` tolerance | `jar.DefaultMaxFutureSkew = 60 s` | [/security/design-judgments#dj-6](/security/design-judgments#dj-6) |
| PAR (RFC 9126) `request_uri` lifetime | one-time, short-lived | `parendpoint.DefaultTTL = 60 s` | [/concepts/fapi](/concepts/fapi) |
| Back-Channel Logout token | OP signs once, RP dedups | OP does not enforce a `jti` cache; RP-side responsibility | [/use-cases/back-channel-logout](/use-cases/back-channel-logout) |
| ID Token | `iat` + `exp` | `exp - iat = defaultIDTokenTTL = 10 min` (fixed, independent of the request's access-token TTL) | [/concepts/tokens](/concepts/tokens) |
| Access token (JWT or opaque) | `iat` + `exp` | `DefaultAccessTokenTTL = 5 min`, capped at `AccessTokenTTLMax = 24 h` (FAPI profile caps at 10 min) | [/concepts/tokens](/concepts/tokens) |
| Refresh token (absolute lifetime) | `exp` from issuance | `timex.RefreshTokenTTLDefault = 30 days` | [/concepts/refresh-tokens](/concepts/refresh-tokens) |
| `client_assertion` (private_key_jwt) | `iat` + `exp` + `jti` dedup, ±60 s leeway | jti marked with `expiresAt = assertion.exp + leeway` (60 s), capped at `now + maxAssertionLifetime + leeway` | [/concepts/client-types](/concepts/client-types) |

The constants in the "Default window" column are the source of truth for the current core. For JAR, the request object's `exp` does not control retention by itself: the verifier's maximum lifetime ceiling (when configured) and its `max-age` floor bound the marker, with clock skew added. The table intentionally does not turn every application-configurable TTL into a promise: `With*` options and active profiles can narrow or replace many defaults. Recheck the linked source and tests when upgrading the core.

The same selected windows, drawn to scale on a logarithmic time axis, show the broad shape: replay and clock windows cluster around a minute, token lifetimes step up to minutes, and the refresh token's absolute lifetime reaches 30 days.

<figure class="fig">
  <div class="fig-head">Every clock and replay window, to scale</div>
  <svg class="fig-svg" role="img" aria-labelledby="clock-windows-title" viewBox="0 0 960 404" xmlns="http://www.w3.org/2000/svg">
    <title id="clock-windows-title">A logarithmic comparison of every clock and replay window the library enforces, from the sixty-second replay band up to the thirty-day absolute refresh-token lifetime. Filled circles are clock and TTL freshness checks; hollow squares are store-backed replay deduplication.</title>
    <text class="fg-lbl" x="36" y="24">window length after issuance · logarithmic axis</text>
    <circle class="fg-dot--accent" cx="560" cy="20" r="4.5"/>
    <text class="fg-xs" x="572" y="24">clock / TTL freshness</text>
    <rect class="fg-dot--hollow" x="712" y="15.5" width="9" height="9" rx="1"/>
    <text class="fg-xs" x="729" y="24">store-backed replay dedup</text>
    <!-- decade grid -->
    <line class="fg-rule fg-rule--dashed" x1="340" y1="60" x2="340" y2="360"/>
    <line class="fg-rule fg-rule--dashed" x1="461" y1="60" x2="461" y2="360"/>
    <line class="fg-rule fg-rule--dashed" x1="555" y1="60" x2="555" y2="360"/>
    <line class="fg-rule fg-rule--dashed" x1="721" y1="60" x2="721" y2="360"/>
    <line class="fg-rule fg-rule--dashed" x1="900" y1="60" x2="900" y2="360"/>
    <!-- rows -->
    <line class="fg-rule" x1="340" y1="76" x2="900" y2="76"/>
    <text class="fg-s" x="300" y="80" text-anchor="end">Authorization code</text>
    <rect class="fg-dot--hollow" x="335.5" y="71.5" width="9" height="9" rx="1"/>
    <text class="fg-mxs" x="356" y="80">60 s</text>
    <line class="fg-rule" x1="340" y1="106" x2="900" y2="106"/>
    <text class="fg-s" x="300" y="110" text-anchor="end">PAR request_uri</text>
    <rect class="fg-dot--hollow" x="335.5" y="101.5" width="9" height="9" rx="1"/>
    <text class="fg-mxs" x="356" y="110">60 s</text>
    <line class="fg-rule" x1="340" y1="136" x2="900" y2="136"/>
    <text class="fg-s" x="300" y="140" text-anchor="end">Refresh token — grace</text>
    <circle class="fg-dot--accent" cx="340" cy="136" r="4.5"/>
    <text class="fg-mxs" x="356" y="140">60 s</text>
    <line class="fg-rule" x1="340" y1="166" x2="900" y2="166"/>
    <text class="fg-s" x="300" y="170" text-anchor="end">DPoP proof — iat</text>
    <circle class="fg-dot--accent" cx="340" cy="166" r="4.5"/>
    <text class="fg-mxs" x="356" y="170">±60 s</text>
    <line class="fg-rule" x1="340" y1="196" x2="900" y2="196"/>
    <text class="fg-s" x="300" y="200" text-anchor="end">JAR — future skew</text>
    <circle class="fg-dot--accent" cx="340" cy="196" r="4.5"/>
    <text class="fg-mxs" x="356" y="200">60 s</text>
    <line class="fg-rule" x1="340" y1="226" x2="900" y2="226"/>
    <text class="fg-s" x="300" y="230" text-anchor="end">client_assertion</text>
    <rect class="fg-dot--hollow" x="335.5" y="221.5" width="9" height="9" rx="1"/>
    <text class="fg-mxs" x="356" y="230">±60 s</text>
    <line class="fg-rule" x1="340" y1="256" x2="900" y2="256"/>
    <text class="fg-s" x="300" y="260" text-anchor="end">DPoP proof — jti cache</text>
    <rect class="fg-dot--hollow" x="371.5" y="251.5" width="9" height="9" rx="1"/>
    <text class="fg-mxs" x="392" y="260">≈120 s</text>
    <line class="fg-rule" x1="340" y1="286" x2="900" y2="286"/>
    <text class="fg-s" x="300" y="290" text-anchor="end">Access token</text>
    <circle class="fg-dot--accent" cx="424" cy="286" r="4.5"/>
    <text class="fg-mxs" x="440" y="290">5 min · FAPI 10 min</text>
    <line class="fg-rule" x1="340" y1="316" x2="900" y2="316"/>
    <text class="fg-s" x="300" y="320" text-anchor="end">ID token</text>
    <circle class="fg-dot--accent" cx="461" cy="316" r="4.5"/>
    <text class="fg-mxs" x="477" y="320">10 min</text>
    <line class="fg-rule" x1="340" y1="346" x2="900" y2="346"/>
    <text class="fg-s" x="300" y="350" text-anchor="end">Refresh token — absolute</text>
    <circle class="fg-dot--accent" cx="900" cy="346" r="4.5"/>
    <text class="fg-mxs" x="888" y="350" text-anchor="end">30 days</text>
    <!-- axis -->
    <line class="fg-rule fg-rule--strong" x1="320" y1="366" x2="912" y2="366"/>
    <text class="fg-mxs" x="340" y="384" text-anchor="middle">1 min</text>
    <text class="fg-mxs" x="461" y="384" text-anchor="middle">10 min</text>
    <text class="fg-mxs" x="555" y="384" text-anchor="middle">1 h</text>
    <text class="fg-mxs" x="721" y="384" text-anchor="middle">1 day</text>
    <text class="fg-mxs" x="900" y="384" text-anchor="middle">30 days</text>
  </svg>
  <figcaption class="fig-note">Six of the ten sit on the leftmost gridline. That clustering is the design: anything an attacker could replay is measured in seconds, and only the things a user would notice losing are measured in days.</figcaption>
</figure>

## Reauthentication freshness

`prompt=login` and a violated `max_age` are freshness requirements, not display hints. At `/authorize` entry, `prompt=login` sets the reauthentication flag unconditionally. `max_age` compares the request's non-negative integer seconds with the session's recorded `auth_time`, and `max_age=0` always requires a new factor. The comparison stays in integer-second arithmetic instead of converting an untrusted value to `time.Duration`, so very large values cannot wrap and reverse the freshness decision. The existing browser session or consent grant cannot satisfy a violated freshness requirement. The interaction state carries the decision to the authenticator orchestrator, whose terminal guard rejects a factor-less result with `ErrReauthNotPerformed`; a completed factor stamps a new `auth_time` on the resulting session and grant.

## JWT `jti` and clock tolerance

The in-library JWT access-token verifier applies `tokens.DefaultLeeway = 30 s` symmetrically to `exp` and `iat` when no verifier-specific leeway is configured. `RequireJTI` is enabled for the OP's non-`None` access-token revocation strategies, because the registry or deny-list cannot answer a revocation query without a token identifier; `RevocationStrategyNone` does not require it. This is separate from DPoP/JAR/client-assertion replay retention: there is no universal 30-second `jti` cache for every JWT use.

## Passkey challenge retirement

Each passkey registration or login attempt mints a fresh WebAuthn challenge and receives a `Session` with a default five-minute absolute lifetime. If an assertion fails, the authenticator orchestrator clears the in-flight factor scratch and increments the signed `StateRef` counter before persisting the failed state. The old `StateRef` and its challenge are therefore retired together; a rejected assertion cannot be replayed during the broader ten-minute interaction-state lifetime. A successful assertion follows the normal credential update and clone-warning rules.

## Remote JWKS bounds

Relying-party JWKS fetched from a registered `jwks_uri` is bounded on five axes:

| Bound | Value |
|---|---|
| total fetch timeout | 5 s |
| maximum positive-cache TTL | 5 min |
| response body | 64 KiB |
| declared keys | 64 |
| distinct URL loads in flight, process-wide | 64 |

Unknown-`kid` forced refreshes are throttled to once per URL per 20 seconds. Cache cardinality is capped at 256 positive/negative URL entries, and a negative fetch result is cached for five seconds. These are core safety limits, not a guarantee that a deployment's upstream JWKS will remain available; allow a key rotation strategy that works within them.

## What "replay" means here

"Replay" is one word in the spec and three different defenses in the code.

**Token replay** — the same bearer-shaped credential is presented twice. Authorization codes are *consumed* on first use (the row is marked spent in `AuthorizationCodeStore`). Refresh tokens *rotate* on every redemption and reuse-detection cascades a revoke when the previous token is presented after the grace window closes. DPoP proofs are *deduped* by `jti`: the nonce gate runs first, then the accepted proof is committed to `ConsumedJTIStore`, so a second proof carrying the same `jti` returns `ErrProofReplayed` once the first proof has passed the gate.

**Request replay** — the same authorize request is submitted again with the same parameters. PAR makes this structurally impossible by issuing a one-time `request_uri`: once `/authorize` consumes the URN it is gone from `PushedAuthRequestStore`. JAR (request objects passed inline as `request=`) defends with `jti` dedup against the same `ConsumedJTIStore` substore. Markers use `jar:<clientID>:<jti>` keys and follow the server-bounded expiry calculation: the request's `exp` is subject to the verifier's `max-age` floor and maximum-lifetime ceiling, plus clock skew.

**Logout replay** — the same `logout_token` is POSTed to the RP a second time. Back-Channel Logout 1.0 §2.6 places the dedup responsibility on the *RP*, not the OP: the OP signs and delivers once, and each RP is expected to track recently-seen logout-token `jti` values for its own purposes. The OP does not maintain a logout-token replay cache because the relevant boundary is the RP.

Read these three together as the model: the artifact's *use* defines the defense. Codes are spent, refresh tokens rotate, DPoP / JAR / `client_assertion` carry an explicit `jti` and rely on a shared dedup table, and logout tokens delegate dedup to the receiver.

## Recommended deployment knobs

`ConsumedJTIStore` (declared in `op/store/jti.go`) is the contract every `jti`-based defense routes through. DPoP, JAR, and `client_assertion` all call `Mark(ctx, key, expiresAt)` on the same substore; the namespacing of the key (`jar:<clientID>:<jti>`, the bare `jti` for DPoP and assertions) keeps them from colliding.

For multi-instance deployments, the substore must be shared across instances or every instance must be sticky-routed for the lifetime of a given `jti`. Backing it with the in-memory implementation across multiple replicas defeats the defense — replica A and replica B will each accept the same proof exactly once. A fast shared cache (Redis, Memcached) is the typical choice; the deployment guidance in [/operations/multi-instance](/operations/multi-instance) discusses the volatile / durable split that this implies.

`ConsumedJTIStore` is explicitly outside the transactional cluster (see `op/store/tx.go`). The operations are idempotent ("first writer wins; subsequent writers see already-consumed"). A total cache flush reopens replay only until each artifact's own acceptance boundary. The DPoP marker is retained through the proof's allowable `iat` range. JAR markers retain through the server-bounded `exp` / `max-age` / maximum-lifetime calculation (plus skew), and client assertions use their own bounded expiry. Token lifetimes and browser interaction state are separate budgets and are intentionally longer.

The other deployment knob is the wall clock itself. Every replica runs the same OP code with the same defaults; if their clocks disagree by more than the relevant window, the replicas will disagree about whether a given artifact is fresh. NTP discipline across the whole fleet is part of the security posture, not a "nice to have".

## Edge cases

**Daylight saving and leap seconds are not relevant.** Every protocol timestamp the OP compares is a Unix epoch second. DST transitions and leap-second adjustments do not move the epoch. The constants above are pure `time.Duration` values, so a 60-second grace stays 60 seconds across a local-time transition.

**Long-lived tokens versus short windows.** Refresh tokens default to 30 days; the rotation grace is 60 seconds. This pairing is deliberate: the long lifetime supports background-sync clients across reasonable network outages, while the short grace bounds how long a leaked previous token remains usable after the legitimate client has rotated. The trade-off is documented in [/security/design-judgments](/security/design-judgments) — the library prefers correctness (cascade-revoke on reuse) over availability (silently accept replays) under network blips, and the 60-second window is the smallest interval that covers the typical mobile retry without leaving the previous token usable for long.

**DPoP nonce vs DPoP `iat`.** The `iat` claim is signed by the *client*, so a compromised client can pre-stage proofs valid for the full 60-second window. DPoP nonces (RFC 9449 §8) close that gap by adding a server-controlled freshness signal that the client must echo. Both are validated independently — a proof that passes the `iat` window but fails the nonce check is rejected, and a proof that carries a fresh nonce but a stale `iat` is also rejected. See [/concepts/dpop](/concepts/dpop) and [/use-cases/dpop-nonce](/use-cases/dpop-nonce) for the detailed flow.

**Stale-nonce ordering and jti consumption.** The DPoP verifier marks `jti` *after* the nonce gate passes, not before. A proof that fails the nonce check never advances the `ConsumedJTIStore`, so a client retrying with a fresh nonce can resubmit the same `jti` once. A proof that passes the nonce gate and is then resubmitted with a fresher nonce returns `ErrProofReplayed` because the `jti` is already marked. The order is documented inline in `internal/dpop/verify.go`.

## Read next

- [/concepts/dpop](/concepts/dpop) — DPoP `iat` / `jti` / nonce in detail
- [/concepts/refresh-tokens](/concepts/refresh-tokens) — rotation, grace window, reuse detection cascade
- [/security/design-judgments](/security/design-judgments) — why these specific windows, traded against what
- [/operations/multi-instance](/operations/multi-instance) — sharing `ConsumedJTIStore` across replicas
