---
title: 必須オプション
description: op.New が起動を拒否するオプション — それぞれの理由。
pageClass: pg-getting-started-required-options
---

# 必須オプション

`op.New(...)` は構築時に不完全な設定を拒否します。そのため、安全でない OP が誤ってトラフィックを受け取ることはありません。3 つのオプションは常に必須です。`authorization_code` grant を有効にしている場合は、さらに `WithCookieKeys` と `WithLoginFlow`（または低レイヤの `WithAuthenticators`）の 2 つが必須になります。既定の grant 集合はこの grant を含みます。

<figure class="fig">
  <div class="fig-head">常に必須の 3 つと、認可コードグラントで加わる 2 つ</div>
  <svg class="fig-svg" role="img" aria-labelledby="req-opts-title" viewBox="0 0 960 328" xmlns="http://www.w3.org/2000/svg">
    <title id="req-opts-title">常に必須なのは issuer・store・keyset の 3 つです。authorization_code グラントを有効にすると、cookie 鍵とログインフローが加えて必須になります。ユーザとブラウザが関わるグラントはこれだけだからです。</title>
    <text class="fg-lbl" x="32" y="40">常に必須</text>
    <rect class="fg-box" x="32" y="56" width="272" height="96" rx="8"/>
    <text class="fg-m" x="48" y="84">op.WithIssuer</text>
    <text class="fg-s" x="48" y="108">全トークンに載る iss claim</text>
    <text class="fg-s" x="48" y="132">discovery と endpoint の URL</text>
    <rect class="fg-box" x="344" y="56" width="272" height="96" rx="8"/>
    <text class="fg-m" x="360" y="84">op.WithStore</text>
    <text class="fg-s" x="360" y="108">認可コード · session</text>
    <text class="fg-s" x="360" y="132">クライアント · 連鎖 · JTI</text>
    <rect class="fg-box" x="656" y="56" width="272" height="96" rx="8"/>
    <text class="fg-m" x="672" y="84">op.WithKeyset</text>
    <text class="fg-s" x="672" y="108">ES256 署名鍵 · ID トークン</text>
    <text class="fg-s" x="672" y="132">JWT アクセストークン · JARM</text>
    <text class="fg-lbl fg-accent" x="32" y="192">authorization_code グラントを有効にすると、この 2 つも必須になる</text>
    <rect class="fg-box" x="32" y="208" width="428" height="96" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="236">op.WithCookieKeys</text>
    <text class="fg-s" x="48" y="260">session と CSRF cookie を</text>
    <text class="fg-s" x="48" y="284">AES-256-GCM で暗号化する</text>
    <rect class="fg-box" x="500" y="208" width="428" height="96" rx="8"/>
    <text class="fg-m fg-accent" x="516" y="236">op.WithLoginFlow</text>
    <text class="fg-s" x="516" y="260">ユーザのサインイン方法</text>
    <text class="fg-s" x="516" y="284">Primary step と、要素を足す rule</text>
  </svg>
  <figcaption class="fig-note">後ろの 2 つは任意ではなく条件付きの必須です。認可コードグラントを有効にしたままどちらかを省くと、<code>op.New</code> が起動時に拒否します。暗号化されていない cookie を発行したり、本番で全サインインがサーバエラーになったりする事態を防ぐためです。</figcaption>
</figure>

