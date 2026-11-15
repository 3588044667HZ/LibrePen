export interface ThemeStyleParts {
  theme: string
  baseUser: string
  themeUser: string
}

const STYLE_SELECTOR = 'style[data-librepen-theme]'

export function applyThemeStyles(parts: ThemeStyleParts): void {
  if (typeof document === 'undefined') return
  clearThemeStyles()
  const css = [parts.theme, parts.baseUser, parts.themeUser]
    .filter((chunk) => chunk.length > 0)
    .join('\n')
  const style = document.createElement('style')
  style.setAttribute('data-librepen-theme', '')
  style.textContent = css
  const root = document.head ?? document.documentElement
  root.appendChild(style)
}

export function clearThemeStyles(): void {
  if (typeof document === 'undefined') return
  for (const element of Array.from(document.querySelectorAll<HTMLStyleElement>(STYLE_SELECTOR))) {
    element.remove()
  }
}
