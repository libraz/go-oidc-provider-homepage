---
title: セッションとログアウト
description: OP がブラウザセッションをどう表現し、RP-Initiated Logout と Back-Channel Logout がどう違うか、そして本ライブラリが Front-Channel Logout を実装しない理由。
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
| `ID` | 不透明なセッション識別子（logout token の `sid` として使われます）。 |
| `Subject` | OP 内部の安定したユーザ ID。ID トークンの `sub` になります。 |
| `AuthTime` | ユーザがいつ認証したか。ID トークンの `auth_time` になります。 |
| `ACR` | Authentication Context Class Reference — セッションが満たす保証レベル。 |
| `AMR` | Authentication Methods References（RFC 8176） — `pwd`、`otp`、`mfa`、`hwk`、… |
| `ChooserGroupID` | マルチアカウントチューザのグループ識別子。同じブラウザに属する複数セッションが共有します。 |
| `ExpiresAt`、`CreatedAt`、`UpdatedAt` | ライフサイクルのタイムスタンプ。 |

この行を指す cookie が `__Host-oidc_session` です（`internal/cookie/profile.go` で定義）。本ライブラリは合計 3 つの cookie を使います。

| Cookie | 用途 | 仕様 |
|---|---|---|
| `__Host-oidc_session` | 永続セッションへのポインタ。 | 不透明な payload を AES-256-GCM で AEAD 暗号化。`__Host-` 接頭辞で同一 origin に強制。`SameSite=Lax`。 |
| `__Host-oidc_interaction` | 進行中のインタラクション（ログインフォーム、MFA チャレンジ）の状態。 | 同じ AEAD。1 時間 TTL。 |
| `__Host-oidc_csrf` | インタラクションフォームの double-submit CSRF トークン。 | HMAC のみ（AEAD なし）。`SameSite=Strict`。 |

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
3. cookie と `store.SessionStore` 行を削除。
4. `post_logout_redirect_uri` がそのクライアントに登録されていれば、`state` を反射させてブラウザをリダイレクト。

主眼は **このブラウザの OP セッションを終わらせる** ことです。リダイレクトを起点にした RP は当然ログアウトを把握していますが、他の RP は — OP が Back-Channel Logout も同時に動かしていない限り — 把握できません。

### Back-Channel Logout 1.0

`/end_session`（あるいは他のログアウト契機）が発火すると、OP は `backchannel_logout_uri` を登録したすべての RP に対して、署名された `logout_token` JWT を `POST` します。RP は JWT を検証し、自身のローカルセッションを無効化します。

これは server-to-server で動きます。ブラウザは関与しないので、ユーザがタブを閉じていても、別のブラウザに移っていても、そもそもタブを開いていなくても（管理者操作で発火した場合など）動作します。

外向き HTTP リクエストは、JWKS / sector_identifier_uri 取得と同じ SSRF 拒否リストでガードされます — 組み込み側が明示的にオプトインしない限り、private network には到達しません。失敗は `op.AuditLogoutBackChannelFailed`、成功は `op.AuditLogoutBackChannelDelivered` で記録されます。`/end_session` 発火時に対象 subject に live なセッションがひとつもなかった場合は `op.AuditBCLNoSessionsForSubject` が出ます — 「配送に失敗した」と「配送先がそもそも存在しなかった」を区別するのに有用です。

