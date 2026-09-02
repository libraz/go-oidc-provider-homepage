---
title: CIBA ポーリング方式 — 組み込み
description: CIBA の poll 方式を有効化 — /bc-authorize、検証済み subject を受け取る HintResolver、FAPI-CIBA 制約、組み込み側の認証デバイス承認。
pageClass: pg-use-cases-ciba
---

# 使い方 — CIBA（Client-Initiated Backchannel Authentication）

CIBA の概念的背景（何で、device flow とどう違い、なぜ `binding_message` が重要か）は [CIBA 入門](/ja/concepts/ciba) を先に読んでください。このページは組み込み手順を扱います。

<figure class="fig">
  <div class="fig-head">3 者の関係と、あいだにあるもの</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-ciba-title" viewBox="0 0 960 262" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-ciba-title">利用デバイスが OP に認可の開始を依頼し、組み込み側の通知サービスが登録済みのスマホへ届け、ユーザがそこで承認し、利用デバイスは判定が出るまでトークンエンドポイントを poll します。</title>
    <rect class="fg-box" x="36" y="84" width="220" height="80" rx="8"/>
    <text class="fg-t2" x="146" y="114" text-anchor="middle">利用デバイス</text>
    <text class="fg-xs" x="146" y="136" text-anchor="middle">POS · 共用端末</text>
    <text class="fg-xs" x="146" y="152" text-anchor="middle">ユーザが信頼できる画面が無い</text>
    <rect class="fg-box fg-box--accent" x="320" y="54" width="320" height="140" rx="8"/>
    <text class="fg-t fg-accent" x="480" y="82" text-anchor="middle">OP</text>
    <line class="fg-rule" x1="340" y1="94" x2="620" y2="94"/>
    <text class="fg-mxs" x="340" y="120">/bc-authorize</text>
    <text class="fg-xs" x="470" y="120">リクエストを開始する</text>
    <text class="fg-mxs" x="340" y="146">CIBARequestStore</text>
    <text class="fg-xs" x="490" y="146">判定が出るまで保持する</text>
    <text class="fg-mxs" x="340" y="172">/token</text>
    <text class="fg-xs" x="470" y="172">poll に応答する</text>
    <rect class="fg-box" x="704" y="84" width="220" height="80" rx="8"/>
    <text class="fg-t2" x="814" y="114" text-anchor="middle">認証デバイス</text>
    <text class="fg-xs" x="814" y="136" text-anchor="middle">ユーザのスマホアプリ</text>
    <text class="fg-xs" x="814" y="152" text-anchor="middle">事前に登録済み</text>
    <path class="fg-edge" d="M260,104 H316" marker-end="url(#fg-a)"/>
    <circle class="fg-badge" cx="288" cy="90" r="8.5"/>
    <text class="fg-badge-t" x="288" y="93" text-anchor="middle">1</text>
    <path class="fg-edge" d="M644,104 H700" marker-end="url(#fg-a)"/>
    <circle class="fg-badge" cx="672" cy="90" r="8.5"/>
    <text class="fg-badge-t" x="672" y="93" text-anchor="middle">2</text>
    <path class="fg-edge" d="M700,144 H648" marker-end="url(#fg-a)"/>
    <circle class="fg-badge" cx="672" cy="158" r="8.5"/>
    <text class="fg-badge-t" x="672" y="161" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--muted" d="M260,144 H316" marker-end="url(#fg-am)"/>
    <circle class="fg-badge" cx="288" cy="158" r="8.5"/>
    <text class="fg-badge-t" x="288" y="161" text-anchor="middle">4</text>
    <text class="fg-xs" x="36" y="216">1 · 端末が OP に認可の開始を依頼する</text>
    <text class="fg-xs" x="36" y="234">2 · 組み込み側の通知サービスが登録済みのスマホへ届ける</text>
    <text class="fg-xs" x="500" y="216">3 · ユーザが別チャネルで承認または拒否する</text>
    <text class="fg-xs" x="500" y="234">4 · 端末は判定が出るまで /token を poll する</text>
  </svg>
  <figcaption class="fig-note">用意が必要なのは手順 2 です。リクエストの保持と poll への応答は本ライブラリが担いますが、そのスマホに通知を届けるのは組み込み側の通知サービスの仕事で、OP の仕事ではありません。</figcaption>
</figure>

::: details 実装されている poll 配信
CIBA は poll、ping、push の 3 配信モードを定義していますが、本ライブラリが実装するのは **poll** だけです。利用デバイスが応答を受け取るまで `/token` を繰り返しポーリングします。discovery も `poll` だけを広告するため、クライアントは未実装のモードを交渉できません。
:::

::: details `auth_req_id` とは
`/bc-authorize` が利用デバイスに返す不透明識別子です。CIBA における `device_code` 相当で、デバイスが内部に保持し `/token` への poll ごとに送信します。device-code と異なり、ユーザに見せる別途のコードはありません。組み込み側の認証デバイスサービスが別経路で承認画面を表示するので、利用デバイスは polling 用のハンドルだけ持っていれば十分です。
:::

::: details `binding_message` とは
利用デバイスが `/bc-authorize` に渡す短い人間可読な文字列で、OP が認証デバイスの承認画面に転送します。レジの POS が「Acme Coffee で 800 円を承認、端末 #14」と表示し、ユーザのスマホの承認ダイアログにも同じ文字列が表示されます。これは「目の前の取引と本当に対応する承認画面か」をユーザが判別する唯一の手がかりです。無ければ、無関係な CIBA リクエストを発火させた攻撃者が、漠然とした「サインインを承認しますか?」ダイアログでユーザを欺けます。仕様上は任意でも、運用では必須として扱ってください。
:::

::: warning poll 配信のみ
本ライブラリは **poll** 配信だけを実装します。Discovery は `backchannel_token_delivery_modes_supported: ["poll"]` のみを広告します。この OP は ping や push の配信を提供しません。
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

  op.WithGrants(grant.CIBA),
  op.WithCIBA(
    op.WithCIBAHintResolver(myHintResolver),
    op.WithCIBAPollInterval(5 * time.Second),       // 任意。既定 5 秒
    op.WithCIBADefaultExpiresIn(10 * time.Minute),  // 任意。既定 10 分
    op.WithCIBAMaxExpiresIn(15 * time.Minute),      // `requested_expiry` の上限(任意)
    op.WithCIBAMaxPollViolations(8),                // 任意。既定 5 ストライクを引き上げる
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

CIBA サブストア（`store.CIBARequestStore`）は必須です。in-memory と SQL の両アダプタが同梱しています — SQL アダプタは sqlite / mysql / postgres で `oidc_ciba_requests` テーブルに永続化します。Redis アダプタはこのサブストアに `nil` を返すため、Redis のみの構成では composite アダプタで `CIBARequests` を durable な層（SQL か in-memory）にルーティングしてください。`op.WithCIBA(...)` 経由でも `op.WithGrants(grant.CIBA, ...)` 経由でも、`op.New` は `Store.CIBARequests()` と `HintResolver` の両方が組み込まれていることを確認します。どちらが欠けていても構成エラーで起動を拒否します。

## `HintResolver` を実装する

CIBA では、承認以前に **どのユーザを承認サービスの対象にするか** を OP が知る必要があります。`op.WithCIBAHintResolver(...)` は必須で、これ無しで `WithCIBA` を呼ぶと `op.New` が失敗します:

::: details `login_hint` / `id_token_hint` / `login_hint_token` の違い
CIBA は利用デバイスがユーザを指名する方法を 3 つ用意しています。**`login_hint`** は組み込み側が解釈する自由形式の文字列で、メール、口座番号、ロイヤリティカード等が入ります。**`id_token_hint`** は過去発行の ID トークンで、OP が自分の鍵に対する署名、issuer、認証済みクライアントの audience を検証してから、検証済みの `sub` だけを resolver に渡します。CIBA では hint の exp を意図的に検証しません。pairwise クライアントは resolver の前に拒否されるため、`login_hint` または `login_hint_token` を使ってください。**`login_hint_token`** は信頼している上流システム（federation IdP、企業ディレクトリ等）が発行した署名付き JWT で、resolver 側でそのシステムの契約に従って署名、issuer、audience を検証し、subject にマップします。resolver は raw `id_token_hint` JWT を parse してはなりません。
:::

::: details `HintResolver` とは
`/bc-authorize` ごとに OP が 1 度呼び出すインターフェースで、「組み込み側が考えるユーザの指名」を安定的な内部 `sub` に翻訳します。OP はこれを推測できません。ユーザテーブルは組み込み側ごとに異なるからです。`Resolve(ctx, kind, value)` は subject 文字列を返します（不明なら `op.ErrUnknownCIBAUser`、一過性の参照失敗なら `login_required`）。リクエスト処理中に必ず呼ばれるため、リモートストアへの参照はローカルでキャッシュしてください。
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

ワンオフ / 関数的に使うなら `op.HintResolverFunc` で関数を `HintResolver` に変換できます。

## 認証デバイスのコールバック

OP はユーザのスマホへ通知する経路自体は所有しません。そこは組み込み側の通知サービスとユーザのアプリの協働です。ライブラリが提供する接点はサブストアです。ユーザのアプリが応答してきたら、組み込み側のコールバックハンドラが `CIBARequestStore.Approve`（または `Deny`）を **`op.WithStore` に渡したのと同じストア参照**に対して直接呼びます。`provider.Store()` のようなアクセサは存在しません。OP はストアを再公開せず、組み込み側で参照を保持しておく前提です。

```go
// st は op.WithStore(st) に渡したのと同じストア。組み込み側で
// 参照を保持しておく前提で、provider.Store() のようなアクセサは存在しない。
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

利用デバイスからの次の `/token` poll が成功（または `access_denied` を返却）します。

## binding_message

`/bc-authorize` POST のたびに利用デバイスから `binding_message` を渡します。OP がサブストアレコード経由で転送するので、組み込み側の認証デバイス通知がレジ係の見ている文字列と同じものを描画できます:

```sh
curl -s -u pos-terminal:<secret> \
  -d 'scope=openid profile' \
  -d 'login_hint=alice' \
  -d 'binding_message=Acme Coffee 800 円を承認、端末 #14' \
  https://op.example.com/oidc/bc-authorize
```

これがユーザにとって CIBA phishing への唯一の防衛線です。仕様上 optional ですが、組み込み側の UX では **必須** として扱ってください。

OP は `binding_message` を検証（trim 後の長さと制御文字チェック）し、HTML escape 済みではなく raw 値として永続化します。認証デバイス UI で描画するときに escape してください。`/bc-authorize` に送る前に事前 escape すると、`&`、`<`、`>`、`"`、`'` を含む取引文言がレジ側表示と一致しなくなります。

`scope` については、クライアントが送るべき仕様準拠の ASCII space 区切りをそのまま受け付け、lenient な CIBA クライアント向けに Unicode whitespace も `strings.Fields` で分割します。ただし、tab や改行をエンドポイント横断の互換性前提にしないでください。`/auth` と `/par` はより厳格な wire grammar を維持します（`/oidc` に mount した場合は `/oidc/auth` です）。

## RFC 8707 `resource=`

利用デバイスは `/bc-authorize` に `resource=<absolute URI>` を付けて、発行されるアクセストークンを resource server に固定できます。エンドポイントは `/auth` / `/token` と同じ判定を適用します:

- 値は絶対 URI でなければなりません（RFC 8707 §2）。相対 URI は `400 invalid_target` で拒否されます。
- 正規化後の値（scheme + host を小文字化、末尾 `/` 除去）はクライアントの `Resources` 許可リストに含まれている必要があります。クライアントに登録されていない resource を要求すると `400 invalid_target` で拒否されます。
- `resource=` を複数指定すると `400 invalid_target` で拒否されます。CIBA 発行パイプラインは audience を 1 つだけ受け付け、複数値を黙って切り捨てません。

::: warning `resource=` は登録済みである必要があります
`resource=` は絶対 URI で、かつクライアントの `Resources` 許可リストに含まれている必要があります。許可リスト外の値は `invalid_target` で拒否されます。
:::

## sender-constrained な CIBA request

DPoP または mTLS を使う場合、`/bc-authorize` は DPoP 鍵の thumbprint と mTLS 証明書の thumbprint を record に保存します。`/token` では発行前に、record に存在する binding をすべて再検証します。両方を持つ CIBA request には、一致する DPoP proof と mTLS 証明書の両方が必要で、片方だけでは `auth_req_id` を redeem できません。proof が無い、または一致しない場合は redemption に失敗します。成功時に発行する token の `cnf` には、OP が再検証したすべての binding を反映します。

## CIBA id_token の `amr` と `acr`

CIBA フロー終端で発行される id_token の `acr` は、認証デバイスが実際に満たした ACR ── 組み込み側のコールバックが `CIBARequestStore.Approve` の `acr` 引数として渡す値 ── をそのまま反映します。要求された `acr_values` から決まるわけではなく、コールバックが `""` を渡した場合は空になります。これは比較可能な ACR 語彙を持たない配備環境で想定される挙動です。**`amr` は入りません**。CIBA request レコードには、ユーザの認証デバイスが実際に満たした認証手段の signal がまだ無いためです。OIDC Core §2 は `acr` と `amr` を別概念として定義しており同義ではありません。

CIBA id_token の `amr` を読む RP は、claim を空 / 不在として扱ってください。現在の CIBA request レコードには、検証済みの認証手段 signal がありません。

## FAPI-CIBA プロファイル

`op.WithProfile(profile.FAPICIBA)` を有効化すると以下の項目が固定されます:

- `RequiredFeatures` = `[JAR]` — `/bc-authorize` リクエストは JWT-Secured(RFC 9101)必須
- `RequiredAnyOf` = `[[DPoP, MTLS]]` — sender constraint 必須。mTLS が明示されていない場合は DPoP が既定選択される
- `MaxAccessTokenTTL` = 10 分
- クライアント認証 = `private_key_jwt`（`client_secret_basic` は拒否）。`feature.MTLS` を構成した場合、mTLS は送信者制約要件を満たせますが、`/token` のクライアント認証方式にはなりません。
- `RequiresAccessTokenRevocation` = true
- `/bc-authorize` の JAR 強制: `iss` / `aud` / `exp` / `nbf` / `iat` / `jti` をすべて必須、request-object 寿命は 60 分上限（FAPI 2.0 Message Signing §5.6）。FAPI 2.0 Baseline / Message Signing では `jti` は任意のままですが、FAPI-CIBA はより厳格な要件に戻ります。
- `requested_expiry > 600s` はハードエラー `invalid_request`(FAPI-CIBA-ID1 §5 / FAPI 2.0 §3.1.9 の 10 分上限)。プロファイル無効時の素の CIBA は黙って上限へクランプする挙動のまま
- `/bc-authorize` で発生したあらゆる JAR 失敗（署名不一致、未サポート alg、必須 claim 欠如、`request_uri` 取得失敗、…）は CIBA Core §13 に従って `400 invalid_request` にマップされます。素の `/auth` の JAR 経路はより細かいエラー語彙を保持しますが、CIBA は仕様上 back-channel 側に細分化の余地がないため、ここで畳み込みます。

`op.WithACRValuesSupported(...)` が非空のとき、エンドポイントは要求された `acr_values` の各エントリを公開済みリストに対して検証します。空リストの場合は従来どおり緩い受理（permissive）のままです。

## Polling 応答

device-code grant と同じ形:

| 通信路上の応答 | 意味 |
|---|---|
| `400 authorization_pending` | ユーザがまだ承認していない。交渉済 interval 後に再 poll |
| `400 slow_down` | poll が速すぎた。引き上げられた interval に従う（サーバが永続化） |
| `400 access_denied` | ユーザが拒否、管理者が失効させた、または poll-abuse 上限（`WithCIBAMaxPollViolations`、既定 5）に達してロックアウト。poll を停止 |
| `400 expired_token` | `auth_req_id` が寿命を超えた（TTL 経過のみ — RFC 6749 §5.2 / CIBA Core §11）。poll を停止 |
| `400 invalid_grant` | `auth_req_id` は既に消費済み。grant は消滅しているため、同じハンドルで再試行しないこと |
| `200 { access_token, ... }` | 承認 |

OP は「交渉済み interval が経過する前に poll した」を `auth_req_id` に対するストライクとして数えます。ストライク数が上限（既定 5）に達すると、その後の poll はすべて `400 access_denied` を返し、`ciba.poll_abuse.lockout` 監査イベントが発火します。`op.WithCIBAMaxPollViolations(n uint8)` でこの上限を上下できます。プロファイル要件や conformance ハーネスが境界を強く検査するケースで余裕を持たせるために使います。`n=0` は本ライブラリの既定にフォールバックし、`n=255` は診断ビルド向けに実質的な無効化となります。

::: info `/bc-authorize` の単一値パラメータ重複
`client_id` / `login_hint` / `id_token_hint` / `login_hint_token` / `binding_message` / `requested_expiry` / `acr_values` / `scope` / `user_code` / `client_assertion` のいずれかが 2 回以上現れたリクエストは CIBA Core §13 に従い `400 invalid_request` で拒否します。RFC 8707 の `resource=` だけが正当に複数指定可能です。`/token`、`/end_session`、`/revoke` も対応する単一値パラメータに同じルールを適用します。
:::


## 動かしてみる

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos):

```sh
(cd examples/32-ciba-pos && GOWORK=off go run -tags example .)
```

POS 端末が `/bc-authorize` に POST し、スタッフのスマホ役の goroutine が `CIBARequestStore.Approve` を直接呼び、POS が token 発行まで poll します。end-to-end で約 5 秒。ファイル: `op.go`（OP の組み立て + `HintResolver`）、`rp.go`（POS 側 polling）、`device.go`（スマホ承認シミュレーション）。

## 続きはこちら

- [CIBA 入門](/ja/concepts/ciba) — 概念的背景
- [Device Code の組み込み](/ja/use-cases/device-code) — ユーザが見ている利用面に画面とコードがある場合
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — FAPI-CIBA が継承する親プロファイル
