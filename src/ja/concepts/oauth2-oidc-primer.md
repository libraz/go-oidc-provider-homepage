---
title: OAuth 2.0 / OIDC 入門
description: OAuth 2.0 の役割分担と OpenID Connect が追加するものを、ゼロから一通り。はじめての方向け。
pageClass: pg-concepts-oauth2-oidc-primer
---

# OAuth 2.0 / OpenID Connect 入門

認証・認可に初めて触れる方には、関連する規格が略語の羅列に見えるかもしれません: OAuth、OIDC、JWT、OP、RP、RS、PAR、JAR、JARM、DPoP、mTLS、PKCE、FAPI…。ただ、まず押さえるべき **役割は 3 つだけ** です。ほとんどの規格は、この 3 つの役割の間で行われる処理を少しずつ強化したものです。

::: details 略号の早見表（まずここを開いてください）
**3 つの役割**
- **OP**(OpenID Provider) — ユーザを認証してトークンを発行するサーバ。`go-oidc-provider` はここに該当します。純粋 OAuth 文脈では **AS**(Authorization Server)とも呼ばれます。
- **RP**(Relying Party) — OP を使ってユーザをログインさせるクライアントアプリ。OAuth の文脈では **client** とも呼ばれます。
- **RS**(Resource Server) — アクセストークンを受け取ってデータを返す API。

**トークンと暗号**
- **JWT**(JSON Web Token、RFC 7519) — `header.payload.signature` を `.` でつないだ base64url 文字列。中身を読め、署名も検証できます。
- **JWS**(JSON Web Signature、RFC 7515) — JWT が使う署名方式。
- **JWE**(JSON Web Encryption、RFC 7516) — 暗号化版。外側の入れ物が内側の JWS を包みます。
- **JWK** / **JWKS**(RFC 7517) — JSON Web Key / Key **Set**。OP の公開鍵集合で `/jwks` から取得します。
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
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

## 3 つの役割

<figure class="fig">
  <div class="fig-head">3 つの役割</div>
  <svg class="fig-svg" role="img" aria-labelledby="primer-roles-title" viewBox="0 48 960 180" xmlns="http://www.w3.org/2000/svg">
    <title id="primer-roles-title">OAuth と OIDC の 3 つの役割を示した図。RP は OP にログインを委任してトークンを受け取り、Bearer アクセストークンで RS を呼び出します。RS はそのトークンを OP の鍵で検証します。</title>
    <!-- Relying Party -->
    <rect class="fg-box" x="56" y="64" width="176" height="104" rx="8"/>
    <text class="fg-lbl" x="70" y="83">RP</text>
    <text class="fg-t" x="144" y="105" text-anchor="middle">Relying Party</text>
    <text class="fg-mxs" x="144" y="119" text-anchor="middle">あなたのアプリ</text>
    <line class="fg-rule" x1="70" y1="129" x2="218" y2="129"/>
    <text class="fg-xs" x="144" y="145" text-anchor="middle">ログインを開始する</text>
    <text class="fg-xs" x="144" y="158" text-anchor="middle">トークンを保持し API を呼ぶ</text>
    <!-- OpenID Provider -->
    <rect class="fg-box fg-box--accent" x="392" y="64" width="176" height="104" rx="8"/>
    <text class="fg-lbl fg-accent" x="406" y="83">OP</text>
    <text class="fg-t fg-accent" x="480" y="105" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="480" y="119" text-anchor="middle">go-oidc-provider</text>
    <line class="fg-rule" x1="406" y1="129" x2="554" y2="129"/>
    <text class="fg-xs" x="480" y="145" text-anchor="middle">ユーザを認証する</text>
    <text class="fg-xs" x="480" y="158" text-anchor="middle">トークンを発行し署名する</text>
    <!-- Resource Server -->
    <rect class="fg-box" x="728" y="64" width="176" height="104" rx="8"/>
    <text class="fg-lbl" x="742" y="83">RS</text>
    <text class="fg-t" x="816" y="105" text-anchor="middle">Resource Server</text>
    <text class="fg-mxs" x="816" y="119" text-anchor="middle">あなたの API</text>
    <line class="fg-rule" x1="742" y1="129" x2="890" y2="129"/>
    <text class="fg-xs" x="816" y="145" text-anchor="middle">アクセストークンを検証する</text>
    <text class="fg-xs" x="816" y="158" text-anchor="middle">データを返す</text>
    <!-- RP から OP へ、そして戻り -->
    <path class="fg-edge" d="M236,106 H388" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="312" y="99" text-anchor="middle">ログインを委任</text>
    <path class="fg-edge fg-edge--accent" d="M388,140 H236" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="312" y="133" text-anchor="middle">id_token · access_token</text>
    <!-- RS から OP へ -->
    <path class="fg-edge fg-edge--muted" d="M724,128 H572" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="648" y="121" text-anchor="middle">署名を確認</text>
    <text class="fg-mxs" x="648" y="145" text-anchor="middle">/jwks · /introspect</text>
    <!-- RP から RS へ、OP の下を通す -->
    <path class="fg-edge" d="M144,172 V206 H816 V176" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo--plain fg-halo" x="480" y="200" text-anchor="middle">Authorization: Bearer &lt;access_token&gt;</text>
  </svg>
  <figcaption class="fig-note">RS は認証情報そのものを受け取らず、有効期限のあるトークンだけを受け取ります。委任の要点はここにあり、API はユーザのパスワードを預かる代わりに OP の署名を信頼します。</figcaption>
