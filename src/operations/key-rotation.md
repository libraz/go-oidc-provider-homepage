---
title: Key rotation
description: Rotating signing, inbound encryption, and cookie keys without dropping live sessions.
outline: 2
pageClass: pg-operations-key-rotation
---

# Key rotation

Three distinct key roles rotate on different cadences:

- **Signing keys** (`op.Keyset`) — the ECDSA P-256 private keys used to sign ID Tokens, JWT access tokens, JARM, and userinfo JWTs. Public half lives in `/jwks`.
- **Cookie keys** (`op.WithCookieKeys`) — the 32-byte AES-256-GCM keys used to seal session and CSRF cookies.
- **Inbound encryption keys** (`op.EncryptionKeyset`) — the private keys used to decrypt client-encrypted request objects. Their public halves are published as `use=enc` keys in `/jwks`; they are not outbound encryption keys.

All three are rotated by constructing a new `*Provider` and atomically swapping the handler. The library never mutates a key slice in place.

<figure class="fig">
  <div class="fig-head">Rotating a key without a flag day</div>
  <svg class="fig-svg" role="img" aria-labelledby="key-rotation-title" viewBox="0 0 960 236" xmlns="http://www.w3.org/2000/svg">
    <title id="key-rotation-title">The shape of a signing or cookie key rotation: generate a new key, build a Provider with the new key first and the old one still present, swap the handler atomically, and only drop the old key once every cached copy of the key set has expired.</title>
    <rect class="fg-box" x="36" y="60" width="168" height="80" rx="8"/>
    <text class="fg-t2" x="54" y="88">Generate</text>
    <text class="fg-xs" x="54" y="110">a new key with a</text>
    <text class="fg-mxs" x="54" y="128">new kid</text>
    <path class="fg-edge" d="M208,100 H244" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="248" y="60" width="196" height="80" rx="8"/>
    <text class="fg-t2 fg-accent" x="266" y="88">Put it first</text>
    <text class="fg-mxs" x="266" y="110">[new, old]</text>
    <text class="fg-xs" x="266" y="128">first entry signs, the rest verify</text>
    <path class="fg-edge" d="M448,100 H484" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="488" y="60" width="180" height="80" rx="8"/>
    <text class="fg-m" x="506" y="88">op.New</text>
    <text class="fg-xs" x="506" y="110">revalidates the whole</text>
    <text class="fg-xs" x="506" y="128">configuration again</text>
    <path class="fg-edge" d="M672,100 H708" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="712" y="60" width="212" height="80" rx="8"/>
    <text class="fg-t2" x="730" y="88">Swap the handler</text>
    <text class="fg-xs" x="730" y="110">atomic — no request sees</text>
    <text class="fg-xs" x="730" y="128">a half-rotated provider</text>
    <path class="fg-leader" d="M818,144 V178 H444"/>
    <path class="fg-edge fg-edge--muted" d="M444,178 H244" marker-end="url(#fg-am)"/>
    <text class="fg-xs fg-warn" x="470" y="172">wait out the token TTL and every RP's JWKS cache window</text>
    <rect class="fg-box fg-box--muted" x="36" y="156" width="204" height="46" rx="8"/>
    <text class="fg-t2" x="54" y="176">Then drop the old key</text>
    <text class="fg-xs" x="54" y="194">not before</text>
  </svg>
  <figcaption class="fig-note">For a routine rotation, the old key stays published for the whole overlap and only stops signing. Removing it early can break this: a verifier still holding the previous key set has no way to check a token it already accepted. A compromised key is an incident exception and must be removed promptly.</figcaption>
</figure>

## Signing key rotation

### Cadence

- **Routine:** every 60 – 90 days; retain the retiring key through the normal overlap, then remove it after the token-lifetime and RP-JWKS-cache bounds below.
- **Compromised:** replace it immediately and rebuild the `Keyset` without the compromised entry so it is removed from JWKS promptly. Do not keep a compromised key for the routine overlap; handle tokens signed with it under your incident-response and revocation procedure.

### Procedure

```go
// Step 1. Generate the new key.
newPriv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)

// Step 2. Build a Keyset where the NEW key is first (active signer)
// and the previous key is retained for verification.
ks := op.Keyset{
    {KeyID: "sig-2026-05", Signer: newPriv},  // active
    {KeyID: "sig-2026-02", Signer: prevPriv}, // retiring; verifies recent tokens
}

// Step 3. Construct a new Provider and atomically swap.
newProv, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(myStore),
    op.WithKeyset(ks),
    op.WithCookieKeys(cookieKey),
    /* ... rest of options ... */
)
if err != nil { /* retain old provider, alert */ }

// Step 4. Atomically replace the live handler.
liveHandler.Store(newProv)  // typically an *atomic.Value or sync.Map
```

The first entry in the `Keyset` is always the active signer; subsequent live entries are advertised in JWKS for verification only. RPs that have a JWKS already cached pick up the new `kid` on their next refresh — see [JWKS endpoint](/operations/jwks) for the cache headers. The active signing entry must have no `NotAfter` deadline or one in the future; if it has already reached `NotAfter`, `op.New` fails. A past deadline is valid only for a retiring entry that is no longer active.

