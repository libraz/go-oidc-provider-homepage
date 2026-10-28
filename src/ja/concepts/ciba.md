---
title: CIBA — Client-Initiated Backchannel Authentication
description: CIBA の poll 方式で POS などの別経路承認を実現 — 検証済み hint、binding_message、組み込み側の認証デバイス連携を扱う。
pageClass: pg-concepts-ciba
---

# CIBA — Client-Initiated Backchannel Authentication

CIBA は [device flow](/ja/concepts/device-code) とは別の形の問題を解きます。device code は 2 つの面が「画面に表示された短いコード」を介して OP で合流します。**CIBA** ではリクエストを開始する装置がそもそも **ユーザに見えていない** — 組み込み側の通知サービスが、ユーザがすでに信頼している **別の認証デバイス** に要求を届けます。

代表的な構成:

- **利用デバイス（consumption device）** — POS 端末、コールセンタの操作画面、店内 kiosk、銀行の振込承認パネル等。**誰** であるべきかは知っている（ロイヤリティカード、電話番号、口座番号）が、認証する手段はない。
- **認証デバイス（authentication device）** — ユーザのスマホで、銀行アプリがすでにインストール・サインイン済み。組み込み側の通知サービスが「Acme Coffee で 800 円を承認しますか？」などの要求を表示し、ユーザは **承認 / 拒否** をタップする。

利用デバイスはユーザに credential を一切聞きません — OP に「Alice にスマホで承認してもらってください」と頼むだけです。

