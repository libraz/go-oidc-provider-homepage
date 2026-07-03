---
title: Service-to-service (client_credentials)
description: Backend-to-backend tokens, no end user, no consent.
---

# Use case — Service-to-service (`client_credentials`)

## What is the `client_credentials` grant?

OAuth 2.0 has four "grant types" — different ways for a client to obtain an access token. Three involve a human (`authorization_code`, `device_code`, the deprecated `password`); one does not.

**`client_credentials`** (RFC 6749 §4.4) is for the no-human case: service A holds a registered `client_id` + credential and exchanges them directly at `/token` for an access token. The token represents **the service itself**, not an end user — so there is no `id_token`, no `refresh_token` (re-issue is cheap), no consent prompt.

This is the right grant for cron jobs, webhooks, microservice ↔ microservice calls, and anything else where there's no browser and no end user.

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §4.4 (`client_credentials`)
- [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — JWT Profile for OAuth 2.0 Client Authentication (`private_key_jwt`)
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — OAuth 2.0 Mutual-TLS Client Authentication
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0 (pin which RS the token is for)
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — OAuth 2.0 Token Introspection
:::

::: details Vocabulary refresher
- **Confidential vs public client** — A *confidential* client (a backend service) holds a real authentication credential (a secret, a private key, an mTLS cert). A *public* client (a browser SPA, a mobile app) cannot keep a secret and authenticates only by `client_id`. `client_credentials` is for confidential clients only — without a credential, "the client itself" has no authenticated identity.
- **`private_key_jwt`** — Instead of sending a shared secret in the request, the client signs a short-lived JWT assertion with its private key and posts it as `client_assertion`. The OP verifies it against the client's pre-registered public JWKS. No secret ever crosses the wire.
- **Bearer token** — An access token whose presentation alone proves authorisation (RFC 6750). Anyone holding the token can use it. For higher assurance, see [Sender constraint](/concepts/sender-constraint) (DPoP / mTLS bind the token to a key).
:::

> **Source:** [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials)

## Architecture

<style scoped>
.d-lbl{font-family:var(--vp-font-family-base);font-size:12px;fill:currentColor;stroke:none}
.d-tok{font-family:var(--vp-font-family-mono);font-size:11px;fill:currentColor;stroke:none}
.d-bt{font-family:var(--vp-font-family-base);font-size:14px;font-weight:600;fill:currentColor;stroke:none}
.d-bs{font-family:var(--vp-font-family-base);font-size:10.5px;fill:var(--vp-c-text-2);stroke:none}
.d-op{stroke:var(--vp-c-brand-2)}
.d-opt{fill:var(--vp-c-brand-2)}
.d-rs{stroke:var(--vp-c-text-3)}
</style>

<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="cc-svc-flow-title" viewBox="12 46 736 116" width="736" style="max-width:100%;height:auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="cc-svc-flow-title">Service-to-service client_credentials flow: Service A gets an access token from the OP, calls Service B with it, and Service B validates the token at the OP.</title>
  <rect x="20" y="48" width="150" height="68" rx="6"/>
  <rect class="d-op" x="305" y="48" width="150" height="68" rx="6"/>
  <rect class="d-rs" x="590" y="48" width="150" height="68" rx="6"/>
  <text class="d-bt" x="95" y="80" text-anchor="middle">Service A</text>
  <text class="d-bs" x="95" y="98" text-anchor="middle">confidential client</text>
  <text class="d-bt d-opt" x="380" y="80" text-anchor="middle">OP</text>
  <text class="d-bs" x="380" y="98" text-anchor="middle">authorization server</text>
  <text class="d-bt" x="665" y="80" text-anchor="middle">Service B</text>
  <text class="d-bs" x="665" y="98" text-anchor="middle">resource server</text>
  <line x1="176" y1="68" x2="299" y2="68"/>
  <path d="M293 63 L299 68 L293 73"/>
  <line x1="299" y1="96" x2="176" y2="96"/>
  <path d="M182 91 L176 96 L182 101"/>
  <line x1="584" y1="82" x2="461" y2="82"/>
  <path d="M467 77 L461 82 L467 87"/>
  <path d="M95 116 C95 168 665 168 665 116"/>
  <path d="M660 123 L665 116 L670 123"/>
  <text class="d-lbl" x="238" y="60" text-anchor="middle">1. <tspan class="d-tok">POST /token</tspan></text>
  <text class="d-lbl" x="238" y="110" text-anchor="middle">2. <tspan class="d-tok">access_token</tspan></text>
  <text class="d-lbl" x="522" y="68" text-anchor="middle">4. verify token</text>
  <text class="d-tok" x="522" y="100" text-anchor="middle" font-size="10.5">/introspect · /jwks</text>
  <text class="d-lbl" x="380" y="140" text-anchor="middle">3. <tspan class="d-tok">Authorization: Bearer</tspan></text>
</svg>

No `/authorize`, no consent, no `id_token`, no refresh token.

## Code

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithGrants(
    grant.AuthorizationCode, // for human users
    grant.RefreshToken,
    grant.ClientCredentials, // <-- enable service-to-service
  ),

  op.WithStaticClients(op.ConfidentialClient{
    ID:         "service-a",
    Secret:     serviceASecret,            // plaintext; the seed hashes it via op.HashClientSecret
    AuthMethod: op.AuthClientSecretBasic,
    GrantTypes: []string{"client_credentials"},
    Scopes:     []string{"read:things", "write:things"},
    Resources:  []string{"https://api.b.example.com"}, // RFC 8707 audience pin
  }),
)
```

## Calling the token endpoint

```sh
curl -s -u service-a:<secret> \
  -d 'grant_type=client_credentials&scope=read:things' \
  https://op.example.com/oidc/token
