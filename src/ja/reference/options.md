---
title: オプション一覧
description: op.New に渡せる公開オプションを 1 ページに集約。何を設定し、どのページで深掘りされているか。
outline: 2
pageClass: pg-reference-options
---

# オプション一覧

`op.New` に渡せる公開オプションを、設定対象ごとに分類しました。`WithIssuer`、`WithStore`、`WithKeyset` は常に必須です。`WithCookieKeys` と、ログインの仕組み（`WithLoginFlow` または `WithAuthenticators`）は `authorization_code` grant を有効にしている場合に必須で、既定 grant 集合では有効です。それ以外は既定を上書きする任意オプションです。

::: tip このページの読み方
オプション名のリンクから詳細ページに進めます。「セクション」列は、そのオプションが影響する discovery 文書やエンドポイントの範囲を示します。「既定」が空欄のオプションは組み込みの初期値を持っておらず、明示的に渡したときだけ機能が有効になります。
:::

## どのオプションが必要か

このページは、`op.New` に渡せる公開オプションを並べた一覧です。70 以上のオプションがあるため、目的が決まった状態で表を眺めると目的の項目を探しにくいことがあります。下の判定図で関連する領域を見つけ、表の該当セクションへ進んでください。

<figure class="fig">
  <div class="fig-head">まず全体を左右するオプションから</div>
  <svg class="fig-svg" role="img" aria-labelledby="options-decision-title" viewBox="0 0 960 432" xmlns="http://www.w3.org/2000/svg">
    <title id="options-decision-title">設定の目的を、それを担う op.New のオプションへ振り分ける判定図の前半。新規に OP を立ち上げる、FAPI のプロファイルを有効化する、機能を 1 つ有効化する、のいずれか。どれにも当たらなければ次の図へ進みます。</title>
    <!-- row 1 -->
    <rect class="fg-box" x="32" y="24" width="392" height="72" rx="8"/>
    <text class="fg-s" x="48" y="52">OP を新規に立ち上げる</text>
    <text class="fg-xs" x="48" y="76">まだ何も動いていない段階</text>
    <path class="fg-edge" d="M424,60 H536" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="50" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--accent" x="536" y="24" width="392" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="552" y="52">必須オプション</text>
    <text class="fg-xs" x="552" y="76">issuer · store · keyset · cookie 鍵 · ログイン</text>
    <path class="fg-edge fg-edge--thin" d="M228,96 V136" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="240" y="121">いいえ</text>
    <!-- row 2 -->
    <rect class="fg-box" x="32" y="136" width="392" height="72" rx="8"/>
    <text class="fg-s" x="48" y="164">FAPI 2.0 を 1 行で有効化する</text>
    <text class="fg-xs" x="48" y="188">個別の設定ではなくプロファイル全体が欲しい</text>
    <path class="fg-edge" d="M424,172 H536" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="162" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--accent" x="536" y="136" width="392" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="552" y="164">WithProfile(…)</text>
    <text class="fg-xs" x="552" y="188">プロファイルの設定を一括で適用する</text>
    <path class="fg-edge fg-edge--thin" d="M228,208 V248" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="240" y="233">いいえ</text>
    <!-- row 3 -->
    <rect class="fg-box" x="32" y="248" width="392" height="72" rx="8"/>
    <text class="fg-s" x="48" y="276">プロファイルなしで機能を 1 つ有効化する</text>
    <text class="fg-xs" x="48" y="300">PAR、JAR、JARM、grant management など</text>
    <path class="fg-edge" d="M424,284 H536" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="274" text-anchor="middle">はい</text>
    <rect class="fg-box" x="536" y="248" width="392" height="72" rx="8"/>
    <text class="fg-m" x="552" y="276">WithFeature(…)</text>
    <text class="fg-xs" x="552" y="300">機能 1 つを単独で有効にする</text>
    <path class="fg-edge fg-edge--thin" d="M228,320 V360" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="240" y="345">いいえ</text>
    <!-- fall through -->
    <rect class="fg-box fg-box--muted" x="32" y="360" width="392" height="48" rx="8"/>
    <text class="fg-s" x="48" y="388">まだ当てはまらない場合は下へ</text>
  </svg>
  <figcaption class="fig-note">プロファイルは後段の設定をいくつか自動的に確定させるため、機能の質問より先にプロファイルの質問をします。</figcaption>
</figure>

