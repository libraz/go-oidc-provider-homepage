---
title: Mount on your router
description: Mounting the op.Provider on net/http, chi, gin, and friends.
pageClass: pg-getting-started-mount
---

# Mount on your router

`op.New` returns a `*op.Provider` whose `ServeHTTP` makes it a standard `http.Handler`. The library does **not** own the listener and does **not** care which router you use.

The provider sits one level below your router, as a sibling of your own handlers. Your middleware still wraps it, and every path outside the ones it claims stays yours.

<svg role="img" aria-labelledby="mount-layers-title" viewBox="0 0 760 296" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="mount-layers-title">The provider handler sits inside your router, alongside your own handlers, with your listener and middleware wrapping both.</title>
  <rect class="mt-layer" x="24" y="24" width="712" height="248" rx="10"/>
  <text class="mt-title" x="48" y="52">Your listener</text>
  <text class="mt-hint" x="712" y="52" text-anchor="end">http.ListenAndServe</text>

  <rect class="mt-layer" x="56" y="64" width="648" height="184" rx="10"/>
  <text class="mt-title" x="80" y="92">Your middleware</text>
  <text class="mt-hint" x="680" y="92" text-anchor="end">otelhttp · promhttp · access log</text>

  <rect class="mt-layer" x="88" y="104" width="584" height="124" rx="10"/>
  <text class="mt-title" x="112" y="132">Your router</text>
  <text class="mt-hint" x="648" y="132" text-anchor="end">net/http · chi · gin</text>

  <rect class="mt-box" x="112" y="140" width="252" height="76" rx="8"/>
  <text class="mt-title" x="238" y="164" text-anchor="middle">Your handlers</text>
  <text class="mt-route" x="238" y="184" text-anchor="middle">/ · /api/* · /healthz</text>
  <text class="mt-route" x="238" y="202" text-anchor="middle">/metrics · /debug/pprof</text>

  <rect class="mt-op" x="396" y="140" width="252" height="76" rx="8"/>
  <text class="mt-title" x="522" y="164" text-anchor="middle">op.Provider</text>
  <text class="mt-route" x="522" y="184" text-anchor="middle">/oidc/* (mount prefix)</text>
  <text class="mt-route" x="522" y="202" text-anchor="middle">/.well-known/openid-configuration</text>
</svg>

## Mount on net/http, chi, or gin

::: code-group

```go [net/http]
mux := http.NewServeMux()
mux.Handle("/", provider)
http.ListenAndServe(":8080", mux)
```

```go [chi]
r := chi.NewRouter()
r.Mount("/", provider)
http.ListenAndServe(":8080", r)
```

```go [gin]
r := gin.New()
r.Any("/*path", gin.WrapH(provider))
http.ListenAndServe(":8080", r)
```

:::

## Mount under a prefix

```go
op.New(
  op.WithMountPrefix("/oidc"),
  /* ... */
)
```

The default `/auth` endpoint becomes `/oidc/auth`, `/token` becomes `/oidc/token`, and so on. **Discovery (`/.well-known/openid-configuration`) is always mounted at the root** — OIDC Discovery 1.0 §4 requires it.

## Custom endpoint paths

```go
op.New(
  op.WithEndpoints(op.Endpoints{
    Authorize: "/oauth/authorize",
    Token:     "/oauth/token",
  }),
  /* ... */
)
```

Empty fields keep the default. Defaults match OIDC Core 1.0 conventions: `/auth`, `/token`, `/userinfo`, `/end_session`, `/jwks`, plus option-gated protocol endpoints such as `/par`, `/introspect`, `/revoke`, `/register`, `/device_authorization`, `/bc-authorize`, and `/grant_management`.

## What the OP does NOT mount

The OP is intentionally narrow about what it puts on your router:

| The OP mounts | The OP does NOT mount |
|---|---|
| `/.well-known/openid-configuration` | `/metrics` (you mount with `promhttp`) |
| `/jwks` | `/healthz`, `/readyz` |
| `/auth`, `/token`, `/userinfo` | request-duration histogram middleware |
| `/end_session` | OpenTelemetry HTTP server span middleware |
| Optional: `/par`, `/introspect`, `/revoke`, `/register`, `/device_authorization`, `/bc-authorize`, `/grant_management` | a `/debug/pprof` mount |
| Optional: `/interaction/*`, `/session/*` (when SPA driver is used) | a generic per-IP rate limiter |

This is deliberate. The OP emits **business** metrics, traces, and audit events through `op.WithPrometheus`, `op.WithLogger`, and `op.WithAuditLogger` into registries / handlers that you own. **HTTP-lifecycle observation is embedder territory** — you wrap the router with `otelhttp` / `promhttp.InstrumentHandler` according to your SRE conventions.

::: tip TLS / proxies
The OP expects to run behind a TLS-terminating ingress. Use `op.WithTrustedProxies(cidrs ...)` to allow-list the proxy ranges that supply `X-Forwarded-For`.

If the proxy also terminates client TLS and forwards the certificate in a header for RFC 8705 certificate-bound access tokens, add `op.WithMTLSProxy(headerName, cidrs)`.
:::

## Next

- [Use cases](/use-cases/) — concrete wirings for SPA, client_credentials, hot/cold storage, MFA, etc.
- [Security: posture](/security/posture) — what the cookie / CSRF / SSRF defaults are, and how to widen them when you actually need to.
