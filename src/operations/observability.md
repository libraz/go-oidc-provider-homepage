---
title: Observability
description: Wiring synchronous audit logging, issuer-labelled Prometheus metrics, and embedder-owned HTTP tracing around the OP.
outline: 2
pageClass: pg-operations-observability
---

# Observability

Four streams cover what you need to see in production:

| Stream | What it carries | OP-side seam | Embedder-side seam |
|---|---|---|---|
| Operational logs | request errors, config-time issues, startup state | `WithLogger(*slog.Logger)` | your structured-log destination |
| Audit events | emitted signals plus reserved catalog vocabulary ([catalog](/reference/audit-events)) | `WithAuditLogger(*slog.Logger)` | SOC pipeline |
| Metrics | OIDC business counters | `WithPrometheus(*prometheus.Registry)` | your `/metrics` route |
| Tracing | request spans | none built-in | `otelhttp.NewMiddleware` around the `http.Handler` |

The library deliberately keeps these decoupled — you can wire any subset.

<figure class="fig">
  <div class="fig-head">Where the signals come from, and where they go</div>
  <svg class="fig-svg" role="img" aria-labelledby="observability-title" viewBox="0 0 960 268" xmlns="http://www.w3.org/2000/svg">
    <title id="observability-title">The OP emits protocol-level audit events; the HTTP layer around it emits request identifiers and trace spans. Your platform routes the two into operational logs, audit logs, metrics and traces.</title>
    <text class="fg-lbl" x="40" y="26">what emits</text>
    <text class="fg-lbl" x="604" y="26">where it lands</text>
    <rect class="fg-box" x="36" y="40" width="330" height="82" rx="8"/>
    <text class="fg-t2" x="56" y="66">Your HTTP layer</text>
    <text class="fg-xs" x="56" y="88">the middleware already wrapping the OP</text>
    <text class="fg-mxs" x="56" y="108">request id · trace span · status · latency</text>
    <rect class="fg-box fg-box--accent" x="36" y="136" width="330" height="82" rx="8"/>
    <text class="fg-t2 fg-accent" x="56" y="162">The OP handler</text>
    <text class="fg-xs" x="56" y="184">protocol work, and only protocol work</text>
    <text class="fg-mxs" x="56" y="204">audit events — one per decision</text>
    <path class="fg-leader" d="M370,81 H420 M370,177 H420 M420,64 V194"/>
    <path class="fg-edge fg-edge--thin" d="M420,64 H592" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M420,108 H592" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M420,152 H592" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M420,194 H592" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="600" y="44" width="324" height="40" rx="6"/>
    <text class="fg-t2" x="618" y="62">Operational logs</text>
    <text class="fg-xs" x="618" y="78">what happened on this request</text>
    <rect class="fg-box" x="600" y="88" width="324" height="40" rx="6"/>
    <text class="fg-t2" x="618" y="106">Audit logs</text>
    <text class="fg-xs" x="618" y="122">who was granted what, and when</text>
    <rect class="fg-box" x="600" y="132" width="324" height="40" rx="6"/>
    <text class="fg-t2" x="618" y="150">Prometheus</text>
    <text class="fg-xs" x="618" y="166">rates and latencies per endpoint</text>
    <rect class="fg-box" x="600" y="176" width="324" height="40" rx="6"/>
    <text class="fg-t2" x="618" y="194">OpenTelemetry</text>
    <text class="fg-xs" x="618" y="210">the span the OP sits inside</text>
  </svg>
  <figcaption class="fig-note">The library does not own a logger, a registry, or an exporter. It emits events and leaves the routing to whatever you already run, which is why the OP shows up in your existing dashboards rather than beside them.</figcaption>
</figure>

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

Each event is a JSON line with an `event` attribute containing `"<event.name>"`; `msg` is the short human-readable message. Optional canonical attributes (`actor_id`, `client_id`, `session_id`, `request_id`, `ip`, `user_agent`, and `tag`) are emitted when set, and a non-empty `extras` group carries category-specific fields. See the [Audit event catalog](/reference/audit-events) for the full list.

`WithAuditLogger` is synchronous: the handler runs on the emitting caller's goroutine. It must not block on slow I/O or unbounded queues, and it must be safe for concurrent calls. Use a bounded, concurrency-safe handoff when the final sink is asynchronous. The catalog contains reserved names as well as events emitted by this library, so do not treat every constant as proof that a signal fired.

