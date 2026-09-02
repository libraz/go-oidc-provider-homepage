---
title: scope と claim
description: scope と claim、OIDC 標準の対応表、カスタム scope 登録を整理 — wire parsing と resource indicator も扱う。
pageClass: pg-concepts-scopes-and-claims
---

# scope と claim

**scope** と **claim** は OIDC を学び始めた人が最も混同する 2 語です。同じものではありません。

- **scope** はクライアントが authorize 要求で **要求する** もの。OP が `scopes_supported` で公開している小さな識別子集合の中の 1 つです。
- **claim** は OP が **返す** key-value のペア — ID トークンの中、アクセストークンの中、`/userinfo` 応答の中など。

scope は要求、claim は応答。scope を grant するから、対応する claim が開示されます。

::: tip 30 秒で頭に入れる相関図
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

`/auth` の `scope` パラメータは、半角スペース区切りの不透明な識別子のリストです。ユーザはその集合に同意し、OP は grant された集合を、結果として返す認可コード、アクセストークン、リフレッシュトークン、ID トークンに記録します。OP を `/oidc` に mount した場合の既定 endpoint は `/oidc/auth` です。

```
GET /auth?response_type=code&client_id=...&scope=openid%20profile%20email&...
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
- **ユーザ claim** — `name`、`family_name`、`email`、`email_verified`、`phone_number`、`address`、`picture` など。これらはエンドユーザに関するものです。OP は scope grant が許可した場合にのみ開示します。

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
| `offline_access` | （claim なし — リフレッシュトークン発行のためのユーザ向け同意画面と、適用されるリフレッシュトークンの TTL バケットを制御） |

`scope=openid email` の要求は、ユーザ claim カタログから `sub`、`email`、`email_verified` を開示します。それ以外は何も開示しません。`scope=openid profile email` なら `profile` 群が丸ごと加わります。

この対応表だけでは、開示された claim が **どこに載るか** までは分かりません。`sub` とトークン自体を説明する claim は ID トークンに載り、scope が開示するユーザ claim は `/userinfo` から返ります。

<figure class="fig">
  <div class="fig-head">要求した scope → 開示される claim → 届き先</div>
  <svg class="fig-svg" role="img" aria-labelledby="scope-claim-map-title" viewBox="0 0 960 360" xmlns="http://www.w3.org/2000/svg">
    <title id="scope-claim-map-title">各標準 scope が開示する claim 群と、その届き先を示した図。openid が開示する sub は ID トークンに載り、profile・email・address・phone の claim は userinfo エンドポイントから返ります。offline_access は claim を開示しません。</title>
    <text class="fg-lbl" x="40" y="26">要求した scope</text>
    <text class="fg-lbl" x="228" y="26">開示される claim</text>
    <text class="fg-lbl" x="664" y="26">届き先</text>
    <line class="fg-rule fg-rule--strong" x1="36" y1="36" x2="924" y2="36"/>
    <!-- openid -->
    <rect class="fg-box fg-box--accent" x="36" y="52" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="71">openid</text>
    <text class="fg-m" x="232" y="71">sub</text>
    <line class="fg-rule" x1="36" y1="96" x2="620" y2="96"/>
    <!-- profile -->
    <rect class="fg-box" x="36" y="106" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="125">profile</text>
    <text class="fg-m" x="232" y="125">name · family_name · given_name · …（14 claim）</text>
    <line class="fg-rule" x1="36" y1="150" x2="620" y2="150"/>
    <!-- email -->
    <rect class="fg-box" x="36" y="160" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="179">email</text>
    <text class="fg-m" x="232" y="179">email · email_verified</text>
    <line class="fg-rule" x1="36" y1="204" x2="620" y2="204"/>
    <!-- address -->
    <rect class="fg-box" x="36" y="214" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="233">address</text>
    <text class="fg-m" x="232" y="233">address</text>
    <line class="fg-rule" x1="36" y1="258" x2="620" y2="258"/>
    <!-- phone -->
    <rect class="fg-box" x="36" y="268" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="287">phone</text>
    <text class="fg-m" x="232" y="287">phone_number · phone_number_verified</text>
    <line class="fg-rule" x1="36" y1="312" x2="924" y2="312"/>
    <!-- offline_access -->
    <rect class="fg-box fg-box--muted" x="36" y="322" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="341">offline_access</text>
    <text class="fg-xs" x="232" y="341">claim は開示しない — 同意画面とリフレッシュトークンの TTL バケットを決める</text>
    <!-- ID トークン -->
    <rect class="fg-box fg-box--accent" x="660" y="44" width="264" height="98" rx="8"/>
    <text class="fg-t fg-accent" x="678" y="68">ID トークン</text>
    <text class="fg-mxs" x="678" y="88">iss · aud · exp · iat · sub</text>
    <text class="fg-mxs" x="678" y="102">nonce · auth_time · azp</text>
    <text class="fg-mxs" x="678" y="116">acr · amr · at_hash · sid</text>
    <text class="fg-xs" x="678" y="134">OP 自身が埋める</text>
    <path class="fg-edge fg-edge--accent" d="M624,68 H656" marker-end="url(#fg-ac)"/>
    <!-- userinfo -->
    <rect class="fg-box" x="660" y="158" width="264" height="130" rx="8"/>
    <text class="fg-m" x="678" y="182">/userinfo</text>
    <text class="fg-xs" x="678" y="202">RP がアクセストークンを付けて</text>
    <text class="fg-xs" x="678" y="216">呼び出すと JSON が返る</text>
    <line class="fg-rule" x1="678" y1="232" x2="906" y2="232"/>
    <text class="fg-xs" x="678" y="252">許可された scope が認めた</text>
    <text class="fg-xs" x="678" y="266">claim だけが載る</text>
    <path class="fg-leader" d="M628,120 H640 V240 H628"/>
    <path class="fg-edge" d="M640,196 H656" marker-end="url(#fg-a)"/>
  </svg>
  <figcaption class="fig-note">scope は要求であって保証ではありません。OP が許可するのは、クライアントが登録した範囲・ユーザが同意した範囲・claim ソースが実際に返せる値の重なりです。この表に載っている claim でも応答に含まれないことがあります。</figcaption>
</figure>

ユーザ claim を ID トークンに載せたい RP は、OIDC Core §5.5 の `claims` パラメータで明示的に要求する必要があります。scope を許可しただけでは `/userinfo` 側に載ります。

::: details `offline_access` は claim を開示しない
`offline_access` は OIDC 標準 scope で、「ユーザが不在のときも動き続けたい」というクライアントの意思表明 — つまりリフレッシュトークン発行に対するユーザ向けの consent prompt です。ユーザ claim は何も開示しません。本ライブラリでは、結果として発行されるリフレッシュトークンを別の TTL バケット（`op.WithRefreshTokenOfflineTTL`）にルーティングするので、ログイン状態維持の chain は通常の短セッションのリフレッシュより長く保てます。詳細は[リフレッシュトークン](/ja/concepts/refresh-tokens)。
:::

## カスタム scope

本ライブラリは `op.WithScope` で scope を追加登録できます。各カスタム scope は `op.Scope` 構造体で、通信路上の識別子・consent prompt の表示テキスト・開示する claim のリスト・（任意で）どのクライアントが要求できるかを記述します。

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

OIDC 標準 scope は組み込みのデフォルトで自動認識されます。標準名（例: `email`）に対して `WithScope` を呼ぶと組み込みエントリが上書きされます — 翻訳や追加の claim mapping を付与する目的で使うのが典型です — が、`Public: false` で標準 scope を登録すると `op.New` が失敗します。discovery 文書が「標準 scope を欠落」と公告するのを防ぐためです。

`op.Scope.Parse` は組み込み側の文字列処理用ヘルパで、Unicode whitespace の連続で分割します。一方、通信路上の scope parsing は RFC 6749 の ASCII space grammar を使うため、`/auth` / `/par` 入力に tab や改行を混ぜることを互換性前提にしないでください。

i18n ラベル、claim mapping、consent prompt のレンダリングを含む詳細は[使い方: scope](/ja/use-cases/scopes)を参照してください。

## scope と RFC 8707 resource indicator

よくあるモデリングの問い: 権限を分けるとき、新しい scope を切るのか、新しい audience を切るのか？

| 問い | 答え | 例 |
|---|---|---|
| 「同じ RS が解釈する **異なる種類** の権限ですか？」 | scope を使う。 | 同じ projects API に対する `read:projects` と `write:projects`。 |
| 「**別の resource server** で、独自の audience が必要ですか？」 | RFC 8707 を使う。 | projects API 用のアクセストークンと billing API 用のアクセストークン。各 RS の verifier が cross-audience なトークンを拒否できるよう、`aud` を別にしたい。 |
| 「audience ごとに lifetime / 形式 / revocation ポリシーが違いますか？」 | per-audience format で RFC 8707 を使う。 | 管理 API は opaque（即時失効）にしつつ、read API は JWT（水平スケール）を維持。本ライブラリは `op.WithAccessTokenFormatPerAudience` で実現します。 |

scope は **権限の幅** を、resource indicator は **対象 audience** を表現します。1 つの authorize 要求に両方を載せることもできます — `scope=openid read:projects&resource=https://billing.example.com&resource=https://projects.example.com` は OP に「resource ごとに 1 つずつ、grant された scope 集合を持つアクセストークンを 2 つ発行せよ」と要求します。

