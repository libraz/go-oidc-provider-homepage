---
title: Dynamic Client Registration
description: Let RPs register themselves at runtime via RFC 7591 / RFC 7592.
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

<style scoped>
.d-box{fill:none;stroke:currentColor;stroke-width:2}
.op-accent{stroke:var(--vp-c-brand-2)}
.d-life{stroke:currentColor;stroke-width:1.5;opacity:.35}
.d-life-op{stroke:var(--vp-c-brand-2);stroke-width:1.5;opacity:.5}
.d-msg{stroke:currentColor;stroke-width:2;fill:none}
.d-msg-oob{stroke:currentColor;stroke-width:2;fill:none;stroke-dasharray:5 4}
.d-badge{fill:var(--vp-c-bg);stroke:currentColor;stroke-width:1.5}
.d-name{font-family:var(--vp-font-family-base);font-size:14px;font-weight:600;fill:currentColor;stroke:none}
.d-accent-fill{fill:var(--vp-c-brand-2)}
.d-lbl{font-family:var(--vp-font-family-base);font-size:12px;fill:currentColor;stroke:none}
.d-mono{font-family:var(--vp-font-family-mono);font-size:11.5px;fill:currentColor;stroke:none}
.d-badge-t{font-family:var(--vp-font-family-mono);font-size:10px;font-weight:600;fill:currentColor;stroke:none}
</style>

