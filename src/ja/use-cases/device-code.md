---
title: Device Code（RFC 8628） — 組み込み
description: RFC 8628 device authorization を有効化 — /device_authorization、opaque attempt key による検証、polling、slow_down、組み込み側の承認ページ。
pageClass: pg-use-cases-device-code
---

# ユースケース — Device Code（RFC 8628）

device flow は、使いやすいキーボードやブラウザを持たない機器（TV、CLI、プリンタなど）が、ユーザの手元の別の端末で承認してもらうことでトークンを得る仕組みです。どんなときに選ぶのか、なぜ `slow_down` や `expired_token` があるのかといった概念は、先に [Device Code 入門](/ja/concepts/device-code) を読んでください。このページは組み込み手順を扱います。

<figure class="fig">
  <div class="fig-head">片方の画面に出たコードを、もう片方に打ち込む</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-devicecode-title" viewBox="0 0 960 616" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-devicecode-title">入力しづらいデバイスが OP に device_code と短い user_code を要求し、コードを画面に表示してトークンエンドポイントを poll します。ユーザはその画面のコードを読み取り、自分のスマホや PC で入力して承認し、次の poll でトークンが返ります。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="592"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="592"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="592"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">デバイス</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">TV · CLI · プリンタ</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">ユーザ自身の端末</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">スマホ · PC</text>
    <!-- ask -->
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">POST /device_authorization</text>
    <!-- codes -->
    <path class="fg-edge fg-edge--accent" d="M512,208 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="174" text-anchor="middle">200 OK</text>
    <text class="fg-mxs" x="352" y="196" text-anchor="middle">device_code · user_code · URL</text>
    <!-- show -->
    <path class="fg-edge" d="M192,256 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="262">user_code と URL を</text>
    <text class="fg-s" x="248" y="284">画面に表示する</text>
    <!-- human -->
    <path class="fg-edge fg-edge--muted" d="M192,352 H824" marker-end="url(#fg-am)"/>
    <text class="fg-s fg-halo" x="504" y="342" text-anchor="middle">人が画面のコードを読み、別の端末に打ち込む</text>
    <!-- approve -->
    <path class="fg-edge" d="M824,424 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="414" text-anchor="middle">コードを入力して承認する</text>
    <!-- poll -->
    <path class="fg-edge" d="M192,496 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="486" text-anchor="middle">POST /token · poll</text>
    <!-- tokens -->
    <path class="fg-edge fg-edge--accent" d="M512,568 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="352" y="558" text-anchor="middle">承認後にトークンを返す</text>
  </svg>
  <figcaption class="fig-note">破線はネットワークではなく人間です。この経路がフローに渡すのは短いコード 1 つだけで、推測されにくさよりも読みやすさと入力しやすさを優先して選ばれています。秘密として扱われるのは、デバイスが保持する <code>device_code</code> の側です。</figcaption>
</figure>

::: details `device_code` と `user_code` の違い
`/device_authorization` は 2 つの異なる識別子を返します。**`device_code`** は長い不透明文字列で、デバイス側だけが保持し、`/token` へのポーリングごとに送信します — 実質的に「この保留中の authorization」を表すベアラ資格情報です。**`user_code`** は短い人間が打てる文字列（"BDWP-HQPK" 等）で、デバイスが画面に表示し、ユーザがスマホやノート PC で入力します。寿命は同じ（`expires_in`）ですが、見せる相手が完全に異なります。ユーザは `device_code` を見ませんし、OP は `/token` で `user_code` を受け付けません。
:::

::: details `verification_uri` と `verification_uri_complete` の違い
**`verification_uri`** は素の URL で、ユーザが画面表示を見て自分で訪問し `user_code` を手で入力する経路です — スキャンできないユーザのために画面に表示します。**`verification_uri_complete`** は同じ URL に `user_code` をクエリパラメータとして埋め込んだもので、QR コード化に適しています。ユーザは何も打たずに済みます。どちらも組み込み側が所有する同じページに到達します。ページ側は `user_code` クエリパラメータがあれば自動入力し、無ければ手入力フォームを表示します。
:::

::: details `interval` とポーリングとは
RFC 8628 では、デバイスはユーザがスマホなどで承認するのを待つあいだ、`/token` を繰り返し呼び出します。`interval`（秒）は、OP が求めるポーリング間隔の最小値です。デバイスがそれより速く呼び出すと、OP は `slow_down` を返して保存済みの interval を引き上げます。新しい最小値はすべてのレプリカに適用されます。既定は 5 秒です。
:::

## grant を有効化

