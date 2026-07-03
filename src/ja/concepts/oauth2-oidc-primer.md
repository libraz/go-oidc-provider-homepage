---
title: OAuth 2.0 / OIDC 入門
description: OAuth 2.0 のロールと OpenID Connect が追加するものを、ゼロから一通り。はじめての方向け。
---

# OAuth 2.0 / OpenID Connect 入門

認証・認可に初めて触れる方には、関連する規格が略語の羅列に見えるかもしれません: OAuth、OIDC、JWT、OP、RP、RS、PAR、JAR、JARM、DPoP、mTLS、PKCE、FAPI…。ただ、まず押さえるべき **ロールは 3 つだけ** です。ほとんどの規格は、この 3 ロール間のフローを少しずつ強化したものです。

::: details 略号の早見表(まずここを開いてください)
**3 つのロール**
- **OP**(OpenID Provider) — ユーザを認証してトークンを発行するサーバ。`go-oidc-provider` はここに該当します。純粋 OAuth 文脈では **AS**(Authorization Server)とも呼ばれます。
- **RP**(Relying Party) — OP を使ってユーザをログインさせるクライアントアプリ。OAuth の文脈では **client** とも呼ばれます。
- **RS**(Resource Server) — アクセストークンを受け取ってデータを返す API。

**トークンと暗号**
- **JWT**(JSON Web Token、RFC 7519) — `header.payload.signature` を `.` で繋いだ base64url 文字列。自己記述的で署名検証可能。
- **JWS**(JSON Web Signature、RFC 7515) — JWT が使う署名方式。
- **JWE**(JSON Web Encryption、RFC 7516) — 暗号化版。外側のエンベロープが内側の JWS を包みます。
- **JWK** / **JWKS**(RFC 7517) — JSON Web Key / Key **Set**。OP の公開鍵集合で `/jwks` から取得します。
- **PKCE**(RFC 7636) — 認可コードに対する所持証明。認可コードを横取りされてもトークンに交換されないようにします。発音は「ピクシー」。

**プロファイル / ハードニング略号**
- **PAR**(RFC 9126) — Pushed Authorization Request。RP がまず authorize 要求を OP に POST し、ブラウザは `request_uri` 参照だけを運びます。
- **JAR**(RFC 9101) — JWT-Secured Authorization Request。authorize 要求自体を署名 JWT にします。
- **JARM**(OpenID FAPI) — JWT-Secured Authorization Response Mode。authorize **応答** を署名 JWT にします。
- **DPoP**(RFC 9449) — Demonstrating Proof of Possession。クライアントが保持する鍵にトークンをリクエストごとにバインドします。
- **mTLS**(RFC 8705) — mutual TLS。考え方は DPoP と同じで、バインドの主体がクライアントの TLS 証明書になります。
- **FAPI**(Financial-grade API) — 上記をまとめて固定する OpenID プロファイル。
- **CIBA** — Client-Initiated Backchannel Authentication。ブラウザを持たないデバイスから、ユーザのスマートフォンなどへ認証要求を送るバックチャネル認証。

**早期に登場する identity claim**
- **`sub`** — Subject。当該 OP におけるユーザの不透明な識別子。
- **`aud`** — Audience。トークンの宛先。
- **`iss`** — Issuer。トークンに署名した OP。
- **`scope`** — 半角スペース区切りの権限リスト(`openid profile email` など)。
- **`acr`**(Authentication Context Class Reference) — 認証手段が提供した保証水準。step-up で使われます。
- **`amr`**(Authentication Methods References) — 実際に使った factor を表す RFC 8176 の値(`pwd`、`otp`、`mfa`、`hwk`、`face`、`fpt`)。
- **`cnf`** — confirmation。トークンが結びついている鍵(DPoP の `jkt` thumbprint または mTLS の `x5t#S256`)。
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

## 3 つのロール

