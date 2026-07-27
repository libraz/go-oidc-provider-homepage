---
title: OFCS 適合状況
description: go-oidc-provider が OpenID Foundation Conformance Suite に対してどう走るか — 9 プラン、最新スコア、失敗が設計判断である理由、REVIEW の意味。
pageClass: pg-compliance-ofcs
---

# OFCS 適合状況

`go-oidc-provider` は [OpenID Foundation Conformance Suite (OFCS)][ofcs] に対して回帰検査されています。ハーネスはソースリポジトリの [`conformance/`][harness] に置かれており、9 つの OFCS プランを準備します。本ページのベースラインは、v1.0.0 リリース時点のスナップショットを `cmd/op-demo` インスタンスへ end-to-end で実行した結果です。

[ofcs]: https://gitlab.com/openid/conformance-suite
[harness]: https://github.com/libraz/go-oidc-provider/tree/main/conformance

::: warning 個人開発、認証取得は無し
これは個人開発者が維持するプロジェクトです。OpenID Foundation 会員費は支払っておらず、**形式的な OIDC 認証は取得していません**。本ページの数値は、下に示すプラン集合の再現可能なスナップショットです。これは有償の OpenID Foundation 認証の代替ではなく、そのように引用しないでください。
:::

<svg role="img" aria-labelledby="ofcs-snapshot-title" viewBox="0 0 780 350" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="ofcs-snapshot-title">OFCS スナップショットの読み方: 4 つの仕様ファミリにまたがる 9 プランを op-demo に対して実行し、各 module は PASSED / REVIEW / SKIPPED / 未判定 / FAILED のいずれか 1 つに分類される。</title>
  <text class="ofcs-cap" x="126" y="22" text-anchor="middle">テストプラン (9)</text>
  <text class="ofcs-cap" x="656" y="22" text-anchor="middle">module ごとの結果</text>

  <rect class="ofcs-box" x="28" y="36" width="196" height="60" rx="10"/>
  <text class="ofcs-text" x="126" y="62" text-anchor="middle">OIDC Core 1.0</text>
  <text class="ofcs-sub" x="126" y="80" text-anchor="middle">6 プラン</text>
  <rect class="ofcs-box" x="28" y="112" width="196" height="60" rx="10"/>
  <text class="ofcs-text" x="126" y="138" text-anchor="middle">FAPI 2.0 Baseline</text>
  <text class="ofcs-sub" x="126" y="156" text-anchor="middle">1 プラン</text>
  <rect class="ofcs-box" x="28" y="188" width="196" height="60" rx="10"/>
  <text class="ofcs-text" x="126" y="214" text-anchor="middle">FAPI 2.0 Message Signing</text>
  <text class="ofcs-sub" x="126" y="232" text-anchor="middle">1 プラン</text>
  <rect class="ofcs-box" x="28" y="264" width="196" height="60" rx="10"/>
  <text class="ofcs-text" x="126" y="290" text-anchor="middle">FAPI-CIBA</text>
  <text class="ofcs-sub" x="126" y="308" text-anchor="middle">1 プラン</text>

  <rect class="ofcs-main" x="310" y="136" width="170" height="88" rx="10"/>
  <text class="ofcs-text" x="395" y="172" text-anchor="middle">cmd/op-demo</text>
  <text class="ofcs-sub" x="395" y="194" text-anchor="middle">対象 OP インスタンス</text>

  <rect class="ofcs-box" x="560" y="42" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-pass" x="578" y="58" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="69">PASSED</text>
  <rect class="ofcs-box" x="560" y="100" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-review" x="578" y="116" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="127">REVIEW</text>
  <rect class="ofcs-box" x="560" y="158" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-skip" x="578" y="174" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="185">SKIPPED</text>
  <rect class="ofcs-box" x="560" y="216" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-noverdict" x="578" y="232" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="243">未判定</text>
  <rect class="ofcs-box" x="560" y="274" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-fail" x="578" y="290" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="301">FAILED</text>

  <path class="ofcs-flow" d="M224 66 C264 66 272 152 306 152"/>
  <path class="ofcs-flow" d="M224 142 C264 142 272 168 306 168"/>
  <path class="ofcs-flow" d="M224 218 C264 218 272 192 306 192"/>
  <path class="ofcs-flow" d="M224 294 C264 294 272 208 306 208"/>

  <path class="ofcs-flow" d="M480 180 C514 180 522 64 556 64"/>
  <path class="ofcs-flow" d="M480 180 C514 180 522 122 556 122"/>
  <path class="ofcs-flow" d="M480 180 H556"/>
  <path class="ofcs-flow" d="M480 180 C514 180 522 238 556 238"/>
  <path class="ofcs-flow" d="M480 180 C514 180 522 296 556 296"/>
  <path class="ofcs-flow" d="M548 60 L557 64 L548 68"/>
  <path class="ofcs-flow" d="M548 118 L557 122 L548 126"/>
  <path class="ofcs-flow" d="M548 176 L557 180 L548 184"/>
  <path class="ofcs-flow" d="M548 234 L557 238 L548 242"/>
  <path class="ofcs-flow" d="M548 292 L557 296 L548 300"/>
