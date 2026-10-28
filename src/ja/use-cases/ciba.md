---
title: CIBA ポーリング方式 — 組み込み
description: CIBA の poll 方式を有効化 — /bc-authorize、検証済み subject を受け取る HintResolver、FAPI-CIBA 制約、組み込み側の認証デバイス承認。
pageClass: pg-use-cases-ciba
---

# ユースケース — CIBA（Client-Initiated Backchannel Authentication）

CIBA は、クライアントがすでに誰だかわかっているユーザ（レジ係の端末、コールセンターのコンソールなど）について認証を開始し、ユーザ本人は自分のデバイス（多くはスマホアプリ）で承認する仕組みです。device flow との違いや、`binding_message` が重要な理由といった概念は、先に [CIBA 入門](/ja/concepts/ciba) を読んでください。このページは組み込み手順を扱います。

<figure class="fig">
  <div class="fig-head">承認は端末ではなく、ユーザのスマホで行う</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-ciba-title" viewBox="0 0 960 448" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-ciba-title">利用デバイスが OP に認可の開始を依頼し、組み込み側の通知サービスが登録済みのスマホへ届け、ユーザがそこで承認し、利用デバイスは判定が出るまでトークンエンドポイントを poll します。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="424"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="424"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="424"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">利用デバイス</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">POS · 共用端末</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">CIBARequestStore</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">認証デバイス</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">ユーザのスマホアプリ</text>
    <!-- terminal asks the OP to start -->
    <path class="fg-edge" d="M192,144 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="134" text-anchor="middle">POST /bc-authorize</text>
    <!-- your notification service reaches the phone -->
    <path class="fg-edge fg-edge--muted" d="M512,208 H824" marker-end="url(#fg-am)"/>
    <text class="fg-s" x="668" y="198" text-anchor="middle">組み込み側の通知サービス</text>
    <!-- user approves or denies out of band -->
    <path class="fg-edge" d="M824,272 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="262" text-anchor="middle">ユーザが承認または拒否</text>
    <!-- terminal polls until decided -->
    <path class="fg-edge" d="M192,352 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="318" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="352" y="340" text-anchor="middle">判定まで繰り返す</text>
    <!-- tokens once approved -->
    <path class="fg-edge fg-edge--accent" d="M512,424 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="352" y="414" text-anchor="middle">承認後にトークンを返す</text>
  </svg>
  <figcaption class="fig-note">用意が必要なのは通知を届ける部分です。リクエストの保持と poll への応答は本ライブラリが担いますが、そのスマホに通知を届けるのは組み込み側の通知サービスの仕事で、OP の仕事ではありません。</figcaption>
</figure>

::: details 実装されている poll 配信
CIBA は poll、ping、push の 3 つの配信モードを定義していますが、本ライブラリが実装するのは **poll** だけです。利用デバイスは、応答が得られるまで `/token` を繰り返し呼び出します。discovery も `poll` だけを広告するので、クライアントが未実装のモードを選ぶことはできません。
:::

::: details `auth_req_id` とは
`/bc-authorize` が利用デバイスに返す不透明な識別子です。CIBA における `device_code` に当たり、デバイスは外に出さず保持して、`/token` へのポーリングのたびに送ります。device flow と違ってユーザに見せるコードはありません。承認画面は組み込み側の通知サービスが別の経路で届けるので、利用デバイスに必要なのはポーリング用のハンドルだけです。
:::

::: details `binding_message` とは
利用デバイスが `/bc-authorize` に渡す短い文字列で、OP はリクエストと一緒に保存します。組み込み側の通知サービスが、これを認証デバイスに表示します。レジの POS が「Acme Coffee で 800 円を承認、端末 #14」と表示し、ユーザのスマホの承認ダイアログにも同じ文字列が出ます。ユーザにとっては、目の前の取引に対応した承認画面かどうかを見分ける唯一の手がかりです。これがないと、無関係な CIBA リクエストを起動した第三者が、漠然とした「サインインを承認しますか?」というダイアログで承認させられるおそれがあります。仕様では任意ですが、運用では必須として扱ってください。
:::

::: warning poll 配信のみ
本ライブラリが実装する配信方式は **poll** だけです。Discovery は `backchannel_token_delivery_modes_supported: ["poll"]` だけを広告します。クライアントが `client_notification_token` や `user_code` を送ると `400 invalid_request` になります。
:::

## CIBA を有効化

