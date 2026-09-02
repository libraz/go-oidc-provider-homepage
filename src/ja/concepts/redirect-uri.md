---
title: Redirect URI
description: 既定の /auth における redirect_uri 完全一致、RFC 8252 loopback 緩和の範囲、CVE 級の誤設定を整理する。
pageClass: pg-concepts-redirect-uri
---

# Redirect URI

**Redirect URI** は、`/auth` 完了後に OP がユーザを送り戻す URL です — 成功時は `?code=...&state=...`、失敗時は `?error=...&state=...` が付きます。OP を `/oidc` に mount した場合の endpoint は `/oidc/auth` です。RP はクライアント生成時に 1 つ以上を登録しておき、OP は authorize 要求の `redirect_uri` クエリパラメータを登録値と比較します。一致しなければ、ユーザを送り出す前にリクエストを拒否します。

::: tip 30 秒で頭に入れる相関図
- `redirect_uri` はデフォルトで **byte 単位の完全一致**。`/cb` と `/cb/` は別の URI です。
- 歴史的な緩和（CLI 用の loopback ポート）はいくつかありますが、すべて opt-in で適用範囲も狭く保たれています。
- OP は誤った URI に redirect する **前** にリクエストを拒否します — redirect 自体が攻撃ベクトルだからです。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §3.1.2.3（redirect URI 登録と一致判定）
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps（§7.3 loopback、§7.1 custom URI scheme、§8.3 DNS rebinding）
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice（§4.1 redirect URI handling）
- [OpenID Connect Registration 1.0](https://openid.net/specs/openid-connect-registration-1_0.html) — §2（`redirect_uris`、`application_type`）
:::

## なぜ完全一致なのか

`redirect_uri` のワイルドカードや prefix-match ポリシーは、OAuth 黎明期に CVE 級の脆弱性を生み出した原因でした。登録された prefix の範囲内であれば任意の URL に redirect できる OP に対し、攻撃者は次の手順を踏みます。

1. 登録 prefix の下にある自分のサブドメイン・パスに登録するか、prefix が許す下流リソースを 1 つ侵害する。
2. authorize 要求を開始し、正規の `redirect_uri` を攻撃者が制御する URL に差し替える。
3. redirect で認可コードを受け取る。
4. client_id と PKCE の state が一致しているので、コードをトークンに交換する。

RFC 9700 §4.1 はこれを閉じています。

> **RFC 9700 §4.1（訳）** authorization server は `redirect_uri` パラメータを登録 URI と単純な文字列比較で照合しなければならない。pattern matching、ワイルドカード、部分一致を使ってはならない。

本ライブラリはこれを文字通り実装します。クライアントが登録した文字列だけが、その登録を満たす唯一の文字列です。`https://app.example.com/cb` を登録したなら、リクエストはこの文字列と 1 バイトも違ってはなりません。

<figure class="fig">
  <div class="fig-head">完全一致が弾くもの</div>
  <svg class="fig-svg" role="img" aria-labelledby="redirect-exact-title" viewBox="0 0 960 348" xmlns="http://www.w3.org/2000/svg">
    <title id="redirect-exact-title">登録値と 1 バイトも違わない redirect_uri だけが一致します。末尾のスラッシュ、query パラメータの追加、ホスト名の大文字小文字、ポート番号の違いはいずれも拒否されます。</title>
    <text class="fg-lbl" x="40" y="28">クライアントに登録した値</text>
    <rect class="fg-box fg-box--accent" x="36" y="38" width="440" height="36" rx="6"/>
    <text class="fg-m" x="54" y="61">https://app.example.com/cb</text>
    <text class="fg-lbl" x="72" y="106">authorize リクエストで送られた値</text>
    <text class="fg-lbl" x="612" y="106">判定</text>
    <line class="fg-rule--strong fg-rule" x1="36" y1="118" x2="924" y2="118"/>
    <!-- 受理 -->
    <path class="fg-edge fg-edge--ok fg-edge--thin" d="M44,136 l4,5 l8,-10"/>
    <text class="fg-m" x="72" y="143">https://app.example.com/cb</text>
    <text class="fg-xs fg-ok" x="612" y="143">受理 — 1 バイトも違わない</text>
    <line class="fg-rule" x1="36" y1="158" x2="924" y2="158"/>
    <!-- 末尾のスラッシュ -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M44,177 l10,10 M54,177 l-10,10"/>
    <text class="fg-m" x="72" y="183">https://app.example.com/cb<tspan class="fg-danger">/</tspan></text>
    <text class="fg-xs" x="612" y="183">末尾のスラッシュは別のパス</text>
    <line class="fg-rule" x1="36" y1="198" x2="924" y2="198"/>
    <!-- query パラメータ -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M44,217 l10,10 M54,217 l-10,10"/>
    <text class="fg-m" x="72" y="223">https://app.example.com/cb<tspan class="fg-danger">?env=prod</tspan></text>
    <text class="fg-xs" x="612" y="223">追加の query パラメータは吸収されない</text>
    <line class="fg-rule" x1="36" y1="238" x2="924" y2="238"/>
    <!-- ホスト名の大文字小文字 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M44,257 l10,10 M54,257 l-10,10"/>
    <text class="fg-m" x="72" y="263">https://<tspan class="fg-danger">APP</tspan>.example.com/cb</text>
    <text class="fg-xs" x="612" y="263">比較の前にホスト名を小文字化しない</text>
    <line class="fg-rule" x1="36" y1="278" x2="924" y2="278"/>
    <!-- ポート -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M44,297 l10,10 M54,297 l-10,10"/>
    <text class="fg-m" x="72" y="303">https://app.example.com<tspan class="fg-danger">:8443</tspan>/cb</text>
    <text class="fg-xs" x="612" y="303">ポート番号が違えば別のオリジン</text>
    <line class="fg-rule" x1="36" y1="318" x2="924" y2="318"/>
  </svg>
  <figcaption class="fig-note">これらはいずれも比較前に正規化されません。正規化規則をひとつ設けるたびに、攻撃者が似せた URI を狙える面がひとつ増えるためです。単純な文字列比較にはその面がありません。</figcaption>
</figure>

拒否される行はいずれも登録値と 1 〜 2 文字しか違いません。OP はそのどれも正規化しません。2 つの文字列を比較して、それで終わりです。唯一の例外が後述の loopback の緩和で、native client だけがポート番号を変えられます。

## 本ライブラリが拒否する形

登録時（DCR でも `op.WithStaticClients` でも）:

- **空の値**。`redirect_uris` には少なくとも 1 件のエントリが必要で、空文字列のエントリは拒否されます。
- **parse できない URL**。`url.Parse` が失敗する値は拒否されます。
- **相対 URL**。絶対 URL（`scheme://host/...`）でなければなりません。
- **fragment**。`#...` 部分は redirect protocol で意味を持ちません。仕様で禁止されています。
- **web client の custom URI scheme**。web client（`application_type=web`、デフォルト）は `https` でなければなりません。唯一の例外は loopback `http` で、後述のルールでゲートされます。
- **ブラウザ primitive と衝突する scheme**（`javascript:`、`data:`、`file:`、`ftp:`、`ws:`、`wss:`）— native client でも一律拒否。
- **dot のない custom scheme**（例: `com.example.myapp:` でなく `myapp:`）— RFC 8252 §7.1 に従い native client でも拒否されます。reverse-DNS でない scheme はアプリ間で衝突しやすいためです。

authorize 時には、登録リストに対して byte 単位の完全一致を厳密に適用します。一致しないものはブラウザが redirect される **前** にエラー応答を返します — ユーザは攻撃者制御の URL ではなく、サーバ側のエラー画面を見ることになります。

## Loopback（RFC 8252）

ネイティブの CLI ツールは、OS が割り当てる ephemeral port を事前に登録できません — 登録 redirect が今日は `http://127.0.0.1:54321/cb`、明日は `http://127.0.0.1:62114/cb` という具合になるためです。RFC 8252 §7.3 はここに例外を設けます。

> **RFC 8252 §7.3（訳）** loopback redirect を使うネイティブアプリケーションは、登録時のポートと異なっていても、リクエスト時にポートを指定できなければならない。

本ライブラリはクライアント単位でこの carve-out を尊重し、DNS rebinding（RFC 8252 §8.3）に対する 3 つのルールで強化しています。

| 条件 | 挙動 |
|---|---|
| scheme が `http` で、登録 host が `127.0.0.1` または `[::1]` | authorize 時のポートが登録ポートと異なってよい。それ以外（path・query・fragment）は完全一致が必要。 |
| scheme が `http` で、登録 host がテキストの `localhost` | **web client はデフォルトで拒否**。テキストの `localhost` は DNS で解決され、hijack 可能なため。web client は `op.WithAllowLocalhostLoopback()` で opt-in、native client（`application_type=native`）は OIDC Registration §2 に従い無条件で `localhost` を受理。 |
| loopback host で scheme が `https` | ポート緩和なし。ACME は `127.0.0.1` に証明書を発行しないので、この組み合わせは実用上稀。 |

loopback の carve-out 外では、厳密な完全一致ポリシーが引き続き適用されます。`https://app.example.com/cb` を登録した web client は、リクエスト時にポートを変えることはできません。

::: warning `localhost` が特別扱いされる理由は DNS rebinding
テキストの `localhost` は、OS が DNS で解決する名前です。`localhost` の DNS を汚染できる攻撃者（LAN 内 DNS hijack、悪意あるリゾルバ、敵対的 WiFi）は、OP が loopback に送ったつもりのユーザを、攻撃者制御の host に着地させられます。IP リテラルの `127.0.0.1` と `[::1]` は DNS を完全にスキップするので、これがデフォルトの厳密な loopback 形式であり、`localhost` だけが明示的な opt-in を要求されるのはそのためです。デフォルト姿勢（リテラル IP のみ）は DNS rebinding に敏感なデプロイにとって正しい既定です。明示的な根拠は[設計判断 — RFC 8252 loopback handling](/ja/security/design-judgments#dj-4)を参照してください。
:::

## クライアントの登録方法

OP に redirect URI を届ける経路は 2 つあります。

- **静的シード** — 構築時に `op.WithStaticClients(seeds...)` を渡します。各シードに `RedirectURIs` を列挙し、OP は起動時に検証して、不正な値があれば最初のリクエストを処理する前に拒否します。少数の既知クライアント — 社内ツール、シングルテナント SaaS、すべてのクライアントを審査済みの FAPI デプロイ — に最適です。
- **Dynamic Client Registration（RFC 7591）**。OP は `POST /register` を公開し、RP は `redirect_uris` を含むメタデータを送って実行時に自分自身を登録します。同じ検証が走り、規定に違反するエントリは `400 invalid_redirect_uri` または `400 invalid_client_metadata` として拒否されます。マルチテナント SaaS、マーケットプレース、OP オペレータがクライアントの集団を事前に把握できない用途に最適です。詳細は [Dynamic Client Registration](/ja/use-cases/dynamic-registration) を参照。

両経路は同じ validator を共有するので、起動時に審査されたか 10 秒前に自己登録されたかに関わらず、同じルールが適用されます。

## よくあるミス

- **本番シードで `localhost` を直書き**。手元のマシンでは動くが、開発者ごとに DNS リゾルバが違うと失敗します。loopback の意図なら `127.0.0.1`、本番ホスト名なら本番ホスト名を使ってください。
- **末尾スラッシュの揺れ**。`https://app.example.com/cb` と `https://app.example.com/cb/` は別物です。形をひとつ決めて登録し、RP framework にもそのまま使わせてください。
- **host の大文字混在**。RP framework がマーケティングメールからコピペされた文字列で host を大文字化することがあります。OP は byte 単位の case-sensitive なので、case の揺れは一致を壊します。
- **path のみの登録**。scheme と host のない path（`/cb`）は有効な redirect URI ではありません。OP は登録時に拒否します。
- **ワイルドカードへの期待**。「path 内なら `*` が効くのでは？」効きません。RFC 9700 が禁止しています。

## 次に読む

- [認可コード + PKCE フロー](/ja/concepts/authorization-code-pkce) — redirect URI の流れと、各ステップで OP が何を確認するか。
- [クライアント種別](/ja/concepts/client-types) — `application_type=native` は CLI 向けに loopback `http` を許容するためのスイッチ。
- [Dynamic Client Registration](/ja/use-cases/dynamic-registration) — 実行時自己登録と、同じ検証ルールがどう適用されるか。
- [設計判断 — RFC 8252 loopback handling](/ja/security/design-judgments#dj-4) — loopback 規則の明示的な根拠。
