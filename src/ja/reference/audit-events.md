---
title: 監査イベントカタログ
description: 監査イベントカタログ。OP が発火するシグナルと予約語を区別し、各イベントの extras を説明します。
outline: 2
pageClass: pg-reference-audit-events
---

# 監査イベントカタログ

OP は `op/audit.go` で閉じたカタログとして定義された、構造化された監査イベントを発火します。ただしカタログは語彙であり、すべての定数が発火するという約束ではありません。本ページでは OP が発火するシグナルと、将来または組み込み側の account/device plane 向けに予約された名前を区別します。各イベントは `<area>.<verb>`（または `<area>.<verb>.<qualifier>`）形の安定した文字列です。SOC ダッシュボードは自由形式のメッセージを解析しなくても、area 単位で集計できます。

<figure class="fig">
  <div class="fig-head">閉じたカタログ 1 つ、届き先 3 つ</div>
  <svg class="fig-svg" role="img" aria-labelledby="audit-flow-title" viewBox="0 0 960 244" xmlns="http://www.w3.org/2000/svg">
    <title id="audit-flow-title">OP の各処理パスは、閉じた 1 つのカタログから監査イベントを発火します。各イベントは文脈を extras に載せ、構造化ログ、SOC パイプライン、Prometheus のカウンタへ届きます。</title>
    <text class="fg-lbl" x="40" y="26">発火元</text>
    <text class="fg-lbl" x="640" y="26">届き先</text>
    <rect class="fg-box" x="36" y="40" width="230" height="42" rx="6"/>
    <text class="fg-t2" x="54" y="58">login / MFA</text>
    <text class="fg-xs" x="54" y="74">要素の判定結果、ステップアップ</text>
    <rect class="fg-box" x="36" y="92" width="230" height="42" rx="6"/>
    <text class="fg-t2" x="54" y="110">token / grant</text>
    <text class="fg-xs" x="54" y="126">発行、ローテーション、失効</text>
    <rect class="fg-box" x="36" y="144" width="230" height="42" rx="6"/>
    <text class="fg-t2" x="54" y="162">DCR / device</text>
    <text class="fg-xs" x="54" y="178">動的登録、デバイスの承認</text>
    <path class="fg-leader" d="M270,61 H300 M270,113 H300 M270,165 H300 M300,61 V165"/>
    <path class="fg-edge fg-edge--accent" d="M300,113 H336" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="340" y="66" width="256" height="94" rx="8"/>
    <text class="fg-t2 fg-accent" x="360" y="92">監査イベント</text>
    <text class="fg-mxs" x="360" y="114">op.Audit* — 閉じた集合</text>
    <text class="fg-xs" x="360" y="134">文脈は extras に載せて運び、</text>
    <text class="fg-xs" x="360" y="150">整形済みメッセージには入れない</text>
    <path class="fg-leader" d="M600,113 H632 M632,61 V165"/>
    <path class="fg-edge fg-edge--thin" d="M632,61 H692" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M632,113 H692" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M632,165 H692" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="696" y="40" width="228" height="42" rx="6"/>
    <text class="fg-t2" x="714" y="58">slog の JSON</text>
    <text class="fg-xs" x="714" y="74">イベント 1 件につき 1 オブジェクト</text>
    <rect class="fg-box" x="696" y="92" width="228" height="42" rx="6"/>
    <text class="fg-t2" x="714" y="110">SOC / SIEM</text>
    <text class="fg-xs" x="714" y="126">イベント名で検索できる</text>
    <rect class="fg-box" x="696" y="144" width="228" height="42" rx="6"/>
    <text class="fg-t2" x="714" y="162">Prometheus</text>
    <text class="fg-xs" x="714" y="178">結果をラベルにしたカウンタ</text>
  </svg>
  <figcaption class="fig-note">右の列が成立するのは、カタログが閉じているからです。イベント名の集合が固定されバージョン管理されているため、アラートをイベント名で組めます。呼び出し箇所のフォーマット文字列から組み立てているのではありません。</figcaption>
</figure>

## 購読する

```go
op.New(
    /* 必須オプション */
    op.WithAuditLogger(slog.New(myJSONHandler)),
)
```

