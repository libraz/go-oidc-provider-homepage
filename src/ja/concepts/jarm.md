---
title: JARM — JWT Authorization Response Mode
description: 認可応答を署名付き(任意で暗号化)JWT に包み、応答そのものを OP が発行したことを暗号学的に立証可能にする方式。
---

# JARM — JWT Authorization Response Mode

OP は既定では認可応答(`code`、`state`、`iss` など)を URL クエリや fragment にそのまま載せて返します。リダイレクトを書き換えられる立場の攻撃者 — 悪意のあるブラウザ拡張、改ざんされた中継、別の OP との mix-up — は、RP が応答を受け取る前にフィールドを差し替えることができます。**JARM**(OpenID Foundation FAPI WG 仕様 "JWT Secured Authorization Response Mode for OAuth 2.0"、RFC 9101 §10.2 が情報参照しています)は、この応答全体をひとつの署名付き JWT にまとめ、`response` 1 個のパラメータとして配送する方式です。応答そのものに改ざん検知性が乗り、OP が発行したことが暗号学的に立証できるようになります。

JARM は FAPI 2.0 Message Signing が FAPI 2.0 Baseline の上に重ねる 2 つの保護のうちの 1 つです。もう 1 つはリソースサーバ側での応答署名です。両者を合わせると完全な非否認性が得られます — すべての認可リクエストとすべての認可応答が、識別可能な発信者の署名で守られます。

