---
title: 必須オプション
description: op.New が起動を拒否する 4 オプション — それぞれの理由。
---

# 必須オプション

`op.New(...)` は構築時に partial 設定を拒否するので、安全でない OP が誤ってトラフィックを受け取ることはありません。必須 4 オプションは:

| Option | 必須である理由 |
|---|---|
| [`op.WithIssuer`](#withissuer) | JWT の `iss` claim、discovery URL、cookie scope を決める。ここを誤れば下流の検査がすべて誤る。 |
| [`op.WithStore`](#withstore) | authcode、session、refresh chain、JTI replay set、client を保持する場所。ストレージ無しでは状態を置く場所がない。 |
| [`op.WithKeyset`](#withkeyset) | ID token / JWT access token / JARM の署名鍵。allow-list 上のアルゴリズムを持つ `crypto.Signer` 無しには発行を拒否する。 |
| [`op.WithCookieKeys`](#withcookiekeys) | cookie payload の AES-256-GCM 鍵に使う 32 バイトのランダム素材。session と CSRF cookie は署名のみではなく暗号化される。 |

## `WithIssuer`

```go
op.WithIssuer("https://op.example.com")
```

::: warning OIDC Discovery 1.0 §3 / FAPI 2.0 §5.4
issuer は `https://` で始まり、末尾スラッシュ無し、query / fragment 無し、でなければなりません。scheme と host は全て小文字、デフォルトポート（https は `:443`、http は `:80`）の混入は禁止、path は canonical（`..`、`.`、重複スラッシュは禁止）です。loopback の IP リテラル（`127.0.0.0/8`、`[::1]`）は localhost 開発のため `https://` 要件から免除されます。テキストの `localhost` は例外には **含まれません**（RFC 8252 §7.3 の DNS hijack 観点）。

`internal/discovery.ValidateIssuer` がオプション setter のさらに defense-in-depth として shape を強制します。typo（末尾スラッシュ、`:443`、host の大文字など）は `op.New` で失敗し、RP が拒否する discovery document を黙って吐くことはありません。この厳しさが RFC 9207 の byte 完全一致ミックスアップ防御を end-to-end で成立させています。canonical 形の詳細は [Issuer](/ja/concepts/issuer) を参照してください。
:::

## `WithStore`

```go
op.WithStore(inmem.New())
// または
op.WithStore(myCompositeStore)
```

`op.Store` interface は小さなサブストア interface の和集合です（`AuthCodeStore`、`RefreshTokenStore`、`SessionStore`、`ClientStore` …）。通常は同梱アダプタから `Store` を組み立てます。

- [`op/storeadapter/inmem`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/inmem) — 全サブストアをメモリに保持。リファレンス + 開発 + テスト用。
- [`op/storeadapter/sql`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql) — `database/sql` 上の durable サブストア。
- [`op/storeadapter/redis`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/redis) — 揮発性サブストア（`InteractionStore`、`ConsumedJTIStore`）。
- [`op/storeadapter/composite`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/composite) — hot/cold splitter。durable サブストアを片方のバックエンドに、揮発性サブストアをもう一方のバックエンドにルートする。

::: tip 既存ストレージへの接続
store interface は意図的に小さく作られています。Cassandra、Spanner、etcd、独自規約の Redis cluster — いずれに対しても実装可能です。`op/store/contract` の contract test suite が、同梱アダプタと同じ期待を満たしているかを検査します。
:::

## `WithKeyset`

```go
priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
op.WithKeyset(op.Keyset{
  {KeyID: "k1", Signer: priv},
})
```

`Keyset` は `{KeyID, Signer}` レコードのスライスです。`Signer` には `crypto.Signer` を実装するもの（`*ecdsa.PrivateKey`、`*rsa.PrivateKey`、あるいは `crypto.Signer` を返す vault / KMS ハンドル）を渡します。

::: warning アルゴリズム allow-list
ライブラリは `RS256`、`PS256`、`ES256`、`EdDSA` でのみ署名 / 検証します。**`HS*` と `none` は構造的に存在しません** — 列挙型に値が無く、`internal/jose.ParseAlgorithm` はそれらの文字列に `ok=false` を返します。

これにより RFC 7519 §6 / RFC 8725 §2.1 の alg confusion 攻撃を if 文ではなく型レベルで閉じています。
:::

## `WithCookieKeys`

```go
key := make([]byte, 32) // ちょうど 32 バイト
if _, err := rand.Read(key); err != nil { /* … */ }
op.WithCookieKeys(key)

// 多鍵ローテーション:
op.WithCookieKeys(currentKey, previousKey)
```

32 バイトは session / CSRF cookie の暗号化に使う AES-256-GCM 鍵を seed します。`WithCookieKeys` で鍵をローテーションでき、先頭鍵で暗号化、後続鍵で復号を試みるので、稼働中セッションを切らずに鍵をスワップできます。

::: warning Cookie 方式は不可変
cookie は常に `__Host-` prefix（`Domain` 無し、`Path=/`、`Secure`）。セッション cookie は `SameSite=Lax`、同意 / ログアウト POST には double-submit と Origin / Referer チェック。これらはすべて変更不可 — 譲れないセキュリティの最低ラインです。
:::

## 強く推奨されるオプション（必須ではないが、実運用ではほぼ必須）

- `op.WithStaticClients(...)` または `op.WithDynamicRegistration(...)` — どちらか無いとクライアントが認証できない。
- `op.WithAuthenticators(...)` — OP がユーザを検証する方法を定義。デフォルトは「authenticator 無し」、つまりログインは常に失敗。
- `op.WithLoginFlow(...)` — authenticator + rule を step-up ポリシー(例: password → TOTP、password → N 失敗後 captcha)に組み合わせる。

本番形の実装は [ユースケース](/ja/use-cases/) を参照してください。
