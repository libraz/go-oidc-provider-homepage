---
title: SPA / 対話画面のカスタマイズ
description: SPA からログインと同意を扱い、組み込みのログアウト確認を使う方法を説明します。custom interaction mount、CSP、ceremony の origin ルールも明記します。
pageClass: pg-use-cases-spa-custom-interaction
---

# 使い方 — SPA / 対話画面のカスタマイズ

::: info `op.WithSPAUI` と低レベル JSON ドライバ
`op.WithSPAUI` は、SPA の入口、静的アセット、画面状態 JSON を OP 側でまとめて公開します。自前のルータで SPA を配信し、画面状態 JSON だけ OP に任せたい場合は `op.WithInteractionDriver(interaction.JSONDriver{})` を直接使います。
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
- **対話画面レイヤ** — RP の `/authorize` リダイレクトと OP からのコード付きリダイレクトバックの間に挟まる一連の処理（ログイン / 任意の MFA ステップアップ / 任意の同意 / 任意のアカウント選択）。通信路上のパラメータは仕様で定まっていますが、*この中間ページをどう描画するか* は定まっていません。ここが差し替え口です。
- **JSON ドライバ** — 画面を HTML ではなく JSON で返す差し替え口です。状態遷移は OP 側に残ります。SPA は `{ type: "login" | "consent.scope" | ... }` を取得して回答を送り返し、OP が次を決めます。
- **CSP（Content Security Policy）** — ページが読み込んでよいリソース種別をブラウザに伝えるレスポンスヘッダ（`Content-Security-Policy: default-src 'none'; ...`）。OP のエラーページは `<script>`、inline イベントハンドラ、任意 URL スキームを禁じる厳格なポリシーで描画されるので、悪意ある `error_description` が XSS に化けることはありません。
:::

> **ソース:**
> - [`examples/16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction) — JSON driver への最小差し替え。
> - [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) — `op.WithSPAUI` で OP 側に SPA を公開する構成。同梱バンドルはビルド手順なしで動かすための素の HTML/CSS/JS ですが、接続点はフレームワーク非依存で、React / Vue / Svelte / Angular いずれも同じ形で使えます。
> - [`examples/17-spa-composite-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/17-spa-composite-store) — 本番に近い組み合わせ。SPA interaction、永続状態用 MySQL、session / interaction / consumed JTI 用 Redis をまとめて動かします。

## アーキテクチャ

低レベル JSON ドライバでは、OP は interaction の状態機械を `/interaction/{uid}` に出し、各画面を JSON で返します。SPA の入口や静的アセットは、自前のルータで好きなパスから配信します。`op.WithSPAUI` では、OP が SPA 向けの一式を公開します。`LoginMount/{uid}` が SPA の入口、`LoginMount/state/{uid}` が画面状態 JSON、`StaticDir` 設定時は `LoginMount/assets/{path...}` が静的アセットです。route に影響する field は `LoginMount` だけで、`ConsentMount` と `LogoutMount` は互換性のため残る inert / deprecated field であり、route を作りません。

| Method | Path | 役割 |
|---|---|---|
| `GET` | `/interaction/{uid}`(JSON ドライバ) | 現在の画面状態を JSON で返す |
| `POST` | `/interaction/{uid}`(JSON ドライバ) | ユーザのフォーム送信を受ける |
| `DELETE` | `/interaction/{uid}`(JSON ドライバ) | 進行中の interaction をキャンセル |
| `GET` | _自前のルート_ | SPA の入口（自前バンドルの `index.html`） |
| `GET` | _自前のルート_ | 静的アセット（自前バンドル） |

`op.WithSPAUI(op.SPAUI{LoginMount: "/login", StaticDir: "./web/static"})` の場合、同じ状態取得 API は `/login/state/{uid}` に移動し、`/login/{uid}` が SPA の入口を返します。

低レベル JSON ドライバ構成では、`/authorize` は `/interaction/{uid}` へリダイレクトします。`/authorize` のリダイレクトから RP のコールバックに戻る `code` 付きリダイレクトまでの間は、すべて SPA 上で完結します。

