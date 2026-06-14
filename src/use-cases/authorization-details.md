---
title: Rich authorization requests (RFC 9396)
description: Accept authorization_details, validate each element against a registered type, and echo the granted details on tokens and introspection.
---

# Use case — Rich authorization requests (RFC 9396)

Scopes are coarse: `scope=payments` says *this client may move money*, not *move €40 from IBAN X to IBAN Y once*. [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) (Rich Authorization Requests, "RAR") adds an `authorization_details` parameter — a JSON array of typed objects — so the client can describe exactly what it is asking for, the OP can bind that description to the grant, and every token minted from the grant carries it.

The library accepts `authorization_details` at `/authorize`, `/par`, and `/token`, validates each element against a type you register, persists the granted details on the grant, and echoes them on JWT access tokens (RFC 9068 §2.2.3) and introspection (RFC 9396 §9).

Use RAR when the resource server must decide from structured facts such as amount, account, location, action, or datatype. Do not use it just to create more scope names: if `read:orders` or `payments:initiate` is precise enough, scopes are simpler and better supported by existing clients.

::: details Specs referenced on this page
- [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) — OAuth 2.0 Rich Authorization Requests (§2 structure, §5 errors, §9 introspection, §10 discovery)
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT access tokens (§2.2.3 carries `authorization_details`)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.5 (the `claims` request, the coarser sibling)
:::

::: details Quick refresher
- **`authorization_details`** — a JSON array; each element is an object with a `type` string plus type-specific members (`actions`, `locations`, `datatypes`, or whatever the type defines).
- **`type`** — the RFC 9396 §2 identifier (e.g. `payment_initiation`). The OP only accepts types it has been told about; an unrecognised type is rejected.
- **Validator** — the OP performs the structural checks; the *meaning* of every member beyond `type` is yours to enforce in a per-type validator.
:::

## What the library checks, and what you check

The split is deliberate. The library owns the RFC 9396 §2.1 **structure**: the value is a JSON array of objects, each carries a non-empty string `type` the OP recognises, and the whole request is within conservative size limits. Everything type-specific — that a `payment_initiation` element carries a non-empty `actions` array, that an amount is positive, that a location is one this client may touch — is delegated to the `Validate` function you register with the type.

A type registered without a validator would accept arbitrary payloads under that type, so the library refuses to start: a nil `Validate` is rejected at `op.New`.

## Wiring

Register each type you accept with `op.WithAuthorizationDetailTypes`. This implicitly enables the RAR feature — `authorization_details` becomes acceptable at the three endpoints, granted details are persisted and echoed, and discovery advertises `authorization_details_types_supported`. Passing only `op.WithFeature(feature.RAR)` is not useful on its own because the OP still has no accepted type registry or validators.

```go
import (
  "context"
  "errors"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/store"
)

op.New(
  /* required options */
  op.WithAuthorizationDetailTypes(op.AuthorizationDetailType{
    Type: "payment_initiation",
    Validate: func(_ context.Context, el map[string]any, _ *store.Client) error {
      if _, ok := el["actions"].([]any); !ok {
        return errors.New("payment_initiation requires an actions array")
      }
      return nil
    },
  }),
)
```

`Validate` receives the decoded element (`el["type"]` already equals the registered `Type`) and the authenticated `*store.Client` the request belongs to, so a validator can refuse a `location` the client is not entitled to. It MUST NOT mutate `el`. A non-nil return rejects the whole request with `invalid_authorization_details`.

Each `Type` must be non-empty and unique; a duplicate is rejected at construction. Repeated calls append, so a base set can be layered with a deployment-specific overlay.

The discovery document then advertises:

```json
{
  "authorization_details_types_supported": ["payment_initiation"]
}
```

## Driving it

The client sends `authorization_details` as a URL-encoded JSON array:

```sh
DETAILS='[{"type":"payment_initiation","actions":["initiate"]}]'
curl -G --data-urlencode "authorization_details=$DETAILS" \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'client_id=demo' \
  --data-urlencode 'redirect_uri=https://rp.example.com/callback' \
  --data-urlencode 'scope=openid' \
  --data-urlencode 'code_challenge_method=S256' \
  --data-urlencode "code_challenge=$CHALLENGE" \
  https://op.example.com/oidc/auth
```

The same parameter is accepted on a [PAR](/use-cases/fapi2-baseline) push and at the token endpoint. Once the grant is established, the token response echoes what was granted:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "authorization_details": [{"type": "payment_initiation", "actions": ["initiate"]}]
}
```

A JWT access token carries the same array as an `authorization_details` claim (RFC 9068 §2.2.3), and introspecting the token returns it in the introspection response (RFC 9396 §9), so a resource server reaches the granted details whether it parses the JWT itself or asks the OP.

## Errors

| Condition | Error |
|---|---|
| Value is not a JSON array of objects, or an element has no recognised `type`, or the request exceeds the size limit | `invalid_request` (oversize) / `invalid_authorization_details` (malformed shape) |
| A registered type's `Validate` returns non-nil | `invalid_authorization_details` |

## RAR vs the `claims` parameter

Both narrow what a coarse scope would grant; they answer different questions. The [`claims` parameter](/use-cases/claims-request) asks for *which claims appear where* in the id_token / userinfo. `authorization_details` describes *what the access token may do* at a resource server. They compose — a request may carry both — and the library parses them on the same merge path, distinguishing array (`authorization_details`) from object (`claims`) by shape.

## Read next

- [Claims request parameter](/use-cases/claims-request) — the per-claim sibling mechanism.
- [Grant management](/use-cases/grant-management) — query and revoke the grant your `authorization_details` were bound to.
- [Access token format](/concepts/access-token-format) — where the granted details land on a JWT access token.
