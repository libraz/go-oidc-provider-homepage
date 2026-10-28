---
title: アーキテクチャ概観
description: リクエストが OP の中をどう流れるか — パッケージ構成、ハンドラ、browser/M2M discovery の境界、origin 検査、LoginFlow の risk 評価、ストレージの差し込み口。
outline: 2
pageClass: pg-reference-architecture
---

# アーキテクチャ概観

`op.New(...)` は `http.ServeMux` を内部に持つ `http.Handler` を返します。本ページでは、リクエスト到着からレスポンスまでの間に OP が何を実行するか、関わるパッケージ、検証の順序、組み込み側が制御するストレージの差し込み口を整理します。

以下のシーケンスで RP は別アプリです。OP 側のアプリケーションが go-oidc-provider を組み込み、`Store` と `LoginFlow` の実装を所有します。

## パッケージ構成

```
op/                         ← 公開 API（組み込み側はここを import）
op/profile/                 ← Baseline / FAPI 2.0 / FAPI-CIBA プロファイル
op/feature/                 ← PAR / JAR / JARM / DPoP / mTLS / introspect / revoke / DCR / RAR / Grant Management
op/grant/                   ← authorization_code、refresh_token、client_credentials、device_code、CIBA
op/store/                   ← Store interface(サブストアの集合)+ contract test suite
op/storeadapter/{inmem,sql,redis,dynamodb,composite}
op/interaction/             ← ログイン UI 用 HTML / JSON ドライバの差し込み口
op/devicecodekit, op/passkeykit, op/totpkit, op/recoverykit
                            ← 組み込み側が持つ部分のヘルパー(device の確認ページ、factor の登録)
op/testkit/                 ← テスト用にそのまま使える provider

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

`op.New` は `*http.ServeMux` を構築し、設定されたパスごとにハンドラを 1 つ登録します。下表のパスは既定値です。プロトコルのエンドポイントはすべて、issuer のパスに mount prefix（`WithMountPrefix` で変えない限り `/oidc`）を足した位置に置かれます。たとえば issuer が `https://idp.example.com` なら、`/token` は `https://idp.example.com/oidc/token` です。個別のパスは `WithEndpoints` で変更できます。discovery と protected-resource metadata だけは例外で、プレフィックスの外の well-known な位置に置かれます。

| パス | ハンドラのパッケージ | 何を返すか | 公開条件 |
|---|---|---|---|
| `/.well-known/openid-configuration` | `internal/discovery` | OP の実効設定を discovery 文書として返す | 常時 |
| `/jwks` | `internal/jwks` | 署名鍵セットの公開側（設定時は `use=enc` 鍵も） | 常時 |
| `/.well-known/oauth-protected-resource`(+ パスのサフィックス) | `internal/protectedresource` | 宣言した保護リソースごとの RFC 9728 メタデータ | `WithProtectedResources` |
| `/auth` | `internal/authorizeendpoint` | リクエストの解析、クライアントと `redirect_uri` の検証、interaction へのリダイレクト | `authorization_code` grant が有効な場合 |
| `/interaction/{uid}` | `internal/authorizeendpoint` + `op/interaction` ドライバ | ログインと同意の手続き。HTML で描画するか、SPA へ JSON で返す。`WithSPAUI` を使うとルートは `LoginMount` に移る | `/auth` と同時 |
| `/par` | `internal/parendpoint` | pushed authorization request を受け取り、一度限りの `request_uri` を返す | `feature.PAR` |
| `/token` | `internal/tokenendpoint` | クライアント認証、認可コードとリフレッシュトークンの引き換え、トークン発行 | 常時 |
| `/userinfo` | `internal/userinfo` | 提示されたアクセストークンが指す subject の claim | 常時 |
| `/revoke` | `internal/revokeendpoint` | RFC 7009 によるリフレッシュトークン / アクセストークンの失効 | `feature.Revoke` |
| `/introspect` | `internal/introspectendpoint` | RFC 7662 によるトークン状態を、認可済みのリソースサーバへ返す | `feature.Introspect` |
| `/device_authorization` | `internal/devicecodeendpoint` | RFC 8628 のデバイス認可。`device_code` と `user_code` を返す | device-code grant |
| `/bc-authorize` | `internal/cibaendpoint` | CIBA の backchannel authentication リクエスト。`auth_req_id` を返す | CIBA grant |
| `/grant_management/{grant_id}` | `internal/grantmgmtendpoint` | grant 1 件の照会と失効 | `WithGrantManagement` |
| `/end_session` | `internal/endsession` | RP 起点のログアウト。バックチャネルの一斉通知もここから | `/auth` と同時（`authorization_code` grant） |
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

