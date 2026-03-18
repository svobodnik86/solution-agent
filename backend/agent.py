from sqlalchemy.orm import Session
from models import Project, Timestamp, Profile
from llm_manager import LLMManager
from ingestion import IngestionManager
from vector_store import VectorStore
from diagram_validator import clean_diagram, validate_diagram, validate_and_clean_snapshot
from typing import Dict, Any, List
import datetime
import re
import httpx
from html.parser import HTMLParser

class _HTMLTextExtractor(HTMLParser):
    """Minimal HTML-to-text stripper."""
    def __init__(self):
        super().__init__()
        self._parts: List[str] = []
        self._skip_tags = {"script", "style", "head", "noscript"}
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self._skip_tags:
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in self._skip_tags:
            self._skip = max(0, self._skip - 1)

    def handle_data(self, data):
        if self._skip == 0 and data.strip():
            self._parts.append(data.strip())

    def get_text(self) -> str:
        return " ".join(self._parts)


def _extract_urls(text: str) -> List[str]:
    return re.findall(r'https?://[^\s<>"]+', text)


def _truncate_text(text: str, max_chars: int = 8000) -> str:
    """
    Truncate text to approximately max_chars, trying to cut at a sentence boundary.
    Roughly 8000 chars ≈ 2000 tokens.
    Also tries to avoid breaking JSON strings.
    """
    if len(text) <= max_chars:
        return text
    
    # Try to cut at a sentence boundary
    truncated = text[:max_chars]
    
    # First, try to find a JSON object/array end if we're in JSON
    if text.strip().startswith('{') or text.strip().startswith('['):
        # Find the last complete JSON structure
        brace_count = 0
        bracket_count = 0
        in_string = False
        escape = False
        last_good_end = -1
        
        for i, char in enumerate(truncated):
            if escape:
                escape = False
                continue
                
            if char == '\\':
                escape = True
                continue
                
            if char == '"' and not escape:
                in_string = not in_string
                continue
                
            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0 and bracket_count == 0:
                        last_good_end = i
                elif char == '[':
                    bracket_count += 1
                elif char == ']':
                    bracket_count -= 1
                    if brace_count == 0 and bracket_count == 0:
                        last_good_end = i
        
        if last_good_end > max_chars * 0.7:  # If we found a good JSON end in the last 30%
            return truncated[:last_good_end + 1] + "\n...[truncated]"
    
    # Fallback: try to cut at a sentence boundary
    last_period = truncated.rfind('. ')
    last_newline = truncated.rfind('\n')
    
    cut_point = max(last_period, last_newline)
    if cut_point > max_chars * 0.8:  # Only cut if we find a good boundary in the last 20%
        return truncated[:cut_point + 1] + "\n...[truncated]"
    
    return truncated + "\n...[truncated]"


async def _fetch_url_text(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "SolutionAgent/1.0"})
            r.raise_for_status()
            ct = r.headers.get("content-type", "")
            if "html" in ct:
                parser = _HTMLTextExtractor()
                parser.feed(r.text)
                text = parser.get_text()
            else:
                text = r.text
            # Truncate to avoid token overload
            return _truncate_text(text, 8000)
    except Exception as e:
        return f"[Could not fetch URL: {e}]"


