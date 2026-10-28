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
| 本ライブラリでの対応 | RFC 8628 — `op.WithDeviceCodeGrant()` で有効化 | OIDC CIBA Core 1.0 — poll モードのみ。Discovery も `poll` だけを広告し、ping / push は実装しない |
| ブルートフォース対策 | `op/devicecodekit` の opaque attempt-key limiter + レコード単位ロックアウト（`MaxUserCodeStrikes`、5 回）、さらに `slow_down` 違反 5 回で poll-abuse ロックアウト | poll-abuse ロックアウト — `auth_req_id` ごとに `slow_down` 違反 5 回（`WithCIBAMaxPollViolations`）、閾値超過で `AuditCIBAPollAbuseLockout`。ユーザが打つコードがないので推測の対象もない |
| FAPI プロファイルとの関係 | Device Code は FAPI 2.0 Security Profile で分析済みの認可フローには含まれません | FAPI-CIBA は FAPI 2.0 Security Profile / Message Signing とは別のプロファイルです。本ライブラリの CIBA 設定は JAR、DPoP または mTLS、アクセストークンの有効期間と `auth_req_id` の有効期間の上限 10 分を要求します |

::: tip 2 つの grant、同じ症状
両方の grant が存在するのは、正攻法の `authorization_code + PKCE` フローがそもそも「token を欲しがるデバイスにまともなブラウザがある」前提で組まれているからです。その前提は TV、CLI、IoT、音声アシスタント、ユーザの代わりに動くバックエンドサービス、では成り立ちません。RFC 8628 と CIBA は「ブラウザがどこか別の場所にある」という状況の、**異なる 2 つの形** を解いています。
:::

## どちらを選ぶか — 判定木

順番に 4 つの問いを通ってください。最初の問いでだいたい片付きます。

<figure class="fig">
  <div class="fig-head">4 つの問いで CIBA か Device Code かが決まる</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-decision-title" viewBox="0 0 960 568" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-decision-title">CIBA とデバイス認可グラントのどちらを選ぶかを、4 つの問いを順にたどって決める判定木。RP がユーザを既に知っているか、デバイスに画面があるか、ユーザが認証デバイスを事前登録しているか、別経路での承認が規制要件かを順に見ます。</title>
    <!-- question 1 -->
    <rect class="fg-box" x="32" y="24" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="52">RP は事前にユーザを特定できるか</text>
    <text class="fg-s" x="48" y="76">フロー開始前に login_hint を渡せる</text>
    <path class="fg-edge" d="M424,60 H536" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="480" y="50" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--accent" x="536" y="24" width="392" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="552" y="52">CIBA</text>
    <text class="fg-s" x="552" y="76">OP がユーザに直接到達できる</text>
    <path class="fg-edge" d="M228,96 V136" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="121">いいえ</text>
    <!-- question 2 -->
    <rect class="fg-box" x="32" y="136" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="164">デバイスに画面があるか</text>
    <text class="fg-s" x="48" y="188">短いコードと URL を表示できればよい</text>
    <path class="fg-edge" d="M424,172 H536" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="480" y="162" text-anchor="middle">はい</text>
    <rect class="fg-box" x="536" y="136" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="552" y="164">Device Code</text>
    <text class="fg-s" x="552" y="188">ユーザがコードをスマホへ持っていく</text>
    <path class="fg-edge" d="M228,208 V248" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="233">いいえ</text>
    <!-- question 3 -->
    <rect class="fg-box" x="32" y="248" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="276">ユーザは認証デバイスを登録済みか</text>
    <text class="fg-s" x="48" y="300">OP が到達方法を知っているスマホなど</text>
    <path class="fg-edge" d="M424,284 H536" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="480" y="274" text-anchor="middle">いいえ</text>
    <rect class="fg-box" x="536" y="248" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="552" y="276">Device Code</text>
    <text class="fg-s" x="552" y="300">通知先が無いのでユーザに来てもらう</text>
    <path class="fg-edge" d="M228,320 V360" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="345">はい</text>
    <!-- question 4 -->
    <rect class="fg-box" x="32" y="360" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="388">別経路での承認が要件か</text>
    <text class="fg-s" x="48" y="412">規制下の金融・ヘルスケアで、端末から離れて</text>
    <path class="fg-edge" d="M424,396 H536" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="480" y="386" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--accent" x="536" y="360" width="392" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="552" y="388">CIBA</text>
    <text class="fg-s" x="552" y="412">binding_message が 2 つの端末を結ぶ</text>
    <path class="fg-edge" d="M228,432 V472" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="457">いいえ</text>
    <!-- default -->
    <rect class="fg-box" x="32" y="472" width="896" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="500">既定は Device Code</text>
    <text class="fg-s" x="48" y="524">要求するものが少ない。hint resolver も通知チャネルの運用も要らない</text>
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

