---
title: ブラウザを使わないフロー — CIBA と Device Code
description: いずれも「アクセストークンを欲しがるデバイスにまともなブラウザがない」状況に対応するフロー。一見似ているが、誰が起点となるか・どのようにユーザを OP に識別させるかで分かれる。
---

# ブラウザを使わないフロー: CIBA と Device Code

[Device Code（RFC 8628）](/ja/concepts/device-code)と[CIBA（OpenID Connect Client-Initiated Backchannel Authentication 1.0）](/ja/concepts/ciba)は、仕様エコシステムが同じ大きな状況に対して用意している 2 つの grant です。状況とは「アクセストークンを欲しがるデバイスがまともなブラウザを持てない」こと。スマート TV、ゲーム機、CLI ツール、IoT、音声アシスタント、POS 端末、コールセンタの操作画面、ユーザの代わりに動くサーバ側プロセス、などです。

遠目に見ると 2 つのフローは同じ形に見えます — 「2 つの面が OP で合流して、ユーザはスマホで承認する」。実際には違います。両者は **誰がリクエストを起こすか** と **ユーザがどう OP に識別されるか** で分かれており、その 1 点が他のほぼ全ての違い（通信路上のエンドポイント、polling の主体、anti-phishing の主軸、適用される規制プロファイル）を決めています。

本ページは選択ガイドです。仕様としての動き方は[Device Code](/ja/concepts/device-code)と[CIBA](/ja/concepts/ciba)の各ページに置いてあります。

## 1 段落ずつでまとめる

**Device Code（RFC 8628）.** ブラウザを持たないデバイスが OP に「使い切りのコードをくれ」と頼み、自分の画面に表示し、ユーザに「この URL をスマホで開いて、このコードを入力して」と告げます。ユーザは手元のブラウザで認証して承認します。その間デバイスは `/token` を poll し続け、承認が降りるのを待ちます。ユーザの識別は **フローの途中で発覚** します — TV の前に誰がやって来るかは OP もデバイスも事前には知りません。

**CIBA（Core 1.0）.** RP はすでにユーザが誰かを知っています — `login_hint`（`alice@example.com`、口座番号など）、`id_token_hint`（過去に発行された ID トークン）、`login_hint_token`（上流のシステムが発行した署名付き JWT）のいずれかで。RP は OP に「このユーザを out-of-band で認証してくれ」と頼みます。OP は事前登録された認証デバイス（push 通知、SMS、アプリの確認プロンプト）に通知を飛ばします。その間 RP は poll する（ping / push モードならコールバックを待つ）。ユーザの識別は **RP が事前に与えるもの** です — どのデバイスへ push するか、OP はそれがないと決められません。

## 比較

| 観点 | Device Code（RFC 8628） | CIBA（Core 1.0） |
|---|---|---|
| 発端 | ブラウザを持たないデバイス（入力デバイス → OP） | RP / API クライアント（RP → OP） |
| ユーザの識別 | ユーザが別のブラウザに `user_code` を入力 | RP が `login_hint` / `id_token_hint` / `login_hint_token` を事前に渡す |
| ユーザ側の端末 | ユーザが手元に持っている任意のブラウザ | OP に事前登録された backchannel push 用のデバイス |
| anti-phishing の主軸 | デバイスが表示する `user_code` + ユーザが verification URI のホストを目視 | ユーザの認証デバイスに表示する `binding_message` |
| ブラウザの関与 | あり（ユーザのスマホ側） | 任意 / 不要（push 通知で確認が完結する） |
| ポーリング主体 | ブラウザを持たないデバイス | RP |
| 仕様上のエンドポイント | `/device_authorization` | `/bc-authorize` |
| token grant_type | `urn:ietf:params:oauth:grant-type:device_code` | `urn:openid:params:grant-type:ciba` |
| 主な用途 | TV アプリ、CLI ツール、kiosk、音声アシスタント、入力手段が乏しい IoT | 強力な顧客認証（PSD2 風）、金融 / ヘルスケアでの out-of-band 承認、画面共有なしでアクセスをリセットするカスタマーサポートのフロー |
| 本ライブラリでの対応 | RFC 8628 — フル対応、`op.WithDeviceCodeGrant()` で有効化 | OIDC CIBA Core 1.0 — 現リリースでは poll モードのみ。ping / push は将来対応 |
| ブルートフォース対策 | `op/devicecodekit` の constant-time 比較 + N-strike ロックアウト（`MaxUserCodeStrikes`） | poll-abuse ロックアウト — `auth_req_id` 単位で `/token` 再試行を rate-limit、閾値超過で `AuditCIBAPollAbuseLockout` |
| FAPI プロファイルとの関係 | FAPI 2.0 には組み込まれていない（RFC 8628 自体で Baseline 相当の構成は十分） | FAPI-CIBA — FAPI 2.0 Baseline / Message Signing とは別プロファイル。JAR + DPoP \| mTLS + access TTL 10 分上限を必須化 |

