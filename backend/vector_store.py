import chromadb
from chromadb.config import Settings
import os

class VectorStore:
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

    async def query_documents(self, query_texts: list[str], n_results: int = 5, where: dict = None):
        """Query the vector store for relevant context."""
        results = self.collection.query(
            query_texts=query_texts,
            n_results=n_results,
            where=where
        )
        return results

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
