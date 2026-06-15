---
title: Custom Grant — 組み込み
description: 独自 grant_type URN を定義して OP にルーティングさせる — ハンドラ契約、BoundAccessToken、ParamPolicy。
---

# ユースケース — Custom Grant

標準カタログにない `grant_type` が必要なシナリオがあります。ベンダ固有の service-token-exchange URN、内部の「外部 assertion から token を発行」パス、レガシ AS から移行中の暫定 shim など。`op.WithCustomGrant(...)` はディスパッチャを fork せずに、組み込み側が定義した URN を `/token` 経由でルーティングするための差し込み口です。

::: details `grant_type` URN とは
`grant_type` は `/token` のフォームパラメータで、どの発行パスを実行するか(`authorization_code`、`client_credentials`、`refresh_token` など)を選びます。well-known な値は短い文字列ですが、独自定義のものは `urn:<vendor>:<your-name>` 形式の URN を使い、別ベンダと名前が衝突しないようにします。`urn:ietf:params:oauth:grant-type:device_code` は IETF が認めた例、`urn:example:libraz:service-token-exchange` は組み込み側が自前で発行する例です。
:::

::: details 発行パイプラインとは
標準 grant がディスパッチャに識別された後で共通して通る処理パスのことです。クライアントの許可リストとの scope の積集合、登録 resource との audience の積集合、グローバル上限による TTL の頭打ち、送信者制約付きトークンへの `cnf` の押印、リフレッシュトークンの親子関係の追跡などが含まれます。custom grant は scope / audience / TTL / `cnf` の部分を共有します。`IssueRefreshToken` を立てることで、OP にリフレッシュトークン発行も依頼できます。ただしハンドラがリフレッシュトークンの値を直接渡すことはありません。
:::

::: warning 標準 grant で済むなら標準 grant を
custom grant は標準カタログ（`authorization_code`、`client_credentials`、`refresh_token`、`urn:ietf:params:oauth:grant-type:device_code`、`urn:ietf:params:oauth:grant-type:token-exchange`、CIBA）が本当に合わないケース用です。標準 grant が共有する発行パイプラインを通らない部分があるため、scope / audience / バインディングを正しく扱うのはハンドラの責任です。標準 grant の方が悪い設計を強制してくる場合に限り選んでください。
:::

## ハンドラを登録する

```go
import "github.com/libraz/go-oidc-provider/op"

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithCustomGrant(&serviceTokenHandler{}),
  // op.WithCustomGrant は複数ハンドラを登録するため繰り返し呼べる
)
```

構築時エラー:

| エラー | 状況 |
|---|---|
| `op.ErrCustomGrantNil` | ハンドラが `nil` |
| `op.ErrCustomGrantNameEmpty` | `Name()` が `""` |
| `op.ErrCustomGrantBuiltinCollision` | `Name()` が built-in URN と衝突 |
| `op.ErrCustomGrantDuplicate` | 同名ハンドラが登録済み |
| `op.ErrCustomGrantSecretLikeExempt` | `ParamPolicy.DupesAllowed` がセキュリティセンシティブパラメータを含む |

## ハンドラインターフェース

```go
type serviceTokenHandler struct{ /* deps */ }

func (h *serviceTokenHandler) Name() string {
    return "urn:example:libraz:service-token-exchange"
}

func (h *serviceTokenHandler) ParamPolicy() op.ParamPolicy {
    return op.ParamPolicy{
        Allowed:      []string{"target_service", "act_as"},
        DupesAllowed: nil,
    }
}

func (h *serviceTokenHandler) Handle(ctx context.Context, req op.CustomGrantRequest) (op.CustomGrantResponse, error) {
    target := req.Form["target_service"][0]
    if !h.allowed(req.Client.ID, target) {
        return op.CustomGrantResponse{}, &op.Error{
            Code:        "invalid_target",
            Description: "client is not allowed to mint tokens for " + target,
        }
    }

    return op.CustomGrantResponse{
        BoundAccessToken: &op.BoundAccessToken{
            Subject:  op.Subject(req.Client.ID),       // service token: sub = client_id
            Audience: []string{target},
            TTL:      5 * time.Minute,
            ExtraClaims: map[string]any{
                "service_chain": h.chainFor(req.Client.ID, target),
            },
        },
        Scope: []string{"service.invoke"},
    }, nil
}
```

