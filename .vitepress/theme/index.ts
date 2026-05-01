import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import SvgEmail from './components/SvgEmail.vue'
import Layout from './Layout.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('SvgEmail', SvgEmail)
  }
} satisfies Theme
