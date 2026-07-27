---
title: Grant management
description: Let clients create, replace, merge, query, and revoke long-lived grants by id via the OAuth 2.0 Grant Management endpoint.
---

# Use case — Grant management

When a grant is long-lived — a recurring payment mandate, a standing data-access consent — the client needs more than "authorize once and hope". It needs to name a grant, add to it later, read back what it currently holds, and tear it down. The [OAuth 2.0 Grant Management draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-grant-management) gives each grant a stable `grant_id` and five actions over it.

`op.WithGrantManagement` honours the `grant_management_action` / `grant_id` authorization parameters, mounts the grant management endpoint (query / revoke), stamps `grant_id` onto the token response, and advertises the feature in discovery.

Use it when clients must manage a consent-like grant after the first authorization, especially when the grant can grow or be revoked independently of one browser session. Do not enable it for short-lived, one-shot sign-in flows: regular authorization codes, refresh-token rotation, and normal token revocation are simpler when the client never needs to name a grant.

::: warning Experimental — tracks an IETF draft
Grant Management is an IETF draft, not a published RFC. The `op.GrantManagementAction` enum and `op.WithGrantManagement` are marked `Experimental:` in godoc: a draft update may make a wire-incompatible change.
:::

::: details The five actions
- **`create`** — start a brand-new grant. A `grant_id` MUST NOT accompany it; the OP mints one and returns it.
- **`replace`** — overwrite the referenced grant's scope and `authorization_details` with the new request's. Requires `grant_id`.
- **`merge`** — union the referenced grant's scope and `authorization_details` with the new request's. Requires `grant_id`.
- **`query`** — read the grant. `GET {grant_management_endpoint}/{grant_id}`.
- **`revoke`** — delete the grant. `DELETE {grant_management_endpoint}/{grant_id}`.

`create` / `replace` / `merge` ride the authorization request. `query` / `revoke` are operations on the grant management endpoint.
:::

## Wiring

```go
import "github.com/libraz/go-oidc-provider/op"

op.New(
  /* required options */
  op.WithGrantManagement([]op.GrantManagementAction{
    op.GrantActionCreate, op.GrantActionReplace, op.GrantActionMerge,
    op.GrantActionQuery, op.GrantActionRevoke,
  }, false),
)
```

The first argument is the **closed set** of actions the OP accepts; it is advertised as `grant_management_actions_supported`, and the endpoint refuses any operation outside it. The second argument is `actionRequired`: when `true`, an authorization request that omits `grant_management_action` is rejected (discovery advertises `grant_management_action_required: true`). At least one action is required and each must be one of the five values; a duplicate or unknown action is rejected at `op.New`.

The discovery document then advertises:

```json
{
  "grant_management_endpoint": "https://op.example.com/oidc/grant_management",
  "grant_management_actions_supported": ["create", "replace", "merge", "query", "revoke"]
}
```

The endpoint path defaults to `/grant_management` under your mount prefix; override it with `op.WithEndpoints(op.Endpoints{GrantManagement: "..."})`.

## Creating and growing a grant

The client passes `grant_management_action` (and, for `replace` / `merge`, the `grant_id`) on the authorization request:

```sh
# Create — no grant_id allowed
curl -G --data-urlencode 'grant_management_action=create' \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'client_id=demo' \
  --data-urlencode 'redirect_uri=https://rp.example.com/callback' \
  --data-urlencode 'scope=openid profile' \
  https://op.example.com/oidc/auth
```

The same parameters are validated on a [PAR](/use-cases/fapi2-baseline) push. After the code exchange, the token response carries the grant's id:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "grant_id": "g-9f3c..."
}
```

To grow that grant later, the client re-authorizes with `grant_management_action=replace` (overwrite the scope / `authorization_details`) or `merge` (union them), passing the `grant_id` it received.

| Action | `grant_id` | Effect on scope / `authorization_details` |
|---|---|---|
| `create` | must be absent | sets them to the new request's |
| `replace` | required | overwrites with the new request's |
| `merge` | required | unions the existing with the new request's |

## Querying a grant

`GET` the endpoint with the grant id appended, authenticating as the owning client. The OP enforces client ownership — a client cannot read another client's grant — and returns the grant's current scope and `authorization_details`:

```sh
curl -u demo:demo-secret https://op.example.com/oidc/grant_management/g-9f3c...
```

```json
{
  "scopes": [{"scope": "openid profile"}],
  "authorization_details": [{"type": "payment_initiation", "actions": ["initiate"]}]
}
```

## Revoking a grant

`DELETE` tears the grant down and cascades: it tombstones / denylists the grant's JWT access tokens, revokes the opaque access tokens and refresh tokens bound to it, and deletes the grant record so a subsequent query reports it gone.

The revoke unit is not only the path `grant_id`: every active grant the same subject holds with the same client is revoked together. The implementation resolves the target grant's subject, lists that subject's grants, filters by the same `ClientID`, and applies the same cascade to each grant ID. That keeps stores that retain multiple historical grants from leaving a partial consent state visible to the client. The OP answers `204 No Content` and emits a `grant_management.revoked` audit event with `revoked_grant_ids`.

```sh
curl -u demo:demo-secret -X DELETE https://op.example.com/oidc/grant_management/g-9f3c...
```

If an operation is not in the advertised `grant_management_actions_supported` set, the endpoint answers `405 Method Not Allowed` with an `Allow` header naming only the enabled operations — so a client that registered only `query` will not see `DELETE` accepted.

## Read next

- [Rich authorization requests](/use-cases/authorization-details) — the `authorization_details` a grant carries and `merge` unions.
- [Refresh tokens](/concepts/refresh-tokens) — what a revoke cascade tears down.
- [Audit events](/reference/audit-events) — the `grant_management.revoked` event shape.
