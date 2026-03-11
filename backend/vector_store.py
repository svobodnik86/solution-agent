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
