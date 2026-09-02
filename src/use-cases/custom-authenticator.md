---
title: Custom authenticator
description: Add a hardware token, SMS, magic link, or other factor through the public op.Authenticator and op.ExternalStep seams.
pageClass: pg-use-cases-custom-authenticator
---

# Custom authenticator

The library ships built-in `Step` values for password, passkey, TOTP, email OTP, captcha, and recovery codes. For anything else — hardware tokens, SMS, magic links, proprietary device-trust factors — you implement the `op.Authenticator` interface and adapt it through `op.ExternalStep`.

This page walks through the contract, a worked example, and the common pitfalls.

## When you need this

| Need | Use this page? |
|---|---|
| Add a TOTP factor | No — `op.StepTOTP` covers it ([MFA / step-up](/use-cases/mfa-step-up)) |
| Add a passkey factor | No — `op.PrimaryPasskey` covers it |
| Add SMS OTP | Yes |
| Add a hardware token (YubiKey OTP, hardware HOTP) | Yes |
| Add magic-link login | Yes |
| Add a custom risk gate | No — use `op.RuleRisk` + your own `RiskAssessor` |
| Add a non-credential prompt (T&C, KYC) | No — use `op.Interaction` ([Terms / KYC use case]) |

The seam: anything that **collects credentials and binds a subject** is an `Authenticator`. Anything that **runs after the subject is bound and emits prompts** is an `Interaction`.

## The interface

```go
package op

type Authenticator interface {
    // Type returns the FactorType this authenticator implements.
    // Two registered authenticators MUST NOT share a Type.
    Type() FactorType

    // AAL returns the assurance level a successful Continue raises
    // the session to. The orchestrator takes the maximum across all
    // completed factors.
    AAL() AAL

    // AMR returns the RFC 8176 §2 registered value contributed to
    // the amr claim, or "" to suppress this factor's contribution.
    AMR() string

    // Prompts returns every interaction.Prompt.Type this authenticator
    // may emit. The orchestrator validates its routing table at
    // startup against this list.
    Prompts() []string

    // Begin starts the ceremony. The returned interaction.Step
    // carries a Prompt for a multi-step factor or a populated Result
    // for a factor that completes immediately.
    Begin(ctx context.Context, in BeginInput) (interaction.Step, error)

    // Continue advances the ceremony with the SPA's submission.
    Continue(ctx context.Context, in ContinueInput) (interaction.Step, error)
}
```

Implementations MUST be safe for concurrent use; the orchestrator dispatches across goroutines. `BeginInput` carries the bound subject (when one exists), client ID, reference `AuthTime`, requested scopes, and a read-only client view. `ContinueInput` carries the submitted `interaction.FormSubmission`, the same `AuthTime`, the bound subject, and the opaque `Scratch` returned on the previous step.

The orchestrator stamps `Prompt.StateRef` after `Begin` or `Continue` returns. An authenticator must not invent or persist a state reference. Put per-attempt state in `interaction.Step.Scratch`; the value is kept server-side and returned through `ContinueInput.Scratch`.

## State transitions

An `Authenticator` returns either the next prompt or a result that completes authentication. For a two-step factor such as SMS OTP, `Begin` returns the first prompt and each SPA submission makes `Continue` return the next prompt or the final result.

