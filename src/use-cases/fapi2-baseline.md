---
title: FAPI 2.0 Baseline
description: Enable this library's FAPI2Baseline profile with PAR, library-required JAR, DPoP-or-mTLS, private_key_jwt, ES256-only ID Tokens, and the 60-minute JAR request-object age bound.
pageClass: pg-use-cases-fapi2-baseline
---

# Use case — FAPI 2.0 Baseline

## What is FAPI 2.0?

**FAPI** ("Financial-grade API") is a family of OAuth 2.0 security profiles maintained by the OpenID Foundation; OIDC applies when the client needs an authenticated user's identifier. The current FAPI 2.0 Security Profile requires PAR, PKCE with `S256`, sender-constrained tokens (DPoP **or** mTLS), confidential clients, and JWT algorithms from `PS256`, `ES256`, or `EdDSA`. It does not require JAR as part of the Security Profile or restrict ID Token signing to `ES256`. The authorize endpoint is `/auth` under the configured mount prefix, so the default `/oidc` mount serves it at `/oidc/auth`. This library's `profile.FAPI2Baseline` adds JAR, uses `private_key_jwt` for client authentication, and currently signs ID Tokens with `ES256` only.

The bar exists because banking, healthcare, and government deployments need a profile that can be audited against a checklist instead of "did you remember to set every flag?". FAPI 2.0 supersedes FAPI 1.0 (which is still in use). The final FAPI 2.0 document is titled Security Profile; this library calls its preset `profile.FAPI2Baseline`. The library's separate Message Signing preset adds JARM, a DPoP nonce-source constraint, and response-signing behavior; those are library preset behaviors, not requirements of the final Security Profile.

This library exposes Baseline as a **single profile switch** (`op.WithProfile(profile.FAPI2Baseline)`) that enables its required checks and refuses to start in any combination that would silently violate the library profile.

A primer with each acronym (PAR, JAR, JARM, DPoP, mTLS, ES256) walked through is at [FAPI 2.0 primer](/concepts/fapi). This page covers the wiring.