origin の集合は意図的に分かれています。API の CORS は明示的な `WithCORSOrigins` でのみ拡張され（API 互換性のため redirect URI の origin も含まれます）、interaction と end-session の手続きの検査は issuer origin と明示的な origin だけを許可します。redirect URI の origin だけで cross-origin interaction / logout POST が許可されることはありません。

## Authorize → token のライフサイクル

最も流量の多いパスです。概略は次のとおりです。

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<figure class="fig">
  <div class="fig-head">authorize と interaction — OP が組み込み側を呼ぶ箇所</div>
  <svg class="fig-svg" role="img" aria-labelledby="arch-lifecycle-title" viewBox="0 0 960 952" xmlns="http://www.w3.org/2000/svg">
    <title id="arch-lifecycle-title">ブラウザが authorize リクエストと interaction を進めます。OP はクライアントを引き、リクエストを検査し、ログインを LoginFlow に渡し、認可コードをストアに保存します。これらの呼び出しはすべて右端のレーン、つまり組み込み側のコードに届きます。</title>
    <!-- band: authorize request -->
    <rect class="fg-group" x="32" y="104" width="896" height="264" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">authorize リクエスト</text>
    <!-- band: interaction -->
    <rect class="fg-group" x="32" y="392" width="896" height="536" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="420">interaction</text>
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">ブラウザ</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">user agent</text>
    <line class="fg-life" x1="192" y1="88" x2="192" y2="928"/>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="928"/>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">組み込み側</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">Store · LoginFlow</text>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="928"/>
    <!-- GET /auth -->
    <path class="fg-edge" d="M192,172 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="162" text-anchor="middle">GET /auth</text>
    <!-- client lookup -->
    <path class="fg-edge" d="M512,244 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="210" text-anchor="middle">Clients.GetClient</text>
    <text class="fg-xs" x="668" y="232" text-anchor="middle">redirect_uri の完全一致</text>
    <!-- request checks -->
    <path class="fg-edge fg-edge--accent" d="M512,276 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="568" y="282">リクエストを検査</text>
    <text class="fg-mxs" x="568" y="304">PKCE · scope</text>
    <text class="fg-mxs" x="568" y="326">response_type</text>
    <!-- redirect to interaction -->
    <path class="fg-edge fg-edge--accent" d="M512,460 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="450" text-anchor="middle">302 → /interaction/{uid}</text>
    <!-- login post -->
    <path class="fg-edge" d="M192,532 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="498" text-anchor="middle">POST /interaction/{uid}</text>
    <text class="fg-xs" x="352" y="520" text-anchor="middle">ログイン</text>
    <!-- step chain -->
    <path class="fg-edge" d="M512,604 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="570" text-anchor="middle">Begin / Continue</text>
    <text class="fg-xs" x="668" y="592" text-anchor="middle">Step チェーン</text>
    <!-- result -->
    <path class="fg-edge fg-edge--muted" d="M824,676 H512" marker-end="url(#fg-am)"/>
    <text class="fg-m" x="668" y="642" text-anchor="middle">Result</text>
    <text class="fg-mxs" x="668" y="664" text-anchor="middle">subject · AAL · AMR</text>
    <!-- consent page -->
    <path class="fg-edge fg-edge--accent" d="M512,748 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="738" text-anchor="middle">200 同意画面</text>
    <!-- consent post -->
    <path class="fg-edge" d="M192,820 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="786" text-anchor="middle">POST /interaction/{uid}</text>
    <text class="fg-xs" x="352" y="808" text-anchor="middle">同意</text>
    <!-- save code -->
    <path class="fg-edge" d="M512,892 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="858" text-anchor="middle">AuthorizationCodes.Save</text>
    <text class="fg-xs" x="668" y="880" text-anchor="middle">code + PKCE チャレンジ</text>
  </svg>
  <figcaption class="fig-note">右端のレーンは組み込み側のものです。そこへ向かう矢印はすべてインタフェース呼び出しで、だからこそ中央のプロトコル処理に手を入れずに、保存先とログイン体験を差し替えられます。</figcaption>
