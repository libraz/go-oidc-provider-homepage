---
title: scope と claim
description: scope とは、claim とは、OIDC 標準の scope-to-claim 対応表、本ライブラリでのカスタム scope 登録方法。
---

# scope と claim

**scope** と **claim** は OIDC を学び始めた人が最も混同する 2 語です。同じものではありません。

- **scope** はクライアントが authorize 要求で **要求する** もの。OP が `scopes_supported` で公開している小さな識別子集合の中の 1 つです。
- **claim** は OP が **返す** key-value のペア — ID トークンの中、アクセストークンの中、`/userinfo` 応答の中など。

scope は要求、claim は応答。scope を grant するから、対応する claim が release されます。

::: tip 30 秒で頭に入れる相関図
- scope = 「あなたの email が見たい」 — `scope=openid email`
- claim = `"email": "alice@example.com"` — 返ってきた値。
- 1 つの scope が複数の claim を release することがあります。下表の OIDC 標準対応がそのマッピングです。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §3.3（scope）、§5.2（`invalid_scope`）
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — Authorization Server Metadata（`scopes_supported`）
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.1（標準 claim）、§5.4（scope-to-claim 対応）、§5.5（claims request）
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — §3（`scopes_supported`、`claims_supported`）
:::

## scope: クライアントが要求するもの

`/authorize` の `scope` パラメータは、半角スペース区切りの不透明な識別子のリストです。ユーザはその集合に同意し、OP は grant された集合を、結果として返す認可コード、アクセストークン、リフレッシュトークン、ID トークンに記録します。

```
GET /authorize?response_type=code&client_id=...&scope=openid%20profile%20email&...
```

初学者が見落としがちな点をいくつか:

- **scope 識別子はプロトコルにとって不透明**。`openid` が特別なのは、OIDC Core §5.4 が「これは OIDC フローである」という意味を割り当てているからにすぎません。それ以外は OP とクライアントの間で合意した文字列です。
- **scope は case-sensitive**。`openid` は scope ですが、`OpenID` は別物（かつ未認識の）scope です。
- **`openid` が OAuth を OIDC に変える魔法**。`openid` が要求になければ ID トークンは発行されません。本ライブラリのデフォルトは OIDC（`openid` scope 必須）で、`op.WithOpenIDScopeOptional()` で純 OAuth 2.0 に切り替えられます。
- **ユーザは一部の scope を辞退できる**。grant された集合は要求された集合の部分集合になり得ます。OP は実際に grant された scope を発行トークン上で示します。
- **未知の scope は失敗**。`WithScope` で登録されていない（あるいは組み込み OIDC 標準でない）scope が要求されると、OP は RFC 6749 §5.2 の `invalid_scope` を返します。

## claim: トークンや userinfo 応答の中の key-value

**claim** は OP が署名する（あるいは `/userinfo` の場合は plain で返す）JSON object 内の 1 フィールドです。OIDC Core §5.1 が長いカタログを提供しています。構造的には 2 群に分かれます。

- **要求自体に関する標準 claim** — `iss`、`aud`、`exp`、`iat`、`nbf`、`sub`、`nonce`、`auth_time`、`acr`、`amr`、`azp`。これらはトークンの説明であって、ユーザの説明ではありません。OP は grant された scope に関わらず埋めます。
- **ユーザ claim** — `name`、`family_name`、`email`、`email_verified`、`phone_number`、`address`、`picture` など。これらはエンドユーザに関するものです。OP は scope grant が許可した場合にのみ release します。

第 1 群はすべてのトークンに乗ります。第 2 群が scope grant の制御対象です。

## OIDC Core の scope-to-claim 対応

OIDC Core §5.4 が標準 scope に対応する claim を固定しています。本ライブラリはこれをそのまま実装しています。

| Scope | Release される claim |
|---|---|
| `openid` | `sub` |
| `profile` | `name`、`family_name`、`given_name`、`middle_name`、`nickname`、`preferred_username`、`profile`、`picture`、`website`、`gender`、`birthdate`、`zoneinfo`、`locale`、`updated_at` |
| `email` | `email`、`email_verified` |
| `address` | `address` |
| `phone` | `phone_number`、`phone_number_verified` |
| `offline_access` | （claim なし — リフレッシュトークン発行のためのユーザ向け同意プロンプトと、適用されるリフレッシュトークンの TTL バケットを制御） |

`scope=openid email` の要求は、ユーザ claim カタログから `sub`、`email`、`email_verified` を release します。それ以外は何も release しません。`scope=openid profile email` なら `profile` 群が丸ごと加わります。

