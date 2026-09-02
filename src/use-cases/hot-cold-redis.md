---
title: Hot/cold split (Redis volatile)
description: Route volatile substores to Redis, durable substores to SQL — the canonical production deployment shape.
pageClass: pg-use-cases-hot-cold-redis
---

# Use case — Hot/cold split (Redis volatile)

## What does "hot/cold" mean here?

OPs hold two very different shapes of state:

- **Cold (durable)** — long-lived rows you cannot afford to lose: registered clients, user records, refresh-token chains, persistent sessions.
- **Hot (volatile)** — short-lived rows with high churn that are acceptable to lose: in-flight `request_uri` from PAR (RFC 9126), consumed JTI replay set (RFC 7519), interaction state for half-completed logins.

Putting both in the same backend is wasteful: durable storage doesn't need the QPS the volatile state generates, and volatile storage doesn't need the durability guarantees the cold state requires. The composite adapter lets you split them.

One nuance the table below makes precise: *volatile-shaped* data and *volatile-tier* placement are different axes. Most short-lived state (the JTI replay set, interaction state) routes to the volatile tier, but the PAR `request_uri` does not — it is losable in isolation, yet the OP consumes it inside the atomic authorization-code path, so it belongs to the transactional cluster and routes to the durable tier. Data shape suggests a tier; the cluster invariant overrides it.

::: details Specs referenced on this page
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR — `request_uri` is volatile state)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JWT, including `jti` (replay-set state)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security BCP, §4.14 (refresh-token rotation)
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — session state
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) — fan-out at logout time
:::

::: details Vocabulary refresher
- **Durability posture** — Whether a substore *must* survive process restart and replica fail-over. Refresh-token chains, registered clients, and durable sessions are durable; PAR `request_uri`, JTI replay set, and in-flight interaction state are acceptable to lose. The split is not aesthetic — durable storage doesn't need volatile-tier QPS, and volatile storage doesn't need durable-tier guarantees.
- **Transactional cluster** — A group of substores that must commit atomically together (e.g. issuing an `auth_code` and the corresponding refresh-token chain). Splitting them across backends would risk a half-committed state where one row is durable and the other isn't. The composite constructor refuses configurations that would split a cluster.
- **`jti`** — A unique JWT identifier (RFC 7519). The OP keeps a "consumed JTI" set per JWT-bearing surface (request objects, client assertions, DPoP proofs) to prevent replay. The set is ephemeral — short TTLs match each spec's reuse window — so volatile storage is the natural fit.
:::

`op/storeadapter/composite` is the splitter. It accepts a "durable" store and a "volatile" store, routes each substore to the appropriate side, and refuses configurations that would break a transactional cluster (substores that must commit atomically together).