</svg>

## この snapshot が検査する範囲

| Plan | カバー範囲 | プロファイル |
|---|---|---|
| `oidcc-basic-certification-test-plan` | 認可コード + PKCE、ID トークン、UserInfo、refresh、discovery | OIDC Core 1.0 |
| `oidcc-config-certification-test-plan` | discovery ドキュメントと公開 JWKS の形 | OIDC Core 1.0 — Discovery |
| `oidcc-dynamic-certification-test-plan` | 動的クライアント登録と、そこで登録したクライアントによる認可コードフロー | OIDC Core 1.0 — Dynamic Registration |
| `oidcc-formpost-basic-certification-test-plan` | basic プランを `response_mode=form_post` で再実行 | OIDC Core 1.0 — `form_post` |
| `oidcc-rp-initiated-logout-certification-test-plan` | `/end_session`、`id_token_hint`、`post_logout_redirect_uri` | RP-Initiated Logout 1.0 |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | RP 起点のログアウトと、登録済みバックチャネル URI への `logout_token` 送達 | Back-Channel Logout 1.0 |
| `fapi2-security-profile-id2-test-plan` | + PAR、送信者制約付きアクセストークン (DPoP)、厳格 alg list、`redirect_uri` 完全一致 | FAPI 2.0 Baseline |
| `fapi2-message-signing-id1-test-plan` | + JAR（署名 authorization request）、JARM（署名 authorization response） | FAPI 2.0 Message Signing |
| `fapi-ciba-id1-test-plan` | Client-Initiated Backchannel Authentication（poll mode）、mTLS バインドトークン | FAPI-CIBA |

## 最新 baseline

<div class="ofcs-summary">
  <div class="ofcs-headline">
    <b>271 件中 209 件</b>
    <span>の module が PASSED — 9 plan 合計の 77.1%</span>
  </div>
  <div class="ofcs-track">
    <div class="ofcs-stack" role="img" aria-label="271 module のうち PASSED 209、REVIEW 39、SKIPPED 15、未判定 2、FAILED 6">
      <i class="pass" style="flex:209"></i>
      <i class="review" style="flex:39"></i>
      <i class="skip" style="flex:15"></i>
      <i class="noverdict" style="flex:2"></i>
      <i class="fail" style="flex:6"></i>
    </div>
  </div>
  <ul class="ofcs-legend">
    <li><span class="ofcs-dot pass"></span>PASSED<b>209</b><em>77.1%</em></li>
    <li><span class="ofcs-dot review"></span>REVIEW<b>39</b><em>14.4%</em></li>
    <li><span class="ofcs-dot skip"></span>SKIPPED<b>15</b><em>5.5%</em></li>
    <li><span class="ofcs-dot noverdict"></span>未判定<b>2</b><em>0.7%</em></li>
    <li><span class="ofcs-dot fail"></span>FAILED<b>6</b><em>2.2%</em></li>
    <li><span class="ofcs-dot" style="background:var(--vp-c-divider)"></span>WARNING<b>0</b><em>0.0%</em></li>
  </ul>
  <p class="ofcs-note">FAILED と未判定の module はすべてレビュー済みの release exclusion です — <a href="#failed-6-件の理由">原因は 3 つだけで、未解決の欠陥はありません</a>。</p>
  <div class="ofcs-meta">
    <span><i>取得日時</i>2026-07-26T23:22:11Z</span>
    <span><i>リポジトリ SHA</i><a href="https://github.com/libraz/go-oidc-provider/commit/3ccc6bc7777a070ebd6485016e4574831dc983b7">3ccc6bc</a></span>
    <span><i>OFCS イメージ</i>release-v5.2.1</span>
  </div>
</div>

::: info スナップショットの状態
上のバーは 9 plan 全体の raw 結果です。対応する timestamp 付き JSON は `conformance/baselines/` 配下にあります。`make conformance-release-verify` は、このリリース snapshot を blocker 0 と判定しました。raw failure と未判定 module はすべて `conformance/release-exclusions.json` のレビュー済み・期限付きエントリと照合されています。この判定は OIDC 認証ではありません。
:::

### FAILED 6 件の理由

FAILED と未判定の module は、すべて 3 つの原因のいずれかに帰着します。うち 2 つは 1.x 系で変えない設計判断で、残る 1 つはヘッドレス実行の限界です。未解決の欠陥はひとつもなく、いずれも `conformance/release-exclusions.json` に担当者と期限付きで記録されています。

