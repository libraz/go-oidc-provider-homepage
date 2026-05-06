---
title: 鍵ローテーション
description: 署名鍵と cookie 鍵を、有効なセッションを切らずにローテーションする方法。
outline: 2
---

# 鍵ローテーション

ローテーションする鍵は 2 種類で、サイクルもそれぞれ違います:

- **署名鍵**(`op.Keyset`) — ID トークン、JWT アクセストークン、JARM、userinfo JWT を署名する ECDSA P-256 秘密鍵。公開側は `/jwks` に載ります。
- **Cookie 鍵**(`op.WithCookieKeys`) — session / CSRF cookie を封緘する 32 byte の AES-256-GCM 鍵。

どちらも、新しい `*Provider` を構築してハンドラをアトミックに差し替える形でローテーションします。スライスをその場で書き換える API はありません。

## 署名鍵のローテーション

### サイクル

- **定期:** 60 〜 90 日に一度。
- **侵害時:** 即時。退役した鍵は、発行済みのトークンがすべて期限切れになる(アクセストークン TTL に等しい時間が経つ)まで JWKS に残してから外します。

### 手順

```go
// Step 1. 新しい鍵を生成する。
newPriv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)

// Step 2. 新鍵を先頭(active な signer)にした Keyset を組む。
//         旧鍵は検証用に残しておく。
ks := op.Keyset{
    {KeyID: "sig-2026-05", Signer: newPriv},  // 現行 signer
    {KeyID: "sig-2026-02", Signer: prevPriv}, // 退役。直近のトークンを検証するため残す
}

// Step 3. 新しい Provider を構築してアトミックに差し替える。
newProv, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(myStore),
    op.WithKeyset(ks),
    op.WithCookieKeys(cookieKey),
    /* ...残りのオプション... */
)
if err != nil { /* 旧 provider を残してアラート */ }

// Step 4. 公開ハンドラをアトミックに差し替える。
liveHandler.Store(newProv)  // 通常は *atomic.Value または sync.Map
```

`Keyset` の先頭が常に現行の signer です。それ以降のエントリは検証用として JWKS にアドバタイズされるだけです。RP の JWKS キャッシュは次回 revalidate 時に新しい `kid` を拾います。キャッシュヘッダの挙動は [JWKS エンドポイント](/ja/operations/jwks) を参照してください。

### 退役した鍵を外すタイミング

最低でも以下の時間は待ちます:

- 発行済みトークンの最長 TTL(既定の `WithAccessTokenTTL` は 5 分)。
- これに加えて、RP 側の最長 JWKS キャッシュウィンドウ(既定で `max-age=86400`、24 時間)。

つまり安全側の最低待機は **ローテーション後 24 時間** です。アクセストークン TTL を短く運用していても、ローテーション中に旧 set をキャッシュした RP が、検証可能なはずのトークンを弾かないよう、JWKS キャッシュウィンドウ分は待ってください。

::: tip ローテーション中であることのシグナル
`op.WithJWKSRotationActive(predicate)` で Provider に述語を渡します。述語が true の間は、長い既定キャッシュ(`public, max-age=86400, stale-while-revalidate=3600`) の代わりに 5 分の `public, max-age=300, must-revalidate` を返します。オーバーラップ期間中にこの述語を true にしておくと、RP のキャッシュが短い間隔で revalidate しに来てくれます。[JWKS エンドポイント § ローテーション中のキャッシュ制御](/ja/operations/jwks#ローテーション中のキャッシュ制御) を参照。
:::

## Cookie 鍵のローテーション

### サイクル

- **定期:** 四半期ごと(リスクは低めです。`__Host-` でスコープが締まり、寿命は session TTL の中に収まります)。
- **侵害時:** 即時。

### 手順

```go
// 新しい 32 byte の鍵を生成する。
newKey := make([]byte, 32)
if _, err := rand.Read(newKey); err != nil { /* abort */ }

// 先頭の鍵で暗号化、それ以降は復号試行に使われる。
op.WithCookieKeys(newKey, oldKey)
```

`WithCookieKeys` は復号用に旧鍵を残せるので、有効なセッションはユーザの再認証または session TTL 満了までそのまま継続します。発行済みセッションがすべて期限切れになった(または強制ログアウトを fan-out した)あとで、`oldKey` をスライスから外してください。

::: warning 順序が重要
`WithCookieKeys` の先頭が現行の暗号化鍵です。旧鍵を先頭にしてしまうと、**気付かれないうちに侵害済み鍵を現行扱いに格下げ**してしまいます。型ではなく規約での強制なので、ローテーション時はレビューを慎重にしてください。
:::

## MFA 暗号化鍵のローテーション

`WithMFAEncryptionKeys` も cookie 鍵と同じ「先頭が現行、以降が過去」の形に従います。32 byte 鍵で TOTP のシークレットを保存時暗号化(AES-256-GCM、subject 識別子を AAD にバインド)します。

```go
op.WithMFAEncryptionKeys(currentKey, previousKey)
```

`previousKey` を退役させるのは、永続化済みのすべての TOTP レコードが `currentKey` で再暗号化されてからです。これはストア側のマイグレーション課題で、ライブラリが自動再暗号化することはありません。

## ローテーション**しない**もの

- **Issuer。** `WithIssuer` を変えると、発行済みのすべてのトークン (`iss` は JWT の一部です)と、すべての RP の discovery キャッシュが無効になります。ローテーションではなくデプロイ扱いです。
- **`Keyset` 内の `KeyID`。** いったん JWKS に出した `kid` は、RP のキャッシュキーになる公開識別子です。外した `kid` を再利用すると、古い公開鍵をキャッシュしている RP で検証ギャップが発生します。ローテーションのたびに新しい `kid` を生成してください。

## 検証チェックリスト

ローテーション後:

1. `curl https://op.example.com/jwks` で、新しい `kid` が出ていて退役した `kid` がまだ並んでいるか(撤去工程を完了するまでは並んでいるべき)を確認します。
2. 新しいトークンの `kid` ヘッダが新鍵を指しているか確認します: `echo "<jwt>" | cut -d. -f1 | base64 -d | jq .kid`。
3. 切り替え(cut-over)後に `key.retired_kid_presented` 監査イベントが新たに発火していないことを確認します(退役済みの `kid` を持つ JWS / JWE が届いた場合だけ発火するイベントなので、沈黙が成功シグナルです)。
4. ローテーション前に発行されたブラウザセッションが、`/userinfo` をきちんと通ること(cookie 鍵側の復号が壊れていないこと)を確認します。

## なぜその場で書き換えず、新しい `Provider` を作るのか

ローテーションは OP のセキュリティ性質を根本から変える操作です。`op.New(...)` を改めて呼ばせる形にしておくことで:

- すべてのオプション衝突チェックが再走します(typo を載せたまま動かすことができません)。
- 検証パスがアトミックに差し替わります(中途半端なローテーション状態が発生しません)。
- 監督プロセス側のログ / 監査記録に明示的なイベントが残ります(プロセス内部で暗黙に状態変更が走るのとは違います)。

監督プロセス側の pattern は十分小さく、安全性のメリットに見合う冗長さだと判断しています。
