import os
import json
from typing import Dict, Any, List
from litellm import completion
from dotenv import load_dotenv

load_dotenv()

class LLMManager:
    def __init__(self, model_override: str = None):
        self.default_model = model_override or os.getenv("LLM_MODEL", "gemini/gemini-1.5-flash")

    async def generate_architecture_snapshot(
        self, 
        context: str, 
        profile_context: str = "",
        model_override: str = None,
        api_key_override: str = None
    ) -> Dict[str, Any]:
        """
        Generates AS-IS/TO-BE diagrams and summary from raw context.
        """
        model = model_override or self.default_model
        system_prompt = f"""
        You are an expert Solution Architect. 
        Your goal is to parse the provided context and generate a structured architectural snapshot.
        
        GLOBAL ARCHITECT CONSTRAINTS & STANDARDS:
        {profile_context}
        
        You MUST return valid JSON matching this schema:
        {{
            "as_is_diagram": "A Mermaid sequence diagram string representing the current state.",
            "to_be_diagram": "A Mermaid sequence diagram string representing the proposed future state.",
            "architecture_summary": "A detailed markdown summary of the architecture.",
            "key_questions": ["A list of outstanding questions for the client."],
            "pending_tasks": ["A list of tasks to be followed up."]
        }}
        Ensure the output is strictly valid JSON.
        """

        user_prompt = f"""
        Analyze the following context regarding a software architecture project and generate a structured output.
        Context:
        {context}

        Ensure the output is strictly valid JSON.
        """

        try:
            from litellm import acompletion
            response = await acompletion(
                model=model,
                api_key=api_key_override,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={ "type": "json_object" }
            )
            
            content = response.choices[0].message.content
            print(f"DEBUG: LLM Raw Content:\n{content}")
            return json.loads(content)
        except Exception as e:
            # Propagate the error with a descriptive message
            raise RuntimeError(f"LLM Generation Failed (Model: {model}): {str(e)}")

    async def refine_draft(
        self, 
        current_state: Dict[str, Any], 
        feedback: str,
        model_override: str = None,
        api_key_override: str = None
    ) -> Dict[str, Any]:
        """
        Refines the current architecture state based on user feedback.
        """
        model = model_override or self.default_model
        prompt = f"""
        You are an expert Solution Architect. 
        Current Architectural State:
        {json.dumps(current_state, indent=2)}

        User Feedback/Clarification:
        {feedback}

        Update the architectural state based on this feedback. 
        Return the updated JSON object with the same keys: as_is_diagram, to_be_diagram, architecture_summary, key_questions, pending_tasks.
        """

        try:
            from litellm import acompletion
            response = await acompletion(
                model=model,
                api_key=api_key_override,
                messages=[{"role": "user", "content": prompt}],
                response_format={ "type": "json_object" }
            )
            
            content = response.choices[0].message.content
            return json.loads(content)
        except Exception as e:
             raise RuntimeError(f"LLM Refinement Failed: {str(e)}")

    async def test_connection(self, model_override: str, api_key_override: str) -> bool:
        """
        Tests the connection to the LLM with the provided settings.
        Returns True if successful, otherwise raises an exception.
        """
        model = model_override or self.default_model
        try:
            from litellm import acompletion
            await acompletion(
                model=model,
                api_key=api_key_override,
                messages=[{"role": "user", "content": "Say 'ok'"}],
                max_tokens=5
            )
            return True
        except Exception as e:
            raise RuntimeError(f"Connection test failed for {model}: {str(e)}")