</figure>
</div>

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<figure class="fig">
  <div class="fig-head">認可コードの引き換え — クライアント認証が先</div>
  <svg class="fig-svg" role="img" aria-labelledby="arch-token-title" viewBox="0 0 960 760" xmlns="http://www.w3.org/2000/svg">
    <title id="arch-token-title">認可コードはブラウザ経由で RP に戻り、RP が /token で直接引き換えます。OP はクライアントを認証し、コードを消費し、トークンの登録と保存をストアに依頼し、トークン応答を返します。</title>
    <!-- band: code returns -->
    <rect class="fg-group" x="32" y="104" width="896" height="128" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">コードがブラウザ経由で戻る</text>
    <!-- band: redeeming -->
    <rect class="fg-group" x="32" y="256" width="896" height="480" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="284">コードの引き換え</text>
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">別アプリ</text>
    <line class="fg-life" x1="192" y1="88" x2="192" y2="736"/>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="736"/>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">ストア</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">組み込み側</text>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="736"/>
    <!-- redirect with code -->
    <path class="fg-edge fg-edge--accent" d="M512,192 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="158" text-anchor="middle">302 → redirect_uri</text>
    <text class="fg-mxs" x="352" y="180" text-anchor="middle">code · state · iss</text>
    <!-- token request -->
    <path class="fg-edge" d="M192,344 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="310" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="352" y="332" text-anchor="middle">grant_type=authorization_code</text>
    <!-- client auth -->
    <path class="fg-edge" d="M512,416 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="382" text-anchor="middle">Clients.GetClient</text>
    <text class="fg-xs" x="668" y="404" text-anchor="middle">先にクライアント認証</text>
    <!-- consume -->
    <path class="fg-edge" d="M512,488 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="454" text-anchor="middle">AuthorizationCodes.Consume</text>
    <text class="fg-xs" x="668" y="476" text-anchor="middle">続けて PKCE と redirect_uri</text>
    <!-- register access token -->
    <path class="fg-edge" d="M512,560 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="526" text-anchor="middle">AccessTokens.Register</text>
    <text class="fg-xs" x="668" y="548" text-anchor="middle">JTIRegistry のみ</text>
    <!-- save refresh token -->
    <path class="fg-edge" d="M512,632 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="598" text-anchor="middle">RefreshTokens.Save</text>
    <text class="fg-xs" x="668" y="620" text-anchor="middle">条件成立時</text>
    <!-- token response -->
    <path class="fg-edge fg-edge--accent" d="M512,704 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="670" text-anchor="middle">200 · access_token · id_token</text>
    <text class="fg-xs" x="352" y="692" text-anchor="middle">+ 条件成立時は refresh_token</text>
  </svg>
  <figcaption class="fig-note">コードはブラウザを通りますが、引き換えは直接のバックチャネルで行われます。クライアント認証はコードの消費より前、PKCE と redirect_uri の検証はその後です。</figcaption>
</figure>
</div>

`/par` と `/end_session` も大筋は同じ形です。上記が標準的な成功経路です。

認可ごとに、認証の状態は別々に持たれます。コード、そこから始まる refresh chain、発行されるアクセストークンには、それを生んだ認可の `auth_time`・`acr`・`amr`・`authorization_details`・OIDC `claims` リクエストが記録されます。(subject, client) ごとに 1 つだけあり、後続の認可が毎回書き換える grant を読みにいくことはありません。同じユーザが 2 回目にログインしても、先に発行されたコードが ID Token に載せる内容は変わりません。また、1 つの refresh chain を失効させたりローテーションしたりしても、同じクライアントにおけるユーザの別セッションには影響しません。

JWT アクセストークンに対して `AccessTokens` の shadow row が保存されるのは、`RevocationStrategyJTIRegistry` を選択した場合だけです。既定の `RevocationStrategyGrantTombstone` は失効時に grant tombstone を記録し、`RevocationStrategyNone` は JWT のサーバ側失効を無効にします。リフレッシュトークンは、OP の grant、クライアント登録、scope の条件をすべて満たした場合だけ保存されます。

### 既存セッションで処理するリクエスト

`/auth` は、毎回 chain を実行するわけではありません。キャッシュ済みの grant がリクエストを満たす場合や、first-party の consent 省略が適用される場合は、有効なセッションからそのままコードを発行できます。この経路でも `LoginFlow` の rule と `Decider` は適用されます。

