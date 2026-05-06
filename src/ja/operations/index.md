---
title: 運用ガイド
description: ライブラリが解決しない本番運用上の論点 — 鍵ローテーション、マルチインスタンス、observability、バックアップ。
---

# 運用ガイド

ライブラリは HTTP のライフサイクルやインフラ寄りの論点には踏み込みません。`/metrics` ルートはマウントしませんし、鍵をクラスタ上でどう配置するかにも意見を持ちませんし、tracer も内蔵しません。本セクションでは、OP が公開している差し込み口と、それに対して本番の組み込み側が典型的にどう実装するかを記録します。

## このセクションのページ

| ページ | こういうとき |
|---|---|
| [鍵ローテーション](/ja/operations/key-rotation) | 署名鍵(`Keyset`)と cookie 鍵(`WithCookieKeys`)を、有効なセッションを切らずにローテーションする |
| [JWKS エンドポイント](/ja/operations/jwks) | `/jwks` がアドバタイズする内容、キャッシュヘッダ、ETag、RP 側のキャッシュ挙動 |
| [マルチインスタンス展開](/ja/operations/multi-instance) | レプリカが 2 つ以上 — DPoP nonce の共有、session 配置、sticky か round-robin か |
| [observability](/ja/operations/observability) | logging(`*slog.Logger`)、tracing(`otelhttp` ミドルウェア)、Prometheus、リクエスト ID |
| [バックアップ / DR](/ja/operations/backup) | 何をバックアップし、何を捨てるか、サブストアごとの RPO 目標 |

## 範囲外(と、その理由)

| 論点 | 同梱しない理由 |
|---|---|
| `/metrics` HTTP ルート | ルーター側の責務。ライブラリは `WithPrometheus(reg)` でカウンタを渡すだけです。`/metrics` は権限境界に合わせて好きな場所にマウントしてください |
| HTTP リクエスト時間ヒストグラム | HTTP ミドルウェアの領域(`otelhttp`、`prometheus/promhttp`)。OP は OIDC の業務カウンタだけを出します |
| エンドポイントハンドラ内部の trace 埋め込み | 公開表面は `http.Handler`。差し込み口で 1 回 `otelhttp.NewMiddleware` でラップすれば足ります |
| レートリミット | 上流(Cloudflare、Envoy、お好みの Go ミドルウェア)。チェイン上のどこかでリクエストが拒否された場合、OP は `rate_limit.exceeded` を発火しますが、リミッタ自体は実装しません |
| ヘルスチェック | 組み込み側の領域。OP は liveness と readiness の切り分けに意見を持ちません |
| バックグラウンド worker | OP はリクエストをまたいでステートレスです。クリーンアップ用の goroutine も持ちません。TTL eviction はストア側の責務です |

## 運用方針の通底

このセクション全体に効く決定:

1. **トランザクショナルクラスタはバックエンドを 1 つに集約します。** composite store は、clients / codes / リフレッシュトークン / アクセストークン / IATs を 2 つのバックエンドにまたがらせることを拒否します。[hot/cold split](/ja/use-cases/hot-cold-redis) を参照。
2. **揮発サブストアは best-effort です。** Sessions、DPoP nonce、JAR `jti` レジストリは、永続化無しの Redis でも構いません。退避(eviction)は通常運転の一部であり、OP は緩い側に倒れる(fail-open)のではなく、ギャップを監査ログに残します。[マルチインスタンス展開](/ja/operations/multi-instance) を参照。
3. **バックグラウンド goroutine は持ちません。** TTL のクリーンアップはストアの責務です。SQL アダプタは DB の scheduler 経由で定期的に prune し、Redis アダプタはネイティブの TTL を使います。プロセス内 janitor がホットリロードで漏れることはありません。
4. **設定変更は新しい `Provider` の構築を伴います。** 鍵ローテーション、クライアント追加、scope 変更 — どれも新しい `*Provider` を構築して、ハンドラをアトミックに差し替えます。監督プロセス側の pattern は [鍵ローテーション](/ja/operations/key-rotation) を参照してください。

## どこから読むか

本番投入前なら以下の順:

1. [鍵ローテーション](/ja/operations/key-rotation) — 最も頻度が高い運用(月次 / 四半期)。
2. [マルチインスタンス展開](/ja/operations/multi-instance) — 2 レプリカ目を立てる前に必読。
3. [observability](/ja/operations/observability) — インシデント後ではなく初日に logging / metrics / tracing を組み込む。
4. [バックアップ / DR](/ja/operations/backup) — 本番投入前に、少なくとも RPO 目標は決めておく。
