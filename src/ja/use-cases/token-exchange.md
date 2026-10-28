---
title: トークン交換（RFC 8693） — 組み込み
description: RFC 8693 token-exchange grant を有効化 — TokenExchangePolicy、`act` チェーン、audience 正規化、`cnf` の再バインド。
pageClass: pg-use-cases-token-exchange
---

# ユースケース — トークン交換（RFC 8693）

トークン交換（RFC 8693）は、クライアントが持っているトークンを、audience の違う、より狭い scope の、あるいは委譲が記録された新しいトークンと引き換える仕組みです。典型的な場面は、フロントのサービスが Alice のアクセストークンを持っていて、Alice の代わりに下流のサービスを呼ぶためのトークンが必要な場合です。なりすましと委譲の違い、なぜ `cnf` を付け替えるのかといった概念は、先に [Token Exchange 入門](/ja/concepts/token-exchange) を読んでください。このページは組み込み手順を扱います。

::: details `subject_token` と `actor_token` の違い
**`subject_token`** は、新しいトークンが **誰の代わりに** 発行されるかを表すトークン（ユーザ、またはサービス）です。発行されるトークンの `sub` はここから決まります。**`actor_token`** は任意で、subject の **代理として** 動く主体を示します。「service-a が alice の代わりに service-b を呼ぶ」場合、alice のアクセストークンが `subject_token` で、service-a 自身のアクセストークンを `actor_token` にできます。`actor_token` がなければ、認証された呼び出し元のクライアントが actor になります。`actor_token` の subject が `subject_token` の subject と同じリクエストは、`400 invalid_request` で拒否されます。
:::

::: details `act` チェーンとは
RFC 8693 §4.1 は、`act` claim を「誰が誰の代わりに動作したか」の記録として定義しています。発行されるトークンでは、`act.sub` が actor を示します。`subject_token` がすでに `act` を持っていた場合は、新しいエントリの内側に入れ子で保たれ、チェーン（`alice → service-a → service-b`）になります。リソースサーバは `act` をたどってチェーン全体を確認します（「transfer は alice が service-a 経由なら可、bob が service-a 経由は不可」など）。OP は 5 段を超えるチェーンを、ポリシーが呼ばれる前に拒否します。
:::

## 全体像

トークン交換は「入力トークンをそのまま別 audience にコピーする」処理ではありません。OP は subject と actor を検証し、scope と audience を狭め、`act` チェーンを構成し、送信者制約を呼び出し側の鍵へ付け替えてから、新しいアクセストークンを発行します。

