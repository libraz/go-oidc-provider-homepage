---
title: SPA 向け CORS
description: SPA の API 呼び出しに明示的な CORS origin を設定しつつ、interaction と end-session ceremony の origin を狭く保つ方法を説明します。
pageClass: pg-use-cases-cors-spa
---

# ユースケース — SPA 向け CORS

## SPA とは何か、なぜ CORS が要るのか

**Single-Page Application（SPA）** は、ブラウザ内で動く JS フロントエンド（React、Vue、Svelte など）で、`fetch()` で API を呼びます。サーバ描画の RP と違うのは次の 2 点です。

1. **`client_secret` を保持できません。** JS バンドルは誰でも読めるためです。SPA は *public クライアント*（[クライアントの種類](/ja/concepts/client-types)）として扱われ、secret の代わりに **PKCE（RFC 7636）** で認可コードを守ります。
2. 多くの場合、OP とは **別の origin** で配信されます（`app.example.com` と `op.example.com`）。ブラウザの **CORS**（Fetch 標準の Cross-Origin Resource Sharing）の規則により、SPA が JavaScript から呼ぶすべてのエンドポイントで、OP が SPA の origin を明示的に許可する必要があります。

origin が違っても、ホストが同じ registrable domain を共有していれば（`app.example.com` と `op.example.com`）、same-site です。OP の ceremony cookie は same-site 限定なので、この違いが重要になります。

このページは CORS のレイヤを扱います。PKCE は [Authorization Code + PKCE](/ja/concepts/authorization-code-pkce) で説明しています。

<figure class="fig">
  <div class="fig-head">なぜブラウザが先に尋ねるのか</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-cors-title" viewBox="0 0 960 568" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-cors-title">SPA が fetch を呼ぶと、SPA ではなくブラウザがページのオリジンを載せた preflight を送り、OP が許可リストに照らして応答します。許可されたオリジンの場合にだけ、SPA は本リクエストの応答を読めます。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="544"/>
    <line class="fg-life" x1="512" y1="88" x2="512" y2="544"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="544"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">SPA</text>
    <text class="fg-mxs" x="192" y="72" text-anchor="middle">app.example.com</text>
    <rect class="fg-box" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="512" y="50" text-anchor="middle">ブラウザ</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">preflight を送る</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- fetch -->
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">fetch()</text>
    <!-- preflight -->
    <path class="fg-edge" d="M512,200 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="190" text-anchor="middle">OPTIONS + Origin</text>
    <!-- allow-list check -->
    <path class="fg-edge fg-edge--accent" d="M824,232 h-40 v24 h40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="768" y="238" text-anchor="end">オリジンを</text>
    <text class="fg-s" x="768" y="260" text-anchor="end">許可リストと照合</text>
    <!-- answer -->
    <path class="fg-edge fg-edge--accent" d="M824,320 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="668" y="310" text-anchor="middle">Access-Control-Allow-Origin</text>
    <!-- real request -->
    <path class="fg-edge" d="M512,392 H824" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="382" text-anchor="middle">本リクエスト · Bearer</text>
    <!-- response -->
    <path class="fg-edge fg-edge--accent" d="M824,456 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="668" y="446" text-anchor="middle">応答</text>
    <!-- read gate -->
    <path class="fg-edge fg-edge--muted" d="M512,520 H192" marker-end="url(#fg-am)"/>
    <text class="fg-s" x="352" y="510" text-anchor="middle">オリジンが一致した場合のみ読める</text>
  </svg>
  <figcaption class="fig-note">許可リストは認証の検査ではありません。決めているのは、そのオリジンのページが応答を読んでよいかどうかだけで、トークン自体は単独で成立している必要があります。</figcaption>
