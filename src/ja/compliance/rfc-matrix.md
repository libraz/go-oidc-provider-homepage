---
title: RFC 対応一覧
description: 本ライブラリがコード中で参照しているすべての規格を、実装パッケージとゲートになるオプション・feature とともに一覧化。
pageClass: rfc-matrix-page pg-compliance-rfc-matrix
---

# RFC 対応一覧

本ライブラリがコード中で参照しているすべての規格を、実装パッケージとゲートになるオプション・feature と対応づけて一覧化しています。

<figure class="fig">
  <div class="fig-head">仕様をどう分類しているか</div>
  <svg class="fig-svg" role="img" aria-labelledby="rfc-matrix-shape-title" viewBox="0 0 960 216" xmlns="http://www.w3.org/2000/svg">
    <title id="rfc-matrix-shape-title">一覧に載る仕様は、まずそもそも OP の責務かどうかで分けます。OP の責務であるものは full・partial・planned に、そうでないものは out of scope・refused に分類します。</title>
    <rect class="fg-box" x="36" y="70" width="264" height="76" rx="8"/>
    <text class="fg-t2" x="56" y="98">1 つの仕様</text>
    <text class="fg-mxs" x="56" y="120">RFC · OIDC · FAPI</text>
    <text class="fg-xs" x="56" y="138">一覧の 1 行にあたる</text>
    <path class="fg-edge" d="M304,108 H336" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="340" y="70" width="264" height="76" rx="8"/>
    <text class="fg-t2 fg-accent" x="360" y="98">そもそも OP の責務か</text>
    <text class="fg-xs" x="360" y="120">RP やリソースサーバがすべきことを</text>
    <text class="fg-xs" x="360" y="138">定めている仕様も存在する</text>
    <path class="fg-leader" d="M608,108 H624 M624,62 V162"/>
    <path class="fg-edge fg-edge--thin" d="M624,62 H640" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M624,162 H640" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="644" y="28" width="280" height="68" rx="8"/>
    <text class="fg-t2" x="662" y="50">責務である</text>
    <rect class="fg-box fg-box--ok" x="662" y="60" width="62" height="22" rx="5"/>
    <text class="fg-mxs" x="674" y="75">full</text>
    <rect class="fg-box fg-box--warn" x="732" y="60" width="76" height="22" rx="5"/>
    <text class="fg-mxs" x="744" y="75">partial</text>
    <rect class="fg-box fg-box--accent" x="816" y="60" width="88" height="22" rx="5"/>
    <text class="fg-mxs" x="828" y="75">planned</text>
    <rect class="fg-box" x="644" y="128" width="280" height="68" rx="8"/>
    <text class="fg-t2" x="662" y="150">責務ではない</text>
    <rect class="fg-box fg-box--muted" x="662" y="160" width="118" height="22" rx="5"/>
    <text class="fg-mxs" x="674" y="175">out of scope</text>
    <rect class="fg-box fg-box--danger" x="788" y="160" width="92" height="22" rx="5"/>
    <text class="fg-mxs" x="800" y="175">refused</text>
  </svg>
  <figcaption class="fig-note">out of scope と refused は別の主張です。前者はその仕様が他者の担当だという意味で、後者は OP の担当でありながら意図的に採らないという意味です。後者には必ず理由を記録しています。</figcaption>
</figure>

## ステータスの凡例

<span class="status-pill full">full</span> その仕様について本ライブラリが対象とする OP 側 surface を end-to-end で実装しています。<br/>
<span class="status-pill partial">partial</span> OP として必要な部分は実装済みです（設計上スコープ外の任意章は除きます）。<br/>
<span class="status-pill planned">planned</span> 対応予定。まだ着地していません。<br/>
<span class="status-pill out">out</span> out-of-scope（設計上、本ライブラリの責務ではない）。<br/>
<span class="status-pill refused">refused</span> 意図的に拒否しています（例: `alg=none`）。

この区分は実装範囲を示すもので、OpenID Foundation の認証取得を意味しません。`full` とした行も、その行に記した制限やライブラリの対象外事項まで満たすという意味ではありません。

