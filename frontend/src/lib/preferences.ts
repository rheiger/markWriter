export type DialogFolderSetting = 'defaultDocumentFolder' | 'defaultHtmlExportFolder'

export interface AppConfig {
  theme: 'light' | 'dark' | 'system'
  syntaxHighlighting: boolean
  fontSize: number
  fontFamily: string
  renderedFontSize: number
  renderedFontFamily: string
  renderedLineHeight: number
  tabWidth: number
  wordWrap: boolean
  wrapContinuation: boolean
  syncPreview: boolean
  collapseSource: boolean
  restoreSession: boolean
  automaticUpdateChecks: boolean
  defaultEditorMode: 'markdown' | 'wysiwyg'
  defaultDocumentFolder: string
  defaultHtmlExportFolder: string
}
export const defaultConfig: AppConfig = {
  theme: 'system', syntaxHighlighting: true, fontSize: 14, fontFamily: 'Monaco, Menlo, Consolas, monospace',
  renderedFontSize: 16, renderedFontFamily: 'system-ui, sans-serif', renderedLineHeight: 1.6,
  tabWidth: 4, wordWrap: true, wrapContinuation: true, syncPreview: true, collapseSource: true, restoreSession: true,
  automaticUpdateChecks: true, defaultEditorMode: 'wysiwyg',
  defaultDocumentFolder: '', defaultHtmlExportFolder: '',
}
export function parsePreferences(value: unknown): AppConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preferences')
  const record = value as Record<string, unknown>
  if (record.version !== undefined && record.version !== 1 && record.version !== 0) throw new Error('Unsupported preferences version')
  const config = (record.config ?? record) as Record<string, unknown>
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid preferences config')
  const result = { ...defaultConfig }
  for (const key of Object.keys(defaultConfig) as (keyof AppConfig)[]) {
    const field = config[key]
    if (field === undefined) continue
    let valid = typeof field === typeof defaultConfig[key]
    if (key === 'theme') valid = typeof field === 'string' && ['light', 'dark', 'system'].includes(field)
    if (key === 'defaultEditorMode') valid = field === 'markdown' || field === 'wysiwyg'
    if (key === 'fontSize' || key === 'renderedFontSize') valid = Number.isInteger(field) && Number(field) >= 10 && Number(field) <= 32
    if (key === 'tabWidth') valid = [2, 4, 8].includes(Number(field)) && typeof field === 'number'
    if (key === 'renderedLineHeight') valid = typeof field === 'number' && Number.isFinite(field) && field >= 1 && field <= 2.5
    if (key === 'fontFamily' || key === 'renderedFontFamily') valid = typeof field === 'string' && field.trim().length > 0 && field.length <= 200 && !/[;{}<>]/.test(field)
    if (key === 'defaultDocumentFolder' || key === 'defaultHtmlExportFolder') valid = typeof field === 'string' && field.length <= 32767 && !field.includes('\0')
    if (!valid) throw new Error(`Invalid preference: ${key}`)
    Object.assign(result, { [key]: field })
  }
  if (config.renderedFontSize === undefined && typeof config.fontSize === 'number') result.renderedFontSize = Math.min(32, config.fontSize + 2)
  return result
}

export type UpdateChoiceAction = 'skip' | 'remind'
export type UpdateChoice = { kind: 'skip' } | { kind: 'remind'; until: number }
export type UpdateChoices = Record<string, UpdateChoice>

export function parseUpdateChoices(value: unknown): UpdateChoices {
  const raw = (value as { updateChoices?: unknown } | null)?.updateChoices
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const choices: UpdateChoices = {}
  for (const [version, choice] of Object.entries(raw)) {
    if (!/^(0|[1-9][0-9]{0,19})(\.(0|[1-9][0-9]{0,19})){2}$/.test(version)) continue
    if (choice?.kind === 'skip') choices[version] = { kind: 'skip' }
    if (choice?.kind === 'remind' && Number.isSafeInteger(choice.until) && choice.until > 0) {
      choices[version] = { kind: 'remind', until: choice.until }
    }
  }
  return choices
}
