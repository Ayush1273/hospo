"""
Operational condition analysis, HMS file upload/inspection, ML forecasting, deterministic risk scoring, and RAG/LLM synthesis endpoints.
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Response
import pandas as pd

from backend.core.resources import resources
from backend.schemas.operational import (
    OperationalInput,
    HospitalState,
    HospitalObservation,
    HMSFileSummary,
)
from backend.schemas.analysis import AnalysisResponse
from backend.services.hms_service import (
    read_hospital_file,
    extract_latest_observation,
    get_sample_72h_excel_bytes,
)
from backend.services.forecast_service import (
    predict_from_hms_history,
    build_inference_dataframe,
    predict_occupancy_24h,
)
from backend.services.risk_service import calculate_operational_risk
from backend.services.rag_service import retrieve_policies
from backend.services.llm_service import generate_ai_decision_support

router = APIRouter()


def build_hms_summary(
    df: pd.DataFrame, filename: str, is_default: bool
) -> HMSFileSummary:
    """Builds a structured file summary including the latest observation record."""
    obs_dict = extract_latest_observation(df)
    obs = HospitalObservation(**obs_dict)
    sorted_df = df.sort_values("Timestamp").reset_index(drop=True)
    e_ts = sorted_df["Timestamp"].iloc[0]
    l_ts = sorted_df["Timestamp"].iloc[-1]
    earliest_str = (
        e_ts.strftime("%Y-%m-%d %H:%M") if hasattr(e_ts, "strftime") else str(e_ts)
    )
    latest_str = (
        l_ts.strftime("%Y-%m-%d %H:%M") if hasattr(l_ts, "strftime") else str(l_ts)
    )
    total_records = len(sorted_df)

    return HMSFileSummary(
        filename=filename,
        is_default=is_default,
        total_records=total_records,
        earliest_timestamp=earliest_str,
        latest_timestamp=latest_str,
        hours_covered=total_records,
        is_valid_72h=total_records >= 73,
        latest_observation=obs,
    )


@router.get(
    "/hms/status",
    response_model=HMSFileSummary,
    summary="Status and latest observation of currently active HMS dataset",
)
def get_hms_status():
    """Returns metadata and latest observation from the currently active operational dataset."""
    df = resources.active_hospital_data
    if df is None:
        df = resources.default_hospital_data
    if df is None:
        df = read_hospital_file(None)
        resources.default_hospital_data = df
        resources.active_hospital_data = df.copy()

    return build_hms_summary(
        df,
        filename=resources.active_filename,
        is_default=resources.is_default_active,
    )


@router.post(
    "/hms/upload",
    response_model=HMSFileSummary,
    summary="Upload HMS operational export (.xlsx, .xls, .csv)",
)
async def upload_hms_file(file: UploadFile = File(...)):
    """
    Ingests and validates an HMS operational Excel or CSV file.
    Requires minimum 73 hourly continuous records (72h historical lag + current hour).
    Updates active dataset upon successful validation.
    """
    filename = file.filename or "uploaded_hms.xlsx"
    contents = await file.read()

    try:
        df = read_hospital_file(contents, filename=filename)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"HMS Validation Error: {str(e)}",
        )

    # Set as active dataset in memory
    resources.active_hospital_data = df
    resources.active_filename = filename
    resources.is_default_active = False

    return build_hms_summary(df, filename=filename, is_default=False)


@router.post(
    "/hms/reset",
    response_model=HMSFileSummary,
    summary="Reset active dataset to bundled default (Operational data.xlsx)",
)
def reset_to_default_dataset():
    """Resets the active dataset to the default bundled Operational data.xlsx."""
    if resources.default_hospital_data is None:
        resources.default_hospital_data = read_hospital_file(None)

    resources.active_hospital_data = resources.default_hospital_data.copy()
    resources.active_filename = "Operational data.xlsx"
    resources.is_default_active = True

    return build_hms_summary(
        resources.active_hospital_data,
        filename="Operational data.xlsx",
        is_default=True,
    )


@router.get(
    "/hms/sample-template",
    summary="Download sample 72-hour Excel spreadsheet for testing",
)
def download_sample_template():
    """Returns a valid 72-hour operational spreadsheet in .xlsx format."""
    try:
        data_df = resources.default_hospital_data
        if data_df is None:
            data_df = read_hospital_file(None)
        excel_bytes = get_sample_72h_excel_bytes(data_df)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=HOSP_AI_72h_Operational_Template.xlsx"
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate template: {str(e)}"
        )


@router.post(
    "/analyze",
    response_model=AnalysisResponse,
    summary="Analyze hospital condition & predict 24h occupancy from 72h+ HMS data",
)
async def analyze_hospital_conditions(
    file: Optional[UploadFile] = File(None),
):
    """
    Main operational decision-support endpoint:
    1. Uses uploaded file or active dataset (requires >= 73 hourly records).
    2. Engineers 39 temporal, lag (up to 72h), and rolling features.
    3. Runs XGBoost model to forecast 24-hour ahead ICU occupancy.
    4. Computes deterministic clinical risk score (0-10) from latest observation.
    5. Retrieves matching hospital SOP policies via vector search.
    6. Synthesizes administrative decision briefing using Gemini (with deterministic fallback).
    """
    if resources.model is None:
        raise HTTPException(
            status_code=503,
            detail="Operational models are not ready.",
        )

    # Determine dataset to use
    dataset_name = resources.active_filename
    if file is not None and file.filename:
        filename = file.filename
        contents = await file.read()
        try:
            df = read_hospital_file(contents, filename=filename)
            dataset_name = filename
            # Also update active dataset
            resources.active_hospital_data = df
            resources.active_filename = filename
            resources.is_default_active = False
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"HMS Validation Error in uploaded file: {str(e)}",
            )
    else:
        df = resources.active_hospital_data
        if df is None:
            df = resources.default_hospital_data
        if df is None:
            df = read_hospital_file(None)
            resources.default_hospital_data = df
            resources.active_hospital_data = df.copy()

    # 1 & 2. 39-Feature engineering + XGBoost 24-hour forecast
    try:
        (
            predicted_icu_occupancy,
            current_icu_occupancy,
            latest_obs,
            _,
        ) = predict_from_hms_history(df)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Forecast feature engineering failed: {str(e)}",
        )

    # 3. Deterministic risk engine
    staff_shortage_flag = latest_obs["staff_shortage_flag"]
    risk_result = calculate_operational_risk(
        current_icu_occupancy=current_icu_occupancy,
        predicted_icu_occupancy=predicted_icu_occupancy,
        icu_available_beds=latest_obs["icu_available_beds"],
        staff_shortage_flag=staff_shortage_flag,
        ventilators_available=latest_obs["ventilators_available"],
        icu_admissions=latest_obs["icu_admissions"],
        icu_discharges=latest_obs["icu_discharges"],
        er_arrivals=latest_obs["er_arrivals"],
        ambulance_arrivals=latest_obs["ambulance_arrivals"],
    )

    # 4. RAG policy retrieval
    rag_query = f"""Hospital operational decision support.
