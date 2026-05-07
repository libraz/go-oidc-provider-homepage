---
title: Sender constraint — selection guide
description: Bearer tokens vs sender-constrained tokens. How to pick between DPoP and mTLS for your deployment.
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
| Refresh token binding (default) | Bound for public clients, unbound for confidential ([Design judgment #15](/security/design-judgments#dj-15)) | Bound when the client uses mTLS at the token endpoint |
| Replay defense beyond binding | `jti` cache, `iat` window, optional server nonce | TLS session reuse + cert thumbprint match |
| FAPI 2.0 Baseline acceptance | Yes | Yes |
| FAPI 2.0 Message Signing | Yes (with §8 / §9 nonce) | Yes |

FAPI 2.0 Baseline requires sender-constrained tokens via **one of** these two; this library accepts both. `op.WithProfile(profile.FAPI2Baseline)` imposes `RequiredAnyOf` over `[feature.DPoP, feature.MTLS]`. If neither is enabled, construction now selects `feature.DPoP` as the default member; if you explicitly enable `feature.MTLS`, that choice satisfies the disjunction and DPoP is not added.

## Choosing between them

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
