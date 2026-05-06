---
title: Discovery
description: What /.well-known/openid-configuration is, the fields a beginner cares about, and how the library builds it.
---

# Discovery

Clients learn the OP's endpoints, signing keys, and capabilities by fetching one document. For an OIDC OP that document is **OIDC Discovery 1.0**'s `/.well-known/openid-configuration`. For a pure-OAuth deployment the equivalent is **RFC 8414** (OAuth Authorization Server Metadata) at `/.well-known/oauth-authorization-server`. Both produce a JSON object listing endpoints, supported algorithms, supported scopes, and feature flags. This page is the beginner's tour of that object.

::: details Specs referenced on this page
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — OAuth 2.0 Authorization Server Metadata
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

::: tip Why this exists
Without a discovery document, every RP would need its endpoint URLs, signing algorithms, and feature support hard-coded — and every key rotation or feature flip would mean a code change on every RP. Discovery turns "the OP at `https://op.example.com`" into a single URL the RP needs to know.
:::

## What's in the discovery document

A representative subset of the fields a beginner will actually see and use. Every field below is emitted by this library when the corresponding feature is wired.

| Field | What it is |
|---|---|
| `issuer` | The OP's canonical identifier. The same string appears as `iss` in every signed artefact. RPs compare it byte-for-byte. |
| `authorization_endpoint` | URL of `/authorize` — where the browser is redirected to log the user in. |
| `token_endpoint` | URL of `/token` — where the RP exchanges a code or refresh token. |
| `userinfo_endpoint` | URL of `/userinfo` — where the RP fetches fresh claims with an access token. |
| `jwks_uri` | URL of the JWKS — the OP's public signing keys, published as a JWK Set. |
| `introspection_endpoint` | URL of `/introspect` (RFC 7662) — present when the introspection feature is wired. |
| `revocation_endpoint` | URL of `/revoke` (RFC 7009) — present when the revocation feature is wired. |
| `end_session_endpoint` | URL of `/end_session` — where the RP redirects the browser for RP-Initiated Logout. |
| `pushed_authorization_request_endpoint` | URL of `/par` — present only when the PAR feature (RFC 9126) is enabled. |
| `device_authorization_endpoint` | URL of `/device_authorization` — present only when the device-code grant is wired. |
| `grant_types_supported` | Grant types the OP accepts at `/token`: `authorization_code`, `refresh_token`, `client_credentials`, … |
| `response_types_supported` | Response types `/authorize` accepts. The library advertises only `code` (the OIDC Core "code flow"). |
| `response_modes_supported` | How `/authorize` returns the result: `query`, `fragment`, `form_post`, `jwt` (JARM). |
| `id_token_signing_alg_values_supported` | JWS algorithms used to sign ID Tokens. The library publishes `ES256` only because OP signing keys are ECDSA P-256. |
| `request_object_signing_alg_values_supported` | JWS algorithms accepted on JAR `request=` parameters: `RS256`, `PS256`, `ES256`, `EdDSA`. |
| `token_endpoint_auth_methods_supported` | How the RP authenticates at `/token`: `private_key_jwt`, `client_secret_basic`, `client_secret_post`, `tls_client_auth`, `none` (public clients). |
| `code_challenge_methods_supported` | PKCE transformations. The library advertises **only** `S256`. |
| `subject_types_supported` | `public` and (when `op.WithPairwiseSubject(...)` is wired) `pairwise`. |
| `claims_supported` | Claims the OP can return. Operator-controlled via `op.WithClaimsSupported(...)`. |
| `scopes_supported` | Scopes the OP recognises. Includes the standard OIDC scopes plus any registered with `op.WithScope(...)`. |
| `dpop_signing_alg_values_supported` | Present only when the DPoP feature (RFC 9449) is enabled. |
| `require_pushed_authorization_requests` | Set to `true` only under FAPI 2.0 profiles, which mandate PAR. |
| `claims_parameter_supported` | Defaults to `true`; pass `op.WithClaimsParameterSupported(false)` to stop advertising and honoring OIDC §5.5 `claims` requests. |

