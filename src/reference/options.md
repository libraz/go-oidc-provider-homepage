---
title: Options reference
description: Every public op.With* option in one table — what it sets, when you need it, and where the in-depth page lives.
outline: 2
---

# Options reference

Every public `op.With*` option, grouped by what it touches. The first
four are constructor-required; everything else is optional and refines
the defaults.

::: tip How to read this page
Click the option name for the deep-dive page. The "Section" column tells
you which discovery / endpoint surface the option moves. "Default" is
empty when the option has no built-in default — supplying it is the
only way to enable the behaviour.
:::

## Required (the four `op.New` refuses to start without)

| Option | Value | Section | Default |
|---|---|---|---|
| [`WithIssuer`](/getting-started/required-options#withissuer) | `string` | discovery `issuer`, JWT `iss`, cookie scope | — |
| [`WithStore`](/getting-started/required-options#withstore) | `op.Store` | every persistent substore | — |
| [`WithKeyset`](/getting-started/required-options#withkeyset) | `op.Keyset` (P-256 / ES256) | JWKS, JWS signing | — |
| [`WithCookieKey`](/getting-started/required-options#withcookiekey) / `WithCookieKeys` | 32-byte key(s) | session / CSRF cookie AES-256-GCM | — |

## Profile, features, grants

| Option | Value | Section | Default |
|---|---|---|---|
| `WithProfile` | `profile.Profile` | activates a security profile in one switch (FAPI 2.0 Baseline / Message Signing) | none |
| `WithFeature` | `feature.Feature` (variadic) | enables PAR / DPoP / mTLS / JAR / introspect / revoke / DCR individually | conservative defaults |
| `WithGrants` | `grant.Grant` (variadic) | restricts the grant types accepted at `/token` | `authorization_code`, `refresh_token` |
| `WithScope` | `op.PublicScope` / `op.InternalScope` | extends the scope catalog | `openid`, `profile`, `email`, `offline_access` |
| `WithOpenIDScopeOptional` | `bool` | makes pure-OAuth2 (`scope` without `openid`) acceptable | required |
| `WithStrictOfflineAccess` | `bool` | forbids `refresh_token` issuance unless `offline_access` is also granted | strict |

## Clients & registration

| Option | Value | Section | Default |
|---|---|---|---|
| `WithStaticClients` | `[]op.Client` | seeds the client registry at boot | empty |
| `WithFirstPartyClients` | `[]string` (client IDs) | grants first-party consent skip | none |
| `WithDynamicRegistration` | `op.RegistrationOption` | mounts `/register` (RFC 7591/7592) | disabled |

## Authentication & login flow

| Option | Value | Section | Default |
|---|---|---|---|
| `WithLoginFlow` | `op.LoginFlow` | declarative DAG of `Step` + `Rule` (recommended) | none |
| `WithAuthenticators` | `[]op.Authenticator` | low-level seam (still supported) | none |
| `WithInteraction` / `WithInteractions` | `op.Interaction` (variadic) | non-credential prompts (T&C, KYC) | consent only |
| `WithCaptchaVerifier` | `op.CaptchaVerifier` | upstream captcha provider for `StepCaptcha` | none |
| `WithRiskAssessor` | `op.RiskAssessor` | feeds `RuleRisk` and `LoginContext.RiskScore` | none |
| `WithLoginAttemptObserver` | `op.LoginAttemptObserver` | counts failed attempts for `RuleAfterFailedAttempts` | none |
| `WithMFAEncryptionKey` / `WithMFAEncryptionKeys` | 32-byte key(s) | AES-256-GCM seal of TOTP secrets at rest | none |
| `WithPasskeyAttestation` | `op.PasskeyAttestationPolicy` | WebAuthn attestation conveyance | direct |
| `WithACRPolicy` | `op.ACRPolicy` | step-up acr/aal mapping | identity |

## UI

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSPAUI` | `op.SPAUI` | swaps default HTML driver for SPA-driven JSON (any framework) | HTML |
| `WithConsentUI` | `*template.Template` | overrides default consent page | bundled |
| `WithChooserUI` | `*template.Template` | overrides multi-account selector | bundled |
| `WithCORSOrigins` | `...string` | strict-CORS allowlist (auto-derived from redirect URIs if omitted) | derived |

## Tokens

| Option | Value | Section | Default |
|---|---|---|---|
| `WithAccessTokenFormat` | `op.AccessTokenFormat` | JWT vs opaque, OP-wide | JWT |
| `WithAccessTokenFormatPerAudience` | `func(...) op.AccessTokenFormat` | mixed format by audience | OP-wide value |
| `WithAccessTokenTTL` | `time.Duration` | access token lifetime | 5 min |
| `WithRefreshTokenTTL` | `time.Duration` | refresh token lifetime (non-offline) | 30 days |
| `WithRefreshTokenOfflineTTL` | `time.Duration` | refresh token lifetime when `offline_access` granted | 90 days |
| `WithRefreshGracePeriod` | `time.Duration` (or `-1` to disable) | rotation grace window | 60 s |
| `WithDPoPNonceSource` | `op.DPoPNonceSource` | server-supplied DPoP nonce store | none |

## Discovery & endpoints

| Option | Value | Section | Default |
|---|---|---|---|
| `WithEndpoints` | `op.EndpointPaths` | overrides default endpoint paths | spec defaults |
| `WithMountPrefix` | `string` | embeds an issuer-relative path prefix | `""` |
| `WithClaimsSupported` | `[]string` | populates `claims_supported` in discovery | derived |
| `WithClaimsParameterSupported` | `bool` | toggles `claims_parameter_supported` | false |

## mTLS / proxy / network

| Option | Value | Section | Default |
|---|---|---|---|
| `WithMTLSProxy` | `op.MTLSProxy` | header-based mTLS termination at edge | none |
| `WithTrustedProxies` | `[]netip.Prefix` | resolves `X-Forwarded-*` / `Forwarded` to real client IP | none |
| `WithAllowLocalhostLoopback` | `bool` | accepts `http://127.0.0.1` issuer in dev | false |
| `WithAllowPrivateNetworkJWKS` | `bool` | permits client JWKS hosted on RFC 1918 (test only) | false |
| `WithAllowPrivateNetworkJAR` | `bool` | permits `request_uri` hosted on RFC 1918 (test only) | false |
| `WithBackchannelAllowPrivateNetwork` | `bool` | permits `backchannel_logout_uri` on RFC 1918 (test only) | false |
| `WithBackchannelLogoutHTTPClient` | `*http.Client` | HTTP client for back-channel logout fan-out | default |
| `WithBackchannelLogoutTimeout` | `time.Duration` | per-RP fan-out timeout | 5 s |

## Observability

| Option | Value | Section | Default |
|---|---|---|---|
| `WithLogger` | `*slog.Logger` | structured operational log sink | `slog.Default()` |
| `WithAuditLogger` | `*slog.Logger` | dedicated audit-event log sink | inherits `WithLogger` |
| `WithPrometheus` | `prometheus.Registerer` | registers OP counters on caller's registry (no `/metrics` mounted) | none |

## Operational posture

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSessionDurabilityPosture` | `op.SessionDurabilityPosture` | annotates back-channel logout audit events for SOC | volatile |
| `WithClock` | `op.Clock` | time source (test injection) | `time.Now` |

## What you do *not* configure here

These are deliberate non-options — see the linked design rationale for
why each is fixed:

- **JOSE algorithm allow-list** — fixed at `RS256` / `PS256` / `ES256` /
  `EdDSA`. No flag widens it. See [Security posture §2](/security/posture#_2-the-jose-alg-list-is-a-closed-type).
- **PKCE method** — `S256` only. `plain` is structurally rejected.
- **Cookie scheme** — `__Host-` prefix, AES-256-GCM, double-submit CSRF
  always on. See [Required options §WithCookieKey](/getting-started/required-options#withcookiekey).
- **Random source** — `crypto/rand` only; `math/rand` is forbidden by
  lint.
- **`/metrics` mounting** — your router's job, not the library's. See
  [Use case: Prometheus metrics](/use-cases/prometheus).

## Verifying this list

The catalog is grepped from the live source. To audit:

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhE '^func With[A-Z]' op/options.go op/options_authn.go \
  op/options_protocol.go op/options_fapi_proxy.go op/registration.go \
  | sort -u
```

The shape (function name + receiver + first parameter type) is the
canonical reference; the godoc on each function is the authoritative
contract.
