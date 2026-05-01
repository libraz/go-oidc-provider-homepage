<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'

const { lang } = useData()
const isJa = computed(() => lang.value === 'ja')

type Part = { text: string; mono?: boolean }

const copy = computed(() =>
  isJa.value
    ? {
        wordmark: 'go-oidc-provider',
        claimParts: [
          { text: 'Go の ' },
          { text: 'http.Handler', mono: true },
          { text: ' に組み込める OpenID Connect Provider。' }
        ] as Part[],
        sub: 'net/http、chi、gin、お好みのルーターで動作。PAR · JAR · DPoP · mTLS · PKCE 内蔵。FAPI 2.0 Baseline / Message Signing をターゲット。',
        primary: { text: 'クイックスタート', link: '/ja/getting-started/install' },
        secondaryGh: { text: 'GitHub で見る', link: 'https://github.com/libraz/go-oidc-provider' },
        secondaryWhy: { text: 'go-oidc-provider とは', link: '/ja/why' },
        trust: ['FAPI 2.0 BASELINE', 'OFCS 138 / 0', 'APACHE-2.0', 'GO ≥ 1.21'],
        codeLabel: 'main.go',
        codeLang: 'GO'
      }
    : {
        wordmark: 'go-oidc-provider',
        claimParts: [
          { text: 'OpenID Connect Provider you mount on any Go ' },
          { text: 'http.Handler', mono: true },
          { text: '.' }
        ] as Part[],
        sub: 'Works with net/http, chi, gin, or any router. PAR · JAR · DPoP · mTLS · PKCE built in. Targets FAPI 2.0 Baseline & Message Signing.',
        primary: { text: 'Quick Start', link: '/getting-started/install' },
        secondaryGh: { text: 'View on GitHub', link: 'https://github.com/libraz/go-oidc-provider' },
        secondaryWhy: { text: 'Why this library', link: '/why' },
        trust: ['FAPI 2.0 BASELINE', 'OFCS 138 / 0', 'APACHE-2.0', 'GO ≥ 1.21'],
        codeLabel: 'main.go',
        codeLang: 'GO'
      }
)
</script>

<template>
  <section class="op-hero">
    <div class="op-hero-inner">
      <div class="op-hero-info">
        <h1 class="op-hero-wordmark">{{ copy.wordmark }}</h1>
        <p class="op-hero-claim">
          <template v-for="(p, j) in copy.claimParts" :key="j"
            ><code v-if="p.mono">{{ p.text }}</code
            ><template v-else>{{ p.text }}</template></template
          >
        </p>
        <p class="op-hero-sub">{{ copy.sub }}</p>
        <div class="op-hero-actions">
          <a :href="copy.primary.link" class="op-cta op-cta-primary">{{ copy.primary.text }}</a>
          <a
            :href="copy.secondaryGh.link"
            class="op-cta op-cta-link"
            rel="noopener"
            target="_blank"
            >{{ copy.secondaryGh.text }}</a
          >
          <a :href="copy.secondaryWhy.link" class="op-cta op-cta-link">{{
            copy.secondaryWhy.text
          }}</a>
        </div>
        <p class="op-hero-trust">{{ copy.trust.join('  ·  ') }}</p>
      </div>
      <aside class="op-hero-code" aria-label="Example: mount as http.Handler">
        <header class="op-hero-code-bar">
          <span class="op-hero-code-label">{{ copy.codeLabel }}</span>
          <span class="op-hero-code-lang">{{ copy.codeLang }}</span>
        </header>
        <pre
          class="op-hero-code-body"
        ><code><span class="tk-c">// Mount an OIDC Provider on any http.Handler.</span>
handler, err := op.<span class="tk-fn">New</span>(
    op.<span class="tk-fn">WithIssuer</span>(<span class="tk-s">"https://op.example.com"</span>),
    op.<span class="tk-fn">WithStore</span>(inmem.<span class="tk-fn">New</span>()),
    op.<span class="tk-fn">WithKeyset</span>(keys),
    op.<span class="tk-fn">WithCookieKey</span>(cookieKey),
    op.<span class="tk-fn">WithProfile</span>(profile.FAPI2Baseline),
)
http.<span class="tk-fn">ListenAndServe</span>(<span class="tk-s">":8080"</span>, handler)</code></pre>
      </aside>
    </div>
  </section>
</template>
