---
title: FAQ
description: ライブラリ作者が examples を書きながら / Conformance 検査を回しながら実際にハマった箇所を集めた FAQ。
outline: 2
pageClass: pg-faq
---

# FAQ

このページは「最初に見るべき場所」のひとつです。下に並んでいる質問は理屈ではなく、メンテナが examples を書いたり Conformance ハーネスを回したりする途中で実際にハマったものばかりです。

<svg role="img" aria-labelledby="faq-route-title" viewBox="0 0 760 310" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="faq-route-title">FAQ の読み方: まずセットアップ、次に FAPI やトークンなど目的別の領域へ進み、最後にエラーや採用判断を確認する。</title>
<rect class="faq-main" x="40" y="116" width="154" height="74" rx="8"/>
  <text class="faq-text" x="117" y="146" text-anchor="middle">まず起動</text>
  <text class="faq-sub" x="117" y="168" text-anchor="middle">必須オプション / issuer</text>

  <rect class="faq-box" x="292" y="36" width="176" height="56" rx="8"/>
  <text class="faq-text" x="380" y="70" text-anchor="middle">FAPI / DPoP</text>
  <rect class="faq-box" x="292" y="112" width="176" height="56" rx="8"/>
  <text class="faq-text" x="380" y="146" text-anchor="middle">トークン / storage</text>
  <rect class="faq-box" x="292" y="188" width="176" height="56" rx="8"/>
  <text class="faq-text" x="380" y="222" text-anchor="middle">UI / SPA / MFA</text>

  <rect class="faq-box" x="566" y="76" width="154" height="62" rx="8"/>
  <text class="faq-text" x="643" y="108" text-anchor="middle">エラー対応</text>
  <text class="faq-sub" x="643" y="126" text-anchor="middle">よくある失敗</text>
  <rect class="faq-box" x="566" y="172" width="154" height="62" rx="8"/>
  <text class="faq-text" x="643" y="204" text-anchor="middle">採用判断</text>
  <text class="faq-sub" x="643" y="222" text-anchor="middle">本番投入 / 報告</text>

  <path class="faq-flow" d="M194 152 C234 106 252 66 288 64"/>
  <path class="faq-flow" d="M194 152 H288"/>
  <path class="faq-flow" d="M194 152 C236 190 252 216 288 216"/>
  <path class="faq-flow" d="M468 112 C510 110 526 108 562 108"/>
  <path class="faq-flow" d="M554 104 L563 108 L554 112"/>
  <path class="faq-flow" d="M468 188 C510 198 526 204 562 204"/>
  <path class="faq-flow" d="M554 200 L563 204 L554 208"/>
</svg>

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
  <li><a href="#conformance"><div class="faq-index-title">適合性とバージョン</div><div class="faq-index-desc">REVIEW の意味、認証の称し方、v1 の安定性</div></a></li>
  <li><a href="#errors"><div class="faq-index-title">よくあるエラー</div><div class="faq-index-desc"><code>redirect_uri</code> 不一致、<code>alg not allowed</code>、<code>jkt mismatch</code></div></a></li>
  <li><a href="#adoption"><div class="faq-index-title">採用判断</div><div class="faq-index-desc">本番投入の可否、セキュリティ報告の経路</div></a></li>
</ul>

<div id="setup-basics" class="faq-anchor"></div>

## セットアップと基本

### `op.New(...)` がエラーを返すのはなぜ？

中心的なオプションには「安全なデフォルト」が存在しないためです。ゼロ値で黙って動くのではなく、`op.New` は構築時にエラーを返して止めます。`WithIssuer`、`WithStore`、`WithKeyset` は常に必須で、`WithCookieKeys` は authorization-code grant を有効にする場合（既定の grant セットを含む）に必須です:

