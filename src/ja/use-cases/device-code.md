---
title: Device Code（RFC 8628） — 組み込み
description: RFC 8628 device authorization を有効化 — /device_authorization、opaque attempt key による検証、polling、slow_down、組み込み側の承認ページ。
pageClass: pg-use-cases-device-code
---

# 使い方 — Device Code（RFC 8628）

device flow がどういうものか、いつ選ぶべきか、なぜ `slow_down` / `expired_token` が要るのか、といった概念的な背景は [Device Code 入門](/ja/concepts/device-code) を先に読んでください。このページは組み込み手順を扱います。

<svg role="img" aria-labelledby="device-code-flow-title" viewBox="0 0 760 360" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="device-code-flow-title">Device Code の流れ: 入力しづらいデバイスがコードを表示し、ユーザは自分のスマホや PC でそのコードを入力して承認し、デバイスは OP がアクセストークンを発行するまで /token をポーリングする。</title>
  <line class="dc-life" x1="110" y1="78" x2="110" y2="348"/>
  <line class="dc-life dc-life-op" x1="380" y1="78" x2="380" y2="348"/>
  <line class="dc-life" x1="650" y1="78" x2="650" y2="348"/>

  <rect class="dc-box" x="20" y="14" width="180" height="64" rx="8"/>
  <text class="dc-text" x="110" y="36" text-anchor="middle">デバイス</text>
  <text class="dc-sub" x="110" y="54" text-anchor="middle">入力しづらい</text>
  <text class="dc-sub" x="110" y="70" text-anchor="middle">TV / CLI / プリンタ</text>

  <rect class="dc-op" x="290" y="14" width="180" height="64" rx="8"/>
  <text class="dc-text" x="380" y="36" text-anchor="middle">OP</text>
  <text class="dc-sub" x="380" y="54" text-anchor="middle">/device_authorization</text>
  <text class="dc-sub" x="380" y="70" text-anchor="middle">DeviceCodeStore · /token</text>

  <rect class="dc-box" x="560" y="14" width="180" height="64" rx="8"/>
  <text class="dc-text" x="650" y="40" text-anchor="middle">ユーザの端末</text>
  <text class="dc-sub" x="650" y="62" text-anchor="middle">スマホ / PC</text>

  <path class="dc-flow" d="M110 114 H380"/>
  <path class="dc-flow" d="M373 110 L380 114 L373 118"/>
  <text class="dc-sub" x="245" y="106" text-anchor="middle">1. POST /device_authorization</text>

  <path class="dc-flow" d="M380 152 H110"/>
  <path class="dc-flow" d="M117 148 L110 152 L117 156"/>
  <text class="dc-sub" x="245" y="144" text-anchor="middle">2. device_code + user_code</text>

  <rect class="dc-box" x="26" y="176" width="168" height="28" rx="6"/>
  <text class="dc-sub" x="110" y="195" text-anchor="middle">3. コードと URL を表示</text>

  <path class="dc-flow dc-oob" d="M110 232 H650"/>
  <path class="dc-flow" d="M643 228 L650 232 L643 236"/>
  <text class="dc-sub halo" x="380" y="224" text-anchor="middle">4. ユーザが画面のコードを読む</text>

  <path class="dc-flow" d="M650 270 H380"/>
  <path class="dc-flow" d="M387 266 L380 270 L387 274"/>
  <text class="dc-sub" x="515" y="262" text-anchor="middle">5. コードを入力して承認</text>

  <path class="dc-flow" d="M110 308 H380"/>
  <path class="dc-flow" d="M373 304 L380 308 L373 312"/>
  <text class="dc-sub" x="245" y="300" text-anchor="middle">6. device_code で /token をポーリング</text>

  <path class="dc-flow" d="M380 344 H110"/>
  <path class="dc-flow" d="M117 340 L110 344 L117 348"/>
  <text class="dc-sub" x="245" y="336" text-anchor="middle">7. 200 access_token</text>
</svg>

::: details `device_code` と `user_code` の違い
`/device_authorization` は 2 つの異なる識別子を返します。**`device_code`** は長い不透明文字列で、デバイス側だけが保持し、`/token` へのポーリングごとに送信します — 実質的に「この保留中の authorization」を表すベアラ資格情報です。**`user_code`** は短い人間が打てる文字列（"BDWP-HQPK" 等）で、デバイスが画面に表示し、ユーザがスマホやノート PC で入力します。寿命は同じ（`expires_in`）ですが、見せる相手が完全に異なります。ユーザは `device_code` を見ませんし、OP は `/token` で `user_code` を受け付けません。
:::

