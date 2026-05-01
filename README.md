# go-oidc-provider-homepage

Documentation site for [`go-oidc-provider`](https://github.com/libraz/go-oidc-provider).
Built with [VitePress](https://vitepress.dev/) and formatted with [Biome](https://biomejs.dev/).

## Develop

```sh
yarn install
yarn dev      # http://localhost:5173
yarn build    # writes .vitepress/dist
yarn preview  # serves the build
```

## Lint / format

```sh
yarn lint
yarn format
```

## Layout

```
src/                 English entry pages
src/ja/              Japanese mirror
.vitepress/config.ts Sidebar / nav / i18n
.vitepress/theme/    Custom CSS (mygramdb-homepage parity)
```

Content is grounded against the actual `go-oidc-provider` source tree;
every option name, RFC citation, OFCS number, and example file name is
verifiable in that repo.
