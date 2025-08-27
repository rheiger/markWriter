import React, { useEffect, useRef, forwardRef, useState } from 'react'
import { Editor } from '@toast-ui/react-editor'
import { useAppStore } from '../store/useAppStore'

// Try different import approach
require('@toast-ui/editor/dist/toastui-editor.css')

export interface EditorViewRef {
  getEditorRef: () => React.RefObject<Editor>
}

export const EditorView = forwardRef<EditorViewRef, {}>((props, ref) => {
  const editorRef = useRef<Editor>(null)
  const { currentDocument, updateDocumentContent, config } = useAppStore()
  const [editorError, setEditorError] = useState<string | null>(null)
  
  // Expose editor ref to parent components
  React.useImperativeHandle(ref, () => ({
    getEditorRef: () => editorRef
  }))

  // Debug what we're getting
  useEffect(() => {
    console.log('EditorView mounted')
    console.log('currentDocument:', currentDocument)
    console.log('config:', config)
    console.log('Editor component:', Editor)
  }, [currentDocument, config])

  // Handle content changes
  const handleChange = () => {
    try {
      if (editorRef.current) {
        const editorInstance = editorRef.current.getInstance()
        if (editorInstance) {
          const content = editorInstance.getMarkdown()
          updateDocumentContent(content)
        }
      }
    } catch (error) {
      console.error('Error handling change:', error)
      setEditorError(`Change error: ${error}`)
    }
  }

  // Handle editor load
  const handleLoad = (editor: any) => {
    console.log('Toast UI Editor loaded successfully:', editor)
  }

  const handleError = (error: any) => {
    console.error('Toast UI Editor error:', error)
    setEditorError(`Editor error: ${error}`)
  }
  
  if (!currentDocument) {
    return (
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        fontSize: '14px'
      }}>
        <div style={{ textAlign: 'center', color: '#666666' }}>
          <h2 style={{ margin: '0 0 1rem 0', color: '#333333', fontWeight: 600 }}>
            Welcome to MarkWriter
          </h2>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Create a new document or open an existing one to get started.
          </p>
        </div>
      </div>
    )
  }

  if (editorError) {
    return (
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        fontSize: '14px'
      }}>
        <div style={{ textAlign: 'center', color: '#cc0000' }}>
          <h2>Editor Error</h2>
          <p>{editorError}</p>
        </div>
      </div>
    )
  }
  
  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      backgroundColor: '#ffffff',
      minHeight: '400px'
    }}>
      <div style={{ 
        flex: 1, 
        minHeight: '400px'
      }}>
        <Editor
          ref={editorRef}
          height="400px"
          initialValue={currentDocument?.content || "# Hello World\n\nStart writing..."}
          initialEditType="markdown"
          previewStyle="vertical"
          hideModeSwitch={false}
          usageStatistics={false}
          onChange={handleChange}
          onLoad={handleLoad}
          onError={handleError}
          toolbarItems={[
            ['heading', 'bold', 'italic']
          ]}
        />
      </div>
    </div>
  )
})

EditorView.displayName = 'EditorView'