<figure class="fig">
  <div class="fig-head">既存セッションで処理する authorize リクエスト</div>
  <svg class="fig-svg" role="img" aria-labelledby="arch-reuse-title" viewBox="0 0 960 336" xmlns="http://www.w3.org/2000/svg">
    <title id="arch-reuse-title">/auth が有効なセッションからコードを発行できる場合、LoginFlow の rule と Decider を、primary step が完了した直後として先に評価する。追加の step を求められなければコードを発行する。step を求められた場合、prompt=none なら interaction_required を返し、それ以外はセッションの subject から chain を実行してから発行する。</title>
    <!-- session -->
    <rect class="fg-box" x="32" y="124" width="232" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="152">既存セッションの再利用</text>
    <text class="fg-xs" x="48" y="176">有効な grant が要求を満たす</text>
    <text class="fg-xs" x="48" y="200">first-party の consent 省略</text>
    <path class="fg-edge" d="M264,172 H312" marker-end="url(#fg-a)"/>
    <!-- evaluation -->
    <rect class="fg-box fg-box--accent" x="312" y="124" width="272" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="328" y="152">rule と Decider</text>
    <text class="fg-xs" x="328" y="176">Primary 完了直後として扱う</text>
    <text class="fg-xs" x="328" y="200">過去の factor は数えない</text>
    <path class="fg-leader" d="M584,172 H616 M616,68 V276"/>
    <path class="fg-edge fg-edge--thin" d="M616,68 H648" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M616,172 H648" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M616,276 H648" marker-end="url(#fg-a)"/>
    <!-- outcomes -->
    <rect class="fg-box fg-box--ok" x="648" y="32" width="280" height="72" rx="8"/>
    <text class="fg-t2" x="664" y="60">認可コードを発行</text>
    <text class="fg-xs" x="664" y="84">step が不要</text>
    <rect class="fg-box fg-box--warn" x="648" y="136" width="280" height="72" rx="8"/>
    <text class="fg-m" x="664" y="164">interaction_required</text>
    <text class="fg-xs" x="664" y="188">step が必要で prompt=none</text>
    <rect class="fg-box" x="648" y="240" width="280" height="72" rx="8"/>
    <text class="fg-t2" x="664" y="268">chain を実行</text>
    <text class="fg-xs" x="664" y="292">step が必要で prompt=none 以外</text>
  </svg>
  <figcaption class="fig-note">risk に基づく rule は chain の内側でだけ発火するため、この経路では動きません。chain はセッションの subject から始まり、すでに確定している subject と別の subject を返す factor は、chain をサーバエラーで終了させます。</figcaption>
</figure>

panic する `Rule` の判定関数や `Decider` は fail-closed になります。`Rule.When` が panic すると一致したものとして扱われ、step は求められたままです。`Decider` が panic した場合は拒否します。`Decider` が nil や未知の形を返した場合も拒否です。

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
  <svg class="fig-svg" role="img" aria-labelledby="loginflow-title" viewBox="0 0 960 472" xmlns="http://www.w3.org/2000/svg">
    <title id="loginflow-title">WithLoginFlow に渡すのは仕様です。これは一度 CompiledLoginFlow にコンパイルされ、オーケストレータがリクエストごとにループで実行します。第一要素を開始し、画面を出し、Identity を確定し、Decider と Rules を評価し、発火するルールが無くなるまで繰り返します。</title>
    <text class="fg-lbl" x="32" y="40">宣言</text>
    <text class="fg-lbl fg-accent" x="376" y="40">一度だけコンパイル</text>
    <text class="fg-lbl" x="640" y="40">リクエストごとに実行</text>
    <!-- declared -->
    <rect class="fg-frame" x="32" y="64" width="248" height="352" rx="8"/>
    <text class="fg-lbl" x="56" y="92">LoginFlow</text>
    <rect class="fg-box" x="56" y="112" width="200" height="72" rx="8"/>
    <text class="fg-m" x="72" y="140">Primary</text>
    <text class="fg-xs" x="72" y="164">第一要素</text>
    <rect class="fg-box" x="56" y="216" width="200" height="72" rx="8"/>
    <text class="fg-m" x="72" y="244">Rules[]</text>
    <text class="fg-xs" x="72" y="268">追加要素を求める条件</text>
    <rect class="fg-box" x="56" y="320" width="200" height="72" rx="8"/>
    <text class="fg-m" x="72" y="348">Decider · Risk</text>
    <text class="fg-xs" x="72" y="372">AAL 方針とシグナル</text>
    <path class="fg-edge" d="M280,240 H376" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="328" y="230" text-anchor="middle">コンパイル</text>
    <!-- compiled -->
    <rect class="fg-box fg-box--accent" x="376" y="192" width="208" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="392" y="220">CompiledLoginFlow</text>
    <text class="fg-mxs" x="392" y="244">internal/authn</text>
    <text class="fg-xs" x="392" y="268">op.New で解決・検証</text>
    <path class="fg-edge fg-edge--accent" d="M584,240 H612 V100 H640" marker-end="url(#fg-ac)"/>
    <!-- driven per request -->
    <rect class="fg-box" x="640" y="64" width="256" height="72" rx="8"/>
    <text class="fg-m" x="656" y="92">Primary.Begin → Step</text>
    <text class="fg-xs" x="656" y="116">チェーン開始時に 1 回</text>
    <rect class="fg-box" x="640" y="168" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="196">画面表示 → ユーザが送信</text>
    <text class="fg-xs" x="656" y="220">subject · AAL · AMR を確定</text>
    <rect class="fg-box" x="640" y="272" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="300">Decider、続けて Rules</text>
    <text class="fg-xs" x="656" y="324">ルールが発火 → 次の Step へ</text>
    <rect class="fg-box fg-box--accent" x="640" y="376" width="256" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="656" y="404">発火するルールが無い</text>
    <text class="fg-xs" x="656" y="428">セッションを発行する</text>
    <path class="fg-edge fg-edge--thin" d="M768,136 V168" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M768,240 V272" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M768,344 V376" marker-end="url(#fg-ac)"/>
    <path class="fg-edge" d="M896,308 H920 V204 H896" marker-end="url(#fg-a)"/>
  </svg>
  <figcaption class="fig-note">先にコンパイルしておくことで、設定の誤りが実行時ではなく起動時のエラーになります。リクエストが届く頃には解釈すべきものは残っておらず、あとはチェーンを辿るだけです。</figcaption>
