"""
Pharmacy Intelligence & Demand Forecasting Service.
Faithfully ports the exact forecasting algorithms, reorder logic, and stockout projection from hospo ai new/app.py.
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from backend.schemas.pharmacy import (
    MedicineOption,
    MedicineRecord,
    ConsumptionPoint,
    DemandForecastPoint,
    PharmacyForecastMetrics,
    MedicineIntelligenceResponse,
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PHARMACY_PATH = BASE_DIR / "pharmacy_inventory_analyzed.csv"

_cached_pharmacy_df: Optional[pd.DataFrame] = None
_cached_mtime: float = 0.0


def get_pharmacy_df() -> pd.DataFrame:
    """Loads and caches pharmacy inventory dataset, reloading if the file changed on disk."""
    global _cached_pharmacy_df, _cached_mtime
    if not PHARMACY_PATH.exists():
        raise FileNotFoundError(
            f"Pharmacy inventory file not found at: {PHARMACY_PATH}"
        )

    mtime = PHARMACY_PATH.stat().st_mtime
    if _cached_pharmacy_df is None or mtime != _cached_mtime:
        df = pd.read_csv(PHARMACY_PATH)
        df.columns = [c.strip() for c in df.columns]
        _cached_pharmacy_df = df
        _cached_mtime = mtime
    return _cached_pharmacy_df


def get_medicine_options() -> List[MedicineOption]:
    """Returns sorted unique medicines with metadata for selector."""
    df = get_pharmacy_df()
    options = []
    medicines = sorted(
        df["Medicine_Name"]
        .astype(str)
        .str.strip()
        .loc[lambda s: s.ne("")]
        .unique()
        .tolist()
    )
    for med in medicines:
        sub = df[df["Medicine_Name"].astype(str).str.strip() == med]
        if not sub.empty:
            rec = sub.iloc[0]
            options.append(
                MedicineOption(
                    medicine_name=med,
                    category=str(rec.get("Category", "General")),
                    criticality=str(rec.get("Criticality", "STANDARD")),
                    current_stock=float(rec.get("Current_Stock", 0))
                    if pd.notna(rec.get("Current_Stock"))
                    else None,
                    stockout_risk=str(rec.get("Stockout_Risk", "LOW")),
                    expiry_risk=str(rec.get("Expiry_Risk", "LOW")),
                )
            )
    return options


def prepare_medicine_consumption_history(selected_rows: pd.DataFrame) -> pd.DataFrame:
    """Returns monthly recorded consumption history for selected medicine."""
    if selected_rows.empty:
        return pd.DataFrame(columns=["Month", "Consumed_Units"])

    month_column = next(
        (
            c
            for c in ["Month", "Date", "month", "date", "Timestamp"]
            if c in selected_rows.columns
        ),
        None,
    )
    usage_column = next(
        (
            c
            for c in [
                "Consumed_Units",
                "Consumption",
                "Consumed",
                "Usage",
                "Monthly_Consumption",
            ]
            if c in selected_rows.columns
        ),
        None,
    )

    if month_column is None or usage_column is None:
        return pd.DataFrame(columns=["Month", "Consumed_Units"])

    history = selected_rows[[month_column, usage_column]].copy()
    history["Month"] = pd.to_datetime(history[month_column], errors="coerce")
    history["Consumed_Units"] = pd.to_numeric(history[usage_column], errors="coerce")
    history = history.dropna(subset=["Month", "Consumed_Units"])

    if history.empty:
        return pd.DataFrame(columns=["Month", "Consumed_Units"])

    history["Month"] = history["Month"].dt.to_period("M").dt.to_timestamp()
    history = (
        history.groupby("Month", as_index=False)["Consumed_Units"]
        .sum()
        .sort_values("Month")
        .reset_index(drop=True)
    )
    return history


def forecast_pharmacy_demand(selected_rows: pd.DataFrame, forecast_months: int = 3):
    """
    Forecasts monthly medicine demand without fabricating historical data.
    - 3+ historical months: fits a LinearRegression trend.
    - Fewer than 3 months: projects from Average_Daily_Usage baseline.
    """
    history = prepare_medicine_consumption_history(selected_rows)

    current_record = selected_rows.iloc[0] if not selected_rows.empty else None
    if not selected_rows.empty and "Month" in selected_rows.columns:
        temp = selected_rows.copy()
        temp["_parsed_month"] = pd.to_datetime(temp["Month"], errors="coerce")
        valid = temp[temp["_parsed_month"].notna()]
        if not valid.empty:
            current_record = valid.sort_values("_parsed_month").iloc[-1]

    daily_usage = np.nan
    if current_record is not None:
        daily_usage = pd.to_numeric(
            current_record.get("Average_Daily_Usage"), errors="coerce"
        )

    if not history.empty:
        last_month = history["Month"].max()
    else:
        last_month = pd.Timestamp.now().normalize().to_period("M").to_timestamp()

    future_months = pd.date_range(
        start=last_month + pd.offsets.MonthBegin(1),
        periods=forecast_months,
        freq="MS",
    )

    method = "Baseline from current average daily usage"
    if len(history) >= 3:
        X = np.arange(len(history), dtype=float).reshape(-1, 1)
        y = history["Consumed_Units"].to_numpy(dtype=float)
        model = LinearRegression()
        model.fit(X, y)

        future_X = np.arange(
            len(history), len(history) + forecast_months, dtype=float
        ).reshape(-1, 1)
        forecast_values = model.predict(future_X)
        method = "Linear trend forecast from historical consumption"

    elif pd.notna(daily_usage) and float(daily_usage) >= 0:
        forecast_values = np.array(
            [float(daily_usage) * month.days_in_month for month in future_months],
            dtype=float,
        )
    elif not history.empty:
        baseline = float(history["Consumed_Units"].iloc[-1])
        forecast_values = np.repeat(baseline, forecast_months)
        method = "Last observed monthly consumption baseline"
    else:
        forecast_values = np.zeros(forecast_months, dtype=float)
        method = "Unavailable — no consumption history"

    forecast_values = np.maximum(np.round(forecast_values, 0), 0)
    forecast_df = pd.DataFrame(
        {
            "Month": future_months,
            "Forecast_Consumption": forecast_values,
        }
    )
    return history, forecast_df, method


def calculate_pharmacy_forecast_metrics(
    current_record: pd.Series, forecast_df: pd.DataFrame
):
    """Calculates stock coverage, lead-time demand, suggested reorder quantity, and projected stockout."""
    current_stock = pd.to_numeric(current_record.get("Current_Stock"), errors="coerce")
    minimum_stock = pd.to_numeric(current_record.get("Minimum_Stock"), errors="coerce")
    lead_time = pd.to_numeric(current_record.get("Lead_Time_Days"), errors="coerce")
    daily_usage = pd.to_numeric(
        current_record.get("Average_Daily_Usage"), errors="coerce"
    )

    total_forecast = (
        float(forecast_df["Forecast_Consumption"].sum())
        if not forecast_df.empty
        else 0.0
    )

    total_days = (
        max(sum(month.days_in_month for month in forecast_df["Month"]), 1)
        if not forecast_df.empty
        else 1
    )
    average_forecast_daily = (
        total_forecast / total_days
        if not forecast_df.empty
        else (float(daily_usage) if pd.notna(daily_usage) else 0.0)
    )

    is_infinite = False
    if pd.notna(current_stock) and average_forecast_daily > 0:
        forecast_days_of_stock = float(current_stock) / average_forecast_daily
    else:
        forecast_days_of_stock = None
        is_infinite = True

    if pd.notna(lead_time) and average_forecast_daily > 0:
        lead_time_demand = float(lead_time) * average_forecast_daily
    else:
        lead_time_demand = 0.0

    safety_stock = float(minimum_stock) if pd.notna(minimum_stock) else 0.0
    if pd.notna(current_stock):
        reorder_quantity = max(
            lead_time_demand + safety_stock - float(current_stock), 0
        )
    else:
        reorder_quantity = 0.0

    cumulative_demand = 0.0
    projected_stock = []
    projected_stockout_month = None

    if pd.notna(current_stock):
        running_stock = float(current_stock)
        for _, row in forecast_df.iterrows():
            running_stock -= float(row["Forecast_Consumption"])
            cumulative_demand += float(row["Forecast_Consumption"])
            projected_stock.append(max(round(running_stock, 1), 0))
            if projected_stockout_month is None and running_stock <= 0:
                projected_stockout_month = row["Month"]

    forecast_df = forecast_df.copy()
    forecast_df["Projected_Stock"] = projected_stock

    metrics = {
        "current_stock": float(current_stock) if pd.notna(current_stock) else None,
        "forecast_days_of_stock": forecast_days_of_stock,
        "is_coverage_infinite": is_infinite,
        "lead_time_demand": round(lead_time_demand, 1),
        "reorder_quantity": round(reorder_quantity, 1),
        "total_forecast_demand": round(total_forecast, 1),
        "projected_stockout_month": projected_stockout_month.strftime("%B %Y")
        if projected_stockout_month is not None
        else None,
        "forecast_daily_usage": round(average_forecast_daily, 2),
    }
    return metrics, forecast_df


def get_medicine_intelligence(medicine_name: str) -> MedicineIntelligenceResponse:
    """Computes and returns full medicine intelligence, historical consumption, 3-month forecast and metrics."""
    df = get_pharmacy_df()
    selected_rows = df[
        df["Medicine_Name"].astype(str).str.strip().str.lower()
        == medicine_name.strip().lower()
    ].copy()
    if selected_rows.empty:
        raise ValueError(f"No records found for medicine: '{medicine_name}'")

    current_record = selected_rows.iloc[0].copy()
    if "Month" in selected_rows.columns:
        temp_current = selected_rows.copy()
        temp_current["_parsed_month"] = pd.to_datetime(
            temp_current["Month"], errors="coerce"
        )
        valid_current = temp_current[temp_current["_parsed_month"].notna()]
        if not valid_current.empty:
            current_record = valid_current.sort_values("_parsed_month").iloc[-1]

    history_df, forecast_df, forecast_method = forecast_pharmacy_demand(
        selected_rows, forecast_months=3
    )
    metrics_dict, forecast_df_with_stock = calculate_pharmacy_forecast_metrics(
        current_record, forecast_df
    )

    history_points = []
    if not history_df.empty:
        for _, row in history_df.iterrows():
            m_dt = row["Month"]
            history_points.append(
                ConsumptionPoint(
                    month=m_dt.strftime("%Y-%m-%d"),
                    month_label=m_dt.strftime("%b %Y"),
                    consumed_units=float(row["Consumed_Units"]),
                )
            )

    forecast_points = []
    for _, row in forecast_df_with_stock.iterrows():
        m_dt = row["Month"]
        forecast_points.append(
            DemandForecastPoint(
                month=m_dt.strftime("%Y-%m-%d"),
                month_label=m_dt.strftime("%b %Y"),
                forecast_consumption=int(row["Forecast_Consumption"]),
                projected_stock=float(row["Projected_Stock"]),
            )
        )

    has_stockout = metrics_dict["projected_stockout_month"] is not None
    stockout_msg = (
        f"Projected stock depletion: {metrics_dict['projected_stockout_month']}. Review replenishment schedule."
        if has_stockout
        else "Current stock is not projected to reach zero within the displayed 3-month forecast horizon."
    )

    med_rec = MedicineRecord(
        month=str(current_record.get("Month", "")),
        medicine_id=str(current_record.get("Medicine_ID", "")),
        medicine_name=str(current_record.get("Medicine_Name", "")),
        category=str(current_record.get("Category", "General")),
        criticality=str(current_record.get("Criticality", "STANDARD")),
        opening_stock=float(current_record.get("Opening_Stock", 0)),
        consumed_units=float(current_record.get("Consumed_Units", 0)),
        restocked_units=float(current_record.get("Restocked_Units", 0)),
        current_stock=float(current_record.get("Current_Stock", 0)),
        average_daily_usage=float(current_record.get("Average_Daily_Usage", 0)),
        lead_time_days=float(current_record.get("Lead_Time_Days", 0)),
        minimum_stock=float(current_record.get("Minimum_Stock", 0)),
        expiry_date=str(current_record.get("Expiry_Date", "")),
        days_of_stock_remaining=float(current_record.get("Days_of_Stock_Remaining", 0)),
        stock_status=str(current_record.get("Stock_Status", "ADEQUATE")),
        stockout_risk=str(current_record.get("Stockout_Risk", "LOW")),
        days_to_expiry=float(current_record.get("Days_to_Expiry", 0)),
        expiry_risk=str(current_record.get("Expiry_Risk", "LOW")),
    )

    metrics_obj = PharmacyForecastMetrics(**metrics_dict)

    return MedicineIntelligenceResponse(
        selected_medicine=str(current_record.get("Medicine_Name")),
        current_record=med_rec,
        history=history_points,
        forecast=forecast_points,
        forecast_method=forecast_method,
        metrics=metrics_obj,
        has_projected_stockout=has_stockout,
        stockout_message=stockout_msg,
    )
