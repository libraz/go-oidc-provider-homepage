---
title: アーキテクチャ概観
description: リクエストが OP の中をどう流れるか — パッケージ構成、ハンドラの配置、ストレージの差し込み口。
outline: 2
---

# アーキテクチャ概観

`op.New(...)` は `http.ServeMux` を内部に持つ `http.Handler` を返します。本ページでは、リクエスト到着からレスポンスまでの間に OP が何を実行するか、関わるパッケージ、検証の順序、組み込み側が制御するストレージの差し込み口を整理します。

## パッケージ構成

```
op/                         ← 公開 API 表面(組み込み側はここを import)
op/profile/                 ← FAPI 2.0 / 将来のプロファイル
op/feature/                 ← PAR / DPoP / mTLS / introspect / revoke / DCR / JAR
op/grant/                   ← authorization_code、refresh_token、client_credentials
op/store/                   ← Store interface(サブストアの集合)+ contract test suite
op/storeadapter/{inmem,sql,redis,composite}
op/interaction/             ← ログイン UI 用 HTML / JSON ドライバの差し込み口

internal/                   ← 外部からは import 不可(Go の可視性)
  authn/                    ← LoginFlow オーケストレータ、Authenticator runtime
  authorize、parendpoint、tokenendpoint、userinfo、
  introspectendpoint、revokeendpoint、registrationendpoint、
  endsession、backchannel
  jose、jwks、keys          ← 署名 / 検証 / 鍵セット
  jar、dpop、mtls、pkce、sessions
  cookie、csrf、cors、httpx、redact、log、metrics
  discovery、scoperegistry、timex、i18n
```

境界は構造的に強制されています。外部コードは `internal/` に届きません。組み込み側が制御する差し込み口（オプション、store interface、authenticator、audit subscriber）はすべて `op/` 配下にあります。

## ハンドラグラフ

