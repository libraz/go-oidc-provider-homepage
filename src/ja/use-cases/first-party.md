---
title: ファーストパーティ同意スキップ
description: OIDC Core §3.1.2.4 の認可判断を踏まえ、本ライブラリで自社所有のクライアントの対話型同意をスキップする方法を解説します。
---

# 使い方 — ファーストパーティ同意スキップ

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

リスト掲載のクライアント ID は、`/authorize` がログインフロー成功直後に **同意画面なしで** RP へリダイレクトします。リスト外（第三者）のクライアントには、通常どおり同意画面を表示します。ファーストパーティクライアントが `prompt=consent` を送った場合は、明示的な画面表示要求が優先され、スキップは適用されません。

## 監査

スキップごとに `op.AuditConsentGrantedFirstParty` を発行するため、監査トレイルは「同意は暗黙、クライアントはファーストパーティリストにあった」と記録します — 単なる「同意が暗黙に行われた」ではありません。SOC ダッシュボードはイベント種別でファーストパーティ / 第三者を分離できます。

## 排他関係

`op.WithFirstPartyClients` は有効な FAPI 2.0 プロファイルと **両立しません**。これは本ライブラリのポリシーです。プロファイルの制約によりファーストパーティの自動同意を拒否しますが、OIDC Core は事前の同意や管理者同意によって認可判断を確立することを認めています。コンストラクタは構築時に組み合わせを拒否し、信頼境界に関する判断を明示させます。

## 本番運用の注意

::: danger 信頼の拡張
`WithFirstPartyClients` への掲載は、意図的な信頼の拡張です。本番運用では、リストを「組み込み側の組織が所有するクライアントレジストリ」（典型的には起動時に参照するクライアントテーブルのカラム）に基づかせる必要があります — ハードコードしたスライスではいけません。第三者クライアントが何かの拍子でリストに混入すると、ユーザから拒否権を奪うことになります。
:::

## 続きはこちら

- [トークン入門](/ja/concepts/tokens) — 同意暗黙のときの `id_token` の中身。
- [カスタム同意 UI](/ja/use-cases/custom-consent-ui) — スキップではなくブランド付きで出したい場合。
