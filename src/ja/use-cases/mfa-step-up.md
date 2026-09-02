---
title: MFA / step-up
description: authenticator と rule の組合せ — TOTP 常時、N 失敗後 captcha、必要時 ACR step-up、login/MFA 監査シグナル。
pageClass: pg-use-cases-mfa-step-up
---

# 使い方 — MFA / step-up

ライブラリの認証層は 3 つのプリミティブの合成で構築されます:

- **`Step`** — 1 つの factor を検証する方法（password、TOTP、passkey、email-OTP …）。
- **`Rule`** — その factor がこの試行で **必要** かを判定。
- **`LoginFlow`** — `Primary` ステップと `Rules` の順序付きリスト。

各 step は、対応する rule が「必要」と判定したときだけ実行されます。「password 常時、TOTP 常時」が 1 つのフロー、「password 常時、3 回失敗後 captcha、リスク高なら TOTP」が別のフローです。

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
- **`amr` claim** — RFC 8176 が標準値（`pwd`、`otp`、`mfa`、`hwk`、`face`、`fpt` …）を列挙しているので、RP は実際にどの factor が使われたかを監査できます。
:::

> **ソース:**
> - [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) — password + 常時 TOTP。
> - [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa) — リスクベースの step-up。
> - [`examples/22-login-captcha`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha) — N 失敗後 captcha。
> - [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — RFC 9470 ACR step-up。
> - [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) — 同梱 SQL factor store と OP のコアテーブルを 1 つの DB で使う構成。

## 構成

<figure class="fig">
  <div class="fig-head">primary step の後、発火したルールの分だけ step が増える</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-mfa-title" viewBox="0 0 960 372" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-mfa-title">ログインフローは primary step を 1 つ実行し、続いてルールを評価します。発火したルールがそれぞれ追加の factor step を要求し、どれも発火しなくなった時点でトークンを発行します。ルールは互いに独立で、宣言順にも依存しません。</title>
    <rect class="fg-box" x="360" y="24" width="240" height="46" rx="8"/>
    <text class="fg-t2" x="480" y="52" text-anchor="middle">ログイン開始</text>
    <path class="fg-edge fg-edge--thin" d="M480,74 V88" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="360" y="92" width="240" height="52" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="116" text-anchor="middle">PrimaryPassword</text>
    <text class="fg-xs" x="480" y="134" text-anchor="middle">primary step — 常に実行される</text>
    <path class="fg-edge fg-edge--thin" d="M480,148 V162" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="360" y="166" width="240" height="46" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="194" text-anchor="middle">Rules を評価する</text>
    <path class="fg-leader" d="M480,216 V230 M144,230 H816"/>
    <path class="fg-edge fg-edge--thin" d="M144,230 V244" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M368,230 V244" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M592,230 V244" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M816,230 V244" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="36" y="248" width="216" height="92" rx="8"/>
    <text class="fg-mxs" x="54" y="270">RuleAlways</text>
    <text class="fg-xs" x="54" y="288">毎回</text>
    <line class="fg-rule" x1="54" y1="300" x2="234" y2="300"/>
    <text class="fg-mxs fg-accent" x="54" y="322">→ StepTOTP</text>
    <rect class="fg-box" x="260" y="248" width="216" height="92" rx="8"/>
    <text class="fg-mxs" x="278" y="270">RuleAfterFailedAttempts</text>
    <text class="fg-xs" x="278" y="288">失敗回数 ≥ 3</text>
    <line class="fg-rule" x1="278" y1="300" x2="458" y2="300"/>
    <text class="fg-mxs fg-accent" x="278" y="322">→ StepCaptcha</text>
    <rect class="fg-box" x="484" y="248" width="216" height="92" rx="8"/>
    <text class="fg-mxs" x="502" y="270">RuleRisk</text>
    <text class="fg-xs" x="502" y="288">リスク ≥ High</text>
    <line class="fg-rule" x1="502" y1="300" x2="682" y2="300"/>
    <text class="fg-mxs fg-accent" x="502" y="322">→ StepTOTP</text>
    <rect class="fg-box" x="708" y="248" width="216" height="92" rx="8"/>
    <text class="fg-mxs" x="726" y="270">RuleACR</text>
    <text class="fg-xs" x="726" y="288">acr_values に aal3</text>
    <line class="fg-rule" x1="726" y1="300" x2="906" y2="300"/>
    <text class="fg-mxs fg-accent" x="726" y="322">→ StepTOTP</text>
    <path class="fg-edge fg-edge--ok" d="M632,189 H720" marker-end="url(#fg-ao)"/>
    <text class="fg-xs fg-ok" x="676" y="182" text-anchor="middle">どれも発火しない</text>
    <rect class="fg-box fg-box--ok" x="724" y="166" width="200" height="46" rx="8"/>
    <text class="fg-t2" x="824" y="194" text-anchor="middle">トークンを発行する</text>
  </svg>
  <figcaption class="fig-note">ここにあるのは if 文の連鎖ではありません。各ルールが独立に答え、要求された step が集められ、ループが再び回ります。だから 5 つ目のルールを足しても、他の 4 つの判断は変わりません。</figcaption>
</figure>

`LoginFlow` は `Primary` step と `Rules` リストを持つ struct。各 rule は `op.RuleAlways(step)`、`op.RuleAfterFailedAttempts(n, step)`、`op.RuleRisk(threshold, step)`、`op.RuleACR(acr, step)` 等のコンストラクタで作る `Rule` 値です。

`When` が nil の rule は常時実行です。ライブラリは nil を constant-true predicate として扱うため、`op.Rule{Then: step}` のような struct literal も常時 rule になります。factor を条件付きにしたい場合は、明示的な predicate を指定してください。

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

observer は認証試行ごとに 1 つの `op.LoginAttempt` を受け取ります。`Outcome` は `op.AttemptSuccess`、`op.AttemptFailure`、`op.AttemptLocked` のいずれかです。`AttemptLocked` は送信された credential を通常の失敗として検証したのではなく、総当たり対策の gate が試行を終了させたことを示すため、別の outcome として処理してください。

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

ユーザがセッション内で `aal2` で認証済の場合、RP の `acr_values=aal3` 要求は対話的 step-up を発火させます。実行される factor は `RuleACR` に設定したものです。OP が固定の `passkeyAuth` 実装へ差し替えることはありません。

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

recovery-code prompt の `AttemptsRemaining` は、失敗した提出をあと何回許容するかという budget です。未使用の recovery code 数ではないため、driver はこの値から残りコード数を推測しないでください。

## 監査記録

認証フローが発行するのは、実際に解決した factor の結果です。primary factor には `op.AuditLoginSuccess` / `op.AuditLoginFailed`、additional factor には `op.AuditMFASuccess` / `op.AuditMFAFailed` が使われます。cross-factor lockout の CAS 競合で失敗試行がカウントされずに中断された場合は `op.AuditLockoutStalled` です。`op.AuditMFARequired`、`op.AuditStepUpRequired`、`op.AuditStepUpSuccess` は予約されたカタログ定数であり、OP は発行しません。

- `factor`（`pwd`、`otp`、`webauthn` …）

イベントは `extras` に解決した `factor` を載せ、`op.WithAuditLogger`（`*slog.Logger`）経由で流れます。発行は request goroutine 上で同期的に行われるため、handler を block させず、並行呼び出しに安全な実装にしてください。

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

アカウント管理の画面では、credential record を自作せず companion package を使います。[`op/passkeykit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/passkeykit) はログイン時の `PrimaryPasskey` と同じ設定から WebAuthn の登録 ceremony を実行します。[`op/recoverykit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/recoverykit) は recovery code batch を作成・置換します。`Result.Codes` は 1 回だけ表示し、保存もログ出力もしません。`LoginFlow` ではなく `WithAuthenticators` を使う場合は、`op.NewEmailOTPAuthenticator(op.EmailOTPConfig{...})` で低レイヤの email-OTP authenticator を組み立てます。[`28-email-otp-recovery`](https://github.com/libraz/go-oidc-provider/tree/main/examples/28-email-otp-recovery) と [`29-passkey`](https://github.com/libraz/go-oidc-provider/tree/main/examples/29-passkey) を参照してください。

::: warning passkey には IP ではなくドメインが要る
WebAuthn の Relying Party ID はドメイン名でなければならず、ブラウザは IP リテラルを RP ID として受け付けません。そのため `http://127.0.0.1` で開発している OP には、対にできる RP ID が存在しません。issuer を `localhost` にした上で [`op.WithAllowLocalhostLoopback()`](/ja/reference/options) を指定してください。このオプションは redirect URI だけでなく issuer にも文字列の `localhost` を許可します。緩和が許されるのは開発マシンの中だけで、本番の RP は https の後ろに置きます。

`op.PrimaryPasskey` に `AAGUIDAllowlist` を設定すると、登録 ceremony は `direct` の attestation conveyance に切り替わります。attestation で裏付けられていない AAGUID と allowlist を突き合わせても何も証明できず、ソフトウェア authenticator が承認済みモデルを名乗るだけで登録できてしまうからです。ユーザエージェントの attestation プロンプトが出るようになり、モデルを特定できない登録は allowlist と照合せずに拒否されます。プロンプトの出ない従来の ceremony を保つには allowlist を空のままにします。

`RequireUserVerification: true` は passkey の登録とログインの両方に適用されます。PIN や biometric などの user-verification gesture が必要で、presence-only の登録や assertion は拒否されます。登録時の credential がログインでも使えるように、`op/passkeykit` に渡す設定と `op.PrimaryPasskey` を共有してください。
:::

## TOTP factor の登録（enrolment）

`op.StepTOTP` は組み込み側がすでに永続化済みの `store.TOTPRecord` に対してコードを検証します。これと対になる登録経路は [`op/totpkit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/totpkit) パッケージにあります。秘密鍵の生成、QR コードとして描画される `otpauth://` プロビジョニング URI、登録を確定する所有証明（proof-of-possession） ステップを所有しています。

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

デモ / CLI 用途の登録（端末向け QR 描画、確定済 seed record の生成） には `examples/internal/seedkit` を参照してください。`//go:build example` タグで隔離されているため、QR 描画ライブラリがホストモジュールの `go.sum` に入りません。

> **ソース:** [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — in-process OP+RP デモ。登録から RFC 9470 ACR step-up までを通しで実行します。
