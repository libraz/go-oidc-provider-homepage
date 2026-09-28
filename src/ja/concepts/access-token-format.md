---
title: アクセストークンの形式 — JWT と opaque
description: JWT と opaque の選択を、現在の失効、introspection 認可、issuer、リソースサーバの運用差に基づいて判断します。
pageClass: pg-concepts-access-token-format
---

# アクセストークンの形式 — JWT と opaque

`go-oidc-provider` は **RFC 9068 に沿った形の JWT アクセストークンを既定で発行** し、**opaque 形式は明示時のみ** 選べます。形式によって **検証する主体** と **失効の伝わり方** が変わります。提示方法は送信者制約によって決まり、制約なし・mTLS バインドでは `Authorization: Bearer`、DPoP バインドでは `Authorization: DPoP` と DPoP proof ヘッダーを使います。

本ライブラリは JWT アクセストークンを ES256 のみで署名しますが、RFC 9068 §2.1 は RS256 対応を求めます。また、検証側は §2.2 で必須の `jti` がなくても受け付けます。完全適合を判断する際は [RFC 対応表](/ja/compliance/rfc-matrix) を参照してください。

これはライブラリ側で決められない設計判断で、組み込み側が選ぶことになります。RS（リソースサーバ）が OP に対してどの位置にいるか、即時失効をどこまで要求するか、負荷をどう分散したいかで答えが変わります。