<figure class="fig">
  <div class="fig-head">2 つのトークンを入れて、1 つを受け取る</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-tx-title" viewBox="0 0 960 368" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-tx-title">トークン交換の全体像。Service A は Alice のトークンを subject として、自身のトークンを actor として提示します。OP は両方を検証し、scope の積を取り、audience を正規化し、act チェーンと confirmation claim を組み直し、ポリシー判定を経て Service B 宛てのトークンを発行します。</title>
    <!-- subject token -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-m" x="48" y="52">subject_token</text>
    <text class="fg-s" x="48" y="76">Alice のアクセストークン</text>
    <text class="fg-mxs" x="48" y="100">scope=profile write</text>
    <path class="fg-edge" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <!-- actor token -->
    <rect class="fg-box" x="32" y="160" width="272" height="96" rx="8"/>
    <text class="fg-m" x="48" y="188">actor_token</text>
    <text class="fg-s" x="48" y="212">service-a 自身のトークン</text>
    <text class="fg-mxs" x="48" y="236">sub=service-a</text>
    <path class="fg-edge" d="M304,208 H344" marker-end="url(#fg-a)"/>
    <!-- OP /token -->
    <rect class="fg-frame fg-frame--accent" x="344" y="24" width="304" height="256" rx="8"/>
    <text class="fg-m fg-accent" x="368" y="52">OP /token</text>
    <text class="fg-mxs" x="368" y="76">grant_type=…:token-exchange</text>
    <!-- step 1 -->
    <circle class="fg-badge" cx="380" cy="116" r="12"/>
    <text class="fg-badge-t" x="380" y="121.5" text-anchor="middle">1</text>
    <text class="fg-s" x="404" y="121.5">入力トークンを両方検証する</text>
    <!-- step 2 -->
    <circle class="fg-badge" cx="380" cy="148" r="12"/>
    <text class="fg-badge-t" x="380" y="153.5" text-anchor="middle">2</text>
    <text class="fg-s" x="404" y="153.5">scope の積を取る</text>
    <!-- step 3 -->
    <circle class="fg-badge" cx="380" cy="180" r="12"/>
    <text class="fg-badge-t" x="380" y="185.5" text-anchor="middle">3</text>
    <text class="fg-s" x="404" y="185.5">audience を正規化する</text>
    <!-- step 4 -->
    <circle class="fg-badge" cx="380" cy="212" r="12"/>
    <text class="fg-badge-t" x="380" y="217.5" text-anchor="middle">4</text>
    <text class="fg-s" x="404" y="217.5">act と cnf を組み直す</text>
    <!-- step 5 -->
    <circle class="fg-badge" cx="380" cy="244" r="12"/>
    <text class="fg-badge-t" x="380" y="249.5" text-anchor="middle">5</text>
    <text class="fg-s" x="404" y="249.5">Policy.Allow を実行する</text>
    <rect class="fg-pill fg-pill--warn" x="344" y="312" width="304" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="496" y="333" text-anchor="middle">どの段階でも拒否しうる</text>
    <path class="fg-edge fg-edge--accent" d="M648,72 H688" marker-end="url(#fg-ac)"/>
    <!-- issued token -->
    <rect class="fg-box fg-box--accent" x="688" y="24" width="240" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="704" y="52">発行されたトークン</text>
    <text class="fg-mxs" x="704" y="76">aud=service-b</text>
    <text class="fg-mxs" x="704" y="100">act.sub=service-a</text>
    <path class="fg-edge" d="M808,120 V160" marker-end="url(#fg-a)"/>
    <!-- service-b -->
    <rect class="fg-box" x="688" y="160" width="240" height="96" rx="8"/>
    <text class="fg-m" x="704" y="188">service-b</text>
    <text class="fg-s" x="704" y="212">act と cnf を検証し、</text>
    <text class="fg-s" x="704" y="236">そのうえで可否を判断する</text>
  </svg>
  <figcaption class="fig-note">この交換は狭める方向にしか働きません。scope は積集合になり、audience は単一のサービスに絞られ、actor は落とされず記録されるため、subject token が持っていた以上の権限が返ることはありません。ポリシーが入るのは手順 5 です。service A が Alice の代理として service B に対して動いてよいかどうかを、OP が独自に判断することはありません。</figcaption>
</figure>

発行されるトークンの `cnf` は、この交換リクエストで提示された DPoP / mTLS の証明から決まります。`subject_token.cnf` を引き継ぐことはありません。それ自体が送信者制約付きの `subject_token` や `actor_token` は、同じ証明と一緒に提示する必要があり、そうでなければ交換は `invalid_grant` で失敗します。

