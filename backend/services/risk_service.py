"""
Deterministic hospital operational risk engine.
Evaluates occupancy, forecast trajectories, staffing shortages, ventilator reserves, and emergency inflow.
"""

from typing import Dict, Any


def calculate_operational_risk(
    current_icu_occupancy: float,
    predicted_icu_occupancy: float,
    icu_available_beds: int,
    staff_shortage_flag: int,
    ventilators_available: int,
    icu_admissions: int,
    icu_discharges: int,
    er_arrivals: int,
    ambulance_arrivals: int,
) -> Dict[str, Any]:
    """Calculates deterministic operational risk score (0-10), risk level, and identifies bottleneck factors."""
    components = {}
    risk_factors = []
    positive_trends = []

    # Current ICU occupancy
    if current_icu_occupancy >= 90:
        occupancy_score = 3
        risk_factors.append("Critical ICU occupancy")
    elif current_icu_occupancy >= 80:
        occupancy_score = 2
        risk_factors.append("High ICU occupancy")
    elif current_icu_occupancy >= 70:
        occupancy_score = 1
    else:
        occupancy_score = 0
    components["Current ICU Occupancy"] = occupancy_score

    # Forecast trend
    forecast_change = predicted_icu_occupancy - current_icu_occupancy
    if forecast_change >= 10:
        forecast_score = 2
    elif forecast_change >= 3:
        forecast_score = 1
    elif forecast_change <= -20:
        forecast_score = -1
        positive_trends.append(
            "Forecast indicates a substantial decrease in ICU occupancy"
        )
    else:
        forecast_score = 0
    components["24h Forecast Trend"] = forecast_score

    # ICU beds
    if icu_available_beds <= 2:
        bed_score = 2
        risk_factors.append("Very limited ICU bed availability")
    elif icu_available_beds <= 5:
        bed_score = 1
        risk_factors.append("Limited ICU bed availability")
    else:
        bed_score = 0
    components["ICU Bed Availability"] = bed_score

    # Staffing
    if staff_shortage_flag == 1:
        staff_score = 1
        risk_factors.append("ICU staffing shortage is active")
    else:
        staff_score = 0
    components["Staff Shortage"] = staff_score

    # Ventilators
    if ventilators_available <= 1:
        ventilator_score = 2
        risk_factors.append("Critical ventilator availability")
    elif ventilators_available <= 4:
        ventilator_score = 1
        risk_factors.append("Limited ventilator availability")
    else:
        ventilator_score = 0
    components["Ventilator Availability"] = ventilator_score

    # Patient flow
    net_flow = icu_admissions - icu_discharges
    if net_flow >= 3:
        flow_score = 2
        risk_factors.append("Strong positive ICU patient-flow pressure")
    elif net_flow > 0:
        flow_score = 1
        risk_factors.append("Positive ICU patient-flow pressure")
    else:
        flow_score = 0
    components["ICU Patient Flow"] = flow_score

    # Emergency inflow
    if er_arrivals >= 50 or ambulance_arrivals >= 15:
        emergency_score = 2
        risk_factors.append("Very high emergency patient inflow")
    elif er_arrivals >= 40 or ambulance_arrivals >= 10:
        emergency_score = 1
        risk_factors.append("High emergency patient inflow")
    else:
        emergency_score = 0
    components["Emergency Inflow"] = emergency_score

    raw_score = sum(components.values())
    risk_score = round(min((raw_score / 14) * 10, 10), 1)

    if risk_score >= 8:
        risk_level = "CRITICAL"
    elif risk_score >= 6:
        risk_level = "HIGH"
    elif risk_score >= 3:
        risk_level = "MODERATE"
    else:
        risk_level = "LOW"

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "raw_score": raw_score,
        "risk_components": components,
        "risk_factors": risk_factors,
        "positive_trends": positive_trends,
        "forecast_change": round(forecast_change, 2),
    }
