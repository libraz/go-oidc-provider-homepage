---
title: ファーストパーティ同意スキップ
description: OIDC Core §3.1.2.4 の認可判断を踏まえ、本ライブラリで自社所有のクライアントの対話型同意をスキップする方法を解説します。
---

# ユースケース — ファーストパーティ同意スキップ

## 「ファーストパーティ」とは

OIDC / OAuth 2.0 が想定する基本シナリオは **第三者** ケースです。外部の RP（どこかの SaaS）が、OP が保持するユーザデータへのアクセスを求める構図です。OIDC Core 1.0 §3.1.2.4 は、情報を開示する前に OP が認可判断を得ることを求めています。この判断は対話形式で得てもよいほか、事前の管理者同意や、その他の確立した処理条件で示すこともできます。

**ファーストパーティ** クライアントは、OP 運用者（組み込み側）が所有する RP のことです（自社モバイルアプリ、自社 SPA、社内ダッシュボード等）。ユーザはすでに信頼境界の内側におり、「Acme Corp のログインフロー内で Acme Corp に対するデータ開示を承認しますか？」と訊くのは冗長です。

OAuth 2.0 はこの除外を運用者の裁量に委ねてきました。最近策定中の **OAuth 2.0 for First-Party Applications** ドラフトはこのパターンを明文化しています。本ライブラリではクライアント ID の許可リストとして公開します。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4（認可判断と同意）
- [OAuth 2.0 for First-Party Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-first-party-apps/) — パターンを明文化する IETF ドラフト
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — §5.3.2.2（同意に関する情報提供の指針。本ライブラリはファーストパーティの自動同意をより厳しく除外）
:::

::: details 用語の補足
- **第三者クライアントとファーストパーティクライアント** — 分ける軸は RP の所有者です。他者が運用するアプリが第三者、自社が配布するアプリがファーストパーティです。プロトコル上の扱いは変わりません。変わるのは、委譲に対するユーザの拒否権に意味があるかどうかです。
- **認可判断** — OP が情報を開示する前に行う認可判断です。対話型の同意画面はその方法の 1 つで、事前の管理者判断で示すこともできます。ファーストパーティ RP で画面をスキップすることは、UX の改善と引き換えに信頼境界に関する明示的な判断をすることでもあります — 攻撃者が自分の RP をファーストパーティリストに紛れ込ませた場合、ユーザの拒否権がそのまま無効化されます。
:::

> **ソース:** [`examples/40-first-party-skip-consent`](https://github.com/libraz/go-oidc-provider/tree/main/examples/40-first-party-skip-consent)

## 実装

```go
op.New(
  /* 必須オプション */
  op.WithFirstPartyClients("first-party-app", "internal-dashboard"),
  op.WithStaticClients(op.PublicClient{
    ID:           "first-party-app",
    RedirectURIs: []string{"https://app.example.com/callback"},
    Scopes:       []string{"openid", "profile", "email"},
    GrantTypes:   []string{"authorization_code", "refresh_token"},
  }),
)
```

`op.New` は構築時にリストを検査します。掲載する ID は `WithStaticClients` にも登録されている必要があり、なければ `unknown client_id` で失敗します。[Dynamic Client Registration](/ja/use-cases/dynamic-registration) で作られたクライアントは、リストに書いてもファーストパーティになりません。

リスト掲載のクライアントに対して、`/auth` はユーザに代わって同意の grant を作り、同意画面なしで認可コードを発行します。リスト外のクライアントには通常どおり同意画面を表示します。`prompt=none` の場合、リスト外のクライアントは `consent_required` になりますが、リスト掲載のクライアントは認可コードを受け取ります。

### スキップが効く条件

スキップの適用範囲は意図的に狭くしています。次の条件がすべて揃ったときだけ効き、揃わなければ通常の同意画面を表示します。

| 条件 | 理由 |
|---|---|
| クライアントがリストにある | 運用者の判断。 |
| ユーザがすでにセッションを持っている | grant を結びつける subject を、スキップが新たに作ることはない。 |
| リクエストに `prompt=consent` がない | RP が明示した prompt を、OP 側の方針より優先する。 |
| scope に `offline_access` を含まない | 長期のリフレッシュ grant は、必ずユーザが確認する。 |
| `authorization_details` も Grant Management のアクションもない | リッチな認可リクエストと grant の変更には、必ず明示的な画面を出す。 |
| ブラウザが same-origin のリクエストと報告している、または same-site で `Origin` か `Referer` が `redirect_uri` の origin と一致する | `Sec-Fetch-Site` により、cross-site のページが自動付与を引き起こすのを防ぐ。cross-site のナビゲーションや、Fetch Metadata ヘッダを送らないクライアントには同意画面を出す。 |

スキップが省くのは同意画面だけです。認可コードを発行する前に `LoginFlow` の rule と `Decider` は評価されるので、クライアントや scope を守る rule がステップアップを要求できます（`prompt=none` なら `interaction_required` を返します）。`op.TriggerBeforeToken` で登録した対話も、引き続き実行されます。

## 監査

スキップのたびに `op.AuditConsentGrantedFirstParty` を発行します。監査証跡には、理由の分からない grant ではなく「同意は暗黙で、クライアントはファーストパーティリストにあった」と残ります。ダッシュボードではイベント種別で、ファーストパーティの grant と第三者の grant を見分けられます。

## 排他関係

`op.WithFirstPartyClients` は FAPI 2.0 プロファイルと組み合わせられません。これは本ライブラリのポリシーです。プロファイルはファーストパーティの自動同意を認めませんが、OIDC Core は事前の同意や管理者同意によって認可判断を確立することを認めています。`op.New` が組み合わせを拒否するので、信頼境界に関する判断を明示せざるを得ません。

## 本番運用の注意

::: danger 信頼の拡張
`WithFirstPartyClients` への掲載は、意図的な信頼の拡張です。本番運用では、リストを組み込み側の組織が所有するクライアントのレジストリ（典型的には起動時に読むクライアントテーブルのカラム）から作る必要があります。ハードコードしたスライスは避けてください。第三者クライアントがリストに混入すると、ユーザの拒否権が失われます。
:::

## 続きはこちら

- [トークン入門](/ja/concepts/tokens) — 同意暗黙のときの `id_token` の中身。
- [カスタム同意 UI](/ja/use-cases/custom-consent-ui) — スキップではなくブランド付きで出したい場合。
