---
title: カスタム authenticator
description: 自前の factor（ハードウェアトークン、SMS、magic link など）を、ライブラリを fork せずに LoginFlow へ差し込む。
---

# カスタム authenticator

ライブラリは、password、passkey、TOTP、email OTP、captcha、recovery code の組み込み `Step` を同梱しています。それ以外（ハードウェアトークン、SMS、magic link、独自のデバイス信頼 factor など）を追加するには、`op.Authenticator` interface を実装し、`op.ExternalStep` で差し込みます。

このページでは、契約、実装例、よくある落とし穴を扱います。

## このページが必要なケース

| やりたいこと | このページ? |
|---|---|
| TOTP factor を追加 | 不要 — `op.StepTOTP` で足ります（[MFA / ステップアップ](/ja/use-cases/mfa-step-up)） |
| passkey factor を追加 | 不要 — `op.PrimaryPasskey` で足ります |
| SMS OTP を追加 | 必要 |
| ハードウェアトークン（YubiKey OTP、HOTP など）を追加 | 必要 |
| magic link ログインを追加 | 必要 |
| カスタムなリスクゲートを追加 | 不要 — `op.RuleRisk` + 自前の `RiskAssessor` で対応 |
| 非クレデンシャルのプロンプト（T&C、KYC など）を追加 | 不要 — `op.Interaction` で対応 |

切り分けの差し込み口の意味: **クレデンシャルを集めて subject をバインドするもの**は `Authenticator`。**subject がバインドされたあとに走ってプロンプトを出すもの**は `Interaction`。

## interface

```go
package op

type Authenticator interface {
    // この authenticator が実装する FactorType を返す。
    // 同一フロー内で 2 つの authenticator が同じ Type を持つことは禁止。
    Type() FactorType

    // Continue が成功したときに、セッションを引き上げる assurance level。
    // オーケストレータは完了済み factor を跨いで maximum を取り、
    // セッションの AAL を導出する。
    AAL() AAL

    // amr claim に寄与する RFC 8176 §2 の登録値、
    // または "" で寄与を抑制。
    AMR() string

    // この authenticator が emit し得るすべての interaction.Prompt.Type
    // を返す。オーケストレータは起動時にルーティングテーブルを
    // 検証する。
    Prompts() []string

    // フローを開始する。返した interaction.Step は、Prompt（複数ステップ
    // の factor）か Result（即完結する 1 ステップの factor。稀）の
    // いずれかを載せる。
    Begin(ctx context.Context, in BeginInput) (interaction.Step, error)

    // SPA からの送信でフローを進める。
    Continue(ctx context.Context, in ContinueInput) (interaction.Step, error)
}
```

実装は並行安全であってください。オーケストレータは複数の goroutine の間で dispatch します。

## 実装例: SMS OTP

実装する factor: 電話番号を集め、6 桁のコードを SMS で送り、ユーザが入力したコードを検証する。

### 1. `Authenticator` を実装する

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
    Sender    SMSSender                 // SMS プロバイダのアダプタ
    OTPStore  OTPStore                  // 試行ごとの OTP レコードを保管するストア
    UserStore op.Store                  // 「電話番号 → subject」検索
    CodeTTL   time.Duration             // 通常は 5 分
}

func (a *SMSAuthenticator) Type() FactorType { return "myorg.sms_otp" }
func (a *SMSAuthenticator) AAL() op.AAL      { return op.AALMedium }
func (a *SMSAuthenticator) AMR() string      { return "sms" } // RFC 8176 §2

func (a *SMSAuthenticator) Prompts() []string {
    return []string{"myorg.sms.collect_phone", "myorg.sms.collect_code"}
}

func (a *SMSAuthenticator) Begin(ctx context.Context, in op.BeginInput) (interaction.Step, error) {
    // 最初のプロンプト: 電話番号を集める。
    return interaction.Step{
        Prompt: &interaction.Prompt{
            Type:     "myorg.sms.collect_phone",
            StateRef: in.StateRef, // 試行ごとの state を引き継ぐ
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
                Type:     "myorg.sms.collect_code",
                StateRef: in.StateRef,
            },
        }, nil

    case "myorg.sms.collect_code":
        submitted := in.Submission["code"]
        // 保存ハッシュとの定数時間比較。
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

### 3. SPA でプロンプトを描画する

JSON ドライバ(`op.WithInteractionDriver(interaction.JSONDriver{})`)構成下では、SPA は `/interaction/{uid}` でプロンプトを JSON として受け取ります:

```json
{
  "prompt": {
    "type": "myorg.sms.collect_phone",
    "state_ref": "..."
  }
}
```

電話番号入力を描画し、`{ "phone": "+1..." }` を同じエンドポイントに POST します。次のレスポンスは `myorg.sms.collect_code` のプロンプトなので、コード入力を描画して `{ "code": "123456" }` を POST します。3 番目のレスポンスは、subject がバインド済みの `Result` です。

HTML ドライバ構成では、2 種類のプロンプトを扱うカスタムテンプレートを登録してください。

## 契約条件

オーケストレータが強制する項目です。違反すると LoginFlow のコンパイル時、または最初のリクエストでエラーになります:

| 要件 | 理由 |
|---|---|
| `Type()` がフロー内で一意 | dispatch 経路を一意にするため |
| `Kind()`（`ExternalStep.KindLabel` 経由）にドット形式プリフィックス | 組み込み用にプリフィックス無しの名前を予約しているため |
| `AMR()` は RFC 8176 §2 の値、または `""` | 範囲外の値は警告 audit 付きで除外 |
| `Prompts()` は Begin / Continue が emit する全プロンプト型を列挙 | 起動時検証のため。漏れているとランタイムエラーになる |
| Begin は **Prompt または Result のいずれか** を載せて返す（両方や両方無しは不可） | オーケストレータの状態機械の前提 |
| 既知 / 未知の識別子でレスポンス形状とタイミングを一致させる | ユーザ存在の漏えい対策の基本 |
| 呼び出しをまたいでステートレス | 試行ごとの state は `interaction.Prompt.StateRef` に載せること。struct に持たない |

## テスト

ストア実装には `op/store/contract` の contract suite、authenticator にはオーケストレータ側の harness を使います:

```go
// 擬似コード — 実パスはソースリポジトリの harness を参照。
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

## この差し込み口が存在する理由

ライブラリの初期は `Authenticator` を直接公開していました。step-up フローを書く組み込み側は、authenticator の `Begin` の中で「次にどの factor を実行するか」を毎回再実装することになり、オーケストレータの不変条件「1 factor = 1 ステップ」と相性が悪い構造でした。これを次の 4 要素に分解したことで整理が付きました:

- `Step` — どの factor かを示すディスクリプタ
- `Rule` — どの条件下で起動するか
- `Decider` — 早期確定のための上書き判断
- `Authenticator` — 実際の認証フロー本体

オーケストレータが順序と重複排除を所有し、自前コードは factor の仕組みを所有できるようになりました。`ExternalStep` は、組み込み `Step` のいずれにも嵌らない `Authenticator` を橋渡しします。

## 参考

- **[アーキテクチャ概観 § LoginFlow の内部](/ja/reference/architecture#loginflow-の内部)** — オーケストレータが authenticator に対して何をするか。
- **[MFA / ステップアップ](/ja/use-cases/mfa-step-up)** — 組み込みの Step を `Rule` で組み合わせるパターン。
- **[Audit イベントカタログ § ログイン / MFA / ステップアップ](/ja/reference/audit-events#ログイン-mfa-ステップアップ)** — authenticator の成功 / 失敗で何が発火するか。
