---
title: FAQ
description: ライブラリ作者が examples を書きながら / Conformance 検査を回しながら実際にハマった箇所を集めた FAQ。
outline: 2
---

# FAQ

このページは「最初に見るべき場所」のひとつです。下に並んでいる質問は理屈ではなく、Maintainer が examples を書いたり Conformance ハーネスを回したりする途中で実際にハマったものばかりです。

<ul class="faq-index">
  <li><a href="#setup-basics"><div class="faq-index-title">セットアップと基本</div><div class="faq-index-desc">必須 4 オプション、マウント先、Issuer 正規化、最小構成</div></a></li>
  <li><a href="#fapi"><div class="faq-index-title">FAPI 2.0</div><div class="faq-index-desc">Baseline と Message Signing、DPoP / mTLS の選択</div></a></li>
  <li><a href="#tokens"><div class="faq-index-title">トークンとローテーション</div><div class="faq-index-desc">リフレッシュ rotation の grace、<code>offline_access</code>、TTL 分離</div></a></li>
  <li><a href="#dpop"><div class="faq-index-title">DPoP と送信者制約</div><div class="faq-index-desc">DPoP nonce の配布、対応アルゴリズムの絞り込み理由</div></a></li>
  <li><a href="#storage"><div class="faq-index-title">ストレージ</div><div class="faq-index-desc">既存 users テーブルの扱い、アダプタ選択、composite の制約</div></a></li>
  <li><a href="#ui-spa"><div class="faq-index-title">UI と SPA</div><div class="faq-index-desc">SPA 駆動（React / Vue / Svelte / …）、CORS、同意画面のカスタム</div></a></li>
  <li><a href="#auth-mfa"><div class="faq-index-title">認証と MFA</div><div class="faq-index-desc">パスワード / TOTP / passkey、step-up、リスクベース</div></a></li>
  <li><a href="#logout"><div class="faq-index-title">ログアウト</div><div class="faq-index-desc">Front-Channel を持たない理由、Back-Channel fan-out のギャップ</div></a></li>
  <li><a href="#native-loopback"><div class="faq-index-title">ネイティブアプリとループバック</div><div class="faq-index-desc"><code>127.0.0.1</code> redirect_uri のオプトイン</div></a></li>
  <li><a href="#observability"><div class="faq-index-title">観測性</div><div class="faq-index-desc"><code>/metrics</code> を自動マウントしない理由、監査イベントカタログ</div></a></li>
  <li><a href="#conformance"><div class="faq-index-title">適合性とバージョン</div><div class="faq-index-desc">REVIEW の意味、認証の称し方、pre-v1.0 のバージョン固定方針</div></a></li>
  <li><a href="#errors"><div class="faq-index-title">よくあるエラー</div><div class="faq-index-desc"><code>redirect_uri</code> 不一致、<code>alg not allowed</code>、<code>jkt mismatch</code></div></a></li>
  <li><a href="#adoption"><div class="faq-index-title">採用判断</div><div class="faq-index-desc">本番投入の可否、セキュリティ報告の経路</div></a></li>
</ul>

<div id="setup-basics" class="faq-anchor"></div>

## セットアップと基本

### `op.New(...)` がエラーを返すのはなぜ？

必須 4 オプションに「安全なデフォルト」が存在しないためです。ゼロ値で黙って動くのではなく、`op.New` は構築時にエラーを返して止めます:

| オプション | これが無いと |
|---|---|
| `WithIssuer` | OP が署名 / 名前空間に使う識別子が無い |
| `WithStore` | clients / codes / tokens の永続化先が無い |
| `WithKeyset` | ID トークンに署名できない |
| `WithCookieKeys` | session / CSRF cookie を封緘できない |

エラーは欠けた項目名を明示するので、起動時のタイポは「実行時の謎」ではなくビルド時エラーになります。

::: tip 推奨パターン
32 バイトの cookie 鍵を環境ごとに 1 度 `crypto/rand` で生成し、config / シークレットマネージャー経由で渡してください。標準的な 30 行のセットアップは [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) を参照。
:::

### OP はどこにマウントすればいい？ prefix を変えても大丈夫？

`http.Handler` をマウントしたパスにそのまま乗ります。既定のマウントプリフィックスは `/oidc` で、ルートに置きたい場合は `op.WithMountPrefix("/")`、`/auth` に動かしたい場合は `op.WithMountPrefix("/auth")` を渡します。Discovery document には設定された issuer + マウント prefix が埋め込まれるので、RP からは一貫した URL として見えます。

### 最小構成は？

```go
handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(myKeyset),
    op.WithCookieKeys(cookieKey), // 32 バイト
)
```

