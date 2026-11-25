import { describe, expect, it } from 'vitest'
import { defaultConfig, parsePreferences } from './preferences'

describe('preferences schema', () => {
  it('defaults highlighting on and persists a validated view-only boolean', () => {
    expect(parsePreferences({ config: {} }).syntaxHighlighting).toBe(true)
    expect(parsePreferences({ config: { syntaxHighlighting: false } }).syntaxHighlighting).toBe(false)
    expect(() => parsePreferences({ config: { syntaxHighlighting: 'yes' } })).toThrow(/syntaxHighlighting/)
  })
  it('migrates missing fields and the legacy single font size', () => {
    expect(parsePreferences({ fontSize: 18, autoSave: true })).toMatchObject({ fontSize: 18, renderedFontSize: 20, restoreSession: true })
    expect(parsePreferences({ version: 1, config: { theme: 'dark' } })).toEqual({ ...defaultConfig, theme: 'dark' })
  })
  it('rejects unsupported schemas and invalid values without mutating defaults', () => {
    expect(() => parsePreferences({ version: 99 })).toThrow(/version/)
    expect(() => parsePreferences({ version: 1, config: { fontSize: -4 } })).toThrow(/fontSize/)
    expect(() => parsePreferences({ version: 1, config: { wordWrap: 'yes' } })).toThrow(/wordWrap/)
    expect(defaultConfig.fontSize).toBe(14)
  })
})

it('migrates synchronization and continuation defaults and validates their booleans', () => {
  expect(parsePreferences({ version: 1, config: { theme: 'light' } })).toMatchObject({ syncPreview: true, wrapContinuation: true })
  expect(parsePreferences({ version: 1, config: { syncPreview: false, wrapContinuation: false } })).toMatchObject({ syncPreview: false, wrapContinuation: false })
  expect(() => parsePreferences({ config: { syncPreview: 'yes' } })).toThrow(/syncPreview/)
})

it('defaults older profiles to automatic updates and validates the persisted opt-out', () => {
  expect(parsePreferences({ version: 1, config: {} }).automaticUpdateChecks).toBe(true)
  expect(parsePreferences({ version: 1, config: { automaticUpdateChecks: false } }).automaticUpdateChecks).toBe(false)
  expect(() => parsePreferences({ version: 1, config: { automaticUpdateChecks: 'false' } })).toThrow(/automaticUpdateChecks/)
})

it('validates the optional default mode and keeps legacy WYSIWYG behavior', () => {
  expect(parsePreferences({ version: 0 }).defaultEditorMode).toBe('wysiwyg')
  expect(parsePreferences({ version: 1, config: { defaultEditorMode: 'markdown' } }).defaultEditorMode).toBe('markdown')
  expect(() => parsePreferences({ version: 1, config: { defaultEditorMode: 'preview' } })).toThrow('defaultEditorMode')
})