<svg class="diag diag-roles" role="img" aria-labelledby="roles-title" viewBox="0 0 760 202" style="width:100%;height:auto;max-width:760px;display:block;margin:1.5rem auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="roles-title">OAuth / OIDC の 3 つのロール: RP は OP に認証を委任してトークンを受け取り、Bearer アクセストークンで RS を呼び出す。</title>
  <style>
    .diag-roles text{stroke:none;fill:var(--vp-c-text-1)}
    .diag-roles .p{font-family:var(--vp-font-family-base)}
    .diag-roles .m{font-family:var(--vp-font-family-mono)}
    .diag-roles .sub{fill:var(--vp-c-text-2)}
    .diag-roles .op{stroke:var(--vp-c-brand-2)}
    .diag-roles .opf{fill:var(--vp-c-brand-2)}
    .diag-roles .rs{stroke:var(--vp-c-text-3)}
    .diag-roles .rsf{fill:var(--vp-c-text-3)}
  </style>
  <defs>
    <marker id="roles-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <rect x="14" y="16" width="186" height="128" rx="8"/>
  <rect class="op" x="287" y="16" width="186" height="128" rx="8"/>
  <rect class="rs" x="560" y="16" width="186" height="128" rx="8"/>
  <text class="p" x="107" y="50" text-anchor="middle" font-size="18" font-weight="700">RP</text>
  <text class="p sub" x="107" y="72" text-anchor="middle" font-size="11">Relying Party / client</text>
  <text class="p sub" x="107" y="90" text-anchor="middle" font-size="11">あなたのアプリ</text>
  <text class="p sub" x="107" y="114" text-anchor="middle" font-size="10">ログインを開始し、</text>
  <text class="p sub" x="107" y="128" text-anchor="middle" font-size="10">トークンを保持し API を呼ぶ</text>
  <text class="p opf" x="380" y="50" text-anchor="middle" font-size="18" font-weight="700">OP</text>
  <text class="p sub" x="380" y="72" text-anchor="middle" font-size="11">OpenID Provider</text>
  <text class="m opf" x="380" y="91" text-anchor="middle" font-size="11">go-oidc-provider</text>
  <text class="p sub" x="380" y="114" text-anchor="middle" font-size="10">ユーザを認証し、</text>
  <text class="p sub" x="380" y="128" text-anchor="middle" font-size="10">トークンを発行</text>
  <text class="p rsf" x="653" y="50" text-anchor="middle" font-size="18" font-weight="700">RS</text>
  <text class="p sub" x="653" y="72" text-anchor="middle" font-size="11">Resource Server</text>
  <text class="p sub" x="653" y="90" text-anchor="middle" font-size="11">あなたの API</text>
  <text class="p sub" x="653" y="114" text-anchor="middle" font-size="10">アクセストークンを検証し</text>
  <text class="p sub" x="653" y="128" text-anchor="middle" font-size="10">データを返す</text>
  <text class="p sub" x="243" y="60" text-anchor="middle" font-size="10">認証を委任 /</text>
  <text class="p sub" x="243" y="74" text-anchor="middle" font-size="10">トークンを受領</text>
  <line x1="200" y1="88" x2="287" y2="88" marker-start="url(#roles-ah)" marker-end="url(#roles-ah)"/>
  <path d="M120 144 C 120 200, 640 200, 640 144" marker-end="url(#roles-ah)"/>
  <text class="p sub" x="380" y="178" text-anchor="middle" font-size="10"><tspan class="m">Bearer</tspan> アクセストークン</text>
</svg>

