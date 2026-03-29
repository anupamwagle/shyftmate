"""LLM service — provider-agnostic AI reply for Gator award/EBA interview.

Conversation captures the FULL Kronos Rules Spec structure:
  Version Control → Info (metadata) → Kronos Addl Questions → Employee Type sheets
  → Allowances → Recurring Allowances → Paycodes for Leave → Leave & Holidays
  → Wage Rate Tables → Grade Names → Kronos Config → Review → Complete
"""
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

# ── Conversation nodes (mirrors Excel sheet structure) ─────────────────────────

CONVERSATION_NODES = [
    "intro",
    "agreement_metadata",       # Info sheet: name, number, dates, payroll, probation, notice, super
    "kronos_addl_questions",    # Sheet 3: meal breaks, night shift day-in/out, rounding, rosters
    "employee_types_intro",     # How many emp types, list them
    "emp_type_config",          # Per type: ord hrs, RDO, overnight rule, span, shift definitions
    "rule_lines",               # Per type: ALL rule lines + sub-rules (the heart of the spec)
    "allowances",               # Allowances sheet: name, class C/D/R/P, Kronos name, rates, super
    "recurring_allowances",     # Recurring Allowances sheet: which paycodes have recurring flags
    "leave_paycodes",           # Paycodes for Leave sheet: required vs optional, leave reasons
    "leave_and_holidays",       # Leave accruals, public holidays applicable
    "wage_rate_table",          # Grades, classifications, levels, base rates, all-purpose rates
    "grade_names",              # ExHR grade naming: {exhr_name}.{classification}.{level}
    "kronos_config",            # Kronos Config sheet: rules, access profiles, payrule mappings
    "exhr_config",              # ExHR Config: allowance rates, leave accruals, balance display
    "review",
    "complete",
]

# Fields that must be present in extracted_data before a node is considered complete
NODE_REQUIRED_FIELDS: dict[str, list[str]] = {
    "agreement_metadata": [
        "exhr_eba_name", "agreement_name", "agreement_number",
        "date_effective", "payroll_frequency", "pay_week_definition", "pay_day",
    ],
    "kronos_addl_questions": [
        "meal_break_paid", "night_shift_day_rule", "times_already_rounded",
    ],
    "employee_types_intro": ["employee_types"],
    "emp_type_config": ["emp_type_configs"],
    "rule_lines": ["rule_lines"],
    "allowances": ["allowances"],
    "recurring_allowances": ["recurring_allowances"],
    "leave_paycodes": ["leave_paycodes"],
    "leave_and_holidays": ["leave_types", "applicable_public_holidays"],
    "wage_rate_table": ["wage_grades"],
    "grade_names": ["grade_names"],
    "kronos_config": [
        "kronos_fixed_rule", "kronos_exception_rule", "kronos_rounding_rule",
        "kronos_break_rule", "payrule_mappings",
    ],
    "exhr_config": ["exhr_allowances", "exhr_leave_accruals"],
}

# ── Node prompts (what the AI asks / captures at each node) ────────────────────