<div class="ofcs-causes">
  <div class="ofcs-cause">
    <div class="ofcs-cause-main">
      <strong>署名は ES256 のみ — 段階的移行ではなく恒久的な方針</strong>
      <p>discovery が広告する署名 alg は <code>ES256</code> だけです。そのため OIDC Core 1.0 §15.1 の <code>RS256</code> 必須要件を検証する module は失敗し、<code>RS256</code> 署名の ID トークンや UserInfo 応答を求める動的登録は assertion に到達する前に拒否されます。alg を 1 つに絞ることで alg ネゴシエーションと、それに伴うダウングレード対策そのものが不要になります。FAPI 2.0 も <code>RS256</code> を明確に禁じています。<a href="/ja/security/design-judgments">alg list を閉じている理由</a></p>
    </div>
    <div class="ofcs-plan-counts">
      <span><span class="ofcs-dot fail"></span><b>4</b> FAILED</span>
      <span><span class="ofcs-dot noverdict"></span><b>1</b> 未判定</span>
    </div>
  </div>
  <div class="ofcs-cause">
    <div class="ofcs-cause-main">
      <strong>back-channel logout は sid 単位ではなく subject 単位</strong>
      <p>本 OP は <code>backchannel_logout_session_supported: false</code> を広告し、<code>sid</code> ではなく subject 単位でログアウトします。このメタデータは仕様上 optional ですが、この certification module は無条件に <code>true</code> を要求し、プラン残りも同じ assertion で中断します。<code>sid</code> 単位のセッションスコープログアウトは将来の minor で追加予定のオプトインプロファイルで、subject 単位は fail-secure 側の既定です。<a href="/ja/use-cases/back-channel-logout">バックチャネルログアウト</a></p>
    </div>
    <div class="ofcs-plan-counts">
      <span><span class="ofcs-dot fail"></span><b>2</b> FAILED</span>
    </div>
  </div>
  <div class="ofcs-cause">
    <div class="ofcs-cause-main">
      <strong>ハーネスが実行できない鍵ローテーション</strong>
      <p><code>oidcc-server-rotate-keys</code> は「署名鍵をローテーションしてから Start を押す」ことを人間に要求します。本ライブラリは鍵束を <code>op.New</code> の時点で確定するため、実運用でのローテーションは provider の作り直しになり、プランで登録済みのクライアントを保持している in-memory store が失われます。OP が提供する内容自体には影響がなく、JWKS は設定済みの鍵をすべて公開しています。<a href="/ja/operations/key-rotation">鍵ローテーション</a></p>
    </div>
    <div class="ofcs-plan-counts">
      <span><span class="ofcs-dot noverdict"></span><b>1</b> 未判定</span>
    </div>
  </div>
</div>

### plan 別の内訳

バーの長さは全 plan 共通の尺度で、その plan の module 数を表します。1 module の plan が 71 module の plan と同じ重さに見えることはありません。件数 0 の結果は行に出しません。

<div class="ofcs-plans">
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-basic-certification-test-plan <span class="ofcs-plan-total">· 35 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>29</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>4</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:49.3%">
        <i class="pass" style="flex:29"></i>
        <i class="review" style="flex:4"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-config-certification-test-plan <span class="ofcs-plan-total">· 1 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot fail"></span><b>1</b> FAILED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:1.4%">
        <i class="fail" style="flex:1"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-dynamic-certification-test-plan <span class="ofcs-plan-total">· 23 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>7</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>6</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>5</b> SKIPPED</span>
        <span><span class="ofcs-dot noverdict"></span><b>2</b> 未判定</span>
        <span><span class="ofcs-dot fail"></span><b>3</b> FAILED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:32.4%">
        <i class="pass" style="flex:7"></i>
        <i class="review" style="flex:6"></i>
        <i class="skip" style="flex:5"></i>
        <i class="noverdict" style="flex:2"></i>
        <i class="fail" style="flex:3"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-formpost-basic-certification-test-plan <span class="ofcs-plan-total">· 35 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>30</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>3</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:49.3%">
        <i class="pass" style="flex:30"></i>
        <i class="review" style="flex:3"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-rp-initiated-logout-certification-test-plan <span class="ofcs-plan-total">· 11 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>3</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>8</b> REVIEW</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:15.5%">
        <i class="pass" style="flex:3"></i>
        <i class="review" style="flex:8"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-backchannel-rp-initiated-logout-certification-test-plan <span class="ofcs-plan-total">· 2 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot fail"></span><b>2</b> FAILED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:2.8%">
        <i class="fail" style="flex:2"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi2-security-profile-id2-test-plan <span class="ofcs-plan-total">· 58 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>48</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>9</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>1</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:81.7%">
        <i class="pass" style="flex:48"></i>
        <i class="review" style="flex:9"></i>
        <i class="skip" style="flex:1"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi2-message-signing-id1-test-plan <span class="ofcs-plan-total">· 71 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>60</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>9</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:100%">
        <i class="pass" style="flex:60"></i>
        <i class="review" style="flex:9"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi-ciba-id1-test-plan <span class="ofcs-plan-total">· 35 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>32</b> PASSED</span>
        <span><span class="ofcs-dot skip"></span><b>3</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:49.3%">
        <i class="pass" style="flex:32"></i>
        <i class="skip" style="flex:3"></i>
      </div>
    </div>
  </div>
