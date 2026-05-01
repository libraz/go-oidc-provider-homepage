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

## 必須(`op.New` がこの 4 つ無しでは起動を拒否します)

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| [`WithIssuer`](/ja/getting-started/required-options#withissuer) | `string` | discovery `issuer` / JWT `iss` / cookie scope | — |
| [`WithStore`](/ja/getting-started/required-options#withstore) | `op.Store` | すべての永続サブストア | — |
| [`WithKeyset`](/ja/getting-started/required-options#withkeyset) | `op.Keyset`(P-256 / ES256) | JWKS / JWS 署名 | — |
| [`WithCookieKey`](/ja/getting-started/required-options#withcookiekey) / `WithCookieKeys` | 32 byte の鍵 | session / CSRF cookie の AES-256-GCM | — |

## プロファイル / feature / grant

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithProfile` | `profile.Profile` | セキュリティプロファイルを 1 行で有効化(FAPI 2.0 Baseline / Message Signing) | なし |
| `WithFeature` | `feature.Feature`(可変長) | PAR / DPoP / mTLS / JAR / introspect / revoke / DCR を個別に有効化 | 控えめなデフォルト |
| `WithGrants` | `grant.Grant`(可変長) | `/token` で受け付ける grant を限定 | `authorization_code`、`refresh_token` |
| `WithScope` | `op.PublicScope` / `op.InternalScope` | scope カタログを拡張 | `openid`、`profile`、`email`、`offline_access` |
| `WithOpenIDScopeOptional` | `bool` | OAuth2 単独(`scope` に `openid` を含まない)を許容 | 必須 |
| `WithStrictOfflineAccess` | `bool` | `offline_access` が同時に granted でない限り `refresh_token` の発行を拒否 | 厳格 |

## クライアント / 登録

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithStaticClients` | `[]op.Client` | 起動時にクライアントレジストリを初期投入 | 空 |
| `WithFirstPartyClients` | `[]string`(client ID) | ファーストパーティ同意スキップの対象 | なし |
| `WithDynamicRegistration` | `op.RegistrationOption` | `/register` をマウント(RFC 7591 / 7592) | 無効 |

## 認証 / LoginFlow

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithLoginFlow` | `op.LoginFlow` | `Step` + `Rule` の宣言的 DAG(推奨) | なし |
| `WithAuthenticators` | `[]op.Authenticator` | 低レイヤ API(v0.x / v1.0 でも引き続き利用可能) | なし |
| `WithInteraction` / `WithInteractions` | `op.Interaction`(可変長) | 非クレデンシャルのプロンプト(T&C、KYC など) | consent のみ |
| `WithCaptchaVerifier` | `op.CaptchaVerifier` | `StepCaptcha` の上流 captcha プロバイダ | なし |
| `WithRiskAssessor` | `op.RiskAssessor` | `RuleRisk` と `LoginContext.RiskScore` の供給元 | なし |
| `WithLoginAttemptObserver` | `op.LoginAttemptObserver` | `RuleAfterFailedAttempts` 用の失敗回数集計 | なし |
| `WithMFAEncryptionKey` / `WithMFAEncryptionKeys` | 32 byte の鍵 | TOTP シークレットを AES-256-GCM で保存時暗号化 | なし |
| `WithPasskeyAttestation` | `op.PasskeyAttestationPolicy` | WebAuthn attestation の受け入れ方針 | direct |
| `WithACRPolicy` | `op.ACRPolicy` | ステップアップの acr / aal マッピング | identity |

## UI

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithSPAUI` | `op.SPAUI` | 既定の HTML ドライバを SPA 駆動の JSON ドライバへ切り替え（フレームワーク不問） | HTML |
| `WithConsentUI` | `*template.Template` | 既定の同意 HTML を上書き | 同梱 |
| `WithChooserUI` | `*template.Template` | マルチアカウントチューザの HTML を上書き | 同梱 |
| `WithCORSOrigins` | `...string` | 厳格 CORS の許可リスト(未指定なら redirect URI から自動導出) | 自動導出 |

## トークン

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithAccessTokenFormat` | `op.AccessTokenFormat` | OP 全体で JWT / opaque を選択 | JWT |
| `WithAccessTokenFormatPerAudience` | `func(...) op.AccessTokenFormat` | audience ごとに形式を切り替え | OP 全体の値 |
| `WithAccessTokenTTL` | `time.Duration` | access token の寿命 | 5 分 |
| `WithRefreshTokenTTL` | `time.Duration` | 通常の refresh token の寿命 | 30 日 |
| `WithRefreshTokenOfflineTTL` | `time.Duration` | `offline_access` granted 時の refresh token の寿命 | 90 日 |
| `WithRefreshGracePeriod` | `time.Duration`(`-1` で無効化) | ローテーション後の猶予期間 | 60 秒 |
| `WithDPoPNonceSource` | `op.DPoPNonceSource` | サーバ供給の DPoP nonce ストア | なし |

## Discovery / endpoint

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithEndpoints` | `op.EndpointPaths` | 各エンドポイントのパスを上書き | 仕様の既定 |
| `WithMountPrefix` | `string` | issuer 直下にプリフィックスを設けてマウント | `""` |
| `WithClaimsSupported` | `[]string` | discovery の `claims_supported` を埋める | 自動導出 |
| `WithClaimsParameterSupported` | `bool` | `claims_parameter_supported` を切り替え | false |

## mTLS / プロキシ / ネットワーク

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithMTLSProxy` | `op.MTLSProxy` | エッジでヘッダ経由の mTLS を終端 | なし |
| `WithTrustedProxies` | `[]netip.Prefix` | `X-Forwarded-*` / `Forwarded` から実クライアント IP を解決 | なし |
| `WithAllowLocalhostLoopback` | `bool` | 開発用に `http://127.0.0.1` issuer を許容 | false |
| `WithAllowPrivateNetworkJWKS` | `bool` | RFC 1918 上の client JWKS を許容(テスト専用) | false |
| `WithAllowPrivateNetworkJAR` | `bool` | RFC 1918 上の `request_uri` を許容(テスト専用) | false |
| `WithBackchannelAllowPrivateNetwork` | `bool` | RFC 1918 上の `backchannel_logout_uri` を許容(テスト専用) | false |
| `WithBackchannelLogoutHTTPClient` | `*http.Client` | Back-Channel ログアウト用の HTTP クライアント | デフォルト |
| `WithBackchannelLogoutTimeout` | `time.Duration` | RP ごとの fan-out タイムアウト | 5 秒 |

## 観測

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithLogger` | `*slog.Logger` | 構造化された運用ログ | `slog.Default()` |
| `WithAuditLogger` | `*slog.Logger` | audit イベント専用のロガー | `WithLogger` を継承 |
| `WithPrometheus` | `prometheus.Registerer` | OP のカウンタを呼び出し側のレジストリに登録(`/metrics` はマウントしない) | なし |

## 運用方針

| Option | 値 | セクション | デフォルト |
|---|---|---|---|
| `WithSessionDurabilityPosture` | `op.SessionDurabilityPosture` | back-channel logout の audit に方針を注釈(SOC 用途) | volatile |
| `WithClock` | `op.Clock` | 時刻ソース(テスト用に注入) | `time.Now` |

## ここでは設定**しない**もの

意図的にオプションにしていない項目です。理由は各リンク先の設計判断を参照してください。

- **JOSE algorithm 許可リスト** — `RS256` / `PS256` / `ES256` / `EdDSA` で固定です。これを広げるフラグはありません。[セキュリティ方針 §2](/ja/security/posture#_2-the-jose-alg-list-is-a-closed-type) を参照。
- **PKCE method** — `S256` のみ。`plain` は構造的に拒否されます。
- **Cookie scheme** — `__Host-` プリフィックス、AES-256-GCM、double-submit CSRF が常に有効です。[必須オプション § WithCookieKey](/ja/getting-started/required-options#withcookiekey) を参照。
- **乱数源** — `crypto/rand` のみ。`math/rand` は lint で禁止しています。
- **`/metrics` のマウント** — ライブラリではなくルーター側の責務です。[ユースケース: Prometheus](/ja/use-cases/prometheus) を参照。

## このリストの裏取り

カタログはライブラリ本体から grep で生成しています。自分で監査するには:

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhE '^func With[A-Z]' op/options.go op/options_authn.go \
  op/options_protocol.go op/options_fapi_proxy.go op/registration.go \
  | sort -u
```

関数名と受け取る型のシグネチャが正典であり、各関数の godoc コメントが契約の正本です。
