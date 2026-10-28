---
title: FAQ
description: ライブラリ作者が examples を書き、適合性テストを実行する中で実際にハマった箇所を集めた FAQ。
outline: 2
pageClass: pg-faq
---

# FAQ

ここに並んでいる質問は、作者が examples を書いたり適合性テストのハーネスを実行したりする過程で実際に詰まったものです。同じところで詰まった場合、ここに書いてある方法が本プロジェクトで実際に使っている方法です。

<figure class="fig">
  <div class="fig-head">この FAQ の読み方</div>
  <svg class="fig-svg" role="img" aria-labelledby="faq-order-title" viewBox="0 0 960 384" xmlns="http://www.w3.org/2000/svg">
    <title id="faq-order-title">この FAQ の読み進め方。まず OP を起動できる状態にし、次に自分が取り組んでいる領域へ進み、最後にエラー対応と採用判断を確認します。</title>
    <!-- start -->
    <rect class="fg-box fg-box--accent" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="52">まず起動する</text>
    <text class="fg-s" x="360" y="76">必須オプション</text>
    <text class="fg-s" x="360" y="100">issuer · store · 鍵</text>
    <!-- fan-out -->
    <path class="fg-leader" d="M480,120 V144 M168,144 H792"/>
    <path class="fg-edge fg-edge--thin" d="M168,144 V168" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M480,144 V168" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M792,144 V168" marker-end="url(#fg-a)"/>
    <!-- areas -->
    <rect class="fg-box" x="32" y="168" width="272" height="72" rx="8"/>
    <text class="fg-t" x="48" y="196">FAPI / DPoP</text>
    <text class="fg-s" x="48" y="220">プロファイルと送信者制約</text>
    <rect class="fg-box" x="344" y="168" width="272" height="72" rx="8"/>
    <text class="fg-t" x="360" y="196">トークン / ストレージ</text>
    <text class="fg-s" x="360" y="220">形式・TTL・ストア選び</text>
    <rect class="fg-box" x="656" y="168" width="272" height="72" rx="8"/>
    <text class="fg-t" x="672" y="196">UI / SPA / MFA</text>
    <text class="fg-s" x="672" y="220">画面とユーザ操作</text>
    <!-- merge -->
    <path class="fg-leader" d="M168,240 V264 M480,240 V264 M792,240 V264 M168,264 H792"/>
    <path class="fg-edge fg-edge--thin" d="M480,264 V288" marker-end="url(#fg-a)"/>
    <!-- errors, adoption -->
    <rect class="fg-box" x="344" y="288" width="272" height="72" rx="8"/>
    <text class="fg-t" x="360" y="316">エラー対応</text>
    <text class="fg-s" x="360" y="340">失敗の意味と直し方</text>
    <path class="fg-edge fg-edge--thin" d="M616,324 H656" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="656" y="288" width="272" height="72" rx="8"/>
    <text class="fg-t" x="672" y="316">採用判断</text>
    <text class="fg-s" x="672" y="340">本番投入 · 脆弱性報告</text>
  </svg>
  <figcaption class="fig-note">選ぶのは中段の 1 つだけです。いま取り組んでいる領域を選んでください。最初の起動と、最後のエラー対応・採用判断はどの読者にも当てはまります。</figcaption>
</figure>

<ul class="faq-index">
  <li><a href="#setup-basics"><div class="faq-index-title">セットアップと基本</div><div class="faq-index-desc">必須オプション、マウント先、Issuer 正規化、最小構成</div></a></li>
  <li><a href="#fapi"><div class="faq-index-title">FAPI 2.0</div><div class="faq-index-desc">Baseline と Message Signing、DPoP / mTLS の選択</div></a></li>
  <li><a href="#tokens"><div class="faq-index-title">トークンとローテーション</div><div class="faq-index-desc">リフレッシュ rotation の grace、<code>offline_access</code>、TTL 分離</div></a></li>
  <li><a href="#dpop"><div class="faq-index-title">DPoP と送信者制約</div><div class="faq-index-desc">DPoP nonce の配布、対応アルゴリズムの絞り込み理由</div></a></li>
  <li><a href="#storage"><div class="faq-index-title">ストレージ</div><div class="faq-index-desc">既存 users テーブルの扱い、アダプタ選択、composite の制約</div></a></li>
  <li><a href="#ui-spa"><div class="faq-index-title">UI と SPA</div><div class="faq-index-desc">SPA 連携（React / Vue / Svelte / …）、CORS、同意画面のカスタム</div></a></li>
  <li><a href="#auth-mfa"><div class="faq-index-title">認証と MFA</div><div class="faq-index-desc">パスワード / TOTP / passkey、step-up、リスクベース</div></a></li>
  <li><a href="#logout"><div class="faq-index-title">ログアウト</div><div class="faq-index-desc">Front-Channel を持たない理由、Back-Channel fan-out のギャップ</div></a></li>
  <li><a href="#native-loopback"><div class="faq-index-title">ネイティブアプリとループバック</div><div class="faq-index-desc"><code>127.0.0.1</code> redirect_uri のオプトイン</div></a></li>
  <li><a href="#observability"><div class="faq-index-title">観測性</div><div class="faq-index-desc"><code>/metrics</code> を自動マウントしない理由、監査イベントカタログ</div></a></li>
  <li><a href="#conformance"><div class="faq-index-title">適合性とバージョン</div><div class="faq-index-desc">REVIEW の意味、認証の称し方、更新時の安定性</div></a></li>
  <li><a href="#errors"><div class="faq-index-title">よくあるエラー</div><div class="faq-index-desc"><code>redirect_uri</code> 不一致、<code>alg not allowed</code>、<code>jkt mismatch</code></div></a></li>
  <li><a href="#adoption"><div class="faq-index-title">採用判断</div><div class="faq-index-desc">本番投入の可否、セキュリティ報告の経路</div></a></li>
