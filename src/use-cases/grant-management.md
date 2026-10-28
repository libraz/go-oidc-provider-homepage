---
title: Grant management
description: Let clients create, replace, merge, query, and revoke long-lived grants by id, with deletion limited to the named grant_id.
pageClass: pg-use-cases-grant-management
---

# Use case — Grant management

A *grant* is the OP's record of what a user consented to for one client: the scopes and, with [RAR](/use-cases/authorization-details), the `authorization_details`. Ordinarily the OP keeps a single grant per user and client and quietly amends it on each new authorization, and the client never names it. When a grant is long-lived (a recurring payment mandate, a standing data-access consent), the client needs to name it, add to it later, read back what it holds, and tear it down. The [OAuth 2.0 Grant Management draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-grant-management) gives each grant a stable `grant_id` and five actions over it.

`op.WithGrantManagement` honours the `grant_management_action` / `grant_id` authorization parameters, mounts the grant management endpoint (query / revoke), stamps `grant_id` onto the token response, and advertises the feature in discovery.

Use it when clients must manage a consent-like grant after the first authorization, especially when the grant can grow or be revoked independently of one browser session. Skip it for short-lived sign-in flows: authorization codes, refresh-token rotation, and ordinary token revocation are simpler when the client never needs to name a grant.

<figure class="fig">
  <div class="fig-head">What sets a grant, and what reaches its tokens</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-grantmgmt-title" viewBox="0 0 960 368" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-grantmgmt-title">Create, replace and merge travel on the authorization request and decide the grant's scope and authorization details. Query and revoke are operations on the grant management endpoint. Of all five, only revoke reaches the tokens bound to the grant.</title>
    <!-- labels -->
    <text class="fg-lbl" x="32" y="40">on the authorization request</text>
    <text class="fg-lbl" x="688" y="40">on the grant endpoint</text>
    <!-- create -->
    <rect class="fg-box" x="32" y="56" width="264" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="84">create</text>
    <text class="fg-s" x="48" y="108">no grant_id; the OP mints one</text>
    <!-- replace -->
    <rect class="fg-box" x="32" y="160" width="264" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="188">replace</text>
    <text class="fg-s" x="48" y="212">scope := this request</text>
    <!-- merge -->
    <rect class="fg-box" x="32" y="264" width="264" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="292">merge</text>
    <text class="fg-s" x="48" y="316">scope := existing + new</text>
    <!-- into the grant -->
    <path class="fg-leader" d="M296,92 H320 M296,196 H320 M296,300 H320 M320,92 V300"/>
    <path class="fg-edge fg-edge--accent" d="M320,196 H344" marker-end="url(#fg-ac)"/>
    <!-- grant -->
    <rect class="fg-box fg-box--accent" x="344" y="112" width="296" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="360" y="140">The grant</text>
    <text class="fg-mxs" x="360" y="164">grant_id = g-9f3c…</text>
    <text class="fg-xs" x="360" y="188">scope + details, one record</text>
    <!-- to tokens -->
    <path class="fg-edge" d="M492,208 V248" marker-end="url(#fg-a)"/>
    <!-- tokens -->
    <rect class="fg-box fg-box--sub" x="344" y="248" width="296" height="96" rx="8"/>
    <text class="fg-t2" x="360" y="276">Tokens bound to it</text>
    <text class="fg-mxs" x="360" y="300">access tokens (JWT, opaque)</text>
    <text class="fg-mxs" x="360" y="324">refresh tokens</text>
    <!-- query -->
    <rect class="fg-box" x="688" y="56" width="240" height="96" rx="8"/>
    <text class="fg-mxs" x="704" y="84">GET …/{grant_id}</text>
    <text class="fg-xs" x="704" y="108">reads scope and details</text>
    <text class="fg-xs" x="704" y="132">changes nothing</text>
    <path class="fg-edge fg-edge--muted" d="M688,136 H640" marker-end="url(#fg-am)"/>
    <!-- revoke -->
    <rect class="fg-box fg-box--danger" x="688" y="248" width="240" height="96" rx="8"/>
    <text class="fg-mxs" x="704" y="276">DELETE …/{grant_id}</text>
    <text class="fg-xs" x="704" y="300">204 · record deleted</text>
    <text class="fg-xs fg-danger" x="704" y="324">every bound token goes too</text>
    <path class="fg-edge fg-edge--danger" d="M688,296 H640" marker-end="url(#fg-ad)"/>
  </svg>
  <figcaption class="fig-note">Only the delete arrow reaches the tokens. Changing a grant's scope does not change tokens already issued under it; the new scope applies from the next issuance. A <code>replace</code> that drops an <code>authorization_details</code> element withdraws it from opaque access tokens and refresh chains; a JWT already issued keeps the claim until it expires.</figcaption>
