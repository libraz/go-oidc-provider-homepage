---
title: カスタム grant — 組み込み
description: built-in grant と衝突しない独自 grant_type URN を定義 — ハンドラの request context、BoundAccessToken、ParamPolicy、OP 管理の発行を扱う。
pageClass: pg-use-cases-custom-grant
---

# ユースケース — カスタム grant

標準カタログにない `grant_type` が必要になる場面があります。ベンダ固有の service-token-exchange URN、外部の assertion を見てトークンを発行する社内向けの経路、レガシーな認可サーバから移行する間の暫定的な橋渡しなどです。`op.WithCustomGrant(...)` は、組み込み側が定義した `grant_type` の URN にハンドラを登録します。OP は一致する `/token` リクエストをそのハンドラに渡します。クライアント認証、DPoP / mTLS の検証、トークンの署名、保存は引き続き OP が行います。

::: details `grant_type` URN とは
`grant_type` は `/token` のフォームパラメータで、どの発行経路（`authorization_code`、`client_credentials`、`refresh_token` など）を実行するかを選びます。組み込みの短い名前はすでに使われているため、独自の grant では `urn:<vendor>:<your-name>` 形式の URN を使い、ベンダ同士の衝突を避けます。`urn:ietf:params:oauth:grant-type:device_code` は IETF が定義した例、`urn:example:libraz:service-token-exchange` は組み込み側が自前で定義する例です。RFC 6749 §4.5 は URN 形式を推奨していますが、OP は形式を強制しません。
:::

::: details 発行パイプラインとは
ディスパッチャが grant を識別した後、どの grant も共通して通る処理です。クライアントの許可リストとの scope の積集合、登録済み resource との audience の積集合、グローバル上限による TTL の頭打ち、送信者制約付きトークンへの `cnf` の付与、リフレッシュトークンのチェーンの追跡が含まれます。custom grant には、scope・audience・TTL の検査が適用され、`BoundAccessToken` を返す場合は `cnf` の付与も適用されます。`IssueRefreshToken` を立てれば、リフレッシュトークンの発行も OP に依頼できます。ただしハンドラがリフレッシュトークンの値そのものを渡すことはありません。
:::

::: warning 標準 grant で済むなら標準 grant を
custom grant は標準カタログ（`authorization_code`、`client_credentials`、`refresh_token`、`urn:ietf:params:oauth:grant-type:device_code`、`urn:ietf:params:oauth:grant-type:token-exchange`、CIBA）が本当に合わないケース用です。subject を誰にするか、このリクエストにトークンを出してよいかはハンドラが決めます。入力の検証方法、どの subject を名乗らせるか、ハンドラ署名のトークンなら送信者制約への結び付けも、ハンドラ側の責任です。標準 grant を使うと設計が悪くなる場合に限って選んでください。
:::

## ハンドラを登録する

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  // custom grant は組み込み grant の集合とは別に登録されるので、
  // WithGrants が選ぶのはこの OP が提供する組み込み grant だけです。
  // ハンドラがリフレッシュトークンを要求できるように refresh_token を
  // 挙げています。これを指定すると既定の authorization_code は外れます。
  op.WithGrants(grant.RefreshToken),

  op.WithCustomGrant(&serviceTokenHandler{}),
  // op.WithCustomGrant は繰り返し呼べば複数のハンドラを登録できる

  op.WithStaticClients(op.ConfidentialClient{
    ID:         "billing-service",
    Secret:     billingSecret,
    AuthMethod: op.AuthClientSecretBasic,
    // クライアントが custom URN を列挙していないと、
    // /token は unauthorized_client を返します。
    GrantTypes: []string{"urn:example:libraz:service-token-exchange"},
    Scopes:     []string{"service.invoke"},
    // ハンドラが返す Audience は、すべてここに載っている必要があります。
    Resources:  []string{"https://api.b.example.com"},
  }),
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

`Name()` は、OP が実装するすべての grant（`authorization_code`、`refresh_token`、`client_credentials`、Device Code / CIBA の URN、RFC 8693 token-exchange の URN）と byte 単位で比較されます。その組み込み grant が有効かどうかに関係なく比較されるので、カスタムハンドラが組み込み grant を乗っ取ることはできません。配備側が所有する URN を選んでください。

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
    targets := req.Form["target_service"]
    if len(targets) != 1 {
        return op.CustomGrantResponse{}, &op.Error{
            Code:        "invalid_request",
            Description: "target_service is required",
        }
    }
    target := targets[0]
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

