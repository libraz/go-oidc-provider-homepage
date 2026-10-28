---
title: FAPI 2.0 Baseline
description: Enable this library's FAPI2Baseline profile with PAR, JAR support, DPoP-or-mTLS, private_key_jwt, ES256-only ID Tokens, a 10-minute access token cap and the 60-minute request-object age bound.
pageClass: pg-use-cases-fapi2-baseline
---

# Use case — FAPI 2.0 Baseline

## What is FAPI 2.0?

**FAPI** ("Financial-grade API") is a family of OAuth 2.0 security profiles maintained by the OpenID Foundation. The current FAPI 2.0 Security Profile requires PAR, PKCE with `S256`, sender-constrained tokens (DPoP **or** mTLS), confidential clients, and JWT algorithms from `PS256`, `ES256`, or `EdDSA`. It does not require JAR or restrict ID Token signing to `ES256`, and it is an OAuth profile: OIDC applies when the client needs an authenticated user's identifier. This library's `profile.FAPI2Baseline` goes further in three places. It switches on JAR support, it uses `private_key_jwt` for client authentication, and it signs ID Tokens with `ES256` only. The authorization endpoint is `/auth` under the mount prefix, so the default `/oidc` mount serves it at `/oidc/auth`.

The bar exists because banking, healthcare, and government deployments need a profile that can be audited against a checklist instead of "did you remember to set every flag?". FAPI 2.0 supersedes FAPI 1.0, which is still in use. The final document is titled Security Profile; this library names its preset `profile.FAPI2Baseline`. The separate `profile.FAPI2MessageSigning` preset adds JARM, a DPoP nonce-source constraint and response signing; those are library preset behaviours, not requirements of the final Security Profile.

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

> **Sources:** [`examples/03-fapi2/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) covers the profile flow. [`examples/50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) shows `op.FAPITLSConfig()` and `op.LoadPublicJWKS`. `FAPITLSConfig` sets TLS 1.2 as the minimum and holds TLS 1.2 to the FAPI 1.0 RW cipher allow-list (RSA-keyed AEAD suites, so it needs an RSA server certificate); TLS 1.3 is still negotiated when the client offers it, since Go exposes no TLS 1.3 cipher-suite allow-list. `LoadPublicJWKS` strips private JWK material before client registration.

## What the library's `FAPI2Baseline` enforces

| Requirement | RFC | Library behaviour |
|---|---|---|
| Pushed Authorization Requests | RFC 9126 | `feature.PAR` auto-enabled by the profile. `request_uri` returned from `/par` is the only authorize entry. |
| Proof Key for Code Exchange | RFC 7636 | `code_challenge_method=S256` required; `plain` rejected. |
| Sender-constrained tokens (DPoP **or** mTLS) | RFC 9449 / RFC 8705 | `profile.RequiredAnyOf` returns `{DPoP, MTLS}` for this profile, so either one satisfies the requirement; if neither is configured, the constructor auto-selects DPoP as the no-infrastructure default. |
| JWT algorithms | FAPI 2.0 §5.4.1 | The profile permits `PS256`, `ES256`, and `EdDSA`. This library's `id_token_signing_alg_values_supported` remains `["ES256"]`; `RS256` / `none` / HS* are never advertised. |
| Short-lived access tokens | Library policy | `op.New` rejects an access token lifetime above 10 minutes (`profile.MaxAccessTokenTTL`). |
| PAR lifetime | FAPI 2.0 §5.3.2.2 | `op.New` rejects `op.WithPARLifetime` at or above 600 seconds. |
| Signed request objects | RFC 9101 | `feature.JAR` is auto-enabled, so `request` is accepted at `/par` and `/auth` but not mandatory (`profile.FAPI2MessageSigning` makes it so). When a request object is used, it replaces the unsigned query or form parameters instead of being merged with them. `RS256` is rejected for request objects and client assertions. |
| `redirect_uri` exact match | Library policy | The library requires a pre-registered URI and compares it byte-for-byte, without wildcards. The final FAPI 2.0 Security Profile instead requires `redirect_uri` in the authenticated PAR request; it does not mandate pre-registration. |
| Client authentication | FAPI 2.0 §5.3.2.1 | FAPI allows mTLS or `private_key_jwt`. This library dispatches only `private_key_jwt` for token endpoint client authentication; mTLS can satisfy sender constraint, but mTLS client-auth dispatch is not wired. |

