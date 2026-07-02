---
title: Device Code（RFC 8628） — 組み込み
description: device-authorization grant を有効化 — /device_authorization、ポーリング、slow_down、組み込み側が所有する verification ページ。
---

# ユースケース — Device Code（RFC 8628）

device flow の概念的背景（何で、いつ選び、なぜ `slow_down` / `expired_token` が要るか）は [Device Code 入門](/ja/concepts/device-code) を先に読んでください。このページは組み込み手順を扱います。

::: details `device_code` と `user_code` の違い
`/device_authorization` は 2 つの異なる識別子を返します。**`device_code`** は長い不透明文字列で、デバイス側だけが保持し、`/token` へのポーリングごとに送信します — 実質的に「この保留中の authorization」を表すベアラ資格情報です。**`user_code`** は短い人間が打てる文字列（"BDWP-HQPK" 等）で、デバイスが画面に表示し、ユーザがスマホやノート PC で入力します。寿命は同じ（`expires_in`）ですが、見せる相手が完全に異なります。ユーザは `device_code` を見ませんし、OP は `/token` で `user_code` を受け付けません。
:::

::: details `verification_uri` と `verification_uri_complete` の違い
**`verification_uri`** は素の URL で、ユーザが画面表示を見て自分で訪問し `user_code` を手で入力する経路です — スキャンできないユーザのために画面に表示します。**`verification_uri_complete`** は同じ URL に `user_code` をクエリパラメータとして埋め込んだもので、QR コード化に適しています。ユーザは何も打たずに済みます。どちらも組み込み側が所有する同じページに到達します。ページ側は `user_code` クエリパラメータがあれば自動入力し、無ければ手入力フォームを表示します。
:::

::: details `interval` とポーリングとは
RFC 8628 では、デバイスはユーザがスマホなどで承認するのを待つあいだ `/token` を繰り返し呼び出します。`interval`（秒）は、OP が指定するポーリング間の最小待ち時間です。デバイスがそれより速く呼び出した場合、OP は `slow_down` を返し、デバイス側に保存された interval を引き上げます — 全レプリカが新しい下限を尊重します。既定は 5 秒。フリート側で障害復旧をすばやく回せるなら短縮の余地はありますが、5 秒のレイテンシがボトルネックになるケースだけにしてください。
:::

## grant を有効化

```go
import (
  "time"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // DeviceCodeStore サブストアを同梱
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithDeviceCodeGrant(),
  op.WithDeviceCodeExpiry(10*time.Minute),       // 任意。既定 10 分
  op.WithDeviceCodePollInterval(5*time.Second), // 任意。既定 5 秒

  op.WithStaticClients(op.PublicClient{
    ID:           "tv-app",
    RedirectURIs: nil, // device-code クライアントは /authorize に来ない
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
設定 store が nil 以外な `DeviceCodes()` を返さない場合、`op.New` は構成エラーを返します。最初のポーリングで panic にはなりません。専用の `op.WithDeviceCodeGrant()` 経由で grant を有効化しても、`op.WithGrants(grant.DeviceCode, ...)` 経由でも、同じゲートが発火します — どちらの経路でもサブストアは必須です。
:::

## verification ページ

`/device_authorization` は `verification_uri` を返しますが、そのページが指す URL は **ライブラリではなく組み込み側がホストします** — 設計上の意図です。verification を組み込み側の責務にしているのは:

1. **ブランドと UX**: ページを既存サインイン UI の隣に置けるため
2. **不正対策ポリシー**: レコード単位の総当たり制御、IP rate limit、CAPTCHA、監査 triage は組み込み側の既存不正対策スタックに属するため

既定の URI は `<issuer>/device`。verification ページが別の場所にあるなら `op.WithDeviceVerificationURI("https://acme.com/connect")` で上書きします。

`expires_in` と `interval` には専用の knob があります: `op.WithDeviceCodeExpiry(...)` と `op.WithDeviceCodePollInterval(...)` です。これらは `op.WithAccessTokenTTL` からは導出されません。アクセストークンを 30 秒や 60 秒にしている deployment でも、ユーザがスマホに移り、コードを入力し、承認するための 10 分をそのまま残せます。

::: warning user_code は構造的に総当たり可能
短いコードは入力しやすい一方で、総当たりを受けやすくなります。verification ページを自前で作る組み込み側のために、本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) で総当たり対策を同梱しています。**使ってください** — 同等の制御が既存スタックにあるなら別ですが。
:::

### 提出された user_code を検証する

```go
import "github.com/libraz/go-oidc-provider/op/devicecodekit"