## OIDC core / discovery

| 仕様 | ステータス | 場所 |
|---|---|---|
| **OpenID Connect Core 1.0** | <span class="status-pill partial">partial</span>（`response_type` は `code` のみ。Aggregated / Distributed claim types §5.6.2 は emit せず、pairwise sub §8.1 は `op.WithPairwiseSubject` で実装済み。詳細は下の「設計上の対象外」セクション） | `op/`、`internal/authorize`、`internal/tokenendpoint`、`internal/userinfo`、`internal/sector` |
| **OpenID Connect Discovery 1.0** | <span class="status-pill partial">partial</span>（メタデータエンドポイントを実装。ただし Discovery が必須とする `RS256` を `id_token_signing_alg_values_supported` に含めない） | `internal/discovery` |
| **OpenID Connect Dynamic Client Registration 1.0** | <span class="status-pill partial">partial</span>（主要フロー、`sector_identifier_uri` の取得、`application_type=web` / `=native` ごとの redirect URI 規則、JWKs / pairwise / response_type のクロスチェック、PUT の予約フィールド拒否、`post_logout_redirect_uris` の往復、5 種の JWE alg/enc encrypted-response メタデータまでを強制。`GET /register/{id}` の応答からは `client_secret` を意図的に除外、`software_statement` も非対応） | `internal/registrationendpoint` |
| **OpenID Connect RP-Initiated Logout 1.0** | <span class="status-pill full">full</span> | `internal/endsession` |
| **OpenID Connect Back-Channel Logout 1.0** | <span class="status-pill full">full</span> | `internal/backchannel` |
| **OpenID Connect Front-Channel Logout 1.0** | <span class="status-pill out">out</span>（iframe / third-party-cookie 依存の通知方式は意図的に非実装。Back-Channel Logout を使う） | — |
| **OpenID Connect Session Management 1.0** | <span class="status-pill out">out</span>（サードパーティ cookie 依存のため。Back-Channel を推奨） | — |
| **OpenID Connect CIBA Core 1.0** | <span class="status-pill partial">partial</span>（poll 配信のみ。ping / push は対象外） | `internal/ciba`、`internal/cibaendpoint`、`op.WithCIBA` |

## OAuth 2.0 系 RFC

