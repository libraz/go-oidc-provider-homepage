---
title: OAuth 2.0 / OIDC 入門
description: OAuth 2.0 の役割分担と OpenID Connect が追加するものを、ゼロから一通り。はじめての方向け。
pageClass: pg-concepts-oauth2-oidc-primer
---

# OAuth 2.0 / OpenID Connect 入門

認証・認可に初めて触れる方には、関連する規格が略語の羅列に見えるかもしれません。OAuth、OIDC、JWT、OP、RP、RS、PAR、JAR、JARM、DPoP、mTLS、PKCE、FAPI…。ただ、押さえるべき **役割は 3 つだけ** で、ほとんどの規格はこの 3 者の間の同じ処理を少しずつ強化したものです。

::: details 略号の早見表（まずここを開いてください）
**3 つの役割**
- **OP**(OpenID Provider) — ユーザを認証してトークンを発行するサーバ。`go-oidc-provider` はここに該当します。純粋 OAuth 文脈では **AS**(Authorization Server)とも呼ばれます。
- **RP**(Relying Party) — OP を使ってユーザをログインさせるクライアントアプリ。OAuth の文脈では **client** とも呼ばれます。
- **RS**(Resource Server) — アクセストークンを受け取ってデータを返す API。

**トークンと暗号**
- **JWT**(JSON Web Token、RFC 7519) — `header.payload.signature` を `.` でつないだ base64url 文字列。中身を読め、署名も検証できます。
- **JWS**(JSON Web Signature、RFC 7515) — JWT が使う署名方式。
- **JWE**(JSON Web Encryption、RFC 7516) — 暗号化版。外側の入れ物が内側の JWS を包みます。
- **JWK** / **JWKS**(RFC 7517) — JSON Web Key / Key **Set**。OP の公開鍵集合で `/jwks` から取得します。詳しくは [JOSE 基礎](/ja/concepts/jose-basics) を参照してください。
- **PKCE**(RFC 7636) — 認可コードに対する所持証明。認可コードを横取りされてもトークンに交換されないようにします。発音は「ピクシー」。

**プロファイル / 強化の略号**
- **PAR**(RFC 9126) — Pushed Authorization Request。RP がまず authorize 要求を OP に POST し、ブラウザは `request_uri` 参照だけを運びます。
- **JAR**(RFC 9101) — JWT-Secured Authorization Request。authorize 要求自体を署名 JWT にします。
- **JARM**(OpenID FAPI) — JWT-Secured Authorization Response Mode。authorize **応答** を署名 JWT にします。
- **DPoP**(RFC 9449) — Demonstrating Proof of Possession。クライアントが保持する鍵にトークンをリクエストごとに結びつけます。
- **mTLS**(RFC 8705) — mutual TLS。考え方は DPoP と同じで、結びつける先がクライアントの TLS 証明書になります。
- **FAPI**(Financial-grade API) — 上記をまとめて固定する OpenID プロファイル。
- **CIBA** — Client-Initiated Backchannel Authentication。ブラウザを持たないデバイスから、ユーザのスマートフォンなどへ認証要求を送るバックチャネル認証。

**早めに出てくる identity claim**
- **`sub`** — Subject。当該 OP におけるユーザの不透明な識別子。
- **`aud`** — Audience。トークンの宛先。
- **`iss`** — Issuer。トークンに署名した OP。
- **`scope`** — 半角スペース区切りの権限リスト（`openid profile email` など）。
- **`acr`**(Authentication Context Class Reference) — 認証手段が提供した保証水準。step-up で使われます。
- **`amr`**(Authentication Methods References) — 実際に使った認証要素を表す RFC 8176 の値（`pwd`、`otp`、`mfa`、`hwk`、`face`、`fpt`）。
- **`cnf`** — confirmation。トークンが結びついている鍵（DPoP の `jkt` thumbprint または mTLS の `x5t#S256`）。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — Bearer Token Usage
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token (JWT)
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — Token Introspection
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html)
:::

## 3 つの役割

