---
title: FAPI 2.0 Baseline
description: One profile switch enables PAR, JAR, DPoP, ES256 lock, and the FAPI auth-method allow-list.
pageClass: pg-use-cases-fapi2-baseline
---

# Use case — FAPI 2.0 Baseline

## What is FAPI 2.0?

**FAPI** ("Financial-grade API") is a profile of OAuth 2.0 + OIDC maintained by the OpenID Foundation. It picks a **strict subset** of the underlying specs and forbids the optional flexibility that attackers historically abused — for example, FAPI rejects `RS256` signatures in favour of `ES256`/`PS256`, requires PKCE on every authorization, mandates sender-constrained tokens (DPoP **or** mTLS), and forces RPs to send their authorize requests through PAR + JAR instead of as plain query strings (this library signs id_tokens with `ES256` only, so the anti-`RS256` clause is satisfied by construction).

The bar exists because banking, healthcare, and government deployments need a profile that can be audited against a checklist instead of "did you remember to set every flag?". FAPI 2.0 supersedes FAPI 1.0 (which is still in use). FAPI 2.0 Baseline is the entry-level profile; FAPI 2.0 Message Signing adds JARM + DPoP nonce + RS-side proof signing.

This library exposes Baseline as a **single profile switch** (`op.WithProfile(profile.FAPI2Baseline)`) that flips every required flag and refuses to start in any combination that would silently violate the profile.

A primer with each acronym (PAR, JAR, JARM, DPoP, mTLS, ES256) walked through is at [FAPI 2.0 primer](/concepts/fapi). This page covers the wiring.

::: details Specs referenced on this page
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — Final
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

> **Sources:** [`examples/03-fapi2/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) covers the profile flow. [`examples/50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) shows `op.FAPITLSConfig()` for the TLS 1.2 FAPI 1.0 RW cipher allow-list and `op.LoadPublicJWKS`, which strips private JWK material before client registration. TLS 1.3 deployments need their own `tls.Config`, because Go does not expose a TLS 1.3 cipher-suite allow-list.

## What FAPI 2.0 Baseline mandates

| Requirement | RFC | Library behaviour |
|---|---|---|
| Pushed Authorization Requests | RFC 9126 | `feature.PAR` auto-enabled by the profile. `request_uri` returned from `/par` is the only authorize entry. |
| Proof Key for Code Exchange | RFC 7636 | `code_challenge_method=S256` required; `plain` rejected. |
| Sender-constrained tokens (DPoP **or** mTLS) | RFC 9449 / RFC 8705 | Profile flags `RequiredAnyOf=[DPoP, MTLS]`; if neither is configured, the constructor auto-selects DPoP as the no-infrastructure default. |
| ES256 signing | RFC 7518 | `id_token_signing_alg_values_supported` is `["ES256"]` unconditionally; `RS256` / `none` / HS* never advertised. |
| `redirect_uri` exact match | FAPI 2.0 §5.3 | No wildcards. Byte-identical comparison. |
| `private_key_jwt` client auth | FAPI 2.0 §3.1.3 | Use `private_key_jwt` for the token endpoint auth path. mTLS can satisfy sender constraint, but mTLS client-auth dispatch is not wired. |

## Architecture

