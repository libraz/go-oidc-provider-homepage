---
title: Custom Grant — wiring
description: Define a custom grant_type URN without colliding with built-in grants — handler context, BoundAccessToken, ParamPolicy, and OP-owned issuance.
pageClass: pg-use-cases-custom-grant
---

# Use case — Custom Grant

Some scenarios need a `grant_type` the standard catalog does not cover: a vendor-specific service-token-exchange URN, an internal "issue token from external assertion" path, a transitional shim while migrating off a legacy AS. `op.WithCustomGrant(...)` is the seam that lets the OP route an embedder-defined URN through `/token` without having to fork the dispatcher.

::: details `grant_type` URN — what's that?
A `grant_type` is the `/token` form parameter that selects which issuance path runs (`authorization_code`, `client_credentials`, `refresh_token`, etc.). The well-known values are short strings; everything custom uses a URN of the form `urn:<vendor>:<your-name>` so two vendors don't collide on the same name. `urn:ietf:params:oauth:grant-type:device_code` is the IETF-blessed example; `urn:example:libraz:service-token-exchange` is what an embedder would mint for itself.
:::

::: details Issuance pipeline — what's that?
The shared code path that the standard grants run through after the dispatcher has identified them: scope intersection against the client's allow-list, audience intersection against registered resources, TTL clamp against the global ceiling, `cnf` stamping for sender-bound tokens, and refresh-token lineage tracking. Custom grants share the scope / audience / TTL / `cnf` parts. They can also ask the OP to issue a refresh token by setting `IssueRefreshToken`; the handler still never supplies the refresh-token value itself.
:::

::: warning Use the standard grants when you can
Custom grants exist for the cases where the standard catalog (`authorization_code`, `client_credentials`, `refresh_token`, `urn:ietf:params:oauth:grant-type:device_code`, `urn:ietf:params:oauth:grant-type:token-exchange`, CIBA) genuinely does not fit. They bypass the issuance pipeline that the standard grants share — your handler is responsible for getting scope, audience, and binding right. Pick a custom grant only when the standard ones force a worse design.
:::

## Registering a handler

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

  // The custom grant is an extension dispatcher path. Select built-in
  // grants explicitly; refresh_token is required by the refresh example
  // below, while browser grants remain disabled.
  op.WithGrants(grant.ClientCredentials, grant.RefreshToken),

  op.WithCustomGrant(&serviceTokenHandler{}),
  // op.WithCustomGrant can be called repeatedly to register multiple handlers.
)
```

Construction-time errors:

| Error | When |
|---|---|
| `op.ErrCustomGrantNil` | handler is `nil` |
| `op.ErrCustomGrantNameEmpty` | `Name()` returned `""` |
| `op.ErrCustomGrantBuiltinCollision` | `Name()` collides with a built-in URN |
| `op.ErrCustomGrantDuplicate` | a handler with the same Name was already registered |
| `op.ErrCustomGrantSecretLikeExempt` | `ParamPolicy.DupesAllowed` named a security-sensitive parameter |

`Name()` is compared byte-for-byte with every grant wire the OP implements: `authorization_code`, `refresh_token`, `client_credentials`, the Device Code and CIBA URNs, and the RFC 8693 token-exchange URN. A custom handler cannot replace one of those built-in dispatchers; choose a deployment-owned URN instead.

## The handler interface

```go
type serviceTokenHandler struct{ /* deps */ }

func (h *serviceTokenHandler) Name() string {
    return "urn:example:libraz:service-token-exchange"
}

func (h *serviceTokenHandler) ParamPolicy() op.ParamPolicy {
    return op.ParamPolicy{
        Allowed:      []string{"target_service", "act_as"},
        DupesAllowed: nil,
    }
}

