---
title: FAPI 2.0 Baseline
description: 本ライブラリの FAPI2Baseline プロファイルで、PAR、JAR のサポート、DPoP / mTLS、private_key_jwt、ES256 のみの ID Token、アクセストークン 10 分上限、request object の 60 分上限を有効化します。
pageClass: pg-use-cases-fapi2-baseline
---

# ユースケース — FAPI 2.0 Baseline

## FAPI 2.0 とは

**FAPI**（"Financial-grade API"）は OpenID Foundation が策定する OAuth 2.0 のセキュリティプロファイル群です。現行の FAPI 2.0 Security Profile は、PAR、`S256` の PKCE、送信者制約付きトークン（DPoP **または** mTLS）、confidential クライアント、`PS256` / `ES256` / `EdDSA` の JWT alg を要求します。JAR は要件に含まれず、ID Token の署名を `ES256` だけに限定してもいません。また OAuth のプロファイルなので、認証済みユーザの識別子が必要なときに OIDC を併用します。本ライブラリの `profile.FAPI2Baseline` は、次の 3 点でそれより踏み込んでいます。JAR のサポートを有効にし、クライアント認証に `private_key_jwt` を使い、ID Token を `ES256` のみで署名します。認可エンドポイントは mount prefix 配下の `/auth` で、既定の `/oidc` なら `/oidc/auth` になります。

銀行・医療・行政の運用では、「安全なオプションを全部覚えているか」ではなく「決まったチェックリストに対して監査できるか」が問われます。FAPI 2.0 は、いまも使われている FAPI 1.0 の後継です。最終版の文書名は Security Profile で、本ライブラリはその設定を `profile.FAPI2Baseline` と呼びます。別の設定 `profile.FAPI2MessageSigning` は、JARM、DPoP nonce source の制約、応答署名を追加します。これらは本ライブラリの設定の挙動であり、最終版の Security Profile の要件ではありません。

本ライブラリは Baseline を **プロファイル 1 つの指定**（`op.WithProfile(profile.FAPI2Baseline)`）として公開します。本ライブラリの必要なチェックをまとめて有効にし、ライブラリのプロファイルに反する構成では `op.New` 自体が起動を拒否します。

PAR / JAR / JARM / DPoP / mTLS / ES256 など各略号の解説は [FAPI 2.0 入門](/ja/concepts/fapi) にあります。本ページは構成例を扱います。

::: details このページで触れる仕様
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — 最終版（本ライブラリの `profile.FAPI2Baseline` 設定）
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

> **ソース:** [`examples/03-fapi2/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) はプロファイルのフローを扱います。[`examples/50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) は、TLS 1.2 の FAPI 1.0 RW cipher allow-list 用 `op.FAPITLSConfig()` と `op.LoadPublicJWKS` を示します。`FAPITLSConfig` は TLS 1.2 を最低バージョンとし、TLS 1.2 には FAPI 1.0 RW の cipher allow-list（RSA 鍵の AEAD スイート。RSA のサーバ証明書が必要）を適用します。Go は TLS 1.3 の cipher suite allow-list を公開していないため、クライアントが TLS 1.3 を提示すればそのまま TLS 1.3 でつながります。`LoadPublicJWKS` は、client 登録前に private JWK material を取り除きます。

## 本ライブラリの `FAPI2Baseline` が強制するもの

