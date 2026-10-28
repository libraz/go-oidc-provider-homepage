---
title: ID トークン / アクセストークン / userinfo
description: ID Token、アクセストークン、UserInfo の契約と、JWT / opaque の選択、OP 側の失効、introspection の認可を説明します。
pageClass: pg-concepts-tokens
---

# ID トークン / アクセストークン / userinfo

OIDC は 3 種の ID 関連データを扱います。同じ OP のフローで登場するため一見交換可能に見えますが、それぞれ契約が異なります。これを混同するのはバグの典型例です。

::: tip 30 秒でつかむ要点
- **ID トークン** — 「このユーザがこの RP にログインした」という署名付きの認証結果。audience は RP。API には送らない。
- **アクセストークン** — クライアントが API に提示する資格情報。audience はリソースサーバ。**既定形式は RFC 9068 に沿った形の JWT、opaque は明示時のみ。** DPoP バインド時は `Authorization: DPoP` と proof を使います。
- **UserInfo** — `GET /userinfo` にアクセストークンを載せて最新 claim を取得するエンドポイント。トークンではありません。既定の応答は JSON ですが、OIDC では署名付き、または署名後に暗号化した JWT 応答も使えます。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — Bearer Token Usage
- [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — Token Revocation
- [RFC 7517](https://datatracker.ietf.org/doc/html/rfc7517) — JSON Web Key (JWK)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token (JWT)
- [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662) — Token Introspection
- [RFC 8176](https://datatracker.ietf.org/doc/html/rfc8176) — Authentication Method Reference Values
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 9470](https://datatracker.ietf.org/doc/html/rfc9470) — Step-up Authentication
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2（ID トークン）、§5.3（UserInfo）、§3.1.2.1（nonce）、§5.5（claims request）
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
:::

::: details JWT とは
**署名付き compact JWT**（JSON Web Token、RFC 7519）は、3 つの base64url エンコード部分を `.` で繋いだ文字列です（`header.payload.signature`）。header と payload は JSON で、signature は対応する秘密鍵の保有者から来たものであることを暗号学的に検証する部分です。暗号化された JWT は 5 つの部分を持つ compact JWE で、署名済み JWT をその中に包むこともできます。

OIDC では **ID トークンは常に JWT** です。本ライブラリのアクセストークンは既定では RFC 9068 に沿った形の JWT ですが、OP 全体または audience ごとに opaque 形式へ切り替えられます。発行時の ES256 限定と入力での `jti` 検査の緩さにより、RFC 9068 への対応は [一部](/ja/compliance/rfc-matrix) です。UserInfo は既定では JSON ですが、要求とクライアント登録に応じて、署名付き JWT または署名後に暗号化した nested JWT を返せます。
:::

## 一覧

| 要素 | 形式 | Audience (`aud`) | 行き先 | 寿命 | 読む人 |
|---|---|---|---|---|---|
| **ID トークン** | 署名 JWT（常に） | RP の `client_id` | OP → RP のみ | 数分（既定 10 分） | RP（誰がログインしたか確認） |
| **アクセストークン** | 既定は JWT。設定により opaque — 詳細は後述 | RS 識別子 | クライアント → RS（通常は `Authorization: Bearer`、DPoP バインド時は `Authorization: DPoP` と proof） | 数分 | RS（API 呼び出しを認可するか判断） |
| **UserInfo 応答** | 既定は JSON。要求・登録に応じて署名付き JWT または署名後に暗号化した nested JWT | RP（JWT 形式では RP の `client_id` が `aud` に入る） | RP → OP `/userinfo`（アクセストークン付き） → RP | リクエスト毎 | RP（最新 claim 取得） |

<figure class="fig">
  <div class="fig-head">誰が何を発行し、誰が検証するか</div>
  <svg class="fig-svg" role="img" aria-labelledby="tokens-flow-title" viewBox="0 0 960 320" xmlns="http://www.w3.org/2000/svg">
    <title id="tokens-flow-title">OP が ID トークンとアクセストークンを RP に発行する図。RP はアクセストークンをリソースサーバと OP の userinfo エンドポイントに提示し、userinfo はログイン中のユーザについての claim を返します。</title>
    <!-- OP -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="192" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="52">OP</text>
    <text class="fg-s" x="48" y="76">OpenID Provider</text>
    <text class="fg-mxs" x="48" y="100">go-oidc-provider</text>
    <!-- RP -->
    <rect class="fg-box" x="384" y="24" width="192" height="96" rx="8"/>
    <text class="fg-t" x="400" y="52">RP</text>
    <text class="fg-s" x="400" y="76">Relying Party</text>
    <text class="fg-s" x="400" y="100">クライアント</text>
    <!-- RS -->
    <rect class="fg-box" x="736" y="24" width="192" height="96" rx="8"/>
    <text class="fg-t" x="752" y="52">RS</text>
    <text class="fg-s" x="752" y="76">Resource Server</text>
    <text class="fg-s" x="752" y="100">あなたの API</text>
    <!-- issuance -->
    <path class="fg-edge fg-edge--accent" d="M224,48 H384" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="304" y="38" text-anchor="middle">id_token</text>
    <path class="fg-edge fg-edge--accent" d="M224,104 H384" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="304" y="94" text-anchor="middle">access_token</text>
    <!-- API call -->
    <path class="fg-edge" d="M576,72 H736" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="656" y="62" text-anchor="middle">access_token</text>
    <!-- userinfo -->
    <path class="fg-leader" d="M128,120 V200"/>
    <rect class="fg-box fg-box--sub" x="32" y="200" width="256" height="96" rx="8"/>
    <text class="fg-m" x="48" y="228">/userinfo</text>
    <text class="fg-s" x="48" y="252">ユーザの claim</text>
    <text class="fg-s" x="48" y="276">OP 側のエンドポイント</text>
    <path class="fg-edge" d="M512,120 V232 H288" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="400" y="222" text-anchor="middle">GET /userinfo</text>
    <path class="fg-edge fg-edge--accent" d="M288,288 H544 V120" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="416" y="278" text-anchor="middle">200 { claims }</text>
  </svg>
  <figcaption class="fig-note">ID トークンは RP のためのもので、そこで止まります。「誰がログインしたか」に答えるためのトークンです。一方アクセストークンは RP が外へ持ち出す資格情報で、あなたの API にも <code>/userinfo</code> にも同じように提示されます。どちらも ID トークンを受け取ることはありません。</figcaption>
</figure>

## ID トークン —「誰がログインしたか」

**OIDC Core 1.0 §2** で定義される署名付き JWT です。RP は OP の JWKS（RFC 7517）で署名を検証し、`iss`、`aud`、`exp` などの必須 claim を確認します。認可リクエストで `nonce` を送った場合は、ID トークンにも同じ値が必須で、RP は一致を検証します。標準 claim:

| Claim | 意味 | 仕様 |
|---|---|---|
| `iss` | Issuer（OP）。RP の期待値と一致すること。 | OIDC Core §2 |
| `sub` | Subject 識別子 — OP 内で安定なユーザ ID。 | OIDC Core §2 |
| `aud` | Audience — RP の `client_id` を含むこと。 | OIDC Core §2 |
| `azp` | Authorized party — トークンを要求した `client_id`（`aud` に複数値があるとき）。本ライブラリが発行する ID トークンの audience は単一なので、設定しません。 | OIDC Core §2 |
| `exp` / `iat` | 有効期限 / 発行時刻。 | RFC 7519 |
| `nonce` | authorize 要求の `nonce` をエコー。リプレイ防御。 | OIDC Core §3.1.2.1 |
| `auth_time` | ユーザが認証した時刻（発行時刻ではなく）。 | OIDC Core §2 |
| `acr` | Authentication Context Class Reference — 認証手段の保証水準。 | OIDC Core §2 / RFC 9470 |
| `amr` | Authentication Methods References — `pwd`、`otp`、`mfa`、`hwk` 等。 | RFC 8176 |
| `at_hash` / `c_hash` | 同時に発行したアクセストークンと認可コードのハッシュ。RP が ID トークンをそれらに結び付けて検証できる。 | OIDC Core §3.1.3.6 |

`auth_time`・`acr`・`amr` は、そのトークンを発行した認可の背後にある認証を表します。同じユーザが同じクライアントで後からログインしても、すでに発行されたトークンの値は書き換わりません。リフレッシュでも、chain の元になった認可の値が引き継がれます。

::: details `acr` とは
**`acr`**（Authentication Context Class Reference）は認証コンテキストを示す文字列です。語彙は OP 側で決め、`urn:mace:incommon:iap:silver` や `urn:openbanking:psd2:sca` などを使えます。RP が `/auth` で送る `acr_values=...` は優先順位付きの希望値で、OIDC Core では任意の claim 要求です。必須条件にするには `claims.id_token.acr` に `essential: true` と `value` または `values` を指定します。本ライブラリでは、現在のセッションが合わないときにステップアップするか、対話できなければエラーを返します。`amr` は使用した認証手段を列挙します。
:::

::: details `amr` とは
**`amr`**（Authentication Methods References、RFC 8176）は、今回のセッションでユーザが実際に提示した *要素* を表す短い文字列の配列です。`pwd`（パスワード）、`otp`（ワンタイムコード）、`mfa`（複数要素を使った）、`hwk`（ハードウェアキー）、`face`（顔認証）など。RP は信頼判断ではなく監査やポリシー（「管理コンソールには `mfa` を必須」など）の文脈で読みます — 信頼判断は `acr` の役目です。
:::

::: details `auth_time` とは
**`auth_time`** は、ユーザが *OP に対して認証した* 時刻の Unix timestamp です。`iat`（*このトークン* が発行された時刻）とは別物です。1 時間前にログインしたユーザがリフレッシュ直後だと、`iat` は新しくても `auth_time` は古いままになります。RP は `max_age` ポリシー（「30 分以上経っていたら再認証」）の判定に使います。RP が `/auth` に `max_age` を載せると、OP 自身もサーバ側で強制します。
:::

::: details `azp` とは
**`azp`**（Authorized Party）は、ID トークンを *要求した* `client_id` です。意味があるのは `aud` に複数値が入っているときだけ — そのケースで「複数 audience のうちどれが実際に authorize 要求を開始したか」を曖昧でなく示します。単一 RP の通常ケースでは `aud` が `[client_id]` 1 件で済むので `azp` は省略されます。RP は「`aud` が複数あるのに `azp` が欠けている / 自分の `client_id` と一致しない」ID トークンを拒否すべきです。
:::

::: details JWKS とは
**JWKS**（JSON Web Key Set、RFC 7517）は OP が `/jwks`（discovery 文書に記載）で配信する JSON 文書です。OP の **公開鍵** の一覧が入っており、RP は一度取得してキャッシュし、ID トークンの署名をオフラインで検証するのに使います。OP は鍵をローテーションするとき、署名に使う前に新鍵を JWKS に載せて先行公開するので、RP は再取得すればそのまま追従できます。
:::

::: warning ID トークンを `Authorization: Bearer` に乗せない
ID トークンの audience は RP であって RS ではありません。正しく検証する RS は拒否しますが、検証が不十分な API に送ると誤受理や email などの情報の露出につながります。**API にはアクセストークンを使ってください。**

```http
# NG: aud が RP の client_id なので、RS が受け取るトークンではない
GET /api/invoices HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...id_token...

# OK: aud が API / resource server を指す access token を送る
GET /api/invoices HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...access_token...
```
:::

## アクセストークン —「このクライアントはこの API を呼べる」

リソースサーバ（RS）が検証するアクセストークンです。制約なし・mTLS バインド時は Bearer 方式（RFC 6750）、DPoP バインド時は proof を伴う DPoP 方式（RFC 9449 §7.1）で提示します。形式は次の 2 種類です:

| 形式 | 検証方法 | OP 側の状態 |
|---|---|---|
| **Opaque** | RS が毎回 `/introspect`（RFC 7662）を呼ぶ。 | OP がトークンに対応する行を保持。 |
| **JWT（RFC 9068 に沿った形）** | RS が署名と許可アルゴリズム、`typ=at+jwt`、`iss`、`aud`、`exp`、`iat`、必須 claim を検証する。送信者制約付きなら proof も検証する。 | ローカルで検証できるが、OP は自身のエンドポイントでの失効判定に grant tombstone や JTI 行を持つ場合がある。 |

JWT アクセストークンには次の claim が入ります。

| Claim | 意味 | 読む側 |
|---|---|---|
| `iss`、`sub`、`aud`、`exp`、`iat`、`jti`、`client_id` | RFC 9068 の必須セット。`aud` はリソースサーバで、`sub` はクライアントごとの subject のため ID トークンの値と一致する。 | RS |
| `scope` | 許可された scope（スペース区切り）。 | RS |
| `cnf` | 送信者制約のバインド。DPoP は `jkt`、mTLS は `x5t#S256`。Bearer では無い。 | RS |
| `auth_time`、`acr`、`amr` | トークンを発行した認可の背後にある認証。 | RS（step-up のポリシー用） |
| `authorization_details` | grant が RFC 9396 の detail を持つ場合。 | RS |
| `gid` | private claim。grant ID で、grant tombstone との突き合わせに使う。 | OP のみ |
| `userinfo_claims` | private claim。claims request の `userinfo` メンバ。要求が無ければ `{}`。`/userinfo` はここから claim を開示する。 | OP のみ |

リソースサーバは `gid` と `userinfo_claims` を無視してください。この 2 つの名前は予約されており、カスタム grant が追加 claim として設定することはできません。

### ここが本題: session_end / userinfo / revocation はトークン履歴に依存する

::: warning JWT のオフライン検証からは OP 側の失効が見えない
RS は OP に問い合わせず JWT を検証できますが、その経路では grant tombstone、JTI の失効行、ログアウトカスケード、認可コード再利用による失効を検出できません。OP の `/userinfo` と `/introspect` は設定された OP 側の状態を参照します。オフライン RS で同じ状態が必要なら、introspection、監査イベントから作る拒否リスト、または短いアクセストークン寿命を組み合わせます。
:::

| フロー | 本来の判定 | 純粋ステートレス JWT で壊れる箇所 |
|---|---|---|
| **`/userinfo`**（OIDC Core §5.3） | このトークンは今もユーザを正しく代表しているか | OP が JWT の grant / JTI 状態を確認してから claim を投影する。 |
| **`/end_session`**（RP-Initiated Logout） | セッションを終了させる | OP は失効を記録するが、オフライン RS は `exp` まで JWT を受け入れ続ける。 |
| **`/revoke`**（RFC 7009） | 特定トークンを無効化 | 設定した OP 側の戦略が失効を記録する。オフライン RS には伝わらない。 |
| **`/introspect`**（RFC 7662） | 失効済みトークンに `active: false` を返す | OP が署名、寿命、issuer、設定された失効状態を確認する。 |

「JWT vs opaque」記事ではしばしば軽く流される論点ですが、本番運用では重く効いてきます。

### 本ライブラリの設計

本ライブラリは RFC 9068 に沿った形の JWT を既定とし、opaque は明示時だけ使えるようにしています。どちらの形式も **OP 側で失効できます**。検討する点は、**RS が毎リクエスト OP に問い合わせるか**、そして **ログアウトによる失効がどこまで届くか** です。

| | **既定 — JWT（RFC 9068 に沿った形）** | **明示時のみ — Opaque** |
|---|---|---|
| 通信路上の形式 | base64url JWT（`header.payload.signature`） | ランダムな opaque 文字列 |
| RS 側の検証 | JWKS でオフライン検証 | リクエスト毎に `/introspect` を呼ぶ |
| 発行時の OP 側状態 | 既定の grant-tombstone 戦略では行なし。JTI registry を選んだ場合だけ JTI shadow 行を作る | `store.OpaqueAccessTokenStore` にハッシュ化した行 |
| カスケードの到達範囲 | OP が経由する境界（`/userinfo`、`/introspect`） | RS の全リクエスト |
| 発行時の監査証跡 | 既定では無し。`RevocationStrategyJTIRegistry` を明示すると発行ごとに 1 行 | 発行ごとに 1 行（自動） |
| 設定方法 | （既定） | `op.WithAccessTokenFormat(...)` あるいは RFC 8707 の resource 毎に `op.WithAccessTokenFormatPerAudience(...)` |

::: warning カスケードの及ぶ範囲は形式に依存する
`/userinfo`・`/introspect`・`/revoke`・`/end_session`・認可コード再利用検出のカスケードはすべて OP 側の失効状態を使います。失効済み / ログアウトでカスケード失効したトークンは、JWT の署名がまだ通っていても `/userinfo` で `WWW-Authenticate: Bearer error="invalid_token"` を返して拒否されます。

**ただし、リクエストが OP に到達する場合に限ります。** JWKS でオフライン検証する RS は、同等の拒否リストを受け取るか token が期限切れになるまでカスケードを知りません。opaque 形式は、すべての RS 検証が `/introspect` に到達するため、この隙間を閉じます。
:::

どこまで失効させるかは、イベントによって異なります。

| イベント | JWT アクセストークン | opaque アクセストークン | リフレッシュトークン |
|---|---|---|---|
| アクセストークン 1 つへの `/revoke` | そのトークン（`jti` で拒否リストに登録） | そのトークン | なし |
| リフレッシュトークンへの `/revoke` | grant のすべてのアクセストークン | grant のすべてのアクセストークン | そのトークンのローテーション chain。grant の別の chain は有効なまま |
| リフレッシュトークンのローテーション | なし（`exp` で失効） | 同じ chain のもの | 古いトークンが置き換わる |
| 認可コード / リフレッシュトークンのリプレイ | grant 全体 | grant 全体 | grant 全体 |
| `/end_session`、Grant Management の失効、`RevokeSubject` | grant 全体 | grant 全体 | grant 全体 |

JWT の列は既定の grant-tombstone 戦略を前提にしています。`RevocationStrategyNone` では、OP は JWT について何も記録しません。「grant 全体」には、同じクライアントでのそのユーザの他のセッションも含まれます。リプレイやログアウトがあらゆる場所に届くのに対し、ローテーションや単一トークンの `/revoke` が狭い範囲に留まるのはこのためです。

### introspection を呼べるのは confidential client だけ

`/introspect` はトークンを見る前に呼び出し元を認証します。public client と token endpoint 認証方式が `none` の client は、`401` と `invalid_client` を受け取ります。confidential client は自分に発行された access token または refresh token を introspect できます。client をまたぐアクセスは既定で inactive になり、呼び出し元が対応する protected resource の `IntrospectionClients` に登録され、access token の `aud` がその resource を示す場合だけ有効になります。この委譲は refresh token には適用されません。

active な opaque access token の introspection response には、通常の `active`、`client_id`、`token_type`、`exp`、`iat`、`sub`、`aud`、`scope` に加えて `iss` が含まれ、トークンが持っていれば `auth_time`、`acr`、`amr`、`authorization_details` も含まれます。RS はローカルポリシーの一部として `iss` と `aud` を検証してください。refresh token の応答に `token_type` はありません。RFC 7662 はこのメンバをアクセストークンの型と定義しており、`Bearer` と付けるとリソースサーバがリフレッシュトークンをアクセストークンとして扱ってしまうおそれがあるためです。

::: details `jti` / `gid` / tombstone とは
本ライブラリが発行するアクセストークン JWT は `jti`（RFC 7519 §4.1.7、トークンごとの一意 ID）を含みます。grant の系譜があるトークンには `gid` という private claim（OP 側の GrantID）も入り、grant ID がない場合は省略されます。`gid` は OP だけが解釈する claim で、RS は無視します。

**既定 — grant-tombstone 戦略。** OP は grant ごとの小さな tombstone テーブルを保持し、検証時に JWT の `gid` を tombstone と突き合わせます。単一 AT の `/revoke` は `jti` をキーにした拒否リスト行を 1 件書き込みます。定常状態の行数は `O(失効した grant 数 + 失効した jti 数)` であり、`O(発行数)` ではありません。

**明示時のみ — JTI registry 戦略**（`RevocationStrategyJTIRegistry`）。OP は発行ごとに `jti` をキーにした shadow 行を 1 件書き込み、失効時には行の `Revoked` 列を反転させます。発行ごとの監査証跡が必要なときに有効。

**Opaque 形式。** 別サブストアを使います。行は bearer ID の SHA-256 digest をキーにし、RS は JWT を解読するのではなく `/introspect` を呼んで行に到達します。
:::

::: tip JWT と opaque の選択は意図的な設計判断
トレードオフ・負荷の形・設定オプションは専用ページにまとめてあります: [アクセストークンの形式 — JWT と opaque](/ja/concepts/access-token-format)。`WithAccessTokenFormat` を切り替える前に必ず読んでください — この選択は RS のコード、運用上のレイテンシ、そして自分の配備で「ログアウトされた」が何を意味するか、に直接効いてきます。
:::

::: info `aud` についての注意
アクセストークンの `aud` は **`client_id` ではなく**、リソースサーバの識別子です（クライアント seed の `Resources []string` フィールド、またはランタイムの RFC 8707 `resource` リクエストパラメータで決定）。
:::

## RS 側での `/introspect` のキャッシュ戦略

`/introspect`（RFC 7662）への OP の応答は、*その応答を発行した瞬間* についての権威ある回答です。RS 側でこの応答をキャッシュすること自体は仕様上認められており、レイテンシ要件によっては必須です。同時に、トークンの **失効到達距離** も変わります。「OP でこのトークンが失効した」から「この RS が拒否し始める」までの時間が、キャッシュ TTL の分だけ広がるためです。

| キャッシュ戦略 | レイテンシ / OP 負荷 | 失効ギャップ |
|---|---|---|
| **キャッシュなし** — RS は API 呼び出しごとに `/introspect` を呼ぶ。 | RS の処理経路でレイテンシが最大、OP の `/introspect` が呼び出しごとの依存になる。 | ゼロ — API 呼び出しは毎回 OP の現在状態を観測。 |
| **長いキャッシュ**（例: 5 分） | OP 負荷は最小、ただしキャッシュエントリが期限切れになるまで失効が伝播しない。 | TTL の分まで — ログアウトしたユーザのトークンがキャッシュ窓の残り時間だけ動き続ける。 |
| **短いキャッシュ**（60 秒以下） | OP 負荷は有界、レイテンシペナルティは窓の最初の呼び出しのみ。 | TTL の分まで — 多くの運用セキュリティ要件を満たすほど短く、バーストを吸収するには十分長い。 |

::: tip 推奨する既定
- **キャッシュキーはアクセストークンのハッシュ**（bearer 文字列の SHA-256）にする。`client_id` 単独はダメ — 同じクライアントの異なるセッションがキャッシュ行を共有してしまう。
- **セキュリティ重視 API は TTL 60 秒以下** — アカウント変更、決済、管理用エンドポイントなど。30 秒は無難な既定で、ギャップを「ユーザが気付かない程度」に抑えられます。
- **`op.AuditTokenRevoked` を購読しているなら、それで invalidate する。** RS が OP の監査ストリームに繋がっていれば、有界ギャップは「監査パイプラインの伝播速度」相当 — 通常は 1 秒以下になります。
- **破壊的アクションではキャッシュしない。** アカウント削除、送金、ロール付与、巻き戻しできない書き込みは、毎回 OP に再確認を取ってください。レイテンシコストは確かに発生しますが、代替は「ユーザがログアウトボタンを押したのにキャッシュ窓の間に攻撃者が口座を空にした」です。
:::

このトレードオフは revocation 有効の JWT アクセストークンにも対称に当てはまります。JWT の検証は JWKS に対するオフライン検証 — RS は OP を呼ぶ必要すらありません — が、**オフライン検証では失効が見えません**。OP が経由する境界（`/introspect`・`/userinfo`）と、その背後の grant-tombstone 参照こそが失効の正本です（tombstone 戦略については[設計判断 #19](/ja/security/design-judgments#dj-19) を参照）。`/userinfo` と同じ失効到達距離を RS で得たい場合は、次のいずれかになります:

1. `/introspect` を呼ぶ（上記いずれかのキャッシュ戦略と組み合わせて）
2. OP の監査ストリームを購読して、`op.AuditTokenRevoked` をオフライン JWT 検証用の拒否リストの入力として扱う

どちらもしない — 純粋オフライン JWT 検証、introspection なし、監査購読なし — を選ぶと、OP が grant を失効させた後も、以前に発行した JWT が `exp` まで検証に通り続けることがあります。その RS に失効が届くのは、RS が OP の状態を参照するか、同等の拒否リストを受け取るか、トークンが期限切れになったときです。リフレッシュトークンをローテーションしても、すでに発行した JWT は遡って無効になりません。低リスク API では受容可能な選択ですが、これは意図的なトレードオフであって、仕様が暗黙に保証してくれる既定値ではありません。

## UserInfo —「このアクセストークンに対する最新 claim をくれ」

既定では、`GET /userinfo`（OIDC Core §5.3）にアクセストークンを載せると、アクセストークンの scope の範囲でユーザ claim の JSON が返ります。OIDC では JWT 形式の応答も定義されています。本ライブラリでは `Accept: application/jwt` で署名付き応答を要求でき、クライアントに暗号化応答メタデータを登録すると、署名後に暗号化した nested JWE が返ります。

以下の curl は制約なしの Bearer トークンの例です。DPoP バインドされたトークンでは `Authorization: DPoP` と有効な `DPoP` proof ヘッダを使います。

```sh
curl -H "Authorization: Bearer <access_token>" https://op.example.com/oidc/userinfo
# {
#   "sub": "alice123",
#   "email": "alice@example.com",
#   "email_verified": true,
#   ...
# }
```

::: tip UserInfo を使うべきとき
- **ID トークン claim** はログイン時点のスナップショットです。
- **UserInfo** は最新値の参照経路 — ユーザが変えうる値（表示名など）が必要なら呼びます。

ほとんどのアプリは ID トークン claim で足ります。UserInfo は最新性が必要なときに使ってください。実装上は、ライブラリがアクセストークンを検証して設定された OP 側の失効状態を確認するので、ログインから UserInfo 呼び出しまでの間に失効したトークンは、JWT の署名が通っていても拒否されます。

UserInfo の claim を使う前に、RP はレスポンスの `sub` が ID トークンの `sub` と完全一致することを確認しなければなりません。OIDC Core §5.3.4 は、不一致なら UserInfo レスポンスを使用しないよう求めています。署名付き UserInfo JWT の場合は、署名と claim も検証します。
:::

## 設定オプション

| オプション | 制御対象 | 既定 |
|---|---|---|
| `op.WithAccessTokenTTL(d)` | アクセストークン寿命。上限は 24 時間、FAPI 2.0 プロファイル下では 10 分 | 5 分 |
| `op.WithRefreshTokenTTL(d)` | リフレッシュトークン寿命 | 30 日 |
| `op.WithRefreshTokenOfflineTTL(d)` | `offline_access` リフレッシュトークン寿命 | `WithRefreshTokenTTL` 継承 |
| `op.WithAccessTokenRevocationStrategy(s)` | OP 側で JWT アクセストークンを失効させる方式（grant tombstone、JTI registry、なし） | grant tombstone |
| `op.WithClaimsSupported(...)` | OP が返せる claim の列挙。discovery 文書に出る | — |
| `op.WithClaimsParameterSupported(false)` | OIDC §5.5 の正しい `claims` 要求を広告せず投影しない。malformed JSON は引き続き拒否 | on |
| `op.WithStrictOfflineAccess()` | 発行とリフレッシュ交換を OIDC Core §11 の厳格解釈に切り替え、`offline_access` が granted scope に含まれているときに限りリフレッシュトークンを発行・受理する（下の callout 参照） | off（緩い設定。`openid` + クライアントの `refresh_token` grant で発行）|

::: details `offline_access` とは
**`offline_access`** は OIDC 標準 scope（Core §11）で、「ユーザがその場にいなくてもアプリに動き続けてほしい」を表明する scope です。実運用上は、リフレッシュトークン発行に対するユーザ向け同意条件として働きます。OP は通常より強い同意画面（「あなたが居ないときも、このアプリはあなたの代わりに動けます」）を出し、本ライブラリではここで発行されたリフレッシュトークンを別 TTL バケット（`WithRefreshTokenOfflineTTL`）に振り分けるので、ログイン状態の維持フローを通常の短寿命リフレッシュより長く生かせます。
:::

::: details `WithStrictOfflineAccess` を入れる理由
OIDC Core §11 の既定（緩やかな）解釈では、granted scope に `openid` が含まれ、かつクライアントの `GrantTypes` に `refresh_token` がある場合にリフレッシュトークンが発行されます。このとき `offline_access` は同意画面の内容とどの TTL バケットを使うかを切り替えるだけです。同意画面と実際の発行条件をビット単位で揃えたいときに厳格解釈を選んでください。代償として、ログイン状態を維持したい RP はすべて明示的に `offline_access` を要求する必要があります。
:::

## 次に読む

- [アクセストークンの形式 — JWT と opaque](/ja/concepts/access-token-format) — 既定の JWT と明示時のみの opaque、その設計判断。負荷の形、ヘッダサイズ、失効の到達範囲、混在配備向けの per-audience 選択。
- [送信者制約](/ja/concepts/sender-constraint) — DPoP（RFC 9449）/ mTLS（RFC 8705）でアクセストークンをクライアント保有鍵に結び付ける。
- [ユースケース: client_credentials](/ja/use-cases/client-credentials) — エンドユーザの無いアクセストークン。
- [Back-Channel Logout](/ja/use-cases/back-channel-logout) — OP がどのように他 RP にログアウトを伝播し、shadow 行の失効をカスケードさせるか。