## grant を有効化

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

  // token exchange は拡張 grant なので、WithGrants が選ぶのは、この OP が
  // 併せて提供する組み込み grant だけです。下のポリシーがリフレッシュ
  // トークンの発行を選べるよう、RefreshToken を挙げています。
  op.WithGrants(grant.ClientCredentials, grant.RefreshToken),
  op.RegisterTokenExchange(myPolicy),

  op.WithStaticClients(op.ConfidentialClient{
    ID:         "service-a",
    Secret:     serviceASecret,
    AuthMethod: op.AuthClientSecretBasic,
    // クライアントは token exchange の URN を列挙する必要があります。
    GrantTypes: []string{op.TokenExchangeGrantType},
    Scopes:     []string{"profile", "write:transfer"},
    // 交換先にしてよい audience は、すべて登録しておきます。
    Resources:  []string{"https://api.b.example.com"},
  }),
)
```

`op.RegisterTokenExchange(...)` が行うこと:

1. RFC 8693 URN（`urn:ietf:params:oauth:grant-type:token-exchange`）を `/token` に登録
2. 組み込みのハンドラを有効にする。`subject_token` / `actor_token` の解決、audience の正規化、scope の積集合、`act` チェーンの構築、`cnf` の付け替え、TTL の頭打ちを行う
3. 組み込み側が用意した `TokenExchangePolicy` を、リクエストごとの可否判定として登録する

::: warning ポリシーは必須、既定拒否（deny-by-default）
nil の `TokenExchangePolicy` は `op.New` で失敗します（`op.ErrTokenExchangePolicyNil`）。この grant に安全な既定は存在せず、すべての交換は配備側のポリシーで評価される必要があります。`RegisterTokenExchange` を 2 度呼ぶと `op.ErrTokenExchangeDuplicate` で失敗します。
:::

## `TokenExchangePolicy` を実装する

ポリシーのインターフェースは小さいですが、交換を許すかどうかの判断はここで決まります。解決済みの `TokenExchangeRequest`（トークンは検証済み、audience は正規化済み、scope は積集合を適用済み）を受け取り、`*TokenExchangeDecision`（さらに絞り込む場合）かエラーを返します。

```go
type myPolicy struct{ /* dependencies */ }

