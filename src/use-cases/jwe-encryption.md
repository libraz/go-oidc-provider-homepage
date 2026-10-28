---
title: JWE encryption — id_token, userinfo, JARM, introspection
description: Wire JWE — register an encryption keyset, accept JWE request_objects, encrypt outbound responses to the client's use=enc JWK.
pageClass: pg-use-cases-jwe-encryption
---

# Use case — JWE encryption (RFC 7516)

The OP can:

- **Decrypt** JWE-shaped request objects (JAR / PAR §6.1) addressed to the OP's `use=enc` keyset.
- **Encrypt** outbound `id_token`, JWT-shape `userinfo`, JARM authorization responses, and RFC 9701 JWT introspection responses to the client's registered `use=enc` JWK.

Both directions use a closed algorithm allow-list.

<figure class="fig">
  <div class="fig-head">The JWE encloses the JWS</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-jwe-title" viewBox="0 0 960 240" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-jwe-title">The OP signs the claims into a JWS, then encrypts that JWS inside a JWE addressed to the relying party's encryption key. The RP decrypts the outer layer first and only then verifies the signature inside it.</title>
    <!-- OP -->
    <rect class="fg-box" x="32" y="68" width="240" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="96">OP</text>
    <text class="fg-s" x="48" y="120">assembles the claims</text>
    <text class="fg-s" x="48" y="144">and signs them</text>
    <path class="fg-edge fg-edge--accent" d="M272,116 H312" marker-end="url(#fg-ac)"/>
    <!-- outer JWE -->
    <rect class="fg-box fg-box--accent" x="312" y="24" width="336" height="184" rx="8"/>
    <text class="fg-lbl fg-accent" x="336" y="52">outer · JWE</text>
    <text class="fg-s" x="336" y="76">encrypted to the RP's use=enc JWK</text>
    <!-- inner JWS -->
    <rect class="fg-box fg-box--sub" x="336" y="96" width="288" height="96" rx="8"/>
    <text class="fg-lbl" x="352" y="124">inner · JWS</text>
    <text class="fg-s" x="352" y="148">the signed claims, unchanged</text>
    <text class="fg-s" x="352" y="172">unreadable until decrypted</text>
    <path class="fg-edge fg-edge--accent" d="M648,116 H688" marker-end="url(#fg-ac)"/>
    <!-- RP -->
    <rect class="fg-box" x="688" y="68" width="240" height="96" rx="8"/>
    <text class="fg-t2" x="704" y="96">RP</text>
    <text class="fg-s" x="704" y="120">decrypts the JWE,</text>
    <text class="fg-s" x="704" y="144">then verifies the JWS</text>
  </svg>
  <figcaption class="fig-note">The order matters in both directions. Signing first means the signature covers the claims and not the ciphertext; decrypting first means the RP never verifies a signature over something it could not read. Signing proves who issued the token, encrypting decides who can read it, and this setup needs both.</figcaption>
</figure>

::: details JWS vs JWE — what's the difference?
**JWS** (RFC 7515 — JSON Web Signature) is the JOSE format you already know: a header + payload + signature. Anyone with the key can read the payload; the signature only proves it wasn't tampered with. **JWE** (RFC 7516 — JSON Web Encryption) wraps the payload in a ciphertext so that only the holder of the matching private key can read it. id_tokens are signed (JWS) by default; encrypting them on top means the payload becomes opaque to anything that's not the intended RP — useful when something other than the RP terminates TLS.
:::

::: details `alg` vs `enc` — what's the difference?
JWE uses two algorithm slots, and the split confuses everyone the first time. **`alg` is the key-wrap algorithm** — how the random per-message content-encryption key (CEK) gets delivered to the receiver. With `RSA-OAEP-256` the CEK is encrypted to the receiver's RSA public key; with `ECDH-ES` it is derived from a one-shot ECDH exchange. **`enc` is the content-encryption algorithm** — how the actual payload is encrypted using the CEK, e.g. `A256GCM` (AES-256 in GCM mode). You always pick one of each: `alg` says "how do we agree on the symmetric key", `enc` says "what symmetric cipher do we use with it".
:::

::: details `use=sig` vs `use=enc` — what's that?
A JWK can advertise its purpose via the `use` member: `sig` for signing / verifying (JWS), `enc` for encrypting / decrypting (JWE). RFC 7517 (JSON Web Key) §4.2 forbids reusing the same key material across roles — a key material's algorithm parameters and threat model differ between signing and encrypting. The OP enforces this structurally: a kid that appears in both `WithKeyset` (signing) and `WithEncryptionKeyset` (encryption) fails at `op.New`.
:::

## When you want JWE

