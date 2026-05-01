---
title: Claims リクエストパラメータ
description: OIDC Core 1.0 §5.5 — RP が `claims` パラメータで claim を指定し、OP が id_token / userinfo に投影。
---

# ユースケース — Claims リクエストパラメータ

## `claims` パラメータとは

通常、RP は **scope** 経由で claim を選びます: `scope=openid profile email` であれば、OIDC Core 1.0 §5.4 が scope ↔ claim でマップしている束（`name`、`given_name`、…、`email`、`email_verified`）を要求する、という具合です。この束は固定です。

OIDC Core 1.0 §5.5 はもっと細かい仕組みを追加します: RP は `claims=...` JSON オブジェクトで **個別の claim**（例: `email_verified` と `phone_number` だけ）を要求でき、出力先（`id_token` か `/userinfo` か両方）も指定できます。`essential` マーカーや値制約も付けられます。

主な使いどころ:
1. **ステップアップ同意** — RP が `acr=urn:mace:incommon:iap:silver` を essential として要求し、より高い保証水準の認証を強制する。
2. **プライバシー最小化志向の RP** — scope 束ではなく、本当に必要な claim だけをピンポイントで要求する。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.4（scope と claim のマップ）、§5.5（claims request）
- [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) — Authorization Details（scope の構造化代替）
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR（claims を署名 request object に格納する場合）
:::

::: details 用語の補足
- **Scope** — 粗い権限の束（`profile`、`email` など）。1 scope が固定の claim 集合に対応します。
- **Claims request** — claim 単位のきめ細かい指定。RP が必要な claim と出力先（`id_token` / `userinfo`）を明示し、`essential` マーカーで essential / voluntary を区別できます。
- **Essential / voluntary** — `{"essential": true}` の場合、claim が取得できなければ OP はリクエストを拒否します。`{"essential": false}` または `null` の場合、取得できなければ何も告知せず省略します。
:::

> **ソース:** [`examples/17-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/17-claims-request)

## 実装

```go
op.New(
  /* 必須オプション */
  op.WithClaimsParameterSupported(true),
  op.WithClaimsSupported(
    "sub", "iss", "aud", "exp", "iat",
    "email", "email_verified",
    "name", "given_name", "family_name",
    "locale", "zoneinfo",
  ),
)
```

discovery document はこう公開します:

```json
{
  "claims_parameter_supported": true,
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "email", "email_verified", "name", "given_name", "family_name", "locale", "zoneinfo"]
}
```

## 動作確認

```sh
CLAIMS='{"id_token":{"email":{"essential":true}},"userinfo":{"locale":null}}'
curl -G --data-urlencode "claims=$CLAIMS" \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'client_id=demo' \
  --data-urlencode 'redirect_uri=http://localhost:5173/callback' \
  --data-urlencode 'scope=openid' \
  --data-urlencode 'code_challenge_method=S256' \
  --data-urlencode "code_challenge=$CHALLENGE" \
  http://localhost:8080/oidc/auth
```

フロー後:

| 場所 | 結果 |
|---|---|
| `id_token` | `email` を含む。ユーザストアに値がなければ OP が再プロンプトを強制する（essential） |
| `/userinfo` レスポンス | `locale` を best-effort で含める（voluntary） |

## Essential と voluntary

- `{"essential": true}` — OP は claim を **必ず** 含めなければなりません。ユーザストアにその claim がなく、ログインフローでも提供できない場合、OP は authorize 要求を `claim_not_available` で失敗させます。
- `{"essential": false}` または `null` — OP は claim を **持っていれば** 含めます。なければ何も告知せず省略します。

## JAR と組み合わせ

[JAR](/ja/use-cases/fapi2-baseline) を有効にすると、`claims` JSON は request object の中に入ります:

```json
{
  "iss": "client",
  "aud": "https://op.example.com",
  "client_id": "demo",
  "response_type": "code",
  "redirect_uri": "https://rp.example.com/callback",
  "scope": "openid",
  "claims": {"id_token": {"email": {"essential": true}}}
}
```

ライブラリは両方の形（query パラメータ、JAR 内）を同じマージ経路で処理します。

## Authorization Details（RFC 9396）

ライブラリは RFC 9396 の `authorization_details` 配列も同じマージ経路で受理します。形式は JSON 配列か JSON オブジェクトかの違いで、ライブラリは形で区別するので、組み込み側が個別にオプトインする必要はありません。

## 続きはこちら

- [トークン入門](/ja/concepts/tokens) — どの claim がどこに乗るか。
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — JAR + claims の組み合わせ。
