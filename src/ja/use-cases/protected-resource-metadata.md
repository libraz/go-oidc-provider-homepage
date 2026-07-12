---
title: Protected resource メタデータ（RFC 9728）
description: OAuth 2.0 Protected Resource Metadata 文書を公開し、リソースサーバが scope・bearer method・保護元の認可サーバを広告できるようにする。
---

# 使い方 — Protected resource メタデータ（RFC 9728）

リソース識別子（API のベース URL）を持つクライアントは、*それをどの認可サーバが保護しているか*、*何を受理するか*、つまり scope、bearer method、応答署名に使う JWKS を、ハードコードせずに知る必要があります。[RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) はそのための well-known 文書を定義します。OP 自身の `/.well-known/openid-configuration` に対応する、リソースサーバ側の文書です。

`op.WithProtectedResources` を使うと、OP が保護する 1 つ以上のリソースサーバについて、OP がこれらの文書をホストできます。各文書は読み取り専用で配信され、`authorization_servers` に OP 自身の issuer を刻みます。

これは、クライアントが resource identifier から API を発見する構成、または複数の API が同じ OP に戻る機械可読メタデータを持つ構成で使います。すべてのクライアントを手動設定していて、issuer も既に知っているなら、このメタデータは任意です。これを有効にしても、トークン検証やゲートウェイ動作が追加されるわけではありません。

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
| `ResourceDocumentation` | `resource_documentation` |

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

## 続きはこちら

- [Discovery](/ja/concepts/discovery) — OP 自身の `/.well-known/openid-configuration`。
- [Rich authorization requests](/ja/use-cases/authorization-details) — クライアントが狙うリソースでのアクセスを記述する。
- [mTLS](/ja/concepts/mtls) / [送信者制約付きトークン](/ja/concepts/sender-constraint) — リソースサーバが検証する Bearer トークン の束縛。