::: tip 結論を先に
- **既定は JWT（RFC 9068）。** RS は JWKS でオフライン検証します。`/end_session` のカスケードは OP のエンドポイント（`/userinfo` / `/introspect`）までしか届かず、オフライン検証している RS では `exp` までトークンが通り続けます。
- **Opaque は明示時のみ** (`op.WithAccessTokenFormat`)。全 RS リクエストが `/introspect` を経由するためカスケードはあらゆる RS に届きますが、OP がリクエストの処理経路に入ります。
- **判断の核**: 「ログアウトされた」がユーザの通信不可までを意味するのか、それとも OP のエンドポイントでの拒否で十分なのか。ユーザ側帯域と OP の処理容量の配分は副次的な検討事項です。RFC 8707 の resource indicator ごとに混在させることも可能です（`op.WithAccessTokenFormatPerAudience`）。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — Bearer Token Usage
- [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — Token Revocation
- [RFC 7517](https://datatracker.ietf.org/doc/html/rfc7517) — JSON Web Key (JWK)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token (JWT)
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — Token Introspection
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
:::

## 同じ通信路上の枠に 2 つの形式

同じ送信者制約の下では、どちらの形式も同じ認可方式で提示します。制約なし・mTLS バインドなら `Bearer`、DPoP バインドなら proof ヘッダーを添えた `DPoP` です。ここでの違いは **RS がトークンをどう検証するか** です。図は制約なしの Bearer トークンを例にしています。

### JWT（RFC 9068） — RS がローカルで検証

<figure class="fig">
  <div class="fig-head">JWT — リソースサーバが自分で判断する</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-jwt-title" viewBox="0 30 960 140" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-jwt-title">JWT アクセストークンでは、リソースサーバが署名、typ、issuer、audience、有効期間、必須 claim をキャッシュ済みの OP 鍵で検証し、必要に応じて鍵を更新します。DPoP バインド時は proof も検証します。通常のリクエスト経路に OP は入りません。</title>
    <rect class="fg-box" x="36" y="54" width="190" height="68" rx="8"/>
    <text class="fg-t" x="56" y="84">RP</text>
    <text class="fg-xs" x="56" y="104">アクセストークンを保持する</text>
    <path class="fg-edge" d="M230,96 H316" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="273" y="89" text-anchor="middle">Bearer &lt;JWT&gt;</text>
    <rect class="fg-box" x="320" y="48" width="320" height="98" rx="8"/>
    <text class="fg-t" x="340" y="80">RS</text>
    <text class="fg-xs" x="340" y="102">JWT claim とバインドの証明を検証</text>
    <text class="fg-xs" x="340" y="120">問い合わせる相手も待ち時間も無い</text>
    <text class="fg-mxs fg-ok" x="340" y="138">リクエストあたりのネットワーク呼び出し 0 回</text>
    <path class="fg-edge fg-edge--muted" d="M644,96 H730" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="687" y="89" text-anchor="middle">一度だけ</text>
    <rect class="fg-box fg-box--accent" x="734" y="54" width="190" height="68" rx="8"/>
    <text class="fg-m fg-accent" x="754" y="84">OP /jwks</text>
    <text class="fg-xs" x="754" y="104">RS が取得してキャッシュする</text>
  </svg>
  <figcaption class="fig-note">高速で、しかもオフラインで完結します。それが同時に難点でもあり、発行後に OP が行ったことは、トークン自身の <code>exp</code> が過ぎるまでこのリソースサーバには届きません。</figcaption>
</figure>

RS はキャッシュした JWKS の鍵で署名と許可アルゴリズムを検証し、`typ=at+jwt`、期待する `iss` と `aud`、`exp` と `iat`、`sub`・`client_id`・`jti` などの必須 claim を確認します。送信者制約付きなら `cnf` を proof またはクライアント証明書と照合します。通常のリクエスト経路に OP は入りません。新しい署名鍵の `kid` が現れたら JWKS を更新します。

### Opaque — RS は毎回 OP に問い合わせる

<figure class="fig">
  <div class="fig-head">Opaque — リソースサーバが毎回問い合わせる</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-opaque-title" viewBox="0 30 960 140" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-opaque-title">opaque なアクセストークンは読み取れる内容を持たないため、リソースサーバはリクエストのたびに OP の introspection エンドポイントを呼び出し、その応答でトークンを解決します。</title>
    <rect class="fg-box" x="36" y="54" width="190" height="68" rx="8"/>
    <text class="fg-t" x="56" y="84">RP</text>
    <text class="fg-xs" x="56" y="104">アクセストークンを保持する</text>
    <path class="fg-edge" d="M230,96 H316" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="273" y="89" text-anchor="middle">Bearer &lt;opaque&gt;</text>
    <rect class="fg-box" x="320" y="48" width="320" height="98" rx="8"/>
    <text class="fg-t" x="340" y="80">RS</text>
    <text class="fg-xs" x="340" y="102">トークン単体では何も分からない</text>
    <text class="fg-xs" x="340" y="120">これが何かを OP に尋ねる必要がある</text>
    <text class="fg-mxs fg-warn" x="340" y="138">リクエストあたりのネットワーク呼び出し 1 回</text>
    <path class="fg-edge" d="M644,80 H730" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="687" y="73" text-anchor="middle">毎リクエスト</text>
    <path class="fg-edge fg-edge--accent" d="M730,120 H648" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="689" y="138" text-anchor="middle">応答</text>
    <rect class="fg-box fg-box--accent" x="734" y="54" width="190" height="68" rx="8"/>
    <text class="fg-m fg-accent" x="754" y="84">OP /introspect</text>
    <text class="fg-mxs" x="754" y="104">{ active, sub, scope, … }</text>
  </svg>
  <figcaption class="fig-note">呼び出しごとに往復が発生する代わりに、返ってくる答えはその瞬間に正しい値です。ここでトークンを失効させれば、次のリクエストがもうそれを知っています。</figcaption>
</figure>

opaque token は `crypto/rand` から取った 32 バイトを base64url で 43 文字にしたランダム識別子です。claim を一切運びません。RS は毎リクエストごとに OP の `/introspect`（RFC 7662）でトークンを解決します（あるいは結果を意図的に短い時間幅だけキャッシュします）。OP は **リクエストの処理経路に入ります**。

`/introspect` は confidential client 向けのエンドポイントです。public client や token endpoint 認証方式が `none` の client は、token を提示しても `401 invalid_client` を受け取ります。confidential caller は自分の token を introspect できます。リソースサーバが別 client に発行された access token を調べられるのは、その client ID が protected resource の `IntrospectionClients` に登録され、token の `aud` がその resource を示す場合だけです。この委譲は audience 単位で、refresh token には適用されません。

opaque access token が active のとき、RFC 7662 response には利用可能な `client_id`、`token_type`、`exp`、`iat`、`sub`、`aud`、`scope` に加えて `iss` も含まれます。JWT と opaque を切り替えても同じ issuer 検証を行えるようにするためです。

::: details `jti` — それは何か
`jti` は JWT 標準 claim（RFC 7519 §4.1.7）の "JWT ID" です。トークンごとに付ける一意の識別子で、特定のトークンを参照・失効・重複排除するときに使います。JWT アクセストークンには `jti` が含まれ、OP は旧来の JTI registry 戦略でこれをキーにし、拒否リストのテーブルでも重複排除キーとして使います。opaque トークンには `jti` がありません — bearer 文字列自体がすでに一意の識別子になるからです。
:::

::: details `gid` — それは何か
ライブラリ独自の JWT private claim で、**GrantID**（トークンが発行された認可 grant の OP 側識別子）を運びます。1 つの grant は典型的には「このユーザがこのクライアントに、この時刻に、このスコープで同意してログインした」に対応します。OP は `gid` があるおかげで、`jti` を 1 件ずつ追わなくても、grant 配下のアクセストークンを **tombstone 1 件の書き込みで一斉に失効** させられます。リソースサーバはこの claim を無視しなければなりません — OP 内部の関心事です。

- **いつ気にすべきか:** introspection 連動の RS コードを書くときや JWT のバイト列を監査するときだけです。標準的な RFC 9068 検証器は `gid` を見ません。
- **混同しがち:** `sid`（OIDC Core の session ID）。`sid` は **ユーザセッション** を、`gid` は **grant** を指します（1 セッションが複数 grant を持ちえます）。
:::

::: tip 通信路上の見た目だけでは RS は形式を判別できない
`Bearer` と `DPoP` のどちらの認可方式も、JWT と opaque の形式を示しません。RS は通常、audience ごとの配備ポリシーで期待する形式を決めます。DPoP バインド時は形式を問わず `Authorization: DPoP` と別の proof を使います。本ライブラリの Discovery 文書は形式を **広告しません**。
:::

## トレードオフ

| 観点 | JWT（既定） | Opaque |
|---|---|---|
| 検証場所 | RS。JWKS でオフライン | OP。`/introspect` 経由 |
| OP 負荷 | 既定戦略では発行時に書き込み **0 件**、失効した grant ごとに 1 行のみ。明示時のみの JTI registry では発行ごとに 1 行。詳細は下記の [JWT 失効戦略](#jwt-アクセストークン失効戦略) を参照。 | 発行ごとに 1 行 + RS リクエストごとに introspect 往復 |
| ヘッダサイズ | 大きい — header / claims / signature | 小さい — base64url 43 文字 |
| RS レイテンシ下限 | ローカル暗号処理のみ | OP との往復（またはキャッシュ TTL）が乗る |
| キャッシュ面 | RS が JWKS をキャッシュ（更新は稀） | RS が introspect 応答をトークンごとにキャッシュ |
| ログアウト後の到達範囲 | OP のエンドポイント（userinfo / introspect）にだけ届く | 全 RS リクエストに届く |
| Refresh ローテーション時の旧アクセストークン | `exp` まで生き残る | ローテーションと同時に失効 |
| トークン byte 列からの情報漏洩 | `sub`、`scope`、`aud`、`cnf`、`acr`、`gid` が露出 | 何も漏れない |
| RS 側のデバッグ性 | JWT をデコードすれば claim を直読できる | `/introspect` を呼び出す必要がある |
| 送信者制約（DPoP / mTLS） | JWT の `cnf` claim | OP 側のレコードから `cnf` を再構成 |

この 2 つの列は「安全 vs 不安全」を並べたものではありません。どちらも誠実な設計であって、運用上の前提が違うだけです。次の 2 節では、設計時に見落とされがちな「負荷」と「失効」の側面を掘り下げます。

## 負荷はどこに乗るか

JWT は検証を RS 群に分散させます。各 RS は JWKS キャッシュを抱え（更新は日単位、リクエスト単位ではありません）、署名検証をローカルで処理し、通常呼び出しでは OP に問い合わせません。RS を 10 台に増やしても OP には何も増えません。

opaque は検証を OP に集中させます。RS の呼び出しは（運用者が許した RS 側キャッシュを除けば）必ず `/introspect` 呼び出しに変換されます。RS が 10 台になれば introspect トラフィックも 10 倍になります。OP はコントロールプレーンだけでなく **データプレーンの単一容量点** になります。

「JWT はステートレス、opaque はステートフル」という古典的な説明は RS 側の経路だけを表します。本ライブラリでは opaque の発行行に加え、JWT にも grant tombstone や JTI 行を設定できます。違うのは **RS が毎リクエスト OP に問い合わせる必要があるか** です。

::: info ユーザ側帯域とサーバ間 RTT は別軸
「OP 負荷集中 vs RS 分散」とは別に **「ユーザ側回線が運ぶ byte 数」 vs 「サーバ間 RTT」** の軸があります。両者を混ぜて評価しないでください。

- **JWT 経路。** RP → RS の毎リクエストに数百 byte 〜 1 KB 級の JWT が乗ります。これは **ユーザ側回線の帯域** を消費する側 — モバイル / 従量課金 / 衛星リンクのような IoT 配備で効いてきます。サーバ間は静か（RS は OP を呼びません）。
- **Opaque 経路。** RP → RS の Bearer は base64url で 43 byte、**ユーザ側帯域には優しい**。代わりに各 RS が OP に `/introspect` を呼び出す分の **サーバ間トラフィック** が増えます — 多くは内部 trust zone 内の往復で、ユーザ体感帯域には乗りません。

つまり「OP の容量計画」と「ユーザ体感の通信量」は同じ問題ではありません。モバイルクライアントが多い API では opaque のほうがユーザ体感が軽くなる一方、OP は強くする必要がある、と分けて評価する価値があります。
:::

::: info OP 側のストレージコストは **対称ではありません**
既定の JWT 戦略（grant tombstone）は **発行時にデータベースへ書き込みを行わず**、失効した grant ごとに 1 行だけ書き込みます — 定常状態の行数は `O(失効した grant 数)` です。明示時のみの JTI registry 戦略は発行ごとに 1 行（`jti` をキーにした shadow 行）を保持します。opaque 形式は常に発行ごとに 1 行（ハッシュ化した bearer ID をキーにした行）を保持します。

「JWT も opaque もトークン 1 本ごとに 1 行」という説明は旧 JTI registry 既定の前提でした — 現在の既定では、JWT の発行経路は純粋な計算処理だけで完結します。詳細は下記の [JWT 失効戦略](#jwt-アクセストークン失効戦略) を参照。RS 側の差（JWT は RS にとってステートレス、opaque はそうではない）は変わりません。
:::

## 失効はどこに届くか — そして `/end_session` のギャップ

ここはトレードオフのうち最も見落とされがちな側面です。

`/end_session`（および `/revoke`、code 再利用検出のカスケード）は subject の grant に紐付くすべてのアクセストークンに対し、OP 側のレコードを revoked 状態へ切り替えます。両形式ともこの切り替えは記録されますが、問題は **どの経路がそれに気付くか** です。

**JWT 形式:**

<figure class="fig">
  <div class="fig-head">JWT — 失効はどこで止まるか</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-revoke-jwt-title" viewBox="0 20 960 220" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-revoke-jwt-title">JWT アクセストークンの場合、セッション終了は grant tombstone を書き込みます。OP は userinfo と introspection のエンドポイントでこれを参照しますが、オフラインで JWT を検証するリソースサーバには届きません。</title>
    <rect class="fg-box fg-box--accent" x="36" y="90" width="180" height="60" rx="8"/>
    <text class="fg-m fg-accent" x="126" y="116" text-anchor="middle">/end_session</text>
    <text class="fg-xs" x="126" y="136" text-anchor="middle">RP 起点のログアウト</text>
    <path class="fg-edge fg-edge--accent" d="M220,120 H316" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="320" y="84" width="240" height="72" rx="8"/>
    <text class="fg-t2" x="340" y="110">grant tombstone</text>
    <text class="fg-xs" x="340" y="128">既定。または registry の</text>
    <text class="fg-mxs" x="340" y="146">RevokeByGrant</text>
    <path class="fg-leader" d="M564,120 H620 M620,54 V193"/>
    <path class="fg-edge fg-edge--thin" d="M620,54 H696" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="658" y="47" text-anchor="middle">参照する</text>
    <path class="fg-edge fg-edge--thin" d="M620,120 H696" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="658" y="113" text-anchor="middle">参照する</text>
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M620,193 H696" marker-end="url(#fg-ad)"/>
    <text class="fg-xs fg-danger" x="658" y="186" text-anchor="middle">届かない</text>
    <rect class="fg-box" x="700" y="34" width="224" height="40" rx="6"/>
    <text class="fg-m" x="718" y="59">OP /userinfo</text>
    <rect class="fg-box" x="700" y="100" width="224" height="40" rx="6"/>
    <text class="fg-m" x="718" y="125">OP /introspect</text>
    <rect class="fg-box fg-box--danger" x="700" y="166" width="224" height="54" rx="6"/>
    <text class="fg-t2" x="718" y="188">RS</text>
    <text class="fg-xs" x="718" y="208">オフラインの JWT 検証</text>
  </svg>
  <figcaption class="fig-note">このページが扱っているギャップがここです。長さを決めるのはアクセストークンの TTL だけで、他に何もありません。形式が JWT のときに TTL を短く保つべき理由がこれです。</figcaption>
</figure>

**Opaque 形式:**

<figure class="fig">
  <div class="fig-head">Opaque — 失効はすべてに届く</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-revoke-opaque-title" viewBox="0 20 960 220" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-revoke-opaque-title">opaque アクセストークンの場合、セッション終了はトークンストアの行を切り替えます。OP は userinfo と introspection のエンドポイントでこのストアを参照し、各リソースサーバも参照します。どのみち introspection を呼ばなければならないからです。</title>
    <rect class="fg-box fg-box--accent" x="36" y="90" width="180" height="60" rx="8"/>
    <text class="fg-m fg-accent" x="126" y="116" text-anchor="middle">/end_session</text>
    <text class="fg-xs" x="126" y="136" text-anchor="middle">RP 起点のログアウト</text>
    <path class="fg-edge fg-edge--accent" d="M220,120 H316" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="320" y="84" width="240" height="72" rx="8"/>
    <text class="fg-t2" x="340" y="110">opaque トークンストア</text>
    <text class="fg-xs" x="340" y="128">次の呼び出しで行を revoked に</text>
    <text class="fg-mxs" x="340" y="146">RevokeByGrant</text>
    <path class="fg-leader" d="M564,120 H620 M620,54 V193"/>
    <path class="fg-edge fg-edge--thin" d="M620,54 H696" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="658" y="47" text-anchor="middle">参照する</text>
    <path class="fg-edge fg-edge--thin" d="M620,120 H696" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="658" y="113" text-anchor="middle">参照する</text>
    <path class="fg-edge fg-edge--ok fg-edge--thin" d="M620,193 H696" marker-end="url(#fg-ao)"/>
    <text class="fg-xs fg-ok" x="658" y="186" text-anchor="middle">参照する</text>
    <rect class="fg-box" x="700" y="34" width="224" height="40" rx="6"/>
    <text class="fg-m" x="718" y="59">OP /userinfo</text>
    <rect class="fg-box" x="700" y="100" width="224" height="40" rx="6"/>
    <text class="fg-m" x="718" y="125">OP /introspect</text>
    <rect class="fg-box fg-box--ok" x="700" y="166" width="224" height="54" rx="6"/>
    <text class="fg-t2" x="718" y="188">RS</text>
    <text class="fg-xs" x="718" y="208">自身の /introspect 呼び出し</text>
  </svg>
  <figcaption class="fig-note">迂回路が存在しないため、到達範囲に穴が空きません。トークンを読めないリソースサーバは、問い合わせずに受理する方法を持たず、その問い合わせがギャップを閉じています。</figcaption>
</figure>

- **JWT 経路。** トークンが OP のエンドポイント（`/userinfo`、`/introspect`、`/revoke`）に到達したときに registry を参照します。そこに来た revoked JWT は即座に拒否されます。**JWKS でオフライン JWT 検証している RS は registry を参照しません** — それが自己完結トークンの存在意義だからです。その RS では revoked JWT が `exp` まで通り続けます。
- **Opaque 経路。** トークンを使うすべての経路が `/introspect` を通るので、カスケードは定義上どの RS にも届きます。

::: info opaque の introspection は inactive 形を統一する
confidential client の認証後は、認可されない client、該当行なし、失効済み、期限切れ、DPoP / mTLS proof 不一致、委譲対象外の audience など、すべての inactive 経路が同じ `{"active": false}` に集約されます（RFC 7662 §2.2 準拠）。認証前の失敗はプロトコルのエラーを返します。introspection を経由した列挙や状態推測が構造的に閉じられます。
:::

::: danger 「ログアウトされた」の要件に合う形式を選んでください
- 「ログアウトしたら、そのアクセストークンの寿命中、OP の管理外の RS でさえ呼び出せなくなる」 → opaque、または **全 RS に introspect を必須化した JWT**。
- 「ログアウトしたら OP のエンドポイント（`/userinfo`、`/introspect`）でトークンが拒否され、RS は次の refresh ローテーションで状態を取り込み直す」 → JWT で十分です。

「RS 側ステートレス検証」と「RS にも届く即時ログアウトカスケード」の両立は構造的に不可能です。どちらかを選ぶ必要があります。
:::

リフレッシュトークンのローテーションも関連する調整ポイントです。本ライブラリはどのローテーションでも新しいアクセストークンを発行しますが、JWT 形式では **旧アクセストークンは `exp` まで生き残ります**（カスケードのギャップはアクセストークン TTL の範囲で閉じる設計）。

一方 opaque 形式は、ローテーションのたびに opaque サブストアに対して `RevokeByGrant` を呼び、旧アクセストークンも同時に失効させます — **漏洩したリフレッシュトークンで旧アクセストークンを再利用される窓は、事実上 clock skew まで縮みます**。

もうひとつのカスケードのきっかけは **RFC 6749 §4.1.2 の認可コード再利用検出** です。盗まれた code が二度目に提示された瞬間、その grant 配下のアクセストークンがすべて失効します。

JWT 形式では grant tombstone を書き込み（明示時のみの JTI registry 戦略下では registry 行を反転）、opaque 形式では opaque サブストアの行が revoked に切り替わり、上の経路図と同じ可視範囲で伝播します。`/end_session` だけがカスケードの起点ではない、ということです。

::: details カスケード失効とは
ここで言う「カスケード」は「1 回の失効イベントが、同じ grant から派生したすべての成果物に届く」という意味です。`/end_session` が 1 回鳴れば、OP は grant を revoked 状態にし、その瞬間からその grant 配下のアクセストークン / リフレッシュトークン / shadow 行はすべて、OP に問い合わせるどの経路でも無効として扱われます。対比となる「リーフ失効」は「この特定のトークンだけ失効させ、同じ grant 配下のほかは有効に保つ」というやり方で、RFC 7009 の `/revocation` を 1 件の `jti` に対して使ったときの挙動がこれにあたります。
:::

## JWT アクセストークン失効戦略

JWT 経路にはもうひとつの調整ポイントがあります — **OP が失効状態をどう永続化するか** です。opaque トークンは検証側がレコード参照を必要とするため、ストレージは本質的にトークンごとです。したがってこの戦略は JWT のみに適用されます。

::: details tombstone / shadow 行 / JTI registry とは
失効戦略を語るときに出てくる、ストレージ層の語彙です。

- **tombstone** — 「このキーで識別される対象は失効済み」を記録する 1 行。トークン本体は保存せず、grant ID と「失効した」事実だけを持ちます。検証はキー検索で tombstone テーブルを引きます。
- **shadow 行** — 発行された各トークンを「影のように」追いかける行で、`jti` ごとに 1 行、`revoked_at` や監査用フィールドを持ちます。tombstone より重く（失効時ではなく発行時に書き込む）、その分すべてのトークンの完全な監査ログが残ります。
- **JTI registry** — その shadow 行を保持するテーブルで、`jti` をキーにします。既定戦略では使いません — 明示時のみの `RevocationStrategyJTIRegistry` で使われます。
- **いつ気にすべきか:** データベースのサイジングを行うときです。tombstone は `O(失効した grant 数)`、shadow 行は `O(発行レート × TTL)` で増えます。高負荷の OP では、千行単位と百万行単位の差になります。
:::

`go-oidc-provider` は 3 つの戦略を同梱しており、`op.WithAccessTokenRevocationStrategy` で選択します。既定は `RevocationStrategyGrantTombstone` です。旧来の `jti` ごとの方式は `RevocationStrategyJTIRegistry` として残してあり、必要な組み込み側は明示的に切り替えられます。

| 戦略 | 発行時の書き込み | 失効時の書き込み | 定常状態の行数 | 備考 |
|---|---|---|---|---|
| **`RevocationStrategyGrantTombstone`**（既定） | **0 件** | 1（tombstone 行） | `O(失効した grant 数 + 失効した jti 数)` | OP は grant に紐づく JWT に `gid` という private claim（GrantID）を含め、自身の検証エンドポイントで grant ごとの tombstone テーブルを参照します。 |
| `RevocationStrategyJTIRegistry` | 1（shadow 行） | N（grant 配下の AT ごとに 1 件 UPDATE） | `O(発行レート × AT_TTL)` | 発行された AT 1 本ごとに `store.AccessTokenRegistry` の shadow 行が 1 件作られます。AT 単位の監査ログが規制要件のときに選択できます。 |
| `RevocationStrategyNone` | 0 | 0 | 0 | `/revocation` は RFC 7009 §2.2 のとおり 200 を冪等に返しますが、実体としては何もしません。JWT AT は `exp` まで有効なままです。**本ライブラリの FAPI プロファイル下では `op.New` が拒否します**。これはライブラリのポリシーです。 |

::: tip 既定は発行時に何も書きません
既定戦略では `/token` の処理経路がデータベースに触れません。代わりに、grant が失効するとき（ログアウト、コード再利用カスケード、リフレッシュトークン連鎖の侵害）に grant ID をキーにした tombstone 行を 1 件だけ書き込みます。`/userinfo` と `/introspect` は JWT の `gid` を tombstone と突き合わせるので、失効した grant の JWT は OP のエンドポイントで即座に拒否されます。

`jti` 単位の `/revocation`（RFC 7009）は同じサブストアに拒否リスト行を 1 件書き込みます。**grant tombstone へはまとめられません** — 同じ grant 配下のほかの AT はそのまま有効です。
:::

::: info `gid` claim は private
grant に紐づく JWT アクセストークンは、`gid` という private claim（RFC 7519 §4.3、omitempty）に OP 側の GrantID を持たせます。OP だけが解釈する claim であり、リソースサーバは無視できます。既存の RFC 9068 検証器でこの claim を参照しない場合、動作には影響しません。
:::

::: details 戦略の選択方法
下の「設定例」にある完全な browser Provider に追加する差分です。issuer、store、keyset、cookie key、login flow は意図的に省略しています。

```go
// 既定は RevocationStrategyGrantTombstone なので、追加オプションは不要です。

// 完全な構成にこのオプションを追加すると、旧来の jti 単位 registry 方式になります。
op.WithAccessTokenRevocationStrategy(op.RevocationStrategyJTIRegistry)

// サーバ側 JWT 失効を意図的に無効化する場合だけ追加します（非 FAPI 配備専用）。
op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)
```
:::

::: warning FAPI は構築時に `RevocationStrategyNone` を拒否します
本ライブラリのいずれかの FAPI プロファイルと併用して `RevocationStrategyNone` を選ぶと、`op.New` が失敗します。これはライブラリの安全策です。現行の FAPI 2.0 Security Profile §5.3.4(3) はリソースサーバにアクセストークンの失効状態の検証を求めており、OP 内部の失効戦略だけでリソースサーバの適合性は決まりません。
:::

::: warning サブストアの存在は `op.New` で強制されます（BREAKING）
既定の `RevocationStrategyGrantTombstone` は `Store.GrantRevocations()` が nil 以外なサブストアを返すことを必須とし、`RevocationStrategyJTIRegistry` は `Store.AccessTokens()` を必須とします。どちらの判定も構築時に走るため、サブストアが欠けている構成は最初の `/revoke` / refresh 再利用検出で半端にカスケードが走るのではなく、`op.New` が構成エラーを返して停止します。同梱の `inmem` / `sql` / composite アダプタはどちらのサブストアも返すので、`Store` を自作する組み込み側は両方を実装してください（失効処理を必要としない非 FAPI 配備は `RevocationStrategyNone` に固定する選択肢があります）。
:::

## 形式の選び方

判断は概ね「誰を信頼するか」「RS にどこまで要求できるか」「アクセストークン TTL がどれだけ短いか」で決まります。

<figure class="fig">
  <div class="fig-head">形式の選び方</div>
  <svg class="fig-svg" role="img" aria-labelledby="atf-choice-title" viewBox="0 0 960 374" xmlns="http://www.w3.org/2000/svg">
    <title id="atf-choice-title">アクセストークンの形式を 3 つの問いで決める判定木。すべてのリソースサーバに introspection の呼び出しを義務付けられるか、トークンの有効期限で区切られるギャップを許容できるか、内部と外部のリソースサーバが混在するかを順に見ます。</title>
    <!-- 1 -->
    <rect class="fg-box" x="36" y="24" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="52">すべての RS に毎回 /introspect を義務付けられるか</text>
    <text class="fg-xs" x="56" y="74">自社が運用していない RS も含めて</text>
    <path class="fg-edge" d="M434,57 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="50" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--accent" x="530" y="28" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="52">Opaque</text>
    <text class="fg-xs" x="550" y="72">失効がすべてに届く。代償は 1 回ずつの往復</text>
    <path class="fg-edge" d="M233,94 V116" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="110">いいえ</text>
    <!-- 2 -->
    <rect class="fg-box" x="36" y="120" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="148">アクセストークンの TTL を十分短くできるか</text>
    <text class="fg-xs" x="56" y="170">exp までのギャップを許容できる長さに</text>
    <path class="fg-edge" d="M434,153 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="146" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--accent" x="530" y="124" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="148">JWT — 既定</text>
    <text class="fg-xs" x="550" y="168">処理経路に呼び出しが無く、ギャップは exp で閉じる</text>
    <path class="fg-edge" d="M233,190 V212" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="206">いいえ</text>
    <!-- 3 -->
    <rect class="fg-box" x="36" y="216" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="244">内部 RS と外部 RS が混在するか</text>
    <text class="fg-xs" x="56" y="266">audience が異なれば、要求できることも異なる</text>
    <path class="fg-edge" d="M434,249 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="242" text-anchor="middle">はい</text>
    <rect class="fg-box" x="530" y="220" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="244">audience ごとの使い分け</text>
    <text class="fg-xs" x="550" y="264">内側には JWT、外側には opaque。形式は audience 単位で決まる</text>
    <path class="fg-edge" d="M233,286 V308" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="302">いいえ</text>
    <!-- 既定 -->
    <rect class="fg-box" x="36" y="312" width="888" height="54" rx="8"/>
    <text class="fg-t2" x="56" y="334">Opaque</text>
    <text class="fg-xs" x="56" y="354">ギャップを許容できず TTL も短くできないなら、残る選択肢は毎回の往復です</text>
  </svg>
  <figcaption class="fig-note">形式は audience の性質であって、デプロイ全体の性質ではありません。自社で運用するサービスには JWT を、そうでないサービスには opaque を、同じ OP から発行して構いません。</figcaption>
</figure>

audience ごとの選択は実運用の現実解として有効です。OP に近い内部 RS は opaque で運用してログアウトを即時反映させ、公開向けの RS は JWT で運用して OP を処理経路上の依存にしない、といった切り分けができます。

## 設定例

既定（全 audience に対して JWT）:

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(browserFlow),
    // 形式オプション無し — AccessTokenFormatJWT が選ばれる
)
```

`browserFlow` は subject を確定する primary step を持つ `LoginFlow`、`cookieKey` は 32 byte の AES-256-GCM 鍵です。既定の grant set は `authorization_code` + `refresh_token` なので、ブラウザ用 Provider には cookie key と login flow（または従来の authenticator 設定）が必要です。

machine-to-machine 用の Provider では client-credentials grant だけを選びます。ブラウザの認可ステップ、login flow、cookie key は必要ありません:

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithGrants(grant.ClientCredentials),
)
```

全アクセストークンを opaque に切り替え:

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(browserFlow),
    op.WithAccessTokenFormat(op.AccessTokenFormatOpaque),
)
```

::: details RFC 8707 resource indicator ごとに混成させる例
マップキーは resource URI。空キーは予約済 — 既定 audience 用には `WithAccessTokenFormat` を使います。

```go
provider, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithKeyset(keys),
    op.WithStore(storage),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(browserFlow),
    op.WithAccessTokenFormatPerAudience(map[string]op.AccessTokenFormat{
        "https://api.internal.example.com": op.AccessTokenFormatOpaque,
        "https://reports.example.com":      op.AccessTokenFormatJWT,
    }),
)
```

各キーは構築時に正規化されます（scheme と host を小文字化、default port を除去、末尾スラッシュを揃える）。`/token` も `resource=` の生入力を同じヘルパで正規化してからマップ参照するので、登録済みキーと case や末尾スラッシュだけ違うリクエストでも正しい format が選ばれます。同じ値に正規化される 2 つのキーは構成エラーで拒否されます。fragment と `userinfo` セグメントはどのキーでも禁止です — RFC 8707 §2 が resource indicator にこれらを許していません。
:::

::: tip 構築時ガード
opaque を選択しているのに、設定された `Store` の `OpaqueAccessTokens()` が `nil` を返す場合、`op.New` は構築時点で構成を拒否します。誤設定は最初の `/token` リクエストではなく、起動時に表面化します。
:::

::: details OP 側の opaque token 保存方針（実装詳細）
opaque サブストアはリフレッシュトークン store と同じ「保存時にハッシュ化」方針に従います:

- OP は `crypto/rand` から 32 バイト乱数を取り、base64url（パディング無し、43 文字）にエンコードして、生の値をクライアントに渡します。
- サブストアは **生の値ではなく SHA-256 digest を永続化します**。インメモリの参照実装はテストの見通しを優先して pepper 無しのハッシュを使いますが、SQL adapter は HMAC pepper を受け付けるので、DB ダンプ単独では bearer 資格として成立しないようにできます。
- `Find` / `RevokeByID` は提示されたトークンをハッシュ化し、digest の定数時間比較で行を引きます。
- 期限切れ行は、code / リフレッシュトークン / PAR レコードを掃除する周期的な `GC` sweeper が同じループで落とします。

通信路に流す byte 列には prefix もチェックサムも付けません — ブランド prefix は受動的な観測者に配備判別の手がかりを与えるだけで、introspection 側のディスパッチには何も寄与しないからです。
:::

## RS 側のコードへの影響

- **JWT 形式。** JWKS をキャッシュ・更新し、署名と許可アルゴリズム、`typ=at+jwt`、期待する `iss` と `aud`、`exp` と `iat`、必須 claim（`sub`、`client_id`、`jti`）を検証します。DPoP または mTLS の場合は `cnf` を proof や証明書と照合します。通常の検証では OP への問い合わせは不要です。即時の失効確認が必要な経路では `/introspect` を使います。
- **Opaque 形式。** RS のコードは毎リクエスト（あるいはキャッシュミスのたび）に `POST /introspect` を呼び出します。introspect 応答は RFC 9068 JWT が運ぶのと同じ `sub` / `scope` / `aud` / `cnf` を持つので、RS のパイプライン全体は変える必要はありません — 検証ステップだけが変わります。

送信者制約（DPoP RFC 9449、mTLS RFC 8705）はどちらの形式でも伝播します: JWT 経路は `cnf` claim を直接埋め込み、opaque 経路は OP 側のレコードから `cnf` を再構成するので、RS が見る proof の要件は変わりません。

## 次に読む

- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — 各アーティファクトの役割と、なぜ交換不可なのか。
- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — `cnf` が JWT vs opaque の選択をどう跨いで残るか。
- [Back-Channel Logout](/ja/use-cases/back-channel-logout) — OP がどのように他 RP にログアウトを伝播し、shadow 行の失効をカスケードさせるか。
