  // Fixed zoom handlers - use CSS custom properties for proper editor scaling
  const handleZoomIn = () => {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement
    if (editorContainer) {
      const currentSize = parseInt(getComputedStyle(editorContainer).getPropertyValue('--editor-font-size') || '14', 10)
      const newSize = Math.min(currentSize + 2, 24)
      editorContainer.style.setProperty('--editor-font-size', `${newSize}px`)
      console.log('Zoomed in, font size:', newSize)
    }
    setActiveMenu(null)
  }

  const handleZoomOut = () => {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement
    if (editorContainer) {
      const currentSize = parseInt(getComputedStyle(editorContainer).getPropertyValue('--editor-font-size') || '14', 10)
      const newSize = Math.max(currentSize - 2, 10)
      editorContainer.style.setProperty('--editor-font-size', `${newSize}px`)
      console.log('Zoomed out, font size:', newSize)
    }
    setActiveMenu(null)
  }

  const handleActualSize = () => {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement
    if (editorContainer) {
      editorContainer.style.setProperty('--editor-font-size', '14px')
      console.log('Reset to actual size: 14px')
    }
    setActiveMenu(null)
  }