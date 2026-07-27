---
title: Options reference
description: Every public op.New option in one table — what it sets, when you need it, and where the in-depth page lives.
outline: 2
pageClass: pg-reference-options
---

# Options reference

Every public option accepted by `op.New`, grouped by what it touches. The first four are constructor-required; everything else is optional and refines the defaults.

::: tip How to read this page
Click the option name for the deep-dive page. The "Section" column tells you which discovery / endpoint surface the option moves. "Default" is empty when the option has no built-in default — supplying it is the only way to enable the behaviour.
:::

## What option do I need?

This page is a flat reference of the public `op.New` options. With 70+ options the table can be hard to scan when you arrive with a specific goal in mind. Use the decision tree below to find the relevant area, then jump into the matching section of the table.

<svg class="opt-tree" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="opt-decision-title" viewBox="0 0 700 512" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="opt-decision-title">Decision tree routing a configuration goal — fresh OP, FAPI switch, single feature, grant restriction, sender-constraint, or token format — to the op.New option that handles it, falling through to the full table.</title>
  <rect x="24" y="24" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="54" text-anchor="middle">Booting a fresh OP?</text>
  <rect class="od-sop" x="430" y="28" width="246" height="44" rx="22"/>
  <text class="od-b od-op" x="553" y="55" text-anchor="middle">Required options</text>
  <line x1="324" y1="50" x2="426" y2="50"/>
  <path d="M419 46 L426 50 L419 54"/>
  <text class="od-s od-t2" x="376" y="42" text-anchor="middle">Yes</text>
  <line x1="174" y1="76" x2="174" y2="94"/>
  <path d="M170 87 L174 94 L178 87"/>
  <text class="od-s od-t2" x="190" y="90">No</text>
  <rect x="24" y="96" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="126" text-anchor="middle">Enable FAPI 2.0 in one switch?</text>
  <rect class="od-sop" x="430" y="100" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="126" text-anchor="middle">WithProfile(...)</text>
  <line x1="324" y1="122" x2="426" y2="122"/>
  <path d="M419 118 L426 122 L419 126"/>
  <text class="od-s od-t2" x="376" y="114" text-anchor="middle">Yes</text>
  <line x1="174" y1="148" x2="174" y2="166"/>
  <path d="M170 159 L174 166 L178 159"/>
  <text class="od-s od-t2" x="190" y="162">No</text>
  <rect x="24" y="168" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="198" text-anchor="middle">Just one feature, no profile?</text>
  <rect class="od-sop" x="430" y="172" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="198" text-anchor="middle">WithFeature(...)</text>
  <line x1="324" y1="194" x2="426" y2="194"/>
  <path d="M419 190 L426 194 L419 198"/>
  <text class="od-s od-t2" x="376" y="186" text-anchor="middle">Yes</text>
  <line x1="174" y1="220" x2="174" y2="238"/>
  <path d="M170 231 L174 238 L178 231"/>
  <text class="od-s od-t2" x="190" y="234">No</text>
  <rect x="24" y="240" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="270" text-anchor="middle">Restrict grants at <tspan class="od-m">/token</tspan>?</text>
  <rect class="od-sop" x="430" y="244" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="270" text-anchor="middle">WithGrants(...)</text>
  <line x1="324" y1="266" x2="426" y2="266"/>
  <path d="M419 262 L426 266 L419 270"/>
  <text class="od-s od-t2" x="376" y="258" text-anchor="middle">Yes</text>
  <line x1="174" y1="292" x2="174" y2="310"/>
  <path d="M170 303 L174 310 L178 303"/>
  <text class="od-s od-t2" x="190" y="306">No</text>
  <rect x="24" y="312" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="342" text-anchor="middle">Sender-constrained access tokens?</text>
  <rect class="od-sop" x="430" y="316" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="342" text-anchor="middle">WithFeature(DPoP|MTLS)</text>
  <line x1="324" y1="338" x2="426" y2="338"/>
  <path d="M419 334 L426 338 L419 342"/>
  <text class="od-s od-t2" x="376" y="330" text-anchor="middle">Yes</text>
  <line x1="174" y1="364" x2="174" y2="382"/>
  <path d="M170 375 L174 382 L178 375"/>
  <text class="od-s od-t2" x="190" y="378">No</text>
  <rect x="24" y="384" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="414" text-anchor="middle">JWT vs opaque access tokens?</text>
  <rect class="od-sop" x="430" y="388" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="414" text-anchor="middle">WithAccessTokenFormat(...)</text>
  <line x1="324" y1="410" x2="426" y2="410"/>
  <path d="M419 406 L426 410 L419 414"/>
  <text class="od-s od-t2" x="376" y="402" text-anchor="middle">Yes</text>
  <line x1="174" y1="436" x2="174" y2="454"/>
  <path d="M170 447 L174 454 L178 447"/>
  <text class="od-s od-t2" x="190" y="450">No</text>
  <rect x="24" y="456" width="652" height="48" rx="6"/>
  <text class="od-b od-t1" x="350" y="484" text-anchor="middle">None match — browse the full option table below by section.</text>
