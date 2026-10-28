---
title: 設計判断
description: go-oidc-provider のセキュリティ設計判断 — RFC の衝突、introspection 認可、失効、profile、bounded fetch をどう整合させるかを記録します。
pageClass: pg-security-design-judgments
---

# 設計判断

OP が触れる仕様には、MUST、SHOULD、MAY が幾重にも層をなしています。複数の仕様で文言が矛盾する場面、あるいはある仕様の文字通りの読みが別の仕様と衝突する場面は珍しくなく、その都度どちらをどう取るかの解釈が必要になります。本ページではその選択を一覧化します。

<figure class="fig">
  <div class="fig-head">設計判断の読み方</div>
  <svg class="fig-svg" role="img" aria-labelledby="dj-shape-title" viewBox="0 0 960 232" xmlns="http://www.w3.org/2000/svg">
    <title id="dj-shape-title">各設計判断は、関係する仕様文、2 つの文書が食い違う箇所、本ライブラリが採用した規則を示し、その規則がどこで実際に強制されるかまで述べます。</title>
    <!-- spec text -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="52">仕様文</text>
    <text class="fg-m" x="48" y="76">MUST · SHOULD · MAY</text>
    <text class="fg-s" x="48" y="100">節番号を添えて引用する</text>
    <path class="fg-edge" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <!-- conflict -->
    <rect class="fg-box fg-box--warn" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="360" y="52">食い違う箇所</text>
    <text class="fg-s" x="360" y="76">同じリクエストに対して 2 つの</text>
    <text class="fg-s" x="360" y="100">文書が別の答えを与えている</text>
    <path class="fg-edge" d="M616,72 H656" marker-end="url(#fg-a)"/>
    <!-- adopted rule -->
    <rect class="fg-box fg-box--accent" x="656" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="672" y="52">本ライブラリが採用した規則</text>
    <text class="fg-s" x="672" y="76">採る解釈を 1 つ決め、</text>
    <text class="fg-s" x="672" y="100">その理由を書き残す</text>
    <path class="fg-edge fg-edge--accent" d="M792,120 V160" marker-end="url(#fg-ac)"/>
    <!-- enforcement -->
    <rect class="fg-box fg-box--sub" x="32" y="160" width="896" height="48" rx="8"/>
    <text class="fg-lbl" x="48" y="189">強制する場所</text>
    <text class="fg-m" x="192" y="189">op.New の構築時検証 · ストアの契約 · internal の実装</text>
  </svg>
  <figcaption class="fig-note">判断と意見を分けるのが最後の行です。どこかで具体的に強制されていない規則は規則ではなく、作者がこう考えたという注記にすぎません。</figcaption>
</figure>

<div class="dj-hero">
  <div>
    <p class="dj-kicker">設計判断インデックス</p>
    <p class="dj-lede">このページは「その挙動が偶然なのか、仕様間の折衷なのか、意図したセキュリティ姿勢なのか」を確認するための索引です。各項目で、衝突した仕様、採用した規則、それを強制する実装面を示します。</p>
  </div>
  <div class="dj-stats" aria-label="設計判断の概要">
    <span><strong>33</strong> 判断</span>
    <span><strong>5</strong> 領域</span>
    <span><strong>構築時拒否</strong> 既定</span>
  </div>
</div>

::: tip このページの読み方
まず変更対象の領域に近いカードから入ってください。各エントリはその後で「**仕様の文言**」「**衝突の中身**」「**本ライブラリの選択**」の 3 段構成にしています。強調された callout が実際の規則で、引用された `op/` / `internal/` 配下のパッケージが実装の参照先です。
:::

::: details このページで使う用語
- **OP**（OpenID Provider）: 本ライブラリが実装する認可サーバ。
- **RP**（Relying Party）: OP を通じてユーザをサインインさせるクライアントアプリケーション。
- **RS**（リソースサーバ）: アクセストークンを受け付ける API。
- **grant**: 1 人の subject が 1 つの client に与えた同意を、OP が記録したもの。1 つの grant の配下に、複数のセッションやトークンが並びます。[同意](/ja/concepts/consent) を参照してください。
- **chain**: リフレッシュトークンと、ローテーションで生まれるその後継の連なり。[リフレッシュトークン](/ja/concepts/refresh-tokens) を参照してください。
- **tombstone**: トークンごとの行を持たずに JWT を拒否するための、grant（または `jti`）をキーにした小さな失効レコード。
:::

## 判断マップ

<div class="dj-map">
  <section class="dj-group">
    <h3>プロファイルと discovery</h3>
    <a href="#dj-7"><strong>#7</strong><span>profile は feature を自動有効化し、必要な設定のない grant は拒否する。</span></a>
    <a href="#dj-8"><strong>#8</strong><span>通信路上の ACR と内部 AAL 階層を分離する。</span></a>
    <a href="#dj-12"><strong>#12</strong><span>Discovery は構築時入力から 1 回生成し、golden test で固定する。</span></a>
    <a href="#dj-13"><strong>#13</strong><span><code>client_assertion</code> は OIDC の token endpoint audience と FAPI の issuer audience の両方を受ける。</span></a>
    <a href="#dj-25"><strong>#25</strong><span>DPoP nonce challenge は assertion <code>jti</code> 消費より前に行う。</span></a>
    <a href="#dj-26"><strong>#26</strong><span>CIBA は poll mode のみ。slow_down strike には上限を置く。</span></a>
  </section>
  <section class="dj-group">
    <h3>トークン、grant、失効</h3>
    <a href="#dj-2"><strong>#2</strong><span>リフレッシュローテーションには 60 秒の猶予と chain 侵害時の退役がある。</span></a>
    <a href="#dj-3"><strong>#3</strong><span><code>offline_access</code> は既定で UX / TTL シグナル。厳格モードではゲート。</span></a>
    <a href="#dj-15"><strong>#15</strong><span>DPoP リフレッシュ chain は public では束縛、confidential では未束縛。</span></a>
    <a href="#dj-16"><strong>#16</strong><span>confidential 限定の introspection は resource audience 経由だけ委譲する。</span></a>
    <a href="#dj-17"><strong>#17</strong><span><code>/end_session</code> は subject の grant 配下に発行されたものをクラスごとに失効させる。</span></a>
    <a href="#dj-18"><strong>#18</strong><span>アクセストークンは JWT 既定。opaque は opt-in で resource ごとに選べる。</span></a>
    <a href="#dj-19"><strong>#19</strong><span>JWT 失効は grant tombstone 既定。FAPI では no-revocation を拒否。</span></a>
    <a href="#dj-28"><strong>#28</strong><span>Custom grant は refresh 発行の意図だけを示し、値と親子関係は OP が持つ。</span></a>
    <a href="#dj-29"><strong>#29</strong><span><code>devicecodekit.Revoke</code> は連鎖失効と grant レコードの削除まで行う。</span></a>
    <a href="#dj-31"><strong>#31</strong><span>Grant Management は draft が不安定な間、明示的な有効化に限定する。</span></a>
    <a href="#dj-32"><strong>#32</strong><span>認可コード、リフレッシュ chain、アクセストークンは、発行元の認可の状態を自分で持つ。</span></a>
  </section>
  <section class="dj-group">
    <h3>登録、issuer、外向き fetch</h3>
    <a href="#dj-4"><strong>#4</strong><span>loopback のポートワイルドカードは native app 向けの狭い明示許可。</span></a>
    <a href="#dj-9"><strong>#9</strong><span>非正規 issuer は構築時に拒否する。</span></a>
    <a href="#dj-20"><strong>#20</strong><span>DCR client secret は保存時 hash のみ、平文は一度だけ返す。</span></a>
    <a href="#dj-21"><strong>#21</strong><span>RFC 7592 PUT は defaulted field をリセットし、optional metadata をクリアする。</span></a>
    <a href="#dj-22"><strong>#22</strong><span><code>sector_identifier_uri</code> は上限付き取得、24 時間成功キャッシュ、変更検出を使う。</span></a>
    <a href="#dj-23"><strong>#23</strong><span>custom transport は信頼設定を変えられるが、接続時の SSRF gate は外せない。</span></a>
    <a href="#dj-24"><strong>#24</strong><span>Open DCR で <code>scope</code> 省略なら、設定がない限り登録 scope は空。</span></a>
  </section>
  <section class="dj-group">
    <h3>ブラウザ、セッション、UI 境界</h3>
    <a href="#dj-5"><strong>#5</strong><span>iframe logout 系仕様は未実装。BCL と RP-Initiated Logout を提供する。</span></a>
    <a href="#dj-10"><strong>#10</strong><span>セッションはトランザクションクラスタ外へ置ける。揮発 BCL は best-effort。</span></a>
    <a href="#dj-30"><strong>#30</strong><span>CookieKeys は条件付き必須。ブラウザ認可を有効にしたときだけ必要。</span></a>
    <a href="#dj-33"><strong>#33</strong><span>ステップアップのルールは、既存セッションから認可を返す場合にも適用する。</span></a>
  </section>
  <section class="dj-group">
    <h3>JOSE と request object</h3>
    <a href="#dj-1"><strong>#1</strong><span>PAR <code>request_uri</code> は入口で参照し、認可コード発行時に消費する。</span></a>
    <a href="#dj-6"><strong>#6</strong><span>JAR <code>request=</code> は、<code>jti</code> を持つものを OP 側のキャッシュで重複排除する。</span></a>
    <a href="#dj-11"><strong>#11</strong><span><code>none</code> と <code>HS*</code> を除外し、OP 発行の成果物は ES256 のみ。</span></a>
    <a href="#dj-14"><strong>#14</strong><span>PKCE は全プロファイルで <code>S256</code> のみ。</span></a>
    <a href="#dj-27"><strong>#27</strong><span>JWE alg は許可リスト、JOSE nesting は上限付き。</span></a>
  </section>