4 オプションのみ、暗黙のデフォルトはなし。詳細は <a class="doc-ref" href="/ja/getting-started/minimal">最小構成 OP</a>。

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
| feature 有効化 | `feature.PAR` と `feature.DPoP` を ON |
| クライアント認証 | `token_endpoint_auth_methods_supported` を FAPI 許可リスト(`private_key_jwt` / `tls_client_auth` / `self_signed_tls_client_auth`)に絞り込み |
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
| PAR + PKCE + DPoP / mTLS | + JAR（署名付き authorization 要求） |
|  | + JARM（署名付き authorization 応答） |

RP 側で **非否認性 (non-repudiation)** — authorize 要求 / 応答の署名による否認防止、オープンバンキングの監査連鎖など — が必要なら Message Signing。それ以外は Baseline で足ります。

### DPoP なしで FAPI 2.0 を回せる？

可能です。`feature.MTLS` を有効化し、FAPI クライアントを `tls_client_auth` / `self_signed_tls_client_auth` で構成すれば mTLS 送信者バインディングに切り替わります。FAPI 2.0 §3.1.4 は「DPoP **または** mTLS」を要求しており、本ライブラリはどちらでも受理します。

<div id="tokens" class="faq-anchor"></div>

## トークンとローテーション

### リフレッシュトークンのリトライで `invalid_grant` が返る — 既に通信中だったのに

ローテーション後の **猶予期間 (grace period)** に守られているケースです。デフォルトは 60 秒。ローテーションのネットワーク往復が落ちても、猶予期間内に前のリフレッシュトークンを提示すれば、新しいアクセストークンを返します（再ローテーションは発生しません）。期間を過ぎたか、再利用検知で chain が失効しているケースでは `invalid_grant` になります。

::: details 期間を調整したいとき
`op.WithRefreshGracePeriod(90 * time.Second)` で延長できます。`op.WithRefreshGracePeriod(0)` で猶予期間を完全に無効化(厳密な single-use)にできます。負値はオプション側で拒否されます。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §2</a>。
:::

### リフレッシュトークンが返ってこないのはなぜ？

次の **3 つすべて** が必要です。

1. 付与された scope に `openid` が含まれている。
2. 付与された scope に `offline_access` が含まれている。
3. クライアントの `GrantTypes` に `refresh_token` が含まれている。

ひとつでも欠けると、トークンエンドポイントは `access_token` + `id_token` を返して成功扱いとなり、`refresh_token` フィールドは付きません。

::: details なぜ既定が厳しい解釈なの？
OIDC Core 1.0 §11 は `offline_access` 無しでもリフレッシュトークンを発行できる余地を残していますが、それを許すと「同意 UI が約束した範囲」と「監査ログに残る範囲」がずれます。本ライブラリは両者が初期状態から一致するように、狭い解釈を既定にしています。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断 §3</a>。
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

意図的です。DPoP の discovery リストは `ES256, EdDSA, PS256` で、コードベース全体の JOSE allow-list よりも狭くしています。`RS256` は ID トークン署名では使えますが、DPoP proof は FAPI が推奨する部分集合に絞っています。

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
| `dynamodb` | 予定（v1.x） |

<a class="doc-ref" href="/ja/use-cases/sql-store">SQL ストア</a> と <a class="doc-ref" href="/ja/use-cases/hot-cold-redis">Hot / Cold 分離</a> を参照。

### `composite.New` が起動時に設定を拒否する

トランザクションクラスタの不変条件があるためです — トランザクション系サブストア（clients / codes / リフレッシュトークン / アクセストークン / IATs）は **同じ** バックエンドを共有する必要があります。揮発スライス（sessions / DPoP nonce キャッシュ / JAR `jti` レジストリ）だけが別バックエンドに置けます。`composite.New` は構築時にこれを検証し、トランザクションを 2 つのストアに跨がせる設定を拒否します。

<div id="ui-spa" class="faq-anchor"></div>

## UI と SPA

### SPA からログイン / 同意を駆動するには？

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