<svg class="auth-flow" role="img" aria-labelledby="authenticator-flow-title" viewBox="0 0 760 352" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="authenticator-flow-title">The state machine of a custom authenticator. LoginFlow calls Begin, the user passes a phone-number prompt and then a code prompt, and returning a Result writes the subject and factor into the session.</title>
  <defs>
    <marker id="auth-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <rect x="40" y="34" width="160" height="58" rx="8"/>
  <text class="h" x="120" y="58" text-anchor="middle">LoginFlow</text>
  <text class="m sub" x="120" y="77" text-anchor="middle">Begin(ctx, input)</text>

  <rect class="accent" x="300" y="24" width="180" height="78" rx="8"/>
  <text class="h accent-text" x="390" y="50" text-anchor="middle">Authenticator</text>
  <text class="m sub" x="390" y="70" text-anchor="middle">Type / AAL / AMR</text>
  <text class="m sub" x="390" y="88" text-anchor="middle">Prompts()</text>

  <rect x="560" y="34" width="160" height="58" rx="8"/>
  <text class="h" x="640" y="58" text-anchor="middle">SPA / HTML</text>
  <text class="t sub" x="640" y="77" text-anchor="middle">renders the screen</text>

  <path d="M200 63 H296" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub" x="248" y="52" text-anchor="middle">Begin</text>
  <path d="M480 63 H556" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub" x="518" y="52" text-anchor="middle">Prompt</text>

  <rect class="soft" x="88" y="142" width="584" height="56" rx="8"/>
  <text class="h" x="380" y="166" text-anchor="middle">1. myorg.sms.collect_phone</text>
  <text class="t sub" x="380" y="185" text-anchor="middle">take the phone number, generate an OTP, and send it</text>
  <path d="M640 92 C640 122 530 132 438 142" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub halo" x="576" y="126" text-anchor="middle">POST phone</text>
  <path d="M322 198 C245 214 245 244 322 260" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub" x="246" y="234" text-anchor="middle">Continue</text>

  <rect class="soft" x="88" y="260" width="584" height="56" rx="8"/>
  <text class="h" x="380" y="284" text-anchor="middle">2. myorg.sms.collect_code</text>
  <text class="t sub" x="380" y="303" text-anchor="middle">verify the submitted code and, on success, return Result{Subject: ...}</text>

  <path d="M380 316 V340 H56 V96" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub" x="250" y="330" text-anchor="middle">returns Result</text>
</svg>

The `Result` returned by the last step closes the ceremony: the orchestrator writes the subject, the AAL, and the AMR value into the session, and the LoginFlow moves on to the next rule.

## Worked example: SMS OTP

The factor: collect a phone number, send a 6-digit code via SMS, verify the user's submitted code.

### 1. Implement `Authenticator`

```go
package smsauth

import (
    "context"
    "crypto/rand"
    "encoding/binary"
    "fmt"
    "time"

    "github.com/libraz/go-oidc-provider/op"
    "github.com/libraz/go-oidc-provider/op/interaction"
    "github.com/libraz/go-oidc-provider/op/store"
)

type SMSAuthenticator struct {
    Sender    SMSSender                 // your SMS provider adapter
    OTPStore  OTPStore                  // your per-attempt OTP record store
    UserStore store.UserStore            // for "phone -> subject" lookup
    CodeTTL   time.Duration             // typically 5 minutes
}

func (a *SMSAuthenticator) Type() op.FactorType { return "myorg.sms_otp" }
func (a *SMSAuthenticator) AAL() op.AAL         { return op.AAL2 }
func (a *SMSAuthenticator) AMR() string         { return "otp" } // RFC 8176 §2

const (
    phonePrompt = "myorg.sms.collect_phone"
    codePrompt  = "myorg.sms.collect_code"
)

func (a *SMSAuthenticator) Prompts() []string {
    return []string{phonePrompt, codePrompt}
}

func (a *SMSAuthenticator) Begin(_ context.Context, _ op.BeginInput) (interaction.Step, error) {
    // First prompt: collect phone number.
    return interaction.Step{
        Prompt: &interaction.Prompt{
            Type: phonePrompt,
            Inputs: []interaction.FieldSpec{{
                Name:     "phone",
                Kind:     interaction.FieldText,
                Required: true,
                MaxLen:   254,
            }},
        },
        Scratch: []byte(phonePrompt),
    }, nil
}

func (a *SMSAuthenticator) Continue(ctx context.Context, in op.ContinueInput) (interaction.Step, error) {
    switch string(in.Scratch) {
    case phonePrompt:
        phone := in.Submission.Values["phone"]
        if phone == "" {
            return interaction.Step{}, fmt.Errorf("phone required")
        }
        // Constant-time lookup: response shape MUST be identical
        // for registered vs unknown phone numbers.
        subject, _ := a.UserStore.LookupByPhone(ctx, phone)

        // Always dispatch a code (even if subject is empty) — leak defence.
        code, err := generate6DigitCode()
        if err != nil {
            return interaction.Step{}, err
        }
        if subject != "" {
            if err := a.OTPStore.Put(ctx, subject, hash(code), a.CodeTTL); err != nil {
                return interaction.Step{}, err
            }
            if err := a.Sender.Send(ctx, phone, code); err != nil {
                return interaction.Step{}, err
            }
        }
        return interaction.Step{
            Prompt: &interaction.Prompt{
                Type: codePrompt,
                Inputs: []interaction.FieldSpec{{
                    Name:     "code",
                    Kind:     interaction.FieldOTPCode,
                    Required: true,
                    MinLen:   6,
                    MaxLen:   6,
                }},
            },
            Scratch: []byte(codePrompt),
        }, nil

    case codePrompt:
        submitted := in.Submission.Values["code"]
        // Constant-time compare against stored hash.
        subject, ok := a.OTPStore.Verify(ctx, submitted)
        if !ok {
            return interaction.Step{}, fmt.Errorf("code rejected")
        }
        return interaction.Step{
            Result: &interaction.Result{
                Subject:  subject,
                AuthTime: in.AuthTime,
            },
        }, nil
    }
    return interaction.Step{}, fmt.Errorf("unexpected authenticator state")
}

func generate6DigitCode() (string, error) {
    b := make([]byte, 4)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    n := binary.BigEndian.Uint32(b) % 1_000_000
    return fmt.Sprintf("%06d", n), nil
}
```

