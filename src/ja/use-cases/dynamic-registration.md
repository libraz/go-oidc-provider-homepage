---
title: 動的クライアント登録
description: RFC 7591 / RFC 7592 に沿ってクライアントを動的に登録・管理・削除する。IAT の scope 上限と削除前の上限付き snapshot も説明します。
pageClass: pg-use-cases-dynamic-registration
---

# 使い方 — 動的クライアント登録

## 動的クライアント登録とは

最も素朴な構成では、RP を 1 つ統合するたびに、OP 運用者が `client_id` / `client_secret` / redirect URI / scope などを設定ファイルに手で書き足します。社内アプリ数個なら問題ありませんが、毎週新しい連携が増えるパブリックなエコシステムにはスケールしません。

**動的クライアント登録（DCR）** は、RP が実行時に自分自身を登録できる JSON API です。RP がメタデータを POST すると、OP は新しい `client_id` と認証情報を返します。乱用を防ぐため、登録は **Initial Access Token (IAT)** で受け付け範囲を制限します。IAT は運用者が事前に発行するトークンで、許可するメタデータ・有効期限・single-use などの制約をかけられます。

::: details このページで触れる仕様
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration Protocol
- [RFC 7592](https://datatracker.ietf.org/doc/html/rfc7592) — Dynamic Client Registration Management（読取 / 更新 / 削除）
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — Authorization Server Metadata（discovery）
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps（後述のループバックリダイレクト規定）
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2（`auth_time` / `acr` / `default_max_age`）
:::

::: details 用語の補足
- **Initial Access Token (IAT)** — 運用者が仕様外の経路で発行する短寿命の Bearer トークン。OP は IAT 無しの `POST /register` を拒否します。任意の匿名呼び出しからクライアント生成を防ぐためです。
- **Registration Access Token (RAT)** — 登録成功時の 201 応答に新しい `client_id` と一緒に含まれます。RP は `registration_client_uri` に対して RAT を使って RFC 7592 の読み取り / 更新 / 削除を実行します。
:::

> **ソース:** [`examples/41-dynamic-registration`](https://github.com/libraz/go-oidc-provider/tree/main/examples/41-dynamic-registration)

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">Initial Access Token から自己管理までの流れ</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-dcr-title" viewBox="0 0 960 546" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dcr-title">運用者が Initial Access Token を発行し、out-of-band で新規 RP に渡します。RP はそれを使って登録し、registration access token を受け取り、以降は自分の登録内容の読み取り・更新・削除に使います。</title>
    <rect class="fg-group" x="30" y="70" width="916" height="118" rx="8"/>
    <rect class="fg-group" x="30" y="196" width="916" height="150" rx="8"/>
    <rect class="fg-group" x="30" y="354" width="916" height="180" rx="8"/>
    <text class="fg-lbl" x="42" y="88">1 · 運用者が initial access token を渡す</text>
    <text class="fg-lbl" x="42" y="214">2 · RP が自分を登録する</text>
    <text class="fg-lbl" x="42" y="372">3 · RP が自分の登録を管理する（RFC 7592）</text>
    <line class="fg-life" x1="150" y1="62" x2="150" y2="534"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="534"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="534"/>
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">運用者</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">OP を運用する側</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="740" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">新規 RP</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">まだ未登録</text>
    <circle class="fg-badge" cx="15" cy="112" r="8.5"/>
    <text class="fg-badge-t" x="15" y="115" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,112 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="106" text-anchor="middle">IssueInitialAccessToken(ctx, spec)</text>
    <circle class="fg-badge" cx="15" cy="144" r="8.5"/>
    <text class="fg-badge-t" x="15" y="147" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,144 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="138" text-anchor="middle">&lt;iat&gt;</text>
    <circle class="fg-badge" cx="15" cy="178" r="8.5"/>
    <text class="fg-badge-t" x="15" y="181" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--muted" d="M150,178 H830" marker-end="url(#fg-am)"/>
    <text class="fg-xs fg-halo" x="490" y="172" text-anchor="middle">out-of-band で受け渡す — メールでも issue でも、既に信頼している経路で</text>
    <circle class="fg-badge" cx="15" cy="262" r="8.5"/>
    <text class="fg-badge-t" x="15" y="265" text-anchor="middle">4</text>
    <path class="fg-edge" d="M830,262 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="230" text-anchor="middle">POST /register</text>
    <text class="fg-mxs" x="665" y="244" text-anchor="middle">Authorization: Bearer &lt;iat&gt;</text>
    <text class="fg-mxs" x="665" y="256" text-anchor="middle">{ redirect_uris, …, client_name }</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="326" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="329" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--accent" d="M500,326 H830" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="665" y="294" text-anchor="middle">201 · { client_id, client_secret?,</text>
    <text class="fg-mxs" x="665" y="308" text-anchor="middle">registration_access_token,</text>
    <text class="fg-mxs" x="665" y="320" text-anchor="middle">registration_client_uri, … }</text>
    <circle class="fg-badge" cx="15" cy="408" r="8.5"/>
    <text class="fg-badge-t" x="15" y="411" text-anchor="middle">6</text>
    <path class="fg-edge" d="M830,408 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="390" text-anchor="middle">GET /register/&lt;client_id&gt;</text>
    <text class="fg-mxs" x="665" y="402" text-anchor="middle">Authorization: Bearer &lt;rat&gt;</text>
    <circle class="fg-badge" cx="15" cy="438" r="8.5"/>
    <text class="fg-badge-t" x="15" y="441" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M500,438 H830" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="665" y="432" text-anchor="middle">200 · クライアントメタデータ全体</text>
    <circle class="fg-badge" cx="15" cy="470" r="8.5"/>
    <text class="fg-badge-t" x="15" y="473" text-anchor="middle">8</text>
    <path class="fg-edge" d="M830,470 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="464" text-anchor="middle">PUT /register/&lt;client_id&gt; → 200 更新済み</text>
    <circle class="fg-badge" cx="15" cy="502" r="8.5"/>
    <text class="fg-badge-t" x="15" y="505" text-anchor="middle">9</text>
    <path class="fg-edge" d="M830,502 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="496" text-anchor="middle">DELETE /register/&lt;client_id&gt;</text>
    <circle class="fg-badge" cx="15" cy="530" r="8.5"/>
    <text class="fg-badge-t" x="15" y="533" text-anchor="middle">10</text>
    <path class="fg-edge fg-edge--accent" d="M500,530 H830" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="665" y="524" text-anchor="middle">204 · 本文なし</text>
  </svg>
  <figcaption class="fig-note">仕様が何も定めていないのは手順 3 だけで、信頼の出どころは実はそこにあります。それ以降はすべて、そのクライアントだけが持つトークンによって 1 クライアントに限定されています。</figcaption>
</figure>

## 設定

```go
import (
  "github.com/libraz/go-oidc-provider/op"
)

provider, err := op.New(
  /* 必須オプション */
  op.WithDynamicRegistration(op.RegistrationOption{
    AllowedGrantTypes:    []string{"authorization_code", "refresh_token"},
    AllowedResponseTypes: []string{"code"},
  }),
)

// IAT を運用で発行。RP には仕様外の経路で渡す。
iat, err := provider.IssueInitialAccessToken(ctx, op.InitialAccessTokenSpec{
  TTL:     24 * time.Hour,
  MaxUses: 1,
})
```

`op.WithDynamicRegistration` は暗黙のうちに `feature.DynamicRegistration` を有効化し、`/register` をマウントして、discovery 文書に `registration_endpoint` を出力します。`op.WithFeature(feature.DynamicRegistration)` も同時に渡す必要はありません。重複指定は、登録ポリシーの所有箇所が曖昧にならないようコンストラクタで拒否されます。

## オープン登録と既定 scope

`RegistrationOption.Open` を `true` にすると、OP は Initial Access Token なしで `POST /register` を受け付けます — ネットワーク到達できる任意の呼び出し元がクライアントを生成できます。本ライブラリはこの帰結を、**`scope` 省略時は空の scope セットで永続化** することで狭めています。そのクライアントは登録を更新するまで `/authorize` でいかなる scope も要求できません。

```go
op.WithDynamicRegistration(op.RegistrationOption{
  Open:                          true,
  AllowedGrantTypes:             []string{"authorization_code", "refresh_token"},
  AllowedResponseTypes:          []string{"code"},
  OpenRegistrationDefaultScopes: []string{"openid"}, // scope 省略時の基準
})
```

`OpenRegistrationDefaultScopes` は明示的に設定した場合だけ有効です。各エントリは OP の scope カタログに登録済みでなければなりません（組み込みの OIDC 標準 scope 6 つに加えて `WithScope(...)` で追加したものを含む）。未知の値は `op.New` で拒否されます。IAT 経由の経路はこれまでどおりで、Initial Access Token を提示した場合は引き続き `store.InitialAccessToken.AllowedScopes` が優先されます。

::: warning オープン登録の scope 既定は空です
`scope` を省略したオープンな POST には、組み込み側が `OpenRegistrationDefaultScopes` を設定しない限り既定 scope は付きません。登録直後のクライアントに `openid` などの基準 scope を要求させたい場合は、このオプションを明示してください。
:::

## scope の上限と POST / PUT の違い

2 つの HTTP method は、メンバーの省略を意図的に異なる方法で扱います。`POST /register` で `scope` を省略すると、登録経路の既定値が選ばれます。

- 空でない `InitialAccessToken.AllowedScopes` があれば、それが優先されます
- オープン登録では `OpenRegistrationDefaultScopes`（既定は空）が使われます
- IAT 経由で上限が無い場合は、特定クライアントに制限された scope を除く OP の public scope カタログが既定値になります

明示した scope は、OP のカタログと、設定されていれば IAT の許可リストの両方に対して検証されます。

クライアント作成時、Registration Access Token (RAT) は、そのクライアントを作った IAT の `AllowedScopes` 上限を引き継ぎます。この上限は `store.RegistrationAccessToken.AllowedScopes` に保存され、RAT のローテーションを経ても変わらず、後続の `PUT /register/{client_id}` にも適用されます。管理更新でクライアントの scope を狭めることはできますが、元の IAT 上限を超えて広げることはできません。このフィールドが無かった時期に保存された RAT は上限が空なので、従来どおり制限なしです。現在の SQL アダプタを使う前に `oidc_registration_access_tokens.allowed_scopes` を追加してください（[SQL の migration](/ja/use-cases/sql-store#sql-migration-before-first-request)を参照）。

`PUT /register/{client_id}` で `scope` を省略すると、メンバーを削除する指定になり、保存済み scope セットは空になります。残したい scope は RP が更新リクエストに明示しなければなりません。これは新規 POST の省略時とは異なります。その他のメタデータも RFC 7592 の更新規則に従い、任意フィールドは省略時に消去され、一部のプロファイルフィールドは OP の既定値に戻ります。

## 認証コンテキスト系のクライアントメタデータ

`/authorize` の既定値と発行 `id_token` の `auth_time` を制御するメタデータが 3 つあります。DCR 登録（RFC 7591）でも `op.ClientSeed` の静的シードでも受理され、リクエスト時に OP 側で強制されます。

| フィールド | 効果 | 仕様 |
|---|---|---|
| `default_max_age`（nullable な整数） | リクエストが `max_age` を省略した場合の既定値として適用されます。フィールドは保存から応答まで nullable のままなので、「未指定」と「明示的な `0`（再認証必須）」が通信路上でもストア上でも区別され続けます。 | OIDC Core 1.0 §2 / Dynamic Client Registration §2 |
| `default_acr_values` | リクエストが `acr_values` を省略した場合の既定値として適用されます。`op.WithACRPolicy`（[MFA / ステップアップ](/ja/use-cases/mfa-step-up)）と組み合わせて AAL 階層へマップします。 | OIDC Core 1.0 §2 / Dynamic Client Registration §2 |
| `require_auth_time` | `true` のとき、発行される `id_token` には必ず `auth_time` が乗らなければなりません。OP が元の認証時刻を復元できない場合、値を捏造する代わりに `server_error` でトークン発行を失敗させます。 | OIDC Core 1.0 §2 |

::: tip なぜ `auth_time` 不在で server_error なのか
`require_auth_time` の違反は実運用ではめったに起こりません — OP がログインフローを自前で実行している限り `auth_time` は記録されます。捏造（例: `iat` で代替）してしまうと、ステップアップ保証を `auth_time` で監査している RP を気付かれずに壊してしまいます。構築時の拒否によって、欠落の原因が発生した地点で問題が表面化します。
:::

## 譲れないセキュリティの最低ライン

::: warning Loopback の `redirect_uris` と DNS rebinding
`application_type` の既定は `web` です。Web クライアントが `http` の `redirect_uri` を登録できるのは host が **IP リテラル** `127.0.0.1` または `[::1]` のときだけで、文字列 `localhost` は既定で拒否します — RFC 8252 §8.3 の DNS-rebinding 窓を閉じるためです。`localhost` を正当に使う Web クライアントは `op.WithAllowLocalhostLoopback()` を明示します。安全側の既定からの逸脱が設定箇所に見える設計です。

ネイティブクライアント（`application_type=native`）は OIDC Registration §2 に従い、3 種類の loopback host（`127.0.0.1` / `[::1]` / `localhost`）すべてを `http` で無条件に受け付けます。さらに claimed `https`、および RFC 8252 §7.1 の reverse-DNS custom URI scheme（例: `com.example.app:/callback`）も登録できます。`.` を含まない custom scheme はアプリ間で衝突しやすいため拒否します。

```jsonc
// NG: web client の http://localhost は既定で拒否
{
  "application_type": "web",
  "redirect_uris": ["http://localhost:5173/callback"]
}

// OK: web client の loopback 開発は IP リテラルを使う
{
  "application_type": "web",
  "redirect_uris": ["http://127.0.0.1:5173/callback"]
}

// OK: native client では localhost loopback も許容される
{
  "application_type": "native",
  "redirect_uris": ["http://localhost:49152/callback"]
}
```
:::

## 標準メタデータの扱い

パーサは RFC 7591 §2 の寛容な扱いに従います。本 OP がモデル化していない標準メンバーや未知の vendor メンバーは無視し、登録レスポンスにも返しません。たとえば `frontchannel_logout_uri`、`software_id`、`software_version`、`backchannel_token_delivery_mode`、`backchannel_client_notification_endpoint`、`backchannel_authentication_request_signing_alg`、`backchannel_user_code_parameter`、`authorization_details_types` は、この DCR エンドポイントを設定しません。`tls_client_certificate_bound_access_tokens: false` は互換性のための例外で、no-op として受理しますが、保存もレスポンスへの反映も行いません。

ただし、OP が提供できないセキュリティ特性や通信路上の形を要求するメンバーまで無視するわけではありません。そのような要求は `invalid_client_metadata` で拒否します。対象には `tls_client_certificate_bound_access_tokens: true`、`dpop_bound_access_tokens: true`、`require_pushed_authorization_requests: true`、対象の応答面が出力しない署名アルゴリズム、そして URI の有無にかかわらない `backchannel_logout_session_required: true` が含まれます。`software_statement` は別の明示的な拒否です。RFC 7591 の trust chain 検証を実装していないため、このフィールドを含むリクエストは黙って無視せず `invalid_software_statement` を返します。

## 登録時に強制している内容

DCR の対応状況は `full` ではなく `partial` と表記していますが、この `partial` は意図的な設計判断を表しているのであって、未着手の TODO ではありません。バリデータは `POST /register` と `PUT /register/{client_id}` のいずれでも、以下に違反するメタデータを拒否します:

- `application_type` ごとの `redirect_uris` 形（上のワーニングを参照）。fragment 無し、絶対 URL のみ。
- `grant_types` と `response_types` を OIDC Core §3 / OIDC Registration §2 の組み合わせ表に対してクロスチェック。整合しない組は `invalid_client_metadata` で拒否し、黙って自動修正することはありません。
- `jwks` と `jwks_uri` は同時指定不可。URI 系メタデータ（`client_uri`、`logo_uri`、`policy_uri`、`tos_uri`、`jwks_uri`、`sector_identifier_uri`、`initiate_login_uri`）は絶対 URI、`https`、fragment 無しを要求。userinfo セグメント(`https://user:pass@host/...`)は拒否します。**例外:** `request_uris` は fragment を許容します。OIDC Core §6.2 が request file の base64url SHA-256 ハッシュを fragment として推奨しており、cache が内容変更を検出できるようにするためです。それ以外の形ルール（絶対 URI、`https`、host 必須、userinfo 不可）は通常通り適用されます。
- `backchannel_logout_uri` は `https` 必須、fragment / userinfo 不可、host 必須。`backchannel_logout_session_required=true` は、URI が正しく指定されていても `invalid_client_metadata` で拒否します。この OP は `sid` を安全に配送するための RP ごとの session 系譜を保存できないためです。
- `sector_identifier_uri` は登録時に GET で取得し、応答 JSON 配列に登録する `redirect_uri` がすべて含まれることを検証（OIDC Core §8.1）。取得は 5 秒のタイムアウトと 64 KiB の body サイズ上限で制限し、取得失敗または包含未達はいずれも `invalid_client_metadata`。
- `subject_type=pairwise` で `sector_identifier_uri` が無い場合、`redirect_uri` の host はすべて同一でなければなりません。
- `request_object_signing_alg` は `RS256` / `PS256` / `ES256` / `EdDSA` に限定されます。

URI 系メタデータの典型的な境界は次の形です。

```jsonc
// NG: jwks と jwks_uri の同時指定、userinfo、fragment は拒否
{
  "jwks": { "keys": [] },
  "jwks_uri": "https://client.example.com/jwks.json",
  "client_uri": "https://user:pass@client.example.com/app",
  "policy_uri": "https://client.example.com/policy#v1"
}

// OK: URI 系メタデータは https 絶対 URI、fragment / userinfo 無し
{
  "jwks_uri": "https://client.example.com/jwks.json",
  "client_uri": "https://client.example.com/app",
  "policy_uri": "https://client.example.com/policy"
}

// OK: request_uris だけは request file hash の fragment を許容
{
  "request_uris": [
    "https://client.example.com/request.jwt#sha256-abc123"
  ]
}
```

## 意図的な制約

`full` を名乗らない残差は、設計判断であって積み残しではありません。判断の根拠は [設計判断](/ja/security/design-judgments) ページに別エントリとして残しています — `client_secret` の非開示（[#dj-20](/ja/security/design-judgments#dj-20)）、PUT 省略のセマンティクス（[#dj-21](/ja/security/design-judgments#dj-21)）、`sector_identifier_uri` の fetch と native loopback ルール（[#dj-22](/ja/security/design-judgments#dj-22)）。

- **`GET /register/{id}` では `client_secret` を再掲しない。** ストアは hash しか保持せず、平文は最初の `POST /register` と、後述する 2 つの PUT ケースだけで応答に乗ります。RFC 7591 §3.2.1 は読み取り応答での `client_secret` を OPTIONAL としているため、省略しても仕様に適合します。
- **PUT の省略は、一部のフィールドを OP の既定値に戻し、残りは消去します。** `grant_types`、`response_types`、`token_endpoint_auth_method`、`application_type`、`subject_type`、`id_token_signed_response_alg` を省略すると、そのフィールドは OP の既定値に戻ります。新規登録時とは異なり、`scope` の省略はクライアントの scope を空にします。任意メタデータ（`client_uri`、`logo_uri`、`policy_uri`、`tos_uri`、…）も空値になります。
- **PUT が `client_secret` を返すのは public client を confidential に変更するときだけです。** confidential client の通常のメタデータ編集では保存済み hash を維持し、secret は返しません。リクエストに `client_secret` を含めた場合は認証済みクライアントの値と照合され、置換値としては扱われません。
- **PUT の body にサーバ管理のフィールドを含めてはならない。** `registration_access_token`、`registration_client_uri`、`client_secret_expires_at`、`client_id_issued_at` を含めると `400 invalid_request`。認証中のクライアントの `client_secret` と一致しない値を送っても `400` になります。
- **`backchannel_logout_uri` は end-to-end でラウンドトリップしますが、session-bound logout は対応しません。** 有効な URI は `POST /register` で永続化され、`GET /register/{client_id}` で返却され、`PUT /register/{client_id}` で上書きできます。`backchannel_logout_session_required: true` は URI の有無にかかわらず不正なメタデータなので、ストレージには入りません。
- **out-of-band の `Resources` は管理更新で保持されます。** RFC 8707 resource-indicator の許可リストは RFC 7591 メタデータ文書ではなく `store.Client.Resources` にあります。PUT 経路は既存クライアントをコピーしてから送信されたメタデータを適用するため、運用者が設定した `Resources` は残り、RP が表現できるフィールドだけが省略規則に従います。
- **`software_statement`（RFC 7591 §2.3）は非対応。** 指定されたリクエストは `invalid_software_statement` で拒否します。federation / trust chain はスコープ外です。

## 読み取り / 更新 / 削除

201 レスポンスは `registration_access_token` と `registration_client_uri` を含みます。RP はこれらを使って RFC 7592 の操作を呼びます:

```sh
# read
curl -H "Authorization: Bearer $RAT" $RCU

# update
curl -X PUT -H "Authorization: Bearer $RAT" -H "Content-Type: application/json" \
  -d '{"client_name":"New Name", ...}' $RCU

# delete
curl -X DELETE -H "Authorization: Bearer $RAT" $RCU
```

### DELETE で保存状態に何が起きるか

OP はクライアントとその RAT を削除し、組み込みの任意拡張 `store.RevokeByClient` があれば、refresh token、grant、保存済みアクセストークンの cascade も実行します。session と interaction は subject をキーにしているため、client をキーにした cascade の対象外です。ライブラリ外のレコードは組み込み側の hook で処理してください。

設定した grant store が `store.GrantSubjectLister` を実装している場合、handler はクライアントの clone と `ListSubjectsByClient` の上限付き 1 ページを、クライアント削除の**前に** snapshot します。grant store が `store.GrantClientLister` も実装していれば、OP は削除前の snapshot から back-channel coordinator を組み立て、Logout Token を送れます。削除後に URI を参照するとクライアントが見つからないため、この順序が必要です。ページには意図的に上限があり、store は全 grant をメモリに展開せず `limit+1` でクエリしなければなりません。

自前ストアは、同じ snapshot を `RegistrationOption.OnClientDeletedSnapshot` で受け取れます。

```go
import (
  "context"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/store"
)

provider, err := op.New(
  /* issuer、store、keyset、その他の必須 option */
  op.WithDynamicRegistration(op.RegistrationOption{
    OnClientDeletedSnapshot: func(ctx context.Context, client *store.Client, subjects []string) error {
      // アプリケーション所有レコードを失効させる、または独自の logout 通知を送る。
      return nil
    },
  }),
)
_ = provider
_ = err
```

従来の `OnClientDeleted` hook も client ID だけを使う cascade 用に残っています。hook のエラーは削除後にログへ記録され、成功した `204` レスポンスは変えません。自前の cleanup は再試行でき、監視できるようにしてください。

## 採用すべきとき

DCR が活きるのは:

- 各テナントが自分の RP を持ち込み、設定変更の段階公開を避けたい multi-tenant SaaS。
- チームが自分でクライアントクレデンシャルを取得できる内部 developer platform。

DCR が過剰で、不要な攻撃面になりやすいのは:

- RP が 10 個、全部内部、全部既知のケース。`op.WithStaticClients(...)` の方がシンプルで可動部品も少なくて済みます。
