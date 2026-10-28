---
title: Protected resource metadata (RFC 9728)
description: Publish OAuth 2.0 Protected Resource Metadata, including resource audiences and confidential introspection delegation for protected APIs.
pageClass: pg-use-cases-protected-resource-metadata
---

# Use case — Protected resource metadata (RFC 9728)

A client that holds a resource identifier (an API base URL) needs to learn *which authorization server protects it* and *what it accepts* — scopes, bearer methods, the JWKS it signs responses with — without that being hard-coded. [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) defines a well-known document for exactly that, the resource-server counterpart to the OP's own `/.well-known/openid-configuration`.

`op.WithProtectedResources` lets the OP host these documents for one or more resource servers it protects. Each document is served read-only and names the OP's own issuer in `authorization_servers`. The registration can also name confidential clients that are allowed to introspect access tokens addressed to that resource.

Use this when clients discover APIs by resource identifier, or when more than one API needs machine-readable metadata that points back to the same OP. If your clients are all manually configured and already know the issuer, this metadata is optional; it will not add token validation or gateway behavior.

<figure class="fig">
  <div class="fig-head">From a resource identifier to a discovery document</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-prm-title" viewBox="0 0 960 240" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-prm-title">A client that knows only a resource identifier fetches that resource's well-known metadata, reads the authorization_servers member out of it, and follows the named issuer to the provider's own discovery document.</title>
    <!-- 1 identifier -->
    <rect class="fg-box" x="32" y="24" width="428" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="52">The client holds a resource identifier</text>
    <text class="fg-mxs" x="48" y="76">https://op.example.com/api</text>
    <path class="fg-edge" d="M460,60 H500" marker-end="url(#fg-a)"/>
    <!-- 2 fetch metadata -->
    <rect class="fg-box" x="500" y="24" width="428" height="72" rx="8"/>
    <text class="fg-t2" x="516" y="52">It fetches that resource's metadata</text>
    <text class="fg-mxs" x="516" y="76">/.well-known/oauth-protected-resource/api</text>
    <path class="fg-edge" d="M714,96 V144" marker-end="url(#fg-a)"/>
    <!-- 3 names the authorization server -->
    <rect class="fg-box fg-box--accent" x="500" y="144" width="428" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="516" y="172">The document names the authorization server</text>
    <text class="fg-mxs" x="516" y="196">"authorization_servers": [issuer]</text>
    <path class="fg-edge fg-edge--accent" d="M500,180 H460" marker-end="url(#fg-ac)"/>
    <!-- 4 discovery -->
    <rect class="fg-box fg-box--accent" x="32" y="144" width="428" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="172">It follows that issuer to discovery</text>
    <text class="fg-mxs" x="48" y="196">/.well-known/openid-configuration</text>
  </svg>
  <figcaption class="fig-note">Nothing here is configured into the client. Given a URL it wants to call, it can find the provider that governs it — which is what makes a resource server addressable without hard-coding an issuer alongside it.</figcaption>
</figure>

The OP serves both documents in that ladder; validating the bearer token stays with the resource server.

::: details Specs referenced on this page
- [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) — OAuth 2.0 Protected Resource Metadata (§2 parameters, §3 / §3.1 well-known URI, §3.3 `authorization_servers`)
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators (the `resource` identifier form)
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — Bearer token usage (`bearer_methods_supported`)
:::

::: tip The OP advertises, it does not enforce
The OP serves the metadata and stamps itself as the resource's authorization server. It does **not** validate the resource server's bearer tokens — that stays the resource server's job. This option is about *publishing* the relationship, not about turning the OP into a gateway.
:::

## Wiring

```go
import "github.com/libraz/go-oidc-provider/op"

op.New(
  op.WithIssuer("https://op.example.com"),
  /* required options */
  op.WithProtectedResources(op.ProtectedResource{
    Resource:               "https://op.example.com/api",
    ScopesSupported:        []string{"api.read", "api.write"},
    BearerMethodsSupported: []string{"header"},
    IntrospectionClients:   []string{"api-introspector"},
  }),
)
```

| Field | Document parameter |
|---|---|
| `Resource` (required) | `resource` — an RFC 8707 resource indicator: an absolute URI with no fragment |
| `ScopesSupported` | `scopes_supported` |
| `BearerMethodsSupported` | `bearer_methods_supported` — `header`, `body`, `query` |
| `ResourceSigningAlgValuesSupported` | `resource_signing_alg_values_supported` |
| `JWKSURI` | `jwks_uri` |
| `ResourceDocumentation` | `resource_documentation` — a documentation URL |
| `IntrospectionClients` | not an RFC 9728 field; configures audience-scoped `/introspect` delegation |

`Resource` is validated at `op.New` like an RFC 8707 `resource` parameter; an invalid identifier refuses to start. At least one resource is required, and two resources that canonicalise to the same identifier — or whose paths collide on the same well-known mount — are rejected.

## What is served

The document lives under `/.well-known/oauth-protected-resource`. When the resource identifier has a path component, RFC 9728 §3.1 appends it to the well-known path, so each registered resource is served independently:

```sh
curl https://op.example.com/.well-known/oauth-protected-resource/api
```

```json
{
  "resource": "https://op.example.com/api",
  "authorization_servers": ["https://op.example.com"],
  "scopes_supported": ["api.read", "api.write"],
  "bearer_methods_supported": ["header"]
}
```

`authorization_servers` is stamped with the OP's own issuer — the link a client follows back to discovery. Registering two resources (`/orders` and `/inventory`) serves each at its own path-suffixed location; the path is derived from the resource's path component only (host-insensitive per §3.1), which is why two resources whose paths would collide are rejected at construction rather than panicking the router.

`IntrospectionClients` is an OP authorization rule, not a metadata field. The named caller must authenticate as a confidential client; public clients and `token_endpoint_auth_method=none` receive `401 invalid_client` at `/introspect`. Without delegation, a caller sees only its own access tokens. With `IntrospectionClients: []string{"api-introspector"}`, that confidential client may introspect access tokens whose audience is exactly this resource. The audience check is scoped per resource, and refresh tokens are never delegated.

## Read next

- [Discovery](/concepts/discovery) — the OP's own `/.well-known/openid-configuration`.
- [Rich authorization requests](/use-cases/authorization-details) — describe access at a resource the client targets.
- [mTLS](/concepts/mtls) / [Sender-constrained tokens](/concepts/sender-constraint) — binding the bearer tokens a resource server then validates.