<figure class="fig">
  <div class="fig-head">SPA が各画面を JSON で取りにいく</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-spa-title" viewBox="0 0 960 520" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-spa-title">ブラウザは組み込み側が持つルートへリダイレクトされ、そこで SPA の入口が返ります。以降 SPA は各 interaction の状態を OP から JSON で取得し、回答を送り返し、最後に redirect 応答に従って authorize エンドポイントへ戻ります。</title>
    <line class="fg-life" x1="150" y1="72" x2="150" y2="510"/>
    <line class="fg-life" x1="490" y1="72" x2="490" y2="510"/>
    <line class="fg-life fg-life--accent" x1="830" y1="72" x2="830" y2="510"/>
    <rect class="fg-box" x="60" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t" x="150" y="44" text-anchor="middle">ユーザのブラウザ</text>
    <rect class="fg-box" x="390" y="24" width="200" height="44" rx="6"/>
    <text class="fg-t" x="490" y="44" text-anchor="middle">SPA バンドル</text>
    <text class="fg-xs" x="490" y="59" text-anchor="middle">自前のコード · 自前のルータ</text>
    <rect class="fg-box fg-box--accent" x="740" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t fg-accent" x="830" y="44" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="830" y="59" text-anchor="middle">go-oidc-provider</text>
    <circle class="fg-badge" cx="15" cy="100" r="8.5"/>
    <text class="fg-badge-t" x="15" y="103" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,100 H830" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="490" y="94" text-anchor="middle">GET /authorize?…</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="136" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="139" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M830,128 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="872" y="140">interaction の uid を作り、cookie を設定する</text>
    <circle class="fg-badge" cx="15" cy="172" r="8.5"/>
    <text class="fg-badge-t" x="15" y="175" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--accent" d="M830,172 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs fg-halo" x="490" y="166" text-anchor="middle">302 → /login/{uid} — 組み込み側が持つルート</text>
    <circle class="fg-badge" cx="15" cy="208" r="8.5"/>
    <text class="fg-badge-t" x="15" y="211" text-anchor="middle">4</text>
    <path class="fg-edge" d="M150,208 H490" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="320" y="202" text-anchor="middle">GET /login/{uid}</text>
    <circle class="fg-badge" cx="15" cy="240" r="8.5"/>
    <text class="fg-badge-t" x="15" y="243" text-anchor="middle">5</text>
    <path class="fg-edge" d="M490,240 H150" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="320" y="234" text-anchor="middle">200 index.html — SPA の入口</text>
    <circle class="fg-badge" cx="15" cy="276" r="8.5"/>
    <text class="fg-badge-t" x="15" y="279" text-anchor="middle">6</text>
    <path class="fg-edge" d="M490,276 H830" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="660" y="270" text-anchor="middle">GET /interaction/{uid} · Accept: application/json</text>
    <circle class="fg-badge" cx="15" cy="312" r="8.5"/>
    <text class="fg-badge-t" x="15" y="315" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M830,312 H490" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="660" y="306" text-anchor="middle">200 { type:"login", inputs, state_ref, csrf_token }</text>
    <circle class="fg-badge" cx="15" cy="344" r="8.5"/>
    <text class="fg-badge-t" x="15" y="347" text-anchor="middle">8</text>
    <path class="fg-edge fg-edge--muted" d="M490,336 h28 v16 h-28" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="530" y="348">SPA が自分のやり方でログインフォームを描画する</text>
    <circle class="fg-badge" cx="15" cy="380" r="8.5"/>
    <text class="fg-badge-t" x="15" y="383" text-anchor="middle">9</text>
    <path class="fg-edge" d="M490,380 H830" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="660" y="374" text-anchor="middle">POST /interaction/{uid} · { state_ref, values }</text>
    <circle class="fg-badge" cx="15" cy="416" r="8.5"/>
    <text class="fg-badge-t" x="15" y="419" text-anchor="middle">10</text>
    <path class="fg-edge fg-edge--accent" d="M830,416 H490" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="660" y="410" text-anchor="middle">200 { type:"consent.scope", … } — または redirect 応答</text>
    <circle class="fg-badge" cx="15" cy="452" r="8.5"/>
    <text class="fg-badge-t" x="15" y="455" text-anchor="middle">11</text>
    <path class="fg-edge" d="M490,452 H830" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="660" y="446" text-anchor="middle">POST /interaction/{uid} · 同意の値</text>
    <circle class="fg-badge" cx="15" cy="484" r="8.5"/>
    <text class="fg-badge-t" x="15" y="487" text-anchor="middle">12</text>
    <path class="fg-edge fg-edge--accent" d="M830,484 H490" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="660" y="478" text-anchor="middle">200 { type:"redirect", location:"/authorize?…&amp;code=…" }</text>
    <circle class="fg-badge" cx="15" cy="510" r="8.5"/>
    <text class="fg-badge-t" x="15" y="513" text-anchor="middle">13</text>
    <path class="fg-edge" d="M490,510 H150" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="320" y="504" text-anchor="middle">window.location.href = location</text>
  </svg>
  <figcaption class="fig-note">手順 6 から 12 で HTML は一切生成されません。OP は画面が何を尋ねるべきかを記述するだけで、見た目も描画に使うフレームワークも、境界の組み込み側にあります。</figcaption>
</figure>

状態遷移は OP が所有します。SPA は次の画面状態を取得し、ユーザの回答を送り返すだけです。OP が次に何を出すかを決めます。

## コード

### JSON ドライバへの差し替え（最小変更）

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

provider, err := op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)
```

これですべての interaction ページが JSON を返すようになり、SPA は画面状態を取得して回答を POST で送り返します。

### SPA の組み立て（フレームワーク非依存）

```go
import (
  "net/http"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/interaction"
)

