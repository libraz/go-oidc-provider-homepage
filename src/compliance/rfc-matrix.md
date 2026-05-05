---
title: RFC compliance matrix
description: Every standard the library cites, mapped to the package that implements it and the gating option / feature.
pageClass: rfc-matrix-page
---

# RFC compliance matrix

Every standard the library actively cites in its code, mapped to the package that implements it and the option / feature that gates it.

## Status legend

<span class="status-pill full">full</span> implements the spec end-to-end.<br/>
<span class="status-pill partial">partial</span> implements the parts the OP needs; some optional sections are out of scope by design.<br/>
<span class="status-pill planned">planned</span> in the spec list, not landed yet.<br/>
<span class="status-pill out">out</span> out-of-scope; structurally not the library's concern.<br/>
<span class="status-pill refused">refused</span> deliberately rejected (e.g. `alg=none`).

## OIDC core / discovery

| Standard | Status | Where |
|---|---|---|
| **OpenID Connect Core 1.0** | <span class="status-pill partial">partial</span> (`response_type=code` only; Aggregated and Distributed claim types §5.6.2 are not emitted; pairwise sub §8.1 is now wired via `op.WithPairwiseSubject`. See "Out of scope by design" below.) | `op/`, `internal/authorize`, `internal/tokenendpoint`, `internal/userinfo`, `internal/sector` |
| **OpenID Connect Discovery 1.0** | <span class="status-pill full">full</span> | `internal/discovery` |
| **OpenID Connect Dynamic Client Registration 1.0** | <span class="status-pill partial">partial</span> (core flow, `sector_identifier_uri` fetch, `application_type=web` / `=native` redirect rules, JWKs / pairwise / response-type cross-checks, PUT reserved-field rejection, `post_logout_redirect_uris` round-trip, and the five JWE alg/enc encrypted-response families are enforced; `client_secret` is intentionally omitted from `GET /register/{id}` responses, `software_statement` is not accepted) | `internal/registrationendpoint` |
| **OpenID Connect RP-Initiated Logout 1.0** | <span class="status-pill full">full</span> | `internal/endsession` |
| **OpenID Connect Back-Channel Logout 1.0** | <span class="status-pill full">full</span> | `internal/backchannel` |
| **OpenID Connect Front-Channel Logout 1.0** | <span class="status-pill planned">planned</span> | — |
| **OpenID Connect Session Management 1.0** | <span class="status-pill out">out</span> (third-party-cookie-dependent; back-channel preferred) | — |
| **OpenID Connect CIBA Core 1.0** | <span class="status-pill partial">partial</span> (poll delivery only; ping / push deferred to v2+) | `internal/ciba`, `internal/cibaendpoint`, `op.WithCIBA` |

## OAuth 2.0 core RFCs