::: details Specs referenced on this page
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — Final (the library's `profile.FAPI2Baseline` setting)
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

> **Sources:** [`examples/03-fapi2/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) covers the profile flow. [`examples/50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) shows `op.FAPITLSConfig()` for the TLS 1.2 FAPI 1.0 RW cipher allow-list and `op.LoadPublicJWKS`, which strips private JWK material before client registration. TLS 1.3 deployments need their own `tls.Config`, because Go does not expose a TLS 1.3 cipher-suite allow-list.

## What the library's `FAPI2Baseline` enforces

| Requirement | RFC | Library behaviour |
|---|---|---|
| Pushed Authorization Requests | RFC 9126 | `feature.PAR` auto-enabled by the profile. `request_uri` returned from `/par` is the only authorize entry. |
| Proof Key for Code Exchange | RFC 7636 | `code_challenge_method=S256` required; `plain` rejected. |
| Sender-constrained tokens (DPoP **or** mTLS) | RFC 9449 / RFC 8705 | `profile.RequiredAnyOf` returns `{DPoP, MTLS}` for this profile, so either one satisfies the requirement; if neither is configured, the constructor auto-selects DPoP as the no-infrastructure default. |
| JWT algorithms | FAPI 2.0 §5.4.1 | The profile permits `PS256`, `ES256`, and `EdDSA`. This library's `id_token_signing_alg_values_supported` remains `["ES256"]`; `RS256` / `none` / HS* are never advertised. |
| `redirect_uri` exact match | Library policy | The library requires a pre-registered URI and compares it byte-for-byte, without wildcards. The final FAPI 2.0 Security Profile instead requires `redirect_uri` in the authenticated PAR request; it does not mandate pre-registration. |
| Client authentication | FAPI 2.0 §5.3.2.1 | FAPI allows mTLS or `private_key_jwt`. This library dispatches only `private_key_jwt` for token endpoint client authentication; mTLS can satisfy sender constraint, but mTLS client-auth dispatch is not wired. |

## Architecture

<figure class="fig">
  <div class="fig-head">The library's FAPI2Baseline path, end to end</div>
  <svg class="fig-svg" role="img" aria-labelledby="fapi2-arch-title" viewBox="0 0 960 412" xmlns="http://www.w3.org/2000/svg">
    <title id="fapi2-arch-title">With the library's FAPI2Baseline profile, the RP pushes its authorization request to the pushed-authorization endpoint and receives a request_uri; the browser only ever carries that reference. The token request is authenticated with private_key_jwt and carries a DPoP proof, and the returned access token is DPoP-bound while the library's ID Token is signed with ES256.</title>
    <line class="fg-life" x1="260" y1="62" x2="260" y2="404"/>
    <line class="fg-life fg-life--accent" x1="700" y1="62" x2="700" y2="404"/>
    <rect class="fg-box" x="170" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="260" y="35" text-anchor="middle">RP / client</text>
    <text class="fg-mxs" x="260" y="49" text-anchor="middle">private_key_jwt + DPoP</text>
    <rect class="fg-box fg-box--accent" x="600" y="16" width="200" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="700" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="700" y="49" text-anchor="middle">go-oidc-provider</text>
    <circle class="fg-badge" cx="15" cy="104" r="8.5"/>
    <text class="fg-badge-t" x="15" y="107" text-anchor="middle">1</text>
    <path class="fg-edge" d="M260,104 H700" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="480" y="84" text-anchor="middle">POST /par</text>
    <text class="fg-mxs" x="480" y="97" text-anchor="middle">client_assertion=&lt;private_key_jwt&gt; · code_challenge=S256</text>
    <circle class="fg-badge" cx="15" cy="140" r="8.5"/>
    <text class="fg-badge-t" x="15" y="143" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M700,140 H260" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="480" y="134" text-anchor="middle">201 · request_uri=urn:…:&lt;id&gt; · expires_in</text>
    <circle class="fg-badge" cx="15" cy="176" r="8.5"/>
    <text class="fg-badge-t" x="15" y="179" text-anchor="middle">3</text>
    <path class="fg-edge" d="M260,176 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="480" y="170" text-anchor="middle">GET /authorize?request_uri=urn:…&amp;client_id</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="212" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="215" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M700,204 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="742" y="208">validate against the profile</text>
    <text class="fg-mxs" x="742" y="221">library ID Token ES256 · redirect_uri exact match</text>
    <circle class="fg-badge" cx="15" cy="258" r="8.5"/>
    <text class="fg-badge-t" x="15" y="261" text-anchor="middle">5</text>
    <rect class="fg-box fg-box--sub" x="170" y="240" width="620" height="36" rx="6"/>
    <text class="fg-xs" x="480" y="262" text-anchor="middle">the interaction endpoints obtain an authorization decision</text>
    <circle class="fg-badge" cx="15" cy="306" r="8.5"/>
    <text class="fg-badge-t" x="15" y="309" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--accent" d="M700,306 H260" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="480" y="300" text-anchor="middle">302 redirect_uri?code=…&amp;state=…</text>
    <circle class="fg-badge" cx="15" cy="352" r="8.5"/>
    <text class="fg-badge-t" x="15" y="355" text-anchor="middle">7</text>
    <path class="fg-edge" d="M260,352 H700" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="480" y="332" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
    <text class="fg-mxs" x="480" y="345" text-anchor="middle">code · code_verifier · client_assertion</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="396" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="399" text-anchor="middle">8</text>
    <path class="fg-edge fg-edge--accent" d="M700,396 H260" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="480" y="376" text-anchor="middle">200</text>
    <text class="fg-mxs" x="480" y="389" text-anchor="middle">access_token (DPoP-bound) · id_token (ES256) · refresh_token</text>
  </svg>
  <figcaption class="fig-note">Steps 1 and 2 are what the library's profile adds up front. After them the browser carries a reference rather than the request itself, so nothing in the URL bar is worth tampering with.</figcaption>
</figure>

## Code (excerpts from [`examples/03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2))

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/profile"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

const (
  demoIssuer      = "https://op.example.com"
  demoClientID    = "fapi2-example-client"
  demoRedirectURI = "https://rp.example.com/callback"
)

st := inmem.New()
loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

provider, err := op.New(
  op.WithIssuer(demoIssuer),
  op.WithStore(st),
  op.WithKeyset(opKeys.Keyset()),
  op.WithCookieKeys(opKeys.CookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithGrants(grant.AuthorizationCode, grant.RefreshToken),
  op.WithProfile(profile.FAPI2Baseline), // <--- the profile switch
  op.WithFeature(feature.DPoP),
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

The library's `WithProfile` call:

1. Enables `feature.PAR` and `feature.JAR` automatically.
2. Intersects `token_endpoint_auth_methods_supported` with the FAPI 2.0 §5.3.2.1 allow-list; configure clients with `private_key_jwt` for the token endpoint.
3. Keeps `id_token_signing_alg_values_supported = ["ES256"]` (the OP only ever advertises and signs `ES256` ID Tokens). This is the library's current keyset policy; the FAPI 2.0 Security Profile also permits `PS256` and `EdDSA`.
4. Forces `redirect_uri` exact match (no wildcards anywhere).
5. Satisfies the DPoP-or-mTLS sender-constraint requirement by preserving an explicit `feature.MTLS` opt-in when present, or by adding `feature.DPoP` when neither binding was selected.

For JAR, `profile.MaxRequestObjectAge(profile.FAPI2Baseline)` returns `60 * time.Minute`. `op.New` passes that value to the request-object verifier, which applies it to the signed request object's `iat` age while still checking its `nbf` and `exp` claims.

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

The library publishes `["ES256"]` for `id_token_signing_alg_values_supported` regardless of profile (every issued ID Token is signed `ES256`). The live FAPI 2.0 Security Profile allows `PS256`, `ES256`, and `EdDSA` for JWT algorithms (§5.4.1); the library's ES256-only ID Token policy is stricter. `dpop_signing_alg_values_supported` covers DPoP proof acceptance and is `["ES256", "EdDSA", "PS256"]`.

## Conformance

The library's `profile.FAPI2Baseline` is a policy preset, not a claim that every deployment conforms to every requirement in the current final Security Profile. The core refresh-token flow rotates refresh tokens, while FAPI 2.0 Security Profile §5.3.2.1(9) prohibits routine rotation except under extraordinary circumstances. The client-assertion verifier also accepts a token-endpoint URL or array `aud`, whereas §5.3.2.1(8) requires the issuer identifier as a string. Review these differences before making a conformance claim.

The OFCS [`fapi2-security-profile-id2-test-plan`](/compliance/ofcs) exercises this exact wiring: 48 PASSED / 9 REVIEW (manual reviewer) / 1 SKIPPED (RSA-key negative test that needs an additional client key) / **0 FAILED** in the latest baseline.

For the full OFCS picture and the REVIEW / SKIPPED breakdown, see [OFCS conformance status](/compliance/ofcs).
