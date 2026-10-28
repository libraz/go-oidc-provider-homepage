---
title: カスタム認証器
description: 公開されている op.Authenticator と op.ExternalStep を使って、ハードウェアトークン、SMS、magic link などの認証要素を追加する。
pageClass: pg-use-cases-custom-authenticator
---

# カスタム認証器

ライブラリは、パスワード、パスキー、TOTP、メール OTP、captcha、recovery code の組み込み `Step` を同梱しています。それ以外の認証要素（SMS、ハードウェアトークン、magic link、独自のデバイス信頼など）を追加するには、`op.Authenticator` インターフェースを実装し、`op.ExternalStep` で [`LoginFlow`](/ja/use-cases/mfa-step-up) に差し込みます。

認証器は、1 つの認証要素を担当する小さなステートマシンです。OP が `Begin` を呼ぶと、認証器は prompt を返します。ユーザが送信すると OP が `Continue` を呼び、認証器は次の prompt か結果を返します。認証器が HTML を描画することも、セッションに触れることもありません。

## このページが必要なケース

| やりたいこと | このページ? |
|---|---|
| TOTP を追加 | 不要。`op.StepTOTP` で足ります（[MFA / ステップアップ](/ja/use-cases/mfa-step-up)） |
| パスキーを追加 | 不要。`op.PrimaryPasskey` で足ります |
| SMS OTP を追加 | 必要 |
| ハードウェアトークン（YubiKey OTP、HOTP など）を追加 | 必要 |
| magic link ログインを追加 | 必要 |
| 独自のリスク判定を追加 | 不要。`op.RuleRisk` と自前の `RiskAssessor` で対応します |
| 資格情報以外の追加画面（利用規約、KYC など）を追加 | 不要。`op.Interaction` を実装し `op.WithInteractions` で登録します（[オプション一覧](/ja/reference/options)） |

2 つの境界は次のとおりです。**資格情報を集めて subject を確定するもの**は `Authenticator`、**subject の確定後に画面を出すだけのもの**は `Interaction` です。

## interface

```go
package op

type Authenticator interface {
    // この authenticator が実装する FactorType を返す。
    // 同一フロー内で 2 つの authenticator が同じ Type を持つことは禁止。
    Type() FactorType

    // Continue が成功したときに、セッションを引き上げる保証レベル。
    // オーケストレータは完了済みの認証要素の最大値を取る。
    AAL() AAL

    // amr claim に寄与する RFC 8176 §2 の登録値。
    // "" なら、この認証要素は amr に寄与しない。
    AMR() string

    // この authenticator が返し得るすべての interaction.Prompt.Type。
    Prompts() []string

    // フローを開始する。複数ステップなら Prompt、すぐに完了する
    // 認証要素なら Result を載せる。
    Begin(ctx context.Context, in BeginInput) (interaction.Step, error)

    // SPA からの送信でフローを進める。
    Continue(ctx context.Context, in ContinueInput) (interaction.Step, error)
}
```

実装は並行安全でなければなりません。`BeginInput` には、確定済みの subject（最初の認証要素では空）、client ID、基準時刻 `AuthTime`、要求された scope、読み取り専用の client view が入ります。`ContinueInput` には、`interaction.FormSubmission`、同じ `AuthTime`、確定済みの subject、直前のステップが返した不透明な `Scratch`、リクエスト元の `RemoteIP` が入ります。時刻は `time.Now()` ではなく `AuthTime` から読んでください。そうすれば、チェーン全体が Provider の clock と食い違いません。

`Prompt.StateRef` は、`Begin` または `Continue` の戻り値に対してオーケストレータが設定します。認証器が state reference を生成したり保存したりしてはいけません。試行ごとの状態は `interaction.Step.Scratch` に入れてください。OP がサーバ側に保持し、次の `ContinueInput.Scratch` で返します。どのドライバも、Scratch をブラウザに送りません。

## 状態遷移の全体像

`Authenticator` は、次の prompt か、認証要素の完了を表す結果のどちらかを返します。SMS OTP のような 2 段階の認証要素では、`Begin` が最初の prompt を返し、送信のたびに `Continue` が次の prompt か最終結果を返します。

