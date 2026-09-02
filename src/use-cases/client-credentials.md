---
title: Service-to-service (client_credentials)
description: Backend-to-backend tokens, no end user, no consent.
pageClass: pg-use-cases-client-credentials
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

<figure class="fig">
  <div class="fig-head">Service to service, no user in the loop</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-cc-title" viewBox="0 0 960 216" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-cc-title">Service A authenticates to the OP as itself and receives an access token, calls Service B with it, and Service B validates that token — either by introspection or against the published key set.</title>
    <rect class="fg-box" x="36" y="36" width="210" height="90" rx="8"/>
    <text class="fg-t2" x="56" y="64">Service A</text>
    <text class="fg-xs" x="56" y="88">a confidential client</text>
    <text class="fg-xs" x="56" y="106">it holds real credentials</text>
    <rect class="fg-box fg-box--accent" x="380" y="36" width="200" height="90" rx="8"/>
    <text class="fg-t2 fg-accent" x="400" y="64">OP</text>
    <text class="fg-xs" x="400" y="88">the authorization server</text>
    <text class="fg-mxs" x="400" y="106">/token · /introspect · /jwks</text>
    <rect class="fg-box" x="714" y="36" width="210" height="90" rx="8"/>
    <text class="fg-t2" x="734" y="64">Service B</text>
    <text class="fg-xs" x="734" y="88">the resource server</text>
    <text class="fg-xs" x="734" y="106">it never sees A's credentials</text>
    <!-- 1 · A asks the OP for a token -->
    <path class="fg-edge" d="M250,66 H376" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="313" y="59" text-anchor="middle">1 · POST /token</text>
    <!-- 2 · the OP answers -->
    <path class="fg-edge fg-edge--accent" d="M376,100 H250" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="313" y="93" text-anchor="middle">2 · access_token</text>
    <!-- 4 · B checks the token it was handed -->
    <path class="fg-edge fg-edge--muted" d="M710,83 H584" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="647" y="76" text-anchor="middle">4 · verify it</text>
    <text class="fg-mxs" x="647" y="99" text-anchor="middle">/introspect · /jwks</text>
    <!-- 3 · A calls B directly — routed under the OP, which is not involved -->
    <path class="fg-edge" d="M141,130 V172 H819 V130" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="480" y="165" text-anchor="middle">3 · Authorization: Bearer &lt;token&gt;</text>
  </svg>
  <figcaption class="fig-note">Step 3 is drawn around the OP rather than through it because the OP is not on that path at all. Service B decides at step 4 whether to ask about the token or check the signature itself, and that choice is what the access-token format page is about.</figcaption>
</figure>

No `/authorize`, no consent, no `id_token`, no refresh token.

## Code

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  // No browser grant is wired, so cookie keys are not needed.
  op.WithGrants(grant.ClientCredentials),
  op.WithFeature(feature.Introspect),

  op.WithStaticClients(
    op.ConfidentialClient{
      ID:         "service-a",
      Secret:     serviceASecret, // seed hashes it before storage
      AuthMethod: op.AuthClientSecretBasic,
      GrantTypes: []string{"client_credentials"},
      Scopes:     []string{"read:things", "write:things"},
      Resources:  []string{"https://api.b.example.com"}, // RFC 8707 audience pin
    },
    op.ConfidentialClient{
      ID:         "service-b",
      Secret:     serviceBSecret,
      AuthMethod: op.AuthClientSecretBasic,
      GrantTypes: []string{"client_credentials"},
    },
  ),
  op.WithProtectedResources(op.ProtectedResource{
    Resource:            "https://api.b.example.com",
    IntrospectionClients: []string{"service-b"},
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
`client_credentials` is restricted to clients with a real authentication credential (`client_secret_basic`, `client_secret_post`, `private_key_jwt`). A public client (`token_endpoint_auth_method=none`) can't use it. mTLS sender constraint is separate and does not authenticate the grant by itself.
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

::: warning Introspect requires a confidential caller
The introspection endpoint authenticates the **caller** (Service B, the resource server). Public clients and clients whose `token_endpoint_auth_method` is `none` receive `401 invalid_client`; register Service B as a confidential client. By default a client can introspect only its own tokens. Put Service B in `ProtectedResource.IntrospectionClients` for the `https://api.b.example.com` audience to delegate access-token introspection to that resource server. This delegation never covers refresh tokens. See [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) for the full wiring.
:::
