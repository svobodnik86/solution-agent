import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base, get_db
from main import app
import json
from unittest.mock import patch, MagicMock

# Setup test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_api.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

client = TestClient(app)

def test_project_lifecycle():
    # 1. Create Project
    response = client.post("/projects", json={"name": "Test Project", "description": "Desc"})
    assert response.status_code == 200
    project_id = response.json()["id"]
    assert response.json()["name"] == "Test Project"

    # 2. Get Projects
    response = client.get("/projects")
    assert len(response.json()) >= 1

    # 3. Get Single Project
    response = client.get(f"/projects/{project_id}")
    assert response.json()["id"] == project_id

@pytest.mark.asyncio
async def test_generate_timestamp_success():
    # Create project first
    resp = client.post("/projects", json={"name": "Generate TS Project"})
    project_id = resp.json()["id"]

    mock_llm_output = {
        "as_is_diagram": "seq1",
        "to_be_diagram": "seq2",
        "architecture_summary": "Summary",
        "key_questions": ["Q?"],
        "pending_tasks": ["T1"]
    }

    # Mock AgentOrchestrator's LLM call
    with patch('agent.LLMManager.generate_architecture_snapshot', return_value=mock_llm_output):
        response = client.post(f"/projects/{project_id}/generate", json={"context": "Meeting notes"})
        assert response.status_code == 200
        data = response.json()
        assert data["as_is_diagram"] == "seq1"
        assert data["project_id"] == project_id

@pytest.mark.asyncio
async def test_ingest_and_generate_success():
    resp = client.post("/projects", json={"name": "Ingest Project"})
    project_id = resp.json()["id"]

    mock_llm_output = {
        "as_is_diagram": "ingest_as_is",
        "to_be_diagram": "ingest_to_be",
        "architecture_summary": "Ingest Summary",
        "key_questions": [],
        "pending_tasks": []
    }

    # Mock Ingestion, VectorStore, and LLM
    with patch('agent.IngestionManager.get_context', return_value="Raw file content"):
        with patch('agent.VectorStore.add_documents', return_value=None):
            with patch('agent.LLMManager.generate_architecture_snapshot', return_value=mock_llm_output):
                response = client.post(
                    f"/projects/{project_id}/ingest", 
                    json={"provider": "local_file", "metadata": {"content": "Raw content"}}
                )
                assert response.status_code == 200
                assert response.json()["architecture_summary"] == "Ingest Summary"

def test_profile_lifecycle():
    # 1. Ensure default profile was created (startup logic)
    # Note: Startup events don't naturally trigger with TestClient unless using lifespan, 
    # but we can check if it exists or create one.
    response = client.get("/profiles")
    assert response.status_code == 200
    
    # If no profile exists, create one
    if len(response.json()) == 0:
        response = client.post("/profiles", json={
            "name": "Integration Profile",
            "company_context": "Initial Context"
        })
        assert response.status_code == 200
        profile_id = response.json()["id"]
    else:
        profile_id = response.json()[0]["id"]

    # 2. Update Profile
    update_data = {
        "company_context": "Updated Company Context",
        "llm_model": "gemini/gemini-2.0-flash",
        "llm_api_key": "test_token"
    }
    response = client.put(f"/profiles/{profile_id}", json=update_data)
    assert response.status_code == 200
    updated_profile = response.json()
    assert updated_profile["company_context"] == "Updated Company Context"
    assert updated_profile["llm_model"] == "gemini/gemini-2.0-flash"
    assert updated_profile["llm_api_key"] == "test_token"

    # 3. Verify via GET
    response = client.get(f"/profiles/{profile_id}")
    assert response.json()["company_context"] == "Updated Company Context"

def test_manual_ingestion_and_rag():
    # 1. Create Project
    resp = client.post("/projects", json={"name": "RAG Project"})
    project_id = resp.json()["id"]

    # 2. Ingest Only
    resp = client.post(
        f"/projects/{project_id}/ingest-only", 
        json={"provider": "local_file", "metadata": {"content": "This is a specialized architectural requirement: Use only serverless functions."}}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # 3. Generate (Should trigger RAG)
    mock_llm_output = {
        "as_is_diagram": "rag_as_is",
        "to_be_diagram": "rag_to_be",
        "architecture_summary": "RAG Summary based on specialized requirement",
        "key_questions": [],
        "pending_tasks": []
    }

    with patch('agent.LLMManager.generate_architecture_snapshot', return_value=mock_llm_output) as mock_generate:
        response = client.post(f"/projects/{project_id}/generate", json={"context": "Run analysis"})
        assert response.status_code == 200
        
        # Verify the LLM was called with the RAG context
        args, kwargs = mock_generate.call_args
        context_passed = kwargs.get('context')
        assert "Use only serverless functions" in context_passed
        assert response.json()["architecture_summary"] == "RAG Summary based on specialized requirement"
