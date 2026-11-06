import katexCss from 'katex/dist/katex.min.css?raw'

// Vite embeds the exact pinned font bytes in the generated JavaScript. The
// exported HTML therefore needs no application assets or network connection.
const files = import.meta.glob<string>('../../node_modules/katex/dist/fonts/*.woff2', { eager: true, query: '?inline', import: 'default' })
const fonts = Object.fromEntries(Object.entries(files).map(([path, data]) => [path.split('/').pop()!, data]))
let count = 0
const inlineCss = katexCss.replace(/src:url\(fonts\/([^)]+\.woff2)\) format\("woff2"\),url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, (_match, name: string) => {
  const data = fonts[name]
  if (!data?.startsWith('data:')) throw new Error(`Missing bundled math font: ${name}`)
  count++
  return `src:url("${data}") format("woff2")`
})
if (!count || count !== Object.keys(fonts).length || /url\(fonts\//.test(inlineCss)) throw new Error('Incomplete bundled math fonts')
export const mathExportCss = inlineCss