::: tip 2 つの grant、同じ症状
両方の grant が存在するのは、正攻法の `authorization_code + PKCE` フローがそもそも「token を欲しがるデバイスにまともなブラウザがある」前提で組まれているからです。その前提は TV、CLI、IoT、音声アシスタント、ユーザの代わりに動くバックエンドサービス、では成り立ちません。RFC 8628 と CIBA は「ブラウザがどこか別の場所にある」という状況の、**異なる 2 つの形** を解いています。
:::

## どちらを選ぶか — 判定木

順番に 4 つの問いを通ってください。最初の問いでだいたい片付きます。

<style scoped>
.dtx-q{stroke:currentColor;stroke-width:1.6}
.dtx-op{stroke:var(--vp-c-brand-2);stroke-width:1.8}
.dtx-rp{stroke:currentColor;stroke-width:1.8}
.dtx-edge{stroke:currentColor;stroke-width:1.6}
.dtx-qt{font-family:var(--vp-font-family-base);font-size:12.5px;fill:var(--vp-c-text-1);stroke:none}
.dtx-leaf{font-family:var(--vp-font-family-base);font-size:13.5px;font-weight:700;fill:var(--vp-c-text-1);stroke:none}
.dtx-leaf-op{font-family:var(--vp-font-family-base);font-size:13.5px;font-weight:700;fill:var(--vp-c-brand-2);stroke:none}
.dtx-lbl{font-family:var(--vp-font-family-base);font-size:10.5px;font-weight:600;fill:var(--vp-c-text-3);stroke:none}
.dtx-sub{font-family:var(--vp-font-family-base);font-size:10px;fill:var(--vp-c-text-3);stroke:none}
</style>