| RFC | ステータス | 場所 / オプション |
|---|---|---|
| **RFC 6749** OAuth 2.0 Framework | <span class="status-pill partial">partial</span>（authorization-code、refresh-token、client-credentials の surface。implicit grant と password grant は意図的に非実装） | `op/`、`internal/authorize`、`internal/tokenendpoint` |
| **RFC 6750** Bearer Token Usage | <span class="status-pill partial">partial</span>（OP 発行 bearer token と、UserInfo / introspection など OP が持つ resource endpoint。一般的な RS challenge 挙動はリソースサーバ側の責務） | `internal/tokens`、`internal/userinfo`、`internal/introspectendpoint` |
| **RFC 6819** Threat Model & Security Considerations | <span class="status-pill partial">partial</span>（OP 全体に適用しているセキュリティ指針。独立したプロトコル surface ではない） | コードベース全体 |
| **RFC 7009** Token Revocation | <span class="status-pill full">full</span>（`feature.Revoke` でゲート） | `internal/revokeendpoint` |
| **RFC 7521** Assertion Framework | <span class="status-pill partial">partial</span>（`private_key_jwt` クライアント認証のみ。assertion grant と `client_secret_jwt` は意図的に非実装） | `internal/clientauth` |
| **RFC 7523** JWT Bearer Assertions for Client Auth | <span class="status-pill partial">partial</span>（`private_key_jwt`。JWT bearer authorization grant と `client_secret_jwt` は非実装で、`client_secret_jwt` は登録時点で `invalid_client_metadata` として拒否） | `internal/clientauth` |
| **RFC 7591** Dynamic Client Registration | <span class="status-pill partial">partial</span>（`feature.DynamicRegistration` で制限。`software_statement` は `invalid_software_statement` で拒否） | `internal/registrationendpoint` |
| **RFC 7592** DCR Management | <span class="status-pill partial">partial</span>（read / update / delete を実装。PUT の省略はフィールド削除ではなくサーバデフォルトへのリセットとして扱い、応答での `client_secret` 再掲は `none` → confidential への auth method 昇格、または明示的な rotation 要求のいずれかに限定） | `internal/registrationendpoint` |
| **RFC 7636** PKCE | <span class="status-pill full">full</span>（`S256` のみ。`plain` は拒否） | `internal/pkce` |
| **RFC 7662** Token Introspection | <span class="status-pill full">full</span>（`feature.Introspect` でゲート） | `internal/introspectendpoint` |
| **RFC 7800** Confirmation Methods (`cnf`) | <span class="status-pill full">full</span> | `internal/dpop`、`internal/mtls`、`internal/tokens` |
| **RFC 8252** OAuth 2.0 for Native Apps | <span class="status-pill partial">partial</span>（OP 側の native redirect / loopback 制約を強制。client app 側の挙動は対象外） | `internal/registrationendpoint`、`internal/authorize` |
| **RFC 8414** Authorization Server Metadata | <span class="status-pill full">full</span> | `internal/discovery` |
| **RFC 8485** Vectors of Trust | <span class="status-pill partial">partial</span>（ACR/AAL マッピング経由で消費） | `op/aal.go`、`op/acr.go` |
| **RFC 8628** Device Authorization Grant | <span class="status-pill full">full</span>（`op.WithDeviceCodeGrant` で有効化。`slow_down` の段階的な延長は `LastPolledAt` と原子的に永続化、`op/devicecodekit` が総当たり対策と revoke 用 audit hook を同梱） | `internal/devicecode`、`internal/devicecodeendpoint`、`op/devicecodekit` |
| **RFC 8693** OAuth 2.0 Token Exchange | <span class="status-pill full">full</span>（`op.RegisterTokenExchange` でゲート。actor が subject と異なる場合は act チェーン必須、cnf はリクエストの DPoP / mTLS で再バインド） | `internal/customgrant/tokenexchange` |
| **RFC 8705** OAuth 2.0 mTLS Client Auth & Cert-Bound Tokens | <span class="status-pill partial">partial</span>（`feature.MTLS` は証明書バインドアクセストークンと `mtls_endpoint_aliases` を接続。token endpoint の `tls_client_auth` / `self_signed_tls_client_auth` 振り分けは未接続） | `internal/mtls` |
| **RFC 8707** Resource Indicators | <span class="status-pill partial">partial</span>（authorize / token / device / CIBA での正規化と client 許可リスト検証を実装。組み込み grant は現在、多くの発行経路を単一 resource 値に絞る） | `internal/resourceindicator`、`internal/authorize`、`internal/tokenendpoint`、`internal/devicecodeendpoint`、`internal/cibaendpoint` |
| **RFC 8725** JWT Best Current Practices | <span class="status-pill full">full</span>（alg 許可リスト、typ チェック） | `internal/jose` |
| **RFC 9068** JWT Profile for Access Tokens | <span class="status-pill partial">partial</span>（JWT の発行は ES256 のみですが、§2.1 は RS256 対応を求めます。また、検証側は §2.2 で必須の `jti` を持たないトークンも受け付けます） | `internal/tokens` |
| **RFC 9101** JAR (JWT-Secured Authorization Request) | <span class="status-pill full">full</span>（`feature.JAR` でゲート） | `internal/jar` |
| **RFC 9126** PAR (Pushed Authorization Requests) | <span class="status-pill full">full</span>（`feature.PAR` でゲート） | `internal/parendpoint` |
| **RFC 9207** OAuth 2.0 Authorization Server Issuer Identifier | <span class="status-pill full">full</span> | `internal/authorize`（応答に `iss` パラメータを付与） |
| **RFC 9396** Rich Authorization Requests (`authorization_details`) | <span class="status-pill full">full</span>（`op.WithAuthorizationDetailTypes` で有効化。`/authorize`、`/par`、`/token` で検証し、grant に永続化し、JWT アクセストークンと introspection に反映し、discovery で公開） | `internal/authorizationdetails`、`op/authorization_details.go` |
| **RFC 9449** DPoP | <span class="status-pill full">full</span>（§8 nonce フロー含む。`feature.DPoP` でゲート） | `internal/dpop`、`op.WithDPoPNonceSource` |
| **RFC 9470** OAuth 2.0 Step Up Authentication Challenge | <span class="status-pill full">full</span>（OP は ACR rule で `acr_values` / `max_age` の再認証を尊重。`op.StepUpChallenge` が組み込み側 RS の返す `WWW-Authenticate` challenge を組み立てる） | `op/rule.go`（`RuleACR`）、`op/stepup.go` |
| **RFC 9700** OAuth 2.0 Security Best Current Practice | <span class="status-pill partial">partial</span>（OP 側 BCP posture。リソースサーバ / client 側要件は組み込み側の責務） | コードベース全体 |
| **RFC 9701** JWT Response for OAuth 2.0 Token Introspection | <span class="status-pill full">full</span>（既定は signed JWT。client の `introspection_encrypted_response_alg` / `_enc` メタデータに応じて JWE で wrap） | `internal/introspectendpoint`、`internal/jose` |
| **RFC 9728** OAuth 2.0 Protected Resource Metadata | <span class="status-pill full">full</span>（`op.WithProtectedResources` で有効化。`/.well-known/oauth-protected-resource` で配信し、`authorization_servers` に issuer を刻む） | `internal/protectedresource`、`op/protected_resource.go` |

