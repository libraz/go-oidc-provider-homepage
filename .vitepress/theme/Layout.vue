<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import FigureDefs from './components/FigureDefs.vue'
import HomeHero from './components/HomeHero.vue'
import HomeSpec from './components/HomeSpec.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-top>
      <FigureDefs />
    </template>
    <template #home-hero-before>
      <HomeHero />
    </template>
    <template #home-features-before>
      <HomeSpec />
    </template>
  </Layout>
</template>