NODE_PROMPTS: dict[str, str] = {
    "intro": (
        "Introduce yourself as Aria. Explain you'll capture a complete Kronos/ExHR rules "
        "specification. Ask for the agreement name and whether it's a Modern Award or EBA."
    ),

    "agreement_metadata": """Capture agreement-level metadata. Ask for each in turn:
- ExHR EBA Name (e.g. 'SA WASA Olympic Dam') — the short identifier used in ExHR
- Agreement Name (full legal name)
- Agreement Number (e.g. AG2020/2513 or MA000001)
- Date Effective and Date Expires
- Payroll Frequency (Weekly / Fortnightly / Monthly)
- Pay Week Definition (e.g. Mon-Sun)
- Pay Day (e.g. Wednesday)
- Probation period duration and whether it applies to casuals
- Superannuation fund name (e.g. MySuper) and rate (%)
- Whether E Redundancy Fund applies (and who is excluded)
- Income Protection rate (%) and type (Oncost)
- PIP (Productivity/Project Incentive Payment): applicable? rate? forfeit rules?
- Annual Leave entitlement: days/year (standard vs shift workers)
- Annual Leave Loading %
- Personal Leave entitlement (days/year)
Output as rule_delta with field names: exhr_eba_name, agreement_name, agreement_number,
date_effective, date_expires, payroll_frequency, pay_week_definition, pay_day,
probation_period, probation_applies_to_casuals, super_fund, super_rate,
e_redundancy_applicable, e_redundancy_exclusions, income_protection_rate,
pip_applicable, pip_rate, pip_forfeit_rules, annual_leave_days,
annual_leave_shift_days, annual_leave_loading_pct, personal_leave_days.""",

    "kronos_addl_questions": """Capture Kronos-specific clarification questions:
- Meal break: paid or unpaid? Does it apply to all shifts (or only certain day types)?
- Are hours sent to Kronos including the meal break (i.e. does Kronos need to deduct)?
- Night shift spanning two days (e.g. Fri-Sat): does the shift belong to Day In or Day Out?
- Are clock times already rounded before hitting Kronos?
- Are employees rostered in a Time Capture System (TCS)?
- Leading Hand: is there a leading hand allowance? What is the rate per hour?
Output as rule_delta: meal_break_paid, meal_break_applies_to, meal_break_deduct_in_kronos,
night_shift_day_rule (day_in/day_out), times_already_rounded,
employees_in_tcs, leading_hand_applicable, leading_hand_rate.""",

    "employee_types_intro": """Ask how many employee types are covered (e.g. Full Time & Part Time,
Compressed Roster, Casual). List each type name.
Output rule_delta: employee_types (array of strings, e.g. ["FT & PT", "Compressed Roster", "Casual"])""",

    "emp_type_config": """For EACH employee type, capture:
- Label (e.g. 'FT & PT', 'Casual')
- Ordinary hours per week (e.g. 38, or 'as per schedule' for compressed)
- Ordinary hours per day (e.g. 7.6)
- RDO accrual per day (0 if none)
- Does this EBA have RDO? (Yes/No — affects Kronos payrule mapping)
- Overnight shift rule: Day In or Day Out?
- Ordinary span of hours (e.g. '0600-1800 Mon-Fri')
- Afternoon shift definition (e.g. 'commencing at or after 1pm before 3pm')
- Night shift definition (e.g. 'finishing after midnight at or before 0800')
Output as rule_delta: emp_type_configs (array of objects with keys:
label, emp_type, ord_hours_per_week, ord_hours_per_day, rdo_accrual_per_day,
has_rdo, overnight_shift_rule, ordinary_span, afternoon_shift_definition, night_shift_definition)""",

    "rule_lines": """This is the most detailed section. For EACH employee type, capture ALL rule lines.
Each rule line has:
  - rule_name: the scenario name (e.g. 'Monday - Friday', 'Saturday Scheduled Ordinary Shift')
  - rule_definition: description of what triggers this rule
  - minimum_hours: minimum engagement (e.g. 3 for PT Mon-Fri, 4 for Saturday)
  - clause_ref: agreement clause (e.g. '9.1')
  - page_ref: page number in agreement
  - sub_rules: array of sub-rule lines, each with:
    - kronos_name: exact Kronos paycode name (e.g. 'ORD 1.0', 'OT 1.5', 'PEN 50', 'D-SITE ORD R1')
    - timesheet_input: Kronos duration paycode (e.g. 'WORK_TIME', 'WORK_TIME Requires Schedule', 'PHOL_LEAVE')
    - jde_standard_costing: JDE code (e.g. '809', '821')
    - jde_billing: JDE billing code (e.g. '609', '621')
    - expreshr_name: ExHR element name
    - payslip_name: how it appears on payslip
    - superannuation_applicable: Yes/No
    - build_notes: any special notes

Walk through these day types for EACH emp type:
1. Monday - Friday (ordinary + OT structure)
2. Saturday Scheduled
3. Sunday Scheduled
4. Saturday Unscheduled
5. Sunday Unscheduled
6. Passive Time
7. Public Holiday Not Worked
8. Public Holiday Worked
9. Annual Leave (+ loading variant if shift workers)
10. Night Shift >4 consecutive weeks
11. Afternoon/Night Shift 5 consecutive shifts
12. Afternoon/Night Shift <5 consecutive shifts
13. Workers Comp Suitable Duties Mon-Fri
14. Workers Comp Suitable Duties Saturday
15. Workers Comp Suitable Duties Sunday
16. Unpaid R&R / Stand Down
17. Travel Time (Ordinary and OT)
18. Training Hours

Output rule_delta: rule_lines (array of objects per emp type)""",

    "allowances": """Capture all allowances. For EACH allowance:
- allowance_name: descriptive name
- classification: C (Claimable), D (Derivable), R (Recurring), or P (Payrollable)
- kronos_name: exact Kronos name (e.g. 'C-LAFHA', 'D-SITE ORD R1', 'R-L HAND HRLY R1 ORD')
- jde_standard_costing: JDE code if applicable
- jde_billing: JDE billing code if applicable
- expreshr_name: ExHR element name
- payslip_name: payslip label
- clause_ref: agreement clause
- superannuation_applicable: Yes/No
- minimum_value: minimum amount if applicable
- pro_rata_details: pro-rata rules
- forfeit_rules: when is this allowance forfeited?

Common allowances to ask about:
- LAFHA (Living Away from Home Allowance) — daily rate
- LAFHA Meals
- Overnight Travel
- Overnight Meals
- Leading Hand (Ordinary + OT variants)
- Site Allowance (Ordinary + OT variants, Rate 1 and Rate 2 if applicable)
- Any industry-specific or project-specific allowances

Output rule_delta: allowances (array of objects)""",

    "recurring_allowances": """Capture the recurring allowances configuration for Kronos.
This determines which paycodes trigger automatic recurring allowance calculations.

For each paycode in the rule spec, ask whether it has:
- ord_recurring: should the ordinary recurring allowance apply? (Yes/No)
- ot_recurring: should the OT recurring allowance apply? (Yes/No)

Also capture:
- labour_level_6_convention: naming convention for Labour Level 6 combinations
  (e.g. 'alphabetical order, spaces replaced with _, comma separating allowances')
- combination_names: array of combination names (e.g. 'Flat Leading Hand')
- combination_codes: array of {combination_name, ord_code, ot_code}

Output rule_delta: recurring_allowances (object with paycodes array and combination config)""",

    "leave_paycodes": """Capture the leave paycode configuration.
For each paycode, capture:
- paycode: Kronos paycode name (e.g. 'ANNUAL LEAVE TKN')
- is_required: whether this paycode MUST be configured (true/false)
- category: 'duration' or 'other'
- aus_oracle_leave_reason: the Oracle/ExHR leave reason mapped to this paycode
- export_to_payroll: whether this paycode exports to payroll (true/false)

Cover all standard paycodes: Annual Leave TKN, Personal Leave variants, Long Service Leave,
LWOP variants (Authorised/Unauthorised), Compassionate, Jury Duty, Workers Comp,
Parental Leave, Community Service, and any agreement-specific ones.

Output rule_delta: leave_paycodes (array of objects)""",

    "leave_and_holidays": """Capture leave accrual rules and public holidays.

For each leave type:
- leave_name: e.g. 'Annual Leave', 'Personal Leave', 'Long Service Leave'
- applicable: Yes/No
- accrual_type: 'Per Hour' or 'Per Day'
- accrual_rule: 'Anniversary' or 'Rolling'
- accrual_rate_per_year: hours or days (e.g. '152 hours')
- normal_hours_per_year: standard hours worked in a year (e.g. 1976)
- rdo_accrues_on_this_leave: Yes/No
- forecast_in_kronos: Yes/No
- display_on_payslip: Yes/No
- comments: any special notes

For public holidays, capture which state's public holidays apply and list them.

Output rule_delta: leave_types (array), applicable_public_holidays (array with state and dates)""",

    "wage_rate_table": """Capture the complete wage rate table.

For each grade/classification:
- grade_label: descriptive name (e.g. 'Level 1 - Unskilled (new entrant)')
- classification: the classification name (e.g. 'Level', 'Big Bore Welder', 'HV Electrician')
- level_number: numeric level (1-8 etc.)
- base_rate: hourly rate in dollars
- all_purpose_allowances: any all-purpose allowances included in rate (usually 0)
- all_purpose_rate: total rate including all-purpose allowances

Also capture:
- casual_loading_ordinary_pct: e.g. 25
- casual_loading_ot_pct: e.g. 25
- superannuation_rate_pct: e.g. 9.5

Output rule_delta: wage_grades (array of grade objects), casual_loading_ord_pct,
casual_loading_ot_pct, super_rate_pct""",

    "grade_names": """Capture ExHR grade name format and generate the full grade name list.

The ExHR grade name format is: '{exhr_eba_name}.{classification}.{level}'
Example: 'SA WASA Olympic Dam.Level.1'

For each grade from the wage table, confirm the correct ExHR grade name.
Also check if there are any multi-word classifications that need special handling.

Output rule_delta: grade_names (array of {grade_label, classification, level, exhr_grade_name, base_rate, all_purpose_rate})""",

    "kronos_config": """Capture the complete Kronos configuration.

Payrule components (ask for exact names used in their Kronos instance):
- fixed_rule: e.g. 'Weekly - Mon-Sun'
- exception_rule: e.g. 'Downer Standard'
- rounding_rule: e.g. 'Downer Standard'
- break_rule: e.g. '30Min-Aft5Hrs'
- punch_interpretation_rule: e.g. 'Downer Standard'
- day_divide: e.g. 'N/A' or specific time
- shift_guarantee: e.g. 'N/A' or specific rule
- exception_management: 'create_unapproved' or 'no_unapproved' (create unapproved time before/after schedule?)
- standard_hours: e.g. 40
- work_rules_access_profile: name
- pay_codes_access_profile: name
- activity_profile: e.g. 'Employee'
- access_profile: name
- ll5_timekeeper_group: name

Payrule mapping table — for each combination of:
  EBA × Employment Type (FT/PT/CAS) × RDO flag (RDO/No RDO) × Shift flag (shift/non-shift)
capture the Payrule Name (e.g. 'FT NO RDO SHIFT') and description.

Interactive Processes — what manual Kronos transactions does this agreement require?
(e.g. manager enters duration paycode for rest, higher duties labour transfer, break not taken, claimed allowances)

Output rule_delta: kronos_fixed_rule, kronos_exception_rule, kronos_rounding_rule,
kronos_break_rule, kronos_punch_interpretation_rule, kronos_day_divide,
kronos_shift_guarantee, kronos_exception_management, kronos_standard_hours,
kronos_work_rules_access_profile, kronos_pay_codes_access_profile,
kronos_activity_profile, kronos_access_profile, kronos_ll5_timekeeper_group,
payrule_mappings (array), interactive_processes (array)""",

    "exhr_config": """Capture ExHR configuration details.

For each allowance element:
- element_name: ExHR element name
- rate: rate value and unit (e.g. '$130 per day', '9.5%', '$2.85/hr')
- proration_rules: if any
- forfeit_rules: if any
- forfeit_threshold: if any

For each leave accrual:
- eba_name: ExHR EBA identifier
- leave_name: e.g. 'Annual Leave'
- accrual_type: Per Hour / Per Day
- accrual_rule: Anniversary / Rolling
- accrual_rate_per_year: e.g. '152 hours'
- normal_hours_per_year: e.g. 1976
- comments: any caveats

For accrual balances:
- balance_name: e.g. 'Annual Leave'
- display_on_pay_advice: Yes/No

Output rule_delta: exhr_allowances (array), exhr_leave_accruals (array), exhr_accrual_balances (array)""",

    "review": (
        "Present a complete summary of all captured data organised by section. "
        "Ask the caller to confirm each section is correct. Offer to revisit any section. "
        "List any fields that appear blank or uncertain."
    ),
    "complete": (
        "Thank the user. Confirm the complete Kronos Rules Spec has been saved. "
        "Let them know the admin team will review and can export it to Kronos format."
    ),
}