`op.WithAuditLogger` は `*slog.Logger` を受け取ります。各イベントは構造化ログのエントリとして記録されます。`event` 属性はイベント識別子（たとえば `"token.issued"`）を、`msg` は人間向けの短いメッセージを持ちます。正規フィールドは任意のトップレベル属性です。`actor_id`、`client_id`、`session_id`、`request_id`、`ip`、`user_agent`、`tag` は未設定なら出力されません。空でない `extras` グループにカテゴリ固有のフィールドが入ります。発火は呼び出し元の goroutine 上で同期的に行われます。handler は遅い I/O や無制限 queue で block させず、多数の request から並行して呼ばれても安全にしてください。

`WithAuditLogger` を渡さない場合は、`WithLogger` で設定したロガーに流れます。どちらも渡していない場合、監査イベントは破棄されます。

::: tip Prometheus にも同時に送る
[`WithPrometheus`](/ja/use-cases/prometheus) を併用すると、これらのイベントの厳選サブセットが Prometheus カウンタにも反映されます。1 回の発火で slog のストリームと該当カウンタの両方が更新されるので、metrics 用の追加発火はありません。
:::

## コードからカタログを列挙する

以下のカタログは OP 自身が使うレジストリから起こしたもので、そのレジストリは公開されています。`op.AuditEventCatalog()` は安定イベント全件のコピーを `[]op.AuditEventDefinition` として返します:

```go
for _, def := range op.AuditEventCatalog() {
    // def.Event       — 監査イベント識別子。例: "token.issued"
    // def.MetricName  — 対応する Prometheus カウンタ。監査のみのイベントでは空
    // def.MetricLabel — カテゴリカウンタで使う値域限定のラベル。空のことも多い
}
```

イベント集合を散文ではなくデータとして扱いたいとき、たとえば SIEM のルールを生成する、ダッシュボードが全イベントを網羅していることをテストで検証する、metrics 投影を持つイベントを洗い出す、といった場面で使います。ライブラリ内の発火箇所と Prometheus ブリッジが同じレジストリを参照しているため、イベントの一覧と metrics のルーティングが食い違うことはありません。

## 共通の属性

発火したイベントには `audit` と `event` が含まれます。正規フィールドは任意で、未設定なら出力されません。`extras` は空なら出力されません。`slog.JSONHandler` を使うと、レコード時刻、レベル、メッセージも出力されます:

| 属性 | 型 | 補足 |
|---|---|---|
| `audit` | string | 常に `"true"` |
| `event` | string | イベント識別子。例: `"token.issued"` |
| `actor_id` | string | ユーザ起点では subject 識別子、クライアント起点では `client_id`。未設定なら出力されません |
| `client_id` | string | OAuth `client_id`。未設定なら出力されません |
| `session_id` | string | 該当する場合の OP session 識別子。未設定なら出力されません |
| `request_id` | string | リクエストの相関 ID。未設定なら出力されません |
| `ip` | string | OP のエッジで観測したクライアント IP。未設定なら出力されません |
| `user_agent` | string | 観測した `User-Agent` の値。未設定なら出力されません |
| `tag` | string | operator が設定した DCR tag。未設定なら出力されません |
| `extras` | group | カテゴリ固有のフィールド（各セクションを参照）。空の場合は出力されません |
| `time` | timestamp | `slog.Record.Time`。`WithClock` またはシステム時刻のレコード時刻です |
| `level` | string | `slog.Record.Level`。`INFO`、`WARN`、`ERROR` など |
| `msg` | string | `slog.Record.Message`。人間向けの短いメッセージです |

## イベントカタログ

カタログを機能領域ごとに再編成しました。各グループは、SOC や運用にとってこの一群のイベントが何を意味するかを短く述べたあと、`event 定数`（`op/audit.go` の Go 識別子）、`発火タイミング`または予約理由、`想定シビアリティ`（`info` は通常運転、`warn` は怪しい / 失敗系、`alert` は replay やストア障害といった即応すべきシグナル、という大まかな目安）、`関連ページ` の表に落としています。**予約** と明記した行は OP が発火しません。予約イベントが存在しないことは、元の操作が起きなかった証拠ではありません。