| RFC | Status | Where / option |
|---|---|---|
| **RFC 6749** OAuth 2.0 Framework | <span class="status-pill full">full</span> | `op/`, `internal/authorize`, `internal/tokenendpoint` |
| **RFC 6750** Bearer Token Usage | <span class="status-pill full">full</span> | `internal/tokens` |
| **RFC 6819** Threat Model & Security Considerations | <span class="status-pill full">full</span> (the BCP this library is built around) | whole codebase |
| **RFC 7009** Token Revocation | <span class="status-pill full">full</span> (gated by `feature.Revoke`) | `internal/revokeendpoint` |
| **RFC 7521** Assertion Framework | <span class="status-pill full">full</span> (only the `private_key_jwt` profile; `client_secret_jwt` is intentionally not implemented) | `internal/clientauth` |
| **RFC 7523** JWT Bearer Assertions for Client Auth | <span class="status-pill full">full</span> (`private_key_jwt`; `client_secret_jwt` is rejected at registration with `invalid_client_metadata`) | `internal/clientauth` |
| **RFC 7591** Dynamic Client Registration | <span class="status-pill partial">partial</span> (gated by `feature.DynamicRegistration`; `software_statement` is rejected with `invalid_software_statement`) | `internal/registrationendpoint` |
| **RFC 7592** DCR Management | <span class="status-pill partial">partial</span> (read / update / delete; PUT omission resets to server defaults rather than deleting fields, and the response only re-emits `client_secret` on a `none` → confidential auth-method upgrade or an explicit rotation request) | `internal/registrationendpoint` |
| **RFC 7636** PKCE | <span class="status-pill full">full</span> (only `S256`; `plain` refused) | `internal/pkce` |
| **RFC 7662** Token Introspection | <span class="status-pill full">full</span> (gated by `feature.Introspect`) | `internal/introspectendpoint` |
| **RFC 7800** Confirmation Methods (`cnf`) | <span class="status-pill full">full</span> | `internal/dpop`, `internal/mtls`, `internal/tokens` |
| **RFC 8252** OAuth 2.0 for Native Apps | <span class="status-pill full">full</span> (loopback hardening enforced) | `internal/registrationendpoint`, `internal/authorize` |
| **RFC 8414** Authorization Server Metadata | <span class="status-pill full">full</span> | `internal/discovery` |
| **RFC 8485** Vectors of Trust | <span class="status-pill partial">partial</span> (consumed via ACR/AAL mapping) | `op/aal.go`, `op/acr.go` |
| **RFC 8628** Device Authorization Grant | <span class="status-pill full">full</span> (gated by `op.WithDeviceCodeGrant`; `slow_down` ladder persisted atomically with `LastPolledAt`; `op/devicecodekit` ships the brute-force gate + revoke audit hook) | `internal/devicecode`, `internal/devicecodeendpoint`, `op/devicecodekit` |
| **RFC 8693** OAuth 2.0 Token Exchange | <span class="status-pill full">full</span> (gated by `op.RegisterTokenExchange`; act chain mandatory whenever actor differs from subject; cnf rebinding to request's verified DPoP / mTLS) | `internal/customgrant/tokenexchange` |
| **RFC 8705** OAuth 2.0 mTLS Client Auth & Cert-Bound Tokens | <span class="status-pill full">full</span> (gated by `feature.MTLS`; `mtls_endpoint_aliases` now published in discovery) | `internal/mtls` |
| **RFC 8707** Resource Indicators | <span class="status-pill full">full</span> | `internal/tokenendpoint` |
| **RFC 8725** JWT Best Current Practices | <span class="status-pill full">full</span> (alg allow-list, type checks) | `internal/jose` |
| **RFC 9068** JWT Profile for Access Tokens | <span class="status-pill full">full</span> | `internal/tokens` |
| **RFC 9101** JAR (JWT-Secured Authorization Request) | <span class="status-pill full">full</span> (gated by `feature.JAR`) | `internal/jar` |
| **RFC 9126** PAR (Pushed Authorization Requests) | <span class="status-pill full">full</span> (gated by `feature.PAR`) | `internal/parendpoint` |
| **RFC 9207** OAuth 2.0 Authorization Server Issuer Identifier | <span class="status-pill full">full</span> | `internal/authorize` (`iss` parameter on the response) |
| **RFC 9396** Rich Authorization Requests (`authorization_details`) | <span class="status-pill full">full</span> (consumed at JAR merge & authorize) | `internal/jar`, `internal/authorize` |
| **RFC 9449** DPoP | <span class="status-pill full">full</span> incl. §8 nonce flow (gated by `feature.DPoP`) | `internal/dpop`, `op.WithDPoPNonceSource` |
| **RFC 9470** OAuth 2.0 Step Up Authentication Challenge | <span class="status-pill full">full</span> | `op/rule.go` (`RuleACR`) |
| **RFC 9700** OAuth 2.0 Security Best Current Practice | <span class="status-pill full">full</span> | whole codebase |
| **RFC 9701** JWT Response for OAuth 2.0 Token Introspection | <span class="status-pill full">full</span> (signed JWT default; JWE-wrapped per client `introspection_encrypted_response_alg` / `_enc` metadata) | `internal/introspectendpoint`, `internal/jose` |

## JOSE family

| RFC | Status | Where |
|---|---|---|
| **RFC 7515** JWS | <span class="status-pill full">full</span> | `internal/jose` |
| **RFC 7516** JWE | <span class="status-pill partial">partial</span> — closed allow-list (`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`). Inbound JWE request_object (JAR / PAR §6.1), outbound JWE id_token, JWT-shape userinfo, JARM authorization response, and RFC 9701 introspection response wired. `RSA1_5` <span class="status-pill refused">refused</span> (CVE-2017-11424 padding oracle); `RSA-OAEP-384/512`, `dir`, symmetric-only `A*KW` deferred to v2+ | `internal/jose`, `op.WithEncryptionKeyset` |
| **RFC 7517** JWK | <span class="status-pill full">full</span> | `internal/jwks` |
| **RFC 7518** JWA | <span class="status-pill partial">partial</span> — issuance is `ES256` only; verification accepts `RS256`, `PS256`, `ES256`, `EdDSA`. HS\* and `none` <span class="status-pill refused">refused</span> | `internal/jose` |
| **RFC 7519** JWT | <span class="status-pill full">full</span> | `internal/jose` |
| **RFC 7638** JWK Thumbprint | <span class="status-pill full">full</span> (used by DPoP `cnf.jkt`) | `internal/dpop` |
| **RFC 8037** Edwards-curve DSA / `EdDSA` | <span class="status-pill full">full</span> (Ed25519; Ed448 not enabled) | `internal/jose` |

## FAPI family

| Profile | Status | Switch |
|---|---|---|
| **FAPI 2.0 Baseline** | <span class="status-pill full">full</span> (continuously regressed; see [OFCS](/compliance/ofcs)) | `op.WithProfile(profile.FAPI2Baseline)` |
| **FAPI 2.0 Message Signing** | <span class="status-pill full">full</span> (continuously regressed) | `op.WithProfile(profile.FAPI2MessageSigning)` |
| **FAPI 1.0 Advanced** | <span class="status-pill out">out</span> | — (use FAPI 2.0) |
| **FAPI-CIBA** | <span class="status-pill full">full</span> (poll mode; enforces `JAR` + `DPoP\|MTLS`, 10-min access TTL, FAPI 2.0 client-auth set, `requested_expiry` ≤ 600 s, JAR `iss` / `aud` / `exp` / `nbf` required, request-object lifetime ≤ 60 min per FAPI 2.0 Message Signing §5.6, access-token revocation required) | `op.WithProfile(profile.FAPICIBA)` |
| **OpenID iGov High** | <span class="status-pill planned">planned</span> for v2 | `profile.IGovHigh` (constant exists; `op.New` rejects it today because the runtime constraints have not landed) |

## Other RFCs the library cites

| RFC | Use |
|---|---|
| **RFC 1918** | Private-network deny-list for back-channel logout SSRF defense |
| **RFC 3986** | URI parsing |
| **RFC 4122** | UUIDv4 generation |
| **RFC 4514** | DN handling for mTLS subject DN |
| **RFC 4648** | Base64url encoding |
| **RFC 5280** | X.509 cert validation |
| **RFC 6238** | TOTP authenticator |
| **RFC 6265** | Cookie syntax |
| **RFC 6711** | Authentication Context Class Reference values registry |
| **RFC 7230 / 7231 / 7232 / 7235** | HTTP/1.1 (now superseded by RFC 9110) |
| **RFC 7807** | `application/problem+json` (selected error paths) |
| **RFC 8176** | AMR values registry |
| **RFC 8259** | JSON |
| **RFC 9110** | HTTP semantics |

## Out of scope by design

A handful of OIDC Core / OAuth surfaces are intentionally not implemented. The library tracks each one as a row with `status: out-of-scope` in the scenario catalog (`test/scenarios/catalog/<feature>.yaml`) so the policy is auditable alongside the tests that pin everything else.

- **`response_type` is `code` only.** Implicit (`id_token`, `id_token token`), hybrid (`code id_token`, ...), and `response_type=none` are not issued. RFC 9700 §1.4 deprecates the implicit grant; FAPI 2.0 mandates code. Discovery advertises `response_types_supported: ["code"]`.
- **`fragment` response mode is not wired.** With `code`-only issuance there is nothing to put in the URL fragment. `query` and `form_post` are both implemented (the latter renders an auto-submitting HTML form per OIDC Core Form Post Response Mode 1.0); when `feature.JARM` is on, the four `*.jwt` variants are also wired. Discovery advertises `response_modes_supported: ["query", "form_post"]` by default and appends `*.jwt` modes when JARM is enabled.
- **Aggregated and Distributed claim types (OIDC Core §5.6.2) are not emitted.** Only Normal claims are produced; the `_claim_names` / `_claim_sources` keys never appear in tokens or UserInfo responses.
- **`client_secret_jwt` is refused at registration.** Use `private_key_jwt` instead. The HMAC-shared-secret JWT profile is rejected with `invalid_client_metadata: token_endpoint_auth_method client_secret_jwt is not supported`.
- **JWE alg / enc allow-list is closed.** v0.9.1 ships `RSA-OAEP-256` + `ECDH-ES{,+A128KW,+A256KW}` for key-wrap and `A{128,256}GCM` for content. `WithSupportedEncryptionAlgs` can narrow but not extend. `RSA1_5` is permanently rejected (CVE-2017-11424); `RSA-OAEP-384` / `RSA-OAEP-512`, `dir`, and symmetric-only `A*KW` are deferred to v2+.
- **CIBA push and ping delivery modes** are not implemented. Discovery advertises `backchannel_token_delivery_modes_supported: ["poll"]` exclusively so a client cannot negotiate them.
- **Custom-grant refresh tokens are rejected.** A `CustomGrantResponse.RefreshToken` non-empty value collapses to `server_error`. The in-tree token-exchange handler is exempt — its grant_type URN is checked before the gate fires. Lineage-tracked persistence + rotation for handler-issued refresh tokens is a v2+ design item.

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

The list above mirrors the output of that command, with the ones that are normative-for-the-library called out and the ones that are incidental references rolled up in "Other".
