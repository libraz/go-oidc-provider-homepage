---
title: 設計判断
description: RFC 同士が衝突する箇所で、本ライブラリがどの解釈を選び、何を退けたか。
---

# 設計判断

OP が触れる仕様には、MUST、SHOULD、MAY が幾重にも層をなしています。複数の仕様で文言が矛盾する場面、あるいはある仕様の文字通りの読みが別の仕様と衝突する場面は珍しくなく、その都度どちらをどう取るかの解釈が必要になります。本ページではその選択を一覧化します。

::: tip このページの読み方
まず変更対象の領域に近い「判断マップ」から入ってください。各エントリはその後で「**仕様の文言**」「**衝突の中身**」「**本ライブラリの選択**」の 3 段構成にしています。緑色の callout が選択で、引用された `op/` / `internal/` 配下のパッケージが実装の参照先です。
:::

## 判断マップ

### プロファイルと discovery

| 判断 | 対象 | 結論 |
|---|---|---|
| [#7](#dj-7) | プロファイル制約の解決方式 | `*config` ヘルパーで disjunction を解き、ハンドラは bool だけを見る |
| [#8](#dj-8) | ACR / AAL の語彙 | 内部 AAL 階層と通信路上の `acr` mapping の 2 層モデル |
| [#12](#dj-12) | Discovery document のプロファイル絞り込み | 構築時入力から 1 回生成し、golden test で drift を検出 |
| [#13](#dj-13) | `client_assertion` の `aud` | FAPI と OIDC Core の両形を `Audience` + `AuxAudiences` で受理 |
| [#25](#dj-25) | DPoP nonce と `client_assertion` replay | assertion の `jti` 消費より前に DPoP nonce を検証 |
| [#26](#dj-26) | CIBA / FAPI-CIBA の poll と error | poll mode のみ。slow_down strike は上限付き。CIBA JAR 失敗は `invalid_request` に集約 |

### トークン、grant、失効

| 判断 | 対象 | 結論 |
|---|---|---|
| [#2](#dj-2) | リフレッシュトークンローテーションの猶予期間 | 既定 60 秒の猶予期間。chain 再利用時は chain 全体を失効 |
| [#3](#dj-3) | `offline_access` は発行ゲートか UX シグナルか | 既定は TTL / UX シグナル。`WithStrictOfflineAccess()` で発行・交換ゲートに切り替え |
| [#15](#dj-15) | DPoP リフレッシュトークンのバインド | public クライアントはバインド、confidential はバインドしない |
| [#16](#dj-16) | Introspection の同一クライアント限定 | クロスクライアント参照は一様に `{"active": false}` |
| [#17](#dj-17) | `/end_session` のアクセストークンカスケード | レジストリ / opaque サブストアがあれば既定でカスケード |
| [#18](#dj-18) | アクセストークン形式の既定 | JWT 既定、opaque はオプトイン、RFC 8707 の resource ごとに上書き可 |
| [#19](#dj-19) | JWT アクセストークン失効戦略の既定 | grant tombstone が既定。FAPI は「失効処理なし」を拒否 |

### 登録、issuer、外向き fetch

| 判断 | 対象 | 結論 |
|---|---|---|
| [#4](#dj-4) | RFC 8252 loopback redirect のポート扱い | 既定は完全一致。native loopback の wildcard は狭いオプトイン |
| [#9](#dj-9) | Issuer 識別子の検証 | 非正規 issuer は構築時に拒否 |
| [#20](#dj-20) | DCR の `client_secret` 保存と再開示 | 保存は hash のみ。平文は 1 回限りの応答 artifact |
| [#21](#dj-21) | RFC 7592 PUT 省略のセマンティクス | defaulted フィールドは reset、optional metadata は clear |
| [#22](#dj-22) | `sector_identifier_uri` の fetch 上限 | 1 回だけ bounded fetch。native は OIDC の loopback host 3 種を受理 |
| [#23](#dj-23) | 外向き JWKS / metadata fetch の SSRF 境界 | custom transport は trust だけを広げ、dial-time SSRF gate は残す |
| [#24](#dj-24) | Open DCR で省略された `scope` | `OpenRegistrationDefaultScopes` 未設定なら scope なしで登録 |

### ブラウザ、セッション、UI 境界

| 判断 | 対象 | 結論 |
|---|---|---|
| [#5](#dj-5) | Session Management / Front-Channel Logout | 未実装。RP-Initiated Logout + Back-Channel Logout を提供 |
| [#10](#dj-10) | セッションをトランザクションクラスタ内に置くか | 別サブストアに分離。揮発ストア対応。BCL は best-effort |

### JOSE と request object

| 判断 | 対象 | 結論 |
|---|---|---|
| [#1](#dj-1) | PAR `request_uri` の one-time use 適用時点 | `/authorize` 入口で参照、認可コード発行時に消費 |
| [#6](#dj-6) | JAR `request=` の replay 防御 | OP 側 `jti` cache、`exp` で追い出し。JAR 有効時は既定で動作 |
| [#11](#dj-11) | JOSE `alg=none` / HMAC の遮断 | 閉じた列挙型。`none` / `HS*` は受理型に存在しない |
| [#14](#dj-14) | PKCE `plain` と `S256` | 全プロファイルで `S256` のみ |
| [#27](#dj-27) | JWE allow-list と nesting 上限 | 閉じた `alg` / `enc` allow-list。JOSE nesting は合計 10 層まで |

<a class="faq-anchor" id="dj-1"></a>

## 1. PAR の `request_uri` — 「one-time use」をいつ適用するか

**仕様**: RFC 9126 §2.2 は `request_uri` を「one-time use only」と要求しています。

**衝突**: 「最初の参照で消費する」という文字通りの解釈は、複数段階の interaction(同意 → MFA → ロケール変更など)で同じ `/authorize?request_uri=…` に再リダイレクトが走るケースで壊れます。FAPI 2.0 の OFCS は 2 件のテストケースで挙動を検証しており、認証完了前の再アクセスは *受理*、認証完了後の再アクセスは *拒否* を要求しています。

::: tip 選択
`request_uri` は `/authorize` の入口で `PARs.Find` により参照し、**認可コード発行時点で** `PARs.Consume` で消費します。interaction 中の再アクセスは成功し、コード発行後の再アクセスは `invalid_request_uri` を返します。OFCS module `fapi2-…-par-attempt-reuse-request_uri` がコード発行後の拒否経路を検証します。詳細は <a class="doc-ref" href="/ja/compliance/ofcs">OFCS 適合状況</a> を参照してください。
:::

<a class="faq-anchor" id="dj-2"></a>

## 2. リフレッシュトークンのローテーション猶予期間

**仕様**: RFC 9700 §2.2.2 が次のように書いています。

> **RFC 9700 §2.2.2(訳)** 以前のリフレッシュトークンを無効化してもよいが、新しいリフレッシュトークンがクライアントに届くまでは有効に保たなければならない。

**衝突**: 「厳密な single-use、猶予なし」の解釈は、ローテーションのネットワーク往復が中断されたすべてのクライアント(モバイルのバックグラウンド遷移、TCP 切断、HTTP/2 ストリームのリトライなど)を破壊します。OFCS は、ローテーションと再交換の間に 30 秒待つ形で猶予期間の経路を検証します。

::: tip 選択
ローテーション済みのリフレッシュトークンは、`GraceTTL`(既定 60 秒) の間、再利用検知で失効していない限り受理されます。猶予期間内は同じ chain の新トークンが返り、追加のローテーションは発生しません。猶予期間 *を過ぎたあと* の再利用、あるいはすでに失効している chain での再利用は、chain 全体を無効化します(RFC 9700 §4.14)。実装は `internal/grants/refresh.Exchanger.tryGrace` にあり、`store.RefreshToken.Revoked` が「ローテーションで消費済み」と「chain 侵害で失効」を区別します。設定は `op.WithRefreshGracePeriod` で行います。
:::

<a class="faq-anchor" id="dj-3"></a>

## 3. `offline_access` — リフレッシュ発行の判定か、UX シグナルか

**仕様**: OIDC Core 1.0 §11 が、次の 2 つを同時に書いています。

> **OIDC Core 1.0 §11 (a) 訳** リフレッシュトークンの利用は Offline Access 専用ではない。

> **OIDC Core 1.0 §11 (b) 訳** `offline_access` 要求時は、AS は prompt パラメータに `consent` を含めなければならない。

**衝突**: (a) を取れば「`refresh_token` grant が許可されたクライアントなら scope に依らずリフレッシュトークンを発行する」、(b) を取れば「`offline_access` こそリフレッシュ発行のための scope であり、consent ゲートはその副次」と読めます。OP の実装ごとに解釈が割れる箇所です。

::: tip 選択
**既定では、`offline_access` は UX と TTL のシグナルであり、リフレッシュトークン発行ゲートではありません**。リフレッシュトークンは、付与 scope に `openid` が含まれ、かつクライアントの `GrantTypes` に `refresh_token` が含まれる場合に発行されます。grant が `offline_access` も持つ場合は、`op.WithRefreshTokenOfflineTTL` によって offline 用の寿命 bucket に入り、同意・監査の表示もユーザが認可した offline reach を反映できます。

OIDC Core §11 を厳格に読みたい組み込み側は、`op.WithStrictOfflineAccess()` を渡します。この mode では、リフレッシュトークン発行に `offline_access` が追加で必要になり、`grant_type=refresh_token` でも元 grant が `offline_access` を持たない token は `invalid_grant` で拒否されます。この option は `op.WithOpenIDScopeOptional()` と併用不可です。OIDC request ではないものに §11 を適用する意味がないためです。実装は `op/options_features.go`、`internal/tokenendpoint/strict_offline_test.go`、および refresh 発行経路にあります。
:::

<a class="faq-anchor" id="dj-4"></a>

## 4. RFC 8252 §7.3 ループバック redirect — 完全一致かポートワイルドカードか

**仕様**: RFC 6749 §3.1.2.3 と OAuth 2.1 はバイト完全一致を要求します。一方で RFC 8252 §7.3 は、ネイティブアプリのループバック redirect について「リクエスト時に任意のポートを許可せよ」と要求しています。

**衝突**: 構造的な矛盾です。CLI ツールは OS が割り当てる動的ポートを事前登録できないため、完全一致を厳密に適用するとネイティブアプリの標準的なフローが壊れます。

::: tip 選択
既定は完全一致(OAuth 2.1 を厳格に解釈)です。RFC 8252 §7.3 の緩和は **クライアント単位のオプトイン** とし、登録済みの `redirect_uris` にループバック URI が含まれる場合に限り、scheme が `http` で、登録済 host がループバック形(`127.0.0.1` / `::1` / 文字列 `localhost`)のいずれか、要求側 host が登録 host と一致、かつ path / query / fragment が完全一致のとき、ポート不一致だけを許容します。文字列 `localhost` は v0.9.x で authorize 側のワイルドカード集合に追加されました — 登録(DCR / OIDC Registration §2)はネイティブクライアントに対して以前から `localhost` を受理していたためで、authorize 側だけが拒否すると、`http://localhost/cb` で登録した native アプリが OS から動的ポートを受け取った瞬間に `/authorize` で弾かれる問題がありました。この `localhost` の受理は、登録側で組み込み側がオプトイン(web クライアントは `op.WithAllowLocalhostLoopback()`、native クライアントは `application_type=native`)している場合にだけ意味を持つため、DNS rebinding を懸念するデプロイは登録側のオプトインを外しておけば従来どおり literal IP のみの厳格な構えを保てます。HTTPS ループバックは対象外です(`127.0.0.1` 向けの ACME 証明書を発行する経路がないため)。
:::

<a class="faq-anchor" id="dj-5"></a>

## 5. Session Management 1.0 / Front-Channel Logout 1.0

**仕様**: いずれも OIDC Core とは別に公開されている独立仕様です。

**衝突**: どちらも、サードパーティの iframe が埋め込まれた状態で自分自身の cookie を読めることを前提にしています。モダンブラウザの既定(2017 年以降の Safari ITP、2019 年以降の Firefox ETP、2020 年以降の Chrome `SameSite=Lax`、2024 〜 2025 年のサードパーティ cookie 段階廃止)が、この前提を取り去りました。

::: tip 選択
**未実装** です。discovery document には `frontchannel_logout_supported` も `check_session_iframe` も出力しません。代わりに RP-Initiated Logout 1.0 + Back-Channel Logout 1.0(署名済みの `logout_token` を server-to-server で POST する形式)を提供しています。iframe ベースのセッション通知が必要なら、別ライブラリを選んでください。これは未着手の TODO ではなく、設計上のスコープ判断です。
:::

<a class="faq-anchor" id="dj-6"></a>

## 6. JAR `request=` の replay — オプトイン式の `jti` キャッシュ?

**仕様**: RFC 9101 §10.8 は、`exp` 期限内の request object の replay を拒否することを SHOULD(推奨)と書いています。レジストリの実装そのものは MUST ではありません。

**衝突**: 素直な「検証して受理」は仕様には適合しますが、傍受された request object を `exp` まで何度も `/authorize` に投げ返せてしまいます。FAPI 2.0 Message Signing は、基底仕様で SHOULD だったところを実質的に前提にしています。

::: tip 選択
OP 側で `jti` キャッシュを保持します。JAR ウィンドウごとにスコープを切り、`exp` を境に追い出します。JAR が有効なときは既定で動作します。OP の他の揮発状態と同じ `Sessions` ストレージを使うので、Redis の揮発スライスをすでに運用していれば、そこに乗せるだけで replay 防御が付きます。
:::

<a class="faq-anchor" id="dj-7"></a>

## 7. プロファイル制約の解決 — switch ではなく disjunction

**仕様**: 仕様文ではなく、内部アーキテクチャ上の話題です。`WithProfile(FAPI2Baseline)` と `WithProfile(FAPI2MessageSigning)` を同時に設定したとき、両プロファイルのルールの OR を、すべてのハンドラで一様に適用する必要があります。

**衝突**: ハンドラごとに `switch profile` を書くと差分が出ます。新しいプロファイル(CIBA、iGov など)を追加したとき、既存ハンドラを全部見直さなければ、プロファイルが要求するルールがスキップされ、緩い側に倒れた状態(fail-open)になります。

::: tip 選択
**`*config` ヘルパー経由でプロファイル条件付きのセキュリティゲートを解決します**。各ゲート(たとえば `requireSenderConstrainedTokens`、`requirePAR`、`requireSignedRequestObject`)は、有効プロファイル集合をループして単一の `bool` を返し、ハンドラはその真偽値だけを参照します。`op/profile/constraints.go` のビルド時バリデータ (`RequiredFeatures`、`RequiredAnyOf`)が、ヘルパーが true と言う対象が実際に実装されていることを保証してくれるので、実行時パスは念のための nil チェックを省けます。
:::

<a class="faq-anchor" id="dj-8"></a>

## 8. ACR / AAL マッピング — 内部用語と通信路上の用語

**仕様**: OIDC Core 1.0 が `acr` claim を発行し、RFC 6711 / 8485 が識別子レジストリを規定し、RFC 9470 が `acr_values` + `WWW-Authenticate: error="insufficient_user_authentication"` でステップアップを標準化しています。

**衝突**: 内部 AAL(「ユーザがどの factor を完了したか」)と、通信路に乗って RP に届く OIDC `acr` は、別の語彙です。安直にマップする (たとえば `acr=urn:authn:aal=2` のようなリテラル)と、通信路に乗る語彙が内部分類に縛られ、RP を破壊せずには変えられなくなります。

::: tip 選択
2 層モデルです。内部の AAL 階層は `op/aal.go` に、通信路上の `acr` マッピングは `op/acr.go` に置きます。`RuleACR`(`op/rule.go`)が RFC 9470 のステップアップを実装しています。RP が現在のセッションよりも高い `acr_values` を要求すると、`insufficient_user_authentication` チャレンジを次のステップとともに返します。
:::

<a class="faq-anchor" id="dj-9"></a>

## 9. Issuer 識別子の検証

**仕様**: RFC 9207 は認可応答に `iss` を付けることを必須と規定します。OIDC Discovery 1.0 §3 / RFC 8414 §3 / FAPI 2.0 §5.4 は issuer を OP の正規識別子として扱い、`/.well-known/openid-configuration` とそのまま連結して discovery URL を導出すると規定しています。

**衝突**: 実環境では「同等に見えるが、末尾スラッシュ・scheme の大小・host の大小・デフォルトポートの有無で違う 2 つの URI」がよく現れます。RFC 9207 のミックスアップ防御は OP と全 RP のバイト完全一致比較に依存しているので、OP 側と RP 側の正規化が違えば、防御は黙って破綻します。

::: tip 選択
`op.WithIssuer` は、末尾スラッシュ、scheme の大文字混在、host の大文字混在、デフォルトポート（https は `:443`、http は `:80`）、fragment、query、非正規 path（`..`、`.`、`path.Clean` で検出される重複スラッシュ）を拒否します。同じ正規形を、`iss` を出すすべての場面 — 発行する全アーティファクト、discovery document の `issuer` フィールド、認可応答の `iss` パラメタ — で再利用するので、RFC 9207 ミックスアップ防御の byte 完全一致比較が end-to-end で成立します。`op.New` は非正規 issuer では起動せず、ビルド時にエラーを返します。
:::

<a class="faq-anchor" id="dj-10"></a>

## 10. セッション — トランザクションクラスタの内か外か

**仕様**: 該当なし。アーキテクチャ上の判断です。

**衝突**: セッションを認可コード / リフレッシュトークン / クライアントと同じ SQL クラスタに置くと、セッションの書き込みレイテンシがトランザクション経路に直結します。Redis に置くと耐久性が下がります。ただし、セッション喪失はユーザの再ログインで回復できますが、認可コード喪失は RP のループを壊してしまいます。

::: tip 選択
セッションは別サブストア(`store.SessionStore`)としてルーティングでき、揮発ストア(Redis、Memcached)に向けても構いません。Back-Channel Logout の配送は揮発セッション配下では best-effort とします。「セッションを失った場合、その RP には通知できない」を許容可能な失敗モードとして扱います(Redis 揮発スライス運用向け)。`op.AuditBCLNoSessionsForSubject` 監査イベントを、設定した `op.SessionDurabilityPosture` と組み合わせると、ダッシュボード上で 2 つのケースを区別できます。
:::

<a class="faq-anchor" id="dj-11"></a>

## 11. JOSE の `alg=none` と HMAC ファミリー

**仕様**: RFC 7518 は `none` と `HS256/384/512` を列挙しています。RFC 8725(JWT BCP)§3.1 は `none` ベースの JWT を信頼してはならないと規定し、§3.2 は HMAC 鍵を公開鍵と取り違える alg confusion について警告を出しています。

**衝突**: 基盤の JOSE ライブラリは、レジストリ全体を既定で受理します。実行時チェックを足すのは壊れやすく、将来 JOSE ライブラリを直接 import する経路ができればすり抜けてしまいます。

::: tip 選択
`internal/jose.Algorithm` を閉じた列挙型(`RS256`、`PS256`、`ES256`、`EdDSA`)とします。`none` と `HS*` は **そもそも型に存在しません**。`depguard`(lint)が `internal/jose/` 外からの JOSE パッケージの直接 import を禁止しているので、将来のコードがレジストリ全体に到達することはありません。alg 混同は構造的に閉じられています。
:::

<a class="faq-anchor" id="dj-12"></a>

## 12. Discovery document — プロファイルでの絞り込み

**仕様**: OIDC Discovery 1.0 + RFC 8414 がメタデータフィールドを列挙しています。FAPI 2.0 §3.1.3 は `token_endpoint_auth_methods_supported` を絞ることを要求します。RFC 9101 §10.1 は、JAR 有効時に `request_object_signing_alg_values_supported` を要求します。

**衝突**: `_supported` 系のリストは、feature の有効化に応じて作られ、有効プロファイルで絞り込まれ、その後 introspection / revocation の auth-method リストにコピーされます。これをハンドラで毎回やると差分が出ます。構築時に 1 か所で決める方が安定します。

::: tip 選択
discovery は `op.New` 時に 1 度だけ構築します (`internal/discovery/build.go`)。プロファイルは `ProfileAllowedAuthMethods` で auth-method リストを絞り、introspection / revocation は絞り込み後のリストをコピーします。リポジトリ内の discovery golden test がプロファイルごとの document 構造を検証しているので、気付かれずに進行するずれも PR の段階で検出できます。
:::

<a class="faq-anchor" id="dj-13"></a>

## 13. `client_assertion` の `aud` — FAPI 2.0 と OIDC Core

**仕様**: RFC 7523 §3 は、JWT bearer assertion の `aud` を「authorization server を識別する値」と要求するだけで、どの識別子かまでは固定していません。OIDC Core 1.0 §9(private_key_jwt)はこれを OP の token endpoint URL と読みます。FAPI 2.0 §5.2.2 は issuer URL と読みます。

**衝突**: OIDC Core と FAPI 2.0 プロファイルを同時にサポートする OP では、どちらの形を送ってくるクライアントも認証できなければなりません。「ちょうど 1 つに一致」を厳格に取ると、毎リクエストで半分のクライアントが落ちます。RFC 7523 自体は両方を許容するほど広いので、衝突は RFC をラップしている 2 つのプロファイル仕様の間で起きています。

::: tip 選択
verifier は、主 `Audience`(OIDC Core: token endpoint URL)と `AuxAudiences` のリスト(FAPI 2.0: issuer URL)を併せて受理します。`op.New` はすべての OP で `AuxAudiences` に issuer を入れるので、FAPI 2.0 形のクライアントもデプロイ単位の追加設定なしで認証できます。実装は `internal/clientauth/assertion.go` にあります。`jti` の消費は統合後の経路で 1 回だけ実行されるので、どちらの形でも replay 防御をすり抜けることはできません。
:::

<a class="faq-anchor" id="dj-14"></a>

## 14. PKCE — `S256` のみ、`plain` はポリシーで拒否

**仕様**: RFC 7636 §4.2 は `plain` と `S256` の 2 種を列挙しています。§4.4.1 は SHA-256 を計算できない環境のために `plain` を残しつつ、クライアントには `S256` を推奨しています。OAuth 2.1 (`draft-ietf-oauth-v2-1` §4.1.1)と FAPI 2.0 §3.1.4 は、`plain` を完全に禁止しています。

**衝突**: RFC 7636 を素直に読めば、クライアントが要求した側を OP は受理します。OAuth 2.1 / FAPI 2.0 を厳格に読めば拒否です。「プロファイルごとのゲート」アーキテクチャだと、同じクライアントが OIDC Core OP では成功し、同じ OP の FAPI 2.0 プロファイル下では失敗する、という挙動になります。これはコードベース全体で避けるように作っている「気付かれずに進行するプロファイル間のずれ」の典型例です。

::: tip 選択
**プロファイルに関係なく** `plain` を拒否します。`internal/pkce.Method` は `"S256"` の単一定数です。`ValidateChallenge` はそれ以外を `ErrChallengeMethodUnsupported` で返し、discovery の `code_challenge_methods_supported` には `S256` のみが残ります。理由は次の 3 点です:

1. `plain` は PKCE 防御を提供しません(verifier がそのまま challenge になってしまうため)。
2. RFC 7636 の SHOULD 解釈は、OAuth 2.1 によって時代遅れになっています。
3. プロファイルを跨いでクライアントの挙動を一定にしたいという方針。
:::

<a class="faq-anchor" id="dj-15"></a>

## 15. DPoP リフレッシュトークンのバインド — public と confidential の分割

**仕様**: RFC 9449 §5.0 / §5.4 は、AS が token endpoint で受け取った DPoP 鍵にリフレッシュトークンをバインドしてもよい(MAY)と書いています。§5.4 は加えて、いったんバインドしたらローテーションを跨いでバインドを保持することを必須としています。

**衝突**: 「MAY 束縛」は本当に両義的です。**常に束縛** にすると、confidential クライアントは chain が存続している間ずっと 1 つの DPoP 鍵に固定されることになり、refresh のたびに DPoP 鍵をローテーションする FAPI 2.0 OFCS のプランと衝突します。**常に未束縛** にすると、public クライアント(SPA、ネイティブアプリ)のリフレッシュトークンが保護のない bearer のまま残ります。これはまさに RFC 9449 §1 が sender constraint を導入する動機として挙げる脅威モデルそのものです。

::: tip 選択
**public は束縛、confidential は未束縛** とします。`TokenEndpointAuthMethod` が `"none"`(public クライアントのシグナル) のクライアントは、初回発行時にリフレッシュ chain を DPoP 鍵にバインドし、§5.4 に従ってローテーションを跨いでバインドを保ちます。confidential クライアント(`private_key_jwt`、`client_secret_*`、`tls_client_auth`)は chain を未束縛にし、refresh ごとに DPoP 鍵をローテーションできるようにします。ただし、refresh のたびに発行されるアクセストークンは、提示された DPoP 鍵にバインドされます。そのため、アクセストークンを保持する側には依然として対応する秘密鍵が必要です。実装は `internal/tokenendpoint.refreshDPoPJKT` です。chain がいったんバインドされると §5.4 のバインド維持ルールが適用され、後付けで便宜的にアップグレードして鍵ローテーションをロックすることはできません。
:::

<a class="faq-anchor" id="dj-16"></a>

## 16. Introspection — 同一クライアント限定 + 一様な inactive 形

**仕様**: RFC 7662 §2.2 は、inactive 応答に `"active": false` を必須とし、その場合は `active` メンバだけを含めてもよいと書いています。§2.1 は AS が「audience に応じて応答を変えてもよい」と書き、クロスクライアント拒否を許容しつつ、強制はしていません。

**衝突**: 解釈は大きく 3 つあります。

1. **緩い解釈** — AS が認識するすべてのトークンを、認証済みなら誰でも introspect できる。発行先でないクライアントにも `"active": true` を返す。
2. **厳格 + 区別可能** — クロスクライアントの introspection は拒否するが、区別可能な形で通知する(HTTP 403 や `error: not_authorized` など)。
3. **保守的** — クロスクライアントの introspection を拒否しつつ、unknown / expired / revoked と同じ `{"active": false}` 形で返す。

解釈 2 は応答の形からトークン存在の情報を漏らします。攻撃者は応答の形の違いを観測することで、推測したトークンが *どこかの* 有効な grant に属するかを検出できてしまいます。

::: tip 選択
**解釈 3** を採用します。`client_id` が呼び出し側と一致しないトークンは `{"active": false}` を返し、「unknown」「expired」「revoked」と構造的に区別できないようにします。同じ inactive 形を、JWT / opaque AT / リフレッシュトークンの各分岐すべてに適用します。実装は `internal/introspectendpoint.resolveJWT` / `resolveOpaque` / `resolveOpaqueAccessToken` です。すべての miss 経路が `inactive()` を返すので、timing と応答の形の双方を一様に保てます。
:::

<a class="faq-anchor" id="dj-17"></a>

## 17. `/end_session` — アクセストークンカスケードの範囲

**仕様**: OIDC RP-Initiated Logout 1.0 §6 が次のように書いています。

> **OIDC RP-Initiated Logout 1.0 §6(訳)** ユーザがサインアウトしたあとに、OP はアクティブなセッション、リフレッシュトークン、アクセストークンを失効させてもよい。

Back-Channel Logout 1.0 §2.3 は RP 側の fan-out を規定するだけで、AT 失効の到達範囲には触れていません。

**衝突**: 「MAY」を素直に読むと、「cookie だけ消して立ち去る」から「subject が保有する grant をすべて失効させる」まで幅広く取れます。それぞれ影響範囲が違います:

- **cookie のみ** — 流出中のアクセストークンは `exp` まで有効なままです。`/userinfo` を経由しない JWT トークンは引き戻しが効きません。
- **レジストリの行を revoked に切り替え + opaque tombstone** — OP のエンドポイント(`/userinfo`、`/introspect`)はその場で inactive を返します。introspect する RS や `/userinfo` を呼び出す RS も同じ結果を観測します。
- **opaque トークン** はさらに先まで届きます。任意の RS が次の bearer 提示で inactive を観測します。通信路上の形式にオフライン検証経路がないためです。

::: tip 選択
**既定でカスケードします**。組み込み側が `Grants` と `AccessTokens` サブストアを設定していれば、`/end_session` は subject が保有する grant をすべて列挙し、grant ごとの access-token shadow row を失効させます。対応する opaque AT レコードも、同じカスケードで revoked に切り替わります。明示的に「cookie のみ」の方針を取りたい組み込み側は、`Grants` / `AccessTokens` を nil のまま残してください。カスケードは何もせず短絡し、AT は自然失効を待ちます。

JWT と opaque で到達範囲が違う点(JWT は OP のエンドポイントのみ、opaque は introspection 経由ですべての RS まで)は、<a class="doc-ref" href="/ja/concepts/access-token-format">access-token-format</a> ページに切り出してあります。この差が問題になる組み込み側は、どちらの形式を発行するかを選ぶことで対処できます。
:::

<a class="faq-anchor" id="dj-18"></a>

## 18. アクセストークンの形式 — 既定は JWT、opaque はオプトイン、audience ごとに上書き

**仕様**: RFC 9068 が JWT 形式の OAuth 2.0 アクセストークンを標準化しています。RFC 6749 自体は、アクセストークンを opaque な bearer 文字列として扱うだけです。RFC 7662 introspection はオプションです。RFC 8707 は、単一クライアントが 1 回のフローで複数の resource 向けトークンを要求できるようにします。

**衝突**: どちらの方向の既定にしても、筋は通ります。

- **既定 JWT** — 各 RS がローカル検証でき、`/introspect` の往復が不要で、水平にスケールできます。ただし、`/end_session` は OP に戻ってこない JWT を `exp` まで引き戻せません。
- **既定 opaque** — 各 RS が OP を呼び出すことになるため、レイテンシが OP 経路と結合します。ただし、失効が即時に届きます。

ハードコードされた単一の既定は、すべての組み込み側を 1 つのトレードオフに縛ります。RFC 8707 の audience 単位選択を採用すれば、同じ OP が同じ認可の中で、異なる RS に異なる形式を発行できます。

::: tip 選択
**既定は `op.AccessTokenFormatJWT`** です。典型的な水平スケールの RS 構成と一致し、通信路上の形式が既製の JWT verifier と互換になります。`op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)` でグローバル既定を opaque に切り替えられ、`op.WithAccessTokenFormatPerAudience(map[string]op.AccessTokenFormat{...})` で RFC 8707 の resource indicator 単位に選択できます。失効の到達範囲を重視する audience(admin API、payment API など)は opaque、汎用 API は JWT、というふうに混在させられます。完全なトレードオフ (負荷の集中、ヘッダサイズ、カスケードの到達範囲、ストレージ形式) は <a class="doc-ref" href="/ja/concepts/access-token-format">access-token-format</a> ページにまとめてあります。本エントリは、*選択* の事実を、他の意図的な仕様読解と並べて残すためのものです。
:::

<a class="faq-anchor" id="dj-19"></a>

## 19. JWT アクセストークン失効戦略 — `jti` 単位 registry より grant 単位の tombstone

**仕様**: RFC 6749 §4.1.2 は、コード再利用時に AS が「可能であれば失効させるべき」と書いています。RFC 6819 §5.2.1.1 はサーバ側に再利用検出の不変条件を期待します。RFC 7009 §2.2 は、self-contained なトークンに対する revocation を未対応にしてもよいと許容します。FAPI 2.0 SP §5.3.2.2 は、サーバ側の revocation を必須としています。

**衝突**: 「すべての `jti` を shadow して revocation で行を反転」という素直なモデルは、仕様を満たします。ただし、トランザクションストアに `O(発行レート × AT_TTL)` の行を載せることになり、N 件の AT を持つユーザのログアウトは N 件の UPDATE になります。逆に「失効処理を持たず、JWT は `exp` まで有効のままにする」は、発行のホットパスをきれいにできますが、FAPI 2.0 SP §5.3.2.2 を真っ向から外します。

中間の解は、JWT を self-contained に保ったまま、**トークンごとではなく grant ごと** にサーバ側の状態を結びつけることです。失効した grant につき 1 行書けば、その grant 配下のすべての AT に効きます。発行時に書く必要はありません。

::: tip 選択
**既定は `op.RevocationStrategyGrantTombstone`** です。各 JWT AT は `gid` という private claim(OP 側の GrantID。RFC 7519 §4.3、omitempty)を持ちます。OP のエンドポイント(`/userinfo`、`/introspect`)は検証時、`gid` をキーにして小さな grant 単位の tombstone テーブルを参照します。カスケード(ログアウト、コード再利用、refresh chain 侵害)は、失効した grant 1 件あたり 1 件の tombstone 行を、`/revocation` の単一 AT 失効は失効した `jti` 1 件あたり 1 件の deny-list 行を書きます。既定では `/token` の発行経路でデータベース書き込みは発生しません。定常状態の行数は `O(失効した grant 数 + 失効した jti 数)` であり、`O(発行数)` ではありません。

AT 単位の監査ログが必要な組み込み側は、`op.WithAccessTokenRevocationStrategy(op.RevocationStrategyJTIRegistry)` を選ぶと、`store.AccessTokenRegistry` に発行ごとの shadow 行を残す旧方式に戻せます。どちらの戦略も FAPI 2.0 SP §5.3.2.2 適合です。`op.RevocationStrategyNone` は、RFC 6749 §4.1.2 の「SHOULD」の余地を明示的に受け入れる、非 FAPI デプロイ向けの第 3 の選択肢です。ただし `op.New` は、いずれかの FAPI プロファイル下ではこの選択を拒否します。

opaque AT 経路(`op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)`) は、この戦略選択の影響を受けません。opaque の検証はレコード参照が必要なため、ストレージは本質的にトークン単位だからです。実装は `op/access_token_revocation.go`、`internal/tokens`(gid claim)、`op/store/grant_revocation.go`、および各バックエンドアダプタにあります。
:::

<a class="faq-anchor" id="dj-20"></a>

## 20. DCR の `client_secret` 保存と再開示

**仕様**: RFC 7591 §3.2.1 は、登録応答における `client_secret` を optional とします。RFC 7592 §2.1(読み取り)と §2.2(更新)も、応答ボディに `client_secret` を再掲することを許可しますが、要求はしていません。

**衝突**: 「平文を保存しておいて GET ごとに再開示する」読みは、最も実装が単純で、歴史的に一部の OP がそうしてきました。しかしこれは、ストアに永続的に復号可能な平文を残すことになり、登録レコードを DB 上で最も機密度の高い行に押し上げます。逆に「POST 時点で hash 化し、それ以降は再開示しない」読みは、OP 内の他のクレデンシャルすべての保存方式に揃い、復号可能な接面を完全に消せますが、POST 応答(平文を 1 度だけ取得可能)と GET 応答(平文は永久に取得不可)の間に非対称が生じます。

::: tip 選択
**保存は hash のみ。平文は `POST /register` で 1 回だけ応答に乗せ、`PUT /register/{client_id}` でも次のいずれかの場合にだけ再掲します**:

- (a) `token_endpoint_auth_method` が `none` から confidential 方式に昇格された場合
- (b) 組み込み側が明示的にローテーションを要求した場合

`GET /register/{client_id}` では `client_secret` を再開示しません。平文へのアクセスが復号可能な形で必要な組み込み側は、最初の POST 応答の時点で自前のコピーを保管します。OP は平文の一次保管者にはならない方針です。実装は `internal/registrationendpoint/manage.go` および `internal/registrationendpoint/register.go` にあります。ストレージは `op/store/client.go` の `SecretHash` のみで管理されるので、すべての `store.ClientStore` 実装に同じ方針が適用されます。
:::

<a class="faq-anchor" id="dj-21"></a>

## 21. RFC 7592 PUT 省略のセマンティクス

**仕様**: RFC 7592 §2.2 は、次の 2 文で構成されます。

> **RFC 7592 §2.2 第 1 文(訳)** 応答で返される metadata の値は、それ以前のクライアントに紐付いていた値を *置換* するものとし、追加してはならない。

> **RFC 7592 §2.2 第 2 文(訳)** サーバはリクエスト中の null または空の値を、他の値と同様に無視してもよい。

**衝突**: 第 1 文を厳密に読むと、PUT で `grant_types` が省略されたら「`grant_types` を削除する」を意味することになります。結果として、クライアントが grant 能力を持たなくなり、その後の `/token` 要求がすべて壊れます。第 2 文の MAY 句は、参照実装が揃ってこのフットガンを避けるために使う逃げ道ですが、エコシステムは単一の置換ポリシーに収束していません。

::: tip 選択
**省略された *defaulted* なフィールドは、サーバ default に reset し、省略された *optional* なフィールドは空値にします**。defaulted の集合は `grant_types`、`response_types`、`token_endpoint_auth_method`、`application_type`、`subject_type`、`id_token_signed_response_alg` で、PUT で省略された場合はレコードから消えるのではなく、OP のドキュメント化された default に戻ります。optional な metadata (`client_uri`、`logo_uri`、`policy_uri`、`tos_uri`、`contacts` ほか)は、省略によって素直に空値になります。

サーバ管理のフィールド — `registration_access_token`、`registration_client_uri`、`client_secret_expires_at`、`client_id_issued_at` — はボディに存在すれば `400 invalid_request` で拒否し、認証中のクライアントの `client_secret` と一致しない値を送った場合も同様に拒否します。

「クライアントが意図的に省略したのか、サーバが default を埋めたのか」を区別する sparse な永続化モデルは、v1.0 では持ちません。defaulted なフィールドの通信路上の挙動は、どちらの読みでも同一になるためです。実装は `internal/registrationendpoint/manage.go` (`validateManageUpdateRequest`)と `internal/registrationendpoint/metadata.go`(`applyMetadataDefaults`) にあります。
:::

<a class="faq-anchor" id="dj-22"></a>

## 22. `sector_identifier_uri` の fetch 上限と native loopback の扱い

**仕様**: OIDC Core 1.0 §8.1 が、`sector_identifier_uri` の fetch と、登録された `redirect_uris` の包含検証を必須と規定しています。

> **OIDC Core 1.0 §8.1(訳)** `redirect_uris` に登録された値は、その配列の要素に含まれていなければならない。さもなければ登録は失敗しなければならない。

timeout もボディサイズも、仕様には書かれていません。OIDC Registration §2 は、`application_type=native` の loopback host として `localhost`、`127.0.0.1`、`[::1]` を列挙します。RFC 8252 §8.3 は、DNS rebinding を理由に、`localhost` を IP リテラルより劣後(NOT RECOMMENDED)と書いています。

**衝突**: 「言語デフォルトで fetch」は、実質「上流が応答するまで goroutine を保持し続ける」を意味し、応答ボディも無制限です。登録時にこのままはどちらもフットガンです。`localhost` については、OIDC Registration §2 と RFC 8252 §8.3 が一致しません。OIDC 側は native でこれを認めるのに対し、OAuth 側は推奨しません。Web クライアントの `http://localhost/cb` 登録は、native クライアントの同じ登録とは別問題です。

::: tip 選択
**取得は 5 秒のタイムアウト、5 MiB のボディ上限、HTTPS 限定、キャッシュ無し、後段の再取得無し、に制限します**。取得失敗または包含未達は `400 invalid_client_metadata` を返し、原因(host、TLS の状態、部分的な byte 列)は監査ログに記録しますが、応答ボディには乗せません。上流の詳細を漏らさないためです。

loopback host については、`application_type` で分岐します。Web クライアント(既定)は `127.0.0.1` と `[::1]` を `http` で受理しますが、文字列 `localhost` は、組み込み側が `op.WithAllowLocalhostLoopback()` で明示的にオプトインしない限り拒否します。Native クライアント(`application_type=native`)は、OIDC Registration §2 に従い 3 種すべての loopback host を無条件で受理します。加えて、claimed `https`、および RFC 8252 §7.1 の reverse-DNS な custom URI scheme(`com.example.app:/cb` など)も受け付けます。`.` を含まない custom scheme は、アプリ間で衝突しやすいため拒否します。

authorize 時の loopback ポートワイルドカードは、クライアント単位の別オプション(#dj-4)で制御する形にして、本ルールと役割が分かれて重ならない設計にしています。実装は `internal/registrationendpoint/sector_identifier.go` および `internal/registrationendpoint/metadata.go`(`validateRedirectURI`、`validateNativeRedirectURIScheme`)にあります。
:::

<a class="faq-anchor" id="dj-23"></a>

## 23. 外向き JWKS / metadata fetch の SSRF 境界

**仕様**: OIDC Dynamic Registration、JAR、private_key_jwt、pairwise subject、Back-Channel Logout は、いずれも RP 管理 metadata から OP に外向き URL を fetch させます。各仕様は「何を取得するか」は定めますが、private network、loopback、DNS rebinding、custom TLS root に対する共通の SSRF 境界は定めていません。

**衝突**: conformance runner、内部 CA、public trust に載っていない RP network では custom transport が必要になります。一方、HTTP client 全体を差し替え可能にすると、呼び出し側が意図せず dial-time の SSRF guard まで外してしまえます。custom transport を拒否すれば guard は単純ですが、正当な deployment まで動かなくなります。

::: tip 選択
**外向き trust と外向き到達性を別の knob に分けます**。`op.WithJWKSHTTPTransport` は RP JWKS fetch 用の TLS trust / transport 設定を組み込み側に渡させますが、package 側で transport の `DialContext` を差し替えるため、接続時の SSRF deny-list は引き続き発火します。private network の許可は `WithAllowPrivateNetworkJWKS` / `WithAllowPrivateNetworkJAR` 系の明示 policy knob が担い、custom transport 単体では network 境界を広げません。

JAR JWKS、client-auth JWKS、`sector_identifier_uri`、Back-Channel Logout destination には同じ bounded-fetch posture を適用します。まず URL 形状を検証し、次に dial-time network check を行い、最後に bounded response handling を行います。実装は `op/options_session.go`、`internal/netsec`、`internal/securefetch`、`internal/jar`、`internal/endpointsupport/clientauth.go`、`internal/registrationendpoint/sector_identifier.go` にあります。
:::

<a class="faq-anchor" id="dj-24"></a>

## 24. Open DCR で省略された `scope`

**仕様**: RFC 7591 は、登録 metadata の `scope` を optional とします。IAT-bound な登録では、Initial Access Token の発行者は operator code であり、明示的な `AllowedScopes` policy を付与できます。Open registration には、その operator 発行の per-request envelope がありません。

**衝突**: 省略された `scope` を「public scope すべて」と扱うと、body の薄い open-registration POST が予想以上に強い client を作ります。逆に「scope なし」と扱う方が安全ですが、従来の OP-wide default を期待する client は scope を明示するか、組み込み側が代替 default を設定する必要があります。

::: tip 選択
**Open registration では、省略された `scope` を空の登録 scope set として保存します**。その後の `/authorize` で client が登録していない scope を要求した場合は、`invalid_scope` で拒否します。public default を意図的に持たせたい組み込み側は、`RegistrationOption.OpenRegistrationDefaultScopes` でオプトインします。この値は構築時に OP の scope registry に対して検証されます。

IAT-bound 経路は、operator-trusted な広い default を維持します。IAT に `AllowedScopes` がなければ、public scope registry から default を取れます。実装は `op/registration.go`、`op/options_validate.go`、`internal/registrationendpoint/handler.go`、`internal/registrationendpoint/register.go`、`internal/registrationendpoint/metadata_validate.go` にあります。
:::

<a class="faq-anchor" id="dj-25"></a>

## 25. `client_assertion` replay 消費より前の DPoP nonce challenge

**仕様**: RFC 9449 は、AS が token request に `use_dpop_nonce` を返し、client が fresh な DPoP proof で retry する形を許します。RFC 7523 は、JWT client assertion に `jti` / 時刻 window による replay protection を要求します。

**衝突**: token endpoint が先に client authentication を行うと、初回 request で `client_assertion` の `jti` を消費したあとに `use_dpop_nonce` を返すことになります。client が form body はそのまま、DPoP proof だけを差し替えて retry すると、nonce challenge の回復経路であるにもかかわらず `invalid_client` / assertion replay で失敗します。

::: tip 選択
**token / PAR 経路では、client authentication より前に DPoP nonce を検証します**。nonce が欠けている、または古い場合は、form に載った `client_assertion` を消費せずに nonce challenge を返します。DPoP proof が受理可能になってから、通常の private_key_jwt replay cache が assertion を 1 回だけ消費します。実装は `internal/tokenendpoint/authcode.go`、refresh-token の token 経路、`internal/parendpoint/par.go` にあり、`internal/tokenendpoint/refresh_dpop_nonce_pkjwt_test.go` が固定しています。
:::

<a class="faq-anchor" id="dj-26"></a>

## 26. CIBA / FAPI-CIBA の polling と error taxonomy

**仕様**: CIBA Core 1.0 は poll / ping / push mode、`slow_down`、および §13 の error vocabulary を定義します。poll abuse の lockout 閾値は実装定義です。FAPI-CIBA は CIBA の上に signed request-object 要件を重ねますが、conformance module は CIBA らしい wire error を期待します。

**衝突**: 上限のない poll ladder は、client が `slow_down` を無視して `auth_req_id` の期限まで高速 poll し続けられる状態を作ります。低い上限を hard-code すれば本番保護にはなりますが、反復 poll を意図的に行う OFCS module を壊す場合があります。また、`/bc-authorize` から詳細な JAR parser error をそのまま出すと debug には便利ですが、CIBA endpoint が期待する `invalid_request` ではなく JOSE 固有の taxonomy が通信路に漏れます。

::: tip 選択
**本ライブラリは CIBA poll mode のみを実装し、slow_down strike counter に上限を置きます**。既定上限は 5 回です。`op.WithCIBAMaxPollViolations(n)` で上げ下げでき、`0` はライブラリ既定、`255` は counter が `uint8` であるため実質的に lockout 無効化を意味します。本番 deployment では有限の上限を推奨します。

`/bc-authorize` では single-valued parameter の重複を拒否し、request object の失敗は CIBA Core §13 に合わせて `invalid_request` に写像します。FAPI-CIBA では JAR verifier が `iat` を要求し、request object lifetime を 60 分に制限し、RP JWKS は OP の他の箇所と同じ SSRF-bounded fetcher で取得します。実装は `op/options_ciba.go`、`internal/ciba/polling.go`、`internal/cibaendpoint`、`internal/jar`、`op/op_builders.go` にあります。
:::

<a class="faq-anchor" id="dj-27"></a>

## 27. JWE allow-list と JOSE nesting 上限

**仕様**: RFC 7516 と RFC 7519 は、広い JWE algorithm 集合と nested JWT 形状を許します。原理的には、JWT が JWE に包まれ、その JWE がさらに別の JWE に包まれ、という形を取り得ます。

**衝突**: 汎用 JOSE library が対応するすべての形を受理すると、OP が必要とする範囲を超えて暗号面が広がります。layer ごとの plaintext cap は各復号の memory を守りますが、攻撃者が制御する nesting chain 全体の長さはそれだけでは制限できません。

::: tip 選択
**JWE は policy で閉じ、nested JOSE の走査に上限を置きます**。OP は明示的な `alg` / `enc` allow-list だけを受理し、未知の `crit` を拒否し、復号後 plaintext を 1 MiB に制限し、11 層目の JOSE layer を `ErrJWENestingTooDeep` で拒否します。通常の暗号化 request object は最大でも 2 層(JWE wrapping JWS)なので、10 層の上限は将来の protocol 形状に余地を残しつつ、再帰を無制限にしません。

実装は `internal/jose/jwe.go` にあり、JAR / PAR verification を通じて使われます。`internal/jar/verify_jwe_test.go` と、深い nested encrypted request object の scenario coverage が固定しています。
:::
