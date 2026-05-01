---
layout: home
title: go-oidc-provider — Go 用 OpenID Connect Provider ライブラリ
titleTemplate: false
description: 既存の Go アプリに http.Handler として OIDC Provider（Authorization Server）を組み込むライブラリ。FAPI 2.0 Baseline / Message Signing をターゲット。

hero:
  name: 'go-oidc-provider'
  text: 'http.Handler として組み込める OIDC Provider'
  tagline: Go 製の Authorization Server ライブラリ。PAR / JAR / DPoP / mTLS / PKCE 内蔵。FAPI 2.0 Baseline・Message Signing 対応を目標としています。
  actions:
    - theme: brand
      text: GitHub で見る
      link: https://github.com/libraz/go-oidc-provider
    - theme: alt
      text: クイックスタート
      link: /ja/getting-started/install
    - theme: alt
      text: go-oidc-provider とは
      link: /ja/why

features:
  - icon:
      src: /icons/plug.svg
    title: http.Handler として組み込み
    details: '`op.New(...)` が `http.Handler` を返すだけ。net/http、chi、gin などお好みのルーターに、お好みの prefix でマウントできます。フレームワーク lock-in もグローバル状態もありません。'
  - icon:
      src: /icons/shield.svg
    title: FAPI 2.0 を 1 行で
    details: '`op.WithProfile(profile.FAPI2Baseline)` で PAR + JAR + DPoP を有効化、alg リストをロックし、discovery を絞り込みます。'
  - icon:
      src: /icons/key.svg
    title: 既存ストレージに接続
    details: 既存の users テーブルに合わせる小さな Store インターフェース。`inmem` / `sql` / `redis` / `composite` の参照アダプタを同梱、DynamoDB は予定。
  - icon:
      src: /icons/refresh-cw.svg
    title: リフレッシュトークンのローテーション
    details: 再利用検知付きで自動ローテーション、リトライ向けの grace 期間、`offline_access` の TTL を分離する仕組みで「ログイン状態の維持」を監査ログに残せます。
  - icon:
      src: /icons/check-circle.svg
    title: OFCS 検査済み
    details: 'OpenID Foundation の Conformance Suite で 3 plan・138 PASSED / 0 FAILED を維持。リリースごとに回帰検査します。'
  - icon:
      src: /icons/globe.svg
    title: SPA フレンドリー
    details: ヘッドレスな interaction driver でログイン・同意・ログアウトを React SPA から制御できます。CORS allowlist は登録済みの redirect_uri から自動導出。
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
    op.WithCookieKey(cookieKey), // 32 バイト — AES-256-GCM
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
  op.WithCookieKey(cookieKey),
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
  op.WithCookieKey(cookieKey),
  op.WithGrants(grant.ClientCredentials, grant.AuthorizationCode, grant.RefreshToken),
)
```

> [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) と [ユースケース: client_credentials](/ja/use-cases/client-credentials) を参照。

### 4. ログイン・同意・ログアウトを SPA から駆動する

```go
handler, _ := op.New(
  /* 必須オプション */
  op.WithSPAUI(op.SPAUI{ /* SPA エンドポイント */ }),
  op.WithCORSOrigins("https://app.example.com"),
)
```

> [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) と [ユースケース: SPA](/ja/use-cases/spa-custom-interaction) を参照。

### 5. 永続ストアと揮発ストアを分離する

```go
import (
  "github.com/libraz/go-oidc-provider/op/storeadapter/composite"
  "github.com/libraz/go-oidc-provider/op/storeadapter/sql"
  "github.com/libraz/go-oidc-provider/op/storeadapter/redis"
)

durable, _ := sql.Open(/* MySQL DSN */)
volatile, _ := redis.Open(/* rediss:// */)
combined  := composite.New(durable, volatile)

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
