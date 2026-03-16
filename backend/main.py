from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
import uvicorn
import models, schemas
from database import engine, get_db, SessionLocal
from agent import AgentOrchestrator

app = FastAPI(title="Solution Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    models.Base.metadata.create_all(bind=engine)
    # Ensure default profile exists
    db = SessionLocal()
    try:
        if not db.query(models.Profile).first():
            default_profile = models.Profile(
                name="Ondřej Svoboda", 
                company_context="Scientific Data Architect. Focus on cloud-native Research & Development solutions, data orchestration, and lab instrument integration with a preference for standardized vocabularies like CENTree.",
                llm_model="gemini/gemini-1.5-flash"
            )
            db.add(default_profile)
            db.commit()
    finally:
        db.close()

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "0.2.0"}

# --- Profile Routes ---

@app.post("/profiles", response_model=schemas.Profile)
def create_profile(profile: schemas.ProfileCreate, db: Session = Depends(get_db)):
    db_profile = models.Profile(
        name=profile.name, 
        company_context=profile.company_context,
        llm_model=profile.llm_model,
        llm_api_key=profile.llm_api_key
    )
    db.add(db_profile)
    try:
        db.commit()
        db.refresh(db_profile)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Profile with this name already exists or invalid data.")
    return db_profile

@app.put("/profiles/{profile_id}", response_model=schemas.Profile)
def update_profile(profile_id: int, profile: schemas.ProfileUpdate, db: Session = Depends(get_db)):
    db_profile = db.query(models.Profile).filter(models.Profile.id == profile_id).first()
    if not db_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    update_data = profile.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_profile, key, value)
    
    db.commit()
    db.refresh(db_profile)
    return db_profile

@app.get("/profiles", response_model=List[schemas.Profile])
def read_profiles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Profile).offset(skip).limit(limit).all()

@app.get("/profiles/{profile_id}", response_model=schemas.Profile)
def read_profile(profile_id: int, db: Session = Depends(get_db)):
    db_profile = db.query(models.Profile).filter(models.Profile.id == profile_id).first()
    if not db_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return db_profile

@app.post("/profiles/test-connection")
async def test_profile_connection(request: schemas.TestConnectionRequest):
    from llm_manager import LLMManager
    llm = LLMManager()
    try:
        await llm.test_connection(request.llm_model, request.llm_api_key)
        return {"status": "success", "message": "Connection verified successfully!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Project Routes ---

@app.post("/projects", response_model=schemas.Project)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    db_project = models.Project(
        name=project.name, 
        description=project.description,
        working_notes=project.working_notes
    )
    db.add(db_project)
    try:
        db.commit()
        db.refresh(db_project)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A project with this name already exists.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Invalid data or database error: {str(e)}")
    return db_project

@app.get("/projects", response_model=List[schemas.Project])
def read_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Project).offset(skip).limit(limit).all()

@app.get("/projects/{project_id}", response_model=schemas.Project)
def read_project(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    return db_project

@app.put("/projects/{project_id}", response_model=schemas.Project)
def update_project(project_id: int, project: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = project.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)
    
    db.commit()
    db.refresh(db_project)
    return db_project

@app.patch("/projects/{project_id}/settings", response_model=schemas.Project)
def update_project_settings(project_id: int, settings: schemas.ProjectSettingsUpdate, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db_project.preferences = {
        "generate_sequence": settings.generate_sequence,
        "generate_c4": settings.generate_c4
    }
    
    db.commit()
    db.refresh(db_project)
    return db_project

# --- Timestamp & Agent Routes ---

@app.post("/projects/{project_id}/ingest")
async def ingest_and_generate(
    project_id: int, 
    request: schemas.IngestRequest, 
    db: Session = Depends(get_db)
):
    # This route NO LONGER generates a timestamp. It only ingests.
    # The frontend should be updated to no longer expect a schema.Timestamp back.
    orchestrator = AgentOrchestrator(db)
    try:
        doc_id = await orchestrator.ingest_only(project_id, request.provider, request.metadata)
        return {"status": "success", "document_id": doc_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion Error: {str(e)}")

@app.post("/projects/{project_id}/ingest-only")
async def ingest_only(
    project_id: int,
    request: schemas.IngestRequest,
    db: Session = Depends(get_db)
):
    orchestrator = AgentOrchestrator(db)
    try:
        doc_id = await orchestrator.ingest_only(project_id, request.provider, request.metadata)
        return {"status": "success", "document_id": doc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion Error: {str(e)}")

@app.get("/projects/{project_id}/contexts")
async def get_project_contexts(project_id: int, db: Session = Depends(get_db)):
    orchestrator = AgentOrchestrator(db)
    try:
        contexts = await orchestrator.get_project_contexts(project_id)
        return contexts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/projects/{project_id}/contexts/{doc_id}")
async def rename_project_context(project_id: int, doc_id: str, request: schemas.ContextRenameRequest, db: Session = Depends(get_db)):
    orchestrator = AgentOrchestrator(db)
    try:
        await orchestrator.rename_project_context(project_id, doc_id, request.name)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/projects/{project_id}/contexts/{doc_id}")
async def delete_project_context(project_id: int, doc_id: str, db: Session = Depends(get_db)):
    orchestrator = AgentOrchestrator(db)
    try:
        await orchestrator.delete_project_context(project_id, doc_id)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/projects/{project_id}/chat", response_model=schemas.ContextChatResponse)
async def context_chat(
    project_id: int,
    request: schemas.ContextChatRequest,
    db: Session = Depends(get_db)
):
    orchestrator = AgentOrchestrator(db)
    try:
        result = await orchestrator.context_chat(
            project_id=project_id,
            question=request.question,
            history=[m.model_dump() for m in request.history]
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Context Chat Error: {str(e)}")

@app.post("/projects/{project_id}/generate", response_model=schemas.Timestamp)
async def generate_timestamp(
    project_id: int, 
    request: schemas.GenerateTimestampRequest, 
    db: Session = Depends(get_db)
):
    orchestrator = AgentOrchestrator(db)
    try:
        new_ts = await orchestrator.create_new_timestamp(project_id, request.context, request.name)
        return new_ts
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent Error: {str(e)}")

@app.put("/timestamps/{timestamp_id}", response_model=schemas.Timestamp)
def update_timestamp_name(
    timestamp_id: int, 
    request: schemas.TimestampRenameRequest, 
    db: Session = Depends(get_db)
):
    ts = db.query(models.Timestamp).filter(models.Timestamp.id == timestamp_id).first()
    if not ts:
        raise HTTPException(status_code=404, detail="Timestamp not found")
    
    ts.name = request.name
    db.commit()
    db.refresh(ts)
    return ts

@app.post("/timestamps/{timestamp_id}/refine", response_model=schemas.Timestamp)
async def refine_timestamp(
    timestamp_id: int,
    request: schemas.ChatRefinementRequest,
    db: Session = Depends(get_db)
):
    orchestrator = AgentOrchestrator(db)
    try:
        updated_ts = await orchestrator.handle_refinement(timestamp_id, request.feedback)
        return updated_ts
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
