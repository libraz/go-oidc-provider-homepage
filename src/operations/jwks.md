---
title: JWKS endpoint
description: What /jwks advertises, the cache headers it emits, and how RPs interact with it through rotation.
outline: 2
pageClass: pg-operations-jwks
---

# JWKS endpoint

The `/jwks` endpoint exposes the public half of the OP's signing keys. RPs fetch it to verify ID Tokens, JWT access tokens, JARM responses, and any userinfo JWTs. This page is the operational contract between the OP and those RP caches.

<figure class="fig">
  <div class="fig-head">How an RP finds the right key</div>
  <svg class="fig-svg" role="img" aria-labelledby="jwks-fetch-title" viewBox="0 0 960 268" xmlns="http://www.w3.org/2000/svg">
    <title id="jwks-fetch-title">A relying party reads jwks_uri out of the discovery document, fetches the key set once, and caches it. When a token arrives carrying a kid the cache does not know, it refetches — which is how a rotated key reaches every verifier without a coordinated deploy.</title>
    <rect class="fg-box" x="36" y="94" width="180" height="80" rx="8"/>
    <text class="fg-t" x="54" y="124">RP</text>
    <text class="fg-xs" x="54" y="146">verifies the tokens</text>
    <text class="fg-xs" x="54" y="162">it is presented with</text>
    <path class="fg-edge" d="M220,116 H302" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="261" y="109" text-anchor="middle">1 · read config</text>
    <rect class="fg-box fg-box--accent" x="306" y="34" width="230" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="324" y="60">/.well-known/…</text>
    <text class="fg-xs" x="324" y="80">the discovery document</text>
    <text class="fg-mxs" x="324" y="96">advertises jwks_uri</text>
    <path class="fg-edge fg-edge--accent" d="M421,110 V142" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="437" y="132">2 · fetch keys</text>
    <rect class="fg-box fg-box--accent" x="306" y="146" width="230" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="324" y="172">/jwks</text>
    <text class="fg-xs" x="324" y="192">the JWK set, with an ETag</text>
    <text class="fg-xs" x="324" y="208">so a refetch is usually a 304</text>
    <path class="fg-edge" d="M540,182 H616" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="578" y="175" text-anchor="middle">3 · cache</text>
    <rect class="fg-box" x="620" y="146" width="304" height="72" rx="8"/>
    <text class="fg-t2" x="638" y="172">RP cache</text>
    <text class="fg-xs" x="638" y="192">picks the key by the token's kid</text>
    <text class="fg-xs" x="638" y="208">no network call on the happy path</text>
    <path class="fg-edge fg-edge--muted" d="M772,142 V102" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="788" y="126">4 · unknown kid</text>
    <rect class="fg-box fg-box--warn" x="620" y="52" width="304" height="50" rx="8"/>
    <text class="fg-t2" x="638" y="74">A kid the cache has never seen</text>
    <text class="fg-xs" x="638" y="92">refetch /jwks once, then verify — step 5</text>
    <path class="fg-edge fg-edge--muted" d="M616,77 H556 V152" marker-end="url(#fg-am)"/>
  </svg>
  <figcaption class="fig-note">Step 4 is what makes rotation safe without coordination. An RP that has never heard of the new key finds out the first time it meets one — provided it refetches on a miss rather than rejecting outright.</figcaption>
</figure>

## What's served

```http
GET /jwks
Accept: application/jwk-set+json
```

Response body shape:

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "x": "...",
      "y": "...",
      "kid": "sig-2026-05",
      "alg": "ES256",
      "use": "sig"
    }
  ]
}
```

Every entry in the signing keyset carries `alg: "ES256"`, `use: "sig"`, `kty: "EC"`, and `crv: "P-256"` — the OP only signs with ES256. If you configure `WithEncryptionKeyset`, the OP additionally appends the encryption keyset's public halves (`use: "enc"`) after the signing keys; see [Key rotation](/operations/key-rotation) for how the two keysets rotate independently.

::: info Why ES256-only on the keyset
The JOSE allow-list (`RS256`, `PS256`, `ES256`, `EdDSA`) is the set the OP **verifies** — relevant when an RP signs `private_key_jwt` client assertions or JAR request objects with one of those algs. The keys the OP **signs with** are restricted to ES256. See [Required options § WithKeyset](/getting-started/required-options#withkeyset).
:::

## HTTP headers

| Header | Value | Notes |
|---|---|---|
| `Content-Type` | `application/jwk-set+json` | per RFC 7517 |
| `Cache-Control` | `public, max-age=3600, stale-while-revalidate=3600` | 1 h cache, 1 h SWR |
| `ETag` | `"<sha256-hex>"` | strong validator over the marshalled body |
| `Allow` | `GET, HEAD` | other methods get 405 |

`HEAD` returns the headers (including `ETag` and `Cache-Control`) with no body, which is what well-behaved RP caches use to revalidate.

### `If-None-Match`

The handler honours `If-None-Match`:

- Exact ETag match → `304 Not Modified` with no body.
- `*` wildcard → `304 Not Modified`.
- Weak validator (`W/"..."`) → treated as non-matching.

The ETag covers the **full marshalled JWKS**, so any `kid` change or key set membership change rolls the value automatically. There is no manual cache-bust step.

## Rotation Cache-Control

During a rotation overlap window the handler can advertise a shortened cache:

```
Cache-Control: public, max-age=300, must-revalidate
```

Wire the predicate through `op.WithJWKSRotationActive(...)` at provider construction. The predicate runs on the request hot path, so it must be cheap and concurrency-safe. Omit the option (or pass nil) to leave the handler in long-cache mode for every response.

A typical pattern:

```go
var rotationUntil atomic.Value // time.Time
rotationUntil.Store(time.Time{})