- **CIBA はこの用途のために設計されています。** 旧 FAPI-CIBA-ID1 は FAPI 1.0 と mTLS を基礎としています。本ライブラリの `profile.FAPICIBA` は JAR を要求し、送信者制約として DPoP または mTLS を認め、アクセストークンの有効期間を 10 分以内に制限します。この設定だけで ID1 への適合は示せません。`binding_message` は、ユーザが承認するリクエストを識別する助けになります。
- **Device Code は汎用的な仕組みです。** 適切に組めば十分機能しますが、規制当局が SCA で名指ししてくる形にはなっていません。

判定木を抜けてもまだ迷うなら、既定としては「画面はあるがブラウザがない」一般消費者向けには **Device Code**、「RP がユーザを把握済みで、別経路で承認だけしてほしい」業務向けには **CIBA** を選んでください。

## シーケンス図

### Device Code（RFC 8628）

<figure class="fig">
  <div class="fig-head">Device Code: コードは人間が画面の間で運ぶ</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-devicecode-title" viewBox="0 0 960 600" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-devicecode-title">デバイス認可グラント。ブラウザを持たないデバイスが device_code と短い user_code を要求し、コードと URL を画面に表示し、ユーザが別のブラウザで承認する間トークンエンドポイントを poll します。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="576"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="576"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="576"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">デバイス</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">ブラウザ無し · TV · CLI</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">ユーザのブラウザ</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">スマホやラップトップ</text>
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">POST /device_authorization</text>
    <path class="fg-edge fg-edge--accent" d="M512,192 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="182" text-anchor="middle">200 · device_code, user_code</text>
    <path class="fg-edge" d="M192,232 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="238">URL とコードを画面に表示</text>
    <text class="fg-mxs fg-accent" x="248" y="260">user_code=ABCD-EFGH</text>
    <path class="fg-edge" d="M192,328 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="318" text-anchor="middle">POST /token · poll</text>
    <path class="fg-edge fg-edge--muted" d="M512,384 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="352" y="374" text-anchor="middle">400 · authorization_pending</text>
    <path class="fg-edge" d="M824,440 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="430" text-anchor="middle">コードを入力して承認</text>
    <path class="fg-edge" d="M192,496 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="486" text-anchor="middle">POST /token · 次の poll</text>
    <path class="fg-edge fg-edge--accent" d="M512,552 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="542" text-anchor="middle">200 · access_token, id_token?</text>
  </svg>
  <figcaption class="fig-note">デバイスとブラウザは互いに接続されません。両者の間を移動するのは <code>user_code</code> だけで、それを運ぶのは片方の画面を読んでもう片方に入力する人間です。</figcaption>
</figure>

### CIBA（Core 1.0、poll モード）

<figure class="fig">
  <div class="fig-head">CIBA: OP が登録済みデバイスへ働きかける</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-ciba-title" viewBox="0 0 960 624" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-ciba-title">CIBA の poll モード。RP が backchannel authentication エンドポイントで login hint を渡し、OP がそれを subject に解決し、組み込み側の通知サービスがユーザの事前登録デバイスへ届け、RP は承認が届くまで poll します。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="600"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="600"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="600"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">POS · コールセンタ画面</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">ユーザのデバイス</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">事前登録済み</text>
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">POST /bc-authorize</text>
    <path class="fg-edge fg-edge--accent" d="M512,176 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="182">hint を subject に解決</text>
    <path class="fg-edge" d="M512,240 H824" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="230" text-anchor="middle">ユーザのデバイスへ通知</text>
    <path class="fg-edge fg-edge--accent" d="M512,296 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="286" text-anchor="middle">200 · auth_req_id</text>
    <path class="fg-edge" d="M192,352 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="342" text-anchor="middle">POST /token · poll</text>
    <path class="fg-edge fg-edge--muted" d="M512,408 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="352" y="398" text-anchor="middle">400 · authorization_pending</text>
    <path class="fg-edge" d="M824,464 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="454" text-anchor="middle">ユーザがスマホ上で承認</text>
    <path class="fg-edge" d="M192,520 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="510" text-anchor="middle">POST /token · 次の poll</text>
    <path class="fg-edge fg-edge--accent" d="M512,576 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="566" text-anchor="middle">200 · access_token, id_token</text>
  </svg>
  <figcaption class="fig-note">Device Code の図との違いは、ここでは OP からユーザに働きかける点です。そのため、解決できる hint と送信できるチャネルの両方が必要になります。その後の poll ループはどちらの方式でも同じです。</figcaption>
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
- 両フローとも、`slow_down` 違反が 5 回に達するとレコードをロックします。リクエストは `reason="poll_abuse"` で拒否され、次の poll は `access_denied` になります。CIBA では加えて `AuditCIBAPollAbuseLockout` が記録され、CIBA の閾値は `op.WithCIBAMaxPollViolations` で調整できます。