```go
import (
  "time"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // DeviceCodeStore サブストアを同梱
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  // grant.DeviceCode を挙げると、既定の {authorization_code, refresh_token} は
  // 外れます。デバイスにブラウザはないためです。WithDeviceCodeGrant は
  // /device_authorization を公開し、DeviceCodes サブストアを必須にします。
  op.WithGrants(grant.DeviceCode),
  op.WithDeviceCodeGrant(),
  op.WithDeviceCodeExpiry(10*time.Minute),       // 任意。既定 10 分
  op.WithDeviceCodePollInterval(5*time.Second), // 任意。既定 5 秒

  op.WithStaticClients(op.PublicClient{
    ID:           "tv-app",
    RedirectURIs: nil, // device-code クライアントは /auth に来ない
    GrantTypes:   []string{"urn:ietf:params:oauth:grant-type:device_code"},
    Scopes:       []string{"openid", "profile", "offline_access"},
  }),
)
```

`op.WithDeviceCodeGrant()` がやること:

1. `/device_authorization` を設定済 endpoint パスにマウント
2. device-code URN（`urn:ietf:params:oauth:grant-type:device_code`）を `/token` に登録
3. discovery 文書に `device_authorization_endpoint` を出し、`grant_types_supported` に URN を追加

device-code サブストア（`store.DeviceCodeStore`）は必須です。in-memory、SQL、DynamoDB の各アダプタが同梱しており、SQL アダプタは sqlite / mysql / postgres の `oidc_device_codes` テーブルに永続化します。Redis アダプタはこのサブストアに `nil` を返すため、Redis を使う構成では composite アダプタで `DeviceCodes` を永続的な層（SQL か in-memory）に振り分けてください。

::: warning サブストアの有無は op.New で検査
構成した store が `DeviceCodes()` に nil を返すと、`op.New` は構成エラーで失敗します。最初のポーリングで panic することはありません。`op.WithDeviceCodeGrant()` で有効にした場合も、`op.WithGrants(grant.DeviceCode, ...)` で有効にした場合も同じ検査が働きます。
:::

## verification ページ

`/device_authorization` は、ユーザが承認するページを指す `verification_uri` を返します。**このページをライブラリはホストしません**。理由は 2 つです。

1. **ブランドと UX**: ページは既存のサインイン UI の隣に置くのが自然です。
2. **不正対策**: レコード単位の総当たり制限、IP の rate limit、CAPTCHA、監査対応は、組み込み側の既存の不正対策に属します。

既定の URI は `<issuer>/device` です。verification ページが別の場所にあるなら、`op.WithDeviceVerificationURI("https://acme.com/connect")` で上書きします（絶対 URL が必要です）。

`expires_in` と `interval` には専用のオプション `op.WithDeviceCodeExpiry(...)` と `op.WithDeviceCodePollInterval(...)` があり、`op.WithAccessTokenTTL` とは独立しています。アクセストークンを 30 秒や 60 秒にしている構成でも、ユーザがスマホに移ってコードを入力し、承認するまでの 10 分を確保できます。

<figure class="fig">
  <div class="fig-head">device authorization レコードの状態と、遷移させる主体</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-dc-state-title" viewBox="0 0 960 456" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dc-state-title">device authorization は Pending で始まります。verification ページが Approved か Denied に遷移させ、総当たり制限も Denied に遷移させます。トークンのポーリングに成功すると Approved から Consumed になります。Revoke は Pending / Approved を Denied にし、expires_in を過ぎたレコードには expired_token を返します。</title>
    <rect class="fg-box fg-box--accent" x="32" y="32" width="288" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="60">Pending</text>
    <text class="fg-mxs" x="48" y="84">/device_authorization</text>
    <rect class="fg-box" x="32" y="176" width="288" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="204">Approved</text>
    <text class="fg-s" x="48" y="228">subject と auth_time を記録</text>
    <rect class="fg-box fg-box--sub" x="32" y="320" width="288" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="348">Consumed</text>
    <text class="fg-s" x="48" y="372">トークンは 1 回だけ発行</text>
    <rect class="fg-box fg-box--danger" x="544" y="176" width="288" height="72" rx="8"/>
    <text class="fg-t2" x="560" y="204">Denied</text>
    <text class="fg-s" x="560" y="228">ポーリングは access_denied</text>
    <!-- Pending to Approved -->
    <path class="fg-edge fg-edge--accent" d="M176,104 V176" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="188" y="144">ApproveUserCode</text>
    <!-- Approved to Consumed -->
    <path class="fg-edge" d="M176,248 V320" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="188" y="288">/token ポーリング成功</text>
    <!-- Pending to Denied -->
    <path class="fg-edge fg-edge--danger" d="M320,68 H688 V176" marker-end="url(#fg-ad)"/>
    <text class="fg-m" x="504" y="34" text-anchor="middle">DenyUserCode</text>
    <text class="fg-mxs" x="504" y="56" text-anchor="middle">ロックアウト · Revoke</text>
    <!-- Approved to Denied -->
    <path class="fg-edge fg-edge--danger" d="M320,212 H544" marker-end="url(#fg-ad)"/>
    <text class="fg-mxs" x="432" y="202" text-anchor="middle">Revoke</text>
    <!-- note -->
    <text class="fg-xs" x="32" y="432">expires_in を過ぎたレコードには expired_token を返します。</text>
  </svg>
  <figcaption class="fig-note">Pending から先の 2 つの遷移は、組み込み側のページが担当します。最後の遷移は OP の担当で、1 つのレコードにつき最大 1 回しか起きません。</figcaption>
