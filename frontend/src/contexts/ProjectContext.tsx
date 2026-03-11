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
  refreshData: (projectId?: number) => Promise<void>
  switchProject: (projectId: number) => Promise<void>
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [timestamps, setTimestamps] = useState<Timestamp[]>([])
  const [activeTimestamp, setActiveTimestamp] = useState<Timestamp | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshData = async (projectId?: number) => {
    try {
      setLoading(true)
      const allProjects = await api.getProjects()
      setProjects(allProjects)

      const targetId = projectId || project?.id || (allProjects.length > 0 ? allProjects[0].id : null)
      
      if (targetId) {
        const fullProject = await api.getProject(targetId)
        setProject(fullProject)
        setTimestamps(fullProject.timestamps)
        // If switching or initializing, pick the latest timestamp
        if (fullProject.timestamps.length > 0) {
          setActiveTimestamp(fullProject.timestamps[fullProject.timestamps.length - 1])
        } else {
          setActiveTimestamp(null)
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

  useEffect(() => {
    refreshData()
  }, [])

  return (
    <ProjectContext.Provider value={{ 
      projects,
      project, setProject, 
      timestamps, setTimestamps, 
      activeTimestamp, setActiveTimestamp, 
      loading, refreshData,
      switchProject
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
