from sqlalchemy.orm import Session
from models import Project, Timestamp, Profile
from llm_manager import LLMManager
from ingestion import IngestionManager
from vector_store import VectorStore
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
            return text[:8000]
    except Exception as e:
        return f"[Could not fetch URL: {e}]"


class AgentOrchestrator:
    def __init__(self, db: Session):
        self.db = db
        self.llm = LLMManager()
        self.ingestion = IngestionManager()
        self.vector_store = VectorStore()

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
        
        full_context = f"Project Context from Vector Store:\n{rag_context}\n\nLatest Working Notes:\n{context}"
        if previous_ts:
            full_context = f"Previous Architecture State:\nAS-IS: {previous_ts.as_is_diagram}\nTO-BE: {previous_ts.to_be_diagram}\n\n{full_context}"

        preferences = project.preferences or {"generate_sequence": True, "generate_c4": False}

        snapshot = await self.llm.generate_architecture_snapshot(
            context=full_context, 
            profile_context=profile_context,
            model_override=llm_model,
            api_key_override=llm_api_key,
            preferences=preferences
        )

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
            pending_tasks=snapshot.get("pending_tasks", [])
        )

        self.db.add(new_ts)
        self.db.commit()
        self.db.refresh(new_ts)

        return new_ts

    async def handle_refinement(self, timestamp_id: int, feedback: str) -> Timestamp:
        """
        Refines an existing timestamp based on chat feedback.
        """
        ts = self.db.query(Timestamp).filter(Timestamp.id == timestamp_id).first()
        if not ts:
            raise ValueError(f"Timestamp with ID {timestamp_id} not found.")

        # Fetch profile context for global constraints
        profile = self.db.query(Profile).first()
        profile_context = profile.company_context if profile else ""
        llm_model = profile.llm_model if profile else None
        llm_api_key = profile.llm_api_key if profile else None

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

        # Fetch project for manual notes
        project = self.db.query(Project).filter(Project.id == ts.project_id).first()
        working_notes = project.working_notes if project else ""

        # Build refinement history context
        history = ts.refinement_history or []
        history_str = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in history])

        # Strengthen prompt with notes and history
        enriched_feedback = f"""
        MANUAL NOTES & CONSTRAINTS:
        {working_notes}

        PREVIOUS REFINEMENT HISTORY:
        {history_str}

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

        # Update history
        new_history = history + [
            {"role": "user", "content": feedback},
            {"role": "assistant", "content": "Updated the architectural draft based on your feedback."}
        ]
        ts.refinement_history = new_history

        ts.as_is_diagram = refined_data.get("as_is_diagram", ts.as_is_diagram)
        ts.to_be_diagram = refined_data.get("to_be_diagram", ts.to_be_diagram)
        ts.c4_context = refined_data.get("c4_context", ts.c4_context)
        ts.c4_container = refined_data.get("c4_container", ts.c4_container)
        ts.c4_component = refined_data.get("c4_component", ts.c4_component)
        ts.architecture_summary = refined_data.get("architecture_summary", ts.architecture_summary)
        ts.key_questions = refined_data.get("key_questions", ts.key_questions)
        ts.pending_tasks = refined_data.get("pending_tasks", ts.pending_tasks)

        self.db.commit()
        self.db.refresh(ts)

        return ts
