---
layout: home
title: go-oidc-provider — Go 用 OpenID Connect Provider ライブラリ
titleTemplate: false
description: 既存の Go アプリに http.Handler として OIDC Provider（Authorization Server）を組み込むライブラリ。本ライブラリの FAPI 2.0 Baseline / Message Signing プロファイルに対応します。
pageClass: pg-index
---

<figure class="fig">
  <div class="fig-head">プロバイダはアプリの中で動くハンドラ</div>
  <svg class="fig-svg" role="img" aria-labelledby="home-embed-title" viewBox="0 0 1440 472" xmlns="http://www.w3.org/2000/svg">
    <title id="home-embed-title">クライアントは HTTPS で OpenID Provider を呼び出す。プロバイダは http.Handler で、Go アプリが自分のルータの /oidc 配下にマウントする。discovery・JWKS・認可・トークン・userinfo・ログアウトのエンドポイントは常に提供し、PAR・introspection・失効・登録・デバイス・CIBA は機能を有効にしたときに加わる。ストレージ・署名鍵・ログインフローには op.New に渡したオプションを通してアクセスする。</title>
    <!-- 1440-wide viewBox: the landing column is ~1.6x a docs column, so this keeps the docs type scale at full width -->
    <text class="fg-lbl" x="32" y="52">クライアント</text>
    <rect class="fg-box" x="32" y="72" width="304" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="100">Web アプリ (RP)</text>
    <text class="fg-mxs fg-dim" x="48" y="124">confidential client</text>
    <text class="fg-xs fg-faint" x="48" y="148">認可コード + PKCE</text>
    <path class="fg-edge" d="M336,120 H430" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="200" width="304" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="228">SPA・モバイル・CLI</text>
    <text class="fg-mxs fg-dim" x="48" y="252">public client</text>
    <text class="fg-xs fg-faint" x="48" y="276">PKCE・デバイスコード</text>
    <path class="fg-edge" d="M336,248 H430" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="328" width="304" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="356">リソースサーバ</text>
    <text class="fg-mxs fg-dim" x="48" y="380">アクセストークンを検証</text>
    <text class="fg-xs fg-faint" x="48" y="404">JWKS・/introspect</text>
    <path class="fg-edge" d="M336,376 H430" marker-end="url(#fg-a)"/>
    <!-- application boundary -->
    <rect class="fg-frame fg-frame--dashed" x="400" y="24" width="1008" height="424" rx="8"/>
    <text class="fg-lbl" x="424" y="52">あなたの Go アプリ</text>
    <text class="fg-lbl" x="1384" y="52" text-anchor="end">渡すオプション</text>
    <!-- provider -->
    <rect class="fg-box fg-box--accent" x="432" y="72" width="576" height="352" rx="8"/>
    <text class="fg-t fg-accent" x="448" y="100">op.New(…)</text>
    <text class="fg-mxs fg-dim" x="448" y="124">/oidc にマウントする http.Handler</text>
    <path class="fg-rule" d="M448,144 H992"/>
    <text class="fg-lbl" x="448" y="176">常設</text>
    <text class="fg-m" x="448" y="204">/auth</text>
    <text class="fg-m" x="592" y="204">/jwks</text>
    <text class="fg-m" x="448" y="228">/token</text>
    <text class="fg-m" x="592" y="228">/end_session</text>
    <text class="fg-m" x="448" y="252">/userinfo</text>
    <text class="fg-m" x="448" y="276">/.well-known/openid-configuration</text>
    <path class="fg-rule" d="M776,160 V320"/>
    <text class="fg-lbl" x="800" y="176">有効化したとき</text>
    <text class="fg-m fg-dim" x="800" y="204">/par</text>
    <text class="fg-m fg-dim" x="800" y="228">/introspect</text>
    <text class="fg-m fg-dim" x="800" y="252">/revoke</text>
    <text class="fg-m fg-dim" x="800" y="276">/register</text>
    <text class="fg-m fg-dim" x="800" y="300">/device_authorization</text>
    <path class="fg-rule" d="M448,336 H992"/>
    <text class="fg-lbl" x="448" y="368">組み込み</text>
    <text class="fg-m" x="448" y="396">PKCE · PAR · JAR · JARM · DPoP · mTLS · FAPI 2.0 プロファイル</text>
    <!-- supplied through options -->
    <path class="fg-edge" d="M1008,120 H1070" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="1072" y="72" width="312" height="96" rx="8"/>
    <text class="fg-t2" x="1088" y="100">ストア</text>
    <text class="fg-mxs fg-accent" x="1088" y="124">WithStore</text>
    <text class="fg-xs fg-faint" x="1088" y="148">inmem · SQL · DynamoDB</text>
    <path class="fg-edge" d="M1008,248 H1070" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="1072" y="200" width="312" height="96" rx="8"/>
    <text class="fg-t2" x="1088" y="228">署名鍵</text>
    <text class="fg-mxs fg-accent" x="1088" y="252">WithKeyset</text>
    <text class="fg-xs fg-faint" x="1088" y="276">ES256 · ローテーション</text>
    <path class="fg-edge" d="M1008,376 H1070" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="1072" y="328" width="312" height="96" rx="8"/>
    <text class="fg-t2" x="1088" y="356">ログインフロー</text>
    <text class="fg-mxs fg-accent" x="1088" y="380">WithLoginFlow</text>
    <text class="fg-xs fg-faint" x="1088" y="404">password · TOTP · passkey</text>
  </svg>
  <figcaption class="fig-note">別のサーバを立てるわけではなく、net/http・chi・gin など任意のルータにマウントします。ストレージ・鍵・ログインはアプリ側の部品で、プロバイダはそれを呼び出します。ログとメトリクスも同じく <code>WithLogger</code> と <code>WithPrometheus</code> で渡します。</figcaption>