</ul>

<div id="setup-basics" class="faq-anchor"></div>

## セットアップと基本

### `op.New(...)` がエラーを返すのはなぜ？

中心的なオプションには安全な既定値がないためです。`op.New` はゼロ値で黙って動くかわりに、起動時にエラーを返して止まります。`WithIssuer`、`WithStore`、`WithKeyset` は常に必須です。authorization_code grant を有効にする場合（既定の grant 集合を含む）は、さらに `WithCookieKeys` と `WithLoginFlow`（または `WithAuthenticators`）が必須になります。

| オプション | これがないと |
|---|---|
| `WithIssuer` | `iss` や discovery URL に載せる OP の識別子がない |
| `WithStore` | クライアント、認可コード、トークンの保存先がない |
| `WithKeyset` | ID トークンに署名できない |
| `WithCookieKeys` | ブラウザフローのセッション cookie と CSRF cookie を暗号化できない |
| `WithLoginFlow` | サインインできるユーザがいないため、最初の本番リクエストで失敗する代わりに起動を拒否する |

エラーには欠けている項目名が入るので、タイポは実行時の謎ではなく起動時の失敗として現れます。`op.New` は、`WithLoginFlow` と `WithAuthenticators` の併用や、シークレットのない `client_secret_basic` の静的クライアントなど、動作しない組み合わせも拒否します。個別の条件は [必須オプション](/ja/getting-started/required-options) にまとめています。

::: tip 推奨パターン
32 バイトの cookie 鍵を環境ごとに 1 度 `crypto/rand` で生成し、config やシークレットマネージャー経由で渡してください。RP も含めた全体の構成は [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) にあります。
:::

### OP はどこにマウントすればいい？ prefix を変えても大丈夫？

返ってきた `http.Handler` はルータのルートにマウントし、URL の prefix は `op.WithMountPrefix` で決めます。既定は `/oidc` で、`op.WithMountPrefix("/")` を渡すとエンドポイントがルート直下に移ります。discovery 文書は issuer と mount prefix から作られるので、RP からは常に一貫した URL に見えます。各エンドポイントの置き場所は [ルータへのマウント](/ja/getting-started/mount) にまとめています。

### 最小構成は？

```go
st := inmem.New()
handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(st),
    op.WithKeyset(myKeyset),
    op.WithCookieKeys(cookieKey), // 32 バイト
    op.WithLoginFlow(op.LoginFlow{
        Primary: op.PrimaryPassword{Store: st.UserPasswords()},
    }),
)
```

これはブラウザフローの最小形です。常に必須の 3 つに、authorization_code grant 用の cookie 鍵とログインフローを足しています。詳細は <a class="doc-ref" href="/ja/getting-started/minimal">最小構成 OP</a>。

### 「Issuer の末尾にスラッシュは禁止」って本当？

本当です。RFC 9207 のミックスアップ防御はエコシステム全体での `iss` のバイト一致比較に依存しているので、`op.WithIssuer` は単一の正規形を強制します。次は全部弾きます:

- 末尾スラッシュ（`https://op/` → 不可）
- scheme の大文字混在（`HTTPS://op` → 不可）
- host の大文字混在（`https://OP.example.com` → 不可）
- 既定ポート（`https://op:443` → 不可、`http://127.0.0.1:80` → 不可）
- fragment（`https://op#x` → 不可）
- query（`https://op?x=1` → 不可）
- 非正規 path（`..`、`.`、重複スラッシュ — `path.Clean` で判定）

