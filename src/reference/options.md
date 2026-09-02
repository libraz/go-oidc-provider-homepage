---
title: Options reference
description: Every public op.New option in one table — what it sets, when you need it, and where the in-depth page lives.
outline: 2
pageClass: pg-reference-options
---

# Options reference

Every public option accepted by `op.New`, grouped by what it touches. `WithIssuer`, `WithStore`, and `WithKeyset` are always required. `WithCookieKeys` is required when the `authorization_code` grant is enabled, including by the default grant set; everything else is optional and refines the defaults.

::: tip How to read this page
Click the option name for the deep-dive page. The "Section" column tells you which discovery / endpoint surface the option moves. "Default" is empty when the option has no built-in default — supplying it is the only way to enable the behaviour.
:::

## What option do I need?

This page is a flat reference of the public `op.New` options. With 70+ options the table can be hard to scan when you arrive with a specific goal in mind. Use the decision tree below to find the relevant area, then jump into the matching section of the table.

<figure class="fig">
  <div class="fig-head">Which option do you actually need?</div>
  <svg class="fig-svg" role="img" aria-labelledby="options-decision-title" viewBox="0 0 960 566" xmlns="http://www.w3.org/2000/svg">
    <title id="options-decision-title">A decision tree that routes a configuration goal — booting a fresh OP, switching on FAPI, enabling one feature, restricting grants, adding a sender constraint, or choosing a token format — to the op.New option that handles it, and falls through to the full option table.</title>
    <!-- 1 -->
    <rect class="fg-box" x="36" y="24" width="394" height="58" rx="8"/>
    <text class="fg-s" x="56" y="50">Booting a fresh OP</text>
    <text class="fg-xs" x="56" y="70">nothing works yet</text>
    <path class="fg-edge" d="M434,53 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="46" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="530" y="24" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="48">The required options</text>
    <text class="fg-xs" x="550" y="70">issuer · store · keyset, plus cookie keys with the code grant</text>
    <path class="fg-edge" d="M233,86 V104" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="100">no</text>
    <!-- 2 -->
    <rect class="fg-box" x="36" y="108" width="394" height="58" rx="8"/>
    <text class="fg-s" x="56" y="134">Turning on FAPI 2.0 in one switch</text>
    <text class="fg-xs" x="56" y="154">you want the whole profile, not pieces of it</text>
    <path class="fg-edge" d="M434,137 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="130" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="530" y="108" width="394" height="58" rx="8"/>
    <text class="fg-m fg-accent" x="550" y="134">op.WithProfile(…)</text>
    <text class="fg-xs" x="550" y="154">pins every mandate the profile requires at once</text>
    <path class="fg-edge" d="M233,170 V188" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="184">no</text>
    <!-- 3 -->
    <rect class="fg-box" x="36" y="192" width="394" height="58" rx="8"/>
    <text class="fg-s" x="56" y="218">One feature, without a profile</text>
    <text class="fg-xs" x="56" y="238">PAR, JAR, JARM, grant management, and so on</text>
    <path class="fg-edge" d="M434,221 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="214" text-anchor="middle">yes</text>
    <rect class="fg-box" x="530" y="192" width="394" height="58" rx="8"/>
    <text class="fg-m" x="550" y="218">op.WithFeature(…)</text>
    <text class="fg-xs" x="550" y="238">one capability, switched on by itself</text>
    <path class="fg-edge" d="M233,254 V272" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="268">no</text>
    <!-- 4 -->
    <rect class="fg-box" x="36" y="276" width="394" height="58" rx="8"/>
    <text class="fg-s" x="56" y="302">Restricting which grants /token accepts</text>
    <text class="fg-xs" x="56" y="322">an OP that should never issue by client credentials, say</text>
    <path class="fg-edge" d="M434,305 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="298" text-anchor="middle">yes</text>
    <rect class="fg-box" x="530" y="276" width="394" height="58" rx="8"/>
    <text class="fg-m" x="550" y="302">op.WithGrants(…)</text>
    <text class="fg-xs" x="550" y="322">anything not listed is refused at the endpoint</text>
    <path class="fg-edge" d="M233,338 V356" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="352">no</text>
    <!-- 5 -->
    <rect class="fg-box" x="36" y="360" width="394" height="58" rx="8"/>
    <text class="fg-s" x="56" y="386">Sender-constrained access tokens</text>
    <text class="fg-xs" x="56" y="406">a leaked token should be useless on its own</text>
    <path class="fg-edge" d="M434,389 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="382" text-anchor="middle">yes</text>
    <rect class="fg-box" x="530" y="360" width="394" height="58" rx="8"/>
    <text class="fg-m" x="550" y="386">op.WithFeature(DPoP) · op.WithFeature(MTLS)</text>
    <text class="fg-xs" x="550" y="406">either, or both — the client picks at registration</text>
    <path class="fg-edge" d="M233,422 V440" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="436">no</text>
    <!-- 6 -->
    <rect class="fg-box" x="36" y="444" width="394" height="58" rx="8"/>
    <text class="fg-s" x="56" y="470">Choosing between JWT and opaque</text>
    <text class="fg-xs" x="56" y="490">it is a per-audience decision</text>
    <path class="fg-edge" d="M434,473 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="466" text-anchor="middle">yes</text>
    <rect class="fg-box" x="530" y="444" width="394" height="58" rx="8"/>
    <text class="fg-m" x="550" y="470">op.WithAccessTokenFormat(…)</text>
    <text class="fg-xs" x="550" y="490">and the trade-off is revocation reach against latency</text>
    <path class="fg-edge" d="M233,506 V524" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="520">no</text>
    <!-- fallthrough -->
    <rect class="fg-box fg-box--muted" x="36" y="528" width="888" height="34" rx="8"/>
    <text class="fg-t2" x="56" y="550">None of these — the full option table is below</text>
  </svg>
  <figcaption class="fig-note">Reading top to bottom is also the order to configure in. A profile pins several of the later answers on its own, so setting it first saves you from choosing them one at a time and then finding they conflict.</figcaption>
