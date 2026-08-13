---
title: mTLS (RFC 8705)
description: Mutual-TLS Client Authentication and Certificate-Bound Access Tokens — bind a token to the TLS certificate the legitimate client presents.
pageClass: pg-concepts-mtls
---

# mTLS — certificate-bound access tokens

**mTLS** (RFC 8705) binds an access token to the X.509 certificate that authenticated the client during the TLS handshake. The OP records a SHA-256 thumbprint of the certificate as `cnf.x5t#S256` on the issued token; the resource server verifies that the cert presented on the call to the API has the same thumbprint. A leaked token alone is useless — the attacker would also need the certificate **and** its private key.

mTLS is attractive in deployments that already operate a PKI: B2B service meshes, open-banking environments, and backend-only APIs where every party has a client certificate issued by an internal CA. Because the binding lives at the TLS layer, the application code does not have to sign anything per request; the trade-off is that the TLS terminator (reverse proxy, load balancer) must be configured to expose the verified certificate to the OP.

::: warning Implementation boundary
`feature.MTLS` wires certificate-bound access tokens (`cnf.x5t#S256`) and certificate extraction from direct TLS or a trusted reverse-proxy header. It does not make `tls_client_auth` or `self_signed_tls_client_auth` available as token-endpoint client-authentication methods; use `private_key_jwt` for FAPI client authentication and mTLS as the sender-constraint layer.
:::

::: details Specs referenced on this page
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280) — X.509 PKI certificates
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

## Trusting the certificate

RFC 8705 defines certificate client-authentication modes, but this library's public mTLS seam is the sender-constraint path. The token endpoint does not advertise or dispatch `tls_client_auth` / `self_signed_tls_client_auth`; a profile that requires asymmetric client authentication should register the client for `private_key_jwt`.

When `feature.MTLS` is enabled, the OP obtains a client certificate from the direct TLS handshake or from the trusted proxy path described below, computes its RFC 8705 thumbprint, and binds the issued token. Chain validation normally belongs to the TLS terminator. If the OP must validate the chain itself, pass a non-nil public pool:

```go
import "crypto/x509"

pool := x509.NewCertPool()
pool.AppendCertsFromPEM(caPEM)

op.WithFeature(feature.MTLS),
op.WithMTLSRootCAs(pool),
```

`WithMTLSRootCAs(pool *x509.CertPool)` is an optional public option. A non-nil pool is used for both handshake certificates and certificates selected from `WithMTLSProxy`; the chain must validate for client authentication. Passing `nil` is a configuration error. To trust nothing, pass an empty `x509.NewCertPool()`. Leave the option unset when the direct TLS stack or trusted proxy has already validated the external client chain.

## Confirmation claim — `cnf.x5t#S256`

When the OP issues a token to an mTLS-authenticated client, it computes a SHA-256 digest of the DER-encoded certificate (RFC 8705 §3) and writes it into the access token as `cnf.x5t#S256`. Every subsequent request that uses this access token must arrive over a TLS connection presenting the **same** certificate; the resource server hashes the cert it observes and compares against `cnf.x5t#S256`.

`cnf` is shared with DPoP (RFC 7800), but the *member name* differs: DPoP uses `jkt`, mTLS uses `x5t#S256`. A token carries one or the other — never both.

::: details Why a thumbprint and not the full certificate?
The same reason DPoP records the JWK thumbprint: a fixed-length digest is stable across re-encoding, cheap to compare, and small enough to fit comfortably in a JWT. SHA-256 is pinned by RFC 8705 §3; no negotiation is allowed.
:::

## Reverse-proxy deployments