::: details なぜこんなに厳しいの？
RP の検証側でも、片側に正規形でない 1 文字が紛れただけでバイト一致が崩れ、ミックスアップ防御が静かに無効化されます。本番に届く前に構築時エラーとして弾くために、構築時に厳しめに正規化しています。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §9</a>。
:::

<div id="fapi" class="faq-anchor"></div>

## FAPI 2.0

### `op.WithProfile(profile.FAPI2Baseline)` で具体的に何が ON になる？

1 行で、本ライブラリの FAPI プロファイル方針を次の領域に適用します:

| スイッチ | 効果 |
|---|---|
| feature 有効化 | `feature.PAR` と本ライブラリの JAR 設定を ON。`feature.MTLS` が明示されていなければ `feature.DPoP` を既定選択 |
| クライアント認証 | `token_endpoint_auth_methods_supported` を、本プロファイルが実装する `private_key_jwt` に絞り込み |
| alg 制約 | クライアントが署名する request / assertion の alg をプロファイル許可リストに絞り込み |
| `redirect_uri` | 完全一致を強制（ワイルドカード不可） |
| PKCE | すべての code 要求で S256 を必須化 |
| `state` / `nonce` | すべての authorize 要求でいずれか必須 |
| PAR | `/auth` は、先に `/par` へ送られていない要求を拒否 |
| 有効期間 | `WithAccessTokenTTL` の上限は 10 分、`WithPARLifetime` は 600 秒未満に制限 |

FAPI 2.0 Security Profile（Final）が要求するのは PAR、S256 の PKCE、送信者制約付きトークンです。`redirect_uri` の完全一致は本ライブラリのポリシーです。FAPI 2.0 §5.5 は完全一致する値の事前登録を要求していません。JAR、本ライブラリの alg 絞り込み、OP 発行 JWT の ES256 固定は、本ライブラリのプロファイル設定であり、FAPI Security Profile の必須要件ではありません。

::: warning プロファイル指定後にこれらと矛盾するオプションを重ねると、`op.New` がエラーを返します。
プロファイルは意図的に剛直にしてあり、誤って一部だけ緩めることがないようにしています。
:::

### Baseline と Message Signing — どちらが必要？

本ライブラリでは Message Signing は `profile.FAPI2Baseline` に JARM を加えたもので、DPoP が有効なときは `op.WithDPoPNonceSource` も必須です。authorize 要求と応答そのものについて **非否認性**（non-repudiation）が必要なら Message Signing を選びます。オープンバンキングのような監査連鎖が典型例です。それ以外は本ライブラリの Baseline プロファイルで足ります。

| `FAPI2Baseline`（本ライブラリのプロファイル） | Message Signing |
|---|---|
| PAR + JAR（本ライブラリの設定）+ PKCE（S256）+ DPoP / mTLS | + JARM（署名付き認可応答） |

### DPoP なしで FAPI 2.0 に対応できる？

可能です。`op.WithFeature(feature.MTLS)` で mTLS を有効にし、proxy が TLS を終端する場合は `op.WithMTLSProxy(...)` で証明書ヘッダを構成すれば、mTLS による送信者バインディングに切り替わります。FAPI 2.0 §5.3.2.1(4)–(5) は「DPoP **または** mTLS」を要求しますが、本ライブラリの FAPI プロファイルでは `/token` のクライアント認証に引き続き `private_key_jwt` を使います。

<div id="tokens" class="faq-anchor"></div>

## トークンとローテーション

### リフレッシュトークンのリトライで `invalid_grant` が返る — 既に通信中だったのに

ローテーション後の **猶予期間（grace period）** の話です。既定は 60 秒です。応答が届かなかった場合、猶予期間内に前のリフレッシュトークンを再提示すると、再ローテーションせずに保存済みの後継トークンを返します。送信者制約付きの再試行では、結び付け直したアクセストークンを発行する場合があります。期間を過ぎた場合や、再利用検知で連鎖が失効した場合は `invalid_grant` になります。

::: details 期間を調整したいとき
FAPI 以外の profile では、`op.WithRefreshGracePeriod(90 * time.Second)` で延長できます。本ライブラリの `profile.FAPI2Baseline` または `profile.FAPI2MessageSigning` では、`0` 秒から `60` 秒まで（60 秒を含む）の明示設定が許容され、`60` 秒を超える値だけが拒否されます。`op.WithRefreshGracePeriod(0)` で猶予期間を完全に無効化（厳密な single-use）にできます。負値はオプション側で拒否されます。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §2</a>。

この猶予期間はライブラリの設定であり、現行 FAPI 仕様への適合条件ではありません。FAPI 2.0 Security Profile §5.3.2.1(9) は、例外的な状況を除く通常のリフレッシュトークンローテーションを禁止しています。
:::

