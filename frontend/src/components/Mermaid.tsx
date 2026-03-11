"use client"

import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  themeVariables: {
    primaryColor: '#eff6ff',
    primaryTextColor: '#1e40af',
    primaryBorderColor: '#bfdbfe',
    lineColor: '#64748b',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#ffffff',
  }
})

interface MermaidProps {
  chart: string
  id?: string
}

export default function Mermaid({ chart, id = 'mermaid-chart' }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (containerRef.current && chart) {
      setError(null)
      mermaid.render(id, chart).then(({ svg }) => {
        setSvg(svg)
      }).catch((err) => {
        console.error('Mermaid rendering failed:', err)
        setError(err.message || 'Diagram syntax error')
      })
    }
  }, [chart, id])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-mono">
        <p className="font-bold mb-1 italic">Mermaid Syntax Error</p>
        <p className="opacity-80 max-w-[300px] text-center">{error}</p>
        <div className="mt-4 p-2 bg-white/50 rounded overflow-auto max-h-[150px] w-full">
            <pre className="text-[10px] leading-tight text-slate-500">{chart}</pre>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef} 
      className="mermaid w-full flex justify-center overflow-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
