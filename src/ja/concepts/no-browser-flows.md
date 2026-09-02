---
title: ブラウザを使わないフロー — CIBA と Device Code
description: CIBA の poll 方式と RFC 8628 Device Code を比較 — hint による識別、opaque な検証試行、組み込み側の責任範囲の違いを整理する。
pageClass: pg-concepts-no-browser-flows
---

# ブラウザを使わないフロー: CIBA と Device Code

[Device Code（RFC 8628）](/ja/concepts/device-code)と[CIBA（OpenID Connect Client-Initiated Backchannel Authentication 1.0）](/ja/concepts/ciba)は、同じ大きな状況に対して仕様が用意している 2 つの grant です。状況とは「アクセストークンを欲しがるデバイスがまともなブラウザを持てない」こと。スマート TV、ゲーム機、CLI ツール、IoT、音声アシスタント、POS 端末、コールセンタの操作画面、ユーザの代わりに動くサーバ側プロセス、などです。

遠目に見ると 2 つのフローは同じ形に見えます — 「2 つの面が OP で合流して、ユーザはスマホで承認する」。実際には違います。両者は **誰がリクエストを起こすか** と **ユーザがどう OP に識別されるか** で分かれており、その 1 点が他のほぼ全ての違い（通信路上のエンドポイント、ポーリングの主体、フィッシング対策の主軸、適用される規制プロファイル）を決めています。

本ページは選択ガイドです。仕様としての動き方は[Device Code](/ja/concepts/device-code)と[CIBA](/ja/concepts/ciba)の各ページに置いてあります。

## 1 段落ずつでまとめる

**Device Code（RFC 8628）.** ブラウザを持たないデバイスが OP に「使い切りのコードをくれ」と頼み、自分の画面に表示し、ユーザに「この URL をスマホで開いて、このコードを入力して」と告げます。ユーザは手元のブラウザで認証して承認します。その間デバイスは `/token` を poll し続け、承認が降りるのを待ちます。ユーザの識別は **フローの途中で発覚** します — TV の前に誰がやって来るかは OP もデバイスも事前には知りません。

**CIBA（Core 1.0）.** RP はすでにユーザが誰かを知っています — `login_hint`（`alice@example.com`、口座番号など）、`id_token_hint`（過去に発行された ID トークン）、`login_hint_token`（上流のシステムが発行した署名付き JWT）のいずれかで。RP は OP に「このユーザを別経路で認証してくれ」と頼みます。組み込み側の通知・認証デバイスサービスがユーザへ通知し、OP はリクエストを保持して RP の poll に応答します。本ライブラリは poll 方式だけを実装し、ping / push 配信方式は提供しません。ユーザの識別は **RP が事前に与えるもの** なので、配備側は承認先の認証デバイスを決められます。

## 比較

| 観点 | Device Code（RFC 8628） | CIBA（Core 1.0） |
|---|---|---|
| 発端 | ブラウザを持たないデバイス（入力デバイス → OP） | RP / API クライアント（RP → OP） |
| ユーザの識別 | ユーザが別のブラウザに `user_code` を入力 | RP が `login_hint` / `id_token_hint` / `login_hint_token` を事前に渡す |
| ユーザ側の端末 | ユーザが手元に持っている任意のブラウザ | 配備側が事前登録した別経路承認用デバイス |
| フィッシング対策の主軸 | デバイスが表示する `user_code` + ユーザが verification URI のホストを目視 | ユーザの認証デバイスに表示する `binding_message` |
| ブラウザの関与 | あり（ユーザのスマホ側） | 任意 / 不要（組み込み側の認証デバイスが確認する） |
| ポーリング主体 | ブラウザを持たないデバイス | RP |
| 仕様上のエンドポイント | `/device_authorization` | `/bc-authorize` |
| token grant_type | `urn:ietf:params:oauth:grant-type:device_code` | `urn:openid:params:grant-type:ciba` |
| 主な用途 | TV アプリ、CLI ツール、kiosk、音声アシスタント、入力手段が乏しい IoT | 強力な顧客認証（PSD2 風）、金融 / ヘルスケアでの別経路承認、画面共有なしでアクセスをリセットするカスタマーサポートのフロー |
| 本ライブラリでの対応 | RFC 8628 — `op.WithGrants(grant.DeviceCode)` と `op.WithDeviceCodeGrant()` で有効化 | OIDC CIBA Core 1.0 — poll モードのみ。Discovery も `poll` だけを広告し、ping / push は実装しない |
| ブルートフォース対策 | `op/devicecodekit` の opaque attempt-key limiter + レコード単位ロックアウト（`MaxUserCodeStrikes`） | poll-abuse ロックアウト — `auth_req_id` 単位で `/token` 再試行を rate-limit、閾値超過で `AuditCIBAPollAbuseLockout` |
| FAPI プロファイルとの関係 | FAPI 2.0 には組み込まれていない（RFC 8628 自体で Baseline 相当の構成は十分） | FAPI-CIBA — FAPI 2.0 Baseline / Message Signing とは別プロファイル。JAR + DPoP \| mTLS + access TTL 10 分上限を必須化 |

