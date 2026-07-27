---
title: 監査イベントカタログ
description: OP が発火する op.Audit* の全イベント、発火タイミング、extras に載るフィールド。
outline: 2
pageClass: pg-reference-audit-events
---

# 監査イベントカタログ

OP は `op/audit.go` で閉じたカタログとして定義された、構造化された監査イベントを発火します。各イベントは `<area>.<verb>`（または `<area>.<verb>.<qualifier>`）形の安定した文字列です。SOC ダッシュボードは自由形式のメッセージを解析しなくても、area 単位で集計できます。

<svg role="img" aria-labelledby="audit-flow-title" viewBox="0 0 760 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="audit-flow-title">監査イベントの流れ: OP の各処理パスが閉じたイベントカタログからイベントを発火し、slog、SOC、Prometheus のカウンタへ流れる。</title>
<rect class="aud-box" x="28" y="46" width="156" height="54" rx="8"/>
  <text class="aud-text" x="106" y="80" text-anchor="middle">login / MFA</text>
  <rect class="aud-box" x="28" y="123" width="156" height="54" rx="8"/>
  <text class="aud-text" x="106" y="157" text-anchor="middle">token / grant</text>
  <rect class="aud-box" x="28" y="200" width="156" height="54" rx="8"/>
  <text class="aud-text" x="106" y="234" text-anchor="middle">DCR / device</text>

  <rect class="aud-main" x="282" y="96" width="192" height="88" rx="8"/>
  <text class="aud-text" x="378" y="130" text-anchor="middle">監査イベント</text>
  <text class="aud-sub" x="378" y="152" text-anchor="middle">op.Audit*</text>
  <text class="aud-sub" x="378" y="170" text-anchor="middle">extras に文脈を載せる</text>

  <rect class="aud-box" x="566" y="40" width="158" height="54" rx="8"/>
  <text class="aud-text" x="645" y="74" text-anchor="middle">slog JSON</text>
  <rect class="aud-box" x="566" y="123" width="158" height="54" rx="8"/>
  <text class="aud-text" x="645" y="157" text-anchor="middle">SOC / SIEM</text>
  <rect class="aud-box" x="566" y="206" width="158" height="54" rx="8"/>
  <text class="aud-text" x="645" y="240" text-anchor="middle">Prometheus</text>

  <path class="aud-flow" d="M184 73 C226 80 244 112 278 126"/>
  <path class="aud-flow" d="M184 150 H278"/>
  <path class="aud-flow" d="M184 227 C226 218 244 178 278 162"/>
  <path class="aud-flow" d="M474 126 C514 100 526 68 562 68"/>
  <path class="aud-flow" d="M554 64 L563 68 L554 72"/>
  <path class="aud-flow" d="M474 150 H562"/>
  <path class="aud-flow" d="M554 146 L563 150 L554 154"/>
  <path class="aud-flow" d="M474 166 C516 190 526 234 562 234"/>
  <path class="aud-flow" d="M554 230 L563 234 L554 238"/>
</svg>

## 購読する

```go
op.New(
    /* 必須オプション */
    op.WithAuditLogger(slog.New(myJSONHandler)),
)
```

`op.WithAuditLogger` は `*slog.Logger` を受け取ります。各イベントは、`msg` がイベント識別子（たとえば `"token.issued"`）で、属性に `request_id` / `subject` / `client_id` とカテゴリ固有のフィールドを持つ `extras` グループが付いた、構造化ログのエントリとして記録されます。

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

すべてのイベントが持つ:

| 属性 | 型 | 補足 |
|---|---|---|
| `request_id` | string | リクエスト単位の識別子(`X-Request-ID` を伝播) |
| `subject` | string | 該当ユーザの OIDC `sub`。認証前のイベントでは空 |
| `client_id` | string | OAuth `client_id`。アカウント管理イベントでは空 |
| `extras` | group | カテゴリ固有のフィールド(各セクションを参照) |

