---
title: Options 索引
description: op.New に渡せる公開オプションを 1 ページに集約。何を設定し、どのページで深掘りされているか。
outline: 2
pageClass: pg-reference-options
---

# Options 索引

`op.New` に渡せる公開オプションを、触る対象のレイヤごとに分類しました。`WithIssuer`、`WithStore`、`WithKeyset` は常に必須です。`WithCookieKeys` は `authorization_code` grant を有効にしている場合に必須で、既定 grant 集合では有効です。それ以外は既定を上書きする任意オプションです。

::: tip このページの読み方
オプション名のリンクから詳細ページに飛べます。「セクション」列は、そのオプションが動かす Discovery 文書やエンドポイントの表面です。「既定」が空欄のオプションは組み込みの初期値を持っておらず、明示的に渡したときだけ機能が有効になります。
:::

## どのオプションが必要か

このページは、`op.New` に渡せる公開オプションを並べた索引です。70 以上のオプションがあるため、目的が決まった状態で表を眺めると目当てが探しにくいことがあります。下の決定木で関連するエリアを当てたうえで、表の対応セクションに飛んでください。

<svg class="opt-tree" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="opt-decision-title" viewBox="0 0 700 512" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="opt-decision-title">設定の目的（新規 OP / FAPI 切り替え / 単一機能 / grant 制限 / 送信者制約 / トークン形式）を、それを担う op.New オプションに振り分け、該当なしなら下の表へ導く決定木。</title>
  <rect x="24" y="24" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="54" text-anchor="middle">OP を新規に立ち上げる？</text>
  <rect class="od-sop" x="430" y="28" width="246" height="44" rx="22"/>
  <text class="od-b od-op" x="553" y="55" text-anchor="middle">必須オプション</text>
  <line x1="324" y1="50" x2="426" y2="50"/>
  <path d="M419 46 L426 50 L419 54"/>
  <text class="od-s od-t2" x="376" y="42" text-anchor="middle">はい</text>
  <line x1="174" y1="76" x2="174" y2="94"/>
  <path d="M170 87 L174 94 L178 87"/>
  <text class="od-s od-t2" x="190" y="90">いいえ</text>
  <rect x="24" y="96" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="126" text-anchor="middle">FAPI 2.0 を 1 行で有効化？</text>
  <rect class="od-sop" x="430" y="100" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="126" text-anchor="middle">WithProfile(...)</text>
  <line x1="324" y1="122" x2="426" y2="122"/>
  <path d="M419 118 L426 122 L419 126"/>
  <text class="od-s od-t2" x="376" y="114" text-anchor="middle">はい</text>
  <line x1="174" y1="148" x2="174" y2="166"/>
  <path d="M170 159 L174 166 L178 159"/>
  <text class="od-s od-t2" x="190" y="162">いいえ</text>
  <rect x="24" y="168" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="198" text-anchor="middle">機能を 1 つだけ有効化？</text>
  <rect class="od-sop" x="430" y="172" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="198" text-anchor="middle">WithFeature(...)</text>
  <line x1="324" y1="194" x2="426" y2="194"/>
  <path d="M419 190 L426 194 L419 198"/>
  <text class="od-s od-t2" x="376" y="186" text-anchor="middle">はい</text>
  <line x1="174" y1="220" x2="174" y2="238"/>
  <path d="M170 231 L174 238 L178 231"/>
  <text class="od-s od-t2" x="190" y="234">いいえ</text>
  <rect x="24" y="240" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="270" text-anchor="middle"><tspan class="od-m">/token</tspan> の grant を絞る？</text>
  <rect class="od-sop" x="430" y="244" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="270" text-anchor="middle">WithGrants(...)</text>
  <line x1="324" y1="266" x2="426" y2="266"/>
  <path d="M419 262 L426 266 L419 270"/>
  <text class="od-s od-t2" x="376" y="258" text-anchor="middle">はい</text>
  <line x1="174" y1="292" x2="174" y2="310"/>
  <path d="M170 303 L174 310 L178 303"/>
  <text class="od-s od-t2" x="190" y="306">いいえ</text>
  <rect x="24" y="312" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="342" text-anchor="middle">送信者制約付きトークン？</text>
  <rect class="od-sop" x="430" y="316" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="342" text-anchor="middle">WithFeature(DPoP|MTLS)</text>
  <line x1="324" y1="338" x2="426" y2="338"/>
  <path d="M419 334 L426 338 L419 342"/>
  <text class="od-s od-t2" x="376" y="330" text-anchor="middle">はい</text>
  <line x1="174" y1="364" x2="174" y2="382"/>
  <path d="M170 375 L174 382 L178 375"/>
  <text class="od-s od-t2" x="190" y="378">いいえ</text>
  <rect x="24" y="384" width="300" height="52" rx="6"/>
  <text class="od-b od-t1" x="174" y="414" text-anchor="middle">JWT か opaque か？</text>
  <rect class="od-sop" x="430" y="388" width="246" height="44" rx="22"/>
  <text class="od-m od-op" x="553" y="414" text-anchor="middle">WithAccessTokenFormat(...)</text>
  <line x1="324" y1="410" x2="426" y2="410"/>
  <path d="M419 406 L426 410 L419 414"/>
  <text class="od-s od-t2" x="376" y="402" text-anchor="middle">はい</text>
  <line x1="174" y1="436" x2="174" y2="454"/>
  <path d="M170 447 L174 454 L178 447"/>
  <text class="od-s od-t2" x="190" y="450">いいえ</text>
  <rect x="24" y="456" width="652" height="48" rx="6"/>
  <text class="od-b od-t1" x="350" y="484" text-anchor="middle">該当なし — 下の表をセクションごとに参照。</text>