# ── System prompt ──────────────────────────────────────────────────────────────

SYSTEM_TEMPLATE = """You are Aria, a professional AI consultant specialising in Australian award and EBA configuration for Kronos (UKG Pro WFM) and ExpressHR.

Your task: conduct a structured interview to capture a COMPLETE Kronos Rules Specification — covering all fields needed to build the Kronos payrule and ExHR configuration, ready for import.

## Current Stage
Node: {current_node}
Task: {node_task}

## Data Captured So Far
{extracted_data}

## Rules
1. Be conversational and professional. Use Australian English.
2. Focus on the CURRENT node's task — don't jump ahead.
3. Ask clarifying questions if an answer is ambiguous.
4. For rule lines with sub-rules: capture the PARENT rule name/clause first, then each sub-rule's Kronos name, JDE codes, and super applicable flag.
5. After your response, output a JSON block with any newly captured data:

<rule_delta>
{{"field_name": value, ...}}
</rule_delta>

6. Only include NEWLY captured fields in rule_delta (not previously captured data).
7. Include "node_complete": true in rule_delta ONLY when ALL required fields for this node are captured.
8. Keep responses to 2-4 sentences — this may be a phone interview.
9. Never repeat questions for data already captured.
10. For Kronos names: use EXACT names (e.g. 'ORD 1.0', 'OT 1.5', 'PEN 50', 'D-SITE ORD R1') — these map directly to Kronos paycodes and errors cause import failures.
"""


