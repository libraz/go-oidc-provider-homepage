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
  <div class="fig-head">デバイス認可グラント</div>
  <svg class="fig-svg" role="img" aria-labelledby="device-flow-title" viewBox="0 0 960 556" xmlns="http://www.w3.org/2000/svg">
    <title id="device-flow-title">デバイス認可グラントを示した図。デバイスが device_code と短い user_code を要求し、ユーザに移動先を表示し、ユーザが別画面で承認する間トークンエンドポイントを poll します。承認が届くと次の poll でトークンが返ります。</title>
    <!-- ライフライン -->
    <line class="fg-life" x1="150" y1="62" x2="150" y2="540"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="540"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="540"/>
    <!-- 登場人物 -->
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">デバイス</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">TV · CLI · コンソール</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="740" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">ユーザ</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">スマホ · 別画面</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="102" r="8.5"/>
    <text class="fg-badge-t" x="15" y="105" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,102 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="325" y="82" text-anchor="middle">POST /device_authorization</text>
    <text class="fg-mxs" x="325" y="95" text-anchor="middle">client_id · scope=openid profile</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="146" r="8.5"/>
    <text class="fg-badge-t" x="15" y="149" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,146 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="126" text-anchor="middle">200 · device_code · user_code=ABCD-EFGH</text>
    <text class="fg-mxs" x="325" y="139" text-anchor="middle">verification_uri(_complete) · interval · expires_in</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="192" r="8.5"/>
    <text class="fg-badge-t" x="15" y="195" text-anchor="middle">3</text>
    <rect class="fg-box fg-box--sub" x="60" y="170" width="360" height="44" rx="6"/>
    <text class="fg-xs" x="76" y="188">デバイスの画面に表示: <tspan class="fg-accent">op.example.com/device</tspan> を開き</text>
    <text class="fg-xs" x="76" y="204"><tspan class="fg-accent">ABCD-EFGH</tspan> を入力する</text>
    <!-- par フラグメント -->
    <rect class="fg-frame" x="44" y="234" width="896" height="240" rx="8"/>
    <rect class="fg-box fg-box--muted" x="44" y="234" width="52" height="18" rx="4"/>
    <text class="fg-tab" x="56" y="247">par</text>
    <line class="fg-rule fg-rule--dashed" x1="44" y1="360" x2="940" y2="360"/>
    <!-- loop -->
    <rect class="fg-frame" x="64" y="266" width="600" height="80" rx="6"/>
    <rect class="fg-box fg-box--muted" x="64" y="266" width="168" height="18" rx="4"/>
    <text class="fg-tab" x="76" y="279">loop · interval 秒ごとに再送</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="302" r="8.5"/>
    <text class="fg-badge-t" x="15" y="305" text-anchor="middle">4</text>
    <path class="fg-edge" d="M150,302 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="325" y="296" text-anchor="middle">POST /token · grant_type=…:device_code · device_code</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="332" r="8.5"/>
    <text class="fg-badge-t" x="15" y="335" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--muted" d="M500,332 H150" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="325" y="326" text-anchor="middle">400 · authorization_pending</text>
    <!-- 別画面 -->
    <text class="fg-xs" x="76" y="384">その間、別画面では</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="412" r="8.5"/>
    <text class="fg-badge-t" x="15" y="415" text-anchor="middle">6</text>
    <path class="fg-edge" d="M830,412 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="406" text-anchor="middle">GET /device — ABCD-EFGH を入力</text>
    <!-- 7 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="450" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="453" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M500,442 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="542" y="446">ログイン、同意、承認</text>
    <text class="fg-xs" x="542" y="459">この時点で device_code が subject に結び付く</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="504" r="8.5"/>
    <text class="fg-badge-t" x="15" y="507" text-anchor="middle">8</text>
    <path class="fg-edge" d="M150,504 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="498" text-anchor="middle">POST /token — 次の poll</text>
    <!-- 9 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="536" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="539" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M500,536 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="530" text-anchor="middle">200 · access_token · id_token? · refresh_token?</text>
  </svg>
  <figcaption class="fig-note">デバイスはパスワードを一度も見ませんし、ログイン画面も描画しません。保持するのは <code>device_code</code> だけです。短い <code>user_code</code> があるのは、文字を打てるキーボードのある端末で人間が入力し直せるようにするためです。</figcaption>
</figure>

デバイス側はパスワードを一切持ちません。ユーザもデバイスには何も打ちません。2 つの面が短い `user_code` を介して OP で合流します。

## Polling 応答

トークンエンドポイント（`/token`） は poll ごとに以下のいずれかを返します:

| 応答 | 意味 | デバイスのふるまい |
|---|---|---|
| `400 authorization_pending` | ユーザがまだ承認（または拒否）していない | `interval` 秒待って再 poll |
| `400 slow_down` | poll が速すぎた | その後のすべての要求で interval を 5 秒延ばす（RFC 8628 §3.5）。OP は新しい interval を `LastPolledAt` と一緒に原子的に永続化するので、マルチレプリカ構成でも元に戻らない |
| `400 access_denied` | ユーザが verification ページで **拒否** をクリック（または組み込み側の revocation hook が発火） | poll を停止し「サインインがキャンセルされました」と表示 |
| `400 expired_token` | `device_code` が `expires_in`（既定 600 秒）を超えた | poll を停止。再試行はフローからやり直す |
| `200 { access_token, ... }` | ユーザが承認 | 通常の token 応答として処理 |

::: warning user_code は構造的に brute-force 可能
`user_code` は短いから使い物になります。長くしたら誰も入力しません。これは原理的に brute-force され得るということでもあり、ユーザが打つより速く `/device` を呼び出せる攻撃者が勝ってしまいます。本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) を同梱しています。最初の手入力では、opaque なサーバ側 ceremony key を渡して `VerifyUserCodeByAttemptKey` を呼び、ユーザの認証と同意の後に `ApproveUserCode` を呼んでください。raw `user_code` を attempt key に使ってはなりません。`Deps` は mutex を含むため保持し、必ず pointer で渡してください。既定 limiter はプロセスローカルなので、マルチインスタンス構成では共有 atomic `AttemptLimiter` が必要です。
:::

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

- [使い方: device code の組み込み](/ja/use-cases/device-code) — `op.WithDeviceCodeGrant`、`devicecodekit.VerifyUserCodeByAttemptKey`、検証ページの契約、デバイス登録解除（unenroll）時に発行済みトークンを連鎖失効させる手順。
- [CIBA 入門](/ja/concepts/ciba) — 「ユーザが別チャネルにいる」の概念的な兄弟。コード表示を使わない方式。
