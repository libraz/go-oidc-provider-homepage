---
title: サービス間（client_credentials）
description: バックエンド間トークン、エンドユーザ無し、同意無し。
pageClass: pg-use-cases-client-credentials
---

# ユースケース — サービス間（`client_credentials`）

## `client_credentials` グラントとは

多くの OAuth の grant には、アクセスを承認する人（リソースオーナー）が登場します。**`client_credentials`**（RFC 6749 §4.4）は、その人がいない場合のための grant です。Service A が登録済みの `client_id` と認証情報を持ち、`/token` でそれを直接アクセストークンに交換します。トークンが表すのは **サービス自身** で、エンドユーザではありません。そのため `id_token` も `refresh_token` も同意画面もありません（取り直しは安価なので、リフレッシュトークンは不要です）。

cron ジョブ、webhook、マイクロサービス間呼び出しなど、ブラウザもエンドユーザもいない場面で使います。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §4.4（`client_credentials`）
- [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — JWT Profile for OAuth 2.0 Client Authentication（`private_key_jwt`）
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — OAuth 2.0 Mutual-TLS Client Authentication
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0（トークンを特定の RS にピン）
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — OAuth 2.0 Token Introspection
:::

::: details 用語の補足
- **Confidential クライアントと public クライアント** — *confidential* クライアント（バックエンドサービス）は実際の認証情報（secret か秘密鍵）を保持できます。*public* クライアント（ブラウザ SPA、モバイルアプリ）は秘密を保持できず、`client_id` だけで自分を名乗ります。`client_credentials` は confidential クライアント専用です。認証情報がなければ、「クライアント自身」を認証済みの主体として扱えないからです。
- **`private_key_jwt`** — 共有秘密を送る代わりに、クライアントが秘密鍵で短命な JWT に署名し、`client_assertion` として送ります。OP は事前登録された公開 JWKS で検証するので、秘密が通信路に乗ることはありません。
- **Bearer トークン** — 提示するだけで認可が成立するアクセストークン（RFC 6750）です。持っている人は誰でも使えます。[送信者制約](/ja/concepts/sender-constraint)（DPoP / mTLS）を使うと、トークンを鍵に結び付けられます。
:::

> **ソース:** [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials)

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">サービス間通信、ユーザは登場しない</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-cc-title" viewBox="0 0 960 392" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-cc-title">Service A が自分自身として OP に認証してアクセストークンを受け取り、それを付けて Service B を呼び出します。Service B は introspection か公開鍵集合のいずれかでそのトークンを検証します。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="368"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="368"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="368"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">confidential クライアント</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">リソースサーバ</text>
    <!-- A authenticates as itself -->
    <path class="fg-edge" d="M192,144 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="110" text-anchor="middle">POST /token</text>
    <text class="fg-s" x="352" y="132" text-anchor="middle">クライアント認証</text>
    <!-- the OP answers -->
    <path class="fg-edge fg-edge--accent" d="M512,216 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="206" text-anchor="middle">access_token</text>
    <!-- A calls B directly -->
    <path class="fg-edge" d="M192,296 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="286" text-anchor="middle">Authorization: Bearer &lt;token&gt;</text>
    <!-- B verifies the token -->
    <path class="fg-edge fg-edge--muted" d="M824,368 H512" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="668" y="358" text-anchor="middle">検証: /introspect | /jwks</text>
  </svg>
  <figcaption class="fig-note">A から B への呼び出しに OP は関与せず、B が A の資格情報を見ることもありません。トークンについて OP に問い合わせるか自分で署名を検証するかは Service B が決めます。その選択がアクセストークン形式のページの主題です。</figcaption>
</figure>

この流れは `/auth` を通りません。

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
  // ブラウザを使う grant を有効にしないため、cookie key は不要です。
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
    Resource:             "https://api.b.example.com",
    IntrospectionClients: []string{"service-b"},
  }),
)
```

## トークンエンドポイントを呼び出す

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
`client_credentials` を使えるのは、実際の認証情報を持つクライアント（`client_secret_basic`、`client_secret_post`、`private_key_jwt`）だけです。public クライアント（`token_endpoint_auth_method=none`）は使えません。静的に seed する `ConfidentialClient` が `client_secret_basic` か `client_secret_post` を使う場合は、`Secret` か `SecretHash` が必須で、空のままだと `op.New` が拒否します。mTLS 送信者制約は別の仕組みで、それだけでは grant の認証になりません。
:::

### トークンの中身と失敗時の応答

| 項目 | 挙動 |
|---|---|
| `sub` | `client_id`。エンドユーザがいないため、pairwise subject への変換は行いません。 |
| `scope` | 要求したスコープ。すべてクライアントの登録済み `Scopes` に含まれている必要があります。`scope` を省略すると、登録済みの全スコープから `openid` を除いたものになります。 |
| `aud` | 要求に `resource` があればその値（クライアントの `Resources` に含まれている必要があり、指定できるのは 1 つだけ）。なければ issuer の URL。 |
| 応答 | `access_token`、`token_type`、`expires_in`、`scope`。`id_token` と `refresh_token` は含まれません。 |
| `cnf` | 要求に検証済みの DPoP proof か mTLS 証明書があれば付きます。 |

| 失敗の内容 | 応答 |
|---|---|
| クライアントが `client_credentials` 未登録、または public クライアント | `400 unauthorized_client` |
| `openid` を要求した、または登録済みスコープの範囲外 | `400 invalid_scope` |
| `resource` の形式が不正、クライアントに未登録、または異なる値を複数指定 | `400 invalid_target` |
| 認証情報がない、誤っている、または再利用された（`private_key_jwt` の assertion で `jti` が空・長すぎる場合を含む） | `401 invalid_client` |
| クライアントの JWKS を一時的に取得できない、または負荷で拒否された | `503 server_error` |
| クライアントストアが利用できない | `500 server_error` |

## 本番向け: basic の代わりに `private_key_jwt`

より高い保証が必要な環境では、`private_key_jwt`（RFC 7523）を使います。

```go
op.WithStaticClients(op.PrivateKeyJWTClient{
  ID:         "service-a",
  JWKS:       serviceAPublicJWKs, // 公開 JWK Set を JSON バイト列で
  GrantTypes: []string{"client_credentials"},
})
```

`PrivateKeyJWTClient` seed は `token_endpoint_auth_method=private_key_jwt` を自動で設定するので、この型には `AuthMethod` フィールドがありません。クライアントのレコードには、インラインの `jwks` か `jwks_uri` のどちらか一方だけを持たせます。両方は持てません。

Service A は、トークンを要求するたびに、自分の秘密鍵で新しい JWT assertion に署名します。assertion には一意の `jti`（OP は再利用を拒否します）が必要で、有効期間は 5 分以内です。

```sh
curl -s -d 'grant_type=client_credentials' \
  -d 'client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer' \
  -d "client_assertion=$JWT_ASSERTION" \
  -d 'scope=read:things' \
  https://op.example.com/oidc/token