`op.New` は `*http.ServeMux` を構築し、設定されたパスにハンドラをマウントします(下図はデフォルト):

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<style scoped>
.hg-box{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.hg-op{fill:none;stroke:var(--vp-c-brand-2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.hg-line{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.hg-t1{font-family:var(--vp-font-family-mono);fill:var(--vp-c-brand-2);font-size:13px;font-weight:600}
.hg-t2{font-family:var(--vp-font-family-mono);fill:currentColor;font-size:11px}
.hg-t3{font-family:var(--vp-font-family-mono);fill:var(--vp-c-text-3);font-size:10px}
.hg-path{font-family:var(--vp-font-family-mono);fill:currentColor;font-size:12px}
.hg-pkg{font-family:var(--vp-font-family-mono);fill:var(--vp-c-text-3);font-size:10px}
.hg-drv{font-family:var(--vp-font-family-base);fill:var(--vp-c-text-3);font-size:10px}
</style>

<svg role="img" aria-labelledby="hg-ja-title" viewBox="0 0 656 492" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:660px;height:auto">
<title id="hg-ja-title">op.New が返す http.Handler は、ServeMux が各リクエストパスを対応する内部エンドポイントハンドラへ振り分けます。</title>
<defs><marker id="hg-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>
<rect class="hg-op" x="24" y="217" width="180" height="60" rx="8"/>
<text class="hg-t1" x="114" y="240" text-anchor="middle">op.New</text>
<text class="hg-t2" x="114" y="257" text-anchor="middle">→ http.Handler</text>
<text class="hg-t3" x="114" y="270" text-anchor="middle">ServeMux</text>
<path class="hg-line" d="M204 247 H248"/>
<path class="hg-line" d="M248 37 V457"/>
<path class="hg-line" d="M248 37 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="20" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="35">/.well-known/openid-configuration</text>
<text class="hg-pkg" x="292" y="49">discovery</text>
<path class="hg-line" d="M248 79 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="62" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="77">/jwks</text>
<text class="hg-pkg" x="292" y="91">internal/jwks</text>
<path class="hg-line" d="M248 121 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="104" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="119">/authorize</text>
<text class="hg-pkg" x="292" y="133">internal/authorizeendpoint</text>
<path class="hg-line" d="M248 163 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="146" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="161">/par</text>
<text class="hg-pkg" x="292" y="175">internal/parendpoint</text>
<path class="hg-line" d="M248 205 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="188" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="203">/token</text>
<text class="hg-pkg" x="292" y="217">internal/tokenendpoint</text>
<path class="hg-line" d="M248 247 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="230" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="245">/userinfo</text>
<text class="hg-pkg" x="292" y="259">internal/userinfo</text>
<path class="hg-line" d="M248 289 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="272" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="287">/revoke</text>
<text class="hg-pkg" x="292" y="301">internal/revokeendpoint</text>
<path class="hg-line" d="M248 331 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="314" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="329">/introspect</text>
<text class="hg-pkg" x="292" y="343">internal/introspectendpoint</text>
<path class="hg-line" d="M248 373 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="356" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="371">/end_session</text>
<text class="hg-pkg" x="292" y="385">internal/endsession</text>
<path class="hg-line" d="M248 415 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="398" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="413">/register</text>
<text class="hg-pkg" x="292" y="427">internal/registrationendpoint</text>
<path class="hg-line" d="M248 457 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="440" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="455">/interaction/…</text>
<text class="hg-drv" x="292" y="469">HTML または SPA UI ドライバ</text>
</svg>
</div>

`feature.*`（`PAR`、`Introspect`、`Revoke`、`DynamicRegistration`）で制御されるエンドポイントは、対応する feature が有効になっているか、対応するオプション（`WithDynamicRegistration` など）が渡されたときだけマウントされます。バックチャネルログアウトはマウントされた feature-gated エンドポイントではなく、`/end_session` から発火する送信専用の fan-out です（各 RP に登録された `backchannel_logout_uri` へ logout token を POST します）。discovery 文書も、実際にマウントされたエンドポイントだけを公開します。

## クロスカットなミドルウェア

すべてのハンドラは以下にラップされます:

| Layer | ソース | 役割 |
|---|---|---|
| **CORS** | `internal/cors` | discovery と `/jwks` は public CORS。`/userinfo`、`/token`、interaction / session の JSON 面、マウント済み protocol endpoint（`/par`、`/revoke`、`/introspect`、`/register`、`/bc-authorize`、`/device_authorization`、`/end_session` など）は厳格な許可リスト |
| **信頼プロキシ** | `internal/httpx` | `WithTrustedProxies` を元に、`X-Forwarded-*` / `Forwarded` から実クライアント IP を解決 |
| **Cookie** | `internal/cookie` | `__Host-` プリフィックス、AES-256-GCM、session は `SameSite=Lax`、互換可能なところは `Strict` |
| **CSRF** | `internal/csrf` | consent / logout の POST に対して double-submit + Origin / Referer チェック |

これらはオプションではありません。組み込み側のオプション設定に関係なく構造的に適用されます。

## Authorize → token のライフサイクル

最も流量の多いパスです。概略は次のとおりです。

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<style scoped>
.seq-ll{stroke:currentColor;stroke-width:2}
.seq-llop{stroke:var(--vp-c-brand-2);stroke-width:2}
.seq-llst{stroke:currentColor;stroke-width:2;stroke-dasharray:5 5}
.seq-lllf{stroke:var(--vp-c-text-3);stroke-width:2}
.seq-box{fill:none;stroke:currentColor;stroke-width:2}
.seq-boxop{fill:none;stroke:var(--vp-c-brand-2);stroke-width:2}
.seq-boxst{fill:none;stroke:currentColor;stroke-width:2;stroke-dasharray:5 5}
.seq-boxlf{fill:none;stroke:var(--vp-c-text-3);stroke-width:2}
.seq-msg{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.seq-ret{fill:none;stroke:var(--vp-c-text-3);stroke-width:1.5;stroke-dasharray:5 4;stroke-linecap:round}
.seq-hd{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;fill:currentColor}
.seq-hdop{fill:var(--vp-c-brand-2)}
.seq-hdlf{fill:var(--vp-c-text-3)}
.seq-lbl{font-family:var(--vp-font-family-base);font-size:11.5px;fill:currentColor}
.seq-mono{font-family:var(--vp-font-family-mono)}
.seq-num{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-3)}
</style>

<svg role="img" aria-labelledby="seq-ja-title" viewBox="0 0 870 662" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:850px;height:auto">
<title id="seq-ja-title">authorize から token までの正常系: ブラウザが /authorize と interaction を進め、RP が /token で code を引き換えます。</title>
<defs>
<marker id="seq-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>
<marker id="seq-ahm" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--vp-c-text-3)"/></marker>
</defs>
<line class="seq-ll" x1="70" y1="44" x2="70" y2="645"/>
<line class="seq-ll" x1="250" y1="44" x2="250" y2="645"/>
<line class="seq-llop" x1="440" y1="44" x2="440" y2="645"/>
<line class="seq-llst" x1="630" y1="44" x2="630" y2="645"/>
<line class="seq-lllf" x1="800" y1="44" x2="800" y2="645"/>
<rect class="seq-box" x="20" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd" x="70" y="32" text-anchor="middle">RP</text>
<rect class="seq-box" x="200" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd" x="250" y="32" text-anchor="middle">ユーザエージェント</text>
<rect class="seq-boxop" x="390" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd seq-hdop" x="440" y="32" text-anchor="middle">OP</text>
<rect class="seq-boxst" x="580" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd" x="630" y="32" text-anchor="middle">Store</text>
<rect class="seq-boxlf" x="750" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd seq-hdlf" x="800" y="32" text-anchor="middle">LoginFlow</text>
<line class="seq-msg" x1="70" y1="80" x2="250" y2="80" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="76" y="75">1</text>
<text class="seq-lbl" x="91" y="75">リダイレクト → <tspan class="seq-mono">/authorize?…</tspan></text>
<line class="seq-msg" x1="250" y1="114" x2="440" y2="114" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="109">2</text>
<text class="seq-lbl" x="271" y="109"><tspan class="seq-mono">GET /authorize</tspan></text>
<line class="seq-msg" x1="440" y1="148" x2="630" y2="148" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="143">3</text>
<text class="seq-lbl" x="461" y="143"><tspan class="seq-mono">Clients.GetClient</tspan> / <tspan class="seq-mono">redirect_uri</tspan> 検証</text>
<path class="seq-msg" d="M440 174 h30 v14 h-30" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="480" y="170">4</text>
<text class="seq-lbl" x="492" y="170">PKCE / scope / <tspan class="seq-mono">response_type</tspan> チェック</text>
<line class="seq-msg" x1="440" y1="216" x2="250" y2="216" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="211">5</text>
<text class="seq-lbl" x="271" y="211">302 → <tspan class="seq-mono">/interaction/{uid}</tspan></text>
<line class="seq-msg" x1="250" y1="250" x2="440" y2="250" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="245">6</text>
<text class="seq-lbl" x="271" y="245"><tspan class="seq-mono">POST /interaction/{uid}</tspan> (ログイン)</text>
<line class="seq-msg" x1="440" y1="284" x2="800" y2="284" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="279">7</text>
<text class="seq-lbl" x="461" y="279"><tspan class="seq-mono">Begin / Continue</tspan> (Step chain)</text>
<line class="seq-ret" x1="800" y1="318" x2="440" y2="318" marker-end="url(#seq-ahm)"/>
<text class="seq-num" x="446" y="313">8</text>
<text class="seq-lbl" x="461" y="313"><tspan class="seq-mono">Result</tspan> (subject + AAL + AMR)</text>
<line class="seq-msg" x1="440" y1="352" x2="250" y2="352" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="347">9</text>
<text class="seq-lbl" x="271" y="347">200 同意プロンプト → <tspan class="seq-mono">/interaction/{uid}</tspan></text>
<line class="seq-msg" x1="250" y1="386" x2="440" y2="386" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="381">10</text>
<text class="seq-lbl" x="271" y="381"><tspan class="seq-mono">POST /interaction/{uid}</tspan> (同意)</text>
<line class="seq-msg" x1="440" y1="420" x2="630" y2="420" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="415">11</text>
<text class="seq-lbl" x="461" y="415"><tspan class="seq-mono">AuthorizationCodes.Save</tspan> (code + PKCE)</text>
<line class="seq-msg" x1="440" y1="454" x2="250" y2="454" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="449">12</text>
<text class="seq-lbl" x="271" y="449">302 → <tspan class="seq-mono">redirect_uri?code=…&amp;state=…&amp;iss=…</tspan></text>
<line class="seq-msg" x1="250" y1="488" x2="70" y2="488" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="76" y="483">13</text>
<text class="seq-lbl" x="91" y="483"><tspan class="seq-mono">code</tspan> 付きで到達</text>
<line class="seq-msg" x1="70" y1="522" x2="440" y2="522" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="76" y="517">14</text>
<text class="seq-lbl" x="91" y="517"><tspan class="seq-mono">POST /token</tspan> (<tspan class="seq-mono">grant_type=authorization_code</tspan>)</text>
<line class="seq-msg" x1="440" y1="556" x2="630" y2="556" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="551">15</text>
<text class="seq-lbl" x="461" y="551"><tspan class="seq-mono">AuthorizationCodes.Consume</tspan> / PKCE 検証 / クライアント認証</text>
<line class="seq-msg" x1="440" y1="590" x2="630" y2="590" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="585">16</text>
<text class="seq-lbl" x="461" y="585"><tspan class="seq-mono">AccessTokens.Register / RefreshTokens.Save</tspan></text>
<line class="seq-msg" x1="440" y1="624" x2="70" y2="624" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="76" y="619">17</text>
<text class="seq-lbl" x="91" y="619">200 <tspan class="seq-mono">{ access_token, id_token, refresh_token? }</tspan></text>
</svg>
</div>

`/par` と `/end_session` も大筋は同じ形です。上記が標準的な成功経路です。

## LoginFlow の内部

`WithLoginFlow(LoginFlow{...})` は構築時に内部のパイプラインへコンパイルされます:

```
LoginFlow {Primary, Rules[], Decider, Risk}
    │
    ▼ (compile)
internal/authn/CompiledLoginFlow
    ├── Primary  → Authenticator(Step descriptor → runtime 実装の解決)
    ├── Rules[]  → 順序付き (When, Then) ペア
    ├── Decider  → 任意の short-circuit
    └── Risk     → 評価パスごとに 1 回呼ばれる
```

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<style scoped>
.lfp-box{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lfp-op{fill:none;stroke:var(--vp-c-brand-2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lfp-line{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.lfp-oln{fill:none;stroke:var(--vp-c-brand-2);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.lfp-t1{font-family:var(--vp-font-family-mono);font-size:12px;font-weight:600;fill:currentColor}
.lfp-t1a{font-family:var(--vp-font-family-mono);font-size:12px;font-weight:600;fill:var(--vp-c-brand-2)}
.lfp-fld{font-family:var(--vp-font-family-mono);font-size:11px;fill:var(--vp-c-text-3)}
.lfp-sub{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-3)}
.lfp-lba{font-family:var(--vp-font-family-base);font-size:11px;fill:var(--vp-c-brand-2)}
.lfp-cap{font-family:var(--vp-font-family-base);font-size:11px;fill:var(--vp-c-text-3)}
.lfp-mono{font-family:var(--vp-font-family-mono)}
.lfp-nd{font-family:var(--vp-font-family-base);font-size:11px;fill:currentColor}
</style>

<svg role="img" aria-labelledby="lfp-ja-title" viewBox="0 0 760 410" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;height:auto">
<title id="lfp-ja-title">WithLoginFlow は Primary / Rules / Decider / Risk の指定を CompiledLoginFlow にコンパイルし、オーケストレータがリクエストごとのループで実行します。</title>
<defs>
<marker id="lfp-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>
<marker id="lfp-arra" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--vp-c-brand-2)"/></marker>
</defs>
<rect class="lfp-box" x="24" y="22" width="172" height="132" rx="8"/>
<text class="lfp-t1" x="110" y="44" text-anchor="middle">LoginFlow</text>
<text class="lfp-fld" x="44" y="72">Primary</text>
<text class="lfp-fld" x="44" y="94">Rules[]</text>
<text class="lfp-fld" x="44" y="116">Decider</text>
<text class="lfp-fld" x="44" y="138">Risk</text>
<path class="lfp-line" d="M196 88 H250" marker-end="url(#lfp-arrow)"/>
<text class="lfp-cap" x="223" y="82" text-anchor="middle">コンパイル</text>
<rect class="lfp-op" x="252" y="22" width="206" height="132" rx="8"/>
<text class="lfp-t1a" x="355" y="42" text-anchor="middle">CompiledLoginFlow</text>
<text class="lfp-sub" x="355" y="57" text-anchor="middle">internal/authn</text>
<text class="lfp-fld" x="270" y="82">primary</text>
<text class="lfp-fld" x="270" y="102">rules</text>
<text class="lfp-fld" x="270" y="122">decider</text>
<text class="lfp-fld" x="270" y="142">risk</text>
<path class="lfp-oln" d="M355 154 V196" marker-end="url(#lfp-arra)"/>
<text class="lfp-cap" x="365" y="178" text-anchor="start">authorize リクエストごと</text>
<rect class="lfp-op" x="40" y="210" width="172" height="52" rx="8"/>
<text class="lfp-nd" x="126" y="232" text-anchor="middle"><tspan class="lfp-mono">Primary.Begin /</tspan></text>
<text class="lfp-nd" x="126" y="248" text-anchor="middle"><tspan class="lfp-mono">Continue → Step</tspan></text>
<rect class="lfp-op" x="252" y="210" width="172" height="52" rx="8"/>
<text class="lfp-nd" x="338" y="232" text-anchor="middle">プロンプト → ユーザ送信</text>
<text class="lfp-nd" x="338" y="248" text-anchor="middle">Result が <tspan class="lfp-mono">Identity</tspan> を確定</text>
<rect class="lfp-op" x="452" y="210" width="200" height="52" rx="8"/>
<text class="lfp-nd" x="552" y="232" text-anchor="middle"><tspan class="lfp-mono">LoginContext</tspan> → <tspan class="lfp-mono">Decider</tspan></text>
<text class="lfp-nd" x="552" y="248" text-anchor="middle">その後 <tspan class="lfp-mono">Rules</tspan> 評価</text>
<path class="lfp-oln" d="M212 236 H252" marker-end="url(#lfp-arra)"/>
<path class="lfp-oln" d="M424 236 H452" marker-end="url(#lfp-arra)"/>
<path class="lfp-oln" d="M500 262 C 500 336, 126 336, 126 262" marker-end="url(#lfp-arra)"/>
<text class="lfp-lba" x="313" y="332" text-anchor="middle">ルールが尽きるまで繰り返し</text>
<path class="lfp-oln" d="M652 236 H704 V346" marker-end="url(#lfp-arra)"/>
<text class="lfp-cap" x="698" y="300" text-anchor="end">発火なし</text>
<rect class="lfp-op" x="636" y="346" width="118" height="40" rx="8"/>
<text class="lfp-nd" x="695" y="370" text-anchor="middle">セッション発行</text>
</svg>
</div>

各 authorize リクエストでは:

1. `Primary.Begin` が `interaction.Step`（Prompt または Result）を返します。
2. UI ドライバ（HTML または SPA）がプロンプトを描画し、ユーザが送信します。
3. `Primary.Continue` が `Result`（`Identity` がバインドされている）まで進めます。
4. オーケストレータが `LoginContext` を組み立てます（subject、scope、完了したステップ、リスクスコア、ACR values）。
5. `Decider` が動きます（nil 以外の場合）。`Pass` 以外の判定はそこで短絡します。
6. それ以外は `Rules` を順に評価します。最初にマッチしたルールの `Step.Kind()` が `CompletedSteps` にまだ含まれていなければ発火します。
7. 発火するルールが無くなるまで繰り返し、その後にセッションを発行します。

`ExternalStep` 経由で自前の factor を差し込む手順は、[ユースケース: カスタム authenticator](/ja/use-cases/custom-authenticator) を参照してください。

## ストレージの差し込み口

ライブラリは、組み込み側の `users` テーブルを直接読み書きしません。`op.Store` interface(小さなサブストアの和集合)越しに会話します:

| サブストア | 何が入るか | 配置の目安 |
|---|---|---|
| `Clients` | OAuth クライアントレジストリ | 通常は永続 |
| `Users` | subject + claim | 組み込み側の実装。既存の users テーブルにマッピングすることが多い |
| `AuthorizationCodes` | one-shot な code(PKCE challenge、scope) | 永続 |
| `RefreshTokens` | refresh chain、ローテーション履歴 | 永続 |
| `AccessTokens` | JWT id 側 / opaque token | 永続 |
| `OpaqueAccessTokens` | opaque AT lookup | 永続 |
| `Grants` | (user, client) ごとの consent scope | 永続 |
| `GrantRevocations` | 失効した grant の tombstone | 永続 |
| `Sessions` | ブラウザセッションのレコード | 揮発に置いてもよい |
| `Interactions` | 試行ごとの interaction 状態 | 揮発に置いてもよい |
| `ConsumedJTIs` | JAR / DPoP `jti` のリプレイ検出集合 | 揮発に置いてもよい |
| `PARs` | pushed authorization request | 揮発に置いてもよい |
| `IATs` / `RATs` | DCR の Initial / Registration Access Token | 永続 |
| `DeviceCodes` | RFC 8628 のデバイス認可レコード | 永続 |
| `CIBARequests` | OpenID Connect CIBA の backchannel authentication レコード | 永続 |
| `Metadata` | OP 内部の key/value 状態(例: `subject_mode` マーカー) | 永続(未対応バックエンドは nil 可) |

「揮発に置いてもよい」サブストアは [`composite`](/ja/use-cases/hot-cold-redis) アダプタ越しに Redis 層へ配置できます。composite は構築時に「永続バックエンドは 1 つ」を強制するので、トランザクショナルクラスタが 2 つのストアにまたがって分裂することはありません。

MFA factor のストア(`EmailOTPStore`、`TOTPStore`、`PasskeyStore`、`RecoveryStore`)は `op.Store` のサブストアではありません。`LoginFlow` を組み立てる際に、対応する authenticator の `Step`(`StepEmailOTP.Store`、`StepTOTP.Store`、`StepPasskey.Store`、`StepRecovery.Store`)へ直接渡します。

詳細は [hot/cold ストレージ](/ja/use-cases/hot-cold-redis) を参照してください。

## Discovery 文書の組み立て

`/.well-known/openid-configuration` は OP の実効設定から discovery 文書を組み立てます。広告されるフィールドはそのまま OP の実挙動を表します。discovery と挙動の間に乖離はありません。理由は以下のとおりです。

- **`response_types_supported`** は `WithGrants` + FAPI プロファイルから計算されます。
- **`token_endpoint_auth_methods_supported`** は、`WithProfile(profile.FAPI2Baseline)` または `FAPI2MessageSigning` が有効なときに FAPI の許可リストと交差します。
- **`scopes_supported`** は組み込みの scope と `WithScope` で登録された scope の和集合です。
- **`ui_locales_supported`** は runtime locale resolver（seed bundle + `WithLocale` 追加分）から自動導出されます。`WithDiscoveryMetadata(...).UILocalesSupported` に非空の明示リストを渡した場合だけ、それが優先されます。
- **`code_challenge_methods_supported`** は常に `["S256"]` です。`plain` は構造的に存在しません。
- **`request_object_signing_alg_values_supported`** は JOSE の許可リスト(`RS256`、`PS256`、`ES256`、`EdDSA`)です。
- **`dpop_signing_alg_values_supported`** はそれより狭い集合 (`ES256`、`EdDSA`、`PS256`)です。理由は [FAQ § DPoP discovery](/ja/faq#dpop-sender-constraint) を参照。

## 次に読む

- **[Options 索引](/ja/reference/options)** — すべての `op.With*` を 1 ページに。上のハンドラグラフへのクロスリンク付き。
- **[Audit イベントカタログ](/ja/reference/audit-events)** — 各ハンドラ、各段階で何が発火するか。
- **[カスタム authenticator](/ja/use-cases/custom-authenticator)** — オーケストレータのパイプラインがどこで自前コードを呼ぶか。
- **[hot / cold ストレージ](/ja/use-cases/hot-cold-redis)** — サブストアの tier 分けと、揮発 / 永続の境界の関係。