</div>

<a class="faq-anchor" id="dj-1"></a>

## 1. PAR の `request_uri` — 「one-time use」をいつ適用するか

**仕様**: RFC 9126 §2.2 は、クライアントの利用と AS の扱いを分けています。

> **RFC 9126 §2.2（要約）** クライアントは各 `request_uri` を 1 回だけ使わなければなりません。AS は one-time として扱うことが推奨されますが、ユーザエージェントの再読み込み・更新による重複要求を許容してもかまわず、期限切れの値は拒否しなければなりません。

**衝突**: 「最初の参照で消費する」という文字通りの解釈は、複数段階の interaction(同意 → MFA → ロケール変更など)で同じ `/auth?request_uri=…` に再リダイレクトが走るケースで壊れます。チェックイン済みの OFCS FAPI plan は 2 件のテストケースで挙動を検証しており、認証完了前の再アクセスは *受理*、認証完了後の再アクセスは *拒否* を要求しています。これらは Implementer's Draft 世代の plan なので、現在の FAPI Final への適合をそれだけで示すものではありません。

::: tip 選択
`request_uri` は `/auth` の入口で `PARs.Find` により参照し、**認可コード発行時点で** `PARs.Consume` で消費します。interaction 中の再アクセスは成功し、コード発行後の再アクセスは `invalid_request_uri` を返します。OFCS module `fapi2-…-par-attempt-reuse-request_uri` がコード発行後の拒否経路を検証します。詳細は <a class="doc-ref" href="/ja/compliance/ofcs">OFCS 適合状況</a> を参照してください。
:::

<a class="faq-anchor" id="dj-2"></a>

## 2. リフレッシュトークンのローテーション猶予期間

**仕様**: RFC 9700 §4.14.2 は、公開クライアントについて sender-constrained refresh token またはローテーションで replay を検出するよう AS に求めています。FAPI 2.0 Security Profile Final §5.3.2.1(9) は、refresh token のローテーションを例外的な状況に限り、新しい token を失った場合は旧 token による時間制限付き retry を許容しています。

> **RFC 9700 §4.14.2（要約）** ローテーションでは新しい refresh token を発行して旧 token を無効化し、関係を保持します。再利用で侵害が分かると有効な token を失効させます。

**衝突**: 「厳密な single-use、猶予なし」の解釈は、ローテーションのネットワーク往復が中断されたすべてのクライアント（モバイルのバックグラウンド遷移、TCP 切断、HTTP/2 ストリームのリトライなど）を破壊します。チェックイン済みの OFCS FAPI plan は、ローテーションと再交換の間に 30 秒待つ形で猶予期間の経路を検証します。これらは Implementer's Draft 世代の plan なので、現在の FAPI Final への適合をそれだけで示すものではありません。

::: tip 選択
ローテーション済みの refresh token は、ライブラリで設定できる `GraceTTL`（既定 60 秒）の間、chain が replay 検知で失効していない限り受理されます。猶予期間内に旧トークンを提示すると、連鎖を再度ローテーションせずに保存済みの後継トークンを返します。送信者制約付きの再試行では、アクセストークンを新たにバインドして発行する場合があります。猶予期間 *を過ぎたあと* の再利用、あるいはすでに失効した chain での再利用は、chain 全体を無効化し、その grant のアクセストークンも失効させます（RFC 9700 §4.14.2）。

既定の 60 秒は、応答を失った場合の限定的な retry 経路に対する実装上の選択であり、RFC の要求ではありません。ローテーションを使う場合の FAPI 2.0 Security Profile Final §5.3.2.1(9) が示す時間制限付き retry の形には合いますが、デプロイメントが同プロファイルの「例外的な状況」という条件を満たすことを示すものではありません。

`op.WithRefreshGracePeriod` は負値を拒否し、明示した 0 は猶予なしとして扱います。ライブラリの FAPI 2.0 profile では 0〜60 秒の明示値を受理し、60 秒を超える値は構築時エラーです。option を省略すれば既定の 60 秒になります。これらの profile 以外では、負でないより長い window も選べます。ローテーションが触れるのは、その chain だけです。後継トークンは置き換えるトークンの scope を引き継ぐため、refresh リクエストが 1 回分のアクセストークンのために `scope` を絞っても、後継は絞られません。ローテーションが失効させる opaque アクセストークンは同じ chain から発行されたものに限るので、同じ client 上のユーザの他のセッションのトークンは生き残ります。実装は `internal/grants/refresh.Exchanger.tryGrace` にあり、`store.RefreshToken.Revoked` が「ローテーションで消費済み」と「chain 侵害で失効」を区別し、`store.RefreshToken.ChainID` が chain を識別します。
:::

<a class="faq-anchor" id="dj-3"></a>

## 3. `offline_access` — リフレッシュ発行の判定か、UX シグナルか

**仕様**: OIDC Core 1.0 §11 が、次の 2 つを同時に書いています。

> **OIDC Core 1.0 §11 (a) 訳** リフレッシュトークンの利用は Offline Access 専用ではない。

> **OIDC Core 1.0 §11 (b) 訳** `offline_access` 要求時は、AS は prompt パラメータに `consent` を含めなければならない。

**衝突**: (a) を取れば「`refresh_token` grant が許可されたクライアントなら scope に依らずリフレッシュトークンを発行する」、（b） を取れば「`offline_access` こそリフレッシュ発行のための scope であり、consent ゲートはその副次」と読めます。OP の実装ごとに解釈が割れる箇所です。

::: tip 選択
**既定では、`offline_access` は UX と TTL のシグナルであり、リフレッシュトークン発行ゲートではありません**。リフレッシュトークンは、付与 scope に `openid` が含まれ、かつクライアントの `GrantTypes` に `refresh_token` が含まれる場合に発行されます。grant が `offline_access` も持つ場合は、`op.WithRefreshTokenOfflineTTL` によって offline 用の寿命 bucket に入り、同意・監査の表示もユーザが認可した offline reach を反映できます。

OIDC Core §11 を厳格に読みたい組み込み側は、`op.WithStrictOfflineAccess()` を渡します。この mode では、リフレッシュトークン発行に `offline_access` が追加で必要になり、`grant_type=refresh_token` でも元 grant が `offline_access` を持たない token は `invalid_grant` で拒否されます。この option は `op.WithOpenIDScopeOptional()` と併用不可です。OIDC request ではないものに §11 を適用する意味がないためです。実装は `op/options_features.go`、`internal/tokenendpoint/strict_offline_test.go`、および refresh 発行経路にあります。
:::

<a class="faq-anchor" id="dj-4"></a>

## 4. RFC 8252 §7.3 ループバック redirect — 完全一致かポートワイルドカードか

**仕様**: RFC 6749 §3.1.2.3 と OAuth 2.1 はバイト完全一致を要求します。一方で RFC 8252 §7.3 は、ネイティブアプリのループバック redirect について「リクエスト時に任意のポートを許可せよ」と要求しています。

**衝突**: 構造的な矛盾です。CLI ツールは OS が割り当てる動的ポートを事前登録できないため、完全一致を厳密に適用するとネイティブアプリの標準的なフローが壊れます。

::: tip 選択
既定は完全一致（OAuth 2.1 を厳格に解釈）です。RFC 8252 §7.3 の緩和は **クライアント単位のオプトイン** とし、登録済みの `redirect_uris` にループバック URI が含まれる場合に限って有効になります。ポート不一致だけを許容するのは、次の 4 条件がすべて成り立つときです。scheme が `http` であること、登録済 host がループバック形（`127.0.0.1` / `::1` / 文字列 `localhost`）のいずれかであること、要求側 host が登録 host と一致すること、そして path / query / fragment が完全一致すること。文字列 `localhost` は、authorize 側の判定を OIDC Registration の native client 向け loopback carve-out と揃えるために受理します。これがないと、`http://localhost/cb` で登録した native アプリが登録は通るのに、OS から動的ポートを受け取った瞬間に `/auth` で弾かれます。この `localhost` の受理は、登録側で組み込み側がオプトイン（web クライアントは `op.WithAllowLocalhostLoopback()`、native クライアントは `application_type=native`）している場合にだけ意味を持つため、DNS rebinding を懸念するデプロイは登録側のオプトインを外しておけば従来どおり literal IP のみの厳格な構えを保てます。HTTPS ループバックは対象外です（`127.0.0.1` 向けの ACME 証明書を発行する経路がないため）。
:::

<a class="faq-anchor" id="dj-5"></a>

## 5. Session Management 1.0 / Front-Channel Logout 1.0

**仕様**: いずれも OIDC Core とは別に公開されている独立仕様です。

**衝突**: どちらも、サードパーティの iframe が埋め込まれた状態で自分自身の cookie を読めることを前提にしています。モダンブラウザの既定（2017 年以降の Safari ITP、2019 年以降の Firefox ETP、2020 年以降の Chrome `SameSite=Lax`、2024 〜 2025 年のサードパーティ cookie 段階廃止）が、この前提を取り去りました。

::: tip 選択
**未実装** です。discovery 文書には `frontchannel_logout_supported` も `check_session_iframe` も出力しません。代わりに RP-Initiated Logout 1.0 + Back-Channel Logout 1.0(署名済みの `logout_token` を server-to-server で POST する形式)を提供しています。iframe ベースのセッション通知が必要なら、別ライブラリを選んでください。これは未着手の TODO ではなく、設計上のスコープ判断です。
:::