## イベントカタログ

カタログを機能領域ごとに再編成しました。各グループは、SOC や運用にとってこの一群のイベントが何を意味するかを短く述べたあと、`event 定数`（`op/audit.go` の Go 識別子）、`発火タイミング`、`想定シビアリティ`（`info` は通常運転、`warn` は怪しい / 失敗系、`alert` は replay やストア障害といった即応すべきシグナル、という大まかな目安）、`関連ページ` の表に落としています。シビアリティはあくまで起点であり、実運用では発生レートに対するしきい値を調整してください。

### Provider ライフサイクル

`startup.profile` は OP instance の監査ストリームの起点です。`op.New` が設定を検証し、provider を返す前に 1 回だけ発火します。extras には、宣言された `profiles` / `features` / `grants` と、解決後の PKCE、PAR、nonce、送信者制約、client authentication、token TTL、token format、JAR、JARM、introspection のポリシーが入ります。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditStartupProfile` | 検証済み provider の起動時 | info | [Options 索引](/ja/reference/options) |

### アカウント管理

ほとんどは、OP が直接ホストしない仕様外の管理経路（プロビジョニング / リカバリ / フェデレーションリンクなど）から発火します。実体の書き込み元がどこであっても、SOC が単一の購読点でカバーできるよう、本ライブラリのカタログに集約しています。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditAccountCreated` | ユーザアカウントを払い出した | info | — |
| `AuditAccountDeleted` | ユーザアカウントを削除した | info | — |
| `AuditAccountEmailAdded` | アカウントに email を追加した | info | — |
| `AuditAccountEmailVerified` | email の所有を確認した(リンク / OTP) | info | — |
| `AuditAccountEmailRemoved` | email を削除した | info | — |
| `AuditAccountEmailSetPrimary` | プライマリ email を変更した | info | — |
| `AuditAccountPasskeyRegistered` | WebAuthn credential を登録した | info | — |
| `AuditAccountPasskeyRemoved` | WebAuthn credential を削除した | info | — |
| `AuditAccountTOTPEnabled` | TOTP 登録を完了した | info | — |
| `AuditAccountTOTPDisabled` | TOTP を解除した | info | — |
| `AuditAccountPasswordChanged` | パスワードリセット / 変更 | info | — |
| `AuditAccountRecoveryRegenerated` | recovery batch を再発行した | info | — |
| `AuditRecoverySupportEscalation` | サポートによる override / 手動 recovery | warn | — |
| `AuditAccountFederationLinked` | 外部 IdP の credential を連携した | info | — |
| `AuditAccountFederationUnlinked` | 外部 IdP の credential 連携を解除した | info | — |

### ログイン / MFA / step-up

