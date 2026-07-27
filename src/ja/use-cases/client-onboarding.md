---
title: クライアントオンボーディングのパターン
description: RP を OP に登録・更新・削除する 5 つの方法 — 適用場面、コードの差し込み口、本ライブラリが意図的に提供しないもの。
pageClass: pg-use-cases-client-onboarding
---

# 使い方 — クライアントオンボーディングのパターン

「OAuth / OIDC のクライアントを作る」と一口に言っても、運用上の形は 5 通りあり、IETF / OIDF が仕様化しているのはそのうち 1 つだけです。このページはその地図です。各パターンが活きる場面、ライブラリが提供する差し込み口、そして付随するセキュリティの責任範囲を整理します。標準化された経路は [動的クライアント登録](/ja/use-cases/dynamic-registration) のみで、残りの 4 つは運用設計の領域です。「ライブラリの責任」と「組み込み側の責任」の境界は、思っているよりも明確に分かれています。

::: details このページで触れる仕様
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration Protocol
- [RFC 7592](https://datatracker.ietf.org/doc/html/rfc7592) — Dynamic Client Registration Management
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) §10.1（クライアント認証）/ §10.6（CSRF） — セキュリティの枠組み
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps（redirect URI 形式の規定）
:::

## 全体像 — 5 つのパターン

