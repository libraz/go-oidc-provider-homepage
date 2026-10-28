---
title: Claims リクエストパラメータ
description: OIDC Core 1.0 §5.5 — RP が `claims` で claim を指定し、claims 機能が有効な場合に OP が id_token / userinfo へ投影します。
pageClass: pg-use-cases-claims-request
---

# ユースケース — Claims リクエストパラメータ

## `claims` パラメータとは

通常、RP は **scope** 経由で claim を選びます: `scope=openid profile email` であれば、OIDC Core 1.0 §5.4 が scope ↔ claim でマップしている束（`name`、`given_name`、…、`email`、`email_verified`）を要求する、という具合です。この束は固定です。

OIDC Core 1.0 §5.5 はもっと細かい仕組みを追加します: RP は `claims=...` JSON オブジェクトで **個別の claim**（例: `email_verified` と `phone_number` だけ）を要求でき、出力先（`id_token` か `/userinfo` か両方）も指定できます。`essential` マーカーや値制約も付けられます。

主な使いどころ:
1. **ステップアップ認証** — RP が現在のセッションでは満たせない `acr` 値を essential として要求し、再認証を促す。
2. **プライバシー最小化志向の RP** — scope 束ではなく、本当に必要な claim だけをピンポイントで要求する。

この 2 つの仕組みは返却先が異なります。認可コードフローでは、標準の `profile`、`email`、`address`、`phone` scope は `/userinfo` で返す claim を要求します。`claims` パラメータでは、個別の claim と返却先を指定します。アクセストークンを発行しない ID トークンのみのレスポンスでは、scope に対応する claim は ID トークンに入ります。

<figure class="fig">
  <div class="fig-head">要求はそれぞれ 1 か所に出力される</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-claims-title" viewBox="0 0 960 360" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-claims-title">認可コードフローでは、claims パラメータの id_token メンバーは ID トークン、userinfo メンバーと標準の profile scope は UserInfo の claim を要求します。</title>
    <text class="fg-lbl" x="32" y="36">何で要求するか</text>
    <text class="fg-lbl" x="568" y="36">どこに出るか</text>
    <!-- claims["id_token"] -->
    <rect class="fg-box" x="32" y="56" width="376" height="72" rx="8"/>
    <text class="fg-m" x="48" y="84">claims["id_token"]</text>
    <text class="fg-s" x="48" y="108">指定した claim だけ</text>
    <!-- claims["userinfo"] -->
    <rect class="fg-box" x="32" y="160" width="376" height="72" rx="8"/>
    <text class="fg-m" x="48" y="188">claims["userinfo"]</text>
    <text class="fg-s" x="48" y="212">指定した claim だけ</text>
    <!-- scope -->
    <rect class="fg-box fg-box--accent" x="32" y="264" width="376" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="292">scope</text>
    <text class="fg-s" x="48" y="316">OIDC Core §5.4 が定める束のすべて</text>
    <!-- edges -->
    <path class="fg-edge" d="M408,92 H568" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M408,196 H568" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--accent" d="M408,300 H568" marker-end="url(#fg-ac)"/>
    <!-- ID token -->
    <rect class="fg-box" x="568" y="56" width="360" height="72" rx="8"/>
    <text class="fg-t2" x="584" y="84">ID トークン</text>
    <text class="fg-s" x="584" y="108">JWT に署名されて載り、RP が読む</text>
    <!-- UserInfo -->
    <rect class="fg-box" x="568" y="160" width="360" height="176" rx="8"/>
    <text class="fg-t2" x="584" y="188">UserInfo</text>
    <text class="fg-m" x="584" y="212">GET /userinfo</text>
    <text class="fg-s" x="584" y="236">レスポンスで返す</text>
  </svg>
  <figcaption class="fig-note">図は認可コードフローの場合です。<code>claims["userinfo"]</code> だけで要求した claim は、ID トークン用には要求されません。2 つのメンバーは別々の要求です。</figcaption>
</figure>

`essential` を付けても返却先は変わりません。通常の claim では、その値が認可の判断に重要であることを OP に伝えますが、値がない場合のエラーは要求しません。必要な値を指定した essential な `acr` には特別な一致規則があり、再認証につながる場合があります。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.4（scope と claim のマップ）、§5.5（claims request）
- [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) — Authorization Details（scope の構造化代替）
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR（claims を署名 request object に格納する場合）
:::

