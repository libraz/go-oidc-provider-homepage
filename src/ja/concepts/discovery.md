---
title: Discovery
description: /.well-known/openid-configuration の中身、browser と client-credentials-only OP の違い、本ライブラリでの構築方法を説明します。
---

# Discovery

クライアントは、OP のエンドポイント・署名鍵・対応機能を、ひとつの JSON 文書から知ります。OIDC の OP では **OIDC Discovery 1.0** が定める `/.well-known/openid-configuration` がその文書です。純粋な OAuth 向けには **RFC 8414**（OAuth Authorization Server Metadata）が `/.well-known/oauth-authorization-server` で同じ仕組みを定めていますが、本ライブラリが公開するのは `openid-configuration` だけで、RFC 8414 のメンバーもそこに含めています。本ページでは、この文書の中身を順に見ていきます。

::: details このページで触れる仕様
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — OAuth 2.0 Authorization Server Metadata
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html)
:::

::: tip なぜ存在するか
discovery がなければ、すべての RP が OP のエンドポイント URL・署名アルゴリズム・対応機能をハードコードすることになり、OP 側の変更のたびに各 RP のコードを直す必要が出ます。discovery があれば、RP が知るべきなのは issuer の URL（`https://op.example.com`）だけです。
:::

## Discovery 文書の中身

<figure class="fig">
  <div class="fig-head">RP は endpoint・鍵・対応機能を読み取る</div>
  <svg class="fig-svg" role="img" aria-labelledby="discovery-read-title" viewBox="0 0 960 384" xmlns="http://www.w3.org/2000/svg">
    <title id="discovery-read-title">Relying Party は well-known URL に GET を 1 回送り、discovery 文書を受け取ります。文書は「リクエストの送り先」「トークンを検証する鍵」「この OP が受け付けるもの」の 3 つに答えます。</title>
    <!-- RP and its request / response -->
    <rect class="fg-box" x="32" y="156" width="176" height="72" rx="8"/>
    <text class="fg-t" x="48" y="184">Relying Party</text>
    <text class="fg-s" x="48" y="208">SDK またはアプリ</text>
    <path class="fg-edge" d="M208,172 H336" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="272" y="162" text-anchor="middle">GET</text>
    <path class="fg-edge fg-edge--accent" d="M336,212 H208" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="272" y="202" text-anchor="middle">200 · JSON</text>
    <!-- discovery document -->
    <rect class="fg-group fg-group--accent" x="336" y="24" width="592" height="336" rx="8"/>
    <text class="fg-lbl fg-accent" x="360" y="52">discovery 文書</text>
    <rect class="fg-box" x="360" y="72" width="240" height="72" rx="8"/>
    <text class="fg-m" x="376" y="100">authorization_endpoint</text>
    <text class="fg-xs" x="376" y="124">token · userinfo · logout</text>
    <path class="fg-edge" d="M600,108 H640" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="640" y="72" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="100">リクエストの送り先</text>
    <text class="fg-s" x="656" y="124">URL をハードコードしない</text>
    <rect class="fg-box" x="360" y="168" width="240" height="72" rx="8"/>
    <text class="fg-m" x="376" y="196">jwks_uri</text>
    <text class="fg-xs" x="376" y="220">OP の公開鍵</text>
    <path class="fg-edge" d="M600,204 H640" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="640" y="168" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="196">トークンを検証する鍵</text>
    <text class="fg-s" x="656" y="220">JWKS を取得し kid で照合</text>
    <rect class="fg-box" x="360" y="264" width="240" height="72" rx="8"/>
    <text class="fg-m" x="376" y="292">*_supported</text>
    <text class="fg-xs" x="376" y="316">scope・grant・PKCE 方式…</text>
    <path class="fg-edge" d="M600,300 H640" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="640" y="264" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="292">この OP が受け付けるもの</text>
    <text class="fg-s" x="656" y="316">使う前に確認する</text>
  </svg>
  <figcaption class="fig-note">1 回のリクエストで、3 種類のハードコードされた設定を置き換えられます。応答には <code>Cache-Control: public, max-age=3600</code> が付くので、RP が再取得するのは多くても 1 時間に 1 回程度です。</figcaption>
