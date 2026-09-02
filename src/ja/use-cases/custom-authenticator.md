---
title: カスタム認証器
description: 公開されている op.Authenticator と op.ExternalStep を使って、ハードウェアトークン、SMS、magic link などの認証要素を追加する。
pageClass: pg-use-cases-custom-authenticator
---

# カスタム認証器

ライブラリは、パスワード、パスキー、TOTP、メール OTP、captcha、recovery code の組み込み `Step` を同梱しています。それ以外（ハードウェアトークン、SMS、magic link、独自のデバイス信頼など）を追加するには、`op.Authenticator` インターフェースを実装し、`op.ExternalStep` で差し込みます。

このページでは、契約、実装例、よくある落とし穴を扱います。

## このページが必要なケース

| やりたいこと | このページ? |
|---|---|
| TOTP を追加 | 不要 — `op.StepTOTP` で足ります（[MFA / ステップアップ](/ja/use-cases/mfa-step-up)） |
| パスキーを追加 | 不要 — `op.PrimaryPasskey` で足ります |
| SMS OTP を追加 | 必要 |
| ハードウェアトークン（YubiKey OTP、HOTP など）を追加 | 必要 |
| magic link ログインを追加 | 必要 |
| 独自のリスク判定を追加 | 不要 — `op.RuleRisk` + 自前の `RiskAssessor` で対応 |
| 資格情報以外の追加画面（T&C、KYC など）を追加 | 不要 — `op.Interaction` で対応 |

差し込み口の違いは明確です。**資格情報を集めて subject を確定するもの**は `Authenticator`。**subject が確定したあとに追加画面を出すもの**は `Interaction` です。

## interface

```go
package op

type Authenticator interface {
    // この authenticator が実装する FactorType を返す。
    // 同一フロー内で 2 つの authenticator が同じ Type を持つことは禁止。
    Type() FactorType

    // Continue が成功したときに、セッションを引き上げる保証レベル。
    // オーケストレータは完了済み認証要素を跨いで最大値を取り、
    // セッションの AAL を導出する。
    AAL() AAL

    // amr claim に寄与する RFC 8176 §2 の登録値、
    // または "" で寄与を抑制。
    AMR() string

    // この authenticator が emit し得るすべての interaction.Prompt.Type
    // を返す。オーケストレータは起動時にルーティングテーブルを
    // 検証する。
    Prompts() []string

    // フローを開始する。複数ステップなら Prompt、すぐに完了する
    // 認証要素なら Result を載せる。
    Begin(ctx context.Context, in BeginInput) (interaction.Step, error)

    // SPA からの送信でフローを進める。
    Continue(ctx context.Context, in ContinueInput) (interaction.Step, error)
}
```

実装は並行安全でなければなりません。オーケストレータは複数の goroutine から呼び出します。`BeginInput` には、確定済みなら subject、client ID、基準時刻 `AuthTime`、要求された scope、読み取り専用の client view が入ります。`ContinueInput` には、`interaction.FormSubmission`、同じ `AuthTime`、確定済みの subject、直前の Step が返した不透明な `Scratch` が入ります。

オーケストレータは `Begin` または `Continue` の戻り値に対して `Prompt.StateRef` を設定します。認証器が state reference を生成したり保存したりしてはいけません。試行ごとの状態は `interaction.Step.Scratch` に入れてください。この値はサーバ側に保持され、次の `ContinueInput.Scratch` に渡されます。

## 状態遷移の全体像

`Authenticator` は、毎回「次に表示する Prompt」または「認証完了を表す Result」のどちらかを返します。SMS OTP のような 2 段階の認証要素では、`Begin` が最初の Prompt を返し、SPA からの送信ごとに `Continue` が次の Prompt か Result を返します。