### Provider ライフサイクル

`startup.profile` は OP instance の監査ストリームの起点です。`op.New` が設定を検証し、provider を返す前に 1 回だけ発火します。extras は次の 2 群で構成されます。

- **宣言値** — `profiles` / `features` / `grants`。
- **解決後のポリシー** — PKCE、PAR、nonce、送信者制約、client authentication、token TTL、token format、JAR、JARM、introspection。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditStartupProfile` | 検証済み provider の起動時 | info | [Options 索引](/ja/reference/options) |

### アカウント管理

**予約語です。** OP が直接ホストしない仕様外の管理経路（プロビジョニング / リカバリ / フェデレーションリンクなど）を表します。組み込み側は自身の監査 sink から発火できますが、OP 自体は発火しません。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditAccountCreated` | **予約** — 組み込み側がユーザアカウントを払い出した | info | — |
| `AuditAccountDeleted` | **予約** — 組み込み側がユーザアカウントを削除した | info | — |
| `AuditAccountEmailAdded` | **予約** — アカウントに email を追加した | info | — |
| `AuditAccountEmailVerified` | **予約** — email の所有を確認した | info | — |
| `AuditAccountEmailRemoved` | **予約** — email を削除した | info | — |
| `AuditAccountEmailSetPrimary` | **予約** — プライマリ email を変更した | info | — |
| `AuditAccountPasskeyRegistered` | **予約** — WebAuthn credential を登録した | info | — |
| `AuditAccountPasskeyRemoved` | **予約** — WebAuthn credential を削除した | info | — |
| `AuditAccountTOTPEnabled` | **予約** — TOTP 登録を完了した | info | — |
| `AuditAccountTOTPDisabled` | **予約** — TOTP を解除した | info | — |
| `AuditAccountPasswordChanged` | **予約** — パスワードを変更した | info | — |
| `AuditAccountRecoveryRegenerated` | **予約** — recovery batch を再発行した | info | — |
| `AuditRecoverySupportEscalation` | **予約** — サポートによる override / 手動 recovery | warn | — |
| `AuditAccountFederationLinked` | **予約** — 外部 IdP の credential を連携した | info | — |
| `AuditAccountFederationUnlinked` | **予約** — 外部 IdP の credential 連携を解除した | info | — |

### ログイン / MFA / step-up {#login-mfa-step-up}

`login.*` と `mfa.*` は、primary または additional factor が解決したあとに authenticator chain から発火します。`login.failed` / `mfa.failed` は通常レベルの探索シグナルで、レートが恒常的に上がるようなら credential stuffing の典型的な兆候です。`AuditMFARequired`、`AuditStepUpRequired`、`AuditStepUpSuccess` は **予約** であり、OP は発火しません。step-up は resource server が決め、OP には通常の authorize request が届きます。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditLoginSuccess` | プライマリ credential の検証が成功し、subject が確定した | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditLoginFailed` | プライマリ credential が拒否された | warn | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditLockoutStalled` | cross-factor lockout の CAS 競合で失敗試行をカウントせず中断した | alert | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFARequired` | **予約** — OP は requirement 専用イベントを発火しない | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFASuccess` | 第 2 factor が受理された | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFAFailed` | 第 2 factor が拒否された | warn | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditStepUpRequired` | **予約** — resource server の判断であり、OP は発火しない | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditStepUpSuccess` | **予約** — resource server の結果であり、OP は発火しない | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |

::: details extras
- `factor` — `password`、`passkey`、`totp`、`email_otp`、`captcha`、`recovery_code`、または user-defined Step kind
- login/MFA イベントは `aal`、`acr`、`amr_values` を自動的には持ちません
:::

### 同意

