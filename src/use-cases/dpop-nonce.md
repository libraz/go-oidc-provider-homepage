---
title: DPoP nonce flow
description: RFC 9449 §8 / §9 — optional server-supplied nonce in DPoP proofs to make pre-computed proof attacks harder.
pageClass: pg-use-cases-dpop-nonce
---

# Use case — DPoP nonce flow

## What is DPoP, and what is the "nonce"?

**DPoP** ("Demonstrating Proof of Possession", RFC 9449) binds an access token to a key the client owns. On every API call the client attaches a `DPoP:` header carrying a fresh JWT signed with that key, proving "I'm still the same client that minted this token". A leaked DPoP-bound token is useless to an attacker who doesn't have the key.

The **nonce** is an optional hardening step from RFC 9449 §8 / §9. When a server requires one, it supplies a value that the client must include in subsequent proofs. The client may reuse an accepted nonce until the server supplies a new one, so the nonce is not a new value for every request and is not the replay detector by itself. Replay detection uses the proof's unique `jti` and server-side tracking; a nonce makes proofs prepared before the server's challenge harder to use.

::: details Specs referenced on this page
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP, §8 (server-provided nonce), §9 (resource-server-provided nonce)
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — nonce permitted
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-message-signing-2_0.html) — message-signing profile document; this library adds a nonce-source constraint when DPoP is active
:::

::: details Quick refresher
- **DPoP proof** — a small JWT the client signs per-request to prove it still holds the private key the access token is bound to. See [Sender constraint](/concepts/sender-constraint) for the basics.
- **Pre-computed proof attack** — an adversary that briefly accesses a client's machine could exfiltrate a stash of valid proofs and replay them later. The server's `jti` replay check remains the primary reuse defense; a required nonce also prevents proofs prepared before the server supplied an accepted value.
:::

In short, the nonce flow blocks two classes of attack:

- **Pre-computed proofs** — when a nonce is required, proofs prepared before the server supplied an accepted value fail until the client obtains that value; `jti` tracking handles reuse of an accepted proof.
- **Stage-and-fire** — proofs prepared against an old nonce fail after the OP stops accepting that value.

> **Source:** [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce)

## The flow

<figure class="fig">
  <div class="fig-head">One nonce challenge, then reuse of the accepted value</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-dpopnonce-title" viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dpopnonce-title">The OP refuses the first proof with use_dpop_nonce and hands back a nonce in a header. The client rebuilds the proof with that nonce and succeeds; later proofs may reuse the accepted value until the OP supplies a new one, and successful responses need not carry a DPoP-Nonce header.</title>
    <line class="fg-life" x1="200" y1="72" x2="200" y2="390"/>
    <line class="fg-life fg-life--accent" x1="700" y1="72" x2="700" y2="390"/>
    <rect class="fg-box" x="110" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t" x="200" y="44" text-anchor="middle">RP / client</text>
    <text class="fg-mxs" x="200" y="59" text-anchor="middle">holds priv_dpop</text>
    <rect class="fg-box fg-box--accent" x="610" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t fg-accent" x="700" y="44" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="700" y="59" text-anchor="middle">go-oidc-provider</text>
    <circle class="fg-badge" cx="15" cy="112" r="8.5"/>
    <text class="fg-badge-t" x="15" y="115" text-anchor="middle">1</text>
    <path class="fg-edge" d="M200,112 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="450" y="92" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
    <text class="fg-xs" x="450" y="105" text-anchor="middle">no nonce yet — the client cannot know one</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="158" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="161" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--warn fg-edge--accent" d="M700,158 H200" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="450" y="138" text-anchor="middle">400 use_dpop_nonce</text>
    <text class="fg-mxs" x="450" y="151" text-anchor="middle">DPoP-Nonce: nonce-1</text>
    <circle class="fg-badge" cx="15" cy="196" r="8.5"/>
    <text class="fg-badge-t" x="15" y="199" text-anchor="middle">3</text>
    <path class="fg-edge" d="M200,188 h28 v16 h-28" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="192">rebuild the proof</text>
    <text class="fg-mxs" x="240" y="205">with nonce = nonce-1</text>
    <circle class="fg-badge" cx="15" cy="242" r="8.5"/>
    <text class="fg-badge-t" x="15" y="245" text-anchor="middle">4</text>
    <path class="fg-edge" d="M200,242 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="450" y="236" text-anchor="middle">POST /token · DPoP: &lt;proof, nonce-1&gt;</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="288" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="291" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--accent" d="M700,288 H200" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="450" y="268" text-anchor="middle">200 · access_token, DPoP-bound</text>
    <text class="fg-mxs" x="450" y="281" text-anchor="middle">nonce-1 remains accepted; no new header required</text>
    <circle class="fg-badge" cx="15" cy="330" r="8.5"/>
    <text class="fg-badge-t" x="15" y="333" text-anchor="middle">6</text>
    <path class="fg-edge" d="M200,330 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="450" y="324" text-anchor="middle">GET /userinfo · DPoP: &lt;proof, nonce-1&gt;</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="376" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="379" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M700,376 H200" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="450" y="356" text-anchor="middle">200 · { user claims }</text>
    <text class="fg-mxs" x="450" y="369" text-anchor="middle">no DPoP-Nonce header on this success</text>
  </svg>
  <figcaption class="fig-note">The first rejection is not a failure to handle specially — it is the handshake. A client that treats <code>use_dpop_nonce</code> as a normal error will retry forever; one that reads the header succeeds on the next attempt.</figcaption>
