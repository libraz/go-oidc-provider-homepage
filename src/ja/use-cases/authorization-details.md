---
title: Rich authorization requests（RFC 9396）
description: RFC 9396 authorization_details を登録・検証し、新規 detail の再同意を要求して、token と introspection に反映する。
pageClass: pg-use-cases-authorization-details
---

# 使い方 — Rich authorization requests（RFC 9396）

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
- **`type`** — RFC 9396 §2 の識別子（例: `payment_initiation`）。OP はあらかじめ登録した type だけを受理し、未知の type は拒否します。
- **validator** — 構造的なチェックは OP が担います。`type` を超えた各メンバの *意味* は、type ごとの validator で組み込み側が強制します。
:::

## ライブラリが見る部分、組み込み側が見る部分

この分担は意図的です。本ライブラリは RFC 9396 §2.1 の **構造** を担います。値がオブジェクトの JSON 配列であること、各要素が OP の認識する非空文字列 `type` を持つこと、リクエスト全体が控えめなサイズ上限に収まることを確認します。type 固有の事柄、たとえば `payment_initiation` 要素が非空の `actions` 配列を持つこと、金額が正であること、location がこのクライアントの触れてよいものであることは、type に登録する `Validate` 関数へ委譲されます。

validator なしで登録された type は、その type 配下で任意の中身を受理してしまいます。そのため nil の `Validate` は `op.New` で拒否され、OP は起動しません。

<figure class="fig">
  <div class="fig-head">どのメンバーを誰が見るか</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-authzdetails-title" viewBox="0 0 960 272" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-authzdetails-title">authorization_details の 1 要素について、OP は配列の形と type メンバーを確認し、登録した validator がそれ以外のメンバーを確認します。許可された配列はトークン応答、JWT アクセストークンの中、introspection の 3 か所に反映されます。</title>
    <rect class="fg-box fg-box--sub" x="36" y="36" width="330" height="150" rx="8"/>
    <text class="fg-mxs" x="56" y="62">[{</text>
    <text class="fg-mxs fg-accent" x="70" y="84">"type": "payment_initiation",</text>
    <text class="fg-mxs" x="70" y="106">"actions": ["initiate"],</text>
    <text class="fg-mxs" x="70" y="128">"amount": "40.00"</text>
    <text class="fg-mxs" x="56" y="150">}]</text>
    <text class="fg-xs" x="56" y="176">配列のうちの 1 要素</text>
    <path class="fg-leader" d="M370,80 H396 M370,116 H396"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M396,80 H426" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--thin" d="M396,116 H426" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="430" y="56" width="290" height="48" rx="6"/>
    <text class="fg-t2 fg-accent" x="448" y="76">OP が見る部分</text>
    <text class="fg-xs" x="448" y="94">配列の形と、type が登録済みかどうか</text>
    <rect class="fg-box" x="430" y="112" width="290" height="48" rx="6"/>
    <text class="fg-t2" x="448" y="132">組み込み側の Validate が見る部分</text>
    <text class="fg-xs" x="448" y="150">それ以外のメンバー — 語彙は組み込み側のもの</text>
    <text class="fg-lbl" x="36" y="216">許可された配列は 3 か所に反映される</text>
    <rect class="fg-box" x="36" y="226" width="290" height="42" rx="6"/>
    <text class="fg-mxs" x="54" y="246">トークン応答</text>
    <text class="fg-xs" x="54" y="262">authorization_details として</text>
    <rect class="fg-box" x="336" y="226" width="290" height="42" rx="6"/>
    <text class="fg-mxs" x="354" y="246">JWT アクセストークン</text>
    <text class="fg-xs" x="354" y="262">RFC 9068 §2.2.3</text>
    <rect class="fg-box" x="636" y="226" width="288" height="42" rx="6"/>
    <text class="fg-mxs" x="654" y="246">introspection</text>
    <text class="fg-xs" x="654" y="262">RFC 9396 §9</text>
  </svg>
  <figcaption class="fig-note">この分担がこの機能の要点です。OP は金額や操作が何を意味するかについて見解を持たないため、外形だけを検証し、中身は意味を知っているコードに渡します。</figcaption>
</figure>

## 設定

受理する type を `op.WithAuthorizationDetailTypes` で登録します。type を登録すると RAR feature が暗黙に有効になり、`authorization_details` が 3 つのエンドポイントで受理可能になり、許可済みの内容が永続化・反映され、discovery が `authorization_details_types_supported` を公開します。`op.WithFeature(feature.RAR)` だけでは、受理する type と validator が無いため実用的な設定になりません。

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

同じパラメータは [PAR](/ja/use-cases/fapi2-baseline) の push や token エンドポイントでも受理されます。grant が確立すると、token レスポンスに許可済みの内容が入ります:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "authorization_details": [{"type": "payment_initiation", "actions": ["initiate"]}]
}
```

JWT アクセストークンは同じ配列を `authorization_details` claim として保持し（RFC 9068 §2.2.3）、トークンを introspect すると introspection レスポンスにもその配列が返ります（RFC 9396 §9）。そのためリソースサーバは、JWT を自分でパースしても OP に問い合わせても、許可済みの内容に到達できます。

## 再同意と detail の適用範囲

OP が既存 grant を同意なしで再利用するのは、要求されたすべての scope が既に含まれ、要求されたすべての `authorization_details` 要素がその grant の要素と deep-equal の場合だけです。`prompt=consent` は両方の集合がカバーされていても同意 interaction を強制します。新しい要素、または `amount: "100"` → `"999"` のように値が変わった要素も同意を強制し、通常の同意が完了すると既存 grant に要求された detail を追加します。

同意 UI は要求 scope の集合を絞れますが、detail ごとの承認・絞り込み UI は本ライブラリにありません。各 detail が受理可能かは登録した validator が決め、通常の同意経路が完了すると要求された detail はまとめて永続化され、token と introspection に反映されます。

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
