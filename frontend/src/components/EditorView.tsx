import React, { useEffect, useRef, forwardRef, useState } from 'react'
import { Editor } from '@toast-ui/react-editor'
import { useAppStore } from '../store/useAppStore'

// Import Toast UI CSS directly
import '@toast-ui/editor/dist/toastui-editor.css'

export interface EditorViewRef {
  getEditorRef: () => React.RefObject<Editor>
}

export const EditorView = forwardRef<EditorViewRef, {}>((props, ref) => {
  const editorRef = useRef<Editor>(null)
  const { currentDocument, updateDocumentContent, config } = useAppStore()
  const [isEditorReady, setIsEditorReady] = useState(false)
  
  // Expose editor ref to parent components
  React.useImperativeHandle(ref, () => ({
    getEditorRef: () => editorRef
  }))
  
  // Initialize editor content when document changes
  useEffect(() => {
    if (editorRef.current && currentDocument && isEditorReady) {
      const editorInstance = editorRef.current.getInstance()
      if (editorInstance) {
        const currentContent = editorInstance.getMarkdown()
        
        // Only update if content is different to avoid cursor jumps
        if (currentContent !== currentDocument.content) {
          editorInstance.setMarkdown(currentDocument.content || '')
        }
      }
    }
  }, [currentDocument?.id, isEditorReady])
  
  // Handle content changes
  const handleChange = () => {
    if (editorRef.current) {
      const editorInstance = editorRef.current.getInstance()
      if (editorInstance) {
        const content = editorInstance.getMarkdown()
        updateDocumentContent(content)
      }
    }
  }

  // Handle editor load
  const handleLoad = (editor: any) => {
    console.log('Toast UI Editor loaded:', editor)
    setIsEditorReady(true)
  }
  
  if (!currentDocument) {
    return (
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary, #ffffff)'
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary, #666666)' }}>
          <h2 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary, #333333)', fontWeight: 600 }}>
            Welcome to MarkWriter
          </h2>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Create a new document or open an existing one to get started.
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'hidden',
      backgroundColor: 'var(--bg-primary, #ffffff)'
    }}>
      <div style={{ 
        flex: 1, 
        position: 'relative', 
        overflow: 'hidden'
      }}>
        <Editor
          ref={editorRef}
          height="100%"
          initialEditType="wysiwyg"
          previewStyle="vertical"
          hideModeSwitch={false}
          usageStatistics={false}
          autofocus={false}
          placeholder="Start writing your markdown..."
          onChange={handleChange}
          onLoad={handleLoad}
          toolbarItems={[
            ['heading', 'bold', 'italic', 'strike'],
            ['hr', 'quote'],
            ['ul', 'ol', 'task'],
            ['table', 'image', 'link'],
            ['code', 'codeblock']
          ]}
        />
      </div>
    </div>
  )
})

EditorView.displayName = 'EditorView'
