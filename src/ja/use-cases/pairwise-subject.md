---
title: Pairwise subject（OIDC Core §8.1）
description: sector ごとの仮名 sub claim — プライバシ保護のマルチテナント SaaS、プロセス間で deterministic、途中切替は禁止。
---

# ユースケース — Pairwise subject（OIDC Core §8.1）

OP は既定で、ある一人のユーザに対してすべてのクライアントに同じ `sub` claim を発行します。2 つの RP が情報を突き合わせれば correlate できます — 同じ識別子を見ているからです。

OIDC Core §8.1 は **pairwise** subject 戦略を定義しています。`sub` を sector ごとに導出し、各 RP（または RP の sector）が同じユーザに対して異なる不透明識別子を見るようにします。同じユーザが 2 つの sector に存在しても、`sub` が 2 つになる → cross-RP correlation 不可。

OP は `op.WithPairwiseSubject(salt)` で pairwise を提供します。

::: details public と pairwise の違い
**public** は同じユーザに対して全 RP が同じ `sub` を見るモードです — RP を全部自分で持っていて、横断的にデータを結合したい場面では便利です。**pairwise** は「sector」（典型的には RP のホスト）ごとに `sub` を書き換えるため、同じユーザでも sector ごとに別人に見えます。トレードオフはプライバシ vs joinability で、pairwise は cross-RP correlation を防ぐ反面、運用者からも「同じユーザが 2 つの RP に登録している」ことが瞬時には見えなくなります。
:::

::: details sector identifier とは
「sector」は pairwise が RP をまとめる単位です。既定では RP の redirect URI のホストが sector になり、`https://app.example.com/cb` と `https://api.example.com/cb` は別 sector になります。正当に複数ホストにまたがる RP（webapp + モバイルディープリンクのコールバック等）は `sector_identifier_uri` を公開し、そのホストを既定値の代わりに使い、その JSON 文書に sector に属する全 redirect URI を列挙します。これにより OP は、見た目の異なる 2 ホストに同じ `sub` を見せるべきだと判断できます。
:::

::: details UUIDv7 既定とは
pairwise が **無効** のとき、OP の既定 subject generator はユーザごとに新しい UUIDv7（時刻順の乱数）を発行します。UUIDv7 を選ぶ理由は、UUIDv4 と違って発行時刻でソート可能なので、ユーザテーブルのインデックスローカリティが大幅に改善されるためです。public モードは HMAC を使わず、ユーザごとに UUID を覚えておくだけです。pairwise モードはこれを完全にバイパスし、（sector、ユーザ）ペアごとに `sub` を deterministic に再計算します。
:::

## pairwise が欲しい場面

- **マルチテナント SaaS**。各テナントが「ユーザ X が別テナント Y にも存在する」ことを知ってはいけない場合
- **プライバシ重視の deployment**。規制側が sector-bound 識別子を要求する場合（eIDAS、いくつかの国別 ID プログラム）
- **federation aggregator**。多数の下流 RP の前面に立ち、彼らに correlate されたくない場合

RP がすべて first-party で（自分が全部所有していてどうせ DB を共有している）pairwise はプライバシ利益なしに摩擦だけ追加します。既定の UUIDv7 戦略を使いましょう。

## 設定

```go
import "github.com/libraz/go-oidc-provider/op"

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(store),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithPairwiseSubject(pairwiseSalt), // pairwiseSalt: []byte、32 byte 以上
)
```

オプションを有効化すると:

- discovery の `subject_types_supported` に `pairwise` を追加（`public` と並列）
- クライアントが `subject_type=pairwise` で登録できる（static seed または DCR 経由）
- クライアント単位のオプトイン: `subject_type=public`（または未設定 → public）のクライアントは既定 UUIDv7 sub のまま。pairwise はクライアント単位であって OP 単位ではない

::: warning Salt の要件
salt は 32 byte / 256 bit 以上必須。組み込み側は KMS / Vault / Secrets Manager から引き出すべきです。ソースツリーや `.env` に焼き込まれた salt は low-trust 扱い。deployment 間で同じ salt を使うのは意図的です — 同じ salt を共有するプロセス間で pairwise sub が deterministic になるためです。ただし **salt のローテーションは過去発行の sub を全て無効化** します。本ライブラリは異なる salt 下で発行された grant が存在する状態で起動を拒否します（構築時の subject-mode immutability gate）。
:::

## sub の導出

OP が計算するのは:

```
sub = base64url( HMAC-SHA256(salt, sector_identifier || internal_user_id) )
```

::: details HMAC-SHA256 による導出とは
HMAC は鍵付きハッシュで、秘密鍵（ここでは salt）と入力（ここでは sector + user id）を受け取り、固定長の出力を返します。ベースとなるハッシュは SHA-256 です。pairwise にとって重要な性質は 2 つあります。(1) 同じ入力からは常に同じ出力が得られるので、プロセスを再起動しても sector A における Alice の `sub` は同じ値になる、(2) salt が無ければ、攻撃者が発行済の sub を多数観測しても元の user id を逆算できない。OP は 256-bit の出力を base64url で符号化し、JWT の `sub` 文字列スロットに収めます。
:::