func (p *myPolicy) Allow(ctx context.Context, req op.TokenExchangeRequest) (*op.TokenExchangeDecision, error) {
    // 未知の audience を拒否
    for _, aud := range req.RequestedAudience {
        if !p.audienceAllowed(req.Client.ID, aud) {
            return nil, &op.Error{Code: "invalid_target", Description: "audience not allowed for this client"}
        }
    }

    // 送信者制約のない subject token から送信者制約付き audience への委譲を拒否
    if req.Actor != nil && req.SubjectToken.Confirmation == nil && p.audienceRequiresProof(req.RequestedAudience) {
        return nil, &op.Error{Code: "invalid_grant", Description: "downstream requires sender-bound subject"}
    }

    // 長寿命サービスチェーン用にリフレッシュトークンの発行を明示
    if req.Actor != nil && p.actorEligibleForRefresh(req.Actor) {
        return &op.TokenExchangeDecision{
            IssueRefreshToken: op.PtrBool(true),
        }, nil
    }
    return nil, nil // プロバイダの既定値で受理
}
```

### Decision のルール

| フィールド | 振る舞い |
|---|---|
| `GrantedScope` | 非空のとき、プロバイダが計算したセットを **置き換え**。`req.RequestedScope` の部分集合であること必須。広い値は `invalid_scope` |
| `GrantedAudience` | 非空のとき、プロバイダが計算したセットを置き換え。`req.RequestedAudience` の部分集合であること必須。広い値は `invalid_target` |
| `GrantedTTL` | 正のとき、プロバイダが計算した上限よりさらに短くアクセストークンの寿命を絞ります。上限を超える値は上限まで切り詰められ、`token_exchange.ttl_capped` として記録されます。0 以下なら計算済みの寿命のままです |
| `IssueIDToken` | `*bool` で上書き。既定は `subject_token` が id_token なら true、それ以外は false。明示的な false は、許可 scope に `openid` が残っていても ID Token を抑止します |
| `IssueRefreshToken` | `*bool` で上書き。既定（nil）ではリフレッシュトークンを発行しません。有効にするには `op.PtrBool(true)` を返します。ポインタ形なのは、「未設定」と「false」を区別するためです |
| `ExtraClaims` | アクセストークンに、また id_token を発行する場合はそちらにもマージされます。予約名（`iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid / act / cnf`）は黙って破棄されるので、ポリシーが `act` チェーンを書き換えたり、`sub` を乗っ取ったり、`cnf` を偽造したりすることはできません。OP がアクセストークンで管理している名前（`client_id`、`scope`、`jti` など）を使うと、交換は `server_error` で失敗します |

OP は、決定を適用した後に部分集合の規則をもう一度検証します。ポリシーが広い scope や audience を返した場合、広がったトークンは発行されず、`invalid_scope` / `invalid_target` と監査イベントで拒否されます。許可される scope が空の場合も `invalid_scope` です。

### エラーセマンティクス

| return | 通信路上の応答 |
|---|---|
| `(nil, nil)` | プロバイダの既定値で交換を受理 |
| `(*Decision, nil)` | Decision を適用（さらなる絞り込みは可）、交換を受理 |
| `(_, *op.Error)` | そのまま返却 — 仕様エラーコード（`invalid_grant`、`invalid_target`、`invalid_scope`、`unauthorized_client`）から選ぶ |
| `(_, それ以外のエラー)` | `invalid_grant` にまとめる。原因はサーバ側のログにだけ残す |

## ポリシーが呼ばれる **前** に OP が強制すること

ポリシーは結果を絞ることはできても、広げることはできません。

- **トークンの検査**: `subject_token_type` と `actor_token_type` は `urn:ietf:params:oauth:token-type:access_token`、`:jwt`、`:id_token` のいずれかでなければなりません。トークンはこの OP が発行したもので、有効期限内（ほかのエンドポイントと同じ時計のずれの許容範囲を含む）であり、失効していないことが必要です。id_token は audience に呼び出し元のクライアントを含む必要があり、scope は保存済みの同意から読み取るので、同意が撤回されれば交換はできなくなります。pairwise のクライアントに発行された id_token は交換できません。`requested_token_type` を送る場合は `access_token` のみです。発行されるトークンは常に JWT のアクセストークンです。
- **`act` チェーン**: `act` は OP が自分で組み立て、呼び出し側が指定することはできません。3 つの場合を下の表に示します。
- **resource / audience の正規化**: URI 形式の値は、scheme と host を持つ絶対 URI でなければなりません。RFC 8707 §2 に従って scheme と host を小文字にし、既定の port（`http:80` / `https:443`）と末尾のスラッシュ 1 つを取り除きます。fragment と userinfo は拒否し、query はそのまま残します。opaque なラベルと URN は入力どおりに比較します。`audience` と `resource` は統合され、どちらもなければ `subject_token` の audience が使われます。たとえば `https://api.example.com:443/v1/` は `https://api.example.com/v1` になります。要求した audience は、すべてクライアントの `Resources` に含まれている必要があり、そうでなければ交換は `invalid_target` です。
- **scope**: 要求された scope（省略時は `subject_token` の scope）は、まずクライアントの登録済み `Scopes` の範囲に絞られ、そのうえで `subject_token` の scope の部分集合でなければなりません。そうでなければ `invalid_scope` です。結果が空でも `invalid_scope` です。
- **TTL の上限**: `GrantedTTL`、`subject_token` の残り寿命、OP 全体のアクセストークンの寿命のうち、最小の値です。
- **`cnf` の付け替え**: 発行されるトークンの `cnf`（DPoP の `jkt` または mTLS の `x5t#S256`）は、このリクエストで提示された証明から決まります。
- **grant の系統**: `subject_token` が保存済みの grant の下で発行されていた場合、交換で得たトークンも同じ grant の下で発行されます。grant の失効（`RevokeSubject`、Grant Management の revoke、`/end_session`）やユーザの削除でこれらも失効し、交換で得たリフレッシュトークンは、subject が削除されるとローテーションされなくなります。grant を持たない `subject_token`（たとえば `client_credentials` のトークン）からは、grant のないトークンができます。

| ケース | 発行トークンの `act` |
|---|---|
| `actor_token` あり | `{ "sub": <actor の sub> }`。`subject_token` にあった `act` はその内側に入れ子で残る |
| `actor_token` なし、呼び出し元のクライアントが `subject_token` のクライアントと異なる | `{ "sub": <呼び出し元の client_id> }`。以前の `act` は内側に入れ子で残る |
| `actor_token` なし、呼び出し元が `subject_token` の発行先と同じクライアント（自己交換） | 新しいエントリは追加しない。以前の `act` はそのまま残り、`token_exchange.self_exchange` が記録される |

