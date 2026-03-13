const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Project {
  id: number
  name: string
  description?: string
  working_notes?: string
  preferences?: {
    generate_sequence: boolean;
    generate_c4: boolean;
  }
  created_at: string
}

export interface Timestamp {
  id: number
  project_id: number
  name: string
  as_is_diagram?: string
  to_be_diagram?: string
  c4_context?: string
  c4_container?: string
  c4_component?: string
  architecture_summary?: string
  key_questions?: string[]
  pending_tasks?: any[]
  refinement_history?: { role: string; content: string }[]
  created_at: string
}

export const api = {
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE_URL}/projects`)
    if (!res.ok) throw new Error('Failed to fetch projects')
    return res.json()
  },

  async createProject(name: string, description?: string): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })
    if (!res.ok) throw new Error('Failed to create project')
    return res.json()
  },

  async getProject(id: number): Promise<Project & { timestamps: Timestamp[] }> {
    const res = await fetch(`${API_BASE_URL}/projects/${id}`)
    if (!res.ok) throw new Error('Failed to fetch project')
    return res.json()
  },

  async updateProject(id: number, data: any): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to update project')
    return res.json()
  },

  async updateProjectSettings(id: number, settings: { generate_sequence: boolean; generate_c4: boolean }): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/projects/${id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    if (!res.ok) throw new Error('Failed to update project settings')
    return res.json()
  },

  async generateTimestamp(projectId: number, context: string, name: string = "New Iteration"): Promise<Timestamp> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, name })
    })
    if (!res.ok) throw new Error('Failed to generate timestamp')
    return res.json()
  },

  async refineTimestamp(timestampId: number, feedback: string): Promise<Timestamp> {
    const res = await fetch(`${API_BASE_URL}/timestamps/${timestampId}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback })
    })
    if (!res.ok) throw new Error('Failed to refine timestamp')
    return res.json()
  },

  async renameTimestamp(timestampId: number, name: string): Promise<Timestamp> {
    const res = await fetch(`${API_BASE_URL}/timestamps/${timestampId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    if (!res.ok) throw new Error('Failed to rename timestamp')
    return res.json()
  },

  async ingest(projectId: number, provider: string, metadata: any): Promise<Timestamp> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, metadata })
    })
    if (!res.ok) throw new Error('Failed to ingest and generate')
    return res.json()
  },

  async ingestOnly(projectId: number, provider: string, metadata: any): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/ingest-only`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, metadata })
    })
    if (!res.ok) throw new Error('Failed to ingest context')
    return res.json()
  },

  async getProjectContexts(projectId: number): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/contexts`)
    if (!res.ok) throw new Error('Failed to fetch contexts')
    return res.json()
  },

  async renameProjectContext(projectId: number, docId: string, name: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/contexts/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    if (!res.ok) throw new Error('Failed to rename context')
    return res.json()
  },

  async deleteProjectContext(projectId: number, docId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/contexts/${docId}`, {
      method: 'DELETE'
    })
    if (!res.ok) throw new Error('Failed to delete context')
    return res.json()
  },

  async getProfiles(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/profiles`)
    if (!res.ok) throw new Error('Failed to fetch profiles')
    return res.json()
  },

  async updateProfile(id: number, data: any): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to update profile')
    return res.json()
  },

  async testConnection(llm_model: string, llm_api_key?: string): Promise<{status: string, message: string}> {
    const res = await fetch(`${API_BASE_URL}/profiles/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm_model, llm_api_key })
    })
    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.detail || 'Connection test failed')
    }
    return res.json()
  }
}
