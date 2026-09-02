---
title: Claims リクエストパラメータ
description: OIDC Core 1.0 §5.5 — RP が `claims` で claim を指定し、claims 機能が有効な場合に OP が id_token / userinfo へ投影します。
---

# 使い方 — Claims リクエストパラメータ

## `claims` パラメータとは

通常、RP は **scope** 経由で claim を選びます: `scope=openid profile email` であれば、OIDC Core 1.0 §5.4 が scope ↔ claim でマップしている束（`name`、`given_name`、…、`email`、`email_verified`）を要求する、という具合です。この束は固定です。

OIDC Core 1.0 §5.5 はもっと細かい仕組みを追加します: RP は `claims=...` JSON オブジェクトで **個別の claim**（例: `email_verified` と `phone_number` だけ）を要求でき、出力先（`id_token` か `/userinfo` か両方）も指定できます。`essential` マーカーや値制約も付けられます。

主な使いどころ:
1. **ステップアップ同意** — RP が `acr=urn:mace:incommon:iap:silver` を essential として要求し、より高い保証水準の認証を強制する。
2. **プライバシー最小化志向の RP** — scope 束ではなく、本当に必要な claim だけをピンポイントで要求する。

この 2 つの仕組みは、出力先の広がり方が違います。scope は束全体を ID Token と `/userinfo` の両方へ渡します。`claims` のメンバーは、そこに書かれた claim だけを、そのメンバーが属する出力先にだけ渡します。

<svg role="img" aria-labelledby="claims-routing-title" viewBox="0 0 760 280" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="claims-routing-title">要求ごとの出力先: claims パラメータの id_token メンバーは ID Token だけ、userinfo メンバーは /userinfo 応答だけに claim を出し、scope が定める束は両方に届く。</title>

  <rect x="24" y="32" width="250" height="56" rx="8" style="fill:var(--vp-c-bg-soft);stroke:var(--vp-c-text-3)"/>
  <text x="40" y="58" fill="currentColor" font-size="12.5" font-weight="600" style="font-family:var(--vp-font-family-mono)">claims["id_token"]</text>
  <text x="40" y="78" font-size="11" style="fill:var(--vp-c-text-2)">指定した claim だけ · ID Token のみ</text>

  <rect x="24" y="112" width="250" height="56" rx="8" style="fill:var(--vp-c-bg-soft);stroke:var(--vp-c-text-3)"/>
  <text x="40" y="138" fill="currentColor" font-size="12.5" font-weight="600" style="font-family:var(--vp-font-family-mono)">scope</text>
  <text x="40" y="158" font-size="11" style="fill:var(--vp-c-text-2)">§5.4 の束すべて · 両方へ</text>

  <rect x="24" y="192" width="250" height="56" rx="8" style="fill:var(--vp-c-bg-soft);stroke:var(--vp-c-text-3)"/>
  <text x="40" y="218" fill="currentColor" font-size="12.5" font-weight="600" style="font-family:var(--vp-font-family-mono)">claims["userinfo"]</text>
  <text x="40" y="238" font-size="11" style="fill:var(--vp-c-text-2)">指定した claim だけ · UserInfo のみ</text>

  <rect x="526" y="44" width="210" height="64" rx="8" style="fill:var(--vp-c-brand-soft);stroke:var(--vp-c-brand-2)"/>
  <text x="631" y="74" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--vp-c-brand-2);font-family:var(--vp-font-family-mono)">id_token</text>
  <text x="631" y="94" text-anchor="middle" font-size="11" style="fill:var(--vp-c-text-2)">JWT に署名して載る</text>

  <rect x="526" y="176" width="210" height="64" rx="8" style="fill:var(--vp-c-brand-soft);stroke:var(--vp-c-brand-2)"/>
  <text x="631" y="206" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--vp-c-brand-2);font-family:var(--vp-font-family-mono)">GET /userinfo</text>
  <text x="631" y="226" text-anchor="middle" font-size="11" style="fill:var(--vp-c-text-2)">JSON 応答の本文に載る</text>

  <path d="M274 60 H522" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M516 55 L522 60 L516 65" style="stroke:var(--vp-c-brand-2)"/>

  <path d="M274 128 C398 128 398 92 522 92" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M516 87 L522 92 L516 97" style="stroke:var(--vp-c-brand-2)"/>

  <path d="M274 152 C398 152 398 208 522 208" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M516 203 L522 208 L516 213" style="stroke:var(--vp-c-brand-2)"/>

  <path d="M274 220 H522" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M516 215 L522 220 L516 225" style="stroke:var(--vp-c-brand-2)"/>
</svg>

`essential` はこの出力先を変えません。変わるのは OP がどこまで取得を試みるかだけです。`acr` に対する essential な要求は再認証を強制しますが、それ以外の claim では best-effort のヒントにとどまります。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.4（scope と claim のマップ）、§5.5（claims request）
- [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) — Authorization Details（scope の構造化代替）
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR（claims を署名 request object に格納する場合）
:::

::: details 用語の補足
- **Scope** — 粗い権限の束（`profile`、`email` など）。1 scope が固定の claim 集合に対応します。
- **Claims request** — claim 単位のきめ細かい指定。RP が必要な claim と出力先（`id_token` / `userinfo`）を明示し、`essential` マーカーで essential / voluntary を区別できます。
- **Essential / voluntary** — 通常の claim では、`essential` は強制のスイッチではなくヒントに過ぎません。OP は best-effort で取得を試み、取得できなければ voluntary リクエストと同じく黙って省略します。唯一の例外は `acr` で、現在のセッションが満たせない essential な `acr` リクエストは再認証を強制します（詳細は [MFA / ステップアップ](/ja/use-cases/mfa-step-up)）。
:::

