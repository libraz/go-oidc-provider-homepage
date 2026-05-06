---
title: Audit event catalog
description: Every op.Audit* event the OP emits, what fires it, and what the extras carry.
outline: 2
---

# Audit event catalog

The OP emits structured audit events from a closed catalog defined in `op/audit.go`. Each event is a stable string identifier of shape `<area>.<verb>` (or `<area>.<verb>.<qualifier>`) so SOC dashboards can pre-aggregate by area without parsing free-form messages.

## Subscribing

```go
op.New(
    /* required options */
    op.WithAuditLogger(slog.New(myJSONHandler)),
)
```

`op.WithAuditLogger` takes a `*slog.Logger`. Each event records as a structured log entry where the `msg` is the event identifier (e.g. `"token.issued"`) and the attributes carry the request-id, subject, client-id, and an `extras` group with category-specific fields.

If `WithAuditLogger` is not supplied, audit events fall through to the logger configured by `WithLogger`. If neither logger is supplied, audit emission is discarded.

::: tip Prometheus mirror
A curated subset of these events is mirrored onto Prometheus counters when [`WithPrometheus`](/use-cases/prometheus) is configured. A single emission updates both the slog stream and the matching counter — there is no separate metrics emit step.
:::

## Common attributes

Every event carries:

| Attribute | Type | Notes |
|---|---|---|
| `request_id` | string | per-request identifier (propagated via `X-Request-ID` if set) |
| `subject` | string | OIDC `sub` of the affected user; empty for pre-authn events |
| `client_id` | string | OAuth `client_id`; empty for account-management events |
| `extras` | group | category-specific fields (see each section) |

## Event catalog

The catalog is regrouped by feature area. Each group opens with a short note on what the events mean for SOC and operations, followed by a table of `event constant` (the Go identifier in `op/audit.go`), `when it fires`, `severity hint` (a starting point for routing — `info` for routine activity, `warn` for suspicious / failure conditions, `alert` for replay or store-fault signals), and the page that documents the surrounding behaviour.

### Account management

Most of these fire from out-of-band admin paths the OP does not host directly — provisioning, recovery, federation linking. The catalog exists so a single subscription point covers SOC dashboards regardless of where the actual write originates.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditAccountCreated` | user account provisioned | info | — |
| `AuditAccountDeleted` | user account removed | info | — |
| `AuditAccountEmailAdded` | email address added to account | info | — |
| `AuditAccountEmailVerified` | email ownership proven (link / OTP) | info | — |
| `AuditAccountEmailRemoved` | email address removed | info | — |
| `AuditAccountEmailSetPrimary` | primary email changed | info | — |
| `AuditAccountPasskeyRegistered` | WebAuthn credential added | info | — |
| `AuditAccountPasskeyRemoved` | WebAuthn credential removed | info | — |
| `AuditAccountTOTPEnabled` | TOTP enrollment completed | info | — |
| `AuditAccountTOTPDisabled` | TOTP removed | info | — |
| `AuditAccountPasswordChanged` | password reset / changed | info | — |
| `AuditAccountRecoveryRegenerated` | recovery batch reissued | info | — |
| `AuditRecoverySupportEscalation` | manual recovery / support override invoked | warn | — |
| `AuditAccountFederationLinked` | external IdP credential linked | info | — |
| `AuditAccountFederationUnlinked` | external IdP credential unlinked | info | — |

### Login, MFA, step-up

Fire from the authenticator chain after each factor resolves. `login.failed` and `mfa.failed` are the routine probing signals; sustained increases on either are the canonical credential-stuffing tell. `step_up.required` rates show how often RPs are asking the user to climb to a higher `acr_values`.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditLoginSuccess` | primary credential verified, subject bound | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditLoginFailed` | primary credential rejected | warn | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditMFARequired` | session AAL below requirement; second factor demanded | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditMFASuccess` | second factor accepted | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditMFAFailed` | second factor rejected | warn | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditStepUpRequired` | RP requested higher `acr_values`; user re-prompted | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditStepUpSuccess` | step-up factor accepted | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |

::: details extras
- `factor` — `password`, `passkey`, `totp`, `email_otp`, `captcha`, `recovery_code`, or a user-defined Step kind
- `aal` — assurance level the factor raised the session to
- `amr_values` — RFC 8176 §2 codes contributed to the `amr` claim
:::

### Consent

