from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(Text, nullable=True)
    working_notes = Column(Text, nullable=True)
    preferences = Column(JSON, default=lambda: {"generate_sequence": True, "generate_c4": False})
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.UTC))

    timestamps = relationship("Timestamp", back_populates="project", cascade="all, delete-orphan")
    integrations = relationship("Integration", back_populates="project", cascade="all, delete-orphan")

class Timestamp(Base):
    __tablename__ = "timestamps"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String, default="New Iteration")
    as_is_diagram = Column(Text, nullable=True)
    to_be_diagram = Column(Text, nullable=True)
    c4_context = Column(Text, nullable=True)
    c4_container = Column(Text, nullable=True)
    c4_component = Column(Text, nullable=True)
    architecture_summary = Column(Text, nullable=True)
    key_questions = Column(JSON, nullable=True)
    pending_tasks = Column(JSON, nullable=True)
    refinement_history = Column(JSON, nullable=True) # List of {"role": "user"|"assistant", "content": str}
    last_diagram_refresh = Column(DateTime, nullable=True)  # Track when diagrams were last regenerated
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.UTC))

    project = relationship("Project", back_populates="timestamps")

class Integration(Base):
    __tablename__ = "integrations"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    provider = Column(String)  # 'gmail', 'google_drive', 'local_file'
    credentials = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.UTC))

    project = relationship("Project", back_populates="integrations")

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Default Profile")
    company_context = Column(Text, nullable=True)  # Global constraints, standard tech stacks, etc.
    llm_model = Column(String, default="gemini/gemini-1.5-flash")
    llm_api_key = Column(String, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.UTC), onupdate=lambda: datetime.datetime.now(datetime.UTC))