> **Sources:** - [`examples/08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold) — SQLite durable + inmem volatile, runs as a single `go run -tags example .` invocation. - [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) — MySQL durable + Redis volatile, shipped as a docker-compose stack pinned to `mysql:8.4` and `redis:7.4-alpine` so adapter contract tests and the example share one engine matrix.

## Architecture

<figure class="fig">
  <div class="fig-head">One store interface, two backends behind it</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-hotcold-title" viewBox="0 0 960 240" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-hotcold-title">The composite adapter routes each substore to a backend: the durable ones to SQL, the high-churn volatile ones to Redis. The provider sees a single store either way.</title>
    <text class="fg-lbl" x="596" y="30">durable substores</text>
    <text class="fg-lbl" x="596" y="228">volatile substores</text>
    <rect class="fg-box" x="36" y="90" width="210" height="64" rx="8"/>
    <text class="fg-t2" x="56" y="116">op.Provider</text>
    <text class="fg-xs" x="56" y="138">sees one store</text>
    <path class="fg-edge" d="M250,122 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="300" y="90" width="220" height="64" rx="8"/>
    <text class="fg-m fg-accent" x="320" y="116">composite</text>
    <text class="fg-xs" x="320" y="138">routes each substore</text>
    <path class="fg-leader" d="M524,122 H556 M556,64 V180"/>
    <path class="fg-edge fg-edge--thin" d="M556,64 H592" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M556,180 H592" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="596" y="40" width="154" height="48" rx="6"/>
    <text class="fg-mxs" x="612" y="60">storeadapter/</text>
    <text class="fg-mxs" x="612" y="76">sql</text>
    <path class="fg-edge fg-edge--thin" d="M754,64 H790" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="794" y="40" width="130" height="48" rx="6"/>
    <text class="fg-t2" x="812" y="60">MySQL</text>
    <text class="fg-xs" x="812" y="78">survives a restart</text>
    <rect class="fg-box" x="596" y="156" width="154" height="48" rx="6"/>
    <text class="fg-mxs" x="612" y="176">storeadapter/</text>
    <text class="fg-mxs" x="612" y="192">redis</text>
    <path class="fg-edge fg-edge--thin" d="M754,180 H790" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="794" y="156" width="130" height="48" rx="6"/>
    <text class="fg-t2" x="812" y="176">Redis</text>
    <text class="fg-xs" x="812" y="194">expected to lose rows</text>
  </svg>
  <figcaption class="fig-note">The split follows what each substore costs when it disappears. Sessions and nonce caches can be rebuilt by asking the user to sign in again; a grant cannot.</figcaption>
</figure>

The composite store enforces a transactional-cluster invariant: substores that need to commit atomically together (e.g. `AuthorizationCodeStore` and `RefreshTokenStore`) **must** be on the same backend. The composite constructor refuses configurations that would split a transactional cluster.

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

// composite.New takes functional options. WithDefault routes every
// Kind to the durable backend; With(kind, store) overrides the named
// substore. composite.New rejects configurations that would split a
// transactional cluster (composite.TxClusterKinds) across backends.
combined, err := composite.New(
  composite.WithDefault(durable),
  composite.With(composite.Sessions, volatile),
  composite.With(composite.Interactions, volatile),
  composite.With(composite.ConsumedJTIs, volatile),
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
`op.WithStaticClients` accepts a `*composite.Store` directly. The composite deliberately does **not** satisfy `store.ClientRegistry` through a type assertion (a read-only routed `Clients` backend would otherwise be silently coerced into a registry); instead it exposes an optional `ClientRegistry()` accessor that `op.WithStaticClients` probes at wiring time. Embedders therefore do not need to seed against the durable backend before wrapping it in a composite. If the routed `Clients` backend is read-only the probe returns `(nil, false)` and `op.New` rejects the configuration with the same `store.ClientRegistry required` error a directly-supplied read-only store would produce.
:::

## Redis safety floor

::: warning No plaintext Redis by default
`redis.New` **refuses to start** without TLS (`rediss://`) and AUTH. The library does not let you ship a setup that flies your refresh-token chain across the wire in plaintext. The escape hatch `redis.WithDevModeAllowPlaintext(callback)` exists for `examples/` runs and local development; using it in production is a security regression you have to type out by hand.
:::

## What goes where (default split)

| Substore | Tier |
|---|---|
| `ClientStore` | durable (SQL) |
| `UserStore` | durable (SQL) |
| `AuthorizationCodeStore` | durable (SQL — short-lived but in transactional cluster) |
| `RefreshTokenStore` | durable (SQL) |
| `AccessTokenRegistry` | durable (SQL — populated only under `RevocationStrategyJTIRegistry`) |
| `OpaqueAccessTokenStore` | durable (SQL — populated only when opaque AT format is configured) |
| `GrantRevocationStore` | durable (SQL — backs the default grant-tombstone revocation) |
| `PushedAuthRequestStore` | durable (SQL — `request_uri` is short-lived but in the transactional cluster) |
| `SessionStore` | route to either tier with `composite.With(composite.Sessions, ...)`; declare the durability of the logout trigger and session snapshot via `WithSessionDurabilityPosture` (default `SessionDurabilityVolatile`), while BCL targets remain grant-derived |
| `InteractionStore` | volatile (Redis) |
| `ConsumedJTIStore` | volatile (Redis) |

::: info Why some short-lived substores stay on the durable side
`PushedAuthRequestStore`, `OpaqueAccessTokenStore`, and `GrantRevocationStore` are part of the transactional cluster (`composite.TxClusterKinds`): each one commits or CAS-updates in the same consistency domain as the auth-code, grant, or refresh-token write that drives it. PAR is the counter-intuitive one — the `request_uri` it holds is short-lived and high-churn, so it *looks* like volatile state, but the OP consumes it inside the authorization-code path, and splitting it onto a separate backend would fracture that domain. The Redis adapter returns `nil` from all three accessors, so the composite splitter cannot route them to a non-transactional backend; embedders who need any of them configure SQL on the durable side. `op.New` refuses to start a PAR-enabled profile whose routed `PushedAuthRequests()` is nil. The default revocation strategy (`RevocationStrategyGrantTombstone`) requires `GrantRevocations()` to be non-nil at `op.New`. A Redis-only deployment that wants to leave the durable side empty therefore has to pin `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` explicitly. That escape hatch is non-FAPI only: FAPI profiles reject `None`.
:::

::: details Why SessionStore can be either
A volatile session store (eviction under memory pressure, no replication guarantees) is acceptable for many deployments — the worst case is a user re-authenticating. Some embedders want stronger durability so browser login state and the logout trigger/session snapshot survive restarts. Routing is the embedder's call (set via `composite.With(composite.Sessions, durable_or_volatile_store)`). `op.WithSessionDurabilityPosture(SessionDurabilityVolatile | SessionDurabilityDurable)` is a *declaration* the library does not enforce; it describes the durability of that logout trigger/session snapshot, not the BCL audience. `/end_session` snapshots the session before notifying, while eligible RP targets are derived independently from `GrantStore.ListClientIDsBySubject`. `bcl.no_sessions_for_subject` means a session-bearing logout notice found zero grant-derived RP targets; if eviction happens before the snapshot, neither the back-channel notification nor the audit event occurs. Keep trigger/snapshot durability findings separate from grant-derived zero-target events in SOC dashboards.
:::

## Observability

The volatile-tier hit rate, cache evictions, and SQL pool stats are best exposed via the metrics each backend ships natively (`redis_*` exporter, your SQL pool's metrics) — the OP does not duplicate them. The OP emits *business* counters (token issuance, refresh rotation, audit events) on the registry you pass to `op.WithPrometheus`.