> **ソース:** [`examples/61-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/61-claims-request)

## 実装

```go
op.New(
  /* 必須オプション */
  op.WithClaimsSupported(
    "sub", "iss", "aud", "exp", "iat",
    "email", "email_verified",
    "name", "given_name", "family_name",
    "locale", "zoneinfo",
  ),
)
```

`claims_parameter_supported` の既定は `true` です。`op.WithClaimsParameterSupported(false)` を渡すと、この広告を止め、正しい形式の `claims` payload を無視します。scope から導出する claim は変わらず、壊れた JSON はリクエスト境界で拒否されます。

discovery 文書はこう公開します:

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
| `id_token` | ユーザストアに値があれば `email` を含む。なければ黙って省略する（essential は「より頑張って取得する」の意味であり、無ければ失敗する、という意味ではない） |
| `/userinfo` レスポンス | `locale` を best-effort で含める（voluntary） |

## Essential と voluntary

通常の claim（`acr` 以外）では、`essential` は OP がどこで失敗するかを変えません。OIDC Core 1.0 §5.5 は essential な claim について「OP は提供を試みなければならない（MUST attempt to provide）」と定めるだけで、そこで止まっています。claim が存在しないときに OP がリクエストを拒否することまでは求めていません。

- `{"essential": true}` — OP は claim を検索し、値があれば含めます。ユーザストアにその claim がなければ、voluntary リクエストと全く同じように黙って省略します。存在しない通常の claim に紐づくエラーコードや再プロンプトはありません。
- `{"essential": false}` または `null` — OP は claim を **持っていれば** 含めます。なければ何も告知せず省略します。

`essential` が実際に効くのは `acr` だけです。essential な `acr` リクエスト（`{"id_token":{"acr":{"essential":true,"values":[...]}}}`）を現在のセッションの認証コンテキストが満たせない場合、OP は再認証を強制します。`prompt=none` では `interaction_required`、それ以外では対話的なログインへのリダイレクトになり、これは RFC 9470 のステップアップ経路によるものです。詳細は [MFA / ステップアップ](/ja/use-cases/mfa-step-up) を参照してください。

## 値の正確な制約

`value` と `values` はヒントや型変換ではなく、JSON の正確な制約です:

- `value` は候補の claim がその 1 つの値と JSON 的に等しいことを要求します。
- `values` は候補の claim がリストのいずれか 1 つと JSON 的に等しいことを要求します。範囲指定ではなく membership です。
- 両方を指定した場合は、両方の制約を満たさなければなりません。
- 数値は、`json.Number` と user store が返す Go の整数型（`int`、`int64`、`uint64`、その他の sized integer type）の間でも、正確な数値として比較します。2^53 を超える整数値は `float64` へ変換せず整数として比較するため、隣り合う大きな整数が丸めで同じ値になることはありません。store が浮動小数点値を返した場合は、その浮動小数点値そのものを比較します。文字列と boolean は通常の JSON equality で比較します。

候補が制約を満たさなければ、通常の best-effort 投影ルールに従って、その claim を省略します。

## `updated_at`

`id_token` または `/userinfo` で選択される `updated_at` は、`store.User.UpdatedAt` を Unix 秒にした値です。同じ subject と grant であれば、両方のオブジェクトに同じ値が現れます。user の `Claims` map に `updated_at` が明示されている場合はその値を優先し、timestamp が zero なら自動生成しません。

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

## サイレント認可と既存の projection

既存の grant を使って返却される subject をサイレント認可（`prompt=none`）するとき、そのリクエストに `claims` パラメータがあれば、OP は新しい認可コードを発行する前に grant に保存した projection を更新します。そのため、先の grant が別の projection を保持していても、後続の ID Token と UserInfo はサイレント認可で要求した claim を反映します。リクエストが `claims` を省略した場合は既存の projection を保持します。省略は「合意済みの内容を残す」という意味であり、「消去」ではありません。

claims サポートを無効にすると、既存の grant に保存された要求 claim の投影も黙って抑止します。ID Token と UserInfo の両方が対象で、refresh rotation から派生したトークンも同じです。scope が公開する claim には影響せず、grant の書き換え、再プロンプト、エラーも発生しません。再び有効にすると、検証済みの要求を保持している grant では投影が戻ります。

## Authorization Details（RFC 9396）

`claims` パラメータは *どの claim* を ID Token / `/userinfo` に載せるかを絞り込みます。その構造化された兄弟分である RFC 9396 の `authorization_details` は、リソースサーバで *アクセストークンが何をできるか* を記述します。両者は同じマージ経路で共存し、本ライブラリは JSON 配列（`authorization_details`）と JSON オブジェクト（`claims`）を形で区別します。ただし `authorization_details` は、受理する type を登録して初めて有効になります。詳細は [Rich authorization requests](/ja/use-cases/authorization-details) を参照してください。

## 続きはこちら

- [トークン入門](/ja/concepts/tokens) — どの claim がどこに乗るか。
- [Rich authorization requests](/ja/use-cases/authorization-details) — 構造化された `authorization_details` の兄弟分。
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — JAR + claims の組み合わせ。