```go
import (
  "context"
  "time"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // CIBARequestStore サブストアを同梱
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  // grant.CIBA を挙げると、既定の {authorization_code, refresh_token} は
  // 外れます。利用デバイスはブラウザを開かないためです。
  op.WithGrants(grant.CIBA),
  op.WithCIBA(
    op.WithCIBAHintResolver(myHintResolver),
    op.WithCIBAPollInterval(5 * time.Second),       // 任意。既定 5 秒
    op.WithCIBADefaultExpiresIn(10 * time.Minute),  // 任意。既定 10 分
    op.WithCIBAMaxExpiresIn(15 * time.Minute),      // `requested_expiry` の上限(任意)
    op.WithCIBAMaxPollViolations(8),                // 任意。既定は 5
  ),

  op.WithStaticClients(op.ConfidentialClient{
    ID:         "pos-terminal",
    Secret:     posSecret,
    AuthMethod: op.AuthClientSecretBasic, // FAPI-CIBA では private_key_jwt に
    GrantTypes: []string{"urn:openid:params:grant-type:ciba"},
    Scopes:     []string{"openid", "profile"},
  }),
)
```

`op.WithCIBA(...)` が行うこと:

1. `/bc-authorize` を設定済みのパスに公開
2. CIBA URN（`urn:openid:params:grant-type:ciba`）を `/token` に登録
3. discovery に `backchannel_authentication_endpoint`、`backchannel_token_delivery_modes_supported: ["poll"]`、`backchannel_user_code_parameter_supported: false` を出力。JAR も有効な場合は `backchannel_authentication_request_signing_alg_values_supported` も出力

CIBA サブストア（`store.CIBARequestStore`）は必須です。in-memory、SQL、DynamoDB の各アダプタが同梱しており、SQL アダプタは sqlite / mysql / postgres の `oidc_ciba_requests` テーブルに永続化します。Redis アダプタはこのサブストアに `nil` を返すため、Redis を使う構成では composite アダプタで `CIBARequests` を永続的な層（SQL か in-memory）に振り分けてください。`op.WithCIBA(...)` で有効にしても `op.WithGrants(grant.CIBA, ...)` で有効にしても、`op.New` は `Store.CIBARequests()` と `HintResolver` の両方を必須とします。

`op.New` は、負の `WithCIBADefaultExpiresIn` や `WithCIBAPollInterval`、`WithCIBAMaxExpiresIn` を超える `WithCIBADefaultExpiresIn`、そして `profile.FAPICIBA` の下で 10 分を超える既定値や上限値も拒否します。0 は「ライブラリの既定値を使う」の意味です（600 秒と 5 秒）。

## `HintResolver` を実装する

CIBA では、承認以前に **どのユーザを承認サービスの対象にするか** を OP が知る必要があります。`op.WithCIBAHintResolver(...)` は必須で、これ無しで `WithCIBA` を呼ぶと `op.New` が失敗します:

::: details `login_hint` / `id_token_hint` / `login_hint_token` の違い
CIBA は利用デバイスがユーザを指名する方法を 3 つ用意しています。**`login_hint`** は組み込み側が解釈する自由形式の文字列で、メール、口座番号、ロイヤリティカード等が入ります。**`id_token_hint`** は過去に発行した ID トークンです。OP は、OP 自身の鍵に対する署名、issuer、`typ` ヘッダ（ログアウトトークンやアクセストークンは拒否）、audience が認証済みのクライアントであることを検証し、検証済みの `sub` だけを resolver に渡します。端末は、ずっと前に終わったセッションの ID トークンを持っていて当然なので、hint の有効期限は検証しません。pairwise のクライアントは resolver に届く前に拒否されます。そのクライアントには `login_hint` か `login_hint_token` を使ってください。**`login_hint_token`** は信頼している上流システム（federation IdP、企業ディレクトリ等）が発行した署名付き JWT で、resolver 側でそのシステムの契約に従って署名、issuer、audience を検証し、subject にマップします。resolver は raw `id_token_hint` JWT を parse してはなりません。
:::

::: details `HintResolver` とは
`/bc-authorize` ごとに OP が 1 度呼び出すインターフェースで、組み込み側がユーザを指す識別子を、安定した内部の `sub` に変換します。ユーザテーブルは配備ごとに異なるので、OP 自身にはできません。`Resolve(ctx, kind, value)` は subject の文字列を返します。ユーザが存在しなければ `op.ErrUnknownCIBAUser`（通信路上は `unknown_user_id`）、検索自体が失敗したらそのほかのエラー（通信路上は `login_required`）を返します。空の subject も `login_required` になります。
:::