::: tip 2 つの grant、同じ症状
両方の grant が存在するのは、正攻法の `authorization_code + PKCE` フローがそもそも「token を欲しがるデバイスにまともなブラウザがある」前提で組まれているからです。その前提は TV、CLI、IoT、音声アシスタント、ユーザの代わりに動くバックエンドサービス、では成り立ちません。RFC 8628 と CIBA は「ブラウザがどこか別の場所にある」という状況の、**異なる 2 つの形** を解いています。
:::

## どちらを選ぶか — 判定木

順番に 4 つの問いを通ってください。最初の問いでだいたい片付きます。

<figure class="fig">
  <div class="fig-head">CIBA か Device Code か — 4 つの問い</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-decision-title" viewBox="0 0 960 470" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-decision-title">CIBA とデバイス認可グラントのどちらを選ぶかを、4 つの問いを順にたどって決める判定木。RP がユーザを既に知っているか、デバイスに画面があるか、ユーザが認証デバイスを事前登録しているか、別経路での承認が規制要件かを順に見ます。</title>
    <!-- 1 -->
    <rect class="fg-box" x="36" y="24" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="52">RP はどのユーザかを既に知っているか</text>
    <text class="fg-xs" x="56" y="74">フロー開始前に login_hint を渡せる</text>
    <path class="fg-edge" d="M434,57 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="50" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--accent" x="530" y="28" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="52">CIBA</text>
    <text class="fg-xs" x="550" y="72">リダイレクトなしで OP がユーザに到達できる</text>
    <path class="fg-edge" d="M233,94 V116" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="110">いいえ</text>
    <!-- 2 -->
    <rect class="fg-box" x="36" y="120" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="148">トークンを求めるデバイスに画面があるか</text>
    <text class="fg-xs" x="56" y="170">短いコードと URL を表示できる程度でよい</text>
    <path class="fg-edge" d="M434,153 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="146" text-anchor="middle">はい</text>
    <rect class="fg-box" x="530" y="124" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="148">Device Code</text>
    <text class="fg-xs" x="550" y="168">ユーザがコードを別画面へ持っていく</text>
    <path class="fg-edge" d="M233,190 V212" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="206">いいえ</text>
    <!-- 3 -->
    <rect class="fg-box" x="36" y="216" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="244">ユーザは認証デバイスを事前登録しているか</text>
    <text class="fg-xs" x="56" y="266">OP が到達方法を既に知っているスマホなど</text>
    <path class="fg-edge" d="M434,249 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="242" text-anchor="middle">いいえ</text>
    <rect class="fg-box" x="530" y="220" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="244">Device Code</text>
    <text class="fg-xs" x="550" y="264">通知先が無いので、ユーザ側から来てもらう</text>
    <path class="fg-edge" d="M233,286 V308" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="302">はい</text>
    <!-- 4 -->
    <rect class="fg-box" x="36" y="312" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="340">規制下の金融・ヘルスケアで別経路承認が要件か</text>
    <text class="fg-xs" x="56" y="362">取引に使う端末から離れた場所で承認する必要がある</text>
    <path class="fg-edge" d="M434,345 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="338" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--accent" x="530" y="316" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="340">CIBA</text>
    <text class="fg-xs" x="550" y="360">binding_message が 2 つの端末を結び付ける</text>
    <path class="fg-edge" d="M233,382 V404" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="398">いいえ</text>
    <!-- 既定 -->
    <rect class="fg-box" x="36" y="408" width="888" height="54" rx="8"/>
    <text class="fg-t2" x="56" y="430">既定は Device Code</text>
    <text class="fg-xs" x="56" y="450">要求するものが少なくて済みます。hint resolver も通知チャネルの運用も要りません</text>
  </svg>
  <figcaption class="fig-note">分かれ目は、どちらから話しかけるかです。Device Code はユーザ側に OP を探してもらう方式で、CIBA は事前に伝えられた端末へ OP から働きかける方式です。後者はその通知チャネルを自分で運用している場合にだけ成立します。</figcaption>
