---
title: Audit イベントカタログ
description: OP が発火する op.Audit* の全イベント、発火タイミング、extras に載るフィールド。
outline: 2
---

# Audit イベントカタログ

OP は `op/audit.go` で閉じたカタログとして定義された、構造化された audit イベントを発火します。各イベントは `<area>.<verb>`(または `<area>.<verb>.<qualifier>`)形の安定した文字列で、SOC ダッシュボードが自由形式のメッセージを parse することなく、area 単位で集計できる形になっています。

## 購読する

```go
op.New(
    /* 必須オプション */
    op.WithAuditLogger(slog.New(myJSONHandler)),
)
```

`op.WithAuditLogger` は `*slog.Logger` を受け取ります。各イベントは、`msg` がイベント識別子(たとえば `"token.issued"`)で、属性に `request_id` / `subject` / `client_id` とカテゴリ固有のフィールドを持つ `extras` グループが付いた、構造化ログのエントリとして記録されます。

`WithAuditLogger` を渡さない場合は、`WithLogger` で設定したロガー (または `slog.Default()`)に流れます。

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

### アカウント管理

ほとんどは、OP が直接ホストしない out-of-band(帯域外)の管理パスから発火します。SOC が単一の購読点でカバーできるよう、本ライブラリのカタログに集約しています。

| イベント | 発火タイミング |
|---|---|
| `account.created` | ユーザアカウントを払い出した |
| `account.deleted` | ユーザアカウントを削除した |
| `account.email.added` | アカウントに email を追加した |
| `account.email.verified` | email の所有を確認した(リンク / OTP) |
| `account.email.removed` | email を削除した |
| `account.email.set_primary` | プライマリ email を変更した |
| `account.passkey.registered` | WebAuthn credential を追加した |
| `account.passkey.removed` | WebAuthn credential を削除した |
| `account.totp.enabled` | TOTP 登録を完了した |
| `account.totp.disabled` | TOTP を解除した |
| `account.password.changed` | パスワードリセット / 変更 |
| `account.recovery_codes.regenerated` | recovery batch を再発行した |
| `recovery.support_escalation` | サポートによる override / 手動 recovery |
| `federation.linked` | 外部 IdP の credential をリンクした |
| `federation.unlinked` | 外部 IdP の credential を解除した |

### ログイン / MFA / ステップアップ

各 factor が解決したあとに、authenticator chain から発火します。

| イベント | 発火タイミング |
|---|---|
| `login.success` | プライマリ credential の検証が成功し、subject が確定した |
| `login.failed` | プライマリ credential が拒否された |
| `mfa.required` | session の AAL が要求未満で、第 2 factor を要求した |
| `mfa.success` | 第 2 factor が受理された |
| `mfa.failed` | 第 2 factor が拒否された |
| `step_up.required` | RP がより高い `acr_values` を要求し、再度プロンプトした |
| `step_up.success` | step-up factor が受理された |

::: details extras
- `factor` — `password`、`passkey`、`totp`、`email_otp`、`captcha`、`recovery_code`、または user-defined Step kind
- `aal` — その factor がセッションを引き上げた assurance level
- `amr_values` — `amr` claim に寄与した RFC 8176 §2 のコード
:::

### Consent

| イベント | 発火タイミング |
|---|---|
| `consent.granted` | ユーザがプロンプトで consent をクリックした |
| `consent.granted.first_party` | ファーストパーティの自動 consent を適用した(プロンプトなし) |
| `consent.granted.delta` | delta consent が、新規センシティブ scope の再プロンプトをトリガした |
| `consent.skipped.existing` | 既存の grant がリクエストを覆っており、プロンプトが不要だった |
| `consent.revoked` | ユーザが過去の grant を取り消した |

::: details extras
- `scopes_granted`、`scopes_requested` — 文字列スライス
- `audience` — audience 単位 scope の場合
:::

### コード / トークン

authorize-code 発行パスと、token endpoint から発火します。

