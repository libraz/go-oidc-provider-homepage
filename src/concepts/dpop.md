---
title: DPoP (RFC 9449)
description: Demonstrating Proof of Possession — bind an access token (and optionally a refresh token) to a client-held key so a leaked token alone is useless.
pageClass: pg-concepts-dpop
---

# DPoP — Demonstrating Proof of Possession

**DPoP** (RFC 9449) binds an access token to a key the client holds. Without a fresh proof signed by the same key, a leaked access token is unusable. Every API call carries a small per-request JWT (the *DPoP proof*) that the OP and resource server verify in addition to the token itself.

DPoP is purely an HTTP-layer mechanism. The client does not need TLS client certificates, the OP does not need to know about reverse-proxy header layouts, and the same flow works for SPAs, mobile apps, and backend services. That portability is the reason the FAPI 2.0 Security Profile lists DPoP as one of the two acceptable sender-constraint mechanisms (the other is [mTLS](/concepts/mtls)). The Security Profile itself applies to confidential clients; the public-client examples later on this page describe the library's general OAuth behavior.

::: details Specs referenced on this page
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP (Demonstrating Proof of Possession)
- [RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638) — JWK Thumbprint
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — Final
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-message-signing-2_0.html) — Final
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
| `iat` | Time the proof was signed. Rejected if outside the OP's freshness window (60 seconds by default). |
| `jti` | Unique random value per proof. Cached by the OP for the freshness window so the same proof cannot be replayed. |
| `ath` | Optional. SHA-256 of the access token, required when the proof is presented alongside an access token (RFC 9449 §4.2). |
| `nonce` | Optional. Server-supplied value when the OP runs the §8 / §9 nonce flow. |

<figure class="fig">
  <div class="fig-head">One proof per request, checked twice</div>
  <svg class="fig-svg" role="img" aria-labelledby="dpop-proof-flow-title" viewBox="0 0 960 736" xmlns="http://www.w3.org/2000/svg">
    <title id="dpop-proof-flow-title">A DPoP proof end to end. The client signs a fresh proof for every request, the OP verifies it and writes the key's thumbprint into the access token as cnf.jkt, and the resource server re-checks a later proof against that same binding.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="712"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="712"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="712"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP / client</text>
    <text class="fg-mxs" x="192" y="72" text-anchor="middle">holds priv_dpop</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Resource server</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">re-checks the binding</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="32" cy="140" r="12"/>
    <text class="fg-badge-t" x="32" y="145.5" text-anchor="middle">1</text>
    <path class="fg-edge" d="M192,128 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="134">build and sign a proof</text>
    <text class="fg-mxs" x="248" y="156">jti · htm · htu · iat · jwk</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="32" cy="216" r="12"/>
    <text class="fg-badge-t" x="32" y="221.5" text-anchor="middle">2</text>
    <path class="fg-edge" d="M192,216 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="206" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
    <!-- 3 -->
    <circle class="fg-badge fg-badge--accent" cx="32" cy="268" r="12"/>
    <text class="fg-badge-t fg-badge-t--accent" x="32" y="273.5" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--accent" d="M512,256 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="262">verify the proof</text>
    <text class="fg-mxs" x="568" y="284">typ/alg/jwk · htm/htu</text>
    <text class="fg-mxs" x="568" y="306">iat · jti · nonce</text>
    <!-- 4 -->
    <circle class="fg-badge fg-badge--accent" cx="32" cy="364" r="12"/>
    <text class="fg-badge-t fg-badge-t--accent" x="32" y="369.5" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M512,352 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="568" y="358">bind the key to the token</text>
    <text class="fg-mxs" x="568" y="380">cnf.jkt = thumbprint(jwk)</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="32" cy="424" r="12"/>
    <text class="fg-badge-t" x="32" y="429.5" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--accent" d="M512,424 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="414" text-anchor="middle">200 · token_type: DPoP</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="32" cy="476" r="12"/>
    <text class="fg-badge-t" x="32" y="481.5" text-anchor="middle">6</text>
    <path class="fg-edge" d="M192,464 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="470">mint a fresh proof</text>
    <text class="fg-mxs" x="248" y="492">+ ath = SHA-256(token)</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="32" cy="568" r="12"/>
    <text class="fg-badge-t" x="32" y="573.5" text-anchor="middle">7</text>
    <path class="fg-edge" d="M192,568 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="534" text-anchor="middle">GET /api</text>
    <text class="fg-mxs fg-halo" x="508" y="556" text-anchor="middle">Authorization: DPoP &lt;token&gt; · DPoP: &lt;proof&gt;</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="32" cy="620" r="12"/>
    <text class="fg-badge-t" x="32" y="625.5" text-anchor="middle">8</text>
    <path class="fg-edge" d="M824,608 h-40 v24 h40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="768" y="614" text-anchor="end">verify proof, then binding</text>
    <text class="fg-mxs" x="768" y="636" text-anchor="end">cnf.jkt == thumbprint(jwk)</text>
    <!-- 9 -->
    <circle class="fg-badge" cx="32" cy="688" r="12"/>
    <text class="fg-badge-t" x="32" y="693.5" text-anchor="middle">9</text>
    <path class="fg-edge" d="M824,688 H192" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="678" text-anchor="middle">200 OK</text>
  </svg>
  <figcaption class="fig-note">The token that comes back at step 5 is useless on its own: without a proof signed by the key behind <code>cnf.jkt</code>, step 8 fails. That is the whole trade — an extra signature per request, in exchange for a stolen token being worthless.</figcaption>