ログインの実際のステップ（`/auth` への redirect、code 交換、トークン取得）は後段の [認可コード + PKCE フロー](#最もよく見かけるフロー-認可コード-pkce) で詳述します。まずは「誰が何を担当しているか」を押さえてください。

::: tip 同じソフトが複数のロールを兼ねることもある
たとえば「Backend for Frontend」は、ユーザをログインさせる **RP** であると同時に、SPA からアクセストークン付きで呼ばれる **RS** でもあります。
:::

## OAuth 2.0 と OpenID Connect の違い

OAuth 2.0 は **認可の委任** を担う規格です — 「Alice のアプリが、サービス X 上の Alice のデータを読む許可をもらう」。OAuth 2.0 単独では、アプリ側に **Alice が誰なのか** は伝わりません。あくまで不透明なアクセストークンを渡すだけです。

OpenID Connect（OIDC）は **OAuth 2.0 + 認証結果** を扱う規格です。OP は加えて **ID トークン**（署名付き JWT）を発行し、「このトークンはユーザ `sub=alice123`、audience `client_id=myapp` 向けに、この時刻に発行された。Alice について次の claim が真である」と表明します。

OIDC はさらに userinfo エンドポイント (`/userinfo`)、discovery、RP-Initiated Logout、Back-Channel Logout 通知も追加します。

::: details JWT とは
**JWT**（JSON Web Token、RFC 7519）は `header.payload.signature` の 3 つを `.` で繋いだ base64url 文字列です。header と payload は JSON で、signature は受け手が公開鍵で発行者を暗号学的に検証するための部分です。

OIDC では **ID トークンは常に JWT** です。本ライブラリのアクセストークンも既定では JWT で、必要な場合は opaque 形式に切り替えられます。JSON が読めて署名が検証できるなら、既定の JWT 形式は読めます — 独自バイナリ形式は登場しません。
:::

::: details Opaque と JWT の違い
- **Opaque token** — 受け手にとっては意味のないランダム文字列。中身を知るには発行元の introspection エンドポイント（RFC 7662）に問い合わせ、対応する行を引きに行く必要があります。
- **JWT** — 自己記述的。中身がトークンにエンコードされていて、署名の検証だけで（オフラインで）受け手が中身を信用できます。

トレードオフは「リクエストごとに OP に問い合わせるか」対「OP からきめ細かい失効を制御しづらくなるか」のどちらを取るかです。本ライブラリの折衷案は [tokens](/ja/concepts/tokens) を参照してください。
:::

::: details どちらを使えばいい？
- 純粋な OAuth 2.0: 「このトークンは `POST /things` を呼べる」だけが言えれば良い API。サービス間通信でよく使われます。
- OIDC: 人間がログインして、アプリが「こんにちは Alice」と言いたいケース。Web・モバイルのログインはほぼすべて OIDC です。

`go-oidc-provider` はデフォルトで OIDC（`openid` scope 必須）として動作し、`op.WithOpenIDScopeOptional()` で純粋 OAuth 2.0 にも切り替えられます。
:::

## 出てくる 4 種類のトークン

| トークン | 寿命 | 何のためのもの | 行き先 |
|---|---|---|---|
| **認可コード** | 数十秒（既定 60 秒） | 1 回限りの不透明な文字列。 | server-to-server: RP → OP `/token`。 |
| **アクセストークン** | 数分（既定 5 分） | API を呼ぶときの `Authorization: Bearer …` に乗せる。JWT または opaque。 | RP → RS。 |
| **リフレッシュトークン** | 数日〜数週間（既定 30 日） | 長寿命。再認証なしに新しいアクセストークンを取得するために使う。 | RP → OP `/token`。 |
| **ID トークン** | 数分（既定 10 分） | ユーザが誰かを証明する署名付き JWT。**API には送らない**。 | OP → RP、RP 内で消費。 |

::: warning ID トークンを Bearer に乗せない
よくある落とし穴です。ID トークンの audience は RP であって RS ではありません。API に `Authorization: Bearer` で送ると技術的には通ってしまうことがありますが、意味的には誤りです。RP 向けの claim（email など）を、ユーザが触る全 API に晒すことになります。

**API にはアクセストークンを使ってください。** RFC 7662 の introspection、もしくは RFC 9068 の self-contained JWT として検証します。
:::

## 最もよく見かけるフロー: 認可コード + PKCE

<svg class="diag diag-authcode" role="img" aria-labelledby="authcode-title" viewBox="0 0 772 520" style="width:100%;height:auto;max-width:772px;display:block;margin:1.5rem auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="authcode-title">認可コード + PKCE のシーケンス: ブラウザがユーザを RP と OP の間で運んでログインと code 交換を行い、その後 RP が access token で RS を呼び出す。</title>
  <style>
    .diag-authcode text{stroke:none;fill:var(--vp-c-text-1)}
    .diag-authcode .p{font-family:var(--vp-font-family-base)}
    .diag-authcode .m{font-family:var(--vp-font-family-mono)}
    .diag-authcode .sub{fill:var(--vp-c-text-2)}
    .diag-authcode .life{stroke:var(--vp-c-divider);stroke-width:1.5}
    .diag-authcode .op{stroke:var(--vp-c-brand-2)}
    .diag-authcode .opf{fill:var(--vp-c-brand-2)}
    .diag-authcode .rs{stroke:var(--vp-c-text-3)}
    .diag-authcode .rsf{fill:var(--vp-c-text-3)}
  </style>
  <defs>
    <marker id="authcode-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <line class="life" x1="70" y1="48" x2="70" y2="506"/>
  <line class="life" x1="280" y1="48" x2="280" y2="506"/>
  <line class="life op" x1="500" y1="48" x2="500" y2="506"/>
  <line class="life rs" x1="700" y1="48" x2="700" y2="506"/>
  <rect x="20" y="12" width="100" height="36" rx="6"/>
  <text class="p" x="70" y="30" text-anchor="middle" font-size="12" font-weight="700">ユーザ</text>
  <text class="p sub" x="70" y="43" text-anchor="middle" font-size="9">(ブラウザ)</text>
  <rect x="230" y="12" width="100" height="36" rx="6"/>
  <text class="p" x="280" y="30" text-anchor="middle" font-size="12" font-weight="700">RP</text>
  <text class="p sub" x="280" y="43" text-anchor="middle" font-size="9">あなたのアプリ</text>
  <rect class="op" x="440" y="12" width="120" height="36" rx="6"/>
  <text class="p opf" x="500" y="29" text-anchor="middle" font-size="12" font-weight="700">OP</text>
  <text class="m opf" x="500" y="43" text-anchor="middle" font-size="9">go-oidc-provider</text>
  <rect class="rs" x="650" y="12" width="100" height="36" rx="6"/>
  <text class="p rsf" x="700" y="30" text-anchor="middle" font-size="12" font-weight="700">RS</text>
  <text class="p sub" x="700" y="43" text-anchor="middle" font-size="9">あなたの API</text>
  <circle cx="24" cy="92" r="10"/>
  <text class="p" x="24" y="96" text-anchor="middle" font-size="11">1</text>
  <line x1="70" y1="92" x2="280" y2="92" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="83" font-size="11">アプリを開く</text>
  <circle cx="24" cy="132" r="10"/>
  <text class="p" x="24" y="136" text-anchor="middle" font-size="11">2</text>
  <line x1="280" y1="132" x2="70" y2="132" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="110" font-size="11">OP <tspan class="m">/auth</tspan> にリダイレクト</text>
  <text class="m" x="78" y="122" font-size="9.5">client_id, redirect_uri, scope, state, code_challenge</text>
  <circle cx="24" cy="172" r="10"/>
  <text class="p" x="24" y="176" text-anchor="middle" font-size="11">3</text>
  <line x1="70" y1="172" x2="500" y2="172" marker-end="url(#authcode-ah)"/>
  <text class="m" x="78" y="163" font-size="10">GET /auth …</text>
  <circle cx="24" cy="212" r="10"/>
  <text class="p" x="24" y="216" text-anchor="middle" font-size="11">4</text>
  <line x1="500" y1="212" x2="70" y2="212" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="203" font-size="11">ログイン + 同意 UI</text>
  <circle cx="24" cy="252" r="10"/>
  <text class="p" x="24" y="256" text-anchor="middle" font-size="11">5</text>
  <line x1="70" y1="252" x2="500" y2="252" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="243" font-size="11">認証情報を送信</text>
  <circle cx="24" cy="292" r="10"/>
  <text class="p" x="24" y="296" text-anchor="middle" font-size="11">6</text>
  <line x1="500" y1="292" x2="70" y2="292" marker-end="url(#authcode-ah)"/>
  <text class="p" x="78" y="270" font-size="11">302 で RP <tspan class="m">/callback</tspan> へ</text>
  <text class="m" x="78" y="282" font-size="10">?code=xyz&amp;state=…</text>
  <circle cx="24" cy="332" r="10"/>
  <text class="p" x="24" y="336" text-anchor="middle" font-size="11">7</text>
  <line x1="70" y1="332" x2="280" y2="332" marker-end="url(#authcode-ah)"/>
  <text class="m" x="78" y="323" font-size="10">GET /callback?code=xyz</text>
  <circle cx="24" cy="372" r="10"/>
  <text class="p" x="24" y="376" text-anchor="middle" font-size="11">8</text>
  <line x1="280" y1="372" x2="500" y2="372" marker-end="url(#authcode-ah)"/>
  <text class="m" x="288" y="350" font-size="10">POST /token</text>
  <text class="m" x="288" y="362" font-size="9.5">code=xyz, code_verifier=…, client auth</text>
  <circle cx="24" cy="412" r="10"/>
  <text class="p" x="24" y="416" text-anchor="middle" font-size="11">9</text>
  <line x1="500" y1="412" x2="280" y2="412" marker-end="url(#authcode-ah)"/>
  <text class="m" x="288" y="403" font-size="10">{ access_token, id_token, refresh_token }</text>
  <circle cx="24" cy="452" r="10"/>
  <text class="p" x="24" y="456" text-anchor="middle" font-size="11">10</text>
  <line x1="280" y1="452" x2="700" y2="452" marker-end="url(#authcode-ah)"/>
  <text class="m" x="288" y="430" font-size="10">GET /api/…</text>
  <text class="m" x="288" y="442" font-size="9.5">Authorization: Bearer &lt;access_token&gt;</text>
  <circle cx="24" cy="492" r="10"/>
  <text class="p" x="24" y="496" text-anchor="middle" font-size="11">11</text>
  <line x1="700" y1="492" x2="280" y2="492" marker-end="url(#authcode-ah)"/>
  <text class="m" x="288" y="483" font-size="10">200 OK  { data }</text>
</svg>

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
| **Discovery 文書** | `/.well-known/openid-configuration`。エンドポイント、対応 scope、対応 alg などをまとめた JSON カタログ。 |

::: details `acr` と `amr` を 1 段落で
`acr` は認証が **どれだけ強かったか**（`aal2` のような保証水準ラベル）を表し、`amr` は **どの factor を使ったか**（`["pwd","otp"]` のような配列）を表します。RP が機微な操作のために高い保証を要求するときは `acr_values` で高い `acr` を要求し、OP は step-up 認証を実行して ID トークンを再発行します。RFC 8176(Authentication Method Reference Values)が標準 `amr` 値を規定し、RFC 9470(OAuth 2.0 Step Up Authentication Challenge Protocol)が `WWW-Authenticate: error="insufficient_user_authentication"` 経由の step-up を標準化しています。組み込み手順は [MFA / step-up](/ja/use-cases/mfa-step-up) を参照してください。
:::

## FAPI 2.0 が追加するもの

金融グレード・医療グレードの OP を作るなら、OIDC の上に **FAPI 2.0** の要求を重ねる必要があります。送信者制約付きトークン（DPoP / mTLS）、PAR（authorize 要求を先に server-to-server で送る）、JAR（要求自体を署名 JWT にする）、より絞られた alg allow-list が要求されます。本ライブラリではプロファイル指定 1 行で有効化できます。

```go
op.WithProfile(profile.FAPI2Baseline)
```

略号を一通り解説した入門は [FAPI 2.0 入門](/ja/concepts/fapi) にあります。DPoP / mTLS の仕組みは [送信者制約](/ja/concepts/sender-constraint) を、フル構成は [ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を参照してください。

## 続きはこちら

- [認可コードフロー + PKCE](/ja/concepts/authorization-code-pkce) — 上記フローを sequence 図とパラメータ用語集で詳説。
- [Client Credentials](/ja/concepts/client-credentials) — サービス間通信、エンドユーザなし。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — ローテーション、再利用検知、grace 期間。
- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — 似て非なる 3 つのアーティファクト。
- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — FAPI 2.0 が実際に追加する仕組み。
- [FAPI 2.0 入門](/ja/concepts/fapi) — FAPI プロファイルとは何か、PAR / JAR / JARM などの各略号が何をしているか、なぜプロファイルが「OIDC + ベストプラクティス」より勝るのか。
