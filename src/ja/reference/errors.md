---
title: エラーカタログ
description: OP が返す OAuth / OIDC のエラーコードと、各エラーの典型的な発生条件・対処を一覧化。
outline: 2
---

# エラーカタログ

OP は閉じたカタログからしかエラーを返しません。`fmt.Errorf` の文字列が通信路上に漏れることはなく、すべての `error` は `op.Error` (構築時 / 設定エラー)か、エンドポイント内部のコード定数(リクエスト処理エラー)から構築されます。

このページは両方を網羅した一覧です。

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

ブラウザ向けエンドポイント(`/authorize`、`/end_session`)では、同じコードが以下のいずれかに現れます:

- `redirect_uri` と `state` を検証できた場合は、redirect 上の `error` パラメータ(query / fragment)。
- 安全な redirect 先が無い場合は、HTML エラーページの DOM (`<div id="op-error" data-code="..." data-description="...">`)。

## プログラム的に判別する

```go
import "errors"

if errors.Is(err, op.ErrIssuerRequired) { /* 設定時エラー */ }

if op.IsClientError(err) { /* 4xx 系 */ }
if op.IsServerError(err) { /* 5xx 系 */ }
```

sentinel 比較は Go の `errors.Is` の既定どおり、ポインタ同一性で判定します。同じ OAuth コードを共有する別の sentinel が存在し得るので(たとえば、複数の `configuration_error`)、両者は同じ意味になるとは限りません。

## 構築時エラー(`op.New`)

コンストラクタが返します。OP は起動しません。

| Sentinel | コード | 発生条件 |
|---|---|---|
| `op.ErrIssuerRequired` | `configuration_error` | `WithIssuer` を渡していない |
| `op.ErrIssuerInvalid` | `configuration_error` | issuer が absolute https でない、または query / fragment を持つ |
| `op.ErrStoreRequired` | `configuration_error` | `WithStore` を渡していない |
| `op.ErrKeysetRequired` | `configuration_error` | `WithKeyset` を渡していない、または空 |
| `op.ErrCookieKeysRequired` | `configuration_error` | `authorization_code` grant が有効なのに `WithCookieKeys` を渡していない |
| `op.ErrDynamicRegistrationDisabled` | `configuration_error` | `WithDynamicRegistration` 無しで `Provider.IssueInitialAccessToken` を呼んだ |

::: tip 他の設定エラー
プロファイルとオプションの衝突(たとえば `WithProfile(FAPI2Baseline)` と `WithAccessTokenFormat(Opaque)` の併用)は `*op.Error` を返し、`Code = configuration_error`、description に衝突したオプション名が入ります。これらは事前定義された sentinel ではないので、`op.IsServerError` を使うか、`.Code` を直接見て判別してください。
:::

## Authorize エンドポイント(`/authorize`)

ブラウザ経由のエンドポイントです。`redirect_uri` を検証できれば redirect で、できなければ HTML エラーページでユーザに到達します。

| コード | 仕様 | 典型的な原因 |
|---|---|---|
| `invalid_request` | OIDC Core §3.1.2.6 | パラメータ欠落、PKCE 不正、`state` がサイズ上限超過 |
| `invalid_request_object` | RFC 9101 §6.1 | JAR JWS の検証失敗、alg 非許可、有効期限切れ |
| `invalid_request_uri` | RFC 9101 §6.1 / RFC 9126 §2.2 | PAR の `request_uri` がすでに消費済み、または期限切れ |
| `invalid_scope` | OIDC Core §3.1.2.6 | 要求された scope がカタログに存在しない |
| `unsupported_response_type` | OIDC Core §3.1.2.6 | `response_type` が `code` 以外(Implicit / Hybrid は拒否) |
| `unsupported_response_mode` | OAuth 2.1 | 未対応の `response_mode` |
| `login_required` | OIDC Core §3.1.2.6 | `prompt=none` だがアクティブセッションが無い |
| `consent_required` | OIDC Core §3.1.2.6 | `prompt=none` だが consent が無い |
| `interaction_required` | OIDC Core §3.1.2.6 | `prompt=none` だが UI が必要 |
| `account_selection_required` | OIDC Core §3.1.2.6 | `prompt=none` で複数のセッションがある |
| `access_denied` | OIDC Core §3.1.2.6 | ユーザが consent / login で取り消した |
| `server_error` | OIDC Core §3.1.2.6 | 内部障害 |