- **Confidentiality on the wire** when TLS termination boundaries don't align with the entities you trust (e.g. an enterprise gateway that opens TLS but should not see id_token contents).
- **End-to-end encryption** in regulated settings where claim contents (PII, financial data) must be visible only to the RP, even if intermediaries see the response.
- **Compliance frameworks** (FAPI Open Banking profiles in some regions) that require encrypted JARM or encrypted id_tokens.

If TLS hop-by-hop is good enough and your RPs already verify signatures, JWE adds operational complexity (key distribution, rotation, alg negotiation) without proportional benefit. Don't ship it speculatively.

## The closed allow-list

The OP advertises and accepts:

| Family | Values |
|---|---|
| Key wrap (`alg`) | `RSA-OAEP-256`, `ECDH-ES`, `ECDH-ES+A128KW`, `ECDH-ES+A256KW` |
| Content encryption (`enc`) | `A128GCM`, `A256GCM` |

::: details ECDH-ES — what's that?
Elliptic Curve Diffie-Hellman Ephemeral Static. The sender generates a one-shot EC keypair, runs ECDH against the receiver's static public key, derives the CEK from the shared secret, and ships the ephemeral public key in the JWE header. The receiver re-runs ECDH with their private key + the ephemeral public key and arrives at the same CEK. There is no separate key-wrapped CEK on the wire — the variants `+A128KW` / `+A256KW` re-introduce wrapping for cases where you need to encrypt the same payload to multiple receivers.
:::

::: details A256GCM — what's that?
AES-256 in Galois/Counter Mode. The 256-bit key is the CEK that the `alg` half delivered; GCM adds an authentication tag so the receiver can detect tampering. `A128GCM` is the same construction with a 128-bit key. The OP uses GCM exclusively; CBC modes are outside the supported allow-list because GCM gives you confidentiality and integrity in one pass without padding-oracle classes of bug.
:::

These algorithms are outside the supported allow-list:

- `RSA-OAEP-384`, `RSA-OAEP-512`
- `dir` — symmetric direct-encryption mode
- `A*KW` — symmetric-only key wrap

What is **permanently rejected**:

- `RSA1_5` — CVE-2017-11424 padding oracle. Never shipped.

`op.WithSupportedEncryptionAlgs(algs, encs)` can **narrow** the set further (e.g. ECDH-ES + A256GCM only) but cannot extend it. The narrowing is enforced, not just advertised: an inbound request object naming an excluded `alg` or `enc` is rejected before any key is touched, a client registered (by DCR or static seed) for an excluded pair is refused, and no outbound response is encrypted with one. Out-of-allow-list values yield a configuration error at `op.New`, and each half (`algs`, `encs`) may be narrowed by only one call.

## Wiring the encryption keyset

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

