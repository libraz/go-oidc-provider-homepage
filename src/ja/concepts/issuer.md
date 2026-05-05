---
title: Issuer
description: issuer URL とは何か、なぜひとつの正規形であることが重要か、本ライブラリが起動時に拒否する形は何か。
---

# Issuer

**issuer**（発行者）は OP の identity URL です。OP が署名するすべてのトークンの `iss` claim、`/.well-known/openid-configuration` の `issuer` フィールド、JWKS メタデータの帰属、さらにプロファイルによっては confidential client が署名する `client_assertion` の `aud` にまで現れます。トークン・署名鍵・discovery document を「同じ OP に属する」と紐付ける、ただひとつの文字列です。

::: tip 30 秒で頭に入れる相関図
- issuer は **URL** であって、ホスト名ではありません。`https://login.example.com` が issuer であり、`login.example.com` は issuer ではありません。
- RP は **byte 単位で完全一致** で比較します。strict な RP にとって `https://login.example.com` と `https://login.example.com/` は別物です。
- 本ライブラリは正規形でない値を黙って正規化せず、起動を拒否します。`op.WithIssuer` に渡した値が、すべての発行物が使う形になります。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token（JWT）— `iss` claim
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — OAuth 2.0 Authorization Server Metadata
- [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207) — OAuth 2.0 Authorization Server Issuer Identification
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — §3
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2（ID Token）
:::

## なぜ正規形が重要か

OIDC Discovery 1.0 §3 は、issuer 識別子を `/.well-known/openid-configuration` と **そのまま連結** して configuration URL を導出すると規定しています。RFC 9207 はさらに、認可応答に同じ `iss` をエコーすることで「混同（mix-up）攻撃」を防ぐよう要求します — 誤って配送された code が別の AS に対して使われないようにするためです。どちらのチェックも、OP と全 RP が **ひとつの** 正規表記で合意していることに依存しています。

実際のデプロイでは、よく似ているが等価でない URI が並ぶことが多いです。

| 揺れ | 例 | 何が壊れるか |
|---|---|---|
| 末尾スラッシュ | `https://idp.example.com/` vs `https://idp.example.com` | 前者では `<issuer>/.well-known/...` が `https://idp.example.com//.well-known/...` になり、configuration URL が壊れます。 |
| デフォルトポート | `https://idp.example.com:443` vs `https://idp.example.com` | OP がどちらか一方の形で `iss` を発行し、ロードバランサがもう一方に書き換えると、RP の byte 単位比較は破綻します。 |
| scheme の大文字混在 | `HTTPS://idp.example.com` | URL parser によっては parse 中に scheme を小文字化するもの・しないものがあり、生文字列を比較する RP と parse 後を比較する RP では別の issuer に見えてしまいます。 |
| host の大文字混在 | `https://Idp.Example.com` | RFC 3986 §3.2.2 / §6.2.2.1 は byte 単位比較のために host の case-folding を要求しています。folding しない RP と folding する RP では別の issuer に見えてしまいます。 |
| 非正規 path | `https://idp.example.com//oidc` や `.../a/../b` | 重複スラッシュ、`..`、`.` セグメントは `.well-known` URL を作る連結を狂わせ、byte 単位比較を破綻させます。 |
| fragment | `https://idp.example.com#main` | fragment は HTTP リクエストのルーティングに関与しません。`iss` に持たせる構造的意味がありません。 |
| query string | `https://idp.example.com?env=prod` | discovery URL の連結が壊れた形になります。仕様で禁止されています。 |

ひとつの揺れがすべての署名検証と RFC 9207 の混同防御を壊します。本番トラフィックが CDN や別ホスト名経由で OP に届くまで気付かれない、典型的な silent failure のクラスです。

## 本ライブラリが起動時に拒否する形

`op.WithIssuer` はオプション設定の段階で値を検証し、`op.New` は不正な issuer のまま起動するのではなく構成エラーを返します。現時点で施行されているルール:

- **空でない、parse 可能な URL であること**。空文字列、`url.Parse` が失敗する文字列は拒否されます。
- **絶対 URL で、authority を持つこと**。`oidc.example.com`（scheme なし）も `https:///path`（host なし）も失敗します。
- **query を持たないこと**。`?` を含む URL は拒否されます — discovery URL の連結が壊れるためです。
- **fragment を持たないこと**。`#` を含む URL は同じ理由で拒否されます。
- **path に末尾スラッシュを持たないこと**。`https://idp.example.com/` も `https://idp.example.com/oidc/` も拒否されます — issuer は configuration URL を作るためにそのまま `/.well-known/openid-configuration` と連結されるためです。
- **scheme は全て小文字であること**。`HTTPS://idp.example.com` も `HtTpS://idp.example.com` も拒否されます。検証は parse 後ではなく生入力に対しても行うので、parse 中に scheme を小文字化するパーサで揺れが見えなくなることはありません。
- **host は全て小文字であること**。`https://IDP.example.com` も `https://IDP.EXAMPLE.COM/oidc` も拒否されます。`u.Host` は生の case を保持するので、authority の中に大文字があれば検査で落ちます。
- **デフォルトポートを省略すること**。`https://idp.example.com:443`、`https://idp.example.com:443/oidc`、`http://127.0.0.1:80` は拒否されます。冗長なデフォルトポートは、ロードバランサが片側だけ正規化した瞬間に byte 一致を壊します。
- **path が canonical であること**。`..` セグメント、`.` セグメント、重複スラッシュ（`https://idp.example.com/a/../b`、`https://idp.example.com/a/./b`、`https://idp.example.com//oidc`）は拒否されます。検証は `path.Clean` を通し、round-trip しないものは弾きます。
- **`https` であること**。唯一の例外は loopback の IP リテラル（`127.0.0.0/8` と `[::1]`）で、開発時の起動が TLS なしで済むよう plain `http` を許容します。テキストの `localhost` は **例外には含まれません** — DNS hijack の対象になるため（RFC 8252 §7.3 の理由）、本番デプロイや DNS rebinding を警戒する環境では IP リテラルでの記述に矯正されます。

これらのルールをまとめて適用することで、discovery document、発行する全トークン、認可応答の `iss` パラメタにわたって `iss` が byte 完全一致になることを保証します — RFC 9207 のミックスアップ防御で RP が比較するのはこの形です。

これらをすべて通過した値が canonical な形として採用されます。渡した値が `iss` の値、discovery document 内の `issuer` フィールド、FAPI 2.0 配下の `client_assertion` audience チェックの値、すべてに使われます。

## 設定方法

```go
provider, err := op.New(
    op.WithIssuer("https://login.example.com"),
    // ... 他のオプション
)
```

マルチテナントのデプロイで subpath を使うのも問題ありません — `op.New` は issuer の path に対してすべてのエンドポイントを相対マウントします。`https://login.example.com/tenant-a` の discovery document は `https://login.example.com/tenant-a/.well-known/openid-configuration` から配信されます。末尾スラッシュのルールは subpath にも適用されます: `https://login.example.com/tenant-a` は canonical、`https://login.example.com/tenant-a/` は canonical ではありません。

::: warning デプロイの一生に渡って 1 つの値
RP がいったん issuer 文字列を保存したら、それを変えるのは破壊的変更です。最初の RP が連携する前に canonical な形を決めてください — 引退させずに済むホスト名を選ぶ、subpath の形を決める、ロードバランサに途中で host や scheme を書き換えさせない。本ライブラリは起動時の典型的なミスのほとんどを捕まえますが、TLS 終端しているプロキシが下流で path を削ったり host を小文字化していたりするのまでは捕まえられません。
:::

## 次に読む

- [認可コード + PKCE フロー](/ja/concepts/authorization-code-pkce) — RFC 9207 の `iss` エコーは canonical な issuer に依存します。
- [Redirect URI](/ja/concepts/redirect-uri) — OP が byte 単位で比較するもうひとつの URL。同じ教訓が当てはまります。
- [設計判断 — Issuer 識別子の検証](/ja/security/design-judgments#dj-9) — 上記の拒否ルールに対する明示的な根拠。
