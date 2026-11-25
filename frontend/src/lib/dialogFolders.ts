import { invoke } from '@tauri-apps/api/core'

export async function dialogFolderOptions(folder: string): Promise<{ defaultPath?: string }> {
  if (!folder) return {}
  const usable = await invoke<boolean>('is_dialog_directory_available', { path: folder }).catch(() => false)
  return usable ? { defaultPath: folder } : {}
}
