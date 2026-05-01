---
title: FAPI 2.0 Baseline
description: One profile switch enables PAR, JAR, DPoP, ES256 lock, and the FAPI auth-method allow-list.
---

# Use case — FAPI 2.0 Baseline

## What is FAPI 2.0?

**FAPI** ("Financial-grade API") is a profile of OAuth 2.0 + OIDC
maintained by the OpenID Foundation. It picks a **strict subset** of
the underlying specs and forbids the optional flexibility that
attackers historically abused — for example, FAPI rejects `RS256`
signatures in favour of `ES256`/`PS256`, requires PKCE on every
authorization, mandates sender-constrained tokens (DPoP **or** mTLS),
and forces RPs to send their authorize requests through PAR + JAR
instead of as plain query strings.

The bar exists because banking, healthcare, and government deployments
need a profile that can be audited against a checklist instead of "did
you remember to set every flag?". FAPI 2.0 supersedes FAPI 1.0 (which
is still in use). FAPI 2.0 Baseline is the entry-level profile;
FAPI 2.0 Message Signing adds JARM + DPoP nonce + RS-side proof
signing.

This library exposes Baseline as a **single profile switch**
(`op.WithProfile(profile.FAPI2Baseline)`) that flips every required
flag and refuses to start in any combination that would silently
violate the profile.

A primer with each acronym (PAR, JAR, JARM, DPoP, mTLS, ES256) walked
through is at [FAPI 2.0 primer](/concepts/fapi). This page covers the
wiring.

::: details Specs referenced on this page
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — Final
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

> **Source:** [`examples/03-fapi2/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2)

## What FAPI 2.0 Baseline mandates

| Requirement | RFC | Library behaviour |
|---|---|---|
| Pushed Authorization Requests | RFC 9126 | `feature.PAR` auto-enabled by the profile. `request_uri` returned from `/par` is the only authorize entry. |
| Proof Key for Code Exchange | RFC 7636 | `code_challenge_method=S256` required; `plain` rejected. |
| Sender-constrained tokens (DPoP **or** mTLS) | RFC 9449 / RFC 8705 | Profile flags `RequiredAnyOf=[DPoP, MTLS]`; the constructor refuses to start unless one is enabled. |
| ES256 (or PS256) signing | RFC 7518 | Algorithm allow-list excludes `RS256` from FAPI surface; `none`/HS* never present. |
| `redirect_uri` exact match | FAPI 2.0 §5.3 | No wildcards. Byte-identical comparison. |
| `private_key_jwt` or mTLS client auth | FAPI 2.0 §3.1.3 | Token endpoint auth-method list intersected with FAPI allow-list. |

## Architecture

```mermaid
sequenceDiagram
    autonumber
    participant RP as RP (private_key_jwt + DPoP)
    participant OP

    RP->>OP: POST /par<br/>Authorization: <client_assertion JWT><br/>scope=openid&...&code_challenge=...
    OP->>RP: 201 { request_uri: urn:ietf:params:oauth:request_uri:..., expires_in }
    RP->>OP: GET /authorize?<br/>request_uri=urn:...&client_id=...
    OP->>OP: ES256 alg lock, redirect_uri exact match
    OP-->>RP: (login + consent — or interaction-driven)
    OP->>RP: 302 redirect_uri?code=...&state=...
    RP->>OP: POST /token<br/>DPoP: <proof><br/>grant_type=authorization_code&code=...&code_verifier=...&<br/>client_assertion=<private_key_jwt>
    OP->>RP: 200 { access_token (DPoP-bound), id_token (ES256), refresh_token }
```

## Code (excerpts from [`examples/03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2))

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/profile"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

const (
  demoIssuer      = "https://op.example.com"
  demoClientID    = "fapi2-example-client"
  demoRedirectURI = "https://rp.example.com/callback"
)

provider, err := op.New(
  op.WithIssuer(demoIssuer),
  op.WithStore(inmem.New()),
  op.WithKeyset(opKeys.Keyset()),
  op.WithCookieKey(opKeys.CookieKey),
  op.WithProfile(profile.FAPI2Baseline), // <--- the one switch
  op.WithStaticClients(op.ClientSeed{
    ID:                      demoClientID,
    TokenEndpointAuthMethod: op.AuthPrivateKeyJWT,
    RedirectURIs:            []string{demoRedirectURI},
    GrantTypes:              []grant.Type{grant.AuthorizationCode, grant.RefreshToken},
    JWKs:                    clientJWKs, // public JWK Set as JSON
  }),
)
```

The `WithProfile` call:

1. Enables `feature.PAR`, `feature.JAR`, and `feature.DPoP` automatically.
2. Intersects `token_endpoint_auth_methods_supported` with the FAPI 2.0
   §3.1.3 allow-list (`private_key_jwt`, `tls_client_auth`,
   `self_signed_tls_client_auth`).
3. Locks the ID Token signing alg to `ES256`/`PS256` and rejects `RS256`
   for new tokens.
4. Forces `redirect_uri` exact match (no wildcards anywhere).

::: tip mTLS instead of DPoP
The same profile leaves `RequiredAnyOf=[DPoP, MTLS]` — enable
`feature.MTLS` instead of (or alongside) DPoP and configure
`op.WithMTLSProxy(...)` for a TLS-terminating proxy. See
[`examples/50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks)
for FAPI-grade TLS helpers.
:::

## Verifying the surface

```sh
curl -s http://localhost:8080/.well-known/openid-configuration | jq '{
  pushed_authorization_request_endpoint,
  request_parameter_supported,
  dpop_signing_alg_values_supported,
  token_endpoint_auth_methods_supported,
  id_token_signing_alg_values_supported
}'
```

Expected:

```json
{
  "pushed_authorization_request_endpoint": "http://localhost:8080/oidc/par",
  "request_parameter_supported": true,
  "dpop_signing_alg_values_supported": ["ES256", "EdDSA", "PS256"],
  "token_endpoint_auth_methods_supported": ["private_key_jwt"],
  "id_token_signing_alg_values_supported": ["ES256", "PS256"]
}
```

## Conformance

The OFCS [`fapi2-security-profile-id2-test-plan`](/compliance/ofcs)
exercises this exact wiring: 48 PASSED / 9 REVIEW (manual reviewer) /
1 SKIPPED (RSA-key negative test that needs an additional client key) /
**0 FAILED** in the latest baseline.

For the full OFCS picture and the REVIEW / SKIPPED breakdown, see
[OFCS conformance status](/compliance/ofcs).