| オプション | これが無いと |
|---|---|
| `WithIssuer` | OP が署名 / 名前空間に使う識別子が無い |
| `WithStore` | clients / codes / tokens の永続化先が無い |
| `WithKeyset` | ID トークンに署名できない |
| `WithCookieKeys` | ブラウザの認可フローで使う session / CSRF cookie を封緘できない |

エラーは欠けた項目名を明示するので、起動時のタイポは「実行時の謎」ではなくビルド時エラーになります。

::: tip 推奨パターン
32 バイトの cookie 鍵を環境ごとに 1 度 `crypto/rand` で生成し、config / シークレットマネージャー経由で渡してください。標準的な 30 行のセットアップは [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) を参照。
:::

### OP はどこにマウントすればいい？ prefix を変えても大丈夫？

`http.Handler` をマウントしたパスにそのまま乗ります。既定のマウントプリフィックスは `/oidc` で、ルートに置きたい場合は `op.WithMountPrefix("/")`、`/auth` に動かしたい場合は `op.WithMountPrefix("/auth")` を渡します。Discovery 文書には設定された issuer + マウント prefix が埋め込まれるので、RP からは一貫した URL として見えます。

### 最小構成は？

```go
handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(myKeyset),
    op.WithCookieKeys(cookieKey), // 32 バイト
)
```

これは通常のブラウザフローの最小形です。常時必須の 3 オプションに、authorization-code grant 用の cookie 鍵を足しています。詳細は <a class="doc-ref" href="/ja/getting-started/minimal">最小構成 OP</a>。

### 「Issuer の末尾にスラッシュは禁止」って本当？

本当です。RFC 9207 のミックスアップ防御はエコシステム全体での `iss` のバイト一致比較に依存しているので、`op.WithIssuer` は単一の正規形を強制します。次は全部弾きます:

- 末尾スラッシュ（`https://op/` → 不可）
- scheme の大文字混在（`HTTPS://op` → 不可）
- host の大文字混在（`https://OP.example.com` → 不可）
- デフォルトポート（`https://op:443` → 不可、`http://127.0.0.1:80` → 不可）
- fragment（`https://op#x` → 不可）
- query（`https://op?x=1` → 不可）
- 非正規 path（`..`、`.`、重複スラッシュ — `path.Clean` で判定）

::: details なぜこんなに厳しいの？
RP の検証側でも、片側に正規形でない 1 文字が紛れただけでバイト一致が崩れ、ミックスアップ防御が静かに無効化されます。本番に届く前に構築時エラーとして弾くために、構築時に厳しめに正規化しています。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §9</a>。
:::

<div id="fapi" class="faq-anchor"></div>

## FAPI 2.0

### `op.WithProfile(profile.FAPI2Baseline)` で具体的に何が ON になる？

1 行で、仕様が要求する 6 つのスイッチがまとめて入ります:

| スイッチ | 効果 |
|---|---|
| feature 有効化 | `feature.PAR` と `feature.JAR` を ON。`feature.MTLS` が明示されていなければ `feature.DPoP` を既定選択 |
| クライアント認証 | `token_endpoint_auth_methods_supported` を `private_key_jwt` に絞り込み |
| alg 制約 | 署名 alg を FAPI 部分集合にロック |
| `redirect_uri` | 完全一致を強制(ワイルドカード不可) |
| PKCE | すべての code 要求で必須 |
| `state` / `nonce` | すべての authorize 要求でいずれか必須 |

::: warning プロファイル指定後にこれらと矛盾するオプションを重ねると、`op.New` がエラーを返します。
プロファイルは意図的に剛直 — 黙って緩めると FAPI 2.0 が買ってくれる監査保証が崩れるためです。
:::

### Baseline と Message Signing — どちらが必要？

| Baseline | Message Signing |
|---|---|
| PAR + JAR + PKCE + DPoP / mTLS | + JARM（署名付き authorization 応答） |

RP 側で **非否認性 (non-repudiation)** — authorize 要求 / 応答の署名による否認防止、オープンバンキングの監査連鎖など — が必要なら Message Signing。それ以外は Baseline で足ります。