</figure>

下の表は、最初に目にするフィールドの一覧です。対応する機能が設定されていれば、本ライブラリがそれぞれ出力します。エンドポイントの URL は絶対 URL で、mount prefix（既定は `/oidc`）の下に置かれます。例: `https://op.example.com/oidc/auth`。

| フィールド | 内容 |
|---|---|
| `issuer` | OP の正規識別子。署名されるすべてのトークンの `iss` と同じ文字列です。RP は byte 単位で比較します。 |
| `authorization_endpoint` | `/auth` の URL — ブラウザがログインのためにリダイレクトされる先。 |
| `token_endpoint` | `/token` の URL — RP が code やリフレッシュトークンを交換する場所。 |
| `userinfo_endpoint` | `/userinfo` の URL — RP がアクセストークンを使って最新の claim を取得する場所。 |
| `jwks_uri` | JWKS の URL — OP の公開署名鍵を JWK Set として公開する URL。 |
| `introspection_endpoint` | `/introspect` の URL（RFC 7662）— introspection 機能を組み込んだ場合のみ。 |
| `revocation_endpoint` | `/revoke` の URL（RFC 7009）— revocation 機能を組み込んだ場合のみ。 |
| `end_session_endpoint` | `/end_session` の URL — RP-Initiated Logout でブラウザをリダイレクトする先。認可エンドポイントがある場合だけ出力されます。 |
| `backchannel_logout_supported` | 認可エンドポイントがあれば `true`。OP は Back-Channel Logout の logout token を送れます。 |
| `registration_endpoint` | `/register` の URL（RFC 7591）— `op.WithDynamicRegistration(...)` を組み込んだ場合のみ。 |
| `pushed_authorization_request_endpoint` | `/par` の URL — PAR 機能（RFC 9126）を有効化した場合のみ。 |
| `device_authorization_endpoint` | `/device_authorization` の URL — device code grant を組み込んだ場合のみ。 |
| `backchannel_authentication_endpoint` | `/bc-authorize` の URL — CIBA grant を組み込んだ場合のみ。 |
| `grant_types_supported` | `/token` で受け付ける grant 種別: `authorization_code`、`refresh_token`、`client_credentials`、… |
| `response_types_supported` | 認可エンドポイントが受け付ける response type。ブラウザ認可を使う構成では `code` のみ（OIDC Core の "code flow"）を広告します。`client_credentials` だけの OP では認可エンドポイントを mount しないため、空配列になります。 |
| `response_modes_supported` | 認可エンドポイントの応答方式: `query`、`form_post`、加えて JARM 有効時は `query.jwt`、`fragment.jwt`、`form_post.jwt`、`jwt`。 |
| `authorization_response_iss_parameter_supported` | 常に `true`。すべての認可応答に `iss` が付きます（RFC 9207）。 |
| `id_token_signing_alg_values_supported` | ID トークンの署名に使う JWS アルゴリズム。OP 署名鍵は ECDSA P-256 のため、本ライブラリは `ES256` のみを公開します。 |
| `request_parameter_supported` / `request_uri_parameter_supported` | JAR を有効にした場合だけ `true`。それ以外は `false`。 |
| `request_object_signing_alg_values_supported` | JAR の `request=` パラメータで受理する JWS アルゴリズム: `RS256`、`PS256`、`ES256`、`EdDSA`。FAPI profile では `PS256`、`ES256`、`EdDSA` に絞られます。JAR を有効にした場合のみ出力。 |
| `token_endpoint_auth_methods_supported` | クライアントが `/token` で認証する方式。既定のリストには `client_secret_basic`、`client_secret_post`、`private_key_jwt`、`none` が含まれ、FAPI profile では絞り込まれます。introspection と revocation の auth method リストからは、confidential caller を必須とするため `none` が意図的に除かれます。mTLS 送信者制約の metadata は `mtls_endpoint_aliases` で別に広告します。 |
| `code_challenge_methods_supported` | PKCE 変換。本ライブラリが広告するのは **`S256` のみ**。 |
| `subject_types_supported` | `public` と、`op.WithPairwiseSubject(...)` を組み込んだ場合は `pairwise`。 |
| `claims_supported` | OP が返せる claim。`op.WithClaimsSupported(...)` を渡さない限り出力されません。ユーザストアの中身はライブラリには分からないためです。 |
| `scopes_supported` | public な scope。標準の OIDC scope と、`op.WithScope(...)` で public として登録した scope です。private な scope は載りません。 |
| `dpop_signing_alg_values_supported` | DPoP 機能（RFC 9449）を有効化した場合のみ。 |
| `require_pushed_authorization_requests` | PAR を必須とするプロファイル（FAPI 2.0 系）でのみ `true` として出力。 |
| `claims_parameter_supported` | 既定は `true`。OIDC §5.5 の `claims` request を広告・処理しない場合は `op.WithClaimsParameterSupported(false)` を渡す。 |
| `authorization_details_types_supported` | `authorization_details` で受理する RFC 9396 の `type` 値。`op.WithAuthorizationDetailTypes(...)` を組み込んだときのみ出現。 |
| `grant_management_endpoint` | grant management エンドポイントの URL。`op.WithGrantManagement(...)` を組み込んだときのみ出現。 |
| `grant_management_actions_supported` | OP が受理する grant management アクション（`create` / `replace` / `merge` / `query` / `revoke`）。`grant_management_endpoint` と一緒に出現。 |
| `grant_management_action_required` | `WithGrantManagement(..., actionRequired=true)` のときのみ `true` として出力。認可リクエストは `grant_management_action` を必ず含める必要がある。 |