| 要件 | RFC | ライブラリの挙動 |
|---|---|---|
| Pushed Authorization Requests | RFC 9126 | プロファイルが `feature.PAR` を自動有効化。`/par` で得た `request_uri` を authorize の入口にする。 |
| Proof Key for Code Exchange | RFC 7636 | `code_challenge_method=S256` 必須、`plain` 拒否。 |
| 送信者制約付きトークン（DPoP **または** mTLS） | RFC 9449 / RFC 8705 | このプロファイルでは `profile.RequiredAnyOf` が `{DPoP, MTLS}` を返すため、どちらか一方を満たせばよい。どちらも指定されていなければ、コンストラクタがインフラ前提の少ない DPoP を既定として選ぶ。 |
| JWT alg | FAPI 2.0 §5.4.1 | プロファイルが許可するのは `PS256`、`ES256`、`EdDSA` です。本ライブラリの `id_token_signing_alg_values_supported` は `["ES256"]` のままで、`RS256` / `none` / `HS*` は公告しません。 |
| 短命なアクセストークン | ライブラリのポリシー | アクセストークンの有効期間が 10 分を超える設定は `op.New` が拒否する（`profile.MaxAccessTokenTTL`）。 |
| PAR の有効期間 | FAPI 2.0 §5.3.2.2 | `op.WithPARLifetime` が 600 秒以上なら `op.New` が拒否する。 |
| 署名付き request object | RFC 9101 | `feature.JAR` が自動で有効になり、`/par` と `/auth` は `request` を受け付ける。ただし必須ではない（必須にするのは `profile.FAPI2MessageSigning`）。request object を使う場合は、署名されていない query / form パラメータとマージせず、request object が置き換える。request object とクライアントアサーションの `RS256` は拒否する。 |
| `redirect_uri` 完全一致 | ライブラリのポリシー | 本ライブラリは事前登録済み URI とのバイト単位の一致を求め、ワイルドカードを認めません。現行の FAPI 2.0 Security Profile は、認証済み PAR リクエストに `redirect_uri` を含めることを求めますが、事前登録は必須としていません。 |
| クライアント認証 | FAPI 2.0 §5.3.2.1 | FAPI は mTLS または `private_key_jwt` を認めます。本ライブラリが token endpoint のクライアント認証で処理するのは `private_key_jwt` だけです。mTLS は送信者制約を満たせますが、mTLS クライアント認証の経路は未接続です。 |

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">本ライブラリの FAPI2Baseline の一連の流れ</div>
  <svg class="fig-svg" role="img" aria-labelledby="fapi2-arch-title" viewBox="0 0 960 672" xmlns="http://www.w3.org/2000/svg">
    <title id="fapi2-arch-title">本ライブラリの FAPI2Baseline では、RP が認可リクエストを pushed authorization エンドポイントへ送り、request_uri を受け取ります。ブラウザが運ぶのはその参照だけです。トークンリクエストは private_key_jwt で認証され DPoP proof を伴い、アクセストークンは DPoP にバインドされ、ID Token は本ライブラリの設定により ES256 で署名されます。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="648"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="648"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP / クライアント</text>
    <text class="fg-mxs" x="192" y="72" text-anchor="middle">private_key_jwt</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="32" cy="144" r="12"/>
    <text class="fg-badge-t" x="32" y="149.5" text-anchor="middle">1</text>
    <path class="fg-edge" d="M192,144 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="110" text-anchor="middle">POST /par</text>
    <text class="fg-mxs" x="508" y="132" text-anchor="middle">client_assertion · code_challenge=S256</text>
    <!-- 2 -->
    <circle class="fg-badge fg-badge--accent" cx="32" cy="200" r="12"/>
    <text class="fg-badge-t fg-badge-t--accent" x="32" y="205.5" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M824,200 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="508" y="190" text-anchor="middle">201 · request_uri=urn:…:&lt;id&gt; · expires_in</text>
    <!-- 3 -->
    <path class="fg-edge" d="M192,256 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="508" y="246" text-anchor="middle">GET /auth?request_uri=urn:…&amp;client_id</text>
    <!-- validate -->
    <path class="fg-edge fg-edge--accent" d="M824,296 h-40 v24 h40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="768" y="302" text-anchor="end">プロファイルに照らして検証する</text>
    <text class="fg-mxs" x="768" y="324" text-anchor="end">redirect_uri exact match</text>
    <text class="fg-mxs" x="768" y="346" text-anchor="end">ライブラリの ID Token: ES256</text>
    <!-- interaction -->
    <rect class="fg-box fg-box--sub" x="232" y="392" width="560" height="48" rx="8"/>
    <text class="fg-xs" x="248" y="421">interaction エンドポイントが認可判断を得る</text>
    <!-- code -->
    <path class="fg-edge fg-edge--accent" d="M824,496 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="508" y="486" text-anchor="middle">302 redirect_uri?code=…&amp;state=…</text>
    <!-- token -->
    <path class="fg-edge" d="M192,568 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="534" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
    <text class="fg-mxs" x="508" y="556" text-anchor="middle">code · code_verifier · client_assertion</text>
    <!-- tokens -->
    <path class="fg-edge fg-edge--accent" d="M824,640 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="508" y="606" text-anchor="middle">200</text>
    <text class="fg-mxs" x="508" y="628" text-anchor="middle">access_token (DPoP バインド) · id_token · refresh_token</text>
  </svg>
  <figcaption class="fig-note">本ライブラリのプロファイルが前段に足しているのは手順 1 と 2 です。これ以降ブラウザが運ぶのはリクエスト本体ではなく参照になるため、URL バーに改竄する価値のあるものが残りません。</figcaption>
</figure>

## コード（[`examples/03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) からの抜粋）

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
  "github.com/libraz/go-oidc-provider/op/profile"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

const (
  demoIssuer      = "https://op.example.com"
  demoClientID    = "fapi2-example-client"
  demoRedirectURI = "https://rp.example.com/callback"
)

st := inmem.New()
loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

