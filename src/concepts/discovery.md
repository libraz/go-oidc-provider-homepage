---
title: Discovery
description: What /.well-known/openid-configuration is, how browser and client-credentials-only OPs differ, and how the library builds it.
---

# Discovery

Clients learn the OP's endpoints, signing keys, and capabilities by fetching one JSON document. For an OIDC OP that document is defined by **OIDC Discovery 1.0** and lives at `/.well-known/openid-configuration`. RFC 8414 (OAuth Authorization Server Metadata) defines the same idea for plain OAuth under `/.well-known/oauth-authorization-server`; this library serves only the `openid-configuration` document, and it carries the RFC 8414 members too. This page tours that document.

::: details Specs referenced on this page
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — OAuth 2.0 Authorization Server Metadata
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html)
:::

::: tip Why this exists
Without a discovery document, every RP would hard-code the OP's endpoint URLs, signing algorithms and supported features, and every change on the OP would need a code change in every RP. With discovery, the RP only needs the issuer URL: `https://op.example.com`.
:::

## What's in the discovery document

<figure class="fig">
  <div class="fig-head">The RP reads endpoints, keys and capabilities</div>
  <svg class="fig-svg" role="img" aria-labelledby="discovery-read-title" viewBox="0 0 960 384" xmlns="http://www.w3.org/2000/svg">
    <title id="discovery-read-title">The Relying Party sends one GET request to the well-known URL and receives the discovery document. The document answers three questions: where to send each request, which keys verify tokens, and what this OP accepts.</title>
    <!-- RP and its request / response -->
    <rect class="fg-box" x="32" y="156" width="176" height="72" rx="8"/>
    <text class="fg-t" x="48" y="184">Relying Party</text>
    <text class="fg-s" x="48" y="208">SDK or your app</text>
    <path class="fg-edge" d="M208,172 H336" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="272" y="162" text-anchor="middle">GET</text>
    <path class="fg-edge fg-edge--accent" d="M336,212 H208" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="272" y="202" text-anchor="middle">200 · JSON</text>
    <!-- discovery document -->
    <rect class="fg-group fg-group--accent" x="336" y="24" width="592" height="336" rx="8"/>
    <text class="fg-lbl fg-accent" x="360" y="52">discovery document</text>
    <rect class="fg-box" x="360" y="72" width="240" height="72" rx="8"/>
    <text class="fg-m" x="376" y="100">authorization_endpoint</text>
    <text class="fg-xs" x="376" y="124">token · userinfo · logout</text>
    <path class="fg-edge" d="M600,108 H640" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="640" y="72" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="100">Where to send requests</text>
    <text class="fg-s" x="656" y="124">no hard-coded URLs</text>
    <rect class="fg-box" x="360" y="168" width="240" height="72" rx="8"/>
    <text class="fg-m" x="376" y="196">jwks_uri</text>
    <text class="fg-xs" x="376" y="220">the OP's public keys</text>
    <path class="fg-edge" d="M600,204 H640" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="640" y="168" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="196">Which keys verify tokens</text>
    <text class="fg-s" x="656" y="220">fetch the JWKS, match kid</text>
    <rect class="fg-box" x="360" y="264" width="240" height="72" rx="8"/>
    <text class="fg-m" x="376" y="292">*_supported</text>
    <text class="fg-xs" x="376" y="316">scopes, grants, PKCE…</text>
    <path class="fg-edge" d="M600,300 H640" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="640" y="264" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="292">What this OP will accept</text>
    <text class="fg-s" x="656" y="316">check before using it</text>
  </svg>
  <figcaption class="fig-note">One request replaces three kinds of hard-coded configuration. The response is served with <code>Cache-Control: public, max-age=3600</code>, so the RP asks again at most about once an hour.</figcaption>
</figure>

The table lists the fields a beginner will meet first. The library emits each one when the matching feature is configured. Endpoint URLs are absolute and sit under the mount prefix (`/oidc` by default), for example `https://op.example.com/oidc/auth`.

