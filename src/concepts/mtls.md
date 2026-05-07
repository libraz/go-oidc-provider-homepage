---
title: mTLS (RFC 8705)
description: Mutual-TLS Client Authentication and Certificate-Bound Access Tokens — bind a token to the TLS certificate the legitimate client presents.
---

# mTLS — Mutual-TLS Client Authentication

**mTLS** (RFC 8705) binds an access token to the X.509 certificate that authenticated the client during the TLS handshake. The OP records a SHA-256 thumbprint of the certificate as `cnf.x5t#S256` on the issued token; the resource server verifies that the cert presented on the call to the API has the same thumbprint. A leaked token alone is useless — the attacker would also need the certificate **and** its private key.

mTLS is attractive in deployments that already operate a PKI: B2B service meshes, open-banking environments, and backend-only APIs where every party has a client certificate issued by an internal CA. Because the binding lives at the TLS layer, the application code does not have to sign anything per request; the trade-off is that the TLS terminator (reverse proxy, load balancer) must be configured to expose the verified certificate to the OP.

::: details Specs referenced on this page
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280) — X.509 PKI certificates
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

## Two sub-modes

RFC 8705 defines two `token_endpoint_auth_method` values that share the same binding mechanism but differ on **how the client identity is anchored**.

### `tls_client_auth` — PKI chain (RFC 8705 §2.1)

The client presents a certificate issued by a CA the OP trusts. The OP validates the chain against its trust anchors and then matches the certificate against the client's registered metadata. The library accepts any **one** of the following pin fields (defined in `internal/mtls/auth.go`'s `ClientMatcher`):

| Pin | Source on the certificate |
|---|---|
| `SubjectDN` | RFC 4514 string form of `Subject` |
| `SANDNS` | DNS name in `DNSNames` |
| `SANURI` | URI in `URIs` |
| `SANIP` | IP literal in `IPAddresses` |
| `SANEmail` | rfc822Name in `EmailAddresses` |

At least one non-empty pin is required. An entirely empty matcher fails closed with `ErrNoMatcherConfigured` — silently admitting any chain-valid cert would defeat the §2.1 contract. Subject DN comparison runs through a DER round-trip so RFC 4514 attribute-ordering differences disappear, and a verbatim string fallback handles the residual cases.

### `self_signed_tls_client_auth` — JWK thumbprint (RFC 8705 §2.2)

The client registers its public JWK (or JWKS URI). The OP does **not** walk a CA chain; instead, it hashes the cert's public key and matches the thumbprint against the client's registered JWKS. This mode lets a deployment use mTLS without operating a PKI — every client signs its own certificate.

The two methods are mutually exclusive on a given client. Mixing them at registration is rejected; the OP picks the verifier based on the client's stored `token_endpoint_auth_method`.

## Confirmation claim — `cnf.x5t#S256`

When the OP issues a token to an mTLS-authenticated client, it computes a SHA-256 digest of the DER-encoded certificate (RFC 8705 §3) and writes it into the access token as `cnf.x5t#S256`. Every subsequent request that uses this access token must arrive over a TLS connection presenting the **same** certificate; the resource server hashes the cert it observes and compares against `cnf.x5t#S256`.

`cnf` is shared with DPoP (RFC 7800), but the *member name* differs: DPoP uses `jkt`, mTLS uses `x5t#S256`. A token carries one or the other — never both.

::: details Why a thumbprint and not the full certificate?
The same reason DPoP records the JWK thumbprint: a fixed-length digest is stable across re-encoding, cheap to compare, and small enough to fit comfortably in a JWT. SHA-256 is pinned by RFC 8705 §3; no negotiation is allowed.
:::

## Reverse-proxy deployments

The OP almost never terminates TLS itself in production. An nginx, envoy, AWS ALB, or cloud LB sits in front, decrypts the TLS connection, and forwards the request to the OP as plain HTTP. By that time the client certificate is no longer on the connection — the proxy must forward it as an HTTP header (`X-SSL-Cert`, `X-Forwarded-Client-Cert`, …).

The OP needs to know **which header** carries the cert and **which IP ranges** are allowed to set it. Without the second guard, any internet client could send a forged header and impersonate a properly-authenticated client.

```go
op.WithMTLSProxy("X-SSL-Cert", []string{"10.0.0.0/8"})
```

The two arguments are both required (see `op/options_fapi_proxy.go`):

