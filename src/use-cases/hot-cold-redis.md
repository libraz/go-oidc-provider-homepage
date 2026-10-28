---
title: Hot/cold split (Redis volatile)
description: Route volatile substores to Redis, durable substores to SQL — the canonical production deployment shape.
pageClass: pg-use-cases-hot-cold-redis
---

# Use case — Hot/cold split (Redis volatile)

## What does "hot/cold" mean here?

OPs hold two very different shapes of state:

- **Cold (durable)** — rows you cannot afford to lose: registered clients, user records, grants, refresh-token chains, access-token revocation records.
- **Hot (volatile)** — short-lived, high-churn rows whose loss costs the user a retry: interaction state for half-completed logins (a user who loses it starts the login again) and, if you accept re-authentication after a cache flush, browser sessions.

Putting both in the same backend is wasteful: durable storage doesn't need the QPS the volatile state generates, and volatile storage doesn't need the durability guarantees the cold state requires. The composite adapter lets you split them.

Two kinds of short-lived data do not follow that rule, and the table below makes both precise. The PAR `request_uri` (RFC 9126) is short-lived, but the OP consumes it inside the atomic authorization-code path, so it belongs to the transactional cluster and stays on the durable tier. The consumed-`jti` replay set (RFC 7519) is short-lived too, but evicting a live marker reopens the replay window it exists to close, so it needs a durable backend or a Redis instance that never evicts. Data lifetime suggests a tier; the cluster invariant and the loss cost decide.

::: details Specs referenced on this page
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR — the `request_uri` is short-lived but consumed in the transactional cluster)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JWT, including `jti` (the replay set)
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — session state
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) — fan-out at logout time
:::

::: details Vocabulary refresher
- **Durability posture** — Whether a substore *must* survive process restart and replica fail-over. Refresh-token chains, registered clients, grants, and the replay set are durable; in-flight interaction state is acceptable to lose, and sessions are your call.
- **Transactional cluster** — A group of substores that must commit atomically together (e.g. issuing an `auth_code` and the corresponding refresh-token chain). Splitting them across backends would risk a half-committed state where one row is durable and the other isn't. The composite constructor refuses configurations that would split a cluster.
- **`jti`** — A unique JWT identifier (RFC 7519). The OP keeps a "consumed JTI" set per JWT-bearing surface (request objects, client assertions, DPoP proofs) to prevent replay. Each marker expires on its own short TTL, but it must stay until then: a marker evicted early lets a captured proof replay. Use a durable backend, or a Redis instance with `maxmemory-policy noeviction`.
:::

`op/storeadapter/composite` is the splitter. It accepts a "durable" store and a "volatile" store, routes each substore to the appropriate side, and refuses configurations that would break a transactional cluster (substores that must commit atomically together).