Current ICU occupancy: {current_icu_occupancy:.2f}%
Predicted 24-hour ICU occupancy: {predicted_icu_occupancy:.2f}%
Risk level: {risk_result["risk_level"]}
Risk score: {risk_result["risk_score"]}/10
ICU beds available: {latest_obs["icu_available_beds"]}
Ventilators available: {latest_obs["ventilators_available"]}
Staff shortage: {latest_obs["staff_shortage"]}
ICU admissions: {latest_obs["icu_admissions"]}
ICU discharges: {latest_obs["icu_discharges"]}
Emergency arrivals: {latest_obs["er_arrivals"]}
Ambulance arrivals: {latest_obs["ambulance_arrivals"]}
Find hospital policies relevant to ICU capacity, staffing, bed management, emergency inflow, patient flow and operational escalation."""

    retrieved_policies = retrieve_policies(rag_query, top_k=5)

    # 5. Gemini grounded decision support
    ai_response = generate_ai_decision_support(
        risk_result,
        current_icu_occupancy,
        predicted_icu_occupancy,
        retrieved_policies,
        latest_obs,
    )

    delta = round(predicted_icu_occupancy - current_icu_occupancy, 2)
    obs_schema = HospitalObservation(**latest_obs)

    return AnalysisResponse(
        current_occupancy=round(current_icu_occupancy, 2),
        predicted_occupancy_24h=round(predicted_icu_occupancy, 2),
        delta=delta,
        risk_score=risk_result["risk_score"],
        risk_level=risk_result["risk_level"],
        risk_components=risk_result["risk_components"],
        risk_factors=risk_result["risk_factors"],
        positive_trends=risk_result["positive_trends"],
        forecast_change=risk_result["forecast_change"],
        hospital_state=HospitalState(
            icu_beds_available=latest_obs["icu_available_beds"],
            ventilators_available=latest_obs["ventilators_available"],
            icu_staff_available=latest_obs["icu_staff_available"],
            staff_shortage=latest_obs["staff_shortage"],
        ),
        latest_observation=obs_schema,
        dataset_name=dataset_name,
        retrieved_policies=retrieved_policies,
        ai_response=ai_response,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.post(
    "/analyze-manual",
    response_model=AnalysisResponse,
    summary="Legacy manual input simulation endpoint",
)
def analyze_manual_inputs(inp: OperationalInput):
    """Fallback endpoint for manual 18-input telemetry simulation."""
    if resources.model is None or resources.tail_history is None:
        raise HTTPException(
            status_code=503,
            detail="Operational models and baseline data are not ready.",
        )

    feature_matrix, current_icu_occupancy = build_inference_dataframe(inp)
    predicted_icu_occupancy = predict_occupancy_24h(feature_matrix)

    staff_shortage_flag = 1 if inp.staff_shortage.upper() == "YES" else 0
    risk_result = calculate_operational_risk(
        current_icu_occupancy=current_icu_occupancy,
        predicted_icu_occupancy=predicted_icu_occupancy,
        icu_available_beds=inp.icu_available_beds,
        staff_shortage_flag=staff_shortage_flag,
        ventilators_available=inp.ventilators_available,
        icu_admissions=inp.icu_admissions,
        icu_discharges=inp.icu_discharges,
        er_arrivals=inp.er_arrivals,
        ambulance_arrivals=inp.ambulance_arrivals,
    )

    rag_query = f"""Hospital operational decision support.