## Architecture

<figure class="fig">
  <div class="fig-head">The library's FAPI2Baseline path, end to end</div>
  <svg class="fig-svg" role="img" aria-labelledby="fapi2-arch-title" viewBox="0 0 960 672" xmlns="http://www.w3.org/2000/svg">
    <title id="fapi2-arch-title">With the library's FAPI2Baseline profile, the RP pushes its authorization request to the pushed-authorization endpoint and receives a request_uri; the browser only ever carries that reference. The token request is authenticated with private_key_jwt and carries a DPoP proof, and the returned access token is DPoP-bound while the library's ID Token is signed with ES256.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="648"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="648"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP / client</text>
    <text class="fg-mxs" x="192" y="72" text-anchor="middle">private_key_jwt</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="32" cy="144" r="12"/>
    <text class="fg-badge-t" x="32" y="149.5" text-anchor="middle">1</text>
    <path class="fg-edge" d="M192,144 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="110" text-anchor="middle">POST /par</text>
    <text class="fg-mxs" x="508" y="132" text-anchor="middle">client_assertion · code_challenge=S256</text>
    <!-- 2 -->
    <circle class="fg-badge fg-badge--accent" cx="32" cy="200" r="12"/>
    <text class="fg-badge-t fg-badge-t--accent" x="32" y="205.5" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M824,200 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="508" y="190" text-anchor="middle">201 · request_uri=urn:…:&lt;id&gt; · expires_in</text>
    <!-- 3 -->
    <path class="fg-edge" d="M192,256 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="508" y="246" text-anchor="middle">GET /auth?request_uri=urn:…&amp;client_id</text>
    <!-- validate -->
    <path class="fg-edge fg-edge--accent" d="M824,296 h-40 v24 h40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="768" y="302" text-anchor="end">validate against the profile</text>
    <text class="fg-mxs" x="768" y="324" text-anchor="end">redirect_uri exact match</text>
    <text class="fg-mxs" x="768" y="346" text-anchor="end">library ID Token: ES256</text>
    <!-- interaction -->
    <rect class="fg-box fg-box--sub" x="232" y="392" width="560" height="48" rx="8"/>
    <text class="fg-xs" x="248" y="421">the interaction endpoints obtain an authorization decision</text>
    <!-- code -->
    <path class="fg-edge fg-edge--accent" d="M824,496 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="508" y="486" text-anchor="middle">302 redirect_uri?code=…&amp;state=…</text>
    <!-- token -->
    <path class="fg-edge" d="M192,568 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="534" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
    <text class="fg-mxs" x="508" y="556" text-anchor="middle">code · code_verifier · client_assertion</text>
    <!-- tokens -->
    <path class="fg-edge fg-edge--accent" d="M824,640 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="508" y="606" text-anchor="middle">200</text>
    <text class="fg-mxs" x="508" y="628" text-anchor="middle">access_token (DPoP-bound) · id_token · refresh_token</text>
  </svg>
  <figcaption class="fig-note">Steps 1 and 2 are what the library's profile adds up front. After them the browser carries a reference rather than the request itself, so nothing in the URL bar is worth tampering with.</figcaption>
</figure>

## Code (excerpts from [`examples/03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2))

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
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

The paired RP in the example (`rpkit.NewFAPI2`) pushes the request to `/par` with a `private_key_jwt` assertion and sends a DPoP proof at `/token`, so the whole flow can be driven from a browser at `http://127.0.0.1:9090/`. The default grant set is already `authorization_code` plus `refresh_token`, so the example does not call `op.WithGrants`.

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
