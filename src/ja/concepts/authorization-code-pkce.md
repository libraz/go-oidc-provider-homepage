---
title: 認可コード + PKCE フロー
description: 最も使われる OIDC フローを最初から最後まで、シーケンス図とパラメータ用語集で解説。
pageClass: pg-concepts-authorization-code-pkce
---

# 認可コード + PKCE

Web アプリ、モバイルアプリ、SPA、デスクトップアプリで人がログインするときの標準フローです。RP がブラウザを OP に向かわせ、ユーザは OP 上でサインインして同意し、戻ってきた 1 回限りの `code` を RP が `/token` でトークンに交換します。

PKCE（Proof Key for Code Exchange、RFC 7636）は、その `code` をフローを始めたクライアントに結び付けます。本ライブラリは、公開クライアント（public client）とネイティブアプリ、および `Baseline`・`FAPI2Baseline`・`FAPI2MessageSigning` プロファイル下のすべてのクライアントに PKCE を必須としています。公開クライアントが `code_challenge` を省略すると、`/auth` で `invalid_request` になります。`/token` でクライアント認証できない以上、verifier が唯一の本人証明だからです。既定プロファイルの confidential client は PKCE を省略できますが、新規構築では常に `S256` を送ってください。

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
  <div class="fig-head">リクエストと認可コードはブラウザが運ぶ</div>
  <svg class="fig-svg" role="img" aria-labelledby="acpkce-seq-title" viewBox="0 0 960 1040" xmlns="http://www.w3.org/2000/svg">
    <title id="acpkce-seq-title">認可コードフローと PKCE の前半を示した図。RP は PKCE ペアを生成してブラウザ経由でユーザを OP へ送り、OP はリクエストを検証し、ユーザを認証して同意を得たうえで、認可コードと state を付けて RP へ redirect します。</title>
    <rect class="fg-group" x="32" y="104" width="896" height="328" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">認可リクエスト</text>
    <rect class="fg-group" x="32" y="456" width="896" height="560" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="484">認証と同意</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="1016"/>
    <line class="fg-life" x1="512" y1="88" x2="512" y2="1016"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="1016"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Relying Party</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">web アプリ</text>
    <rect class="fg-box" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="512" y="50" text-anchor="middle">ユーザ</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">ブラウザ</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- phase 1 -->
    <path class="fg-edge" d="M512,184 H192" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="352" y="174" text-anchor="middle">アプリを開く</text>
    <path class="fg-edge" d="M192,224 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="230">PKCE ペアを生成</text>
    <text class="fg-mxs" x="248" y="252">code_challenge =</text>
    <text class="fg-mxs" x="248" y="274">S256(code_verifier)</text>
    <path class="fg-edge" d="M192,346 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="312" text-anchor="middle">302 → /auth</text>
    <text class="fg-mxs" x="352" y="334" text-anchor="middle">code_challenge · state · nonce</text>
    <path class="fg-edge" d="M512,408 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="398" text-anchor="middle">GET /auth</text>
    <!-- phase 2 -->
    <path class="fg-edge fg-edge--accent" d="M824,512 h-40 v24 h40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="768" y="518" text-anchor="end">リクエストを検証</text>
    <text class="fg-mxs" x="768" y="540" text-anchor="end">redirect_uri 完全一致</text>
    <text class="fg-mxs" x="768" y="562" text-anchor="end">client_id · S256</text>
    <path class="fg-edge" d="M824,626 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="616" text-anchor="middle">200 ログイン画面</text>
    <path class="fg-edge" d="M512,682 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="672" text-anchor="middle">POST credentials</text>
    <path class="fg-edge fg-edge--accent" d="M824,720 h-40 v24 h40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="768" y="726" text-anchor="end">ユーザを認証</text>
    <text class="fg-xs" x="768" y="748" text-anchor="end">password · passkey · MFA</text>
    <path class="fg-edge" d="M824,808 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="798" text-anchor="middle">200 同意画面</text>
    <path class="fg-edge" d="M512,864 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="854" text-anchor="middle">POST consent</text>
    <path class="fg-edge" d="M824,936 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="902" text-anchor="middle">302 → redirect_uri</text>
    <text class="fg-mxs" x="668" y="924" text-anchor="middle">code · state</text>
    <path class="fg-edge" d="M512,992 H192" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="982" text-anchor="middle">GET /callback?code&amp;state</text>
  </svg>
  <figcaption class="fig-note">OP は <code>redirect_uri</code>・<code>client_id</code>・S256 の challenge をログイン画面より先に検証するので、不正なリクエストはユーザに届きません。ここで RP から出るのは challenge だけで、verifier はトークン要求まで手元に残ります。</figcaption>
