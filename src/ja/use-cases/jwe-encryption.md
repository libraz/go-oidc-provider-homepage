---
title: JWE 暗号化 — id_token / userinfo / JARM / introspection
description: JWE の組み込み — encryption keyset を登録、JWE request_object を受理、outbound 応答をクライアントの use=enc JWK 宛に暗号化。
---

# ユースケース — JWE 暗号化（RFC 7516）

OP は以下を行えます:

- OP の `use=enc` keyset 宛の JWE-shape request object（JAR / PAR §6.1）を **復号**
- 発行する `id_token`、JWT-shape `userinfo`、JARM authorization 応答、RFC 9701 JWT introspection 応答をクライアント登録の `use=enc` JWK 宛に **暗号化**

両方向とも v0.9.1 で実装済みです（閉じた許可リストに対して）。

::: details JWS と JWE の違い
**JWS**（RFC 7515 — JSON Web Signature）はおなじみの JOSE 形式で、ヘッダ + payload + 署名の構成です。鍵があれば誰でも payload を読めますが、署名は改ざんが無いことしか保証しません。**JWE**（RFC 7516 — JSON Web Encryption）は payload を ciphertext に包み、対応する秘密鍵を持つ受信者だけが読めるようにします。id_token は既定で署名（JWS）されており、その上にさらに JWE で暗号化すれば、想定 RP 以外には payload が不透明になります — RP 以外が TLS を終端するような構成で有用です。
:::

::: details `alg` と `enc` の違い
JWE はアルゴリズムスロットを 2 つ持ち、初見では必ず混乱します。**`alg` は鍵ラップアルゴリズム** で、メッセージごとにランダム生成される CEK（Content Encryption Key）をどうやって受信者に届けるかを規定します。`RSA-OAEP-256` なら CEK を受信者の RSA 公開鍵で暗号化し、`ECDH-ES` ならその場の ECDH 交換から導出します。**`enc` はコンテンツ暗号化アルゴリズム** で、その CEK を使って実際の payload をどう暗号化するかを規定します（例: `A256GCM` = AES-256 GCM モード）。常に各 1 つを選びます — `alg` は「対称鍵をどう合意するか」、`enc` は「合意した対称鍵でどの暗号を使うか」です。
:::

::: details `use=sig` と `use=enc` とは
JWK は `use` メンバで用途を広告できます — `sig` は署名 / 検証（JWS）、`enc` は暗号化 / 復号（JWE）です。RFC 7517（JSON Web Key）§4.2 は同じ鍵素材を両用途で使い回すことを禁じています。署名と暗号化ではアルゴリズムパラメータも脅威モデルも違うからです。OP は構造的に強制します — `WithKeyset`（署名）と `WithEncryptionKeyset`（暗号化）の両方に同じ kid が現れた場合、`op.New` が失敗します。
:::

## JWE が欲しい場面

- **通信路上の機密性**。TLS 終端境界が信頼境界と一致しない（企業ゲートウェイが TLS を開くが id_token の中身は見るべきでない、等）
- **エンドツーエンド暗号化**。規制対象でクレーム内容（PII、金融データ）が中間者に見えてもいけない場合
- **コンプライアンスフレームワーク**。一部地域の FAPI Open Banking プロファイルが encrypted JARM や encrypted id_token を要求

TLS hop-by-hop で十分で RP がすでに署名検証しているなら、JWE は鍵配布・ローテーション・alg negotiation の運用複雑性が比例的なメリットなしで増えるだけです。投機的に投入しないでください。

## 閉じた許可リスト

v0.9.1 が広告 + 受理するもの:

| ファミリ | 値 |
|---|---|
| Key wrap（`alg`） | `RSA-OAEP-256`、`ECDH-ES`、`ECDH-ES+A128KW`、`ECDH-ES+A256KW` |
| コンテンツ暗号化（`enc`） | `A128GCM`、`A256GCM` |

::: details ECDH-ES とは
Elliptic Curve Diffie-Hellman Ephemeral Static の略。送信側がその場で EC 鍵ペアを生成し、受信者の固定公開鍵に対して ECDH を実行、共有秘密から CEK を導出して、生成した ephemeral 公開鍵を JWE ヘッダに同梱します。受信者は自身の秘密鍵 + ephemeral 公開鍵で ECDH を再実行し、同じ CEK にたどり着きます。通信路上には鍵ラップされた CEK は乗りません — 派生形 `+A128KW` / `+A256KW` は、同じ payload を複数の受信者に向けて暗号化したい場合のためにラップを再導入したものです。
:::

