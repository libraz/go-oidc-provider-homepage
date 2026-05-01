<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import HomeHero from './components/HomeHero.vue'
import HomeSpec from './components/HomeSpec.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <a
        href="https://github.com/libraz/go-oidc-provider/blob/main/LICENSE"
        target="_blank"
        rel="noopener"
        class="op-nav-license"
        >Apache-2.0</a
      >
    </template>
    <template #home-hero-before>
      <HomeHero />
    </template>
    <template #home-features-before>
      <HomeSpec />
    </template>
  </Layout>
</template>
