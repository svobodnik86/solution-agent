"use client"

import React, { useState } from 'react'
import { LayoutDashboard, FileText, Briefcase, ChevronRight, Send, PlusCircle, Loader2, Check, Trash2, Edit2, Save, X, Eye, Settings, BookOpen, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import Mermaid from '@/components/Mermaid'
import { api } from '@/lib/api'
import { useProject } from '@/contexts/ProjectContext'
import { ContextChat } from '@/components/ContextChat'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'diagrams' | 'summary' | 'workspace' | 'project-config'>('diagrams')
  const { project, timestamps, setTimestamps, activeTimestamp, setActiveTimestamp, loading, setProject } = useProject()
  const [chatMode, setChatMode] = useState<'refinement' | 'context'>('refinement')
  
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [workspaceNotes, setWorkspaceNotes] = useState('')
  const [workspaceNotesTitle, setWorkspaceNotesTitle] = useState('Manual Note')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [stagedFiles, setStagedFiles] = useState<{name: string, status: 'ingesting' | 'ready' | 'error'}[]>([]) // Keep for upload progress only
  const [projectContexts, setProjectContexts] = useState<any[]>([])
  const [viewingContext, setViewingContext] = useState<any | null>(null)
  const [editingContextId, setEditingContextId] = useState<string | null>(null)
  const [editingContextName, setEditingContextName] = useState('')
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  
  const [viewMode, setViewMode] = useState<'behavioral' | 'structural'>('behavioral')
  const [c4Level, setC4Level] = useState<'context' | 'container' | 'component'>('context')
  const [prefSequence, setPrefSequence] = useState(true)
  const [prefC4, setPrefC4] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  const fetchContexts = React.useCallback(async () => {
    if (!project) return
    try {
      const contexts = await api.getProjectContexts(project.id)
      setProjectContexts(contexts)
    } catch (err) {
      console.error("Failed to fetch contexts", err)
    }
  }, [project?.id])

  React.useEffect(() => {
    fetchContexts()
  }, [fetchContexts])

  // Load project-specific notes and settings
  React.useEffect(() => {
    if (project) {
      setWorkspaceNotes(project.working_notes || '')
      setPrefSequence(project.preferences?.generate_sequence ?? true)
      setPrefC4(project.preferences?.generate_c4 ?? false)
    }
  }, [project])

  const handleIngestNotes = async () => {
    if (!project || !workspaceNotes.trim()) return
    setSavingNotes(true)
    try {
      await api.ingestOnly(project.id, 'manual_notes', { content: workspaceNotes, name: workspaceNotesTitle })
      setWorkspaceNotes('')
      setWorkspaceNotesTitle('Manual Note')
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 3000)
      fetchContexts()
    } catch (err) {
      console.error("Ingest notes failed:", err)
    } finally {
      setSavingNotes(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!project) return;
    setSavingSettings(true)
    try {
      const updated = await api.updateProjectSettings(project.id, { generate_sequence: prefSequence, generate_c4: prefC4 })
      setProject(updated)
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 3000)
    } catch (err) {
      console.error(err)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleGenerate = async () => {
    if (!project) return
    setGenerating(true)
    setAnalysisError(null)
    try {
      const context = workspaceNotes || "Analyze the architectural context provided in the uploaded documents."
      const newTs = await api.generateTimestamp(project.id, context, "New Milestone")
      setTimestamps([...timestamps, newTs])
      setActiveTimestamp(newTs)
      
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
          await api.ingestOnly(project.id, 'local_file', { content, name: file.name })
          setStagedFiles(prev => prev.filter(f => f.name !== file.name))
          fetchContexts()
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
    { id: 'project-config', label: 'Project Config', icon: Settings },
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
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto flex flex-col">
        {activeTab === 'diagrams' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex flex-col border-b border-slate-200 bg-white shrink-0">
                <div className="p-4 flex items-center justify-center relative">
                    <div className="bg-slate-100 p-1 rounded-full flex mx-auto">
                        <button 
                            onClick={() => setViewMode('behavioral')}
                            className={cn("px-6 py-2 rounded-full text-sm font-bold transition-all", viewMode === 'behavioral' ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
                        >
                            Behavioral (Sequence)
                        </button>
                        <button 
                            onClick={() => setViewMode('structural')}
                            className={cn("px-6 py-2 rounded-full text-sm font-bold transition-all", viewMode === 'structural' ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
                        >
                            Structural (C4 Map)
                        </button>
                    </div>
                </div>

                {viewMode === 'structural' ? (
                <div className="px-4 py-2 bg-slate-50 flex items-center justify-center gap-2 border-t border-slate-200 shadow-inner anim-in fade-in slide-in-from-top-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Depth:</span>
                    {['context', 'container', 'component'].map(level => (
                        <button 
                            key={level}
                            onClick={() => setC4Level(level as any)}
                            className={cn("px-4 py-1.5 rounded-md text-sm font-semibold transition-colors border", c4Level === level ? "bg-white border-slate-300 text-slate-800 shadow-sm" : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800")}
                        >
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                    ))}
                </div>
                ) : null}
            </div>

            {viewMode === 'behavioral' ? (
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
            ) : (
              <div className="flex-1 p-8 overflow-auto flex flex-col">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-[600px]">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                          <h3 className="font-semibold text-slate-900">
                              C4 Architecture - System {c4Level.charAt(0).toUpperCase() + c4Level.slice(1)}
                          </h3>
                      </div>
                      <div className="flex-1 bg-white flex flex-col p-8 overflow-auto relative">
                          {activeTimestamp ? (
                              activeTimestamp[`c4_${c4Level}` as keyof typeof activeTimestamp] ? (
                                  <Mermaid chart={activeTimestamp[`c4_${c4Level}` as keyof typeof activeTimestamp] as string} id={`c4-${c4Level}-mermaid`} />
                              ) : (
                                  <div className="absolute inset-0 flex items-center justify-center flex-col text-slate-400 bg-slate-50/50">
                                      <p className="font-medium text-lg text-slate-500 mb-2">No C4 Diagram</p>
                                      <p className="text-sm max-w-md text-center">
                                          This generated milestone doesn't include C4 output. Make sure <strong>Structural C4 Maps</strong> are enabled in <strong>Project Settings</strong> and then run a new generation.
                                      </p>
                                  </div>
                              )
                          ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm italic font-mono px-12 text-center bg-slate-50/50">
                                  No diagram generated yet.
                              </div>
                          )}
                      </div>
                  </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="flex-1 p-8 overflow-auto">
            <div className="max-w-5xl mx-auto space-y-8">
              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900 mb-6 font-sans">Architecture Summary: {project?.name}</h2>
                <div className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-p:leading-relaxed">
                  {activeTimestamp?.architecture_summary ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeTimestamp.architecture_summary}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-slate-500 italic">No summary generated yet.</p>
                  )}
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
                      <p className="text-sm text-slate-500 mt-1">Select transcripts, docs, or notes to stage in the vector database</p>
                   </div>

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
                   
                   {activeTimestamp && !generating && !analysisError && projectContexts.length > 0 && (
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
                         <input 
                           value={workspaceNotesTitle}
                           onChange={(e) => setWorkspaceNotesTitle(e.target.value)}
                           className="text-sm font-semibold text-slate-900 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 -ml-1 border-transparent focus:bg-white"
                           placeholder="Manual Note Title"
                         />
                         <button 
                           onClick={handleIngestNotes}
                           disabled={savingNotes || !project || !workspaceNotes.trim()}
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
                             <Check size={10} />
                           ) : (
                             <PlusCircle size={10} />
                           )}
                           {savingNotes ? "Adding..." : showSaved ? "Added!" : "Add"}
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
              
              {/* Right Sidebar - Project Contexts */}
              <div className="w-96 flex flex-col bg-slate-50 relative shrink-0">
                 <div className="p-4 border-b border-slate-200 bg-white shadow-sm z-10 flex items-center justify-between">
                   <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                     <Briefcase size={16} className="text-blue-600" />
                     Project Contexts
                   </h3>
                   <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{projectContexts.length + stagedFiles.length}</span>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
                    {projectContexts.length === 0 && stagedFiles.length === 0 ? (
                        <div className="text-slate-400 text-sm italic text-center mt-10 p-4">
                            No context added yet. Upload files or save notes to start building your project's knowledge base.
                        </div>
                    ) : (
                        <>
                          {projectContexts.map((ctx) => (
                            <div key={ctx.id} className="p-3 bg-white mb-2 rounded border border-slate-200 flex flex-col gap-2 text-sm group transition-all hover:border-blue-300">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-2 overflow-hidden flex-1">
                                  <FileText size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                                  {editingContextId === ctx.id ? (
                                      <div className="flex flex-col gap-2 flex-1 mr-2">
                                          <input
                                              value={editingContextName}
                                              onChange={e => setEditingContextName(e.target.value)}
                                              className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                              autoFocus
                                              onKeyDown={async (e) => {
                                                  if (e.key === 'Enter') {
                                                      try {
                                                          await api.renameProjectContext(project!.id, ctx.id, editingContextName)
                                                          setEditingContextId(null)
                                                          fetchContexts()
                                                      } catch (e) { console.error(e) }
                                                  }
                                                  if (e.key === 'Escape') setEditingContextId(null)
                                              }}
                                          />
                                          <div className="flex justify-end gap-2">
                                              <button onClick={async () => {
                                                  try {
                                                      await api.renameProjectContext(project!.id, ctx.id, editingContextName)
                                                      setEditingContextId(null)
                                                      fetchContexts()
                                                  } catch (e) { console.error(e) }
                                              }} className="text-xs text-white bg-green-600 hover:bg-green-700 px-2 py-1 rounded flex items-center gap-1"><Save size={12}/> Save</button>
                                              <button onClick={() => setEditingContextId(null)} className="text-xs text-slate-600 bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded flex items-center gap-1"><X size={12}/> Cancel</button>
                                          </div>
                                      </div>
                                  ) : (
                                      <div className="flex flex-col overflow-hidden">
                                          <span className="text-slate-800 font-semibold">{ctx.name}</span>
                                          <span className="text-[11px] text-slate-400 mt-0.5">{new Date(ctx.timestamp).toLocaleString()} &bull; {ctx.provider}</span>
                                      </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                <div className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 uppercase inline-block">Stored</div>
                                {editingContextId !== ctx.id && (
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setViewingContext(ctx)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1 text-xs"><Eye size={12}/> View</button>
                                        <button onClick={() => { setEditingContextId(ctx.id); setEditingContextName(ctx.name); }} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={12}/></button>
                                        <button onClick={async () => {
                                            try {
                                                await api.deleteProjectContext(project!.id, ctx.id)
                                                fetchContexts()
                                            } catch(e) { console.error(e) }
                                        }} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={12}/></button>
                                    </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {stagedFiles.map((file, idx) => (
                            <div key={`staged-${idx}`} className="p-3 bg-white mb-2 rounded border border-slate-200 flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <FileText size={16} className="text-slate-400 flex-shrink-0" />
                                <span className="text-slate-700 truncate font-medium">{file.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {file.status === 'ingesting' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                                {file.status === 'error' && <div className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 uppercase">Error</div>}
                              </div>
                            </div>
                          ))}
                        </>
                    )}
                 </div>
                 
                 <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] z-10 flex flex-col gap-3">
                    {projectContexts.length > 0 && (
                        <div className="flex justify-end">
                            <button 
                                onClick={async () => {
                                    if (!project) return;
                                    for (const ctx of projectContexts) {
                                        await api.deleteProjectContext(project.id, ctx.id);
                                    }
                                    fetchContexts();
                                    setStagedFiles([]);
                                    setAnalysisError(null);
                                }}
                                className="text-[10px] font-bold text-slate-400 hover:text-red-600 uppercase tracking-tight flex items-center gap-1 transition-colors"
                            >
                                <Trash2 size={10} /> Clear All
                            </button>
                        </div>
                    )}
                    <button 
                        id="run-analysis-workspace-btn"
                        onClick={handleGenerate}
                        disabled={generating || (projectContexts.length === 0 && stagedFiles.length === 0)}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold py-3 rounded-lg text-sm shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        {generating && <Loader2 className="animate-spin" size={16} />}
                        <PlusCircle size={16} />
                        Generate Milestone
                    </button>
                 </div>
              </div>
          </div>
        )}
        {activeTab === 'project-config' && (
          <div className="flex-1 overflow-auto p-12 bg-slate-50">
            <div className="max-w-4xl mx-auto space-y-10">
                <section className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden anim-in fade-in slide-in-from-bottom-4">
                    <div className="px-6 py-4 border-b border-blue-100 bg-blue-50/50 flex items-center gap-2">
                        <Settings className="text-blue-600" size={18} />
                        <h2 className="text-lg font-bold text-blue-900">Project Configuration</h2>
                    </div>
                    
                    <div className="p-6">
                        <p className="text-sm text-slate-500 mb-6">Select which diagram formats the Solution Agent should generate when defining architectural milestones. Generating more formats gives deeper insight but may take slightly longer.</p>
                        
                        <div className="space-y-4">
                            {/* Sequence */}
                            <div className="flex items-start justify-between p-4 rounded-lg border-2 border-slate-200 bg-white hover:border-slate-300 transition-colors">
                                <div className="flex gap-4">
                                    <div className="mt-1 w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100 text-indigo-600">
                                        <LayoutDashboard size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">Behavioral: Sequence Diagrams</h3>
                                        <p className="text-sm text-slate-500 mt-1">Visualize workflows over time. Generates side-by-side AS-IS and TO-BE flows.</p>
                                    </div>
                                </div>
                                <div className="ml-4 pt-2">
                                    <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                        <input type="checkbox" checked={prefSequence} onChange={() => setPrefSequence(!prefSequence)} className="absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" style={{ right: prefSequence ? 0 : '1.5rem', borderColor: prefSequence ? '#2563eb' : '#e2e8f0', transition: 'all 0.3s' }}/>
                                        <label className="block overflow-hidden h-6 rounded-full cursor-pointer" style={{ backgroundColor: prefSequence ? '#2563eb' : '#cbd5e1', transition: 'all 0.3s' }} onClick={() => setPrefSequence(!prefSequence)}></label>
                                    </div>
                                </div>
                            </div>
                            
                            {/* C4 Map */}
                            <div className="flex items-start justify-between p-4 rounded-lg border-2 border-slate-200 bg-white hover:border-slate-300 transition-colors">
                                <div className="flex gap-4">
                                    <div className="mt-1 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100 text-blue-600">
                                        <Briefcase size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">Structural: C4 Architecture Maps</h3>
                                        <p className="text-sm text-slate-500 mt-1">Visualize structural boundaries. Generates interactive drill-down maps spanning Context, Container, and Component levels.</p>
                                    </div>
                                </div>
                                <div className="ml-4 pt-2">
                                    <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                        <input type="checkbox" checked={prefC4} onChange={() => setPrefC4(!prefC4)} className="absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" style={{ right: prefC4 ? 0 : '1.5rem', borderColor: prefC4 ? '#2563eb' : '#e2e8f0', transition: 'all 0.3s' }}/>
                                        <label className="block overflow-hidden h-6 rounded-full cursor-pointer" style={{ backgroundColor: prefC4 ? '#2563eb' : '#cbd5e1', transition: 'all 0.3s' }} onClick={() => setPrefC4(!prefC4)}></label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
                    {showSaved && <span className="text-green-600 text-sm font-bold flex items-center mr-4">Preferences Saved!</span>}
                    <button onClick={handleSaveSettings} disabled={savingSettings} className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50">
                        {savingSettings ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                        Save Settings
                    </button>
                </div>
            </div>
          </div>
        )}
        </div>

        {/* Right-hand Chat Panel — visible on Diagrams and Summary tabs */}
        {(activeTab === 'diagrams' || activeTab === 'summary') && (
           <div className="w-96 flex flex-col bg-white border-l border-slate-200">
              {/* Mode toggle header */}
              <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                <button
                  onClick={() => setChatMode('refinement')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all",
                    chatMode === 'refinement'
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  <Send size={11} /> Refinement
                </button>
                <button
                  onClick={() => setChatMode('context')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all",
                    chatMode === 'context'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  <BookOpen size={11} /> Context Q&A
                </button>
              </div>

              {chatMode === 'context' ? (
                <div className="flex-1 overflow-hidden">
                  {project ? (
                    <ContextChat
                      projectId={project.id}
                      onSourceClick={(src) => {
                        if (src.provider !== 'web_url') {
                          // Open context viewer for non-URL sources
                          setViewingContext({ ...src, content: '' })
                        } else {
                          window.open(src.name, '_blank')
                        }
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a project first</div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex-1 p-4 overflow-auto space-y-4">
                    {(!activeTimestamp?.refinement_history || activeTimestamp.refinement_history.length === 0) ? (
                      <div className="bg-slate-100 rounded-lg p-3 text-sm text-slate-700 max-w-[85%]">
                        {activeTimestamp 
                          ? "I've loaded the current architectural draft. I can refine the diagrams or summary based on your feedback." 
                          : "Once you generate a milestone, I can help you refine it here."}
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
                  </div>
                </>
              )}
           </div>
        )}
      </div>

      {/* Context Viewer Modal */}
      {viewingContext && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-full flex flex-col overflow-hidden anim-in zoom-in fade-in">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 leading-tight">{viewingContext.name}</h3>
                  <p className="text-xs text-slate-500">
                    {new Date(viewingContext.timestamp).toLocaleString()} &bull; {viewingContext.provider}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setViewingContext(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-white whitespace-pre-wrap font-mono text-sm text-slate-700 bg-slate-50/50">
              {viewingContext.content || "No content context available."}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
