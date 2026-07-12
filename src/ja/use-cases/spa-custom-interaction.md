---
title: SPA / 対話画面のカスタマイズ
description: 任意の SPA（React / Vue / Svelte / Angular など）からログイン / 同意 / ログアウトを扱う。SPA から読み取りやすいエラー描画も同梱。
---

# 使い方 — SPA / 対話画面のカスタマイズ

::: info `op.WithSPAUI` と低レベル JSON ドライバ
`op.WithSPAUI` は、SPA の入口、静的アセット、画面状態 JSON を OP 側でまとめて公開します。自前のルーターで SPA を配信し、画面状態 JSON だけ OP に任せたい場合は `op.WithInteractionDriver(interaction.JSONDriver{})` を直接使います。
:::

## 「対話画面」レイヤとは何か

RP の `/authorize` リダイレクトと、OP からのコード付きリダイレクトバックの間で、OP は **interaction**（ログイン / 任意の MFA ステップアップ / 任意の同意画面 / 任意のアカウント選択）を実行します。OIDC Core 1.0 §3.1 は通信路上のデータ（要求パラメータと最終応答）を規定しますが、**この中間ページをどう描画するか** には踏み込みません。各 OP がそれぞれ UX を選びます。

本ライブラリでは、この中間ページ群を差し替え可能な `interaction.Driver` として扱います。既定のドライバはサーバ側で HTML を描画します。JSON ドライバは同じ画面状態を JSON で返し、SPA 側で描画できるようにします。独自ドライバを実装すれば、任意のフロントエンドと接続できます。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1（authorization endpoint）、§3.1.2.4（同意）
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — `/end_session`
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE（Proof Key for Code Exchange）
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1（ブラウザサイド public client）
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §5.2（エラー JSON 応答）
:::

::: details 用語の補足
- **対話画面レイヤ** — RP の `/authorize` リダイレクトと OP からのコード付きリダイレクトバックの間に挟まる一連の処理(ログイン / 任意の MFA ステップアップ / 任意の同意 / 任意のアカウント選択)。通信路上のパラメータは仕様で定まっていますが、*この中間ページをどう描画するか* は定まっていません。ここが差し替え口です。
- **JSON ドライバ** — 画面を HTML ではなく JSON で返す差し替え口です。状態遷移は OP 側に残ります。SPA は `{ type: "login" | "consent.scope" | ... }` を取得して回答を送り返し、OP が次を決めます。
- **CSP（Content Security Policy）** — ページが読み込んでよいリソース種別をブラウザに伝えるレスポンスヘッダ（`Content-Security-Policy: default-src 'none'; ...`）。OP のエラーページは `<script>`、inline イベントハンドラ、任意 URL スキームを禁じる厳格なポリシーで描画されるので、悪意ある `error_description` が XSS に化けることはありません。
:::

