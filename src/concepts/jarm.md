---
title: JARM — JWT Authorization Response Mode
description: Wrap the authorization response in a signed (and optionally encrypted) JWT so the response itself is cryptographically attributable to the OP.
---

# JARM — JWT Authorization Response Mode

By default the OP returns the authorization response (`code`, `state`, `iss`, …) as plain URL query parameters or a fragment. Anyone who can rewrite the redirect — a malicious browser extension, a compromised intermediary, a mix-up between two OPs — can substitute fields before the RP sees them. **JARM** (the OpenID Foundation FAPI WG specification "JWT Secured Authorization Response Mode for OAuth 2.0", referenced informationally by RFC 9101 §10.2) wraps that response into a single signed JWT delivered through one `response` parameter, so the response itself becomes tamper-evident and cryptographically attributable to the OP.

JARM is one of the two protections FAPI 2.0 Message Signing layers on top of FAPI 2.0 Baseline. The other is response-side signing at the resource server. Together they give full non-repudiation: every authorization request and every authorization response is signed by an identifiable party.

::: details Specs referenced on this page
- [OAuth 2.0 JARM](https://openid.net/specs/oauth-v2-jarm.html) — JWT Secured Authorization Response Mode
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR (cross-references JARM in §10.2)
- [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207) — `iss` parameter on the authorization response
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-2_0-message-signing.html)
- [OIDC Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
:::

## Why JARM exists

The classic redirect carries `code` and `state` as query parameters. Two attack shapes target that wire format:

- **Mix-up.** The user is logged into two OPs simultaneously. An attacker who controls one of them can swap their own `code` for the legitimate OP's `code` in the redirect, tricking the RP into exchanging the attacker's code at the legitimate OP's `/token` and binding the attacker's identity to the user's session.
- **Mid-channel rewrite.** Anything that sits between the user agent and the RP — a browser extension, a corporate proxy, a compromised CDN edge — can rewrite the response before the RP receives it. PKCE binds the code to the RP-chosen verifier so the rewriter cannot redeem the substituted code itself, but it does not prove **which OP** issued the code the RP ends up exchanging.

> **OAuth 2.0 JARM §1 (paraphrased)** the authorization response is cryptographically protected so that neither the issuer of the response nor the values it carries can be tampered with after the OP signs it.

[RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207) (the `iss` parameter on the authorization response) is the lightweight defence: the OP appends its issuer URL to the redirect, the RP rejects any redirect whose `iss` does not match the OP it sent the user to. That stops the mix-up class without a JWT round-trip, and FAPI 2.0 Baseline mandates it. JARM is the heavyweight option, used when the response itself must carry a portable signature — for audit trails, for on-the-wire forwarding through brokers, or for FAPI 2.0 Message Signing's full non-repudiation contract.

## Wire format

The client opts in by setting `response_mode` on the authorize (or PAR) request to one of the four JARM values (see `internal/jarm/mode.go`):

| `response_mode` | Delivery | Used for |
|---|---|---|
| `query.jwt` | `?response=<JWT>` on the redirect URL | Code flow (the only flow v0.x ships, so the bare `jwt` alias resolves here) |
| `fragment.jwt` | `#response=<JWT>` on the redirect URL | Hybrid / implicit flows (wired but not exercised in v0.x) |
| `form_post.jwt` | hidden `response` field in an auto-submitted HTML form | Browsers that need to avoid the URL bar |
| `jwt` | bare alias — resolved to `query.jwt` for `response_type=code`, `fragment.jwt` for response types that include `token` / `id_token` | Default-aware clients |

The OP returns one parameter — `response` — whose value is the JWT. Nothing else lives on the redirect. The JWT carries the original response fields as claims (see `internal/jarm/encode.go`):

| Claim | Meaning |
|---|---|
| `iss` | OP issuer URL (matches discovery's `issuer`) |
| `aud` | the requesting client's `client_id` |
| `exp` | short-lived expiry; the library defaults to 60 seconds (`jarm.DefaultExpiry`) |
| `iat`, `nbf` | issued-at and not-before, set equal so a strict consumer can apply a uniform nbf-or-fail rule |
| `code` | success path — the authorization code |
| `state` | success or error path, when the request supplied it |
| `error`, `error_description`, `error_uri` | error path — same triple as a non-JARM error response |

`code` and `error` are mutually exclusive; the OP populates one or the other. Validation lives in `internal/jarm/encode.go`'s `validatePayload` and is enforced by every `Sign` call.

## Signing

The OP signs JARM with the same key it uses for ID Tokens and JWT access tokens. v0.x ships a closed alg list:

> **Source:** `internal/jarm/encode.go` — `deriveJWSAlgorithm` rejects every key shape other than ECDSA P-256 with `jose.ErrUnsupportedKeyShape`. The signature algorithm is therefore always `ES256`.

There is no `authorization_signed_response_alg` per-client override in v0.x. Discovery advertises a single value:

```json
"authorization_signing_alg_values_supported": ["ES256"]
```

`alg=none`, `RS256`, and the `HS*` family are structurally absent from the type — see [Design judgments #11](/security/design-judgments#dj-11) for the closed-enum rationale that applies uniformly to every JOSE surface in the library.

::: details Why a single alg and not a negotiable list?
JOSE alg negotiation is the historical source of `alg=none` and the HMAC-with-public-key ("alg confusion") class of bugs. The library refuses to negotiate: the wire-side allow-list and the type-level enum agree, and any input naming an alg outside the list is rejected before the bytes reach a verifier. v0.x ships ES256 to keep the wire compatible with FAPI 2.0 Message Signing's required set without expanding the surface.
:::

## Encryption

A client that registered `authorization_encrypted_response_alg` and `authorization_encrypted_response_enc` receives a JARM response wrapped in a JWE around the signed JWT (JWS-then-JWE). The wrapping happens in `internal/authorizeendpoint/jarm_encrypt.go`'s `maybeEncryptJARM`:

- The OP looks up the client's encryption JWKs through `internal/clientencjwks/` (statically registered or fetched from the client's `jwks_uri`).
- The signed JARM JWT is encrypted to the resolved recipient using the registered `alg` / `enc` pair.
- If the encryption fails, the OP refuses to fall back to a plaintext `?code=...` redirect — it returns `server_error` instead. Sending the code in the clear after the client demanded an encrypted envelope would be a worse outcome than failing closed.

The `alg` / `enc` allow-list is the same closed list the library uses for ID Token / userinfo / introspection encryption (`op.SupportedEncryptionAlgs` and `op.SupportedEncryptionEncs`): RSA-OAEP family with `SHA-256` / `SHA-512`, ECDH-ES variants, AES-GCM key wrap, and `A128GCM` / `A256GCM` content encryption. `RSA1_5`, `dir`, and the AES-CBC-HS content encryption variants are intentionally excluded. See [JWE encryption](/use-cases/jwe-encryption) for the full alg matrix and the rationale.

The OP advertises `authorization_encryption_alg_values_supported` and `_enc_values_supported` in discovery only when both the JARM feature and `op.WithEncryptionKeyset` are wired (see `internal/discovery/document.go`).

## How clients verify

The client treats `?response=<JWT>` (or its fragment / form_post equivalent) as the entire authorization response. Verification follows the OAuth 2.0 JARM specification §4.4:

1. Fetch the OP's JWKS from the `jwks_uri` advertised in discovery.
2. Verify the JWT signature against the matching `kid`.
3. Check `iss` equals the configured OP issuer (string-equal, no normalisation).
4. Check `aud` equals the client's own `client_id`.
5. Check `exp` is in the future (and, for strict consumers, `nbf` is in the past).
6. If the JWT is encrypted, decrypt with the client's private encryption key first, then verify the inner signature against the OP's signing JWKS.

Once those checks pass, the client extracts `code`, `state`, and the optional `error` triple from the JWT claims and proceeds exactly as if the values had arrived as plain query parameters. The redirect-URI exact-match check, the `state` round-trip check, and the PKCE code-verifier computation all run on the values pulled out of the JWT.

## When JARM is required

| Profile / context | JARM status |
|---|---|
| **FAPI 2.0 Message Signing** | required (`feature.JARM` is auto-enabled by `op.WithProfile(profile.FAPI2MessageSigning)`) — see [FAPI 2.0](/concepts/fapi) |
| **FAPI 2.0 Baseline** | optional (RFC 9207 `iss` parameter is sufficient for Baseline) |
| **FAPI-CIBA** | not applicable — CIBA has no front-channel authorization response |
| **Plain OIDC / OAuth** | pure choice — most deployments rely on RFC 9207 `iss` and skip JARM |

JARM is never the only mitigation against a particular CVE class. The role it plays is **cryptographic auditability of the authorization response**, which matters most when the response is forwarded out-of-band (broker architectures, regulator-mandated logs) or when a deployment wants the strongest possible integrity contract on every protocol message.

## Wiring this library

JARM is gated by `feature.JARM` (see `op/feature/feature.go`). Two ways to enable it:

**Profile-driven.** `op.WithProfile(profile.FAPI2MessageSigning)` adds JARM to the required feature set alongside PAR and JAR (`op/profile/constraints.go` — `RequiredFeatures`). The build-time validator refuses to construct an OP under this profile without `feature.JARM`.

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/profile"
)

op.New(
  /* required options */
  op.WithProfile(profile.FAPI2MessageSigning),
)
```

**Manual feature flag.** Add `feature.JARM` directly when you want JARM outside FAPI 2.0 Message Signing — for example, on an OIDC deployment that wants signed responses for audit reasons.

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
)

op.New(
  /* required options */
  op.WithFeature(feature.JARM),
)
```

The signer is constructed once at `op.New` (see `op/op_builders.go` — `buildJARMSigner`) using the active OP signing key. No separate keyset, no per-request key lookup.

**Per-client metadata.** When `feature.JARM` is on, the client metadata accepts (see `op/registration.go`):

| Field | Effect |
|---|---|
| `authorization_encrypted_response_alg` | Request a JWE-wrapped JARM response with the named JWE `alg`. Must be on `op.SupportedEncryptionAlgs`. |
| `authorization_encrypted_response_enc` | Pair with `authorization_encrypted_response_alg`. Must be on `op.SupportedEncryptionEncs`. |

Both fields can be supplied at static seed time (the `op.ClientSeed` / `store.Client` shape) or through Dynamic Client Registration (`POST /register`). v0.x does not implement `authorization_signed_response_alg` per-client override; the OP-wide ES256 setting applies to every JARM-using client.

## JARM and DPoP / mTLS

JARM signs the authorization response. [DPoP](/concepts/dpop) and [mTLS](/concepts/mtls) bind issued tokens to a key the legitimate client holds. The two layers are orthogonal — JARM protects the **handshake step that delivers the code**, sender constraint protects the **tokens issued in exchange for that code** — and FAPI 2.0 Message Signing requires both.

A request that uses JARM almost always also uses [PAR](/use-cases/fapi2-baseline) and [JAR](https://datatracker.ietf.org/doc/html/rfc9101). The four together give a fully signed authorization request and a fully signed authorization response, with sender-constrained tokens at the end. The library auto-enables PAR, JAR, and JARM under `op.WithProfile(profile.FAPI2MessageSigning)` and imposes the DPoP-or-mTLS `RequiredAnyOf` constraint that picks the sender-constraint mechanism.

## Read next

- [FAPI 2.0](/concepts/fapi) — where JARM fits in the FAPI 2.0 Baseline / Message Signing split.
- [Sender constraint — selection guide](/concepts/sender-constraint) — DPoP vs mTLS for the token-binding layer that runs alongside JARM.
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — full wiring for the Baseline profile, the starting point before adding JARM.
- [JWE encryption](/use-cases/jwe-encryption) — encrypted JARM, encrypted ID Token, encrypted userinfo, encrypted introspection (one keyset, four targets).
- [Design judgments](/security/design-judgments) — closed alg enum (#11) and other resolved spec tensions that JARM inherits.
