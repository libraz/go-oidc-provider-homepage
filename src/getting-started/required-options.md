---
title: Required options
description: The options op.New refuses to start without — and why each one matters.
pageClass: pg-getting-started-required-options
---

# Required options

`op.New(...)` rejects partial configurations at construction time, so an unsafe OP cannot accidentally take traffic. Three options are unconditionally required. `WithCookieKeys` joins them whenever the `authorization_code` grant is enabled — and the default grant set enables it.

<figure class="fig">
  <div class="fig-head">Three always, and a fourth with the code grant</div>
  <svg class="fig-svg" role="img" aria-labelledby="req-opts-title" viewBox="0 0 960 300" xmlns="http://www.w3.org/2000/svg">
    <title id="req-opts-title">Three options are always required: the issuer, the store, and the keyset. Cookie keys become required in addition as soon as the authorization_code grant is enabled, because that grant is the one that puts state in a browser.</title>
    <text class="fg-lbl" x="40" y="26">always required</text>
    <rect class="fg-box" x="36" y="38" width="284" height="132" rx="8"/>
    <text class="fg-m" x="56" y="66">op.WithIssuer</text>
    <line class="fg-rule" x1="56" y1="80" x2="300" y2="80"/>
    <text class="fg-xs" x="56" y="102">the iss claim on every token</text>
    <text class="fg-xs" x="56" y="122">the discovery URL</text>
    <text class="fg-xs" x="56" y="142">the scope the cookies are set on</text>
    <rect class="fg-box" x="340" y="38" width="284" height="132" rx="8"/>
    <text class="fg-m" x="360" y="66">op.WithStore</text>
    <line class="fg-rule" x1="360" y1="80" x2="604" y2="80"/>
    <text class="fg-xs" x="360" y="102">authorization codes · sessions</text>
    <text class="fg-xs" x="360" y="122">clients · refresh chains</text>
    <text class="fg-xs" x="360" y="142">consumed-JTI sets</text>
    <rect class="fg-box" x="644" y="38" width="280" height="132" rx="8"/>
    <text class="fg-m" x="664" y="66">op.WithKeyset</text>
    <line class="fg-rule" x1="664" y1="80" x2="904" y2="80"/>
    <text class="fg-xs" x="664" y="102">ES256 signing keys for the</text>
    <text class="fg-xs" x="664" y="122">ID token, JWT access tokens</text>
    <text class="fg-xs" x="664" y="142">and JARM responses</text>
    <text class="fg-lbl fg-accent" x="40" y="206">and this one, once the authorization_code grant is enabled</text>
    <rect class="fg-box fg-box--accent" x="36" y="218" width="888" height="70" rx="8"/>
    <text class="fg-m fg-accent" x="56" y="246">op.WithCookieKeys</text>
    <line class="fg-rule" x1="56" y1="258" x2="904" y2="258"/>
    <text class="fg-xs" x="56" y="278">AES-256-GCM sealing for the session and CSRF cookies — the only grant that puts state in a browser</text>
  </svg>
  <figcaption class="fig-note">The fourth is conditional rather than optional. Leave it out with the code grant enabled and <code>op.New</code> refuses at start-up, rather than issuing unsealed cookies and finding out in production.</figcaption>
</figure>