</figure>

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
- **You want JWE request-object decryption** → `WithEncryptionKeyset(...)` for the OP's inbound JWE keys, and optionally `WithSupportedEncryptionAlgs(algs, encs)` to narrow the default allow-list. Outbound JWE responses use keys from the recipient client's JWKS. See [Use case: JWE encryption](/use-cases/jwe-encryption).
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
| `WithHighEntropyClientSecrets` | _(no args)_ | switches the OP-wide client-secret verifier to the high-entropy keyed-hash format. Existing Argon2 client hashes cannot be retrofitted; reprovision every client before enabling it. | Argon2-compatible client secrets |
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
| `WithRiskAssessor` | `op.RiskAssessor` | supplies risk scores. With `WithAuthenticators`, it runs at pre-/post-factor boundaries; with `WithLoginFlow`, it becomes the flow assessor and runs once per chain. It is mutually exclusive with a non-nil `LoginFlow.Risk`; configuring both fails `op.New`. | none |
| `WithLoginAttemptObserver` | `op.LoginAttemptObserver` | counts failed attempts for `RuleAfterFailedAttempts` | none |
| `WithMFAEncryptionKeys` | 32-byte key(s) | AES-256-GCM seal of TOTP secrets at rest | none |
| `WithAuthnLockoutStore` | `store.AuthnLockoutStore` | persists per-subject failed-attempt counters consulted by `RuleAfterFailedAttempts` | none |
| `WithACRPolicy` | `op.ACRPolicy` (interface) | step-up acr/aal mapping | identity |

