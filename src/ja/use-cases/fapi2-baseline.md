---
title: FAPI 2.0 Baseline
description: 1 つのプロファイル指定で PAR、JAR、DPoP、ES256 署名、FAPI 用のクライアント認証制約を有効化。
pageClass: pg-use-cases-fapi2-baseline
---

# 使い方 — FAPI 2.0 Baseline

## FAPI 2.0 とは

**FAPI**（"Financial-grade API"）は OpenID Foundation が策定する OAuth 2.0 + OIDC のプロファイルです。OAuth / OIDC が任意として残している選択肢のうち、攻撃に使われやすいものを禁じます。たとえば `RS256` を避けて `ES256` / `PS256` を使う、すべての認可で PKCE を必須にする、送信者制約付きトークン（DPoP **または** mTLS）を必須にする、RP の `/authorize` 要求を生のクエリ文字列ではなく PAR + JAR で送らせる、といった制約です。本ライブラリは id_token を `ES256` のみで署名するため、FAPI の `RS256` 禁止要件は構造的に満たされます。

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
| 送信者制約付きトークン（DPoP **または** mTLS） | RFC 9449 / RFC 8705 | どちらか一方を必須化。どちらも指定されていなければ、インフラ前提の少ない DPoP を既定として選ぶ。 |
| ES256 署名 | RFC 7518 | `id_token_signing_alg_values_supported` は無条件で `["ES256"]`。`RS256` / `none` / `HS*` はそもそも公告しない。 |
| `redirect_uri` 完全一致 | FAPI 2.0 §5.3 | ワイルドカード無し、バイト一致比較。 |
| `private_key_jwt` クライアント認証 | FAPI 2.0 §3.1.3 | token endpoint のクライアント認証には `private_key_jwt` を使う。mTLS は送信者制約を満たせますが、mTLS をクライアント認証方式として扱う経路は未接続。 |

## アーキテクチャ

<svg class="fapi2-flow-dg" role="img" aria-labelledby="fapi2-baseline-flow-title" viewBox="0 0 720 456" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="fapi2-baseline-flow-title">FAPI 2.0 Baseline のシーケンス: RP が認可要求を /par に送り、OP が request_uri を返し、/authorize と /token を経て OP が ES256 署名の DPoP 結びつき付きトークンを発行するまで。</title>
  <line class="life" x1="150" y1="68" x2="150" y2="448"/>
  <line class="life op-accent" x1="570" y1="68" x2="570" y2="448"/>
  <rect x="75" y="14" width="150" height="30" rx="5"/>
  <rect class="op-accent" x="495" y="14" width="150" height="30" rx="5"/>
  <text class="d-actor" x="150" y="33" text-anchor="middle">RP / クライアント</text>
  <text class="d-actor op-fill" x="570" y="33" text-anchor="middle">OP</text>
  <text class="d-cap" x="150" y="58" text-anchor="middle">private_key_jwt + DPoP</text>
  <text class="d-cap op-fill" x="570" y="58" text-anchor="middle">本ライブラリ</text>
  <text class="d-prose" x="360" y="98" text-anchor="middle">1 · POST /par</text>
  <text class="d-mono" x="360" y="110" text-anchor="middle">client_assertion=&lt;private_key_jwt&gt; · code_challenge=S256</text>
  <line x1="150" y1="118" x2="570" y2="118"/>
  <path d="M563,114 L570,118 L563,122"/>
  <text class="d-mono" x="360" y="150" text-anchor="middle">2 · 201 · request_uri=urn:…:&lt;id&gt; · expires_in</text>
  <line x1="570" y1="158" x2="150" y2="158"/>
  <path d="M157,154 L150,158 L157,162"/>
  <text class="d-mono" x="360" y="190" text-anchor="middle">3 · GET /authorize?request_uri=urn:…&amp;client_id</text>
  <line x1="150" y1="198" x2="570" y2="198"/>
  <path d="M563,194 L570,198 L563,202"/>
  <path class="op-accent" d="M570,224 h-16 v28 h16"/>
  <path class="op-accent" d="M563,246 L570,250 L563,254"/>
  <text class="d-prose op-fill" x="544" y="234" text-anchor="end">4 · ES256 で id_token 署名</text>
  <text class="d-mono" x="544" y="248" text-anchor="end">redirect_uri 完全一致</text>
  <text class="d-prose" x="360" y="290" text-anchor="middle">5 · ログイン + 同意（interaction 経由）</text>
  <line x1="570" y1="298" x2="150" y2="298"/>
  <path d="M157,294 L150,298 L157,302"/>
  <text class="d-mono" x="360" y="326" text-anchor="middle">6 · 302 redirect_uri?code=…&amp;state=…</text>
  <line x1="570" y1="334" x2="150" y2="334"/>
  <path d="M157,330 L150,334 L157,338"/>
  <text class="d-prose" x="360" y="364" text-anchor="middle">7 · POST /token · DPoP: &lt;proof&gt;</text>
  <text class="d-mono" x="360" y="376" text-anchor="middle">code + code_verifier + client_assertion</text>
  <line x1="150" y1="384" x2="570" y2="384"/>
  <path d="M563,380 L570,384 L563,388"/>
  <text class="d-prose" x="360" y="414" text-anchor="middle">8 · 200</text>
  <text class="d-mono" x="360" y="426" text-anchor="middle">access_token（DPoP 結びつき付き）· id_token（ES256）· refresh_token</text>
  <line x1="570" y1="434" x2="150" y2="434"/>
  <path d="M157,430 L150,434 L157,438"/>
</svg>

## コード（[`examples/03-fapi2`](https://github.com/libraz/go-oidc-provider/tree/main/examples/03-fapi2) からの抜粋）

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/profile"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

const (
  demoIssuer      = "https://op.example.com"
  demoClientID    = "fapi2-example-client"
  demoRedirectURI = "https://rp.example.com/callback"
)

provider, err := op.New(
  op.WithIssuer(demoIssuer),
  op.WithStore(inmem.New()),
  op.WithKeyset(opKeys.Keyset()),
  op.WithCookieKeys(opKeys.CookieKey),
  op.WithProfile(profile.FAPI2Baseline), // <--- プロファイル切り替え
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

`WithProfile` 呼び出しは:

1. `feature.PAR` と `feature.JAR` を自動有効化。
2. `token_endpoint_auth_methods_supported` を FAPI 2.0 §3.1.3 の許可リストに絞り込み。token endpoint 用のクライアントは `private_key_jwt` で構成します。
3. `id_token_signing_alg_values_supported = ["ES256"]` を維持。OP は ES256 でしか id_token を署名・広告しないため、FAPI 2.0 の `RS256` 禁止要件は構造的に満たされます。
4. `redirect_uri` の完全一致を強制（どこにもワイルドカード無し）。
5. DPoP または mTLS の送信者制約は、明示された `feature.MTLS` があればそれを尊重し、どちらも選ばれていない場合は `feature.DPoP` を追加して満たす。

::: tip DPoP の代わりに mTLS
プロファイルの既定の送信者制約方式は、TLS クライアント証明書の配線が不要な DPoP です。mTLS に標準化している配備では `feature.MTLS` を明示し、TLS 終端プロキシ用に `op.WithMTLSProxy(...)` を設定してください。その明示選択があれば DPoP 既定は追加されません。

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
