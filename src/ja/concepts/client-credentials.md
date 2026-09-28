---
title: Client Credentials
description: エンドユーザ無しのサービス間トークン。RFC 6749 §4.4。
pageClass: pg-concepts-client-credentials
---

# Client Credentials

`grant_type=client_credentials` は **サービス間** grant です — エンドユーザ、ブラウザ、同意はありません。confidential なバックエンドが **自分自身として** 認証し、別のバックエンドを呼ぶためのアクセストークンを得ます。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework（§4.4 client credentials）
- [RFC 7521](https://datatracker.ietf.org/doc/html/rfc7521) — Assertion Framework for OAuth 2.0
- [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — JWT Profile for OAuth 2.0 Client Authentication（`private_key_jwt`）
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
:::

::: details 用語の補足
- **Confidential クライアント** — 実認証情報（長寿命の秘密、非対称鍵、X.509 証明書など）を保持できるクライアント。バックエンドや信頼境界内のサーバが該当します。
- **Public クライアント** — 実秘密を保持できないクライアント（ブラウザの SPA、ネイティブモバイルアプリなど）。`token_endpoint_auth_method=none` で動作し、コード保護は PKCE に頼ります。
- **`private_key_jwt`** — クライアント認証方式のひとつ。クライアントが秘密鍵で短寿命の JWT に署名し、OP は登録済みの公開鍵で検証します。共有秘密と違い、秘密がクライアントの外に出ないので強度が高い。
:::

<figure class="fig">
  <div class="fig-head">Client Credentials — サービス単体、ユーザ不在</div>
  <svg class="fig-svg" role="img" aria-labelledby="cc-flow-title" viewBox="0 0 960 316" xmlns="http://www.w3.org/2000/svg">
    <title id="cc-flow-title">client_credentials フローを示した図。Service A が自分自身として OP に認証し、登録済みの範囲に絞られたアクセストークンを受け取り、それを bearer の資格情報として Service B に提示します。</title>
    <!-- ライフライン -->
    <line class="fg-life" x1="160" y1="62" x2="160" y2="300"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="300"/>
    <line class="fg-life" x1="820" y1="62" x2="820" y2="300"/>
    <!-- 登場人物 -->
    <rect class="fg-box" x="70" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="160" y="35" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="160" y="49" text-anchor="middle">あなたのバックエンド</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="730" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="820" y="35" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="820" y="49" text-anchor="middle">別のバックエンド</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="124" r="8.5"/>
    <text class="fg-badge-t" x="15" y="127" text-anchor="middle">1</text>
    <path class="fg-edge" d="M160,124 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="330" y="92" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="330" y="105" text-anchor="middle">grant_type=client_credentials</text>
    <text class="fg-mxs" x="330" y="118" text-anchor="middle">scope · クライアント認証</text>
    <!-- 2 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="158" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="161" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,150 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="542" y="154">要求された scope を検査する</text>
    <text class="fg-mxs" x="542" y="167">クライアントの許可リストと照合</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="204" r="8.5"/>
    <text class="fg-badge-t" x="15" y="207" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--accent" d="M500,204 H160" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="330" y="184" text-anchor="middle">200 OK</text>
    <text class="fg-mxs" x="330" y="197" text-anchor="middle">{ access_token, expires_in } — id_token も refresh_token も無い</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="252" r="8.5"/>
    <text class="fg-badge-t" x="15" y="255" text-anchor="middle">4</text>
    <path class="fg-edge" d="M160,252 H820" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="490" y="232" text-anchor="middle">GET /things</text>
    <text class="fg-mxs fg-halo" x="490" y="245" text-anchor="middle">Authorization: Bearer &lt;token&gt;</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="288" r="8.5"/>
    <text class="fg-badge-t" x="15" y="291" text-anchor="middle">5</text>
    <path class="fg-edge" d="M820,288 H160" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="490" y="282" text-anchor="middle">200 [ … ]</text>
  </svg>
  <figcaption class="fig-note">この図のどこにもユーザがいません。ID トークンが記述すべき相手も、リフレッシュトークンが切れたときに再同意する相手も存在しないということです。発行されるトークンの <code>sub</code> はクライアント自身になります。</figcaption>
</figure>

::: warning Confidential クライアントのみ
`client_credentials` は本ライブラリでは構造的に **confidential クライアント**（実認証情報を持つもの: `client_secret_basic`、`client_secret_post`、`private_key_jwt`）に制限されます。public クライアント（SPA / ネイティブ、`token_endpoint_auth_method=none`）は使えません。mTLS は発行アクセストークンの結び付けには使えますが、`client_credentials` の認証方式ではありません。

エンドユーザがいないため、PKCE / 同意 / `id_token` / **リフレッシュトークン** はありません。クライアントはアクセストークンが期限切れになったら grant を再実行します。
:::

## 実装

grant を明示的に有効化。ライブラリは有効な集合に無い grant では発行を拒否します。

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

登録クライアント側でも `GrantTypes` に明示します。

```go
op.WithStaticClients(op.ConfidentialClient{
  ID:         "service-a",
  Secret:     "rotate-me",
  AuthMethod: op.AuthClientSecretBasic, // private_key_jwt の場合は op.PrivateKeyJWTClient を使う
  GrantTypes: []string{"client_credentials"},
  Scopes:     []string{"read:things", "write:things"},
})
```

::: details グローバル許可とクライアント別許可の両方が必要な理由
- **グローバル** (`op.WithGrants`) は OP として受け付ける grant の集合を定義し、discovery の `grant_types_supported` に出ます。
- **クライアント別** (`store.Client.GrantTypes`) はそのうち **個々のクライアント** が実際に使える grant を絞り込みます。

両方の判定を通ったときだけ発行が成功します。この二段構えにより、たとえばユーザ向けアプリには `authorization_code` を、バックエンドサービスには `client_credentials` を、同じ OP から発行しつつ、SPA クライアントにバックエンド用トークンを取らせない構成が自然に書けます。
:::

## トークンの形

`client_credentials` アクセストークンは次を持ちます:

- `iss` — OP issuer
- `aud` — resource server 識別子（型付きクライアント定義の `Resources []string` フィールドで RFC 8707 のリソース識別子を許可する。DCR の場合は同等の `resources` メタデータ）
- `client_id` — 要求元クライアント
- `sub = client_id` — RFC 9068 §2.2 は `sub` がクライアントアプリケーションに対応することを SHOULD としています。本ライブラリはクライアント自身を subject にします
- `scope` — 要求 scope のうち付与された部分集合

`op.WithFeature(feature.MTLS)` または DPoP が設定され、クライアントが送信者制約を提示した場合、トークンには加えて RFC 7800 の `cnf` (Confirmation) claim が入り、鍵または証明書に結び付けられます。

::: details なぜ `sub = client_id` なのか
ユーザを伴うフローでは `sub` はエンドユーザの安定識別子です。`client_credentials` にはエンドユーザがいないため、RFC 9068 §2.2 は `sub` がクライアントアプリケーションに対応することを SHOULD としています。`sub` と `client_id` を同じ値にすることまでは要求していません。本ライブラリはこの直接的な対応付けを選び、`sub = client_id` とします。`sub` を見て「誰がやったか」を記録する RS は依然として安定識別子を得られますが、サービストークンの場合の識別子は人ではなく登録済みサービスを指す、という前提を持つ必要があります。よくあるバグは「`sub` は必ず user テーブルの行を指す」と思い込むことです。サービストークンでは *client* テーブルの行を指します。
:::

::: details `client_credentials` の `aud` — 意味と設定方法
**`aud`** はリソースサーバの識別子です — `client_id` でも、OP の issuer でもありません。「このトークンは私が消費するために発行された」を RS に伝える値です。本ライブラリでは次から `aud` が決まります。

- クライアント登録時の `Resources []string`（クライアントが要求してよい RFC 8707 リソース識別子の許可リスト）。または
- ランタイムの `resource=...` リクエストパラメータ（RFC 8707）— 許可リストの範囲内であること。

`Resources` が未設定でランタイムの `resource` パラメータも無い場合、OP は配備側で定めた既定にフォールバックします。RS は自分の識別子と一致しない `aud` を持つトークンを拒否するべきです — RS から盗まれたトークンを別の RS に再生される攻撃に対する audience-restriction 防御です。
:::

::: details Bearer と送信者制約の違い
既定では、`client_credentials` アクセストークンは **Bearer** トークン（RFC 6750）です — 「持っている者が使える」。漏洩した Bearer トークンは、有効期限まで攻撃者にも機能します。

**送信者制約付き** アクセストークン（RFC 8705 mTLS、または RFC 9449 DPoP）は、`cnf` claim でトークンを正規クライアントが保持する鍵に結び付けます。RS は API 呼び出しごとに、呼び出し元がその鍵を保有していることを証明させます。漏洩しても、対応する秘密鍵が無いと使えません — そして秘密鍵はクライアントの外に出ません。

規制対応のサービス間通信（FAPI 2.0、PSD2、OBL）では送信者制約が標準的な既定値です。mesh 層で mTLS が強制されている内部サービス間通信では、素の Bearer でも実用上問題ない場合があります。
:::

## 動作確認

[`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) は `client_secret_basic` クライアントでの一連の実行例です。

```sh
(cd examples/05-client-credentials && GOWORK=off go run -tags example .)
```

## 次に読むもの

- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — サービストークンをクライアント保有鍵に結び付け、盗難トークンを無効化する。
- [使い方: 本番の client_credentials](/ja/use-cases/client-credentials)。