`resource` パラメータを受け付けるすべてのエンドポイントは、まず同じ正規形に落としてから比較します。

| ルール | 効果 |
|---|---|
| 絶対 URI が必須 | scheme と host を欠く値は拒否します。 |
| scheme と host を小文字化 | `HTTPS://API.example.com` と `https://api.example.com` は同じ resource になります。 |
| デフォルトポートを除去 | HTTP の `:80` と HTTPS の `:443` は落とし、それ以外のポートは維持します。 |
| 末尾の `/` を 1 個除去 | `https://api.example.com/` は `https://api.example.com` になります。 |
| query は維持 | query 文字列も resource の同一性の一部です。 |
| fragment と userinfo は拒否 | `invalid_target` でリクエストを失敗させます。 |

許可リストとの比較や `WithAccessTokenFormatPerAudience` も同じ正規化を通ります。そのため、authorize、PAR、token、device authorization、CIBA、token exchange の間で同じ resource の比較結果が変わることはありません。

OIDC §5.5 の `claims` パラメータ（scope 単位ではなく特定の claim を細かく要求する）は[使い方: claims request](/ja/use-cases/claims-request)に、per-audience format のトレードオフは[アクセストークン形式](/ja/concepts/access-token-format)にあります。

## 次に読む

- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — 各アーティファクトに何が入るか、scope がどう形を決めるか。
- [使い方: scope](/ja/use-cases/scopes) — i18n ラベル、claim mapping、allowed-clients、consent prompt の公開面。
- [使い方: claims request](/ja/use-cases/claims-request) — 細かい claim 選択のための OIDC §5.5 `claims` パラメータ。
