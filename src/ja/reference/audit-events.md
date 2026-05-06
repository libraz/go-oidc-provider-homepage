---
title: Audit イベントカタログ
description: OP が発火する op.Audit* の全イベント、発火タイミング、extras に載るフィールド。
outline: 2
---

# Audit イベントカタログ

OP は `op/audit.go` で閉じたカタログとして定義された、構造化された監査イベントを発火します。各イベントは `<area>.<verb>`(または `<area>.<verb>.<qualifier>`)形の安定した文字列で、SOC ダッシュボードが自由形式のメッセージを parse することなく、area 単位で集計できる形になっています。

## 購読する

```go
op.New(
    /* 必須オプション */
    op.WithAuditLogger(slog.New(myJSONHandler)),
)
```

`op.WithAuditLogger` は `*slog.Logger` を受け取ります。各イベントは、`msg` がイベント識別子(たとえば `"token.issued"`)で、属性に `request_id` / `subject` / `client_id` とカテゴリ固有のフィールドを持つ `extras` グループが付いた、構造化ログのエントリとして記録されます。

`WithAuditLogger` を渡さない場合は、`WithLogger` で設定したロガーに流れます。どちらも渡していない場合、監査イベントは破棄されます。

::: tip Prometheus にも同時に送る
[`WithPrometheus`](/ja/use-cases/prometheus) を併用すると、これらのイベントの厳選サブセットが Prometheus カウンタにも反映されます。1 回の発火で slog のストリームと該当カウンタの両方が更新されるので、metrics 用の追加発火はありません。
:::

## 共通の属性

すべてのイベントが持つ:

| 属性 | 型 | 補足 |
|---|---|---|
| `request_id` | string | リクエスト単位の識別子(`X-Request-ID` を伝播) |
| `subject` | string | 該当ユーザの OIDC `sub`。認証前のイベントでは空 |
| `client_id` | string | OAuth `client_id`。アカウント管理イベントでは空 |
| `extras` | group | カテゴリ固有のフィールド(各セクションを参照) |

## イベントカタログ

カタログを feature area で再編成しました。各グループは、SOC や運用にとってこの一群のイベントが何を意味するかを短く述べたあと、`event 定数`(`op/audit.go` の Go 識別子)、`発火タイミング`、`想定シビアリティ`(`info` は通常運転、`warn` は怪しい / 失敗系、`alert` は replay やストア障害といった即応すべきシグナル、という大まかな目安)、`関連ページ` の表に落としています。シビアリティはあくまで起点であり、実運用では発生レートに対するしきい値を調整してください。

### アカウント管理