<figure class="fig">
  <div class="fig-head">カスタム Authenticator を prompt 単位で追う</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-customauth-title" viewBox="0 0 960 744" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-customauth-title">LoginFlow が Begin を呼ぶと、Authenticator は電話番号の prompt を返します。ユーザが番号を送信すると、Continue が SMS を送って、コード入力の prompt を返します。コードが一致すると Continue が Result を返し、subject と認証要素がセッションに書き込まれます。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="720"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="720"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="720"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">LoginFlow</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">オーケストレータ</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">Authenticator</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">自前の実装</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">画面</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">SPA / サーバ描画</text>
    <!-- begin -->
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">Begin(ctx, input)</text>
    <!-- phone prompt -->
    <path class="fg-edge fg-edge--accent" d="M512,216 H824" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="668" y="182" text-anchor="middle">Begin が電話番号の prompt を返す</text>
    <text class="fg-mxs" x="668" y="204" text-anchor="middle">myorg.sms.collect_phone</text>
    <!-- phone submitted -->
    <path class="fg-edge" d="M824,280 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="270" text-anchor="middle">ユーザが電話番号を送信する</text>
    <!-- send sms -->
    <path class="fg-edge fg-edge--accent" d="M512,320 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="326">番号を引き、</text>
    <text class="fg-s" x="568" y="348">OTP を生成し、</text>
    <text class="fg-s" x="568" y="370">SMS を送る</text>
    <!-- code prompt -->
    <path class="fg-edge fg-edge--accent" d="M512,448 H824" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="668" y="414" text-anchor="middle">Continue がコードの prompt を返す</text>
    <text class="fg-mxs" x="668" y="436" text-anchor="middle">myorg.sms.collect_code</text>
    <!-- code submitted -->
    <path class="fg-edge" d="M824,528 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="518" text-anchor="middle">ユーザがコードを送信する</text>
    <!-- result -->
    <path class="fg-edge fg-edge--accent" d="M512,608 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="352" y="574" text-anchor="middle">Continue が Result を返す</text>
    <text class="fg-mxs" x="352" y="596" text-anchor="middle">Result{ Subject: … }</text>
    <!-- session -->
    <path class="fg-edge fg-edge--accent" d="M192,656 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="248" y="662">コード一致:</text>
    <text class="fg-s" x="248" y="684">subject と認証要素が</text>
    <text class="fg-s" x="248" y="706">セッションに入る</text>
  </svg>
  <figcaption class="fig-note">Authenticator は画面を描画せず、セッションにも触れません。返すのは prompt か result のどちらかで、残りはオーケストレータが担います。そのため同じ Authenticator が、SPA の裏でもサーバ描画の裏でも動きます。</figcaption>
</figure>

`Continue` が `Result` を返すと、オーケストレータは subject、AAL、AMR の値をチェーンに記録し、LoginFlow は次の Rule へ進みます。

## 実装例: SMS OTP

実装する認証要素は、電話番号を尋ね、6 桁のコードを SMS で送り、ユーザが入力したコードを検証するものです。依存する 3 つは自前で用意する interface で、ライブラリは同梱していません。

### 1. `Authenticator` を実装する

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

// PhoneDirectory は登録済みの電話番号を subject に対応付ける。
type PhoneDirectory interface {
    SubjectByPhone(ctx context.Context, phone string) (subject string, ok bool)
}

// OTPStore は subject ごとに有効なコードを 1 つ（ハッシュで）保持し、失敗を数える。
type OTPStore interface {
    Put(ctx context.Context, subject, code string, ttl time.Duration) error
    Verify(ctx context.Context, subject, code string) (ok bool, err error)
}

// SMSSender は SMS プロバイダ経由でコードを届ける。
type SMSSender interface {
    Send(ctx context.Context, phone, code string) error
}

type SMSAuthenticator struct {
    Phones  PhoneDirectory
    OTPs    OTPStore
    Sender  SMSSender
    CodeTTL time.Duration // 通常は 5 分
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
                Label:    "myorg.sms.phone", // i18n キー。バンドルに無ければそのまま表示される
                Required: true,
                MaxLen:   32,
            }},
        },
        Scratch: []byte(phonePrompt),
    }, nil
}

