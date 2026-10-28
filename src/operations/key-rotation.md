---
title: Key rotation
description: Rotating signing, inbound encryption, and cookie keys without dropping live sessions.
outline: 2
pageClass: pg-operations-key-rotation
---

# Key rotation

Three distinct key roles rotate on different cadences:

- **Signing keys** (`op.Keyset`) — the ECDSA P-256 private keys used to sign ID Tokens, JWT access tokens, JARM, and userinfo JWTs. Public half lives in `/jwks`.
- **Cookie keys** (`op.WithCookieKeys`) — the 32-byte AES-256-GCM keys used to seal the session, interaction, and CSRF cookies.
- **Inbound encryption keys** (`op.EncryptionKeyset`) — the private keys used to decrypt client-encrypted request objects. Their public halves are published as `use=enc` keys in `/jwks`; they are not outbound encryption keys.

All three are rotated by constructing a new `*Provider` and atomically swapping the handler. The library never mutates a key slice in place.

<figure class="fig">
  <div class="fig-head">Rotating a key without a flag day</div>
  <svg class="fig-svg" role="img" aria-labelledby="key-rotation-title" viewBox="0 0 960 288" xmlns="http://www.w3.org/2000/svg">
    <title id="key-rotation-title">The shape of a signing or cookie key rotation: generate a new key, build a Provider with the new key first and the old one still present, swap the handler atomically, wait out the token lifetime and every cached key set, and only then drop the old key.</title>
    <!-- generate -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t" x="48" y="52">Generate</text>
    <text class="fg-s" x="48" y="76">a new key</text>
    <text class="fg-s" x="48" y="100">with a new kid</text>
    <!-- first -->
    <rect class="fg-box fg-box--accent" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="52">Put it first</text>
    <text class="fg-mxs" x="360" y="76">[new, old]</text>
    <text class="fg-s" x="360" y="100">first signs, the rest verify</text>
    <!-- new -->
    <rect class="fg-box" x="656" y="24" width="272" height="96" rx="8"/>
    <text class="fg-m" x="672" y="52">op.New</text>
    <text class="fg-s" x="672" y="76">revalidates the whole</text>
    <text class="fg-s" x="672" y="100">configuration again</text>
    <path class="fg-edge" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M616,72 H656" marker-end="url(#fg-a)"/>
    <!-- wrap -->
    <path class="fg-leader" d="M792,120 V144 H168"/>
    <path class="fg-edge fg-edge--thin" d="M168,144 V168" marker-end="url(#fg-a)"/>
    <!-- swap -->
    <rect class="fg-box" x="32" y="168" width="272" height="96" rx="8"/>
    <text class="fg-t" x="48" y="196">Swap the handler</text>
    <text class="fg-s" x="48" y="220">atomic: no request sees</text>
    <text class="fg-s" x="48" y="244">a half-rotated provider</text>
    <!-- wait -->
    <rect class="fg-box fg-box--warn" x="344" y="168" width="272" height="96" rx="8"/>
    <text class="fg-t" x="360" y="196">Wait it out</text>
    <text class="fg-s" x="360" y="220">the token TTL and every RP's</text>
    <text class="fg-s" x="360" y="244">JWKS cache window</text>
    <!-- drop -->
    <rect class="fg-box fg-box--muted" x="656" y="168" width="272" height="96" rx="8"/>
    <text class="fg-t" x="672" y="196">Drop the old key</text>
    <text class="fg-s" x="672" y="220">not before the wait ends</text>
    <text class="fg-s" x="672" y="244">only then is it safe</text>
    <path class="fg-edge" d="M304,216 H344" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--muted" d="M616,216 H656" marker-end="url(#fg-am)"/>
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
// and the previous key is retained for verification. NotAfter is optional:
// from that instant the OP itself stops trusting the retiring kid.
retireAfter := time.Now().Add(2*time.Hour + 5*time.Minute) // see "When to drop the retiring key"
ks := op.Keyset{
    {KeyID: "sig-2026-05", Signer: newPriv},                         // active
    {KeyID: "sig-2026-02", Signer: prevPriv, NotAfter: retireAfter}, // retiring; verifies recent tokens
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

The first entry in the `Keyset` is always the active signer; the rest are advertised in JWKS for verification only. RPs that have a JWKS already cached pick up the new `kid` on their next refresh, or immediately when they meet a `kid` they do not know. See [JWKS endpoint](/operations/jwks) for the cache headers.

`NotAfter` on a retiring entry is a hard stop for the OP's own verification: from that instant the OP rejects a token that names the `kid`, including its own JWT access tokens at `/userinfo` and `/introspect`, and records `key.retired_kid_presented`. The public key stays in `/jwks` until you rebuild the `Keyset` without it. Set `retireAfter` to the end of the overlap computed below, never to the rotation instant. The active entry must have no `NotAfter` or one in the future; if it has already reached `NotAfter`, `op.New` fails.

### When to drop the retiring key

Count from the moment the new provider starts serving, and wait for both of these:

- The longest lifetime of anything the old key signed: access tokens (default `WithAccessTokenTTL` = 5 min) and ID tokens.
- The RP-side JWKS cache window. `/jwks` is served with `max-age=3600, stale-while-revalidate=3600`, so a cache can take up to 2 h to turn over.

With the defaults that is about **2 hours and 5 minutes** (an ID token that lives longer extends it). An operator with longer-lived tokens adds that lifetime on top. Dropping earlier means a verifier that fetches `/jwks` afterwards cannot check a token the old key signed.

<figure class="fig">
  <div class="fig-head">How long the old key has to stay</div>
  <svg class="fig-svg" role="img" aria-labelledby="key-overlap-title" viewBox="0 0 960 368" xmlns="http://www.w3.org/2000/svg">
    <title id="key-overlap-title">A timeline that starts when the handler is swapped and the old key stops signing. Tokens the old key already signed stay valid for one token lifetime. RP caches of the previous key set can take up to two hours to turn over. The old key stays in the Keyset and in JWKS until the last of these has ended, and that moment is the earliest it may be dropped.</title>
    <text class="fg-lbl" x="32" y="40">after the swap</text>
    <path class="fg-rule fg-rule--strong" d="M32,56 H928"/>
    <path class="fg-tick" d="M256,48 V64"/>
    <text class="fg-s" x="272" y="40">the old key stops signing</text>
    <!-- Tokens it signed -->
    <text class="fg-s" x="32" y="118">Tokens it signed</text>
    <rect class="fg-box" x="256" y="88" width="96" height="48" rx="8"/>
    <text class="fg-s" x="368" y="118">valid for one more token lifetime (5 min by default)</text>
    <!-- RP key-set caches -->
    <text class="fg-s" x="32" y="198">RP key-set caches</text>
    <rect class="fg-box fg-box--warn" x="256" y="168" width="592" height="48" rx="8"/>
    <text class="fg-s" x="272" y="198">may still serve the previous set (up to 2 h by default)</text>
    <!-- Old key in the Keyset -->
    <text class="fg-s" x="32" y="278">Old key in the Keyset</text>
    <rect class="fg-box fg-box--accent" x="256" y="248" width="592" height="48" rx="8"/>
    <text class="fg-s" x="272" y="278">keep it published and trusted until the last bar above ends</text>
    <!-- earliest drop -->
    <path class="fg-rule fg-rule--strong fg-rule--dashed" d="M848,64 V320"/>
    <text class="fg-s" x="848" y="344" text-anchor="middle">earliest drop</text>
  </svg>
  <figcaption class="fig-note">Bar lengths are schematic. The old key is safe to remove only when the longest bar has ended: with defaults that is the cache window, and with long-lived tokens the token bar can overtake it.</figcaption>
</figure>

::: tip Rotation overlap signal
Pass `op.WithJWKSRotationActive(predicate)` at provider construction. While the predicate returns true, `/jwks` answers with `Cache-Control: public, max-age=300, must-revalidate` (5 minutes) instead of the long-cache default, so RP caches refresh promptly. Hold it true during the overlap window. See [JWKS endpoint](/operations/jwks#rotation-cache-control).
:::

## Inbound encryption key rotation

`op.EncryptionKeyset` is the OP's inbound-only JWE keyset for encrypted request objects at `/auth` and `/par`. It never supplies an active key for outbound responses: those JWE responses are encrypted to a `use=enc` key from the client's JWKS.

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

- **Routine:** quarterly (low risk; the cookies use the `__Host-` prefix and their lifetime is bounded by the session lifetime).
- **Compromised:** immediately.

### Procedure

```go
// Generate a fresh 32-byte key.
newKey := make([]byte, 32)
if _, err := rand.Read(newKey); err != nil { /* abort */ }

// First key encrypts; subsequent keys are tried for decryption.
op.WithCookieKeys(newKey, oldKey)
```

`WithCookieKeys` retains the old key in the decrypt slot so live sessions stay valid. Sessions default to 14 days idle and 30 days absolute, so keep `oldKey` for up to 30 days; dropping it earlier signs out the users whose cookies were sealed with it. Once every such session has ended, remove `oldKey` from the slice. With more than one replica, roll the change out in the three steps described in [Multi-instance deployment](/operations/multi-instance#cookie-key-consistency), so that no replica seals a cookie another cannot open.

::: warning Order matters
The first key in `WithCookieKeys` is the active encryption key. Putting the old key first **silently downgrades** new sessions to the compromised key. The order is enforced by convention, not type — so review carefully on every rotation.
:::

## MFA encryption key rotation

`WithMFAEncryptionKeys` follows the same "current first, previous in tail" shape as cookie keys. The 32-byte key seals TOTP secrets at rest (AES-256-GCM, with the subject identifier as additional authenticated data). A `StepTOTP` with its own `EncryptionKey` uses that key instead.

```go
op.WithMFAEncryptionKeys(currentKey, previousKey)
```

Retire `previousKey` only after every persisted TOTP record has been re-sealed under `currentKey`. This is your store's migration path — the OP does not re-seal automatically.

## What you do *not* rotate

- **Issuer.** Changing `WithIssuer` invalidates every issued token (`iss` is part of the JWT) and every RP's discovery cache. Treat as a deployment, not a rotation.
- **`KeyID`s in your `Keyset`.** Once advertised in JWKS, a `kid` is a public identifier RPs cache. Reusing a `kid` for a different key makes any RP that cached the old public key fail verification. Generate fresh `kid` values per rotation.

## Verification checklist

After every rotation:

1. `curl https://op.example.com/jwks` — confirm the new `kid` is present and the retired `kid` is still listed (unless you've completed the drop step).
2. New token `kid` header points at the new key: `echo "<jwt>" | cut -d. -f1 | base64 -d | jq .kid`.
3. No `key.retired_kid_presented` audit events fire after the cut-over. The OP emits this event when a JWS / JWE names a `kid` whose `NotAfter` has passed, so it only applies to entries where you set `NotAfter`; silence is the success signal.
4. A browser session established before rotation can resume an authorization request at `/auth` without re-authentication (the session cookie still decrypts).

## Why a new `Provider` instead of a mutate-in-place API

Rotation changes a fundamental security property of the OP. Forcing a fresh `op.New(...)` call:

- Re-runs every option-conflict check (so a typo can't survive).
- Atomically replaces the verification path (no half-rotated state).
- Surfaces the change as a fresh log line / audit event from the supervisor, not a silent in-process mutation.

The supervisor pattern is small enough that the safety win is worth the verbosity.
