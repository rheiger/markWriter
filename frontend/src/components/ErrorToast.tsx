import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import './ErrorToast.css'

interface ErrorToastProps {
  message: string
}

export const ErrorToast: React.FC<ErrorToastProps> = ({ message }) => {
  const { setError } = useAppStore()
  const [isVisible, setIsVisible] = useState(true)

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(() => setError(null), 300)
  }, [setError])

  useEffect(() => {
    const timer = setTimeout(handleClose, 5000)
    return () => clearTimeout(timer)
  }, [handleClose])

  if (!isVisible) {
    return null
  }

  return (
    <div className={`error-toast ${isVisible ? 'visible' : 'hiding'}`}>
      <div className="error-toast-content">
        <div className="error-icon">⚠️</div>
        <div className="error-message">{message}</div>
        <button
          className="error-close"
          onClick={handleClose}
          aria-label="Close error"
        >
          ×
        </button>
      </div>
    </div>
  )
}