ほとんどは、OP が直接ホストしない out-of-band(帯域外)の管理パス — プロビジョニング / リカバリ / フェデレーションリンクなど — から発火します。実体の書き込み元がどこであっても、SOC が単一の購読点でカバーできるよう、本ライブラリのカタログに集約しています。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditAccountCreated` | ユーザアカウントを払い出した | info | — |
| `AuditAccountDeleted` | ユーザアカウントを削除した | info | — |
| `AuditAccountEmailAdded` | アカウントに email を追加した | info | — |
| `AuditAccountEmailVerified` | email の所有を確認した(リンク / OTP) | info | — |
| `AuditAccountEmailRemoved` | email を削除した | info | — |
| `AuditAccountEmailSetPrimary` | プライマリ email を変更した | info | — |
| `AuditAccountPasskeyRegistered` | WebAuthn credential を追加した | info | — |
| `AuditAccountPasskeyRemoved` | WebAuthn credential を削除した | info | — |
| `AuditAccountTOTPEnabled` | TOTP 登録を完了した | info | — |
| `AuditAccountTOTPDisabled` | TOTP を解除した | info | — |
| `AuditAccountPasswordChanged` | パスワードリセット / 変更 | info | — |
| `AuditAccountRecoveryRegenerated` | recovery batch を再発行した | info | — |
| `AuditRecoverySupportEscalation` | サポートによる override / 手動 recovery | warn | — |
| `AuditAccountFederationLinked` | 外部 IdP の credential をリンクした | info | — |
| `AuditAccountFederationUnlinked` | 外部 IdP の credential を解除した | info | — |

### ログイン / MFA / step-up

各 factor が解決したあとに、authenticator chain から発火します。`login.failed` / `mfa.failed` は通常レベルの probing シグナルで、レートが恒常的に上がるようなら credential stuffing の典型的な兆候です。`step_up.required` のレートを見れば、RP が `acr_values` を引き上げる頻度も追えます。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditLoginSuccess` | プライマリ credential の検証が成功し、subject が確定した | info | [ユースケース: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditLoginFailed` | プライマリ credential が拒否された | warn | [ユースケース: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFARequired` | session の AAL が要求未満で、第 2 factor を要求した | info | [ユースケース: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFASuccess` | 第 2 factor が受理された | info | [ユースケース: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditMFAFailed` | 第 2 factor が拒否された | warn | [ユースケース: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditStepUpRequired` | RP がより高い `acr_values` を要求し、再度プロンプトした | info | [ユースケース: MFA / step-up](/ja/use-cases/mfa-step-up) |
| `AuditStepUpSuccess` | step-up factor が受理された | info | [ユースケース: MFA / step-up](/ja/use-cases/mfa-step-up) |

::: details extras
- `factor` — `password`、`passkey`、`totp`、`email_otp`、`captcha`、`recovery_code`、または user-defined Step kind
- `aal` — その factor がセッションを引き上げた assurance level
- `amr_values` — `amr` claim に寄与した RFC 8176 §2 のコード
:::

### 同意

consent プロンプトとファーストパーティの fast-path から発火します。`consent.granted.delta` は「既存の grant が今回の要求を覆い切らず、ユーザに再確認させた」というシグナル、`consent.revoked` はユーザ起点の権限取り下げで、SOC ダッシュボードでは `token.revoked` と並べて見ると相関が取れます。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditConsentGranted` | ユーザがプロンプトで consent をクリックした | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentGrantedFirstParty` | ファーストパーティの自動 consent を適用した(プロンプトなし) | info | [ユースケース: ファーストパーティ consent](/ja/use-cases/first-party) |
| `AuditConsentGrantedDelta` | delta consent が、新規センシティブ scope の再プロンプトをトリガした | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentSkippedExisting` | 既存の grant がリクエストを覆っており、プロンプトが不要だった | info | [ガイド: consent](/ja/concepts/consent) |
| `AuditConsentRevoked` | ユーザが過去の grant を取り消した | info | [ガイド: consent](/ja/concepts/consent) |

::: details extras
- `scopes_granted`、`scopes_requested` — 文字列スライス
- `audience` — audience 単位 scope の場合
:::

### code / token のライフサイクル

authorize-code 発行パスと token endpoint から発火します。replay 検出系(`code.replay_detected`、`refresh.replay_detected`)とサブストア障害系(`token.revoke_failed`、`refresh.chain_revoke_failed`、`refresh.grant_revoke_failed`)が高シグナルなアラート、それ以外は通常運転のライフサイクル telemetry です。

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

セッションストアと logout 系エンドポイントから発火します。`bcl.no_sessions_for_subject` は下に補足する volatile 配置のシグナル、Back-Channel 配送系イベントは RP が logout に応じない場合の SOC pivot 点です。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditSessionCreated` | 新しいブラウザセッションを発行した(ログイン後) | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditSessionDestroyed` | session を削除した(logout / 期限切れ / 退避) | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditLogoutRPInitiated` | RP-Initiated Logout が発火した | info | [ガイド: sessions and logout](/ja/concepts/sessions-and-logout) |
| `AuditLogoutBackChannelDelivered` | Back-Channel logout token を RP に配送した | info | [ユースケース: Back-Channel Logout](/ja/use-cases/back-channel-logout) |
| `AuditLogoutBackChannelFailed` | Back-Channel 配送に失敗(HTTP エラー / タイムアウト / 検証失敗) | warn | [ユースケース: Back-Channel Logout](/ja/use-cases/back-channel-logout) |
| `AuditBCLNoSessionsForSubject` | `/end_session` で subject を指定したが、対応する session が 0 件だった | info | [ユースケース: Back-Channel Logout](/ja/use-cases/back-channel-logout) |

::: details `bcl.no_sessions_for_subject` の意図
揮発な `SessionStore`(永続化無しの Redis、`maxmemory` 退避配下のインメモリ層など)では、これは「session が確立から logout までの間に追い出された」というシグナルになります。OIDC Back-Channel Logout 1.0 §2.7 が言う best-effort 配送の最低ラインがゼロまで下がる、という意味です。INFO レベルの運用が想定で、揮発配置ではこのギャップは想定済みです。SOC ツールはイベント単位ではなく、発生レートの上昇に対してアラートを張ります。設定された `WithSessionDurabilityPosture` の値も extras に含むので、ダッシュボードは「揮発配置で想定内」と「永続配置で想定外」を分離できます。
:::

### 防御シグナル

リクエスト検証パスが、不正利用シグナルや運用者向けポリシーのヒットを検知したときに発火します。自動の abuse-mitigation パイプラインが拾うのは、ほぼこのグループのイベントです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditRateLimitExceeded` | レートリミッタがリクエストを拒否した — **組み込み側が発火** する語彙。本ライブラリは汎用の per-IP / per-endpoint HTTP throttle を実装しません | warn | — |
| `AuditRateLimitBypassed` | bypass トークンを消費した(運用者による上書き) — **組み込み側が発火** する語彙。スコープは `AuditRateLimitExceeded` と同じ | warn | — |
| `AuditPKCEViolation` | PKCE verifier の不一致 / `plain` の拒否 / FAPI 下での不在 | alert | [ガイド: 認可コード + PKCE](/ja/concepts/authorization-code-pkce) |
| `AuditRedirectURIMismatch` | redirect URI が登録リストに不一致 | warn | [ガイド: redirect URI](/ja/concepts/redirect-uri) |
| `AuditAlgLegacyUsed` | 旧 alg のパスに到達した(テレメトリ目的。verifier 側では拒否) | warn | [ガイド: JOSE basics](/ja/concepts/jose-basics) |
| `AuditCORSPreflightAllowed` | CORS preflight が厳格な許可リストに合致した | info | [ユースケース: SPA 向け CORS](/ja/use-cases/cors-spa) |
| `AuditDPoPLooseMethodCaseAdmitted` | DPoP proof の `htm` が標準形でない大文字小文字。テレメトリ付きで受理 | info | [ガイド: DPoP](/ja/concepts/dpop) |
| `AuditKeyRetiredKidPresented` | リクエストが JWKS の grace window を過ぎた kid を提示 — verifier で拒否 | warn | [運用: 鍵ローテーション](/ja/operations/key-rotation) |

### introspection

`/introspect` がクライアント認証や RFC 7662 §2.2 の応答契約を満たさず拒否したときに発火します。通信路上の応答は標準形のままに保ち、SOC ツールが追える理由はこのイベント側に集約しています。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditIntrospectionError` | `/introspect` がクライアント credential を拒否 | warn | — |

### クライアント認証

`/token` および `/par` がクライアント認証を拒否したときに発火します。通信路上の応答は標準どおりの `invalid_client` のままに保ちつつ、このイベントから試行された `client_id` と短い理由コードを取り出せます。SOC ツールの probing 検知などに利用できます。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditClientAuthnFailure` | `/token` または `/par` がクライアントを拒否(誤った secret、期限切れ assertion、alg 不一致、`private_key_jwt` の不在など) | warn | [ガイド: クライアントの種類](/ja/concepts/client-types) |

### DCR

`/register` および `/register/{client_id}` から発火します。RAT / IAT 系の失敗イベントは、DCR 配下では probing の典型的なシグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditDCRIATConsumed` | Initial Access Token を消費した | info | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRIATExpired` | TTL 超過の IAT を提示した | warn | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRIATInvalid` | IAT の signature / format が不正 | warn | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCROpenRegistrationUsed` | open(IAT 不要)登録を受理した | info | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRClientRegistered` | 新規 client を作成した | info | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRClientMetadataRead` | RAT 持ちの GET on `/register/{client_id}` | info | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRClientMetadataUpdated` | RAT 持ちの PUT on `/register/{client_id}` | info | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRClientDeleted` | RAT 持ちの DELETE on `/register/{client_id}` | info | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRRATInvalid` | Registration Access Token を拒否した | warn | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |
| `AuditDCRMetadataValidation` | メタデータペイロードがポリシー違反 | warn | [ユースケース: Dynamic Client Registration](/ja/use-cases/dynamic-registration) |

### Device Code (RFC 8628)

`/device_authorization`、`op/devicecodekit` の verification ヘルパ、token endpoint の device-code grant から発火します。`device_code.verification.user_code_brute_force` と `device_code.token.slow_down` は、典型的な poll abuse シグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditDeviceAuthorizationIssued` | `/device_authorization` が新しい `device_code` + `user_code` ペアを返却 | info | [ガイド: device code](/ja/concepts/device-code) |
| `AuditDeviceAuthorizationRejected` | `/device_authorization` がリクエストを拒否(未知 client、scope 拒否など) | warn | [ガイド: device code](/ja/concepts/device-code) |
| `AuditDeviceAuthorizationUnboundRejected` | DPoP / mTLS の proof が必要だが `/device_authorization` に無かった | warn | [ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint) |
| `AuditDeviceCodeVerificationApproved` | 組み込み側の verification ページがユーザの承認を報告 | info | [ユースケース: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeVerificationDenied` | 組み込み側の verification ページがユーザ拒否を報告(またはレコード単位の brute-force gate がロックアウト) | warn | [ユースケース: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeUserCodeBruteForce` | `user_code` 提出が外れた。カウンタを増やし、`devicecodekit.MaxUserCodeStrikes`(既定 5)でロックアウト発火 | alert | [ユースケース: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenIssued` | 承認済 device authorization に対し `/token` がトークンを発行 | info | [ユースケース: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenRejected` | `/token` が device-code grant を拒否(`access_denied`、`expired_token` など) | warn | [ユースケース: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeTokenSlowDown` | `/token` が `slow_down` を返却。サブストア上のレコードで interval が倍化される | warn | [ユースケース: device code](/ja/use-cases/device-code) |
| `AuditDeviceCodeRevoked` | `op/devicecodekit.Revoke` がレコードを拒否状態(deny)に遷移させた。組み込み側はここを購読し、`RevokeByGrant(deviceCodeID)` で発行済みのアクセストークンを連鎖失効させる | info | [ユースケース: device code](/ja/use-cases/device-code) |

### CIBA

`/bc-authorize`、組み込み側の authentication-device 連携、token endpoint の CIBA grant から発火します。`ciba.poll_abuse.lockout` がクライアントの不正挙動を捕まえる主要シグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditCIBAAuthorizationIssued` | `/bc-authorize` が新しい `auth_req_id` を返却 | info | [ガイド: CIBA](/ja/concepts/ciba) |
| `AuditCIBAAuthorizationRejected` | `/bc-authorize` がリクエストを拒否(未知ユーザ、hint resolver 失敗、scope 拒否) | warn | [ガイド: CIBA](/ja/concepts/ciba) |
| `AuditCIBAAuthorizationUnboundRejected` | DPoP / mTLS の proof が必要だが `/bc-authorize` に無かった | warn | [ガイド: 送信者制約付きトークン](/ja/concepts/sender-constraint) |
| `AuditCIBAAuthDeviceApproved` | サブストアが保留中リクエストに対する `Approve` を観測(組み込み側の認証デバイスコールバック) | info | [ユースケース: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAAuthDeviceDenied` | サブストアが保留中リクエストに対する `Deny` を観測 | warn | [ユースケース: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAPollAbuseLockout` | poll cadence が交渉した interval を大きく下回り続け、リクエストをロックアウト | alert | [ユースケース: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenIssued` | 承認済 CIBA リクエストに対し `/token` がトークンを発行 | info | [ユースケース: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenRejected` | `/token` が CIBA grant を拒否(`access_denied`、`expired_token`、`authorization_pending`) | warn | [ユースケース: CIBA](/ja/use-cases/ciba) |
| `AuditCIBATokenSlowDown` | `/token` が `slow_down` を返却。クライアントが交渉 interval より速く poll した | warn | [ユースケース: CIBA](/ja/use-cases/ciba) |
| `AuditCIBAPollObservationFailed` | poll の `LastPolledAt` 永続化が失敗。判定自体は続行する(best-effort な観測) | warn | [ユースケース: CIBA](/ja/use-cases/ciba) |

### Token Exchange (RFC 8693)

同梱の `RegisterTokenExchange` ハンドラから発火します。成功は `requested` + `granted` を必ず emit し、拒否は `requested` + 失敗系イベント 1 つを emit します。`policy_denied` / `scope_inflation_blocked` / `audience_blocked` が、SOC ダッシュボードで通常追うポリシー判定シグナルです。

| event 定数 | 発火タイミング | 想定シビアリティ | 関連ページ |
|---|---|---|---|
| `AuditTokenExchangeRequested` | `/token` が RFC 8693 リクエストを受理し handler に入った | info | [ガイド: token exchange](/ja/concepts/token-exchange) |
| `AuditTokenExchangeGranted` | exchange を admit し新しいアクセストークン(任意で refresh)を発行 | info | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangePolicyDenied` | 組み込み側の `TokenExchangePolicy` が拒否(deny)を返却 | warn | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangePolicyError` | ポリシーが拒否(deny)以外のエラーを返却(一過性のインフラ障害など) | warn | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeScopeInflationBlocked` | 要求 scope が subject_token の scope または client allow-list を超えた | warn | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeAudienceBlocked` | 要求 audience がポリシーの allow-list の外だった | warn | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeTTLCapped` | 発行 TTL を(handler の希望、subject_token の残り、グローバル上限)の最小値で切り詰めた | info | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActChainTooDeep` | ネストした act chain の深さが上限を超えた | warn | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeEmptyScopeRejected` | scope subset を空集合に解決して拒否 | warn | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActorEqualsSubject` | actor_token が subject_token と同じ subject に解決(委譲なし) | info | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenExternal` | subject_token がローカルレジストリで解決できず、外部発行の opaque トークンとして扱った | info | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeActorTokenExternal` | actor_token がローカルレジストリで解決できず、外部発行の opaque トークンとして扱った | info | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenInvalid` | subject_token の検証に失敗(signature / TTL / cnf 不一致) | warn | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSubjectTokenRegistryError` | レジストリの参照(lookup)が `NotFound` 以外の障害を観測。通信路上の応答は `invalid_grant` のまま | alert | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeRefreshIssued` | exchange が refresh 発行をオプトイン(`IssueRefreshToken=op.PtrBool(true)`) | info | [ユースケース: token exchange](/ja/use-cases/token-exchange) |
| `AuditTokenExchangeSelfExchange` | exchange の宛先が呼び出し client 自身(受動的なトークン replay シナリオ) | warn | [ユースケース: token exchange](/ja/use-cases/token-exchange) |

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
