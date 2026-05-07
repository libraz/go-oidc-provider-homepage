<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import HomeHero from './components/HomeHero.vue'
import HomeSpec from './components/HomeSpec.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #home-hero-before>
      <HomeHero />
    </template>
    <template #home-features-before>
      <HomeSpec />
    </template>
  </Layout>
</template>
