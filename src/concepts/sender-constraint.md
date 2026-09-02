---
title: Sender constraint — selection guide
description: Bearer tokens vs sender-constrained tokens. How to pick between DPoP and mTLS for your deployment.
pageClass: pg-concepts-sender-constraint
---

# Sender constraint — DPoP vs mTLS

A bare bearer token is **bearer-authoritative**: whoever has the bytes can call the API. If the token leaks (logs, intermediary proxy, browser extension, third-party SDK) the leaker has full access until the token expires.

A **sender-constrained** access token is bound to a key the legitimate client holds. Even if the bytes leak, the leaker cannot use the token without also stealing the key. This page is the selection guide; the mechanics live on the dedicated pages for [DPoP](/concepts/dpop) and [mTLS](/concepts/mtls).

::: details Token replay — what is it?
A leaker captures a valid access token (e.g. from a log file or a compromised proxy) and re-sends it from their own machine to call the API. The RS sees a syntactically valid token and serves the request. Sender constraint makes replay structurally impossible — the leaker would also have to present the matching key on the same request.
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

The structural fix is to make the bytes alone insufficient. Sender constraint achieves this by tying every request to a key the legitimate client controls. The leak still happens; it just no longer compromises the API.

::: tip Sender constraint vs TLS
TLS protects the token while it is on the wire. Once the request reaches the application — the OP, the RS, a logging middleware, a debug endpoint — the bearer token is in plaintext and any of those points can leak it. Sender constraint protects the token end-to-end.
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
| Refresh token binding (default) | Bound for public clients, unbound for confidential ([Design judgment #15](/security/design-judgments#dj-15)) | Access tokens can be certificate-bound; mTLS token-endpoint client authentication is not dispatched |
| Replay defense beyond binding | `jti` cache, `iat` window, optional server nonce | TLS session reuse + cert thumbprint match |
| FAPI 2.0 Baseline acceptance | Yes | Yes |
| FAPI 2.0 Message Signing | Yes (with §8 / §9 nonce) | Yes |

FAPI 2.0 Baseline requires sender-constrained tokens via **one of** these two; this library accepts both for token binding. `op.WithProfile(profile.FAPI2Baseline)` imposes `RequiredAnyOf` over `[feature.DPoP, feature.MTLS]`. If neither is enabled, construction selects `feature.DPoP` as the default member; if you explicitly enable `feature.MTLS`, that choice satisfies the disjunction and DPoP is not added. Use `private_key_jwt` for token endpoint client authentication even when mTLS supplies the sender constraint.

## Choosing between them

<figure class="fig">
  <div class="fig-head">Picking a sender constraint</div>
  <svg class="fig-svg" role="img" aria-labelledby="sc-choice-title" viewBox="0 0 960 466" xmlns="http://www.w3.org/2000/svg">
    <title id="sc-choice-title">A decision tree for choosing a sender constraint. Browser-driven clients take DPoP, backends that already hold a PKI certificate take mTLS, B2B and regulated estates take mTLS or both, a mixed fleet enables both, and the default when none of these applies is DPoP.</title>
    <!-- 1 -->
    <rect class="fg-box" x="36" y="24" width="394" height="62" rx="8"/>
    <text class="fg-s" x="56" y="50">Is the client browser-driven?</text>
    <text class="fg-xs" x="56" y="70">SPA · mobile app · any public client</text>
    <path class="fg-edge" d="M434,55 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="48" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="530" y="24" width="394" height="62" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="50">DPoP</text>
    <text class="fg-mxs" x="550" y="70">cnf.jkt — a key the client generates and keeps</text>
    <path class="fg-edge" d="M233,90 V112" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="106">no</text>
    <!-- 2 -->
    <rect class="fg-box" x="36" y="116" width="394" height="62" rx="8"/>
    <text class="fg-s" x="56" y="142">Does the backend already hold a PKI certificate?</text>
    <text class="fg-xs" x="56" y="162">you run an internal CA and issue to services</text>
    <path class="fg-edge" d="M434,147 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="140" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="530" y="116" width="394" height="62" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="142">mTLS</text>
    <text class="fg-mxs" x="550" y="162">cnf.x5t#S256 — reuse the certificate you issue</text>
    <path class="fg-edge" d="M233,182 V204" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="198">no</text>
    <!-- 3 -->
    <rect class="fg-box" x="36" y="208" width="394" height="62" rx="8"/>
    <text class="fg-s" x="56" y="234">B2B, open banking, or otherwise regulated?</text>
    <text class="fg-xs" x="56" y="254">the network layer already mandates client certs</text>
    <path class="fg-edge" d="M434,239 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="232" text-anchor="middle">yes</text>
    <rect class="fg-box" x="530" y="208" width="394" height="62" rx="8"/>
    <text class="fg-t2" x="550" y="234">mTLS, or both</text>
    <text class="fg-xs" x="550" y="254">the choice is usually made for you by the regulator</text>
    <path class="fg-edge" d="M233,274 V296" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="290">no</text>
    <!-- 4 -->
    <rect class="fg-box" x="36" y="300" width="394" height="62" rx="8"/>
    <text class="fg-s" x="56" y="326">A mixed fleet?</text>
    <text class="fg-xs" x="56" y="346">some SPAs, some backend services</text>
    <path class="fg-edge" d="M434,331 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="324" text-anchor="middle">yes</text>
    <rect class="fg-box" x="530" y="300" width="394" height="62" rx="8"/>
    <text class="fg-t2" x="550" y="326">Enable both</text>
    <text class="fg-xs" x="550" y="346">each client picks one at registration time</text>
    <path class="fg-edge" d="M233,366 V388" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="382">no</text>
    <!-- default -->
    <rect class="fg-box fg-box--accent" x="36" y="392" width="888" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="56" y="416">Not sure? Start with DPoP</text>
    <text class="fg-xs" x="56" y="436">it needs nothing from your network or your PKI, and a client can move to mTLS later</text>
  </svg>
  <figcaption class="fig-note">Both mechanisms end at the same place — a <code>cnf</code> claim the resource server re-checks. The question is only which credential you can realistically get onto every client: a generated key, or a certificate someone has to issue and renew.</figcaption>
</figure>

The decision usually falls out of the existing infrastructure:

- **SPA, mobile, or any browser-driven client →** DPoP. Browsers cannot reliably present client certificates; mobile certificate provisioning is a poor UX. DPoP keys live in memory or in the platform's secure storage.
- **First-party API where you control both ends →** DPoP. Lower operational overhead; no PKI required.
- **Backend services with an established internal CA →** mTLS. Reuse the existing PKI infrastructure rather than introducing a new key-management surface.
- **B2B service mesh, open banking, regulated environment →** mTLS, often because the regulator already mandates it at the network layer. RFC 8705 layers token binding on top without changing the wire.
- **Heterogeneous estate (some SPAs, some backends) →** Both. Enable both features; the OP advertises them in discovery and each client picks the mechanism it can use.

If you are not sure which one fits, default to DPoP. It carries fewer infrastructure prerequisites and works in every client environment.

## Read more

- [DPoP (RFC 9449)](/concepts/dpop) — proof structure, replay defenses, `cnf.jkt`, server nonce, public / confidential refresh-binding split.
- [mTLS (RFC 8705)](/concepts/mtls) — sub-modes (`tls_client_auth` vs `self_signed_tls_client_auth`), `cnf.x5t#S256`, reverse-proxy wiring.

## Read next

- [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — full wiring with sender constraint enabled.
- [DPoP nonce flow](/use-cases/dpop-nonce) — RFC 9449 §8 / §9 server-supplied nonce pipeline.
- [Design judgments](/security/design-judgments) — the public / confidential refresh-binding split and other resolved spec tensions.
