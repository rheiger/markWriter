import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useUpdateChecks, type AvailableUpdate, type UpdateCheckResult } from './useUpdateChecks'
import { useAppStore } from '../store/useAppStore'

const day = 24 * 60 * 60 * 1000
const available = (version: string): UpdateCheckResult => ({
  kind: 'available',
  currentVersion: '2.12.2',
  version,
  releasePageUrl: 'https://github.com/rheiger/markWriter/releases/tag/v' + version,
  installer: { kind: 'unavailable', reason: 'missingInstaller' },
})

beforeEach(() => {
  vi.useFakeTimers()
  useAppStore.setState({ updateChoices: {} })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('checks at startup and once per day and only announces each version once', async () => {
  const check = vi.fn()
    .mockResolvedValueOnce(available('2.13.1'))
    .mockResolvedValueOnce(available('2.13.1'))
    .mockResolvedValueOnce(available('2.13.2'))
  const { result } = renderHook(() => useUpdateChecks(true, check))
  await act(async () => {})
  expect(check).toHaveBeenCalledTimes(1)
  expect(result.current.notice?.version).toBe('2.13.1')
  act(() => result.current.dismissNotice())
  await act(async () => vi.advanceTimersByTimeAsync(day - 1))
  expect(check).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(check).toHaveBeenCalledTimes(2)
  expect(result.current.notice).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(day))
  expect(result.current.notice?.version).toBe('2.13.2')
})

it('respects opt-out and coalesces automatic and manual checks', async () => {
  let finish!: (result: UpdateCheckResult) => void
  const check = vi.fn(() => new Promise<UpdateCheckResult>(resolve => { finish = resolve }))
  const { result, rerender } = renderHook(enabled => useUpdateChecks(enabled, check), { initialProps: false })
  await act(async () => vi.advanceTimersByTimeAsync(day))
  expect(check).not.toHaveBeenCalled()

  rerender(true)
  let manual!: Promise<UpdateCheckResult>
  await act(async () => { manual = result.current.check() })
  expect(check).toHaveBeenCalledOnce()
  rerender(false)
  await act(async () => {
    finish(available('2.13.1'))
    expect(await manual).toEqual(available('2.13.1'))
  })
  expect(result.current.notice).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(day))
  expect(check).toHaveBeenCalledOnce()

  await act(async () => { manual = result.current.check() })
  expect(check).toHaveBeenCalledTimes(2)
  await act(async () => {
    finish({ kind: 'current', version: '2.12.2' })
    expect(await manual).toEqual({ kind: 'current', version: '2.12.2' })
  })
})

it('keeps startup and periodic failures quiet', async () => {
  const check = vi.fn().mockRejectedValueOnce(new Error('rate limited'))
    .mockResolvedValueOnce({ kind: 'networkUnavailable' })
  const { result } = renderHook(() => useUpdateChecks(true, check))
  await act(async () => {})
  expect(result.current.notice).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(day))
  expect(result.current.notice).toBeNull()
})

it('suppresses the exact skipped release across remounts and still returns it for a manual check', async () => {
  useAppStore.setState({ updateChoices: { '2.13.1': { kind: 'skip' } } })
  const check = vi.fn().mockResolvedValue(available('2.13.1'))
  const first = renderHook(() => useUpdateChecks(true, check))
  await act(async () => {})
  expect(first.result.current.notice).toBeNull()
  first.unmount()

  const { result } = renderHook(() => useUpdateChecks(true, check))
  await act(async () => {})
  expect(result.current.notice).toBeNull()
  await expect(result.current.check()).resolves.toEqual(available('2.13.1'))
  check.mockResolvedValue(available('2.13.2'))
  await act(async () => vi.advanceTimersByTimeAsync(day))
  expect(result.current.notice?.version).toBe('2.13.2')
})

it('reminds again at the selected deadline and does not interrupt a newer version', async () => {
  const check = vi.fn().mockResolvedValue(available('2.13.1'))
  const first = renderHook(() => useUpdateChecks(true, check))
  await act(async () => {})
  expect(first.result.current.notice?.version).toBe('2.13.1')
  await act(async () => vi.advanceTimersByTimeAsync(30_000))
  act(() => {
    useAppStore.setState({ updateChoices: { '2.13.1': { kind: 'remind', until: Date.now() + day } } })
    first.result.current.markSeen(available('2.13.1') as AvailableUpdate)
  })
  await act(async () => vi.advanceTimersByTimeAsync(day - 1))
  expect(first.result.current.notice).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(first.result.current.notice?.version).toBe('2.13.1')
  first.unmount()

  useAppStore.setState({ updateChoices: { '2.13.1': { kind: 'remind', until: Date.now() + day } } })
  const { result } = renderHook(() => useUpdateChecks(true, check))
  await act(async () => {})
  expect(result.current.notice).toBeNull()
  check.mockResolvedValue(available('2.13.2'))
  await act(async () => vi.advanceTimersByTimeAsync(day))
  expect(result.current.notice?.version).toBe('2.13.2')
})