</figure>

::: warning user_code は総当たりされうる
`user_code` は手で打てる長さでなければならないため、verification ページが試行回数を制限しないと推測されてしまいます。本ライブラリは [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) で、この制限を同梱しています。最初の手入力では、サーバ側の ceremony key（opaque な値）を渡して `VerifyUserCodeByAttemptKey` を呼び、認証と同意の後に `ApproveUserCode` を呼んでください。入力された `user_code` そのものを attempt key に使ってはいけません。
:::

### 提出された user_code を検証する

```go
import (
    "crypto/rand"
    "encoding/base64"
    "errors"
    "time"

    "github.com/libraz/go-oidc-provider/op/devicecodekit"
)

// deps は一度構築して保持し、すべての helper に同じ pointer を渡す。
// Deps は mutex 付き既定 limiter を持つため、使用後にコピーしてはならない。
deps := &devicecodekit.Deps{
    DeviceCodes:  st.DeviceCodes(),
    AuditLogger: auditLogger, // 任意。helper の監査レコードを受け取る
}

// attempt key は 1 つのサーバ側 ceremony（たとえば verification ページに
// サインインしたブラウザのセッション）を識別する値。ceremony の開始時に
// 1 度だけ作り、同じ ceremony の提出ではすべて再利用する。limiter はこの
// key に対して試行を数えるので、提出のたびに作り直すと、推測のたびに
// 新しい試行枠を与えることになる。opaque な値にし、ユーザが入力した
// user_code を使ってはならない。
var rawAttemptKey [32]byte
if _, err := rand.Read(rawAttemptKey[:]); err != nil { /* 500 として処理 */ }
attemptKey := base64.RawURLEncoding.EncodeToString(rawAttemptKey[:])
// ... attemptKey を ceremony のサーバ側セッションに保存する ...

matched, err := devicecodekit.VerifyUserCodeByAttemptKey(ctx, deps, attemptKey, submittedUserCode)
switch {
case err == nil && matched:
    // コード一致 — consent 画面へ進む
case errors.Is(err, devicecodekit.ErrAlreadyDecided):
    // レコードはすでに承認 / 拒否済。「使用済」と表示
case errors.Is(err, devicecodekit.ErrUnknownDeviceCode), errors.Is(err, devicecodekit.ErrAttemptLocked):
    // 不明 / malformed / 予算超過。どれかは表示しない
case errors.Is(err, devicecodekit.ErrAttemptLimiterSaturated):
    // 組み込みの limiter が有効な key で満杯。この key への判定ではなく
    // 過負荷の合図なので、少し待って再試行するよう案内する
default:
    // 想定外 — log して汎用エラーを返す
}

// 認証済みユーザが要求された scope に同意した後:
if matched {
    err = devicecodekit.ApproveUserCode(ctx, deps, submittedUserCode, approvedSubject, time.Now())
}
```

ヘルパは次のように動きます。

- 提出された文字列を **正規化** します（大文字小文字の統一、ハイフンの除去）。
- 保存値と **定数時間で比較** します。
- 正規化と検索の前に opaque な attempt key の試行枠を消費するので、形式の崩れた入力や存在しない入力も、同じ上限つきの枠を消費します。不一致のたびに、`Deps.AuditLogger` が設定されていれば `device_code.verification.user_code_brute_force` の監査イベントを出します。
- 組み込みの limiter はプロセス内に閉じていて、保持数に上限があります。OP を複数インスタンスで動かす場合は、`Deps.AttemptLimiter` に共有の atomic な `AttemptLimiter` を渡してください。読み取りと加算を別々に行う実装は安全ではありません。
- レコード単位のヘルパ（`VerifyUserCode`、`VerifyUserCodeByUserCode`）は、レコードごとの上限 `devicecodekit.MaxUserCodeStrikes`（5 回）をそのまま適用します。超えると、レコードは理由 `user_code_lockout` で Denied になります。