<svg role="img" aria-labelledby="nobrowser-choice-title" viewBox="0 0 660 480" width="660" style="max-width:100%;height:auto" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="nobrowser-choice-title">4 つの問いを順にたどって CIBA と Device Code のどちらを選ぶかを示す判定木。</title>
  <rect class="dtx-q" x="20" y="20" width="320" height="58" rx="6"/>
  <rect class="dtx-q" x="20" y="118" width="320" height="58" rx="6"/>
  <rect class="dtx-q" x="20" y="216" width="320" height="58" rx="6"/>
  <rect class="dtx-q" x="20" y="314" width="320" height="58" rx="6"/>
  <rect class="dtx-op" x="470" y="27" width="180" height="44" rx="6"/>
  <rect class="dtx-rp" x="470" y="125" width="180" height="44" rx="6"/>
  <rect class="dtx-rp" x="470" y="223" width="180" height="44" rx="6"/>
  <rect class="dtx-op" x="470" y="321" width="180" height="44" rx="6"/>
  <rect class="dtx-rp" x="90" y="418" width="200" height="44" rx="6"/>
  <path class="dtx-edge" d="M340 49 H470 M463 45 L470 49 L463 53"/>
  <path class="dtx-edge" d="M340 147 H470 M463 143 L470 147 L463 151"/>
  <path class="dtx-edge" d="M340 245 H470 M463 241 L470 245 L463 249"/>
  <path class="dtx-edge" d="M340 343 H470 M463 339 L470 343 L463 347"/>
  <path class="dtx-edge" d="M180 78 V118 M176 111 L180 118 L184 111"/>
  <path class="dtx-edge" d="M180 176 V216 M176 209 L180 216 L184 209"/>
  <path class="dtx-edge" d="M180 274 V314 M176 307 L180 314 L184 307"/>
  <path class="dtx-edge" d="M180 372 V418 M176 411 L180 418 L184 411"/>
  <text class="dtx-qt" x="180" y="45" text-anchor="middle">RP はフロー開始前に</text>
  <text class="dtx-qt" x="180" y="61" text-anchor="middle">ユーザが誰かを知っているか?</text>
  <text class="dtx-qt" x="180" y="143" text-anchor="middle">token を欲しがるデバイスに</text>
  <text class="dtx-qt" x="180" y="159" text-anchor="middle">画面はあるか?</text>
  <text class="dtx-qt" x="180" y="241" text-anchor="middle">ユーザは認証デバイスを</text>
  <text class="dtx-qt" x="180" y="257" text-anchor="middle">事前登録しているか?</text>
  <text class="dtx-qt" x="180" y="339" text-anchor="middle">規制下の金融 / ヘルスケアで</text>
  <text class="dtx-qt" x="180" y="355" text-anchor="middle">out-of-band 承認が要件か?</text>
  <text class="dtx-leaf-op" x="560" y="54" text-anchor="middle">CIBA</text>
  <text class="dtx-leaf" x="560" y="152" text-anchor="middle">Device Code</text>
  <text class="dtx-leaf" x="560" y="250" text-anchor="middle">Device Code</text>
  <text class="dtx-leaf-op" x="560" y="348" text-anchor="middle">CIBA</text>
  <text class="dtx-leaf" x="190" y="440" text-anchor="middle">Device Code</text>
  <text class="dtx-sub" x="190" y="454" text-anchor="middle">デフォルト</text>
  <text class="dtx-lbl" x="405" y="43" text-anchor="middle">はい</text>
  <text class="dtx-lbl" x="405" y="141" text-anchor="middle">はい</text>
  <text class="dtx-lbl" x="405" y="239" text-anchor="middle">いいえ</text>
  <text class="dtx-lbl" x="405" y="337" text-anchor="middle">はい</text>
  <text class="dtx-lbl" x="188" y="102" text-anchor="start">いいえ</text>
  <text class="dtx-lbl" x="188" y="200" text-anchor="start">いいえ</text>
  <text class="dtx-lbl" x="188" y="298" text-anchor="start">はい</text>
  <text class="dtx-lbl" x="188" y="396" text-anchor="start">いいえ</text>
</svg>

**1. RP はフロー開始 *前* にユーザが誰かを知っているか?**

- **はい** → CIBA。RP はすでに `login_hint`（または ID トークン、hint token）を持っており、`/bc-authorize` に乗せて送れます。ユーザは自分を識別するための入力をしません。
- **いいえ** → Device Code。ユーザは verification ページでサインインすることでフローの中で自分を識別し、OP はそこでユーザが誰かを知ります。

**2. token を欲しがるデバイスに画面はあるか?**

- **ある** → Device Code がそのまま `user_code` と `verification_uri` を表示できます。TV / ゲーム機 / CLI の典型ケース。
- **ない（音声アシスタント、ヘッドレス IoT 等）** → どちらでも動きます。Device Code は TTS で `user_code` を読み上げる、`verification_uri_complete` を QR で出す等の方法が取れます。CIBA は別のデバイスに push するので、そもそも表示は不要です。

**3. ユーザは認証デバイスを事前登録しているか?**

- **CIBA は前提とします。** 事前登録された送信先がないと OP は push の宛先を持ちません。そのデバイスをプロビジョニングする工程（銀行アプリ、スタッフのスマホ、規制当局が発行する authenticator、等）はデプロイの一部です。
- **Device Code は前提としません。** ユーザがサインインできる任意のブラウザセッションで動きます。本人のスマホ、同僚のラップトップ、店舗の kiosk、いずれでも。

**4. これは規制下の金融 / ヘルスケアで、out-of-band 承認が要件になっているか?**

- **CIBA は元々その目的で設計されています。** FAPI-CIBA プロファイルは CIBA Core の上に JAR、送信者制約付きトークン（DPoP または mTLS）、access TTL 10 分上限を上乗せします。`binding_message` は規制当局が見る audit の根拠（「ユーザは何を承認したのかを正確に見ていた」）です。
- **Device Code は汎用的な仕組みです。** 適切に組めば十分機能しますが、規制当局が SCA で名指ししてくる形にはなっていません。

判定木を抜けてもまだ迷うなら、デフォルトとしては「画面はあるがブラウザがない」一般消費者向けには **Device Code**、「RP がユーザを把握済みで、out-of-band で承認だけしてほしい」業務向けには **CIBA** を選んでください。