::: details `offline_access` は claim を release しない
`offline_access` は OIDC 標準 scope で、「ユーザが不在のときも動き続けたい」というクライアントの意思表明 — つまりリフレッシュトークン発行に対するユーザ向けの consent prompt です。ユーザ claim は何も release しません。本ライブラリでは、結果として発行されるリフレッシュトークンを別の TTL バケット（`op.WithRefreshTokenOfflineTTL`）にルーティングするので、ログイン状態維持の chain は通常の短セッションのリフレッシュより長く保てます。詳細は[リフレッシュトークン](/ja/concepts/refresh-tokens)。
:::

## カスタム scope

本ライブラリは `op.WithScope` で scope を追加登録できます。各カスタム scope は `op.Scope` 構造体で、wire 識別子・consent prompt の表示テキスト・release する claim のリスト・（任意で）どのクライアントが要求できるかを記述します。

```go
op.WithScope(op.PublicScope("read:projects", "プロジェクトの読み取り")),
op.WithScope(op.Scope{
    Name:        "write:projects",
    Title:       "プロジェクトへの書き込み",
    Description: "あなたの代理でプロジェクトの作成・変更を行います。",
    Public:      true,
    Claims:      []string{"projects:permissions"},
    AllowedClients: []string{"trusted-client-1"},
}),
```

よくある用途には 2 つのヘルパが用意されています。

- `op.PublicScope(name, label)` — discovery document の `scopes_supported` に公開する scope を登録します。審査済みのクライアントなら誰でも要求できる scope に使います。
- `op.InternalScope(name)` — `scopes_supported` から **省略** する scope を登録します（RFC 8414 §2 / OIDC Discovery §3 が省略を明示的に許容）。受理判定は scope の `AllowedClients` リストで制御されます。discoverable にしたくないが特定クライアントには許す scope に使います。

OIDC 標準 scope は組み込みのデフォルトで自動認識されます。標準名（例: `email`）に対して `WithScope` を呼ぶと組み込みエントリが上書きされます — 翻訳や追加の claim mapping を付与する目的で使うのが典型です — が、`Public: false` で標準 scope を登録すると `op.New` が失敗します。discovery document が「標準 scope を欠落」と公告するのを防ぐためです。

i18n ラベル、claim mapping、consent prompt のレンダリングを含む詳細は[ユースケース: scope](/ja/use-cases/scopes)を参照してください。

## scope と RFC 8707 resource indicator

よくあるモデリングの問い: 権限を分けるとき、新しい scope を切るのか、新しい audience を切るのか？

| 問い | 答え | 例 |
|---|---|---|
| 「同じ RS が解釈する **異なる種類** の権限ですか？」 | scope を使う。 | 同じ projects API に対する `read:projects` と `write:projects`。 |
| 「**別の resource server** で、独自の audience が必要ですか？」 | RFC 8707 を使う。 | projects API 用のアクセストークンと billing API 用のアクセストークン。各 RS の verifier が cross-audience なトークンを拒否できるよう、`aud` を別にしたい。 |
| 「audience ごとに lifetime / 形式 / revocation ポリシーが違いますか？」 | per-audience format で RFC 8707 を使う。 | 管理 API は opaque（即時失効）にしつつ、read API は JWT（水平スケール）を維持。本ライブラリは `op.WithAccessTokenFormatPerAudience` で実現します。 |

scope は **権限の幅** を、resource indicator は **対象 audience** を表現します。1 つの authorize 要求に両方を載せることもできます — `scope=openid read:projects&resource=https://billing.example.com&resource=https://projects.example.com` は OP に「resource ごとに 1 つずつ、grant された scope 集合を持つアクセストークンを 2 つ発行せよ」と要求します。

OIDC §5.5 の `claims` パラメータ（scope 単位ではなく特定の claim を細かく要求する）は[ユースケース: claims request](/ja/use-cases/claims-request)に、per-audience format のトレードオフは[アクセストークン形式](/ja/concepts/access-token-format)にあります。

## 次に読む

- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — 各アーティファクトに何が入るか、scope がどう形を決めるか。
- [ユースケース: scope](/ja/use-cases/scopes) — i18n ラベル、claim mapping、allowed-clients、consent prompt のサーフェス。
- [ユースケース: claims request](/ja/use-cases/claims-request) — 細かい claim 選択のための OIDC §5.5 `claims` パラメータ。