</svg>

- **You're booting a fresh OP for the first time** → start with [`WithIssuer`](/getting-started/required-options#withissuer), [`WithStore`](/getting-started/required-options#withstore), [`WithKeyset`](/getting-started/required-options#withkeyset), and usually [`WithCookieKeys`](/getting-started/required-options#withcookiekeys). `WithCookieKeys` is required when `authorization_code` is enabled, which is the default grant set. See [Required options](/getting-started/required-options) and the [minimal OP walkthrough](/use-cases/minimal-op).
- **You want to declare OAuth 2.1 posture without adopting FAPI** → `WithProfile(profile.Baseline)` requires PKCE on every authorization-code request and otherwise keeps the OIDC Core defaults. For FAPI 2.0, use `profile.FAPI2Baseline` (or `profile.FAPI2MessageSigning`, `profile.FAPICIBA`); these profiles auto-select DPoP unless you explicitly enable mTLS. A profile that needs a grant you did not wire fails `op.New` rather than mounting the endpoint for you — `profile.FAPICIBA` requires `grant.CIBA`. See [Declaring a security profile](/use-cases/security-profile), [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) and [Concepts: FAPI](/concepts/fapi).
- **You want a single feature without committing to a profile** → `WithFeature(feature.PAR)` / `JAR` / `JARM` / `DPoP` / `MTLS` / `Introspect` / `Revoke`. Public and native clients always require PKCE; FAPI profiles require it for every authorization-code client. Dynamic Registration, RAR, and Grant Management are enabled through their dedicated options because they need extra configuration.
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

## Required and conditionally required

