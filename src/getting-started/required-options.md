---
title: Required options
description: The options op.New refuses to start without — and why each one matters.
pageClass: pg-getting-started-required-options
---

# Required options

`op.New(...)` rejects partial configurations at construction time, so an unsafe OP cannot take traffic by accident. Three options are always required. Two more join them whenever the `authorization_code` grant is enabled, and the default grant set enables it: `WithCookieKeys` and `WithLoginFlow` (or its older sibling `WithAuthenticators`).

<figure class="fig">
  <div class="fig-head">Three always, and two with the code grant</div>
  <svg class="fig-svg" role="img" aria-labelledby="req-opts-title" viewBox="0 0 960 328" xmlns="http://www.w3.org/2000/svg">
    <title id="req-opts-title">Three options are always required: the issuer, the store, and the keyset. Cookie keys and a login flow become required in addition as soon as the authorization_code grant is enabled, because that grant puts a user and a browser in the loop.</title>
    <text class="fg-lbl" x="32" y="40">always required</text>
    <rect class="fg-box" x="32" y="56" width="272" height="96" rx="8"/>
    <text class="fg-m" x="48" y="84">op.WithIssuer</text>
    <text class="fg-s" x="48" y="108">iss claim on every token</text>
    <text class="fg-s" x="48" y="132">discovery and endpoint URLs</text>
    <rect class="fg-box" x="344" y="56" width="272" height="96" rx="8"/>
    <text class="fg-m" x="360" y="84">op.WithStore</text>
    <text class="fg-s" x="360" y="108">codes · sessions · clients</text>
    <text class="fg-s" x="360" y="132">refresh chains · JTI sets</text>
    <rect class="fg-box" x="656" y="56" width="272" height="96" rx="8"/>
    <text class="fg-m" x="672" y="84">op.WithKeyset</text>
    <text class="fg-s" x="672" y="108">ES256 keys: ID tokens, JARM</text>
    <text class="fg-s" x="672" y="132">and JWT access tokens</text>
    <text class="fg-lbl fg-accent" x="32" y="192">and these two, once the authorization_code grant is enabled</text>
    <rect class="fg-box" x="32" y="208" width="428" height="96" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="236">op.WithCookieKeys</text>
    <text class="fg-s" x="48" y="260">AES-256-GCM sealing of the session</text>
    <text class="fg-s" x="48" y="284">and CSRF cookies</text>
    <rect class="fg-box" x="500" y="208" width="428" height="96" rx="8"/>
    <text class="fg-m fg-accent" x="516" y="236">op.WithLoginFlow</text>
    <text class="fg-s" x="516" y="260">how a user signs in: a Primary step</text>
    <text class="fg-s" x="516" y="284">plus rules that add factors</text>
  </svg>
  <figcaption class="fig-note">The last two are conditional rather than optional. Leave either out with the code grant enabled and <code>op.New</code> refuses at start-up, instead of issuing unsealed cookies or answering every sign-in with a server error in production.</figcaption>
</figure>

