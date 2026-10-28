---
title: Custom Grant — wiring
description: Define a custom grant_type URN without colliding with built-in grants — handler context, BoundAccessToken, ParamPolicy, and OP-owned issuance.
pageClass: pg-use-cases-custom-grant
---

# Use case — Custom Grant

Some scenarios need a `grant_type` the standard catalog does not cover: a vendor-specific service-token-exchange URN, an internal "issue a token for this external assertion" path, a transitional shim while migrating off a legacy authorization server. `op.WithCustomGrant(...)` registers a handler for a `grant_type` URN you define, and the OP routes matching `/token` requests to it. Client authentication, DPoP / mTLS verification, token signing, and storage stay with the OP.

::: details `grant_type` URN — what's that?
A `grant_type` is the `/token` form parameter that selects which issuance path runs (`authorization_code`, `client_credentials`, `refresh_token`, and so on). The built-in short names are taken, so a custom grant uses a URN of the form `urn:<vendor>:<your-name>`, which keeps two vendors from colliding. `urn:ietf:params:oauth:grant-type:device_code` is an IETF-defined one; `urn:example:libraz:service-token-exchange` is the kind an embedder defines for itself. RFC 6749 §4.5 recommends the URN form, but the OP does not enforce a shape.
:::

::: details Issuance pipeline — what's that?
The code path every grant runs through once the dispatcher has identified it: scope intersection against the client's allow-list, audience intersection against registered resources, a TTL clamp against the global ceiling, `cnf` stamping for sender-bound tokens, and refresh-token chain tracking. A custom grant gets the scope, audience, and TTL checks, and `cnf` stamping when it returns a `BoundAccessToken`. It can also ask the OP to issue a refresh token with `IssueRefreshToken`, but the handler never supplies the refresh-token value itself.
:::

::: warning Use the standard grants when you can
Custom grants exist for the cases where the standard catalog (`authorization_code`, `client_credentials`, `refresh_token`, `urn:ietf:params:oauth:grant-type:device_code`, `urn:ietf:params:oauth:grant-type:token-exchange`, CIBA) genuinely does not fit. The handler decides who the subject is and whether the request deserves a token, and everything it decides is its own responsibility: how it verifies the input, which subject it names, and (for handler-signed tokens) the sender binding. Pick a custom grant only when the standard ones force a worse design.
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

  // Custom grants sit outside the built-in grant set, so WithGrants
  // only chooses the built-ins this OP still serves. refresh_token is
  // listed because the handler below can ask for a refresh token;
  // naming it also drops the default authorization_code grant.
  op.WithGrants(grant.RefreshToken),

  op.WithCustomGrant(&serviceTokenHandler{}),
  // op.WithCustomGrant can be called repeatedly to register multiple handlers.

  op.WithStaticClients(op.ConfidentialClient{
    ID:         "billing-service",
    Secret:     billingSecret,
    AuthMethod: op.AuthClientSecretBasic,
    // The client must list the custom URN, or /token answers
    // unauthorized_client.
    GrantTypes: []string{"urn:example:libraz:service-token-exchange"},
    Scopes:     []string{"service.invoke"},
    // Every Audience the handler returns must appear here.
    Resources:  []string{"https://api.b.example.com"},
  }),
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

`Name()` is compared byte-for-byte with every grant the OP implements: `authorization_code`, `refresh_token`, `client_credentials`, the Device Code and CIBA URNs, and the RFC 8693 token-exchange URN. The comparison applies whether or not that built-in grant is enabled, so a custom handler can never take over one of them; choose a deployment-owned URN instead.

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
    targets := req.Form["target_service"]
    if len(targets) != 1 {
        return op.CustomGrantResponse{}, &op.Error{
            Code:        "invalid_request",
            Description: "target_service is required",
        }
    }
    target := targets[0]
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

`req.Subject` is always `nil` and `req.AuthTime` is always the zero time. A token request authenticates the client, not an end user, and the OP does not interpret custom-grant parameters to invent a subject or authentication ceremony. Resolve any subject in the handler and report it through `CustomGrantResponse.Subject` (or `BoundAccessToken.Subject`); report its authentication time through `CustomGrantResponse.AuthTime` when the handler has one. `req.Client` is a copy, so changing it widens nothing the OP checks afterwards.

