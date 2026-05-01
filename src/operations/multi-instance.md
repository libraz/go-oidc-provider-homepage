---
title: Multi-instance deployment
description: Running more than one OP replica — DPoP nonce sharing, session placement, and the trade-offs behind sticky vs round-robin.
outline: 2
---

# Multi-instance deployment

The OP is stateless across HTTP requests; every replica reads and writes through the configured `op.Store`. Going from one replica to N shifts the conversation from "what's in process memory" to "what's shared, what's volatile, and what fan-out behaviour is acceptable".

## What's shared automatically

Anything that lives in your `op.Store` is shared by construction. The durable substores (clients, codes, refresh tokens, access tokens, grants, IATs) hit a single backend (SQL or your own implementation) across every replica.

Volatile substores (sessions, interactions, JAR `jti` registry, PARs, DPoP server-nonce cache) are eligible for a Redis tier — see [Hot/cold split](/use-cases/hot-cold-redis).

## What needs explicit attention

| Concern | Single replica | N replicas |
|---|---|---|
| DPoP server nonce | in-memory reference source ships with the library | needs distributed source |
| Session cookies | encrypted with `WithCookieKey`; shared across replicas as long as the key matches | same — every replica must share the cookie key |
| Interaction state (`/interaction/{uid}`) | typically in-memory | needs Redis or sticky sessions |
| Rate limiting | upstream / out-of-process | upstream / out-of-process |
| OFCS conformance harness | runs against one OP | runs against one OP — point at one replica or the load balancer |

## DPoP server-nonce store

`op.NewInMemoryDPoPNonceSource` is single-process. Behind a load balancer that round-robins requests, the nonce a replica issues at `/token` won't be recognised by the replica that handles the next `/userinfo`.

Two paths:

1. **Disable the server-nonce flow.** Don't pass `WithDPoPNonceSource`. Clients then proceed without server-supplied nonces. This is the safe default when you don't need RFC 9449 §8 hardening.
2. **Plug a distributed source.** Implement `op.DPoPNonceSource` against a shared store (Redis, Memcached). The library deliberately does not ship a Redis nonce source — the option matrix (TTL, rotation cadence, missed-rotation tolerance) is too specific to operator setup.

```go
// Sketch — wrap a Redis-backed implementation behind the seam.
type redisNonces struct{ rdb *redis.Client }

func (r *redisNonces) Issue(ctx context.Context, /* ... */) (string, error) { /* ... */ }
func (r *redisNonces) Validate(ctx context.Context, /* ... */) error        { /* ... */ }
func (r *redisNonces) Rotate(ctx context.Context, /* ... */)                { /* ... */ }

op.WithDPoPNonceSource(&redisNonces{rdb: client})
```

See [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) for the in-memory shape; the production replacement matches the same interface.

## Session placement

Sessions can live durably (SQL) or volatile (Redis without persistence). The trade-off:

| Placement | Pros | Cons |
|---|---|---|
| Durable (SQL) | survives restart / failover; back-channel logout fan-out can find every session | every login round-trips your DB write |
| Volatile (Redis) | low write latency; no DB hot row | sessions evicted on restart / `maxmemory` — back-channel logout may find zero RPs |

Use `WithSessionDurabilityPosture(...)` to annotate the choice in audit events (`bcl.no_sessions_for_subject` carries the posture). The library does not constrain placement; the posture is for SOC dashboards to distinguish "expected gap under volatile" from "unexpected gap under durable".

## Interaction state

The `/interaction/{uid}/...` flow stores per-attempt state under a `uid` cookie. With a single replica, this can live in process memory. With N replicas, you have two options:

1. **Sticky sessions on the load balancer.** Route every request carrying the same `uid` cookie to the same replica. Simple but replica failure mid-login surfaces as a generic error to the user.
2. **Shared interaction store.** Implement `store.InteractionStore` against Redis (or use the bundled Redis adapter). Any replica can resume any login. This is the default recommendation for production.

The Redis adapter's `InteractionStore` is volatile-eligible and lives in the volatile slice of a [composite store](/use-cases/hot-cold-redis).

## Cookie key consistency

Every replica MUST share the same `WithCookieKey` / `WithCookieKeys` slice. A replica that decrypts with a different key returns `invalid_session` for cookies it didn't encrypt — at scale this looks like random user logouts.

Source the key from your secret manager and inject it identically into every replica:

```go
key, err := loadFromSecretManager("/op/cookie/current")
if err != nil { log.Fatal(err) }
op.WithCookieKey(key)
```

Rotation across N replicas: deploy `WithCookieKeys(new, old)` to every replica simultaneously, then deploy `WithCookieKeys(new)` after the overlap window. See [Key rotation](/operations/key-rotation).

## Load-balancer affinity

| Endpoint | Affinity needed? |
|---|---|
| `/.well-known/openid-configuration`, `/jwks` | no — pure read |
| `/authorize`, `/par`, `/end_session` | no, **if** interaction state lives in shared Redis; yes if process-local |
| `/token`, `/userinfo`, `/introspect`, `/revoke` | no |
| `/register`, `/register/{client_id}` | no |
| `/interaction/{uid}/...` | sticky to the replica the `/authorize` redirect landed on, **unless** Redis-backed |

The simplest production shape: round-robin everywhere + Redis-backed interaction store. The next-simplest: sticky on the `uid` cookie and process-local interaction state.

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

Rough sizing on commodity hardware (sustained throughput, not peak):

| Endpoint | RPS / replica | Bottleneck |
|---|---|---|
| `/jwks`, discovery | several thousand | static JSON; CDN-friendly |
| `/authorize` (no interaction) | low hundreds | DB write for code + session |
| `/token` (authorization_code) | hundreds | crypto for ID-token sign + DB writes |
| `/token` (refresh_token) | several hundred | crypto + rotation write |
| `/userinfo` | several hundred | bearer verify + UserStore lookup |

Numbers are illustrative — your bottleneck is almost always the durable store, not the OP. Profile with `go test -bench` against your own store implementation before sizing.

## What you can't do with multiple instances

- **Run two OPs against one transactional store with different configurations.** The discovery document, scope catalog, alg list, and grant set must agree across replicas. Differences cause RP-visible drift (a token a replica issues another rejects).
- **Split the durable substores across two backends.** The composite store's invariant is "one durable backend"; transactional integrity depends on it. See [Hot/cold split](/use-cases/hot-cold-redis).