# {
#   "access_token": "...",
#   "token_type": "Bearer",
#   "expires_in": 300,
#   "scope": "read:things"
# }
```

::: tip Confidential clients only
`client_credentials` is restricted to clients with a real authentication credential (`client_secret_basic`, `client_secret_post`, `private_key_jwt`, `tls_client_auth`, `self_signed_tls_client_auth`). A public client (`token_endpoint_auth_method=none`) can't use it.
:::

## Production-grade: `private_key_jwt` instead of basic

For higher-assurance deployments, use `private_key_jwt` (RFC 7523):

```go
op.WithStaticClients(op.PrivateKeyJWTClient{
  ID:         "service-a",
  JWKS:       serviceAPublicJWKs, // public JWK Set as JSON bytes
  GrantTypes: []string{"client_credentials"},
})
```

The `PrivateKeyJWTClient` seed sets `token_endpoint_auth_method=private_key_jwt` automatically — there is no separate `AuthMethod` field to configure on this typed seed.

Now Service A signs a JWT assertion with its private key for each token request:

```sh
curl -s -d 'grant_type=client_credentials' \
  -d 'client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer' \
  -d "client_assertion=$JWT_ASSERTION" \
  -d 'scope=read:things' \
  https://op.example.com/oidc/token
```

::: details FAPI 2.0 client_credentials
With `op.WithProfile(profile.FAPI2Baseline)`, `client_secret_basic` is filtered out. `private_key_jwt` or mTLS becomes the only acceptable authentication. Stack `feature.DPoP` to additionally bind the issued access token to a client-held key.
:::

## Validating on the resource server

Two paths:

1. **Self-validate JWT** (RFC 9068) if you configured JWT access tokens. Service B fetches `/jwks` once, caches it, and verifies signatures locally.
2. **Introspect** (RFC 7662) if access tokens are opaque. Service B posts the token to `/introspect` and reads `active`, `scope`, `client_id`, etc. from the JSON response.

```sh
curl -s -u service-b:<secret> \
  -d "token=$ACCESS_TOKEN" \
  https://op.example.com/oidc/introspect
```

::: warning Introspect requires its own client
The introspection endpoint authenticates the **caller** (Service B, the resource server). Register Service B as a confidential client too, so it can call `/introspect`. See [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) for the full wiring.
:::
