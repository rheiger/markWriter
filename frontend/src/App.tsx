import React, { useEffect, useRef } from 'react'
import { useAppStore, useTheme } from './store/useAppStore'
import { EditorView, EditorViewRef } from './components/EditorView'
import { MenuBar } from './components/MenuBar'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ErrorToast } from './components/ErrorToast'
import { LoadingSpinner } from './components/LoadingSpinner'
import './App.css'

const App: React.FC = () => {
  const { currentDocument, isLoading, error, createNewDocument } = useAppStore()
  const { theme } = useTheme()
  const editorViewRef = useRef<EditorViewRef>(null)

  // Initialize the application
  const didInitRef = useRef(false)
  useEffect(() => {
    // Apply theme on startup
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    if (!currentDocument) createNewDocument()
  }, [currentDocument, createNewDocument])

  return (
    <div className="app">
      <MenuBar editorViewRef={editorViewRef} />
      <Toolbar editorViewRef={editorViewRef} />

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
