---
title: OFCS 再現レシピ
description: OpenID Foundation Conformance Suite を go-oidc-provider に対して実行する手順 — どのプランがどの op-demo フラグに対応するか、関連する実装はどこにあるか、ベースラインをキャプチャして回帰差分を取る方法。
pageClass: pg-compliance-ofcs-reproduce
---

# OFCS 再現レシピ

このページは運用者向けの runbook です。[OFCS 適合状況](/ja/compliance/ofcs)が「最新の実行で何が観測されたか」を記録するのに対し、本ページは「自分のマシンでそれを再現するには」「各 OFCS プランがどの `op.With...` オプションを使うか」を扱います。

適合状況ページは、リリースタグ直前に取得した保持済みのリリース相当 run を要約しています。core のコミット [`8ee7ca3`](https://github.com/libraz/go-oidc-provider/commit/8ee7ca36ef45fb4a1ee01eb44728d5e9db907bdd) で `2026-09-28T13:43:49Z` に取得しました。この run はリリースタグ直前に測定したため、OFCS `release-v5.3.1` と同等のリリース相当結果として扱います。JSON snapshot はローカルの gitignore 対象 release artifact で、OFCS のイメージ tag や digest は記録していません。現在の `conformance/docker-compose.yml` の既定 pin は `release-v5.3.1` です。

最新の PASS / REVIEW / SKIPPED / WARNING 件数を確認したい場合は、まず [OFCS 適合状況](/ja/compliance/ofcs) を参照してください。自分の OP に同じ OFCS プランを通すためにどのオプションを組み込めばよいかを知りたい場合は、本ページが該当します。

::: warning 個人開発、認証取得は無し
本サイトの数値は再現可能なスナップショットであり、本ページはその再現手順を扱います。これは有償の OpenID Foundation 認証の代替ではありません。ローカルでスイートを実行して自分の組み込みを検証する用途には使えますが、ローカルの PASS 数を認証として引用しないでください。
:::

<figure class="fig">
  <div class="fig-head">実行を再現する手順</div>
  <svg class="fig-svg" role="img" aria-labelledby="ofcs-repro-title" viewBox="0 0 960 148" xmlns="http://www.w3.org/2000/svg">
    <title id="ofcs-repro-title">適合テストの実行を再現する 6 手順。証明書を生成し、適合スイートを起動し、対象プロファイルでデモ用 OP を起動し、プランを登録し、実行し、記録済みのベースラインと差分を取ります。</title>
    <rect class="fg-box" x="36" y="40" width="138" height="84" rx="8"/>
    <circle class="fg-badge" cx="54" cy="60" r="9"/>
    <text class="fg-badge-t" x="54" y="63" text-anchor="middle">1</text>
    <text class="fg-t2" x="52" y="90">証明書を生成</text>
    <text class="fg-mxs" x="52" y="110">make certs</text>
    <path class="fg-edge fg-edge--thin" d="M178,82 H186" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="190" y="40" width="138" height="84" rx="8"/>
    <circle class="fg-badge" cx="208" cy="60" r="9"/>
    <text class="fg-badge-t" x="208" y="63" text-anchor="middle">2</text>
    <text class="fg-t2" x="206" y="90">OFCS を起動</text>
    <text class="fg-mxs" x="206" y="110">docker compose</text>
    <path class="fg-edge fg-edge--thin" d="M332,82 H340" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="344" y="40" width="138" height="84" rx="8"/>
    <circle class="fg-badge fg-badge--accent" cx="362" cy="60" r="9"/>
    <text class="fg-badge-t fg-badge-t--accent" x="362" y="63" text-anchor="middle">3</text>
    <text class="fg-t2 fg-accent" x="360" y="90">op-demo を起動</text>
    <text class="fg-xs" x="360" y="110">対象プロファイルを指定して</text>
    <path class="fg-edge fg-edge--thin" d="M486,82 H494" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="498" y="40" width="138" height="84" rx="8"/>
    <circle class="fg-badge" cx="516" cy="60" r="9"/>
    <text class="fg-badge-t" x="516" y="63" text-anchor="middle">4</text>
    <text class="fg-t2" x="514" y="90">プランを登録</text>
    <text class="fg-mxs" x="514" y="110">seed-plans</text>
    <path class="fg-edge fg-edge--thin" d="M640,82 H648" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="652" y="40" width="138" height="84" rx="8"/>
    <circle class="fg-badge" cx="670" cy="60" r="9"/>
    <text class="fg-badge-t" x="670" y="63" text-anchor="middle">5</text>
    <text class="fg-t2" x="668" y="90">実行</text>
    <text class="fg-xs" x="668" y="110">9 本すべてを無人で</text>
    <path class="fg-edge fg-edge--thin" d="M794,82 H802" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="806" y="40" width="118" height="84" rx="8"/>
    <circle class="fg-badge" cx="824" cy="60" r="9"/>
    <text class="fg-badge-t" x="824" y="63" text-anchor="middle">6</text>
    <text class="fg-t2" x="822" y="90">差分を取る</text>
    <text class="fg-xs" x="822" y="110">ベースラインと比較</text>
  </svg>
  <figcaption class="fig-note">この実行に意味を与えているのは手順 6 です。通過数だけを見ていると気付かないうちにずれていきますが、記録したベースラインとの差分なら、どの module が変わったかを名指しできます。</figcaption>
</figure>

## 前提

- **Docker** + Compose v2(ハーネスは `docker compose` を呼び出します。`docker-compose` ではありません)
- **OpenSSL**(`scripts/conformance.sh certs` の証明書生成に使用)
- **Go 1.26 以降**。`go.mod` では `go1.27.1` toolchain を指定しています。
- seed-plans / drive スクリプト用の `curl` と `python3`

OFCS イメージは、現在の既定 tag `release-v5.3.1` として [`conformance/docker-compose.yml`](https://github.com/libraz/go-oidc-provider/blob/main/conformance/docker-compose.yml) から OpenID Foundation の registry に pull します。status page の保持済み run はリリースタグ直前に測定したため、この tag と同等のリリース相当結果として扱います。ただし snapshot にイメージ tag や digest は記録されていません。OFCS の checkout や `mvn install` は不要です。

## ワンコマンドでのクイックスタート

[`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider) の clean clone から:

```sh
make conformance-up
```

このターゲットは 4 ステップを順に実行します。

1. `scripts/conformance.sh certs` — OP listener 用の自己署名 RSA-2048 証明書（`localhost` + `host.docker.internal` をカバー）、FAPI 2.0 mtls / mtls2 plan slot が使うクライアント証明書ペア、OFCS コンテナがマウントして OP を信頼するための JKS truststore を生成します。
2. `scripts/conformance.sh ofcs-up` — `docker compose up -d` で OFCS コンテナを起動し、`https://localhost:8443` の応答を待ちます。
3. `scripts/conformance.sh op-up` — `cmd/op-demo` をビルドして `https://127.0.0.1:9443` で起動し、スイートが使う全プランの redirect URI を seed します。
4. `scripts/conformance.sh seed-plans` — `conformance/plans/` の各プランテンプレートを OFCS REST API に POST し、生成されたプラン ID を出力します。

OFCS state を保持する mongo volume も含めてすべて停止する場合は:

```sh
make conformance-down
```

## プラン、op-demo フラグ、有効化される実装

OFCS テストプランによって検証するライブラリ機能が異なります。下表は各プランに対し、対応する `cmd/op-demo` の起動方法と、そのプロファイルが有効化する `op.With...` オプションを読める該当ソースファイルを対応づけたものです。

| OFCS プラン | `op-demo` 起動 | 該当ソース |
|---|---|---|
| `oidcc-basic-certification-test-plan` | `make conformance-op-up`(プロファイル無し) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `commonOptions` |
| `oidcc-config-certification-test-plan` | `make conformance-op-up`(プロファイル無し) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `commonOptions` |
| `oidcc-dynamic-certification-test-plan` | `make conformance-op-up`（DCR は既定で有効） | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `op.WithDynamicRegistration` 分岐 |
| `oidcc-formpost-basic-certification-test-plan` | `make conformance-op-up`(プロファイル無し) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-rp-initiated-logout-certification-test-plan` | `make conformance-op-up`（DCR は既定で有効） | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | `make conformance-op-up`（DCR は既定で有効） | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `fapi2-security-profile-id2-test-plan` | `OP_PROFILE=fapi2-baseline make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2BaselineOptions` |
| `fapi2-message-signing-id1-test-plan` | `OP_PROFILE=fapi2-message-signing make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2MessageSigningOptions` |
| `fapi-ciba-id1-test-plan` | `OP_PROFILE=fapi-ciba make conformance-op-up` | [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go) — `fapiCIBAOptions` |

固定した OFCS リリースでは、この Message Signing プランを `fapi2-message-signing-id1-test-plan` と呼びます。末尾の `id1` は OFCS のプラン識別子であり、FAPI 2.0 Message Signing Final の版を示すラベルではありません。このプランの結果は固定版スイートのテスト範囲だけを示し、現行 Final のすべての要件への適合や認証を示すものではありません。

`cmd/op-demo/` 配下の各プロファイルファイルは冒頭にコメントブロックを持ち、そのプロファイルが有効化するオプション、各オプションが満たす仕様セクション、その実装が対象としている OFCS module を列挙しています。自分の OP にパターンを取り込む前に、実行するプランに対応するファイルを通読してください。

## 自分の OP に組み込むもの

`cmd/op-demo/` 配下のプロファイル別ファイルが正典の実装リファレンスです。以下のセクションは内容を要約したもので、自分の組み込みと照らし合わせる際の参考にしてください。

### OIDC Core 1.0(basic / config / formpost / RP-initiated logout)

vanilla プロファイルは `op.WithProfile` の呼び出しが不要です。基本オプションは `cmd/op-demo/main.go` の `commonOptions` にまとまっており、すべてのプランに共通します。

- `op.WithIssuer(...)` — discovery と ID token が広告する issuer URL。
- `op.WithStore(...)` — ストレージ adapter(demo は `op/storeadapter/inmem`、本番は sql / redis adapter を使う想定)。
- `op.WithKeyset(...)` — 署名 keyset。
- `op.WithCookieKeys(...)` — cookie 暗号化用の AEAD 鍵。
- `op.WithMountPrefix(...)` — OP handler を mount する URL prefix。
- `op.WithStaticClients(...)` — seed クライアント（public + confidential trio）。
- `op.WithLoginFlow(...)` — login orchestration。demo は `op.PrimaryPassword` を使用。
- `op.WithFeature(feature.JAR)` — 非 FAPI プロファイル向けにオプトインで JAR を有効化。OFCS の request-object module が pass / skip のいずれかにきれいに分岐します。
- `op.WithClaimsSupported(...)` — discovery が広告する claim 一覧。

dynamic 系プラン（`oidcc-dynamic`、`*-rp-initiated-logout-*`）では、conformance ハーネスが DCR を既定で有効化します。`op.WithDynamicRegistration(op.RegistrationOption{...})` を追加して `/register` を mount し、起動時に Initial Access Token を発行します。DCR なしの discovery surface を意図的に測りたい場合だけ `OP_ENABLE_DCR=0` を設定します。demo は IAT を stdout に出力しますが、本番では secret manager に渡し、log に出さないでください。

### FAPI 2.0 Baseline

`op-demo` 起動時に `OP_PROFILE=fapi2-baseline` を設定します。`fapi2BaselineOptions` がまとめている profile 固有の追加項目は次のとおりです。

- `op.WithProfile(profile.FAPI2Baseline)` — PAR(RFC 9126)、JAR(RFC 9101)、FAPI alg 制限を自動有効化します。
- `op.WithFeature(feature.DPoP)` — 送信者制約付きトークン。現行の FAPI 2.0 Security Profile §5.3.2.1(4)–(5) は DPoP **または** mTLS を求めます。デモが DPoP を選ぶのは、OFCS テンプレートの fapi2-* プランで `sender_constrain=dpop` が指定されているためです。

demo は OFCS テストクライアントの公開鍵を保持する `op.PrivateKeyJWTClient` を 2 件（`demo-fapi`、`demo-fapi-2`）seed します。対応する秘密鍵は [`conformance/plans/fapi2-*.json`](https://github.com/libraz/go-oidc-provider/tree/main/conformance/plans) に置かれており、OFCS が `private_key_jwt` assertion の署名に使用します。

各オプションの詳細は [Concepts → FAPI](/ja/concepts/fapi)、[Concepts → DPoP](/ja/concepts/dpop)、[Use case: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を参照してください。

### FAPI 2.0 Message Signing

`OP_PROFILE=fapi2-message-signing` を設定します。Baseline がやることに加えて:

- `op.WithProfile(profile.FAPI2MessageSigning)` — PAR / JAR / alg 制限の上に JARM(署名 authorization response)を自動有効化します。
- `op.WithFeature(feature.DPoP)` — Baseline と同じ送信者制約。
- `op.WithDPoPNonceSource(...)` — `profile.FAPI2MessageSigning` で DPoP を有効にする場合、本ライブラリはサーバが発行する DPoP nonce の source を要求し、`op/options_validate.go` で検証します。これはライブラリの構成要件であり、FAPI 2.0 Message Signing Final の要件ではありません。同仕様には §5.3.4 がなく、§5.6 は ID トークンの署名を扱います。mTLS を明示的に選んで DPoP を使わない場合、DPoP nonce source は不要です。demo は in-memory rotator を使用しますが、マルチインスタンスの OP では共有ストアで source を裏付けてください。

### FAPI-CIBA

`OP_PROFILE=fapi-ciba` を設定します。CIBA は fapi2-* プランと比較して 3 点で大きく異なります。

- OFCS の `fapi-ciba-id1` プランは FAPI 1.0 由来の cert-bound アクセストークン要件をハードコードしており、sender-constraint variant を提供しません。そのため demo は `feature.DPoP` ではなく `op.WithFeature(feature.MTLS)` を組み込みます。どちらも `WithProfile` の "DPoP OR MTLS" 選言制約を満たします。
- CIBA クライアントは認可エンドポイントを訪れません。seed は空の `redirect_uri` 集合と絞り込まれた grant 一覧（CIBA URN + `refresh_token`）を持ちます。
- OFCS プランは認証デバイスが実在しない状態で `auth_req_id` ポーリングループを実行します。demo は in-memory `CIBARequestStore` を `cibaAutoApproveStore` でラップし、設定可能な遅延後に out-of-band の `Approve()` をスケジュールしてデバイスコールバックをシミュレーションします。**本番組み込みでは、ユーザの実際の認証デバイスのコールバックから `Approve` を呼び出す必要があります。OP プロセス内部から呼び出してはなりません。**

実装の全体（auto-approve substore と hint resolver を含む）は [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go) に置かれています。

## 実行方法

スタックを起動してプランを seed したら、3 通りの方法で module を実行できます。

### ブラウザで進める単一フロー

OFCS UI から特定の module を反復確認するときに有用です。

```sh
scripts/conformance.sh drive 'https://host.docker.internal:9443/oidc/auth?...'
```

OFCS のテスト詳細パネルが出力する `Browser` URL をコピーします。

### 複数 module を一括実行

`seed-plans` が出力する plan ID を渡します。

```sh
scripts/conformance.sh batch <plan-id> oidcc-server oidcc-userinfo-get ...
```

batch サブコマンドは module 名から適切な driver hint を選択します（例: `*user-rejects-authentication*` 系では `OFCS_DRIVE_REJECT=1` を立てて demo に同意キャンセルを行わせます）。

### 全プランの全 module

```sh
make conformance-baseline LABEL=local-check
```

seed されたすべてのプランの全 module を実行し、`conformance/baselines/<UTC-date>-local-check.json` に決定的な JSON snapshot を書き出します。リファクタが既存 baseline に対して regression を起こしていないか検証する用途で使います。

## 結果の読み方

OFCS は主に 4 種の終端 result value を返し、ハーネスは advisory の `WARNING` result も保持します。

- **PASSED** — module を実行し、仕様が要求する挙動を観測。
- **REVIEW** — module は実行されたが、視覚的 / out-of-band の挙動（同意 UI 文言、エラーページのスクリーンショット）を人間のレビュアーが確認する必要があります。failure ではありません。ヘッドレスハーネスは `REVIEW` をそのまま記録します。有償認証ではこれを clear するために OFCS UI に向かう必要があります。
- **SKIPPED** — module は OP が discovery / per-client metadata で広告していない機能に依存します。例えば、クライアント metadata が `PS256` を署名 alg として宣言している場合、`RS256` ネガティブテストはそのプローブが対象外なため skip されます。failure ではありません。
- **WARNING** — module は非 failure の advisory result に到達した状態。最新 status page では FAILED とは分けて集計します。
- **FAILED** — module が suite の期待結果に到達しなかった状態。`make conformance-release-verify` がレビュー済みかつ期限内の exclusion と照合できない限り、release を止めます。現在の内訳は [OFCS 適合状況](/ja/compliance/ofcs) を参照してください。

REVIEW / SKIPPED の各 module がどれで、なぜそうなっているかの詳細は [OFCS 適合状況](/ja/compliance/ofcs) にあります。

## ベースラインのキャプチャと差分取得 {#reproduce-baseline}

ハーネスは「現状を凍結し、変更がベースラインに対して回帰を起こさないか検証する」サイクルを中心に組まれています。

```sh
make conformance-up
make conformance-baseline LABEL=pre-change

# … 変更を加える …

make conformance-baseline LABEL=post-change
make conformance-baseline-diff \
    BASELINE_OLD=conformance/baselines/<utc>-pre-change.json \
    BASELINE_NEW=conformance/baselines/<utc>-post-change.json
```

`baseline-diff` は、2 つのスナップショット間で **PASSED を失った** module が 1 つでもあれば非 0 で終了します。差分は module を次に分類します。

- **regressions** — `PASSED` から非 `PASSED` への遷移（ゲート対象）。
- **fixes** — 非 `PASSED` から `PASSED` への遷移。
- **non-pass churn** — どちらも非 `PASSED` だが状態が異なる（例: REVIEW → SKIPPED）。
- **catalog drift** — module が片方のスナップショットにしか存在しない（OFCS pin を上げたときに典型的に発生）。

snapshot ファイルは gitignore 対象です。環境固有の瞬間を記録するため、マシン / OFCS リリース間でのちらつきが大きいからです。標準のスナップショットを 1 つ保持したい場合は、`conformance/baselines/` の下からコピーアウトして自分で commit するパスに置いてください。

module 一覧は実行時に OFCS から問い合わせるため、OFCS リリース間の catalog drift は自動的に捕捉されます。サブセットだけを baseline 化したい場合は `BASELINE_FILTER` に正規表現を渡します。

```sh
BASELINE_FILTER='^oidcc-' make conformance-baseline LABEL=oidcc-only
```

## OFCS pin の更新

`conformance/docker-compose.yml` の `IMAGE_TAG` が標準の pin（固定化）です。前進させるには:

```sh
IMAGE_TAG=release-vX.Y.Z make conformance-up
```

OFCS のテストロジックはリリース間で drift します（module rename、condition 厳格化、新しい variant）。bump 後は各プランの baseline を再キャプチャし、前回との差分を取ってください。新しい SKIPPED / REVIEW 行は通常 catalog rename であって regression ではありません。regression として扱う前に rename された module の意図を確認してください。

## 自分の OP への取り込み

`cmd/op-demo/` のプロファイル別ファイルは意図的に小さく、コメントを充実させてあります。組み込み側にそのまま構造を持ち込めるようになっています。

- [Concepts → FAPI](/ja/concepts/fapi) — `op.WithProfile(profile.FAPI2Baseline)` が実際に何を変えるか。
- [Concepts → DPoP](/ja/concepts/dpop) — DPoP がアクセストークン発行パスにどう組み込まれるか。
- [Concepts → mTLS](/ja/concepts/mtls) — `feature.MTLS` がクライアント証明書を抽出して `cnf.x5t#S256` を生成する仕組み。
- [Use case: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — Baseline 対応 deployment 向けの組み込みウォークスルー。

本番組み込みでは `cmd/op-demo` の暫定要素（in-memory store、ephemeral 署名鍵、auto-approve CIBA wrapper）を vault-backed 鍵、durable storage adapter、実際のデバイスコールバックパスに置き換えます。`op.With...` の形は同じままです。

## 明示しておく制限事項

- **plan suite version。** 現在の既定 pin は `release-v5.3.1` です。保持済み run はリリースタグ直前に測定したため、この pin と同等のリリース相当結果として扱います。ただし snapshot に実際のイメージ tag や digest は記録されていません。
- **headless drive。** drive スクリプトは OFCS REST surface を reverse-engineering したものです。OFCS はこれを文書化していません。保持済み snapshot に実際のイメージ tag や digest は記録されていません。
- **実 RP 証明書なし。** mTLS plan slot は `conformance/certs/` に生成された自己署名証明書を使い、プランの instantiation を可能にしています。実 CA chain は検証していません。
- **単一 OP インスタンス。** クロスインスタンスの挙動（共有ストアを介した 2 つの OP 間での token introspection 等）は OFCS ではなく `test/scenarios/` 配下の Spec Scenario Suite で検証しています。
