---
title: エラーカタログ
description: OP が返す OAuth / OIDC のエラーコード。logout_scope とログアウト用ストア障害時の静的 503 も説明します。
outline: 2
pageClass: pg-reference-errors
---

# エラーカタログ

OP は閉じたカタログからしかエラーを返しません。`fmt.Errorf` の文字列が通信路上に漏れることはなく、`error` の値はすべて `op.Error`（構築時の設定エラー）か、エンドポイント内部のコード定数（リクエスト処理エラー）に由来します。このページは両方を、エンドポイントごとにまとめた一覧です。

<figure class="fig">
  <div class="fig-head">2 種類のエラーと、それぞれの現れ方</div>
  <svg class="fig-svg" role="img" aria-labelledby="errors-shape-title" viewBox="0 0 960 368" xmlns="http://www.w3.org/2000/svg">
    <title id="errors-shape-title">構成エラーは op.New が返し、プロセスが起動しません。処理時エラーはエンドポイントから発生し、JSON ボディ、エラーパラメータを載せたリダイレクト、HTML エラーページのいずれかで返ります。どれになるかはフローのどの段階かで決まります。</title>
    <!-- construction error -->
    <rect class="fg-box fg-box--warn" x="32" y="24" width="248" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="52">構築時エラー</text>
    <text class="fg-mxs" x="48" y="76">op.New が返す</text>
    <text class="fg-xs" x="48" y="100">プロセスは起動しない</text>
    <!-- request error -->
    <rect class="fg-box" x="32" y="156" width="248" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="184">処理時エラー</text>
    <text class="fg-xs" x="48" y="208">エンドポイント内で発生</text>
    <text class="fg-xs" x="48" y="232">クライアントが待っている間</text>
    <path class="fg-edge" d="M280,204 H336" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="336" y="156" width="272" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="352" y="184">閉じたカタログ</text>
    <text class="fg-mxs" x="352" y="208">error + error_description</text>
    <text class="fg-xs" x="352" y="232">契約になるのはコード</text>
    <path class="fg-leader" d="M608,204 H640 M640,100 V308"/>
    <path class="fg-edge fg-edge--thin" d="M640,100 H672" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M640,204 H672" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M640,308 H672" marker-end="url(#fg-a)"/>
    <!-- renderings -->
    <rect class="fg-box" x="672" y="64" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="688" y="92">JSON 応答</text>
    <text class="fg-xs" x="688" y="116">バックチャネルの応答</text>
    <rect class="fg-box" x="672" y="168" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="688" y="196">リダイレクト</text>
    <text class="fg-xs" x="688" y="220">検証済みの redirect_uri へ</text>
    <rect class="fg-box" x="672" y="272" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="688" y="300">HTML エラーページ</text>
    <text class="fg-xs" x="688" y="324">redirect_uri が未検証</text>
  </svg>
  <figcaption class="fig-note">3 つのどれになるかは見た目の好みではありません。<code>redirect_uri</code> を検証し終えるまで OP はどこへもリダイレクトできません。未検証の URI へエラーを送ることが、そのままオープンリダイレクタの作り方だからです。</figcaption>
</figure>

## エラーの形

通信路上に出るエラーはすべて、OAuth 2.0 / OIDC の規約に従います:

```json
{
  "error": "invalid_request",
  "error_description": "client_id is required"
}
```

- **`error`** は、下のカタログのいずれかです。機械可読で、ローカライズはせず、ラップもしません。
- **`error_description`** は運用者向けの短いヒントです。トークン、ユーザの生入力、スタックトレースを含みません。

ブラウザ向けエンドポイント（`/auth`、`/end_session`）では、同じコードが以下のいずれかに現れます:

- `redirect_uri` と `state` を検証できた場合は、redirect 上の `error` パラメータ（query / fragment）。
- 安全な redirect 先が無い場合は、HTML エラーページの DOM (`<div id="op-error" data-code="..." data-description="...">`)。

## プログラム的に判別する

```go
import "errors"

if errors.Is(err, op.ErrIssuerRequired) { /* 設定時エラー */ }

if op.IsClientError(err) { /* 4xx 系 */ }
if op.IsServerError(err) { /* 5xx 系 */ }
```

sentinel 比較は Go の `errors.Is` の既定どおり、ポインタ同一性で判定します。同じ OAuth コードを共有する sentinel は複数あります（`configuration_error` がそうです）が、互いに置き換えられるわけではありません。