<figure class="fig">
  <div class="fig-head">ログインは委譲し、API はトークンを確認するだけ</div>
  <svg class="fig-svg" role="img" aria-labelledby="primer-roles-title" viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg">
    <title id="primer-roles-title">OAuth と OIDC の 3 つの役割を示した図。RP は OP にログインを委譲してトークンを受け取り、Bearer アクセストークンで RS を呼び出します。RS はそのトークンを OP の鍵で検証します。</title>
    <!-- arches above the row: delegate (inner), tokens back (outer) -->
    <path class="fg-edge" d="M208,152 V104 H432 V152" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="320" y="94" text-anchor="middle">ログインを委譲</text>
    <path class="fg-edge fg-edge--accent" d="M560,152 V56 H96 V152" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="328" y="46" text-anchor="middle">id_token · access_token</text>
    <!-- Relying Party -->
    <rect class="fg-box" x="32" y="152" width="272" height="96" rx="8"/>
    <text class="fg-t" x="48" y="180">Relying Party</text>
    <text class="fg-s" x="48" y="204">あなたのアプリ · ログイン開始</text>
    <text class="fg-s" x="48" y="228">トークンを保持し API を呼ぶ</text>
    <!-- OpenID Provider -->
    <rect class="fg-box fg-box--accent" x="344" y="152" width="272" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="180">OpenID Provider</text>
    <text class="fg-mxs" x="360" y="204">go-oidc-provider</text>
    <text class="fg-s" x="360" y="228">ユーザ認証とトークン署名</text>
    <!-- Resource Server -->
    <rect class="fg-box" x="656" y="152" width="272" height="96" rx="8"/>
    <text class="fg-t" x="672" y="180">Resource Server</text>
    <text class="fg-s" x="672" y="204">あなたの API · トークン検証</text>
    <text class="fg-s" x="672" y="228">データを返す</text>
    <!-- arches below the row: signature check (inner), Bearer call (outer) -->
    <path class="fg-edge fg-edge--muted" d="M720,248 V320 H480 V248" marker-end="url(#fg-am)"/>
    <text class="fg-s" x="600" y="286" text-anchor="middle">署名を確認</text>
    <text class="fg-mxs" x="600" y="308" text-anchor="middle">/jwks · /introspect</text>
    <path class="fg-edge" d="M96,248 V376 H864 V248" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="480" y="366" text-anchor="middle">Authorization: Bearer &lt;access_token&gt;</text>
  </svg>
  <figcaption class="fig-note">RS は認証情報そのものを受け取らず、有効期限のあるトークンだけを受け取ります。委譲の要点はここにあり、API はユーザのパスワードを預かる代わりに OP の署名を信頼します。</figcaption>
</figure>

