---
title: Operations guide
description: Production-running concerns the library leaves to you — key rotation, multi-instance deployment, observability wiring, backup and storage maintenance.
---

# Operations guide

The library deliberately stays out of HTTP-lifecycle and infra concerns: there is no `/metrics` route mounted, no opinion about how keys live in your cluster, no built-in tracer. This section documents the seams the OP exposes and how production embedders typically wire them.

::: tip Terms used in this section
**OP** is the provider you run (this library). **RP** is a client application that signs users in through it. The **embedder** is you: the team whose Go program imports the library and mounts the OP. A **substore** is one of the storage interfaces under `store.Store` (clients, grants, sessions, and so on), and **JWKS** is the public key set the OP publishes at `/jwks`.
:::

## What lives here

| Page | When you need it |
|---|---|
| [Key rotation](/operations/key-rotation) | rotating signing keys (`Keyset`) and cookie keys (`WithCookieKeys`) without dropping live sessions |
| [JWKS endpoint](/operations/jwks) | what `/jwks` advertises, cache headers, ETag, RP cache behaviour |
| [Multi-instance deployment](/operations/multi-instance) | running more than one OP replica — DPoP nonce sharing, session placement, sticky vs round-robin |
| [Observability](/operations/observability) | logging (`*slog.Logger`), tracing (`otelhttp` middleware), Prometheus, request-IDs |
| [Backup & disaster recovery](/operations/backup) | what to back up, what to skip, RPO targets per substore |
| [Storage maintenance](/operations/storage-maintenance) | applying SQL schema changes in order, scheduling retention GC, watching the sweep |

## Out of scope (and why)

| Concern | Why the library doesn't ship it |
|---|---|
| `/metrics` HTTP route | your router's job; the library exposes counters via `WithPrometheus(reg)` and lets you mount `/metrics` where it fits your auth boundary |
| HTTP request-duration histograms | belongs in HTTP middleware (`otelhttp`, `prometheus/promhttp`); the OP only emits OIDC-business counters |
| Tracing instrumentation inside endpoint handlers | the public surface is an `http.Handler`; wrap with `otelhttp.NewMiddleware` once at the seam |
| Rate limiting | upstream — Cloudflare, Envoy, or a Go middleware of your choice. The OP defines the `rate_limit.exceeded` audit-event constant as shared vocabulary for that middleware to emit; the OP does not fire the event itself, nor does it implement the limiter |
| Health checks | embedder territory; the OP has no opinion about liveness vs readiness for your stack |
| Background workers | the OP is stateless across requests and runs no cleanup job. Expiring old rows is the store's responsibility |

## Operational philosophy

A handful of decisions cascade through every page in this section:

1. **One backend per transactional cluster.** The composite store refuses to split authorization codes, refresh tokens, grants, PARs, JWT and opaque access tokens, and grant revocations across two backends. See [Hot/cold split](/use-cases/hot-cold-redis).
2. **Sessions and interactions may be volatile; the replay set may not.** `Sessions` and `Interactions` can live on Redis without persistence, and eviction is a normal operating mode: the OP records the gap in the audit stream instead of failing open. `ConsumedJTIs` (the replay-defence set) is the exception. Evicting a live entry reopens the replay window it closed, so it needs a `noeviction` Redis or a durable backend. See [Multi-instance deployment](/operations/multi-instance).
3. **No cleanup job in the OP.** Expiring old rows is the store's job. The SQL adapter exposes `GC` for your scheduler to call, and the Redis adapter uses native TTLs. The only detached work is back-channel logout delivery, which `Provider.Shutdown` drains.
4. **Configuration changes require a new `Provider`.** Rotating keys, changing the statically seeded clients or scopes: each constructs a new `*Provider` and replaces the handler. See [Key rotation](/operations/key-rotation) for the supervisor-side pattern.

## Where to start

If you have never run the OP in production, read these in order:

1. [Key rotation](/operations/key-rotation) — the most common ops cadence (monthly, quarterly).
2. [Multi-instance deployment](/operations/multi-instance) — required reading before scaling past one replica.
3. [Observability](/operations/observability) — wire logging, metrics, and tracing on day one rather than after an incident.
4. [Backup & DR](/operations/backup) — at least set the RPO targets before you go live.
5. [Storage maintenance](/operations/storage-maintenance) — before you apply the first schema change to a live database.
