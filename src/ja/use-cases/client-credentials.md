---
title: サービス間（client_credentials）
description: バックエンド間トークン、エンドユーザ無し、同意無し。
pageClass: pg-use-cases-client-credentials
---

# 使い方 — サービス間（`client_credentials`）

## `client_credentials` グラントとは

OAuth 2.0 にはクライアントがアクセストークンを取得するための「grant type」が 4 種類あります。3 つは人間を介し（`authorization_code` / `device_code` / 非推奨の `password`）、1 つは介しません。

**`client_credentials`**（RFC 6749 §4.4）は人を介さないケース用です。Service A が登録済みの `client_id` + 認証情報を持ち、`/token` でそれを直接アクセストークンに交換します。トークンは **サービス自身** を表現するため、`id_token` も `refresh_token` も同意画面もありません（再発行は安いので refresh は不要）。

cron ジョブ、webhook、マイクロサービス間呼び出しなど、ブラウザもエンドユーザもいない場面で正解の grant です。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §4.4（`client_credentials`）
- [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — JWT Profile for OAuth 2.0 Client Authentication（`private_key_jwt`）
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — OAuth 2.0 Mutual-TLS Client Authentication
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0（トークンを特定の RS にピン）
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — OAuth 2.0 Token Introspection
:::

::: details 用語の補足
- **Confidential クライアントと public クライアント** — *confidential* クライアント（バックエンドサービス）は実認証情報（secret、秘密鍵、mTLS 証明書）を保持できます。*public* クライアント（ブラウザ SPA、モバイルアプリ）は秘密を保持できず、`client_id` のみで識別されます。`client_credentials` は confidential クライアント専用 — 認証情報を持たない「クライアント自身」には認証された identity が成立しません。
- **`private_key_jwt`** — リクエストに共有秘密を載せる代わりに、クライアントが秘密鍵で短寿命 JWT を署名し `client_assertion` として post します。OP は事前登録された公開 JWKS で検証。秘密が通信路に乗ることはありません。
- **Bearer トークン** — そのトークンを提示するだけで認可が成立するアクセストークン（RFC 6750）。所持者は誰でも使えます。より高い保証が必要なら [送信者制約](/ja/concepts/sender-constraint) を参照（DPoP / mTLS でトークンを鍵にバインドできます）。
:::

> **ソース:** [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials)

## アーキテクチャ

<svg class="cc-svc-flow" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="cc-svc-flow-title" viewBox="0 0 760 188" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="cc-svc-flow-title">サービス間 client_credentials フロー: Service A が OP からアクセストークンを取得し、それを付けて Service B を呼び出し、Service B が OP でトークンを検証する。</title>
  <rect class="d-box" x="16" y="40" width="160" height="72" rx="6"/>
  <rect class="d-op" x="300" y="40" width="160" height="72" rx="6"/>
  <rect class="d-box" x="584" y="40" width="160" height="72" rx="6"/>
  <text class="d-bt" x="96" y="72" text-anchor="middle">Service A</text>
  <text class="d-bs" x="96" y="92" text-anchor="middle">confidential クライアント</text>
  <text class="d-bt d-op-text" x="380" y="72" text-anchor="middle">OP</text>
  <text class="d-bs d-op-sub" x="380" y="92" text-anchor="middle">認可サーバ</text>
  <text class="d-bt" x="664" y="72" text-anchor="middle">Service B</text>
  <text class="d-bs" x="664" y="92" text-anchor="middle">リソースサーバ</text>
  <line x1="182" y1="62" x2="294" y2="62"/>
  <path d="M288 57 L294 62 L288 67"/>
  <line x1="294" y1="90" x2="182" y2="90"/>
  <path d="M188 85 L182 90 L188 95"/>
  <line x1="578" y1="76" x2="466" y2="76"/>
  <path d="M472 71 L466 76 L472 81"/>
  <path d="M96 112 C96 176 664 176 664 116"/>
  <path d="M659 123 L664 116 L669 123"/>
  <text class="d-lbl" x="238" y="50" text-anchor="middle">1. <tspan class="d-tok">POST /token</tspan></text>
  <text class="d-lbl" x="238" y="108" text-anchor="middle">2. <tspan class="d-tok">access_token</tspan></text>
  <text class="d-lbl" x="522" y="62" text-anchor="middle">4. トークンを検証</text>
  <text class="d-tok" x="522" y="96" text-anchor="middle" font-size="10">/introspect · /jwks</text>
  <text class="d-lbl" x="380" y="150" text-anchor="middle">3. <tspan class="d-tok">Authorization: Bearer</tspan></text>
</svg>

`/authorize` 無し、同意無し、`id_token` 無し、リフレッシュトークン無し。

## コード

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  // ブラウザ grant を組み込まないため cookie key は不要です。
  op.WithGrants(grant.ClientCredentials),
  op.WithFeature(feature.Introspect),

  op.WithStaticClients(
    op.ConfidentialClient{
      ID:         "service-a",
      Secret:     serviceASecret, // seed が保存前に hash
      AuthMethod: op.AuthClientSecretBasic,
      GrantTypes: []string{"client_credentials"},
      Scopes:     []string{"read:things", "write:things"},
      Resources:  []string{"https://api.b.example.com"}, // RFC 8707 で audience を固定
    },
    op.ConfidentialClient{
      ID:         "service-b",
      Secret:     serviceBSecret,
      AuthMethod: op.AuthClientSecretBasic,
      GrantTypes: []string{"client_credentials"},
    },
  ),
  op.WithProtectedResources(op.ProtectedResource{
    Resource:            "https://api.b.example.com",
    IntrospectionClients: []string{"service-b"},
  }),
)
```

## token endpoint の呼び出し

```sh
curl -s -u service-a:<secret> \
  -d 'grant_type=client_credentials&scope=read:things' \
  https://op.example.com/oidc/token