上の図は「誰が何を担当しているか」を示しています。ログインの実際のステップ（`/auth` への redirect、認可コードの交換、トークンの取得）は、後段の [認可コード + PKCE](#authorization-code-pkce) で説明します。

::: tip 1 つのプログラムが 2 つの役割を持つこともある
たとえば Backend for Frontend は、ユーザをログインさせる **RP** であると同時に、SPA からアクセストークン付きで呼ばれる API を持つ **RS** でもあります。
:::

## OAuth 2.0 と OpenID Connect の違い

OAuth 2.0 は **認可の委譲** を担う規格です。「Alice のアプリが、サービス X 上の Alice のデータを読む許可をもらう」ための仕組みで、アプリに **Alice が誰なのか** は伝えません。アクセストークンは認可を表すだけで、opaque にするか JWT などの自己完結型にするかは認可サーバが決めます。

OpenID Connect（OIDC）は **OAuth 2.0 + 認証結果** を扱う規格です。OP はアクセストークンに加えて **ID トークン**（署名付き JWT）を発行し、「このトークンはユーザ `sub=alice123` 向けに、audience `client_id=myapp` で、この時刻に発行された。Alice について次の claim は真である」と表明します。

OIDC はさらに、`/userinfo` エンドポイント、[discovery 文書](/ja/concepts/discovery)、RP-Initiated Logout、Back-Channel Logout 通知を追加します。

::: details JWT とは
**署名付き compact JWT**（JSON Web Token、RFC 7519）は、3 つの base64url エンコード部分を `.` で繋いだ文字列です（`header.payload.signature`）。header と payload は JSON で、signature は受け手が公開鍵で発行者を暗号学的に検証するための部分です。暗号化された JWT は 5 つの部分を持つ compact JWE で、署名済み JWT をその中に包むこともできます。

OIDC では **ID トークンは常に JWT** です。本ライブラリのアクセストークンも既定では JWT で、必要なら opaque 形式に切り替えられます。JSON を読めて署名を検証できれば、既定の形式は読めます。
:::

::: details Opaque と JWT の違い
- **Opaque token**: 受け手にとっては意味のないランダム文字列。何を許可するかを知るには、発行元の introspection エンドポイント（RFC 7662）に問い合わせてトークンを引いてもらいます。
- **JWT**: 中身がトークンにエンコードされていて、署名を検証するだけで（オフラインで）受け手が中身を信用できます。

判断軸は次のとおりです。opaque token は確認のたびに OP へ問い合わせが必要ですが、すぐに失効させられます。JWT は手元で検証できますが、受け手が失効も確認しない限り、期限が切れるまで有効なままです。本ライブラリがこの両者をどう折衷しているかは [tokens](/ja/concepts/tokens) を参照してください。
:::

::: details どちらを使えばいい？
- 純粋な OAuth 2.0: 「このトークンは `POST /things` を呼べる」だけが言えれば良い API。サービス間通信でよく使われます。
- OIDC: 人間がログインして、アプリが「こんにちは Alice」と言いたいケース。Web・モバイルのログインはほぼすべて OIDC です。

`go-oidc-provider` は既定で OIDC（`openid` scope 必須）として動作し、`op.WithOpenIDScopeOptional()` で純粋 OAuth 2.0 にも切り替えられます。
:::

## 出てくる 4 種類のトークン

| トークン | 寿命 | 何のためのもの | 行き先 |
|---|---|---|---|
| **認可コード** | 数十秒（既定 60 秒） | 1 回限りの不透明な文字列。 | サーバ間通信: RP → OP `/token`。 |
| **アクセストークン** | 数分（既定 5 分） | API を呼ぶときの `Authorization: Bearer …` に乗せる。JWT または opaque。 | RP → RS。 |
| **リフレッシュトークン** | 数日〜数週間（既定 30 日） | 長寿命。再認証なしに新しいアクセストークンを取得するために使う。 | RP → OP `/token`。 |
| **ID トークン** | 数分（既定 10 分） | ユーザが誰かを証明する署名付き JWT。**API には送らない**。 | OP → RP、RP 内で消費。 |

::: warning ID トークンを Bearer に乗せない
よくある落とし穴です。ID トークンの audience は RP であって RS ではありません。API に `Authorization: Bearer` で送ると通ってしまうことがありますが、誤りです。RP 向けの claim（email など）を、ユーザが触れるすべての API にさらすことになります。

**API には、アクセストークンを使ってください。** RFC 7662 の introspection、または RFC 9068 の self-contained JWT として検証します。

```http
# NG: OP が RP に発行した ID トークンを API に渡している
GET /orders HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...id_token...

# OK: API audience のアクセストークンを渡す
GET /orders HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...access_token...
```
:::

## 最もよく見かける処理: 認可コード + PKCE {#authorization-code-pkce}

<figure class="fig">
  <div class="fig-head">コードはブラウザ経由、トークンは直接受け取る</div>
  <svg class="fig-svg" role="img" aria-labelledby="primer-seq-title" viewBox="0 0 960 728" xmlns="http://www.w3.org/2000/svg">
    <title id="primer-seq-title">認可コードフローと PKCE の要点を示した図。ブラウザがユーザを RP と OP の間で運んでログインと同意を行い、RP は返ってきた認可コードをトークンエンドポイントで直接トークンに交換し、そのアクセストークンで RS を呼び出します。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="704"/>
    <line class="fg-life" x1="512" y1="88" x2="512" y2="704"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="704"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Relying Party</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">あなたのアプリ</text>
    <rect class="fg-box" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="512" y="50" text-anchor="middle">ユーザ</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">ブラウザ</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- open the app, redirect to the OP -->
    <path class="fg-edge" d="M512,144 H192" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="352" y="134" text-anchor="middle">アプリを開く</text>
    <path class="fg-edge" d="M192,216 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="182" text-anchor="middle">302 → /auth</text>
    <text class="fg-mxs" x="352" y="204" text-anchor="middle">redirect_uri · code_challenge</text>
    <path class="fg-edge" d="M512,272 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="262" text-anchor="middle">GET /auth</text>
    <!-- login and consent -->
    <path class="fg-edge" d="M824,312 h-40 v24 h40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="768" y="318" text-anchor="end">ログインと同意</text>
    <text class="fg-xs" x="768" y="340" text-anchor="end">ユーザが認証し承認する</text>
    <!-- redirect back with the code -->
    <path class="fg-edge" d="M824,412 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="378" text-anchor="middle">302 → redirect_uri</text>
    <text class="fg-mxs" x="668" y="400" text-anchor="middle">?code=xyz&amp;state=…</text>
    <path class="fg-edge" d="M512,468 H192" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="458" text-anchor="middle">GET /callback?code=xyz</text>
    <!-- back channel: skips the browser lane -->
    <path class="fg-edge" d="M192,540 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="506" text-anchor="middle">POST /token · client auth</text>
    <text class="fg-mxs fg-halo" x="508" y="528" text-anchor="middle">code · code_verifier</text>
    <path class="fg-edge fg-edge--accent" d="M824,612 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="602" text-anchor="middle">{ access_token · id_token · refresh_token }</text>
    <!-- call the API -->
    <path class="fg-edge" d="M192,652 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="658">Resource Server を呼ぶ</text>
    <text class="fg-mxs" x="248" y="680">Bearer &lt;access_token&gt;</text>
  </svg>
  <figcaption class="fig-note"><code>/token</code> より前はすべてブラウザを経由します。<code>state</code> と <code>code_challenge</code> をこれほど早い段階で送るのはそのためで、戻ってきたリダイレクトを送り出したリクエストに結び付けられるのはこの 2 つだけです。トークン要求はブラウザのレーンを飛び越える、ブラウザには見えない直接のバックチャネル通信です。</figcaption>
</figure>

PKCE の部分（`/auth` への redirect に付く `code_challenge` と、`POST /token` で送る `code_verifier`）は、悪意あるアプリが横取りした認可コードを使えないようにする仕組みです。詳しくは [認可コードフロー + PKCE](/ja/concepts/authorization-code-pkce) を参照してください。

## このサイトでよく出てくる用語

| 用語 | 意味 |
|---|---|
| **[Scope](/ja/concepts/scopes-and-claims)** | 半角スペース区切りの権限リスト（例: `openid profile email`）。ユーザがこれに同意します。 |
| **[Claim](/ja/concepts/scopes-and-claims)** | トークン内のフィールド（`sub`、`email`、`email_verified` など）。 |
| **[同意](/ja/concepts/consent)** | 「このアプリはあなたのメールアドレスを受け取りたいと言っています」とユーザに確認する画面、またはその結果。OP が記録し、同じ scope の次回ログインでは画面を省略します。 |
| **Audience（`aud`）** | トークンの宛先。ID トークンは `aud = client_id`、アクセストークンは `aud = resource server` です。 |
| **[Issuer](/ja/concepts/issuer)（`iss`）** | トークンに署名した OP。RP も RS も、自分が期待する値と一致するか確認します。 |
| **[JWKS](/ja/concepts/jose-basics)** | JSON Web Key Set。OP の公開鍵集合で、`/jwks` から取得します。RP は ID トークンの検証に使います。 |
| **[Discovery 文書](/ja/concepts/discovery)** | `/.well-known/openid-configuration`。OP のエンドポイント、scope、アルゴリズム、機能をまとめた JSON のカタログ。 |

::: details `acr` と `amr` を 1 段落で
`acr` は認証が **どれだけ強かったか**（`aal2` のような保証水準ラベル）を表し、`amr` は **どの認証要素を使ったか**（`["pwd","otp"]` のような配列）を表します。RP が機微な操作のために高い保証を必要とするときは、`acr_values` で高い `acr` を要求します。OP は step-up 認証を実行し、新しい ID トークンを発行します。RFC 8176(Authentication Method Reference Values)が標準 `amr` 値を規定し、RFC 9470(OAuth 2.0 Step Up Authentication Challenge Protocol)が `WWW-Authenticate: error="insufficient_user_authentication"` 経由の step-up を標準化しています。設定方法は [MFA / step-up](/ja/use-cases/mfa-step-up) を参照してください。
:::

## FAPI 2.0 が追加するもの

金融グレード・医療グレードの OP には、OIDC の上に **FAPI 2.0 Security Profile** の要求を重ねる必要があります。送信者制約付きトークン（DPoP / mTLS）、PAR（認可要求を先にサーバ間で送る）、より絞られた alg 許可リストです。このプロファイルは JAR（認可要求への署名）を必須にしていませんが、本ライブラリの `FAPI2Baseline` 設定では JAR も有効になります。次の 1 行で、この設定を有効化できます。

```go
op.WithProfile(profile.FAPI2Baseline)
```

略号を一通り解説した入門は [FAPI 2.0 入門](/ja/concepts/fapi) にあります。DPoP / mTLS の仕組みは [送信者制約](/ja/concepts/sender-constraint) を、全体構成は [ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を参照してください。

## 続きはこちら

- [認可コード + PKCE](/ja/concepts/authorization-code-pkce) — 上記の流れをシーケンス図とパラメータ用語集で詳説。
- [Client Credentials](/ja/concepts/client-credentials) — サービス間通信、エンドユーザなし。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — ローテーション、再利用検知、猶予期間。
- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — 似て非なる 3 つのトークン。
- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — FAPI 2.0 が実際に追加する仕組み。
- [FAPI 2.0 入門](/ja/concepts/fapi) — FAPI プロファイルとは何か、PAR / JAR / JARM などの各略号が何をしているか、なぜプロファイルが「OIDC + ベストプラクティス」より勝るのか。
