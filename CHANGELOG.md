# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - 2026-03-16

### Added
- **Context Q&A Chat:** New chat mode in the right-hand panel that answers questions grounded in project context with full source attribution. Shows `✅ From Project Context`, `🤖 LLM Knowledge`, or `🌐 Web URL` badges per response.
- **URL Reading:** Paste any URL into the Context Q&A input and the agent will fetch and read the page content automatically.
- **Source Chips:** Clickable source references below each Context Q&A answer linking back to the originating context document.

### Changed
- **Project Config tab:** Renamed "Settings" tab to "Project Config" to distinguish it from the global profile settings.

### Fixed
- Inline error messages for project name conflicts now surfaced directly in the New Project modal.
- React hydration warning on `<body>` tag caused by browser extensions suppressed with `suppressHydrationWarning`.

## [0.4.0] - 2026-03-12

### Added
- **C4 Diagrams:** Implemented LLM generation and structural visualization for C4 Context, Container, and Component map levels.
- **Diagram View Toggle:** Added a pill-style navigation header to the diagrams tab to switch seamlessly between Behavioral (Sequence) and Structural (C4) outputs.
- **Project Settings:** Added a "Settings" tab that allows users to independently disable or enable behavioral vs structural diagram generation for faster drafting.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-12

### Added
- **Context Management**: Support for dynamically adding, reading, and renaming manual notes and files directly in the vector database via the new `/contexts` API routes.
- **Context Viewer Modal**: Added a full-screen view modal for project contexts that displays raw file text and note inputs stored in ChromaDB.
- **Milestone Workflow Separation**: Decoupled ingestion from milestone generation, enabling the creation of named architectural milestones on-demand.
- **Markdown Typography**: Integrated `react-markdown` and `@tailwindcss/typography` to properly format and display LLM-generated summaries and task lists.

### Changed
- **Workspace Layout**: Refactored the dashboard layout to move the Refinement Chat to the Diagrams tab and relocate the Project Context list into a clean right-hand sidebar.
- **Note Naming**: Users can now assign titles to manual notes *before* adding them to the project context, and rename them post-ingestion.

## [0.2.0] - 2026-03-11
### Added
- **Diagram Zoom (Inspection View)**: High-resolution modal for sequence diagrams with persistent headers and "Full Width" scaling.
- **Project Isolation**: Strict partitioning of context (notes, history, RAG) per project_id.
- **Automated Testing**: Integrated `pytest` suite for backend API regression prevention.
- **Personalized Profile**: Dynamic Sidebar displaying user identity (Ondřej Svoboda) and role (Scientific Data Architect).
- **Expanded Integrations**: Added Slack, Microsoft Teams, Confluence, Google Drive, and SharePoint to roadmap.

### Fixed
- **Project Switching**: Resolved a regression in the frontend state machine that caused data desync between projects.
- **Diagram Readability**: Fixed the zoom implementation to ensure headers remain visible during inspection.

## [0.1.1] - 2026-03-11

### Added
- **Notes Persistence**: Working notes in the Workspace tab are now saved per project.
- **Auto-loading**: Notes are automatically retrieved when switching between projects.

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
