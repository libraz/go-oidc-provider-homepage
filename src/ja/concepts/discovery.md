---
title: Discovery
description: /.well-known/openid-configuration の中身、初学者が押さえるべきフィールド、本ライブラリでの構築方法。
---

# Discovery

クライアントは、OP のエンドポイント・署名鍵・対応機能をひとつのドキュメントから学習します。OIDC の OP では **OIDC Discovery 1.0** の `/.well-known/openid-configuration`、純粋な OAuth デプロイでは **RFC 8414**（OAuth Authorization Server Metadata）の `/.well-known/oauth-authorization-server` がそれにあたります。どちらも、エンドポイント・サポートされるアルゴリズム・サポートされる scope・機能フラグを並べた JSON オブジェクトを返します。本ページは、その JSON を初学者向けに案内します。

::: details このページで触れる仕様
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — OAuth 2.0 Authorization Server Metadata
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

::: tip なぜ存在するか
discovery がなければ、すべての RP がエンドポイント URL・署名アルゴリズム・対応機能をハードコードする必要があり、鍵ローテーションや機能切り替えのたびに各 RP のコード変更が必要になります。discovery によって、RP は「`https://op.example.com` に居る OP」というひとつの URL を知っていれば足りるようになります。
:::

## Discovery ドキュメントの中身

初学者が実際に目にし、使うフィールドの代表例を挙げます。下記のフィールドはすべて、対応する機能が組み込まれていれば本ライブラリが出力します。

| フィールド | 内容 |
|---|---|
| `issuer` | OP の正規識別子。署名されるすべてのアーティファクトの `iss` と同じ文字列が並びます。RP は byte 単位で比較します。 |
| `authorization_endpoint` | `/authorize` の URL — ブラウザがログインのためにリダイレクトされる先。 |
| `token_endpoint` | `/token` の URL — RP が code やリフレッシュトークンを交換する場所。 |
| `userinfo_endpoint` | `/userinfo` の URL — RP がアクセストークンを使って最新の claim を取得する場所。 |
| `jwks_uri` | JWKS の URL — OP の公開署名鍵を JWK Set として公開する URL。 |
| `introspection_endpoint` | `/introspect` の URL（RFC 7662）— introspection 機能を組み込んだ場合のみ。 |
| `revocation_endpoint` | `/revoke` の URL（RFC 7009）— revocation 機能を組み込んだ場合のみ。 |
| `end_session_endpoint` | `/end_session` の URL — RP-Initiated Logout でブラウザをリダイレクトする先。 |
| `pushed_authorization_request_endpoint` | `/par` の URL — PAR 機能（RFC 9126）を有効化した場合のみ。 |
| `device_authorization_endpoint` | `/device_authorization` の URL — device code grant を組み込んだ場合のみ。 |
| `grant_types_supported` | `/token` で受け付ける grant 種別: `authorization_code`、`refresh_token`、`client_credentials`、… |
| `response_types_supported` | `/authorize` が受け付ける response type。本ライブラリは `code` のみ（OIDC Core の "code flow"）を広告します。 |
| `response_modes_supported` | `/authorize` の応答方式: `query`、`fragment`、`form_post`、`jwt`（JARM）。 |
| `id_token_signing_alg_values_supported` | ID トークンの署名に使う JWS アルゴリズム。本ライブラリは閉じた集合 `RS256`、`PS256`、`ES256`、`EdDSA` を公開します。 |
| `request_object_signing_alg_values_supported` | JAR の `request=` パラメータで受理する JWS アルゴリズム。同じ閉じた集合。 |
| `token_endpoint_auth_methods_supported` | RP が `/token` で認証する方式: `private_key_jwt`、`client_secret_basic`、`client_secret_post`、`tls_client_auth`、`none`（public client）。 |
| `code_challenge_methods_supported` | PKCE 変換。本ライブラリが広告するのは **`S256` のみ**。 |
| `subject_types_supported` | `public` と、`op.WithPairwiseSubject(...)` を組み込んだ場合は `pairwise`。 |
| `claims_supported` | OP が返せる claim。`op.WithClaimsSupported(...)` で操作者が制御。 |
| `scopes_supported` | OP が認識する scope。標準の OIDC scope に加え、`op.WithScope(...)` で登録したものを含みます。 |
| `dpop_signing_alg_values_supported` | DPoP 機能（RFC 9449）を有効化した場合のみ。 |
| `require_pushed_authorization_requests` | FAPI 2.0 プロファイルでのみ `true`。FAPI 2.0 が PAR を必須化するため。 |
| `claims_parameter_supported` | `op.WithClaimsParameterSupported(true)` で組み込み側が明示的にオプトインしたときのみ `true`。 |

::: details `_supported` は広告であってポリシーではない
`_supported` のリストは、OP が **受け付ける** ものであって、すべてのクライアントがそれらを使う必要があるわけではありません。クライアントは部分集合を選んでよく、OP はリストにないものを拒否します。
:::

## クライアント側での使い方