各 factor が解決したあとに、authenticator chain から発火します。`login.failed` / `mfa.failed` は通常レベルの探索シグナルで、レートが恒常的に上がるようなら credential stuffing の典型的な兆候です。`step_up.required` のレートを見れば、RP が `acr_values` を引き上げる頻度も追えます。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditLoginSuccess` | プライマリ credential の検証が成功し、subject が確定した | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditLoginFailed` | プライマリ credential が拒否された | warn | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFARequired` | session の AAL が要求未満で、第 2 factor を要求した | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFASuccess` | 第 2 factor が受理された | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFAFailed` | 第 2 factor が拒否された | warn | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditStepUpRequired` | RP がより高い `acr_values` を要求し、再度画面表示が必要になった | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditStepUpSuccess` | step-up factor が受理された | info | [使い方: MFA / step-up](/ja/use-cases/mfa-step-up) |

::: details extras
- `factor` — `password`、`passkey`、`totp`、`email_otp`、`captcha`、`recovery_code`、または user-defined Step kind
- `aal` — その factor がセッションを引き上げた assurance level
- `amr_values` — `amr` claim に寄与した RFC 8176 §2 のコード
:::

### 同意

同意画面とファーストパーティの自動同意経路から発火します。`consent.granted.delta` は「既存の grant が今回の要求を覆い切らず、ユーザに再確認させた」というシグナル、`consent.revoked` はユーザ起点の権限取り下げで、SOC ダッシュボードでは `token.revoked` と並べて見ると相関が取れます。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditConsentGranted` | ユーザが同意画面で同意した | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentGrantedFirstParty` | ファーストパーティの自動同意を適用した(同意画面なし) | info | [使い方: ファーストパーティ consent](/ja/use-cases/first-party) |
| `AuditConsentGrantedDelta` | delta consent が、新規センシティブ scope の再確認を発生させた | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentSkippedExisting` | 既存の grant がリクエストを覆っており、同意画面が不要だった | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentRevoked` | ユーザが過去の grant を取り消した | info | [ガイド: consent](/ja/concepts/consent) |

::: details extras
- `scopes_granted`、`scopes_requested` — 文字列スライス
- `audience` — audience 単位 scope の場合
:::

### code / token のライフサイクル

認可コード発行パスと token endpoint から発火します。replay 検出系（`code.replay_detected`、`refresh.replay_detected`）とサブストア障害系（`token.revoke_failed`、`refresh.chain_revoke_failed`、`refresh.grant_revoke_failed`）が高シグナルなアラートで、それ以外は通常運転のライフサイクル telemetry です。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditCodeIssued` | 認可コードを発行した | info | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditCodeConsumed` | `/token` で code を消費した | info | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditCodeReplayDetected` | 認可コードが二度提示された — chain を失効させる | alert | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditTokenIssued` | アクセストークン + (任意で)refresh + (任意で)id_token を発行した | info | [ガイド: tokens](/ja/concepts/tokens) |
| `AuditTokenRefreshed` | リフレッシュトークンをローテーションし、新しいアクセストークンを発行した | info | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |
| `AuditTokenRevoked` | `/revoke` または grant cascade で失効させた | info | [ガイド: tokens](/ja/concepts/tokens) |
| `AuditTokenRevokeFailed` | 失効処理がサブストアの障害を観測。RFC 7009 §2.2 により、通信路上の応答は 200 のまま | alert | [ガイド: tokens](/ja/concepts/tokens) |
| `AuditRefreshReplayDetected` | リフレッシュトークンがローテーション猶予を超過して提示された — chain を失効させる | alert | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |
| `AuditRefreshChainRevokeFailed` | replay 検出時の連鎖失効でサブストアの障害を観測 | alert | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |
| `AuditRefreshGrantRevokeFailed` | refresh-rotation cascade で grant tombstone の書き込みが失敗 | alert | [ガイド: リフレッシュトークン](/ja/concepts/refresh-tokens) |

::: details extras
- `grant_type` — `authorization_code`、`refresh_token`、`client_credentials`
- `format` — アクセストークンの `jwt` / `opaque`
- `offline_access` — bool。`offline_access` chain なら true
- `cnf` — sender-bound のとき、`dpop_jkt` または `mtls_x5t#S256`
- `surface` — `token.revoke_failed` で障害を観測した呼び出し元。`/revoke` は `jwt_access_token` / `refresh_chain` / `opaque_access_token`、token endpoint では認可コード再利用に伴う AT カスケードが失敗したときに `code_replay_jwt_access_tokens`
- `grant_id` — `token.revoke_failed`(token endpoint)と `refresh.grant_revoke_failed` で、tombstone 書き込みに失敗した grant
- `reason` — `refresh.chain_revoke_failed` / `refresh.grant_revoke_failed` で、サブストアから返ったエラー文字列
- `err` — `token.revoke_failed` で、サブストアから返ったエラー文字列
:::

### session / logout

