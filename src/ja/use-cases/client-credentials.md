---
title: サービス間 (client_credentials)
description: バックエンド間トークン、エンドユーザ無し、同意無し。
pageClass: pg-use-cases-client-credentials
---

# 使い方 — サービス間 (`client_credentials`)

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

<svg class="cc-svc-flow" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="cc-svc-flow-title" viewBox="12 46 736 116" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="cc-svc-flow-title">サービス間 client_credentials フロー: Service A が OP からアクセストークンを取得し、それを付けて Service B を呼び出し、Service B が OP でトークンを検証する。</title>
  <rect x="20" y="48" width="150" height="68" rx="6"/>
  <rect class="d-op" x="305" y="48" width="150" height="68" rx="6"/>
  <rect class="d-rs" x="590" y="48" width="150" height="68" rx="6"/>
  <text class="d-bt" x="95" y="80" text-anchor="middle">Service A</text>
  <text class="d-bs" x="95" y="98" text-anchor="middle">confidential クライアント</text>
  <text class="d-bt d-op-text" x="380" y="80" text-anchor="middle">OP</text>
  <text class="d-bs d-op-sub" x="380" y="98" text-anchor="middle">認可サーバー</text>
  <text class="d-bt" x="665" y="80" text-anchor="middle">Service B</text>
  <text class="d-bs" x="665" y="98" text-anchor="middle">resource server</text>
  <line x1="176" y1="68" x2="299" y2="68"/>
  <path d="M293 63 L299 68 L293 73"/>
  <line x1="299" y1="96" x2="176" y2="96"/>
  <path d="M182 91 L176 96 L182 101"/>
  <line x1="584" y1="82" x2="461" y2="82"/>
  <path d="M467 77 L461 82 L467 87"/>
  <path d="M95 116 C95 168 665 168 665 116"/>
  <path d="M660 123 L665 116 L670 123"/>
  <text class="d-lbl" x="238" y="60" text-anchor="middle">1. <tspan class="d-tok">POST /token</tspan></text>
  <text class="d-lbl" x="238" y="110" text-anchor="middle">2. <tspan class="d-tok">access_token</tspan></text>
  <text class="d-lbl" x="522" y="68" text-anchor="middle">4. トークンを検証</text>
  <text class="d-tok" x="522" y="100" text-anchor="middle" font-size="10">/introspect · /jwks</text>
  <text class="d-lbl" x="380" y="140" text-anchor="middle">3. <tspan class="d-tok">Authorization: Bearer</tspan></text>
</svg>

`/authorize` 無し、同意無し、`id_token` 無し、リフレッシュトークン無し。

## コード

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithGrants(
    grant.AuthorizationCode, // 人間ユーザ向け
    grant.RefreshToken,
    grant.ClientCredentials, // <-- サービス間を有効化
  ),

  op.WithStaticClients(op.ConfidentialClient{
    ID:         "service-a",
    Secret:     serviceASecret,            // 平文。seed が op.HashClientSecret でハッシュ化する
    AuthMethod: op.AuthClientSecretBasic,
    GrantTypes: []string{"client_credentials"},
    Scopes:     []string{"read:things", "write:things"},
    Resources:  []string{"https://api.b.example.com"}, // RFC 8707 で audience を固定
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

`PrivateKeyJWTClient` seed は `token_endpoint_auth_method=private_key_jwt` を自動でセットします。この 型付きクライアント定義 には `AuthMethod` フィールドはありません。

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

::: warning Introspect は呼び出し側自身のクライアント認証が必要
introspection エンドポイントは **呼び出し元**（Service B、resource server）を認証します。Service B も confidential クライアントとして登録し、`/introspect` を呼べるようにしてください。フル実装は [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials)。
:::