</figure>
</div>

各 authorize リクエストでは:

1. `Primary.Begin` が `interaction.Step`（Prompt または Result）を返します。
2. UI ドライバ（HTML または SPA）が画面を描画し、ユーザが送信します。
3. `Primary.Continue` が `Result`（`Identity` が確定している）まで進めます。
4. オーケストレータが `LoginContext` を組み立てます（subject、scope、完了したステップ、cache 済みのリスクスコア、ACR values）。
5. `Decider` が動きます（nil 以外の場合）。`Pass` 以外の判定はそこで短絡します。すでに確定している subject と別の subject を返した factor は、chain をサーバエラーで終了させます。AAL3 の user-verification 検査は、プロンプトなしで `Begin` の中で完了する factor にも適用されます。
6. それ以外は `Rules` を順に評価します。最初にマッチしたルールの `Step.Kind()` が `CompletedSteps` にまだ含まれていなければ発火します。
7. 発火するルールが無くなるまで繰り返し、その後にセッションを発行します。`LoginFlow.Risk` は chain ごとに最大 1 回だけ呼ばれ、結果は cache されます。provider-level の `WithRiskAssessor` は別の seam であり、`LoginFlow.Risk` と同時に指定すると、どちらかを黙って選ばず構築時に拒否されます。

`ExternalStep` 経由で自前の factor を差し込む手順は、[ユースケース: カスタム authenticator](/ja/use-cases/custom-authenticator) を参照してください。

## ストレージの差し込み口

ライブラリは、組み込み側の `users` テーブルを直接読み書きしません。`store.Store` interface(小さなサブストアの和集合)越しに会話します:

| サブストア | 何が入るか | 置き場所の目安 |
|---|---|---|
| `Clients` | OAuth クライアントレジストリ | 通常は永続 |
| `Users` | subject + claim | 組み込み側の実装。既存の users テーブルにマッピングすることが多い |
| `AuthorizationCodes` | one-shot な code(PKCE challenge、scope、認可ごとの認証状態) | 永続 |
| `RefreshTokens` | リフレッシュトークンの連鎖(それぞれ `ChainID` を持つ)、ローテーション履歴 | 永続 |
| `AccessTokens` | JWT アクセストークンの `jti` 単位の登録簿。`RevocationStrategyJTIRegistry` が使う | 永続 |
| `OpaqueAccessTokens` | opaque アクセストークンのレコード(発行した chain の `ChainID` を持つ) | 永続 |
| `Grants` | (user, client) ごとの consent scope。device-code・CIBA・token exchange の引き換えが記録する grant も含む | 永続 |
| `GrantRevocations` | 失効した grant の tombstone。アクセストークンだけに絞った tombstone も置ける | 永続 |
| `Sessions` | ブラウザセッションのレコード | 揮発に置いてもよい |
| `Interactions` | 試行ごとの interaction 状態 | 揮発に置いてもよい |
| `ConsumedJTIs` | JAR / DPoP `jti` のリプレイ検出集合 | 永続、または `noeviction` の Redis |
| `PushedAuthRequests` | pushed authorization request | PAR が authorization-code transaction に参加する構成では永続 |
| `InitialAccessTokens` / `RegistrationAccessTokens` | DCR の Initial / Registration Access Token | 永続 |
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

