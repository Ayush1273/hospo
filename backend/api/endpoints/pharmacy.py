"""
Pharmacy Medicine Intelligence & Demand Forecasting API endpoints.
"""

from typing import List
from fastapi import APIRouter, HTTPException, UploadFile, File

from backend.schemas.pharmacy import (
    MedicineOption,
    MedicineIntelligenceResponse,
    DatasetSummaryResponse,
    PredictDemandRequest,
    PredictDemandResponse,
)
from backend.services.pharmacy_service import (
    get_medicine_options,
    get_medicine_intelligence,
)
from backend.services.pharmacy_predict_service import (
    get_dataset_summary,
    set_uploaded_dataset,
    reset_to_default_dataset,
    load_sample_dataset,
    clear_active_dataset,
    run_90day_recursive_forecast,
)

router = APIRouter(prefix="/pharmacy", tags=["Pharmacy Intelligence"])


# ================================================================
# PART 1: FORMULARY TELEMETRY & INVENTORY MONITORING
# ================================================================


@router.get(
    "/medicines",
    response_model=List[MedicineOption],
    summary="List all available pharmacy medicines with inventory metadata",
)
def list_pharmacy_medicines():
    """Returns sorted list of hospital medicines available for inventory and demand analysis."""
    try:
        return get_medicine_options()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load pharmacy dataset: {str(e)}",
        )


@router.get(
    "/medicine/{medicine_name}",
    response_model=MedicineIntelligenceResponse,
    summary="Get medicine telemetry, consumption history, and 3-month demand forecast",
)
def get_medicine_analysis(medicine_name: str):
    """
    Returns complete intelligence for a selected medicine:
    - Current stock and inventory parameters
    - Recorded monthly consumption history
    - 3-month forward demand forecast and projected stock
    - Replenishment metrics (lead-time demand, safety stock, suggested reorder)
    """
    try:
        return get_medicine_intelligence(medicine_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute pharmacy intelligence: {str(e)}",
        )


# ================================================================
# PART 2: 90-DAY PREDICTIVE INTELLIGENCE (ML FORECASTING)
# ================================================================


@router.get(
    "/dataset-summary",
    response_model=DatasetSummaryResponse,
    summary="Get summary of currently active pharmacy dataset and its formulary medicines",
)
def get_active_dataset_summary():
    """Returns metadata, date bounds, and medicine options for active demand dataset."""
    try:
        return get_dataset_summary()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load dataset summary: {str(e)}",
        )


@router.post(
    "/upload-dataset",
    response_model=DatasetSummaryResponse,
    summary="Upload custom Excel or CSV consumption dataset for demand forecasting",
)
async def upload_pharmacy_dataset(file: UploadFile = File(...)):
    """
    Accepts an Excel (.xlsx / .xls) or CSV file with required columns:
    - Date (or Timestamp)
    - Medicine_Name (or Medicine_ID)
    - Consumed_Units (or Usage / Consumption)
    Performs data cleansing, chronological sorting, and validates formulary identifiers.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    ext = file.filename.lower().split(".")[-1]
    if ext not in ["xlsx", "xls", "csv", "txt"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension '.{ext}'. Please upload an Excel (.xlsx/.xls) or CSV file.",
        )

    try:
        contents = await file.read()
        summary = set_uploaded_dataset(contents, file.filename)
        return summary
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error parsing uploaded file: {str(e)}",
        )


@router.post(
    "/reset-dataset",
    response_model=DatasetSummaryResponse,
    summary="Reset back to baseline training dataset (pharmacy_demand_training.csv)",
)
def reset_dataset():
    """Restores the active dataset to the 30-medicine 2-year verified baseline."""
    try:
        return reset_to_default_dataset()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reset dataset: {str(e)}",
        )


@router.post(
    "/clear-dataset",
    response_model=DatasetSummaryResponse,
    summary="Clear active dataset so user must upload a new file",
)
def clear_dataset():
    """Clears the active dataset."""
    try:
        return clear_active_dataset()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear dataset: {str(e)}",
        )


@router.post(
    "/load-sample",
    response_model=DatasetSummaryResponse,
    summary="Explicitly load the sample training dataset",
)
def load_sample():
    """Explicitly loads the sample dataset."""
    try:
        return load_sample_dataset()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load sample dataset: {str(e)}",
        )


@router.post(
    "/predict-90d",
    response_model=PredictDemandResponse,
    summary="Execute full ML pipeline and 90-day recursive XGBoost demand forecast for a selected medicine",
)
def predict_medicine_demand(req: PredictDemandRequest):
    """
    Executes the 90-day recursive forecast:
    - Extracts calendar features, 10 lag variables, and 7 rolling window statistics
    - Applies one-hot encoding for the selected medicine and clinical class
    - Runs 90 recursive daily inferences
    - Aggregates month-wise sums for 3 months
    - Computes 7-day rolling trendlines and peak/lowest consumption days
    - Computes Part 1 telemetry metrics and stockout day simulation
    """
    if not req.medicine_name or not req.medicine_name.strip():
        raise HTTPException(status_code=400, detail="Medicine name must be specified.")

    try:
        return run_90day_recursive_forecast(
            medicine_name_or_id=req.medicine_name.strip(),
            horizon_days=req.horizon_days,
            current_stock=req.current_stock,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to run 90-day demand forecast: {str(e)}",
        )
