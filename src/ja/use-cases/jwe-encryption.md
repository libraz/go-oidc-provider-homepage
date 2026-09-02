---
title: JWE 暗号化 — id_token / userinfo / JARM / introspection
description: JWE の組み込み — 暗号化鍵集合を登録、JWE request_object を受理、出力応答をクライアントの use=enc JWK 宛に暗号化。
pageClass: pg-use-cases-jwe-encryption
---

# 使い方 — JWE 暗号化（RFC 7516）

OP は以下を行えます:

- OP の `use=enc` 鍵集合宛の JWE 形式 request object（JAR / PAR §6.1）を **復号**
- 発行する `id_token`、JWT 形式 `userinfo`、JARM 認可応答、RFC 9701 JWT introspection 応答をクライアント登録の `use=enc` JWK 宛に **暗号化**

両方向とも閉じた許可リストに対して実装しています。

<svg role="img" aria-labelledby="jwe-wrap-title" viewBox="0 0 760 310" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="jwe-wrap-title">JWE が JWS を包み込む。OP は claim を JWS に署名し、その JWS を RP の use=enc JWK 宛の JWE の中に暗号化する。RP は外側の JWE を復号してから内側の署名を検証する。</title>

  <rect class="jwe-box" x="16" y="110" width="140" height="62" rx="8"/>
  <text class="jwe-text" x="86" y="136" text-anchor="middle">OP</text>
  <text class="jwe-sub" x="86" y="156" text-anchor="middle">claim を組み立てる</text>

  <rect class="jwe-box" x="214" y="70" width="250" height="150" rx="10"/>
  <text class="jwe-text" x="339" y="97" text-anchor="middle">外側: JWE</text>
  <rect class="jwe-main" x="242" y="110" width="194" height="62" rx="8"/>
  <text class="jwe-text" x="339" y="147" text-anchor="middle">内側: JWS</text>
  <text class="jwe-sub" x="339" y="201" text-anchor="middle">RP の公開鍵で暗号化</text>

  <rect class="jwe-box" x="604" y="110" width="140" height="62" rx="8"/>
  <text class="jwe-text" x="674" y="136" text-anchor="middle">RP</text>
  <text class="jwe-sub" x="674" y="156" text-anchor="middle">復号 → 署名検証</text>

  <rect class="jwe-box" x="254" y="250" width="170" height="44" rx="8"/>
  <text class="jwe-text" x="339" y="278" text-anchor="middle">use=enc JWK</text>

  <path class="jwe-flow" d="M156 141 H211"/>
  <path class="jwe-flow" d="M205 137 L213 141 L205 145"/>
  <text class="jwe-sub" x="534" y="126" text-anchor="middle">暗号化済み応答</text>
  <path class="jwe-flow" d="M464 141 H601"/>
  <path class="jwe-flow" d="M595 137 L603 141 L595 145"/>
  <path class="jwe-flow" d="M339 250 V224"/>
  <path class="jwe-flow" d="M335 230 L339 221 L343 230"/>
</svg>

::: details JWS と JWE の違い
**JWS**（RFC 7515 — JSON Web Signature）はおなじみの JOSE 形式で、ヘッダ + 本文 + 署名の構成です。鍵があれば誰でも本文を読めますが、署名は改ざんが無いことしか保証しません。**JWE**（RFC 7516 — JSON Web Encryption）は本文を暗号文に包み、対応する秘密鍵を持つ受信者だけが読めるようにします。id_token は既定で署名（JWS）されており、その上にさらに JWE で暗号化すれば、想定 RP 以外には本文が不透明になります。RP 以外が TLS を終端するような構成で有用です。
:::

::: details `alg` と `enc` の違い
JWE はアルゴリズム指定を 2 つ持つため、初見では混乱しやすいです。**`alg` は鍵ラップアルゴリズム** で、メッセージごとにランダム生成される CEK（Content Encryption Key）をどうやって受信者に届けるかを規定します。`RSA-OAEP-256` なら CEK を受信者の RSA 公開鍵で暗号化し、`ECDH-ES` ならその場の ECDH 交換から導出します。**`enc` はコンテンツ暗号化アルゴリズム** で、その CEK を使って実際の本文をどう暗号化するかを規定します（例: `A256GCM` = AES-256 GCM モード）。常に各 1 つを選びます。`alg` は「対称鍵をどう合意するか」、`enc` は「合意した対称鍵でどの暗号を使うか」です。
:::