// verification ハンドラの中で:
matched, err := devicecodekit.VerifyUserCode(ctx, deps, deviceCodeID, submittedUserCode)
switch {
case err == nil && matched:
    // コード一致 — consent 画面へ進む
case errors.Is(err, devicecodekit.ErrAlreadyDecided):
    // レコードはすでに承認 / 拒否済。「使用済」と表示
case errors.Is(err, devicecodekit.ErrUserCodeMismatch):
    // 不一致。カウンタを加算。「コードが違います」と表示。残り回数は漏らさない
case errors.Is(err, devicecodekit.ErrUserCodeLockout):
    // 5 ストライク — レコードが Denied（理由 "user_code_lockout"）に遷移
    // デバイスは次のポーリングで access_denied を見る
default:
    // 想定外 — log して汎用エラーを返す
}
```

ヘルパが行うこと:

- 提出文字列を **正規化**（大文字小文字の正規化、ハイフン除去）
- 保存値と **constant-time 比較**
- 不一致でストライクカウンタを加算し `device_code.verification.user_code_brute_force` 監査イベントを発火
- `devicecodekit.MaxUserCodeStrikes`（既定 5）回外したら、レコードを **Denied**（理由 `"user_code_lockout"`）に遷移し `device_code.verification.denied` を発火

ユーザが打ち間違いではなく **拒否** をクリックした場合は、`devicecodekit.Revoke(ctx, deps, deviceCodeID, "user_denied")` を呼んでください — 同じ監査イベントが発火し、総当たりカウンタは触りません。

### 承認後

consent が取れたら、ハンドラはサブストアを直接呼んでレコードを **Approved** に遷移させます:

```go
// `op.WithStore` に渡したのと同じストア参照に対して呼ぶ。
// `provider.Store()` のようなアクセサは存在しない。
// authTime はユーザが実際に認証した壁時計時刻。token endpoint が
// id_token.auth_time に記録し（ゼロ値は claim を出さない）、
// `RequireAuthTime` を登録したクライアントはこの値で可否を判定する。
err := st.DeviceCodes().Approve(ctx, deviceCodeID, approvedSubject, time.Now())
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

デバイスは `/device_authorization` に `resource=<absolute URI>` を付けて、発行されるアクセストークンを特定のリソースサーバに固定できます。ハンドラは `/authorize` / `/token` と同じゲートを適用します:

- 値は絶対 URI でなければなりません(RFC 8707 §2)。相対 URI は `400 invalid_target` で拒否します。
- 正規化後の値(scheme + host を小文字化、末尾 `/` 除去)はクライアントの `Resources` 許可リストに含まれている必要があります。クライアントに登録されていない resource を要求すると `400 invalid_target` で拒否されます — OP が発行する AT の `aud` に乗せられるのは登録済 `Resources` だけです。
- `resource=` を複数指定すると `400 invalid_target` で拒否されます。このリリースの発行パイプラインは単一 audience だけを encode するため、ハンドラは「黙って切り捨てる」入力を受け付けません。

::: warning 未登録 resource は拒否されます
OP が audience として発行できるのは、クライアントの `Resources` に登録済みの値だけです。組み込み側は device flow で使うリソースサーバ URI を、`resource=` として送る前にクライアントシードまたは dynamic registration のメタデータへ追加してください。
:::

## Polling 応答

| 通信路上の応答 | 意味 |
|---|---|
| `400 authorization_pending` | ユーザがまだ承認していない。`interval` 秒後に再ポーリング |
| `400 slow_down` | ポーリングが速すぎた。interval を倍に — RFC 8628 §3.5。OP が新 interval を原子的に永続化するのでマルチレプリカでも強制される。観測値の永続化に失敗した場合は `device_code.poll_observation.failed` を発火し、観測ギャップを見える化する |
| `400 access_denied` | ユーザが拒否（または総当たり対策がロックアウト、`devicecodekit.Revoke` が呼ばれた）。ポーリングを停止 |
| `400 expired_token` | `device_code` が `expires_in` を超えた。ポーリングを停止 |
| `200 { access_token, ... }` | 承認 — 通常の token 応答として処理 |

## デバイス登録解除(unenroll)時の連鎖失効

組み込み側がデバイスの authorization を失効させるとき(ユーザがアカウント設定で「この TV を削除」をクリックなど)は、そのレコードから発行されたアクセストークンも同時に失効すべきです。`devicecodekit.Deps.AccessTokens` を渡しておくと `devicecodekit.Revoke` がその連鎖失効まで実行します:

::: details cascade revocation とは
「親」レコード（ここではデバイス authorization）が失効されたとき、そこから発行された「子」の資格情報も同時に失効させる考え方です。device-code では、`GrantID` がそのデバイスコード id を指すアクセストークンが該当します。連鎖失効が無いと、ユーザが「この TV を削除」を押しても、TV のメモリ上のアクセストークンは TTL 満了まで動き続け、失効が静かに不完全になります。本ライブラリは発行するトークンに `GrantID` を付けているため、ヘルパがこの走査を 1 クエリで回せます。
:::

```go
deps := &devicecodekit.Deps{
    DeviceCodes:  st.DeviceCodes(),
    AccessTokens: st.AccessTokens(), // 任意。nil なら連鎖失効をスキップ
    Audit:        auditEmitter,
}

if err := devicecodekit.Revoke(ctx, deps, deviceCodeID, devicecodekit.DenyReasonUserRevokedDevice); err != nil {
    // log + 運用者に見える失敗として扱う
}
```

`AccessTokens` を渡した場合、`device_code.revoked` 監査イベントには `revoked_access_tokens` が入ります。JWT stateless 構成や組み込み側が別経路で連鎖失効を回す構成では nil のままで構いません。その場合でも authorization 行は拒否状態に遷移し、監査イベントは発火します。

## 動かしてみる

[`examples/31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) は RFC 8628 のフルラウンドトリップを実演します:

```sh
(cd examples/31-device-code-cli && go run -tags example .)
```

OP を起動し、枠付きの `user_code` パネルと `verification_uri_complete` ショートカットを表示します。数秒後にブラウザ承認をシミュレートし、access_token + id_token が発行されるまでポーリングします。ファイルはロール別に分割（`op.go` / `cli.go` / `device.go` / `probe.go`）。

## 続きはこちら

- [Device Code 入門](/ja/concepts/device-code) — Netflix スタイルでフローを解説
- [CIBA の組み込み](/ja/use-cases/ciba) — ユーザが別の利用面にいるが、コード表示は合わない場合
