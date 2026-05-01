---
title: Custom authenticator
description: Plugging your own factor (hardware token, SMS, magic link, …) into LoginFlow without forking the library.
---

# Custom authenticator

The library ships built-in `Step` values for password, passkey, TOTP,
email OTP, captcha, and recovery codes. For anything else — hardware
tokens, SMS, magic links, proprietary device-trust factors — you
implement the `op.Authenticator` interface and adapt it through
`op.ExternalStep`.

This page walks through the contract, a worked example, and the
common pitfalls.

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

The seam: anything that **collects credentials and binds a subject**
is an `Authenticator`. Anything that **runs after the subject is
bound and emits prompts** is an `Interaction`.

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
    // either carries a Prompt (multi-step factor) or a populated
    // Result (single-step factor that completes immediately, rare).
    Begin(ctx context.Context, in BeginInput) (interaction.Step, error)

    // Continue advances the ceremony with the SPA's submission.
    Continue(ctx context.Context, in ContinueInput) (interaction.Step, error)
}
```

Implementations MUST be safe for concurrent use; the orchestrator
dispatches across goroutines.

## Worked example: SMS OTP

The factor: collect a phone number, send a 6-digit code via SMS,
verify the user's submitted code.

### 1. Implement `Authenticator`

```go
package smsauth

import (
    "context"
    "crypto/rand"
    "fmt"

    "github.com/libraz/go-oidc-provider/op"
    "github.com/libraz/go-oidc-provider/op/interaction"
)

type SMSAuthenticator struct {
    Sender    SMSSender                 // your SMS provider adapter
    OTPStore  OTPStore                  // your per-attempt OTP record store
    UserStore op.Store                  // for "phone -> subject" lookup
    CodeTTL   time.Duration             // typically 5 minutes
}

func (a *SMSAuthenticator) Type() FactorType { return "myorg.sms_otp" }
func (a *SMSAuthenticator) AAL() op.AAL      { return op.AALMedium }
func (a *SMSAuthenticator) AMR() string      { return "sms" } // RFC 8176 §2

func (a *SMSAuthenticator) Prompts() []string {
    return []string{"myorg.sms.collect_phone", "myorg.sms.collect_code"}
}

func (a *SMSAuthenticator) Begin(ctx context.Context, in op.BeginInput) (interaction.Step, error) {
    // First prompt: collect phone number.
    return interaction.Step{
        Prompt: &interaction.Prompt{
            Type:     "myorg.sms.collect_phone",
            StateRef: in.StateRef, // carry per-attempt state
        },
    }, nil
}

func (a *SMSAuthenticator) Continue(ctx context.Context, in op.ContinueInput) (interaction.Step, error) {
    switch in.Prompt.Type {
    case "myorg.sms.collect_phone":
        phone := in.Submission["phone"]
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
                Type:     "myorg.sms.collect_code",
                StateRef: in.StateRef,
            },
        }, nil

    case "myorg.sms.collect_code":
        submitted := in.Submission["code"]
        // Constant-time compare against stored hash.
        subject, ok := a.OTPStore.Verify(ctx, submitted)
        if !ok {
            return interaction.Step{}, fmt.Errorf("code rejected")
        }
        return interaction.Step{
            Result: &interaction.Result{
                Subject: subject,
            },
        }, nil
    }
    return interaction.Step{}, fmt.Errorf("unexpected prompt: %q", in.Prompt.Type)
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

The dotted prefix on `KindLabel` (`myorg.sms_otp`) is **required** —
the LoginFlow compiler rejects bare or built-in labels at construction
time. Use your organisation identifier as the prefix.

### 3. Render the prompts in your UI

The SPA receives the prompt at `/interaction/{uid}` as JSON when
`WithSPAUI` is configured:

```json
{
  "prompt": {
    "type": "myorg.sms.collect_phone",
    "state_ref": "..."
  }
}
```

Render a phone input, POST `{ "phone": "+1..." }` back to the same
endpoint. The next response carries the `myorg.sms.collect_code`
prompt; render a code input, POST `{ "code": "123456" }`. The third
response is a `Result` with the bound subject.

For HTML-driver setups, register a custom template that handles the
two prompt types.

## Contract requirements

The orchestrator enforces these — getting them wrong is a programming
error caught at compile-time of the LoginFlow or at first request:

| Requirement | Why |
|---|---|
| `Type()` is unique within a flow | dispatch routing |
| `Kind()` (via `ExternalStep.KindLabel`) has a dotted prefix | reserves bare names for built-ins |
| `AMR()` returns one of RFC 8176 §2 codes or `""` | foreign values are dropped with a warning audit |
| `Prompts()` lists every prompt type Begin / Continue may emit | startup validation; missing types cause runtime errors |
| Begin returns a Step with **either** Prompt or Result (not both, not neither) | orchestrator state machine |
| User-existence leak defence: identical response shape and timing for known vs unknown identifiers | basic security hygiene |
| Stateless across calls | per-attempt state lives in `interaction.Prompt.StateRef`, not in your struct |

## Testing

Use the contract suite in `op/store/contract` for store
implementations, and the orchestrator harness for authenticators:

```go
// Pseudocode — use the actual harness path from the source repo.
import "github.com/libraz/go-oidc-provider/internal/authn/test"

func TestSMSAuthenticator(t *testing.T) {
    auth := &smsauth.SMSAuthenticator{
        Sender:    fakeSender{},
        OTPStore:  inmemOTPs(),
        UserStore: testStore,
        CodeTTL:   5 * time.Minute,
    }
    test.AuthenticatorContract(t, auth)
}
```

## Why this seam exists

Earlier iterations of the library exposed only `Authenticator`
directly. Embedders writing step-up flows ended up reimplementing
"which factor runs when" inside their authenticator's `Begin` — which
violates the orchestrator's invariant that one factor = one
ceremony. Splitting the surface into:

- `Step` — descriptor (what factor)
- `Rule` — when it runs
- `Decider` — short-circuit override
- `Authenticator` — the actual ceremony

…lets the orchestrator own the order and dedup, and lets your code
own the factor mechanics. `ExternalStep` is the bridge for any
`Authenticator` that doesn't fit the built-in `Step` types.

## See also

- **[Architecture overview § LoginFlow internals](/reference/architecture#loginflow-internals)** —
  what the orchestrator does with your authenticator.
- **[MFA / step-up](/use-cases/mfa-step-up)** — composing built-in
  Steps via `Rule`.
- **[Audit event catalog § Login / MFA / step-up](/reference/audit-events#login-mfa-step-up)** —
  what your authenticator emits when it succeeds or fails.