// Generate (or load from KMS) one or more OP-side private keys for
// inbound JWE request objects.
// At least one private key is required; multiple keys overlap during rotation.
st := inmem.New()
loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),                // signing keys (use=sig)
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithGrants(grant.AuthorizationCode, grant.RefreshToken),

  op.WithEncryptionKeyset(op.EncryptionKeyset{
    {KeyID: "enc-2026-05", PrivateKey: rsaKey1},  // newest inbound key
    {KeyID: "enc-2025-11", PrivateKey: rsaKey2},  // retiring; inbound overlap
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
| `NotAfter` | Optional retirement deadline, enforced as a hard cutoff. On or after it the OP refuses to decrypt JWE addressed to this kid **and drops the public half from JWKS**, so an RP is never pointed at a recipient key the OP will no longer accept. |

`EncryptionKeyset` is **inbound-only**. No entry is an active outbound encryption key: outbound JWE responses are encrypted to a `use=enc` key selected from the client's JWKS. The entries are ordered decryption candidates and are published as `use=enc` keys. With a `kid`, the OP selects the matching live entry. Without a `kid`, it filters live entries to the key family required by the protected `alg` and tries them in slice order (RFC 7516 §4.1.6). If the filtered set exceeds `op.MaxKidlessEncryptionTrialKeys` (default: 4), the OP refuses decryption rather than truncating the set; `op.New` emits a construction warning for an oversized family. Require RPs to include `kid` when a family is larger than that limit.

::: details Rotation overlap — what's that?
RPs cache the OP's JWKS responses (commonly for a few hours). If you swap the inbound encryption key in one shot, RPs whose caches still hold the old `kid` will encrypt request objects to a key the OP no longer accepts, and you get a window of failed authorizations. The fix is to publish both keys for at least one cache lifetime: put the new key first so it is tried first for kidless inbound JWE, retain both private halves for inbound decryption, and once the cache window and accepted request lifetime have elapsed remove the old one. The new key is not an outbound key; response encryption always targets the client's key. See [Key rotation](/operations/key-rotation) for the provider replacement procedure.
:::

## Per-client metadata gates outbound encryption

The OP encrypts an outbound response **only when** the client's metadata names an encryption alg/enc pair for that response type. The five families:

| Response | Client metadata fields |
|---|---|
| id_token | `id_token_encrypted_response_alg`, `id_token_encrypted_response_enc` |
| userinfo (JWT) | `userinfo_encrypted_response_alg`, `userinfo_encrypted_response_enc` |
| request_object (inbound, JAR / PAR) | none: the OP advertises `request_object_encryption_alg_values_supported` and decrypts what the client sends |
| authorization (JARM) | `authorization_encrypted_response_alg`, `authorization_encrypted_response_enc` |
| introspection (RFC 9701) | `introspection_encrypted_response_alg`, `introspection_encrypted_response_enc` |

::: details JARM — what's that?
JWT Secured Authorization Response Mode (OpenID Foundation FAPI WG). Instead of returning `code` and `state` as raw query parameters on the redirect, the OP returns a single `response` parameter whose value is a signed (and optionally encrypted) JWT. This stops a man-in-the-browser from rewriting `code` mid-redirect, and keeps the response off the URL bar in plaintext. JARM is opt-in per client via `authorization_signed_response_alg` / `_encrypted_response_alg` / `_enc`.
:::

::: details JWT introspection — what's that?
RFC 9701 ("OAuth 2.0 JWT Response for Introspection"). The classic `/introspect` endpoint (RFC 7662) returns a plain JSON document; RFC 9701 lets the resource server ask for a signed (and optionally encrypted) JWT instead. Useful when the RS wants a non-repudiable record of "the AS told me this token belonged to alice at this time", or when the introspection response itself crosses a trust boundary.
:::

Registration checks these values against the same allow-list the runtime uses, so what `/register` admits is what the OP can later encrypt with.

::: warning Half-pair registrations are rejected
DCR rejects asymmetric submissions like `id_token_encrypted_response_alg=RSA-OAEP-256` without `id_token_encrypted_response_enc` with `invalid_client_metadata` at registration. Both empty is admit (the client opts out of encryption for that response type); both populated is admit; only one populated is reject. This stops the failure mode where registration succeeds but the first encrypted response fails at runtime.
:::

The client also publishes a `jwks` (or `jwks_uri`) with `use=enc` keys; the OP fetches and resolves the right key per RP-side rotation. A client record must carry exactly one of the two: one with both is refused when the OP goes to encrypt.

## Discovery exposure

Discovery reflects the effective JWE policy after `op.WithSupportedEncryptionAlgs` narrowing:

- `jwks_uri` carries the configured usable `use=enc` JWKs alongside existing `use=sig` material (RFC 7517 §4.2), with their published `alg` values reflecting the same narrowing.
- Outbound response fields — `id_token_encryption_*` and `userinfo_encryption_*`, plus `authorization_encryption_*` (JARM) and `introspection_encryption_*` when those features are enabled — advertise the effective alg/enc lists. They describe encryption to a client's key and do not require `op.WithEncryptionKeyset`.
- `request_object_encryption_alg_values_supported` / `_enc_values_supported` — present only when JAR and `op.WithEncryptionKeyset` are both enabled. The `alg` list is further narrowed to key families the OP can actually decrypt; the `enc` list follows the configured narrowing.

Without `op.WithEncryptionKeyset`, request-object encryption fields are absent and inbound encrypted request objects fail with `invalid_request_object`; outbound response encryption can still be advertised and used when its feature and client metadata are configured. An explicitly empty supported-alg or enc list suppresses JWE negotiation.

## userinfo signing — always on

Independent of the encryption keyset, `userinfo_signing_alg_values_supported` publishes `["ES256"]` unconditionally. The JWT-shape userinfo path is always available via `Accept: application/jwt`. RPs that want signed userinfo do not need to register encryption metadata.

## See it run

[`examples/35-encrypted-id-token`](https://github.com/libraz/go-oidc-provider/tree/main/examples/35-encrypted-id-token):

```sh
(cd examples/35-encrypted-id-token && GOWORK=off go run -tags example .)
```

A paired OP+RP demo of RSA-OAEP-256 / A256GCM id_token encryption: the OP publishes its `use=enc` JWKS, the RP registers with `id_token_encrypted_response_alg=RSA-OAEP-256` + `_enc=A256GCM`, the OP wraps the id_token in JWE, and the RP-side decrypt pulls the inner JWS for verification. Files: `op.go` (OP wiring with `WithEncryptionKeyset`), `rp.go` (RP-side decrypt + signature verify), `jose.go` (key generation + JWKS marshalling).

## Read next

- [RFC compliance matrix § RFC 7516 JWE](/compliance/rfc-matrix#jose-family).
- [Key rotation](/operations/key-rotation) — overlap two encryption keys during a window so RPs cache-stale don't fail.