class AgentOrchestrator:
    def __init__(self, db: Session):
        self.db = db
        self.llm = LLMManager()
        self.ingestion = IngestionManager()
        self.vector_store = VectorStore()

    async def index_working_notes(self, project_id: int, notes: str):
        """
        Index working notes into the vector DB.
        Uses upsert semantics - updates if exists, creates if not.
        """
        if not notes or not notes.strip():
            return
        
        doc_id = f"notes_proj_{project_id}"
        metadata = {
            "project_id": project_id,
            "provider": "manual_notes",
            "doc_type": "notes",
            "name": "Working Notes",
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat()
        }
        await self.vector_store.upsert_document(doc_id, notes, metadata)

    async def index_refinement(self, project_id: int, timestamp_id: int, feedback: str, response_summary: str, sequence: int):
        """
        Index a refinement exchange into the vector DB.
        """
        doc_id = f"refinement_ts_{timestamp_id}_{sequence}"
        content = f"USER FEEDBACK:\n{feedback}\n\nARCHITECT RESPONSE:\n{response_summary}"
        metadata = {
            "project_id": project_id,
            "timestamp_id": timestamp_id,
            "provider": "refinement",
            "doc_type": "refinement",
            "name": f"Refinement #{sequence}",
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "sequence": sequence
        }
        await self.vector_store.upsert_document(doc_id, content, metadata)

    async def _fix_diagrams(
        self,
        snapshot: Dict[str, Any],
        model: str,
        api_key: str,
        max_retries: int = 2,
    ) -> Dict[str, Any]:
        """
        Layer 1: clean code fences + validate all diagram fields.
        Layer 2: for any diagram that fails validation, ask the LLM to fix it
                 (up to max_retries attempts per diagram).
        Returns a snapshot with the best available diagram strings.
        """
        import asyncio
        
        snapshot, errors = validate_and_clean_snapshot(snapshot)

        if not errors:
            return snapshot

        for attempt in range(max_retries):
            if not errors:
                break
            print(f"DEBUG: Diagram validation errors (attempt {attempt + 1}): {errors}")
            
            # Fix all broken diagrams in parallel
            tasks = []
            for field_name, error_msg in errors:
                task = self.llm.fix_diagram(
                    diagram=snapshot.get(field_name, ""),
                    field_name=field_name,
                    error_message=error_msg,
                    model_override=model,
                    api_key_override=api_key,
                )
                tasks.append((field_name, error_msg, task))
            
            # Wait for all fixes to complete
            results = await asyncio.gather(*[task for _, _, task in tasks], return_exceptions=True)
            
            still_broken = []
            for idx, (field_name, error_msg, _) in enumerate(tasks):
                result = results[idx]
                if isinstance(result, Exception):
                    print(f"DEBUG: Failed to fix diagram '{field_name}': {result}")
                    still_broken.append((field_name, error_msg))
                    continue
                    
                fixed = clean_diagram(result)
                ok, new_error = validate_diagram(fixed, field_name)
                if ok:
                    print(f"DEBUG: Fixed diagram '{field_name}' on attempt {attempt + 1}")
                    snapshot[field_name] = fixed
                else:
                    still_broken.append((field_name, new_error))
            
            errors = still_broken

        if errors:
            print(f"DEBUG: Diagrams still invalid after {max_retries} fix attempts: {[f for f, _ in errors]}")

        return snapshot

    async def ingest_only(self, project_id: int, provider_type: str, metadata: Dict[str, Any]) -> str:
        """
        Ingests content into the vector store without generating a snapshot.
        Returns the ID of the stored document.
        """
        # 1. Fetch
        raw_context = await self.ingestion.get_context(provider_type, metadata)
        if not raw_context:
            raise ValueError("No context retrieved from provider.")

        doc_id = f"proj_{project_id}_{datetime.datetime.now().timestamp()}"
        
        name = metadata.get('name', f"Added {provider_type} context")
        timestamp = datetime.datetime.now().isoformat()
        
        # 2. Store in Vector DB
        await self.vector_store.add_documents(
            documents=[raw_context],
            metadatas=[{"project_id": project_id, "provider": provider_type, "name": name, "timestamp": timestamp}],
            ids=[doc_id]
        )
        return doc_id

    async def get_project_contexts(self, project_id: int) -> List[Dict[str, Any]]:
        results = await self.vector_store.get_documents(where={"project_id": project_id})
        contexts = []
        if results and results.get("ids"):
            for i in range(len(results["ids"])):
                meta = results["metadatas"][i] or {}
                content = results["documents"][i] if "documents" in results and results["documents"] else ""
                contexts.append({
                    "id": results["ids"][i],
                    "name": meta.get("name", "Unknown Context"),
                    "provider": meta.get("provider", "unknown"),
                    "timestamp": meta.get("timestamp", datetime.datetime.now().isoformat()),
                    "content": content
                })
        return contexts
        
    async def rename_project_context(self, project_id: int, doc_id: str, new_name: str):
        results = await self.vector_store.get_documents(where={"project_id": project_id})
        if not results or not results.get("ids") or doc_id not in results["ids"]:
            raise ValueError("Context not found for this project.")
            
        index = results["ids"].index(doc_id)
        current_metadata = dict(results["metadatas"][index] or {})
        current_metadata["name"] = new_name
        
        await self.vector_store.update_document_metadata(doc_id, current_metadata)
        
    async def delete_project_context(self, project_id: int, doc_id: str):
        results = await self.vector_store.get_documents(where={"project_id": project_id})
        if not results or not results.get("ids") or doc_id not in results["ids"]:
            raise ValueError("Context not found for this project.")
            
        await self.vector_store.delete_document(doc_id)

    async def context_chat(
        self,
        project_id: int,
        question: str,
        history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Answers a question grounded in project context + any URLs mentioned in the question.
        Returns answer, sources list, and source_type.
        """
        profile = self.db.query(Profile).first()
        llm_model = profile.llm_model if profile else None
        llm_api_key = profile.llm_api_key if profile else None

        # 1. RAG: retrieve relevant project context chunks
        rag_results = await self.vector_store.query_documents(
            query_texts=[question],
            n_results=5,
            where={"project_id": project_id}
        )

        chunks: List[str] = []
        names: List[str] = []
        sources = []

        if rag_results and rag_results.get("documents"):
            docs = [d for sublist in rag_results["documents"] for d in sublist]
            metas = [m for sublist in rag_results.get("metadatas", [[]]) for m in sublist]
            ids = [i for sublist in rag_results.get("ids", [[]]) for i in sublist]
            for doc, meta, doc_id in zip(docs, metas, ids):
                chunks.append(doc)
                name = meta.get("name", "Unknown") if meta else "Unknown"
                names.append(name)
                sources.append({
                    "id": doc_id,
                    "name": name,
                    "provider": meta.get("provider", "unknown") if meta else "unknown",
                    "timestamp": meta.get("timestamp", "") if meta else ""
                })

        # 2. URL detection: fetch any URLs mentioned in the question
        urls = _extract_urls(question)
        url_source_type = None
        for url in urls:
            page_text = await _fetch_url_text(url)
            chunks.append(page_text)
            names.append(url)
            sources.append({
                "id": f"url_{url}",
                "name": url,
                "provider": "web_url",
                "timestamp": datetime.datetime.now().isoformat()
            })
            url_source_type = "web"

        # 3. Call LLM
        result = await self.llm.context_chat(
            question=question,
            context_chunks=chunks,
            context_names=names,
            history=history,
            model_override=llm_model,
            api_key_override=llm_api_key,
        )

        # 4. Determine final source_type
        if url_source_type and not (rag_results and rag_results.get("documents")):
            source_type = "web"
        elif url_source_type:
            source_type = "web"  # URL overrides if present
        else:
            source_type = result["source_type"]

        return {
            "answer": result["answer"],
            "sources": sources,
            "source_type": source_type
        }


    async def ingest_and_generate(self, project_id: int, provider_type: str, metadata: Dict[str, Any]) -> Timestamp:
        # DEPRECATED: Keeping for backwards compatibility if needed, but UI shouldn't use it.
        await self.ingest_only(project_id, provider_type, metadata)
        return await self.create_new_timestamp(project_id, "New ingestion triggered analysis.", "New Iteration")

    async def create_new_timestamp(self, project_id: int, context: str, name: str = "New Iteration") -> Timestamp:
        """
        Generates a new timestamp iteration (Milestone).
        """
        # Fetch profile context for global constraints
        profile = self.db.query(Profile).first()
        profile_context = profile.company_context if profile else ""
        llm_model = profile.llm_model if profile else None
        llm_api_key = profile.llm_api_key if profile else None

        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ValueError(f"Project with ID {project_id} not found.")

        # 1. RAG: Retrieve all documents for this project
        rag_context = ""
        if context.strip():
            rag_results = await self.vector_store.query_documents(
                query_texts=[context],
                n_results=5,
                where={"project_id": project_id}
            )
            
            if rag_results and rag_results.get("documents"):
                 # Flatten documents list
                 docs = [d for sublist in rag_results["documents"] for d in sublist]
                 rag_context = "\n---\n".join(docs)
        else:
            # Fallback: Just get some recent documents for this project if no query text
            # Depending on vector_store implementation, we might just query for all project docs
            rag_results = await self.vector_store.query_documents(
                query_texts=["Solution architecture"], # Default generic query
                n_results=10,
                where={"project_id": project_id}
            )
            if rag_results and rag_results.get("documents"):
                 docs = [d for sublist in rag_results["documents"] for d in sublist]
                 rag_context = "\n---\n".join(docs)

        previous_ts = self.db.query(Timestamp).filter(Timestamp.project_id == project_id).order_by(Timestamp.created_at.desc()).first()
        
        # Apply truncation to avoid token overload
        truncated_rag_context = _truncate_text(rag_context, 4000)  # ~1000 tokens
        truncated_notes = _truncate_text(context, 2000)  # ~500 tokens
        
        full_context = f"Project Context from Vector Store:\n{truncated_rag_context}\n\nLatest Working Notes:\n{truncated_notes}"
        if previous_ts:
            # Truncate previous diagrams as well
            truncated_as_is = _truncate_text(previous_ts.as_is_diagram or "", 1000)
            truncated_to_be = _truncate_text(previous_ts.to_be_diagram or "", 1000)
            full_context = f"Previous Architecture State:\nAS-IS: {truncated_as_is}\nTO-BE: {truncated_to_be}\n\n{full_context}"

        preferences = project.preferences or {"generate_sequence": True, "generate_c4": False}

        snapshot = await self.llm.generate_architecture_snapshot(
            context=full_context,
            profile_context=profile_context,
            model_override=llm_model,
            api_key_override=llm_api_key,
            preferences=preferences
        )

        snapshot = await self._fix_diagrams(snapshot, llm_model, llm_api_key)

        new_ts = Timestamp(
            project_id=project_id,
            name=name,
            as_is_diagram=snapshot.get("as_is_diagram", ""),
            to_be_diagram=snapshot.get("to_be_diagram", ""),
            c4_context=snapshot.get("c4_context", ""),
            c4_container=snapshot.get("c4_container", ""),
            c4_component=snapshot.get("c4_component", ""),
            architecture_summary=snapshot.get("architecture_summary", ""),
            key_questions=snapshot.get("key_questions", []),
            pending_tasks=snapshot.get("pending_tasks", []),
            last_diagram_refresh=datetime.datetime.now(datetime.UTC)  # Set initial refresh time
        )

        self.db.add(new_ts)
        self.db.commit()
        self.db.refresh(new_ts)

        return new_ts

    async def handle_refinement(self, timestamp_id: int, feedback: str) -> Timestamp:
        """
        Refines an existing timestamp based on chat feedback.
        Now includes:
        - RAG retrieval with time-weighted recency
        - New documents added since last diagram refresh
        - Indexing refinements to vector DB
        """
        print(f"AGENT_DEBUG: Starting refinement for timestamp {timestamp_id}")
        ts = self.db.query(Timestamp).filter(Timestamp.id == timestamp_id).first()
        if not ts:
            raise ValueError(f"Timestamp with ID {timestamp_id} not found.")

        # Fetch profile context for global constraints
        profile = self.db.query(Profile).first()
        profile_context = profile.company_context if profile else ""
        llm_model = profile.llm_model if profile else None
        llm_api_key = profile.llm_api_key if profile else None
        print(f"AGENT_DEBUG: Using LLM model: {llm_model}")

        current_state = {
            "as_is_diagram": ts.as_is_diagram,
            "to_be_diagram": ts.to_be_diagram,
            "c4_context": ts.c4_context,
            "c4_container": ts.c4_container,
            "c4_component": ts.c4_component,
            "architecture_summary": ts.architecture_summary,
            "key_questions": ts.key_questions,
            "pending_tasks": ts.pending_tasks
        }

        # Fetch project
        project = self.db.query(Project).filter(Project.id == ts.project_id).first()
        project_id = ts.project_id
        print(f"AGENT_DEBUG: Project ID: {project_id}")

        # 1. RAG: Query relevant context with recency weighting
        print(f"AGENT_DEBUG: Starting RAG query with recency weighting")
        rag_results = await self.vector_store.query_with_recency(
            query_texts=[feedback],
            n_results=8,
            where={"project_id": project_id},
            fetch_k=30
        )
        print(f"AGENT_DEBUG: RAG query completed, found {len(rag_results.get('documents', [[]])[0]) if rag_results and rag_results.get('documents') else 0} documents")
        
        rag_context = ""
        if rag_results and rag_results.get("documents") and rag_results["documents"][0]:
            docs = rag_results["documents"][0]
            metas = rag_results["metadatas"][0] if rag_results.get("metadatas") else []
            context_parts = []
            for i, doc in enumerate(docs):
                source_name = metas[i].get("name", "Unknown") if i < len(metas) else "Unknown"
                doc_type = metas[i].get("doc_type", "") if i < len(metas) else ""
                prefix = "[REFINEMENT] " if doc_type == "refinement" else ""
                context_parts.append(f"[{prefix}{source_name}]\n{doc}")
            rag_context = "\n\n---\n\n".join(context_parts)

        # 2. Get NEW documents since last diagram refresh
        new_context = ""
        last_refresh = ts.last_diagram_refresh or ts.created_at
        if last_refresh:
            last_refresh_iso = last_refresh.isoformat() if hasattr(last_refresh, 'isoformat') else str(last_refresh)
            new_docs_results = await self.vector_store.query_since_timestamp(
                project_id=project_id,
                since_iso=last_refresh_iso,
                n_results=10
            )
            if new_docs_results and new_docs_results.get("documents") and new_docs_results["documents"][0]:
                new_docs = new_docs_results["documents"][0]
                new_metas = new_docs_results["metadatas"][0] if new_docs_results.get("metadatas") else []
                new_parts = []
                for i, doc in enumerate(new_docs):
                    source_name = new_metas[i].get("name", "New Document") if i < len(new_metas) else "New Document"
                    new_parts.append(f"[NEW: {source_name}]\n{doc}")
                new_context = "\n\n---\n\n".join(new_parts)

        # 3. Build refinement history context (layered by recency - most recent last)
        history = ts.refinement_history or []
        # Show last 10 exchanges to avoid token overload, most recent at the end
        recent_history = history[-20:] if len(history) > 20 else history
        history_str = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in recent_history])

        # 4. Compose enriched feedback with all context layers, applying truncation
        # Truncate each context layer to avoid token overload
        max_context_chars = 2000  # Roughly 500 tokens per context layer
        truncated_rag_context = _truncate_text(rag_context if rag_context else "(No relevant context found)", max_context_chars)
        truncated_new_context = _truncate_text(new_context if new_context else "(No new documents)", max_context_chars)
        truncated_history = _truncate_text(history_str if history_str else "(First refinement)", max_context_chars)
        
        enriched_feedback = f"""
RELEVANT PROJECT CONTEXT (time-weighted, refinements boosted):
{truncated_rag_context}

NEW DOCUMENTS SINCE LAST DIAGRAM REFRESH:
{truncated_new_context}

RECENT REFINEMENT HISTORY (chronological, most recent last):
{truncated_history}

NEW USER FEEDBACK:
{feedback}
"""

        preferences = project.preferences if project else {"generate_sequence": True, "generate_c4": False}

        refined_data = await self.llm.refine_draft(
            current_state,
            enriched_feedback,
            profile_context=profile_context,
            model_override=llm_model,
            api_key_override=llm_api_key,
            preferences=preferences
        )

        # Smart diagram validation: only validate diagrams that actually changed
        # Compare with current state to avoid unnecessary validation
        diagrams_to_validate = []
        for field in ["as_is_diagram", "to_be_diagram", "c4_context", "c4_container", "c4_component"]:
            if field in refined_data and refined_data[field] != current_state.get(field, ""):
                diagrams_to_validate.append(field)
        
        if diagrams_to_validate:
            # Create a snapshot with only changed diagrams for validation
            validation_snapshot = {field: refined_data[field] for field in diagrams_to_validate}
            # Add other fields to maintain structure
            for field in refined_data:
                if field not in validation_snapshot:
                    validation_snapshot[field] = refined_data[field]
            
            fixed_snapshot = await self._fix_diagrams(validation_snapshot, llm_model, llm_api_key)
            # Update refined_data with fixed diagrams
            for field in diagrams_to_validate:
                if field in fixed_snapshot:
                    refined_data[field] = fixed_snapshot[field]

        # Update history
        new_history = history + [
            {"role": "user", "content": feedback},
            {"role": "assistant", "content": "Updated the architectural draft based on your feedback."}
        ]
        ts.refinement_history = new_history

        # Update timestamp fields
        ts.as_is_diagram = refined_data.get("as_is_diagram", ts.as_is_diagram)
        ts.to_be_diagram = refined_data.get("to_be_diagram", ts.to_be_diagram)
        ts.c4_context = refined_data.get("c4_context", ts.c4_context)
        ts.c4_container = refined_data.get("c4_container", ts.c4_container)
        ts.c4_component = refined_data.get("c4_component", ts.c4_component)
        ts.architecture_summary = refined_data.get("architecture_summary", ts.architecture_summary)
        ts.key_questions = refined_data.get("key_questions", ts.key_questions)
        ts.pending_tasks = refined_data.get("pending_tasks", ts.pending_tasks)
        
        # Update last_diagram_refresh timestamp
        ts.last_diagram_refresh = datetime.datetime.now(datetime.UTC)

        self.db.commit()
        self.db.refresh(ts)

        # Index this refinement to vector DB for future RAG queries
        sequence = len(new_history) // 2  # Each exchange is 2 items (user + assistant)
        response_summary = refined_data.get("architecture_summary", "Architecture updated based on feedback.")[:500]
        await self.index_refinement(
            project_id=project_id,
            timestamp_id=timestamp_id,
            feedback=feedback,
            response_summary=response_summary,
            sequence=sequence
        )

        return ts
