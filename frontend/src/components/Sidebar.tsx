"use client"

import React, { useState } from 'react'
import { PlusCircle, MessageSquare, Settings, LayoutDashboard, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/contexts/ProjectContext'
import { format } from 'date-fns'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NewProjectModal } from './NewProjectModal'
import AppIcon from './AppIcon'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const { projects, project, switchProject, timestamps, activeTimestamp, setActiveTimestamp, loading, profile } = useProject()
  const pathname = usePathname()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isProjectListOpen, setIsProjectListOpen] = useState(false)

  const isSettings = pathname === '/settings'
  const isDashboard = pathname === '/'

  return (
    <aside className={cn("flex flex-col w-72 bg-slate-50 border-r border-slate-200 h-screen shrink-0", className)}>
      <div className="p-6">
        <Link href="/" className="text-xl font-bold text-slate-900 flex items-center gap-3 group">
          <AppIcon size={36} className="group-hover:scale-105 transition-transform duration-300 shadow-sm" />
          <span className="tracking-tight">Solution Agent</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
        <div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors shadow-md active:scale-[0.98]"
          >
            <PlusCircle size={18} />
            New Project
          </button>
        </div>

        <nav className="space-y-1">
          <Link 
            href="/"
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all",
              isDashboard ? "text-blue-600 bg-white shadow-sm border border-slate-200" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <LayoutDashboard size={18} />
            Dashboard
          </Link>
          <Link 
            href="/settings"
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all",
              isSettings ? "text-blue-600 bg-white shadow-sm border border-slate-200" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Settings size={18} />
            Settings
          </Link>
        </nav>

        {/* Project Selector */}
        <div>
           <button 
             onClick={() => setIsProjectListOpen(!isProjectListOpen)}
             className="w-full flex items-center justify-between px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider group"
           >
             Active Projects
             <ChevronDown size={14} className={cn("transition-transform", isProjectListOpen && "rotate-180")} />
           </button>
           {isProjectListOpen && (
             <div className="space-y-1 mt-1 mb-4 overflow-hidden animate-in slide-in-from-top-2 duration-200">
               {projects.map(p => (
                 <button
                   key={p.id}
                   onClick={() => switchProject(p.id)}
                   className={cn(
                     "w-full text-left px-3 py-2 text-xs rounded-md transition-all",
                     project?.id === p.id ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-600 hover:bg-slate-100"
                   )}
                 >
                   {p.name}
                 </button>
               ))}
             </div>
           )}
        </div>

        {isDashboard && (
          <div>
            <h2 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project Timeline</h2>
            {loading ? (
              <div className="flex items-center justify-center py-4 text-slate-400">
                <Loader2 className="animate-spin size-4 mr-2" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : (
              <div className="relative pl-3 space-y-4">
                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-200" />
                {timestamps.map((ts) => (
                  <div 
                    key={ts.id} 
                    className="relative pl-8 group cursor-pointer"
                    onClick={() => setActiveTimestamp(ts)}
                  >
                    <div className={cn(
                      "absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-white ring-2 transition-all z-10",
                      activeTimestamp?.id === ts.id ? "bg-blue-600 ring-blue-100" : "bg-slate-300 ring-transparent group-hover:bg-slate-400"
                    )} />
                    <div className={cn(
                      "p-2 rounded-lg transition-all",
                      activeTimestamp?.id === ts.id ? "bg-white shadow-sm border border-slate-200" : "hover:bg-slate-100"
                    )}>
                      <p className={cn("text-sm font-semibold truncate", activeTimestamp?.id === ts.id ? "text-slate-900" : "text-slate-700")}>
                        Iteration {ts.id}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {ts.created_at ? format(new Date(ts.created_at), 'MMM d, h:mm a') : 'Recent'}
                      </p>
                    </div>
                  </div>
                ))}
                {timestamps.length === 0 && (
                  <div className="pl-8 text-xs text-slate-400 italic">No iterations yet.</div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
           <h2 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Chats</h2>
           <div className="space-y-1">
             <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-all">
               <MessageSquare size={16} />
               Solution Draft
             </div>
           </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white transition-all cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 border border-blue-200 uppercase">
            {profile?.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2) || 'SA'}
          </div>
          <div className="flex-1 overflow-hidden text-left">
            <p className="text-sm font-semibold text-slate-900 truncate">{profile?.name || 'Loading...'}</p>
            <p className="text-xs text-slate-500 truncate">
                {profile?.company_context?.split('.')[0] || 'Solution Architect'}
            </p>
          </div>
        </div>
      </div>

      <NewProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </aside>
  )
}
