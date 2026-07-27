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

<svg role="img" aria-labelledby="hcr-arch-title" viewBox="0 14 728 220" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="hcr-arch-title">The composite store adapter routes durable substores to the SQL/MySQL backend and volatile substores to the Redis backend.</title>
  <marker id="hcr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M1 1 L9 5 L1 9" stroke-width="1.6"/>
  </marker>

  <!-- op.Provider (the OP — brand accent) -->
  <rect class="hcr-accent" x="8" y="100" width="132" height="50" rx="6"/>
  <text class="hcr-m hcr-accent-t" x="74" y="129" text-anchor="middle">op.Provider</text>

  <!-- composite splitter -->
  <rect x="176" y="100" width="144" height="50" rx="6"/>
  <text class="hcr-m" x="248" y="120" text-anchor="middle">storeadapter/</text>
  <text class="hcr-m" x="248" y="137" text-anchor="middle">composite</text>

  <!-- op -> composite -->
  <path d="M140 125 H172" marker-end="url(#hcr-arrow)"/>

  <!-- durable branch -->
  <path d="M320 118 C 370 118 384 52 448 52" marker-end="url(#hcr-arrow)"/>
  <text class="hcr-edge" x="386" y="42" text-anchor="middle">durable substores</text>
  <rect x="452" y="27" width="132" height="50" rx="6"/>
  <text class="hcr-m" x="518" y="47" text-anchor="middle">storeadapter/</text>
  <text class="hcr-m" x="518" y="64" text-anchor="middle">sql</text>
  <path d="M584 52 H615" marker-end="url(#hcr-arrow)"/>
  <g class="hcr-db">
    <path d="M620 39 V65 A50 7 0 0 0 720 65 V39"/>
    <ellipse cx="670" cy="39" rx="50" ry="7"/>
  </g>
  <text class="hcr-t" x="670" y="57" text-anchor="middle">MySQL</text>

  <!-- volatile branch -->
  <path d="M320 132 C 370 132 384 198 448 198" marker-end="url(#hcr-arrow)"/>
  <text class="hcr-edge" x="386" y="212" text-anchor="middle">volatile substores</text>
  <rect x="452" y="173" width="132" height="50" rx="6"/>
  <text class="hcr-m" x="518" y="193" text-anchor="middle">storeadapter/</text>
  <text class="hcr-m" x="518" y="210" text-anchor="middle">redis</text>
  <path d="M584 198 H615" marker-end="url(#hcr-arrow)"/>
  <g class="hcr-db">
    <path d="M620 185 V211 A50 7 0 0 0 720 211 V185"/>
    <ellipse cx="670" cy="185" rx="50" ry="7"/>
  </g>
  <text class="hcr-t" x="670" y="203" text-anchor="middle">Redis</text>
</svg>

The composite store enforces a transactional-cluster invariant: substores that need to commit atomically together (e.g. `AuthorizationCodeStore` and `RefreshTokenStore`) **must** be on the same backend. The composite constructor refuses configurations that would split a transactional cluster.

## Code

```go
import (
  "context"

  "github.com/libraz/go-oidc-provider/op"
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

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(combined),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithStaticClients(op.PublicClient{
    ID:           "demo-rp",
    RedirectURIs: []string{"https://rp.example.com/callback"},
    Scopes:       []string{"openid", "profile"},
  }),
)
```

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
| `SessionStore` | route to either tier with `composite.With(composite.Sessions, ...)`; declare your placement intent via `WithSessionDurabilityPosture` (default `SessionDurabilityVolatile`) so the back-channel logout audit signal classifies expected vs unexpected gaps |
| `InteractionStore` | volatile (Redis) |
| `ConsumedJTIStore` | volatile (Redis) |

::: info Why some short-lived substores stay on the durable side
`PushedAuthRequestStore`, `OpaqueAccessTokenStore`, and `GrantRevocationStore` are part of the transactional cluster (`composite.TxClusterKinds`): each one commits or CAS-updates in the same consistency domain as the auth-code, grant, or refresh-token write that drives it. PAR is the counter-intuitive one — the `request_uri` it holds is short-lived and high-churn, so it *looks* like volatile state, but the OP consumes it inside the authorization-code path, and splitting it onto a separate backend would fracture that domain. The Redis adapter returns `nil` from all three accessors, so the composite splitter cannot route them to a non-transactional backend; embedders who need any of them configure SQL on the durable side. `op.New` refuses to start a PAR-enabled profile whose routed `PushedAuthRequests()` is nil. The default revocation strategy (`RevocationStrategyGrantTombstone`) requires `GrantRevocations()` to be non-nil at `op.New`, so a Redis-only deployment that wants to leave the durable side empty must explicitly pin `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` (non-FAPI only — FAPI profiles reject `None`).
:::

::: details Why SessionStore can be either
A volatile session store (eviction under memory pressure, no replication guarantees) is acceptable for many deployments — the worst case is a user re-authenticating. Some embedders want stronger guarantees so they can audit log-in state through restarts. Routing is the embedder's call (set via `composite.With(composite.Sessions, durable_or_volatile_store)`); `op.WithSessionDurabilityPosture(SessionDurabilityVolatile | SessionDurabilityDurable)` is a *declaration* the library does not enforce — it just propagates the value into the back-channel logout `bcl.no_sessions_for_subject` audit event so SOC dashboards distinguish "expected gap under volatile placement" from "unexpected gap under durable placement."
:::

## Observability

The volatile-tier hit rate, cache evictions, and SQL pool stats are best exposed via the metrics each backend ships natively (`redis_*` exporter, your SQL pool's metrics) — the OP does not duplicate them. The OP emits *business* counters (token issuance, refresh rotation, audit events) on the registry you pass to `op.WithPrometheus`.