<svg role="img" aria-labelledby="dcr-seq-title" viewBox="0 0 800 596" style="display:block;width:100%;max-width:760px;height:auto;margin:1.5rem auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="dcr-seq-title">Dynamic Client Registration sequence: the operator mints an Initial Access Token, hands it out-of-band to a new RP, which registers at POST /register and then reads, updates, and deletes its registration via RFC 7592.</title>
  <line x1="130" y1="64" x2="130" y2="581" class="d-life"/>
  <line x1="420" y1="64" x2="420" y2="581" class="d-life-op"/>
  <line x1="710" y1="64" x2="710" y2="581" class="d-life"/>
  <rect x="55" y="20" width="150" height="44" rx="6" class="d-box"/>
  <text x="130" y="47" text-anchor="middle" class="d-name">Operator</text>
  <rect x="345" y="20" width="150" height="44" rx="6" class="d-box op-accent"/>
  <text x="420" y="47" text-anchor="middle" class="d-name d-accent-fill">OP</text>
  <rect x="635" y="20" width="150" height="44" rx="6" class="d-box"/>
  <text x="710" y="47" text-anchor="middle" class="d-name">New RP</text>
  <line x1="138" y1="105" x2="418" y2="105" class="d-msg"/>
  <polyline points="411,101 418,105 411,109" class="d-msg"/>
  <text x="275" y="97" text-anchor="middle" class="d-mono">IssueInitialAccessToken(ctx, spec)</text>
  <line x1="412" y1="142" x2="132" y2="142" class="d-msg"/>
  <polyline points="139,138 132,142 139,146" class="d-msg"/>
  <text x="275" y="134" text-anchor="middle" class="d-mono">&lt;iat&gt;</text>
  <line x1="138" y1="179" x2="708" y2="179" class="d-msg-oob"/>
  <polyline points="701,175 708,179 701,183" class="d-msg"/>
  <text x="420" y="171" text-anchor="middle" class="d-lbl">out-of-band handoff <tspan class="d-mono">&lt;iat&gt;</tspan></text>
  <line x1="702" y1="246" x2="422" y2="246" class="d-msg"/>
  <polyline points="429,242 422,246 429,250" class="d-msg"/>
  <text x="565" y="208" text-anchor="middle" class="d-mono">POST /register</text>
  <text x="565" y="223" text-anchor="middle" class="d-mono">Authorization: Bearer &lt;iat&gt;</text>
  <text x="565" y="238" text-anchor="middle" class="d-mono">{ redirect_uris, …, client_name }</text>
  <line x1="428" y1="328" x2="708" y2="328" class="d-msg"/>
  <polyline points="701,324 708,328 701,332" class="d-msg"/>
  <text x="565" y="275" text-anchor="middle" class="d-mono">201</text>
  <text x="565" y="290" text-anchor="middle" class="d-mono">{ client_id, client_secret?,</text>
  <text x="565" y="305" text-anchor="middle" class="d-mono">registration_access_token,</text>
  <text x="565" y="320" text-anchor="middle" class="d-mono">registration_client_uri, … }</text>
  <line x1="702" y1="380" x2="422" y2="380" class="d-msg"/>
  <polyline points="429,376 422,380 429,384" class="d-msg"/>
  <text x="565" y="357" text-anchor="middle" class="d-mono">GET /register/&lt;client_id&gt;</text>
  <text x="565" y="372" text-anchor="middle" class="d-mono">Authorization: Bearer &lt;rat&gt;</text>
  <line x1="428" y1="417" x2="708" y2="417" class="d-msg"/>
  <polyline points="701,413 708,417 701,421" class="d-msg"/>
  <text x="565" y="409" text-anchor="middle" class="d-lbl"><tspan class="d-mono">200</tspan> full client metadata</text>
  <line x1="702" y1="454" x2="422" y2="454" class="d-msg"/>
  <polyline points="429,450 422,454 429,458" class="d-msg"/>
  <text x="565" y="446" text-anchor="middle" class="d-mono">PUT /register/&lt;client_id&gt; …</text>
  <line x1="428" y1="491" x2="708" y2="491" class="d-msg"/>
  <polyline points="701,487 708,491 701,495" class="d-msg"/>
  <text x="565" y="483" text-anchor="middle" class="d-lbl"><tspan class="d-mono">200</tspan> updated metadata</text>
  <line x1="702" y1="528" x2="422" y2="528" class="d-msg"/>
  <polyline points="429,524 422,528 429,532" class="d-msg"/>
  <text x="565" y="520" text-anchor="middle" class="d-mono">DELETE /register/&lt;client_id&gt;</text>
  <line x1="428" y1="565" x2="708" y2="565" class="d-msg"/>
  <polyline points="701,561 708,565 701,569" class="d-msg"/>
  <text x="565" y="557" text-anchor="middle" class="d-lbl"><tspan class="d-mono">204</tspan> No Content</text>
  <circle cx="130" cy="105" r="8" class="d-badge"/><text x="130" y="108.5" text-anchor="middle" class="d-badge-t">1</text>
  <circle cx="420" cy="142" r="8" class="d-badge"/><text x="420" y="145.5" text-anchor="middle" class="d-badge-t">2</text>
  <circle cx="130" cy="179" r="8" class="d-badge"/><text x="130" y="182.5" text-anchor="middle" class="d-badge-t">3</text>
  <circle cx="710" cy="246" r="8" class="d-badge"/><text x="710" y="249.5" text-anchor="middle" class="d-badge-t">4</text>
  <circle cx="420" cy="328" r="8" class="d-badge"/><text x="420" y="331.5" text-anchor="middle" class="d-badge-t">5</text>
  <circle cx="710" cy="380" r="8" class="d-badge"/><text x="710" y="383.5" text-anchor="middle" class="d-badge-t">6</text>
  <circle cx="420" cy="417" r="8" class="d-badge"/><text x="420" y="420.5" text-anchor="middle" class="d-badge-t">7</text>
  <circle cx="710" cy="454" r="8" class="d-badge"/><text x="710" y="457.5" text-anchor="middle" class="d-badge-t">8</text>
  <circle cx="420" cy="491" r="8" class="d-badge"/><text x="420" y="494.5" text-anchor="middle" class="d-badge-t">9</text>
  <circle cx="710" cy="528" r="8" class="d-badge"/><text x="710" y="531.5" text-anchor="middle" class="d-badge-t">10</text>
  <circle cx="420" cy="565" r="8" class="d-badge"/><text x="420" y="568.5" text-anchor="middle" class="d-badge-t">11</text>
</svg>

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
:::