> **ソース:**
> - [`examples/16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction) — JSON driver への最小差し替え。
> - [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) — `op.WithSPAUI` で OP 側に SPA を公開する構成。同梱バンドルはビルド手順なしで動かすための素の HTML/CSS/JS ですが、接続点はフレームワーク非依存で、React / Vue / Svelte / Angular いずれも同じ形で使えます。

## アーキテクチャ

低レベル JSON ドライバでは、OP は interaction の状態機械を `/interaction/{uid}` に出し、各画面を JSON で返します。SPA の入口や静的アセットは、自前のルーターで好きなパスから配信します。`op.WithSPAUI` では、OP が SPA 向けの一式を公開します。`LoginMount/{uid}` が SPA の入口、`LoginMount/state/{uid}` が画面状態 JSON、`StaticDir` 設定時は `LoginMount/assets/{path...}` が静的アセットです。

| Method | Path | 役割 |
|---|---|---|
| `GET` | `/interaction/{uid}`(JSON ドライバ) | 現在の画面状態を JSON で返す |
| `POST` | `/interaction/{uid}`(JSON ドライバ) | ユーザのフォーム送信を受ける |
| `DELETE` | `/interaction/{uid}`(JSON ドライバ) | 進行中の interaction をキャンセル |
| `GET` | _自前のルート_ | SPA の入口(自前バンドルの `index.html`) |
| `GET` | _自前のルート_ | 静的アセット(自前バンドル) |

`op.WithSPAUI(op.SPAUI{LoginMount: "/login", StaticDir: "./web/static"})` の場合、同じ状態取得 API は `/login/state/{uid}` に移動し、`/login/{uid}` が SPA の入口を返します。

低レベル JSON ドライバ構成では、`/authorize` は `/interaction/{uid}` へリダイレクトします。`/authorize` のリダイレクトから RP のコールバックに戻る `code` 付きリダイレクトまでの間は、すべて SPA 上で完結します。

<svg role="img" aria-labelledby="spa-interaction-seq-title" viewBox="0 0 760 518" width="760" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="spa-interaction-seq-title">JSON ドライバ構成の SPA interaction のシーケンス: ブラウザが SPA の入口を読み込み、各画面状態を OP から JSON で取得して回答を送り返し、終端の redirect 応答に従う。</title>

  <line class="life" x1="120" y1="56" x2="120" y2="505"/>
  <line class="life" x1="385" y1="56" x2="385" y2="505"/>
  <line class="life op-accent" x1="650" y1="56" x2="650" y2="505"/>

  <rect x="45" y="16" width="150" height="40" rx="5"/>
  <text class="actor" x="120" y="41" text-anchor="middle">ユーザのブラウザ</text>
  <rect x="310" y="16" width="150" height="40" rx="5"/>
  <text class="actor" x="385" y="34" text-anchor="middle">SPA バンドル</text>
  <text class="sub" x="385" y="48" text-anchor="middle">自前のコード・自前のルーター</text>
  <rect class="op-accent" x="575" y="16" width="150" height="40" rx="5"/>
  <text class="actor op-text" x="650" y="41" text-anchor="middle">OP</text>

  <circle class="badge" cx="22" cy="88" r="9"/><text class="num" x="22" y="91.5" text-anchor="middle">1</text>
  <line x1="120" y1="88" x2="650" y2="88"/>
  <path d="M642,84 L650,88 L642,92"/>
  <text class="mono" x="385" y="82" text-anchor="middle">GET /authorize?...</text>

  <circle class="badge" cx="22" cy="121" r="9"/><text class="num" x="22" y="124.5" text-anchor="middle">2</text>
  <rect class="note" x="553" y="109" width="194" height="24" rx="4"/>
  <text class="lbl" x="650" y="124.5" text-anchor="middle">interaction uid + cookie 生成</text>

  <circle class="badge" cx="22" cy="154" r="9"/><text class="num" x="22" y="157.5" text-anchor="middle">3</text>
  <line x1="650" y1="154" x2="120" y2="154"/>
  <path d="M128,150 L120,154 L128,158"/>
  <text x="385" y="148" text-anchor="middle"><tspan class="mono">302 → /login/{uid}</tspan><tspan class="lbl">(自前のルート)</tspan></text>

  <circle class="badge" cx="22" cy="187" r="9"/><text class="num" x="22" y="190.5" text-anchor="middle">4</text>
  <line x1="120" y1="187" x2="385" y2="187"/>
  <path d="M377,183 L385,187 L377,191"/>
  <text class="mono" x="252" y="181" text-anchor="middle">GET /login/{uid}</text>

  <circle class="badge" cx="22" cy="220" r="9"/><text class="num" x="22" y="223.5" text-anchor="middle">5</text>
  <line x1="385" y1="220" x2="120" y2="220"/>
  <path d="M128,216 L120,220 L128,224"/>
  <text x="252" y="214" text-anchor="middle"><tspan class="mono">200 index.html</tspan><tspan class="lbl"> (SPA 入口)</tspan></text>

  <circle class="badge" cx="22" cy="253" r="9"/><text class="num" x="22" y="256.5" text-anchor="middle">6</text>
  <line x1="120" y1="253" x2="650" y2="253"/>
  <path d="M642,249 L650,253 L642,257"/>
  <text class="mono" x="385" y="247" text-anchor="middle">GET /interaction/{uid} · Accept: application/json</text>

  <circle class="badge" cx="22" cy="286" r="9"/><text class="num" x="22" y="289.5" text-anchor="middle">7</text>
  <line x1="650" y1="286" x2="120" y2="286"/>
  <path d="M128,282 L120,286 L128,290"/>
  <text class="mono" x="385" y="280" text-anchor="middle">200 { type:"login", inputs, state_ref, csrf_token }</text>

  <circle class="badge" cx="22" cy="319" r="9"/><text class="num" x="22" y="322.5" text-anchor="middle">8</text>
  <rect class="note" x="42" y="307" width="156" height="24" rx="4"/>
  <text class="lbl" x="120" y="322.5" text-anchor="middle">SPA がログインフォームを描画</text>

  <circle class="badge" cx="22" cy="352" r="9"/><text class="num" x="22" y="355.5" text-anchor="middle">9</text>
  <line x1="120" y1="352" x2="650" y2="352"/>
  <path d="M642,348 L650,352 L642,356"/>
  <text class="mono" x="385" y="346" text-anchor="middle">POST /interaction/{uid} · { state_ref, values }</text>

  <circle class="badge" cx="22" cy="385" r="9"/><text class="num" x="22" y="388.5" text-anchor="middle">10</text>
  <line x1="650" y1="385" x2="120" y2="385"/>
  <path d="M128,381 L120,385 L128,389"/>
  <text x="385" y="379" text-anchor="middle"><tspan class="mono">200 { type:"consent.scope", … }</tspan><tspan class="lbl"> または </tspan><tspan class="mono">{ type:"redirect", … }</tspan></text>

  <circle class="badge" cx="22" cy="418" r="9"/><text class="num" x="22" y="421.5" text-anchor="middle">11</text>
  <line x1="120" y1="418" x2="650" y2="418"/>
  <path d="M642,414 L650,418 L642,422"/>
  <text x="385" y="412" text-anchor="middle"><tspan class="mono">POST /interaction/{uid}</tspan><tspan class="lbl">(consent の値)</tspan></text>

  <circle class="badge" cx="22" cy="451" r="9"/><text class="num" x="22" y="454.5" text-anchor="middle">12</text>
  <line x1="650" y1="451" x2="120" y2="451"/>
  <path d="M128,447 L120,451 L128,455"/>
  <text class="mono" x="385" y="445" text-anchor="middle">200 { type:"redirect", location:"/auth?…&amp;code=…" }</text>

  <circle class="badge" cx="22" cy="484" r="9"/><text class="num" x="22" y="487.5" text-anchor="middle">13</text>
  <line x1="120" y1="484" x2="385" y2="484"/>
  <path d="M377,480 L385,484 L377,488"/>
  <text class="mono" x="252" y="478" text-anchor="middle">window.location.href = location</text>
</svg>

状態遷移は OP が所有します。SPA は次の画面状態を取得し、ユーザの回答を送り返すだけです。OP が次に何を出すかを決めます。

## コード

### JSON ドライバへの差し替え(最小変更)

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

provider, err := op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)
```

これですべての interaction ページが JSON を返すようになり、SPA は画面状態を取得して回答を POST で送り返します。

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
// SPA の入口 + 静的アセットは自前のルートに配置。
mux.Handle("GET /login/", http.StripPrefix("/login/", http.FileServer(http.Dir("./web/dist"))))
// `/interaction/{uid}` を含むプロトコル面は OP が所有。
mux.Handle("/", provider)
```

OP が `/interaction/{uid}` に画面状態 JSON を返し、`/login/...` に置いた SPA バンドルが `fetch` でそれを取得します。フレームワークは構成に合うものを選んでください。Go 側の書き方はどれでも同じです。

::: info SPA の入口へのリダイレクト先
低レベル JSON ドライバ構成では、`/authorize` は `/interaction/{uid}` へリダイレクトします。先に SPA を読み込ませてから、SPA が `Accept: application/json` で `/interaction/{uid}` を呼ぶ構成にしたい場合は、SPA が想定するパス(例: `/login/{uid}`)で SPA の入口を配信し、そこから `/interaction/{uid}` を直接 fetch させる構成にしてください。`op.WithSPAUI` では OP がこのリダイレクトを行い、状態取得エンドポイントは `LoginMount/state/{uid}` になります。
:::

::: info `op.WithSPAUI`
`op.SPAUI` は `LoginMount` / `ConsentMount` / `LogoutMount` / `StaticDir` を取り、SPA の入口・静的アセット一式・画面状態 JSON を 1 オプションで公開します。JSON の状態取得エンドポイントは `LoginMount/state/{uid}` です。自前ルータで SPA を配信し、`/interaction/{uid}` から fetch したい場合だけ `interaction.JSONDriver` を直接使ってください。
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

どちらのタブも流れは同じです。`/interaction/{uid}` から画面状態を GET し、宣言された `inputs` を描画し、`{state_ref, values}` を POST で送り返します。OP は次の画面状態か、終端の `{type: "redirect", location: "..."}` 応答を返し、SPA は `window.location.href` でそこへ遷移します。通信路上の形は `op/interaction` をそのまま反映します。

- `Prompt` — `type` / `data` / `inputs` / `state_ref` / `csrf_token` に加えてロケール情報（`locale` / `ui_locales_hint` / `locales_available` — 詳細は [i18n / ロケール解決](/ja/use-cases/i18n#解決済みロケールの読み取り)）。すべて lower_snake_case の JSON タグ付き。
- `FieldSpec` — JSON タグが無いため Go の field 名がそのまま出力されます（`Name` / `Kind` / `Label` / `Required` / `MaxLen` / `MinLen` / `Pattern`）。`Kind` は上記の整数 enum。
- 終端 redirect 応答 — `{"type":"redirect","location":"<URL>"}`。OP 側で orchestrator の終端 302 をこの形に書き換えて返します（クロスオリジン `fetch` は RP コールバックの redirect を辿れないため、SPA がページ全体を遷移させられるように）。

通信路上の契約はフレームワーク間で同一です。違うのは描画方法だけです。

::: tip 同意ステップ
`prompt.type === "consent.scope"` のときは `inputs` が空で、scope カタログは `prompt.data.scopes` に入ります。SPA はそのリストを描画して（`s.required` のものはトグル不可で表示）、`{ approved_scopes: "openid profile" }`（空白区切りのサブセット）として送信します。`prompt.type` 分岐の実装例は [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) の `web/static/assets/main.js` を参照。
:::

::: info `X-CSRF-Token` を送る理由
OP がセッション開始時に `__Host-oidc_csrf` cookie を発行し、各プロンプト応答にその cookie 値を `csrf_token` として echo します。SPA の責務は、`prompt.csrf_token` を読んで送信時の `X-CSRF-Token` ヘッダーに乗せるだけ — OP がヘッダー値と cookie 値を照合します（double-submit cookie パターン）。SPA は token を生成・検証・保存しません。cookie は `HttpOnly` のままで構いません。
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
- `Accept: application/json`（XHR / fetch） → RFC 6749 §5.2 の JSON 応答。
- ヘッダ未指定または `*/*` → JSON 応答（XHR / curl 向けの安全な既定）。

これにより、SPA の `fetch()` 呼び出しには引き続き JSON が返り、URL を直接踏んでしまったユーザには、SPA がロードした時点で拾える機械可読属性付きのエラーページが届きます。

## CORS

SPA が OP と異なる origin で配信される場合は明示許可:

```go
op.WithCORSOrigins(
  "https://app.example.com",
  "https://staging-app.example.com",
)
```

ライブラリは登録済み `redirect_uri` の origin を RP ごとの許可リストへ自動で追加します（static クライアント設定なら CORS 設定の重複不要）。詳細は [SPA 向け CORS](/ja/use-cases/cors-spa)。

## フル SPA 化せず、文言だけ差し替えたい

同意画面の文言だけを差し替えたい(翻訳コピー、ブランドトーン)場合は、`op.WithLocale` で seed bundle にキー単位で重ねるのが最短です。同梱 HTML ドライバはそれをそのまま描画するので、CSP / CSRF scheme もそのまま維持できます。詳細は [カスタム同意 UI](/ja/use-cases/custom-consent-ui) と [i18n / ロケール解決](/ja/use-cases/i18n) を参照してください。

`op.WithConsentUI` は、interaction transport 全体を SPA に寄せずに同意画面 template だけを差し替えるサーバ描画の経路です。markup を完全にクライアント側で持ちたい場合は、上記の JSON ドライバ経路を使います。