</figure>

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE（Proof Key for Code Exchange）
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1（ブラウザサイド public クライアント）
- [Fetch Standard](https://fetch.spec.whatwg.org/)（WHATWG）— CORS / preflight のセマンティクスを定義
- [RFC 6265bis](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis) — Cookies、`SameSite`、`__Host-` プレフィクス
:::

::: details 用語の補足
- **Origin**: `(scheme, host, port)` の 3 つ組です。`https://app.example.com:443` と `https://app.example.com:8443` は別の origin です。ブラウザの same-origin policy がページ同士を隔離し、CORS はその制御された例外です。
- **CORS preflight**: `Authorization` ヘッダやカスタムヘッダを付ける、GET・HEAD・POST 以外のメソッドを使うなど、単純でないリクエストの前に、ブラウザが `OPTIONS` リクエストで「この origin にこのリクエストを許すか」とサーバに尋ねることです。応答が許可して初めて、本来のリクエストが送られます。OP は CORS を有効にしたすべてのエンドポイントで preflight に答えるので、アプリケーションのコードには見えません。
- **public クライアントと confidential クライアント**: *public* クライアント（SPA、モバイルアプリ）は秘密を保持できません。*confidential* クライアント（バックエンド）は保持できます。public クライアントは、秘密がない分、認可コードが無防備になるため、PKCE が必須です。
:::

> **ソース:** [`examples/14-cors-spa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/14-cors-spa)

## OP が許可するもの

OP は 3 つの CORS プロファイルを使い、それぞれ別の許可リストを持ちます。

| プロファイル | エンドポイント | 許可する origin | 応答 |
|---|---|---|---|
| public | discovery、`/jwks`、protected resource metadata | すべて | `Access-Control-Allow-Origin: *`、資格情報なし |
| API（strict） | `/token`、`/userinfo`、`/par`、`/introspect`、`/revoke`、`/register`、`/bc-authorize`、`/device_authorization`、grant management | 下の API の許可リスト | リクエストの origin をそのまま返し、資格情報を許可 |
| ceremony（strict） | interaction の状態ルート（`/interaction/{uid}` または `LoginMount/state/{uid}`）、`/end_session` | issuer の origin と `WithCORSOrigins` だけ | API と同じ。許可リストだけが狭い |

`/auth` に CORS はありません。`fetch()` ではなく、ブラウザの画面遷移だからです。

**API の許可リスト**は、次の和集合です。

1. issuer 自身の origin。
2. `op.WithCORSOrigins("https://app.example.com", ...)` に渡した origin。
3. `op.WithStaticClients` で登録したクライアントの、すべての `redirect_uri` の origin。動的クライアント登録で作ったクライアントや、自前のクライアントストアにあるクライアントは何も加えないので、その origin は `WithCORSOrigins` に列挙します。

**ceremony の許可リスト**は、意図的に狭くしてあります。issuer の origin と `WithCORSOrigins` の項目だけで、`redirect_uri` から導いた origin は入りません。あるクライアントがコールバックとして登録したというだけで API の許可リストに入ったページが、別のクライアントの CSRF トークン、アカウント一覧、ログアウトの確認を読めてはいけないためです。ceremony の origin は、issuer と same-site でなければなりません（たとえば `op.example.com` と並べた `login.example.com`）。明示的に列挙した、本当に cross-site な origin は、preflight を通過して CORS ヘッダを受け取ることはありますが、ブラウザが `__Host-` の ceremony cookie を送りません。`__Host-oidc_interaction`（`SameSite=Lax`）、`__Host-oidc_csrf` と `__Host-oidc_logout_csrf`（どちらも `SameSite=Strict`）です。その結果、interaction と end-session のリクエストは `404` になります。

## コード

```go
op.New(
  /* 必須オプション */
  op.WithCORSOrigins(
    "https://admin.example.com",     // redirect_uri にならない origin
    "http://localhost:5173",         // リモートの issuer に対するローカル開発: API の CORS のみ
  ),
  op.WithStaticClients(op.PublicClient{
    ID:           "spa-client",
    RedirectURIs: []string{"https://app.example.com/callback"}, // https://app.example.com を許可リストに加える
    Scopes:       []string{"openid", "profile"},
  }),
)
```

複数の経路で重複した origin は、まとめられます。`WithCORSOrigins` は、`*`、スキームやホストのないもの、絶対 origin でないものを `op.New` の実行時に拒否します。「すべて許可」という設定は存在しません。ポートが違えば別の origin なので、使っている Vite（`:5173`）や Next.js（`:3000`）の開発用 origin も列挙してください。

## preflight と応答ヘッダ

strict の 2 つのプロファイルは、どちらの許可リストでも同じように動作します。

- 許可された origin からの preflight（`Access-Control-Request-Method` を伴う `OPTIONS`）には、`204`、`Access-Control-Allow-Methods: GET, POST, OPTIONS`、`Access-Control-Allow-Headers`（リクエストされたもののうち `Content-Type, Authorization, DPoP, X-CSRF-Token` に含まれるもの）、`Access-Control-Max-Age: 600` を返します。SPA の状態ルートだけは `DELETE`（interaction のキャンセル）も許可します。
- それ以外の origin からの preflight や、そのエンドポイントが許可しないメソッドの preflight には、CORS ヘッダなしの `403` を返します。
- 許可された origin からの通常のリクエストには、`Access-Control-Allow-Origin` にリクエストの origin（`*` ではなく）、`Access-Control-Allow-Credentials: true`、`Vary: Origin` を付けます。それ以外の origin への応答には `Access-Control-Allow-*` ヘッダが付かず、ブラウザは応答を公開しません。
- strict のプロファイルは `DPoP-Nonce`、`WWW-Authenticate`、`x-fapi-interaction-id` を公開します。そのため、ブラウザの SPA が同一 origin のプロキシなしで DPoP の nonce リトライを行い、FAPI の interaction ID を読めます。
- `Access-Control-Allow-Credentials: true` により、`fetch(url, { credentials: 'include' })` が cookie を送れますが、cookie の `SameSite` 属性を覆すことはできません。

OP は preflight を許可するたびに `op.AuditCORSPreflightAllowed`（`cors.preflight.allowed`）を発行します。preflight は内側のハンドラが動く前に `204` で応答されるため、リクエスト単位の監査やメトリクスだけでは、cross-origin のアクセスを見逃すからです。このイベントは、正当な CORS トラフィックの基準線として使ってください。忙しいエンドポイントで突然なくなったなら、`WithCORSOrigins` の変更が原因であることが多く、見慣れない origin から急に増えたなら、登録済みの `redirect_uri` の origin と照らして確認する価値があります。

## SPA が実際に呼ぶエンドポイント

strict の CORS を付けたエンドポイントは上限です。一般的な SPA が必要とするものは、それより少なくなります。

| エンドポイント | ブラウザが呼ぶか | CORS の要否 |
|---|---|---|
| `/auth` | 呼ばない（ページ遷移） | 不要 |
| `/token` | 呼ぶ（`fetch` での PKCE のコード交換） | 必要 |
| `/userinfo` | 呼ぶ（JS から `Authorization: Bearer`） | 必要 |
| `/jwks`、discovery | ブラウザ上の RP SDK が取得する場合 | 必要（public プロファイル） |
| `/introspect` | 呼ばない（リソースサーバから OP へのサーバ間） | 通常は不要 |
| `/revoke` | SPA 自身がトークンを失効させる場合のみ | 設計による |
| `/par`、`/bc-authorize`、`/device_authorization` | 呼ばない（RP のバックエンドやデバイスが開始） | 不要 |
| `/register` | 呼ばない。SPA に登録を意図的に公開する場合を除く | まれに必要 |
| `/end_session` | 呼ばない（ページ遷移） | 不要 |
| interaction の状態ルート | ログイン UI が別 origin の SPA なら呼ぶ | 必要（ceremony のリスト） |

OP は、「不要」のエンドポイントも CORS で包んでいます。包むコストが小さく、管理コンソールやブラウザ上のテストハーネスで役に立つためです。origin を列挙しなければ、strict の層は `Access-Control-Allow-*` ヘッダを返さず、ブラウザは応答を拒否します。それが正しい結果です。

## public クライアントと PKCE

SPA は **public クライアント**（`token_endpoint_auth_method=none`）です。`client_secret` を保持できないので、PKCE で補います。

```go
op.WithStaticClients(op.PublicClient{
  ID:           "spa-client",
  RedirectURIs: []string{"https://app.example.com/callback"},
  Scopes:       []string{"openid", "profile"},
  GrantTypes:   []string{"authorization_code", "refresh_token"},
})
```

`op.PublicClient` は、SPA やネイティブアプリ向けの型付きシードです。`token_endpoint_auth_method=none` と `public_client=true` を自動で設定するので、SPA が誤って confidential 認証のまま出荷されることはありません。strict の CORS が `/token` を包んでいるため、許可リストに入った SPA は、プロキシなしで JavaScript からコード交換を行えます。OP が受け付けるのは `code_challenge_method=S256` だけで、`plain` は受け付けません。

## OP の cookie と cross-site

OP のセッション cookie は `op.example.com` に置かれ、`app.example.com` の SPA はそれを読み書きできません。issuer の兄弟ホストにある SPA なら、`SameSite` 属性の範囲で `credentials: 'include'` で送れます。本当に cross-site な origin は、cookie に依存する ceremony を動かせません。セッション cookie の役目は、`/auth` のリダイレクトをまたいで OP でのサインイン状態を保つことです。SPA 自身のセッションは、SPA のストレージに置いてください。

## 落とし穴

- **`credentials: 'include'` には `*` ではなく具体的な origin が必要です。** strict のプロファイルは origin をそのまま返すので、`/userinfo` と `/token` は資格情報付きでも動きます。discovery と `/jwks` は public プロファイル（`*`、資格情報なし）です。DevTools に「credentials flag is true, but Access-Control-Allow-Credentials is not 'true'」と出たら、public プロファイルのエンドポイントに資格情報を付けて送っています。この 2 つには `credentials: 'include'` を付けないでください。
- **ポートの書き忘れ。** ポートが違えば別の origin です。`redirect_uri` が `http://localhost:5173/callback` の静的クライアントは、`http://localhost:5173` を自動で API の許可リストに加えます。別のポートの開発サーバや、動的に登録したクライアントには、`WithCORSOrigins` の項目が別途必要です。
- **CORS が通っても ceremony が通るとは限りません。** 明示した cross-site の origin が preflight を通過しても、ceremony は `404` で失敗することがあります。ログイン UI は、issuer の兄弟で same-site のホストに置いてください。
- **OP の cookie は SPA のセッションではありません。** CORS で SPA が応答を読めるようになるだけで、`op.example.com` の cookie に SPA がアクセスできるようにはなりません。
