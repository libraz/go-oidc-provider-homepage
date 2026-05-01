---
title: 総合バンドル
description: 典型的な組み込み側が触るオプションを一通り束ねたリファレンス実装 — login flow、MFA、captcha、リスク、scope、profile、信頼 proxy、logger。
---

# ユースケース — 総合バンドル

`01-minimal` は動く最小の OP、`02-bundle` は **本番形** の OP 実装が end-to-end でどう見えるかを示します — login flow、MFA、captcha、リスク、scope カタログ、信頼 proxy 正規化、推奨 logger まで。

> **ソース:** [`examples/02-bundle/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle)

## 含まれるレイヤー

| レイヤー | オプション / 型 |
|---|---|
| ログイン | `op.LoginFlow` + `op.PrimaryPassword` |
| MFA | `op.RuleAlways(op.StepTOTP{...})` |
| Captcha | `op.RuleAfterFailedAttempts(n, op.StepCaptcha{...})` |
| リスク | `op.RuleRisk(threshold, step)` + `LoginFlow.Risk` の assessor |
| クライアント | `op.WithStaticClients(...)`（typed seed） |
| Scope | `op.WithScope(op.PublicScope(...))` / `op.WithScope(op.InternalScope(...))` を scope ごとに |
| プロファイル | `op.WithProfile(...)`（既定はコメントアウト、FAPI を見たければオン） |
| Proxy | `op.WithTrustedProxies(cidrs ...)` |
| ロガー | `op.WithLogger(slog.Logger)` |

## チェックリストとして使う

例は意図的に長めです — コピーして不要な部分を削るための「ひな型」として使うのが目的です。実装をゼロから書きそうになったら、まず `02-bundle` を見て見落としがないか確認してください。

```sh
go run -tags example ./examples/02-bundle
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