### DPoP なしで FAPI 2.0 を回せる？

可能です。`feature.MTLS` を有効化し、`op.WithMTLSProxy(...)` で proxy からの証明書ヘッダを構成すれば mTLS 送信者バインディングに切り替わります。FAPI 2.0 §3.1.4 は「DPoP **または** mTLS」を要求しますが、FAPI クライアントは `/token` クライアント認証には引き続き `private_key_jwt` を使います。

<div id="tokens" class="faq-anchor"></div>

## トークンとローテーション

### リフレッシュトークンのリトライで `invalid_grant` が返る — 既に通信中だったのに

ローテーション後の **猶予期間 (grace period)** に守られているケースです。デフォルトは 60 秒。ローテーションのネットワーク往復が落ちても、猶予期間内に前のリフレッシュトークンを提示すれば、新しいアクセストークンを返します（再ローテーションは発生しません）。期間を過ぎたか、再利用検知で chain が失効しているケースでは `invalid_grant` になります。

::: details 期間を調整したいとき
`op.WithRefreshGracePeriod(90 * time.Second)` で延長できます。`op.WithRefreshGracePeriod(0)` で猶予期間を完全に無効化(厳密な single-use)にできます。負値はオプション側で拒否されます。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §2</a>。
:::

### リフレッシュトークンが返ってこないのはなぜ？

既定では次の **2 つ両方** が必要です。

1. 付与された scope に `openid` が含まれている。
2. クライアントの `GrantTypes` に `refresh_token` が含まれている。

どちらかが欠けると、トークンエンドポイントは `access_token` + `id_token` を返して成功扱いとなり、`refresh_token` フィールドは付きません。OIDC Core 1.0 §11 の既定(lax)の解釈では、`offline_access` はリフレッシュトークン受領の必須条件では **ありません** — offline 用の TTL bucket を選び、同意・監査の表示を形づくる役割です。

::: details `offline_access` を必須にしたい場合
OIDC Core 1.0 §11 は狭い解釈も許容しており、その場合は付与 scope に `offline_access` があるときだけリフレッシュトークンを発行します。「同意 UI が約束した範囲」と「監査ログに残る範囲」を初期状態から完全に一致させたいなら `op.WithStrictOfflineAccess()` で opt-in してください。ただしその際は、stay-signed-in を求める RP がすべて明示的に `offline_access` を要求する必要があります。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §3</a>。
:::

### 「ログイン状態の維持」と通常セッションを TTL で分けたい

`op.WithRefreshTokenOfflineTTL(...)` で `offline_access` chain と通常ローテーションの TTL を分離できます。`token.issued` 監査イベントが `extras.offline_access=true` を出力するので、SOC ダッシュボードで chain を分けて可視化できます。

<div id="dpop" class="faq-anchor"></div>

## DPoP と送信者制約

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

意図的です。DPoP の discovery リストは `ES256, EdDSA, PS256` で、コードベース全体の JOSE 許可リストよりも狭くしています。この許可リストは OP が client assertion や JAR request object を**検証する**ときの集合で、DPoP proof はそこから FAPI が推奨する部分集合に絞っています。なお `RS256` は OP 側の署名アルゴリズムでもありません。OP が発行するトークンの署名は `ES256` のみで、これは 1.x 系の恒久的な方針であり、未実装の穴ではありません。

<div id="storage" class="faq-anchor"></div>

## ストレージ

### 既存の users テーブルを置き換えないといけない？

いいえ。ライブラリは `users` テーブルを直接読み書きしません。`op.Authenticator`（または同梱の TOTP step を使う構成）と `store.UserStore` を既存スキーマに合わせて実装するだけです。OP は「このクレデンシャルは有効か」「この subject にはどんな claim があるか」を尋ねるだけで、それ以外で users テーブルに触ることはありません。

### どのストレージアダプタを選べばいい？