`AuditConsentGranted` と `AuditConsentGrantedFirstParty` は同意画面とファーストパーティの自動同意経路から発火します。その他の consent 定数は **予約** です。追加 scope の同意も通常の `consent.granted` として記録され、既存 grant の再利用にはイベントがなく、grant の取り下げには Grant Management の `grant_management.revoked` を使います。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditConsentGranted` | ユーザが同意画面で同意した | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentGrantedFirstParty` | ファーストパーティの自動同意を適用した（同意画面なし） | info | [使い方: ファーストパーティ consent](/ja/use-cases/first-party) |
| `AuditConsentGrantedDelta` | **予約** — 追加 scope は通常の `AuditConsentGranted` として発火 | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentSkippedExisting` | **予約** — 保存済み同意の再利用は発火しない | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentRevoked` | **予約** — Grant Management の取り下げは `AuditGrantManagementRevoked` を発火 | info | [ガイド: consent](/ja/concepts/consent) |

::: details extras
- `scopes_granted`、`scopes_requested` — 文字列スライス
- `audience` — audience 単位 scope の場合
:::

### code / token のライフサイクル

認可コード発行パスと token endpoint から発火します。replay 検出系（`code.replay_detected`、`refresh.replay_detected`）とサブストア障害系（`token.revoke_failed`、`refresh.chain_revoke_failed`、`refresh.grant_revoke_failed`）が高シグナルなアラートで、それ以外は通常運転のライフサイクル telemetry です。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditCodeIssued` | 認可コードを発行した。対話的経路とサイレント経路を含め、コードごとに 1 回だけ発火します | info | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditCodeConsumed` | `/token` で code を消費した | info | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditCodeReplayDetected` | 認可コードが二度提示された — chain を失効させる | alert | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditTokenIssued` | grant に対する最初の refresh token を永続化した（すべての access token 発行を数えるイベントではない） | info | [ガイド: tokens](/ja/concepts/tokens) |
| `AuditTokenRefreshed` | リフレッシュトークンをローテーションし、新しいアクセストークンを発行した | info | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |
| `AuditTokenRevoked` | `/revoke` または grant cascade で失効させた | info | [ガイド: tokens](/ja/concepts/tokens) |
| `AuditTokenRevokeFailed` | 失効処理がサブストアの障害を観測。RFC 7009 §2.2 により、通信路上の応答は 200 のまま | alert | [ガイド: tokens](/ja/concepts/tokens) |
| `AuditRefreshReplayDetected` | リフレッシュトークンがローテーション猶予を超過して提示された — chain を失効させる | alert | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |
| `AuditRefreshChainRevokeFailed` | replay 検出時の連鎖失効でサブストアの障害を観測 | alert | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |
| `AuditRefreshGrantRevokeFailed` | refresh-rotation cascade で grant tombstone の書き込みが失敗 | alert | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |
| `AuditRefreshPriorAccessTokenRevokeFailed` | refresh rotation で直前の access token を失効できなかった。retry 可否も extras に入る | alert | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |

`code_id` と `completion_id` は認可コード識別子から作る不可逆な fingerprint です。相関用の値であり、生の認可コードや内部識別子ではありません。`code.issued` は発行したコードごとに 1 回だけ発火します。

::: details extras
- `refresh_origin` — refresh chain に記録された型付き origin。`authorization_code`、`device_code`、`ciba`、`custom_grant` のいずれかで、欠落または閉じた集合外は metrics bridge が `unknown` に投影します。任意の request `grant_type` label ではなく、実際に chain を発行した grant を表します
- `format` — アクセストークンの `jwt` / `opaque`
- `offline_access` — bool。`offline_access` chain なら true
- `cnf` — sender-bound のとき、`dpop_jkt` または `mtls_x5t#S256`
- `surface` — `token.revoke_failed` で障害を観測した呼び出し元。`/revoke` は `jwt_access_token` / `refresh_chain` / `opaque_access_token`、token endpoint では認可コード再利用に伴う AT カスケードが失敗したときに `code_replay_jwt_access_tokens`
- `grant_id` — `token.revoke_failed`(token endpoint)と `refresh.grant_revoke_failed` で、tombstone 書き込みに失敗した grant
- `reason` — `refresh.chain_revoke_failed` / `refresh.grant_revoke_failed` で、サブストアから返ったエラー文字列
- `err` — `token.revoke_failed` で、サブストアから返ったエラー文字列
- `failure_stage`、`retryable` — `refresh.prior_access_token_revoke_failed` の値
:::

### session / logout

