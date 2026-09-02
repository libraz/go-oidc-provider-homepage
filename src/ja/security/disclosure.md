---
title: 脆弱性報告 / CVE
description: go-oidc-provider のセキュリティ問題の報告経路、対応の流れ、サポート対象バージョンと advisory の最新情報の参照先を説明します。
pageClass: pg-security-disclosure
---

# 脆弱性報告 / CVE

::: warning 個人開発のセキュリティ運用について
go-oidc-provider は本業の合間に個人で維持しているプロジェクトです。脆弱性対応は **best-effort** で行います。報告は必ず人が読みますが、対応までの時間はメンテナの可処分時間に左右され、数日から数週間まで幅があります（SLA はありません）。契約上の応答時間が要件となる用途には向かないため、採用検討の前に必要要件と本プロジェクトの体制を突き合わせてください。
:::

## 脆弱性の報告方法

セキュリティに関わると思われるバグについて、**公開 GitHub issue を立てないでください**。

次のいずれかの経路で報告してください。

1. **GitHub Security Advisories** — [private report を作成](https://github.com/libraz/go-oidc-provider/security/advisories/new)（推奨。triage が早いです）
2. **メール** でメンテナ宛に: <SvgEmail />

報告に含めてほしい内容（分かる範囲で構いません）:

- 問題の概要と影響範囲。
- 再現手順または最小限の PoC。
- 影響を受けるバージョン（分かる範囲で）。
- 重大度の評価（CVSS は歓迎ですが必須ではありません）。

不足している項目があっても問題ありません。部分的な報告でも十分役に立ちますし、足りない情報はこちらから追って伺います。

ポリシーの正式版はソースリポジトリの [`SECURITY.md`](https://github.com/libraz/go-oidc-provider/blob/main/.github/SECURITY.md) にあります。本ページは同じ内容を読みやすい散文として書き直したものです。

## 報告後の流れ

報告を受領してからのおおまかな流れです。

<figure class="fig">
  <div class="fig-head">報告を送ったあと何が起きるか</div>
  <svg class="fig-svg" role="img" aria-labelledby="disclosure-flow-title" viewBox="0 0 960 420" xmlns="http://www.w3.org/2000/svg">
    <title id="disclosure-flow-title">脆弱性報告が辿る流れ。受領し、受領確認を返し、triage したうえで、スコープ外なら理由を添えてクローズし、有効なら修正・合意した期間での協調開示・リリースを経て GHSA を公開します。</title>
    <rect class="fg-box" x="280" y="24" width="400" height="54" rx="8"/>
    <text class="fg-t2" x="300" y="48">報告を受領</text>
    <text class="fg-xs" x="300" y="68">SECURITY.md に記載の窓口から非公開で</text>
    <path class="fg-edge fg-edge--thin" d="M480,80 V88" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="280" y="90" width="400" height="54" rx="8"/>
    <text class="fg-t2" x="300" y="114">受領確認</text>
    <text class="fg-xs" x="300" y="134">オンラインに戻り次第。個人開発のため即応は約束しない</text>
    <path class="fg-edge fg-edge--thin" d="M480,146 V154" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="280" y="156" width="400" height="54" rx="8"/>
    <text class="fg-t2 fg-accent" x="300" y="180">triage</text>
    <text class="fg-xs" x="300" y="200">再現して分類する</text>
    <path class="fg-edge fg-edge--muted" d="M684,183 H760" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="722" y="176" text-anchor="middle">スコープ外</text>
    <rect class="fg-box fg-box--muted" x="764" y="156" width="160" height="54" rx="8"/>
    <text class="fg-t2" x="782" y="180">クローズ</text>
    <text class="fg-xs" x="782" y="200">理由を明示して返す</text>
    <path class="fg-edge fg-edge--thin" d="M480,212 V220" marker-end="url(#fg-a)"/>
    <text class="fg-xs fg-ok" x="496" y="222">有効と確認</text>
    <rect class="fg-box" x="280" y="222" width="400" height="54" rx="8"/>
    <text class="fg-t2" x="300" y="246">修正、または緩和策の計画</text>
    <text class="fg-xs" x="300" y="266">優先順位を決めるのは重大度で、報告者の属性ではない</text>
    <path class="fg-edge fg-edge--thin" d="M480,278 V286" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="280" y="288" width="400" height="54" rx="8"/>
    <text class="fg-t2" x="300" y="312">協調開示</text>
    <text class="fg-xs" x="300" y="332">報告者と合意した調整期間に沿って進める</text>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M480,344 V352" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="280" y="354" width="400" height="54" rx="8"/>
    <text class="fg-t2 fg-accent" x="300" y="378">修正版のリリースと GHSA の公開</text>
    <text class="fg-xs" x="300" y="398">該当する場合は CVE も申請する</text>
  </svg>
  <figcaption class="fig-note">期限に幅があるのは受領確認の段階だけで、それも明示しています。それより下は固定です。合意した期間より前に公開することはありませんし、合意なしに黙って修正することもありません。</figcaption>
</figure>

現実的な目安として、受領確認には通常数日かかります。重大な問題はすぐに着手しますが、軽微なものは余暇が確保できる週末まで持ち越すこともあります。1 週間返信がない場合は遠慮なく再度連絡してください。無視しているわけではなく、通知の取りこぼしか単に手が回らない時期である可能性が高いです。

`SECURITY.md` には「3 営業日以内に受領確認、14 日以内に修正計画」と記載していますが、これは目指している目標値であって契約上の保証ではありません。

## サポート対象バージョン

| バージョン | サポート |
|---|---|
| `v1.x` | 最新 minor + 1 つ前の minor |

::: tip 更新の方針
`go.mod` ではバージョンタグを固定し、更新のたびに [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) を確認してください。v1 の公開 API は Semantic Versioning に従います。`Experimental:` マーカー付き API はこの約束の例外です。セキュリティ修正はサポート対象の v1 minor に入ります。
:::

## 開示フロー

本プロジェクトは **coordinated disclosure（協調開示）** を採用しています。これは敵対的な手続きではありません。

1. 報告者とメンテナ双方の都合に合わせて、パッチの目標日を合意します。
2. プライベートブランチまたは GitHub Security Advisory のドラフトで修正を開発します。
3. 修正を `main` にマージし、リリースタグを切ります。
4. Advisory を公開します。GitHub の CNA が CVE を発番する条件に該当する場合は CVE を申請します。実体が exploit 経路を持たない defense-in-depth ハードニングに留まる場合は、CVE 無しの GHSA として公開することが多いです。
5. リポジトリを Watch（Releases / Security advisories）している方には自動で通知が届きます。

## 現在の Advisory 状況

Advisory の状況は時間とともに変わるため、このページでは特定時点の CVE 件数を複製しません。現在の記録は GitHub Security Advisories です。[advisories ページ](https://github.com/libraz/go-oidc-provider/security/advisories) とリポジトリの [`SECURITY.md`](https://github.com/libraz/go-oidc-provider/blob/main/.github/SECURITY.md) で最新の方針と公開状況を確認してください。プロジェクトの防御範囲と限界は [セキュリティ方針](/ja/security/posture) にまとめています。

## 周辺のサプライチェーン衛生

OP 自体が健全でも、依存パッケージが既知の問題を抱えていることはあります。採用時、および依存を更新するたびに次を実行してください。

```sh
# 利用側のモジュールで
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...
```

本リポジトリ自体でも、同じツールを [`scripts/govulncheck.sh`](https://github.com/libraz/go-oidc-provider/blob/main/scripts/govulncheck.sh) 経由で CI で実行しています。依存マニフェストは意図的に絞っており、全リストは [`THIRD_PARTY.md`](https://github.com/libraz/go-oidc-provider/blob/main/THIRD_PARTY.md) を参照してください。AGPL / GPL / SSPL / BUSL / Elastic ライセンスの依存はリポジトリポリシーで禁止しているため、ライセンス互換性の検討範囲は小さく保たれています。

## 報告してほしい範囲

スコープ内（積極的に報告してほしい内容）:

- `op.WithProfile(profile.FAPI2*)` が課すセキュリティゲート（PAR、JAR、DPoP、JARM、alg リスト、redirect_uri 完全一致）のバイパス。
- アルゴリズム混同（`none`、`HS*`、またはコードベースの許可リスト外の alg を verifier に受理させる経路）。
- トークン偽造、ID トークンの署名バイパス、`iss` ミックスアップ経路。
- 関連 RFC が許容する範囲を超える PKCE / nonce / state replay 経路。
- chain revocation を伴わないリフレッシュトークンの再利用。
- 同意 / ログアウト / interaction POST に対する CSRF。
- Cookie 周りのリグレッション（`__Host-`、`Secure`、AES-256-GCM AEAD のいずれかが失われるもの）。
- Back-Channel Logout 経由の SSRF（RFC 1918 の deny-list をすり抜けてプライベートネットワーク宛に送信できてしまうもの）。
- エラーカタログ（`internal/redact`）の範囲を超える情報の漏洩。
- `op/storeadapter/` 配下のストレージアダプタに対するインジェクション。

スコープ外（既知の挙動。詳細は <a class="doc-ref" href="/ja/security/design-judgments">設計判断</a>）:

- Front-Channel Logout / Session Management を提供していないこと。
- 運用者がオプトインしたうえでのループバック redirect-URI の緩和。
- `offline_access` を要求しない経路でのリフレッシュトークン発行。
- `cmd/op-demo` バイナリの設定が弱いこと — これは適合検査用のハーネスであり、本番 OP として使うものではありません。

## Hall of Fame

最初の有効なセキュリティ報告が届いたら、許諾を得たうえで報告者をここに掲載します。現時点では空欄ですが、これは「網羅的に安全である」という主張ではなく、単にまだ報告が届いていないことを示しているだけです。実際の防御範囲は [セキュリティ方針](/ja/security/posture) を参照してください。

## 続きはこちら

- **[セキュリティ方針](/ja/security/posture)** — 構造的に何を防いでいるか、どんなツールが裏にあるか、何を意図的にスコープ外にしているか。
- **[設計判断](/ja/security/design-judgments)** — RFC 同士の衝突をどう解釈したか。
- **[OFCS 適合状況](/ja/compliance/ofcs)** — 適合性が証明できること / できないこと。