# {
#   "access_token": "...",
#   "token_type": "Bearer",
#   "expires_in": 300,
#   "scope": "read:things"
# }
```

::: tip Confidential クライアントのみ
`client_credentials` は実認証情報を持つクライアント（`client_secret_basic`、`client_secret_post`、`private_key_jwt`）に制限されます。public クライアント（`token_endpoint_auth_method=none`）は使えません。mTLS 送信者制約は別レイヤであり、それ単体で grant を認証しません。
:::

## 本番グレード: basic ではなく `private_key_jwt`

高保証の deployment では `private_key_jwt`（RFC 7523）を使ってください:

```go
op.WithStaticClients(op.PrivateKeyJWTClient{
  ID:         "service-a",
  JWKS:       serviceAPublicJWKs, // 公開 JWK Set を JSON バイト列で
  GrantTypes: []string{"client_credentials"},
})
```

`PrivateKeyJWTClient` seed は `token_endpoint_auth_method=private_key_jwt` を自動でセットします。この型付きクライアント定義には `AuthMethod` フィールドはありません。

これで Service A はトークン要求毎に自分の秘密鍵で JWT assertion に署名:

```sh
curl -s -d 'grant_type=client_credentials' \
  -d 'client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer' \
  -d "client_assertion=$JWT_ASSERTION" \
  -d 'scope=read:things' \
  https://op.example.com/oidc/token
```

::: details FAPI 2.0 の client_credentials
`op.WithProfile(profile.FAPI2Baseline)` 配下では `client_secret_basic` が除外されます。`private_key_jwt` または mTLS のみが受理。`feature.DPoP` を上乗せすれば発行アクセストークンをクライアント保有鍵に追加バインドできます。
:::

## resource server 側の検証

2 経路:

1. **JWT 自己検証**（RFC 9068）— JWT アクセストークンを構成済みの場合。Service B は `/jwks` を一度取得しキャッシュ、ローカルで署名検証。
2. **Introspect**（RFC 7662）— アクセストークンが opaque な場合。Service B が `/introspect` にトークンを post し、JSON レスポンスから `active`、`scope`、`client_id` 等を読みます。

```sh
curl -s -u service-b:<secret> \
  -d "token=$ACCESS_TOKEN" \
  https://op.example.com/oidc/introspect
```

::: warning Introspect の呼び出し元には confidential クライアントが必要
introspection エンドポイントは **呼び出し元**（Service B、リソースサーバ）を認証します。public クライアントと `token_endpoint_auth_method=none` のクライアントは `401 invalid_client` になります。Service B を confidential クライアントとして登録してください。既定では、クライアントは自分が発行を受けたトークンだけを検査できます。`https://api.b.example.com` audience のアクセストークンを Service B に委譲するには、その resource の `ProtectedResource.IntrospectionClients` に Service B を列挙します。この委譲はリフレッシュトークンには適用されません。フル実装は [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) を参照してください。
:::