</figure>

## 代表的なユースケース

代表的な構成を 5 つ挙げます。いずれも upstream リポジトリに動作する実例があります。

### 1. 最小構成の OP を立ち上げる

```go
package main

import (
  "log"
  "net/http"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

func main() {
  st := inmem.New()
  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(st),
    op.WithKeyset(myKeyset),     // クイックスタート: 揮発鍵の生成例あり
    op.WithCookieKeys(cookieKey), // 32 バイト — AES-256-GCM
    op.WithLoginFlow(op.LoginFlow{
      Primary: op.PrimaryPassword{Store: st.UserPasswords()},
    }),
  )
  if err != nil {
    log.Fatal(err)
  }
  log.Fatal(http.ListenAndServe(":8080", handler))
}
```

> [`examples/01-minimal`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) と [クイックスタート](/ja/getting-started/minimal) を参照。

### 2. 本ライブラリの FAPI 2.0 Baseline プロファイルで OP を動かす

```go
st := inmem.New()
clientJWKS, _ := op.LoadPublicJWKS("conformance/keys/fapi-client.jwks.json")
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(op.LoginFlow{
    Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  }),
  op.WithProfile(profile.FAPI2Baseline), // 本ライブラリのプロファイル: PAR + JAR、DPoP 既定、ES256
  op.WithStaticClients(op.PrivateKeyJWTClient{
    ID: "demo-fapi",
    JWKS: clientJWKS,
    RedirectURIs: []string{"https://app.example.com/callback"},
    Scopes: []string{"openid", "profile"},
  }),
)
```