| アダプタ | 想定 |
|---|---|
| `inmem` | テスト、demo、単一プロセス開発 |
| `sql`（SQLite / MySQL / Postgres） | 単一の永続バックエンド。最短で本番に乗せられる選択 |
| `redis`（揮発サブストア専用） | `composite` で `sql` と組み合わせ、hot / cold を分離 |
| `composite` | hot / cold 分離。「永続バックエンドは 1 つ」を構築時に強制 |
| `dynamodb` | サブストアごとに 1 テーブルを使う永続バックエンド。`store.Transactional` によりブラウザ認可コードフローも動作する。API は Experimental。 |

<a class="doc-ref" href="/ja/use-cases/sql-store">SQL ストア</a>、<a class="doc-ref" href="/ja/use-cases/dynamodb-store">DynamoDB ストア</a>、<a class="doc-ref" href="/ja/use-cases/hot-cold-redis">Hot / Cold 分離</a> を参照。

### `composite.New` が起動時に設定を拒否する

トランザクションクラスタの不変条件があるためです — トランザクション系サブストア（clients / codes / リフレッシュトークン / アクセストークン / IATs）は **同じ** バックエンドを共有する必要があります。揮発スライス（sessions / DPoP nonce キャッシュ / JAR `jti` レジストリ）だけが別バックエンドに置けます。`composite.New` は構築時にこれを検証し、トランザクションを 2 つのストアに跨がせる設定を拒否します。

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

`WithCORSOrigins` を呼ばない場合、登録済み redirect URI から許可リストが自動導出されます。詳細は <a class="doc-ref" href="/ja/use-cases/cors-spa">SPA 向け CORS</a>。

### ライブラリを fork せずに同意画面をカスタマイズしたい

可能です。主な経路は次の 3 つです。

- **同梱 HTML ドライバを残し、ロケール bundle で文言を上書き。** `op.WithLocale` を使うと、seed の `en` / `ja` bundle 上に変更したいキーだけを重ねられます — 同意画面の文言はこのキー単位の上書きでカバーできるので、ブランド・コピー差し替えはこちらで足ります。詳細は [使い方: i18n / ロケール解決](/ja/use-cases/i18n)。
- **`op.WithConsentUI` でテンプレートを差し替える。** OP は組み込み側の `*html/template.Template` を `ConsentTemplateData` で描画し、state / CSRF / 同意永続化は引き続き OP が担当します。詳細は [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui)。
- **JSON ドライバに切り替えて画面ごと自前で描画。** `op.WithInteractionDriver(interaction.JSONDriver{})` を渡すと同意プロンプトが JSON で返るので、自前のページ（または SPA）で描画できます。詳細は [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction)。

<div id="auth-mfa" class="faq-anchor"></div>

## 認証と MFA

### パスワード / TOTP / passkey の検証はどこにある？

ライブラリは `op.PrimaryPassword`、`op.StepTOTP`、`op.RuleAlways` などのビルディングブロックを提供します。これらを `op.LoginFlow` に組み合わせて、どの factor をどの順で実行するかを決めます。クレデンシャルストレージは `store.UserPasswords()` / `store.TOTPs()` などを組み込み側で実装します。完全カスタムな factor が必要なら `op.Authenticator` を実装してください。詳細は [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) 以降を参照してください。

### Step-up 認証はどう実装する？

クライアント別ポリシーで `op.RuleACR(level)` を使います。RP が現セッションよりも高い `acr_values` を要求すると、OP は `WWW-Authenticate: error="insufficient_user_authentication"`（RFC 9470）を返します。セッションは authenticator チェーンを通って step-up し、その後再開します。詳細は [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up)。

### リスクベース MFA は？

`op.RuleRisk(...)` が、組み込み側で用意する `RiskAssessor` の評価結果を受け取ります。`RiskOutcome` は明示的な `RiskScore` を持ちます。詳細は [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa)。

