---
title: Use cases
description: Production-shaped scenarios with verified examples in the upstream repo.
pageClass: pg-use-cases-index
---

# Use cases

Each card below maps to a runnable example under [`examples/`](https://github.com/libraz/go-oidc-provider/tree/main/examples) in the source repo. Examples build behind the `example` build tag so they don't bloat your `go.sum` or get pulled into `go test ./...`:

```sh
(cd examples/01-minimal && GOWORK=off go run -tags example .)
```

Most pages start with the same decision shape:

- **What problem this solves.** The opening paragraphs explain the pressure that makes the feature useful, not just the option name.
- **When to use it.** Advanced pages call out the deployment shape where the feature earns its complexity.
- **When not to use it.** If a simpler built-in path is enough, the page points you there before diving into code.

If you are new to the library, start with [Minimal OP](/use-cases/minimal-op), then [Comprehensive bundle](/use-cases/bundle), and only jump to the pages below when your deployment has that specific need.

<figure class="fig">
  <div class="fig-head">A reading order for these pages</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-index-title" viewBox="0 0 960 254" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-index-title">Start from the minimal OP, then branch into whichever of the five areas the deployment actually needs: profile and flow, UI, storage and authentication, advanced grants, or cryptography and operations.</title>
    <rect class="fg-box fg-box--accent" x="36" y="98" width="200" height="66" rx="8"/>
    <text class="fg-t2 fg-accent" x="56" y="126">Minimal OP</text>
    <text class="fg-xs" x="56" y="146">get it booting first</text>
    <path class="fg-leader" d="M240,131 H270 M270,43 V219"/>
    <path class="fg-edge fg-edge--thin" d="M270,43 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M270,87 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M270,131 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M270,175 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M270,219 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="300" y="24" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="47">Profile and flow</text>
    <text class="fg-xs" x="470" y="47">FAPI, CIBA, device code, token exchange</text>
    <rect class="fg-box" x="300" y="68" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="91">UI and SPA</text>
    <text class="fg-xs" x="470" y="91">custom screens, the account chooser, step-up MFA</text>
    <rect class="fg-box" x="300" y="112" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="135">Storage and authentication</text>
    <text class="fg-xs" x="510" y="135">SQL, DynamoDB, Redis, your own user store</text>
    <rect class="fg-box" x="300" y="156" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="179">Advanced grants</text>
    <text class="fg-xs" x="470" y="179">grant management, authorization details, dynamic registration</text>
    <rect class="fg-box" x="300" y="200" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="223">Cryptography and operations</text>
    <text class="fg-xs" x="510" y="223">JWE, pairwise subjects, protected-resource metadata</text>
  </svg>
  <figcaption class="fig-note">The five rows are independent — take the one that matches what you are building. Only the box on the left has to come first.</figcaption>
</figure>

## The reference application

Each numbered example isolates one option in 200–500 lines. [`sample/`](https://github.com/libraz/go-oidc-provider/tree/main/sample) is the other thing: the arc those examples skip, where an account has to come into existence before it can be used. It runs on MySQL plus Redis joined by `op/storeadapter/composite`, under one `docker compose up`, and covers:

- signup owned by the application
- Argon2id password storage
- login and consent through an [`interaction.Driver`](/use-cases/spa-custom-interaction) the application implements itself
- TOTP enrolment from an account settings page
- a relying party completing the round-trip

```sh
docker compose -f sample/compose.yaml up -d --build
```

The Compose file publishes the OP and RP only on `127.0.0.1`. The sample protects application-owned POST routes with a double-submit CSRF token and an `Origin` check; password changes and TOTP enrolment confirmation also require the current password, verified with `op.VerifyPassword`. These protections belong to the application, outside the OP's interaction endpoint.

Its consent page is a worked example of granular per-scope consent, which the [bundled HTML driver](/use-cases/custom-consent-ui) deliberately does not offer. Treat it as a demonstration rather than a template: the schema is one embedder's model, signing and cookie keys are regenerated on every start, and it is not built to be hosted.

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
| Declare OAuth 2.1 or legacy OIDC posture | [`00-security-profile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/00-security-profile) | [Declaring a security profile](/use-cases/security-profile) |
| Plain OAuth 2.0 alongside OIDC | [`04-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/04-oauth2-only) | [OAuth 2.0 (no openid)](/use-cases/oauth2-only) |
| FAPI 2.0 Baseline (library PAR + JAR + DPoP default) | [`03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) | [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) |
| Service-to-service tokens | [`05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) | [client_credentials](/use-cases/client-credentials) |
| DPoP server nonce flow | [`51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) | [DPoP nonce flow](/use-cases/dpop-nonce) |

### UI

| Use case | Example | Page |
|---|---|---|
| Built-in HTML login, consent, and chooser | [`19-default-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/19-default-ui) | [SPA / custom interaction](/use-cases/spa-custom-interaction) |
| Drive UI from a SPA | [`16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction), [`10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login), [`17-spa-composite-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/17-spa-composite-store) | [SPA / custom interaction](/use-cases/spa-custom-interaction) |
| Custom HTML consent page | [`11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) | [Custom consent UI](/use-cases/custom-consent-ui) |
| Custom HTML account chooser | [`12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) | [Custom chooser UI](/use-cases/custom-chooser-ui) |
| Multi-account chooser (`prompt=select_account`) | [`13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) | [Multi-account chooser](/use-cases/multi-account) |
| Cross-origin SPA (CORS) | [`14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa) | [CORS for SPA](/use-cases/cors-spa) |
| Locale negotiation | [`15-i18n-locale`](https://github.com/libraz/go-oidc-provider/tree/main/examples/15-i18n-locale) | [i18n / locale](/use-cases/i18n) |

### Storage

| Use case | Example | Page |
|---|---|---|
| Persist on a real database | [`06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store), [`07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) | [Persistent storage (SQL)](/use-cases/sql-store) |
| Persist on DynamoDB | [`18-dynamodb-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/18-dynamodb-store) | [DynamoDB storage](/use-cases/dynamodb-store) |
| Rename SQL adapter tables | [`25-byo-table-names`](https://github.com/libraz/go-oidc-provider/tree/main/examples/25-byo-table-names) | [Persistent storage (SQL) § Renaming the tables](/use-cases/sql-store#renaming-the-tables) |
| Implement a store from scratch | [`26-byo-store-from-scratch`](https://github.com/libraz/go-oidc-provider/tree/main/examples/26-byo-store-from-scratch) | [Bring your own store backend](/use-cases/byo-store) |
| Hot/cold split (Redis volatile) | [`08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold), [`09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) | [Hot/cold + Redis](/use-cases/hot-cold-redis) |

### Scopes & claims

| Use case | Example | Page |
|---|---|---|
| Public / internal scope split | [`60-scopes-public-private`](https://github.com/libraz/go-oidc-provider/tree/main/examples/60-scopes-public-private) | [Public / internal scopes](/use-cases/scopes) |
| OIDC §5.5 claims request parameter | [`61-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/61-claims-request) | [Claims request](/use-cases/claims-request) |

### Authentication

| Use case | Example | Page |
|---|---|---|
| MFA, captcha, step-up | [`20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp), [`21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa), [`22-login-captcha`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha), [`23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) | [MFA / step-up](/use-cases/mfa-step-up) |
| Email OTP, recovery codes, or passkeys | [`28-email-otp-recovery`](https://github.com/libraz/go-oidc-provider/tree/main/examples/28-email-otp-recovery), [`29-passkey`](https://github.com/libraz/go-oidc-provider/tree/main/examples/29-passkey) | [MFA / step-up](/use-cases/mfa-step-up#where-authenticators-come-from) |
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
| FAPI TLS policy and public-JWKS loading | [`50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) | [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) |

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