</figure>

<figure class="fig">
  <div class="fig-head">PKCE は認可コードを引き換える場所で検証される</div>
  <svg class="fig-svg" role="img" aria-labelledby="acpkce-seq2-title" viewBox="0 0 960 864" xmlns="http://www.w3.org/2000/svg">
    <title id="acpkce-seq2-title">認可コードフローと PKCE の後半を示した図。RP は state を検証し、PKCE の verifier とともに認可コードをトークンエンドポイントで引き換え、OP は先に受け取った challenge と verifier を照合してトークンを返し、RP はそのアクセストークンで RS を呼び出します。</title>
    <rect class="fg-group" x="32" y="104" width="896" height="440" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">トークン交換</text>
    <rect class="fg-group" x="32" y="568" width="896" height="272" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="596">リソースアクセス</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="840"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="840"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="840"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Relying Party</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">web アプリ</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Resource Server</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">API サーバ</text>
    <!-- phase 3 -->
    <path class="fg-edge" d="M192,152 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="158">state を検証</text>
    <text class="fg-xs" x="248" y="180">保存した値と一致すること</text>
    <path class="fg-edge" d="M192,256 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="222" text-anchor="middle">POST /token · client auth</text>
    <text class="fg-mxs" x="352" y="244" text-anchor="middle">code · code_verifier</text>
    <path class="fg-edge fg-edge--accent" d="M512,296 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="568" y="302">PKCE を検証</text>
    <text class="fg-mxs" x="568" y="324">S256(code_verifier)</text>
    <text class="fg-mxs" x="568" y="346">== code_challenge</text>
    <path class="fg-edge fg-edge--accent" d="M512,424 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="390" text-anchor="middle">200 OK</text>
    <text class="fg-mxs" x="352" y="412" text-anchor="middle">access_token · id_token</text>
    <path class="fg-edge" d="M192,464 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="470">ID Token を検証</text>
    <text class="fg-mxs" x="248" y="492">iss · aud · exp · nonce</text>
    <text class="fg-xs" x="248" y="514">その後 session cookie を設定</text>
    <!-- phase 4 -->
    <path class="fg-edge" d="M192,670 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="636" text-anchor="middle">GET /api/me</text>
    <text class="fg-mxs fg-halo" x="508" y="658" text-anchor="middle">Authorization: Bearer &lt;access_token&gt;</text>
    <path class="fg-edge fg-edge--muted" d="M824,742 H512" marker-end="url(#fg-am)"/>
    <text class="fg-m" x="668" y="708" text-anchor="middle">/introspect</text>
    <text class="fg-xs" x="668" y="730" text-anchor="middle">任意 · JWT を自己検証でも可</text>
    <path class="fg-edge" d="M824,814 H192" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="804" text-anchor="middle">200 OK · { data }</text>
  </svg>
  <figcaption class="fig-note">verifier が現れるのは <code>/token</code> のリクエストだけなので、リダイレクトで横取りされた認可コードはそれだけでは使えません。OP は先に見た challenge に対応する verifier を知る相手にしかコードを通しません。RP はログインを信頼する前に ID Token の <code>nonce</code> も確認します。</figcaption>
</figure>

## パラメータ用語集

本サイトでは認可エンドポイントを、ライブラリの既定である `/auth` と書きます。既定のルーティングでは OP は `/oidc` 配下にマウントされるため、実際の認可エンドポイントは `/oidc/auth`、トークンエンドポイントは `/oidc/token` です。

| パラメータ | 送信タイミング | 目的 |
|---|---|---|
| `response_type=code` | `/auth` | 認可コード grant を要求。 |
| `client_id` | `/auth`、`/token` | 登録済み RP を識別。 |
| `redirect_uri` | `/auth`（`/token` でも echo） | OP がユーザを戻す先。登録リストとの **完全一致**。 |
| `scope` | `/auth` | 要求権限。OIDC では `openid` を含むこと。 |
| `state` | `/auth` | RP がコールバックで echo する不透明値。redirect の CSRF 防御。 |
| `nonce` | `/auth` | ID トークンの `nonce` claim にバインドされるランダム値。replay 防御。 |
| `code_challenge` | `/auth` | `BASE64URL(SHA256(code_verifier))`。 |
| `code_challenge_method` | `/auth` | `S256`（本ライブラリが受理する唯一の値）。 |
| `code` | `/auth` レスポンス | 単発。有効期間は 60 秒。RFC 6749 §4.1.2 は上限 10 分を推奨。 |
| `code_verifier` | `/token` | `code_challenge` の原像。OP が SHA-256 を再計算。 |
| `grant_type=authorization_code` | `/token` | この grant を選択。 |
| Client auth | `/token` | `client_secret_basic` / `client_secret_post` / `private_key_jwt` / `none`（PKCE のみ）のいずれか。mTLS 送信者制約はトークンエンドポイントでのクライアント認証とは別です。 |

