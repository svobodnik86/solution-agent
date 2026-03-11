# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-11

### Added
- **Project Timeline**: Sidebar navigation for architectural snapshots.
- **Architectural Analysis**: Automated generation of AS-IS and TO-BE Mermaid diagrams.
- **Knowledge Ingestion**: Support for local file uploads and RAG context retrieval.
- **Model Connectivity**: "Test Connection" feature in Settings for LLM validation.
- **Error Handling**: Detailed Mermaid syntax error reporting and backend failure propagation.
- **UI/UX**: Premium light-mode interface with manual analysis control.

### Fixed
- **Gemini Integration**: Resolved missing dependencies for Google AI Studio support.
- **Persistence**: Fixed race conditions in project and profile saving.
- **Diagram Rendering**: Improved stability of Mermaid rendering in the frontend.

### Infrastructure
- **Monorepo Structure**: Unified Next.js and FastAPI projects.
- **Dependency Management**: Integrated `uv` for Python and `npm` for Node.js.
- **Versioning**: Initial release tagged as `v0.1`.
