---
title: JWE encryption — id_token, userinfo, JARM, introspection
description: Wire JWE — register an encryption keyset, accept JWE request_objects, encrypt outbound responses to the client's use=enc JWK.
---

# Use case — JWE encryption (RFC 7516)

The OP can:

- **Decrypt** JWE-shaped request objects (JAR / PAR §6.1) addressed to the OP's `use=enc` keyset.
- **Encrypt** outbound `id_token`, JWT-shape `userinfo`, JARM authorization responses, and RFC 9701 JWT introspection responses to the client's registered `use=enc` JWK.

Both directions ship in v0.9.1 against a closed algorithm allow-list.

::: details JWS vs JWE — what's the difference?
**JWS** (RFC 7515) is the JOSE format you already know: a header + payload + signature. Anyone with the key can read the payload; the signature only proves it wasn't tampered with. **JWE** (RFC 7516) wraps the payload in a ciphertext so that only the holder of the matching private key can read it. id_tokens are signed (JWS) by default; encrypting them on top means the payload becomes opaque to anything that's not the intended RP — useful when something other than the RP terminates TLS.
:::

::: details `alg` vs `enc` — what's the difference?
JWE uses two algorithm slots, and the split confuses everyone the first time. **`alg` is the key-wrap algorithm** — how the random per-message content-encryption key (CEK) gets delivered to the receiver. With `RSA-OAEP-256` the CEK is encrypted to the receiver's RSA public key; with `ECDH-ES` it is derived from a one-shot ECDH exchange. **`enc` is the content-encryption algorithm** — how the actual payload is encrypted using the CEK, e.g. `A256GCM` (AES-256 in GCM mode). You always pick one of each: `alg` says "how do we agree on the symmetric key", `enc` says "what symmetric cipher do we use with it".
:::

::: details `use=sig` vs `use=enc` — what's that?
A JWK can advertise its purpose via the `use` member: `sig` for signing / verifying (JWS), `enc` for encrypting / decrypting (JWE). RFC 7517 §4.2 forbids reusing the same key material across roles — a key material's algorithm parameters and threat model differ between signing and encrypting. The OP enforces this structurally: a kid that appears in both `WithKeyset` (signing) and `WithEncryptionKeyset` (encryption) fails at `op.New`.
:::

## When you want JWE

- **Confidentiality on the wire** when TLS termination boundaries don't align with the entities you trust (e.g. an enterprise gateway that opens TLS but should not see id_token contents).
- **End-to-end encryption** in regulated settings where claim contents (PII, financial data) must be visible only to the RP, even if intermediaries see the response.
- **Compliance frameworks** (FAPI Open Banking profiles in some regions) that require encrypted JARM or encrypted id_tokens.

If TLS hop-by-hop is good enough and your RPs already verify signatures, JWE adds operational complexity (key distribution, rotation, alg negotiation) without proportional benefit. Don't ship it speculatively.

## The closed allow-list

v0.9.1 advertises and accepts:

| Family | Values |
|---|---|
| Key wrap (`alg`) | `RSA-OAEP-256`, `ECDH-ES`, `ECDH-ES+A128KW`, `ECDH-ES+A256KW` |
| Content encryption (`enc`) | `A128GCM`, `A256GCM` |

::: details ECDH-ES — what's that?
Elliptic Curve Diffie-Hellman Ephemeral Static. The sender generates a one-shot EC keypair, runs ECDH against the receiver's static public key, derives the CEK from the shared secret, and ships the ephemeral public key in the JWE header. The receiver re-runs ECDH with their private key + the ephemeral public key and arrives at the same CEK. There is no separate key-wrapped CEK on the wire — the variants `+A128KW` / `+A256KW` re-introduce wrapping for cases where you need to encrypt the same payload to multiple receivers.
:::

