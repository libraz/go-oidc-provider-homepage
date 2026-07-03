---
title: バックチャネルログアウト
description: セッション終了時に全 RP へサーバ間通知 — OIDC Back-Channel Logout 1.0。
---

# ユースケース — バックチャネルログアウト

## そもそも「バックチャネルログアウト」とは？

ユーザは「Acme でサインイン」ボタンを介して、同じ OP に紐づく複数の RP にサインインしているのが普通です。あるアプリ（RP A）で **ログアウト** をクリックしても、他の RP B / RP C はそれぞれローカル cookie を保持したままなので、「アプリ A ではログアウトしたのにアプリ B ではログイン状態のまま」というズレが残ります。

**バックチャネルログアウト** は、このズレを OP 側から閉じる fan-out 機構です。各 RP は OP に対してサーバサイドのコールバック URL を事前登録しておきます。セッション終了時、OP は **署名済み `logout_token` を各 RP の URL に直接 POST** します（ブラウザを経由しない＝バックチャネル）。RP はトークンを検証してローカル cookie を破棄します。

対になる仕組みとして *フロントチャネルログアウト* もありますが、こちらは `<iframe>` とサードパーティ cookie に依存しており、現代のブラウザでは段階的に動かなくなりつつあります。バックチャネル方式が現実的な選択肢です。

