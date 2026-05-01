import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import SvgEmail from './components/SvgEmail.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SvgEmail', SvgEmail)
  }
} satisfies Theme
