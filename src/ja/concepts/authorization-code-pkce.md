---
title: 認可コード + PKCE フロー
description: 最も使われる OIDC フローを最初から最後まで、シーケンス図とパラメータ用語集で解説。
---

# 認可コード + PKCE

最も一般的な OIDC フローです。Web アプリ、モバイルアプリ、SPA、デスクトップアプリで人がログインするとき、ほぼすべてがこの形です。本ライブラリでは、公開クライアント（public client）とネイティブアプリには常に PKCE（Proof Key for Code Exchange、RFC 7636）が必須です。FAPI プロファイル下では、すべての認可コードクライアントに PKCE が必須になります。FAPI ではない confidential client は古い OIDC Core の形も扱えますが、新規構築では常に `S256` を送ってください。

::: warning 現在の挙動
公開クライアントやネイティブアプリが `code_challenge` を省略すると、`/authorize` で `invalid_request` として拒否されます。これらのクライアントは PKCE 前提で登録し、必ず `code_challenge_method=S256` を送ってください。`/token` でクライアント認証できないクライアントに対して、OP は非 PKCE の認可コードを発行しません。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework（§5.2 エラーコード）
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — Proof Key for Code Exchange (PKCE)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1（Authorization Code Flow）
:::

::: details 用語の補足
- **認可コード（authorization code）** — OP がブラウザリダイレクト経由で RP に渡す、1 回限りの不透明な文字列。RP はこれを `/token` でトークンに交換します。
- **PKCE**（「ピクシー」と読む） — `code_verifier` と `code_challenge` を使った小さな手続きで、「このコードを引き換えに来たクライアントは、フローを始めたクライアントと同一」と OP に証明させる仕組み。リダイレクトされたコードを悪意あるアプリに横取りされるのを防ぎます。詳しい解説は後述。
- **`state`** — RP が authorize 要求に乗せ、コールバックで検査するランダムな不透明値。リダイレクトの CSRF 防御。
- **`nonce`** — ID トークンに紐づくランダムな不透明値。RP 側でのリプレイ防御。
:::

## 完全なシーケンス