<figure class="fig">
  <div class="fig-head">次に grant・送信者制約・トークン形式を絞る</div>
  <svg class="fig-svg" role="img" aria-labelledby="options-decision-2-title" viewBox="0 0 960 432" xmlns="http://www.w3.org/2000/svg">
    <title id="options-decision-2-title">判定図の後半。/token が受け付ける grant を絞る、送信者制約を加える、アクセストークンの形式を選ぶ、のいずれか。どれにも当たらなければ下の全オプション表へ進みます。</title>
    <!-- row 1 -->
    <rect class="fg-box" x="32" y="24" width="392" height="72" rx="8"/>
    <text class="fg-s" x="48" y="52">/token が受け付ける grant を絞る</text>
    <text class="fg-xs" x="48" y="76">例: client credentials は発行しない</text>
    <path class="fg-edge" d="M424,60 H536" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="50" text-anchor="middle">はい</text>
    <rect class="fg-box" x="536" y="24" width="392" height="72" rx="8"/>
    <text class="fg-m" x="552" y="52">WithGrants(…)</text>
    <text class="fg-xs" x="552" y="76">列挙外の grant は拒否される</text>
    <path class="fg-edge fg-edge--thin" d="M228,96 V136" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="240" y="121">いいえ</text>
    <!-- row 2 -->
    <rect class="fg-box" x="32" y="136" width="392" height="72" rx="8"/>
    <text class="fg-s" x="48" y="164">送信者制約付きアクセストークンにする</text>
    <text class="fg-xs" x="48" y="188">漏れたトークン単体では使えない状態にしたい</text>
    <path class="fg-edge" d="M424,172 H536" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="162" text-anchor="middle">はい</text>
    <rect class="fg-box" x="536" y="136" width="392" height="72" rx="8"/>
    <text class="fg-m" x="552" y="164">WithFeature(DPoP) · WithFeature(MTLS)</text>
    <text class="fg-xs" x="552" y="188">どちらでも両方でも。各クライアントが選ぶ</text>
    <path class="fg-edge fg-edge--thin" d="M228,208 V248" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="240" y="233">いいえ</text>
    <!-- row 3 -->
    <rect class="fg-box" x="32" y="248" width="392" height="72" rx="8"/>
    <text class="fg-s" x="48" y="276">JWT と opaque のどちらにするか決める</text>
    <text class="fg-xs" x="48" y="300">audience 単位で決める判断</text>
    <path class="fg-edge" d="M424,284 H536" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="274" text-anchor="middle">はい</text>
    <rect class="fg-box" x="536" y="248" width="392" height="72" rx="8"/>
    <text class="fg-m" x="552" y="276">WithAccessTokenFormat(…)</text>
    <text class="fg-xs" x="552" y="300">失効の到達範囲とレイテンシの取引</text>
    <path class="fg-edge fg-edge--thin" d="M228,320 V360" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="240" y="345">いいえ</text>
    <!-- fall through -->
    <rect class="fg-box fg-box--muted" x="32" y="360" width="392" height="48" rx="8"/>
    <text class="fg-s" x="48" y="388">どれにも当てはまらない — 下の全オプション表へ</text>
  </svg>
  <figcaption class="fig-note">2 つの図を上から下へ読む順序が、そのまま設定する順序でもあります。当てはまらないものは下の全オプション表にあります。</figcaption>
</figure>

