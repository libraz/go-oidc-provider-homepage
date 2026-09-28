---
title: 使い方
description: upstream リポジトリで動作確認済みの本番形シナリオ。
pageClass: pg-use-cases-index
---

# 使い方

各カードはソースリポジトリの [`examples/`](https://github.com/libraz/go-oidc-provider/tree/main/examples) の実行可能例にマップされています。例は `example` build tag の背後でビルドされ、`go.sum` を肥大化させたり `go test ./...` に巻き込まれたりしません。

```sh
(cd examples/01-minimal && GOWORK=off go run -tags example .)
```

各ページは、おおよそ同じ判断の流れで読めるようにしています。

- **何を解決するか。** 冒頭で option 名だけでなく、その機能が必要になる背景を説明します。
- **使うべき状況。** 複雑な機能では、その複雑さを受け入れる価値がある構成を明示します。
- **使わない方がよい状況。** より単純な組み込み経路で足りる場合は、先にそちらへ誘導します。

初めて読む場合は [最小 OP](/ja/use-cases/minimal-op)、次に [Comprehensive bundle](/ja/use-cases/bundle) を確認し、自分の構成にその必要が出てきた段階で下の各ページへ進むのがおすすめです。

<figure class="fig">
  <div class="fig-head">このセクションの読み進め方</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-index-title" viewBox="0 0 960 254" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-index-title">最小構成の OP から始め、実際に必要になった領域へ進みます。プロファイルとフロー、UI、ストレージと認証、拡張グラント、暗号と運用の 5 つです。</title>
    <rect class="fg-box fg-box--accent" x="36" y="98" width="200" height="66" rx="8"/>
    <text class="fg-t2 fg-accent" x="56" y="126">最小構成の OP</text>
    <text class="fg-xs" x="56" y="146">まず起動させる</text>
    <path class="fg-leader" d="M240,131 H270 M270,43 V219"/>
    <path class="fg-edge fg-edge--thin" d="M270,43 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M270,87 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M270,131 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M270,175 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M270,219 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="300" y="24" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="47">プロファイルとフロー</text>
    <text class="fg-xs" x="470" y="47">FAPI、CIBA、デバイスコード、token exchange</text>
    <rect class="fg-box" x="300" y="68" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="91">UI と SPA</text>
    <text class="fg-xs" x="470" y="91">独自画面、アカウントチューザ、ステップアップ MFA</text>
    <rect class="fg-box" x="300" y="112" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="135">ストレージと認証</text>
    <text class="fg-xs" x="470" y="135">SQL、DynamoDB、Redis、自前のユーザストア</text>
    <rect class="fg-box" x="300" y="156" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="179">拡張グラント</text>
    <text class="fg-xs" x="470" y="179">grant management、authorization details、動的登録</text>
    <rect class="fg-box" x="300" y="200" width="624" height="38" rx="6"/>
    <text class="fg-t2" x="318" y="223">暗号と運用</text>
    <text class="fg-xs" x="470" y="223">JWE、pairwise subject、protected resource metadata</text>
  </svg>
  <figcaption class="fig-note">5 つの行は互いに独立しています。いま作っているものに合う行を選んでください。順番が決まっているのは左の箱だけです。</figcaption>
</figure>

## リファレンスアプリケーション

番号付きの example は 1 つのオプションを 200 〜 500 行で切り出したものです。[`sample/`](https://github.com/libraz/go-oidc-provider/tree/main/sample) はそれとは別で、example が飛ばしている「アカウントが生まれてから使われるまで」の一連の流れを扱います。`op/storeadapter/composite` で束ねた MySQL + Redis の上で動き、`docker compose up` 一発で次の範囲を通しで試せます。

- アプリケーション側が持つサインアップ
- Argon2id によるパスワード保管
- アプリケーション自身が実装する [`interaction.Driver`](/ja/use-cases/spa-custom-interaction) を通したログインと同意
- アカウント設定画面からの TOTP 登録
- round-trip を完了する RP

```sh
docker compose -f sample/compose.yaml up -d --build
```

Compose ファイルは OP と RP を `127.0.0.1` だけに公開します。サンプルは、アプリケーションが所有する POST 経路を double-submit 方式の CSRF トークンと `Origin` の確認で保護しています。パスワード変更と TOTP 登録の確定時には、`op.VerifyPassword` で現在のパスワードも確認します。これらの保護は OP の対話エンドポイントの外側にあり、アプリケーション側が担当します。

同意画面は scope 単位の granular consent の実装例になっています。これは[同梱の HTML driver](/ja/use-cases/custom-consent-ui) が意図的に提供していない部分です。ただしテンプレートではなくデモとして扱ってください。スキーマはあくまで一組み込み側のモデルで、署名鍵と cookie key は起動のたびに再生成され、公開ホスティングを想定した作りにもなっていません。

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
| OAuth 2.1 または既存 OIDC の姿勢を宣言 | [`00-security-profile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/00-security-profile) | [セキュリティプロファイルの宣言](/ja/use-cases/security-profile) |
| OIDC と並走する純粋 OAuth 2.0 | [`04-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/04-oauth2-only) | [OAuth 2.0（openid なし）](/ja/use-cases/oauth2-only) |
| FAPI 2.0 Baseline（ライブラリの PAR + JAR + DPoP 既定値） | [`03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) | [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) |
| Service-to-service token | [`05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) | [client_credentials](/ja/use-cases/client-credentials) |
| DPoP server nonce flow | [`51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) | [DPoP nonce](/ja/use-cases/dpop-nonce) |

### UI

| 使い方 | 例 | ページ |
|---|---|---|
| 組み込み HTML のログイン・同意・アカウント選択 | [`19-default-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/19-default-ui) | [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) |
| SPA から UI を扱う | [`16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction)、[`10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login)、[`17-spa-composite-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/17-spa-composite-store) | [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) |
| カスタム HTML 同意画面 | [`11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) | [カスタム同意 UI](/ja/use-cases/custom-consent-ui) |
| カスタム HTML アカウント選択 | [`12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) | [カスタムアカウント選択 UI](/ja/use-cases/custom-chooser-ui) |
| マルチアカウント選択（`prompt=select_account`） | [`13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) | [マルチアカウント選択](/ja/use-cases/multi-account) |
| クロスオリジン SPA (CORS) | [`14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa) | [SPA 向け CORS](/ja/use-cases/cors-spa) |
| ロケール解決 | [`15-i18n-locale`](https://github.com/libraz/go-oidc-provider/tree/main/examples/15-i18n-locale) | [i18n / ロケール](/ja/use-cases/i18n) |

### ストレージ

| 使い方 | 例 | ページ |
|---|---|---|
| 実 DB に永続化 | [`06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store)、[`07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) | [SQL ストア](/ja/use-cases/sql-store) |
| DynamoDB に永続化 | [`18-dynamodb-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/18-dynamodb-store) | [DynamoDB ストア](/ja/use-cases/dynamodb-store) |
| SQL アダプタのテーブル名を差し替える | [`25-byo-table-names`](https://github.com/libraz/go-oidc-provider/tree/main/examples/25-byo-table-names) | [SQL ストア § テーブル名を差し替える](/ja/use-cases/sql-store#テーブル名を差し替える) |
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
| Email OTP、recovery code、passkey | [`28-email-otp-recovery`](https://github.com/libraz/go-oidc-provider/tree/main/examples/28-email-otp-recovery)、[`29-passkey`](https://github.com/libraz/go-oidc-provider/tree/main/examples/29-passkey) | [MFA / ステップアップ](/ja/use-cases/mfa-step-up) |
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
| FAPI TLS ポリシーと public JWKS の読み込み | [`50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) | [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) |

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
