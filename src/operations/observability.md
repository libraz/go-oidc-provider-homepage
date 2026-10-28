---
title: Observability
description: Wiring synchronous audit logging, issuer-labelled Prometheus metrics, and embedder-owned HTTP tracing around the OP.
outline: 2
pageClass: pg-operations-observability
---

# Observability

Four streams cover what you need to see in production. An **audit event** here is a structured record the OP emits for each security-relevant decision (a login, a token issued, a refresh token replayed), as opposed to an operational log line about what the process is doing.

| Stream | What it carries | OP-side seam | Embedder-side seam |
|---|---|---|---|
| Operational logs | request errors, config-time issues, startup state | `WithLogger(*slog.Logger)` | your structured-log destination |
| Audit events | emitted signals plus reserved catalog vocabulary ([catalog](/reference/audit-events)) | `WithAuditLogger(*slog.Logger)` | SOC pipeline |
| Metrics | OIDC business counters | `WithPrometheus(*prometheus.Registry)` | your `/metrics` route |
| Tracing | request spans | none built-in | `otelhttp.NewMiddleware` around the `http.Handler` |

The library deliberately keeps these decoupled — you can wire any subset.

<figure class="fig">
  <div class="fig-head">The OP emits events; your platform routes them</div>
  <svg class="fig-svg" role="img" aria-labelledby="observability-title" viewBox="0 0 960 480" xmlns="http://www.w3.org/2000/svg">
    <title id="observability-title">The OP emits protocol-level audit events; the HTTP layer around it emits request identifiers and trace spans. Your platform routes the two into operational logs, audit logs, metrics and traces.</title>
    <text class="fg-lbl" x="32" y="40">what emits</text>
    <text class="fg-lbl" x="568" y="40">where it lands</text>
    <!-- http layer -->
    <rect class="fg-box" x="32" y="152" width="400" height="96" rx="8"/>
    <text class="fg-t" x="48" y="180">Your HTTP layer</text>
    <text class="fg-s" x="48" y="204">the middleware already wrapping the OP</text>
    <text class="fg-mxs" x="48" y="228">request id · span · status · latency</text>
    <!-- OP handler -->
    <rect class="fg-box fg-box--accent" x="32" y="280" width="400" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="308">The OP handler</text>
    <text class="fg-s" x="48" y="332">protocol work, and only protocol work</text>
    <text class="fg-mxs" x="48" y="356">audit events — one per decision</text>
    <path class="fg-leader" d="M432,200 H500 M432,328 H500 M500,108 V420"/>
    <!-- Operational logs -->
    <path class="fg-edge fg-edge--thin" d="M500,108 H568" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="568" y="72" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="100">Operational logs</text>
    <text class="fg-s" x="584" y="124">what happened on this request</text>
    <!-- Audit logs -->
    <path class="fg-edge fg-edge--thin" d="M500,212 H568" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="568" y="176" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="204">Audit logs</text>
    <text class="fg-s" x="584" y="228">who was granted what, and when</text>
    <!-- Prometheus -->
    <path class="fg-edge fg-edge--thin" d="M500,316 H568" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="568" y="280" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="308">Prometheus</text>
    <text class="fg-s" x="584" y="332">rates and latencies per endpoint</text>
    <!-- OpenTelemetry -->
    <path class="fg-edge fg-edge--thin" d="M500,420 H568" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="568" y="384" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="412">OpenTelemetry</text>
    <text class="fg-s" x="584" y="436">the span the OP sits inside</text>
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

If `WithLogger` is omitted the library discards every record (no fallback to `slog.Default()`). The handler you pass is wrapped with a redaction hook, so attributes named after OAuth/OIDC secrets (`access_token`, `refresh_token`, `id_token`, `code`, `code_verifier`, `client_secret`, `password`, `state`, `nonce`, `dpop`, `authorization`, `cookie`, `set-cookie`) are masked before they reach your handler.

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

Each event is a JSON line. Every record carries `audit="true"`, so one shared handler can route audit lines to their own sink, and an `event` attribute holding the event name (`"login.failed"`); `msg` is the short human-readable message. Optional attributes (`actor_id`, `client_id`, `session_id`, `request_id`, `ip`, `user_agent`, and `tag`) appear when set, and a non-empty `extras` group carries category-specific fields. See the [Audit event catalog](/reference/audit-events) for the full list.

If you omit `WithAuditLogger`, audit records go to the `WithLogger` logger; with neither, they are dropped.

