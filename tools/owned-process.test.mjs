import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ownedDescendants } from './owned-process.mjs'
test('excludes unrelated application instances even when executable paths match',()=>{const rows=[{pid:1,parent:0,path:'driver'},{pid:2,parent:1,path:'native-driver'},{pid:3,parent:2,path:'markwriter'},{pid:4,parent:0,path:'markwriter'},{pid:5,parent:3,path:'webview'}];assert.deepEqual(ownedDescendants(rows,1).map(p=>p.pid),[2,3,5])})
