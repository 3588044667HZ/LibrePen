import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource
} from '@codemirror/autocomplete'
import { languages } from '@codemirror/language-data'
import type { EditorState, Extension } from '@codemirror/state'

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/
const FENCE_INFO_RE = /^\s{0,3}(?:`{3,}|~{3,})([^\n]*)$/
const EMOJI_TRIGGER_RE = /(?:^|[^\\]):([a-z0-9_+-]*)$/

const EMOJI: Record<string, string> = {
  smile: '😄',
  smiley: '😃',
  grin: '😁',
  laughing: '😆',
  joy: '😂',
  rofl: '🤣',
  wink: '😉',
  blush: '😊',
  innocent: '😇',
  heart_eyes: '😍',
  kissing_heart: '😘',
  yum: '😋',
  stuck_out_tongue: '😛',
  sunglasses: '😎',
  thinking: '🤔',
  neutral_face: '😐',
  expressionless: '😑',
  unamused: '😒',
  sweat_smile: '😅',
  sob: '😭',
  cry: '😢',
  angry: '😠',
  rage: '😡',
  scream: '😱',
  fearful: '😨',
  sleeping: '😴',
  mask: '😷',
  nerd_face: '🤓',
  clown_face: '🤡',
  ghost: '👻',
  skull: '💀',
  poop: '💩',
  thumbsup: '👍',
  '+1': '👍',
  thumbsdown: '👎',
  '-1': '👎',
  ok_hand: '👌',
  clap: '👏',
  pray: '🙏',
  wave: '👋',
  muscle: '💪',
  point_right: '👉',
  point_left: '👈',
  point_up: '👆',
  point_down: '👇',
  raised_hands: '🙌',
  handshake: '🤝',
  heart: '❤️',
  broken_heart: '💔',
  blue_heart: '💙',
  green_heart: '💚',
  yellow_heart: '💛',
  purple_heart: '💜',
  orange_heart: '🧡',
  black_heart: '🖤',
  white_heart: '🤍',
  sparkles: '✨',
  star: '⭐',
  star2: '🌟',
  zap: '⚡',
  fire: '🔥',
  boom: '💥',
  tada: '🎉',
  gift: '🎁',
  rocket: '🚀',
  eyes: '👀',
  bug: '🐛',
  white_check_mark: '✅',
  heavy_check_mark: '✔️',
  x: '❌',
  warning: '⚠️',
  question: '❓',
  exclamation: '❗',
  bulb: '💡',
  book: '📖',
  books: '📚',
  pencil: '✏️',
  memo: '📝',
  computer: '💻',
  phone: '📱',
  calendar: '📅',
  clock: '⏰',
  hourglass: '⏳',
  coffee: '☕',
  beer: '🍺',
  pizza: '🍕',
  cake: '🍰',
  apple: '🍎',
  sun: '☀️',
  moon: '🌙',
  cloud: '☁️',
  umbrella: '☔',
  snowflake: '❄️',
  rainbow: '🌈',
  earth_asia: '🌏',
  cat: '🐱',
  dog: '🐶',
  panda: '🐼',
  unicorn: '🦄',
  penguin: '🐧',
  bird: '🐦',
  fish: '🐟',
  rose: '🌹',
  sunflower: '🌻',
  tree: '🌳',
  car: '🚗',
  airplane: '✈️',
  house: '🏠',
  lock: '🔒',
  key: '🔑',
  link: '🔗',
  package: '📦',
  chart: '📈',
  '100': '💯'
}

const EMOJI_OPTIONS: Completion[] = Object.entries(EMOJI).map(([name, glyph]) => ({
  label: `:${name}:`,
  detail: glyph,
  apply: `${name}: `
}))

interface LanguageOption {
  label: string
  detail: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = (() => {
  const seen = new Set<string>()
  const options: LanguageOption[] = []
  for (const description of languages) {
    const tokens =
      description.alias.length > 0 ? description.alias : [description.name.toLowerCase()]
    for (const token of tokens) {
      if (!token || seen.has(token)) continue
      seen.add(token)
      options.push({ label: token, detail: description.name })
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label))
})()

function fenceOpenBefore(state: EditorState, lineNumber: number): boolean {
  let fence: string | null = null
  for (let number = 1; number < lineNumber; number++) {
    const match = FENCE_RE.exec(state.doc.line(number).text)
    if (!match) continue
    const marker = match[1][0]
    if (!fence) fence = marker
    else if (fence === marker) fence = null
  }
  return fence !== null
}

function inFencedCodeLine(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos)
  if (FENCE_RE.test(line.text)) return true
  return fenceOpenBefore(state, line.number)
}

const emojiSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const state = context.state
  const line = state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const match = EMOJI_TRIGGER_RE.exec(before)
  if (!match) return null
  if (inFencedCodeLine(state, context.pos)) return null
  const name = match[1]
  const prefix = `:${name}`
  const options = EMOJI_OPTIONS.filter((option) => option.label.startsWith(prefix))
  if (options.length === 0) return null
  const colon = line.from + before.length - name.length - 1
  return {
    from: colon + 1,
    options,
    filter: false
  }
}

const fenceLanguageSource: CompletionSource = (
  context: CompletionContext
): CompletionResult | null => {
  const state = context.state
  const line = state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const match = FENCE_INFO_RE.exec(before)
  if (!match) return null
  if (fenceOpenBefore(state, line.number)) return null
  const raw = match[1]
  const prefix = raw.trim().toLowerCase()
  const options = LANGUAGE_OPTIONS.filter((option) =>
    option.label.toLowerCase().startsWith(prefix)
  )
    .slice(0, 80)
    .map((option) => ({
      label: option.label,
      detail: option.detail,
      apply: option.label
    }))
  if (options.length === 0) return null
  const leading = raw.length - raw.trimStart().length
  return {
    from: line.from + before.length - raw.length + leading,
    options
  }
}

export function markdownAutocomplete(): Extension {
  return autocompletion({
    override: [emojiSource, fenceLanguageSource],
    activateOnTyping: true
  })
}
