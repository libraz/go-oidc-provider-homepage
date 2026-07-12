---
title: 動的クライアント登録
description: RP がランタイムに自身を登録できるようにする — RFC 7591 / RFC 7592。
---

# 使い方 — 動的クライアント登録

## 動的クライアント登録とは

最も素朴な構成では、RP を 1 つ統合するたびに、OP 運用者が `client_id` / `client_secret` / redirect URI / scope などを 設定 に手で書き足します。社内アプリ数個なら問題ありませんが、毎週新しい連携が増えるパブリックなエコシステムにはスケールしません。

**動的クライアント登録 (DCR)** は、RP が実行時に自分自身を登録できる JSON API です。RP がメタデータを POST すると、OP は新しい `client_id` と認証情報を返します。乱用を防ぐため、登録は **Initial Access Token (IAT)** で受け付け範囲を制限します。IAT は運用者が事前に発行するトークンで、許可するメタデータ・有効期限・single-use などの制約をかけられます。

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

<svg class="dcr-flow" role="img" aria-labelledby="dcr-seq-title" viewBox="0 0 800 596" style="display:block;width:100%;max-width:760px;height:auto;margin:1.5rem auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="dcr-seq-title">動的クライアント登録のシーケンス: 運用者が Initial Access Token を発行し仕様外の経路で新規 RP に渡すと、RP は POST /register で登録し、RFC 7592 で登録内容を読み取り・更新・削除する。</title>
  <line x1="130" y1="64" x2="130" y2="581" class="d-life"/>
  <line x1="420" y1="64" x2="420" y2="581" class="d-life-op"/>
  <line x1="710" y1="64" x2="710" y2="581" class="d-life"/>
  <rect x="55" y="20" width="150" height="44" rx="6" class="d-box"/>
  <text x="130" y="47" text-anchor="middle" class="d-name">運用者</text>
  <rect x="345" y="20" width="150" height="44" rx="6" class="d-box op-accent"/>
  <text x="420" y="47" text-anchor="middle" class="d-name d-accent-fill">OP</text>
  <rect x="635" y="20" width="150" height="44" rx="6" class="d-box"/>
  <text x="710" y="47" text-anchor="middle" class="d-name">新規 RP</text>
  <line x1="138" y1="105" x2="418" y2="105" class="d-msg"/>
  <polyline points="411,101 418,105 411,109" class="d-msg"/>
  <text x="275" y="97" text-anchor="middle" class="d-mono">IssueInitialAccessToken(ctx, spec)</text>
  <line x1="412" y1="142" x2="132" y2="142" class="d-msg"/>
  <polyline points="139,138 132,142 139,146" class="d-msg"/>
  <text x="275" y="134" text-anchor="middle" class="d-mono">&lt;iat&gt;</text>
  <line x1="138" y1="179" x2="708" y2="179" class="d-msg-oob"/>
  <polyline points="701,175 708,179 701,183" class="d-msg"/>
  <text x="420" y="171" text-anchor="middle" class="d-lbl">仕様外の経路で受け渡し <tspan class="d-mono">&lt;iat&gt;</tspan></text>
  <line x1="702" y1="246" x2="422" y2="246" class="d-msg"/>
  <polyline points="429,242 422,246 429,250" class="d-msg"/>
  <text x="565" y="208" text-anchor="middle" class="d-mono">POST /register</text>
  <text x="565" y="223" text-anchor="middle" class="d-mono">Authorization: Bearer &lt;iat&gt;</text>
  <text x="565" y="238" text-anchor="middle" class="d-mono">{ redirect_uris, …, client_name }</text>
  <line x1="428" y1="328" x2="708" y2="328" class="d-msg"/>
  <polyline points="701,324 708,328 701,332" class="d-msg"/>
  <text x="565" y="275" text-anchor="middle" class="d-mono">201</text>
  <text x="565" y="290" text-anchor="middle" class="d-mono">{ client_id, client_secret?,</text>
  <text x="565" y="305" text-anchor="middle" class="d-mono">registration_access_token,</text>
  <text x="565" y="320" text-anchor="middle" class="d-mono">registration_client_uri, … }</text>
  <line x1="702" y1="380" x2="422" y2="380" class="d-msg"/>
  <polyline points="429,376 422,380 429,384" class="d-msg"/>
  <text x="565" y="357" text-anchor="middle" class="d-mono">GET /register/&lt;client_id&gt;</text>
  <text x="565" y="372" text-anchor="middle" class="d-mono">Authorization: Bearer &lt;rat&gt;</text>
  <line x1="428" y1="417" x2="708" y2="417" class="d-msg"/>
  <polyline points="701,413 708,417 701,421" class="d-msg"/>
  <text x="565" y="409" text-anchor="middle" class="d-lbl"><tspan class="d-mono">200</tspan> クライアントメタデータ全体</text>
  <line x1="702" y1="454" x2="422" y2="454" class="d-msg"/>
  <polyline points="429,450 422,454 429,458" class="d-msg"/>
  <text x="565" y="446" text-anchor="middle" class="d-mono">PUT /register/&lt;client_id&gt; …</text>
  <line x1="428" y1="491" x2="708" y2="491" class="d-msg"/>
  <polyline points="701,487 708,491 701,495" class="d-msg"/>
  <text x="565" y="483" text-anchor="middle" class="d-lbl"><tspan class="d-mono">200</tspan> 更新済みメタデータ</text>
  <line x1="702" y1="528" x2="422" y2="528" class="d-msg"/>
  <polyline points="429,524 422,528 429,532" class="d-msg"/>
  <text x="565" y="520" text-anchor="middle" class="d-mono">DELETE /register/&lt;client_id&gt;</text>
  <line x1="428" y1="565" x2="708" y2="565" class="d-msg"/>
  <polyline points="701,561 708,565 701,569" class="d-msg"/>
  <text x="565" y="557" text-anchor="middle" class="d-lbl"><tspan class="d-mono">204</tspan> 本文なし</text>
  <circle cx="130" cy="105" r="8" class="d-badge"/><text x="130" y="108.5" text-anchor="middle" class="d-badge-t">1</text>
  <circle cx="420" cy="142" r="8" class="d-badge"/><text x="420" y="145.5" text-anchor="middle" class="d-badge-t">2</text>
  <circle cx="130" cy="179" r="8" class="d-badge"/><text x="130" y="182.5" text-anchor="middle" class="d-badge-t">3</text>
  <circle cx="710" cy="246" r="8" class="d-badge"/><text x="710" y="249.5" text-anchor="middle" class="d-badge-t">4</text>
  <circle cx="420" cy="328" r="8" class="d-badge"/><text x="420" y="331.5" text-anchor="middle" class="d-badge-t">5</text>
  <circle cx="710" cy="380" r="8" class="d-badge"/><text x="710" y="383.5" text-anchor="middle" class="d-badge-t">6</text>
  <circle cx="420" cy="417" r="8" class="d-badge"/><text x="420" y="420.5" text-anchor="middle" class="d-badge-t">7</text>
  <circle cx="710" cy="454" r="8" class="d-badge"/><text x="710" y="457.5" text-anchor="middle" class="d-badge-t">8</text>
  <circle cx="420" cy="491" r="8" class="d-badge"/><text x="420" y="494.5" text-anchor="middle" class="d-badge-t">9</text>
  <circle cx="710" cy="528" r="8" class="d-badge"/><text x="710" y="531.5" text-anchor="middle" class="d-badge-t">10</text>
  <circle cx="420" cy="565" r="8" class="d-badge"/><text x="420" y="568.5" text-anchor="middle" class="d-badge-t">11</text>