セッションストアと logout 系エンドポイントから発火します。`bcl.no_sessions_for_subject` は下に補足する揮発配置のシグナルです。Back-Channel 配送系イベントは、RP が logout に応じない場合の SOC 側の調査起点になります。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditSessionCreated` | 新しいブラウザセッションを発行した(ログイン後) | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditSessionDestroyed` | session を削除した(logout / 期限切れ / 退避) | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditLogoutRPInitiated` | RP-Initiated Logout が発火した | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditLogoutBackChannelDelivered` | Back-Channel logout token を RP に配送した | info | [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelFailed` | Back-Channel 配送に失敗(HTTP エラー / タイムアウト / 検証失敗) | warn | [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) |
| `AuditBCLNoSessionsForSubject` | `/end_session` で subject を指定したが、対応する session が 0 件だった | info | [使い方: Back-Channel Logout](/ja/use-cases/back-channel-logout) |

::: details `bcl.no_sessions_for_subject` の意図
揮発な `SessionStore`(永続化無しの Redis、`maxmemory` 退避配下のインメモリ層など)では、これは「session が確立から logout までの間に追い出された」というシグナルになります。OIDC Back-Channel Logout 1.0 §2.7 が言う best-effort 配送の最低ラインがゼロまで下がる、という意味です。INFO レベルの運用が想定で、揮発配置ではこのギャップは想定済みです。SOC ツールはイベント単位ではなく、発生レートの上昇に対してアラートを張ります。設定された `WithSessionDurabilityPosture` の値も extras に含むので、ダッシュボードは「揮発配置で想定内」と「永続配置で想定外」を分離できます。
:::

### 防御シグナル

リクエスト検証パスが、不正利用シグナルや運用者向けポリシーのヒットを検知したときに発火します。自動の abuse-mitigation パイプラインが拾うのは、ほぼこのグループのイベントです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditRateLimitExceeded` | レートリミッタがリクエストを拒否した — **組み込み側が発火** する語彙。本ライブラリは汎用の per-IP / per-endpoint HTTP throttle を実装しません | warn | — |
| `AuditRateLimitBypassed` | bypass トークンを消費した(運用者による上書き) — **組み込み側が発火** する語彙。スコープは `AuditRateLimitExceeded` と同じ | warn | — |
| `AuditPKCEViolation` | PKCE verifier の不一致 / `plain` の拒否 / public・native・FAPI 必須の認可リクエストで欠落 | alert | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditRedirectURIMismatch` | redirect URI が登録リストに不一致 | warn | [ガイド: redirect URI](/ja/concepts/redirect-uri) |
| `AuditAlgLegacyUsed` | 旧 alg のパスに到達した(テレメトリ目的。verifier 側では拒否) | warn | [ガイド: JOSE basics](/ja/concepts/jose-basics) |
| `AuditCORSPreflightAllowed` | CORS preflight が厳格な許可リストに合致した | info | [使い方: SPA 向け CORS](/ja/use-cases/cors-spa) |
| `AuditDPoPLooseMethodCaseAdmitted` | DPoP 証明の `htm` が標準形でない大文字小文字。テレメトリ付きで受理 | info | [ガイド: DPoP](/ja/concepts/dpop) |
| `AuditKeyRetiredKidPresented` | リクエストが JWKS の猶予期間を過ぎた kid を提示 — verifier で拒否 | warn | [運用: 鍵ローテーション](/ja/operations/key-rotation) |

### introspection

`/introspect` がクライアント認証や RFC 7662 §2.2 の応答契約を満たさず拒否したときに発火します。通信路上の応答は標準形のままに保ち、SOC ツールが追える理由はこのイベント側に集約しています。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditIntrospectionError` | `/introspect` がクライアントの資格情報を拒否 | warn | — |

### クライアント認証

`/token` および `/par` がクライアント認証を拒否したときに発火します。通信路上の応答は標準どおりの `invalid_client` のままに保ちつつ、このイベントから試行された `client_id` と短い理由コードを取り出せます。SOC ツールの probing 検知などに利用できます。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditClientAuthnFailure` | `/token` または `/par` がクライアントを拒否(誤った secret、期限切れ assertion、alg 不一致、`private_key_jwt` の不在など) | warn | [ガイド: クライアントの種類](/ja/concepts/client-types) |

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

### Device Code (RFC 8628)

`/device_authorization`、`op/devicecodekit` の verification ヘルパ、token endpoint の device-code grant から発火します。`device_code.verification.user_code_brute_force` と `device_code.token.slow_down` は、典型的なポーリング乱用シグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditDeviceAuthorizationIssued` | `/device_authorization` が新しい `device_code` + `user_code` ペアを返却 | info | [ガイド: device code](/ja/concepts/device-code) |
| `AuditDeviceAuthorizationRejected` | `/device_authorization` がリクエストを拒否(未知 client、scope 拒否など) | warn | [ガイド: device code](/ja/concepts/device-code) |
| `AuditDeviceAuthorizationUnboundRejected` | DPoP / mTLS の証明が必要だが `/device_authorization` に無かった | warn | [ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint) |
| `AuditDeviceCodeVerificationApproved` | 組み込み側の verification ページがユーザの承認を報告 | info | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeVerificationDenied` | 組み込み側の verification ページがユーザ拒否を報告(またはレコード単位の総当たり対策がロックアウト) | warn | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeUserCodeBruteForce` | `user_code` 提出が外れた。カウンタを増やし、`devicecodekit.MaxUserCodeStrikes`(既定 5)でロックアウト発火 | alert | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenIssued` | 承認済 device authorization に対し `/token` がトークンを発行 | info | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenRejected` | `/token` が device-code grant を拒否(`access_denied`、`expired_token` など) | warn | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenSlowDown` | `/token` が `slow_down` を返却。サブストア上のレコードで interval が倍化される | warn | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeRevoked` | `op/devicecodekit.Revoke` がレコードを拒否状態に遷移させた。`Deps.AccessTokens` が渡されている場合は、ヘルパが発行済みアクセストークンも連鎖失効させ、`revoked_access_tokens` を記録する | info | [使い方: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodePollObservationFailed` | ポーリングの `LastPolledAt` 永続化が失敗。判定自体は続行する(best-effort な観測) | warn | [使い方: device code](/ja/use-cases/device-code) |

### CIBA

`/bc-authorize`、組み込み側の authentication-device 連携、token endpoint の CIBA grant から発火します。`ciba.poll_abuse.lockout` がクライアントの不正挙動を捕まえる主要シグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditCIBAAuthorizationIssued` | `/bc-authorize` が新しい `auth_req_id` を返却 | info | [ガイド: CIBA](/ja/concepts/ciba) |
| `AuditCIBAAuthorizationRejected` | `/bc-authorize` がリクエストを拒否(未知ユーザ、hint resolver 失敗、scope 拒否) | warn | [ガイド: CIBA](/ja/concepts/ciba) |
| `AuditCIBAAuthorizationUnboundRejected` | DPoP / mTLS の証明が必要だが `/bc-authorize` に無かった | warn | [ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint) |
| `AuditCIBAAuthDeviceApproved` | サブストアが保留中リクエストに対する `Approve` を観測(組み込み側の認証デバイスコールバック) | info | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAAuthDeviceDenied` | サブストアが保留中リクエストに対する `Deny` を観測 | warn | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAPollAbuseLockout` | ポーリング間隔が交渉済みの interval を大きく下回り続け、リクエストをロックアウト | alert | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenIssued` | 承認済 CIBA リクエストに対し `/token` がトークンを発行 | info | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenRejected` | `/token` が CIBA grant を拒否(`access_denied`、`expired_token`、`authorization_pending`) | warn | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenSlowDown` | `/token` が `slow_down` を返却。クライアントが交渉 interval より速くポーリングした | warn | [使い方: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAPollObservationFailed` | ポーリングの `LastPolledAt` 永続化が失敗。判定自体は続行する(best-effort な観測) | warn | [使い方: CIBA](/ja/use-cases/ciba) |

### Token Exchange (RFC 8693)

同梱の `RegisterTokenExchange` ハンドラから発火します。成功時は `requested` + `granted` を必ず発火し、拒否時は `requested` + 失敗系イベント 1 つを発火します。`policy_denied` / `scope_inflation_blocked` / `audience_blocked` が、SOC ダッシュボードで通常追うポリシー判定シグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditTokenExchangeRequested` | `/token` が RFC 8693 リクエストを受理しハンドラに入った | info | [ガイド: token exchange](/ja/concepts/token-exchange) |
| `AuditTokenExchangeGranted` | exchange を許可し、新しいアクセストークン(任意で refresh)を発行 | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangePolicyDenied` | 組み込み側の `TokenExchangePolicy` が拒否(deny)を返却 | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangePolicyError` | ポリシーが拒否(deny)以外のエラーを返却(一過性のインフラ障害など) | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeScopeInflationBlocked` | 要求 scope が subject_token の scope または client 許可リストを超えた | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeAudienceBlocked` | 要求 audience がポリシーの 許可リストの外だった | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeTTLCapped` | 発行 TTL を(ハンドラの希望、subject_token の残り、グローバル上限)の最小値で切り詰めた | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActChainTooDeep` | ネストした act チェーンの深さが上限を超えた | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeEmptyScopeRejected` | scope subset を空集合に解決して拒否 | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActorEqualsSubject` | actor_token が subject_token と同じ subject に解決(委譲なし) | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenExternal` | subject_token がローカルレジストリで解決できず、外部発行の opaque トークンとして扱った | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActorTokenExternal` | actor_token がローカルレジストリで解決できず、外部発行の opaque トークンとして扱った | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenInvalid` | subject_token の検証に失敗(signature / TTL / cnf 不一致) | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenRegistryError` | レジストリの参照(lookup)が `NotFound` 以外の障害を観測。通信路上の応答は `invalid_grant` のまま | alert | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeRefreshIssued` | exchange が refresh 発行を明示した(`IssueRefreshToken=op.PtrBool(true)`) | info | [使い方: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSelfExchange` | exchange の宛先が呼び出し client 自身(受動的なトークン replay シナリオ) | warn | [使い方: token exchange](/ja/use-cases/token-exchange) |

### Custom Grant

| イベント | 意味 | レベル | 参照 |
|---|---|---|---|
| `custom_grant.requested` | custom `grant_type` がディスパッチャに入った | info | [使い方: custom grant](/ja/use-cases/custom-grant) |
| `custom_grant.failed` | custom grant の 振り分けまたはハンドラが失敗した | warn | [使い方: custom grant](/ja/use-cases/custom-grant) |
| `custom_grant.refresh_dropped` | ハンドラが `IssueRefreshToken` でリフレッシュトークン発行を求めたが、クライアントが `refresh_token` grant に登録されていない。アクセストークン応答自体は成功する | info | [使い方: custom grant](/ja/use-cases/custom-grant) |

### Grant management

| イベント定数 | 発火タイミング | severity の目安 | リンク先 |
|---|---|---|---|
| `AuditGrantManagementRevoked` | grant management エンドポイントへの `DELETE` が grant を失効させ、トークンをカスケードした | info | [使い方: grant management](/ja/use-cases/grant-management) |

## 安定性

監査イベント名は公開 API 表面の一部です:

- 新しいイベントは、マイナーリリースで追加され得ます。
- 既存のイベント名は、メジャーリリースで deprecation notice 付きでしか改名されません。

ダッシュボードや SIEM ルールはイベント名で固定し、出現順序や、このページに記載のない `extras` フィールドの形には依存しないでください。

## このリストの裏取り

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -hE 'AuditEvent\("[a-z_.]+"\)' op/audit.go \
  | grep -oE '"[a-z_.]+"' | sort -u
```

出力が、このページがミラーしている閉じたカタログです。