`op.WithProtectedResources(...)` を組み込むと、OP はさらに RFC 9728 protected-resource metadata を `/.well-known/oauth-protected-resource` で配信します。登録リソースごとに 1 つの文書があり、`openid-configuration` のフィールドではなく独立した well-known 文書です。

::: details `_supported` は広告であってポリシーではない
`_supported` のリストは、OP が **受け付ける** ものであって、すべてのクライアントがそれらを使う必要があるわけではありません。クライアントは部分集合を選んでよく、OP はリストにないものを拒否します。
:::

## クライアント側での使い方

典型的な RP SDK は初回起動時に次の動きをします。

1. `GET https://op.example.com/.well-known/openid-configuration`
2. レスポンスをキャッシュする。保持してよいのは OP が返す `max-age`（3600 秒）まで。
3. キャッシュした文書から、エンドポイント・対応アルゴリズム・対応機能を読み取る。
4. キャッシュが切れたとき、または未知の `kid` で署名検証に失敗したとき（多くは OP が鍵をローテーションした合図）に再取得する。

本ライブラリは次の 2 点で RP を助けます。同じ設定である限り discovery 文書の内容は変わらないので、RP は長めにキャッシュできます。鍵ローテーション中は、組み込み側が `op.WithJWKSRotationActive(predicate)` で知らせると、JWKS エンドポイントが `max-age=3600` から `max-age=300, must-revalidate` に切り替わり、再取得した RP が新しい鍵をすぐ見つけられます。

::: tip 文書は一度だけ組み立てられる
OP は provider の作成時に文書を組み立てて marshal し、以後は同じ JSON body を返し続けます。同じ設定のインスタンスはすべて同一の byte 列を返すので、古さの問題は RP 側のキャッシュに限られます。RP がキャッシュ済みの JWKS をどのくらい使い続けてよいかは [鍵ローテーション](/ja/operations/key-rotation) を参照してください。
:::

## 本ライブラリでの構築方法