::: details `use=sig` と `use=enc` とは
JWK は `use` メンバで用途を広告できます — `sig` は署名 / 検証（JWS）、`enc` は暗号化 / 復号（JWE）です。RFC 7517（JSON Web Key）§4.2 は同じ鍵素材を両用途で使い回すことを禁じています。署名と暗号化ではアルゴリズムパラメータも脅威モデルも違うからです。OP は構造的に強制します — `WithKeyset`（署名）と `WithEncryptionKeyset`（暗号化）の両方に同じ kid が現れた場合、`op.New` が失敗します。
:::

## JWE が欲しい場面

- **通信路上の機密性**。TLS 終端境界が信頼境界と一致しない（企業ゲートウェイが TLS を開くが id_token の本文は見るべきでない、等）
- **エンドツーエンド暗号化**。規制対象でクレーム内容（PII、金融データ）が中間者に見えてもいけない場合
- **コンプライアンスフレームワーク**。一部地域の FAPI Open Banking プロファイルが encrypted JARM や encrypted id_token を要求

TLS の区間暗号化で十分で、RP がすでに署名検証しているなら、JWE は鍵配布・ローテーション・アルゴリズム選択の運用複雑性を増やすだけになりがちです。必要性が明確な場合だけ使ってください。

## 閉じた許可リスト

OP が広告 + 受理するもの:

| ファミリ | 値 |
|---|---|
| Key wrap（`alg`） | `RSA-OAEP-256`、`ECDH-ES`、`ECDH-ES+A128KW`、`ECDH-ES+A256KW` |
| コンテンツ暗号化（`enc`） | `A128GCM`、`A256GCM` |

::: details ECDH-ES とは
Elliptic Curve Diffie-Hellman Ephemeral Static の略。送信側がその場で EC 鍵ペアを生成し、受信者の固定公開鍵に対して ECDH を実行、共有秘密から CEK を導出して、生成した一時公開鍵を JWE ヘッダに同梱します。受信者は自身の秘密鍵 + 一時公開鍵で ECDH を再実行し、同じ CEK にたどり着きます。通信路上には鍵ラップされた CEK は乗りません。派生形 `+A128KW` / `+A256KW` は、同じ本文を複数の受信者に向けて暗号化したい場合のためにラップを再導入したものです。
:::

::: details A256GCM とは
AES-256 を Galois/Counter Mode で動かしたものです。256-bit の鍵は `alg` 側が届けてくれた CEK で、GCM が認証タグを付け加えるので受信側で改ざんを検出できます。`A128GCM` は同じ構成で鍵長が 128-bit。OP は GCM のみを採用し、CBC モードは見送っています。GCM なら 1 パスで機密性と完全性が同時に得られ、padding oracle 系のバグクラスに当たらないためです。
:::

次のアルゴリズムは現在の許可リスト外です:

- `RSA-OAEP-384`、`RSA-OAEP-512`
- `dir` — 対称直接暗号化モード
- `A*KW`（対称鍵のみ key wrap）

**永続的に拒否** するもの:

- `RSA1_5` — CVE-2017-11424 padding oracle。発送せず

`op.WithSupportedEncryptionAlgs(algs, encs)` は広告セットを **狭める** ことだけができます（ECDH-ES + A256GCM のみなど）。広げることはできません。許可リスト外の値は `op.New` で構成エラーになります。

## 暗号化鍵集合の登録

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

