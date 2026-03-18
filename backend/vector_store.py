import chromadb
from chromadb.config import Settings
import os
import datetime
from typing import List, Dict, Any, Optional

class VectorStore:
    # Recency decay: score multiplier = DECAY_FACTOR ^ days_old
    DECAY_FACTOR = 0.95
    # Refinement documents get a base boost
    REFINEMENT_BOOST = 1.5

    def __init__(self, collection_name: str = "solution_agent_context"):
        self.client = chromadb.PersistentClient(path="./chroma_db")
        self.collection = self.client.get_or_create_collection(name=collection_name)

    async def add_documents(self, documents: list[str], metadatas: list[dict] = None, ids: list[str] = None):
        """Add documents to the vector store."""
        if ids is None:
            ids = [f"id_{i}" for i in range(len(documents))]
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )

    async def upsert_document(self, doc_id: str, document: str, metadata: dict):
        """Upsert a single document (insert or update if exists)."""
        self.collection.upsert(
            ids=[doc_id],
            documents=[document],
            metadatas=[metadata]
        )

    async def query_documents(self, query_texts: list[str], n_results: int = 5, where: dict = None):
        """Query the vector store for relevant context."""
        results = self.collection.query(
            query_texts=query_texts,
            n_results=n_results,
            where=where
        )
        return results

    async def query_with_recency(
        self,
        query_texts: List[str],
        n_results: int = 5,
        where: Optional[Dict] = None,
        fetch_k: int = 20
    ) -> Dict[str, Any]:
        """
        Query with time-weighted re-ranking.
        Fetches fetch_k results, applies recency decay and refinement boost, returns top n_results.
        """
        results = self.collection.query(
            query_texts=query_texts,
            n_results=fetch_k,
            where=where,
            include=["documents", "metadatas", "distances"]
        )

        if not results or not results.get("ids") or not results["ids"][0]:
            return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

        # Flatten results (ChromaDB returns nested lists for batch queries)
        ids = results["ids"][0]
        docs = results["documents"][0] if results.get("documents") else [""] * len(ids)
        metas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(ids)
        distances = results["distances"][0] if results.get("distances") else [1.0] * len(ids)

        now = datetime.datetime.now(datetime.UTC)
        scored_results = []

        for i, (doc_id, doc, meta, dist) in enumerate(zip(ids, docs, metas, distances)):
            # Convert distance to similarity (ChromaDB uses L2 by default, lower is better)
            # We'll invert: similarity = 1 / (1 + distance)
            similarity = 1.0 / (1.0 + dist)

            # Calculate days old
            timestamp_str = meta.get("timestamp", "")
            days_old = 0
            if timestamp_str:
                try:
                    doc_time = datetime.datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                    if doc_time.tzinfo is None:
                        doc_time = doc_time.replace(tzinfo=datetime.UTC)
                    delta = now - doc_time
                    days_old = max(0, delta.days)
                except:
                    pass

            # Recency weight
            recency_weight = self.DECAY_FACTOR ** days_old

            # Refinement boost
            doc_type = meta.get("doc_type", "")
            type_boost = self.REFINEMENT_BOOST if doc_type == "refinement" else 1.0

            # Final score
            final_score = similarity * recency_weight * type_boost

            scored_results.append({
                "id": doc_id,
                "document": doc,
                "metadata": meta,
                "distance": dist,
                "final_score": final_score
            })

        # Sort by final_score descending (higher is better)
        scored_results.sort(key=lambda x: x["final_score"], reverse=True)

        # Take top n_results
        top_results = scored_results[:n_results]

        # Reconstruct ChromaDB-like format
        return {
            "ids": [[r["id"] for r in top_results]],
            "documents": [[r["document"] for r in top_results]],
            "metadatas": [[r["metadata"] for r in top_results]],
            "distances": [[r["distance"] for r in top_results]]
        }

    async def query_since_timestamp(
        self,
        project_id: int,
        since_iso: str,
        n_results: int = 10
    ) -> Dict[str, Any]:
        """
        Get documents added after a specific timestamp for a project.
        Uses a generic query to fetch recent docs and filters by timestamp.
        """
        # ChromaDB where clause doesn't support $gt on string timestamps reliably,
        # so we fetch more and filter in Python
        results = self.collection.query(
            query_texts=["project context architecture"],  # Generic query
            n_results=50,
            where={"project_id": project_id},
            include=["documents", "metadatas", "distances"]
        )

        if not results or not results.get("ids") or not results["ids"][0]:
            return {"ids": [[]], "documents": [[]], "metadatas": [[]]}

        ids = results["ids"][0]
        docs = results["documents"][0] if results.get("documents") else []
        metas = results["metadatas"][0] if results.get("metadatas") else []

        try:
            since_dt = datetime.datetime.fromisoformat(since_iso.replace("Z", "+00:00"))
            if since_dt.tzinfo is None:
                since_dt = since_dt.replace(tzinfo=datetime.UTC)
        except:
            # If parse fails, return all
            return {"ids": [ids[:n_results]], "documents": [docs[:n_results]], "metadatas": [metas[:n_results]]}

        filtered = []
        for doc_id, doc, meta in zip(ids, docs, metas):
            ts_str = meta.get("timestamp", "") if meta else ""
            if ts_str:
                try:
                    doc_dt = datetime.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    if doc_dt.tzinfo is None:
                        doc_dt = doc_dt.replace(tzinfo=datetime.UTC)
                    if doc_dt > since_dt:
                        filtered.append((doc_id, doc, meta))
                except:
                    pass

        filtered = filtered[:n_results]
        return {
            "ids": [[f[0] for f in filtered]],
            "documents": [[f[1] for f in filtered]],
            "metadatas": [[f[2] for f in filtered]]
        }

    async def get_documents(self, where: dict = None):
        """Get documents without semantic search, useful for listing."""
        return self.collection.get(where=where)

    async def update_document_metadata(self, doc_id: str, metadata: dict):
        """Update metadata for a specific document."""
        self.collection.update(
            ids=[doc_id],
            metadatas=[metadata]
        )

    async def delete_document(self, doc_id: str):
        """Delete a document from the vector store."""
        self.collection.delete(ids=[doc_id])
