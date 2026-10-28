---
title: Rich authorization requests（RFC 9396）
description: RFC 9396 authorization_details を登録・検証し、新規 detail の再同意を要求して、token と introspection に反映する。
pageClass: pg-use-cases-authorization-details
---

# ユースケース — Rich authorization requests（RFC 9396）

scope は粗い単位です。`scope=payments` は *このクライアントは送金してよい* を表しますが、*IBAN X から IBAN Y へ €40 を一度だけ動かす* までは表せません。[RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396)（Rich Authorization Requests、通称 RAR）は `authorization_details` パラメータを追加します。型付きオブジェクトの JSON 配列で、クライアントは要求内容を細かく記述でき、OP はその内容を grant に束ね、その grant から発行されるトークンへ引き継げます。

本ライブラリは `authorization_details` を `/auth`、`/par`、`/token` で受理し、各要素を登録済みの type で検証し、許可済みの内容を grant に永続化し、JWT アクセストークン（RFC 9068 §2.2.3）と introspection（RFC 9396 §9）に反映します。`/oidc` に mount した場合の認可 endpoint は `/oidc/auth` です。

RAR は、リソースサーバが金額、口座、location、action、datatype のような構造化された事実を見て判断する必要がある場合に使います。単に scope 名を増やしたいだけなら使わない方がよいです。`read:orders` や `payments:initiate` で十分に表せるなら、scope の方が単純で既存クライアントからも扱いやすいです。

::: details このページで触れる仕様
- [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) — OAuth 2.0 Rich Authorization Requests（§2 構造、§5 エラー、§9 introspection、§10 discovery）
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT アクセストークン（§2.2.3 が `authorization_details` を保持）
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.5（`claims` request、より粗い兄弟分）
:::

::: details 用語の補足
- **`authorization_details`** — JSON 配列。各要素は `type` 文字列に加えて、type 固有のメンバ（`actions`、`locations`、`datatypes` など、その type が定義するもの）を持つオブジェクト。
- **`type`** — RFC 9396 §2 の識別子（例: `payment_initiation`）。OP が受理するのは、登録された type だけです。未知の type は拒否されます。
- **validator** — 構造の検査は OP が行います。`type` 以外の各メンバの *意味* は、type ごとの validator で組み込み側が検査します。
:::

## ライブラリが見る部分、組み込み側が見る部分

この分担は意図的です。本ライブラリは RFC 9396 §2.1 の **構造** を担います。値がオブジェクトの JSON 配列であること、各要素が OP の認識する非空文字列 `type` を持つこと、リクエスト全体が控えめなサイズ上限に収まることを確認します。type 固有の事柄、たとえば `payment_initiation` 要素が非空の `actions` 配列を持つこと、金額が正であること、location がこのクライアントの触れてよいものであることは、type に登録する `Validate` 関数へ委譲されます。

validator なしで登録された type は、その type の下で任意の中身を受理してしまいます。そのため、`op.New` は nil の `Validate` を拒否します。

<figure class="fig">
  <div class="fig-head">OP は外形を、組み込み側のコードは中身を見る</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-authzdetails-title" viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-authzdetails-title">authorization_details の 1 要素について、OP は配列の形と type メンバーを確認し、登録した validator がそれ以外のメンバーを確認します。許可された配列はトークン応答、JWT アクセストークンの中、introspection の 3 か所に反映されます。</title>
    <!-- one array element -->
    <text class="fg-lbl" x="32" y="40">配列のうちの 1 要素</text>
    <rect class="fg-box fg-box--sub" x="32" y="56" width="312" height="96" rx="8"/>
    <text class="fg-mxs fg-accent" x="48" y="84">"type": "payment_initiation",</text>
    <text class="fg-mxs" x="48" y="108">"actions": ["initiate"],</text>
    <text class="fg-mxs" x="48" y="132">"amount": "40.00"</text>
    <!-- bus into the two checkers -->
    <path class="fg-leader" d="M344,104 H376 M376,92 V196"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M376,92 H424" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--thin" d="M376,196 H424" marker-end="url(#fg-a)"/>
    <!-- the OP checks -->
    <rect class="fg-box fg-box--accent" x="424" y="56" width="504" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="440" y="84">OP が見る部分</text>
    <text class="fg-s" x="440" y="108">配列の形と、type が登録済みかどうか</text>
    <!-- your Validate checks -->
    <rect class="fg-box" x="424" y="160" width="504" height="72" rx="8"/>
    <text class="fg-t2" x="440" y="188">組み込み側の Validate が見る部分</text>
    <text class="fg-s" x="440" y="212">それ以外のメンバー — 語彙は組み込み側のもの</text>
    <!-- echo -->
    <path class="fg-rule" d="M32,264 H928"/>
    <text class="fg-lbl" x="32" y="296">許可された配列は 3 か所に反映される</text>
    <!-- echo 1 -->
    <rect class="fg-box" x="32" y="312" width="272" height="72" rx="8"/>
    <text class="fg-m" x="48" y="340">トークン応答</text>
    <text class="fg-s" x="48" y="364">authorization_details として</text>
    <!-- echo 2 -->
    <rect class="fg-box" x="344" y="312" width="272" height="72" rx="8"/>
    <text class="fg-m" x="360" y="340">JWT アクセストークン</text>
    <text class="fg-s" x="360" y="364">RFC 9068 §2.2.3</text>
    <!-- echo 3 -->
    <rect class="fg-box" x="656" y="312" width="272" height="72" rx="8"/>
    <text class="fg-m" x="672" y="340">introspection</text>
    <text class="fg-s" x="672" y="364">RFC 9396 §9</text>
  </svg>
  <figcaption class="fig-note">この分担がこの機能の要点です。OP は金額や操作が何を意味するかについて見解を持たないため、外形だけを検証し、中身は意味を知っているコードに渡します。</figcaption>
