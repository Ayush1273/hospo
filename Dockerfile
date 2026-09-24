# ================================================================
# HOSP-AI COMMAND — Multi-Stage Production Dockerfile for Render
# ================================================================

# --- Stage 1: Build React 19 / Vite Frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /app

# Install dependencies first for optimal Docker layer caching
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source and build static bundle into /app/dist
COPY . .
RUN npm run build

# --- Stage 2: Production Python Backend ---
FROM python:3.11-slim
WORKDIR /app

# Install minimal runtime dependencies for XGBoost and sentence-transformers
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files (models, data, backend)
COPY . .

# Copy pre-compiled Vite frontend from Stage 1 into /app/dist
COPY --from=frontend-builder /app/dist ./dist

# Render environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=10000

EXPOSE 10000

# Start Uvicorn serving both FastAPI backend and React frontend
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
