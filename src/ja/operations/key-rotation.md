---
title: 鍵ローテーション
description: 署名鍵、inbound 暗号化鍵、cookie 鍵を、有効なセッションを切らずにローテーションする方法。
outline: 2
pageClass: pg-operations-key-rotation
---

# 鍵ローテーション

ローテーションする鍵の役割は 3 種類で、サイクルもそれぞれ違います:

- **署名鍵**（`op.Keyset`） — ID トークン、JWT アクセストークン、JARM、userinfo JWT を署名する ECDSA P-256 秘密鍵。公開側は `/jwks` に載ります。
- **Cookie 鍵**（`op.WithCookieKeys`） — session / CSRF cookie を封緘する 32 byte の AES-256-GCM 鍵。
- **inbound 暗号化鍵**（`op.EncryptionKeyset`） — クライアントが暗号化した request object を復号する秘密鍵。公開側は `use=enc` 鍵として `/jwks` に載り、outbound 暗号化鍵ではありません。

いずれも、新しい `*Provider` を構築してハンドラをアトミックに差し替える形でローテーションします。鍵スライスをその場で書き換える API はありません。

<figure class="fig">
  <div class="fig-head">切り替え日を設けずに鍵をローテーションする</div>
  <svg class="fig-svg" role="img" aria-labelledby="key-rotation-title" viewBox="0 0 960 236" xmlns="http://www.w3.org/2000/svg">
    <title id="key-rotation-title">署名鍵または cookie 鍵のローテーション手順。新しい鍵を生成し、新鍵を先頭に旧鍵も残した設定で Provider を構築し、ハンドラを不可分に差し替えます。旧鍵を外すのは、配布済みのキャッシュがすべて期限切れになってからです。</title>
    <rect class="fg-box" x="36" y="60" width="168" height="80" rx="8"/>
    <text class="fg-t2" x="54" y="88">生成する</text>
    <text class="fg-xs" x="54" y="110">新しい kid を持つ</text>
    <text class="fg-xs" x="54" y="128">鍵を作る</text>
    <path class="fg-edge" d="M208,100 H244" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="248" y="60" width="196" height="80" rx="8"/>
    <text class="fg-t2 fg-accent" x="266" y="88">先頭に置く</text>
    <text class="fg-mxs" x="266" y="110">[新鍵, 旧鍵]</text>
    <text class="fg-xs" x="266" y="128">先頭が署名し、残りは検証に使う</text>
    <path class="fg-edge" d="M448,100 H484" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="488" y="60" width="180" height="80" rx="8"/>
    <text class="fg-m" x="506" y="88">op.New</text>
    <text class="fg-xs" x="506" y="110">構成全体を</text>
    <text class="fg-xs" x="506" y="128">もう一度検証する</text>
    <path class="fg-edge" d="M672,100 H708" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="712" y="60" width="212" height="80" rx="8"/>
    <text class="fg-t2" x="730" y="88">ハンドラを差し替える</text>
    <text class="fg-xs" x="730" y="110">不可分に切り替わるため、</text>
    <text class="fg-xs" x="730" y="128">中途半端な状態は誰も見ない</text>
    <path class="fg-leader" d="M818,144 V178 H444"/>
    <path class="fg-edge fg-edge--muted" d="M444,178 H244" marker-end="url(#fg-am)"/>
    <text class="fg-xs fg-warn" x="470" y="172">トークンの TTL と、各 RP の JWKS キャッシュ期間が過ぎるのを待つ</text>
    <rect class="fg-box fg-box--muted" x="36" y="156" width="204" height="46" rx="8"/>
    <text class="fg-t2" x="54" y="176">その後で旧鍵を外す</text>
    <text class="fg-xs" x="54" y="194">それより早く外さない</text>
  </svg>
  <figcaption class="fig-note">旧鍵は重複期間のあいだ公開したままにし、署名だけをやめます。この手順で唯一壊れるのは、旧鍵を早く外した場合です。古い鍵集合を保持したままの検証側は、既に受け取ったトークンを検証する手段を失います。</figcaption>
</figure>

## 署名鍵のローテーション

### サイクル

- **定期:** 60 〜 90 日に一度。
- **侵害時:** 即時。退役した鍵は、発行済みのトークンがすべて期限切れになる（アクセストークン TTL に等しい時間が経つ）まで JWKS に残してから外します。

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

`Keyset` の先頭が常に現行の signer です。それ以降の live なエントリは検証用として JWKS にアドバタイズされるだけです。RP の JWKS キャッシュは次回 revalidate 時に新しい `kid` を拾います。キャッシュヘッダの挙動は [JWKS エンドポイント](/ja/operations/jwks) を参照してください。現行 signer の `NotAfter` は未設定または未来でなければならず、すでに `NotAfter` に達している場合は `op.New` が失敗します。過去の期限が許されるのは、現行ではない退役エントリだけです。

### 退役した鍵を外すタイミング

最低でも以下の時間は待ちます:

- 発行済みトークンの最長 TTL(既定の `WithAccessTokenTTL` は 5 分)。
- これに加えて、RP 側の最長 JWKS キャッシュウィンドウ（既定で `max-age=3600`、1 時間）。

つまり安全側の最低待機は **ローテーション後およそ 1 時間**（既定の 1 時間の JWKS キャッシュウィンドウにアクセストークン TTL を足した時間）です。アクセストークン TTL を長めに運用している場合は、その分を JWKS キャッシュウィンドウに上乗せしてください。ローテーション中に旧 set をキャッシュした RP が、検証可能なはずのトークンを弾かないようにするためです。