## IETF ドラフト

| ドラフト | ステータス | 場所 |
|---|---|---|
| **OAuth 2.0 Grant Management**（`draft-ietf-oauth-grant-management`） | <span class="status-pill partial">partial</span>（`op.WithGrantManagement` で有効化。`grant_management_action` / `grant_id` を処理し、query / revoke エンドポイントをマウントし、token 応答に `grant_id` を載せ、discovery で公開。IETF draft 追跡のため draft 更新で surface が変わり得る） | `internal/grantmgmtendpoint`、`op/grant_management.go` |

## JOSE 系

| RFC | ステータス | 場所 |
|---|---|---|
| **RFC 7515** JWS | <span class="status-pill partial">partial</span>（JWT / JAR / JARM / DPoP / client assertion で使う compact JWS surface。general JSON serialization は公開しない） | `internal/jose` |
| **RFC 7516** JWE | <span class="status-pill partial">partial</span> — 閉じた許可リスト（`RSA-OAEP-256` / `ECDH-ES{,+A128KW,+A256KW}` × `A{128,256}GCM`）。inbound JWE request_object（JAR / PAR §6.1）、outbound JWE id_token、JWT-shape userinfo、JARM authorization 応答、RFC 9701 introspection 応答を実装済み。`RSA1_5` は <span class="status-pill refused">refused</span>（CVE-2017-11424 padding oracle）。`RSA-OAEP-384/512`、`dir`、対称鍵のみの `A*KW` は v2+ で対応 | `internal/jose`、`op.WithEncryptionKeyset` |
| **RFC 7517** JWK | <span class="status-pill partial">partial</span>（対応済み非対称鍵種の JWK Set 公開と client JWKS 消費。署名用途の対称 `oct` 鍵は受理しない） | `internal/jwks` |
| **RFC 7518** JWA | <span class="status-pill partial">partial</span> — 発行は `ES256` のみ。検証は `RS256`、`PS256`、`ES256`、`EdDSA` を受理。`HS*` と `none` は <span class="status-pill refused">refused</span> | `internal/jose` |
| **RFC 7519** JWT | <span class="status-pill partial">partial</span>（OIDC / OAuth 拡張で使う signed / encrypted JWT surface。unsecured JWT は拒否） | `internal/jose` |
| **RFC 7638** JWK Thumbprint | <span class="status-pill full">full</span>（DPoP `cnf.jkt` で使用） | `internal/dpop` |
| **RFC 8037** Edwards-curve DSA / `EdDSA` | <span class="status-pill partial">partial</span>（Ed25519。Ed448 は無効） | `internal/jose` |