::: details このページで触れる仕様
- [OpenID Connect Client-Initiated Backchannel Authentication Flow — Core 1.0](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html) — CIBA Core 仕様
- [FAPI-CIBA-ID1](https://openid.net/specs/openid-financial-api-ciba-ID1.html) — FAPI 1.0 を基礎とし、mTLS 時代の送信者制約を使う旧プロファイル。本ライブラリの `profile.FAPICIBA` は DPoP も認めるため、設定だけで ID1 への適合は示せません。
:::

::: details 用語の補足
- **`auth_req_id`** — `/bc-authorize` の応答として返る不透明な識別子。利用デバイスはこれを使って `/token` を poll し、認証デバイスはこれに対して承認する。
- **Hint** — 利用デバイスが OP に **どのユーザ** を聞くかを伝える方法。CIBA Core §7.1 で 3 種類が定義されている:
  - `login_hint` — 組み込み側が subject にマップする不透明値（`alice@example.com`、口座番号など）。
  - `id_token_hint` — 過去に発行された ID トークン。`sub` claim でユーザを識別する。
  - `login_hint_token` — 組み込み側が署名検証してから subject にマップする署名付き JWT（別の上流システムが発行したものなど）。
- **配信モード** — OP が承認を利用デバイスに伝える方法:
  - **poll** — デバイスが `auth_req_id` で `/token` を poll します。本ライブラリが実装している配信モードはこれだけです。
:::

## フローの動き方（poll mode）

<figure class="fig">
  <div class="fig-head">OP がスマホに働きかけ、端末は poll するだけ</div>
  <svg class="fig-svg" role="img" aria-labelledby="ciba-poll-title" viewBox="0 0 960 872" xmlns="http://www.w3.org/2000/svg">
    <title id="ciba-poll-title">CIBA の poll モードを示した図。POS 端末が backchannel authentication エンドポイントを呼び、OP が login hint を subject に解決し、組み込み側の通知サービスがスタッフのスマホへ届け、端末はユーザが承認するまでトークンエンドポイントを poll します。</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="336" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">要求を開始する</text>
    <rect class="fg-group" x="32" y="464" width="896" height="382" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="492">承認を待つ</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="848"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="848"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="848"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">POS 端末</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">利用デバイス</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">スタッフのスマホ</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">認証デバイス</text>
    <!-- backchannel request -->
    <path class="fg-edge" d="M192,206 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="172" text-anchor="middle">POST /bc-authorize</text>
    <text class="fg-mxs" x="352" y="194" text-anchor="middle">login_hint · binding_message</text>
    <!-- hint resolution -->
    <path class="fg-edge fg-edge--accent" d="M512,246 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="252">hint を subject に解決</text>
    <text class="fg-mxs" x="568" y="274">HintResolver → subject</text>
    <!-- notification -->
    <path class="fg-edge" d="M512,344 H824" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="310" text-anchor="middle">通知サービス</text>
    <text class="fg-mxs" x="668" y="332" text-anchor="middle">Acme Coffee: 800 円を承認?</text>
    <!-- auth_req_id -->
    <path class="fg-edge fg-edge--accent" d="M512,416 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="382" text-anchor="middle">200 · auth_req_id</text>
    <text class="fg-mxs" x="352" y="404" text-anchor="middle">expires_in: 600 · interval: 5</text>
    <!-- poll -->
    <path class="fg-edge" d="M192,566 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="532" text-anchor="middle">POST /token · poll</text>
    <text class="fg-mxs" x="352" y="554" text-anchor="middle">grant_type=…:ciba</text>
    <!-- pending -->
    <path class="fg-edge fg-edge--muted" d="M512,622 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="352" y="612" text-anchor="middle">400 · authorization_pending</text>
    <!-- approval -->
    <path class="fg-edge" d="M824,694 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="660" text-anchor="middle">ユーザがスマホ上で承認</text>
    <text class="fg-mxs" x="668" y="682" text-anchor="middle">approve(auth_req_id)</text>
    <!-- next poll -->
    <path class="fg-edge" d="M192,750 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="740" text-anchor="middle">POST /token · 次の poll</text>
    <!-- tokens -->
    <path class="fg-edge fg-edge--accent" d="M512,822 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="788" text-anchor="middle">200 · access_token</text>
    <text class="fg-mxs" x="352" y="810" text-anchor="middle">id_token · refresh_token?</text>
  </svg>
  <figcaption class="fig-note">端末とスマホは互いに通信しません。両者が触れるのは OP だけです。<code>binding_message</code> が重要なのはそのためで、端末の前にいる人とスマホを持つ人が突き合わせられる唯一の文字列がこれです。</figcaption>
</figure>

利用デバイスはユーザの credential を持ちません。ユーザは利用デバイスに何も打ちません。認証デバイス — ユーザが銀行アプリにサインイン済みなのですでに認証されている — だけが consent を行使する場所になります。

## CIBA と Device Code — どちらを選ぶか

両方とも 2 デバイスです。違いは **「利用デバイスが聞いていることをユーザが知っているか」** です。

| | Device Code | CIBA |
|---|---|---|
| **誰が信頼を起こす?** | ユーザが認証ページに `user_code` を打ち込む | 利用デバイスが OP に要求し、組み込み側の認証デバイスサービスが表示する |
| **ユーザは URL を発見する必要がある?** | はい — `verification_uri` が画面に出る | いいえ — 配備側が認証デバイスをあらかじめ把握している |
| **利用デバイス側の信頼モデル** | 匿名のデバイスがユーザに「結びつけて」とお願いする | 事前登録されたデバイスが、OP 経由でユーザに「確認して」とお願いする |
| **代表的な利用面** | スマート TV、ゲーム機、CLI、IoT 機器のペアリング | POS、コールセンタ、不正検知の確認、アプリ内決済 |
| **ユーザが打つ識別子** | `user_code`（`BDWP-HQPK` 等） | なし — OP はすでにユーザ識別子を持っている（`login_hint`） |
| **誤誘導のリスク** | 低 — URL がデバイス画面に出ている | 中 — 別経路の通知文言が利用面と一致しているとユーザが信頼する必要がある。**`binding_message`** を使ってスマホ側プロンプトに POS の要求内容を表示すること |

ユーザが **デバイスの目の前にいて** デバイスがコード表示できないなら CIBA。ユーザが **デバイスから離れていて** デバイスが画面を持っているなら device code。CIBA の認証デバイスは事前にユーザを知っている必要があり、device code の verification ページは任意のサインイン済みブラウザセッションで動きます。

## Hint — 「どのユーザか」を OP に伝える

利用デバイスはユーザを認証できないので、OP に **どのユーザを承認サービスの対象にするか** を伝える必要があります。CIBA Core §7.1 は 3 種類の hint を定義しており、OP は単一の `HintResolver` interface でそれら全てを受け付けます:

```go
op.WithCIBA(
    op.WithCIBAHintResolver(op.HintResolverFunc(
        func(ctx context.Context, kind op.HintKind, value string) (string, error) {
            switch kind {
            case op.HintLoginHint:
                // value = "alice"、"alice@example.com"、口座番号など。
                return resolveLoginHint(ctx, value)
            case op.HintIDTokenHint:
                // value は raw JWT ではなく、OP が検証した subject です。
                // OP は署名、issuer、認証済みクライアントの audience を検証しますが、
                // CIBA hint では exp を意図的に検証しません。
                return lookupSubject(ctx, value)
            case op.HintLoginHintToken:
                // value = 信頼している別システムが発行した署名付き JWT。
                return verifyAndMap(ctx, value)
            }
            return "", op.ErrUnknownCIBAUser
        },
    )),
)
```

`op.ErrUnknownCIBAUser` を返すと、通信路上の応答は `unknown_user_id` に丸められます。それ以外のエラーは `login_required` になります。`op.WithCIBA` をリゾルバ未指定で呼ぶと `op.New` は構築に失敗します — リゾルバは必須です。

`HintIDTokenHint` では、OP が自分の鍵、issuer、認証済みクライアントの audience に対して JWT を検証し、検証済みの `sub` だけを `Resolve` に渡します。`exp` は意図的に検証しません。`typ` ヘッダが無い、または `JWT` 以外のトークンは拒否するので、logout token やアクセストークンを hint として通すことはできません。pairwise subject を登録したクライアントは、sector ごとの `sub` を元の subject に戻せないため `Resolve` の前に拒否されます。そのクライアントは `login_hint` または `login_hint_token` を使ってください。resolver で raw JWT を parse してはなりません。

## binding_message — 誤誘導を防ぐ項目

CIBA の `binding_message` は利用デバイスが `/bc-authorize` 時に送れる短い文字列です。OP はこれを認証デバイスに転送し、ユーザのスマホ側プロンプトにレジ係が POS で見ているのと同じ文言を表示できます:

> **Acme POS 端末 #14**: Acme Coffee で 800 円を承認しますか?
>
> [ 承認 ] [ 拒否 ]

`binding_message` がないと、ユーザは OP の汎用プロンプトしか頼りになりません。「異常なアクティビティを検知しました。この通知を承認してください」のような phishing がはるかに通りやすくなります。仕様上は optional ですが、組み込み側の UX では **必須** として扱ってください。

OP が受け付けるのは 50 文字までで、制御文字は拒否します（`400 invalid_binding_message`）。文字列は受け取ったとおりに転送し、HTML エスケープはしません。両方のデバイスで同じ文言を表示できるようにするためです。表示先に合わせたエスケープは組み込み側で行ってください。

## 各エンドポイントの応答

`/bc-authorize` はリクエストの時点で次のように拒否します。

| 条件 | 応答 |
|---|---|
| hint が解決できない（`op.ErrUnknownCIBAUser`） | `400 unknown_user_id` |
| リゾルバがそれ以外のエラーを返した | `login_required` |
| pairwise クライアントからの `id_token_hint` | `400 invalid_request` |
| `binding_message` が長すぎる、または制御文字を含む | `400 invalid_binding_message` |
| `user_code` または `client_notification_token` が付いている | `400 invalid_request`（どちらも未対応） |
| `requested_expiry` が正の整数でない、または `profile.FAPICIBA` 下で 10 分を超える | `400 invalid_request`（FAPI-CIBA 以外で `WithCIBAMaxExpiresIn` を超える値は切り詰められる） |
| クライアントの JWKS を取得できない request object | `503` |

`grant_type=urn:openid:params:grant-type:ciba` の `/token` は、[device flow](./device-code) と同じ 4 つの polling コードで応答します。`authorization_pending`、`slow_down`、`access_denied`（認証デバイスで拒否された、または `slow_down` 違反が 5 回）、`expired_token` です。

`auth_req_id` の有効期間は既定で 600 秒（`requested_expiry` で短縮可能）、`interval` は 5 秒です。`op.WithCIBADefaultExpiresIn`、`op.WithCIBAMaxExpiresIn`、`op.WithCIBAPollInterval` で調整できます。負の値、および `profile.FAPICIBA` 下での 10 分を超える有効期間は、`op.New` が失敗します。

承認されたリクエストを引き換える時点で、OP は device flow と同様にそのクライアントへの同意の grant を記録します。introspection と `/userinfo` は公開（pairwise）subject を返し、subject の失効でトークンも失効し、同じ scope での後続の `/auth` では同意画面が省略されます。

## 動かしてみる

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) は完全な POS シナリオを実演します。POS が `/bc-authorize` に POST、スタッフのスマホ（`CIBARequestStore.Approve` を直接呼ぶ goroutine でシミュレート）が承認、POS が token 発行まで poll します。end-to-end で 5 秒程度です。

```sh
(cd examples/32-ciba-pos && GOWORK=off go run -tags example .)
```

example はロール別ファイルに分割されています（`op.go` で OP の組み立て + `HintResolver`、`rp.go` で POS 側の polling、`device.go` でスマホ承認のシミュレーション）。

## 続きはこちら

- [ユースケース: CIBA の組み込み](/ja/use-cases/ciba) — `op.WithCIBA`、`HintResolver` の契約、FAPI-CIBA プロファイル制約、組み込み側の認証デバイスコールバックが `CIBARequestStore.Approve` に応答する手順。
- [認可コード + PKCE](/ja/concepts/authorization-code-pkce) — ユーザがクライアントの目の前にいるときに使うフロー。
- [Device Code 入門](/ja/concepts/device-code) — 「ユーザが別の利用面にいる」という同系統の概念。コード表示を使う方式。
