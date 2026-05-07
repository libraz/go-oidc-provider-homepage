---
title: ユースケース
description: upstream リポジトリで動作確認済みの本番形シナリオ。
---

# ユースケース

各カードはソースリポジトリの [`examples/`](https://github.com/libraz/go-oidc-provider/tree/main/examples) の実行可能例にマップされています。例は `example` build tag の背後でビルドされ、`go.sum` を肥大化させたり `go test ./...` に巻き込まれたりしません。

```sh
go run -tags example ./examples/01-minimal
```

## 一覧

各 example フォルダはいずれかのページに対応しています。

### Bootstrap / wiring

| ユースケース | 例 | ページ |
|---|---|---|
| 最小 OP | [`01-minimal`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) | [最小 OP](/ja/use-cases/minimal-op) |
| 典型的な option をまとめた構成 | [`02-bundle`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle) | [Comprehensive bundle](/ja/use-cases/bundle) |

### Profile / flow

| ユースケース | 例 | ページ |
|---|---|---|
| OIDC と並走する純粋 OAuth 2.0 | [`04-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/04-oauth2-only) | [OAuth 2.0（openid なし）](/ja/use-cases/oauth2-only) |
| FAPI 2.0 Baseline (PAR + JAR + DPoP) | [`03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2)、[`50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) | [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) |
| Service-to-service token | [`05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) | [client_credentials](/ja/use-cases/client-credentials) |
| DPoP server nonce flow | [`51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) | [DPoP nonce](/ja/use-cases/dpop-nonce) |

### UI

| ユースケース | 例 | ページ |
|---|---|---|
| SPA から UI 駆動 | [`16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction)、[`10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) | [SPA / カスタム interaction](/ja/use-cases/spa-custom-interaction) |
| カスタム HTML 同意画面 | [`11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) | [カスタム同意 UI](/ja/use-cases/custom-consent-ui) |
| カスタム HTML アカウントチューザ | [`12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) | [マルチアカウントチューザ](/ja/use-cases/multi-account) |
| マルチアカウントチューザ（`prompt=select_account`） | [`13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) | [マルチアカウントチューザ](/ja/use-cases/multi-account) |
| クロスオリジン SPA (CORS) | [`14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa) | [SPA 向け CORS](/ja/use-cases/cors-spa) |
| ロケールネゴシエーション | [`15-i18n-locale`](https://github.com/libraz/go-oidc-provider/tree/main/examples/15-i18n-locale) | [i18n / ロケール](/ja/use-cases/i18n) |

### ストレージ

| ユースケース | 例 | ページ |
|---|---|---|
| 実 DB に永続化 | [`06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store)、[`07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) | [SQL ストア](/ja/use-cases/sql-store) |
| Hot / Cold 分離（Redis 揮発） | [`08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold)、[`09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) | [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) |

### スコープ / claim

| ユースケース | 例 | ページ |
|---|---|---|
| Public / Internal スコープ分離 | [`60-scopes-public-private`](https://github.com/libraz/go-oidc-provider/tree/main/examples/60-scopes-public-private) | [Public / Internal スコープ](/ja/use-cases/scopes) |
| OIDC §5.5 claims リクエスト | [`61-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/61-claims-request) | [Claims リクエスト](/ja/use-cases/claims-request) |

### 認証

| ユースケース | 例 | ページ |
|---|---|---|
| MFA、captcha、ステップアップ | [`20`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp)、[`21`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa)、[`22`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha)、[`23`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) | [MFA / ステップアップ](/ja/use-cases/mfa-step-up) |
| 既存ユーザーストアの投影 | [`24-byo-userstore`](https://github.com/libraz/go-oidc-provider/tree/main/examples/24-byo-userstore) | [既存ユーザーストアの投影](/ja/use-cases/byo-userstore) |

### Advanced grants

| ユースケース | 例 | ページ |
|---|---|---|
| Custom grant_type URN | [`30-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-custom-grant) | [Custom Grant](/ja/use-cases/custom-grant) |
| Device Code (RFC 8628) | [`31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) | [Device Code](/ja/use-cases/device-code) |
| CIBA poll mode | [`32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) | [CIBA](/ja/use-cases/ciba) |
| Token Exchange (RFC 8693) | [`33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation) | [Token Exchange](/ja/use-cases/token-exchange) |

### Crypto / subject

| ユースケース | 例 | ページ |
|---|---|---|
| Pairwise subject（OIDC Core §8.1） | [`34-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-pairwise-saas) | [Pairwise subject](/ja/use-cases/pairwise-subject) |
| Encrypted id_token（JWE） | [`35-encrypted-id-token`](https://github.com/libraz/go-oidc-provider/tree/main/examples/35-encrypted-id-token) | [JWE 暗号化](/ja/use-cases/jwe-encryption) |

### ガバナンス

| ユースケース | 例 | ページ |
|---|---|---|
| ファーストパーティ同意スキップ | [`40-first-party-skip-consent`](https://github.com/libraz/go-oidc-provider/tree/main/examples/40-first-party-skip-consent) | [ファーストパーティ同意スキップ](/ja/use-cases/first-party) |
| Dynamic Client Registration（RFC 7591） | [`41-dynamic-registration`](https://github.com/libraz/go-oidc-provider/tree/main/examples/41-dynamic-registration) | [Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| Back-Channel Logout 1.0 | [`42-back-channel-logout`](https://github.com/libraz/go-oidc-provider/tree/main/examples/42-back-channel-logout) | [Back-Channel Logout](/ja/use-cases/back-channel-logout) |

### 運用

| ユースケース | 例 | ページ |
|---|---|---|
| Prometheus メトリクス | [`52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics) | [Prometheus メトリクス](/ja/use-cases/prometheus) |

## 番号体系

例フォルダはトピック別にグループ化されています（時系列ではありません）。

| 帯  | トピック |
|-------|---------|
| 00–09 | bootstrap、core flow、profile、storage adapter |
| 10–19 | UI / browser integration（SPA、consent、chooser、CORS、i18n） |
| 20–29 | MFA、認証ルール、user-store projection |
| 30–39 | advanced grant、subject mode、encrypted token、federation |
| 40–49 | governance: first-party、DCR、back-channel logout |
| 50–59 | operations: FAPI helpers、metrics、tracing、DPoP nonce |
| 60–69 | scope、claim、compliance-adjacent example |

ソースリポジトリの README が一次インベントリです。