```go
type myHintResolver struct{ /* db handle */ }

func (r *myHintResolver) Resolve(ctx context.Context, kind op.HintKind, value string) (string, error) {
    switch kind {
    case op.HintLoginHint:
        // value = "alice@example.com"、口座番号、ロイヤリティカード等
        sub, err := r.lookupBy(ctx, value)
        if errors.Is(err, sql.ErrNoRows) {
            return "", op.ErrUnknownCIBAUser // → 通信路上の応答: unknown_user_id
        }
        if err != nil {
            return "", err // → 通信路上の応答: login_required
        }
        return sub, nil
    case op.HintIDTokenHint:
        // value は OP が検証した id_token_hint の subject であり、JWT ではない。
        // OP は signature + iss + aud を検証するが、exp は意図的に検証しない。
        return lookupSubject(ctx, value)
    case op.HintLoginHintToken:
        // value は信頼している別の上流システムが発行した署名付き JWT。
        // 登録済みの鍵で署名を検証し、`sub` claim を読み取る。
        return r.verifyLoginHintToken(ctx, value)
    }
    return "", op.ErrUnknownCIBAUser
}
```

::: warning Resolver はリクエスト処理中に毎回呼ばれる
`Resolve` は `/bc-authorize` POST ごとに呼ばれます。バックエンドがリモートならローカルでキャッシュしてください。承認通知の経路はこの呼び出しを待ちます。
:::

`op.HintResolverFunc` を使うと、関数をそのまま `HintResolver` にできます。

## 認証デバイスのコールバック

ユーザのスマホに通知を届ける経路は、OP の担当ではありません。組み込み側の通知サービスとユーザのアプリの間の仕事です。ライブラリが用意する接点はサブストアです。ユーザのアプリから応答が返ったら、組み込み側のコールバックハンドラが、**`op.WithStore` に渡したのと同じストア**（`*inmem.Store` などのアダプタ）に対して `CIBARequestStore.Approve`（または `Deny`）を呼びます。OP は自分のストアを外に公開しないので、参照は自分で保持してください。

```go
// st は op.WithStore(st) に渡したのと同じストア。OP はストアを公開しない
// ので、組み込み側で参照を保持しておく。
func handleApproval(w http.ResponseWriter, r *http.Request, st *inmem.Store) {
    authReqID := r.FormValue("auth_req_id")
    decision  := r.FormValue("decision") // "approve" または "deny"
    sub       := mustExtractSubFromAppSession(r)

    switch decision {
    case "approve":
        // acr は認証デバイスが実際に満たした Authentication Context Class
        // Reference。token endpoint はこの値をそのまま id_token.acr に入れる。
        // 利用デバイスが /bc-authorize で要求した acr_values とは独立していて、
        // ACR の語彙を持たない配備環境では "" のままでよい。
        // authTime はユーザが authentication device 上で認証した壁時計時刻。
        // token endpoint が id_token.auth_time に入れ（ゼロ値は claim を出さない）、
        // `RequireAuthTime` を登録したクライアントはこの値で判定する。
        acr := "" // または認証デバイスが満たした ACR
        if err := st.CIBARequests().Approve(r.Context(), authReqID, sub, acr, time.Now()); err != nil {
            http.Error(w, "approve failed", 500)
            return
        }
    case "deny":
        if err := st.CIBARequests().Deny(r.Context(), authReqID, "user_denied"); err != nil {
            http.Error(w, "deny failed", 500)
            return
        }
    }
    w.WriteHeader(204)
}
```

利用デバイスからの次の `/token` ポーリングは成功します。拒否した場合は `access_denied` を返します。`Approve` に渡す subject は `HintResolver` が返したものと同じで、かつユーザストアに存在している必要があります。トークンエンドポイントが、引き換えのたびに確認するためです。

## binding_message

利用デバイスは、`/bc-authorize` へのリクエストごとに `binding_message` を送ります。OP はそれをリクエストのレコード（`CIBARequest.BindingMessage`）に保存するので、組み込み側の通知サービスは、レジ係が見ているのと同じ文字列を認証デバイスに表示できます。

```sh
curl -s -u pos-terminal:<secret> \
  -d 'scope=openid profile' \
  -d 'login_hint=alice' \
  -d 'binding_message=Acme Coffee 800 円を承認、端末 #14' \
  https://op.example.com/oidc/bc-authorize
```

