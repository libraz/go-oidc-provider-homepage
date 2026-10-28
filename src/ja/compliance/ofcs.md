---
title: OFCS 適合状況
description: go-oidc-provider が OpenID Foundation Conformance Suite に対してどう走るか — 9 プラン、最新スコア、失敗が設計判断である理由、REVIEW の意味。
pageClass: pg-compliance-ofcs
---

# OFCS 適合状況

`go-oidc-provider` は [OpenID Foundation Conformance Suite (OFCS)][ofcs] に対して回帰検査されています。ハーネスはソースリポジトリの [`conformance/`][harness] に置かれており、9 つの OFCS プランを準備します。本ページのベースラインは、v1.4.0 のリリース候補（コミット [`6b37232`](https://github.com/libraz/go-oidc-provider/commit/6b3723292cb6763faf2aff35be9acbc3117888d8)）で取得した run で、`cmd/op-demo` インスタンスに対して end-to-end で実行しました。この run から `v1.4.0` タグまでのコミットが変更するのは、テスト、モジュールの pin、conformance のイメージ tag だけです。

[ofcs]: https://gitlab.com/openid/conformance-suite
[harness]: https://github.com/libraz/go-oidc-provider/tree/main/conformance

::: warning 個人開発、認証取得は無し
これは個人開発者が維持するプロジェクトです。OpenID Foundation 会員費は支払っておらず、**形式的な OIDC 認証は取得していません**。本ページの数値は、下に示すプラン集合の再現可能なスナップショットです。これは有償の OpenID Foundation 認証の代替ではなく、そのように引用しないでください。
:::

<figure class="fig">
  <div class="fig-head">9 プランを入れ、module ごとに結果が 1 つ出る</div>
  <svg class="fig-svg" role="img" aria-labelledby="ofcs-shape-title" viewBox="0 0 960 408" xmlns="http://www.w3.org/2000/svg">
    <title id="ofcs-shape-title">4 つの仕様ファミリにまたがる 9 本の適合テストプランを、デモ用 OP に対して実行します。各プランの各 module は、passed・review・skipped・未判定・failed のいずれか 1 つに分類されます。</title>
    <text class="fg-lbl" x="32" y="40">テストプラン — 全 9 本</text>
    <text class="fg-lbl" x="640" y="40">module ごとの結果</text>
    <!-- plans -->
    <rect class="fg-box" x="32" y="96" width="288" height="256" rx="8"/>
    <text class="fg-t2" x="48" y="124">OIDC Core 1.0</text>
    <text class="fg-s" x="48" y="148">6 プラン</text>
    <line class="fg-rule" x1="48" y1="160" x2="304" y2="160"/>
    <text class="fg-t2" x="48" y="188">FAPI 2.0 Baseline</text>
    <text class="fg-s" x="48" y="212">1 プラン</text>
    <line class="fg-rule" x1="48" y1="224" x2="304" y2="224"/>
    <text class="fg-t2" x="48" y="252">FAPI 2.0 Message Signing</text>
    <text class="fg-s" x="48" y="276">1 プラン</text>
    <line class="fg-rule" x1="48" y1="288" x2="304" y2="288"/>
    <text class="fg-t2" x="48" y="316">FAPI-CIBA</text>
    <text class="fg-s" x="48" y="340">1 プラン</text>
    <path class="fg-edge fg-edge--accent" d="M320,224 H360" marker-end="url(#fg-ac)"/>
    <!-- op under test -->
    <rect class="fg-box fg-box--accent" x="360" y="188" width="240" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="376" y="216">cmd/op-demo</text>
    <text class="fg-s" x="376" y="240">テスト対象の OP</text>
    <path class="fg-edge fg-edge--accent" d="M600,224 H640" marker-end="url(#fg-ac)"/>
    <!-- outcomes -->
    <rect class="fg-box" x="640" y="64" width="288" height="320" rx="8"/>
    <rect class="fg-fill--ok" x="656" y="80" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="92">PASSED</text>
    <text class="fg-s" x="680" y="116">全条件を満たした</text>
    <line class="fg-rule" x1="656" y1="128" x2="912" y2="128"/>
    <rect class="fg-fill--warn" x="656" y="144" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="156">REVIEW</text>
    <text class="fg-s" x="680" y="180">人の確認を求めている</text>
    <line class="fg-rule" x1="656" y1="192" x2="912" y2="192"/>
    <rect class="fg-fill--muted" x="656" y="208" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="220">SKIPPED</text>
    <text class="fg-s" x="680" y="244">この構成には該当しない</text>
    <line class="fg-rule" x1="656" y1="256" x2="912" y2="256"/>
    <rect class="fg-dot" x="656" y="272" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="284">未判定</text>
    <text class="fg-s" x="680" y="308">実行したが結果が出なかった</text>
    <line class="fg-rule" x1="656" y1="320" x2="912" y2="320"/>
    <rect class="fg-fill--danger" x="656" y="336" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="348">FAILED</text>
    <text class="fg-s" x="680" y="372">満たせなかった条件がある</text>
  </svg>
  <figcaption class="fig-note">欠陥を意味するのは最後の行だけです。中間の 3 つは、スイートが判定を差し控えている状態を表します。この構成には該当しないか、人が判断すべき結果だからです。</figcaption>
</figure>

## この snapshot が検査する範囲

| Plan | カバー範囲 | プロファイル |
|---|---|---|
| `oidcc-basic-certification-test-plan` | 認可コード + PKCE、ID トークン、UserInfo、refresh、discovery | OIDC Core 1.0 |
| `oidcc-config-certification-test-plan` | discovery ドキュメントと公開 JWKS の形 | OIDC Core 1.0 — Discovery |
| `oidcc-dynamic-certification-test-plan` | 動的クライアント登録と、そこで登録したクライアントによる認可コードフロー | OIDC Core 1.0 — Dynamic Registration |
| `oidcc-formpost-basic-certification-test-plan` | basic プランを `response_mode=form_post` で再実行 | OIDC Core 1.0 — `form_post` |
| `oidcc-rp-initiated-logout-certification-test-plan` | `/end_session`、`id_token_hint`、`post_logout_redirect_uri` | RP-Initiated Logout 1.0 |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | RP 起点のログアウトと、登録済みバックチャネル URI への `logout_token` 送達 | Back-Channel Logout 1.0 |
| `fapi2-security-profile-id2-test-plan` | + PAR、送信者制約付きアクセストークン（DPoP）、厳格 alg list、`redirect_uri` 完全一致 | FAPI 2.0 Baseline |
| `fapi2-message-signing-id1-test-plan` | + JAR（署名 authorization request）、JARM（署名 authorization response） | FAPI 2.0 Message Signing |
| `fapi-ciba-id1-test-plan` | Client-Initiated Backchannel Authentication（poll mode）、mTLS バインドトークン | FAPI-CIBA |

`fapi2-security-profile-id2` と `fapi2-message-signing-id1` は、このハーネスに組み込まれた Implementer's Draft 世代の plan です。結果が示すのはこれらの plan と対応するライブラリ設定であり、現行の FAPI 2.0 Security Profile Final への適合を証明するものではありません。特に Final §5.3.2.1(9) は refresh token のローテーションを例外的な状況に限っていますが、ライブラリとこれらの plan は既定でローテーションを実行します。

## 最新 baseline

<div class="ofcs-summary">
  <div class="ofcs-headline">
    <b>270 件中 210 件</b>
    <span>の module が PASSED — 9 plan 合計の 77.8%</span>
  </div>
  <div class="ofcs-scale"><span>0</span><span>270 module — run 全体</span></div>
  <div class="ofcs-track">
    <div class="ofcs-stack" role="img" aria-label="270 module のうち PASSED 210、REVIEW 38、SKIPPED 14、未判定 2、FAILED 6">
      <i class="pass" style="flex:210"></i>
      <i class="review" style="flex:38"></i>
      <i class="skip" style="flex:14"></i>
      <i class="noverdict" style="flex:2"></i>
      <i class="fail" style="flex:6"></i>
    </div>
  </div>
  <ul class="ofcs-legend">
    <li><span class="ofcs-dot pass"></span>PASSED<b>210</b><em>77.8%</em></li>
    <li><span class="ofcs-dot review"></span>REVIEW<b>38</b><em>14.1%</em></li>
    <li><span class="ofcs-dot skip"></span>SKIPPED<b>14</b><em>5.2%</em></li>
    <li><span class="ofcs-dot noverdict"></span>未判定<b>2</b><em>0.7%</em></li>
    <li><span class="ofcs-dot fail"></span>FAILED<b>6</b><em>2.2%</em></li>
    <li><span class="ofcs-dot" style="background:var(--vp-c-divider)"></span>WARNING<b>0</b><em>0.0%</em></li>
  </ul>
  <p class="ofcs-note">FAILED と未判定の module はすべてレビュー済みの release exclusion です — <a href="#failed-6-件の理由">原因は 3 つだけで、未解決の欠陥はありません</a>。</p>
  <div class="ofcs-meta">
    <span><i>取得日時</i>2026-10-22T16:26:08Z</span>
    <span><i>リポジトリ SHA</i><a href="https://github.com/libraz/go-oidc-provider/commit/6b3723292cb6763faf2aff35be9acbc3117888d8">6b37232</a></span>
    <span><i>OFCS リリース</i>release-v5.3.3（run のラベル）</span>
  </div>
</div>

::: info スナップショットの状態
上のバーは 9 plan 全体の raw 結果で、OFCS `release-v5.3.3` に対して実行したものです。スイートのリリースは run のラベルに記録されています。JSON artifact は `conformance/baselines/` 配下のローカル・gitignore 対象ファイルで、イメージの tag も digest も保存していません。`make conformance-release-verify` はこの run を blocker 0 と判定しました。raw failure はすべて `conformance/release-exclusions.json` のレビュー済み・期限付きエントリと、未判定の module は証跡付きのエントリと、REVIEW と SKIPPED の module はレビュー済みのルールと照合されています。この判定は OIDC 認証ではありません。
:::

### FAILED 6 件の理由

FAILED と未判定の module は、すべて 3 つの原因のいずれかに帰着します。うち 2 つは現在の設計判断で、残る 1 つはヘッドレス実行の限界です。未解決の欠陥はひとつもなく、いずれも `conformance/release-exclusions.json` に担当者と期限付きで記録されています。

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
      <p>本 OP は <code>backchannel_logout_session_supported: false</code> を広告し、<code>sid</code> ではなく subject 単位でログアウトします。このメタデータは仕様上 optional ですが、この certification module は無条件に <code>true</code> を要求し、プラン残りも同じ assertion で中断します。<code>sid</code> 単位のセッションスコープログアウトは現在有効化しておらず、subject 単位は fail-secure 側の既定です。<a href="/ja/use-cases/back-channel-logout">バックチャネルログアウト</a></p>
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

バーは plan 1 件ごとに独立した尺度で、全幅がその plan 自身の module 数です。行の右端に分子と分母を出しているので、各区分は run 全体ではなくその plan に対する割合として読めます。plan の規模はバーの長さではなくこの数字で見てください。件数 0 の結果は行に出しません。

<div class="ofcs-plans">
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-basic-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>30</b> / 35 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-basic-certification-test-plan、35 module のうち PASSED 30、REVIEW 3、SKIPPED 2">
        <i class="pass" style="flex:30"></i>
        <i class="review" style="flex:3"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>30</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>3</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-config-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>0</b> / 1 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-config-certification-test-plan、1 module のうち FAILED 1">
        <i class="fail" style="flex:1"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot fail"></span><b>1</b> FAILED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-dynamic-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>7</b> / 23 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-dynamic-certification-test-plan、23 module のうち PASSED 7、REVIEW 6、SKIPPED 5、未判定 2、FAILED 3">
        <i class="pass" style="flex:7"></i>
        <i class="review" style="flex:6"></i>
        <i class="skip" style="flex:5"></i>
        <i class="noverdict" style="flex:2"></i>
        <i class="fail" style="flex:3"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>7</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>6</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>5</b> SKIPPED</span>
      <span><span class="ofcs-dot noverdict"></span><b>2</b> 未判定</span>
      <span><span class="ofcs-dot fail"></span><b>3</b> FAILED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-formpost-basic-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>30</b> / 35 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-formpost-basic-certification-test-plan、35 module のうち PASSED 30、REVIEW 3、SKIPPED 2">
        <i class="pass" style="flex:30"></i>
        <i class="review" style="flex:3"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>30</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>3</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-rp-initiated-logout-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>3</b> / 11 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-rp-initiated-logout-certification-test-plan、11 module のうち PASSED 3、REVIEW 8">
        <i class="pass" style="flex:3"></i>
        <i class="review" style="flex:8"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>3</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>8</b> REVIEW</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-backchannel-rp-initiated-logout-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>0</b> / 2 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-backchannel-rp-initiated-logout-certification-test-plan、2 module のうち FAILED 2">
        <i class="fail" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot fail"></span><b>2</b> FAILED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi2-security-profile-id2-test-plan</span>
      <span class="ofcs-plan-score"><b>48</b> / 58 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="fapi2-security-profile-id2-test-plan、58 module のうち PASSED 48、REVIEW 9、SKIPPED 1">
        <i class="pass" style="flex:48"></i>
        <i class="review" style="flex:9"></i>
        <i class="skip" style="flex:1"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>48</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>9</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>1</b> SKIPPED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi2-message-signing-id1-test-plan</span>
      <span class="ofcs-plan-score"><b>60</b> / 71 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="fapi2-message-signing-id1-test-plan、71 module のうち PASSED 60、REVIEW 9、SKIPPED 2">
        <i class="pass" style="flex:60"></i>
        <i class="review" style="flex:9"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>60</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>9</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi-ciba-id1-test-plan</span>
      <span class="ofcs-plan-score"><b>32</b> / 34 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="fapi-ciba-id1-test-plan、34 module のうち PASSED 32、SKIPPED 2">
        <i class="pass" style="flex:32"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>32</b> PASSED</span>
      <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
    </span>
  </div>
</div>

::: details 同じ snapshot を表で見る
| Plan                                       | PASSED | REVIEW | SKIPPED | WARNING | FAILED | 未判定 | 合計 |
|--------------------------------------------|-------:|-------:|--------:|--------:|-------:|-------:|------:|
| `oidcc-basic-certification-test-plan`      |     30 |      3 |       2 |       0 |       0 |      0 |    35 |
| `oidcc-config-certification-test-plan`     |      0 |      0 |       0 |       0 |  **1** |      0 |     1 |
| `oidcc-dynamic-certification-test-plan`    |      7 |      6 |       5 |       0 |  **3** |      2 |    23 |
| `oidcc-formpost-basic-certification-test-plan` | 30 |      3 |       2 |       0 |       0 |      0 |    35 |
| `oidcc-rp-initiated-logout-certification-test-plan` | 3 | 8 | 0 | 0 | 0 | 0 | 11 |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | 0 | 0 | 0 | 0 | **2** | 0 | 2 |
| `fapi2-security-profile-id2-test-plan`     |     48 |      9 |       1 |       0 |       0 |      0 |    58 |
| `fapi2-message-signing-id1-test-plan`      |     60 |      9 |       2 |       0 |       0 |      0 |    71 |
| `fapi-ciba-id1-test-plan`                  |     32 |      0 |       2 |       0 |       0 |      0 |    34 |
| **合計**                                  | **210**| **38** |  **14** |   **0** |  **6** |  **2** | **270** |
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
| 標準スコープ（`profile`、`email`、`address`、`phone`） | スコープごとに `op.WithScope(...)` を 1 回ずつ | [/ja/concepts/scopes-and-claims](/ja/concepts/scopes-and-claims) |
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
| リフレッシュトークンのローテーションと再利用検知 | ライブラリの既定で有効、チェックイン済みの Implementer's Draft 世代 plan でも検証。ただし現行 FAPI Final §5.3.2.1(9) はローテーションを例外的な状況に限り、使う場合は時間制限付き retry 経路を要求 | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |

### `fapi2-message-signing-id1-test-plan` — FAPI 2.0 Message Signing

Message Signing は Baseline に署名認可レスポンスを上乗せします。Baseline プランが検証する内容はこのプランでも全て実行され、プロファイル定数を切り替えるだけで JARM が自動有効化されます。

| 検証範囲 | 有効化に必要なオプション | 解説ページ |
|---|---|---|
| FAPI 2.0 Baseline の全項目（上記） | `op.WithProfile(profile.FAPI2MessageSigning)` | （上記と同じ） |
| 署名された認可レスポンス（JARM） | プロファイルが `feature.JARM` を有効化 | [/ja/concepts/fapi](/ja/concepts/fapi)（JARM セクション） |
| token レスポンスの ID トークン署名 | プロファイルが強制 | [/ja/concepts/tokens](/ja/concepts/tokens) |
| request object 署名（`PS256` / `ES256`） | プロファイルが強制 | [/ja/concepts/fapi](/ja/concepts/fapi) |

### `fapi-ciba-id1-test-plan` — FAPI-CIBA（Client-Initiated Backchannel Authentication）

CIBA プランは OpenID Connect Client-Initiated Backchannel Authentication grant を検証します。クライアントから開始された認証要求が、ユーザの認証デバイス（プッシュ通知、IVR 等）で非同期に完了し、ポーリング型の token 要求で消費される流れです。OP は poll mode で動作します。旧 FAPI-CIBA-ID1 プランは mTLS 証明書バインドのアクセストークンを使うため、デモは `feature.MTLS` を明示して `tls_client_certificate_bound_access_tokens` のメタデータに合わせています。ライブラリの一般的な `profile.FAPICIBA` 設定は DPoP も認め、どちらも指定しなければ DPoP を選ぶため、この設定だけでは ID1 プランを再現しません。

| 検証範囲 | 有効化に必要なオプション | 解説ページ |
|---|---|---|
| `/bc-authorize` エンドポイント + `auth_req_id` | `op.WithCIBA(op.WithCIBAHintResolver(...))` | [/ja/use-cases/ciba](/ja/use-cases/ciba) |
| ヒント解決（`login_hint` / `id_token_hint` / `login_hint_token`） | 組み込み側が `HintResolver` を提供 | [/ja/use-cases/ciba](/ja/use-cases/ciba) |
| ポーリング規律（`authorization_pending` / `slow_down`） | 既定で有効、`op.WithCIBAPollInterval(...)` で advertised interval を上書き可 | [/ja/use-cases/ciba](/ja/use-cases/ciba) |
| ポーリング濫用ロックアウトの上限 | 既定 `5` strikes、`op.WithCIBAMaxPollViolations(n)` で上下に調整可 | [/ja/use-cases/ciba](/ja/use-cases/ciba) |
| 送信者制約付きアクセストークン | `op.WithProfile(profile.FAPICIBA)` は DPoP または mTLS を認め、指定がなければ DPoP を選ぶ。この OFCS デモは旧 ID1 プランに合わせて `feature.MTLS` を明示する | [/ja/concepts/sender-constraint](/ja/concepts/sender-constraint)、[/ja/concepts/mtls](/ja/concepts/mtls) |
| `/bc-authorize` への署名 `request` object | `op.WithFeature(feature.JAR)`（FAPI-CIBA で自動） | [/ja/concepts/fapi](/ja/concepts/fapi) |
| `request_object` の `iat` / `exp` claim 必須化（FAPI-CIBA §5.2.2） | プロファイルが強制 | [/ja/concepts/fapi](/ja/concepts/fapi) |

### REVIEW / SKIPPED / WARNING / FAILED の意味

- <span class="ofcs-dot review"></span>**REVIEW** — テストは実行されましたが、OP が描画したエラー画面や、ログイン画面が再表示されたかどうかなど、ハーネスからは見えない点を人間が確認する必要があります。スイートはスクリーンショットの提出段階で `WAITING` のまま待ち、OFCS の UI で誰かが「review 済み」にするまで進みません。ヘッドレス実行では `REVIEW` をそのまま記録します。失敗ではありません。
- <span class="ofcs-dot skip"></span>**SKIPPED** — テストが依存する機能を、この OP が discovery やクライアントメタデータで宣言していないため、スイートが実行しません。例えば `RS256` 負例テストは、OP が `ES256` だけで署名し、FAPI プランのクライアントが `PS256` を登録しているためスキップされます。失敗ではありません。
- <span class="ofcs-dot" style="background:var(--vp-c-divider)"></span>**WARNING** — テストは終端の PASS に到達しましたが、advisory がログに残った状態です。現在の snapshot では **0 件** です。
- <span class="ofcs-dot fail"></span>**FAILED** — module がスイートの期待する結果に到達しませんでした。この run の 6 件は、恒久的な ES256-only 署名方針による 4 件と、back-channel logout を意図的に subject 単位に留めていることによる 2 件です。いずれもレビュー済みの release exclusion で、明示的かつ期限内の記録がなければ release verifier は失敗します。
- <span class="ofcs-dot noverdict"></span>**未判定** — ハーネスが module を終端結果まで駆動できなかった状態です。1 件は module の途中で署名鍵のローテーションを要求します。もう 1 件は `RS256` 署名の request object を push しますが、OP は redirect 前に拒否するため、スイートは来ないコールバックを待ち続けます。どちらも、実稼働中の suite に対する単体実行の証跡付きで、レビュー済みの release exclusion に記録しています。

::: details なぜ REVIEW を auto-pass しないか
スイートは意図的に、これらの module を人間の判断に委ねています。ヘッドレスで動く `cmd/op-demo` は「ユーザに見えた画面です」というスクリーンショットを誠実にアップロードできません。この関門を外して通すと、実際に確認した内容を偽ることになります。ハーネスは `REVIEW` のまま記録し、OpenID Foundation の認証を取る場合は UI で一件ずつ人が解消する前提です。
:::

## 現在 FAILED の module — 理由

3 plan にまたがる 6 module です。各行は `conformance/release-exclusions.json` のレビュー済み・期限付きエントリと対応しており、記録が欠けている、担当者がいない、期限切れのいずれかであれば `make conformance-release-verify` がリリースを止めます。

| Module | Plan | 失敗する理由 |
|---|---|---|
| `oidcc-discovery-endpoint-verification` | `oidcc-config` | `id_token_signing_alg_values_supported` が `ES256` しか列挙しておらず、この module は OIDC Core 1.0 §15.1 の `RS256` 必須要件を検証するため。 |
| `oidcc-discovery-endpoint-verification` | `oidcc-dynamic` | 同じ assertion、同じ原因が dynamic プランでも発生。 |
| `oidcc-idtoken-rs256` | `oidcc-dynamic` | `id_token_signed_response_alg=RS256` で登録を要求するが、動的クライアント登録が `invalid_client_metadata` を返すため assertion まで到達しない。 |
| `oidcc-userinfo-rs256` | `oidcc-dynamic` | `userinfo_signed_response_alg=RS256` について同様。 |
| `oidcc-backchannel-logout-discovery-endpoint-verification` | `oidcc-backchannel-rp-initiated-logout` | 本 OP は仕様上許容される `backchannel_logout_session_supported: false` を広告するが、この module がそれを認めないため。 |
| `oidcc-backchannel-rp-initiated-logout` | `oidcc-backchannel-rp-initiated-logout` | 上の module から連鎖。プランがその assertion で中断するため、この module は実行に到達しない。 |

## 現在未判定の module — 理由

ハーネスが終端結果まで駆動できなかった 2 module です。いずれも実稼働中の suite に対する単体実行で得た証跡付きで記録しています。

| Module | Plan | 判定が出ない理由 |
|---|---|---|
| `oidcc-server-rotate-keys` | `oidcc-dynamic` | 運用者が署名鍵をローテーションして Start を押すのを待つ module です。鍵束は `op.New` で確定し、プラン実行中に provider を作り直すと登録済みクライアントを保持する in-memory store が失われます。module は runner の idle 上限まで `CONFIGURED` のまま留まります。 |
| `oidcc-request-uri-signed-rs256` | `oidcc-dynamic` | `RS256` 署名の request object を push し、認可レスポンスの成功を待つ module です。署名は `ES256` のみなので、`/auth` は redirect 前のエラーページで拒否し、スイートは OP が送ってはならないコールバックを待って `WAITING` のままになります。`oidcc-idtoken-rs256` の exclusion と同じ方針が、登録時ではなくリクエスト時にスイートへ現れたものです。 |

## 現在 REVIEW の module

38 件はすべて、OP が拒否または再プロンプトする場面で、スイートが検証できるコールバックがなく、描画された画面を人間に見てほしいというケースです。拒否そのものはライブラリ側のテストで固定しています。

| Plan | Module | 人間の確認が要る理由 |
|---|---|---|
| `oidcc-basic`、`oidcc-formpost-basic`（各 3 件） | `oidcc-ensure-registered-redirect-uri` | 未登録の `redirect_uri` へはリダイレクトしてはならないため、結果はエラーページになる。 |
| | `oidcc-max-age-1`、`oidcc-prompt-login` | セッションの再利用ではなく、ログイン画面が再び表示されたことを確認できるのは人間だけ。 |
| `oidcc-dynamic`（6 件） | `oidcc-ensure-redirect-uri-in-authorization-request`、`oidcc-redirect-uri-query-added`、`oidcc-redirect-uri-query-mismatch` | 1 行目と同じ。リダイレクトせずに拒否する。 |
| | `oidcc-registration-logo-uri`、`oidcc-registration-policy-uri`、`oidcc-registration-tos-uri` | 登録した URI が同意画面に出るかを人間に確認させる。表示されるかどうかは、組み込み側が用意する interaction driver で決まる。 |
| `oidcc-rp-initiated-logout`（8 件） | `oidcc-rp-initiated-logout-*` | どれも OP 自身が描画する画面（ログアウト確認、不正な `id_token_hint` や未登録の `post_logout_redirect_uri` のエラーページ）で終わる。拒否したログアウトは RP へ戻してはならないため。 |
| `fapi2-security-profile-id2`、`fapi2-message-signing-id1`（各 9 件） | 下の 9 module | PAR `request_uri` の拒否と request object の不一致は redirect 前に拒否され、確認用のエラーページが残る。 |

FAPI 2.0 の 9 module です（2 つのプランに同じ名前が並ぶため、合計 18 件）。

- `fapi2-…-ensure-different-nonce-inside-and-outside-request-object`
- `fapi2-…-ensure-different-state-inside-and-outside-request-object`
- `fapi2-…-ensure-request-object-with-long-nonce`
- `fapi2-…-ensure-request-object-with-long-state`
- `fapi2-…-ensure-unsigned-authorization-request-without-using-par-fails`
- `fapi2-…-par-attempt-reuse-request_uri`
- `fapi2-…-par-attempt-to-use-expired-request_uri`
- `fapi2-…-par-attempt-to-use-request_uri-for-different-client`
- `fapi2-…-state-only-outside-request-object-not-used`

## 現在 SKIPPED の module — 理由

14 件です。スキップは discovery とクライアント別メタデータの宣言から決まるため、ここに並ぶのは実行に失敗したテストではなく、意図して対応していない項目です。

| Module | Plan | 理由 |
|---|---|---|
| `fapi2-security-profile-id2-ensure-signed-client-assertion-with-RS256-fails` | `fapi2-*` の両プラン | OP は `ES256` のみで署名し、プランの FAPI クライアントは `token_endpoint_auth_signing_alg=PS256` を登録しているため、`RS256` の負例プローブが検証する対象がない。 |
| `fapi2-security-profile-id2-ensure-signed-request-object-with-RS256-fails` | `fapi2-message-signing-id1` | 同様。`request_object_signing_alg=PS256` が理由。（Message Signing プランは security-profile の module 名を流用している。） |
| `fapi-ciba-id1-ensure-request-object-signature-algorithm-is-RS256-fails` | `fapi-ciba-id1` | CIBA クライアントが `request_object_signing_alg=PS256` を登録している。 |
| `fapi-ciba-id1-ensure-client-assertion-signature-algorithm-in-token-endpoint-request-is-RS256-fails` | `fapi-ciba-id1` | 同様。`token_endpoint_auth_signing_alg=PS256` が理由。 |
| `oidcc-ensure-request-object-with-redirect-uri`、`oidcc-unsigned-request-object-supported-correctly-or-rejected-as-unsupported` | `oidcc-basic`、`oidcc-formpost-basic`（両方）、`oidcc-dynamic`（前者のみ） | 非 FAPI プランの request object 系 module。discovery が宣言する request object の対応状況からスイートがスキップする。OP は `alg=none` を受け付けない。署名付き request object は、JAR が必須の FAPI プランで実行している。 |
| `oidcc-request-uri-unsigned` | `oidcc-dynamic` | 同じ系統。`request_uri` の先が未署名の object である場合。 |
| `oidcc-idtoken-unsigned` | `oidcc-dynamic` | 未署名の ID トークンを要求する。OP はすべての ID トークンに署名し、`none` を宣言していない。 |
| `oidcc-registration-sector-bad`、`oidcc-registration-sector-uri` | `oidcc-dynamic` | `sector_identifier_uri` の module。pairwise サブジェクトは opt-in（`op.WithPairwiseSubject`）で、デモは dynamic プランを public サブジェクトで実行する。pairwise はライブラリ自身のテストと [`examples/34-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-pairwise-saas) で検証している。 |

## 自分でベースラインを再現する

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
make conformance-up
make conformance-baseline LABEL=local-check
ls conformance/baselines/   # JSON スナップショットがここに着地
```

`make conformance-up` は、証明書の生成、`https://localhost:8443` での OFCS コンテナ起動、`https://127.0.0.1:9443` での `cmd/op-demo` のビルドと起動、OFCS REST API 経由の 9 plan の登録までを行います。続く `make conformance-baseline` が全 module を駆動し、module ごとの結果を決定論的な JSON に記録します。`make conformance-baseline-diff` は、2 つのスナップショット間で `PASSED` を **失った** module があれば非ゼロで終了します。セキュリティ関連の変更をマージする前に、プロジェクトが使う回帰ゲートです。

各プランに必要な `op.With...` オプション、プランと起動フラグの対応表、リリースゲートは [OFCS 再現レシピ](/ja/compliance/ofcs-reproduce)にあります。差分の取り方は[ベースラインの取得と差分](/ja/compliance/ofcs-reproduce#reproduce-baseline)を参照してください。

## このコードベースでの FAPI 2.0 の意味

`op.WithProfile(profile.FAPI2Baseline)` は、2 つの `fapi2-*` プランが前提とする設定を有効にします。詳しい説明は [FAPI 2.0](/ja/concepts/fapi) にあります。プランが検証する要素は次のとおりです。

- `feature.PAR` と `feature.JAR`（どちらも `FAPI2Baseline` が自動で有効化）: `/oidc/par` がルーティングされ、`request` / `request_uri` を署名付き JWT として検証します。
- `feature.JARM`（`FAPI2MessageSigning` がさらに自動で有効化）: 認可レスポンスを署名付き JWT にします。
- 送信者制約付きアクセストークン: プロファイルは DPoP か mTLS のどちらかを要求します。組み込み側が `feature.MTLS`（`cnf.x5t#S256`）を有効にしていればそれで要件を満たし、DPoP の既定は追加されません。どちらも指定がなければ `op.New` が `feature.DPoP`（`cnf.jkt`）を選ぶため、素の `op.WithProfile(profile.FAPI2Baseline)` でも送信者制約付きで起動します。DPoP が有効なら、discovery は `dpop_signing_alg_values_supported: ES256, EdDSA, PS256` を宣言します。
- JOSE の alg 許可リストはコードベース全体で `RS256 / PS256 / ES256 / EdDSA` に固定され、`HS*` と `none` は構造的に到達できません（`internal/jose/alg.go` を参照）。
- `token_endpoint_auth_methods_supported` は FAPI の本番経路（`private_key_jwt`）に絞られ、`redirect_uri` は完全一致で判定します。
- クライアントごとの `RequestObjectSigningAlg` / `TokenEndpointAuthSigningAlg` で各 FAPI クライアントを `PS256`（または `ES256` / `EdDSA`）に絞ります。discovery にはコードベース全体のリストを載せたままです。

`WithProfile` のあとにプロファイルと衝突するオプションを設定すると、`op.New(...)` は構築時にエラーを返します。FAPI として中途半端な設定が本番に出ることはありません。

## ハーネスの構成ファイル

| Path | 内容 |
|---|---|
| `conformance/README.md` | 運用 runbook |
| `conformance/plans/*.json` | プランテンプレート（server / client / resource ブロック） |
| `conformance/docker-compose.yml` | 現在の OFCS イメージ pin（`release-v5.3.3`）と JKS truststore の設定 |
| `conformance/release-exclusions.json` | リリースゲートが受け入れる、レビュー済み・期限付きの例外 |
| `scripts/conformance.sh` | `certs` / `ofcs-up` / `op-up` / `seed-plans` / `drive` / `batch` / `baseline` / `baseline-diff` / `release-verify` |
| `tools/conformance/` | REST クライアント、ヘッドレス実行スクリプト、baseline と release-verify のロジック（Python） |
| `conformance/baselines/*.json` | 取得済みスナップショット（gitignored — 環境依存） |

## 明示しておく制限事項

- **プランスイートのバージョン。** 本ページの run には `ofcs-v5.3.3` のラベルが付いており、`docker-compose.yml` の現在の既定 pin は `release-v5.3.3` です。JSON artifact 自体にはイメージの tag も digest も記録されていません。
- **ヘッドレス実行。** 実行スクリプトは OFCS の REST API をリバースエンジニアリングしたもので、OFCS 側にドキュメントはありません。
- **本物の RP 証明書なし。** mTLS プラン枠は `conformance/certs/` の生成済み自己署名証明書を使っており、プランをインスタンス化できる程度に整えてあるだけです。本物の CA チェーン検証はしていません。
- **OP インスタンス 1 個。** インスタンス間の挙動（例: ストアを共有する 2 つの OP をまたぐトークン introspection）は OFCS ではなく `test/scenarios` で検査します。

conformance ハーネスは `test/scenarios/` 配下の in-process Spec Scenario Suite と並走します。OFCS はライブの OP に HTTP 経由で end-to-end に実行し、scenario suite は同じプロトコル不変条件を in-process で実行します。セキュリティ関連の変更は、両方が通ってからマージします。
