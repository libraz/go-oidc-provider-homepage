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

<svg role="img" aria-labelledby="seq-ja-title" viewBox="0 0 760 662" xmlns="http://www.w3.org/2000/svg">
<title id="seq-ja-title">authorize から token までの正常系: ブラウザが /authorize と interaction を進め、RP が /token で code を引き換えます。</title>
<defs>
<marker id="seq-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>
<marker id="seq-ahm" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--vp-c-text-3)"/></marker>
</defs>
<line class="seq-ll" x1="66" y1="44" x2="66" y2="645"/>
<line class="seq-ll" x1="220" y1="44" x2="220" y2="645"/>
<line class="seq-llop" x1="380" y1="44" x2="380" y2="645"/>
<line class="seq-llst" x1="545" y1="44" x2="545" y2="645"/>
<line class="seq-lllf" x1="700" y1="44" x2="700" y2="645"/>
<rect class="seq-box" x="18" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd" x="66" y="32" text-anchor="middle">RP</text>
<rect class="seq-box" x="172" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd" x="220" y="32" text-anchor="middle">ブラウザ</text>
<rect class="seq-boxop" x="332" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd seq-hdop" x="380" y="32" text-anchor="middle">OP</text>
<rect class="seq-boxst" x="497" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd" x="545" y="32" text-anchor="middle">ストア</text>
<rect class="seq-boxlf" x="652" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd seq-hdlf" x="700" y="32" text-anchor="middle">LoginFlow</text>
<line class="seq-msg" x1="66" y1="80" x2="220" y2="80" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="72" y="75">1</text>
<text class="seq-lbl" x="87" y="75">リダイレクト → <tspan class="seq-mono">/authorize?…</tspan></text>
<line class="seq-msg" x1="220" y1="114" x2="380" y2="114" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="109">2</text>
<text class="seq-lbl" x="241" y="109"><tspan class="seq-mono">GET /authorize</tspan></text>
<line class="seq-msg" x1="380" y1="148" x2="545" y2="148" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="143">3</text>
<text class="seq-lbl" x="401" y="143"><tspan class="seq-mono">Clients.GetClient</tspan> / <tspan class="seq-mono">redirect_uri</tspan> 検証</text>
<path class="seq-msg" d="M380 174 h30 v14 h-30" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="420" y="170">4</text>
<text class="seq-lbl" x="432" y="170">PKCE / scope / <tspan class="seq-mono">response_type</tspan> チェック</text>
<line class="seq-msg" x1="380" y1="216" x2="220" y2="216" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="211">5</text>
<text class="seq-lbl" x="241" y="211">302 → <tspan class="seq-mono">/interaction/{uid}</tspan></text>
<line class="seq-msg" x1="220" y1="250" x2="380" y2="250" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="245">6</text>
<text class="seq-lbl" x="241" y="245"><tspan class="seq-mono">POST /interaction/{uid}</tspan> (ログイン)</text>
<line class="seq-msg" x1="380" y1="284" x2="700" y2="284" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="279">7</text>
<text class="seq-lbl" x="401" y="279"><tspan class="seq-mono">Begin / Continue</tspan> (Step chain)</text>
<line class="seq-ret" x1="700" y1="318" x2="380" y2="318" marker-end="url(#seq-ahm)"/>
<text class="seq-num halo" x="386" y="313">8</text>
<text class="seq-lbl" x="401" y="313"><tspan class="seq-mono">Result</tspan> (subject + AAL + AMR)</text>
<line class="seq-msg" x1="380" y1="352" x2="220" y2="352" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="347">9</text>
<text class="seq-lbl" x="241" y="347">200 同意画面 → <tspan class="seq-mono">/interaction/{uid}</tspan></text>
<line class="seq-msg" x1="220" y1="386" x2="380" y2="386" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="381">10</text>
<text class="seq-lbl" x="241" y="381"><tspan class="seq-mono">POST /interaction/{uid}</tspan> (同意)</text>
<line class="seq-msg" x1="380" y1="420" x2="545" y2="420" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="415">11</text>
<text class="seq-lbl" x="401" y="415"><tspan class="seq-mono">AuthorizationCodes.Save</tspan> (code + PKCE)</text>
<line class="seq-msg" x1="380" y1="454" x2="220" y2="454" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="449">12</text>
<text class="seq-lbl" x="241" y="449">302 → <tspan class="seq-mono">redirect_uri?code=…&amp;state=…&amp;iss=…</tspan></text>
<line class="seq-msg" x1="220" y1="488" x2="66" y2="488" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="72" y="483">13</text>
<text class="seq-lbl" x="87" y="483"><tspan class="seq-mono">code</tspan> 付きで到達</text>
<line class="seq-msg" x1="66" y1="522" x2="380" y2="522" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="72" y="517">14</text>
<text class="seq-lbl" x="87" y="517"><tspan class="seq-mono">POST /token</tspan> (<tspan class="seq-mono">grant_type=authorization_code</tspan>)</text>
<line class="seq-msg" x1="380" y1="556" x2="545" y2="556" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="551">15</text>
<text class="seq-lbl" x="401" y="539"><tspan class="seq-mono">AuthorizationCodes.Consume</tspan></text>
<text class="seq-lbl" x="401" y="551">PKCE 検証 / クライアント認証</text>
<line class="seq-msg" x1="380" y1="590" x2="545" y2="590" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="585">16</text>
<text class="seq-lbl" x="401" y="585"><tspan class="seq-mono">AccessTokens.Register / RefreshTokens.Save</tspan></text>
<line class="seq-msg" x1="380" y1="624" x2="66" y2="624" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="72" y="619">17</text>
<text class="seq-lbl" x="87" y="619">200 <tspan class="seq-mono">{ access_token, id_token, refresh_token? }</tspan></text>
</svg>
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

