---
title: セッションとログアウト
description: OP のブラウザセッション表現、chooser group 全体／current セッション単位の RP-Initiated Logout、上限付き Back-Channel Logout、Front-Channel Logout を実装しない理由。
pageClass: pg-concepts-sessions-and-logout
---

# セッションとログアウト

**セッション** とは、「このブラウザは時刻 T、保証レベル A で、ユーザ X として認証された」という OP 側の状態です。小さな暗号化 cookie が、ブラウザをその状態に紐付けます。**ログアウト** はその状態を破棄することを意味します — そして任意で、その状態に依存していた RP に「ユーザは去った」ことを通知します。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2（`auth_time`、`acr`、`amr`）
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [OpenID Connect Front-Channel Logout 1.0](https://openid.net/specs/openid-connect-frontchannel-1_0.html) — 意図的な非実装の文脈で参照
- [RFC 6265bis](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis) — `__Host-` cookie、`SameSite`
:::

::: tip 30 秒のメンタルモデル
- セッションは **OP 側** に生きていて、cookie の中ではありません。
- cookie はセッション行を指す暗号化されたポインタにすぎません。
- 「ログアウト」とはその行を消すこと。任意で RP に通知を fan-out できます。
- ブラウザ側の cookie だけ消しても、OP 上の行は残ります。行だけ消すと cookie は何も指さなくなり、次のリクエストでセッションが見つからず、ユーザは再認証になります。
:::

## 本ライブラリでのセッション表現

OP は `store.SessionStore` に次の行を保持します。

| フィールド | 内容 |
|---|---|
| `ID` | 不透明な OP ブラウザセッション識別子。cookie / セッション検索と監査相関に使います。`sid` claim としては発行されず、本 OP が送る Back-Channel Logout Token は `sub` だけを持ちます。 |
| `Subject` | OP 内部の安定したユーザ ID。ID トークンの `sub` になります（pairwise subject を有効にした場合はクライアントごとに射影されます）。 |
| `AuthTime` | ユーザがいつ認証したか。このセッションから発行されるトークンの `auth_time` にコピーされます。 |
| `ACR` | Authentication Context Class Reference — セッションが満たす保証レベル。 |
| `AMR` | Authentication Methods References（RFC 8176） — `pwd`、`otp`、`mfa`、`hwk`、… |
| `ChooserGroupID` | マルチアカウントチューザのグループ識別子。同じブラウザに属する複数セッションが共有します。 |
| `ExpiresAt`、`CreatedAt`、`UpdatedAt` | ライフサイクルのタイムスタンプ。 |

この行を指す cookie が `__Host-oidc_session` です（`internal/cookie/profile.go` で定義）。暗号化された payload には、chooser group の ID、現在のセッション ID、cookie を書いた時刻が入ります。セッションの存続期間は保存された行に対して強制されるため、cookie を再送しても延長できません。本ライブラリは合計 5 つの cookie を使います。

| Cookie | 用途 | 仕様 |
|---|---|---|
| `__Host-oidc_session` | 永続セッションへのポインタ。 | 不透明な payload を AES-256-GCM で AEAD 暗号化。`__Host-` 接頭辞で同一 origin に強制。`SameSite=Lax`、最大 14 日。 |
| `__Host-oidc_interaction` | 進行中のインタラクション（ログインフォーム、MFA チャレンジ）の状態。 | 同じ AEAD。1 時間 TTL。 |
| `__Host-oidc_csrf` | インタラクションフォームの double-submit CSRF トークン。 | HMAC のみ（AEAD なし）。`SameSite=Strict`。ブラウザセッション cookie。 |
| `__Host-oidc_logout_csrf` | `/end_session` の確認画面を GET ページから POST まで運ぶ double-submit CSRF トークン。 | HMAC のみ（AEAD なし）。`SameSite=Strict`。5 分 TTL。 |
| `__Host-oidc_locale` | インタラクション画面をまたいでユーザが選んだ UI ロケールを覚えておく。 | 平文（暗号化なし）。1 年 TTL。`SameSite=Lax`。 |

::: details `__Host-` 接頭辞とは
RFC 6265bis により、cookie 名が `__Host-` で始まるとき、ブラウザは `Secure`、`Path=/`、そして `Domain` 属性 **なし** を同時に満たさないと cookie を受理しません — つまり、OP の origin に厳密に縛られます。サブドメイン侵害でも偽造できず、兄弟ドメインからも読めません。本ライブラリが平文 HTTP では起動しないのは、まさに `__Host-` 接頭辞がそれでは成立しないからです。
:::

セッション行は `store.SessionStore` を経由します — 組み込み側がライブラリの不変条件を破ることなく、揮発性のバックエンド（Redis など）に振り向けてもよい substore です。トレードオフは [設計判断 #10](/ja/security/design-judgments#dj-10) を参照。

## `/auth` でのセッションの再利用

ブラウザが有効なセッションを持って `/auth` に来たとき、OP はリクエストごとに、そのセッションで処理してよいかを判断します。

| リクエスト | 挙動 |
|---|---|
| `prompt=login` | セッションは再利用せず、ユーザは最初から再認証する。 |
| セッションの `auth_time` からの経過時間より短い `max_age` | 同じく、完全な再認証。 |
| セッションの `acr` が満たさない `acr_values` または essential な `acr` | step-up を実行する。発行されるトークンはセッションの `acr`・`amr`・`auth_time` を保持し、step-up の factor は `mfa.*` イベントとして監査される。 |
| `LoginFlow` のルールまたは `Decider` が別の step を要求 | セッションの subject からチェーンを実行するため、`Primary` は繰り返さない。 |
| 上のいずれにも該当しない | セッションが要求を処理し、トークンはその `auth_time`・`acr`・`amr` を持つ。 |

`prompt=none` では、UI が必要になる行はエラーを返します。アカウントチューザで古い、または保証の弱いセッションを選ぶと、リクエストを失敗させず再認証を求めます。

## ログアウトの分類

ログアウトに関わる OIDC 仕様は 3 つあります。本ライブラリは 2 つを実装します。

### RP-Initiated Logout 1.0

RP はブラウザを次の URL にリダイレクトします。

```
GET /end_session?id_token_hint=<id_token>&post_logout_redirect_uri=<uri>&state=<opaque>
```

OP は次のことを行います。

1. `id_token_hint` を検証する。署名、`aud` が登録済みクライアントを指すこと、`typ` が無いか `JWT` であることを確認し、logout token やアクセストークンは拒否します。期限切れの ID トークンは受理します。古いタブからのログアウトが典型的だからです。
2. ヒントの `sub` がセッション cookie の subject と一致しない限り、確認画面を表示する。ヒントが別の subject のものである場合や、ヒントが無い場合は、必ず確認画面を挟みます。
3. `logout_scope` を解決し、選択されたセッション行を削除。
4. `post_logout_redirect_uri` がそのクライアントに登録されていれば、`state` を反射させてブラウザをリダイレクト。

| `logout_scope` | 破棄されるセッション |
|---|---|
| 省略（既定） | ブラウザの chooser group にあるすべてのセッション。 |
| `current` | アクティブなセッションだけ。兄弟セッションが残れば cookie をそのセッションへ再バインドする。 |
| 空値、未知の値、重複 | なし。状態を変更する前に HTTP 400 で拒否する。 |

セッション cookie の subject と一致しない `id_token_hint` では確認画面を省略できません。セッションストアの transport 障害がセッションの解決または破棄中に起きた場合、`/end_session` は静的な HTTP 503 ページを返します。`post_logout_redirect_uri` へはリダイレクトせず、cookie とセッション行をそのまま残します。セッションが存在しない、または期限切れの場合は別の安全に継続できるケースです。

`/end_session` が返す確認画面とブラウザ向けエラー HTML には、`X-Frame-Options: DENY` と `frame-ancestors 'none'` を含む Content-Security-Policy の両方が付くため、どちらの画面も埋め込めません。

native / public client では、`redirect_uri` と同じ RFC 8252 の loopback any-port ルールを `post_logout_redirect_uri` にも適用します。固定の loopback URI を登録しておき、logout 時には別の ephemeral port で戻る形を許容します。変動できるのは port だけで、host / scheme / path は登録形状と一致している必要があります。

主眼は **このブラウザの OP セッションを終わらせる** ことです。ログアウトを起点にした RP はそれを把握していますが、他の RP は、OP が Back-Channel Logout も動かしていない限り把握できません。

### Back-Channel Logout 1.0

`/end_session` がセッションを終了すると、OP はその subject の grant から導出した対象 RP それぞれに、署名された `logout_token` JWT を `POST` します。RP は JWT を検証し、自身のローカルセッションを無効化します。

これは server-to-server で動きます。ブラウザは関与しないので、ユーザがタブを閉じていても、別のブラウザに移っていても動作します。公開されているセッションログアウトの入口は `/end_session` です。

外向き HTTP リクエストは、JWKS / sector_identifier_uri 取得と同じ SSRF 拒否リストでガードされます — 組み込み側が明示的にオプトインしない限り、private network には到達しません。失敗は `op.AuditLogoutBackChannelFailed`、成功は `op.AuditLogoutBackChannelDelivered` で記録されます。session-bearing logout notice の grant 由来 RP audience が空の場合は `op.AuditBCLNoSessionsForSubject` が出ます — 「RP の対象を解決できなかった」と「配送に失敗した」を区別するのに有用です。

detached fan-out には独立した 2 つの時間制限があります。`op.WithBackchannelLogoutTimeout` は 1 RP への HTTP 配送（既定 5 秒）を制限し、`op.WithBackchannelFanOutBudget` は detached fan-out 全体（既定 30 秒）を制限します。後者は RP ごとの timeout ではなく、イベント全体の予算です。実行中の fan-out は `Provider.Shutdown(ctx)` でも drain されます。

::: warning 揮発セッション下では Back-Channel Logout は best-effort
揮発な `store.SessionStore` が `/end_session` の解決と snapshot 取得より前に行を追い出すと、ブラウザからの logout trigger を失い detached fan-out は起動しません。snapshot を取得できた場合、RP audience は `SessionStore` の行を辿らず grant store から解決されます。session-bearing notice で grant 由来 RP 対象が 0 件の場合だけ、対象 0 件として監査されます。`op.SessionDurabilityPosture` ノブは trigger / snapshot の喪失と対象 0 件をダッシュボードで解釈する文脈を提供します。詳細は [設計判断 #10](/ja/security/design-judgments#dj-10) を参照。
:::

### Front-Channel Logout 1.0 — 非実装

Front-Channel Logout は、OP が RP ごとの `frontchannel_logout_uri` をひとつずつ `<iframe>` で並べた HTML を返し、各 iframe が third-party context で自身の cookie を読みに行って消す、という仕組みです。この仕組みは「third-party iframe が embedded context から自身の cookie を読める」という前提に依存しており、主要ブラウザは段階的にこの能力を取り去ってきました。

- Safari ITP（2017 年〜）
- Firefox ETP（2019 年〜）
- Chrome の `SameSite=Lax` 既定化（2020 年〜）
- third-party cookie の段階的廃止（2024〜2025 年）

本ライブラリは Front-Channel Logout を **実装しません**。discovery 文書でも `frontchannel_logout_supported` は広告しません。fan-out 型のログアウトが必要な組み込み側は、ブラウザの cookie ポリシーから独立した server-to-server の Back-Channel Logout 1.0 を使います。完全な背景は [設計判断 #5](/ja/security/design-judgments#dj-5) を参照。

## End-session カスケード

`/end_session` は cookie を消すだけではありません。破棄するセッションに含まれる subject ごとに、本ライブラリはその subject が持つすべての grant を走査し、grant の配下で発行された認証情報（JWT と opaque のアクセストークン、リフレッシュトークン）を失効させます。grant の記録自体は残るため、ユーザの同意は覚えられたままです。JWT アクセストークンは OP が応答するエンドポイント（`/userinfo`、`/introspect`）で inactive になります。opaque アクセストークンは introspection を経由するすべての RS で inactive になります。

<figure class="fig">
  <div class="fig-head">セッション終了は連鎖するが、全トークンには届かない</div>
  <svg class="fig-svg" role="img" aria-labelledby="session-cascade-title" viewBox="0 0 960 720" xmlns="http://www.w3.org/2000/svg">
    <title id="session-cascade-title">上段はセッションモデル。OP オリジンに紐づく 5 つの cookie のうち 1 つが SessionStore の行 ID を運び、OP 側の状態はその行が持ちます。下段は end-session のカスケード。行を削除し、各 grant を走査してその配下のアクセストークンとリフレッシュトークンを失効させ、登録済みの back-channel logout URI すべてに logout_token を POST します。注記として、JWT アクセストークンを拒否するのは OP だけで、opaque なトークンは各リソースサーバが introspect して初めて無効になります。</title>
    <!-- session model band -->
    <rect class="fg-group" x="32" y="24" width="896" height="176" rx="8"/>
    <text class="fg-lbl" x="56" y="52">セッションモデル</text>
    <rect class="fg-box" x="56" y="80" width="336" height="96" rx="8"/>
    <text class="fg-t2" x="72" y="108">ブラウザの cookie</text>
    <text class="fg-mxs" x="72" y="132">__Host-oidc_* × 5</text>
    <text class="fg-xs" x="72" y="156">OP オリジンに紐づき、RP には渡らない</text>
    <path class="fg-edge" d="M392,128 H488" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="440" y="118" text-anchor="middle">行 ID</text>
    <rect class="fg-box fg-box--accent" x="488" y="80" width="416" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="504" y="108">SessionStore</text>
    <text class="fg-xs" x="504" y="132">1 セッション 1 行で OP 側の状態を持つ</text>
    <text class="fg-mxs" x="504" y="156">ID · Subject · AuthTime · ACR · AMR</text>
    <!-- cascade band -->
    <rect class="fg-group" x="32" y="232" width="896" height="464" rx="8"/>
    <text class="fg-lbl" x="56" y="260">end-session カスケード</text>
    <rect class="fg-box" x="56" y="440" width="192" height="72" rx="8"/>
    <text class="fg-m" x="72" y="468">/end_session</text>
    <text class="fg-xs" x="72" y="492">RP 起点のログアウト</text>
    <path class="fg-leader" d="M248,476 H272 M272,324 V636"/>
    <!-- SessionStore -->
    <path class="fg-edge fg-edge--thin" d="M272,324 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="296" y="288" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="312" y="316">SessionStore</text>
    <text class="fg-xs" x="312" y="340">行を削除する</text>
    <!-- Grants -->
    <path class="fg-edge fg-edge--thin" d="M272,428 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="296" y="392" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="312" y="420">Grants</text>
    <text class="fg-xs" x="312" y="444">grant ごとに失効処理を実行する</text>
    <!-- Tokens under each grant -->
    <path class="fg-edge fg-edge--thin" d="M272,532 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="296" y="496" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="312" y="524">各 grant 配下のトークン</text>
    <text class="fg-xs" x="312" y="548">アクセス / リフレッシュを失効</text>
    <!-- Back-channel logout -->
    <path class="fg-edge fg-edge--thin" d="M272,636 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="296" y="600" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="312" y="628">Back-Channel Logout</text>
    <text class="fg-mxs" x="312" y="652">logout_token → 各 RP</text>
    <!-- reach note -->
    <path class="fg-edge fg-edge--muted" d="M560,532 H608" marker-end="url(#fg-am)"/>
    <rect class="fg-box fg-box--muted" x="608" y="496" width="296" height="96" rx="8"/>
    <text class="fg-t2" x="624" y="524">どこまで届くか</text>
    <text class="fg-xs" x="624" y="548">JWT: OP は拒否する</text>
    <text class="fg-xs" x="624" y="572">opaque: RS の introspect 待ち</text>
    <rect class="fg-pill fg-pill--warn" x="608" y="624" width="224" height="32" rx="16"/>
    <text class="fg-s" x="720" y="645" text-anchor="middle">到達範囲は各 RS 次第</text>
  </svg>
  <figcaption class="fig-note">最初の 2 つのステップは同期的で、OP の制御下にあります。トークンの失効と back-channel logout はそうではありません。すでに配られた JWT は有効期限まで形式上は正当なままですし、バックチャネル通知が効くのは URI を登録して応答する RP に限られます。</figcaption>
</figure>

cookie は単なるポインタで、セッションの実体は `SessionStore` の行です。ブラウザ側で cookie を消しても行は残るため、OP が行そのものを削除する必要があります。

| 組み込まれた store | カスケード挙動 |
|---|---|
| `Grants` を組み込み済み（同梱アダプタを使えば既定） | カスケード発火。JWT AT は `/userinfo` と `/introspect` で拒否、opaque AT は全 RS で拒否、リフレッシュトークンは更新できなくなる。 |
| `Grants` が nil | カスケードは行われない。AT は自然に `exp` まで生存。 |
| JWT の失効戦略が `None` | JWT 側は行われない。opaque AT とリフレッシュトークンは引き続き失効する。 |

理由と JWT / opaque のカスケード到達範囲の非対称性は [設計判断 #17](/ja/security/design-judgments#dj-17) を参照。

## 揮発ストアと永続ストアの選択

セッションの substore は、トランザクショナルストア（認可コード、リフレッシュトークン、client）から意図的に分離されています。組み込み側は典型的には次のいずれかを選びます。

| 方針 | `SessionStore` のバックエンド | トレードオフ |
|---|---|---|
| **Hot/cold 分離**（高トラフィック向けに推奨） | Redis（揮発） | セッション書き込みのレイテンシが低い。追い出しとログアウトが競合すると BCL は best-effort。 |
| **すべて永続** | トランザクショナルストアと同じ SQL クラスタ | BCL 配送は完全配送が前提。セッション書き込みはトークン書き込みとレイテンシを共有。 |

`op.WithSessionDurabilityPosture(...)` で組み込み側のスタンスを宣言することで、監査トレイル（`op.AuditBCLNoSessionsForSubject`）を正しく解釈できます。完全な実装例は [Hot / Cold 分離の使い方](/ja/use-cases/hot-cold-redis) を参照。

graceful shutdown では、まず HTTP トラフィックの受付を止め、その後 provider の detached 処理を drain します。

```go
srv.Shutdown(ctx)      // 受付を停止
provider.Shutdown(ctx) // detached fan-out を drain
```

## セッションライフサイクルの監査イベント

| イベント | 発火タイミング |
|---|---|
| `op.AuditSessionCreated` | 新規セッション発行。 |
| `op.AuditSessionDestroyed` | セッション行が削除された（ログアウト、追い出し、GC）。 |
| `op.AuditSessionAlreadyAbsent` | ログアウト対象のセッションがすでに存在しない、または期限切れだった。 |
| `op.AuditSessionDestroyFailed` | セッション削除がストア障害になった。リクエストは静的 503 となり、状態は保持される。 |
| `op.AuditLogoutClientLookupFailed` | logout client の解決中に client registry への lookup が障害になった。通信路上は一律の拒否で、正常な「client が存在しない」結果では発火しない。 |
| `op.AuditLogoutRPInitiated` | **予約語** — OP は RP が要求したことだけを示すイベントを発火しない。 |
| `op.AuditLogoutTokenRevokeFailed` | logout token またはログアウトカスケードの失効処理がストア障害になった。 |
| `op.AuditLogoutBackChannelDelivered` | RP が `logout_token` の POST に 2xx を返した。 |
| `op.AuditLogoutBackChannelFailed` | RP が non-2xx を返した、ネットワークエラー、または拒否リストで URL が遮断された。 |
| `op.AuditLogoutBackChannelResolveFailed` | grant ベースの配送先解決に失敗した。 |
| `op.AuditLogoutBackChannelOverflow` | 上限付き配送先解決が overflow した。 |
| `op.AuditBCLNoSessionsForSubject` | session-bearing `/end_session` notice で grant 由来の RP 対象が 0 件だった。 |

`op.AuditLogoutRPInitiated` は予約されたカタログ語彙です。OP は個別の「RP が要求した」イベントではなく、結果としてのセッション／配送イベントを記録します。

## 次に読む

- [ユースケース: Back-Channel Logout](/ja/use-cases/back-channel-logout) — RP の `backchannel_logout_uri` の設定、署名鍵の選択、`logout_token` の payload。
- [設計判断](/ja/security/design-judgments) — #5、#10、#17 がログアウト方針の背後にある明示的な解釈を扱っています。
- [運用: マルチインスタンス](/ja/operations/multi-instance) — 揮発ストアでセッションを共有しつつロードバランサ越しに OP を動かす場合の話。