<svg id="onbo-spectrum" role="img" aria-labelledby="onbo-spectrum-title" viewBox="0 0 716 236" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
<title id="onbo-spectrum-title">5 つのクライアントオンボーディングパターンを、運用者が完全に統制する側(静的登録)から通信路上に信頼を置かない側(仕様外の経路を使う CLI)まで信頼スペクトル上に並べた図。中央の 2 つは通信路上の token で認可される。</title>
<g>
<rect class="card" x="14" y="10" width="128" height="162" rx="8"/>
<circle class="badge" cx="34" cy="30" r="11"/>
<text class="lbl" x="34" y="34" text-anchor="middle" font-size="10.5" font-weight="700">1</text>
<text class="lbl" x="24" y="58" font-size="10.5" font-weight="600">静的</text>
<text class="lbl" x="24" y="72" font-size="10.5" font-weight="600">登録</text>
<line class="divider" x1="24" y1="82" x2="132" y2="82"/>
<text class="lbl muted" x="24" y="96" font-size="7" letter-spacing=".1em">信頼の起点</text>
<text class="lbl" x="24" y="110" font-size="9">運用者の</text>
<text class="lbl" x="24" y="123" font-size="9">設定</text>
<rect class="seam" x="24" y="132" width="108" height="20" rx="4"/>
<text class="mono" x="78" y="145" text-anchor="middle" font-size="7.5">WithStaticClients</text>
</g>
<g>
<rect class="card" x="154" y="10" width="128" height="162" rx="8"/>
<circle class="badge" cx="174" cy="30" r="11"/>
<text class="lbl" x="174" y="34" text-anchor="middle" font-size="10.5" font-weight="700">2</text>
<text class="lbl" x="164" y="58" font-size="10.5" font-weight="600">IaC /</text>
<text class="lbl" x="164" y="72" font-size="10.5" font-weight="600">GitOps</text>
<line class="divider" x1="164" y1="82" x2="272" y2="82"/>
<text class="lbl muted" x="164" y="96" font-size="7" letter-spacing=".1em">信頼の起点</text>
<text class="lbl" x="164" y="110" font-size="9">運用者の CI</text>
<text class="lbl" x="164" y="123" font-size="9">パイプライン</text>
<rect class="seam store" x="164" y="132" width="108" height="20" rx="4"/>
<text class="mono" x="218" y="145" text-anchor="middle" font-size="7.5">store.ClientRegistry</text>
</g>
<g>
<rect class="card op-accent" x="294" y="10" width="128" height="162" rx="8"/>
<circle class="badge op-accent" cx="314" cy="30" r="11"/>
<text class="lbl op-fill" x="314" y="34" text-anchor="middle" font-size="10.5" font-weight="700">3</text>
<text class="lbl op-fill" x="304" y="58" font-size="10.5" font-weight="600">標準化</text>
<text class="lbl op-fill" x="304" y="72" font-size="10.5" font-weight="600">DCR</text>
<line class="divider" x1="304" y1="82" x2="412" y2="82"/>
<text class="lbl muted" x="304" y="96" font-size="7" letter-spacing=".1em">信頼の起点</text>
<text class="lbl" x="304" y="110" font-size="9">発行済み IAT</text>
<text class="lbl" x="304" y="123" font-size="9">クライアント別 RAT</text>
<rect class="seam op-accent" x="304" y="132" width="108" height="20" rx="4"/>
<text class="mono op-fill" x="358" y="145" text-anchor="middle" font-size="7.5">/register</text>
</g>
<g>
<rect class="card" x="434" y="10" width="128" height="162" rx="8"/>
<circle class="badge" cx="454" cy="30" r="11"/>
<text class="lbl" x="454" y="34" text-anchor="middle" font-size="10.5" font-weight="700">4</text>
<text class="lbl" x="444" y="58" font-size="10.5" font-weight="600">scope 保護の</text>
<text class="lbl" x="444" y="72" font-size="10.5" font-weight="600">管理 API</text>
<line class="divider" x1="444" y1="82" x2="552" y2="82"/>
<text class="lbl muted" x="444" y="96" font-size="7" letter-spacing=".1em">信頼の起点</text>
<text class="lbl" x="444" y="110" font-size="9">管理用 AT</text>
<text class="lbl" x="444" y="123" font-size="9">(scope + claim)</text>
<rect class="seam store" x="444" y="132" width="108" height="20" rx="4"/>
<text class="mono" x="498" y="145" text-anchor="middle" font-size="7.5">store.ClientRegistry</text>
</g>
<g>
<rect class="card" x="574" y="10" width="128" height="162" rx="8"/>
<circle class="badge" cx="594" cy="30" r="11"/>
<text class="lbl" x="594" y="34" text-anchor="middle" font-size="10.5" font-weight="700">5</text>
<text class="lbl" x="584" y="58" font-size="10.5" font-weight="600">仕様外経路</text>
<text class="lbl" x="584" y="72" font-size="10.5" font-weight="600">CLI</text>
<line class="divider" x1="584" y1="82" x2="692" y2="82"/>
<text class="lbl muted" x="584" y="96" font-size="7" letter-spacing=".1em">信頼の起点</text>
<text class="lbl" x="584" y="110" font-size="9">通信路上に</text>
<text class="lbl" x="584" y="123" font-size="9">認証なし</text>
<rect class="seam store" x="584" y="132" width="108" height="20" rx="4"/>
<text class="mono" x="638" y="145" text-anchor="middle" font-size="7.5">RegisterClient</text>
</g>
<line class="hair" x1="78" y1="172" x2="78" y2="194"/>
<line class="hair" x1="218" y1="172" x2="218" y2="194"/>
<line class="hair" x1="358" y1="172" x2="358" y2="194"/>
<line class="hair" x1="498" y1="172" x2="498" y2="194"/>
<line class="hair" x1="638" y1="172" x2="638" y2="194"/>
<line class="axis" x1="24" y1="194" x2="692" y2="194"/>
<path class="axis" d="M32 189 L24 194 L32 199"/>
<path class="axis" d="M684 189 L692 194 L684 199"/>
<line class="band" x1="358" y1="194" x2="498" y2="194"/>
<text class="lbl muted" x="24" y="212" font-size="8.5">運用者が</text>
<text class="lbl muted" x="24" y="224" font-size="8.5">完全に統制</text>
<text class="lbl muted" x="692" y="212" text-anchor="end" font-size="8.5">通信路上に</text>
<text class="lbl muted" x="692" y="224" text-anchor="end" font-size="8.5">信頼なし</text>
<text class="lbl muted" x="428" y="214" text-anchor="middle" font-size="8.5">信頼は通信路上の token</text>
</svg>

