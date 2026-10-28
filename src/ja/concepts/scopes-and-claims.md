---
title: scope と claim
description: scope と claim、OIDC 標準の対応表、カスタム scope 登録を整理 — wire parsing と resource indicator も扱う。
pageClass: pg-concepts-scopes-and-claims
---

# scope と claim

**scope** と **claim** は OIDC を学び始めた人が最も混同する 2 語です。同じものではありません。

- **scope** はクライアントが authorize 要求で **要求する** もの。OP が `scopes_supported` で公開している小さな識別子集合の中の 1 つです。
- **claim** は OP が **返す** key-value のペアです。構造化された応答、たとえば ID トークン、JWT アクセストークン、`/userinfo` 応答の中に入ります。

scope は要求、claim は応答です。scope を grant すると、claim ソースが値を返せる範囲で、対応する claim を OP が開示できるようになります。

::: tip 30 秒でつかむ要点
- scope = 「あなたの email が見たい」 — `scope=openid email`
- claim = `"email": "alice@example.com"` — 返ってきた値。
- 1 つの scope が複数の claim を開示することがあります。下表の OIDC 標準対応がそのマッピングです。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §3.3（scope）、§5.2（`invalid_scope`）
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — Authorization Server Metadata（`scopes_supported`）
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.1（標準 claim）、§5.4（scope-to-claim 対応）、§5.5（claims request）
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — §3（`scopes_supported`、`claims_supported`）
:::

## scope: クライアントが要求するもの

`/auth` の `scope` パラメータは、半角スペース区切りの不透明な識別子のリストです。ユーザはその集合に同意し、OP は grant された集合を認可コードに記録し、アクセストークンとリフレッシュトークンの状態へ引き継ぎます。ID トークンには標準の `scope` claim は入りません。OP は既定で `/oidc` 配下にマウントされるため、認可エンドポイントは `/oidc/auth` になります。

```
GET /auth?response_type=code&client_id=...&scope=openid%20profile%20email&...
```

初学者が見落としがちな点をいくつか:

- **scope 識別子は OAuth 2.0 にとって不透明**。`openid` に特別な意味を与えるのは OIDC Core §3.1.2.1 です。それ以外の scope 名は OP とクライアントの合意や拡張仕様で定まります。
- **scope は case-sensitive**。`openid` は scope ですが、`OpenID` は別物（かつ未認識の）scope です。
- **`openid` が OAuth を OIDC に変える魔法**。`openid` が要求になければ ID トークンは発行されません。本ライブラリの既定は OIDC（`openid` scope 必須）で、`op.WithOpenIDScopeOptional()` で純 OAuth 2.0 に切り替えられます。
- **ユーザは一部の scope を辞退できる**。grant された集合は要求された集合の部分集合になり得ます。OP は実際に grant された scope を token 応答とアクセストークンの状態に反映します。
- **クライアントは登録された scope しか要求できない**。クライアントの登録 `Scopes` に無い scope や、`AllowedClients` がそのクライアントを除外している scope は、`invalid_scope`（RFC 6749 §5.2）で拒否されます。

## claim: トークンや userinfo 応答の中の key-value

**claim** は JSON object 内の 1 フィールドです。トークンでは OP が署名し、`/userinfo` では既定で JSON として返ります。要求に応じて署名付きまたは暗号化された JWT になることもあります。OIDC Core §5.1 が長いカタログを提供しています。トークンの metadata claim とユーザ claim は分けて考える必要があります。