::: details `_supported` fields are advertisements, not policy
A `_supported` list is what the OP **will accept** — not what every client must use. A client may use a subset. The OP rejects anything outside the list.
:::

## How clients use it

A typical RP SDK does the following on first start:

1. `GET https://op.example.com/.well-known/openid-configuration`
2. Cache the response. Treat the `Cache-Control: max-age=…` header from the OP as the upper bound.
3. Pick endpoints, supported algorithms, and supported features out of the cached document.
4. Refetch when the cache expires, or when JWKS verification fails (the kid is unknown — the OP probably rotated keys).

The library helps here in two ways. First, the discovery document and the JWKS are stable as long as no rotation is in flight: caches at the RP can be long-lived. Second, when the operator is mid-rotation, the embedder signals it via `op.WithJWKSRotationActive(predicate)` — the library then returns a short `Cache-Control: max-age` on the JWKS so RPs that re-fetch see the new key. The discovery document itself is built once at `op.New` time, not per request, so its content does not drift across instances.

::: tip Discovery is RP-side cache, not OP-side cache
The OP builds and marshals the discovery document when the provider is mounted, then serves the cached JSON body for the handler's lifetime. The expensive operation — JWS verification of an ID Token using a recently-rotated key — is what discovery cache invalidation is really about. See [JWKS rotation](/operations/key-rotation).
:::

## How this library builds it

Discovery is constructed once at `op.New` (in `internal/discovery/build.go`) from the wired feature set. There is no runtime drift: if the embedder did not wire PAR, `pushed_authorization_request_endpoint` is absent and `require_pushed_authorization_requests` does not appear. If the embedder wired `op.WithProfile(profile.FAPI2Baseline)`, the FAPI narrowing applies — `token_endpoint_auth_methods_supported` is filtered to the FAPI-permitted set, `require_pushed_authorization_requests=true` appears, and the introspection / revocation auth-method lists are copied from the same narrowed list.

A discovery golden test in the repository asserts the document shape per profile so silent drift between "what the discovery says" and "what handlers actually do" is caught at PR time. See [design judgment #12](/security/design-judgments#dj-12) for the rationale.

## What the library does NOT advertise

The library narrows the discovery document deliberately:

- **No `none` alg.** `id_token_signing_alg_values_supported` and `request_object_signing_alg_values_supported` never contain `none`. The underlying type does not include it (see [JOSE basics](/concepts/jose-basics) and [design judgment #11](/security/design-judgments#dj-11)).
- **No HMAC-family alg for ID Tokens.** `HS256` / `HS384` / `HS512` are not advertised. The alg-confusion attack class needs them to be reachable; closing the type closes the attack.
- **No `request_uri` indication when PAR is off.** `request_uri_parameter_supported` and `pushed_authorization_request_endpoint` only appear when the embedder wired PAR.
- **`claims_parameter_supported` defaults to `true`, but can be disabled.** Passing `op.WithClaimsParameterSupported(false)` makes the discovery document omit OIDC §5.5 support and makes authorize / PAR ignore `claims` payloads after malformed JSON has been rejected.
- **No `frontchannel_logout_supported` or `check_session_iframe`.** Front-Channel Logout 1.0 / Session Management 1.0 are not implemented; the discovery document is silent about them. Embedders use Back-Channel Logout 1.0 instead — see [design judgment #5](/security/design-judgments#dj-5).

::: warning Discovery is a contract surface
Every `_supported` array is a thing the OP commits to accept. Adding values widens the contract; removing values narrows it. RPs may compare against the list to refuse to talk to an OP that no longer advertises an algorithm they require. Treat changes to the discovery document the way you treat changes to a public API.
:::

## Read next

- [Operations: JWKS](/operations/jwks) — what the JWK Set looks like and how the library serves it.
- [Operations: key rotation](/operations/key-rotation) — how the OP rotates signing keys without breaking RP caches.
- [Reference: options](/reference/options) — every `op.With...` option that surfaces in the discovery document.
