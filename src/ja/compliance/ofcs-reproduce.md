---
title: OFCS 再現レシピ
description: OpenID Foundation Conformance Suite を go-oidc-provider に対して走らせる手順 — どのプランがどの op-demo フラグに対応するか、関連する実装はどこにあるか、baseline をキャプチャして regression diff を取る方法。
---

# OFCS 再現レシピ

このページは運用者向けの runbook です。[OFCS 適合状況](/ja/compliance/ofcs)が「最新の実行で何が観測されたか」を記録するのに対し、本ページは「自分のマシンでそれを再現するには」「各 OFCS プランがどの `op.With...` オプションを使うか」を扱います。

最新の PASS / REVIEW / SKIPPED 件数を確認したい場合は、まず [OFCS 適合状況](/ja/compliance/ofcs) を参照してください。自分の OP に同じ OFCS プランを通すためにどのオプションを組み込めばよいかを知りたい場合は、本ページが該当します。

::: warning 個人開発、認証取得は無し
本サイトの数値は再現可能なスナップショットであり、本ページはその再現手順を扱います。これは有償の OpenID Foundation 認証の代替ではありません。ローカルでスイートを走らせて自分の組み込みを検証する用途には使えますが、ローカルの PASS 数を認証として引用しないでください。
:::

## 前提

- **Docker** + Compose v2(ハーネスは `docker compose` を呼び出します。`docker-compose` ではありません)
- **OpenSSL**(`scripts/conformance.sh certs` の証明書生成に使用)
- `go.mod` に固定された **Go toolchain**
- seed-plans / drive スクリプト用の `curl` と `python3`