OP は値を trim し、50 文字を超える値や制御文字を含む値は `400 invalid_binding_message` で拒否します。保存するのは HTML エスケープ済みの値ではなく、そのままの文字列です。認証デバイスの UI に表示するときにエスケープしてください。`/bc-authorize` に送る前にエスケープすると、`&`、`<`、`>`、`"`、`'` を含む取引の文言が、レジ側の表示と一致しなくなります。

`scope` は必須で、`openid` を含める必要があります。`/bc-authorize` は、寛容なクライアントのために任意の Unicode 空白で分割しますが、タブや改行には頼らないでください。`/auth` と `/par` はスペース区切りしか受け付けません（`/oidc` にマウントした場合は `/oidc/auth` です）。

リクエストが成功すると、`auth_req_id`、`expires_in`、`interval` が返ります。`login_hint`、`id_token_hint`、`login_hint_token` は、ちょうど 1 つだけ指定します。

## RFC 8707 `resource=`

利用デバイスは `/bc-authorize` に `resource=<absolute URI>` を付けて、発行されるアクセストークンを特定のリソースサーバに固定できます。エンドポイントは `/auth`、`/token` と同じ規則を適用します。

- 値は絶対 URI でなければなりません（RFC 8707 §2）。相対 URI は `400 invalid_target` で拒否されます。
- 正規化後の値（scheme と host を小文字にし、末尾の `/` を除いたもの）がクライアントの `Resources` 許可リストに含まれている必要があります。クライアントに未登録の resource は `400 invalid_target` で拒否されます。
- 空でない `resource=` を複数指定すると `400 invalid_target` で拒否されます。CIBA のリクエストが持てる audience は 1 つだけで、OP は残りを黙って捨てないためです。

利用デバイスが要求しうるリソースサーバの URI は、あらかじめクライアントの `Resources` に登録しておきます。

## sender-constrained な CIBA request

DPoP や mTLS を使う場合、`/bc-authorize` は DPoP 鍵の thumbprint と mTLS 証明書の thumbprint をレコードに保存します。`/token` では、トークンを発行する前に、レコードにあるすべての binding を再検証します。両方の binding があるリクエストでは、一致する DPoP proof と mTLS 証明書の両方が必要で、片方だけでは足りません。proof がない、または一致しない場合、`auth_req_id` は引き換えできません（`400 invalid_grant`）。成功すると、発行されるトークンの `cnf` には OP が再検証したすべての binding が入ります。

## CIBA id_token の `amr` と `acr`

CIBA フローの最後に発行される id_token の `acr` には、認証デバイスが実際に満たした `acr` が入ります。これは、組み込み側のコールバックが `CIBARequestStore.Approve` の `acr` 引数に渡した値です。要求された `acr_values` から決まるわけではなく、コールバックが `""` を渡せば空になります（比較できる ACR の語彙がない配備では、これが想定する使い方です）。**`amr` は入りません**。CIBA のリクエストレコードには、検証済みの認証手段の情報がないためです。OIDC Core §2 は `acr` と `amr` を別の claim として定義しています。CIBA の id_token から `amr` を読む RP は、claim が存在しないものとして扱ってください。

引き換えが済んだリクエストについては、そのクライアントとユーザの同意の記録（grant）も作られます。このためトークンは introspection や `/userinfo` で subject を解決でき（pairwise のクライアントなら pairwise の値）、同じスコープでの次の `/auth` は同意画面を省略できます。

## FAPI-CIBA プロファイル

`op.WithProfile(profile.FAPICIBA)` を有効化すると以下の項目が固定されます:

- `RequiredFeatures` = `[JAR]` — `/bc-authorize` リクエストは JWT-Secured(RFC 9101)必須
- `RequiredGrants` = `[CIBA]` — CIBA grant が有効でなければ `op.New` は失敗します。プロファイルが自動で有効にすることはありません
- `RequiredAnyOf` = `[[DPoP, MTLS]]` — sender constraint 必須。mTLS が明示されていない場合は DPoP が既定選択される
- `MaxAccessTokenTTL` = 10 分
- クライアント認証 = `private_key_jwt`（`client_secret_basic` は拒否）。`feature.MTLS` を構成した場合、mTLS は送信者制約要件を満たせますが、`/token` のクライアント認証方式にはなりません。
- `RequiresAccessTokenRevocation` = true
- `/bc-authorize` の JAR 強制: `iss` / `aud` / `exp` / `nbf` / `iat` / `jti` をすべて必須にし、本ライブラリは `MaxRequestObjectAge` によりリクエストオブジェクトの `iat` からの経過時間にも 60 分の上限を適用します。これはライブラリの検証上限です。一方、FAPI-CIBA-ID1 §5.2.2 の 9 は署名付き認証リクエストの `nbf` / `exp` が示す有効期間を 60 分以内に制限します。この根拠は FAPI 2.0 Message Signing Final §5.6 ではありません。同仕様の同節は ID トークンの署名を扱います。FAPI 2.0 Baseline / Message Signing では `jti` は任意のままですが、FAPI-CIBA はより厳格な形を選びます。
- `requested_expiry > 600s` は、本ライブラリの FAPI-CIBA 設定では `invalid_request` になります。10 分の上限は旧 FAPI-CIBA-ID1 プロファイルとライブラリの制約によるもので、現行の FAPI 2.0 Security Profile の節番号ではありません。プロファイル無効時の CIBA では上限に丸めます。
- `/bc-authorize` での、クライアント側に原因がある JAR の失敗（署名の不一致、未対応の alg、必須 claim の欠落、`request_uri` の取得失敗など）は、CIBA Core §13 に従って `400 invalid_request` になります。CIBA Core §13 には、`/auth` の `invalid_request_object` のような細かいコードがないためです。クライアントの鍵を取得する OP 側の障害（JWKS の過負荷や一時的な失敗）は、代わりに `503 server_error` です。

`op.WithACRValuesSupported(...)` が空でない場合、エンドポイントは要求された `acr_values` の各要素を公開済みの一覧と照合し、未知の値には `400 invalid_request` を返します。一覧が空なら、どの値もそのまま受け付けます。

## Polling 応答

device-code grant と同じ形:

| 通信路上の応答 | 意味 |
|---|---|
| `400 authorization_pending` | ユーザがまだ承認していない。交渉済 interval 後に再 poll |
| `400 slow_down` | ポーリングが速すぎた。引き上げられた interval に従う（サーバが保存する） |
| `400 access_denied` | ユーザが拒否した、管理者が失効させた、または poll-abuse の上限（`WithCIBAMaxPollViolations`、既定 5）に達してロックされた。ポーリングを止める |
| `400 expired_token` | `auth_req_id` が寿命を超えた（TTL 経過のみ — RFC 6749 §5.2 / CIBA Core §11）。poll を停止 |
| `400 invalid_grant` | `auth_req_id` が引き換え済み、またはリクエストの DPoP / mTLS binding が欠けている・一致しない。同じハンドルで再試行しないこと |
| `200 { access_token, ... }` | 承認 |

OP は、取り決めた interval が過ぎる前に行われたポーリングを、その `auth_req_id` に対する違反として 1 回ずつ数えます。違反が上限（既定 5）に達するとリクエストはロックされ、以降のポーリングはすべて `400 access_denied` を返し、`ciba.poll_abuse.lockout` の監査イベントが記録されます。上限は `op.WithCIBAMaxPollViolations(n uint8)` で変えられます。`n=0` はライブラリの既定値、`n=255` は事実上ロックを無効にする値で、診断用のビルドにしか向きません。

::: info `/bc-authorize` の単一値パラメータ重複
`client_id` / `login_hint` / `id_token_hint` / `login_hint_token` / `binding_message` / `requested_expiry` / `acr_values` / `scope` / `user_code` / `client_assertion` のいずれかが 2 回以上現れたリクエストは、CIBA Core §13 に従い `400 invalid_request` で拒否します。複数指定できるのは `resource=`（RFC 8707）だけです。`/token`、`/end_session`、`/revoke` も、それぞれの単一値パラメータに同じ規則を適用します。
:::


## 動かしてみる

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos):

```sh
(cd examples/32-ciba-pos && GOWORK=off go run -tags example .)
```

POS 端末が `/bc-authorize` に POST し、スタッフのスマホ役の goroutine が `CIBARequestStore.Approve` を直接呼び、POS がトークンの発行までポーリングします。全体で約 5 秒です。ファイル: `op.go`（OP の組み立て + `HintResolver`）、`rp.go`（POS 側 polling）、`device.go`（スマホ承認シミュレーション）。

## 続きはこちら

- [CIBA 入門](/ja/concepts/ciba) — 概念的背景
- [Device Code の組み込み](/ja/use-cases/device-code) — ユーザの手元に、コードを打ち込める画面がある場合
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — FAPI-CIBA が継承する親プロファイル
