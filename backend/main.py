"""
HOSP-AI COMMAND — Production Backend Entrypoint
FastAPI application bootstrap with CORS, lifespan management, API routers, and SPA static serving.
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.core.config import DIST_PATH
from backend.core.resources import lifespan, resources, load_all_resources
from backend.api.router import api_router

app = FastAPI(
    title="HOSP-AI COMMAND API",
    description="Hospital Operational Decision Support System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Endpoints (/api/health, /api/default-inputs, /api/analyze)
app.include_router(api_router)

# Mount Static Assets & SPA Routing for Render production builds
if DIST_PATH.exists():
    assets_dir = DIST_PATH / "assets"
    if assets_dir.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=str(assets_dir)),
            name="static-assets",
        )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow /api routes to be handled by FastAPI
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = DIST_PATH / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_PATH / "index.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