> **Sources:**
> - [`examples/08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold) — SQLite durable + in-memory volatile, runs as a single `go run -tags example .` invocation.
> - [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) — MySQL durable + Redis volatile (sessions and interactions), shipped as a docker-compose stack pinned to `mysql:8.4` and `redis:7.4-alpine`, the engine versions the adapter contract tests use.

## Architecture

<figure class="fig">
  <div class="fig-head">One store interface, two backends behind it</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-hotcold-title" viewBox="0 0 960 272" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-hotcold-title">The composite adapter routes each substore to a backend: the durable ones to SQL, the high-churn volatile ones to Redis. The provider sees a single store either way.</title>
    <!-- provider -->
    <rect class="fg-box" x="32" y="100" width="200" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="128">op.Provider</text>
    <text class="fg-xs" x="48" y="152">sees one store</text>
    <path class="fg-edge" d="M232,136 H280" marker-end="url(#fg-a)"/>
    <!-- composite -->
    <rect class="fg-box fg-box--accent" x="280" y="100" width="200" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="296" y="128">composite</text>
    <text class="fg-xs" x="296" y="152">routes each substore</text>
    <!-- routes -->
    <path class="fg-leader" d="M480,136 H520 M520,72 V200"/>
    <path class="fg-edge" d="M520,72 H720" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="620" y="62" text-anchor="middle">durable substores</text>
    <path class="fg-edge" d="M520,200 H720" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="620" y="190" text-anchor="middle">volatile substores</text>
    <!-- mysql -->
    <rect class="fg-box" x="720" y="24" width="208" height="96" rx="8"/>
    <text class="fg-t2" x="736" y="52">MySQL</text>
    <text class="fg-mxs" x="736" y="76">storeadapter/sql</text>
    <text class="fg-xs" x="736" y="100">survives a restart</text>
    <!-- redis -->
    <rect class="fg-box" x="720" y="152" width="208" height="96" rx="8"/>
    <text class="fg-t2" x="736" y="180">Redis</text>
    <text class="fg-mxs" x="736" y="204">storeadapter/redis</text>
    <text class="fg-xs" x="736" y="228">expected to lose rows</text>
  </svg>
  <figcaption class="fig-note">The split follows what each substore costs when it disappears. Sessions and half-finished logins can be rebuilt by asking the user to sign in again; a grant cannot.</figcaption>
</figure>

The composite store enforces a transactional-cluster invariant: substores that need to commit atomically together (e.g. `AuthorizationCodeStore` and `RefreshTokenStore`) **must** be on the same backend. `composite.New` returns `composite.ErrTxClusterSplit` for a configuration that would split the cluster.

## Code

```go
import (
  "context"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/composite"
  oidcredis "github.com/libraz/go-oidc-provider/op/storeadapter/redis"
  oidcsql "github.com/libraz/go-oidc-provider/op/storeadapter/sql"
)

durable, err := oidcsql.New(db, oidcsql.MySQL())
if err != nil { /* ... */ }

volatile, err := oidcredis.New(context.Background(),
  oidcredis.WithDSN("rediss://redis:6380/0"), // TLS required by default
  oidcredis.WithRedisAuth(redisUsername, redisPassword),
)
if err != nil { /* ... */ }

// WithDefault routes every Kind to the durable backend; With(kind, store)
// overrides the named substore. ConsumedJTIs stays on the default: its
// replay markers must not be evicted (see "Redis server requirements").
// composite.New rejects configurations that would split a transactional
// cluster (composite.TxClusterKinds) across backends.
combined, err := composite.New(
  composite.WithDefault(durable),
  composite.With(composite.Sessions, volatile),
  composite.With(composite.Interactions, volatile),
)
if err != nil { /* ... */ }

loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: durable.UserPasswords()}}

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(combined),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithGrants(grant.AuthorizationCode, grant.RefreshToken),
  op.WithStaticClients(op.PublicClient{
    ID:           "demo-rp",
    RedirectURIs: []string{"https://rp.example.com/callback"},
    Scopes:       []string{"openid", "profile"},
  }),
)
```

## Construction checks and expired writes

`composite.New` validates the closed `Kind` set before it builds routes. If `With` names an unknown integer, `New` returns `composite.ErrInvalidKind`; it does not silently send that value to `WithDefault`. Every valid `Kind` must resolve to an override or default, otherwise construction returns `composite.ErrKindNotRouted`. All members of `composite.TxClusterKinds` must resolve to the same backend, whose dynamic type must be comparable; a value store containing a map, slice, or function is rejected with `composite.ErrBackendNotComparable`, so route such stores through a pointer. The shared transaction anchor must implement `store.Transactional`; otherwise construction returns `composite.ErrTxAnchorNotTx`.

`store.SessionStore.Save` and `store.InteractionStore.Save` may decline an already-expired record when no live record exists, but a past-dated replacement must take effect when a live record does exist: after a successful save, `Find` must not return the previous live record. The Redis adapter removes the old key for an already-expired input; adapters that retain an expired row must still filter it on reads. Treating an expired replacement as a silent no-op can leave an old session or interaction active.

::: info Static client seeding through composite
`op.WithStaticClients` accepts a `*composite.Store` directly. The composite deliberately does **not** satisfy `store.ClientRegistry` or `store.StaticClientReconciler` through a type assertion, because a read-only routed `Clients` backend would then be silently coerced into a writable one. It exposes optional `ClientRegistry()` and `StaticClientReconciler()` accessors instead, which `op.New` probes at wiring time. You do not need to seed against the durable backend before wrapping it in a composite. If the routed `Clients` backend cannot reconcile, `op.New` rejects `WithStaticClients` with an error naming `store.StaticClientReconciler`.
:::

## Redis safety floor

::: warning No plaintext Redis by default
`oidcredis.New` **refuses to start** without TLS (`rediss://`) and AUTH. The library does not let you ship a setup that sends session and interaction state across the wire in plaintext. The escape hatch `oidcredis.WithDevModeAllowPlaintext(callback)` exists for `examples/` runs and local development; using it in production is a security regression you have to type out by hand.
:::

## Redis server requirements

The Redis adapter needs Redis 7.0 or newer (the session chooser-group index uses `EXPIRE ... NX` and `EXPIRE ... GT`). Its credential needs more than read/write on the keyspace, or the adapter builds, connects, and then fails on the first request that needs the missing command:

- `+@scripting` — the replay marker and the interaction compare-and-swap are Lua scripts.
- `+@string`, `+@keyspace`, `+@set`, `+@hash`, `+@transaction` — key reads and writes, the chooser-group set, the metadata hash, and the `MULTI`/`EXEC` of a session write.
- `+@connection` — the `PING` the constructor uses to fail fast.

