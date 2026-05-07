---
title: SPA / カスタム interaction
description: 任意の SPA（React / Vue / Svelte / Angular など）からログイン / 同意 / ログアウトを駆動。SPA-safe なエラー描画も同梱。
---

# ユースケース — SPA / カスタム interaction

::: info `op.WithSPAUI` と低レベル JSON driver
`op.WithSPAUI` は SPA shell・静的アセットツリー・JSON state 面を OP 側でまとめて mount します。自前 router で shell を配信し、prompt JSON だけ OP に任せたい場合は `op.WithInteractionDriver(interaction.JSONDriver{})` を直接使います。
:::

## 「interaction」レイヤとは何か

RP の `/authorize` リダイレクトと、OP からのコード付きリダイレクトバックの間で、OP は **interaction**（ログイン / 任意の MFA ステップアップ / 任意の同意プロンプト / 任意のアカウント選択）を実行します。OIDC Core 1.0 §3.1 は通信路上のデータ（要求パラメータと最終応答）を規定しますが、**この中間ページをどう描画するか** には踏み込みません。各 OP がそれぞれ UX を選びます。

本ライブラリでは UX をプラガブルな `interaction.Driver` としてモデル化しています。デフォルト driver はサーバサイド HTML を描画。JSON driver は同じプロンプトを JSON で返す（SPA 側で描画）。独自 driver で任意のフロントエンドと会話することもできます。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1（authorization endpoint）、§3.1.2.4（同意）
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — `/end_session`
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE（Proof Key for Code Exchange）
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1（ブラウザサイド public client）
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §5.2（エラー応答 JSON エンベロープ）
:::

::: details 用語の補足
- **Interaction レイヤ** — RP の `/authorize` リダイレクトと OP からのコード付きリダイレクトバックの間に挟まる一連の処理(ログイン / 任意の MFA ステップアップ / 任意の同意 / 任意のアカウント選択)。通信路上のパラメータは仕様で定まっていますが、*この中間ページをどう描画するか* は定まっていません。各 OP が UX を選びます — ここがプラグインの差し込み口です。
- **JSON driver** — プロンプトを HTML ではなく JSON で返す、ライブラリのプラガブル interaction バックエンド。ステートマシンは OP 側に残ります — SPA は `{ type: "login" | "consent.scope" | ... }` を取得して回答を送り返し、OP が次を決めます。
- **CSP（Content Security Policy）** — ページが読み込んでよいリソース種別をブラウザに伝えるレスポンスヘッダ（`Content-Security-Policy: default-src 'none'; ...`）。OP のエラーページは `<script>`、inline イベントハンドラ、任意 URL スキームを禁じる厳格なポリシーで描画されるので、悪意ある `error_description` が XSS に化けることはありません。
:::