</svg>

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

`OpenRegistrationDefaultScopes` は明示的に設定した場合だけ有効です。各エントリは OP の scope カタログに登録済みでなければなりません(組み込みの OIDC 標準 scope 6 つに加えて `WithScope(...)` で追加したものを含む)。未知の値は `op.New` で拒否されます。IAT 経由の登録は変わらず — Initial Access Token を提示した場合は `store.InitialAccessToken.AllowedScopes` が優先します。

::: warning オープン登録の scope 既定は空です
`scope` を省略したオープンな POST には、組み込み側が `OpenRegistrationDefaultScopes` を設定しない限り既定 scope は付きません。登録直後のクライアントに `openid` などの基準 scope を要求させたい場合は、このオプションを明示してください。
:::

## 認証コンテキスト系のクライアントメタデータ

`/authorize` の既定値と発行 `id_token` の `auth_time` を制御するメタデータが 3 つあります。DCR 登録（RFC 7591）でも `op.ClientSeed` の静的シードでも受理され、リクエスト時に OP 側で強制されます。

| フィールド | 効果 | 仕様 |
|---|---|---|
| `default_max_age`（nullable な整数） | リクエストが `max_age` を省略した場合の既定値として適用されます。フィールドは保存から応答まで nullable のままなので、「未指定」と「明示的な `0`（再認証必須）」が通信路上でもストア上でも区別され続けます。 | OIDC Core 1.0 §2 / Dynamic Client Registration §2 |
| `default_acr_values` | リクエストが `acr_values` を省略した場合の既定値として適用されます。`op.WithACRPolicy`（[MFA / ステップアップ](/ja/use-cases/mfa-step-up)）と組み合わせて AAL 階層へマップします。 | OIDC Core 1.0 §2 / Dynamic Client Registration §2 |
| `require_auth_time` | `true` のとき、発行される `id_token` には必ず `auth_time` が乗らなければなりません。OP が元の認証時刻を復元できない場合、値を捏造する代わりに `server_error` でトークン発行を失敗させます。 | OIDC Core 1.0 §2 |