## シーケンス図

### Device Code（RFC 8628）

<style scoped>
.dcx-op{stroke:var(--vp-c-brand-2)}
.dcx-rp{stroke:currentColor}
.dcx-user{stroke:var(--vp-c-text-3)}
.dcx-frame{stroke:currentColor;stroke-width:1.4;opacity:.42}
.dcx-life{stroke-width:1.4;opacity:.32}
.dcx-actor{font-family:var(--vp-font-family-base);font-size:12.5px;font-weight:600;fill:var(--vp-c-text-1);stroke:none}
.dcx-actor-op{font-family:var(--vp-font-family-base);font-size:13px;font-weight:700;fill:var(--vp-c-brand-2);stroke:none}
.dcx-sub{font-family:var(--vp-font-family-base);font-size:10.5px;fill:var(--vp-c-text-3);stroke:none}
.dcx-hdr{font-family:var(--vp-font-family-base);font-size:10.5px;font-weight:600;letter-spacing:.04em;fill:var(--vp-c-text-3);stroke:none}
.dcx-note{font-family:var(--vp-font-family-base);font-size:11.5px;fill:var(--vp-c-text-2);stroke:none}
.dcx-mono{font-family:var(--vp-font-family-mono);font-size:11.5px;fill:var(--vp-c-text-1);stroke:none}
.dcx-step{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-3);stroke:none}
</style>

<svg role="img" aria-labelledby="dc-seq-title" viewBox="0 0 720 452" width="720" style="max-width:100%;height:auto" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="dc-seq-title">Device Code（RFC 8628）のシーケンス。ブラウザを持たないデバイスが OP を poll する一方、ユーザは別のブラウザで user_code を入力して承認する。</title>
  <line class="dcx-rp dcx-life" x1="115" y1="50" x2="115" y2="446"/>
  <line class="dcx-op dcx-life" x1="360" y1="50" x2="360" y2="446"/>
  <line class="dcx-user dcx-life" x1="605" y1="50" x2="605" y2="446"/>
  <rect class="dcx-frame" x="44" y="198" width="644" height="166" rx="6"/>
  <rect class="dcx-rp" x="20" y="6" width="190" height="44" rx="6"/>
  <rect class="dcx-op" x="265" y="6" width="190" height="44" rx="6"/>
  <rect class="dcx-user" x="510" y="6" width="190" height="44" rx="6"/>
  <text class="dcx-actor" x="115" y="24" text-anchor="middle">ブラウザを持たないデバイス</text>
  <text class="dcx-sub" x="115" y="40" text-anchor="middle">TV / CLI / IoT</text>
  <text class="dcx-actor-op" x="360" y="24" text-anchor="middle">OP</text>
  <text class="dcx-sub" x="360" y="40" text-anchor="middle">go-oidc-provider</text>
  <text class="dcx-actor" x="605" y="24" text-anchor="middle">ユーザのブラウザ</text>
  <text class="dcx-sub" x="605" y="40" text-anchor="middle">スマホ / ラップトップ</text>
  <path class="dcx-rp" d="M115 86 H360 M353 82 L360 86 L353 90"/>
  <text class="dcx-mono" x="237" y="78" text-anchor="middle"><tspan class="dcx-step">1  </tspan>POST /device_authorization</text>
  <path class="dcx-op" d="M360 124 H115 M122 120 L115 124 L122 128"/>
  <text class="dcx-mono" x="237" y="116" text-anchor="middle"><tspan class="dcx-step">2  </tspan>200 { device_code, user_code, verification_uri }</text>
  <rect class="dcx-frame" x="40" y="138" width="170" height="36" rx="4"/>
  <text class="dcx-note" x="125" y="161" text-anchor="middle"><tspan class="dcx-mono">user_code</tspan> と確認 URL を表示</text>
  <text class="dcx-hdr" x="237" y="216" text-anchor="middle">デバイスは poll</text>
  <text class="dcx-hdr" x="482" y="216" text-anchor="middle">ユーザが承認</text>
  <path class="dcx-rp" d="M115 246 H360 M353 242 L360 246 L353 250"/>
  <text class="dcx-mono" x="237" y="238" text-anchor="middle"><tspan class="dcx-step">3  </tspan>POST /token · grant_type=device_code</text>
  <path class="dcx-op" d="M360 282 H115 M122 278 L115 282 L122 286"/>
  <text class="dcx-mono" x="237" y="274" text-anchor="middle"><tspan class="dcx-step">4  </tspan>400 authorization_pending</text>
  <text class="dcx-note" x="237" y="302" text-anchor="middle">interval 秒ごとに繰り返す</text>
  <path class="dcx-user" d="M605 252 H360 M367 248 L360 252 L367 256"/>
  <text class="dcx-note" x="482" y="244" text-anchor="middle"><tspan class="dcx-step">5  </tspan><tspan class="dcx-mono">verification_uri</tspan> を開き <tspan class="dcx-mono">user_code</tspan> を入力</text>
  <path class="dcx-user" d="M605 312 H360 M367 308 L360 312 L367 316"/>
  <text class="dcx-note" x="482" y="304" text-anchor="middle"><tspan class="dcx-step">6  </tspan>ログイン + 同意 → 承認</text>
  <path class="dcx-rp" d="M115 392 H360 M353 388 L360 392 L353 396"/>
  <text class="dcx-mono" x="237" y="384" text-anchor="middle"><tspan class="dcx-step">7  </tspan>POST /token <tspan class="dcx-note">（次の poll）</tspan></text>
  <path class="dcx-op" d="M360 430 H115 M122 426 L115 430 L122 434"/>
  <text class="dcx-mono" x="237" y="422" text-anchor="middle"><tspan class="dcx-step">8  </tspan>200 { access_token, id_token? }</text>
