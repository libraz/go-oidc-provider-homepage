---
title: 認可コード + PKCE フロー
description: 最も使われる OIDC フローを最初から最後まで、シーケンス図とパラメータ用語集で解説。
pageClass: pg-concepts-authorization-code-pkce
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

<figure class="fig">
  <div class="fig-head">認可コードフロー + PKCE — ブラウザから API まで</div>
  <svg class="fig-svg" role="img" aria-labelledby="acpkce-seq-title" viewBox="0 0 960 924" xmlns="http://www.w3.org/2000/svg">
    <title id="acpkce-seq-title">認可コードフローと PKCE を 4 つの段階で示した図。RP が組み立てる認可リクエスト、OP が実行する認証と同意、PKCE の verifier を検証するトークン交換、その後のリソースアクセスの順に並んでいます。</title>
    <!-- 段階の帯 -->
    <rect class="fg-group" x="30" y="68" width="916" height="164" rx="8"/>
    <rect class="fg-group" x="30" y="240" width="916" height="246" rx="8"/>
    <rect class="fg-group" x="30" y="494" width="916" height="258" rx="8"/>
    <rect class="fg-group" x="30" y="760" width="916" height="152" rx="8"/>
    <text class="fg-lbl" x="42" y="86">1 · 認可リクエスト</text>
    <text class="fg-lbl" x="42" y="258">2 · 認証と同意</text>
    <text class="fg-lbl" x="42" y="512">3 · トークン交換</text>
    <text class="fg-lbl" x="42" y="778">4 · リソースアクセス</text>
    <!-- ライフライン -->
    <line class="fg-life" x1="110" y1="62" x2="110" y2="912"/>
    <line class="fg-life" x1="330" y1="62" x2="330" y2="912"/>
    <line class="fg-life fg-life--accent" x1="570" y1="62" x2="570" y2="912"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="912"/>
    <!-- 登場人物 -->
    <rect class="fg-box" x="34" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="110" y="35" text-anchor="middle">ユーザ</text>
    <text class="fg-xs" x="110" y="49" text-anchor="middle">ブラウザ</text>
    <rect class="fg-box" x="254" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="330" y="35" text-anchor="middle">Relying Party</text>
    <text class="fg-xs" x="330" y="49" text-anchor="middle">web アプリ</text>
    <rect class="fg-box fg-box--accent" x="490" y="16" width="160" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="570" y="35" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="570" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="754" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">Resource Server</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">API サーバ</text>
    <!-- 段階 1 -->
    <rect class="fg-box fg-box--sub" x="236" y="94" width="320" height="36" rx="6"/>
    <text class="fg-t2" x="396" y="110" text-anchor="middle">RP が PKCE ペアを生成</text>
    <text class="fg-mxs" x="396" y="123" text-anchor="middle">code_challenge = S256(code_verifier)</text>
    <circle class="fg-badge" cx="15" cy="152" r="8.5"/>
    <text class="fg-badge-t" x="15" y="155" text-anchor="middle">1</text>
    <path class="fg-edge" d="M110,152 H330" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="220" y="146" text-anchor="middle">アプリを開く</text>
    <circle class="fg-badge" cx="15" cy="192" r="8.5"/>
    <text class="fg-badge-t" x="15" y="195" text-anchor="middle">2</text>
    <path class="fg-edge" d="M330,192 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="220" y="172" text-anchor="middle">302 で OP へ</text>
    <text class="fg-mxs" x="220" y="185" text-anchor="middle">/authorize · code_challenge · state · nonce</text>
    <circle class="fg-badge" cx="15" cy="220" r="8.5"/>
    <text class="fg-badge-t" x="15" y="223" text-anchor="middle">3</text>
    <path class="fg-edge" d="M110,220 H570" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="400" y="214" text-anchor="middle">GET /authorize</text>
    <!-- 段階 2 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="274" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="277" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M570,266 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="612" y="270">リクエストを検証</text>
    <text class="fg-mxs" x="612" y="283">redirect_uri 完全一致 · client_id · S256</text>
    <circle class="fg-badge" cx="15" cy="308" r="8.5"/>
    <text class="fg-badge-t" x="15" y="311" text-anchor="middle">5</text>
    <path class="fg-edge" d="M570,308 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo" x="400" y="302" text-anchor="middle">200 ログイン画面</text>
    <circle class="fg-badge" cx="15" cy="338" r="8.5"/>
    <text class="fg-badge-t" x="15" y="341" text-anchor="middle">6</text>
    <path class="fg-edge" d="M110,338 H570" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="400" y="332" text-anchor="middle">POST 認証情報</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="364" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="367" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M570,356 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="612" y="360">ユーザを認証</text>
    <text class="fg-xs" x="612" y="373">password · passkey · ステップアップ MFA</text>
    <circle class="fg-badge" cx="15" cy="398" r="8.5"/>
    <text class="fg-badge-t" x="15" y="401" text-anchor="middle">8</text>
    <path class="fg-edge" d="M570,398 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo" x="400" y="392" text-anchor="middle">200 同意画面</text>
    <circle class="fg-badge" cx="15" cy="428" r="8.5"/>
    <text class="fg-badge-t" x="15" y="431" text-anchor="middle">9</text>
    <path class="fg-edge" d="M110,428 H570" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="400" y="422" text-anchor="middle">POST 同意</text>
    <circle class="fg-badge" cx="15" cy="468" r="8.5"/>
    <text class="fg-badge-t" x="15" y="471" text-anchor="middle">10</text>
    <path class="fg-edge" d="M570,468 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo" x="400" y="448" text-anchor="middle">302 で redirect_uri へ</text>
    <text class="fg-mxs fg-halo" x="400" y="461" text-anchor="middle">code · state</text>
    <!-- 段階 3 -->
    <circle class="fg-badge" cx="15" cy="536" r="8.5"/>
    <text class="fg-badge-t" x="15" y="539" text-anchor="middle">11</text>
    <path class="fg-edge" d="M110,536 H330" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="220" y="530" text-anchor="middle">GET /callback?code&amp;state</text>
    <circle class="fg-badge" cx="15" cy="564" r="8.5"/>
    <text class="fg-badge-t" x="15" y="567" text-anchor="middle">12</text>
    <path class="fg-edge" d="M330,556 h30 v16 h-30" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="372" y="560">state を検証</text>
    <text class="fg-xs" x="372" y="573">手順 2 で保存した値と一致すること</text>
    <circle class="fg-badge" cx="15" cy="608" r="8.5"/>
    <text class="fg-badge-t" x="15" y="611" text-anchor="middle">13</text>
    <path class="fg-edge" d="M330,608 H570" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="450" y="588" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="450" y="601" text-anchor="middle">code · code_verifier · client auth</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="636" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="639" text-anchor="middle">14</text>
    <path class="fg-edge fg-edge--accent" d="M570,628 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="612" y="632">PKCE を検証</text>
    <text class="fg-mxs" x="612" y="645">S256(code_verifier) == code_challenge</text>
    <circle class="fg-badge" cx="15" cy="680" r="8.5"/>
    <text class="fg-badge-t" x="15" y="683" text-anchor="middle">15</text>
    <path class="fg-edge" d="M570,680 H330" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="450" y="660" text-anchor="middle">200 OK</text>
    <text class="fg-mxs" x="450" y="673" text-anchor="middle">access_token · id_token · refresh_token</text>
    <circle class="fg-badge" cx="15" cy="708" r="8.5"/>
    <text class="fg-badge-t" x="15" y="711" text-anchor="middle">16</text>
    <path class="fg-edge" d="M330,700 h30 v16 h-30" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="372" y="704">ID Token を検証</text>
    <text class="fg-mxs" x="372" y="717">iss · aud · exp · nonce</text>
    <circle class="fg-badge" cx="15" cy="740" r="8.5"/>
    <text class="fg-badge-t" x="15" y="743" text-anchor="middle">17</text>
    <path class="fg-edge" d="M330,740 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="220" y="734" text-anchor="middle">session cookie を設定</text>
    <!-- 段階 4 -->
    <circle class="fg-badge" cx="15" cy="802" r="8.5"/>
    <text class="fg-badge-t" x="15" y="805" text-anchor="middle">18</text>
    <path class="fg-edge" d="M110,802 H330" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="220" y="796" text-anchor="middle">GET /api/me</text>
    <circle class="fg-badge" cx="15" cy="842" r="8.5"/>
    <text class="fg-badge-t" x="15" y="845" text-anchor="middle">19</text>
    <path class="fg-edge" d="M330,842 H830" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="580" y="822" text-anchor="middle">GET /api/me</text>
    <text class="fg-mxs fg-halo" x="580" y="835" text-anchor="middle">Authorization: Bearer …</text>
    <circle class="fg-badge" cx="15" cy="874" r="8.5"/>
    <text class="fg-badge-t" x="15" y="877" text-anchor="middle">20</text>
    <path class="fg-edge fg-edge--muted" d="M830,874 H570" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="700" y="856" text-anchor="middle">任意</text>
    <text class="fg-mxs" x="700" y="868" text-anchor="middle">introspect · または JWT を自己検証</text>
    <circle class="fg-badge" cx="15" cy="902" r="8.5"/>
    <text class="fg-badge-t" x="15" y="905" text-anchor="middle">21</text>
    <path class="fg-edge" d="M830,902 H330" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="580" y="896" text-anchor="middle">200 { user data }</text>
  </svg>
  <figcaption class="fig-note">OP が単独で処理するのは手順 4・7・14 だけで、残りはすべて二者間のやり取りです。PKCE の効果は手順 14 に現れます。<code>/token</code> に提示された認可コードは、手順 2 で送った challenge に対応する verifier を持つ相手にしか通りません。</figcaption>
</figure>

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

RP が ID トークンを検証するなら、両方使ってください。OIDC は ID トークンを含む response type で `nonce` を必須にします。本ライブラリが受け付けるのは `response_type=code` だけで、hybrid / implicit の response type は認可フロー開始前に拒否します。
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
**`response_type=code`** は **認可コードフロー** を要求します — OP がリダイレクトで短寿命の `code` を返し、RP がそれを `/token` で実トークンに交換するパターンです。代替の `token`、`id_token token`、`code id_token` などは古い hybrid / implicit フローで、OAuth 2.0 BCP（RFC 9700）が非推奨としています。本ライブラリは `code` だけをサポートし、それ以外の response type はすべて拒否します。
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

- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — PKCE を「アクセストークンはそれを得たクライアントだけが使える」に格上げする方法。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — アクセストークンが期限切れになったら何をするか。
