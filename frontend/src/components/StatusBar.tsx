import React from 'react'
import { useAppStore } from '../store/useAppStore'
import './StatusBar.css'

export const StatusBar: React.FC = () => {
  const { currentDocument, isLoading } = useAppStore()

  const getWordCount = (text: string): number => {
    if (!text.trim()) return 0
    return text.trim().split(/\s+/).length
  }

  const getCharacterCount = (text: string): number => {
    return text.length
  }

  const getLineCount = (text: string): number => {
    if (!text) return 1
    return text.split('\n').length
  }

  const formatPath = (path?: string): string => {
    if (!path) return ''
    // Show only the filename and parent directory for brevity
    const parts = path.split('/')
    if (parts.length <= 2) return path
    return `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  }

  return (
    <div className="status-bar">
      <div className="status-left">
        {isLoading ? (
          <span className="status-item loading">
            <span className="loading-dot"></span>
            Loading...
          </span>
        ) : (
          <span className="status-item">
            {currentDocument ? 'Ready' : 'No document'}
          </span>
        )}
      </div>

      <div className="status-center">
        {currentDocument?.path && (
          <span className="status-item path" title={currentDocument.path}>
            {formatPath(currentDocument.path)}
          </span>
        )}
      </div>

      <div className="status-right">
        {currentDocument && (
          <>
            <span className="status-item">
              Lines: {getLineCount(currentDocument.content)}
            </span>
            <span className="status-separator">|</span>
            <span className="status-item">
              Words: {getWordCount(currentDocument.content)}
            </span>
            <span className="status-separator">|</span>
            <span className="status-item">
              Characters: {getCharacterCount(currentDocument.content)}
            </span>
            {currentDocument.isDirty && (
              <>
                <span className="status-separator">|</span>
                <span className="status-item modified">
                  Modified
                </span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
