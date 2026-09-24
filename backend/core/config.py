"""
Global configuration, environment settings, and filesystem paths.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Root of the application (hosp-ai-frontend)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load environment variables from .env
load_dotenv(BASE_DIR / ".env")

# LLM Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

# Asset & Model Paths
MODEL_PATH = BASE_DIR / "models" / "xgb_model.json"
DATA_PATH = BASE_DIR / "Operational data.xlsx"
RAG_DIR = BASE_DIR / "hosp_ai_embeddings"
DIST_PATH = BASE_DIR / "dist"
