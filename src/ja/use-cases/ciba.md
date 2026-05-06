---
title: CIBA poll mode — 組み込み
description: Client-Initiated Backchannel Authentication を有効化 — /bc-authorize、HintResolver、FAPI-CIBA プロファイル、組み込み側が所有する認証デバイス。
---

# ユースケース — CIBA（Client-Initiated Backchannel Authentication）

CIBA の概念的背景（何で、device flow とどう違い、なぜ `binding_message` が重要か）は [CIBA 入門](/ja/concepts/ciba) を先に読んでください。このページは組み込み手順を扱います。

::: details poll / ping / push 配信モードの違い
CIBA は OP が利用デバイスに「ユーザが承認したよ」と伝える方法を 3 つ定義しています。**poll** は利用デバイスが応答が来るまで `/token` を繰り返しポーリングする形(device-code と同じ)。**ping** は OP がクライアント登録済みの webhook に通知を送り、それを受けてクライアントが `/token` を polling する形。**push** は OP が発行済みトークンを直接クライアントの webhook に届ける形です。v0.9.1 は poll のみを実装しており、discovery のサポートリストもそれに揃えてあるので、クライアント側で他モードへネゴシエートできません。
:::

::: details `auth_req_id` とは
`/bc-authorize` が利用デバイスに返す不透明識別子です。CIBA における `device_code` 相当で、デバイスが内部に保持し `/token` への poll ごとに送信します。device-code と異なり、ユーザに見せる別途のコードはありません — ユーザの認証デバイスへ push 通知でプロンプトが直接届くので、利用デバイスは polling 用のハンドルだけ持っていれば十分です。
:::

::: details `binding_message` とは
利用デバイスが `/bc-authorize` に渡す短い人間可読な文字列で、OP が認証デバイスのプロンプトに転送します。レジの POS が「Acme Coffee で 800 円を承認、端末 #14」と表示し、ユーザのスマホの承認ダイアログにも同じ文字列が表示されます。これは「目の前の取引と本当に対応するプロンプトか」をユーザが判別する唯一のシグナルです — 無ければ、無関係な CIBA リクエストを発火させた phisher が、漠然とした「サインインを承認しますか?」ダイアログでユーザを欺けます。仕様上 optional でも、運用では必須として扱ってください。
:::

::: warning v0.9.1 では poll mode のみ
本ライブラリは **poll** 配信を実装します。push / ping 配信モードは v2+ で対応予定です。Discovery は `backchannel_token_delivery_modes_supported: ["poll"]` のみを広告するため、クライアント側からこれら 2 モードを negotiate することはできません。設計が push / ping を必要とするなら、このリリースの OP は適していません。
:::

