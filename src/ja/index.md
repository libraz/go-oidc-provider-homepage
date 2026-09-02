---
layout: home
title: go-oidc-provider — Go 用 OpenID Connect Provider ライブラリ
titleTemplate: false
description: 既存の Go アプリに http.Handler として OIDC Provider（Authorization Server）を組み込むライブラリ。FAPI 2.0 Baseline / Message Signing に対応します。
pageClass: pg-index
---

<svg role="img" aria-labelledby="home-embed-title" viewBox="0 0 760 280" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="home-embed-title">go-oidc-provider は既存の Go アプリに http.Handler として組み込み、OP エンドポイント、ストア、ログ、鍵をアプリ側の運用基盤に接続する。</title>
  <rect class="home-box" x="34" y="92" width="156" height="82" rx="8"/>
  <text class="home-text" x="112" y="124" text-anchor="middle">既存 Go アプリ</text>
  <text class="home-sub" x="112" y="146" text-anchor="middle">router / middleware</text>

  <rect class="home-main" x="286" y="74" width="190" height="118" rx="8"/>
  <text class="home-text" x="381" y="108" text-anchor="middle">OIDC Provider</text>
  <text class="home-sub" x="381" y="130" text-anchor="middle">http.Handler</text>
  <text class="home-sub" x="381" y="152" text-anchor="middle">/oidc/auth /oidc/token</text>
  <text class="home-sub" x="381" y="170" text-anchor="middle">/oidc/jwks</text>

  <rect class="home-box" x="570" y="34" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="68" text-anchor="middle">Store</text>
  <rect class="home-box" x="570" y="112" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="146" text-anchor="middle">Keyset</text>
  <rect class="home-box" x="570" y="190" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="224" text-anchor="middle">ログ / 監査</text>

  <path class="home-flow" d="M190 133 H286"/>
  <path class="home-flow" d="M277 129 L286 133 L277 137"/>
  <text class="home-sub halo" x="238" y="137" text-anchor="middle">マウント</text>
  <path class="home-flow" d="M476 116 C520 96 530 62 570 62"/>
  <path class="home-flow" d="M561 58 L570 62 L561 66"/>
  <path class="home-flow" d="M476 140 H570"/>
  <path class="home-flow" d="M561 136 L570 140 L561 144"/>
  <path class="home-flow" d="M476 164 C520 184 530 218 570 218"/>
  <path class="home-flow" d="M561 214 L570 218 L561 222"/>
</svg>

## 代表的な使い方

本ライブラリでよく作る構成を 5 つ挙げます。いずれもリポジトリに動作する実例があります。

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

### 2. FAPI 2.0 Baseline 対応の OP を動かす

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
  op.WithProfile(profile.FAPI2Baseline), // PAR + JAR、DPoP 既定、ES256、FAPI 絞り込み
  op.WithStaticClients(op.PrivateKeyJWTClient{
    ID: "demo-fapi",
    JWKS: clientJWKS,
    RedirectURIs: []string{"https://app.example.com/callback"},
    Scopes: []string{"openid", "profile"},
  }),
)
```

::: tip プロファイル 1 行で済む理由
`op.WithProfile(profile.FAPI2Baseline)` は、プロファイルが必須とする機能（`PAR`、`JAR`）を有効化し、`token_endpoint_auth_methods_supported` を FAPI 許可リストに絞り込みます。mTLS を明示していない場合は DPoP を既定で選び、discovery 文書もそれに合わせて調整します。詳細は [使い方: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を参照してください。
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

> [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) と [使い方: client_credentials](/ja/use-cases/client-credentials) を参照。

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
`op.WithSPAUI` / `op.WithConsentUI` / `op.WithChooserUI` は、OP 側で SPA の入口を公開する構成、独自の同意テンプレート、独自のアカウント選択テンプレートを扱うためのオプションです。SPA の配信を自前のルータで行いたい場合は `interaction.JSONDriver` も使えます。詳細は [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) と [使い方: SPA](/ja/use-cases/spa-custom-interaction) を参照してください。
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
  composite.WithDefault(durable),
  composite.With(composite.Sessions, volatile),
  composite.With(composite.Interactions, volatile),
  composite.With(composite.ConsumedJTIs, volatile),
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

> [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) と [使い方: Hot / Cold 分離](/ja/use-cases/hot-cold-redis) を参照。

---

## インストール

```sh
go get github.com/libraz/go-oidc-provider/op@v1.2.0
```

::: info 安定 API
`op.New` と同梱ストレージアダプタだけで構成した場合は、通常そのまま更新できます。独自のストアやその他の拡張を組み込んでいる場合は、更新前に [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) の移行案内を確認してください。godoc が `Experimental:` で始まる symbol は通常のマイナーリリース例外で、変更される可能性があります。
:::

## ライセンスと関連情報

Apache-2.0。ソースは [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider)。脆弱性報告は [SECURITY.md](https://github.com/libraz/go-oidc-provider/blob/main/SECURITY.md) を参照してください。
