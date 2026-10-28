---
title: MFA / step-up
description: Compose authenticators and rules — TOTP always, captcha after N failures, and ACR step-up on demand with login/MFA audit signals.
pageClass: pg-use-cases-mfa-step-up
---

# Use case — MFA / step-up

The login layer is built from three primitives that compose:

- **`Step`**: verifies one factor (password, TOTP, passkey, email OTP, or your own through [`op.ExternalStep`](/use-cases/custom-authenticator)).
- **`Rule`**: decides whether a step is required for this attempt.
- **`LoginFlow`**: one `Primary` step plus an ordered list of `Rules`.

Once the primary step succeeds, the OP walks the rules and runs the step of every rule that matches. "Password always, TOTP always" is one flow; "password always, captcha after 3 failures, TOTP when the risk score is high" is another.

Use this page when the login decision depends on more than "password accepted": mandatory MFA, a captcha for suspicious attempts, risk-based extra factors, or an RP that asks for a stronger `acr`. If you only need username and password, the default password primary step and the user-store pages are enough; adding rules before you need them mainly adds test and recovery surface.

::: details Specs referenced on this page
- [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238) — TOTP (Time-Based One-Time Password)
- [RFC 8176](https://datatracker.ietf.org/doc/html/rfc8176) — Authentication Method Reference Values (`amr`)
- [RFC 9470](https://datatracker.ietf.org/doc/html/rfc9470) — OAuth 2.0 Step-up Authentication Challenge (the resource-server half)
- [WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/) — Passkeys
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) — Authenticator Assurance Levels (AAL)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2 (`acr`, `amr`, `auth_time`)
:::

::: details Vocabulary refresher
- **MFA**: multi-factor authentication. The user proves more than one factor (something they know, have, or are) before the OP issues tokens.
- **Step-up**: when an RP needs higher assurance for a sensitive operation, it sends `acr_values=aalN` (OIDC Core §3.1.2.1). The OP then runs an additional factor before issuing a fresh `id_token`. RFC 9470 standardises how a resource server asks the client to do this.
- **AAL (Authenticator Assurance Level)**: NIST's three-tier ladder. AAL1 is roughly a password, AAL2 a password plus a second factor, AAL3 hardware-backed proof of possession. Many OPs and RPs use these labels in `acr`.
- **`amr` claim**: RFC 8176 lists standard reference values (`pwd`, `otp`, `mfa`, `hwk`, `face`, `fpt`, ...) so RPs can audit which factors actually ran.
:::

> **Sources:** [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) — password + always-TOTP; [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa) — risk-driven step-up; [`examples/22-login-captcha`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha) — captcha after N failed attempts; [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — RFC 9470 ACR step-up; [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) — the shipped SQL factor stores, shared with the core OP tables in one database.

## Composition

<figure class="fig">
  <div class="fig-head">One primary step, then whichever rules fire</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-mfa-title" viewBox="0 0 960 384" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-mfa-title">A login flow runs one primary step, then evaluates its rules. Each rule that fires contributes a further factor step; when none fires, the tokens are issued. Rules are checked in declaration order; a rule whose step already ran is skipped, and the loop repeats until none fires.</title>
    <!-- primary -->
    <rect class="fg-box" x="32" y="24" width="272" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="52">Primary step</text>
    <text class="fg-m fg-accent" x="48" y="76">PrimaryPassword</text>
    <path class="fg-edge" d="M304,60 H344" marker-end="url(#fg-a)"/>
    <!-- rules -->
    <rect class="fg-box fg-box--accent" x="344" y="24" width="272" height="72" rx="8"/>
    <text class="fg-t2" x="360" y="52">Evaluate the rules</text>
    <text class="fg-s" x="360" y="76">in declaration order</text>
    <path class="fg-edge fg-edge--ok" d="M616,60 H656" marker-end="url(#fg-ao)"/>
    <!-- tokens -->
    <rect class="fg-box fg-box--ok" x="656" y="24" width="272" height="72" rx="8"/>
    <text class="fg-t2" x="672" y="52">Issue the tokens</text>
    <text class="fg-s" x="672" y="76">when none fires</text>
    <path class="fg-edge fg-edge--thin" d="M480,96 V128" marker-end="url(#fg-a)"/>
    <!-- rule table -->
    <rect class="fg-box" x="32" y="128" width="896" height="232" rx="8"/>
    <text class="fg-lbl" x="48" y="156">RULE</text>
    <text class="fg-lbl" x="304" y="156">FIRES WHEN</text>
    <text class="fg-lbl" x="640" y="156">ADDS</text>
    <line class="fg-rule fg-rule--strong" x1="32" y1="168" x2="928" y2="168"/>
    <text class="fg-mxs" x="48" y="198">RuleClient</text>
    <text class="fg-s" x="304" y="198">the client is the admin client</text>
    <text class="fg-mxs fg-accent" x="640" y="198">→ StepEmailOTP</text>
    <line class="fg-rule" x1="48" y1="216" x2="912" y2="216"/>
    <text class="fg-mxs" x="48" y="246">RuleAfterFailedAttempts</text>
    <text class="fg-s" x="304" y="246">failed attempts ≥ 3</text>
    <text class="fg-mxs fg-accent" x="640" y="246">→ StepCaptcha</text>
    <line class="fg-rule" x1="48" y1="264" x2="912" y2="264"/>
    <text class="fg-mxs" x="48" y="294">RuleRisk</text>
    <text class="fg-s" x="304" y="294">risk score ≥ High</text>
    <text class="fg-mxs fg-accent" x="640" y="294">→ StepTOTP</text>
    <line class="fg-rule" x1="48" y1="312" x2="912" y2="312"/>
    <text class="fg-mxs" x="48" y="342">RuleACR</text>
    <text class="fg-s" x="304" y="342">"aal3" in acr_values</text>
    <text class="fg-mxs fg-accent" x="640" y="342">→ PrimaryPasskey</text>
  </svg>
  <figcaption class="fig-note">Each rule is a predicate over the attempt, and each step kind appears in at most one rule. After a step runs the rules are evaluated again, and a rule's answer does not depend on the other rules, so adding a fifth rule does not change what the other four decide.</figcaption>
</figure>

`LoginFlow` is a struct with a `Primary` step, a list of `Rules`, and two optional fields: `Decider` (a policy hook consulted before the rules, for policies a rule cannot express) and `Risk` (a `RiskAssessor`). Each `Rule` pairs a predicate with a step and is built with a constructor:

| Constructor | Fires when |
|---|---|
| `op.RuleAlways(step)` | on every attempt |
| `op.RuleAfterFailedAttempts(n, step)` | this attempt has at least `n` rejected submissions |
| `op.RuleRisk(threshold, step)` | the assessor's score is at least `threshold` |
| `op.RuleNewDevice(step)` | the assessor reports a new device |
| `op.RuleClient(clientID, step)` | the request comes from that client |
| `op.RuleScope(scope, step)` | the request asks for that scope |
| `op.RuleACR(acr, step)` | `acr` is in the request's `acr_values` |
| `op.RuleWhen(pred, step)` | your own predicate over `op.LoginContext` returns true |

How the OP evaluates them:

- After `Primary`, the OP checks the rules in declaration order, runs the step of the first one that matches and has not run yet, then checks again. When none matches, authentication is complete.
- Each step kind may appear in only one rule; `op.New` rejects a flow that repeats one.
- A rule with a nil `When` (including a bare `op.Rule{Then: step}`) always matches, and a predicate that panics counts as a match. A flaw in a predicate therefore demands the factor rather than skipping it.
- `Primary` must be able to identify the user. `op.PrimaryPasskey`, `op.StepTOTP`, `op.StepEmailOTP`, and `op.StepRecoveryCode` verify a user who is already known, so `op.New` refuses them as `Primary`; put them in a rule behind `op.PrimaryPassword` or an [`op.ExternalStep`](/use-cases/custom-authenticator).
- `WithLoginFlow` is exclusive with the older `WithAuthenticators`, and may be called once.

## Always TOTP

```go
import (
  "github.com/libraz/go-oidc-provider/op"
)

flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleAlways(op.StepTOTP{
      Store:         st.TOTPs(),
      EncryptionKey: keys.TOTPKey,
    }),
  },
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
)
```

## Captcha after N failed attempts

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleAfterFailedAttempts(3, op.StepCaptcha{Verifier: myCaptchaVerifier}),
  },
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
  op.WithCaptchaVerifier(myCaptchaVerifier), // hCaptcha / Turnstile / etc.
)
```

`StepCaptcha` also needs the verifier on the `Verifier` field; `op.WithCaptchaVerifier` supplies the same verifier to the OP for the captcha prompt it raises itself.

`RuleAfterFailedAttempts` reads the count of rejected submissions in the current attempt, which comes from the `LoginAttemptObserver` (passed through `op.WithLoginAttemptObserver`). The observer receives one `op.LoginAttempt` per authentication attempt. Its `Outcome` is `op.AttemptSuccess`, `op.AttemptFailure`, or `op.AttemptLocked`. `AttemptLocked` means the brute-force gate ended the attempt without evaluating the submitted credential, so handle it separately from an ordinary failure.

## Risk-based step-up

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleRisk(op.RiskScoreHigh, op.StepTOTP{Store: st.TOTPs(), EncryptionKey: keys.TOTPKey}),
  },
  Risk: myRiskAssessor, // RiskAssessor field on LoginFlow
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
)
```

