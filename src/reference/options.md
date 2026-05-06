---
title: Options reference
description: Every public op.With* option in one table — what it sets, when you need it, and where the in-depth page lives.
outline: 2
---

# Options reference

Every public `op.With*` option, grouped by what it touches. The first four are constructor-required; everything else is optional and refines the defaults.

::: tip How to read this page
Click the option name for the deep-dive page. The "Section" column tells you which discovery / endpoint surface the option moves. "Default" is empty when the option has no built-in default — supplying it is the only way to enable the behaviour.
:::

## What option do I need?

This page is a flat reference of every public `op.With*`. With 70+ options the table can be hard to scan when you arrive with a specific goal in mind. Use the decision tree below to find the relevant area, then jump into the matching section of the table.

- **You're booting a fresh OP for the first time** → start with the four required options: [`WithIssuer`](/getting-started/required-options#withissuer), [`WithStore`](/getting-started/required-options#withstore), [`WithKeyset`](/getting-started/required-options#withkeyset), [`WithCookieKeys`](/getting-started/required-options#withcookiekeys). See [Required options](/getting-started/required-options) and the [minimal OP walkthrough](/use-cases/minimal-op).
- **You want to enable FAPI 2.0 in one switch** → `WithProfile(profile.FAPI2Baseline)` (or `profile.FAPI2MessageSigning`, `profile.FAPICIBA`). `profile.IGovHigh` is reserved and rejected today. See [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) and [Concepts: FAPI](/concepts/fapi).
- **You want a single feature without committing to a profile** → `WithFeature(feature.PAR)` / `JAR` / `JARM` / `DPoP` / `MTLS` / `Introspect` / `Revoke`. PKCE is on by default; `DynamicRegistration` is activated implicitly by `WithDynamicRegistration`.
- **You want to restrict the grant types accepted at `/token`** → `WithGrants(grant.AuthorizationCode, grant.RefreshToken, grant.ClientCredentials, grant.DeviceCode, grant.CIBA)`. The convenience options `WithDeviceCodeGrant()`, `WithCIBA(...)`, `WithCustomGrant(...)`, and `RegisterTokenExchange(...)` mount the additional endpoints those grants need.
- **You want sender-constrained access tokens** → DPoP path: `WithFeature(feature.DPoP)` plus optional `WithDPoPNonceSource(op.NewInMemoryDPoPNonceSource(...))`. mTLS path: `WithFeature(feature.MTLS)` plus optional `WithMTLSProxy(headerName, trustedCIDRs)`. See [Concepts: sender-constrained tokens](/concepts/sender-constraint), [DPoP](/concepts/dpop), [mTLS](/concepts/mtls), and [Use case: DPoP nonce](/use-cases/dpop-nonce).
- **You want JWT versus opaque access tokens** → `WithAccessTokenFormat(...)` for the OP-wide default and `WithAccessTokenFormatPerAudience(...)` for RFC 8707 resource-scoped overrides. See [Concepts: access-token format](/concepts/access-token-format).
- **You want pairwise `sub` per sector** → `WithPairwiseSubject(salt)` (32-byte salt minimum). See [Use case: pairwise subject](/use-cases/pairwise-subject).
- **You want to seed clients statically at boot** → `WithStaticClients(op.PublicClient(...), op.ConfidentialClient(...), op.PrivateKeyJWTClient(...))`. See [Concepts: client types](/concepts/client-types).
- **You want Dynamic Client Registration** → `WithDynamicRegistration(...)`. See [Use case: Dynamic Client Registration](/use-cases/dynamic-registration).
- **You want token introspection or revocation endpoints** → `WithFeature(feature.Introspect)` and / or `WithFeature(feature.Revoke)`. The "Profile, features, grants" table below covers fine-tuning.
- **You want to extend the scope catalog** → `WithScope(op.PublicScope("name", "label"))` for OIDC-discovery-visible scopes, `WithScope(op.InternalScope("name"))` for internal-only ones. See [Concepts: scopes and claims](/concepts/scopes-and-claims) and [Use case: scopes](/use-cases/scopes).
- **You want a custom `grant_type`** → `WithCustomGrant(handler)`. See [Use case: custom grant](/use-cases/custom-grant).
- **You want internationalization (i18n)** → `WithDefaultLocale(...)`, `WithLocale(bundle)`, `WithPreferredLocaleStore(...)`. See [Use case: i18n](/use-cases/i18n).
- **You want JWE encryption of id_token / userinfo / JARM / introspection** → `WithEncryptionKeyset(...)` and optionally `WithSupportedEncryptionAlgs(algs, encs)` to narrow the default allow-list. See [Use case: JWE encryption](/use-cases/jwe-encryption).
- **You want CORS for SPA clients** → `WithCORSOrigins(...)`. See [Use case: CORS for SPA](/use-cases/cors-spa).
- **You want Prometheus metrics** → `WithPrometheus(registry)`. The library does not mount `/metrics`; expose the registry from your own router. See [Use case: Prometheus metrics](/use-cases/prometheus).
- **You want audit logging on a separate sink from app logs** → `WithAuditLogger(*slog.Logger)`. See [Audit event catalog](/reference/audit-events).
- **You want to swap the entire interaction surface for a SPA** → `WithInteractionDriver(interaction.Driver)`. See [Use case: SPA custom interaction](/use-cases/spa-custom-interaction).