## What registration enforces today

The DCR surface is `partial` rather than `full`, but the partial label captures intentional design choices, not TBDs. The validator rejects metadata that violates any of the rules below at `POST /register` and at `PUT /register/{client_id}`:

- `redirect_uris` shape per `application_type` (see the warning above), with no fragments and absolute URLs only.
- `grant_types` and `response_types` are cross-checked against the OIDC Core §3 / OIDC Registration §2 combination table; an inconsistent pair is rejected with `invalid_client_metadata` rather than silently auto-fixed.
- `jwks` and `jwks_uri` are mutually exclusive; URI-bearing metadata fields (`client_uri`, `logo_uri`, `policy_uri`, `tos_uri`, `jwks_uri`, `sector_identifier_uri`, `initiate_login_uri`) must be absolute, `https`, and fragment-free. Userinfo segments (`https://user:pass@host/...`) are rejected. **Exception:** `request_uris` admit a fragment because OIDC Core §6.2 RECOMMENDS the base64url-encoded SHA-256 hash of the request file there so caches can detect content changes; every other shape rule (absolute, `https`, host required, no userinfo) still applies.
- `backchannel_logout_uri` MUST be `https`, carry no fragment, no userinfo, and a non-empty host. `backchannel_logout_session_required=true` paired with an empty `backchannel_logout_uri` is rejected as `invalid_client_metadata` so a client cannot opt into `sid` delivery without a destination.
- `sector_identifier_uri` is fetched at registration time and the document MUST be a JSON array of strings that contains every registered `redirect_uri` (OIDC Core §8.1). The fetch is bounded to a 5 s timeout and a 64 KiB body; failure or containment mismatch produces `invalid_client_metadata`.
- `subject_type=pairwise` without `sector_identifier_uri` requires every `redirect_uri` host to match.
- `request_object_signing_alg` is restricted to `RS256` / `PS256` / `ES256` / `EdDSA`.

## Intentional limits

The remaining gap to a `full` claim is design choice, not pending work. The reasoning behind each is documented as a separate entry on [design judgments](/security/design-judgments) — `client_secret` non-disclosure ([#dj-20](/security/design-judgments#dj-20)), PUT omission semantics ([#dj-21](/security/design-judgments#dj-21)), and the `sector_identifier_uri` fetch / native loopback rules ([#dj-22](/security/design-judgments#dj-22)).

- **`client_secret` is not re-emitted on `GET /register/{id}`.** The store keeps a hash; the plaintext exists in the response only on the original `POST /register` and on the two PUT cases below. RFC 7591 §3.2.1 makes the field optional in the read response.
- **PUT omission resets to server defaults, not deletion.** A `PUT /register/{client_id}` that omits `grant_types`, `response_types`, `token_endpoint_auth_method`, `application_type`, `subject_type`, or `id_token_signed_response_alg` reapplies the OP default for that field; optional metadata (`client_uri`, `logo_uri`, `policy_uri`, `tos_uri`, …) becomes empty.
- **PUT only re-emits `client_secret` on (a) `none` → confidential auth-method upgrade or (b) explicit rotation request.** The body of a routine metadata edit does not include the secret.
- **PUT body MUST NOT include server-managed fields.** `registration_access_token`, `registration_client_uri`, `client_secret_expires_at`, and `client_id_issued_at` cause `400 invalid_request`. A `client_secret` value that does not match the authenticated client also returns `400`.
- **`backchannel_logout_uri` and `backchannel_logout_session_required` round-trip end-to-end.** Both fields are persisted on `POST /register`, returned on `GET /register/{client_id}`, and overwritable through `PUT /register/{client_id}`.
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

## When to use it

DCR shines when:

- You're building a multi-tenant SaaS where each tenant brings their own RP and you don't want to stage config rolls.
- You're operating an internal developer platform where teams self-serve client credentials.

DCR is overkill (and an attack surface you don't need) when:

- You have ten RPs, all internal, all known. `op.WithStaticClients(...)` is simpler and gives you fewer moving parts.
