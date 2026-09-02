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
- [FAPI-CIBA-ID1](https://openid.net/specs/openid-financial-api-ciba-ID1.html) — JAR + DPoP/mTLS + access TTL 10 分上限を必須化する FAPI プロファイル
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
  <div class="fig-head">CIBA の poll モード</div>
  <svg class="fig-svg" role="img" aria-labelledby="ciba-poll-title" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg">
    <title id="ciba-poll-title">CIBA の poll モードを示した図。POS 端末が backchannel authentication エンドポイントを呼び、OP が login hint を subject に解決し、組み込み側の通知サービスがスタッフのスマホへ届け、端末はユーザが承認するまでトークンエンドポイントを poll します。</title>
    <!-- ライフライン -->
    <line class="fg-life" x1="150" y1="62" x2="150" y2="524"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="524"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="524"/>
    <!-- 登場人物 -->
    <rect class="fg-box" x="50" y="16" width="200" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">利用デバイス</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">POS 端末</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="730" y="16" width="200" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">認証デバイス</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">スタッフのスマホ</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="96" r="8.5"/>
    <text class="fg-badge-t" x="15" y="99" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,96 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="325" y="76" text-anchor="middle">POST /bc-authorize</text>
    <text class="fg-mxs" x="325" y="89" text-anchor="middle">login_hint=alice · scope=openid · binding_message</text>
    <!-- 2 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="126" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="129" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,118 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="542" y="122">hint を subject に解決する</text>
    <text class="fg-mxs" x="542" y="135">HintResolver → sub=alice123</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="184" r="8.5"/>
    <text class="fg-badge-t" x="15" y="187" text-anchor="middle">3</text>
    <path class="fg-edge" d="M500,184 H830" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="665" y="164" text-anchor="middle">組み込み側の通知サービスが届ける</text>
    <text class="fg-mxs" x="665" y="177" text-anchor="middle">「Acme Coffee で 800 円を承認?」</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="216" r="8.5"/>
    <text class="fg-badge-t" x="15" y="219" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M500,216 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="210" text-anchor="middle">200 · { auth_req_id, expires_in: 600, interval: 5 }</text>
    <!-- par フラグメント -->
    <rect class="fg-frame" x="44" y="242" width="896" height="196" rx="8"/>
    <rect class="fg-box fg-box--muted" x="44" y="242" width="52" height="18" rx="4"/>
    <text class="fg-tab" x="56" y="255">par</text>
    <line class="fg-rule fg-rule--dashed" x1="44" y1="362" x2="940" y2="362"/>
    <!-- loop フラグメント -->
    <rect class="fg-frame" x="64" y="272" width="600" height="80" rx="6"/>
    <rect class="fg-box fg-box--muted" x="64" y="272" width="176" height="18" rx="4"/>
    <text class="fg-tab" x="76" y="285">loop · interval 秒ごと</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="308" r="8.5"/>
    <text class="fg-badge-t" x="15" y="311" text-anchor="middle">5</text>
    <path class="fg-edge" d="M150,308 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="325" y="302" text-anchor="middle">POST /token · grant_type=…:ciba · auth_req_id</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="338" r="8.5"/>
    <text class="fg-badge-t" x="15" y="341" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--muted" d="M500,338 H150" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="325" y="332" text-anchor="middle">400 · { error: authorization_pending }</text>
    <!-- 7 -->
    <text class="fg-xs" x="76" y="386">その間、別チャネルでユーザがスマホ上で承認する</text>
    <circle class="fg-badge" cx="15" cy="416" r="8.5"/>
    <text class="fg-badge-t" x="15" y="419" text-anchor="middle">7</text>
    <path class="fg-edge" d="M830,416 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="410" text-anchor="middle">approve(auth_req_id, sub=alice123)</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="472" r="8.5"/>
    <text class="fg-badge-t" x="15" y="475" text-anchor="middle">8</text>
    <path class="fg-edge" d="M150,472 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="466" text-anchor="middle">POST /token — 次の poll</text>
    <!-- 9 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="510" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="513" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M500,510 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="504" text-anchor="middle">200 · { access_token, id_token, refresh_token? }</text>
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

`HintIDTokenHint` では、OP が自分の鍵、issuer、認証済みクライアントの audience に対して JWT を検証し、検証済みの `sub` だけを `Resolve` に渡します。`exp` は意図的に検証しません。pairwise subject を登録したクライアントは、sector ごとの `sub` を元の subject に戻せないため `Resolve` の前に拒否されます。そのクライアントは `login_hint` または `login_hint_token` を使ってください。resolver で raw JWT を parse してはなりません。

## binding_message — 誤誘導を防ぐ項目

CIBA の `binding_message` は利用デバイスが `/bc-authorize` 時に送れる短い文字列です。OP はこれを認証デバイスに転送し、ユーザのスマホ側プロンプトにレジ係が POS で見ているのと同じ文言を表示できます:

> **Acme POS 端末 #14**: Acme Coffee で 800 円を承認しますか?
>
> [ 承認 ] [ 拒否 ]

`binding_message` がないと、ユーザは OP の汎用プロンプトしか頼りになりません。「異常なアクティビティを検知しました。この通知を承認してください」のような phishing がはるかに通りやすくなります。仕様上は optional ですが、組み込み側の UX では **必須** として扱ってください。

## 動かしてみる

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) は完全な POS シナリオを実演します。POS が `/bc-authorize` に POST、スタッフのスマホ（`CIBARequestStore.Approve` を直接呼ぶ goroutine でシミュレート）が承認、POS が token 発行まで poll します。end-to-end で 5 秒程度です。

```sh
(cd examples/32-ciba-pos && GOWORK=off go run -tags example .)
```

example はロール別ファイルに分割されています（`op.go` で OP の組み立て + `HintResolver`、`rp.go` で POS 側の polling、`device.go` でスマホ承認のシミュレーション）。

## 続きはこちら

- [使い方: CIBA の組み込み](/ja/use-cases/ciba) — `op.WithCIBA`、`HintResolver` の契約、FAPI-CIBA プロファイル制約、組み込み側の認証デバイスコールバックが `CIBARequestStore.Approve` に応答する手順。
- [Device Code 入門](/ja/concepts/device-code) — 「ユーザが別の利用面にいる」という同系統の概念。コード表示を使う方式。
