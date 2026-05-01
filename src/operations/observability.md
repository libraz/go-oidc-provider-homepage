---
title: Observability
description: Wiring logging, tracing, and Prometheus metrics around the OP.
outline: 2
---

# Observability

Three streams cover what you need to see in production:

| Stream | What it carries | OP-side seam | Embedder-side seam |
|---|---|---|---|
| Operational logs | request errors, config-time issues, startup state | `WithLogger(*slog.Logger)` | your structured-log destination |
| Audit events | every protocol action ([catalog](/reference/audit-events)) | `WithAuditLogger(*slog.Logger)` | SOC pipeline |
| Metrics | OIDC business counters | `WithPrometheus(*prometheus.Registry)` | your `/metrics` route |
| Tracing | request spans | none built-in | `otelhttp.NewMiddleware` around the `http.Handler` |

The library deliberately keeps these decoupled — you can wire any subset.

## Structured logging

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

op.New(
    /* ... */
    op.WithLogger(logger),
)
```

Operational logs cover:

- Configuration warnings at boot.
- Endpoint-internal errors (typically `IsServerError(err)` matches — see [Error catalog](/reference/errors)).
- Store backend failures.

If `WithLogger` is omitted the library discards every record (no fallback to `slog.Default()`). The handler you pass is wrapped with the redaction middleware so OAuth/OIDC secret-shaped attributes (`access_token`, `refresh_token`, `code`, `code_verifier`, `client_secret`, `state`, `nonce`, `dpop`, `authorization`, `cookie`, `set-cookie`, …) are masked before they reach your handler.

## Audit logging

Audit events deserve a separate sink so they can be retained, indexed, and access-controlled differently from ops logs:

```go
auditFile, _ := os.OpenFile("/var/log/op/audit.jsonl",
    os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
auditLogger := slog.New(slog.NewJSONHandler(auditFile, nil))

op.New(
    /* ... */
    op.WithAuditLogger(auditLogger),
)
```

Each event is a JSON line with `msg = "<event.name>"`, plus the common attributes (`request_id`, `subject`, `client_id`, `extras`). See the [Audit event catalog](/reference/audit-events) for the full list.

::: tip One stream, multiple sinks
A single `*slog.Logger` can fan out to file + Loki + Splunk via a multiplexing handler. The OP doesn't care; it just calls `logger.LogAttrs(...)`.
:::

## Prometheus metrics

```go
reg := prometheus.NewRegistry()

op.New(
    /* ... */
    op.WithPrometheus(reg),
)

// Mount /metrics where you want — typically behind your auth boundary,
// not on the public OP listener.
mux := http.NewServeMux()
mux.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
go http.ListenAndServe("127.0.0.1:9090", mux)
```

The library does not mount `/metrics` itself — you choose the route and the access boundary. The counters track the same surface as the audit catalog (a curated subset; see [`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics)).

### What the OP does NOT emit

These belong in HTTP middleware, not in the OP:

- HTTP request duration histograms — use `promhttp.InstrumentHandlerDuration` around the OP handler.
- HTTP status code counters — same.
- In-flight request gauge — same.

Wiring shape:

```go
inFlight := prometheus.NewGauge(prometheus.GaugeOpts{
    Name: "op_http_requests_in_flight",
})
duration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
    Name: "op_http_request_duration_seconds",
}, []string{"code", "method"})
reg.MustRegister(inFlight, duration)

instrumented := promhttp.InstrumentHandlerInFlight(inFlight,
    promhttp.InstrumentHandlerDuration(duration, opHandler))

http.Handle("/", instrumented)
```

This separation lets you replace the HTTP layer (chi, gin, fiber) without touching the OP's metrics.

## Tracing

The OP exposes an `http.Handler`. Wrap it with OpenTelemetry's HTTP middleware once:

```go
import "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

http.Handle("/", otelhttp.NewHandler(opHandler, "oidc-op"))
```

Spans cover the request lifecycle. The library does not currently emit per-endpoint child spans — if you need per-stage traces (e.g. "how long did PKCE verification take inside `/token`") you'll see them only at the HTTP level today.

::: info Future tracing
Per-stage spans are planned but pre-v1.0 the surface is intentionally small. The audit event catalog gives you the same coverage (per-event emission) at the cost of higher cardinality.
:::

## Request IDs

The OP propagates request IDs from `X-Request-ID` and `Traceparent` headers into every audit event and operational log line. If neither header is present, the OP synthesises a UUID per request.

To stamp the same ID on the response (so RP logs can correlate):

```go
http.Handle("/", requestIDMiddleware(opHandler))

func requestIDMiddleware(h http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        rid := r.Header.Get("X-Request-ID")
        if rid == "" {
            rid = newUUID()
            r.Header.Set("X-Request-ID", rid)
        }
        w.Header().Set("X-Request-ID", rid)
        h.ServeHTTP(w, r)
    })
}
```

## Recommended dashboard

A minimum-viable production dashboard surfaces:

| Panel | Source | Alert threshold |
|---|---|---|
| Token-issue rate by `grant_type` | Prometheus counter | sustained drop > 50 % vs baseline |
| 5xx rate at `/token` | HTTP middleware histogram | > 0.5 % over 5 min |
| `refresh.replay_detected` rate | audit log → Loki / ES | > 0 (any non-zero is investigation-worthy) |
| `bcl.no_sessions_for_subject` rate | audit log | spikes against `posture=durable` |
| Active sessions | store query / metric you maintain | drop > 30 % |
| JWKS request rate | HTTP middleware | tracks RP cache health |

The first three are the highest-signal indicators of production trouble. The fourth catches storage drift; the last two catch RP-side regressions.

## Log retention

| Stream | Typical retention |
|---|---|
| Operational | 7 – 30 days |
| Audit | **as long as your compliance regime requires** — typically 1 – 7 years |
| Metrics | 30 – 90 days at high resolution; rolled up indefinitely |

Audit retention is the long-tail cost. Plan storage for it separately — the events are small but high-volume on a busy OP.