</svg>

### CIBA（Core 1.0、poll モード）

<style scoped>
.cbx-op{stroke:var(--vp-c-brand-2)}
.cbx-rp{stroke:currentColor}
.cbx-user{stroke:var(--vp-c-text-3)}
.cbx-frame{stroke:currentColor;stroke-width:1.4;opacity:.42}
.cbx-life{stroke-width:1.4;opacity:.32}
.cbx-actor{font-family:var(--vp-font-family-base);font-size:12.5px;font-weight:600;fill:var(--vp-c-text-1);stroke:none}
.cbx-actor-op{font-family:var(--vp-font-family-base);font-size:13px;font-weight:700;fill:var(--vp-c-brand-2);stroke:none}
.cbx-sub{font-family:var(--vp-font-family-base);font-size:10.5px;fill:var(--vp-c-text-3);stroke:none}
.cbx-hdr{font-family:var(--vp-font-family-base);font-size:10.5px;font-weight:600;letter-spacing:.04em;fill:var(--vp-c-text-3);stroke:none}
.cbx-note{font-family:var(--vp-font-family-base);font-size:11.5px;fill:var(--vp-c-text-2);stroke:none}
.cbx-mono{font-family:var(--vp-font-family-mono);font-size:11.5px;fill:var(--vp-c-text-1);stroke:none}
.cbx-step{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-3);stroke:none}
</style>

