import json
import logging
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.conversation import ChatMessage, ConversationSession

logger = logging.getLogger(__name__)

# ── Conversation nodes ────────────────────────────────────────

CONVERSATION_NODES = [
    "intro",
    "agreement_metadata",
    "employee_types_intro",
    "emp_type_basics",
    "shift_definitions",
    "day_scenarios",
    "public_holiday_rules",
    "leave_rules",
    "night_shift_rules",
    "workers_comp_rules",
    "allowances",
    "leave_paycodes",
    "wage_rate_table",
    "kronos_config",
    "payrule_mappings",
    "review",
    "complete",
]

NODE_REQUIRED_FIELDS: dict[str, list[str]] = {
    "agreement_metadata": ["agreement_name", "agreement_code", "agreement_type"],
    "emp_type_basics": ["employee_types"],
    "shift_definitions": ["shift_definitions"],
    "day_scenarios": ["day_scenarios"],
    "public_holiday_rules": ["public_holiday_rules"],
    "leave_rules": ["leave_rules"],
    "night_shift_rules": ["night_shift_rules"],
    "workers_comp_rules": ["workers_comp"],
    "allowances": ["allowances"],
    "leave_paycodes": ["leave_paycodes"],
    "wage_rate_table": ["wage_grades"],
    "kronos_config": ["kronos_config"],
    "payrule_mappings": ["payrule_mappings"],
}

NODE_PROMPTS: dict[str, str] = {
    "intro": (
        "Introduce yourself as Aria, a professional AI consultant. "
        "Explain you'll help capture the award/EBA rule specification. "
        "Ask for the agreement name and type (Modern Award or EBA)."
    ),
    "agreement_metadata": (
        "Capture: agreement name, agreement code (e.g. MA000001), agreement type, "
        "effective dates, payroll frequency, pay week definition, and pay day. "
        "Ask clarifying questions as needed."
    ),
    "employee_types_intro": (
        "Ask how many employee types (e.g. Full Time, Part Time, Casual) are covered under this agreement."
    ),
    "emp_type_basics": (
        "For each employee type, capture: ordinary hours per week, ordinary hours per day, "
        "RDO accrual per day (if applicable), and overnight shift rule."
    ),
    "shift_definitions": (
        "Capture shift definitions: ordinary span of hours, afternoon shift start/end criteria, "
        "night shift start/end criteria."
    ),
    "day_scenarios": (
        "Walk through each day type scenario: Monday-Friday ordinary, Saturday, Sunday, "
        "and their applicable penalties or loadings."
    ),
    "public_holiday_rules": (
        "Capture public holiday penalty rates, substitution rules, and any special conditions."
    ),
    "leave_rules": (
        "Capture leave rules: annual leave loading, personal/carer's leave, long service leave rules."
    ),
    "night_shift_rules": (
        "Capture night shift penalty rates, qualifications, and any specific conditions."
    ),
    "workers_comp_rules": (
        "Capture workers compensation rules and any makeup pay obligations."
    ),
    "allowances": (
        "Capture all allowances: name, rule definition, class (Claimable/Derivable/Recurring/Payrollable), "
        "Kronos name, and payslip name for each."
    ),
    "leave_paycodes": (
        "Capture leave paycodes: each paycode, whether it's required, and its category."
    ),
    "wage_rate_table": (
        "Capture the wage rate table: all grades/levels, classifications, and hourly rates."
    ),
    "kronos_config": (
        "Capture Kronos configuration: fixed rule, exception rule, rounding rule, break rule, "
        "punch interpretation rule, day divide, shift guarantee, work rules access profile, "
        "pay codes access profile, standard hours."
    ),
    "payrule_mappings": (
        "Capture payrule mappings: for each rule line, the Kronos pay rule name and JDE billing code."
    ),
    "review": (
        "Summarise all captured data and ask the caller to confirm everything is correct. "
        "Ask if they want to change anything."
    ),
    "complete": (
        "Thank the caller for their time. Let them know an admin will review and provision their account shortly."
    ),
}

SYSTEM_TEMPLATE = """You are Aria, a professional and warm AI consultant specialising in Australian award and enterprise bargaining agreement (EBA) configuration.

Your task is to conduct a structured interview to capture the complete award/EBA rule specification from the caller. Be conversational, concise, and professional. Use Australian English.

## Current Interview Stage
Node: {current_node}
Task: {node_task}

## Data Captured So Far
{extracted_data}

## Instructions
1. Respond naturally in 1-3 sentences to continue the interview.
2. Focus on the current node's task.
3. After your conversational response, if you have captured any new structured data, output it as a JSON block:

<rule_delta>
{{"field_name": "value", ...}}
</rule_delta>

4. Only include fields in rule_delta that are newly captured in THIS turn.
5. If the current node is complete based on captured data, include "node_complete": true in rule_delta.
6. Keep responses brief — this is a phone call.
7. Never repeat questions already answered.
"""


