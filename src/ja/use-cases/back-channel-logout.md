---
title: バックチャネルログアウト
description: セッション終了時に、grant から解決した RP 対象へ上限付き fan-out でサーバ間通知 — OIDC Back-Channel Logout 1.0。
pageClass: pg-use-cases-back-channel-logout
---

# 使い方 — バックチャネルログアウト

## そもそも「バックチャネルログアウト」とは？

ユーザは「Acme でサインイン」ボタンを介して、同じ OP に紐づく複数の RP にサインインしているのが普通です。あるアプリ（RP A）で **ログアウト** をクリックしても、他の RP B / RP C はそれぞれローカル cookie を保持したままなので、「アプリ A ではログアウトしたのにアプリ B ではログイン状態のまま」というズレが残ります。

**バックチャネルログアウト** は、このズレを OP 側から閉じる 一斉通知 機構です。各 RP は OP に対してサーバサイドのコールバック URL を事前登録しておきます。セッション終了時、OP は **subject の grant から導出した対象 RP それぞれに、署名済み `logout_token` を直接 POST** します（ブラウザを経由しない＝バックチャネル）。RP はトークンを検証してローカル cookie を破棄します。

対になる仕組みとして *フロントチャネルログアウト* もありますが、こちらは `<iframe>` とサードパーティ cookie に依存しており、現代のブラウザでは段階的に動かなくなりつつあります。バックチャネル方式が現実的な選択肢です。