::: details `state` と `nonce` の違い
両方ともランダムな opaque 値で、両方とも replay 系攻撃を防ぎますが、守る経路が違います。

- **`state`** は **フロントチャネル**（ブラウザのクエリ文字列）を流れる値です。RP はリダイレクト前にユーザのセッションに保存し、コールバック時に突き合わせます。守るのは *リダイレクト* 経路の CSRF — 攻撃者が `/callback` に偽コールバックを投げてアプリに受理させる、を阻止します。
- **`nonce`** は **ID トークンの claim** に乗ります。RP はリダイレクト前にユーザセッションに保存し、トークン交換後に突き合わせます。守るのは *ID トークン* のリプレイ — 盗まれた ID トークンを別 RP で、あるいは同じ RP の別ログイン試行で再利用させない、を阻止します。

RP が ID トークンを検証するなら、両方使ってください。OIDC は ID トークンを含む response type で `nonce` を必須にします。本ライブラリが受け付けるのは `response_type=code` だけで、hybrid / implicit の response type は認可フロー開始前に拒否します。
:::

::: details `code_verifier` / `code_challenge` / `S256` とは
**`code_verifier`** は RP が生成して *自分だけが持っている* 推測困難なランダム文字列です。RFC 7636 §4.1 で 43〜128 文字の URL セーフ文字と定められています。

**`code_challenge`** は RP が `/auth` で OP に送る値です。`code_challenge_method=S256` の場合、`BASE64URL(SHA-256(code_verifier))` — つまり一方向ハッシュです。OP には逆算できず、後で `/token` に verifier 本体を送ったときに RP の所有を証明できる形になります。

**`S256`** は SHA-256 ベースの変換で、本ライブラリが受理する唯一の `code_challenge_method` です。古い `plain` 方式（challenge と verifier が同じ）は URL を読める攻撃者には何の保護にもならないので、RFC 9700 が新規構築での使用を禁止しています。
:::

::: details `redirect_uri` — 完全一致が必須な理由
`/auth` の `redirect_uri` は、クライアントの登録リストに対して **バイト単位** で照合されます — 末尾スラッシュの正規化なし、パスプレフィックス一致なし、ワイルドカードなし。この厳格さは意図的です: open-redirect バグや「`https://app.example.com/` のサブパスならどれでも」式の登録は、コードを攻撃者が制御する URL に漏らす経路として何度も悪用されてきました。RFC 9700 §2.1 が完全一致を要求しており、本ライブラリも強制します。`/token` では RP が `/auth` で送ったのと *同じ* `redirect_uri` を再送する必要があり、ずれると `invalid_grant` を返します。
:::

::: details `response_type=code` とは
**`response_type=code`** は **認可コードフロー** を要求します — OP がリダイレクトで短寿命の `code` を返し、RP がそれを `/token` で実トークンに交換するパターンです。代替の `token`、`id_token token`、`code id_token` などは古い hybrid / implicit フローで、OAuth 2.0 BCP（RFC 9700）が非推奨としています。本ライブラリは `code` だけをサポートし、それ以外の response type はすべて拒否します。
:::

::: details PAR とは何か、いつ必要になるか
**PAR**（Pushed Authorization Requests、RFC 9126）は、RP が authorize パラメータを *先に* サーバ側の `/par` エンドポイントに POST し、短寿命の `request_uri` を受け取って、ブラウザは `?client_id=...&request_uri=...` だけでリダイレクトする方式です。利点:

- リクエスト全体がブラウザ履歴・サーバログ・referrer に残らない。
- ユーザエージェント境界での改竄が無効化される — そこに露出するのは `request_uri` だけ。
- FAPI 2.0 Security Profile では必須です。FAPI 以外の認可コードクライアントにも推奨します。

