---
title: Audit event catalog
description: The audit catalog, distinguishing signals emitted by the OP from reserved vocabulary and documenting each event's extras.
outline: 2
pageClass: pg-reference-audit-events
---

# Audit event catalog

The OP emits structured audit events from a closed catalog defined in `op/audit.go`. The catalog is a vocabulary, not a promise that every constant fires: this page marks the signals emitted by the OP and the names reserved for a future implementation or the embedder's account/device plane. Each identifier has shape `<area>.<verb>` (or `<area>.<verb>.<qualifier>`) so SOC dashboards can pre-aggregate by area without parsing free-form messages.

<figure class="fig">
  <div class="fig-head">One closed catalog, three destinations</div>
  <svg class="fig-svg" role="img" aria-labelledby="audit-flow-title" viewBox="0 0 960 244" xmlns="http://www.w3.org/2000/svg">
    <title id="audit-flow-title">Every code path in the OP emits from one closed catalog of audit events. Each emission carries its context in extras and reaches structured logs, whatever SOC pipeline consumes them, and the Prometheus counters.</title>
    <text class="fg-lbl" x="40" y="26">emitted from</text>
    <text class="fg-lbl" x="640" y="26">lands in</text>
    <rect class="fg-box" x="36" y="40" width="230" height="42" rx="6"/>
    <text class="fg-t2" x="54" y="58">login / MFA</text>
    <text class="fg-xs" x="54" y="74">factor outcomes, step-ups</text>
    <rect class="fg-box" x="36" y="92" width="230" height="42" rx="6"/>
    <text class="fg-t2" x="54" y="110">token / grant</text>
    <text class="fg-xs" x="54" y="126">issuance, rotation, revocation</text>
    <rect class="fg-box" x="36" y="144" width="230" height="42" rx="6"/>
    <text class="fg-t2" x="54" y="162">DCR / device</text>
    <text class="fg-xs" x="54" y="178">registration, device approvals</text>
    <path class="fg-leader" d="M270,61 H300 M270,113 H300 M270,165 H300 M300,61 V165"/>
    <path class="fg-edge fg-edge--accent" d="M300,113 H336" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="340" y="66" width="256" height="94" rx="8"/>
    <text class="fg-t2 fg-accent" x="360" y="92">Audit event</text>
    <text class="fg-mxs" x="360" y="114">op.Audit* — a closed set</text>
    <text class="fg-xs" x="360" y="134">the context travels in extras,</text>
    <text class="fg-xs" x="360" y="150">never in a formatted message</text>
    <path class="fg-leader" d="M600,113 H632 M632,61 V165"/>
    <path class="fg-edge fg-edge--thin" d="M632,61 H692" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M632,113 H692" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M632,165 H692" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="696" y="40" width="228" height="42" rx="6"/>
    <text class="fg-t2" x="714" y="58">slog, as JSON</text>
    <text class="fg-xs" x="714" y="74">one object per event</text>
    <rect class="fg-box" x="696" y="92" width="228" height="42" rx="6"/>
    <text class="fg-t2" x="714" y="110">SOC / SIEM</text>
    <text class="fg-xs" x="714" y="126">queryable by event name</text>
    <rect class="fg-box" x="696" y="144" width="228" height="42" rx="6"/>
    <text class="fg-t2" x="714" y="162">Prometheus</text>
    <text class="fg-xs" x="714" y="178">counters, labelled by outcome</text>
  </svg>
  <figcaption class="fig-note">The catalog being closed is what makes the right-hand column possible. An alert can key on an event name because the set of names is fixed and versioned, not assembled from a format string at the call site.</figcaption>
</figure>

## Subscribing

```go
op.New(
    /* required options */
    op.WithAuditLogger(slog.New(myJSONHandler)),
)
```

`op.WithAuditLogger` takes a `*slog.Logger`. Each event records as a structured log entry. The `event` attribute contains the event identifier (e.g. `"token.issued"`), and `msg` is the short human-readable message. The remaining attributes carry the request-id, subject, client-id, and an `extras` group with category-specific fields. Emission is synchronous on the request goroutine: the handler must not block on slow I/O or an unbounded queue, and it must be safe for concurrent calls.

If `WithAuditLogger` is not supplied, audit events fall through to the logger configured by `WithLogger`. If neither logger is supplied, audit emission is discarded.

::: tip Prometheus mirror
A curated subset of these events is mirrored onto Prometheus counters when [`WithPrometheus`](/use-cases/prometheus) is configured. A single emission updates both the slog stream and the matching counter — there is no separate metrics emit step.
:::

