---
title: Error catalog
description: The OAuth/OIDC error codes the OP returns, including invalid logout_scope and static 503 behavior on logout-store failure.
outline: 2
pageClass: pg-reference-errors
---

# Error catalog

The OP returns errors from a closed catalog. No free-form `fmt.Errorf` reaches the wire: every `error` value comes from `op.Error` (configuration and construction) or from one of the endpoint-internal code constants (request handling). This page lists both, grouped by endpoint.

<figure class="fig">
  <div class="fig-head">Two kinds of error, and where each one surfaces</div>
  <svg class="fig-svg" role="img" aria-labelledby="errors-shape-title" viewBox="0 0 960 368" xmlns="http://www.w3.org/2000/svg">
    <title id="errors-shape-title">Configuration errors are returned by op.New and stop the process from starting. Request errors come out of an endpoint and are rendered as a JSON body, a redirect carrying error parameters, or an HTML error page, depending on where the request was in the flow.</title>
    <!-- construction error -->
    <rect class="fg-box fg-box--warn" x="32" y="24" width="248" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="52">Construction error</text>
    <text class="fg-mxs" x="48" y="76">returned by op.New</text>
    <text class="fg-xs" x="48" y="100">the process never starts</text>
    <!-- request error -->
    <rect class="fg-box" x="32" y="156" width="248" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="184">Request error</text>
    <text class="fg-xs" x="48" y="208">raised in an endpoint</text>
    <text class="fg-xs" x="48" y="232">while a client waits</text>
    <path class="fg-edge" d="M280,204 H336" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="336" y="156" width="272" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="352" y="184">A closed catalog</text>
    <text class="fg-mxs" x="352" y="208">error + error_description</text>
    <text class="fg-xs" x="352" y="232">the code is the contract</text>
    <path class="fg-leader" d="M608,204 H640 M640,100 V308"/>
    <path class="fg-edge fg-edge--thin" d="M640,100 H672" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M640,204 H672" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M640,308 H672" marker-end="url(#fg-a)"/>
    <!-- renderings -->
    <rect class="fg-box" x="672" y="64" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="688" y="92">JSON response</text>
    <text class="fg-xs" x="688" y="116">back-channel endpoints</text>
    <rect class="fg-box" x="672" y="168" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="688" y="196">Redirect</text>
    <text class="fg-xs" x="688" y="220">to a verified redirect_uri</text>
    <rect class="fg-box" x="672" y="272" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="688" y="300">HTML error page</text>
    <text class="fg-xs" x="688" y="324">redirect_uri unverified</text>
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

For browser-facing endpoints (`/auth`, `/end_session`) the same codes appear in:

- The `error` query / fragment parameter on the redirect (when `redirect_uri` and `state` could be validated).
- The HTML error page DOM (`<div id="op-error" data-code="..." data-description="...">`) when no safe redirect exists.

## Programmatic discrimination

```go
import "errors"

if errors.Is(err, op.ErrIssuerRequired) { /* config-time */ }

if op.IsClientError(err) { /* 4xx-class */ }
if op.IsServerError(err) { /* 5xx-class */ }
```

