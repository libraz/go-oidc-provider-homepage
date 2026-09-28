---
title: Mount on your router
description: Mounting the op.Provider on net/http, chi, gin, and friends.
pageClass: pg-getting-started-mount
---

# Mount on your router

`op.New` returns a `*op.Provider` whose `ServeHTTP` makes it a standard `http.Handler`. The library does **not** own the listener and does **not** care which router you use.

The provider sits one level below your router, as a sibling of your own handlers. Your middleware still wraps it, and every path outside the ones it claims stays yours.

<figure class="fig">
  <div class="fig-head">Where the provider sits in your server</div>
  <svg class="fig-svg" role="img" aria-labelledby="mount-title" viewBox="0 0 960 300" xmlns="http://www.w3.org/2000/svg">
    <title id="mount-title">The provider handler sits inside your own router, next to your own handlers. Your listener and your middleware wrap both of them, so telemetry and access logging cover the OP endpoints without any extra wiring.</title>
    <rect class="fg-frame" x="36" y="24" width="888" height="262" rx="10"/>
    <text class="fg-lbl" x="52" y="46">your listener</text>
    <text class="fg-mxs" x="164" y="46">http.ListenAndServe</text>
    <rect class="fg-frame" x="56" y="58" width="848" height="208" rx="10"/>
    <text class="fg-lbl" x="72" y="80">your middleware</text>
    <text class="fg-mxs" x="196" y="80">otelhttp · promhttp · access log</text>
    <rect class="fg-frame" x="76" y="92" width="808" height="154" rx="10"/>
    <text class="fg-lbl" x="92" y="114">your router</text>
    <text class="fg-mxs" x="182" y="114">net/http · chi · gin</text>
    <rect class="fg-box" x="96" y="128" width="374" height="98" rx="8"/>
    <text class="fg-t2" x="116" y="154">Your handlers</text>
    <text class="fg-mxs" x="116" y="180">/ · /api/* · /healthz</text>
    <text class="fg-mxs" x="116" y="200">/metrics · /debug/pprof</text>
    <text class="fg-xs" x="116" y="218">everything the OP has no opinion about</text>
    <rect class="fg-box fg-box--accent" x="490" y="128" width="374" height="98" rx="8"/>
    <text class="fg-t2 fg-accent" x="510" y="154">op.Provider</text>
    <text class="fg-mxs" x="510" y="180">/oidc/* — whatever prefix you mount it on</text>
    <text class="fg-mxs" x="510" y="200">discovery — issuer-dependent path</text>
    <text class="fg-xs" x="510" y="218">one subtree, no global routes</text>
  </svg>
  <figcaption class="fig-note">The provider claims one subtree and nothing outside it. For a host-only issuer, discovery is at the host root; an issuer with a path also has the discovery locations defined by RFC 8414 and OpenID Connect Discovery. Everything wrapped around it is yours and keeps working unchanged.</figcaption>
</figure>

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

The default `/auth` endpoint becomes `/oidc/auth`, `/token` becomes `/oidc/token`, and so on. `WithMountPrefix` affects these issuer-relative protocol paths; it does not choose the discovery path. For a host-only issuer, discovery is `/.well-known/openid-configuration`. When the issuer includes a path, the provider serves both the RFC 8414 location (`/.well-known/openid-configuration/<issuer-path>`) and the OIDC Discovery 1.0 §4 location (`/<issuer-path>/.well-known/openid-configuration`).

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
| discovery (issuer-dependent path) | `/metrics` (you mount with `promhttp`) |
| `/jwks` | `/healthz`, `/readyz` |
| `/auth`, `/token`, `/userinfo` | request-duration histogram middleware |
| `/end_session` | OpenTelemetry HTTP server span middleware |
| Optional: `/par`, `/introspect`, `/revoke`, `/register`, `/device_authorization`, `/bc-authorize`, `/grant_management` | a `/debug/pprof` mount |
| Optional: `/interaction/*`, `/session/*` (when SPA driver is used) | a generic per-IP rate limiter |

This is deliberate. The OP emits **business** metrics and log / audit events through `op.WithPrometheus`, `op.WithLogger`, and `op.WithAuditLogger` into sinks that you own. It does not create OpenTelemetry spans. **HTTP-lifecycle observation is embedder territory** — you wrap the router with `otelhttp` / `promhttp.InstrumentHandler` according to your SRE conventions.

::: tip TLS / proxies
The OP expects to run behind a TLS-terminating ingress. Use `op.WithTrustedProxies(cidrs ...)` to allow-list the proxy ranges that supply `X-Forwarded-For`.

If the proxy also terminates client TLS and forwards the certificate in a header for RFC 8705 certificate-bound access tokens, add `op.WithMTLSProxy(headerName, cidrs)`.
:::

## Next

- [Use cases](/use-cases/) — concrete wirings for SPA, client_credentials, hot/cold storage, MFA, etc.
- [Security: posture](/security/posture) — what the cookie / CSRF / SSRF defaults are, and how to widen them when you actually need to.
