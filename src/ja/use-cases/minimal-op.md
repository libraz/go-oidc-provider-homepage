---
title: 最小構成 OP
description: 動く最小の OP+RP のペア — OP の必須オプション、デモユーザ 1 件、静的登録クライアント 1 件。
pageClass: pg-use-cases-minimal-op
---

# ユースケース — 最小構成 OP

このページの例は、ライブラリが受け付ける最短のオプション列で [Authorization Code + PKCE](/ja/concepts/authorization-code-pkce) のラウンドトリップを動かします。OP と、それを使ってユーザをサインインさせる RP を同じプロセスで起動するので、ほかに何も用意しなくてもブラウザでフロー全体を試せます。

> **ソース:** [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal)

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">Go プロセス 1 つ、他には何も要らない</div>
  <svg class="fig-svg" role="img" aria-labelledby="minimal-op-arch-title" viewBox="0 0 960 304" xmlns="http://www.w3.org/2000/svg">
    <title id="minimal-op-arch-title">ブラウザが同梱の RP を操作し、その RP が同一プロセス内の OP と OIDC で通信します。OP は in-memory ストアを読み書きし、揮発鍵で署名します。データベースも鍵管理も用意する必要がありません。</title>
    <!-- browser -->
    <rect class="fg-box fg-box--ext" x="32" y="132" width="144" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="160">ブラウザ</text>
    <text class="fg-s" x="48" y="184">手元の環境</text>
    <path class="fg-edge" d="M176,168 H216" marker-end="url(#fg-a)"/>
    <!-- process -->
    <rect class="fg-frame" x="216" y="24" width="712" height="256" rx="8"/>
    <text class="fg-lbl" x="240" y="52">単一の Go プロセス</text>
    <rect class="fg-box" x="240" y="132" width="144" height="72" rx="8"/>
    <text class="fg-t2" x="256" y="160">rpkit RP</text>
    <text class="fg-mxs" x="256" y="184">:9090</text>
    <path class="fg-edge" d="M384,168 H456" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="420" y="158" text-anchor="middle">OIDC</text>
    <rect class="fg-box fg-box--accent" x="456" y="132" width="160" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="472" y="160">op.New(…)</text>
    <text class="fg-mxs" x="472" y="184">:8080</text>
    <path class="fg-leader" d="M616,168 H640 M640,116 V220"/>
    <path class="fg-edge fg-edge--thin" d="M640,116 H672" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M640,220 H672" marker-end="url(#fg-a)"/>
    <!-- throwaway parts -->
    <rect class="fg-box fg-box--sub" x="672" y="80" width="232" height="72" rx="8"/>
    <text class="fg-m" x="688" y="108">inmem.Store</text>
    <text class="fg-s" x="688" y="132">再起動で消える</text>
    <rect class="fg-box fg-box--sub" x="672" y="184" width="232" height="72" rx="8"/>
    <text class="fg-m" x="688" y="212">Keyset</text>
    <text class="fg-s" x="688" y="236">揮発鍵 ECDSA P-256</text>
  </svg>
  <figcaption class="fig-note">右側の 2 つは意図的に使い捨てです。データベースも鍵管理も設定ファイルも不要で、枠の中のものはすべて起動時に生成されます。再起動するとセッションも鍵もすべて失われますが、フローが成立するかどうかを確かめている段階では、それがちょうどよい性質です。</figcaption>
</figure>

ストアは in-memory で、鍵は起動時に生成します。例ではデモユーザ（`demo` / `demo`）を 1 件 seed し、`redirect_uri` を埋め込み RP に向けた [public クライアント](/ja/concepts/client-types)を登録しています。

## コード（要点）

```go
package main

import (
  "log"
  "net/http"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

func main() {
  keys := /* 例では devkeys.MustEphemeral("minimal-1") */
  st := inmem.New()
  // seedUser は op.HashPassword で "demo"/"demo" をハッシュし、
  // st.PutUserWithPassword で *store.User を登録する（実装は example を参照）。

  // Primary を 1 つだけ置き、rule を持たない構成が、パスワードのみのログインの全体です。
  flow := op.LoginFlow{
    Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  }

  provider, err := op.New(
    op.WithIssuer("http://127.0.0.1:8080"),
    op.WithStore(st),
    op.WithKeyset(keys.Keyset()),
    op.WithCookieKeys(keys.CookieKey),
    op.WithLoginFlow(flow),
    op.WithStaticClients(op.PublicClient{
      ID:           "demo-rp",
      RedirectURIs: []string{"http://127.0.0.1:9090/callback"},
      Scopes:       []string{"openid", "profile"},
    }),
  )
  if err != nil {
    log.Fatalf("op.New: %v", err)
  }

  mux := http.NewServeMux()
  mux.Handle("/", provider)
  log.Fatal(http.ListenAndServe(":8080", mux))
}
```

`WithIssuer`、`WithStore`、`WithKeyset` があれば、`/.well-known/openid-configuration` と `/oidc/jwks` は応答します。`WithCookieKeys` と `WithLoginFlow`（または `WithAuthenticators`）は authorization-code grant を有効にすると必須になり、この grant は既定で有効なので、実際に動く OP の入力は 5 つです。`op.LoginFlow` は `Experimental:` と明記されています（[インストール: 安定性](/ja/getting-started/install#安定性)）。ユーザが関わるエンドポイント（authorize / token / userinfo）には、さらに 1 件以上のクライアント（`WithStaticClients`）が必要です。各必須オプションが要る理由は [はじめに: 最小構成の OP](/ja/getting-started/minimal) にまとめています。

## OP が公開するもの

既定は `/oidc` 配下にマウント（`op.WithMountPrefix` で上書き可）:

| Path | 目的 |
|---|---|
| `/.well-known/openid-configuration` | [Discovery](/ja/concepts/discovery)（OIDC Discovery 1.0 §4 によりルート固定） |
| `/oidc/jwks` | ID トークン / JWT アクセストークン検証用の公開 JWKS |
| `/oidc/auth` | Authorization endpoint |
| `/oidc/token` | Token endpoint |
| `/oidc/userinfo` | UserInfo（RFC 6749 + OIDC Core §5.3） |
| `/oidc/end_session` | RP-Initiated Logout 1.0 |

オプションのエンドポイント（`/par`、`/introspect`、`/revoke`、`/register` など）は、対応する feature や grant を有効にしたときだけマウントされます。

## 本番運用に足りないもの

| ギャップ | 対処 |
|---|---|
| デモユーザ 1 件をハードコード | 自前の管理面でユーザを登録するか、既存のユーザテーブルを投影する（[既存ユーザストアの投影](/ja/use-cases/byo-userstore)）。 |
| 揮発鍵: 再起動すると既発行の ID トークンを検証できなくなる | vault、KMS、ファイルから鍵を読み込む。 |
| in-memory ストア: 再起動で状態が消える | `op/storeadapter/sql` または `op/storeadapter/composite` に切り替える（[SQL ストア](/ja/use-cases/sql-store)）。 |
| 平文 HTTP リスナ（`http://127.0.0.1`） | TLS 終端 ingress の背後に置き、issuer も `https://` に切り替える。 |
| 単一要素（パスワードのみ） | `RuleAlways(StepTOTP{...})` を追加 — [MFA / step-up](/ja/use-cases/mfa-step-up) を参照。 |
| `examples/internal/rpkit` のデモ RP | 本番 RP は `golang.org/x/oauth2` + `github.com/coreos/go-oidc/v3` を直接使う。 |

[`examples/02-bundle`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle) はこれらの一部を埋めています。[Comprehensive bundle](/ja/use-cases/bundle) を参照してください。

## 動かす

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && GOWORK=off go run -tags example .)
```

そのあとブラウザで次の順に試します。

1. `http://127.0.0.1:9090/`（RP）を開き、「Log in via the OP」を選びます。
2. `demo` / `demo` でサインインし、同意画面を承認します。
3. RP が `/me` に遷移し、検証済みの ID トークンの claim を表示します。`iss` は `http://127.0.0.1:8080` です。

OP のメタデータを見るには `curl -s http://127.0.0.1:8080/.well-known/openid-configuration | jq` を実行します。ラウンドトリップが止まったらプロセスを再起動してください。鍵は揮発なので、再起動すると途中のセッションはすべて無効になります。
