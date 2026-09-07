# @cordon/brand

Every logo, icon and social image, generated.

```bash
npm install
npm run build     # export/ + copies into packages/console/public
```

## Why it is a build and not a folder of files

The mark is `Logo`'s own SVG, the wordmark is laid out by the library's real
`layoutDots` over the real 5×7 face, and the tree is the geometry
`DelegationTree` draws. `prebuild` bundles the face out of `packages/ui` on
every run, so an asset cannot drift from the components it is supposed to be
the same brand as. Redrawing any of this by eye is how a logo ends up almost
matching the product.

## What comes out

| File | Size | Where it goes |
| --- | --- | --- |
| `mark.svg`, `mark-{512,256,192,64,32,16}.png` | square | favicon, avatar, anywhere the tile stands alone |
| `apple-touch-icon.png` | 180 | iOS — opaque, because iOS composites onto white |
| `icon-maskable.png` | 512 | Android — the mark inside the inner 80% it promises to keep |
| `logo-light.{svg,png}`, `logo-dark.{svg,png}` | 1200 / 600 wide | mark + wordmark + line, on paper and on ink |
| `wordmark-{light,dark}.{svg,png}` | 960 / 480 wide | the word alone |
| `og-image.png` | 1200×630 | link unfurls |
| `banner.png` | 1280×640 | README, socials |

The social images carry the delegation tree with its root ring nearly closed
and one leaf already at its bound, because a card showing only a logo tells a
reader nothing the URL had not already told them.

## Using them

The console's `index.html` and `manifest.webmanifest` already point at the
copies in its `public/`. `og:image` is written as an absolute URL at runtime by
`usePageMeta`, because unfurlers do not resolve relative paths.

Nothing in `packages/site` is wired to these yet.