::: tip ローテーション中であることのシグナル
`op.WithJWKSRotationActive(predicate)` で Provider に述語を渡します。述語が true の間は、長い既定キャッシュ（`public, max-age=3600, stale-while-revalidate=3600`）の代わりに 5 分の `public, max-age=300, must-revalidate` を返します。オーバーラップ期間中にこの述語を true にしておくと、RP のキャッシュが短い間隔で revalidate しに来てくれます。[JWKS エンドポイント § ローテーション中のキャッシュ制御](/ja/operations/jwks#ローテーション中のキャッシュ制御) を参照。
:::

## inbound 暗号化鍵のローテーション

`op.EncryptionKeyset` は、`/authorize` と `/par` に届く暗号化 request object を復号する OP の inbound 専用 JWE 鍵集合です。outbound 応答のアクティブ鍵を供給するものではありません。outbound JWE 応答はクライアントの JWKS にある `use=enc` 鍵で暗号化します。

```go
encKeys := op.EncryptionKeyset{
    {KeyID: "enc-2026-09", PrivateKey: newEncPriv},
    {KeyID: "enc-2026-05", PrivateKey: oldEncPriv, NotAfter: oldEncExpiry},
}

newProv, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(myStore),
    op.WithKeyset(signingKeys),
    op.WithEncryptionKeyset(encKeys),
    op.WithCookieKeys(cookieKey),
    /* ...残りのオプション... */
)
```

entry は inbound 復号候補の順序で並び、`use=enc` として公開されます。`kid` 付き JWE は一致する live entry を選びます。kidless JWE は保護ヘッダの `alg` と同じファミリに属する live 鍵へ絞り込まれ、残った候補が `op.MaxKidlessEncryptionTrialKeys`（既定値 4）を超えると、切り詰めず復号を拒否します。設定したファミリが上限を超える場合は `op.New` が warning を出すため、RP には `kid` を含めさせてください。

新旧 entry は、RP の JWKS キャッシュ期間と受理する request object の最長寿命を通して公開します。`NotAfter` は厳格な cutoff であり、その時刻以降は OP がその鍵を拒否し、公開側も JWKS から外します。overlap が終わったら退役 entry を削除してください。outbound 応答には OP 側の鍵がないため、別途ローテーションするものはありません。

## Cookie 鍵のローテーション

### サイクル

- **定期:** 四半期ごと（リスクは低めです。`__Host-` でスコープが締まり、寿命は session TTL の中に収まります）。
- **侵害時:** 即時。

### 手順

```go
// 新しい 32 byte の鍵を生成する。
newKey := make([]byte, 32)
if _, err := rand.Read(newKey); err != nil { /* abort */ }

// 先頭の鍵で暗号化、それ以降は復号試行に使われる。
op.WithCookieKeys(newKey, oldKey)
```

`WithCookieKeys` は復号用に旧鍵を残せるので、有効なセッションはユーザの再認証または session TTL 満了までそのまま継続します。発行済みセッションがすべて期限切れになった（または強制ログアウトを fan-out した）あとで、`oldKey` をスライスから外してください。

::: warning 順序が重要
`WithCookieKeys` の先頭が現行の暗号化鍵です。旧鍵を先頭にしてしまうと、**気付かれないうちに侵害済み鍵を現行扱いに格下げ**してしまいます。型ではなく規約での強制なので、ローテーション時はレビューを慎重にしてください。
:::

## MFA 暗号化鍵のローテーション

`WithMFAEncryptionKeys` も cookie 鍵と同じ「先頭が現行、以降が過去」の形に従います。32 byte 鍵で TOTP のシークレットを保存時暗号化（AES-256-GCM、subject 識別子を AAD にバインド）します。

```go
op.WithMFAEncryptionKeys(currentKey, previousKey)
```

`previousKey` を退役させるのは、永続化済みのすべての TOTP レコードが `currentKey` で再暗号化されてからです。これはストア側のマイグレーション課題で、ライブラリが自動再暗号化することはありません。

## ローテーション**しない**もの

- **Issuer。** `WithIssuer` を変えると、発行済みのすべてのトークン（`iss` は JWT の一部です）と、すべての RP の discovery キャッシュが無効になります。ローテーションではなくデプロイ扱いです。
- **`Keyset` 内の `KeyID`。** いったん JWKS に出した `kid` は、RP のキャッシュキーになる公開識別子です。外した `kid` を再利用すると、古い公開鍵をキャッシュしている RP で検証ギャップが発生します。ローテーションのたびに新しい `kid` を生成してください。

## 検証チェックリスト

ローテーション後:

1. `curl https://op.example.com/jwks` で、新しい `kid` が出ていて退役した `kid` がまだ並んでいるか（撤去工程を完了するまでは並んでいるべき）を確認します。
2. 新しいトークンの `kid` ヘッダが新鍵を指しているか確認します: `echo "<jwt>" | cut -d. -f1 | base64 -d | jq .kid`。
3. 切り替え（cut-over）後に `key.retired_kid_presented` 監査イベントが新たに発火していないことを確認します（退役済みの `kid` を持つ JWS / JWE が届いた場合だけ発火するイベントなので、沈黙が成功シグナルです）。
4. ローテーション前に発行されたブラウザセッションが、`/userinfo` をきちんと通ること（cookie 鍵側の復号が壊れていないこと）を確認します。

## なぜその場で書き換えず、新しい `Provider` を作るのか

ローテーションは OP のセキュリティ性質を根本から変える操作です。`op.New(...)` を改めて呼ばせる形にしておくことで:

- すべてのオプション衝突チェックが再走します（typo を載せたまま動かすことができません）。
- 検証パスがアトミックに差し替わります（中途半端なローテーション状態が発生しません）。
- 監督プロセス側のログ / 監査記録に明示的なイベントが残ります（プロセス内部で暗黙に状態変更が走るのとは違います）。

監督プロセス側の pattern は十分小さく、安全性のメリットに見合う冗長さだと判断しています。
