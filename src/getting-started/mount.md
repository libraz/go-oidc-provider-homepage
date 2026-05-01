---
title: Mount on your router
description: Mounting the op.Provider on net/http, chi, gin, and friends.
---

# Mount on your router

`op.New` returns a `*op.Provider` whose `ServeHTTP` makes it a standard
`http.Handler`. The library does **not** own the listener and does **not**
care which router you use.

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
  op.WithMountPrefix("/auth"),
  /* ... */
)
```

Now `/authorize` becomes `/auth/authorize`, `/token` becomes `/auth/token`,
and so on. **Discovery (`/.well-known/openid-configuration`) is always
mounted at the root** — OIDC Discovery 1.0 §4 requires it.

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

Empty fields keep the default. Defaults match OIDC Core 1.0 conventions:
`/auth`, `/token`, `/userinfo`, `/end_session`, `/jwks`, plus
`/par`, `/introspect`, `/revoke`, `/register` when their respective
features are enabled.

## What the OP does NOT mount

The OP is intentionally narrow about what it puts on your router:

| The OP mounts | The OP does NOT mount |
|---|---|
| `/.well-known/openid-configuration` | `/metrics` (you mount with `promhttp`) |
| `/jwks` | `/healthz`, `/readyz` |
| `/auth`, `/token`, `/userinfo` | request-duration histogram middleware |
| `/end_session` | OpenTelemetry HTTP server span middleware |
| Optional: `/par`, `/introspect`, `/revoke`, `/register` | a `/debug/pprof` mount |
| Optional: `/interaction/*`, `/session/*` (when SPA driver is used) | a generic per-IP rate limiter |

This is deliberate. The OP emits **business** metrics, traces, and audit
events through `op.WithPrometheus`, `op.WithLogger`, and `op.WithAuditLogger`
into registries / handlers that you own. **HTTP-lifecycle observation is
embedder territory** — you wrap the router with `otelhttp` /
`promhttp.InstrumentHandler` according to your SRE conventions.

::: tip TLS / proxies
The OP expects to run behind a TLS-terminating ingress. Use
`op.WithTrustedProxies(cidrs ...)` to whitelist the proxy ranges that
provide `X-Forwarded-For`, and `op.WithMTLSProxy(headerName, cidrs)` if
you're terminating client TLS at the proxy and forwarding the certificate
in a header for RFC 8705 mTLS client auth.
:::

## Next

- [Use cases](/use-cases/) — concrete wirings for SPA, client_credentials,
  hot/cold storage, MFA, etc.
- [Security: posture](/security/posture) — what the cookie / CSRF / SSRF
  defaults are, and how to widen them when you actually need to.