<svg class="mtls-proxy-flow" role="img" aria-labelledby="mtls-proxy-trust-title" viewBox="0 0 760 536" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="mtls-proxy-trust-title">Reverse-proxy trust boundary: a TLS-terminating proxy injects the client certificate into a header; the OP consults it only when the request arrives from a trusted CIDR and treats the forwarded certificate as authoritative.</title>
  <text transform="rotate(-90 26 66)" x="26" y="66" text-anchor="middle" class="d-layer" font-size="9.5">PUBLIC</text>
  <text transform="rotate(-90 26 190)" x="26" y="190" text-anchor="middle" class="d-layer" font-size="9.5">EDGE</text>
  <text transform="rotate(-90 26 392)" x="26" y="392" text-anchor="middle" class="d-layer" font-size="9.5">OP TRUST ZONE</text>
  <line x1="80" y1="120" x2="740" y2="120" class="d-faint"/>
  <rect x="260" y="28" width="300" height="64" rx="10"/>
  <text x="410" y="53" text-anchor="middle" class="d-label" font-size="15.5" font-weight="600">Client</text>
  <text x="410" y="77" text-anchor="middle" class="d-sub" font-size="11.5">X.509 client cert</text>
  <path d="M410 92 L410 138"/>
  <path d="M405 131 L410 138 L415 131"/>
  <text x="428" y="110" class="d-sub" font-size="10.5">TLS handshake</text>
  <text x="428" y="125" class="d-sub" font-size="10">presents client cert</text>
  <rect x="210" y="138" width="400" height="92" rx="10"/>
  <text x="410" y="164" text-anchor="middle" class="d-label" font-size="14.5" font-weight="600">TLS-terminating proxy</text>
  <text x="410" y="188" text-anchor="middle" class="d-sub" font-size="10.5">injects client cert into a header</text>
  <text x="410" y="210" text-anchor="middle" class="d-mono" font-size="11">X-SSL-Cert: &lt;PEM&gt;</text>
  <line x1="80" y1="262" x2="740" y2="262" stroke-width="1.5" stroke-dasharray="6 6"/>
  <text x="88" y="256" class="d-sub" font-size="10.5">trust boundary</text>
  <path d="M410 230 L410 298"/>
  <path d="M405 291 L410 298 L415 291"/>
  <rect x="260" y="298" width="300" height="64" rx="10"/>
  <text x="410" y="323" text-anchor="middle" class="d-label" font-size="12.5" font-weight="600">trusted-CIDR gate</text>
  <text x="410" y="346" text-anchor="middle" class="d-mono" font-size="11">RemoteAddr ∈ trustedCIDRs?</text>
  <path d="M560 330 L634 330"/>
  <path d="M627 325 L634 330 L627 335"/>
  <text x="598" y="322" text-anchor="middle" class="d-sub" font-size="10">out of range</text>
  <rect x="636" y="304" width="112" height="52" rx="8"/>
  <text x="692" y="326" text-anchor="middle" class="d-mono" font-size="10">header ignored</text>
  <text x="692" y="344" text-anchor="middle" class="d-sub" font-size="10">fail closed</text>
  <path d="M410 362 L410 408"/>
  <path d="M405 401 L410 408 L415 401"/>
  <text x="396" y="380" text-anchor="end" class="d-sub" font-size="10">in range</text>
  <text x="396" y="395" text-anchor="end" class="d-sub" font-size="10">header authoritative</text>
  <rect x="210" y="408" width="400" height="112" rx="10" class="op-accent"/>
  <text x="410" y="436" text-anchor="middle" class="d-op" font-size="14.5" font-weight="600">OP — this library</text>
  <text x="410" y="462" text-anchor="middle" class="d-sub" font-size="10.5">handshake cert used on direct TLS</text>
  <text x="410" y="484" text-anchor="middle" class="d-sub" font-size="10.5">forwarded client cert selected</text>
  <text x="410" y="505" text-anchor="middle" class="d-mono" font-size="11">cnf.x5t#S256</text>
</svg>

The OP almost never terminates TLS itself in production. An nginx, envoy, AWS ALB, or cloud LB sits in front, decrypts the TLS connection, and forwards the request to the OP as plain HTTP. By that time the client certificate is no longer on the connection — the proxy must forward it as an HTTP header (`X-SSL-Cert`, `X-Forwarded-Client-Cert`, …).

The OP needs to know **which header** carries the cert and **which IP ranges** are allowed to set it. Without the second guard, any internet client could send a forged header and impersonate a properly-authenticated client.

```go
op.WithMTLSProxy("X-SSL-Cert", []string{"10.0.0.0/8"})
```

The two arguments are both required (see `op/options_fapi_proxy.go`):

- An empty `headerName` returns a configuration error. To disable the header path, omit the option entirely.
- An empty `trustedCIDRs` slice is rejected at construction time so a misconfiguration cannot silently widen the allow-list.

The direct path reads `http.Request.TLS.PeerCertificates`. The proxy path is consulted only when the request's `RemoteAddr` is inside one of the configured trusted CIDRs; a request from elsewhere ignores the header and fails closed. When the request comes from a trusted proxy, the forwarded certificate is authoritative and takes precedence over any certificate on the proxy-to-OP TLS hop. The proxy's transport certificate is not treated as the OAuth client certificate.

`op.MTLSProxy` is the public configuration type. `op.MTLSProxyConfig(provider)` returns the recorded `HeaderName` and a fresh `TrustedProxies` slice, or the zero value when the option was not configured. Embedder-side edge code can use that public projection to keep its header-stripping policy aligned with the OP; it does not require importing an internal verifier.

## Wiring

Minimal mTLS sender-constraint wiring:

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

When the OP terminates TLS itself (test environments, single-tenant on-prem deployments), the `WithMTLSProxy` line can be omitted — the OP reads the certificate directly from `http.Request.TLS.PeerCertificates`. Add `WithMTLSRootCAs(x509.NewCertPool())` populated with the deployment CA when the OP should re-check the chain.

`op.WithProfile(profile.FAPI2Baseline)` imposes `RequiredAnyOf` over `[DPoP, MTLS]`. If neither is explicit, the profile selects DPoP as the default member. Deployments that want mTLS sender constraint should enable `feature.MTLS`; that explicit choice satisfies the constraint and suppresses the DPoP default. Use `private_key_jwt` for the client's token endpoint authentication.

## Pitfalls

- **TLS terminator must export the cert correctly.** Different proxies use different header names and encodings (DER, PEM, URL-encoded PEM). Lock the format on both ends and pin the header name in `WithMTLSProxy`.
- **Certificate renewal changes the binding.** A token is bound to the leaf certificate it was issued with. Reissue tokens after certificate rotation; a new certificate cannot satisfy an old token's `cnf.x5t#S256`.
- **Do not configure mTLS client authentication as the token endpoint method.** mTLS is the sender-constraint layer; `private_key_jwt` is the client-auth method for FAPI deployments.
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
- [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — full wiring with `private_key_jwt` client authentication and sender constraint.
- [Design judgments](/security/design-judgments) — resolved tensions in the spec stack.