<svg class="fapi2-flow-dg" role="img" aria-labelledby="fapi2-baseline-flow-title" viewBox="0 0 720 456" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="fapi2-baseline-flow-title">FAPI 2.0 Baseline sequence: the RP pushes the authorization request to /par, the OP returns a request_uri, and after /authorize and /token the OP issues DPoP-bound tokens signed with ES256.</title>
  <line class="life" x1="150" y1="68" x2="150" y2="448"/>
  <line class="life op-accent" x1="570" y1="68" x2="570" y2="448"/>
  <rect x="75" y="14" width="150" height="30" rx="5"/>
  <rect class="op-accent" x="495" y="14" width="150" height="30" rx="5"/>
  <text class="d-actor" x="150" y="33" text-anchor="middle">RP / client</text>
  <text class="d-actor op-fill" x="570" y="33" text-anchor="middle">OP</text>
  <text class="d-cap" x="150" y="58" text-anchor="middle">private_key_jwt + DPoP</text>
  <text class="d-cap op-fill" x="570" y="58" text-anchor="middle">this library</text>
  <text class="d-prose" x="360" y="98" text-anchor="middle">1 · POST /par</text>
  <text class="d-mono" x="360" y="110" text-anchor="middle">client_assertion=&lt;private_key_jwt&gt; · code_challenge=S256</text>
  <line x1="150" y1="118" x2="570" y2="118"/>
  <path d="M563,114 L570,118 L563,122"/>
  <text class="d-mono" x="360" y="150" text-anchor="middle">2 · 201 · request_uri=urn:…:&lt;id&gt; · expires_in</text>
  <line x1="570" y1="158" x2="150" y2="158"/>
  <path d="M157,154 L150,158 L157,162"/>
  <text class="d-mono" x="360" y="190" text-anchor="middle">3 · GET /authorize?request_uri=urn:…&amp;client_id</text>
  <line x1="150" y1="198" x2="570" y2="198"/>
  <path d="M563,194 L570,198 L563,202"/>
  <path class="op-accent" d="M570,224 h-16 v28 h16"/>
  <path class="op-accent" d="M563,246 L570,250 L563,254"/>
  <text class="d-prose op-fill" x="544" y="234" text-anchor="end">4 · ES256 id_token signing</text>
  <text class="d-mono" x="544" y="248" text-anchor="end">redirect_uri exact match</text>
  <text class="d-prose" x="360" y="290" text-anchor="middle">5 · login + consent (interaction-driven)</text>
  <line x1="570" y1="298" x2="150" y2="298"/>
  <path d="M157,294 L150,298 L157,302"/>
  <text class="d-mono" x="360" y="326" text-anchor="middle">6 · 302 redirect_uri?code=…&amp;state=…</text>
  <line x1="570" y1="334" x2="150" y2="334"/>
  <path d="M157,330 L150,334 L157,338"/>
  <text class="d-prose" x="360" y="364" text-anchor="middle">7 · POST /token · DPoP: &lt;proof&gt;</text>
  <text class="d-mono" x="360" y="376" text-anchor="middle">code + code_verifier + client_assertion</text>
  <line x1="150" y1="384" x2="570" y2="384"/>
  <path d="M563,380 L570,384 L563,388"/>
  <text class="d-prose" x="360" y="414" text-anchor="middle">8 · 200</text>
  <text class="d-mono" x="360" y="426" text-anchor="middle">access_token (DPoP-bound) · id_token (ES256) · refresh_token</text>
  <line x1="570" y1="434" x2="150" y2="434"/>
  <path d="M157,430 L150,434 L157,438"/>
</svg>

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
  op.WithCookieKeys(opKeys.CookieKey),
  op.WithProfile(profile.FAPI2Baseline), // <--- the profile switch
  op.WithStaticClients(op.PrivateKeyJWTClient{
    ID:            demoClientID,
    JWKS:          clientJWKs, // public JWK Set as JSON bytes
    RedirectURIs:  []string{demoRedirectURI},
    Scopes:        []string{"openid", "profile", "email"},
    GrantTypes:    []string{"authorization_code", "refresh_token"},
    ResponseTypes: []string{"code"},
  }),
)
```

`PrivateKeyJWTClient` is the typed seed for FAPI clients — it forces `token_endpoint_auth_method=private_key_jwt` automatically, so the embedder never has to spell that field out. The companion typed seeds are `op.PublicClient` and `op.ConfidentialClient`; all three implement `op.ClientSeed` and feed `WithStaticClients(seeds ...ClientSeed)`.

The `WithProfile` call:

1. Enables `feature.PAR` and `feature.JAR` automatically.
2. Intersects `token_endpoint_auth_methods_supported` with the FAPI 2.0 §3.1.3 allow-list; configure clients with `private_key_jwt` for the token endpoint.
3. Keeps `id_token_signing_alg_values_supported = ["ES256"]` (the OP only ever advertises and signs `ES256` id_tokens; FAPI 2.0's anti-`RS256` clause is satisfied by construction).
4. Forces `redirect_uri` exact match (no wildcards anywhere).
5. Satisfies the DPoP-or-mTLS sender-constraint requirement by preserving an explicit `feature.MTLS` opt-in when present, or by adding `feature.DPoP` when neither binding was selected.

::: tip mTLS instead of DPoP
The profile's default sender binding is DPoP because it needs no TLS client-certificate plumbing. If your deployment standardizes on mTLS, enable `feature.MTLS` explicitly and configure `op.WithMTLSProxy(...)` for a TLS-terminating proxy; that explicit choice suppresses the DPoP default.

This is mTLS sender constraint, not token endpoint mTLS client authentication. Keep the client registered with `private_key_jwt` and use the forwarded certificate only to bind issued access tokens.
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
  "id_token_signing_alg_values_supported": ["ES256"]
}
```

The library publishes `["ES256"]` for `id_token_signing_alg_values_supported` regardless of profile (every issued id_token is signed `ES256`); the FAPI 2.0 §6.2.1 mandate against `RS256` is satisfied because `RS256` never appears on the OP's supported set in the first place. `dpop_signing_alg_values_supported` covers DPoP proof acceptance and is `["ES256", "EdDSA", "PS256"]`.

## Conformance

The OFCS [`fapi2-security-profile-id2-test-plan`](/compliance/ofcs) exercises this exact wiring: 48 PASSED / 9 REVIEW (manual reviewer) / 1 SKIPPED (RSA-key negative test that needs an additional client key) / **0 FAILED** in the latest baseline.

For the full OFCS picture and the REVIEW / SKIPPED breakdown, see [OFCS conformance status](/compliance/ofcs).
