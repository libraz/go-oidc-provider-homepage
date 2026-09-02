---
title: 必須オプション
description: op.New が起動を拒否するオプション — それぞれの理由。
pageClass: pg-getting-started-required-options
---

# 必須オプション

`op.New(...)` は構築時に不完全な設定を拒否します。そのため、安全でない OP が誤ってトラフィックを受け取ることはありません。3 つのオプションは無条件で必須です。`WithCookieKeys` はこれに加えて、`authorization_code` grant を有効にしている場合に必須になります。既定の grant 集合はこの grant を含みます。

<svg role="img" aria-labelledby="required-options-title" viewBox="0 0 760 292" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="required-options-title">常に必須なのは issuer、store、keyset の 3 つ。cookie 鍵は authorization_code grant を有効にしている場合に加えて必須になる。</title>
  <text class="ro-head" x="34" y="32">常に必須</text>

  <rect class="ro-box" x="34" y="44" width="214" height="86" rx="8"/>
  <text class="ro-option" x="141" y="72" text-anchor="middle">op.WithIssuer</text>
  <text class="ro-note" x="141" y="94" text-anchor="middle">iss claim・discovery URL</text>
  <text class="ro-note" x="141" y="112" text-anchor="middle">cookie の適用範囲</text>

  <rect class="ro-box" x="272" y="44" width="214" height="86" rx="8"/>
  <text class="ro-option" x="379" y="72" text-anchor="middle">op.WithStore</text>
  <text class="ro-note" x="379" y="94" text-anchor="middle">認可コード・session・クライアント</text>
  <text class="ro-note" x="379" y="112" text-anchor="middle">リフレッシュ連鎖・JTI 集合</text>

  <rect class="ro-box" x="510" y="44" width="214" height="86" rx="8"/>
  <text class="ro-option" x="617" y="72" text-anchor="middle">op.WithKeyset</text>
  <text class="ro-note" x="617" y="94" text-anchor="middle">ID トークン・JWT AT・JARM の</text>
  <text class="ro-note" x="617" y="112" text-anchor="middle">ES256 署名鍵</text>

  <text class="ro-head" x="272" y="170">authorization_code grant を有効にする場合に必須</text>

  <rect class="ro-box ro-conditional" x="272" y="182" width="214" height="86" rx="8"/>
  <text class="ro-option" x="379" y="210" text-anchor="middle">op.WithCookieKeys</text>
  <text class="ro-note" x="379" y="232" text-anchor="middle">session と CSRF cookie を</text>
  <text class="ro-note" x="379" y="250" text-anchor="middle">AES-256-GCM で暗号化</text>
</svg>