</figure>

The OP and the RS run the same checklist. The RS additionally verifies that the proof's `jwk` thumbprint equals the access token's `cnf.jkt`.

DPoP-bound access tokens must be presented with `Authorization: DPoP <token>`, not `Authorization: Bearer <token>`. The OP enforces this on `/userinfo`: a sender-constrained token under the Bearer scheme is rejected even if the token bytes are otherwise valid, because RFC 9449 §7.1 makes the scheme part of the proof-of-possession contract. The rejection is `401` with `WWW-Authenticate: DPoP error="invalid_token"`; the library uses `invalid_token` rather than the spec's `invalid_dpop_proof` so clients that follow the Bearer error taxonomy keep working.

The `DPoP` proof header is single-valued. The OP rejects multiple `DPoP` header values, including an empty first value followed by a valid proof; it does not select a later value or silently fall back to the bearer path. The shared gate applies this rule at `/par`, `/token`, `/device_authorization`, and `/bc-authorize` (CIBA), and proof verification applies it at `/userinfo` as well.

## Confirmation claim — `cnf.jkt`

The first proof at `/token` pins the binding. The OP computes the RFC 7638 JWK thumbprint of the proof's `jwk` (the RFC fixes the canonical fields that go into the SHA-256 digest) and writes it into the issued access token as `cnf.jkt`. Every subsequent request that uses this access token must carry a proof signed by **the same key**, so the RS can recompute the thumbprint and compare.

`cnf` is a JSON object; the *member name* tells the RS what kind of binding was used (RFC 7800). For DPoP the member is `jkt`; mTLS uses `x5t#S256`. A token can carry both members. Where both bindings are present, the consuming endpoint must enforce both: the DPoP proof must match `jkt` and the presented certificate must match `x5t#S256`. The library applies this conjunction at `/userinfo`; device-code and CIBA grant binding checks likewise require every recorded method.

::: details Why a thumbprint and not the raw key?
The thumbprint is a stable, short identifier that survives JSON re-encoding. RFC 7638 specifies exactly which JWK fields go into the hash and in which order, so a client and a server compute the same digest for the same key without having to agree on whitespace or member ordering. Embedding the raw key would inflate the access token; the thumbprint costs 32 bytes (43 base64url characters).
:::

## Replay defenses

DPoP layers four independent gates so an attacker who captured a single proof gains nothing:

- **`jti` deduplication.** The OP threads every accepted proof's `jti` through `store.ConsumedJTIStore.Mark` (see `internal/dpop/verify.go`), keyed by the pair of key thumbprint and `jti`. A repeated pair inside the freshness window returns `ErrProofReplayed` and the request fails. The mark is written only after the client has authenticated, so an unauthenticated request cannot burn a legitimate proof. The store is the same one PAR / JAR replay defenses use, so a single Redis substore covers all three.
- **`iat` window.** Proofs older or further in the future than the 60-second symmetric freshness window are rejected with `ErrProofIatWindow`. The window is short on purpose: it caps how long a stolen proof remains useful even if the `jti` cache is wiped.
- **`htm` + `htu` match.** A proof for one method or URL cannot be presented against another endpoint. The OP folds both sides through the RFC 9449 §4.3 canonical form (lower-cased scheme / host, default port stripped, query / fragment removed) before comparing.
- **`ath` binding.** When a proof is paired with an access token, the proof must carry `ath = SHA-256(access_token)`. A proof minted for a different access token fails `ErrProofATHMismatch`.

