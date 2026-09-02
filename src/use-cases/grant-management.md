---
title: Grant management
description: Let clients create, replace, merge, query, and revoke long-lived grants by id, with deletion limited to the named grant_id.
pageClass: pg-use-cases-grant-management
---

# Use case — Grant management

When a grant is long-lived — a recurring payment mandate, a standing data-access consent — the client needs more than "authorize once and hope". It needs to name a grant, add to it later, read back what it currently holds, and tear it down. The [OAuth 2.0 Grant Management draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-grant-management) gives each grant a stable `grant_id` and five actions over it.

`op.WithGrantManagement` honours the `grant_management_action` / `grant_id` authorization parameters, mounts the grant management endpoint (query / revoke), stamps `grant_id` onto the token response, and advertises the feature in discovery.

Use it when clients must manage a consent-like grant after the first authorization, especially when the grant can grow or be revoked independently of one browser session. Do not enable it for short-lived, one-shot sign-in flows: regular authorization codes, refresh-token rotation, and normal token revocation are simpler when the client never needs to name a grant.

<figure class="fig">
  <div class="fig-head">What sets a grant, and what reaches its tokens</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-grantmgmt-title" viewBox="0 0 960 300" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-grantmgmt-title">Create, replace and merge travel on the authorization request and decide the grant's scope and authorization details. Query and revoke are operations on the grant management endpoint. Of all five, only revoke reaches the tokens bound to the grant.</title>
    <text class="fg-lbl" x="36" y="26">on the authorization request</text>
    <rect class="fg-box" x="36" y="38" width="264" height="40" rx="6"/>
    <text class="fg-mxs fg-accent" x="54" y="58">create</text>
    <text class="fg-xs" x="54" y="72">no grant_id — the OP mints one</text>
    <rect class="fg-box" x="36" y="86" width="264" height="40" rx="6"/>
    <text class="fg-mxs fg-accent" x="54" y="106">replace</text>
    <text class="fg-xs" x="54" y="120">scope := whatever this request asked for</text>
    <rect class="fg-box" x="36" y="134" width="264" height="40" rx="6"/>
    <text class="fg-mxs fg-accent" x="54" y="154">merge</text>
    <text class="fg-xs" x="54" y="168">scope := the existing set, plus the new</text>
    <path class="fg-leader" d="M304,58 H336 M304,106 H336 M304,154 H336 M336,58 V154"/>
    <path class="fg-edge fg-edge--accent" d="M336,106 H366" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="370" y="60" width="250" height="92" rx="8"/>
    <text class="fg-t2 fg-accent" x="390" y="86">The grant</text>
    <text class="fg-mxs" x="390" y="108">grant_id = g-9f3c…</text>
    <text class="fg-xs" x="390" y="128">scope + authorization_details</text>
    <text class="fg-xs" x="390" y="144">one record, however many tokens</text>
    <path class="fg-edge" d="M495,156 V186" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--sub" x="370" y="190" width="250" height="90" rx="8"/>
    <text class="fg-lbl" x="390" y="212">bound to this grant</text>
    <text class="fg-mxs" x="390" y="234">JWT access tokens</text>
    <text class="fg-mxs" x="390" y="252">opaque access tokens</text>
    <text class="fg-mxs" x="390" y="270">refresh tokens</text>
    <text class="fg-lbl" x="660" y="26">on the grant management endpoint</text>
    <rect class="fg-box" x="660" y="38" width="264" height="64" rx="6"/>
    <text class="fg-mxs" x="678" y="60">GET …/{grant_id}</text>
    <text class="fg-xs" x="678" y="80">reads back the scope and details</text>
    <text class="fg-xs" x="678" y="96">it changes nothing</text>
    <path class="fg-edge fg-edge--muted" d="M656,70 H624" marker-end="url(#fg-am)"/>
    <rect class="fg-box fg-box--danger" x="660" y="180" width="264" height="80" rx="6"/>
    <text class="fg-mxs" x="678" y="204">DELETE …/{grant_id}</text>
    <text class="fg-xs" x="678" y="224">204 · the grant record is gone</text>
    <text class="fg-xs fg-danger" x="678" y="246">and every bound token with it</text>
    <path class="fg-edge fg-edge--danger" d="M656,225 H624" marker-end="url(#fg-ad)"/>
  </svg>
  <figcaption class="fig-note">The lower arrow is the only one that touches the box at the bottom. Changing a grant's scope does not invalidate tokens already issued under it — the new scope applies from the next issuance onward.</figcaption>
</figure>

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