</figure>

**1. RP はフロー開始 *前* にユーザが誰かを知っているか?**

- **はい** → CIBA。RP はすでに `login_hint`（または ID トークン、hint token）を持っており、`/bc-authorize` に乗せて送れます。ユーザは自分を識別するための入力をしません。
- **いいえ** → Device Code。ユーザは verification ページでサインインすることでフローの中で自分を識別し、OP はそこでユーザが誰かを知ります。

**2. token を欲しがるデバイスに画面はあるか?**

- **ある** → Device Code がそのまま `user_code` と `verification_uri` を表示できます。TV / ゲーム機 / CLI の典型ケース。
- **ない（音声アシスタント、ヘッドレス IoT 等）** → どちらでも動きます。Device Code は TTS で `user_code` を読み上げる、`verification_uri_complete` を QR で出す等の方法が取れます。CIBA は別の認証デバイスを使い、組み込み側の通知サービスが承認 prompt を届けるため、利用デバイス自体の表示は不要です。

**3. ユーザは認証デバイスを事前登録しているか?**

- **CIBA は前提とします。** 事前登録された認証デバイスがないと、組み込み側の承認サービスは届け先を持ちません。そのデバイスを事前登録する工程（銀行アプリ、スタッフのスマホ、規制当局が発行する authenticator、等）は配備の一部です。
- **Device Code は前提としません。** ユーザがサインインできる任意のブラウザセッションで動きます。本人のスマホ、同僚のラップトップ、店舗の kiosk、いずれでも。

**4. これは規制下の金融 / ヘルスケアで、別経路承認が要件になっているか?**

- **CIBA は元々その目的で設計されています。** FAPI-CIBA プロファイルは CIBA Core の上に JAR、送信者制約付きトークン（DPoP または mTLS）、access TTL 10 分上限を上乗せします。`binding_message` は規制当局が見る audit の根拠（「ユーザは何を承認したのかを正確に見ていた」）です。
- **Device Code は汎用的な仕組みです。** 適切に組めば十分機能しますが、規制当局が SCA で名指ししてくる形にはなっていません。

判定木を抜けてもまだ迷うなら、既定としては「画面はあるがブラウザがない」一般消費者向けには **Device Code**、「RP がユーザを把握済みで、別経路で承認だけしてほしい」業務向けには **CIBA** を選んでください。

## シーケンス図

### Device Code（RFC 8628）

