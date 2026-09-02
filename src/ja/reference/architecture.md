---
title: アーキテクチャ概観
description: リクエストが OP の中をどう流れるか — パッケージ構成、ハンドラ、browser/M2M discovery の境界、origin 検査、LoginFlow の risk 評価、ストレージの差し込み口。
outline: 2
pageClass: pg-reference-architecture
---

# アーキテクチャ概観

`op.New(...)` は `http.ServeMux` を内部に持つ `http.Handler` を返します。本ページでは、リクエスト到着からレスポンスまでの間に OP が何を実行するか、関わるパッケージ、検証の順序、組み込み側が制御するストレージの差し込み口を整理します。

## パッケージ構成

```
op/                         ← 公開 API 表面(組み込み側はここを import)
op/profile/                 ← FAPI 2.0 / 将来のプロファイル
op/feature/                 ← PAR / DPoP / mTLS / introspect / revoke / DCR / JAR
op/grant/                   ← authorization_code、refresh_token、client_credentials
op/store/                   ← Store interface(サブストアの集合)+ contract test suite
op/storeadapter/{inmem,sql,redis,composite}
op/interaction/             ← ログイン UI 用 HTML / JSON ドライバの差し込み口

internal/                   ← 外部からは import 不可(Go の可視性)
  authn/                    ← LoginFlow オーケストレータ、Authenticator runtime
  authorizeendpoint、parendpoint、tokenendpoint、userinfo、
  introspectendpoint、revokeendpoint、registrationendpoint、
  endsession、backchannel
  jose、jwks、keys          ← 署名 / 検証 / 鍵セット
  jar、dpop、mtls、pkce、sessions
  cookie、csrf、cors、httpx、redact、log、metrics
  discovery、scoperegistry、timex、i18n
```

境界は構造的に強制されています。外部コードは `internal/` に届きません。組み込み側が制御する差し込み口（オプション、store interface、authenticator、audit subscriber）はすべて `op/` 配下にあります。

## ルート一覧

`op.New` は `*http.ServeMux` を構築し、設定されたパスごとにハンドラを 1 つ登録します。既定のパスと、その裏にあるパッケージは次のとおりです。

| パス | ハンドラのパッケージ | 何を返すか | 公開条件 |
|---|---|---|---|
| `/.well-known/openid-configuration` | `internal/discovery` | OP の実効設定を discovery 文書として返す | 常時 |
| `/jwks` | `internal/jwks` | 署名鍵セットの公開側（設定時は `use=enc` 鍵も） | 常時 |
| `/auth` | `internal/authorizeendpoint` | リクエストの解析、クライアントと `redirect_uri` の検証、interaction へのリダイレクト | `authorization_code` grant が有効な場合 |
| `/interaction/{uid}` | `internal/authorizeendpoint` + `op/interaction` ドライバ | ログインと同意の ceremony。HTML で描画するか、SPA へ JSON で返す | `/auth` と同時 |
| `/par` | `internal/parendpoint` | pushed authorization request を受け取り、一度限りの `request_uri` を返す | `feature.PAR` |
| `/token` | `internal/tokenendpoint` | クライアント認証、認可コードとリフレッシュトークンの引き換え、トークン発行 | 常時 |
| `/userinfo` | `internal/userinfo` | 提示されたアクセストークンが指す subject の claim | 常時 |
| `/revoke` | `internal/revokeendpoint` | RFC 7009 によるリフレッシュトークン / アクセストークンの失効 | `feature.Revoke` |
| `/introspect` | `internal/introspectendpoint` | RFC 7662 によるトークン状態を、認可済みのリソースサーバへ返す | `feature.Introspect` |
| `/end_session` | `internal/endsession` | RP 起点のログアウト。バックチャネルの一斉通知もここから | session manager を設定したとき |
| `/register` | `internal/registrationendpoint` | 動的クライアント登録と、クライアントごとの管理ルート | `WithDynamicRegistration` |

バックチャネルログアウトに行がないのは、公開されるエンドポイントではないからです。`/end_session` から発火する送信専用の一斉通知であり、OP が各 RP の登録済み `backchannel_logout_uri` へ logout token を POST します。discovery 文書は実際に公開されたエンドポイントだけを広告するので、`feature.Introspect` を有効にしていない構成では `/introspect` を一切告知しません。