op.WithInteractionDriver(interaction.JSONDriver{})
```

JSON ドライバは、HTML ドライバが使う `/interaction/{uid}` と同じパスで各プロンプト(`login` / `consent.scope` / `chooser` ほか)を JSON として返します。SPA(React / Vue / Svelte / Angular / vanilla、フレームワーク不問)はそこから prompt を取得し、`{state_ref, values}` を `X-CSRF-Token` ヘッダ(`prompt.csrf_token` をそのまま返す double-submit cookie)と共に POST、終端で返る `{type:"redirect", location}` エンベロープを `window.location.href` で辿れば完了です。

::: warning UI マウントオプションはまだ未実装
`op.WithSPAUI` / `op.WithConsentUI` / `op.WithChooserUI` は v1.0 向けの型予約のみで、現状で設定すると `op.New` が構成エラーを返します。これらが着地するまでは、SPA shell と静的アセットは自前のルーターからマウントし、prompt JSON だけ OP に任せてください。詳細は [SPA / カスタム interaction](/ja/use-cases/spa-custom-interaction) と [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login)。
:::

::: details SPA-safe なエラー描画
エラーページは CSP `default-src 'none'; style-src 'unsafe-inline'` の下で `<div id="op-error" data-code="..." data-description="...">` を出力するので、SPA ホストはマークアップを parse することなく selector で取得できます。
:::

### CORS — SPA の origin を許可するには？

```go
op.WithCORSOrigins("https://app.example.com")
```

`WithCORSOrigins` を呼ばない場合、登録済み redirect URI から allowlist が自動導出されます。詳細は <a class="doc-ref" href="/ja/use-cases/cors-spa">SPA 向け CORS</a>。

### ライブラリを fork せずに同意画面をカスタマイズしたい

`op.WithConsentUI` 経由ではまだ不可です。型は v1.0 向けに予約されていますが、現状は `op.New` が拒否します。それまでに使える経路は次の 2 つです。

- **同梱 HTML ドライバを残し、ロケール bundle で文言を上書き。** `op.WithLocale` を使うと、seed の `en` / `ja` bundle 上に変更したいキーだけを重ねられます — 同意画面の文言はこのキー単位の上書きでカバーできるので、ブランド・コピー差し替えはこちらで足ります。詳細は [ユースケース: i18n / ロケールネゴシエーション](/ja/use-cases/i18n)。
- **JSON ドライバに切り替えて markup ごと自前で描画。** `op.WithInteractionDriver(interaction.JSONDriver{})` を渡すと同意プロンプトが JSON で返るので、自前のページ（または SPA）で描画できます。詳細は [SPA / カスタム interaction](/ja/use-cases/spa-custom-interaction)。

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

### README に「138 PASSED, 0 FAILED」とあるけど、OFCS UI には REVIEW も出る

OFCS の判定は 3 値で、OP の不具合と言えるのは `FAILED` だけです:

| 判定 | 意味 |
|---|---|
| `PASSED` | テスト実行 / OP は仕様どおりに振る舞った |
| `REVIEW` | テスト実行 / OP は正しく振る舞った — 人間が UI 成果物（描画されたエラーページのスクリーンショット等）を目視確認する必要がある |
| `FAILED` | OP が誤った挙動を返した |

本ハーネスは `REVIEW` を自動 pass にせず、そのまま記録します。本ライブラリの `FAILED` はゼロです。完全な内訳は <a class="doc-ref" href="/ja/compliance/ofcs">OFCS 適合状況</a> を参照してください。

### 「OIDF 認証取得済み」と称してよい？

不可です。本プロジェクトは OpenID Foundation の会員費を支払っておらず、公式認証も取得していません。OFCS のベースラインは仕様適合性の再現可能なスナップショットであって、認証ではありません。詳細は <a class="doc-ref" href="/ja/security/posture">セキュリティ方針</a>を参照してください。

### Pre-v1.0 — バージョンを固定すべき?

すべきです。v1.0 までは公開 Go API が任意の minor リリースで破壊的変更を受ける可能性があります。`go.mod` でバージョンタグを固定し、バージョン更新のたびに [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) を確認してください。`BREAKING` エントリを必ず明示するのがプロジェクトの約束です。

<div id="errors" class="faq-anchor"></div>

## よくあるエラー

### `invalid_request: redirect_uri does not match a registered URI`

redirect-URI 完全一致に引っかかっています。よくある原因 3 つ:

1. 末尾スラッシュのドリフト（`/cb` と `/cb/`）。
2. デフォルトポートが片側だけ含まれる（`https://rp.example.com:443/cb` と `https://rp.example.com/cb`）。
3. CLI / ネイティブアプリのループバックで、RFC 8252 §7.3 のオプトインをしていない（前述）。

### `invalid_client: alg not allowed`

クライアントの `request_object_signing_alg` / `token_endpoint_auth_signing_alg` がコードベースの allow-list（`RS256`、`PS256`、`ES256`、`EdDSA`）に含まれていません。FAPI 2.0 plan ではクライアントを `PS256`（または `ES256` / `EdDSA`）に絞り込んでください — FAPI 2.0 は `RS256` を禁じています。

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
