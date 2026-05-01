---
title: Required options
description: The four options op.New refuses to start without — and why each one matters.
---

# Required options

`op.New(...)` rejects partial configurations at construction time, so an unsafe OP cannot accidentally take traffic. The four required options are:

| Option | Why it's required |
|---|---|
| [`op.WithIssuer`](#withissuer) | Defines the JWT `iss` claim, the discovery URL, and the cookie scope. Wrong here, every downstream check is wrong. |
| [`op.WithStore`](#withstore) | Where authcodes, sessions, refresh chains, JTI replay sets, and clients live. The library is storage-agnostic; without a store it has nowhere to put state. |
| [`op.WithKeyset`](#withkeyset) | The signing keys for ID tokens / JWT access tokens / JARM. The library refuses to mint tokens without a `crypto.Signer` whose algorithm is on the allow-list. |
| [`op.WithCookieKey`](#withcookiekey) | 32 bytes of random material used as an AES-256-GCM key for cookie payloads. Session and CSRF cookies are encrypted, not just signed. |

## `WithIssuer`

```go
op.WithIssuer("https://op.example.com")
```

::: warning OIDC Discovery 1.0 §3 / FAPI 2.0 §5.4
The issuer must be `https://`, must not have a trailing slash, must not carry a query string or fragment. Loopback hosts (`127.0.0.1`, `[::1]`) are exempted from the `https://` requirement so localhost dev works.

`internal/discovery.ValidateIssuer` enforces the shape as defense-in-depth over the option setter. A typo (e.g. trailing slash) will fail `op.New`, not silently produce a discovery document RPs reject.
:::

## `WithStore`

```go
op.WithStore(inmem.New())
// or
op.WithStore(myCompositeStore)
```

The `op.Store` interface is the union of small substore interfaces (`AuthCodeStore`, `RefreshTokenStore`, `SessionStore`, `ClientStore`, …). You usually compose a `Store` from one of the bundled adapters:

- [`op/storeadapter/inmem`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/inmem) — every substore in memory. Reference + dev + tests.
- [`op/storeadapter/sql`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql) — durable substores against `database/sql`.
- [`op/storeadapter/redis`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/redis) — volatile substores (`InteractionStore`, `ConsumedJTIStore`).
- [`op/storeadapter/composite`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/composite) — hot/cold splitter, routes durable substores to one backend and volatile substores to another.

::: tip BYO storage
The store interfaces are intentionally tiny so you can implement them against whatever you already run — Cassandra, Spanner, etcd, a Redis cluster with your own conventions. The contract test suite at `op/store/contract` verifies a store against the same expectations the bundled adapters meet.
:::

## `WithKeyset`

```go
priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
op.WithKeyset(op.Keyset{
  {KeyID: "k1", Signer: priv},
})
```

A `Keyset` is a slice of `{KeyID, Signer}` records. `Signer` is anything that implements `crypto.Signer` (so `*ecdsa.PrivateKey`, `*rsa.PrivateKey`, or a vault/KMS handle that returns a `crypto.Signer`).

::: warning Algorithm allow-list
The library only signs and verifies with `RS256`, `PS256`, `ES256`, and `EdDSA`. **`HS*` and `none` are structurally absent** — there is no enum value for them and `internal/jose.ParseAlgorithm` returns `ok=false` for those strings. This closes RFC 7519 §6 / RFC 8725 §2.1 algorithm-confusion attacks at the type level, not via runtime if-statements.
:::

## `WithCookieKey`

```go
key := make([]byte, 32) // exactly 32 bytes
if _, err := rand.Read(key); err != nil { /* … */ }
op.WithCookieKey(key)

// Multi-key rotation:
op.WithCookieKeys(currentKey, previousKey)
```

The 32 bytes seed an AES-256-GCM cipher used to encrypt session and CSRF cookies. Keys rotate with `WithCookieKeys`: the first key is used to encrypt; subsequent keys are tried for decryption so a rolling key swap doesn't bounce active sessions.

::: warning Cookie scheme is non-negotiable
Cookies always use the `__Host-` prefix (no `Domain`, `Path=/`, `Secure`). `SameSite=Lax` for the session, double-submit + Origin / Referer check on the consent / logout POST. None of this is configurable — it's the floor.
:::

## What's not required (but you almost always want)

- `op.WithStaticClients(...)` or `op.WithDynamicRegistration(...)` — without one of these, no client can authenticate.
- `op.WithAuthenticators(...)` — defines how the OP verifies a user. The default is "no authenticator", which means login always fails.
- `op.WithLoginFlow(...)` — composes authenticators + rules into the step-up policy (e.g. password → TOTP, password → captcha-after-N-fails).

See the [Use cases](/use-cases/) for production-shaped wirings.
