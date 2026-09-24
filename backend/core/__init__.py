"""
Core configuration and application state management.
"""

from backend.core.config import (
    BASE_DIR,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    MODEL_PATH,
    DATA_PATH,
    RAG_DIR,
    DIST_PATH,
)

__all__ = [
    "BASE_DIR",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "MODEL_PATH",
    "DATA_PATH",
    "RAG_DIR",
    "DIST_PATH",
]
