---
title: 純粋 OAuth 2.0（openid なし）
description: OAuth 2.0 を OIDC と同居させる。同じ OP が非 OIDC クライアントに access-only トークンを発行。
---

# ユースケース — 純粋 OAuth 2.0

OIDC Core 1.0 §3.1.2.1 では、OIDC の認可リクエストに `openid` が必要です。指定がなければ OpenID リクエストではなくなり、その扱いは OIDC Core の規定外です。本ライブラリは既定でそのリクエストを拒否しますが、オプションを指定すると ID トークンを必要としない OAuth 2.0 クライアントも同じ OP で扱えます。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — OAuth 2.0 Bearer Token Usage
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.1（`openid` scope が OIDC 切替えスイッチ）
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — `scopes_supported`
:::

::: details 用語の補足
- **OAuth 2.0 と OIDC** — OAuth 2.0 は *委譲された API アクセス* のための `access_token` を発行します — トークンは「このクライアントはユーザに代わってこの API を呼んで良い」と表明します。OIDC はそこに identity を上乗せします: `openid` scope が含まれると、OP は追加で `id_token` を返し *誰がユーザか* を表明します。`openid` がなければ OP は純粋な OAuth 2.0 サーバとして振る舞います。
- **Bearer トークン** — そのトークンを提示するだけで認可が成立するアクセストークン（RFC 6750）。リソースサーバが（introspection か JWT 署名検証で）検証し、付与された scope を強制します。
- **`/userinfo`** — OIDC は、OIDC 認証で得たアクセストークン向けに定義しています。本ライブラリでは、ユーザに紐づく OAuth 2.0 専用の認可コードトークンも、scope がユーザ claim を許す場合は受け付けます。これはライブラリの拡張挙動であり、OAuth 2.0 の共通仕様ではありません。ユーザに紐づかないサービストークンは拒否します。
:::

