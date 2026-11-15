import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false
})

export function renderInlineMarkdown(text: string): string {
  const html = md.renderInline(text)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['code', 'strong', 'em', 's', 'del', 'a', 'br', 'mark', 'sub', 'sup'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel']
  })
}