func (h *serviceTokenHandler) Handle(ctx context.Context, req op.CustomGrantRequest) (op.CustomGrantResponse, error) {
    target := req.Form["target_service"][0]
    if !h.allowed(req.Client.ID, target) {
        return op.CustomGrantResponse{}, &op.Error{
            Code:        "invalid_target",
            Description: "client is not allowed to mint tokens for " + target,
        }
    }

    return op.CustomGrantResponse{
        BoundAccessToken: &op.BoundAccessToken{
            Subject:  op.Subject(req.Client.ID),       // service token: sub = client_id
            Audience: []string{target},
            TTL:      5 * time.Minute,
            ExtraClaims: map[string]any{
                "service_chain": h.chainFor(req.Client.ID, target),
            },
        },
        Scope: []string{"service.invoke"},
    }, nil
}
```

`req.Subject` is always `nil` and `req.AuthTime` is always the zero time. A token request authenticates the client, not an end user, and the OP does not interpret custom-grant parameters to invent a subject or authentication ceremony. Resolve any subject in the handler and report it through `CustomGrantResponse.Subject` (or `BoundAccessToken.Subject`); report its authentication time through `CustomGrantResponse.AuthTime` when the handler has one.

## Two issuance shapes

The handler chooses between **OP-signed** (`BoundAccessToken`) and **handler-signed** (`AccessToken`) — they are mutually exclusive.

<svg class="cg-sign" role="img" aria-labelledby="custom-grant-signing-title" viewBox="0 0 760 290" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="custom-grant-signing-title">The two issuance shapes a custom grant can return. With BoundAccessToken the OP owns signing, standard claims, cnf, the ID token, and the refresh token. With AccessToken the handler returns an already-signed value and takes on cnf and introspection wiring itself.</title>
  <defs>
    <marker id="cg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <rect x="280" y="20" width="200" height="52" rx="8"/>
  <text class="h" x="380" y="43" text-anchor="middle">CustomGrantHandler</text>
  <text class="m sub" x="380" y="61" text-anchor="middle">Handle(ctx, req)</text>

  <rect class="accent" x="48" y="134" width="286" height="136" rx="8"/>
  <text class="h accent-text" x="191" y="162" text-anchor="middle">return BoundAccessToken</text>
  <text class="t" x="191" y="190" text-anchor="middle">the OP picks the key and mints the JWT</text>
  <text class="t sub" x="191" y="214" text-anchor="middle">standard claims · <tspan class="m">cnf</tspan> · TTL ceiling</text>
  <text class="t sub" x="191" y="236" text-anchor="middle">id_token and refresh stay OP-managed</text>
  <text class="m accent-text" x="191" y="258" text-anchor="middle">the default choice</text>

  <rect x="426" y="134" width="286" height="136" rx="8"/>
  <text class="h" x="569" y="162" text-anchor="middle">return AccessToken</text>
  <text class="t" x="569" y="190" text-anchor="middle">the handler returns a signed value</text>
  <text class="t sub" x="569" y="214" text-anchor="middle">for an external KMS or opaque backend</text>
  <text class="t sub" x="569" y="236" text-anchor="middle"><tspan class="m">cnf</tspan> and revocation are yours</text>
  <text class="m sub" x="569" y="258" text-anchor="middle">only with a concrete reason</text>

  <path d="M350 72 C330 104 250 112 191 130" marker-end="url(#cg-arrow)"/>
  <path d="M410 72 C430 104 510 112 569 130" marker-end="url(#cg-arrow)"/>
</svg>

The two shapes are mutually exclusive. A handler that returns both yields `server_error`, because exactly one party owns issuance.

::: details OP-signed vs handler-signed — what's the trade-off?
**OP-signed** (`BoundAccessToken`) means the OP picks a key from its registered keyset and signs the JWT for you. It also stamps `cnf` from the verified DPoP / mTLS proof on the request, and merges your extra claims under the reserved-claim filter. **Handler-signed** (`AccessToken`) means you bring an already-formed token — typically from an external KMS / HSM, or an opaque token your introspection backend understands — and the OP echoes it verbatim. You own everything from there, including `cnf` if the token needs to be sender-bound. Pick OP-signed unless you have a hard reason not to.
:::

### `BoundAccessToken` — OP signs and binds

When the handler does not have an out-of-band signing key, hand back a `BoundAccessToken`. The OP:

- Signs a JWT-shape access token with its active signing key.
- Fills `iss / sub / aud / exp / iat / jti / scope / client_id`.
- Stamps `cnf.jkt` (DPoP) or `cnf.x5t#S256` (mTLS) automatically when the request presented a verified proof — the handler does not need to thread the binding through itself.
- Merges `ExtraClaims` (collisions with the standard set yield `server_error` so the bug surfaces in audit).

This is the right default for most embedders. As a result, the OP enforces FAPI 2.0 §3.1.4's binding contract for free.

### `AccessToken` — handler signs

When the handler signs with an external KMS / HSM key, or mints an opaque token backed by its own introspection backend, write the value into `CustomGrantResponse.AccessToken` directly. The OP echoes it verbatim.

::: warning Handler-signed = you own the binding
With `AccessToken` the OP does **not** stamp `cnf` for you. If `req.DPoP != nil` or `req.MTLSCert != nil` and you mint a JWT, **you** must embed `cnf.jkt` / `cnf.x5t#S256` in the claims. Opaque-format handlers must surface the binding through their own introspection backend — the OP does not maintain a shadow row for handler-supplied tokens.
:::

## ParamPolicy

The `ParamPolicy` declares what the OP exposes in `req.Form`:

::: details ParamPolicy — what's that?
The `/token` form parser rejects parameters it does not recognise so a misbehaving client cannot smuggle extra inputs past the handler. `ParamPolicy` is how a custom grant tells the parser "these names are mine, please pass them through" — `Allowed` lists the form keys the handler reads, `DupesAllowed` is the subset where the parser permits repeated values (default = single-value only). Security-sensitive names (`client_secret`, `code_verifier`, etc.) cannot appear in either list — the OP refuses to construct so a misconfigured handler cannot widen the credential surface.
:::