::: details このページで触れる仕様
- [OAuth 2.0 JARM](https://openid.net/specs/oauth-v2-jarm.html) — JWT Secured Authorization Response Mode
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR(§10.2 で JARM を相互参照)
- [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207) — 認可応答の `iss` パラメータ
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-2_0-message-signing.html)
- [OIDC Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
:::

## なぜ JARM があるのか

通常のリダイレクトでは `code` と `state` がクエリパラメータとして平文で運ばれます。この通信路上の形式を狙う攻撃が 2 種類あります:

- **mix-up。** ユーザが 2 つの OP に同時にログインしている状況で、攻撃者が片方の OP を支配していると、自分の `code` を正規 OP の `code` と差し替えることができます。RP は攻撃者の code を正規 OP の `/token` で交換してしまい、ユーザのセッションに攻撃者のアイデンティティがバインドされる結果になります。
- **通信路上での書き換え。** ユーザエージェントと RP の間に挟まる任意のもの — ブラウザ拡張、社内プロキシ、改ざんされた CDN エッジ — が、RP に届く前に応答を書き換えられます。PKCE は code を RP が選んだ verifier にバインドするため書き換え側は差し替えた code を直接交換できませんが、それは「結局 RP が交換した code を **どの OP** が発行したか」を証明するものではありません。

> **OAuth 2.0 JARM §1(訳)** 認可応答は暗号学的に保護され、応答の発行者と応答が運ぶ値のいずれも、OP が署名した時点以降に改ざんできないことが保証されます。

[RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207)(認可応答の `iss` パラメータ)は軽量な防御です — OP は自身の issuer URL をリダイレクトに付け、RP は送り出した OP と一致しない `iss` のリダイレクトをすべて拒否します。これだけで mix-up クラスは止まり、FAPI 2.0 Baseline はこちらを必須にしています。JARM は重量級の選択肢で、応答そのものに持ち運び可能な署名が必要な場面 — 監査証跡、ブローカ経由の out-of-band 転送、FAPI 2.0 Message Signing の完全な非否認契約 — で使います。

## 通信路上の形式

クライアントは authorize(または PAR)リクエストの `response_mode` に JARM 4 値のいずれかを指定してオプトインします(`internal/jarm/mode.go`):

| `response_mode` | 配送方法 | 用途 |
|---|---|---|
| `query.jwt` | リダイレクト URL の `?response=<JWT>` | Code フロー(v0.x が出荷する唯一のフローなので、裸の `jwt` エイリアスもここに解決) |
| `fragment.jwt` | リダイレクト URL の `#response=<JWT>` | Hybrid / Implicit フロー(配線済みだが v0.x では実行されない) |
| `form_post.jwt` | 自動 submit する HTML フォームの hidden `response` フィールド | URL バーに値を載せたくないブラウザ向け |
| `jwt` | 裸のエイリアス。`response_type=code` なら `query.jwt`、`token` / `id_token` を含めば `fragment.jwt` に解決 | 既定挙動に任せたいクライアント |

OP が返すパラメータは `response` 1 個だけで、その値が JWT です。リダイレクトには他に何も載りません。JWT の claim には元の応答フィールドが入ります(`internal/jarm/encode.go`):

| Claim | 意味 |
|---|---|
| `iss` | OP の issuer URL(discovery の `issuer` と一致) |
| `aud` | 要求元クライアントの `client_id` |
| `exp` | 短い有効期限。本ライブラリの既定は 60 秒(`jarm.DefaultExpiry`) |
| `iat`、`nbf` | issued-at と not-before。両者を同値に設定し、厳格な検証側でも nbf-or-fail を一様に適用できるようにしています |
| `code` | 成功時 — 認可コード |
| `state` | 成功時・エラー時とも、リクエストが指定していれば付与 |
| `error`、`error_description`、`error_uri` | エラー時 — 非 JARM のエラー応答と同じ 3 点セット |

`code` と `error` は排他で、OP はどちらか片方だけを埋めます。検証ロジックは `internal/jarm/encode.go` の `validatePayload` にあり、すべての `Sign` 呼び出しから強制されます。

## 署名

OP は JARM の署名に、ID Token と JWT 形式 access token で使うものと同じ鍵を使います。v0.x は alg を閉じたリストで運用します:

> **ソース:** `internal/jarm/encode.go` — `deriveJWSAlgorithm` は ECDSA P-256 以外の鍵形状をすべて `jose.ErrUnsupportedKeyShape` で拒否します。したがって署名アルゴリズムは常に `ES256` です。

v0.x にクライアント単位の `authorization_signed_response_alg` 上書きはありません。Discovery が広告する値はひとつだけです:

```json
"authorization_signing_alg_values_supported": ["ES256"]
```

`alg=none` / `RS256` / `HS*` ファミリは型レベルで存在しません — 本ライブラリのあらゆる JOSE 接面に共通する閉じた enum 方針については [設計判断 #11](/security/design-judgments#dj-11) を参照してください。

::: details なぜ alg を 1 つに絞り、交渉可能なリストにしないのか
JOSE alg 交渉は、歴史的に `alg=none` と HMAC 鍵を公開鍵と取り違える("alg confusion")バグを生んできた経路です。本ライブラリは交渉を行わず、通信路上の allow-list と型レベルの enum を一致させ、リスト外の alg を名乗る入力は検証器に到達する前に拒否します。v0.x は ES256 だけを出荷していますが、これは FAPI 2.0 Message Signing が要求する集合と通信路を互換に保ちつつ、攻撃面を広げないための選択です。
:::

## 暗号化

クライアントが `authorization_encrypted_response_alg` と `authorization_encrypted_response_enc` を登録した場合、JARM 応答は署名付き JWT を JWE で包んだ二重構造(JWS-then-JWE)で配送されます。包む処理は `internal/authorizeendpoint/jarm_encrypt.go` の `maybeEncryptJARM` にあります:

- OP は `internal/clientencjwks/` 経由でクライアントの暗号化用 JWK を解決します(静的登録、または `jwks_uri` から取得)。
- 署名済み JARM JWT を、解決した受信者鍵に対して登録済みの `alg` / `enc` で暗号化します。
- 暗号化に失敗した場合、OP は平文の `?code=...` リダイレクトへフォールバックせず、`server_error` を返します。クライアントが暗号化された応答を要求しているのに code を平文で漏らすのは、fail-closed(失敗時は応答そのものを止める)よりも悪い結果になるためです。

`alg` / `enc` の allow-list は、ID Token / userinfo / introspection の暗号化と同じ閉じたリスト(`op.SupportedEncryptionAlgs` と `op.SupportedEncryptionEncs`)を使います: RSA-OAEP ファミリ(`SHA-256` / `SHA-512`)、ECDH-ES バリアント、AES-GCM の鍵 wrap、`A128GCM` / `A256GCM` のコンテンツ暗号化が対象です。`RSA1_5`、`dir`、AES-CBC-HS 系のコンテンツ暗号化は意図的に除外しています。alg マトリクスと根拠は [JWE 暗号化](/use-cases/jwe-encryption) を参照してください。

OP は discovery で `authorization_encryption_alg_values_supported` と `_enc_values_supported` を、JARM 機能と `op.WithEncryptionKeyset` の両方が組み込まれているときにだけ広告します(`internal/discovery/document.go`)。

## クライアント側での検証

クライアントは `?response=<JWT>`(または fragment / form_post 相当)を認可応答そのものとして扱います。検証手順は OAuth 2.0 JARM 仕様 §4.4 に従います:

1. discovery で広告された `jwks_uri` から OP の JWKS を取得する。
2. JWT の署名を、対応する `kid` の鍵で検証する。
3. `iss` が、設定済みの OP issuer と一致することを確認する(文字列の完全一致、正規化なし)。
4. `aud` がクライアント自身の `client_id` と一致することを確認する。
5. `exp` が未来であることを確認する(厳密な検証側では `nbf` が過去であることも確認)。
6. JWT が暗号化されている場合、まずクライアントの暗号化用秘密鍵で復号し、内側の署名を OP の署名 JWKS で検証する。

ここまで通ったら、JWT の claim から `code`、`state`、エラー時の 3 点セットを取り出し、あとは普通のクエリパラメータとして届いた場合と全く同じ処理に進みます。redirect URI の完全一致チェック、`state` 往復チェック、PKCE の code_verifier 計算は、すべて JWT から取り出した値の上で動きます。

## JARM が必須となる条件

| プロファイル / 文脈 | JARM の扱い |
|---|---|
| **FAPI 2.0 Message Signing** | 必須(`op.WithProfile(profile.FAPI2MessageSigning)` が `feature.JARM` を自動で有効化) — [FAPI 2.0](/concepts/fapi) 参照 |
| **FAPI 2.0 Baseline** | 任意(Baseline は RFC 9207 の `iss` パラメータで十分) |
| **FAPI-CIBA** | 該当なし — CIBA にはフロントチャネルの認可応答が存在しない |
| **素の OIDC / OAuth** | 純粋に選択肢 — 多くの実装は RFC 9207 の `iss` で済ませ、JARM までは入れません |

JARM は特定の CVE クラスを単独で潰す唯一の対策ではありません。担う役割は **認可応答そのものの暗号学的な立証可能性** で、応答が out-of-band で転送される構成(ブローカ型、規制要件で保管が必要なログ)や、各プロトコルメッセージに対する完全性契約を最も強い水準で確保したい実装で意味を持ちます。

## 本ライブラリでの有効化

JARM は `feature.JARM` で制限されています(`op/feature/feature.go`)。有効化の経路は 2 つです。

**プロファイル経由。** `op.WithProfile(profile.FAPI2MessageSigning)` は PAR / JAR と並んで JARM を必須機能集合に追加します(`op/profile/constraints.go` — `RequiredAnyOf`)。このプロファイル下で `feature.JARM` が無いと、ビルド時バリデータが OP の構築を拒否します。

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/profile"
)

op.New(
  /* required options */
  op.WithProfile(profile.FAPI2MessageSigning),
)
```

**機能フラグを手動で。** FAPI 2.0 Message Signing 以外で JARM を有効化したい場合 — 例えば監査要件のために署名付き応答が欲しい OIDC 構成 — は `feature.JARM` を直接追加します。

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
)

op.New(
  /* required options */
  op.WithFeature(feature.JARM),
)
```

JARM signer は `op.New` の段階で OP の現用署名鍵を使って 1 度だけ構築されます(`op/op_builders.go` — `buildJARMSigner`)。専用の鍵集合もリクエスト毎の鍵検索もありません。

**クライアント単位のメタデータ。** `feature.JARM` が有効なとき、クライアントメタデータは次の 2 フィールドを受理します(`op/registration.go`):

| フィールド | 効果 |
|---|---|
| `authorization_encrypted_response_alg` | 指定した JWE `alg` で JWE 包装された JARM 応答を要求する。`op.SupportedEncryptionAlgs` の中の値であること。 |
| `authorization_encrypted_response_enc` | `authorization_encrypted_response_alg` と対で指定する。`op.SupportedEncryptionEncs` の中の値であること。 |

両フィールドは静的シード時点(`op.ClientSeed` / `store.Client` の形)でも、Dynamic Client Registration(`POST /register`)経由でも与えられます。v0.x はクライアント単位の `authorization_signed_response_alg` 上書きを実装しておらず、OP 全体の ES256 設定がすべての JARM 利用クライアントに適用されます。

## JARM と DPoP / mTLS の関係

JARM は認可応答に署名し、[DPoP](/concepts/dpop) と [mTLS](/concepts/mtls) は発行されたトークンを正規クライアントが保有する鍵にバインドします。両層は直交しており — JARM は **code を配送するハンドシェイク段** を、送信者制約は **その code と引き換えに発行されるトークン** を、それぞれ守ります — FAPI 2.0 Message Signing は両方を要求します。

JARM を使うリクエストはほぼ常に [PAR](/use-cases/fapi2-baseline) と [JAR](https://datatracker.ietf.org/doc/html/rfc9101) も併用します。4 つを組み合わせると、認可リクエスト全体に署名・認可応答全体に署名・最後に送信者制約付きトークン、という構図が完成します。本ライブラリは `op.WithProfile(profile.FAPI2MessageSigning)` 下で PAR / JAR / JARM を自動有効化し、DPoP もしくは mTLS のいずれかを必須とする `RequiredAnyOf` 制約を併せて課します。

## 次に読む

- [FAPI 2.0](/concepts/fapi) — JARM が FAPI 2.0 Baseline / Message Signing の対比のどこに位置づくか。
- [送信者制約 — 選定ガイド](/concepts/sender-constraint) — JARM と並走するトークンバインド層、DPoP と mTLS の選び方。
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — JARM を載せる前段の Baseline プロファイルの実装一式。
- [JWE 暗号化](/use-cases/jwe-encryption) — 暗号化 JARM、暗号化 ID Token、暗号化 userinfo、暗号化 introspection(鍵集合 1 個で 4 接面分)。
- [設計判断](/security/design-judgments) — 閉じた alg enum(#11)など、JARM が継承する仕様上の判断材料。