The `RiskAssessor` runs once per login attempt, before `Primary`, and returns a `RiskScore` from a four-level ordered enum (`RiskScoreNone` < `RiskScoreLow` < `RiskScoreMedium` < `RiskScoreHigh`). Your assessor maps whatever your risk provider returns onto it. `RuleRisk(threshold, step)` fires when the score is at least `threshold`.

The assessor can also deny the attempt or require named factors outright. Set it either as `LoginFlow.Risk` or with `op.WithRiskAssessor`, not both (`op.New` fails). Without an assessor the score stays `RiskScoreNone`, so a `RuleRisk` never fires; it does not raise an error.

## ACR step-up

When the RP asks for a stronger Authentication Context Class (`acr_values=aal3`), a `RuleACR` for that value runs its step:

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleACR("aal3", op.StepTOTP{Store: st.TOTPs(), EncryptionKey: keys.TOTPKey}),
  },
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
  op.WithACRPolicy(myACRPolicy), // op.ACRPolicy implementation
)
```

The rule is a plain match on the request's `acr_values`: it runs the factor you named whether or not the session already holds an equal or stronger authentication, and the OP does not pick a factor for you.

What the issued `id_token` then reports in `acr` is the job of the `ACRPolicy`. The default policy is lax: it echoes the first requested value once the login reached AAL1. If `aal3` must mean something, install a policy that checks the completed steps and AAL before it agrees.

### Rules on a reused session

A request can often be served from an existing session without any login, for example when a cached grant covers the scopes or the client is first-party. Before the OP issues a code that way, it evaluates the `Decider` and the rules as if `Primary` had just completed and nothing else had run. If a rule demands a step, the OP runs the chain from the session's subject rather than issuing; with `prompt=none` it answers `interaction_required`.

Consequences for rule design:

- Factors completed earlier in the session do not satisfy a rule. A `RuleAlways(StepTOTP)` asks again on each authorization that the session could otherwise serve. Scope such steps with `RuleClient`, `RuleScope`, or `RuleACR` when you want them only where they matter.
- A step-up on a reused session keeps the session's `acr`, `amr`, and `auth_time` in the issued tokens alongside the step-up factor. Risk assessors see the session's methods, and rules see `Primary` as completed.
- Captcha rules and risk-driven rules do not apply to the reuse check; they run only inside a chain.
- Step-up factors on a reused session are audited as `mfa.*` events, not `login.*`.

## The resource-server side: `op.StepUpChallenge`

RFC 9470 has two halves. The OP half is above: honour `acr_values` and `max_age` on `/auth` and re-authenticate. The other half lives at the **resource server**: when an access token lacks the required strength or freshness for a sensitive call, the resource server answers `401` with a `WWW-Authenticate: Bearer` challenge carrying `error="insufficient_user_authentication"` and the `acr_values` / `max_age` it needs. The client then re-authorizes with those values, and the OP step-up above kicks in.

`op.StepUpChallenge` builds that header value. The OP never emits it, because token validation and the `401` belong to your resource server; the library only produces the challenge string:

```go
maxAge := int64(300)
challenge := op.StepUpChallenge("api", []string{"urn:acr:high", "urn:acr:mfa"}, &maxAge)
// challenge == `Bearer realm="api", error="insufficient_user_authentication",
//               acr_values="urn:acr:high urn:acr:mfa", max_age="300"`
w.Header().Set("WWW-Authenticate", challenge)
w.WriteHeader(http.StatusUnauthorized)
```

An empty `realm`, an empty `acrValues` slice, and a `nil` `maxAge` are each omitted; the mandatory `error="insufficient_user_authentication"` is always present. `acrValues` is encoded as a single space-delimited quoted string, mirroring the `acr_values` request parameter.

## One-time factors are single-use

The one-time factors — email-OTP (`op.StepEmailOTP`), TOTP (`op.StepTOTP`), and recovery codes (`op.StepRecoveryCode`) — are single-use under concurrency: a code cannot be accepted twice. The store enforces this with an atomic compare-and-set that returns `ErrAlreadyConsumed` on replay, so two racing requests presenting the same code cannot both succeed. A [custom factor store](/use-cases/byo-store) must make these consume operations a CAS (the in-memory reference shows the shape).

Terminal factor failures answer **HTTP 400**, not 500: an expired or already-consumed one-time code, a lockout, a required reset, too many resends, a result naming a different subject than the one already bound, and an AAL3 factor completed without user verification. These are conditions of the submission, not server faults; the user can start a fresh attempt.

The `AttemptsRemaining` value on the recovery-code prompt is the remaining failed-submission budget. It is not a count of unconsumed recovery codes, and a driver must not use it to infer how many recovery codes remain.

## Audit trail

Each factor outcome is emitted from the `op.Audit*` catalog. The primary factor uses `op.AuditLoginSuccess` and `op.AuditLoginFailed`; any additional factor, including a step-up on a reused session, uses `op.AuditMFASuccess` and `op.AuditMFAFailed`. The guess that triggers a lockout or a required reset is recorded as a failure; refusals while the account stays locked are not counted as failed logins. `op.AuditLockoutStalled` reports repeated contention on the cross-factor lockout counter that abandoned a failed attempt without counting it.

`op.AuditMFARequired`, `op.AuditStepUpRequired`, and `op.AuditStepUpSuccess` are reserved catalog names; the OP never emits them. The `mfa.*` events carry the same information without double-counting retries.

Each event carries the resolved `factor` (`password`, `totp`, `passkey`, ...) in `extras`, and goes through `op.WithAuditLogger` (a `*slog.Logger`). Emission is synchronous on the request goroutine, so the handler must not block and must be safe for concurrent use.

## Where authenticators come from

The library ships ready-to-use steps for the common factors:

| Step | What it verifies | Storage interface |
|---|---|---|
| `op.PrimaryPassword` | Username / email + password | `store.UserPasswords()` |
| `op.PrimaryPasskey` | WebAuthn / passkey as the primary factor | `store.Passkeys()` |
| `op.StepTOTP` | RFC 6238 TOTP, AES-256-GCM at-rest secret encryption | `store.TOTPs()` |
| `op.StepEmailOTP` | Email-delivered one-time code | `store.EmailOTPs()` |
| `op.StepRecoveryCode` | Single-use recovery codes | `store.RecoveryCodes()` |
| `op.StepCaptcha` | hCaptcha / Turnstile / your verifier | n/a |

The **storage** behind each step is yours — the library never owns user records or password hashes. The reference `inmem` adapter is fine for examples and tests; in production you implement the `op/store/*` substores against your existing user table.

For a factor with no built-in step, implement `op.Authenticator` and wrap it in `op.ExternalStep` with a dotted `KindLabel`; [Custom authenticator](/use-cases/custom-authenticator) walks through it.

For account-management flows, use the companion packages rather than constructing credential records yourself. [`op/passkeykit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/passkeykit) runs the WebAuthn registration ceremony from the same `PrimaryPasskey` configuration used at login. [`op/recoverykit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/recoverykit) creates and replaces recovery-code batches; show `Result.Codes` once and never persist or log them. `op.NewEmailOTPAuthenticator(op.EmailOTPConfig{...})` builds the lower-level email-OTP authenticator when you use `WithAuthenticators` instead of `LoginFlow`. See [`28-email-otp-recovery`](https://github.com/libraz/go-oidc-provider/tree/main/examples/28-email-otp-recovery) and [`29-passkey`](https://github.com/libraz/go-oidc-provider/tree/main/examples/29-passkey).

::: warning Passkeys need a domain, not an IP
A WebAuthn Relying Party ID must be a domain name, and browsers reject an IP literal for it, so an OP developing against `http://127.0.0.1` has no valid RP ID to pair with. Bind the issuer to `localhost` and opt in with [`op.WithAllowLocalhostLoopback()`](/reference/options), which admits the textual host in the issuer as well as in redirect URIs. The carve-out is for a developer machine and nowhere else; production RPs belong behind https.

Setting `AAGUIDAllowlist` on `op.PrimaryPasskey` also switches the registration ceremony to `direct` attestation conveyance, because an AAGUID without attestation is self-asserted and a software authenticator could name an approved model. The allowlist therefore requires `AttestationRoots` (trust anchors for the attestation certificate chain; the OP does not fetch FIDO MDS), and `op.New` refuses an allowlist without them. Expect a user-agent attestation prompt; a registration whose chain does not verify is refused rather than matched. Leave the allowlist empty to keep the prompt-free ceremony.

`RequireUserVerification: true` applies to both passkey registration and login. The authenticator must perform a user-verification gesture such as a PIN or biometric; a presence-only registration or assertion is refused. Keep this setting in the shared `op.PrimaryPasskey` configuration used by `op/passkeykit`, so a credential accepted during enrolment remains usable at login.
:::

## Enrolling a TOTP factor

`op.StepTOTP` verifies codes against a `store.TOTPRecord` the embedder has already persisted. The complementary registration path lives in the [`op/totpkit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/totpkit) package: it owns secret generation, the `otpauth://` provisioning URI rendered as a QR code, and the proof-of-possession step that marks an enrolment confirmed.

```go
import (
  "github.com/libraz/go-oidc-provider/op/totpkit"
)

// Construct one codec at startup; share the same key bytes with
// op.StepTOTP{EncryptionKey: keys.TOTPKey} so verify and enrolment
// produce / consume the same AES-256-GCM blob shape.
codec, err := totpkit.NewCodec(keys.TOTPKey /*, previousKey, ... */)

