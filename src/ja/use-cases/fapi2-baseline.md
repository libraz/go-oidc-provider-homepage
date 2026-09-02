---
title: FAPI 2.0 Baseline
description: 1 つの指定で FAPI 2.0 Baseline の PAR、JAR、DPoP / mTLS、ES256、private_key_jwt、JAR 60 分上限を有効化。
pageClass: pg-use-cases-fapi2-baseline
---

# 使い方 — FAPI 2.0 Baseline

## FAPI 2.0 とは

**FAPI**（"Financial-grade API"）は OpenID Foundation が策定する OAuth 2.0 + OIDC のプロファイルです。OAuth / OIDC が任意として残している選択肢のうち、攻撃に使われやすいものを禁じます。たとえば `RS256` を避けて `ES256` / `PS256` を使う、すべての認可で PKCE を必須にする、送信者制約付きトークン（DPoP **または** mTLS）を必須にする、RP の `/auth` 要求を生のクエリ文字列ではなく PAR + JAR で送らせる、といった制約です。既定の mount が `/oidc` なら endpoint は `/oidc/auth` になります。本ライブラリは id_token を `ES256` のみで署名するため、FAPI の `RS256` 禁止要件は構造的に満たされます。

銀行・医療・行政の運用では、「安全なオプションを全部覚えているか」ではなく「決まったチェックリストに対して監査できるか」が問われます。FAPI 2.0 は FAPI 1.0（こちらも依然現役）の後継です。FAPI 2.0 Baseline は最低限の安全要件を固定し、FAPI 2.0 Message Signing は JARM + DPoP nonce + RS 側の応答署名を追加します。

本ライブラリは Baseline を **プロファイル 1 つの指定**（`op.WithProfile(profile.FAPI2Baseline)`）として公開します。必要な機能をまとめて有効にし、プロファイルに反する構成では `op.New` 自体が起動を拒否します。

PAR / JAR / JARM / DPoP / mTLS / ES256 など各略号の解説は [FAPI 2.0 入門](/ja/concepts/fapi) にあります。本ページは構成例を扱います。

::: details このページで触れる仕様
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — Final
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

