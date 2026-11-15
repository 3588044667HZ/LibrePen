export function createIcon(icon: string): HTMLElement {
  const element = document.createElement('i')
  element.className = `bi ${icon}`
  element.setAttribute('aria-hidden', 'true')
  return element
}

export function applyIconButton(button: HTMLButtonElement, icon: string, label: string): void {
  button.title = label
  button.setAttribute('aria-label', label)
  button.textContent = ''
  button.appendChild(createIcon(icon))
}