::: tip One stream, multiple sinks
A single `*slog.Logger` can fan out to file + Loki + Splunk via a multiplexing handler. The OP constructs the `slog.Record` itself and passes it directly to the logger's `Handler().Handle(...)`; the OP does not rebuild the event through `logger.LogAttrs(...)`. This preserves the audit timestamp supplied by `WithClock`.
:::

### Introspection store faults

An opaque access-token or refresh-token lookup that returns `store.ErrNotFound` is an ordinary inactive result and emits no fault event. Any other lookup error emits `AuditIntrospectionError` (`introspection.error`) at error level with a `store_unavailable` reason. The `/introspect` wire response remains HTTP 200 with `{"active":false}`, so alerting and incident investigation must use the audit stream rather than a 5xx counter.

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

The spans come from `otelhttp.NewHandler` (or equivalent middleware), not from the OP. The library emits no OpenTelemetry spans of its own, neither request-lifecycle nor business ones. Per-stage traces — "how long did PKCE verification take inside `/token`" — are therefore something the embedder instruments. The audit event catalog gives you discrete event records, not tracing spans.

## Request IDs

The OP does not extract request IDs from `X-Request-ID` or `Traceparent` headers, and it does not synthesise one itself.

The audit `Event` struct does carry a `RequestID` field for correlation, but the OP never populates it. Correlating a request with its response is the embedder's job end to end, the same way it already is for the HTTP layer in general (see [Tracing](#tracing) above).

Generate a request ID at the edge, stamp it on the response so RP logs can correlate, and use it as the correlation key in whatever logging you wrap around the OP:

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
| `bcl.no_sessions_for_subject` rate | audit log | elevated rates correlated with grant/client state; inspect snapshot context separately |
| Active sessions | store query / metric you maintain | drop > 30 % |
| JWKS request rate | HTTP middleware | tracks RP cache health |

The first three are the highest-signal indicators of production trouble. When `bcl.no_sessions_for_subject` rises, correlate it with grant and client state. The configured `posture` is context for logout-trigger and session-snapshot durability, not the cause of an empty RP audience. The last two catch RP-side regressions.

## Rate limiting and abuse signals

The library does **not** ship a built-in rate limiter on `/authorize`, `/par`, `/token`, `/userinfo`, or any other public endpoint. There is no `WithRateLimit` knob to tune. Rate limiting is the operator's job — a reverse proxy (NGINX, Envoy, Traefik), an edge service (Cloudflare, Fastly), or middleware in front of the `*op.Provider` (it implements `http.Handler`) is where per-IP / per-client request budgets belong. Pretending otherwise would set false expectations.

What the library does emit is a set of audit events that an abuse pipeline can consume to score offenders, regardless of where the actual rate enforcement lives:

| Audit event | Constant | What it tells you |
|---|---|---|
| `pkce.violation` | `op.AuditPKCEViolation` (reserved) | The catalog name is reserved; the OP currently reports a PKCE rejection on the wire and does not emit this audit event. |
| `redirect_uri.mismatch` | `op.AuditRedirectURIMismatch` (reserved) | The catalog name is reserved; the OP currently reports a mismatch on the wire and does not emit this audit event. |
| `client_authn.failure` | `op.AuditClientAuthnFailure` | Client authentication at `/token`, `/par`, `/device_authorization`, or `/bc-authorize` failed. Bursts are credential brute-force. `/introspect` has its separate `op.AuditIntrospectionError` signal; `/revoke` does not use either event. |
| `device_code.verification.user_code_brute_force` | `op.AuditDeviceCodeUserCodeBruteForce` | The device-code verification page is being walked through user-code guesses. Record-bound helpers use per-record gates; first-entry pages should use `devicecodekit.VerifyUserCodeByAttemptKey` with a shared limiter when deployed across replicas — see [Device Code](/use-cases/device-code) for the verification helper. |
| `ciba.poll_abuse.lockout` | `op.AuditCIBAPollAbuseLockout` | The CIBA polling counter has crossed the per-`auth_req_id` threshold. The library denies the request on the wire (`access_denied`) and emits the event so SOC tooling can correlate. |
| `rate_limit.exceeded` | `op.AuditRateLimitExceeded` | Reserved for embedder-emitted events from your own rate-limit middleware. The library defines the constant so the audit catalog stays consistent across embedders, but does not fire it from internal paths. |
| `rate_limit.bypassed` | `op.AuditRateLimitBypassed` | Same shape — for embedder middleware to log explicit bypasses (allow-listed IP, internal probe, etc.). |