`WithAuditLogger` is synchronous: the handler runs on the request goroutine and the OP waits for it to return before writing the response. A slow sink therefore adds its latency to every token, authorize, and logout request. The handler must not block on slow I/O or unbounded queues, and it must be safe for concurrent calls; when the final sink is remote, hand the record to a bounded, concurrency-safe queue. The OP does not retry, and it recovers from a panicking handler instead of failing the request. The catalog contains reserved names as well as events emitted by this library, so do not treat every constant as proof that a signal fired.

::: tip One stream, multiple sinks
A single `*slog.Logger` can fan out to file + Loki + Splunk via a multiplexing handler. The OP constructs the `slog.Record` itself and passes it directly to the logger's `Handler().Handle(...)`; the OP does not rebuild the event through `logger.LogAttrs(...)`. This preserves the audit timestamp supplied by `WithClock`.
:::

### Introspection store faults

An opaque access-token or refresh-token lookup that returns `store.ErrNotFound` is an ordinary inactive result and emits no fault event. Any other lookup error emits `AuditIntrospectionError` (`introspection.error`) at error level with a `store_unavailable` reason. The `/introspect` wire response remains HTTP 200 with `{"active":false}`, so alerting and incident investigation must use the audit stream rather than a 5xx counter. The same event also records a client that failed to authenticate at `/introspect`, which is why the endpoint has its own signal instead of `client_authn.failure`.

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

