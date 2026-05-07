import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const siteUrl = 'https://go-oidc-provider.libraz.net'
const githubUrl = 'https://github.com/libraz/go-oidc-provider'

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'go-oidc-provider',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Linux, macOS, Windows',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  description:
    'OpenID Connect Provider (Authorization Server) library for Go. Mounts as an http.Handler. Targets FAPI 2.0 Baseline / Message Signing.',
  url: siteUrl,
  downloadUrl: githubUrl,
  author: { '@type': 'Person', name: 'libraz' },
  license: 'https://opensource.org/licenses/Apache-2.0',
  keywords:
    'OpenID Connect, OIDC, OAuth 2.0, FAPI 2.0, PAR, JAR, JARM, DPoP, mTLS, PKCE, Go, Authorization Server'
}

export default withMermaid(
  defineConfig({
    srcDir: 'src',
    appearance: true,
    title: 'go-oidc-provider',
    description:
      'OpenID Connect Provider (Authorization Server) for Go. Embeds as an http.Handler. Targets FAPI 2.0 Baseline / Message Signing with PAR, JAR, DPoP, mTLS.',
    cleanUrls: true,

    markdown: {
      theme: { light: 'github-light', dark: 'github-dark' },
      html: true
    },

    sitemap: { hostname: siteUrl },

    head: [
      ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
      ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
      [
        'link',
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
        }
      ],
      ['script', { type: 'application/ld+json' }, JSON.stringify(softwareApplicationJsonLd)],
      [
        'meta',
        {
          name: 'keywords',
          content:
            'OpenID Connect, OIDC, OAuth2, FAPI 2.0, FAPI Baseline, PAR, JAR, JARM, DPoP, mTLS, PKCE, refresh token rotation, Go, Authorization Server, http.Handler'
        }
      ],
      ['link', { rel: 'canonical', href: siteUrl }],
      ['meta', { property: 'og:site_name', content: 'go-oidc-provider' }],
      [
        'meta',
        {
          property: 'og:title',
          content: 'go-oidc-provider — OpenID Connect Provider library for Go'
        }
      ],
      [
        'meta',
        {
          property: 'og:description',
          content:
            'OIDC Provider library that mounts as a Go http.Handler. Targets FAPI 2.0 Baseline / Message Signing.'
        }
      ],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:url', content: siteUrl }]
    ],

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
              text: 'Quick Start',
              items: [
                { text: 'Install', link: '/getting-started/install' },
                { text: 'Minimal OP', link: '/getting-started/minimal' },
                { text: 'Required options', link: '/getting-started/required-options' },
                { text: 'Mount on your router', link: '/getting-started/mount' }
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
                    { text: 'FAPI 2.0 Baseline', link: '/use-cases/fapi2-baseline' },
                    {
                      text: 'Service-to-service (client_credentials)',
                      link: '/use-cases/client-credentials'
                    },
                    { text: 'OAuth 2.0 (no openid)', link: '/use-cases/oauth2-only' },
                    { text: 'DPoP nonce flow', link: '/use-cases/dpop-nonce' }
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
                    { text: 'Multi-account chooser', link: '/use-cases/multi-account' },
                    { text: 'CORS for SPA', link: '/use-cases/cors-spa' },
                    { text: 'i18n / locale', link: '/use-cases/i18n' }
                  ]
                },
                {
                  text: 'Storage',
                  items: [
                    { text: 'Persistent storage (SQL)', link: '/use-cases/sql-store' },
                    {
                      text: 'Hot/cold split (Redis volatile)',
                      link: '/use-cases/hot-cold-redis'
                    }
                  ]
                },
                {
                  text: 'Scopes & claims',
                  items: [
                    { text: 'Public / internal scopes', link: '/use-cases/scopes' },
                    { text: 'Claims request', link: '/use-cases/claims-request' }
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
              text: 'Reference',
              items: [
                { text: 'Options', link: '/reference/options' },
                { text: 'Errors', link: '/reference/errors' },
                { text: 'Audit events', link: '/reference/audit-events' },
                { text: 'Architecture', link: '/reference/architecture' }
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
                { text: 'Backup & DR', link: '/operations/backup' }
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
                  { text: 'FAPI 2.0 Baseline', link: '/use-cases/fapi2-baseline' },
                  {
                    text: 'Service-to-service (client_credentials)',
                    link: '/use-cases/client-credentials'
                  },
                  { text: 'OAuth 2.0 (no openid)', link: '/use-cases/oauth2-only' },
                  { text: 'DPoP nonce flow', link: '/use-cases/dpop-nonce' }
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
                  { text: 'Multi-account chooser', link: '/use-cases/multi-account' },
                  { text: 'CORS for SPA', link: '/use-cases/cors-spa' },
                  { text: 'i18n / locale', link: '/use-cases/i18n' }
                ]
              },
              {
                text: 'Storage',
                items: [
                  { text: 'Persistent storage (SQL)', link: '/use-cases/sql-store' },
                  { text: 'Hot/cold split (Redis volatile)', link: '/use-cases/hot-cold-redis' }
                ]
              },
              {
                text: 'Scopes & claims',
                items: [
                  { text: 'Public / internal scopes', link: '/use-cases/scopes' },
                  { text: 'Claims request', link: '/use-cases/claims-request' }
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
                  { text: 'Backup & DR', link: '/operations/backup' }
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
          'Go の http.Handler に組み込める OpenID Connect Provider（Authorization Server）ライブラリ。FAPI 2.0 Baseline / Message Signing をターゲット。',
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
                      text: 'JOSE 入門 (JWS / JWE / JWK / JWKS / kid)',
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
                      text: '送信者制約 (DPoP / mTLS) — 選び方',
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
                      text: 'ブラウザを使わないフロー (CIBA と Device Code)',
                      link: '/ja/concepts/no-browser-flows'
                    },
                    { text: 'Token Exchange（RFC 8693）', link: '/ja/concepts/token-exchange' },
                    { text: 'JARM(署名付き認可レスポンス)', link: '/ja/concepts/jarm' },
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
              text: 'クイックスタート',
              items: [
                { text: 'インストール', link: '/ja/getting-started/install' },
                { text: '最小構成 OP', link: '/ja/getting-started/minimal' },
                { text: '必須オプション', link: '/ja/getting-started/required-options' },
                { text: 'ルーターへのマウント', link: '/ja/getting-started/mount' }
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
                    { text: 'FAPI 2.0 Baseline', link: '/ja/use-cases/fapi2-baseline' },
                    {
                      text: 'サービス間通信（client_credentials）',
                      link: '/ja/use-cases/client-credentials'
                    },
                    { text: 'OAuth 2.0（openid なし）', link: '/ja/use-cases/oauth2-only' },
                    { text: 'DPoP nonce フロー', link: '/ja/use-cases/dpop-nonce' }
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
                    { text: 'マルチアカウントチューザ', link: '/ja/use-cases/multi-account' },
                    { text: 'SPA 向け CORS', link: '/ja/use-cases/cors-spa' },
                    { text: 'i18n / ロケール', link: '/ja/use-cases/i18n' }
                  ]
                },
                {
                  text: 'ストレージ',
                  items: [
                    { text: 'SQL ストア', link: '/ja/use-cases/sql-store' },
                    {
                      text: 'Hot / Cold 分離（Redis 揮発）',
                      link: '/ja/use-cases/hot-cold-redis'
                    }
                  ]
                },
                {
                  text: 'スコープ / claim',
                  items: [
                    { text: 'Public / Internal スコープ', link: '/ja/use-cases/scopes' },
                    { text: 'Claims リクエスト', link: '/ja/use-cases/claims-request' }
                  ]
                },
                {
                  text: '認証',
                  items: [
                    { text: 'MFA / ステップアップ', link: '/ja/use-cases/mfa-step-up' },
                    {
                      text: '既存ユーザーストアの投影',
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
              text: 'リファレンス',
              items: [
                { text: 'Options 索引', link: '/ja/reference/options' },
                { text: 'エラーカタログ', link: '/ja/reference/errors' },
                { text: 'Audit イベント', link: '/ja/reference/audit-events' },
                { text: 'アーキテクチャ概観', link: '/ja/reference/architecture' }
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
                { text: 'バックアップ / DR', link: '/ja/operations/backup' }
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
                    text: 'JOSE 入門 (JWS / JWE / JWK / JWKS / kid)',
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
                    text: '送信者制約 (DPoP / mTLS) — 選び方',
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
                    text: 'ブラウザを使わないフロー (CIBA と Device Code)',
                    link: '/ja/concepts/no-browser-flows'
                  },
                  { text: 'Token Exchange（RFC 8693）', link: '/ja/concepts/token-exchange' },
                  { text: 'JARM(署名付き認可レスポンス)', link: '/ja/concepts/jarm' },
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
                    text: 'JOSE 入門 (JWS / JWE / JWK / JWKS / kid)',
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
                    text: '送信者制約 (DPoP / mTLS) — 選び方',
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
                    text: 'ブラウザを使わないフロー (CIBA と Device Code)',
                    link: '/ja/concepts/no-browser-flows'
                  },
                  { text: 'Token Exchange（RFC 8693）', link: '/ja/concepts/token-exchange' },
                  { text: 'JARM(署名付き認可レスポンス)', link: '/ja/concepts/jarm' },
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
                  { text: 'ルーターへのマウント', link: '/ja/getting-started/mount' }
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
                  { text: 'FAPI 2.0 Baseline', link: '/ja/use-cases/fapi2-baseline' },
                  {
                    text: 'サービス間通信（client_credentials）',
                    link: '/ja/use-cases/client-credentials'
                  },
                  { text: 'OAuth 2.0（openid なし）', link: '/ja/use-cases/oauth2-only' },
                  { text: 'DPoP nonce フロー', link: '/ja/use-cases/dpop-nonce' }
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
                  { text: 'マルチアカウントチューザ', link: '/ja/use-cases/multi-account' },
                  { text: 'SPA 向け CORS', link: '/ja/use-cases/cors-spa' },
                  { text: 'i18n / ロケール', link: '/ja/use-cases/i18n' }
                ]
              },
              {
                text: 'ストレージ',
                items: [
                  { text: 'SQL ストア', link: '/ja/use-cases/sql-store' },
                  { text: 'Hot / Cold 分離（Redis 揮発）', link: '/ja/use-cases/hot-cold-redis' }
                ]
              },
              {
                text: 'スコープ / claim',
                items: [
                  { text: 'Public / Internal スコープ', link: '/ja/use-cases/scopes' },
                  { text: 'Claims リクエスト', link: '/ja/use-cases/claims-request' }
                ]
              },
              {
                text: '認証',
                items: [
                  { text: 'MFA / ステップアップ', link: '/ja/use-cases/mfa-step-up' },
                  {
                    text: '既存ユーザーストアの投影',
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
                  { text: 'バックアップ / DR', link: '/ja/operations/backup' }
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
)
