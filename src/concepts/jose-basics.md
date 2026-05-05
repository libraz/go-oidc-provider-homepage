---
title: "JOSE basics: JWS, JWE, JWK, JWKS, kid"
description: A minimal JOSE primer for OIDC readers — what each acronym means, where it appears in OIDC, and why this library closes the algorithm allow-list.
---

# JOSE basics: JWS, JWE, JWK, JWKS, kid

**JOSE** (JavaScript Object Signing and Encryption) is the umbrella term for a family of IETF specs that define how to sign, encrypt, and represent keys for JSON-shaped tokens. Any OIDC implementation deals with all four pieces — JWS, JWE, JWK, JWKS — usually under the surface, occasionally directly. This page is the minimum a reader needs to understand `id_token`, `jwks_uri`, the JAR `request=` parameter, and `kid`.

::: details Specs referenced on this page
- [RFC 7515](https://datatracker.ietf.org/doc/html/rfc7515) — JSON Web Signature (JWS)
- [RFC 7516](https://datatracker.ietf.org/doc/html/rfc7516) — JSON Web Encryption (JWE)
- [RFC 7517](https://datatracker.ietf.org/doc/html/rfc7517) — JSON Web Key (JWK)
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JSON Web Algorithms (JWA)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token (JWT)
- [RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638) — JWK Thumbprint
- [RFC 8037](https://datatracker.ietf.org/doc/html/rfc8037) — EdDSA in JOSE
- [RFC 8725](https://datatracker.ietf.org/doc/html/rfc8725) — JWT Best Current Practices
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR (signed authorization request)
:::

::: tip Mental model
- **JWS** signs. **JWE** encrypts. **JWK** is a key. **JWKS** is a key set. **kid** picks which key.
- Every JWT you'll see in OIDC is a JWS — `header.payload.signature`.
- JWE is the outer envelope when an ID Token / userinfo / authorize response is encrypted on top of being signed.
- JWKS at `/jwks` lets RPs verify ID Tokens offline; the OP rotates keys by adding the new key ahead of time.
:::

## JWS — JSON Web Signature

A **JWS** is the signing scheme JWTs use. The compact serialisation is three base64url segments joined by dots:

```
<base64url(header)>.<base64url(payload)>.<base64url(signature)>
```

The header is a JSON object naming the signing algorithm and the key:

```json
{ "alg": "ES256", "kid": "2026-q1" }
```

The payload is the token's claims (a JSON object). The signature covers `header + "." + payload`, computed with the algorithm named in `alg` and the key named by `kid`.

In OIDC, JWS is used for:

| Artefact | Spec | Signed by |
|---|---|---|
| `id_token` | OIDC Core 1.0 §2 | The OP's signing key. |
| Access token (default JWT path) | RFC 9068 | The OP's signing key. |
| `request` / `request_uri` (JAR) | RFC 9101 | The RP's key, advertised via the client's `jwks_uri`. |
| `client_assertion` (`private_key_jwt`) | RFC 7523 | The RP's key. |
| Authorize response (JARM) | OpenID FAPI JARM | The OP's signing key. |
| `logout_token` (Back-Channel Logout) | OIDC BCL 1.0 | The OP's signing key. |

The receiver verifies by re-running the algorithm against the public key in the relevant JWKS. If the signature checks out and the claims (`iss`, `aud`, `exp`) match expectations, the token is accepted.

## JWE — JSON Web Encryption

A **JWE** is the encrypted variant. The compact serialisation has five segments:

```
<base64url(header)>.<base64url(encrypted_key)>.<base64url(iv)>.<base64url(ciphertext)>.<base64url(tag)>
```

The header carries two algorithm names:

| Field | Meaning |
|---|---|
| `alg` | **Key-management algorithm.** How the per-message content key is delivered to the recipient: `RSA-OAEP-256` (RSA key transport), `ECDH-ES` (direct ECDH), `ECDH-ES+A128KW` / `ECDH-ES+A256KW` (ECDH with AES key wrap). |
| `enc` | **Content-encryption algorithm.** How the payload is encrypted: `A128GCM`, `A256GCM`. |

In OIDC, JWE is used as an **outer envelope** when the embedder or the client wants confidentiality on top of signature: `id_token` encrypted with the RP's public key, an encrypted userinfo response, an encrypted introspection response, an encrypted authorize response (JARM-with-encryption). The inner artefact is still a JWS — the JWE just wraps it.

See [JWE encryption use case](/use-cases/jwe-encryption) for the complete wiring (`op.WithEncryptionKeyset`, `op.WithSupportedEncryptionAlgs`).

## JWK — JSON Web Key

A **JWK** is the canonical JSON representation of a single cryptographic key:

```json
{
  "kty": "EC",
  "crv": "P-256",
  "kid": "2026-q1",
  "use": "sig",
  "alg": "ES256",
  "x": "...",
  "y": "..."
}
```

| Field | Meaning |
|---|---|
| `kty` | Key type: `RSA`, `EC` (elliptic curve), `OKP` (Edwards curves: Ed25519, Ed448). |
| `kid` | Key id — the label used to pick this key out of a JWKS. |
| `use` | `sig` (signing) or `enc` (encryption). |
| `alg` | The algorithm this key is used with — pinned so that callers can't substitute a weaker one. |

A JWK contains only public material when published; the matching private material stays on the OP.

## JWKS — JWK Set

A **JWKS** is just a JSON array of JWKs:

```json
{
  "keys": [
    { "kty": "EC", "kid": "2026-q1", ... },
    { "kty": "EC", "kid": "2025-q4", ... }
  ]
}
```

The OP publishes its public signing keys at `jwks_uri` (advertised in the discovery document). RPs fetch the JWKS once, cache it, and use it to verify ID Token signatures offline. During key rotation the OP keeps the previous key in the set for a window long enough that RP caches converge — see [Operations: key rotation](/operations/key-rotation).

::: details `jwks_uri` vs the `jwk` JWS header — what's the difference?
- **`jwks_uri`** (discovery field) is the URL the OP serves its JWKS at. Stable, cacheable, the RP fetches it on its own schedule.
- **`jwk` JWS header** is an inline JWK *carried inside* a token's header. RFC 7515 allows it but RFC 8725 §3.5 warns that trusting a token's self-declared key is one of the canonical alg-confusion footguns: anyone can mint a JWS, attach their own `jwk` to the header, and ask the verifier to use it. **This library never trusts the inline `jwk` header on incoming tokens** — keys come from the OP's own JWKS for outgoing artefacts and from the configured client `jwks_uri` for client-presented JWS.
:::

## kid — picking the right key

`kid` is the key id. When a JWS arrives, the verifier:

1. Reads `kid` from the JWS header.
2. Finds the JWK with matching `kid` in the relevant JWKS.
3. Uses the algorithm named in `alg` to verify the signature against that key.

Without `kid`, the verifier would have to try every key in the set — which is both slow and a foot-cannon (it lets attackers pick which key to confuse you with). The library always emits `kid` on every JWS it produces and rejects incoming tokens whose `kid` does not appear in the relevant JWKS.

For incoming tokens whose `kid` does not match the active set but does match a recently retired key, the library emits `op.AuditKeyRetiredKidPresented` so dashboards can spot RPs that haven't picked up a key rotation. See [Operations: key rotation](/operations/key-rotation).

## Why this library closes the alg allow-list

Two classes of attack live in the JOSE algorithm registry, and the canonical defence is to refuse to ever name those algorithms in a type that the verifier reaches.

### Refused algorithms for signing

- **`alg=none`** (RFC 7518 §3.6) — a "signature" that's the empty string. RFC 8725 §3.1 says implementations MUST NOT trust JWTs based on `none`. The library does not include `none` in its algorithm enum at all.
- **`HS256` / `HS384` / `HS512`** (HMAC family) — symmetric MACs. The alg-confusion attack class (RFC 8725 §3.2) is a verifier that accepts both asymmetric and symmetric algorithms: an attacker mints a JWS with `alg=HS256` and uses the OP's *public* key as the HMAC secret, and a sloppy verifier validates it. The library does not include any HMAC algorithm in its enum.

### Permitted algorithms

| Use | Algorithms |
|---|---|
| Issuance (signing outgoing JWS) | `ES256` (default), `PS256`, `EdDSA`. |
| Verification (incoming JWS) | `RS256`, `PS256`, `ES256`, `EdDSA`. `RS256` accepted on verify because OIDC Core 1.0 §10.1 makes it MUST-implement for ID Token verification. |

These four are the closed enum in `internal/jose.Algorithm`. There is no zero-value default for the type, and no fallback to a wider registry. A `depguard` lint rule forbids importing the underlying JOSE package outside `internal/jose/`, so no future code path can re-introduce `none` or `HS*` by accident. See [design judgment #11](/security/design-judgments#dj-11) for the full reasoning.

## JWE allow-list

The JWE permitted set in `internal/jose/jweparam.go` is similarly closed.

| Field | Permitted | Refused |
|---|---|---|
| `alg` (key management) | `RSA-OAEP-256`, `ECDH-ES`, `ECDH-ES+A128KW`, `ECDH-ES+A256KW` | `RSA1_5` (Bleichenbacher class), `dir` (no key wrap), `A*KW` / `A*GCMKW` (symmetric — same key-distribution problem as HMAC). |
| `enc` (content encryption) | `A128GCM`, `A256GCM` | `A*CBC-HS*` (AES-CBC with HMAC — historic CBC-with-MAC pitfalls, plus a wider attack surface than GCM). |

The narrowing is deliberate: every refused algorithm has a documented attack class that the OAuth / OIDC ecosystem has either retired (RSA1_5) or never adopted by profile (CBC-with-MAC for OAuth bearers). The embedder may further narrow the advertised set per deployment with `op.WithSupportedEncryptionAlgs(algs, encs []string)`, but cannot widen it past the library's allow-list.

## Read next

- [ID Token, access token, userinfo](/concepts/tokens) — what each artefact contains and how the JWS verification path differs.
- [Operations: key rotation](/operations/key-rotation) — the JWKS lifecycle, kid retirement, and RP cache convergence.
- [Use case: JWE encryption](/use-cases/jwe-encryption) — wiring the encryption keyset and narrowing the alg / enc list.