::: details このページで触れる仕様
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JWT（logout token の形式）
- [RFC 8417](https://datatracker.ietf.org/doc/html/rfc8417) — Security Event Token (SET)（`events` claim の形式）
- [RFC 1918](https://datatracker.ietf.org/doc/html/rfc1918) — プライベート IPv4 範囲（後述の SSRF 防御で使用）
:::

::: details 用語の補足
- **`logout_token`** — OP が署名して各 RP に POST する短寿命の JWT です。終了したセッションの subject (`sub`) を運びます。アクセストークンとは別物で、RP は検証後に自身のローカルセッションを破棄するだけです。
- **SET（Security Event Token、RFC 8417）** — セキュリティイベント配送向けの JWT 形式です。`events` claim にイベント種別キー（ここでは `http://schemas.openid.net/event/backchannel-logout`）を入れることで、汎用 SET 受信側が適切なハンドラに振り分けられるよう設計されています。
:::

> **ソース:** [`examples/42-back-channel-logout`](https://github.com/libraz/go-oidc-provider/tree/main/examples/42-back-channel-logout)

## アーキテクチャ

<svg class="bcl-svg" role="img" aria-labelledby="bcl-arch-title" viewBox="0 0 764 386" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="bcl-arch-title">バックチャネルログアウトのシーケンス: RP A が /end_session を起動し、OP がセッションを終了して grant 由来の RP 対象 B と C に署名済み logout token を一斉通知したうえで RP A へリダイレクトする。</title>

  <path class="life" d="M70 48V372"/>
  <path class="life" d="M220 48V372"/>
  <path class="life" d="M380 48V372"/>
  <path class="life" d="M540 48V372"/>
  <path class="life" d="M700 48V372"/>

  <rect x="24" y="12" width="92" height="36" rx="7"/>
  <text class="nm" x="70" y="35" text-anchor="middle">ユーザ</text>

  <rect x="168" y="12" width="104" height="36" rx="7"/>
  <text class="nm" x="220" y="30" text-anchor="middle">RP A</text>
  <text class="rl" x="220" y="42" text-anchor="middle">起動側</text>

  <rect class="accent" x="328" y="12" width="104" height="36" rx="7"/>
  <text class="nm accentt" x="380" y="35" text-anchor="middle">OP</text>

  <rect x="488" y="12" width="104" height="36" rx="7"/>
  <text class="nm" x="540" y="35" text-anchor="middle">RP B</text>

  <rect x="654" y="12" width="92" height="36" rx="7"/>
  <text class="nm" x="700" y="35" text-anchor="middle">RP C</text>

  <text class="lb" x="145" y="74" text-anchor="middle">&#12300;ログアウト&#12301;をクリック</text>
  <path d="M70 82L220 82M213 78L220 82L213 86"/>
  <circle class="bg" cx="70" cy="82" r="8" stroke-width="1.5"/>
  <text class="bn" x="70" y="85.5" text-anchor="middle">1</text>

  <text class="lb" x="300" y="104" text-anchor="middle">リダイレクト先</text>
  <text class="lbm m" x="300" y="116" text-anchor="middle">/end_session?id_token_hint=&#8230;</text>
  <path d="M220 124L380 124M373 120L380 124L373 128"/>
  <circle class="bg" cx="220" cy="124" r="8" stroke-width="1.5"/>
  <text class="bn" x="220" y="127.5" text-anchor="middle">2</text>

  <rect class="accent" x="326" y="138" width="108" height="26" rx="5"/>
  <text class="lb" x="380" y="155" text-anchor="middle">セッション終了</text>
  <circle class="bg" cx="312" cy="151" r="8" stroke-width="1.5"/>
  <text class="bn" x="312" y="154.5" text-anchor="middle">3</text>

  <rect class="frame" x="350" y="176" width="396" height="94" rx="8"/>
  <text class="fr" x="360" y="193">grant 由来の RP 対象へ一斉通知</text>
  <text class="lbm m" x="548" y="211" text-anchor="middle">POST backchannel_logout_uri &#183; logout_token = 署名 JWT</text>

  <path class="accent" d="M380 228L540 228M533 224L540 228L533 232"/>
  <circle class="bg" cx="380" cy="228" r="8" stroke-width="1.5"/>
  <text class="bn" x="380" y="231.5" text-anchor="middle">4</text>

  <path class="accent" d="M380 254L700 254M693 250L700 254L693 258"/>
  <circle class="bg" cx="380" cy="254" r="8" stroke-width="1.5"/>
  <text class="bn" x="380" y="257.5" text-anchor="middle">5</text>

  <text class="lbm m" x="392" y="288">200</text>
  <path class="ret" d="M540 294L380 294M387 290L380 294L387 298"/>
  <circle class="bg" cx="540" cy="294" r="8" stroke-width="1.5"/>
  <text class="bn" x="540" y="297.5" text-anchor="middle">6</text>

  <text class="lbm m" x="392" y="314">200</text>
  <path class="ret" d="M700 320L380 320M387 316L380 320L387 324"/>
  <circle class="bg" cx="700" cy="320" r="8" stroke-width="1.5"/>
  <text class="bn" x="700" y="323.5" text-anchor="middle">7</text>

  <text class="lb" x="300" y="348" text-anchor="middle">302 <tspan class="m" font-size="10">post_logout_redirect_uri</tspan></text>
  <path class="accent" d="M380 356L220 356M227 352L220 356L227 360"/>
  <circle class="bg" cx="380" cy="356" r="8" stroke-width="1.5"/>
  <text class="bn" x="380" y="359.5" text-anchor="middle">8</text>
</svg>

OP は RP 毎に `logout_token` に署名して RP の `backchannel_logout_uri` に POST します。トークンの中身は次のとおりです。

| Claim | 意味 |
|---|---|
| `iss` | OP issuer |
| `aud` | RP の `client_id` |
| `iat`、`jti` | 発行時刻 + replay nonce |
| `sub` | 終了したセッションの subject。`sid` は発行されません([後述](#backchannel-target-resolution)) |
| `events` | `{"http://schemas.openid.net/event/backchannel-logout": {}}` |

RP は署名と `aud` を検証し、ローカルセッションを破棄したうえで 200 を返します。

## 実装

クライアント別の `BackchannelLogoutURI` で RP ごとに有効化します。

```go
op.WithStaticClients(op.PublicClient{
  ID:                               "rp-a",
  RedirectURIs:                     []string{"https://rp-a.example.com/callback"},
  Scopes:                           []string{"openid", "profile"},
  BackchannelLogoutURI:             "https://rp-a.example.com/oidc/backchannel-logout",
  BackchannelLogoutSessionRequired: false, // sid は非対応。ユーザ識別には sub を使う
})
```

`BackchannelLogoutURI` フィールドは `op.ConfidentialClient` と `op.PrivateKeyJWTClient` にも同じ名前で存在します。いずれの型付きクライアント定義からも有効化できます。

ライブラリ全体のオプション:

```go
op.New(
  /* ... */
  op.WithBackchannelLogoutHTTPClient(myHTTPClient), // mTLS / カスタム timeout
  op.WithBackchannelLogoutTimeout(5 * time.Second),
  op.WithBackchannelFanOutBudget(30 * time.Second), // detached fan-out 全体。RP ごとの timeout とは別
)
```

loopback 上に stub RP を立てるローカル demo や CI fixture では、loopback の `backchannel_logout_uri` に限って plain HTTP を許容できます。

```go
op.WithAllowInsecureBackchannelLogoutForDev()
```

このオプションは、登録時の URL 検証と実行時の SSRF 判定の両方を `127.0.0.1`、`[::1]`、`localhost` に限って緩和します。本番用の近道ではありません。public host と loopback 以外の private network は、下記の本番向け方針を別途明示する必要があります。

## SSRF 防御

::: warning 既定でプライベートネットワーク宛先を拒否
配送処理は、host が loopback / link-local / RFC 1918 / IPv6 ULA に解決される `backchannel_logout_uri` への POST を **拒否** します。これがないと、任意 URL を登録できる RP が OP の内部ネットワークへの SSRF オラクルになります。

接続先アドレスの拒否リストに加えて、登録時にも URL の形を検査します。`backchannel_logout_uri` は `https` 必須、fragment 不可、userinfo 不可、host 必須です。`https://attacker:internal@rp.example.com/...` も `https://rp.example.com/cb#anchor` も `invalid_client_metadata` で弾かれます。`backchannel_logout_session_required=true` は非対応で拒否されます。これを設定しても `sid` 配送は有効になりません。

```jsonc
// NG: userinfo と fragment は登録時に拒否。sid も非対応
{
  "backchannel_logout_uri": "https://attacker:internal@rp.example.com/logout#sid",
  "backchannel_logout_session_required": false
}

// NG: sid 配送を要求する設定は非対応（フィールドを指定しない）
{}

// OK: public HTTPS の配送先を明示する
{
  "backchannel_logout_uri": "https://rp.example.com/backchannel-logout",
  "backchannel_logout_session_required": false
}
```

RP を private DNS の内側に置くときは明示的に許可します。

```go
op.WithBackchannelAllowPrivateNetwork(true)
```

この緩和は意図的に選び取る必要があります — オプションを明示的に存在させることで、セキュリティ上のトレードオフが設定箇所に可視化されます。
:::

## 通知先はどう解決されるか（そしてなぜ上限があるか） {#backchannel-target-resolution}

一斉通知の通知先は session の行ではなく **grant** から解決されます。coordinator は終了する session の subject を受け取り、その subject が同意している client の集合を grant ストアに問い合わせます。使うのは `store.GrantClientLister.ListClientIDsBySubject` で、これは `ListBySubject` とは別の keyset ページング付きのビューです。1 つの subject が同じ client に対して過去分を含む多数の grant 行を持ちうるため、専用のビューを置いています。一斉通知の各段階には意図的に上限が設けてあります。

| 上限 | 既定値 | 何を抑えるか |
|---|---|---|
| 重複排除後の通知先 | `DefaultMaxTargets`(256) | 1 回のログアウトで通知する client 数。後段で絞るのではなく grant クエリ自体に上限を効かせる |
| 同時配送数 | `DefaultMaxConcurrentDeliveries`(8) | 同時に走る outbound POST の本数 |
| detached fan-out 全体 | 30 秒（`DefaultFanOutBudget`） | 1 回のログアウトイベント全体の wall-clock 予算 |

通知先ページに `NextCursor` が付いて返った場合、上限を超える client が該当したということです。coordinator は黙って切り捨てず、その cursor を載せた overflow の監査イベントを出します。到達できない RP が 1 つあっても、一斉通知全体は失敗せず、その RP 個別の監査イベントとして現れます。

`op.WithBackchannelFanOutBudget` はイベント全体の予算を変更します。各 RP のリクエストを制限する `op.WithBackchannelLogoutTimeout` とは独立しています。予算が切れると残りの通知先も失敗として記録され、detached 処理は収束します。プロセス終了時は `Provider.Shutdown(ctx)` が実行中の fan-out を待ちます。

::: tip `backchannel_logout_session_supported` は `false`
discovery はこれを `false` として広告します。これは grant ベースの解決から直接導かれる帰結です。OP 側の session 識別子が特定の RP のものであることを OP は証明できないため、`sid` を Logout Token に載せることはありません。RP は `sub` を手がかりにローカル session を破棄してください。`BackchannelLogoutSessionRequired` は false のままにするか省略してください。true は非対応で拒否されます。
:::

## 通知先が 0 件になったとき

subject に grant 由来の対象 RP がない場合（すべての grant が失効済み、または古いレコードが存在しない client を指している場合）、一斉通知には通知先がありません。本ライブラリはこれを監査イベントとして表面化させます。

| イベント | 意味 |
|---|---|
| `op.AuditBCLNoSessionsForSubject` | `/end_session` がセッションを指定したが、grant ベースの audience 解決で対象 RP が 0 件だった。 |

このイベントは `/end_session` がセッションを指定し、grant ベースの audience 解決で対象 RP が 0 件になった場合だけ発火します。揮発な `SessionStore` が snapshot 前に行を追い出すと、handler は detached notice を作らないため、fan-out も `AuditBCLNoSessionsForSubject` も開始しません。イベント extras の `op.SessionDurabilityPosture`（`SessionDurabilityVolatile` または `SessionDurabilityDurable`）は trigger / snapshot の喪失と対象 0 件を解釈する文脈であり、対象 0 件イベント自体が eviction を証明するわけではありません。

## フロントチャネルログアウト（別の機構）

OIDC Front-Channel Logout 1.0（ブラウザ側 iframe 一斉通知）は別仕様で、ライブラリは意図的に実装していません。Back-channel が配備可能な選択です — 第三者 cookie に依存せず、origin を跨いで動作し、一斉通知 時にユーザのブラウザが開いている必要もありません。
