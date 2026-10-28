---
title: "JOSE 基礎: JWS、JWE、JWK、JWKS、kid"
description: OIDC を学ぶ方のための JOSE 入門最小セット — 各略語の意味、OIDC でどこに登場するか、本ライブラリがアルゴリズム許可リストを閉じている理由。
pageClass: pg-concepts-jose-basics
---

# JOSE 基礎: JWS、JWE、JWK、JWKS、kid

**JOSE**（JavaScript Object Signing and Encryption）は、JSON 形式のトークンの署名・暗号化・鍵表現を定める IETF 仕様群の総称です。OIDC 実装は JWS / JWE / JWK / JWKS の 4 つすべてを使いますが、ほとんどは内部に隠れていて、ときどき表に出てきます。本ページでは、`id_token`、`jwks_uri`、JAR の `request=` パラメータ、`kid` を読むために最低限必要なことを説明します。

<figure class="fig">
  <div class="fig-head">JOSE の各要素のつながり</div>
  <svg class="fig-svg" role="img" aria-labelledby="jose-map-title" viewBox="0 0 960 512" xmlns="http://www.w3.org/2000/svg">
    <title id="jose-map-title">JWS が JWT に署名し、JWE が署名済み JWT を暗号化された外枠で包み、受信者は復号してから署名を検証します。これとは別に、JWS ヘッダの kid が、OP が jwks エンドポイントで公開する JWKS の中から JWK を 1 つ選びます。</title>
    <!-- band: producing a token -->
    <rect class="fg-group" x="32" y="24" width="896" height="168" rx="8"/>
    <text class="fg-lbl" x="56" y="52">トークンを作る</text>
    <!-- jws -->
    <rect class="fg-box" x="56" y="72" width="256" height="96" rx="8"/>
    <text class="fg-t" x="72" y="100">JWS</text>
    <text class="fg-s" x="72" y="124">署名する。内容は読める</text>
    <text class="fg-mxs" x="72" y="148">header.payload.signature</text>
    <!-- jwe -->
    <rect class="fg-box" x="352" y="72" width="256" height="96" rx="8"/>
    <text class="fg-t" x="368" y="100">JWE</text>
    <text class="fg-s" x="368" y="124">署名済み JWT を包む</text>
    <text class="fg-s" x="368" y="148">暗号化された外枠</text>
    <!-- rcp -->
    <rect class="fg-box" x="648" y="72" width="256" height="96" rx="8"/>
    <text class="fg-t" x="664" y="100">受信者</text>
    <text class="fg-s" x="664" y="124">まず外枠を復号し、</text>
    <text class="fg-s" x="664" y="148">続けて署名を検証する</text>
    <path class="fg-edge" d="M312,120 H352" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M608,120 H648" marker-end="url(#fg-a)"/>
    <!-- band: finding the right key -->
    <rect class="fg-group" x="32" y="216" width="896" height="272" rx="8"/>
    <text class="fg-lbl" x="56" y="244">正しい鍵を見つける</text>
    <!-- JWS header -->
    <rect class="fg-box fg-box--accent" x="56" y="284" width="232" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="72" y="312">JWS ヘッダ</text>
    <text class="fg-mxs" x="72" y="336">"alg": "ES256"</text>
    <text class="fg-mxs" x="72" y="360">"kid": "2024-05"</text>
    <path class="fg-edge fg-edge--accent" d="M288,332 H408" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="348" y="322" text-anchor="middle">選択</text>
    <!-- JWKS -->
    <rect class="fg-box" x="408" y="264" width="496" height="200" rx="8"/>
    <text class="fg-t2" x="424" y="292">JWKS</text>
    <text class="fg-s" x="496" y="292">JWK の集合。/jwks で公開される</text>
    <rect class="fg-box fg-box--accent" x="424" y="312" width="464" height="40" rx="8"/>
    <text class="fg-mxs" x="440" y="337">JWK · kid 2024-05</text>
    <text class="fg-s" x="632" y="337">現行の署名鍵</text>
    <rect class="fg-box fg-box--muted" x="424" y="360" width="464" height="40" rx="8"/>
    <text class="fg-mxs" x="440" y="385">JWK · kid 2023-11</text>
    <text class="fg-s" x="632" y="385">退役済み。旧トークンを検証</text>
    <rect class="fg-box fg-box--muted" x="424" y="408" width="464" height="40" rx="8"/>
    <text class="fg-mxs" x="440" y="433">JWK · kid 2024-09</text>
    <text class="fg-s" x="632" y="433">次の鍵。先に公開しておく</text>
  </svg>
  <figcaption class="fig-note">3 つの鍵が同時に載っていることに意味があります。昨日この集合を取得した検証側が、今日署名されたトークンも去年署名されたトークンも、切り替え日を設けずに検証できます。</figcaption>
</figure>

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
- **JWS** が署名する。**JWE** が暗号化する。**JWK** は鍵 1 個。**JWKS** は鍵集合。**kid** はどの鍵かを選ぶラベル。
- OIDC で目にする JWT はすべて JWS — `header.payload.signature`。
- ID トークン、userinfo、authorize 応答が署名に加えて暗号化されるとき、その外側の層が JWE。
- `/jwks` の JWKS のおかげで、RP は ID トークンをオフラインで検証できる。OP は新しい鍵を先に公開してからローテーションする。
:::

## JWS — JSON Web Signature

**JWS** は JWT が使う署名の仕組みです。コンパクトシリアライズでは、ドットでつないだ 3 つの base64url セグメントになります。

```
<base64url(header)>.<base64url(payload)>.<base64url(signature)>
```

ヘッダは署名アルゴリズムと鍵を名付ける JSON オブジェクトです。

```json
{ "alg": "ES256", "kid": "2026-q1" }
```

payload はトークンの claim（JSON オブジェクト）です。signature は `header + "." + payload` に対して、`alg` で指定したアルゴリズムと `kid` で選んだ鍵で計算します。

OIDC では、JWS を次の用途に使います。

| トークン | 仕様 | 署名者 |
|---|---|---|
| `id_token` | OIDC Core 1.0 §2 | OP の署名鍵。 |
| アクセストークン（既定の JWT 形式） | RFC 9068 | OP の署名鍵。 |
| `request` / `request_uri`（JAR） | RFC 9101 | RP の鍵。クライアントの登録済み JWKS（`jwks_uri` またはインラインの `jwks`）から取得。 |
| `client_assertion`（`private_key_jwt`） | RFC 7523 | RP の鍵。 |
| Authorize 応答（JARM） | OpenID FAPI JARM | OP の署名鍵。 |
| `logout_token`（Back-Channel Logout） | OIDC BCL 1.0 | OP の署名鍵。 |

受信側は、関連する JWKS の公開鍵で署名を検証します。署名が正しく、claim（`iss`、`aud`、`exp`）が期待と合えば、トークンを受理します。

トークンの種類が重要な場面では、OP は `typ` ヘッダも検査します。`typ` が省略されておらず、かつ `JWT` でもない `id_token_hint`（logout token やアクセストークンなど）は、`/end_session` でも CIBA でも拒否されます。

## JWE — JSON Web Encryption

**JWE** は暗号化版です。コンパクトシリアライズは 5 セグメントです。

```
<base64url(header)>.<base64url(encrypted_key)>.<base64url(iv)>.<base64url(ciphertext)>.<base64url(tag)>
```

ヘッダは 2 つのアルゴリズム名を持ちます。

| フィールド | 内容 |
|---|---|
| `alg` | **鍵管理アルゴリズム。** メッセージごとのコンテンツ鍵を受信者にどう届けるか: `RSA-OAEP-256`（RSA 鍵搬送）、`ECDH-ES`（ダイレクト ECDH）、`ECDH-ES+A128KW` / `ECDH-ES+A256KW`（ECDH と AES 鍵ラップ）。 |
| `enc` | **コンテンツ暗号化アルゴリズム。** 本文をどう暗号化するか: `A128GCM`、`A256GCM`。 |

OIDC では、組み込み側やクライアントが署名に加えて機密性も求めるときに、JWE を **外側の暗号化層** として使います。RP の公開鍵で暗号化した `id_token`、暗号化した userinfo 応答、暗号化した introspection 応答、暗号化した authorize 応答（暗号化付き JARM）が該当します。内側のトークンは JWS のままで、JWE はそれを包むだけです。

`op.WithEncryptionKeyset` は逆方向の設定です。暗号化された inbound request object を復号する秘密鍵を保持し、その公開側を `use=enc` 鍵として公開します。outbound 用の鍵集合ではありません。outbound の JWE 応答は、クライアントの JWKS から選んだ `use=enc` 鍵で暗号化します。inbound の JWE が `kid` を省略した場合、OP は `alg` が要求するファミリの live 鍵に候補を絞り、`op.MaxKidlessEncryptionTrialKeys`（4）を超える数は試さずに拒否します。ファミリの鍵がそれより多いときは `kid` を送ってください。

完全な設定（`op.WithEncryptionKeyset`、`op.WithSupportedEncryptionAlgs`）は [JWE 暗号化](/ja/use-cases/jwe-encryption) を参照。

## JWK — JSON Web Key

**JWK** は、1 つの暗号鍵を JSON で表す標準形式です。

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
| `kid` | 鍵 ID — JWKS から鍵を選び出すラベル。 |
| `use` | `sig`（署名）または `enc`（暗号）。 |
| `alg` | この鍵を使うアルゴリズム。呼び出し側が弱いものに差し替えられないよう固定される。 |

公開される JWK には公開鍵の情報だけが含まれ、対になる秘密鍵は OP の外に出ません。

## JWKS — JWK Set

**JWKS** は、`keys` メンバーに JWK の配列を持つ JSON オブジェクトです。

```json
{
  "keys": [
    { "kty": "EC", "kid": "2026-q1", ... },
    { "kty": "EC", "kid": "2025-q4", ... }
  ]
}
```

OP は公開署名鍵を `jwks_uri` で公開し、その URL は [discovery 文書](/ja/concepts/discovery)で告知されます。`op.WithEncryptionKeyset` を設定すると、同じ endpoint に inbound の暗号化 request object 用の OP の公開 `use=enc` 鍵も載ります。RP は JWKS を取得してキャッシュし、署名の検証や request object の暗号化に使います。鍵ローテーション中、OP は RP のキャッシュが追いつくまで、前の鍵を集合に残します。[運用: 鍵ローテーション](/ja/operations/key-rotation) を参照してください。

クライアント自身の鍵も同じ仕組みですが、クライアント記録が持てるのはインラインの `jwks` か `jwks_uri` の片方だけで、両方は持てません（RFC 7591 §2）。両方を持つ記録は、鍵を使うどの場面でも拒否されます。request object の検証、`private_key_jwt`、レスポンス暗号化のすべてです。

::: details `jwks_uri` と JWS ヘッダの `jwk` の違い
- **`jwks_uri`**（discovery のフィールド）は、OP が JWKS を配信する URL。安定でキャッシュ可能、RP は自身の都合で取得します。
- **`jwk` JWS ヘッダ** は、トークン自身のヘッダに埋め込まれた JWK。RFC 7515 は許容していますが、RFC 8725 §3.5 は、トークンが自分で名乗った鍵を信頼するのは典型的な落とし穴だと警告しています。誰でも JWS を作り、自前の `jwk` をヘッダに付けて、検証側に「これで検証して」と渡せるからです。**本ライブラリは、入力トークンのインライン `jwk` ヘッダを決して信頼しません。** 自分が発行したトークンは OP 自身の鍵で、クライアントが提示した JWS はそのクライアントに登録された鍵で検証します。
:::

## kid — どの鍵を使うかの指定

`kid` は鍵 ID です。JWS が到着すると、検証側は次の手順を踏みます。

1. JWS ヘッダから `kid` を読む。
2. 関連する JWKS から、`kid` が一致する JWK を探す。
3. `alg` で名付けたアルゴリズムを、その鍵に対して実行して署名を検証する。

`kid` がなければ、検証側は集合内のすべての鍵を順に試すことになります。遅いうえに、攻撃者にどの鍵で混乱させるかを選ばせてしまいます。本ライブラリは生成するすべての JWS に `kid` を付け、関連する JWKS に `kid` がない入力トークンを拒否します。

OP 自身が署名したトークンの `kid` が、退役時刻を過ぎた鍵のものだった場合、OP は `kid` が未知であるかのように拒否し、`op.AuditKeyRetiredKidPresented` を発火します。ローテーションで外れた鍵のトークンをまだ持っている呼び出し元を、ダッシュボードで特定できます。詳細は [運用: 鍵ローテーション](/ja/operations/key-rotation) を参照してください。

## なぜ本ライブラリは alg 許可リストを閉じているか

JOSE のアルゴリズムレジストリには、既知の攻撃につながる 2 系統のアルゴリズムが含まれています。標準的な防御は、それらを検証側が到達できる型の中に一切置かないことです。

### 署名で拒否しているアルゴリズム

- **`alg=none`**（RFC 7518 §3.6） — 署名を持たない JWT です。RFC 8725 §3.1 はアプリケーションが許可したアルゴリズムだけを検証に使うよう求めています。本ライブラリはその許可集合に `none` を含めません。
- **`HS256` / `HS384` / `HS512`**（HMAC ファミリ）は対称 MAC です。alg confusion（RFC 8725 §3.2）は、非対称と対称の両方を受け付ける検証側を狙います。攻撃者は `alg=HS256` の JWS を作り、OP の *公開* 鍵を HMAC のシークレットとして使い、不注意な検証側はそれを通してしまいます。本ライブラリのアルゴリズム enum に HMAC 系は含まれません。

### 受け入れているアルゴリズム

| 用途 | アルゴリズム |
|---|---|
| OP 発行（ID トークン、JWT アクセストークン、JARM の出力署名） | `ES256` のみ。`WithKeyset` は P-256 でない署名鍵を `op.New` で拒否します。 |
| 検証（入力 JWS） | `RS256`、`PS256`、`ES256`、`EdDSA`。FAPI プロファイルでは、クライアントが署名する入力が `PS256`、`ES256`、`EdDSA` に絞られます。入力での `RS256` 対応は相互運用上の選択で、ID トークンの署名で `RS256` に対応するという別の OIDC Core 要件を満たすものではありません。 |

この 4 つが `internal/jose.Algorithm` の閉じた enum です。型にゼロ値の既定はなく、より広いレジストリへのフォールバックもありません。`depguard` の lint ルールが `internal/jose/` の外で背後の JOSE パッケージを import することを禁じているので、新しいコード経路が `none` や `HS*` を再び持ち込むこともありません。詳しい背景は [設計判断 #11](/ja/security/design-judgments#dj-11) を参照してください。

## JWE 許可リスト

`internal/jose/jweparam.go` の JWE 許可集合も同様に閉じています。

| フィールド | 許可 | 拒否 |
|---|---|---|
| `alg`（鍵管理） | `RSA-OAEP-256`、`ECDH-ES`、`ECDH-ES+A128KW`、`ECDH-ES+A256KW` | `RSA1_5`（Bleichenbacher クラス）、`dir`（鍵ラップなし）、`A*KW` / `A*GCMKW`（対称 — HMAC と同じ鍵配布の問題）。 |
| `enc`（コンテンツ暗号化） | `A128GCM`、`A256GCM` | `A*CBC-HS*`（AES-CBC と HMAC — CBC-with-MAC 由来の歴史的落とし穴と、GCM より広い攻撃面）。 |

拒否しているアルゴリズムにはいずれも、文書化された攻撃クラスがあり、OAuth / OIDC エコシステムはすでに退役させた（`RSA1_5`）か、プロファイルとして採用しませんでした（OAuth bearer の CBC-with-MAC）。組み込み側は `op.WithSupportedEncryptionAlgs(algs, encs []string)` でデプロイごとに広告集合をさらに絞り込めますが、本ライブラリの許可リストを超えて広げることはできません。

## 次に読む

- [ID トークン、アクセストークン、userinfo](/ja/concepts/tokens) — 各トークンの内容と JWS 検証経路の違い。
- [運用: 鍵ローテーション](/ja/operations/key-rotation) — JWKS のライフサイクル、kid の retirement、RP キャッシュの収束。
- [ユースケース: JWE 暗号化](/ja/use-cases/jwe-encryption) — encryption keyset の設定と alg / enc リストの絞り込み。