</figure>

ログインの実際のステップ（`/auth` への redirect、code 交換、トークン取得）は後段の [認可コード + PKCE](#authorization-code-pkce) で詳述します。まずは「誰が何を担当しているか」を押さえてください。

::: tip 同じソフトが複数の役割を兼ねることもある
たとえば「Backend for Frontend」は、ユーザをログインさせる **RP** であると同時に、SPA からアクセストークン付きで呼ばれる **RS** でもあります。
:::

## OAuth 2.0 と OpenID Connect の違い

OAuth 2.0 は **認可の委任** を担う規格です — 「Alice のアプリが、サービス X 上の Alice のデータを読む許可をもらう」。OAuth 2.0 単独では、アプリ側に **Alice が誰なのか** は伝わりません。あくまで不透明なアクセストークンを渡すだけです。

OpenID Connect（OIDC）は **OAuth 2.0 + 認証結果** を扱う規格です。OP はアクセストークンに加えて **ID トークン**（署名付き JWT）を発行し、「このトークンはユーザ `sub=alice123`、audience `client_id=myapp` 向けに、この時刻に発行された。Alice について次の claim が真である」と表明します。

OIDC はさらに userinfo エンドポイント（`/userinfo`）、discovery、RP-Initiated Logout、Back-Channel Logout 通知も追加します。

::: details JWT とは
**JWT**（JSON Web Token、RFC 7519）は `header.payload.signature` の 3 つを `.` で繋いだ base64url 文字列です。header と payload は JSON で、signature は受け手が公開鍵で発行者を暗号学的に検証するための部分です。

OIDC では **ID トークンは常に JWT** です。本ライブラリのアクセストークンも既定では JWT で、必要な場合は opaque 形式に切り替えられます。JSON が読めて署名が検証できるなら、既定の JWT 形式は読めます — 独自バイナリ形式は登場しません。
:::

::: details Opaque と JWT の違い
- **Opaque token** — 受け手にとっては意味のないランダム文字列。中身を知るには発行元の introspection エンドポイント（RFC 7662）に問い合わせ、対応する行を引きに行く必要があります。
- **JWT** — 自己記述的。中身がトークンにエンコードされていて、署名の検証だけで（オフラインで）受け手が中身を信用できます。

判断軸は「リクエストごとに OP に問い合わせるか」「OP からきめ細かい失効を制御しづらくなるか」のどちらを重く見るかです。本ライブラリの折衷案は [tokens](/ja/concepts/tokens) を参照してください。
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
よくある落とし穴です。ID トークンの audience は RP であって RS ではありません。API に `Authorization: Bearer` で送ると技術的には通ってしまうことがありますが、意味的には誤りです。RP 向けの claim（email など）を、ユーザが触る全 API に晒すことになります。

**API にはアクセストークンを使ってください。** RFC 7662 の introspection、もしくは RFC 9068 の self-contained JWT として検証します。

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
  <div class="fig-head">認可コード + PKCE — 全体の流れ</div>
  <svg class="fig-svg" role="img" aria-labelledby="primer-seq-title" viewBox="0 0 960 520" xmlns="http://www.w3.org/2000/svg">
    <title id="primer-seq-title">認可コードフローと PKCE を 11 手順で示した図。ブラウザがユーザを RP と OP の間で運んでログインと同意を行い、RP が認可コードをトークンエンドポイントでトークンに交換し、そのアクセストークンで RS を呼び出します。</title>
    <!-- ライフライン -->
    <line class="fg-life" x1="110" y1="62" x2="110" y2="502"/>
    <line class="fg-life" x1="340" y1="62" x2="340" y2="502"/>
    <line class="fg-life fg-life--accent" x1="590" y1="62" x2="590" y2="502"/>
    <line class="fg-life" x1="850" y1="62" x2="850" y2="502"/>
    <!-- 登場人物 -->
    <rect class="fg-box" x="34" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="110" y="35" text-anchor="middle">ユーザ</text>
    <text class="fg-xs" x="110" y="49" text-anchor="middle">ブラウザ</text>
    <rect class="fg-box" x="264" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="340" y="35" text-anchor="middle">RP</text>
    <text class="fg-xs" x="340" y="49" text-anchor="middle">あなたのアプリ</text>
    <rect class="fg-box fg-box--accent" x="510" y="16" width="160" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="590" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="590" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="774" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="850" y="35" text-anchor="middle">RS</text>
    <text class="fg-xs" x="850" y="49" text-anchor="middle">あなたの API</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="96" r="8.5"/>
    <text class="fg-badge-t" x="15" y="99" text-anchor="middle">1</text>
    <path class="fg-edge" d="M110,96 H340" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="225" y="90" text-anchor="middle">アプリを開く</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="140" r="8.5"/>
    <text class="fg-badge-t" x="15" y="143" text-anchor="middle">2</text>
    <path class="fg-edge" d="M340,140 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="225" y="120" text-anchor="middle">302 で OP へ</text>
    <text class="fg-mxs" x="225" y="133" text-anchor="middle">client_id · redirect_uri · scope · state · code_challenge</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="176" r="8.5"/>
    <text class="fg-badge-t" x="15" y="179" text-anchor="middle">3</text>
    <path class="fg-edge" d="M110,176 H590" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo fg-halo--plain" x="420" y="170" text-anchor="middle">GET /authorize</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="212" r="8.5"/>
    <text class="fg-badge-t" x="15" y="215" text-anchor="middle">4</text>
    <path class="fg-edge" d="M590,212 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo fg-halo--plain" x="420" y="206" text-anchor="middle">200 ログイン + 同意画面</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="248" r="8.5"/>
    <text class="fg-badge-t" x="15" y="251" text-anchor="middle">5</text>
    <path class="fg-edge" d="M110,248 H590" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo fg-halo--plain" x="420" y="242" text-anchor="middle">POST 認証情報 · 同意</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="292" r="8.5"/>
    <text class="fg-badge-t" x="15" y="295" text-anchor="middle">6</text>
    <path class="fg-edge" d="M590,292 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo fg-halo--plain" x="420" y="272" text-anchor="middle">302 で RP の callback へ</text>
    <text class="fg-mxs fg-halo fg-halo--plain" x="420" y="285" text-anchor="middle">?code=xyz&amp;state=…</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="328" r="8.5"/>
    <text class="fg-badge-t" x="15" y="331" text-anchor="middle">7</text>
    <path class="fg-edge" d="M110,328 H340" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="225" y="322" text-anchor="middle">GET /callback?code=xyz</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="372" r="8.5"/>
    <text class="fg-badge-t" x="15" y="375" text-anchor="middle">8</text>
    <path class="fg-edge" d="M340,372 H590" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="465" y="352" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="465" y="365" text-anchor="middle">code · code_verifier · client auth</text>
    <!-- 9 -->
    <circle class="fg-badge" cx="15" cy="408" r="8.5"/>
    <text class="fg-badge-t" x="15" y="411" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M590,408 H340" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="465" y="402" text-anchor="middle">{ access_token · id_token · refresh_token }</text>
    <!-- 10 -->
    <circle class="fg-badge" cx="15" cy="452" r="8.5"/>
    <text class="fg-badge-t" x="15" y="455" text-anchor="middle">10</text>
    <path class="fg-edge" d="M340,452 H850" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo fg-halo--plain" x="595" y="432" text-anchor="middle">GET /api/…</text>
    <text class="fg-mxs fg-halo fg-halo--plain" x="595" y="445" text-anchor="middle">Authorization: Bearer &lt;access_token&gt;</text>
    <!-- 11 -->
    <circle class="fg-badge" cx="15" cy="488" r="8.5"/>
    <text class="fg-badge-t" x="15" y="491" text-anchor="middle">11</text>
    <path class="fg-edge" d="M850,488 H340" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo fg-halo--plain" x="595" y="482" text-anchor="middle">200 OK { data }</text>
  </svg>
  <figcaption class="fig-note">手順 1 から 7 はすべてブラウザを経由します。<code>state</code> と <code>code_challenge</code> をこれほど早い段階で送るのはそのためで、戻ってきたリダイレクトを送り出したリクエストに結び付けられるのはこの 2 つだけです。手順 8 と 9 はブラウザを通らない直接のバックチャネル通信です。</figcaption>
</figure>

「+ PKCE」（`code_challenge` / `code_verifier` で示される部分）は、悪意あるアプリが認可コードを横取りすることを防ぐ仕組みです。詳しくは [認可コードフロー + PKCE](/ja/concepts/authorization-code-pkce) で扱います。

## このサイトでよく出てくる用語

| 用語 | 意味 |
|---|---|
| **Scope** | 半角スペース区切りの権限リスト（例: `openid profile email`）。ユーザがこれに同意します。 |
| **Claim** | トークン内のフィールド（`sub`、`email`、`email_verified` など）。 |
| **Consent**（同意） | 「このアプリはあなたのメールアドレスを受け取りたいと言っています」とユーザに確認する画面のこと。OP が記録し、同じ scope の次回ログインではスキップします。 |
| **Audience（`aud`）** | トークンの宛先。ID トークンは `aud = client_id`、アクセストークンは `aud = resource server` です。 |
| **Issuer（`iss`）** | トークンに署名した OP。RP も RS も自分の期待値と一致するか確認します。 |
| **JWKS** | JSON Web Key Set。OP の公開鍵集合で、`/jwks` から取得します。RP は ID トークンの検証に使います。 |
| **Discovery 文書** | `/.well-known/openid-configuration`。エンドポイント、対応 scope、対応 alg などをまとめた JSON の一覧。 |

::: details `acr` と `amr` を 1 段落で
`acr` は認証が **どれだけ強かったか**（`aal2` のような保証水準ラベル）を表し、`amr` は **どの認証要素を使ったか**（`["pwd","otp"]` のような配列）を表します。RP が機微な操作のために高い保証を要求するときは `acr_values` で高い `acr` を要求し、OP は step-up 認証を実行して ID トークンを再発行します。RFC 8176(Authentication Method Reference Values)が標準 `amr` 値を規定し、RFC 9470(OAuth 2.0 Step Up Authentication Challenge Protocol)が `WWW-Authenticate: error="insufficient_user_authentication"` 経由の step-up を標準化しています。組み込み手順は [MFA / step-up](/ja/use-cases/mfa-step-up) を参照してください。
:::

## FAPI 2.0 が追加するもの

金融グレード・医療グレードの OP を作るなら、OIDC の上に **FAPI 2.0** の要求を重ねる必要があります。送信者制約付きトークン（DPoP / mTLS）、PAR（authorize 要求を先にサーバ間で送る）、JAR（要求自体を署名 JWT にする）、より絞られた alg 許可リストが要求されます。本ライブラリではプロファイル指定 1 行で有効化できます。

```go
op.WithProfile(profile.FAPI2Baseline)
```

略号を一通り解説した入門は [FAPI 2.0 入門](/ja/concepts/fapi) にあります。DPoP / mTLS の仕組みは [送信者制約](/ja/concepts/sender-constraint) を、全体構成は [使い方: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を参照してください。

## 続きはこちら

- [認可コード + PKCE](/ja/concepts/authorization-code-pkce) — 上記の流れをシーケンス図とパラメータ用語集で詳説。
- [Client Credentials](/ja/concepts/client-credentials) — サービス間通信、エンドユーザなし。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — ローテーション、再利用検知、猶予期間。
- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — 似て非なる 3 つのアーティファクト。
- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — FAPI 2.0 が実際に追加する仕組み。
- [FAPI 2.0 入門](/ja/concepts/fapi) — FAPI プロファイルとは何か、PAR / JAR / JARM などの各略号が何をしているか、なぜプロファイルが「OIDC + ベストプラクティス」より勝るのか。