| Field | What it is |
|---|---|
| `issuer` | The OP's canonical identifier. The same string appears as `iss` in every signed token. RPs compare it byte-for-byte. |
| `authorization_endpoint` | URL of `/auth` — where the browser is redirected to log the user in. |
| `token_endpoint` | URL of `/token` — where the RP exchanges a code or refresh token. |
| `userinfo_endpoint` | URL of `/userinfo` — where the RP fetches fresh claims with an access token. |
| `jwks_uri` | URL of the JWKS — the OP's public signing keys, published as a JWK Set. |
| `introspection_endpoint` | URL of `/introspect` (RFC 7662) — present when the introspection feature is wired. |
| `revocation_endpoint` | URL of `/revoke` (RFC 7009) — present when the revocation feature is wired. |
| `end_session_endpoint` | URL of `/end_session` — where the RP redirects the browser for RP-Initiated Logout. Present only when the authorization endpoint is. |
| `backchannel_logout_supported` | `true` whenever the authorization endpoint exists; the OP can send Back-Channel Logout tokens. |
| `registration_endpoint` | URL of `/register` (RFC 7591) — present when `op.WithDynamicRegistration(...)` is wired. |
| `pushed_authorization_request_endpoint` | URL of `/par` — present only when the PAR feature (RFC 9126) is enabled. |
| `device_authorization_endpoint` | URL of `/device_authorization` — present only when the device-code grant is wired. |
| `backchannel_authentication_endpoint` | URL of `/bc-authorize` — present only when the CIBA grant is wired. |
| `grant_types_supported` | Grant types the OP accepts at `/token`: `authorization_code`, `refresh_token`, `client_credentials`, … |
| `response_types_supported` | Response types the authorization endpoint accepts. Browser-capable configurations advertise only `code` (the OIDC Core "code flow"). A client-credentials-only OP emits an empty array because no authorization endpoint is mounted. |
| `response_modes_supported` | How the authorization endpoint returns the result: `query`, `form_post`, plus `query.jwt`, `fragment.jwt`, `form_post.jwt`, `jwt` when JARM is enabled. |
| `authorization_response_iss_parameter_supported` | Always `true`: every authorization response carries `iss` (RFC 9207). |
| `id_token_signing_alg_values_supported` | JWS algorithms used to sign ID Tokens. The library publishes `ES256` only because OP signing keys are ECDSA P-256. |
| `request_parameter_supported` / `request_uri_parameter_supported` | `true` only when JAR is enabled; otherwise `false`. |
| `request_object_signing_alg_values_supported` | JWS algorithms accepted on JAR `request=` parameters: `RS256`, `PS256`, `ES256`, `EdDSA`. FAPI profiles narrow it to `PS256`, `ES256`, `EdDSA`. Present only when JAR is enabled. |
| `token_endpoint_auth_methods_supported` | How clients authenticate at `/token`. The default list includes `client_secret_basic`, `client_secret_post`, `private_key_jwt`, and `none`; FAPI profiles narrow it. The introspection and revocation auth-method lists intentionally omit `none`, because those endpoints require a confidential caller. mTLS sender-constraint metadata is advertised separately via `mtls_endpoint_aliases`. |
| `code_challenge_methods_supported` | PKCE transformations. The library advertises **only** `S256`. |
| `subject_types_supported` | `public` and (when `op.WithPairwiseSubject(...)` is wired) `pairwise`. |
| `claims_supported` | Claims the OP can return. Omitted unless you pass `op.WithClaimsSupported(...)`, because the library cannot know what your user store holds. |
| `scopes_supported` | Public scopes: the standard OIDC scopes plus every scope registered with `op.WithScope(...)` as public. Private scopes are not listed. |
| `dpop_signing_alg_values_supported` | Present only when the DPoP feature (RFC 9449) is enabled. |
| `require_pushed_authorization_requests` | Present as `true` only under a profile that mandates PAR (the FAPI 2.0 profiles). |
| `claims_parameter_supported` | Defaults to `true`; pass `op.WithClaimsParameterSupported(false)` to stop advertising and honoring OIDC §5.5 `claims` requests. |
| `authorization_details_types_supported` | The RFC 9396 `type` values accepted in `authorization_details`. Present only when `op.WithAuthorizationDetailTypes(...)` is wired. |
| `grant_management_endpoint` | The grant management endpoint URL. Present only when `op.WithGrantManagement(...)` is wired. |
| `grant_management_actions_supported` | The grant management actions the OP accepts (`create` / `replace` / `merge` / `query` / `revoke`). Present with `grant_management_endpoint`. |
| `grant_management_action_required` | Emitted as `true` only when `WithGrantManagement(..., actionRequired=true)` — an authorization request must then carry `grant_management_action`. |