// inbound JWE request object 用の OP 側秘密鍵を 1 つ以上生成（または KMS から読み込み）。
// 秘密鍵 1 つ以上が必要。複数鍵はローテーション中の重なり期間用。
st := inmem.New()
loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),                // 署名鍵（use=sig）
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithGrants(grant.AuthorizationCode, grant.RefreshToken),

  op.WithEncryptionKeyset(op.EncryptionKeyset{
    {KeyID: "enc-2026-05", PrivateKey: rsaKey1},  // 新しい inbound 鍵
    {KeyID: "enc-2025-11", PrivateKey: rsaKey2},  // 退役中。inbound overlap 用
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
| `NotAfter` | 任意の退役期限。この時刻以降は厳格に適用され、OP はこの kid 宛の JWE を復号せず、**public 半も JWKS から落とす**。OP がもう受け付けない鍵へ RP を誘導しないため |

`EncryptionKeyset` は **inbound 専用**です。どの entry も outbound 暗号化のアクティブ鍵にはなりません。outbound JWE 応答はクライアントの JWKS から選んだ `use=enc` 鍵で暗号化します。entry は復号候補の順序で並び、`use=enc` 鍵として公開されます。`kid` があれば OP は一致する live entry を選びます。`kid` がなければ、保護ヘッダの `alg` が要求する鍵ファミリに候補を絞り、スライス順に試します（RFC 7516 §4.1.6）。絞り込み後の候補が `op.MaxKidlessEncryptionTrialKeys`（既定値 4）を超える場合、OP は候補を切り詰めず復号を拒否します。`op.New` はファミリが大きすぎる構成に対して構築時 warning を出します。その上限を超えるファミリを使う場合は、RP に `kid` を必ず含めさせてください。

::: details ローテーション overlap とは
RP は OP の JWKS 応答をキャッシュします（数時間オーダーが一般的）。一発で inbound 暗号化鍵を入れ替えてしまうと、古い `kid` をまだキャッシュしている RP は OP がもう受け付けない鍵に request object を暗号化することになり、認可が失敗するウィンドウが生じます。対策は「最低 1 キャッシュ寿命の間、新旧 2 鍵を併存させる」ことです。新鍵を先頭に置いて kidless inbound JWE で先に試し、両秘密鍵を inbound 復号で受け付け、キャッシュウィンドウと受理対象 request の寿命が満了したら古い鍵を取り除きます。新鍵は outbound 鍵ではなく、応答の暗号化先は常にクライアントの鍵です。Provider の差し替え手順は[鍵ローテーション](/ja/operations/key-rotation)を参照してください。
:::

## クライアント別メタデータが出力暗号化を決める

OP は **クライアントメタデータがその応答型に対する暗号化 alg/enc ペアを名指したとき限定で** 出力応答を暗号化します。対象は 5 種類です。

| 応答 | クライアントメタデータフィールド |
|---|---|
| id_token | `id_token_encrypted_response_alg`、`id_token_encrypted_response_enc` |
| userinfo（JWT） | `userinfo_encrypted_response_alg`、`userinfo_encrypted_response_enc` |
| request_object（inbound、JAR / PAR） | `request_object_encryption_alg_values_supported`（サーバ側） |
| authorization（JARM） | `authorization_encrypted_response_alg`、`authorization_encrypted_response_enc` |
| introspection（RFC 9701） | `introspection_encrypted_response_alg`、`introspection_encrypted_response_enc` |

::: details JARM とは
JWT Secured Authorization Response Mode（OpenID Foundation FAPI WG）の略。redirect 上で `code` や `state` を生のクエリパラメータで返すかわりに、OP が `response` という単一パラメータに署名済（必要なら追加で暗号化済）の JWT を入れて返す方式です。これにより man-in-the-browser がリダイレクト途中で `code` を書き換える攻撃を防ぎ、応答が URL バーに平文で残ることもなくなります。JARM はクライアントごとに `authorization_signed_response_alg` / `_encrypted_response_alg` / `_enc` で有効化します。
:::

::: details JWT introspection とは
RFC 9701（"OAuth 2.0 JWT Response for Introspection"）。従来の `/introspect`（RFC 7662）は plain な JSON を返しますが、RFC 9701 ではリソースサーバが代わりに署名済（必要なら暗号化済）の JWT を要求できます。リソースサーバが「AS は alice のトークンだとこの時刻に言った」という否認不能な記録を保持したい場合や、introspection 応答自体が信頼境界をまたぐ場合に有用です。
:::

DCR マウントは `internal/jose.ParseJWEAlg` / `ParseJWEEnc` 経由で値を検証します。実行時と同じ許可リストを参照するため、登録時と request 処理時の判定が一致します。

::: warning 半ペア登録は拒否
DCR は `id_token_encrypted_response_alg=RSA-OAEP-256` を `id_token_encrypted_response_enc` 無しで提出するような非対称な指定を、登録時点で `invalid_client_metadata` として拒否します。両方空 = OK(このクライアントはその応答型で暗号化を使わない)、両方値あり = OK、片方だけ = 拒否。「登録は通るが最初の暗号化応答が実行時に失敗する」失敗モードを塞ぎます。

```jsonc
// NG: alg だけを指定して enc がない
{
  "id_token_encrypted_response_alg": "RSA-OAEP-256"
}

// NG: enc だけを指定して alg がない
{
  "id_token_encrypted_response_enc": "A256GCM"
}

// OK: 暗号化しない
{}

// OK: alg と enc をペアで指定する
{
  "id_token_encrypted_response_alg": "RSA-OAEP-256",
  "id_token_encrypted_response_enc": "A256GCM"
}
```
:::

クライアントは `use=enc` 鍵を含む `jwks`（または `jwks_uri`）も公開します。OP が RP 側ローテーションに合わせて適切な鍵を解決します。

## Discovery 露出

discovery は `op.WithSupportedEncryptionAlgs` による narrowing 後の、実効的な JWE ポリシーを反映します:

- `jwks_uri` は既存の `use=sig` 素材と並べて、設定上 usable な `use=enc` JWK を含めます（RFC 7517 §4.2）。公開する `alg` も同じ narrowing を反映します。
- 出力応答用の `id_token_encryption_*` と `userinfo_encryption_*`、および feature 有効時の `authorization_encryption_*`（JARM）と `introspection_encryption_*` は、実効的な alg/enc リストを広告します。これらはクライアントの鍵への暗号化を表し、`op.WithEncryptionKeyset` には依存しません。
- `request_object_encryption_alg_values_supported` / `_enc_values_supported` は JAR と `op.WithEncryptionKeyset` の両方が有効な場合だけ出力します。`alg` リストは OP が実際に復号できる鍵ファミリへさらに絞られ、`enc` リストは設定した narrowing に従います。

`op.WithEncryptionKeyset` を設定しない場合、request object 暗号化の discovery field は absent になり、inbound の暗号化 request object は `invalid_request_object` で失敗します。一方、feature とクライアントメタデータが整っていれば、outbound 応答暗号化は広告・利用できます。supported alg または enc を明示的に空にすると、JWE negotiation は抑止されます。

## userinfo 署名 — 常時有効

暗号化鍵集合とは独立に、`userinfo_signing_alg_values_supported` は無条件で `["ES256"]` を公開します。JWT 形式の userinfo パスは `Accept: application/jwt` で常に利用可能です。署名付き userinfo を望む RP は暗号化メタデータを登録する必要がありません。

## 動かしてみる

[`examples/35-encrypted-id-token`](https://github.com/libraz/go-oidc-provider/tree/main/examples/35-encrypted-id-token):

```sh
(cd examples/35-encrypted-id-token && go run -tags example .)
```

RSA-OAEP-256 / A256GCM id_token 暗号化のペア OP+RP デモ。OP が `use=enc` JWKS を公開、RP が `id_token_encrypted_response_alg=RSA-OAEP-256` + `_enc=A256GCM` で登録、OP が id_token を JWE で包み、RP 側が復号して内側の JWS を検証します。ファイル: `op.go`（`WithEncryptionKeyset` での OP 組み立て）、`rp.go`（RP 側の復号 + 署名検証）、`jose.go`（鍵生成 + JWKS 変換）。

## 続きはこちら

- [RFC 対応一覧 § RFC 7516 JWE](/ja/compliance/rfc-matrix#jose-系)
- [鍵ローテーション](/ja/operations/key-rotation) — RP のキャッシュが古くても失敗しないよう、切替ウィンドウ内で新旧 2 つの暗号化鍵を共存させる