## CIBA を有効化

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // CIBARequestStore サブストアを同梱
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithCIBA(
    op.WithCIBAHintResolver(myHintResolver),
    op.WithCIBAPollInterval(5 * time.Second),    // 任意。既定 5 秒
    op.WithCIBADefaultExpiresIn(10 * time.Minute), // 任意。既定 10 分
    op.WithCIBAMaxExpiresIn(15 * time.Minute),     // `requested_expiry` の上限（任意）
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

`op.WithCIBA(...)` がやること:

1. `/bc-authorize` を設定済 endpoint パスにマウント
2. CIBA URN（`urn:openid:params:grant-type:ciba`）を `/token` に登録
3. discovery に `backchannel_authentication_endpoint`、`backchannel_token_delivery_modes_supported: ["poll"]`、`backchannel_user_code_parameter_supported: false`、`backchannel_authentication_request_signing_alg_values_supported` を出力

CIBA サブストア(`store.CIBARequestStore`)は必須。in-memory アダプタは同梱。SQL / Redis アダプタは v0.9.2 で着地します。`op.WithCIBA(...)` 経由でも `op.WithGrants(grant.CIBA, ...)` 経由でも、`op.New` は `Store.CIBARequests()` と `HintResolver` の両方が組み込まれていることを確認します — どちらが欠けていても構成エラーで起動を拒否します。

## `HintResolver` を実装する

CIBA では、承認以前に **どのユーザに push するか** を OP が知る必要があります。`op.WithCIBAHintResolver(...)` は必須で、これ無しで `WithCIBA` を呼ぶと `op.New` が失敗します:

::: details `login_hint` / `id_token_hint` / `login_hint_token` の違い
CIBA は利用デバイスがユーザを指名する方法を 3 つ用意しています。**`login_hint`** は組み込み側が解釈する自由形式の文字列で、メール、口座番号、ロイヤリティカード等が入ります。**`id_token_hint`** は過去発行の ID token で、OP が signature / issuer / audience / 有効期限を検証してからリゾルバに値を渡します。**`login_hint_token`** は信頼している上流システム（federation IdP、企業ディレクトリ等）が発行した署名付き JWT で、リゾルバ側で登録済みの鍵を使って署名検証してから `sub` を読み取ります。OP が inbound リクエストを適切な `HintKind` に振り分けるので、リゾルバ側は形ごとに分岐を 1 つ書くだけで済みます。
:::

::: details `HintResolver` とは
`/bc-authorize` ごとに OP が 1 度呼び出すインタフェースで、「組み込み側が考えるユーザの指名」を安定的な内部 `sub` に翻訳します。OP はこれを推測できません — ユーザテーブルは組み込み側ごとに異なるからです。`Resolve(ctx, kind, value)` は subject 文字列を返します(不明なら `op.ErrUnknownCIBAUser`、一過性の参照失敗なら `login_required`)。リクエストのホットパス上で動くため、リモートストアへの参照はローカルでキャッシュしてください。
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
        // value は過去発行の ID token。OP が signature + iss + aud + exp を
        // すでに検証済で Resolve を呼ぶ。sub を引き出す。
        return claimsSubject(value), nil
    case op.HintLoginHintToken:
        // value は信頼している別の上流システムが発行した署名付き JWT。
        // 登録済みの鍵で署名を検証し、`sub` claim を読み取る。
        return r.verifyLoginHintToken(ctx, value)
    }
    return "", op.ErrUnknownCIBAUser
}
```

::: warning Resolver はリクエストのホットパス上で動く
`Resolve` は `/bc-authorize` POST ごとに呼ばれます。バックエンドがリモートならローカルでキャッシュしてください — push 通知ごとにこの呼び出しを待ちます。
:::

ワンオフ / 関数的に使うなら `op.HintResolverFunc` で関数を `HintResolver` に変換できます。

## 認証デバイスのコールバック

OP はユーザのスマホへ push する channel 自体は所有しません — 組み込み側の通知サービスとユーザのアプリの協働です。ライブラリの面はサブストアです。ユーザのアプリが応答してきたら、組み込み側のコールバックハンドラが `CIBARequestStore.Approve`（または `Deny`）を **`op.WithStore` に渡したのと同じストア参照** に対して直接呼びます。`provider.Store()` のようなアクセサは存在しません。OP はストアを再公開せず、組み込み側で参照を保持しておく前提です。

```go
// st は op.WithStore(st) に渡したのと同じストア。組み込み側で
// 参照を保持しておく前提で、provider.Store() のようなアクセサは存在しない。
func handleApproval(w http.ResponseWriter, r *http.Request, st *inmem.Store) {
    authReqID := r.FormValue("auth_req_id")
    decision  := r.FormValue("decision") // "approve" または "deny"
    sub       := mustExtractSubFromAppSession(r)

    switch decision {
    case "approve":
        // authTime はユーザが authentication device 上で認証した壁時計時刻。
        // token endpoint が id_token.auth_time に stamp し（ゼロ値は claim を出さない）、
        // `RequireAuthTime` を登録したクライアントはこの値で gate を判定する。
        if err := st.CIBARequests().Approve(r.Context(), authReqID, sub, time.Now()); err != nil {
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

`/bc-authorize` POST のたびに利用デバイスから `binding_message` を渡します。OP がサブストアレコード経由で転送するので、認証デバイスの push がレジ係の見ている文字列と同じものを描画できます:

```sh
curl -s -u pos-terminal:<secret> \
  -d 'scope=openid profile' \
  -d 'login_hint=alice' \
  -d 'binding_message=Acme Coffee 800 円を承認、端末 #14' \
  https://op.example.com/oidc/bc-authorize
```

これがユーザにとって CIBA phishing への唯一の防衛線です。仕様上 optional ですが、組み込み側の UX では **必須** として扱ってください。

## RFC 8707 `resource=`

利用デバイスは `/bc-authorize` に `resource=<absolute URI>` を付けて、発行されるアクセストークンを resource server に固定できます。エンドポイントは `/authorize` / `/token` と同じゲートを適用します:

- 値は絶対 URI でなければなりません(RFC 8707 §2)。相対 URI は `400 invalid_target` で拒否されます。
- 正規化後の値(scheme + host を小文字化、末尾 `/` 除去)はクライアントの `Resources` allowlist に含まれている必要があります。クライアントに登録されていない resource を要求すると `400 invalid_target` で拒否されます。
- `resource=` を複数指定すると `400 invalid_target` で拒否されます。CIBA の発行パイプラインは現状単一 audience だけを encode するため、複数 audience 対応は今後の課題です。

::: warning v0.9.x 以前は `/bc-authorize` でも未登録 resource を黙って受け付けていました
旧バージョンは `resource=` が絶対 URI として parse できることだけを確認していました。寛容な挙動に依存していた組み込み側は、クライアントの `Resources` allowlist にその値を追加するか、`resource=` を送らないようにしてください。
:::

## CIBA id_token の `amr` と `acr`

CIBA フロー終端で発行される id_token は、`ACRValues[0]`(非空のとき)を `acr` に stamp するので、RP は要求された認証コンテキストクラスを参照できます。**`amr` は v0.9.x では入りません** — 旧版は要求された `acr_values` をそのまま `amr` に複製していましたが、これはユーザの認証デバイスが実際に満たした認証手段を誤って表現する挙動でした。OIDC Core §2 は `acr` と `amr` を別概念として定義しており同義ではありません。v0.9.x の CIBARequest サブストアにはまだ実際の認証手段の signal が入っていません。

CIBA id_token の `amr` を読んでいる RP は、実値を提供するサブストア拡張が入るまで、空 / 不在として扱ってください。

## FAPI-CIBA プロファイル

`op.WithProfile(profile.FAPICIBA)` は v0.9.1 でプレースホルダから強制適用に昇格しました。有効化すると以下の項目が固定されます:

- `RequiredFeatures` = `[JAR]` — `/bc-authorize` リクエストは JWT-Secured（RFC 9101）必須
- `RequiredAnyOf` = `[[DPoP, MTLS]]` — sender constraint 必須
- `MaxAccessTokenTTL` = 10 分
- クライアント認証 = `private_key_jwt` / `tls_client_auth` / `self_signed_tls_client_auth`（FAPI 2.0 セット。`client_secret_basic` は拒否）
- `RequiresAccessTokenRevocation` = true
- `/bc-authorize` の JAR 強制: `iss` / `aud` / `exp` / `nbf` 必須、request-object 寿命は 60 分上限(FAPI 2.0 Message Signing §5.6)
- `requested_expiry > 600s` はハードエラー `invalid_request`(FAPI-CIBA-ID1 §5 / FAPI 2.0 §3.1.9 の 10 分上限)。プロファイル無効時の素の CIBA は黙って上限へクランプする挙動のまま

`op.WithACRValuesSupported(...)` が非空のとき、エンドポイントは要求された `acr_values` の各エントリを公開済みリストに対して検証します。空リストの場合は従来どおり緩い受理(permissive)のままです。

## Polling 応答

device-code grant と同じ形:

| 通信路上の応答 | 意味 |
|---|---|
| `400 authorization_pending` | ユーザがまだ承認していない。交渉済 interval 後に再 poll |
| `400 slow_down` | poll が速すぎた。引き上げられた interval を honor（サーバが永続化） |
| `400 access_denied` | ユーザが拒否（または管理者が revoke）。poll を停止 |
| `400 expired_token` | `auth_req_id` が寿命を超えた。poll を停止 |
| `200 { access_token, ... }` | 承認 |

poll の頻度が交渉済みの interval を大きく下回り続けると `ciba.poll_abuse.lockout` 監査イベントが発火し、リクエストはロックアウトされます。

## 動かしてみる

[`examples/31-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-ciba-pos):

```sh
go run -tags example ./examples/31-ciba-pos
```

POS 端末が `/bc-authorize` に POST し、スタッフのスマホ役の goroutine が `CIBARequestStore.Approve` を直接呼び、POS が token 発行まで poll します。end-to-end で約 5 秒。ファイル: `op.go`（OP の組み立て + `HintResolver`）、`rp.go`（POS 側 polling）、`device.go`（スマホ承認シミュレーション）。

## 続きはこちら

- [CIBA 入門](/ja/concepts/ciba) — 概念的背景
- [Device Code の組み込み](/ja/use-cases/device-code) — ユーザが見ている利用面に画面とコードがある場合
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — FAPI-CIBA が継承する親プロファイル
