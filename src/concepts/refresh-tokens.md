---
title: Refresh tokens
description: Rotation, reuse detection, grace periods, and the offline_access TTL bucket.
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
- **Grace period** — a small window after rotation where presenting the previous refresh token still returns the *same* new pair (idempotent), to absorb retries from racing clients.
- **`offline_access` scope** — OIDC's standard way for the user to consent to "the app may keep working when I'm not present." By default it selects the offline TTL bucket; `op.WithStrictOfflineAccess()` makes it an issuance gate.
:::

## How rotation works

Every successful `grant_type=refresh_token` call **rotates** the refresh token: the old one is invalidated and a new one is returned.

<style scoped>
.rr-flow-dg text{stroke:none;fill:currentColor;}
.rr-flow-dg .d-actor{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;}
.rr-flow-dg .d-cap{font-family:var(--vp-font-family-mono);font-size:10px;}
.rr-flow-dg .d-prose{font-family:var(--vp-font-family-base);font-size:12px;font-weight:600;}
.rr-flow-dg .d-mono{font-family:var(--vp-font-family-mono);font-size:11px;}
.rr-flow-dg .op-accent{stroke:var(--vp-c-brand-2);}
.rr-flow-dg .rs-stroke{stroke:var(--vp-c-text-3);}
.rr-flow-dg .op-fill{fill:var(--vp-c-brand-2);}
.rr-flow-dg .rs-fill{fill:var(--vp-c-text-3);}
.rr-flow-dg .life{opacity:0.3;stroke-width:1;}
</style>

<svg class="rr-flow-dg" role="img" aria-labelledby="refresh-rotation-flow-title" viewBox="0 0 760 452" style="width:100%;height:auto;max-width:760px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="refresh-rotation-flow-title">Refresh-token rotation: each exchange invalidates the presented token and mints a new one in the same chain, and replaying an already-rotated token is detected as reuse and revokes the whole chain.</title>
  <line class="life" x1="110" y1="68" x2="110" y2="438"/>
  <line class="life op-accent" x1="380" y1="68" x2="380" y2="438"/>
  <line class="life rs-stroke" x1="650" y1="68" x2="650" y2="438"/>
  <rect x="35" y="14" width="150" height="30" rx="5"/>
  <rect class="op-accent" x="305" y="14" width="150" height="30" rx="5"/>
  <rect class="rs-stroke" x="575" y="14" width="150" height="30" rx="5"/>
  <text class="d-actor" x="110" y="33" text-anchor="middle">RP / client</text>
  <text class="d-actor op-fill" x="380" y="33" text-anchor="middle">OP</text>
  <text class="d-actor rs-fill" x="650" y="33" text-anchor="middle">Attacker</text>
  <text class="d-cap" x="110" y="58" text-anchor="middle">renews tokens</text>
  <text class="d-cap op-fill" x="380" y="58" text-anchor="middle">this library</text>
  <text class="d-cap rs-fill" x="650" y="58" text-anchor="middle">stole rt1</text>

  <path d="M110,100 H380"/>
  <path d="M373,96 L380,100 L373,104"/>
  <text class="d-mono" x="245" y="92" text-anchor="middle">POST /token · grant_type=authorization_code</text>

  <path d="M380,140 H110"/>
  <path d="M117,136 L110,140 L117,144"/>
  <text class="d-mono" x="245" y="132" text-anchor="middle">200 · access_token · refresh_token: rt1</text>

  <text class="d-mono rs-fill" x="245" y="166" text-anchor="middle">access_token expires</text>

  <path d="M110,196 H380"/>
  <path d="M373,192 L380,196 L373,200"/>
  <text class="d-mono" x="245" y="188" text-anchor="middle">grant_type=refresh_token · refresh_token=rt1</text>

  <path class="op-accent" d="M380,211 h16 v12 h-16"/>
  <path class="op-accent" d="M387,215 L380,219 L387,223"/>
  <text class="d-prose op-fill" x="404" y="208">Rotate refresh token</text>
  <text class="d-mono" x="404" y="220">invalidate rt1 · mint rt2 (same chain)</text>

  <path d="M380,256 H110"/>
  <path d="M117,252 L110,256 L117,260"/>
  <text class="d-mono" x="245" y="248" text-anchor="middle">200 · access_token · refresh_token: rt2</text>

  <path d="M110,292 H380"/>
  <path d="M373,288 L380,292 L373,296"/>
  <text class="d-mono" x="245" y="284" text-anchor="middle">grant_type=refresh_token · refresh_token=rt2</text>

  <path d="M380,328 H110"/>
  <path d="M117,324 L110,328 L117,332"/>
  <text class="d-mono" x="245" y="320" text-anchor="middle">200 · access_token · refresh_token: rt3</text>

  <text class="d-mono rs-fill" x="515" y="354" text-anchor="middle">attacker steals rt1</text>

  <path class="rs-stroke" d="M650,384 H380"/>
  <path class="rs-stroke" d="M387,380 L380,384 L387,388"/>
  <text class="d-mono rs-fill" x="515" y="376" text-anchor="middle">replay refresh_token=rt1 (already consumed)</text>

  <path class="op-accent" d="M380,401 h16 v12 h-16"/>
  <path class="op-accent" d="M387,405 L380,409 L387,413"/>
  <text class="d-prose op-fill" x="404" y="398">Reuse detected → revoke chain</text>
  <text class="d-mono" x="404" y="410">RevokeChain(rt1..rt3) · refresh.replay_detected</text>
