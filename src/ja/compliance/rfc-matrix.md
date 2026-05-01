---
title: RFC 対応一覧
description: 本ライブラリがコード中で参照しているすべての規格を、実装パッケージとゲートになるオプション・feature とともに一覧化。
pageClass: rfc-matrix-page
---

# RFC 対応一覧

本ライブラリがコード中で参照しているすべての規格を、実装パッケージとゲートになるオプション・feature と対応づけて一覧化しています。

## ステータスの凡例

<span class="status-pill full">full</span> 仕様を end-to-end で実装しています。<br/>
<span class="status-pill partial">partial</span> OP として必要な部分は実装済みです（設計上スコープ外の任意章は除きます）。<br/>
<span class="status-pill planned">planned</span> 対応予定。まだ着地していません。<br/>
<span class="status-pill out">out</span> out-of-scope（設計上、本ライブラリの責務ではない）。<br/>
<span class="status-pill refused">refused</span> 意図的に拒否しています（例: `alg=none`）。

## OIDC core / discovery

| 仕様 | ステータス | 場所 |
|---|---|---|
| **OpenID Connect Core 1.0** | <span class="status-pill full">full</span> | `op/`、`internal/authorize`、`internal/tokenendpoint`、`internal/userinfo` |
| **OpenID Connect Discovery 1.0** | <span class="status-pill full">full</span> | `internal/discovery` |
| **OpenID Connect Dynamic Client Registration 1.0** | <span class="status-pill partial">partial</span>（主要フロー、`sector_identifier_uri` の fetch、`application_type=web` / `=native` ごとの redirect URI 規則、JWKs / pairwise / response_type のクロスチェック、PUT の reserved field 拒否までを強制。`GET /register/{id}` の応答からは `client_secret` を意図的に除外、`software_statement` も非対応） | `internal/registrationendpoint` |
| **OpenID Connect RP-Initiated Logout 1.0** | <span class="status-pill full">full</span> | `internal/endsession` |
| **OpenID Connect Back-Channel Logout 1.0** | <span class="status-pill full">full</span> | `internal/backchannel` |
| **OpenID Connect Front-Channel Logout 1.0** | <span class="status-pill planned">planned</span> | — |
| **OpenID Connect Session Management 1.0** | <span class="status-pill out">out</span>（サードパーティ cookie 依存のため。Back-Channel を推奨） | — |

## OAuth 2.0 系 RFC

| RFC | ステータス | 場所 / オプション |
|---|---|---|
| **RFC 6749** OAuth 2.0 Framework | <span class="status-pill full">full</span> | `op/`、`internal/authorize`、`internal/tokenendpoint` |
| **RFC 6750** Bearer Token Usage | <span class="status-pill full">full</span> | `internal/tokens` |
| **RFC 6819** Threat Model & Security Considerations | <span class="status-pill full">full</span>（本ライブラリの基礎にしている BCP） | コードベース全体 |
| **RFC 7009** Token Revocation | <span class="status-pill full">full</span>（`feature.Revoke` でゲート） | `internal/revokeendpoint` |
| **RFC 7521** Assertion Framework | <span class="status-pill full">full</span> | `internal/clientauth` |
| **RFC 7523** JWT Bearer Assertions for Client Auth | <span class="status-pill full">full</span>（`private_key_jwt`） | `internal/clientauth` |
| **RFC 7591** Dynamic Client Registration | <span class="status-pill partial">partial</span>（`feature.DynamicRegistration` で制限。`software_statement` は `invalid_software_statement` で拒否） | `internal/registrationendpoint` |
| **RFC 7592** DCR Management | <span class="status-pill partial">partial</span>（read / update / delete を実装。PUT の省略はフィールド削除ではなく server default への reset として扱い、応答での `client_secret` 再掲は `none` → confidential への auth method 昇格、または明示的な rotation 要求のいずれかに限定） | `internal/registrationendpoint` |
| **RFC 7636** PKCE | <span class="status-pill full">full</span>（`S256` のみ。`plain` は拒否） | `internal/pkce` |
| **RFC 7662** Token Introspection | <span class="status-pill full">full</span>（`feature.Introspect` でゲート） | `internal/introspectendpoint` |
| **RFC 7800** Confirmation Methods (`cnf`) | <span class="status-pill full">full</span> | `internal/dpop`、`internal/mtls`、`internal/tokens` |
| **RFC 8252** OAuth 2.0 for Native Apps | <span class="status-pill full">full</span>（loopback 制約を強制） | `internal/registrationendpoint`、`internal/authorize` |
| **RFC 8414** Authorization Server Metadata | <span class="status-pill full">full</span> | `internal/discovery` |
| **RFC 8485** Vectors of Trust | <span class="status-pill partial">partial</span>（ACR/AAL マッピング経由で消費） | `op/aal.go`、`op/acr.go` |
| **RFC 8628** Device Authorization Grant | <span class="status-pill planned">planned</span>（`grant.DeviceCode` 定数あり、未実装） | — |
| **RFC 8705** OAuth 2.0 mTLS Client Auth & Cert-Bound Tokens | <span class="status-pill full">full</span>（`feature.MTLS` でゲート） | `internal/mtls` |
| **RFC 8707** Resource Indicators | <span class="status-pill full">full</span> | `internal/tokenendpoint` |
| **RFC 8725** JWT Best Current Practices | <span class="status-pill full">full</span>（alg allow-list、typ チェック） | `internal/jose` |
| **RFC 9068** JWT Profile for Access Tokens | <span class="status-pill full">full</span> | `internal/tokens` |
| **RFC 9101** JAR (JWT-Secured Authorization Request) | <span class="status-pill full">full</span>（`feature.JAR` でゲート） | `internal/jar` |
| **RFC 9126** PAR (Pushed Authorization Requests) | <span class="status-pill full">full</span>（`feature.PAR` でゲート） | `internal/parendpoint` |
| **RFC 9207** OAuth 2.0 Authorization Server Issuer Identifier | <span class="status-pill full">full</span> | `internal/authorize`（応答に `iss` パラメータを付与） |
| **RFC 9396** Rich Authorization Requests (`authorization_details`) | <span class="status-pill full">full</span>（JAR マージと authorize で消費） | `internal/jar`、`internal/authorize` |
| **RFC 9449** DPoP | <span class="status-pill full">full</span>（§8 nonce フロー含む。`feature.DPoP` でゲート） | `internal/dpop`、`op.WithDPoPNonceSource` |
| **RFC 9470** OAuth 2.0 Step Up Authentication Challenge | <span class="status-pill full">full</span> | `op/rule.go`（`RuleACR`） |
| **RFC 9700** OAuth 2.0 Security Best Current Practice | <span class="status-pill full">full</span> | コードベース全体 |
| **RFC 9701** JWT Response for OAuth 2.0 Token Introspection | <span class="status-pill planned">planned</span> | — |