| Option | 必須である理由 |
|---|---|
| [`op.WithIssuer`](#withissuer) | JWT の `iss` claim、discovery URL とエンドポイント URL、ログイン・ログアウト画面がリクエストを受け付ける origin を決めます。ここを誤ると下流の検査がすべて誤ります。 |
| [`op.WithStore`](#withstore) | 認可コード、セッション、リフレッシュトークンの連鎖、JTI の replay 集合、クライアントの保存先です。ライブラリはストレージに依存しないので、ストアがなければ状態を置く先がありません。 |
| [`op.WithKeyset`](#withkeyset) | ID トークン、JWT アクセストークン、JARM の署名鍵です。`ES256` 署名を生成できる ECDSA P-256 の `crypto.Signer` がなければ、ライブラリはトークンの発行を拒否します。 |
| [`op.WithCookieKeys`](#withcookiekeys) | cookie の内容を AES-256-GCM で暗号化するための 32 バイトのランダム素材です。有効な grant に `authorization_code` が含まれる場合に必須です（既定の grant 集合は `authorization_code` と `refresh_token`）。`client_credentials` だけを提供する OP は、これなしでも起動できます。セッションと CSRF の cookie は署名だけでなく暗号化されます。 |
| [`op.WithLoginFlow`](#withloginflow) | ユーザが本人であることを示す方法を決めます。有効な grant に `authorization_code` が含まれる場合に必須です。なければサインインできるユーザがいないため、最初の本番リクエストで失敗する代わりに `op.New` が起動を拒否します。 |

## `WithIssuer`

```go
op.WithIssuer("https://op.example.com")
```

issuer は OP の識別子です。すべてのトークンに `iss` として載り、discovery URL の前半にもなります。RP はこれをバイト単位で比較するため、ライブラリは受け付ける表記を 1 つに絞っています。

::: warning issuer の検証: 仕様の要件とライブラリのポリシー
OIDC Discovery 1.0 §3 は、issuer を query・fragment のない HTTPS URL とし、メタデータの `issuer` と完全一致させるよう求めます。本ライブラリはさらに、末尾スラッシュ、scheme・host の大文字、既定ポート（HTTPS の `:443`、HTTP の `:80`）、正規形でないパス（`..`、`.`、重複スラッシュ）を拒否します。ローカル開発では loopback IP リテラル（`127.0.0.0/8`、`[::1]`）に限って HTTP を許可します。テキストの `localhost` を使うには、明示的な opt-in の `op.WithAllowLocalhostLoopback()` が必要です。HTTP の例外は OIDC Discovery の規定ではなく、ライブラリのポリシーです。

検査は `op.New` の中（`internal/discovery.ValidateIssuer`）で行います。typo は起動時に失敗し、RP が拒否する discovery 文書が出回ることはありません。この厳しさによって、RFC 9207 の比較に使う issuer の表記がデプロイをまたいで 1 つに揃います。正規形の詳細は [Issuer](/ja/concepts/issuer) を参照してください。
:::

## `WithStore`

```go
op.WithStore(inmem.New())
// または
op.WithStore(myCompositeStore)
```

`store.Store` interface は、小さなサブストア interface の和集合です（`AuthorizationCodeStore`、`RefreshTokenStore`、`SessionStore`、`ClientStore` …）。ほとんどの構成は、同梱アダプタのどれかを出発点にします。

- [`op/storeadapter/inmem`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/inmem): 全サブストアをメモリに保持します。参考実装、開発、テスト用です。
- [`op/storeadapter/sql`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql): `database/sql` 上の永続サブストアです（SQLite、MySQL、Postgres）。
- [`op/storeadapter/dynamodb`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/dynamodb): DynamoDB 用のフルストアです（experimental）。
- [`op/storeadapter/redis`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/redis): `composite` 経由で使う揮発層です（`SessionStore`、`InteractionStore`、`ConsumedJTIStore`）。
- [`op/storeadapter/composite`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/composite): Hot / Cold 分離です。永続サブストアを一方のバックエンドに、揮発サブストアをもう一方に振り分けます。

::: tip 既存ストレージへの接続
store interface は意図的に小さくしてあります。Cassandra、Spanner、etcd、独自規約の Redis cluster など、すでに運用しているものの上に実装できます。`op/store/contract` の contract test suite で、同梱アダプタと同じ期待を満たすかを検査できます。

一部の挙動は、省略可能な interface と追加のレコードフィールドで有効になります。`store.OpaqueAccessTokenChainRevoker` と `store.IssuanceRevocationChecker` を実装し、`ChainID` と認可ごとのフィールドを保存するストアでは、失効の範囲が 1 つのリフレッシュトークン連鎖に限られます。これらがないストアもそのまま動きますが、失効は grant 単位になり、同じクライアントにおけるユーザの他のセッションにも及ぶことがあります。
:::

## `WithKeyset`

```go
priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
op.WithKeyset(op.Keyset{
  {KeyID: "k1", Signer: priv},
})
```

`Keyset` は `{KeyID, Signer}` レコードのスライスです。`Signer` は `crypto.Signer` を実装し、ECDSA P-256 の公開鍵を返す必要があります。Vault や KMS のハンドルでも、公開鍵が P-256 で署名が `ES256` として検証できれば使えます。RSA や Ed25519 の署名鍵は `op.New` が拒否します。先頭のエントリが新しいトークンに署名します。後続のエントリは JWKS に残り、RP が古いトークンを検証できるようにします。鍵のローテーションはこの仕組みで行います。

::: warning アルゴリズム許可リスト
OP が発行する JWT の署名は `ES256` のみです。client assertion、JAR request object、DPoP proof を検証する側では、各プロトコルが許す範囲で、閉じた許可リスト（`RS256`、`PS256`、`ES256`、`EdDSA`）を使います。**`HS*` と `none` は構造的に存在しません。** 列挙型に値がなく、`internal/jose.ParseAlgorithm` はそれらの文字列に `ok=false` を返します。これにより RFC 7519 §6 と RFC 8725 §2.1 の alg confusion 攻撃を、実行時の `if` 文ではなく型で閉じています。
:::

## `WithCookieKeys`

```go
key := make([]byte, 32) // ちょうど 32 バイト
if _, err := rand.Read(key); err != nil { /* … */ }
op.WithCookieKeys(key)

// 鍵のローテーション:
op.WithCookieKeys(currentKey, previousKey)
```

32 バイトの鍵が、セッションと CSRF の cookie を暗号化する AES-256-GCM の鍵になります。先頭の鍵で暗号化し、後続の鍵は復号の試行にだけ使うので、稼働中のユーザをサインアウトさせずに鍵を入れ替えられます。`op.New` がこのオプションを要求するのは、有効な grant に `authorization_code` が含まれる場合だけです。この grant は既定で有効なため、ほとんどの構成では必須ですが、`client_credentials` だけに絞った OP は cookie 鍵なしで起動できます。

::: warning cookie の方式は固定
cookie は常に `__Host-` prefix（`Domain` なし、`Path=/`、`Secure`）を付けます。セッション cookie は `SameSite=Lax`、CSRF cookie は `SameSite=Strict` で、同意とログアウトの POST には double-submit トークンと Origin / Referer の検査が加わります。いずれも変更できません。ライブラリが動作する最低ラインです。
:::

## `WithLoginFlow`

```go
op.WithLoginFlow(op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
})
```

`LoginFlow` は、ユーザのサインイン方法を宣言します。ユーザを特定する `Primary` step が 1 つと、条件を満たしたときに TOTP などの step を足す `Rules`（任意）で構成します。`PrimaryPassword` は `store.UserPasswordStore` に対してパスワードを検証します。最も手軽なのは、in-memory アダプタの `UserPasswords()` です。本番では、自前のユーザテーブルに接続したストアを渡します。

動作しない flow は `op.New` が拒否します。

- 先行 step が特定したユーザを前提とする step（`PrimaryPasskey`、`StepTOTP`、`StepEmailOTP`、`StepRecoveryCode`）を `Primary` にした場合。`Primary` には `PrimaryPassword` か `ExternalStep` を置き、それ以外は `Rules` に置きます。
- `WithLoginFlow` と `WithAuthenticators` の併用。同じ連鎖を 2 通りの形で設定することになるため、どちらか一方を選びます。

`op.LoginFlow` と `WithLoginFlow` は `Experimental:` です。詳しくは [インストール](/ja/getting-started/install#安定性) を参照してください。[多要素認証](/ja/use-cases/mfa-step-up)はこのオプションの上に組み立てます。

## 実運用では必要になるもの

起動できることと、使えることは別です。次のオプションは起動には不要ですが、実際の OP のほとんどが設定します。

- `op.WithStaticClients(...)` または `op.WithDynamicRegistration(...)`: どちらかがないと、クライアントは認証できません。静的に登録する confidential client が `client_secret_basic` または `client_secret_post` を使う場合は、シークレットが必要です。ないと `op.New` が拒否します。
- `op.WithScope(...)`: `api:read` のような独自の scope を登録します。標準の OIDC scope は登録不要です。
- `op.WithAuditLogger(...)` と `op.WithLogger(...)`: 監査イベントとログを自前の基盤に流します。

本番に近い構成例は [ユースケース](/ja/use-cases/) を参照してください。