## 発行の 2 形態

ハンドラは **OP 署名**（`BoundAccessToken`）と **ハンドラ署名**（`AccessToken`）を選択します — 排他です。

::: details OP 署名 vs ハンドラ署名 — どちらを選ぶか
**OP 署名**(`BoundAccessToken`)は、OP が登録済みの keyset から鍵を選んで JWT に署名し、リクエストの検証済み DPoP / mTLS 証明から `cnf` を押印し、予約 claim フィルタのもとで追加 claim をマージしてくれる形です。**ハンドラ署名**(`AccessToken`)は、外部 KMS / HSM で生成済みのトークン(または独自 introspection backend が解釈する opaque token)を持ち込み、OP にそのまま返させる形で、`cnf` を含むすべての責任をハンドラが負います。明確な理由がない限り OP 署名を選んでください。
:::

### `BoundAccessToken` — OP が署名 + バインド

ハンドラが別経路の署名鍵を持たない場合は `BoundAccessToken` を返します。OP が:

- アクティブな署名鍵で JWT-shape アクセストークンを署名
- `iss / sub / aud / exp / iat / jti / scope / client_id` を埋める
- リクエストが検証済みの証明を提示していれば `cnf.jkt`（DPoP）または `cnf.x5t#S256`（mTLS）を自動で押印。ハンドラがバインディングを自前で通す必要なし
- `ExtraClaims` をマージ(標準セットとの衝突は `server_error` に集約 — ハンドラのバグが監査ログに浮かび上がるように)

これが多くの組み込み側にとって正しい既定です。FAPI 2.0 §3.1.4 のバインディング契約が追加コストなしで強制されます。

### `AccessToken` — ハンドラが署名

ハンドラが外部 KMS / HSM 鍵で署名する場合、または独自 introspection backend を持つ opaque token を発行する場合は、`CustomGrantResponse.AccessToken` に値を直接書き込みます。OP はその値をそのまま返します。

::: warning ハンドラ署名 = バインディングは自分で
`AccessToken` の場合、OP は `cnf` を **押印しません**。`req.DPoP != nil` または `req.MTLSCert != nil` で JWT を発行するなら、`cnf.jkt` / `cnf.x5t#S256` を claim に **自分で** 埋めてください。Opaque-format のハンドラは独自 introspection backend でバインディングを露出する責任があります — OP はハンドラ提供 token のシャドウ行を保持しません。
:::

## ParamPolicy

`ParamPolicy` は `req.Form` 経由でハンドラに渡すパラメータを宣言します:

::: details ParamPolicy とは
`/token` のフォームパーサは、認識しないパラメータを拒否することで、行儀の悪いクライアントが余計な入力をハンドラへ持ち込むのを防いでいます。`ParamPolicy` は custom grant がパーサに「この名前は私のものなので通してほしい」と伝える仕組みで、`Allowed` はハンドラが読むフォームキーの一覧、`DupesAllowed` は重複値を許す部分集合(既定は単一値のみ)です。セキュリティ上敏感な名前(`client_secret`、`code_verifier` 等)はどちらにも入れられません — 誤設定で credential 受け口が広がらないよう、構築時点で OP が拒否します。
:::

```go
op.ParamPolicy{
    // 共有パラメータ（grant_type、client_id、client_secret、scope、...）以外で
    // 許可する名前。未知の名前は invalid_request。
    Allowed: []string{"target_service", "act_as"},

    // Allowed のうち重複値を許す subset。デフォルトは重複なし。
    // OP は名前ごとに CustomGrantDupCap（32）の hard cap を強制。
    DupesAllowed: []string{"target_service"},
}
```

セキュリティ上敏感な名前(`grant_type` / `client_id` / `client_secret` / `code` / `code_verifier` / `refresh_token` / `subject_token` / `actor_token` / `password` / `client_assertion` / `client_assertion_type`)を `DupesAllowed` に入れると、構築時に `op.ErrCustomGrantSecretLikeExempt` が出ます。誤設定で credential の取り扱いを劣化させないためです。

