---
title: mTLS (RFC 8705)
description: Mutual-TLS Client Authentication and Certificate-Bound Access Tokens — bind a token to the TLS certificate the legitimate client presents.
pageClass: pg-concepts-mtls
---

# mTLS — certificate-bound access tokens

**mTLS** (RFC 8705) binds an access token to the X.509 certificate that authenticated the client during the TLS handshake. The OP records a SHA-256 thumbprint of the certificate as `cnf.x5t#S256` on the issued token; the resource server verifies that the cert presented on the call to the API has the same thumbprint. A leaked token alone is useless — the attacker would also need the certificate **and** its private key.

mTLS is attractive in deployments that already operate a PKI: B2B service meshes, open-banking environments, and backend-only APIs where every party has a client certificate issued by an internal CA. Because the binding lives at the TLS layer, the application code does not have to sign anything per request; the trade-off is that the TLS terminator (reverse proxy, load balancer) must be configured to expose the verified certificate to the OP.

::: warning Implementation boundary
`feature.MTLS` wires certificate-bound access tokens (`cnf.x5t#S256`) and certificate extraction from direct TLS or a trusted reverse-proxy header. The Final FAPI 2.0 Security Profile permits mTLS or `private_key_jwt` for token-endpoint client authentication. This library does not dispatch `tls_client_auth` or `self_signed_tls_client_auth` as token-endpoint methods; use `private_key_jwt` for that path and mTLS as the sender-constraint layer.
:::

::: details Specs referenced on this page
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280) — X.509 PKI certificates
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — Final
:::

## Trusting the certificate

RFC 8705 defines certificate client-authentication modes, but this library's public mTLS seam is the sender-constraint path. The Final FAPI 2.0 Security Profile permits mTLS or `private_key_jwt` for token-endpoint authentication; this token endpoint does not advertise or dispatch `tls_client_auth` / `self_signed_tls_client_auth`, so register the client for `private_key_jwt` when using this library.

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

`cnf` is shared with DPoP (RFC 7800), but the *member name* differs: DPoP uses `jkt`, mTLS uses `x5t#S256`. A token can carry both members. Where both bindings are present, the consuming endpoint must enforce the conjunction: the DPoP proof must match `jkt` and the presented certificate must match `x5t#S256`. The library applies this conjunction at `/userinfo`; device-code and CIBA grant binding checks likewise require every recorded method.

::: details Why a thumbprint and not the full certificate?
The same reason DPoP records the JWK thumbprint: a fixed-length digest is stable across re-encoding, cheap to compare, and small enough to fit comfortably in a JWT. SHA-256 is pinned by RFC 8705 §3; no negotiation is allowed.
:::

## Reverse-proxy deployments