## 本ライブラリの現状の対応

**Device Code（RFC 8628）.** フル対応で、`op.WithDeviceCodeGrant()` で有効化します（この option が grant を有効な集合に加えるので、`op.WithGrants` に `grant.DeviceCode` を併記しても何も変わりません）。verification ページ（ユーザが `user_code` を入力する画面）は **組み込み側がホスト** します。最初の手入力は raw `user_code` ではない opaque なサーバ側 ceremony key と `devicecodekit.VerifyUserCodeByAttemptKey` で検証し、その後 `ApproveUserCode` / `DenyUserCode` を呼びます。`devicecodekit.Deps` は pointer のまま保持・受け渡しし、既定 limiter はプロセス内限定です。複数インスタンスでは共有 atomic `AttemptLimiter` を注入します。Audit は `Deps.AuditLogger` 経由です。Audit catalogue:

- `AuditDeviceAuthorizationIssued`、`AuditDeviceAuthorizationRejected`、`AuditDeviceAuthorizationUnboundRejected`
- `AuditDeviceCodeVerificationApproved`、`AuditDeviceCodeVerificationDenied`、`AuditDeviceCodeUserCodeBruteForce`
- `AuditDeviceCodeTokenIssued`、`AuditDeviceCodeTokenRejected`、`AuditDeviceCodeTokenSlowDown`
- `AuditDeviceCodePollObservationFailed`（token endpoint がきれいに反映できない状態遷移を観測したとき）
- `AuditDeviceCodeRevoked`（公開 `Revoke` ヘルパから発火）

**CIBA（Core 1.0）.** poll モードのみで、Discovery も `poll` だけを広告します。ping / push 配信方式は提供しません。`op.WithCIBA(op.WithCIBAHintResolver(...))` で有効化します。リゾルバは必須です。`HintResolver` は組み込み側のフックで、受信した hint（`login_hint`、`id_token_hint`、`login_hint_token`）を subject に解決します。`id_token_hint` は OP が署名・issuer・認証済みクライアント audience を検証し、検証済み `sub` だけを resolver に渡します。`exp` は意図的に検証せず、`typ` が `JWT` でないトークンは拒否し、pairwise client は resolver 前に拒否します。Audit catalogue:

- `AuditCIBAAuthorizationIssued`、`AuditCIBAAuthorizationRejected`、`AuditCIBAAuthorizationUnboundRejected`
- `AuditCIBAPollAbuseLockout`
- `AuditCIBATokenIssued`、`AuditCIBATokenRejected`、`AuditCIBATokenSlowDown`
- `AuditCIBAPollObservationFailed`（token endpoint がきれいに反映できない状態遷移を観測したとき）

認証デバイスの callback は組み込み側が CIBA substore を直接呼ぶ経路です。その呼び出しに対して本ライブラリは `AuditCIBAAuthDeviceApproved` / `AuditCIBAAuthDeviceDenied` を発火しません。これらの名前は配備側 telemetry 用のカタログです。

## 続きはこちら

- [Device Code 入門](/ja/concepts/device-code) — RFC 8628 の動き方、polling 応答、`user_code` brute-force の防御。
- [CIBA 入門](/ja/concepts/ciba) — CIBA Core 1.0 の動き方、hint の種類、`binding_message`、FAPI-CIBA プロファイル。
- [ユースケース: device-code の組み込み](/ja/use-cases/device-code) — `op.WithDeviceCodeGrant`、verification ページの契約、cascade revocation。
- [ユースケース: CIBA の組み込み](/ja/use-cases/ciba) — `op.WithCIBA`、`HintResolver` の契約、FAPI-CIBA の制約。
- [Audit イベント](/ja/reference/audit-events) — 中身の形式付きの全カタログ。