func (a *SMSAuthenticator) Continue(ctx context.Context, in op.ContinueInput) (interaction.Step, error) {
    // Scratch は "<stage>\n<subject>"。未登録の番号では subject が空になる。
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
        // 登録済みでも未登録でも同じ prompt を返すので、
        // どの番号が登録されているかは応答から分からない。
        return codeStep(subject), nil

    case codePrompt:
        ok, err := a.OTPs.Verify(ctx, subject, in.Submission.Values["code"])
        if err != nil {
            return interaction.Step{}, err
        }
        if !ok || subject == "" {
            return codeStep(subject), nil // もう一度尋ねる。試行回数の上限は Verify が管理する
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

このコードのうち、認証要素の安全性を支えているのは次の 3 点です。

- **subject は、フォームではなく `Scratch` で運びます。** ユーザが入力するのはコードだけで、`Verify` はその subject に発行したコードと照合します。subject なしでコードを引くと、別のユーザのコードに一致してしまいかねません。
- **登録済みの番号でも未登録の番号でも、見た目は同じにします。** 実運用ではタイミングも揃えます。たとえば SMS の送信をキューに渡し、未登録の分岐でも同じ処理を走らせます。
- **誤ったコードはエラーではなく、新しい prompt で返します。** `Begin` や `Continue` が `error` を返すとサーバ障害として扱われ、リクエストは HTTP 500 で終わります。推測を退けるときは同じ prompt を返し、失敗の回数は `OTPs.Verify` で数えてください。

### 2. `LoginFlow` に組み込む

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
            KindLabel: "myorg.sms_otp", // ドット形式のプリフィックスが必須
        }),
    },
}

