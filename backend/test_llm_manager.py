import pytest
import json
from unittest.mock import patch, MagicMock
from llm_manager import LLMManager

@pytest.fixture
def llm_manager():
    return LLMManager(model_override="test-model")

@pytest.mark.asyncio
async def test_generate_architecture_snapshot_success(llm_manager):
    mock_response = MagicMock()
    mock_content = {
        "as_is_diagram": "seq1",
        "to_be_diagram": "seq2",
        "architecture_summary": "Summary",
        "key_questions": ["Q?"],
        "pending_tasks": ["T1"]
    }
    mock_response.choices[0].message.content = json.dumps(mock_content)

    with patch('llm_manager.completion', return_value=mock_response):
        result = await llm_manager.generate_architecture_snapshot("Sample context")
        assert result["as_is_diagram"] == "seq1"
        assert result["key_questions"] == ["Q?"]

@pytest.mark.asyncio
async def test_refine_draft_success(llm_manager):
    mock_response = MagicMock()
    mock_content = {
        "as_is_diagram": "seq1_updated",
        "to_be_diagram": "seq2",
        "architecture_summary": "Summary updated",
        "key_questions": [],
        "pending_tasks": []
    }
    mock_response.choices[0].message.content = json.dumps(mock_content)

    with patch('llm_manager.completion', return_value=mock_response):
        current_state = {"as_is_diagram": "seq1"}
        result = await llm_manager.refine_draft(current_state, "Update context")
        assert result["as_is_diagram"] == "seq1_updated"
