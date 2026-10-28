---
title: Multi-instance deployment
description: Running multiple OP replicas with shared sessions, device-code attempt limiters, DPoP nonces, and orderly detached-logout shutdown.
outline: 2
pageClass: pg-operations-multi-instance
---

# Multi-instance deployment

The OP is stateless across HTTP requests; every replica reads and writes through the configured `store.Store`. Going from one replica to N shifts the question from "what is in process memory" to "what must every replica see, what may be lost, and how does a logout reach every RP".

<figure class="fig">
  <div class="fig-head">N replicas, one store, one volatile tier</div>
  <svg class="fig-svg" role="img" aria-labelledby="multi-instance-title" viewBox="0 0 960 552" xmlns="http://www.w3.org/2000/svg">
    <title id="multi-instance-title">A replica topology. A load balancer spreads one client's requests across several OP replicas, which share a single durable store and a single volatile Redis tier. Because a nonce may be issued by one replica and checked by another, that state has to live outside the process.</title>
    <!-- client -->
    <rect class="fg-box" x="304" y="24" width="352" height="72" rx="8"/>
    <text class="fg-t" x="320" y="52">RP / client</text>
    <text class="fg-mxs" x="320" y="76">POST /token · GET /userinfo</text>
    <path class="fg-edge" d="M480,96 V136" marker-end="url(#fg-a)"/>
    <!-- load balancer -->
    <rect class="fg-box" x="304" y="136" width="352" height="72" rx="8"/>
    <text class="fg-t" x="320" y="164">Load balancer</text>
    <text class="fg-s" x="320" y="188">round-robin, no session affinity</text>
    <path class="fg-leader" d="M480,208 V232 M168,232 H792"/>
    <path class="fg-edge fg-edge--thin" d="M168,232 V256" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M480,232 V256" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M792,232 V256" marker-end="url(#fg-a)"/>
    <!-- OP #1 -->
    <rect class="fg-box fg-box--accent" x="32" y="256" width="272" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="284">OP #1</text>
    <text class="fg-s" x="48" y="308">issues a DPoP nonce</text>
    <!-- OP #2 -->
    <rect class="fg-box fg-box--accent" x="344" y="256" width="272" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="284">OP #2</text>
    <text class="fg-s" x="360" y="308">holds nothing of its own</text>
    <!-- OP #3 -->
    <rect class="fg-box fg-box--accent" x="656" y="256" width="272" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="672" y="284">OP #3</text>
    <text class="fg-s" x="672" y="308">checks that same nonce</text>
    <path class="fg-leader" d="M168,328 V352 M480,328 V352 M792,328 V352 M168,352 H792"/>
    <path class="fg-edge fg-edge--thin" d="M248,352 V376" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M712,352 V376" marker-end="url(#fg-a)"/>
    <!-- durable store -->
    <rect class="fg-box" x="32" y="376" width="432" height="96" rx="8"/>
    <text class="fg-t" x="48" y="404">Durable store, shared</text>
    <text class="fg-mxs" x="48" y="428">clients · codes · tokens · grants</text>
    <text class="fg-mxs" x="48" y="452">issued-at records · PAR requests</text>
    <!-- volatile tier -->
    <rect class="fg-box" x="496" y="376" width="432" height="96" rx="8"/>
    <text class="fg-t" x="512" y="404">Volatile tier, Redis</text>
    <text class="fg-mxs" x="512" y="428">Sessions · Interactions · ConsumedJTIs</text>
    <text class="fg-mxs" x="512" y="452">DPoP nonces (your source)</text>
    <!-- eviction caveat -->
    <rect class="fg-pill fg-pill--warn" x="496" y="496" width="336" height="32" rx="8"/>
    <text class="fg-s" x="664" y="517" text-anchor="middle">all but ConsumedJTIs may be evicted</text>
  </svg>
  <figcaption class="fig-note">No replica is special and none of them remember anything, which is what lets the load balancer stay dumb. The price is that every piece of cross-request state has to be somewhere both boxes at the bottom can see.</figcaption>
</figure>

## What's shared automatically

Anything routed to the same external backend from every replica is shared. In a composite store, the seven `composite.TxClusterKinds` members — authorization codes, refresh tokens, grants, PARs, JWT access-token registrations, opaque access tokens, and grant-revocation tombstones — must use one comparable `store.Transactional` backend. These substores sit outside that cluster and may be routed separately:

- clients
- sessions
- users
- IATs / RATs
- device codes
- CIBA requests
- interactions
- consumed JTIs
- metadata

Production replicas must still use shared placement wherever cross-replica visibility is required.

The in-memory store (`inmem`) is process-local, so with more than one replica `Sessions` and `Interactions` must sit on a shared backend: SQL, DynamoDB, or Redis.

The substores the Redis adapter implements are `Sessions`, `Interactions`, and `ConsumedJTIs` (the JAR / DPoP / private_key_jwt replay set); see [Hot/cold split](/use-cases/hot-cold-redis). `Sessions` and `Interactions` tolerate eviction. `ConsumedJTIs` does not: evicting a live marker reopens the replay window it closed, so run it on a `noeviction` Redis instance or on a durable backend. The DPoP server-nonce store is a separate seam wired through `op.WithDPoPNonceSource`, not a substore.

The authn-factor lockout counter wired through `op.WithAuthnLockoutStore` is not part of the `store.Store` substore set either, so attach it explicitly. The bundled SQL and DynamoDB adapters provide durable, replica-shared implementations through `storage.AuthnLockouts()`:

```go
op.WithAuthnLockoutStore(storage.AuthnLockouts())
```

`inmem.Store.AuthnLockouts()` is process-local: it resets on restart and gives each replica its own guess budget. An embedder using another backend must provide a durable, shared `store.AuthnLockoutStore` when cross-factor brute-force lockout must survive restarts and be consistent across replicas.

Device-code verification has the same distinction between record state and attempt state. `devicecodekit.VerifyUserCode` and `VerifyUserCodeByUserCode` use the shared device-code store for record-bound flows. For a first-entry manual page that does not yet know a `device_code`, use `devicecodekit.VerifyUserCodeByAttemptKey` with an opaque, stable ceremony key (for example a browser-session or account-scoped key). Supply a shared `devicecodekit.AttemptLimiter` in `devicecodekit.Deps`; the default `InMemoryAttemptLimiter` is per-process and gives each replica a separate budget. A distributed limiter's `Allow` operation must atomically compare-and-increment; reset the key only from the authenticated ceremony owner.

## What needs explicit attention

| Concern | Single replica | N replicas |
|---|---|---|
| DPoP server nonce | in-memory reference source ships with the library | needs distributed source |
| Session cookies | encrypted with `WithCookieKeys`; shared across replicas as long as the key matches | same — every replica must share the cookie key |
| Session records | any store | a shared store (SQL, DynamoDB, Redis); `inmem` is per process |
| Interaction state (`/interaction/{uid}`) | any store, including `inmem` | a shared store (SQL, Redis) or sticky routing |
| Rate limiting | upstream / out-of-process | upstream / out-of-process |
| OFCS conformance harness | runs against one OP | runs against one OP — point at one replica or the load balancer |

## DPoP server-nonce store

`op.NewInMemoryDPoPNonceSource` is single-process. Behind a load balancer that round-robins requests, the nonce a replica issues at `/token` won't be recognised by the replica that handles the next `/userinfo`.

Two paths:

1. **Disable the server-nonce flow.** Don't pass `WithDPoPNonceSource`. Clients then proceed without server-supplied nonces. This is fine when you don't need RFC 9449 §8 hardening, but the FAPI 2.0 Message Signing and FAPI-CIBA profiles require a source, and `op.New` refuses to start without one while DPoP is enabled.
2. **Plug a distributed source.** Implement `op.DPoPNonceSource` against a shared store (Redis, Memcached). The library deliberately does not ship a Redis nonce source — the option matrix (TTL, rotation cadence, missed-rotation tolerance) is too specific to operator setup.

```go
// Sketch — wrap a Redis-backed implementation behind the seam.
// op.DPoPNonceSource is two methods; the source decides its own
// rotation cadence and validity window.
type redisNonces struct{ rdb *redis.Client }

func (r *redisNonces) IssueNonce() string         { /* ... */ }
func (r *redisNonces) Validate(nonce string) bool { /* ... */ }

op.WithDPoPNonceSource(&redisNonces{rdb: client})
```

With a source wired, `/token`, `/par`, and `/userinfo` reject a DPoP proof whose `nonce` claim is missing or not accepted, answering `use_dpop_nonce` with a fresh value in the `DPoP-Nonce` header. See [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) for that handshake with the in-memory source; a production replacement implements the same interface.

## Session placement

Sessions can live durably (SQL) or volatile (Redis without persistence). The trade-off:

| Placement | Pros | Cons |
|---|---|---|
| Durable (SQL) | survives restart / failover, so the browser logout trigger can still resolve its subject and session snapshot; RP targets come from grants, not a session list | every login round-trips your DB write |
| Volatile (Redis) | low write latency; no DB hot row | eviction on restart / `maxmemory` can lose the browser logout trigger before the snapshot; once a snapshot exists, RP targets still come from grants, not `SessionStore` rows |

Use `WithSessionDurabilityPosture(...)` to declare the choice (the default is volatile); the value is stamped on `bcl.no_sessions_for_subject`, which records a session-bearing logout with zero grant-derived RP targets. The library does not constrain placement. Durable placement protects the browser logout trigger and the pre-fan-out snapshot across restart and failover. Volatile eviction can lose that trigger before the fan-out starts. Once a snapshot exists, target resolution is grant-derived rather than a walk of `SessionStore` rows; the posture gives SOC dashboards context for trigger loss versus a no-target outcome.

## Interaction state

A login in progress (`/interaction/{uid}`) keeps its state in the `store.InteractionStore`, and the browser carries the `uid` in the sealed `__Host-oidc_interaction` cookie. With the in-memory store that state is process-local. With N replicas you have two options:

1. **Sticky routing on the load balancer.** Send every request for the same `uid` (it is in the path) to the same replica. Simple, but a replica failure mid-login surfaces as a generic error to the user.
2. **Shared interaction store.** Use the SQL adapter, or the Redis adapter in the volatile slice of a [composite store](/use-cases/hot-cold-redis). Any replica can resume any login. This is the default recommendation for production.

## Graceful shutdown and detached logout

RP-initiated logout may leave Back-Channel Logout deliveries running after the browser response. Stop the HTTP server before draining the provider:

```go
srv.Shutdown(ctx)      // stop accepting
provider.Shutdown(ctx) // then drain detached fan-out
```

`WithBackchannelFanOutBudget` bounds one whole detached fan-out (30 seconds by default), while `WithBackchannelLogoutTimeout` bounds each RP request independently (5 seconds by default). `Provider.Shutdown(ctx)` waits for fan-outs already in flight and does not stop the provider from serving, which is why the HTTP server stops first. Use the shared session and grant stores on every replica so target resolution is consistent during the drain.

## Cookie key consistency

Every replica MUST share the same `WithCookieKeys` slice. A replica holding a different key cannot open cookies it didn't seal and treats the browser as signed out, so at scale this looks like random user logouts.

Source the key from your secret manager and inject it identically into every replica:

```go
key, err := loadFromSecretManager("/op/cookie/current")
if err != nil { log.Fatal(err) }
op.WithCookieKeys(key)
```

A rolling deploy makes rotation across N replicas a three-step rollout, because a replica must be able to open a cookie before any other replica starts sealing with its key:

1. Deploy `WithCookieKeys(old, new)` everywhere. Nothing seals with `new` yet, but every replica can open it.
2. Deploy `WithCookieKeys(new, old)`. Replicas now seal with `new` and still open old cookies.
3. After the longest session has ended, deploy `WithCookieKeys(new)`.

See [Key rotation](/operations/key-rotation) for the cadence and the overlap length.

## Load-balancer affinity

| Endpoint | Affinity needed? |
|---|---|
| `/.well-known/openid-configuration`, `/jwks` | no — pure read |
| `/auth`, `/par`, `/end_session` | no, **if** interaction and session state live in a shared store; yes if process-local |
| `/token`, `/userinfo`, `/introspect`, `/revoke` | no |
| `/device_authorization`, `/bc-authorize` | no |
| `/register`, `/register/{client_id}` | no |
| `/interaction/{uid}` | sticky to the replica the `/auth` redirect landed on, **unless** the interaction store is shared |

Paths are the defaults, relative to the mount prefix (`/oidc` by default). The simplest production shape is round-robin everywhere with a shared interaction store. The next simplest is sticky routing on the `uid` with process-local interaction state.

## Health checks

The OP itself does not mount a health endpoint. Common patterns:

- **Liveness:** any 2xx from `/.well-known/openid-configuration`. The discovery doc renders without store access.
- **Readiness:** include a store ping. The library does not expose a store-wide health method — implement one in your embedder layer:

```go
func ready(store *MyComposite) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
        defer cancel()
        if err := store.Ping(ctx); err != nil {
            http.Error(w, err.Error(), http.StatusServiceUnavailable)
            return
        }
        w.WriteHeader(http.StatusOK)
    }
}
```

Mount on a separate path (`/healthz/ready`) and exclude it from the public router.

## Capacity planning

What each endpoint costs per request, to help you decide what to measure:

| Endpoint | Dominant cost |
|---|---|
| `/jwks`, discovery | static JSON, no store access; CDN-friendly |
| `/auth` (no interaction) | store writes for the code and the session |
| `/token` (authorization_code) | ID-token signature, plus store writes and a user lookup |
| `/token` (refresh_token) | signature plus the rotation write, in one transaction |
| `/userinfo` | access-token verification plus a user lookup |

The bottleneck is almost always the durable store rather than the OP, and a KMS-backed signer adds its own latency to every signature (see [JWKS endpoint](/operations/jwks#hsm-kms-integration)). Load-test against your own store before sizing; this library publishes no throughput figures.

## What you can't do with multiple instances

- **Run two OPs against one transactional store with different configurations.** The discovery document, scope catalog, alg list, and grant set must agree across replicas. Differences cause RP-visible drift (a token a replica issues another rejects).
- **Split `composite.TxClusterKinds` across two backends.** The composite adapter rejects a split cluster, a non-comparable cluster backend, or an anchor that does not implement `store.Transactional`. Durable kinds outside that cluster may be routed separately when their own consistency and availability requirements are met. See [Hot/cold split](/use-cases/hot-cold-redis).
