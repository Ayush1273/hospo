# 🚀 Deploying HOSP-AI COMMAND on Render (render.com)

This application is packaged and configured for 1-click deployment on **Render**. It seamlessly bundles the **FastAPI backend** (XGBoost forecasting, RAG embeddings, clinical telemetry) and the compiled **React 19 / Vite frontend** into a unified web service.

---

## 🌟 Quick Start Options

### Option 1: Docker Deployment (Recommended — 100% Zero-Config)

Render natively detects the included multi-stage [`Dockerfile`](./Dockerfile) to compile the Vite frontend with Node 20 and serve the FastAPI backend with Python 3.11.

1. **Push your code to GitHub / GitLab**.
2. Go to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** → **Web Service**.
4. Connect your GitHub repository.
5. Render will automatically detect the **Dockerfile**!
6. Configure the following settings:
   * **Name**: `hosp-ai-command`
   * **Region**: Choose the closest region to you (e.g., Oregon, Frankfurt, Singapore)
   * **Instance Type**: `Starter` or `Free`
7. Add **Environment Variables** (under *Advanced*):
   * `PORT`: `10000`
   * `GEMINI_API_KEY`: *(Your Google AI Gemini API Key)*
   * `GEMINI_MODEL`: `gemini-flash-lite-latest`
8. Click **Deploy Web Service**!

---

### Option 2: Render Blueprint (Infrastructure-as-Code via `render.yaml`)

You can launch using the included [`render.yaml`](./render.yaml) specification:

1. Push your repository to GitHub.
2. In Render, click **New +** → **Blueprint**.
3. Select your repository.
4. Render will parse [`render.yaml`](./render.yaml), configure health checks at `/api/health`, and prompt you to input `GEMINI_API_KEY`.
5. Click **Apply** to start deployment.

---

### Option 3: Native Python Web Service (Without Docker)

If you prefer deploying via Render's native Python runtime:

1. In Render, select **New +** → **Web Service**.
2. Set **Runtime**: `Python`
3. Set **Build Command**:
   ```bash
   ./build.sh
   ```
4. Set **Start Command**:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port $PORT
   ```
5. Set Environment Variables:
   * `PYTHON_VERSION`: `3.11.9`
   * `GEMINI_API_KEY`: *(Your Gemini API key)*
   * `GEMINI_MODEL`: `gemini-flash-lite-latest`

---

## 📂 Configuration Files Summary

| File | Purpose |
|---|---|
| [`Dockerfile`](./Dockerfile) | Multi-stage production container: Node 20 Vite builder + Python 3.11 backend. |
| [`.dockerignore`](./.dockerignore) | Excludes node_modules, .venv, git artifacts from build context. |
| [`render.yaml`](./render.yaml) | Render Blueprint IaC configuration with health checks and env vars. |
| [`build.sh`](./build.sh) | Self-contained build script: installs Node 20 (if needed), builds Vite, and installs Python requirements. |
| [`requirements.txt`](./requirements.txt) | Python dependencies: FastAPI, Uvicorn, XGBoost, Pandas, scikit-learn, google-genai, etc. |
| [`backend/main.py`](./backend/main.py) | Mounts `/api` routes and automatically serves the compiled SPA frontend from `dist/`. |

---

## 🔍 Verification & Health Check

Once your deployment completes, Render will provide a public URL (e.g., `https://hosp-ai-command.onrender.com`).
* **Web UI**: Access the root URL `https://<your-service>.onrender.com/`
* **Health Check**: `https://<your-service>.onrender.com/api/health`
* **Interactive API Docs**: `https://<your-service>.onrender.com/docs`
