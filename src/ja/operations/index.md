---
title: 運用ガイド
description: ライブラリが組み込み側に任せている本番運用上の論点 — 鍵ローテーション、マルチインスタンス、observability、バックアップ、ストレージの保守。
---

# 運用ガイド

ライブラリは HTTP のライフサイクルやインフラ寄りの論点には踏み込みません。`/metrics` ルートをマウントすることも、鍵をクラスタ上でどう配置するかに意見を持つことも、tracer を内蔵することもありません。本セクションでは、OP が公開している差し込み口と、本番の組み込み側がそこをどう実装するのが典型かをまとめます。

::: tip 本セクションで使う用語
**OP** は運用する側のプロバイダ（本ライブラリ）、**RP** は OP 経由でユーザをログインさせるクライアントアプリです。**組み込み側** は、本ライブラリを import して OP をマウントする Go プログラムの開発者を指します。**サブストア** は `store.Store` 配下の個々のストレージインターフェース（クライアント、grant、session など）、**JWKS** は OP が `/jwks` で公開する公開鍵のセットです。
:::

## このセクションのページ

| ページ | こういうとき |
|---|---|
| [鍵ローテーション](/ja/operations/key-rotation) | 署名鍵（`Keyset`）と cookie 鍵（`WithCookieKeys`）を、有効なセッションを切らずにローテーションする |
| [JWKS エンドポイント](/ja/operations/jwks) | `/jwks` がアドバタイズする内容、キャッシュヘッダ、ETag、RP 側のキャッシュ挙動 |
| [マルチインスタンス展開](/ja/operations/multi-instance) | レプリカが 2 つ以上 — DPoP nonce の共有、session 配置、sticky か round-robin か |
| [observability](/ja/operations/observability) | logging（`*slog.Logger`）、tracing（`otelhttp` ミドルウェア）、Prometheus、リクエスト ID |
| [バックアップ / DR](/ja/operations/backup) | 何をバックアップし、何を捨てるか、サブストアごとの RPO 目標 |
| [ストレージの保守](/ja/operations/storage-maintenance) | SQL スキーマ変更を正しい順序で適用し、retention GC をスケジュールし、その結果を監視する |

## 範囲外（と、その理由）

| 論点 | 同梱しない理由 |
|---|---|
| `/metrics` HTTP ルート | ルータ側の責務。ライブラリは `WithPrometheus(reg)` でカウンタを渡すだけです。`/metrics` は権限境界に合わせて好きな場所にマウントしてください |
| HTTP リクエスト時間ヒストグラム | HTTP ミドルウェアの領域（`otelhttp`、`prometheus/promhttp`）。OP は OIDC の業務カウンタだけを出します |
| エンドポイントハンドラ内部の trace 埋め込み | 公開表面は `http.Handler`。差し込み口で 1 回 `otelhttp.NewMiddleware` でラップすれば足ります |
| レートリミット | 上流（Cloudflare、Envoy、任意の Go ミドルウェア）。OP は `rate_limit.exceeded` という監査イベントの定数を、そのミドルウェアが発行するための共有語彙として定義するだけで、自身では発火させません。リミッタ自体も実装しません |
| ヘルスチェック | 組み込み側の領域。OP は liveness と readiness の切り分けに意見を持ちません |
| バックグラウンド worker | OP はリクエストをまたいでステートレスで、クリーンアップ用のジョブも動かしません。古い row の削除はストア側の責務です |

## 運用の基本方針

本セクション全体に通じる決定は、次の 4 点です。

1. **トランザクショナルクラスタはバックエンドを 1 つに集約します。** composite store は、認可コード、リフレッシュトークン、grant、PAR、JWT / opaque のアクセストークン、grant revocation を 2 つのバックエンドにまたがらせることを拒否します。[hot/cold split](/ja/use-cases/hot-cold-redis) を参照してください。
2. **揮発にしてよいのは Sessions と Interactions で、replay 防御の集合は別です。** `Sessions` と `Interactions` は永続化なしの Redis に置けます。追い出しは通常運転の一部で、OP は緩い側に倒れる（fail-open）のではなく、ギャップを監査ログに残します。例外が `ConsumedJTIs`（replay 防御の集合）で、有効なエントリが追い出されると、塞いでいた replay の窓が再び開きます。`noeviction` の Redis か永続バックエンドに置いてください。[マルチインスタンス展開](/ja/operations/multi-instance) を参照してください。
3. **OP はクリーンアップのジョブを持ちません。** 古い row の削除はストアの責務です。SQL アダプタは `GC` を公開しており、呼び出しは組み込み側のスケジューラが担います。Redis アダプタはネイティブの TTL を使います。切り離されて動く処理は back-channel logout の送信だけで、`Provider.Shutdown` が終わりを待ちます。
4. **設定変更は新しい `Provider` の構築を伴います。** 鍵ローテーション、静的に登録したクライアントや scope の変更は、どれも新しい `*Provider` を構築してハンドラを差し替えます。監督プロセス側のパターンは [鍵ローテーション](/ja/operations/key-rotation) を参照してください。

## どこから読むか

本番投入前なら以下の順:

1. [鍵ローテーション](/ja/operations/key-rotation) — 最も頻度が高い運用（月次 / 四半期）。
2. [マルチインスタンス展開](/ja/operations/multi-instance) — 2 レプリカ目を立てる前に必読。
3. [observability](/ja/operations/observability) — インシデント後ではなく初日に、ログ・メトリクス・トレースを組み込む。
4. [バックアップ / DR](/ja/operations/backup) — 本番投入前に、少なくとも RPO 目標は決めておく。
5. [ストレージの保守](/ja/operations/storage-maintenance) — 稼働中の DB に最初のスキーマ変更を当てる前に。