<svg role="img" aria-labelledby="acpkce-seq-title" viewBox="0 0 684 712" style="width:100%;height:auto;max-width:684px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="acpkce-seq-title">認可コード + PKCE のシーケンス: ブラウザ、Relying Party、OpenID Provider、Resource Server の間で、ログインから PKCE 検証付きトークン発行、Bearer トークンでの API 呼び出しまでのやり取りを示す図。</title>
  <defs>
    <marker id="acp-ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L5.5 3.5 L1 6" fill="none" stroke="currentColor" stroke-width="1.4"/></marker>
    <marker id="acp-ahb" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L5.5 3.5 L1 6" fill="none" class="op-accent" stroke-width="1.4"/></marker>
  </defs>
  <!-- lifelines -->
  <line class="lane" x1="70" y1="54" x2="70" y2="706"/>
  <line class="lane" x1="250" y1="54" x2="250" y2="706"/>
  <line class="lane lane-op" x1="430" y1="54" x2="430" y2="706"/>
  <line class="lane lane-rs" x1="610" y1="54" x2="610" y2="706"/>
  <!-- actor headers -->
  <rect class="box" x="20" y="14" width="100" height="40" rx="6"/>
  <text class="actor" x="70" y="31" text-anchor="middle">ユーザ</text>
  <text class="asub" x="70" y="45" text-anchor="middle">ブラウザ</text>
  <rect class="box" x="200" y="14" width="100" height="40" rx="6"/>
  <text class="actor" x="250" y="31" text-anchor="middle">Relying Party</text>
  <text class="asub" x="250" y="45" text-anchor="middle">web アプリ</text>
  <rect class="box box-op" x="380" y="14" width="100" height="40" rx="6"/>
  <text class="actor actor-op" x="430" y="31" text-anchor="middle">OpenID Provider</text>
  <text class="asub" x="430" y="45" text-anchor="middle">go-oidc-provider</text>
  <rect class="box box-rs" x="560" y="14" width="100" height="40" rx="6"/>
  <text class="actor actor-rs" x="610" y="31" text-anchor="middle">Resource Server</text>
  <text class="asub" x="610" y="45" text-anchor="middle">API サーバ</text>
  <!-- PKCE note over RP -->
  <rect class="notebox" x="128" y="62" width="244" height="32" rx="5"/>
  <text class="note" x="250" y="76" text-anchor="middle">RP が PKCE ペアを生成</text>
  <text class="notemono" x="250" y="89" text-anchor="middle">code_challenge = SHA-256(code_verifier)</text>
  <!-- 1 -->
  <text class="num" x="12" y="119" text-anchor="middle">1</text>
  <path class="msg" d="M70 116 H250" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="160" y="111" text-anchor="middle">アプリを開く</text>
  <!-- 2 -->
  <text class="num" x="12" y="148" text-anchor="middle">2</text>
  <path class="msg" d="M250 145 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="160" y="130" text-anchor="middle">302 → OP</text>
  <text class="mono" x="160" y="141" text-anchor="middle">/authorize · S256 · state · nonce</text>
  <!-- 3 -->
  <text class="num" x="12" y="177" text-anchor="middle">3</text>
  <path class="msg" d="M70 174 H430" marker-end="url(#acp-ah)"/>
  <text class="mono" x="158" y="169" text-anchor="middle">GET /authorize</text>
  <!-- 4 -->
  <text class="num" x="12" y="206" text-anchor="middle">4</text>
  <path class="self op-accent" d="M430 196 h32 v14 h-32" marker-end="url(#acp-ahb)"/>
  <text class="lbl" x="474" y="200">リクエスト検証</text>
  <text class="mono" x="474" y="211">redirect_uri 完全一致</text>
  <!-- 5 -->
  <text class="num" x="12" y="235" text-anchor="middle">5</text>
  <path class="msg" d="M430 232 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="158" y="227" text-anchor="middle">200 ログイン画面</text>
  <!-- 6 -->
  <text class="num" x="12" y="264" text-anchor="middle">6</text>
  <path class="msg" d="M70 261 H430" marker-end="url(#acp-ah)"/>
  <text class="mono" x="158" y="256" text-anchor="middle">POST 認証情報</text>
  <!-- 7 -->
  <text class="num" x="12" y="293" text-anchor="middle">7</text>
  <path class="self op-accent" d="M430 283 h32 v14 h-32" marker-end="url(#acp-ahb)"/>
  <text class="lbl" x="474" y="287">ユーザ認証</text>
  <text class="sub" x="474" y="298">password / passkey</text>
  <!-- 8 -->
  <text class="num" x="12" y="322" text-anchor="middle">8</text>
  <path class="msg" d="M430 319 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="158" y="314" text-anchor="middle">200 同意画面</text>
  <!-- 9 -->
  <text class="num" x="12" y="351" text-anchor="middle">9</text>
  <path class="msg" d="M70 348 H430" marker-end="url(#acp-ah)"/>
  <text class="mono" x="158" y="343" text-anchor="middle">POST 同意</text>
  <!-- 10 -->
  <text class="num" x="12" y="380" text-anchor="middle">10</text>
  <path class="msg" d="M430 377 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="158" y="362" text-anchor="middle">302 → redirect_uri</text>
  <text class="mono" x="158" y="373" text-anchor="middle">code &amp; state</text>
  <!-- 11 -->
  <text class="num" x="12" y="409" text-anchor="middle">11</text>
  <path class="msg" d="M70 406 H250" marker-end="url(#acp-ah)"/>
  <text class="mono" x="160" y="401" text-anchor="middle">GET /callback?code&amp;state</text>
  <!-- 12 -->
  <text class="num" x="12" y="438" text-anchor="middle">12</text>
  <path class="self" d="M250 428 h32 v14 h-32" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="294" y="438">state を検証</text>
  <!-- 13 -->
  <text class="num" x="12" y="467" text-anchor="middle">13</text>
  <path class="msg" d="M250 464 H430" marker-end="url(#acp-ah)"/>
  <text class="mono" x="340" y="451" text-anchor="middle">POST /token</text>
  <text class="mono" x="340" y="461" text-anchor="middle">code · code_verifier · client auth</text>
  <!-- 14 -->
  <text class="num" x="12" y="496" text-anchor="middle">14</text>
  <path class="self op-accent" d="M430 486 h32 v14 h-32" marker-end="url(#acp-ahb)"/>
  <text class="lbl" x="474" y="490">PKCE 検証</text>
  <text class="mono" x="474" y="501">SHA-256(verifier) == challenge</text>
  <!-- 15 -->
  <text class="num" x="12" y="525" text-anchor="middle">15</text>
  <path class="msg" d="M430 522 H250" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="340" y="510" text-anchor="middle">200 OK</text>
  <text class="mono" x="340" y="520" text-anchor="middle">access_token · id_token · refresh_token</text>
  <!-- 16 -->
  <text class="num" x="12" y="554" text-anchor="middle">16</text>
  <path class="self" d="M250 544 h32 v14 h-32" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="294" y="548">ID Token 検証</text>
  <text class="mono" x="294" y="559">iss · aud · exp · nonce</text>
  <!-- 17 -->
  <text class="num" x="12" y="583" text-anchor="middle">17</text>
  <path class="msg" d="M250 580 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="158" y="575" text-anchor="middle">session cookie 設定</text>
  <!-- 18 -->
  <text class="num" x="12" y="612" text-anchor="middle">18</text>
  <path class="msg" d="M70 609 H250" marker-end="url(#acp-ah)"/>
  <text class="mono" x="160" y="604" text-anchor="middle">GET /api/me</text>
  <!-- 19 -->
  <text class="num" x="12" y="641" text-anchor="middle">19</text>
  <path class="msg" d="M250 638 H610" marker-end="url(#acp-ah)"/>
  <text class="mono" x="520" y="626" text-anchor="middle">GET /api/me</text>
  <text class="mono" x="520" y="636" text-anchor="middle">Authorization: Bearer …</text>
  <!-- 20 -->
  <text class="num" x="12" y="670" text-anchor="middle">20</text>
  <path class="msg" d="M610 667 H430" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="520" y="655" text-anchor="middle">(任意)</text>
  <text class="mono" x="520" y="665" text-anchor="middle">introspect · JWT 自己検証</text>
  <!-- 21 -->
  <text class="num" x="12" y="699" text-anchor="middle">21</text>
  <path class="msg" d="M610 696 H250" marker-end="url(#acp-ah)"/>
  <text class="mono" x="520" y="691" text-anchor="middle">200 { user data }</text>