::: details A256GCM — what's that?
AES-256 in Galois/Counter Mode. The 256-bit key is the CEK that the `alg` half delivered; GCM adds an authentication tag so the receiver can detect tampering. `A128GCM` is the same construction with a 128-bit key. The OP uses GCM exclusively — CBC modes are deferred because GCM gives you confidentiality and integrity in one pass without padding-oracle classes of bug.
:::

What is **deferred to v2+**:

- `RSA-OAEP-384`, `RSA-OAEP-512` — go-jose v4.1.x exposes no constants.
- `dir` — symmetric direct-encryption mode; reserved.
- `A*KW` (symmetric-only key wrap) — reserved.

What is **permanently rejected**:

- `RSA1_5` — CVE-2017-11424 padding oracle. Never shipped.

`op.WithSupportedEncryptionAlgs(algs, encs)` can **narrow** the advertised set further (e.g. ECDH-ES + A256GCM only) but cannot extend it. Out-of-allow-list values yield a configuration error at `op.New`.

## Wiring the encryption keyset

```go
import "github.com/libraz/go-oidc-provider/op"

// Generate (or load from KMS) one or more encryption keys.
// At least one private key is required; multiple keys overlap during rotation.
provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(store),
  op.WithKeyset(myKeyset),                // signing keys (use=sig)
  op.WithCookieKeys(myCookieKey),

  op.WithEncryptionKeyset(op.EncryptionKeyset{
    {KeyID: "enc-2026-05", PrivateKey: rsaKey1},  // current
    {KeyID: "enc-2025-11", PrivateKey: rsaKey2},  // retiring
  }),

  // Optional: narrow the advertised algs.
  op.WithSupportedEncryptionAlgs(
    []string{"RSA-OAEP-256"},
    []string{"A256GCM"},
  ),
)
```

::: warning RFC 7517 §4.2 forbids key reuse
A key registered in `WithKeyset` (signing, `use=sig`) MUST NOT also appear in `WithEncryptionKeyset` (`use=enc`). The OP enforces this structurally — `op.New` fails when the two slices share a `kid`. Generate distinct key material for each role.
:::

### EncryptionKey shape

| Field | Notes |
|---|---|
| `KeyID` | The `kid` advertised on JWKS and inspected on inbound JWE. Unique within the keyset. |
| `PrivateKey` | `*rsa.PrivateKey` (≥ 2048 bit) or `*ecdsa.PrivateKey` (P-256 / P-384 / P-521). Other shapes rejected at `op.New`. |
| `Algorithm` | Optional explicit `alg` (e.g. `ECDH-ES+A256KW`). When empty: RSA → `RSA-OAEP-256`, ECDSA → `ECDH-ES`. |
| `NotAfter` | Optional retirement deadline. The OP refuses to decrypt JWE addressed to this kid on or after the deadline; public half stays in JWKS for cache warmth. |

The first keyset entry is the **active key for outbound encryption**. Subsequent entries stay in JWKS so RPs whose caches hold the old kid can still address it during a rotation overlap. Inbound decryption matches `kid` first; absent kid falls back to trial decryption against every key in slice order (RFC 7516 §4.1.6).

::: details Rotation overlap — what's that?
RPs cache JWKS responses (commonly for a few hours). If you swap the encryption key in one shot, RPs whose caches still hold the old `kid` will encrypt to a key the OP no longer accepts, and you get a window of failed authorizations. The fix is to publish both keys for at least one cache lifetime: the new key is "active for outbound" so the OP encrypts with it, both private halves are accepted for inbound decryption, and once the cache window has elapsed you remove the old one. See [Key rotation](/operations/key-rotation) for the same idea applied to signing keys.
:::

## Per-client metadata gates outbound encryption

The OP encrypts an outbound response **only when** the client's metadata names an encryption alg/enc pair for that response type. The five families:

| Response | Client metadata fields |
|---|---|
| id_token | `id_token_encrypted_response_alg`, `id_token_encrypted_response_enc` |
| userinfo (JWT) | `userinfo_encrypted_response_alg`, `userinfo_encrypted_response_enc` |
| request_object (inbound, JAR / PAR) | `request_object_encryption_alg_values_supported` (server-side) |
| authorization (JARM) | `authorization_encrypted_response_alg`, `authorization_encrypted_response_enc` |
| introspection (RFC 9701) | `introspection_encrypted_response_alg`, `introspection_encrypted_response_enc` |