<svg role="img" aria-labelledby="lfp-ja-title" viewBox="0 0 760 410" xmlns="http://www.w3.org/2000/svg">
<title id="lfp-ja-title">WithLoginFlow は Primary / Rules / Decider / Risk の指定を CompiledLoginFlow にコンパイルし、オーケストレータがリクエストごとのループで実行します。</title>
<defs>
<marker id="lfp-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>
<marker id="lfp-arra" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--vp-c-brand-2)"/></marker>
</defs>
<rect class="lfp-box" x="24" y="22" width="172" height="132" rx="8"/>
<text class="lfp-t1" x="110" y="44" text-anchor="middle">LoginFlow</text>
<text class="lfp-fld" x="44" y="72">Primary</text>
<text class="lfp-fld" x="44" y="94">Rules[]</text>
<text class="lfp-fld" x="44" y="116">Decider</text>
<text class="lfp-fld" x="44" y="138">Risk</text>
<path class="lfp-line" d="M196 88 H250" marker-end="url(#lfp-arrow)"/>
<text class="lfp-cap" x="223" y="82" text-anchor="middle">コンパイル</text>
<rect class="lfp-op" x="252" y="22" width="206" height="132" rx="8"/>
<text class="lfp-t1a" x="355" y="42" text-anchor="middle">CompiledLoginFlow</text>
<text class="lfp-sub" x="355" y="57" text-anchor="middle">internal/authn</text>
<text class="lfp-fld" x="270" y="82">primary</text>
<text class="lfp-fld" x="270" y="102">rules</text>
<text class="lfp-fld" x="270" y="122">decider</text>
<text class="lfp-fld" x="270" y="142">risk</text>
<path class="lfp-oln" d="M355 154 V196" marker-end="url(#lfp-arra)"/>
<text class="lfp-cap" x="365" y="178" text-anchor="start">chain 開始時に 1 回</text>
<rect class="lfp-op" x="40" y="210" width="172" height="52" rx="8"/>
<text class="lfp-nd" x="126" y="232" text-anchor="middle"><tspan class="lfp-mono">Primary.Begin /</tspan></text>
<text class="lfp-nd" x="126" y="248" text-anchor="middle"><tspan class="lfp-mono">Continue → Step</tspan></text>
<rect class="lfp-op" x="252" y="210" width="172" height="52" rx="8"/>
<text class="lfp-nd" x="338" y="232" text-anchor="middle">画面表示 → ユーザ送信</text>
<text class="lfp-nd" x="338" y="248" text-anchor="middle">Result が <tspan class="lfp-mono">Identity</tspan> を確定</text>
<rect class="lfp-op" x="452" y="210" width="200" height="52" rx="8"/>
<text class="lfp-nd" x="552" y="232" text-anchor="middle"><tspan class="lfp-mono">LoginContext</tspan> → <tspan class="lfp-mono">Decider</tspan></text>
<text class="lfp-nd" x="552" y="248" text-anchor="middle">その後 <tspan class="lfp-mono">Rules</tspan> 評価</text>
<path class="lfp-oln" d="M212 236 H252" marker-end="url(#lfp-arra)"/>
<path class="lfp-oln" d="M424 236 H452" marker-end="url(#lfp-arra)"/>
<path class="lfp-oln" d="M500 262 C 500 336, 126 336, 126 262" marker-end="url(#lfp-arra)"/>
<text class="lfp-lba" x="313" y="332" text-anchor="middle">ルールが尽きるまで繰り返し</text>
<path class="lfp-oln" d="M652 236 H704 V346" marker-end="url(#lfp-arra)"/>
<text class="lfp-cap" x="698" y="300" text-anchor="end">発火なし</text>
<rect class="lfp-op" x="636" y="346" width="118" height="40" rx="8"/>
<text class="lfp-nd" x="695" y="370" text-anchor="middle">セッション発行</text>
</svg>
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
