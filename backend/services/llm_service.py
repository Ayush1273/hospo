"""
Google Gemini grounded decision support synthesis and deterministic fallback service.
"""

from typing import List, Dict, Any, Union
from backend.core.config import GEMINI_MODEL
from backend.core.resources import resources
from backend.schemas.analysis import PolicyResult
from backend.schemas.operational import OperationalInput, HospitalObservation


def build_grounded_prompt(
    decision_context: str,
    retrieved_policies: List[PolicyResult],
) -> str:
    policy_blocks = []
    for i, p in enumerate(retrieved_policies, start=1):
        policy_blocks.append(
            f"--- POLICY {i} ---\n"
            f"Document: {p.document}\n"
            f"Category: {p.category}\n"
            f"Policy Content:\n{p.content}\n"
        )
    policy_context = "\n".join(policy_blocks)

    return f"""You are the explanation layer of HOSP-AI COMMAND, an administrative hospital operational decision-support prototype.

SYSTEM RULES:
- Use only the supplied hospital data, ML forecast, deterministic risk assessments and retrieved policies.
- Do not recalculate or change the supplied hospital risk score.
- Do not invent thresholds.
- Do not invent policies.
- Do not provide patient-level treatment advice.
- Do not diagnose patients.
- Clearly distinguish current conditions from the forecast.
- Human administrator review is required before action.

CURRENT DECISION CONTEXT
========================
{decision_context}

RETRIEVED POLICY CONTEXT
========================
{policy_context}

RETURN EXACTLY THESE SECTIONS:
1. Operational Situation
2. Predicted Risk
3. Key Risk Factors
4. Recommended Actions
5. Forecast Trend & Human Review

For Predicted Risk, report the supplied values exactly.
Give no more than 6 operational recommendations.
Do not provide patient-level medical recommendations.
Format cleanly in GitHub markdown suitable for hospital leadership."""


def generate_ai_decision_support(
    risk_result: Dict[str, Any],
    current_icu_occupancy: float,
    predicted_icu_occupancy: float,
    retrieved_policies: List[PolicyResult],
    obs: Union[Dict[str, Any], HospitalObservation, OperationalInput],
) -> str:
    if hasattr(obs, "model_dump"):
        obs_dict = obs.model_dump()
    elif hasattr(obs, "dict"):
        obs_dict = obs.dict()
    elif isinstance(obs, dict):
        obs_dict = obs
    else:
        obs_dict = vars(obs)

    icu_available_beds = obs_dict.get("icu_available_beds", 0)
    ventilators_available = obs_dict.get("ventilators_available", 0)
    icu_staff_available = obs_dict.get("icu_staff_available", 0)
    staff_shortage = obs_dict.get("staff_shortage", "NO")
    icu_admissions = obs_dict.get("icu_admissions", 0)
    icu_discharges = obs_dict.get("icu_discharges", 0)
    er_arrivals = obs_dict.get("er_arrivals", 0)
    ambulance_arrivals = obs_dict.get("ambulance_arrivals", 0)
    ts = obs_dict.get("timestamp", "Latest observation")

    risk_factors_list = [f"- {f}" for f in risk_result.get("risk_factors", [])]
    risk_factors_text = (
        "\n".join(risk_factors_list)
        if risk_factors_list
        else "- No critical risk bottlenecks detected."
    )

    decision_context = f"""CURRENT HOSPITAL STATUS
Latest HMS Timestamp: {ts}
Current ICU Occupancy: {current_icu_occupancy:.2f}%
ICU Beds Available: {icu_available_beds}
Ventilators Available: {ventilators_available}
ICU Staff Available: {icu_staff_available}
Staff Shortage: {staff_shortage}
ICU Admissions: {icu_admissions}
ICU Discharges: {icu_discharges}
ER Arrivals: {er_arrivals}
Ambulance Arrivals: {ambulance_arrivals}

24-HOUR ML FORECAST
Predicted ICU Occupancy: {predicted_icu_occupancy:.2f}%

HOSPITAL OPERATIONAL RISK
Risk Score: {risk_result["risk_score"]} / 10
Risk Level: {risk_result["risk_level"]}
Risk Factors:
{risk_factors_text}"""

    prompt = build_grounded_prompt(decision_context, retrieved_policies)

    if resources.gemini_client:
        try:
            response = resources.gemini_client.models.generate_content(
                model=GEMINI_MODEL, contents=prompt
            )
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            print("[HOSP-AI] Gemini API generation error:", e)

    # Deterministic fallback explanation if Gemini is unavailable
    forecast_change = risk_result.get("forecast_change", 0.0)
    trend_desc = (
        "increasing occupancy pressure"
        if forecast_change > 0
        else "easing occupancy pressure"
        if forecast_change < 0
        else "stable occupancy"
    )

    return f"""### 1. Operational Situation
The ICU is currently operating at **{current_icu_occupancy:.2f}%** capacity with **{icu_available_beds}** available beds and **{ventilators_available}** available ventilators. Intake volume shows **{er_arrivals}** emergency arrivals and **{ambulance_arrivals}** ambulance deliveries.

### 2. Predicted Risk
- **ML 24h Forecast**: {predicted_icu_occupancy:.2f}% ICU Occupancy ({forecast_change:+.2f} pp change)
- **Hospital Risk Score**: **{risk_result["risk_score"]} / 10**
- **Risk Category**: **{risk_result["risk_level"]}**

### 3. Key Risk Factors
{risk_factors_text}

### 4. Recommended Actions
- **Census Management**: Coordinate with step-down HDU and general wards for eligible discharge candidates.
- **Resource Protection**: Preserve emergency ventilator reserve and verify pipeline delivery status.
- **Staffing Alignment**: Ensure on-call nursing roster is placed on active standby if census exceeds 85%.
- **Emergency Inflow Control**: Monitor ambulance diversion protocols if intake pressure continues.


### 5. Forecast Trend & Human Review
Forecast indicates {trend_desc} over the next 24 hours. Operational actions require clinical supervisor and administrative huddle confirmation."""
