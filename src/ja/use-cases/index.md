---
title: 使い方
description: upstream リポジトリで動作確認済みの本番形シナリオ。
---

# 使い方

各カードはソースリポジトリの [`examples/`](https://github.com/libraz/go-oidc-provider/tree/main/examples) の実行可能例にマップされています。例は `example` build tag の背後でビルドされ、`go.sum` を肥大化させたり `go test ./...` に巻き込まれたりしません。

```sh
(cd examples/01-minimal && go run -tags example .)
```

各ページは、おおよそ同じ判断の流れで読めるようにしています。

- **何を解決するか。** 冒頭で option 名だけでなく、その機能が必要になる背景を説明します。
- **使うべき状況。** 複雑な機能では、その複雑さを受け入れる価値がある構成を明示します。
- **使わない方がよい状況。** より単純な組み込み経路で足りる場合は、先にそちらへ誘導します。

初めて読む場合は [最小 OP](/ja/use-cases/minimal-op)、次に [Comprehensive bundle](/ja/use-cases/bundle) を確認し、自分の構成にその必要が出てきた段階で下の各ページへ進むのがおすすめです。

<svg role="img" aria-labelledby="use-cases-route-title" viewBox="0 0 760 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:100%;max-width:780px;height:auto;margin:1.5rem auto;">
  <title id="use-cases-route-title">使い方ページの読み進め方: 最小 OP から始め、必要に応じてプロファイル、UI、ストレージ、認証、拡張 grant、運用へ進む。</title>
<rect class="uc-main" x="36" y="106" width="146" height="74" rx="8"/>
  <text class="uc-text" x="109" y="136" text-anchor="middle">最小 OP</text>
  <text class="uc-sub" x="109" y="158" text-anchor="middle">まず起動する</text>

  <rect class="uc-box" x="282" y="28" width="156" height="54" rx="8"/>
  <text class="uc-text" x="360" y="62" text-anchor="middle">Profile / flow</text>
  <rect class="uc-box" x="282" y="104" width="156" height="54" rx="8"/>
  <text class="uc-text" x="360" y="138" text-anchor="middle">UI / SPA</text>
  <rect class="uc-box" x="282" y="180" width="156" height="54" rx="8"/>
  <text class="uc-text" x="360" y="214" text-anchor="middle">Storage / Auth</text>

  <rect class="uc-box" x="552" y="68" width="156" height="54" rx="8"/>
  <text class="uc-text" x="630" y="102" text-anchor="middle">Advanced grants</text>
  <rect class="uc-box" x="552" y="160" width="156" height="54" rx="8"/>
  <text class="uc-text" x="630" y="194" text-anchor="middle">Crypto / 運用</text>

  <path class="uc-flow" d="M182 143 C224 102 244 56 278 56"/>
  <path class="uc-flow" d="M182 143 H278"/>
  <path class="uc-flow" d="M182 143 C224 178 244 208 278 208"/>
  <path class="uc-flow" d="M438 82 C488 86 506 96 548 96"/>
  <path class="uc-flow" d="M540 92 L549 96 L540 100"/>
  <path class="uc-flow" d="M438 204 C488 198 506 188 548 188"/>
  <path class="uc-flow" d="M540 184 L549 188 L540 192"/>
</svg>

## 一覧

各 example フォルダはいずれかのページに対応しています。

### Bootstrap / wiring

| 使い方 | 例 | ページ |
|---|---|---|
| 最小 OP | [`01-minimal`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) | [最小 OP](/ja/use-cases/minimal-op) |
| 典型的な option をまとめた構成 | [`02-bundle`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle) | [Comprehensive bundle](/ja/use-cases/bundle) |

### Profile / flow

| 使い方 | 例 | ページ |
|---|---|---|
| OIDC と並走する純粋 OAuth 2.0 | [`04-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/04-oauth2-only) | [OAuth 2.0（openid なし）](/ja/use-cases/oauth2-only) |
| FAPI 2.0 Baseline (PAR + JAR + DPoP) | [`03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) | [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) |
| Service-to-service token | [`05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) | [client_credentials](/ja/use-cases/client-credentials) |
| DPoP server nonce flow | [`51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) | [DPoP nonce](/ja/use-cases/dpop-nonce) |

### UI

| 使い方 | 例 | ページ |
|---|---|---|
| SPA から UI を扱う | [`16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction)、[`10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) | [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) |
| カスタム HTML 同意画面 | [`11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) | [カスタム同意 UI](/ja/use-cases/custom-consent-ui) |
| カスタム HTML アカウント選択 | [`12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) | [カスタムアカウント選択 UI](/ja/use-cases/custom-chooser-ui) |
| マルチアカウント選択（`prompt=select_account`） | [`13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) | [マルチアカウント選択](/ja/use-cases/multi-account) |
| クロスオリジン SPA (CORS) | [`14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa) | [SPA 向け CORS](/ja/use-cases/cors-spa) |
| ロケール解決 | [`15-i18n-locale`](https://github.com/libraz/go-oidc-provider/tree/main/examples/15-i18n-locale) | [i18n / ロケール](/ja/use-cases/i18n) |

### ストレージ

| 使い方 | 例 | ページ |
|---|---|---|
| 実 DB に永続化 | [`06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store)、[`07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) | [SQL ストア](/ja/use-cases/sql-store) |
| SQL アダプタのテーブル名を差し替える | [`25-byo-table-names`](https://github.com/libraz/go-oidc-provider/tree/main/examples/25-byo-table-names) | [SQL ストア § テーブル名を差し替える](/ja/use-cases/sql-store#テーブル名を差し替える) |
| ストアをゼロから実装する | [`26-byo-store-from-scratch`](https://github.com/libraz/go-oidc-provider/tree/main/examples/26-byo-store-from-scratch) | [ストアバックエンドを自前実装する](/ja/use-cases/byo-store) |
| Hot / Cold 分離（Redis 揮発） | [`08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold)、[`09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) | [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) |

### スコープ / claim

| 使い方 | 例 | ページ |
|---|---|---|
| Public / Internal スコープ分離 | [`60-scopes-public-private`](https://github.com/libraz/go-oidc-provider/tree/main/examples/60-scopes-public-private) | [Public / Internal スコープ](/ja/use-cases/scopes) |
| OIDC §5.5 claims リクエスト | [`61-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/61-claims-request) | [Claims リクエスト](/ja/use-cases/claims-request) |

### 認証

| 使い方 | 例 | ページ |
|---|---|---|
| MFA、captcha、ステップアップ | [`20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp)、[`21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa)、[`22-login-captcha`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha)、[`23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) | [MFA / ステップアップ](/ja/use-cases/mfa-step-up) |
| 既存ユーザストアの投影 | [`24-byo-userstore`](https://github.com/libraz/go-oidc-provider/tree/main/examples/24-byo-userstore) | [既存ユーザストアの投影](/ja/use-cases/byo-userstore) |

### Advanced grants

| 使い方 | 例 | ページ |
|---|---|---|
| Custom grant_type URN | [`30-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-custom-grant) | [Custom Grant](/ja/use-cases/custom-grant) |
| Device Code (RFC 8628) | [`31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) | [Device Code](/ja/use-cases/device-code) |
| CIBA poll mode | [`32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) | [CIBA](/ja/use-cases/ciba) |
| Token Exchange (RFC 8693) | [`33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation) | [Token Exchange](/ja/use-cases/token-exchange) |

### Crypto / subject

| 使い方 | 例 | ページ |
|---|---|---|
| Pairwise subject（OIDC Core §8.1） | [`34-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-pairwise-saas) | [Pairwise subject](/ja/use-cases/pairwise-subject) |
| Encrypted id_token（JWE） | [`35-encrypted-id-token`](https://github.com/libraz/go-oidc-provider/tree/main/examples/35-encrypted-id-token) | [JWE 暗号化](/ja/use-cases/jwe-encryption) |

### ガバナンス

| 使い方 | 例 | ページ |
|---|---|---|
| ファーストパーティ同意スキップ | [`40-first-party-skip-consent`](https://github.com/libraz/go-oidc-provider/tree/main/examples/40-first-party-skip-consent) | [ファーストパーティ同意スキップ](/ja/use-cases/first-party) |
| Dynamic Client Registration（RFC 7591） | [`41-dynamic-registration`](https://github.com/libraz/go-oidc-provider/tree/main/examples/41-dynamic-registration) | [Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| Back-Channel Logout 1.0 | [`42-back-channel-logout`](https://github.com/libraz/go-oidc-provider/tree/main/examples/42-back-channel-logout) | [Back-Channel Logout](/ja/use-cases/back-channel-logout) |

### 運用

| 使い方 | 例 | ページ |
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
