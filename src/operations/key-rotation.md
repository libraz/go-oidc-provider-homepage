---
title: Key rotation
description: Rotating signing keys and cookie keys without dropping live sessions.
outline: 2
---

# Key rotation

Two distinct keys rotate on different cadences:

- **Signing keys** (`op.Keyset`) — the ECDSA P-256 private keys used
  to sign ID tokens, JWT access tokens, JARM, and userinfo JWTs. Public
  half lives in `/jwks`.
- **Cookie keys** (`op.WithCookieKey` / `WithCookieKeys`) — the 32-byte
  AES-256-GCM keys used to seal session and CSRF cookies.

Both are rotated by constructing a new `*Provider` and atomically
swapping the handler. The library never mutates the slice in place.

## Signing key rotation

### Cadence

- **Routine:** every 60 – 90 days.
- **Compromised:** immediately, with the retired key dropped from JWKS
  after every outstanding token has expired (your access-token TTL
  bound).

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
    op.WithCookieKey(cookieKey),
    /* ... rest of options ... */
)
if err != nil { /* retain old provider, alert */ }

// Step 4. Atomically replace the live handler.
liveHandler.Store(newProv)  // typically an *atomic.Value or sync.Map
```

The first entry in the `Keyset` is always the active signer; subsequent
entries are advertised in JWKS for verification only. RPs that have a
JWKS already cached pick up the new `kid` on their next refresh — see
[JWKS endpoint](/operations/jwks) for the cache headers.

### When to drop the retiring key

Wait at least:

- The longest issued token TTL (default `WithAccessTokenTTL` = 5 min).
- Plus the longest RP-side JWKS cache window (`max-age=86400` by
  default — 24 h).

So the safe minimum is **24 hours after rotation** before dropping the
old `kid`. Operators with shorter access-token TTL still want to wait
the JWKS cache window so RPs that mid-rotation cached the old set
don't reject a token they could have validated.

::: tip Rotation overlap signal
The JWKS handler accepts a `RotationActive func() bool` predicate — when
true, the response advertises a 5-minute `Cache-Control: public,
max-age=300, must-revalidate` instead of the long-cache default
(`max-age=86400, stale-while-revalidate=3600`). Set it during the
overlap window so RP caches refresh promptly. See
[JWKS endpoint](/operations/jwks#rotation-cache-control).
:::

## Cookie key rotation

### Cadence

- **Routine:** quarterly (low risk; the cookie scope is `__Host-` and
  the lifetime is bounded by the session TTL).
- **Compromised:** immediately.

### Procedure

```go
// Generate a fresh 32-byte key.
newKey := make([]byte, 32)
if _, err := rand.Read(newKey); err != nil { /* abort */ }

// First key encrypts; subsequent keys are tried for decryption.
op.WithCookieKeys(newKey, oldKey)
```

`WithCookieKeys` retains the old key in the decrypt slot so live
sessions stay valid until the user re-authenticates or the session
TTL expires. After every outstanding session has expired (or after
you force a logout fan-out), drop `oldKey` from the slice.

::: warning Order matters
The first key in `WithCookieKeys` is the active encryption key. Putting
the old key first **silently downgrades** new sessions to the
compromised key. The order is enforced by convention, not type — so
review carefully on every rotation.
:::

## MFA encryption key rotation

`WithMFAEncryptionKey` / `WithMFAEncryptionKeys` follow the same
"current first, previous in tail" shape as cookie keys. The 32-byte
key seals TOTP secrets at rest (AES-256-GCM, with the subject
identifier as additional authenticated data).

```go
op.WithMFAEncryptionKeys(currentKey, previousKey)
```

Retire `previousKey` only after every persisted TOTP record has been
re-sealed under `currentKey`. This is your store's migration path —
the OP does not re-seal automatically.

## What you do *not* rotate

- **Issuer.** Changing `WithIssuer` invalidates every issued token
  (`iss` is part of the JWT) and every RP's discovery cache. Treat as
  a deployment, not a rotation.
- **`KeyID`s in your `Keyset`.** Once advertised in JWKS, a `kid` is a
  public identifier RPs cache. Reusing a `kid` after dropping it
  causes a verification gap if any RP cached the old public key.
  Generate fresh `kid` values per rotation.

## Verification checklist

After every rotation:

1. `curl https://op.example.com/jwks` — confirm the new `kid` is
   present and the retired `kid` is still listed (unless you've
   completed the drop step).
2. New token `kid` header points at the new key:
   `echo "<jwt>" | cut -d. -f1 | base64 -d | jq .kid`.
3. `token.issued` audit events show the new `kid` in extras.
4. Browser sessions established before rotation still resolve at the
   `/userinfo` endpoint (cookie key rotation didn't break decrypt).

## Why a new `Provider` instead of a mutate-in-place API

Rotation changes a fundamental security property of the OP. Forcing a
fresh `op.New(...)` call:

- Re-runs every option-conflict check (so a typo can't survive).
- Atomically replaces the verification path (no half-rotated state).
- Surfaces the change as a fresh log line / audit event from the
  supervisor, not a silent in-process mutation.

The supervisor pattern is small enough that the safety win is worth
the verbosity.