### What the handler returns as an error

| Handler returns | Wire response |
|---|---|
| An `*op.Error` (or an error wrapping one) | Sent as is, with the error code you chose. |
| Any other Go error | `400 invalid_grant`, with the message withheld from the response. |
| A panic | `500 server_error`; the stack trace goes to the audit stream only. |

## Two issuance shapes

The handler chooses between **OP-signed** (`BoundAccessToken`) and **handler-signed** (`AccessToken`) — they are mutually exclusive.

<figure class="fig">
  <div class="fig-head">Two shapes a custom grant can return</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-customgrant-title" viewBox="0 0 960 520" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-customgrant-title">A custom grant handler can return a bound access token, in which case the OP owns the signing key, the standard claims, the confirmation claim, the ID token and the refresh token; or it can return an already-signed access token, in which case the signature, the confirmation claim, introspection and revocation reach become the handler's responsibility.</title>
    <rect class="fg-box fg-box--accent" x="340" y="24" width="280" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="356" y="52">CustomGrantHandler</text>
    <text class="fg-mxs" x="356" y="76">Handle(ctx, req)</text>
    <!-- branches -->
    <path class="fg-leader" d="M480,96 V120 M248,120 H712"/>
    <path class="fg-edge fg-edge--thin fg-edge--accent" d="M248,120 V144" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--thin" d="M712,120 V144" marker-end="url(#fg-a)"/>
    <!-- card: OP-signed -->
    <rect class="fg-box fg-box--accent" x="32" y="144" width="432" height="96" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="172">return BoundAccessToken</text>
    <text class="fg-s fg-accent" x="48" y="196">the default choice</text>
    <text class="fg-s" x="48" y="220">the OP picks the key and mints the JWT</text>
    <!-- card: handler-signed -->
    <rect class="fg-box" x="496" y="144" width="432" height="96" rx="8"/>
    <text class="fg-m" x="512" y="172">return AccessToken</text>
    <text class="fg-s fg-warn" x="512" y="196">only with a concrete reason</text>
    <text class="fg-s" x="512" y="220">for an external KMS or an opaque backend</text>
    <!-- band: OP-signed -->
    <rect class="fg-group" x="32" y="272" width="432" height="224" rx="8"/>
    <text class="fg-lbl" x="56" y="300">who handles it</text>
    <!-- band: handler-signed -->
    <rect class="fg-group" x="496" y="272" width="432" height="224" rx="8"/>
    <text class="fg-lbl" x="520" y="300">who handles it</text>
    <text class="fg-s" x="56" y="341">signing key and JWT</text>
    <rect class="fg-pill fg-pill--ok" x="344" y="320" width="96" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="392" y="341" text-anchor="middle">the OP</text>
    <text class="fg-s" x="520" y="341">the signature itself</text>
    <rect class="fg-pill fg-pill--warn" x="808" y="320" width="96" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="856" y="341" text-anchor="middle">you</text>
    <text class="fg-s" x="56" y="381">claims · cnf · TTL ceiling</text>
    <rect class="fg-pill fg-pill--ok" x="344" y="360" width="96" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="392" y="381" text-anchor="middle">the OP</text>
    <text class="fg-s" x="520" y="381">cnf binding</text>
    <rect class="fg-pill fg-pill--warn" x="808" y="360" width="96" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="856" y="381" text-anchor="middle">you</text>
    <text class="fg-s" x="56" y="421">ID token · refresh token</text>
    <rect class="fg-pill fg-pill--ok" x="344" y="400" width="96" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="392" y="421" text-anchor="middle">the OP</text>
    <text class="fg-s" x="520" y="421">introspection</text>
    <rect class="fg-pill fg-pill--warn" x="808" y="400" width="96" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="856" y="421" text-anchor="middle">you</text>
    <text class="fg-s" x="56" y="461">revocation wiring</text>
    <rect class="fg-pill fg-pill--ok" x="344" y="440" width="96" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="392" y="461" text-anchor="middle">the OP</text>
    <text class="fg-s" x="520" y="461">revocation reach</text>
    <rect class="fg-pill fg-pill--warn" x="808" y="440" width="96" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="856" y="461" text-anchor="middle">you</text>
  </svg>
  <figcaption class="fig-note">The right-hand shape exists for cases where the signing key genuinely is not the OP's to use. Reaching for it otherwise moves four separate obligations from the library onto your handler, and they are the ones that are easy to get subtly wrong.</figcaption>
</figure>

A handler that returns both, or neither, yields `500 server_error`, because exactly one party owns issuance.

::: details OP-signed vs handler-signed — what's the trade-off?
**OP-signed** (`BoundAccessToken`) means the OP signs a JWT with its active signing key. It also stamps `cnf` from the verified DPoP / mTLS proof on the request and merges your extra claims. The result is always an RFC 9068 JWT, even when the deployment issues opaque access tokens for the built-in grants, because an opaque record cannot carry the claims and audience set the handler stated. **Handler-signed** (`AccessToken`) means you bring an already-formed token, typically from an external KMS / HSM or an opaque token your introspection backend understands, and the OP echoes it verbatim. You own everything from there, including `cnf` if the token must be sender-bound. Pick OP-signed unless you have a hard reason not to.
:::

### `BoundAccessToken` — OP signs and binds

When the handler does not have an out-of-band signing key, hand back a `BoundAccessToken`. The OP:

- Signs a JWT-shape access token with its active signing key.
- Fills `iss / sub / aud / exp / iat / jti / scope / client_id`.
- Stamps `cnf.jkt` (DPoP) or `cnf.x5t#S256` (mTLS) automatically when the request presented a verified proof — the handler does not need to thread the binding through itself.
- Merges `ExtraClaims`. A name the OP manages itself (`iss`, `sub`, `aud`, `client_id`, `iat`, `exp`, `jti`, `scope`, `auth_time`, `acr`, `amr`, `cnf`, `gid`, `authorization_details`, `userinfo_claims`) yields `500 server_error`, so the bug shows up in the audit stream instead of shipping a malformed token.
- Falls back to `CustomGrantResponse.Subject` when `BoundAccessToken.Subject` is empty, and to the response `Audience`, then the `client_id`, when `BoundAccessToken.Audience` is empty. With no subject at all the response is `server_error`.

This is the right default for most embedders. When the request carries a verified DPoP or mTLS proof, this path applies the sender constraint that the FAPI 2.0 Security Profile §5.3.2.1(4)–(5) requires for access tokens.

### `AccessToken` — handler signs

When the handler signs with an external KMS / HSM key, or mints an opaque token backed by its own introspection backend, write the value into `CustomGrantResponse.AccessToken` directly. The OP echoes it verbatim.

::: warning Handler-signed = you own the binding
With `AccessToken` the OP does **not** stamp `cnf` for you. If `req.DPoP != nil` or `req.MTLSCert != nil` and you mint a JWT, **you** must embed `cnf.jkt` / `cnf.x5t#S256` in the claims. Opaque-format handlers must surface the binding through their own introspection backend — the OP does not maintain a shadow row for handler-supplied tokens.
:::

## ParamPolicy

The `ParamPolicy` declares what the OP exposes in `req.Form`:

::: details ParamPolicy — what's that?
The `/token` form parser rejects parameters it does not recognise, so a misbehaving client cannot smuggle extra inputs past the handler. `ParamPolicy` is how a custom grant tells the parser "these names are mine, pass them through". `Allowed` lists the form keys the handler reads, and `DupesAllowed` is the subset where repeated values are accepted (the default is single-value only). The shared parameters (`grant_type`, `client_id`, `client_secret`, `scope`, and so on) are always accepted. Credential-shaped names cannot be duplicate-allowed: the OP refuses to construct rather than let a handler widen the credential surface.
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

The OP applies these checks before and after `Handle`, whatever the handler returns:

| Check | Behaviour |
|---|---|
| Client registration | The client's `GrantTypes` must list the URN, or the response is `400 unauthorized_client`. |
| Parameters | Names outside `ParamPolicy.Allowed` and repeats of single-value names yield `400 invalid_request`. A duplicate-allowed name takes at most `CustomGrantDupCap` (32) values. |
| Scope | `CustomGrantResponse.Scope` must be within the client's registered scopes, or `400 invalid_scope`. |
| Audience | Each `Audience` entry must be a resource registered for the client, or `400 invalid_target`. |
| TTL | A value above the global access-token ceiling is silently truncated to it. Zero means "use the OP's default lifetime". A negative value is `500 server_error`. |
| ID token | When `Scope` contains `openid` and `IDToken` is empty, the OP signs an id_token from `Subject`, `AuthTime`, and `ExtraClaims`. A non-empty `IDToken` is returned as is. |
| Subject liveness | A response that descends from a stored grant is refused once the user store no longer holds its subject. |

The audit stream records `custom_grant.requested` for every attempt that reaches a handler, `custom_grant.failed` (with a `reason`) for each rejection, and `custom_grant.refresh_dropped` when a requested refresh token is withheld.

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

The issued refresh token therefore uses the normal rotation, replay cascade (RFC 9700 §2.2.2), and revocation machinery. Access tokens minted when this chain rotates are always JWTs, as with `BoundAccessToken`.

When `IssueRefreshToken` is true, the OP drops the refresh token (the access-token response still succeeds) if any of these five conditions fails:

- The provider must serve the `refresh_token` grant (`grant.RefreshToken` in `WithGrants`).
- The client must be registered for the `refresh_token` grant.
- The response must have a non-empty subject.
- The response scope must be non-empty.
- The response must contain at most one audience.

Each drop emits `custom_grant.refresh_dropped` with a `reason`: `provider_grant_disabled`, `client_not_registered`, `empty_subject`, `empty_scope`, or `multiple_resource_audience`. A drop never fails the access token or the ID token.

::: details Refresh-token lineage — what's that?
The OP records each refresh token's parent so a rotation produces a chain (`A → B → C`); when a retired token is replayed (RFC 9700 §2.2.2), the OP can revoke the whole chain at once. `IssueRefreshToken` keeps custom grants inside that OP-owned chain. A handler cannot supply a refresh-token value itself, because RFC 6749 §6 treats the refresh token as a credential issued by the authorization server.
:::

## What the OP refuses

- **Handler-supplied refresh-token values**. Use `IssueRefreshToken: true` when the OP should mint one.
- **Both `AccessToken` and `BoundAccessToken`**. Mutually exclusive — setting both yields `server_error`.
- **Reserved-claim collisions** in `ExtraClaims`. In `CustomGrantResponse.ExtraClaims` (the id_token), `iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid` yield `server_error`; the access-token list is under `BoundAccessToken`. (`TokenExchangePolicy.ExtraClaims` behaves differently: reserved names are dropped silently, so the policy cannot rewrite them.)

Failures the client can fix use a 4xx OAuth error. A failure the OP cannot attribute to the client returns `500 server_error`, never `invalid_grant`. That covers a recovered handler panic, a response-shape conflict, a reserved-claim collision, and an OP-side signing or storage fault. A client registered with `RequireAuthTime` whose response requests `openid` without a non-zero `AuthTime` also gets `500 server_error` from the automatic id_token.

## Revocation, user deletion, and pairwise `/userinfo`

A custom grant's credentials belong to no stored grant unless your handler records one, because the handler, not a consent record, vouches for the subject. Two consequences follow:

- `Provider.RevokeSubject` does not reach these tokens. They stay valid until they expire or you revoke them one by one, so revoke them yourself when an account is removed.
- Under pairwise subjects, `/userinfo` answers `invalid_token` for them, since there is no grant to resolve the public subject from.

Token-exchange tokens are the exception: they are issued under the grant of the `subject_token`, so grant revocation and user deletion reach them (see [Token Exchange](/use-cases/token-exchange)).

## See it run

[`examples/30-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-custom-grant):

```sh
(cd examples/30-custom-grant && GOWORK=off go run -tags example .)
```

The example defines `urn:example:libraz:service-token-exchange`, registers a handler with `op.WithCustomGrant`, and returns a `BoundAccessToken` so the OP mints a JWT access token bound to the request's DPoP / mTLS confirmation. Files: `op.go` (OP wiring + handler), `client.go` (client side), `probe.go` (self-verify).

## Read next

- [Token Exchange wiring](/use-cases/token-exchange) — a built-in grant that rides the same dispatcher, with policy semantics the OP understands (`act` chain, `cnf` rebinding).
- [Sender constraint](/concepts/sender-constraint) — what `cnf` does and why `BoundAccessToken` stamping it for you matters.
