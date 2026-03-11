import os
from abc import ABC, abstractmethod
from typing import List, Dict, Any

class BaseIngestionProvider(ABC):
    @abstractmethod
    async def fetch_context(self, source_metadata: Dict[str, Any]) -> str:
        """Fetch raw text context from the source."""
        pass

class LocalFileIngestionProvider(BaseIngestionProvider):
    async def fetch_context(self, source_metadata: Dict[str, Any]) -> str:
        # metadata might contain 'file_path' or 'content'
        if 'content' in source_metadata:
            return source_metadata['content']
        
        file_path = source_metadata.get('file_path')
        if not file_path or not os.path.exists(file_path):
            return ""
        
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

class IngestionManager:
    def __init__(self):
        self.providers = {
            "local_file": LocalFileIngestionProvider()
        }

    async def get_context(self, provider_type: str, metadata: Dict[str, Any]) -> str:
        provider = self.providers.get(provider_type)
        if not provider:
            raise ValueError(f"Provider {provider_type} not implemented.")
        return await provider.fetch_context(metadata)