</svg>

## パラメータ用語集

| パラメータ | 送信タイミング | 目的 |
|---|---|---|
| `response_type=code` | `/authorize` | 認可コード grant を要求。 |
| `client_id` | `/authorize`、`/token` | 登録済み RP を識別。 |
| `redirect_uri` | `/authorize`（`/token` でも echo） | OP がユーザを戻す先。登録リストとの **完全一致**。 |
| `scope` | `/authorize` | 要求権限。OIDC では `openid` を含むこと。 |
| `state` | `/authorize` | RP がコールバックで echo する不透明値。redirect の CSRF 防御。 |
| `nonce` | `/authorize` | ID トークンの `nonce` claim にバインドされるランダム値。replay 防御。 |
| `code_challenge` | `/authorize` | `BASE64URL(SHA256(code_verifier))`。 |
| `code_challenge_method` | `/authorize` | `S256`（本ライブラリが受理する唯一の値）。 |
| `code` | `/authorize` レスポンス | 単発。本ライブラリは max-age 60 秒をデフォルトとする。RFC 6749 §4.1.2 は上限 10 分を推奨。 |
| `code_verifier` | `/token` | `code_challenge` の原像。OP が SHA-256 を再計算。 |
| `grant_type=authorization_code` | `/token` | この grant を選択。 |
| Client auth | `/token` | `client_secret_basic` / `client_secret_post` / `private_key_jwt` / `none`（PKCE のみ）のいずれか。mTLS 送信者制約は token endpoint クライアント認証とは別です。 |

::: details `state` と `nonce` の違い
両方ともランダムな opaque 値で、両方とも replay 系攻撃を防ぎますが、守る経路が違います。

- **`state`** は **フロントチャネル**（ブラウザのクエリ文字列）を流れる値です。RP はリダイレクト前にユーザのセッションに保存し、コールバック時に突き合わせます。守るのは *リダイレクト* 経路の CSRF — 攻撃者が `/callback` に偽コールバックを投げてアプリに受理させる、を阻止します。
- **`nonce`** は **ID トークンの claim** に乗ります。RP はリダイレクト前にユーザセッションに保存し、トークン交換後に突き合わせます。守るのは *ID トークン* のリプレイ — 盗まれた ID トークンを別 RP で、あるいは同じ RP の別ログイン試行で再利用させない、を阻止します。

両方使ってください。本ライブラリは confidential client で `state` 欠落のリクエストを拒否しますし、OIDC は `response_type=code id_token` や `id_token` を使うときには `nonce` 必須です。
:::

::: details `code_verifier` / `code_challenge` / `S256` とは
**`code_verifier`** は RP が生成して *自分だけが持っている* 推測困難なランダム文字列です。RFC 7636 §4.1 で 43〜128 文字の URL セーフ文字と定められています。

**`code_challenge`** は RP が `/authorize` で OP に送る値です。`code_challenge_method=S256` の場合、`BASE64URL(SHA-256(code_verifier))` — つまり一方向ハッシュです。OP には逆算できず、後で `/token` に verifier 本体を送ったときに RP の所有を証明できる形になります。

**`S256`** は SHA-256 ベースの変換で、本ライブラリが受理する唯一の `code_challenge_method` です。古い `plain` 方式（challenge と verifier が同じ）は URL を読める攻撃者には何の保護にもならないので、RFC 9700 が新規構築での使用を禁止しています。
:::