<svg class="auth-flow" role="img" aria-labelledby="authenticator-flow-title" viewBox="0 0 760 352" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="authenticator-flow-title">カスタム Authenticator の状態遷移。LoginFlow が Begin を呼び、電話番号入力 Prompt、コード入力 Prompt、Result の順に進み、Result が返ると subject と factor がセッションに反映される。</title>
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
  <text class="t sub" x="640" y="77" text-anchor="middle">画面を描画</text>

  <path d="M200 63 H296" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub" x="248" y="52" text-anchor="middle">Begin</text>
  <path d="M480 63 H556" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub" x="518" y="52" text-anchor="middle">Prompt</text>

  <rect class="soft" x="88" y="142" width="584" height="56" rx="8"/>
  <text class="h" x="380" y="166" text-anchor="middle">1. myorg.sms.collect_phone</text>
  <text class="t sub" x="380" y="185" text-anchor="middle">電話番号を受け取り、OTP を生成して送信する</text>
  <path d="M640 92 C640 122 530 132 438 142" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub halo" x="576" y="126" text-anchor="middle">POST phone</text>
  <path d="M322 198 C245 214 245 244 322 260" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub" x="246" y="234" text-anchor="middle">Continue</text>

  <rect class="soft" x="88" y="260" width="584" height="56" rx="8"/>
  <text class="h" x="380" y="284" text-anchor="middle">2. myorg.sms.collect_code</text>
  <text class="t sub" x="380" y="303" text-anchor="middle">入力コードを検証し、成功なら Result{Subject: ...} を返す</text>

  <path d="M380 316 V340 H56 V96" marker-end="url(#auth-flow-arrow)"/>
  <text class="m sub" x="250" y="330" text-anchor="middle">returns Result</text>
</svg>

最後のステップが返す `Result` が認証要素の完了を表します。オーケストレータはこの `Result` から subject、AAL、AMR の値をセッションに書き込み、LoginFlow は次の Rule へ進みます。

## 実装例: SMS OTP

実装する認証要素: 電話番号を集め、6 桁のコードを SMS で送り、ユーザが入力したコードを検証する。

### 1. `Authenticator` を実装する

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
    Sender    SMSSender                 // SMS プロバイダのアダプタ
    OTPStore  OTPStore                  // 試行ごとの OTP レコードを保管するストア
    UserStore store.UserStore            // 「電話番号 → subject」検索
    CodeTTL   time.Duration             // 通常は 5 分
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
    // 最初の画面: 電話番号を集める。
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
        // 定数時間で照会する。登録済み番号と未登録番号で、応答の
        // 形とタイミングを一致させてください(ユーザの存在を漏らさ
        // ないため)。
        subject, _ := a.UserStore.LookupByPhone(ctx, phone)

        // subject が空でもコードは常に送信する(情報漏えい対策)。
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
        // 保存ハッシュとの定数時間比較。
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

### 2. `LoginFlow` に差し込む

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
            KindLabel: "myorg.sms_otp", // ドット形式のプリフィックスが必須
        }),
    },
}

