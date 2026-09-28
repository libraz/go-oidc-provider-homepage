---
title: JWKS エンドポイント
description: /jwks が告知する内容、返すキャッシュヘッダ、ローテーション時の RP キャッシュ挙動。
outline: 2
pageClass: pg-operations-jwks
---

# JWKS エンドポイント

`/jwks` は OP の署名鍵の公開側を公開します。RP はこれを取得して、ID トークン、JWT アクセストークン、JARM、userinfo JWT を検証します。本ページは OP と RP キャッシュの間の運用契約です。

<figure class="fig">
  <div class="fig-head">RP が正しい鍵に辿り着くまで</div>
  <svg class="fig-svg" role="img" aria-labelledby="jwks-fetch-title" viewBox="0 0 960 268" xmlns="http://www.w3.org/2000/svg">
    <title id="jwks-fetch-title">RP は discovery ドキュメントから jwks_uri を読み取り、鍵集合を一度取得してキャッシュします。キャッシュが知らない kid を持つトークンが届くと再取得します。ローテーションした鍵が、足並みを揃えたデプロイなしに各検証側へ届く仕組みです。</title>
    <rect class="fg-box" x="36" y="94" width="180" height="80" rx="8"/>
    <text class="fg-t" x="54" y="124">RP</text>
    <text class="fg-xs" x="54" y="146">提示されたトークンを</text>
    <text class="fg-xs" x="54" y="162">検証する</text>
    <path class="fg-edge" d="M220,116 H302" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="261" y="109" text-anchor="middle">1 · 設定を読む</text>
    <rect class="fg-box fg-box--accent" x="306" y="34" width="230" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="324" y="60">/.well-known/…</text>
    <text class="fg-xs" x="324" y="80">discovery ドキュメント</text>
    <text class="fg-mxs" x="324" y="96">jwks_uri を告知する</text>
    <path class="fg-edge fg-edge--accent" d="M421,110 V142" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="437" y="132">2 · 鍵を取得</text>
    <rect class="fg-box fg-box--accent" x="306" y="146" width="230" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="324" y="172">/jwks</text>
    <text class="fg-xs" x="324" y="192">ETag 付きの JWK 集合</text>
    <text class="fg-xs" x="324" y="208">再取得はたいてい 304 で済む</text>
    <path class="fg-edge" d="M540,182 H616" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="578" y="175" text-anchor="middle">3 · キャッシュ</text>
    <rect class="fg-box" x="620" y="146" width="304" height="72" rx="8"/>
    <text class="fg-t2" x="638" y="172">RP のキャッシュ</text>
    <text class="fg-xs" x="638" y="192">トークンの kid で鍵を選ぶ</text>
    <text class="fg-xs" x="638" y="208">通常経路ではネットワーク呼び出しなし</text>
    <path class="fg-edge fg-edge--muted" d="M772,142 V102" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="788" y="126">4 · 未知の kid</text>
    <rect class="fg-box fg-box--warn" x="620" y="52" width="304" height="50" rx="8"/>
    <text class="fg-t2" x="638" y="74">キャッシュに無い kid</text>
    <text class="fg-xs" x="638" y="92">/jwks を一度だけ再取得して検証する — 手順 5</text>
    <path class="fg-edge fg-edge--muted" d="M616,77 H556 V152" marker-end="url(#fg-am)"/>
  </svg>
  <figcaption class="fig-note">手順 4 があるおかげで、足並みを揃えなくてもローテーションが成立します。新しい鍵を知らない RP は、その鍵に初めて出会ったときに知ります。ただし kid 不一致で即座に拒否せず、再取得する実装であることが前提です。</figcaption>
</figure>

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

署名鍵のエントリはすべて `alg: "ES256"`、`use: "sig"`、`kty: "EC"`、`crv: "P-256"` です。OP が署名するのは ES256 のみです。`WithEncryptionKeyset` を設定している場合、OP は暗号化鍵の公開鍵（`use: "enc"`）を署名鍵のあとに追加で告知します。両者が別々にローテーションする仕組みは [鍵ローテーション](/ja/operations/key-rotation) を参照してください。