</div>

::: details 同じ snapshot を表で見る
| Plan                                       | PASSED | REVIEW | SKIPPED | WARNING | FAILED | 未判定 | 合計 |
|--------------------------------------------|-------:|-------:|--------:|--------:|-------:|-------:|------:|
| `oidcc-basic-certification-test-plan`      |     29 |      4 |       2 |       0 |       0 |      0 |    35 |
| `oidcc-config-certification-test-plan`     |      0 |      0 |       0 |       0 |  **1** |      0 |     1 |
| `oidcc-dynamic-certification-test-plan`    |      7 |      6 |       5 |       0 |  **3** |      2 |    23 |
| `oidcc-formpost-basic-certification-test-plan` | 30 |      3 |       2 |       0 |       0 |      0 |    35 |
| `oidcc-rp-initiated-logout-certification-test-plan` | 3 | 8 | 0 | 0 | 0 | 0 | 11 |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | 0 | 0 | 0 | 0 | **2** | 0 | 2 |
| `fapi2-security-profile-id2-test-plan`     |     48 |      9 |       1 |       0 |       0 |      0 |    58 |
| `fapi2-message-signing-id1-test-plan`      |     60 |      9 |       2 |       0 |       0 |      0 |    71 |
| `fapi-ciba-id1-test-plan`                  |     32 |      0 |       3 |       0 |       0 |      0 |    35 |
| **合計**                                  | **209**| **39** |  **15** |   **0** |  **6** |  **2** | **271** |
:::

## 各テストプランが検証する範囲

OFCS の各テストプランは、それぞれ特定の仕様プロファイルを検証します。以下の表は、プランごとに「該当コードパスを有効化するライブラリオプション」と「その挙動を解説しているページ」を対応づけたものです。組み込み側は、自分の配備が同じ構成を公開しているかをこの表で確認できます。

### `oidcc-basic-certification-test-plan` — OIDC Core 1.0

| 検証範囲 | 有効化に必要なオプション | 解説ページ |
|---|---|---|
| 認可コードフロー + PKCE | 既定で有効 | [/ja/concepts/authorization-code-pkce](/ja/concepts/authorization-code-pkce) |
| ID トークンの発行と claim | 既定で有効 | [/ja/concepts/tokens](/ja/concepts/tokens) |
| UserInfo エンドポイント | 既定で有効 | [/ja/concepts/tokens](/ja/concepts/tokens) |
| Discovery (`/.well-known/openid-configuration`) | 既定で有効 | [/ja/concepts/discovery](/ja/concepts/discovery) |
| JWKS の公開 | 既定で有効 | [/ja/operations/jwks](/ja/operations/jwks) |
| リフレッシュトークン + ローテーション | 既定で有効、長期 refresh は `offline_access` スコープが必要 | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |
| 標準スコープ (`profile`、`email`、`address`、`phone`) | スコープごとに `op.WithScope(...)` を 1 回ずつ | [/ja/concepts/scopes-and-claims](/ja/concepts/scopes-and-claims) |
| public / pairwise サブジェクト | pairwise は `op.WithPairwiseSubject(salt)`、適用判定はクライアントの `SubjectType` | [/ja/use-cases/pairwise-subject](/ja/use-cases/pairwise-subject) |

### `fapi2-security-profile-id2-test-plan` — FAPI 2.0 Baseline

| 検証範囲 | 有効化に必要なオプション | 解説ページ |
|---|---|---|
| PAR (RFC 9126) | `op.WithProfile(profile.FAPI2Baseline)` がプロファイルとして `feature.PAR` を有効化 | [/ja/concepts/fapi](/ja/concepts/fapi)、[/ja/use-cases/fapi2-baseline](/ja/use-cases/fapi2-baseline) |
| JAR (RFC 9101) | プロファイルが `feature.JAR` を有効化 | [/ja/concepts/fapi](/ja/concepts/fapi) |
| `S256` PKCE の強制 | プロファイルが強制 | [/ja/concepts/authorization-code-pkce](/ja/concepts/authorization-code-pkce) |
| 認可レスポンスの `iss` (RFC 9207) | プロファイルが強制 | [/ja/concepts/issuer](/ja/concepts/issuer) |
| ID トークン署名アルゴリズム `ES256` | プロファイルが強制。OP 発行 ID トークンは `PS256` / `RS256` では署名しない | [/ja/concepts/jose-basics](/ja/concepts/jose-basics) |
| `RS256`(FAPI 文脈)・`HS*`・`none` の拒否 | `internal/jose/alg.go` の closed enum で禁止 | [/ja/security/design-judgments](/ja/security/design-judgments) |
| `private_key_jwt` | profile が強制 | [/ja/concepts/client-types](/ja/concepts/client-types) |
| DPoP または mTLS による送信者制約 | `op.WithFeature(feature.DPoP)` か `op.WithFeature(feature.MTLS)` のいずれか（FAPI 2.0 では少なくとも一方が必須） | [/ja/concepts/sender-constraint](/ja/concepts/sender-constraint)、[/ja/concepts/dpop](/ja/concepts/dpop)、[/ja/concepts/mtls](/ja/concepts/mtls) |
| `redirect_uri` 完全一致 | プロファイルが強制 | [/ja/concepts/redirect-uri](/ja/concepts/redirect-uri) |
| リフレッシュトークンのローテーションと再利用検知 | 既定で有効 | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |

### `fapi2-message-signing-id1-test-plan` — FAPI 2.0 Message Signing

Message Signing は Baseline に署名認可レスポンスを上乗せします。Baseline プランが検証する内容はこのプランでも全て実行され、プロファイル定数を切り替えるだけで JARM が自動有効化されます。

| 検証範囲 | 有効化に必要なオプション | 解説ページ |
|---|---|---|
| FAPI 2.0 Baseline の全項目（上記） | `op.WithProfile(profile.FAPI2MessageSigning)` | （上記と同じ） |
| 署名された認可レスポンス（JARM） | プロファイルが `feature.JARM` を有効化 | [/ja/concepts/fapi](/ja/concepts/fapi)（JARM セクション） |
| token レスポンスの ID トークン署名 | プロファイルが強制 | [/ja/concepts/tokens](/ja/concepts/tokens) |
| request object 署名 (`PS256` / `ES256`) | プロファイルが強制 | [/ja/concepts/fapi](/ja/concepts/fapi) |

### `fapi-ciba-id1-test-plan` — FAPI-CIBA（Client-Initiated Backchannel Authentication）

CIBA プランは OpenID Connect Client-Initiated Backchannel Authentication grant を検証します。クライアントから開始された認証要求が、ユーザの認証デバイス（プッシュ通知、IVR 等）で非同期に完了し、ポーリング型の token 要求で消費される — という流れです。OP は poll mode で動作し、FAPI-CIBA は FAPI 1.0 のハードコード要件を引き継ぎ `tls_client_certificate_bound_access_tokens` を必須にするため、mTLS 送信者制約が必須です。

| 検証範囲 | 有効化に必要なオプション | 解説ページ |
|---|---|---|
| `/bc-authorize` エンドポイント + `auth_req_id` | `op.WithCIBA(op.WithCIBAHintResolver(...))` | [/ja/use-cases/ciba](/ja/use-cases/ciba) |
| ヒント解決（`login_hint` / `id_token_hint` / `login_hint_token`） | 組み込み側が `HintResolver` を提供 | [/ja/use-cases/ciba](/ja/use-cases/ciba) |
| ポーリング規律（`authorization_pending` / `slow_down`） | 既定で有効、`op.WithCIBAPollInterval(...)` で advertised interval を上書き可 | [/ja/use-cases/ciba](/ja/use-cases/ciba) |
| ポーリング濫用ロックアウトの上限 | 既定 `5` strikes、`op.WithCIBAMaxPollViolations(n)` で上下に調整可 | [/ja/use-cases/ciba](/ja/use-cases/ciba) |
| `tls_client_certificate_bound_access_tokens`（FAPI-CIBA 必須） | `op.WithProfile(profile.FAPICIBA)` が `feature.MTLS` を有効化 | [/ja/concepts/mtls](/ja/concepts/mtls) |
| `/bc-authorize` への署名 `request` object | `op.WithFeature(feature.JAR)`（FAPI-CIBA で自動） | [/ja/concepts/fapi](/ja/concepts/fapi) |
| `request_object` の `iat` / `exp` クレーム必須化（FAPI-CIBA §5.2.2） | プロファイルが強制 | [/ja/concepts/fapi](/ja/concepts/fapi) |

### REVIEW / SKIPPED / WARNING / FAILED の意味