## FAPI 系

Go の識別子 `FAPI2Baseline` には旧称の *Baseline* が残っています。現行の Final 仕様名は [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) です。ここで参照する OFCS の結果は、名前を明記した Implementer's Draft のテストプランに対するもので、Final 仕様の全要件への適合を示すものではありません。特に本ライブラリはリフレッシュトークンをローテーションしますが、Security Profile §5.3.2.1(9) が認めるのは例外的な事情がある場合だけです。また、本ライブラリは `private_key_jwt` の `aud` としてトークンエンドポイントの URL や配列も受け付けますが、§5.3.2.1(8) は issuer 識別子の文字列だけを受け付けるよう求めます。これらは現行 Final 仕様との適合上の差分です。

| プロファイル | ステータス | 切り替え |
|---|---|---|
| **FAPI 2.0 Security Profile** | <span class="status-pill partial">partial</span>（PAR、PKCE、送信者制約付きトークンを実装。この設定はライブラリ独自の選択として JAR も要求します。上記の Final 仕様との差分と [OFCS](/ja/compliance/ofcs) を参照） | `op.WithProfile(profile.FAPI2Baseline)` |
| **FAPI 2.0 Message Signing** | <span class="status-pill partial">partial</span>（JAR と JARM を実装。Final 仕様では署名機能ごとの適合が可能で、Security Profile の要件も引き継ぎます） | `op.WithProfile(profile.FAPI2MessageSigning)` |
| **FAPI 1.0 Advanced** | <span class="status-pill out">out</span> | —（FAPI 2.0 を使用） |
| **FAPI-CIBA** | <span class="status-pill partial">partial</span>（ライブラリの設定: poll モード、`JAR`、DPoP または mTLS、アクセストークンの有効期間の上限 10 分、`requested_expiry` の上限 600 秒、アクセストークンの失効処理。旧 ID1 プランは mTLS を使い、デモも明示的に選びます。リクエストオブジェクトの経過時間 60 分という上限はライブラリの制約です。[OFCS](/ja/compliance/ofcs) を参照） | `op.WithProfile(profile.FAPICIBA)` |
| **OpenID iGov High** | <span class="status-pill out">out</span> | — |

プロファイル列挙にはもうひとつ `profile.Baseline` があります。これは FAPI プロファイルではなく、OAuth 2.1 / RFC 9700 の姿勢を宣言し、confidential client も含めたすべての authorization-code request に PKCE を要求します。[使い方: セキュリティプロファイルの宣言](/ja/use-cases/security-profile) を参照。

## その他、ライブラリが参照する RFC

| RFC | 用途 |
|---|---|
| **RFC 1918** | Back-Channel Logout SSRF 防御のプライベートネットワーク拒否リスト |
| **RFC 2606** | テスト / 例で使う予約済み example domain |
| **RFC 3986** | URI パース |
| **RFC 4122** | UUIDv4 生成 |
| **RFC 4226** | TOTP authenticator が使う HOTP の土台 |
| **RFC 4514** | mTLS subject DN の DN 処理 |
| **RFC 4648** | Base64url エンコーディング |
| **RFC 5280** | X.509 証明書検証 |
| **RFC 5321** | Email OTP 入力に対する SMTP アドレス長の上限 |
| **RFC 6238** | TOTP authenticator |
| **RFC 6265** | Cookie 構文 |
| **RFC 6711** | Authentication Context Class Reference 値レジストリ |
| **RFC 7230 / 7231 / 7232 / 7235** | HTTP/1.1（現在は RFC 9110 が後継） |
| **RFC 7239** | trusted proxy 処理での `Forwarded` header パース |
| **RFC 7807** | `application/problem+json`（一部のエラー経路） |
| **RFC 8017** | JOSE 経由で参照する RSA-PSS / RSA-OAEP アルゴリズム |
| **RFC 8141** | PAR `request_uri` 値の URN 処理 |
| **RFC 8176** | AMR 値レジストリ |
| **RFC 8259** | JSON |
| **RFC 9110** | HTTP セマンティクス |

## 設計上の対象外

