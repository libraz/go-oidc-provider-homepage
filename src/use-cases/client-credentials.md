---
title: Service-to-service (client_credentials)
description: Backend-to-backend tokens, no end user, no consent.
pageClass: pg-use-cases-client-credentials
---

# Use case — Service-to-service (`client_credentials`)

## What is the `client_credentials` grant?

Most OAuth grants involve a resource owner, a person who approves access. **`client_credentials`** (RFC 6749 §4.4) is the grant for the case with no person: service A holds a registered `client_id` plus a credential and exchanges them directly at `/token` for an access token. The token represents **the service itself**, not an end user, so there is no `id_token`, no `refresh_token` (asking again is cheap), and no consent prompt.

Use it for cron jobs, webhooks, microservice-to-microservice calls, and anything else with no browser and no end user.

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §4.4 (`client_credentials`)
- [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — JWT Profile for OAuth 2.0 Client Authentication (`private_key_jwt`)
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — OAuth 2.0 Mutual-TLS Client Authentication
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0 (pin which RS the token is for)
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — OAuth 2.0 Token Introspection
:::

::: details Vocabulary refresher
- **Confidential vs public client** — A *confidential* client (a backend service) holds a real authentication credential (a secret or a private key). A *public* client (a browser SPA, a mobile app) cannot keep a secret and identifies itself by `client_id` alone. `client_credentials` is for confidential clients only: without a credential, "the client itself" has no authenticated identity.
- **`private_key_jwt`** — Instead of sending a shared secret in the request, the client signs a short-lived JWT assertion with its private key and posts it as `client_assertion`. The OP verifies it against the client's pre-registered public JWKS. No secret ever crosses the wire.
- **Bearer token** — An access token whose presentation alone proves authorization (RFC 6750): anyone holding it can use it. [Sender constraint](/concepts/sender-constraint) (DPoP / mTLS) binds the token to a key instead.
:::

> **Source:** [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials)

## Architecture

<figure class="fig">
  <div class="fig-head">Service to service, no user in the loop</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-cc-title" viewBox="0 0 960 392" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-cc-title">Service A authenticates to the OP as itself and receives an access token, calls Service B with it, and Service B validates that token — either by introspection or against the published key set.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="368"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="368"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="368"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">confidential client</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">resource server</text>
    <!-- A authenticates as itself -->
    <path class="fg-edge" d="M192,144 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="110" text-anchor="middle">POST /token</text>
    <text class="fg-s" x="352" y="132" text-anchor="middle">client authentication</text>
    <!-- the OP answers -->
    <path class="fg-edge fg-edge--accent" d="M512,216 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="206" text-anchor="middle">access_token</text>
    <!-- A calls B directly -->
    <path class="fg-edge" d="M192,296 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="286" text-anchor="middle">Authorization: Bearer &lt;token&gt;</text>
    <!-- B verifies the token -->
    <path class="fg-edge fg-edge--muted" d="M824,368 H512" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="668" y="358" text-anchor="middle">verify: /introspect | /jwks</text>
  </svg>
  <figcaption class="fig-note">The call from A to B never touches the OP, and B never sees A's credentials. Service B decides for itself whether to ask the OP about the token or check the signature, and that choice is what the access-token format page is about.</figcaption>
</figure>

The flow never touches `/auth`.

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
  // No browser grant is served, so cookie keys are not needed.
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
    Resource:             "https://api.b.example.com",
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
`client_credentials` is restricted to clients with a real authentication credential (`client_secret_basic`, `client_secret_post`, `private_key_jwt`). A public client (`token_endpoint_auth_method=none`) cannot use it. A statically seeded `ConfidentialClient` that uses `client_secret_basic` or `client_secret_post` must carry `Secret` or `SecretHash`; `op.New` refuses an empty one. mTLS sender constraint is separate and does not authenticate the grant by itself.
:::

### What the token contains and how requests fail

| Aspect | Behaviour |
|---|---|
| `sub` | The `client_id`. There is no end user, and pairwise subject projection does not apply. |
| `scope` | The requested scopes, which must all be in the client's registered `Scopes`. Omitting `scope` yields the full registered set minus `openid`. |
| `aud` | The `resource` value when the request carries one (it must be in the client's `Resources`, and only one value is allowed). Otherwise the issuer URL. |
| Response | `access_token`, `token_type`, `expires_in`, `scope`. Never `id_token` or `refresh_token`. |
| `cnf` | Present when the request carried a verified DPoP proof or mTLS certificate. |

| Failure | Response |
|---|---|
| Client not registered for `client_credentials`, or a public client | `400 unauthorized_client` |
| `openid` requested, or a scope outside the client's registered set | `400 invalid_scope` |
| `resource` malformed, unregistered for the client, or repeated with different values | `400 invalid_target` |
| Missing, wrong, or replayed credentials (including a `private_key_jwt` assertion with an empty or over-long `jti`) | `401 invalid_client` |
| The client's JWKS is temporarily unreachable or overloaded | `503 server_error` |
| The client store is unavailable | `500 server_error` |

## Production-grade: `private_key_jwt` instead of basic

For higher-assurance deployments, use `private_key_jwt` (RFC 7523):

```go
op.WithStaticClients(op.PrivateKeyJWTClient{
  ID:         "service-a",
  JWKS:       serviceAPublicJWKs, // public JWK Set as JSON bytes
  GrantTypes: []string{"client_credentials"},
})
```

The `PrivateKeyJWTClient` seed sets `token_endpoint_auth_method=private_key_jwt` automatically, so this typed seed has no `AuthMethod` field. A client record carries either an inline `jwks` or a `jwks_uri`, never both.

Service A signs a fresh JWT assertion with its private key for each token request. The assertion needs a unique `jti` (the OP rejects a replay) and a lifetime of at most five minutes:

```sh
curl -s -d 'grant_type=client_credentials' \
  -d 'client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer' \
  -d "client_assertion=$JWT_ASSERTION" \
  -d 'scope=read:things' \
  https://op.example.com/oidc/token
```

::: details FAPI 2.0 client_credentials
With `op.WithProfile(profile.FAPI2Baseline)`, `client_secret_basic` is filtered out. This library accepts `private_key_jwt` as the token endpoint client-auth method; mTLS can satisfy sender constraint, but RFC 8705 mTLS client authentication is not wired. Stack `feature.DPoP` to additionally bind the issued access token to a client-held key.
:::

## Validating on the resource server

Two paths:

1. **Self-validate JWT** (RFC 9068) if you configured JWT access tokens. Service B fetches `/jwks`, caches it, and refreshes that cache when key rotation produces an unknown `kid`, then verifies signatures locally.
2. **Introspect** (RFC 7662) if access tokens are opaque. Service B posts the token to `/introspect` and reads `active`, `scope`, `client_id`, etc. from the JSON response.

```sh
curl -s -u service-b:<secret> \
  -d "token=$ACCESS_TOKEN" \
  https://op.example.com/oidc/introspect
```

::: warning Introspect requires a confidential caller
The introspection endpoint authenticates the **caller** (Service B, the resource server). Public clients and clients whose `token_endpoint_auth_method` is `none` receive `401 invalid_client`; register Service B as a confidential client. By default a client can introspect only its own tokens. Put Service B in `ProtectedResource.IntrospectionClients` for the `https://api.b.example.com` audience to delegate access-token introspection to that resource server. This delegation never covers refresh tokens. See [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) for the full wiring.
:::
