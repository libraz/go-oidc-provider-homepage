---
title: OFCS 再現レシピ
description: OpenID Foundation Conformance Suite を go-oidc-provider に対して実行する手順 — どのプランがどの op-demo フラグに対応するか、関連する実装はどこにあるか、ベースラインをキャプチャして回帰差分を取る方法。
pageClass: pg-compliance-ofcs-reproduce
---

# OFCS 再現レシピ

このページは、OpenID Foundation Conformance Suite（OFCS）を自分の環境でライブラリに対して実行するための runbook です。[OFCS 適合状況](/ja/compliance/ofcs)が「最新の実行で何が観測されたか」を記録するのに対し、本ページは「どう再現するか」と「各プランがどの `op.With...` オプションを使うか」を扱います。

適合状況ページは、v1.4.0 のリリース候補（core のコミット [`6b37232`](https://github.com/libraz/go-oidc-provider/commit/6b3723292cb6763faf2aff35be9acbc3117888d8)）で `2026-10-22T16:26:08Z` に取得した run を要約しています。対象は OFCS `release-v5.3.3` です。JSON snapshot はローカルの gitignore 対象 artifact で、イメージの tag も digest も記録していません。再現に使う pin は、`conformance/docker-compose.yml` の既定である `release-v5.3.3` です。

PASS / REVIEW / SKIPPED / WARNING の件数は [OFCS 適合状況](/ja/compliance/ofcs) にあります。自分の OP に同じプランを通すために必要な `op.With...` オプションは、このまま読み進めてください。

::: warning 個人開発、認証取得は無し
本サイトの数値は再現可能なスナップショットであり、本ページはその再現手順を扱います。これは有償の OpenID Foundation 認証の代替ではありません。ローカルでスイートを実行して自分の組み込みを検証する用途には使えますが、ローカルの PASS 数を認証として引用しないでください。
:::

<figure class="fig">
  <div class="fig-head">実行を再現する手順</div>
  <svg class="fig-svg" role="img" aria-labelledby="ofcs-repro-title" viewBox="0 0 960 240" xmlns="http://www.w3.org/2000/svg">
    <title id="ofcs-repro-title">適合テストの実行を再現する 6 手順。証明書を生成し、適合スイートを起動し、対象プロファイルでデモ用 OP を起動し、プランを登録し、実行し、記録済みのベースラインと差分を取ります。</title>
    <!-- step 1 -->
    <rect class="fg-box" x="32" y="24" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="60" cy="48" r="12"/><text class="fg-badge-t" x="60" y="53.5" text-anchor="middle">1</text>
    <text class="fg-t2" x="84" y="52">証明書を生成</text>
    <text class="fg-m" x="84" y="76">make certs</text>
    <path class="fg-edge fg-edge--thin" d="M304,60 H344" marker-end="url(#fg-a)"/>
    <!-- step 2 -->
    <rect class="fg-box" x="344" y="24" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="372" cy="48" r="12"/><text class="fg-badge-t" x="372" y="53.5" text-anchor="middle">2</text>
    <text class="fg-t2" x="396" y="52">OFCS を起動</text>
    <text class="fg-m" x="396" y="76">docker compose</text>
    <path class="fg-edge fg-edge--thin" d="M616,60 H656" marker-end="url(#fg-a)"/>
    <!-- step 3 -->
    <rect class="fg-box fg-box--accent" x="656" y="24" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="684" cy="48" r="12"/><text class="fg-badge-t" x="684" y="53.5" text-anchor="middle">3</text>
    <text class="fg-t2 fg-accent" x="708" y="52">op-demo を起動</text>
    <text class="fg-s" x="708" y="76">対象プロファイルを指定</text>
    <path class="fg-edge fg-edge--thin" d="M792,96 V120 H168 V144" marker-end="url(#fg-a)"/>
    <!-- step 4 -->
    <rect class="fg-box" x="32" y="144" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="60" cy="168" r="12"/><text class="fg-badge-t" x="60" y="173.5" text-anchor="middle">4</text>
    <text class="fg-t2" x="84" y="172">プランを登録</text>
    <text class="fg-m" x="84" y="196">seed-plans</text>
    <path class="fg-edge fg-edge--thin" d="M304,180 H344" marker-end="url(#fg-a)"/>
    <!-- step 5 -->
    <rect class="fg-box" x="344" y="144" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="372" cy="168" r="12"/><text class="fg-badge-t" x="372" y="173.5" text-anchor="middle">5</text>
    <text class="fg-t2" x="396" y="172">実行</text>
    <text class="fg-s" x="396" y="196">9 本すべてを無人で</text>
    <path class="fg-edge fg-edge--thin" d="M616,180 H656" marker-end="url(#fg-a)"/>
    <!-- step 6 -->
    <rect class="fg-box" x="656" y="144" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="684" cy="168" r="12"/><text class="fg-badge-t" x="684" y="173.5" text-anchor="middle">6</text>
    <text class="fg-t2" x="708" y="172">差分を取る</text>
    <text class="fg-s" x="708" y="196">ベースラインと比較</text>
  </svg>
  <figcaption class="fig-note">この実行に意味を与えているのは手順 6 です。通過数だけを見ていると気付かないうちにずれていきますが、記録したベースラインとの差分なら、どの module が変わったかを名指しできます。</figcaption>
</figure>

## 前提

- **Docker** + Compose v2(ハーネスは `docker compose` を呼び出します。`docker-compose` ではありません)
- **OpenSSL**(`scripts/conformance.sh certs` の証明書生成に使用)
- **Go 1.26 以降**。`go.mod` は toolchain を `go1.27.3` に固定しています。
- seed-plans / drive スクリプト用の `curl` と `python3`

OFCS イメージは、[`conformance/docker-compose.yml`](https://github.com/libraz/go-oidc-provider/blob/main/conformance/docker-compose.yml) の既定 tag `release-v5.3.3` で OpenID Foundation の registry から pull します。OFCS の checkout や `mvn install` は不要です。

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
| `oidcc-dynamic-certification-test-plan` | `make conformance-op-up`（`conformance.sh` では DCR が既定で有効） | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `op.WithDynamicRegistration` 分岐 |
| `oidcc-formpost-basic-certification-test-plan` | `make conformance-op-up`(プロファイル無し) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-rp-initiated-logout-certification-test-plan` | `make conformance-op-up`（`conformance.sh` では DCR が既定で有効） | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | `make conformance-op-up`（`conformance.sh` では DCR が既定で有効） | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `fapi2-security-profile-id2-test-plan` | `OP_PROFILE=fapi2-baseline make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2BaselineOptions` |
| `fapi2-message-signing-id1-test-plan` | `OP_PROFILE=fapi2-message-signing make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2MessageSigningOptions` |
| `fapi-ciba-id1-test-plan` | `OP_PROFILE=fapi-ciba make conformance-op-up` | [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go) — `fapiCIBAOptions` |

`scripts/conformance.sh op-up` は、`OP_ENABLE_DCR=0` を指定しない限り `-enable-dcr` を付けて `op-demo` を起動します。ストアは、`OP_STORE=composite` を指定しない限り in-memory です。composite では、永続側の substore に MySQL、揮発側に Redis を使います（`OP_MYSQL_DSN` と `OP_REDIS_DSN` で指定）。デプロイと同じ構成のストアで baseline を取れますが、前回の run で残ったレコードは replay や再利用の module の観測結果を変えるため、取得のたびに両方のエンジンをリセットしてください。

固定した OFCS リリースでは、この Message Signing プランを `fapi2-message-signing-id1-test-plan` と呼びます。末尾の `id1` は OFCS のプラン識別子であり、FAPI 2.0 Message Signing Final の版を示すラベルではありません。このプランの結果は固定版スイートのテスト範囲だけを示し、現行 Final のすべての要件への適合や認証を示すものではありません。

`cmd/op-demo/` 配下の各プロファイルファイルは冒頭にコメントブロックを持ち、そのプロファイルが有効化するオプション、各オプションが満たす仕様セクション、その実装が対象としている OFCS module を列挙しています。自分の OP にパターンを取り込む前に、実行するプランに対応するファイルを通読してください。

## 自分の OP に組み込むもの

`cmd/op-demo/` 配下のプロファイル別ファイルが正典の実装リファレンスです。以下のセクションは内容を要約したもので、自分の組み込みと照らし合わせる際の参考にしてください。

### OIDC Core 1.0(basic / config / formpost / RP-initiated logout)

vanilla プロファイルは `op.WithProfile` の呼び出しが不要です。基本オプションは `cmd/op-demo/main.go` の `commonOptions` にまとまっており、すべてのプランに共通します。

- `op.WithIssuer(...)` — discovery と ID token が広告する issuer URL。
- `op.WithStore(...)` — ストレージ adapter(demo は `op/storeadapter/inmem`、本番は sql / redis adapter を使う想定)。
- `op.WithKeyset(...)` — 署名 keyset（demo は ES256 の鍵 1 本）。
- `op.WithCookieKeys(...)` — cookie 暗号化用の AEAD 鍵。
- `op.WithMountPrefix(...)` — OP handler を mount する URL prefix。
- `op.WithStaticClients(...)` — seed クライアント（public + confidential trio）。
- `op.WithLoginFlow(...)` — login orchestration。demo は `op.PrimaryPassword` を使用。
- `op.WithFeature(feature.JAR)` — 非 FAPI プロファイル向けにオプトインで JAR を有効化します。discovery が（`none` を含まない）request object の署名 alg を広告するため、OFCS の request-object module は pass か skip のどちらかにきれいに分かれます。
- `op.WithClaimsSupported(...)` — discovery が広告する claim 一覧。

dynamic 系プラン（`oidcc-dynamic`、`*-rp-initiated-logout-*`）では、conformance ハーネスが DCR を既定で有効化します。`op.WithDynamicRegistration(op.RegistrationOption{...})` を追加して `/register` を mount し、起動時に Initial Access Token を発行します。DCR なしの discovery surface を意図的に測りたい場合だけ `OP_ENABLE_DCR=0` を設定します。demo は `Open: true` で登録を受け付けます。OFCS のプランテンプレートに Initial Access Token を渡す枠がないためで、あわせて IAT も stdout に出力します。本番では `Open` を false のままにし、IAT は `Provider.IssueInitialAccessToken` で発行して log に出さないでください。詳しくは[動的クライアント登録](/ja/use-cases/dynamic-registration)を参照してください。

### FAPI 2.0 Baseline

`op-demo` 起動時に `OP_PROFILE=fapi2-baseline` を設定します。`fapi2BaselineOptions` がまとめている profile 固有の追加項目は次のとおりです。

- `op.WithProfile(profile.FAPI2Baseline)` — PAR(RFC 9126)、JAR(RFC 9101)、FAPI alg 制限を自動有効化します。
- `op.WithFeature(feature.DPoP)` — 送信者制約付きトークン。FAPI 2.0 は DPoP **または** mTLS を求めます。デモが DPoP を選ぶのは、OFCS テンプレートの fapi2-* プランで `sender_constrain=dpop` が指定されているためです。

demo は OFCS テストクライアントの公開鍵を保持する `op.PrivateKeyJWTClient` を 2 件（`demo-fapi`、`demo-fapi-2`）seed します。対応する秘密鍵は [`conformance/plans/fapi2-*.json`](https://github.com/libraz/go-oidc-provider/tree/main/conformance/plans) に置かれており、OFCS が `private_key_jwt` assertion の署名に使用します。

各オプションの詳細は [Concepts → FAPI](/ja/concepts/fapi)、[Concepts → DPoP](/ja/concepts/dpop)、[Use case: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を参照してください。

### FAPI 2.0 Message Signing

`OP_PROFILE=fapi2-message-signing` を設定します。Baseline がやることに加えて:

- `op.WithProfile(profile.FAPI2MessageSigning)` — PAR / JAR / alg 制限の上に JARM(署名 authorization response)を自動有効化します。
- `op.WithFeature(feature.DPoP)` — Baseline と同じ送信者制約。
- `op.WithDPoPNonceSource(...)` — `profile.FAPI2MessageSigning` または `profile.FAPICIBA` で DPoP を有効にする場合、本ライブラリはサーバが発行する DPoP nonce の source を要求します。source がなければ `op.New` が構成を拒否します（`op/options_validate.go`）。これはライブラリの構成要件であり、FAPI 2.0 Message Signing Final の要件ではありません。同仕様には §5.3.4 がなく、§5.6 は ID トークンの署名を扱います。mTLS を明示的に選んで DPoP を使わない場合、DPoP nonce source は不要です。demo は in-memory rotator を使用しますが、マルチインスタンスの OP では共有ストアで source を裏付けてください。

### FAPI-CIBA

`OP_PROFILE=fapi-ciba` を設定します。CIBA は fapi2-* プランと比較して 3 点で大きく異なります。

- OFCS の `fapi-ciba-id1` プランは FAPI 1.0 由来の cert-bound アクセストークン要件をハードコードしており、sender-constraint variant を提供しません。そのため demo は `feature.DPoP` ではなく `op.WithFeature(feature.MTLS)` を組み込みます。どちらでもプロファイルの「DPoP または mTLS」の要件を満たします。mTLS を選ぶため、DPoP nonce source は不要です。
- CIBA クライアントは認可エンドポイントを訪れません。seed は空の `redirect_uri` 集合と絞り込まれた grant 一覧（CIBA URN + `refresh_token`）を持ちます。プロバイダは `op.WithGrants(AuthorizationCode, CIBA, RefreshToken)` と `op.WithCIBA(...)` で構築し、ポーリング間隔を 1 秒、`WithCIBAMaxPollViolations` を 50 に上げて、プランの高頻度なポーリングがストライク上限に掛からないようにしています。
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

seed されたすべてのプランの全 module を、プランごとに適切なプロファイルで `op-demo` を再起動しながら実行し、`conformance/baselines/<UTC-date>-local-check.json` に決定的な JSON snapshot を書き出します。リファクタが既存 baseline に対して regression を起こしていないか検証する用途で使います。

## 結果の読み方

OFCS は主に 4 種の終端 result value を返し、ハーネスは advisory の `WARNING` result も保持します。

- **PASSED** — module を実行し、仕様が要求する挙動を観測。
- **REVIEW** — module は実行されましたが、視覚的 / out-of-band の挙動（同意 UI の文言、エラーページのスクリーンショット）を人間が確認する必要があります。failure ではありません。ヘッドレスハーネスは `REVIEW` をそのまま記録します。OpenID Foundation の認証を取る場合は、OFCS の UI で一件ずつ人が解消します。
- **SKIPPED** — module は、OP が discovery やクライアントメタデータで宣言していない機能に依存します。例えば、クライアントメタデータが署名 alg に `PS256` を宣言していると、`RS256` の負例テストは対象外になりスキップされます。failure ではありません。
- **WARNING** — module は failure ではない advisory の result に到達した状態です。status ページでは FAILED と分けて集計します。
- **FAILED** — module がスイートの期待結果に到達しなかった状態です。`make conformance-release-verify` がレビュー済みかつ期限内の exclusion と照合できない限り、release を止めます（[リリースゲート](#release-gate)を参照）。現在の内訳は [OFCS 適合状況](/ja/compliance/ofcs) にあります。
- **未判定** — module が終端状態に到達しなかった状態です（runner の idle 上限後も `WAITING` か `CONFIGURED` のまま）。証跡付きの `unreachable_verdicts` エントリだけがこれを受け入れます。

現在 REVIEW と SKIPPED になっている module と、その理由は [OFCS 適合状況](/ja/compliance/ofcs) に一覧があります。

## リリースゲート {#release-gate}

`baseline-diff` は変化を知らせるだけで、リリースの承認ではありません。承認には、厳格なゲートの `make conformance-release-verify` を使います。

```sh
make conformance-release-verify \
    BASELINE_REFERENCE=conformance/baselines/<approved-reference>.json \
    BASELINE_CANDIDATE=conformance/baselines/<candidate>.json
```

candidate は reference と完全に同じプラン・module のカタログを持ち、status と result が空であってはなりません。すべての module は `FINISHED` / `PASSED` でなければならず、`conformance/release-exclusions.json` に記録された module だけが例外になります。このマニフェストは git で追跡され、`HEAD` から変更されていない必要があります。3 つのセクションが、それぞれ別の種類の結果を受け持ちます。

| 結果 | マニフェストのセクション | エントリの照合方法 | エントリに必要なもの |
|---|---|---|---|
| FAILED（interrupted を含む） | `exclusions` | plan、module、status、result の完全一致 | 設計上失敗する理由 |
| REVIEW または SKIPPED | `accepted_outcomes` | result と module 名パターン（`oidcc-rp-initiated-logout-*` など）によるクラス単位のルール。`intermittent` は、スイートが PASSED で終えることもある module を表す | スイートが判定できない理由 |
| 未判定（`WAITING`、`CONFIGURED`） | `unreachable_verdicts` | plan、module、status の完全一致 | 単体実行で試したことの `evidence` |

どのエントリにも担当者と、その日を含まない ISO 形式の期限日が必要です。エントリの欠落、重複、陳腐化、期限切れはそれ自体が blocker になるため、例外が承認したレビューより長く残ることはありません。pin を上げて module 名が変わるといった OFCS のカタログ変更も、新しい承認済み reference を取り直すまで同じゲートで失敗します。

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

`conformance/docker-compose.yml` の `IMAGE_TAG` の既定値が標準の pin です。1 回の実行だけ先に進めるには次のようにします。

```sh
IMAGE_TAG=release-vX.Y.Z make conformance-up
```

OFCS のテストロジックはリリース間で変わります（module の改名・統合、条件の厳格化）。pin を上げたあとは各プランの baseline を取り直し、前回との差分を確認してください。新しい SKIPPED / REVIEW の行は、たいてい catalog の改名であって regression ではありません。regression と判断する前に、改名された module の意図を確認してください。新しい既定を恒久化するには、compose ファイルを編集してコミットします。

## 自分の OP への取り込み

`cmd/op-demo/` のプロファイル別ファイルは意図的に小さく、コメントを充実させてあります。組み込み側にそのまま構造を持ち込めるようになっています。

- [Concepts → FAPI](/ja/concepts/fapi) — `op.WithProfile(profile.FAPI2Baseline)` が実際に何を変えるか。
- [Concepts → DPoP](/ja/concepts/dpop) — DPoP がアクセストークン発行パスにどう組み込まれるか。
- [Concepts → mTLS](/ja/concepts/mtls) — `feature.MTLS` がクライアント証明書を抽出して `cnf.x5t#S256` を生成する仕組み。
- [Use case: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — Baseline 対応 deployment 向けの組み込みウォークスルー。

本番組み込みでは `cmd/op-demo` の暫定要素（in-memory store、ephemeral 署名鍵、auto-approve CIBA wrapper）を vault-backed 鍵、durable storage adapter、実際のデバイスコールバックパスに置き換えます。`op.With...` の形は同じままです。

## 明示しておく制限事項

- **プランスイートのバージョン。** 既定の pin は `release-v5.3.3` です。保持している snapshot には `ofcs-v5.3.3` のラベルが付いていますが、イメージの tag も digest も記録されていません。
- **ヘッドレス実行。** 実行スクリプトは OFCS の REST API をリバースエンジニアリングしたもので、OFCS 側にドキュメントはありません。
- **本物の RP 証明書なし。** mTLS プラン枠は `conformance/certs/` の生成済み自己署名証明書を使っており、プランをインスタンス化できる程度に整えてあるだけです。本物の CA チェーン検証はしていません。
- **OP インスタンス 1 個。** クロスインスタンスの挙動（共有ストアを介した 2 つの OP 間での token introspection 等）は OFCS ではなく `test/scenarios/` 配下の Spec Scenario Suite で検証しています。