- **ID トークンの claim** — `iss`、`sub`、`aud`、`iat`、`exp` は常に入ります。`nonce`、`auth_time`、`acr`、`amr`、`at_hash`、`c_hash` は、フローや要求に応じて入ります。
- **JWT アクセストークンの claim** — RFC 9068 で `iss`、`sub`、`aud`、`client_id`、`iat`、`exp`、`jti` が必須です。`scope`、`cnf`、`auth_time`、`acr`、`amr`、`authorization_details` は条件に応じて入ります。OP 専用の private claim が 2 つあり、リソースサーバは無視してください。`gid`（失効に使う grant ID）と、`/userinfo` が読み戻す claims request の `userinfo` メンバである `userinfo_claims` です。opaque アクセストークン、リフレッシュトークン、認可コードは通信路上に claim を持ちません。
- **ユーザ claim** — `name`、`family_name`、`email`、`email_verified`、`phone_number`、`address`、`picture` など。エンドユーザを説明する値です。grant された scope または明示的な claims request が許可し、claim ソースが値を返せる場合にだけ OP が開示します。

ユーザ claim は scope が制御し、トークンの metadata claim はトークンの種類とフローによって決まります。

## OIDC Core の scope-to-claim 対応

OIDC Core §5.4 は `profile`、`email`、`address`、`phone` に対応するユーザ claim を定めています。表には §3.1.2.1 の OIDC リクエストを示す `openid` と、§11 のリフレッシュトークン用同意を扱う `offline_access` も載せています。この 2 つは §5.4 のユーザ claim 群ではありません。

| Scope | Release される claim |
|---|---|
| `openid` | `sub` |
| `profile` | `name`、`family_name`、`given_name`、`middle_name`、`nickname`、`preferred_username`、`profile`、`picture`、`website`、`gender`、`birthdate`、`zoneinfo`、`locale`、`updated_at` |
| `email` | `email`、`email_verified` |
| `address` | `address` |
| `phone` | `phone_number`、`phone_number_verified` |
| `offline_access` | （claim なし — リフレッシュトークン発行のためのユーザ向け同意画面と、適用されるリフレッシュトークンの TTL バケットを制御） |

`scope=openid email` の要求は、ユーザ claim カタログから `sub`、`email`、`email_verified` を開示します。それ以外は何も開示しません。`scope=openid profile email` なら `profile` 群が丸ごと加わります。

この対応表だけでは、開示された claim が **どこに載るか** までは分かりません。通常の scope フローでは、`sub` と ID トークンの metadata claim は ID トークンに載り、`profile`・`email`・`address`・`phone` が開示するユーザ claim は `/userinfo` から返ります。アクセストークンには grant された `scope` が入り、ID トークンには標準の `scope` claim は入りません。

