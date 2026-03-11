"use client"

import React, { useState } from 'react'
import { LayoutDashboard, FileText, Briefcase, ChevronRight, Send, PlusCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Mermaid from '@/components/Mermaid'
import { api } from '@/lib/api'
import { useProject } from '@/contexts/ProjectContext'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'diagrams' | 'summary' | 'workspace'>('diagrams')
  const { project, timestamps, setTimestamps, activeTimestamp, setActiveTimestamp, loading, setProject } = useProject()
  
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [workspaceNotes, setWorkspaceNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [stagedFiles, setStagedFiles] = useState<{name: string, status: 'ingesting' | 'ready' | 'error'}[]>([])
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // Load project-specific notes
  React.useEffect(() => {
    if (project) {
      setWorkspaceNotes(project.working_notes || '')
    }
  }, [project?.id])

  const handleSaveNotes = async () => {
    if (!project) return
    setSavingNotes(true)
    setShowSaved(false)
    try {
      const updatedProject = await api.updateProject(project.id, { working_notes: workspaceNotes })
      setProject({ ...project, ...updatedProject })
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 3000)
    } catch (err) {
      console.error("Save notes failed:", err)
    } finally {
      setSavingNotes(false)
    }
  }

  const handleGenerate = async () => {
    if (!project) return
    setGenerating(true)
    setAnalysisError(null)
    try {
      const context = workspaceNotes || "Analyze the architectural context provided in the uploaded documents."
      const newTs = await api.generateTimestamp(project.id, context)
      setTimestamps([...timestamps, newTs])
      setActiveTimestamp(newTs)
      // Removing automatic tab switch: setActiveTab('diagrams')
      
      // Clear workspace notes on initial success
      if (workspaceNotes && !activeTimestamp) {
          setWorkspaceNotes('')
      }
    } catch (err: any) {
      console.error("Analysis failed:", err)
      setAnalysisError(err.message || "An unexpected error occurred during analysis. Please check your model and token settings.")
    } finally {
      setGenerating(false)
    }
  }

  const handleRefine = async () => {
    if (!activeTimestamp || !chatInput) return
    setRefining(true)
    try {
      const updatedTs = await api.refineTimestamp(activeTimestamp.id, chatInput)
      setTimestamps(timestamps.map(t => t.id === updatedTs.id ? updatedTs : t))
      setActiveTimestamp(updatedTs)
      setChatInput('')
    } catch (err) {
      console.error("Refinement failed:", err)
    } finally {
      setRefining(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !project) return

    const newFileEntry = { name: file.name, status: 'ingesting' as const }
    setStagedFiles(prev => [...prev, newFileEntry])

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const content = event.target?.result as string
        try {
          await api.ingestOnly(project.id, 'local_file', { content })
          setStagedFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'ready' } : f))
        } catch (err) {
          setStagedFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f))
        }
      }
      reader.readAsText(file)
    } catch (err) {
      console.error("Upload failed:", err)
      setStagedFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f))
    }
  }

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const tabs = [
    { id: 'diagrams', label: 'Diagrams', icon: LayoutDashboard },
    { id: 'summary', label: 'Summary & Tasks', icon: FileText },
    { id: 'workspace', label: 'Workspace / Draft', icon: Briefcase },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <Loader2 className="animate-spin mr-2" />
        Loading Dashboard...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Header */}
      <header className="h-16 px-8 flex items-center justify-between bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Projects</span>
          <ChevronRight size={14} className="text-slate-400" />
          <span className="font-semibold text-slate-900">{project?.name || "No Project Selected"}</span>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                activeTab === tab.id 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'diagrams' && (
          <div className="flex-1 p-8 grid grid-cols-2 gap-8 overflow-auto">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">AS-IS Architecture</h3>
              </div>
              <div className="flex-1 bg-slate-50/50 flex items-center justify-center p-8 overflow-auto min-h-[400px]">
                {activeTimestamp?.as_is_diagram ? (
                  <Mermaid chart={activeTimestamp.as_is_diagram} id="as-is-mermaid" />
                ) : (
                  <div className="text-slate-400 text-sm italic font-mono px-12 text-center">
                    No diagram generated. Go to Workspace to provide notes and generate an analysis.
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">TO-BE Architecture</h3>
              </div>
              <div className="flex-1 bg-slate-50/50 flex items-center justify-center p-8 overflow-auto min-h-[400px]">
                {activeTimestamp?.to_be_diagram ? (
                  <Mermaid chart={activeTimestamp.to_be_diagram} id="to-be-mermaid" />
                ) : (
                  <div className="text-slate-400 text-sm italic font-mono px-12 text-center">
                    No diagram generated. Go to Workspace to provide notes and generate an analysis.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="flex-1 p-8 overflow-auto">
            <div className="max-w-5xl mx-auto space-y-8">
              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900 mb-6 font-sans">Architecture Summary: {project?.name}</h2>
                <div className="prose prose-slate max-w-none">
                  <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {activeTimestamp?.architecture_summary || "No summary generated yet."}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Key Outstanding Questions</h3>
                  <div className="space-y-3">
                    {activeTimestamp?.key_questions?.map((q, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="mt-0.5 text-blue-600 font-bold">?</div>
                        <p className="text-sm text-slate-700 font-medium">{q}</p>
                      </div>
                    )) || <div className="text-slate-400 italic text-sm">No questions identified yet.</div>}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Pending Tasks</h3>
                  <div className="space-y-3">
                    {activeTimestamp?.pending_tasks?.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg">
                        <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" />
                        <p className="text-sm text-slate-700">{typeof t === 'string' ? t : JSON.stringify(t)}</p>
                      </div>
                    )) || <div className="text-slate-400 italic text-sm">No tasks identified yet.</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'workspace' && (
          <div className="flex-1 flex overflow-hidden">
             <div className="flex-1 p-8 overflow-auto border-r border-slate-200">
                <div className="max-w-3xl mx-auto space-y-6">
                   <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white p-12 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer group"
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept=".txt,.md,.pdf,.docx"
                      />
                      <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center text-slate-500 group-hover:text-blue-600 mb-4 transition-colors">
                        <PlusCircle size={24} />
                      </div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-blue-700">Add Project Context</h3>
                      <p className="text-sm text-slate-500 mt-1">Select transcripts, docs, or notes to stage for analysis</p>
                   </div>

                   {stagedFiles.length > 0 && (
                     <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden anim-in fade-in slide-in-from-top-2">
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Staged Knowledge</span>
                          <span className="text-xs text-slate-400">{stagedFiles.length} file(s)</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {stagedFiles.map((file, idx) => (
                            <div key={idx} className="p-3 flex items-center justify-between text-sm">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <FileText size={16} className="text-slate-400 flex-shrink-0" />
                                <span className="text-slate-700 truncate font-medium">{file.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {file.status === 'ingesting' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                                {file.status === 'ready' && <div className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 uppercase">Ingested</div>}
                                {file.status === 'error' && <div className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 uppercase">Error</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="p-2 bg-slate-50 border-t border-slate-200 flex justify-end">
                            <button 
                                onClick={() => {
                                    setStagedFiles([]);
                                    setAnalysisError(null);
                                }}
                                className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-tight px-2 py-1"
                            >
                                Clear All
                            </button>
                        </div>
                     </div>
                   )}

                   {analysisError && (
                        <div id="analysis-error-banner" className="bg-red-50 border-2 border-red-200 p-6 rounded-xl text-red-800 flex flex-col gap-2 anim-in fade-in zoom-in">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 shrink-0">
                                    <PlusCircle className="rotate-45" size={18} />
                                </div>
                                <h4 className="font-bold">Analysis Failed</h4>
                            </div>
                            <p className="text-sm font-medium opacity-90 leading-tight">
                                {analysisError}
                            </p>
                            <p className="text-xs mt-2 text-red-600 italic">
                                Please verify your **Model** and **API Key** in Settings.
                            </p>
                        </div>
                   )}
                   
                   {stagedFiles.some(f => f.status === 'ready') && !analysisError && (
                        <div id="knowledge-staged-banner" className="bg-blue-600 p-6 rounded-xl shadow-lg shadow-blue-200 text-white flex items-center justify-between">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shrink-0">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-lg leading-tight text-white">Knowledge Staged</h4>
                                    <p className="text-blue-100 text-sm mt-0.5">Ready to generate architectural insights from your uploads.</p>
                                </div>
                            </div>
                            <button 
                                id="run-analysis-workspace-btn"
                                onClick={handleGenerate}
                                disabled={generating}
                                className="bg-white text-blue-600 font-bold px-8 py-3 rounded-lg hover:bg-blue-50 transition-all flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 whitespace-nowrap"
                            >
                                {generating ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />}
                                {activeTimestamp ? "Update Analysis" : "Run Initial Analysis"}
                            </button>
                        </div>
                   )}

                   {activeTimestamp && !generating && !analysisError && stagedFiles.length > 0 && (
                       <div id="analysis-success-banner" className="bg-green-600 p-6 rounded-xl shadow-lg shadow-green-100 text-white flex items-center justify-between anim-in fade-in slide-in-from-top-4">
                           <div className="flex items-start gap-4">
                               <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shrink-0">
                                   <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-green-600">
                                       <ChevronRight size={14} />
                                   </div>
                               </div>
                               <div>
                                   <h4 className="font-bold text-lg leading-tight">Draft Ready</h4>
                                   <p className="text-green-100 text-sm mt-0.5">The architecture has been updated based on your context.</p>
                               </div>
                           </div>
                           <button 
                               onClick={() => setActiveTab('diagrams')}
                               className="bg-white text-green-600 font-bold px-6 py-2 rounded-lg hover:bg-green-50 transition-all flex items-center gap-2 shadow-sm"
                           >
                               View Diagrams
                               <ChevronRight size={18} />
                           </button>
                       </div>
                   )}
                   
                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700">Manual Working Notes</span>
                        <button 
                          onClick={handleSaveNotes}
                          disabled={savingNotes || !project}
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wider border px-3 py-1 rounded shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5",
                            showSaved 
                              ? "text-green-600 bg-green-50 border-green-200" 
                              : "text-blue-600 bg-white border-slate-200 hover:text-blue-700"
                          )}
                        >
                          {savingNotes ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : showSaved ? (
                            <LayoutDashboard size={10} />
                          ) : (
                            <LayoutDashboard size={10} />
                          )}
                          {savingNotes ? "Saving..." : showSaved ? "Saved!" : "Save Notes"}
                        </button>
                      </div>
                      <textarea 
                        value={workspaceNotes}
                        onChange={(e) => setWorkspaceNotes(e.target.value)}
                        className="flex-1 p-6 text-sm text-slate-700 focus:outline-none min-h-[300px] resize-none"
                        placeholder="Add your own observations or specific constraints here..."
                      />
                   </div>
                </div>
             </div>
             <div className="w-96 flex flex-col bg-white">
                <div className="p-4 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Refinement Chat</h3>
                </div>
                <div className="flex-1 p-4 overflow-auto space-y-4">
                  {(!activeTimestamp?.refinement_history || activeTimestamp.refinement_history.length === 0) ? (
                    <div className="bg-slate-100 rounded-lg p-3 text-sm text-slate-700 max-w-[85%]">
                      {activeTimestamp 
                        ? "I've loaded the current architectural draft. I can refine the diagrams or summary based on your feedback." 
                        : "Once you generate a timestamp, I can help you refine it here."}
                    </div>
                  ) : (
                    activeTimestamp.refinement_history.map((msg, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "rounded-lg p-3 text-sm max-w-[90%] anim-in fade-in slide-in-from-bottom-1",
                          msg.role === 'user' 
                            ? "bg-blue-600 text-white ml-auto" 
                            : "bg-slate-100 text-slate-700 mr-auto"
                        )}
                      >
                        {msg.content}
                      </div>
                    ))
                  )}
                  {refining && (
                    <div className="bg-slate-100 rounded-lg p-3 text-sm text-slate-500 mr-auto flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Refining draft...
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-slate-200 bg-slate-50">
                  <div className="relative">
                    <input 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                      disabled={!activeTimestamp || refining}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                      placeholder="Ask the agent to refine drafts..."
                    />
                    <button 
                      onClick={handleRefine}
                      disabled={!activeTimestamp || refining || !chatInput}
                      className="absolute right-2 top-1.5 p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                    >
                      {refining ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    </button>
                  </div>
                    <button 
                      id="run-analysis-chat-btn"
                      onClick={handleGenerate}
                      disabled={generating}
                      className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-sm shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      {generating && <Loader2 className="animate-spin" size={16} />}
                      {activeTimestamp ? "Generate New Draft" : "Run Initial Analysis"}
                    </button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  )
}
