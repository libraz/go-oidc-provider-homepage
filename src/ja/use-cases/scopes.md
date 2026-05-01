---
title: Public / Internal スコープ
description: scope を「discovery に出す（Public）」と「管理用途で出さない（Internal）」に分離 — OP は前者だけ宣伝、両方発行。
---

# ユースケース — Public / Internal スコープ

## そもそも scope とは

OAuth 2.0（RFC 6749 §3.3）における **scope** は、クライアントが `/authorize` 要求に付けて *どんな種類のアクセスを要求するか* を表す文字列です（例: `email` / `profile` / `billing.read`）。OP が許可する scope を決め、access token に許可された scope が乗り、リソースサーバが API 認可判断に使います。

OIDC Core 1.0 §5.4 は特殊な scope として `openid`（リクエストを純 OAuth から OIDC に切り替えるスイッチ）と、ユーザ claim 用の `profile` / `email` / `address` / `phone` を予約しています。それ以外は **あなた独自のカタログ** であり、本ページではこのカタログを **Public**（discovery で広告 + 同意画面に描画）と **Internal**（許可リスト経由でだけ発行・discovery には出さない）に分割する方法を扱います。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §3.3（scope）
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.4（`profile` / `email` / … と claim 集合の対応）
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — `scopes_supported`
:::

::: details 用語の補足
- **Scope と claim** — *scope* はクライアントが `/authorize` に付けて *どんな種類のアクセスを要求するか* を表す文字列（`email`、`billing.read` など）。*claim* は最終的に `id_token` や `/userinfo` に乗る identity の key/value（`email`、`email_verified` など）。scope は粗い単位で、1 scope は claim の *束* に対応します。claim 単位の細かい制御は [Claims リクエストパラメータ](/ja/use-cases/claims-request) を参照。
- **`scopes_supported`** — OP が公開する scope を列挙する discovery フィールド。RP はこれを見て要求可能な scope を知ります。掲載されない scope でも発行は可能です — `scopes_supported` は *公開リスト* であって *認可* ではありません。
:::

> **ソース:** [`examples/12-scopes-public-private`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-scopes-public-private)

## 分離の宣言

`op.PublicScope(name, label)` と `op.InternalScope(name)` は `Scope` 値を返すコンストラクタです。`op.WithScope` に 1 つずつ渡します:

```go
op.WithScope(op.PublicScope("billing.read",  "請求履歴の閲覧")),
op.WithScope(op.PublicScope("billing.write", "請求書の管理")),
op.WithScope(op.InternalScope("internal:audit")),
```

`PublicScope`:
- `scopes_supported` に掲載されます。
- 同意画面にラベルが表示されます。
- `AllowedScopes` に含めた任意の RP に発行できます。

`InternalScope`:
- `scopes_supported` には **掲載されません**。
- 同意画面にも **表示されません**（OP は同意フェーズをスキップします）。
- RP が要求すれば発行はできます — 可視性フラグは「公開するかどうか」を制御するだけです。OIDC 標準の scope 名で `InternalScope` を作ろうとすると `op.New` が拒否します。

::: tip OIDC 標準スコープ
`openid`、`profile`、`email`、`address`、`phone`、`offline_access` は組み込みデフォルトで自動登録されます。明示宣言は不要 — 例は **あなたの** scope カタログに焦点を当てています。
:::

## クライアント単位の許可リスト

クライアントの `AllowedScopes` に scope を追加します:

```go
op.WithStaticClients(
  op.ClientSeed{
    ID:            "billing-app",
    AllowedScopes: []string{"openid", "billing.read"},
    /* ... */
  },
  op.ClientSeed{
    ID:            "audit-dashboard",
    AllowedScopes: []string{"openid", "internal:audit"},
    /* ... */
  },
)
```

カタログ未掲載の scope を要求するクライアントは `invalid_scope` で拒否されます — カタログとクライアント許可は **AND** です。

## 確認

```sh
curl -s http://localhost:8080/.well-known/openid-configuration | jq .scopes_supported
# [
#   "openid", "profile", "email", "address", "phone", "offline_access",
#   "billing.read", "billing.write"
# ]
```

`internal:audit` が含まれない — それが目的です。

## いつ使うか

| シナリオ | 選択 |
|---|---|
| 同じ OP に社内管理アプリを乗せ、ユーザ向け discovery には隠したい | `InternalScope` |
| 限定 allow-list でロールアウト中の β scope | `InternalScope` + クライアント別 `AllowedScopes` |
| 全 scope を公開し誰でも要求できる API marketplace | すべて `PublicScope` |
