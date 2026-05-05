---
title: Custom Grant — wiring
description: Define your own grant_type URN and route it through the OP — handler contract, BoundAccessToken, ParamPolicy.
---

# Use case — Custom Grant

Some scenarios need a `grant_type` the standard catalog does not cover: a vendor-specific service-token-exchange URN, an internal "issue token from external assertion" path, a transitional shim while migrating off a legacy AS. `op.WithCustomGrant(...)` is the seam that lets the OP route an embedder-defined URN through `/token` without having to fork the dispatcher.

::: details `grant_type` URN — what's that?
A `grant_type` is the `/token` form parameter that selects which issuance path runs (`authorization_code`, `client_credentials`, `refresh_token`, etc.). The well-known values are short strings; everything custom uses a URN of the form `urn:<vendor>:<your-name>` so two vendors don't collide on the same name. `urn:ietf:params:oauth:grant-type:device_code` is the IETF-blessed example; `urn:example:libraz:service-token-exchange` is what an embedder would mint for itself.
:::

::: details Issuance pipeline — what's that?
The shared code path that the standard grants run through after the dispatcher has identified them: scope intersection against the client's allow-list, audience intersection against registered resources, TTL clamp against the global ceiling, `cnf` stamping for sender-bound tokens, refresh-token lineage tracking. Custom grants get a thin slice of this pipeline (scope / audience / TTL / `cnf`) but **not** refresh-token lineage — see "What the OP refuses" below.
:::

::: warning Use the standard grants when you can
Custom grants exist for the cases where the standard catalog (`authorization_code`, `client_credentials`, `refresh_token`, `urn:ietf:params:oauth:grant-type:device_code`, `urn:ietf:params:oauth:grant-type:token-exchange`, CIBA) genuinely does not fit. They bypass the issuance pipeline that the standard grants share — your handler is responsible for getting scope, audience, and binding right. Pick a custom grant only when the standard ones force a worse design.
:::

## Registering a handler

```go
import "github.com/libraz/go-oidc-provider/op"

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

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

## Two issuance shapes

The handler chooses between **OP-signed** (`BoundAccessToken`) and **handler-signed** (`AccessToken`) — they are mutually exclusive.

::: details OP-signed vs handler-signed — what's the trade-off?
**OP-signed** (`BoundAccessToken`) means the OP picks a key from its registered keyset and signs the JWT for you, stamps `cnf` from the verified DPoP / mTLS proof on the request, and merges your extra claims under the reserved-claim filter. **Handler-signed** (`AccessToken`) means you bring an already-formed token (typically from an external KMS / HSM, or an opaque token your introspection backend understands) and the OP echoes it verbatim; you own everything, including `cnf` if the token needs to be sender-bound. Pick OP-signed unless you have a hard reason not to.
:::

### `BoundAccessToken` — OP signs and binds

When the handler does not have an out-of-band signing key, hand back a `BoundAccessToken`. The OP:

- Signs a JWT-shape access token with its active signing key.
- Fills `iss / sub / aud / exp / iat / jti / scope / client_id`.
- Stamps `cnf.jkt` (DPoP) or `cnf.x5t#S256` (mTLS) automatically when the request presented a verified proof — the handler does not need to thread the binding through itself.
- Merges `ExtraClaims` (collisions with the standard set yield `server_error` so the bug surfaces in audit).

This is the right default for most embedders. FAPI 2.0 §3.1.4 binding contract is enforced for free.

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

## What the OP refuses

- **Refresh tokens**. `CustomGrantResponse.RefreshToken` non-empty collapses to `server_error`. Lineage-tracked persistence + rotation for handler-issued refresh tokens is a v2+ design item — until then leave the field empty. The in-tree token-exchange handler is the single exception (its grant_type URN is checked before the gate fires).

::: details Refresh token lineage — what's that?
The OP records each refresh token's parent so a rotation produces a chain (`A → B → C`); when one of those tokens is replayed (RFC 9700 §2.2.2), the OP can revoke every descendant in one shot. Custom grants opt out of this entirely because their handler picks where the token comes from — the OP cannot reason about a chain it didn't build. Until the lineage seam exists for handler-issued refresh tokens, returning one is a hard error.
:::
- **Both `AccessToken` and `BoundAccessToken`**. Mutually exclusive — setting both yields `server_error`.
- **Reserved-claim collisions** in `ExtraClaims`. `iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid` (and `act` / `cnf` for `BoundAccessToken`) are dropped silently for `TokenExchangePolicy.ExtraClaims` (so the policy cannot rewrite them) but yield `server_error` for `CustomGrantResponse.ExtraClaims` (so handler bugs surface in the audit record).

## See it run

[`examples/19-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/19-custom-grant):

```sh
go run -tags example ./examples/19-custom-grant
```

The embedder defines `urn:example:libraz:service-token-exchange`, the OP routes it via `op.WithCustomGrant`, and the handler returns a `BoundAccessToken` so the dispatcher mints a JWT access token bound to the request's DPoP / mTLS confirmation. Files: `op.go` (OP wiring + handler), `client.go` (client side), `probe.go` (self-verify).

## Read next

- [Token Exchange wiring](/use-cases/token-exchange) — the in-tree custom-grant cousin; same dispatch shape but with policy semantics the OP knows about (act chain, cnf rebinding).
- [Sender constraint](/concepts/sender-constraint) — what `cnf` does and why `BoundAccessToken` stamping it for you matters.
