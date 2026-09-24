"""
Health check and service status endpoint.
"""

from datetime import datetime, timezone
from fastapi import APIRouter
from backend.core.resources import resources

router = APIRouter()


@router.get("/health", summary="Service Health & Diagnostic Status")
def health_check():
    return {
        "status": "healthy",
        "service": "HOSP-AI COMMAND",
        "model_loaded": resources.model is not None,
        "rag_loaded": resources.rag_embeddings is not None,
        "gemini_connected": resources.gemini_client is not None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
