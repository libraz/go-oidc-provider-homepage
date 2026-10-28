---
title: Issuer
description: issuer URL とは何か、なぜひとつの正規形であることが重要か、本ライブラリが起動時に拒否する形は何か。
---

# Issuer

**issuer**（発行者）は OP を識別する URL です。同じ文字列が、次の 3 か所に同時に現れます。

- OP が署名するすべてのトークンの `iss` claim
- すべての認可応答の `iss` パラメータ（RFC 9207）
- [discovery 文書](/ja/concepts/discovery)の `issuer` フィールド

confidential client が認証用に署名する `client_assertion` の `aud` にも使えます。トークン・署名鍵・discovery 文書を「同じ OP に属する」と結び付ける、ただひとつの文字列です。

::: tip 30 秒でつかむ要点
- issuer は **URL** であって、ホスト名ではありません。`https://login.example.com` が issuer であり、`login.example.com` は issuer ではありません。
- RP は **byte 単位で完全一致** で比較します。厳密な RP にとって `https://login.example.com` と `https://login.example.com/` は別物です。
- 本ライブラリは正規形でない値を黙って正規化せず、起動を拒否します。`op.WithIssuer` に渡した文字列が、発行するすべてのトークンと文書にそのまま入ります。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token（JWT）— `iss` claim
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — OAuth 2.0 Authorization Server Metadata
- [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207) — OAuth 2.0 Authorization Server Issuer Identification
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — §3
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2（ID トークン）
:::

## なぜ正規形が重要か

OIDC Discovery 1.0 §4 は、issuer 末尾のスラッシュを除いたうえで `/.well-known/openid-configuration` を連結して設定 URL を導出します。RFC 9207 はさらに、OP がすべての認可応答に同じ `iss` を載せることで、別の認可サーバから届いた code を取り違えて使う「混同（mix-up）攻撃」を検出できるようにしています。どちらのチェックも、OP と全 RP が **ひとつの** 正規表記で合意していることが前提です。

実際のデプロイでは、よく似ているが等価でない URI が並ぶことがよくあります。

| 揺れ | 例 | 何が壊れるか |
|---|---|---|
| 末尾スラッシュ | `https://idp.example.com/` vs `https://idp.example.com` | discovery は URL の導出時に末尾のスラッシュを除きますが、issuer の文字列としては別物です。本ライブラリは後者だけを受け付けます。 |
| 既定ポート | `https://idp.example.com:443` vs `https://idp.example.com` | OP が一方の形で `iss` を発行し、ロードバランサがもう一方に書き換えると、RP の byte 単位比較が失敗します。 |
| scheme の大文字混在 | `HTTPS://idp.example.com` | parse 中に scheme を小文字化する URL パーサとしないパーサがあり、生文字列を比較する RP と parse 後を比較する RP では別の issuer に見えます。 |
| host の大文字混在 | `https://Idp.Example.com` | ホスト名の解決では大文字小文字を区別しませんが、文字列の完全一致は区別します。host の正規化がコンポーネントごとに異なると食い違います。 |
| 非正規 path | `https://idp.example.com//oidc` や `.../a/../b` | path を正規化するコンポーネントとそのまま保持するコンポーネントで issuer 文字列が食い違います。本ライブラリはこれらの形を拒否します。 |
| fragment | `https://idp.example.com#main` | fragment は HTTP リクエストに含まれないため、`iss` に持たせても意味がありません。 |
| query string | `https://idp.example.com?env=prod` | well-known の suffix を連結すると不正な URL になります。仕様で禁止されています。 |

表記の食い違いは RFC 9207 のミックスアップ検証を含む issuer の完全一致チェックを失敗させますが、JWT の署名そのものは無効になりません。本番トラフィックが CDN や別ホスト名経由で OP に届くまで気付かれにくい失敗です。

## 本ライブラリが起動時に拒否する形

`op.New` は構築時の検証パスで issuer を検査し、不正な値のまま起動せずエラーを返します。ルールは次のとおりです。