## クロスカットなミドルウェア

すべてのハンドラは以下にラップされます:

| Layer | ソース | 役割 |
|---|---|---|
| **CORS** | `internal/cors` | discovery と `/jwks` は public CORS。`/userinfo`、`/token`、interaction / session の JSON 面、公開済みのプロトコルエンドポイント（`/par`、`/revoke`、`/introspect`、`/register`、`/bc-authorize`、`/device_authorization`、`/end_session` など）は厳格な許可リスト |
| **信頼プロキシ** | `internal/httpx` | `WithTrustedProxies` を元に、`X-Forwarded-*` / `Forwarded` から実クライアント IP を解決 |
| **Cookie** | `internal/cookie` | `__Host-` プリフィックス、AES-256-GCM、session は `SameSite=Lax`、互換可能なところは `Strict` |
| **CSRF** | `internal/csrf` | consent / logout の POST に対して double-submit + Origin / Referer チェック |

これらはオプションではありません。組み込み側のオプション設定に関係なく構造的に適用されます。

origin の集合は意図的に分かれています。API の CORS は明示的な `WithCORSOrigins` でのみ拡張され（API 互換性のため redirect URI の origin も含まれます）、interaction と end-session の ceremony 検査は issuer origin と明示的な origin だけを許可します。redirect URI の origin だけで cross-origin interaction / logout POST が許可されることはありません。

## Authorize → token のライフサイクル