provider, err := op.New(
  op.WithIssuer(demoIssuer),
  op.WithStore(st),
  op.WithKeyset(opKeys.Keyset()),
  op.WithCookieKeys(opKeys.CookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithProfile(profile.FAPI2Baseline), // <--- プロファイル切り替え
  op.WithFeature(feature.DPoP),
  op.WithStaticClients(op.PrivateKeyJWTClient{
    ID:            demoClientID,
    JWKS:          clientJWKs, // 公開 JWK Set を JSON バイト列で
    RedirectURIs:  []string{demoRedirectURI},
    Scopes:        []string{"openid", "profile", "email"},
    GrantTypes:    []string{"authorization_code", "refresh_token"},
    ResponseTypes: []string{"code"},
  }),
)
```

`PrivateKeyJWTClient` は FAPI クライアント用の型付きクライアント定義で、`token_endpoint_auth_method=private_key_jwt` を自動で設定します。組み込み側でこのフィールドを書く必要はありません。同じ系統の型として `op.PublicClient` と `op.ConfidentialClient` があり、3 つすべてが `op.ClientSeed` を実装し、`WithStaticClients(seeds ...ClientSeed)` に渡せます。

example の RP（`rpkit.NewFAPI2`）は、`private_key_jwt` のアサーション付きで `/par` にリクエストを push し、`/token` では DPoP proof を送ります。そのため `http://127.0.0.1:9090/` を開くだけで、ブラウザからフロー全体を試せます。既定の grant は `authorization_code` と `refresh_token` なので、example は `op.WithGrants` を呼びません。

本ライブラリで `WithProfile` を指定すると、OP は次のように振る舞います。

1. `feature.PAR` と `feature.JAR` を自動で有効にします。
2. `token_endpoint_auth_methods_supported` を FAPI 2.0 §5.3.2.1 の許可リストと突き合わせて絞り込みます。token endpoint 用のクライアントは `private_key_jwt` で構成してください。
3. `id_token_signing_alg_values_supported = ["ES256"]` を維持します。OP は ES256 でしか ID Token を署名・広告しません。これは本ライブラリの現在の鍵セットポリシーであり、FAPI 2.0 Security Profile は `PS256` と `EdDSA` も許可します。
4. `redirect_uri` の完全一致を強制します。ワイルドカードはどこにも許しません。
5. DPoP または mTLS の送信者制約要件を満たします。`feature.MTLS` が明示されていればそれを尊重し、どちらも選ばれていなければ `feature.DPoP` を追加します。

JAR では `profile.MaxRequestObjectAge(profile.FAPI2Baseline)` が `60 * time.Minute` を返します。`op.New` はこの値を request-object verifier に渡し、署名済み request object の `iat` 経過時間に適用します。`nbf` と `exp` の検証も引き続き行われます。

::: tip DPoP の代わりに mTLS
プロファイルの既定の送信者制約方式は、TLS クライアント証明書の設定が不要な DPoP です。mTLS に標準化している配備では `feature.MTLS` を明示し、TLS 終端プロキシ用に `op.WithMTLSProxy(...)` を設定してください。その明示選択があれば DPoP 既定は追加されません。

ここが意味するのは mTLS 送信者制約であり、token endpoint の mTLS クライアント認証ではありません。クライアントは `private_key_jwt` で登録し、転送された証明書は発行アクセストークンをクライアント鍵に結びつけるために使います。
:::

## 公開面確認

```sh
curl -s http://localhost:8080/.well-known/openid-configuration | jq '{
  pushed_authorization_request_endpoint,
  request_parameter_supported,
  dpop_signing_alg_values_supported,
  token_endpoint_auth_methods_supported,
  id_token_signing_alg_values_supported
}'
```

期待値:

```json
{
  "pushed_authorization_request_endpoint": "http://localhost:8080/oidc/par",
  "request_parameter_supported": true,
  "dpop_signing_alg_values_supported": ["ES256", "EdDSA", "PS256"],
  "token_endpoint_auth_methods_supported": ["private_key_jwt"],
  "id_token_signing_alg_values_supported": ["ES256"]
}
```

`id_token_signing_alg_values_supported` はプロファイルに関係なく `["ES256"]` のみで、OP が発行する ID Token はすべて `ES256` 署名です。現行の FAPI 2.0 Security Profile は JWT alg として `PS256`、`ES256`、`EdDSA` を許可します（§5.4.1）。本ライブラリの ID Token を ES256 のみにするポリシーは、これより厳しい設定です。`dpop_signing_alg_values_supported` は DPoP proof 受理用で `["ES256", "EdDSA", "PS256"]` です。

## 適合状況

本ライブラリの `profile.FAPI2Baseline` はポリシー設定であり、現行の最終版 Security Profile の全要件への適合を主張するものではありません。コア実装はリフレッシュトークンをローテーションしますが、FAPI 2.0 Security Profile §5.3.2.1(9) は例外的な状況を除く通常運用でのローテーションを禁止しています。また、クライアントアサーションの検証では `aud` にトークンエンドポイントの URL や配列も受け付けますが、§5.3.2.1(8) は issuer 識別子の文字列だけを求めます。適合を主張する前に、これらの差分を確認してください。

OFCS の [`fapi2-security-profile-id2-test-plan`](/ja/compliance/ofcs) はこの実装を検査します。最新ベースラインでは 48 PASSED / 9 REVIEW（手動レビュー）/ 1 SKIPPED（追加のクライアント鍵が必要な RSA 鍵での負例）/ **0 FAILED** です。

OFCS 全体像と REVIEW / SKIPPED 内訳は [OFCS 適合状況](/ja/compliance/ofcs) を参照。
