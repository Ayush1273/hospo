"""
HMS operational data ingestion, validation, feature engineering, and observation extraction service.
"""

import io
from pathlib import Path
from typing import Optional, Union, Dict, Any
import numpy as np
import pandas as pd
from backend.core.config import DATA_PATH, CSV_DATA_PATH


REQUIRED_HOSPITAL_COLUMNS = [
    "Timestamp",
    "ER_Arrivals",
    "Ambulance_Arrivals",
    "General_Admissions",
    "ICU_Admissions",
    "ICU_Discharges",
    "ICU_Transfers_In",
    "ICU_Transfers_Out",
    "ICU_Occupied_Beds",
    "ICU_Available_Beds",
    "HDU_Occupied_Beds",
    "General_Occupied_Beds",
    "Private_Occupied_Beds",
    "Ventilators_In_Use",
    "Ventilators_Available",
    "ICU_Staff_Available",
    "Staff_Shortage_Flag",
    "Elective_Surgeries",
]


def read_hospital_file(
    file_input: Optional[Union[bytes, io.BytesIO, Path, str]] = None,
    filename: Optional[str] = None,
) -> pd.DataFrame:
    """
    Parses and validates an HMS operational Excel or CSV export.
    Matches the schema and derived fields in hospo ai new.
    """
    if file_input is not None:
        fname = (filename or "").lower()
        if isinstance(file_input, bytes):
            bio = io.BytesIO(file_input)
        elif isinstance(file_input, io.BytesIO):
            bio = file_input
        else:
            bio = file_input
            fname = str(file_input).lower()

        if fname.endswith(".csv"):
            df = pd.read_csv(bio)
        elif fname.endswith((".xlsx", ".xls")) or not fname:
            try:
                df = pd.read_excel(bio, sheet_name="Hospital_Operational_Data")
            except Exception:
                if hasattr(bio, "seek"):
                    bio.seek(0)
                df = pd.read_excel(bio, sheet_name=0)
        else:
            raise ValueError(
                "Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file."
            )
    else:
        if CSV_DATA_PATH.exists():
            df = pd.read_csv(CSV_DATA_PATH)
        elif DATA_PATH.exists():
            df = pd.read_excel(DATA_PATH, sheet_name="Hospital_Operational_Data")
        else:
            raise FileNotFoundError(f"Default HMS file not found at: {CSV_DATA_PATH} or {DATA_PATH}")

    # Column validation
    missing = [c for c in REQUIRED_HOSPITAL_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            "HMS file is missing required columns:\n"
            + "\n".join(f"- {c}" for c in missing)
        )

    df = df.copy()

    # Timestamp normalization
    df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce")
    df = df.dropna(subset=["Timestamp"])
    df = (
        df.sort_values("Timestamp")
        .drop_duplicates(subset=["Timestamp"], keep="last")
        .reset_index(drop=True)
    )

    if len(df) < 73:
        raise ValueError(
            f"HMS operational file contains {len(df)} records. A minimum of 73 continuous hourly records "
            "(72 hours of history + current hour) is required to calculate rolling and 72-hour lag features."
        )

    # Numeric coercion and validation
    numeric_columns = [c for c in REQUIRED_HOSPITAL_COLUMNS if c != "Timestamp"]
    for column in numeric_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    if df[numeric_columns].isna().any().any():
        bad_columns = [c for c in numeric_columns if df[c].isna().any()]
        raise ValueError(
            f"Invalid or missing numeric values in HMS columns: {bad_columns}"
        )

    # Derived fields used by the model
    total_icu_beds = df["ICU_Occupied_Beds"] + df["ICU_Available_Beds"]
    df["ICU_Occupancy_Pct"] = np.where(
        total_icu_beds > 0,
        (df["ICU_Occupied_Beds"] / total_icu_beds) * 100.0,
        0.0,
    )

    df["Total_Occupied_Beds"] = (
        df["ICU_Occupied_Beds"]
        + df["HDU_Occupied_Beds"]
        + df["General_Occupied_Beds"]
        + df["Private_Occupied_Beds"]
    )

    capacity_reference = float(df["Total_Occupied_Beds"].max())
    if capacity_reference > 0:
        df["Hospital_Occupancy_Pct"] = (
            df["Total_Occupied_Beds"] / capacity_reference
        ) * 100.0
    else:
        df["Hospital_Occupancy_Pct"] = 0.0

    return df


