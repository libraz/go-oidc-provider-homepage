---
title: JWKS エンドポイント
description: /jwks がアドバタイズする内容、emit するキャッシュヘッダ、ローテーション時の RP キャッシュ挙動。
outline: 2
---

# JWKS エンドポイント

`/jwks` は OP の署名鍵の公開側を公開します。RP はこれを取得して、ID token、JWT access token、JARM、userinfo JWT を検証します。本ページは OP と RP キャッシュの間の運用契約です。

## 何を返すか

```http
GET /jwks
Accept: application/jwk-set+json
```

レスポンス:

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "x": "...",
      "y": "...",
      "kid": "sig-2026-05",
      "alg": "ES256",
      "use": "sig"
    }
  ]
}
```

各エントリは `alg: "ES256"`、`use: "sig"`、`kty: "EC"`、`crv: "P-256"` です。OP が署名するのは ES256 のみで、暗号化鍵 (`enc`)や他の alg はアドバタイズされません。

::: info Keyset が ES256 のみである理由
JOSE の許可リスト(`RS256`、`PS256`、`ES256`、`EdDSA`)は OP が **検証**するときの集合です(RP の `private_key_jwt` 署名や JAR request object 署名で意味があります)。OP が **署名**する側の鍵は v1.0 では ES256 のみです。[必須オプション § WithKeyset](/ja/getting-started/required-options#withkeyset) を参照。
:::

## HTTP ヘッダ

| Header | 値 | 補足 |
|---|---|---|
| `Content-Type` | `application/jwk-set+json` | RFC 7517 |
| `Cache-Control` | `public, max-age=86400, stale-while-revalidate=3600` | 24 時間キャッシュ、1 時間 SWR |
| `ETag` | `"<sha256-hex>"` | シリアライズ後のボディ全体に対する strong validator |
| `Allow` | `GET, HEAD` | 他のメソッドは 405 |

`HEAD` はボディなしでヘッダ(`ETag`、`Cache-Control` を含む)を返します。well-behaved な RP キャッシュが revalidate に使う形です。

### `If-None-Match`

ハンドラは `If-None-Match` を尊重します:

- ETag が完全一致 → `304 Not Modified`、ボディなし。
- `*` ワイルドカード → `304 Not Modified`。
- weak validator(`W/"..."`) → 不一致扱い。

ETag は **シリアライズ後の JWKS 全体** に対するハッシュなので、`kid` の変更や鍵集合のメンバーシップ変更が起きると自動で値が変わります。手動でキャッシュを bust するための手順は不要です。

## ローテーション中のキャッシュ制御

ローテーションのオーバーラップ期間中は、短いキャッシュを出せます:

```
Cache-Control: public, max-age=300, must-revalidate
```

`op.WithJWKSRotationActive(predicate)` で Provider に述語を渡します。述語はリクエストのホットパスで評価されるので、軽量で並行安全にしてください。オプションを省略するか nil を渡すと、すべてのレスポンスで長いキャッシュが返ります。

典型的な pattern:

```go
var rotationUntil atomic.Value // time.Time
rotationUntil.Store(time.Time{})

// ローテーション開始時:
rotationUntil.Store(time.Now().Add(24 * time.Hour))

isRotating := func() bool {
    until, _ := rotationUntil.Load().(time.Time)
    return time.Now().Before(until)
}

provider, _ := op.New(
    /* 必須オプション */
    op.WithJWKSRotationActive(isRotating),
)
```

期間が過ぎると述語が false を返し、長いキャッシュに戻ります。`op.WithJWKSRotationActive` を複数回呼ぶと最後の呼び出しが勝つので、supervisor が以前の option リストを組み立て直さずに述語を差し替えられます。

## RP のキャッシュ挙動

well-behaved な RP は次のように動きます:

1. 起動時(または初回検証時)に `/jwks` を 1 回取得します。
2. `Cache-Control` に従ってキャッシュします。`max-age` を超えたら `If-None-Match` で revalidate します。
3. JWS 検証時に未知の `kid` を見たら、キャッシュをバイパスして `/jwks` を再取得します(これがローテーション時に期待される経路です。新しい `kid` が届いて検証がリトライ → 成功)。
4. `kid` が一致しないときに、キャッシュ済みの鍵にフォールバック **しない**でください。フォールバックはローテーションの監査を破壊します。

OP 自身の内部検証パスも同じルールに従います。「未知の kid なら現行鍵を信頼する」のような特例は存在しません。

## JWKS に複数の鍵を出す

設定された `op.Keyset` のすべてのエントリがアドバタイズされます:

```go
op.WithKeyset(op.Keyset{
    {KeyID: "sig-2026-05", Signer: newPriv}, // 現行 — 署名はこの鍵
    {KeyID: "sig-2026-02", Signer: prevPriv}, // 退役 — 検証専用
})
```

両方の `kid` が `/jwks` に並びます。OP は先頭エントリで新しいトークンを署名し、それ以降のエントリは、ローテーション前に発行されたトークンを RP が検証できるよう JWKS に残ります。サイクルは [鍵ローテーション](/ja/operations/key-rotation) を参照してください。

## HSM / KMS 連携

`op.SigningKey.Signer` の型は `crypto.Signer` です。`Sign(rand io.Reader, digest []byte, opts crypto.SignerOpts) ([]byte, error)` を満たす実装なら何でも入ります。よくあるパターン:

- AWS KMS: `kms.NewFromConfig(cfg)` + KMS 鍵に対する `Sign` を呼ぶ `crypto.Signer` アダプタ。
- Azure Key Vault: `azkeys.Client` + アダプタ。
- HashiCorp Vault Transit: HTTP signer アダプタ。
- Google Cloud KMS: `kms.NewKeyManagementClient` + アダプタ。
- PKCS#11 / ハードウェア HSM: `crypto11.Context` がそのまま `crypto.Signer` を返します。

OP が要求するのは:

- signer の公開鍵が `*ecdsa.PublicKey` で、`elliptic.P256()` 上にあること。
- `Sign` が並行安全であること(上のアダプタはすべてこれを満たします)。

KMS をバックエンドにした signer は、トークン発行のレイテンシを増やします(典型的には 1 署名あたり 10 〜 50 ms)。容量見積もりに織り込んでください。

## Discovery 上の `jwks_uri`

discovery document は、設定された JWKS パスを、issuer に `WithMountPrefix` を加えた配下の絶対 URL として `jwks_uri` に出します。RP は discovery を 1 回取って `jwks_uri` を辿るので、OP 側でパスをハードコードする必要はありません。

ルーターと衝突するなら `WithEndpoints(op.EndpointPaths{JWKS: "/keys"})` でパスを上書きできます。discovery document も追従します。

## 契約の検証

```sh
# ヘッダ — Cache-Control と ETag を確認。
curl -I https://op.example.com/jwks

# ボディ — 現行 + 退役の各 kid に 1 エントリずつ並ぶか。
curl -s https://op.example.com/jwks | jq '.keys[] | {kid, alg, use}'

# Revalidate — 一致する ETag で 304。
ETAG=$(curl -sI https://op.example.com/jwks | awk '/[Ee][Tt]ag/ {print $2}' | tr -d '\r')
curl -I -H "If-None-Match: $ETAG" https://op.example.com/jwks
# → HTTP/1.1 304 Not Modified
```

キャッシュが温まった RP の通常レスポンスは 304 です。