## Enumerating the catalog in code

The page below is generated from the same registry the OP itself uses, and that registry is public. `op.AuditEventCatalog()` returns a copy of every stable event as `[]op.AuditEventDefinition`:

```go
for _, def := range op.AuditEventCatalog() {
    // def.Event       — the audit event identifier, e.g. "token.issued"
    // def.MetricName  — the Prometheus counter it feeds; empty for audit-only events
    // def.MetricLabel — the bounded label value for category counters; often empty
}
```

Read it when you need the event set as data rather than as prose — provisioning SIEM rules, asserting in a test that a dashboard covers every event, or checking which events have a metric projection. Because the same registry drives both the in-tree emitters and the Prometheus bridge, event discovery and metric routing cannot drift apart.

## Common attributes

Each emitted event always carries `audit`, `event`, and the record time. The following attributes appear when the emitter populated them:

| Attribute | Type | Notes |
|---|---|---|
| `request_id` | string | per-request identifier; omitted when unknown |
| `actor_id` | string | subject identifier for a user-initiated event, or `client_id` for a client-initiated event; omitted when unknown |
| `client_id` | string | OAuth `client_id`; omitted when unknown |
| `extras` | group | category-specific fields (see each section); omitted when empty |
| `time` | timestamp | `slog.Record.Time`; follows `WithClock` (or the system clock when no clock is configured) |

## Event catalog

The catalog is regrouped by feature area. Each group opens with a short note on what the events mean for SOC and operations, followed by a table of `event constant` (the Go identifier in `op/audit.go`), `when it fires` or why it is reserved, `severity hint` (a starting point for routing — `info` for routine activity, `warn` for suspicious / failure conditions, `alert` for replay or store-fault signals), and the page that documents the surrounding behaviour. Rows explicitly labelled **Reserved** are not emitted by the OP; an absent reserved event is not evidence that the underlying action did not occur.

### Provider lifecycle

`startup.profile` is the audit-stream anchor for an OP instance. It fires once after `op.New` has validated the configuration and before the provider is returned. Its extras cover two groups:

- **Declared** — `profiles`, `features`, `grants`.
- **Resolved policy** — PKCE, PAR, nonce, sender-constraint, client-authentication, token-TTL, token-format, JAR, JARM, introspection.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditStartupProfile` | a validated provider starts | info | [Options reference](/reference/options) |

### Account management

**Reserved.** These names cover out-of-band admin paths the OP does not host directly — provisioning, recovery, federation linking. The embedder may emit them through its audit sink; the OP itself does not.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditAccountCreated` | **Reserved** — user account provisioned by the embedder | info | — |
| `AuditAccountDeleted` | **Reserved** — user account removed by the embedder | info | — |
| `AuditAccountEmailAdded` | **Reserved** — email address added to an account | info | — |
| `AuditAccountEmailVerified` | **Reserved** — email ownership proven | info | — |
| `AuditAccountEmailRemoved` | **Reserved** — email address removed | info | — |
| `AuditAccountEmailSetPrimary` | **Reserved** — primary email changed | info | — |
| `AuditAccountPasskeyRegistered` | **Reserved** — WebAuthn credential added | info | — |
| `AuditAccountPasskeyRemoved` | **Reserved** — WebAuthn credential removed | info | — |
| `AuditAccountTOTPEnabled` | **Reserved** — TOTP enrollment completed | info | — |
| `AuditAccountTOTPDisabled` | **Reserved** — TOTP removed | info | — |
| `AuditAccountPasswordChanged` | **Reserved** — password reset or changed | info | — |
| `AuditAccountRecoveryRegenerated` | **Reserved** — recovery batch reissued | info | — |
| `AuditRecoverySupportEscalation` | **Reserved** — manual recovery or support override invoked | warn | — |
| `AuditAccountFederationLinked` | **Reserved** — external IdP credential linked | info | — |
| `AuditAccountFederationUnlinked` | **Reserved** — external IdP credential unlinked | info | — |

### Login, MFA, step-up