## JOSE 系

| RFC | ステータス | 場所 |
|---|---|---|
| **RFC 7515** JWS | <span class="status-pill full">full</span> | `internal/jose` |
| **RFC 7517** JWK | <span class="status-pill full">full</span> | `internal/jwks` |
| **RFC 7518** JWA | <span class="status-pill partial">partial</span> — `RS256`、`PS256`、`ES256`、`EdDSA` のみ受理。`HS*` と `none` は <span class="status-pill refused">refused</span> | `internal/jose` |
| **RFC 7519** JWT | <span class="status-pill full">full</span> | `internal/jose` |
| **RFC 7638** JWK Thumbprint | <span class="status-pill full">full</span>（DPoP `cnf.jkt` で使用） | `internal/dpop` |
| **RFC 8037** Edwards-curve DSA / `EdDSA` | <span class="status-pill full">full</span>（Ed25519。Ed448 は無効） | `internal/jose` |

## FAPI 系

| プロファイル | ステータス | 切り替え |
|---|---|---|
| **FAPI 2.0 Baseline** | <span class="status-pill full">full</span>（継続回帰検査。[OFCS](/ja/compliance/ofcs) 参照） | `op.WithProfile(profile.FAPI2Baseline)` |
| **FAPI 2.0 Message Signing** | <span class="status-pill full">full</span>（継続回帰検査） | `op.WithProfile(profile.FAPI2MessageSigning)` |
| **FAPI 1.0 Advanced** | <span class="status-pill out">out</span> | —（FAPI 2.0 を使用） |
| **FAPI-CIBA** | <span class="status-pill planned">planned</span>（v1.x） | `profile.FAPICIBA`（定数あり） |
| **OpenID iGov High** | <span class="status-pill planned">planned</span>（v2） | `profile.IGovHigh`（定数あり） |

## その他、ライブラリが参照する RFC

| RFC | 用途 |
|---|---|
| **RFC 1918** | Back-Channel Logout SSRF 防御のプライベートネットワーク拒否リスト |
| **RFC 3986** | URI パース |
| **RFC 4122** | UUIDv4 生成 |
| **RFC 4514** | mTLS subject DN の DN 処理 |
| **RFC 4648** | Base64url エンコーディング |
| **RFC 5280** | X.509 証明書検証 |
| **RFC 6238** | TOTP authenticator |
| **RFC 6265** | Cookie 構文 |
| **RFC 6711** | Authentication Context Class Reference 値レジストリ |
| **RFC 7230 / 7231 / 7232 / 7235** | HTTP/1.1（現在は RFC 9110 が後継） |
| **RFC 7807** | `application/problem+json`（一部のエラー経路） |
| **RFC 8176** | AMR 値レジストリ |
| **RFC 8259** | JSON |
| **RFC 9110** | HTTP セマンティクス |

## 検証方法

この一覧は最新のソース（`op/` と `internal/`）を grep して作成しています。手元で再現できます。

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhoE 'RFC [0-9]+' op/ internal/ | sort -u
```

上の表は、そのコマンドの出力結果をベースにしつつ、ライブラリにとって規範的（normative）なものは強調表示し、周辺的（incidental）なものは「その他」にまとめたものです。