The library does not mount `/metrics` itself; you choose the route and the access boundary. The counters are a curated subset of the audit catalog, updated from the same emission path. Every series carries a constant `issuer` label, so several providers can share one registry, but two providers with the same issuer on one registry fail `op.New`. The `client_id` label is filled only for statically seeded clients; dynamically registered clients share the empty value, which keeps cardinality bounded. [`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics) runs the OP with a registry and lists the full set.

| Counter | Labels | Counts |
|---|---|---|
| `oidc_token_issued_total` | `grant_type`, `client_id` | refresh chains started, by the grant that started them (grants that issue no refresh token are not counted) |
| `oidc_tokens_refreshed_total` | `client_id` | completed refresh-token rotations |
| `oidc_login_attempts_total` | `factor`, `result` | login and MFA attempts |
| `oidc_refresh_replay_detected_total`, `oidc_code_replay_detected_total` | none | replayed refresh tokens and authorization codes |
| `oidc_client_authn_failures_total` | `auth_method`, `reason` | failed client authentication |
| `oidc_back_channel_logout_total`, `oidc_logout_failures_total` | `result`, `kind` | back-channel delivery outcomes and logout persistence failures |
| `oidc_dcr_events_total`, `oidc_device_authorization_events_total`, `oidc_device_code_events_total`, `oidc_ciba_events_total`, `oidc_token_exchange_events_total`, `oidc_custom_grant_events_total` | `event` | per-flow outcomes, labelled by the audit event name minus its prefix |
| `oidc_introspection_errors_total`, `oidc_token_revoke_failures_total`, `oidc_key_retired_kid_presented_total` | none, `kind`, none | introspection faults, revocation side-effect failures, retired-`kid` presentations |

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

The OP does not extract request IDs from `X-Request-ID` or `Traceparent` headers, and it does not synthesise one itself. Audit records have a `request_id` attribute, but the OP's own handlers never set it, so it does not appear in the stream. Correlating a request with its response is the embedder's job end to end, as it is for the HTTP layer in general (see [Tracing](#tracing) above).

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
| New refresh chains by `grant_type` | `oidc_token_issued_total` | sustained drop > 50 % vs baseline |
| 5xx rate at `/token` | HTTP middleware histogram | > 0.5 % over 5 min |
| `refresh.replay_detected` rate | `oidc_refresh_replay_detected_total` or the audit log | > 0 (any non-zero is investigation-worthy) |
| `bcl.no_sessions_for_subject` rate | audit log | elevated rates correlated with grant/client state; inspect snapshot context separately |
| Active sessions | store query / metric you maintain | drop > 30 % |
| JWKS request rate | HTTP middleware | tracks RP cache health |

The first three are the highest-signal indicators of production trouble. When `bcl.no_sessions_for_subject` rises, correlate it with grant and client state. The configured `posture` is context for logout-trigger and session-snapshot durability, not the cause of an empty RP audience. The last two catch RP-side regressions.

## Rate limiting and abuse signals

The library does **not** ship a built-in rate limiter on the authorization endpoint, `/par`, `/token`, `/userinfo`, or any other public endpoint. There is no `WithRateLimit` knob to tune. Rate limiting is the operator's job — a reverse proxy (NGINX, Envoy, Traefik), an edge service (Cloudflare, Fastly), or middleware in front of the `*op.Provider` (it implements `http.Handler`) is where per-IP / per-client request budgets belong. Pretending otherwise would set false expectations.

What the library does emit is a set of audit events that an abuse pipeline can consume to score offenders, regardless of where the actual rate enforcement lives:

| Audit event | Constant | What it tells you |
|---|---|---|
| `pkce.violation` | `op.AuditPKCEViolation` (reserved) | The catalog name is reserved; the OP currently reports a PKCE rejection on the wire and does not emit this audit event. |
| `redirect_uri.mismatch` | `op.AuditRedirectURIMismatch` (reserved) | The catalog name is reserved; the OP currently reports a mismatch on the wire and does not emit this audit event. |
| `client_authn.failure` | `op.AuditClientAuthnFailure` | Client authentication at `/token`, `/par`, `/device_authorization`, or `/bc-authorize` failed. Bursts are credential brute-force. `/introspect` has its separate `op.AuditIntrospectionError` signal; `/revoke` does not use either event. |
| `device_code.verification.user_code_brute_force` | `op.AuditDeviceCodeUserCodeBruteForce` | The device-code verification page is being walked through user-code guesses. Record-bound helpers use per-record gates; first-entry pages should use `devicecodekit.VerifyUserCodeByAttemptKey` with a shared limiter when deployed across replicas — see [Device Code](/use-cases/device-code) for the verification helper. |
| `ciba.poll_abuse.lockout` | `op.AuditCIBAPollAbuseLockout` | A client kept polling a CIBA `auth_req_id` faster than its interval and crossed the strike threshold. The request that crosses it still gets `slow_down`; the record is then denied, so the next poll gets `access_denied`. The OP emits the event so SOC tooling can correlate. |
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

- **Login brute force (cross-factor).** When `op.WithAuthnLockoutStore` is wired, every built-in second-factor `Step` (`StepTOTP`, `StepEmailOTP`, `StepRecoveryCode`) consults the same per-subject counter, so an attacker pivoting between factors cannot double their guess budget. The store keeps a rolling 24-hour window: a 1-hour lockout at 30 cumulative failures and a 24-hour lockout at 90. The counter does not cover the primary credential (your user store owns password throttling) or `ExternalStep` factors. The login flow emits `op.AuditLoginFailed` or `op.AuditMFAFailed` for failed attempts, including the one that engages the lock, and `op.AuditLoginSuccess` or `op.AuditMFASuccess` for successes. `op.AuditLockoutStalled` reports repeated compare-and-swap contention that abandoned a failed attempt without counting it; sustained emissions for one `actor_id` mean that subject can keep guessing without reaching the threshold.
- **Device Code user-code brute force.** The `op/devicecodekit` package keeps a per-record strike counter for record-bound helpers. A first-entry page that does not have a `device_code` should call `VerifyUserCodeByAttemptKey` with an opaque stable key and a shared `AttemptLimiter`; every mismatch emits `op.AuditDeviceCodeUserCodeBruteForce`. This is the way to defend a user-typed short code without giving each replica its own budget.
- **CIBA poll abuse.** The token endpoint counts how often a single `auth_req_id` is polled faster than its interval. At the threshold, the request store's `Deny` is called with `reason="poll_abuse"` and `op.AuditCIBAPollAbuseLockout` fires; later polls get `access_denied`. This shuts a pathological RP down without a global rate limiter that would also penalise well-behaved RPs.

Each of those gates emits its **own** audit event, **not** `rate_limit.exceeded` / `rate_limit.bypassed`:

| Class | Who enforces | What event you see |
|---|---|---|
| Generic HTTP rate limiting (per-IP, per-endpoint, per-`client_id`) | Embedder middleware (reverse proxy, gateway, Go handler chain) | `op.AuditRateLimitExceeded` / `op.AuditRateLimitBypassed` — emitted by the embedder against the OP's audit logger |
| Purpose-specific brute-force defence (login, user-code, poll cadence) | Library-internal | `op.AuditLoginFailed` / `op.AuditMFAFailed`, `op.AuditDeviceCodeUserCodeBruteForce`, `op.AuditCIBAPollAbuseLockout` |

Everything else — sustained `client_authn` failures and the wire-level PKCE or `redirect_uri` rejection responses — is not enforced by a built-in HTTP limiter. The client-authentication failures are audit signals; PKCE and redirect-mismatch names remain reserved catalog vocabulary. That is a deliberate split: the OP emits the signals it owns, and the operator decides the response (block, throttle, page).

## Log retention

Starting points, to be replaced by your compliance requirements:

| Stream | Typical retention |
|---|---|
| Operational | 7 – 30 days |
| Audit | **as long as your compliance regime requires** — typically 1 – 7 years |
| Metrics | 30 – 90 days at high resolution; rolled up indefinitely |

Audit retention is the long-tail cost. Plan storage for it separately — the events are small but high-volume on a busy OP.
