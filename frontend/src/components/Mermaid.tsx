"use client"

import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { ZoomIn, X, Download } from 'lucide-react'
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

export default function Mermaid({ chart, id = 'mermaid-chart' }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [isZoomed, setIsZoomed] = useState(false)
  const [fullSize, setFullSize] = useState(true)
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
