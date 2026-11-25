import { describe, expect, it } from 'vitest'
import { defaultConfig, parsePreferences } from './preferences'
import { encodeSettingsProfile, parseSettingsProfile } from './settingsProfile'

describe('portable settings profiles', () => {
  const { defaultDocumentFolder: _documentFolder, defaultHtmlExportFolder: _exportFolder, ...portable } = defaultConfig

  it('round-trips only portable settings, including Unicode', () => {
    const config = { ...defaultConfig, theme: 'dark' as const, fontFamily: 'ＭＳ ゴシック, monospace',
      path: '/local/draft.md', defaultDocumentFolder: '/private/documents', defaultHtmlExportFolder: '/private/exports' }
    const profile = encodeSettingsProfile(config)
    expect(profile).toEqual({
      format: 'markwriter-settings', version: 1,
      config: { ...portable, theme: 'dark', fontFamily: config.fontFamily },
    })
    expect(parseSettingsProfile(profile)).toEqual(profile.config)
  })

  it('rejects other data, unsupported versions and ill-typed settings', () => {
    expect(() => parseSettingsProfile({ version: 1, config: defaultConfig })).toThrow(/MarkWriter settings profile/)
    expect(() => parseSettingsProfile({ format: 'markwriter-settings', version: 2, config: defaultConfig })).toThrow(/version/)
    expect(() => parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: {}, workspace: {} })).toThrow(/unexpected/i)
    expect(() => parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: null })).toThrow(/config/)
    expect(() => parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: { theme: ['dark'] } })).toThrow(/theme/)
    expect(() => parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: { wordWrap: 'yes' } })).toThrow(/wordWrap/)
    expect(() => parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: { path: '/local/draft.md' } })).toThrow(/unknown setting/)
    expect(() => parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: { defaultDocumentFolder: '/foreign' } })).toThrow(/unknown setting/)
  })

  it('uses normal defaults for omitted settings', () => {
    expect(parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: { theme: 'light', fontSize: 21 } }))
      .toEqual({ ...portable, theme: 'light', fontSize: 21 })
  })
})

it('accepts older on-device preferences and restores saved device folders', () => {
  expect(parsePreferences({ version: 1, config: { theme: 'light' } })).toMatchObject({
    theme: 'light', defaultDocumentFolder: '', defaultHtmlExportFolder: '',
  })
  expect(parsePreferences({ version: 1, config: { defaultDocumentFolder: '/Documents français' } }))
    .toMatchObject({ defaultDocumentFolder: '/Documents français' })
})