The last two are intentionally a vocabulary the library shares with operator-side middleware, not internal events. If your reverse proxy or middleware enforces a budget and lets a request through (or rejects it), emit one of these against the same audit logger so the analytics pipeline sees a single coherent stream.

::: tip Recommended pattern
1. **Reverse proxy or edge service enforces a global rate** — for example, 100 requests/second/IP on `/token`, lower on `/par`. This is the actual mechanism that costs an attacker requests.
2. **Audit pipeline alerts on bursts** of `client_authn.failure` from a single IP, ASN, or `client_id`. This is the high-signal event for "someone is poking the OP." Reserved PKCE and redirect-mismatch names are not currently emitted by the library.
3. **Per-client allow-lists reduce the attack surface upstream.** `WithCORSOrigins` and the `redirect_uris` registry both work as allow-lists — the smaller they are, the less surface a misconfigured or compromised client exposes.
:::

### What the library locks out internally

Three specific abuse paths have built-in lockouts because they don't fit a generic per-IP rate limiter — the abuser can rotate IPs cheaply, and the protected resource is a low-entropy code or a per-subject credential, not an arbitrary URL:

- **Login brute force (cross-factor).** When `op.WithAuthnLockoutStore` is wired, every built-in second-factor `Step` (TOTP, email OTP, password) consults the same per-subject counter so an attacker pivoting between factors cannot double their guess budget. The login flow emits `op.AuditLoginFailed` or `op.AuditMFAFailed` for failed primary/additional factors and `op.AuditLoginSuccess` or `op.AuditMFASuccess` for successes; `op.AuditLockoutStalled` reports repeated CAS contention that abandoned a failed attempt without counting it.
- **Device Code user-code brute force.** The `op.devicecodekit` package keeps a per-record strike counter for record-bound helpers. A first-entry page that does not have a `device_code` should call `VerifyUserCodeByAttemptKey` with an opaque stable key and a shared `AttemptLimiter`; every mismatch emits `op.AuditDeviceCodeUserCodeBruteForce`. This is the way to defend a user-typed short code without giving each replica its own budget.
- **CIBA poll abuse.** The token endpoint counts how often a single `auth_req_id` is polled past its allowed cadence. Above the threshold, the request store's `Deny` is called with `reason="poll_abuse"`, the wire response becomes `access_denied`, and `op.AuditCIBAPollAbuseLockout` fires. This shuts a pathological RP down without a global rate limiter that would also penalise well-behaved RPs.

Each of those gates emits its **own** dedicated audit event, **not** `rate_limit.exceeded` / `rate_limit.bypassed`. The split is deliberate:

| Class | Who enforces | What event you see |
|---|---|---|
| Generic HTTP rate limiting (per-IP, per-endpoint, per-`client_id`) | Embedder middleware (reverse proxy, gateway, Go handler chain) | `op.AuditRateLimitExceeded` / `op.AuditRateLimitBypassed` — emitted by the embedder against the OP's audit logger |
| Purpose-specific brute-force defence (login, user-code, poll cadence) | Library-internal | `op.AuditLoginFailed`, `op.AuditDeviceCodeUserCodeBruteForce`, `op.AuditCIBAPollAbuseLockout` |

Everything else — sustained `client_authn` failures and the wire-level PKCE or `redirect_uri` rejection responses — is not enforced by a built-in HTTP limiter. The client-authentication failures are audit signals; PKCE and redirect-mismatch names remain reserved catalog vocabulary. That is a deliberate split: the OP emits the signals it owns, and the operator decides the response (block, throttle, page).

## Log retention

| Stream | Typical retention |
|---|---|
| Operational | 7 – 30 days |
| Audit | **as long as your compliance regime requires** — typically 1 – 7 years |
| Metrics | 30 – 90 days at high resolution; rolled up indefinitely |

Audit retention is the long-tail cost. Plan storage for it separately — the events are small but high-volume on a busy OP.