最も流量の多いパスです。概略は次のとおりです。

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<figure class="fig">
  <div class="fig-head">authorize から token まで — ストアと LoginFlow を含めて</div>
  <svg class="fig-svg" role="img" aria-labelledby="arch-lifecycle-title" viewBox="0 0 960 700" xmlns="http://www.w3.org/2000/svg">
    <title id="arch-lifecycle-title">authorize リクエストからトークン応答までの正常系を、どの呼び出しがストアに届き、どの呼び出しが LoginFlow に届くかまで含めて示した図。最初の 2 段階はブラウザが進め、3 段階目は RP と OP の直接のバックチャネル通信です。</title>
    <rect class="fg-group" x="30" y="68" width="916" height="146" rx="8"/>
    <rect class="fg-group" x="30" y="222" width="916" height="236" rx="8"/>
    <rect class="fg-group" x="30" y="466" width="916" height="222" rx="8"/>
    <text class="fg-lbl" x="42" y="86">1 · authorize リクエスト</text>
    <text class="fg-lbl" x="42" y="240">2 · interaction</text>
    <text class="fg-lbl" x="42" y="484">3 · 認可コードの引き換え</text>
    <line class="fg-life" x1="106" y1="62" x2="106" y2="688"/>
    <line class="fg-life" x1="300" y1="62" x2="300" y2="688"/>
    <line class="fg-life fg-life--accent" x1="510" y1="62" x2="510" y2="688"/>
    <line class="fg-life" x1="710" y1="62" x2="710" y2="688"/>
    <line class="fg-life" x1="880" y1="62" x2="880" y2="688"/>
    <rect class="fg-box" x="36" y="16" width="140" height="42" rx="6"/>
    <text class="fg-t" x="106" y="35" text-anchor="middle">RP</text>
    <text class="fg-xs" x="106" y="49" text-anchor="middle">組み込み側のアプリ</text>
    <rect class="fg-box" x="230" y="16" width="140" height="42" rx="6"/>
    <text class="fg-t" x="300" y="35" text-anchor="middle">ブラウザ</text>
    <text class="fg-xs" x="300" y="49" text-anchor="middle">user agent</text>
    <rect class="fg-box fg-box--accent" x="430" y="16" width="160" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="510" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="510" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="640" y="16" width="140" height="42" rx="6"/>
    <text class="fg-t" x="710" y="35" text-anchor="middle">ストア</text>
    <text class="fg-xs" x="710" y="49" text-anchor="middle">組み込み側の実装</text>
    <rect class="fg-box" x="812" y="16" width="136" height="42" rx="6"/>
    <text class="fg-t" x="880" y="35" text-anchor="middle">LoginFlow</text>
    <text class="fg-xs" x="880" y="49" text-anchor="middle">組み込み側の実装</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="102" r="8.5"/>
    <text class="fg-badge-t" x="15" y="105" text-anchor="middle">1</text>
    <path class="fg-edge" d="M106,102 H300" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="203" y="96" text-anchor="middle">/authorize?… へリダイレクト</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="132" r="8.5"/>
    <text class="fg-badge-t" x="15" y="135" text-anchor="middle">2</text>
    <path class="fg-edge" d="M300,132 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="405" y="126" text-anchor="middle">GET /authorize</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="164" r="8.5"/>
    <text class="fg-badge-t" x="15" y="167" text-anchor="middle">3</text>
    <path class="fg-edge" d="M510,164 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="158" text-anchor="middle">Clients.GetClient · redirect_uri の完全一致</text>
    <!-- 4 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="196" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="199" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M510,188 h28 v16 h-28" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="550" y="200">PKCE · scope · response_type の検査</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="266" r="8.5"/>
    <text class="fg-badge-t" x="15" y="269" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--accent" d="M510,266 H300" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="405" y="260" text-anchor="middle">302 → /interaction/{uid}</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="298" r="8.5"/>
    <text class="fg-badge-t" x="15" y="301" text-anchor="middle">6</text>
    <path class="fg-edge" d="M300,298 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="405" y="292" text-anchor="middle">POST /interaction/{uid} — ログイン</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="330" r="8.5"/>
    <text class="fg-badge-t" x="15" y="333" text-anchor="middle">7</text>
    <path class="fg-edge" d="M510,330 H880" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="695" y="324" text-anchor="middle">Begin / Continue — Step チェーン</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="362" r="8.5"/>
    <text class="fg-badge-t" x="15" y="365" text-anchor="middle">8</text>
    <path class="fg-edge" d="M880,362 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="695" y="356" text-anchor="middle">Result — subject · AAL · AMR</text>
    <!-- 9 -->
    <circle class="fg-badge" cx="15" cy="394" r="8.5"/>
    <text class="fg-badge-t" x="15" y="397" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M510,394 H300" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="405" y="388" text-anchor="middle">200 同意画面</text>
    <!-- 10 -->
    <circle class="fg-badge" cx="15" cy="424" r="8.5"/>
    <text class="fg-badge-t" x="15" y="427" text-anchor="middle">10</text>
    <path class="fg-edge" d="M300,424 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="405" y="418" text-anchor="middle">POST /interaction/{uid} — 同意</text>
    <!-- 11 -->
    <circle class="fg-badge" cx="15" cy="452" r="8.5"/>
    <text class="fg-badge-t" x="15" y="455" text-anchor="middle">11</text>
    <path class="fg-edge" d="M510,452 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="446" text-anchor="middle">AuthorizationCodes.Save — code + PKCE</text>
    <!-- 12 -->
    <circle class="fg-badge" cx="15" cy="514" r="8.5"/>
    <text class="fg-badge-t" x="15" y="517" text-anchor="middle">12</text>
    <path class="fg-edge fg-edge--accent" d="M510,514 H300" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="405" y="508" text-anchor="middle">302 → redirect_uri?code&amp;state&amp;iss</text>
    <!-- 13 -->
    <circle class="fg-badge" cx="15" cy="544" r="8.5"/>
    <text class="fg-badge-t" x="15" y="547" text-anchor="middle">13</text>
    <path class="fg-edge" d="M300,544 H106" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="203" y="538" text-anchor="middle">code を持って到達する</text>
    <!-- 14 -->
    <circle class="fg-badge" cx="15" cy="586" r="8.5"/>
    <text class="fg-badge-t" x="15" y="589" text-anchor="middle">14</text>
    <path class="fg-edge" d="M106,586 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="308" y="566" text-anchor="middle">POST /token</text>
    <text class="fg-mxs fg-halo" x="308" y="579" text-anchor="middle">grant_type=authorization_code</text>
    <!-- 15 -->
    <circle class="fg-badge" cx="15" cy="624" r="8.5"/>
    <text class="fg-badge-t" x="15" y="627" text-anchor="middle">15</text>
    <path class="fg-edge" d="M510,624 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="604" text-anchor="middle">AuthorizationCodes.Consume</text>
    <text class="fg-xs" x="610" y="617" text-anchor="middle">続けて PKCE とクライアント認証を検証する</text>
    <!-- 16 -->
    <circle class="fg-badge" cx="15" cy="654" r="8.5"/>
    <text class="fg-badge-t" x="15" y="657" text-anchor="middle">16</text>
    <path class="fg-edge" d="M510,654 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="648" text-anchor="middle">AccessTokens.Register · RefreshTokens.Save</text>
    <!-- 17 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="682" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="685" text-anchor="middle">17</text>
    <path class="fg-edge fg-edge--accent" d="M510,682 H106" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs fg-halo" x="308" y="676" text-anchor="middle">200 · { access_token, id_token, refresh_token? }</text>
  </svg>
  <figcaption class="fig-note">右端の 2 レーンは組み込み側のものです。そこへ向かう矢印はすべてインタフェース呼び出しで、だからこそ中央のプロトコル処理に手を入れずに、保存先とログイン体験を差し替えられます。</figcaption>