</svg>

::: warning Reuse detection invalidates the chain
If a previously-rotated refresh token is presented again, the OP treats it as a stolen-credential signal and **revokes the entire chain** — both the stolen token and the legitimate token derived from it. Both parties have to re-authenticate. This is intentional: it's the strongest signal the OP can give that something has gone wrong.
:::

::: details Rotation, reuse detection, family revocation — what's that?
Three terms that get used interchangeably in blog posts but mean different things in this codebase:

- **Rotation** — the *normal* successful path. Each `grant_type=refresh_token` returns a new refresh token and invalidates the previous one. Single-use by default.
- **Reuse detection** — the OP saw an already-rotated refresh token come back. That can only happen if it leaked, was caught by malware, or a confused client kept a copy. The library treats it as theft.
- **Family revocation** (also called *chain revocation*) — the OP's response to reuse: every refresh token in the same lineage as the offending one is invalidated, including the legitimate descendant the real client is currently using. The next legitimate refresh fails, the user re-authenticates, and the attacker's stolen token is dead too.

This is mandated by RFC 9700 §2.2.2 for public clients and is how the library treats every refresh chain regardless of client type.
:::

## Grace period

A racing legitimate client (e.g. a tab that double-fetched the same refresh) would otherwise hit reuse detection. `op.WithRefreshGracePeriod(d)` widens the rotation acceptance window:

```go
op.WithRefreshGracePeriod(2 * time.Second)
```

Within `d` seconds of a successful rotation, the previous token still returns the *same* new token (idempotent). After `d` seconds, replay is treated as theft.

::: details Acceptance window — what's that, and why it's not a security hole
The grace period is sometimes called an **acceptance window**: the OP accepts the previous refresh token *as if it were still current*, but only for the same idempotent answer it already gave the legitimate client. It's not a relaxation of single-use — the OP doesn't issue *new* tokens during the window, it just keeps replaying the *same* fresh pair to absorb retries from a flaky network. Once the window closes, the previous token reverts to "already rotated → reuse → revoke chain." Pass zero to disable replay entirely (strict single-use); the cost is occasional false-positive chain revocations on mobile networks.
:::

::: tip Default is 60 seconds
The default grace period is **60 seconds** (`refresh.GraceTTLDefault`) when `WithRefreshGracePeriod` is not supplied. Pass `op.WithRefreshGracePeriod(0)` to disable grace entirely (strict single-use), or a positive duration to set the window explicitly. Negative values are rejected at construction time. The OFCS refresh-token regression test waits ~32 s between rotation and retry, so any grace below that range will regress conformance.

Under `profile.FAPI2Baseline` and `profile.FAPI2MessageSigning`, an explicitly configured non-zero grace window is rejected at `op.New`. Remove `WithRefreshGracePeriod` or set it to zero before enabling either profile. `profile.FAPICIBA` does not apply this refresh-grace gate.
:::

## TTL buckets

| Option | Default | Applies to |
|---|---|---|
| `op.WithRefreshTokenTTL(d)` | 30 days | Conventional refresh tokens. |
| `op.WithRefreshTokenOfflineTTL(d)` | inherits `WithRefreshTokenTTL` | Refresh tokens issued under the `offline_access` scope. |

Splitting the buckets lets `offline_access` carry an operationally observable difference (longer lifetime for stay-signed-in flows) while conventional refresh keeps a shorter rotation cadence.

## Issuance gate

By default a refresh token is issued only when **both** conditions hold:

1. The client lists `refresh_token` in its `GrantTypes`.
2. The granted scope contains `openid` (refresh tokens are an OIDC construct in this library).

Drop either and the token endpoint (`/token`) succeeds with `access_token` + `id_token` and **no `refresh_token` field** — exactly mirroring the "client has no refresh_token grant" path. The RP must re-authenticate the user when the access token expires.

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