::: details `verification_uri` と `verification_uri_complete` の違い
**`verification_uri`** は素の URL で、ユーザが画面表示を見て自分で訪問し `user_code` を手で入力する経路です — スキャンできないユーザのために画面に表示します。**`verification_uri_complete`** は同じ URL に `user_code` をクエリパラメータとして埋め込んだもので、QR コード化に適しています。ユーザは何も打たずに済みます。どちらも組み込み側が所有する同じページに到達します。ページ側は `user_code` クエリパラメータがあれば自動入力し、無ければ手入力フォームを表示します。
:::

::: details `interval` とポーリングとは
RFC 8628 では、デバイスはユーザがスマホなどで承認するのを待つあいだ `/token` を繰り返し呼び出します。`interval`（秒）は、OP が指定するポーリング間の最小待ち時間です。デバイスがそれより速く呼び出した場合、OP は `slow_down` を返し、デバイス側に保存された interval を引き上げます。全レプリカが新しい下限を尊重します。既定は 5 秒です。短くするのは、デバイス群の障害時の後始末が十分速く回る構成で、5 秒の待ち時間が実際にボトルネックになっているときだけにしてください。
:::

## grant を有効化

```go
import (
  "time"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // DeviceCodeStore サブストアを同梱
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithGrants(grant.DeviceCode),
  op.WithDeviceCodeGrant(),
  op.WithDeviceCodeExpiry(10*time.Minute),       // 任意。既定 10 分
  op.WithDeviceCodePollInterval(5*time.Second), // 任意。既定 5 秒

  op.WithStaticClients(op.PublicClient{
    ID:           "tv-app",
    RedirectURIs: nil, // device-code クライアントは /auth に来ない
    GrantTypes:   []string{"urn:ietf:params:oauth:grant-type:device_code"},
    Scopes:       []string{"openid", "profile", "offline_access"},
  }),
)
```

`op.WithDeviceCodeGrant()` がやること:

1. `/device_authorization` を設定済 endpoint パスにマウント
2. device-code URN（`urn:ietf:params:oauth:grant-type:device_code`）を `/token` に登録
3. discovery 文書に `device_authorization_endpoint` を出し、`grant_types_supported` に URN を追加

device-code サブストア（`store.DeviceCodeStore`）は必須です。in-memory と SQL の両アダプタが同梱しています — SQL アダプタは sqlite / mysql / postgres で `oidc_device_codes` テーブルに永続化します。Redis アダプタはこのサブストアに `nil` を返すため、Redis のみの構成では composite アダプタで `DeviceCodes` を durable な層（SQL か in-memory）にルーティングしてください。

::: warning サブストアの存在は op.New で強制
構成した store が nil 以外の `DeviceCodes()` を返さない場合、`op.New` は構成エラーを返します。最初のポーリングで panic にはなりません。専用の `op.WithDeviceCodeGrant()` 経由で grant を有効化しても、`op.WithGrants(grant.DeviceCode, ...)` 経由でも、同じ構成検査が働きます。どちらの経路でもサブストアは必須です。
:::

## verification ページ

`/device_authorization` は `verification_uri` を返しますが、そのページが指す URL は **ライブラリではなく組み込み側がホストします** — 設計上の意図です。verification を組み込み側の責務にしているのは:

1. **ブランドと UX**: ページを既存サインイン UI の隣に置けるため
2. **不正対策ポリシー**: レコード単位の総当たり制御、IP rate limit、CAPTCHA、監査 triage は組み込み側の既存不正対策スタックに属するため

既定の URI は `<issuer>/device`。verification ページが別の場所にあるなら `op.WithDeviceVerificationURI("https://acme.com/connect")` で上書きします。

`expires_in` と `interval` には専用の knob があります: `op.WithDeviceCodeExpiry(...)` と `op.WithDeviceCodePollInterval(...)` です。これらは `op.WithAccessTokenTTL` からは導出されません。アクセストークンを 30 秒や 60 秒にしている deployment でも、ユーザがスマホに移り、コードを入力し、承認するための 10 分をそのまま残せます。

::: warning user_code は構造的に総当たり可能
短いコードは入力しやすい一方で、総当たりを受けやすくなります。verification ページを自前で作る組み込み側のために、本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) で総当たり対策を同梱しています。最初の手入力では opaque なサーバ側 ceremony key を渡して `VerifyUserCodeByAttemptKey` を呼び、認証と同意の後に `ApproveUserCode` を呼んでください。raw `user_code` を attempt key に使ってはなりません。
:::

### 提出された user_code を検証する

