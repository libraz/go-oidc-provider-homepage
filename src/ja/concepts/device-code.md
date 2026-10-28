---
title: Device Code（RFC 8628）
description: TV / コンソール / CLI 向け RFC 8628 device authorization — 組み込み側の verification、opaque attempt key、user-code 試行制限を解説。
pageClass: pg-concepts-device-code
---

# Device Code（RFC 8628）

device-authorization grant — 通称「device code」「device flow」 — は、**ブラウザを動かせない**、または **パスワードを打つのが現実的でない** クライアントのための grant です。スマート TV、ゲーム機、CLI ツール、IoT 機器、POS 端末などが該当します。

一番身近な例は、新しい TV で Netflix にサインインするときの手順です。TV 画面に短いコード（`ABCD-EFGH`）と URL（`netflix.com/tv`）が表示され、ユーザはスマホでその URL を開いてコードを入力し、承認します。TV はパスワードを一度も見ないままアクセストークンを受け取ります。

::: details このページで触れる仕様
- [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628) — OAuth 2.0 Device Authorization Grant
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework（用語）
:::

::: details 用語の補足
- **device_code** — OP が発行する、デバイスが poll に使う長い不透明な識別子。ユーザには見せない。
- **user_code** — デバイス画面に表示し、ユーザが verification ページに打ち込む短い人間可読コード（`BDWP-HQPK` 等）。
- **verification_uri** — デバイス画面に表示する URL（`https://op.example.com/device`）。ユーザはスマホで開く。
- **verification_uri_complete** — `user_code` を埋め込み済みの URL。デバイスが QR コードを描画できれば、ユーザはスキャンするだけで打鍵が要らなくなる。
- **interval** — デバイスが `/token` を poll する間隔（秒）。OP が `slow_down` を返すとこの値が引き上げられる。
:::

## フローの動き方

<figure class="fig">
  <div class="fig-head">ユーザは別画面で承認し、その間デバイスは poll する</div>
  <svg class="fig-svg" role="img" aria-labelledby="device-flow-title" viewBox="0 0 960 888" xmlns="http://www.w3.org/2000/svg">
    <title id="device-flow-title">デバイス認可グラントを示した図。デバイスが device_code と短い user_code を要求し、ユーザに移動先を表示し、ユーザが別画面で承認する間トークンエンドポイントを poll します。承認が届くと次の poll でトークンが返ります。</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="296" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">コードを発行する</text>
    <rect class="fg-group" x="32" y="424" width="896" height="440" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="452">承認を待つ</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="864"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="864"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="864"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Device</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">TV · CLI · コンソール</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">User</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">スマホ · 別画面</text>
    <!-- device authorization -->
    <path class="fg-edge" d="M192,206 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="172" text-anchor="middle">POST /device_authorization</text>
    <text class="fg-mxs" x="352" y="194" text-anchor="middle">client_id · scope</text>
    <!-- codes -->
    <path class="fg-edge fg-edge--accent" d="M512,278 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="244" text-anchor="middle">200 · device_code, user_code</text>
    <text class="fg-mxs" x="352" y="266" text-anchor="middle">verification_uri · interval</text>
    <!-- device shows the code -->
    <path class="fg-edge" d="M192,318 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="324">URL とコードを画面に表示</text>
    <text class="fg-mxs" x="248" y="346">op.example.com/device</text>
    <text class="fg-mxs fg-accent" x="248" y="368">user_code=ABCD-EFGH</text>
    <!-- poll -->
    <path class="fg-edge" d="M192,526 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="492" text-anchor="middle">POST /token · poll</text>
    <text class="fg-mxs" x="352" y="514" text-anchor="middle">grant_type=…:device_code</text>
    <!-- pending -->
    <path class="fg-edge fg-edge--muted" d="M512,582 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="352" y="572" text-anchor="middle">400 · authorization_pending</text>
    <!-- user opens the verification page -->
    <path class="fg-edge" d="M824,638 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="628" text-anchor="middle">GET /device · user_code</text>
    <!-- approval -->
    <path class="fg-edge fg-edge--accent" d="M512,678 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="684">ログイン · 同意 · 承認</text>
    <text class="fg-mxs" x="568" y="706">device_code → subject</text>
    <!-- next poll -->
    <path class="fg-edge" d="M192,768 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="758" text-anchor="middle">POST /token · 次の poll</text>
    <!-- tokens -->
    <path class="fg-edge fg-edge--accent" d="M512,840 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="806" text-anchor="middle">200 · access_token</text>
    <text class="fg-mxs" x="352" y="828" text-anchor="middle">id_token? · refresh_token?</text>
  </svg>
  <figcaption class="fig-note">デバイスが保持するのは <code>device_code</code> だけで、パスワードは一度も見ません。短い <code>user_code</code> は、人間が文字を打てるキーボードで入力し直すためにあります。poll は承認が届くまで <code>interval</code> 秒ごとに繰り返されます。</figcaption>
