---
title: Prometheus metrics
description: Curated business metrics on your registry — without the OP mounting /metrics.
---

# Use case — Prometheus metrics

You want OIDC-business metrics (tokens issued, refresh rotations, audit event counts) on your existing Prometheus stack — but you don't want the library mounting `/metrics` for you, because that's *your router's* job.

> **Source:** [`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics)

## The contract

```go
import (
  "github.com/prometheus/client_golang/prometheus"
  "github.com/prometheus/client_golang/prometheus/promhttp"
  "github.com/libraz/go-oidc-provider/op"
)

reg := prometheus.NewRegistry()

provider, err := op.New(
  /* required options */
  op.WithPrometheus(reg), // <-- the library registers its collectors here
)

// You mount /metrics on your router, on the same registry:
mux := http.NewServeMux()
mux.Handle("/", provider)
mux.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
```

::: warning Lib is business-only, not HTTP-lifecycle
The library emits **OIDC business** counters — token issuance, refresh rotation, audit event counts, authentication outcomes. It does **not** emit:

- HTTP request duration histograms
- HTTP request / response sizes
- Status-code distribution
- Panic recovery counters

These are the embedder's responsibility because they're not OIDC domain — they're HTTP-server domain. Wrap your router with `promhttp.InstrumentHandler*` middleware (or `otelhttp.NewMiddleware` for tracing) according to your SRE conventions.
:::

## What the library exports

The exported counter set is curated and stable. The actual names are prefixed `oidc_*` — see the example for the live list. Categories:

| Category | Counters / labels |
|---|---|
| Token endpoint | `oidc_token_issued_total{grant_type,client_id}`, `oidc_tokens_refreshed_total{client_id}`, refresh / authorization-code replay detections, client-auth failures by method and reason |
| Authentication | login attempts by result and authenticator |
| Extension flows | DCR, Device Authorization, Device Code, CIBA, and Token Exchange event counters, labelled by the audit event sub-name |
| Logout / revocation | back-channel delivery outcomes, no-session fan-out gaps, token / refresh-chain / grant revocation side-effect failures |
| Operational signals | introspection authentication errors, DPoP loose-method-case bridge admissions, retired JWKS `kid` presentation |

The metrics bridge is fed from the audit emitter. A single audit event updates the slog stream and the matching counter, so embedders do not need to emit metrics separately.

Dynamic clients are deliberately not exposed as raw `client_id` label values. Only statically seeded client IDs are labelled; DCR-created or unknown clients collapse into the empty `client_id` bucket to keep cardinality bounded.

## Why on-the-side, not bundled

Two reasons:

1. **Registry ownership** — embedders frequently maintain a single `prometheus.Registry` for their whole process so cardinality and collector-list audits stay in one place. Mounting our own would split that.
2. **Path / auth ownership** — `/metrics` is often gated by auth or only exposed on a separate listener. We can't predict the embedder's choice; you mount the path.

The same separation holds for tracing: `op.WithLogger` / `op.WithAuditLogger` take a `*slog.Logger`, OpenTelemetry spans for HTTP server semantics belong to the embedder's `otelhttp.NewMiddleware`. The OP only emits **business spans** when the embedder configures tracing — never request/response lifecycle spans.