OFCS イメージは [`conformance/docker-compose.yml`](https://github.com/libraz/go-oidc-provider/blob/main/conformance/docker-compose.yml) で固定された tag を OpenID Foundation の registry から pull します。OFCS の checkout や `mvn install` は不要です。

## ワンコマンドでのクイックスタート

[`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider) の clean clone から:

```sh
make conformance-up
```

このターゲットは 4 ステップを順に実行します。

1. `scripts/conformance.sh certs` — OP listener 用の自己署名 RSA-2048 証明書(`localhost` + `host.docker.internal` をカバー)、FAPI 2.0 mtls / mtls2 plan slot が使うクライアント証明書ペア、OFCS コンテナがマウントして OP を信頼するための JKS truststore を生成します。
2. `scripts/conformance.sh ofcs-up` — `docker compose up -d` で OFCS コンテナを起動し、`https://localhost:8443` の応答を待ちます。
3. `scripts/conformance.sh op-up` — `cmd/op-demo` をビルドして `https://127.0.0.1:9443` で起動し、スイートが使う全プランの redirect URI を seed します。
4. `scripts/conformance.sh seed-plans` — `conformance/plans/` の各プランテンプレートを OFCS REST API に POST し、生成された plan ID を出力します。

OFCS state を保持する mongo volume も含めてすべて停止する場合は:

```sh
make conformance-down
```

## プラン、op-demo フラグ、有効化される実装

OFCS テストプランによって検証するライブラリ機能が異なります。下表は各プランに対し、対応する `cmd/op-demo` の起動方法と、そのプロファイルが有効化する `op.With...` オプションを通読できる該当ソースファイルを対応づけたものです。

| OFCS プラン | `op-demo` 起動 | 該当ソース |
|---|---|---|
| `oidcc-basic-certification-test-plan` | `make conformance-op-up`(プロファイル無し) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `commonOptions` |
| `oidcc-config-certification-test-plan` | `make conformance-op-up`(プロファイル無し) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `commonOptions` |
| `oidcc-dynamic-certification-test-plan` | `OP_ENABLE_DCR=1 make conformance-op-up` | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `op.WithDynamicRegistration` 分岐 |
| `oidcc-formpost-basic-certification-test-plan` | `make conformance-op-up`(プロファイル無し) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-rp-initiated-logout-certification-test-plan` | `OP_ENABLE_DCR=1 make conformance-op-up` | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-rp-initiated-logout-with-back-channel-logout-certification-test-plan` | `OP_ENABLE_DCR=1 make conformance-op-up` | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `fapi2-security-profile-id2-test-plan` | `OP_PROFILE=fapi2-baseline make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2BaselineOptions` |
| `fapi2-message-signing-id1-test-plan` | `OP_PROFILE=fapi2-message-signing make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2MessageSigningOptions` |
| `fapi-ciba-id1-test-plan` | `OP_PROFILE=fapi-ciba make conformance-op-up` | [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go) — `fapiCIBAOptions` |

`cmd/op-demo/` 配下の各プロファイルファイルは冒頭にコメントブロックを持ち、そのプロファイルが有効化するオプション、各オプションが満たす仕様セクション、その実装が対象としている OFCS module を列挙しています。自分の OP にパターンを取り込む前に、走らせるプランに対応するファイルを通読してください。

## 自分の OP に組み込むもの

`cmd/op-demo/` 配下のプロファイル別ファイルが正典の実装リファレンスです。以下のセクションは内容を要約したもので、自分の組み込みと照らし合わせる際の参考にしてください。

### OIDC Core 1.0(basic / config / formpost / RP-initiated logout)

vanilla プロファイルは `op.WithProfile` の呼び出しが不要です。基本オプションは `cmd/op-demo/main.go` の `commonOptions` にまとまっており、すべてのプランに共通します。

- `op.WithIssuer(...)` — discovery と ID token が広告する issuer URL。
- `op.WithStore(...)` — ストレージ adapter(demo は `op/storeadapter/inmem`、本番は sql / redis adapter を使う想定)。
- `op.WithKeyset(...)` — 署名 keyset。
- `op.WithCookieKeys(...)` — cookie 暗号化用の AEAD 鍵。
- `op.WithMountPrefix(...)` — OP handler を mount する URL prefix。
- `op.WithStaticClients(...)` — seed クライアント(public + confidential trio)。
- `op.WithLoginFlow(...)` — login orchestration。demo は `op.PrimaryPassword` を使用。
- `op.WithFeature(feature.JAR)` — 非 FAPI プロファイル向けにオプトインで JAR を有効化。OFCS の request-object module が pass / skip のいずれかにきれいに分岐します。
- `op.WithClaimsSupported(...)` — discovery が広告する claim 一覧。

dynamic 系プラン(`oidcc-dynamic`、`*-rp-initiated-logout-*`)では `op.WithDynamicRegistration(op.RegistrationOption{...})` を追加して `/register` を mount し、起動時に Initial Access Token を発行します。demo は IAT を stdout に出力しますが、本番では secret manager に渡し、log に出さないでください。

### FAPI 2.0 Baseline

`op-demo` 起動時に `OP_PROFILE=fapi2-baseline` を設定します。`fapi2BaselineOptions` がまとめている profile 固有の追加項目は次のとおりです。

- `op.WithProfile(profile.FAPI2Baseline)` — PAR(RFC 9126)、JAR(RFC 9101)、FAPI alg 制限を自動有効化します。
- `op.WithFeature(feature.DPoP)` — 送信者制約付きトークン。FAPI 2.0 §3.1.4 は DPoP **OR** mTLS を要求しますが、demo は OFCS テンプレートが fapi2-* プランに対して `sender_constrain=dpop` を ship しているため DPoP を選択しています。

demo は OFCS テストクライアントの公開鍵を保持する `op.PrivateKeyJWTClient` を 2 件(`demo-fapi`、`demo-fapi-2`)seed します。対応する秘密鍵は [`conformance/plans/fapi2-*.json`](https://github.com/libraz/go-oidc-provider/tree/main/conformance/plans) に置かれており、OFCS が `private_key_jwt` assertion の署名に使用します。

各オプションの詳細は [Concepts → FAPI](/ja/concepts/fapi)、[Concepts → DPoP](/ja/concepts/dpop)、[Use case: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を参照してください。

### FAPI 2.0 Message Signing

`OP_PROFILE=fapi2-message-signing` を設定します。Baseline がやることに加えて:

- `op.WithProfile(profile.FAPI2MessageSigning)` — PAR / JAR / alg 制限の上に JARM(署名 authorization response)を自動有効化します。
- `op.WithFeature(feature.DPoP)` — Baseline と同じ送信者制約。
- `op.WithDPoPNonceSource(...)` — FAPI 2.0 Message Signing §5.3.4 はサーバ供給の DPoP nonce を必須としています。このプロファイルで source が組み込まれていない場合、option layer は `op.New` を拒否します。demo は in-memory rotator を使用しますが、マルチインスタンスの OP では共有ストアで source を裏付けてください。

### FAPI-CIBA

`OP_PROFILE=fapi-ciba` を設定します。CIBA は fapi2-* プランと比較して 3 点で大きく異なります。

- OFCS の `fapi-ciba-id1` プランは FAPI 1.0 由来の cert-bound access token 要件をハードコードしており、sender-constraint variant を提供しません。そのため demo は `feature.DPoP` ではなく `op.WithFeature(feature.MTLS)` を組み込みます。どちらも `WithProfile` の "DPoP OR MTLS" 選言制約を満たします。
- CIBA クライアントは `/authorize` を訪れません。seed は空の `redirect_uri` 集合と絞り込まれた grant 一覧(CIBA URN + `refresh_token`)を持ちます。
- OFCS プランは認証デバイスが実在しない状態で `auth_req_id` ポーリングループを実行します。demo は in-memory `CIBARequestStore` を `cibaAutoApproveStore` でラップし、設定可能な遅延後に out-of-band の `Approve()` をスケジュールしてデバイスコールバックをシミュレーションします。**本番組み込みでは、ユーザの実際の認証デバイスのコールバックから `Approve` を呼び出す必要があります。OP プロセス内部から呼び出してはなりません。**

実装の全体(auto-approve substore と hint resolver を含む)は [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go) に置かれています。

## 実行方法

スタックを起動してプランを seed したら、3 通りの方法で module を実行できます。

### ブラウザ駆動の単一フロー

OFCS UI から特定の module を反復確認するときに有用です。

```sh
scripts/conformance.sh drive 'https://host.docker.internal:9443/oidc/authorize?...'
```

OFCS のテスト詳細パネルが出力する `Browser` URL をコピーします。

### 複数 module を一括実行

`seed-plans` が出力する plan ID を渡します。

```sh
scripts/conformance.sh batch <plan-id> oidcc-server oidcc-userinfo-get ...
```

batch サブコマンドは module 名から適切な driver hint を選択します(例: `*user-rejects-authentication*` 系では `OFCS_DRIVE_REJECT=1` を立てて demo に同意キャンセルを行わせます)。

### 全プランの全 module

```sh
make conformance-baseline LABEL=local-check
```

seed されたすべてのプランの全 module を実行し、`conformance/baselines/<UTC-date>-local-check.json` に決定的な JSON snapshot を書き出します。リファクタが既存 baseline に対して regression を起こしていないか検証する用途で使います。

## 結果の読み方

OFCS の終端状態は 4 つです。

- **PASSED** — module を実行し、仕様が要求する挙動を観測。
- **REVIEW** — module は実行されたが、視覚的 / out-of-band の挙動(同意 UI 文言、エラーページのスクリーンショット)を人間のレビュアーが確認する必要があります。failure ではありません。ヘッドレスハーネスは `REVIEW` をそのまま記録します。有償認証ではこれを clear するために OFCS UI に向かう必要があります。
- **SKIPPED** — module は OP が discovery / per-client metadata で広告していない機能に依存します。例えば、クライアント metadata が `PS256` を署名 alg として宣言している場合、`RS256` ネガティブテストはそのプローブが対象外なため skip されます。failure ではありません。
- **FAILED** — 観測された挙動が仕様と乖離。最新スナップショットでは全プラン通じて **FAILED 0 件** を記録しています。詳細は [OFCS 適合状況](/ja/compliance/ofcs#最新-baseline) を参照してください。

REVIEW / SKIPPED の各 module がどれで、なぜそうなっているかの詳細は [OFCS 適合状況](/ja/compliance/ofcs#review-中の-modules) にあります。

## baseline のキャプチャと差分取得

ハーネスは「現状を凍結し、変更が baseline に対して regression を起こさないか検証する」サイクルを中心に組まれています。

```sh
make conformance-up
make conformance-baseline LABEL=pre-change

# … 変更を加える …

make conformance-baseline LABEL=post-change
make conformance-baseline-diff \
    BASELINE_OLD=conformance/baselines/<utc>-pre-change.json \
    BASELINE_NEW=conformance/baselines/<utc>-post-change.json
```

`baseline-diff` は、2 つのスナップショット間で **PASSED を失った** module が 1 つでもあれば非 0 で終了します。diff は module を次に分類します。

- **regressions** — `PASSED` から非 `PASSED` への遷移(ゲート対象)。
- **fixes** — 非 `PASSED` から `PASSED` への遷移。
- **non-pass churn** — どちらも非 `PASSED` だが状態が異なる(例: REVIEW → SKIPPED)。
- **catalog drift** — module が片方のスナップショットにしか存在しない(OFCS pin を bump したときに典型的に発生)。

snapshot ファイルは gitignore 対象です。環境固有の瞬間を記録するため、マシン / OFCS リリース間でのちらつきが大きいからです。標準のスナップショットを 1 つ保持したい場合は、`conformance/baselines/` の下からコピーアウトして自分で commit するパスに置いてください。

module 一覧は実行時に OFCS から問い合わせるため、OFCS リリース間の catalog drift は自動的に捕捉されます。サブセットだけを baseline 化したい場合は `BASELINE_FILTER` に正規表現を渡します。

```sh
BASELINE_FILTER='^oidcc-' make conformance-baseline LABEL=oidcc-only
```

## OFCS pin の更新

`conformance/docker-compose.yml` の `IMAGE_TAG` が canonical な pin です。前進させるには:

```sh
IMAGE_TAG=release-vX.Y.Z make conformance-up
```

OFCS のテストロジックはリリース間で drift します(module rename、condition 厳格化、新しい variant)。bump 後は各プランの baseline を再キャプチャし、前回との差分を取ってください。新しい SKIPPED / REVIEW 行は通常 catalog rename であって regression ではありません。regression として扱う前に rename された module の意図を確認してください。

## 自分の OP への取り込み

`cmd/op-demo/` のプロファイル別ファイルは意図的に小さく、コメントを充実させてあります。組み込み側にそのまま構造を持ち込めるようになっています。

- [Concepts → FAPI](/ja/concepts/fapi) — `op.WithProfile(profile.FAPI2Baseline)` が実際に何を変えるか。
- [Concepts → DPoP](/ja/concepts/dpop) — DPoP がアクセストークン発行パスにどう組み込まれるか。
- [Concepts → mTLS](/ja/concepts/mtls) — `feature.MTLS` がクライアント証明書を抽出して `cnf.x5t#S256` を生成する仕組み。
- [Use case: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — Baseline 対応 deployment 向けの組み込みウォークスルー。

本番組み込みでは `cmd/op-demo` の暫定要素(in-memory store、ephemeral 署名鍵、auto-approve CIBA wrapper)を vault-backed 鍵、durable storage adapter、実際のデバイスコールバックパスに置き換えます。`op.With...` の形は同じままです。

## 明示しておく制限事項

- **plan suite version。** pin は `conformance/docker-compose.yml` で設定されています。新しい OFCS リリースで追加 / rename された module は、pin を bump するまでカバーされません。
- **headless drive。** drive スクリプトは OFCS REST surface を reverse-engineering したものです。OFCS は documentation していません。挙動は固定リリースに対してのみ確認しています。
- **実 RP 証明書なし。** mTLS plan slot は `conformance/certs/` に生成された自己署名証明書を使い、プランの instantiation を可能にしています。実 CA chain は検証していません。
- **単一 OP インスタンス。** クロスインスタンスの挙動(共有ストアを介した 2 つの OP 間での token introspection 等)は OFCS ではなく `test/scenarios/` 配下の Spec Scenario Suite で検証しています。