</figure>

The OP challenges a request that lacks an accepted nonce, or whose nonce is no longer accepted. After the client retries with the returned value, it can reuse that nonce until the OP supplies a new one; successful responses do not need to carry a `DPoP-Nonce` header.

`nonce` and `jti` serve different purposes. `jti` is a unique proof identifier, and the library's consumed-JTI store rejects a proof that is used again. A configured nonce source adds a server-accepted value to the proof and can rotate the current and previous values.

## Wiring

The library ships an in-memory reference source. Single-process; not HA-safe, but fine for development and small-scale deployments:

```go
import "github.com/libraz/go-oidc-provider/op"

src, err := op.NewInMemoryDPoPNonceSource(ctx, 5*time.Minute)
if err != nil { /* ... */ }

op.New(
  /* required options */
  op.WithFeature(feature.DPoP),
  op.WithDPoPNonceSource(src),
)
```

The rotation interval (`5*time.Minute` above) is how often the "current" nonce changes. The OP accepts both the current and previous values, so a client racing through a rotation boundary doesn't see a hard failure.

::: warning Multi-instance deployments
A process-local nonce source breaks across replicas — instance B has no record of the nonce instance A issued. Production HA deployments plug a shared store (Redis) behind a custom `DPoPNonceSource`. The library deliberately doesn't ship a Redis nonce source: the option matrix (TTL, rotation cadence, missed-rotation tolerance) is too deployment-specific to standardise.
:::

## When the OP demands the nonce

| Endpoint | Nonce required? | Set by |
|---|---|---|
| `/token` | when a DPoP proof is presented and a `DPoPNonceSource` is configured | `op.WithDPoPNonceSource` |
| `/userinfo` | when a DPoP proof is presented and a `DPoPNonceSource` is configured | same |
| `/par` | when a DPoP proof is presented and a `DPoPNonceSource` is configured | same |
| `/device_authorization` | when a DPoP proof is presented and a `DPoPNonceSource` is configured | same |
| `/bc-authorize` (CIBA) | when a DPoP proof is presented and a `DPoPNonceSource` is configured | same |

`/par` and `/token` apply the same nonce challenge and validation, so an SPA that pushes authorization requests runs the same nonce-retry loop at `/par` that it already runs at `/token`.

Whenever a request presents a `DPoP` header, every endpoint in the table requires exactly one value. Multiple values are malformed and rejected, including an empty first value followed by a valid proof; the OP never selects a later value or silently treats the request as proof-less.

In this library, the FAPI 2.0 Message Signing profile requires a DPoP nonce source when DPoP is active, while `profile.FAPI2Baseline` leaves the source optional. The live FAPI 2.0 Security Profile permits nonce use; these profile-specific requirements are library constraints.

## Verifying

```sh
# First call without nonce
curl -i -X POST -H "DPoP: <proof-without-nonce>" \
  -d 'grant_type=authorization_code&code=...' \
  http://localhost:8080/oidc/token | head -20
# HTTP/1.1 400 Bad Request
# DPoP-Nonce: <fresh-nonce>
# {"error":"use_dpop_nonce", ...}
```

The `DPoP-Nonce` value goes into the next proof's `nonce` claim.

## Read next

- [Sender constraint](/concepts/sender-constraint) — why DPoP exists at all.
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — the library profile where a DPoP nonce source remains optional.