discovery は `op.New` の時点で、組み込まれた機能集合から一度だけ構築されるので、実行時に内容がずれることはありません。組み込み側が PAR を組み込んでいなければ `pushed_authorization_request_endpoint` は出力されず、`require_pushed_authorization_requests` も登場しません。組み込み側が `op.WithProfile(profile.FAPI2Baseline)` を組み込んでいれば FAPI の絞り込みが適用されます — `token_endpoint_auth_methods_supported` は FAPI が許可する集合に絞り込まれ、`require_pushed_authorization_requests=true` が出現し、introspection / revocation の auth method リストは `none` を除いた絞り込み後の同じリストからコピーされます。認可エンドポイントとブラウザ専用の metadata は、ブラウザ認可を必要とする grant が設定されている場合だけ出力されます。そのため `client_credentials` だけの OP では `authorization_endpoint`、`end_session_endpoint`、`backchannel_logout_supported` が省略され、`response_types_supported: []` は残ります。

`WithDiscoveryMetadata(DiscoveryMetadata{UILocalesSupported: ...})` で locale を明示的に広告する場合も、構築時の契約が適用されます。広告する locale が登録済み resolver から提供されていなければ `op.New` が失敗し、UI が提供できない locale を discovery に出すことを防ぎます。

プロファイルごとの文書の形は golden test で固定しているので、discovery の内容とハンドラの実際の挙動が気付かれずに乖離することはありません。背景は [設計判断 #12](/ja/security/design-judgments#dj-12) を参照してください。

文書は mount prefix の外側、`/.well-known/openid-configuration` で配信されます。path を持つ issuer では、同じ文書を issuer 相対のパスでも配信します。詳細は [Issuer](/ja/concepts/issuer#設定方法) を参照してください。

## 本ライブラリが広告 *しない* もの

本ライブラリは、意図的に discovery 文書を絞り込んでいます。

- **`none` alg は出さない。** `id_token_signing_alg_values_supported` と `request_object_signing_alg_values_supported` に `none` は含まれません。これは `/token` に列挙される `none` client-authentication method とは別の話で、`none` は署名アルゴリズムとしては使いません（[JOSE 基礎](/ja/concepts/jose-basics) と [設計判断 #11](/ja/security/design-judgments#dj-11) を参照）。
- **ID トークンに HMAC 系 alg を出さない。** `HS256` / `HS384` / `HS512` は広告しません。alg-confusion 攻撃はこれらに到達できることが前提なので、本ライブラリは到達できる経路をそもそも作りません。
- **JAR を組み込まない限り、request object への対応を示さない。** JAR がなければ `request_parameter_supported` と `request_uri_parameter_supported` は `false` で、request object のアルゴリズム一覧も出力されません。`pushed_authorization_request_endpoint` は PAR を組み込んだときだけ登場します。
- **`claims_parameter_supported` の既定は `true` だが、無効化できる。** `op.WithClaimsParameterSupported(false)` を渡すと、discovery 文書は OIDC §5.5 対応を広告せず、authorize / PAR は malformed JSON の拒否後に `claims` payload を無視します。
- **`frontchannel_logout_supported` も `check_session_iframe` も出さない。** Front-Channel Logout 1.0 / Session Management 1.0 は実装していないため、discovery 文書はそれらについて沈黙します。組み込み側は代わりに Back-Channel Logout 1.0 を使います — [設計判断 #5](/ja/security/design-judgments#dj-5) を参照。

::: warning Discovery は契約面
`_supported` の各配列は、その値を受け付けるという約束です。値を増やせば契約が広がり、減らせば狭まります。RP は、必要とするアルゴリズムを広告しなくなった OP との通信を拒否することがあります。discovery 文書の変更は、公開 API の変更と同じ重さで扱ってください。
:::

## 次に読む

- [運用: JWKS](/ja/operations/jwks) — JWK Set がどう見え、本ライブラリがどう serve しているか。
- [運用: 鍵ローテーション](/ja/operations/key-rotation) — RP のキャッシュを壊さずに署名鍵をローテーションする方法。
- [リファレンス: オプション](/ja/reference/options) — discovery 文書に現れるすべての `op.With...` オプション。