| パターン | 信頼の起点 | メタデータ を書く主体 | 向いている場面 |
|---|---|---|---|
| 静的登録 | 運用者の設定 | 配備時に運用者 | 内部アプリの固定的な一覧 |
| IaC / GitOps プロビジョニング | 運用者の CI パイプライン | パイプラインが `store.ClientRegistry` 経由で書く | RP 定義をソース管理に置く構成 |
| 標準化された DCR (RFC 7591 + 7592) | 運用者発行の IAT、クライアント単位の RAT | RP 自身が `/register` で登録 | マルチテナント SaaS、開発者セルフサービス |
| scope で保護した管理 API | 管理用クライアントの AT（scope と claim で境界を定義） | 組み込み側の HTTP ハンドラ → `store.ClientRegistry` | 中央コントロールプレーン / IDM GUI |
| 仕様外の経路を使う CLI / 管理ツール | 仕様外の認証（通信路上には認証なし） | 管理用バイナリがストアを直接書く | SRE のバッチ取り込み、リカバリ |

標準仕様だけを追うのであれば 3 行目で読むのを止めて構いません。4 行目と 5 行目は運用設計の領域です — 本ライブラリは差し込み口（store API）は公開しますが、その上に乗るエンドポイント自体は提供しません。セキュリティの責任範囲がアプリケーションごとに異なるためです。

## 1. 静的登録

最もシンプルな形で、多くの組み込み側がここから始めます。`op.WithStaticClients` は `op.ClientSeed` ビルダーの可変長リストを受け取り、各ビルダーは構築時に `store.Client` レコードへ射影されます。レコードは `Source: ClientSourceStatic` で固定されるので、ファーストパーティ自動同意の対象になります。

```go
pubJWKS, err := op.LoadPublicJWKS("conformance/keys/fapi-client.jwks.json")
if err != nil { /* ... */ }

provider, err := op.New(
  /* 必須オプション */
  op.WithStaticClients(
    op.ConfidentialClient{
      ID:           "billing-app",
      Secret:       "rotate-me",
      AuthMethod:   op.AuthClientSecretBasic,
      RedirectURIs: []string{"https://billing.example.com/callback"},
      Scopes:       []string{"openid", "profile"},
      GrantTypes:   []string{"authorization_code", "refresh_token"},
    },
    op.PublicClient{
      ID:           "billing-spa",
      RedirectURIs: []string{"https://app.example.com/callback"},
      Scopes:       []string{"openid", "profile"},
    },
    op.PrivateKeyJWTClient{
      ID:           "fapi-rp",
      JWKS:         pubJWKS,
      RedirectURIs: []string{"https://rp.example.com/callback"},
      Scopes:       []string{"openid"},
    },
  ),
)
```

シードの射影は、DCR が `POST /register` の段階で適用しているのと同じ redirect URI 形式のルールを `op.New` の時点で適用します。形式に違反するシードは構築時に失敗するので、ランタイムまで漏れ出すことはありません。`ConfidentialClient.Secret` は `op.HashClientSecret`（argon2id）でハッシュしてからストアに到達するため、平文がストアに永続化されることはありません。

永続バックエンドが相手の場合、シードは `store.StaticClientReconciler` を通じて**ひとつの原子的かつ冪等なバッチ**として適用されます。存在しないレコードは挿入し、内容が同じレコードはそのままにし、保存済みレコードと食い違う場合や動的登録されたクライアントと衝突する場合は `ErrConflict` で失敗します。この突き合わせは他のすべての失敗しうる構築処理の後に走るため、無関係な理由で起動が失敗したときにロスタの一部だけが書き込まれることはありません。シードを変えずに OP を再起動するのは、書き直しではなく no-op になります。

このパターンが向くのは、RP の数が少なく、OP と同じチームが運用していて、変更が他の 設定 と同じ配備パイプラインを通る構成です。