## ハンドラの前後で OP が強制すること

OP が `Handle` の前後に適用する最低ライン:

- **scope の積集合** — `CustomGrantResponse.Scope` ∩ client の許可 scope。集合外は `invalid_scope`
- **audience の積集合** — `Audience` の各エントリが client に登録されている resource に一致している必要あり。未知のエントリは `invalid_target`
- **TTL 上限** — `AccessTokenTTL`(または `BoundAccessToken.TTL`)はグローバルなアクセストークン上限で切り詰められる(超過時は監査警告、負値は拒否)
- **`openid` scope の自動 id_token** — `Scope` に `openid` を含み `IDToken` が空のとき、OP が `Subject` + `AuthTime` + `ExtraClaims` から id_token を署名（reserved claim filter 適用）

## リフレッシュトークン

custom grant は、OP 管理のリフレッシュトークン発行にオプトインできます:

```go
return op.CustomGrantResponse{
    BoundAccessToken: &op.BoundAccessToken{ /* ... */ },
    Scope:             []string{"service.invoke", "offline_access"},
    IssueRefreshToken: true,
}, nil
```

リフレッシュトークンの資格情報は OP が所有します。OP が値を生成し、`RefreshTokenStore` に永続化し、アクセストークンと同じ grant 識別子を共有させ、同じ DPoP / mTLS 証明にバインドします。そのため、発行されたリフレッシュトークンは通常のローテーション、再利用時の連鎖失効(RFC 9700 §2.2.2)、grant 失効の仕組みに乗ります。発行されるのは、クライアントが `refresh_token` grant に登録されている場合だけです。未登録の場合でもアクセストークン応答は成功し、リフレッシュトークンだけが省略され、`custom_grant.refresh_dropped` が発火します。

::: details リフレッシュトークンの親子関係とは
OP はリフレッシュトークンごとに親を記録するため、ローテーションはチェーン（`A → B → C`）を作ります。そのうちの 1 本が再利用された場合（RFC 9700 §2.2.2）、OP は子孫すべてを一括で失効させられます。`IssueRefreshToken` は custom grant をこの OP 管理のチェーンに入れるためのフラグです。RFC 6749 §6 ではリフレッシュトークンは authorization server が発行する資格情報なので、ハンドラが値を直接渡す形にはしていません。
:::

## OP が拒否すること

- **ハンドラが指定するリフレッシュトークン値**。OP に発行させたい場合は `IssueRefreshToken: true` を使います
- **`AccessToken` と `BoundAccessToken` の同時設定**。排他。両方設定すると `server_error`
- **`ExtraClaims` の reserved claim 衝突**。`iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid`(`BoundAccessToken` では `act` / `cnf` も)は、`TokenExchangePolicy.ExtraClaims` では黙って破棄されます(ポリシー側に上書きさせないため)。一方 `CustomGrantResponse.ExtraClaims` では `server_error`(ハンドラの不具合を監査ログに浮かび上がらせるため)になります

## 動かしてみる

[`examples/30-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-custom-grant):

```sh
(cd examples/30-custom-grant && go run -tags example .)
```

組み込み側が `urn:example:libraz:service-token-exchange` を定義し、OP が `op.WithCustomGrant` 経由でルーティングします。ハンドラが `BoundAccessToken` を返すと、ディスパッチャはリクエストの DPoP / mTLS confirmation に紐付いた JWT アクセストークンを発行します。ファイル: `op.go`(OP の組み立て + ハンドラ)、`client.go`(client 側)、`probe.go`(self-verify)。

## 続きはこちら

- [Token Exchange の組み込み](/ja/use-cases/token-exchange) — ライブラリ内蔵の custom-grant の親類。dispatch の形は同じですが、OP が把握するポリシーのセマンティクス(act チェーン、cnf の再バインドなど)が追加で乗ります
- [Sender constraint](/ja/concepts/sender-constraint) — `cnf` が何で、なぜ `BoundAccessToken` が代わりに押印してくれるのが重要なのか