### リフレッシュトークンが返ってこないのはなぜ？

組み込みの認可コードフローでリフレッシュトークンが発行されるには、次の条件をすべて満たす必要があります。

1. OP の grant 集合が `grant.RefreshToken` を受け付ける（既定で有効。`WithGrants` を使うと既定集合が置き換わります）。
2. クライアントの `GrantTypes` に `refresh_token` が含まれている。
3. 付与された scope に `openid` が含まれている。ただし `op.WithOpenIDScopeOptional()` を有効にした場合は不要。
4. `op.WithStrictOfflineAccess()` を有効にした場合は、付与された scope に `offline_access` も含まれている。

`openid` が含まれているのに OP またはクライアントの grant が欠けている場合、トークンエンドポイントは `access_token` + `id_token` を返して成功し、`refresh_token` は付きません。`openid` がなければ ID トークンも発行されません。`op.WithOpenIDScopeOptional()` を有効にすると、OAuth 2.0 専用リクエストでも grant の条件を満たせばアクセストークンとリフレッシュトークンを受け取れます。本ライブラリの既定ポリシーでは、`offline_access` はリフレッシュトークン受領の必須条件では **ありません**。offline 用の TTL 区分と同意・監査の表示を切り替えます。

::: details `offline_access` を必須にしたい場合
OIDC Core 1.0 §11 は、ユーザがその場にいなくなった後のアクセスに使う `offline_access` を定義しています。`op.WithStrictOfflineAccess()` を有効にすると、この scope をリフレッシュトークン発行の必須条件にできます。その場合、利用する RP は `offline_access` を明示的に要求する必要があります。`op.WithOpenIDScopeOptional()` との併用をコンストラクタが拒否するのは、ライブラリのポリシーです。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §3</a>。
:::

### 「ログイン状態の維持」と通常セッションを TTL で分けたい

`op.WithRefreshTokenOfflineTTL(...)` で `offline_access` chain と通常ローテーションの TTL を分離できます。`token.issued` 監査イベントが `extras.offline_access=true` を出力するので、SOC ダッシュボードで chain を分けて可視化できます。

### リフレッシュトークンを失効させると何が失効する？

リフレッシュトークンに対する `/revoke` は、そのトークンのローテーション連鎖全体を、連鎖がどれだけ長くなっていても失効させ、同じ grant で発行したアクセストークンも受理しなくなります。同じクライアントにおけるユーザの他のリフレッシュ連鎖には影響しないため、別の端末はそのまま使え、新しいアクセストークンも発行できます。例外はリフレッシュトークンの replay です。RFC 9700 §2.2.2 は replay を盗難とみなすので、OP は replay された連鎖と、その grant で発行済みのアクセストークンをすべて失効させます。`/revoke` が連鎖から grant のリフレッシュトークン全体へ範囲を広げた場合、`token.revoked` 監査イベントは `surface: "refresh_grant"` を報告します。

独自ストアで連鎖単位の範囲を得るには、`store.OpaqueAccessTokenChainRevoker` と `store.IssuanceRevocationChecker` を実装し、`ChainID` を保存する必要があります。これらがなければ、失効は grant 単位のままです。

<div id="dpop" class="faq-anchor"></div>

## DPoP と送信者制約 {#dpop-sender-constraint}

### DPoP nonce はなぜ必要？ どう配るのが正解？

**なぜ必要か。** RFC 9449 §8 で OP がサーバ供給 nonce を `DPoP-Nonce` レスポンスヘッダ経由でクライアントに渡し、事前生成された proof による攻撃を緩和できます。

**どう配るか。** 本ライブラリは in-memory のリファレンス実装と差し込み口を同梱しています:

```go
src, err := op.NewInMemoryDPoPNonceSource(ctx, rotate) // demo グレード
if err != nil { /* 初期化エラー */ }
op.WithDPoPNonceSource(src)
```

実装例は [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce)。

::: warning 複数インスタンス構成
プロセスローカルな nonce ソースはレプリカを跨げません。HA 構成では共有ストア（Redis）を `DPoPNonceSource` の裏に置いてください。Redis nonce ソースをライブラリに同梱しないのは意図的です — オプション群（TTL、ローテーション周期、ローテーション境界の取りこぼし許容度）が運用ごとに違いすぎるためです。
:::

### `dpop_signing_alg_values_supported` に RS256 が含まれていないのはなぜ？

意図的です。DPoP の discovery リストは `ES256, EdDSA, PS256` で、コードベース全体の JOSE 許可リストよりも狭くしています。この許可リストは OP が client assertion や JAR request object を**検証する**ときの集合で、DPoP proof はそこから FAPI が推奨する部分集合に絞っています。なお `RS256` は OP 側の署名アルゴリズムでもありません。本ライブラリが発行するトークンの署名は ES256 のみで、これは実装上の欠落ではなくライブラリの方針です。