<figure class="fig">
  <div class="fig-head">Where the certificate crosses the trust boundary</div>
  <svg class="fig-svg" role="img" aria-labelledby="mtls-proxy-title" viewBox="0 0 960 486" xmlns="http://www.w3.org/2000/svg">
    <title id="mtls-proxy-title">A TLS-terminating proxy takes the client certificate off the handshake and forwards it in a header. The OP only reads that header when the request arrives from an address inside the trusted CIDR list; from anywhere else the header is ignored and the request fails closed.</title>
    <!-- zones -->
    <rect class="fg-group" x="30" y="30" width="900" height="110" rx="8"/>
    <rect class="fg-group" x="30" y="152" width="900" height="130" rx="8"/>
    <rect class="fg-group" x="30" y="302" width="900" height="172" rx="8"/>
    <text class="fg-lbl" x="46" y="48">public</text>
    <text class="fg-lbl" x="46" y="170">edge</text>
    <text class="fg-lbl fg-accent" x="46" y="320">op trust zone</text>
    <!-- client -->
    <rect class="fg-box" x="330" y="56" width="300" height="68" rx="8"/>
    <text class="fg-t" x="480" y="80" text-anchor="middle">Client</text>
    <text class="fg-xs" x="480" y="98" text-anchor="middle">holds an X.509 client certificate</text>
    <text class="fg-mxs" x="480" y="114" text-anchor="middle">presents it in the TLS handshake</text>
    <path class="fg-edge" d="M480,128 V178" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="496" y="150">mutual TLS handshake</text>
    <!-- proxy -->
    <rect class="fg-box" x="330" y="182" width="300" height="82" rx="8"/>
    <text class="fg-t2" x="480" y="206" text-anchor="middle">TLS-terminating proxy</text>
    <text class="fg-xs" x="480" y="224" text-anchor="middle">terminates TLS, copies the certificate out</text>
    <text class="fg-mxs" x="480" y="244" text-anchor="middle">X-SSL-Cert: &lt;PEM&gt;</text>
    <!-- trust boundary -->
    <line class="fg-rule fg-rule--dashed fg-rule--strong" x1="30" y1="292" x2="930" y2="292"/>
    <text class="fg-lbl" x="806" y="287">trust boundary</text>
    <path class="fg-edge" d="M480,268 V326" marker-end="url(#fg-a)"/>
    <!-- gate -->
    <rect class="fg-box fg-box--accent" x="360" y="330" width="240" height="60" rx="8"/>
    <text class="fg-t2 fg-accent" x="480" y="354" text-anchor="middle">trusted-CIDR gate</text>
    <text class="fg-mxs" x="480" y="374" text-anchor="middle">RemoteAddr ∈ trustedCIDRs?</text>
    <!-- rejected -->
    <path class="fg-edge fg-edge--danger" d="M356,360 H244" marker-end="url(#fg-ad)"/>
    <text class="fg-xs" x="300" y="353" text-anchor="middle">out of range</text>
    <rect class="fg-box fg-box--danger" x="46" y="330" width="194" height="60" rx="8"/>
    <text class="fg-t2" x="64" y="354">Header ignored</text>
    <text class="fg-xs" x="64" y="374">fail closed — no certificate</text>
    <!-- accepted -->
    <path class="fg-edge fg-edge--accent" d="M604,360 H716" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="660" y="353" text-anchor="middle">in range</text>
    <rect class="fg-box fg-box--accent" x="720" y="330" width="194" height="60" rx="8"/>
    <text class="fg-t2 fg-accent" x="738" y="354">Header authoritative</text>
    <text class="fg-xs" x="738" y="374">the forwarded cert is used</text>
    <!-- OP -->
    <path class="fg-edge fg-edge--accent" d="M817,394 V430 H634" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="330" y="404" width="300" height="54" rx="8"/>
    <text class="fg-t fg-accent" x="480" y="426" text-anchor="middle">OP — this library</text>
    <text class="fg-mxs" x="480" y="446" text-anchor="middle">cnf.x5t#S256 binds the cert to the token</text>
    <text class="fg-xs" x="46" y="424">on direct TLS, with no proxy in front,</text>
    <text class="fg-xs" x="46" y="440">the OP uses the handshake certificate</text>
    <text class="fg-xs" x="46" y="456">and never consults a header at all</text>
  </svg>
  <figcaption class="fig-note">The gate is the whole security argument. A header is trivially forgeable by anyone who can reach the OP directly, so the certificate it carries is only meaningful once the OP knows the request came from the proxy that wrote it.</figcaption>
</figure>

In many production deployments the OP does not terminate TLS itself. An nginx, envoy, AWS ALB, or cloud LB sits in front, decrypts the TLS connection, and forwards the request to the OP as plain HTTP. By that time the client certificate is no longer on the connection — the proxy must forward it as an HTTP header (`X-SSL-Cert`, `X-Forwarded-Client-Cert`, …).

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

`op.WithProfile(profile.FAPI2Baseline)` imposes `RequiredAnyOf` over `[DPoP, MTLS]`. If neither is explicit, the profile selects DPoP as the default member. Deployments that want mTLS sender constraint should enable `feature.MTLS`; that explicit choice satisfies the constraint and suppresses the DPoP default. This library uses `private_key_jwt` for the client's token endpoint authentication, although the Final Security Profile also permits mTLS there.

## Pitfalls

- **TLS terminator must export the cert correctly.** Different proxies use different header names and encodings (DER, PEM, URL-encoded PEM). Lock the format on both ends and pin the header name in `WithMTLSProxy`.
- **Certificate renewal changes the binding.** A token is bound to the leaf certificate it was issued with. Reissue tokens after certificate rotation; a new certificate cannot satisfy an old token's `cnf.x5t#S256`.
- **Do not configure an unsupported mTLS client-authentication method.** The Final Security Profile permits mTLS at the token endpoint, but this library's token endpoint dispatches `private_key_jwt`; mTLS remains available as the sender-constraint layer.
- **`RemoteAddr` semantics behind multiple proxies.** When the OP sits behind two layers of proxy, only the **innermost** proxy's IP appears in `RemoteAddr` — that is the one that must be in `trustedCIDRs`. Outer proxies are irrelevant to the header allow-list because the OP never sees them directly.

## When mTLS shines

- **Backend services with existing PKI** — every service already has a client certificate from an internal CA. mTLS reuses the infrastructure; no new key-management surface.
- **Open banking and B2B service meshes** — some regulators and partner programmes mandate mTLS at the network layer. Adopting RFC 8705 layers token binding on top without changing the wire.
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
- [Use case: FAPI 2.0 Security Profile](/use-cases/fapi2-baseline) — full wiring with `private_key_jwt` client authentication and sender constraint.
- [Design judgments](/security/design-judgments) — resolved tensions in the spec stack.