- **これから新規に OP を立ち上げる** → まず [`WithIssuer`](/ja/getting-started/required-options#withissuer)、[`WithStore`](/ja/getting-started/required-options#withstore)、[`WithKeyset`](/ja/getting-started/required-options#withkeyset)、[`WithCookieKeys`](/ja/getting-started/required-options#withcookiekeys)、[`WithLoginFlow`](/ja/getting-started/required-options#withloginflow) を渡します。後ろの 2 つは `authorization_code` grant が有効な場合に必須で、既定 grant 集合では有効です。詳しくは[必須オプション](/ja/getting-started/required-options) と[最小 OP の組み立て](/ja/use-cases/minimal-op)。
- **FAPI を採用せず OAuth 2.1 の姿勢を明示したい** → 本ライブラリの `WithProfile(profile.Baseline)` はすべての authorization-code request に PKCE を要求し、それ以外は OIDC Core の既定を保ちます。FAPI 2.0 には本ライブラリの `profile.FAPI2Baseline`（または `profile.FAPI2MessageSigning`、`profile.FAPICIBA`）を使います。これらのプロファイルは mTLS が明示されていなければ DPoP を既定選択します。プロファイルが必要とする grant が組み込まれていない場合、OP はエンドポイントを勝手に mount せず `op.New` が失敗します（`profile.FAPICIBA` は `grant.CIBA` を必要とします）。[ユースケース: セキュリティプロファイルの宣言](/ja/use-cases/security-profile)、[ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline)、[ガイド: FAPI](/ja/concepts/fapi) を参照。
- **プロファイル全体ではなく、機能を 1 つだけ有効にしたい** → `WithFeature(feature.PAR)` / `JAR` / `JARM` / `DPoP` / `MTLS` / `Introspect` / `Revoke`。public / native client は常に PKCE 必須で、FAPI プロファイル下ではすべての認可コードクライアントに PKCE が必須です。Dynamic Registration、RAR、Grant Management は追加設定が必要なので、それぞれ専用オプションから有効化します。
- **`/token` で受け付ける grant の集合を絞りたい** → `WithGrants(grant.AuthorizationCode, grant.RefreshToken, grant.ClientCredentials, grant.DeviceCode, grant.CIBA)`。`WithDeviceCodeGrant()` / `WithCIBA(...)` / `WithCustomGrant(...)` / `RegisterTokenExchange(...)` は、それぞれ追加で必要なエンドポイントもまとめて公開します。
- **送信者制約付きのアクセストークンにしたい** → DPoP 系: `WithFeature(feature.DPoP)` + 必要に応じて `WithDPoPNonceSource(op.NewInMemoryDPoPNonceSource(...))`。mTLS 系: `WithFeature(feature.MTLS)` + 必要に応じて `WithMTLSProxy(headerName, trustedCIDRs)`。詳しくは[ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint)、[DPoP](/ja/concepts/dpop)、[mTLS](/ja/concepts/mtls)、[ユースケース: DPoP nonce](/ja/use-cases/dpop-nonce)。
- **アクセストークンを JWT / opaque で切り替えたい** → OP 全体の既定は `WithAccessTokenFormat(...)`、RFC 8707 リソースごとに分けたいときは `WithAccessTokenFormatPerAudience(...)`。[ガイド: アクセストークンの形式](/ja/concepts/access-token-format) を参照。
- **sector ごとに pairwise `sub` にしたい** → `WithPairwiseSubject(salt)`(32 byte 以上の salt)。[ユースケース: pairwise subject](/ja/use-cases/pairwise-subject) を参照。
- **起動時にクライアントを静的に投入したい** → `WithStaticClients(op.PublicClient(...), op.ConfidentialClient(...), op.PrivateKeyJWTClient(...))`。[ガイド: クライアントの種類](/ja/concepts/client-types) を参照。
- **Dynamic Client Registration を使いたい** → `WithDynamicRegistration(...)`。[ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) を参照。
- **introspection / revocation エンドポイントを公開したい** → `WithFeature(feature.Introspect)` および / または `WithFeature(feature.Revoke)`。細かな調整は下の「プロファイル / feature / grant」表を参照。
- **scope カタログを拡張したい** → discovery に出す scope は `WithScope(op.PublicScope("name", "label"))`、内部用は `WithScope(op.InternalScope("name"))`。[ガイド: scope と claim](/ja/concepts/scopes-and-claims)、[ユースケース: scope](/ja/use-cases/scopes) を参照。
- **独自の `grant_type` を追加したい** → `WithCustomGrant(handler)`。[ユースケース: custom grant](/ja/use-cases/custom-grant) を参照。
- **i18n(国際化)対応をしたい** → `WithDefaultLocale(...)`、`WithLocale(bundle)`、`WithPreferredLocaleStore(...)`。[ユースケース: i18n](/ja/use-cases/i18n) を参照。
- **JWE request object を復号したい** → OP が受け取る JWE の鍵に `WithEncryptionKeyset(...)` を指定し、必要なら `WithSupportedEncryptionAlgs(algs, encs)` で既定の許可リストを狭めます。外向きの JWE 応答は受信側 client の JWKS の鍵で暗号化します。[ユースケース: JWE 暗号化](/ja/use-cases/jwe-encryption) を参照してください。
- **SPA クライアント向けに CORS を開けたい** → `WithCORSOrigins(...)`。[ユースケース: SPA 向け CORS](/ja/use-cases/cors-spa) を参照。
- **Prometheus メトリクスを出したい** → `WithPrometheus(registry)`。ライブラリは `/metrics` を公開しないため、ハンドラの公開はルータ側で行います。[ユースケース: Prometheus メトリクス](/ja/use-cases/prometheus) を参照。
- **監査ログをアプリログとは別の出力先に流したい** → `WithAuditLogger(*slog.Logger)`。[Audit イベントカタログ](/ja/reference/audit-events) を参照。
- **SPA 向けに対話レイヤをまるごと差し替えたい** → `WithInteractionDriver(interaction.Driver)`。[ユースケース: SPA 向け対話のカスタマイズ](/ja/use-cases/spa-custom-interaction) を参照。

## 必須と条件付き必須

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| [`WithIssuer`](/ja/getting-started/required-options#withissuer) | `string` | discovery `issuer` / JWT `iss` / cookie scope | — |
| [`WithStore`](/ja/getting-started/required-options#withstore) | `store.Store` | プロトコル状態のすべてのサブストア | — |
| `WithUserStore` | `store.UserStore` | `WithStore` のバックエンドをラップせず、アプリケーション所有の user store から ID トークンと `/userinfo` の claim を読む | `WithStore(...).Users()` |
| [`WithKeyset`](/ja/getting-started/required-options#withkeyset) | `op.Keyset`(P-256 / ES256) | JWKS / JWS 署名 | — |
| [`WithCookieKeys`](/ja/getting-started/required-options#withcookiekeys) | 32 byte の鍵 | session / CSRF cookie の AES-256-GCM | `authorization_code` 有効時に必須 |
| [`WithLoginFlow`](/ja/getting-started/required-options#withloginflow)（または `WithAuthenticators`） | `op.LoginFlow` | ユーザのサインイン方法 | `authorization_code` 有効時に必須 |

## プロファイル / feature / grant

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithProfile` | `profile.Profile` | 本ライブラリの `profile.Baseline`（OAuth 2.1: すべての authorization-code request に PKCE）または FAPI プロファイルを宣言。FAPI プロファイルでは mTLS が明示されていない場合に DPoP を既定の送信者制約方式として選択。プロファイルが要求する feature は自動で有効化されるが、**grant** が足りない場合は `op.New` が失敗し、有効化に必要なオプション名をエラーが示す。 | なし |
| `WithFeature` | `feature.Flag`(1 呼び出しで 1 つ、繰り返し可) | PAR / DPoP / mTLS / JAR / JARM / introspect / revoke を個別に有効化 | 控えめな既定 |
| `WithGrants` | `...grant.Type`(可変長) | `/token` で受け付ける grant を限定。呼び出せるのは 1 回だけなので、複数の helper から option を合成する場合は渡す前に grant 集合をまとめてください | `authorization_code`、`refresh_token` |
| `WithScope` | `op.Scope`(1 呼び出しで 1 つ。`op.PublicScope` / `op.InternalScope` コンストラクタを利用) | scope カタログを拡張 | `openid`、`profile`、`email`、`address`、`phone`、`offline_access` |
| `WithOpenIDScopeOptional` | _(引数なし)_ | OAuth 2.0 単独（`scope` に `openid` を含まない）を許容 | `openid` 必須 |
| `WithStrictOfflineAccess` | _(引数なし)_ | `refresh_token` の発行を `offline_access` の同意取得時に限定 | 緩やかな既定（`openid` が付与されれば発行） |

## クライアント / 登録

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithStaticClients` | `...op.ClientSeed`(`op.PublicClient` / `op.ConfidentialClient` / `op.PrivateKeyJWTClient` を渡す) | 起動時にクライアントレジストリを初期投入。`client_id` の重複、`Secret` も `SecretHash` もない `ConfidentialClient`、`jwks` と `jwks_uri` を両方持つシードは `op.New` が拒否する | 空 |
| `WithHighEntropyClientSecrets` | _(引数なし)_ | OP 全体の client-secret 検証を high-entropy keyed-hash 形式へ切り替える。既存の Argon2 client hash は後から変換できないため、有効化前に全クライアントを再プロビジョニングする | Argon2 互換の client secret |
| `WithFirstPartyClients` | `...string`(client ID) | ファーストパーティ同意スキップの対象 | なし |
| `WithDynamicRegistration` | `op.RegistrationOption` | `/register` を公開（RFC 7591 / 7592） | 無効 |

## 認証 / LoginFlow

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithLoginFlow` | `op.LoginFlow` | `Step` + `Rule` の宣言的 DAG(推奨)。`LoginFlow.Primary` は subject を確定させる step でなければならない。`PrimaryPasskey`・`StepTOTP`・`StepEmailOTP`・`StepRecoveryCode` は既知の subject を前提とするため、subject を確定する primary の後に `Rule` の step として置く。違反すると `op.New` が失敗する | なし |
| `WithAuthenticators` | `...op.Authenticator`(可変長) | 低レイヤ API(`WithLoginFlow` とは排他) | なし |
| `WithInteractionDriver` | `interaction.Driver` | 対話レイヤのトランスポート全体を差し替え（HTML ドライバ / SPA ドライバ / 独自実装） | 同梱の HTML ドライバ |
| `WithInteractions` | `...op.Interaction`(可変長) | ドライバの上に重ねる、資格情報以外の追加画面（T&C、KYC など）。`consent` と `chooser` は組み込み画面の名前で、この名前の要素は `op.New` が拒否する | consent のみ |
| `WithCaptchaVerifier` | `op.CaptchaVerifier` | `StepCaptcha` の上流 captcha プロバイダ | なし |
| `WithRiskAssessor` | `op.RiskAssessor` | risk score の供給元。`WithAuthenticators` では factor 前後、`WithLoginFlow` では flow assessor として chain ごとに 1 回実行される。non-nil な `LoginFlow.Risk` と同時に設定すると `op.New` が失敗する | なし |
| `WithLoginAttemptObserver` | `op.LoginAttemptObserver` | `RuleAfterFailedAttempts` 用の失敗回数集計 | なし |
| `WithMFAEncryptionKeys` | 32 byte の鍵 | TOTP シークレットを AES-256-GCM で保存時暗号化 | なし |
| `WithAuthnLockoutStore` | `store.AuthnLockoutStore` | `RuleAfterFailedAttempts` が参照する subject 単位の失敗回数を永続化 | なし |
| `WithACRPolicy` | `op.ACRPolicy`(interface) | ステップアップの acr / aal マッピング | identity |

`WithAuthnLockoutStore` を未設定のままにすると cross-factor 追跡は無効になり、TOTP / email-OTP それぞれの標準カウンタだけが働きます。設定すると、組み込みの possession / recovery factor（`StepTOTP`、`StepEmailOTP`、`StepRecoveryCode`）で cross-factor 追跡が有効になります。primary password / passkey や `ExternalStep` の custom factor は自動では包まれず、組み込み側の user store または custom authenticator の責務です。SQL と DynamoDB adapter はどちらも `AuthnLockouts()` から耐久 store を公開します。`inmem.Store.AuthnLockouts()` はプロセスローカルで、再起動時にリセットされます。

認証 factor のレコードは意図的に `store.Store` の外にあります。`StepTOTP` / `PrimaryPasskey` / `StepRecoveryCode` / `StepEmailOTP` はそれぞれ専用 store を受け取ります。登録スキーマ、暗号鍵、アカウント復旧ポリシーは組み込みアプリケーション側の設計だからです。in-memory、SQL、DynamoDB adapter は対応する accessor を公開します。[`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) は、同梱 SQL adapter の factor store を OP のコアテーブルと同じ DB で使う例です。別のバックエンドでだけ factor-store 契約を自前実装してください。

TOTP と email-OTP の `Version` は store が発行する opaque な equality-only CAS token です。順序性を推測したり自前で生成したりせず、stale な CAS は consumed / stale error として扱います。`PasskeyStore.Put` は異なる subject の同じ credential ID を atomically に拒否し、credential を別 subject へ移してはなりません。

耐久 store 実装者向けに重要な factor-store 契約が 2 つあります。`store.EmailOTPStore.Get` は code の `ExpiresAt` だけでなく `EmailOTPRecord.RetainUntil` までは record を読める状態に保つ必要があります。これにより、code が失効しても resend cap と brute-force counter はリセットされません。`store.RecoveryStore.Consume` は、提示された code hash と現在保存されている slot の hash を比較し、古い hash を拒否する必要があります。recovery code を再生成した後に、漏洩済みの古い code が新しい batch の slot を消費するのを防ぐためです。

## UI

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithSPAUI` | `op.SPAUI`(構造体: `LoginMount` / `ConsentMount` / `LogoutMount` / `StaticDir`) | SPA の入口と静的アセット一式を OP 側で公開し、interaction の状態も JSON で提供。route になるのは `LoginMount` だけで、`ConsentMount` と `LogoutMount` は互換性のため検証されるだけの inert / deprecated field | 無効 |
| `WithConsentUI` | `op.ConsentUI`(`*html/template.Template` をラップ) | 同意画面を組み込み側テンプレートで描画。state / CSRF / 永続化は OP が担当 | 同梱テンプレート |
| `WithChooserUI` | `op.ChooserUI`(`*html/template.Template` をラップ) | `prompt=select_account` を組み込み側テンプレートで描画 | 同梱テンプレート |
| `WithCORSOrigins` | `...string` | API CORS に追加する明示 origin。redirect URI の origin は API CORS 用には自動導出されるが、interaction と end-session の ceremony check は issuer origin + この明示リストだけを許可 | API route は自動導出、ceremony は issuer のみ |
| `WithDefaultLocale` | `op.Locale`(BCP 47 タグ) | canonical BCP 47 の既定 UI locale。未登録の default は `op.New` が拒否 | `"en"` |
| `WithLocale` | `op.LocaleBundle`(1 呼び出しで 1 つ、繰り返し可) | 同梱 HTML ドライバ用のロケール別メッセージバンドルを登録 | 英語 + 日本語の初期バンドル |
| `WithPreferredLocaleStore` | `op.PreferredLocaleStore` | §L.2 優先順序の先頭で参照されるユーザ単位ロケール上書き | なし |

`WithSPAUI` と `WithConsentUI` は相互排他です。どちらも同意画面の描画を受け持つためです。`WithSPAUI.LoginMount` だけが SPA route になり、`ConsentMount` と `LogoutMount` は route を予約しません。同意画面は login interaction state surface を使い、組み込み logout confirmation は通常の end-session flow に残ります。`WithChooserUI` は `WithSPAUI` と同時指定できますが、SPA モードではアカウント選択も JSON の状態取得を通じて SPA が描画します。そのため chooser テンプレートは使われず、`op.New` が構造化された警告を出します。詳細は [カスタムアカウントチューザ UI](/ja/use-cases/custom-chooser-ui) を参照してください。

ceremony の origin は issuer と same-site でなければなりません。`login.example.com` と `op.example.com` のような issuer の sibling は、ここに列挙すれば利用できますが、完全に別サイトの origin は CORS header を受け取っても interaction / end-session ceremony は動きません。`__Host-` cookie が `SameSite` の制約で送信されず、endpoint が 404 を返すためです。UI は issuer 自身か same-site の sibling host に置いてください。cookie 属性は変更できません。

`WithLocale` は locale tag を小文字・ハイフン区切りの canonical BCP 47 形式にします。`Provider.SetLocaleCookie(w, locale)` と `Provider.ClearLocaleCookie(w)` が公開 cookie seam です。`SetLocaleCookie` は exact match と language-only fallback を解決し、登録済み locale に一致しなければ `op.ErrLocaleNotRegistered` を返します。cookie は `__Host-oidc_locale`、Secure、HttpOnly、SameSite=Lax で、login session とは独立しています。

## トークン

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithAccessTokenFormat` | `op.AccessTokenFormat`(`AccessTokenFormatJWT` / `AccessTokenFormatOpaque`) | OP 全体で JWT / opaque を選択 | JWT |
| `WithAccessTokenFormatPerAudience` | `map[string]op.AccessTokenFormat`(RFC 8707 リソース → 形式) | audience ごとに形式を切り替え | OP 全体の値 |
| `WithAccessTokenRevocationStrategy` | `op.AccessTokenRevocationStrategy`(`RevocationStrategyGrantTombstone` / `RevocationStrategyJTIRegistry` / `RevocationStrategyNone`) | 発行済 JWT アクセストークンの失効ポリシー。既定の `GrantTombstone` は `Store.GrantRevocations()`、`JTIRegistry` は `Store.AccessTokens()` を必須とし、いずれも `op.New` で検査される | grant tombstone |
| `WithAccessTokenTTL` | `time.Duration` | アクセストークンの寿命 | 5 分 |
| `WithRefreshTokenTTL` | `time.Duration` | 通常のリフレッシュトークンの寿命 | 30 日 |
| `WithRefreshTokenOfflineTTL` | `time.Duration` | `offline_access` が付与されたときのリフレッシュトークンの寿命 | `WithRefreshTokenTTL` を継承（ゼロ値で延長しない） |
| `WithRefreshGracePeriod` | `time.Duration`(0 で無効化、負値は拒否。本ライブラリの FAPI 2.0 profile では 0〜60 秒) | ローテーション後の猶予期間 | 60 秒 |
| `WithDPoPNonceSource` | `op.DPoPNonceSource`(interface) | サーバ供給の DPoP nonce ストア（`op.NewInMemoryDPoPNonceSource` が同梱実装） | なし |

`WithInMemoryDPoPNonceLogger` は `op.New` ではなく `op.NewInMemoryDPoPNonceSource` に渡す補助オプションです。同梱の in-memory nonce source を使う場合だけ指定します。

本ライブラリの `profile.FAPI2Baseline` または `profile.FAPI2MessageSigning` では、リフレッシュの猶予期間に 60 秒の上限があります。0〜60 秒の明示値は受理され、60 秒を超える値は構築時エラーになります。profile が 0 を強制するわけではなく、option を省略すれば既定の 60 秒になります。これはライブラリの設定上限であり、現行 FAPI 仕様への適合条件ではありません。Security Profile §5.3.2.1(9) は、例外的な状況を除く通常のリフレッシュトークンローテーションを禁止しています。これらの profile 以外では、負でない duration を指定できます。

`WithAccessTokenFormat` と `WithAccessTokenFormatPerAudience` が制御するのは、組み込み grant path が発行するアクセストークンです。custom grant の `BoundAccessToken` は、どちらの option を指定しても常に RFC 9068 JWT として mint されます。custom grant で opaque 値が必要な場合は、handler 自身で mint して `AccessToken` として返してください。送信者制約付きにしたい場合も、`cnf` は handler 自身が付与します。

認可コードおよびその refresh chain から発行される JWT アクセストークンには、`userinfo_claims` という private claim が入ります。値は OIDC `claims` リクエストの `userinfo` メンバーで、リクエストになければ `{}` です。`/userinfo` はこの claim から返す claim を決めます。リソースサーバは無視してかまいません。この名前は予約済みで、custom grant の extra claims からは設定できません。

## Discovery / エンドポイント

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithEndpoints` | `op.Endpoints`(構造体: 各エンドポイントのパス上書き) | 各エンドポイントのパスを上書き | 仕様の既定 |
| `WithMountPrefix` | `string`(`/` で始める。ルートに置くなら `/`) | プロトコルエンドポイントに issuer 相対のパス接頭辞を設定。discovery のパスは issuer から別に決まる | `/oidc` |
| `WithClaimsSupported` | `...string`(可変長) | discovery の `claims_supported` を埋める | 省略 |
| `WithClaimsParameterSupported` | `bool` | `claims_parameter_supported` を切り替える。`false` の場合、malformed JSON は拒否するが、正しい `claims` payload の投影は抑止して authorize / PAR では無視する | true |
| `WithACRValuesSupported` | `...string`(可変長) | `acr_values_supported` を公開。空でない場合、同じ許可リストを `/auth`、`/par`、CIBA の `/bc-authorize` でも強制する | 空（discovery に出ず、許可リストなし） |
| `WithDiscoveryMetadata` | `op.DiscoveryMetadata`(型付きの `service_documentation` / policy / TOS / UI locale / mTLS alias フィールド + `Extra map[string]any`) | OP が所有しない RFC 8414 / OIDC Discovery メタデータを discovery 文書に追加。`UILocalesSupported` は非空時に自動導出された locale list を上書きし、OP 管理フィールドと衝突する `Extra` key は拒否 | なし |
| `WithPARLifetime` | `time.Duration` | `/par` が発行する `request_uri` の寿命を上書き。失効判定はブラウザが `/auth` に URI を提示した時点で行い、その後の code 発行では単回使用性だけを強制 | 60 秒 |
| `WithJWKSRotationActive` | `func() bool` | ローテーション期間中だけ JWKS の `Cache-Control` を短期キャッシュに切り替える述語 | 常に長期キャッシュ |

## subject 戦略

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithSubjectGenerator` | `op.SubjectGenerator`(interface) | `sub` claim の導出を上書き。同梱の `op/subject.UUIDv7` が既定。generator は各 projection で呼ばれ、同じ input に deterministic で surprise I/O を行ってはならない | UUIDv7 をそのまま使用 |
| `WithPairwiseSubject` | `[]byte` salt(32 byte 以上) | OIDC Core §8.1 の sector ごと pairwise sub 導出を有効化。途中で戦略を切り替えると `op.New` が拒否する | public(UUIDv7) |

詳細は [ユースケース: pairwise subject](/ja/use-cases/pairwise-subject)。

## grant — Device Code / CIBA / Custom / Token Exchange

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithDeviceCodeGrant` | _(引数なし)_ | RFC 8628 device-authorization grant を有効化。`/device_authorization` を公開し `/token` に URN を登録 | 無効 |
| `WithDeviceVerificationURI` | `string`(絶対 URL) | デバイス画面に表示する verification URI を上書き（既定は `<issuer>/device`） | 自動導出 |
| `WithDeviceCodeExpiry` | `time.Duration` | 新規 `device_code` レコードの `expires_in` 寿命を上書き。アクセストークン TTL とは独立 | 10 分 |
| `WithDeviceCodePollInterval` | `time.Duration` | 広告する poll `interval` を上書き。これより速い poll は `slow_down` | 5 秒 |
| `WithCIBA` | `...op.CIBAOption` | CIBA poll mode を有効化。`/bc-authorize` を公開し CIBA URN を登録。サブオプション: `WithCIBAHintResolver`(必須)、`WithCIBADefaultExpiresIn`、`WithCIBAMaxExpiresIn`、`WithCIBAPollInterval`、`WithCIBAMaxPollViolations`。負の有効期限や間隔は `op.New` が拒否する。`profile.FAPICIBA` では、既定と最大の有効期限を 10 分までに制限する | 無効 |
| `WithCustomGrant` | `op.CustomGrantHandler` | 組み込み側が定義する `grant_type` URN を `/token` に登録。custom name の重複と組み込み grant type との collision は構築時に拒否される。handler はアクセストークンをそのまま返すか、`BoundAccessToken` 要求として返して OP に署名させる | なし |
| `RegisterTokenExchange` | `op.TokenExchangePolicy` | RFC 8693 token-exchange grant を有効化。ポリシーがリクエスト単位で受理可否（admission）を判断し、OP の既定値をさらに狭めることもできる | 無効 |

device-code・CIBA・token exchange の各 grant が発行する credential は、記録された grant の配下に置かれます。そのため grant の失効、ユーザ削除、pairwise `sub` の解決がこれらにも届きます。custom grant は、handler が grant を記録した場合にだけ grant に紐づきます。custom grant 自身の refresh rotation が発行するアクセストークンは常に JWT です。

`WithDeviceCodeExpiry` と `WithDeviceCodePollInterval` は `WithAccessTokenTTL` から導出されません。アクセストークンを短命にしても、TV / CLI のペアリング手順までユーザがセカンドスクリーンに移る前に失効しないようにするためです。詳細は [ユースケース: device code](/ja/use-cases/device-code)、[CIBA](/ja/use-cases/ciba)、[Custom grant](/ja/use-cases/custom-grant)、[Token exchange](/ja/use-cases/token-exchange)。

## 認可機能 — RAR / Grant Management / Protected Resource Metadata

| オプション | 値 | 説明 | 既定 |
|---|---|---|---|
| `WithAuthorizationDetailTypes` | `...op.AuthorizationDetailType` | RFC 9396 Rich Authorization Requests を有効化。受理する `type` を validator とともに登録する。`authorization_details` は `/auth`、`/par`、`/token` で検証され、grant に永続化され、JWT アクセストークンと introspection に反映され、discovery で公開される。nil の `Validate` は `op.New` で拒否される | 無効 |
| `WithGrantManagement` | `(actions []op.GrantManagementAction, actionRequired bool)` | OAuth 2.0 Grant Management draft を有効化。`grant_management_action` / `grant_id` を処理し、query / revoke エンドポイントを公開し、token 応答に `grant_id` を載せ、設定した action 集合を discovery で公開する。Experimental（IETF draft 追跡）。1 回だけ呼べる（2 回目は `op.New` が失敗する） | 無効 |
| `WithProtectedResources` | `...op.ProtectedResource` | 登録した各リソースについて RFC 9728 protected-resource メタデータを `/.well-known/oauth-protected-resource` とリソース path の接尾辞で公開し、`authorization_servers` に issuer を載せる。`ProtectedResource.IntrospectionClients` はその resource を audience とする access token を指定 confidential caller が introspect するための委譲であり、refresh token には適用されない | なし |

`op.StepUpChallenge(realm, acrValues, maxAge)` は `op.New` のオプションではなく独立したヘルパで、組み込み側のリソースサーバが返す RFC 9470 の `WWW-Authenticate: Bearer` challenge を組み立てます。OP 自身はこれを発行しません。

詳細は [Rich authorization requests](/ja/use-cases/authorization-details)、[Grant management](/ja/use-cases/grant-management)、[Protected resource metadata](/ja/use-cases/protected-resource-metadata)、[MFA / ステップアップ](/ja/use-cases/mfa-step-up)。

## 暗号化（JWE）

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithEncryptionKeyset` | `op.EncryptionKeyset`(RSA 2048 bit 以上 / EC P-256/384/521 の秘密鍵、`use=enc`) | OP の inbound 復号用 JWK を公開し、`/auth` と `/par` の JWE request object を復号。outbound JWE 応答は受信側 client の JWKS を使う | なし |
| `WithSupportedEncryptionAlgs` | `(algs []string, encs []string)` | 既定の許可リスト（`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`）を **狭める** だけ。広げることはできない。`algs` と `encs` はそれぞれ 1 回だけ狭められる | 既定の許可リスト全体 |

詳細は [ユースケース: JWE 暗号化](/ja/use-cases/jwe-encryption)。

## mTLS / プロキシ / ネットワーク

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithMTLSRootCAs` | `*x509.CertPool` | 直接または前送りされた client certificate を OP 自身が検証するための公開 trust pool。nil は拒否 | 未設定（終端側で検証） |
| `WithMTLSProxy` | `(headerName string, trustedCIDRs []string)` | edge でヘッダ経由の mTLS を終端。trusted CIDR から来た request の forwarded certificate が正本で、`op.MTLSProxy` / `op.MTLSProxyConfig` が公開 projection seam | なし |
| `WithTrustedProxies` | `...string`(CIDR) | `X-Forwarded-*` / `Forwarded` から実クライアント IP を解決 | なし |
| `WithTrustedProxyHosts` | `...string`(hostname) | trusted proxy CIDR が設定されている場合に、正規の issuer host 以外の `X-Forwarded-Host` 許可リストを追加 | issuer host のみ |
| `WithAllowLocalhostLoopback` | _(引数なし)_ | 開発 / ネイティブアプリデモ用に RFC 8252 の loopback 緩和へ文字列 `localhost` を追加し、**issuer 自体にも** `localhost` を許可。リテラル `127.0.0.1` / `[::1]` は厳格既定のまま | リテラル loopback のみ |
| `WithAllowPrivateNetworkJWKS` | _(引数なし)_ | RFC 1918 上の client JWKS を許容（テスト専用） | 拒否 |
| `WithAllowPrivateNetworkJAR` | _(引数なし)_ | RFC 1918 上の `request_uri` を許容（テスト専用） | 拒否 |
| `WithAllowPrivateNetworkSector` | _(引数なし)_ | dynamic registration 時の `sector_identifier_uri` が RFC 1918 上にあることを許容（テスト / private RP network 専用） | 拒否 |
| `WithJWKSHTTPTransport` | `http.RoundTripper` | JAR と `private_key_jwt` が使う RP 管理 JWKS 取得の transport を差し替える。接続時の SSRF 判定は維持される | システム trust の transport |
| `WithBackchannelAllowPrivateNetwork` | `bool` | RFC1918、loopback、link-local、ULA の `backchannel_logout_uri` 宛先への配送を明示的に許可。既定 deny は production SSRF 境界なので、明確な network policy がある場合だけ opt in | false（deny） |
| `WithAllowInsecureBackchannelLogoutForDev` | _(引数なし)_ | dev / CI fixture 用に plain-HTTP loopback の `backchannel_logout_uri` と配送を許容 | 拒否 |
| `WithBackchannelLogoutHTTPClient` | `*http.Client` | Back-Channel ログアウト用の HTTP クライアント | 既定 |
| `WithBackchannelLogoutTimeout` | `time.Duration` | RP ごとの一斉通知タイムアウト | 5 秒 |
| `WithBackchannelFanOutBudget` | `time.Duration`（正値） | RP ごとの timeout とは独立した、back-channel logout 1 event 全体の fan-out budget | 30 秒 |

## 観測

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithLogger` | `*slog.Logger` | 構造化された運用ログ（handler は redaction ミドルウェアでラップされる） | discard |
| `WithAuditLogger` | `*slog.Logger` | OIDC domain business event 専用の監査 sink。HTTP access log ではない | `WithLogger` を継承 |
| `WithPrometheus` | `*prometheus.Registry` | 選定した OP counter を呼び出し側 registry に登録（`/metrics` route、HTTP lifecycle metric、health endpoint は mount しない） | なし |

## 運用方針

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithSessionDurabilityPosture` | `op.SessionDurabilityPosture` | Back-Channel Logout の監査ログに方針を注釈付け（SOC 用途） | volatile |
| `WithClock` | `op.Clock` | token の有効期限、監査レコードの timestamp、レート制限 window に使う時刻ソース（テスト用に注入） | `time.Now` |

## `op.New` が拒否する構成

必須オプションの欠落以外にも、次の組み合わせは「受け取って無視する」のではなく、`op.New` が設定エラーとして返します。

| 構成 | 拒否する理由 |
|---|---|
| `store.Store` が返す substore が typed-nil（nil ポインタを持つ interface） | 単純な `nil` 判定を通り抜け、初回利用時に panic する |
| `WithLoginFlow` と `WithAuthenticators` の併用、または `WithLoginFlow` の 2 回指定 | 1 つのプロバイダにログインの仕組みは 1 つだけ |
| `WithRiskAssessor` と非 nil の `LoginFlow.Risk` の併用 | risk の供給元が 2 つあり、どちらを使うか決める規則がない |
| すでに確定した subject を前提とする `LoginFlow.Primary` | primary の step が動く時点では subject がまだ決まっていない |
| `consent` / `chooser` という名前の `WithInteractions` 要素 | 組み込み画面の名前として予約済み |
| `WithGrantManagement` の 2 回指定、`WithSupportedEncryptionAlgs` で同じ側を 2 回狭めること | 後の呼び出しが前の設定を黙って置き換えてしまう |
| `WithSPAUI` と `WithConsentUI` の併用 | どちらも consent 画面を所有する |
| 負の `WithCIBADefaultExpiresIn` / `WithCIBAPollInterval`、`profile.FAPICIBA` で 10 分を超える CIBA の既定・最大有効期限 | 許容範囲外 |
| secret のない `ConfidentialClient` シード、`jwks` と `jwks_uri` を両方持つクライアントレコード | RFC 7591 §2 が両者の併用を禁じており、空の secret ハッシュは空の `client_secret` を受理してしまう |
| 必要な grant が有効でない `WithProfile` | エラーに、その grant を有効にするオプション名が出る |

`NewEmailOTPAuthenticator` も、typed-nil の `Mailer`・`Store`・`Users`・`Clock` を拒否します。どれも最初のリクエストまで待たずに失敗します。

## ここでは設定**しない**もの

意図的にオプションにしていない項目です。理由は各リンク先の設計判断を参照してください。

- **JOSE 検証用の許可リスト** — client assertion、JAR request object、DPoP proof など入力側の署名検証では `RS256` / `PS256` / `ES256` / `EdDSA` の固定集合を使います。本ライブラリが発行する JWT の署名は `ES256` のみです。どちらの面も広げるフラグはありません。[セキュリティ方針 §2](/ja/security/posture#jose-alg-list) を参照。
- **PKCE method** — `S256` のみ。`plain` は構造的に拒否されます。
- **Cookie scheme** — `__Host-` プリフィックス、AES-256-GCM、double-submit CSRF が常に有効です。[必須オプション § WithCookieKeys](/ja/getting-started/required-options#withcookiekeys) を参照。
- **乱数源** — `crypto/rand` のみ。`math/rand` は lint で禁止しています。
- **`/metrics` の公開** — ライブラリではなくルータ側の責務です。[ユースケース: Prometheus](/ja/use-cases/prometheus) を参照。

## このリストの裏取り

カタログはライブラリ本体のソースから取っています。自分で監査するには:

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -hE '^func (With[A-Z]|RegisterTokenExchange)' $(ls op/*.go | grep -v _test.go) | sort -u
```

出力には `WithInMemoryDPoPNonceLogger` と `...ForTest` 系も含まれますが、これらは `op.NewInMemoryDPoPNonceSource` 用のヘルパーで、`op.New` のオプションではありません。

関数名と受け取る型のシグネチャが正典であり、各関数の godoc コメントが契約の正本です。
