"""
Schemas for Pharmacy Medicine Intelligence and Demand Forecasting.
"""

from typing import List, Optional
from pydantic import BaseModel


class MedicineOption(BaseModel):
    medicine_name: str
    category: str
    criticality: str
    current_stock: Optional[float] = None
    stockout_risk: Optional[str] = None
    expiry_risk: Optional[str] = None


class MedicineRecord(BaseModel):
    month: str
    medicine_id: str
    medicine_name: str
    category: str
    criticality: str
    opening_stock: float
    consumed_units: float
    restocked_units: float
    current_stock: float
    average_daily_usage: float
    lead_time_days: float
    minimum_stock: float
    expiry_date: str
    days_of_stock_remaining: float
    stock_status: str
    stockout_risk: str
    days_to_expiry: float
    expiry_risk: str


class ConsumptionPoint(BaseModel):
    month: str
    month_label: str
    consumed_units: float


class DemandForecastPoint(BaseModel):
    month: str
    month_label: str
    forecast_consumption: int
    projected_stock: float


class PharmacyForecastMetrics(BaseModel):
    current_stock: Optional[float] = None
    forecast_days_of_stock: Optional[float] = None
    is_coverage_infinite: bool = False
    lead_time_demand: float
    reorder_quantity: float
    total_forecast_demand: float
    projected_stockout_month: Optional[str] = None
    forecast_daily_usage: float


class MedicineIntelligenceResponse(BaseModel):
    selected_medicine: str
    current_record: MedicineRecord
    history: List[ConsumptionPoint]
    forecast: List[DemandForecastPoint]
    forecast_method: str
    metrics: PharmacyForecastMetrics
    has_projected_stockout: bool
    stockout_message: str


# ================================================================
# PART 2: 90-DAY PREDICTIVE INTELLIGENCE (ML FORECASTING) SCHEMAS
# ================================================================


class PredictiveMedicineSummary(BaseModel):
    medicine_name: str
    medicine_id: str
    category: str
    criticality: str
    record_count: int
    min_date: str
    max_date: str
    total_consumed: float
    avg_daily_consumed: float


class DatasetSummaryResponse(BaseModel):
    filename: str
    is_default: bool
    total_records: int
    min_date: str
    max_date: str
    days_covered: int
    medicines_count: int
    medicines: List[PredictiveMedicineSummary]
    message: str


class PredictDemandRequest(BaseModel):
    medicine_name: str
    horizon_days: int = 90
    current_stock: Optional[float] = None


class DailyForecastPoint(BaseModel):
    date: str
    day_index: int
    day_name: str
    predicted_units: float
    rolling_7d_avg: float


class RecentHistoryPoint(BaseModel):
    date: str
    consumed_units: float


class MonthWiseForecast(BaseModel):
    month_key: str
    month_label: str
    total_units: float
    avg_daily_units: float
    days_count: int
    pct_of_total: float


class PeakUsageDay(BaseModel):
    date: str
    units: float
    day_name: str


class PredictDemandResponse(BaseModel):
    medicine_name: str
    medicine_id: str
    category: str
    criticality: str
    dataset_filename: str
    historical_days_used: int
    last_historical_date: str
    horizon_start: str
    horizon_end: str
    total_90d_demand: float
    avg_daily_demand: float
    # Part 1 Telemetry & Stock Runout Metrics:
    current_stock: float
    past_month_total_consumed: float
    last_month_avg_daily_consumed: float
    days_of_stock_remaining: float
    stockout_projected_date: Optional[str] = None
    stock_status_signal: str
    # Part 2 Predictions:
    peak_day: PeakUsageDay
    lowest_day: PeakUsageDay
    month_wise: List[MonthWiseForecast]
    daily_forecast: List[DailyForecastPoint]
    recent_history: List[RecentHistoryPoint]
    features_used: int
    model_name: str