- <span class="ofcs-dot review"></span>**REVIEW** — テストは実行されたが、ハーネスでは正直に検証できない視覚的 / out-of-band の挙動（同意 UI の文言、エラー画面のスクリーンショット、証明書チェーンの確認）を人間のレビュアーが裏取りする必要がある状態。失敗ではない。
- <span class="ofcs-dot skip"></span>**SKIPPED** — テストが依存する機能を、この OP が discovery やクライアントメタデータで宣言していないために OFCS が実行を見送った状態。例えば `RS256` 負例テストは、FAPI クライアントが `PS256` を署名 alg として宣言しているため適用外になる。失敗ではない。
- <span class="ofcs-dot" style="background:var(--vp-c-divider)"></span>**WARNING** — OFCS が非 failure の result value として記録する状態。主たる assertion は終端 PASS まで到達したが、運用者が対処すべき advisory がログに残っている場合に使われます。現在の snapshot では **0 件** です。
- <span class="ofcs-dot fail"></span>**FAILED** — module が suite の期待結果に到達しませんでした。v1.0.0 snapshot の 6 件は、恒久的な ES256-only 署名方針による 4 件と、back-channel logout を意図的に subject 単位に留めていることによる 2 件です。いずれもレビュー済みの release exclusion で、明示的かつ期限内の記録がなければ release verifier は失敗します。
- <span class="ofcs-dot noverdict"></span>**未判定** — ハーネスが終端結果を得られませんでした。現在の 2 module はプロセス内の署名鍵ローテーションを必要とするものと、ES256-only OP が正しく拒否する RS256 request object を待ち続けるものです。いずれもレビュー済みの release exclusion です。

### 自分で conformance を回すには

1. 該当プロファイルを組み込んだ OP を立ち上げます — security プロファイルなら `op.WithProfile(profile.FAPI2Baseline)`、message signing なら `op.WithProfile(profile.FAPI2MessageSigning)`、FAPI-CIBA なら `op.WithProfile(profile.FAPICIBA)` と CIBA オプション、OIDC Core プランなら `WithProfile` 無し。
2. プランを OFCS deployment に登録します。conformance suite は OpenID Foundation が運用しています。ソースリポジトリの `conformance/` 配下にプランテンプレートとローカル起動用の固定 Docker イメージが入っています。
3. プランを実行します。ハーネスは `/authorize`、`/par`、`/token`、`/userinfo`、`/jwks` ほか discovery で公開された各エンドポイントを必須経路で全て呼び出し、JSON スナップショットを書き出します。記録済 baseline との差分が取れます。

