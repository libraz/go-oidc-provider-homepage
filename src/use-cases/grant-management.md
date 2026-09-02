---
title: Grant management
description: Let clients create, replace, merge, query, and revoke long-lived grants by id, with deletion limited to the named grant_id.
---

# Use case — Grant management

When a grant is long-lived — a recurring payment mandate, a standing data-access consent — the client needs more than "authorize once and hope". It needs to name a grant, add to it later, read back what it currently holds, and tear it down. The [OAuth 2.0 Grant Management draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-grant-management) gives each grant a stable `grant_id` and five actions over it.

`op.WithGrantManagement` honours the `grant_management_action` / `grant_id` authorization parameters, mounts the grant management endpoint (query / revoke), stamps `grant_id` onto the token response, and advertises the feature in discovery.

Use it when clients must manage a consent-like grant after the first authorization, especially when the grant can grow or be revoked independently of one browser session. Do not enable it for short-lived, one-shot sign-in flows: regular authorization codes, refresh-token rotation, and normal token revocation are simpler when the client never needs to name a grant.

<svg role="img" aria-labelledby="gm-lifecycle-title" viewBox="0 0 760 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="gm-lifecycle-title">The grant lifecycle. create, replace and merge ride the authorization request and set the grant's scope and authorization_details; query and revoke are operations on the grant management endpoint; only revoke reaches the tokens bound to the grant.</title>

  <text x="111" y="26" text-anchor="middle" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="11.5">On the authorization request</text>

  <rect x="16" y="40" width="190" height="40" rx="6"/>
  <text x="30" y="59" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="12" font-weight="600">create</text>
  <text x="30" y="73" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="10">no grant_id — the OP mints one</text>

  <rect x="16" y="92" width="190" height="40" rx="6"/>
  <text x="30" y="111" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="12" font-weight="600">replace</text>
  <text x="30" y="125" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="10">scope := the new request's</text>

  <rect x="16" y="144" width="190" height="40" rx="6"/>
  <text x="30" y="163" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="12" font-weight="600">merge</text>
  <text x="30" y="177" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="10">scope := existing ∪ new</text>

  <path d="M206 60 H240"/>
  <path d="M206 112 H240"/>
  <path d="M206 164 H240"/>
  <path d="M240 60 V164"/>
  <path d="M240 108 H272"/>
  <path d="M266 104 L274 108 L266 112"/>

  <rect x="274" y="60" width="212" height="96" rx="8" stroke="var(--vp-c-brand-2)"/>
  <text x="380" y="88" text-anchor="middle" fill="var(--vp-c-brand-2)" font-family="var(--vp-font-family-base)" font-size="13.5" font-weight="600">Grant</text>
  <text x="380" y="108" text-anchor="middle" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="11">grant_id = g-9f3c…</text>
  <rect x="288" y="118" width="184" height="28" rx="5" fill="var(--vp-c-bg-soft)" stroke="none"/>
  <text x="380" y="136" text-anchor="middle" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="9.5">scope + authorization_details</text>

  <path d="M380 156 V196"/>
  <path d="M376 190 L380 199 L384 190"/>

  <rect x="274" y="200" width="212" height="86" rx="8" stroke-dasharray="5 4"/>
  <text x="380" y="220" text-anchor="middle" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="10.5">tokens bound to this grant</text>
  <text x="380" y="240" text-anchor="middle" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="10">JWT access tokens</text>
  <text x="380" y="258" text-anchor="middle" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="10">opaque access tokens</text>
  <text x="380" y="276" text-anchor="middle" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="10">refresh tokens</text>

  <text x="649" y="26" text-anchor="middle" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="11.5">On the grant management endpoint</text>

  <rect x="554" y="40" width="190" height="40" rx="6"/>
  <text x="568" y="60" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="11">GET …/{grant_id}</text>
  <text x="568" y="74" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="10">reads scope + details</text>

  <rect x="554" y="92" width="190" height="40" rx="6"/>
  <text x="568" y="112" fill="var(--vp-c-text-1)" font-family="var(--vp-font-family-mono)" font-size="11">DELETE …/{grant_id}</text>
  <text x="568" y="126" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="10">204 · grant record deleted</text>

  <text x="649" y="152" text-anchor="middle" fill="var(--vp-c-text-2)" font-family="var(--vp-font-family-base)" font-size="10.5">cascade to every bound token</text>

  <path d="M552 60 H520 V90 H492"/>
  <path d="M498 86 L490 90 L498 94"/>
  <path d="M552 112 H520 V243 H492"/>
  <path d="M498 239 L490 243 L498 247"/>
</svg>

Only `revoke` reaches the bottom box. `create`, `replace` and `merge` change what the grant holds; `query` reads it back; `revoke` deletes the grant record and tears down the tokens hanging off it.

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

`DELETE` tears down only the named `grant_id` and cascades to the artefacts bound to that grant: it tombstones / denylists the grant's JWT access tokens, revokes the opaque access tokens and refresh tokens bound to it, and deletes the grant record so a subsequent query reports it gone. Other grants held by the same subject and client are not touched.

On success, the OP answers `204 No Content` and emits a `grant_management.revoked` audit event for the named grant. A confirmed missing grant or a grant owned by another client returns `404` without attempting a cascade. If the grant store cannot establish whether the grant exists, the OP returns `500 server_error` and performs no cascade. If a cascade side effect fails, the OP returns `500 server_error`, emits `grant_management.revoke_failed`, and leaves the grant retryable/queryable; it does not claim revocation succeeded. A final delete that races with another successful deletion is treated as idempotent success and still returns `204`.

Treat `grant_id` as the revocation unit; if a deployment wants to revoke every grant for a subject or client, it must enumerate and delete those grant IDs explicitly.

```sh
curl -u demo:demo-secret -X DELETE https://op.example.com/oidc/grant_management/g-9f3c...
```

If an operation is not in the advertised `grant_management_actions_supported` set, the endpoint answers `405 Method Not Allowed` with an `Allow` header naming only the enabled operations — so a client that registered only `query` will not see `DELETE` accepted.

## Read next

- [Rich authorization requests](/use-cases/authorization-details) — the `authorization_details` a grant carries and `merge` unions.
- [Refresh tokens](/concepts/refresh-tokens) — what a revoke cascade tears down.
- [Audit events](/reference/audit-events) — the `grant_management.revoked` event shape.