// 1. After primary auth succeeds, kick off enrolment.
pending, err := totpkit.NewEnrolment(codec,
  user.Subject,        // OP-internal stable user ID (bound as AAD)
  "Example Identity",  // issuer label shown by the authenticator app
  user.Email,          // account label shown beneath the issuer
)
// pending.OTPAuthURI    — render this as a QR code in HTML
// pending.SecretBase32  — show this for "manual entry" UX
// pending.Record        — sealed TOTPRecord, NOT yet persistable

// 2. Stash `pending` in a short-lived enrolment session (server-side
//    row keyed by a cookie). Render the QR code and the manual-entry
//    secret to the user.

// 3. The user types the code their authenticator app displays.
record, err := totpkit.Confirm(codec, pending, submittedCode, time.Now())
// On totpkit.ErrCodeRejected, render the form again — `pending` is
// unmutated and the user retries. ErrDecrypt fires when the key has
// rotated past the codec's retention window.

// 4. Persist the confirmed record. From this moment op.StepTOTP
//    accepts codes against the same secret.
_ = storage.TOTPs().Put(ctx, record)
```

`totpkit` deliberately stays out of the HTTP surface — the embedder owns the HTML, the QR rendering, and the enrolment session. Both `NewEnrolment` and `Confirm` bind the `subject` as GCM additional-authenticated-data, so a row exfiltrated from one user's enrolment cannot be replayed under a different subject. The verify path uses the same AAD shape, so the binding holds across both ends.

For demo / CLI-only enrolment (terminal QR rendering, pre-confirmed seed records), see `examples/internal/seedkit` — it sits behind a `//go:build example` tag so the QR rendering library never enters the host module's `go.sum`.

> **Source:** [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — in-process OP+RP demo that walks the full enrolment + RFC 9470 ACR step-up flow.