<a class="faq-anchor" id="dj-6"></a>

## 6. JAR `request=` の replay — オプトイン式の `jti` キャッシュ?

**仕様**: RFC 9101 §10.8 は、`exp` 期限内の request object の replay を拒否することを SHOULD(推奨)と書いています。レジストリの実装そのものは MUST ではありません。

**衝突**: 署名を検証して受理するだけでは、傍受された request object を `exp` まで繰り返し `/auth` に提示できます。FAPI 2.0 Message Signing は PAR で署名付き request object を求めますが、`jti` による再利用検知を必須にはしていません。以下のキャッシュはライブラリ独自の追加防御です。

::: tip 選択
**`jti` を持つ request object は重複排除します**。OP は `jar:<use>:<clientID>:<jti>` を `ConsumedJTIStore` に記録し、verifier の max-age / max-lifetime に clock skew を足した時間幅のあいだ保持します。保持期間は OP 側の上限で切り詰めるため、client が遠い未来の `exp` を指定しても marker を無期限に占有できません。ストアは DPoP 証明や client assertion が使うものと同じなので、複数インスタンスで共有すれば 3 つの防御がそろいます。

`jti` のない request object は、`/auth` と `/par` では受理します。RFC 9101 §6.1 がこの claim を任意としており、OFCS の FAPI message signing plan も `jti` のない request object を送るためです。FAPI-CIBA は `/bc-authorize` で `jti` を必須に引き上げ、欠けていれば拒否します（`ErrJTIMissing`）。256 byte を超える `jti` は不正な request object として扱います。
:::

<a class="faq-anchor" id="dj-7"></a>

## 7. プロファイルの宣言 — feature は自動化し、必要な設定のない grant は拒否する

**仕様**: FAPI profile の要件には、PAR / JAR / JARM のように route へ追加できる feature と、デプロイ側が用意する collaborator を必要とするものがあります。RFC 9700 §2.1.1 は public client に PKCE を要求し、confidential client には推奨します。本ライブラリは Baseline と FAPI profile で、これより厳しい「すべての client に適用する」ルールを採用します。互換性が必要な配備では OIDC Core の形も残します。

**衝突**: ハンドラごとに `switch profile` を書くと差分が出ます。すべての要件を自動有効化するのも誤りです。feature は安全に選べますが、store や resolver が設定されていない grant を mount すれば、endpoint だけが生えた中途半端な構成になります。

::: tip 選択
**profile はポリシーを重ねますが、feature と grant の扱いを分けます**。`WithProfile` は必要な feature を自動有効化します。FAPI 2.0 Baseline は PAR / JAR を、Message Signing はさらに JARM を選び、FAPI profile は組み込み側が mTLS を明示しない限り DPoP を選びます。`profile.Baseline` は route に関わる feature を追加しません。`profile.Baseline`、`profile.FAPI2Baseline`、`profile.FAPI2MessageSigning` は、confidential client を含むすべての authorization-code request で PKCE を必須にします。

必要な grant は自動有効化しません。`profile.FAPICIBA` で CIBA grant がなければ `op.New` は失敗し、`WithCIBA(WithCIBAHintResolver(...))` を設定経路として示します。これにより collaborator のない `/bc-authorize` を mount せず、構築時に意味のあるエラーを返せます。解決後の profile、feature、grant、policy は `startup.profile` audit event として 1 回出力されるため、運用者は最初の request より前に実際の posture を確認できます。制約関数は `op/profile/constraints.go`、その適用は `WithProfile` と構築時 validation に集約しています。
:::

<a class="faq-anchor" id="dj-8"></a>

## 8. ACR / AAL マッピング — 内部用語と通信路上の用語

**仕様**: OIDC Core 1.0 が `acr` claim を発行し、RFC 6711 / 8485 が識別子レジストリを規定し、RFC 9470 が `acr_values` + `WWW-Authenticate: error="insufficient_user_authentication"` でステップアップを標準化しています。

**衝突**: 内部 AAL(「ユーザがどの factor を完了したか」)と、通信路に乗って RP に届く OIDC `acr` は、別の語彙です。安直にマップする（たとえば `acr=urn:authn:aal=2` のようなリテラル）と、通信路に乗る語彙が内部分類に縛られ、RP を破壊せずには変えられなくなります。

::: tip 選択
2 層モデルです。内部の AAL 階層は `op/aal.go` に、通信路上の `acr` マッピングは `op/acr.go` に置きます。`RuleACR`(`op/rule.go`)が RFC 9470 のステップアップを実装しています。RP が現在のセッションよりも高い `acr_values` を要求すると、`insufficient_user_authentication` チャレンジを次のステップとともに返します。
:::

<a class="faq-anchor" id="dj-9"></a>

## 9. Issuer 識別子の検証

**仕様**: RFC 9207 は認可応答に `iss` を付けることを必須とし、クライアントはその値を期待する issuer と単純な文字列比較で照合します。OIDC Discovery 1.0 §3 と RFC 8414 §2 は issuer を query / fragment のない HTTPS URL と定義し、metadata の `issuer` が設定文書の取得に使った issuer と一致することを要求します。Discovery §4.1（および RFC 8414 §3.1）は、well-known の URL を組み立てる前に path issuer の末尾 `/` を取り除きます。FAPI 2.0 Security Profile Final §5.3.2.1(1) は、その discovery metadata を AS が配布することを要求します。

**衝突**: URI の構文上は、scheme や host の大文字小文字、既定ポートの表記、末尾 `/` が違う表現も許されます。Discovery も well-known URL の組み立て時に末尾 `/` を取り除きます。これらの仕様は、ライブラリがすべての表現を拒否することまでは要求していません。一方、RFC 9207 と metadata 仕様は、照合する境界ごとに 1 つの issuer 値を要求します。OP と RP の正規化が違えば、issuer 検証は失敗します。

::: tip 選択
`op.WithIssuer` は意図的に厳格な正規化ポリシーを適用し、次のいずれかを含む URI を拒否します。

- 末尾スラッシュ
- scheme の大文字混在
- host の大文字混在
- 既定ポート（https は `:443`、http は `:80`）
- fragment
- query
- 非正規 path（`..`、`.`、`path.Clean` で検出される重複スラッシュ）

query / fragment の拒否は issuer の仕様要件に従いますが、大文字小文字、ポート、末尾スラッシュ、path の規則はライブラリが追加したポリシーです。受理した同じ形を、`iss` を出すすべての場面 — 発行する全アーティファクト、discovery 文書の `issuer` フィールド、認可応答の `iss` パラメタ — で再利用するので、RFC 9207 ミックスアップ防御の単純な文字列比較が end-to-end で同じ値を使います。`op.New` は非正規 issuer では起動せず、ビルド時にエラーを返します。
:::

<a class="faq-anchor" id="dj-10"></a>

## 10. セッション — トランザクションクラスタの内か外か

**仕様**: 該当なし。アーキテクチャ上の判断です。

**衝突**: セッションを認可コード / リフレッシュトークン / クライアントと同じ SQL クラスタに置くと、セッションの書き込みレイテンシがトランザクション経路に直結します。Redis に置くと耐久性が下がります。ただし、セッション喪失はユーザの再ログインで回復できますが、認可コード喪失は RP のループを壊してしまいます。

::: tip 選択
セッションは別サブストア（`store.SessionStore`）としてルーティングでき、Redis などの揮発ストアに置くこともできます。`/end_session` は削除前にセッション snapshot を取得し、BCL coordinator は `GrantStore.ListClientIDsBySubject` による grant 起点の client ID から audience を解決します。snapshot 取得前に eviction が起きると fan-out は開始されず、BCL の no-sessions event も発火しません。`op.AuditBCLNoSessionsForSubject` は、セッションを伴う logout notice が coordinator に届いたものの、eligible な grant 起点 RP target が 0 件だったことを意味します。`op.SessionDurabilityPosture` は embedder が宣言した耐久性を記録し、event を eviction の直接シグナルとせず、logout trigger / snapshot 保持リスクを運用側が解釈できるようにします。
:::

<a class="faq-anchor" id="dj-11"></a>

## 11. JOSE の許可リストと ES256 専用の発行

**仕様**: RFC 8725（JWT BCP）§3.1 は、ライブラリが呼び出し側に許可アルゴリズム集合を指定させ、その集合以外を使わないよう求めています。§3.2 は採用アルゴリズムをアプリケーションが決めるものとし、HMAC 鍵と公開鍵の混同を警告します。別の end-to-end 保護がある場合の `none` を一律には禁止しておらず、ライブラリが `none` を生成・消費するのは明示指定がある場合に限るべきだとしています。

**衝突**: 基盤の JOSE ライブラリは、レジストリ全体を既定で受理します。実行時チェックを足すのは壊れやすく、将来 JOSE ライブラリを直接 import する経路ができればすり抜けてしまいます。

::: tip 選択
`internal/jose.Algorithm` を閉じた列挙型（`RS256`、`PS256`、`ES256`、`EdDSA`）とします。`none` と `HS*` は **そもそも型に存在しません**。`depguard`(lint)は、生のハンドルをすでに扱っている少数の `internal/` パッケージ（`jose`、`keys`、`dpop`、`jar`、`jarm`、`mtls`、`clientauth` など）以外から JOSE パッケージを直接 import することを禁止しています。新しいコードが使うには、このリストへ意図して追加する必要があります。

