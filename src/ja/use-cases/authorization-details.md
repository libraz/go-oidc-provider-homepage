---
title: Rich authorization requests（RFC 9396）
description: authorization_details を受理し、各要素を登録済みの type で検証し、トークンと introspection に許可済みの内容を反映する。
---

# 使い方 — Rich authorization requests（RFC 9396）

scope は粗い単位です。`scope=payments` は *このクライアントは送金してよい* を表しますが、*IBAN X から IBAN Y へ €40 を一度だけ動かす* までは表せません。[RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396)（Rich Authorization Requests、通称 RAR）は `authorization_details` パラメータを追加します。これは型付きオブジェクトの JSON 配列で、クライアントは要求内容を細かく記述でき、OP はその内容を grant に束ね、その grant から発行されるトークンへ引き継げます。

本ライブラリは `authorization_details` を `/authorize`、`/par`、`/token` で受理し、各要素を登録済みの type で検証し、許可済みの内容を grant に永続化し、JWT アクセストークン（RFC 9068 §2.2.3）と introspection（RFC 9396 §9）に反映します。

RAR は、リソースサーバが金額、口座、location、action、datatype のような構造化された事実を見て判断する必要がある場合に使います。単に scope 名を増やしたいだけなら使わない方がよいです。`read:orders` や `payments:initiate` で十分に表せるなら、scope の方が単純で既存クライアントからも扱いやすいです。

::: details このページで触れる仕様
- [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) — OAuth 2.0 Rich Authorization Requests（§2 構造、§5 エラー、§9 introspection、§10 discovery）
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT アクセストークン（§2.2.3 が `authorization_details` を保持）
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.5（`claims` request、より粗い兄弟分）
:::

::: details 用語の補足
- **`authorization_details`** — JSON 配列。各要素は `type` 文字列に加えて、type 固有のメンバ（`actions`、`locations`、`datatypes` など、その type が定義するもの）を持つオブジェクト。
- **`type`** — RFC 9396 §2 の識別子（例: `payment_initiation`）。OP は事前に教えられた type だけを受理し、未知の type は拒否します。
- **validator** — 構造的なチェックは OP が担います。`type` を超えた各メンバの *意味* は、type ごとの validator で組み込み側が強制します。
:::

## ライブラリが見る部分、組み込み側が見る部分

この分担は意図的です。本ライブラリは RFC 9396 §2.1 の **構造** を担います。値がオブジェクトの JSON 配列であること、各要素が OP の認識する非空文字列 `type` を持つこと、リクエスト全体が控えめなサイズ上限に収まることを確認します。type 固有の事柄、たとえば `payment_initiation` 要素が非空の `actions` 配列を持つこと、金額が正であること、location がこのクライアントの触れてよいものであることは、type に登録する `Validate` 関数へ委譲されます。

validator なしで登録された type は、その type 配下で任意の中身を受理してしまいます。そのため nil の `Validate` は `op.New` で拒否され、OP は起動しません。

## 設定

受理する type を `op.WithAuthorizationDetailTypes` で登録します。これにより RAR feature が暗黙に有効になり、`authorization_details` が 3 つのエンドポイントで受理可能になり、許可済みの内容が永続化・反映され、discovery が `authorization_details_types_supported` を公開します。`op.WithFeature(feature.RAR)` だけでは、受理する type と validator が無いため実用的な設定になりません。

```go
import (
  "context"
  "errors"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/store"
)

op.New(
  /* 必須オプション */
  op.WithAuthorizationDetailTypes(op.AuthorizationDetailType{
    Type: "payment_initiation",
    Validate: func(_ context.Context, el map[string]any, _ *store.Client) error {
      if _, ok := el["actions"].([]any); !ok {
        return errors.New("payment_initiation requires an actions array")
      }
      return nil
    },
  }),
)
```

`Validate` は復号済みの要素（`el["type"]` は登録した `Type` と一致済み）と、リクエストの属する認証済み `*store.Client` を受け取ります。そのため validator は、クライアントに権限のない `location` などを拒否できます。`el` を変更してはなりません。nil 以外のエラーを返すと、リクエスト全体を `invalid_authorization_details` で拒否します。

各 `Type` は非空かつ一意である必要があり、重複は構築時に拒否されます。呼び出しを繰り返すと追記されるので、基本セットに配備固有の上書きを重ねられます。

discovery 文書はこう公開します:

```json
{
  "authorization_details_types_supported": ["payment_initiation"]
}
```

## 動作確認

クライアントは `authorization_details` を URL エンコードした JSON 配列として送ります:

```sh
DETAILS='[{"type":"payment_initiation","actions":["initiate"]}]'
curl -G --data-urlencode "authorization_details=$DETAILS" \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'client_id=demo' \
  --data-urlencode 'redirect_uri=https://rp.example.com/callback' \
  --data-urlencode 'scope=openid' \
  --data-urlencode 'code_challenge_method=S256' \
  --data-urlencode "code_challenge=$CHALLENGE" \
  https://op.example.com/oidc/auth
```

同じパラメータは [PAR](/ja/use-cases/fapi2-baseline) の push や token エンドポイントでも受理されます。grant が確立すると、token レスポンスに許可済みの内容が入ります:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "authorization_details": [{"type": "payment_initiation", "actions": ["initiate"]}]
}
```

JWT アクセストークンは同じ配列を `authorization_details` claim として保持し（RFC 9068 §2.2.3）、トークンを introspect すると introspection レスポンスにもそれが返ります（RFC 9396 §9）。そのためリソースサーバは、JWT を自分でパースしても OP に問い合わせても、許可済みの内容に到達できます。

## エラー

| 条件 | エラー |
|---|---|
| 値がオブジェクトの JSON 配列でない、要素に認識可能な `type` がない、リクエストがサイズ上限を超える | `invalid_request`（サイズ超過）/ `invalid_authorization_details`（形が不正） |
| 登録済み type の `Validate` が nil 以外のエラーを返す | `invalid_authorization_details` |

## RAR と `claims` パラメータ

どちらも粗い scope が与える範囲を絞りますが、答える問いが違います。[`claims` パラメータ](/ja/use-cases/claims-request) は id_token / userinfo の *どこにどの claim が載るか* を要求します。`authorization_details` はリソースサーバで *アクセストークンが何をできるか* を記述します。両者は共存でき（1 リクエストが両方を持てる）、本ライブラリは配列（`authorization_details`）かオブジェクト（`claims`）かを形で区別して同じマージ経路で処理します。

## 続きはこちら

- [Claims リクエストパラメータ](/ja/use-cases/claims-request) — claim 単位の兄弟分の仕組み。
- [Grant management](/ja/use-cases/grant-management) — `authorization_details` を束ねた grant を照会・失効する。
- [アクセストークンの形式](/ja/concepts/access-token-format) — 許可済みの内容が JWT アクセストークンのどこに載るか。
