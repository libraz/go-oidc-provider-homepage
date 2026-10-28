---
title: Pairwise subject（OIDC Core §8.1）
description: sector ごとの仮名 sub claim — プライバシ保護のマルチテナント SaaS、プロセス間で決定的に再計算でき、途中切替は禁止。
pageClass: pg-use-cases-pairwise-subject
---

# ユースケース — Pairwise subject（OIDC Core §8.1）

OP は既定で、ある一人のユーザに対してすべてのクライアントに同じ `sub` claim を発行します。2 つの RP が情報を突き合わせれば相関できます。同じ識別子を見ているからです。

OIDC Core §8.1 は **pairwise** subject 戦略を定義しています。`sub` を sector ごとに導出し、各 RP（または RP の sector）が同じユーザに対して異なる不透明識別子を見るようにします。同じユーザが 2 つの sector に存在しても、`sub` が 2 つになるため、RP 間の相関が難しくなります。

OP は `op.WithPairwiseSubject(salt)` で pairwise を提供します。

::: details public と pairwise の違い
**public** は同じユーザに対して全 RP が同じ `sub` を見るモードです。RP を全部自分で持っていて、横断的にデータを結合したい場面では便利です。**pairwise** は「sector」（典型的には RP のホスト）ごとに `sub` を書き換えるため、同じユーザでも sector ごとに別人に見えます。トレードオフはプライバシと突合しやすさで、pairwise は RP 間の相関を防ぐ反面、運用者からも「同じユーザが 2 つの RP に登録している」ことが瞬時には見えなくなります。
:::

::: details sector identifier とは
「sector」は pairwise が RP をまとめる単位です。既定では RP の redirect URI のホストが sector になり、`https://app.example.com/cb` と `https://api.example.com/cb` は別 sector になります。正当に複数ホストにまたがる RP（webapp + モバイルディープリンクのコールバック等）は `sector_identifier_uri` を公開し、そのホストを既定値の代わりに使い、その JSON 文書に sector に属する全 redirect URI を列挙します。これにより OP は、見た目の異なる 2 ホストに同じ `sub` を見せるべきだと判断できます。
:::

::: details UUIDv7 既定とは
pairwise が **無効** のとき、OP の既定 subject generator はユーザごとに新しい UUIDv7（時刻順の乱数）を発行します。UUIDv7 を選ぶ理由は、UUIDv4 と違って発行時刻でソート可能なので、ユーザテーブルのインデックスローカリティが大幅に改善されるためです。public モードはハッシュを計算せず、ユーザごとに UUID を覚えておくだけです。pairwise モードはこれを完全にバイパスし、（sector、ユーザ）ペアごとに `sub` を deterministic に再計算します。
:::

## pairwise が欲しい場面

- **マルチテナント SaaS**。各テナントが「ユーザ X が別テナント Y にも存在する」ことを知ってはいけない場合
- **プライバシ重視の deployment**。規制側が sector-bound 識別子を要求する場合（eIDAS、いくつかの国別 ID プログラム）
- **federation aggregator**。多数の下流 RP の前面に立ち、彼らに相関されたくない場合

RP がすべて first-party で（自分が全部所有していてどうせ DB を共有している）pairwise はプライバシ利益なしに摩擦だけ追加します。既定の UUIDv7 戦略を使いましょう。

## 設定

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