- **空でない、parse 可能な URL であること**。空文字列、`url.Parse` が失敗する文字列は拒否されます。
- **絶対 URL で、authority を持つこと**。`oidc.example.com`（scheme なし）も `https:///path`（host なし）も失敗します。
- **query を持たないこと**。`?` を含む URL は拒否されます。discovery URL が不正になるためです。
- **fragment を持たないこと**。`#` を含む URL は同じ理由で拒否されます。
- **末尾スラッシュを持たないこと**。`https://idp.example.com/` も `https://idp.example.com/oidc/` も拒否されます。issuer は well-known の suffix と連結されるため、末尾スラッシュがあると同じ文書に対して非正規のもうひとつの綴りが生まれます。
- **scheme は全て小文字であること**。`HTTPS://idp.example.com` も `HtTpS://idp.example.com` も拒否されます。検証は生入力に対して行うので、scheme を小文字化するパーサで揺れが隠れることはありません。
- **host は全て小文字であること**。`https://IDP.example.com` も `https://IDP.EXAMPLE.COM/oidc` も拒否されます。`u.Host` は生の case を保持するので、authority の中に大文字があれば検査で落ちます。
- **既定ポートを省略すること**。`https://idp.example.com:443`、`https://idp.example.com:443/oidc`、`http://127.0.0.1:80` は拒否されます。冗長な既定ポートは、ロードバランサが片側だけ正規化した瞬間に byte 一致を壊します。
- **path が正規形であること**。`..` セグメント、`.` セグメント、重複スラッシュ（`https://idp.example.com/a/../b`、`https://idp.example.com/a/./b`、`https://idp.example.com//oidc`）は拒否されます。検証は `path.Clean` を通し、round-trip しないものは弾きます。
- **`https` であること**。唯一の例外は loopback の IP リテラル（`127.0.0.0/8` と `[::1]`）で、開発時の起動が TLS なしで済むよう plain `http` を許容します。テキストの `localhost` は例外に **含まれません**。DNS で解決される名前は乗っ取られる可能性があるためです（RFC 8252 §8.3）。`op.WithAllowLocalhostLoopback()` を使うと `localhost` を明示的に許可できます。ローカルで passkey を扱う場合はこれが必要です。WebAuthn の Relying Party ID はドメインでなければならず、`127.0.0.1` の issuer には対にできる RP ID が存在しないからです。開発マシンの中だけで使ってください。このオプションで判定結果が変わるため、issuer の検証は `WithIssuer` の中ではなく `op.New` の検証パスで走り、オプションを渡す順序は結果に影響しません。

これらのルールにより、`iss` は discovery 文書、発行する全トークン、認可応答の `iss` パラメータで byte 完全一致になります。RFC 9207 のミックスアップ防御で RP が比較するのはこの形です。

検査を通過した値は、そのまま `iss`、discovery 文書の `issuer`、そして本ライブラリが受け付ける `client_assertion` の `aud` の一つとして使われます。FAPI 2.0 Security Profile §5.3.2.1(8) が認めるのは issuer 識別子の JSON 文字列だけですが、ライブラリはトークンエンドポイント URL や配列も受け付けます。そのため、FAPI のプリセットを有効にしただけでは `client_assertion` の扱いが Final 仕様に適合したことにはなりません。詳細は[設計判断 — `client_assertion` の audience](/ja/security/design-judgments#dj-13) を参照してください。

## 設定方法

```go
provider, err := op.New(
    op.WithIssuer("https://login.example.com"),
    // ... 他のオプション
)
```

`op.New` は、上の表にある不正な綴りを拒否します。

```go
// 拒否される: host の大文字、既定ポート、末尾スラッシュが byte 一致を壊す
op.WithIssuer("https://IDP.example.com:443/oidc/")

// 受理される: 正規形をひとつに固定する
op.WithIssuer("https://idp.example.com/oidc")
```

マルチテナントのデプロイでは subpath の issuer も使えます。issuer の path は単なるメタデータではなく公開エンドポイントの名前空間の一部なので、`op.New` はすべてのプロトコルハンドラを issuer の path とその後ろの mount prefix（既定は `/oidc`）の下に mount します。issuer が `https://login.example.com/tenant-a` なら、トークンエンドポイントは `/tenant-a/oidc/token` になります。

例外は discovery 文書で、ここは取り違えやすい箇所です。OpenID Connect Discovery 1.0 §4 は well-known の suffix を issuer の後ろに連結すると定め、RFC 8414 §3 は **host と issuer の path のあいだ** に挿入すると定めています。本ライブラリは同じ文書を両方の URL で、mount prefix の外側に公開します。

| | URL |
|---|---|
| issuer | `https://login.example.com/tenant-a` |
| discovery 文書（OIDC Discovery 1.0 §4） | `https://login.example.com/tenant-a/.well-known/openid-configuration` |
| discovery 文書（RFC 8414 §3） | `https://login.example.com/.well-known/openid-configuration/tenant-a` |
| トークンエンドポイント | `https://login.example.com/tenant-a/oidc/token` |

discovery をたどる RP がこの違いに気付くことはありませんが、proxy のルールを手で書く運用者は両方の discovery パスを通す必要があります。エンドポイントの上書きが issuer の path 側の形と衝突すると、`op.New` は失敗します。末尾スラッシュのルールは subpath にも適用されます。`https://login.example.com/tenant-a` は正規形、`https://login.example.com/tenant-a/` は正規形ではありません。

::: warning デプロイの存続期間を通じて 1 つの値
RP がいったん issuer 文字列を保存したら、変更はすべて RP を壊します。最初の RP が連携する前に正規形を決めてください。手放さずに済むホスト名を選び、subpath の形を決め、ロードバランサに途中で host や scheme を書き換えさせないことです。本ライブラリは起動時の典型的なミスのほとんどを捕まえますが、TLS を終端するプロキシが下流で path を削ったり host を小文字化したりするのは検出できません。
:::

## 次に読む

- [認可コード + PKCE フロー](/ja/concepts/authorization-code-pkce) — RFC 9207 の `iss` エコーは正規形の issuer に依存します。
- [Discovery](/ja/concepts/discovery) — `issuer` と各エンドポイント URL を載せる文書。
- [Redirect URI](/ja/concepts/redirect-uri) — OP が byte 単位で比較するもうひとつの URL。同じ教訓が当てはまります。
- [設計判断 — Issuer 識別子の検証](/ja/security/design-judgments#dj-9) — 上記の拒否ルールに対する明示的な根拠。