op.New(
    /* 必須オプション */
    op.WithLoginFlow(flow),
)
```

`KindLabel` のドット形式プリフィックス（`myorg.sms_otp`）は **必須** です。LoginFlow のコンパイラは、プリフィックス無しの名前や組み込み名を構築時に拒否します。組織識別子をプリフィックスにしてください。

### 3. SPA で画面を描画する

JSON ドライバ（`op.WithInteractionDriver(interaction.JSONDriver{})`）構成下では、SPA は `/interaction/{uid}` で画面状態を JSON として受け取ります。レスポンスにはカスタムの `type`、宣言した `inputs`、不透明な `state_ref` が含まれます。SPA はこの `state_ref` を `FormSubmission.StateRef` に戻し、値を `FormSubmission.Values` に入れて送信します。

```json
{
  "prompt": {
    "type": "myorg.sms.collect_phone",
    "inputs": [{"name": "phone", "kind": 0, "required": true}],
    "state_ref": "..."
  }
}
```

電話番号入力を描画し、`values` に `{ "phone": "+1..." }` を入れた `FormSubmission` を同じエンドポイントに POST します。次のレスポンスは `myorg.sms.collect_code` の画面なので、コード入力を描画して `{ "values": { "code": "123456" } }` を POST します。3 番目のレスポンスは、subject が確定した `Result` です。

HTML ドライバ構成では、2 種類の画面を扱うカスタムテンプレートを登録してください。

## Prompt のフィールドと上限

カスタム Prompt では、送信するフィールドをすべて `Prompt.Inputs` に宣言します。`PromptData` は sealed interface なので、アプリケーションが `interaction` パッケージの外から任意の data 型を追加することはできません。カスタムのフォーム項目には `FieldSpec` を使い、secret を `Prompt.StateRef` や Driver に公開し得る `Step.Scratch` に入れないでください。

`FieldKind` は `FieldText`、`FieldPassword`、`FieldOTPCode`、`FieldEmail`、`FieldHidden` に限られます。`Required`、`MinLen`、`MaxLen`、全体一致の `Pattern` は `Continue` の前に検証されます。`MaxLen` が 0 の場合、byte 単位の上限は text が 512、password が 1024、OTP code が 32、email が 320、hidden が 16 KiB です。1 回の submission 全体にも名前と値の合計 32 KiB、宣言した項目を超える追加項目 4 個までという上限があります。Prompt の `StateRef` は 10 分で失効し、1 回しか使えません。古い、または再利用された reference は認証器が呼ばれる前に拒否されます。

組み込み MFA の Prompt も同じ契約を使います。TOTP は `AttemptsRemaining` とちょうど 6 桁の `code` を返します。メール OTP はマスク済みアドレスと `ExpiresAt` を返し、254 byte のメールアドレスと 6 桁の code を受け付け、code の既定有効期間は 5 分です。passkey は WebAuthn の challenge と allow-list を返し、assertion response は 16 KiB までです。recovery code は `AttemptsRemaining` を返し、10〜32 byte を受け付けます。TOTP と recovery の `AttemptsRemaining` は、未使用の recovery code 数ではなく、失敗した提出をあと何回許容するかを示します。これらは Prompt のメタデータと入力上限であり、要素ごとのレート制限の代わりにはなりません。

## 契約条件

オーケストレータは Provider 構築時に設定を検証し、実行時に空の Step を拒否します。次の項目が公開契約です:

| 要件 | 理由 |
|---|---|
| `Type()` がフロー内で一意 | 振り分け経路を一意にするため |
| `Kind()`（`ExternalStep.KindLabel` 経由）にドット形式プリフィックス | 組み込み用にプリフィックス無しの名前を予約しているため |
| `AMR()` は RFC 8176 §2 の値、または `""` | 範囲外の値は警告付きの監査イベントを出して除外 |
| `Prompts()` は Begin / Continue が返し得る全画面種別を列挙 | 起動時検証のため。漏れているとランタイムエラーになる |
| Begin と Continue は Prompt または Result を返す。空の Step は拒否される | オーケストレータの状態遷移の前提 |
| 既知 / 未知の識別子でレスポンス形状とタイミングを一致させる | ユーザ存在の漏えい対策の基本 |
| 呼び出しをまたいでステートレス | 試行ごとの状態は `interaction.Prompt.StateRef` に載せること。struct に持たない |

## テスト

認証器は通常の Go テストで検証します。`Begin` を呼び、`interaction.FormSubmission{Values: ...}` を `Continue` に渡し、返された Prompt または Result を確認し、同じ手順を並行実行します。公開パッケージ `op/testkit` には HTTP 層の fixture 用 subject-binding 認証器がありますが、本番用の認証器ではありません。

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

## この差し込み口が存在する理由

ライブラリの初期は `Authenticator` を直接公開していました。ステップアップフローを書く組み込み側は、認証器の `Begin` の中で「次にどの認証要素を実行するか」を毎回再実装することになり、オーケストレータの不変条件「1 認証要素 = 1 ステップ」と相性が悪い構造でした。これを次の 4 要素に分解したことで整理が付きました:

- `Step` — どの認証要素かを示す記述子
- `Rule` — どの条件下で起動するか
- `Decider` — 早期確定のための上書き判断
- `Authenticator` — 実際の認証フロー本体

オーケストレータが順序と重複排除を所有し、自前コードは認証要素の仕組みを所有できるようになりました。`ExternalStep` は、組み込み `Step` のいずれにも当てはまらない `Authenticator` を橋渡しします。

## 参考

- **[アーキテクチャ概観 § LoginFlow の内部](/ja/reference/architecture#loginflow-internals)** — オーケストレータが認証器に対して何をするか。
- **[MFA / ステップアップ](/ja/use-cases/mfa-step-up)** — 組み込みの Step を `Rule` で組み合わせるパターン。
- **[監査イベントカタログ § ログイン / MFA / ステップアップ](/ja/reference/audit-events#login-mfa-step-up)** — 認証器の成功 / 失敗で何が発火するか。
