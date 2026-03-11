# Solution Agent

An AI-powered workflow tool for Solution Architects (SAs) to synthesize meeting transcripts, documents, and notes into point-in-time architectural snapshots.

## Key Features
- **Project Timeline**: Track architectural evolution over time.
- **Automated Diagramming**: Generates AS-IS and TO-BE Mermaid sequence diagrams from unstructured context.
- **Knowledge Ingestion**: RAG-based context retrieval using ChromaDB.
- **Architectural Summaries**: AI-generated reports including key questions and pending tasks.
- **Model Agnostic**: Supports diverse LLMs (optimized for Gemini 2.0/3.0 Flash) via LiteLLM.
- **Test Connection**: Immediate verification of LLM settings.

## Agentic Framework
This project utilizes a lean agentic architecture:
- **LiteLLM**: Provides a unified interface for calling 100+ LLMs (OpenAI, Anthropic, Google, etc.).
- **Custom Orchestrator**: A specialized state machine (`AgentOrchestrator`) that manages the multi-step process of context ingestion, RAG retrieval, and structured architecture synthesis.

## Tech Stack
- **Frontend**: Next.js, Tailwind CSS, Shadcn UI, Mermaid.js
- **Backend**: FastAPI, SQLAlchemy (SQLite), LiteLLM, ChromaDB
- **Dependency Management**: `uv` (Python), `npm` (Node.js)

## Getting Started

### Prerequisites
- Python 3.12+ 
- Node.js 18+
- [uv](https://github.com/astral-sh/uv)

### Backend Setup
1. Navigate to the `backend` directory.
2. Install dependencies:
   ```bash
   uv sync
   ```
3. Run the server:
   ```bash
   uv run uvicorn main:app --reload
   ```

### Frontend Setup
1. Navigate to the `frontend` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## License
MIT
