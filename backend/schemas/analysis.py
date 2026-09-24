"""
Pydantic models for policy results and complete analysis response.
"""

from typing import List, Dict, Optional
from pydantic import BaseModel
from backend.schemas.operational import HospitalState, HospitalObservation


class PolicyResult(BaseModel):
    document: str
    category: str
    content: str
    similarity: float


class AnalysisResponse(BaseModel):
    current_occupancy: float
    predicted_occupancy_24h: float
    delta: float
    risk_score: float
    risk_level: str
    risk_components: Dict[str, int]
    risk_factors: List[str]
    positive_trends: List[str]
    forecast_change: float
    hospital_state: HospitalState
    latest_observation: Optional[HospitalObservation] = None
    dataset_name: Optional[str] = "Operational data.xlsx"
    retrieved_policies: List[PolicyResult]
    ai_response: str
    timestamp: str