::: details A256GCM とは
AES-256 を Galois/Counter Mode で動かしたものです。256-bit の鍵は `alg` 側が届けてくれた CEK で、GCM が認証タグを付け加えるので受信側で改ざんを検出できます。`A128GCM` は同じ構成で鍵長が 128-bit。OP は GCM のみを採用し、CBC モードは見送っています。GCM なら 1 パスで機密性と完全性が同時に得られ、padding oracle 系のバグクラスに当たらないためです。
:::

**v2+ で対応** するもの:

- `RSA-OAEP-384`、`RSA-OAEP-512` — go-jose v4.1.x が定数を露出していない
- `dir` — 対称直接暗号化モード。reserve
- `A*KW`（対称鍵のみ key wrap） — reserve

**永続的に拒否** するもの:

- `RSA1_5` — CVE-2017-11424 padding oracle。発送せず

`op.WithSupportedEncryptionAlgs(algs, encs)` は広告セットを **狭める** ことだけができます（ECDH-ES + A256GCM のみなど）。広げることはできません。allow-list 外の値は `op.New` で構成エラーになります。

## encryption keyset の登録

```go
import "github.com/libraz/go-oidc-provider/op"

// 1 つ以上の暗号化鍵を生成（または KMS から読み込み）。
// 秘密鍵 1 つ以上が必要。複数鍵はローテーション中の overlap 用。
provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(store),
  op.WithKeyset(myKeyset),                // 署名鍵（use=sig）
  op.WithCookieKeys(myCookieKey),

  op.WithEncryptionKeyset(op.EncryptionKeyset{
    {KeyID: "enc-2026-05", PrivateKey: rsaKey1},  // 現行
    {KeyID: "enc-2025-11", PrivateKey: rsaKey2},  // 退役中
  }),

  // 任意: 広告 alg を狭める
  op.WithSupportedEncryptionAlgs(
    []string{"RSA-OAEP-256"},
    []string{"A256GCM"},
  ),
)
```

::: warning RFC 7517 §4.2 は鍵の再利用を禁止
`WithKeyset`（署名、`use=sig`）に登録した鍵は `WithEncryptionKeyset`（`use=enc`）にも登場してはなりません。OP は構造的に強制します — 2 つのスライスが同じ `kid` を共有すると `op.New` が失敗します。各役割で別の鍵素材を生成してください。
:::

### EncryptionKey の形

| フィールド | 説明 |
|---|---|
| `KeyID` | JWKS で広告し、inbound JWE で照合する `kid`。keyset 内で unique |
| `PrivateKey` | `*rsa.PrivateKey`（2048 bit 以上）または `*ecdsa.PrivateKey`（P-256 / P-384 / P-521）。それ以外は `op.New` で拒否 |
| `Algorithm` | 任意の明示 `alg`（`ECDH-ES+A256KW` 等）。空のとき: RSA → `RSA-OAEP-256`、ECDSA → `ECDH-ES` |
| `NotAfter` | 任意の retirement deadline。OP はこの kid 宛 JWE をこの時刻以降復号しない。public 半は cache warmth のため JWKS に残す |

keyset の最初の entry が **outbound 暗号化のアクティブ鍵**。後続 entry は JWKS に残り、ローテーション overlap 中に古い kid を持つ RP キャッシュが addressing できるようにします。Inbound 復号は `kid` を最初に matching、kid 不在時はスライス順に全鍵への trial 復号にフォールバック（RFC 7516 §4.1.6）。

::: details ローテーション overlap とは
RP は JWKS 応答をキャッシュします（数時間オーダーが一般的）。一発で暗号鍵を入れ替えてしまうと、古い `kid` をまだキャッシュしている RP は OP が受け付けない鍵に向けて暗号化することになり、認可が失敗するウィンドウが生じます。対策は「最低 1 キャッシュ寿命の間、新旧 2 鍵を併存させる」ことです。新鍵を outbound のアクティブ鍵にして OP が暗号化に使い、両秘密鍵を inbound の復号で受け付け、キャッシュウィンドウが満了したら古い鍵を取り除きます。署名鍵に同じ考え方を適用したものは [鍵ローテーション](/ja/operations/key-rotation) を参照してください。
:::

## per-client メタデータが outbound 暗号化のスイッチを握る

OP は **クライアントメタデータがその応答型に対する暗号化 alg/enc ペアを名指したとき限定で** outbound 応答を暗号化します。5 ファミリ:

| 応答 | クライアントメタデータフィールド |
|---|---|
| id_token | `id_token_encrypted_response_alg`、`id_token_encrypted_response_enc` |
| userinfo（JWT） | `userinfo_encrypted_response_alg`、`userinfo_encrypted_response_enc` |
| request_object（inbound、JAR / PAR） | `request_object_encryption_alg_values_supported`（サーバ側） |
| authorization（JARM） | `authorization_encrypted_response_alg`、`authorization_encrypted_response_enc` |
| introspection（RFC 9701） | `introspection_encrypted_response_alg`、`introspection_encrypted_response_enc` |

::: details JARM とは
JWT Secured Authorization Response Mode（OpenID Foundation FAPI WG）の略。redirect 上で `code` や `state` を生のクエリパラメータで返すかわりに、OP が `response` という単一パラメータに署名済（必要なら追加で暗号化済）の JWT を入れて返す方式です。これにより man-in-the-browser がリダイレクト途中で `code` を書き換える攻撃を防ぎ、応答が URL バーに平文で残ることもなくなります。JARM はクライアントごとのオプトインで、`authorization_signed_response_alg` / `_encrypted_response_alg` / `_enc` で有効化します。
:::

::: details JWT introspection とは
RFC 9701（"OAuth 2.0 JWT Response for Introspection"）。従来の `/introspect`（RFC 7662）は plain な JSON を返しますが、RFC 9701 ではリソースサーバが代わりに署名済（必要なら暗号化済）の JWT を要求できます。リソースサーバが「AS は alice のトークンだとこの時刻に言った」という否認不能な記録を保持したい場合や、introspection 応答自体が信頼境界をまたぐ場合に有用です。
:::

DCR マウントは `internal/jose.ParseJWEAlg` / `ParseJWEEnc` 経由で値を検証します — ランタイムと同じ許可リストを参照するため、将来の許可リスト変更が自動的に伝播します。

::: warning 半ペア登録は拒否
DCR は `id_token_encrypted_response_alg=RSA-OAEP-256` を `id_token_encrypted_response_enc` 無しで提出するような非対称な指定を、登録時点で `invalid_client_metadata` として拒否します。両方空 = OK(このクライアントはその応答型で暗号化をオプトアウト)、両方値あり = OK、片方だけ = 拒否。「登録は通るが最初の暗号化応答が実行時に失敗する」失敗モードを塞ぎます。
:::

クライアントは `use=enc` 鍵を含む `jwks`（または `jwks_uri`）も公開します。OP が RP 側ローテーションに合わせて適切な鍵を解決します。

## Discovery 露出

`op.WithEncryptionKeyset` を設定すると、discovery が以下を公開します:

- `jwks_uri` が既存の `use=sig` 素材と並列で `use=enc` JWK を含む（RFC 7517 §4.2）
- `id_token_encryption_alg_values_supported` / `_enc_values_supported` — 出力
- `userinfo_encryption_alg_values_supported` / `_enc_values_supported` — 出力（`feature.Userinfo` が常に on のため常時）
- `request_object_encryption_alg_values_supported` / `_enc_values_supported` — `feature.JAR` 有効時に出力
- `authorization_encryption_alg_values_supported` / `_enc_values_supported` — `feature.JARM` 有効時に出力
- `introspection_encryption_alg_values_supported` / `_enc_values_supported` — `feature.Introspect` 有効時に出力

オプションなしの場合、暗号化関連 discovery キーはすべて空（または不在）になり、復号試行は `invalid_request_object` で失敗します。

## userinfo 署名 — 常時 on

encryption keyset とは独立に、`userinfo_signing_alg_values_supported` は無条件で `["ES256"]` を公開します。JWT-shape userinfo パスは `Accept: application/jwt` で常に利用可能。signed userinfo を望む RP は暗号化メタデータを登録する必要なし。

## 動かしてみる

[`examples/34-encrypted-id-token`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-encrypted-id-token):

```sh
go run -tags example ./examples/34-encrypted-id-token
```

RSA-OAEP-256 / A256GCM id_token 暗号化のペア OP+RP デモ。OP が `use=enc` JWKS を公開、RP が `id_token_encrypted_response_alg=RSA-OAEP-256` + `_enc=A256GCM` で登録、OP が id_token を JWE で wrap、RP 側 decrypt が内側 JWS を取り出し検証します。ファイル: `op.go`（`WithEncryptionKeyset` での OP 組み立て）、`rp.go`（RP 側 decrypt + signature verify）、`jose.go`（鍵生成 + JWKS marshalling）。

## 続きはこちら

- [RFC 対応一覧 § RFC 7516 JWE](/ja/compliance/rfc-matrix#jose-系)
- [鍵ローテーション](/ja/operations/key-rotation) — RP のキャッシュが古くても失敗しないよう、切替ウィンドウ内で新旧 2 つの暗号化鍵を共存させる