st := inmem.New()
loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(loginFlow),

  op.WithPairwiseSubject(pairwiseSalt), // pairwiseSalt: []byte、32 byte 以上
)
```

オプションを有効化すると:

- discovery の `subject_types_supported` に `pairwise` を追加（`public` と並列）
- クライアントが `subject_type=pairwise` で登録できる（static seed または DCR 経由）
- クライアント単位の有効化: `subject_type=public`（または未設定 → public）のクライアントは既定 UUIDv7 sub のまま。pairwise はクライアント単位であって OP 単位ではない
- opt-in したクライアントには、grant を記録するすべての grant type（認可コード、device code、CIBA、token exchange）で、ID Token、`/userinfo`、introspection のいずれにも pairwise の `sub` が出る。内部のユーザ ID は露出しない。custom grant の場合、`/userinfo` で pairwise の `sub` が出るのは、ハンドラが grant を記録したときだけ

::: warning Salt の要件
salt は 32 byte / 256 bit 以上必須です。組み込み側は KMS / Vault / Secrets Manager から引き出すべきです。ソースツリーや `.env` に焼き込まれた salt は low-trust 扱いです。deployment 間で同じ salt を使うのは意図的です。同じ salt を共有するプロセス間で pairwise sub を決定的に再計算できるためです。ただし **salt を変えると、すべての `sub` が変わります**。本ライブラリは起動時に salt の変更を検出しません（構築時の gate が守るのは後述の subject *mode* です）。issuer が存続する間、salt は変更しない前提で扱ってください。
:::

## sub の導出

OP が計算するのは:

```
sub = base64url-no-pad( SHA-256( salt || ":" || sector || ":" || internal_user_id ) )
```

::: details salt 付き SHA-256 による導出とは
SHA-256 は一方向のハッシュで、任意の入力を固定長 256 bit の値にします。逆算はできません。入力の先頭に秘密値（salt）を付けると、pairwise に必要な性質が 2 つ得られます。（1） 同じ入力からは常に同じ出力が得られるので、プロセスを再起動しても sector A における Alice の `sub` は同じ値になる。（2） salt がなければ、攻撃者が発行済みの `sub` を何件か持ち、内部ユーザ ID の推測を立てても、その推測を検証できない。区切りの `:` により、値自体にコロンが含まれていても（sector、ユーザ）の組が曖昧になりません。OP は 256 bit の出力を base64url で符号化し、JWT の `sub` 文字列に収めます。
:::

::: details salt とは
OP の全レプリカで共有する高エントロピな秘密値（256 bit 以上）です。上のハッシュへの秘密の入力で、変えるとすべての `sub` が変わります。salt を持つ者は全ユーザの全 sector に対する `sub` を再計算できるため、運用者はソースに焼き込まず KMS / Vault から引き出してください。
:::

::: details subject mode とは
「public」「pairwise」「custom」（`op.WithSubjectGenerator` で渡す generator）のいずれかです。OP は最初の構築時に、アクティブな mode をメタデータサブストアに記録します（`__op_init` sentinel と並ぶ `store.SubjectModeKey`）。以降の起動はすべて一致する必要があります。非空のストア上で戦略を切り替えると、発行済みの grant が気付かれずに別の鍵で再計算され、リフレッシュトークンのローテーションや introspection の一貫性が壊れます。そのため、不一致なら `op.New` が `ErrSubjectModeMismatch` で失敗します。メタデータサブストアを持たないストアでは検査を省略し、警告を出します。
:::

::: info OP の外で同じ導出を使う
`provider.SubjectGenerator()` は、OP の構築時に選ばれた subject generator と同じインスタンスを返します。管理画面のレポート、監査ジョブ、移行処理などで、ブラウザを `/auth` に通さず同じ `sub` を導出したい場合に使います。

ただし `WithPairwiseSubject` が有効でも、実際の発行経路はクライアント単位で分岐します。`subject_type=pairwise` のクライアントだけが pairwise 導出を使い、`public` または未設定のクライアントは既定の UUIDv7 subject を使います。OP の外で「実際に発行される `sub`」と一致させたいコードは、generator を呼ぶ前にクライアントの `SubjectType` を確認してください。
:::

`sector` は、小文字化したポートなしのホスト名で、次のとおり決まります。

1. クライアントの `sector_identifier_uri` のホスト（登録時）
2. **または** クライアントが登録した単一 redirect URI のホスト（`sector_identifier_uri` が空のとき）

redirect URI が複数のホストにまたがり、`sector_identifier_uri` を持たないクライアントは、sector を解決できません。登録（static seed なら `op.New`）の時点で拒否します。別の経路でストアに入ったレコードは、発行時に `server_error` で失敗します。複数ホストにまたがるクライアントには `sector_identifier_uri` を必須にしてください。

<figure class="fig">
  <div class="fig-head">同一ユーザ、sector ごとに異なる subject</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-pairwise-title" viewBox="0 0 960 352" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-pairwise-title">1 つの内部ユーザ ID から、RP の sector ごとに異なる subject を導出します。sector はクライアントの sector_identifier_uri から決まり、salt は OP の外に出ません。そのため 2 つの RP が同一人物を突き合わせることはできません。</title>
    <!-- inputs -->
    <rect class="fg-box" x="32" y="36" width="224" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="64">同一ユーザ</text>
    <text class="fg-mxs" x="48" y="88">internal_user_id</text>
    <rect class="fg-box fg-box--sub" x="32" y="164" width="224" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="192">salt</text>
    <text class="fg-s" x="48" y="216">KMS や Vault から取得する</text>
    <path class="fg-leader" d="M256,72 H280 M256,200 H280 M280,72 V200"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M280,72 H312" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M280,200 H312" marker-end="url(#fg-ac)"/>
    <!-- sector a -->
    <rect class="fg-box fg-box--accent" x="312" y="36" width="288" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="328" y="64">OP が sub を導出する</text>
    <text class="fg-mxs" x="328" y="88">sector = a.example.com</text>
    <path class="fg-edge fg-edge--accent" d="M600,72 H640" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="640" y="24" width="288" height="96" rx="8"/>
    <text class="fg-t2" x="656" y="52">RP A</text>
    <text class="fg-mxs" x="656" y="76">sector_identifier_uri</text>
    <text class="fg-mxs fg-accent" x="656" y="100">sub = 7bQ…Xa</text>
    <!-- sector b -->
    <rect class="fg-box fg-box--accent" x="312" y="164" width="288" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="328" y="192">OP が sub を導出する</text>
    <text class="fg-mxs" x="328" y="216">sector = b.example.com</text>
    <path class="fg-edge fg-edge--accent" d="M600,200 H640" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="640" y="152" width="288" height="96" rx="8"/>
    <text class="fg-t2" x="656" y="180">RP B</text>
    <text class="fg-mxs" x="656" y="204">sector_identifier_uri</text>
    <text class="fg-mxs fg-accent" x="656" y="228">sub = k9P…Zb</text>
    <!-- formula -->
    <rect class="fg-box fg-box--sub" x="32" y="280" width="624" height="48" rx="8"/>
    <text class="fg-m" x="48" y="310">sub = base64url( SHA-256( salt : sector : internal_user_id ) )</text>
    <rect class="fg-pill fg-pill--ok" x="696" y="288" width="232" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="812" y="309" text-anchor="middle">sub_A ≠ sub_B</text>
  </svg>
  <figcaption class="fig-note">この導出を一方向にしているのは salt です。salt が無ければ、subject と内部 ID の推測値を持つ RP がその推測を確かめられてしまいます。salt があるため、同じ導出を行えるのは OP だけで、互いに相手の subject を計算することもできません。</figcaption>
</figure>

### `sector_identifier_uri` 解決

`sub` の導出に必要なのは `sector_identifier_uri` のホストだけで、これは単なる URL のパースです。取得（fetch）が走るのは登録時の 1 回だけで、RP がその sector を管理していることを確かめるためです。OP は文書を取得し、クライアントの全 redirect URI が文書に載っていることを確認します。

- 取得は HTTPS のみで、リダイレクトは拒否します。RFC 1918、loopback、link-local のアドレスも拒否し、body は 64 KiB、リクエストは 5 秒を上限とします。
- 文書は文字列の JSON 配列 1 つで、末尾に余分な byte があってはいけません。
- 取得に成功すると 24 時間キャッシュします。失敗は 5 秒だけキャッシュし、登録が集中しても外部へのリクエストが集中しないようにします。
- キャッシュが切れたあとで文書の内容が変わっていた場合、登録は `invalid_client_metadata`（`sector_identifier_uri document changed since last fetch`）で失敗します。信頼する範囲が黙って広がることはありません。

これで sector が公開済みの manifest に紐付き、OP が監査できる形になります。

## 途中切替は拒否

grant が入っているストアで subject 戦略を切り替えると、`op.New` は `ErrSubjectModeMismatch` で失敗します。`public` から `pairwise` へ（またはその逆に）移行なしで切り替えると、発行済みの grant の `sub` がすべて気付かれずに変わります。refresh-token rotation のたびに新しい `sub` で再発行され、introspection も元のトークンと異なる識別子を返すことになります。

検査は `__op_init` sentinel（構築が成功するたびに書き込まれます）も参照します。そのため、subject mode のマーカーが手作業で消された（cleanup、TRUNCATE）ストアを再利用しても、次の `op.New` で non-public mode への切り替えは拒否されます。

検査が比較するのは mode であり、salt ではありません。戦略や salt を本当に切り替える必要があるなら、メンテナンスウィンドウを取り、発行済みの grant をすべて移行（自前の subject-mapping テーブルで再マッピング）してから、新しい戦略で OP を起動してください。別の方法として、issuer を新しく用意することもできます。

## DCR 経由のクライアント単位有効化

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

静的に登録するクライアントの場合は、`op.PublicClient` / `op.ConfidentialClient` seed に `SubjectType: "pairwise"` を設定します。`op.WithPairwiseSubject` がないと、static の `pairwise` クライアントは `op.New` が拒否します。型付き seed には `sector_identifier_uri` のフィールドがないので、static の pairwise クライアントは redirect のホストが 1 つに限られます。複数ホストにまたがるクライアントは DCR で登録してください。

## pairwise が **しない** こと

- **UserInfo を匿名化しない**。`sub` は sector 別だが、`email` / `name` / claim 値は変わらない。RP が `email` scope を要求できるなら依然 email で相関できる
- **アクティブな相関攻撃を防げない**。共謀する 2 RP は timing、IP、ブラウザ fingerprint、その他のサイドチャネルで突き合わせられる。pairwise は難度を上げるだけで、相関を不可能にはしない

::: details cross-RP correlation とは
2 つの RP が独立に認証済ユーザを観測し、情報を突き合わせて「同じ人物か」を判定する行為です。最も直接的なシグナルが `sub` で、両 RP が `sub=abc123` を見ていれば OP の側で同一人物だと分かってしまいます。pairwise はこのシグナルを取り除き、各 RP に異なる不透明識別子を見せます。RP は依然として email、電話番号、IP、ログイン時刻、ブラウザ fingerprint で相関を試みられますが、pairwise は「OP が直接鍵を渡すチャネル」だけを塞ぎます。
:::
- **multi-host クライアントには `sector_identifier_uri` 必須**。登録と `op.New` が拒否するので、本番でずれる前にセットアップの時点で気付けます

## 動かしてみる

[`examples/34-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-pairwise-saas):

```sh
(cd examples/34-pairwise-saas && GOWORK=off go run -tags example .)
```

異なる sector の 2 テナントが `A != B`（異なる sector → 異なる sub）と `A1 == A2`（同じ sector + 同じユーザ → 同じ sub）を観測し、OIDC Core §8.1 のプライバシ性と決定性の両方を満たします。ファイル: `op.go`（`WithPairwiseSubject` での OP 組み立て）、`probe.go`（2 性質の自己検証）。

## 続きはこちら

- [カスタム subject generator](/ja/reference/options#subject-戦略) — `op.WithSubjectGenerator` で完全独自の導出（pairwise でも UUIDv7 でもない）
- [DCR の組み込み](/ja/use-cases/dynamic-registration) — クライアントが `subject_type=pairwise` で自己登録する手順