`login.*` and `mfa.*` are emitted by the authenticator chain after a primary or additional factor resolves. `login.failed` and `mfa.failed` are the routine probing signals; sustained increases on either are the canonical credential-stuffing tell. `AuditMFARequired`, `AuditStepUpRequired`, and `AuditStepUpSuccess` are **Reserved**: the OP does not emit them. Step-up is decided by the resource server and an ordinary authorization request reaches the OP.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditLoginSuccess` | primary credential verified, subject bound | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditLoginFailed` | primary credential rejected | warn | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditLockoutStalled` | cross-factor lockout CAS contention abandoned a failed attempt without counting it | alert | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditMFARequired` | **Reserved** — catalog vocabulary; the OP does not emit a separate requirement event | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditMFASuccess` | second factor accepted | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditMFAFailed` | second factor rejected | warn | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditStepUpRequired` | **Reserved** — resource-server decision; the OP does not emit it | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |
| `AuditStepUpSuccess` | **Reserved** — resource-server outcome; the OP does not emit it | info | [Use case: MFA / step-up](/use-cases/mfa-step-up) |

::: details extras
- `factor` — `password`, `passkey`, `totp`, `email_otp`, `captcha`, `recovery_code`, or a user-defined Step kind
- `aal`, `acr`, `amr_values` — not automatically carried by these login/MFA events
:::

### Consent

`AuditConsentGranted` and `AuditConsentGrantedFirstParty` are emitted by the consent prompt and first-party fast-path. The other consent constants are **Reserved**: incremental consent is recorded as ordinary `consent.granted`, reuse of an existing grant has no audit event, and grant withdrawal uses Grant Management's `grant_management.revoked`.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditConsentGranted` | user clicked consent in the prompt | info | [Concepts: consent](/concepts/consent) |
| `AuditConsentGrantedFirstParty` | first-party auto-consent applied (no prompt) | info | [Use case: first-party consent](/use-cases/first-party) |
| `AuditConsentGrantedDelta` | **Reserved** — incremental request is emitted as ordinary `AuditConsentGranted` | info | [Concepts: consent](/concepts/consent) |
| `AuditConsentSkippedExisting` | **Reserved** — reuse of a stored consent is not emitted | info | [Concepts: consent](/concepts/consent) |
| `AuditConsentRevoked` | **Reserved** — Grant Management withdrawal emits `AuditGrantManagementRevoked` | info | [Concepts: consent](/concepts/consent) |

::: details extras
- `scopes_granted`, `scopes_requested` — string slices
- `audience` — when scope is per-audience
:::

### Code and token lifecycle

Fire from the authorize-code path and the token endpoint. The replay-detection events (`code.replay_detected`, `refresh.replay_detected`) and the substore-fault events (`token.revoke_failed`, `refresh.chain_revoke_failed`, `refresh.grant_revoke_failed`) are the high-signal alerts in this group; the rest is steady-state lifecycle telemetry.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditCodeIssued` | authorization code minted; exactly once for each issued code, including interactive and silent paths | info | [Concepts: authorization code + PKCE](/concepts/authorization-code-pkce) |
| `AuditCodeConsumed` | code redeemed at `/token` | info | [Concepts: authorization code + PKCE](/concepts/authorization-code-pkce) |
| `AuditCodeReplayDetected` | code presented twice — chain revoked | alert | [Concepts: authorization code + PKCE](/concepts/authorization-code-pkce) |
| `AuditTokenIssued` | a first refresh token is persisted for a grant (the event is not a counter for every access token) | info | [Concepts: tokens](/concepts/tokens) |
| `AuditTokenRefreshed` | refresh token rotated; new access token minted | info | [Concepts: refresh tokens](/concepts/refresh-tokens) |
| `AuditTokenRevoked` | token revoked via `/revoke` or grant cascade | info | [Concepts: tokens](/concepts/tokens) |
| `AuditTokenRevokeFailed` | revocation attempt observed a substore fault; wire still 200 per RFC 7009 §2.2 | alert | [Concepts: tokens](/concepts/tokens) |
| `AuditRefreshReplayDetected` | refresh token presented past rotation grace — chain revoked | alert | [Concepts: refresh tokens](/concepts/refresh-tokens) |
| `AuditRefreshChainRevokeFailed` | cascade revoke from a replay observed a substore fault | alert | [Concepts: refresh tokens](/concepts/refresh-tokens) |
| `AuditRefreshGrantRevokeFailed` | grant-tombstone write failed during refresh-rotation cascade | alert | [Concepts: refresh tokens](/concepts/refresh-tokens) |
| `AuditRefreshPriorAccessTokenRevokeFailed` | refresh rotation could not revoke the prior access token; extras identify whether retry is possible | alert | [Concepts: refresh tokens](/concepts/refresh-tokens) |

`code_id` and `completion_id` are irreversible fingerprints of the authorization-code identifier. They are correlation values, not raw authorization codes or internal identifiers. `code.issued` is emitted exactly once for each issued code.

::: details extras
- `refresh_origin` — the typed origin recorded on the refresh chain: `authorization_code`, `device_code`, `ciba`, or `custom_grant`; an unknown or missing origin is projected as `unknown` by the metrics bridge. This is the grant that actually minted the refresh chain, not an arbitrary request `grant_type` label.
- `format` — `jwt` or `opaque` for the access token
- `offline_access` — bool; true on `offline_access` chain
- `cnf` — `dpop_jkt` or `mtls_x5t#S256` when sender-bound
- `surface` — on `token.revoke_failed`: which call site observed the fault. `/revoke` emits `jwt_access_token`, `refresh_chain`, or `opaque_access_token`; the token endpoint emits `code_replay_jwt_access_tokens` when the AT cascade after authorization-code replay errors out
- `grant_id` — on `token.revoke_failed` (token endpoint) and `refresh.grant_revoke_failed`: the grant whose tombstone write failed
- `reason` — on `refresh.chain_revoke_failed` / `refresh.grant_revoke_failed`: stringified error from the substore
- `err` — on `token.revoke_failed`: stringified error from the substore
- `failure_stage`, `retryable` — on `refresh.prior_access_token_revoke_failed`
:::