Fire from the consent prompt and the first-party fast-path. `consent.granted.delta` is the signal that an existing grant did not cover the new request and the user re-confirmed; `consent.revoked` is the user-driven cleanup path SOC dashboards usually want to chart against `token.revoked`.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditConsentGranted` | user clicked consent in the prompt | info | [Concepts: consent](/concepts/consent) |
| `AuditConsentGrantedFirstParty` | first-party auto-consent applied (no prompt) | info | [Use case: first-party consent](/use-cases/first-party) |
| `AuditConsentGrantedDelta` | delta-consent triggered re-prompt for newly requested sensitive scope | info | [Concepts: consent](/concepts/consent) |
| `AuditConsentSkippedExisting` | existing grant already covered the request; no prompt | info | [Concepts: consent](/concepts/consent) |
| `AuditConsentRevoked` | user revoked a prior grant | info | [Concepts: consent](/concepts/consent) |

::: details extras
- `scopes_granted`, `scopes_requested` — string slices
- `audience` — when scope is per-audience
:::

### Code and token lifecycle

Fire from the authorize-code path and the token endpoint. The replay-detection events (`code.replay_detected`, `refresh.replay_detected`) and the substore-fault events (`token.revoke_failed`, `refresh.chain_revoke_failed`, `refresh.grant_revoke_failed`) are the high-signal alerts in this group; the rest is steady-state lifecycle telemetry.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditCodeIssued` | authorization code minted | info | [Concepts: authorization code + PKCE](/concepts/authorization-code-pkce) |
| `AuditCodeConsumed` | code redeemed at `/token` | info | [Concepts: authorization code + PKCE](/concepts/authorization-code-pkce) |
| `AuditCodeReplayDetected` | code presented twice — chain revoked | alert | [Concepts: authorization code + PKCE](/concepts/authorization-code-pkce) |
| `AuditTokenIssued` | access token + (optional) refresh + (optional) id_token issued | info | [Concepts: tokens](/concepts/tokens) |
| `AuditTokenRefreshed` | refresh token rotated; new access token minted | info | [Concepts: refresh tokens](/concepts/refresh-tokens) |
| `AuditTokenRevoked` | token revoked via `/revoke` or grant cascade | info | [Concepts: tokens](/concepts/tokens) |
| `AuditTokenRevokeFailed` | revocation attempt observed a substore fault; wire still 200 per RFC 7009 §2.2 | alert | [Concepts: tokens](/concepts/tokens) |
| `AuditRefreshReplayDetected` | refresh token presented past rotation grace — chain revoked | alert | [Concepts: refresh tokens](/concepts/refresh-tokens) |
| `AuditRefreshChainRevokeFailed` | cascade revoke from a replay observed a substore fault | alert | [Concepts: refresh tokens](/concepts/refresh-tokens) |
| `AuditRefreshGrantRevokeFailed` | grant-tombstone write failed during refresh-rotation cascade | alert | [Concepts: refresh tokens](/concepts/refresh-tokens) |

::: details extras
- `grant_type` — `authorization_code`, `refresh_token`, `client_credentials`
- `format` — `jwt` or `opaque` for the access token
- `offline_access` — bool; true on `offline_access` chain
- `cnf` — `dpop_jkt` or `mtls_x5t#S256` when sender-bound
- `surface` — on `token.revoke_failed`: which call site observed the fault. `/revoke` emits `jwt_access_token`, `refresh_chain`, or `opaque_access_token`; the token endpoint emits `code_replay_jwt_access_tokens` when the AT cascade after authorization-code replay errors out
- `grant_id` — on `token.revoke_failed` (token endpoint) and `refresh.grant_revoke_failed`: the grant whose tombstone write failed
- `reason` — on `refresh.chain_revoke_failed` / `refresh.grant_revoke_failed`: stringified error from the substore
- `err` — on `token.revoke_failed`: stringified error from the substore
:::

### Sessions and logout

