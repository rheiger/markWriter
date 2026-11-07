import { useAppStore } from '../store/useAppStore'
export interface OsOpenBatch { paths: string[]; errors: string[] }
/** Reuse the document I/O authority; retain all diagnostics after sequential reads. */
export async function openOsBatch(batch: OsOpenBatch, disposed: () => boolean) {
  const errors = [...batch.errors]
  for (const path of batch.paths) {
    if (disposed()) break
    await useAppStore.getState().openDocument(path)
    const error = useAppStore.getState().error
    if (error) errors.push(error)
  }
  if (!disposed() && errors.length) useAppStore.getState().setError([...new Set(errors)].join('\n'))
}
