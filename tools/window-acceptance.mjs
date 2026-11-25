import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyMultiWindow({
  dir, run, click, menu, mode, action, snapshot, wait, restartApplication, windowCommand, pointer,
}) {
  const handles = () => windowCommand('GET', '/handles')
  const switchTo = handle => windowCommand('POST', '', { handle })
  const original = await windowCommand('GET', '')
  assert.deepEqual(await handles(), [original])
  await menu('Window', 'New Window')
  const secondary = await wait(async () => (await handles()).find(handle => handle !== original), 'second native window')
  await switchTo(secondary)
  await wait(() => run('return !!document.querySelector(".app-main")'), 'independent window loaded')
  assert.equal((await snapshot()).documents.length, 0)

  await switchTo(original)
  await menu('Window', 'Show Windows…')
  await wait(() => run('return !!document.querySelector(\'dialog[aria-label="Windows"][open]\')'), 'native window list')
  await run('document.querySelector(\'dialog[aria-label="Windows"]\').dispatchEvent(new Event("cancel", {cancelable:true}))')
  await wait(() => run('return !document.querySelector("dialog[open]")'), 'window list dismissed')

  // Change a global preference with both WebViews live.
  await menu('File', 'Settings…')
  await run(`const select=[...document.querySelectorAll("dialog label")].find(label=>label.textContent.startsWith("Default editor for new documents")).querySelector("select");
    select.value="markdown"; select.dispatchEvent(new Event("change",{bubbles:true}));`)
  await click('//dialog//button[normalize-space(.)="Apply"]')
  await wait(async () => (await snapshot()).config.defaultEditorMode === 'markdown', 'default editor preference saved')
  await switchTo(secondary)
  await wait(async () => (await snapshot()).config.defaultEditorMode === 'markdown', 'preferences reach an existing second window')
  const empty = (await action('create')).document
  assert.equal(empty.mode, 'markdown')
  await action('close', empty.id)

  async function moveTab(title) {
    const point = await run(`const tab=[...document.querySelectorAll('.document-tab [role=tab]')].find(tab=>tab.title.endsWith(arguments[0]));
      tab.scrollIntoView({block:'nearest',inline:'nearest'});
      const bounds=tab.getBoundingClientRect();
      return {x:Math.round(bounds.left+bounds.width/2),y:Math.round(bounds.top+bounds.height/2)};`, title)
    await pointer([{
      type: 'pointer', id: 'move-tab', parameters: { pointerType: 'mouse' }, actions: [
        { type: 'pointerMove', origin: 'viewport', duration: 0, ...point },
        { type: 'pointerDown', button: 2 }, { type: 'pointerUp', button: 2 },
      ],
    }])
    await click('//*[@role="menuitem" and normalize-space(.)="Move Tab to Window…"]')
    const target = '//dialog[@aria-label="Move Tab to Window"]//button[not(@disabled) and normalize-space(.)!="New Window" and normalize-space(.)!="Cancel"]'
    await click(target)
  }

  const drafts = []
  for (const editorMode of ['Markdown', 'WYSIWYG']) {
    const title = `move-${editorMode.toLowerCase()}.md`
    const path = join(dir, title)
    const before = '# Window transfer\n\nA clean fixture paragraph.\n'
    const change = ` edit-${editorMode.toLowerCase()}`
    await writeFile(path, before)
    await switchTo(original)
    const opened = (await action('open', path)).document
    await mode(editorMode)
    if (editorMode === 'Markdown') {
      await action('selectSource', before.indexOf(' paragraph'))
      await run(`document.querySelector('[data-active=true] .cm-content').focus();
        document.execCommand('insertText',false,arguments[0]);`, change)
    } else {
      await run(`const editor=document.querySelector('[data-active=true] .tiptap').editor;
        editor.chain().focus('end').insertContent(arguments[0]).run();`, change)
    }
    await wait(async () => (await snapshot()).document?.content.includes(change), `${editorMode} source edit`)
    const draft = (await snapshot()).document
    assert.equal(draft.isDirty, true)
    await moveTab(title)
    await wait(async () => !(await snapshot()).documents.some(doc => doc.id === opened.id), 'source tab relinquished after move')
    await action('open', path)
    assert.ok(!(await snapshot()).documents.some(doc => doc.path === opened.path), 'duplicate open must remain in the owning window')

    await switchTo(secondary)
    await wait(async () => (await snapshot()).document?.id === opened.id, 'destination activates moved tab')
    assert.equal((await snapshot()).document.content, draft.content)
    assert.equal((await snapshot()).document.revision, draft.revision)
    assert.equal((await snapshot()).document.mode, draft.mode)
    await mode(editorMode)
    await menu('Edit', 'Undo')
    await wait(async () => (await snapshot()).document.content === before, `${editorMode} Undo after tab move`)
    await menu('Edit', 'Redo')
    await wait(async () => (await snapshot()).document.content === draft.content, `${editorMode} Redo after tab move`)
    drafts.push({ id: draft.id, content: draft.content, path, before })
  }

  await action('checkpointForRestart')
  await restartApplication()
  await wait(async () => (await handles()).length === 2, 'secondary native window restored after restart')
  let recovered
  for (const handle of await handles()) {
    await switchTo(handle)
    await wait(() => run('return !!document.querySelector(".app-main")'), 'restored workspace initialized')
    const state = await snapshot()
    if (state.documents.some(doc => doc.id === drafts[0].id)) recovered = handle
  }
  assert.ok(recovered)
  await switchTo(recovered)
  for (const draft of drafts) {
    assert.equal((await snapshot()).documents.find(doc => doc.id === draft.id)?.content, draft.content)
    assert.equal((await snapshot()).documents.find(doc => doc.id === draft.id)?.isDirty, true)
    assert.equal(await readFile(draft.path, 'utf8'), draft.before)
  }
  await menu('Window', 'Close Window')
  await wait(() => run('return !!document.querySelector(\'dialog[aria-label="Unsaved changes"][open]\')'), 'closing a second window prompts for dirty tabs')
  await click('//dialog//button[normalize-space(.)="Cancel"]')
  await wait(() => run('return !document.querySelector("dialog[open]")'), 'window close canceled')
  assert.equal((await handles()).length, 2)
  const remaining = (await snapshot()).documents
  assert.ok(drafts.every(draft => remaining.some(doc => doc.id === draft.id && doc.isDirty)))
  return [
    'independent windows, window list and shared default editor preference',
    'dirty tab moves preserve ownership and Markdown/WYSIWYG Undo and Redo',
    'dirty moved drafts recover in their destination window after interruption; Cancel keeps the window open',
  ]
}