```go
import (
    "crypto/rand"
    "encoding/base64"
    "errors"
    "time"

    "github.com/libraz/go-oidc-provider/op/devicecodekit"
)

// deps は一度構築して保持し、すべての helper に同じ pointer を渡す。
// Deps は mutex 付き既定 limiter を持つため、使用後にコピーしてはならない。
deps := &devicecodekit.Deps{
    DeviceCodes:  st.DeviceCodes(),
    AuditLogger: auditLogger, // 任意。helper の監査レコードを受け取る
}

// attempt key は認証済みのサーバ側 ceremony を識別する opaque 値。
// ユーザが入力した user_code を使ってはならない。
var rawAttemptKey [32]byte
if _, err := rand.Read(rawAttemptKey[:]); err != nil { /* 500 として処理 */ }
attemptKey := base64.RawURLEncoding.EncodeToString(rawAttemptKey[:])

matched, err := devicecodekit.VerifyUserCodeByAttemptKey(ctx, deps, attemptKey, submittedUserCode)
switch {
case err == nil && matched:
    // コード一致 — consent 画面へ進む
case errors.Is(err, devicecodekit.ErrAlreadyDecided):
    // レコードはすでに承認 / 拒否済。「使用済」と表示
case errors.Is(err, devicecodekit.ErrUnknownDeviceCode), errors.Is(err, devicecodekit.ErrAttemptLocked):
    // 不明 / malformed / 予算超過。どれかは表示しない
default:
    // 想定外 — log して汎用エラーを返す
}

// 認証済みユーザが要求された scope に同意した後:
if matched {
    err = devicecodekit.ApproveUserCode(ctx, deps, submittedUserCode, approvedSubject, time.Now())
}
```

ヘルパが行うこと:

- 提出文字列を **正規化**（大文字小文字の正規化、ハイフン除去）
- 保存値と **constant-time 比較**
- normalization と lookup の前に opaque attempt key を消費するため、malformed / 不明な入力も同じ bounded budget を消費します。不一致は `Deps.AuditLogger` を設定していれば `device_code.verification.user_code_brute_force` 監査イベントになります
- 既定 limiter はプロセスローカルで bounded です。複数 OP インスタンスでは、`Deps.AttemptLimiter` に共有 atomic `AttemptLimiter` を注入してください。read と increment を分けた実装は安全ではありません
- レコード単位の既存 helper は `devicecodekit.MaxUserCodeStrikes`（既定 5）を適用します。`ApproveUserCode` はストアの遷移後に `Deps.AuditLogger` 経由で `device_code.verification.approved` を発火します

ユーザが打ち間違いではなく **拒否** をクリックした場合は、`devicecodekit.DenyUserCode(ctx, deps, submittedUserCode, devicecodekit.DenyReasonUserDenied)`、または既知の device-code id に対して `devicecodekit.Revoke` を呼んでください。helper は `Deps.AuditLogger` 経由で対応する監査イベントを発火し、手入力の不一致としてはカウントしません。

### 承認後

consent が取れたら、ハンドラは同じ `*devicecodekit.Deps` pointer で `ApproveUserCode` を呼び、レコードを **Approved** に遷移させます:

```go
// `deps` は VerifyUserCodeByAttemptKey に渡した retained pointer。
// authTime はユーザが実際に認証した壁時計時刻。token endpoint が
// id_token.auth_time に記録し（ゼロ値は claim を出さない）、
// `RequireAuthTime` を登録したクライアントはこの値で可否を判定する。
err := devicecodekit.ApproveUserCode(ctx, deps, submittedUserCode, approvedSubject, time.Now())
```

デバイスからの次の `/token` ポーリングが成功します。

## `/device_authorization` の応答

```sh
curl -s -d 'client_id=tv-app&scope=openid profile' \
  https://op.example.com/oidc/device_authorization
```

```json
{
  "device_code": "f8b2c1d4...long-opaque",
  "user_code": "BDWP-HQPK",
  "verification_uri": "https://op.example.com/device",
  "verification_uri_complete": "https://op.example.com/device?user_code=BDWP-HQPK",
  "expires_in": 600,
  "interval": 5
}
```

デバイスは `user_code` + `verification_uri` を表示します。QR コードを描画できるなら `verification_uri_complete` を encode しましょう — ユーザはコードを打たずに済みます。

## RFC 8707 `resource=`

デバイスは `/device_authorization` に `resource=<absolute URI>` を付けて、発行されるアクセストークンを特定のリソースサーバに固定できます。ハンドラは `/auth` / `/token` と同じ検査を適用します:

