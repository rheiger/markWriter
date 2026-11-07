import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store/useAppStore'
import { openOsBatch } from './osOpen'
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(),isTauri:()=>false}))
beforeEach(()=>{vi.mocked(invoke).mockReset();useAppStore.setState({documents:[],currentDocument:null,error:null})})
it('retains batch and read errors while opening later valid files and preserving a dirty tab',async()=>{
  useAppStore.getState().setCurrentDocument({id:'dirty',title:'Draft',content:'Unsaved',isDirty:true,lastModified:new Date()})
  vi.mocked(invoke).mockImplementation(async(_name,args:any)=>{
    if(args.path==='/missing.md')throw new Error('Missing file')
    return {id:'opened',path:'/Grüße 中文.md',title:'Grüße 中文.md',content:'# Exact\r\n'}
  })
  await openOsBatch({paths:['/missing.md','/Grüße 中文.md','/Grüße 中文.md'],errors:['Earlier batch rejected']},()=>false)
  expect(useAppStore.getState().documents).toHaveLength(2)
  expect(useAppStore.getState().documents[0]).toMatchObject({content:'Unsaved',isDirty:true})
  expect(useAppStore.getState().currentDocument?.content).toBe('# Exact\r\n')
  expect(useAppStore.getState().error).toContain('Earlier batch rejected')
  expect(useAppStore.getState().error).toContain('Missing file')
})
