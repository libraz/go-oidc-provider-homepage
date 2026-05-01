---
title: 純粋 OAuth 2.0（openid なし）
description: OAuth 2.0 を OIDC と同居させる。同じ OP が非 OIDC クライアントに access-only トークンを発行。
---

# ユースケース — 純粋 OAuth 2.0

OIDC Core 1.0 §3.1.2.1 は authorize 要求に `openid` scope を必須としています。これがないと OP は拒否します。これは正しいデフォルトですが、Bearer トークンだけを欲しがる非 OIDC RP がいる場合もあります。本ライブラリは 1 つの緩和オプションで **両方** の形を同じ OP に同居させられます。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — OAuth 2.0 Bearer Token Usage
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.1（`openid` scope が OIDC 切替えスイッチ）
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — `scopes_supported`
:::

::: details 用語の補足
- **OAuth 2.0 と OIDC** — OAuth 2.0 は *委譲された API アクセス* のための `access_token` を発行します — トークンは「このクライアントはユーザに代わってこの API を呼んで良い」と表明します。OIDC はそこに identity を上乗せします: `openid` scope が含まれると、OP は追加で `id_token` を返し *誰がユーザか* を表明します。`openid` がなければ OP は純粋な OAuth 2.0 サーバとして振る舞います。
- **Bearer トークン** — そのトークンを提示するだけで認可が成立する access token（RFC 6750）。リソースサーバが（introspection か JWT 署名検証で）検証し、付与された scope を強制します。
- **`/userinfo`** — OIDC が定義しますが、ユーザ claim を許す scope を持つ access token であれば呼び出せます。OAuth-only モードでは、access token の scope が許可した分だけ返ります（多くの場合は何も返りません）。
:::

> **ソース:** [`examples/15-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/15-oauth2-only)

## 差し込み口

```go
op.New(
  /* 必須オプション */
  op.WithOpenIDScopeOptional(),
)
```

このオプションを置くと:

| リクエスト | 挙動 |
|---|---|
| `scope=openid profile email` | フル OIDC: `id_token` + `userinfo` +（設定済みなら）`refresh_token` |
| `scope=api:read` | 純粋 OAuth 2.0: `access_token` のみ、`id_token` なし |
| `scope=`（空） | 拒否 — 少なくとも 1 つ scope が必要 |

選択は **リクエスト単位** であって、全体一括の切り替えではありません。`Scopes` 列挙に `openid` を含むクライアントは引き続き要求できますし、`Scopes` に `openid` を含まないクライアントは恒久的に OAuth-only で動きます。

## 副作用

| 項目 | OIDC モード | OAuth-only モード |
|---|---|---|
| `/token` レスポンスの `id_token` | ✅ | ❌ |
| アクセストークンでの `/userinfo` 呼び出し | ✅ | ✅ — ただし scope が許可するものだけ返る |
| Discovery `claims_supported` | 反映 | 影響なし |
| `nonce` 検証 | 提示時に強制 | バイパス |
| `auth_time` claim | プロンプト時に含める | 該当なし |

## 排他関係

`op.WithOpenIDScopeOptional` は有効な FAPI 2.0 プロファイルと **両立しません**。FAPI 2.0 は OIDC を必須とするため、コンストラクタが構築時に拒否します。

```go
op.New(
  op.WithProfile(profile.FAPI2Baseline),
  op.WithOpenIDScopeOptional(), // ← op.New がエラーを返す
)
```

`op.WithStrictOfflineAccess()` も非互換です（`openid` 自体が任意な構成では strict は意味を持たないため）。

## いつ使うか

| シナリオ | 選択 |
|---|---|
| OAuth 2.0 のみ、ユーザなし（machine-to-machine） | [`client_credentials`](/ja/use-cases/client-credentials) — 本オプションは不要 |
| 同じ OP に OIDC RP と OAuth RP が混在 | 本オプション |
| FAPI 2.0 を運用 | 使用しない |

## 続きはこちら

- [トークン入門](/ja/concepts/tokens) — アクセストークンと ID トークンの中身。
- [Client Credentials](/ja/use-cases/client-credentials) — もう一つの「エンドユーザなし」経路。