<figure class="fig">
  <div class="fig-head">Device Code（RFC 8628）</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-devicecode-title" viewBox="0 0 960 470" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-devicecode-title">デバイス認可グラント。ブラウザを持たないデバイスが device_code と短い user_code を要求し、コードと URL を画面に表示し、ユーザが別のブラウザで承認する間トークンエンドポイントを poll します。</title>
    <line class="fg-life" x1="150" y1="62" x2="150" y2="454"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="454"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="454"/>
    <rect class="fg-box" x="55" y="16" width="190" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">ブラウザの無いデバイス</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">TV · CLI · IoT</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="735" y="16" width="190" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">ユーザのブラウザ</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">スマホでもラップトップでもよい</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="96" r="8.5"/>
    <text class="fg-badge-t" x="15" y="99" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,96 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="325" y="90" text-anchor="middle">POST /device_authorization</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="130" r="8.5"/>
    <text class="fg-badge-t" x="15" y="133" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,130 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="124" text-anchor="middle">200 · { device_code, user_code, verification_uri }</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="176" r="8.5"/>
    <text class="fg-badge-t" x="15" y="179" text-anchor="middle">3</text>
    <rect class="fg-box fg-box--sub" x="55" y="156" width="330" height="40" rx="6"/>
    <text class="fg-xs" x="71" y="181">デバイスが <tspan class="fg-accent">user_code</tspan> と開く URL を表示する</text>
    <!-- par -->
    <rect class="fg-frame" x="44" y="216" width="896" height="176" rx="8"/>
    <rect class="fg-box fg-box--muted" x="44" y="216" width="52" height="18" rx="4"/>
    <text class="fg-tab" x="56" y="229">par</text>
    <line class="fg-rule fg-rule--dashed" x1="44" y1="322" x2="940" y2="322"/>
    <rect class="fg-frame" x="64" y="246" width="600" height="66" rx="6"/>
    <rect class="fg-box fg-box--muted" x="64" y="246" width="168" height="18" rx="4"/>
    <text class="fg-tab" x="76" y="259">loop · interval 秒ごと</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="278" r="8.5"/>
    <text class="fg-badge-t" x="15" y="281" text-anchor="middle">4</text>
    <path class="fg-edge" d="M150,278 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="325" y="272" text-anchor="middle">POST /token · grant_type=…:device_code</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="304" r="8.5"/>
    <text class="fg-badge-t" x="15" y="307" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--muted" d="M500,304 H150" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="325" y="298" text-anchor="middle">400 · authorization_pending</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="364" r="8.5"/>
    <text class="fg-badge-t" x="15" y="367" text-anchor="middle">6</text>
    <path class="fg-edge" d="M830,364 H500" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="665" y="344" text-anchor="middle">verification_uri を開き、user_code を入力し、</text>
    <text class="fg-xs" x="665" y="357" text-anchor="middle">ログインして承認する</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="418" r="8.5"/>
    <text class="fg-badge-t" x="15" y="421" text-anchor="middle">7</text>
    <path class="fg-edge" d="M150,418 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="412" text-anchor="middle">POST /token — 次の poll</text>
    <!-- 8 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="448" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="451" text-anchor="middle">8</text>
    <path class="fg-edge fg-edge--accent" d="M500,448 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="442" text-anchor="middle">200 · { access_token, id_token? }</text>
  </svg>
  <figcaption class="fig-note">デバイスとブラウザは互いに接続されていません。両者の間を移動するのは <code>user_code</code> だけで、それを運ぶのは片方の画面を読んでもう片方に入力する人間です。</figcaption>
</figure>

### CIBA（Core 1.0、poll モード）

