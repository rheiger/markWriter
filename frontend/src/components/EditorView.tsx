import React, { useEffect, useRef } from 'react'
import { Editor } from '@toast-ui/react-editor'
import { useAppStore } from '../store/useAppStore'
import '@toast-ui/editor/dist/toastui-editor.css'
import './EditorView.css'

export const EditorView: React.FC = () => {
  const editorRef = useRef<Editor>(null)
  const { currentDocument, updateDocumentContent, config } = useAppStore()
  
  // Initialize editor content when document changes
  useEffect(() => {
    if (editorRef.current && currentDocument) {
      const editorInstance = editorRef.current.getInstance()
      const currentContent = editorInstance.getMarkdown()
      
      // Only update if content is different to avoid cursor jumps
      if (currentContent !== currentDocument.content) {
        editorInstance.setMarkdown(currentDocument.content || '')
      }
    }
  }, [currentDocument?.id]) // Only react to document ID changes
  
  // Handle content changes
  const handleChange = () => {
    if (editorRef.current) {
      const editorInstance = editorRef.current.getInstance()
      const content = editorInstance.getMarkdown()
      updateDocumentContent(content)
    }
  }
  
  // Editor toolbar configuration
  const toolbarItems = [
    ['heading', 'bold', 'italic', 'strike'],
    ['hr', 'quote'],
    ['ul', 'ol', 'task', 'indent', 'outdent'],
    ['table', 'image', 'link'],
    ['code', 'codeblock'],
    ['scrollSync']
  ]
  
  if (!currentDocument) {
    return (
      <div className="editor-placeholder">
        <div className="editor-placeholder-content">
          <h2>Welcome to MarkWriter</h2>
          <p>Create a new document or open an existing one to get started.</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="editor-view">
      <div className="editor-container">
        <Editor
          ref={editorRef}
          height="100%"
          initialEditType="wysiwyg"
          previewStyle="vertical"
          hideModeSwitch={false}
          toolbarItems={toolbarItems}
          usageStatistics={false}
          autofocus={true}
          placeholder="Start writing your markdown..."
          onChange={handleChange}
          theme={config.theme === 'dark' ? 'dark' : 'light'}
          customHTMLSanitizer={(html: string) => {
            // Allow all HTML for now - we might want to restrict this later
            return html
          }}
        />
      </div>
    </div>
  )
}
