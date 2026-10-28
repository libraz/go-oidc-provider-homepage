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
  <svg class="fig-svg" role="img" aria-labelledby="uc-dpopnonce-title" viewBox="0 0 960 624" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dpopnonce-title">The OP refuses the first proof with use_dpop_nonce and hands back a nonce in a header. The client rebuilds the proof with that nonce and succeeds; later proofs may reuse the accepted value until the OP supplies a new one, and successful responses need not carry a DPoP-Nonce header.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="600"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="600"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP / client</text>
    <text class="fg-mxs" x="192" y="72" text-anchor="middle">holds priv_dpop</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- first proof -->
    <path class="fg-edge" d="M192,144 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="110" text-anchor="middle">POST /token</text>
    <text class="fg-xs" x="508" y="132" text-anchor="middle">no nonce yet; the client cannot know one</text>
    <!-- challenge -->
    <path class="fg-edge fg-edge--accent" d="M824,216 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="508" y="182" text-anchor="middle">400 use_dpop_nonce</text>
    <text class="fg-mxs" x="508" y="204" text-anchor="middle">DPoP-Nonce: nonce-1</text>
    <!-- rebuild -->
    <path class="fg-edge" d="M192,256 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="262">rebuild the proof</text>
    <text class="fg-mxs" x="248" y="284">nonce = nonce-1</text>
    <!-- retry -->
    <path class="fg-edge" d="M192,360 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="326" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="508" y="348" text-anchor="middle">DPoP: &lt;proof, nonce-1&gt;</text>
    <!-- accepted -->
    <path class="fg-edge fg-edge--accent" d="M824,432 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="508" y="398" text-anchor="middle">200 · access_token</text>
    <text class="fg-xs" x="508" y="420" text-anchor="middle">nonce-1 stays accepted; no new header needed</text>
    <!-- reuse -->
    <path class="fg-edge" d="M192,504 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="470" text-anchor="middle">GET /userinfo</text>
    <text class="fg-mxs" x="508" y="492" text-anchor="middle">DPoP: &lt;proof, nonce-1&gt;</text>
    <!-- reuse accepted -->
    <path class="fg-edge fg-edge--accent" d="M824,576 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="508" y="542" text-anchor="middle">200 · { user claims }</text>
    <text class="fg-xs" x="508" y="564" text-anchor="middle">no DPoP-Nonce header on this success</text>
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

The rotation interval (`5*time.Minute` above) is how often the "current" nonce changes; it must be positive, and `op.NewInMemoryDPoPNonceSource` returns an error for zero or less. The OP accepts both the current and previous values, so a client racing through a rotation boundary doesn't see a hard failure.

::: warning Multi-instance deployments
A process-local nonce source breaks across replicas — instance B has no record of the nonce instance A issued. Production HA deployments plug a shared store (Redis) behind a custom `DPoPNonceSource`. The library deliberately doesn't ship a Redis nonce source: the option matrix (TTL, rotation cadence, missed-rotation tolerance) is too deployment-specific to standardise.
:::

## When the OP demands the nonce

Every endpoint below demands a nonce when the request carries a DPoP proof and an `op.WithDPoPNonceSource` source is configured. What differs is the shape of the challenge:

| Endpoint | Challenge on a missing or stale nonce |
|---|---|
| `/token`, `/par`, `/device_authorization`, `/bc-authorize` (CIBA) | `400` with JSON error `use_dpop_nonce` and a `DPoP-Nonce` response header |
| `/userinfo` | `401` with `WWW-Authenticate: DPoP error="use_dpop_nonce"` and a `DPoP-Nonce` response header (RFC 9449 §9, resource-server form) |

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

The `DPoP-Nonce` value goes into the next proof's `nonce` claim. A client that keeps getting `use_dpop_nonce` is usually not reading the header, or is talking to a replica whose nonce ring differs from the one that issued the value.

## Read next

- [Sender constraint](/concepts/sender-constraint) — why DPoP exists at all.
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — the library profile where a DPoP nonce source remains optional.
