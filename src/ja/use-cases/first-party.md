---
title: ファーストパーティ同意スキップ
description: 自社所有のクライアントには同意プロンプトをスキップ — OIDC §3.1.2.4 の「ファーストパーティ」関係。
---

# ユースケース — ファーストパーティ同意スキップ

## 「ファーストパーティ」とは

OIDC / OAuth 2.0 が想定する基本シナリオは **第三者** ケースです。外部の RP（どこかの SaaS）が、OP が保持するユーザデータへのアクセスを欲しがる、という構図です。だから OIDC Core 1.0 §3.1.2.4 は「あなたは SaaS-X にあなたのメールを読む権限を委譲しますか？」と明示的に問う同意プロンプトを必須化しています。

**ファーストパーティ** クライアントは、OP 運用者(組み込み側)が所有する RP のことです（自社モバイルアプリ、自社 SPA、社内ダッシュボード等）。ユーザはすでに信頼境界の内側におり、「Acme Corp のログインフロー内で Acme Corp に対するデータ開示を承認しますか？」と訊くのは冗長です。

OAuth 2.0 はこの除外を運用者の裁量に委ねてきました。最近策定中の **OAuth 2.0 for First-Party Applications** ドラフトはこのパターンを明文化しています。本ライブラリではクライアント ID の許可リストとして公開します。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4（同意プロンプト）
- [OAuth 2.0 for First-Party Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-first-party-apps/) — パターンを明文化する IETF ドラフト
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — §5.3.2.4（信頼関係に関係なく同意必須）
:::

::: details 用語の補足
- **第三者クライアントとファーストパーティクライアント** — *第三者* RP は、OP が保持するユーザデータへアクセスしたい外部アプリで、同意プロンプトはユーザがその委譲を拒否する手段です。*ファーストパーティ* RP は OP 運用者(組み込み側)が所有するクライアント（自社 SPA、自社モバイルアプリ）— ユーザはすでに信頼境界の内側にいるので、Acme Corp のログイン画面で「Acme Corp にデータを読ませて良いですか？」と訊くのは冗長です。
- **同意プロンプト** — ログインと redirect-back-with-code の間で、特定の RP に対する scope 一覧をユーザが明示的に承認する OIDC 規定の画面。ファーストパーティ RP でこれをスキップすることは UX の改善と引き換えに信頼境界に関する明示的な判断をすることでもあります — 攻撃者が自分の RP をファーストパーティリストに紛れ込ませた場合、ユーザの拒否権がそのまま無効化されます。
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

リスト掲載のクライアント ID は、`/authorize` がログインフロー成功直後に **同意画面なしで** RP へリダイレクトします。リスト外（第三者）のクライアントは通常通り同意プロンプトを表示。ファーストパーティクライアントが `prompt=consent` を送った場合は、明示的なプロンプト要求が優先され、スキップは適用されません。

## 監査

スキップごとに `op.AuditConsentGrantedFirstParty` を発行するため、監査トレイルは「同意は暗黙、クライアントはファーストパーティリストにあった」と記録します — 単なる「同意が暗黙に行われた」ではありません。SOC ダッシュボードはイベント種別でファーストパーティ / 第三者を分離できます。

## 排他関係

`op.WithFirstPartyClients` は有効な FAPI 2.0 プロファイルと **両立しません**。FAPI 2.0 §5.3.2.4 は信頼関係に関わらず明示同意を必須としています。コンストラクタが構築時に拒否します — これは意図的な信頼境界の判断です。

## 本番運用の注意

::: danger 信頼の拡張
`WithFirstPartyClients` への掲載は、意図的な信頼の拡張です。本番運用では、リストを「組み込み側の組織が所有するクライアントレジストリ」（典型的には起動時に参照するクライアントテーブルのカラム）に基づかせる必要があります — ハードコードしたスライスではいけません。第三者クライアントが何かの拍子でリストに混入すると、ユーザから拒否権を奪うことになります。
:::

## 続きはこちら

- [トークン入門](/ja/concepts/tokens) — 同意暗黙のときの `id_token` の中身。
- [カスタム同意 UI](/ja/use-cases/custom-consent-ui) — スキップではなくブランド付きで出したい場合。
