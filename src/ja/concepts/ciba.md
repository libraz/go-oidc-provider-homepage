---
title: CIBA — Client-Initiated Backchannel Authentication
description: 利用面と認証面が分かれているとき — POS、コールセンタ、不正検知の確認 — に、画面コードを使わずに承認を取る仕組み。
---

# CIBA — Client-Initiated Backchannel Authentication

CIBA は [device flow](/ja/concepts/device-code) とは別の形の問題を解きます。device code は 2 つの面が「画面に表示された短いコード」を介して OP で合流します。**CIBA** ではリクエストを開始する装置がそもそも **ユーザに見えていない** — ユーザは、すでに信頼している **別の認証デバイス** へ push（あるいは電話、通知）を受け取る形になります。

代表的な構成:

- **利用デバイス（consumption device）** — POS 端末、コールセンタの操作画面、店内 kiosk、銀行の振込承認パネル等。**誰** であるべきかは知っている（ロイヤリティカード、電話番号、口座番号）が、認証する手段はない。
- **認証デバイス（authentication device）** — ユーザのスマホで、銀行アプリがすでにインストール・サインイン済み。push 通知（「Acme Coffee で 800 円を承認しますか？」）を受け取り、ユーザは **承認 / 拒否** をタップする。

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
  - **poll** — デバイスが `auth_req_id` で `/token` を poll する。本ライブラリが現在実装している配信モードはこれだけです。
  - **ping** — OP がデバイスの HTTPS endpoint に `auth_req_id` をコールバック、その後デバイスが `/token` を poll する。（v2+ で対応）
  - **push** — OP がデバイスの HTTPS endpoint にトークンを直接配信する。（v2+ で対応）
:::

## フローの動き方（poll mode）