Leaving `WithAuthnLockoutStore` unset disables cross-factor tracking, so only the built-in per-factor TOTP / email-OTP counters apply. Set it to activate cross-factor tracking for the built-in possession / recovery factors (`StepTOTP`, `StepEmailOTP`, `StepRecoveryCode`). It does not automatically wrap primary password / passkey authentication or `ExternalStep` custom factors; those remain owned by the embedder's user store or custom authenticator. The SQL and DynamoDB adapters both expose durable stores through `AuthnLockouts()`; `inmem.Store.AuthnLockouts()` is process-local and resets on restart.

Authentication-factor records are intentionally outside `store.Store`. `StepTOTP`, `PrimaryPasskey`, `StepRecoveryCode`, and `StepEmailOTP` receive their own stores because enrollment schema, encryption keys, and account-recovery policy belong to the embedding application. In-memory, SQL, and DynamoDB adapters expose the matching accessors. [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) uses the shipped SQL adapter's factor stores alongside the core OP tables; implement the factor-store contracts yourself only for another backend.

Two factor-store contracts matter for durability-sensitive deployments. `store.EmailOTPStore.Get` must keep records readable until `EmailOTPRecord.RetainUntil`, not merely until the code's `ExpiresAt`, so resend caps and brute-force counters survive an expired code. `store.RecoveryStore.Consume` must compare the presented code hash with the currently stored slot and reject stale hashes, so regenerated recovery batches revoke old leaked codes instead of burning a slot in the new batch. TOTP and email-OTP `Version` values are opaque, store-issued equality tokens for compare-and-swap; do not infer ordering or manufacture them. A stale CAS returns the consumed/stale error. `PasskeyStore.Put` must atomically refuse a duplicate credential ID when it names a different subject; `PasskeyStore.Put` must never move that credential between subjects.

