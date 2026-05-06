---
title: Device Code（RFC 8628） — 組み込み
description: device-authorization grant を有効化 — /device_authorization、polling、slow_down、組み込み側が所有する verification ページ。
---

# ユースケース — Device Code（RFC 8628）

device flow の概念的背景（何で、いつ選び、なぜ `slow_down` / `expired_token` が要るか）は [Device Code 入門](/ja/concepts/device-code) を先に読んでください。このページは組み込み手順を扱います。

::: details `device_code` と `user_code` の違い
`/device_authorization` は 2 つの異なる識別子を返します。**`device_code`** は長い不透明文字列で、デバイス側だけが保持し、`/token` への poll ごとに送信します — 実質的に「この保留中の authorization」用のベアラ credential です。**`user_code`** は短い人間が打てる文字列（"BDWP-HQPK" 等）で、デバイスが画面に表示し、ユーザがスマホやノート PC で入力します。寿命は同じ（`expires_in`）ですが、見せる相手が完全に異なります。ユーザは `device_code` を見ませんし、OP は `/token` で `user_code` を受け付けません。
:::

::: details `verification_uri` と `verification_uri_complete` の違い
**`verification_uri`** は素の URL で、ユーザが画面表示を見て自分で訪問し `user_code` を手で入力する経路です — スキャンできないユーザのために画面に表示します。**`verification_uri_complete`** は同じ URL に `user_code` をクエリパラメータとして埋め込んだもので、QR コード化に適しています。ユーザは何も打たずに済みます。どちらも組み込み側が所有する同じページに到達します。ページ側は `user_code` クエリパラメータがあれば自動入力し、無ければ手入力フォームを表示します。
:::

::: details `interval` と polling とは
RFC 8628 ではデバイスがユーザのスマホでの承認を待つあいだ `/token` を繰り返し叩きます。`interval`（秒）は OP が指定する poll 間の最小待ち時間です。デバイスがそれより速く poll してきたら OP は `slow_down` を返し、デバイスの保存 interval を引き上げます — 全レプリカが新しい下限を尊重します。既定は 5 秒。フリート側で障害復旧をすばやく回せるなら短縮の余地はありますが、5 秒のレイテンシがボトルネックになるケースだけにしてください。
:::

## grant を有効化

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // DeviceCodeStore サブストアを同梱
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithDeviceCodeGrant(),

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

device-code サブストア（`store.DeviceCodeStore`）は必須。in-memory アダプタは同梱しています。SQL / Redis アダプタは v0.9.2 で着地します。

::: warning サブストアの存在は op.New で強制
設定 store が non-nil な `DeviceCodes()` を返さない場合、`op.New` は構成エラーを返します。最初の poll で panic にはなりません。専用の `op.WithDeviceCodeGrant()` 経由で grant を有効化しても、`op.WithGrants(grant.DeviceCode, ...)` 経由でも、同じゲートが発火します — どちらの経路でもサブストアは必須です。v0.9.0 の SQL / Redis アダプタはまだ提供していないので、in-memory アダプタ、composite アダプタ(hot tier に in-memory)、または v0.9.2 を待ってください。
:::

## verification ページ

`/device_authorization` は `verification_uri` を返しますが、そのページが指す URL は **ライブラリではなく組み込み側がホストします** — 設計上の意図です。verification を組み込み側の責務にしているのは:

1. **ブランドと UX**: ページを既存サインイン UI の隣に置けるため
2. **不正対策ポリシ**: レコード単位の brute-force 制御、IP rate limit、captcha、audit triage は組み込み側の既存 fraud stack に属するため

既定の URI は `<issuer>/device`。verification ページが別の場所にあるなら `op.WithDeviceVerificationURI("https://acme.com/connect")` で上書きします。

::: warning user_code は構造的に brute-force 可能
短いコードは使えるが長いコードは使い物にならない。verification ページを自前で作る組み込み側のために、本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) で brute-force gate を同梱しています。**使ってください** — 同等のゲートが既存 stack にあるなら別ですが。
:::

### 提出された user_code を検証する

```go
import "github.com/libraz/go-oidc-provider/op/devicecodekit"

// verification handler の中で:
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
    // デバイスは次の poll で access_denied を見る
default:
    // 想定外 — log して汎用エラーを返す
}
```

ヘルパが行うこと:

- 提出文字列を **canonicalise**（大文字小文字の正規化、ハイフン除去）
- 保存値と **constant-time 比較**
- 不一致でストライクカウンタを加算し `device_code.verification.user_code_brute_force` 監査イベントを発火
- `devicecodekit.MaxUserCodeStrikes`（既定 5）回外したら、レコードを **Denied**（理由 `"user_code_lockout"`）に遷移し `device_code.verification.denied` を発火

ユーザが打ち間違いではなく **拒否** をクリックした場合は、`devicecodekit.Revoke(ctx, deps, deviceCodeID, "user_denied")` を呼んでください — 同じ 監査イベントが発火し、brute-force カウンタは触りません。

### 承認後

consent が取れたら、handler はサブストアを直接呼んでレコードを **Approved** に遷移させます:

```go
// `op.WithStore` に渡したのと同じストア参照に対して呼ぶ。
// `provider.Store()` のようなアクセサは存在しない。
// authTime はユーザが実際に認証した壁時計時刻。token endpoint が
// id_token.auth_time に stamp し（ゼロ値は claim を出さない）、
// `RequireAuthTime` を登録したクライアントはこの値で gate を判定する。
err := st.DeviceCodes().Approve(ctx, deviceCodeID, approvedSubject, time.Now())
```

デバイスからの次の `/token` poll が成功します。

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

デバイスは `/device_authorization` に `resource=<absolute URI>` を付けて、発行されるアクセストークンを特定の resource server に固定できます。ハンドラは `/authorize` / `/token` と同じゲートを適用します:

- 値は絶対 URI でなければなりません(RFC 8707 §2)。相対 URI は `400 invalid_target` で拒否します。
- 正規化後の値(scheme + host を小文字化、末尾 `/` 除去)はクライアントの `Resources` allowlist に含まれている必要があります。クライアントに登録されていない resource を要求すると `400 invalid_target` で拒否されます — OP が発行する AT の `aud` に乗せられるのは登録済 `Resources` だけです。
- `resource=` を複数指定すると `400 invalid_target` で拒否されます。現状の発行パイプラインは単一 audience だけを encode するため、ハンドラは「黙って切り捨てる」入力を受け付けません。複数 audience 対応は今後の課題です。

::: warning v0.9.x 以前は未登録 resource を黙って受け付けていました
旧バージョンは `resource=` が絶対 URI として parse できることだけを確認しており、値はクライアントの登録 `Resources` にかかわらず device-code レコードに保存され、最終的にアクセストークンの `aud` claim に乗りました。寛容な挙動に依存していた組み込み側は、クライアントの `Resources` にその値を追加するか、`resource=` を送らないようにしてください。
:::

## Polling 応答

| 通信路上の応答 | 意味 |
|---|---|
| `400 authorization_pending` | ユーザがまだ承認していない。`interval` 秒後に再 poll |
| `400 slow_down` | poll が速すぎた。interval を倍に — RFC 8628 §3.5。OP が新 interval を原子的に永続化するのでマルチレプリカでも強制される |
| `400 access_denied` | ユーザが拒否（または brute-force gate がロックアウト、`devicecodekit.Revoke` が呼ばれた）。poll を停止 |
| `400 expired_token` | `device_code` が `expires_in` を超えた。poll を停止 |
| `200 { access_token, ... }` | 承認 — 通常の token 応答として処理 |

## デバイス登録解除(unenroll)時の連鎖失効

組み込み側がデバイスの authorization を失効させるとき(ユーザがアカウント設定で「この TV を削除」をクリックなど)は、そのレコードから発行されたアクセストークンも同時に失効すべきです。v0.9.1 では監査シグナルだけ提供し、ライブラリ内蔵のカスケード波及処理は v0.9.2 に延ばしています。それまでは組み込み側が `op.AuditDeviceCodeRevoked` を購読してカスケードを自前で回します:

::: details cascade revocation とは
「親」レコード（ここではデバイス authorization）が失効されたとき、そこから発行された「子」credential も同じ動作で失効させるべき、という考え方です。device-code では、`GrantID` がそのデバイスコード id を指すアクセストークン、同一 chain のリフレッシュトークンがすべて該当します。cascade が無いと、ユーザが「この TV を削除」を押しても、TV のメモリ上のアクセストークンは TTL 満了まで動き続け、失効が静かに不完全になります。本ライブラリは発行する全トークンに `GrantID` を付けているため、組み込み側はこの walk を 1 クエリで回せます。
:::

```go
// 監査ロガー / オブザーバの中で:
case op.AuditDeviceCodeRevoked:
    deviceCodeID := event.Extras["device_code_id"].(string)
    // このデバイス authorization 由来の access token はすべて
    // GrantID == deviceCodeID を持つので、既存の per-grant cascade で十分。
    if _, err := st.AccessTokens().RevokeByGrant(ctx, deviceCodeID); err != nil {
        // log + alert
    }
```

ライブラリ側の `IssuedAccessTokens(deviceCodeID) []string` サブストア拡張と OP 側の `RevokeByGrant` ドライバは、SQL / Redis サブストアの実装とともに v0.9.2 で着地予定です。

## 動かしてみる

[`examples/30-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-device-code-cli) は RFC 8628 のフルラウンドトリップを実演します:

```sh
go run -tags example ./examples/30-device-code-cli
```

OP を起動し、boxed `user_code` パネル + `verification_uri_complete` ショートカットを表示、数秒後にブラウザ承認をシミュレートし、access_token + id_token を発行するまで poll します。ファイルはロール別に分割（`op.go` / `cli.go` / `device.go` / `probe.go`）。

## 続きはこちら

- [Device Code 入門](/ja/concepts/device-code) — Netflix スタイルでフローを解説
- [CIBA の組み込み](/ja/use-cases/ciba) — ユーザが別の利用面にいるが、コード表示は合わない場合
