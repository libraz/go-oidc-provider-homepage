---
title: 総合バンドル
description: 典型的な組み込み側が触るオプションを一通り束ねた参考実装 — ログイン処理、MFA、captcha、リスク判定、scope、プロファイル、信頼プロキシ、ロガー。
---

# 使い方 — 総合バンドル

`01-minimal` は動く最小の OP です。`02-bundle` は **本番に近い形** の OP 実装が全体としてどう見えるかを示します。ログイン処理、MFA、captcha、リスク判定、scope カタログ、信頼プロキシの正規化、推奨ロガーまでをまとめています。

> **ソース:** [`examples/02-bundle/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle)

## 含まれるレイヤー

| レイヤー | オプション / 型 |
|---|---|
| ログイン | `op.LoginFlow` + `op.PrimaryPassword` |
| MFA | `op.RuleAlways(op.StepTOTP{...})` |
| Captcha | `op.RuleAfterFailedAttempts(n, op.StepCaptcha{...})` |
| リスク | `op.RuleRisk(threshold, step)` + `LoginFlow.Risk` の assessor |
| クライアント | `op.WithStaticClients(...)`（型付きクライアント定義） |
| scope | `op.WithScope(op.PublicScope(...))` / `op.WithScope(op.InternalScope(...))` を scope ごとに |
| プロファイル | `op.WithProfile(...)`（既定はコメントアウト、FAPI を見たければオン） |
| 信頼プロキシ | `op.WithTrustedProxies(cidrs ...)` |
| ロガー | `op.WithLogger(slog.Logger)` |

## チェックリストとして使う

例は意図的に長めです — コピーして不要な部分を削るための「ひな型」として使うのが目的です。実装をゼロから書きそうになったら、まず `02-bundle` を見て見落としがないか確認してください。

```sh
(cd examples/02-bundle && go run -tags example .)
```

## 何を確認したいときに見るか

| 質問 | 見るべき箇所 |
|---|---|
| `01-minimal` から最小限増やすなら？ | `LoginFlow` ブロック + `WithStaticClients` |
| MFA + リスクをひとつのフローに乗せたい | `Rules` スライス |
| discovery の `scopes_supported` の整え方 | `WithScope(PublicScope(...))` の連鎖 |
| 推奨される slog logger の形 | `WithLogger` |
| FAPI 2.0 にするには？ | `WithProfile` 行のコメントアウトを外す |

## 続きはこちら

- [最小構成 OP](/ja/use-cases/minimal-op) — 出発点。
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — プロファイル切替の挙動。
- [MFA / ステップアップ](/ja/use-cases/mfa-step-up) — rule の構成要素。
