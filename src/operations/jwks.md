---
title: JWKS endpoint
description: What /jwks advertises, the cache headers it emits, and how RPs interact with it through rotation.
outline: 2
pageClass: pg-operations-jwks
---

# JWKS endpoint

The `/jwks` endpoint publishes the public half of the OP's signing keys as a JWKS (JSON Web Key Set, RFC 7517), a JSON document listing public keys by `kid`. RPs fetch it to verify ID Tokens, JWT access tokens, JARM responses, and any userinfo JWTs. This page is the operational contract between the OP and those RP caches.

<figure class="fig">
  <div class="fig-head">A rotated key reaches RPs the first time they miss</div>
  <svg class="fig-svg" role="img" aria-labelledby="jwks-fetch-title" viewBox="0 0 960 808" xmlns="http://www.w3.org/2000/svg">
    <title id="jwks-fetch-title">A relying party reads jwks_uri out of the discovery document, fetches the key set once, and caches it. When a token arrives carrying a kid the cache does not know, it refetches once and then verifies, which is how a rotated key reaches every verifier without a coordinated deploy.</title>
    <!-- phases -->
    <rect class="fg-group" x="32" y="104" width="896" height="320" rx="8"/>
    <rect class="fg-group" x="32" y="440" width="896" height="344" rx="8"/>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="784"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="784"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">verifies the tokens</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- first use -->
    <text class="fg-lbl fg-halo" x="56" y="132">first use</text>
    <!-- 1 -->
    <path class="fg-edge" d="M192,172 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="138" text-anchor="middle">GET /.well-known/…</text>
    <text class="fg-mxs" x="352" y="160" text-anchor="middle">read jwks_uri</text>
    <!-- 2 -->
    <path class="fg-edge" d="M192,244 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="210" text-anchor="middle">GET /jwks</text>
    <text class="fg-mxs" x="352" y="232" text-anchor="middle">no cached copy yet</text>
    <!-- 3 -->
    <path class="fg-edge fg-edge--accent" d="M512,316 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="282" text-anchor="middle">200 · JWK set</text>
    <text class="fg-mxs" x="352" y="304" text-anchor="middle">with an ETag</text>
    <!-- 4 -->
    <path class="fg-edge" d="M192,364 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="370">cache the set by kid</text>
    <text class="fg-xs" x="248" y="392">later lookups skip the network</text>
    <!-- unknown kid -->
    <text class="fg-lbl fg-halo" x="56" y="468">a kid the cache has never seen</text>
    <!-- 5 -->
    <path class="fg-edge" d="M192,504 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="510">kid not in the cache</text>
    <text class="fg-xs" x="248" y="532">refetch once, don't reject</text>
    <!-- 6 -->
    <path class="fg-edge" d="M192,608 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="574" text-anchor="middle">GET /jwks</text>
    <text class="fg-mxs" x="352" y="596" text-anchor="middle">If-None-Match: ETag</text>
    <!-- 7 -->
    <path class="fg-edge fg-edge--accent" d="M512,680 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="646" text-anchor="middle">200 · JWK set</text>
    <text class="fg-mxs" x="352" y="668" text-anchor="middle">or 304 if unchanged</text>
    <!-- 8 -->
    <path class="fg-edge" d="M192,728 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="734">verify the token</text>
    <text class="fg-xs" x="248" y="756">with the key just fetched</text>
  </svg>
  <figcaption class="fig-note">The refetch on an unknown kid is what makes rotation safe without coordination. An RP that has never heard of the new key finds out the first time it meets one — provided it refetches on a miss rather than rejecting outright.</figcaption>
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

`HEAD` returns the same headers (including `ETag` and `Cache-Control`) with no body. RP caches normally revalidate with a conditional `GET` instead, as below.

### `If-None-Match`

The handler honours `If-None-Match`:

- Exact ETag match → `304 Not Modified` with no body. The 304 still carries `ETag` and `Cache-Control`.
- `*` wildcard → `304 Not Modified`.
- Weak validator (`W/"..."`) with the same opaque tag → also matches (the `If-None-Match` comparison is weak).
- A comma-separated list matches when any member does.

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
3. On a JWS verification with an unknown `kid`, refetches `/jwks` bypassing cache. This is the expected rotation path: the new `kid` arrives, the verification retries, and succeeds.
4. Does NOT fall back to a cached key on `kid` mismatch, because that would defeat rotation auditing.

The OP applies the same rule when it verifies its own JWT access tokens at `/userinfo` and `/introspect`: it looks the `kid` up in the configured keyset, and a `kid` that is unknown or past its `NotAfter` is refused. There is no "trust the active key for an unknown `kid`" branch.

## Multiple keys in JWKS

The keyset advertises every entry in the configured `op.Keyset`:

```go
op.WithKeyset(op.Keyset{
    {KeyID: "sig-2026-05", Signer: newPriv}, // active — first signs
    {KeyID: "sig-2026-02", Signer: prevPriv}, // retiring — verify only
})
```

Both `kid` values appear in `/jwks`. The OP signs new tokens with the first entry; the second is kept in JWKS so RPs can still verify tokens issued before the rotation. See [Key rotation](/operations/key-rotation) for cadence.

An entry stays in `/jwks` until you rebuild the `Keyset` without it. Setting `SigningKey.NotAfter` on a retiring entry makes the OP itself stop trusting that `kid` at the deadline (it also emits `key.retired_kid_presented` when one shows up), but the public key stays published so RP caches can drain. Encryption keys behave differently: an `EncryptionKey` past its `NotAfter` is removed from `/jwks` as well.

## HSM / KMS integration

`op.SigningKey.Signer` is `crypto.Signer` — anything implementing `Sign(rand io.Reader, digest []byte, opts crypto.SignerOpts) ([]byte, error)` fits. Common shapes:

- AWS KMS: `kms.NewFromConfig(cfg)` + a thin `crypto.Signer` adapter that calls `Sign` against the KMS key.
- Azure Key Vault: `azkeys.Client` + adapter.
- HashiCorp Vault Transit: HTTP signer adapter.
- Google Cloud KMS: `kms.NewKeyManagementClient` + adapter.
- PKCS#11 / hardware HSM: `crypto11.Context` returns a `crypto.Signer` directly.

The OP only requires:

- The signer's public key is `*ecdsa.PublicKey` on `elliptic.P256()`; any other key type makes `op.New` fail.
- `Sign` is safe for concurrent use. A thin adapter must guarantee this itself if its client is not.

A KMS-backed signer adds latency to token issuance (typically 10 – 50 ms per signature). Plan capacity accordingly.

## Discovery `jwks_uri`

The discovery document advertises `jwks_uri` as the absolute URL of the configured JWKS path under your issuer and mount prefix (`/oidc` by default). RPs fetch discovery once and follow the `jwks_uri` from there — there is no hard-coded path the OP relies on.

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
