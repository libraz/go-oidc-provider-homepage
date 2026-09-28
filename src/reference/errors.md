---
title: Error catalog
description: The OAuth/OIDC error codes the OP returns, including invalid logout_scope and static 503 behavior on logout-store failure.
outline: 2
pageClass: pg-reference-errors
---

# Error catalog

The OP returns errors from a closed catalog. There is no free-form `fmt.Errorf` reaching the wire — every emitted `error` either comes from `op.Error` (configuration / construction) or from one of the endpoint-internal code constants (request handling).

This page enumerates both.

<figure class="fig">
  <div class="fig-head">Two kinds of error, and where each one surfaces</div>
  <svg class="fig-svg" role="img" aria-labelledby="errors-shape-title" viewBox="0 0 960 252" xmlns="http://www.w3.org/2000/svg">
    <title id="errors-shape-title">Configuration errors are returned by op.New and stop the process from starting. Request errors come out of an endpoint and are rendered as a JSON body, a redirect carrying error parameters, or an HTML error page, depending on where the request was in the flow.</title>
    <rect class="fg-box fg-box--warn" x="36" y="44" width="270" height="76" rx="8"/>
    <text class="fg-t2" x="56" y="70">Construction error</text>
    <text class="fg-mxs" x="56" y="92">returned by op.New</text>
    <text class="fg-xs" x="56" y="110">the process never starts</text>
    <rect class="fg-box" x="36" y="140" width="270" height="76" rx="8"/>
    <text class="fg-t2" x="56" y="166">Request error</text>
    <text class="fg-xs" x="56" y="188">raised inside an endpoint</text>
    <text class="fg-xs" x="56" y="206">while a client is waiting</text>
    <path class="fg-edge" d="M310,178 H358" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="362" y="140" width="234" height="76" rx="8"/>
    <text class="fg-t2 fg-accent" x="382" y="166">A closed catalog</text>
    <text class="fg-mxs" x="382" y="188">error + error_description</text>
    <text class="fg-xs" x="382" y="206">the code is the contract</text>
    <path class="fg-leader" d="M600,178 H632 M632,68 V178"/>
    <path class="fg-edge fg-edge--thin" d="M632,68 H692" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M632,140 H692" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M632,208 H692" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="696" y="44" width="228" height="48" rx="6"/>
    <text class="fg-t2" x="714" y="66">JSON response</text>
    <text class="fg-xs" x="714" y="84">back-channel endpoints</text>
    <rect class="fg-box" x="696" y="116" width="228" height="48" rx="6"/>
    <text class="fg-t2" x="714" y="138">Redirect</text>
    <text class="fg-xs" x="714" y="156">once redirect_uri is trusted</text>
    <rect class="fg-box" x="696" y="184" width="228" height="48" rx="6"/>
    <text class="fg-t2" x="714" y="206">HTML error page</text>
    <text class="fg-xs" x="714" y="224">when it is not, or not yet</text>
  </svg>
  <figcaption class="fig-note">Which of the three a client sees is not a style choice. Until <code>redirect_uri</code> has been validated the OP cannot redirect anywhere — sending an error to an unverified URI is how open redirectors get built.</figcaption>
</figure>

## Error shape

Every wire-emitted error follows OAuth 2.0 / OIDC conventions:

```json
{
  "error": "invalid_request",
  "error_description": "client_id is required"
}
```

- **`error`** is one of the codes below — machine-readable, never localised, never wrapped.
- **`error_description`** is a short hint for operators; it never contains tokens, raw input, or stack traces.

For browser-facing endpoints (`/authorize`, `/end_session`) the same codes appear in:

- The `error` query / fragment parameter on the redirect (when `redirect_uri` and `state` could be validated).
- The HTML error page DOM (`<div id="op-error" data-code="..." data-description="...">`) when no safe redirect exists.

## Programmatic discrimination

```go
import "errors"

if errors.Is(err, op.ErrIssuerRequired) { /* config-time */ }

if op.IsClientError(err) { /* 4xx-class */ }
if op.IsServerError(err) { /* 5xx-class */ }
```

