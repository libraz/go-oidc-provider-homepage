---
title: Error catalog
description: The OAuth/OIDC error codes the OP returns, what triggers each, and the typical fix.
outline: 2
---

# Error catalog

The OP returns errors from a closed catalog. There is no free-form `fmt.Errorf` reaching the wire — every emitted `error` either comes from `op.Error` (configuration / construction) or from one of the endpoint-internal code constants (request handling).

This page enumerates both.

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
| `invalid_client` | 401 | client auth failed (no credentials, wrong secret, invalid `private_key_jwt` / mTLS cert) |
| `unauthorized_client` | 400 | client not allowed for this grant type |
| `unsupported_grant_type` | 400 | grant not enabled in `WithGrants` |
| `invalid_scope` | 400 | refresh requested wider scope than original |
| `use_dpop_nonce` | 400 | DPoP §8 server nonce required; client must retry with `DPoP-Nonce` |
| `server_error` | 500 | internal failure |

`401 invalid_client` always carries `WWW-Authenticate: Basic realm="<issuer>"` (or `Bearer realm=...` for `/userinfo`) per RFC 6749 §5.2.

## UserInfo endpoint (`/userinfo`)

Bearer-token validation. RFC 6750 §3.1 + RFC 9449.

| Code | HTTP | Trigger |
|---|---|---|
| `invalid_token` | 401 | bearer missing, expired, revoked, alg mismatch |
| `invalid_dpop_proof` | 401 | DPoP proof JWS invalid / replay / `cnf.jkt` mismatch |
| `use_dpop_nonce` | 401 | DPoP §8 server-nonce required |
| `insufficient_scope` | 403 | scope insufficient for the requested claims |

## Introspection / Revocation (`/introspect`, `/revoke`)

RFC 7662 / RFC 7009. Same client-auth code set as `/token`.

| Code | HTTP | Trigger |
|---|---|---|
| `invalid_request` | 400 | missing `token` parameter |
| `invalid_client` | 401 | client auth failed |
| `unsupported_token_type` | 400 | `/revoke` only — token type not revocable |
| `server_error` | 500 | internal failure |

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
| `invalid_request` | malformed `id_token_hint`, mismatched `client_id` |
| `invalid_request_uri` | `request_uri` (when JAR-style logout requests are used) expired |

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