# ── Provider abstraction ──────────────────────────────────────

class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, messages: list[dict], system: str) -> str:
        ...


class AnthropicProvider(LLMProvider):
    def __init__(self):
        import anthropic
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def complete(self, messages: list[dict], system: str) -> str:
        response = await self.client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            system=system,
            messages=messages,
        )
        return response.content[0].text


class OllamaProvider(LLMProvider):
    def __init__(self):
        settings = get_settings()
        # Strip /v1 suffix if present — we use the native Ollama /api/chat endpoint
        base = settings.OLLAMA_BASE_URL.rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3]
        self.base_url = base
        self.model = settings.OLLAMA_MODEL

    async def complete(self, messages: list[dict], system: str) -> str:
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}] + messages,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
            content = data["message"]["content"]
            # Strip <think>...</think> blocks emitted by reasoning models (e.g. deepseek-r1)
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            return content


_provider_instance: Optional[LLMProvider] = None
_provider_config: tuple[str, str] = ("", "")  # (LLM_PROVIDER, OLLAMA_MODEL)


def get_llm_provider() -> LLMProvider:
    global _provider_instance, _provider_config
    settings = get_settings()
    current_config = (settings.LLM_PROVIDER, settings.OLLAMA_MODEL)
    if _provider_instance is None or current_config != _provider_config:
        match settings.LLM_PROVIDER:
            case "anthropic":
                _provider_instance = AnthropicProvider()
            case _:
                _provider_instance = OllamaProvider()
        _provider_config = current_config
        logger.info("LLM provider initialised: %s (model=%s)", settings.LLM_PROVIDER, settings.OLLAMA_MODEL)
    return _provider_instance


# ── Core AI reply function ────────────────────────────────────

def _parse_rule_delta(text: str) -> tuple[str, dict]:
    """Extract <rule_delta>...</rule_delta> from LLM response."""
    pattern = r"<rule_delta>\s*(.*?)\s*</rule_delta>"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return text.strip(), {}

    clean_text = re.sub(pattern, "", text, flags=re.DOTALL).strip()
    try:
        delta = json.loads(match.group(1))
        return clean_text, delta
    except json.JSONDecodeError:
        logger.warning("Failed to parse rule_delta JSON: %s", match.group(1))
        return clean_text, {}


def _advance_node(current_node: str, extracted_data: dict, delta: dict) -> str:
    """Advance to the next node if current node is complete."""
    if not delta.get("node_complete"):
        return current_node

    node_index = CONVERSATION_NODES.index(current_node) if current_node in CONVERSATION_NODES else 0
    if node_index < len(CONVERSATION_NODES) - 1:
        return CONVERSATION_NODES[node_index + 1]
    return current_node


async def get_ai_reply(
    session: ConversationSession,
    user_message: str,
    db: AsyncSession,
) -> tuple[str, dict]:
    """
    Returns (assistant_text, rule_delta_dict).
    Updates session.extracted_data and session.current_node in-place (caller must commit).
    """
    # Load last 20 messages
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
    )
    recent_messages = list(reversed(result.scalars().all()))

    messages = [
        {"role": msg.role if msg.role in ("user", "assistant") else "user", "content": msg.content}
        for msg in recent_messages
    ]
    # Add current user message
    messages.append({"role": "user", "content": user_message})

    current_node = session.current_node or "intro"
    extracted_data = session.extracted_data or {}
    node_task = NODE_PROMPTS.get(current_node, "Continue the interview.")

    system_prompt = SYSTEM_TEMPLATE.format(
        current_node=current_node,
        node_task=node_task,
        extracted_data=json.dumps(extracted_data, indent=2) if extracted_data else "None yet",
    )

    provider = get_llm_provider()
    try:
        raw_response = await provider.complete(messages, system_prompt)
    except Exception as e:
        logger.error("LLM provider error: %s", e)
        return "I'm sorry, I had trouble processing that. Could you please repeat?", {}

    clean_response, delta = _parse_rule_delta(raw_response)

    # Update session data
    delta_without_meta = {k: v for k, v in delta.items() if k != "node_complete"}
    if delta_without_meta:
        extracted_data.update(delta_without_meta)
        session.extracted_data = extracted_data

    new_node = _advance_node(current_node, extracted_data, delta)
    session.current_node = new_node

    if new_node == "complete":
        session.is_complete = True
        session.completed_at = datetime.now(timezone.utc)

    return clean_response, delta_without_meta