::: info Keyset が ES256 のみである理由
JOSE の許可リスト（`RS256`、`PS256`、`ES256`、`EdDSA`）は OP が **検証**するときの集合です（RP の `private_key_jwt` 署名や JAR request object 署名で意味があります）。OP が **署名**する側の鍵は ES256 のみです。[必須オプション § WithKeyset](/ja/getting-started/required-options#withkeyset) を参照。
:::

## HTTP ヘッダ

| Header | 値 | 補足 |
|---|---|---|
| `Content-Type` | `application/jwk-set+json` | RFC 7517 |
| `Cache-Control` | `public, max-age=3600, stale-while-revalidate=3600` | 1 時間キャッシュ、1 時間 SWR |
| `ETag` | `"<sha256-hex>"` | シリアライズ後のボディ全体に対する strong validator |
| `Allow` | `GET, HEAD` | 他のメソッドは 405 |

`HEAD` はボディなしでヘッダ（`ETag`、`Cache-Control` を含む）を返します。適切に実装された RP キャッシュが再検証に使う形です。

### `If-None-Match`

ハンドラは `If-None-Match` を尊重します:

- ETag が完全一致 → `304 Not Modified`、ボディなし。
- `*` ワイルドカード → `304 Not Modified`。
- 同じ opaque-tag の weak validator（`W/"..."`） → weak comparison により一致扱い。

ETag は **シリアライズ後の JWKS 全体** に対するハッシュなので、`kid` の変更や鍵集合のメンバー変更が起きると自動で値が変わります。手動でキャッシュを破棄させる手順は不要です。

## ローテーション中のキャッシュ制御

ローテーションのオーバーラップ期間中は、短いキャッシュを出せます:

```
Cache-Control: public, max-age=300, must-revalidate
```

`op.WithJWKSRotationActive(predicate)` で Provider に述語を渡します。述語はリクエストのホットパスで評価されるので、軽量で並行安全にしてください。オプションを省略するか nil を渡すと、すべてのレスポンスで長いキャッシュが返ります。

典型的なパターン:

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

期間が過ぎると述語が false を返し、長いキャッシュに戻ります。`op.WithJWKSRotationActive` を複数回呼ぶと最後の呼び出しが勝つので、管理プロセスが以前のオプションリストを組み立て直さずに述語を差し替えられます。

## RP のキャッシュ挙動

適切に実装された RP は次のように動きます:

1. 起動時（または初回検証時）に `/jwks` を 1 回取得します。
2. `Cache-Control` に従ってキャッシュします。`max-age` を超えたら `If-None-Match` で再検証します。
3. JWS 検証時に未知の `kid` を見たら、キャッシュをバイパスして `/jwks` を再取得します（これがローテーション時に期待される経路です。新しい `kid` が届いて検証がリトライ → 成功）。
4. `kid` が一致しないときに、キャッシュ済みの鍵にフォールバック **しない**でください。フォールバックはローテーションの監査を破壊します。

OP 自身の内部検証パスも同じルールに従います。「未知の kid なら現行鍵を信頼する」のような特例は存在しません。

## JWKS に複数の鍵を出す

設定された `op.Keyset` のすべてのエントリが告知されます:

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
- `Sign` が並行安全であること（上のアダプタはすべてこれを満たします）。

KMS をバックエンドにした署名器は、トークン発行の待ち時間を増やします（典型的には 1 署名あたり 10 〜 50 ms）。容量見積もりに織り込んでください。

## Discovery 上の `jwks_uri`

discovery 文書は、設定された JWKS パスを、issuer に `WithMountPrefix` を加えた配下の絶対 URL として `jwks_uri` に出します。RP は discovery を 1 回取って `jwks_uri` を辿るので、OP 側でパスをハードコードする必要はありません。

ルータと衝突するなら `WithEndpoints(op.Endpoints{JWKS: "/keys"})` でパスを上書きできます。discovery 文書も追従します。

## 契約の検証

```sh
# ヘッダ — Cache-Control と ETag を確認。
curl -I https://op.example.com/jwks

# ボディ — 現行 + 退役の各 kid に 1 エントリずつ並ぶか。
curl -s https://op.example.com/jwks | jq '.keys[] | {kid, alg, use}'

# 再検証 — 一致する ETag で 304。
ETAG=$(curl -sI https://op.example.com/jwks | awk '/[Ee][Tt]ag/ {print $2}' | tr -d '\r')
curl -I -H "If-None-Match: $ETAG" https://op.example.com/jwks
# → HTTP/1.1 304 Not Modified
```

キャッシュが温まった RP の通常レスポンスは 304 です。