<figure class="fig">
  <div class="fig-head">scope が claim を開示し、ID トークンと userinfo が運ぶ</div>
  <svg class="fig-svg" role="img" aria-labelledby="scope-claim-map-title" viewBox="0 0 960 376" xmlns="http://www.w3.org/2000/svg">
    <title id="scope-claim-map-title">各標準 scope が開示する claim 群と、その届き先を示した図。openid が開示する sub は ID トークンに載り、profile・email・address・phone の claim は userinfo エンドポイントから返ります。offline_access は claim を開示しません。</title>
    <text class="fg-lbl" x="32" y="44">要求した scope</text>
    <text class="fg-lbl" x="224" y="44">開示される claim</text>
    <text class="fg-lbl" x="616" y="44">届き先</text>
    <path class="fg-rule fg-rule--strong" d="M32,56 H928"/>
    <!-- openid -->
    <text class="fg-m fg-accent" x="32" y="93">openid</text>
    <text class="fg-m" x="224" y="93">sub</text>
    <path class="fg-rule" d="M32,112 H576"/>
    <!-- profile -->
    <text class="fg-m" x="32" y="141">profile</text>
    <text class="fg-m" x="224" y="141">name · family_name · …（14 claim）</text>
    <path class="fg-rule" d="M32,160 H576"/>
    <!-- email -->
    <text class="fg-m" x="32" y="189">email</text>
    <text class="fg-m" x="224" y="189">email · email_verified</text>
    <path class="fg-rule" d="M32,208 H576"/>
    <!-- address -->
    <text class="fg-m" x="32" y="237">address</text>
    <text class="fg-m" x="224" y="237">address</text>
    <path class="fg-rule" d="M32,256 H576"/>
    <!-- phone -->
    <text class="fg-m" x="32" y="285">phone</text>
    <text class="fg-m" x="224" y="285">phone_number · phone_number_verified</text>
    <path class="fg-rule" d="M32,304 H576"/>
    <!-- offline_access -->
    <text class="fg-m fg-dim" x="32" y="333">offline_access</text>
    <text class="fg-xs" x="224" y="333">claim なし · 同意と refresh TTL を決める</text>
    <path class="fg-rule" d="M32,352 H576"/>
    <!-- ID token -->
    <path class="fg-edge fg-edge--accent" d="M576,88 H616" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="616" y="64" width="312" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="632" y="92">ID トークン</text>
    <text class="fg-mxs" x="632" y="116">iss · aud · exp · iat · sub</text>
    <text class="fg-xs" x="632" y="140">OP 自身が埋める</text>
    <!-- userinfo -->
    <path class="fg-leader" d="M576,136 H592 V280 H576"/>
    <path class="fg-edge fg-edge--thin" d="M592,240 H616" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="616" y="192" width="312" height="96" rx="8"/>
    <text class="fg-m" x="632" y="220">/userinfo</text>
    <text class="fg-xs" x="632" y="244">RP がアクセストークン付きで呼ぶ</text>
    <text class="fg-xs" x="632" y="268">許可された scope の claim だけ返す</text>
  </svg>
  <figcaption class="fig-note">scope は要求であって保証ではありません。OP が許可するのは、クライアントが登録した範囲・ユーザが同意した範囲・claim ソースが実際に返せる値の重なりです。この表に載っている claim でも応答に含まれないことがあります。</figcaption>
</figure>

ユーザ claim を ID トークンに載せたい RP は、OIDC Core §5.5 の `claims` パラメータで明示的に要求する必要があります。scope を許可しただけでは `/userinfo` 側に載ります。

`/userinfo` が開示するのは、提示されたアクセストークンに許可された scope の claim と、そのトークンを発行した認可で claims request の `userinfo` メンバが求めた claim です。claims request はアクセストークンごとに持たれる（JWT なら `userinfo_claims`、opaque なら保存された行）ため、同じユーザとクライアントによる後の認可があっても、先に発行されたトークンが読める範囲は変わりません。

::: details `offline_access` は claim を開示しない
`offline_access` は OIDC 標準 scope で、「ユーザが不在のときも動き続けたい」というクライアントの意思表明 — つまりリフレッシュトークン発行に対するユーザ向けの consent prompt です。ユーザ claim は何も開示しません。本ライブラリでは、結果として発行されるリフレッシュトークンを別の TTL バケット（`op.WithRefreshTokenOfflineTTL`）にルーティングするので、ログイン状態維持の chain は通常の短セッションのリフレッシュより長く保てます。詳細は[リフレッシュトークン](/ja/concepts/refresh-tokens)。
:::

## カスタム scope

組み込み側は `op.WithScope` で scope を追加登録できます。各 scope は `op.Scope` 構造体で、通信路上の識別子（`Name`）、同意画面に出すテキスト（`Description`。ユーザが拒否できない scope なら `Required`）、`/userinfo` から開示する claim 名（`Claims`）、discovery に公開するか（`Public`）、そして任意でどのクライアントが要求できるか（`AllowedClients`）を記述します。

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

- `op.PublicScope(name, label)` — discovery 文書の `scopes_supported` に公開する scope を登録します。審査済みのクライアントなら誰でも要求できる scope に使います。
- `op.InternalScope(name)` — `scopes_supported` から **省略** する scope を登録します（RFC 8414 §2 / OIDC Discovery §3 が省略を明示的に許容）。受理判定は scope の `AllowedClients` リストで制御されます。discoverable にしたくないが特定クライアントには許す scope に使います。