<svg role="img" aria-labelledby="ciba-seq-title" viewBox="0 0 720 560" width="720" style="max-width:100%;height:auto" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="ciba-seq-title">CIBA（OIDC Core 1.0、poll モード）のシーケンス。RP が /bc-authorize で login_hint を渡し、OP がそれを解決してユーザの事前登録デバイスに push し、RP は承認まで poll する。</title>
  <line class="cbx-rp cbx-life" x1="115" y1="50" x2="115" y2="554"/>
  <line class="cbx-op cbx-life" x1="360" y1="50" x2="360" y2="554"/>
  <line class="cbx-user cbx-life" x1="605" y1="50" x2="605" y2="554"/>
  <rect class="cbx-frame" x="44" y="306" width="644" height="164" rx="6"/>
  <rect class="cbx-rp" x="20" y="6" width="190" height="44" rx="6"/>
  <rect class="cbx-op" x="265" y="6" width="190" height="44" rx="6"/>
  <rect class="cbx-user" x="510" y="6" width="190" height="44" rx="6"/>
  <text class="cbx-actor" x="115" y="24" text-anchor="middle">RP / API クライアント</text>
  <text class="cbx-sub" x="115" y="40" text-anchor="middle">POS、コールセンタ操作画面</text>
  <text class="cbx-actor-op" x="360" y="24" text-anchor="middle">OP</text>
  <text class="cbx-sub" x="360" y="40" text-anchor="middle">go-oidc-provider</text>
  <text class="cbx-actor" x="605" y="24" text-anchor="middle">ユーザの認証デバイス</text>
  <text class="cbx-sub" x="605" y="40" text-anchor="middle">事前登録済み</text>
  <path class="cbx-rp" d="M115 82 H360 M353 78 L360 82 L353 86"/>
  <text class="cbx-mono" x="237" y="74" text-anchor="middle"><tspan class="cbx-step">1  </tspan>POST /bc-authorize</text>
  <rect class="cbx-frame" x="35" y="96" width="175" height="40" rx="4"/>
  <text class="cbx-mono" x="122" y="112" text-anchor="middle">login_hint=alice</text>
  <text class="cbx-mono" x="122" y="128" text-anchor="middle">binding_message</text>
  <path class="cbx-op" d="M360 158 H398 V184 H367 M367 180 L360 184 L367 188"/>
  <text class="cbx-note" x="406" y="176" text-anchor="start"><tspan class="cbx-step">2  </tspan><tspan class="cbx-mono">HintResolver</tspan> → subject</text>
  <path class="cbx-op" d="M360 210 H605 M598 206 L605 210 L598 214"/>
  <text class="cbx-note" x="482" y="202" text-anchor="middle"><tspan class="cbx-step">3  </tspan>out-of-band push</text>
  <rect class="cbx-frame" x="510" y="224" width="190" height="34" rx="4"/>
  <text class="cbx-note" x="605" y="245" text-anchor="middle">「Acme Coffee で 800 円を承認?」</text>
  <path class="cbx-op" d="M360 286 H115 M122 282 L115 286 L122 290"/>
  <text class="cbx-mono" x="237" y="278" text-anchor="middle"><tspan class="cbx-step">4  </tspan>200 { auth_req_id, expires_in, interval }</text>
  <text class="cbx-hdr" x="237" y="326" text-anchor="middle">RP は poll</text>
  <text class="cbx-hdr" x="482" y="326" text-anchor="middle">ユーザが承認</text>
  <path class="cbx-rp" d="M115 356 H360 M353 352 L360 356 L353 360"/>
  <text class="cbx-mono" x="237" y="348" text-anchor="middle"><tspan class="cbx-step">5  </tspan>POST /token · grant_type=ciba</text>
  <path class="cbx-op" d="M360 392 H115 M122 388 L115 392 L122 396"/>
  <text class="cbx-mono" x="237" y="384" text-anchor="middle"><tspan class="cbx-step">6  </tspan>400 authorization_pending</text>
  <text class="cbx-note" x="237" y="412" text-anchor="middle">interval 秒ごとに繰り返す</text>
  <path class="cbx-user" d="M605 362 H360 M367 358 L360 362 L367 366"/>
  <text class="cbx-note" x="482" y="354" text-anchor="middle"><tspan class="cbx-step">7  </tspan>承認 → <tspan class="cbx-mono">Approve(auth_req_id)</tspan></text>
  <path class="cbx-rp" d="M115 500 H360 M353 496 L360 500 L353 504"/>
  <text class="cbx-mono" x="237" y="492" text-anchor="middle"><tspan class="cbx-step">8  </tspan>POST /token <tspan class="cbx-note">（次の poll）</tspan></text>
  <path class="cbx-op" d="M360 538 H115 M122 534 L115 538 L122 542"/>
  <text class="cbx-mono" x="237" y="530" text-anchor="middle"><tspan class="cbx-step">9  </tspan>200 { access_token, id_token, refresh_token? }</text>
</svg>

形は頭の中でマッピングできる程度には似ています。決定的な違いは斜めに伸びる矢印です。Device Code ではユーザが **コードを手に OP まで歩いてくる** のに対し、CIBA では OP が **ユーザがすでに信頼しているデバイスに手を伸ばす**。

## 脅威モデルの並列比較

**Phishing — 攻撃者がユーザを騙して *攻撃者の* リクエストを承認させる.**

