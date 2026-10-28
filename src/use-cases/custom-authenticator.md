---
title: Custom authenticator
description: Add a hardware token, SMS, magic link, or other factor through the public op.Authenticator and op.ExternalStep seams.
pageClass: pg-use-cases-custom-authenticator
---

# Custom authenticator

The library ships built-in `Step` values for password, passkey, TOTP, email OTP, captcha, and recovery codes. For any other factor (SMS, a hardware token, a magic link, a proprietary device-trust check) you implement the `op.Authenticator` interface and plug it into a [`LoginFlow`](/use-cases/mfa-step-up) through `op.ExternalStep`.

An authenticator is a small state machine for one factor. The OP calls `Begin`, you answer with a prompt; the user submits it, the OP calls `Continue`, you answer with the next prompt or a result. You never render HTML and never touch the session.

## When you need this

| Need | Use this page? |
|---|---|
| Add a TOTP factor | No. `op.StepTOTP` covers it ([MFA / step-up](/use-cases/mfa-step-up)) |
| Add a passkey factor | No. `op.PrimaryPasskey` covers it |
| Add SMS OTP | Yes |
| Add a hardware token (YubiKey OTP, hardware HOTP) | Yes |
| Add magic-link login | Yes |
| Add a custom risk gate | No. Use `op.RuleRisk` with your own `RiskAssessor` |
| Add a non-credential prompt (terms of service, KYC) | No. Implement `op.Interaction` and register it with `op.WithInteractions` ([options reference](/reference/options)) |

The line between the two: anything that **collects credentials and binds a subject** is an `Authenticator`. Anything that **runs after the subject is bound and only shows a prompt** is an `Interaction`.

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
    // may emit.
    Prompts() []string

    // Begin starts the ceremony. The returned interaction.Step
    // carries a Prompt for a multi-step factor or a populated Result
    // for a factor that completes immediately.
    Begin(ctx context.Context, in BeginInput) (interaction.Step, error)

    // Continue advances the ceremony with the SPA's submission.
    Continue(ctx context.Context, in ContinueInput) (interaction.Step, error)
}
```

Implementations must be safe for concurrent use. `BeginInput` carries the subject bound so far (empty for the first factor), the client ID, the reference `AuthTime`, the requested scopes, and a read-only client view. `ContinueInput` carries the submitted `interaction.FormSubmission`, the same `AuthTime`, the bound subject, the opaque `Scratch` from the previous step, and the caller's `RemoteIP`. Read time from `AuthTime`, not `time.Now()`, so the chain stays consistent with the provider's clock.

The orchestrator stamps `Prompt.StateRef` after `Begin` or `Continue` returns; an authenticator must not invent or persist one. Put per-attempt state in `interaction.Step.Scratch`. The OP keeps it server-side and hands it back in `ContinueInput.Scratch`; no driver ever sends it to the browser.

## State transitions

An `Authenticator` returns either the next prompt or a result that completes the factor. For a two-step factor such as SMS OTP, `Begin` returns the first prompt and each submission makes `Continue` return the next prompt or the final result.

<figure class="fig">
  <div class="fig-head">A custom authenticator, prompt by prompt</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-customauth-title" viewBox="0 0 960 744" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-customauth-title">The login flow calls Begin and the authenticator answers with a phone-number prompt. After the user submits the number, Continue sends the SMS and answers with a code prompt. When the code matches, Continue returns a Result, which writes the subject and the factor into the session.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="720"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="720"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="720"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">LoginFlow</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">the orchestrator</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">Authenticator</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">your implementation</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">The screen</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">SPA or server-rendered</text>
    <!-- begin -->
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">Begin(ctx, input)</text>
    <!-- phone prompt -->
    <path class="fg-edge fg-edge--accent" d="M512,216 H824" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="668" y="182" text-anchor="middle">Begin returns a phone prompt</text>
    <text class="fg-mxs" x="668" y="204" text-anchor="middle">myorg.sms.collect_phone</text>
    <!-- phone submitted -->
    <path class="fg-edge" d="M824,280 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="270" text-anchor="middle">the user submits the phone number</text>
    <!-- send sms -->
    <path class="fg-edge fg-edge--accent" d="M512,320 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="326">look up the number,</text>
    <text class="fg-s" x="568" y="348">mint an OTP,</text>
    <text class="fg-s" x="568" y="370">send the SMS</text>
    <!-- code prompt -->
    <path class="fg-edge fg-edge--accent" d="M512,448 H824" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="668" y="414" text-anchor="middle">Continue returns a code prompt</text>
    <text class="fg-mxs" x="668" y="436" text-anchor="middle">myorg.sms.collect_code</text>
    <!-- code submitted -->
    <path class="fg-edge" d="M824,528 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="518" text-anchor="middle">the user submits the code</text>
    <!-- result -->
    <path class="fg-edge fg-edge--accent" d="M512,608 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="352" y="574" text-anchor="middle">Continue returns a Result</text>
    <text class="fg-mxs" x="352" y="596" text-anchor="middle">Result{ Subject: … }</text>
    <!-- session -->
    <path class="fg-edge fg-edge--accent" d="M192,656 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="248" y="662">code matched:</text>
    <text class="fg-s" x="248" y="684">subject and factor</text>
    <text class="fg-s" x="248" y="706">land in the session</text>
  </svg>
  <figcaption class="fig-note">The authenticator never renders anything and never touches the session. It answers with a prompt or a result and the orchestrator does the rest, so the same authenticator works behind an SPA and a server-rendered page alike.</figcaption>
</figure>

When `Continue` returns a `Result`, the orchestrator records the subject, the AAL, and the AMR value in the chain, and the LoginFlow moves on to the next rule.

## Worked example: SMS OTP

The factor: ask for a phone number, send a 6-digit code by SMS, verify the code. The three dependencies are interfaces you own; the library does not ship them.

### 1. Implement `Authenticator`

```go
package smsauth

