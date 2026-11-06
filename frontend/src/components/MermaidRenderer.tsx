import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { useAppStore } from '../store/useAppStore'
import { useResolvedDark } from '../lib/theme'

interface MermaidRendererProps {
  chart: string
  id: string
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart, id }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { config } = useAppStore()
  const isDark = useResolvedDark(config.theme)
  
  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false
    const container = containerRef.current

    // Initialize mermaid with theme configuration
    mermaid.initialize({
      startOnLoad: false,
      suppressErrorRendering: true,
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
      securityLevel: 'strict',
    })

    const renderDiagram = async () => {
      try {
        // Clear the container
        container.innerHTML = ''
        
        // Generate unique ID for this diagram
        const diagramId = `mermaid-${id}-${Date.now()}`
        
        // Create a temporary element to render the diagram
        const element = document.createElement('div')
        element.id = diagramId
        container.appendChild(element)
        
        // Render the diagram
        const { svg } = await mermaid.render(diagramId, chart)
        
        // Replace the temporary element with the rendered SVG
        if (!cancelled) container.innerHTML = svg
        
        console.log('[MERMAID] Diagram rendered successfully:', diagramId)
      } catch (error) {
        if (cancelled) return
        console.error('[MERMAID] Error rendering diagram:', error)
        
        // Show error message to user
        container.textContent = `Mermaid Diagram Error: ${String(error)}`
      }
    }

    renderDiagram()
    return () => { cancelled = true }
  }, [chart, id, isDark])

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
