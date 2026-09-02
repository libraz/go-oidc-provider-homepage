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

<figure class="fig">
  <div class="fig-head">サービス間通信、ユーザは登場しない</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-cc-title" viewBox="0 0 960 196" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-cc-title">Service A が自分自身として OP に認証してアクセストークンを受け取り、それを付けて Service B を呼び出します。Service B は introspection か公開鍵集合のいずれかでそのトークンを検証します。</title>
    <rect class="fg-box" x="36" y="56" width="230" height="76" rx="8"/>
    <text class="fg-t2" x="56" y="82">Service A</text>
    <text class="fg-xs" x="56" y="104">confidential クライアント</text>
    <text class="fg-xs" x="56" y="120">実際に資格情報を保持する</text>
    <path class="fg-edge" d="M270,80 H346" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="308" y="73" text-anchor="middle">1 · POST /token</text>
    <path class="fg-edge fg-edge--accent" d="M346,112 H270" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="308" y="130" text-anchor="middle">2 · access_token</text>
    <rect class="fg-box fg-box--accent" x="350" y="56" width="230" height="76" rx="8"/>
    <text class="fg-t2 fg-accent" x="370" y="82">OP</text>
    <text class="fg-xs" x="370" y="104">認可サーバー</text>
    <text class="fg-mxs" x="370" y="120">/token · /introspect · /jwks</text>
    <path class="fg-edge fg-edge--muted" d="M694,132 V158 H466 V136" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="580" y="152" text-anchor="middle">4 · トークンを検証する — /introspect か、/jwks で自前に</text>
    <path class="fg-edge" d="M270,94 H660" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="620" y="88" text-anchor="middle">3 · Authorization: Bearer &lt;token&gt;</text>
    <rect class="fg-box" x="664" y="56" width="260" height="76" rx="8"/>
    <text class="fg-t2" x="684" y="82">Service B</text>
    <text class="fg-xs" x="684" y="104">リソースサーバ</text>
    <text class="fg-xs" x="684" y="120">Service A の資格情報は一切見ない</text>
  </svg>
  <figcaption class="fig-note">手順 3 が OP の前を横切っているのは、この通信に OP が関与しないからです。トークンについて OP に問い合わせるか自分で署名を検証するかは、手順 4 で Service B が決めます。その選択がアクセストークン形式のページの主題です。</figcaption>
</figure>

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