::: warning 揮発セッション下では Back-Channel Logout は best-effort
`store.SessionStore` を揮発キャッシュに振り向けていて、ログアウトの fan-out が走る前にセッションが eviction された場合、本ライブラリは歩く対象を失います。ユーザは（行が消えているので）ログアウト済みですが、RP に通知は届きません。`op.SessionDurabilityPosture` ノブで、ダッシュボードがこの 2 つを区別できるようにしています。詳細は [設計判断 #10](/ja/security/design-judgments#dj-10) を参照。
:::

### Front-Channel Logout 1.0 — 非実装

Front-Channel Logout は、OP が RP ごとの `frontchannel_logout_uri` をひとつずつ `<iframe>` で並べた HTML を返し、各 iframe が third-party context で自身の cookie を読みに行って消す、という仕組みです。この仕組みは「third-party iframe が embedded context から自身の cookie を読める」という前提に依存しており、主要ブラウザは段階的にこの能力を取り去ってきました。

- Safari ITP（2017 年〜）
- Firefox ETP（2019 年〜）
- Chrome の `SameSite=Lax` デフォルト化（2020 年〜）
- third-party cookie の段階的廃止（2024〜2025 年）

本ライブラリは Front-Channel Logout を **実装しません**。discovery ドキュメントでも `frontchannel_logout_supported` は広告しません。fan-out 型のログアウトが必要な組み込み側は、ブラウザの cookie ポリシーから独立した server-to-server の Back-Channel Logout 1.0 を使います。完全な背景は [設計判断 #5](/ja/security/design-judgments#dj-5) を参照。

## End-session カスケード

`/end_session` は単に「cookie を消す」だけではありません。組み込み側が `Grants` と `AccessTokens` の substore を組み込んでいる場合、本ライブラリは subject が保持するすべての grant を歩き、grant ごとのアクセストークン shadow row を失効させます。JWT アクセストークンは OP が応答するエンドポイント（`/userinfo`、`/introspect`）で inactive になります。opaque アクセストークンは introspection を経由するすべての RS で inactive になります。

| 組み込まれた store | カスケード挙動 |
|---|---|
| `Grants` + `AccessTokens`（同梱アダプタを使えばデフォルト） | カスケード発火。AT が revoked に切り替わる。JWT AT は `/userinfo` で拒否、opaque AT は全 RS で拒否。 |
| いずれかが nil | カスケードは静かに短絡。AT は自然に `exp` まで生存。 |

理由と JWT / opaque のカスケード到達範囲の非対称性は [設計判断 #17](/ja/security/design-judgments#dj-17) を参照。

## 揮発ストアと永続ストアの選択

セッションの substore は、トランザクショナルストア（認可コード、リフレッシュトークン、client）から意図的に分離されています。組み込み側は典型的には次のいずれかを選びます。

| ポスチャ | `SessionStore` のバックエンド | トレードオフ |
|---|---|---|
| **Hot/cold 分離**（高トラフィック向けに推奨） | Redis（揮発） | セッション書き込みのレイテンシが低い。eviction とログアウトが競合すると BCL は best-effort。 |
| **すべて永続** | トランザクショナルストアと同じ SQL クラスタ | BCL 配送は完全配送が前提。セッション書き込みはトークン書き込みとレイテンシを共有。 |

`op.WithSessionDurabilityPosture(...)` で組み込み側のスタンスを宣言することで、監査トレイル（`op.AuditBCLNoSessionsForSubject`）を正しく解釈できます。完全な配線例は [Hot / Cold 分離のユースケース](/ja/use-cases/hot-cold-redis) を参照。

## セッションライフサイクルの監査イベント

| イベント | 発火タイミング |
|---|---|
| `op.AuditSessionCreated` | 新規セッション発行。 |
| `op.AuditSessionDestroyed` | セッション行が削除された（ログアウト、eviction、GC）。 |
| `op.AuditLogoutRPInitiated` | `/end_session` が発火。 |
| `op.AuditLogoutBackChannelDelivered` | RP が `logout_token` の POST に 2xx を返した。 |
| `op.AuditLogoutBackChannelFailed` | RP が non-2xx を返した、ネットワークエラー、または拒否リストで URL が遮断された。 |
| `op.AuditBCLNoSessionsForSubject` | `/end_session` が発火したが、該当 subject に live なセッションがなかった。 |

## 次に読む

- [ユースケース: Back-Channel Logout](/ja/use-cases/back-channel-logout) — RP の `backchannel_logout_uri` の配線、署名鍵の選択、`logout_token` の payload。
- [設計判断](/ja/security/design-judgments) — #5、#10、#17 がログアウトポスチャの背後にある明示的解釈をカバーします。
- [運用: マルチインスタンス](/ja/operations/multi-instance) — 揮発ストアでセッションを共有しつつロードバランサ越しに OP を動かす場合の話。
