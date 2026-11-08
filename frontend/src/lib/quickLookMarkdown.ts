import MarkdownIt from 'markdown-it'

// Isolated from the editor parser: Quick Look must never emit active destinations
// or evaluate document HTML, even before the final document sanitization pass.
const markdown = new MarkdownIt({ html: false, linkify: false })
markdown.renderer.rules.link_open = () => '<span class="markdown-link">'
markdown.renderer.rules.link_close = () => '</span>'
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content)
markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0].slice(0, 64).toLowerCase()
  const attribute = language ? ` data-language="${markdown.utils.escapeHtml(language)}"` : ''
  return `<pre><code${attribute}>${markdown.utils.escapeHtml(token.content)}</code></pre>\n`
}

/** Render a complete Markdown document to an inert HTML fragment. */
export function renderQuickLookMarkdown(source: string): string {
  return markdown.render(source)
}