## 2. IaC / GitOps プロビジョニング

RP の一覧をソース管理（Terraform / Pulumi モジュール、Kustomize 上書き、Helm の values ファイルなど）に置くなら、マニフェストを読んで OP のストアを直接書くプロビジョニングバイナリが向いています。本ライブラリは `store.ClientRegistry` で書き込み口を公開しており、DCR をサポートするバックエンドはこのインターフェースを満たします。

```go
storage, err := oidcsql.New(db, oidcsql.Postgres())
if err != nil { /* ... */ }

registry, ok := storage.Clients().(store.ClientRegistry)
if !ok {
  return fmt.Errorf("backend does not support client writes")
}

for _, plan := range desired {
  hash, err := op.HashClientSecret(plan.Secret)
  if err != nil { /* ... */ }
  c := &store.Client{
    ID:                      plan.ID,
    RedirectURIs:            plan.RedirectURIs,
    Scopes:                  plan.Scopes,
    GrantTypes:              plan.GrantTypes,
    ResponseTypes:           []string{"code"},
    TokenEndpointAuthMethod: op.AuthClientSecretBasic.String(),
    SecretHash:              hash,
    Source:                  store.ClientSourceAdmin,
  }
  if err := registry.RegisterClient(ctx, c); errors.Is(err, store.ErrAlreadyExists) {
    err = registry.UpdateClient(ctx, c)
  }
  if err != nil { /* ... */ }
}
```

ここでの区別子としては `store.ClientSourceAdmin` が適切です。ファーストパーティ自動同意の対象という観点では `ClientSourceStatic` と同じ扱いになりつつ、OP 自身が `/register` 経由で作成したレコードと監査ログ解析で識別できます。形式のバリデーションはプロビジョニングバイナリ側の責任です。`RegisterClient` は単にストアへ書き込むだけで、登録ハンドラ側のルールセットは実行されません。OP プロセスがクライアント情報の in-memory キャッシュを保持するなら、無効化の手段（SIGHUP によるリロード、バイナリから呼び出す管理エンドポイント、バックエンドが提供する TTL 失効など）を用意します。

マニフェスト内のクレデンシャル素材は、他の配備時クレデンシャルと同じ扱いです — 暗号化された state、CI プリンシパルの最小権限、CI ログへの echo 禁止。

## 3. 標準化された DCR (RFC 7591 + 7592)

RP が組織境界の向こう側にいる場合 — マルチテナント SaaS のテナント、連携マーケットプレイスのパートナー、プラットフォームに登録する開発者 — RP が自分で呼び出せる JSON API が必要になります。このエンドポイント仕様を定義しているのが RFC 7591 / RFC 7592 で、`op.WithDynamicRegistration` がそれをマウントします。

```go
provider, err := op.New(
  /* 必須オプション */
  op.WithDynamicRegistration(op.RegistrationOption{
    AllowedGrantTypes:    []string{"authorization_code", "refresh_token"},
    AllowedResponseTypes: []string{"code"},
  }),
)

iat, err := provider.IssueInitialAccessToken(ctx, op.InitialAccessTokenSpec{
  TTL:     1 * time.Hour,
  MaxUses: 1,
})
```

`iat.Value` は 仕様外の経路で RP に渡します。TTL は短く、`MaxUses: 1` を維持してください。IAT が漏洩してもリプレイされないようにするためです。RP は 201 応答で `registration_access_token`（RAT）を受け取り、自分の登録に対する RFC 7592 の read / update / delete だけに使います。RFC 7592 §2 はクライアント A の RAT がクライアント B の操作を承認してはならないことを明示しています。詳細（バリデータが適用するセキュリティ最低ラインや、往復するメタデータ項目）は [動的クライアント登録](/ja/use-cases/dynamic-registration) を参照してください。

## 4. scope で保護した管理 API

