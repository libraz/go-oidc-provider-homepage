---
title: Sender constraint — selection guide
description: Bearer tokens vs sender-constrained tokens. How to pick between DPoP and mTLS for your deployment.
pageClass: pg-concepts-sender-constraint
---

# Sender constraint — DPoP vs mTLS

A bare bearer token can be used by whoever has its bytes. If the token leaks (logs, intermediary proxy, browser extension, third-party SDK) the leaker has full access until the token expires.

A **sender-constrained** access token is bound to a key the legitimate client holds. Even if the bytes leak, the leaker cannot use the token without also stealing the key. This page is the selection guide; the mechanics live on the dedicated pages for [DPoP](/concepts/dpop) and [mTLS](/concepts/mtls).

::: details Token replay — what is it?
A leaker captures a valid access token (e.g. from a log file or a compromised proxy) and re-sends it from their own machine to call the API. The RS sees a syntactically valid token and serves the request. Sender constraint blocks token-only replay — the leaker would also have to present the matching key on the same request.
:::

::: details Proof-of-possession — what is it?
The general term for "show me you hold the key, not just the token bytes." DPoP, mTLS, and the older holder-of-key tokens are all proof-of-possession schemes. The library's DPoP / mTLS flows are the modern OAuth-native expressions of this idea.
:::

## Why bearer tokens are risky in 2026

Token leakage is no longer hypothetical:

- **Logs.** Reverse-proxy access logs, application logs, and observability pipelines routinely capture the `Authorization` header unless explicitly stripped. A bearer token surviving in a log file is reusable for the rest of its TTL.
- **Browser extensions and SDKs.** Modern browsers run extensions inside the same process boundary as the page; a malicious extension can read every header the page sets. Mobile SDKs sit in the same process as the app.
- **Compromised intermediaries.** A single compromised CDN edge or proxy gains access to every request flowing through it. Bearer tokens are the most useful artefact to harvest.
- **Stage-and-fire.** An attacker with brief access to a developer's machine can copy a token and use it later from anywhere on the internet.

The structural fix is to make the bytes alone insufficient. Sender constraint achieves this by tying every request to a key the legitimate client controls. The leak still happens; the token alone no longer compromises the API.

::: tip Sender constraint vs TLS
TLS protects the token while it is on the wire. Once the request reaches the application — the OP, the RS, a logging middleware, a debug endpoint — the bearer token is in plaintext and any of those points can leak it. Sender constraint protects against token-only replay after the token reaches those components.
:::

## Two ways to bind in this library

**DPoP (RFC 9449)** binds the token to a key the client signs with on every request. The proof is a small JWT (`htm`, `htu`, `iat`, `jti`, optional `ath` and `nonce`) attached as a `DPoP:` HTTP header. Works over plain HTTPS and does not require the client to hold a TLS certificate. Read [DPoP](/concepts/dpop) for the full mechanics.

**mTLS (RFC 8705)** binds the token to the X.509 certificate the client presented during the TLS handshake. The OP records a SHA-256 thumbprint of the certificate as `cnf.x5t#S256` on the issued token, and the resource server verifies that the cert presented to it has the same thumbprint. Read [mTLS](/concepts/mtls) for the full mechanics.

## Comparison