The eviction policy depends on which substores share the instance:

| Substores on the instance | Acceptable `maxmemory-policy` | Why |
|---|---|---|
| `Sessions`, `Interactions` only | `volatile-*` or `allkeys-*` | Losing a row costs the user a re-login |
| plus `ConsumedJTIs` | `noeviction` | Evicting a live replay marker lets a captured DPoP or `private_key_jwt` proof replay until it expires |
| plus `Metadata` | not `allkeys-*` | The key holds the subject-issuance mode and has no TTL; losing it disables the public/pairwise switch check |

Because `ConsumedJTIs` forces `noeviction`, the simplest layout keeps it on the durable side, as the example does. The Redis `Store` only implements these four substores; every other accessor returns `nil`, so it cannot be passed to `op.WithStore` on its own and is always paired with a durable backend through `composite`.

## What goes where (default split)

| Substore | Tier |
|---|---|
| `ClientStore` | durable (SQL) |
| `UserStore` | durable (SQL) |
| `AuthorizationCodeStore` | durable (SQL — short-lived but in transactional cluster) |
| `RefreshTokenStore` | durable (SQL) |
| `GrantStore` | durable (SQL — in transactional cluster) |
| `AccessTokenRegistry` | durable (SQL — populated only under `RevocationStrategyJTIRegistry`) |
| `OpaqueAccessTokenStore` | durable (SQL — populated only when opaque AT format is configured) |
| `GrantRevocationStore` | durable (SQL — backs the default grant-tombstone revocation) |
| `PushedAuthRequestStore` | durable (SQL — `request_uri` is short-lived but in the transactional cluster) |
| `ConsumedJTIStore` | durable (SQL), or Redis only on a `noeviction` instance |
| `MetadataStore` | durable (SQL) by default; Redis keeps it without a TTL |
| `DeviceCodeStore`, `CIBARequestStore`, registration-token stores | durable (SQL — the Redis adapter does not implement them) |
| `InteractionStore` | volatile (Redis) |
| `SessionStore` | route to either tier with `composite.With(composite.Sessions, ...)`; declare the durability of the logout trigger and session snapshot via `WithSessionDurabilityPosture` (default `SessionDurabilityVolatile`), while BCL targets remain grant-derived |

::: info Why some short-lived substores stay on the durable side
`PushedAuthRequestStore`, `OpaqueAccessTokenStore`, and `GrantRevocationStore` are part of the transactional cluster (`composite.TxClusterKinds`, with the authorization-code, grant, refresh-token, and access-token registry stores): each one commits or CAS-updates in the same consistency domain as the write that drives it. PAR is the counter-intuitive one. The `request_uri` it holds is short-lived and high-churn, so it *looks* like volatile state, but the OP consumes it inside the authorization-code path, and splitting it onto another backend would fracture that domain. The Redis adapter returns `nil` for all of them, so the composite splitter cannot route them to Redis. `op.New` refuses to start a PAR-enabled profile whose routed `PushedAuthRequests()` is `nil`, and the default revocation strategy (`RevocationStrategyGrantTombstone`) requires `GrantRevocations()` to be non-nil. Pinning `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` skips the second requirement, but only outside FAPI profiles, which reject `None`.
:::

::: details Why SessionStore can be either
A volatile session store (eviction under memory pressure, no replication guarantees) is acceptable for many deployments — the worst case is a user re-authenticating. Some embedders want stronger durability so browser login state and the logout trigger/session snapshot survive restarts. Routing is the embedder's call (set via `composite.With(composite.Sessions, durable_or_volatile_store)`). `op.WithSessionDurabilityPosture(SessionDurabilityVolatile | SessionDurabilityDurable)` is a *declaration* the library does not enforce; it describes the durability of that logout trigger/session snapshot, not the BCL audience. `/end_session` snapshots the session before notifying, while eligible RP targets are derived independently from `GrantStore.ListClientIDsBySubject`. `bcl.no_sessions_for_subject` means a session-bearing logout notice found zero grant-derived RP targets; if eviction happens before the snapshot, neither the back-channel notification nor the audit event occurs. Keep trigger/snapshot durability findings separate from grant-derived zero-target events in SOC dashboards.
:::

## Observability

The volatile-tier hit rate, cache evictions, and SQL pool stats are best exposed via the metrics each backend ships natively (`redis_*` exporter, your SQL pool's metrics) — the OP does not duplicate them. The OP emits *business* counters (token issuance, refresh rotation, audit events) on the registry you pass to `op.WithPrometheus`.