検証側の許可リストと発行側の方針は意図的に異なります。client assertion と request object は許可された非対称アルゴリズムを受け取れますが、OP が署名する成果物 — ID Token、JWT access token、署名付き UserInfo、JARM response — は P-256 鍵による ES256 だけを使います。この発行方針は固定です。OP 発行 token に RS256 / PS256 を求める RP は対象外です。発行を検証済みの 1 曲線に絞ることで、client assertion を標準どおり受けつつ、alg 交渉と downgrade path をなくします。
:::

<a class="faq-anchor" id="dj-12"></a>

## 12. Discovery 文書 — プロファイルでの絞り込み

**仕様**: OIDC Discovery 1.0 + RFC 8414 がメタデータフィールドを列挙しています。FAPI 2.0 Security Profile Final §5.3.2.1(6) は AS の client authentication を mTLS または `private_key_jwt` に限定し、その結果 `token_endpoint_auth_methods_supported` も絞られます。RFC 9101 §10.1 は、JAR 有効時に `request_object_signing_alg_values_supported` を要求します。

**衝突**: `_supported` 系のリストは、feature の有効化に応じて作られ、有効プロファイルで絞り込まれ、その後 introspection / revocation の auth-method リストにコピーされます。これをハンドラで毎回やると差分が出ます。構築時に 1 か所で決める方が安定します。

::: tip 選択
discovery は `op.New` 時に 1 度だけ構築します（`internal/discovery/build.go`）。プロファイルは `ProfileAllowedAuthMethods` で auth-method リストを絞り、introspection / revocation は絞り込み後のリストをコピーします。リポジトリ内の discovery golden test がプロファイルごとの document 構造を検証しているので、気付かれずに進行するずれも PR の段階で検出できます。
:::

<a class="faq-anchor" id="dj-13"></a>

## 13. `client_assertion` の `aud` — FAPI 2.0 と OIDC Core

**仕様**: RFC 7523 §3 は、JWT bearer assertion の `aud` を「authorization server を識別する値」と要求するだけで、どの識別子かまでは固定していません。OIDC Core 1.0 §9（`private_key_jwt`）はこれを OP の token endpoint URL と読みます。FAPI 2.0 Security Profile Final §5.3.2.1(8) は認可サーバ側の要件を絞り、issuer identifier の値だけを JSON 文字列として受け入れるよう求めています。FAPI client 側にも §5.3.3.1(5) に同じ形の要件があります。RFC 7519 は一般には `aud` の文字列または配列を許しますが、FAPI はこの形を絞ります。

**衝突**: ライブラリの互換 verifier は、OIDC Core の token endpoint 形、FAPI の issuer 形、受理済みの値を含む配列を受け入れます。1 つの OP で両方の方言を扱うには便利ですが、token endpoint URL や `aud` 配列を受け入れるため、FAPI 2.0 Security Profile Final §5.3.2.1(8) には適合しません。Final FAPI プロファイルでは、RFC 7523 の広い解釈よりもプロファイルの要件を優先し、より厳格な検証方針が必要です。

::: tip 選択
汎用ライブラリでは、主 `Audience` と `AuxAudiences` を使う互換動作を維持します。`op.New` はすべての OP で `AuxAudiences` に issuer を入れ、`internal/clientauth/assertion.go` は統合後の経路で `jti` を 1 回だけ消費するため、受理したどちらの方言でも replay 防御をすり抜けることはありません。これはライブラリの互換ポリシーであり、FAPI 2.0 Security Profile Final への適合を意味しません。Final FAPI プロファイルでは、issuer identifier を JSON 文字列で指定した形だけを受け入れ、token endpoint 形と配列形を拒否する必要があります。
:::

<a class="faq-anchor" id="dj-14"></a>

## 14. PKCE — `S256` のみ、`plain` はポリシーで拒否

**仕様**: RFC 7636 §4.2 は `plain` と `S256` の 2 種を列挙しています。§4.4.1 は SHA-256 を計算できない環境のために `plain` を残しつつ、クライアントには `S256` を推奨しています。OAuth 2.1 (`draft-ietf-oauth-v2-1` §4.1.1)と FAPI 2.0 Security Profile Final §5.3.2.2(5) は、`plain` を完全に禁止しています。

**衝突**: RFC 7636 を素直に読めば、クライアントが要求した側を OP は受理します。OAuth 2.1 / FAPI 2.0 を厳格に読めば拒否です。「プロファイルごとのゲート」アーキテクチャだと、同じクライアントが OIDC Core OP では成功し、同じ OP の FAPI 2.0 プロファイル下では失敗する、という挙動になります。これはコードベース全体で避けるように作っている「気付かれずに進行するプロファイル間のずれ」の典型例です。

::: tip 選択
**プロファイルに関係なく** `plain` を拒否します。`internal/pkce.Method` は `"S256"` の単一定数です。`ValidateChallenge` はそれ以外を `ErrChallengeMethodUnsupported` で返し、discovery の `code_challenge_methods_supported` には `S256` のみが残ります。理由は次の 3 点です:

1. `plain` は PKCE 防御を提供しません（verifier がそのまま challenge になってしまうため）。
2. RFC 7636 の SHOULD 解釈は、OAuth 2.1 によって時代遅れになっています。
3. プロファイルを跨いでクライアントの挙動を一定にしたいという方針。
:::

<a class="faq-anchor" id="dj-15"></a>

## 15. DPoP リフレッシュトークンのバインド — public と confidential の分割

**仕様**: RFC 9449 §5.0 / §5.4 は、AS が token endpoint で受け取った DPoP 鍵にリフレッシュトークンをバインドしてもよい（MAY）と書いています。§5.4 は加えて、いったんバインドしたらローテーションを跨いでバインドを保持することを必須としています。

**衝突**: 「MAY 束縛」は本当に両義的です。**常に束縛** にすると、confidential クライアントは chain が存続している間ずっと 1 つの DPoP 鍵に固定されることになり、refresh のたびに DPoP 鍵をローテーションする FAPI 2.0 OFCS のプランと衝突します。**常に未束縛** にすると、public クライアント（SPA、ネイティブアプリ）のリフレッシュトークンが保護のない bearer のまま残ります。これはまさに RFC 9449 §1 が sender constraint を導入する動機として挙げる脅威モデルそのものです。

::: tip 選択
**public は束縛、confidential は未束縛** とします。`TokenEndpointAuthMethod` が `"none"`(public クライアントのシグナル) のクライアントは、初回発行時にリフレッシュ chain を DPoP 鍵にバインドし、§5.4 に従ってローテーションを跨いでバインドを保ちます。confidential クライアント（`private_key_jwt`、`client_secret_*`）は chain を未束縛にし、refresh ごとに DPoP 鍵をローテーションできるようにします。ただし、refresh のたびに発行されるアクセストークンは、提示された DPoP 鍵にバインドされます。そのため、アクセストークンを保持する側には依然として対応する秘密鍵が必要です。実装は `internal/tokenendpoint.refreshDPoPJKT` です。chain がいったんバインドされると §5.4 のバインド維持ルールが適用され、後付けで便宜的にアップグレードして鍵ローテーションをロックすることはできません。この分割は DPoP だけの話です。mTLS にバインドされたリクエストで発行したリフレッシュ chain は、クライアント種別を問わずクライアント証明書にバインドされ、リフレッシュのたびに同じ証明書の提示が必要です（`requireMTLSMatch`）。
:::

<a class="faq-anchor" id="dj-16"></a>

## 16. Introspection — confidential caller、audience 単位の委譲、一様な inactive 形

**仕様**:

> **RFC 7662 §2.2(訳)** AS が active とみなさないトークンへの introspection 応答は `"active": false` を含まなければならず、その場合は `active` メンバだけを返してもよい。

§2.1 は AS が「audience に応じて応答を変えてもよい」とも定めています。クロスクライアントの拒否は許容されますが、必須ではありません。

**衝突**: 解釈は大きく 3 つあります。

1. **緩い解釈** — AS が認識するすべてのトークンを、認証済みなら誰でも introspect できる。発行先でないクライアントにも `"active": true` を返す。
2. **厳格 + 区別可能** — クロスクライアントの introspection は拒否するが、区別可能な形で通知する（HTTP 403 や `error: not_authorized` など）。
3. **audience 単位の委譲** — token の audience が示す resource server を明示的な allow-list で認め、それ以外の caller には unknown / expired / revoked と同じ `{"active": false}` 形を返す。

解釈 2 は応答の形からトークン存在の情報を漏らします。攻撃者は応答の形の違いを観測することで、推測したトークンが *どこかの* 有効な grant に属するかを検出できてしまいます。

::: tip 選択
**`/introspect` は confidential caller だけに開きます**。public client、または token endpoint 認証方式が `none` の client は token 解決より前に `401 invalid_client` を受け取ります。confidential client は自分に発行された access token / refresh token を introspect できます。別 client の access token は、token の audience が示す protected resource の `IntrospectionClients` に caller が登録されている場合だけ委譲されます。この audience 境界を越えた委譲はなく、refresh token は常に委譲されません。認められない cross-client access-token lookup は unknown / expired / revoked と同じ `{"active": false}` 形を返します。active な opaque response には `iss` も含まれます。active な refresh token の応答には `token_type` を含めません。RFC 7662 §2.2 がこのメンバーをアクセストークンの種別と定めているためです。実装は `internal/introspectendpoint` と protected-resource 設定にあり、confidential gate、audience 委譲、refresh-token 拒否をテストで固定しています。
:::

<a class="faq-anchor" id="dj-17"></a>

## 17. `/end_session` — アクセストークンカスケードの範囲

**仕様**: OIDC RP-Initiated Logout 1.0 §6 が次のように書いています。

