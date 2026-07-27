---
title: Device Code（RFC 8628）
description: TV / コンソール / CLI がキーボードなしでアクセストークンを得る仕組み — device-authorization grant をやさしく解説。
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

<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="device-code-flow-title" viewBox="0 0 700 570" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="device-code-flow-title">デバイス認可のシーケンス: デバイスが device_code と user_code を要求し、ユーザが別画面で承認する間トークンエンドポイントを poll し、最後にアクセストークンを受け取る。</title>

  <!-- actors -->
  <rect x="12" y="14" width="128" height="40" rx="5"/>
  <rect class="dcf-sacc" x="286" y="14" width="128" height="40" rx="5"/>
  <rect class="dcf-smut" x="560" y="14" width="128" height="40" rx="5"/>
  <text class="dcf-fp dcf-neu" x="76" y="32" font-size="12.5" font-weight="600" text-anchor="middle">デバイス</text>
  <text class="dcf-fm dcf-neu" x="76" y="46" font-size="9" text-anchor="middle">TV · CLI · コンソール</text>
  <text class="dcf-fp dcf-acc" x="350" y="32" font-size="12.5" font-weight="600" text-anchor="middle">OP</text>
  <text class="dcf-fm dcf-acc" x="350" y="46" font-size="9" text-anchor="middle">go-oidc-provider</text>
  <text class="dcf-fp dcf-mut" x="624" y="32" font-size="12.5" font-weight="600" text-anchor="middle">ユーザ</text>
  <text class="dcf-fm dcf-mut" x="624" y="46" font-size="9" text-anchor="middle">スマホ · 別画面</text>

  <!-- lifelines -->
  <line class="dcf-life" x1="76" y1="54" x2="76" y2="558"/>
  <line class="dcf-life dcf-sacc" x1="350" y1="54" x2="350" y2="558"/>
  <line class="dcf-life dcf-smut" x1="624" y1="54" x2="624" y2="558"/>

  <!-- msg1: device authorization request -->
  <text class="dcf-fm dcf-neu" x="213" y="74" font-size="10.5" text-anchor="middle">POST /device_authorization</text>
  <text class="dcf-fm dcf-neu" x="213" y="87" font-size="9.5" text-anchor="middle">client_id · scope=openid profile</text>
  <line x1="76" y1="96" x2="350" y2="96"/>
  <path d="M343 92 L350 96 L343 100"/>

  <!-- msg2: device authorization response -->
  <text class="dcf-fm dcf-neu" x="213" y="116" font-size="10" text-anchor="middle">200  device_code · user_code=ABCD-EFGH</text>
  <text class="dcf-fm dcf-neu" x="213" y="129" font-size="9.5" text-anchor="middle">verification_uri(_complete) · interval · expires_in</text>
  <line class="dcf-ret" x1="350" y1="138" x2="76" y2="138"/>
  <path d="M83 134 L76 138 L83 142"/>

  <!-- note over device -->
  <path class="dcf-frame" fill="var(--vp-c-bg)" d="M20 154 H238 L250 166 V196 H20 Z"/>
  <path class="dcf-frame" d="M238 154 V166 H250"/>
  <text class="dcf-fp dcf-neu" x="30" y="173" font-size="10">画面に表示 <tspan class="dcf-fm">op.example.com/device</tspan></text>
  <text class="dcf-fp dcf-neu" x="30" y="188" font-size="10">を開き <tspan class="dcf-fm">ABCD-EFGH</tspan> を入力</text>

  <!-- par frame -->
  <rect class="dcf-frame" x="30" y="210" width="658" height="264" rx="5"/>
  <line class="dcf-frame" x1="30" y1="356" x2="688" y2="356"/>
  <path class="dcf-tabbg" d="M30 210 h46 v12 l-6 6 h-40 z"/>
  <text class="dcf-fp dcf-mut" x="41" y="223" font-size="10" font-style="italic">par</text>
  <text class="dcf-fp dcf-mut" x="104" y="243" font-size="10">デバイスがトークンエンドポイントを poll</text>
  <text class="dcf-fp dcf-mut" x="40" y="370" font-size="10">ユーザが別チャネルで承認</text>

  <!-- loop frame -->
  <rect class="dcf-frame" x="44" y="250" width="340" height="94" rx="4"/>
  <path class="dcf-tabbg" d="M44 250 h50 v12 l-6 6 h-44 z"/>
  <text class="dcf-fp dcf-mut" x="55" y="263" font-size="10" font-style="italic">loop</text>
  <text class="dcf-fp dcf-mut" x="100" y="263" font-size="10"><tspan class="dcf-fm">interval</tspan> 秒ごとに再送</text>

  <!-- msg3: poll -->
  <text class="dcf-fm dcf-neu" x="213" y="284" font-size="10.5" text-anchor="middle">POST /token</text>
  <text class="dcf-fm dcf-neu" x="213" y="297" font-size="9.5" text-anchor="middle">grant_type=…:device_code · device_code</text>
  <line x1="76" y1="306" x2="350" y2="306"/>
  <path d="M343 302 L350 306 L343 310"/>

  <!-- msg4: pending -->
  <text class="dcf-fm dcf-neu" x="213" y="326" font-size="10" text-anchor="middle">400  authorization_pending</text>
  <line class="dcf-ret" x1="350" y1="334" x2="76" y2="334"/>
  <path d="M83 330 L76 334 L83 338"/>

  <!-- msg5: verification page -->
  <text class="dcf-fm dcf-neu" x="487" y="388" font-size="10.5" text-anchor="middle">GET /device</text>
  <text class="dcf-fp dcf-neu" x="487" y="401" font-size="10" text-anchor="middle"><tspan class="dcf-fm">ABCD-EFGH</tspan> を入力</text>
  <line x1="624" y1="410" x2="350" y2="410"/>
  <path d="M357 406 L350 410 L357 414"/>

  <!-- msg6: approve -->
  <text class="dcf-fp dcf-neu" x="487" y="444" font-size="10" text-anchor="middle">ログイン + 同意 → 承認</text>
  <line x1="624" y1="452" x2="350" y2="452"/>
  <path d="M357 448 L350 452 L357 456"/>

  <!-- msg7: next poll -->
  <text class="dcf-fp dcf-neu" x="213" y="498" font-size="10" text-anchor="middle">次の poll: <tspan class="dcf-fm">POST /token</tspan></text>
  <line x1="76" y1="506" x2="350" y2="506"/>
  <path d="M343 502 L350 506 L343 510"/>

  <!-- msg8: tokens -->
  <text class="dcf-fm dcf-neu" x="213" y="536" font-size="10" text-anchor="middle">200  access_token · id_token? · refresh_token?</text>
  <line class="dcf-ret" x1="350" y1="544" x2="76" y2="544"/>
  <path d="M83 540 L76 544 L83 548"/>
