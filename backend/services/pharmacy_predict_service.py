"""
Pharmacy 90-Day Predictive Intelligence Service.
Implements the exact end-to-end ML feature extraction, engineering, preprocessing,
and 90-day recursive XGBoost autoregression pipeline trained in pharmacy_pre.py.
"""

from datetime import datetime
import io
import os
from pathlib import Path
import re
from typing import Dict, Any, List, Optional, Tuple

import numpy as np
import pandas as pd
import xgboost as xgb

from backend.schemas.pharmacy import (
    PredictiveMedicineSummary,
    DatasetSummaryResponse,
    DailyForecastPoint,
    RecentHistoryPoint,
    MonthWiseForecast,
    PeakUsageDay,
    PredictDemandResponse,
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ================================================================
# MASTER MEDICINE CATALOG (30 CLINICAL FORMULARY MEDICATIONS)
# ================================================================

MASTER_CATALOG = [
    {
        "Medicine_ID": "MED001",
        "Medicine_Name": "Paracetamol",
        "Category": "Analgesic",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED002",
        "Medicine_Name": "Ceftriaxone",
        "Category": "Antibiotic",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED003",
        "Medicine_Name": "Meropenem",
        "Category": "Antibiotic",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED004",
        "Medicine_Name": "Amoxicillin",
        "Category": "Antibiotic",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED005",
        "Medicine_Name": "Azithromycin",
        "Category": "Antibiotic",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED006",
        "Medicine_Name": "Pantoprazole",
        "Category": "Gastro",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED007",
        "Medicine_Name": "Ondansetron",
        "Category": "Antiemetic",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED008",
        "Medicine_Name": "Insulin",
        "Category": "Diabetes",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED009",
        "Medicine_Name": "Heparin",
        "Category": "Anticoagulant",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED010",
        "Medicine_Name": "Enoxaparin",
        "Category": "Anticoagulant",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED011",
        "Medicine_Name": "Furosemide",
        "Category": "Diuretic",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED012",
        "Medicine_Name": "Dopamine",
        "Category": "Emergency",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED013",
        "Medicine_Name": "Norepinephrine",
        "Category": "Emergency",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED014",
        "Medicine_Name": "Midazolam",
        "Category": "Sedative",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED015",
        "Medicine_Name": "Propofol",
        "Category": "Anaesthetic",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED016",
        "Medicine_Name": "Salbutamol",
        "Category": "Respiratory",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED017",
        "Medicine_Name": "Atorvastatin",
        "Category": "Cardiac",
        "Criticality": "DESIRABLE",
    },
    {
        "Medicine_ID": "MED018",
        "Medicine_Name": "Metformin",
        "Category": "Diabetes",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED019",
        "Medicine_Name": "Aspirin",
        "Category": "Cardiac",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED020",
        "Medicine_Name": "Clopidogrel",
        "Category": "Cardiac",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED021",
        "Medicine_Name": "Vancomycin",
        "Category": "Antibiotic",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED022",
        "Medicine_Name": "Piperacillin-Tazobactam",
        "Category": "Antibiotic",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED023",
        "Medicine_Name": "Linezolid",
        "Category": "Antibiotic",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED024",
        "Medicine_Name": "Dexamethasone",
        "Category": "Steroid",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED025",
        "Medicine_Name": "Hydrocortisone",
        "Category": "Steroid",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED026",
        "Medicine_Name": "Lidocaine",
        "Category": "Emergency",
        "Criticality": "ESSENTIAL",
    },
    {
        "Medicine_ID": "MED027",
        "Medicine_Name": "Adrenaline",
        "Category": "Emergency",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED028",
        "Medicine_Name": "Magnesium Sulfate",
        "Category": "Emergency",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED029",
        "Medicine_Name": "Calcium Gluconate",
        "Category": "Emergency",
        "Criticality": "CRITICAL",
    },
    {
        "Medicine_ID": "MED030",
        "Medicine_Name": "Normal Saline",
        "Category": "IV Fluid",
        "Criticality": "CRITICAL",
    },
]

NAME_TO_CATALOG = {m["Medicine_Name"].lower().strip(): m for m in MASTER_CATALOG}
ID_TO_CATALOG = {m["Medicine_ID"].upper().strip(): m for m in MASTER_CATALOG}

# Cached Model and Feature Names
_cached_xgb_model: Optional[xgb.XGBRegressor] = None
_cached_feature_names: List[str] = []

# Active Operational Training / Uploaded Data State (Initially empty: user must upload dataset)
_active_df: Optional[pd.DataFrame] = None
_active_filename: str = ""
_is_default_active: bool = False


def get_model_path() -> Path:
    candidates = [
        BASE_DIR / "models" / "pharmacy_demand_model.json",
        BASE_DIR.parent / "pharmacy_demand_model.json",
        Path("/home/zoro/Downloads/Ay Pr/pharmacy_demand_model.json"),
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(
        "pharmacy_demand_model.json not found in models or workspace directories."
    )


def get_default_training_csv_path() -> Path:
    candidates = [
        BASE_DIR / "pharmacy_demand_training.csv",
        BASE_DIR.parent / "pharmacy_demand_training.csv",
        Path("/home/zoro/Downloads/Ay Pr/pharmacy_demand_training.csv"),
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(
        "pharmacy_demand_training.csv not found in workspace directories."
    )


def load_pharmacy_model() -> Tuple[xgb.XGBRegressor, List[str]]:
    global _cached_xgb_model, _cached_feature_names
    if _cached_xgb_model is not None and len(_cached_feature_names) > 0:
        return _cached_xgb_model, _cached_feature_names

    path = get_model_path()
    model = xgb.XGBRegressor()
    model.load_model(str(path))
    features = list(model.feature_names_in_)
    _cached_xgb_model = model
    _cached_feature_names = features
    return model, features


def normalize_medicine_identifier(val: Any) -> Tuple[str, str, str, str]:
    """
    Given a user-provided string (name or ID), returns (name, id, category, criticality).
    Falls back gracefully if an uncataloged medicine is provided.
    """
    if pd.isna(val):
        return ("Unknown Medicine", "MED999", "General", "STANDARD")
    s = str(val).strip()
    s_upper = s.upper()
    s_lower = s.lower()

    if s_upper in ID_TO_CATALOG:
        m = ID_TO_CATALOG[s_upper]
        return (m["Medicine_Name"], m["Medicine_ID"], m["Category"], m["Criticality"])

    if s_lower in NAME_TO_CATALOG:
        m = NAME_TO_CATALOG[s_lower]
        return (m["Medicine_Name"], m["Medicine_ID"], m["Category"], m["Criticality"])

    # Substring / partial match
    for name_key, m in NAME_TO_CATALOG.items():
        if name_key in s_lower or s_lower in name_key:
            return (
                m["Medicine_Name"],
                m["Medicine_ID"],
                m["Category"],
                m["Criticality"],
            )

    # New uncataloged medicine fallback
    clean_name = s.title()
    clean_id = f"MED_{re.sub(r'[^A-Za-z0-9]', '', clean_name)[:6].upper()}"
    return (clean_name, clean_id, "General", "ESSENTIAL")


def get_active_dataset() -> Tuple[Optional[pd.DataFrame], str, bool]:
    """Returns active dataframe, filename, and is_default flag (does NOT auto-load default)."""
    global _active_df, _active_filename, _is_default_active
    return _active_df, _active_filename, _is_default_active


def load_sample_dataset() -> DatasetSummaryResponse:
    """Explicitly loads pharmacy_demand_training.csv on demand."""
    global _active_df, _active_filename, _is_default_active
    csv_path = get_default_training_csv_path()
    df = pd.read_csv(csv_path)
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = (
        df.dropna(subset=["Date", "Consumed_Units"])
        .sort_values(["Medicine_ID", "Date"])
        .reset_index(drop=True)
    )
    _active_df = df
    _active_filename = "pharmacy_demand_training.csv"
    _is_default_active = True
    return get_dataset_summary()


def clear_active_dataset() -> DatasetSummaryResponse:
    """Clears the active dataset."""
    global _active_df, _active_filename, _is_default_active
    _active_df = None
    _active_filename = ""
    _is_default_active = False
    return get_dataset_summary()


def reset_to_default_dataset() -> DatasetSummaryResponse:
    return clear_active_dataset()


def parse_and_validate_uploaded_data(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """
    Parses Excel (.xlsx/.xls) or CSV files, validating Date, Medicine, Consumed_Units columns.
    """
    ext = filename.lower().split(".")[-1]
    if ext in ["xlsx", "xls"]:
        df = pd.read_excel(io.BytesIO(file_bytes))
    elif ext in ["csv", "txt"]:
        try:
            df = pd.read_csv(io.BytesIO(file_bytes))
        except Exception:
            df = pd.read_csv(io.BytesIO(file_bytes), sep=";")
    else:
        raise ValueError(
            f"Unsupported file format '{ext}'. Please upload an Excel (.xlsx/.xls) or CSV file."
        )

    if df.empty:
        raise ValueError("The uploaded file is empty.")

    # Find required columns
    col_map = {c.strip(): c for c in df.columns}
    normalized_cols = {c.strip().lower(): c for c in df.columns}

    # 1. Date column
    date_candidates = [
        "date",
        "timestamp",
        "datetime",
        "day",
        "trans_date",
        "date of consumption",
    ]
    date_col = next(
        (normalized_cols[cand] for cand in date_candidates if cand in normalized_cols),
        None,
    )
    if not date_col:
        # Check by substring
        date_col = next(
            (c for c in df.columns if "date" in c.lower() or "time" in c.lower()), None
        )
    if not date_col:
        raise ValueError(
            "Missing 'Date' column in uploaded file. Required: Date, Medicine_Name, Consumed_Units."
        )

    # 2. Medicine Column (Medicine_Name or Medicine_ID)
    med_candidates = [
        "medicine_name",
        "medicine",
        "drug_name",
        "drug",
        "item_name",
        "product_name",
        "medicine_id",
        "med_id",
        "drug_id",
        "item_id",
    ]
    med_col = next(
        (normalized_cols[cand] for cand in med_candidates if cand in normalized_cols),
        None,
    )
    if not med_col:
        med_col = next(
            (c for c in df.columns if "med" in c.lower() or "drug" in c.lower()), None
        )
    if not med_col:
        raise ValueError(
            "Missing 'Medicine_Name' (or 'Medicine_ID') column in uploaded file."
        )

    # 3. Consumed Units column
    usage_candidates = [
        "consumed_units",
        "consumed",
        "consumption",
        "usage",
        "units",
        "units_consumed",
        "quantity",
        "qty",
        "dispensed_units",
    ]
    usage_col = next(
        (normalized_cols[cand] for cand in usage_candidates if cand in normalized_cols),
        None,
    )
    if not usage_col:
        usage_col = next(
            (
                c
                for c in df.columns
                if "consumed" in c.lower()
                or "usage" in c.lower()
                or "unit" in c.lower()
                or "qty" in c.lower()
            ),
            None,
        )
    if not usage_col:
        raise ValueError("Missing 'Consumed_Units' column in uploaded file.")

    # Optional Category / Criticality
    cat_col = next(
        (
            normalized_cols[cand]
            for cand in ["category", "drug_category"]
            if cand in normalized_cols
        ),
        None,
    )
    crit_col = next(
        (
            normalized_cols[cand]
            for cand in ["criticality", "urgency", "priority"]
            if cand in normalized_cols
        ),
        None,
    )

    # Standardize DataFrame
    clean_df = pd.DataFrame()
    clean_df["Date"] = pd.to_datetime(df[date_col], errors="coerce")
    clean_df = clean_df.dropna(subset=["Date"])

    # Standardize Medicine metadata
    med_vals = df.loc[clean_df.index, med_col]
    names, ids, cats, crits = [], [], [], []

    for idx, raw_med in med_vals.items():
        name, m_id, cat, crit = normalize_medicine_identifier(raw_med)
        # If user explicitly provided category or criticality, respect them
        if cat_col and pd.notna(df.at[idx, cat_col]):
            cat = str(df.at[idx, cat_col]).strip()
        if crit_col and pd.notna(df.at[idx, crit_col]):
            crit = str(df.at[idx, crit_col]).strip().upper()
        names.append(name)
        ids.append(m_id)
        cats.append(cat)
        crits.append(crit)

    clean_df["Medicine_Name"] = names
    clean_df["Medicine_ID"] = ids
    clean_df["Category"] = cats
    clean_df["Criticality"] = crits

    # Consumed Units
    units = pd.to_numeric(df.loc[clean_df.index, usage_col], errors="coerce").fillna(0)
    clean_df["Consumed_Units"] = np.maximum(units, 0)

    # Optional Current Stock column
    stock_candidates = [
        "current_stock",
        "stock",
        "stock_units",
        "quantity_on_hand",
        "inventory",
        "units_in_stock",
        "balance",
    ]
    stock_col = next(
        (normalized_cols[cand] for cand in stock_candidates if cand in normalized_cols),
        None,
    )
    if stock_col:
        clean_df["Current_Stock"] = (
            pd.to_numeric(df.loc[clean_df.index, stock_col], errors="coerce")
            .fillna(0)
            .clip(lower=0)
        )

    # Sort
    clean_df = clean_df.sort_values(["Medicine_ID", "Date"]).reset_index(drop=True)

    if clean_df.empty:
        raise ValueError(
            "No valid date-consumption records could be extracted from the file."
        )

    return clean_df


def set_uploaded_dataset(file_bytes: bytes, filename: str) -> DatasetSummaryResponse:
    global _active_df, _active_filename, _is_default_active
    validated_df = parse_and_validate_uploaded_data(file_bytes, filename)
    _active_df = validated_df
    _active_filename = filename
    _is_default_active = False
    return get_dataset_summary()


def get_dataset_summary() -> DatasetSummaryResponse:
    df, filename, is_default = get_active_dataset()
    if df is None or df.empty:
        return DatasetSummaryResponse(
            filename="",
            is_default=False,
            total_records=0,
            min_date="",
            max_date="",
            days_covered=0,
            medicines_count=0,
            medicines=[],
            message="No dataset uploaded yet. Please upload an Excel or CSV file to start.",
        )

    total_records = len(df)
    min_date = df["Date"].min().strftime("%Y-%m-%d")
    max_date = df["Date"].max().strftime("%Y-%m-%d")
    days_covered = int((df["Date"].max() - df["Date"].min()).days) + 1

    medicines_summary: List[PredictiveMedicineSummary] = []
    grouped = df.groupby(
        ["Medicine_Name", "Medicine_ID", "Category", "Criticality"], as_index=False
    )

    for (name, m_id, cat, crit), group in grouped:
        m_count = len(group)
        m_min = group["Date"].min().strftime("%Y-%m-%d")
        m_max = group["Date"].max().strftime("%Y-%m-%d")
        m_total = float(group["Consumed_Units"].sum())
        m_avg = round(float(group["Consumed_Units"].mean()), 1)
        medicines_summary.append(
            PredictiveMedicineSummary(
                medicine_name=name,
                medicine_id=m_id,
                category=cat,
                criticality=crit,
                record_count=m_count,
                min_date=m_min,
                max_date=m_max,
                total_consumed=m_total,
                avg_daily_consumed=m_avg,
            )
        )

    medicines_summary.sort(key=lambda x: x.medicine_name)

    return DatasetSummaryResponse(
        filename=filename,
        is_default=is_default,
        total_records=total_records,
        min_date=min_date,
        max_date=max_date,
        days_covered=days_covered,
        medicines_count=len(medicines_summary),
        medicines=medicines_summary,
        message=f"Dataset '{filename}' active with {total_records:,} verified records covering {len(medicines_summary)} formulary medicines.",
    )


# ================================================================
# ML PREDICTIVE PIPELINE: FEATURE EXTRACTION & 90-DAY FORECAST
# ================================================================

LAG_PERIODS = [1, 2, 3, 7, 14, 21, 28, 30, 60, 90]


def run_90day_recursive_forecast(
    medicine_name_or_id: str,
    horizon_days: int = 90,
    current_stock: Optional[float] = None,
) -> PredictDemandResponse:
    """
    Executes the full feature extraction, engineering, and 90-day recursive XGBoost inference pipeline.
    """
    df, filename, _ = get_active_dataset()
    if df is None or df.empty:
        raise ValueError(
            "No active dataset. Please upload an Excel or CSV file before forecasting."
        )

    model, feature_names = load_pharmacy_model()

    # Match medicine
    search = medicine_name_or_id.strip().lower()
    sub_df = df[
        (df["Medicine_Name"].str.strip().str.lower() == search)
        | (df["Medicine_ID"].str.strip().str.lower() == search)
    ].copy()

    if sub_df.empty:
        # Try substring
        sub_df = df[
            df["Medicine_Name"]
            .str.strip()
            .str.lower()
            .str.contains(search, regex=False)
            | df["Medicine_ID"]
            .str.strip()
            .str.lower()
            .str.contains(search, regex=False)
        ].copy()

    if sub_df.empty:
        raise ValueError(
            f"Medicine '{medicine_name_or_id}' was not found in active dataset '{filename}'."
        )

    # Aggregate by day in case multiple rows exist for the same day
    daily_history = (
        sub_df.groupby("Date", as_index=False)
        .agg({"Consumed_Units": "sum"})
        .sort_values("Date")
        .reset_index(drop=True)
    )

    # Reindex daily range to guarantee exact 1-day continuity without gaps
    min_date = daily_history["Date"].min()
    max_date = daily_history["Date"].max()
    full_idx = pd.date_range(start=min_date, end=max_date, freq="D")
    daily_history = (
        daily_history.set_index("Date")
        .reindex(full_idx, fill_value=0.0)
        .rename_axis("Date")
        .reset_index()
    )

    history_dates = list(daily_history["Date"])
    history_units = list(daily_history["Consumed_Units"].astype(float))

    rec = sub_df.iloc[-1]
    med_name = str(rec["Medicine_Name"])
    med_id = str(rec["Medicine_ID"])
    category = str(rec["Category"])
    criticality = str(rec["Criticality"])

    # If historical records are fewer than 90 days, pad the front with earliest value/mean
    # so Lag_90 and RollingMean_90 can always be computed reliably
    if len(history_units) < 90:
        pad_val = history_units[0] if history_units else 50.0
        padding = [pad_val] * (90 - len(history_units))
        working_units = padding + history_units
    else:
        working_units = history_units.copy()

    working_dates = history_dates.copy()

    # Pre-build base one-hot dict to avoid repeated checks
    base_one_hot: Dict[str, int] = {}
    for col in feature_names:
        if col.startswith("Medicine_ID_"):
            base_one_hot[col] = 1 if col == f"Medicine_ID_{med_id}" else 0
        elif col.startswith("Category_"):
            base_one_hot[col] = 1 if col == f"Category_{category}" else 0
        elif col.startswith("Criticality_"):
            base_one_hot[col] = 1 if col == f"Criticality_{criticality}" else 0

    # Execute 90-step recursive forecast
    predicted_points: List[DailyForecastPoint] = []
    future_units_only: List[float] = []

    last_date = working_dates[-1]

    for step in range(1, horizon_days + 1):
        step_date = last_date + pd.Timedelta(days=step)

        # 1. Calendar features
        features_dict: Dict[str, Any] = {
            "Year": step_date.year,
            "Month": step_date.month,
            "Day": step_date.day,
            "DayOfWeek": step_date.dayofweek,
            "DayOfYear": step_date.dayofyear,
            "WeekOfYear": int(step_date.isocalendar().week),
            "Quarter": step_date.quarter,
            "IsWeekend": 1 if step_date.dayofweek >= 5 else 0,
        }

        # 2. Lag features (Lag_1 ... Lag_90)
        for lag in LAG_PERIODS:
            features_dict[f"Lag_{lag}"] = working_units[-lag]

        # 3. Rolling features (shift 1 lookback, matching pharmacy_pre.py)
        # The last w entries of working_units are the w preceding days
        features_dict["RollingMean_7"] = float(np.mean(working_units[-7:]))
        features_dict["RollingMean_14"] = float(np.mean(working_units[-14:]))
        features_dict["RollingMean_30"] = float(np.mean(working_units[-30:]))
        features_dict["RollingMean_60"] = float(np.mean(working_units[-60:]))
        features_dict["RollingMean_90"] = float(np.mean(working_units[-90:]))

        features_dict["RollingStd_7"] = (
            float(np.std(working_units[-7:], ddof=1))
            if len(working_units) >= 7
            else 0.0
        )
        features_dict["RollingStd_30"] = (
            float(np.std(working_units[-30:], ddof=1))
            if len(working_units) >= 30
            else 0.0
        )

        # 4. One-hot features
        features_dict.update(base_one_hot)

        # 5. Form inference input and predict
        X_step = pd.DataFrame([features_dict])[feature_names]
        raw_pred = float(model.predict(X_step)[0])
        pred_val = max(round(raw_pred, 1), 0.0)

        # Update series for next iteration's lags and rolling means
        working_units.append(pred_val)
        future_units_only.append(pred_val)

        # Rolling 7-day average of recent predictions
        recent_window = (
            future_units_only[-7:] if len(future_units_only) >= 7 else future_units_only
        )
        rolling_7d = round(float(np.mean(recent_window)), 1)

        predicted_points.append(
            DailyForecastPoint(
                date=step_date.strftime("%Y-%m-%d"),
                day_index=step,
                day_name=step_date.strftime("%A"),
                predicted_units=pred_val,
                rolling_7d_avg=rolling_7d,
            )
        )

    # Month-wise aggregation
    pred_df = pd.DataFrame(
        {
            "Date": [datetime.strptime(p.date, "%Y-%m-%d") for p in predicted_points],
            "Predicted_Units": [p.predicted_units for p in predicted_points],
        }
    )
    pred_df["Month_Key"] = pred_df["Date"].dt.strftime("%Y-%m")
    pred_df["Month_Label"] = pred_df["Date"].dt.strftime("%B %Y")

    total_90d = float(pred_df["Predicted_Units"].sum())

    month_groups = pred_df.groupby(["Month_Key", "Month_Label"], as_index=False).agg(
        total_units=("Predicted_Units", "sum"),
        avg_daily_units=("Predicted_Units", "mean"),
        days_count=("Predicted_Units", "count"),
    )

    month_wise: List[MonthWiseForecast] = []
    if len(month_groups) == 3:
        for _, row in month_groups.iterrows():
            t_units = round(float(row["total_units"]), 1)
            pct = round((t_units / total_90d * 100), 1) if total_90d > 0 else 0.0
            month_wise.append(
                MonthWiseForecast(
                    month_key=str(row["Month_Key"]),
                    month_label=str(row["Month_Label"]),
                    total_units=t_units,
                    avg_daily_units=round(float(row["avg_daily_units"]), 1),
                    days_count=int(row["days_count"]),
                    pct_of_total=pct,
                )
            )
    else:
        # Partition 90 days into exactly 3 30-day monthly blocks
        for m_idx, (start_idx, end_idx) in enumerate([(0, 30), (30, 60), (60, 90)]):
            slice_df = pred_df.iloc[start_idx:end_idx]
            t_units = round(float(slice_df["Predicted_Units"].sum()), 1)
            avg_u = round(float(slice_df["Predicted_Units"].mean()), 1)
            pct = round((t_units / total_90d * 100), 1) if total_90d > 0 else 0.0
            d_start = slice_df["Date"].min().strftime("%b %d")
            d_end = slice_df["Date"].max().strftime("%b %d, %Y")
            month_wise.append(
                MonthWiseForecast(
                    month_key=f"M{m_idx + 1}",
                    month_label=f"Month {m_idx + 1} ({d_start} – {d_end})",
                    total_units=t_units,
                    avg_daily_units=avg_u,
                    days_count=len(slice_df),
                    pct_of_total=pct,
                )
            )

    # Peak & Lowest Usage Days
    peak_idx = pred_df["Predicted_Units"].idxmax()
    low_idx = pred_df["Predicted_Units"].idxmin()

    peak_pt = predicted_points[peak_idx]
    low_pt = predicted_points[low_idx]

    peak_day = PeakUsageDay(
        date=peak_pt.date, units=peak_pt.predicted_units, day_name=peak_pt.day_name
    )
    lowest_day = PeakUsageDay(
        date=low_pt.date, units=low_pt.predicted_units, day_name=low_pt.day_name
    )

    # Last 30 days of actual history for visualization context and Part 1 telemetry
    recent_tail = daily_history.tail(30)
    past_month_total = float(recent_tail["Consumed_Units"].sum())
    last_month_avg_daily = (
        round(past_month_total / len(recent_tail), 1) if len(recent_tail) > 0 else 0.0
    )

    # Determine current stock
    if current_stock is not None and current_stock >= 0:
        resolved_stock = float(current_stock)
    elif "Current_Stock" in sub_df.columns and pd.notna(
        sub_df.iloc[-1].get("Current_Stock")
    ):
        resolved_stock = float(sub_df.iloc[-1]["Current_Stock"])
    else:
        resolved_stock = float(round(last_month_avg_daily * 35, 0))

    # Calculate Days of Stock based on PREDICTED 90-day daily consumption values:
    remaining_stock = resolved_stock
    days_of_stock_remaining = 0.0
    stockout_projected_date: Optional[str] = None

    for idx, pt in enumerate(predicted_points):
        p_units = pt.predicted_units
        if remaining_stock <= 0:
            break
        if remaining_stock < p_units:
            # Runs out on this day
            fraction = remaining_stock / p_units if p_units > 0 else 0.0
            days_of_stock_remaining = idx + fraction
            stockout_projected_date = pt.date
            remaining_stock = 0.0
            break
        else:
            remaining_stock -= p_units
            days_of_stock_remaining = idx + 1

    if remaining_stock > 0:
        # Stock lasts beyond 90-day forecast horizon
        avg_forecast_pace = float(pred_df["Predicted_Units"].mean())
        if avg_forecast_pace > 0:
            extra_days = remaining_stock / avg_forecast_pace
            days_of_stock_remaining = round(90.0 + extra_days, 1)
        else:
            days_of_stock_remaining = 999.0
        stockout_projected_date = None
    else:
        days_of_stock_remaining = round(days_of_stock_remaining, 1)

    # Determine stock status signal
    if days_of_stock_remaining <= 14:
        stock_status_signal = "CRITICAL_DEFICIT"
    elif days_of_stock_remaining <= 30:
        stock_status_signal = "REORDER_REQUIRED"
    elif days_of_stock_remaining <= 60:
        stock_status_signal = "HEALTHY_STOCK"
    else:
        stock_status_signal = "SURPLUS_OPTIMAL"

    recent_history: List[RecentHistoryPoint] = [
        RecentHistoryPoint(
            date=row["Date"].strftime("%Y-%m-%d"),
            consumed_units=float(row["Consumed_Units"]),
        )
        for _, row in recent_tail.iterrows()
    ]

    return PredictDemandResponse(
        medicine_name=med_name,
        medicine_id=med_id,
        category=category,
        criticality=criticality,
        dataset_filename=filename,
        historical_days_used=len(daily_history),
        last_historical_date=last_date.strftime("%Y-%m-%d"),
        horizon_start=predicted_points[0].date,
        horizon_end=predicted_points[-1].date,
        total_90d_demand=round(total_90d, 1),
        avg_daily_demand=round(float(pred_df["Predicted_Units"].mean()), 1),
        current_stock=resolved_stock,
        past_month_total_consumed=round(past_month_total, 1),
        last_month_avg_daily_consumed=round(last_month_avg_daily, 1),
        days_of_stock_remaining=days_of_stock_remaining,
        stockout_projected_date=stockout_projected_date,
        stock_status_signal=stock_status_signal,
        peak_day=peak_day,
        lowest_day=lowest_day,
        month_wise=month_wise,
        daily_forecast=predicted_points,
        recent_history=recent_history,
        features_used=len(feature_names),
        model_name="XGBoost Regressor (72 Features: Lags 1-90, Rolling Windows 7-90, One-Hot Clinical Identifiers)",
    )
