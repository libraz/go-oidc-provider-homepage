---
title: Operations guide
description: Production-running concerns the library does not solve for you — key rotation, multi-instance fan-out, observability wiring, backup posture.
---

# Operations guide

The library deliberately stays out of HTTP-lifecycle and infra concerns: there is no `/metrics` route mounted, no opinion about how keys live in your cluster, no built-in tracer. This section documents the seams the OP exposes and how production embedders typically wire them.

## What lives here

| Page | When you need it |
|---|---|
| [Key rotation](/operations/key-rotation) | rotating signing keys (`Keyset`) and cookie keys (`WithCookieKey`) without dropping live sessions |
| [JWKS endpoint](/operations/jwks) | what `/jwks` advertises, cache headers, ETag, RP cache behaviour |
| [Multi-instance deployment](/operations/multi-instance) | running more than one OP replica — DPoP nonce sharing, session placement, sticky vs round-robin |
| [Observability](/operations/observability) | logging (`*slog.Logger`), tracing (`otelhttp` middleware), Prometheus, request-IDs |
| [Backup & disaster recovery](/operations/backup) | what to back up, what to skip, RPO targets per substore |

## Out of scope (and why)

| Concern | Why the library doesn't ship it |
|---|---|
| `/metrics` HTTP route | your router's job; the library exposes counters via `WithPrometheus(reg)` and lets you mount `/metrics` where it fits your auth boundary |
| HTTP request-duration histograms | belongs in HTTP middleware (`otelhttp`, `prometheus/promhttp`); the OP only emits OIDC-business counters |
| Tracing instrumentation inside endpoint handlers | the public surface is an `http.Handler`; wrap with `otelhttp.NewMiddleware` once at the seam |
| Rate limiting | upstream — Cloudflare, Envoy, or a Go middleware of your choice. The OP emits `rate_limit.exceeded` audit events when *something* in the chain rejects a request, but does not implement the limiter itself |
| Health checks | embedder territory; the OP has no opinion about liveness vs readiness for your stack |
| Background workers | the OP is stateless across requests; no internal goroutines for cleanup. TTL-based eviction is the store's responsibility |

## Operational philosophy

A handful of decisions cascade through every page in this section:

1. **One backend per transactional cluster.** The composite store refuses to split clients / codes / refresh tokens / access tokens / IATs across two backends — see [Hot/cold split](/use-cases/hot-cold-redis).
2. **Volatile substores are best-effort.** Sessions, DPoP nonces, JAR `jti` registry can live on Redis without persistence. Eviction is a normal operating mode; the OP audits the gap rather than failing open. See [Multi-instance deployment](/operations/multi-instance).
3. **No background goroutines.** TTL cleanup is the store's job. SQL adapters do periodic prune via your DB scheduler; Redis adapters use native TTL. There is no in-process janitor that could leak on hot-reload.
4. **Configuration changes require a new `Provider`.** Rotating keys, adding clients, changing scopes — all of these construct a new `*Provider` and replace the handler. See [Key rotation](/operations/key-rotation) for the supervisor-side pattern.

## Where to start

If you've never run the OP in production, read these in order:

1. [Key rotation](/operations/key-rotation) — the most common ops cadence (monthly, quarterly).
2. [Multi-instance deployment](/operations/multi-instance) — required reading before scaling past one replica.
3. [Observability](/operations/observability) — wire logging / metrics / tracing on day one rather than after an incident.
4. [Backup & DR](/operations/backup) — at least set the RPO targets before you go live.