## UI

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSPAUI` | `op.SPAUI` (struct: `LoginMount` / `ConsentMount` / `LogoutMount` / `StaticDir`) | mounts the SPA shell and static asset tree while the OP serves the JSON interaction state surface. Only `LoginMount` is a route; `ConsentMount` and `LogoutMount` are retained for compatibility, validated as paths, and inert/deprecated. | off |
| `WithConsentUI` | `op.ConsentUI` (wraps a `*html/template.Template`) | renders consent with an embedder-supplied HTML template; OP still owns state, CSRF, and persistence | bundled template |
| `WithChooserUI` | `op.ChooserUI` (wraps a `*html/template.Template`) | renders `prompt=select_account` with an embedder-supplied HTML template | bundled template |
| `WithCORSOrigins` | `...string` | explicit origins added to the API CORS allow-list. Redirect-URI origins may be derived for API CORS, but interaction and end-session ceremony checks allow only the issuer origin plus these explicit origins. | derived for API routes; issuer-only for ceremonies |
| `WithDefaultLocale` | `op.Locale` (BCP 47 tag) | canonicalized BCP 47 default UI locale when the request carries no `ui_locales`; an unregistered default fails `op.New` | `"en"` |
| `WithLocale` | `op.LocaleBundle` (one per call; repeatable) | registers a per-locale message bundle for the bundled HTML driver | English + Japanese seed |
| `WithPreferredLocaleStore` | `op.PreferredLocaleStore` | per-user locale override consulted at the head of the §L.2 chain | none |

`WithSPAUI` is mutually exclusive with `WithConsentUI`: both own the consent rendering surface. `WithSPAUI.LoginMount` is the only SPA route; `ConsentMount` and `LogoutMount` no longer reserve routes. Consent uses the login interaction state surface, and built-in logout confirmation remains in the normal end-session flow. `WithChooserUI` may be configured alongside `WithSPAUI`, but SPA mode owns the chooser through the JSON state envelope; the chooser template is ignored and `op.New` emits a structured warning. See [Custom chooser UI](/use-cases/custom-chooser-ui).

Ceremony origins must be same-site with the issuer. An issuer sibling such as `login.example.com` next to `op.example.com` is supported when it is listed here. A genuinely cross-site origin receives CORS headers without a working interaction or end-session ceremony: the `__Host-` cookies are `SameSite`-protected, so the browser withholds them and the endpoint returns 404. Host the UI on the issuer or a same-site sibling; the cookie attributes are not configurable.

`WithLocale` canonicalizes locale tags to lowercase, hyphen-separated BCP 47 form. `Provider.SetLocaleCookie(w, locale)` and `Provider.ClearLocaleCookie(w)` are the public cookie seams; `SetLocaleCookie` resolves exact and language-only matches and returns `op.ErrLocaleNotRegistered` when no registered locale matches. The cookie is `__Host-oidc_locale`, secure, HttpOnly, SameSite=Lax, and independent of the login session.

## Tokens

| Option | Value | Section | Default |
|---|---|---|---|
| `WithAccessTokenFormat` | `op.AccessTokenFormat` (`AccessTokenFormatJWT` / `AccessTokenFormatOpaque`) | JWT vs opaque, OP-wide | JWT |
| `WithAccessTokenFormatPerAudience` | `map[string]op.AccessTokenFormat` (RFC 8707 resource → format) | mixed format by audience | OP-wide value |
| `WithAccessTokenRevocationStrategy` | `op.AccessTokenRevocationStrategy` (`RevocationStrategyGrantTombstone` / `RevocationStrategyJTIRegistry` / `RevocationStrategyNone`) | revocation policy for issued JWT access tokens; `GrantTombstone` (default) needs `Store.GrantRevocations()`, `JTIRegistry` needs `Store.AccessTokens()` — both checked at `op.New` | grant tombstone |
| `WithAccessTokenTTL` | `time.Duration` | access token lifetime | 5 min |
| `WithRefreshTokenTTL` | `time.Duration` | refresh token lifetime (non-offline) | 30 days |
| `WithRefreshTokenOfflineTTL` | `time.Duration` | refresh token lifetime when `offline_access` granted | inherits `WithRefreshTokenTTL` (zero value defers) |
| `WithRefreshGracePeriod` | `time.Duration` (zero disables; negative rejected; FAPI 2.0 profiles accept 0–60 s) | rotation grace window | 60 s |
| `WithDPoPNonceSource` | `op.DPoPNonceSource` (interface) | server-supplied DPoP nonce store (`op.NewInMemoryDPoPNonceSource` provides one) | none |

`WithInMemoryDPoPNonceLogger` is a helper option for `op.NewInMemoryDPoPNonceSource`, not an `op.New` option. Use it only when you use the bundled in-memory nonce source.

With `FAPI2Baseline` or `FAPI2MessageSigning`, the refresh-grace window is capped at 60 seconds: an explicit value from 0 through 60 seconds is accepted, while a wider value is a construction error. The profile does not force zero; omitting the option still resolves to the 60-second default. Without those profiles, the option accepts any non-negative duration.

`WithAccessTokenFormat` and `WithAccessTokenFormatPerAudience` govern the access tokens issued by the built-in grant paths. A custom grant's `BoundAccessToken` is always minted as an RFC 9068 JWT, regardless of either option; a custom grant that needs an opaque value must mint it itself and return it as `AccessToken`.

## Discovery & endpoints

| Option | Value | Section | Default |
|---|---|---|---|
| `WithEndpoints` | `op.Endpoints` (struct: per-endpoint path overrides) | overrides default endpoint paths | spec defaults |
| `WithMountPrefix` | `string` (must start with `/`; pass `/` for root) | embeds an issuer-relative path prefix | `/oidc` |
| `WithClaimsSupported` | `...string` (variadic) | populates `claims_supported` in discovery | omitted |
| `WithClaimsParameterSupported` | `bool` | toggles `claims_parameter_supported`; `false` rejects malformed JSON but suppresses the claims projection and ignores valid `claims` payloads at authorize / PAR | true |
| `WithACRValuesSupported` | `...string` (variadic) | publishes `acr_values_supported`; when non-empty, the same allow-list is enforced on `/authorize`, `/par`, and CIBA `/bc-authorize` | empty (omitted from discovery; no allow-list) |
| `WithDiscoveryMetadata` | `op.DiscoveryMetadata` (typed `service_documentation`, policy / TOS / UI locale / mTLS alias fields plus `Extra map[string]any`) | injects RFC 8414 / OIDC Discovery metadata not owned by the OP; `UILocalesSupported` overrides the auto-derived locale list when non-empty, and `Extra` keys that collide with OP-controlled fields are rejected | none |
| `WithPARLifetime` | `time.Duration` | overrides the lifetime of `request_uri` values issued by `/par`; expiry is checked when the browser presents the URI at `/authorize`, while later code emission remains single-use | 60 s |
| `WithJWKSRotationActive` | `func() bool` | predicate that flips JWKS `Cache-Control` to short-cache during a rotation window | always long-cache |

## Subject strategy

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSubjectGenerator` | `op.SubjectGenerator` (interface) | overrides the `sub` claim derivation; the in-tree `op/subject.UUIDv7` is the default. The generator is called at each projection and must be deterministic for identical input with no surprise I/O. | UUIDv7 passthrough |
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
| `WithCustomGrant` | `op.CustomGrantHandler` | registers an embedder-defined `grant_type` URN at `/token`; duplicate custom names and collisions with every built-in grant type are rejected at construction. The handler returns a verbatim access token or a `BoundAccessToken` request the OP signs | none |
| `RegisterTokenExchange` | `op.TokenExchangePolicy` | enables the RFC 8693 token-exchange grant; the policy decides admission per request and may narrow OP-computed defaults | disabled |