`op.WithFeature(feature.PAR)` で有効化すると、discovery 文書の `pushed_authorization_request_endpoint` に出ます。
:::

## PKCE が防ぐもの

::: details 解説: PKCE が防ぐ攻撃
PKCE が無いと、同一デバイスで `myapp://` の URI ハンドラを乗っ取った悪意あるアプリが認可コードのリダイレクトを傍受できます:

1. ユーザが正規 RP でログイン。OP が `myapp://callback` に `code=abc` を発行。
2. 悪意アプリがリダイレクトを傍受し（race condition または universal-link なりすまし）、`code=abc` を読む。
3. 悪意アプリが `code=abc` を `/token` に投げ、トークンを得る。

PKCE はコードを **正規 RP のみが知る秘密** にバインドします:

1. 正規 RP がランダム `code_verifier` を生成し、`/auth` には `SHA256(code_verifier)`（`code_challenge`）のみを送る。
2. OP は発行コードと一緒に `code_challenge` を保存。
3. `/token` で OP は `code_verifier` を要求し、SHA-256 を再計算。
4. 悪意アプリは code を見ても verifier を見ていない — `/token` 呼び出しは失敗。

これは RP がクライアントシークレットを保管できないケース（SPA / ネイティブ）でも機能します。
:::

## 本ライブラリでの強制方法

| 挙動 | 場所 |
|---|---|
| `code_challenge_method=plain` は **拒否**（`S256` のみ受理）。 | `internal/pkce` |
| `code_challenge` が無い認可要求は、公開クライアントとネイティブアプリ、および `Baseline`・`FAPI2Baseline`・`FAPI2MessageSigning` 下のすべてのクライアントについて `invalid_request` で拒否。 | `internal/authorize` |
| `code_verifier` の長さ / 文字集合は RFC 7636 §4.1 に対して検証。 | `internal/pkce` |
| ミスマッチは `/token` で RFC 6749 §5.2 の `invalid_grant` を返す（`/auth` ではなく）。 | `internal/tokenendpoint/authcode.go` |
| challenge 無しで発行された公開クライアントの code は、verifier が付いていても `/token` で `invalid_grant` として拒否。 | `internal/tokenendpoint/authcode_enforce.go` |
| challenge 付きで発行された code は、一致する verifier が無い要求を拒否し、challenge 無しで発行された code はどんな verifier も拒否。 | `internal/grants/authcode` |
| クライアント違い、`redirect_uri` 違い、PKCE 検証失敗の要求は、code を消費せずに拒否。使用済みの code の 2 回目の引き換えだけがリプレイとみなされ、その grant のトークンを失効させる（RFC 6749 §4.1.2）。 | `internal/grants/authcode` |

## よくあるエラーと意味

| エラー | 原因 | 対処 |
|---|---|---|
| `invalid_request`（`/auth`） | PKCE が必要なクライアントで `code_challenge` が無い | `code_challenge_method=S256` と `code_challenge` を送る |
| `invalid_request` `code_challenge_method` | クライアントが `plain` を送った、または method が無い | `S256` を送る |
| `unsupported_response_type` | `response_type` が `code` ではない | `response_type=code` を使う |
| `invalid_request_uri` | PAR `request_uri` が未知 / 期限切れ / すでに code の発行に使用済み | 新しい PAR を発行 |
| `invalid_grant`（`/token`） | `code_verifier` 不一致、または code が未知 / 使用済み / 期限切れ | code を再利用せず、フローをやり直す |
| `invalid_grant`（`/token`） | `/token` の `redirect_uri` が `/auth` と異なる | バイト単位で同一にする |

## 自分でフローを動かす

`examples/01-minimal` が、このフローを 1 プロセスで動かします。公開クライアントを登録した OP と、`state`・`nonce`・PKCE のペアを生成して ID トークンを検証する小さな RP が立ち上がります。`demo` / `demo` でサインインし、ブラウザ上でリダイレクト URL を確認してみてください。`examples/03-fapi2` は同じフローを `FAPI2Baseline` 下で PAR、`private_key_jwt` クライアント認証、DPoP バインドのアクセストークンにより強化した例です。[OFCS の結果](/ja/compliance/ofcs) は、名前を明記した Implementer's Draft のテストプランを対象としています。

## 次に読むもの

- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — PKCE を「アクセストークンはそれを得たクライアントだけが使える」に格上げする方法。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — アクセストークンが期限切れになったら何をするか。