ユーザが打ち間違いではなく **拒否** を押した場合は、`devicecodekit.DenyUserCode(ctx, deps, submittedUserCode, devicecodekit.DenyReasonUserDenied)` を呼びます。device-code の id がわかっているなら `devicecodekit.Revoke` でも構いません。どちらも `Deps.AuditLogger` に監査イベントを出し、手入力の不一致としては数えません。

### 承認後

ユーザの認証と同意が済んだら、ハンドラは同じ `*devicecodekit.Deps` のポインタで `ApproveUserCode` を呼び、レコードを **Approved** にします。ストアが遷移を受理した後に、`device_code.verification.approved` を記録します。

```go
// `deps` は VerifyUserCodeByAttemptKey に渡した retained pointer。
// authTime はユーザが実際に認証した壁時計時刻。token endpoint が
// id_token.auth_time に記録し（ゼロ値は claim を出さない）、
// `RequireAuthTime` を登録したクライアントはこの値で可否を判定する。
err := devicecodekit.ApproveUserCode(ctx, deps, submittedUserCode, approvedSubject, time.Now())
```

デバイスからの次の `/token` ポーリングは成功します。

## `/device_authorization` の応答

```sh
curl -s -d 'client_id=tv-app&scope=openid profile' \
  https://op.example.com/oidc/device_authorization
```

```json
{
  "device_code": "f8b2c1d4...long-opaque",
  "user_code": "BDWP-HQPK",
  "verification_uri": "https://op.example.com/device",
  "verification_uri_complete": "https://op.example.com/device?user_code=BDWP-HQPK",
  "expires_in": 600,
  "interval": 5
}
```

デバイスは `user_code` と `verification_uri` を表示します。QR コードを描画できるなら、`verification_uri_complete` を QR コードにするとユーザがコードを打たずに済みます。

クライアントの `GrantTypes` に `urn:ietf:params:oauth:grant-type:device_code` がないと、このエンドポイントは `400 unauthorized_client` を返します。クライアントの登録済みスコープにない `scope` は `400 invalid_scope` です。`scope` を省略すると、クライアントの登録済みスコープすべてが使われます。

## RFC 8707 `resource=`

デバイスは `/device_authorization` に `resource=<absolute URI>` を付けて、発行されるアクセストークンを特定のリソースサーバに固定できます。エンドポイントは `/auth`、`/token` と同じ規則を適用します。

- 値は絶対 URI でなければなりません（RFC 8707 §2）。相対 URI は `400 invalid_target` で拒否します。
- 正規化後の値（scheme と host を小文字にし、末尾の `/` を除いたもの）がクライアントの `Resources` 許可リストに含まれている必要があります。クライアントに未登録の resource は `400 invalid_target` で拒否されます。OP が `aud` に入れる値は、登録済みの `Resources` だけです。
- 空でない `resource=` を複数指定すると `400 invalid_target` で拒否されます。device authorization が持てる audience は 1 つだけで、OP は残りを黙って捨てないためです。

デバイスが要求しうるリソースサーバの URI は、あらかじめクライアントの `Resources`（クライアントのシードまたは dynamic registration のメタデータ）に追加しておきます。

## 送信者制約付きの device record

DPoP や mTLS を使う場合、`/device_authorization` は DPoP 鍵の thumbprint と mTLS 証明書の thumbprint をレコードに保存します。`/token` では、トークンを発行する前に、レコードにあるすべての binding を再検証します。両方の binding があるレコードでは、一致する DPoP proof と mTLS 証明書の両方が必要で、片方だけでは引き換えられません。proof がない、または一致しない場合、引き換えは失敗します。成功すると、発行されるトークンの `cnf` には OP が再検証したすべての binding が入ります。送信者制約を必須とするプロファイル（FAPI 2.0）では、どちらもない要求を `/device_authorization` 自体が拒否します。

## ポーリング応答

| 通信路上の応答 | 意味 |
|---|---|
| `400 authorization_pending` | ユーザがまだ承認していない。`interval` 秒後に再ポーリング |
| `400 slow_down` | ポーリングが速すぎた。RFC 8628 §3.5 に従い、今回以降の間隔に 5 秒を加える。OP は新しい間隔を保存するので、どのレプリカでも適用される。ポーリングの記録に失敗した場合は `device_code.poll_observation.failed` を記録するが、ポーリング自体には応答する |
| `400 access_denied` | ユーザが拒否した、`user_code` の試行制限でレコードがロックされた、`devicecodekit.Revoke` が呼ばれた、または間隔より速いポーリングを続けて poll-abuse の上限でレコードが拒否された。ポーリングを止める |
| `400 expired_token` | `device_code` が `expires_in` を超えた、未知である、または引き換え済み。ポーリングを止める |
| `400 invalid_grant` | `device_code` が別のクライアントのもの、またはレコードの DPoP / mTLS binding が欠けている・一致しない |
| `200 { access_token, ... }` | 承認済み。通常のトークン応答として扱う |