OIDC 標準 scope は組み込みの既定で自動認識されます。標準名（例: `email`）に対して `WithScope` を呼ぶと組み込みエントリが上書きされます — 翻訳や追加の claim mapping を付与する目的で使うのが典型です — が、`Public: false` で標準 scope を登録すると `op.New` が失敗します。discovery 文書が「標準 scope を欠落」と公告するのを防ぐためです。

`op.ParseScopeSet(raw)` は組み込み側の文字列処理用ヘルパで、Unicode の空白文字の連続で分割します。通信路上の scope パースは RFC 6749 の ASCII スペース文法でより厳格なため、`/auth` や `/par` の入力で tab や改行に頼らないでください。

公開 / 内部の違い、claim mapping、同意プロンプトに scope がどう表示されるかを含む詳細は[ユースケース: scope](/ja/use-cases/scopes)を参照してください。

## scope と RFC 8707 resource indicator

よくあるモデリングの問い: 権限を分けるとき、新しい scope を切るのか、新しい audience を切るのか？

| 問い | 答え | 例 |
|---|---|---|
| 「同じ RS が解釈する **異なる種類** の権限ですか？」 | scope を使う。 | 同じ projects API に対する `read:projects` と `write:projects`。 |
| 「**別の resource server** で、独自の audience が必要ですか？」 | RFC 8707 を使う。 | projects API 用のアクセストークンと billing API 用のアクセストークン。各 RS の verifier が cross-audience なトークンを拒否できるよう、`aud` を別にしたい。 |
| 「audience ごとに lifetime / 形式 / revocation ポリシーが違いますか？」 | per-audience format で RFC 8707 を使う。 | 管理 API は opaque（即時失効）にしつつ、read API は JWT（水平スケール）を維持。本ライブラリは `op.WithAccessTokenFormatPerAudience` で実現します。 |

scope は **権限の幅** を、resource indicator は **対象 audience** を表現します。1 つの認可リクエストに両方を載せることもできます。例えば `scope=openid read:projects&resource=https://projects.example.com` と指定すると、本ライブラリは指定した resource 向けにアクセストークンを 1 つ発行します。組み込みの認可フローで `resource` を繰り返すと `invalid_target` で拒否されるため、別のリソースサーバには別のリクエストを使います。

`resource` パラメータを受け付けるすべてのエンドポイントは、まず同じ正規形に落としてから比較します。

| ルール | 効果 |
|---|---|
| 絶対 URI が必須 | scheme と host を欠く値は拒否します。 |
| scheme と host を小文字化 | `HTTPS://API.example.com` と `https://api.example.com` は同じ resource になります。 |
| 既定ポートを除去 | HTTP の `:80` と HTTPS の `:443` は落とし、それ以外のポートは維持します。 |
| 末尾の `/` を除去 | `https://api.example.com/` は `https://api.example.com` になります。 |
| query は維持 | query 文字列も resource の同一性の一部です。 |
| fragment と userinfo は拒否 | `invalid_target` でリクエストを失敗させます。 |

許可リストとの比較や `WithAccessTokenFormatPerAudience` も同じ正規化を通ります。そのため、authorize、PAR、token、device authorization、CIBA、token exchange の間で同じ resource の比較結果が変わることはありません。

OIDC §5.5 の `claims` パラメータ（scope 単位ではなく特定の claim を細かく要求する）は[ユースケース: claims request](/ja/use-cases/claims-request)に、per-audience format のトレードオフは[アクセストークン形式](/ja/concepts/access-token-format)にあります。

## 次に読む

- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — 各アーティファクトに何が入るか、scope がどう形を決めるか。
- [ユースケース: scope](/ja/use-cases/scopes) — 公開 / 内部の違い、claim mapping、allowed-clients、同意プロンプトの表示内容。
- [ユースケース: claims request](/ja/use-cases/claims-request) — 細かい claim 選択のための OIDC §5.5 `claims` パラメータ。