> **ソース:** [`examples/04-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/04-oauth2-only)

## 差し込み口

```go
op.New(
  /* 必須オプション */
  op.WithOpenIDScopeOptional(),
  op.WithScope(op.PublicScope("api:read", "Read your API resources")),
  op.WithStaticClients(
    // OIDC クライアント: "openid" を含むので /token は id_token も返す。
    op.ConfidentialClient{
      ID: "oidc-rp", Secret: "…", AuthMethod: op.AuthClientSecretBasic,
      RedirectURIs: []string{"http://localhost:5173/cb"},
      GrantTypes:   []string{"authorization_code", "refresh_token"},
      Scopes:       []string{"openid", "profile", "email"},
    },
    // OAuth 専用クライアント: scope に "openid" を含まない。
    op.ConfidentialClient{
      ID: "oauth-cli", Secret: "…", AuthMethod: op.AuthClientSecretBasic,
      RedirectURIs: []string{"http://localhost:5173/cb"},
      GrantTypes:   []string{"authorization_code"},
      Scopes:       []string{"api:read"},
    },
  ),
)
```

このオプションが外すのは、認可リクエストに `openid` が必須という検証 1 つだけです。クライアントの登録済み `Scopes` や `Scope.AllowedClients` など、ほかの検証はそのまま動きます。したがって `oauth-cli` が要求できるのは `api:read` だけです。

| リクエスト | 挙動 |
|---|---|
| `scope=openid profile email` | フル OIDC: `id_token`、`/userinfo`、grant 条件を満たせば `refresh_token` |
| `scope=api:read` | OAuth 2.0: `access_token`。OP とクライアントの双方が `refresh_token` grant を許す場合は `refresh_token` も返す。`id_token` は発行しない |
| 登録していない scope を含む `scope=api:read` | `invalid_scope` |
| `openid` を含まないリクエスト（オプション未指定） | `invalid_scope`（"openid scope is required"） |

選択は **リクエスト単位** で、クライアントの登録済み scope によって決まります。全体一括の切り替えではありません。`Scopes` に `openid` を含むクライアントは引き続き OIDC を要求できます。含まないクライアントは OAuth 専用のままです。

## 副作用

| 項目 | `openid` ありのリクエスト | `openid` なしのリクエスト |
|---|---|---|
| `/token` レスポンスの `id_token` | 発行する | 発行しない |
| `nonce` | 送られていれば保存し `id_token` に含める | 紐づける先がないので任意。プロファイルが要求する場合は別 |
| アクセストークンでの `/userinfo` | 呼び出せる | ユーザに紐づく認可コードのトークンで、scope がユーザ claim を許す場合だけ（ライブラリの拡張） |
| リフレッシュトークンの発行条件 | 付与 scope に `openid` があり、クライアントが `refresh_token` grant を持つこと | `openid` の条件は外れる。クライアントに `refresh_token` grant は必要 |

`client_credentials` のトークンはエンドユーザを表さないので、どちらのモードでも `/userinfo` は `invalid_token` で拒否します。

## 試す

example 冒頭のコメントに、OAuth 専用経路を手で動かす手順があります。PKCE のペアを作り、認可 URL をブラウザで開き、`demo` / `demo` でサインインしてから認可コードを交換します。

```sh
(cd examples/04-oauth2-only && GOWORK=off go run -tags example .)

VERIFIER='oauth2-only-example-verifier-0123456789-ABCDEFGHIJKLMN'
CHALLENGE="$(printf %s "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
open "http://127.0.0.1:8080/oidc/auth?client_id=oauth-cli&response_type=code&redirect_uri=http://localhost:5173/cb&scope=api:read&state=xyz&code_challenge=${CHALLENGE}&code_challenge_method=S256"

# 同意のあと、リダイレクト先 URL から code を取り出す:
curl -u oauth-cli:oauth2-only-demo-secret-rotate-me \
     -d "grant_type=authorization_code&code=<CODE>&redirect_uri=http://localhost:5173/cb&code_verifier=${VERIFIER}" \
     http://127.0.0.1:8080/oidc/token | jq
```

レスポンスには `access_token` が入り、`id_token` は入りません。付与された scope に `openid` がないためです。example は `op.WithAllowLocalhostLoopback()` を呼んで `http://localhost` の redirect URI を許可しています。これを呼ばない場合に受け付けるのは、IP リテラルの `127.0.0.1` と `[::1]` だけです。

## 排他関係

`op.WithOpenIDScopeOptional` は本ライブラリの FAPI 2.0 プロファイルと組み合わせられません。`op.New` がエラーを返します。これはライブラリのポリシーです。FAPI 2.0 Security Profile 自体は OIDC を使わない OAuth 2.0 リクエストにも適用でき、認証済みユーザの識別子が必要な場合に OIDC を使います。

```go
op.New(
  op.WithProfile(profile.FAPI2Baseline),
  op.WithOpenIDScopeOptional(), // ← op.New がエラーを返す
)
```

`op.WithStrictOfflineAccess()` も同時には指定できません。strict モードはリフレッシュトークンに OIDC Core §11 を適用するため、OIDC 以外のリクエストと組み合わせると、リフレッシュトークンが黙って発行されなくなるからです。

## いつ使うか

| シナリオ | 選択 |
|---|---|
| OAuth 2.0 のみ、ユーザなし（machine-to-machine） | [`client_credentials`](/ja/use-cases/client-credentials)。本オプションは不要 |
| 同じ OP で OAuth 2.0 クライアントと OIDC クライアントを併用 | 本オプション |
| FAPI 2.0 を運用 | 使用しない |

OP のクライアントがすべて OIDC の RP なら、オプションは指定しないでください。`openid` が抜けたリクエストを黙って処理せず、エラーにできます。

## 続きはこちら

- [トークン入門](/ja/concepts/tokens) — アクセストークンと ID トークンの中身。
- [Client Credentials](/ja/use-cases/client-credentials) — もう一つの「エンドユーザなし」経路。