これは vendor SaaS 系のプロバイダが「管理 API」として同梱していることが多いパターンで、本ライブラリが意図的に同梱していないパターンでもあります。形は決まっています。特権を持つ「管理用クライアント」が `client.read` / `client.write` のような scope（必要なら `tenant=acme` のような claim も）を持つアクセストークンを取得します。組み込み側が用意した HTTP ハンドラがその AT を検証して scope と tenant 境界を解釈し、最終的に `store.ClientRegistry` を呼び出します。

```go
// 1. 管理用クライアントの静的シード。
op.WithStaticClients(
  op.ConfidentialClient{
    ID:         "control-plane",
    Secret:     "rotate-me",
    AuthMethod: op.AuthClientSecretBasic,
    GrantTypes: []string{"client_credentials"},
    Scopes:     []string{"client.read", "client.write"},
  },
)

// 2. 組み込み側が所有する管理ハンドラ（スケッチ）。
func adminCreateClient(registry store.ClientRegistry) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
    intro, err := postIntrospect(r.Context(), bearer) // /introspect への HTTP 呼び出し
    if err != nil || !intro.Active || !hasScope(intro.Scope, "client.write") {
      http.Error(w, "forbidden", http.StatusForbidden)
      return
    }
    var c store.Client
    if err := json.NewDecoder(r.Body).Decode(&c); err != nil { /* 400 */ }
    if err := embedderValidate(&c, intro); err != nil { /* 400 */ } // 後述の警告を参照
    c.Source = store.ClientSourceAdmin
    if err := registry.RegisterClient(r.Context(), &c); err != nil { /* エラーマップ */ }
    // 監査イベントはここで発行 — このパスでは AuditDCR* 系は発火しません。
    w.WriteHeader(http.StatusCreated)
  }
}
```

このハンドラ自体を本ライブラリがマウントすることはありません。公開 OP ホストに置くか、別の管理ホストに置くか、クラスタ内ネットワークだけに閉じるかは配備上の選択であり、いずれもセキュリティ境界そのものではありません。境界は、ストアに触れる前にハンドラが検証するアクセストークンです。したがって、以下のルールを強制する責任は組み込み側が負うことになります。

