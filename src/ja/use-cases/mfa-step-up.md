---
title: MFA / step-up
description: authenticator と rule の組合せ — TOTP 常時、N 失敗後 captcha、必要時 ACR step-up。
---

# 使い方 — MFA / step-up

ライブラリの認証層は 3 つのプリミティブの合成で構築されます:

- **`Step`** — 1 つの factor を検証する方法（password、TOTP、passkey、email-OTP …）。
- **`Rule`** — その factor がこの試行で **必要** かを判定。
- **`LoginFlow`** — `Primary` ステップと `Rules` の順序付きリスト。

各 step は対応する rule が yes と言ったときだけ走ります。「password 常時、TOTP 常時」が 1 つのフロー、「password 常時、3 回失敗後 captcha、リスク高なら TOTP」が別のフローです。

このページは、ログイン判定が「password を受理したか」だけでは終わらない場合に使います。たとえば必須 MFA、不審な試行への captcha、リスクベースの追加 factor、RP が要求する ACR step-up です。ユーザ名と password だけでよいなら、既定の password primary step と user store のページで足ります。必要になる前に rule を増やすと、テストや復旧の範囲だけが広がります。

::: details このページで触れる仕様
- [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238) — TOTP（時刻ベースワンタイムパスワード）
- [RFC 8176](https://datatracker.ietf.org/doc/html/rfc8176) — Authentication Method Reference Values（`amr`）
- [RFC 9470](https://datatracker.ietf.org/doc/html/rfc9470) — OAuth 2.0 Step-up Authentication Challenge
- [WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/) — パスキー
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) — Authenticator Assurance Levels（AAL）
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2（`acr` / `amr` / `auth_time`）
:::

::: details 用語の補足
- **MFA**（Multi-Factor Authentication） — 複数の factor（知識・所持・生体）を立て続けに検証してからトークンを発行する仕組み。
- **Step-up** — RP が、より高い保証水準を必要とする操作のために `acr_values=aalN` を要求する仕組みです。現在のセッションがその水準に達していなければ、OP は追加の factor を実行して保証水準を引き上げたうえで `id_token` を新規発行します。RFC 9470 が定義しています。
- **AAL（Authenticator Assurance Level）** — NIST が定義する 3 段階の保証水準です。AAL1 ≒ パスワード、AAL2 ≒ パスワード + もう 1 因子、AAL3 ≒ ハードウェアにバインドされた所持証明。多くの OP / RP が `acr` のラベルとして使います。
- **`amr` claim** — RFC 8176 が標準値（`pwd`、`otp`、`mfa`、`hwk`、`face`、`fpt` …）を列挙しているので、RP は実際にどの factor が走ったかを監査できます。
:::

> **ソース:**
> - [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) — password + 常時 TOTP。
> - [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa) — リスクベースの step-up。
> - [`examples/22-login-captcha`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha) — N 失敗後 captcha。
> - [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — RFC 9470 ACR step-up。
> - [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) — 本番寄りの factor 永続化向け SQL-backed `store.TOTPStore`。

## 構成

<svg class="mfa-loginflow" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="mfa-loginflow-title" viewBox="0 0 800 486" width="760" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="mfa-loginflow-title">ログインフローの構成: primary パスワード step、どの factor step を走らせるか判定する rule 層、その後のトークン発行。</title>
  <rect x="330" y="16" width="140" height="38" rx="6"/>
  <rect x="290" y="78" width="220" height="50" rx="6"/>
  <rect x="17" y="352" width="176" height="42" rx="6"/>
  <rect x="214" y="352" width="176" height="42" rx="6"/>
  <rect x="410" y="352" width="176" height="42" rx="6"/>
  <rect x="607" y="352" width="176" height="42" rx="6"/>
  <rect class="d-accent" x="330" y="150" width="140" height="44" rx="6"/>
  <rect class="d-accent" x="17" y="240" width="176" height="58" rx="8"/>
  <rect class="d-accent" x="214" y="240" width="176" height="58" rx="8"/>
  <rect class="d-accent" x="410" y="240" width="176" height="58" rx="8"/>
  <rect class="d-accent" x="607" y="240" width="176" height="58" rx="8"/>
  <rect class="d-accent" x="330" y="430" width="140" height="40" rx="6"/>
  <path d="M400 54 L400 78"/>
  <path d="M400 128 L400 150"/>
  <path d="M400 194 L400 214 M105 214 L695 214 M105 214 L105 240 M302 214 L302 240 M498 214 L498 240 M695 214 L695 240"/>
  <path d="M105 298 L105 352 M302 298 L302 352 M498 298 L498 352 M695 298 L695 352"/>
  <path d="M105 394 L105 412 M302 394 L302 412 M498 394 L498 412 M695 394 L695 412 M105 412 L695 412 M400 412 L400 430"/>
  <path d="M396 71 L400 78 L404 71"/>
  <path d="M396 143 L400 150 L404 143"/>
  <path d="M101 233 L105 240 L109 233"/>
  <path d="M298 233 L302 240 L306 233"/>
  <path d="M494 233 L498 240 L502 233"/>
  <path d="M691 233 L695 240 L699 233"/>
  <path d="M101 345 L105 352 L109 345"/>
  <path d="M298 345 L302 352 L306 345"/>
  <path d="M494 345 L498 352 L502 345"/>
  <path d="M691 345 L695 352 L699 345"/>
  <path d="M396 423 L400 430 L404 423"/>
  <text class="d-lbl" x="400" y="40" font-size="13" text-anchor="middle">ログイン開始</text>
  <text class="d-lbl d-mono" x="400" y="100" font-size="13" text-anchor="middle">PrimaryPassword</text>
  <text class="d-cap" x="400" y="117" font-size="11" text-anchor="middle">primary step</text>
  <text x="400" y="177" font-size="13" text-anchor="middle"><tspan class="d-accent-t d-mono">Rules</tspan><tspan class="d-accent-t"> を評価</tspan></text>
  <text class="d-accent-t d-mono" x="105" y="266" font-size="12.5" text-anchor="middle">RuleAlways</text>
  <text class="d-cap" x="105" y="285" font-size="11" text-anchor="middle">毎回</text>
  <text class="d-accent-t d-mono" x="302" y="266" font-size="12" text-anchor="middle">RuleAfterFailedAttempts</text>
  <text class="d-cap" x="302" y="285" font-size="11" text-anchor="middle">失敗回数 ≥ 3</text>
  <text class="d-accent-t d-mono" x="498" y="266" font-size="12.5" text-anchor="middle">RuleRisk</text>
  <text class="d-cap" x="498" y="285" font-size="11" text-anchor="middle">リスク ≥ High</text>
  <text class="d-accent-t d-mono" x="695" y="266" font-size="12.5" text-anchor="middle">RuleACR</text>
  <text x="695" y="285" font-size="11" text-anchor="middle"><tspan class="d-cap d-mono">aal3</tspan><tspan class="d-cap"> を要求</tspan></text>
  <text class="d-lbl d-mono" x="105" y="378" font-size="13" text-anchor="middle">StepTOTP</text>
  <text class="d-lbl d-mono" x="302" y="378" font-size="13" text-anchor="middle">StepCaptcha</text>
  <text class="d-lbl d-mono" x="498" y="378" font-size="13" text-anchor="middle">StepTOTP</text>
  <text class="d-lbl d-mono" x="695" y="378" font-size="13" text-anchor="middle">StepTOTP</text>
  <text class="d-accent-t" x="400" y="455" font-size="13" text-anchor="middle">トークン発行</text>
</svg>

`LoginFlow` は `Primary` step と `Rules` リストを持つ struct。各 rule は `op.RuleAlways(step)`、`op.RuleAfterFailedAttempts(n, step)`、`op.RuleRisk(threshold, step)`、`op.RuleACR(acr, step)` 等のコンストラクタで作る `Rule` 値です。

## 常時 TOTP

```go
import "github.com/libraz/go-oidc-provider/op"

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

## N 回失敗後 captcha

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
  op.WithCaptchaVerifier(myCaptchaVerifier), // hCaptcha / Turnstile 等
)
```

`LoginAttemptObserver`（`op.WithLoginAttemptObserver` で渡す）が identifier 毎に失敗回数をカウント。`RuleAfterFailedAttempts` がそのカウントを読みます。

## リスクベース step-up

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleRisk(op.RiskScoreHigh, op.StepTOTP{Store: st.TOTPs(), EncryptionKey: keys.TOTPKey}),
  },
  Risk: myRiskAssessor, // LoginFlow の Risk フィールド
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
)
```

`RiskAssessor` は試行ごとに `RiskScore` を返します。ライブラリは 4 段階の順序付き列挙（`RiskScoreNone` < `RiskScoreLow` < `RiskScoreMedium` < `RiskScoreHigh`）を公開しています。組み込み側の assessor が、リスク評価サービスの出力をこの列挙値に変換します。`RuleRisk(threshold, step)` は assessor の score が `threshold` 以上のときに発火します。

## RFC 9470 ACR step-up

RP がより高い Authentication Context Class（`acr_values=aal3`）を要求すると、OP はセッション状態に関係なく step-up を実行します:

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
  op.WithACRPolicy(myACRPolicy), // op.ACRPolicy 実装
)
```

