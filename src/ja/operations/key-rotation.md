---
title: 鍵ローテーション
description: 署名鍵、inbound 暗号化鍵、cookie 鍵を、有効なセッションを切らずにローテーションする方法。
outline: 2
pageClass: pg-operations-key-rotation
---

# 鍵ローテーション

ローテーションする鍵の役割は 3 種類で、サイクルもそれぞれ違います:

- **署名鍵**（`op.Keyset`） — ID トークン、JWT アクセストークン、JARM、userinfo JWT を署名する ECDSA P-256 秘密鍵。公開側は `/jwks` に載ります。
- **Cookie 鍵**（`op.WithCookieKeys`） — session、interaction、CSRF の各 cookie を封緘する 32 byte の AES-256-GCM 鍵。
- **inbound 暗号化鍵**（`op.EncryptionKeyset`） — クライアントが暗号化した request object を復号する秘密鍵。公開側は `use=enc` 鍵として `/jwks` に載り、outbound 暗号化鍵ではありません。

いずれも、新しい `*Provider` を構築してハンドラをアトミックに差し替える形でローテーションします。鍵スライスをその場で書き換える API はありません。

<figure class="fig">
  <div class="fig-head">切り替え日を設けずに鍵をローテーションする</div>
  <svg class="fig-svg" role="img" aria-labelledby="key-rotation-title" viewBox="0 0 960 288" xmlns="http://www.w3.org/2000/svg">
    <title id="key-rotation-title">署名鍵または cookie 鍵のローテーション手順。新しい鍵を生成し、新鍵を先頭に旧鍵も残した設定で Provider を構築し、ハンドラを不可分に差し替えます。トークンの寿命と配布済みの鍵集合キャッシュが切れるのを待ってから、旧鍵を外します。</title>
    <!-- generate -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t" x="48" y="52">生成する</text>
    <text class="fg-s" x="48" y="76">新しい鍵を作る</text>
    <text class="fg-s" x="48" y="100">新しい kid を付ける</text>
    <!-- first -->
    <rect class="fg-box fg-box--accent" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="52">先頭に置く</text>
    <text class="fg-mxs" x="360" y="76">[新鍵, 旧鍵]</text>
    <text class="fg-s" x="360" y="100">先頭が署名、残りは検証用</text>
    <!-- new -->
    <rect class="fg-box" x="656" y="24" width="272" height="96" rx="8"/>
    <text class="fg-m" x="672" y="52">op.New</text>
    <text class="fg-s" x="672" y="76">構成全体を</text>
    <text class="fg-s" x="672" y="100">もう一度検証する</text>
    <path class="fg-edge" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M616,72 H656" marker-end="url(#fg-a)"/>
    <!-- wrap -->
    <path class="fg-leader" d="M792,120 V144 H168"/>
    <path class="fg-edge fg-edge--thin" d="M168,144 V168" marker-end="url(#fg-a)"/>
    <!-- swap -->
    <rect class="fg-box" x="32" y="168" width="272" height="96" rx="8"/>
    <text class="fg-t" x="48" y="196">ハンドラを差し替える</text>
    <text class="fg-s" x="48" y="220">不可分に切り替わるため、</text>
    <text class="fg-s" x="48" y="244">中途半端な状態は誰も見ない</text>
    <!-- wait -->
    <rect class="fg-box fg-box--warn" x="344" y="168" width="272" height="96" rx="8"/>
    <text class="fg-t" x="360" y="196">待つ</text>
    <text class="fg-s" x="360" y="220">トークンの TTL と</text>
    <text class="fg-s" x="360" y="244">各 RP の JWKS キャッシュ期間</text>
    <!-- drop -->
    <rect class="fg-box fg-box--muted" x="656" y="168" width="272" height="96" rx="8"/>
    <text class="fg-t" x="672" y="196">旧鍵を外す</text>
    <text class="fg-s" x="672" y="220">待機が終わるまで外さない</text>
    <text class="fg-s" x="672" y="244">それ以降なら安全</text>
    <path class="fg-edge" d="M304,216 H344" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--muted" d="M616,216 H656" marker-end="url(#fg-am)"/>
  </svg>
  <figcaption class="fig-note">定期ローテーションでは、旧鍵をオーバーラップ期間のあいだ公開したままにし、署名だけをやめます。旧鍵を早く外すと、この検証を壊すおそれがあります。古い鍵集合を保持したままの検証側は、すでに受け取ったトークンを検証する手段を失います。侵害された鍵はインシデント対応上の例外で、速やかに削除します。</figcaption>
</figure>

## 署名鍵のローテーション

### サイクル

- **定期:** 60〜90 日に一度。通常のオーバーラップ期間（下記のトークン寿命と RP の JWKS キャッシュ期間）を終えてから退役鍵を外します。
- **侵害時:** 直ちに交換し、侵害されたエントリを除いた `Keyset` を再構築して JWKS から速やかに削除します。侵害鍵を通常のオーバーラップ期間のために残さず、その鍵で署名されたトークンはインシデント対応と失効の手順に従って扱います。

### 手順

```go
// Step 1. 新しい鍵を生成する。
newPriv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)

// Step 2. 新鍵を先頭(active な signer)にした Keyset を組む。
//         旧鍵は検証用に残しておく。NotAfter は任意で、その時刻から
//         OP 自身がこの退役 kid を信頼しなくなる。
retireAfter := time.Now().Add(2*time.Hour + 5*time.Minute) // 「退役した鍵を外すタイミング」参照
ks := op.Keyset{
    {KeyID: "sig-2026-05", Signer: newPriv},                         // 現行 signer
    {KeyID: "sig-2026-02", Signer: prevPriv, NotAfter: retireAfter}, // 退役。直近のトークンを検証するため残す
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

`Keyset` の先頭が常に現行の signer で、それ以降は検証専用として JWKS に載ります。JWKS をキャッシュ済みの RP は、次の更新時か、知らない `kid` に出会った時点で、新しい `kid` を拾います。キャッシュヘッダの挙動は [JWKS エンドポイント](/ja/operations/jwks) を参照してください。

退役エントリの `NotAfter` は、OP 自身の検証を止める期限です。その時刻以降、OP は `/userinfo` と `/introspect` での自分の JWT アクセストークンを含め、その `kid` を名乗るトークンを拒否し、`key.retired_kid_presented` を記録します。公開鍵は、`Keyset` から外して作り直すまで `/jwks` に残ります。`retireAfter` には、下で計算する重なり期間の終わりを指定し、ローテーションした時刻そのものにはしないでください。現行エントリの `NotAfter` は未設定か未来でなければならず、すでに `NotAfter` に達している場合は `op.New` が失敗します。

### 退役した鍵を外すタイミング

新しい provider が応答を始めた時点から数えて、次の 2 つが両方とも終わるまで待ちます。

- 旧鍵が署名したすべてのものの最長の寿命。アクセストークン（既定の `WithAccessTokenTTL` は 5 分）と ID トークンです。
- RP 側の JWKS キャッシュの期間。`/jwks` は `max-age=3600, stale-while-revalidate=3600` で返すため、キャッシュが入れ替わるまでに最長で 2 時間かかります。

既定値では **約 2 時間 5 分** です（寿命の長い ID トークンがあれば、その分延びます）。寿命の長いトークンを運用している場合は、その寿命を上乗せしてください。これより早く外すと、その後に `/jwks` を取得した検証側は、旧鍵が署名したトークンを検証できません。

<figure class="fig">
  <div class="fig-head">旧鍵をどれだけ残しておくか</div>
  <svg class="fig-svg" role="img" aria-labelledby="key-overlap-title" viewBox="0 0 960 368" xmlns="http://www.w3.org/2000/svg">
    <title id="key-overlap-title">ハンドラを差し替えて旧鍵が署名をやめた時点から始まるタイムライン。旧鍵がすでに署名したトークンは、トークン寿命 1 回分だけ有効です。RP の鍵集合キャッシュが入れ替わるまでには最長 2 時間かかります。旧鍵はこれらがすべて終わるまで Keyset と JWKS に残し、その時点が外せる最も早い時刻です。</title>
    <text class="fg-lbl" x="32" y="40">差し替え後</text>
    <path class="fg-rule fg-rule--strong" d="M32,56 H928"/>
    <path class="fg-tick" d="M256,48 V64"/>
    <text class="fg-s" x="272" y="40">旧鍵が署名をやめる</text>
    <!-- 旧鍵が署名したトークン -->
    <text class="fg-s" x="32" y="118">旧鍵が署名したトークン</text>
    <rect class="fg-box" x="256" y="88" width="96" height="48" rx="8"/>
    <text class="fg-s" x="368" y="118">あと 1 トークン寿命のあいだ有効（既定 5 分）</text>
    <!-- RP の鍵集合キャッシュ -->
    <text class="fg-s" x="32" y="198">RP の鍵集合キャッシュ</text>
    <rect class="fg-box fg-box--warn" x="256" y="168" width="592" height="48" rx="8"/>
    <text class="fg-s" x="272" y="198">旧い集合を返し続けることがある（既定で最長 2 時間）</text>
    <!-- Keyset 内の旧鍵 -->
    <text class="fg-s" x="32" y="278">Keyset 内の旧鍵</text>
    <rect class="fg-box fg-box--accent" x="256" y="248" width="592" height="48" rx="8"/>
    <text class="fg-s" x="272" y="278">上の最も長いバーが終わるまで、公開し信頼したままにする</text>
    <!-- earliest drop -->
    <path class="fg-rule fg-rule--strong fg-rule--dashed" d="M848,64 V320"/>
    <text class="fg-s" x="848" y="344" text-anchor="middle">最短で外せる時点</text>
  </svg>
  <figcaption class="fig-note">バーの長さは模式です。旧鍵を外してよいのは、最も長いバーが終わってからです。既定値ではキャッシュ期間がそれにあたり、寿命の長いトークンを扱う場合はトークンのバーのほうが長くなることがあります。</figcaption>
</figure>

::: tip ローテーション中であることのシグナル
`op.WithJWKSRotationActive(predicate)` で Provider に述語を渡します。述語が true の間、`/jwks` は長い既定キャッシュの代わりに 5 分の `Cache-Control: public, max-age=300, must-revalidate` を返すので、RP のキャッシュが早く更新されます。重なり期間のあいだ true にしておいてください。[JWKS エンドポイント § ローテーション中のキャッシュ制御](/ja/operations/jwks#ローテーション中のキャッシュ制御) を参照。
:::

## inbound 暗号化鍵のローテーション

`op.EncryptionKeyset` は、`/auth` と `/par` に届く暗号化 request object を復号する OP の inbound 専用 JWE 鍵集合です。outbound 応答のアクティブ鍵を供給するものではありません。outbound JWE 応答はクライアントの JWKS にある `use=enc` 鍵で暗号化します。

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

- **定期:** 四半期ごと（リスクは低めです。cookie は `__Host-` プレフィックスで保護され、寿命は session の寿命の中に収まります）。
- **侵害時:** 即時。

### 手順

```go
// 新しい 32 byte の鍵を生成する。
newKey := make([]byte, 32)
if _, err := rand.Read(newKey); err != nil { /* abort */ }

// 先頭の鍵で暗号化、それ以降は復号試行に使われる。
op.WithCookieKeys(newKey, oldKey)
```

`WithCookieKeys` は復号用に旧鍵を残せるので、有効なセッションはそのまま継続します。session の既定は、アイドル 14 日・絶対 30 日です。`oldKey` は最長 30 日残してください。それより早く外すと、その鍵で封緘された cookie を持つユーザがログアウトされます。該当するセッションがすべて終わったら、`oldKey` をスライスから外します。レプリカが複数ある場合は、他のレプリカが開けない cookie を封緘するレプリカが出ないよう、[マルチインスタンス展開](/ja/operations/multi-instance#cookie-鍵の一貫性) の 3 段階の手順でロールアウトしてください。

::: warning 順序が重要
`WithCookieKeys` の先頭が現行の暗号化鍵です。旧鍵を先頭にしてしまうと、**気付かれないうちに侵害済み鍵を現行扱いに格下げ**してしまいます。型ではなく規約での強制なので、ローテーション時はレビューを慎重にしてください。
:::

## MFA 暗号化鍵のローテーション

`WithMFAEncryptionKeys` も cookie 鍵と同じ「先頭が現行、以降が過去」の形に従います。32 byte 鍵で TOTP のシークレットを保存時暗号化（AES-256-GCM、subject 識別子を AAD にバインド）します。`StepTOTP` に専用の `EncryptionKey` を渡した場合は、そちらが使われます。

```go
op.WithMFAEncryptionKeys(currentKey, previousKey)
```

`previousKey` を退役させるのは、永続化済みのすべての TOTP レコードが `currentKey` で再暗号化されてからです。これはストア側のマイグレーション課題で、ライブラリが自動再暗号化することはありません。

## ローテーション**しない**もの

- **Issuer。** `WithIssuer` を変えると、発行済みのすべてのトークン（`iss` は JWT の一部です）と、すべての RP の discovery キャッシュが無効になります。ローテーションではなくデプロイ扱いです。
- **`Keyset` 内の `KeyID`。** いったん JWKS に出した `kid` は、RP のキャッシュキーになる公開識別子です。別の鍵に同じ `kid` を再利用すると、古い公開鍵をキャッシュしている RP で検証に失敗します。ローテーションのたびに新しい `kid` を生成してください。

## 検証チェックリスト

ローテーション後:

1. `curl https://op.example.com/jwks` で、新しい `kid` が出ていて退役した `kid` がまだ並んでいるか（撤去工程を完了するまでは並んでいるべき）を確認します。
2. 新しいトークンの `kid` ヘッダが新鍵を指しているか確認します: `echo "<jwt>" | cut -d. -f1 | base64 -d | jq .kid`。
3. 切り替え（cut-over）後に `key.retired_kid_presented` 監査イベントが新たに発火していないことを確認します。このイベントは、`NotAfter` を過ぎた `kid` を名乗る JWS / JWE が届いたときに出るため、`NotAfter` を設定したエントリだけが対象です。沈黙が成功のシグナルです。
4. ローテーション前に確立したブラウザセッションで、`/auth` の認可要求を再開し、再認証なしに進められること（session cookie を復号できること）を確認します。

## なぜその場で書き換えず、新しい `Provider` を作るのか

ローテーションは OP のセキュリティ性質を根本から変える操作です。`op.New(...)` を改めて呼ばせる形にしておくことで:

- すべてのオプション衝突チェックが再走します（typo を載せたまま動かすことができません）。
- 検証パスがアトミックに差し替わります（中途半端なローテーション状態が発生しません）。
- 監督プロセス側のログ / 監査記録に明示的なイベントが残ります（プロセス内部で暗黙に状態変更が走るのとは違います）。

監督プロセス側の pattern は十分小さく、安全性のメリットに見合う冗長さだと判断しています。