When `op.WithProtectedResources(...)` is wired, the OP additionally serves RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource` (one document per registered resource) — a separate well-known document, not a field on `openid-configuration`.

::: details `_supported` fields are advertisements, not policy
A `_supported` list is what the OP **will accept** — not what every client must use. A client may use a subset. The OP rejects anything outside the list.
:::

## How clients use it

A typical RP SDK does the following on first start:

1. `GET https://op.example.com/.well-known/openid-configuration`
2. Cache the response, for at most the `max-age` the OP sends (3600 seconds).
3. Read endpoints, supported algorithms, and supported features from the cached document.
4. Refetch when the cache expires, or when signature verification fails on an unknown `kid`, which usually means the OP rotated its keys.

The library helps in two ways. The discovery document does not change between restarts of the same configuration, so RPs can cache it for a long time. During a key rotation, the embedder tells the library through `op.WithJWKSRotationActive(predicate)`, and the JWKS endpoint switches from `max-age=3600` to `max-age=300, must-revalidate` so RPs that refetch see the new key quickly.

::: tip The document is built once
The OP builds and marshals the document when the provider is created and serves the same JSON body for the provider's lifetime, so every instance with the same configuration returns identical bytes. Staleness is therefore an RP-side concern: see [key rotation](/operations/key-rotation) for how long an RP can keep using a cached JWKS.
:::

## How this library builds it

Discovery is constructed once at `op.New` from the wired feature set, so it cannot drift at runtime: if the embedder did not wire PAR, `pushed_authorization_request_endpoint` is absent and `require_pushed_authorization_requests` does not appear. If the embedder wired `op.WithProfile(profile.FAPI2Baseline)`, the FAPI narrowing applies — `token_endpoint_auth_methods_supported` is filtered to the FAPI-permitted set, `require_pushed_authorization_requests=true` appears, and the introspection / revocation auth-method lists are copied from the same narrowed list with `none` removed. The authorization endpoint and its browser-only metadata are emitted only when a configured grant needs the browser authorization flow. A `client_credentials`-only OP therefore omits `authorization_endpoint`, `end_session_endpoint`, and `backchannel_logout_supported`, while retaining `response_types_supported: []`.

`WithDiscoveryMetadata(DiscoveryMetadata{UILocalesSupported: ...})` is also a construction-time contract: every explicitly advertised locale must be served by the registered locale resolver. Advertising an unserved locale makes `op.New` fail instead of producing discovery metadata that the UI cannot honor.

Golden tests pin the document shape for each profile, so what discovery says and what the handlers do cannot diverge unnoticed. See [design judgment #12](/security/design-judgments#dj-12) for the rationale.

The document is served at `/.well-known/openid-configuration`, outside the mount prefix. For an issuer with a path, the same document is also served at the issuer-relative path; see [Issuer](/concepts/issuer#how-to-set-it).

## What the library does NOT advertise

The library narrows the discovery document deliberately:

- **No `none` alg.** `id_token_signing_alg_values_supported` and `request_object_signing_alg_values_supported` never contain `none`. This is separate from the `none` client-authentication method listed for `/token`; `none` is never a signing algorithm (see [JOSE basics](/concepts/jose-basics) and [design judgment #11](/security/design-judgments#dj-11)).
- **No HMAC-family alg for ID Tokens.** `HS256` / `HS384` / `HS512` are not advertised. The alg-confusion attack class needs them to be reachable, so the library never makes them reachable.
- **No request-object support unless JAR is wired.** Without JAR, `request_parameter_supported` and `request_uri_parameter_supported` are `false` and the request-object algorithm lists are absent. `pushed_authorization_request_endpoint` appears only when PAR is wired.
- **`claims_parameter_supported` defaults to `true`, but can be disabled.** Passing `op.WithClaimsParameterSupported(false)` makes the discovery document omit OIDC §5.5 support and makes authorize / PAR ignore `claims` payloads after malformed JSON has been rejected.
- **No `frontchannel_logout_supported` or `check_session_iframe`.** Front-Channel Logout 1.0 / Session Management 1.0 are not implemented; the discovery document is silent about them. Embedders use Back-Channel Logout 1.0 instead — see [design judgment #5](/security/design-judgments#dj-5).

::: warning Discovery is a contract surface
Every `_supported` array is a commitment to accept those values. Adding a value widens the contract and removing one narrows it, and an RP may refuse to talk to an OP that stops advertising an algorithm it requires. Treat changes to the discovery document like changes to a public API.
:::

## Read next

- [Operations: JWKS](/operations/jwks) — what the JWK Set looks like and how the library serves it.
- [Operations: key rotation](/operations/key-rotation) — how the OP rotates signing keys without breaking RP caches.
- [Reference: options](/reference/options) — every `op.With...` option that surfaces in the discovery document.