::: details `redirect_uri` — 完全一致が必須な理由
`/authorize` の `redirect_uri` は、クライアントの登録リストに対して **バイト単位** で照合されます — 末尾スラッシュの正規化なし、パスプレフィックス一致なし、ワイルドカードなし。この厳格さは意図的です: open-redirect バグや「`https://app.example.com/` のサブパスならどれでも」式の登録は、コードを攻撃者が制御する URL に漏らす経路として何度も悪用されてきました。RFC 9700 §2.1 が完全一致を要求しており、本ライブラリも強制します。`/token` では RP が `/authorize` で送ったのと *同じ* `redirect_uri` を再送する必要があり、ずれると `invalid_grant` を返します。
:::

::: details `response_type=code` とは
**`response_type=code`** は **認可コードフロー** を要求します — OP がリダイレクトで短寿命の `code` を返し、RP がそれを `/token` で実トークンに交換するパターンです。代替の `token`、`id_token token`、`code id_token` などは古い hybrid / implicit フローで、OAuth 2.0 BCP（RFC 9700）が非推奨としています。本ライブラリは `code` を正規経路として実装し、hybrid 形式は互換性のためのオプトイン表面にとどめています — 新規構築向けではありません。
:::

::: details PAR とは何か、いつ必要になるか
**PAR**（Pushed Authorization Requests、RFC 9126）は、RP が authorize パラメータを *先に* サーバ側の `/par` エンドポイントに POST し、短寿命の `request_uri` を受け取って、ブラウザは `?client_id=...&request_uri=...` だけでリダイレクトする方式です。利点:

- リクエスト全体がブラウザ履歴・サーバログ・referrer に残らない。
- ユーザエージェント境界での改竄が無効化される — そこに露出するのは `request_uri` だけ。
- FAPI 2.0 Baseline では必須。それ以外でもオプトインする価値あり。

`op.WithFeature(feature.PAR)` で有効化すると、discovery 文書の `pushed_authorization_request_endpoint` に出ます。
:::

## PKCE が防ぐもの

::: details 解説: PKCE が防ぐ攻撃
PKCE が無いと、同一デバイスで `myapp://` の URI ハンドラを乗っ取った悪意あるアプリが認可コードのリダイレクトを傍受できます:

1. ユーザが正規 RP でログイン。OP が `myapp://callback` に `code=abc` を発行。
2. 悪意アプリがリダイレクトを傍受し（race condition または universal-link なりすまし）、`code=abc` を読む。
3. 悪意アプリが `code=abc` を `/token` に投げ、トークンを得る。

PKCE はコードを **正規 RP のみが知る秘密** にバインドします:

1. 正規 RP がランダム `code_verifier` を生成し、`/authorize` には `SHA256(code_verifier)`（`code_challenge`）のみを送る。
2. OP は発行コードと一緒に `code_challenge` を保存。
3. `/token` で OP は `code_verifier` を要求し、SHA-256 を再計算。
4. 悪意アプリは code を見ても verifier を見ていない — `/token` 呼び出しは失敗。

これは RP がクライアントシークレットを保管できないケース（SPA / ネイティブ）でも機能します。
:::

## 本ライブラリでの強制方法

| 挙動 | 場所 |
|---|---|
| `code_challenge_method=plain` は **拒否**（`S256` のみ受理）。 | `internal/pkce` |
| クライアントの `RequiresPKCE` が true（public client のデフォルト、FAPI 2.0 では強制）の場合、`code_challenge` 無しは拒否。 | `internal/authorize` |
| `code_verifier` の長さ / 文字集合は RFC 7636 §4.1 に対して検証。 | `internal/pkce` |
| ミスマッチは `/token` で RFC 6749 §5.2 の `invalid_grant` を返す（`/authorize` ではなく）。 | `internal/tokenendpoint/authcode.go` |

## よくあるエラーと意味

| エラー | 原因 | 対処 |
|---|---|---|
| `invalid_request` `code_challenge_method` | クライアントが `plain` を送った | `S256` を送る |
| `invalid_request_uri` | PAR `request_uri` の期限切れ / 消費済み | 新しい PAR を発行 |
| `invalid_grant`（`/token`） | `code_verifier` 不一致、または code が使用済 / 期限切れ | code を再利用しない、再生成 |
| `invalid_grant`（`/token`） | `/token` の `redirect_uri` が `/authorize` と異なる | バイト単位で同一にする |

## 自分でフローを動かす

`examples/03-fapi2` は PAR + JAR + DPoP + PKCE をひとつの構成にまとめた FAPI 2.0 Baseline OP を起動します。OFCS conformance suite は同じシーケンスを 2 つの FAPI plan にわたって約 129 module 実行します。[OFCS 適合状況](/ja/compliance/ofcs) に内訳があります。

## 次に読むもの

- [送信者制約 (DPoP / mTLS)](/ja/concepts/sender-constraint) — PKCE を「アクセストークンはそれを得たクライアントだけが使える」に格上げする方法。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — アクセストークンが期限切れになったら何をするか。
