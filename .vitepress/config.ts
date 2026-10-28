import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import { generateLlmsTxt, type LlmsLocale, llmsDevPlugin } from './llms'

const siteUrl = 'https://go-oidc-provider.libraz.net'
const githubUrl = 'https://github.com/libraz/go-oidc-provider'
const docsVersion = '1.4.0'
const docsVersionTag = `v${docsVersion}`
const changelogUrl = `${githubUrl}/blob/main/CHANGELOG.md`
const releaseNotesUrl = `${changelogUrl}#v140--2026-10-23`

/** Per-locale structured data and social-card copy. */
type Locale = 'en' | 'ja'

const softwareApplicationJsonLd = (lang: Locale) => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'go-oidc-provider',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Linux, macOS, Windows',
  inLanguage: lang,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  description:
    lang === 'ja'
      ? 'Go 向けの OpenID Connect Provider（認可サーバ）ライブラリ。http.Handler として組み込め、FAPI 用のプロファイル設定を備えています。'
      : 'OpenID Connect Provider (Authorization Server) library for Go. Mounts as an http.Handler and includes FAPI profile options.',
  url: lang === 'ja' ? `${siteUrl}/ja/` : siteUrl,
  downloadUrl: githubUrl,
  softwareVersion: docsVersion,
  author: { '@type': 'Person', name: 'libraz' },
  license: 'https://opensource.org/licenses/Apache-2.0',
  keywords:
    lang === 'ja'
      ? 'OpenID Connect, OIDC, OAuth 2.0, FAPI 2.0, PAR, JAR, JARM, DPoP, mTLS, PKCE, Go, 認可サーバ'
      : 'OpenID Connect, OIDC, OAuth 2.0, FAPI 2.0, PAR, JAR, JARM, DPoP, mTLS, PKCE, Go, Authorization Server'
})

const SEO: Record<Locale, { title: string; description: string; keywords: string }> = {
  en: {
    title: 'go-oidc-provider — OpenID Connect Provider library for Go',
    description:
      'OIDC Provider library that mounts as a Go http.Handler, with PAR, JAR, DPoP, and FAPI profile options.',
    keywords:
      'OpenID Connect, OIDC, OAuth2, FAPI 2.0, PAR, JAR, JARM, DPoP, mTLS, PKCE, refresh token rotation, Go, Authorization Server, http.Handler'
  },
  ja: {
    title: 'go-oidc-provider — Go 向け OpenID Connect Provider ライブラリ',
    description:
      'Go の http.Handler として組み込める OIDC Provider ライブラリ。PAR、JAR、DPoP と FAPI 用のプロファイル設定を備えています。',
    keywords:
      'OpenID Connect, OIDC, OAuth2, FAPI 2.0, PAR, JAR, JARM, DPoP, mTLS, PKCE, リフレッシュトークン ローテーション, Go, 認可サーバ, http.Handler'
  }
}

/** `ja/why.md` -> `/ja/why`, `index.md` -> `/` */
function routeOf(relativePath: string): string {
  const clean = relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
  return `/${clean}`.replace(/\/{2,}/g, '/')
}

const localeOf = (relativePath: string): Locale => (relativePath.startsWith('ja/') ? 'ja' : 'en')

/** The same page in the other language. */
function alternateRoute(relativePath: string): string {
  return relativePath.startsWith('ja/')
    ? routeOf(relativePath.slice(3))
    : routeOf(`ja/${relativePath}`)
}

/** Prose for the per-locale llms.txt indexes; the page lists come from the nav/sidebar. */
const LLMS_LOCALES: LlmsLocale[] = [
  {
    key: 'root',
    prefix: '',
    title: 'go-oidc-provider',
    summary:
      'OpenID Connect Provider (Authorization Server) for Go that embeds as an http.Handler. Includes PAR, JAR, DPoP, mTLS, and FAPI profile options.',
    intro:
      'go-oidc-provider is a library, not a deployable product: it mounts into an existing Go\nservice and leaves storage, user authentication, and consent to the host application.\nThe documentation covers OAuth 2.0 / OIDC concepts from the ground up alongside the API\nreference, so it doubles as a primer. The links below point to the canonical HTML pages.',
    overviewHeading: 'Key pages',
    homeText: 'go-oidc-provider home',
    alternate: {
      heading: 'Japanese (日本語)',
      items: [
        {
          text: '日本語版インデックス',
          link: '/ja/llms.txt',
          description: 'The same index in Japanese, covering the /ja/ documentation.'
        }
      ]
    }
  },
  {
    key: 'ja',
    prefix: '/ja',
    title: 'go-oidc-provider',
    summary:
      'Go の http.Handler に組み込める OpenID Connect Provider（認可サーバ）ライブラリです。PAR・JAR・DPoP・mTLS と FAPI 用のプロファイル設定を備えています。',
    intro:
      'go-oidc-provider は単体で動く製品ではなく、既存の Go サービスに組み込むライブラリです。\nストレージ・ユーザ認証・同意画面はホスト側のアプリケーションが担います。ドキュメントは\nAPI リファレンスに加えて OAuth 2.0 / OIDC の概念を基礎から扱うため、入門にも使えます。\n以下は日本語ドキュメントへのリンク一覧です。',
    overviewHeading: '主要ページ',
    homeText: 'go-oidc-provider トップ',
    alternate: {
      heading: 'English',
      items: [
        {
          text: 'English index',
          link: '/llms.txt',
          description: '英語ドキュメントを対象とした同じ構成のインデックス。'
        }
      ]
    }
  }
]