</figure>

デバイス側はパスワードを一切持ちません。ユーザもデバイスには何も打ちません。2 つの面が短い `user_code` を介して OP で合流します。

## Polling 応答

トークンエンドポイント（`/token`） は poll ごとに以下のいずれかを返します:

| 応答 | 意味 | デバイスのふるまい |
|---|---|---|
| `400 authorization_pending` | ユーザがまだ承認（または拒否）していない | `interval` 秒待って再 poll |
| `400 slow_down` | poll が速すぎた | その後のすべての要求で interval を 5 秒延ばす（RFC 8628 §3.5）。OP は新しい interval を `LastPolledAt` と一緒に原子的に永続化するので、マルチレプリカ構成でも元に戻らない |
| `400 access_denied` | ユーザが verification ページで **拒否** した、組み込み側が失効させた、またはデバイスが `slow_down` を 5 回無視した（`poll_abuse`） | poll を停止し「サインインがキャンセルされました」と表示 |
| `400 expired_token` | `device_code` が `expires_in`（既定 600 秒）を超えた、または以前の poll がすでに引き換えた | poll を停止。再試行はフローからやり直す |
| `200 { access_token, ... }` | ユーザが承認 | 通常の token 応答として処理 |

デバイスは `interval`（既定 5 秒。1 秒の揺らぎは許容）より速く poll できません。それより早い poll には `slow_down` が返り、5 回目の違反でレコードは `access_denied` で終了します。

`device_code` レコードは閉じた状態遷移をたどり、トークンエンドポイントの応答は状態で決まります。

| レコードの状態 | その状態になる契機 | 次の poll への応答 |
|---|---|---|
| Pending | `POST /device_authorization` で作成された | `authorization_pending` |
| Approved | verification ページが `ApproveUserCode` を呼んだ | トークン発行。レコードは Consumed になる |
| Denied | ユーザが拒否した、組み込み側が失効させた、またはロックが発動した（`poll_abuse`、またはレコード指定の verify ヘルパによる `user_code_lockout`） | `access_denied` |
| Consumed | poll が承認を引き換えた | `expired_token` |

引き換えは Approved から Consumed への原子的な遷移 1 回で行われるため、同時に届いた 2 つの poll の両方にトークンが渡ることはありません。負けた側は `expired_token` になります。

::: warning user_code は構造的に brute-force 可能
`user_code` は短いから使い物になります。長くしたら誰も入力しません。これは原理的に brute-force され得るということでもあり、ユーザが打つより速く `/device` を呼び出せる攻撃者が勝ってしまいます。本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) を同梱しています。最初の手入力では、opaque なサーバ側 ceremony key を渡して `VerifyUserCodeByAttemptKey` を呼び、ユーザの認証と同意の後に `ApproveUserCode` を呼んでください。raw `user_code` を attempt key に使ってはなりません。`Deps` は mutex を含むため保持し、必ず pointer で渡してください。既定 limiter はプロセスローカルなので、マルチインスタンス構成では共有 atomic `AttemptLimiter` が必要です。
:::

