---
title: Protected resource メタデータ（RFC 9728）
description: OAuth 2.0 Protected Resource Metadata を公開し、resource audience と confidential な introspection 委譲を含む保護 API の設定を説明します。
pageClass: pg-use-cases-protected-resource-metadata
---

# ユースケース — Protected resource メタデータ（RFC 9728）

リソース識別子（API のベース URL）を持つクライアントは、*それをどの認可サーバが保護しているか*、*何を受理するか*、つまり scope、bearer method、応答署名に使う JWKS を、ハードコードせずに知る必要があります。[RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) はそのための well-known 文書を定義します。OP 自身の `/.well-known/openid-configuration` に対応する、リソースサーバ側の文書です。

`op.WithProtectedResources` を使うと、OP が保護する 1 つ以上のリソースサーバについて、OP がこれらの文書をホストできます。各文書は読み取り専用で配信され、`authorization_servers` に OP 自身の issuer を刻みます。

これは、クライアントが resource identifier から API を発見する構成、または複数の API が同じ OP に戻る機械可読メタデータを持つ構成で使います。すべてのクライアントを手動設定していて、issuer も既に知っているなら、このメタデータは任意です。これを有効にしても、トークン検証やゲートウェイ動作が追加されるわけではありません。

<figure class="fig">
  <div class="fig-head">リソース識別子から discovery 文書まで</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-prm-title" viewBox="0 0 960 240" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-prm-title">リソース識別子しか知らないクライアントが、そのリソースの well-known メタデータを取得し、authorization_servers メンバーを読み、示された issuer を辿って OP 自身の discovery 文書に到達する経路です。</title>
    <!-- 1 identifier -->
    <rect class="fg-box" x="32" y="24" width="428" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="52">クライアントはリソース識別子だけを持つ</text>
    <text class="fg-mxs" x="48" y="76">https://op.example.com/api</text>
    <path class="fg-edge" d="M460,60 H500" marker-end="url(#fg-a)"/>
    <!-- 2 fetch metadata -->
    <rect class="fg-box" x="500" y="24" width="428" height="72" rx="8"/>
    <text class="fg-t2" x="516" y="52">そのリソースのメタデータを取得する</text>
    <text class="fg-mxs" x="516" y="76">/.well-known/oauth-protected-resource/api</text>
    <path class="fg-edge" d="M714,96 V144" marker-end="url(#fg-a)"/>
    <!-- 3 names the authorization server -->
    <rect class="fg-box fg-box--accent" x="500" y="144" width="428" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="516" y="172">文書が認可サーバを示す</text>
    <text class="fg-mxs" x="516" y="196">"authorization_servers": [issuer]</text>
    <path class="fg-edge fg-edge--accent" d="M500,180 H460" marker-end="url(#fg-ac)"/>
    <!-- 4 discovery -->
    <rect class="fg-box fg-box--accent" x="32" y="144" width="428" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="172">issuer を辿って discovery に到達する</text>
    <text class="fg-mxs" x="48" y="196">/.well-known/openid-configuration</text>
  </svg>
  <figcaption class="fig-note">ここには事前設定が一つもありません。呼びたい URL さえ分かれば、それを統括する OP に辿り着けます。リソースサーバの隣に issuer を埋め込まずに済むのはこのためです。</figcaption>
</figure>

この経路に出てくる文書はどちらも OP が配信します。Bearer トークンの検証はリソースサーバの仕事のままです。

::: details このページで触れる仕様
- [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) — OAuth 2.0 Protected Resource Metadata（§2 パラメータ、§3 / §3.1 well-known URI、§3.3 `authorization_servers`）
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators（`resource` 識別子の形）
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — Bearer token の利用（`bearer_methods_supported`）
:::

::: tip OP は広告するが、強制はしない
OP はメタデータを配信し、自身をリソースの認可サーバとして示します。リソースサーバの Bearer トークンを **検証はしません**。それはリソースサーバの仕事のままです。このオプションは関係を *公開する* ためのもので、OP をゲートウェイにするものではありません。
:::

## 設定

```go
import "github.com/libraz/go-oidc-provider/op"

op.New(
  op.WithIssuer("https://op.example.com"),
  /* 必須オプション */
  op.WithProtectedResources(op.ProtectedResource{
    Resource:               "https://op.example.com/api",
    ScopesSupported:        []string{"api.read", "api.write"},
    BearerMethodsSupported: []string{"header"},
    IntrospectionClients:   []string{"api-introspector"},
  }),
)
```

| フィールド | 文書のパラメータ |
|---|---|
| `Resource`（必須） | `resource` — RFC 8707 の resource indicator: フラグメントを持たない絶対 URI |
| `ScopesSupported` | `scopes_supported` |
| `BearerMethodsSupported` | `bearer_methods_supported` — `header`、`body`、`query` |
| `ResourceSigningAlgValuesSupported` | `resource_signing_alg_values_supported` |
| `JWKSURI` | `jwks_uri` |
| `ResourceDocumentation` | `resource_documentation` — ドキュメントの URL |
| `IntrospectionClients` | RFC 9728 フィールドではない。audience 単位の `/introspect` 委譲を設定 |

`Resource` は `op.New` で RFC 8707 の `resource` パラメータと同じように検証され、不正な識別子は起動を拒否します。リソースは最低 1 つ必要で、同じ識別子に正規化される 2 つのリソース — あるいはパスが同じ well-known マウントに衝突するもの — は拒否されます。

## 配信される内容

文書は `/.well-known/oauth-protected-resource` 配下に置かれます。リソース識別子がパス component を持つ場合、RFC 9728 §3.1 がそれを well-known パスに付け足すので、登録した各リソースが独立して配信されます:

```sh
curl https://op.example.com/.well-known/oauth-protected-resource/api
```

```json
{
  "resource": "https://op.example.com/api",
  "authorization_servers": ["https://op.example.com"],
  "scopes_supported": ["api.read", "api.write"],
  "bearer_methods_supported": ["header"]
}
```

`authorization_servers` には OP 自身の issuer が刻まれます — クライアントが discovery へ辿り戻すリンクです。2 つのリソース（`/orders` と `/inventory`）を登録すると、それぞれが自身のパス接尾辞付きの場所で配信されます。パスはリソースのパス component だけから導出される（§3.1 によりホスト非依存）ため、パスが衝突する 2 つのリソースは、ルータを panic させる代わりに構築時に拒否されます。

`IntrospectionClients` は RFC 9728 文書のフィールドではなく、OP 内部の認可ルールです。列挙した caller は confidential client として認証しなければならず、public client と `token_endpoint_auth_method=none` は `/introspect` で `401 invalid_client` になります。委譲が無ければ caller は自分の access token だけを見られます。`IntrospectionClients: []string{"api-introspector"}` を設定すると、その confidential client はこの resource を audience とする access token を introspect できます。audience ごとに範囲が決まり、refresh token には委譲されません。

## 続きはこちら

- [Discovery](/ja/concepts/discovery) — OP 自身の `/.well-known/openid-configuration`。
- [Rich authorization requests](/ja/use-cases/authorization-details) — クライアントが狙うリソースでのアクセスを記述する。
- [mTLS](/ja/concepts/mtls) / [送信者制約付きトークン](/ja/concepts/sender-constraint) — リソースサーバが検証する Bearer トークン の束縛。