::: warning パターン 4 のセキュリティ責任範囲
- **管理 AT の漏洩 = scope 内のすべてのクライアントの乗っ取り**。AT の TTL を短く保ち、管理用クライアントには送信者制約（DPoP または mTLS）を必須にして、Bearer 値が盗まれてもホスト外でリプレイできないようにします。
- **権限昇格ガード**。呼び出し側 AT 自身が持っていない grant type / scope / FAPI 機能を持つクライアントを生成・昇格するメタデータは、ハンドラが必ず拒否しなければなりません。`store.ClientRegistry` はハンドラ層を介さない単純な書き込みであり、このチェックは行いません。このチェックを省くのが、この種の API が CVE 級の脆弱性を抱える典型的な経路です。
- **テナント境界**。マルチテナントを持つ場合、境界は呼び出し側 AT の tenant claim をハンドラが読み、読み取りをフィルタし、書き込み範囲をテナントに絞ることでのみ成立します。本ライブラリにテナントの概念はありません。
- **監査ログ**。すべての CRUD 操作を、呼び出し側の `client_id` と対象の `client_id` を添えて記録します。本ライブラリの `op.AuditDCR*` イベントは `/register`（OP 自身が所有するパス）でしか発火しません — 組み込み側の管理 API はこのカタログには載りません。
- **`redirect_uris` 等は自前で検証する**。`RegisterClient` は DCR ハンドラが適用する RFC 8252 / OIDC Registration §2 のルールセットを実行しません。[動的クライアント登録 → 譲れないセキュリティの最低ライン](/ja/use-cases/dynamic-registration#譲れないセキュリティの最低ライン) と [登録時に強制している内容](/ja/use-cases/dynamic-registration#登録時に強制している内容) のルール一覧をミラーしてください — `application_type` ごとの redirect URI 形式、`jwks` / `jwks_uri` の同時指定不可、URI 系 field の `https` 限定、`sector_identifier_uri` の包含検証。
- **`client_secret` を監査ログに平文で出さない**。ログ出力前にハッシュし、平文は RFC 7591 §3.2.1 と同じ扱い、つまり一度だけ返される one-shot 素材として扱います。
- **エンドポイントに rate limit を適用する**。JWKS の取得や `sector_identifier_uri` の検証は実 I/O のコストを伴います。無制限の管理エンドポイントは DoS の増幅手段になります。
:::

## 5. 仕様外の経路を使う CLI / 管理ツール

パターン 4 ですら過剰な場面、たとえば SRE のバッチ取り込み、リカバリフロー、ローカルのマイグレーションスクリプトでは、ストアに直接接続して `RegisterClient` を呼ぶバイナリが最もオーバーヘッドの少ない選択肢です。

```go
storage, err := oidcsql.New(db, oidcsql.Postgres())
if err != nil { /* ... */ }
registry := storage.Clients().(store.ClientRegistry)

c := &store.Client{
  ID:                      "support-tool",
  RedirectURIs:            []string{"https://support.example.com/callback"},
  GrantTypes:              []string{"authorization_code", "refresh_token"},
  ResponseTypes:           []string{"code"},
  TokenEndpointAuthMethod: op.AuthNone.String(),
  PublicClient:            true,
  Source:                  store.ClientSourceAdmin,
}
if err := registry.RegisterClient(ctx, c); err != nil { /* ... */ }
```

このパターンはライブラリ側のハンドラをすべてバイパスします。`/register` の隣に同居しているバリデーションは実行されません。リクエストが HTTP レイヤを一度も通らないためです。したがって、書き込みの前にバイナリ側で同じ形式のルールをミラーする必要があります。`application_type` ごとの redirect URI 形式、`jwks` / `jwks_uri` の同時指定不可、URI 系 field の `https` 限定、fragment 禁止、ワイルドカードホスト禁止です。監査は運用者の責任です（バイナリ自身のログ、OS の監査サブシステム、または OP と同じシンクへの構造化イベント書き込み）。OP が in-memory キャッシュを保持しているなら、パターン 2 と同じ要領で無効化を計画してください。

## 本ライブラリが意図的に提供しないもの

- **`/admin/clients` 等の scope 保護された管理エンドポイント**。vendor SaaS 系では同梱されることが多いものの、本ライブラリは同梱しません。このエンドポイントには IETF / OIDF の仕様が存在せず、セキュリティの責任範囲（権限昇格、テナント境界、監査）はアプリケーションごとに異なります。汎用実装を同梱すると、組み込み側がセキュリティ層を十分にカスタマイズしないままになりがちです。
- **`software_statement`（RFC 7591 §2.3）は受け付けません**。指定されたリクエストは `invalid_software_statement` で拒否します。federation / 署名付き software_statement の信頼チェーンは現状スコープ外です。
- **OpenID Federation 1.0** の信頼チェーンは未実装です。
- **`Provider.IntrospectAccessToken(ctx, token)` のような、コードから直接呼べる introspection メソッドはありません**。組み込み側が自分の管理ハンドラから AT を検証する場合、`/introspect` を HTTP で呼び、JSON 応答をパースします。JWT 形式の AT に対しては OP の JWKS を使ってインプロセス検証することもできますが、それでは失効の可視性を失います — 誤用のコストが大きい管理操作では `/introspect` 経由が推奨です。`/introspect` への HTTP 往復のコストは、誤用が起きた際の被害に比べれば十分に安い保険です。

## 次に読む

- [動的クライアント登録](/ja/use-cases/dynamic-registration) — RFC 7591 / 7592 の詳細。パターン 4 と 5 がミラーすべきセキュリティの最低ラインを含みます。
- [Public / Internal スコープ](/ja/use-cases/scopes) — 管理用クライアントが使う scope 語彙の設計。
- [設計判断](/ja/security/design-judgments) — `software_statement` 拒否などの既定を意図して選んでいる理由。
