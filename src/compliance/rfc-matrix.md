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
| **OpenID Connect Core 1.0** | <span class="status-pill partial">partial</span> (`response_type=code` only; Aggregated and Distributed claim types §5.6.2 are not emitted; signed / encrypted UserInfo §5.3.2 is not implemented — UserInfo always returns `application/json`. See "Out of scope by design" below.) | `op/`, `internal/authorize`, `internal/tokenendpoint`, `internal/userinfo` |
| **OpenID Connect Discovery 1.0** | <span class="status-pill full">full</span> | `internal/discovery` |
| **OpenID Connect Dynamic Client Registration 1.0** | <span class="status-pill partial">partial</span> (core flow, `sector_identifier_uri` fetch, `application_type=web` / `=native` redirect rules, JWKs / pairwise / response-type cross-checks, and PUT reserved-field rejection are enforced; `client_secret` is intentionally omitted from `GET /register/{id}` responses, `software_statement` is not accepted) | `internal/registrationendpoint` |
| **OpenID Connect RP-Initiated Logout 1.0** | <span class="status-pill full">full</span> | `internal/endsession` |
| **OpenID Connect Back-Channel Logout 1.0** | <span class="status-pill full">full</span> | `internal/backchannel` |
| **OpenID Connect Front-Channel Logout 1.0** | <span class="status-pill planned">planned</span> | — |
| **OpenID Connect Session Management 1.0** | <span class="status-pill out">out</span> (third-party-cookie-dependent; back-channel preferred) | — |

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
| **RFC 8628** Device Authorization Grant | <span class="status-pill planned">planned</span> (`grant.DeviceCode` reserved; not yet wired) | — |
| **RFC 8705** OAuth 2.0 mTLS Client Auth & Cert-Bound Tokens | <span class="status-pill full">full</span> (gated by `feature.MTLS`) | `internal/mtls` |
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
| **RFC 9701** JWT Response for OAuth 2.0 Token Introspection | <span class="status-pill planned">planned</span> | — |

## JOSE family

| RFC | Status | Where |
|---|---|---|
| **RFC 7515** JWS | <span class="status-pill full">full</span> | `internal/jose` |
| **RFC 7516** JWE | <span class="status-pill out">out</span> — encrypted ID Token, UserInfo, Request Object (RFC 9101 §6.1), and Response Object (JARM §4.3) are all intentionally not implemented; the JOSE surface is JWS-only | — |
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
| **FAPI-CIBA** | <span class="status-pill planned">planned</span> for v1.x | `profile.FAPICIBA` (constant exists) |
| **OpenID iGov High** | <span class="status-pill planned">planned</span> for v2 | `profile.IGovHigh` (constant exists) |

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
- **Bare `form_post` and `fragment` response modes never reach the response writer.** Only `query` and (when `feature.JARM` is on) the four `*.jwt` modes are wired. `form_post` is accepted at parameter validation for compatibility, but with no hybrid / implicit issuance there is nothing to put in the form body.
- **Aggregated and Distributed claim types (OIDC Core §5.6.2) are not emitted.** Only Normal claims are produced; the `_claim_names` / `_claim_sources` keys never appear in tokens or UserInfo responses.
- **Signed / encrypted UserInfo response (OIDC Core §5.3.2) is not implemented.** `GET /userinfo` always returns `application/json`; `userinfo_signed_response_alg` is not honoured.
- **JWE / encryption family is not implemented.** Encrypted ID Tokens, encrypted UserInfo, encrypted Request Objects (RFC 9101 §6.1), and encrypted Response Objects (JARM §4.3) are all out of scope. See RFC 7516 in the JOSE family table above.
- **`client_secret_jwt` is refused at registration.** Use `private_key_jwt` instead. The HMAC-shared-secret JWT profile is rejected with `invalid_client_metadata: token_endpoint_auth_method client_secret_jwt is not supported`.

## Verification

The list is grepped from the live source under `op/` and `internal/`. You can audit it yourself:

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhoE 'RFC [0-9]+' op/ internal/ | sort -u
```

The list above mirrors the output of that command, with the ones that are normative-for-the-library called out and the ones that are incidental references rolled up in "Other".
