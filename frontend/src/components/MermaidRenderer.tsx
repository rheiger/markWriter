import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { useAppStore } from '../store/useAppStore'

interface MermaidRendererProps {
  chart: string
  id: string
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart, id }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { config } = useAppStore()
  
  useEffect(() => {
    if (!containerRef.current) return

    const isDark = config.theme === 'dark' || 
      (config.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    // Initialize mermaid with theme configuration
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      themeVariables: {
        // Light theme colors
        primaryColor: isDark ? '#1e293b' : '#f8fafc',
        primaryTextColor: isDark ? '#f1f5f9' : '#0f172a',
        primaryBorderColor: isDark ? '#475569' : '#cbd5e1',
        lineColor: isDark ? '#64748b' : '#475569',
        secondaryColor: isDark ? '#334155' : '#e2e8f0',
        tertiaryColor: isDark ? '#475569' : '#f1f5f9',
        background: isDark ? '#0f172a' : '#ffffff',
        mainBkg: isDark ? '#1e293b' : '#ffffff',
        secondBkg: isDark ? '#334155' : '#f8fafc',
        tertiaryBkg: isDark ? '#475569' : '#f1f5f9',
      },
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
      fontSize: 14,
      securityLevel: 'loose', // Allow HTML in diagrams
    })

    const renderDiagram = async () => {
      try {
        // Clear the container
        containerRef.current!.innerHTML = ''
        
        // Generate unique ID for this diagram
        const diagramId = `mermaid-${id}-${Date.now()}`
        
        // Create a temporary element to render the diagram
        const element = document.createElement('div')
        element.id = diagramId
        containerRef.current!.appendChild(element)
        
        // Render the diagram
        const { svg } = await mermaid.render(diagramId, chart)
        
        // Replace the temporary element with the rendered SVG
        containerRef.current!.innerHTML = svg
        
        console.log('[MERMAID] Diagram rendered successfully:', diagramId)
      } catch (error) {
        console.error('[MERMAID] Error rendering diagram:', error)
        
        // Show error message to user
        containerRef.current!.innerHTML = `
          <div style="
            padding: 16px;
            background-color: var(--bg-secondary);
            border: 2px solid #ef4444;
            border-radius: 8px;
            color: #dc2626;
            font-family: monospace;
            font-size: 14px;
            margin: 8px 0;
          ">
            <strong>Mermaid Diagram Error:</strong><br>
            <pre style="margin: 8px 0 0 0; white-space: pre-wrap;">${error}</pre>
          </div>
        `
      }
    }

    renderDiagram()
  }, [chart, id, config.theme])

  return (
    <div 
      ref={containerRef}
      className="mermaid-container"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '16px 0',
        padding: '8px',
        backgroundColor: 'transparent',
        overflow: 'auto'
      }}
    />
  )
}

export default MermaidRenderer