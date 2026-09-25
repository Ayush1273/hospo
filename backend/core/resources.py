"""
Application lifecycle and cached resources (ML models, RAG vector embeddings, operational history).
"""

from contextlib import asynccontextmanager
from typing import List, Optional
import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from google import genai
from fastapi import FastAPI

from backend.core.config import (
    MODEL_PATH,
    DATA_PATH,
    RAG_DIR,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_EMBEDDING_MODEL,
)


class Resources:
    model: Optional[XGBRegressor] = None
    feature_names: List[str] = []
    default_hospital_data: Optional[pd.DataFrame] = None
    active_hospital_data: Optional[pd.DataFrame] = None
    active_filename: str = "Operational data.csv"
    is_default_active: bool = True
    tail_history: Optional[pd.DataFrame] = None
    capacity_reference: float = 0.0
    latest_timestamp: pd.Timestamp = pd.Timestamp.now()
    rag_embeddings: Optional[np.ndarray] = None
    policy_df: Optional[pd.DataFrame] = None
    rag_text_column: str = "text"
    gemini_client: Optional[genai.Client] = None


resources = Resources()


def load_all_resources():
    """Load model, historical baseline data, RAG embeddings, and clients once."""
    from backend.services.hms_service import read_hospital_file

    print("[HOSP-AI] Loading XGBoost model from:", MODEL_PATH)
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"XGBoost model not found at {MODEL_PATH}")
    xgb = XGBRegressor()
    xgb.load_model(str(MODEL_PATH))
    resources.model = xgb
    resources.feature_names = list(xgb.feature_names_in_)

    print("[HOSP-AI] Loading historical operational data from:", DATA_PATH)
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Operational data file not found at {DATA_PATH}")

    # Use read_hospital_file to load, validate, and compute derived columns
    default_df = read_hospital_file(None)
    resources.default_hospital_data = default_df
    resources.active_hospital_data = default_df.copy()
    resources.active_filename = "Operational data.xlsx"
    resources.is_default_active = True

    # Cache maximum hospital capacity and tail window
    resources.capacity_reference = float(default_df["Total_Occupied_Beds"].max())
    resources.latest_timestamp = pd.to_datetime(default_df["Timestamp"]).max()
    resources.tail_history = default_df.tail(100).copy()

    print("[HOSP-AI] Loading RAG resources from:", RAG_DIR)
    if not RAG_DIR.exists():
        raise FileNotFoundError(f"RAG directory not found at {RAG_DIR}")

    emb_path = RAG_DIR / "document_embeddings.npy"
    if not emb_path.exists():
        raise FileNotFoundError(f"Embeddings file not found at {emb_path}")
    resources.rag_embeddings = np.load(str(emb_path))

    csv_candidates = [
        RAG_DIR / "embedded_knowledge_base.csv",
        RAG_DIR / "knowledge_base.csv",
        RAG_DIR / "policy_documents.csv",
        RAG_DIR / "policies.csv",
    ]
    csv_path = next((p for p in csv_candidates if p.exists()), None)
    if not csv_path:
        raise FileNotFoundError("Policy CSV not found in RAG directory")
    policy_df = pd.read_csv(csv_path)
    resources.policy_df = policy_df

    text_candidates = [
        "text",
        "Text",
        "Policy_Content",
        "policy_content",
        "Content",
        "content",
        "document",
        "Document",
    ]
    text_col = next((c for c in text_candidates if c in policy_df.columns), None)
    if not text_col:
        raise ValueError(f"Could not identify text column in {csv_path}")
    resources.rag_text_column = text_col

    print("[HOSP-AI] Configured Gemini Embedding 2 for ultra-low memory RAG.")

    if GEMINI_API_KEY:
        print("[HOSP-AI] Initializing Google GenAI Client with model:", GEMINI_MODEL)
        try:
            resources.gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        except Exception as e:
            print("[HOSP-AI] Warning: Failed to initialize Gemini Client:", e)
    else:
        print(
            "[HOSP-AI] Notice: GEMINI_API_KEY not set. Operating in fallback explanation mode."
        )

    print("[HOSP-AI] All resources successfully loaded and cached.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Modern FastAPI lifespan context manager for startup and shutdown events."""
    load_all_resources()
    yield