`WithDeviceCodeExpiry` and `WithDeviceCodePollInterval` are intentionally not derived from `WithAccessTokenTTL`; short-lived access tokens should not make a TV / CLI pairing ceremony expire before the user can reach the second screen. See [Use case: device code](/use-cases/device-code), [CIBA](/use-cases/ciba), [Custom grant](/use-cases/custom-grant), [Token exchange](/use-cases/token-exchange).

## Authorization features — RAR, Grant Management, Protected Resource Metadata

| Option | Value | Section | Default |
|---|---|---|---|
| `WithAuthorizationDetailTypes` | `...op.AuthorizationDetailType` | enables RFC 9396 Rich Authorization Requests; registers each accepted `type` with its validator. `authorization_details` is then validated at `/authorize`, `/par`, `/token`, persisted on the grant, echoed on JWT access tokens and introspection, and advertised in discovery. A nil `Validate` is rejected at `op.New` | disabled |
| `WithGrantManagement` | `(actions []op.GrantManagementAction, actionRequired bool)` | enables the OAuth 2.0 Grant Management draft; honours `grant_management_action` / `grant_id`, mounts the query / revoke endpoint, stamps `grant_id` on the token response, and advertises the configured action set in discovery. Experimental (tracks an IETF draft) | disabled |
| `WithProtectedResources` | `...op.ProtectedResource` | publishes RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource` plus each resource path suffix, with the issuer in `authorization_servers`. `ProtectedResource.IntrospectionClients` allows named confidential callers to introspect access tokens whose audience is that resource; it never delegates refresh-token introspection. | none |

`op.StepUpChallenge(realm, acrValues, maxAge)` is a standalone helper (not an `op.New` option) that builds the RFC 9470 `WWW-Authenticate: Bearer` challenge an embedder's resource server returns; the OP itself never emits it.

See [Rich authorization requests](/use-cases/authorization-details), [Grant management](/use-cases/grant-management), [Protected resource metadata](/use-cases/protected-resource-metadata), [MFA / step-up](/use-cases/mfa-step-up).

## Encryption (JWE)

| Option | Value | Section | Default |
|---|---|---|---|
| `WithEncryptionKeyset` | `op.EncryptionKeyset` (RSA ≥ 2048 / EC P-256/384/521 private keys, `use=enc`) | publishes the OP's inbound-decryption JWKs and decrypts JWE request objects on `/authorize` and `/par`; outbound JWE responses use the recipient client's JWKS | none |
| `WithSupportedEncryptionAlgs` | `(algs []string, encs []string)` | narrows the default allow-list (`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`); cannot extend it | full allow-list |

See [Use case: JWE encryption](/use-cases/jwe-encryption).

## mTLS / proxy / network

| Option | Value | Section | Default |
|---|---|---|---|
| `WithMTLSRootCAs` | `*x509.CertPool` | optional public trust pool for OP-side validation of direct or forwarded client certificates; nil is rejected | unset (terminator validates) |
| `WithMTLSProxy` | `(headerName string, trustedCIDRs []string)` | header-based mTLS termination at edge. The forwarded certificate is authoritative only for requests from the trusted CIDRs; `op.MTLSProxy` / `op.MTLSProxyConfig` are the public projection seams. | none |
| `WithTrustedProxies` | `...string` (CIDRs) | resolves `X-Forwarded-*` / `Forwarded` to real client IP | none |
| `WithTrustedProxyHosts` | `...string` (hostnames) | extends the `X-Forwarded-Host` allow-list beyond the canonical issuer host when trusted proxy CIDRs are configured | issuer host only |
| `WithAllowLocalhostLoopback` | _(no args)_ | admits textual `localhost` in the RFC 8252 loopback carve-out for dev / native-app demos, **and in the issuer itself**; literal `127.0.0.1` / `[::1]` remain the strict defaults | strict literal loopback only |
| `WithAllowPrivateNetworkJWKS` | _(no args)_ | permits client JWKS hosted on RFC 1918 (test only) | denied |
| `WithAllowPrivateNetworkJAR` | _(no args)_ | permits `request_uri` hosted on RFC 1918 (test only) | denied |
| `WithAllowPrivateNetworkSector` | _(no args)_ | permits `sector_identifier_uri` hosted on RFC 1918 during dynamic registration (test / private RP networks only) | denied |
| `WithJWKSHTTPTransport` | `http.RoundTripper` | custom transport for RP-controlled JWKS fetches used by JAR and `private_key_jwt`, while preserving the dial-time SSRF gate | system-trust transport |
| `WithBackchannelAllowPrivateNetwork` | `bool` | explicitly permits delivery to RFC1918, loopback, link-local, or ULA `backchannel_logout_uri` destinations. Default deny is a production SSRF boundary; opt in only with a deliberate network policy. | false (deny) |
| `WithAllowInsecureBackchannelLogoutForDev` | _(no args)_ | admits plain-HTTP loopback `backchannel_logout_uri` values and delivery only for dev / CI fixtures | denied |
| `WithBackchannelLogoutHTTPClient` | `*http.Client` | HTTP client for back-channel logout fan-out | default |
| `WithBackchannelLogoutTimeout` | `time.Duration` | per-RP fan-out timeout | 5 s |
| `WithBackchannelFanOutBudget` | `time.Duration` (positive) | whole-event budget for back-channel logout fan-out, independent of each RP timeout | 30 s |

## Observability

| Option | Value | Section | Default |
|---|---|---|---|
| `WithLogger` | `*slog.Logger` | structured operational log sink (handler is wrapped with the redaction middleware) | discard |
| `WithAuditLogger` | `*slog.Logger` | dedicated audit-event log sink for OIDC-domain business events; it is not an HTTP access log | inherits `WithLogger` |
| `WithPrometheus` | `*prometheus.Registry` | registers the curated OP counters on the caller's registry (no `/metrics` route, HTTP lifecycle metrics, or health endpoint is mounted) | none |

## Operational posture

| Option | Value | Section | Default |
|---|---|---|---|
| `WithSessionDurabilityPosture` | `op.SessionDurabilityPosture` | annotates back-channel logout audit events for SOC | volatile |
| `WithClock` | `op.Clock` | time source for token expiry, audit record timestamps, and rate-limit windows (test injection) | `time.Now` |

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