```go
op.ParamPolicy{
    // Names allowed beyond the shared parameters (grant_type, client_id,
    // client_secret, scope, ...). Unknown names yield invalid_request.
    Allowed: []string{"target_service", "act_as"},

    // Subset of Allowed that admits repeated values. Default = no duplicates.
    // The OP enforces a hard cap of CustomGrantDupCap (32) per name.
    DupesAllowed: []string{"target_service"},
}
```

Security-sensitive parameter names (`grant_type` / `client_id` / `client_secret` / `code` / `code_verifier` / `refresh_token` / `subject_token` / `actor_token` / `password` / `client_assertion` / `client_assertion_type`) cannot be in `DupesAllowed` — listing them yields `op.ErrCustomGrantSecretLikeExempt` at construction time so a misconfigured handler cannot downgrade the credential surface.

## What the OP enforces around your handler

These are floors the OP applies before / after `Handle`:

- **Scope intersection** — `CustomGrantResponse.Scope` ∩ client's allowed scopes. Out-of-set entries yield `invalid_scope`.
- **Audience intersection** — each `Audience` entry must match a resource registered for the client. Unknown entries yield `invalid_target`.
- **TTL cap** — `AccessTokenTTL` (or `BoundAccessToken.TTL`) is truncated to the global access-token ceiling with an audit warning if exceeded; negative is rejected.
- **`openid` scope auto-id_token** — when `Scope` contains `openid` and `IDToken` is empty, the OP signs a fresh id_token from `Subject` + `AuthTime` + `ExtraClaims` (reserved-claim filter applies).

## Refresh tokens

Custom grants can opt into OP-managed refresh-token issuance:

```go
return op.CustomGrantResponse{
    BoundAccessToken: &op.BoundAccessToken{ /* ... */ },
    Scope:             []string{"service.invoke", "offline_access"},
    IssueRefreshToken: true,
}, nil
```

The OP owns the refresh-token credential:

- generates the value
- persists it through `RefreshTokenStore`
- shares the access token's grant identity
- binds it to the same DPoP / mTLS proof

That means the issued refresh token uses the normal rotation, replay cascade (RFC 9700 §2.2.2), and revocation machinery.

When `IssueRefreshToken` is true, the refresh token is dropped (while the access-token response still succeeds) if any of these five gates fails:

- The provider must serve the `refresh_token` grant (`grant.RefreshToken` in `WithGrants`).
- The client must be registered for the `refresh_token` grant.
- The response must have a non-empty subject.
- The response scope must be non-empty.
- The response must contain at most one audience.

Each drop emits `custom_grant.refresh_dropped` with the policy reason (`provider_grant_disabled`, `client_not_registered`, `empty_subject`, `empty_scope`, or `multiple_resource_audience`). Dropping the refresh token does not by itself fail the access token or an otherwise eligible ID token; an empty scope therefore suppresses only the refresh token and does not reject an otherwise valid response.

::: details Refresh-token lineage — what's that?
The OP records each refresh token's parent so a rotation produces a chain (`A → B → C`); when one of those tokens is replayed (RFC 9700 §2.2.2), the OP can revoke every descendant in one shot. `IssueRefreshToken` keeps custom grants inside that OP-owned chain. A handler cannot provide a refresh-token value directly because RFC 6749 §6 treats the refresh token as an authorization-server-issued credential.
:::

## What the OP refuses

- **Handler-supplied refresh-token values**. Use `IssueRefreshToken: true` when the OP should mint one.
- **Both `AccessToken` and `BoundAccessToken`**. Mutually exclusive — setting both yields `server_error`.
- **Reserved-claim collisions** in `ExtraClaims`. `iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid` (and `act` / `cnf` for `BoundAccessToken`) are dropped silently for `TokenExchangePolicy.ExtraClaims` (so the policy cannot rewrite them) but yield `server_error` for `CustomGrantResponse.ExtraClaims` (so handler bugs surface in the audit record).

Known client-attributable dispatch failures use a 4xx OAuth error. A dispatcher failure, or any OP-internal failure the OP cannot attribute to the client — including a recovered handler panic, a response-shape conflict, a reserved-claim collision, or an OP-owned token construction / storage failure — returns `500 server_error`, never `invalid_grant`. If a client requires authentication time and the custom response requests `openid` without a non-zero `AuthTime`, automatic ID-token construction also returns `500 server_error`.

## See it run

[`examples/30-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-custom-grant):

```sh
(cd examples/30-custom-grant && go run -tags example .)
```

The embedder defines `urn:example:libraz:service-token-exchange`, the OP routes it via `op.WithCustomGrant`, and the handler returns a `BoundAccessToken` so the dispatcher mints a JWT access token bound to the request's DPoP / mTLS confirmation. Files: `op.go` (OP wiring + handler), `client.go` (client side), `probe.go` (self-verify).

## Read next

- [Token Exchange wiring](/use-cases/token-exchange) — the in-tree custom-grant cousin; same dispatch shape but with policy semantics the OP knows about (act chain, cnf rebinding).
- [Sender constraint](/concepts/sender-constraint) — what `cnf` does and why `BoundAccessToken` stamping it for you matters.