## OP が提供するものと自前で作るもの

`op.WithDeviceCodeGrant()` は `/device_authorization` をマウントし、discovery に `device_authorization_endpoint` を載せ、device grant を有効な集合に加えます。verification ページは**提供しません**。このページは自前でホストし（既定の URL は `<issuer>/device`、変更は `op.WithDeviceVerificationURI`）、ユーザを認証したうえで `devicecodekit` のヘルパを呼びます。

```go
deps := &devicecodekit.Deps{DeviceCodes: st.DeviceCodes(), Grants: st.Grants()} // 1 つ保持し、pointer で渡す

ok, err := devicecodekit.VerifyUserCodeByAttemptKey(ctx, deps, ceremonyKey, typedCode)
// ok && err == nil なら同意画面を出し、その後
err = devicecodekit.ApproveUserCode(ctx, deps, typedCode, subject, authTime)
// 拒否なら devicecodekit.DenyUserCode(ctx, deps, typedCode, devicecodekit.DenyReasonUserDenied)
```

デバイスに伝える `expires_in` と `interval` は `op.WithDeviceCodeExpiry` と `op.WithDeviceCodePollInterval` で設定します。どちらも正の値が必要です。

承認の引き換え時に、そのクライアントに対する同意の grant が記録されます。このため device flow のトークンは `RevokeSubject` や grant management の対象になり、introspection と `/userinfo` では公開（pairwise）subject を返します。同じクライアントが同じ scope で後から `/auth` を呼ぶと、同意画面は省略されます。`devicecodekit.Revoke(ctx, deps, deviceCode, reason)` は、その grant の下に発行されたアクセストークンとリフレッシュトークンへ、`Deps` に設定したトークンストア（`AccessTokens` または `GrantRevocations`、`OpaqueAccessTokens`、`RefreshTokens`）を通じて連鎖して失効させます。`Deps.Grants` も設定しないと、grant レコード自体が残ります。

## 使うべきとき

device flow を選ぶのは、デバイス側に以下のいずれかの制約があるときです。

- **ブラウザがない** — set-top box、スマート TV、音声アシスタント
- **キーボードがない / 入力が困難** — TV リモコン、ゲームコントローラの D-pad
- **CLI ツール** で web server を立てない種類のもの（`gcloud auth login`、`gh auth login`、`kubectl oidc-login` など）
- **Headless** な自動化文脈で、provisioning 時に一度だけペアリングする運用

ブラウザが使えるクライアント（通常の SPA、custom URL scheme を持つネイティブアプリなど）には不要です。`authorization_code + PKCE` のほうが短く、安全で、UX も豊かです。RFC 8628 §3 自身も、device flow を標準的なフローが現実的でないときの **fallback** として位置づけています。

## 動かしてみる

[`examples/31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) は単一バイナリで RFC 8628 の往復を実演します。OP を立ち上げ、`user_code` パネルと `verification_uri_complete` のショートカットを表示し、数秒後にブラウザ承認をシミュレートして、OP が `access_token` + `id_token` を発行するまで poll します。

```sh
(cd examples/31-device-code-cli && GOWORK=off go run -tags example .)
```

example は役割別ファイルに分割されています（`op.go` で OP の組み立て、`cli.go` でデバイス側の polling、`device.go` でブラウザ承認のシミュレーション、`probe.go` で self-verification）。各面を独立に読めます。

## 続きはこちら

- [ユースケース: device code の組み込み](/ja/use-cases/device-code) — `op.WithDeviceCodeGrant`、`devicecodekit.VerifyUserCodeByAttemptKey`、検証ページの契約、デバイス登録解除（unenroll）時に発行済みトークンを連鎖失効させる手順。
- [認可コード + PKCE](/ja/concepts/authorization-code-pkce) — クライアントがブラウザを開けるなら、まずこちら。
- [CIBA 入門](/ja/concepts/ciba) — 「ユーザが別チャネルにいる」の概念的な兄弟。コード表示を使わない方式。