<figure class="fig">
  <div class="fig-head">CIBA（OIDC Core 1.0、poll モード）</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-ciba-title" viewBox="0 0 960 470" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-ciba-title">CIBA の poll モード。RP が backchannel authentication エンドポイントで login hint を渡し、OP がそれを subject に解決し、組み込み側の通知サービスがユーザの事前登録デバイスへ届け、RP は承認が届くまで poll します。</title>
    <line class="fg-life" x1="150" y1="62" x2="150" y2="454"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="454"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="454"/>
    <rect class="fg-box" x="55" y="16" width="190" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">RP / API クライアント</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">POS · コールセンタ操作画面</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="735" y="16" width="190" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">ユーザの認証デバイス</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">事前登録済み</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="102" r="8.5"/>
    <text class="fg-badge-t" x="15" y="105" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,102 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="325" y="82" text-anchor="middle">POST /bc-authorize</text>
    <text class="fg-mxs" x="325" y="95" text-anchor="middle">login_hint=alice · binding_message</text>
    <!-- 2 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="132" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="135" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,124 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="136">HintResolver → subject</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="180" r="8.5"/>
    <text class="fg-badge-t" x="15" y="183" text-anchor="middle">3</text>
    <path class="fg-edge" d="M500,180 H830" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="665" y="160" text-anchor="middle">組み込み側の通知サービスが届ける</text>
    <text class="fg-mxs" x="665" y="173" text-anchor="middle">「Acme Coffee で 800 円を承認?」</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="210" r="8.5"/>
    <text class="fg-badge-t" x="15" y="213" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M500,210 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="204" text-anchor="middle">200 · { auth_req_id, expires_in, interval }</text>
    <!-- par -->
    <rect class="fg-frame" x="44" y="230" width="896" height="162" rx="8"/>
    <rect class="fg-box fg-box--muted" x="44" y="230" width="52" height="18" rx="4"/>
    <text class="fg-tab" x="56" y="243">par</text>
    <line class="fg-rule fg-rule--dashed" x1="44" y1="330" x2="940" y2="330"/>
    <rect class="fg-frame" x="64" y="258" width="600" height="62" rx="6"/>
    <rect class="fg-box fg-box--muted" x="64" y="258" width="168" height="18" rx="4"/>
    <text class="fg-tab" x="76" y="271">loop · interval 秒ごと</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="288" r="8.5"/>
    <text class="fg-badge-t" x="15" y="291" text-anchor="middle">5</text>
    <path class="fg-edge" d="M150,288 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="325" y="282" text-anchor="middle">POST /token · grant_type=…:ciba</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="312" r="8.5"/>
    <text class="fg-badge-t" x="15" y="315" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--muted" d="M500,312 H150" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="325" y="306" text-anchor="middle">400 · authorization_pending</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="366" r="8.5"/>
    <text class="fg-badge-t" x="15" y="369" text-anchor="middle">7</text>
    <path class="fg-edge" d="M830,366 H500" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="665" y="346" text-anchor="middle">ユーザが認証デバイス上で承認する</text>
    <text class="fg-mxs" x="665" y="359" text-anchor="middle">Approve(auth_req_id)</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="418" r="8.5"/>
    <text class="fg-badge-t" x="15" y="421" text-anchor="middle">8</text>
    <path class="fg-edge" d="M150,418 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="412" text-anchor="middle">POST /token — 次の poll</text>
    <!-- 9 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="448" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="451" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M500,448 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="442" text-anchor="middle">200 · { access_token, id_token, refresh_token? }</text>
  </svg>
  <figcaption class="fig-note">上の図との違いは手順 3 です。ここでは OP からユーザに働きかけるため、解決できる hint と送信できるチャネルの両方が必要になります。手順 5 から 9 の poll ループはどちらの方式でも同じです。</figcaption>
</figure>

形は頭の中でマッピングできる程度には似ています。決定的な違いは斜めに伸びる矢印です。Device Code ではユーザが **コードを手に OP まで歩いてくる** のに対し、CIBA では OP が **ユーザがすでに信頼しているデバイスに手を伸ばす**。

## 脅威モデルの並列比較

**Phishing — 攻撃者がユーザを騙して *攻撃者の* リクエストを承認させる.**

- Device Code: ユーザは入力する URL のホストを目視で確認します。`user_code` 自体に session 単位の秘密値はありません（エントロピは意図的に控えめ）。ユーザがホストを打ち間違えたり phishing メールのリンクを踏んだりすれば、同じ `user_code` が攻撃者のサイトでも通ってしまいます。
- CIBA: `binding_message` が `/bc-authorize` に同梱され、ユーザの認証デバイスに表示されます。ユーザは「Acme POS 端末 #14: Acme Coffee で 800 円を承認?」を見てから承認します。文脈のない別経路確認画面（「異常なアクティビティを検知しました、承認しますか?」）が失敗モードです。

**`user_code` への replay / brute-force.**

- Device Code: `user_code` はユーザが手で入力できるよう短く（`BDWP-HQPK` 等）作られています。原理的には総当たり可能です。本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) を同梱しており、最初の手入力は raw `user_code` ではない opaque なサーバ側 ceremony key と `VerifyUserCodeByAttemptKey` で検証し、その後 `ApproveUserCode` または `DenyUserCode` を呼びます。レコード単位の helper は `MaxUserCodeStrikes`（既定 5）も適用します。組み込み側が用意する verification ページは **必ず** このヘルパを経由してください。
- CIBA: ユーザが手で打つコードはありません。`auth_req_id` は不透明値で OP が発行します。