### 2. Plug it into a `LoginFlow`

```go
flow := op.LoginFlow{
    Primary: op.PrimaryPassword{Store: myStore.UserPasswords()},
    Rules: []op.Rule{
        op.RuleAlways(op.ExternalStep{
            Authenticator: &smsauth.SMSAuthenticator{
                Sender:    twilioSender,
                OTPStore:  redisOTPs,
                UserStore: myStore,
                CodeTTL:   5 * time.Minute,
            },
            KindLabel: "myorg.sms_otp", // dotted prefix REQUIRED
        }),
    },
}

op.New(
    /* required options */
    op.WithLoginFlow(flow),
)
```

The dotted prefix on `KindLabel` (`myorg.sms_otp`) is **required** — the LoginFlow compiler rejects bare or built-in labels at construction time. Use your organisation identifier as the prefix.

### 3. Render the prompts in your UI

The SPA receives the prompt at `/interaction/{uid}` as JSON when the JSON interaction driver is configured (`op.WithInteractionDriver(interaction.JSONDriver{})`). The envelope includes the custom `type`, the declared `inputs`, and an opaque `state_ref`; the SPA must echo that `state_ref` in `FormSubmission.StateRef` and send values under `FormSubmission.Values`.

```json
{
  "prompt": {
    "type": "myorg.sms.collect_phone",
    "inputs": [{"name": "phone", "kind": 0, "required": true}],
    "state_ref": "..."
  }
}
```

Render a phone input, then POST a `FormSubmission` whose `values` contains `{ "phone": "+1..." }` back to the same endpoint. The next response carries the `myorg.sms.collect_code` prompt; render a code input and POST `{ "values": { "code": "123456" } }`. The third response is a `Result` with the bound subject.

For HTML-driver setups, register a custom template that handles the two prompt types.

## Prompt fields and limits

Custom prompts should declare every submitted field in `Prompt.Inputs`. `PromptData` is a sealed interface; an application cannot add an arbitrary data type from outside the `interaction` package. Use `FieldSpec` for custom form fields, and keep secrets out of `Prompt.StateRef` and `Step.Scratch` values that a driver could expose.