<div id="logout" class="faq-anchor"></div>

## ログアウト

### Front-Channel Logout が無いのはなぜ？

モダンブラウザの既定（third-party cookie の段階廃止、`SameSite=Lax` 既定など）が、Front-Channel Logout 1.0 / Session Management 1.0 が要求する「iframe ベースのセッション通知」を実質的に動かなくしました。ライブラリは代わりに RP-Initiated Logout 1.0 + Back-Channel Logout 1.0 を提供しています。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §5</a>。

### Back-Channel Logout の fan-out で一部の RP に届かない

セッションが揮発ストアに置かれているケースで起こります。fan-out が走る前にセッションレコードが追い出された場合（Redis TTL がネットワーク分断中に切れたなど）、ライブラリはレコードを再構成できません。

`op.AuditBCLNoSessionsForSubject` 監査イベントがそのギャップを記録し、`op.WithSessionDurabilityPosture` で設定したポスチャと組み合わせることで、SOC ダッシュボードで「揮発配置における想定内のギャップ」と「永続配置における想定外のギャップ」を区別できます。揮発配置における best-effort は設計上の挙動です — 詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §10</a>。

<div id="native-loopback" class="faq-anchor"></div>

## ネイティブアプリとループバック

### CLI の `127.0.0.1:54312/cb` 形式の redirect_uri が拒否された

デフォルトの redirect-URI マッチはバイト完全一致(OAuth 2.1 / FAPI 2.0)です。ループバックのポートワイルドカード(RFC 8252 §7.3)は **クライアント単位でオプトイン** — 登録済みの `redirect_uris` にループバック URI を含めれば、scheme が `http`、登録済 host がループバック形(`127.0.0.1` / `::1`、登録側オプトインがある場合は文字列 `localhost`)、要求側 host が登録 host と一致し、path / query / fragment が完全一致のときに限り、ポート不一致を許容します。文字列 `localhost` の受理は登録時オプトイン(web クライアントは `op.WithAllowLocalhostLoopback()`、native クライアントは `application_type=native`)が前提です。literal IP のみの厳格な構えを保ちたいデプロイは、両方のオプトインを外したままにしておけば従来どおりの挙動になります。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §4</a>。

<div id="observability" class="faq-anchor"></div>

## 観測性

### `op.WithPrometheus(...)` を設定したのに `/metrics` が無い

ライブラリは `/metrics` を **マウントしません**。`op.WithPrometheus(reg)` は OP が絞り込んで保持するカウンタを、利用者が渡した registry に登録するだけです。

HTTP ルートのマウントはルーター側の責務です — トレーシング(外側で `otelhttp.NewMiddleware` をラップする)も、リクエスト所要時間ヒストグラム(外側でミドルウェアをラップする)も同じ分離方針です。OP は **OIDC 業務系の** カウンタ / スパン / 監査イベントのみを発行し、HTTP ライフサイクルの観測は組み込み側に委ねます。

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
| `client_authn.*` / `introspection.*` | クライアント認証 / イントロスペクション |
| `account.*` / `federation.*` / `recovery.*` | アカウント管理フィード |
| `rate_limit.*` / `pkce.*` / `redirect_uri.*` / `alg.*` / `cors.*` / `dpop.*` / `key.*` | 防御シグナル |

各イベントは `request-id` / `subject` / `client-id` を必ず持ち、加えてカテゴリ別フィールドを持つ `extras` map を運びます。購読は `op.WithAuditLogger(...)`（`*slog.Logger`）経由で行い、構造化ログエントリとしてカタログ名と `extras` 属性が記録されます。

<div id="conformance" class="faq-anchor"></div>

## 適合性とバージョン

### OFCS 適合状況に PASSED だけでなく REVIEW も出るのはなぜ？

OFCS は複数の結果を記録します。raw の `FAILED` は通常、suite が期待結果を観測できなかったことを示します。strict verifier がレビュー済みかつ期限内の exclusion と照合した場合だけ、直ちに release blocker にはなりません:

