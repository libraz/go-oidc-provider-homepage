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

## Rate limiting and abuse signals

The library does **not** ship a built-in rate limiter on `/authorize`, `/par`, `/token`, `/userinfo`, or any other public endpoint. There is no `WithRateLimit` knob to tune. Rate limiting is the operator's job — a reverse proxy (NGINX, Envoy, Traefik), an edge service (Cloudflare, Fastly), or middleware in front of `op.Handler()` is where per-IP / per-client request budgets belong. Pretending otherwise would set false expectations.

What the library does emit is a set of audit events that an abuse pipeline can consume to score offenders, regardless of where the actual rate enforcement lives:

| Audit event | Constant | What it tells you |
|---|---|---|
| `pkce.violation` | `op.AuditPKCEViolation` | The code exchange failed PKCE verification. Repeat from a single IP / client is a strong signal of an attacker probing a stolen authorization code. |
| `redirect_uri.mismatch` | `op.AuditRedirectURIMismatch` | The presented `redirect_uri` did not match a registered URI. Repeat is reconnaissance against a known `client_id`. |
| `client_authn.failure` | `op.AuditClientAuthnFailure` | Client authentication at `/token`, `/par`, `/introspect`, or `/revoke` failed. Bursts are credential brute-force. |
| `device_code.verification.user_code_brute_force` | `op.AuditDeviceCodeUserCodeBruteForce` | The device-code verification page is being walked through user-code guesses. The `devicecodekit` enforces a built-in per-device-code lockout — see [Device Code](/use-cases/device-code) for the verification helper. |
| `ciba.poll_abuse.lockout` | `op.AuditCIBAPollAbuseLockout` | The CIBA polling counter has crossed the per-`auth_req_id` threshold. The library denies the request on the wire (`access_denied`) and emits the event so SOC tooling can correlate. |
| `rate_limit.exceeded` | `op.AuditRateLimitExceeded` | Reserved for embedder-emitted events from your own rate-limit middleware. The library defines the constant so the audit catalog stays consistent across embedders, but does not fire it from internal paths. |
| `rate_limit.bypassed` | `op.AuditRateLimitBypassed` | Same shape — for embedder middleware to log explicit bypasses (allowlisted IP, internal probe, etc.). |

The last two are intentionally a vocabulary the library shares with operator-side middleware, not internal events. If your reverse proxy or middleware enforces a budget and lets a request through (or rejects it), emit one of these against the same audit logger so the analytics pipeline sees a single coherent stream.

::: tip Recommended pattern
1. **Reverse proxy or edge service enforces a global rate** — for example, 100 requests/second/IP on `/token`, lower on `/par`. This is the actual mechanism that costs an attacker requests.
2. **Audit pipeline alerts on bursts** of `pkce.violation`, `redirect_uri.mismatch`, and `client_authn.failure` from a single IP, ASN, or `client_id`. These are the high-signal events for "someone is poking the OP."
3. **Per-client allow-lists reduce the attack surface upstream.** `WithCORSOrigins` and the `redirect_uris` registry both work as allowlists — the smaller they are, the less surface a misconfigured or compromised client exposes.
:::

### What the library locks out internally

Three specific abuse paths have built-in lockouts because they don't fit a generic per-IP rate limiter — the abuser can rotate IPs cheaply, and the protected resource is a low-entropy code or a per-subject credential, not an arbitrary URL:

- **Login brute force (cross-factor).** When `op.WithAuthnLockoutStore` is wired, every built-in second-factor `Step` (TOTP, email OTP, password) consults the same per-subject counter so an attacker pivoting between factors cannot double their guess budget. The login flow emits `op.AuditLoginFailed` on each failed step (and `op.AuditLoginSuccess` on the eventual win); the lockout layer is what keeps the failure stream from running unbounded.
- **Device Code user-code brute force.** The `op.devicecodekit` package keeps a per-`device_code` strike counter. After enough mismatches it short-circuits the verification helper, and every strike emits `op.AuditDeviceCodeUserCodeBruteForce`. This is the only way to defend a user-typed short code without making the legitimate path painful.
- **CIBA poll abuse.** The token endpoint counts how often a single `auth_req_id` is polled past its allowed cadence. Above the threshold, the request store's `Deny` is called with `reason="poll_abuse"`, the wire response becomes `access_denied`, and `op.AuditCIBAPollAbuseLockout` fires. This shuts a pathological RP down without a global rate limiter that would also penalise well-behaved RPs.

Each of those gates emits its **own** dedicated audit event, **not** `rate_limit.exceeded` / `rate_limit.bypassed`. The split is deliberate:

| Class | Who enforces | What event you see |
|---|---|---|
| Generic HTTP rate limiting (per-IP, per-endpoint, per-`client_id`) | Embedder middleware (reverse proxy, gateway, Go handler chain) | `op.AuditRateLimitExceeded` / `op.AuditRateLimitBypassed` — emitted by the embedder against the OP's audit logger |
| Purpose-specific brute-force defence (login, user-code, poll cadence) | Library-internal | `op.AuditLoginFailed`, `op.AuditDeviceCodeUserCodeBruteForce`, `op.AuditCIBAPollAbuseLockout` |

Everything else — bursts of failed PKCE, repeated `redirect_uri` mismatches, sustained `client_authn` failures — is observable through audit events but not enforced by the library. That is a deliberate split: the OP emits structured signals, the operator decides the response (block, throttle, page).

## Log retention

| Stream | Typical retention |
|---|---|
| Operational | 7 – 30 days |
| Audit | **as long as your compliance regime requires** — typically 1 – 7 years |
| Metrics | 30 – 90 days at high resolution; rolled up indefinitely |

Audit retention is the long-tail cost. Plan storage for it separately — the events are small but high-volume on a busy OP.