述語は `*op.Error` の `Code` を見ます。対象になるコードは次のとおりです。

| 述語 | 一致するコード |
|---|---|
| `op.IsClientError` | `invalid_request`、`invalid_client`、`invalid_grant`、`unauthorized_client`、`unsupported_grant_type`、`unsupported_response_type`、`invalid_scope`、`access_denied` |
| `op.IsServerError` | `server_error`、`temporarily_unavailable`、`configuration_error` |

`use_dpop_nonce` のように両方の一覧にないコードは、`op.New` などが埋め込み側に返す `*op.Error` にはならず、HTTP 応答にだけ現れます。

## 構築時エラー（`op.New`）

コンストラクタが返します。OP は起動しません。

| Sentinel | コード | 発生条件 |
|---|---|---|
| `op.ErrIssuerRequired` | `configuration_error` | `WithIssuer` を渡していない |
| `op.ErrIssuerInvalid` | `configuration_error` | issuer が正規形の絶対 URL でない。末尾スラッシュ・query・fragment がある、または scheme が `https` でない（`http` が許されるのは loopback の IP リテラルだけで、`localhost` は `WithAllowLocalhostLoopback` を渡した場合に限る） |
| `op.ErrStoreRequired` | `configuration_error` | `WithStore` を渡していない |
| `op.ErrUserStoreRequired` | `configuration_error` | `WithUserStore` に nil を渡した |
| `op.ErrKeysetRequired` | `configuration_error` | `WithKeyset` を渡していない、または空 |
| `op.ErrCookieKeysRequired` | `configuration_error` | `authorization_code` grant が有効なのに `WithCookieKeys` を渡していない |
| `op.ErrDynamicRegistrationDisabled` | `configuration_error` | `WithDynamicRegistration` 無しで `Provider.IssueInitialAccessToken` を呼んだ |
| `op.ErrPairwiseSaltTooShort` | `configuration_error` | `WithPairwiseSubject` の salt が 32 byte 未満 |
| `op.ErrSubjectGeneratorRequired` | `configuration_error` | `WithSubjectGenerator` に nil を渡した |
| `op.ErrCustomGrantNil` | `configuration_error` | `WithCustomGrant` に nil の handler を渡した |
| `op.ErrCustomGrantNameEmpty` | `configuration_error` | `CustomGrantHandler.Name` が空の `grant_type` URN を返した |
| `op.ErrCustomGrantBuiltinCollision` | `configuration_error` | handler の名前が組み込み `grant_type` と一致する |
| `op.ErrCustomGrantDuplicate` | `configuration_error` | handler の名前が先の `WithCustomGrant` で登録済み |
| `op.ErrCustomGrantSecretLikeExempt` | `configuration_error` | `ParamPolicy.DupesAllowed` に、機微なパラメータを指定した |
| `op.ErrTokenExchangePolicyNil` | `configuration_error` | `RegisterTokenExchange` に nil の policy を渡した |
| `op.ErrTokenExchangeDuplicate` | `configuration_error` | `RegisterTokenExchange` を 2 回呼んだ |

次の 3 つの sentinel は、`op.New` ではなく構築後に返ります。

| Sentinel | コード | 発生条件 |
|---|---|---|
| `op.ErrLocaleNotRegistered` | `invalid_request` | `Provider.SetLocaleCookie` に、登録済みのどのバンドルにも一致しない locale を渡した |
| `op.ErrSubjectInputEmpty` | `server_error` | 組み込みの subject generator が、空の内部 user ID で呼ばれた |
| `op.ErrPairwiseSectorUnresolved` | `server_error` | `sector_identifier_uri` を持たず、`redirect_uri` のホストが 1 つに定まらないクライアントの pairwise subject |