Sentinel comparison uses pointer identity (Go's default `errors.Is`). Two distinct sentinels can share an OAuth code (e.g. multiple `configuration_error` sentinels) without being interchangeable.

## Construction-time errors (`op.New`)

Returned by the constructor; the OP never starts.

| Sentinel | Code | Trigger |
|---|---|---|
| `op.ErrIssuerRequired` | `configuration_error` | `WithIssuer` not supplied |
| `op.ErrIssuerInvalid` | `configuration_error` | issuer is not absolute https, or has query / fragment |
| `op.ErrStoreRequired` | `configuration_error` | `WithStore` not supplied |
| `op.ErrUserStoreRequired` | `configuration_error` | `WithUserStore` received nil |
| `op.ErrKeysetRequired` | `configuration_error` | `WithKeyset` not supplied or empty |
| `op.ErrCookieKeysRequired` | `configuration_error` | `WithCookieKeys` missing while `authorization_code` grant is enabled |
| `op.ErrDynamicRegistrationDisabled` | `configuration_error` | `Provider.IssueInitialAccessToken` called without `WithDynamicRegistration` |

::: tip Other config errors
Profile / option conflicts (e.g. `WithProfile(FAPI2Baseline)` together with `WithAccessTokenFormat(Opaque)`) return an `*op.Error` with `Code = configuration_error` and a description naming the conflicting options. They are not pre-allocated sentinels — match on `op.IsServerError` or inspect `.Code`.
:::

## Authorize endpoint (`/authorize`)

Browser-facing. Reach the user via redirect when `redirect_uri` could be validated, otherwise via the HTML error page.

| Code | Spec | Typical cause |
|---|---|---|
| `invalid_request` | OIDC Core §3.1.2.6 | missing parameter, malformed PKCE, `state` exceeds size cap |
| `invalid_request_object` | RFC 9101 §6.1 | JAR JWS fails verification, alg not allowed, expired |
| `invalid_request_uri` | RFC 9101 §6.1 / RFC 9126 §2.2 | PAR `request_uri` already consumed / expired |
| `invalid_scope` | OIDC Core §3.1.2.6 | requested scope not in catalog |
| `unsupported_response_type` | OIDC Core §3.1.2.6 | `response_type` not `code` (Implicit / Hybrid refused) |
| `unsupported_response_mode` | OAuth 2.1 | unsupported `response_mode` |
| `login_required` | OIDC Core §3.1.2.6 | `prompt=none` and no active session |
| `consent_required` | OIDC Core §3.1.2.6 | `prompt=none` but consent missing |
| `interaction_required` | OIDC Core §3.1.2.6 | `prompt=none` and the flow needs UI |
| `account_selection_required` | OIDC Core §3.1.2.6 | `prompt=none` with multiple sessions |
| `access_denied` | OIDC Core §3.1.2.6 | user canceled at consent / login |
| `server_error` | OIDC Core §3.1.2.6 | internal failure |

::: warning Redirect URI mismatch is special
`invalid_request: redirect_uri does not match a registered URI` is the **only** authorize-time error the OP refuses to redirect with — the URL is by definition untrusted. The user reaches the HTML error page. See [FAQ § Common errors](/faq#common-errors).
:::

## Token endpoint (`/token`)

JSON. RFC 6749 §5.2 + RFC 9449 (DPoP).

| Code | HTTP | Trigger |
|---|---|---|
| `invalid_request` | 400 | malformed grant body, missing parameter |
| `invalid_grant` | 400 | code expired / consumed, refresh token rotated past grace, PKCE verifier mismatch |
| `invalid_client` | 401 | client auth failed (no credentials, wrong secret, invalid `private_key_jwt`) |
| `unauthorized_client` | 400 | client not allowed for this grant type |
| `unsupported_grant_type` | 400 | grant not enabled in `WithGrants` |
| `invalid_scope` | 400 | refresh requested wider scope than original |
| `use_dpop_nonce` | 400 | DPoP §8 server nonce required; client must retry with `DPoP-Nonce` |
| `server_error` | 500 | internal failure |

`401 invalid_client` carries `WWW-Authenticate: Basic realm="oidc"` — the realm is a fixed literal, not the issuer URL — when the client authenticated via HTTP Basic; `/userinfo`'s own 401s use a separate `Bearer realm="userinfo"` challenge, per RFC 6749 §5.2.

Custom-grant dispatch keeps client-attributable failures in the 4xx catalog: an unsupported grant, a client grant-type restriction, malformed or duplicate parameters, and scope or audience policy failures map to `unsupported_grant_type`, `unauthorized_client`, `invalid_request`, `invalid_scope`, or `invalid_target`. An un-attributed dispatcher or OP issuance failure — including a handler panic, conflicting access-token forms, reserved-claim collisions, invalid token data, or a backing-store failure — returns `500 server_error`. A handler-provided `*op.Error` is preserved; another handler error defaults to `400 invalid_grant`.

## UserInfo endpoint (`/userinfo`)

Bearer-token validation. RFC 6750 §3.1 + RFC 9449.

| Code | HTTP | Trigger |
|---|---|---|
| `invalid_token` | 401 | bearer missing, expired, revoked, alg mismatch |
| `invalid_dpop_proof` | 401 | DPoP proof JWS invalid / replay / `cnf.jkt` mismatch |
| `use_dpop_nonce` | 401 | DPoP §8 server-nonce required |
| `invalid_request` | 400 | malformed bearer request (multiple tokens, wrong channel); 413 when the request body exceeds the size cap |

A grant-store error other than `store.ErrNotFound` returns plain HTTP 500 without releasing claims. `ErrNotFound` means no grant lineage is available: without a subject projector, claim resolution falls back to the token's scopes; with pairwise subject projection, the request returns `401 invalid_token` because the internal subject cannot be resolved.

## Introspection / Revocation (`/introspect`, `/revoke`)

RFC 7662 / RFC 7009. Same client-auth code set as `/token`.

| Code | HTTP | Trigger |
|---|---|---|
| `invalid_request` | 400 | missing `token` parameter |
| `invalid_client` | 401 | client auth failed |
| `server_error` | 500 | internal failure |

`/revoke` supports both RFC 7009 token types, `access_token` and `refresh_token`, and never emits `unsupported_token_type`. An unknown or absent `token_type_hint` is handled as a search hint rather than a wire error; an unrecognized token still follows RFC 7009's idempotent HTTP 200 success contract.

Failed client authentication at `/introspect` is also visible as `op.AuditIntrospectionError`; the wire response remains the generic `invalid_client`. A non-`NotFound` lookup fault in the opaque access-token or refresh-token store is audited with the same event. It still returns HTTP 200 with `{"active":false}` rather than `server_error`. A normal inactive miss emits no fault event. `/revoke` follows the RFC 7009 response contract and does not use that introspection-specific audit name.

## PAR endpoint (`/par`)

RFC 9126.

| Code | HTTP | Trigger |
|---|---|---|
| `invalid_request` | 400 | malformed authorize parameters in PAR body |
| `invalid_request_object` | 400 | JAR signature fails (when `request` parameter present) |
| `invalid_client` | 401 | client auth failed |

## Dynamic Client Registration (`/register`, `/register/{client_id}`)

RFC 7591 / RFC 7592.

| Code | HTTP | Trigger |
|---|---|---|
| `invalid_request` | 400 | missing required metadata |
| `invalid_token` | 401 | IAT / RAT bearer missing / expired |
| `invalid_client_metadata` | 400 | metadata fails policy (e.g. unsupported `response_types`) |
| `invalid_redirect_uri` | 400 | redirect URI shape rejected (loopback wildcard, fragment, …) |
| `invalid_software_statement` | 400 | software statement JWS fails verification |
| `server_error` | 500 | internal failure |

## End-session (`/end_session`)

OIDC RP-Initiated Logout 1.0. Browser-facing; reaches the user via `post_logout_redirect_uri` redirect or the HTML error page.

| Code | Trigger |
|---|---|
| `invalid_request` | malformed `id_token_hint`, mismatched `client_id`, or invalid `logout_scope` (empty, unknown, repeated, or not exactly `current`) |
| `invalid_request_uri` | `request_uri` (when JAR-style logout requests are used) expired |

If the session store cannot be reached while `/end_session` resolves or destroys the session, the endpoint returns a static HTTP 503 error page. It does not redirect to `post_logout_redirect_uri`, and it preserves the browser cookie and session row so a transient store fault cannot turn into a partial logout. A missing or already-expired session is handled separately and is not the transport-failure case.

## Class-based dispatch

Use the predicates instead of switching on each code:

```go
switch {
case errors.Is(err, op.ErrIssuerRequired):
    // boot-time fix needed
case op.IsClientError(err):
    // 4xx — log at info, don't alert
case op.IsServerError(err):
    // 5xx — alert on rate
}
```

## Verifying this list

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhE '"[a-z_]+_[a-z_]+"' internal/*/error*.go \
  | grep -oE '"[a-z_]+_[a-z_]+"' | sort -u
```

The output is the union of every wire code the endpoints emit; this page groups them by endpoint with the spec citation for each.
