---
title: SPA 向け CORS
description: 異なる origin の SPA が OP のユーザ向けエンドポイントを呼べるようにする。
---

# ユースケース — SPA 向け CORS

## SPA とは何か、なぜ CORS が要るのか

**Single-Page Application (SPA)** はブラウザ内だけで動作する JS フロントエンド（React / Vue / Svelte 等）で、API とは `fetch()` で会話します。サーバサイドレンダリングの RP と決定的に違うのは次の 2 点:

1. **`client_secret` を保持できない** — JS バンドルは誰でも読めるため。よって SPA は *public client* として扱われ、`client_secret` の代わりに **PKCE（RFC 7636）** で認可コードを保護します。
2. OP と **異なる origin** で配信されることが普通（`app.example.com` vs `op.example.com`）。ブラウザの **CORS**（Fetch 仕様 / Cross-Origin Resource Sharing）が、SPA から JS で呼び出すエンドポイントごとに OP 側で origin を明示的に許可することを要求します。

本ページは CORS レイヤを扱います。PKCE 自体は [Authorization Code + PKCE](/ja/concepts/authorization-code-pkce) を参照。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE（Proof Key for Code Exchange）
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1（ブラウザサイド public client）
- [Fetch Standard](https://fetch.spec.whatwg.org/)（WHATWG）— CORS / preflight のセマンティクスを定義
- [RFC 6265bis](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis) — Cookies、`SameSite`、`__Host-` プレフィクス
:::

::: details 用語の補足
- **Origin** — `(scheme, host, port)` の 3 要素 — `https://app.example.com:443` と `https://app.example.com:8443` は別 origin です。ブラウザの same-origin policy がページ間を隔離し、CORS は制御された逃げ道です。
- **CORS preflight** — `Authorization` ヘッダ、カスタムヘッダ、GET/HEAD/POST 以外のメソッドを使う非自明な XHR では、ブラウザは先に `OPTIONS` リクエストを投げて「この origin にこのリクエストを許すか」をサーバに問います。サーバがヘッダで許可すれば本番リクエストが続きます。OP は CORS 有効エンドポイント全てで preflight に応答するので、組み込み側のアプリコードは関与不要です。
- **Public クライアントと confidential クライアント** — *public* クライアント（SPA、モバイルアプリ）は秘密を保持できません — バンドルは誰でも読めます。*confidential* クライアント（バックエンド）は保持できます。public クライアントは認可コードフローで PKCE 必須 — そうでないと secret 相当（コード）が通信路上で無防備になります。
:::

> **ソース:** [`examples/14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa)

## OP が許可するもの

2 層が合成されます:

1. **静的 allowlist** — `op.WithCORSOrigins("https://app.example.com", ...)`
2. **自動導出 allowlist** — 登録済みクライアントの `redirect_uris` から origin を自動寄与。`WithStaticClients` だけで大半は済む。

## コード

```go
op.New(
  /* 必須オプション */
  op.WithCORSOrigins(
    "https://app.example.com",       // 本番 SPA
    "https://staging.example.com",
    "http://localhost:5173",          // ローカル開発 — Vite デフォルト
  ),
  op.WithStaticClients(op.ClientSeed{
    ID:           "spa-client",
    RedirectURIs: []string{"https://app.example.com/callback"},
    /* ... */
  }),
)
```

静的 / 自動導出 origin は同じ内部リストに着地、重複は除去されます。

## どのエンドポイントに CORS ヘッダが付くか

| Endpoint | CORS 有効？ | 理由 |
|---|---|---|
| `/.well-known/openid-configuration` | ✅ | RP / SPA が fetch する。 |
| `/jwks` | ✅ | RP / SPA が ID Token を検証する。 |
| `/userinfo` | ✅ | SPA が Bearer トークン付きで呼ぶ。 |
| `/interaction/*`（SPA driver 使用時） | ✅ | SPA がポーリング。 |
| `/session/*` | ✅ | SPA がセッション状態を読む。 |
| `/authorize` | ❌ | ブラウザナビゲーション、XHR ではない。 |
| `/token` | ❌ | RP は server-side、SPA は redirect 経由 `code+PKCE`、XHR ではない。 |
| `/par`、`/introspect`、`/revoke` | ❌ | バックエンド間。 |

::: tip credentialed XHR
CORS 層は `Access-Control-Allow-Credentials: true` を設定し、SPA の `fetch(url, { credentials: 'include' })` が OP のセッション cookie を運べるようにします。ブラウザは `Access-Control-Allow-Origin` が特定 origin（`*` ではなく）であることを要求します — ライブラリはこれに従い、マッチした要求 origin をそのまま返します。ワイルドカードは返しません。
:::

## Public client + PKCE

SPA は **public クライアント**（`token_endpoint_auth_method=none`）です。`client_secret` を保管できません。代わりに PKCE を使います:

```go
op.WithStaticClients(op.ClientSeed{
  ID:                      "spa-client",
  TokenEndpointAuthMethod: op.AuthNone,
  GrantTypes:              []grant.Type{grant.AuthorizationCode, grant.RefreshToken},
  RedirectURIs:            []string{"https://app.example.com/callback"},
})
```

OP は全クライアントで `code_challenge_method=plain` を拒否 — `S256` のみ — なので SPA の PKCE は本物の PKCE、レガシー変種ではありません。

## OP 発行 cookie とクロスサイト

CORS で origin を許可しても、OP のセッション cookie は **op.example.com** に設定されます — それがその cookie の保管場所です。**app.example.com** の SPA はそれを直接読み書きできません。OP のセッション cookie の役割は `/authorize` リダイレクトを跨いでユーザを OP にログインさせ続けることです。SPA のセッションは SPA 自身の cookie / storage に保管されます。