::: details salt とは
OP の全レプリカで共有する高エントロピな秘密値（256 bit 以上）です。HMAC の鍵素材になります。salt をローテーションすると過去発行の `sub` がすべて無効化されるため、本ライブラリは別の salt 下で発行された grant が存在する状態での起動を拒否します。運用者は salt をソースに焼き込まず KMS / Vault から引き出してください — salt を持つ者は全ユーザの全 sector に対する `sub` を再計算できます。
:::

::: details subject mode とは
「public」または「pairwise」のいずれかです。OP は最初の構築時にメタデータサブストア（`__op_init` sentinel）でアクティブな subject mode を記録します。以降の起動はすべて一致する必要があります。非空のストア上で戦略を切り替えると、発行済の grant が静かに rekey され、リフレッシュトークンのローテーションや JWT introspection の一貫性が壊れます。途中切替は構成エラーとして hard に拒否されます。
:::

`sector_identifier` は:

1. クライアントの `sector_identifier_uri` のホスト（登録時）
2. **または** クライアントが登録した単一 redirect URI のホスト（URI が空のとき）

複数 redirect-URI ホストを持ち `sector_identifier_uri` を持たないクライアントは sector を解決できず、issuance が `server_error` で失敗します。複数ホストへ fan-out するクライアントには `sector_identifier_uri` を必須にしてください。

### `sector_identifier_uri` 解決

クライアントが `sector_identifier_uri` を登録すると、OP がそれを取得し(HTTPS のみ、RFC 1918 / loopback / link-local は拒否、リダイレクト先を再検証、body サイズと timeout に上限、24 時間の成功キャッシュ)、クライアントの全 redirect URI が文書にリストされていることを確認します。これにより sector が公開済みの manifest に紐付き、OP が監査できる形になります。

## 途中切替は拒否

非空の grant store が存在する状態で subject 戦略を切り替えると、本ライブラリは起動を拒否します。`public` から `pairwise` への(またはその逆の)切替を salt 対応の移行なしで行うと、過去発行の grant がすべて気付かれずに鍵替えされ、refresh-token rotation のたびに新しい `sub` で再発行され、JWT introspection が元のトークンと異なる識別子を返すことになります。

構築時の subject-mode 不変性ゲートは、metadata サブストアの `__op_init` センチネル(構築が成功するたびに書き込まれる)も参照します。そのため subject-mode マーカが手動で消去(cleanup、TRUNCATE)された store を再利用しても、次の `op.New` 呼び出しで non-public への切替が拒否されます。

本当に移行が必要な場合は、メンテナンスウィンドウを取り、発行済みの grant をすべて移行(自前の subject-mapping テーブルで再マッピング)してから、新しい戦略で OP を起動してください。

## DCR 経由のクライアント単位オプトイン

`op.WithPairwiseSubject` 有効化後、dynamic-registration mount は inbound RFC 7591 メタデータの `"subject_type": "pairwise"` を受理します。オプション無しの場合、登録は pairwise を `invalid_client_metadata` で拒否します。

```sh
curl -s -X POST \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "Tenant A",
    "redirect_uris": ["https://tenant-a.example.com/cb"],
    "subject_type": "pairwise",
    "sector_identifier_uri": "https://tenant-a.example.com/sectors.json"
  }' \
  https://op.example.com/oidc/register
```

静的に provision するクライアントの場合は、`op.PublicClient` / `op.ConfidentialClient` seed の対応フィールドに直接設定します。

## pairwise が **しない** こと

- **UserInfo を anonymise しない**。`sub` は sector 別だが、`email` / `name` / claim 値は変わらない。RP が `email` scope を要求できるなら依然 email で correlate できる
- **アクティブな correlation 攻撃を防げない**。共謀する 2 RP は timing、IP、ブラウザ fingerprint、その他のサイドチャネルで突き合わせられる。pairwise はバーを上げるだけで、correlation を不可能にはしない

::: details cross-RP correlation とは
2 つの RP が独立に認証済ユーザを観測し、情報を突き合わせて「同じ人物か」を判定する行為です。最も直接的なシグナルが `sub` で、両 RP が `sub=abc123` を見ていれば OP の側で同一人物だと分かってしまいます。pairwise はこのシグナルを取り除き、各 RP に異なる不透明識別子を見せます。RP は依然として email、電話番号、IP、ログイン時刻、ブラウザ fingerprint で correlate を試みられますが、pairwise は「OP が直接鍵を渡すチャネル」だけを塞ぎます。
:::
- **multi-host クライアントには `sector_identifier_uri` 必須**。OP は issuance を拒否するので、production で drift する前に boot で気付ける

## 動かしてみる

[`examples/33-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-pairwise-saas):

```sh
go run -tags example ./examples/33-pairwise-saas
```

異なる sector の 2 テナントが `A != B`（異なる sector → 異なる sub）と `A1 == A2`（同じ sector + 同じユーザ → 同じ sub）を観測し、OIDC Core §8.1 のプライバシ性と determinism 性の両方を満たします。ファイル: `op.go`（`WithPairwiseSubject` での OP 組み立て）、`probe.go`（2 性質の self-verify）。

## 続きはこちら

- [カスタム subject generator](/ja/reference/options#subject-戦略) — `op.WithSubjectGenerator` で完全独自の導出（pairwise でも UUIDv7 でもない）
- [DCR の組み込み](/ja/use-cases/dynamic-registration) — クライアントが `subject_type=pairwise` で自己登録する手順
