---
layout: home
title: go-oidc-provider — Go 用 OpenID Connect Provider ライブラリ
titleTemplate: false
description: 既存の Go アプリに http.Handler として OIDC Provider（Authorization Server）を組み込むライブラリ。FAPI 2.0 Baseline / Message Signing に対応します。
---

<svg role="img" aria-labelledby="home-embed-title" viewBox="0 0 760 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:100%;max-width:780px;height:auto;margin:1.5rem auto;">
  <title id="home-embed-title">go-oidc-provider は既存の Go アプリに http.Handler として組み込み、OP エンドポイント、ストア、ログ、鍵をアプリ側の運用基盤に接続する。</title>
<rect class="home-box" x="34" y="92" width="156" height="82" rx="8"/>
  <text class="home-text" x="112" y="124" text-anchor="middle">既存 Go アプリ</text>
  <text class="home-sub" x="112" y="146" text-anchor="middle">router / middleware</text>

  <rect class="home-main" x="302" y="78" width="156" height="110" rx="8"/>
  <text class="home-text" x="380" y="116" text-anchor="middle">OIDC Provider</text>
  <text class="home-sub" x="380" y="138" text-anchor="middle">http.Handler</text>
  <text class="home-sub" x="380" y="156" text-anchor="middle">/authorize /token /jwks</text>

  <rect class="home-box" x="570" y="34" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="68" text-anchor="middle">Store</text>
  <rect class="home-box" x="570" y="112" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="146" text-anchor="middle">Keyset</text>
  <rect class="home-box" x="570" y="190" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="224" text-anchor="middle">ログ / 監査</text>

  <path class="home-flow" d="M190 134 H298"/>
  <text class="home-sub" x="244" y="120" text-anchor="middle">Mount</text>
  <path class="home-flow" d="M290 130 L299 134 L290 138"/>
  <path class="home-flow" d="M458 116 C504 86 520 62 566 62"/>
  <path class="home-flow" d="M558 58 L567 62 L558 66"/>
  <path class="home-flow" d="M458 134 H566"/>
  <path class="home-flow" d="M558 130 L567 134 L558 138"/>
  <path class="home-flow" d="M458 152 C504 178 520 218 566 218"/>
  <path class="home-flow" d="M558 214 L567 218 L558 222"/>
</svg>

## 代表的な使い方

このライブラリでよく作る構成を 5 つ挙げます。どれも動作する例があります。

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
  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(myKeyset),     // クイックスタート: 揮発鍵の生成例あり
    op.WithCookieKeys(cookieKey), // 32 バイト — AES-256-GCM
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
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithProfile(profile.FAPI2Baseline), // PAR + JAR、DPoP 既定、ES256、FAPI 絞り込み
  op.WithStaticClients(/* JWKS 付き private_key_jwt クライアント */),
)
```

::: tip プロファイル 1 行で済む理由
`op.WithProfile(profile.FAPI2Baseline)` だけで、プロファイルが必須とする機能（`PAR`、`JAR`）の有効化、`token_endpoint_auth_methods_supported` の FAPI 許可リストへの絞り込み、mTLS が明示されていない場合の DPoP 既定選択、discovery 文書の調整までまとめて行います。詳細は [使い方: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline)。
:::

### 3. バックエンド向けトークンを発行する（エンドユーザなし）

```go
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithGrants(grant.ClientCredentials, grant.AuthorizationCode, grant.RefreshToken),
)
```

> [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) と [使い方: client_credentials](/ja/use-cases/client-credentials) を参照。

### 4. ログイン・同意・ログアウトを SPA から扱う

```go
handler, _ := op.New(
  /* 必須オプション */
  op.WithLoginFlow(flow),
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "./web/static",
  }),
)
```

::: info UI オプション
`op.WithSPAUI` / `op.WithConsentUI` / `op.WithChooserUI` は、OP 側で SPA の入口を公開する構成、独自の同意テンプレート、独自のアカウント選択テンプレートを扱うためのオプションです。SPA の配信を自前のルーターで行いたい場合は `interaction.JSONDriver` も使えます。詳細は [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) と [使い方: SPA](/ja/use-cases/spa-custom-interaction) を参照してください。
:::

### 5. 永続ストアと揮発ストアを分離する

```go
import (
  "context"

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

handler, _ := op.New(
  op.WithStore(combined),
  /* … */
)
```

> [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) と [使い方: Hot / Cold 分離](/ja/use-cases/hot-cold-redis) を参照。

---

## インストール

```sh
go get github.com/libraz/go-oidc-provider/op@latest
```

::: warning Pre-v1.0
本ライブラリは **pre-v1.0** です。v1.0.0 までは minor リリースに破壊的変更が入る可能性があります。v1.0 以降は SemVer の厳格運用に切り替わります。詳細は [README の status 注記](https://github.com/libraz/go-oidc-provider#status) を参照してください。
:::

## ライセンス

Apache-2.0。ソースは [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider)。脆弱性報告は [SECURITY.md](https://github.com/libraz/go-oidc-provider/blob/main/SECURITY.md) を参照してください。