export default defineConfig({
  srcDir: 'src',
  appearance: true,
  title: 'go-oidc-provider',
  description:
    'OpenID Connect Provider (Authorization Server) for Go. Embeds as an http.Handler and includes PAR, JAR, DPoP, mTLS, and FAPI profile options.',
  cleanUrls: true,

  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
    html: true
  },

  sitemap: { hostname: siteUrl },

  buildEnd(siteConfig) {
    generateLlmsTxt({
      siteUrl,
      srcDir: siteConfig.srcDir,
      outDir: siteConfig.outDir,
      cleanUrls: siteConfig.cleanUrls,
      site: siteConfig.site,
      locales: LLMS_LOCALES
    })
  },

  vite: {
    plugins: [llmsDevPlugin({ siteUrl, locales: LLMS_LOCALES })],
    resolve: {
      alias: {
        'vscode-jsonrpc/lib/common/cancellation.js': fileURLToPath(
          new URL('./shims/vscode-jsonrpc-cancellation.ts', import.meta.url)
        )
      }
    },
    build: {
      chunkSizeWarningLimit: 3000
    }
  },

  // Locale-independent only. Everything that differs per page or per language
  // (canonical, OGP, keywords, JSON-LD) is emitted from transformHead below.
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        // IBM Plex Sans carries the nav bar and the landing page; Inter is
        // the docs reading face and Outfit the heading face; IBM Plex Sans JP
        // is appended to every Latin-first stack so Japanese glyphs route to
        // one deliberate face instead of an OS default.
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+JP:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@600;700&display=swap'
      }
    ],
    ['meta', { property: 'og:site_name', content: 'go-oidc-provider' }],
    ['meta', { property: 'og:type', content: 'website' }]
  ],

  transformHead({ pageData, description }) {
    const lang = localeOf(pageData.relativePath)
    const seo = SEO[lang]
    const url = `${siteUrl}${routeOf(pageData.relativePath)}`
    const altLang: Locale = lang === 'ja' ? 'en' : 'ja'
    const altUrl = `${siteUrl}${alternateRoute(pageData.relativePath)}`
    const title = pageData.frontmatter.title || seo.title
    const desc = description || seo.description

    return [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { name: 'keywords', content: seo.keywords }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: desc }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:locale', content: lang }],
      ['meta', { property: 'og:locale:alternate', content: altLang }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: desc }],
      ['link', { rel: 'alternate', hreflang: lang, href: url }],
      ['link', { rel: 'alternate', hreflang: altLang, href: altUrl }],
      [
        'link',
        {
          rel: 'alternate',
          hreflang: 'x-default',
          href: `${siteUrl}${routeOf(pageData.relativePath.replace(/^ja\//, ''))}`
        }
      ],
      ['script', { type: 'application/ld+json' }, JSON.stringify(softwareApplicationJsonLd(lang))]
    ]
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        search: {
          provider: 'local',
          options: {
            locales: {
              root: {
                translations: {
                  button: { buttonText: 'Search', buttonAriaLabel: 'Search docs' },
                  modal: {
                    noResultsText: 'No results for',
                    resetButtonTitle: 'Reset search',
                    footer: {
                      selectText: 'to select',
                      navigateText: 'to navigate',
                      closeText: 'to close'
                    }
                  }
                }
              }
            }
          }
        },
        nav: [
          { text: 'Why', link: '/why' },
          {
            text: 'Quick Start',
            items: [
              { text: 'Install', link: '/getting-started/install' },
              { text: 'Minimal OP', link: '/getting-started/minimal' },
              { text: 'Required options', link: '/getting-started/required-options' },
              { text: 'Mount on your router', link: '/getting-started/mount' }
            ]
          },
          {
            text: 'Learn',
            items: [
              {
                text: 'Overview',
                items: [{ text: 'Reading order', link: '/concepts/' }]
              },
              {
                text: 'Setup primitives',
                items: [
                  { text: 'OAuth 2.0 / OIDC primer', link: '/concepts/oauth2-oidc-primer' },
                  { text: 'Issuer', link: '/concepts/issuer' },
                  { text: 'Redirect URI', link: '/concepts/redirect-uri' },
                  { text: 'Client types', link: '/concepts/client-types' },
                  { text: 'Scopes and claims', link: '/concepts/scopes-and-claims' },
                  { text: 'Discovery', link: '/concepts/discovery' },
                  { text: 'JOSE basics', link: '/concepts/jose-basics' }
                ]
              },
              {
                text: 'Common flows',
                items: [
                  {
                    text: 'Authorization Code + PKCE',
                    link: '/concepts/authorization-code-pkce'
                  },
                  { text: 'Refresh tokens', link: '/concepts/refresh-tokens' },
                  { text: 'Client Credentials', link: '/concepts/client-credentials' }
                ]
              },
              {
                text: 'Tokens',
                items: [
                  { text: 'ID Token vs access token', link: '/concepts/tokens' },
                  {
                    text: 'Access token format (JWT vs opaque)',
                    link: '/concepts/access-token-format'
                  }
                ]
              },
              {
                text: 'Sessions and consent',
                items: [
                  { text: 'Sessions and logout', link: '/concepts/sessions-and-logout' },
                  { text: 'Consent', link: '/concepts/consent' }
                ]
              },
              {
                text: 'Sender-constrained tokens',
                items: [
                  {
                    text: 'Sender constraint (DPoP / mTLS)',
                    link: '/concepts/sender-constraint'
                  },
                  { text: 'DPoP', link: '/concepts/dpop' },
                  { text: 'mTLS', link: '/concepts/mtls' }
                ]
              },
              {
                text: 'Advanced topics',
                items: [
                  { text: 'Device Code (RFC 8628)', link: '/concepts/device-code' },
                  { text: 'CIBA', link: '/concepts/ciba' },
                  {
                    text: 'No-browser flows (CIBA vs Device Code)',
                    link: '/concepts/no-browser-flows'
                  },
                  { text: 'Token Exchange (RFC 8693)', link: '/concepts/token-exchange' },
                  { text: 'JARM (signed authorization response)', link: '/concepts/jarm' },
                  { text: 'FAPI 2.0 primer', link: '/concepts/fapi' }
                ]
              },
              {
                text: 'Help',
                items: [{ text: 'FAQ', link: '/faq' }]
              }
            ]
          },
          {
            text: 'Use Cases',
            items: [
              { text: 'All use cases', link: '/use-cases/' },
              {
                text: 'Bootstrap',
                items: [
                  { text: 'Minimal OP', link: '/use-cases/minimal-op' },
                  { text: 'Comprehensive bundle', link: '/use-cases/bundle' }
                ]
              },
              {
                text: 'Profile & flow',
                items: [
                  { text: 'Declaring a security profile', link: '/use-cases/security-profile' },
                  { text: 'FAPI 2.0 Baseline', link: '/use-cases/fapi2-baseline' },
                  {
                    text: 'Service-to-service (client_credentials)',
                    link: '/use-cases/client-credentials'
                  },
                  { text: 'OAuth 2.0 (no openid)', link: '/use-cases/oauth2-only' },
                  { text: 'DPoP nonce flow', link: '/use-cases/dpop-nonce' },
                  {
                    text: 'Protected resource metadata (RFC 9728)',
                    link: '/use-cases/protected-resource-metadata'
                  }
                ]
              },
              {
                text: 'Grants',
                items: [
                  { text: 'Device Code (RFC 8628)', link: '/use-cases/device-code' },
                  { text: 'CIBA poll mode', link: '/use-cases/ciba' },
                  { text: 'Token Exchange (RFC 8693)', link: '/use-cases/token-exchange' },
                  { text: 'Custom Grant', link: '/use-cases/custom-grant' }
                ]
              },
              {
                text: 'Crypto & subjects',
                items: [
                  { text: 'Pairwise subject', link: '/use-cases/pairwise-subject' },
                  { text: 'JWE encryption', link: '/use-cases/jwe-encryption' }
                ]
              },
              {
                text: 'UI',
                items: [
                  {
                    text: 'SPA (custom interaction)',
                    link: '/use-cases/spa-custom-interaction'
                  },
                  { text: 'Custom consent UI', link: '/use-cases/custom-consent-ui' },
                  { text: 'Custom chooser UI', link: '/use-cases/custom-chooser-ui' },
                  { text: 'Multi-account chooser', link: '/use-cases/multi-account' },
                  { text: 'CORS for SPA', link: '/use-cases/cors-spa' },
                  { text: 'i18n / locale', link: '/use-cases/i18n' }
                ]
              },
              {
                text: 'Storage',
                items: [
                  { text: 'Choosing a storage layout', link: '/use-cases/storage-decision' },
                  { text: 'Persistent storage (SQL)', link: '/use-cases/sql-store' },
                  { text: 'DynamoDB storage', link: '/use-cases/dynamodb-store' },
                  {
                    text: 'Hot/cold split (Redis volatile)',
                    link: '/use-cases/hot-cold-redis'
                  },
                  { text: 'Bring your own store backend', link: '/use-cases/byo-store' }
                ]
              },
              {
                text: 'Scopes & claims',
                items: [
                  { text: 'Public / internal scopes', link: '/use-cases/scopes' },
                  { text: 'Claims request', link: '/use-cases/claims-request' },
                  {
                    text: 'Rich authorization requests (RFC 9396)',
                    link: '/use-cases/authorization-details'
                  },
                  { text: 'Grant management', link: '/use-cases/grant-management' }
                ]
              },
              {
                text: 'Authentication',
                items: [
                  { text: 'MFA / step-up', link: '/use-cases/mfa-step-up' },
                  { text: 'Bring your own user store', link: '/use-cases/byo-userstore' },
                  { text: 'Custom authenticator', link: '/use-cases/custom-authenticator' }
                ]
              },
              {
                text: 'Governance',
                items: [
                  { text: 'First-party consent skip', link: '/use-cases/first-party' },
                  {
                    text: 'Client onboarding patterns',
                    link: '/use-cases/client-onboarding'
                  },
                  {
                    text: 'Dynamic Client Registration',
                    link: '/use-cases/dynamic-registration'
                  },
                  { text: 'Back-Channel Logout', link: '/use-cases/back-channel-logout' }
                ]
              },
              {
                text: 'Operations',
                items: [{ text: 'Prometheus metrics', link: '/use-cases/prometheus' }]
              }
            ]
          },
          {
            text: 'Operations',
            items: [
              { text: 'Overview', link: '/operations/' },
              { text: 'Key rotation', link: '/operations/key-rotation' },
              { text: 'JWKS endpoint', link: '/operations/jwks' },
              { text: 'Multi-instance', link: '/operations/multi-instance' },
              { text: 'Observability', link: '/operations/observability' },
              { text: 'Backup & DR', link: '/operations/backup' },
              { text: 'Storage maintenance', link: '/operations/storage-maintenance' }
            ]
          },
          {
            text: 'Standards & Security',
            items: [
              {
                text: 'Standards',
                items: [
                  { text: 'RFC matrix', link: '/compliance/rfc-matrix' },
                  { text: 'OFCS conformance', link: '/compliance/ofcs' },
                  { text: 'OFCS reproduce', link: '/compliance/ofcs-reproduce' }
                ]
              },
              {
                text: 'Security',
                items: [
                  { text: 'Posture', link: '/security/posture' },
                  { text: 'Design judgments', link: '/security/design-judgments' },
                  { text: 'CVE regression matrix', link: '/security/cve-matrix' },
                  { text: 'Clock and replay windows', link: '/security/clock-and-replay' },
                  { text: 'Disclosure', link: '/security/disclosure' }
                ]
              }
            ]
          },
          {
            text: 'Reference',
            items: [
              { text: 'Options', link: '/reference/options' },
              { text: 'Errors', link: '/reference/errors' },
              { text: 'Audit events', link: '/reference/audit-events' },
              { text: 'Architecture', link: '/reference/architecture' }
            ]
          },
          {
            text: docsVersionTag,
            items: [
              {
                text: 'Release Notes',
                link: releaseNotesUrl
              },
              { text: 'Changelog', link: changelogUrl }
            ]
          }
        ],
        sidebar: {
          '/concepts/': [
            {
              text: 'Overview',
              items: [{ text: 'Reading order', link: '/concepts/' }]
            },
            {
              text: 'Setup primitives',
              items: [
                { text: 'OAuth 2.0 / OIDC primer', link: '/concepts/oauth2-oidc-primer' },
                { text: 'Issuer', link: '/concepts/issuer' },
                { text: 'Redirect URI', link: '/concepts/redirect-uri' },
                { text: 'Client types', link: '/concepts/client-types' },
                { text: 'Scopes and claims', link: '/concepts/scopes-and-claims' },
                { text: 'Discovery', link: '/concepts/discovery' },
                { text: 'JOSE basics', link: '/concepts/jose-basics' }
              ]
            },
            {
              text: 'Common flows',
              items: [
                { text: 'Authorization Code + PKCE', link: '/concepts/authorization-code-pkce' },
                { text: 'Refresh tokens', link: '/concepts/refresh-tokens' },
                { text: 'Client Credentials', link: '/concepts/client-credentials' }
              ]
            },
            {
              text: 'Tokens',
              items: [
                { text: 'ID Token vs access token', link: '/concepts/tokens' },
                {
                  text: 'Access token format (JWT vs opaque)',
                  link: '/concepts/access-token-format'
                }
              ]
            },
            {
              text: 'Sessions and consent',
              items: [
                { text: 'Sessions and logout', link: '/concepts/sessions-and-logout' },
                { text: 'Consent', link: '/concepts/consent' }
              ]
            },
            {
              text: 'Sender-constrained tokens',
              items: [
                { text: 'Sender constraint (DPoP / mTLS)', link: '/concepts/sender-constraint' },
                { text: 'DPoP', link: '/concepts/dpop' },
                { text: 'mTLS', link: '/concepts/mtls' }
              ]
            },
            {
              text: 'Advanced topics',
              items: [
                { text: 'Device Code (RFC 8628)', link: '/concepts/device-code' },
                { text: 'CIBA', link: '/concepts/ciba' },
                {
                  text: 'No-browser flows (CIBA vs Device Code)',
                  link: '/concepts/no-browser-flows'
                },
                { text: 'Token Exchange (RFC 8693)', link: '/concepts/token-exchange' },
                { text: 'JARM (signed authorization response)', link: '/concepts/jarm' },
                { text: 'FAPI 2.0 primer', link: '/concepts/fapi' }
              ]
            },
            {
              text: 'Help',
              items: [{ text: 'FAQ', link: '/faq' }]
            }
          ],
          '/faq': [
            {
              text: 'Overview',
              items: [{ text: 'Reading order', link: '/concepts/' }]
            },
            {
              text: 'Setup primitives',
              items: [
                { text: 'OAuth 2.0 / OIDC primer', link: '/concepts/oauth2-oidc-primer' },
                { text: 'Issuer', link: '/concepts/issuer' },
                { text: 'Redirect URI', link: '/concepts/redirect-uri' },
                { text: 'Client types', link: '/concepts/client-types' },
                { text: 'Scopes and claims', link: '/concepts/scopes-and-claims' },
                { text: 'Discovery', link: '/concepts/discovery' },
                { text: 'JOSE basics', link: '/concepts/jose-basics' }
              ]
            },
            {
              text: 'Common flows',
              items: [
                { text: 'Authorization Code + PKCE', link: '/concepts/authorization-code-pkce' },
                { text: 'Refresh tokens', link: '/concepts/refresh-tokens' },
                { text: 'Client Credentials', link: '/concepts/client-credentials' }
              ]
            },
            {
              text: 'Tokens',
              items: [
                { text: 'ID Token vs access token', link: '/concepts/tokens' },
                {
                  text: 'Access token format (JWT vs opaque)',
                  link: '/concepts/access-token-format'
                }
              ]
            },
            {
              text: 'Sessions and consent',
              items: [
                { text: 'Sessions and logout', link: '/concepts/sessions-and-logout' },
                { text: 'Consent', link: '/concepts/consent' }
              ]
            },
            {
              text: 'Sender-constrained tokens',
              items: [
                { text: 'Sender constraint (DPoP / mTLS)', link: '/concepts/sender-constraint' },
                { text: 'DPoP', link: '/concepts/dpop' },
                { text: 'mTLS', link: '/concepts/mtls' }
              ]
            },
            {
              text: 'Advanced topics',
              items: [
                { text: 'Device Code (RFC 8628)', link: '/concepts/device-code' },
                { text: 'CIBA', link: '/concepts/ciba' },
                {
                  text: 'No-browser flows (CIBA vs Device Code)',
                  link: '/concepts/no-browser-flows'
                },
                { text: 'Token Exchange (RFC 8693)', link: '/concepts/token-exchange' },
                { text: 'JARM (signed authorization response)', link: '/concepts/jarm' },
                { text: 'FAPI 2.0 primer', link: '/concepts/fapi' }
              ]
            },
            {
              text: 'Help',
              items: [{ text: 'FAQ', link: '/faq' }]
            }
          ],
          '/why': [
            {
              text: 'Overview',
              items: [{ text: 'Reading order', link: '/concepts/' }]
            },
            {
              text: 'Setup primitives',
              items: [
                { text: 'OAuth 2.0 / OIDC primer', link: '/concepts/oauth2-oidc-primer' },
                { text: 'Issuer', link: '/concepts/issuer' },
                { text: 'Redirect URI', link: '/concepts/redirect-uri' },
                { text: 'Client types', link: '/concepts/client-types' },
                { text: 'Scopes and claims', link: '/concepts/scopes-and-claims' },
                { text: 'Discovery', link: '/concepts/discovery' },
                { text: 'JOSE basics', link: '/concepts/jose-basics' }
              ]
            },
            {
              text: 'Common flows',
              items: [
                { text: 'Authorization Code + PKCE', link: '/concepts/authorization-code-pkce' },
                { text: 'Refresh tokens', link: '/concepts/refresh-tokens' },
                { text: 'Client Credentials', link: '/concepts/client-credentials' }
              ]
            },
            {
              text: 'Tokens',
              items: [
                { text: 'ID Token vs access token', link: '/concepts/tokens' },
                {
                  text: 'Access token format (JWT vs opaque)',
                  link: '/concepts/access-token-format'
                }
              ]
            },
            {
              text: 'Sessions and consent',
              items: [
                { text: 'Sessions and logout', link: '/concepts/sessions-and-logout' },
                { text: 'Consent', link: '/concepts/consent' }
              ]
            },
            {
              text: 'Sender-constrained tokens',
              items: [
                { text: 'Sender constraint (DPoP / mTLS)', link: '/concepts/sender-constraint' },
                { text: 'DPoP', link: '/concepts/dpop' },
                { text: 'mTLS', link: '/concepts/mtls' }
              ]
            },
            {
              text: 'Advanced topics',
              items: [
                { text: 'Device Code (RFC 8628)', link: '/concepts/device-code' },
                { text: 'CIBA', link: '/concepts/ciba' },
                {
                  text: 'No-browser flows (CIBA vs Device Code)',
                  link: '/concepts/no-browser-flows'
                },
                { text: 'Token Exchange (RFC 8693)', link: '/concepts/token-exchange' },
                { text: 'JARM (signed authorization response)', link: '/concepts/jarm' },
                { text: 'FAPI 2.0 primer', link: '/concepts/fapi' }
              ]
            },
            {
              text: 'Help',
              items: [{ text: 'FAQ', link: '/faq' }]
            }
          ],
          '/getting-started/': [
            {
              text: 'Getting started',
              items: [
                { text: 'Install', link: '/getting-started/install' },
                { text: 'Minimal OP', link: '/getting-started/minimal' },
                { text: 'Required options', link: '/getting-started/required-options' },
                { text: 'Mount on your router', link: '/getting-started/mount' }
              ]
            }
          ],
          '/use-cases/': [
            {
              text: 'Use cases',
              items: [{ text: 'Index', link: '/use-cases/' }]
            },
            {
              text: 'Bootstrap',
              items: [
                { text: 'Minimal OP', link: '/use-cases/minimal-op' },
                { text: 'Comprehensive bundle', link: '/use-cases/bundle' }
              ]
            },
            {
              text: 'Profile & flow',
              items: [
                { text: 'Declaring a security profile', link: '/use-cases/security-profile' },
                { text: 'FAPI 2.0 Baseline', link: '/use-cases/fapi2-baseline' },
                {
                  text: 'Service-to-service (client_credentials)',
                  link: '/use-cases/client-credentials'
                },
                { text: 'OAuth 2.0 (no openid)', link: '/use-cases/oauth2-only' },
                { text: 'DPoP nonce flow', link: '/use-cases/dpop-nonce' },
                {
                  text: 'Protected resource metadata (RFC 9728)',
                  link: '/use-cases/protected-resource-metadata'
                }
              ]
            },
            {
              text: 'Grants',
              items: [
                { text: 'Device Code (RFC 8628)', link: '/use-cases/device-code' },
                { text: 'CIBA poll mode', link: '/use-cases/ciba' },
                { text: 'Token Exchange (RFC 8693)', link: '/use-cases/token-exchange' },
                { text: 'Custom Grant', link: '/use-cases/custom-grant' }
              ]
            },
            {
              text: 'Crypto & subjects',
              items: [
                { text: 'Pairwise subject', link: '/use-cases/pairwise-subject' },
                { text: 'JWE encryption', link: '/use-cases/jwe-encryption' }
              ]
            },
            {
              text: 'UI',
              items: [
                { text: 'SPA (custom interaction)', link: '/use-cases/spa-custom-interaction' },
                { text: 'Custom consent UI', link: '/use-cases/custom-consent-ui' },
                { text: 'Custom chooser UI', link: '/use-cases/custom-chooser-ui' },
                { text: 'Multi-account chooser', link: '/use-cases/multi-account' },
                { text: 'CORS for SPA', link: '/use-cases/cors-spa' },
                { text: 'i18n / locale', link: '/use-cases/i18n' }
              ]
            },
            {
              text: 'Storage',
              items: [
                { text: 'Choosing a storage layout', link: '/use-cases/storage-decision' },
                { text: 'Persistent storage (SQL)', link: '/use-cases/sql-store' },
                { text: 'DynamoDB storage', link: '/use-cases/dynamodb-store' },
                { text: 'Hot/cold split (Redis volatile)', link: '/use-cases/hot-cold-redis' },
                { text: 'Bring your own store backend', link: '/use-cases/byo-store' }
              ]
            },
            {
              text: 'Scopes & claims',
              items: [
                { text: 'Public / internal scopes', link: '/use-cases/scopes' },
                { text: 'Claims request', link: '/use-cases/claims-request' },
                {
                  text: 'Rich authorization requests (RFC 9396)',
                  link: '/use-cases/authorization-details'
                },
                { text: 'Grant management', link: '/use-cases/grant-management' }
              ]
            },
            {
              text: 'Authentication',
              items: [
                { text: 'MFA / step-up', link: '/use-cases/mfa-step-up' },
                { text: 'Bring your own user store', link: '/use-cases/byo-userstore' },
                { text: 'Custom authenticator', link: '/use-cases/custom-authenticator' }
              ]
            },
            {
              text: 'Governance',
              items: [
                { text: 'First-party consent skip', link: '/use-cases/first-party' },
                { text: 'Client onboarding patterns', link: '/use-cases/client-onboarding' },
                { text: 'Dynamic Client Registration', link: '/use-cases/dynamic-registration' },
                { text: 'Back-Channel Logout', link: '/use-cases/back-channel-logout' }
              ]
            },
            {
              text: 'Operations',
              items: [{ text: 'Prometheus metrics', link: '/use-cases/prometheus' }]
            }
          ],
          '/reference/': [
            {
              text: 'Reference',
              items: [
                { text: 'Options', link: '/reference/options' },
                { text: 'Error catalog', link: '/reference/errors' },
                { text: 'Audit events', link: '/reference/audit-events' },
                { text: 'Architecture overview', link: '/reference/architecture' }
              ]
            }
          ],
          '/operations/': [
            {
              text: 'Operations',
              items: [
                { text: 'Overview', link: '/operations/' },
                { text: 'Key rotation', link: '/operations/key-rotation' },
                { text: 'JWKS endpoint', link: '/operations/jwks' },
                { text: 'Multi-instance deployment', link: '/operations/multi-instance' },
                { text: 'Observability', link: '/operations/observability' },
                { text: 'Backup & DR', link: '/operations/backup' },
                { text: 'Storage maintenance', link: '/operations/storage-maintenance' }
              ]
            }
          ],
          '/compliance/': [
            {
              text: 'Standards',
              items: [
                { text: 'RFC matrix', link: '/compliance/rfc-matrix' },
                { text: 'OFCS status', link: '/compliance/ofcs' },
                { text: 'OFCS reproduce', link: '/compliance/ofcs-reproduce' }
              ]
            },
            {
              text: 'Security',
              items: [
                { text: 'Posture', link: '/security/posture' },
                { text: 'Design judgments', link: '/security/design-judgments' },
                { text: 'CVE regression matrix', link: '/security/cve-matrix' },
                { text: 'Clock and replay windows', link: '/security/clock-and-replay' },
                { text: 'Disclosure', link: '/security/disclosure' }
              ]
            }
          ],
          '/security/': [
            {
              text: 'Standards',
              items: [
                { text: 'RFC matrix', link: '/compliance/rfc-matrix' },
                { text: 'OFCS status', link: '/compliance/ofcs' },
                { text: 'OFCS reproduce', link: '/compliance/ofcs-reproduce' }
              ]
            },
            {
              text: 'Security',
              items: [
                { text: 'Posture', link: '/security/posture' },
                { text: 'Design judgments', link: '/security/design-judgments' },
                { text: 'CVE regression matrix', link: '/security/cve-matrix' },
                { text: 'Clock and replay windows', link: '/security/clock-and-replay' },
                { text: 'Disclosure', link: '/security/disclosure' }
              ]
            }
          ]
        },
        socialLinks: [{ icon: 'github', link: githubUrl }],
        footer: {
          message:
            'a personal project by <a href="https://libraz.net" target="_blank" rel="noopener">libraz</a>'
        }
      }
    },
    ja: {
      label: '日本語',
      lang: 'ja',
      description:
        'Go の http.Handler に組み込める OpenID Connect Provider（認可サーバ）ライブラリ。PAR、JAR、DPoP、mTLS と FAPI 用のプロファイル設定を備えます。',
      themeConfig: {
        search: {
          provider: 'local',
          options: {
            locales: {
              ja: {
                translations: {
                  button: { buttonText: '検索', buttonAriaLabel: 'ドキュメント内検索' },
                  modal: {
                    noResultsText: '一致する結果がありません',
                    resetButtonTitle: '検索をリセット',
                    footer: {
                      selectText: '選択',
                      navigateText: '移動',
                      closeText: '閉じる'
                    }
                  }
                }
              }
            }
          }
        },
        nav: [
          { text: 'go-oidc-provider とは', link: '/ja/why' },
          {
            text: 'クイックスタート',
            items: [
              { text: 'インストール', link: '/ja/getting-started/install' },
              { text: '最小構成 OP', link: '/ja/getting-started/minimal' },
              { text: '必須オプション', link: '/ja/getting-started/required-options' },
              { text: 'ルータへのマウント', link: '/ja/getting-started/mount' }
            ]
          },
          {
            text: '学ぶ',
            items: [
              {
                text: '概要',
                items: [{ text: '読む順番', link: '/ja/concepts/' }]
              },
              {
                text: '設定の基礎',
                items: [
                  { text: 'OAuth 2.0 / OIDC 入門', link: '/ja/concepts/oauth2-oidc-primer' },
                  { text: 'issuer / 発行者', link: '/ja/concepts/issuer' },
                  { text: 'redirect URI', link: '/ja/concepts/redirect-uri' },
                  { text: 'クライアントの種類', link: '/ja/concepts/client-types' },
                  { text: 'scope と claim', link: '/ja/concepts/scopes-and-claims' },
                  { text: 'discovery', link: '/ja/concepts/discovery' },
                  {
                    text: 'JOSE 入門（JWS / JWE / JWK / JWKS / kid）',
                    link: '/ja/concepts/jose-basics'
                  }
                ]
              },
              {
                text: '基本フロー',
                items: [
                  {
                    text: '認可コードフロー + PKCE',
                    link: '/ja/concepts/authorization-code-pkce'
                  },
                  { text: 'リフレッシュトークン', link: '/ja/concepts/refresh-tokens' },
                  { text: 'Client Credentials', link: '/ja/concepts/client-credentials' }
                ]
              },
              {
                text: 'トークン',
                items: [
                  {
                    text: 'ID トークン / アクセストークン',
                    link: '/ja/concepts/tokens'
                  },
                  {
                    text: 'Access token の形式（JWT と opaque）',
                    link: '/ja/concepts/access-token-format'
                  }
                ]
              },
              {
                text: 'セッションと同意',
                items: [
                  { text: 'session と logout', link: '/ja/concepts/sessions-and-logout' },
                  { text: '同意', link: '/ja/concepts/consent' }
                ]
              },
              {
                text: '送信者制約トークン',
                items: [
                  {
                    text: '送信者制約（DPoP / mTLS） — 選び方',
                    link: '/ja/concepts/sender-constraint'
                  },
                  { text: 'DPoP', link: '/ja/concepts/dpop' },
                  { text: 'mTLS', link: '/ja/concepts/mtls' }
                ]
              },
              {
                text: '発展トピック',
                items: [
                  { text: 'Device Code（RFC 8628）', link: '/ja/concepts/device-code' },
                  { text: 'CIBA', link: '/ja/concepts/ciba' },
                  {
                    text: 'ブラウザを使わないフロー（CIBA と Device Code）',
                    link: '/ja/concepts/no-browser-flows'
                  },
                  { text: 'Token Exchange（RFC 8693）', link: '/ja/concepts/token-exchange' },
                  { text: 'JARM（署名付き認可レスポンス）', link: '/ja/concepts/jarm' },
                  { text: 'FAPI 2.0 入門', link: '/ja/concepts/fapi' }
                ]
              },
              {
                text: 'ヘルプ',
                items: [{ text: 'FAQ', link: '/ja/faq' }]
              }
            ]
          },
          {
            text: 'ユースケース',
            items: [
              { text: '一覧', link: '/ja/use-cases/' },
              {
                text: '基本構成',
                items: [
                  { text: '最小構成 OP', link: '/ja/use-cases/minimal-op' },
                  { text: '総合バンドル', link: '/ja/use-cases/bundle' }
                ]
              },
              {
                text: 'プロファイル / フロー',
                items: [
                  {
                    text: 'セキュリティプロファイルの宣言',
                    link: '/ja/use-cases/security-profile'
                  },
                  { text: 'FAPI 2.0 Baseline', link: '/ja/use-cases/fapi2-baseline' },
                  {
                    text: 'サービス間通信（client_credentials）',
                    link: '/ja/use-cases/client-credentials'
                  },
                  { text: 'OAuth 2.0（openid なし）', link: '/ja/use-cases/oauth2-only' },
                  { text: 'DPoP nonce フロー', link: '/ja/use-cases/dpop-nonce' },
                  {
                    text: 'Protected resource metadata（RFC 9728）',
                    link: '/ja/use-cases/protected-resource-metadata'
                  }
                ]
              },
              {
                text: 'Grant',
                items: [
                  { text: 'Device Code（RFC 8628）', link: '/ja/use-cases/device-code' },
                  { text: 'CIBA poll mode', link: '/ja/use-cases/ciba' },
                  {
                    text: 'Token Exchange（RFC 8693）',
                    link: '/ja/use-cases/token-exchange'
                  },
                  { text: 'Custom Grant', link: '/ja/use-cases/custom-grant' }
                ]
              },
              {
                text: '暗号化 / subject',
                items: [
                  { text: 'Pairwise subject', link: '/ja/use-cases/pairwise-subject' },
                  { text: 'JWE 暗号化', link: '/ja/use-cases/jwe-encryption' }
                ]
              },
              {
                text: 'UI',
                items: [
                  {
                    text: 'SPA（カスタム interaction）',
                    link: '/ja/use-cases/spa-custom-interaction'
                  },
                  { text: 'カスタム同意 UI', link: '/ja/use-cases/custom-consent-ui' },
                  {
                    text: 'カスタムアカウントチューザ UI',
                    link: '/ja/use-cases/custom-chooser-ui'
                  },
                  { text: 'マルチアカウントチューザ', link: '/ja/use-cases/multi-account' },
                  { text: 'SPA 向け CORS', link: '/ja/use-cases/cors-spa' },
                  { text: 'i18n / ロケール', link: '/ja/use-cases/i18n' }
                ]
              },
              {
                text: 'ストレージ',
                items: [
                  { text: 'ストレージ構成の選び方', link: '/ja/use-cases/storage-decision' },
                  { text: 'SQL ストア', link: '/ja/use-cases/sql-store' },
                  { text: 'DynamoDB ストア', link: '/ja/use-cases/dynamodb-store' },
                  {
                    text: 'Hot / Cold 分離（Redis 揮発）',
                    link: '/ja/use-cases/hot-cold-redis'
                  },
                  { text: 'ストアを自前実装', link: '/ja/use-cases/byo-store' }
                ]
              },
              {
                text: 'スコープ / claim',
                items: [
                  { text: 'Public / Internal スコープ', link: '/ja/use-cases/scopes' },
                  { text: 'Claims リクエスト', link: '/ja/use-cases/claims-request' },
                  {
                    text: 'Rich authorization requests（RFC 9396）',
                    link: '/ja/use-cases/authorization-details'
                  },
                  { text: 'Grant management', link: '/ja/use-cases/grant-management' }
                ]
              },
              {
                text: '認証',
                items: [
                  { text: 'MFA / ステップアップ', link: '/ja/use-cases/mfa-step-up' },
                  {
                    text: '既存ユーザストアの投影',
                    link: '/ja/use-cases/byo-userstore'
                  },
                  {
                    text: 'カスタム authenticator',
                    link: '/ja/use-cases/custom-authenticator'
                  }
                ]
              },
              {
                text: 'ガバナンス',
                items: [
                  {
                    text: 'ファーストパーティ同意スキップ',
                    link: '/ja/use-cases/first-party'
                  },
                  {
                    text: 'クライアントオンボーディング',
                    link: '/ja/use-cases/client-onboarding'
                  },
                  {
                    text: 'Dynamic Client Registration',
                    link: '/ja/use-cases/dynamic-registration'
                  },
                  { text: 'Back-Channel Logout', link: '/ja/use-cases/back-channel-logout' }
                ]
              },
              {
                text: '運用',
                items: [{ text: 'Prometheus メトリクス', link: '/ja/use-cases/prometheus' }]
              }
            ]
          },
          {
            text: '運用',
            items: [
              { text: '概要', link: '/ja/operations/' },
              { text: '鍵ローテーション', link: '/ja/operations/key-rotation' },
              { text: 'JWKS エンドポイント', link: '/ja/operations/jwks' },
              { text: 'マルチインスタンス展開', link: '/ja/operations/multi-instance' },
              { text: 'observability', link: '/ja/operations/observability' },
              { text: 'バックアップ / DR', link: '/ja/operations/backup' },
              { text: 'ストレージの保守', link: '/ja/operations/storage-maintenance' }
            ]
          },
          {
            text: '標準・セキュリティ',
            items: [
              {
                text: '標準',
                items: [
                  { text: 'RFC 対応一覧', link: '/ja/compliance/rfc-matrix' },
                  { text: 'OFCS 適合状況', link: '/ja/compliance/ofcs' },
                  { text: 'OFCS 再現レシピ', link: '/ja/compliance/ofcs-reproduce' }
                ]
              },
              {
                text: 'セキュリティ',
                items: [
                  { text: 'セキュリティ方針', link: '/ja/security/posture' },
                  { text: '設計判断', link: '/ja/security/design-judgments' },
                  { text: 'CVE 回帰マトリクス', link: '/ja/security/cve-matrix' },
                  { text: '時刻ずれとリプレイ猶予', link: '/ja/security/clock-and-replay' },
                  { text: '脆弱性報告', link: '/ja/security/disclosure' }
                ]
              }
            ]
          },
          {
            text: 'リファレンス',
            items: [
              { text: 'Options 索引', link: '/ja/reference/options' },
              { text: 'エラーカタログ', link: '/ja/reference/errors' },
              { text: 'Audit イベント', link: '/ja/reference/audit-events' },
              { text: 'アーキテクチャ概観', link: '/ja/reference/architecture' }
            ]
          },
          {
            text: docsVersionTag,
            items: [
              {
                text: 'リリースノート',
                link: releaseNotesUrl
              },
              { text: '変更履歴', link: changelogUrl }
            ]
          }
        ],
        sidebar: {
          '/ja/concepts/': [
            {
              text: '概要',
              items: [{ text: '読む順番', link: '/ja/concepts/' }]
            },
            {
              text: '設定の基礎',
              items: [
                { text: 'OAuth 2.0 / OIDC 入門', link: '/ja/concepts/oauth2-oidc-primer' },
                { text: 'issuer / 発行者', link: '/ja/concepts/issuer' },
                { text: 'redirect URI', link: '/ja/concepts/redirect-uri' },
                { text: 'クライアントの種類', link: '/ja/concepts/client-types' },
                { text: 'scope と claim', link: '/ja/concepts/scopes-and-claims' },
                { text: 'discovery', link: '/ja/concepts/discovery' },
                {
                  text: 'JOSE 入門（JWS / JWE / JWK / JWKS / kid）',
                  link: '/ja/concepts/jose-basics'
                }
              ]
            },
            {
              text: '基本フロー',
              items: [
                {
                  text: '認可コードフロー + PKCE',
                  link: '/ja/concepts/authorization-code-pkce'
                },
                { text: 'リフレッシュトークン', link: '/ja/concepts/refresh-tokens' },
                { text: 'Client Credentials', link: '/ja/concepts/client-credentials' }
              ]
            },
            {
              text: 'トークン',
              items: [
                {
                  text: 'ID トークン / アクセストークン',
                  link: '/ja/concepts/tokens'
                },
                {
                  text: 'Access token の形式（JWT と opaque）',
                  link: '/ja/concepts/access-token-format'
                }
              ]
            },
            {
              text: 'セッションと同意',
              items: [
                { text: 'session と logout', link: '/ja/concepts/sessions-and-logout' },
                { text: '同意', link: '/ja/concepts/consent' }
              ]
            },
            {
              text: '送信者制約トークン',
              items: [
                {
                  text: '送信者制約（DPoP / mTLS） — 選び方',
                  link: '/ja/concepts/sender-constraint'
                },
                { text: 'DPoP', link: '/ja/concepts/dpop' },
                { text: 'mTLS', link: '/ja/concepts/mtls' }
              ]
            },
            {
              text: '発展トピック',
              items: [
                { text: 'Device Code（RFC 8628）', link: '/ja/concepts/device-code' },
                { text: 'CIBA', link: '/ja/concepts/ciba' },
                {
                  text: 'ブラウザを使わないフロー（CIBA と Device Code）',
                  link: '/ja/concepts/no-browser-flows'
                },
                { text: 'Token Exchange（RFC 8693）', link: '/ja/concepts/token-exchange' },
                { text: 'JARM（署名付き認可レスポンス）', link: '/ja/concepts/jarm' },
                { text: 'FAPI 2.0 入門', link: '/ja/concepts/fapi' }
              ]
            },
            {
              text: 'ヘルプ',
              items: [{ text: 'FAQ', link: '/ja/faq' }]
            }
          ],
          '/ja/faq': [
            {
              text: '概要',
              items: [{ text: '読む順番', link: '/ja/concepts/' }]
            },
            {
              text: '設定の基礎',
              items: [
                { text: 'OAuth 2.0 / OIDC 入門', link: '/ja/concepts/oauth2-oidc-primer' },
                { text: 'issuer / 発行者', link: '/ja/concepts/issuer' },
                { text: 'redirect URI', link: '/ja/concepts/redirect-uri' },
                { text: 'クライアントの種類', link: '/ja/concepts/client-types' },
                { text: 'scope と claim', link: '/ja/concepts/scopes-and-claims' },
                { text: 'discovery', link: '/ja/concepts/discovery' },
                {
                  text: 'JOSE 入門（JWS / JWE / JWK / JWKS / kid）',
                  link: '/ja/concepts/jose-basics'
                }
              ]
            },
            {
              text: '基本フロー',
              items: [
                {
                  text: '認可コードフロー + PKCE',
                  link: '/ja/concepts/authorization-code-pkce'
                },
                { text: 'リフレッシュトークン', link: '/ja/concepts/refresh-tokens' },
                { text: 'Client Credentials', link: '/ja/concepts/client-credentials' }
              ]
            },
            {
              text: 'トークン',
              items: [
                {
                  text: 'ID トークン / アクセストークン',
                  link: '/ja/concepts/tokens'
                },
                {
                  text: 'Access token の形式（JWT と opaque）',
                  link: '/ja/concepts/access-token-format'
                }
              ]
            },
            {
              text: 'セッションと同意',
              items: [
                { text: 'session と logout', link: '/ja/concepts/sessions-and-logout' },
                { text: '同意', link: '/ja/concepts/consent' }
              ]
            },
            {
              text: '送信者制約トークン',
              items: [
                {
                  text: '送信者制約（DPoP / mTLS） — 選び方',
                  link: '/ja/concepts/sender-constraint'
                },
                { text: 'DPoP', link: '/ja/concepts/dpop' },
                { text: 'mTLS', link: '/ja/concepts/mtls' }
              ]
            },
            {
              text: '発展トピック',
              items: [
                { text: 'Device Code（RFC 8628）', link: '/ja/concepts/device-code' },
                { text: 'CIBA', link: '/ja/concepts/ciba' },
                {
                  text: 'ブラウザを使わないフロー（CIBA と Device Code）',
                  link: '/ja/concepts/no-browser-flows'
                },
                { text: 'Token Exchange（RFC 8693）', link: '/ja/concepts/token-exchange' },
                { text: 'JARM（署名付き認可レスポンス）', link: '/ja/concepts/jarm' },
                { text: 'FAPI 2.0 入門', link: '/ja/concepts/fapi' }
              ]
            },
            {
              text: 'ヘルプ',
              items: [{ text: 'FAQ', link: '/ja/faq' }]
            }
          ],
          '/ja/why': [
            {
              text: '概要',
              items: [{ text: '読む順番', link: '/ja/concepts/' }]
            },
            {
              text: '設定の基礎',
              items: [
                { text: 'OAuth 2.0 / OIDC 入門', link: '/ja/concepts/oauth2-oidc-primer' },
                { text: 'issuer / 発行者', link: '/ja/concepts/issuer' },
                { text: 'redirect URI', link: '/ja/concepts/redirect-uri' },
                { text: 'クライアントの種類', link: '/ja/concepts/client-types' },
                { text: 'scope と claim', link: '/ja/concepts/scopes-and-claims' },
                { text: 'discovery', link: '/ja/concepts/discovery' },
                {
                  text: 'JOSE 入門（JWS / JWE / JWK / JWKS / kid）',
                  link: '/ja/concepts/jose-basics'
                }
              ]
            },
            {
              text: '基本フロー',
              items: [
                {
                  text: '認可コードフロー + PKCE',
                  link: '/ja/concepts/authorization-code-pkce'
                },
                { text: 'リフレッシュトークン', link: '/ja/concepts/refresh-tokens' },
                { text: 'Client Credentials', link: '/ja/concepts/client-credentials' }
              ]
            },
            {
              text: 'トークン',
              items: [
                {
                  text: 'ID トークン / アクセストークン',
                  link: '/ja/concepts/tokens'
                },
                {
                  text: 'Access token の形式（JWT と opaque）',
                  link: '/ja/concepts/access-token-format'
                }
              ]
            },
            {
              text: 'セッションと同意',
              items: [
                { text: 'session と logout', link: '/ja/concepts/sessions-and-logout' },
                { text: '同意', link: '/ja/concepts/consent' }
              ]
            },
            {
              text: '送信者制約トークン',
              items: [
                {
                  text: '送信者制約（DPoP / mTLS） — 選び方',
                  link: '/ja/concepts/sender-constraint'
                },
                { text: 'DPoP', link: '/ja/concepts/dpop' },
                { text: 'mTLS', link: '/ja/concepts/mtls' }
              ]
            },
            {
              text: '発展トピック',
              items: [
                { text: 'Device Code（RFC 8628）', link: '/ja/concepts/device-code' },
                { text: 'CIBA', link: '/ja/concepts/ciba' },
                {
                  text: 'ブラウザを使わないフロー（CIBA と Device Code）',
                  link: '/ja/concepts/no-browser-flows'
                },
                { text: 'Token Exchange（RFC 8693）', link: '/ja/concepts/token-exchange' },
                { text: 'JARM（署名付き認可レスポンス）', link: '/ja/concepts/jarm' },
                { text: 'FAPI 2.0 入門', link: '/ja/concepts/fapi' }
              ]
            },
            {
              text: 'ヘルプ',
              items: [{ text: 'FAQ', link: '/ja/faq' }]
            }
          ],
          '/ja/getting-started/': [
            {
              text: 'クイックスタート',
              items: [
                { text: 'インストール', link: '/ja/getting-started/install' },
                { text: '最小構成 OP', link: '/ja/getting-started/minimal' },
                { text: '必須オプション', link: '/ja/getting-started/required-options' },
                { text: 'ルータへのマウント', link: '/ja/getting-started/mount' }
              ]
            }
          ],
          '/ja/use-cases/': [
            {
              text: 'ユースケース',
              items: [{ text: '一覧', link: '/ja/use-cases/' }]
            },
            {
              text: '基本構成',
              items: [
                { text: '最小構成 OP', link: '/ja/use-cases/minimal-op' },
                { text: '総合バンドル', link: '/ja/use-cases/bundle' }
              ]
            },
            {
              text: 'プロファイル / フロー',
              items: [
                { text: 'セキュリティプロファイルの宣言', link: '/ja/use-cases/security-profile' },
                { text: 'FAPI 2.0 Baseline', link: '/ja/use-cases/fapi2-baseline' },
                {
                  text: 'サービス間通信（client_credentials）',
                  link: '/ja/use-cases/client-credentials'
                },
                { text: 'OAuth 2.0（openid なし）', link: '/ja/use-cases/oauth2-only' },
                { text: 'DPoP nonce フロー', link: '/ja/use-cases/dpop-nonce' },
                {
                  text: 'Protected resource metadata（RFC 9728）',
                  link: '/ja/use-cases/protected-resource-metadata'
                }
              ]
            },
            {
              text: 'Grant',
              items: [
                { text: 'Device Code（RFC 8628）', link: '/ja/use-cases/device-code' },
                { text: 'CIBA poll mode', link: '/ja/use-cases/ciba' },
                { text: 'Token Exchange（RFC 8693）', link: '/ja/use-cases/token-exchange' },
                { text: 'Custom Grant', link: '/ja/use-cases/custom-grant' }
              ]
            },
            {
              text: '暗号化 / subject',
              items: [
                { text: 'Pairwise subject', link: '/ja/use-cases/pairwise-subject' },
                { text: 'JWE 暗号化', link: '/ja/use-cases/jwe-encryption' }
              ]
            },
            {
              text: 'UI',
              items: [
                {
                  text: 'SPA（カスタム interaction）',
                  link: '/ja/use-cases/spa-custom-interaction'
                },
                { text: 'カスタム同意 UI', link: '/ja/use-cases/custom-consent-ui' },
                {
                  text: 'カスタムアカウントチューザ UI',
                  link: '/ja/use-cases/custom-chooser-ui'
                },
                { text: 'マルチアカウントチューザ', link: '/ja/use-cases/multi-account' },
                { text: 'SPA 向け CORS', link: '/ja/use-cases/cors-spa' },
                { text: 'i18n / ロケール', link: '/ja/use-cases/i18n' }
              ]
            },
            {
              text: 'ストレージ',
              items: [
                { text: 'ストレージ構成の選び方', link: '/ja/use-cases/storage-decision' },
                { text: 'SQL ストア', link: '/ja/use-cases/sql-store' },
                { text: 'DynamoDB ストア', link: '/ja/use-cases/dynamodb-store' },
                { text: 'Hot / Cold 分離（Redis 揮発）', link: '/ja/use-cases/hot-cold-redis' },
                { text: 'ストアを自前実装', link: '/ja/use-cases/byo-store' }
              ]
            },
            {
              text: 'スコープ / claim',
              items: [
                { text: 'Public / Internal スコープ', link: '/ja/use-cases/scopes' },
                { text: 'Claims リクエスト', link: '/ja/use-cases/claims-request' },
                {
                  text: 'Rich authorization requests（RFC 9396）',
                  link: '/ja/use-cases/authorization-details'
                },
                { text: 'Grant management', link: '/ja/use-cases/grant-management' }
              ]
            },
            {
              text: '認証',
              items: [
                { text: 'MFA / ステップアップ', link: '/ja/use-cases/mfa-step-up' },
                {
                  text: '既存ユーザストアの投影',
                  link: '/ja/use-cases/byo-userstore'
                },
                { text: 'カスタム authenticator', link: '/ja/use-cases/custom-authenticator' }
              ]
            },
            {
              text: 'ガバナンス',
              items: [
                { text: 'ファーストパーティ同意スキップ', link: '/ja/use-cases/first-party' },
                {
                  text: 'クライアントオンボーディング',
                  link: '/ja/use-cases/client-onboarding'
                },
                {
                  text: 'Dynamic Client Registration',
                  link: '/ja/use-cases/dynamic-registration'
                },
                { text: 'Back-Channel Logout', link: '/ja/use-cases/back-channel-logout' }
              ]
            },
            {
              text: '運用',
              items: [{ text: 'Prometheus メトリクス', link: '/ja/use-cases/prometheus' }]
            }
          ],
          '/ja/reference/': [
            {
              text: 'リファレンス',
              items: [
                { text: 'Options 索引', link: '/ja/reference/options' },
                { text: 'エラーカタログ', link: '/ja/reference/errors' },
                { text: 'Audit イベントカタログ', link: '/ja/reference/audit-events' },
                { text: 'アーキテクチャ概観', link: '/ja/reference/architecture' }
              ]
            }
          ],
          '/ja/operations/': [
            {
              text: '運用',
              items: [
                { text: '概要', link: '/ja/operations/' },
                { text: '鍵ローテーション', link: '/ja/operations/key-rotation' },
                { text: 'JWKS エンドポイント', link: '/ja/operations/jwks' },
                { text: 'マルチインスタンス展開', link: '/ja/operations/multi-instance' },
                { text: 'observability', link: '/ja/operations/observability' },
                { text: 'バックアップ / DR', link: '/ja/operations/backup' },
                { text: 'ストレージの保守', link: '/ja/operations/storage-maintenance' }
              ]
            }
          ],
          '/ja/compliance/': [
            {
              text: '標準対応',
              items: [
                { text: 'RFC 対応一覧', link: '/ja/compliance/rfc-matrix' },
                { text: 'OFCS 適合状況', link: '/ja/compliance/ofcs' },
                { text: 'OFCS 再現レシピ', link: '/ja/compliance/ofcs-reproduce' }
              ]
            },
            {
              text: 'セキュリティ',
              items: [
                { text: 'セキュリティ方針', link: '/ja/security/posture' },
                { text: '設計判断', link: '/ja/security/design-judgments' },
                { text: 'CVE 回帰マトリクス', link: '/ja/security/cve-matrix' },
                { text: '時刻ずれとリプレイ猶予', link: '/ja/security/clock-and-replay' },
                { text: '脆弱性報告', link: '/ja/security/disclosure' }
              ]
            }
          ],
          '/ja/security/': [
            {
              text: '標準対応',
              items: [
                { text: 'RFC 対応一覧', link: '/ja/compliance/rfc-matrix' },
                { text: 'OFCS 適合状況', link: '/ja/compliance/ofcs' },
                { text: 'OFCS 再現レシピ', link: '/ja/compliance/ofcs-reproduce' }
              ]
            },
            {
              text: 'セキュリティ',
              items: [
                { text: 'セキュリティ方針', link: '/ja/security/posture' },
                { text: '設計判断', link: '/ja/security/design-judgments' },
                { text: 'CVE 回帰マトリクス', link: '/ja/security/cve-matrix' },
                { text: '時刻ずれとリプレイ猶予', link: '/ja/security/clock-and-replay' },
                { text: '脆弱性報告', link: '/ja/security/disclosure' }
              ]
            }
          ]
        },
        socialLinks: [{ icon: 'github', link: githubUrl }],
        footer: {
          message:
            'a personal project by <a href="https://libraz.net" target="_blank" rel="noopener">libraz</a>'
        }
      }
    }
  }
})
