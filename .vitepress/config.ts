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
                { text: 'Concepts', link: '/concepts/oauth2-oidc-primer' },
                { text: 'FAQ', link: '/faq' }
              ]
            },
            { text: 'Quick Start', link: '/getting-started/install' },
            {
              text: 'Use Cases',
              items: [
                { text: 'All use cases', link: '/use-cases/' },
                { text: 'Bootstrap', link: '/use-cases/#bootstrap-wiring' },
                { text: 'Profile & flow', link: '/use-cases/#profile-flow' },
                { text: 'UI', link: '/use-cases/#ui' },
                { text: 'Storage', link: '/use-cases/#storage' },
                { text: 'Scopes & claims', link: '/use-cases/#scopes-claims' },
                { text: 'Authentication', link: '/use-cases/#authentication' },
                { text: 'Governance', link: '/use-cases/#governance' },
                { text: 'Operations', link: '/use-cases/#operations' }
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
                { text: 'RFC compliance', link: '/compliance/rfc-matrix' },
                { text: 'OFCS conformance', link: '/compliance/ofcs' },
                { text: 'Posture', link: '/security/posture' },
                { text: 'Design judgments', link: '/security/design-judgments' },
                { text: 'CVE regression matrix', link: '/security/cve-matrix' },
                { text: 'Disclosure', link: '/security/disclosure' }
              ]
            }
          ],
          sidebar: {
            '/concepts/': [
              {
                text: 'Concepts (beginner-friendly)',
                items: [
                  { text: 'OAuth 2.0 / OIDC primer', link: '/concepts/oauth2-oidc-primer' },
                  { text: 'Authorization Code + PKCE', link: '/concepts/authorization-code-pkce' },
                  { text: 'Client Credentials', link: '/concepts/client-credentials' },
                  { text: 'Refresh tokens', link: '/concepts/refresh-tokens' },
                  { text: 'ID Token vs access token', link: '/concepts/tokens' },
                  {
                    text: 'Access token format (JWT vs opaque)',
                    link: '/concepts/access-token-format'
                  },
                  { text: 'Sender constraint (DPoP / mTLS)', link: '/concepts/sender-constraint' },
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
                text: 'Concepts (beginner-friendly)',
                items: [
                  { text: 'OAuth 2.0 / OIDC primer', link: '/concepts/oauth2-oidc-primer' },
                  { text: 'Authorization Code + PKCE', link: '/concepts/authorization-code-pkce' },
                  { text: 'Client Credentials', link: '/concepts/client-credentials' },
                  { text: 'Refresh tokens', link: '/concepts/refresh-tokens' },
                  { text: 'ID Token vs access token', link: '/concepts/tokens' },
                  {
                    text: 'Access token format (JWT vs opaque)',
                    link: '/concepts/access-token-format'
                  },
                  { text: 'Sender constraint (DPoP / mTLS)', link: '/concepts/sender-constraint' },
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
                  { text: 'Custom authenticator', link: '/use-cases/custom-authenticator' }
                ]
              },
              {
                text: 'Governance',
                items: [
                  { text: 'First-party consent skip', link: '/use-cases/first-party' },
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
                  { text: 'OFCS status', link: '/compliance/ofcs' }
                ]
              },
              {
                text: 'Security',
                items: [
                  { text: 'Posture', link: '/security/posture' },
                  { text: 'Design judgments', link: '/security/design-judgments' },
                  { text: 'CVE regression matrix', link: '/security/cve-matrix' },
                  { text: 'Disclosure', link: '/security/disclosure' }
                ]
              }
            ],
            '/security/': [
              {
                text: 'Standards',
                items: [
                  { text: 'RFC matrix', link: '/compliance/rfc-matrix' },
                  { text: 'OFCS status', link: '/compliance/ofcs' }
                ]
              },
              {
                text: 'Security',
                items: [
                  { text: 'Posture', link: '/security/posture' },
                  { text: 'Design judgments', link: '/security/design-judgments' },
                  { text: 'CVE regression matrix', link: '/security/cve-matrix' },
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
                { text: 'ガイド', link: '/ja/concepts/oauth2-oidc-primer' },
                { text: 'FAQ', link: '/ja/faq' }
              ]
            },
            { text: 'クイックスタート', link: '/ja/getting-started/install' },
            {
              text: 'ユースケース',
              items: [
                { text: '一覧', link: '/ja/use-cases/' },
                { text: '基本構成', link: '/ja/use-cases/#基本構成' },
                { text: 'プロファイル / フロー', link: '/ja/use-cases/#プロファイル-フロー' },
                { text: 'UI', link: '/ja/use-cases/#ui' },
                { text: 'ストレージ', link: '/ja/use-cases/#ストレージ' },
                { text: 'スコープ / claim', link: '/ja/use-cases/#スコープ-claim' },
                { text: '認証', link: '/ja/use-cases/#認証' },
                { text: 'ガバナンス', link: '/ja/use-cases/#ガバナンス' },
                { text: '運用', link: '/ja/use-cases/#運用' }
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
                { text: 'RFC 対応一覧', link: '/ja/compliance/rfc-matrix' },
                { text: 'OFCS 適合状況', link: '/ja/compliance/ofcs' },
                { text: 'セキュリティ方針', link: '/ja/security/posture' },
                { text: '設計判断', link: '/ja/security/design-judgments' },
                { text: 'CVE 回帰マトリクス', link: '/ja/security/cve-matrix' },
                { text: '脆弱性報告', link: '/ja/security/disclosure' }
              ]
            }
          ],
          sidebar: {
            '/ja/concepts/': [
              {
                text: 'ガイド（はじめての方向け）',
                items: [
                  { text: 'OAuth 2.0 / OIDC 入門', link: '/ja/concepts/oauth2-oidc-primer' },
                  {
                    text: '認可コードフロー + PKCE',
                    link: '/ja/concepts/authorization-code-pkce'
                  },
                  { text: 'Client Credentials', link: '/ja/concepts/client-credentials' },
                  { text: 'リフレッシュトークン', link: '/ja/concepts/refresh-tokens' },
                  {
                    text: 'ID トークン / アクセストークン',
                    link: '/ja/concepts/tokens'
                  },
                  {
                    text: 'Access token の形式（JWT と opaque）',
                    link: '/ja/concepts/access-token-format'
                  },
                  {
                    text: '送信者制約（DPoP / mTLS）',
                    link: '/ja/concepts/sender-constraint'
                  },
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
                text: 'ガイド（はじめての方向け）',
                items: [
                  { text: 'OAuth 2.0 / OIDC 入門', link: '/ja/concepts/oauth2-oidc-primer' },
                  {
                    text: '認可コードフロー + PKCE',
                    link: '/ja/concepts/authorization-code-pkce'
                  },
                  { text: 'Client Credentials', link: '/ja/concepts/client-credentials' },
                  { text: 'リフレッシュトークン', link: '/ja/concepts/refresh-tokens' },
                  {
                    text: 'ID トークン / アクセストークン',
                    link: '/ja/concepts/tokens'
                  },
                  {
                    text: 'Access token の形式（JWT と opaque）',
                    link: '/ja/concepts/access-token-format'
                  },
                  {
                    text: '送信者制約（DPoP / mTLS）',
                    link: '/ja/concepts/sender-constraint'
                  },
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
                  { text: 'カスタム authenticator', link: '/ja/use-cases/custom-authenticator' }
                ]
              },
              {
                text: 'ガバナンス',
                items: [
                  { text: 'ファーストパーティ同意スキップ', link: '/ja/use-cases/first-party' },
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
                  { text: 'OFCS 適合状況', link: '/ja/compliance/ofcs' }
                ]
              },
              {
                text: 'セキュリティ',
                items: [
                  { text: 'セキュリティ方針', link: '/ja/security/posture' },
                  { text: '設計判断', link: '/ja/security/design-judgments' },
                  { text: 'CVE 回帰マトリクス', link: '/ja/security/cve-matrix' },
                  { text: '脆弱性報告', link: '/ja/security/disclosure' }
                ]
              }
            ],
            '/ja/security/': [
              {
                text: '標準対応',
                items: [
                  { text: 'RFC 対応一覧', link: '/ja/compliance/rfc-matrix' },
                  { text: 'OFCS 適合状況', link: '/ja/compliance/ofcs' }
                ]
              },
              {
                text: 'セキュリティ',
                items: [
                  { text: 'セキュリティ方針', link: '/ja/security/posture' },
                  { text: '設計判断', link: '/ja/security/design-judgments' },
                  { text: 'CVE 回帰マトリクス', link: '/ja/security/cve-matrix' },
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