<div id="storage" class="faq-anchor"></div>

## ストレージ

### 既存の users テーブルを置き換えないといけない？

いいえ。ライブラリは `users` テーブルを直接読み書きしません。`op.PrimaryPassword`（または別のログイン step、自前の `op.Authenticator`）と `store.UserStore` を、既存のスキーマに向けるだけです。OP は「このクレデンシャルは有効か」「この subject にはどんな claim があるか」を尋ねるだけで、それ以外で users テーブルに触ることはありません。

### どのストレージアダプタを選べばいい？

| アダプタ | 想定 |
|---|---|
| `inmem` | テスト、demo、単一プロセス開発 |
| `sql`（SQLite / MySQL / Postgres） | 単一の永続バックエンド。最短で本番に乗せられる選択 |
| `redis`（セッション、interaction、消費済み JTI） | `composite` で `sql` と組み合わせ、hot / cold を分離。単独のストアにはなれない |
| `composite` | hot / cold 分離。`TxClusterKinds` は 1 つの比較可能な transactional バックエンドへまとめ、それ以外の `Kind` は分離可能 |
| `dynamodb` | サブストアごとに 1 テーブルを使う永続バックエンド。`store.Transactional` によりブラウザ認可コードフローも動作する。API は Experimental。 |

<a class="doc-ref" href="/ja/use-cases/sql-store">SQL ストア</a>、<a class="doc-ref" href="/ja/use-cases/dynamodb-store">DynamoDB ストア</a>、<a class="doc-ref" href="/ja/use-cases/hot-cold-redis">Hot / Cold 分離</a> を参照。

### `composite.New` が起動時に設定を拒否するのはなぜ？

トランザクションクラスタの不変条件があるためです。1 つのトランザクションに関わるサブストアは **同じ** バックエンドを共有しなければなりません。対象は、認可コード、リフレッシュトークン、grant、PAR、アクセストークン、opaque アクセストークン、grant の失効記録です（`composite.TxClusterKinds`）。セッションと interaction はクラスタの外にあり、Redis に置けます。消費済み JTI のマーカーは削除されると困るため、Redis に置くなら `noeviction` のインスタンスに限り、既定では永続ストア側に置きます。`composite.New` は構築時にこれらを検証し、トランザクションを 2 つのストアにまたがらせる設定を拒否します。

<div id="ui-spa" class="faq-anchor"></div>

## UI と SPA

### SPA からログイン / 同意を扱うには？

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

