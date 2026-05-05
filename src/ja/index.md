---
layout: home
title: go-oidc-provider — Go 用 OpenID Connect Provider ライブラリ
titleTemplate: false
description: 既存の Go アプリに http.Handler として OIDC Provider（Authorization Server）を組み込むライブラリ。FAPI 2.0 Baseline / Message Signing をターゲット。
---

## 代表的なユースケース

このライブラリでよく作られる構成を 5 つ。それぞれ動作する例があります。

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
  op.WithProfile(profile.FAPI2Baseline), // PAR + JAR + DPoP、ES256、alg ロック
  op.WithStaticClients(/* JWKS 付き private_key_jwt クライアント */),
)
```

::: tip プロファイル 1 行で済む理由
`op.WithProfile(profile.FAPI2Baseline)` だけで、必要な feature（`PAR`、`JAR`、`DPoP`）の有効化、`token_endpoint_auth_methods_supported` の FAPI allow-list との絞り込み、discovery の引き締めまでまとめて行います。詳細は [ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline)。
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

> [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) と [ユースケース: client_credentials](/ja/use-cases/client-credentials) を参照。

### 4. ログイン・同意・ログアウトを SPA から駆動する

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

handler, _ := op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
  op.WithCORSOrigins("https://app.example.com"),
)
```

::: warning v0.9.x — UI オプションはまだ未実装
`op.WithSPAUI` / `op.WithConsentUI` / `op.WithChooserUI` は v1.0 向けに型だけ予約されており、現状で設定すると `op.New` が構成エラーを返します。UI マウントが着地するまでは、`interaction.JSONDriver` で JSON を返す構成にして、SPA shell は自前のルーターで配信してください。詳細は [ユースケース: SPA](/ja/use-cases/spa-custom-interaction)。
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

> [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) と [ユースケース: Hot / Cold 分離](/ja/use-cases/hot-cold-redis) を参照。

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