Current ICU occupancy: {current_icu_occupancy:.2f}%
Predicted 24-hour ICU occupancy: {predicted_icu_occupancy:.2f}%
Risk level: {risk_result["risk_level"]}
Risk score: {risk_result["risk_score"]}/10
ICU beds available: {inp.icu_available_beds}
Ventilators available: {inp.ventilators_available}
Staff shortage: {inp.staff_shortage}
ICU admissions: {inp.icu_admissions}
ICU discharges: {inp.icu_discharges}
Emergency arrivals: {inp.er_arrivals}
Ambulance arrivals: {inp.ambulance_arrivals}"""

    retrieved_policies = retrieve_policies(rag_query, top_k=5)
    ai_response = generate_ai_decision_support(
        risk_result,
        current_icu_occupancy,
        predicted_icu_occupancy,
        retrieved_policies,
        inp,
    )

    delta = round(predicted_icu_occupancy - current_icu_occupancy, 2)
    return AnalysisResponse(
        current_occupancy=round(current_icu_occupancy, 2),
        predicted_occupancy_24h=round(predicted_icu_occupancy, 2),
        delta=delta,
        risk_score=risk_result["risk_score"],
        risk_level=risk_result["risk_level"],
        risk_components=risk_result["risk_components"],
        risk_factors=risk_result["risk_factors"],
        positive_trends=risk_result["positive_trends"],
        forecast_change=risk_result["forecast_change"],
        hospital_state=HospitalState(
            icu_beds_available=inp.icu_available_beds,
            ventilators_available=inp.ventilators_available,
            icu_staff_available=inp.icu_staff_available,
            staff_shortage=inp.staff_shortage,
        ),
        latest_observation=None,
        dataset_name="Manual Simulation",
        retrieved_policies=retrieved_policies,
        ai_response=ai_response,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/default-inputs", summary="Default baseline operational inputs")
def get_default_inputs():
    """Returns baseline default operational inputs matching historical hospital averages."""
    try:
        return OperationalInput().model_dump()
    except AttributeError:
        return OperationalInput().dict()