op.WithInteractionDriver(interaction.JSONDriver{})
```

JSON ドライバは、HTML ドライバが使う `/interaction/{uid}` と同じパスで各プロンプト（`login` / `consent.scope` / `chooser` ほか）を JSON として返します。SPA（React / Vue / Svelte / Angular / vanilla、フレームワーク不問）はそこからプロンプトを取得し、`{state_ref, values}` を `X-CSRF-Token` ヘッダ（`prompt.csrf_token` をそのまま返す double-submit cookie）と共に POST します。終端で返る `{type:"redirect", location}` エンベロープを `window.location.href` で辿れば完了です。

::: info UI マウントオプション
`op.WithSPAUI` は SPA の入口と JSON の状態取得面を OP 側でマウントします。このモードでは SPA の入口は `LoginMount/{uid}`、プロンプト JSON は `LoginMount/state/{uid}` です。`op.WithConsentUI` / `op.WithChooserUI` は同意画面とアカウント選択画面を組み込み側 HTML テンプレートで描画します。SPA の配信を自前のルータで持ちたい場合は `interaction.JSONDriver` も使えます。この場合の状態取得エンドポイントは `/interaction/{uid}` です。詳細は [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) と [カスタムアカウントチューザ UI](/ja/use-cases/custom-chooser-ui) を参照してください。

`WithSPAUI` と `WithConsentUI` は相互排他です。`WithChooserUI` は `WithSPAUI` と同時指定できますが、SPA モードでは chooser テンプレートは使われず、chooser の描画も SPA が受け持つことを示す警告が出ます。
:::

::: details SPA-safe なエラー描画
エラーページは CSP `default-src 'none'; style-src 'unsafe-inline'` の下で `<div id="op-error" data-code="..." data-description="...">` を出力するので、SPA ホストは HTML を parse しなくても selector で取得できます。
:::

### CORS — SPA の origin を許可するには？

```go
op.WithCORSOrigins("https://app.example.com")
```

API エンドポイント（`/token`、`/userinfo`、`/introspect`、`/revoke`、`/par`）の許可リストには、issuer の origin と、`WithStaticClients` で登録したクライアントの redirect URI の origin も入ります。クライアントストアにだけ存在するクライアントや、動的登録で作られたクライアントは origin を提供しないため、ブラウザから呼ぶそのようなクライアントの origin は `WithCORSOrigins` に渡す必要があります。詳細は <a class="doc-ref" href="/ja/use-cases/cors-spa">SPA 向け CORS</a>。

redirect URI の origin が、cross-origin の interaction や end-session ceremony を許可することはありません。これらが受け付けるのは issuer origin と `WithCORSOrigins` に明示的に渡した origin だけで、ceremony origin は issuer と同じ site でなければなりません。実際には cross-site の origin でも preflight と CORS ヘッダまでは通りますが、ブラウザは `__Host-` ceremony cookie（`__Host-oidc_interaction` は `SameSite=Lax`、`__Host-oidc_csrf` と `__Host-oidc_logout_csrf` は `SameSite=Strict`）を送らないため、interaction と end-session のリクエストは `404` になります。ceremony UI は `op.example.com` に対する `login.example.com` のような issuer と同じ site の sibling host に配置してください。

### ライブラリを fork せずに同意画面をカスタマイズできる？

可能です。主な経路は次の 3 つです。

- **同梱 HTML ドライバを残し、ロケール bundle で文言を上書き。** `op.WithLocale` を使うと、seed の `en` / `ja` bundle 上に変更したいキーだけを重ねられます — 同意画面の文言はこのキー単位の上書きでカバーできるので、ブランド・コピー差し替えはこちらで足ります。詳細は [ユースケース: i18n / ロケール解決](/ja/use-cases/i18n)。
- **`op.WithConsentUI` でテンプレートを差し替える。** OP は組み込み側の `*html/template.Template` を `ConsentTemplateData` で描画し、state / CSRF / 同意永続化は引き続き OP が担当します。詳細は [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui)。
- **JSON ドライバに切り替えて画面ごと自前で描画。** `op.WithInteractionDriver(interaction.JSONDriver{})` を渡すと同意画面が JSON で返るので、自前のページ（または SPA）で描画できます。詳細は [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction)。

<div id="auth-mfa" class="faq-anchor"></div>

## 認証と MFA

### パスワード / TOTP / passkey の検証はどこにある？

ライブラリは `op.PrimaryPassword`、`op.StepTOTP`、`op.RuleAlways` などのビルディングブロックを提供します。これらを `op.LoginFlow` に組み合わせて、どの factor をどの順で実行するかを決めます。クレデンシャルの保存先は、`store.UserPasswordStore` や `store.TOTPStore` を組み込み側で実装します（in-memory アダプタは `UserPasswords()` と `TOTPs()` として公開しています）。完全カスタムな factor が必要なら `op.Authenticator` を実装してください。詳細は [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) 以降を参照してください。

### Step-up 認証はどう実装する？

`LoginFlow.Rules` に `op.RuleACR("urn:example:mfa", op.StepTOTP{...})` を追加します。認可リクエストの `acr_values` にその値が含まれると、指定した step を実行します。どの ACR 値でどの factor を求めるかはフロー側で決めます。これは認可リクエストの rule であり、RFC 9470 の resource server から authorization server への challenge ではありません。完全なフローは [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) を参照してください。

### リスクスコアが高いときだけ MFA を挟める？

`RiskAssessor` を設定し、`LoginFlow.Rules` に `op.RuleRisk(op.RiskScoreHigh, op.StepTOTP{...})` のような rule を追加します。`RiskOutcome.Score` がしきい値を選び、rule の第2引数が実行する step です。詳細は [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa) を参照してください。

<div id="logout" class="faq-anchor"></div>

## ログアウト

### Front-Channel Logout が無いのはなぜ？

モダンブラウザの既定（third-party cookie の段階廃止、`SameSite=Lax` 既定など）が、Front-Channel Logout 1.0 / Session Management 1.0 が要求する「iframe ベースのセッション通知」を実質的に動かなくしました。ライブラリは代わりに RP-Initiated Logout 1.0 + Back-Channel Logout 1.0 を提供しています。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §5</a>。

### Back-Channel Logout の fan-out で一部の RP に届かない

`/end_session` handler は detached BCL coordinator を呼ぶ前に、OP session から subject を snapshot します。coordinator は `GrantStore.ListClientIDsBySubject` で grant 由来の audience を導出し、back-channel URI を登録した eligible な client を配信対象として解決します。したがって `op.AuditBCLNoSessionsForSubject` は、この session-bearing logout notice に対して grant 由来の eligible な RP target が 0 件に解決されたことを示すもので、session eviction を直接示すシグナルではありません。揮発性の `SessionStore` が handler の snapshot 前に session を失うと、logout trigger / snapshot 自体が失われ、fan-out（およびこの event）は開始されません。`op.WithSessionDurabilityPosture` は宣言された durability を記録し、SOC ダッシュボードがそのリスクを解釈できるようにするものです。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §10</a>。

<div id="native-loopback" class="faq-anchor"></div>

## ネイティブアプリとループバック

### CLI の `127.0.0.1:54312/cb` 形式の redirect_uri が拒否された

本ライブラリの既定の redirect-URI マッチはバイト完全一致で、FAPI プロファイルでもこのポリシーを維持します。ループバックのポートワイルドカード（RFC 8252 §7.3）は **クライアント単位でオプトイン** — 登録済みの `redirect_uris` にループバック URI を含めれば、scheme が `http`、登録済 host がループバック形（`127.0.0.1` / `::1`、登録側オプトインがある場合は文字列 `localhost`）、要求側 host が登録 host と一致し、path / query / fragment が完全一致のときに限り、ポート不一致を許容します。文字列 `localhost` の受理は登録時オプトイン（web クライアントは `op.WithAllowLocalhostLoopback()`、native クライアントは `application_type=native`）が前提です。literal IP のみの厳格な構えを保ちたいデプロイは、両方のオプトインを外したままにしておけば従来どおりの挙動になります。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §4</a>。

<div id="observability" class="faq-anchor"></div>

## 観測性

### `op.WithPrometheus(...)` を設定したのに `/metrics` が無い

ライブラリは `/metrics` を **マウントしません**。`op.WithPrometheus(reg)` は OP が絞り込んで保持するカウンタを、利用者が渡した registry に登録するだけです。

HTTP ルートのマウントはルータ側の責務です — トレーシング（外側で `otelhttp.NewMiddleware` をラップする）も、リクエスト所要時間ヒストグラム（外側でミドルウェアをラップする）も同じ分離方針です。OP は **OIDC 業務系の** カウンタ、ログ、監査イベントだけを発行し、OpenTelemetry のスパンは生成しません。HTTP ライフサイクルの観測は組み込み側に委ねます。

詳細は [`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics)。