### Sessions and logout

The session and logout rows below are emitted by the session manager, `/end_session`, and the detached Back-Channel Logout coordinator. `AuditLogoutRPInitiated` is **Reserved**: `/end_session` records the resulting session and delivery outcomes, not a separate marker that an RP asked.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditSessionCreated` | new browser session minted (post-login) | info | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditSessionDestroyed` | session deleted (logout, expiry, eviction) | info | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditSessionAlreadyAbsent` | logout targeted a session already absent or expired | info | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditSessionDestroyFailed` | session deletion hit a store failure; the request returns static 503 and preserves state | alert | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditLogoutClientLookupFailed` | client-registry lookup failed with a store error while resolving an RP-initiated logout; the wire response remains generic | alert | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditLogoutRPInitiated` | **Reserved** — no separate RP-initiated marker is emitted | info | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditLogoutTokenRevokeFailed` | logout-token or logout cascade revocation hit a store failure | alert | [Concepts: sessions and logout](/concepts/sessions-and-logout) |
| `AuditLogoutBackChannelDelivered` | Back-Channel logout token delivered to RP | info | [Use case: Back-Channel Logout](/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelFailed` | Back-Channel delivery failed (HTTP error / timeout / verification) | warn | [Use case: Back-Channel Logout](/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelResolveFailed` | grant-based target resolution failed | alert | [Use case: Back-Channel Logout](/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelOverflow` | bounded target resolution overflowed | warn | [Use case: Back-Channel Logout](/use-cases/back-channel-logout) |
| `AuditBCLNoSessionsForSubject` | a session-bearing `/end_session` notice resolved zero grant-derived RP targets (no RPs to notify) | info | [Use case: Back-Channel Logout](/use-cases/back-channel-logout) |

::: details `bcl.no_sessions_for_subject` rationale
This event is emitted only when `Notice.SessionID` is present and grant-based audience resolution returns zero RP targets; it does not mean that the coordinator walked `SessionStore` or that a session was evicted. If `SessionStore` loses the row before `/end_session` can snapshot it, the handler does not start detached fan-out and this event is not emitted. INFO-level by design: zero grant-derived targets can be an ordinary no-op, so SOC tooling should alert on elevated rates rather than per-event. The event includes the configured `WithSessionDurabilityPosture` as context for trigger/snapshot loss versus a no-target outcome.
:::

### Defensive signals

The OP emits the CORS, DPoP (when the opt-in loose verifier is used), and retired-key signals below. Rate-limit names are **Reserved for the embedder**. PKCE, redirect-mismatch, and legacy-algorithm names are **Reserved catalog vocabulary**: the OP rejects those requests but does not emit these audit events.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditRateLimitExceeded` | request rejected by rate limiter — **embedder-emitted** vocabulary; the library does not implement a generic per-IP / per-endpoint HTTP throttle | warn | — |
| `AuditRateLimitBypassed` | rate-limit bypass token consumed (operator override) — **embedder-emitted** vocabulary; same scoping as `AuditRateLimitExceeded` | warn | — |
| `AuditPKCEViolation` | **Reserved** — PKCE rejection is returned on the wire; no OP audit event is emitted | alert | [Concepts: authorization code + PKCE](/concepts/authorization-code-pkce) |
| `AuditRedirectURIMismatch` | **Reserved** — redirect rejection is returned on the wire; no OP audit event is emitted | warn | [Concepts: redirect URI](/concepts/redirect-uri) |
| `AuditAlgLegacyUsed` | **Reserved** — no OP path emits a legacy-algorithm telemetry event | warn | [Concepts: JOSE basics](/concepts/jose-basics) |
| `AuditCORSPreflightAllowed` | a CORS preflight matched the strict allow-list | info | [Use case: CORS for SPA](/use-cases/cors-spa) |
| `AuditDPoPLooseMethodCaseAdmitted` | **Conditional** — emitted only by a verifier configured with the loose method-case bridge; the standard `op.New` path is strict | info | [Concepts: DPoP](/concepts/dpop) |
| `AuditKeyRetiredKidPresented` | request presented a kid past the JWKS grace window — verifier rejected | warn | [Operations: key rotation](/operations/key-rotation) |

### Interaction

The OP emits a render-failure signal only when the interaction driver fails before committing a response. If the driver has already committed the response, the OP cannot replace it and emits no duplicate event.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditInteractionRenderFailed` | the interaction driver's render failed before response commitment; the OP serves a generic `server_error` page | alert | [Use case: SPA custom interaction](/use-cases/spa-custom-interaction) |

### Introspection

Fire from `/introspect` when client authentication rejects or an opaque access-token / refresh-token store lookup fails. A clean inactive miss emits no error event. For a non-`NotFound` lookup fault, the audit event surfaces the outage while the RFC 7662 wire response remains HTTP 200 with `{"active":false}`; client-authentication failures retain the canonical error response.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditIntrospectionError` | `/introspect` rejected inbound client credentials or observed a non-`NotFound` opaque token-store lookup fault | warn / alert | [Operations: observability](/operations/observability) |

### Client authentication

Fire from `/token`, `/par`, `/device_authorization`, and `/bc-authorize` whenever client authentication rejects. The wire response stays at the canonical `invalid_client`; this event exposes the attempted `client_id` and a short reason code so SOC tooling can spot probing. `/introspect` uses `AuditIntrospectionError` instead, and `/revoke` does not emit this event.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditClientAuthnFailure` | `/token`, `/par`, `/device_authorization`, or `/bc-authorize` rejected the client (wrong secret, expired assertion, alg mismatch, missing `private_key_jwt`) | warn | [Concepts: client types](/concepts/client-types) |

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
| `AuditDCRCascadeRefreshRevokeFailed` | client deletion could not revoke that client's refresh-token rows | alert | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRCascadeGrantRevokeFailed` | client deletion could not revoke that client's grants | alert | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRCascadeAccessTokenRevokeFailed` | client deletion could not revoke that client's JWT access-token rows | alert | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |
| `AuditDCRCascadeOpaqueAccessTokenRevokeFailed` | client deletion could not revoke that client's opaque access-token rows | alert | [Use case: Dynamic Client Registration](/use-cases/dynamic-registration) |

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
| `AuditDeviceCodeRevoked` | `op/devicecodekit.Revoke` flipped the row to denied; when `Deps.AccessTokens` is wired, the helper also cascade-revoked issued access tokens and reports `revoked_access_tokens` | info | [Use case: device code](/use-cases/device-code) |
| `AuditDeviceCodePollObservationFailed` | persisting the `LastPolledAt` stamp on a poll faulted; decision still proceeds (best-effort observability) | warn | [Use case: device code](/use-cases/device-code) |

### CIBA

Fire from `/bc-authorize` and the token-endpoint CIBA grant. `ciba.poll_abuse.lockout` is the canonical client-misbehaviour signal. The authentication-device approval and denial names are **Reserved**: the embedder calls `CIBARequestStore.Approve` or `Deny` directly, outside an OP emission point.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditCIBAAuthorizationIssued` | `/bc-authorize` returned a fresh `auth_req_id` | info | [Concepts: CIBA](/concepts/ciba) |
| `AuditCIBAAuthorizationRejected` | `/bc-authorize` rejected the inbound request (unknown user, hint resolver failed, scope refusal) | warn | [Concepts: CIBA](/concepts/ciba) |
| `AuditCIBAAuthorizationUnboundRejected` | DPoP / mTLS proof was required but absent from `/bc-authorize` | warn | [Concepts: sender-constrained tokens](/concepts/sender-constraint) |
| `AuditCIBAAuthDeviceApproved` | **Reserved** — embedder authentication-device callback; the OP does not observe the direct `Approve` call | info | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBAAuthDeviceDenied` | **Reserved** — embedder authentication-device callback; the OP does not observe the direct `Deny` call | warn | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBAPollAbuseLockout` | poll cadence sustained well below the negotiated interval; the request was locked out | alert | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBATokenIssued` | `/token` minted a token for an approved CIBA request | info | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBATokenRejected` | `/token` rejected the CIBA grant (`access_denied`, `expired_token`, `authorization_pending`) | warn | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBATokenSlowDown` | `/token` returned `slow_down` because the client polled faster than the negotiated interval | warn | [Use case: CIBA](/use-cases/ciba) |
| `AuditCIBAPollObservationFailed` | persisting the `LastPolledAt` stamp on a poll faulted; decision still proceeds (best-effort observability) | warn | [Use case: CIBA](/use-cases/ciba) |

### Token Exchange (RFC 8693)

Fire from the in-tree `RegisterTokenExchange` handler. `requested` is emitted at handler entry, before parsing and structural validation, so structurally rejected attempts are included. Every successful exchange then emits `requested` + `granted`; later rejections emit `requested` + one of the failure-class events. `policy_denied`, `scope_inflation_blocked`, and `audience_blocked` are the policy-decision signals SOC dashboards usually want.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditTokenExchangeRequested` | `/token` dispatched an RFC 8693 attempt to the exchange handler, before parsing and structural validation | info | [Concepts: token exchange](/concepts/token-exchange) |
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

### Custom Grant

The dispatcher emits `custom_grant.requested` at dispatch entry for every attempt that reaches a registered custom handler, including successes and attempts that fail a gate before the handler runs. An unknown or unregistered `grant_type` returns before custom-grant dispatch and emits no custom-grant audit event. The dispatcher emits one `custom_grant.failed` at the single failure exit; a handler panic is recovered and produces that same one failed event with panic details in `extras`.

| Event | Meaning | Level | See |
|---|---|---|---|
| `AuditCustomGrantRequested` (`custom_grant.requested`) | every dispatch attempt that reaches a registered custom handler, including pre-handler gate failures | info | [Use case: custom grant](/use-cases/custom-grant) |
| `AuditCustomGrantFailed` (`custom_grant.failed`) | custom grant dispatch or handler failed; emitted once per failed attempt, including a recovered panic | warn | [Use case: custom grant](/use-cases/custom-grant) |
| `AuditCustomGrantRefreshDropped` (`custom_grant.refresh_dropped`) | handler asked for a refresh token with `IssueRefreshToken`, but the client is not registered for `refresh_token`; the access-token response still succeeds | info | [Use case: custom grant](/use-cases/custom-grant) |

### Grant management

These events come from the OAuth 2.0 Grant Management endpoint. The failure signal is emitted when the authenticated revoke request cannot complete its grant cascade.

| Event constant | When it fires | Severity hint | Linked doc |
|---|---|---|---|
| `AuditGrantManagementRevoked` | a `DELETE` to the grant management endpoint revoked a grant and cascaded its tokens | info | [Use case: grant management](/use-cases/grant-management) |
| `AuditGrantManagementRevokeFailed` | a `DELETE` was authenticated but the grant-revoke side effect failed | alert | [Use case: grant management](/use-cases/grant-management) |

## Stability

Audit event names are part of the public API surface:

- New events MAY be added in any minor release.
- Existing event names are renamed only in a major release with a deprecation notice.

Pin your dashboards on the names; do not rely on the order or the extras shape for any field not documented here.

## Verifying this list

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
audit_catalog_tmp=$(mktemp ./audit-catalog-XXXXXX.go)
trap 'rm -f "$audit_catalog_tmp"' EXIT
cat >"$audit_catalog_tmp" <<'EOF'
package main

import (
  "fmt"
  "github.com/libraz/go-oidc-provider/op"
)

func main() {
  for _, def := range op.AuditEventCatalog() {
    fmt.Println(def.Event)
  }
}
EOF
go run "$audit_catalog_tmp"
```

This calls the public `op.AuditEventCatalog()` API and prints the closed catalog this page mirrors.