| Option | Value | Section | Default |
|---|---|---|---|
| [`WithIssuer`](/getting-started/required-options#withissuer) | `string` | discovery `issuer`, JWT `iss`, cookie scope | — |
| [`WithStore`](/getting-started/required-options#withstore) | `store.Store` | every protocol-state substore | — |
| `WithUserStore` | `store.UserStore` | reads ID Token and `/userinfo` claims from an application-owned user store without wrapping the `WithStore` backend | `WithStore(...).Users()` |
| [`WithKeyset`](/getting-started/required-options#withkeyset) | `op.Keyset` (P-256 / ES256) | JWKS, JWS signing | — |
| [`WithCookieKeys`](/getting-started/required-options#withcookiekeys) | 32-byte key(s) | session / CSRF cookie AES-256-GCM | required when `authorization_code` is enabled |

## Profile, features, grants

| Option | Value | Section | Default |
|---|---|---|---|
| `WithProfile` | `profile.Profile` | declares `profile.Baseline` (OAuth 2.1: PKCE on every authorization-code request) or a FAPI profile. FAPI profiles select DPoP when they require DPoP-or-mTLS and mTLS was not explicitly enabled. Missing features a profile requires are switched on for you; a missing **grant** fails `op.New` instead, with the error naming the option that activates it. | none |
| `WithFeature` | `feature.Flag` (one per call; repeatable) | enables PAR / DPoP / mTLS / JAR / JARM / introspect / revoke individually | conservative defaults |
| `WithGrants` | `...grant.Type` (variadic) | restricts the grant types accepted at `/token`; may be called at most once, so compose the full set before passing options to `op.New` | `authorization_code`, `refresh_token` |
| `WithScope` | `op.Scope` (one per call; use the `op.PublicScope` / `op.InternalScope` constructors) | extends the scope catalog | `openid`, `profile`, `email`, `address`, `phone`, `offline_access` |
| `WithOpenIDScopeOptional` | _(no args)_ | makes pure OAuth 2.0 (`scope` without `openid`) acceptable | `openid` required |
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
| `WithAuthnLockoutStore` | `store.AuthnLockoutStore` | persists per-subject failed-attempt counters consulted by `RuleAfterFailedAttempts` | none |
| `WithACRPolicy` | `op.ACRPolicy` (interface) | step-up acr/aal mapping | identity |

Leaving `WithAuthnLockoutStore` unset disables cross-factor tracking, so only the built-in per-factor TOTP / email-OTP counters apply. Set it to activate cross-factor tracking for the built-in possession / recovery factors (`StepTOTP`, `StepEmailOTP`, `StepRecoveryCode`). It does not automatically wrap primary password / passkey authentication or `ExternalStep` custom factors; those remain owned by the embedder's user store or custom authenticator. The SQL and DynamoDB adapters both expose durable stores through `AuthnLockouts()`; `inmem.Store.AuthnLockouts()` is process-local and resets on restart.

Authentication-factor records are intentionally outside `store.Store`. `StepTOTP`, `PrimaryPasskey`, `StepRecoveryCode`, and `StepEmailOTP` receive their own stores because enrollment schema, encryption keys, and account-recovery policy belong to the embedding application. In-memory, SQL, and DynamoDB adapters expose the matching accessors. [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) uses the shipped SQL adapter's factor stores alongside the core OP tables; implement the factor-store contracts yourself only for another backend.

Two factor-store contracts matter for durability-sensitive deployments. `store.EmailOTPStore.Get` must keep records readable until `EmailOTPRecord.RetainUntil`, not merely until the code's `ExpiresAt`, so resend caps and brute-force counters survive an expired code. `store.RecoveryStore.Consume` must compare the presented code hash with the currently stored slot and reject stale hashes, so regenerated recovery batches revoke old leaked codes instead of burning a slot in the new batch.

## UI

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSPAUI` | `op.SPAUI` (struct: `LoginMount` / `ConsentMount` / `LogoutMount` / `StaticDir`) | mounts the SPA shell and static asset tree while the OP serves the JSON interaction state surface | off |
| `WithConsentUI` | `op.ConsentUI` (wraps a `*html/template.Template`) | renders consent with an embedder-supplied HTML template; OP still owns state, CSRF, and persistence | bundled template |
| `WithChooserUI` | `op.ChooserUI` (wraps a `*html/template.Template`) | renders `prompt=select_account` with an embedder-supplied HTML template | bundled template |
| `WithCORSOrigins` | `...string` | strict-CORS allowlist (auto-derived from redirect URIs if omitted) | derived |
| `WithDefaultLocale` | `op.Locale` (BCP 47 tag) | default UI locale when the request carries no `ui_locales` | `"en"` |
| `WithLocale` | `op.LocaleBundle` (one per call; repeatable) | registers a per-locale message bundle for the bundled HTML driver | English + Japanese seed |
| `WithPreferredLocaleStore` | `op.PreferredLocaleStore` | per-user locale override consulted at the head of the §L.2 chain | none |

`WithSPAUI` is mutually exclusive with `WithConsentUI`: both own the consent rendering surface. `WithChooserUI` may be configured alongside `WithSPAUI`, but SPA mode owns the chooser through the JSON state envelope; the chooser template is ignored and `op.New` emits a structured warning. See [Custom chooser UI](/use-cases/custom-chooser-ui).

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

`WithInMemoryDPoPNonceLogger` is a helper option for `op.NewInMemoryDPoPNonceSource`, not an `op.New` option. Use it only when you use the bundled in-memory nonce source.

## Discovery & endpoints

| Option | Value | Section | Default |
|---|---|---|---|
| `WithEndpoints` | `op.Endpoints` (struct: per-endpoint path overrides) | overrides default endpoint paths | spec defaults |
| `WithMountPrefix` | `string` (must start with `/`; pass `/` for root) | embeds an issuer-relative path prefix | `/oidc` |
| `WithClaimsSupported` | `...string` (variadic) | populates `claims_supported` in discovery | omitted |
| `WithClaimsParameterSupported` | `bool` | toggles `claims_parameter_supported`; `false` also makes authorize / PAR ignore `claims` payloads after malformed JSON has been rejected | true |
| `WithACRValuesSupported` | `...string` (variadic) | publishes `acr_values_supported`; FAPI / eIDAS / NIST 800-63 deployments use this to advertise honored ACR values | empty (omitted from discovery) |
| `WithDiscoveryMetadata` | `op.DiscoveryMetadata` (typed `service_documentation`, policy / TOS / UI locale / mTLS alias fields plus `Extra map[string]any`) | injects RFC 8414 / OIDC Discovery metadata not owned by the OP; `UILocalesSupported` overrides the auto-derived locale list when non-empty, and `Extra` keys that collide with OP-controlled fields are rejected | none |
| `WithPARLifetime` | `time.Duration` | overrides the lifetime of `request_uri` values issued by `/par`; expiry is checked when the browser presents the URI at `/authorize`, while later code emission remains single-use | 60 s |
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
| `WithDeviceCodeExpiry` | `time.Duration` | overrides the `expires_in` lifetime for newly issued `device_code` records; independent of the access-token TTL | 10 min |
| `WithDeviceCodePollInterval` | `time.Duration` | overrides the advertised polling `interval`; clients polling faster receive `slow_down` | 5 s |
| `WithCIBA` | `...op.CIBAOption` | enables CIBA poll mode; mounts `/bc-authorize` and registers the CIBA URN. Sub-options: `WithCIBAHintResolver` (required), `WithCIBADefaultExpiresIn`, `WithCIBAMaxExpiresIn`, `WithCIBAPollInterval`, `WithCIBAMaxPollViolations` | disabled |
| `WithCustomGrant` | `op.CustomGrantHandler` | registers an embedder-defined `grant_type` URN at `/token`; the handler returns a verbatim access token or a `BoundAccessToken` request the OP signs | none |
| `RegisterTokenExchange` | `op.TokenExchangePolicy` | enables the RFC 8693 token-exchange grant; the policy decides admission per request and may narrow OP-computed defaults | disabled |

`WithDeviceCodeExpiry` and `WithDeviceCodePollInterval` are intentionally not derived from `WithAccessTokenTTL`; short-lived access tokens should not make a TV / CLI pairing ceremony expire before the user can reach the second screen. See [Use case: device code](/use-cases/device-code), [CIBA](/use-cases/ciba), [Custom grant](/use-cases/custom-grant), [Token exchange](/use-cases/token-exchange).

## Authorization features — RAR, Grant Management, Protected Resource Metadata

| Option | Value | Section | Default |
|---|---|---|---|
| `WithAuthorizationDetailTypes` | `...op.AuthorizationDetailType` | enables RFC 9396 Rich Authorization Requests; registers each accepted `type` with its validator. `authorization_details` is then validated at `/authorize`, `/par`, `/token`, persisted on the grant, echoed on JWT access tokens and introspection, and advertised in discovery. A nil `Validate` is rejected at `op.New` | disabled |
| `WithGrantManagement` | `(actions []op.GrantManagementAction, actionRequired bool)` | enables the OAuth 2.0 Grant Management draft; honours `grant_management_action` / `grant_id`, mounts the query / revoke endpoint, stamps `grant_id` on the token response, and advertises the configured action set in discovery. Experimental (tracks an IETF draft) | disabled |
| `WithProtectedResources` | `...op.ProtectedResource` | publishes RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource` plus each resource path suffix, with the issuer in `authorization_servers` | none |

`op.StepUpChallenge(realm, acrValues, maxAge)` is a standalone helper (not an `op.New` option) that builds the RFC 9470 `WWW-Authenticate: Bearer` challenge an embedder's resource server returns; the OP itself never emits it.

See [Rich authorization requests](/use-cases/authorization-details), [Grant management](/use-cases/grant-management), [Protected resource metadata](/use-cases/protected-resource-metadata), [MFA / step-up](/use-cases/mfa-step-up).

## Encryption (JWE)

| Option | Value | Section | Default |
|---|---|---|---|
| `WithEncryptionKeyset` | `op.EncryptionKeyset` (RSA ≥ 2048 / EC P-256/384/521 private keys, `use=enc`) | publishes encryption JWKs; required for inbound JWE request objects and outbound JWE responses (id_token / userinfo / JARM / introspection) | none |
| `WithSupportedEncryptionAlgs` | `(algs []string, encs []string)` | narrows the default allow-list (`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`); cannot extend it | full allow-list |

See [Use case: JWE encryption](/use-cases/jwe-encryption).

## mTLS / proxy / network

| Option | Value | Section | Default |
|---|---|---|---|
| `WithMTLSProxy` | `(headerName string, trustedCIDRs []string)` | header-based mTLS termination at edge | none |
| `WithTrustedProxies` | `...string` (CIDRs) | resolves `X-Forwarded-*` / `Forwarded` to real client IP | none |
| `WithTrustedProxyHosts` | `...string` (hostnames) | extends the `X-Forwarded-Host` allowlist beyond the canonical issuer host when trusted proxy CIDRs are configured | issuer host only |
| `WithAllowLocalhostLoopback` | _(no args)_ | admits textual `localhost` in the RFC 8252 loopback carve-out for dev / native-app demos, **and in the issuer itself**; literal `127.0.0.1` / `[::1]` remain the strict defaults | strict literal loopback only |
| `WithAllowPrivateNetworkJWKS` | _(no args)_ | permits client JWKS hosted on RFC 1918 (test only) | denied |
| `WithAllowPrivateNetworkJAR` | _(no args)_ | permits `request_uri` hosted on RFC 1918 (test only) | denied |
| `WithAllowPrivateNetworkSector` | _(no args)_ | permits `sector_identifier_uri` hosted on RFC 1918 during dynamic registration (test / private RP networks only) | denied |
| `WithJWKSHTTPTransport` | `http.RoundTripper` | custom transport for RP-controlled JWKS fetches used by JAR and `private_key_jwt`, while preserving the dial-time SSRF gate | system-trust transport |
| `WithBackchannelAllowPrivateNetwork` | `bool` | permits `backchannel_logout_uri` on RFC 1918 (test only) | false |
| `WithAllowInsecureBackchannelLogoutForDev` | _(no args)_ | admits plain-HTTP loopback `backchannel_logout_uri` values and delivery only for dev / CI fixtures | denied |
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

- **JOSE verification allow-list** — incoming client assertions, JAR request objects, and DPoP proofs use the fixed `RS256` / `PS256` / `ES256` / `EdDSA` verification set. OP-issued JWTs are signed with `ES256` only. No flag widens either surface. See [Security posture §2](/security/posture#_2-the-jose-alg-list-is-a-closed-type).
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
  op/registration.go op/authorization_details.go op/grant_management.go \
  op/protected_resource.go \
  | sort -u
```

The shape (function name + receiver + first parameter type) is the canonical reference; the godoc on each function is the authoritative contract.