::: details scope の積集合とは
発行されるトークンの scope は、次の 3 つの上限を同時に超えられません。(a) リクエストが求めた範囲、(b) `subject_token` がもともと持っていた範囲、(c) 呼び出し側のクライアントに登録されている範囲です。OP はこの 3 つを突き合わせ、結果が空なら `invalid_scope` にします。トークン交換が安全でいられるのはこのためで、`profile` しか持たないユーザのトークンから、service-a が `admin:write` を手に入れることはできません。
:::

::: details TTL 上限とは
発行されるトークンの寿命は、次の 3 つの最小値です。ポリシーが返した `GrantedTTL`（あれば）、`subject_token` の残り寿命（交換によって、ユーザのセッションが本来終わる時刻を超えて延ばすことはできません）、OP 全体のアクセストークンの寿命です。上限を超えた値は、拒否されずに上限まで切り詰められ、`token_exchange.ttl_capped` として記録されます。ポリシーの値が少し大きいだけで、交換が失敗することはありません。
:::

::: details `cnf` の再バインドとは
送信者制約付きのトークンは `cnf` を持ち、そこに示された鍵の持ち主だけがそのトークンを使えます。交換後のトークンは `/token` を呼び出した側のものなので、OP は `subject_token` の `cnf` をコピーせず、交換リクエストで提示された証明から `cnf` を作ります。鍵に結び付いた `subject_token` は、一致する証明を添えたときにだけ受け付けます。盗まれたトークンを、鍵を持たない者が交換することはできません。一方、鍵に結び付いていない（bearer の）`subject_token` は、結び付いたトークンに交換できます。意義については [送信者制約](/ja/concepts/sender-constraint) を参照してください。
:::

::: details 自己交換（self-exchange）とは
`subject_token` を持っているクライアントと交換を要求しているクライアントが同じで（`subject_token.client_id == req.Client.ID`）、`actor_token` もない場合、委譲は起きていません。クライアントが自分のトークンを絞り込んでいるだけです。`act` は実際の委譲を記録するものなので、OP は「service-a が service-a 自身の代わりに動作した」というエントリを追加しません。
:::

## 通信路上での交換リクエスト

Service A は自分自身として認証し、Alice のアクセストークンを提示します。`actor_token` がなければ、OP は呼び出し元のクライアントである service-a を actor として記録します。

```sh
curl -s \
  -u service-a:<secret> \
  -H 'DPoP: <service-a の鍵で署名した proof>' \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
  -d "subject_token=$ALICES_ACCESS_TOKEN" \
  -d 'subject_token_type=urn:ietf:params:oauth:token-type:access_token' \
  -d 'audience=https://api.b.example.com' \
  -d 'scope=write:transfer' \
  https://op.example.com/oidc/token
```

応答には `issued_token_type=urn:ietf:params:oauth:token-type:access_token` も含まれ、アクセストークンをデコードすると次のようになります。

```json
{
  "sub": "alice",
  "act": { "sub": "service-a" },
  "aud": "https://api.b.example.com",
  "scope": "write:transfer",
  "cnf": { "jkt": "<このリクエストの DPoP 鍵の thumbprint>" },
  "iss": "https://op.example.com",
  "exp": ...
}
```

Service B は `cnf.jkt` に対して DPoP proof を検証し、`act.sub` を読み、自分の委譲規則を適用します（「transfer は alice が service-a 経由なら可、bob が service-a 経由は不可」など）。

行為者が認証済みのクライアントとは別の主体である場合は、`actor_token` と `actor_token_type`（同じ 3 種類の type URN）を加えます。このとき `act.sub` は actor token の `sub` になります。`DPoP` ヘッダ（`feature.DPoP` を有効にしておく必要があります）が要るのは、DPoP に結び付いた結果が欲しいときだけです。ヘッダがなければ、有効なプロファイルが送信者制約を必須としていない限り、bearer のトークンになります。

