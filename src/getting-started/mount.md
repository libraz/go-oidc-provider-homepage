---
title: Mount on your router
description: Mounting the op.Provider on net/http, chi, gin, and friends.
pageClass: pg-getting-started-mount
---

# Mount on your router

`op.New` returns a `*op.Provider`, and its `ServeHTTP` method makes it a standard `http.Handler`. The library does not own the listener and works with any router.

The provider is a sibling of your own handlers inside your router. Your middleware still wraps it, and every path it does not claim stays yours.

<figure class="fig">
  <div class="fig-head">Where the provider sits in your server</div>
  <svg class="fig-svg" role="img" aria-labelledby="mount-title" viewBox="0 0 960 488" xmlns="http://www.w3.org/2000/svg">
    <title id="mount-title">The provider handler sits inside your own router, next to your own handlers. Your listener and your middleware wrap both of them, so telemetry and access logging cover the OP endpoints without any extra wiring.</title>
    <!-- request path: listener, middleware, router -->
    <rect class="fg-box" x="32" y="24" width="896" height="72" rx="8"/>
    <text class="fg-t" x="48" y="52">Your listener</text>
    <text class="fg-mxs" x="48" y="76">http.ListenAndServe</text>
    <path class="fg-edge" d="M480,96 V136" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="136" width="896" height="72" rx="8"/>
    <text class="fg-t" x="48" y="164">Your middleware</text>
    <text class="fg-mxs" x="48" y="188">otelhttp · promhttp · access log</text>
    <path class="fg-edge" d="M480,208 V248" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="248" width="896" height="72" rx="8"/>
    <text class="fg-t" x="48" y="276">Your router</text>
    <text class="fg-mxs" x="48" y="300">net/http · chi · gin</text>
    <!-- router dispatches to two subtrees -->
    <path class="fg-leader" d="M480,320 V344 M244,344 H716"/>
    <path class="fg-edge fg-edge--thin" d="M244,344 V368" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M716,344 V368" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="368" width="424" height="96" rx="8"/>
    <text class="fg-t" x="48" y="396">Your handlers</text>
    <text class="fg-mxs" x="48" y="420">/ · /api/* · /healthz · /metrics</text>
    <text class="fg-s" x="48" y="444">everything the OP has no opinion about</text>
    <rect class="fg-box fg-box--accent" x="504" y="368" width="424" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="520" y="396">op.Provider</text>
    <text class="fg-mxs" x="520" y="420">/oidc/*</text>
    <text class="fg-s" x="520" y="444">or the mount prefix you choose; one subtree</text>
  </svg>
  <figcaption class="fig-note">Every request passes through your listener and middleware before the router splits it, so telemetry and access logs cover the OP too. The provider claims one subtree and nothing outside it. For a host-only issuer, discovery is at the host root; an issuer with a path also has the discovery locations defined by RFC 8414 and OpenID Connect Discovery.</figcaption>
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

## Choose the URL prefix

The handler routes on full request paths, so mount it at the root of your router and let the library decide where its endpoints live. Do not wrap it in `http.StripPrefix`: the stripped path no longer matches any endpoint. To move the endpoints, use `WithMountPrefix`:

```go
op.New(
  op.WithMountPrefix("/"), // default is "/oidc"
  /* ... */
)
```

With the default prefix `/oidc`, the endpoint `/auth` becomes `/oidc/auth`, `/token` becomes `/oidc/token`, and so on. If the issuer URL carries a path, that path comes first. The mount prefix applies to these protocol endpoints only; it never moves the discovery document.

| Issuer | Mount prefix | Token endpoint | Discovery document |
|---|---|---|---|
| `https://op.example.com` | `/oidc` (default) | `/oidc/token` | `/.well-known/openid-configuration` |
| `https://op.example.com` | `/` | `/token` | `/.well-known/openid-configuration` |
| `https://example.com/tenant` | `/oidc` | `/tenant/oidc/token` | `/.well-known/openid-configuration/tenant` and `/tenant/.well-known/openid-configuration` |

An issuer with a path is discoverable at both the RFC 8414 location and the OpenID Connect Discovery 1.0 §4 location, so the provider serves both.

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

Empty fields keep the default, and discovery advertises every override. The defaults are `/auth`, `/token`, `/userinfo`, `/end_session` and `/jwks`, plus the endpoints that exist only when you enable their feature: `/par`, `/introspect`, `/revoke`, `/register`, `/device_authorization`, `/bc-authorize` and `/grant_management`. `op.New` rejects overrides that collide with each other.

## What the OP does NOT mount

The OP keeps its footprint on your router small:

| The OP mounts | The OP does NOT mount |
|---|---|
| discovery (issuer-dependent path) | `/metrics` (you mount it with `promhttp`) |
| `/jwks` | `/healthz`, `/readyz` |
| `/auth`, `/token`, `/userinfo` | request-duration histogram middleware |
| `/end_session` | OpenTelemetry HTTP server span middleware |
| Optional: `/par`, `/introspect`, `/revoke`, `/register`, `/device_authorization`, `/bc-authorize`, `/grant_management` | a `/debug/pprof` mount |
| `/interaction/{uid}` (login and consent screens), or with `WithSPAUI` the paths under its `LoginMount` | a generic per-IP rate limiter |

The OP emits **business** metrics and log and audit events through `op.WithPrometheus`, `op.WithLogger` and `op.WithAuditLogger`, into sinks you own. It creates no OpenTelemetry spans. **HTTP-lifecycle observation belongs to you**: wrap the router with `otelhttp` or `promhttp.InstrumentHandler` the way your SRE conventions require.

::: tip TLS / proxies
The OP expects to run behind a TLS-terminating ingress. Use `op.WithTrustedProxies(cidrs ...)` to allow-list the proxy ranges that supply `X-Forwarded-For`.

If the proxy also terminates client TLS and forwards the certificate in a header for RFC 8705 certificate-bound access tokens, add `op.WithMTLSProxy(headerName, cidrs)`.
:::

## Shut down gracefully

`/end_session` answers the browser as soon as the OP session is gone, then delivers Back-Channel Logout tokens to the relying parties in the background. Nothing on the request path waits for that delivery, so a process that exits right after `http.Server.Shutdown` can drop queued logout notices. Call `Provider.Shutdown` after the listener has stopped accepting requests:

```go
srv := &http.Server{Addr: ":8080", Handler: mux}
// ... on SIGTERM:
_ = srv.Shutdown(ctx)       // stop accepting, finish in-flight requests
_ = provider.Shutdown(ctx)  // wait for queued back-channel logout delivery
```

`Provider.Shutdown` returns `nil` when the queue drained and the context's error when it ran out of time. It is safe to call on a provider that never mounts `/end_session`. The upstream examples do this through `examples/internal/serve`.

## Next

- [Learn the concepts](/concepts/): new to OAuth and OIDC? A reading order from the three roles up to DPoP and FAPI, so each option you just set makes sense.
- [Use cases](/use-cases/): concrete setups for SPA login, `client_credentials`, hot/cold storage, MFA and more.
- [Security: posture](/security/posture): the cookie, CSRF and SSRF defaults, and how to widen them when you need to.