## Required (the four `op.New` refuses to start without)

| Option | Value | Section | Default |
|---|---|---|---|
| [`WithIssuer`](/getting-started/required-options#withissuer) | `string` | discovery `issuer`, JWT `iss`, cookie scope | — |
| [`WithStore`](/getting-started/required-options#withstore) | `op.Store` | every persistent substore | — |
| [`WithKeyset`](/getting-started/required-options#withkeyset) | `op.Keyset` (P-256 / ES256) | JWKS, JWS signing | — |
| [`WithCookieKeys`](/getting-started/required-options#withcookiekeys) | 32-byte key(s) | session / CSRF cookie AES-256-GCM | — |

## Profile, features, grants

| Option | Value | Section | Default |
|---|---|---|---|
| `WithProfile` | `profile.Profile` | activates a security profile in one switch (FAPI 2.0 Baseline / Message Signing / FAPI-CIBA). `profile.IGovHigh` is reserved for v2+ and currently rejected at `op.New` because its runtime constraints have not landed. | none |
| `WithFeature` | `feature.Flag` (one per call; repeatable) | enables PAR / DPoP / mTLS / JAR / JARM / introspect / revoke individually | conservative defaults |
| `WithGrants` | `...grant.Type` (variadic) | restricts the grant types accepted at `/token` | `authorization_code`, `refresh_token` |
| `WithScope` | `op.Scope` (one per call; use the `op.PublicScope` / `op.InternalScope` constructors) | extends the scope catalog | `openid`, `profile`, `email`, `address`, `phone`, `offline_access` |
| `WithOpenIDScopeOptional` | _(no args)_ | makes pure-OAuth2 (`scope` without `openid`) acceptable | required |
| `WithStrictOfflineAccess` | _(no args)_ | gates `refresh_token` issuance behind explicit `offline_access` consent | lax (refresh on any `openid` grant) |

## Clients & registration

| Option | Value | Section | Default |
|---|---|---|---|
| `WithStaticClients` | `...op.ClientSeed` (use `op.PublicClient` / `op.ConfidentialClient` / `op.PrivateKeyJWTClient`) | seeds the client registry at boot | empty |
| `WithFirstPartyClients` | `...string` (client IDs) | grants first-party consent skip | none |
| `WithDynamicRegistration` | `op.RegistrationOption` | mounts `/register` (RFC 7591/7592) | disabled |

## Authentication & login flow

| Option | Value | Section | Default |
|---|---|---|---|
| `WithLoginFlow` | `op.LoginFlow` | declarative DAG of `Step` + `Rule` (recommended) | none |
| `WithAuthenticators` | `...op.Authenticator` (variadic) | low-level seam (mutually exclusive with `WithLoginFlow`) | none |
| `WithInteractionDriver` | `interaction.Driver` | swaps the entire interaction transport (HTML driver / SPA driver / custom) | bundled HTML driver |
| `WithInteractions` | `...op.Interaction` (variadic) | non-credential prompts (T&C, KYC) layered on top of the driver | consent only |
| `WithCaptchaVerifier` | `op.CaptchaVerifier` | upstream captcha provider for `StepCaptcha` | none |
| `WithRiskAssessor` | `op.RiskAssessor` | feeds `RuleRisk` and `LoginContext.RiskScore` | none |
| `WithLoginAttemptObserver` | `op.LoginAttemptObserver` | counts failed attempts for `RuleAfterFailedAttempts` | none |
| `WithMFAEncryptionKeys` | 32-byte key(s) | AES-256-GCM seal of TOTP secrets at rest | none |
| `WithAuthnLockoutStore` | `op.AuthnLockoutStore` | persists per-subject failed-attempt counters consulted by `RuleAfterFailedAttempts` | in-memory |
| `WithACRPolicy` | `op.ACRPolicy` (interface) | step-up acr/aal mapping | identity |

## UI

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSPAUI` | `op.SPAUI` (struct: `LoginMount` / `ConsentMount` / `LogoutMount` / `StaticDir`) | reserved for the v1.0 surface; **`op.New` returns a configuration error if set today**. Use `WithInteractionDriver(interaction.JSONDriver{})` and serve the SPA shell from your own router. | rejected |
| `WithConsentUI` | `op.ConsentUI` (wraps a `*html/template.Template`) | reserved for the v1.0 surface; **`op.New` returns a configuration error if set today**. Customise via `WithLocale` overlays or the JSON driver. | rejected |
| `WithChooserUI` | `op.ChooserUI` (wraps a `*html/template.Template`) | reserved for the v1.0 surface; **`op.New` returns a configuration error if set today**. The bundled chooser template still renders. | rejected |
| `WithCORSOrigins` | `...string` | strict-CORS allowlist (auto-derived from redirect URIs if omitted) | derived |
| `WithDefaultLocale` | `op.Locale` (BCP 47 tag) | default UI locale when the request carries no `ui_locales` | `"en"` |
| `WithLocale` | `op.LocaleBundle` (one per call; repeatable) | registers a per-locale message bundle for the bundled HTML driver | English + Japanese seed |
| `WithPreferredLocaleStore` | `op.PreferredLocaleStore` | per-user locale override consulted at the head of the §L.2 chain | none |

## Tokens

| Option | Value | Section | Default |
|---|---|---|---|
| `WithAccessTokenFormat` | `op.AccessTokenFormat` (`AccessTokenFormatJWT` / `AccessTokenFormatOpaque`) | JWT vs opaque, OP-wide | JWT |
| `WithAccessTokenFormatPerAudience` | `map[string]op.AccessTokenFormat` (RFC 8707 resource → format) | mixed format by audience | OP-wide value |
| `WithAccessTokenRevocationStrategy` | `op.AccessTokenRevocationStrategy` (`RevocationStrategyGrantTombstone` / `RevocationStrategyJTIRegistry` / `RevocationStrategyNone`) | revocation policy for issued JWT access tokens; `GrantTombstone` (default) needs `Store.GrantRevocations()`, `JTIRegistry` needs `Store.AccessTokens()` — both checked at `op.New` | grant tombstone |
| `WithAccessTokenTTL` | `time.Duration` | access token lifetime | 5 min |
| `WithRefreshTokenTTL` | `time.Duration` | refresh token lifetime (non-offline) | 30 days |
| `WithRefreshTokenOfflineTTL` | `time.Duration` | refresh token lifetime when `offline_access` granted | inherits `WithRefreshTokenTTL` (zero value defers) |
| `WithRefreshGracePeriod` | `time.Duration` (zero disables; negative rejected) | rotation grace window | 60 s |
| `WithDPoPNonceSource` | `op.DPoPNonceSource` (interface) | server-supplied DPoP nonce store (`op.NewInMemoryDPoPNonceSource` provides one) | none |

## Discovery & endpoints

| Option | Value | Section | Default |
|---|---|---|---|
| `WithEndpoints` | `op.Endpoints` (struct: per-endpoint path overrides) | overrides default endpoint paths | spec defaults |
| `WithMountPrefix` | `string` (must start with `/`; pass `/` for root) | embeds an issuer-relative path prefix | `/oidc` |
| `WithClaimsSupported` | `...string` (variadic) | populates `claims_supported` in discovery | omitted |
| `WithClaimsParameterSupported` | `bool` | toggles `claims_parameter_supported`; `false` also makes authorize / PAR ignore `claims` payloads after malformed JSON has been rejected | true |
| `WithACRValuesSupported` | `...string` (variadic) | publishes `acr_values_supported`; FAPI / eIDAS / NIST 800-63 deployments use this to advertise honored ACR values | empty (omitted from discovery) |
| `WithDiscoveryMetadata` | `op.DiscoveryMetadata` (typed `service_documentation`, policy / TOS / UI locale / mTLS alias fields plus `Extra map[string]any`) | injects RFC 8414 / OIDC Discovery metadata not owned by the OP; `Extra` keys that collide with OP-controlled fields are rejected | none |
| `WithJWKSRotationActive` | `func() bool` | predicate that flips JWKS `Cache-Control` to short-cache during a rotation window | always long-cache |

## Subject strategy

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSubjectGenerator` | `op.SubjectGenerator` (interface) | overrides the `sub` claim derivation; the in-tree `op/subject.UUIDv7` is the default | UUIDv7 passthrough |
| `WithPairwiseSubject` | `[]byte` salt (≥ 32 bytes) | enables OIDC Core §8.1 pairwise sub derivation per sector; mid-life switching is rejected at `op.New` | public (UUIDv7) |

See [Use case: pairwise subject](/use-cases/pairwise-subject).

## Grants — Device Code, CIBA, Custom, Token Exchange

| Option | Value | Section | Default |
|---|---|---|---|
| `WithDeviceCodeGrant` | _(no args)_ | enables the RFC 8628 device-authorization grant; mounts `/device_authorization` and registers the URN at `/token` | disabled |
| `WithDeviceVerificationURI` | `string` (absolute URL) | overrides the verification URI advertised on the device's display (default `<issuer>/device`) | derived |
| `WithCIBA` | `...op.CIBAOption` | enables CIBA poll mode; mounts `/bc-authorize` and registers the CIBA URN. Sub-options: `WithCIBAHintResolver` (required), `WithCIBADefaultExpiresIn`, `WithCIBAMaxExpiresIn`, `WithCIBAPollInterval`, `WithCIBAMaxPollViolations` | disabled |
| `WithCustomGrant` | `op.CustomGrantHandler` | registers an embedder-defined `grant_type` URN at `/token`; the handler returns a verbatim access token or a `BoundAccessToken` request the OP signs | none |
| `RegisterTokenExchange` | `op.TokenExchangePolicy` | enables the RFC 8693 token-exchange grant; the policy decides admission per request and may narrow OP-computed defaults | disabled |

See [Use case: device code](/use-cases/device-code), [CIBA](/use-cases/ciba), [Custom grant](/use-cases/custom-grant), [Token exchange](/use-cases/token-exchange).

## Encryption (JWE)

| Option | Value | Section | Default |
|---|---|---|---|
| `WithEncryptionKeyset` | `op.EncryptionKeyset` (RSA ≥ 2048 / EC P-256/384/521 private keys, `use=enc`) | publishes encryption JWKs; required for inbound JWE request objects and outbound JWE responses (id_token / userinfo / JARM / introspection) | none |
| `WithSupportedEncryptionAlgs` | `(algs []string, encs []string)` | narrows the v0.9.1 default allow-list (`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`); cannot extend it | full allow-list |

See [Use case: JWE encryption](/use-cases/jwe-encryption).

## mTLS / proxy / network

| Option | Value | Section | Default |
|---|---|---|---|
| `WithMTLSProxy` | `(headerName string, trustedCIDRs []string)` | header-based mTLS termination at edge | none |
| `WithTrustedProxies` | `...string` (CIDRs) | resolves `X-Forwarded-*` / `Forwarded` to real client IP | none |
| `WithTrustedProxyHosts` | `...string` (hostnames) | extends the `X-Forwarded-Host` allowlist beyond the canonical issuer host when trusted proxy CIDRs are configured | issuer host only |
| `WithAllowLocalhostLoopback` | _(no args)_ | accepts `http://127.0.0.1` issuer in dev | strict (HTTPS only) |
| `WithAllowPrivateNetworkJWKS` | _(no args)_ | permits client JWKS hosted on RFC 1918 (test only) | denied |
| `WithAllowPrivateNetworkJAR` | _(no args)_ | permits `request_uri` hosted on RFC 1918 (test only) | denied |
| `WithAllowPrivateNetworkSector` | _(no args)_ | permits `sector_identifier_uri` hosted on RFC 1918 during dynamic registration (test / private RP networks only) | denied |
| `WithJWKSHTTPTransport` | `http.RoundTripper` | custom transport for RP-controlled JWKS fetches used by JAR and `private_key_jwt`, while preserving the dial-time SSRF gate | system-trust transport |
| `WithBackchannelAllowPrivateNetwork` | `bool` | permits `backchannel_logout_uri` on RFC 1918 (test only) | false |
| `WithBackchannelLogoutHTTPClient` | `*http.Client` | HTTP client for back-channel logout fan-out | default |
| `WithBackchannelLogoutTimeout` | `time.Duration` | per-RP fan-out timeout | 5 s |

## Observability

| Option | Value | Section | Default |
|---|---|---|---|
| `WithLogger` | `*slog.Logger` | structured operational log sink (handler is wrapped with the redaction middleware) | discard |
| `WithAuditLogger` | `*slog.Logger` | dedicated audit-event log sink | inherits `WithLogger` |
| `WithPrometheus` | `*prometheus.Registry` | registers OP counters on caller's registry (no `/metrics` mounted) | none |

## Operational posture

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSessionDurabilityPosture` | `op.SessionDurabilityPosture` | annotates back-channel logout audit events for SOC | volatile |
| `WithClock` | `op.Clock` | time source (test injection) | `time.Now` |

## What you do *not* configure here

These are deliberate non-options — see the linked design rationale for why each is fixed:

- **JOSE algorithm allow-list** — fixed at `RS256` / `PS256` / `ES256` / `EdDSA`. No flag widens it. See [Security posture §2](/security/posture#_2-the-jose-alg-list-is-a-closed-type).
- **PKCE method** — `S256` only. `plain` is structurally rejected.
- **Cookie scheme** — `__Host-` prefix, AES-256-GCM, double-submit CSRF always on. See [Required options §WithCookieKeys](/getting-started/required-options#withcookiekeys).
- **Random source** — `crypto/rand` only; `math/rand` is forbidden by lint.
- **`/metrics` mounting** — your router's job, not the library's. See [Use case: Prometheus metrics](/use-cases/prometheus).

## Verifying this list

The catalog is grepped from the live source. To audit:

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhE '^func With[A-Z]|^func RegisterTokenExchange' \
  op/options.go op/options_authn.go op/options_clients.go \
  op/options_ciba.go op/options_customgrant.go op/options_devicecode.go \
  op/options_discovery.go op/options_encryption.go op/options_features.go \
  op/options_fapi_proxy.go op/options_protocol.go op/options_session.go \
  op/options_subject.go op/access_token_revocation.go op/i18n.go \
  op/registration.go \
  | sort -u
```

The shape (function name + receiver + first parameter type) is the canonical reference; the godoc on each function is the authoritative contract.