</svg>

デバイス側はパスワードを一切持ちません。ユーザもデバイスには何も打ちません。2 つの面が短い `user_code` を介して OP で合流します。

## Polling 応答

トークンエンドポイント (`/token`) は poll ごとに以下のいずれかを返します:

| 応答 | 意味 | デバイスのふるまい |
|---|---|---|
| `400 authorization_pending` | ユーザがまだ承認（または拒否）していない | `interval` 秒待って再 poll |
| `400 slow_down` | poll が速すぎた | interval を倍にする（RFC 8628 §3.5: "MUST honor the new value"）。OP は新しい interval を `LastPolledAt` と一緒に原子的に永続化するので、マルチレプリカ構成でも元に戻らない |
| `400 access_denied` | ユーザが verification ページで **拒否** をクリック（または組み込み側の revocation hook が発火） | poll を停止し「サインインがキャンセルされました」と表示 |
| `400 expired_token` | `device_code` が `expires_in`（既定 600 秒）を超えた | poll を停止。再試行はフローからやり直す |
| `200 { access_token, ... }` | ユーザが承認 | 通常の token 応答として処理 |

::: warning user_code は構造的に brute-force 可能
`user_code` は短いから使い物になります。長くしたら誰も入力しません。これは原理的に brute-force され得るということでもあり、ユーザが打つより速く `/device` を呼び出せる攻撃者が勝ってしまいます。本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) でレコード単位の防御を同梱しています。`VerifyUserCode` が constant-time 比較を行い、失敗したらストライクカウンタを加算し、`MaxUserCodeStrikes`（既定 5）でレコードをロックアウトします。自前で verification ページを作る組み込み側は、このヘルパを使うか同等の防御を実装する必要があります。
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
(cd examples/31-device-code-cli && go run -tags example .)
```

example は役割別ファイルに分割されています（`op.go` で OP の組み立て、`cli.go` でデバイス側の polling、`device.go` でブラウザ承認のシミュレーション、`probe.go` で self-verification）。各面を独立に読めます。

## 続きはこちら

- [使い方: device code の組み込み](/ja/use-cases/device-code) — `op.WithDeviceCodeGrant`、`devicecodekit.VerifyUserCode`、検証ページの契約、デバイス登録解除(unenroll)時に発行済みトークンを連鎖失効させる手順。
- [CIBA 入門](/ja/concepts/ciba) — 「ユーザが別チャネルにいる」の概念的な兄弟。コード表示を使わない方式。