provider, err := op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
  op.WithCORSOrigins("https://app.example.com"), // ceremony 用の issuer-same-site origin
)

mux := http.NewServeMux()
// SPA の入口 + 静的アセットは自前のルートに配置。
mux.Handle("GET /login/", http.StripPrefix("/login/", http.FileServer(http.Dir("./web/dist"))))
// `/interaction/{uid}` を含むプロトコル面は OP が所有。
mux.Handle("/", provider)
```

OP が `/interaction/{uid}` に画面状態 JSON を返し、`/login/...` に置いた SPA バンドルが `fetch` でそれを取得します。フレームワークは構成に合うものを選んでください。Go 側の書き方はどれでも同じです。

::: info SPA の入口へのリダイレクト先
低レベル JSON ドライバ構成では、`/authorize` は `/interaction/{uid}` へリダイレクトします。先に SPA を読み込ませてから、SPA が `Accept: application/json` で `/interaction/{uid}` を呼ぶ構成にしたい場合は、SPA が想定するパス（例: `/login/{uid}`）で SPA の入口を配信し、そこから `/interaction/{uid}` を直接 fetch させる構成にしてください。`op.WithSPAUI` では OP がこのリダイレクトを行い、状態取得エンドポイントは `LoginMount/state/{uid}` になります。
:::

::: info `op.WithSPAUI`
`op.SPAUI` で実際に使われるのは `LoginMount` と `StaticDir` です。`ConsentMount` と `LogoutMount` は source compatibility のため struct に残っていますが、handler は読みません。同意画面は同じ `LoginMount/state/{uid}` prompt surface を使い、組み込み logout confirmation は通常の end-session flow に残ります。自前ルータで SPA を配信し、`/interaction/{uid}` から fetch したい場合だけ `interaction.JSONDriver` を直接使ってください。
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
`prompt.type === "consent.scope"` のときは `inputs` が空で、scope カタログは `prompt.data.scopes` に入ります。SPA はそのリストを描画して（`s.required` のものはトグル不可で表示）、`{ approved_scopes: "openid profile" }`（空白区切りのサブセット）として送信します。[`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) は共有の組み込み SPA を配信します。置き換える場合はクライアント側で `prompt.type` の分岐を実装してください。
:::

::: info `X-CSRF-Token` を送る理由
OP がセッション開始時に `__Host-oidc_csrf` cookie を発行し、各プロンプト応答にその cookie 値を `csrf_token` として echo します。SPA の責務は、`prompt.csrf_token` を読んで送信時の `X-CSRF-Token` ヘッダに乗せるだけ — OP がヘッダ値と cookie 値を照合します（double-submit cookie パターン）。SPA は token を生成・検証・保存しません。cookie は `HttpOnly` のままで構いません。
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

API CORS では、ライブラリは登録済み `redirect_uri` の origin を RP ごとの許可リストへ自動で追加します（static クライアント設定なら CORS 設定の重複不要）。ただし、その導出だけで interaction や end-session state の POST 送信元が認可されるわけではありません。ceremony check は issuer origin と `op.WithCORSOrigins` で明示した origin だけを許可し、ceremony origin は issuer と same-site でなければなりません。明示された origin が本当に cross-site でも preflight と CORS ヘッダまでは通りますが、ブラウザは `__Host-` ceremony cookie（`__Host-oidc_interaction` は `SameSite=Lax`、`__Host-oidc_csrf` と `__Host-oidc_logout_csrf` は `SameSite=Strict`）を送らないため、interaction と end-session のリクエストは `404` になります。ceremony UI は `op.example.com` に対する `login.example.com` のような issuer と同じ site の sibling host に配置してください。詳細は [SPA 向け CORS](/ja/use-cases/cors-spa) を参照してください。

上のスニペットは provider の隣で SPA の入口を配信するため、`credentials: "same-origin"` が正しい設定です。入口を別 origin（ただし same-site）で配信する場合は、fetch 先を OP の絶対 URL にし、`credentials: "include"` を使ってください。cross-site の origin では cookie に束縛された ceremony を動かせません。

## フル SPA 化せず、文言だけ差し替えたい

同意画面の文言だけを差し替えたい（翻訳コピー、ブランドトーン）場合は、`op.WithLocale` で seed bundle にキー単位で重ねるのが最短です。同梱 HTML ドライバはそれをそのまま描画するので、CSP / CSRF scheme もそのまま維持できます。詳細は [カスタム同意 UI](/ja/use-cases/custom-consent-ui) と [i18n / ロケール解決](/ja/use-cases/i18n) を参照してください。

`op.WithConsentUI` は、interaction transport 全体を SPA に寄せずに同意画面 template だけを差し替えるサーバ描画の経路です。markup を完全にクライアント側で持ちたい場合は、上記の JSON ドライバ経路を使います。