ユーザがセッション内で `aal2` で認証済の場合、RP の `acr_values=aal3` 要求は対話的 step-up を発火させます。OP は次の step を実行してセッションを `aal3` に引き上げてから RP に redirect で返します。

## リソースサーバ側: `op.StepUpChallenge`

RFC 9470 には 2 つの側面があります。OP 側は上記のとおり — `acr_values` / `max_age` を尊重して再認証します。もう一方は **リソースサーバ** にあります。ある機微な呼び出しに対してアクセストークンが必要な強度や freshness を欠くとき、リソースサーバは `401` を返し、`error="insufficient_user_authentication"` と必要な `acr_values` / `max_age` を載せた `WWW-Authenticate: Bearer` チャレンジを返します。クライアントはその値で再認可し、上記の OP 側 step-up が働きます。

`op.StepUpChallenge` はそのヘッダ値を組み立てます。OP 自身はこれを発行しません — トークン検証と `401` の応答はリソースサーバの仕事なので、本ライブラリは正しく整形されたチャレンジ文字列を生成するところで止まります:

```go
maxAge := int64(300)
challenge := op.StepUpChallenge("api", []string{"urn:acr:high", "urn:acr:mfa"}, &maxAge)
// challenge == `Bearer realm="api", error="insufficient_user_authentication",
//               acr_values="urn:acr:high urn:acr:mfa", max_age="300"`
w.Header().Set("WWW-Authenticate", challenge)
w.WriteHeader(http.StatusUnauthorized)
```

空の `realm`、空の `acrValues` スライス、`nil` の `maxAge` はそれぞれ省略され、必須の `error="insufficient_user_authentication"` は常に含まれます。`acrValues` は `acr_values` リクエストパラメータと同じく、space 区切りの引用符付き 1 文字列にエンコードされます。

## ワンタイム factor は単回使用

ワンタイム factor — email-OTP（`op.StepEmailOTP`）、TOTP（`op.StepTOTP`）、recovery code（`op.StepRecoveryCode`）— は並行下でも単回使用です。同じコードを 2 度受理することはできません。store は atomic な compare-and-set でこれを強制し、再提示時には `ErrAlreadyConsumed` を返すので、同じコードを提示する 2 つの競合リクエストが両方とも成功することはありません。[factor store を自前実装](/ja/use-cases/byo-store)する場合は、これらの consume 操作を CAS にする必要があります（in-memory リファレンスがその形を示します）。

terminal な factor 失敗 — 期限切れまたは消費済みのワンタイムコード、lockout、必須のリセット、再送回数超過 — は `authn.ErrFactorAbort` sentinel にラップされ、authorize endpoint はこれを 500 ではなく **HTTP 400** にマップします。使用済みのコードはサーバ障害ではなくクライアント側の状態だからです。

## 監査記録

各 step は `op.Audit*` カタログから構造化イベントを発行します — `op.AuditLoginSuccess` / `op.AuditLoginFailed`、`op.AuditMFARequired` / `op.AuditMFASuccess` / `op.AuditMFAFailed`、`op.AuditStepUpRequired` / `op.AuditStepUpSuccess` など。各イベントは次の属性を持ちます。

- `factor`（`pwd`、`otp`、`webauthn` …）
- `aal`（達成した AAL レベル）
- `acr`（ACR class 値）
- `amr`（RFC 8176 method references）

イベントは `op.WithAuditLogger`（`*slog.Logger`）経由で流れます。

## 同梱の step

ライブラリは一般的な factor 向けに、すぐ使える step を同梱しています:

| Step | 検証対象 | ストレージ interface |
|---|---|---|
| `op.PrimaryPassword` | ユーザ名 / email + パスワード | `store.UserPasswords()` |
| `op.PrimaryPasskey` | WebAuthn / passkey を primary factor として | `store.Passkeys()` |
| `op.StepTOTP` | RFC 6238 TOTP、AES-256-GCM 静止時暗号化 | `store.TOTPs()` |
| `op.StepEmailOTP` | メール配信 one-time code | `store.EmailOTPs()` |
| `op.StepRecoveryCode` | 単発 recovery code | `store.RecoveryCodes()` |
| `op.StepCaptcha` | hCaptcha / Turnstile / 自前 verifier | n/a |

各 step の **ストレージ** は組み込み側の責任です。ライブラリはユーザレコードもパスワードハッシュも所有しません。リファレンスの `inmem` アダプタは、例とテストには十分です。本番では、既存のユーザテーブルに合わせて `op/store/*` のサブストアを実装してください。

完全カスタムな factor は `op.ExternalStep` を実装し、一意な `KindLabel` で rule リストに追加します。これは `examples/2x-*` 全体で踏襲しているパターンです。

## TOTP factor の登録 (enrolment)

`op.StepTOTP` は組み込み側がすでに永続化済みの `store.TOTPRecord` に対してコードを検証します。これと対になる登録経路は [`op/totpkit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/totpkit) パッケージにあります。秘密鍵の生成、QR コードとして描画される `otpauth://` プロビジョニング URI、登録を確定する所有証明 (proof-of-possession) ステップを所有しています。

```go
import (
  "github.com/libraz/go-oidc-provider/op/totpkit"
)

// 起動時に codec を 1 つだけ作り、同じ key bytes を
// op.StepTOTP{EncryptionKey: keys.TOTPKey} と共有します。
// 検証 / 登録の両側が同じ AES-256-GCM blob 形を produce / consume します。
codec, err := totpkit.NewCodec(keys.TOTPKey /*, previousKey, ... */)

