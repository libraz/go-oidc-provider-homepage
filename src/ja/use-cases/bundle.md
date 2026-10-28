---
title: 総合バンドル
description: 典型的な組み込み側が使うオプションを組み合わせた参考実装。パスワード + TOTP のログインフロー、captcha rule、public / confidential クライアント、ファーストパーティの同意スキップ、SPA のログイン UI、トークン有効期限、JSON ロガー。
---

# ユースケース — 総合バンドル

[`01-minimal`](/ja/use-cases/minimal-op) は動く最小の OP です。`02-bundle` は同じ OP に、本番で追加する部品を載せたものです。第 2 要素、captcha rule、2 種類のクライアント、OP が配信するログイン UI、短めのトークン有効期限、構造化ログが入っています。

> **ソース:** [`examples/02-bundle/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle)

## 含まれるもの

| 関心事 | オプション / 型 | 例での扱い |
|---|---|---|
| 第 1 要素のログイン | `op.LoginFlow{Primary: op.PrimaryPassword{...}}` | in-memory のユーザストアに対するパスワード認証。 |
| 第 2 要素 | `op.RuleAlways(op.StepTOTP{...})` | すべてのログインで TOTP コードも要求する。 |
| Captcha | `op.RuleAfterFailedAttempts(5, op.StepCaptcha{...})` | セッション内で 5 回失敗した時点から発動する。verifier は常に成功するスタブ。 |
| クライアント | `op.WithStaticClients(op.PublicClient{...}, op.ConfidentialClient{...})` | ブラウザアプリと、`client_secret_basic` を使うバックエンド。 |
| 同意 | `op.WithFirstPartyClients(...)` | ブラウザアプリは同意画面を省略する（[ファーストパーティ同意スキップ](/ja/use-cases/first-party)）。 |
| ログイン UI | `op.WithSPAUI(op.SPAUI{LoginMount, StaticDir})` | OP が共有の SPA バンドルを `/login` で配信する（[SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction)）。 |
| トークン有効期限 | `op.WithAccessTokenTTL`、`op.WithRefreshTokenTTL` | 2 分と 7 日。既定は 5 分と 30 日。 |
| scope の表示名 | `op.WithScope(op.PublicScope(...))` | `profile` と `email` の上書き。[Public / Internal スコープ](/ja/use-cases/scopes)を参照。 |
| ログ | `op.WithLogger(*slog.Logger)` | 標準出力への JSON `slog` ハンドラ。 |

`client_secret_basic` または `client_secret_post` で認証する `ConfidentialClient` には、`Secret`（登録時にハッシュ化されます）か、計算済みの `SecretHash` が必要です。どちらもないクライアントは `op.New` が拒否します。

## ログインチェーン

最初に `Primary` が動きます。そのあと各 `Rule` が、試行の状態を見てステップを追加するかを判定します。同じ試行で完了済みのステップは再実行されません。

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleAlways(op.StepTOTP{
      Store:         st.TOTPs(),
      EncryptionKey: keys.TOTPKey, // 32 byte。保存時は AES-256-GCM
    }),
    op.RuleAfterFailedAttempts(5, op.StepCaptcha{
      Verifier: alwaysOKCaptcha{}, // 本番は Turnstile、hCaptcha、reCAPTCHA など
    }),
  },
}
```

`/auth` が既存セッションから応答できる場合も rule は再評価され、セッションが過去に通した要素は数えません。`RuleAlways` は毎回一致するので、この OP はそうしたリクエストのたびに TOTP を再度求めます。セッションの subject を起点にチェーンを実行し、`prompt=none` なら `interaction_required` を返します。この判定では captcha rule は評価されず、リスク判定に基づく rule はログインチェーンの内側でしか発動しません。第 2 要素を特定のクライアントや scope でだけ求めたい場合は、`RuleAlways` を `RuleClient`、`RuleScope`、`RuleACR` のいずれかに置き換えます。`RuleRisk` や `LoginFlow.Risk` を含む rule の全体像は [MFA / ステップアップ](/ja/use-cases/mfa-step-up) にあります。

## 動かす

```sh
cd examples/02-bundle && GOWORK=off go run -tags example .
```

SPA バンドルのパスが相対指定なので、このディレクトリで実行してください。起動ログに、seed 済みの `demo` ユーザ向けの `otpauth://` URI、base32 のシークレット、ターミナル用 QR コードが出ます。認証アプリに登録してから `http://127.0.0.1:9090/` を開き、`demo` / `demo` でサインインして 6 桁のコードを入力します。RP の `/me` に `"amr": ["mfa","otp","pwd"]` が表示されます。

## この例に含まれないもの

| 必要なこと | 参照先 |
|---|---|
| FAPI 2.0、OAuth 2.1 | [セキュリティプロファイルの宣言](/ja/use-cases/security-profile)、[FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) |
| リスクに応じた MFA | [MFA / ステップアップ](/ja/use-cases/mfa-step-up)の `op.RuleRisk` と `LoginFlow.Risk` |
| リバースプロキシの背後での運用 | [オプション一覧](/ja/reference/options)の `op.WithTrustedProxies(cidrs ...)` |
| discovery に出さない scope | [Public / Internal スコープ](/ja/use-cases/scopes)の `op.InternalScope` |
| 実 DB の利用 | [SQL ストア](/ja/use-cases/sql-store) |

## 続きはこちら

- [最小構成 OP](/ja/use-cases/minimal-op) — このページが拡張している出発点。
- [MFA / ステップアップ](/ja/use-cases/mfa-step-up) — rule の構成要素。
