---
title: RFC compliance matrix
description: Every standard the library cites, mapped to the package that implements it and the gating option / feature.
pageClass: rfc-matrix-page pg-compliance-rfc-matrix
---

# RFC compliance matrix

Every standard the library cites in its code, mapped to the package that implements it and the option or feature that gates it. Read the status column first (see the legend below), then the parenthesis: it names what is and is not covered.

<figure class="fig">
  <div class="fig-head">How a specification is classified</div>
  <svg class="fig-svg" role="img" aria-labelledby="rfc-matrix-shape-title" viewBox="0 0 960 272" xmlns="http://www.w3.org/2000/svg">
    <title id="rfc-matrix-shape-title">Every specification in the matrix is first sorted by whether it is the OP's concern at all. What is the OP's concern is then marked full, partial or planned; what is not is marked out of scope or refused.</title>
    <!-- specification -->
    <rect class="fg-box" x="32" y="88" width="224" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="116">A specification</text>
    <text class="fg-m" x="48" y="140">RFC · OIDC · FAPI</text>
    <text class="fg-s" x="48" y="164">one row in the matrix</text>
    <path class="fg-edge" d="M256,136 H296" marker-end="url(#fg-a)"/>
    <!-- the question -->
    <rect class="fg-box fg-box--accent" x="296" y="88" width="272" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="312" y="116">Is it the OP's concern?</text>
    <text class="fg-s" x="312" y="140">some specs tell an RP or a</text>
    <text class="fg-s" x="312" y="164">resource server what to do</text>
    <!-- branches -->
    <path class="fg-leader" d="M568,136 H592 M592,72 V200"/>
    <path class="fg-edge fg-edge--thin" d="M592,72 H616" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M592,200 H616" marker-end="url(#fg-a)"/>
    <!-- OP concern -->
    <rect class="fg-box" x="616" y="24" width="312" height="96" rx="8"/>
    <text class="fg-t2" x="632" y="52">Yes — the OP's concern</text>
    <rect class="fg-pill fg-pill--ok" x="632" y="72" width="64" height="32" rx="16"/><text class="fg-s fg-ok" x="664" y="93" text-anchor="middle">full</text>
    <rect class="fg-pill fg-pill--warn" x="704" y="72" width="96" height="32" rx="16"/><text class="fg-s fg-warn" x="752" y="93" text-anchor="middle">partial</text>
    <rect class="fg-pill" x="808" y="72" width="96" height="32" rx="16"/><text class="fg-s fg-dim" x="856" y="93" text-anchor="middle">planned</text>
    <!-- not OP concern -->
    <rect class="fg-box" x="616" y="152" width="312" height="96" rx="8"/>
    <text class="fg-t2" x="632" y="180">No — outside the OP</text>
    <rect class="fg-pill" x="632" y="200" width="136" height="32" rx="16"/><text class="fg-s fg-dim" x="700" y="221" text-anchor="middle">out of scope</text>
    <rect class="fg-pill fg-pill--danger" x="776" y="200" width="96" height="32" rx="16"/><text class="fg-s fg-danger" x="824" y="221" text-anchor="middle">refused</text>
  </svg>
  <figcaption class="fig-note">"Out of scope" and "refused" are different claims. The first says the specification is somebody else's job; the second says it is the OP's job and this OP declines it on purpose, with the reasoning recorded.</figcaption>
</figure>

## Status legend

<span class="status-pill full">full</span> implements the OP-facing surface the library claims for that spec end-to-end.<br/>
<span class="status-pill partial">partial</span> implements the parts the OP needs; some optional sections are out of scope by design.<br/>
<span class="status-pill planned">planned</span> in the spec list, not landed yet.<br/>
<span class="status-pill out">out</span> out-of-scope; structurally not the library's concern.<br/>
<span class="status-pill refused">refused</span> deliberately rejected (e.g. `alg=none`).

These labels describe implementation coverage, not OpenID Foundation certification. A `full` label does not override requirements outside this library's stated scope; the exceptions in each row still apply.

## OIDC core / discovery

| Standard | Status | Where |
|---|---|---|
| **OpenID Connect Core 1.0** | <span class="status-pill partial">partial</span> (`response_type=code` only; Aggregated and Distributed claim types §5.6.2 are not emitted; pairwise sub §8.1 is supported through `op.WithPairwiseSubject`. See "Out of scope by design" below.) | `op/`, `internal/authorize`, `internal/tokenendpoint`, `internal/userinfo`, `internal/sector` |
| **OpenID Connect Discovery 1.0** | <span class="status-pill partial">partial</span> (metadata endpoint is implemented, but `id_token_signing_alg_values_supported` omits `RS256`, which Discovery requires) | `internal/discovery` |
| **OpenID Connect Dynamic Client Registration 1.0** | <span class="status-pill partial">partial</span> (core flow, `sector_identifier_uri` fetch, `application_type=web` / `=native` redirect rules, JWKs / pairwise / response-type cross-checks, PUT reserved-field rejection, `post_logout_redirect_uris` round-trip, and the five JWE alg/enc encrypted-response families are enforced; `client_secret` is intentionally omitted from `GET /register/{id}` responses, `software_statement` is not accepted) | `internal/registrationendpoint` |
| **OpenID Connect RP-Initiated Logout 1.0** | <span class="status-pill full">full</span> | `internal/endsession` |
| **OpenID Connect Back-Channel Logout 1.0** | <span class="status-pill full">full</span> | `internal/backchannel` |
| **OpenID Connect Front-Channel Logout 1.0** | <span class="status-pill out">out</span> (iframe / third-party-cookie signalling is intentionally not shipped; use Back-Channel Logout) | — |
| **OpenID Connect Session Management 1.0** | <span class="status-pill out">out</span> (third-party-cookie-dependent; back-channel preferred) | — |
| **OpenID Connect CIBA Core 1.0** | <span class="status-pill partial">partial</span> (poll delivery only; ping / push deferred to v2+) | `internal/ciba`, `internal/cibaendpoint`, `op.WithCIBA` |

## OAuth 2.0 core RFCs

| RFC | Status | Where / option |
|---|---|---|
| **RFC 6749** OAuth 2.0 Framework | <span class="status-pill partial">partial</span> (authorization-code, refresh-token, and client-credentials surfaces; implicit and password grants are intentionally not implemented) | `op/`, `internal/authorize`, `internal/tokenendpoint` |
| **RFC 6750** Bearer Token Usage | <span class="status-pill partial">partial</span> (OP-issued bearer tokens and OP-hosted resource endpoints such as UserInfo / introspection; general RS challenge behaviour belongs to resource servers) | `internal/tokens`, `internal/userinfo`, `internal/introspectendpoint` |
| **RFC 6819** Threat Model & Security Considerations | <span class="status-pill partial">partial</span> (security guidance applied across the OP; not a standalone protocol surface) | whole codebase |
| **RFC 7009** Token Revocation | <span class="status-pill full">full</span> (gated by `feature.Revoke`; revoking a refresh token revokes its whole rotation chain however long it has grown, plus the grant's access tokens; the user's other refresh chains on the same client stay usable) | `internal/revokeendpoint` |
| **RFC 7521** Assertion Framework | <span class="status-pill partial">partial</span> (`private_key_jwt` client authentication only; assertion grants and `client_secret_jwt` are intentionally not implemented) | `internal/clientauth` |
| **RFC 7523** JWT Bearer Assertions for Client Auth | <span class="status-pill partial">partial</span> (`private_key_jwt`; an assertion with an empty or over-long `jti` is rejected, and a client JWKS fetch fault answers 503 instead of `invalid_client`. JWT bearer authorization grants and `client_secret_jwt` are not implemented, and `client_secret_jwt` is rejected at registration with `invalid_client_metadata`) | `internal/clientauth` |
| **RFC 7591** Dynamic Client Registration | <span class="status-pill partial">partial</span> (gated by `feature.DynamicRegistration`; `software_statement` is rejected with `invalid_software_statement`; a client record carrying both `jwks` and `jwks_uri` is refused on every surface, as §2 forbids the pair) | `internal/registrationendpoint` |
| **RFC 7592** DCR Management | <span class="status-pill partial">partial</span> (read / update / delete; PUT omission resets to server defaults rather than deleting fields, and the response only re-emits `client_secret` on a `none` → confidential auth-method upgrade or an explicit rotation request) | `internal/registrationendpoint` |
| **RFC 7636** PKCE | <span class="status-pill full">full</span> (only `S256`; `plain` refused) | `internal/pkce` |
| **RFC 7662** Token Introspection | <span class="status-pill full">full</span> (gated by `feature.Introspect`; an active refresh token reports no `token_type`, so a resource server cannot mistake it for an access token) | `internal/introspectendpoint` |
| **RFC 7800** Confirmation Methods (`cnf`) | <span class="status-pill full">full</span> | `internal/dpop`, `internal/mtls`, `internal/tokens` |
| **RFC 8252** OAuth 2.0 for Native Apps | <span class="status-pill partial">partial</span> (OP-side native redirect / loopback hardening; client-app behaviour is out of scope) | `internal/registrationendpoint`, `internal/authorize` |
| **RFC 8414** Authorization Server Metadata | <span class="status-pill full">full</span> | `internal/discovery` |
| **RFC 8485** Vectors of Trust | <span class="status-pill partial">partial</span> (consumed via ACR/AAL mapping) | `op/aal.go`, `op/acr.go` |
| **RFC 8628** Device Authorization Grant | <span class="status-pill full">full</span> (gated by `op.WithDeviceCodeGrant`; `slow_down` ladder persisted atomically with `LastPolledAt`; redemption records a `store.Grant`, so revocation and pairwise `/userinfo` reach the tokens; `op/devicecodekit` ships the brute-force gate and a `Revoke` helper that cascades under the grant and, given `Deps.Grants`, deletes the grant record) | `internal/devicecode`, `internal/devicecodeendpoint`, `op/devicecodekit` |
| **RFC 8693** OAuth 2.0 Token Exchange | <span class="status-pill full">full</span> (gated by `op.RegisterTokenExchange`; `act` chain mandatory whenever actor differs from subject, nesting the subject_token's own chain up to five levels; issued tokens sit under the subject_token's grant, so revoking it revokes them; cnf rebinding to the request's verified DPoP / mTLS) | `internal/customgrant/tokenexchange` |
| **RFC 8705** OAuth 2.0 mTLS Client Auth & Cert-Bound Tokens | <span class="status-pill partial">partial</span> (`feature.MTLS` wires certificate-bound access tokens and `mtls_endpoint_aliases`; token endpoint `tls_client_auth` / `self_signed_tls_client_auth` dispatch is not wired) | `internal/mtls` |
| **RFC 8707** Resource Indicators | <span class="status-pill partial">partial</span> (canonicalisation and client allow-list enforcement across authorize / token / device / CIBA; built-in grants currently narrow most issuance paths to a single resource value) | `internal/resourceindicator`, `internal/authorize`, `internal/tokenendpoint`, `internal/devicecodeendpoint`, `internal/cibaendpoint` |
| **RFC 8725** JWT Best Current Practices | <span class="status-pill full">full</span> (alg allow-list, type checks) | `internal/jose` |
| **RFC 9068** JWT Profile for Access Tokens | <span class="status-pill partial">partial</span> (JWT issuance is ES256-only, while §2.1 requires RS256 support; the verifier requires `jti` only when the revocation strategy keys on it, so with strategy `None` it accepts tokens without the §2.2 required claim) | `internal/tokens` |
| **RFC 9101** JAR (JWT-Secured Authorization Request) | <span class="status-pill full">full</span> (gated by `feature.JAR`) | `internal/jar` |
| **RFC 9126** PAR (Pushed Authorization Requests) | <span class="status-pill full">full</span> (gated by `feature.PAR`) | `internal/parendpoint` |
| **RFC 9207** OAuth 2.0 Authorization Server Issuer Identifier | <span class="status-pill full">full</span> | `internal/authorize` (`iss` parameter on the response) |
| **RFC 9396** Rich Authorization Requests (`authorization_details`) | <span class="status-pill full">full</span> (gated by `op.WithAuthorizationDetailTypes`; validated at `/auth`, `/par`, `/token`, persisted with each authorization code, refresh chain and access token so a later authorization cannot change them, echoed on JWT access tokens and introspection, advertised in discovery) | `internal/authorizationdetails`, `op/authorization_details.go` |
| **RFC 9449** DPoP | <span class="status-pill full">full</span> incl. §8 nonce flow (gated by `feature.DPoP`) | `internal/dpop`, `op.WithDPoPNonceSource` |
| **RFC 9470** OAuth 2.0 Step Up Authentication Challenge | <span class="status-pill full">full</span> (OP honours `acr_values` / `max_age` reauthentication via ACR rules; `op.StepUpChallenge` builds the resource-server `WWW-Authenticate` challenge the embedder's RS returns) | `op/rule.go` (`RuleACR`), `op/stepup.go` |
| **RFC 9700** OAuth 2.0 Security Best Current Practice | <span class="status-pill partial">partial</span> (OP-side BCP posture, including refresh-token rotation with replay cascade per §2.2.2; resource-server and client-side requirements remain with embedders) | whole codebase |
| **RFC 9701** JWT Response for OAuth 2.0 Token Introspection | <span class="status-pill full">full</span> (signed JWT default; JWE-wrapped per client `introspection_encrypted_response_alg` / `_enc` metadata) | `internal/introspectendpoint`, `internal/jose` |
| **RFC 9728** OAuth 2.0 Protected Resource Metadata | <span class="status-pill full">full</span> (gated by `op.WithProtectedResources`; served at `/.well-known/oauth-protected-resource` with the issuer stamped into `authorization_servers`) | `internal/protectedresource`, `op/protected_resource.go` |

## IETF drafts

| Draft | Status | Where |
|---|---|---|
| **OAuth 2.0 Grant Management** (`draft-ietf-oauth-grant-management`) | <span class="status-pill partial">partial</span> (gated by `op.WithGrantManagement`; `grant_management_action` / `grant_id` honoured, query / revoke endpoint mounted, `grant_id` on the token response, discovery advertisement. Tracks an IETF draft — surface may change on a draft update) | `internal/grantmgmtendpoint`, `op/grant_management.go` |

## JOSE family

| RFC | Status | Where |
|---|---|---|
| **RFC 7515** JWS | <span class="status-pill partial">partial</span> (compact JWS surfaces used by JWT / JAR / JARM / DPoP / client assertions; general JSON serialization is not exposed) | `internal/jose` |
| **RFC 7516** JWE | <span class="status-pill partial">partial</span> — closed allow-list (`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`). Inbound JWE request_object (JAR / PAR §6.1), outbound JWE id_token, JWT-shape userinfo, JARM authorization response, and RFC 9701 introspection response wired. `RSA1_5` <span class="status-pill refused">refused</span> (CVE-2017-11424 padding oracle); `RSA-OAEP-384/512`, `dir`, symmetric-only `A*KW` deferred to v2+ | `internal/jose`, `op.WithEncryptionKeyset` |
| **RFC 7517** JWK | <span class="status-pill partial">partial</span> (JWK Set publication and client JWKS consumption for supported asymmetric key types; symmetric `oct` keys are not accepted for signing) | `internal/jwks` |
| **RFC 7518** JWA | <span class="status-pill partial">partial</span> — issuance is `ES256` only; verification accepts `RS256`, `PS256`, `ES256`, `EdDSA`. HS\* and `none` <span class="status-pill refused">refused</span> | `internal/jose` |
| **RFC 7519** JWT | <span class="status-pill partial">partial</span> (signed / encrypted JWT surfaces used by OIDC and OAuth extensions; unsecured JWTs are refused) | `internal/jose` |
| **RFC 7638** JWK Thumbprint | <span class="status-pill full">full</span> (used by DPoP `cnf.jkt`) | `internal/dpop` |
| **RFC 8037** Edwards-curve DSA / `EdDSA` | <span class="status-pill partial">partial</span> (Ed25519; Ed448 not enabled) | `internal/jose` |

## FAPI family

The `FAPI2Baseline` Go identifier retains the former *Baseline* name. The final specification is [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html). The OFCS results cited here are for the named Implementer's Draft test plans; they do not establish conformity with every requirement of the final specifications. In particular, the library rotates refresh tokens, whereas Security Profile §5.3.2.1(9) allows rotation only in extraordinary circumstances. The library also accepts the token endpoint URL and array values in `private_key_jwt` `aud`; §5.3.2.1(8) requires accepting only the issuer identifier as a string. These are current Final-profile conformance gaps.

| Profile | Status | Switch |
|---|---|---|
| **FAPI 2.0 Security Profile** | <span class="status-pill partial">partial</span> (PAR, PKCE and sender-constrained tokens are implemented; this switch also requires JAR as a library choice. See the final-specification limitation above and [OFCS](/compliance/ofcs).) | `op.WithProfile(profile.FAPI2Baseline)` |
| **FAPI 2.0 Message Signing** | <span class="status-pill partial">partial</span> (JAR and JARM are implemented; the final specification permits separate signing profiles and inherits the Security Profile requirements) | `op.WithProfile(profile.FAPI2MessageSigning)` |
| **FAPI 1.0 Advanced** | <span class="status-pill out">out</span> | — (use FAPI 2.0) |
| **FAPI-CIBA** | <span class="status-pill partial">partial</span> (library preset: poll mode, `JAR`, DPoP or mTLS, a 10-minute access-token TTL ceiling, `requested_expiry` ≤ 600 s, and an access-token revocation path. The historical ID1 plan uses mTLS; the demo selects it explicitly. The 60-minute request-object age limit is a library constraint; see [OFCS](/compliance/ofcs).) | `op.WithProfile(profile.FAPICIBA)` |
| **OpenID iGov High** | <span class="status-pill out">out</span> | — |

The profile enumeration also carries `profile.Baseline`, which is not a FAPI profile: it declares the OAuth 2.1 / RFC 9700 posture and adds PKCE on every authorization-code request, including confidential clients. See [Declaring a security profile](/use-cases/security-profile).

## Other RFCs the library cites

| RFC | Use |
|---|---|
| **RFC 1918** | Private-network deny-list for back-channel logout SSRF defense |
| **RFC 2045** | Case-insensitive media-type comparison for request-object `typ` |
| **RFC 2606** | Reserved example domains in tests / examples |
| **RFC 3986** | URI parsing |
| **RFC 4122** | UUIDv4 generation |
| **RFC 4226** | HOTP building block used by the TOTP authenticator |
| **RFC 4514** | DN handling for mTLS subject DN |
| **RFC 4647** | Language-tag lookup when selecting a locale bundle |
| **RFC 4648** | Base64url encoding |
| **RFC 5280** | X.509 cert validation |
| **RFC 5321** | SMTP address length bounds for email OTP inputs |
| **RFC 6238** | TOTP authenticator |
| **RFC 6265** | Cookie syntax |
| **RFC 6711** | Authentication Context Class Reference values registry |
| **RFC 7230 / 7231 / 7232 / 7235** | HTTP/1.1 (now superseded by RFC 9110) |
| **RFC 7239** | `Forwarded` header parsing for trusted-proxy handling |
| **RFC 7807** | `application/problem+json` (selected error paths) |
| **RFC 8017** | RSA-PSS / RSA-OAEP algorithm references through JOSE |
| **RFC 8141** | URN handling for PAR `request_uri` values |
| **RFC 8176** | AMR values registry |
| **RFC 8259** | JSON |
| **RFC 9110** | HTTP semantics |
| **RFC 9325** | TLS recommendations; `op.FAPITLSConfig` keeps TLS 1.3 enabled alongside the FAPI TLS 1.2 cipher list |

## Out of scope by design

A handful of OIDC Core / OAuth surfaces are intentionally not implemented. The library tracks each one as a row with `status: out-of-scope` in the scenario catalog (`test/scenarios/catalog/<feature>.yaml`) so the policy is auditable alongside the tests that pin everything else.

- **`response_type` is `code` only.** Implicit (`id_token`, `id_token token`), hybrid (`code id_token`, ...), and `response_type=none` are not issued. RFC 9700 §2.1.2 deprecates the implicit grant; FAPI 2.0 mandates code. Discovery advertises `response_types_supported: ["code"]`.
- **`fragment` response mode is not wired.** With `code`-only issuance there is nothing to put in the URL fragment. `query` and `form_post` are both implemented (the latter renders an auto-submitting HTML form per OIDC Core Form Post Response Mode 1.0); when `feature.JARM` is on, the four `*.jwt` variants are also wired. Discovery advertises `response_modes_supported: ["query", "form_post"]` by default and appends `*.jwt` modes when JARM is enabled.
- **Aggregated and Distributed claim types (OIDC Core §5.6.2) are not emitted.** Only Normal claims are produced; the `_claim_names` / `_claim_sources` keys never appear in tokens or UserInfo responses.
- **`client_secret_jwt` is refused at registration.** Use `private_key_jwt` instead. The HMAC-shared-secret JWT profile is rejected with `invalid_client_metadata: token_endpoint_auth_method client_secret_jwt is not supported`.
- **JWE alg / enc allow-list is closed.** The default set is `RSA-OAEP-256` + `ECDH-ES{,+A128KW,+A256KW}` for key-wrap and `A{128,256}GCM` for content. `WithSupportedEncryptionAlgs` can narrow but not extend. `RSA1_5` is permanently rejected (CVE-2017-11424); `RSA-OAEP-384` / `RSA-OAEP-512`, `dir`, and symmetric-only `A*KW` are deferred to v2+.
- **CIBA push and ping delivery modes** are not implemented. Discovery advertises `backchannel_token_delivery_modes_supported: ["poll"]` exclusively so a client cannot negotiate them.
- **Custom-grant handlers cannot supply refresh-token values.** A handler that wants refresh issuance sets `CustomGrantResponse.IssueRefreshToken`; the OP mints and persists the credential through its own `RefreshTokenStore`, preserving lineage, rotation, replay cascade, and DPoP / mTLS binding. If the client is not registered for `refresh_token`, the access-token response still succeeds and `custom_grant.refresh_dropped` records the omission.

## Out of scope (intentional)

Not every RFC in the OAuth / OIDC sphere is the OP's responsibility. The library deliberately doesn't ship support for the following — they belong to the resource server, the client SDK, or other layers.

| RFC / Spec | Status | Notes |
|---|---|---|
| **RFC 9421 — HTTP Message Signatures** | <span class="status-pill out">out</span> | Resource-server (API protection) concern, not OP. The OP-side equivalents are JAR (RFC 9101) for signed authorization requests, JARM for signed authorization responses, and DPoP (RFC 9449) for proof-of-possession on `/token` and `/userinfo`. RS-side HTTP signing is the embedder's responsibility. |

## Verification

The list is grepped from the live source under `op/` and `internal/`. You can audit it yourself:

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhoE 'RFC [0-9]+' op/ internal/ | sort -u
```

The tables above follow the output of that command: standards the library implements get their own rows, and incidental references are collected under "Other RFCs the library cites".