```

::: details FAPI 2.0 の client_credentials
`op.WithProfile(profile.FAPI2Baseline)` 配下では `client_secret_basic` が除外されます。本ライブラリが token endpoint のクライアント認証で受理するのは `private_key_jwt` です。mTLS は送信者制約を満たせますが、RFC 8705 の mTLS クライアント認証経路は未接続です。`feature.DPoP` を上乗せすれば発行アクセストークンをクライアント保有鍵に追加バインドできます。
:::

## リソースサーバ側の検証

検証の方法は 2 つあります。

1. **JWT の自己検証**（RFC 9068）— JWT アクセストークンを使っている場合。Service B は `/jwks` を取得してキャッシュし、鍵ローテーションで未知の `kid` が現れたらキャッシュを更新してから、ローカルで署名を検証します。
2. **Introspection**（RFC 7662）— アクセストークンが opaque な場合。Service B が `/introspect` にトークンを POST し、JSON レスポンスから `active`、`scope`、`client_id` 等を読みます。

```sh
curl -s -u service-b:<secret> \
  -d "token=$ACCESS_TOKEN" \
  https://op.example.com/oidc/introspect
```

::: warning Introspect の呼び出し元には confidential クライアントが必要
introspection エンドポイントは **呼び出し元**（Service B、リソースサーバ）を認証します。public クライアントと `token_endpoint_auth_method=none` のクライアントは `401 invalid_client` になります。Service B を confidential クライアントとして登録してください。既定では、クライアントは自分が発行を受けたトークンだけを検査できます。`https://api.b.example.com` audience のアクセストークンを Service B に委譲するには、その resource の `ProtectedResource.IntrospectionClients` に Service B を列挙します。この委譲はリフレッシュトークンには適用されません。フル実装は [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) を参照してください。
:::
