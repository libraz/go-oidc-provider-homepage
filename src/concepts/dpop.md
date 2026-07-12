---
title: DPoP (RFC 9449)
description: Demonstrating Proof of Possession — bind an access token (and optionally a refresh token) to a client-held key so a leaked token alone is useless.
---

# DPoP — Demonstrating Proof of Possession

**DPoP** (RFC 9449) binds an access token to a key the client holds. Without a fresh proof signed by the same key, a leaked access token is unusable. Every API call carries a small per-request JWT (the *DPoP proof*) that the OP and resource server verify in addition to the token itself.

DPoP is purely an HTTP-layer mechanism. The client does not need TLS client certificates, the OP does not need to know about reverse-proxy header layouts, and the same flow works for SPAs, mobile apps, and backend services. That portability is the reason FAPI 2.0 Baseline lists DPoP as one of the two acceptable sender-constraint mechanisms (the other is [mTLS](/concepts/mtls)).

::: details Specs referenced on this page
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP (Demonstrating Proof of Possession)
- [RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638) — JWK Thumbprint
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-2_0-message-signing.html)
:::

## How a DPoP proof works

A DPoP proof is a JWT (RFC 9449 §4) signed with a private key the client controls. The client mints a fresh proof per request.

**JOSE header**

| Field | Value |
|---|---|
| `typ` | `dpop+jwt` (mandatory) |
| `alg` | `ES256`, `EdDSA`, or `PS256` (the library's allow-list, see `internal/dpop/proof.go`) |
| `jwk` | Public part of the signing key, embedded in the header |

**Payload claims**

| Claim | Meaning |
|---|---|
| `htm` | HTTP method of the request (`POST`, `GET`, …). Pinned to this exact request. |
| `htu` | HTTP target URI with query / fragment stripped. Stops a proof for `/orders` from being replayed against `/admin/payouts`. |
| `iat` | Time the proof was signed. Rejected if outside the OP's freshness window (default 60 s, see `dpop.DefaultIatWindow`). |
| `jti` | Unique random value per proof. Cached by the OP for the freshness window so the same proof cannot be replayed. |
| `ath` | Optional. SHA-256 of the access token, required when the proof is presented alongside an access token (RFC 9449 §4.2). |
| `nonce` | Optional. Server-supplied value when the OP runs the §8 / §9 nonce flow. |

<style scoped>
.dpop-flow-dg text{stroke:none;fill:currentColor;}
.dpop-flow-dg .d-actor{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;}
.dpop-flow-dg .d-cap{font-family:var(--vp-font-family-mono);font-size:10px;}
.dpop-flow-dg .d-prose{font-family:var(--vp-font-family-base);font-size:12px;font-weight:600;}
.dpop-flow-dg .d-mono{font-family:var(--vp-font-family-mono);font-size:11px;}
.dpop-flow-dg .op-accent{stroke:var(--vp-c-brand-2);}
.dpop-flow-dg .rs-stroke{stroke:var(--vp-c-text-3);}
.dpop-flow-dg .op-fill{fill:var(--vp-c-brand-2);}
.dpop-flow-dg .rs-fill{fill:var(--vp-c-text-3);}
.dpop-flow-dg .life{opacity:0.3;stroke-width:1;}
</style>

<svg class="dpop-flow-dg" role="img" aria-labelledby="dpop-proof-flow-title" viewBox="0 0 760 556" style="width:100%;height:auto;max-width:760px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="dpop-proof-flow-title">Sequence of a DPoP proof: the client signs a per-request proof, the OP binds cnf.jkt into the access token, and the resource server re-checks the proof against the binding.</title>
  <line class="life" x1="110" y1="68" x2="110" y2="540"/>
  <line class="life op-accent" x1="380" y1="68" x2="380" y2="540"/>
  <line class="life rs-stroke" x1="650" y1="68" x2="650" y2="540"/>
  <rect x="35" y="14" width="150" height="30" rx="5"/>
  <rect class="op-accent" x="305" y="14" width="150" height="30" rx="5"/>
  <rect class="rs-stroke" x="575" y="14" width="150" height="30" rx="5"/>
  <text class="d-actor" x="110" y="33" text-anchor="middle">RP / client</text>
  <text class="d-actor op-fill" x="380" y="33" text-anchor="middle">OP</text>
  <text class="d-actor rs-fill" x="650" y="33" text-anchor="middle">Resource server</text>
  <text class="d-cap" x="110" y="58" text-anchor="middle">holds priv_dpop</text>
  <text class="d-cap op-fill" x="380" y="58" text-anchor="middle">this library</text>
  <text class="d-cap rs-fill" x="650" y="58" text-anchor="middle">verifies binding</text>
  <path d="M110,99 h16 v12 h-16"/>
  <path d="M117,107 L110,111 L117,115"/>
  <text class="d-prose" x="134" y="96">Build &amp; sign DPoP proof</text>
  <text class="d-mono" x="134" y="108">jti · htm:POST · htu:/token · iat</text>
  <text class="d-mono" x="134" y="120">hdr: typ dpop+jwt · alg ES256 · jwk</text>
  <path d="M110,160 H380"/>
  <path d="M373,156 L380,160 L373,164"/>
  <text class="d-mono" x="245" y="152" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
  <path class="op-accent" d="M380,199 h16 v12 h-16"/>
  <path class="op-accent" d="M387,207 L380,211 L387,215"/>
  <text class="d-prose op-fill" x="404" y="201">Verify proof</text>
  <text class="d-mono" x="404" y="213">typ/alg/jwk, htm/htu, iat, jti, nonce</text>
  <path class="op-accent" d="M380,252 h16 v12 h-16"/>
  <path class="op-accent" d="M387,260 L380,264 L387,268"/>
  <text class="d-prose op-fill" x="404" y="254">Bind access token</text>
  <text class="d-mono" x="404" y="266">cnf.jkt = SHA-256(jwk thumbprint)</text>
  <path d="M380,312 H110"/>
  <path d="M117,308 L110,312 L117,316"/>
  <text class="d-mono" x="245" y="304" text-anchor="middle">200 · access_token · token_type: DPoP</text>
  <path d="M110,351 h16 v12 h-16"/>
  <path d="M117,359 L110,363 L117,367"/>
  <text class="d-prose" x="134" y="353">Build new proof for the API call</text>
  <text class="d-mono" x="134" y="365">adds ath = SHA-256(access_token)</text>
  <path d="M110,417 H650"/>
  <path d="M643,413 L650,417 L643,421"/>
  <text class="d-mono" x="380" y="409" text-anchor="middle">GET /api · Authorization: DPoP · DPoP: &lt;proof&gt;</text>
  <path class="rs-stroke" d="M650,456 h-16 v12 h16"/>
  <path class="rs-stroke" d="M643,464 L650,468 L643,472"/>
  <text class="d-prose rs-fill" x="626" y="458" text-anchor="end">Verify proof</text>
  <text class="d-mono" x="626" y="470" text-anchor="end">+ cnf.jkt == proof.jwk thumbprint</text>
  <path d="M650,520 H110"/>
  <path d="M117,516 L110,520 L117,524"/>
  <text class="d-mono" x="380" y="512" text-anchor="middle">200 OK</text>
</svg>

The OP and the RS run the same checklist. The RS additionally verifies that the proof's `jwk` thumbprint equals the access token's `cnf.jkt`.

DPoP-bound access tokens must be presented with `Authorization: DPoP <token>`, not `Authorization: Bearer <token>`. The OP enforces this on `/userinfo`: a sender-constrained token under the Bearer scheme is rejected even if the token bytes are otherwise valid, because RFC 9449 §7.1 makes the scheme part of the proof-of-possession contract.

## Confirmation claim — `cnf.jkt`

The first proof at `/token` pins the binding. The OP computes a SHA-256 thumbprint of the proof's `jwk` (RFC 7638 fixes the canonical fields that go into the digest) and writes it into the issued access token as `cnf.jkt`. Every subsequent request that uses this access token must carry a proof signed by **the same key**, so the RS can recompute the thumbprint and compare.

`cnf` is a JSON object; the *member name* tells the RS what kind of binding was used (RFC 7800). For DPoP the member is `jkt`. mTLS uses `x5t#S256` instead — the two never co-exist on the same token.

::: details Why a thumbprint and not the raw key?
The thumbprint is a stable, short identifier that survives JSON re-encoding. RFC 7638 specifies exactly which JWK fields go into the hash and in which order, so a client and a server compute the same digest for the same key without having to agree on whitespace or member ordering. Embedding the raw key would inflate the access token; the thumbprint costs 32 bytes (43 base64url characters).
:::

## Replay defenses

DPoP layers four independent gates so an attacker who captured a single proof gains nothing:

- **`jti` deduplication.** The OP threads every accepted proof's `jti` through `store.ConsumedJTIStore.Mark` (see `internal/dpop/verify.go`). A repeated `jti` inside the freshness window returns `ErrProofReplayed` and the request fails. The store is the same one PAR / JAR replay defenses use, so a single Redis substore covers all three.
- **`iat` window.** Proofs older or further in the future than `DefaultIatWindow` (60 seconds, symmetric) are rejected with `ErrProofIatWindow`. The window is short on purpose: it caps how long a stolen proof remains useful even if the `jti` cache is wiped.
- **`htm` + `htu` match.** A proof for one method or URL cannot be presented against another endpoint. The OP folds both sides through the RFC 9449 §4.3 canonical form (lower-cased scheme / host, default port stripped, query / fragment removed) before comparing.
- **`ath` binding.** When a proof is paired with an access token, the proof must carry `ath = SHA-256(access_token)`. A proof minted for a different access token fails `ErrProofATHMismatch`.

The combined effect: even the legitimate client cannot replay a proof it already used. An attacker who exfiltrates a stash of valid proofs is blocked by the `jti` cache; an attacker who exfiltrates the access token is blocked by the missing key; an attacker who scripts proofs for one endpoint cannot pivot to another.

## Server-supplied nonce (RFC 9449 §8 / §9)

The four claims above all come from the client's clock. A short-lived compromise of the client could yield a stash of pre-signed proofs that are valid for the full `iat` window. RFC 9449 §8 / §9 closes that gap with a server-supplied nonce.

When a `DPoPNonceSource` is configured, the OP issues a fresh nonce in the `DPoP-Nonce` response header. The next proof must include it as the `nonce` claim. Pre-computed proofs immediately become invalid because the attacker cannot predict the next nonce.

The library ships an in-memory reference implementation (`op.NewInMemoryDPoPNonceSource`) suitable for single-process deployments. Multi-replica HA deployments plug a shared store behind a custom `DPoPNonceSource`. FAPI 2.0 Message Signing forces the nonce on; FAPI 2.0 Baseline allows it.

See [DPoP nonce flow](/use-cases/dpop-nonce) for the full wiring, the rotation pipeline, and the multi-instance considerations.

## What this library binds

Access tokens are always DPoP-bound when `feature.DPoP` is enabled and the client presents a proof at `/token` (or pre-commits a key via `dpop_jkt` on the authorize / PAR request).

Refresh tokens follow [Design judgment #15](/security/design-judgments#dj-15) — bind for public clients, leave unbound for confidential:

- **Public clients** (`token_endpoint_auth_method = "none"`, typically SPAs and native apps) get their refresh chain DPoP-bound on first issue, and the binding propagates through every rotation per RFC 9449 §5.4. A leaked refresh token is useless without the matching key — exactly the threat model RFC 9449 §1 cites.
- **Confidential clients** (`private_key_jwt`, `client_secret_*`) leave the refresh chain unbound. They can rotate DPoP keys per request (the OFCS plans exercise this) without locking the chain to a single key for its lifetime. The access tokens minted on each refresh are still bound to the key presented on that exchange, so the leak surface is limited to the access token.

The trade-off is explicit: confidential clients gain key-rotation flexibility at the cost of leaving the refresh chain as a raw bearer secret. Confidential clients already authenticate to the token endpoint with a long-lived asymmetric credential, so a refresh-token leak alone does not let an attacker mint new tokens.

## `dpop_jkt` request parameter

RFC 9449 §10 lets a public client include `dpop_jkt=<thumbprint>` on the authorize (or PAR) request to pre-commit which DPoP key the issued access token will be bound to. This closes a window where a malicious code-substitution attacker could redeem the code with their own key. FAPI 2.0 Baseline does not require this parameter (mTLS or DPoP at the token endpoint is sufficient); browsers driving public clients with PKCE typically rely on PAR + DPoP at the token endpoint instead.

The library threads `dpop_jkt` through PAR (`internal/parendpoint/par.go`): if the PAR request carries a DPoP proof, the OP stamps the thumbprint into the snapshot and rejects a `/token` exchange that arrives with a different key.

## Wiring

Minimal DPoP-only wiring:

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
)

op.New(
  /* required options */
  op.WithFeature(feature.DPoP),
)
```

With the §8 / §9 nonce flow:

```go
import (
  "context"
  "time"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
)

src, err := op.NewInMemoryDPoPNonceSource(ctx, 5*time.Minute)
if err != nil { /* ... */ }

op.New(
  /* required options */
  op.WithFeature(feature.DPoP),
  op.WithDPoPNonceSource(src),
)
```

`op.WithProfile(profile.FAPI2Baseline)` auto-enables PAR and JAR, then imposes a `RequiredAnyOf` constraint over `feature.DPoP` and `feature.MTLS`. When neither sender binding is configured, `op.New` selects DPoP as the default member; if the embedder explicitly enables `feature.MTLS`, that choice satisfies the constraint and DPoP is not added.

## When DPoP shines

- **SPAs and mobile apps** — the client can hold a key in memory or in the platform's secure storage. No CA infrastructure required.
- **First-party APIs** — when you control both the RP and the RS, you can adopt DPoP without coordinating with PKI operations.
- **Heterogeneous estates** — DPoP works over plain HTTPS; you can deploy it without touching the TLS terminator.
- **Defending against log / proxy leaks** — sender constraint plus the `jti` cache and `iat` window combine to make a token leak structurally unusable.

## When DPoP doesn't shine

- **Backend services with established PKI** — if every service already has a client certificate issued by an internal CA, [mTLS](/concepts/mtls) reuses that infrastructure without introducing a new key-management surface.
- **Clients that cannot sign per request** — every API call costs a fresh JWS. Constrained devices that reuse a single channel might prefer mTLS, where the binding lives at the TLS layer.
- **Strict regulatory regimes that have already standardised on mTLS** — some open-banking jurisdictions deploy mTLS as the only acceptable channel. Check the local profile before adding DPoP on top.

## Read next

- [mTLS (RFC 8705)](/concepts/mtls) — the alternative sender-constraint mechanism, bound to a TLS certificate.
- [Sender constraint — selection guide](/concepts/sender-constraint) — comparison table and when to pick which.
- [DPoP nonce flow](/use-cases/dpop-nonce) — full wiring for the §8 / §9 nonce pipeline.
- [Design judgments](/security/design-judgments) — the public / confidential refresh-binding split and other resolved spec tensions.