### 失効の範囲と、任意の store interface

grant は、1 人の subject が 1 つのクライアントで持つすべてのセッションで共有されます。そのため grant 単位で失効させる処理は、呼び出し側が意図していないセッションまで終わらせてしまいます。store が失効の範囲をもっと狭く保てるよう、任意の interface が 2 つあります。

| Interface | 実装する先 | 追加されるもの |
|---|---|---|
| `store.OpaqueAccessTokenChainRevoker` | `OpaqueAccessTokens()` | `RevokeByChain`: 1 つの refresh chain が発行した opaque アクセストークンだけを失効させる |
| `store.IssuanceRevocationChecker` | `GrantRevocations()` | `IsIssuanceRevoked`: アクセストークン限定の tombstone（`GrantTombstone.AccessTokensOnly`）が、refresh やコードの引き換えを拒否しないようにする |

in-memory、SQL、DynamoDB の adapter は両方を実装しています。どちらも実装しない、または `ChainID` / `AccessTokensOnly` を保存しない自前 store は、grant 全体に対する挙動になります。コード・リフレッシュトークン・opaque アクセストークンの `AuthorizationRecorded` も同様で、認可ごとのフィールドを持たない行は grant を参照する動作に戻ります。各トリガーが及ぶ範囲は次のとおりです。

| トリガー | リフレッシュトークン | アクセストークン | grant への以後の発行 |
|---|---|---|---|
| refresh のローテーション | 旧トークンは失効し、chain は続く | その chain の opaque トークンだけ(chain 単位の失効を持たない store では grant 全体) | 可能 |
| リフレッシュトークンへの `/revoke` | その chain(chain の起点を解決できないときは grant の refresh token すべて) | grant のすべてのアクセストークン | 可能: 別の chain と未引き換えのコードは引き換えられる |
| リフレッシュトークンの再送 | 再送された chain | grant のすべてのアクセストークン | 不可 |
| 認可コードの再送 | grant のすべての refresh token | grant のすべてのアクセストークン | 不可 |
| grant の失効(`RevokeSubject`、Grant Management の revoke、`/end_session` の後始末) | すべて | すべて | 不可 |

SQL を使う構成では、アップグレード前に `op/storeadapter/sql/schema/MIGRATIONS.md` の `ALTER TABLE` を適用してください。新しい列がないと `Store.Migrate` は起動を拒否します。

MFA factor のストア（`EmailOTPStore`、`TOTPStore`、`PasskeyStore`、`RecoveryStore`、`AuthnLockoutStore`）は `store.Store` のサブストアではありません。`LoginFlow` を組み立てる際に、対応する login-flow 値（`StepEmailOTP.Store`、`StepTOTP.Store`、`PrimaryPasskey.Store`、`StepRecoveryCode.Store`、`WithAuthnLockoutStore`）へ直接渡します。in-memory、SQL、DynamoDB adapter は同じ名前の accessor でこれらを公開します。[`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) は、同梱 SQL factor store と OP のコアテーブルを 1 つの DB で使う例です。自前バックエンドでは同じ契約を実装します。

詳細は [hot/cold ストレージ](/ja/use-cases/hot-cold-redis) を参照してください。

## Discovery 文書の組み立て

`/.well-known/openid-configuration` は OP の実効設定から discovery 文書を組み立てます。広告されるフィールドはそのまま OP の実挙動を表します。discovery と挙動の間に乖離はありません。理由は以下のとおりです。

- **`response_types_supported`** は `WithGrants` + FAPI プロファイルから計算されます。client-credentials だけの OP では空配列となり、browser authorization / logout の surface と flag は広告されません。
- **`token_endpoint_auth_methods_supported`** は、`WithProfile(profile.FAPI2Baseline)` または `WithProfile(profile.FAPI2MessageSigning)` が有効なときに本ライブラリの FAPI 許可リストと交差します。
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