OIDC Core や周辺 OAuth 仕様には登場するものの、本ライブラリでは意図的に実装していない項目があります。隣接リポジトリの `test/scenarios/catalog/<feature>.yaml` に `status: out-of-scope` 行として記録され、ほかのテストと同じ場所で棚卸しできるようになっています。

- **`response_type` は `code` のみ。** Implicit（`id_token`、`id_token token`）、hybrid（`code id_token` ほか）、`response_type=none` はいずれも発行しません。RFC 9700 §2.1.2 が implicit grant を非推奨化しており、FAPI 2.0 は code を必須としています。Discovery も `response_types_supported: ["code"]` だけを広告します。
- **`fragment` response mode は配信路として実装していません。** `code` のみの発行では URL fragment に入れるものがないためです。`query` と `form_post` は両方とも実装されています（`form_post` は OIDC Core Form Post Response Mode 1.0 に従って自動送信 HTML フォームを返します）。`feature.JARM` を有効にすると 4 種の `*.jwt` バリアントも有効になります。Discovery は既定で `response_modes_supported: ["query", "form_post"]` を広告し、JARM 有効時には `*.jwt` モードを追加で広告します。
- **Aggregated / Distributed claim types（OIDC Core §5.6.2）は emit しません。** Normal claim のみを出力します。`_claim_names` / `_claim_sources` といったキーはトークンにも UserInfo 応答にも一切登場しません。
- **`client_secret_jwt` は登録時点で拒否します。** 代わりに `private_key_jwt` を使ってください。HMAC 共有秘密 JWT プロファイルは `invalid_client_metadata: token_endpoint_auth_method client_secret_jwt is not supported` で拒否されます。
- **JWE alg / enc の許可リストは閉じています。** 既定値は `RSA-OAEP-256` + `ECDH-ES{,+A128KW,+A256KW}`（key-wrap）と `A{128,256}GCM`（content）です。`WithSupportedEncryptionAlgs` は **狭める** だけで、広げることはできません。`RSA1_5` は永続的に拒否（CVE-2017-11424）。`RSA-OAEP-384` / `RSA-OAEP-512`、`dir`、対称鍵のみの `A*KW` は v2+ で対応します。
- **CIBA の push / ping 配信モードは未実装。** Discovery は `backchannel_token_delivery_modes_supported: ["poll"]` のみを広告するので、クライアント側からこの 2 モードを交渉することはできません。
- **Custom-grant ハンドラはリフレッシュトークン値を渡せません。** リフレッシュトークンを発行したいハンドラは `CustomGrantResponse.IssueRefreshToken` を立てます。OP が自分の `RefreshTokenStore` で資格情報を生成・永続化するため、親子関係、ローテーション、再利用時の連鎖失効、DPoP / mTLS バインディングが保たれます。クライアントが `refresh_token` grant に登録されていない場合でもアクセストークン応答は成功し、リフレッシュトークンだけが省略され、`custom_grant.refresh_dropped` が記録されます。

## 範囲外（意図的）

OAuth / OIDC 圏のすべての RFC が OP の責務というわけではありません。以下は意図的に対応していない仕様で、リソースサーバ・クライアント SDK・その他のレイヤが受け持つべき領域です。

| 仕様 | 対応状況 | 備考 |
|---|---|---|
| **RFC 9421 — HTTP Message Signatures** | <span class="status-pill out">out</span> | リソースサーバ（API 保護）側の関心事であり、OP の責務ではありません。OP 側の対応する仕組みは、認可リクエスト署名に JAR (RFC 9101)、認可レスポンス署名に JARM、`/token` と `/userinfo` の所持証明に DPoP (RFC 9449) です。RS 側の HTTP 署名は組み込み側で実装してください。 |

## 検証方法

この一覧は最新のソース（`op/` と `internal/`）を grep して作成しています。手元で再現できます。

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -rhoE 'RFC [0-9]+' op/ internal/ | sort -u
```

上の表は、そのコマンドの出力結果をベースにしつつ、ライブラリにとって規範的（normative）なものは強調表示し、周辺的（incidental）なものは「その他」にまとめたものです。