典型的な RP SDK は初回起動時に次の動きをします。

1. `GET https://op.example.com/.well-known/openid-configuration`
2. レスポンスをキャッシュ。OP が返す `Cache-Control: max-age=…` の値を上限として扱う。
3. キャッシュからエンドポイント・対応アルゴリズム・対応機能を取り出す。
4. キャッシュ期限切れか、JWKS による署名検証が失敗した（kid が未知 — おそらく OP が鍵をローテーションした）ときに再取得。

本ライブラリはこの経路を 2 つの方法で支援します。第 1 に、ローテーションが行われていない間、discovery ドキュメントと JWKS は安定しているので、RP 側のキャッシュは長くしておけます。第 2 に、操作者がローテーション中であることを `op.WithJWKSRotationActive(predicate)` で宣言した期間、本ライブラリは JWKS のレスポンスに短い `Cache-Control: max-age` を付けて返すので、再取得した RP は新しい鍵を発見できます。discovery ドキュメント自体は `op.New` で 1 度組み立てられ、リクエストごとには再生成されないため、インスタンス間で内容がドリフトしません。

::: tip Discovery は RP 側のキャッシュを語る話で、OP 側のキャッシュではない
OP はリクエストのたびに in-memory 状態から discovery ドキュメントを組み立てます（安価です）。コストがかかる方の話 — 直近にローテーションされた鍵を使った ID トークンの JWS 検証 — こそが、discovery キャッシュの無効化が解こうとしている本当の問題です。詳細は [JWKS ローテーション](/ja/operations/key-rotation) を参照。
:::

## 本ライブラリでの構築方法

discovery は `op.New` の時点で（`internal/discovery/build.go` で）、組み込まれた機能集合から一度だけ構築されます。実行時のドリフトは発生しません — 組み込み側が PAR を組み込んでいなければ `pushed_authorization_request_endpoint` は出力されず、`require_pushed_authorization_requests` も登場しません。組み込み側が `op.WithProfile(profile.FAPI2Baseline)` を組み込んでいれば FAPI の絞り込みが適用されます — `token_endpoint_auth_methods_supported` は FAPI が許可する集合に絞り込まれ、`require_pushed_authorization_requests=true` が出現し、introspection / revocation の auth method リストは絞り込み後の同じリストからコピーされます。

リポジトリには、プロファイルごとの discovery ドキュメント形状を検証する golden test があり、「discovery が言うこと」と「ハンドラが実際に行うこと」の間で気付かれずに進行するドリフトを PR 時点で捕捉します。背景は [設計判断 #12](/ja/security/design-judgments#dj-12) を参照。

## 本ライブラリが広告 *しない* もの

本ライブラリは、3 か所で意図的に discovery ドキュメントを絞り込んでいます。

- **`none` alg は出さない。** `id_token_signing_alg_values_supported` と `request_object_signing_alg_values_supported` に `none` は含まれません。型自体に存在しません（[JOSE 基礎](/ja/concepts/jose-basics) と [設計判断 #11](/ja/security/design-judgments#dj-11) を参照）。
- **ID トークンに HMAC 系 alg を出さない。** `HS256` / `HS384` / `HS512` は広告しません。alg-confusion 攻撃クラスはこれらが到達可能であることを必要とするため、型を閉じることで攻撃を構造的に閉じます。
- **PAR が無効なら `request_uri` を示すフィールドを出さない。** `request_uri_parameter_supported` と `pushed_authorization_request_endpoint` は、組み込み側が PAR を組み込んでいるときだけ登場します。
- **`claims_parameter_supported` のデフォルトは `false`。** OIDC §5.5 の `claims` request パラメータは `op.WithClaimsParameterSupported(true)` で明示的にオプトイン — discovery ドキュメントは「OP がこれを受け付けるか」を RP に伝えます。
- **`frontchannel_logout_supported` も `check_session_iframe` も出さない。** Front-Channel Logout 1.0 / Session Management 1.0 は実装していないため、discovery ドキュメントはそれらについて沈黙します。組み込み側は代わりに Back-Channel Logout 1.0 を使います — [設計判断 #5](/ja/security/design-judgments#dj-5) を参照。

::: warning Discovery は契約面
`_supported` の各配列は、OP が「受け付けると約束した」値の集合です。値を増やすことは契約の拡大、値を減らすことは縮小にあたります。RP はリストと比較し、自分が必要とするアルゴリズムを広告しなくなった OP との通信を拒否することがあります。discovery ドキュメントの変更は、公開 API の変更と同じ重さで扱ってください。
:::

## 次に読む

- [運用: JWKS](/ja/operations/jwks) — JWK Set がどう見え、本ライブラリがどう serve しているか。
- [運用: 鍵ローテーション](/ja/operations/key-rotation) — RP のキャッシュを壊さずに署名鍵をローテーションする方法。
- [リファレンス: オプション](/ja/reference/options) — discovery ドキュメントに現れるすべての `op.With...` オプション。