## リフレッシュトークンは明示時だけ発行

トークン交換リクエストは既定でリフレッシュトークンを **発行しません**。RFC 8693 §2.2.1 はこの応答パラメータを OPTIONAL としており、これは多段の委譲が subject_token の寿命を超えて気付かれずに延伸するのを防ぐためです。

発行するには、ポリシーで `IssueRefreshToken: op.PtrBool(true)` を返します。素の bool ではなくポインタ形なのは、構造体のゼロ値で誤って有効にしないためです。決定が表すのは意図だけです。OP がリフレッシュトークンを発行するのは、provider が `refresh_token` を提供していて、クライアントがその grant に登録されていて、レスポンスの subject と scope が空でなく、audience が 1 つ以下のときです。条件を満たさなければ、アクセストークンの応答は成功したままリフレッシュトークンだけが省かれ、理由が `custom_grant.refresh_dropped` に記録されます。条件を満たせば、OP は自分のリフレッシュトークンストアにトークンを作成し、発行したアクセストークンと同じ grant の下に置き、DPoP / mTLS の binding も同じにします。`token_exchange.refresh_issued` が記録されるのは、リフレッシュトークンが実際に発行されたときだけです。

## 監査シグナルのペアリング

すべての交換の試行は、パースと検証より前、ハンドラに入った時点で `token_exchange.requested` を記録します。成功した交換は、発行が済んだ時点で `token_exchange.granted` を記録します。その後の発行処理が失敗した場合は、代わりに `custom_grant.failed` が記録されます。拒否された交換は、`requested` に加えて次のいずれかの失敗イベントを記録します。構造的に使えないリクエストも同様です。

- `policy_denied` / `policy_error` — ポリシーがエラーを返した
- `scope_inflation_blocked` — リクエストまたはポリシーが、`subject_token` の持つ範囲を超える scope を求めた
- `audience_blocked` — リクエストまたはポリシーが、許可された範囲外の audience を求めた
- `empty_scope_rejected` — scope が何も残らなかった
- `ttl_capped` — 発行する TTL が切り詰められた（情報としての記録で、拒否ではない）
- `act_chain_too_deep` — 入れ子の `act` チェーンが 5 段を超えた
- `actor_equals_subject` — actor の subject が `subject_token` の subject と同じだった
- `subject_token_invalid` / `subject_token_external` / `actor_token_external` — トークンの検証に失敗した、または別の issuer のものだった
- `subject_token_registry_error` — レジストリの参照が失敗した（一時的な障害など）。通信路上の応答は `invalid_grant` のまま
- `self_exchange` — 情報としての記録。上の `act` の表を参照

完全なリストは [監査イベントカタログ](/ja/reference/audit-events#token-exchange-rfc-8693) を参照してください。

## 動かしてみる

[`examples/33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation):

```sh
(cd examples/33-token-exchange-delegation && GOWORK=off go run -tags example .)
```

フロントエンドが認可コードフローで Alice のアクセストークンを取得します。service-a がそれを service-b 宛てのトークン（`act={sub: service-a}`、`actor_token` なし）に交換し、service-b の検証器が `act.sub` を読みます。チェーンを持たないトークンは拒否されます。ファイル: `op.go`(OP の組み立て + `TokenExchangePolicy`)、`service_a.go`(中継)、`service_b.go`(リソースサーバ)、`probe.go`(self-verify)。

## 続きはこちら

- [Token Exchange 入門](/ja/concepts/token-exchange) — なりすましと委譲の概念的背景
- [Custom Grant の組み込み](/ja/use-cases/custom-grant) — token exchange が使う URN ルーティングの差し込み口。他の URN のハンドラも同じ形で書く
- [送信者制約](/ja/concepts/sender-constraint) — `cnf` を交換リクエストの証明から作るのが正しい既定である理由
