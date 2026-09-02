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

<figure class="fig">
  <div class="fig-head">One rejection, then a nonce on every proof</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-dpopnonce-title" viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dpopnonce-title">The OP refuses the first proof with use_dpop_nonce and hands back a nonce in a header. The client rebuilds the proof with that nonce and succeeds; every response after that carries the next nonce, so each proof is pinned to a value the OP chose.</title>
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
    <text class="fg-mxs" x="450" y="281" text-anchor="middle">DPoP-Nonce: nonce-2 — use this next</text>
    <circle class="fg-badge" cx="15" cy="330" r="8.5"/>
    <text class="fg-badge-t" x="15" y="333" text-anchor="middle">6</text>
    <path class="fg-edge" d="M200,330 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="450" y="324" text-anchor="middle">GET /userinfo · DPoP: &lt;proof, nonce-2&gt;</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="376" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="379" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M700,376 H200" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="450" y="356" text-anchor="middle">200 · { user claims }</text>
    <text class="fg-mxs" x="450" y="369" text-anchor="middle">DPoP-Nonce: nonce-3 — and so on</text>
  </svg>
  <figcaption class="fig-note">The first rejection is not a failure to handle specially — it is the handshake. A client that treats <code>use_dpop_nonce</code> as a normal error will retry forever; one that reads the header succeeds on the next attempt.</figcaption>
</figure>

The handshake happens once. After it, every later call carries the newest nonce: the OP returns a `DPoP-Nonce` header on each response, and the client copies that value into the `nonce` claim of the next proof.

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

`/par` and `/token` issue and require the nonce symmetrically, so an SPA that pushes authorization requests runs the same nonce-retry loop at `/par` that it already runs at `/token`.

Whenever a request presents a `DPoP` header, every endpoint in the table requires exactly one value. Multiple values are malformed and rejected, including an empty first value followed by a valid proof; the OP never selects a later value or silently treats the request as proof-less.

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