`req.Subject` は常に `nil`、`req.AuthTime` は常にゼロ値です。トークンリクエストが認証するのはエンドユーザではなくクライアントで、OP は custom grant のパラメータを解釈して subject や認証の手順を作り出しません。subject が必要ならハンドラが解決し、`CustomGrantResponse.Subject`（または `BoundAccessToken.Subject`）で返してください。認証時刻がわかる場合は `CustomGrantResponse.AuthTime` に返します。`req.Client` はコピーなので、書き換えても OP がその後に行う検査には影響しません。

### ハンドラがエラーを返したとき

| ハンドラの戻り値 | 通信路上の応答 |
|---|---|
| `*op.Error`（またはそれを包んだエラー） | 選んだエラーコードのまま返されます。 |
| それ以外の Go エラー | `400 invalid_grant`。メッセージは応答に含まれません。 |
| panic | `500 server_error`。スタックトレースは監査ストリームにだけ出ます。 |

## 発行の 2 形態

ハンドラは **OP 署名**（`BoundAccessToken`）と **ハンドラ署名**（`AccessToken`）のどちらかを返します。

<figure class="fig">
  <div class="fig-head">カスタム grant が返せる 2 つの形</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-customgrant-title" viewBox="0 0 960 520" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-customgrant-title">カスタム grant のハンドラは BoundAccessToken を返すこともでき、その場合は署名鍵・標準 claim・cnf・ID トークン・リフレッシュトークンを OP が管理します。署名済みのアクセストークンを返すこともでき、その場合は署名・cnf・introspection・失効の連携がハンドラ側の責任になります。</title>
    <rect class="fg-box fg-box--accent" x="340" y="24" width="280" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="356" y="52">CustomGrantHandler</text>
    <text class="fg-mxs" x="356" y="76">Handle(ctx, req)</text>
    <!-- branches -->
    <path class="fg-leader" d="M480,96 V120 M248,120 H712"/>
    <path class="fg-edge fg-edge--thin fg-edge--accent" d="M248,120 V144" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--thin" d="M712,120 V144" marker-end="url(#fg-a)"/>
    <!-- card: OP-signed -->
    <rect class="fg-box fg-box--accent" x="32" y="144" width="432" height="96" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="172">BoundAccessToken を返す</text>
    <text class="fg-s fg-accent" x="48" y="196">通常はこちら</text>
    <text class="fg-s" x="48" y="220">OP が署名鍵を選び、JWT を発行する</text>
    <!-- card: handler-signed -->
    <rect class="fg-box" x="496" y="144" width="432" height="96" rx="8"/>
    <text class="fg-m" x="512" y="172">AccessToken を返す</text>
    <text class="fg-s fg-warn" x="512" y="196">明確な理由がある場合のみ</text>
    <text class="fg-s" x="512" y="220">外部 KMS や独自の opaque backend 向け</text>
    <!-- band: OP-signed -->
    <rect class="fg-group" x="32" y="272" width="432" height="224" rx="8"/>
    <text class="fg-lbl" x="56" y="300">担当</text>
    <!-- band: handler-signed -->
    <rect class="fg-group" x="496" y="272" width="432" height="224" rx="8"/>
    <text class="fg-lbl" x="520" y="300">担当</text>
    <text class="fg-s" x="56" y="341">署名鍵と JWT</text>
    <rect class="fg-pill fg-pill--ok" x="344" y="320" width="96" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="392" y="341" text-anchor="middle">OP</text>
    <text class="fg-s" x="520" y="341">署名そのもの</text>
    <rect class="fg-pill fg-pill--warn" x="808" y="320" width="96" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="856" y="341" text-anchor="middle">自前</text>
    <text class="fg-s" x="56" y="381">標準 claim · cnf · TTL 上限</text>
    <rect class="fg-pill fg-pill--ok" x="344" y="360" width="96" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="392" y="381" text-anchor="middle">OP</text>
    <text class="fg-s" x="520" y="381">cnf の付与</text>
    <rect class="fg-pill fg-pill--warn" x="808" y="360" width="96" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="856" y="381" text-anchor="middle">自前</text>
    <text class="fg-s" x="56" y="421">ID トークン · リフレッシュトークン</text>
    <rect class="fg-pill fg-pill--ok" x="344" y="400" width="96" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="392" y="421" text-anchor="middle">OP</text>
    <text class="fg-s" x="520" y="421">introspection の連携</text>
    <rect class="fg-pill fg-pill--warn" x="808" y="400" width="96" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="856" y="421" text-anchor="middle">自前</text>
    <text class="fg-s" x="56" y="461">失効の連携</text>
    <rect class="fg-pill fg-pill--ok" x="344" y="440" width="96" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="392" y="461" text-anchor="middle">OP</text>
    <text class="fg-s" x="520" y="461">失効をどこまで届かせるか</text>
    <rect class="fg-pill fg-pill--warn" x="808" y="440" width="96" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="856" y="461" text-anchor="middle">自前</text>
  </svg>
  <figcaption class="fig-note">右の形は、署名鍵が本当に OP の手元に無い場合のためにあります。それ以外の理由で選ぶと、4 つの責務がライブラリからハンドラ側へ移り、しかもそのどれもが気付きにくい形で誤りやすい部分です。</figcaption>
</figure>

ハンドラが両方を返した場合も、どちらも返さなかった場合も、OP は `500 server_error` を返します。発行の責任は必ずどちらか一方が持つからです。

::: details OP 署名 vs ハンドラ署名 — どちらを選ぶか
**OP 署名**（`BoundAccessToken`）は、OP がアクティブな署名鍵で JWT に署名する形です。リクエストの検証済み DPoP / mTLS の証明から `cnf` を付与し、ハンドラが指定した追加 claim をマージします。組み込み grant が opaque アクセストークンを発行する構成でも、結果は常に RFC 9068 の JWT です。opaque 形式の記録には、ハンドラが指定した claim と audience の集合を載せられないためです。**ハンドラ署名**（`AccessToken`）は、外部 KMS / HSM で生成済みのトークンや、独自の introspection backend が解釈する opaque トークンを持ち込み、OP にそのまま返させる形です。送信者制約が必要なトークンなら `cnf` を含め、以降の責任はすべてハンドラが負います。明確な理由がない限り OP 署名を選んでください。
:::

### `BoundAccessToken` — OP が署名 + バインド

ハンドラが別経路の署名鍵を持たない場合は `BoundAccessToken` を返します。OP が:

- アクティブな署名鍵で JWT-shape アクセストークンを署名
- `iss / sub / aud / exp / iat / jti / scope / client_id` を埋める
- リクエストが検証済みの証明を提示していれば `cnf.jkt`（DPoP）または `cnf.x5t#S256`（mTLS）を自動で押印。ハンドラがバインディングを自前で通す必要なし
- `ExtraClaims` をマージ。OP 自身が管理する名前（`iss`、`sub`、`aud`、`client_id`、`iat`、`exp`、`jti`、`scope`、`auth_time`、`acr`、`amr`、`cnf`、`gid`、`authorization_details`、`userinfo_claims`）と衝突すると `500 server_error` になります。壊れたトークンを出さず、不具合を監査ストリームで見つけられるようにするためです
- `BoundAccessToken.Subject` が空なら `CustomGrantResponse.Subject` を使い、`BoundAccessToken.Audience` が空ならレスポンスの `Audience`、それも空なら `client_id` を使う。subject がどこにもなければ `server_error`

多くの組み込み側では、この方式が適しています。検証済みの DPoP または mTLS の証明がリクエストにある場合、FAPI 2.0 Security Profile §5.3.2.1(4)–(5) がアクセストークンに求める送信者制約を、この経路で設定します。

### `AccessToken` — ハンドラが署名

ハンドラが外部 KMS / HSM 鍵で署名する場合、または独自 introspection backend を持つ opaque token を発行する場合は、`CustomGrantResponse.AccessToken` に値を直接書き込みます。OP はその値をそのまま返します。

::: warning ハンドラ署名 = バインディングは自分で
`AccessToken` の場合、OP は `cnf` を **押印しません**。`req.DPoP != nil` または `req.MTLSCert != nil` で JWT を発行するなら、`cnf.jkt` / `cnf.x5t#S256` を claim に **自分で** 埋めてください。Opaque-format のハンドラは独自 introspection backend でバインディングを露出する責任があります — OP はハンドラ提供 token のシャドウ行を保持しません。
:::

## ParamPolicy

`ParamPolicy` は `req.Form` 経由でハンドラに渡すパラメータを宣言します:

::: details ParamPolicy とは
`/token` のフォームパーサは、認識しないパラメータを拒否します。行儀の悪いクライアントが余計な入力をハンドラへ持ち込むのを防ぐためです。`ParamPolicy` は、custom grant がパーサに「この名前は私のものなので通してほしい」と伝える仕組みです。`Allowed` はハンドラが読むフォームキーの一覧、`DupesAllowed` はその中で重複値を許すものです（既定は単一値のみ）。共通のパラメータ（`grant_type`、`client_id`、`client_secret`、`scope` など）は常に受け付けます。認証情報にあたる名前は重複を許可できません。誤設定で認証情報の受け口が広がらないよう、構築時に OP が拒否します。
:::

```go
op.ParamPolicy{
    // 共有パラメータ（grant_type、client_id、client_secret、scope、...）以外で
    // 許可する名前。未知の名前は invalid_request。
    Allowed: []string{"target_service", "act_as"},

    // Allowed のうち重複値を許す subset。既定は重複なし。
    // OP は名前ごとに CustomGrantDupCap（32）の hard cap を強制。
    DupesAllowed: []string{"target_service"},
}
```

セキュリティ上敏感な名前（`grant_type` / `client_id` / `client_secret` / `code` / `code_verifier` / `refresh_token` / `subject_token` / `actor_token` / `password` / `client_assertion` / `client_assertion_type`）を `DupesAllowed` に入れると、構築時に `op.ErrCustomGrantSecretLikeExempt` が出ます。誤設定で credential の取り扱いを劣化させないためです。

## ハンドラの前後で OP が強制すること

OP は、ハンドラの戻り値にかかわらず、`Handle` の前後で次の検査を行います。

| 検査 | 挙動 |
|---|---|
| クライアントの登録 | クライアントの `GrantTypes` に URN が含まれていなければ `400 unauthorized_client`。 |
| パラメータ | `ParamPolicy.Allowed` にない名前や、単一値の名前の重複は `400 invalid_request`。重複を許可した名前でも `CustomGrantDupCap`（32）個まで。 |
| scope | `CustomGrantResponse.Scope` がクライアントの登録済み scope に収まっていなければ `400 invalid_scope`。 |
| audience | `Audience` の各エントリはクライアントに登録済みの resource でなければならず、違えば `400 invalid_target`。 |
| TTL | グローバルなアクセストークンの上限を超える値は、黙ってその上限まで切り詰めます。0 は OP の既定の有効期間を使う意味です。負値は `500 server_error`。 |
| ID トークン | `Scope` に `openid` を含み `IDToken` が空なら、OP が `Subject`、`AuthTime`、`ExtraClaims` から id_token に署名します。`IDToken` が空でなければそのまま返します。 |
| subject の生存確認 | 保存済みの grant から派生するレスポンスは、その subject がユーザストアから消えていれば拒否されます。 |

監査ストリームには、ハンドラに届いた試行ごとに `custom_grant.requested`、拒否ごとに（`reason` 付きで）`custom_grant.failed`、要求されたリフレッシュトークンを落としたときに `custom_grant.refresh_dropped` が記録されます。

## リフレッシュトークン

custom grant は、OP 管理のリフレッシュトークン発行を明示的に有効化できます:

```go
return op.CustomGrantResponse{
    BoundAccessToken: &op.BoundAccessToken{ /* ... */ },
    Scope:             []string{"service.invoke", "offline_access"},
    IssueRefreshToken: true,
}, nil
```

リフレッシュトークンの資格情報は OP が所有します。OP は:

- 値を生成する
- `RefreshTokenStore` に永続化する
- アクセストークンと同じ grant 識別子を共有させる
- 同じ DPoP / mTLS 証明にバインドする

そのため、発行されたリフレッシュトークンは通常のローテーション、再利用時の連鎖失効（RFC 9700 §2.2.2）、grant 失効の仕組みに乗ります。このチェーンのローテーションで発行されるアクセストークンは、`BoundAccessToken` と同じく常に JWT です。

`IssueRefreshToken` が true のとき、次の 5 つの条件のどれかを満たさないと、OP はリフレッシュトークンだけを落とします（アクセストークンの応答は成功します）。

- provider が `refresh_token` grant を提供している（`WithGrants` に `grant.RefreshToken` が必要）
- client が `refresh_token` grant に登録されている
- response の subject が空でない
- response の scope が空でない
- response の audience が 1 件以下である

落とすたびに、`reason`（`provider_grant_disabled`、`client_not_registered`、`empty_subject`、`empty_scope`、`multiple_resource_audience` のいずれか）付きで `custom_grant.refresh_dropped` を記録します。リフレッシュトークンを落としても、アクセストークンや ID トークンは失敗しません。

::: details リフレッシュトークンの親子関係とは
OP はリフレッシュトークンごとに親を記録するので、ローテーションするとチェーン（`A → B → C`）ができます。使用済みのトークンが再利用された場合（RFC 9700 §2.2.2）、OP はチェーン全体を一度に失効させられます。`IssueRefreshToken` は、custom grant をこの OP 管理のチェーンに乗せるためのフラグです。RFC 6749 §6 ではリフレッシュトークンは認可サーバが発行する資格情報とされているため、ハンドラが値そのものを渡す形にはしていません。
:::

## OP が拒否すること

- **ハンドラが指定するリフレッシュトークン値**。OP に発行させたい場合は `IssueRefreshToken: true` を使います
- **`AccessToken` と `BoundAccessToken` の同時設定**。排他。両方設定すると `server_error`
- **`ExtraClaims` の予約 claim との衝突**。`CustomGrantResponse.ExtraClaims`（id_token 側）で `iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid` を使うと `server_error` になります。アクセストークン側の一覧は `BoundAccessToken` の節にあります。（`TokenExchangePolicy.ExtraClaims` は扱いが異なり、予約名は黙って破棄されます。ポリシーに上書きさせないためです。）

クライアント側で直せる失敗は 4xx の OAuth エラーです。クライアントに帰属できない失敗は、`invalid_grant` ではなく `500 server_error` になります。recover したハンドラの panic、レスポンス形態の衝突、予約 claim の衝突、OP 側の署名や保存の障害がこれに当たります。`RequireAuthTime` を登録したクライアントに対して、`openid` を要求しながら `AuthTime` がゼロのレスポンスを返した場合も、自動で作る id_token が失敗して `500 server_error` になります。

## 失効、ユーザ削除、pairwise の `/userinfo`

ハンドラが grant を記録しない限り、custom grant の資格情報はどの保存済み grant にも属しません。subject を保証するのは同意の記録ではなくハンドラだからです。このため次のようになります。

- `Provider.RevokeSubject` はこれらのトークンに届きません。有効期限が来るか個別に失効させるまで有効なので、アカウント削除時にはハンドラ側で失効させてください。
- pairwise subject を使う場合、これらのトークンでの `/userinfo` は `invalid_token` を返します。公開用の subject を引ける grant がないためです。

token exchange のトークンは例外で、`subject_token` の grant の下で発行されるため、grant の失効やユーザ削除が及びます（[Token Exchange](/ja/use-cases/token-exchange) を参照）。

## 動かしてみる

[`examples/30-custom-grant`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-custom-grant):

```sh
(cd examples/30-custom-grant && GOWORK=off go run -tags example .)
```

この example は `urn:example:libraz:service-token-exchange` を定義し、`op.WithCustomGrant` でハンドラを登録します。ハンドラが `BoundAccessToken` を返すので、OP はリクエストの DPoP / mTLS の confirmation に結び付いた JWT アクセストークンを発行します。ファイル: `op.go`(OP の組み立て + ハンドラ)、`client.go`(client 側)、`probe.go`(self-verify)。

## 続きはこちら

- [Token Exchange の組み込み](/ja/use-cases/token-exchange) — 同じディスパッチャに乗る組み込み grant。OP が意味を理解するポリシー（`act` チェーン、`cnf` の付け替え）が加わります
- [Sender constraint](/ja/concepts/sender-constraint) — `cnf` が何で、なぜ `BoundAccessToken` が代わりに押印してくれるのが重要なのか