::: warning redirect URI 不一致は特殊
`invalid_request: redirect_uri does not match a registered URI` は、authorize エラーのうち**唯一** redirect させずに返すケースです。URL 自体が信頼できないので、ユーザは HTML エラーページに到達します。[FAQ § よくあるエラー](/ja/faq#common-errors) を参照。
:::

## Token エンドポイント(`/token`)

JSON 応答です。RFC 6749 §5.2 + RFC 9449(DPoP)。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_request` | 400 | grant の body の不正、パラメータ欠落 |
| `invalid_grant` | 400 | code の有効期限切れ / 消費済み、refresh token がローテーション猶予を超過、PKCE verifier 不一致 |
| `invalid_client` | 401 | クライアント認証失敗(クレデンシャル無し、secret 違い、`private_key_jwt` / mTLS 証明書不正) |
| `unauthorized_client` | 400 | このクライアントは当該 grant を許可されていない |
| `unsupported_grant_type` | 400 | `WithGrants` で有効化されていない grant |
| `invalid_scope` | 400 | refresh が元より広い scope を要求している |
| `use_dpop_nonce` | 400 | DPoP §8 のサーバ nonce が必要。クライアントは `DPoP-Nonce` を載せて再送する |
| `server_error` | 500 | 内部障害 |

`401 invalid_client` は常に `WWW-Authenticate: Basic realm="<issuer>"` (`/userinfo` では `Bearer realm=...`)を載せます(RFC 6749 §5.2)。

## UserInfo エンドポイント(`/userinfo`)

bearer 検証を行います。RFC 6750 §3.1 + RFC 9449。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_token` | 401 | bearer 欠落、期限切れ、失効済み、alg 不一致 |
| `invalid_dpop_proof` | 401 | DPoP proof JWS の不正、再送、`cnf.jkt` 不一致 |
| `use_dpop_nonce` | 401 | DPoP §8 のサーバ nonce が必要 |
| `insufficient_scope` | 403 | 要求された claim に対して scope が不足 |

## Introspection / Revocation(`/introspect`、`/revoke`)

RFC 7662 / RFC 7009。`/token` と同じクライアント認証コードの集合を使います。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_request` | 400 | `token` パラメータ欠落 |
| `invalid_client` | 401 | クライアント認証失敗 |
| `unsupported_token_type` | 400 | `/revoke` のみ — 失効不可なトークンタイプ |
| `server_error` | 500 | 内部障害 |

## PAR エンドポイント(`/par`)

RFC 9126。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_request` | 400 | PAR ボディ内の authorize パラメータが不正 |
| `invalid_request_object` | 400 | (`request` パラメータ併用時)JAR の署名検証失敗 |
| `invalid_client` | 401 | クライアント認証失敗 |

## Dynamic Client Registration(`/register`、`/register/{client_id}`)

RFC 7591 / RFC 7592。

| コード | HTTP | 発生条件 |
|---|---|---|
| `invalid_request` | 400 | 必須メタデータの欠落 |
| `invalid_token` | 401 | IAT / RAT bearer の欠落 / 期限切れ |
| `invalid_client_metadata` | 400 | メタデータがポリシーに反する(たとえば、未対応の `response_types`) |
| `invalid_redirect_uri` | 400 | redirect URI の形式が拒否対象(loopback ワイルドカード、fragment など) |
| `invalid_software_statement` | 400 | software statement の JWS 検証失敗 |
| `server_error` | 500 | 内部障害 |

## End-session(`/end_session`)

OIDC RP-Initiated Logout 1.0。ブラウザ向けです。`post_logout_redirect_uri` への redirect か、HTML エラーページでユーザに到達します。

| コード | 発生条件 |
|---|---|
| `invalid_request` | `id_token_hint` の不正、`client_id` 不一致 |
| `invalid_request_uri` | (JAR 形式の logout request 利用時)`request_uri` の期限切れ |

## クラス単位での dispatch

各コードを個別に switch するのではなく、述語を使うのが推奨です:

```go
switch {
case errors.Is(err, op.ErrIssuerRequired):
    // 起動時に直すべき設定エラー
case op.IsClientError(err):
    // 4xx — info ログで十分。アラートはしない
case op.IsServerError(err):
    // 5xx — 発生率にアラートを張る
}
```

## このリストの裏取り

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhE '"[a-z_]+_[a-z_]+"' internal/*/error*.go \
  | grep -oE '"[a-z_]+_[a-z_]+"' | sort -u
```

出力は、各エンドポイントが返し得るすべての通信路上のコードの和集合です。このページではそれをエンドポイントごとにまとめ、各仕様参照を添えています。
