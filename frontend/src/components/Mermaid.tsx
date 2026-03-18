"use client"

import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { ZoomIn, X, Download, RefreshCw, AlertTriangle, Check, Eye, Code } from 'lucide-react'
import { cn } from '@/lib/utils'

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

// Creative diagram fixer - handles common Mermaid errors
function fixMermaidDiagram(diagram: string): string {
  if (!diagram) return diagram
  
  let fixed = diagram
  
  // Fix: Handle C4 diagrams with architectural state updates in headers
  // Also strip any leading whitespace/junk before the C4 keyword
  fixed = fixed.replace(/[\s\S]*?(C4(Context|Container|Component|Deployment))(_?\w*)?/m, '$1')

  // Fix: Convert "Title: Something" to "title Something"
  fixed = fixed.replace(/^\s*Title:\s*(.*)$/im, 'title $1')

  // Fix: Slashed participants Lambda1/Lambda2/Lambda3->>System 
  // This handles any number of participants separated by slashes
  fixed = fixed.replace(
    /^(\s*)([A-Za-z0-9_.\/]+)([-\>]+)(.+)$/gm,
    (match, indent, participants, arrow, rest) => {
      if (participants.includes('/')) {
        const parts = participants.split('/')
        return parts.map((p: string) => `${indent}${p.trim()}${arrow}${rest}`).join('\n')
      }
      return match
    }
  )
  
  // Fix: Note over with too many participants (Mermaid only supports 2 max)
  fixed = fixed.replace(
    /Note over\s+([^:]+[,\s]*):\s*(.*)/g,
    (match, participants, noteText) => {
      // Clean up participants list
      const cleanParticipants = participants
        .replace(/\s+/g, '')
        .replace(/,+/g, ',')
        .replace(/,$/, '')
      
      // Split participants
      const participantList = cleanParticipants.split(',').filter((p: string) => p)
      
      // If more than 2 participants, split into multiple Note statements
      if (participantList.length > 2) {
        // Create multiple Note statements for each pair or single notes
        const notes: string[] = []
        for (let i = 0; i < participantList.length; i += 2) {
          const pair = participantList.slice(i, i + 2)
          if (pair.length === 2) {
            notes.push(`Note over ${pair[0]},${pair[1]}: ${noteText}`)
          } else {
            notes.push(`Note over ${pair[0]}: ${noteText}`)
          }
        }
        return notes.join('\n    ')
      }
      
      return `Note over ${cleanParticipants}: ${noteText}`
    }
  )
  
  // Fix: Note over with spaces around colon
  fixed = fixed.replace(/Note over\s+([^:]+)\s*:\s*/g, 'Note over $1: ')
  
  // Ensure participant declarations exist for Note over references
  const participantMatches = fixed.matchAll(/participant\s+([A-Za-z_][A-Za-z0-9_]*)/g)
  const declaredParticipants = new Set<string>()
  for (const match of participantMatches) {
    declaredParticipants.add(match[1])
  }
  
  // Add missing participant declarations for Note over references
  const noteOverMatches = fixed.matchAll(/Note over\s+([^:]+):/g)
  for (const match of noteOverMatches) {
    const participants = match[1].split(',').map((p: string) => p.trim()).filter((p: string) => p)
    for (const participant of participants) {
      if (!declaredParticipants.has(participant) && participant) {
        // Add a simple participant declaration
        fixed = `participant ${participant}\n${fixed}`
        declaredParticipants.add(participant)
      }
    }
  }
  
  return fixed
}