def create_model_features(history: pd.DataFrame) -> pd.DataFrame:
    """
    Engineers 39 features matching trained XGBoost requirements:
    Temporal, 72h lags, and 24h rolling aggregations.
    """
    history = history.copy()

    # Time features
    history["Hour"] = history["Timestamp"].dt.hour
    history["DayOfWeek"] = history["Timestamp"].dt.dayofweek
    history["Month"] = history["Timestamp"].dt.month
    history["IsWeekend"] = (history["DayOfWeek"] >= 5).astype(int)

    # ICU occupancy lag features
    for lag in [1, 3, 6, 12, 24, 48, 72]:
        history[f"ICU_Occupancy_Lag_{lag}h"] = history["ICU_Occupancy_Pct"].shift(lag)

    # ICU admission lag features
    for lag in [1, 6, 24]:
        history[f"ICU_Admissions_Lag_{lag}h"] = history["ICU_Admissions"].shift(lag)

    # Rolling features
    history["ICU_Occupancy_Rolling_6h"] = history["ICU_Occupancy_Pct"].rolling(6).mean()
    history["ICU_Occupancy_Rolling_12h"] = (
        history["ICU_Occupancy_Pct"].rolling(12).mean()
    )
    history["ICU_Occupancy_Rolling_24h"] = (
        history["ICU_Occupancy_Pct"].rolling(24).mean()
    )
    history["ER_Arrivals_Rolling_6h"] = history["ER_Arrivals"].rolling(6).mean()
    history["ICU_Admissions_Rolling_24h"] = history["ICU_Admissions"].rolling(24).mean()

    return history


def extract_latest_observation(history: pd.DataFrame) -> Dict[str, Any]:
    """
    Extracts structured operational indicators from the most recent row of HMS data.
    """
    sorted_df = history.sort_values("Timestamp").reset_index(drop=True)
    latest_row = sorted_df.iloc[-1]

    staff_shortage_flag = int(latest_row["Staff_Shortage_Flag"])
    staff_shortage = "YES" if staff_shortage_flag == 1 else "NO"

    ts = latest_row["Timestamp"]
    ts_str = ts.strftime("%Y-%m-%d %H:%M") if hasattr(ts, "strftime") else str(ts)

    return {
        "timestamp": ts_str,
        "icu_occupied_beds": int(latest_row["ICU_Occupied_Beds"]),
        "icu_available_beds": int(latest_row["ICU_Available_Beds"]),
        "icu_occupancy_pct": round(float(latest_row["ICU_Occupancy_Pct"]), 2),
        "hdu_occupied_beds": int(latest_row["HDU_Occupied_Beds"]),
        "general_occupied_beds": int(latest_row["General_Occupied_Beds"]),
        "private_occupied_beds": int(latest_row["Private_Occupied_Beds"]),
        "total_occupied_beds": int(latest_row["Total_Occupied_Beds"]),
        "hospital_occupancy_pct": round(float(latest_row["Hospital_Occupancy_Pct"]), 2),
        "ventilators_in_use": int(latest_row["Ventilators_In_Use"]),
        "ventilators_available": int(latest_row["Ventilators_Available"]),
        "icu_staff_available": int(latest_row["ICU_Staff_Available"]),
        "staff_shortage_flag": staff_shortage_flag,
        "staff_shortage": staff_shortage,
        "elective_surgeries": int(latest_row["Elective_Surgeries"]),
        "er_arrivals": int(latest_row["ER_Arrivals"]),
        "ambulance_arrivals": int(latest_row["Ambulance_Arrivals"]),
        "general_admissions": int(latest_row["General_Admissions"]),
        "icu_admissions": int(latest_row["ICU_Admissions"]),
        "icu_discharges": int(latest_row["ICU_Discharges"]),
        "icu_transfers_in": int(latest_row["ICU_Transfers_In"]),
        "icu_transfers_out": int(latest_row["ICU_Transfers_Out"]),
    }


def get_sample_72h_excel_bytes(history_df: Optional[pd.DataFrame] = None) -> bytes:
    """
    Generates a valid downloadable 73-record (72h history + current observation) Excel spreadsheet.
    """
    if history_df is None:
        history_df = read_hospital_file(None)

    sample = history_df.sort_values("Timestamp").tail(73).copy()

    # Clean columns to export clean required HMS format
    export_cols = [c for c in REQUIRED_HOSPITAL_COLUMNS if c in sample.columns]
    export_df = sample[export_cols].copy()

    # Format Timestamp as string for clean Excel display
    export_df["Timestamp"] = export_df["Timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        export_df.to_excel(writer, index=False, sheet_name="Hospital_Operational_Data")
    return output.getvalue()