### ライブラリはどんな監査イベントを出す？

`op/audit.go` 内の `op.Audit*` 定数で列挙された有限カタログです:

| カテゴリ | カバー範囲 |
|---|---|
| `login.*` / `mfa.*` / `step_up.*` | ログインフローの factor 結果 |
| `code.*` / `token.*` / `refresh.*` | code・トークンの発行 / refresh / revoke |
| `session.*` / `logout.*` / `bcl.*` | session とログアウトのライフサイクル |
| `consent.*` | 同意判断 |
| `dcr.*` | Dynamic Client Registration |
| `device_authorization.*` / `device_code.*` | RFC 8628 |
| `ciba.*` | OIDC CIBA |
| `token_exchange.*` | RFC 8693 |
| `client_authn.*` / `introspection.*` | クライアント認証 / introspection |
| `account.*` / `federation.*` / `recovery.*` | アカウント管理フィード |
| `rate_limit.*` / `pkce.*` / `redirect_uri.*` / `alg.*` / `cors.*` / `dpop.*` / `key.*` / `lockout.*` | 防御シグナル |
| `custom_grant.*` / `grant_management.*` / `cascade.*` / `startup.*` | custom grant、Grant Management、失効の連鎖、起動時の構成記録 |

各イベントには `audit="true"` と識別子の `event` が含まれます。`actor_id`、`client_id`、`request_id` などは設定時だけ出力され、カテゴリ固有の `extras` グループも空なら出力されません。購読には `op.WithAuditLogger(...)`（`*slog.Logger`）を使います。全フィールドは[監査イベントカタログ](/ja/reference/audit-events#共通の属性)を参照してください。

<div id="conformance" class="faq-anchor"></div>

## 適合性とバージョン

### OFCS 適合状況に PASSED だけでなく REVIEW も出るのはなぜ？

OFCS は複数の判定を記録し、素通しで合格といえるのは `PASSED` だけです。raw の `FAILED` は suite が期待結果を観測できなかったことを示し、strict verifier がレビュー済みかつ期限内の exclusion と照合できない限りリリースを止めます:

| 判定 | 意味 |
|---|---|
| `PASSED` | テスト実行 / OP は仕様どおりに振る舞った |
| `REVIEW` | テスト実行 / OP は正しく振る舞った — 人間が UI 成果物（描画されたエラーページのスクリーンショット等）を目視確認する必要がある |
| `FAILED` | module が suite の期待結果に到達しなかった。レビュー済み・期限付き exclusion がなければ release を止める。 |

本ハーネスは `REVIEW` を自動 pass にせず、そのまま記録します。現在の release run と詳細な内訳は <a class="doc-ref" href="/ja/compliance/ofcs">OFCS 適合状況</a> にまとめています。

### 「OIDF 認証取得済み」と称してよい？

不可です。本プロジェクトは OpenID Foundation の会員費を支払っておらず、公式認証も取得していません。OFCS のベースラインは仕様適合性の再現可能なスナップショットであって、認証ではありません。詳細は <a class="doc-ref" href="/ja/security/posture">セキュリティ方針</a>を参照してください。

### バージョンを固定すべき？

固定してください。本番の依存は `go.mod` で固定し、更新前に [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) を読んでください。`op.New` と同梱ストレージアダプタだけの構成なら通常そのまま更新できます。独自のストアやその他の拡張を組み込んでいる場合は、現在の移行案内を確認してください。`Experimental:` マーカー付き API は通常のマイナーリリース例外です。

<div id="errors" class="faq-anchor"></div>

## よくあるエラー {#common-errors}

### `invalid_request: redirect_uri is not registered for this client`

`/auth` は `redirect_uri` を、クライアントの登録済みリストとバイト単位で比較します。URI はまだ信頼できないため、リダイレクトせず、OP 自身のエラーページにこのエラーを表示します。よくある原因は次の 3 つです。

1. 末尾スラッシュのずれ（`/cb` と `/cb/`）。
2. 既定ポートが片側だけ含まれる（`https://rp.example.com:443/cb` と `https://rp.example.com/cb`）。
3. CLI / ネイティブアプリのループバックで、RFC 8252 §7.3 のオプトインをしていない（前述）。

### `invalid_request_object: request object alg is not allowed`

`/auth` または `/par` に送った JAR request object の `alg` が、許可リスト（`RS256`、`PS256`、`ES256`、`EdDSA`）か、クライアントの `request_object_signing_alg` の範囲外です。`private_key_jwt` の client assertion で alg が不正な場合は、あえて詳細を伏せた `invalid_client`（"client authentication failed"）が返ります。本ライブラリの `profile.FAPI2Baseline` を使う場合は、クライアントを `PS256`（または `ES256` / `EdDSA`）に絞り込んでください。このライブラリのプロファイルでは `RS256` が拒否されます。

### `invalid_request: this OP requires authorization requests to be pushed via the PAR endpoint`

FAPI 2.0 のプロファイルは PAR を必須にするため、通常の `/auth?...` URL は拒否されます。先に `/par` へ要求を送り、`/auth` には `client_id` と返ってきた `request_uri` だけを渡してください。

### `invalid_token: DPoP proof key does not match the bound thumbprint`

DPoP proof の公開鍵 thumbprint（RFC 7638）が、アクセストークンに結び付けられた `cnf.jkt` と一致しません。`/userinfo` はこの `invalid_token` の challenge で応答し、誤った鍵でのリフレッシュには `invalid_grant` が返ります。送信者バインディングが期待どおり働いている状態で、proof を別の鍵で署名したか、トークンが別のクライアントのものかのどちらかです。

### `private_key_jwt` のクライアントに `/token` が 503 を返す

クライアントの JWKS（`jwks_uri`）を取得できない、または使えない状態です。取得が容量制限で拒否されたか、一時的に失敗しています。原因は OP 側にあり、再試行しても安全なため、`invalid_client` ではなく 503 `server_error`（"client keys are temporarily unavailable"）を返します。`/auth`、`/par`、`/bc-authorize` も、request object について同じように応答します。クライアントストアの障害は 500 `server_error` です。

### `/par` 成功後に `invalid_request_uri` が返る

認可コード発行後に `/oidc/auth?request_uri=…` へ再度アクセスしています。`request_uri` はコード発行時点で one-time として消費されます（RFC 9126 §2.2、詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §1</a>）。`/par` をやり直して新しい URI を発行してください。

<div id="adoption" class="faq-anchor"></div>

## 採用判断

### 本番で使ってよい？

RP・OP・ユーザをすべて自社で管理する内部用途であれば、十分に選択肢に入ります。第三者による監査証跡や公式認証が出荷条件にあるなら、本ライブラリは選ばないでください。判断の前に <a class="doc-ref" href="/ja/security/posture">セキュリティ方針</a>、とくに「ここに **無い** もの」の節を読んでください。

### セキュリティ問題はどう報告する？

[GitHub Security Advisories](https://github.com/libraz/go-oidc-provider/security/advisories/new) からプライベートに報告してください。完全なポリシーは <a class="doc-ref" href="/ja/security/disclosure">脆弱性報告ガイド</a> を参照してください。