詳細な runbook（`make` ターゲット、JSON スナップショットの構造、差分ゲート）は下の[自分でベースラインを再現する](#自分でベースラインを再現する)を参照してください。

## REVIEW と FAILED の違い

OFCS は主に `PASSED`、`FAILED`、`REVIEW`、`SKIPPED` を返します。本ハーネスは OFCS が advisory として出す `WARNING` result もそのまま保持します。**REVIEW はテスト失敗を意味しません。** 自動化では確認できない箇所を人間の運用者に確認してほしい、という意味です — 例「OP はここでログイン画面を表示したか？」。テストは実行され、スクリーンショットを撮り、誰かが OFCS UI で「review 済み」をクリックするまで `WAITING` に留まります。本ハーネスはそこに到達してエラーが出なければ `REVIEW` を記録します。

::: details なぜ REVIEW を auto-pass しないか
conformance suite は意図的にこれらの module を人間の判断にゲートしています。ヘッドレスで動く `cmd/op-demo` は「これがユーザに見えた画面です」というスクリーンショットを誠実にアップロードできません。ゲートを外して通してしまうのは、実際にチェックされた内容を偽ることになります。ハーネスは `REVIEW` のまま記録し、有償認証取得時は UI を見ながら通すことを前提にしています。
:::

## 現在 FAILED の module — 理由

3 plan にまたがる 6 module です。各行は `conformance/release-exclusions.json` のレビュー済み・期限付きエントリと対応しており、記録が欠けている・担当者が無い・期限切れのいずれかであれば `make conformance-release-verify` がリリースを止めます。

| Module | Plan | 失敗する理由 |
|---|---|---|
| `oidcc-discovery-endpoint-verification` | `oidcc-config` | `id_token_signing_alg_values_supported` が `ES256` しか列挙しておらず、この module は OIDC Core 1.0 §15.1 の `RS256` 必須要件を検証するため。 |
| `oidcc-discovery-endpoint-verification` | `oidcc-dynamic` | 同じ assertion、同じ原因が dynamic プランでも発生。 |
| `oidcc-idtoken-rs256` | `oidcc-dynamic` | `id_token_signed_response_alg=RS256` で登録を要求するが、動的クライアント登録が `invalid_client_metadata` を返すため assertion まで到達しない。 |
| `oidcc-userinfo-rs256` | `oidcc-dynamic` | `userinfo_signed_response_alg=RS256` について同様。 |
| `oidcc-backchannel-logout-discovery-endpoint-verification` | `oidcc-backchannel-rp-initiated-logout` | 本 OP は仕様上許容される `backchannel_logout_session_supported: false` を広告するが、この module がそれを認めないため。 |
| `oidcc-backchannel-rp-initiated-logout` | `oidcc-backchannel-rp-initiated-logout` | 上の module から連鎖。プランがその assertion で中断するため、この module は実行に到達しない。 |

## 現在 未判定 の module — 理由

ハーネスが終端結果まで駆動できなかった 2 module です。いずれも実稼働中の suite に対する単体実行で得た証跡付きで記録しています。

| Module | Plan | 判定が出ない理由 |
|---|---|---|
| `oidcc-server-rotate-keys` | `oidcc-dynamic` | 運用者が署名鍵をローテーションして Start を押すのを待つ module です。鍵束は `op.New` で確定し、プラン実行中に provider を作り直すと登録済みクライアントを保持する in-memory store が失われます。module は runner の idle 上限まで `CONFIGURED` のまま留まります。 |
| `oidcc-request-uri-signed-rs256` | `oidcc-dynamic` | `RS256` 署名の request object を push し、認可レスポンスの成功を待つ module です。ES256-only の OP はリダイレクト前に拒否します — これが正しい挙動であり、コールバックが届かないため suite はどちらの結果も記録できません。 |

## 現在 REVIEW の module

### `oidcc-basic` plan (4)

| Module | ゲート対象 |
|---|---|
| `oidcc-ensure-registered-redirect-uri` | OP が未登録 `redirect_uri` を拒否したことの手動確認 |
| `oidcc-max-age-1` | `max_age=1` でユーザを再プロンプトしたことの手動確認 |
| `oidcc-prompt-login` | `prompt=login` で再プロンプトしたことの手動確認 |
| `oidcc-response-type-missing` | `response_type` が無いリクエストに対する first-party error page の手動確認 |

### FAPI 2.0 plans (各 9、同集合)

これらは全て、OP のエラーページのスクリーンショット upload か「ユーザが実際に再プロンプトされたか」の手動判断にゲートされます。ヘッドレスでも問題なく実行できますが、人間のサインオフが入るまでは `REVIEW` に留まります（`fapi2-security-profile-id2` と `fapi2-message-signing-id1` の両プランで同じ 9 件が REVIEW になり、合計 18 件です）:

- `fapi2-…-ensure-different-nonce-inside-and-outside-request-object`
- `fapi2-…-ensure-different-state-inside-and-outside-request-object`
- `fapi2-…-ensure-request-object-with-long-nonce`
- `fapi2-…-ensure-request-object-with-long-state`
- `fapi2-…-ensure-unsigned-authorization-request-without-using-par-fails`
- `fapi2-…-par-attempt-reuse-request_uri`
- `fapi2-…-par-attempt-to-use-expired-request_uri`
- `fapi2-…-par-attempt-to-use-request_uri-for-different-client`
- `fapi2-…-state-only-outside-request-object-not-used`

OP は各ケースで正しい HTTP エラーを返します（負例テストの内部 assertion は通過）— OFCS が描画されたエラー UI を人間に inspect してもらいたいだけです。

## 現在 WARNING の module

現在の snapshot ではありません。以前 `WARNING` だった `fapi-ciba-id1-refresh-token` は、通常の `PASSED` module になっています。

## 現在 SKIPPED の module — 理由

| Module | 理由 |
|---|---|
| `fapi2-…-ensure-signed-client-assertion-with-RS256-fails`（×2） | プランで使う FAPI クライアントが `token_endpoint_auth_signing_alg=PS256` を登録しているため、OFCS はクライアント別 `RS256` 負例を fapi2 系両プランでスキップ。 |
| `fapi2-message-signing-…-ensure-signed-request-object-with-RS256-fails` | 同様 — FAPI クライアントの `request_object_signing_alg=PS256` が `RS256` 負例を該当外にする。 |
| `fapi-ciba-id1-ensure-request-object-signature-algorithm-is-RS256-fails` | FAPI-CIBA クライアントが `request_object_signing_alg=PS256` を登録しているためスキップ。 |
| `fapi-ciba-id1-ensure-client-assertion-signature-algorithm-in-backchannel-authorization-request-is-RS256-fails` | 同様 — CIBA クライアントの `token_endpoint_auth_signing_alg=PS256`。 |
| `fapi-ciba-id1-ensure-client-assertion-signature-algorithm-in-token-endpoint-request-is-RS256-fails` | 同様。 |
| `oidcc-ensure-request-object-with-redirect-uri` | `oidcc-basic` プランは JAR を有効化しないため、OP は discovery から `request_object_signing_alg_values_supported` を省略し OFCS はスキップ。 |
| `oidcc-unsigned-request-object-supported-correctly-or-rejected-as-unsupported` | 同様 — JAR off、`request` パラメータ無し、OFCS スキップ。 |

::: tip "SKIPPED" は意図的、「走らなかった」ではない
OFCS のスキップ判定は、discovery とクライアント別メタデータが宣伝する内容に基づきます。プラン内の FAPI クライアントは `PS256` をトークンエンドポイント認証 / request object 署名 alg として宣言しているため、OFCS の「`RS256` は失敗すべき」プローブは適用外と判定され、「実際に実行して pass を記録する」のではなく skipped になります。
:::

## 自分でベースラインを再現する

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
make conformance-up
make conformance-baseline LABEL=local-check
ls conformance/baselines/   # JSON スナップショットがここに着地
```

ハーネスは:

1. 自己署名 RSA-2048 証明書を生成（`scripts/conformance.sh certs`）。
2. `https://localhost:8443` で OFCS Docker スタックを立ち上げ。
3. `https://127.0.0.1:9443` で `cmd/op-demo` をビルド・起動。
4. OFCS REST API 経由で plan を seed。ハーネスは 9 plan を scaffold し、上の最新 status table は 9 plan 全体を記録しています。
5. module 毎の pass/fail を決定論的 JSON に記録。

`make conformance-baseline-diff` は 2 スナップショット間で `PASSED` を **失った** module があれば非ゼロ終了 — セキュリティ関連変更に対するプロジェクトのプリマージゲートです。

## このコードベースでの FAPI 2.0 の意味

`op.WithProfile(profile.FAPI2Baseline)` は 2 つの `fapi2-*` plan が想定する設定を有効化します:

- `feature.PAR`（`FAPI2Baseline` で自動有効化） — `/par` がルート可能、`/authorize` で `request_uri` を受理
- `feature.JAR`（`FAPI2Baseline` で自動有効化） — `request` / `request_uri` を署名 JWT として検証
- `feature.JARM`（`FAPI2MessageSigning` で追加で自動有効化） — 認可レスポンスを JWT として署名
- 送信者制約付きアクセストークン — プロファイルは DPoP-or-mTLS 要件を課します。組み込み側が `feature.MTLS`（`cnf.x5t#S256`）を明示的に有効化した場合はそれで要件を満たし、DPoP 既定は追加されません。どちらも明示されていない場合、`op.New` は `feature.DPoP`（`cnf.jkt`）を標準の既定として選ぶため、素の `op.WithProfile(profile.FAPI2Baseline)` でも sender-constrained access token 付きで起動します。DPoP が有効なら discovery は `dpop_signing_alg_values_supported: ES256, EdDSA, PS256` を宣伝
- JOSE alg 許可リストはコードベース全体で `RS256 / PS256 / ES256 / EdDSA` にロック、`HS*` と `none` は **構造的** に到達不能（`internal/jose/alg.go` 参照）
- `token_endpoint_auth_methods_supported` を FAPI 本番経路（`private_key_jwt`）に交差
- `redirect_uri` 完全一致を強制
- クライアント別 `RequestObjectSigningAlg` / `TokenEndpointAuthSigningAlg` で各 FAPI クライアントを `PS256`（または `ES256` / `EdDSA`）に絞り込みつつ、discovery doc にはコードベース全体のリストを掲載

`WithProfile` 後にプロファイルと衝突するオプションを設定すると、`op.New(...)` は本番に partial-FAPI を出さず構築時エラーを返します。

## ハーネスの構成ファイル

| Path | 内容 |
|---|---|
| `conformance/README.md` | 運用 runbook |
| `conformance/plans/*.json` | プランテンプレート（server / client / resource ブロック） |
| `conformance/docker-compose.yml` | OFCS イメージのタグ固定（`release-v5.2.1`）+ JKS truststore 実装 |
| `scripts/conformance.sh` | `certs` / `ofcs-up` / `op-up` / `seed-plans` / `drive` / `batch` |
| `tools/conformance/ofcs.py` | REST クライアント + ヘッドレス drive スクリプト |
| `conformance/baselines/*.json` | 取得済スナップショット（gitignored — 環境依存） |

## 明示しておく制限事項

- **プランスイートのバージョン。** OFCS は `release-v5.2.1` で固定しています。新しい OFCS リリースで追加・改名されたテストは、固定バージョンを引き上げるまで対象外です。
- **ヘッドレス実行。** 実行スクリプトは OFCS の REST API をリバースエンジニアリングしているもので、OFCS 側にドキュメントはありません。挙動確認は v5.2.1 でしか取れていません。
- **本物の RP 証明書なし。** mTLS プラン枠は `conformance/certs/` の生成済み自己署名証明書を使っており、プランをインスタンス化できる程度に整えてあるだけです。本物の CA チェーン検証はしていません。
- **OP インスタンス 1 個。** インスタンス間挙動（例: ストア共有の OP 2 個でのトークン introspection）は OFCS ではなく `test/scenarios` で検査します。

conformance ハーネスは `test/scenarios/` 配下の in-process Spec Scenario Suite と並走します。前者はライブ OP に対して HTTP 経由で end-to-end に実行し、後者は同じプロトコル不変条件を in-process で実行します — 両方が緑であることをセキュリティ関連変更の前提にしています。