| 判定 | 意味 |
|---|---|
| `PASSED` | テスト実行 / OP は仕様どおりに振る舞った |
| `REVIEW` | テスト実行 / OP は正しく振る舞った — 人間が UI 成果物（描画されたエラーページのスクリーンショット等）を目視確認する必要がある |
| `FAILED` | module が suite の期待結果に到達しなかった。レビュー済み・期限付き exclusion がなければ release を止める。 |

本ハーネスは `REVIEW` を自動 pass にせず、そのまま記録します。v1.0.0 の 9 plan snapshot には raw failure が 6 件、終端結果なしが 2 件あり、いずれも release verifier が明示的にレビューしています。完全な内訳は <a class="doc-ref" href="/ja/compliance/ofcs">OFCS 適合状況</a> を参照してください。

### 「OIDF 認証取得済み」と称してよい？

不可です。本プロジェクトは OpenID Foundation の会員費を支払っておらず、公式認証も取得していません。OFCS のベースラインは仕様適合性の再現可能なスナップショットであって、認証ではありません。詳細は <a class="doc-ref" href="/ja/security/posture">セキュリティ方針</a>を参照してください。

### バージョンを固定すべき?

すべきです。本番依存は `go.mod` で固定し、更新前に [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) を確認してください。v1 の公開 Go API は Semantic Versioning に従うので、破壊的変更にはメジャーバージョンが必要です。`Experimental:` マーカー付き API は例外です。

<div id="errors" class="faq-anchor"></div>

## よくあるエラー

### `invalid_request: redirect_uri does not match a registered URI`

redirect-URI 完全一致に引っかかっています。よくある原因 3 つ:

1. 末尾スラッシュのドリフト（`/cb` と `/cb/`）。
2. デフォルトポートが片側だけ含まれる（`https://rp.example.com:443/cb` と `https://rp.example.com/cb`）。
3. CLI / ネイティブアプリのループバックで、RFC 8252 §7.3 のオプトインをしていない（前述）。

### `invalid_client: alg not allowed`

クライアントの `request_object_signing_alg` / `token_endpoint_auth_signing_alg` がコードベースの許可リスト（`RS256`、`PS256`、`ES256`、`EdDSA`）に含まれていません。FAPI 2.0 plan ではクライアントを `PS256`（または `ES256` / `EdDSA`）に絞り込んでください — FAPI 2.0 は `RS256` を禁じています。

### `invalid_dpop_proof: jkt mismatch`

DPoP proof の公開鍵 thumbprint（RFC 7638）が、アクセストークンにバインドされた `cnf.jkt` と一致しません。これは送信者バインディングが正しく機能している証拠で、proof が違う鍵で生成されたか、アクセストークンが別クライアント向けかのどちらかです。

### `/par` 成功後に `invalid_request_uri` が返る

認可コード発行後に `/authorize?request_uri=…` へ再度アクセスしています。`request_uri` はコード発行時点で one-time として消費されます（RFC 9126 §2.2、詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §1</a>）。`/par` をやり直して新しい URI を発行してください。

<div id="adoption" class="faq-anchor"></div>

## 採用判断

### 本番で使ってよい？

<a class="doc-ref" href="/ja/security/posture">セキュリティ方針</a> — 特に「ここに **無い** もの」のセクション — を読んでから判断してください。短くいえば、RP / OP / ユーザを自社管理する内部用途には適合します。第三者監査トレイルや公式認証が出荷条件にあるなら、本ライブラリは選ばないでください。

### セキュリティ問題はどう報告する？

[GitHub Security Advisories](https://github.com/libraz/go-oidc-provider/security/advisories/new) からプライベートに報告してください。完全なポリシーは <a class="doc-ref" href="/ja/security/disclosure">脆弱性報告ガイド</a> を参照してください。