- 値は絶対 URI でなければなりません（RFC 8707 §2）。相対 URI は `400 invalid_target` で拒否します。
- 正規化後の値（scheme + host を小文字化、末尾 `/` 除去）はクライアントの `Resources` 許可リストに含まれている必要があります。クライアントに登録されていない resource を要求すると `400 invalid_target` で拒否されます — OP が発行する AT の `aud` に乗せられるのは登録済 `Resources` だけです。
- `resource=` を複数指定すると `400 invalid_target` で拒否されます。発行パイプラインは audience を 1 つだけ受け付けるため、ハンドラは「黙って切り捨てる」入力を受け付けません。

::: warning 未登録 resource は拒否されます
OP が audience として発行できるのは、クライアントの `Resources` に登録済みの値だけです。組み込み側は device flow で使うリソースサーバ URI を、`resource=` として送る前にクライアントシードまたは dynamic registration のメタデータへ追加してください。
:::

## 送信者制約付きの device record

DPoP または mTLS を使う場合、`/device_authorization` は DPoP 鍵の thumbprint と mTLS 証明書の thumbprint を record に保存します。`/token` では発行前に、record に存在する binding をすべて再検証します。両方を持つ record には、一致する DPoP proof と mTLS 証明書の両方が必要で、片方だけでは redeem できません。proof が無い、または一致しない場合は redemption に失敗します。成功時に発行する token の `cnf` には、OP が再検証したすべての binding を反映します。

## ポーリング応答

| 通信路上の応答 | 意味 |
|---|---|
| `400 authorization_pending` | ユーザがまだ承認していない。`interval` 秒後に再ポーリング |
| `400 slow_down` | ポーリングが速すぎた。interval を倍に — RFC 8628 §3.5。OP が新 interval を原子的に永続化するのでマルチレプリカでも強制される。観測値の永続化に失敗した場合は `device_code.poll_observation.failed` を発火し、観測ギャップを見える化する |
| `400 access_denied` | ユーザが拒否（または総当たり対策がロックアウト、`devicecodekit.Revoke` が呼ばれた）。ポーリングを停止 |
| `400 expired_token` | `device_code` が `expires_in` を超えた。ポーリングを停止 |
| `200 { access_token, ... }` | 承認 — 通常の token 応答として処理 |

## デバイス登録解除（unenroll）時の連鎖失効

組み込み側がデバイスの authorization を失効させるとき（ユーザがアカウント設定で「この TV を削除」をクリックなど）は、そのレコードから発行されたアクセストークンも同時に失効すべきです。`devicecodekit.Deps.AccessTokens` を渡しておくと `devicecodekit.Revoke` がその連鎖失効まで実行します:

::: details cascade revocation とは
「親」レコード（ここではデバイス authorization）が失効されたとき、そこから発行された「子」の資格情報も同時に失効させる考え方です。device-code では、`GrantID` がそのデバイスコード id を指すアクセストークンが該当します。連鎖失効が無いと、ユーザが「この TV を削除」を押しても、TV のメモリ上のアクセストークンは TTL 満了まで動き続け、失効が静かに不完全になります。本ライブラリは発行するトークンに `GrantID` を付けているため、ヘルパがこの走査を 1 クエリで回せます。
:::

```go
deps := &devicecodekit.Deps{
    DeviceCodes:  st.DeviceCodes(),
    AccessTokens: st.AccessTokens(), // 任意。nil なら連鎖失効をスキップ
    AuditLogger:  auditLogger, // 任意。revoke 監査レコードを受け取る
}

if err := devicecodekit.Revoke(ctx, deps, deviceCodeID, devicecodekit.DenyReasonUserRevokedDevice); err != nil {
    // log + 運用者に見える失敗として扱う
}
```

`AccessTokens` を渡した場合、`device_code.revoked` 監査イベントには `revoked_access_tokens` が入ります。JWT stateless 構成や組み込み側が別経路で連鎖失効を回す構成では nil のままで構いません。その場合でも authorization 行は拒否状態に遷移し、監査イベントは発火します。

## 動かしてみる

[`examples/31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) は RFC 8628 のフルラウンドトリップを実演します:

```sh
(cd examples/31-device-code-cli && GOWORK=off go run -tags example .)
```

OP を起動し、枠付きの `user_code` パネルと `verification_uri_complete` ショートカットを表示します。数秒後にブラウザ承認をシミュレートし、access_token + id_token が発行されるまでポーリングします。ファイルは役割別に分割（`op.go` / `cli.go` / `device.go` / `probe.go`）。

## 続きはこちら

- [Device Code 入門](/ja/concepts/device-code) — Netflix スタイルでフローを解説
- [CIBA の組み込み](/ja/use-cases/ciba) — ユーザが別の利用面にいるが、コード表示は合わない場合
