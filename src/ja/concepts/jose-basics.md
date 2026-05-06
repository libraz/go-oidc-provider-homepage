---
title: "JOSE 基礎: JWS、JWE、JWK、JWKS、kid"
description: OIDC を学ぶ方のための JOSE 入門最小セット — 各略語の意味、OIDC でどこに登場するか、本ライブラリがアルゴリズム allow-list を閉じている理由。
---

# JOSE 基礎: JWS、JWE、JWK、JWKS、kid

**JOSE**（JavaScript Object Signing and Encryption）は、JSON 形のトークンに対して署名・暗号化・鍵表現の方法を定める IETF 仕様群の総称です。OIDC 実装は JWS / JWE / JWK / JWKS の 4 つすべてを内部で扱います — 大抵は表に出ませんが、ときどき直接登場します。本ページは、`id_token`、`jwks_uri`、JAR の `request=` パラメータ、`kid` を理解するために押さえておきたい最小限を扱います。

::: details このページで触れる仕様
- [RFC 7515](https://datatracker.ietf.org/doc/html/rfc7515) — JSON Web Signature（JWS）
- [RFC 7516](https://datatracker.ietf.org/doc/html/rfc7516) — JSON Web Encryption（JWE）
- [RFC 7517](https://datatracker.ietf.org/doc/html/rfc7517) — JSON Web Key（JWK）
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JSON Web Algorithms（JWA）
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token（JWT）
- [RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638) — JWK Thumbprint
- [RFC 8037](https://datatracker.ietf.org/doc/html/rfc8037) — EdDSA in JOSE
- [RFC 8725](https://datatracker.ietf.org/doc/html/rfc8725) — JWT Best Current Practices
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR（署名付き authorization request）
:::

::: tip メンタルモデル
- **JWS** が署名する。**JWE** が暗号化する。**JWK** は鍵 1 個。**JWKS** は鍵集合。**kid** はどの鍵かを選ぶ。
- OIDC で目にする JWT はすべて JWS — `header.payload.signature`。
- ID トークン / userinfo / authorize 応答が暗号化されるとき、署名の上にかぶさる外側のエンベロープが JWE。
- `/jwks` の JWKS のおかげで RP は ID トークンをオフラインで検証できる。OP は新しい鍵を先んじて追加してからローテーションする。
:::

## JWS — JSON Web Signature

**JWS** は JWT が使う署名スキームです。コンパクトシリアライズは、ドットでつないだ 3 つの base64url セグメントです。

```
<base64url(header)>.<base64url(payload)>.<base64url(signature)>
```

ヘッダは署名アルゴリズムと鍵を名付ける JSON オブジェクトです。

```json
{ "alg": "ES256", "kid": "2026-q1" }
```

payload はトークンの claim（JSON オブジェクト）です。signature は `header + "." + payload` を覆い、`alg` で名付けたアルゴリズムと `kid` で名付けた鍵で計算されます。

OIDC では JWS は次の用途で使われます。

| アーティファクト | 仕様 | 署名者 |
|---|---|---|
| `id_token` | OIDC Core 1.0 §2 | OP の署名鍵。 |
| アクセストークン（デフォルト JWT 経路） | RFC 9068 | OP の署名鍵。 |
| `request` / `request_uri`（JAR） | RFC 9101 | RP の鍵。クライアントの `jwks_uri` で公開。 |
| `client_assertion`（`private_key_jwt`） | RFC 7523 | RP の鍵。 |
| Authorize 応答（JARM） | OpenID FAPI JARM | OP の署名鍵。 |
| `logout_token`（Back-Channel Logout） | OIDC BCL 1.0 | OP の署名鍵。 |

受信側は、関連する JWKS の公開鍵に対してアルゴリズムを再実行して検証します。署名が一致し、claim（`iss`、`aud`、`exp`）が期待と合えばトークンを受理します。

## JWE — JSON Web Encryption

**JWE** は暗号化版です。コンパクトシリアライズは 5 セグメントです。

```
<base64url(header)>.<base64url(encrypted_key)>.<base64url(iv)>.<base64url(ciphertext)>.<base64url(tag)>
```

ヘッダは 2 つのアルゴリズム名を持ちます。

| フィールド | 内容 |
|---|---|
| `alg` | **鍵管理アルゴリズム。** メッセージごとのコンテンツ鍵を受信者にどう届けるか: `RSA-OAEP-256`（RSA 鍵搬送）、`ECDH-ES`（ダイレクト ECDH）、`ECDH-ES+A128KW` / `ECDH-ES+A256KW`（ECDH と AES 鍵ラップ）。 |
| `enc` | **コンテンツ暗号化アルゴリズム。** payload をどう暗号化するか: `A128GCM`、`A256GCM`。 |

OIDC では JWE は、組み込み側やクライアントが署名の上に機密性を重ねたいときに **外側のエンベロープ** として使われます — RP の公開鍵で暗号化された `id_token`、暗号化された userinfo 応答、暗号化された introspection 応答、暗号化された authorize 応答（暗号化付き JARM）。内側のアーティファクトは依然として JWS で、JWE はそれを包んでいるだけです。

完全な配線（`op.WithEncryptionKeyset`、`op.WithSupportedEncryptionAlgs`）は [JWE 暗号化のユースケース](/ja/use-cases/jwe-encryption) を参照。

## JWK — JSON Web Key

**JWK** は単一の暗号鍵を JSON で表す標準形式です。

```json
{
  "kty": "EC",
  "crv": "P-256",
  "kid": "2026-q1",
  "use": "sig",
  "alg": "ES256",
  "x": "...",
  "y": "..."
}
```

| フィールド | 内容 |
|---|---|
| `kty` | 鍵種別: `RSA`、`EC`（楕円曲線）、`OKP`（Edwards 曲線: Ed25519、Ed448）。 |
| `kid` | 鍵 id — JWKS から鍵を選び出すラベル。 |
| `use` | `sig`（署名）または `enc`（暗号）。 |
| `alg` | この鍵が用いられるアルゴリズム — 呼び出し側が弱いものに差し替えられないよう pin される。 |

公開時の JWK には公開鍵だけが含まれ、対になる秘密鍵は OP に留まります。

## JWKS — JWK Set

**JWKS** は JWK の JSON 配列です。

```json
{
  "keys": [
    { "kty": "EC", "kid": "2026-q1", ... },
    { "kty": "EC", "kid": "2025-q4", ... }
  ]
}
```

OP は公開署名鍵を `jwks_uri`（discovery ドキュメントで広告）に公開します。RP は JWKS を 1 度取得してキャッシュし、ID トークンの署名検証にオフラインで使います。鍵ローテーション中、OP は RP のキャッシュが収束するのに十分な期間、前の鍵を集合に残します — [運用: 鍵ローテーション](/ja/operations/key-rotation) を参照。

::: details `jwks_uri` と JWS ヘッダの `jwk` の違い
- **`jwks_uri`**（discovery のフィールド）は、OP が JWKS を serve する URL。安定でキャッシュ可能、RP は自身の都合で取得します。
- **`jwk` JWS ヘッダ** は、トークンのヘッダに *インラインで* 埋め込まれた JWK。RFC 7515 は許容していますが、RFC 8725 §3.5 は「トークンが自分で名乗った鍵を信頼することは alg-confusion の典型的な落とし穴のひとつ」と警告しています — 誰でも JWS を作成し、自前の `jwk` をヘッダに付けて検証側に「これで検証して」と渡せるからです。**本ライブラリは入力トークンのインライン `jwk` ヘッダの盲信は決して行いません** — 出力アーティファクトの鍵は OP 自身の JWKS から、クライアント由来の JWS の検証鍵は設定されたクライアントの `jwks_uri` から取得します。
:::

## kid — どの鍵を使うかの指定

`kid` は鍵 id です。JWS が到着すると、検証側は次の手順を踏みます。

1. JWS ヘッダから `kid` を読む。
2. 関連する JWKS から、`kid` が一致する JWK を探す。
3. `alg` で名付けたアルゴリズムを、その鍵に対して走らせて署名を検証する。

`kid` がなければ、検証側は集合内のすべての鍵を順に試すことになります — 遅いだけでなく、攻撃者にどの鍵で混乱させるかを選ばせる足元の罠でもあります。本ライブラリは生成するすべての JWS に `kid` を必ず付け、関連する JWKS に `kid` が見つからない入力トークンを拒否します。

`kid` がアクティブセットには一致しないが、最近 retired した鍵に一致する入力トークンについては、`op.AuditKeyRetiredKidPresented` を発火します — 鍵ローテーションについて来られていない RP をダッシュボードが特定できるようにするためです。詳細は [運用: 鍵ローテーション](/ja/operations/key-rotation) を参照。

## なぜ本ライブラリは alg allow-list を閉じているか

JOSE のアルゴリズムレジストリには 2 つの攻撃クラスが住んでおり、その典型的な防御は「該当アルゴリズムを検証側が到達する型の中で決して名指さない」ことです。

### 署名で拒否しているアルゴリズム

- **`alg=none`**（RFC 7518 §3.6） — 「署名」が空文字列。RFC 8725 §3.1 は「実装は `none` ベースの JWT を信頼してはならない」と規定。本ライブラリはアルゴリズム enum に `none` を含めていません。
- **`HS256` / `HS384` / `HS512`**（HMAC ファミリ） — 対称 MAC。alg-confusion 攻撃クラス（RFC 8725 §3.2）は「非対称と対称の両方を受け付ける検証側」が前提です — 攻撃者は `alg=HS256` の JWS を作り、OP の *公開* 鍵を HMAC のシークレットとして使い、ずさんな検証側はそれを通してしまいます。本ライブラリは enum にどの HMAC アルゴリズムも含めていません。

### 受け入れているアルゴリズム

| 用途 | アルゴリズム |
|---|---|
| OP 発行（ID トークン、JWT アクセストークン、JARM の出力署名） | `ES256` のみ。`WithKeyset` は P-256 でない署名鍵を `op.New` で拒否します。 |
| 検証（入力 JWS） | `RS256`、`PS256`、`ES256`、`EdDSA`。`RS256` を検証側で受理しているのは、OIDC Core 1.0 §10.1 が ID トークン検証で MUST-implement と定めているためです。 |

この 4 つが `internal/jose.Algorithm` の閉じた enum です。型のゼロ値デフォルトはなく、より広いレジストリへのフォールバックもありません。`depguard` の lint ルールが、`internal/jose/` の外で背後の JOSE パッケージを import することを禁じているので、将来のコード経路が `none` や `HS*` を不意に再導入することもありません。完全な背景は [設計判断 #11](/ja/security/design-judgments#dj-11) を参照。

## JWE allow-list

`internal/jose/jweparam.go` の JWE 許可集合も同様に閉じています。

| フィールド | 許可 | 拒否 |
|---|---|---|
| `alg`（鍵管理） | `RSA-OAEP-256`、`ECDH-ES`、`ECDH-ES+A128KW`、`ECDH-ES+A256KW` | `RSA1_5`（Bleichenbacher クラス）、`dir`（鍵ラップなし）、`A*KW` / `A*GCMKW`（対称 — HMAC と同じ鍵配布の問題）。 |
| `enc`（コンテンツ暗号化） | `A128GCM`、`A256GCM` | `A*CBC-HS*`（AES-CBC と HMAC — CBC-with-MAC 由来の歴史的落とし穴と、GCM より広い攻撃面）。 |

絞り込みは意図的です — 拒否されているアルゴリズムにはいずれも、OAuth / OIDC エコシステムが既に retire した（RSA1_5）か、プロファイルとして採用しなかった（OAuth bearer の CBC-with-MAC）攻撃クラスが文書化されています。組み込み側は `op.WithSupportedEncryptionAlgs(algs, encs []string)` でデプロイごとに広告集合をさらに絞り込めますが、本ライブラリの allow-list を超えて広げることはできません。

## 次に読む

- [ID トークン、アクセストークン、userinfo](/ja/concepts/tokens) — 各アーティファクトの内容と JWS 検証経路の違い。
- [運用: 鍵ローテーション](/ja/operations/key-rotation) — JWKS のライフサイクル、kid の retirement、RP キャッシュの収束。
- [ユースケース: JWE 暗号化](/ja/use-cases/jwe-encryption) — encryption keyset の配線と alg / enc リストの絞り込み。