| Option | 必須である理由 |
|---|---|
| [`op.WithIssuer`](#withissuer) | JWT の `iss` claim、discovery URL、cookie scope を決める。ここを誤れば下流の検査がすべて誤る。 |
| [`op.WithStore`](#withstore) | 認可コード、セッション、リフレッシュトークンの連鎖、JTI replay set、クライアントの保存先。ストア無しでは状態を置く先が無い。 |
| [`op.WithKeyset`](#withkeyset) | ID トークン / JWT アクセストークン / JARM の署名鍵。`ES256` 署名を生成できる ECDSA P-256 の `crypto.Signer` 無しには発行を拒否する。 |
| [`op.WithCookieKeys`](#withcookiekeys) | cookie の内容を AES-256-GCM で暗号化するための 32 バイトのランダム素材。必須になるのは有効な grant に `authorization_code` が含まれる場合のみ（既定の grant 集合は `authorization_code` と `refresh_token`）。この grant を無効にした client_credentials 専用の OP は cookie key 無しでも起動できる。session と CSRF cookie は署名のみではなく暗号化される。 |

## `WithIssuer`

```go
op.WithIssuer("https://op.example.com")
```

::: warning OIDC Discovery 1.0 §3 / FAPI 2.0 §5.4
issuer は `https://` で始まり、末尾スラッシュ無し、query / fragment 無し、でなければなりません。scheme と host は全て小文字、既定ポート（https は `:443`、http は `:80`）の混入は禁止、path は正規形（`..`、`.`、重複スラッシュは禁止）です。loopback の IP リテラル（`127.0.0.0/8`、`[::1]`）は localhost 開発のため `https://` 要件から免除されます。テキストの `localhost` は例外には **含まれません**（RFC 8252 §7.3 の DNS hijack 観点）。

`internal/discovery.ValidateIssuer` は、オプション setter の検査に加えて issuer の形を再確認します。typo（末尾スラッシュ、`:443`、host の大文字など）は `op.New` で失敗し、RP が拒否する discovery 文書を黙って出すことはありません。この厳しさが RFC 9207 の byte 完全一致ミックスアップ防御を端から端まで成立させています。正規形の詳細は [Issuer](/ja/concepts/issuer) を参照してください。
:::

## `WithStore`

```go
op.WithStore(inmem.New())
// または
op.WithStore(myCompositeStore)
```

`store.Store` interface は小さなサブストア interface の和集合です（`AuthorizationCodeStore`、`RefreshTokenStore`、`SessionStore`、`ClientStore` …）。通常は同梱アダプタから store を組み立てます。

- [`op/storeadapter/inmem`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/inmem) — 全サブストアをメモリに保持。参考・開発・テスト用。
- [`op/storeadapter/sql`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql) — `database/sql` 上の永続サブストア。
- [`op/storeadapter/dynamodb`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/dynamodb) — DynamoDB 用の同梱フルストア。
- [`op/storeadapter/redis`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/redis) — `composite` 経由で使う揮発ティア（`InteractionStore`、`ConsumedJTIStore`）。
- [`op/storeadapter/composite`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/composite) — Hot/Cold 分離。永続サブストアを片方のバックエンドに、揮発性サブストアをもう一方のバックエンドにルートする。

::: tip 既存ストレージへの接続
store interface は意図的に小さく作られています。Cassandra、Spanner、etcd、独自規約の Redis cluster などにも実装できます。`op/store/contract` の contract test suite が、同梱アダプタと同じ期待を満たしているかを検査します。
:::

## `WithKeyset`

```go
priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
op.WithKeyset(op.Keyset{
  {KeyID: "k1", Signer: priv},
})
```

`Keyset` は `{KeyID, Signer}` レコードのスライスです。`Signer` は `crypto.Signer` を実装し、ECDSA P-256 の公開鍵を返す必要があります。Vault / KMS のハンドルでも、公開鍵が P-256 で、署名を `ES256` として検証できれば使えます。RSA や Ed25519 の OP 署名鍵は `op.New` で拒否されます。

::: warning アルゴリズム許可リスト
OP が発行する JWT の署名は `ES256` のみです。client assertion、JAR request object、DPoP proof など入力側の JOSE 検証では、各プロトコルが許す範囲でライブラリの閉じた許可リスト（`RS256`、`PS256`、`ES256`、`EdDSA`）を使います。**`HS*` と `none` は構造的に存在しません**。列挙型に値が無く、`internal/jose.ParseAlgorithm` はそれらの文字列に `ok=false` を返します。

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

32 バイトは session / CSRF cookie の暗号化に使う AES-256-GCM 鍵になります。`WithCookieKeys` で鍵をローテーションでき、先頭鍵で暗号化、後続鍵で復号を試みるので、稼働中セッションを切らずに鍵を入れ替えられます。`op.New` がこのオプションを要求するのは、有効な grant に `authorization_code` が含まれる場合のみです。この grant は既定で有効なのでほとんどの構成では必須になりますが、たとえば `client_credentials` のみに絞った OP なら cookie key 無しでも起動できます。

::: warning Cookie 方式は不可変
cookie は常に `__Host-` prefix（`Domain` 無し、`Path=/`、`Secure`）。セッション cookie は `SameSite=Lax`、同意 / ログアウト POST には double-submit と Origin / Referer チェック。これらはすべて変更不可 — 譲れないセキュリティの最低ラインです。
:::

## 強く推奨されるオプション（必須ではないが、実運用ではほぼ必須）

- `op.WithStaticClients(...)` または `op.WithDynamicRegistration(...)` — どちらか無いとクライアントが認証できない。
- `op.WithAuthenticators(...)` — OP がユーザを検証する方法を定義。既定は「authenticator 無し」、つまりログインは常に失敗。
- `op.WithLoginFlow(...)` — authenticator + rule を step-up ポリシー（例: password → TOTP、password → N 失敗後 captcha）に組み合わせる。

本番に近い構成例は [使い方](/ja/use-cases/) を参照してください。
