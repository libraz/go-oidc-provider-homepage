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

| Category | Counters / gauges |
|---|---|
| Token endpoint | tokens issued / refreshed by grant_type, refresh-reuse detections, client-auth failures |
| Authorization endpoint | authorize requests by error code, PAR submissions, JAR validations |
| Audit | event counts by event type (`AuditTokenIssued`, `AuditTokenRefreshed`, `AuditLoginSuccess`, `AuditMFASuccess`, `AuditBCLNoSessionsForSubject`, …) |
| Discovery | requests, JWKS rotation events |
| DCR | registrations, updates, deletes (when feature.DynamicRegistration is on) |
| Logout | RP-Initiated terminations, back-channel deliveries by outcome |

## Why on-the-side, not bundled

Two reasons:

1. **Registry ownership** — embedders frequently maintain a single `prometheus.Registry` for their whole process so cardinality and collector-list audits stay in one place. Mounting our own would split that.
2. **Path / auth ownership** — `/metrics` is often gated by auth or only exposed on a separate listener. We can't predict the embedder's choice; you mount the path.

The same separation holds for tracing: `op.WithLogger` / `op.WithAuditLogger` take a `*slog.Logger`, OpenTelemetry spans for HTTP server semantics belong to the embedder's `otelhttp.NewMiddleware`. The OP only emits **business spans** when the embedder configures tracing — never request/response lifecycle spans.