下記の session / logout 行は、セッションマネージャ、`/end_session`、detached Back-Channel Logout coordinator から発火します。`AuditLogoutRPInitiated` は **予約** です。`/end_session` は RP が要求したという marker ではなく、セッションと配送の結果を記録します。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditSessionCreated` | 新しいブラウザセッションを発行した（ログイン後） | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditSessionDestroyed` | session を削除した（logout / 期限切れ / 退避） | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditSessionAlreadyAbsent` | ログアウト対象の session がすでに無い、または期限切れだった | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditSessionDestroyFailed` | session 削除が store 障害になった。リクエストは静的 503 で状態を保持する | alert | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditLogoutClientLookupFailed` | RP 起点ログアウトの解決中に client registry の store lookup が失敗した。通信路上の応答は汎用的なまま | alert | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditLogoutRPInitiated` | **予約** — RP が要求したことだけを示す marker は発火しない | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditLogoutTokenRevokeFailed` | logout token またはログアウト cascade の失効で store 障害になった | alert | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditLogoutBackChannelDelivered` | Back-Channel logout token を RP に配送した | info | [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelFailed` | Back-Channel 配送に失敗（HTTP エラー / タイムアウト / 検証失敗） | warn | [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelResolveFailed` | grant ベースの通知先解決に失敗した | alert | [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelOverflow` | 上限付き通知先解決が overflow した | warn | [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) |
| `AuditBCLNoSessionsForSubject` | session-bearing `/end_session` notice で grant 由来の RP 対象が 0 件（通知する RP がない） | info | [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) |

::: details `bcl.no_sessions_for_subject` の意図
このイベントは `Notice.SessionID` があり、grant ベースの audience 解決で RP 対象が 0 件になった場合だけ発火します。coordinator が `SessionStore` を辿った、または session が追い出されたことを意味しません。`SessionStore` が `/end_session` の snapshot 前に行を失うと、handler は detached fan-out を起動せず、このイベントも発火しません。grant 由来の対象 0 件は通常の no-op でも起きるため INFO レベルとし、SOC ツールは個別イベントではなく発生レートの上昇に対してアラートを張ります。設定された `WithSessionDurabilityPosture` の値は trigger / snapshot の喪失と対象 0 件を解釈する文脈として含まれます。
:::

### 防御シグナル

下記では CORS、（loose verifier の opt-in 時の）DPoP、retired key のシグナルを OP が発火します。rate-limit は **組み込み側向け予約語** です。PKCE、redirect mismatch、legacy algorithm の定数も **予約語** であり、OP は拒否を返しますが監査イベントは発火しません。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditRateLimitExceeded` | レートリミッタがリクエストを拒否した — **組み込み側が発火** する語彙。本ライブラリは汎用の per-IP / per-endpoint HTTP throttle を実装しません | warn | — |
| `AuditRateLimitBypassed` | bypass トークンを消費した（運用者による上書き） — **組み込み側が発火** する語彙。スコープは `AuditRateLimitExceeded` と同じ | warn | — |
| `AuditPKCEViolation` | **予約** — PKCE 拒否は通信路上で返し、OP 監査イベントは発火しない | alert | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditRedirectURIMismatch` | **予約** — redirect 拒否は通信路上で返し、OP 監査イベントは発火しない | warn | [ガイド: redirect URI](/ja/concepts/redirect-uri) |
| `AuditAlgLegacyUsed` | **予約** — 旧 alg の telemetry を発火する OP パスはない | warn | [ガイド: JOSE basics](/ja/concepts/jose-basics) |
| `AuditCORSPreflightAllowed` | CORS preflight が厳格な許可リストに合致した | info | [使い方: SPA 向け CORS](/ja/use-cases/cors-spa) |
| `AuditDPoPLooseMethodCaseAdmitted` | **条件付き** — loose method-case bridge を設定した verifier のみ発火。標準 `op.New` は strict | info | [ガイド: DPoP](/ja/concepts/dpop) |
| `AuditKeyRetiredKidPresented` | リクエストが JWKS の猶予期間を過ぎた kid を提示 — verifier で拒否 | warn | [運用: 鍵ローテーション](/ja/operations/key-rotation) |

### interaction

interaction driver が応答を commit する前に render に失敗した場合だけ、render failure signal を発火します。driver が応答を commit 済みなら、OP は応答を置き換えられないため、重複イベントを発火しません。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditInteractionRenderFailed` | interaction driver の render が応答 commit 前に失敗した。OP は汎用の `server_error` ページを返す | alert | [使い方: SPA 向け対話のカスタマイズ](/ja/use-cases/spa-custom-interaction) |

### introspection

`/introspect` がクライアント認証を拒否したとき、または opaque access token / refresh token の store lookup が失敗したときに発火します。正常な inactive miss ではエラーイベントを発火しません。`NotFound` 以外の lookup 障害では、監査イベントで障害を把握しつつ、RFC 7662 の通信路上の応答は HTTP 200 と `{"active":false}` のままです。クライアント認証失敗は従来の標準エラー応答です。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditIntrospectionError` | `/introspect` がクライアント資格情報を拒否した、または opaque token store が `NotFound` 以外の障害を返した | warn / alert | [運用: 可観測性](/ja/operations/observability) |

### クライアント認証

`/token`、`/par`、`/device_authorization`、`/bc-authorize` がクライアント認証を拒否したときに発火します。通信路上の応答は標準どおりの `invalid_client` のままに保ちつつ、このイベントから試行された `client_id` と短い理由コードを取り出せます。`/introspect` は `AuditIntrospectionError`、`/revoke` はこのイベントを使いません。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditClientAuthnFailure` | `/token`、`/par`、`/device_authorization`、`/bc-authorize` がクライアントを拒否（誤った secret、期限切れ assertion、alg 不一致、`private_key_jwt` の不在など） | warn | [ガイド: クライアントの種類](/ja/concepts/client-types) |

### DCR

`/register` および `/register/{client_id}` から発火します。RAT / IAT 系の失敗イベントは、DCR 配下では probing の典型的なシグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditDCRIATConsumed` | Initial Access Token を消費した | info | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRIATExpired` | TTL 超過の IAT を提示した | warn | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRIATInvalid` | IAT の signature / format が不正 | warn | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCROpenRegistrationUsed` | open(IAT 不要)登録を受理した | info | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRClientRegistered` | 新規 client を作成した | info | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRClientMetadataRead` | RAT 持ちの GET on `/register/{client_id}` | info | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRClientMetadataUpdated` | RAT 持ちの PUT on `/register/{client_id}` | info | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRClientDeleted` | RAT 持ちの DELETE on `/register/{client_id}` | info | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRRATInvalid` | Registration Access Token を拒否した | warn | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRMetadataValidation` | メタデータペイロードがポリシー違反 | warn | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRCascadeRefreshRevokeFailed` | client 削除時に refresh-token 行の失効に失敗 | alert | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRCascadeGrantRevokeFailed` | client 削除時に grant の失効に失敗 | alert | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRCascadeAccessTokenRevokeFailed` | client 削除時に JWT access-token 行の失効に失敗 | alert | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRCascadeOpaqueAccessTokenRevokeFailed` | client 削除時に opaque access-token 行の失効に失敗 | alert | [使い方: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |

### Device Code (RFC 8628)

`/device_authorization`、`op/devicecodekit` の verification ヘルパ、token endpoint の device-code grant から発火します。`device_code.verification.user_code_brute_force` と `device_code.token.slow_down` は、典型的なポーリング乱用シグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditDeviceAuthorizationIssued` | `/device_authorization` が新しい `device_code` + `user_code` ペアを返却 | info | [ガイド: device code](/ja/concepts/device-code) |
| `AuditDeviceAuthorizationRejected` | `/device_authorization` がリクエストを拒否（未知 client、scope 拒否など） | warn | [ガイド: device code](/ja/concepts/device-code) |
| `AuditDeviceAuthorizationUnboundRejected` | DPoP / mTLS の証明が必要だが `/device_authorization` に無かった | warn | [ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint) |
| `AuditDeviceCodeVerificationApproved` | 組み込み側の verification ページがユーザの承認を報告 | info | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeVerificationDenied` | 組み込み側の verification ページがユーザ拒否を報告（またはレコード単位の総当たり対策がロックアウト） | warn | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeUserCodeBruteForce` | `user_code` 提出が外れた。カウンタを増やし、`devicecodekit.MaxUserCodeStrikes`(既定 5)でロックアウト発火 | alert | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenIssued` | 承認済 device authorization に対し `/token` がトークンを発行 | info | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenRejected` | `/token` が device-code grant を拒否（`access_denied`、`expired_token` など） | warn | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenSlowDown` | `/token` が `slow_down` を返し、サブストア上のポーリング間隔に 5 秒を加算 | warn | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeRevoked` | `op/devicecodekit.Revoke` がレコードを拒否状態に遷移させた。`Deps.AccessTokens` が渡されている場合は、ヘルパが発行済みアクセストークンも連鎖失効させ、`revoked_access_tokens` を記録する | info | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodePollObservationFailed` | ポーリングの `LastPolledAt` 永続化が失敗。判定自体は続行する（best-effort な観測） | warn | [使い方: device code](/ja/use-cases/device-code) |

### CIBA

`/bc-authorize` と token endpoint の CIBA grant から発火します。`ciba.poll_abuse.lockout` がクライアントの不正挙動を捕まえる主要シグナルです。authentication-device の approve / deny 定数は **予約** です。組み込み側が `CIBARequestStore.Approve` / `Deny` を直接呼ぶため、OP の発火点がありません。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditCIBAAuthorizationIssued` | `/bc-authorize` が新しい `auth_req_id` を返却 | info | [ガイド: CIBA](/ja/concepts/ciba) |
| `AuditCIBAAuthorizationRejected` | `/bc-authorize` がリクエストを拒否（未知ユーザ、hint resolver 失敗、scope 拒否） | warn | [ガイド: CIBA](/ja/concepts/ciba) |
| `AuditCIBAAuthorizationUnboundRejected` | DPoP / mTLS の証明が必要だが `/bc-authorize` に無かった | warn | [ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint) |
| `AuditCIBAAuthDeviceApproved` | **予約** — 組み込み側 callback が直接 `Approve` を呼ぶため OP は観測しない | info | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAAuthDeviceDenied` | **予約** — 組み込み側 callback が直接 `Deny` を呼ぶため OP は観測しない | warn | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAPollAbuseLockout` | ポーリング間隔が交渉済みの interval を大きく下回り続け、リクエストをロックアウト | alert | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenIssued` | 承認済 CIBA リクエストに対し `/token` がトークンを発行 | info | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenRejected` | `/token` が CIBA grant を拒否（`access_denied`、`expired_token`、`authorization_pending`） | warn | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenSlowDown` | `/token` が `slow_down` を返却。クライアントが交渉 interval より速くポーリングした | warn | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAPollObservationFailed` | ポーリングの `LastPolledAt` 永続化が失敗。判定自体は続行する（best-effort な観測） | warn | [使い方: CIBA](/ja/use-cases/ciba) |

### Token Exchange (RFC 8693)

同梱の `RegisterTokenExchange` ハンドラから発火します。`requested` は parse と構造検証より前の handler 入口で発火するため、構造上の拒否も含みます。成功時は `requested` + `granted` を発火し、後段の拒否時は `requested` + 失敗系イベント 1 つを発火します。`policy_denied` / `scope_inflation_blocked` / `audience_blocked` が、SOC ダッシュボードで通常追うポリシー判定シグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditTokenExchangeRequested` | `/token` が RFC 8693 の試行を exchange handler に dispatch した。parse と構造検証より前 | info | [ガイド: token exchange](/ja/concepts/token-exchange) |
| `AuditTokenExchangeGranted` | exchange を許可し、新しいアクセストークン（任意で refresh）を発行 | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangePolicyDenied` | 組み込み側の `TokenExchangePolicy` が拒否（deny）を返却 | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangePolicyError` | ポリシーが拒否（deny）以外のエラーを返却（一過性のインフラ障害など） | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeScopeInflationBlocked` | 要求 scope が subject_token の scope または client 許可リストを超えた | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeAudienceBlocked` | 要求 audience がポリシーの許可リストの外だった | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeTTLCapped` | 発行 TTL を（ハンドラの希望、subject_token の残り、グローバル上限）の最小値で切り詰めた | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActChainTooDeep` | ネストした act チェーンの深さが上限を超えた | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeEmptyScopeRejected` | scope subset を空集合に解決して拒否 | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActorEqualsSubject` | actor_token が subject_token と同じ subject に解決（委譲なし） | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenExternal` | subject_token がローカルレジストリで解決できず、外部発行の opaque トークンとして扱った | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActorTokenExternal` | actor_token がローカルレジストリで解決できず、外部発行の opaque トークンとして扱った | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenInvalid` | subject_token の検証に失敗（signature / TTL / cnf 不一致） | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenRegistryError` | レジストリの参照（lookup）が `NotFound` 以外の障害を観測。通信路上の応答は `invalid_grant` のまま | alert | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeRefreshIssued` | exchange が refresh 発行を明示した（`IssueRefreshToken=op.PtrBool(true)`） | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSelfExchange` | exchange の宛先が呼び出し client 自身（受動的なトークン replay シナリオ） | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |

### Custom Grant

dispatcher は登録済みの custom handler に到達したすべての dispatch 試行について、成功と handler を呼ぶ前の gate 失敗を含め、入口で `custom_grant.requested` を発火します。未登録の `grant_type` は custom-grant dispatch の入口に到達する前に返るため、custom-grant の監査イベントは発火しません。失敗時は 1 つの失敗出口から `custom_grant.failed` を 1 回発火します。handler の panic は recover され、panic の情報を `extras` に含む同じ失敗イベント 1 回になります。

| イベント | 意味 | レベル | 参照 |
|---|---|---|---|
| `AuditCustomGrantRequested` (`custom_grant.requested`) | 登録済み custom handler に到達したすべての dispatch 試行（handler 前の gate 失敗も含む） | info | [使い方: custom grant](/ja/use-cases/custom-grant) |
| `AuditCustomGrantFailed` (`custom_grant.failed`) | custom grant の dispatch または handler が失敗した。panic を recover した場合も、試行ごとに 1 回だけ発火します | warn | [使い方: custom grant](/ja/use-cases/custom-grant) |
| `AuditCustomGrantRefreshDropped` (`custom_grant.refresh_dropped`) | ハンドラが `IssueRefreshToken` でリフレッシュトークン発行を求めたが、クライアントが `refresh_token` grant に登録されていない。アクセストークン応答自体は成功する | info | [使い方: custom grant](/ja/use-cases/custom-grant) |

### Grant management

OAuth 2.0 Grant Management endpoint のイベントです。認証済み revoke request の grant cascade が完了しないときは failure シグナルが発火します。

| イベント定数 | 発火タイミング | severity の目安 | リンク先 |
|---|---|---|---|
| `AuditGrantManagementRevoked` | grant management エンドポイントへの `DELETE` が grant を失効させ、トークンをカスケードした | info | [使い方: grant management](/ja/use-cases/grant-management) |
| `AuditGrantManagementRevokeFailed` | `DELETE` の認証後、grant の失効副作用が失敗した | alert | [使い方: grant management](/ja/use-cases/grant-management) |

## 安定性

監査イベント名は公開 API 表面の一部です:

- 新しいイベントは、マイナーリリースで追加され得ます。
- 既存のイベント名は、メジャーリリースで deprecation notice 付きでしか改名されません。

ダッシュボードや SIEM ルールはイベント名で固定し、出現順序や、このページに記載のない `extras` フィールドの形には依存しないでください。

## このリストの裏取り

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
audit_catalog_tmp=$(mktemp ./audit-catalog-XXXXXX.go)
trap 'rm -f "$audit_catalog_tmp"' EXIT
cat >"$audit_catalog_tmp" <<'EOF'
package main

import (
  "fmt"
  "github.com/libraz/go-oidc-provider/op"
)

func main() {
  for _, def := range op.AuditEventCatalog() {
    fmt.Println(def.Event)
  }
}
EOF
go run "$audit_catalog_tmp"
```

公開 API `op.AuditEventCatalog()` を呼び出し、このページがミラーしている閉じたカタログを出力します。