- Device Code: ユーザは入力する URL のホストを目視で確認します。`user_code` 自体に session 単位の秘密値はありません（エントロピは意図的に控えめ）。ユーザがホストを打ち間違えたり phishing メールのリンクを踏んだりすれば、同じ `user_code` が攻撃者のサイトでも通ってしまいます。
- CIBA: `binding_message` が `/bc-authorize` に同梱され、ユーザの認証デバイスに表示されます。ユーザは「Acme POS 端末 #14: Acme Coffee で 800 円を承認?」を見てから承認します。文脈のない裸の push プロンプト（「異常なアクティビティを検知しました、承認しますか?」）が失敗モードです。

**`user_code` への replay / brute-force.**

- Device Code: `user_code` はユーザが手で入力できるよう短く（`BDWP-HQPK` 等）作られています。原理的には brute-force 可能です。本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) を同梱しており、`VerifyUserCode` が constant-time 比較を行い、ミスごとに strike カウンタを増やし、`MaxUserCodeStrikes`（デフォルト 5）でレコードをロックアウトします。組み込み側が用意する verification ページは **必ず** このヘルパを経由する必要があります。
- CIBA: ユーザが手で打つコードはありません。`auth_req_id` は不透明値で OP が発行します。

**`/token` ポーリングへの replay / abuse.**

- 両フローとも、ユーザが判断中は `authorization_pending` を、`interval` より速く poll してきたら `slow_down` を返します。RFC 8628 §3.5 は新しい `interval` の遵守を必須としており、OP は `LastPolledAt` と原子的に値を永続化するため、複数レプリカ構成で値をリセットされる経路はありません。
- CIBA はさらに poll-abuse ロックアウトを持ちます。`auth_req_id` 単位の違反カウンタが閾値を超えると、リクエストは `reason="poll_abuse"` で拒否され、audit catalogue に `AuditCIBAPollAbuseLockout` が記録されます。

## 本ライブラリの現状の対応

**Device Code（RFC 8628）.** フル対応、`op.WithDeviceCodeGrant()` で有効化します。verification ページ（ユーザが `user_code` を入力する画面）は **組み込み側がホスト** します。組み込み側は `devicecodekit.VerifyUserCode` と `ApproveUserCode` / `DenyUserCode` を呼んで OP 側の状態機械を進めます。Audit catalogue:

- `AuditDeviceAuthorizationIssued`、`AuditDeviceAuthorizationRejected`、`AuditDeviceAuthorizationUnboundRejected`
- `AuditDeviceCodeVerificationApproved`、`AuditDeviceCodeVerificationDenied`、`AuditDeviceCodeUserCodeBruteForce`
- `AuditDeviceCodeTokenIssued`、`AuditDeviceCodeTokenRejected`、`AuditDeviceCodeTokenSlowDown`
- `AuditDeviceCodeRevoked`（公開 `Revoke` ヘルパから発火）

**CIBA（Core 1.0）.** 現リリースでは poll モードのみ。ping / push は対象外です。`op.WithCIBA(op.WithCIBAHintResolver(...))` で組み込みます。`HintResolver` は組み込み側のフックで、受信した hint（`login_hint`、`id_token_hint`、`login_hint_token`）を subject に解決します。Audit catalogue:

- `AuditCIBAAuthorizationIssued`、`AuditCIBAAuthorizationRejected`、`AuditCIBAAuthorizationUnboundRejected`
- `AuditCIBAAuthDeviceApproved`、`AuditCIBAAuthDeviceDenied`
- `AuditCIBAPollAbuseLockout`
- `AuditCIBATokenIssued`、`AuditCIBATokenRejected`、`AuditCIBATokenSlowDown`
- `AuditCIBAPollObservationFailed`（token endpoint がきれいに反映できない状態遷移を観測したとき）

## 続きはこちら

- [Device Code 入門](/ja/concepts/device-code) — RFC 8628 の動き方、polling 応答、`user_code` brute-force の防御。
- [CIBA 入門](/ja/concepts/ciba) — CIBA Core 1.0 の動き方、hint の種類、`binding_message`、FAPI-CIBA プロファイル。
- [ユースケース: device-code の組み込み](/ja/use-cases/device-code) — `op.WithDeviceCodeGrant`、verification ページの契約、cascade revocation。
- [ユースケース: CIBA の組み込み](/ja/use-cases/ciba) — `op.WithCIBA`、`HintResolver` の契約、FAPI-CIBA の制約。
- [Audit イベント](/ja/reference/audit-events) — payload 形式付きの全カタログ。