- An empty `headerName` returns a configuration error. To disable the header path, omit the option entirely.
- An empty `trustedCIDRs` slice is rejected at construction time so a misconfiguration cannot silently widen the allow-list.

The library prefers the live TLS handshake cert when the OP terminates TLS itself (`http.Request.TLS.PeerCertificates`); the header path is consulted only when no handshake cert is present **and** the request's `RemoteAddr` lies inside one of the trusted CIDRs. An attacker who reaches the OP directly (bypassing the reverse proxy) cannot forge a cert by setting the header — the OP fails closed and returns the same response as a request without a cert at all.

`op.MTLSProxyConfig(provider)` exposes the recorded configuration so an embedder constructing an `internal/mtls.Verifier` themselves (for example, an out-of-band introspection endpoint) can reuse the same allow-list.

## Wiring

Minimal mTLS-only wiring:

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
)

op.New(
  /* required options */
  op.WithFeature(feature.MTLS),
  op.WithMTLSProxy("X-SSL-Cert", []string{"10.0.0.0/8"}),
)
```

When the OP terminates TLS itself (test environments, single-tenant on-prem deployments), the `WithMTLSProxy` line can be omitted — the OP reads the certificate directly from `http.Request.TLS.PeerCertificates`.

`op.WithProfile(profile.FAPI2Baseline)` imposes `RequiredAnyOf` over `[DPoP, MTLS]`. If neither is explicit, the profile selects DPoP as the default member. Deployments that want mTLS should enable `feature.MTLS`; that explicit choice satisfies the constraint and suppresses the DPoP default. Enabling both publishes both binding mechanisms in discovery; the client then chooses per request.

## Pitfalls

- **TLS terminator must export the cert correctly.** Different proxies use different header names and encodings (DER, PEM, URL-encoded PEM). Lock the format on both ends and pin the header name in `WithMTLSProxy`.
- **Certificate renewal needs operational coordination.** Rotating a `self_signed_tls_client_auth` cert means updating the registered JWKS at the same time, otherwise the new cert's thumbprint will not match. Plan the rollover so the old and new JWKs are both registered for the duration of the cert lifetime overlap.
- **Mixing modes on the same client is rejected.** A client registered as `tls_client_auth` cannot opportunistically present a self-signed cert and have the OP fall through to `self_signed_tls_client_auth`. Pick one method and stick with it.
- **Empty matcher fails closed.** `tls_client_auth` requires at least one of `SubjectDN`, `SANDNS`, `SANURI`, `SANIP`, `SANEmail` populated. A registration that leaves them all empty is rejected at the verifier with `ErrNoMatcherConfigured`.
- **`RemoteAddr` semantics behind multiple proxies.** When the OP sits behind two layers of proxy, only the **innermost** proxy's IP appears in `RemoteAddr` — that is the one that must be in `trustedCIDRs`. Outer proxies are irrelevant to the header allow-list because the OP never sees them directly.

## When mTLS shines

- **Backend services with existing PKI** — every service already has a client certificate from an internal CA. mTLS reuses the infrastructure; no new key-management surface.
- **Open banking and B2B service meshes** — many regulators and partner programmes already mandate mTLS at the network layer. Adopting RFC 8705 layers token binding on top without changing the wire.
- **Operations teams already running TLS terminators** — the `WithMTLSProxy` configuration is a one-time wiring exercise that fits naturally next to existing nginx / envoy configs.
- **Constrained clients that cannot sign per request** — the binding lives at the TLS layer; the application code does not produce a fresh signature for every API call.

## When mTLS doesn't shine

- **Browsers** — modern browsers cannot easily present client certificates. SPAs cannot use mTLS in practice; reach for [DPoP](/concepts/dpop) instead.
- **Mobile apps** — most platforms allow client certs, but the UX of provisioning and rotating them is poor. DPoP's per-request signing maps better to mobile key stores.
- **Deployments without a PKI** — standing up an internal CA just to issue client certs is a heavy lift. If you are starting fresh, DPoP gives you sender constraint without the certificate logistics.
- **Heterogeneous environments** — when some clients are SPAs and others are backend services, you may end up running both mechanisms. Discovery advertises both; clients pick the one they can use.

## Read next

- [DPoP (RFC 9449)](/concepts/dpop) — the alternative sender-constraint mechanism, bound to a client-held key.
- [Sender constraint — selection guide](/concepts/sender-constraint) — comparison table and when to pick which.
- [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — full wiring with mTLS client authentication.
- [Design judgments](/security/design-judgments) — resolved tensions in the spec stack.