# ── Provider abstraction ───────────────────────────────────────────────────────

class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, messages: list[dict], system: str) -> str: ...


class AnthropicProvider(LLMProvider):
    def __init__(self):
        import anthropic
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def complete(self, messages: list[dict], system: str) -> str:
        response = await self.client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1500,
            system=system,
            messages=messages,
        )
        return response.content[0].text


class OllamaProvider(LLMProvider):
    def __init__(self):
        settings = get_settings()
        # Strip /v1 suffix — we use native Ollama /api/chat endpoint
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
        url = f"{self.base_url}/api/chat"
        logger.info("[OLLAMA] POST %s  model=%s  msgs=%d", url, self.model, len(payload["messages"]))
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            content = data["message"]["content"]
            # Strip <think>...</think> blocks (deepseek-r1 reasoning model)
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            logger.info("[OLLAMA] Reply received — %d chars", len(content))
            return content


_provider_instance: Optional[LLMProvider] = None
_provider_config: tuple[str, str] = ("", "")


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
        logger.info("LLM provider: %s (model=%s)", settings.LLM_PROVIDER, settings.OLLAMA_MODEL)
    return _provider_instance


# ── Core parsing & state management ───────────────────────────────────────────

def _parse_rule_delta(text: str) -> tuple[str, dict]:
    """Extract <rule_delta>...</rule_delta> JSON from LLM response."""
    pattern = r"<rule_delta>\s*(.*?)\s*</rule_delta>"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return text.strip(), {}
    clean_text = re.sub(pattern, "", text, flags=re.DOTALL).strip()
    try:
        delta = json.loads(match.group(1))
        return clean_text, delta
    except json.JSONDecodeError:
        logger.warning("Failed to parse rule_delta JSON: %s", match.group(1)[:200])
        return clean_text, {}


