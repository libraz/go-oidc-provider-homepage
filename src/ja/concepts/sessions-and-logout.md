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
- cookie だけ消した場合は OP がユーザを忘れます。行だけ消した場合は次のリクエストで cookie が空のセッションを指し、ユーザは再認証を強制されます。
:::

## 本ライブラリでのセッション表現

OP は `store.SessionStore` に次の行を保持します。

| フィールド | 内容 |
|---|---|
| `ID` | 不透明な OP ブラウザセッション識別子。cookie / セッション検索と監査相関に使う値ですが、現在の sub-only Back-Channel Logout Token では RP 固有の `sid` claim として発行されません。 |
| `Subject` | OP 内部の安定したユーザ ID。ID トークンの `sub` になります。 |
| `AuthTime` | ユーザがいつ認証したか。ID トークンの `auth_time` になります。 |
| `ACR` | Authentication Context Class Reference — セッションが満たす保証レベル。 |
| `AMR` | Authentication Methods References（RFC 8176） — `pwd`、`otp`、`mfa`、`hwk`、… |
| `ChooserGroupID` | マルチアカウントチューザのグループ識別子。同じブラウザに属する複数セッションが共有します。 |
| `ExpiresAt`、`CreatedAt`、`UpdatedAt` | ライフサイクルのタイムスタンプ。 |

この行を指す cookie が `__Host-oidc_session` です（`internal/cookie/profile.go` で定義）。本ライブラリは合計 4 つの cookie を使います。

| Cookie | 用途 | 仕様 |
|---|---|---|
| `__Host-oidc_session` | 永続セッションへのポインタ。 | 不透明な payload を AES-256-GCM で AEAD 暗号化。`__Host-` 接頭辞で同一 origin に強制。`SameSite=Lax`。 |
| `__Host-oidc_interaction` | 進行中のインタラクション（ログインフォーム、MFA チャレンジ）の状態。 | 同じ AEAD。1 時間 TTL。 |
| `__Host-oidc_csrf` | インタラクションフォームの double-submit CSRF トークン。 | HMAC のみ（AEAD なし）。`SameSite=Strict`。 |
| `__Host-oidc_locale` | インタラクション画面をまたいでユーザが選んだ UI ロケールを覚えておく。 | 平文（暗号化なし）。1 年 TTL。`SameSite=Lax`。 |

::: details `__Host-` 接頭辞とは
RFC 6265bis により、cookie 名が `__Host-` で始まるとき、ブラウザは `Secure`、`Path=/`、そして `Domain` 属性 **なし** を同時に満たさないと cookie を受理しません — つまり、OP の origin に厳密に縛られます。サブドメイン侵害でも偽造できず、兄弟ドメインからも読めません。本ライブラリが平文 HTTP では起動しないのは、まさに `__Host-` 接頭辞がそれでは成立しないからです。
:::