| Aspect | DPoP | mTLS |
|---|---|---|
| Spec | RFC 9449 | RFC 8705 |
| Key material | Client-held private key, any device that can sign | Client TLS certificate (PKI-issued or self-signed) |
| Browser support | Yes (SPA, mobile, anything that can sign a JWT) | Poor — browsers cannot easily present client certs |
| Per-request artefact | Fresh JWS proof, signed in the application | Nothing extra — the binding lives at the TLS layer |
| Proxy / TLS terminator dependency | None — works over plain HTTPS | Requires the terminator to forward the cert in a header |
| `cnf` member | `cnf.jkt` (JWK thumbprint) | `cnf.x5t#S256` (X.509 thumbprint) |
| Refresh token binding (default) | Bound for public clients, unbound for confidential ([Design judgment #15](/security/design-judgments#dj-15)) | Bound to the certificate for every client type; a refresh must present the same certificate |
| Replay defense beyond binding | `jti` cache, `iat` window, optional server nonce | TLS session reuse + cert thumbprint match |
| FAPI 2.0 Security Profile (confidential clients) | Yes | Yes |
| FAPI 2.0 Message Signing | Inherits the Security Profile; DPoP nonce is optional | Inherits the Security Profile |

The Final FAPI 2.0 Security Profile applies to confidential clients and requires sender-constrained tokens via **one of** these two methods; its Message Signing extension inherits that requirement and does not add a DPoP nonce requirement. This library accepts both for token binding. `op.WithProfile(profile.FAPI2Baseline)` imposes `RequiredAnyOf` over `[feature.DPoP, feature.MTLS]`. If neither is enabled, construction selects `feature.DPoP` as the default member; if you explicitly enable `feature.MTLS`, that choice satisfies the disjunction and DPoP is not added. This library uses `private_key_jwt` for token endpoint client authentication even when mTLS supplies the sender constraint; the Final Security Profile also permits mTLS there.

The selection guide below also covers public-client deployments supported by the library. Public clients are outside the Final Security Profile's client-scope requirement.

## When the binding applies

Enabling `feature.DPoP` or `feature.MTLS` does not by itself force every token to be bound. The token endpoint binds a token when the request carries a DPoP proof or a client certificate, and issues a plain bearer token otherwise. The `profile.FAPI2Baseline`, `profile.FAPI2MessageSigning`, and `profile.FAPICIBA` profiles close that gap: they refuse an unbound request at `/token` with `invalid_request`. A single token may carry both `cnf.jkt` and `cnf.x5t#S256`; the resource server then has to check both.

| Situation | Response |
|---|---|
| Token request under a FAPI profile, no proof and no certificate | `400 invalid_request` |
| Refresh of a DPoP-bound chain, proof missing or signed by another key | `400 invalid_grant` |
| Refresh of an mTLS-bound chain, certificate missing or different | `400 invalid_grant` |
| `/userinfo` with a DPoP-bound token under the `Bearer` scheme, or without a proof | `401`, `WWW-Authenticate` with `invalid_token` |
| `/userinfo` with an mTLS-bound token and a different or missing certificate | `401`, `WWW-Authenticate` with `invalid_token` |
| Introspection of a bound token | Active response with `cnf`; the OP does not check a proof, the resource server does |

Introspection reports `token_type: "Bearer"` for bound tokens too; the binding is visible only in `cnf`.

## Choosing between them

<figure class="fig">
  <div class="fig-head">Default to DPoP; use mTLS where certificates exist</div>
  <svg class="fig-svg" role="img" aria-labelledby="sc-choice-title" viewBox="0 0 960 568" xmlns="http://www.w3.org/2000/svg">
    <title id="sc-choice-title">A decision tree for choosing a sender constraint. Browser-driven clients usually take DPoP, backends that already hold a PKI certificate can take mTLS, B2B and regulated estates follow their scheme or partner requirements, a mixed fleet enables both, and the default when none of these applies is DPoP.</title>
    <!-- 1 -->
    <rect class="fg-box" x="32" y="24" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="52">Is the client browser-driven?</text>
    <text class="fg-xs" x="48" y="76">SPA · mobile app · any public client</text>
    <path class="fg-edge" d="M464,60 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="50" text-anchor="middle">yes</text>
    <rect class="fg-box" x="560" y="24" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="52">DPoP</text>
    <text class="fg-mxs" x="576" y="76">cnf.jkt · client-generated key</text>
    <path class="fg-edge" d="M248,96 V136" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="121">no</text>
    <!-- 2 -->
    <rect class="fg-box" x="32" y="136" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="164">Does the backend hold a PKI certificate?</text>
    <text class="fg-xs" x="48" y="188">you run an internal CA and issue to services</text>
    <path class="fg-edge" d="M464,172 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="162" text-anchor="middle">yes</text>
    <rect class="fg-box" x="560" y="136" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="164">mTLS</text>
    <text class="fg-mxs" x="576" y="188">cnf.x5t#S256 · issued certificate</text>
    <path class="fg-edge" d="M248,208 V248" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="233">no</text>
    <!-- 3 -->
    <rect class="fg-box" x="32" y="248" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="276">B2B, open banking, or otherwise regulated?</text>
    <text class="fg-xs" x="48" y="300">the scheme or partner may require client certs</text>
    <path class="fg-edge" d="M464,284 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="274" text-anchor="middle">yes</text>
    <rect class="fg-box" x="560" y="248" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="276">mTLS, or both</text>
    <text class="fg-xs" x="576" y="300">check the scheme or partner standard</text>
    <path class="fg-edge" d="M248,320 V360" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="345">no</text>
    <!-- 4 -->
    <rect class="fg-box" x="32" y="360" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="388">A mixed fleet?</text>
    <text class="fg-xs" x="48" y="412">some SPAs, some backend services</text>
    <path class="fg-edge" d="M464,396 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="386" text-anchor="middle">yes</text>
    <rect class="fg-box" x="560" y="360" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="388">Enable both</text>
    <text class="fg-xs" x="576" y="412">each client picks at registration</text>
    <path class="fg-edge" d="M248,432 V472" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="457">no</text>
    <!-- default -->
    <rect class="fg-box fg-box--accent" x="32" y="472" width="896" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="500">Not sure? Start with DPoP</text>
    <text class="fg-xs" x="48" y="524">it needs nothing from your network or your PKI, and a client can move to mTLS later</text>
  </svg>
  <figcaption class="fig-note">Both mechanisms end at the same place — a <code>cnf</code> claim the resource server re-checks. The question is only which credential you can realistically get onto every client: a generated key, or a certificate someone has to issue and renew.</figcaption>
</figure>

The decision usually falls out of the existing infrastructure:

- **SPA, mobile, or any browser-driven client →** DPoP. Browsers cannot reliably present client certificates; mobile certificate provisioning is a poor UX. DPoP keys live in memory or in the platform's secure storage.
- **First-party API where you control both ends →** DPoP. Lower operational overhead; no PKI required.
- **Backend services with an established internal CA →** mTLS. Reuse the existing PKI infrastructure rather than introducing a new key-management surface.
- **B2B service mesh, open banking, regulated environment →** mTLS when the applicable scheme or partner standard requires it. RFC 8705 layers token binding on top without changing the wire.
- **Heterogeneous estate (some SPAs, some backends) →** Both. Enable both features; the OP advertises them in discovery and each client picks the mechanism it can use.

If you are not sure which one fits, default to DPoP. It carries fewer infrastructure prerequisites and fits more client environments.

## Read more

- [DPoP (RFC 9449)](/concepts/dpop) — proof structure, replay defenses, `cnf.jkt`, server nonce, public / confidential refresh-binding split.
- [mTLS (RFC 8705)](/concepts/mtls) — sub-modes (`tls_client_auth` vs `self_signed_tls_client_auth`), `cnf.x5t#S256`, reverse-proxy wiring.

## Read next

- [Use case: FAPI 2.0 Security Profile](/use-cases/fapi2-baseline) — full wiring with sender constraint enabled.
- [DPoP nonce flow](/use-cases/dpop-nonce) — RFC 9449 §8 / §9 server-supplied nonce pipeline.
- [Design judgments](/security/design-judgments) — the public / confidential refresh-binding split and other resolved spec tensions.