> **OIDC RP-Initiated Logout 1.0 §6(訳)** ユーザがサインアウトしたあとに、OP はアクティブなセッション、リフレッシュトークン、アクセストークンを失効させてもよい。

Back-Channel Logout 1.0 §2.3 は RP 側の fan-out を規定するだけで、AT 失効の到達範囲には触れていません。

**衝突**: 「MAY」を素直に読むと、「cookie だけ消して立ち去る」から「subject が保有する grant をすべて失効させる」まで幅広く取れます。それぞれ影響範囲が違います:

- **cookie のみ**: 発行済みのアクセストークンは `exp` まで有効なままです。OP に戻ってこない JWT は引き戻せません。
- **OP のエンドポイントで失効させる**: `/userinfo` と `/introspect` はその場で inactive を返します。JWT をオフラインで検証する RS には届きません。
- **opaque トークン** はあらゆる RS に届きます。オフライン検証の経路がないので、次の introspection で inactive になります。

::: tip 選択
**既定でカスケードします**。`/end_session` は subject が保有する grant をすべて列挙し、それぞれの配下に発行されたものを失効させます。対象は JWT アクセストークン（失効戦略に従い、既定は grant tombstone）、opaque アクセストークン、リフレッシュトークンです。tombstone 戦略では、その grant への以後の発行も止めます。各クラスは、設定した `Store` が公開するサブストアを通して失効させます。サブストアがないクラスは飛ばし、`Grants` を公開しない store では「cookie のみ」の方針になって、アクセストークンは自然失効を待ちます。失敗したクラスは audit に記録しますが、サインアウト自体は止めません。他の失効契機との到達範囲の比較は <a href="#dj-19">#19</a> の表にあります。

JWT と opaque で到達範囲が違う点（JWT は OP のエンドポイントのみ、opaque は introspection 経由ですべての RS まで）は、<a class="doc-ref" href="/ja/concepts/access-token-format">access-token-format</a> ページに切り出してあります。この差が問題になる組み込み側は、どちらの形式を発行するかを選ぶことで対処できます。
:::

<a class="faq-anchor" id="dj-18"></a>

## 18. アクセストークンの形式 — 既定は JWT、opaque はオプトイン、audience ごとに上書き

**仕様**: RFC 9068 が JWT 形式の OAuth 2.0 アクセストークンを標準化しています。RFC 6749 自体は、アクセストークンを opaque な bearer 文字列として扱うだけです。RFC 7662 introspection はオプションです。RFC 8707 は、単一クライアントが 1 回のフローで複数の resource 向けトークンを要求できるようにします。

**衝突**: どちらの方向の既定にしても、筋は通ります。

- **既定 JWT** — 各 RS がローカル検証でき、`/introspect` の往復が不要で、水平にスケールできます。ただし、`/end_session` は OP に戻ってこない JWT を `exp` まで引き戻せません。
- **既定 opaque** — 各 RS が OP を呼び出すことになるため、レイテンシが OP 経路と結合します。ただし、失効が即時に届きます。

ハードコードされた単一の既定は、すべての組み込み側を 1 つのトレードオフに縛ります。RFC 8707 の audience 単位選択を採用すれば、同じ OP が同じ認可の中で、異なる RS に異なる形式を発行できます。

::: tip 選択
**既定は `op.AccessTokenFormatJWT`** です。典型的な水平スケールの RS 構成と一致し、通信路上の形式が既製の JWT verifier と互換になります。`op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)` でグローバル既定を opaque に切り替えられ、`op.WithAccessTokenFormatPerAudience(map[string]op.AccessTokenFormat{...})` で RFC 8707 の resource indicator 単位に選択できます。失効の到達範囲を重視する audience(admin API、payment API など)は opaque、汎用 API は JWT、というふうに混在させられます。完全なトレードオフ（負荷の集中、ヘッダサイズ、カスケードの到達範囲、ストレージ形式）は <a class="doc-ref" href="/ja/concepts/access-token-format">access-token-format</a> ページにまとめてあります。本エントリは、*選択* の事実を、他の意図的な仕様読解と並べて残すためのものです。
:::

<a class="faq-anchor" id="dj-19"></a>

## 19. JWT アクセストークン失効戦略 — `jti` 単位レジストリより grant 単位の tombstone

**仕様**: RFC 6749 §4.1.2 は、コード再利用時に AS が「可能であれば失効させるべき」と書いています。RFC 6819 §5.2.1.1 はサーバ側に再利用検出の不変条件を期待します。RFC 7009 §2.2 は、self-contained なトークンに対する revocation を未対応にしてもよいと許容します。FAPI 2.0 Security Profile Final §5.3.4(3) は、RS に access token の有効性、完全性、期限、失効状態の検証を要求します。この要件は RS の境界で課され、OP 側の保存方式を規定していません。

**衝突**: 「すべての `jti` を shadow して revocation で行を反転」という素直なモデルは、仕様を満たします。ただし、トランザクションストアに `O(発行レート × AT_TTL)` の行を載せることになり、N 件の AT を持つユーザのログアウトは N 件の UPDATE になります。逆に「失効処理を持たず、JWT は `exp` まで有効のままにする」は、RS に失効状態を確認する手段がない限り、FAPI 2.0 Security Profile Final §5.3.4(3) の要件を満たせません。

中間の解は、JWT を self-contained に保ったまま、**トークンごとではなく grant ごと** にサーバ側の状態を結びつけることです。失効した grant につき 1 行書けば、その grant 配下のすべての AT に効きます。発行時に書く必要はありません。

::: tip 選択
**既定は `op.RevocationStrategyGrantTombstone`** です。各 JWT AT は `gid` という private claim(OP 側の GrantID。RFC 7519 §4.3、omitempty)を持ちます。OP のエンドポイント（`/userinfo`、`/introspect`）は検証時、`gid` をキーにして小さな grant 単位の tombstone テーブルを参照します。カスケード（ログアウト、コード再利用、refresh chain 侵害）は、失効した grant 1 件あたり 1 件の tombstone 行を、`/revoke` の単一 AT 失効は失効した `jti` 1 件あたり 1 件の deny-list 行を書きます。既定では `/token` の発行経路でデータベース書き込みは発生しません。定常状態の行数は `O(失効した grant 数 + 失効した jti 数)` であり、`O(発行数)` ではありません。

AT 単位の監査ログが必要な組み込み側は、`op.WithAccessTokenRevocationStrategy(op.RevocationStrategyJTIRegistry)` を選ぶと、`store.AccessTokenRegistry` に発行ごとの shadow 行を残します。どちらの戦略も OP が提供する endpoint ではサーバ側の失効状態を参照できますが、OP 側の戦略を選ぶだけでは FAPI Final への適合を示せません。RS は §5.3.4(3) を満たす必要があります。`op.RevocationStrategyNone` は、RFC 6749 §4.1.2 の「SHOULD」の余地を明示的に受け入れる、非 FAPI デプロイ向けの第 3 の選択肢です。ただし `op.New` は、いずれかの FAPI プロファイル下ではこの選択を拒否します。

opaque AT 経路（`op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)`）は、この戦略選択の影響を受けません。opaque の検証はレコード参照が必要なため、ストレージは本質的にトークン単位だからです。実装は `op/access_token_revocation.go`、`internal/tokens`(gid claim)、`op/store/grant_revocation.go`、および各バックエンドアダプタにあります。
:::

すべての契機は 1 つの所有者（`internal/grants/teardown`）を通り、契機ごとの影響範囲が型で決まります。grant は 1 人の subject が 1 つの client 上に持つすべてのセッションで共有されるため、ほとんどの契機は意図的に grant 全体までは広げません。

| 契機 | 失効させるリフレッシュトークン | 失効させるアクセストークン | grant への以後の発行 |
|---|---|---|---|
| `/end_session`（subject が持つ各 grant について） | grant のすべて | grant のすべて（JWT と opaque） | 止める |
| 認可コードの replay | grant のすべて | grant のすべて | 止める |
| リフレッシュトークンの replay（猶予期間後の再利用） | replay された chain。chain の根を解決できなければ grant のすべて | grant のすべて | 止める |
| リフレッシュトークンの `/revoke` | その chain。chain の根を解決できなければ grant のすべて | grant のすべて | 止めない（他の chain と未使用の認可コードは引き換え可能） |
| リフレッシュのローテーション | 直前のトークン | 同じ chain から発行された opaque のもの | 止めない |

「止める」は tombstone 戦略での挙動です。tombstone が、その grant のリフレッシュトークンと認可コードの引き換えも拒否します。`/revoke` の行はアクセストークンだけを対象にした tombstone（`store.GrantTombstone.AccessTokensOnly`）を書きます。store が任意のインターフェース `store.IssuanceRevocationChecker` を実装していれば、token endpoint は chain や認可コードがまだ発行できるかの判定でこの種別を無視できます。ローテーション時の chain 単位の opaque 失効には `store.OpaqueAccessTokenChainRevoker` が必要です。どちらも実装しない store や `ChainID` を保持しない store は grant 全体の挙動に戻ります。これは失効が足りなくなる方向ではなく、多すぎる方向のずれです。`/revoke` は `token.revoked` を記録し、`surface` には `refresh_chain` を、grant のリフレッシュトークンへ切り替えた場合は `refresh_grant` を入れます。

別の client が提示した認可コードやリフレッシュトークン、`redirect_uri` や PKCE の検証に失敗したものは replay ではありません。何も消費せず、何も失効させません。上の表が動くのは、本物の replay だけです。
<a class="faq-anchor" id="dj-20"></a>

