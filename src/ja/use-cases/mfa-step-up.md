---
title: MFA / ステップアップ
description: 認証器とルールの組み合わせ。TOTP を常時、N 回失敗後に captcha、必要に応じて ACR によるステップアップ、ログインと MFA の監査シグナル。
pageClass: pg-use-cases-mfa-step-up
---

# ユースケース — MFA / ステップアップ

ログイン層は、組み合わせて使う 3 つの部品でできています。

- **`Step`**: 1 つの認証要素を検証します（パスワード、TOTP、パスキー、メール OTP、または [`op.ExternalStep`](/ja/use-cases/custom-authenticator) で足した独自の要素）。
- **`Rule`**: その試行でステップが必要かどうかを判定します。
- **`LoginFlow`**: `Primary` ステップ 1 つと、順序付きの `Rules` のリストです。

`Primary` が成功すると、OP はルールを順に調べ、条件に合ったルールのステップをすべて実行します。「パスワードと TOTP を常に要求」も 1 つのフローで、「パスワードは常に、3 回失敗したら captcha、リスクが高ければ TOTP」も別の 1 つのフローです。

このページは、ログインの判定が「パスワードが通ったか」だけでは終わらない場合に使います。たとえば、必須の MFA、不審な試行への captcha、リスクに応じた追加の認証要素、RP が要求するより強い `acr` です。ユーザ名とパスワードだけでよいなら、既定のパスワード用 primary ステップと user store のページで足ります。必要になる前にルールを増やしても、テストと復旧の範囲が広がるだけです。