</figure>
</div>

`/par` と `/end_session` も大筋は同じ形です。上記が標準的な成功経路です。

<a class="faq-anchor" id="loginflow-internals"></a>

## LoginFlow の内部

`WithLoginFlow(LoginFlow{...})` は構築時に内部のパイプラインへコンパイルされます:

```
LoginFlow {Primary, Rules[], Decider, Risk}
    │
    ▼ (compile)
internal/authn/CompiledLoginFlow
    ├── Primary  → Authenticator(Step descriptor → runtime 実装の解決)
    ├── Rules[]  → 順序付き (When, Then) ペア
    ├── Decider  → 任意の short-circuit
    └── Risk     → chain 開始時に 1 回、score を cache
```

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<figure class="fig">
  <div class="fig-head">LoginFlow — 宣言し、一度コンパイルし、リクエストごとに回す</div>
  <svg class="fig-svg" role="img" aria-labelledby="loginflow-title" viewBox="0 0 960 344" xmlns="http://www.w3.org/2000/svg">
    <title id="loginflow-title">WithLoginFlow に渡すのは仕様です。これは一度 CompiledLoginFlow にコンパイルされ、オーケストレータがリクエストごとにループで実行します。第一要素を開始し、画面を出し、Identity を確定し、Decider と Rules を評価し、発火するルールが無くなるまで繰り返します。</title>
    <text class="fg-lbl" x="40" y="26">宣言</text>
    <text class="fg-lbl fg-accent" x="334" y="26">一度だけコンパイル</text>
    <text class="fg-lbl" x="620" y="26">リクエストごとに実行</text>
    <rect class="fg-box" x="36" y="38" width="234" height="192" rx="8"/>
    <text class="fg-t2" x="56" y="64">LoginFlow</text>
    <text class="fg-xs" x="56" y="82">WithLoginFlow に渡すもの</text>
    <line class="fg-rule" x1="56" y1="94" x2="250" y2="94"/>
    <text class="fg-m" x="56" y="120">Primary</text>
    <text class="fg-xs" x="56" y="136">第一要素</text>
    <text class="fg-m" x="56" y="164">Rules[]</text>
    <text class="fg-xs" x="56" y="180">追加要素を求める条件</text>
    <text class="fg-m" x="56" y="208">Decider · Risk</text>
    <text class="fg-xs" x="56" y="224">AAL のポリシーとシグナル</text>
    <path class="fg-edge" d="M274,134 H326" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="300" y="127" text-anchor="middle">コンパイル</text>
    <rect class="fg-box fg-box--accent" x="330" y="38" width="244" height="192" rx="8"/>
    <text class="fg-t2 fg-accent" x="350" y="64">CompiledLoginFlow</text>
    <text class="fg-mxs" x="350" y="82">internal/authn</text>
    <line class="fg-rule" x1="350" y1="94" x2="554" y2="94"/>
    <text class="fg-mxs" x="350" y="120">primary</text>
    <text class="fg-mxs" x="350" y="146">rules</text>
    <text class="fg-mxs" x="350" y="172">decider</text>
    <text class="fg-mxs" x="350" y="198">risk</text>
    <text class="fg-xs" x="350" y="222">op.New の時点で解決・検証される</text>
    <path class="fg-edge fg-edge--accent" d="M578,134 H610" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="616" y="38" width="284" height="48" rx="6"/>
    <text class="fg-mxs" x="634" y="58">Primary.Begin → Step</text>
    <text class="fg-xs" x="634" y="76">チェーン開始時に 1 回</text>
    <path class="fg-edge fg-edge--thin" d="M758,88 V96" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="616" y="98" width="284" height="48" rx="6"/>
    <text class="fg-mxs" x="634" y="118">画面表示 → ユーザが送信</text>
    <text class="fg-xs" x="634" y="136">Step は 1 つずつ</text>
    <path class="fg-edge fg-edge--thin" d="M758,148 V156" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="616" y="158" width="284" height="48" rx="6"/>
    <text class="fg-mxs" x="634" y="178">Result が Identity を確定する</text>
    <text class="fg-xs" x="634" y="196">subject · AAL · AMR</text>
    <path class="fg-edge fg-edge--thin" d="M758,208 V216" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="616" y="218" width="284" height="48" rx="6"/>
    <text class="fg-mxs" x="634" y="238">LoginContext → Decider、続けて Rules</text>
    <text class="fg-xs" x="634" y="256">ルールが発火 → 次の Step へ</text>
    <path class="fg-edge" d="M904,242 H930 V122 H904" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M758,268 V276" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="616" y="278" width="284" height="48" rx="6"/>
    <text class="fg-t2 fg-accent" x="634" y="298">発火するルールが無い</text>
    <text class="fg-xs" x="634" y="316">セッションを発行する</text>
  </svg>
  <figcaption class="fig-note">先にコンパイルしておくことで、設定の誤りが実行時ではなく起動時のエラーになります。リクエストが届く頃には解釈すべきものは残っておらず、あとはチェーンを辿るだけです。</figcaption>
