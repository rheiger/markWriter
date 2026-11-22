import { describe, expect, it } from 'vitest'
import { defaultConfig } from './preferences'
import { encodeSettingsProfile, parseSettingsProfile } from './settingsProfile'

describe('portable settings profiles', () => {
  it('round-trips only portable settings, including Unicode', () => {
    const config = { ...defaultConfig, theme: 'dark' as const, fontFamily: 'ＭＳ ゴシック, monospace', path: '/local/draft.md' }
    const profile = encodeSettingsProfile(config)
    expect(profile).toEqual({
      format: 'markwriter-settings', version: 1,
      config: { ...defaultConfig, theme: 'dark', fontFamily: config.fontFamily },
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
    expect(() => parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: { path: '/local/draft.md' } })).toThrow(/setting: path/)
  })

  it('uses normal defaults for omitted settings', () => {
    expect(parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: { theme: 'light' } }))
      .toEqual({ ...defaultConfig, theme: 'light' })
  })
})
