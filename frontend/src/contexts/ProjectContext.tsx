"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api, Project, Timestamp } from '@/lib/api'

interface ProjectContextType {
  projects: Project[]
  project: Project | null
  setProject: (p: Project | null) => void
  timestamps: Timestamp[]
  setTimestamps: (t: Timestamp[]) => void
  activeTimestamp: Timestamp | null
  setActiveTimestamp: (t: Timestamp | null) => void
  loading: boolean
  profile: any | null
  refreshData: (projectId?: number) => Promise<void>
  switchProject: (projectId: number) => Promise<void>
  renameMilestone: (timestampId: number, newName: string) => Promise<void>
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [timestamps, setTimestamps] = useState<Timestamp[]>([])
  const [activeTimestamp, setActiveTimestamp] = useState<Timestamp | null>(null)
  const [profile, setProfileState] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const refreshData = async (projectId?: number) => {
    console.log("ProjectContext: refreshData called with projectId:", projectId)
    try {
      setLoading(true)
      
      // Fetch profile and projects in parallel
      const [allProjects, allProfiles] = await Promise.all([
        api.getProjects(),
        api.getProfiles()
      ])
      
      setProjects(allProjects)
      if (allProfiles.length > 0) {
        setProfileState(allProfiles[0])
      }

      const targetId = projectId || project?.id || (allProjects.length > 0 ? allProjects[0].id : null)
      console.log("ProjectContext: targetId determined as:", targetId)
      
      if (targetId) {
        try {
          const fullProject = await api.getProject(targetId)
          console.log("ProjectContext: fetched full project:", fullProject.name)
          
          // Reset timestamp related states before setting new ones to prevent data bleed
          setActiveTimestamp(null)
          
          setProject(fullProject)
          setTimestamps(fullProject.timestamps || [])
          
          // Pick the latest timestamp if switching or initializing
          if (fullProject.timestamps && fullProject.timestamps.length > 0) {
            setActiveTimestamp(fullProject.timestamps[fullProject.timestamps.length - 1])
          } else {
            setActiveTimestamp(null)
          }
        } catch (getProjErr) {
          console.error("Failed to fetch full project:", getProjErr)
          // Fallback to first project if the targeted one failed
          if (projectId && allProjects.length > 0 && allProjects[0].id !== projectId) {
             console.log("Retry with first available project")
             const fallbackProject = await api.getProject(allProjects[0].id)
             setProject(fallbackProject)
             setTimestamps(fallbackProject.timestamps || [])
             setActiveTimestamp(fallbackProject.timestamps?.[fallbackProject.timestamps.length - 1] || null)
          }
        }
      }
    } catch (err) {
      console.error("ProjectContext error:", err)
    } finally {
      setLoading(false)
    }
  }

  const switchProject = async (projectId: number) => {
    await refreshData(projectId)
  }

  const renameMilestone = async (timestampId: number, newName: string) => {
    try {
      const updated = await api.renameTimestamp(timestampId, newName)
      setTimestamps(prev => prev.map(t => t.id === timestampId ? updated : t))
      if (activeTimestamp?.id === timestampId) {
        setActiveTimestamp(updated)
      }
    } catch (err) {
      console.error("Failed to rename milestone", err)
    }
  }

  useEffect(() => {
    refreshData()
  }, [])

  return (
    <ProjectContext.Provider value={{ 
      projects,
      project, setProject, 
      timestamps, setTimestamps, 
      activeTimestamp, setActiveTimestamp, 
      loading, profile,
      refreshData,
      switchProject,
      renameMilestone
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}
