---
title: Dynamic Client Registration
description: Register, manage, scope, and safely delete clients at runtime with RFC 7591 / RFC 7592, including immutable IAT scope ceilings and bounded deletion snapshots.
pageClass: pg-use-cases-dynamic-registration
---

# Use case — Dynamic Client Registration

## What is Dynamic Client Registration?

In the simplest setup, you (the OP operator) hand-register every RP that integrates with your OP — adding their `client_id`, `client_secret`, redirect URIs, and scopes to your config. This is fine for a handful of internal apps; it doesn't scale to a public ecosystem where dozens of partners want to integrate weekly.

**Dynamic Client Registration (DCR)** is a JSON API that lets RPs register themselves at runtime — they POST their metadata, the OP returns a fresh `client_id` and credentials. To prevent abuse, the OP gates registration with an **Initial Access Token (IAT)** the operator mints out-of-band; you can scope IATs by allowed metadata, expiry, and single-use.

::: details Specs referenced on this page
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration Protocol
- [RFC 7592](https://datatracker.ietf.org/doc/html/rfc7592) — Dynamic Client Registration Management (read / update / delete)
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — Authorization Server Metadata (discovery)
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps (loopback redirect rules referenced below)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2 (`auth_time` / `acr` / `default_max_age`)
:::

::: details Quick refresher
- **Initial Access Token (IAT)** — a short-lived bearer token the operator mints out-of-band and hands to a registering RP. The OP refuses `POST /register` without it; it's the gate that prevents any anonymous caller from creating clients.
- **Registration Access Token (RAT)** — returned to the RP in the 201 response alongside the new `client_id`. The RP uses the RAT (against `registration_client_uri`) for the RFC 7592 read / update / delete operations on its own registration.
:::

> **Source:** [`examples/41-dynamic-registration`](https://github.com/libraz/go-oidc-provider/tree/main/examples/41-dynamic-registration)

## Architecture

<figure class="fig">
  <div class="fig-head">From an initial token to a managed registration</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-dcr-title" viewBox="0 0 960 546" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dcr-title">The operator mints an initial access token and hands it to a new relying party out of band. The RP registers with it and receives a registration access token, which it then uses to read, update and finally delete its own registration.</title>
    <rect class="fg-group" x="30" y="70" width="916" height="118" rx="8"/>
    <rect class="fg-group" x="30" y="196" width="916" height="150" rx="8"/>
    <rect class="fg-group" x="30" y="354" width="916" height="180" rx="8"/>
    <text class="fg-lbl" x="42" y="88">1 · the operator hands out an initial token</text>
    <text class="fg-lbl" x="42" y="214">2 · the RP registers itself</text>
    <text class="fg-lbl" x="42" y="372">3 · the RP manages its own record (RFC 7592)</text>
    <line class="fg-life" x1="150" y1="62" x2="150" y2="534"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="534"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="534"/>
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">Operator</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">you</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="740" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">A new RP</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">not registered yet</text>
    <circle class="fg-badge" cx="15" cy="112" r="8.5"/>
    <text class="fg-badge-t" x="15" y="115" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,112 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="106" text-anchor="middle">IssueInitialAccessToken(ctx, spec)</text>
    <circle class="fg-badge" cx="15" cy="144" r="8.5"/>
    <text class="fg-badge-t" x="15" y="147" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,144 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="138" text-anchor="middle">&lt;iat&gt;</text>
    <circle class="fg-badge" cx="15" cy="178" r="8.5"/>
    <text class="fg-badge-t" x="15" y="181" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--muted" d="M150,178 H830" marker-end="url(#fg-am)"/>
    <text class="fg-xs fg-halo" x="490" y="172" text-anchor="middle">handed over out of band — email, ticket, whatever you already trust</text>
    <circle class="fg-badge" cx="15" cy="262" r="8.5"/>
    <text class="fg-badge-t" x="15" y="265" text-anchor="middle">4</text>
    <path class="fg-edge" d="M830,262 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="230" text-anchor="middle">POST /register</text>
    <text class="fg-mxs" x="665" y="244" text-anchor="middle">Authorization: Bearer &lt;iat&gt;</text>
    <text class="fg-mxs" x="665" y="256" text-anchor="middle">{ redirect_uris, …, client_name }</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="326" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="329" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--accent" d="M500,326 H830" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="665" y="294" text-anchor="middle">201 · { client_id, client_secret?,</text>
    <text class="fg-mxs" x="665" y="308" text-anchor="middle">registration_access_token,</text>
    <text class="fg-mxs" x="665" y="320" text-anchor="middle">registration_client_uri, … }</text>
    <circle class="fg-badge" cx="15" cy="408" r="8.5"/>
    <text class="fg-badge-t" x="15" y="411" text-anchor="middle">6</text>
    <path class="fg-edge" d="M830,408 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="390" text-anchor="middle">GET /register/&lt;client_id&gt;</text>
    <text class="fg-mxs" x="665" y="402" text-anchor="middle">Authorization: Bearer &lt;rat&gt;</text>
    <circle class="fg-badge" cx="15" cy="438" r="8.5"/>
    <text class="fg-badge-t" x="15" y="441" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M500,438 H830" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="665" y="432" text-anchor="middle">200 · the full client metadata</text>
    <circle class="fg-badge" cx="15" cy="470" r="8.5"/>
    <text class="fg-badge-t" x="15" y="473" text-anchor="middle">8</text>
    <path class="fg-edge" d="M830,470 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="464" text-anchor="middle">PUT /register/&lt;client_id&gt; → 200 updated</text>
    <circle class="fg-badge" cx="15" cy="502" r="8.5"/>
    <text class="fg-badge-t" x="15" y="505" text-anchor="middle">9</text>
    <path class="fg-edge" d="M830,502 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="496" text-anchor="middle">DELETE /register/&lt;client_id&gt;</text>
    <circle class="fg-badge" cx="15" cy="530" r="8.5"/>
    <text class="fg-badge-t" x="15" y="533" text-anchor="middle">10</text>
    <path class="fg-edge fg-edge--accent" d="M500,530 H830" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="665" y="524" text-anchor="middle">204 · No Content</text>
  </svg>
  <figcaption class="fig-note">Step 3 is the only leg the specification says nothing about, and it is where the trust actually comes from. Everything after it is scoped to one client by a token that client alone holds.</figcaption>
</figure>

## Wiring

```go
import (
  "github.com/libraz/go-oidc-provider/op"
)

provider, err := op.New(
  /* required options */
  op.WithDynamicRegistration(op.RegistrationOption{
    AllowedGrantTypes:    []string{"authorization_code", "refresh_token"},
    AllowedResponseTypes: []string{"code"},
  }),
)

// Mint an Initial Access Token operationally — pass to the RP out-of-band.
iat, err := provider.IssueInitialAccessToken(ctx, op.InitialAccessTokenSpec{
  TTL:     24 * time.Hour,
  MaxUses: 1,
})
```

`op.WithDynamicRegistration` implicitly activates `feature.DynamicRegistration`, mounts `/register`, and surfaces `registration_endpoint` in the discovery document. Do not also pass `feature.DynamicRegistration` to `op.WithFeature`: the constructor rejects the duplicate so the registration policy has a single owner.

## Open registration and default scope

When `RegistrationOption.Open` is `true`, the OP accepts `POST /register` without an Initial Access Token — anyone reachable on the network can mint a client. The library narrows the resulting trust by **persisting an empty scope set whenever the request omits `scope`**: such a client cannot ask for any scope at `/authorize` until it updates its registration.

```go
op.WithDynamicRegistration(op.RegistrationOption{
  Open:                          true,
  AllowedGrantTypes:             []string{"authorization_code", "refresh_token"},
  AllowedResponseTypes:          []string{"code"},
  OpenRegistrationDefaultScopes: []string{"openid"}, // baseline for scopeless POSTs
})
```

`OpenRegistrationDefaultScopes` is the opt-in baseline. Each entry MUST already be in the OP's scope catalog (the six built-in OIDC standard scopes plus anything added via `WithScope(...)`); unknown values fail at `op.New`. The IAT-bound path is unchanged — when an Initial Access Token is presented, `store.InitialAccessToken.AllowedScopes` still wins.

::: warning Open-registration scope default is empty
An open POST that omits `scope` receives no default scopes unless the embedder sets `OpenRegistrationDefaultScopes`. Set that option explicitly when freshly registered clients should be able to request `openid` or other baseline scopes immediately.
:::

## Scope ceilings and POST versus PUT

The two HTTP methods intentionally have different omission semantics. On `POST /register`, an omitted `scope` receives the registration-path default:

- a non-empty `InitialAccessToken.AllowedScopes` list wins
- an open registration uses `OpenRegistrationDefaultScopes` (empty by default)
- an IAT-bound registration without an IAT ceiling falls back to the OP's public scope catalog, excluding scopes restricted to specific clients

An explicitly supplied scope is always checked against the OP catalog and, when present, the IAT allow-list.

The registration access token (RAT) inherits the IAT's `AllowedScopes` ceiling when the client is created. The ceiling is stored in `store.RegistrationAccessToken.AllowedScopes`, survives every RAT rotation, and is applied to every subsequent `PUT /register/{client_id}`. A management update can narrow the client's scopes but can never widen them past the original IAT ceiling. RATs persisted before this field existed have an empty ceiling and therefore remain unrestricted; SQL installations must add `oidc_registration_access_tokens.allowed_scopes` before using the current adapter (see [SQL migrations](/use-cases/sql-store#sql-migration-before-first-request)).

On `PUT /register/{client_id}`, an omitted `scope` is a request to delete the member, so the stored scope set becomes empty. The RP must send the scopes it wants to keep. This is different from a fresh POST, where omission can select a creation default. Other metadata members follow RFC 7592's update rules: optional fields are cleared when omitted, while a small set of profile fields is reapplied to the OP's defaults.

## Authentication-context client metadata

Three client-metadata fields shape `/authorize` defaults and the `auth_time` claim of the resulting `id_token`. They are accepted both from DCR registration (RFC 7591) and from `op.ClientSeed` static seeds; the OP enforces them at request time.

| Field | Effect | Spec |
|---|---|---|
| `default_max_age` (nullable integer) | When a request omits `max_age`, the OP applies this value as the default. The field is nullable end-to-end so absent and explicit `0` (force re-auth) remain distinguishable on the wire and in storage. | OIDC Core 1.0 §2 / Dynamic Client Registration §2 |
| `default_acr_values` | When a request omits `acr_values`, the OP applies these as the default ACR target. Combine with `op.WithACRPolicy` (see [MFA / step-up](/use-cases/mfa-step-up)) to map to the AAL ladder. | OIDC Core 1.0 §2 / Dynamic Client Registration §2 |
| `require_auth_time` | When `true`, the issued `id_token` must carry `auth_time`. If the OP cannot recover the originating authentication time, token issuance fails with `server_error` rather than fabricating a value. | OIDC Core 1.0 §2 |

::: tip Why server_error on missing auth_time
RFC violations of `require_auth_time` are rare in practice — the OP records `auth_time` whenever it runs the login flow itself. The fabrication path (substituting `iat`, for example) would silently break RPs that audit step-up assurance based on `auth_time`. The constructor-time refusal makes the gap visible at the point that caused it.
:::

## Safety floors that are not negotiable

::: warning Loopback `redirect_uris` and DNS rebinding
The default `application_type` is `web`. Web clients may register an `http` `redirect_uri` only when the host is the **IP literal** `127.0.0.1` or `[::1]`; the textual `localhost` is rejected by default to close the RFC 8252 §8.3 DNS-rebinding window. Web clients that legitimately bind to `localhost` opt in via `op.WithAllowLocalhostLoopback()` so the deviation from the safe default is visible in the configuration site.

Native clients (`application_type=native`) follow OIDC Registration §2 and additionally accept all three loopback hosts (`127.0.0.1` / `[::1]` / `localhost`) over `http` without an opt-in, plus `https` (claimed) and reverse-DNS custom URI schemes (e.g. `com.example.app:/callback`) per RFC 8252 §7.1. Custom schemes that lack a `.` are rejected because non-reverse-DNS schemes collide across applications.

```jsonc
// NG: http://localhost on a web client is rejected by default
{
  "application_type": "web",
  "redirect_uris": ["http://localhost:5173/callback"]
}

// OK: web clients use the IP literal for loopback development
{
  "application_type": "web",
  "redirect_uris": ["http://127.0.0.1:5173/callback"]
}

// OK: native clients may use the localhost loopback
{
  "application_type": "native",
  "redirect_uris": ["http://localhost:49152/callback"]
}
```
:::

## Standard metadata tolerance

The parser follows RFC 7591 §2's tolerance rule. A standard member that this OP does not model, or an unknown vendor member, is ignored and is not echoed in the registration response. For example, `frontchannel_logout_uri`, `software_id`, `software_version`, `backchannel_token_delivery_mode`, `backchannel_client_notification_endpoint`, `backchannel_authentication_request_signing_alg`, `backchannel_user_code_parameter`, and `authorization_details_types` do not configure this DCR endpoint. `tls_client_certificate_bound_access_tokens: false` is a compatibility case: it is accepted as a no-op and is not persisted or echoed.

That tolerance does not apply when a member asks the OP to promise a security property or wire shape it cannot provide. The endpoint rejects such a request with `invalid_client_metadata`, including `tls_client_certificate_bound_access_tokens: true`, `dpop_bound_access_tokens: true`, `require_pushed_authorization_requests: true`, a response-signing algorithm the relevant surface does not emit, and `backchannel_logout_session_required: true` whether or not `backchannel_logout_uri` is present. `software_statement` is a separate explicit refusal: because RFC 7591 trust-chain verification is not implemented, a request carrying it returns `invalid_software_statement` rather than silently dropping it.

## What registration enforces today

The DCR surface is `partial` rather than `full`, but the partial label captures intentional design choices, not TBDs. The validator rejects metadata that violates any of the rules below at `POST /register` and at `PUT /register/{client_id}`:

- `redirect_uris` shape per `application_type` (see the warning above), with no fragments and absolute URLs only.
- `grant_types` and `response_types` are cross-checked against the OIDC Core §3 / OIDC Registration §2 combination table; an inconsistent pair is rejected with `invalid_client_metadata` rather than silently auto-fixed.
- `jwks` and `jwks_uri` are mutually exclusive; URI-bearing metadata fields (`client_uri`, `logo_uri`, `policy_uri`, `tos_uri`, `jwks_uri`, `sector_identifier_uri`, `initiate_login_uri`) must be absolute, `https`, and fragment-free. Userinfo segments (`https://user:pass@host/...`) are rejected. **Exception:** `request_uris` admit a fragment because OIDC Core §6.2 RECOMMENDS the base64url-encoded SHA-256 hash of the request file there so caches can detect content changes; every other shape rule (absolute, `https`, host required, no userinfo) still applies.
- `backchannel_logout_uri` MUST be `https`, carry no fragment, no userinfo, and a non-empty host. Any `backchannel_logout_session_required=true` is rejected as `invalid_client_metadata`, even when a valid URI is also present: this OP cannot persist the RP-specific session lineage needed to deliver `sid` safely.
- `sector_identifier_uri` is fetched at registration time and the document MUST be a JSON array of strings that contains every registered `redirect_uri` (OIDC Core §8.1). The fetch is bounded to a 5 s timeout and a 64 KiB body; failure or containment mismatch produces `invalid_client_metadata`.
- `subject_type=pairwise` without `sector_identifier_uri` requires every `redirect_uri` host to match.
- `request_object_signing_alg` is restricted to `RS256` / `PS256` / `ES256` / `EdDSA`.

The typical boundaries for URI-bearing metadata look like this:

```jsonc
// NG: jwks together with jwks_uri, plus userinfo and a fragment
{
  "jwks": { "keys": [] },
  "jwks_uri": "https://client.example.com/jwks.json",
  "client_uri": "https://user:pass@client.example.com/app",
  "policy_uri": "https://client.example.com/policy#v1"
}

// OK: URI-bearing metadata is an absolute https URL, no fragment, no userinfo
{
  "jwks_uri": "https://client.example.com/jwks.json",
  "client_uri": "https://client.example.com/app",
  "policy_uri": "https://client.example.com/policy"
}

// OK: only request_uris admit the request-file hash fragment
{
  "request_uris": [
    "https://client.example.com/request.jwt#sha256-abc123"
  ]
}
```

## Intentional limits

The remaining gap to a `full` claim is design choice, not pending work. The reasoning behind each is documented as a separate entry on [design judgments](/security/design-judgments) — `client_secret` non-disclosure ([#dj-20](/security/design-judgments#dj-20)), PUT omission semantics ([#dj-21](/security/design-judgments#dj-21)), and the `sector_identifier_uri` fetch / native loopback rules ([#dj-22](/security/design-judgments#dj-22)).

- **`client_secret` is not re-emitted on `GET /register/{id}`.** The store keeps a hash; the plaintext exists in the response only on the original `POST /register` and on the two PUT cases below. RFC 7591 §3.2.1 makes the field optional in the read response, so omitting it is conformant.
- **PUT omission resets selected fields to server defaults and clears the rest.** A `PUT /register/{client_id}` that omits `grant_types`, `response_types`, `token_endpoint_auth_method`, `application_type`, `subject_type`, or `id_token_signed_response_alg` reapplies the OP default for that field. Omitted `scope` is the important exception to the fresh-registration path: it clears the client's scopes. Optional metadata (`client_uri`, `logo_uri`, `policy_uri`, `tos_uri`, …) becomes empty.
- **PUT only re-emits `client_secret` when a public client becomes confidential.** A routine confidential-client metadata edit preserves the stored hash and does not include the secret; a submitted `client_secret` is checked against the authenticated client and never acts as a replacement value.
- **PUT body MUST NOT include server-managed fields.** `registration_access_token`, `registration_client_uri`, `client_secret_expires_at`, and `client_id_issued_at` cause `400 invalid_request`. A `client_secret` value that does not match the authenticated client also returns `400`.
- **`backchannel_logout_uri` round-trips end-to-end; session-bound logout does not.** A valid URI is persisted on `POST /register`, returned on `GET /register/{client_id}`, and overwritable through `PUT /register/{client_id}`. `backchannel_logout_session_required: true` is invalid metadata with or without a URI, so it never enters storage.
- **Out-of-band `Resources` survives a management update.** RFC 8707 resource-indicator allow-list values live on `store.Client.Resources`, not in the RFC 7591 metadata document. The PUT path copies the existing client before applying submitted metadata, so an operator-set `Resources` list is preserved while fields the RP can express follow omission rules.
- **`software_statement` (RFC 7591 §2.3) is not accepted.** A request that includes the field returns `invalid_software_statement`. Federation / trust-chain support is out of scope.

## Read / update / delete

The 201 response includes a `registration_access_token` and `registration_client_uri`. RPs call those for RFC 7592 operations:

```sh
# read
curl -H "Authorization: Bearer $RAT" $RCU

# update
curl -X PUT -H "Authorization: Bearer $RAT" -H "Content-Type: application/json" \
  -d '{"client_name":"New Name", ...}' $RCU

# delete
curl -X DELETE -H "Authorization: Bearer $RAT" $RCU
```

### What DELETE does to stored state

The OP deletes the client and its RAT, and invokes optional in-tree `store.RevokeByClient` cascades for refresh tokens, grants, and persisted access-token records. Sessions and interactions are subject-keyed, so they are not reached by that client-keyed cascade; use the embedder hook for records outside the library's stores.

When the configured grant store implements `store.GrantSubjectLister`, the handler snapshots a clone of the client and a bounded page from `ListSubjectsByClient` **before** deleting the client. If the grant store also implements `store.GrantClientLister`, the OP can build the back-channel coordinator for this path and send Logout Tokens from the pre-delete snapshot. This ordering matters because looking up the URI after deletion would find no client. The page is deliberately bounded; a store must implement the query with a `limit+1` bound rather than materializing every grant.

Custom stores can receive the same snapshot through `RegistrationOption.OnClientDeletedSnapshot`:

```go
import (
  "context"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/store"
)

provider, err := op.New(
  /* issuer, store, keyset, and other required options */
  op.WithDynamicRegistration(op.RegistrationOption{
    OnClientDeletedSnapshot: func(ctx context.Context, client *store.Client, subjects []string) error {
      // Revoke application-owned records and/or deliver custom logout notices.
      return nil
    },
  }),
)
_ = provider
_ = err
```

The older `OnClientDeleted` hook remains available for a client-ID-only cascade. Hook errors are logged after the deletion and do not change the successful `204` response, so custom cleanup must be retryable and observable.

## When to use it

DCR shines when:

- You're building a multi-tenant SaaS where each tenant brings their own RP and you don't want to stage config rolls.
- You're operating an internal developer platform where teams self-serve client credentials.

DCR is overkill (and an attack surface you don't need) when:

- You have ten RPs, all internal, all known. `op.WithStaticClients(...)` is simpler and gives you fewer moving parts.