## 20. DCR の `client_secret` 保存と再開示

**仕様**: RFC 7591 §3.2.1 は、登録応答における `client_secret` を optional とします。RFC 7592 §2.1(読み取り)と §2.2(更新)も、応答ボディに `client_secret` を再掲することを許可しますが、要求はしていません。

**衝突**: 「平文を保存しておいて GET ごとに再開示する」読みは、最も実装が単純で、歴史的に一部の OP がそうしてきました。しかしこれは、ストアに永続的に復号可能な平文を残すことになり、登録レコードを DB 上で最も機密度の高い行に押し上げます。逆に「POST 時点で hash 化し、それ以降は再開示しない」読みは、OP 内の他のクレデンシャルすべての保存方式に揃い、平文を復号できる状態で残す場所を完全になくせますが、POST 応答（平文を 1 度だけ取得可能）と GET 応答（平文は永久に取得不可）の間に非対称が生じます。

::: tip 選択
**保存は hash のみ。平文は `POST /register` で 1 回だけ応答に乗せ、`PUT /register/{client_id}` では `token_endpoint_auth_method` が `none` から confidential 方式に変わったときにだけ再掲します**。confidential から confidential への更新は既存の hash を保つので、メタデータの編集で secret が勝手に入れ替わることはありません。

`GET /register/{client_id}` では `client_secret` を再開示しません。平文へのアクセスが復号可能な形で必要な組み込み側は、最初の POST 応答の時点で自前のコピーを保管します。OP は平文の一次保管者にはならない方針です。実装は `internal/registrationendpoint/manage.go` および `internal/registrationendpoint/register.go` にあります。ストレージは `op/store/client.go` の `SecretHash` のみで管理されるので、すべての `store.ClientStore` 実装に同じ方針が適用されます。
:::

<a class="faq-anchor" id="dj-21"></a>

## 21. RFC 7592 PUT 省略のセマンティクス

**仕様**: RFC 7592 §2.2 は、次の 2 文で構成されます。

> **RFC 7592 §2.2 第 1 文（訳）** 応答で返されるメタデータの値は、それ以前のクライアントに紐付いていた値を *置換* するものとし、追加してはならない。

> **RFC 7592 §2.2 第 2 文（訳）** サーバはリクエスト中の null または空の値を、他の値と同様に無視してもよい。

**衝突**: 第 1 文を厳密に読むと、PUT で `grant_types` が省略されたら「`grant_types` を削除する」を意味することになります。結果として、クライアントが grant 能力を持たなくなり、その後の `/token` 要求がすべて壊れます。第 2 文の MAY 句は、参照実装が揃ってこのフットガンを避けるために使う逃げ道ですが、エコシステムは単一の置換ポリシーに収束していません。

::: tip 選択
**省略された *既定値付き* フィールドは、サーバの既定値にリセットし、省略された *任意* フィールドは空値にします**。既定値付きの集合は `grant_types`、`response_types`、`token_endpoint_auth_method`、`application_type`、`subject_type`、`id_token_signed_response_alg` で、PUT で省略された場合はレコードから消えるのではなく、OP のドキュメント化された既定に戻ります。任意メタデータ（`client_uri`、`logo_uri`、`policy_uri`、`tos_uri`、`contacts` ほか）は、省略によって素直に空値になります。

サーバ管理のフィールド — `registration_access_token`、`registration_client_uri`、`client_secret_expires_at`、`client_id_issued_at` — はボディに存在すれば `400 invalid_request` で拒否し、認証中のクライアントの `client_secret` と一致しない値を送った場合も同様に拒否します。

「クライアントが意図的に省略したのか、サーバが既定値を埋めたのか」を区別する sparse な永続化ビットは保持しません。既定値付きフィールドの通信路上の挙動は、どちらの読みでも同一になるためです。実装は `internal/registrationendpoint/manage.go` (`validateManageUpdateRequest`)と `internal/registrationendpoint/metadata.go`(`applyMetadataDefaults`) にあります。
:::

<a class="faq-anchor" id="dj-22"></a>

## 22. `sector_identifier_uri` の fetch 上限と native loopback の扱い

**仕様**: OIDC Core 1.0 §8.1 が、`sector_identifier_uri` の fetch と、登録された `redirect_uris` の包含検証を必須と規定しています。

> **OIDC Core 1.0 §8.1(訳)** `redirect_uris` に登録された値は、その配列の要素に含まれていなければならない。さもなければ登録は失敗しなければならない。

timeout もボディサイズも、仕様には書かれていません。OIDC Registration §2 は、`application_type=native` の loopback host として `localhost`、`127.0.0.1`、`[::1]` を列挙します。RFC 8252 §8.3 は、DNS rebinding を理由に、`localhost` を IP リテラルより劣後（NOT RECOMMENDED）と書いています。

**衝突**: 「言語の既定で fetch」は、実質「上流が応答するまで goroutine を保持し続ける」を意味し、応答ボディも無制限です。登録時にこのままはどちらもフットガンです。`localhost` については、OIDC Registration §2 と RFC 8252 §8.3 が一致しません。OIDC 側は native でこれを認めるのに対し、OAuth 側は推奨しません。Web クライアントの `http://localhost/cb` 登録は、native クライアントの同じ登録とは別問題です。

::: tip 選択
**取得は 5 秒のタイムアウト、64 KiB のボディ上限、HTTPS 限定、リダイレクト禁止、24 時間の成功キャッシュに制限します**。失敗はキャッシュしません。キャッシュヒット時も、その時点で登録しようとしているクライアントの redirect URI 集合に対して包含チェックを再実行するため、同じ sector 配下の別クライアントに許可範囲が広がることはありません。

後続の fetch でリモート文書の正規化 hash が変わった場合、resolver は `ErrSectorContentChanged` を 1 回返し、古い cache entry を退避します。その次の正当な登録で新しい文書を使って cache を再構築できるため、RP 側の正当な manifest 更新は OP 再起動なしに回復できます。一方で、予期しない sector 変更は運用者に見える形で一度浮き上がります。取得失敗または包含未達は `400 invalid_client_metadata` を返し、原因（host、TLS の状態、部分的な byte 列）は監査ログに記録しますが、応答ボディには乗せません。上流の詳細を漏らさないためです。

loopback host については、`application_type` で分岐します。Web クライアント（既定）は `127.0.0.1` と `[::1]` を `http` で受理しますが、文字列 `localhost` は、組み込み側が `op.WithAllowLocalhostLoopback()` で明示的にオプトインしない限り拒否します。Native クライアント（`application_type=native`）は、OIDC Registration §2 に従い 3 種すべての loopback host を無条件で受理します。加えて、claimed `https`、および RFC 8252 §7.1 の reverse-DNS な custom URI scheme(`com.example.app:/cb` など)も受け付けます。`.` を含まない custom scheme は、アプリ間で衝突しやすいため拒否します。

authorize 時の loopback ポートワイルドカードは、クライアント単位の別オプション（#dj-4）で制御する形にして、本ルールと役割が分かれて重ならない設計にしています。実装は `internal/registrationendpoint/sector_identifier.go` および `internal/registrationendpoint/metadata.go`(`validateRedirectURI`、`validateNativeRedirectURIScheme`)にあります。
:::

<a class="faq-anchor" id="dj-23"></a>

## 23. 外向き JWKS / メタデータ取得の SSRF 境界

**仕様**: OIDC Dynamic Registration、JAR、private_key_jwt、pairwise subject、Back-Channel Logout は、いずれも RP 管理メタデータから OP に外向き URL を取得させます。各仕様は「何を取得するか」は定めますが、private network、loopback、DNS rebinding、custom TLS root に対する共通の SSRF 境界は定めていません。

**衝突**: conformance runner、内部 CA、public trust に載っていない RP network では custom transport が必要になります。一方、HTTP client 全体を差し替え可能にすると、呼び出し側が意図せず dial-time の SSRF guard まで外してしまえます。custom transport を拒否すれば guard は単純ですが、正当な deployment まで動かなくなります。

::: tip 選択
**外向き trust と外向き到達性を別の knob に分けます**。`op.WithJWKSHTTPTransport` は RP JWKS fetch 用の TLS trust / transport 設定を組み込み側に渡させますが、`*http.Transport` であれば package 側で dial 関数を gate 付き dialer に差し替えるため、接続時の SSRF deny-list は引き続き発火します。それ以外の `http.RoundTripper` は、各リクエストとリダイレクトの URL だけを検査するので、DNS rebinding を仕掛ける相手は防げません。proxy 経由では、接続時の gate が見るのは proxy のアドレスで、宛先 URL は引き渡す前に 1 回検査します。private network の許可は `WithAllowPrivateNetworkJWKS` / `WithAllowPrivateNetworkJAR` 系の明示 policy knob が担い、custom transport 単体では network 境界を広げません。

JAR JWKS、client-auth JWKS、`sector_identifier_uri`、Back-Channel Logout destination には同じ bounded-fetch posture を適用します。まず URL 形状を検証し、次に dial-time network check を行い、最後に bounded response handling を行います。実装は `op/options_session.go`、`internal/netsec`、`internal/securefetch`、`internal/jar`、`internal/endpointsupport/clientauth.go`、`internal/registrationendpoint/sector_identifier.go` にあります。
:::

<a class="faq-anchor" id="dj-24"></a>

## 24. Open DCR で省略された `scope`

**仕様**: RFC 7591 は、登録メタデータの `scope` を optional とします。IAT-bound な登録では、Initial Access Token の発行者は operator code であり、明示的な `AllowedScopes` policy を付与できます。Open registration には、その operator 発行の per-request envelope がありません。