**`/token` ポーリングへの replay / abuse.**

- 両フローとも、ユーザが判断中は `authorization_pending` を、`interval` より速く poll してきたら `slow_down` を返します。RFC 8628 §3.5 は新しい `interval` の遵守を必須としており、OP は `LastPolledAt` と原子的に値を永続化するため、複数レプリカ構成で値をリセットされる経路はありません。
- CIBA はさらに poll-abuse ロックアウトを持ちます。`auth_req_id` 単位の違反カウンタが閾値を超えると、リクエストは `reason="poll_abuse"` で拒否され、audit catalogue に `AuditCIBAPollAbuseLockout` が記録されます。

## 本ライブラリの現状の対応

**Device Code（RFC 8628）.** フル対応、`op.WithGrants(grant.DeviceCode)` と `op.WithDeviceCodeGrant()` で有効化します。verification ページ（ユーザが `user_code` を入力する画面）は **組み込み側がホスト** します。最初の手入力は raw `user_code` ではない opaque なサーバ側 ceremony key と `devicecodekit.VerifyUserCodeByAttemptKey` で検証し、その後 `ApproveUserCode` / `DenyUserCode` を呼びます。`devicecodekit.Deps` は pointer のまま保持・受け渡しし、既定 limiter はプロセス内限定です。複数インスタンスでは共有 atomic `AttemptLimiter` を注入します。Audit は `Deps.AuditLogger` 経由です。Audit catalogue:

- `AuditDeviceAuthorizationIssued`、`AuditDeviceAuthorizationRejected`、`AuditDeviceAuthorizationUnboundRejected`
- `AuditDeviceCodeVerificationApproved`、`AuditDeviceCodeVerificationDenied`、`AuditDeviceCodeUserCodeBruteForce`
- `AuditDeviceCodeTokenIssued`、`AuditDeviceCodeTokenRejected`、`AuditDeviceCodeTokenSlowDown`
- `AuditDeviceCodeRevoked`（公開 `Revoke` ヘルパから発火）

**CIBA（Core 1.0）.** poll モードのみで、Discovery も `poll` だけを広告します。ping / push 配信方式は提供しません。`op.WithGrants(grant.CIBA)` と `op.WithCIBA(op.WithCIBAHintResolver(...))` で組み込みます。`HintResolver` は組み込み側のフックで、受信した hint（`login_hint`、`id_token_hint`、`login_hint_token`）を subject に解決します。`id_token_hint` は OP が署名・issuer・認証済みクライアント audience を検証し、検証済み `sub` だけを resolver に渡します。`exp` は意図的に検証せず、pairwise client は resolver 前に拒否します。Audit catalogue:

- `AuditCIBAAuthorizationIssued`、`AuditCIBAAuthorizationRejected`、`AuditCIBAAuthorizationUnboundRejected`
- `AuditCIBAPollAbuseLockout`
- `AuditCIBATokenIssued`、`AuditCIBATokenRejected`、`AuditCIBATokenSlowDown`
- `AuditCIBAPollObservationFailed`（token endpoint がきれいに反映できない状態遷移を観測したとき）

認証デバイスの callback は組み込み側が CIBA substore を直接呼ぶ経路です。その呼び出しに対して本ライブラリは `AuditCIBAAuthDeviceApproved` / `AuditCIBAAuthDeviceDenied` を発火しません。これらの名前は配備側 telemetry 用のカタログです。

## 続きはこちら

- [Device Code 入門](/ja/concepts/device-code) — RFC 8628 の動き方、polling 応答、`user_code` brute-force の防御。
- [CIBA 入門](/ja/concepts/ciba) — CIBA Core 1.0 の動き方、hint の種類、`binding_message`、FAPI-CIBA プロファイル。
- [使い方: device-code の組み込み](/ja/use-cases/device-code) — `op.WithDeviceCodeGrant`、verification ページの契約、cascade revocation。
- [使い方: CIBA の組み込み](/ja/use-cases/ciba) — `op.WithCIBA`、`HintResolver` の契約、FAPI-CIBA の制約。
- [Audit イベント](/ja/reference/audit-events) — 中身の形式付きの全カタログ。
