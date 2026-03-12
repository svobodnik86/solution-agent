from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any, Dict
from datetime import datetime

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    working_notes: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    working_notes: Optional[str] = None

class TimestampBase(BaseModel):
    project_id: int
    name: str = "New Iteration"
    as_is_diagram: Optional[str] = None
    to_be_diagram: Optional[str] = None
    architecture_summary: Optional[str] = None
    key_questions: Optional[List[str]] = None
    pending_tasks: Optional[List[Any]] = None
    refinement_history: Optional[List[Dict[str, str]]] = None

class Timestamp(TimestampBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    created_at: datetime

class Project(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    timestamps: List[Timestamp] = []

class IngestRequest(BaseModel):
    provider: str
    metadata: Dict[str, Any]

class GenerateTimestampRequest(BaseModel):
    context: str
    name: str = "New Iteration"

class TimestampRenameRequest(BaseModel):
    name: str

class ContextRenameRequest(BaseModel):
    name: str

class ChatRefinementRequest(BaseModel):
    feedback: str

class ProfileBase(BaseModel):
    name: str = "Default Profile"
    company_context: Optional[str] = None
    llm_model: str = "gemini/gemini-1.5-flash"
    llm_api_key: Optional[str] = None

class ProfileCreate(ProfileBase):
    pass

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    company_context: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key: Optional[str] = None

class Profile(ProfileBase):
    id: int
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TestConnectionRequest(BaseModel):
    llm_model: str
    llm_api_key: Optional[str] = None
