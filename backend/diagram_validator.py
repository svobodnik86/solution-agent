"""
Utilities for cleaning and validating Mermaid diagram strings produced by the LLM.
"""
import re
from typing import Dict, List, Optional, Tuple

SEQUENCE_KEYWORD = "sequenceDiagram"

# Maps snapshot field name -> required opening keyword
DIAGRAM_FIELDS: Dict[str, str] = {
    "as_is_diagram": SEQUENCE_KEYWORD,
    "to_be_diagram": SEQUENCE_KEYWORD,
    "c4_context": "C4Context",
    "c4_container": "C4Container",
    "c4_component": "C4Component",
}

C4_FIELDS = {"c4_context", "c4_container", "c4_component"}

# C4 declaration functions that introduce an alias as their first argument
_C4_DECL_PATTERN = re.compile(
    r"\b(?:System|System_Ext|System_Boundary|Person|Person_Ext"
    r"|Container|Container_Ext|Component|Component_Ext"
    r"|SystemDb|SystemDb_Ext|SystemQueue|SystemQueue_Ext"
    r"|ContainerDb|ContainerDb_Ext|ContainerQueue|ContainerQueue_Ext"
    r"|ComponentDb|ComponentDb_Ext|ComponentQueue|ComponentQueue_Ext"
    r"|Enterprise_Boundary|Boundary)"
    r"\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)",
    re.MULTILINE,
)

# Rel() variants — first two positional args are from/to aliases
_C4_REL_PATTERN = re.compile(
    r"\bRel(?:_Back|_Neighbor|_Up|_Down|_Left|_Right)?"
    r"\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)",
    re.MULTILINE,
)

# Common invalid Mermaid sequence diagram patterns
_INVALID_SEQUENCE_PATTERNS = [
    # Multiple participants with slash: participant1/participant2->>
    (r'[A-Za-z_][A-Za-z0-9_]*/[A-Za-z_][A-Za-z0-9_]*[-\>]+', 
     "Invalid syntax: Multiple participants with '/' not allowed. Use separate arrows or an alt/loop block."),
    
    # Note over with potential syntax issues
    (r'Note over\s+[^:]+[^:\w\s,]', 
     "Invalid Note over syntax: Should be 'Note over A,B,C: Text' with proper colon and text."),
    
    # Missing colon after Note over
    (r'Note over\s+[^:]+$', 
     "Invalid Note over syntax: Missing colon and text after participant list."),
    
    # Arrow with invalid characters
    (r'[-\>]+\s*[^:\w\s]', 
     "Invalid arrow syntax: Arrow should be followed by participant and ': Text'."),
]

# Participant declaration pattern for sequence diagrams
_SEQUENCE_PARTICIPANT_PATTERN = re.compile(
    r'^\s*participant\s+([A-Za-z_][A-Za-z0-9_]*)',
    re.MULTILINE
)

# Note over pattern to extract participants
_NOTE_OVER_PATTERN = re.compile(
    r'Note over\s+([^:]+):',
    re.MULTILINE
)


def clean_diagram(diagram: str) -> str:
    """Strip markdown code fences and surrounding whitespace."""
    if not diagram:
        return diagram
    s = diagram.strip()
    # Remove opening fence: ```mermaid or ```
    s = re.sub(r"^```[a-zA-Z]*\s*\n?", "", s)
    # Remove closing fence
    s = re.sub(r"\n?```\s*$", "", s)
    return s.strip()


def validate_diagram(diagram: str, field_name: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a single diagram string.
    Returns (is_valid, error_message). error_message is None when valid.
    """
    if not diagram or not diagram.strip():
        return True, None  # empty → nothing to render, not an error

    expected = DIAGRAM_FIELDS.get(field_name)
    if expected is None:
        return True, None  # unknown field, skip

    stripped = diagram.strip()
    if not stripped.startswith(expected):
        snippet = stripped[:60].replace("\n", " ")
        return False, (
            f"Expected diagram to start with '{expected}' but got: '{snippet}...'"
        )

    # Validate sequence diagram syntax
    if field_name in ["as_is_diagram", "to_be_diagram"]:
        # Check for common invalid patterns
        for pattern, error_msg in _INVALID_SEQUENCE_PATTERNS:
            if re.search(pattern, diagram, re.MULTILINE):
                return False, f"Sequence diagram error: {error_msg}"
        
        # Extract declared participants
        declared_participants = set()
        for match in _SEQUENCE_PARTICIPANT_PATTERN.finditer(diagram):
            declared_participants.add(match.group(1))
        
        # Check Note over references
        for match in _NOTE_OVER_PATTERN.finditer(diagram):
            participants_str = match.group(1).strip()
            # Split by comma and clean up
            participants = [p.strip() for p in participants_str.split(',')]
            for participant in participants:
                if participant and participant not in declared_participants:
                    return False, (
                        f"Note over references undeclared participant: '{participant}'. "
                        f"All participants in 'Note over' must be declared with 'participant' first. "
                        f"Declared participants: {sorted(declared_participants)}"
                    )

    # Validate C4 diagram syntax
    if field_name in C4_FIELDS:
        declared = {m.group(1) for m in _C4_DECL_PATTERN.finditer(diagram)}
        undeclared: List[str] = []
        for m in _C4_REL_PATTERN.finditer(diagram):
            for alias in (m.group(1), m.group(2)):
                if alias not in declared and alias not in undeclared:
                    undeclared.append(alias)
        if undeclared:
            return False, (
                f"Rel() references undeclared aliases: {', '.join(undeclared)}. "
                "Each alias must be declared with System(), Container(), Component(), etc. "
                "before it appears in a Rel() statement."
            )

    return True, None


def validate_and_clean_snapshot(
    snapshot: Dict,
) -> Tuple[Dict, List[Tuple[str, str]]]:
    """
    Clean and validate all diagram fields in a snapshot dict.

    Returns:
        cleaned_snapshot: dict with code-fence-stripped diagram strings
        errors: list of (field_name, error_message) for diagrams that failed validation
    """
    cleaned = dict(snapshot)
    errors: List[Tuple[str, str]] = []

    for field_name in DIAGRAM_FIELDS:
        raw = cleaned.get(field_name)
        if not raw:
            continue
        cleaned[field_name] = clean_diagram(raw)
        ok, msg = validate_diagram(cleaned[field_name], field_name)
        if not ok:
            errors.append((field_name, msg))

    return cleaned, errors