import (
    "context"
    "crypto/rand"
    "encoding/binary"
    "fmt"
    "strings"
    "time"

    "github.com/libraz/go-oidc-provider/op"
    "github.com/libraz/go-oidc-provider/op/interaction"
)

// PhoneDirectory maps an enrolled phone number to a subject.
type PhoneDirectory interface {
    SubjectByPhone(ctx context.Context, phone string) (subject string, ok bool)
}

// OTPStore keeps one live code per subject (as a hash) and counts failures.
type OTPStore interface {
    Put(ctx context.Context, subject, code string, ttl time.Duration) error
    Verify(ctx context.Context, subject, code string) (ok bool, err error)
}

// SMSSender delivers the code through your SMS provider.
type SMSSender interface {
    Send(ctx context.Context, phone, code string) error
}

type SMSAuthenticator struct {
    Phones  PhoneDirectory
    OTPs    OTPStore
    Sender  SMSSender
    CodeTTL time.Duration // typically 5 minutes
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
    return interaction.Step{
        Prompt: &interaction.Prompt{
            Type: phonePrompt,
            Inputs: []interaction.FieldSpec{{
                Name:     "phone",
                Kind:     interaction.FieldText,
                Label:    "myorg.sms.phone", // i18n key; echoed verbatim when no bundle has it
                Required: true,
                MaxLen:   32,
            }},
        },
        Scratch: []byte(phonePrompt),
    }, nil
}

func (a *SMSAuthenticator) Continue(ctx context.Context, in op.ContinueInput) (interaction.Step, error) {
    // Scratch carries "<stage>\n<subject>"; the subject is empty for an unknown number.
    stage, subject, _ := strings.Cut(string(in.Scratch), "\n")
    switch stage {
    case phonePrompt:
        phone := in.Submission.Values["phone"]
        subject, ok := a.Phones.SubjectByPhone(ctx, phone)
        if ok {
            code, err := generate6DigitCode()
            if err != nil {
                return interaction.Step{}, err
            }
            if err := a.OTPs.Put(ctx, subject, code, a.CodeTTL); err != nil {
                return interaction.Step{}, err
            }
            if err := a.Sender.Send(ctx, phone, code); err != nil {
                return interaction.Step{}, err
            }
        }
        // Known and unknown numbers get the same prompt, so the response
        // does not reveal which numbers are enrolled.
        return codeStep(subject), nil

    case codePrompt:
        ok, err := a.OTPs.Verify(ctx, subject, in.Submission.Values["code"])
        if err != nil {
            return interaction.Step{}, err
        }
        if !ok || subject == "" {
            return codeStep(subject), nil // ask again; Verify enforces the attempt limit
        }
        return interaction.Step{
            Result: &interaction.Result{Subject: subject, AuthTime: in.AuthTime},
        }, nil
    }
    return interaction.Step{}, fmt.Errorf("unexpected authenticator state %q", stage)
}