| イベント | 発火タイミング |
|---|---|
| `code.issued` | authorization code を発行した |
| `code.consumed` | `/token` で code を消費した |
| `code.replay_detected` | code が二度提示された — chain を失効させる |
| `token.issued` | access token + (任意で)refresh + (任意で)id_token を発行した |
| `token.refreshed` | refresh token をローテーションし、新しい access token を発行した |
| `token.revoked` | `/revoke` または grant cascade で失効させた |
| `refresh.replay_detected` | refresh token がローテーション猶予を超過して提示された — chain を失効させる |

::: details extras
- `grant_type` — `authorization_code`、`refresh_token`、`client_credentials`
- `format` — access token の `jwt` / `opaque`
- `offline_access` — bool。`offline_access` chain なら true
- `cnf` — sender-bound のとき、`dpop_jkt` または `mtls_x5t#S256`
:::

### セッション / ログアウト

| イベント | 発火タイミング |
|---|---|
| `session.created` | 新しいブラウザセッションを発行した(ログイン後) |
| `session.destroyed` | session を削除した(logout / 期限切れ / eviction) |
| `logout.rp_initiated` | RP-Initiated Logout が発火した |
| `logout.back_channel.delivered` | Back-Channel logout token を RP に配送した |
| `logout.back_channel.failed` | Back-Channel 配送失敗(HTTP エラー / timeout / 検証失敗) |
| `bcl.no_sessions_for_subject` | `/end_session` で subject を指定したが、対応する session が 0 件だった |

::: details `bcl.no_sessions_for_subject` の意図
揮発な `SessionStore`(persistence 無しの Redis、`maxmemory` eviction 配下のインメモリ層など)では、これは「session が確立から logout までの間に追い出された」というシグナルになります。OIDC Back-Channel Logout 1.0 §2.7 にある best-effort delivery の最低ラインがゼロまで下がる、という意味です。INFO レベルの運用が想定で、揮発配置ではこのギャップは想定済みです。SOC ツールはイベント単位ではなく、発生レートの上昇に対してアラートを張ります。設定された `WithSessionDurabilityPosture` の値も extras に含むので、ダッシュボードは「揮発配置で想定内」と「永続配置で想定外」を分離できます。
:::

### 防御

リクエスト検証パスが、不正利用シグナルや運用者向けポリシーのヒットを検知したときに発火します。

| イベント | 発火タイミング |
|---|---|
| `rate_limit.exceeded` | レートリミッタがリクエストを拒否した |
| `rate_limit.bypassed` | bypass token を消費した(運用者の override) |
| `pkce.violation` | PKCE verifier 不一致 / `plain` の拒否 / FAPI 下で不在 |
| `redirect_uri.mismatch` | redirect URI が登録リストに不一致 |
| `alg.legacy_used` | 旧 alg のパスに到達した(テレメトリ。verifier では拒否) |

### Dynamic Client Registration

`/register` および `/register/{client_id}` から発火します。

| イベント | 発火タイミング |
|---|---|
| `dcr.iat.consumed` | Initial Access Token を消費した |
| `dcr.iat.expired` | TTL 超過の IAT を提示した |
| `dcr.iat.invalid` | IAT の signature / format が不正 |
| `dcr.open_registration_used` | open(IAT 不要)登録を受理した |
| `dcr.client.registered` | 新規 client を作成した |
| `dcr.client.metadata_read` | RAT 持ちの GET on `/register/{client_id}` |
| `dcr.client.metadata_updated` | RAT 持ちの PUT on `/register/{client_id}` |
| `dcr.client.deleted` | RAT 持ちの DELETE on `/register/{client_id}` |
| `dcr.rat.invalid` | Registration Access Token を拒否した |
| `dcr.metadata.validation_failed` | メタデータペイロードがポリシー違反 |

## 安定性

audit イベント名は公開 API 表面の一部です:

- 新しいイベントは、マイナーリリースで追加され得ます。
- 既存のイベント名は、メジャーリリースで deprecation notice 付きでしか改名されません。

ダッシュボードはイベント名を pin してください。出現順序や、このページに記載のない `extras` フィールドの形には依存しないでください。

## このリストの裏取り

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -hE 'AuditEvent\("[a-z_.]+"\)' op/audit.go \
  | grep -oE '"[a-z_.]+"' | sort -u
```

出力が、このページがミラーしている閉じたカタログです。