op.New(
    /* 必須オプション */
    op.WithLoginFlow(flow),
)
```

`KindLabel`（`myorg.sms_otp`）のドット形式プリフィックスは**必須**で、プリフィックスなしの名前や組み込みと同じ名前は `op.New` が拒否します。プリフィックスには組織の識別子を使ってください。同じ `Kind` を持てる Rule は 1 つだけなので、同じ種類の `ExternalStep` を 2 回並べることはできません。

この例のように別の認証要素の後ろで動かす場合、`Result` に入れる `Subject` は、確定済みの subject と同じか、空でなければなりません。別の subject を返すと、その試行は HTTP 400 で終わります。そうしないと、最初の認証要素が持つ保証レベルを、別のユーザの ID のまま引き継いでしまうためです。

`ExternalStep` の認証器には、`op.WithAuthnLockoutStore` が組み込みの第 2 要素に付ける認証要素横断のロックアウトカウンタが適用されません。SMS コードのレート制限とロックアウトは `OTPStore` の側で実装してください。

### 3. UI に prompt を描画する

既定の HTML ドライバなら、追加の作業はありません。未知の prompt 種別は、`Inputs` から汎用のフォームとして描画されます。ページタイトルは `Prompt.Type` と同じ名前のメッセージバンドルのキー、各フィールドのラベルは `FieldSpec.Label` が指すキーから引かれ、バンドルに無ければキーがそのまま表示されます。文字列は `op.WithLocale` で登録します（[i18n](/ja/use-cases/i18n)）。

JSON ドライバでは、SPA が `/interaction/{uid}` で prompt を受け取ります（`op.WithSPAUI` では `LoginMount/state/{uid}`）。レスポンスは `Prompt` そのものです。SPA は `state_ref` を送信にそのまま入れて返し、フィールドの値は `values` に入れます。`FieldSpec` には JSON タグがないため、メンバー名は大文字で始まります。

```json
{
  "type": "myorg.sms.collect_phone",
  "inputs": [{"Name": "phone", "Kind": 0, "Label": "myorg.sms.phone", "MaxLen": 32, "MinLen": 0, "Required": true, "Pattern": ""}],
  "state_ref": "...",
  "csrf_token": "...",
  "locale": "en"
}
```

SPA は電話番号の入力欄を描画し、`X-CSRF-Token` ヘッダ付きで `{ "state_ref": "...", "values": { "phone": "+1..." } }` を同じ URL に POST します。次のレスポンスは `myorg.sms.collect_code` の prompt なので、`{ "state_ref": "...", "values": { "code": "123456" } }` を POST します。コードが一致すると、OP は次の Rule か同意画面に進み、最後に終端のレスポンスを返します。この終端のエンベロープは [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) で説明しています。

## Prompt のフィールドと上限

送信するフィールドは、すべて `Prompt.Inputs` に宣言します。`PromptData` は sealed interface なので、アプリケーションが `interaction` パッケージの外から独自の data 型を追加することはできません。カスタムのフォーム項目には `FieldSpec` を使ってください。secret は `Prompt.StateRef` にも、ドライバが公開し得る `Scratch` の値にも入れてはいけません。カスタム prompt の種別には組織のプリフィックス（`myorg.…`）が必要です。ライブラリの `auth.*`、`consent.*`、`captcha`、`interaction.*` と衝突させないためです。

`FieldKind` は `FieldText`、`FieldPassword`、`FieldOTPCode`、`FieldEmail`、`FieldHidden` のいずれかです。`Required`、`MinLen`、`MaxLen`、`Pattern` は `Continue` の前に検証されます。`Pattern` は値全体に一致する必要があります。`MaxLen` が 0 のフィールドには、種別ごとの byte 上限が適用されます。

| 種別 | `MaxLen` 未指定時の上限（byte） |
|---|---|
| `FieldText` | 512 |
| `FieldPassword` | 1024 |
| `FieldOTPCode` | 32 |
| `FieldEmail` | 320 |
| `FieldHidden` | 16 KiB |

1 回の submission 全体にも、名前と値の合計 32 KiB、宣言した項目を超える追加項目 4 個までという上限があります。Prompt の `StateRef` は 10 分で失効し、1 回しか使えません。古い reference や再利用された reference は、認証器が呼ばれる前に拒否されます。

組み込み MFA の prompt も同じ契約を使います。TOTP は `AttemptsRemaining` と 6 桁の `code` を返します。メール OTP はマスク済みアドレスと `ExpiresAt` を返し、254 byte のメールアドレスと 6 桁の code を受け付け、code の既定の有効期間は 5 分です。passkey は WebAuthn の challenge と allow-list を返し、assertion response は 16 KiB までです。recovery code は `AttemptsRemaining` を返し、10〜32 byte を受け付けます。TOTP と recovery の `AttemptsRemaining` は、未使用の recovery code の数ではなく、失敗した提出をあと何回まで許容するかを表します。これらは prompt のメタデータと入力上限であり、認証要素ごとのレート制限の代わりにはなりません。

## 契約条件

オーケストレータは、Provider の構築時に設定を検証し、実行時に空の Step を拒否します。公開契約は次のとおりです。

| 要件 | 理由 |
|---|---|
| `Type()` がフロー内で一意 | 振り分け経路を一意にするため |
| `ExternalStep.KindLabel` にドット形式のプリフィックスがあり、1 つの Rule にしか現れない | プリフィックスなしの名前は組み込み用に予約されており、Rule ごとに識別子を 1 つにするため |
| `AMR()` は RFC 8176 §2 の値、または `""` | 範囲外の値は警告付きの監査イベントを出して除外されます |
| `Prompts()` は `Begin` と `Continue` が返し得る prompt 種別をすべて列挙 | 起動時検証のため。漏れているとランタイムエラーになります |
| `Begin` と `Continue` は `Prompt` または `Result` を返す。空の `Step` は拒否される | オーケストレータの状態遷移の前提です |
| 返す `Result.Subject` は空か、確定済みの subject と同じ | 別の subject を返すと試行が終了します |
| 既知と未知の識別子で、レスポンスの形とタイミングを一致させる | ユーザ列挙の対策です |
| 呼び出しをまたいでステートレス | 試行ごとの状態は構造体ではなく `Scratch` に持ちます |

## テスト

認証器は通常の Go テストで検証します。`Begin` を呼び、`interaction.FormSubmission{Values: ...}` を `Continue` に渡して、返された Prompt または Result を確認し、同じ手順を並行実行します。公開パッケージ `op/testkit` には、HTTP 層の fixture 用に subject を確定させる認証器がありますが、本番用ではありません。

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

## 役割の分担

ログインの判断は 4 つの部品に分かれ、それぞれ別の型が担当します。

| 型 | 決めること |
|---|---|
| `Step` | どの認証要素か（`op.StepTOTP` や `op.ExternalStep` のような記述子） |
| `Rule` | その認証要素をいつ実行するか |
| `Decider` | Rule の前に、許可・拒否・特定のステップの要求を決める方針上書き |
| `Authenticator` | 認証要素の手順そのもの |

順序と重複排除はオーケストレータが担当し、認証要素の仕組みは自前のコードが担当します。`ExternalStep` は、組み込みの `Step` がない `Authenticator` を橋渡しします。

## 参考

- **[アーキテクチャ概観 § LoginFlow の内部](/ja/reference/architecture#loginflow-internals)**: オーケストレータが認証器に対して何をするか。
- **[MFA / ステップアップ](/ja/use-cases/mfa-step-up)**: 組み込みの Step を `Rule` で組み合わせるパターン。
- **[監査イベントカタログ § ログイン / MFA / ステップアップ](/ja/reference/audit-events#login-mfa-step-up)**: 認証器の成功と失敗で何が発火するか。
