---
title: Redirect URI
description: /auth における redirect_uri の完全一致、RFC 8252 loopback 緩和の範囲、本ライブラリが拒否する登録を整理します。
pageClass: pg-concepts-redirect-uri
---

# Redirect URI

**Redirect URI** は、認可エンドポイント（`/auth`。OP を `/oidc` に mount した場合は `/oidc/auth`）の処理が終わったあとに、OP がユーザを送り戻す URL です。成功時は `?code=...&state=...`、失敗時は `?error=...&state=...` が付きます。RP はクライアントの作成時に 1 つ以上を登録しておき、OP はすべての authorize リクエストの `redirect_uri` クエリパラメータを登録値と比較します。一致しなければ、ユーザをどこにも送り出す前にリクエストを拒否します。

::: tip 30 秒でつかむ要点
- `redirect_uri` は登録値と **byte 単位で完全一致** しなければなりません。`/cb` と `/cb/` は別の URI です。
- 緩和は RFC 8252 の loopback ポートだけで、適用されるのは public client と native client に限られます。
- OP は不正なリクエストを、どこかに redirect する **前** に拒否します。redirect 自体が攻撃ベクトルだからです。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §3.1.2.3（redirect URI 登録と一致判定）
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps（§7.3 loopback、§7.1 custom URI scheme、§8.3 DNS rebinding）
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice（§4.1 redirect URI handling）
- [OpenID Connect Registration 1.0](https://openid.net/specs/openid-connect-registration-1_0.html) — §2（`redirect_uris`、`application_type`）
:::

## なぜ完全一致なのか

`redirect_uri` のワイルドカードや前方一致は、OAuth の黎明期に一群の脆弱性を生み出しました。登録された prefix の下ならどの URL にも redirect する OP に対して、攻撃者は次の手順を踏めます。

1. prefix の下の URL を 1 つ手に入れる。自分のサブドメインやパスを登録するか、prefix が含む下流リソースを 1 つ侵害する。
2. その URL を `redirect_uri` にして authorize リクエストを開始する。
3. redirect で認可コードを受け取る。
4. コードをトークンに交換する。

RFC 9700 §4.1 はこれを閉じています。

> **RFC 9700 §4.1（訳）** authorization server は `redirect_uri` パラメータを登録 URI と単純な文字列比較で照合しなければならない。pattern matching、ワイルドカード、部分一致を使ってはならない。

本ライブラリはこれを文字どおり実装します。`https://app.example.com/cb` を登録したなら、リクエストはこの文字列と 1 バイトも違ってはなりません。

<figure class="fig">
  <div class="fig-head">完全一致が弾くもの</div>
  <svg class="fig-svg" role="img" aria-labelledby="redirect-exact-title" viewBox="0 0 960 432" xmlns="http://www.w3.org/2000/svg">
    <title id="redirect-exact-title">登録値と 1 バイトも違わない redirect_uri だけが一致します。末尾のスラッシュ、query パラメータの追加、ホスト名の大文字小文字、ポート番号の違いはいずれも拒否されます。</title>
    <text class="fg-lbl" x="32" y="40">クライアントに登録した値</text>
    <rect class="fg-box fg-box--accent" x="32" y="56" width="448" height="48" rx="8"/>
    <text class="fg-m" x="48" y="84">https://app.example.com/cb</text>
    <text class="fg-lbl" x="72" y="152">authorize リクエストで送られた値</text>
    <text class="fg-lbl" x="504" y="152">判定</text>
    <line class="fg-rule fg-rule--strong" x1="32" y1="168" x2="928" y2="168"/>
    <!-- row 1 -->
    <path class="fg-edge fg-edge--ok fg-edge--thin" d="M42,193 l5,6 l9,-12"/>
    <text class="fg-s fg-ok" x="504" y="198">受理 — 1 バイトも違わない</text>
    <text class="fg-m" x="72" y="198">https://app.example.com/cb</text>
    <line class="fg-rule" x1="32" y1="216" x2="928" y2="216"/>
    <!-- row 2 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M42,234 l12,12 M54,234 l-12,12"/>
    <text class="fg-s" x="504" y="246">末尾のスラッシュは別のパス</text>
    <text class="fg-m" x="72" y="246">https://app.example.com/cb<tspan class="fg-danger">/</tspan></text>
    <line class="fg-rule" x1="32" y1="264" x2="928" y2="264"/>
    <!-- row 3 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M42,282 l12,12 M54,282 l-12,12"/>
    <text class="fg-s" x="504" y="294">追加の query パラメータは吸収されない</text>
    <text class="fg-m" x="72" y="294">https://app.example.com/cb<tspan class="fg-danger">?env=prod</tspan></text>
    <line class="fg-rule" x1="32" y1="312" x2="928" y2="312"/>
    <!-- row 4 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M42,330 l12,12 M54,330 l-12,12"/>
    <text class="fg-s" x="504" y="342">比較の前にホスト名を小文字化しない</text>
    <text class="fg-m" x="72" y="342">https://<tspan class="fg-danger">APP</tspan>.example.com/cb</text>
    <line class="fg-rule" x1="32" y1="360" x2="928" y2="360"/>
    <!-- row 5 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M42,378 l12,12 M54,378 l-12,12"/>
    <text class="fg-s" x="504" y="390">ポート番号が違えば別のオリジン</text>
    <text class="fg-m" x="72" y="390">https://app.example.com<tspan class="fg-danger">:8443</tspan>/cb</text>
    <line class="fg-rule" x1="32" y1="408" x2="928" y2="408"/>
  </svg>
  <figcaption class="fig-note">これらはいずれも比較前に正規化されません。正規化規則をひとつ設けるたびに、攻撃者が似せた URI を狙える面がひとつ増えるためです。単純な文字列比較にはその面がありません。</figcaption>
</figure>

拒否される行はいずれも登録値と 1〜2 文字しか違いませんが、OP はどれも正規化しません。2 つの文字列を比較して、そこで終わりです。唯一の例外が後述の loopback の緩和で、ポート番号だけが変わってもよくなります。

## 本ライブラリが拒否する形

登録時は、DCR でも `op.WithStaticClients` でも同じ validator が走ります。`redirect_uris` は空でなく、各エントリは `url.Parse` が通る空でない絶対 URL で、fragment を含んではいけません。fragment は redirect で意味を持たず、仕様でも禁止されているためです。scheme のルールは `application_type` によって変わります。

| `application_type` | 受け付ける scheme |
|---|---|
| `web`（既定） | host を持ち userinfo を含まない `https`。加えて loopback の IP リテラル `127.0.0.1` と `[::1]` 上の `http`。`http://localhost` は `op.WithAllowLocalhostLoopback()` を設定した場合だけ。custom scheme は拒否。 |
| `native` | `https`（claimed link）、上記の loopback `http`、`com.example.app:/cb` のような private-use scheme。 |

private-use scheme には dot を含める必要があります（reverse-DNS 形式）。RFC 8252 §7.1 が、`myapp:` のような短い名前はアプリ間で衝突しやすいと警告しているためです。`javascript:`、`data:`、`file:`、`ftp:`、`ws:`、`wss:` は一律に拒否します。

authorize 時には、登録リストに対する文字列比較（と後述の loopback ルール）で判定します。どれにも一致しないリクエストには、ブラウザをどこかに redirect する **前** に OP 自身がエラー応答を返します。ユーザが目にするのは攻撃者制御の URL ではなく、サーバ側のエラー画面です。

## Loopback（RFC 8252）

CLI ツールは OS が実行時に割り当てるポートで待ち受けるため、固定の redirect を登録できません。今日は `http://127.0.0.1:54321/cb`、明日は `http://127.0.0.1:62114/cb` になるからです。RFC 8252 §7.3 はここに例外を設けています。

> **RFC 8252 §7.3（訳）** loopback redirect を使うネイティブアプリケーションは、登録時のポートと異なっていても、リクエスト時にポートを指定できなければならない。

本ライブラリがこの例外を認めるのは **public client と `application_type=native` のクライアントだけ** で、DNS rebinding（RFC 8252 §8.3）への対策として次のように絞っています。

| 登録された redirect URI | 挙動 |
|---|---|
| `127.0.0.1` または `[::1]` 上の `http` | public client と native client は、authorize 時に任意のポートを使えます。scheme・host・path・query は引き続き完全一致が必要です。confidential な web client はポートを含めて完全一致です。 |
| テキストの `localhost` 上の `http` | **`op.WithAllowLocalhostLoopback()` を設定しない限り、登録時に拒否されます**（web も native も同じです）。`localhost` は DNS で解決され、乗っ取られる可能性があるためです。許可した場合は、IP リテラルと同じ任意ポートのルールに従います。 |
| loopback host 上の `https` | ポートの緩和はありません。認証局は `127.0.0.1` に証明書を発行しないので、この組み合わせはまれです。 |

<figure class="fig">
  <div class="fig-head">loopback の例外が緩めるのはポートだけ</div>
  <svg class="fig-svg" role="img" aria-labelledby="redirect-match-title" viewBox="0 0 960 384" xmlns="http://www.w3.org/2000/svg">
    <title id="redirect-match-title">authorize リクエストの redirect_uri の判定フロー。登録値と同一なら受理します。そうでなければ、クライアントが public または native で、登録 URI が loopback host 上の http であり、リクエストとの違いがポートだけの場合に限って loopback の例外が適用されます。それ以外は redirect せずエラー画面で拒否します。</title>
    <!-- test 1 -->
    <rect class="fg-box" x="32" y="24" width="448" height="72" rx="8"/>
    <text class="fg-t" x="48" y="52">登録済みの値と同一か</text>
    <text class="fg-s" x="48" y="76">文字列として 1 バイトずつ比較</text>
    <path class="fg-edge fg-edge--ok" d="M480,60 H568" marker-end="url(#fg-ao)"/>
    <text class="fg-edge-lbl" x="524" y="50" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--ok" x="568" y="24" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="52">受理</text>
    <text class="fg-s" x="584" y="76">登録された URI へ redirect</text>
    <!-- test 2 -->
    <path class="fg-edge" d="M256,96 V144" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="268" y="124">no</text>
    <rect class="fg-box" x="32" y="144" width="448" height="96" rx="8"/>
    <text class="fg-t" x="48" y="172">loopback の例外が適用されるか</text>
    <text class="fg-s" x="48" y="196">public/native クライアント · http の loopback URI</text>
    <text class="fg-s" x="48" y="220">scheme・host・path・query は同一、port だけ違う</text>
    <path class="fg-edge fg-edge--ok" d="M480,192 H568" marker-end="url(#fg-ao)"/>
    <text class="fg-edge-lbl" x="524" y="182" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--ok" x="568" y="144" width="360" height="96" rx="8"/>
    <text class="fg-t" x="584" y="172">受理</text>
    <text class="fg-s" x="584" y="196">要求された URI へ redirect</text>
    <text class="fg-s" x="584" y="220">要求された port のまま</text>
    <!-- rejected -->
    <path class="fg-edge fg-edge--danger" d="M256,240 V288" marker-end="url(#fg-ad)"/>
    <text class="fg-edge-lbl" x="268" y="268">no</text>
    <rect class="fg-box fg-box--danger" x="32" y="288" width="448" height="72" rx="8"/>
    <text class="fg-t" x="48" y="316">拒否</text>
    <text class="fg-s" x="48" y="340">OP がエラー画面を表示し、redirect しない</text>
  </svg>
  <figcaption class="fig-note">例外はポート番号だけです。<code>localhost</code> の登録が 2 番目の判定に届くのは、登録時に <code>op.WithAllowLocalhostLoopback()</code> が通した場合に限られます。</figcaption>
</figure>

::: warning `localhost` が特別扱いされる理由は DNS rebinding
テキストの `localhost` は、OS が DNS で解決する名前です。`localhost` の DNS を汚染できる攻撃者（乗っ取られた LAN 内リゾルバ、悪意あるリゾルバ、敵対的な WiFi）は、OP が loopback に送ったつもりのユーザを、攻撃者の制御する host に着地させられます。IP リテラルの `127.0.0.1` と `[::1]` は DNS を使わないので既定の loopback 形式になり、`localhost` だけが明示的な opt-in を要求されます。根拠は[設計判断 — RFC 8252 loopback handling](/ja/security/design-judgments#dj-4)を参照してください。
:::

## クライアントの登録方法

redirect URI が OP に届く経路は 2 つあり、どちらも同じ validator を通ります。

- **静的シード**: 構築時に `op.WithStaticClients(seeds...)` を渡し、各シードに `RedirectURIs` を列挙します（[クライアント種別](/ja/concepts/client-types#プロビジョニング方法)を参照）。OP は `op.New` の中で検証し、不正な値があれば起動を拒否します。社内ツール、シングルテナント SaaS、審査済みの FAPI クライアントのような、少数の既知クライアントに向いています。
- **Dynamic Client Registration（RFC 7591）**: RP が `POST /register` に `redirect_uris` を含めて実行時に自己登録します。規定に違反するエントリは `400 invalid_redirect_uri` または `400 invalid_client_metadata` で拒否されます。マルチテナント SaaS、マーケットプレース、OP の運用者がクライアントを事前に把握できない用途に向いています。詳細は [Dynamic Client Registration](/ja/use-cases/dynamic-registration) を参照してください。

## よくあるミス

- **開発用に `http://localhost/...` を登録する**。`op.WithAllowLocalhostLoopback()` を設定しない限り登録に失敗し、このオプションは開発マシン専用です。オプション不要の `http://127.0.0.1:<port>/...` を使ってください。
- **末尾スラッシュの揺れ**。`https://app.example.com/cb` と `https://app.example.com/cb/` は別物です。形をひとつ決めて登録し、RP framework にもそのまま送らせてください。
- **host の大文字混在**。貼り付けた URL をもとに RP framework が host を大文字化することがあります。比較は case-sensitive なので、リクエストが一致しなくなります。
- **path だけの登録**。`/cb` には scheme も host もないため有効な redirect URI ではなく、登録時に拒否されます。
- **ワイルドカードへの期待**。path の中の `*` は効きません。RFC 9700 がワイルドカードを禁止しています。

## 次に読む

- [認可コード + PKCE フロー](/ja/concepts/authorization-code-pkce) — redirect URI の流れと、各ステップで OP が何を確認するか。
- [クライアント種別](/ja/concepts/client-types) — loopback のポート例外が適用されるのは public client と native client。
- [Dynamic Client Registration](/ja/use-cases/dynamic-registration) — 実行時自己登録と、同じ検証ルールがどう適用されるか。
- [設計判断 — RFC 8252 loopback handling](/ja/security/design-judgments#dj-4) — loopback 規則の明示的な根拠。
