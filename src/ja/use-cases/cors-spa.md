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
  op.WithStaticClients(op.PublicClient{
    ID:           "spa-client",
    RedirectURIs: []string{"https://app.example.com/callback"},
    Scopes:       []string{"openid", "profile"},
    /* ... */
  }),
)
```

静的 / 自動導出 origin は同じ内部リストに着地、重複は除去されます。

## どのエンドポイントに CORS ヘッダが付くか

| Endpoint | CORS 有効？ | 理由 |
|---|---|---|
| `/.well-known/openid-configuration` | ✅ | RP / SPA が fetch する。 |
| `/jwks` | ✅ | RP / SPA が ID トークンを検証する。 |
| `/userinfo` | ✅ | SPA が Bearer トークン付きで呼ぶ。 |
| `/interaction/*`（SPA driver 使用時） | ✅ | SPA がポーリング。 |
| `/session/*` | ✅ | SPA がセッション状態を読む。 |
| `/authorize` | ❌ | ブラウザナビゲーション、XHR ではない。 |
| `/token` | ✅ | browser public client が `code+PKCE` を `fetch` で交換できる。backend RP は CORS ヘッダを無視する。 |
| `/par`、`/introspect`、`/revoke`、`/register` | マウント時 ✅ | admin console やブラウザベースの harness 用に strict CORS を提供。実際の受理可否は各 protocol auth check が決める。 |
| `/bc-authorize`、`/device_authorization`、`/end_session` | マウント時 ✅ | 通常は server-side または navigation flow だが、tooling と明示的な browser integration 向けに wrap される。 |

::: tip credentialed XHR
CORS 層は `Access-Control-Allow-Credentials: true` を設定し、SPA の `fetch(url, { credentials: 'include' })` が OP のセッション cookie を運べるようにします。ブラウザは `Access-Control-Allow-Origin` が特定 origin（`*` ではなく）であることを要求します — ライブラリはこれに従い、マッチした要求 origin をそのまま返します。ワイルドカードは返しません。
:::

## Public client + PKCE

SPA は **public クライアント**（`token_endpoint_auth_method=none`）です。`client_secret` を保管できません。代わりに PKCE を使います:

```go
op.WithStaticClients(op.PublicClient{
  ID:           "spa-client",
  RedirectURIs: []string{"https://app.example.com/callback"},
  Scopes:       []string{"openid", "profile"},
  GrantTypes:   []string{"authorization_code", "refresh_token"},
})
```

`op.PublicClient` は SPA / native アプリ向けの typed seed で、`token_endpoint_auth_method=none` と `public_client=true` を自動でセットします。これにより、SPA を confidential 認証で誤ってリリースする事故を構造的に防ぎます。OP の strict CORS wrapper は `/token` も覆うので、allowlist に入った SPA は JavaScript から PKCE code exchange を実行できます。

OP は全クライアントで `code_challenge_method=plain` を拒否 — `S256` のみ — なので SPA の PKCE は本物の PKCE、レガシー変種ではありません。

## OP 発行 cookie とクロスサイト

CORS で origin を許可しても、OP のセッション cookie は **op.example.com** に設定されます — それがその cookie の保管場所です。**app.example.com** の SPA はそれを直接読み書きできません。OP のセッション cookie の役割は `/authorize` リダイレクトを跨いでユーザを OP にログインさせ続けることです。SPA のセッションは SPA 自身の cookie / storage に保管されます。

## エンドポイント別の CORS の効き方

直前の表は、ライブラリが strict CORS ハンドラで *ラップ* しているエンドポイントの一覧です。これは上限です — ラップされたエンドポイントは origin が allowlist にあれば cross-origin リクエストに応答できる、という意味でしかありません。下限 — つまり典型的なデプロイで *実際に CORS が要る* エンドポイントは、もっと狭く、ブラウザから誰がそのエンドポイントを呼ぶかで決まります。

allowlist は 2 つの集合の和です。`WithCORSOrigins` で明示した entries と、クライアントストアに登録された全 `redirect_uri` の origin です。SPA クライアントを `RedirectURIs: []string{"https://app.example.com/callback"}` で登録すれば、`https://app.example.com` は自動で CORS allowlist に入ります。`WithCORSOrigins` は、`redirect_uri` として登場しない browser-side origin（別の管理用 SPA、ステータスページ、localhost 開発 origin など）のためにあります。

| Endpoint | ブラウザから呼ぶか? | 実運用で CORS が必要か? |
|---|---|---|
| `/authorize` | 呼ばない — フルページリダイレクトであって XHR ではない。 | 不要。 |
| `/token` | SPA は呼ぶ（`fetch` で PKCE のコード交換）。 | SPA では必要、サーバサイドの RP では不要。 |
| `/userinfo` | SPA は呼ぶ（JS から `Authorization: Bearer`）。 | SPA では必要。 |
| `/jwks` | 呼ぶ — ブラウザで動く RP SDK がフェッチ。 | 必要(よくある)。 |
| `/.well-known/openid-configuration` | 呼ぶ — `fetch` での discovery 取得は広く行われる。 | 必要。 |
| `/introspect` | 呼ばない — RFC 7662 は RS → OP のサーバ間通信。 | 通常不要。 |
| `/revoke` | 場合による — SPA 自身が失効を起動する設計のときのみ。 | SPA の設計次第。 |
| `/par` | 呼ばない — authorize 要求は RP バックエンドが push。 | 不要。 |
| `/bc-authorize` | 呼ばない — CIBA の起動はサーバサイド。 | 不要。 |
| `/device_authorization` | 呼ばない — デバイスフローの起動はサーバサイド。 | 不要。 |
| `/register`（Dynamic Client Registration） | 既定では呼ばない。 | DCR を意図的に SPA に開放する場合のみ。 |
| `/end_session` | 呼ばない — フルページリダイレクトかバックチャネル。 | 不要。 |

ライブラリは「不要」側のいくつかのエンドポイントも `strictCORS` でラップしています。ラップのコストが小さく、JS から呼ぶ可能性のあるツール（管理コンソール、ブラウザベースのテストハーネス）に対する将来耐性を確保したいためです。ブラウザから使う予定がないなら、それらの origin を allowlist に追加する必要はありません。allowlist にマッチしない場合、strict 層は `Access-Control-Allow-*` ヘッダを 1 つも返さず、ブラウザはレスポンスを拒否します — これが正しい挙動です。

::: tip cross-origin トラフィックの監査シグナル
strict CORS 層は、allowlist に載った origin から `OPTIONS` preflight を受理するたびに `op.AuditCORSPreflightAllowed`（`cors.preflight.allowed`）を発火します。ダッシュボードが actual（preflight ではない方の）リクエストだけを観測している場合、cross-origin の活動を完全に見落とすことがあります — preflight は 204 で短絡され、内側のハンドラに到達しないためです。このイベントを「正規 CORS トラフィック」のベースラインとして扱ってください。普段は活発なエンドポイントで突然このイベントが消えたら `WithCORSOrigins` の設定変更ミスを疑う合図、見覚えのない origin から急増したら `redirect_uris` レジストリと突き合わせる合図です。
:::

### SPA を組み込む際の落とし穴

- **`credentials: 'include'` には `*` ではなく特定の origin が必要。** ブラウザは `Access-Control-Allow-Origin: *` を返すレスポンスに対して cookie を送らない仕様です。本ライブラリは allowlist にマッチした origin に対しては `*` を返さず、strict 層は要求された `Origin` をそのままエコーし、`Access-Control-Allow-Credentials: true` と組み合わせて返します。SPA は `fetch(url, { credentials: 'include' })` で `/userinfo` を呼べ、ブラウザはレスポンスを受け入れます。DevTools で「credentials flag is true, but Access-Control-Allow-Credentials is not 'true'」と出た場合は、リクエストが public CORS プロファイル（`/jwks`、`/.well-known/openid-configuration`）に当たっています — これらのエンドポイントは意図的に `*` を返し、credentials を許可しません（cookie が要る browser-side 呼び出し元が無いため）。
- **ワイルドカード origin は設定ミスであって、選択肢ではない。** `WithCORSOrigins` は各 entry を実 origin として検証し、起動時に `*` を拒否します — 「全部許可」設定はそもそも存在しません。allowlist は明示的に組み立ててください。本番 SPA、ステージング、localhost の各開発ポート全部です。組み込み側はしばしば Vite の `:5173` や Next.js dev の `:3000` を忘れます — ブラウザはポートが違えば別 origin として扱うので、ポートごとに個別 entry が必要です。
- **`http://localhost:5173/callback` を redirect URI として登録すると `http://localhost:5173` は自動で allowlist に載る。** `WithCORSOrigins` で重ねて指定する必要はありません。重複しても無害（重複除去されます）ですが、設定がノイジーになるだけです。
- **OP のセッション cookie は OP の origin にのみ存在し、SPA の origin には無い。** CORS は SPA がレスポンスを受け取ることは許可しますが、SPA が `op.example.com` の cookie を読み書きできるようにするわけではありません。SPA 自身のセッション状態は SPA 側のストレージに保管します — 「OP 発行 cookie とクロスサイト」節を参照。