</figure>
</div>

各 authorize リクエストでは:

1. `Primary.Begin` が `interaction.Step`（Prompt または Result）を返します。
2. UI ドライバ（HTML または SPA）が画面を描画し、ユーザが送信します。
3. `Primary.Continue` が `Result`（`Identity` が確定している）まで進めます。
4. オーケストレータが `LoginContext` を組み立てます（subject、scope、完了したステップ、cache 済みのリスクスコア、ACR values）。
5. `Decider` が動きます（nil 以外の場合）。`Pass` 以外の判定はそこで短絡します。
6. それ以外は `Rules` を順に評価します。最初にマッチしたルールの `Step.Kind()` が `CompletedSteps` にまだ含まれていなければ発火します。
7. 発火するルールが無くなるまで繰り返し、その後にセッションを発行します。`LoginFlow.Risk` は chain ごとに最大 1 回だけ呼ばれ、結果は cache されます。provider-level の `WithRiskAssessor` は別の seam であり、`LoginFlow.Risk` と同時に指定すると、どちらかを黙って選ばず構築時に拒否されます。

`ExternalStep` 経由で自前の factor を差し込む手順は、[使い方: カスタム authenticator](/ja/use-cases/custom-authenticator) を参照してください。

## ストレージの差し込み口

ライブラリは、組み込み側の `users` テーブルを直接読み書きしません。`store.Store` interface(小さなサブストアの和集合)越しに会話します:

| サブストア | 何が入るか | 置き場所の目安 |
|---|---|---|
| `Clients` | OAuth クライアントレジストリ | 通常は永続 |
| `Users` | subject + claim | 組み込み側の実装。既存の users テーブルにマッピングすることが多い |
| `AuthorizationCodes` | one-shot な code(PKCE challenge、scope) | 永続 |
| `RefreshTokens` | リフレッシュトークンの連鎖、ローテーション履歴 | 永続 |
| `AccessTokens` | JWT id 側 / opaque token | 永続 |
| `OpaqueAccessTokens` | opaque AT lookup | 永続 |
| `Grants` | (user, client) ごとの consent scope | 永続 |
| `GrantRevocations` | 失効した grant の tombstone | 永続 |
| `Sessions` | ブラウザセッションのレコード | 揮発に置いてもよい |
| `Interactions` | 試行ごとの interaction 状態 | 揮発に置いてもよい |
| `ConsumedJTIs` | JAR / DPoP `jti` のリプレイ検出集合 | 揮発に置いてもよい |
| `PARs` | pushed authorization request | PAR が authorization-code transaction に参加する構成では永続 |
| `IATs` / `RATs` | DCR の Initial / Registration Access Token | 永続 |
| `DeviceCodes` | RFC 8628 のデバイス認可レコード | 永続 |
| `CIBARequests` | OpenID Connect CIBA の backchannel authentication レコード | 永続 |
| `Metadata` | OP 内部の key/value 状態（例: `subject_mode` マーカー） | 永続（未対応バックエンドは nil 可） |