::: tip 他の設定エラー
プロファイルとオプションの衝突（たとえば `WithProfile(FAPI2Baseline)` と `WithAccessTokenFormat(Opaque)` の併用）は `*op.Error` を返し、`Code = configuration_error`、description に衝突したオプション名が入ります。これらは事前定義された sentinel ではないので、`op.IsServerError` を使うか、`.Code` を直接見て判別してください。拒否される構成の一覧は[オプション一覧](/ja/reference/options#op-new-が拒否する構成)にあります。
:::

## Authorize エンドポイント（`/auth`）

ブラウザ経由のエンドポイントです。`redirect_uri` を検証できれば redirect で、できなければ HTML エラーページでユーザに到達します。

| コード | 仕様 | 典型的な原因 |
|---|---|---|
| `invalid_request` | OIDC Core §3.1.2.6 | パラメータ欠落、PKCE 不正、`state` がサイズ上限超過 |
| `invalid_request_object` | RFC 9101 §6.1 | JAR JWS の検証失敗、alg 非許可、有効期限切れ |
| `invalid_request_uri` | RFC 9101 §6.1 / RFC 9126 §2.2 | PAR の `request_uri` がすでに消費済み、または期限切れ |
| `invalid_scope` | OIDC Core §3.1.2.6 | 要求された scope がカタログに存在しない |
| `invalid_target` | RFC 8707 §2 | `resource` の形式が不正、重複、または許可されたリソースでない |
| `invalid_authorization_details` | RFC 9396 §5 | `authorization_details` が type ごとの検証に通らない |
| `unmet_authentication_requirements` | OIDC Core §5.5.1.1、RFC 9470 §4 | リクエストが必須（essential）とした `acr` を、セッションが満たせない |
| `unsupported_response_type` | OIDC Core §3.1.2.6 | `response_type` が `code` 以外（Implicit / Hybrid は拒否） |
| `unsupported_response_mode` | OAuth 2.1 | 未対応の `response_mode` |
| `login_required` | OIDC Core §3.1.2.6 | `prompt=none` だがアクティブセッションが無い |
| `consent_required` | OIDC Core §3.1.2.6 | `prompt=none` だが consent が無い |
| `interaction_required` | OIDC Core §3.1.2.6 | `prompt=none` だが UI が必要。既存セッションに対して `LoginFlow` の rule や `Decider` が追加の step を求める場合も含む |
| `account_selection_required` | OIDC Core §3.1.2.6 | `prompt=none` で複数のセッションがある |
| `access_denied` | OIDC Core §3.1.2.6 | ユーザが consent / login で取り消した |
| `server_error` | OIDC Core §3.1.2.6 | 内部障害。クライアントストアの障害も含み、その場合 `client_id` を未登録として報告することはしない |

クライアント JWKS の取得が過負荷または一時的な失敗で行えない request object は、エラーページに HTTP 503 `server_error` を返します。consent や chooser の送信が拒否された・古い・改ざんされた場合、または期限切れ・他人の chooser `session_id` を指していた場合は 4xx で応答します。chooser で選んだセッションが期限切れ、またはサインアウト済みなら `login_required` です。

::: warning redirect URI 不一致は特殊
`invalid_request: redirect_uri does not match a registered URI` は、authorize エラーのうち**唯一** redirect させずに返すケースです。URL 自体が信頼できないので、ユーザは HTML エラーページに到達します。[FAQ § よくあるエラー](/ja/faq#common-errors) を参照。
:::

## Token エンドポイント（`/token`）

JSON 応答です。RFC 6749 §5.2 + RFC 9449(DPoP)。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_request` | 400 | grant の body の不正、パラメータ欠落 |
| `invalid_grant` | 400 | code の有効期限切れ / 消費済み、リフレッシュトークンがローテーション猶予を超過、PKCE verifier 不一致 |
| `invalid_client` | 401 | クライアント認証失敗（クレデンシャル無し、secret 違い、`private_key_jwt` 不正） |
| `unauthorized_client` | 400 | このクライアントは当該 grant を許可されていない |
| `unsupported_grant_type` | 400 | `WithGrants` で有効化されていない grant |
| `invalid_scope` | 400 | refresh が元より広い scope を要求している |
| `invalid_target` | 400 | RFC 8707 の `resource` / `audience` が policy で拒否された |
| `invalid_authorization_details` | 400 | `authorization_details` がこのリクエストでは許可されない |
| `authorization_pending` | 400 | ユーザがまだ判断していない時点での device-code / CIBA のポーリング |
| `slow_down` | 400 | 取り決めた間隔より速い device-code / CIBA のポーリング |
| `expired_token` | 400 | `device_code` または `auth_req_id` の有効期間が過ぎた |
| `access_denied` | 400 | ユーザが device-code / CIBA の要求を拒否した |
| `use_dpop_nonce` | 400 | DPoP §8 のサーバ nonce が必要。クライアントは `DPoP-Nonce` を載せて再送する |
| `server_error` | 500 | 内部障害。クライアント認証中のクライアントストア障害も含む |
| `server_error` | 503 | クライアントの JWKS を取得できない（取得が過負荷または一時的に失敗）。再試行できる |

`/token`・`/par`・`/device_authorization`・`/bc-authorize`・`/introspect`・`/revoke` では、クライアント認証の失敗を次のように返します。

| 状況 | 応答 |
|---|---|
| クレデンシャルがない | `401 invalid_client` |
| secret が違う、assertion が不正または再送（空または長すぎる `jti` を含む）、クライアントの不一致 | `401 invalid_client` |
| 認証方式が複数ある、または未対応の方式 | `400 invalid_request` |
| クライアント JWKS の取得が過負荷または失敗している | `503 server_error` |
| それ以外の障害（クライアントストアの障害など） | `500 server_error` |

`401 invalid_client` は、クライアントが HTTP Basic で認証した場合に `WWW-Authenticate: Basic realm="oidc"` を載せます（realm は issuer URL ではなく固定文字列です）。`/userinfo` 自身の 401 は別系統で、`Bearer realm="userinfo"` を載せます（RFC 6749 §5.2）。

refresh で `scope` を狭めて要求しても、ローテーション後のリフレッシュトークンは狭まりません。後継のトークンは、置き換えた元のトークンの scope を引き継ぎます。別のクライアントが提示した認可コードや、`redirect_uri` または PKCE の検証に失敗したコードは、コードを消費せずに `invalid_grant` を返します。grant が失効するのは、本当の再送のときだけです。

custom grant の dispatcher は、クライアントに帰属できる失敗を 4xx のカタログに残します。未対応 grant、クライアントの grant-type 制限、パラメータの不正または重複、scope / audience policy の失敗は、それぞれ `unsupported_grant_type`、`unauthorized_client`、`invalid_request`、`invalid_scope`、`invalid_target` になります。handler の panic、access token 形態の衝突、reserved claim の衝突、不正な token データ、OP の発行処理または backing store の障害など、dispatcher がクライアントに帰属できない障害は `500 server_error` になります。handler が返した `*op.Error` は、ラップされていてもコードが保持され、それ以外の handler error は既定で `400 invalid_grant` になります。

## UserInfo エンドポイント（`/userinfo`）

bearer 検証を行います。RFC 6750 §3.1 + RFC 9449。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_token` | 401 | bearer 欠落、期限切れ、失効済み、alg 不一致 |
| `invalid_dpop_proof` | 401 | DPoP proof JWS の不正、再送、`cnf.jkt` 不一致 |
| `use_dpop_nonce` | 401 | DPoP §8 のサーバ nonce が必要 |
| `invalid_request` | 400 | bearer リクエストが不正（トークン多重指定、誤ったチャネルなど）。リクエストボディがサイズ上限を超えた場合は 413 |

grant store が `store.ErrNotFound` 以外のエラーを返した場合、claim を返さず、通常の HTTP 500 で応答します。`ErrNotFound` は grant の系譜がないことを示します。subject projector がなければトークンの scope に基づいて claim を解決します。pairwise subject projection を使う場合は内部の subject を解決できないため、`401 invalid_token` を返します。

## Introspection / Revocation(`/introspect`、`/revoke`)

RFC 7662 / RFC 7009。`/token` と同じクライアント認証コードの集合を使います。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_request` | 400 | `token` パラメータ欠落 |
| `invalid_client` | 401 | クライアント認証失敗 |
| `server_error` | 500 | 内部障害 |
| `server_error` | 503 | `private_key_jwt` 認証に必要なクライアントの JWKS を取得できない |

`/revoke` は RFC 7009 の 2 つのトークンタイプ `access_token` と `refresh_token` をサポートしており、`unsupported_token_type` は発火しません。未知または空の `token_type_hint` は wire error ではなく検索ヒントとして扱われます。認識できないトークンでも、RFC 7009 の冪等な HTTP 200 成功契約に従います。

`/introspect` でクライアント認証に失敗すると、wire では一般的な `invalid_client` のまま、`op.AuditIntrospectionError` として監査にも現れます。opaque access token / refresh token の store が `NotFound` 以外の障害を返した場合も同じイベントを発火しますが、通信路上は `server_error` ではなく HTTP 200 と `{"active":false}` を返します。通常の inactive miss では障害イベントを発火しません。`/revoke` はこの introspection 固有の監査名を使いません。

`/revoke` は、rotation chain が長くて chain の起点を辿れない場合も 200 を返します。この場合は grant の refresh token をまとめて失効させ、`token.revoked` には `surface: "refresh_grant"` が入ります（[Audit イベントカタログ](/ja/reference/audit-events#code-token-のライフサイクル)）。

リフレッシュトークンに対する `/introspect` の応答は、`active` などの状態は返しますが `token_type` は付けません。RFC 7662 はこのメンバーをアクセストークンの種別と定めており、リソースサーバがリフレッシュトークンを bearer として扱えると誤解しないようにするためです。

## PAR エンドポイント（`/par`）

RFC 9126。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_request` | 400 | PAR ボディ内の authorize パラメータが不正 |
| `invalid_request_object` | 400 | (`request` パラメータ併用時)JAR の署名検証失敗 |
| `invalid_client` | 401 | クライアント認証失敗 |
| `server_error` | 503 | クライアントの JWKS を取得できない（クライアント認証または request object の検証時） |

## Device 認可（`/device_authorization`）と CIBA（`/bc-authorize`）

RFC 8628 と CIBA Core §13。どちらも RFC 6749 §5.2 の形式で応答します。ポーリング用のコード（`authorization_pending`、`slow_down`、`expired_token`、`access_denied`）は `/token` が返し、上の表に載せています。

| コード | HTTP | エンドポイント | 発生条件 |
|---|---|---|---|
| `invalid_request` | 400 | 両方 | パラメータの不正・欠落、またはクライアント証明書の形式不正 |
| `unauthorized_client` | 400 | 両方 | クライアントがこの grant を登録していない |
| `invalid_scope` | 400 | 両方 | scope が拒否された |
| `invalid_target` | 400 | 両方 | `resource` が拒否された |
| `unknown_user_id` | 400 | `/bc-authorize` | hint resolver が該当ユーザを見つけられなかった |
| `invalid_binding_message` | 400 | `/bc-authorize` | `binding_message` が拒否された |
| `login_required` | 400 | `/bc-authorize` | hint resolver が失敗した、または空の subject を返した |
| `server_error` | 500 / 503 | 両方 | 内部障害。request object のクライアント JWKS が使えない場合は 503 |

## Dynamic Client Registration(`/register`、`/register/{client_id}`)

RFC 7591 / RFC 7592。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_request` | 400 | 必須メタデータの欠落 |
| `invalid_token` | 401 | IAT / RAT bearer の欠落 / 期限切れ |
| `invalid_client_metadata` | 400 | メタデータがポリシーに反する（たとえば、未対応の `response_types`） |
| `invalid_redirect_uri` | 400 | redirect URI の形式が拒否対象（loopback ワイルドカード、fragment など） |
| `invalid_software_statement` | 400 | software statement の JWS 検証失敗 |
| `server_error` | 500 | 内部障害 |

## End-session(`/end_session`)

OIDC RP-Initiated Logout 1.0。ブラウザ向けです。`post_logout_redirect_uri` への redirect か、HTML エラーページでユーザに到達します。

| コード | 発生条件 |
|---|---|
| `invalid_request` | `id_token_hint` の不正（`typ` ヘッダが存在しない、または `JWT` 以外のものを含む。logout token やアクセストークンは拒否される）、`client_id` 不一致、`logout_scope` が不正（空、未知、重複、または `current` 以外） |
| `invalid_request_uri` | (JAR 形式の logout request 利用時)`request_uri` の期限切れ |

`/end_session` がセッションの解決または破棄中にセッションストアへ接続できない場合は、静的な HTTP 503 エラーページを返します。`post_logout_redirect_uri` へはリダイレクトせず、ブラウザ cookie とセッション行を保持します。一時的なストア障害で部分的なログアウトにならないためです。存在しない、または期限切れのセッションは別の扱いであり、transport 障害とは異なります。

## リクエストボディ

JSON のボディを読むエンドポイントとドライバはすべて、最初の JSON 値の後にデータ（たとえば余分な `}`）があると、末尾を読み飛ばさずに `invalid_request` で拒否します。

## このリストの裏取り

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhE '"[a-z_]+_[a-z_]+"' internal/*/error*.go \
  | grep -oE '"[a-z_]+_[a-z_]+"' | sort -u
```

出力は、各エンドポイントが返し得るすべての通信路上のコードの和集合です。このページではそれをエンドポイントごとにまとめ、各仕様参照を添えています。