Sentinel comparison uses pointer identity (Go's default `errors.Is`). Two distinct sentinels can share an OAuth code (several are `configuration_error`) without being interchangeable.

The predicates test the `Code` of an `*op.Error`, so they cover exactly these codes:

| Predicate | Codes it matches |
|---|---|
| `op.IsClientError` | `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `unsupported_response_type`, `invalid_scope`, `access_denied` |
| `op.IsServerError` | `server_error`, `temporarily_unavailable`, `configuration_error` |

A wire code outside both lists, such as `use_dpop_nonce`, is not an `*op.Error` the embedder receives from `op.New`; it only appears in HTTP responses.

## Construction-time errors (`op.New`)

Returned by the constructor; the OP never starts.

| Sentinel | Code | Trigger |
|---|---|---|
| `op.ErrIssuerRequired` | `configuration_error` | `WithIssuer` not supplied |
| `op.ErrIssuerInvalid` | `configuration_error` | issuer is not an absolute URL in canonical form: it has a trailing slash, query or fragment, or its scheme is not `https` (`http` is admitted only for a loopback IP literal, and for `localhost` with `WithAllowLocalhostLoopback`) |
| `op.ErrStoreRequired` | `configuration_error` | `WithStore` not supplied |
| `op.ErrUserStoreRequired` | `configuration_error` | `WithUserStore` received nil |
| `op.ErrKeysetRequired` | `configuration_error` | `WithKeyset` not supplied or empty |
| `op.ErrCookieKeysRequired` | `configuration_error` | `WithCookieKeys` missing while `authorization_code` grant is enabled |
| `op.ErrDynamicRegistrationDisabled` | `configuration_error` | `Provider.IssueInitialAccessToken` called without `WithDynamicRegistration` |
| `op.ErrPairwiseSaltTooShort` | `configuration_error` | `WithPairwiseSubject` salt shorter than 32 bytes |
| `op.ErrSubjectGeneratorRequired` | `configuration_error` | `WithSubjectGenerator` received nil |
| `op.ErrCustomGrantNil` | `configuration_error` | `WithCustomGrant` received a nil handler |
| `op.ErrCustomGrantNameEmpty` | `configuration_error` | `CustomGrantHandler.Name` returned an empty `grant_type` URN |
| `op.ErrCustomGrantBuiltinCollision` | `configuration_error` | handler name equals a built-in `grant_type` |
| `op.ErrCustomGrantDuplicate` | `configuration_error` | handler name already registered by an earlier `WithCustomGrant` |
| `op.ErrCustomGrantSecretLikeExempt` | `configuration_error` | `ParamPolicy.DupesAllowed` names a security-sensitive parameter |
| `op.ErrTokenExchangePolicyNil` | `configuration_error` | `RegisterTokenExchange` received a nil policy |
| `op.ErrTokenExchangeDuplicate` | `configuration_error` | `RegisterTokenExchange` called twice |

Three more sentinels are returned after construction rather than by `op.New`:

| Sentinel | Code | Trigger |
|---|---|---|
| `op.ErrLocaleNotRegistered` | `invalid_request` | `Provider.SetLocaleCookie` given a locale no registered bundle matches |
| `op.ErrSubjectInputEmpty` | `server_error` | a built-in subject generator called with an empty internal user ID |
| `op.ErrPairwiseSectorUnresolved` | `server_error` | pairwise subject for a client with no `sector_identifier_uri` and not exactly one `redirect_uri` host |

::: tip Other config errors
Profile and option conflicts (for example `WithProfile(FAPI2Baseline)` together with `WithAccessTokenFormat(Opaque)`) return an `*op.Error` with `Code = configuration_error` and a description naming the conflicting options. They are not pre-allocated sentinels, so match with `op.IsServerError` or inspect `.Code`. The [options reference](/reference/options#what-op-new-refuses) lists the refusals.
:::

## Authorize endpoint (`/auth`)

Browser-facing. Reach the user via redirect when `redirect_uri` could be validated, otherwise via the HTML error page.

| Code | Spec | Typical cause |
|---|---|---|
| `invalid_request` | OIDC Core §3.1.2.6 | missing parameter, malformed PKCE, `state` exceeds size cap |
| `invalid_request_object` | RFC 9101 §6.1 | JAR JWS fails verification, alg not allowed, expired |
| `invalid_request_uri` | RFC 9101 §6.1 / RFC 9126 §2.2 | PAR `request_uri` already consumed / expired |
| `invalid_scope` | OIDC Core §3.1.2.6 | requested scope not in catalog |
| `invalid_target` | RFC 8707 §2 | `resource` malformed, duplicated, or not an allowed resource |
| `invalid_authorization_details` | RFC 9396 §5 | `authorization_details` fails type validation |
| `unmet_authentication_requirements` | OIDC Core §5.5.1.1, RFC 9470 §4 | the session cannot satisfy an `acr` the request marked essential |
| `unsupported_response_type` | OIDC Core §3.1.2.6 | `response_type` not `code` (Implicit / Hybrid refused) |
| `unsupported_response_mode` | OAuth 2.1 | unsupported `response_mode` |
| `login_required` | OIDC Core §3.1.2.6 | `prompt=none` and no active session |
| `consent_required` | OIDC Core §3.1.2.6 | `prompt=none` but consent missing |
| `interaction_required` | OIDC Core §3.1.2.6 | `prompt=none` and the flow needs UI, including a `LoginFlow` rule or `Decider` that demands another step on an existing session |
| `account_selection_required` | OIDC Core §3.1.2.6 | `prompt=none` with multiple sessions |
| `access_denied` | OIDC Core §3.1.2.6 | user canceled at consent / login |
| `server_error` | OIDC Core §3.1.2.6 | internal failure, including a client-store fault (the OP does not report the `client_id` as unregistered) |

A request object whose client JWKS cannot be fetched because the fetch is overloaded or failing transiently is answered with HTTP 503 `server_error` on the error page. A consent or chooser submission that is declined, stale or tampered, or names an expired or foreign chooser `session_id`, is a 4xx answer; a chooser-selected session that has expired or signed out is reported as `login_required`.

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
| `invalid_target` | 400 | RFC 8707 `resource` / `audience` refused by policy |
| `invalid_authorization_details` | 400 | `authorization_details` not permitted for this request |
| `authorization_pending` | 400 | device-code or CIBA poll before the user has decided |
| `slow_down` | 400 | device-code or CIBA poll faster than the negotiated interval |
| `expired_token` | 400 | `device_code` or `auth_req_id` lifetime elapsed |
| `access_denied` | 400 | the user denied the device-code or CIBA request |
| `use_dpop_nonce` | 400 | DPoP §8 server nonce required; client must retry with `DPoP-Nonce` |
| `server_error` | 500 | internal failure, including a client-store outage during client authentication |
| `server_error` | 503 | the client's JWKS could not be fetched (fetch overloaded or failing transiently); retryable |

Client authentication failures map as follows on `/token`, `/par`, `/device_authorization`, `/bc-authorize`, `/introspect` and `/revoke`:

| Condition | Response |
|---|---|
| no credentials | `401 invalid_client` |
| wrong secret, bad or replayed assertion (including an empty or over-long `jti`), client mismatch | `401 invalid_client` |
| more than one credential method, or an unsupported method | `400 invalid_request` |
| client JWKS fetch overloaded or failing | `503 server_error` |
| any other fault, such as a client-store outage | `500 server_error` |

`401 invalid_client` carries `WWW-Authenticate: Basic realm="oidc"` — the realm is a fixed literal, not the issuer URL — when the client authenticated via HTTP Basic; `/userinfo`'s own 401s use a separate `Bearer realm="userinfo"` challenge, per RFC 6749 §5.2.

A refresh request that lists a narrower `scope` does not narrow the rotated refresh token: the successor keeps the scope of the token it replaces. An authorization code presented by the wrong client, or one that fails the `redirect_uri` or PKCE check, answers `invalid_grant` without consuming the code; only a genuine replay revokes the grant.

Custom-grant dispatch keeps client-attributable failures in the 4xx catalog: an unsupported grant, a client grant-type restriction, malformed or duplicate parameters, and scope or audience policy failures map to `unsupported_grant_type`, `unauthorized_client`, `invalid_request`, `invalid_scope`, or `invalid_target`. An un-attributed dispatcher or OP issuance failure — including a handler panic, conflicting access-token forms, reserved-claim collisions, invalid token data, or a backing-store failure — returns `500 server_error`. A handler-provided `*op.Error`, including a wrapped one, keeps its code on the wire; another handler error defaults to `400 invalid_grant`.

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
| `server_error` | 503 | the client's JWKS could not be fetched for `private_key_jwt` authentication |

`/revoke` supports both RFC 7009 token types, `access_token` and `refresh_token`, and never emits `unsupported_token_type`. An unknown or absent `token_type_hint` is handled as a search hint rather than a wire error; an unrecognized token still follows RFC 7009's idempotent HTTP 200 success contract.

Failed client authentication at `/introspect` is also visible as `op.AuditIntrospectionError`; the wire response remains the generic `invalid_client`. A non-`NotFound` lookup fault in the opaque access-token or refresh-token store is audited with the same event. It still returns HTTP 200 with `{"active":false}` rather than `server_error`. A normal inactive miss emits no fault event. `/revoke` follows the RFC 7009 response contract and does not use that introspection-specific audit name.

`/revoke` answers 200 even when the token's rotation chain is longer than the chain-root lookup can walk; it then revokes the grant's refresh tokens instead, and `token.revoked` reports `surface: "refresh_grant"` ([Audit event catalog](/reference/audit-events#code-and-token-lifecycle)).

For a refresh token, `/introspect` answers `active` with the refresh-token state but no `token_type`: RFC 7662 defines that member as the access-token type, so a resource server cannot mistake a refresh token for a bearer token.

## PAR endpoint (`/par`)

RFC 9126.

| Code | HTTP | Trigger |
|---|---|---|
| `invalid_request` | 400 | malformed authorize parameters in PAR body |
| `invalid_request_object` | 400 | JAR signature fails (when `request` parameter present) |
| `invalid_client` | 401 | client auth failed |
| `server_error` | 503 | the client's JWKS could not be fetched (client authentication or request-object verification) |

## Device authorization (`/device_authorization`) and CIBA (`/bc-authorize`)

RFC 8628 and CIBA Core §13. Both use the RFC 6749 §5.2 envelope; the polling codes (`authorization_pending`, `slow_down`, `expired_token`, `access_denied`) are returned by `/token`, listed above.

| Code | HTTP | Endpoint | Trigger |
|---|---|---|---|
| `invalid_request` | 400 | both | malformed or missing parameter, or malformed client certificate |
| `unauthorized_client` | 400 | both | client is not registered for the grant |
| `invalid_scope` | 400 | both | scope refused |
| `invalid_target` | 400 | both | `resource` refused |
| `unknown_user_id` | 400 | `/bc-authorize` | the hint resolver found no user |
| `invalid_binding_message` | 400 | `/bc-authorize` | `binding_message` rejected |
| `login_required` | 400 | `/bc-authorize` | the hint resolver failed or returned an empty subject |
| `server_error` | 500 / 503 | both | internal failure; 503 when a request object's client JWKS is unavailable |

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
| `invalid_request` | malformed `id_token_hint`, an `id_token_hint` whose `typ` header is anything other than absent or `JWT` (a logout token or an access token is refused), mismatched `client_id`, or invalid `logout_scope` (empty, unknown, repeated, or not exactly `current`) |
| `invalid_request_uri` | `request_uri` (when JAR-style logout requests are used) expired |

If the session store cannot be reached while `/end_session` resolves or destroys the session, the endpoint returns a static HTTP 503 error page. It does not redirect to `post_logout_redirect_uri`, and it preserves the browser cookie and session row so a transient store fault cannot turn into a partial logout. A missing or already-expired session is handled separately and is not the transport-failure case.

## Request bodies

Every endpoint and driver that reads a JSON body rejects data after the first JSON value (a stray `}`, for example) with `invalid_request`, instead of ignoring the trailing bytes.

## Verifying this list

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhE '"[a-z_]+_[a-z_]+"' internal/*/error*.go \
  | grep -oE '"[a-z_]+_[a-z_]+"' | sort -u
```

The output is the union of every wire code the endpoints emit; this page groups them by endpoint with the spec citation for each.