</figure>

## 設定

受理する type を `op.WithAuthorizationDetailTypes` で登録します。type を登録すると RAR feature が暗黙に有効になり、`authorization_details` が 3 つのエンドポイントで受理可能になり、許可済みの内容が永続化・反映され、discovery が `authorization_details_types_supported` を公開します。`op.WithFeature(feature.RAR)` だけでは、登録された type も validator もないため意味がありません。type を登録しないと、このパラメータは未知の拡張として無視されます。

```go
import (
  "context"
  "errors"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/store"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

st := inmem.New()
loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithGrants(grant.AuthorizationCode, grant.RefreshToken),
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

同じパラメータは [PAR](/ja/use-cases/fapi2-baseline) の push でも受理されます。ユーザが同意すると、token レスポンスに許可された内容が入ります。

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "authorization_details": [{"type": "payment_initiation", "actions": ["initiate"]}]
}
```

JWT アクセストークンは同じ配列を `authorization_details` claim として保持し（RFC 9068 §2.2.3）、トークンを introspect すると introspection レスポンスにもその配列が返ります（RFC 9396 §9）。そのためリソースサーバは、JWT を自分でパースしても OP に問い合わせても、許可された内容にたどり着けます。

認可コード、リフレッシュトークンのチェーン、アクセストークンは、それぞれを発行した認可の detail を持ちます。同じユーザとクライアントによる後の認可が、すでにあるトークンに detail を足すことはなく、Grant Management の `replace` が opaque アクセストークンとリフレッシュトークンのチェーンから取り除けるのは detail だけです（[Grant management](/ja/use-cases/grant-management) を参照）。

### token エンドポイントでの扱い

`/token` の `authorization_details` も、登録済みの同じ type で検証されますが、権限を広げることはありません。

| リクエスト | `authorization_details` の効果 |
|---|---|
| `authorization_code` または `refresh_token` | 絞り込みです。要求した各要素は、その認可で許可された要素と deep-equal でなければならず、そうでなければ `invalid_authorization_details` で失敗します。省略すると、許可された内容がすべて保たれます。 |
| `client_credentials` | 検証を通った要素が、要求どおりにトークンへ載ります。ユーザも同意の記録もないため、クライアントが何を要求できるかを検査するのは `Validate` 関数だけです。 |

## 再同意と detail の適用範囲

OP が既存の grant を同意画面なしで再利用するのは、要求されたすべての scope がすでに grant にあり、要求されたすべての `authorization_details` 要素が grant の要素と deep-equal の場合だけです。新しい要素や、`amount: "100"` → `"999"` のように値が変わった要素があると、ユーザは再び同意画面を通ります。通常の同意が済むと、その要素が grant に追加されます。`prompt=consent` は、両方の集合が含まれていても同意を強制します。ファーストパーティのクライアントに対する同意の省略は、`authorization_details` を含むリクエストには適用されません。

組み込みの同意ステップが表示するのは scope だけです。要素ごとの表示や承認はありません。ユーザは scope のチェックを外せますが、要求された detail は、ユーザが何を承認しても、まとめて保存され、そのまま反映されます。金額や受取人のような内容を見せる必要がある場合は、自前の同意 UI で表示してください。要素そのものを拒否したければ、`Validate` で行います。

## エラー

| 条件 | エラー |
|---|---|
| 値がサイズ上限を超えている | `invalid_request` |
| 値がオブジェクトの JSON 配列でない、または要素に登録済みの `type` がない | `invalid_authorization_details` |
| 登録済み type の `Validate` が nil 以外のエラーを返す | `invalid_authorization_details` |
| `/token` で、要求した要素が許可された集合にない | `invalid_authorization_details` |

## RAR と `claims` パラメータ

どちらも粗い scope では言い表せない内容を扱いますが、答える問いが違います。[`claims` パラメータ](/ja/use-cases/claims-request) は、id_token や userinfo の *どこにどの claim を載せるか* を要求します。`authorization_details` は、リソースサーバ上で *アクセストークンが何をしてよいか* を記述します。1 つのリクエストに両方を含めることもできます。

## 続きはこちら

- [Claims リクエストパラメータ](/ja/use-cases/claims-request) — claim 単位の兄弟分の仕組み。
- [Grant management](/ja/use-cases/grant-management) — `authorization_details` を束ねた grant を照会・失効する。
- [アクセストークンの形式](/ja/concepts/access-token-format) — 許可済みの内容が JWT アクセストークンのどこに載るか。
