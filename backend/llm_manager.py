import os
import json
from typing import Dict, Any, List, Optional
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
        api_key_override: str = None,
        preferences: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generates AS-IS/TO-BE diagrams and summary from raw context.
        """
        model = model_override or self.default_model
        preferences = preferences or {"generate_sequence": True, "generate_c4": False}
        
        c4_instructions = ""
        c4_schema = ""
        if preferences.get("generate_c4", False):
            c4_instructions = (
                "You must also generate structural C4 models (Context, Container, Component levels) using valid Mermaid syntax (e.g., C4Context, C4Container, C4Component). "
                "CRITICAL MERMAID RULE: In C4 diagrams, every single system, container, or component referenced in a Rel() MUST be explicitly declared first "
                "using System(), System_Ext(), Container(), Component(), etc., before creating relationships. Do not use undeclared aliases in Rel() statements."
            )
            c4_schema = '''
            "c4_context": "A Mermaid C4Context diagram string.",
            "c4_container": "A Mermaid C4Container diagram string.",
            "c4_component": "A Mermaid C4Component diagram string.",'''
            
        sequence_instructions = ""
        sequence_schema = ""
        if preferences.get("generate_sequence", True):
            sequence_instructions = "You must generate behavioral sequence diagrams using valid Mermaid format representing the AS-IS and TO-BE states."
            sequence_schema = '''
            "as_is_diagram": "A Mermaid sequence diagram string representing the current state.",
            "to_be_diagram": "A Mermaid sequence diagram string representing the proposed future state.",'''

        system_prompt = f"""
        You are an expert Solution Architect. 
        Your goal is to parse the provided context and generate a structured architectural snapshot.
        
        GLOBAL ARCHITECT CONSTRAINTS & STANDARDS (MANDATORY):
        The following standards MUST be applied to the TO-BE architecture and summary. If they conflict with the current state, prioritized these standards:
        {profile_context}
        
        {sequence_instructions}
        {c4_instructions}
        
        You MUST return valid JSON matching this schema:
        {{  {sequence_schema}{c4_schema}
            "architecture_summary": "A detailed markdown summary of the architecture.",
            "key_questions": ["A list of outstanding questions for the client."],
            "pending_tasks": ["A list of tasks to be followed up."]
        }}
        Fields you are not asked to generate should be omitted or null. Ensure the output is strictly valid JSON.
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
        profile_context: str = "",
        model_override: str = None,
        api_key_override: str = None,
        preferences: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Refines the current architecture state based on user feedback.
        """
        model = model_override or self.default_model
        preferences = preferences or {"generate_sequence": True, "generate_c4": False}
        
        prompt = f"""
        You are an expert Solution Architect. 
        GLOBAL ARCHITECT CONSTRAINTS & STANDARDS (MANDATORY):
        The following standards MUST be maintained in the refined state:
        {profile_context}

        CRITICAL MERMAID RULE: If you generate or modify C4 diagrams, every single system, container, or component referenced in a Rel() MUST be explicitly declared first using System(), System_Ext(), Container(), Component(), etc., before creating relationships. Do not use undeclared aliases in Rel() statements.

        Current Architectural State:
        {json.dumps(current_state, indent=2)}

        User Feedback/Clarification:
        {feedback}

        Update the architectural state based on this feedback while STRICTLY adhering to the GLOBAL ARCHITECT CONSTRAINTS. 
        Return the updated JSON object preserving the same keys present in the current state.
        Your generation of C4 or Sequence diagrams should depend entirely on what is requested in the feedback and what exists in the current state.
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

    async def context_chat(
        self,
        question: str,
        context_chunks: List[str],
        context_names: List[str],
        history: List[Dict[str, str]],
        model_override: str = None,
        api_key_override: str = None,
    ) -> Dict[str, Any]:
        """
        Answers a user question grounded in the provided context chunks.
        Returns the answer text and the source_type ('context' or 'llm').
        """
        model = model_override or self.default_model
        has_context = bool(context_chunks)

        if has_context:
            context_block = "\n\n---\n\n".join(
                f"[Source: {name}]\n{chunk}"
                for name, chunk in zip(context_names, context_chunks)
            )
            system_prompt = f"""You are a knowledgeable assistant with access to a project's context documents.
Answer the user's question using ONLY the provided context passages below.
Always mention the source name when referencing a specific piece of information (e.g., "According to [Source: X]...").
If the context does not contain enough information to answer, say so clearly — do not hallucinate.

PROJECT CONTEXT:
{context_block}
"""
        else:
            system_prompt = """You are a knowledgeable assistant. No project context was found relevant to this question.
Answer based on your general knowledge and clearly state that your answer is not based on the project's documents."""

        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": question})

        try:
            from litellm import acompletion
            response = await acompletion(
                model=model,
                api_key=api_key_override,
                messages=messages,
            )
            answer = response.choices[0].message.content
            source_type = "context" if has_context else "llm"
            return {"answer": answer, "source_type": source_type}
        except Exception as e:
            raise RuntimeError(f"LLM Context Chat Failed: {str(e)}")

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