Fire from the session store and the logout endpoints. `bcl.no_sessions_for_subject` is the volatile-session signal documented below; the back-channel delivery events are the SOC pivot when an RP fails to honour logout.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditSessionCreated` | new browser session minted (post-login) | info | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditSessionDestroyed` | session deleted (logout, expiry, eviction) | info | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditLogoutRPInitiated` | RP-Initiated Logout invoked | info | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditLogoutBackChannelDelivered` | Back-Channel logout token delivered to RP | info | [Use case: Back-Channel Logout](/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelFailed` | Back-Channel delivery failed (HTTP error / timeout / verification) | warn | [Use case: Back-Channel Logout](/use-cases/back-channel-logout) |
| `AuditBCLNoSessionsForSubject` | `/end_session` named a subject but no sessions resolved | info | [Use case: Back-Channel Logout](/use-cases/back-channel-logout) |

::: details `bcl.no_sessions_for_subject` rationale
Under a volatile `SessionStore` (Redis without persistence, in-memory under maxmemory eviction) this event is the signal that a session was evicted between establishment and logout — narrowing OIDC Back-Channel Logout 1.0 §2.7's best-effort delivery floor to zero. INFO-level by design: under volatile placement the gap is expected; SOC tooling should alert on elevated rates rather than per-event. The event includes the configured `WithSessionDurabilityPosture` so dashboards can split "expected gap under volatile" from "unexpected gap under durable".
:::

### Defensive signals

Fire from request-validation paths that detect abuse signals or operator-visible policy hits. These are the events that feed automated abuse-mitigation pipelines.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditRateLimitExceeded` | request rejected by rate limiter — **embedder-emitted** vocabulary; the library does not implement a generic per-IP / per-endpoint HTTP throttle | warn | — |
| `AuditRateLimitBypassed` | rate-limit bypass token consumed (operator override) — **embedder-emitted** vocabulary; same scoping as `AuditRateLimitExceeded` | warn | — |
| `AuditPKCEViolation` | PKCE verifier mismatch / `plain` rejected / missing on FAPI | alert | [Concepts: authorization code + PKCE](/concepts/authorization-code-pkce) |
| `AuditRedirectURIMismatch` | redirect URI did not match the registered list | warn | [Concepts: redirect URI](/concepts/redirect-uri) |
| `AuditAlgLegacyUsed` | a legacy alg path was reached (telemetry; rejected by the verifier) | warn | [Concepts: JOSE basics](/concepts/jose-basics) |
| `AuditCORSPreflightAllowed` | a CORS preflight matched the strict allowlist | info | [Use case: CORS for SPA](/use-cases/cors-spa) |
| `AuditDPoPLooseMethodCaseAdmitted` | DPoP proof presented `htm` in non-canonical case; admitted with telemetry | info | [Concepts: DPoP](/concepts/dpop) |
| `AuditKeyRetiredKidPresented` | request presented a kid past the JWKS grace window — verifier rejected | warn | [Operations: key rotation](/operations/key-rotation) |

### Introspection

Fire from `/introspect` when client authentication or the RFC 7662 §2.2 wire contract rejects. The wire response stays at the canonical error; the audit event surfaces the reason for SOC tooling.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditIntrospectionError` | `/introspect` rejected the inbound client credentials | warn | — |

### Client authentication

Fire from `/token` and `/par` whenever client authentication rejects. The wire response stays at the canonical `invalid_client`; this event exposes the attempted `client_id` and a short reason code so SOC tooling can spot probing.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditClientAuthnFailure` | `/token` or `/par` rejected the client (wrong secret, expired assertion, alg mismatch, missing `private_key_jwt`) | warn | [Concepts: client types](/concepts/client-types) |

### Dynamic Client Registration

Fire from `/register` and `/register/{client_id}`. RAT and IAT failure events are the canonical probing signal under DCR.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditDCRIATConsumed` | Initial Access Token redeemed | info | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRIATExpired` | IAT presented past TTL | warn | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRIATInvalid` | IAT signature / format invalid | warn | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCROpenRegistrationUsed` | open (no-IAT) registration accepted | info | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRClientRegistered` | new client created | info | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRClientMetadataRead` | RAT-bearing GET against `/register/{client_id}` | info | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRClientMetadataUpdated` | RAT-bearing PUT against `/register/{client_id}` | info | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRClientDeleted` | RAT-bearing DELETE against `/register/{client_id}` | info | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRRATInvalid` | Registration Access Token rejected | warn | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRMetadataValidation` | metadata payload failed policy | warn | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |

### Device Code (RFC 8628)

Fire from `/device_authorization`, the embedder's verification ceremony helpers in `op/devicecodekit`, and the token-endpoint device-code grant. `device_code.verification.user_code_brute_force` and `device_code.token.slow_down` are the canonical poll-abuse signals.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditDeviceAuthorizationIssued` | `/device_authorization` returned a fresh `device_code` + `user_code` pair | info | [Concepts: device code](/concepts/device-code) |
| `AuditDeviceAuthorizationRejected` | `/device_authorization` rejected the inbound request (unknown client, scope refusal, etc.) | warn | [Concepts: device code](/concepts/device-code) |
| `AuditDeviceAuthorizationUnboundRejected` | DPoP / mTLS proof was required but absent from `/device_authorization` | warn | [Concepts: sender-constrained tokens](/concepts/sender-constraint) |
| `AuditDeviceCodeVerificationApproved` | embedder's verification page reported the user approved the pending code | info | [Use case: device code](/use-cases/device-code) |
| `AuditDeviceCodeVerificationDenied` | embedder's verification page reported the user denied the pending code (or the per-record brute-force gate locked the row out) | warn | [Use case: device code](/use-cases/device-code) |
| `AuditDeviceCodeUserCodeBruteForce` | a `user_code` submission missed; counter incremented (lockout fires after `devicecodekit.MaxUserCodeStrikes`, default 5) | alert | [Use case: device code](/use-cases/device-code) |
| `AuditDeviceCodeTokenIssued` | `/token` minted a token for an approved device authorization | info | [Use case: device code](/use-cases/device-code) |
| `AuditDeviceCodeTokenRejected` | `/token` rejected the device-code grant (`access_denied`, `expired_token`, etc.) | warn | [Use case: device code](/use-cases/device-code) |
| `AuditDeviceCodeTokenSlowDown` | `/token` returned `slow_down`; the substore row's interval was doubled | warn | [Use case: device code](/use-cases/device-code) |
| `AuditDeviceCodeRevoked` | `op/devicecodekit.Revoke` flipped the row to denied; embedders subscribe here to cascade-revoke issued access tokens via `RevokeByGrant(deviceCodeID)` | info | [Use case: device code](/use-cases/device-code) |

### CIBA

Fire from `/bc-authorize`, the embedder's authentication-device interaction, and the token-endpoint CIBA grant. `ciba.poll_abuse.lockout` is the canonical client-misbehaviour signal.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditCIBAAuthorizationIssued` | `/bc-authorize` returned a fresh `auth_req_id` | info | [Concepts: CIBA](/concepts/ciba) |
| `AuditCIBAAuthorizationRejected` | `/bc-authorize` rejected the inbound request (unknown user, hint resolver failed, scope refusal) | warn | [Concepts: CIBA](/concepts/ciba) |
| `AuditCIBAAuthorizationUnboundRejected` | DPoP / mTLS proof was required but absent from `/bc-authorize` | warn | [Concepts: sender-constrained tokens](/concepts/sender-constraint) |
| `AuditCIBAAuthDeviceApproved` | the substore observed `Approve` for a pending request (embedder's authentication-device callback) | info | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBAAuthDeviceDenied` | the substore observed `Deny` for a pending request | warn | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBAPollAbuseLockout` | poll cadence sustained well below the negotiated interval; the request was locked out | alert | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBATokenIssued` | `/token` minted a token for an approved CIBA request | info | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBATokenRejected` | `/token` rejected the CIBA grant (`access_denied`, `expired_token`, `authorization_pending`) | warn | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBATokenSlowDown` | `/token` returned `slow_down` because the client polled faster than the negotiated interval | warn | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBAPollObservationFailed` | persisting the `LastPolledAt` stamp on a poll faulted; decision still proceeds (best-effort observability) | warn | [Use case: CIBA](/use-cases/ciba) |

### Token Exchange (RFC 8693)

Fire from the in-tree `RegisterTokenExchange` handler. Every successful exchange emits `requested` + `granted`; rejections emit `requested` + one of the failure-class events. `policy_denied`, `scope_inflation_blocked`, and `audience_blocked` are the policy-decision signals SOC dashboards usually want.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditTokenExchangeRequested` | `/token` accepted an RFC 8693 request and entered the exchange handler | info | [Concepts: token exchange](/concepts/token-exchange) |
| `AuditTokenExchangeGranted` | exchange admitted; new access token (and optionally refresh) minted | info | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangePolicyDenied` | the embedder-supplied `TokenExchangePolicy` returned a deny | warn | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangePolicyError` | the policy returned a non-deny error (transient infrastructure failure) | warn | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeScopeInflationBlocked` | requested scope exceeded the subject_token's scope or the client's allow-list | warn | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeAudienceBlocked` | requested audience was not in the policy's allow-list | warn | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeTTLCapped` | issued TTL was clipped against (handler request, subject_token remaining, global ceiling) | info | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeActChainTooDeep` | nested act chain exceeded the configured depth limit | warn | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeEmptyScopeRejected` | exchange requested a non-empty scope subset that resolved to the empty set | warn | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeActorEqualsSubject` | actor_token resolved to the same subject as subject_token (no delegation) | info | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenExternal` | subject_token did not resolve in the local registry; treated as opaque external | info | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeActorTokenExternal` | actor_token did not resolve in the local registry; treated as opaque external | info | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenInvalid` | subject_token verification failed (signature / TTL / cnf mismatch) | warn | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenRegistryError` | registry lookup observed a non-`NotFound` fault (transient outage); wire stays `invalid_grant` | alert | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeRefreshIssued` | exchange opted into refresh issuance (`IssueRefreshToken=op.PtrBool(true)`) | info | [Use case: token exchange](/use-cases/token-exchange) |
| `AuditTokenExchangeSelfExchange` | exchange targeted the calling client (passive token replay scenario) | warn | [Use case: token exchange](/use-cases/token-exchange) |

## Stability

Audit event names are part of the public API surface:

- New events MAY be added in any minor release.
- Existing event names are renamed only in a major release with a deprecation notice.

Pin your dashboards on the names; do not rely on the order or the extras shape for any field not documented here.

## Verifying this list

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -hE 'AuditEvent\("[a-z_.]+"\)' op/audit.go \
  | grep -oE '"[a-z_.]+"' | sort -u
```

The output is the closed catalog this page mirrors.
