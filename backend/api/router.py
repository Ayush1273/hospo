"""
Central API router combining all endpoint sub-routers.
"""

from fastapi import APIRouter
from backend.api.endpoints import health, analysis, pharmacy

api_router = APIRouter(prefix="/api")

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(analysis.router, tags=["Analysis"])
api_router.include_router(pharmacy.router)