### When to drop the retiring key

Wait at least:

- The longest issued token TTL (default `WithAccessTokenTTL` = 5 min).
- Plus the longest RP-side JWKS cache window (`max-age=3600` by default — 1 h).

So the safe minimum is **roughly 1 hour after rotation** (the default 1-hour JWKS cache window plus your access-token TTL) before dropping the old `kid`. Operators with a longer access-token TTL should add that TTL on top of the JWKS cache window so RPs that mid-rotation cached the old set don't reject a token they could have validated.

::: tip Rotation overlap signal
Pass `op.WithJWKSRotationActive(predicate)` at provider construction — when the predicate returns true, the JWKS response advertises a 5-minute `Cache-Control: public, max-age=300, must-revalidate` instead of the long-cache default (`max-age=3600, stale-while-revalidate=3600`). Hold the predicate true during the overlap window so RP caches refresh promptly. See [JWKS endpoint](/operations/jwks#rotation-cache-control).
:::

## Inbound encryption key rotation

`op.EncryptionKeyset` is the OP's inbound-only JWE keyset for encrypted request objects at `/authorize` and `/par`. It never supplies an active key for outbound responses: those JWE responses are encrypted to a `use=enc` key from the client's JWKS.

```go
encKeys := op.EncryptionKeyset{
    {KeyID: "enc-2026-09", PrivateKey: newEncPriv},
    {KeyID: "enc-2026-05", PrivateKey: oldEncPriv, NotAfter: oldEncExpiry},
}

newProv, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(myStore),
    op.WithKeyset(signingKeys),
    op.WithEncryptionKeyset(encKeys),
    op.WithCookieKeys(cookieKey),
    /* ... rest of options ... */
)
```

Entries are ordered inbound decryption candidates and are published as `use=enc`. A JWE with `kid` selects its matching live entry. A kidless JWE is filtered to live keys in the same family as its protected `alg`; if more than `op.MaxKidlessEncryptionTrialKeys` (default: 4) remain, decryption is refused rather than truncated. `op.New` warns when a configured family exceeds that limit, so RPs should include `kid`.

Publish the new and retiring entries through the RP JWKS cache window and the longest accepted request-object lifetime. `NotAfter` is a hard cutoff: on or after it, the OP refuses that key and removes its public half from JWKS. Remove the retiring entry after the overlap; outbound response encryption has no OP-side key to rotate.

## Cookie key rotation

### Cadence

- **Routine:** quarterly (low risk; the cookie scope is `__Host-` and the lifetime is bounded by the session TTL).
- **Compromised:** immediately.

### Procedure

```go
// Generate a fresh 32-byte key.
newKey := make([]byte, 32)
if _, err := rand.Read(newKey); err != nil { /* abort */ }

// First key encrypts; subsequent keys are tried for decryption.
op.WithCookieKeys(newKey, oldKey)
```

`WithCookieKeys` retains the old key in the decrypt slot so live sessions stay valid until the user re-authenticates or the session TTL expires. After every outstanding session has expired (or after you force a logout fan-out), drop `oldKey` from the slice.

::: warning Order matters
The first key in `WithCookieKeys` is the active encryption key. Putting the old key first **silently downgrades** new sessions to the compromised key. The order is enforced by convention, not type — so review carefully on every rotation.
:::

## MFA encryption key rotation

`WithMFAEncryptionKeys` follows the same "current first, previous in tail" shape as cookie keys. The 32-byte key seals TOTP secrets at rest (AES-256-GCM, with the subject identifier as additional authenticated data).

```go
op.WithMFAEncryptionKeys(currentKey, previousKey)
```

Retire `previousKey` only after every persisted TOTP record has been re-sealed under `currentKey`. This is your store's migration path — the OP does not re-seal automatically.

## What you do *not* rotate

- **Issuer.** Changing `WithIssuer` invalidates every issued token (`iss` is part of the JWT) and every RP's discovery cache. Treat as a deployment, not a rotation.
- **`KeyID`s in your `Keyset`.** Once advertised in JWKS, a `kid` is a public identifier RPs cache. Reusing a `kid` after dropping it causes a verification gap if any RP cached the old public key. Generate fresh `kid` values per rotation.

## Verification checklist

After every rotation:

1. `curl https://op.example.com/jwks` — confirm the new `kid` is present and the retired `kid` is still listed (unless you've completed the drop step).
2. New token `kid` header points at the new key: `echo "<jwt>" | cut -d. -f1 | base64 -d | jq .kid`.
3. No `key.retired_kid_presented` audit events fire after the cut-over (the OP emits this event whenever a JWS / JWE arrives carrying a `kid` whose retirement deadline has passed — silence is the success signal).
4. A browser session established before rotation can resume an authorization request at `/authorize` without re-authentication (the session cookie still decrypts).

## Why a new `Provider` instead of a mutate-in-place API

Rotation changes a fundamental security property of the OP. Forcing a fresh `op.New(...)` call:

- Re-runs every option-conflict check (so a typo can't survive).
- Atomically replaces the verification path (no half-rotated state).
- Surfaces the change as a fresh log line / audit event from the supervisor, not a silent in-process mutation.

The supervisor pattern is small enough that the safety win is worth the verbosity.
