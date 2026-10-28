---
title: Client Credentials
description: エンドユーザ無しのサービス間トークン。RFC 6749 §4.4。
pageClass: pg-concepts-client-credentials
---

# Client Credentials

`grant_type=client_credentials` は **サービス間** grant です — エンドユーザ、ブラウザ、同意はありません。confidential なバックエンドがトークンエンドポイントで **自分自身として** 認証し、別のバックエンドを呼ぶためのアクセストークンを得ます。バッチ、内部 API、デーモンが対象です。人が関わる場面では[認可コード + PKCE](./authorization-code-pkce)を使います。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework（§4.4 client credentials）
- [RFC 7521](https://datatracker.ietf.org/doc/html/rfc7521) — Assertion Framework for OAuth 2.0
- [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — JWT Profile for OAuth 2.0 Client Authentication（`private_key_jwt`）
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
:::

::: details 用語の補足
- **Confidential クライアント** — 実認証情報（長寿命の秘密、非対称鍵、X.509 証明書など）を保持できるクライアント。バックエンドや信頼境界内のサーバが該当します。詳しくは[クライアント種別](./client-types)を参照してください。
- **Public クライアント** — 実秘密を保持できないクライアント（ブラウザの SPA、ネイティブモバイルアプリなど）。`token_endpoint_auth_method=none` で動作し、コード保護は PKCE に頼ります。
- **`private_key_jwt`** — クライアント認証方式のひとつ。クライアントが秘密鍵で短寿命の JWT に署名し、OP は登録済みの公開鍵で検証します。共有秘密と違い、秘密がクライアントの外に出ないので強度が高い。
:::

<figure class="fig">
  <div class="fig-head">ユーザなし、サービスが自分自身としてトークンを得る</div>
  <svg class="fig-svg" role="img" aria-labelledby="cc-flow-title" viewBox="0 0 960 632" xmlns="http://www.w3.org/2000/svg">
    <title id="cc-flow-title">client_credentials フローを示した図。Service A が自分自身として OP に認証し、登録済みの範囲に絞られたアクセストークンを受け取り、それを bearer の資格情報として Service B に提示します。</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="296" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">トークンを取得</text>
    <rect class="fg-group" x="32" y="424" width="896" height="182" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="452">API を呼ぶ</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="608"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="608"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="608"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">あなたのバックエンド</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">別のバックエンド</text>
    <!-- token request -->
    <path class="fg-edge" d="M192,206 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="172" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="352" y="194" text-anchor="middle">grant_type=client_credentials</text>
    <!-- OP checks -->
    <path class="fg-edge fg-edge--accent" d="M512,246 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="252">クライアントを認証</text>
    <text class="fg-s" x="568" y="274">scope を許可リストと照合</text>
    <!-- token response -->
    <path class="fg-edge fg-edge--accent" d="M512,376 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="342" text-anchor="middle">200 · access_token</text>
    <text class="fg-xs" x="352" y="364" text-anchor="middle">id_token と refresh_token は無し</text>
    <!-- API call -->
    <path class="fg-edge" d="M192,526 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="492" text-anchor="middle">GET /things</text>
    <text class="fg-mxs fg-halo" x="508" y="514" text-anchor="middle">Authorization: Bearer &lt;token&gt;</text>
    <!-- API response -->
    <path class="fg-edge fg-edge--muted" d="M824,582 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="572" text-anchor="middle">200 [ … ]</text>
  </svg>
  <figcaption class="fig-note">返ってくるのはアクセストークンだけです。記述すべきユーザがいないので ID トークンはなく、クライアントは認証し直して取り直せるのでリフレッシュトークンもありません。トークンの <code>sub</code> はクライアント自身です。</figcaption>
</figure>

::: warning Confidential クライアントのみ
`client_credentials` は **confidential クライアント**（実認証情報を持つもの: `client_secret_basic`、`client_secret_post`、`private_key_jwt`）に限られます。public クライアント（SPA / ネイティブ、`token_endpoint_auth_method=none`）は使えません。`tls_client_auth` と `self_signed_tls_client_auth` は本ライブラリでは選べません。代わりに [mTLS](./mtls) が、どの方式で認証したクライアントに対しても、発行アクセストークンを証明書に結び付けます。

エンドユーザがいないため、PKCE / 同意 / `id_token` / **リフレッシュトークン** はありません。クライアントはアクセストークンが期限切れになったら grant を再実行します。
:::

## 実装

grant を明示的に有効化します。有効な集合に無い grant は、トークンエンドポイントが拒否します。

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

st := inmem.New()
browserFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

handler, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(browserFlow),
  op.WithGrants(
    grant.AuthorizationCode, // 人間ユーザ向け
    grant.RefreshToken,
    grant.ClientCredentials, // サービス間
  ),
  op.WithStaticClients(/* confidential クライアント */),
)
```

登録クライアント側でも `GrantTypes` で明示します。静的に登録する `client_secret_basic` / `client_secret_post` のクライアントには `Secret`（または計算済みの `SecretHash`）が必須で、無いと `op.New` が拒否します。`private_key_jwt` では公開 JWKS を渡した `op.PrivateKeyJWTClient` を使います。

```go
op.WithStaticClients(op.ConfidentialClient{
  ID:         "service-a",
  Secret:     "rotate-me",
  AuthMethod: op.AuthClientSecretBasic, // 空なら既定でこの値
  GrantTypes: []string{"client_credentials"},
  Scopes:     []string{"read:things", "write:things"},
})
```

::: details グローバル許可とクライアント別許可の両方が必要な理由
- **グローバル** (`op.WithGrants`) は OP として受け付ける grant の集合を決め、[discovery](./discovery) の `grant_types_supported` に出ます。
- **クライアント別** (クライアントレコードの `GrantTypes`) は、そのうち **そのクライアント** が使える grant を決めます。空のままなら静的クライアントは `authorization_code` と `refresh_token` が既定で、値を入れると既定は丸ごと置き換わります。

両方の判定を通ったときだけ発行が成功します。同じ OP から、ユーザ向けアプリには `authorization_code` を、バックエンドサービスには `client_credentials` を発行しつつ、SPA クライアントにバックエンド用トークンを取らせない構成になります。
:::

## トークンの形

`client_credentials` アクセストークンは次を持ちます:

- `iss` — OP issuer
- `aud` — リクエストが指定した `resource`（RFC 8707）。指定がなければ OP の issuer。詳細は下記
- `client_id` — 要求元クライアント
- `sub = client_id` — RFC 9068 §2.2 は `sub` がクライアントアプリケーションに対応することを SHOULD としています。本ライブラリはクライアント自身を subject にします
- `scope` — 付与された scope。リクエストに `scope` が無ければ、クライアントに登録された scope のうち `openid` を除くすべて

`op.WithFeature(feature.MTLS)` または DPoP が設定され、クライアントが送信者制約を提示した場合、トークンには加えて RFC 7800 の `cnf` (Confirmation) claim が入り、鍵または証明書に結び付けられます。

subject が pairwise になることはありません。クライアントの `SubjectType` が pairwise でも `sub` は素の `client_id` です。pairwise 識別子はエンドユーザ向けの仕組みだからです。

::: details なぜ `sub = client_id` なのか
ユーザを伴うフローでは `sub` はエンドユーザの安定識別子です。`client_credentials` にはエンドユーザがいないため、RFC 9068 §2.2 は `sub` がクライアントアプリケーションに対応することを SHOULD としています。`sub` と `client_id` を同じ値にすることまでは要求していません。本ライブラリはこの直接的な対応付けを選び、`sub = client_id` とします。`sub` を見て「誰がやったか」を記録する RS は依然として安定識別子を得られますが、サービストークンの場合の識別子は人ではなく登録済みサービスを指す、という前提を持つ必要があります。よくあるバグは「`sub` は必ず user テーブルの行を指す」と思い込むことです。サービストークンでは *client* テーブルの行を指します。
:::

::: details `client_credentials` の `aud` — 意味と設定方法
**`aud`** は、そのトークンを受け取るリソースサーバを示します。`client_id` ではありません。「このトークンは私が消費するために発行された」を RS に伝える値です。ライブラリはリクエストから次のように決めます。

- `resource=https://api.example.com`（RFC 8707）が付いていれば、正規化した値が `aud` になります。値はクライアントに登録した `Resources` の許可リストに含まれている必要があり、1 リクエストに指定できる `resource` は 1 つだけです。違反は `400 invalid_target` です。
- `resource` が無ければ、`aud` は OP の issuer です。

`Resources` は許可リストであって既定値ではありません。登録しただけでは `aud` に何も入りません。RS は、自分の識別子と一致しない `aud` のトークンを拒否してください。ある RS から盗まれたトークンを別の RS に再生される攻撃への、audience 制限による防御です。
:::

## トークンエンドポイントの応答

| 条件 | 応答 |
|---|---|
| クライアント認証に失敗 | `invalid_client`。クライアントの JWKS 取得が過負荷または失敗中なら `503`、クライアントストア障害なら `500 server_error` |
| public クライアント、または `GrantTypes` に `client_credentials` が無い | `400 unauthorized_client` |
| `scope` に `openid` を含む | `400 invalid_scope` |
| `scope` にクライアント登録の `Scopes` 外の値を含む | `400 invalid_scope`（黙って絞り込まず拒否） |
| `resource` が不正、異なる値で重複、または `Resources` に無い | `400 invalid_target` |

public クライアントと grant 未登録のクライアントに同じコードを返すのは意図的です。通信路上の応答から両者を見分けられないようにしています。

::: details Bearer と送信者制約の違い
既定では、`client_credentials` アクセストークンは **Bearer** トークン（RFC 6750）です — 「持っている者が使える」。漏洩した Bearer トークンは、有効期限まで攻撃者にも機能します。

**送信者制約付き** アクセストークン（RFC 8705 mTLS、または RFC 9449 DPoP）は、`cnf` claim でトークンを正規クライアントが保持する鍵に結び付けます。RS は API 呼び出しごとに、呼び出し元がその鍵を保有していることを証明させます。漏洩しても、対応する秘密鍵が無いと使えません — そして秘密鍵はクライアントの外に出ません。

規制対応のサービス間通信（FAPI 2.0、PSD2、OBL）では送信者制約が標準的な既定値です。mesh 層で mTLS が強制されている内部サービス間通信では、素の Bearer でも実用上問題ない場合があります。
:::

## 動作確認

[`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) は、サービス間通信専用の OP（`op.WithGrants(grant.ClientCredentials)`）に `client_secret_basic` のクライアントを 1 つ置いた例です。起動時に表示される `curl` コマンドでトークンを取得できます。

```sh
(cd examples/05-client-credentials && GOWORK=off go run -tags example .)
```

## 次に読むもの

- [アクセストークンの形式](./access-token-format) — JWT と opaque の違い、`aud` による形式の選択。
- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — サービストークンをクライアント保有鍵に結び付け、盗難トークンを無効化する。
- [ユースケース: 本番の client_credentials](/ja/use-cases/client-credentials)。
