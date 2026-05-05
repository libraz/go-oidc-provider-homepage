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

### 基本構成

| ユースケース | 例 | ページ |
|---|---|---|
| 最小構成 OP | [`01-minimal`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) | [最小構成 OP](/ja/use-cases/minimal-op) |
| 総合バンドル（典型的な組み込み側が触るオプション一式） | [`02-bundle`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle) | [総合バンドル](/ja/use-cases/bundle) |

### プロファイル / フロー

| ユースケース | 例 | ページ |
|---|---|---|
| FAPI 2.0 Baseline (PAR + JAR + DPoP) | [`03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2)、[`50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) | [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) |
| サービス間トークン | [`05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) | [client_credentials](/ja/use-cases/client-credentials) |
| OIDC と並走する純粋 OAuth 2.0 | [`15-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/15-oauth2-only) | [OAuth 2.0（openid なし）](/ja/use-cases/oauth2-only) |
| DPoP サーバ nonce フロー | [`51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) | [DPoP nonce フロー](/ja/use-cases/dpop-nonce) |

### Grant — 既定外 URN

| ユースケース | 例 | ページ |
|---|---|---|
| カスタム grant_type URN | [`19-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/19-custom-grant) | [Custom Grant](/ja/use-cases/custom-grant) |
| Device Code（RFC 8628） | [`30-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-device-code-cli) | [Device Code](/ja/use-cases/device-code) |
| CIBA poll mode | [`31-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-ciba-pos) | [CIBA](/ja/use-cases/ciba) |
| Token Exchange（RFC 8693） | [`32-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-token-exchange-delegation) | [Token Exchange](/ja/use-cases/token-exchange) |

### 暗号化 / subject

| ユースケース | 例 | ページ |
|---|---|---|
| Pairwise subject（OIDC Core §8.1） | [`33-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-pairwise-saas) | [Pairwise subject](/ja/use-cases/pairwise-subject) |
| Encrypted id_token（JWE） | [`34-encrypted-id-token`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-encrypted-id-token) | [JWE 暗号化](/ja/use-cases/jwe-encryption) |

### UI

| ユースケース | 例 | ページ |
|---|---|---|
| SPA から UI 駆動 | [`04-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/04-custom-interaction) + [`10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) | [SPA / カスタム interaction](/ja/use-cases/spa-custom-interaction) |
| カスタム HTML 同意画面 | [`11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) | [カスタム同意 UI](/ja/use-cases/custom-consent-ui) |
| マルチアカウントチューザ（`prompt=select_account`） | [`13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) | [マルチアカウントチューザ](/ja/use-cases/multi-account) |
| クロスオリジン SPA (CORS) | [`14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa) | [SPA 向け CORS](/ja/use-cases/cors-spa) |
| ロケールネゴシエーション | [`16-i18n-locale`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-i18n-locale) | [i18n / ロケール](/ja/use-cases/i18n) |

### ストレージ

| ユースケース | 例 | ページ |
|---|---|---|
| 実 DB に永続化 | [`06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store)、[`07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) | [SQL ストア](/ja/use-cases/sql-store) |
| Hot/Cold 分離（Redis 揮発） | [`08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold)、[`09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) | [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) |

### スコープ / claim

| ユースケース | 例 | ページ |
|---|---|---|
| Public / Internal スコープ分離 | [`12-scopes-public-private`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-scopes-public-private) | [Public / Internal スコープ](/ja/use-cases/scopes) |
| OIDC §5.5 claims リクエスト | [`17-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/17-claims-request) | [Claims リクエスト](/ja/use-cases/claims-request) |

### 認証

| ユースケース | 例 | ページ |
|---|---|---|
| MFA、captcha、ステップアップ | [`20`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp)、[`21`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa)、[`22`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha)、[`23`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) | [MFA / ステップアップ](/ja/use-cases/mfa-step-up) |

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

例フォルダはトピック別にグループ化されています（時系列ではない）。

| 帯  | トピック                                                                       |
|-------|------------------------------------------------------------------------------|
| 00–09 | bootstrap、grant variants、storage adapter                                   |
| 10–19 | UI、scope、SPA、locale、claims request、CORS、custom grant、BYO              |
| 20–29 | MFA と認証ルール（TOTP / risk / captcha / step-up）                          |
| 30–39 | 既定外 grant + 暗号化（device code、CIBA、token exchange、JWE）              |
| 40–49 | governance: first-party、DCR、back-channel logout                            |
| 50–59 | operations: FAPI helpers、metrics、tracing、DPoP nonce                       |
| 60–69 | compliance（予約 — v1.x 後期）                                               |

（予約帯は in-flight / v1.x 作業のプレースホルダ。ソースリポジトリの README が一次インベントリです。）