func codeStep(subject string) interaction.Step {
    return interaction.Step{
        Prompt: &interaction.Prompt{
            Type: codePrompt,
            Inputs: []interaction.FieldSpec{{
                Name:     "code",
                Kind:     interaction.FieldOTPCode,
                Label:    "myorg.sms.code",
                Required: true,
                MinLen:   6,
                MaxLen:   6,
                Pattern:  "[0-9]{6}",
            }},
        },
        Scratch: []byte(codePrompt + "\n" + subject),
    }
}

func generate6DigitCode() (string, error) {
    b := make([]byte, 4)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return fmt.Sprintf("%06d", binary.BigEndian.Uint32(b)%1_000_000), nil
}
```

Three things in this code carry the security of the factor:

- **The subject travels in `Scratch`, not in the form.** The user types only the code, and `Verify` checks it against the code issued to that subject. Looking a code up without a subject would let one user's code match another's.
- **Known and unknown numbers look the same.** Real deployments also match the timing, for example by handing the SMS to a queue so the unknown branch does the same work.
- **A wrong code is a new prompt, not an error.** A non-nil `error` from `Begin` or `Continue` is a server fault and ends the request with HTTP 500. To reject a guess, return the prompt again and count the failure in `OTPs.Verify`.

### 2. Plug it into a `LoginFlow`

```go
flow := op.LoginFlow{
    Primary: op.PrimaryPassword{Store: myStore.UserPasswords()},
    Rules: []op.Rule{
        op.RuleAlways(op.ExternalStep{
            Authenticator: &smsauth.SMSAuthenticator{
                Phones:  directory,
                OTPs:    redisOTPs,
                Sender:  twilioSender,
                CodeTTL: 5 * time.Minute,
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

The dotted prefix on `KindLabel` (`myorg.sms_otp`) is **required**: `op.New` rejects bare or built-in labels. Use your organisation identifier as the prefix. Each `Kind` may appear in only one rule, so a flow cannot list the same `ExternalStep` kind twice.

When the factor runs after another one, as here, the `Subject` in your `Result` must be the subject already bound (or empty). A different subject ends the attempt with HTTP 400, because the session would otherwise carry the first factor's assurance under another user's identity.

`ExternalStep` factors do not receive the cross-factor lockout counter that `op.WithAuthnLockoutStore` attaches to the built-in second factors. Rate limiting and lockout for an SMS code belong in your `OTPStore`.

### 3. Render the prompts in your UI

With the default HTML driver nothing more is needed. It renders an unknown prompt type as a generic form built from `Inputs`: the page title is the message-bundle entry named after `Prompt.Type`, and each field label is the entry named by `FieldSpec.Label` (the key itself when no bundle defines it). Register the strings with `op.WithLocale` ([i18n](/use-cases/i18n)).

With the JSON driver, the SPA reads the prompt at `/interaction/{uid}` (or `LoginMount/state/{uid}` under `op.WithSPAUI`). The envelope is the `Prompt` itself; the SPA must echo `state_ref` in its submission and send field values under `values`. `FieldSpec` has no JSON tags, so its members are capitalised:

```json
{
  "type": "myorg.sms.collect_phone",
  "inputs": [{"Name": "phone", "Kind": 0, "Label": "myorg.sms.phone", "MaxLen": 32, "MinLen": 0, "Required": true, "Pattern": ""}],
  "state_ref": "...",
  "csrf_token": "...",
  "locale": "en"
}
```

The SPA renders a phone input and POSTs `{ "state_ref": "...", "values": { "phone": "+1..." } }` back to the same URL with the `X-CSRF-Token` header. The next response is the `myorg.sms.collect_code` prompt; the SPA posts `{ "state_ref": "...", "values": { "code": "123456" } }`. Once the code matches, the OP continues with the next rule or consent and finally returns the terminal response; [SPA / custom interaction](/use-cases/spa-custom-interaction) walks through that envelope.

## Prompt fields and limits

Declare every submitted field in `Prompt.Inputs`. `PromptData` is a sealed interface, so an application cannot add its own data type from outside the `interaction` package; use `FieldSpec` for custom form fields. Keep secrets out of `Prompt.StateRef` and out of any `Scratch` value a driver could expose. Custom prompt types need an organisation prefix (`myorg.…`), which keeps them apart from the library's `auth.*`, `consent.*`, `captcha`, and `interaction.*` names.

`FieldKind` is one of `FieldText`, `FieldPassword`, `FieldOTPCode`, `FieldEmail`, or `FieldHidden`. `Required`, `MinLen`, `MaxLen`, and `Pattern` are enforced before `Continue` runs; the pattern must match the whole value. A field with `MaxLen` zero gets the per-kind byte limit:

| Kind | Default `MaxLen` (bytes) |
|---|---|
| `FieldText` | 512 |
| `FieldPassword` | 1024 |
| `FieldOTPCode` | 32 |
| `FieldEmail` | 320 |
| `FieldHidden` | 16 KiB |

A submission is also capped at 32 KiB across names and values, and may contain at most four entries beyond the declared fields. A prompt's `StateRef` expires after 10 minutes and works once; a stale or replayed reference is rejected before the authenticator runs.

The built-in MFA prompts use the same contract. TOTP exposes `AttemptsRemaining` and a six-digit `code`. Email OTP exposes a masked address and `ExpiresAt`, accepts a 254-byte email and a six-digit code, and defaults the code lifetime to five minutes. Passkey exposes the WebAuthn challenge and allow-list and caps the assertion response at 16 KiB. Recovery codes expose `AttemptsRemaining` and accept 10 to 32 bytes. For TOTP and recovery prompts, `AttemptsRemaining` is the remaining failed-submission budget, not the number of unused recovery codes. These values are prompt metadata and validation bounds, not a substitute for factor-specific rate limiting.

## Contract requirements

The orchestrator validates configuration at provider construction and rejects an empty step when it runs. The public contract is:

| Requirement | Why |
|---|---|
| `Type()` is unique within a flow | dispatch routing |
| `ExternalStep.KindLabel` has a dotted prefix and appears in one rule only | reserves bare names for built-ins; one discriminator per rule |
| `AMR()` returns an RFC 8176 §2 value or `""` | foreign values are dropped with a warning audit |
| `Prompts()` lists every prompt type `Begin` and `Continue` may emit | startup validation; a missing type causes runtime errors |
| `Begin` and `Continue` return a `Prompt` or a `Result`; an empty `Step` is rejected | orchestrator state machine |
| A returned `Result.Subject` is empty or equals the bound subject | a different subject ends the attempt |
| Identical response shape and timing for known and unknown identifiers | user-enumeration defence |
| Stateless across calls | per-attempt state lives in `Scratch`, not in your struct |

## Testing

Test the authenticator with ordinary Go tests: call `Begin`, submit `interaction.FormSubmission{Values: ...}` to `Continue`, assert the returned prompt or result, and run the same sequence concurrently. The public `op/testkit` package provides a subject-binding authenticator for HTTP-layer fixtures; it is not a production authenticator.

```go
func TestSMSAuthenticator(t *testing.T) {
    auth := &smsauth.SMSAuthenticator{Phones: dir, OTPs: otps, Sender: sender, CodeTTL: 5 * time.Minute}
    first, err := auth.Begin(context.Background(), op.BeginInput{})
    if err != nil || first.Prompt == nil {
        t.Fatal(err)
    }
    next, err := auth.Continue(context.Background(), op.ContinueInput{
        AuthTime:   time.Now(),
        Scratch:    first.Scratch,
        Submission: interaction.FormSubmission{Values: map[string]string{"phone": "+1..."}},
    })
    if err != nil || next.Prompt == nil {
        t.Fatal(err)
    }
}
```

## How the pieces divide the work

A login decision has four parts, and each belongs to a different type:

| Type | Decides |
|---|---|
| `Step` | which factor (a descriptor such as `op.StepTOTP` or `op.ExternalStep`) |
| `Rule` | when that factor runs |
| `Decider` | a policy override that can allow, deny, or require a step before the rules run |
| `Authenticator` | how the factor's ceremony works |

The orchestrator owns order and de-duplication; your code owns the factor mechanics. `ExternalStep` is the bridge for any `Authenticator` that has no built-in `Step`.

## See also

- **[Architecture overview § LoginFlow internals](/reference/architecture#loginflow-internals)**: what the orchestrator does with your authenticator.
- **[MFA / step-up](/use-cases/mfa-step-up)**: composing built-in Steps with `Rule`.
- **[Audit event catalog § Login / MFA / step-up](/reference/audit-events#login-mfa-step-up)**: what your authenticator emits when it succeeds or fails.
