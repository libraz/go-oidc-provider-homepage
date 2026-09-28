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

<figure class="fig">
  <div class="fig-head">Two shapes a custom grant can return</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-customgrant-title" viewBox="0 0 960 288" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-customgrant-title">A custom grant handler can return a bound access token, in which case the OP owns the signing key, the standard claims, the confirmation claim, the ID token and the refresh token; or it can return an already-signed access token, in which case the confirmation claim and revocation wiring become the handler's responsibility.</title>
    <rect class="fg-box fg-box--accent" x="340" y="24" width="280" height="52" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="48" text-anchor="middle">CustomGrantHandler</text>
    <text class="fg-mxs" x="480" y="66" text-anchor="middle">Handle(ctx, req)</text>
    <path class="fg-leader" d="M480,80 V96 M253,96 H707"/>
    <path class="fg-edge fg-edge--accent" d="M253,96 V116" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--muted" d="M707,96 V116" marker-end="url(#fg-am)"/>
    <rect class="fg-box fg-box--accent" x="36" y="120" width="434" height="146" rx="8"/>
    <text class="fg-m fg-accent" x="56" y="146">return BoundAccessToken</text>
    <text class="fg-lbl fg-accent" x="56" y="166">the default choice</text>
    <line class="fg-rule" x1="56" y1="178" x2="450" y2="178"/>
    <text class="fg-xs" x="56" y="198">the OP picks the key and mints the JWT</text>
    <text class="fg-xs" x="56" y="216">standard claims · cnf · the TTL ceiling</text>
    <text class="fg-xs" x="56" y="234">the ID token and refresh token stay OP-managed</text>
    <text class="fg-xs fg-ok" x="56" y="254">nothing about revocation is yours to wire</text>
    <rect class="fg-box" x="490" y="120" width="434" height="146" rx="8"/>
    <text class="fg-m" x="510" y="146">return AccessToken</text>
    <text class="fg-lbl fg-warn" x="510" y="166">only with a concrete reason</text>
    <line class="fg-rule" x1="510" y1="178" x2="904" y2="178"/>
    <text class="fg-xs" x="510" y="198">the handler returns an already-signed value</text>
    <text class="fg-xs" x="510" y="216">for an external KMS, or an opaque backend</text>
    <text class="fg-xs" x="510" y="234">cnf and introspection are yours to wire</text>
    <text class="fg-xs fg-warn" x="510" y="254">so is making revocation reach anywhere</text>
  </svg>
  <figcaption class="fig-note">The right-hand shape exists for cases where the signing key genuinely is not the OP's to use. Reaching for it otherwise moves four separate obligations from the library onto your handler, and they are the ones that are easy to get subtly wrong.</figcaption>
</figure>

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

This is the right default for most embedders. When the request carries a verified DPoP or mTLS proof, this path applies the sender constraint that the FAPI 2.0 Security Profile §5.3.2.1(4)–(5) requires for access tokens.

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

That means the issued refresh token uses the normal rotation, replay cascade (RFC 9700 §4.14.2), and revocation machinery.

When `IssueRefreshToken` is true, the refresh token is dropped (while the access-token response still succeeds) if any of these five gates fails:

- The provider must serve the `refresh_token` grant (`grant.RefreshToken` in `WithGrants`).
- The client must be registered for the `refresh_token` grant.
- The response must have a non-empty subject.
- The response scope must be non-empty.
- The response must contain at most one audience.

Each drop emits `custom_grant.refresh_dropped` with the policy reason (`provider_grant_disabled`, `client_not_registered`, `empty_subject`, `empty_scope`, or `multiple_resource_audience`). Dropping the refresh token does not by itself fail the access token or an otherwise eligible ID token; an empty scope therefore suppresses only the refresh token and does not reject an otherwise valid response.

::: details Refresh-token lineage — what's that?
The OP records each refresh token's parent so a rotation produces a chain (`A → B → C`); when one of those tokens is replayed (RFC 9700 §4.14.2), the OP can revoke every descendant in one shot. `IssueRefreshToken` keeps custom grants inside that OP-owned chain. A handler cannot provide a refresh-token value directly because RFC 6749 §6 treats the refresh token as an authorization-server-issued credential.
:::

## What the OP refuses

- **Handler-supplied refresh-token values**. Use `IssueRefreshToken: true` when the OP should mint one.
- **Both `AccessToken` and `BoundAccessToken`**. Mutually exclusive — setting both yields `server_error`.
- **Reserved-claim collisions** in `ExtraClaims`. `iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid` (and `act` / `cnf` for `BoundAccessToken`) are dropped silently for `TokenExchangePolicy.ExtraClaims` (so the policy cannot rewrite them) but yield `server_error` for `CustomGrantResponse.ExtraClaims` (so handler bugs surface in the audit record).

Known client-attributable dispatch failures use a 4xx OAuth error. A dispatcher failure, or any OP-internal failure the OP cannot attribute to the client — including a recovered handler panic, a response-shape conflict, a reserved-claim collision, or an OP-owned token construction / storage failure — returns `500 server_error`, never `invalid_grant`. If a client requires authentication time and the custom response requests `openid` without a non-zero `AuthTime`, automatic ID-token construction also returns `500 server_error`.

## See it run

[`examples/30-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-custom-grant):

```sh
(cd examples/30-custom-grant && GOWORK=off go run -tags example .)
```

The embedder defines `urn:example:libraz:service-token-exchange`, the OP routes it via `op.WithCustomGrant`, and the handler returns a `BoundAccessToken` so the dispatcher mints a JWT access token bound to the request's DPoP / mTLS confirmation. Files: `op.go` (OP wiring + handler), `client.go` (client side), `probe.go` (self-verify).

## Read next

- [Token Exchange wiring](/use-cases/token-exchange) — the in-tree custom-grant cousin; same dispatch shape but with policy semantics the OP knows about (act chain, cnf rebinding).
- [Sender constraint](/concepts/sender-constraint) — what `cnf` does and why `BoundAccessToken` stamping it for you matters.
