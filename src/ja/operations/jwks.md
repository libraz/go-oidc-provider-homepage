---
title: JWKS エンドポイント
description: /jwks が告知する内容、返すキャッシュヘッダ、ローテーション時の RP キャッシュ挙動。
outline: 2
pageClass: pg-operations-jwks
---

# JWKS エンドポイント

`/jwks` は、OP の署名鍵の公開鍵を JWKS（JSON Web Key Set、RFC 7517）として公開するエンドポイントです。JWKS は公開鍵を `kid` ごとに並べた JSON 文書で、RP はこれを取得して、ID トークン、JWT アクセストークン、JARM、userinfo JWT を検証します。本ページは OP と RP キャッシュの間の運用契約です。

<figure class="fig">
  <div class="fig-head">ローテーションした鍵は、RP の再取得で届く</div>
  <svg class="fig-svg" role="img" aria-labelledby="jwks-fetch-title" viewBox="0 0 960 808" xmlns="http://www.w3.org/2000/svg">
    <title id="jwks-fetch-title">RP は discovery ドキュメントから jwks_uri を読み取り、鍵集合を一度取得してキャッシュします。キャッシュが知らない kid を持つトークンが届くと一度だけ再取得して検証します。ローテーションした鍵が、足並みを揃えたデプロイなしに各検証側へ届く仕組みです。</title>
    <!-- phases -->
    <rect class="fg-group" x="32" y="104" width="896" height="320" rx="8"/>
    <rect class="fg-group" x="32" y="440" width="896" height="344" rx="8"/>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="784"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="784"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">トークンを検証する</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- first use -->
    <text class="fg-lbl fg-halo" x="56" y="132">初回の取得</text>
    <!-- 1 -->
    <path class="fg-edge" d="M192,172 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="138" text-anchor="middle">GET /.well-known/…</text>
    <text class="fg-mxs" x="352" y="160" text-anchor="middle">jwks_uri を読む</text>
    <!-- 2 -->
    <path class="fg-edge" d="M192,244 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="210" text-anchor="middle">GET /jwks</text>
    <text class="fg-mxs" x="352" y="232" text-anchor="middle">キャッシュなし</text>
    <!-- 3 -->
    <path class="fg-edge fg-edge--accent" d="M512,316 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="282" text-anchor="middle">200 · JWK set</text>
    <text class="fg-mxs" x="352" y="304" text-anchor="middle">ETag 付き</text>
    <!-- 4 -->
    <path class="fg-edge" d="M192,364 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="370">kid で引けるよう保存</text>
    <text class="fg-xs" x="248" y="392">以後はネットワーク不要</text>
    <!-- unknown kid -->
    <text class="fg-lbl fg-halo" x="56" y="468">キャッシュに無い鍵が届いたとき</text>
    <!-- 5 -->
    <path class="fg-edge" d="M192,504 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="510">kid がキャッシュに無い</text>
    <text class="fg-xs" x="248" y="532">一度だけ再取得し、拒否しない</text>
    <!-- 6 -->
    <path class="fg-edge" d="M192,608 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="574" text-anchor="middle">GET /jwks</text>
    <text class="fg-mxs" x="352" y="596" text-anchor="middle">条件付き取得 (ETag)</text>
    <!-- 7 -->
    <path class="fg-edge fg-edge--accent" d="M512,680 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="646" text-anchor="middle">200 · JWK set</text>
    <text class="fg-mxs" x="352" y="668" text-anchor="middle">変更なしなら 304</text>
    <!-- 8 -->
    <path class="fg-edge" d="M192,728 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="734">トークンを検証する</text>
    <text class="fg-xs" x="248" y="756">取得した鍵で検証</text>
  </svg>
  <figcaption class="fig-note">未知の kid での再取得があるおかげで、足並みを揃えなくてもローテーションが成立します。新しい鍵を知らない RP は、その鍵に初めて出会ったときに知ります。ただし kid 不一致で即座に拒否せず、再取得する実装であることが前提です。</figcaption>
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