::: tip なぜ `auth_time` 不在で server_error なのか
`require_auth_time` の違反は実運用ではめったに起こりません — OP がログインフローを自前で実行している限り `auth_time` は記録されます。捏造（例: `iat` で代替）してしまうと、ステップアップ保証を `auth_time` で監査している RP を気付かれずに壊してしまいます。構築時に拒否することで、欠落の原因が発生した地点で表面化させます。
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

## 登録時に強制している内容

DCR は完全実装とは表記していませんが、対応しない差分は意図的な設計判断であって TODO ではありません。バリデータは `POST /register` と `PUT /register/{client_id}` のいずれでも、以下に違反するメタデータを拒否します:

- `application_type` ごとの `redirect_uris` 形（上のワーニングを参照）。fragment 無し、絶対 URL のみ。
- `grant_types` と `response_types` を OIDC Core §3 / OIDC Registration §2 の組み合わせ表に対してクロスチェック。整合しない組は `invalid_client_metadata` で拒否し、黙って自動修正することはありません。
- `jwks` と `jwks_uri` は同時指定不可。URI 系メタデータ(`client_uri`、`logo_uri`、`policy_uri`、`tos_uri`、`jwks_uri`、`sector_identifier_uri`、`initiate_login_uri`)は絶対 URI、`https`、fragment 無しを要求。userinfo セグメント(`https://user:pass@host/...`)は拒否します。**例外:** `request_uris` は fragment を許容します。OIDC Core §6.2 が request file の base64url SHA-256 ハッシュを fragment として推奨しており、cache が内容変更を検出できるようにするためです。それ以外の形ルール(絶対 URI、`https`、host 必須、userinfo 不可)は通常通り適用されます。
- `backchannel_logout_uri` は `https` 必須、fragment / userinfo 不可、host 必須。`backchannel_logout_session_required=true` と空の `backchannel_logout_uri` の組み合わせは `invalid_client_metadata` で拒否します — 配送先を持たないクライアントが `sid` 配送を有効化できないようにするためです。
- `sector_identifier_uri` は登録時に GET で取得し、応答 JSON 配列に登録する `redirect_uri` がすべて含まれることを検証(OIDC Core §8.1)。取得は 5 秒のタイムアウトと 64 KiB の body サイズ上限で制限し、取得失敗または包含未達はいずれも `invalid_client_metadata`。
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

- **`GET /register/{id}` では `client_secret` を再掲しない。** ストアは hash しか保持せず、平文は最初の `POST /register` と、後述する 2 つの PUT ケースだけで応答に乗ります。RFC 7591 §3.2.1 は読み取り応答での `client_secret` を OPTIONAL としており、非準拠ではありません。
- **PUT の省略は削除ではなくサーバ既定へのリセット。** `PUT /register/{client_id}` で `grant_types`、`response_types`、`token_endpoint_auth_method`、`application_type`、`subject_type`、`id_token_signed_response_alg` のいずれかを省略すると、そのフィールドは OP の既定値に戻ります。任意メタデータ（`client_uri`、`logo_uri`、`policy_uri`、`tos_uri`、…）は空値になります。
- **PUT が `client_secret` を再掲するのは (a) `none` から confidential への auth method 昇格、(b) 明示的な rotation 要求のいずれか。** 通常のメタデータ編集の応答には平文 secret は含まれません。
- **PUT の body にサーバ管理のフィールドを含めてはならない。** `registration_access_token`、`registration_client_uri`、`client_secret_expires_at`、`client_id_issued_at` を含めると `400 invalid_request`。認証中のクライアントの `client_secret` と一致しない値を送っても `400` になります。
- **`backchannel_logout_uri` と `backchannel_logout_session_required` は end-to-end でラウンドトリップします。** いずれも `POST /register` で永続化され、`GET /register/{client_id}` で返却、`PUT /register/{client_id}` で上書きできます。
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

## 採用すべきとき

DCR が活きるのは:

- 各テナントが自分の RP を持ち込み、設定変更の段階公開を避けたい multi-tenant SaaS。
- チームが自分でクライアントクレデンシャルを取得できる内部 developer platform。

DCR が過剰で、不要な攻撃面になりやすいのは:

- RP が 10 個、全部内部、全部既知のケース。`op.WithStaticClients(...)` の方がシンプルで可動部品も少なくて済みます。
