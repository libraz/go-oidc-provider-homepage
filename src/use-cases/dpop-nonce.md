---
title: DPoP nonce flow
description: RFC 9449 §8 / §9 — server-supplied nonce in DPoP proofs to defeat pre-computed proof attacks.
pageClass: pg-use-cases-dpop-nonce
---

# Use case — DPoP nonce flow

## What is DPoP, and what is the "nonce"?

**DPoP** ("Demonstrating Proof of Possession", RFC 9449) binds an access token to a key the client owns. On every API call the client attaches a `DPoP:` header carrying a fresh JWT signed with that key, proving "I'm still the same client that minted this token". A leaked DPoP-bound token is useless to an attacker who doesn't have the key.

The **nonce** is an extra hardening step from RFC 9449 §8 / §9. Without it, a client can prepare DPoP proofs ahead of time and hold them; an attacker with brief access to the client could exfiltrate a stash and replay them later. The nonce closes that gap: the OP issues a fresh server-side nonce that **must** appear in the next DPoP proof. Pre-computed proofs immediately become invalid.

::: details Specs referenced on this page
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP, §8 (server-provided nonce), §9 (resource-server-provided nonce)
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — nonce permitted
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-2_0-message-signing.html) — nonce required
:::

::: details Quick refresher
- **DPoP proof** — a small JWT the client signs per-request to prove it still holds the private key the access token is bound to. See [Sender constraint](/concepts/sender-constraint) for the basics.
- **Pre-computed proof attack** — an adversary that briefly accesses a client's machine could exfiltrate a stash of valid proofs and replay them later. Without a nonce, those proofs stay valid for as long as their `iat` window allows.
:::

In short, the nonce flow blocks two classes of attack:

- **Pre-computed proofs** — an attacker that captured a proof can't replay it because they don't know the next nonce.
- **Stage-and-fire** — long-lived proofs prepared offline expire when the OP rotates its nonce.

> **Source:** [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce)

## The flow

<svg class="dpop-nonce-dg" role="img" aria-labelledby="dpop-nonce-flow-title" viewBox="0 0 760 486" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="dpop-nonce-flow-title">Sequence of the DPoP nonce handshake: the OP rejects the first proof with use_dpop_nonce and a DPoP-Nonce header, the client retries with the nonce claim, and every later call carries the newest rotating nonce.</title>
  <line class="life" x1="130" y1="68" x2="130" y2="472"/>
  <line class="life op-accent" x1="630" y1="68" x2="630" y2="472"/>
  <rect x="55" y="14" width="150" height="30" rx="5"/>
  <rect class="op-accent" x="555" y="14" width="150" height="30" rx="5"/>
  <text class="d-actor" x="130" y="33" text-anchor="middle">RP / client</text>
  <text class="d-actor op-fill" x="630" y="33" text-anchor="middle">OP</text>
  <text class="d-cap" x="130" y="58" text-anchor="middle">holds priv_dpop</text>
  <text class="d-cap op-fill" x="630" y="58" text-anchor="middle">this library</text>
  <text class="d-mono" x="380" y="98" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
  <text class="d-mono" x="380" y="111" text-anchor="middle">no nonce yet</text>
  <path d="M130,120 H630"/>
  <path d="M623,116 L630,120 L623,124"/>
  <text class="d-mono" x="380" y="150" text-anchor="middle">400 use_dpop_nonce</text>
  <text class="d-mono" x="380" y="163" text-anchor="middle">DPoP-Nonce: nonce-1</text>
  <path d="M630,172 H130"/>
  <path d="M137,168 L130,172 L137,176"/>
  <path d="M130,196 h16 v16 h-16"/>
  <path d="M137,206 L130,210 L137,214"/>
  <text class="d-prose" x="156" y="200">Rebuild the proof</text>
  <text class="d-mono" x="156" y="213">nonce = nonce-1</text>
  <text class="d-mono" x="380" y="246" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
  <text class="d-mono" x="380" y="259" text-anchor="middle">nonce = nonce-1</text>
  <path d="M130,268 H630"/>
  <path d="M623,264 L630,268 L623,272"/>
  <text class="d-mono" x="380" y="298" text-anchor="middle">200 · access_token (DPoP-bound)</text>
  <text class="d-mono" x="380" y="311" text-anchor="middle">DPoP-Nonce: nonce-2</text>
  <path d="M630,320 H130"/>
  <path d="M137,316 L130,320 L137,324"/>
  <rect class="note" x="238" y="336" width="284" height="24" rx="4"/>
  <text class="d-prose" x="380" y="352" text-anchor="middle">Every later call carries the newest nonce</text>
  <text class="d-mono" x="380" y="386" text-anchor="middle">GET /userinfo · DPoP: &lt;proof&gt;</text>
  <text class="d-mono" x="380" y="399" text-anchor="middle">nonce = nonce-2</text>
  <path d="M130,408 H630"/>
  <path d="M623,404 L630,408 L623,412"/>
  <text class="d-mono" x="380" y="438" text-anchor="middle">200 · { user claims }</text>
  <text class="d-mono" x="380" y="451" text-anchor="middle">DPoP-Nonce: nonce-3</text>
  <path d="M630,460 H130"/>
  <path d="M137,456 L130,460 L137,464"/>
</svg>

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

The rotation interval (`5*time.Minute` above) is how often the "current" nonce changes. Both current and previous values are accepted, so a client racing through a rotation boundary doesn't see a hard failure.

::: warning Multi-instance deployments
A process-local nonce source breaks across replicas — instance B has no record of the nonce instance A issued. Production HA deployments plug a shared store (Redis) behind a custom `DPoPNonceSource`. The library deliberately doesn't ship a Redis nonce source: the option matrix (TTL, rotation cadence, missed-rotation tolerance) is too deployment-specific to standardise.
:::

## When the OP demands the nonce

| Endpoint | Nonce required? | Set by |
|---|---|---|
| `/token` | always when a `DPoPNonceSource` is configured | `op.WithDPoPNonceSource` |
| `/userinfo` | always when a `DPoPNonceSource` is configured | same |
| `/par` | always when a `DPoPNonceSource` is configured | same |

`/par` and `/token` issue and require the nonce symmetrically, so an SPA that pushes authorization requests runs the same nonce-retry loop at `/par` that it already runs at `/token`.

FAPI 2.0 Message Signing forces the nonce on; FAPI 2.0 Baseline allows it. The library mirrors the spec — flipping the profile flips the default for you.

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
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — the profile that turns nonce on by default.