export default function Mermaid({ chart, id = 'mermaid-chart' }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [isZoomed, setIsZoomed] = useState(false)
  const [fullSize, setFullSize] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fixedChart, setFixedChart] = useState<string>('')
  const [showFixed, setShowFixed] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [fixAttempted, setFixAttempted] = useState(false)

  const renderDiagram = async (diagramToRender: string, isFixedAttempt = false) => {
    // Reset error at start of any render attempt
    setError(null)
    
    const renderId = `mermaid-${id}-${Math.random().toString(36).substr(2, 9)}`
    
    try {
      // Proactively fix the diagram if this is the first attempt
      let finalDiagram = diagramToRender
      let wasFixed = isFixedAttempt

      if (!isFixedAttempt) {
        const fixed = fixMermaidDiagram(diagramToRender)
        if (fixed !== diagramToRender) {
          finalDiagram = fixed
          wasFixed = true
          setFixedChart(fixed)
        }
      }

      const { svg } = await mermaid.render(renderId, finalDiagram)
      setSvg(svg)
      if (wasFixed) {
        setShowFixed(true)
      }
    } catch (err: any) {
      console.error('Mermaid rendering failed:', err)
      setError(err.message || 'Diagram syntax error')
      
      // If the proactively fixed version still failed, or we didn't fix it yet
      // we already tried our best in the first pass if it was "fixable"
      setFixAttempted(true)
    }
  }

  useEffect(() => {
    if (chart) {
      setFixAttempted(false)
      setShowFixed(false)
      setShowRaw(false)
      renderDiagram(chart)
    }
  }, [chart, id])

  const handleTryFix = () => {
    const fixed = fixMermaidDiagram(chart)
    setFixAttempted(true)
    renderDiagram(fixed, true)
  }

  const handleShowOriginal = () => {
    setShowFixed(false)
    setShowRaw(true)
  }

  const handleShowFixed = () => {
    setShowRaw(false)
    setShowFixed(true)
    if (fixedChart) {
      renderDiagram(fixedChart, true)
    }
  }

  const downloadSVG = () => {
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `diagram-${id}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 rounded-xl text-red-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="font-bold text-sm">Diagram Syntax Issue</p>
            <p className="text-xs text-red-500 opacity-80">Mermaid couldn't parse this diagram</p>
          </div>
        </div>
        
        <div className="text-sm mb-4 max-w-md text-center">
          {error.includes('Expecting') ? (
            <p>There's a syntax error in the diagram. Common issues: multiple participants in one arrow, missing colons in notes, or undeclared participants.</p>
          ) : (
            <p>The diagram contains syntax that Mermaid can't understand.</p>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={handleTryFix}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-all"
          >
            <RefreshCw size={14} />
            Try to Fix Automatically
          </button>
          
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all"
          >
            <Code size={14} />
            {showRaw ? 'Hide' : 'Show'} Raw Diagram
          </button>
          
          {showFixed && (
            <button
              onClick={handleShowFixed}
              className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all"
            >
              <Check size={14} />
              Show Fixed Version
            </button>
          )}
        </div>
        
        {showRaw && (
          <div className="mt-4 p-4 bg-white/70 rounded-lg overflow-auto max-h-[200px] w-full border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Raw Diagram Code</span>
              <span className="text-xs text-slate-400">{chart.length} chars</span>
            </div>
            <pre className="text-xs leading-tight text-slate-600 font-mono whitespace-pre-wrap">{chart}</pre>
          </div>
        )}
        
        {showFixed && fixedChart && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg overflow-auto max-h-[200px] w-full border border-green-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-green-600 uppercase flex items-center gap-1">
                <Check size={10} /> Fixed Version
              </span>
              <span className="text-xs text-green-500">Automatically corrected</span>
            </div>
            <pre className="text-xs leading-tight text-green-700 font-mono whitespace-pre-wrap">{fixedChart}</pre>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="relative w-full group">
        <div 
          ref={containerRef} 
          className="mermaid w-full flex justify-center overflow-auto py-4 cursor-pointer hover:bg-slate-50/50 transition-colors rounded-lg"
          dangerouslySetInnerHTML={{ __html: svg }}
          onClick={() => setIsZoomed(true)}
        />
        <button 
          onClick={() => setIsZoomed(true)}
          className="absolute top-2 right-2 p-2 bg-white/80 hover:bg-white text-slate-500 hover:text-blue-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all border border-slate-100"
          title="Zoom Diagram"
        >
          <ZoomIn size={16} />
        </button>
      </div>

      {isZoomed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 md:p-12 anim-in fade-in zoom-in duration-300">
          <div className="bg-white w-full h-full rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/20">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <ZoomIn size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Diagram Inspection</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Sequence Viewer</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 p-1 rounded-xl mr-4">
                  <button 
                    onClick={() => setFullSize(false)}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                      !fullSize ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Fit Height
                  </button>
                  <button 
                    onClick={() => setFullSize(true)}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                      fullSize ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Full Width
                  </button>
                </div>

                <button 
                  onClick={downloadSVG}
                  className="p-2.5 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded-xl transition-all border border-transparent hover:border-slate-200"
                  title="Download SVG"
                >
                  <Download size={20} />
                </button>
                <div className="w-px h-6 bg-slate-200 mx-1" />
                <button 
                   onClick={() => setIsZoomed(false)}
                   className="p-2.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-[#fcfcfd] overflow-auto relative custom-scrollbar">
               <div 
                 className={cn(
                   "p-12 transition-all duration-500 ease-in-out",
                   fullSize ? "min-w-[150%] lg:min-w-[200%] flex flex-col items-center" : "w-full h-full flex flex-col items-center"
                 )}
               >
                 <div 
                   className={cn(
                     "bg-white p-8 md:p-16 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100",
                     !fullSize ? "max-h-full aspect-auto" : "w-full"
                   )}
                   dangerouslySetInnerHTML={{ __html: svg }} 
                 />
               </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center px-8">
              <p className="text-[10px] text-slate-400 font-medium">Use mouse wheel to scroll • Headers are persistent at top</p>
              <div className="flex items-center gap-2">
                 <span className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Verified View</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