セッション行は `store.SessionStore` を経由します — 組み込み側がライブラリの不変条件を破ることなく、揮発性のバックエンド（Redis、Memcached）に振り向けてもよい substore です。トレードオフは [設計判断 #10](/ja/security/design-judgments#dj-10) を参照。

## ログアウトの分類

ログアウトに関わる OIDC 仕様は 3 つあります。本ライブラリは 2 つを実装します。

### RP-Initiated Logout 1.0

RP はブラウザを次の URL にリダイレクトします。

```
GET /end_session?id_token_hint=<id_token>&post_logout_redirect_uri=<uri>&state=<opaque>
```

OP は次のことを行います。

1. `id_token_hint` を検証（自分が発行したセッションに紐付くか確認）。
2. 任意で「本当にログアウトしますか？」の確認画面を挟む（UX として推奨）。
3. `logout_scope` を解決し、選択されたセッション行を削除。
4. `post_logout_redirect_uri` がそのクライアントに登録されていれば、`state` を反射させてブラウザをリダイレクト。

デフォルトの scope は、アクティブな chooser group 全体です。ブラウザの group にあるすべてのセッションを破棄します。単一値のクエリパラメータ `logout_scope=current` を指定すると、アクティブなセッションだけを破棄し、兄弟セッションが残れば cookie をそのセッションへ再バインドします。空値、未知の値、`logout_scope` の重複は、セッション状態を変更する前に HTTP 400 で拒否します。

セッション cookie の subject と一致しない `id_token_hint` では確認画面を省略できません。セッションストアの transport 障害がセッションの解決または破棄中に起きた場合、`/end_session` は静的な HTTP 503 ページを返します。`post_logout_redirect_uri` へはリダイレクトせず、cookie とセッション行をそのまま残します。セッションが存在しない、または期限切れの場合は別の安全に継続できるケースです。

`/end_session` が返す確認画面とブラウザ向けエラー HTML には、`X-Frame-Options: DENY` と `frame-ancestors 'none'` を含む Content-Security-Policy の両方が付くため、どちらの画面も埋め込めません。

native / public client では、`redirect_uri` と同じ RFC 8252 の loopback any-port ルールを `post_logout_redirect_uri` にも適用します。固定の loopback URI を登録しておき、logout 時には別の ephemeral port で戻る形を許容します。変動できるのは port だけで、host / scheme / path は登録形状と一致している必要があります。

主眼は **このブラウザの OP セッションを終わらせる** ことです。リダイレクトを起点にした RP は当然ログアウトを把握していますが、他の RP は — OP が Back-Channel Logout も同時に動かしていない限り — 把握できません。

### Back-Channel Logout 1.0

`/end_session` がセッションを終了すると、OP はその subject の grant から導出した対象 RP それぞれに、署名された `logout_token` JWT を `POST` します。RP は JWT を検証し、自身のローカルセッションを無効化します。

これは server-to-server で動きます。ブラウザは関与しないので、ユーザがタブを閉じていても、別のブラウザに移っていても動作します。公開されているセッションログアウトの入口は `/end_session` です。

外向き HTTP リクエストは、JWKS / sector_identifier_uri 取得と同じ SSRF 拒否リストでガードされます — 組み込み側が明示的にオプトインしない限り、private network には到達しません。失敗は `op.AuditLogoutBackChannelFailed`、成功は `op.AuditLogoutBackChannelDelivered` で記録されます。session-bearing logout notice の grant 由来 RP audience が空の場合は `op.AuditBCLNoSessionsForSubject` が出ます — 「RP の対象を解決できなかった」と「配送に失敗した」を区別するのに有用です。

detached fan-out には独立した 2 つの時間制限があります。`op.WithBackchannelLogoutTimeout` は 1 RP への HTTP 配送（デフォルト 5 秒）を制限し、`op.WithBackchannelFanOutBudget` は detached fan-out 全体（デフォルト 30 秒）を制限します。後者は RP ごとの timeout ではなく、イベント全体の予算です。実行中の fan-out は `Provider.Shutdown(ctx)` でも drain されます。

::: warning 揮発セッション下では Back-Channel Logout は best-effort
揮発な `store.SessionStore` が `/end_session` の解決と snapshot 取得より前に行を追い出すと、ブラウザからの logout trigger を失い detached fan-out は起動しません。snapshot を取得できた場合、RP audience は `SessionStore` の行を辿らず grant store から解決されます。session-bearing notice で grant 由来 RP 対象が 0 件の場合だけ、対象 0 件として監査されます。`op.SessionDurabilityPosture` ノブは trigger / snapshot の喪失と対象 0 件をダッシュボードで解釈する文脈を提供します。詳細は [設計判断 #10](/ja/security/design-judgments#dj-10) を参照。
:::

### Front-Channel Logout 1.0 — 非実装

Front-Channel Logout は、OP が RP ごとの `frontchannel_logout_uri` をひとつずつ `<iframe>` で並べた HTML を返し、各 iframe が third-party context で自身の cookie を読みに行って消す、という仕組みです。この仕組みは「third-party iframe が embedded context から自身の cookie を読める」という前提に依存しており、主要ブラウザは段階的にこの能力を取り去ってきました。

- Safari ITP（2017 年〜）
- Firefox ETP（2019 年〜）
- Chrome の `SameSite=Lax` デフォルト化（2020 年〜）
- third-party cookie の段階的廃止（2024〜2025 年）

本ライブラリは Front-Channel Logout を **実装しません**。discovery 文書でも `frontchannel_logout_supported` は広告しません。fan-out 型のログアウトが必要な組み込み側は、ブラウザの cookie ポリシーから独立した server-to-server の Back-Channel Logout 1.0 を使います。完全な背景は [設計判断 #5](/ja/security/design-judgments#dj-5) を参照。

## End-session カスケード

`/end_session` は単に「cookie を消す」だけではありません。組み込み側が `Grants` と `AccessTokens` の substore を組み込んでいる場合、本ライブラリは subject が保持するすべての grant を歩き、grant ごとのアクセストークン shadow row を失効させます。JWT アクセストークンは OP が応答するエンドポイント（`/userinfo`、`/introspect`）で inactive になります。opaque アクセストークンは introspection を経由するすべての RS で inactive になります。

<figure class="fig">
  <div class="fig-head">セッション行ひとつと、終了がどこまで届くか</div>
  <svg class="fig-svg" role="img" aria-labelledby="session-cascade-title" viewBox="0 0 960 452" xmlns="http://www.w3.org/2000/svg">
    <title id="session-cascade-title">上段はセッションモデル。OP オリジンに紐づく 4 つの cookie のうち 1 つが SessionStore の行 ID を運び、OP 側の状態はその行が持ちます。下段は end-session のカスケード。行を削除し、grant を走査して失効させ、アクセストークンを失効させ、登録済みの back-channel logout URI すべてに logout_token を POST します。</title>
    <text class="fg-lbl" x="40" y="24">セッションモデル</text>
    <!-- cookie -->
    <rect class="fg-box" x="36" y="34" width="300" height="132" rx="8"/>
    <text class="fg-t2" x="56" y="58">ブラウザの cookie</text>
    <text class="fg-mxs" x="56" y="80">__Host-oidc_session</text>
    <text class="fg-mxs" x="56" y="96">__Host-oidc_interaction</text>
    <text class="fg-mxs" x="56" y="112">__Host-oidc_csrf</text>
    <text class="fg-mxs" x="56" y="128">__Host-oidc_locale</text>
    <line class="fg-rule" x1="56" y1="140" x2="316" y2="140"/>
    <text class="fg-xs" x="56" y="157">OP オリジンに紐づき、RP には渡らない</text>
    <path class="fg-edge" d="M340,100 H428" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="384" y="93" text-anchor="middle">行 ID を運ぶ</text>
    <!-- SessionStore -->
    <rect class="fg-box fg-box--accent" x="432" y="34" width="492" height="132" rx="8"/>
    <text class="fg-t fg-accent" x="452" y="58">SessionStore</text>
    <text class="fg-xs" x="452" y="76">セッションごとに 1 行 — OP 側の状態はすべてここ</text>
    <line class="fg-rule" x1="452" y1="88" x2="904" y2="88"/>
    <text class="fg-mxs" x="452" y="110">ID · Subject · AuthTime · ACR</text>
    <text class="fg-mxs" x="452" y="128">AMR · ChooserGroupID · timestamps</text>
    <text class="fg-xs" x="452" y="152">cookie が持つのは行 ID だけ</text>
    <text class="fg-lbl" x="40" y="204">end-session カスケード</text>
    <!-- 起点 -->
    <rect class="fg-box fg-box--accent" x="36" y="214" width="184" height="72" rx="8"/>
    <text class="fg-m" x="128" y="248" text-anchor="middle">/end_session</text>
    <text class="fg-xs" x="128" y="266" text-anchor="middle">RP 起点のログアウト</text>
    <!-- 幹線 -->
    <path class="fg-leader" d="M224,250 H252 V423"/>
    <path class="fg-edge fg-edge--thin" d="M252,245 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M252,297 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M252,359 H296" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M252,423 H296" marker-end="url(#fg-a)"/>
    <!-- 波及先 -->
    <rect class="fg-box" x="300" y="224" width="290" height="42" rx="6"/>
    <text class="fg-t2" x="318" y="242">SessionStore</text>
    <text class="fg-xs" x="318" y="258">行を削除する</text>
    <rect class="fg-box" x="300" y="276" width="290" height="42" rx="6"/>
    <text class="fg-t2" x="318" y="294">Grants</text>
    <text class="fg-xs" x="318" y="310">走査して revoked に切り替える</text>
    <rect class="fg-box" x="300" y="328" width="290" height="52" rx="6"/>
    <text class="fg-t2" x="318" y="346">AccessTokens</text>
    <text class="fg-xs" x="318" y="362">OP が直接失効させる</text>
    <rect class="fg-box" x="300" y="390" width="290" height="52" rx="6"/>
    <text class="fg-t2" x="318" y="408">Back-Channel Logout</text>
    <text class="fg-mxs" x="318" y="426">POST logout_token → 各 RP</text>
    <!-- 到達範囲 -->
    <path class="fg-edge fg-edge--muted" d="M594,354 H636" marker-end="url(#fg-am)"/>
    <rect class="fg-box fg-box--muted" x="640" y="328" width="284" height="114" rx="8"/>
    <text class="fg-lbl" x="658" y="348">実際にどこまで届くか</text>
    <text class="fg-xs" x="658" y="368">JWT アクセストークンは OP が</text>
    <text class="fg-xs" x="658" y="382">/userinfo と /introspect で拒否する</text>
    <text class="fg-xs" x="658" y="404">opaque なトークンは各 RS が introspect</text>
    <text class="fg-xs" x="658" y="418">して初めて inactive になる</text>
    <text class="fg-xs fg-warn" x="658" y="436">到達範囲は OP ではなく各 RS 次第</text>
  </svg>
  <figcaption class="fig-note">左の列は同期的で、すべて OP の制御下にあります。下 2 行はそうではありません。すでに配られた JWT は有効期限まで形式上は正当なままですし、バックチャネル通知が効くのは URI を登録して応答する RP に限られます。</figcaption>
</figure>

cookie は単なるポインタで、セッションの実体は `SessionStore` の行です。ブラウザ側で cookie を消しても行は残るため、OP が行そのものを削除する必要があります。

| 組み込まれた store | カスケード挙動 |
|---|---|
| `Grants` + `AccessTokens`（同梱アダプタを使えばデフォルト） | カスケード発火。AT が revoked に切り替わる。JWT AT は `/userinfo` で拒否、opaque AT は全 RS で拒否。 |
| いずれかが nil | カスケードは静かに短絡。AT は自然に `exp` まで生存。 |

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

- [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) — RP の `backchannel_logout_uri` の設定、署名鍵の選択、`logout_token` の payload。
- [設計判断](/ja/security/design-judgments) — #5、#10、#17 がログアウト方針の背後にある明示的な解釈を扱っています。
- [運用: マルチインスタンス](/ja/operations/multi-instance) — 揮発ストアでセッションを共有しつつロードバランサ越しに OP を動かす場合の話。
