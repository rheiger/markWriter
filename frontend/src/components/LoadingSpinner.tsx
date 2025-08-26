import React from 'react'
import './LoadingSpinner.css'

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="loading-spinner-overlay">
      <div className="loading-spinner">
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
    </div>
  )
}