<style scoped>
.ciba-tx{fill:currentColor;stroke:none;}
.ciba-fb{font-family:var(--vp-font-family-base);}
.ciba-fm{font-family:var(--vp-font-family-mono);}
.ciba-accent{stroke:var(--vp-c-brand-2);}
.ciba-sec{stroke:#7c6fb0;}
.dark .ciba-sec{stroke:#b3a7e0;}
.ciba-accent-f{fill:var(--vp-c-brand-2);}
.ciba-sec-f{fill:#7c6fb0;}
.dark .ciba-sec-f{fill:#b3a7e0;}
.ciba-muted{opacity:.62;}
.ciba-life{stroke-width:1.5;stroke-dasharray:3 4;opacity:.5;}
.ciba-frag{stroke-width:1.4;stroke-dasharray:5 4;opacity:.55;}
</style>

<svg role="img" aria-labelledby="ciba-poll-flow-title" viewBox="0 0 760 456" width="760" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
<title id="ciba-poll-flow-title">CIBA poll モードのシーケンス図。POS 端末が /bc-authorize を呼び、OP が hint を解決してスタッフのスマホへ push し、POS はユーザが承認するまで /token を poll してトークンが発行される。</title>
<line class="ciba-life" x1="93" y1="50" x2="93" y2="446"/>
<line class="ciba-life ciba-accent" x1="430" y1="50" x2="430" y2="446"/>
<line class="ciba-life ciba-sec" x1="680" y1="50" x2="680" y2="446"/>
<rect x="18" y="10" width="150" height="40" rx="6"/>
<rect class="ciba-accent" x="352" y="10" width="156" height="40" rx="6"/>
<rect class="ciba-sec" x="605" y="10" width="150" height="40" rx="6"/>
<text class="ciba-tx ciba-fb" x="93" y="28" text-anchor="middle" font-size="11.5" font-weight="600">利用デバイス</text>
<text class="ciba-tx ciba-fb ciba-muted" x="93" y="42" text-anchor="middle" font-size="10.5">（POS 端末）</text>
<text class="ciba-tx ciba-fb ciba-accent-f" x="430" y="28" text-anchor="middle" font-size="11.5" font-weight="600">OP</text>
<text class="ciba-tx ciba-fm ciba-accent-f ciba-muted" x="430" y="42" text-anchor="middle" font-size="10.5">go-oidc-provider</text>
<text class="ciba-tx ciba-fb ciba-sec-f" x="680" y="28" text-anchor="middle" font-size="11.5" font-weight="600">認証デバイス</text>
<text class="ciba-tx ciba-fb ciba-muted" x="680" y="42" text-anchor="middle" font-size="10.5">（スタッフのスマホ）</text>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="100" font-size="10">1</text>
<text class="ciba-tx ciba-fm" x="261" y="71" text-anchor="middle" font-size="11">POST /bc-authorize</text>
<text class="ciba-tx ciba-fm ciba-muted" x="261" y="84" text-anchor="middle" font-size="10.5">login_hint=alice · scope=openid · binding_message</text>
<line x1="93" y1="97" x2="430" y2="97"/>
<polyline points="423,93 430,97 423,101"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="118" font-size="10">2</text>
<path class="ciba-accent" d="M430 108 H462 V122 H430"/>
<polyline class="ciba-accent" points="437,118 430,122 437,126"/>
<text class="ciba-tx ciba-fm ciba-accent-f" x="470" y="116" font-size="11">HintResolver → sub=alice123</text>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="173" font-size="10">3</text>
<text class="ciba-tx ciba-fb" x="555" y="147" text-anchor="middle" font-size="11">out-of-band push</text>
<text class="ciba-tx ciba-fb ciba-sec-f" x="555" y="160" text-anchor="middle" font-size="10.5">Acme Coffee で 800 円を承認?</text>
<line class="ciba-accent" x1="430" y1="170" x2="680" y2="170"/>
<polyline class="ciba-accent" points="673,166 680,170 673,174"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="207" font-size="10">4</text>
<text class="ciba-tx ciba-fm" x="261" y="192" text-anchor="middle" font-size="11">200 · { auth_req_id, expires_in: 600, interval: 5 }</text>
<line class="ciba-accent" x1="430" y1="204" x2="93" y2="204"/>
<polyline class="ciba-accent" points="100,200 93,204 100,208"/>
<rect class="ciba-frag" x="30" y="216" width="710" height="156" rx="4"/>
<text class="ciba-tx ciba-fm ciba-muted" x="40" y="230" font-size="10" font-weight="600">par</text>
<rect class="ciba-frag" x="46" y="234" width="430" height="74" rx="4"/>
<text class="ciba-tx ciba-fb ciba-muted" x="54" y="247" font-size="10">loop · interval 秒ごとに poll</text>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="277" font-size="10">5</text>
<text class="ciba-tx ciba-fm" x="261" y="262" text-anchor="middle" font-size="11">POST /token · grant_type=…:ciba · auth_req_id</text>
<line x1="93" y1="274" x2="430" y2="274"/>
<polyline points="423,270 430,274 423,278"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="301" font-size="10">6</text>
<text class="ciba-tx ciba-fm" x="261" y="288" text-anchor="middle" font-size="11">400 · { error: authorization_pending }</text>
<line class="ciba-accent" x1="430" y1="298" x2="93" y2="298"/>
<polyline class="ciba-accent" points="100,294 93,298 100,302"/>
<line class="ciba-frag" x1="30" y1="320" x2="740" y2="320"/>
<text class="ciba-tx ciba-fb ciba-muted" x="555" y="333" text-anchor="middle" font-size="10.5">ユーザがスマホで承認</text>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="361" font-size="10">7</text>
<text class="ciba-tx ciba-fm" x="555" y="346" text-anchor="middle" font-size="11">approve(auth_req_id, sub=alice123)</text>
<line class="ciba-sec" x1="680" y1="358" x2="430" y2="358"/>
<polyline class="ciba-sec" points="437,354 430,358 437,362"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="411" font-size="10">8</text>
<text class="ciba-tx ciba-fm" x="278" y="396" text-anchor="end" font-size="11">POST /token</text>
<text class="ciba-tx ciba-fb ciba-muted" x="284" y="396" font-size="10.5">（次の poll）</text>
<line x1="93" y1="408" x2="430" y2="408"/>
<polyline points="423,404 430,408 423,412"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="439" font-size="10">9</text>
<text class="ciba-tx ciba-fm" x="261" y="424" text-anchor="middle" font-size="11">200 · { access_token, id_token, refresh_token? }</text>
<line class="ciba-accent" x1="430" y1="436" x2="93" y2="436"/>
<polyline class="ciba-accent" points="100,432 93,436 100,440"/>
</svg>

利用デバイスはユーザの credential を持ちません。ユーザは利用デバイスに何も打ちません。認証デバイス — ユーザが銀行アプリにサインイン済みなのですでに認証されている — だけが consent を行使する場所になります。

## CIBA と Device Code — どちらを選ぶか

両方とも 2 デバイスです。違いは **「利用デバイスが聞いていることをユーザが知っているか」** です。

| | Device Code | CIBA |
|---|---|---|
| **誰が信頼を起こす?** | ユーザが認証ページに `user_code` を打ち込む | 利用デバイスが OP に push、ユーザは通知だけを見る |
| **ユーザは URL を発見する必要がある?** | はい — `verification_uri` が画面に出る | いいえ — OP は push 先を知っている |
| **利用デバイス側の信頼モデル** | 匿名のデバイスがユーザに「結びつけて」とお願いする | 事前登録されたデバイスが、OP 経由でユーザに「確認して」とお願いする |
| **代表的な利用面** | スマート TV、ゲーム機、CLI、IoT 機器のペアリング | POS、コールセンタ、不正検知の確認、アプリ内決済 |
| **ユーザが打つ識別子** | `user_code`（`BDWP-HQPK` 等） | なし — OP はすでにユーザ識別子を持っている（`login_hint`） |
| **誤誘導のリスク** | 低 — URL がデバイス画面に出ている | 中 — push 通知の文言が利用面と一致しているとユーザが信頼する必要がある。**`binding_message`** を使ってスマホ側プロンプトに POS の要求内容を表示すること |

ユーザが **デバイスの目の前にいて** デバイスがコード表示できないなら CIBA。ユーザが **デバイスから離れていて** デバイスが画面を持っているなら device code。CIBA の認証デバイスは事前にユーザを知っている必要があり、device code の verification ページは任意のサインイン済みブラウザセッションで動きます。

## Hint — 「どのユーザか」を OP に伝える

利用デバイスはユーザを認証できないので、OP に **どのユーザに push するか** を伝える必要があります。CIBA Core §7.1 は 3 種類の hint を定義しており、OP は単一の `HintResolver` interface でそれら全てを受け付けます:

```go
op.WithCIBA(
    op.WithCIBAHintResolver(op.HintResolverFunc(
        func(ctx context.Context, kind op.HintKind, value string) (string, error) {
            switch kind {
            case op.HintLoginHint:
                // value = "alice"、"alice@example.com"、口座番号など。
                return resolveLoginHint(ctx, value)
            case op.HintIDTokenHint:
                // value = 過去に発行された ID token（OP が署名・有効期限を検証済み）。
                return claimsSubject(value)
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

## binding_message — 誤誘導を防ぐ項目

CIBA の `binding_message` は利用デバイスが `/bc-authorize` 時に送れる短い文字列です。OP はこれを認証デバイスに転送し、ユーザのスマホ側プロンプトにレジ係が POS で見ているのと同じ文言を表示できます:

> **Acme POS 端末 #14**: Acme Coffee で 800 円を承認しますか?
>
> [ 承認 ] [ 拒否 ]

`binding_message` がないと、ユーザは OP の汎用プロンプトしか頼りになりません。「異常なアクティビティを検知しました。この push を承認してください」のような phishing がはるかに通りやすくなります。仕様上は optional ですが、組み込み側の UX では **必須** として扱ってください。

## 動かしてみる

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) は完全な POS シナリオを実演します。POS が `/bc-authorize` に POST、スタッフのスマホ（`CIBARequestStore.Approve` を直接呼ぶ goroutine でシミュレート）が承認、POS が token 発行まで poll します。end-to-end で 5 秒程度です。

```sh
(cd examples/32-ciba-pos && go run -tags example .)
```

example はロール別ファイルに分割されています（`op.go` で OP の組み立て + `HintResolver`、`rp.go` で POS 側の polling、`device.go` でスマホ承認のシミュレーション）。

## 続きはこちら

- [ユースケース: CIBA の組み込み](/ja/use-cases/ciba) — `op.WithCIBA`、`HintResolver` の契約、FAPI-CIBA プロファイル制約、組み込み側の認証デバイスコールバックが `CIBARequestStore.Approve` に応答する手順。
- [Device Code 入門](/ja/concepts/device-code) — 「ユーザが別の利用面にいる」という同系統の概念。コード表示を使う方式。
