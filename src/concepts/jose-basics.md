---
title: "JOSE basics: JWS, JWE, JWK, JWKS, kid"
description: A minimal JOSE primer for OIDC readers — what each acronym means, where it appears in OIDC, and why this library closes the algorithm allow-list.
pageClass: pg-concepts-jose-basics
---

# JOSE basics: JWS, JWE, JWK, JWKS, kid

**JOSE** (JavaScript Object Signing and Encryption) is the umbrella term for the IETF specs that define how to sign JSON tokens, encrypt them, and represent keys. Every OIDC implementation uses all four pieces (JWS, JWE, JWK, JWKS), mostly out of sight and occasionally in the open. This page covers the minimum needed to read `id_token`, `jwks_uri`, the JAR `request=` parameter, and `kid`.

<figure class="fig">
  <div class="fig-head">How the JOSE pieces fit together</div>
  <svg class="fig-svg" role="img" aria-labelledby="jose-map-title" viewBox="0 0 960 512" xmlns="http://www.w3.org/2000/svg">
    <title id="jose-map-title">JWS signs a JWT, JWE wraps a signed JWT in an encrypted shell, and the recipient unwraps then verifies. Separately, the kid in a JWS header selects one JWK out of the JWKS the OP publishes at its jwks endpoint.</title>
    <!-- band: producing a token -->
    <rect class="fg-group" x="32" y="24" width="896" height="168" rx="8"/>
    <text class="fg-lbl" x="56" y="52">producing a token</text>
    <!-- jws -->
    <rect class="fg-box" x="56" y="72" width="256" height="96" rx="8"/>
    <text class="fg-t" x="72" y="100">JWS</text>
    <text class="fg-s" x="72" y="124">signs a JWT; readable</text>
    <text class="fg-mxs" x="72" y="148">header.payload.signature</text>
    <!-- jwe -->
    <rect class="fg-box" x="352" y="72" width="256" height="96" rx="8"/>
    <text class="fg-t" x="368" y="100">JWE</text>
    <text class="fg-s" x="368" y="124">wraps a signed JWT</text>
    <text class="fg-s" x="368" y="148">an encrypted outer shell</text>
    <!-- rcp -->
    <rect class="fg-box" x="648" y="72" width="256" height="96" rx="8"/>
    <text class="fg-t" x="664" y="100">Recipient</text>
    <text class="fg-s" x="664" y="124">decrypts the shell first</text>
    <text class="fg-s" x="664" y="148">then checks the signature</text>
    <path class="fg-edge" d="M312,120 H352" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M608,120 H648" marker-end="url(#fg-a)"/>
    <!-- band: finding the right key -->
    <rect class="fg-group" x="32" y="216" width="896" height="272" rx="8"/>
    <text class="fg-lbl" x="56" y="244">finding the right key</text>
    <!-- JWS header -->
    <rect class="fg-box fg-box--accent" x="56" y="284" width="232" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="72" y="312">JWS header</text>
    <text class="fg-mxs" x="72" y="336">"alg": "ES256"</text>
    <text class="fg-mxs" x="72" y="360">"kid": "2024-05"</text>
    <path class="fg-edge fg-edge--accent" d="M288,332 H408" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="348" y="322" text-anchor="middle">selects</text>
    <!-- JWKS -->
    <rect class="fg-box" x="408" y="264" width="496" height="200" rx="8"/>
    <text class="fg-t2" x="424" y="292">JWKS</text>
    <text class="fg-s" x="496" y="292">a set of JWKs, published at /jwks</text>
    <rect class="fg-box fg-box--accent" x="424" y="312" width="464" height="40" rx="8"/>
    <text class="fg-mxs" x="440" y="337">JWK · kid 2024-05</text>
    <text class="fg-s" x="632" y="337">current signing key</text>
    <rect class="fg-box fg-box--muted" x="424" y="360" width="464" height="40" rx="8"/>
    <text class="fg-mxs" x="440" y="385">JWK · kid 2023-11</text>
    <text class="fg-s" x="632" y="385">retired, verifies old tokens</text>
    <rect class="fg-box fg-box--muted" x="424" y="408" width="464" height="40" rx="8"/>
    <text class="fg-mxs" x="440" y="433">JWK · kid 2024-09</text>
    <text class="fg-s" x="632" y="433">next key, published ahead</text>
  </svg>
  <figcaption class="fig-note">All three keys sit in the document at once, and that is the point: a verifier that fetched the set yesterday can still check a token signed today, and one signed last year, without a flag day.</figcaption>
</figure>

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
- JWE is the outer envelope when an ID Token, userinfo or authorize response is encrypted on top of being signed.
- The JWKS at `/jwks` lets RPs verify ID Tokens offline. The OP rotates keys by publishing the new key ahead of time.
:::

## JWS — JSON Web Signature

A **JWS** is the signing scheme JWTs use. Its compact serialisation is three base64url segments joined by dots:

```
<base64url(header)>.<base64url(payload)>.<base64url(signature)>
```

The header is a JSON object naming the signing algorithm and the key:

```json
{ "alg": "ES256", "kid": "2026-q1" }
```

The payload is the token's claims (a JSON object). The signature covers `header + "." + payload` and is computed with the algorithm named in `alg` and the key named by `kid`.

OIDC uses JWS for:

| Token | Spec | Signed by |
|---|---|---|
| `id_token` | OIDC Core 1.0 §2 | The OP's signing key. |
| Access token (default JWT format) | RFC 9068 | The OP's signing key. |
| `request` / `request_uri` (JAR) | RFC 9101 | The RP's key, from the client's registered JWKS (`jwks_uri` or inline `jwks`). |
| `client_assertion` (`private_key_jwt`) | RFC 7523 | The RP's key. |
| Authorize response (JARM) | OpenID FAPI JARM | The OP's signing key. |
| `logout_token` (Back-Channel Logout) | OIDC BCL 1.0 | The OP's signing key. |

The receiver verifies the signature with the public key from the relevant JWKS. If the signature is valid and the claims (`iss`, `aud`, `exp`) match what it expects, it accepts the token.

The OP also checks the `typ` header where a token's kind matters. An `id_token_hint` whose `typ` is anything other than absent or `JWT`, such as a logout token or an access token, is rejected at `/end_session` and for CIBA.

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

OIDC uses JWE as an **outer envelope** when the embedder or the client wants confidentiality on top of the signature: an `id_token` encrypted to the RP's public key, an encrypted userinfo response, an encrypted introspection response, an encrypted authorize response (JARM with encryption). The inner token is still a JWS, and the JWE just wraps it.

`op.WithEncryptionKeyset` covers the opposite direction. It holds the private keys that decrypt inbound encrypted request objects and publishes their public halves as `use=enc` keys. It is not an outbound keyset: outbound JWE responses are encrypted to a `use=enc` key from the client's JWKS. If an inbound JWE omits `kid`, the OP narrows its live keys to the family `alg` requires and tries at most `op.MaxKidlessEncryptionTrialKeys` (4) candidates. Send `kid` when a family has more keys than that.

See [JWE encryption use case](/use-cases/jwe-encryption) for the complete wiring (`op.WithEncryptionKeyset`, `op.WithSupportedEncryptionAlgs`).

## JWK — JSON Web Key

A **JWK** is the standard JSON representation of one cryptographic key:

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
| `alg` | The algorithm this key is used with. It is pinned so that callers cannot substitute a weaker one. |

A published JWK contains only public material; the private half stays on the OP.

## JWKS — JWK Set

A **JWKS** is a JSON object whose `keys` member is an array of JWKs:

```json
{
  "keys": [
    { "kty": "EC", "kid": "2026-q1", ... },
    { "kty": "EC", "kid": "2025-q4", ... }
  ]
}
```

The OP publishes its public signing keys at `jwks_uri`, which the [discovery document](/concepts/discovery) advertises. With `op.WithEncryptionKeyset` configured, the same endpoint also publishes the OP's public `use=enc` keys for inbound encrypted request objects. RPs fetch the JWKS, cache it, and use the keys to verify signatures or to encrypt request objects. During key rotation the OP keeps the previous keys in the set long enough for RP caches to catch up; see [Operations: key rotation](/operations/key-rotation).

A client's own keys work the same way, but a client record holds either an inline `jwks` or a `jwks_uri`, never both (RFC 7591 §2). The OP refuses a record with both everywhere it would use the keys: request-object verification, `private_key_jwt` and response encryption.

::: details `jwks_uri` vs the `jwk` JWS header — what's the difference?
- **`jwks_uri`** (discovery field) is the URL the OP serves its JWKS at. Stable, cacheable, the RP fetches it on its own schedule.
- **`jwk` JWS header** is a JWK embedded *in* a token's own header. RFC 7515 allows it, but RFC 8725 §3.5 warns that trusting a key the token names for itself is a classic mistake: anyone can mint a JWS, attach their own `jwk` to the header, and ask the verifier to use it. **This library never trusts the inline `jwk` header on incoming tokens.** It verifies tokens it issued with the OP's own keys, and client-presented JWS with the keys registered for that client.
:::

## kid — picking the right key

`kid` is the key id. When a JWS arrives, the verifier:

1. Reads `kid` from the JWS header.
2. Finds the JWK with matching `kid` in the relevant JWKS.
3. Uses the algorithm named in `alg` to verify the signature against that key.

Without `kid`, the verifier would have to try every key in the set, which is slow and lets an attacker choose which key to confuse. The library puts `kid` on every JWS it produces and rejects incoming tokens whose `kid` is not in the relevant JWKS.

When a token the OP signed itself carries the `kid` of a key whose retirement time has passed, the OP rejects it as if the `kid` were unknown and emits `op.AuditKeyRetiredKidPresented`, so dashboards can show which callers are still holding tokens from a rotated-out key. See [Operations: key rotation](/operations/key-rotation).

## Why this library closes the alg allow-list

The JOSE algorithm registry contains two algorithm families that enable well-known attacks. The standard defence is to keep them out of every type the verifier can reach.

### Refused algorithms for signing

- **`alg=none`** (RFC 7518 §3.6) — an unsecured JWT has no signature. RFC 8725 §3.1 requires verification to use an application-approved algorithm set; this library excludes `none` from that set entirely.
- **`HS256` / `HS384` / `HS512`** (HMAC family) are symmetric MACs. Alg confusion (RFC 8725 §3.2) targets a verifier that accepts both asymmetric and symmetric algorithms: the attacker mints a JWS with `alg=HS256` and uses the OP's *public* key as the HMAC secret, and a careless verifier accepts it. The library's algorithm enum contains no HMAC algorithm.

### Permitted algorithms

| Use | Algorithms |
|---|---|
| OP issuance (signing outgoing ID Tokens, JWT access tokens, JARM) | `ES256` only. `WithKeyset` rejects non-P-256 signing keys at `op.New`. |
| Verification (incoming JWS) | `RS256`, `PS256`, `ES256`, `EdDSA`. FAPI profiles narrow client-signed input to `PS256`, `ES256`, `EdDSA`. Accepting `RS256` inbound is an interoperability choice; it does not satisfy the separate OIDC Core requirement to support `RS256` when signing ID Tokens. |

These four are the closed enum in `internal/jose.Algorithm`. The type has no zero-value default and no fallback to a wider registry, and a `depguard` lint rule forbids importing the underlying JOSE package outside `internal/jose/`, so no new code path can reintroduce `none` or `HS*`. See [design judgment #11](/security/design-judgments#dj-11) for the full reasoning.

## JWE allow-list

The permitted JWE set in `internal/jose/jweparam.go` is closed in the same way.

| Field | Permitted | Refused |
|---|---|---|
| `alg` (key management) | `RSA-OAEP-256`, `ECDH-ES`, `ECDH-ES+A128KW`, `ECDH-ES+A256KW` | `RSA1_5` (Bleichenbacher class), `dir` (no key wrap), `A*KW` / `A*GCMKW` (symmetric — same key-distribution problem as HMAC). |
| `enc` (content encryption) | `A128GCM`, `A256GCM` | `A*CBC-HS*` (AES-CBC with HMAC — historic CBC-with-MAC pitfalls, plus a wider attack surface than GCM). |

Every refused algorithm has a documented attack class that the OAuth / OIDC ecosystem has either retired (`RSA1_5`) or never adopted in a profile (CBC-with-MAC for OAuth bearers). The embedder can narrow the advertised set per deployment with `op.WithSupportedEncryptionAlgs(algs, encs []string)` but cannot widen it past the library's allow-list.

## Read next

- [ID Token, access token, userinfo](/concepts/tokens) — what each token contains and how the JWS verification path differs.
- [Operations: key rotation](/operations/key-rotation) — the JWKS lifecycle, kid retirement, and RP cache convergence.
- [Use case: JWE encryption](/use-cases/jwe-encryption) — wiring the encryption keyset and narrowing the alg / enc list.