</svg>

- **これから新規に OP を立ち上げる** → まず [`WithIssuer`](/ja/getting-started/required-options#withissuer)、[`WithStore`](/ja/getting-started/required-options#withstore)、[`WithKeyset`](/ja/getting-started/required-options#withkeyset)、そして通常は [`WithCookieKeys`](/ja/getting-started/required-options#withcookiekeys) を渡します。`WithCookieKeys` は `authorization_code` grant が有効な場合に必須で、既定 grant 集合では有効です。詳しくは[必須オプション](/ja/getting-started/required-options) と[最小 OP の組み立て](/ja/use-cases/minimal-op)。
- **FAPI を採用せず OAuth 2.1 の姿勢を明示したい** → `WithProfile(profile.Baseline)` はすべての authorization-code request に PKCE を要求し、それ以外は OIDC Core の既定を保ちます。FAPI 2.0 には `profile.FAPI2Baseline`(または `profile.FAPI2MessageSigning`、`profile.FAPICIBA`)を使います。これらのプロファイルは mTLS が明示されていなければ DPoP を既定選択します。プロファイルが必要とする grant が組み込まれていない場合、OP はエンドポイントを勝手に mount せず `op.New` が失敗します(`profile.FAPICIBA` は `grant.CIBA` を必要とします)。[使い方: セキュリティプロファイルの宣言](/ja/use-cases/security-profile)、[使い方: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline)、[ガイド: FAPI](/ja/concepts/fapi) を参照。
- **プロファイル全体ではなく、機能を 1 つだけ有効にしたい** → `WithFeature(feature.PAR)` / `JAR` / `JARM` / `DPoP` / `MTLS` / `Introspect` / `Revoke`。public / native client は常に PKCE 必須で、FAPI プロファイル下ではすべての認可コードクライアントに PKCE が必須です。Dynamic Registration、RAR、Grant Management は追加設定が必要なので、それぞれ専用オプションから有効化します。
- **`/token` で受け付ける grant の集合を絞りたい** → `WithGrants(grant.AuthorizationCode, grant.RefreshToken, grant.ClientCredentials, grant.DeviceCode, grant.CIBA)`。`WithDeviceCodeGrant()` / `WithCIBA(...)` / `WithCustomGrant(...)` / `RegisterTokenExchange(...)` は、それぞれ追加で必要なエンドポイントもまとめて公開します。
- **送信者制約付きのアクセストークンにしたい** → DPoP 系: `WithFeature(feature.DPoP)` + 必要に応じて `WithDPoPNonceSource(op.NewInMemoryDPoPNonceSource(...))`。mTLS 系: `WithFeature(feature.MTLS)` + 必要に応じて `WithMTLSProxy(headerName, trustedCIDRs)`。詳しくは[ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint)、[DPoP](/ja/concepts/dpop)、[mTLS](/ja/concepts/mtls)、[使い方: DPoP nonce](/ja/use-cases/dpop-nonce)。
- **アクセストークンを JWT / opaque で切り替えたい** → OP 全体の既定は `WithAccessTokenFormat(...)`、RFC 8707 リソースごとに分けたいときは `WithAccessTokenFormatPerAudience(...)`。[ガイド: アクセストークンの形式](/ja/concepts/access-token-format) を参照。
- **sector ごとに pairwise `sub` にしたい** → `WithPairwiseSubject(salt)`(32 byte 以上の salt)。[使い方: pairwise subject](/ja/use-cases/pairwise-subject) を参照。
- **起動時にクライアントを静的に投入したい** → `WithStaticClients(op.PublicClient(...), op.ConfidentialClient(...), op.PrivateKeyJWTClient(...))`。[ガイド: クライアントの種類](/ja/concepts/client-types) を参照。
- **Dynamic Client Registration を使いたい** → `WithDynamicRegistration(...)`。[使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) を参照。
- **introspection / revocation エンドポイントを公開したい** → `WithFeature(feature.Introspect)` および / または `WithFeature(feature.Revoke)`。細かな調整は下の「プロファイル / feature / grant」表を参照。
- **scope カタログを拡張したい** → discovery に出す scope は `WithScope(op.PublicScope("name", "label"))`、内部用は `WithScope(op.InternalScope("name"))`。[ガイド: scope と claim](/ja/concepts/scopes-and-claims)、[使い方: scope](/ja/use-cases/scopes) を参照。
- **独自の `grant_type` を生やしたい** → `WithCustomGrant(handler)`。[使い方: custom grant](/ja/use-cases/custom-grant) を参照。
- **i18n(国際化)対応をしたい** → `WithDefaultLocale(...)`、`WithLocale(bundle)`、`WithPreferredLocaleStore(...)`。[使い方: i18n](/ja/use-cases/i18n) を参照。
- **id_token / userinfo / JARM / introspection を JWE で暗号化したい** → `WithEncryptionKeyset(...)` と、必要なら既定許可リストを狭める `WithSupportedEncryptionAlgs(algs, encs)`。[使い方: JWE 暗号化](/ja/use-cases/jwe-encryption) を参照。
- **SPA クライアント向けに CORS を開けたい** → `WithCORSOrigins(...)`。[使い方: SPA 向け CORS](/ja/use-cases/cors-spa) を参照。
- **Prometheus メトリクスを出したい** → `WithPrometheus(registry)`。ライブラリは `/metrics` を公開しないため、ハンドラの公開はルーター側で行います。[使い方: Prometheus メトリクス](/ja/use-cases/prometheus) を参照。
- **監査ログをアプリログとは別の出力先に流したい** → `WithAuditLogger(*slog.Logger)`。[Audit イベントカタログ](/ja/reference/audit-events) を参照。
- **SPA 向けに対話レイヤをまるごと差し替えたい** → `WithInteractionDriver(interaction.Driver)`。[使い方: SPA 向け対話のカスタマイズ](/ja/use-cases/spa-custom-interaction) を参照。

## 必須と条件付き必須

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| [`WithIssuer`](/ja/getting-started/required-options#withissuer) | `string` | discovery `issuer` / JWT `iss` / cookie scope | — |
| [`WithStore`](/ja/getting-started/required-options#withstore) | `store.Store` | プロトコル状態のすべてのサブストア | — |
| `WithUserStore` | `store.UserStore` | `WithStore` のバックエンドをラップせず、アプリケーション所有の user store から ID トークンと `/userinfo` の claim を読む | `WithStore(...).Users()` |
| [`WithKeyset`](/ja/getting-started/required-options#withkeyset) | `op.Keyset`(P-256 / ES256) | JWKS / JWS 署名 | — |
| [`WithCookieKeys`](/ja/getting-started/required-options#withcookiekeys) | 32 byte の鍵 | session / CSRF cookie の AES-256-GCM | `authorization_code` 有効時に必須 |

## プロファイル / feature / grant

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithProfile` | `profile.Profile` | `profile.Baseline`（OAuth 2.1: すべての authorization-code request に PKCE）または FAPI プロファイルを宣言。FAPI プロファイルが DPoP-or-mTLS を要求し、mTLS が明示されていなければ DPoP を既定の送信者制約方式として選択。プロファイルが要求する feature は自動で有効化されるが、**grant** が足りない場合は `op.New` が失敗し、有効化に必要なオプション名をエラーが示す。 | なし |
| `WithFeature` | `feature.Flag`(1 呼び出しで 1 つ、繰り返し可) | PAR / DPoP / mTLS / JAR / JARM / introspect / revoke を個別に有効化 | 控えめな既定 |
| `WithGrants` | `...grant.Type`(可変長) | `/token` で受け付ける grant を限定。呼び出せるのは 1 回だけなので、複数の helper から option を合成する場合は渡す前に grant 集合をまとめてください | `authorization_code`、`refresh_token` |
| `WithScope` | `op.Scope`(1 呼び出しで 1 つ。`op.PublicScope` / `op.InternalScope` コンストラクタを利用) | scope カタログを拡張 | `openid`、`profile`、`email`、`address`、`phone`、`offline_access` |
| `WithOpenIDScopeOptional` | _(引数なし)_ | OAuth 2.0 単独(`scope` に `openid` を含まない)を許容 | `openid` 必須 |
| `WithStrictOfflineAccess` | _(引数なし)_ | `refresh_token` の発行を `offline_access` の同意取得時に限定 | 緩い既定(`openid` が付与されれば発行) |

## クライアント / 登録

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithStaticClients` | `...op.ClientSeed`(`op.PublicClient` / `op.ConfidentialClient` / `op.PrivateKeyJWTClient` を渡す) | 起動時にクライアントレジストリを初期投入 | 空 |
| `WithFirstPartyClients` | `...string`(client ID) | ファーストパーティ同意スキップの対象 | なし |
| `WithDynamicRegistration` | `op.RegistrationOption` | `/register` を公開(RFC 7591 / 7592) | 無効 |

## 認証 / LoginFlow

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithLoginFlow` | `op.LoginFlow` | `Step` + `Rule` の宣言的 DAG(推奨) | なし |
| `WithAuthenticators` | `...op.Authenticator`(可変長) | 低レイヤ API(`WithLoginFlow` とは排他) | なし |
| `WithInteractionDriver` | `interaction.Driver` | 対話レイヤのトランスポート全体を差し替え(HTML ドライバ / SPA ドライバ / 独自実装) | 同梱の HTML ドライバ |
| `WithInteractions` | `...op.Interaction`(可変長) | ドライバの上に重ねる、資格情報以外の追加画面(T&C、KYC など) | consent のみ |
| `WithCaptchaVerifier` | `op.CaptchaVerifier` | `StepCaptcha` の上流 captcha プロバイダ | なし |
| `WithRiskAssessor` | `op.RiskAssessor` | `RuleRisk` と `LoginContext.RiskScore` の供給元 | なし |
| `WithLoginAttemptObserver` | `op.LoginAttemptObserver` | `RuleAfterFailedAttempts` 用の失敗回数集計 | なし |
| `WithMFAEncryptionKeys` | 32 byte の鍵 | TOTP シークレットを AES-256-GCM で保存時暗号化 | なし |
| `WithAuthnLockoutStore` | `store.AuthnLockoutStore` | `RuleAfterFailedAttempts` が参照する subject 単位の失敗回数を永続化 | なし |
| `WithACRPolicy` | `op.ACRPolicy`(interface) | ステップアップの acr / aal マッピング | identity |

`WithAuthnLockoutStore` を未設定のままにすると cross-factor 追跡は無効になり、TOTP / email-OTP それぞれの標準カウンタだけが働きます。設定すると、組み込みの possession / recovery factor（`StepTOTP`、`StepEmailOTP`、`StepRecoveryCode`）で cross-factor 追跡が有効になります。primary password / passkey や `ExternalStep` の custom factor は自動では包まれず、組み込み側の user store または custom authenticator の責務です。SQL と DynamoDB adapter はどちらも `AuthnLockouts()` から耐久 store を公開します。`inmem.Store.AuthnLockouts()` はプロセスローカルで、再起動時にリセットされます。

認証 factor のレコードは意図的に `store.Store` の外にあります。`StepTOTP` / `PrimaryPasskey` / `StepRecoveryCode` / `StepEmailOTP` はそれぞれ専用 store を受け取ります。登録スキーマ、暗号鍵、アカウント復旧ポリシーは組み込みアプリケーション側の設計だからです。in-memory、SQL、DynamoDB adapter は対応する accessor を公開します。[`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) は、同梱 SQL adapter の factor store を OP のコアテーブルと同じ DB で使う例です。別のバックエンドでだけ factor-store 契約を自前実装してください。

耐久 store 実装者向けに重要な factor-store 契約が 2 つあります。`store.EmailOTPStore.Get` は code の `ExpiresAt` だけでなく `EmailOTPRecord.RetainUntil` までは record を読める状態に保つ必要があります。これにより、code が失効しても resend cap と brute-force counter はリセットされません。`store.RecoveryStore.Consume` は、提示された code hash と現在保存されている slot の hash を比較し、古い hash を拒否する必要があります。recovery code を再生成した後に、漏洩済みの古い code が新しい batch の slot を消費するのを防ぐためです。

## UI

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithSPAUI` | `op.SPAUI`(構造体: `LoginMount` / `ConsentMount` / `LogoutMount` / `StaticDir`) | SPA の入口と静的アセット一式を OP 側で公開し、interaction の状態も JSON で提供 | 無効 |
| `WithConsentUI` | `op.ConsentUI`(`*html/template.Template` をラップ) | 同意画面を組み込み側テンプレートで描画。state / CSRF / 永続化は OP が担当 | 同梱テンプレート |
| `WithChooserUI` | `op.ChooserUI`(`*html/template.Template` をラップ) | `prompt=select_account` を組み込み側テンプレートで描画 | 同梱テンプレート |
| `WithCORSOrigins` | `...string` | 厳格 CORS の許可リスト(未指定なら redirect URI から自動導出) | 自動導出 |
| `WithDefaultLocale` | `op.Locale`(BCP 47 タグ) | `ui_locales` が無いリクエスト時の既定ロケール | `"en"` |
| `WithLocale` | `op.LocaleBundle`(1 呼び出しで 1 つ、繰り返し可) | 同梱 HTML ドライバ用のロケール別メッセージバンドルを登録 | 英語 + 日本語の初期バンドル |
| `WithPreferredLocaleStore` | `op.PreferredLocaleStore` | §L.2 優先順序の先頭で参照されるユーザ単位ロケール上書き | なし |

`WithSPAUI` と `WithConsentUI` は相互排他です。どちらも同意画面の描画を受け持つためです。`WithChooserUI` は `WithSPAUI` と同時指定できますが、SPA モードではアカウント選択も JSON の状態取得を通じて SPA が描画します。そのため chooser テンプレートは使われず、`op.New` が構造化された警告を出します。詳細は [カスタムアカウントチューザ UI](/ja/use-cases/custom-chooser-ui) を参照してください。

## トークン

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithAccessTokenFormat` | `op.AccessTokenFormat`(`AccessTokenFormatJWT` / `AccessTokenFormatOpaque`) | OP 全体で JWT / opaque を選択 | JWT |
| `WithAccessTokenFormatPerAudience` | `map[string]op.AccessTokenFormat`(RFC 8707 リソース → 形式) | audience ごとに形式を切り替え | OP 全体の値 |
| `WithAccessTokenRevocationStrategy` | `op.AccessTokenRevocationStrategy`(`RevocationStrategyGrantTombstone` / `RevocationStrategyJTIRegistry` / `RevocationStrategyNone`) | 発行済 JWT アクセストークンの失効ポリシー。既定の `GrantTombstone` は `Store.GrantRevocations()`、`JTIRegistry` は `Store.AccessTokens()` を必須とし、いずれも `op.New` で検査される | grant tombstone |
| `WithAccessTokenTTL` | `time.Duration` | アクセストークンの寿命 | 5 分 |
| `WithRefreshTokenTTL` | `time.Duration` | 通常のリフレッシュトークンの寿命 | 30 日 |
| `WithRefreshTokenOfflineTTL` | `time.Duration` | `offline_access` が付与されたときのリフレッシュトークンの寿命 | `WithRefreshTokenTTL` を継承(ゼロ値で延長しない) |
| `WithRefreshGracePeriod` | `time.Duration`(0 で無効化、負値は拒否) | ローテーション後の猶予期間 | 60 秒 |
| `WithDPoPNonceSource` | `op.DPoPNonceSource`(interface) | サーバ供給の DPoP nonce ストア(`op.NewInMemoryDPoPNonceSource` が同梱実装) | なし |

`WithInMemoryDPoPNonceLogger` は `op.New` ではなく `op.NewInMemoryDPoPNonceSource` に渡す補助オプションです。同梱の in-memory nonce source を使う場合だけ指定します。

## Discovery / エンドポイント

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithEndpoints` | `op.Endpoints`(構造体: 各エンドポイントのパス上書き) | 各エンドポイントのパスを上書き | 仕様の既定 |
| `WithMountPrefix` | `string`(`/` で始める。ルートに置くなら `/`) | issuer 直下にプリフィックスを設けて公開 | `/oidc` |
| `WithClaimsSupported` | `...string`(可変長) | discovery の `claims_supported` を埋める | 省略 |
| `WithClaimsParameterSupported` | `bool` | `claims_parameter_supported` を切り替える。`false` の場合、authorize / PAR は malformed JSON の拒否後に `claims` の中身を無視する | true |
| `WithACRValuesSupported` | `...string`(可変長) | `acr_values_supported` を公開。FAPI / eIDAS / NIST 800-63 のように特定の ACR 値を扱う配備が広告するために使う | 空(discovery に出ない) |
| `WithDiscoveryMetadata` | `op.DiscoveryMetadata`(型付きの `service_documentation` / policy / TOS / UI locale / mTLS alias フィールド + `Extra map[string]any`) | OP が所有しない RFC 8414 / OIDC Discovery メタデータを discovery 文書に追加。`UILocalesSupported` は非空時に自動導出された locale list を上書きし、OP 管理フィールドと衝突する `Extra` key は拒否 | なし |
| `WithPARLifetime` | `time.Duration` | `/par` が発行する `request_uri` の寿命を上書き。失効判定はブラウザが `/authorize` に URI を提示した時点で行い、その後の code 発行では単回使用性だけを強制 | 60 秒 |
| `WithJWKSRotationActive` | `func() bool` | ローテーション期間中だけ JWKS の `Cache-Control` を短期キャッシュに切り替える述語 | 常に長期キャッシュ |

## subject 戦略

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithSubjectGenerator` | `op.SubjectGenerator`(interface) | `sub` claim の導出を上書き。同梱の `op/subject.UUIDv7` が既定 | UUIDv7 通し |
| `WithPairwiseSubject` | `[]byte` salt(32 byte 以上) | OIDC Core §8.1 の sector ごと pairwise sub 導出を有効化。途中で戦略を切り替えると `op.New` が拒否する | public(UUIDv7) |

詳細は [使い方: pairwise subject](/ja/use-cases/pairwise-subject)。

## grant — Device Code / CIBA / Custom / Token Exchange

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithDeviceCodeGrant` | _(引数なし)_ | RFC 8628 device-authorization grant を有効化。`/device_authorization` を公開し `/token` に URN を登録 | 無効 |
| `WithDeviceVerificationURI` | `string`(絶対 URL) | デバイス画面に表示する verification URI を上書き(既定は `<issuer>/device`) | 自動導出 |
| `WithDeviceCodeExpiry` | `time.Duration` | 新規 `device_code` レコードの `expires_in` 寿命を上書き。アクセストークン TTL とは独立 | 10 分 |
| `WithDeviceCodePollInterval` | `time.Duration` | 広告する poll `interval` を上書き。これより速い poll は `slow_down` | 5 秒 |
| `WithCIBA` | `...op.CIBAOption` | CIBA poll mode を有効化。`/bc-authorize` を公開し CIBA URN を登録。サブオプション: `WithCIBAHintResolver`(必須)、`WithCIBADefaultExpiresIn`、`WithCIBAMaxExpiresIn`、`WithCIBAPollInterval`、`WithCIBAMaxPollViolations` | 無効 |
| `WithCustomGrant` | `op.CustomGrantHandler` | 組み込み側が定義する `grant_type` URN を `/token` に登録。handler はアクセストークンをそのまま返すか、`BoundAccessToken` 要求として返して OP に署名させる | なし |
| `RegisterTokenExchange` | `op.TokenExchangePolicy` | RFC 8693 token-exchange grant を有効化。ポリシーがリクエスト単位で受理可否(admission)を判断し、OP の既定値をさらに狭めることもできる | 無効 |

`WithDeviceCodeExpiry` と `WithDeviceCodePollInterval` は `WithAccessTokenTTL` から導出されません。アクセストークンを短命にしても、TV / CLI のペアリング手順までユーザがセカンドスクリーンに移る前に失効しないようにするためです。詳細は [使い方: device code](/ja/use-cases/device-code)、[CIBA](/ja/use-cases/ciba)、[Custom grant](/ja/use-cases/custom-grant)、[Token exchange](/ja/use-cases/token-exchange)。

## 認可機能 — RAR / Grant Management / Protected Resource Metadata

| オプション | 値 | 説明 | 既定 |
|---|---|---|---|
| `WithAuthorizationDetailTypes` | `...op.AuthorizationDetailType` | RFC 9396 Rich Authorization Requests を有効化。受理する `type` を validator とともに登録する。`authorization_details` は `/authorize`、`/par`、`/token` で検証され、grant に永続化され、JWT アクセストークンと introspection に反映され、discovery で公開される。nil の `Validate` は `op.New` で拒否される | 無効 |
| `WithGrantManagement` | `(actions []op.GrantManagementAction, actionRequired bool)` | OAuth 2.0 Grant Management draft を有効化。`grant_management_action` / `grant_id` を処理し、query / revoke エンドポイントを公開し、token 応答に `grant_id` を載せ、設定した action 集合を discovery で公開する。Experimental（IETF draft 追跡） | 無効 |
| `WithProtectedResources` | `...op.ProtectedResource` | 登録した各リソースについて RFC 9728 protected-resource メタデータを `/.well-known/oauth-protected-resource` とリソース path の接尾辞で公開し、`authorization_servers` に issuer を載せる | なし |

`op.StepUpChallenge(realm, acrValues, maxAge)` は `op.New` のオプションではなく独立したヘルパで、組み込み側のリソースサーバが返す RFC 9470 の `WWW-Authenticate: Bearer` challenge を組み立てます。OP 自身はこれを発行しません。

詳細は [Rich authorization requests](/ja/use-cases/authorization-details)、[Grant management](/ja/use-cases/grant-management)、[Protected resource metadata](/ja/use-cases/protected-resource-metadata)、[MFA / ステップアップ](/ja/use-cases/mfa-step-up)。

## 暗号化(JWE)

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithEncryptionKeyset` | `op.EncryptionKeyset`(RSA 2048 bit 以上 / EC P-256/384/521 の秘密鍵、`use=enc`) | 暗号化用 JWK を公開。inbound JWE request_object と outbound JWE 応答(id_token / userinfo / JARM / introspection)に必要 | なし |
| `WithSupportedEncryptionAlgs` | `(algs []string, encs []string)` | 既定の許可リスト(`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`)を **狭める** だけ。広げることはできない | 既定の許可リスト全体 |

詳細は [使い方: JWE 暗号化](/ja/use-cases/jwe-encryption)。

## mTLS / プロキシ / ネットワーク

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithMTLSProxy` | `(headerName string, trustedCIDRs []string)` | エッジでヘッダ経由の mTLS を終端 | なし |
| `WithTrustedProxies` | `...string`(CIDR) | `X-Forwarded-*` / `Forwarded` から実クライアント IP を解決 | なし |
| `WithTrustedProxyHosts` | `...string`(hostname) | trusted proxy CIDR が設定されている場合に、正規の issuer host 以外の `X-Forwarded-Host` 許可リストを追加 | issuer host のみ |
| `WithAllowLocalhostLoopback` | _(引数なし)_ | 開発 / ネイティブアプリデモ用に RFC 8252 の loopback 緩和へ文字列 `localhost` を追加し、**issuer 自体にも** `localhost` を許可。リテラル `127.0.0.1` / `[::1]` は厳格既定のまま | リテラル loopback のみ |
| `WithAllowPrivateNetworkJWKS` | _(引数なし)_ | RFC 1918 上の client JWKS を許容(テスト専用) | 拒否 |
| `WithAllowPrivateNetworkJAR` | _(引数なし)_ | RFC 1918 上の `request_uri` を許容(テスト専用) | 拒否 |
| `WithAllowPrivateNetworkSector` | _(引数なし)_ | dynamic registration 時の `sector_identifier_uri` が RFC 1918 上にあることを許容(テスト / private RP network 専用) | 拒否 |
| `WithJWKSHTTPTransport` | `http.RoundTripper` | JAR と `private_key_jwt` が使う RP 管理 JWKS 取得の transport を差し替える。接続時の SSRF 判定は維持される | システム trust の transport |
| `WithBackchannelAllowPrivateNetwork` | `bool` | RFC 1918 上の `backchannel_logout_uri` を許容(テスト専用) | false |
| `WithAllowInsecureBackchannelLogoutForDev` | _(引数なし)_ | dev / CI fixture 用に plain-HTTP loopback の `backchannel_logout_uri` と配送を許容 | 拒否 |
| `WithBackchannelLogoutHTTPClient` | `*http.Client` | Back-Channel ログアウト用の HTTP クライアント | 既定 |
| `WithBackchannelLogoutTimeout` | `time.Duration` | RP ごとの 一斉通知 タイムアウト | 5 秒 |

## 観測

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithLogger` | `*slog.Logger` | 構造化された運用ログ(handler は redaction ミドルウェアで包まれる) | discard |
| `WithAuditLogger` | `*slog.Logger` | 監査イベント専用のロガー | `WithLogger` を継承 |
| `WithPrometheus` | `*prometheus.Registry` | OP のカウンタを呼び出し側のレジストリに登録(`/metrics` は公開しない) | なし |

## 運用方針

| Option | 値 | セクション | 既定 |
|---|---|---|---|
| `WithSessionDurabilityPosture` | `op.SessionDurabilityPosture` | Back-Channel Logout の監査ログに方針を注釈付け(SOC 用途) | volatile |
| `WithClock` | `op.Clock` | 時刻ソース(テスト用に注入) | `time.Now` |

## ここでは設定**しない**もの

意図的にオプションにしていない項目です。理由は各リンク先の設計判断を参照してください。

- **JOSE 検証用の許可リスト** — client assertion、JAR request object、DPoP proof など入力側の署名検証では `RS256` / `PS256` / `ES256` / `EdDSA` の固定集合を使います。OP が発行する JWT の署名は `ES256` のみです。どちらの面も広げるフラグはありません。[セキュリティ方針 §2](/ja/security/posture#_2-the-jose-alg-list-is-a-closed-type) を参照。
- **PKCE method** — `S256` のみ。`plain` は構造的に拒否されます。
- **Cookie scheme** — `__Host-` プリフィックス、AES-256-GCM、double-submit CSRF が常に有効です。[必須オプション § WithCookieKeys](/ja/getting-started/required-options#withcookiekeys) を参照。
- **乱数源** — `crypto/rand` のみ。`math/rand` は lint で禁止しています。
- **`/metrics` の公開** — ライブラリではなくルーター側の責務です。[使い方: Prometheus](/ja/use-cases/prometheus) を参照。

## このリストの裏取り

カタログはライブラリ本体から grep で生成しています。自分で監査するには:

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhE '^func With[A-Z]|^func RegisterTokenExchange' \
  op/options.go op/options_authn.go op/options_clients.go \
  op/options_ciba.go op/options_customgrant.go op/options_devicecode.go \
  op/options_discovery.go op/options_encryption.go op/options_features.go \
  op/options_fapi_proxy.go op/options_protocol.go op/options_session.go \
  op/options_subject.go op/access_token_revocation.go op/i18n.go \
  op/registration.go op/authorization_details.go op/grant_management.go \
  op/protected_resource.go \
  | sort -u
```

関数名と受け取る型のシグネチャが正典であり、各関数の godoc コメントが契約の正本です。