> **ソース:**
> - [`examples/16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction) — JSON driver への最小差し替え。
> - [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) — `op.WithSPAUI` で OP 側に SPA を mount する構成。同梱バンドルはビルドステップ無しで動かすための素の HTML/CSS/JS ですが、シーム自体はフレームワーク非依存で、React / Vue / Svelte / Angular いずれも同じ形で乗ります。

## アーキテクチャ

低レベル JSON ドライバでは、OP は interaction のステートマシンを `/interaction/{uid}` に出し、各プロンプトを JSON で返します。SPA shell や静的アセットは自前のルーターで好きなパスから配信します。`op.WithSPAUI` では、OP が SPA 向けの tree を mount します: `LoginMount/{uid}` が shell、`LoginMount/state/{uid}` が prompt JSON、`StaticDir` 設定時は `LoginMount/assets/{path...}` が静的アセットです。

| Method | Path | 役割 |
|---|---|---|
| `GET` | `/interaction/{uid}`(JSON ドライバ) | 現在の prompt を JSON で返す |
| `POST` | `/interaction/{uid}`(JSON ドライバ) | ユーザのフォーム送信を受ける |
| `DELETE` | `/interaction/{uid}`(JSON ドライバ) | 進行中の interaction をキャンセル |
| `GET` | _自前のルート_ | SPA shell(自前バンドルの `index.html`) |
| `GET` | _自前のルート_ | 静的アセット(自前バンドル) |

`op.WithSPAUI(op.SPAUI{LoginMount: "/login", StaticDir: "./web/static"})` の場合、同じ state 契約は `/login/state/{uid}` に移動し、`/login/{uid}` が SPA shell を返します。

低レベル JSON ドライバ構成では、`/authorize` は `/interaction/{uid}` へリダイレクトします。`/authorize` のリダイレクトから RP のコールバックに戻る `code` 付きリダイレクトまでの間は、すべて SPA 上で完結します。

```mermaid
sequenceDiagram
    autonumber
    participant U as User browser
    participant SPA as SPA バンドル(自前のコード、自前のルーター)
    participant OP as OP

    U->>OP: GET /authorize?...
    OP->>OP: interaction uid + cookie 生成
    OP->>U: 302 -> /login/{uid}(自前のルート)
    U->>SPA: GET /login/{uid}
    SPA->>U: 200 index.html (SPA shell)
    U->>OP: GET /interaction/{uid}<br/>Accept: application/json
    OP->>U: 200 { type: "login", inputs: [...], state_ref, csrf_token }
    U->>U: SPA がログインフォームを描画
    U->>OP: POST /interaction/{uid}<br/>{ state_ref, values }
    OP->>U: 200 { type: "consent.scope", ... } or { redirect: "..." }
    U->>OP: POST /interaction/{uid}(consent の値)
    OP->>U: 200 { redirect: "/auth?...&code=..." }
    U->>SPA: window.location = redirect
```

ステートマシンは OP が所有します。SPA は次の prompt を取得し、ユーザの回答を送り返すと、OP が次に何を出すかを決めます。

## コード

### JSON driver への差し替え(最小変更)

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

provider, err := op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)
```

これですべての interaction ページが JSON を返すようになり、SPA は prompt を取得して回答を POST で送り返します。

### SPA の組み立て(フレームワーク非依存)

```go
import (
  "net/http"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/interaction"
)

provider, err := op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
  op.WithCORSOrigins("https://app.example.com"),
)

mux := http.NewServeMux()
// SPA shell + 静的アセットは自前のルートに配置。
mux.Handle("GET /login/", http.StripPrefix("/login/", http.FileServer(http.Dir("./web/dist"))))
// `/interaction/{uid}` を含むプロトコル面は OP が所有。
mux.Handle("/", provider)
```

OP が `/interaction/{uid}` に prompt JSON を返し、`/login/...` に置いた SPA バンドルが `fetch` でそれを取得します。フレームワークはスタックに合うものを選んでください — Go 側の書き方はどれでも同じです。

::: info SPA shell へのリダイレクト先
低レベル JSON ドライバ構成では、`/authorize` は `/interaction/{uid}` へリダイレクトします。先に SPA shell を読み込ませてから(shell が `Accept: application/json` で `/interaction/{uid}` を呼ぶ構成にしたい場合は)、SPA が想定するパス(例: `/login/{uid}`)で SPA shell を配信し、そこから `/interaction/{uid}` を直接 fetch させる構成にしてください。`op.WithSPAUI` では OP がこの shell redirect を行い、state endpoint は `LoginMount/state/{uid}` になります。
:::

::: info `op.WithSPAUI`
`op.SPAUI` は `LoginMount` / `ConsentMount` / `LogoutMount` / `StaticDir` を取り、SPA shell・静的アセットツリー・prompt JSON を 1 オプションで自動 mount します。JSON state endpoint は `LoginMount/state/{uid}` です。自前 router で shell を持ち、`/interaction/{uid}` から fetch したい場合だけ `interaction.JSONDriver` を直接使ってください。
:::

### フロントエンドスニペット

::: code-group

```jsx [React]
import { useEffect, useState } from "react";

// op/interaction の FieldKind iota:
//   0=text, 1=password, 2=otp, 3=email, 4=hidden。
const inputTypeFor = (kind) =>
  ({ 1: "password", 3: "email", 4: "hidden" })[kind] ?? "text";

export function Interaction({ uid }) {
  const stateURL = `/interaction/${uid}`;
  const [prompt, setPrompt] = useState(null);
  const [values, setValues] = useState({});

  useEffect(() => {
    fetch(stateURL, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then(setPrompt);
  }, [uid]);

  async function onSubmit(e) {
    e.preventDefault();
    const r = await fetch(stateURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": prompt.csrf_token ?? "",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ state_ref: prompt.state_ref, values }),
    });
    const next = await r.json();
    if (next.type === "redirect" && next.location) {
      window.location.href = next.location;
    } else {
      setPrompt(next);
      setValues({});
    }
  }

  if (!prompt) return null;
  return (
    <form onSubmit={onSubmit}>
      {prompt.inputs?.map((f) => (
        <label key={f.Name}>
          <span>{f.Label || f.Name}</span>
          <input
            name={f.Name}
            type={inputTypeFor(f.Kind)}
            required={f.Required}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.Name]: e.target.value }))
            }
          />
        </label>
      ))}
      <button type="submit">Continue</button>
    </form>
  );
}
```

```vue [Vue 3]
<script setup>
import { ref, reactive, onMounted } from "vue";

const props = defineProps({ uid: String });
const stateURL = `/interaction/${props.uid}`;
const prompt = ref(null);
const values = reactive({});

// op/interaction の FieldKind iota:
//   0=text, 1=password, 2=otp, 3=email, 4=hidden。
const inputTypeFor = (kind) =>
  ({ 1: "password", 3: "email", 4: "hidden" })[kind] ?? "text";

onMounted(async () => {
  const r = await fetch(stateURL, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  prompt.value = await r.json();
});

async function onSubmit() {
  const r = await fetch(stateURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": prompt.value.csrf_token ?? "",
      Accept: "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      state_ref: prompt.value.state_ref,
      values,
    }),
  });
  const next = await r.json();
  if (next.type === "redirect" && next.location) {
    window.location.href = next.location;
  } else {
    prompt.value = next;
    for (const k of Object.keys(values)) delete values[k];
  }
}
</script>

<template>
  <form v-if="prompt" @submit.prevent="onSubmit">
    <label v-for="f in prompt.inputs" :key="f.Name">
      <span>{{ f.Label || f.Name }}</span>
      <input
        :name="f.Name"
        :type="inputTypeFor(f.Kind)"
        :required="f.Required"
        v-model="values[f.Name]"
      />
    </label>
    <button type="submit">Continue</button>
  </form>
</template>
```

:::

どちらのタブも流れは同じです。`/interaction/{uid}` から prompt を GET → 宣言された `inputs` を描画 → `{state_ref, values}` を POST で送り返す。OP は次のプロンプトか、終端の `{type: "redirect", location: "..."}` エンベロープを返し、SPA は `window.location.href` でそこに飛びます。通信路上の形は `op/interaction` をそのまま反映:

- `Prompt` — `type` / `data` / `inputs` / `state_ref` / `csrf_token` に加えてロケールエンベロープ（`locale` / `ui_locales_hint` / `locales_available` — 詳細は [i18n / ロケールネゴシエーション](/ja/use-cases/i18n#解決済みロケールの読み取り)）。すべて lower_snake_case の JSON タグ付き。
- `FieldSpec` — JSON タグが無いため Go の field 名がそのまま出力されます（`Name` / `Kind` / `Label` / `Required` / `MaxLen` / `MinLen` / `Pattern`）。`Kind` は上記の整数 enum。
- 終端 redirect エンベロープ — `{"type":"redirect","location":"<URL>"}`。OP 側で orchestrator の終端 302 をこの形に書き換えて返します（クロスオリジン `fetch` は RP コールバックの redirect を辿れないため、SPA がドキュメントレベルで navigate できるように）。

契約はフレームワーク間で同一 — 違うのは描画イディオムだけです。

::: tip 同意ステップ
`prompt.type === "consent.scope"` のときは `inputs` が空で、scope カタログは `prompt.data.scopes` に入ります。SPA はそのリストを描画して（`s.required` のものはトグル不可で表示）、`{ approved_scopes: "openid profile" }`（空白区切りのサブセット）として送信します。`prompt.type` 分岐の実装例は [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) の `web/static/assets/main.js` を参照。
:::

::: info `X-CSRF-Token` を送る理由
OP がセッション開始時に `__Host-oidc_csrf` cookie を発行し、各プロンプトのエンベロープにその cookie 値を `csrf_token` として echo します。SPA の責務は、`prompt.csrf_token` を読んで送信時の `X-CSRF-Token` ヘッダーに乗せるだけ — OP がヘッダー値と cookie 値を照合します（double-submit cookie パターン）。SPA は token を生成・検証・保存しません。cookie は `HttpOnly` のままで構いません。
:::

## SPA-safe エラー描画

OP のエラーページは `data-*` 属性付きの安定アンカーを出力するので、SPA host は 1 回の `document.querySelector` で読めます:

```html
<div id="op-error"
     data-code="invalid_request_uri"
     data-description="request_uri has expired"
     data-state="abc">
  <h1>Authorization error</h1>
  ...
</div>
```

::: info CSP-safe な構造
エラーページは `default-src 'none'; style-src 'unsafe-inline'` で描画されます。`<script>` 無し、inline イベントハンドラ無し、inline 画像無し、`javascript:` URL 無し。`error_description` / `state` に攻撃的な値が乗っていても、反映前に HTML エスケープされます。
:::

OP は `Accept` ヘッダで形式をネゴシエーションします。
- `Accept: text/html`（ブラウザナビゲーション） → `data-*` 付き HTML ページ。
- `Accept: application/json`（XHR / fetch） → RFC 6749 §5.2 の JSON エンベロープ。
- ヘッダ未指定または `*/*` → JSON エンベロープ（XHR / curl 向けの安全なデフォルト）。

これにより、SPA の `fetch()` 呼び出しには引き続き JSON が返り、URL を直接踏んでしまったユーザには、SPA がロードした時点で拾える機械可読属性付きのエラーページが届きます。

## CORS

SPA が OP と異なる origin で配信される場合は明示許可:

```go
op.WithCORSOrigins(
  "https://app.example.com",
  "https://staging-app.example.com",
)
```

ライブラリは登録済み `redirect_uri` の origin を per-RP で自動 allowlist もします（static クライアント設定なら CORS 設定の重複不要）。詳細は [SPA 向け CORS](/ja/use-cases/cors-spa)。

## フル SPA 化せず、文言だけ差し替えたい

同意画面の文言だけを差し替えたい(翻訳コピー、ブランドトーン)場合は、`op.WithLocale` で seed bundle にキー単位で重ねるのが最短です。同梱 HTML ドライバはそれをそのまま描画するので、CSP / CSRF scheme もそのまま維持できます。詳細は [カスタム同意 UI](/ja/use-cases/custom-consent-ui) と [i18n / ロケールネゴシエーション](/ja/use-cases/i18n) を参照してください。

`op.WithConsentUI` は、interaction transport 全体を SPA に寄せずに同意画面 template だけを差し替えるサーバー描画の経路です。markup を完全にクライアント側で持ちたい場合は、上記の JSON ドライバ経路を使います。