**衝突**: 省略された `scope` を「public scope すべて」と扱うと、body の薄い open-registration POST が予想以上に強い client を作ります。逆に「scope なし」と扱う方が安全ですが、client は scope を明示するか、組み込み側が default を設定する必要があります。

::: tip 選択
**Open registration では、省略された `scope` を空の登録 scope set として保存します**。その後の `/auth` で client が登録していない scope を要求した場合は、`invalid_scope` で拒否します。public default を意図的に持たせたい組み込み側は、`RegistrationOption.OpenRegistrationDefaultScopes` でオプトインします。この値は構築時に OP の scope レジストリに対して検証されます。

IAT-bound 経路は、operator-trusted な広い既定を維持します。IAT に `AllowedScopes` がなければ、public scope レジストリから既定を取れます。実装は `op/registration.go`、`op/options_validate.go`、`internal/registrationendpoint/handler.go`、`internal/registrationendpoint/register.go`、`internal/registrationendpoint/metadata_validate.go` にあります。
:::

<a class="faq-anchor" id="dj-25"></a>

## 25. `client_assertion` replay 消費より前の DPoP nonce challenge

**仕様**: RFC 9449 は、AS が token request に `use_dpop_nonce` を返し、client が fresh な DPoP 証明で retry する形を許します。RFC 7523 は、JWT client assertion に `jti` / 時刻 window による replay protection を要求します。

**衝突**: token endpoint が先に client authentication を行うと、初回 request で `client_assertion` の `jti` を消費したあとに `use_dpop_nonce` を返すことになります。client が form body はそのまま、DPoP 証明だけを差し替えて retry すると、nonce challenge の回復経路であるにもかかわらず `invalid_client` / assertion replay で失敗します。

::: tip 選択
**token / PAR 経路では、client authentication より前に DPoP nonce を検証します**。nonce が欠けている、または古い場合は、form に載った `client_assertion` を消費せずに nonce challenge を返します。DPoP 証明が受理可能になってから、通常の private_key_jwt replay cache が assertion を 1 回だけ消費します。実装は `internal/tokenendpoint/authcode.go`、refresh-token の token 経路、`internal/parendpoint/par.go` にあり、`internal/tokenendpoint/refresh_dpop_nonce_pkjwt_test.go` が固定しています。
:::

<a class="faq-anchor" id="dj-26"></a>

## 26. CIBA / FAPI-CIBA の polling と error taxonomy

**仕様**: CIBA Core 1.0 は poll / ping / push mode、`slow_down`、および §13 の error vocabulary を定義します。poll abuse の lockout 閾値は実装定義です。FAPI-CIBA は CIBA の上に signed request-object 要件を重ねますが、conformance module は CIBA らしい通信路上の error を期待します。

**衝突**: 上限のない poll ladder は、client が `slow_down` を無視して `auth_req_id` の期限まで高速 poll し続けられる状態を作ります。低い上限を hard-code すれば本番保護にはなりますが、反復 poll を意図的に行う OFCS module を壊す場合があります。また、`/bc-authorize` から詳細な JAR parser error をそのまま出すと debug には便利ですが、CIBA endpoint が期待する `invalid_request` ではなく JOSE 固有の taxonomy が通信路に漏れます。

::: tip 選択
**本ライブラリは CIBA poll mode のみを実装し、slow_down strike counter に上限を置きます**。既定上限は 5 回です。`op.WithCIBAMaxPollViolations(n)` で上げ下げでき、`0` はライブラリ既定、`255` は counter が `uint8` であるため実質的に lockout 無効化を意味します。本番 deployment では有限の上限を推奨します。`op.New` は、負の `WithCIBADefaultExpiresIn` と `WithCIBAPollInterval` も拒否し、FAPI-CIBA では既定または最大の有効期限が 10 分を超える設定も拒否します。

`/bc-authorize` では single-valued parameter の重複を拒否し、request object の失敗は CIBA Core §13 に合わせて `invalid_request` に写像します。FAPI-CIBA では JAR verifier が `iat` を要求し、request object lifetime を 60 分に制限し、RP JWKS は OP の他の箇所と同じ SSRF-bounded fetcher で取得します。実装は `op/options_ciba.go`、`internal/ciba/polling.go`、`internal/cibaendpoint`、`internal/jar`、`op/op_builders.go` にあります。
:::

<a class="faq-anchor" id="dj-27"></a>

## 27. JWE 許可リストと JOSE nesting 上限

**仕様**: RFC 7516 と RFC 7519 は、広い JWE algorithm 集合と nested JWT 形状を許します。原理的には、JWT が JWE に包まれ、その JWE がさらに別の JWE に包まれ、という形を取り得ます。

**衝突**: 汎用 JOSE library が対応するすべての形を受理すると、OP が必要とする範囲を超えて暗号面が広がります。layer ごとの plaintext cap は各復号の memory を守りますが、攻撃者が制御する nesting chain 全体の長さはそれだけでは制限できません。

::: tip 選択
**JWE は policy で閉じ、nested JOSE の走査に上限を置きます**。OP は明示的な `alg` / `enc` 許可リストだけを受理し、未知の `crit` を拒否し、復号後 plaintext を 1 MiB に制限し、11 層目の JOSE layer を `ErrJWENestingTooDeep` で拒否します。通常の暗号化 request object は最大でも 2 層（JWE wrapping JWS）なので、10 層の上限は将来の protocol 形状に余地を残しつつ、再帰を無制限にしません。

実装は `internal/jose/jwe.go` にあり、JAR / PAR verification を通じて使われます。`internal/jar/verify_jwe_test.go` と、深い nested encrypted request object の scenario coverage が固定しています。
:::

<a class="faq-anchor" id="dj-28"></a>

## 28. Custom grant のリフレッシュトークン — ハンドラの値か、OP 発行の資格情報か

**仕様**: RFC 6749 §6 は、リフレッシュトークンを authorization server が発行する資格情報として扱います。RFC 9700 §4.14.2 は、public client のリフレッシュトークン replay を検出するため、sender-constrained refresh token またはローテーションのいずれかを AS に要求します。ローテーションでは新しい token を発行し、旧 token を関係を保持したまま無効化し、再利用で侵害が分かったときは有効な token を失効させます。

**衝突**: custom grant は意図的にハンドラ定義です。`AccessToken` と同じようにハンドラが任意のリフレッシュトークン文字列を返せる設計は一見自然ですが、値と親子関係を OP が作っていない資格情報は、OP がローテーション、バインド、連鎖失効できません。逆にリフレッシュトークンを全面的に拒否すると、長寿命のサービスチェーンを OP 既存のローテーション機構に乗せたい custom grant や token-exchange policy が作れません。

::: tip 選択
**ハンドラは意図だけを示し、リフレッシュトークン値は OP が所有します**。`CustomGrantResponse.IssueRefreshToken` は、OP に `RefreshTokenStore` 経由でリフレッシュトークンを生成・永続化させるフラグです。レコードは発行アクセストークンと同じ grant 識別子と DPoP / mTLS confirmation を共有するため、通常のローテーション、再利用時の連鎖失効、grant 失効、introspection の意味論に乗ります。ハンドラがリフレッシュトークン文字列を直接渡す経路はありません。

発行は 5 つの gate で決まります。provider が `refresh_token` を提供していること、client が登録していること、response の subject（または束縛されたアクセストークンの subject）が空でないこと、response の scope が空でないこと、response の audience が 1 件以下であることです。いずれかに失敗してもアクセストークン応答と、他の発行条件を満たす ID Token は成功し、リフレッシュトークンだけが省略され、`custom_grant.refresh_dropped` が理由を記録します。scope が空の場合も、落ちるのはリフレッシュトークンだけです。実装は `internal/tokenendpoint/customgrant.go` にあり、token-exchange も `TokenExchangeDecision.IssueRefreshToken` で同じ方針を通します。

一般的な custom grant の資格情報について、subject を保証するのは grant レコードではなくハンドラです。そのため、ハンドラが grant を記録しない限り、`Provider.RevokeSubject` はそれらを失効させず、期限切れか個別の失効まで生きたままです。pairwise subject 下の `/userinfo` は、それらに `invalid_token` を返します。アカウント削除時の失効は、ハンドラの責任です。token exchange は違います。その資格情報は `subject_token` の grant 配下に置かれるので、その grant を失効させればまとめて失効し、exchange で得たリフレッシュトークンも、subject の削除後はローテーションされなくなります。
:::

<a class="faq-anchor" id="dj-29"></a>

## 29. Device-code 失効 — 監査 hook か、ライブラリ内蔵の連鎖失効か

**仕様**: RFC 8628 は device authorization の状態遷移を定義しますが、ユーザが後からデバイス登録を解除したとき、その device authorization から既に発行されたアクセストークンをどう扱うかまでは明記しません。RFC 7009 は AS の revocation endpoint を定義しますが、デバイス登録解除は標準の通信路リクエストではなく、組み込み側の UX アクションです。

**衝突**: 失効が device-code 行を拒否状態にするだけなら、以後のポーリングは止まりますが、既に発行されたアクセストークンは `exp` まで動き続けます。一方、組み込み側が監査イベントを購読して `RevokeByGrant` を自前で呼ぶ設計にすると、デプロイごとの別経路の接続コードを忘れないことに安全性が依存します。