::: tip プロファイル 1 行で済む理由
`op.WithProfile(profile.FAPI2Baseline)` は、本ライブラリの FAPI プロファイル方針をまとめて適用します。`PAR` と `JAR` を有効化し、`token_endpoint_auth_methods_supported` をプロファイルの許可リストに絞り込み、mTLS を明示していない場合は DPoP を既定で選びます。OP 発行 JWT の署名は ES256 を使います。FAPI 2.0 Security Profile（Final）が要求するのは PAR、S256 の PKCE、送信者制約付きトークンです。JAR と ES256 固定は本ライブラリのプロファイル設定です。詳細は [ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を参照してください。
:::

### 3. バックエンド向けトークンを発行する（エンドユーザなし）

```go
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithGrants(grant.ClientCredentials),
  op.WithStaticClients(op.ConfidentialClient{
    ID: "backend-service",
    Secret: "cc-demo-secret-rotate-me",
    AuthMethod: op.AuthClientSecretBasic,
    GrantTypes: []string{"client_credentials"},
    Scopes: []string{"api:read"},
  }),
  op.WithScope(op.PublicScope("api:read", "API リソースの読み取り")),
)
```

> [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) と [ユースケース: client_credentials](/ja/use-cases/client-credentials) を参照。

### 4. ログイン・同意・ログアウトを SPA から扱う

```go
st := inmem.New()
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(op.LoginFlow{
    Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  }),
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "../internal/webui/static",
  }),
)
```

::: info UI オプション
`op.WithSPAUI` / `op.WithConsentUI` / `op.WithChooserUI` は、OP 側で SPA の入口を公開する構成、独自の同意テンプレート、独自のアカウント選択テンプレートを扱うためのオプションです。SPA の配信を自前のルータで行いたい場合は `interaction.JSONDriver` も使えます。詳細は [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) と [ユースケース: SPA](/ja/use-cases/spa-custom-interaction) を参照してください。
:::

### 5. 永続ストアと揮発ストアを分離する

```go
import (
  "context"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/composite"
  oidcredis "github.com/libraz/go-oidc-provider/op/storeadapter/redis"
  oidcsql "github.com/libraz/go-oidc-provider/op/storeadapter/sql"
)

durable, _  := oidcsql.New(db, oidcsql.MySQL())
volatile, _ := oidcredis.New(context.Background(),
  oidcredis.WithDSN("rediss://redis:6380/0"),
  oidcredis.WithRedisAuth(redisUser, redisPassword),
)
combined, _ := composite.New(
  composite.WithDefault(durable), // 残りはすべて永続側。消費済み JTI のマーカーも含む
  composite.With(composite.Sessions, volatile),
  composite.With(composite.Interactions, volatile),
)

loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: durable.UserPasswords()}}
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(combined),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(loginFlow),
)
```

> [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) と [ユースケース: Hot / Cold 分離](/ja/use-cases/hot-cold-redis) を参照。

---

## どこから読むか

| あなたの状況 | 最初に読むページ |
|---|---|
| OAuth 2.0 / OIDC が初めて | [OAuth 2.0 / OIDC 入門](/ja/concepts/oauth2-oidc-primer)、続いて [最小構成 OP](/ja/getting-started/minimal) |
| すぐ動かしたい | [インストール](/ja/getting-started/install)、[必須オプション](/ja/getting-started/required-options)、[ルータへのマウント](/ja/getting-started/mount) |
| 採用を判断したい | [go-oidc-provider とは](/ja/why)、[セキュリティ方針](/ja/security/posture)、[FAQ](/ja/faq) |
| 具体的な構成を探している | [ユースケース](/ja/use-cases/) |

## インストール

```sh
go get github.com/libraz/go-oidc-provider@v1.4.0
```

::: info 安定 API
`op.New` と同梱ストレージアダプタだけで構成した場合は、通常そのまま更新できます。独自のストアやその他の拡張を組み込んでいる場合は、更新前に [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) の移行案内を確認してください。godoc が `Experimental:` で始まる symbol は通常のマイナーリリース例外で、変更される可能性があります。
:::

## ライセンスと関連情報

Apache-2.0。ソースは [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider)。脆弱性報告は [SECURITY.md](https://github.com/libraz/go-oidc-provider/blob/main/.github/SECURITY.md) を参照してください。