</figure>

Only `revoke` reaches the bottom box. `create`, `replace`, and `merge` change what the grant holds; `query` reads it back; `revoke` deletes the grant record and the tokens hanging off it.

::: warning Experimental — tracks an IETF draft
Grant Management is an IETF draft, not a published RFC. The `op.GrantManagementAction` enum and `op.WithGrantManagement` are marked `Experimental:` in godoc: a draft update may make a wire-incompatible change.
:::

::: details The five actions
- **`create`** — start a brand-new grant. A `grant_id` MUST NOT accompany it; the OP mints one and returns it. Each `create` makes a separate grant, even for the same user and client.
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

The first argument is the **closed set** of actions the OP accepts; it is advertised as `grant_management_actions_supported`, and the endpoint refuses any operation outside it. The second argument is `actionRequired`: when `true`, an authorization request that omits `grant_management_action` is rejected (discovery advertises `grant_management_action_required: true`). At least one action is required and each must be one of the five values; a duplicate or unknown action is rejected at `op.New`, and so is a second `WithGrantManagement` call.

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

The same parameters are validated on a [PAR](/use-cases/fapi2-baseline) push. A `create` or `replace` / `merge` request always goes through an explicit consent screen: the first-party consent skip and a cached grant never cover it. After the code exchange, the token response carries the grant's id:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "grant_id": "g-9f3c..."
}
```

To change that grant later, the client re-authorizes with `grant_management_action=replace` (overwrite the scope / `authorization_details`) or `merge` (union them), passing the `grant_id` it received. A `grant_id` that does not belong to the signed-in user and this client is refused with `invalid_grant`.

| Action | `grant_id` | Effect on scope / `authorization_details` |
|---|---|---|
| `create` | must be absent | sets them to the new request's |
| `replace` | required | overwrites with the new request's |
| `merge` | required | unions the existing with the new request's |

## Querying a grant

`GET` the endpoint with the grant id appended, authenticating as the owning client. Only **confidential** clients may call the endpoint; a public client gets `401 invalid_client`, because a `grant_id` in a URL path is not a secret (it reaches proxy logs and browser history). The OP enforces ownership, so a client cannot read another client's grant, and returns the grant's current scope and `authorization_details`:

```sh
curl -u demo:demo-secret https://op.example.com/oidc/grant_management/g-9f3c...
```

```json
{
  "scopes": [{"scope": "openid profile"}],
  "authorization_details": [{"type": "payment_initiation", "actions": ["initiate"]}]
}
```

A member is omitted when the grant holds nothing for it.

## Revoking a grant

`DELETE` tears down only the named `grant_id`, and everything bound to it: the grant's JWT access tokens (by tombstone, or by the registry, depending on the revocation strategy), its opaque access tokens and refresh tokens, and finally the grant record, so a later query reports it gone. Other grants held by the same subject and client are not touched. To revoke every grant of a subject or client, enumerate and delete those `grant_id`s yourself.

| Outcome | Response |
|---|---|
| Revoked | `204 No Content`, and a `grant_management.revoked` audit event for the grant. A delete that races with another successful deletion also returns `204`. |
| Grant does not exist, or belongs to another client | `404 invalid_request`, with no cascade attempted. |
| The grant store cannot say whether the grant exists | `500 server_error`, with no cascade. Retry. |
| A cascade step fails | `500 server_error` and a `grant_management.revoke_failed` audit event. The grant record is kept, so it stays queryable and the delete can be retried. |
| Public client | `401 invalid_client` |

```sh
curl -u demo:demo-secret -X DELETE https://op.example.com/oidc/grant_management/g-9f3c...
```

If an operation is not in the advertised `grant_management_actions_supported` set, the endpoint answers `405 Method Not Allowed` with an `Allow` header naming only the enabled operations — so a client that registered only `query` will not see `DELETE` accepted.

## Read next

- [Rich authorization requests](/use-cases/authorization-details) — the `authorization_details` a grant carries and `merge` unions.
- [Refresh tokens](/concepts/refresh-tokens) — what a revoke cascade tears down.
- [Audit events](/reference/audit-events) — the `grant_management.revoked` event shape.