def _advance_node(current_node: str, extracted_data: dict, delta: dict) -> str:
    """Advance to next node when AI signals node_complete."""
    if not delta.get("node_complete"):
        return current_node
    idx = CONVERSATION_NODES.index(current_node) if current_node in CONVERSATION_NODES else 0
    if idx < len(CONVERSATION_NODES) - 1:
        return CONVERSATION_NODES[idx + 1]
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
    # Load last 20 messages for context
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
    )
    recent = list(reversed(result.scalars().all()))

    messages = [
        {"role": m.role if m.role in ("user", "assistant") else "user", "content": m.content}
        for m in recent
    ]
    messages.append({"role": "user", "content": user_message})

    current_node = session.current_node or "intro"
    extracted_data = session.extracted_data or {}
    node_task = NODE_PROMPTS.get(current_node, "Continue the interview.")

    system_prompt = SYSTEM_TEMPLATE.format(
        current_node=current_node,
        node_task=node_task,
        extracted_data=json.dumps(extracted_data, indent=2) if extracted_data else "Nothing captured yet.",
    )

    provider = get_llm_provider()
    logger.info(
        "[LLM] session=%s node=%s  msg_count=%d",
        session.id, current_node, len(messages),
    )
    try:
        raw = await provider.complete(messages, system_prompt)
    except Exception as e:
        logger.error("[LLM] Provider error for session=%s: %s", session.id, e)
        return "I'm sorry, I had trouble processing that. Could you please repeat?", {}

    clean_response, delta = _parse_rule_delta(raw)

    # Merge delta into session
    delta_without_meta = {k: v for k, v in delta.items() if k != "node_complete"}
    if delta_without_meta:
        extracted_data.update(delta_without_meta)
        session.extracted_data = extracted_data

    new_node = _advance_node(current_node, extracted_data, delta)
    if new_node != current_node:
        logger.info("[LLM] session=%s node advanced: %s → %s", session.id, current_node, new_node)
    session.current_node = new_node

    if new_node == "complete":
        session.is_complete = True
        session.completed_at = datetime.now(timezone.utc)
        logger.info("[LLM] session=%s COMPLETE", session.id)

    return clean_response, delta_without_meta