// 1. primary 認証成功後、登録を開始。
pending, err := totpkit.NewEnrolment(codec,
  user.Subject,        // OP 内部の安定 user ID (AAD としてバインド)
  "Example Identity",  // authenticator app に表示される issuer ラベル
  user.Email,          // issuer の下に表示される account ラベル
)
// pending.OTPAuthURI    — HTML で QR コードとして描画
// pending.SecretBase32  — 「手入力 (manual entry)」UX 用の表示
// pending.Record        — 封緘済 TOTPRecord、まだ永続化してはいけない

// 2. `pending` を短命な登録セッション (server-side row、cookie で参照)
//    に置き、QR コードと手入力用 secret をユーザに表示します。

// 3. ユーザが authenticator app の表示するコードを入力。
record, err := totpkit.Confirm(codec, pending, submittedCode, time.Now())
// totpkit.ErrCodeRejected の場合、`pending` は不変のままなので
// フォームを再描画してユーザに retry させます。codec の保持期間を
// 越えて鍵がローテーションされている場合は ErrDecrypt が発火します。

// 4. 確定済 record を永続化。この瞬間から op.StepTOTP は同じ
//    secret に対するコードを受理します。
_ = storage.TOTPs().Put(ctx, record)
```

`totpkit` は意図的に HTTP 面に出てきません。HTML、QR 描画、登録セッションは組み込み側が所有します。`NewEnrolment` と `Confirm` のいずれも、`subject` を GCM の AAD (additional-authenticated-data) としてバインドします。あるユーザの登録 row を抜き出しても、別の subject では replay できません。GCM タグ検証が AAD 不一致で拒否します。検証経路も同じ AAD 形を使うので、両端で同じバインディングが効きます。

デモ / CLI 用途の登録 (端末向け QR 描画、確定済 seed record の生成) には `examples/internal/seedkit` を参照してください。`//go:build example` タグで隔離されているため、QR 描画ライブラリがホストモジュールの `go.sum` に入りません。

> **ソース:** [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — in-process OP+RP デモ。登録から RFC 9470 ACR step-up までを通しで実行します。