ポーリングに成功すると、`access_token` が返ります。付与スコープに `openid` を含めば `id_token` も返ります。クライアントが `refresh_token` grant に登録済みで、`WithGrants` に `refresh_token` があり、スコープに `openid`（`op.WithStrictOfflineAccess` を使う場合は `offline_access` も）を含めば `refresh_token` も返ります。引き換えの際に、そのクライアントとユーザの同意の記録（grant）が作られます。このためトークンは introspection や `/userinfo` で subject を解決でき（pairwise のクライアントなら pairwise の値）、同じスコープでの次の `/auth` は同意画面を省略できます。

## ユーザがデバイスを削除したときの失効

ユーザがアカウント設定で「この TV を削除」を押したときは、そのデバイスに発行済みのトークンも同時に使えなくなるべきです。`devicecodekit.Revoke` は、authorization レコードを Denied にしたうえで、そのレコードから発行されたすべての資格情報を失効させます。

::: details 連鎖失効（cascade revocation）とは
親にあたるレコード（ここでは device authorization）を失効させるとき、そこから発行された資格情報もまとめて失効させることです。これがないと、「この TV を削除」の後も TV にはまだ使えるアクセストークンとリフレッシュトークンが残ります。OP は、device authorization から発行するすべての資格情報を、device code から導出した 1 つの grant 識別子の下に置きます。`Revoke` はその識別子を、渡された各ストアについてたどります。
:::

```go
deps := &devicecodekit.Deps{
    DeviceCodes:        st.DeviceCodes(),
    AccessTokens:       st.AccessTokens(),       // JWT アクセストークンのレジストリ / フォールバック
    GrantRevocations:   st.GrantRevocations(),   // grant の tombstone（JWT の既定の方式）
    OpaqueAccessTokens: st.OpaqueAccessTokens(), // opaque アクセストークン
    RefreshTokens:      st.RefreshTokens(),      // リフレッシュトークンのチェーン
    Grants:             st.Grants(),             // 同意の記録を最後に削除
    AuditLogger:        auditLogger,
}

if err := devicecodekit.Revoke(ctx, deps, deviceCodeID, devicecodekit.DenyReasonUserRevokedDevice); err != nil {
    // レコードはすでに Denied。連鎖失効は途中までの場合がある。Revoke は繰り返し呼んでも安全
}
```

資格情報を実際に発行しているストアを渡してください。nil のフィールドに対応する失効はスキップされます。`Deps.RevocationStrategy` は `op.WithAccessTokenRevocationStrategy` と揃えます。既定の grant tombstone 方式では、`GrantRevocations` に tombstone を書き込みます（`GrantRevocations` が nil なら `AccessTokens` にフォールバックします）。tombstone が対象のトークンより長く残るよう、`Deps.AccessTokenTTL` は provider のアクセストークン TTL に合わせます。JTI レジストリ方式では `AccessTokens` が必須で、`None` 方式では JWT 用のバックエンドは不要です。選んだ方式の書き込み先がなければ、`Revoke` は `ErrMissingRevocationBackend` を返します。

`Revoke` は、途中のストアが失敗しても残りのストアすべてを試し、すべて成功した後にだけ grant の記録を削除します。失敗があれば、まとめたエラーを返します。`device_code.revoked` の監査イベントには、`cascade_complete` と、試行したストアごとの件数またはフラグが入ります。

## 動かしてみる

[`examples/31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) は RFC 8628 のフルラウンドトリップを実演します:

```sh
(cd examples/31-device-code-cli && GOWORK=off go run -tags example .)
```

OP を起動し、枠付きの `user_code` パネルと `verification_uri_complete` ショートカットを表示します。数秒後にブラウザ承認をシミュレートし、access_token + id_token が発行されるまでポーリングします。ファイルは役割別に分割（`op.go` / `cli.go` / `device.go` / `probe.go`）。

## 続きはこちら

- [Device Code 入門](/ja/concepts/device-code) — デバイス側の視点からフローを解説
- [CIBA の組み込み](/ja/use-cases/ciba) — ユーザが別の利用面にいるが、コード表示は合わない場合
