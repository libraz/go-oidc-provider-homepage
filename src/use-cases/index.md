---
title: Use cases
description: Production-shaped scenarios with verified examples in the upstream repo.
---

# Use cases

Each card below maps to a runnable example under [`examples/`](https://github.com/libraz/go-oidc-provider/tree/main/examples) in the source repo. Examples build behind the `example` build tag so they don't bloat your `go.sum` or get pulled into `go test ./...`:

```sh
go run -tags example ./examples/01-minimal
```

## Index

Every example folder maps to one of the use-case pages below.

### Bootstrap & wiring

| Use case | Example | Page |
|---|---|---|
| Smallest possible OP | [`01-minimal`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) | [Minimal OP](/use-cases/minimal-op) |
| Comprehensive bundle (every option a typical embedder uses) | [`02-bundle`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle) | [Comprehensive bundle](/use-cases/bundle) |

### Profile & flow

| Use case | Example | Page |
|---|---|---|
| Plain OAuth 2.0 alongside OIDC | [`04-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/04-oauth2-only) | [OAuth 2.0 (no openid)](/use-cases/oauth2-only) |
| FAPI 2.0 Baseline (PAR + JAR + DPoP) | [`03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2), [`50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) | [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) |
| Service-to-service tokens | [`05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) | [client_credentials](/use-cases/client-credentials) |
| DPoP server nonce flow | [`51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) | [DPoP nonce flow](/use-cases/dpop-nonce) |

### UI

| Use case | Example | Page |
|---|---|---|
| Drive UI from a SPA | [`16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction), [`10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) | [SPA / custom interaction](/use-cases/spa-custom-interaction) |
| Custom HTML consent page | [`11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) | [Custom consent UI](/use-cases/custom-consent-ui) |
| Custom HTML account chooser | [`12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) | [Custom chooser UI](/use-cases/custom-chooser-ui) |
| Multi-account chooser (`prompt=select_account`) | [`13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) | [Multi-account chooser](/use-cases/multi-account) |
| Cross-origin SPA (CORS) | [`14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa) | [CORS for SPA](/use-cases/cors-spa) |
| Locale negotiation | [`15-i18n-locale`](https://github.com/libraz/go-oidc-provider/tree/main/examples/15-i18n-locale) | [i18n / locale](/use-cases/i18n) |

### Storage

| Use case | Example | Page |
|---|---|---|
| Persist on a real database | [`06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store), [`07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) | [Persistent storage (SQL)](/use-cases/sql-store) |
| Hot/cold split (Redis volatile) | [`08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold), [`09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) | [Hot/cold + Redis](/use-cases/hot-cold-redis) |

### Scopes & claims

| Use case | Example | Page |
|---|---|---|
| Public / internal scope split | [`60-scopes-public-private`](https://github.com/libraz/go-oidc-provider/tree/main/examples/60-scopes-public-private) | [Public / internal scopes](/use-cases/scopes) |
| OIDC §5.5 claims request parameter | [`61-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/61-claims-request) | [Claims request](/use-cases/claims-request) |

### Authentication

| Use case | Example | Page |
|---|---|---|
| MFA, captcha, step-up | [`20`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp), [`21`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa), [`22`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha), [`23`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) | [MFA / step-up](/use-cases/mfa-step-up) |
| Bring your own user store | [`24-byo-userstore`](https://github.com/libraz/go-oidc-provider/tree/main/examples/24-byo-userstore) | [Bring your own user store](/use-cases/byo-userstore) |

### Advanced grants

| Use case | Example | Page |
|---|---|---|
| Custom grant_type URN | [`30-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-custom-grant) | [Custom Grant](/use-cases/custom-grant) |
| Device code (RFC 8628) | [`31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) | [Device Code](/use-cases/device-code) |
| CIBA poll mode | [`32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) | [CIBA](/use-cases/ciba) |
| Token Exchange (RFC 8693) | [`33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation) | [Token Exchange](/use-cases/token-exchange) |

### Crypto & subjects

| Use case | Example | Page |
|---|---|---|
| Pairwise subject (OIDC Core §8.1) | [`34-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-pairwise-saas) | [Pairwise subject](/use-cases/pairwise-subject) |
| Encrypted id_token (JWE) | [`35-encrypted-id-token`](https://github.com/libraz/go-oidc-provider/tree/main/examples/35-encrypted-id-token) | [JWE encryption](/use-cases/jwe-encryption) |

### Governance

| Use case | Example | Page |
|---|---|---|
| First-party consent skip | [`40-first-party-skip-consent`](https://github.com/libraz/go-oidc-provider/tree/main/examples/40-first-party-skip-consent) | [First-party consent skip](/use-cases/first-party) |
| Dynamic Client Registration (RFC 7591) | [`41-dynamic-registration`](https://github.com/libraz/go-oidc-provider/tree/main/examples/41-dynamic-registration) | [Dynamic Client Registration](/use-cases/dynamic-registration) |
| Back-Channel Logout 1.0 | [`42-back-channel-logout`](https://github.com/libraz/go-oidc-provider/tree/main/examples/42-back-channel-logout) | [Back-Channel Logout](/use-cases/back-channel-logout) |

### Operations

| Use case | Example | Page |
|---|---|---|
| Prometheus metrics | [`52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics) | [Prometheus metrics](/use-cases/prometheus) |

## Numeric inventory

The example folders are grouped by topic, not by chronology:

| Band  | Topic |
|-------|-------|
| 00–09 | bootstrap, core flows, profiles, storage adapters |
| 10–19 | UI and browser integration (SPA, consent, chooser, CORS, i18n) |
| 20–29 | MFA, authentication rules, and user-store projection |
| 30–39 | advanced grants, subject modes, encrypted tokens, federation |
| 40–49 | governance: first-party, DCR, back-channel logout |
| 50–59 | operations: FAPI helpers, metrics, tracing, DPoP nonce |
| 60–69 | scopes, claims, and compliance-adjacent examples |

The README in the source repo is the authoritative inventory.