The combined effect: even the legitimate client cannot replay a proof it already used. An attacker who exfiltrates a stash of valid proofs is blocked by the `jti` cache; an attacker who exfiltrates the access token is blocked by the missing key; an attacker who scripts proofs for one endpoint cannot pivot to another.

## Server-supplied nonce (RFC 9449 §8 / §9)

The four claims above all come from the client's clock. A short-lived compromise of the client could yield a stash of pre-signed proofs that are valid for the full `iat` window. RFC 9449 §8 / §9 closes that gap with a server-supplied nonce.

When a `DPoPNonceSource` is configured, the OP issues a fresh nonce in the `DPoP-Nonce` response header. The next proof must include it as the `nonce` claim. Pre-computed proofs immediately become invalid because the attacker cannot predict the next nonce.

The library ships an in-memory reference implementation (`op.NewInMemoryDPoPNonceSource`) suitable for single-process deployments. Multi-replica HA deployments plug a shared store behind a custom `DPoPNonceSource`. DPoP nonces are optional in both the Final FAPI 2.0 Security Profile and Message Signing specification; configuring this library's `DPoPNonceSource` enables the nonce challenge and validation flow. The library validator requires that source when `profile.FAPI2MessageSigning` is used with DPoP, even though the Final Message Signing specification does not.

See [DPoP nonce flow](/use-cases/dpop-nonce) for the full wiring, the rotation pipeline, and the multi-instance considerations.

## What this library binds

Access tokens are DPoP-bound when `feature.DPoP` is enabled and the client presents a proof at `/token` (or pre-commits a key via `dpop_jkt` on the authorize / PAR request). Without a proof the OP issues a bearer token, unless the profile is `FAPI2Baseline`, `FAPI2MessageSigning`, or `FAPICIBA`: those refuse the request with `invalid_request`. The refresh-token behavior below is library policy; the Final FAPI 2.0 Security Profile prohibits routine refresh-token rotation except in extraordinary circumstances, so normal library refresh behavior must be reviewed before claiming conformance.

Refresh tokens follow [Design judgment #15](/security/design-judgments#dj-15) — bind for public clients, leave unbound for confidential:

- **Public clients** (`token_endpoint_auth_method = "none"`, typically SPAs and native apps) get their refresh chain DPoP-bound on first issue, and the binding propagates through every rotation per RFC 9449 §5.4. A leaked refresh token is useless without the matching key — exactly the threat model RFC 9449 §1 cites.
- **Confidential clients** (`private_key_jwt`, `client_secret_*`) leave the refresh chain unbound. They can rotate DPoP keys per request (the OFCS plans exercise this) without locking the chain to a single key for its lifetime. The access tokens minted on each refresh are still bound to the key presented on that exchange, so the leak surface is limited to the access token.

A bound chain enforces its key on every refresh: a missing proof, or a proof from a different key, is `invalid_grant`. A refresh that presents a proof gets an access token bound to that key, including on an unbound confidential chain.

The trade-off is explicit: confidential clients gain key-rotation flexibility at the cost of leaving the refresh chain as a raw bearer secret. Their token-endpoint credential is a separate control and can itself be a shared secret, so a refresh-token leak still deserves protection through storage, transport, and operational controls.

## `dpop_jkt` request parameter

RFC 9449 §10 lets a client include `dpop_jkt=<thumbprint>` on the authorize (or PAR) request to pre-commit which DPoP key the issued access token will be bound to. This closes a window where a malicious code-substitution attacker could redeem the code with their own key. The FAPI 2.0 Security Profile does not require clients to send this parameter, but an AS using DPoP must support Authorization Code Binding to DPoP Key. Browsers driving public clients with PKCE typically rely on PAR + DPoP at the token endpoint instead.

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

`op.WithProfile(profile.FAPI2Baseline)` auto-enables PAR and JAR as library settings, then imposes a `RequiredAnyOf` constraint over `feature.DPoP` and `feature.MTLS`. JAR is optional in the Final Security Profile. When neither sender binding is configured, `op.New` selects DPoP as the default member; if the embedder explicitly enables `feature.MTLS`, that choice satisfies the constraint and DPoP is not added.

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
