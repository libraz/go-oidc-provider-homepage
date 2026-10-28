---
title: バックチャネルログアウト
description: セッション終了時に、grant から解決した RP 対象へ上限付き fan-out でサーバ間通知 — OIDC Back-Channel Logout 1.0。
pageClass: pg-use-cases-back-channel-logout
---

# ユースケース — バックチャネルログアウト

## そもそも「バックチャネルログアウト」とは？

ユーザは「Acme でサインイン」ボタンを介して、同じ OP に紐づく複数の RP にサインインしているのが普通です。あるアプリ（RP A）で **ログアウト** をクリックしても、他の RP B / RP C はそれぞれローカル cookie を保持したままなので、「アプリ A ではログアウトしたのにアプリ B ではログイン状態のまま」というズレが残ります。

**バックチャネルログアウト** は、このズレを OP 側から閉じる一斉通知機構です。各 RP は OP に対してサーバサイドのコールバック URL を事前登録しておきます。セッション終了時、OP は **subject の grant から導出した対象 RP それぞれに、署名済み `logout_token` を直接 POST** します（ブラウザを経由しない＝バックチャネル）。RP はトークンを検証してローカル cookie を破棄します。

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

<figure class="fig">
  <div class="fig-head">1 回のログアウトを全 RP へ届ける</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-bcl-title" viewBox="0 0 960 472" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-bcl-title">RP A がユーザを end-session エンドポイントへ送ります。OP はセッションを終了し、そのセッションの grant が指すすべての RP へ署名済み logout token を POST し、最後にユーザを RP A へ戻します。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="448"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="448"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="448"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP A</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">ユーザがログアウト</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">RP B · RP C</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">ほかの RP すべて</text>
    <!-- RP A sends the user to /end_session -->
    <path class="fg-edge" d="M192,144 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="110" text-anchor="middle">GET /end_session</text>
    <text class="fg-mxs" x="352" y="132" text-anchor="middle">id_token_hint=…</text>
    <!-- OP ends the session and walks its grants -->
    <path class="fg-edge fg-edge--accent" d="M512,200 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="206">セッションを終了</text>
    <text class="fg-s" x="568" y="228">grant を走査</text>
    <!-- one logout_token POST per grant-derived target -->
    <path class="fg-edge" d="M512,304 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="270" text-anchor="middle">POST backchannel_logout_uri</text>
    <text class="fg-mxs" x="668" y="292" text-anchor="middle">logout_token · RP ごとに 1 回</text>
    <!-- best-effort answer -->
    <path class="fg-edge fg-edge--muted" d="M824,376 H512" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="668" y="366" text-anchor="middle">200 — あるいは無応答</text>
    <!-- redirect back to RP A -->
    <path class="fg-edge fg-edge--accent" d="M512,448 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="438" text-anchor="middle">302 → post_logout_redirect_uri</text>
  </svg>
  <figcaption class="fig-note">破線の応答を薄く描いているのには理由があります。OP はこの応答を待ちませんし、応答しない RP があっても他はログアウトされます。バックチャネルログアウトは分散トランザクションではなく best-effort の通知です。</figcaption>
</figure>

OP は RP 毎に `logout_token` に署名して RP の `backchannel_logout_uri` に POST します。トークンの中身は次のとおりです。

| Claim | 意味 |
|---|---|
| `iss` | OP issuer |
| `aud` | RP の `client_id` |
| `iat`、`jti` | 発行時刻 + replay nonce |
| `sub` | 終了したセッションの subject。`sid` は発行されません（[後述](#backchannel-target-resolution)） |
| `events` | `{"http://schemas.openid.net/event/backchannel-logout": {}}` |

JOSE ヘッダには `typ: logout+jwt` が入るので、RP は他の種別のトークンを拒否できます。RP は署名と `aud` を検証し、ローカルセッションを破棄したうえで 200 を返します。逆方向では、`/end_session` が `id_token_hint` として受け付けるのは ID トークンだけで、logout token やアクセストークンは拒否されます。

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
  op.WithBackchannelLogoutHTTPClient(myHTTPClient), // カスタム Transport（mTLS、プロキシ）
  op.WithBackchannelLogoutTimeout(5 * time.Second),
  op.WithBackchannelFanOutBudget(30 * time.Second), // detached fan-out 全体。RP ごとの timeout とは別
)
```

渡した client のうち、OP が使うのは `Transport` だけです。timeout は OP 側の設定を必ず適用し、リダイレクトは拒否し、宛先 URL は毎回 SSRF 拒否リストで検査します。`Transport` が nil か `*http.Transport` なら接続時の検査も加わります（独自の dial 関数は OP のものに置き換わります）。プロキシ経由の場合、接続時の検査が見るのはプロキシのアドレスで、宛先ホストは引き渡しの前に 1 度だけ検査されます。それ以外の `http.RoundTripper`（`otelhttp` のラッパーなど）は URL だけで判定するため、DNS rebinding は防げません。

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

detached 処理を開始する前に `/end_session` は snapshot を subject 単位でまとめるため、1 つの subject に複数のブラウザ session があっても fan-out は 1 回です。grant の問い合わせ結果も client ID 単位で重複排除されるため、対象 client ごとにその subject の Logout Token は最大 1 通だけ送られます。通知先の上限が数えるのも、この重複排除後の集合です。

detached の通知先解決中に client registry への transport 障害が起きた場合は `op.AuditLogoutBackChannelResolveFailed` として記録し、正常な「client が存在しない」結果はイベントなしでスキップします。`/end_session` 自身の `id_token_hint` / `client_id` lookup には別の `op.AuditLogoutClientLookupFailed` があり、通信路上は一律の拒否、正常な「client が存在しない」結果はイベントなしです。詳細は [監査イベントカタログ](/ja/reference/audit-events) を参照してください。

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

OIDC Front-Channel Logout 1.0（ブラウザ側 iframe 一斉通知）は別仕様で、ライブラリは意図的に実装していません。Back-channel が配備可能な選択です — 第三者 cookie に依存せず、origin を跨いで動作し、一斉通知時にユーザのブラウザが開いている必要もありません。