「揮発に置いてもよい」サブストアは [`composite`](/ja/use-cases/hot-cold-redis) アダプタ越しに Redis 層へ置けます。composite アダプタは構築時に、すべての `Kind` に振り分け先があることを要求します。`composite.TxClusterKinds` の 7 要素は、すべて同じ比較可能なバックエンドに解決され、そのバックエンドが `store.Transactional` を実装していなければなりません。

- 認可コード
- リフレッシュトークン
- grant
- PAR
- JWT アクセストークン登録
- opaque アクセストークン
- grant 失効 tombstone

それ以外の `Kind` は別のバックエンドに配置できます。無効な `Kind`、未設定の振り分け先、cluster の分割、比較不能な cluster バックエンド、非トランザクショナルなアンカーは、いずれも構築エラーになります。

MFA factor のストア（`EmailOTPStore`、`TOTPStore`、`PasskeyStore`、`RecoveryStore`、`AuthnLockoutStore`）は `store.Store` のサブストアではありません。`LoginFlow` を組み立てる際に、対応する login-flow 値（`StepEmailOTP.Store`、`StepTOTP.Store`、`PrimaryPasskey.Store`、`StepRecoveryCode.Store`、`WithAuthnLockoutStore`）へ直接渡します。in-memory、SQL、DynamoDB adapter は同じ名前の accessor でこれらを公開します。[`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) は、同梱 SQL factor store と OP のコアテーブルを 1 つの DB で使う例です。自前バックエンドでは同じ契約を実装します。

詳細は [hot/cold ストレージ](/ja/use-cases/hot-cold-redis) を参照してください。

## Discovery 文書の組み立て

`/.well-known/openid-configuration` は OP の実効設定から discovery 文書を組み立てます。広告されるフィールドはそのまま OP の実挙動を表します。discovery と挙動の間に乖離はありません。理由は以下のとおりです。

- **`response_types_supported`** は `WithGrants` + FAPI プロファイルから計算されます。client-credentials だけの OP では空配列となり、browser authorization / logout の surface と flag は広告されません。
- **`token_endpoint_auth_methods_supported`** は、`WithProfile(profile.FAPI2Baseline)` または `FAPI2MessageSigning` が有効なときに FAPI の許可リストと交差します。
- **`scopes_supported`** は組み込みの scope と `WithScope` で登録された scope の和集合です。
- **`ui_locales_supported`** は runtime locale resolver（seed bundle + `WithLocale` 追加分）から自動導出されます。`WithDiscoveryMetadata(...).UILocalesSupported` に非空の明示リストを渡した場合だけ、それが優先されます。
- **`code_challenge_methods_supported`** は常に `["S256"]` です。`plain` は構造的に存在しません。
- **`request_object_signing_alg_values_supported`** は JOSE の許可リスト（`RS256`、`PS256`、`ES256`、`EdDSA`）です。
- **`dpop_signing_alg_values_supported`** はそれより狭い集合（`ES256`、`EdDSA`、`PS256`）です。理由は [FAQ § DPoP discovery](/ja/faq#dpop-sender-constraint) を参照。

## 次に読む

- **[Options 索引](/ja/reference/options)** — すべての `op.With*` を 1 ページに。上のルート一覧へのクロスリンク付き。
- **[Audit イベントカタログ](/ja/reference/audit-events)** — 各ハンドラ、各段階で何が発火するか。
- **[カスタム authenticator](/ja/use-cases/custom-authenticator)** — オーケストレータのパイプラインがどこで自前コードを呼ぶか。
- **[hot / cold ストレージ](/ja/use-cases/hot-cold-redis)** — サブストアの tier 分けと、揮発 / 永続の境界の関係。
