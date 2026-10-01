"""The prompts the candidate models receive. They are the PRODUCTION prompts (so the test measures what users would get):
  DRIVER / OWNER / VENDOR  utils/ai_llm.SYSTEM_TEMPLATE with the live rules text
  CUSTOMER                 crud/chat_bot.CUSTOMER_TEMPLATE
  ADMIN                    crud/admin_assistant.SYSTEM + the real tool list, answered as JSON (so models without native tool calling,
                           such as a local model, can be tested the same way)
"""
import json
import types
from typing import Any, Dict, List

OUTPUT_SPEC_ADMIN = (
    "\n\nHOW TO ANSWER (strict): reply with ONLY one JSON object and nothing else. Either call exactly one tool: "
    '{"tool": "<tool name>", "args": {...}} using only the tools listed below, or answer in words: '
    '{"reply": "<text>", "needs_human": false, "suggestions": []}. '
    "If details are missing or the request is for many items at once, answer in words and ask which one. You cannot execute anything: "
    "the propose_* tools only prepare one action for a person to confirm."
)


def _owner():
    return types.SimpleNamespace(role="Owner", permissions=[], username="eval", id="eval")


def tool_specs() -> List[Dict[str, Any]]:
    """The real tools the admin assistant offers (read tools + propose_* actions), as {name, description, input_schema}."""
    from app.crud import admin_assistant as AA
    return [{k: v for k, v in t.items() if k != "cache_control"} for t in AA.tool_defs(_owner(), True)]


def tool_names() -> List[str]:
    return [t["name"] for t in tool_specs()]


def rules_text() -> str:
    from app.utils import ai_llm
    return ai_llm._rules_text(None)            # no database: the platform defaults


def system_for(item: Dict[str, Any]) -> str:
    role = item["role"]
    if role == "ADMIN":
        from app.crud import admin_assistant as AA
        return AA.SYSTEM + OUTPUT_SPEC_ADMIN + "\n\nTOOLS:\n" + json.dumps(tool_specs(), ensure_ascii=False)
    if role == "CUSTOMER":
        from app.crud import chat_bot
        return chat_bot.CUSTOMER_TEMPLATE.format(fee=30, facts=item["facts"])
    from app.utils import ai_llm
    return ai_llm.SYSTEM_TEMPLATE.format(rules=rules_text(), knowledge="", facts=item["facts"])
