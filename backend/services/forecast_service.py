"""
Feature engineering and XGBoost 24-hour ICU occupancy prediction service.
"""

from typing import Tuple, Dict, Any
import numpy as np
import pandas as pd
from backend.core.resources import resources
from backend.schemas.operational import OperationalInput


def build_inference_dataframe(inp: OperationalInput) -> Tuple[pd.DataFrame, float]:
    """Combines historical context with current input to compute exact 39 features."""
    staff_shortage_flag = 1 if inp.staff_shortage.upper() == "YES" else 0
    total_icu_beds = inp.icu_occupied_beds + inp.icu_available_beds
    icu_occupancy_pct = (
        (inp.icu_occupied_beds / total_icu_beds * 100) if total_icu_beds > 0 else 0.0
    )

    total_occupied_beds = (
        inp.icu_occupied_beds
        + inp.hdu_occupied_beds
        + inp.general_occupied_beds
        + inp.private_occupied_beds
    )
    cap_ref = resources.capacity_reference if resources.capacity_reference > 0 else 1.0
    hospital_occupancy_pct = (total_occupied_beds / cap_ref) * 100

    new_timestamp = resources.latest_timestamp + pd.Timedelta(hours=1)

    current_row = pd.DataFrame(
        [
            {
                "Timestamp": new_timestamp,
                "ER_Arrivals": inp.er_arrivals,
                "Ambulance_Arrivals": inp.ambulance_arrivals,
                "General_Admissions": inp.general_admissions,
                "ICU_Admissions": inp.icu_admissions,
                "ICU_Discharges": inp.icu_discharges,
                "ICU_Transfers_In": inp.icu_transfers_in,
                "ICU_Transfers_Out": inp.icu_transfers_out,
                "ICU_Occupied_Beds": inp.icu_occupied_beds,
                "ICU_Available_Beds": inp.icu_available_beds,
                "ICU_Occupancy_Pct": icu_occupancy_pct,
                "HDU_Occupied_Beds": inp.hdu_occupied_beds,
                "General_Occupied_Beds": inp.general_occupied_beds,
                "Private_Occupied_Beds": inp.private_occupied_beds,
                "Total_Occupied_Beds": total_occupied_beds,
                "Hospital_Occupancy_Pct": hospital_occupancy_pct,
                "Ventilators_In_Use": inp.ventilators_in_use,
                "Ventilators_Available": inp.ventilators_available,
                "ICU_Staff_Available": inp.icu_staff_available,
                "Staff_Shortage_Flag": staff_shortage_flag,
                "Elective_Surgeries": inp.elective_surgeries,
            }
        ]
    )

    # Append to tail history to compute rolling & lag calculations
    combined = pd.concat([resources.tail_history, current_row], ignore_index=True)

    # Time features
    combined["Hour"] = combined["Timestamp"].dt.hour
    combined["DayOfWeek"] = combined["Timestamp"].dt.dayofweek
    combined["Month"] = combined["Timestamp"].dt.month
    combined["IsWeekend"] = (combined["DayOfWeek"] >= 5).astype(int)

    # ICU occupancy lag features
    for lag in [1, 3, 6, 12, 24, 48, 72]:
        combined[f"ICU_Occupancy_Lag_{lag}h"] = combined["ICU_Occupancy_Pct"].shift(lag)

    # ICU admission lag features
    for lag in [1, 6, 24]:
        combined[f"ICU_Admissions_Lag_{lag}h"] = combined["ICU_Admissions"].shift(lag)

    # Rolling features
    combined["ICU_Occupancy_Rolling_6h"] = (
        combined["ICU_Occupancy_Pct"].rolling(6).mean()
    )
    combined["ICU_Occupancy_Rolling_12h"] = (
        combined["ICU_Occupancy_Pct"].rolling(12).mean()
    )
    combined["ICU_Occupancy_Rolling_24h"] = (
        combined["ICU_Occupancy_Pct"].rolling(24).mean()
    )
    combined["ER_Arrivals_Rolling_6h"] = combined["ER_Arrivals"].rolling(6).mean()
    combined["ICU_Admissions_Rolling_24h"] = (
        combined["ICU_Admissions"].rolling(24).mean()
    )

    feature_matrix = combined.tail(1)[resources.feature_names].copy()
    return feature_matrix, icu_occupancy_pct


def predict_occupancy_24h(feature_matrix: pd.DataFrame) -> float:
    """Executes the trained XGBoost model to produce 24-hour occupancy prediction."""
    if resources.model is None:
        raise RuntimeError("XGBoost model is not loaded.")
    raw_pred = float(resources.model.predict(feature_matrix)[0])
    return float(np.clip(raw_pred, 0, 100))


def predict_from_hms_history(
    history_df: pd.DataFrame,
) -> Tuple[float, float, Dict[str, Any], pd.DataFrame]:
    """
    Computes 39 features from 72h+ continuous operational history and predicts 24h occupancy.
    Matches the pipeline in hospo ai new.
    """
    from backend.services.hms_service import (
        create_model_features,
        extract_latest_observation,
    )

    if resources.model is None:
        raise RuntimeError("XGBoost model is not loaded.")

    sorted_df = history_df.sort_values("Timestamp").reset_index(drop=True)
    inference_history = create_model_features(sorted_df)

    feature_names = resources.feature_names
    if not feature_names:
        feature_names = list(resources.model.feature_names_in_)

    X_current = inference_history.tail(1)[feature_names].copy()

    if X_current.isna().any().any():
        missing_features = X_current.columns[X_current.isna().any()].tolist()
        raise ValueError(
            "Latest HMS record does not contain enough history to calculate model features. "
            "At least 72 hours of hourly data are required. Missing features: "
            + str(missing_features)
        )

    predicted_icu_occupancy = predict_occupancy_24h(X_current)
    latest_obs = extract_latest_observation(sorted_df)
    current_icu_occupancy = float(latest_obs["icu_occupancy_pct"])

    return predicted_icu_occupancy, current_icu_occupancy, latest_obs, X_current
