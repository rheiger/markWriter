import { defaultConfig, parsePreferences, type AppConfig } from './preferences'

const format = 'markwriter-settings'
const version = 1
const { defaultDocumentFolder: _documentFolder, defaultHtmlExportFolder: _exportFolder, ...portableDefaults } = defaultConfig

function parsePortableConfig(value: unknown): typeof portableDefaults {
  const { defaultDocumentFolder: _documentFolder, defaultHtmlExportFolder: _exportFolder, ...config } =
    parsePreferences({ version: 1, config: value })
  return config
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSettingsProfile(value: unknown): typeof portableDefaults {
  if (!isRecord(value) || value.format !== format) throw new Error('Choose a MarkWriter settings profile.')
  if (value.version !== version) throw new Error('Unsupported settings profile version.')
  if (!isRecord(value.config)) throw new Error('Invalid settings profile config.')
  if (Object.keys(value).length !== 3) throw new Error('Unexpected settings profile fields.')
  for (const key of Object.keys(value.config)) {
    if (!Object.prototype.hasOwnProperty.call(portableDefaults, key)) throw new Error('The settings profile contains an unknown setting.')
  }
  return parsePortableConfig({ ...portableDefaults, ...value.config })
}

export function encodeSettingsProfile(draft: AppConfig) {
  return { format, version, config: parsePortableConfig(draft) }
}
