---
title: 必須オプション
description: op.New が起動を拒否するオプション — それぞれの理由。
pageClass: pg-getting-started-required-options
---

# 必須オプション

`op.New(...)` は構築時に不完全な設定を拒否します。そのため、安全でない OP が誤ってトラフィックを受け取ることはありません。3 つのオプションは無条件で必須です。`WithCookieKeys` はこれに加えて、`authorization_code` grant を有効にしている場合に必須になります。既定の grant 集合はこの grant を含みます。

<figure class="fig">
  <div class="fig-head">常に必須の 3 つと、認可コードグラントで加わる 1 つ</div>
  <svg class="fig-svg" role="img" aria-labelledby="req-opts-title" viewBox="0 0 960 300" xmlns="http://www.w3.org/2000/svg">
    <title id="req-opts-title">常に必須なのは issuer・store・keyset の 3 つです。authorization_code グラントを有効にすると cookie 鍵が加えて必須になります。ブラウザに状態を置くグラントがこれだけだからです。</title>
    <text class="fg-lbl" x="40" y="26">常に必須</text>
    <rect class="fg-box" x="36" y="38" width="284" height="132" rx="8"/>
    <text class="fg-m" x="56" y="66">op.WithIssuer</text>
    <line class="fg-rule" x1="56" y1="80" x2="300" y2="80"/>
    <text class="fg-xs" x="56" y="102">全トークンに載る iss claim</text>
    <text class="fg-xs" x="56" y="122">discovery の URL</text>
    <text class="fg-xs" x="56" y="142">cookie を設定する範囲</text>
    <rect class="fg-box" x="340" y="38" width="284" height="132" rx="8"/>
    <text class="fg-m" x="360" y="66">op.WithStore</text>
    <line class="fg-rule" x1="360" y1="80" x2="604" y2="80"/>
    <text class="fg-xs" x="360" y="102">認可コード · session</text>
    <text class="fg-xs" x="360" y="122">クライアント · リフレッシュ連鎖</text>
    <text class="fg-xs" x="360" y="142">消費済み JTI の集合</text>
    <rect class="fg-box" x="644" y="38" width="280" height="132" rx="8"/>
    <text class="fg-m" x="664" y="66">op.WithKeyset</text>
    <line class="fg-rule" x1="664" y1="80" x2="904" y2="80"/>
    <text class="fg-xs" x="664" y="102">ID トークン · JWT アクセストークン</text>
    <text class="fg-xs" x="664" y="122">JARM レスポンスに使う</text>
    <text class="fg-xs" x="664" y="142">ES256 署名鍵</text>
    <text class="fg-lbl fg-accent" x="40" y="206">authorization_code グラントを有効にすると、これも必須になる</text>
    <rect class="fg-box fg-box--accent" x="36" y="218" width="888" height="70" rx="8"/>
    <text class="fg-m fg-accent" x="56" y="246">op.WithCookieKeys</text>
    <line class="fg-rule" x1="56" y1="258" x2="904" y2="258"/>
    <text class="fg-xs" x="56" y="278">session と CSRF cookie を AES-256-GCM で暗号化する — ブラウザに状態を置くグラントはこれだけです</text>
  </svg>
  <figcaption class="fig-note">4 つ目は任意ではなく条件付きの必須です。認可コードグラントを有効にしたまま省くと <code>op.New</code> が起動時に拒否します。暗号化されていない cookie を発行して本番で気付く、という事態を防ぐためです。</figcaption>
</figure>

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