`HEAD` はボディなしで同じヘッダ（`ETag`、`Cache-Control` を含む）を返します。RP のキャッシュは通常、HEAD ではなく次の条件付き `GET` で再検証します。

### `If-None-Match`

ハンドラは `If-None-Match` を尊重します:

- ETag が完全一致 → `304 Not Modified`、ボディなし。304 にも `ETag` と `Cache-Control` は付きます。
- `*` ワイルドカード → `304 Not Modified`。
- 同じ opaque-tag の weak validator（`W/"..."`） → weak comparison により一致扱い。
- カンマ区切りの一覧 → いずれか 1 つが一致すれば一致扱い。

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
3. JWS 検証時に未知の `kid` を見たら、キャッシュをバイパスして `/jwks` を再取得します。これがローテーション時に期待される経路です。新しい `kid` が届き、検証をやり直して成功します。
4. `kid` が一致しないときに、キャッシュ済みの鍵にフォールバック **しない**でください。フォールバックはローテーションの監査を壊します。

OP 自身も、`/userinfo` と `/introspect` で自分が発行した JWT アクセストークンを検証するときに同じ規則を使います。設定済みの keyset から `kid` を探し、未知の `kid` や `NotAfter` を過ぎた `kid` は拒否します。「未知の kid なら現行鍵を信頼する」という特例はありません。

## JWKS に複数の鍵を出す

設定された `op.Keyset` のすべてのエントリが告知されます:

```go
op.WithKeyset(op.Keyset{
    {KeyID: "sig-2026-05", Signer: newPriv}, // 現行 — 署名はこの鍵
    {KeyID: "sig-2026-02", Signer: prevPriv}, // 退役 — 検証専用
})
```

両方の `kid` が `/jwks` に並びます。OP は先頭エントリで新しいトークンを署名し、それ以降のエントリは、ローテーション前に発行されたトークンを RP が検証できるよう JWKS に残ります。サイクルは [鍵ローテーション](/ja/operations/key-rotation) を参照してください。

エントリは、`Keyset` から外して作り直すまで `/jwks` に残ります。退役側のエントリに `SigningKey.NotAfter` を設定すると、期限になった時点から OP 自身がその `kid` を信頼しなくなり、その `kid` が提示されると `key.retired_kid_presented` も記録します。ただし公開鍵は公開されたままなので、RP のキャッシュは自然に入れ替わります。暗号化鍵は扱いが違い、`NotAfter` を過ぎた `EncryptionKey` は `/jwks` からも取り除かれます。

## HSM / KMS 連携

`op.SigningKey.Signer` の型は `crypto.Signer` です。`Sign(rand io.Reader, digest []byte, opts crypto.SignerOpts) ([]byte, error)` を満たす実装なら何でも入ります。よくあるパターン:

- AWS KMS: `kms.NewFromConfig(cfg)` + KMS 鍵に対する `Sign` を呼ぶ `crypto.Signer` アダプタ。
- Azure Key Vault: `azkeys.Client` + アダプタ。
- HashiCorp Vault Transit: HTTP signer アダプタ。
- Google Cloud KMS: `kms.NewKeyManagementClient` + アダプタ。
- PKCS#11 / ハードウェア HSM: `crypto11.Context` がそのまま `crypto.Signer` を返します。

OP が要求するのは:

- signer の公開鍵が `*ecdsa.PublicKey` で、`elliptic.P256()` 上にあること。それ以外の鍵だと `op.New` が失敗します。
- `Sign` が並行安全であること。薄いアダプタを書くときは、クライアントが並行安全でなければアダプタ側で保証してください。

KMS をバックエンドにした署名器は、トークン発行の待ち時間を増やします（典型的には 1 署名あたり 10 〜 50 ms）。容量見積もりに織り込んでください。

## Discovery 上の `jwks_uri`

discovery 文書は、設定された JWKS パスを、issuer に mount prefix（既定は `/oidc`）を加えた配下の絶対 URL として `jwks_uri` に出します。RP は discovery を 1 回取って `jwks_uri` を辿るので、OP 側でパスをハードコードする必要はありません。

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