::: details このページで触れる仕様
- [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238) — TOTP（時刻ベースワンタイムパスワード）
- [RFC 8176](https://datatracker.ietf.org/doc/html/rfc8176) — Authentication Method Reference Values（`amr`）
- [RFC 9470](https://datatracker.ietf.org/doc/html/rfc9470) — OAuth 2.0 Step-up Authentication Challenge（リソースサーバ側）
- [WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/) — パスキー
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) — Authenticator Assurance Levels（AAL）
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2（`acr` / `amr` / `auth_time`）
:::

::: details 用語の補足
- **MFA**（Multi-Factor Authentication）: ユーザが複数の認証要素（知っているもの、持っているもの、生体）を示してから、OP がトークンを発行する仕組みです。
- **ステップアップ**: RP が機微な操作のために、より高い保証水準を求めることです。`acr_values=aalN` を送ります（OIDC Core §3.1.2.1）。OP は追加の認証要素を実行してから、新しい `id_token` を発行します。リソースサーバがクライアントにこれを求める方法は、RFC 9470 が標準化しています。
- **AAL**（Authenticator Assurance Level）: NIST が定める 3 段階の保証水準です。AAL1 はおおよそパスワード、AAL2 はパスワードに第 2 要素を加えたもの、AAL3 はハードウェアで裏付けた所持の証明です。多くの OP と RP が `acr` のラベルに使います。
- **`amr` claim**: RFC 8176 が標準値（`pwd`、`otp`、`mfa`、`hwk`、`face`、`fpt` など）を列挙しているので、RP は実際にどの認証要素が使われたかを監査できます。
:::

> **ソース:**
> - [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) — パスワードと常時 TOTP。
> - [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa) — リスクに応じたステップアップ。
> - [`examples/22-login-captcha`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha) — N 回失敗後の captcha。
> - [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — ACR によるステップアップ。
> - [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) — 同梱の SQL 認証要素ストアを、OP のコアテーブルと 1 つの DB で使う構成。

## 構成

<figure class="fig">
  <div class="fig-head">primary ステップの後、発火したルールの分だけステップが増える</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-mfa-title" viewBox="0 0 960 384" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-mfa-title">ログインフローは primary ステップを 1 つ実行し、続いてルールを評価します。発火したルールがそれぞれ追加の認証要素のステップを要求し、どれも発火しなくなった時点でトークンを発行します。ルールは宣言順に調べられ、すでに実行済みのステップを持つルールは飛ばされます。</title>
    <!-- primary -->
    <rect class="fg-box" x="32" y="24" width="272" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="52">primary ステップ</text>
    <text class="fg-m fg-accent" x="48" y="76">PrimaryPassword</text>
    <path class="fg-edge" d="M304,60 H344" marker-end="url(#fg-a)"/>
    <!-- rules -->
    <rect class="fg-box fg-box--accent" x="344" y="24" width="272" height="72" rx="8"/>
    <text class="fg-t2" x="360" y="52">ルールを評価する</text>
    <text class="fg-s" x="360" y="76">宣言順に調べる</text>
    <path class="fg-edge fg-edge--ok" d="M616,60 H656" marker-end="url(#fg-ao)"/>
    <!-- tokens -->
    <rect class="fg-box fg-box--ok" x="656" y="24" width="272" height="72" rx="8"/>
    <text class="fg-t2" x="672" y="52">トークンを発行する</text>
    <text class="fg-s" x="672" y="76">どれも発火しないとき</text>
    <path class="fg-edge fg-edge--thin" d="M480,96 V128" marker-end="url(#fg-a)"/>
    <!-- rule table -->
    <rect class="fg-box" x="32" y="128" width="896" height="232" rx="8"/>
    <text class="fg-lbl" x="48" y="156">ルール</text>
    <text class="fg-lbl" x="304" y="156">発火する条件</text>
    <text class="fg-lbl" x="640" y="156">追加されるステップ</text>
    <line class="fg-rule fg-rule--strong" x1="32" y1="168" x2="928" y2="168"/>
    <text class="fg-mxs" x="48" y="198">RuleClient</text>
    <text class="fg-s" x="304" y="198">管理用クライアントの場合</text>
    <text class="fg-mxs fg-accent" x="640" y="198">→ StepEmailOTP</text>
    <line class="fg-rule" x1="48" y1="216" x2="912" y2="216"/>
    <text class="fg-mxs" x="48" y="246">RuleAfterFailedAttempts</text>
    <text class="fg-s" x="304" y="246">失敗回数 ≥ 3</text>
    <text class="fg-mxs fg-accent" x="640" y="246">→ StepCaptcha</text>
    <line class="fg-rule" x1="48" y1="264" x2="912" y2="264"/>
    <text class="fg-mxs" x="48" y="294">RuleRisk</text>
    <text class="fg-s" x="304" y="294">リスク ≥ High</text>
    <text class="fg-mxs fg-accent" x="640" y="294">→ StepTOTP</text>
    <line class="fg-rule" x1="48" y1="312" x2="912" y2="312"/>
    <text class="fg-mxs" x="48" y="342">RuleACR</text>
    <text class="fg-s" x="304" y="342">acr_values に "aal3"</text>
    <text class="fg-mxs fg-accent" x="640" y="342">→ PrimaryPasskey</text>
  </svg>
  <figcaption class="fig-note">各ルールは試行に対する条件判定で、同じ種類のステップは 1 つのルールにしか現れません。ステップを実行するたびにルールは再評価され、ルールの答えは他のルールに左右されないので、5 つ目のルールを足しても、他の 4 つの判断は変わりません。</figcaption>
</figure>

`LoginFlow` は構造体で、`Primary` ステップ、`Rules` のリスト、任意の 2 つのフィールドを持ちます。1 つは `Decider`（ルールでは表せない方針を、ルールより先に判定するフック）、もう 1 つは `Risk`（`RiskAssessor`）です。各 `Rule` は条件とステップの組で、コンストラクタで作ります。

| コンストラクタ | 発火する条件 |
|---|---|
| `op.RuleAlways(step)` | 毎回 |
| `op.RuleAfterFailedAttempts(n, step)` | この試行で拒否された送信が `n` 回以上 |
| `op.RuleRisk(threshold, step)` | assessor のスコアが `threshold` 以上 |
| `op.RuleNewDevice(step)` | assessor が新しいデバイスと報告した |
| `op.RuleClient(clientID, step)` | そのクライアントからのリクエスト |
| `op.RuleScope(scope, step)` | その scope を要求している |
| `op.RuleACR(acr, step)` | リクエストの `acr_values` に `acr` が含まれる |
| `op.RuleWhen(pred, step)` | `op.LoginContext` に対する自前の条件が true を返す |

OP は次のように評価します。

- `Primary` の後、ルールを宣言順に調べ、条件に合い、まだ実行されていない最初のルールのステップを実行します。実行したらもう一度調べ、どれにも合わなくなったら認証は完了です。
- 同じ種類のステップは 1 つのルールにしか置けません。繰り返したフローは `op.New` が拒否します。
- `When` が nil のルール（`op.Rule{Then: step}` の構造体リテラルも含む）は常に合致します。条件が panic した場合も合致として扱います。条件に欠陥があっても、認証要素を飛ばさず要求する側に倒れます。
- `Primary` は利用者を特定できなければなりません。`op.PrimaryPasskey`、`op.StepTOTP`、`op.StepEmailOTP`、`op.StepRecoveryCode` は特定済みのユーザを検証するものなので、`Primary` に置くと `op.New` が拒否します。`op.PrimaryPassword` または [`op.ExternalStep`](/ja/use-cases/custom-authenticator) の後ろのルールに置いてください。
- `WithLoginFlow` は旧来の `WithAuthenticators` と同時に使えず、呼べるのは 1 回です。

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

## N 回失敗後の captcha

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
  op.WithCaptchaVerifier(myCaptchaVerifier), // hCaptcha / Turnstile など
)
```

`StepCaptcha` の `Verifier` フィールドにも verifier が必要です。`op.WithCaptchaVerifier` は、OP 自身が出す captcha の prompt に同じ verifier を渡します。

`RuleAfterFailedAttempts` が読むのは、現在の試行で拒否された送信の回数で、`LoginAttemptObserver`（`op.WithLoginAttemptObserver` で渡す）から得ます。observer は認証試行ごとに `op.LoginAttempt` を 1 つ受け取ります。`Outcome` は `op.AttemptSuccess`、`op.AttemptFailure`、`op.AttemptLocked` のいずれかです。`AttemptLocked` は、送信された資格情報を評価せずに総当たり対策のゲートが試行を終了させたことを表すので、通常の失敗とは別に処理してください。

## リスクに応じたステップアップ

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

`RiskAssessor` はログイン試行ごとに 1 回、`Primary` の前に実行され、4 段階の順序付き列挙（`RiskScoreNone` < `RiskScoreLow` < `RiskScoreMedium` < `RiskScoreHigh`）の `RiskScore` を返します。リスク評価サービスの出力をこの列挙値に変換するのは、組み込み側の assessor の役目です。`RuleRisk(threshold, step)` は、スコアが `threshold` 以上のときに発火します。

assessor は、試行の拒否や、特定の認証要素の要求を直接返すこともできます。指定は `LoginFlow.Risk` か `op.WithRiskAssessor` のどちらか一方にしてください。両方指定すると `op.New` が失敗します。assessor がなければスコアは `RiskScoreNone` のままなので、`RuleRisk` は発火しません。エラーにもなりません。

## ACR によるステップアップ

RP がより強い Authentication Context Class（`acr_values=aal3`）を要求したとき、その値に対する `RuleACR` がステップを実行します。

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
  op.WithACRPolicy(myACRPolicy), // op.ACRPolicy の実装
)
```

このルールは `acr_values` に対する単純な一致判定です。セッションがすでに同等以上の認証を持っていても、指定した認証要素を実行します。どの認証要素を使うかを OP が選ぶことはありません。

発行される `id_token` の `acr` に何を入れるかは、`ACRPolicy` が決めます。既定のポリシーは緩く、ログインが AAL1 に達していれば、要求された最初の値をそのまま返します。`aal3` に実質的な意味を持たせたいときは、完了したステップと AAL を確認してから同意するポリシーを入れてください。

### 再利用されたセッション上のルール

ログインなしで、既存のセッションだけでリクエストを処理できる場合があります。たとえば、キャッシュ済みの grant が scope を満たしている場合や、クライアントがファーストパーティの場合です。OP はその方法で code を発行する前に、`Primary` が完了し、他に何も実行していないものとして、`Decider` とルールを評価します。ルールがステップを要求すれば、OP は発行せず、セッションの subject からチェーンを実行します。`prompt=none` なら `interaction_required` を返します。

ルールを設計するときの注意点は次のとおりです。

- セッションで以前に完了した認証要素は、ルールを満たしません。`RuleAlways(StepTOTP)` は、セッションだけで処理できるはずの認可のたびに、もう一度 TOTP を要求します。必要な場面だけにしたければ、`RuleClient`、`RuleScope`、`RuleACR` で範囲を絞ってください。
- 再利用されたセッション上のステップアップでは、発行されるトークンの `acr`、`amr`、`auth_time` に、セッションの値とステップアップの認証要素の両方が残ります。リスク assessor にはセッションの認証方法が見え、ルールには `Primary` が完了済みに見えます。
- captcha のルールとリスク駆動のルールは、この再利用の判定には使われません。チェーンの内側でだけ動きます。
- 再利用されたセッション上のステップアップは、`login.*` ではなく `mfa.*` イベントとして監査されます。

## リソースサーバ側: `op.StepUpChallenge`

RFC 9470 には 2 つの側面があります。OP 側は上のとおりで、`/auth` の `acr_values` と `max_age` を尊重して再認証します。もう一方は**リソースサーバ**にあります。機微な呼び出しに対してアクセストークンの強度や新しさが足りないとき、リソースサーバは `401` を返し、`error="insufficient_user_authentication"` と必要な `acr_values` や `max_age` を載せた `WWW-Authenticate: Bearer` チャレンジを添えます。クライアントはその値で再認可し、上で説明した OP 側のステップアップが動きます。

`op.StepUpChallenge` は、そのヘッダ値を組み立てます。OP 自身はこれを発行しません。トークン検証と `401` の応答はリソースサーバの仕事なので、ライブラリが行うのはチャレンジ文字列の生成までです。

```go
maxAge := int64(300)
challenge := op.StepUpChallenge("api", []string{"urn:acr:high", "urn:acr:mfa"}, &maxAge)
// challenge == `Bearer realm="api", error="insufficient_user_authentication",
//               acr_values="urn:acr:high urn:acr:mfa", max_age="300"`
w.Header().Set("WWW-Authenticate", challenge)
w.WriteHeader(http.StatusUnauthorized)
```

空の `realm`、空の `acrValues` スライス、`nil` の `maxAge` はそれぞれ省略され、必須の `error="insufficient_user_authentication"` は常に含まれます。`acrValues` は `acr_values` リクエストパラメータと同じく、スペース区切りの引用符付き 1 文字列にエンコードされます。

## ワンタイムの認証要素は単回使用

メール OTP（`op.StepEmailOTP`）、TOTP（`op.StepTOTP`）、recovery code（`op.StepRecoveryCode`）は、並行処理のもとでも単回使用です。同じコードが 2 度受理されることはありません。store は atomic な compare-and-set でこれを強制し、再提示には `ErrAlreadyConsumed` を返します。同じコードを提示した 2 つの競合リクエストが、両方とも成功することはありません。[認証要素ストアを自前で実装](/ja/use-cases/byo-store)する場合は、これらの消費操作を CAS にする必要があります（in-memory のリファレンス実装が形を示しています）。

終端の認証要素の失敗は、500 ではなく **HTTP 400** で返ります。期限切れまたは消費済みのワンタイムコード、ロックアウト、必須のリセット、再送回数の超過、すでに確定した subject と別の subject を指す結果、ユーザ検証なしで完了した AAL3 の認証要素が該当します。サーバ障害ではなく送信内容に起因する状態であり、ユーザは新しい試行を始められます。

recovery code の prompt の `AttemptsRemaining` は、失敗した提出をあと何回許容するかを表す残り回数です。未使用の recovery code の数ではないため、ドライバはこの値から残りのコード数を推測しないでください。

## 監査記録

認証要素の結果は、`op.Audit*` カタログのイベントとして発行されます。primary の認証要素には `op.AuditLoginSuccess` と `op.AuditLoginFailed`、追加の認証要素（再利用されたセッション上のステップアップを含む）には `op.AuditMFASuccess` と `op.AuditMFAFailed` が使われます。ロックアウトやリセット必須の状態を引き起こした推測は失敗として記録されます。ロックされたままの間の拒否は、ログイン失敗には数えられません。認証要素をまたぐロックアウトカウンタの競合で、失敗した試行がカウントされずに中断された場合は `op.AuditLockoutStalled` です。

`op.AuditMFARequired`、`op.AuditStepUpRequired`、`op.AuditStepUpSuccess` は予約されたカタログ名で、OP は発行しません。`mfa.*` イベントは、再試行を二重に数えることなく同じ情報を伝えます。

各イベントは解決した `factor`（`password`、`totp`、`passkey` など）を `extras` に載せ、`op.WithAuditLogger`（`*slog.Logger`）経由で流れます。発行は request goroutine 上で同期的に行われるため、handler はブロックせず、並行呼び出しに安全にしてください。

## 同梱のステップ

ライブラリは一般的な認証要素向けに、すぐ使えるステップを同梱しています。

| Step | 検証対象 | ストレージ interface |
|---|---|---|
| `op.PrimaryPassword` | ユーザ名 / email + パスワード | `store.UserPasswords()` |
| `op.PrimaryPasskey` | WebAuthn / パスキーを primary の認証要素として | `store.Passkeys()` |
| `op.StepTOTP` | RFC 6238 TOTP、AES-256-GCM 静止時暗号化 | `store.TOTPs()` |
| `op.StepEmailOTP` | メール配信 one-time code | `store.EmailOTPs()` |
| `op.StepRecoveryCode` | 単発 recovery code | `store.RecoveryCodes()` |
| `op.StepCaptcha` | hCaptcha / Turnstile / 自前 verifier | n/a |

各ステップの**ストレージ**は組み込み側の責任です。ライブラリはユーザレコードもパスワードハッシュも所有しません。リファレンスの `inmem` アダプタは、例とテストには十分です。本番では、既存のユーザテーブルに合わせて `op/store/*` のサブストアを実装してください。

組み込みのステップがない認証要素は、`op.Authenticator` を実装して、ドット形式の `KindLabel` を付けた `op.ExternalStep` で包みます。手順は [カスタム認証器](/ja/use-cases/custom-authenticator) にあります。

アカウント管理の画面では、credential record を自作せず companion package を使います。[`op/passkeykit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/passkeykit) はログイン時の `PrimaryPasskey` と同じ設定から WebAuthn の登録 ceremony を実行します。[`op/recoverykit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/recoverykit) は recovery code batch を作成・置換します。`Result.Codes` は 1 回だけ表示し、保存もログ出力もしません。`LoginFlow` ではなく `WithAuthenticators` を使う場合は、`op.NewEmailOTPAuthenticator(op.EmailOTPConfig{...})` で低レイヤの email-OTP authenticator を組み立てます。[`28-email-otp-recovery`](https://github.com/libraz/go-oidc-provider/tree/main/examples/28-email-otp-recovery) と [`29-passkey`](https://github.com/libraz/go-oidc-provider/tree/main/examples/29-passkey) を参照してください。

::: warning passkey には IP ではなくドメインが要る
WebAuthn の Relying Party ID はドメイン名でなければならず、ブラウザは IP リテラルを RP ID として受け付けません。そのため `http://127.0.0.1` で開発している OP には、対にできる RP ID が存在しません。issuer を `localhost` にした上で [`op.WithAllowLocalhostLoopback()`](/ja/reference/options) を指定してください。このオプションは redirect URI だけでなく issuer にも文字列の `localhost` を許可します。緩和が許されるのは開発マシンの中だけで、本番の RP は https の後ろに置きます。

`op.PrimaryPasskey` に `AAGUIDAllowlist` を設定すると、登録 ceremony は `direct` の attestation conveyance に切り替わります。attestation のない AAGUID は自己申告にすぎず、ソフトウェア authenticator が承認済みのモデルを名乗るだけで登録できてしまうためです。そのため allowlist には `AttestationRoots`（attestation 証明書チェーンのトラストアンカー。OP は FIDO MDS を取得しません）が必須で、roots のない allowlist は `op.New` が拒否します。ユーザエージェントの attestation プロンプトが出ることを想定してください。チェーンを検証できない登録は、allowlist と照合されずに拒否されます。プロンプトの出ない ceremony を保つには allowlist を空のままにします。

`RequireUserVerification: true` は passkey の登録とログインの両方に適用されます。PIN や biometric などの user-verification gesture が必要で、presence-only の登録や assertion は拒否されます。登録時の credential がログインでも使えるように、`op/passkeykit` に渡す設定と `op.PrimaryPasskey` を共有してください。
:::

## TOTP の登録（enrolment）

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