::: details 用語の補足
- **Scope** — 粗い権限の束（`profile`、`email` など）。1 scope が固定の claim 集合に対応します。
- **Claims request** — claim 単位のきめ細かい指定。RP が必要な claim と出力先（`id_token` / `userinfo`）を明示し、`essential` マーカーで essential / voluntary を区別できます。
- **Essential / voluntary** — 通常の claim では、`essential` はその重要性を示しますが、値がない場合のエラーを求めるものではありません。本ライブラリは取得できない claim を省略します。`essential: true` と必要な値を指定した `acr` には特別な一致規則があります（[MFA / ステップアップ](/ja/use-cases/mfa-step-up)）。
:::

> **ソース:** [`examples/61-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/61-claims-request)

## 実装

```go
op.New(
  /* 必須オプション */
  op.WithClaimsParameterSupported(true), // 既定値。分かりやすさのために明示
  op.WithClaimsSupported(
    "sub", "iss", "aud", "exp", "iat", "auth_time", "nonce",
    "name", "given_name", "family_name", "preferred_username",
    "email", "email_verified",
    "locale",
  ),
)
```

`claims_parameter_supported` の既定は `true` です。`op.WithClaimsParameterSupported(false)` を渡すと、この広告を止め、正しい形式の `claims` payload を無視します。scope から導出する claim は変わらず、壊れた JSON はリクエスト境界で拒否されます。`WithClaimsSupported` が埋めるのは discovery の `claims_supported` だけです（未指定なら省略）。OP が開示できる claim を制限するものではありません。

discovery 文書はこう公開します:

```json
{
  "claims_parameter_supported": true,
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "auth_time", "nonce", "name", "given_name", "family_name", "preferred_username", "email", "email_verified", "locale"]
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
| `id_token` | ユーザストアに値があれば `email` を含む。なければリクエストを失敗させずに省略する |
| `/userinfo` レスポンス | `locale` を best-effort で含める（voluntary） |

## Essential と voluntary

通常の claim（`acr` 以外）では、`essential` は認可時にその値が重要であることを示します。OIDC Core 1.0 §5.5.1 は、claim 固有の規則がない限り、essential な claim を返せないことだけを理由に OP がエラーを生成してはならないと定めています。本ライブラリは値のない通常の claim を省略します。

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

## 認可ごとに要求を保持する

`claims` リクエストは、それを運んだ認可に属します。認可コードがリクエストを記録し、そのコードから派生するリフレッシュトークンとアクセストークンが引き継ぎます。JWT アクセストークンは `userinfo` メンバーを private claim の `userinfo_claims` に載せ（要求に指定がなければ `{}`）、`/userinfo` はこの claim から開示する claim を決めます。リソースサーバはこの claim を無視してください。名前は予約されており、custom grant は設定できません。

同じユーザが同じクライアントを 2 回認可した場合、次のようになります。

- 1 回目の認可で得たトークンは、1 回目のリクエストが求めた claim をそのまま開示し続けます。あとから claim を増やす認可や減らす認可があっても、変わりません。
- サイレントに処理した認可（`prompt=none`、またはリクエストを満たすキャッシュ済み grant）で `claims` パラメータがない場合、開示するのは scope 由来の claim だけです。同じ grant 上の過去の認可が持っていた `claims` リクエストは引き継ぎません。必要な認可のたびに `claims` を送り直してください。

リフレッシュのローテーションは、置き換える側のトークンが持つリクエストを引き継ぎます。認可ごとのフィールドを永続化しない自前ストア（`store.AuthorizationCode`、`store.RefreshToken`、`store.OpaqueAccessToken` の `AuthorizationRecorded` を参照）は、grant に最後に保存されたリクエストにフォールバックします。

claims サポートを無効にすると、OP はすべてのトークンで要求 claim の開示を止めます。有効だった間に発行したトークンや、そこから派生したリフレッシュチェーンも対象です。ID Token と UserInfo の両方に及びます。scope が公開する claim には影響せず、書き換え、再プロンプト、エラーも発生しません。記録された要求は残るので、再び有効にすると投影が戻ります。

## Authorization Details（RFC 9396）

`claims` パラメータは *どの claim* を ID Token / `/userinfo` に載せるかを絞り込みます。その構造化された兄弟分である RFC 9396 の `authorization_details` は、リソースサーバで *アクセストークンが何をできるか* を記述します。両者は同じマージ経路で共存し、本ライブラリは JSON 配列（`authorization_details`）と JSON オブジェクト（`claims`）を形で区別します。ただし `authorization_details` は、受理する type を登録して初めて有効になります。詳細は [Rich authorization requests](/ja/use-cases/authorization-details) を参照してください。

## 続きはこちら

- [トークン入門](/ja/concepts/tokens) — どの claim がどこに乗るか。
- [Rich authorization requests](/ja/use-cases/authorization-details) — 構造化された `authorization_details` の兄弟分。
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — JAR + claims の組み合わせ。