| Option | Why it's required |
|---|---|
| [`op.WithIssuer`](#withissuer) | Defines the JWT `iss` claim, the discovery URL and the endpoint URLs, and the origin that login and logout pages accept requests from. Get this wrong and every downstream check is wrong. |
| [`op.WithStore`](#withstore) | Holds authorization codes, sessions, refresh chains, JTI replay sets and clients. The library is storage-agnostic, so without a store it has nowhere to put state. |
| [`op.WithKeyset`](#withkeyset) | The signing keys for ID tokens, JWT access tokens and JARM. The library refuses to mint tokens without an ECDSA P-256 `crypto.Signer` that produces `ES256` signatures. |
| [`op.WithCookieKeys`](#withcookiekeys) | 32 bytes of random material that key AES-256-GCM for the cookie payloads. Required when the enabled grants include `authorization_code` (the default grant set is `authorization_code` + `refresh_token`). An OP that serves only `client_credentials` can start without it. Session and CSRF cookies are encrypted, not just signed. |
| [`op.WithLoginFlow`](#withloginflow) | Says how a user proves who they are. Required when the grants include `authorization_code`: without it no user can sign in, and `op.New` refuses rather than failing on the first real request. |

## `WithIssuer`

```go
op.WithIssuer("https://op.example.com")
```

The issuer is the OP's identity: a URL that appears as `iss` in every token and as the prefix of the discovery URL. Relying parties compare it byte for byte, so the library accepts only one spelling.

::: warning Issuer validation: specification and library policy
OIDC Discovery 1.0 §3 requires an HTTPS issuer URL without a query or fragment, and requires the `issuer` value in the metadata to match it exactly. This library additionally rejects trailing slashes, uppercase scheme or host, default ports (`:443` for HTTPS, `:80` for HTTP), and non-canonical paths (`..`, `.`, or duplicate slashes). For local development it permits plain HTTP only on loopback IP literals (`127.0.0.0/8`, `[::1]`); the textual host `localhost` needs the explicit opt-in `op.WithAllowLocalhostLoopback()`. The HTTP exception is library policy, not an exception in OIDC Discovery.

The check runs inside `op.New` (`internal/discovery.ValidateIssuer`), so a typo fails startup instead of producing a discovery document that relying parties reject. The strictness gives every deployment one spelling of the issuer for RFC 9207 comparisons. See [Issuer](/concepts/issuer) for the full canonical form.
:::

## `WithStore`

```go
op.WithStore(inmem.New())
// or
op.WithStore(myCompositeStore)
```

The `store.Store` interface is the union of small substore interfaces (`AuthorizationCodeStore`, `RefreshTokenStore`, `SessionStore`, `ClientStore`, …). Most deployments start from one of the bundled adapters:

- [`op/storeadapter/inmem`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/inmem): every substore in memory. For reference, development and tests.
- [`op/storeadapter/sql`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql): durable substores on `database/sql` (SQLite, MySQL, Postgres).
- [`op/storeadapter/dynamodb`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/dynamodb): a full store on DynamoDB (experimental).
- [`op/storeadapter/redis`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/redis): the volatile tier (`SessionStore`, `InteractionStore`, `ConsumedJTIStore`), used through `composite`.
- [`op/storeadapter/composite`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/composite): a hot/cold splitter that routes durable substores to one backend and volatile substores to another.

::: tip BYO storage
The store interfaces are small on purpose, so you can implement them on whatever you already run: Cassandra, Spanner, etcd, or a Redis cluster with your own conventions. The contract test suite at `op/store/contract` checks a store against the same expectations the bundled adapters meet.

Some behaviour is opt-in through optional interfaces and extra record fields. A store that implements `store.OpaqueAccessTokenChainRevoker` and `store.IssuanceRevocationChecker`, and persists `ChainID` and the per-authorization fields, gets revocation scoped to one refresh chain. A store without them keeps working and revokes at the grant level, which can also end the user's other sessions on the same client.
:::

## `WithKeyset`

```go
priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
op.WithKeyset(op.Keyset{
  {KeyID: "k1", Signer: priv},
})
```

A `Keyset` is a slice of `{KeyID, Signer}` records. `Signer` must implement `crypto.Signer` and expose an ECDSA P-256 public key. A vault or KMS handle works as long as the public key is P-256 and its signatures verify as `ES256`; `op.New` rejects RSA and Ed25519 signing keys. The first entry signs new tokens. Later entries stay in the JWKS so relying parties can still verify older tokens, which is how you rotate a key.

::: warning Algorithm allow-list
The OP signs its JWTs with `ES256` only. When it verifies client assertions, JAR request objects and DPoP proofs, it uses a closed allow-list (`RS256`, `PS256`, `ES256`, `EdDSA`) wherever the protocol allows it. **`HS*` and `none` are structurally absent**: no enum value exists for them, and `internal/jose.ParseAlgorithm` returns `ok=false` for those strings. That closes the algorithm-confusion attacks of RFC 7519 §6 and RFC 8725 §2.1 in the type system instead of in runtime `if` statements.
:::

## `WithCookieKeys`

```go
key := make([]byte, 32) // exactly 32 bytes
if _, err := rand.Read(key); err != nil { /* … */ }
op.WithCookieKeys(key)

// Key rotation:
op.WithCookieKeys(currentKey, previousKey)
```

The 32 bytes key an AES-256-GCM cipher that encrypts the session and CSRF cookies. The first key encrypts; the remaining keys are tried for decryption only, so a rolling key swap does not sign active users out. `op.New` enforces this option only when the `authorization_code` grant is enabled. That grant is on by default, so most configurations need cookie keys, but an OP restricted to `client_credentials` starts without them.

::: warning The cookie scheme is fixed
Cookies always carry the `__Host-` prefix (no `Domain`, `Path=/`, `Secure`). The session cookie is `SameSite=Lax` and the CSRF cookies are `SameSite=Strict`, with a double-submit token plus an Origin / Referer check on the consent and logout POSTs. None of this is configurable; it is the minimum the library will run at.
:::

## `WithLoginFlow`

```go
op.WithLoginFlow(op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
})
```

A `LoginFlow` declares how a user signs in: one `Primary` step that identifies the user, and optional `Rules` that add steps such as TOTP when a condition holds. `PrimaryPassword` checks a password against a `store.UserPasswordStore`; the in-memory adapter's `UserPasswords()` is the simplest one. Production code points it at its own user table.

`op.New` also refuses a flow that cannot work:

- A `Primary` that needs a user an earlier step already identified (`PrimaryPasskey`, `StepTOTP`, `StepEmailOTP`, `StepRecoveryCode`). Use `PrimaryPassword` or an `ExternalStep` as `Primary`, and put the others in `Rules`.
- `WithLoginFlow` together with `WithAuthenticators`. They configure the same chain in two shapes, so pick one.

`op.LoginFlow` and `WithLoginFlow` are marked `Experimental:`; see [Install](/getting-started/install#stability). [Multi-factor authentication](/use-cases/mfa-step-up) builds on this option.

## Also needed in practice

Starting is not the same as being usable. These options are not required to boot, but nearly every real OP sets them:

- `op.WithStaticClients(...)` or `op.WithDynamicRegistration(...)`: without one of them no client can authenticate. A statically seeded confidential client using `client_secret_basic` or `client_secret_post` must carry a secret, or `op.New` refuses it.
- `op.WithScope(...)`: registers a custom scope such as `api:read`. The standard OIDC scopes need no registration.
- `op.WithAuditLogger(...)` and `op.WithLogger(...)`: send audit events and logs to your own pipeline.

See the [Use cases](/use-cases/) for production-shaped setups.