> **ソース:** [`examples/03-fapi2/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) はプロファイルのフローを扱います。[`examples/50-fapi-tls-jwks`](https://github.com/libraz/go-oidc-provider/tree/main/examples/50-fapi-tls-jwks) は、TLS 1.2 の FAPI 1.0 RW cipher allow-list 用 `op.FAPITLSConfig()` と、client 登録前に private JWK material を取り除く `op.LoadPublicJWKS` を示します。Go は TLS 1.3 の cipher suite allow-list を公開していないため、TLS 1.3 配備では独自の `tls.Config` が必要です。

## FAPI 2.0 Baseline が要求するもの

| 要件 | RFC | ライブラリの挙動 |
|---|---|---|
| Pushed Authorization Requests | RFC 9126 | プロファイルが `feature.PAR` を自動有効化。`/par` で得た `request_uri` を authorize の入口にする。 |
| Proof Key for Code Exchange | RFC 7636 | `code_challenge_method=S256` 必須、`plain` 拒否。 |
| 送信者制約付きトークン（DPoP **または** mTLS） | RFC 9449 / RFC 8705 | このプロファイルでは `profile.RequiredAnyOf` が `{DPoP, MTLS}` を返すため、どちらか一方を満たせばよい。どちらも指定されていなければ、コンストラクタがインフラ前提の少ない DPoP を既定として選ぶ。 |
| ES256 署名 | RFC 7518 | `id_token_signing_alg_values_supported` は無条件で `["ES256"]`。`RS256` / `none` / `HS*` はそもそも公告しない。 |
| `redirect_uri` 完全一致 | FAPI 2.0 §5.3 | ワイルドカード無し、バイト一致比較。 |
| `private_key_jwt` クライアント認証 | FAPI 2.0 §3.1.3 | token endpoint のクライアント認証には `private_key_jwt` を使う。mTLS は送信者制約を満たせますが、mTLS をクライアント認証方式として扱う経路は未接続。 |

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">FAPI 2.0 Baseline の一連の流れ</div>
  <svg class="fig-svg" role="img" aria-labelledby="fapi2-arch-title" viewBox="0 0 960 412" xmlns="http://www.w3.org/2000/svg">
    <title id="fapi2-arch-title">FAPI 2.0 Baseline では、RP が認可リクエストを pushed authorization エンドポイントへ送り、request_uri を受け取ります。ブラウザが運ぶのはその参照だけです。トークンリクエストは private_key_jwt で認証され DPoP proof を伴い、返るトークンは DPoP 結び付き付きで ES256 署名です。</title>
    <line class="fg-life" x1="260" y1="62" x2="260" y2="404"/>
    <line class="fg-life fg-life--accent" x1="700" y1="62" x2="700" y2="404"/>
    <rect class="fg-box" x="170" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="260" y="35" text-anchor="middle">RP / クライアント</text>
    <text class="fg-mxs" x="260" y="49" text-anchor="middle">private_key_jwt + DPoP</text>
    <rect class="fg-box fg-box--accent" x="600" y="16" width="200" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="700" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="700" y="49" text-anchor="middle">go-oidc-provider</text>
    <circle class="fg-badge" cx="15" cy="104" r="8.5"/>
    <text class="fg-badge-t" x="15" y="107" text-anchor="middle">1</text>
    <path class="fg-edge" d="M260,104 H700" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="480" y="84" text-anchor="middle">POST /par</text>
    <text class="fg-mxs" x="480" y="97" text-anchor="middle">client_assertion=&lt;private_key_jwt&gt; · code_challenge=S256</text>
    <circle class="fg-badge" cx="15" cy="140" r="8.5"/>
    <text class="fg-badge-t" x="15" y="143" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M700,140 H260" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="480" y="134" text-anchor="middle">201 · request_uri=urn:…:&lt;id&gt; · expires_in</text>
    <circle class="fg-badge" cx="15" cy="176" r="8.5"/>
    <text class="fg-badge-t" x="15" y="179" text-anchor="middle">3</text>
    <path class="fg-edge" d="M260,176 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="480" y="170" text-anchor="middle">GET /authorize?request_uri=urn:…&amp;client_id</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="212" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="215" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M700,204 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="742" y="208">プロファイルに照らして検証する</text>
    <text class="fg-mxs" x="742" y="221">ES256 署名 · redirect_uri の完全一致</text>
    <circle class="fg-badge" cx="15" cy="258" r="8.5"/>
    <text class="fg-badge-t" x="15" y="261" text-anchor="middle">5</text>
    <rect class="fg-box fg-box--sub" x="170" y="240" width="620" height="36" rx="6"/>
    <text class="fg-xs" x="480" y="262" text-anchor="middle">interaction エンドポイント経由で、ユーザがログインして同意する</text>
    <circle class="fg-badge" cx="15" cy="306" r="8.5"/>
    <text class="fg-badge-t" x="15" y="309" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--accent" d="M700,306 H260" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="480" y="300" text-anchor="middle">302 redirect_uri?code=…&amp;state=…</text>
    <circle class="fg-badge" cx="15" cy="352" r="8.5"/>
    <text class="fg-badge-t" x="15" y="355" text-anchor="middle">7</text>
    <path class="fg-edge" d="M260,352 H700" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="480" y="332" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
    <text class="fg-mxs" x="480" y="345" text-anchor="middle">code · code_verifier · client_assertion</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="396" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="399" text-anchor="middle">8</text>
    <path class="fg-edge fg-edge--accent" d="M700,396 H260" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="480" y="376" text-anchor="middle">200</text>
    <text class="fg-mxs" x="480" y="389" text-anchor="middle">access_token（DPoP 結び付き付き）· id_token（ES256）· refresh_token</text>
  </svg>
  <figcaption class="fig-note">Baseline が前段に足しているのは手順 1 と 2 です。これ以降ブラウザが運ぶのはリクエスト本体ではなく参照になるため、URL バーに改竄する価値のあるものが残りません。</figcaption>
</figure>

## コード（[`examples/03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) からの抜粋）

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
  "github.com/libraz/go-oidc-provider/op/grant"
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
  op.WithGrants(grant.AuthorizationCode, grant.RefreshToken),
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

`WithProfile` を指定すると、OP は次のように振る舞います。

1. `feature.PAR` と `feature.JAR` を自動で有効にします。
2. `token_endpoint_auth_methods_supported` を FAPI 2.0 §3.1.3 の許可リストと突き合わせて絞り込みます。token endpoint 用のクライアントは `private_key_jwt` で構成してください。
3. `id_token_signing_alg_values_supported = ["ES256"]` を維持します。OP は ES256 でしか id_token を署名・広告しないため、FAPI 2.0 の `RS256` 禁止要件は構造的に満たされます。
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

`id_token_signing_alg_values_supported` はプロファイルに関係なく `["ES256"]` のみで、OP が発行する id_token はすべて `ES256` 署名です。FAPI 2.0 §6.2.1 の `RS256` 禁止要件は、OP 側の対応 alg に `RS256` が一切含まれないことで構造的に満たされます。`dpop_signing_alg_values_supported` は DPoP proof 受理用で `["ES256", "EdDSA", "PS256"]` です。

## 適合状況

OFCS の [`fapi2-security-profile-id2-test-plan`](/ja/compliance/ofcs) はこの実装を検査します。最新ベースラインでは 48 PASSED / 9 REVIEW（手動レビュー）/ 1 SKIPPED（追加のクライアント鍵が必要な RSA 鍵での負例）/ **0 FAILED** です。

OFCS 全体像と REVIEW / SKIPPED 内訳は [OFCS 適合状況](/ja/compliance/ofcs) を参照。