::: details このページで触れる仕様
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JWT（logout token の形式）
- [RFC 8417](https://datatracker.ietf.org/doc/html/rfc8417) — Security Event Token (SET)（`events` claim の形式）
- [RFC 1918](https://datatracker.ietf.org/doc/html/rfc1918) — プライベート IPv4 範囲（後述の SSRF 防御で使用）
:::

::: details 用語の補足
- **`logout_token`** — OP が署名して各 RP に POST する短寿命の JWT です。終了したセッションの subject (`sub`) または session id (`sid`) を運びます。アクセストークンとは別物で、RP は検証後に自身のローカルセッションを破棄するだけです。
- **SET（Security Event Token、RFC 8417）** — セキュリティイベント配送向けの JWT 形式です。`events` claim にイベント種別キー（ここでは `http://schemas.openid.net/event/backchannel-logout`）を入れることで、汎用 SET 受信側が適切なハンドラに振り分けられるよう設計されています。
:::

> **ソース:** [`examples/42-back-channel-logout`](https://github.com/libraz/go-oidc-provider/tree/main/examples/42-back-channel-logout)

## アーキテクチャ

<svg class="bcl-svg" role="img" aria-labelledby="bcl-arch-title" viewBox="0 0 764 386" style="width:100%;height:auto;max-width:760px" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="bcl-arch-title">バックチャネルログアウトのシーケンス: RP A が /end_session を起動し、OP がセッションを終了して署名済み logout token を RP B と RP C に fan-out したうえで RP A へリダイレクトする。</title>
  <style>
    .bcl-svg text{font-family:var(--vp-font-family-base);fill:var(--vp-c-text-1);stroke:none;}
    .bcl-svg .m{font-family:var(--vp-font-family-mono);}
    .bcl-svg .nm{font-weight:600;font-size:13px;}
    .bcl-svg .rl{font-size:9px;fill:var(--vp-c-text-2);}
    .bcl-svg .lb{font-size:12px;}
    .bcl-svg .lbm{font-size:10.5px;fill:var(--vp-c-text-2);}
    .bcl-svg .fr{font-size:11px;fill:var(--vp-c-text-2);}
    .bcl-svg .bn{font-size:10px;font-weight:600;fill:var(--vp-c-text-2);}
    .bcl-svg .accent{stroke:var(--vp-c-brand-2);}
    .bcl-svg .accentt{fill:var(--vp-c-brand-2);}
    .bcl-svg .life{stroke-width:1.4;opacity:.28;}
    .bcl-svg .frame{stroke-width:1.4;opacity:.5;}
    .bcl-svg .ret{opacity:.55;}
    .bcl-svg .bg{fill:var(--vp-c-bg);}
  </style>

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
  <text class="fr" x="360" y="193">セッション内の全 RP に fan-out</text>
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

  <text class="lb" x="300" y="348" text-anchor="middle">302 <tspan class="m" font-size="10.5">post_logout_redirect_uri</tspan></text>
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
| `sub` または `sid` | 終了したセッション |
| `events` | `{"http://schemas.openid.net/event/backchannel-logout": {}}` |

RP は署名と `aud` を検証し、ローカルセッションを破棄したうえで 200 を返します。

## 実装

クライアント別の `BackchannelLogoutURI` で RP をオプトインさせます。

```go
op.WithStaticClients(op.PublicClient{
  ID:                               "rp-a",
  RedirectURIs:                     []string{"https://rp-a.example.com/callback"},
  Scopes:                           []string{"openid", "profile"},
  BackchannelLogoutURI:             "https://rp-a.example.com/oidc/backchannel-logout",
  BackchannelLogoutSessionRequired: true, // logout token に "sid" claim を要求
})
```

`BackchannelLogoutURI` フィールドは `op.ConfidentialClient` と `op.PrivateKeyJWTClient` にも同じ名前で存在します — いずれの型付き seed からもオプトインできます。

ライブラリ全体のオプション:

```go
op.New(
  /* ... */
  op.WithBackchannelLogoutHTTPClient(myHTTPClient), // mTLS / カスタム timeout
  op.WithBackchannelLogoutTimeout(5 * time.Second),
)
```

loopback 上に stub RP を立てるローカル demo や CI fixture では、loopback の `backchannel_logout_uri` に限って plain HTTP を許容できます。

```go
op.WithAllowInsecureBackchannelLogoutForDev()
```

このオプションは、登録時の URL 検証と実行時の SSRF 判定の両方を `127.0.0.1`、`[::1]`、`localhost` に限って緩和します。本番用の近道ではありません。public host と loopback 以外の private network は、下記の本番向け方針を別途明示する必要があります。

## SSRF 防御

::: warning デフォルトでプライベートネットワーク宛先を拒否
配送処理は、host が loopback / link-local / RFC 1918 / IPv6 ULA に解決される `backchannel_logout_uri` への POST を **拒否** します。これがないと、任意 URL を登録できる RP が OP の内部ネットワークへの SSRF オラクルになります。

dial 段階の deny-list の手前に、登録時に URL の形を判定するゲートが重なっています。`backchannel_logout_uri` は `https` 必須、fragment 不可、userinfo 不可、host 必須 — `https://attacker:internal@rp.example.com/...` も `https://rp.example.com/cb#anchor` も `invalid_client_metadata` で弾かれます。`backchannel_logout_session_required=true` と空の URI の組み合わせも拒否します。配送先を持たないクライアントが `sid` 配送にオプトインできないようにするためです。

RP を private DNS で前段するときはオプトインを明示します。

```go
op.WithBackchannelAllowPrivateNetwork(true)
```

この緩和は意図的に選び取る必要があります — オプションを明示的に存在させることで、セキュリティ上のトレードオフが設定箇所に可視化されます。
:::

## 揮発ストアのギャップ（とそれを示す監査イベント）

Back-channel fan-out は OP の `SessionStore` を辿り、終了セッションに紐づく全 RP を見つけます。**揮発** session ストア（永続化無しの Redis、Memcached、maxmemory による追い出し下の in-memory）配下では、セッション確立から `/end_session` までの間に追い出された行は気付かれずに失われ、対応する RP には何も通知されません。

ライブラリはこのギャップを監査イベントとして可視化します。

| イベント | 意味 |
|---|---|
| `op.AuditBCLNoSessionsForSubject` | 呼出側がセッションを指定（`id_token_hint` 付き `/end_session` または `Provider.Logout`）したが、fan-out で解決した RP が 0 件だった。 |

揮発配置では、これは OIDC Back-Channel Logout 1.0 §2.7 の "best effort" の下限です。永続配置では予期せぬギャップを意味します。イベント extras に設定済みの `op.SessionDurabilityPosture`（`SessionDurabilityVolatile` または `SessionDurabilityDurable`）を載せておくことで、SOC ダッシュボードはストアアダプタの型に依存せず両者を区別できます。

## フロントチャネルログアウト（別の機構）

OIDC Front-Channel Logout 1.0（ブラウザ側 iframe fan-out）は別仕様で、ライブラリは意図的に実装していません。Back-channel がデプロイ可能な選択です — 第三者 cookie に依存せず、origin を跨いで動作し、fan-out 時にユーザのブラウザが開いている必要もありません。