::: details JARM — what's that?
JWT Secured Authorization Response Mode (OpenID Foundation FAPI WG). Instead of returning `code` and `state` as raw query parameters on the redirect, the OP returns a single `response` parameter whose value is a signed (and optionally encrypted) JWT. This stops a man-in-the-browser from rewriting `code` mid-redirect, and keeps the response off the URL bar in plaintext. JARM is opt-in per client via `authorization_signed_response_alg` / `_encrypted_response_alg` / `_enc`.
:::

::: details JWT introspection — what's that?
RFC 9701 ("OAuth 2.0 JWT Response for Introspection"). The classic `/introspect` endpoint (RFC 7662) returns a plain JSON document; RFC 9701 lets the resource server ask for a signed (and optionally encrypted) JWT instead. Useful when the RS wants a non-repudiable record of "the AS told me this token belonged to alice at this time", or when the introspection response itself crosses a trust boundary.
:::

The DCR mount validates these via `internal/jose.ParseJWEAlg` / `ParseJWEEnc` — the same allow-list source the runtime uses, so future allow-list edits propagate automatically.

::: warning Half-pair registrations are rejected
DCR rejects asymmetric submissions like `id_token_encrypted_response_alg=RSA-OAEP-256` without `id_token_encrypted_response_enc` with `invalid_client_metadata` at registration. Both empty is admit (the client opts out of encryption for that response type); both populated is admit; only one populated is reject. This stops the failure mode where registration succeeds but the first encrypted response fails at runtime.
:::

The client also publishes a `jwks` (or `jwks_uri`) with `use=enc` keys; the OP fetches and resolves the right key per RP-side rotation.

## Discovery exposure

When `op.WithEncryptionKeyset` is set, discovery publishes:

- `jwks_uri` carries `use=enc` JWKs alongside existing `use=sig` material (RFC 7517 §4.2).
- `id_token_encryption_alg_values_supported` / `_enc_values_supported` — present.
- `userinfo_encryption_alg_values_supported` / `_enc_values_supported` — present (gated on `feature.Userinfo`, always on).
- `request_object_encryption_alg_values_supported` / `_enc_values_supported` — present when `feature.JAR` is on.
- `authorization_encryption_alg_values_supported` / `_enc_values_supported` — present when `feature.JARM` is on.
- `introspection_encryption_alg_values_supported` / `_enc_values_supported` — present when `feature.Introspect` is on.

Without the option, every encryption-related discovery key is empty (or absent) and decryption attempts fail with `invalid_request_object`.

## userinfo signing — always on

Independent of the encryption keyset, `userinfo_signing_alg_values_supported` now publishes `["ES256"]` unconditionally. The JWT-shape userinfo path is always available via `Accept: application/jwt`. RPs that want signed userinfo do not need to register encryption metadata.

## See it run

[`examples/34-encrypted-id-token`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-encrypted-id-token):

```sh
go run -tags example ./examples/34-encrypted-id-token
```

A paired OP+RP demo of RSA-OAEP-256 / A256GCM id_token encryption: the OP publishes its `use=enc` JWKS, the RP registers with `id_token_encrypted_response_alg=RSA-OAEP-256` + `_enc=A256GCM`, the OP wraps the id_token in JWE, and the RP-side decrypt pulls the inner JWS for verification. Files: `op.go` (OP wiring with `WithEncryptionKeyset`), `rp.go` (RP-side decrypt + signature verify), `jose.go` (key generation + JWKS marshalling).

## Read next

- [RFC compliance matrix § RFC 7516 JWE](/compliance/rfc-matrix#jose-family).
- [Key rotation](/operations/key-rotation) — overlap two encryption keys during a window so RPs cache-stale don't fail.