`FieldKind` is limited to `FieldText`, `FieldPassword`, `FieldOTPCode`, `FieldEmail`, and `FieldHidden`. `Required`, `MinLen`, `MaxLen`, and a full-match `Pattern` are enforced before `Continue` runs. If `MaxLen` is zero, the byte limits are 512 for text, 1024 for password, 32 for OTP code, 320 for email, and 16 KiB for hidden fields. Every submission is also capped at 32 KiB across names and values and may contain at most four entries beyond the declared fields. A prompt's `StateRef` expires after 10 minutes and is single-use; a stale or replayed reference is rejected before the authenticator runs.

The built-in MFA prompts use the same contract: TOTP exposes an `AttemptsRemaining` value and an exactly six-digit `code`; email OTP exposes a masked address and `ExpiresAt`, accepts a 254-byte email and a six-digit code, and defaults its code lifetime to five minutes; passkey exposes the WebAuthn challenge and allow-list and caps the assertion response at 16 KiB; recovery codes expose `AttemptsRemaining` and accept 10–32-byte codes. For both TOTP and recovery prompts, `AttemptsRemaining` is the remaining failed-submission budget, not the number of unconsumed recovery codes. These values are prompt metadata and validation bounds, not a replacement for factor-specific rate limiting.

## Contract requirements

The orchestrator validates configuration at provider construction and rejects an empty step when it runs. The following rules are part of the public contract:

| Requirement | Why |
|---|---|
| `Type()` is unique within a flow | dispatch routing |
| `Kind()` (via `ExternalStep.KindLabel`) has a dotted prefix | reserves bare names for built-ins |
| `AMR()` returns one of RFC 8176 §2 codes or `""` | foreign values are dropped with a warning audit |
| `Prompts()` lists every prompt type Begin / Continue may emit | startup validation; missing types cause runtime errors |
| Begin and Continue return a Prompt or Result; an empty Step is rejected | orchestrator state machine |
| User-existence leak defence: identical response shape and timing for known vs unknown identifiers | basic security hygiene |
| Stateless across calls | per-attempt state lives in `interaction.Prompt.StateRef`, not in your struct |

## Testing

Test your authenticator with ordinary Go tests: call `Begin`, submit `interaction.FormSubmission{Values: ...}` to `Continue`, assert the returned prompt or result, and run the same sequence concurrently. The public `op/testkit` package provides a subject-binding authenticator for HTTP-layer fixtures; it is not a production authenticator.

```go
func TestSMSAuthenticator(t *testing.T) {
    auth := &smsauth.SMSAuthenticator{Sender: sender, OTPStore: otps, UserStore: users, CodeTTL: 5 * time.Minute}
    first, err := auth.Begin(context.Background(), op.BeginInput{})
    if err != nil || first.Prompt == nil { t.Fatal(err) }
    next, err := auth.Continue(context.Background(), op.ContinueInput{
        AuthTime: time.Now(),
        Scratch: first.Scratch,
        Submission: interaction.FormSubmission{Values: map[string]string{"phone": "+1..."}},
    })
    if err != nil || next.Prompt == nil { t.Fatal(err) }
}
```

## Why this seam exists

Earlier iterations of the library exposed only `Authenticator` directly. Embedders writing step-up flows ended up reimplementing "which factor runs when" inside their authenticator's `Begin` — which violates the orchestrator's invariant that one factor = one ceremony. Splitting the surface into:

- `Step` — descriptor (what factor)
- `Rule` — when it runs
- `Decider` — short-circuit override
- `Authenticator` — the actual ceremony

…lets the orchestrator own the order and dedup, and lets your code own the factor mechanics. `ExternalStep` is the bridge for any `Authenticator` that doesn't fit the built-in `Step` types.

## See also

- **[Architecture overview § LoginFlow internals](/reference/architecture#loginflow-internals)** — what the orchestrator does with your authenticator.
- **[MFA / step-up](/use-cases/mfa-step-up)** — composing built-in Steps via `Rule`.
- **[Audit event catalog § Login / MFA / step-up](/reference/audit-events#login-mfa-step-up)** — what your authenticator emits when it succeeds or fails.
