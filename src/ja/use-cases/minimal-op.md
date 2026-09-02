---
title: 最小構成 OP
description: 動く最小の OP+RP のペア — OP の必須オプション、デモユーザ 1 件、静的登録クライアント 1 件。
pageClass: pg-use-cases-minimal-op
---

# 使い方 — 最小構成 OP

最小オプション数で Authorization Code + PKCE のラウンドトリップを最後まで動かしたい。同梱の例は OP と対になる RP を同一プロセスで起動するので、外部準備なしにブラウザでフロー全体を動かせます。

> **ソース:** [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal)

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">Go プロセス 1 つ、他には何も要らない</div>
  <svg class="fig-svg" role="img" aria-labelledby="minimal-op-arch-title" viewBox="0 0 960 232" xmlns="http://www.w3.org/2000/svg">
    <title id="minimal-op-arch-title">ブラウザが同梱の RP を操作し、その RP が同一プロセス内の OP と OIDC で通信します。OP は in-memory ストアを読み書きし、揮発鍵で署名します。データベースも鍵管理も用意する必要がありません。</title>
    <rect class="fg-box fg-box--ext" x="36" y="90" width="160" height="60" rx="8"/>
    <text class="fg-t2" x="116" y="114" text-anchor="middle">ブラウザ</text>
    <text class="fg-xs" x="116" y="134" text-anchor="middle">手元の環境</text>
    <path class="fg-edge" d="M200,120 H258" marker-end="url(#fg-a)"/>
    <rect class="fg-frame" x="236" y="40" width="688" height="172" rx="10"/>
    <text class="fg-lbl" x="252" y="62">単一の Go プロセス</text>
    <rect class="fg-box" x="266" y="76" width="200" height="70" rx="8"/>
    <text class="fg-t2" x="366" y="104" text-anchor="middle">rpkit RP</text>
    <text class="fg-mxs" x="366" y="124" text-anchor="middle">:9090</text>
    <path class="fg-edge" d="M470,111 H512" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="491" y="104" text-anchor="middle">OIDC</text>
    <rect class="fg-box fg-box--accent" x="516" y="76" width="200" height="70" rx="8"/>
    <text class="fg-m fg-accent" x="616" y="104" text-anchor="middle">op.New(…)</text>
    <text class="fg-mxs" x="616" y="124" text-anchor="middle">:8080</text>
    <path class="fg-edge fg-edge--thin" d="M720,97 H752" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M720,151 H752" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--sub" x="756" y="76" width="148" height="42" rx="6"/>
    <text class="fg-mxs" x="772" y="94">inmem.Store</text>
    <text class="fg-xs" x="772" y="110">再起動で消える</text>
    <rect class="fg-box fg-box--sub" x="756" y="130" width="148" height="54" rx="6"/>
    <text class="fg-mxs" x="772" y="148">Keyset</text>
    <text class="fg-xs" x="772" y="164">揮発鍵</text>
    <text class="fg-xs" x="772" y="178">ECDSA P-256</text>
    <text class="fg-xs" x="252" y="196">データベースも鍵管理も設定ファイルも不要 — 上のすべてが起動時に生成される</text>
  </svg>
  <figcaption class="fig-note">右側の 2 つは意図的に使い捨てです。再起動するとセッションも鍵もすべて失われますが、フローが成立するかどうかを確かめている段階では、それがちょうどよい性質です。</figcaption>
</figure>

プロセスは 1 つ、ストアは in-memory、鍵は起動時に生成します。例ではデモユーザ（`demo`/`demo`）1 件を seed し、`redirect_uri` を埋め込み RP に向けた public client を登録しています。

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
  // *store.User を st.UserPasswords() に PUT する（実装は example を参照）。

  // upstream の例は examples/internal/opkit の opkit.DefaultLoginFlow(st.UserPasswords())
  // を使っています。これは下と同じ値を構築する thin wrapper で、公開 API は下の
  // LoginFlow 構造体です。opkit を import するのは example のソースを読むときだけで、
  // 本番コードで使うものではありません。
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

`WithIssuer`、`WithStore`、`WithKeyset` だけでも `/oidc/.well-known/openid-configuration` と `/oidc/jwks` は応答します。`WithCookieKeys` は authorization-code grant を有効にした時点で必須になり、通常のブラウザフローでは既定で必要です。ユーザに依存するエンドポイント（authorize / token / userinfo）には、さらに `WithLoginFlow` と `WithStaticClients` のペアが必要です。discovery のみの構成は [`getting-started/minimal`](/ja/getting-started/minimal) を参照してください。

## OP が公開するもの

既定は `/oidc` 配下にマウント（`op.WithMountPrefix` で上書き可）:

| Path | 目的 |
|---|---|
| `/.well-known/openid-configuration` | Discovery（OIDC Discovery 1.0 §4 によりルート固定） |
| `/oidc/jwks` | ID トークン / JWT アクセストークン検証用の公開 JWKS |
| `/oidc/auth` | Authorization endpoint |
| `/oidc/token` | Token endpoint |
| `/oidc/userinfo` | UserInfo（RFC 6749 + OIDC Core §5.3） |
| `/oidc/end_session` | RP-Initiated Logout 1.0 |

オプションエンドポイント（`/par`、`/introspect`、`/revoke`、`/register`、`/interaction/*`、`/session/*`）は対応 feature が有効なときのみマウントされます。

## 本番運用に足りないもの

| ギャップ | 対処 |
|---|---|
| デモユーザ 1 件をハードコード | 自前の管理面でユーザを登録し、`store.User` を PUT する。 |
| 揮発鍵 → 再起動で ID トークンが検証不能 | vault / KMS / ファイルからロード。 |
| in-memory ストア → 再起動で状態消失 | `op/storeadapter/sql` または `op/storeadapter/composite` に切替。 |
| 平文 HTTP リスナ（`http://127.0.0.1`） | TLS 終端 ingress の背後に置き、issuer も `https://` に切り替える。 |
| 単一要素（パスワードのみ） | `RuleAlways(StepTOTP{...})` を追加 — [MFA / step-up](/ja/use-cases/mfa-step-up) を参照。 |
| `examples/internal/rpkit` のデモ RP | 本番 RP は `golang.org/x/oauth2` + `github.com/coreos/go-oidc/v3` を直接使う。 |

[`examples/02-bundle`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle) が「総合的な組み込み側」のリファレンスとしてこれらを埋めています。

## 動かす

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && GOWORK=off go run -tags example .)
# 別ターミナル:
curl -s http://localhost:8080/.well-known/openid-configuration | jq
```