| Option | Why it's required |
|---|---|
| [`op.WithIssuer`](#withissuer) | Defines the JWT `iss` claim, the discovery URL, and the cookie scope. Get this wrong and every downstream check is wrong. |
| [`op.WithStore`](#withstore) | Where authcodes, sessions, refresh chains, JTI replay sets, and clients live. The library is storage-agnostic; without a store it has nowhere to put state. |
| [`op.WithKeyset`](#withkeyset) | The signing keys for ID tokens / JWT access tokens / JARM. The library refuses to mint tokens without an ECDSA P-256 `crypto.Signer` that can produce `ES256` signatures. |
| [`op.WithCookieKeys`](#withcookiekeys) | 32 bytes of random material used as an AES-256-GCM key for cookie payloads. Required only when the enabled grants include `authorization_code` (the default grant set is `authorization_code` + `refresh_token`); a client-credentials-only OP with that grant disabled can boot without it. Session and CSRF cookies are encrypted, not just signed. |

## `WithIssuer`

```go
op.WithIssuer("https://op.example.com")
```

::: warning Issuer validation: specification and library policy
OIDC Discovery 1.0 §3 requires an HTTPS issuer URL without a query or fragment and requires its metadata `issuer` value to match exactly. This library additionally rejects trailing slashes, uppercase scheme or host, default ports (`:443` for HTTPS, `:80` for HTTP), and non-canonical paths (`..`, `.`, or duplicate slashes). For local development, it permits plain HTTP only on loopback IP literals (`127.0.0.0/8`, `[::1]`); `localhost` needs an explicit opt-in. The HTTP exception is library policy, not an exception in OIDC Discovery.

`internal/discovery.ValidateIssuer` enforces the shape as defense-in-depth over the option setter. A typo (trailing slash, `:443`, uppercase host, etc.) will fail `op.New`, not silently produce a discovery document RPs reject. The strictness gives deployments one spelling for the issuer used in RFC 9207 comparisons. See [Issuer](/concepts/issuer) for the full canonical-form discussion.
:::

## `WithStore`

```go
op.WithStore(inmem.New())
// or
op.WithStore(myCompositeStore)
```

The `store.Store` interface is the union of small substore interfaces (`AuthorizationCodeStore`, `RefreshTokenStore`, `SessionStore`, `ClientStore`, …). You usually compose a store from one of the bundled adapters:

- [`op/storeadapter/inmem`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/inmem) — every substore in memory. Reference + dev + tests.
- [`op/storeadapter/sql`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql) — durable substores against `database/sql`.
- [`op/storeadapter/dynamodb`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/dynamodb) — bundled full store for DynamoDB.
- [`op/storeadapter/redis`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/redis) — volatile tier (`InteractionStore`, `ConsumedJTIStore`) for use through `composite`.
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

A `Keyset` is a slice of `{KeyID, Signer}` records. `Signer` must implement `crypto.Signer` and expose an ECDSA P-256 public key. A vault / KMS handle is fine as long as the public key is P-256 and signatures verify as `ES256`; RSA and Ed25519 OP signing keys are rejected at `op.New`.

::: warning Algorithm allow-list
OP-issued JWTs are signed with `ES256` only. Inbound JOSE verification for client assertions, JAR request objects, and DPoP proofs uses the library's closed allow-list (`RS256`, `PS256`, `ES256`, `EdDSA`) where each protocol permits it. **`HS*` and `none` are structurally absent** — there is no enum value for them and `internal/jose.ParseAlgorithm` returns `ok=false` for those strings. This closes RFC 7519 §6 / RFC 8725 §2.1 algorithm-confusion attacks at the type level, not via runtime if-statements.
:::

## `WithCookieKeys`

```go
key := make([]byte, 32) // exactly 32 bytes
if _, err := rand.Read(key); err != nil { /* … */ }
op.WithCookieKeys(key)

// Multi-key rotation:
op.WithCookieKeys(currentKey, previousKey)
```

The 32 bytes seed an AES-256-GCM cipher used to encrypt session and CSRF cookies. Keys rotate with `WithCookieKeys`: the first key is used to encrypt; subsequent keys are tried for decryption so a rolling key swap doesn't bounce active sessions. `op.New` only enforces this option when the `authorization_code` grant is among the enabled grants — that grant is on by default, so most configurations need it, but an OP restricted to, say, `client_credentials` alone can start without cookie keys.

::: warning Cookie scheme is non-negotiable
Cookies always use the `__Host-` prefix (no `Domain`, `Path=/`, `Secure`). `SameSite=Lax` for the session, double-submit + Origin / Referer check on the consent / logout POST. None of this is configurable — it's the floor.
:::

## What's not required (but you almost always want)

- `op.WithStaticClients(...)` or `op.WithDynamicRegistration(...)` — without one of these, no client can authenticate.
- `op.WithAuthenticators(...)` — defines how the OP verifies a user. The default is "no authenticator", which means login always fails.
- `op.WithLoginFlow(...)` — composes authenticators + rules into the step-up policy (e.g. password → TOTP, password → captcha-after-N-fails).

See the [Use cases](/use-cases/) for production-shaped wirings.
