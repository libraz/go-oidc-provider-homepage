---
title: Options 索引
description: 公開されている op.With* オプションを 1 ページに集約。何を設定し、どのページで深掘りされているか。
outline: 2
---

# Options 索引

公開されている `op.With*` オプションを、触る対象のレイヤごとに分類しました。先頭の 4 つは構築時に必須で、それ以外はデフォルトを上書きする任意オプションです。

::: tip このページの読み方
オプション名のリンクから詳細ページに飛べます。「セクション」列は、そのオプションが動かす discovery / endpoint の表面です。「デフォルト」が空欄のオプションは組み込みの初期値を持っておらず、明示的に渡したときだけ機能が有効になります。
:::

## どのオプションが必要か

このページは、公開されている `op.With*` をすべて並べた索引です。70 以上のオプションがあるため、目的が決まった状態で表を眺めると目当てが探しにくいことがあります。下の決定木で関連するエリアを当てたうえで、表の対応セクションに飛んでください。

- **これから新規に OP を立ち上げる** → まず必須の 4 つ: [`WithIssuer`](/ja/getting-started/required-options#withissuer)、[`WithStore`](/ja/getting-started/required-options#withstore)、[`WithKeyset`](/ja/getting-started/required-options#withkeyset)、[`WithCookieKeys`](/ja/getting-started/required-options#withcookiekeys)。詳しくは[必須オプション](/ja/getting-started/required-options) と[最小 OP の組み立て](/ja/use-cases/minimal-op)。
- **FAPI 2.0 を 1 行で有効にしたい** → `WithProfile(profile.FAPI2Baseline)`(または `profile.FAPI2MessageSigning`、`profile.FAPICIBA`)。[ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline)、[ガイド: FAPI](/ja/concepts/fapi) を参照。
- **プロファイル全体ではなく、機能を 1 つだけ有効にしたい** → `WithFeature(feature.PAR)` / `JAR` / `JARM` / `DPoP` / `MTLS` / `Introspect` / `Revoke`。PKCE は標準で有効、`DynamicRegistration` は `WithDynamicRegistration` から間接的に有効化されます。
- **`/token` で受け付ける grant の集合を絞りたい** → `WithGrants(grant.AuthorizationCode, grant.RefreshToken, grant.ClientCredentials, grant.DeviceCode, grant.CIBA)`。`WithDeviceCodeGrant()` / `WithCIBA(...)` / `WithCustomGrant(...)` / `RegisterTokenExchange(...)` は、それぞれ追加で必要なエンドポイントもまとめてマウントします。
- **送信者制約付きの access token にしたい** → DPoP 系: `WithFeature(feature.DPoP)` + 必要に応じて `WithDPoPNonceSource(op.NewInMemoryDPoPNonceSource(...))`。mTLS 系: `WithFeature(feature.MTLS)` + 必要に応じて `WithMTLSProxy(headerName, trustedCIDRs)`。詳しくは[ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint)、[DPoP](/ja/concepts/dpop)、[mTLS](/ja/concepts/mtls)、[ユースケース: DPoP nonce](/ja/use-cases/dpop-nonce)。
- **access token を JWT / opaque で切り替えたい** → OP 全体の既定は `WithAccessTokenFormat(...)`、RFC 8707 リソースごとに分けたいときは `WithAccessTokenFormatPerAudience(...)`。[ガイド: access token の形式](/ja/concepts/access-token-format) を参照。
- **sector ごとに pairwise `sub` にしたい** → `WithPairwiseSubject(salt)`(32 byte 以上の salt)。[ユースケース: pairwise subject](/ja/use-cases/pairwise-subject) を参照。
- **起動時にクライアントを静的に投入したい** → `WithStaticClients(op.PublicClient(...), op.ConfidentialClient(...), op.PrivateKeyJWTClient(...))`。[ガイド: クライアントの種類](/ja/concepts/client-types) を参照。
- **Dynamic Client Registration を使いたい** → `WithDynamicRegistration(...)`。[ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) を参照。
- **introspection / revocation エンドポイントを公開したい** → `WithFeature(feature.Introspect)` および / または `WithFeature(feature.Revoke)`。細かな調整は下の「プロファイル / feature / grant」表を参照。
- **scope カタログを拡張したい** → discovery に出す scope は `WithScope(op.PublicScope("name", "label"))`、内部用は `WithScope(op.InternalScope("name"))`。[ガイド: scope と claim](/ja/concepts/scopes-and-claims)、[ユースケース: scope](/ja/use-cases/scopes) を参照。
- **独自の `grant_type` を生やしたい** → `WithCustomGrant(handler)`。[ユースケース: custom grant](/ja/use-cases/custom-grant) を参照。
- **i18n(国際化)対応をしたい** → `WithDefaultLocale(...)`、`WithLocale(bundle)`、`WithPreferredLocaleStore(...)`。[ユースケース: i18n](/ja/use-cases/i18n) を参照。
- **id_token / userinfo / JARM / introspection を JWE で暗号化したい** → `WithEncryptionKeyset(...)` と、必要なら既定許可リストを狭める `WithSupportedEncryptionAlgs(algs, encs)`。[ユースケース: JWE 暗号化](/ja/use-cases/jwe-encryption) を参照。
- **SPA クライアント向けに CORS を開けたい** → `WithCORSOrigins(...)`。[ユースケース: SPA 向け CORS](/ja/use-cases/cors-spa) を参照。
- **Prometheus メトリクスを出したい** → `WithPrometheus(registry)`。ライブラリは `/metrics` をマウントしないため、ハンドラの公開はルーター側で行います。[ユースケース: Prometheus メトリクス](/ja/use-cases/prometheus) を参照。
- **監査ログをアプリログとは別の sink に流したい** → `WithAuditLogger(*slog.Logger)`。[Audit イベントカタログ](/ja/reference/audit-events) を参照。
- **SPA 向けに対話レイヤをまるごと差し替えたい** → `WithInteractionDriver(interaction.Driver)`。[ユースケース: SPA 向け対話のカスタマイズ](/ja/use-cases/spa-custom-interaction) を参照。

## 必須(`op.New` がこの 4 つ無しでは起動を拒否します)

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| [`WithIssuer`](/ja/getting-started/required-options#withissuer) | `string` | discovery `issuer` / JWT `iss` / cookie scope | — |
| [`WithStore`](/ja/getting-started/required-options#withstore) | `op.Store` | すべての永続サブストア | — |
| [`WithKeyset`](/ja/getting-started/required-options#withkeyset) | `op.Keyset`(P-256 / ES256) | JWKS / JWS 署名 | — |
| [`WithCookieKeys`](/ja/getting-started/required-options#withcookiekeys) | 32 byte の鍵 | session / CSRF cookie の AES-256-GCM | — |

## プロファイル / feature / grant

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithProfile` | `profile.Profile` | セキュリティプロファイルを 1 行で有効化(FAPI 2.0 Baseline / Message Signing / FAPI-CIBA)。`profile.IGovHigh` は v2+ 向けの予約で、ランタイム制約が未着地のため `op.New` が拒否。 | なし |
| `WithFeature` | `feature.Flag`(1 呼び出しで 1 つ、繰り返し可) | PAR / DPoP / mTLS / JAR / JARM / introspect / revoke を個別に有効化 | 控えめなデフォルト |
| `WithGrants` | `...grant.Type`(可変長) | `/token` で受け付ける grant を限定 | `authorization_code`、`refresh_token` |
| `WithScope` | `op.Scope`(1 呼び出しで 1 つ。`op.PublicScope` / `op.InternalScope` コンストラクタを利用) | scope カタログを拡張 | `openid`、`profile`、`email`、`offline_access` |
| `WithOpenIDScopeOptional` | _(引数なし)_ | OAuth2 単独(`scope` に `openid` を含まない)を許容 | 必須 |
| `WithStrictOfflineAccess` | _(引数なし)_ | `refresh_token` の発行を `offline_access` の同意取得時に限定 | lax(`openid` granted で発行) |

## クライアント / 登録

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithStaticClients` | `...op.ClientSeed`(`op.PublicClient` / `op.ConfidentialClient` / `op.PrivateKeyJWTClient` を渡す) | 起動時にクライアントレジストリを初期投入 | 空 |
| `WithFirstPartyClients` | `...string`(client ID) | ファーストパーティ同意スキップの対象 | なし |
| `WithDynamicRegistration` | `op.RegistrationOption` | `/register` をマウント(RFC 7591 / 7592) | 無効 |

## 認証 / LoginFlow

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithLoginFlow` | `op.LoginFlow` | `Step` + `Rule` の宣言的 DAG(推奨) | なし |
| `WithAuthenticators` | `...op.Authenticator`(可変長) | 低レイヤ API(`WithLoginFlow` とは排他) | なし |
| `WithInteractionDriver` | `interaction.Driver` | 対話レイヤのトランスポート全体を差し替え(HTML ドライバ / SPA ドライバ / 独自実装) | 同梱の HTML ドライバ |
| `WithInteractions` | `...op.Interaction`(可変長) | ドライバの上に重ねる非クレデンシャルプロンプト(T&C、KYC など) | consent のみ |
| `WithCaptchaVerifier` | `op.CaptchaVerifier` | `StepCaptcha` の上流 captcha プロバイダ | なし |
| `WithRiskAssessor` | `op.RiskAssessor` | `RuleRisk` と `LoginContext.RiskScore` の供給元 | なし |
| `WithLoginAttemptObserver` | `op.LoginAttemptObserver` | `RuleAfterFailedAttempts` 用の失敗回数集計 | なし |
| `WithMFAEncryptionKeys` | 32 byte の鍵 | TOTP シークレットを AES-256-GCM で保存時暗号化 | なし |
| `WithAuthnLockoutStore` | `op.AuthnLockoutStore` | `RuleAfterFailedAttempts` が参照する subject 単位の失敗回数を永続化 | in-memory |
| `WithACRPolicy` | `op.ACRPolicy`(interface) | ステップアップの acr / aal マッピング | identity |

## UI

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithSPAUI` | `op.SPAUI`(構造体: `LoginMount` / `ConsentMount` / `LogoutMount` / `StaticDir`) | v1.0 向けの予約。**現状で設定すると `op.New` は構成エラーを返します**。代わりに `WithInteractionDriver(interaction.JSONDriver{})` を渡し、SPA shell は自前のルーターで配信。 | rejected |
| `WithConsentUI` | `op.ConsentUI`(`*html/template.Template` をラップ) | v1.0 向けの予約。**現状で設定すると `op.New` は構成エラーを返します**。文言の差し替えは `WithLocale`、markup の自前管理は JSON ドライバで対応。 | rejected |
| `WithChooserUI` | `op.ChooserUI`(`*html/template.Template` をラップ) | v1.0 向けの予約。**現状で設定すると `op.New` は構成エラーを返します**。同梱の chooser テンプレートはそのまま動作。 | rejected |
| `WithCORSOrigins` | `...string` | 厳格 CORS の許可リスト(未指定なら redirect URI から自動導出) | 自動導出 |
| `WithDefaultLocale` | `op.Locale`(BCP 47 タグ) | `ui_locales` が無いリクエスト時の既定ロケール | `"en"` |
| `WithLocale` | `op.LocaleBundle`(1 呼び出しで 1 つ、繰り返し可) | 同梱 HTML ドライバ用のロケール別メッセージバンドルを登録 | 英語 + 日本語 seed |
| `WithPreferredLocaleStore` | `op.PreferredLocaleStore` | §L.2 優先順序の先頭で参照されるユーザ単位ロケール上書き | なし |

## トークン

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithAccessTokenFormat` | `op.AccessTokenFormat`(`AccessTokenFormatJWT` / `AccessTokenFormatOpaque`) | OP 全体で JWT / opaque を選択 | JWT |
| `WithAccessTokenFormatPerAudience` | `map[string]op.AccessTokenFormat`(RFC 8707 リソース → 形式) | audience ごとに形式を切り替え | OP 全体の値 |
| `WithAccessTokenRevocationStrategy` | `op.AccessTokenRevocationStrategy`(`RevocationStrategyGrantTombstone` / `RevocationStrategyJTIRegistry` / `RevocationStrategyNone`) | 発行済 JWT access token の失効ポリシー。既定の `GrantTombstone` は `Store.GrantRevocations()`、`JTIRegistry` は `Store.AccessTokens()` を必須とし、いずれも `op.New` で検査される | grant tombstone |
| `WithAccessTokenTTL` | `time.Duration` | access token の寿命 | 5 分 |
| `WithRefreshTokenTTL` | `time.Duration` | 通常の refresh token の寿命 | 30 日 |
| `WithRefreshTokenOfflineTTL` | `time.Duration` | `offline_access` granted 時の refresh token の寿命 | `WithRefreshTokenTTL` を継承(ゼロ値で延長しない) |
| `WithRefreshGracePeriod` | `time.Duration`(0 で無効化、負値は拒否) | ローテーション後の猶予期間 | 60 秒 |
| `WithDPoPNonceSource` | `op.DPoPNonceSource`(interface) | サーバ供給の DPoP nonce ストア(`op.NewInMemoryDPoPNonceSource` が同梱実装) | なし |

## Discovery / endpoint

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithEndpoints` | `op.Endpoints`(構造体: 各エンドポイントのパス上書き) | 各エンドポイントのパスを上書き | 仕様の既定 |
| `WithMountPrefix` | `string`(`/` で始める。ルートに置くなら `/`) | issuer 直下にプリフィックスを設けてマウント | `/oidc` |
| `WithClaimsSupported` | `...string`(可変長) | discovery の `claims_supported` を埋める | 自動導出 |
| `WithClaimsParameterSupported` | `bool` | `claims_parameter_supported` を切り替え | false |
| `WithACRValuesSupported` | `...string`(可変長) | `acr_values_supported` を公開。FAPI / eIDAS / NIST 800-63 のように特定の ACR 値を honor する deployment が広告するために使う | 空(discovery に出ない) |
| `WithDiscoveryMetadata` | `op.DiscoveryMetadata`(`map[string]any`) | 非 OIDC のキー(federation、独自 registration metadata)を discovery 文書に追加 | なし |
| `WithJWKSRotationActive` | `func() bool` | ローテーション期間中だけ JWKS の `Cache-Control` を短期キャッシュに切り替える述語 | 常に長期キャッシュ |

## subject 戦略

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithSubjectGenerator` | `op.SubjectGenerator`(interface) | `sub` claim の導出を上書き。同梱の `op/subject.UUIDv7` がデフォルト | UUIDv7 通し |
| `WithPairwiseSubject` | `[]byte` salt(32 byte 以上) | OIDC Core §8.1 の sector ごと pairwise sub 導出を有効化。途中で戦略を切り替えると `op.New` が拒否する | public(UUIDv7) |

詳細は [ユースケース: pairwise subject](/ja/use-cases/pairwise-subject)。

## grant — Device Code / CIBA / Custom / Token Exchange

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithDeviceCodeGrant` | _(引数なし)_ | RFC 8628 device-authorization grant を有効化。`/device_authorization` をマウントし `/token` に URN を登録 | 無効 |
| `WithDeviceVerificationURI` | `string`(絶対 URL) | デバイス画面に表示する verification URI を上書き(既定は `<issuer>/device`) | 自動導出 |
| `WithCIBA` | `...op.CIBAOption` | CIBA poll mode を有効化。`/bc-authorize` をマウントし CIBA URN を登録。サブオプション: `WithCIBAHintResolver`(必須)、`WithCIBADefaultExpiresIn`、`WithCIBAMaxExpiresIn`、`WithCIBAPollInterval` | 無効 |
| `WithCustomGrant` | `op.CustomGrantHandler` | 組み込み側が定義する `grant_type` URN を `/token` に登録。handler は access token をそのまま返すか、`BoundAccessToken` 要求として返して OP に署名させる | なし |
| `RegisterTokenExchange` | `op.TokenExchangePolicy` | RFC 8693 token-exchange grant を有効化。ポリシーがリクエスト単位で受理可否(admission)を判断し、OP の既定値をさらに狭めることもできる | 無効 |

詳細は [ユースケース: device code](/ja/use-cases/device-code)、[CIBA](/ja/use-cases/ciba)、[Custom grant](/ja/use-cases/custom-grant)、[Token exchange](/ja/use-cases/token-exchange)。

## 暗号化(JWE)

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithEncryptionKeyset` | `op.EncryptionKeyset`(RSA 2048 bit 以上 / EC P-256/384/521 の秘密鍵、`use=enc`) | 暗号化用 JWK を公開。inbound JWE request_object と outbound JWE 応答(id_token / userinfo / JARM / introspection)に必要 | なし |
| `WithSupportedEncryptionAlgs` | `(algs []string, encs []string)` | v0.9.1 既定の許可リスト(`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`)を **狭める** だけ。広げることはできない | 既定の許可リスト全体 |

詳細は [ユースケース: JWE 暗号化](/ja/use-cases/jwe-encryption)。

## mTLS / プロキシ / ネットワーク

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithMTLSProxy` | `(headerName string, trustedCIDRs []string)` | エッジでヘッダ経由の mTLS を終端 | なし |
| `WithTrustedProxies` | `...string`(CIDR) | `X-Forwarded-*` / `Forwarded` から実クライアント IP を解決 | なし |
| `WithAllowLocalhostLoopback` | _(引数なし)_ | 開発用に `http://127.0.0.1` issuer を許容 | 厳格(HTTPS のみ) |
| `WithAllowPrivateNetworkJWKS` | _(引数なし)_ | RFC 1918 上の client JWKS を許容(テスト専用) | 拒否 |
| `WithAllowPrivateNetworkJAR` | _(引数なし)_ | RFC 1918 上の `request_uri` を許容(テスト専用) | 拒否 |
| `WithBackchannelAllowPrivateNetwork` | `bool` | RFC 1918 上の `backchannel_logout_uri` を許容(テスト専用) | false |
| `WithBackchannelLogoutHTTPClient` | `*http.Client` | Back-Channel ログアウト用の HTTP クライアント | デフォルト |
| `WithBackchannelLogoutTimeout` | `time.Duration` | RP ごとの fan-out タイムアウト | 5 秒 |

## 観測

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithLogger` | `*slog.Logger` | 構造化された運用ログ(handler は redaction ミドルウェアで包まれる) | discard |
| `WithAuditLogger` | `*slog.Logger` | 監査イベント専用のロガー | `WithLogger` を継承 |
| `WithPrometheus` | `*prometheus.Registry` | OP のカウンタを呼び出し側のレジストリに登録(`/metrics` はマウントしない) | なし |

## 運用方針

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithSessionDurabilityPosture` | `op.SessionDurabilityPosture` | back-channel logout の監査ログに方針を注釈付け(SOC 用途) | volatile |
| `WithClock` | `op.Clock` | 時刻ソース(テスト用に注入) | `time.Now` |

## ここでは設定**しない**もの

意図的にオプションにしていない項目です。理由は各リンク先の設計判断を参照してください。

- **JOSE algorithm 許可リスト** — `RS256` / `PS256` / `ES256` / `EdDSA` で固定です。これを広げるフラグはありません。[セキュリティ方針 §2](/ja/security/posture#_2-the-jose-alg-list-is-a-closed-type) を参照。
- **PKCE method** — `S256` のみ。`plain` は構造的に拒否されます。
- **Cookie scheme** — `__Host-` プリフィックス、AES-256-GCM、double-submit CSRF が常に有効です。[必須オプション § WithCookieKeys](/ja/getting-started/required-options#withcookiekeys) を参照。
- **乱数源** — `crypto/rand` のみ。`math/rand` は lint で禁止しています。
- **`/metrics` のマウント** — ライブラリではなくルーター側の責務です。[ユースケース: Prometheus](/ja/use-cases/prometheus) を参照。

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
  op/registration.go \
  | sort -u
```

関数名と受け取る型のシグネチャが正典であり、各関数の godoc コメントが契約の正本です。