// On rotation start:
rotationUntil.Store(time.Now().Add(24 * time.Hour))

isRotating := func() bool {
    until, _ := rotationUntil.Load().(time.Time)
    return time.Now().Before(until)
}

provider, _ := op.New(
    /* required options */
    op.WithJWKSRotationActive(isRotating),
)
```

After the window passes, the predicate returns false and the long cache resumes. Repeated calls to `op.WithJWKSRotationActive` are last-wins, so a supervisor can swap predicates without rebuilding earlier option lists.

## RP cache behaviour

A well-behaved RP:

1. Fetches `/jwks` once at startup (or first verification).
2. Caches the response per `Cache-Control`; revalidates with `If-None-Match` after `max-age` expires.
3. On a JWS verification with an unknown `kid`, refetches `/jwks` bypassing cache (this is the expected rotation path — the new `kid` arrives, the verification retries, and succeeds).
4. Does NOT fall back to a cached key on `kid` mismatch — that would defeat rotation auditing.

The OP's own internal verification path follows the same rules. There is no special "trust the active key for unknown `kid`" branch.

## Multiple keys in JWKS

The keyset advertises every entry in the configured `op.Keyset`:

```go
op.WithKeyset(op.Keyset{
    {KeyID: "sig-2026-05", Signer: newPriv}, // active — first signs
    {KeyID: "sig-2026-02", Signer: prevPriv}, // retiring — verify only
})
```

Both `kid` values appear in `/jwks`. The OP signs new tokens with the first entry; the second is kept in JWKS so RPs can still verify tokens issued before the rotation. See [Key rotation](/operations/key-rotation) for cadence.

## HSM / KMS integration

`op.SigningKey.Signer` is `crypto.Signer` — anything implementing `Sign(rand io.Reader, digest []byte, opts crypto.SignerOpts) ([]byte, error)` fits. Common shapes:

- AWS KMS: `kms.NewFromConfig(cfg)` + a thin `crypto.Signer` adapter that calls `Sign` against the KMS key.
- Azure Key Vault: `azkeys.Client` + adapter.
- HashiCorp Vault Transit: HTTP signer adapter.
- Google Cloud KMS: `kms.NewKeyManagementClient` + adapter.
- PKCS#11 / hardware HSM: `crypto11.Context` returns a `crypto.Signer` directly.

The OP only requires:

- The signer's public key is `*ecdsa.PublicKey` on `elliptic.P256()`.
- `Sign` is safe for concurrent use (every adapter listed above is).

A KMS-backed signer adds latency to token issuance (typically 10 – 50 ms per signature). Plan capacity accordingly.

## Discovery `jwks_uri`

The discovery document advertises `jwks_uri` as the absolute URL of the configured JWKS path under your issuer + mount prefix. RPs fetch discovery once and follow the `jwks_uri` from there — there is no hard-coded path the OP relies on.

You can override the path with `WithEndpoints(op.Endpoints{JWKS: "/keys"})` if you have a router conflict; the discovery document follows.

## Verifying the contract

```sh
# Headers — confirm Cache-Control and ETag.
curl -I https://op.example.com/jwks

# Body shape — confirm one entry per active+retiring kid.
curl -s https://op.example.com/jwks | jq '.keys[] | {kid, alg, use}'

# Revalidation — confirm 304 on matching ETag.
ETAG=$(curl -sI https://op.example.com/jwks | awk '/[Ee][Tt]ag/ {print $2}' | tr -d '\r')
curl -I -H "If-None-Match: $ETAG" https://op.example.com/jwks
# → HTTP/1.1 304 Not Modified
```

A 304 is the normal hot-path response for an RP with a warm cache.
