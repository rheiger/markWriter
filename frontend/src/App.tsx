import React, { useEffect, useRef } from 'react'
import { useAppStore, useTheme } from './store/useAppStore'
import { EditorView, EditorViewRef } from './components/EditorView'
import { MenuBar } from './components/MenuBar'
import { StatusBar } from './components/StatusBar'
import { ErrorToast } from './components/ErrorToast'
import { LoadingSpinner } from './components/LoadingSpinner'
import './App.css'

const App: React.FC = () => {
  const { currentDocument, isLoading, error, createNewDocument } = useAppStore()
  const { theme, setTheme } = useTheme()
  const editorViewRef = useRef<EditorViewRef>(null)

  // Initialize the application
  useEffect(() => {
    // Apply theme on startup
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }

    // Create initial document if none exists
    if (!currentDocument) {
      createNewDocument()
    }
  }, [theme, currentDocument, createNewDocument])

  // Get editor reference for MenuBar
  const getEditorRef = () => {
    return editorViewRef.current?.getEditorRef()
  }

  return (
    <div className="app">
      <MenuBar editorRef={getEditorRef()} />
      
      <main className="app-main">
        {isLoading && <LoadingSpinner />}
        <EditorView ref={editorViewRef} />
      </main>
      
      <StatusBar />
      
      {error && <ErrorToast message={error} />}
    </div>
  )
}

export default App