::: tip 選択
**公開ヘルパが連鎖失効まで所有します**。`devicecodekit.Revoke` はまず device-code 行を拒否状態にします。次に、device flow がその device code 用に割り当てた grant 識別子を再計算し（device-code ID からの一方向の導出なので、device code そのものは再び公開されません）、その grant 配下に発行されたものを失効させます。JWT アクセストークンは `Deps.RevocationStrategy` に従い、opaque アクセストークンは `Deps.OpaqueAccessTokens` があれば、リフレッシュトークンの chain は `Deps.RefreshTokens` があれば対象です。`Deps.Grants` を設定していれば、連鎖失効が完了したあとで最後に同意レコードを削除するので、その同意が以後の認可リクエストを満たすことはなくなります。どれかのクラスが失敗しても、残りは試行します。部分的な失敗は結合したエラーを返し、`cascade_complete=false` を記録します。同じ呼び出しを繰り返せば、残りを完了できます。

nil のまま残したサブストアは飛ばします。JWT のみの構成や、失効を別経路で流す構成でも、行は拒否状態になり監査イベントも発火しますが、ヘルパは飛ばした連鎖失効が実行されたとは主張しません。`device_code.revoked` には、試行したクラスごとに 1 つずつ extra（`revoked_access_tokens`、`grant_tombstone_written`、`revoked_opaque_access_tokens`、`refresh_token_cascade_complete`、`grant_record_deleted`）と `cascade_complete` が入り、連鎖失効が想定に届かなかった場合を運用側で検知できます。実装は `op/devicecodekit.Revoke` にあります。
:::

<a class="faq-anchor" id="dj-30"></a>

## 30. CookieKeys — 常に必須か、ブラウザ認可時だけ必須か

**仕様**: OIDC Core と OAuth 2.0 は認可・トークンのプロトコルを定義しますが、OP がブラウザ cookie を使うこと自体は要求していません。cookie 暗号化は、本ライブラリが interaction / session を束縛するための実装詳細です。

**衝突**: 実装方針としては 2 つあり得ます。

- **常に cookie key を要求する** — ドキュメントは単純になり分岐も減りますが、`client_credentials` 専用 OP やブラウザを使わないデプロイでも、使わない secret を設定する必要が出ます。
- **ブラウザ認可が有効なときだけ要求する** — サービス間通信専用の構成には正確で扱いやすい一方、どの grant が暗号化 cookie を必要とするかを、ハンドラがマウントされる前に option 層で判断する必要があります。

::: tip 選択
`WithIssuer`、`WithStore`、`WithKeyset` は無条件の構築要件です。`WithCookieKeys` は、有効な grant 集合に `authorization_code` が含まれる場合だけ必須です。既定の grant 集合には `authorization_code` が含まれるため、通常のブラウザフローでは必要になります。authorization-code flow はブラウザの interaction state を session / CSRF cookie で束縛するため、ここには暗号化鍵が必要です。一方、`authorization_code` を明示的に外した `client_credentials` 専用デプロイは cookie key 無しで起動できます。

この規則は `validateCookieKeysRequired` に集約しています。将来、authorize endpoint の cookie を必要とする grant が増えた場合も、ハンドラ側ではなくこの検証に追加できます。個々の鍵は AES-256-GCM に合わせて 32 byte ちょうどでなければなりません。実装は `op/options_validate.go`、ドキュメントは [必須オプション](/ja/getting-started/required-options) にあります。
:::

<a class="faq-anchor" id="dj-31"></a>

## 31. Grant Management — draft 仕様面と明示的な有効化

**仕様**: OAuth 2.0 Grant Management はまだ IETF draft です。安定した `grant_id` と、`create`、`replace`、`merge`、`query`、`revoke` の 5 action を定義しますが、公開 RFC になるまでに通信路上の形が変わる可能性があります。

**衝突**: 長命な consent を扱う OP では、grant に名前を付け、クライアントが後で query や失効ができることに明確な価値があります。一方、draft 機能を既定で有効化すると、全デプロイに変動中の通信契約を露出し、運用者がまだ支える準備のない意味論を discovery に広告してしまいます。

::: tip 選択
Grant Management は **既定では無効で、明示的に experimental として扱います**。`op.WithGrantManagement(actions, actionRequired)` は OP が受け付ける action set を正確に列挙し、その同じ集合を discovery で広告し、PAR / authorize-time (`create` / `replace` / `merge`) と endpoint-time (`query` / `revoke`) の両方で強制します。未知 action、重複 action、空の action set、action と `grant_id` の不整合は、構築時またはリクエスト検証時に拒否します。

有効化すると token 応答に `grant_id` を載せ、`/grant_management` の query / revoke endpoint をマウントします。存在しないこと、または別 client の所有であることが確定した grant には `404` を返しますが、存在を判断できない store 障害は cascade を試みず `500 server_error` を返します。cascade の失敗も `500` と失敗監査イベントになり、grant は再試行・照会できる状態に残ります。別リクエストが先に削除した最終 delete だけは冪等な `204` です。draft の面はこの option の背後に隔離しているため、将来、通信互換性を壊す draft 更新が来ても、偶発的な既定変更ではなく明示的な移行として扱えます。実装は `op/grant_management.go`、`internal/parendpoint`、`internal/authorizeendpoint`、`internal/grantmgmtendpoint`、`internal/tokenendpoint` にあります。
:::

<a class="faq-anchor" id="dj-32"></a>

## 32. 認可ごとの状態 — grant から読まず、資格情報に持たせる

**仕様**: OIDC Core 1.0 は `auth_time`、`acr`、`amr` を ID Token の背後にある認証イベントの性質と定め、`claims` リクエスト（§5.5）はそれを運んだ認可リクエストに紐づけています。RFC 9396 は `authorization_details` を、そのリクエストでリソースオーナーが許可した内容に結びつけます。

**衝突**: ライブラリは (subject, client) の組ごとに `store.Grant` を 1 つ持ち、同意を引き継ぐために認可をまたいで再利用します。資格情報を使う時点でこの共有レコードから `auth_time`、claims、details を読むと、後の認可が先の認可の報告内容を書き換えてしまいます。同じユーザが 2 回目にログインしたあとで引き換えた認可コードは、ID Token に 2 回目のログインを示し、2 回目のリクエストが求めた claims を開示し、許可していない `authorization_details` まで拾います。

::: tip 選択
**資格情報は、自分を発行した認可の状態を持ちます**。`store.AuthorizationCode`、`store.RefreshToken`、`store.OpaqueAccessToken` が `AuthTime`、`ACR`、`AMR`、`AuthorizationDetails`、claims リクエストを保持します。リフレッシュのローテーションはそれらを後継に引き継ぐので、chain の ID Token、アクセストークン、introspection 応答は、その chain 自身の認可を表します。Grant Management の `replace` は、生きているトークンからの details の取り下げを反映しますが、後の認可が足した内容がそれらに届くことはありません。`claims` パラメータなしでユーザ操作を挟まずに返した認可は、自分のリクエストが求めた claims だけを開示し、同じ grant 上の以前のリクエストが求めた claims は開示しません。

認可コードやその refresh chain から発行する JWT アクセストークンは、`userinfo_claims` という private claim も持ちます。値は claims リクエストの `userinfo` メンバー、リクエストがなければ `{}` です。`/userinfo` はここから claims を開示します。リソースサーバは無視してかまいません。この名前は予約されているので、custom grant が extra claims で設定することはできません。

`AuthorizationRecorded` が、状態を持つ行の目印です。目印のない行（たとえば、これらのフィールドを永続化しない store が書いた行）は grant の値に戻るため、独自 store はフィールドを永続化するまで共有 grant の挙動のままで動作します。実装は `internal/tokenendpoint`、`internal/tokens`、`op/store` にあります。
:::

<a class="faq-anchor" id="dj-33"></a>

## 33. 再利用されたセッションでのステップアップルール

**仕様**: OIDC Core 1.0 §3.1.2.1 は `prompt` と `max_age` を、RFC 9470 は `acr_values` によるステップアップを定義しています。ユーザがすでにセッションを持つシングルサインオンの場面で、OP 自身のポリシールールがどう働くかは、どちらも規定していません。

**衝突**: `RuleClient` や `RuleScope` などの `LoginFlow` ルールは、特定の client や scope を追加の factor の背後に置きます。ルールを factor chain の実行中にしか評価しないと、primary factor だけで確立したセッションが、要求を覆うキャッシュ済み grant や first-party の同意スキップを通って、ルールに一度も会わないまま保護された client や scope に届いてしまいます。

::: tip 選択
**セッションから発行する前に、ルールと `Decider` を評価します**。chain がちょうど `Primary` を完了したものとして扱います。どれかがステップを要求すれば、`/auth` は発行せず、セッションの subject から chain を実行します。`prompt=none` なら `interaction_required` を返します。セッションの以前のログインで通った factor は、ルールの判定に数えません。同意画面経路と同じ扱いです。リスクに基づくルールは chain の中だけで発火します。

ステップアップ後に発行するトークンは、ステップアップした factor だけでなく、セッションの `acr`、`amr`、`auth_time` を保ちます。リスク評価器は `AMRSoFar` でセッションの認証方式を参照でき、ステップアップの factor は `login.*` ではなく `mfa.*` イベントとして audit されます。評価は拒否側に倒します。`Rule.When` が panic すれば一致とみなし、`Decider` が panic する、nil・nil ポインタ・未知の形を返す場合は拒否します。factor の `interaction.Result` が、先行する factor やアカウントチューザが束縛した subject と別の subject を示した場合は、chain をサーバエラーで終わらせます。この検査は、プロンプトなしで `Begin` の中で完了する factor にも及びます。実装は `internal/authorizeendpoint`、`op/rule.go`、`op/decider.go` にあります。
:::
