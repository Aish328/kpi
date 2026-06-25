from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
from services.database import engine
from sqlalchemy import text
import traceback

from routes import kpi,  health, anamolies, filters, data


app = FastAPI(title="SCADA Intelligence Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
# IMPORTANT: Each router file must use @router.get("/") or @router.get("/{id}")
# — NOT @router.get("/kpi/") — because the prefix below already adds that path.
app.include_router(kpi.router,     prefix="/kpi")
app.include_router(filters.router, prefix="/filters")
app.include_router(data.router,    prefix="/data")
# app.include_router(spikes.router,  prefix="/spikes")
app.include_router(
    health.router,
    prefix="/health_index"
)

app.include_router(
    anamolies.router,
    prefix="/anomalies"
)
# ── Static files ─────────────────────────────────────────────────────────────
static_dir = Path(__file__).parent / "static"

if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
    print("[INFO] Static files mounted at /static")
else:
    print("[WARN] 'static/' directory not found — frontend will not be served")

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup_event():
    print("\n" + "="*50)
    print("[STARTUP] SCADA Backend booting...")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("[STARTUP] ✅ PostgreSQL connection OK")
    except Exception as e:
        print("[STARTUP] ❌ PostgreSQL connection FAILED:")
        print(f"           {e}")
        print("           Check DATABASE_URL in database.py")
    print("="*50 + "\n")

# ── Core routes ───────────────────────────────────────────────────────────────
@app.get("/")
def serve_index():
    print("[REQUEST] GET /")
    index_path = static_dir / "index.html"
    if not index_path.exists():
        return JSONResponse({"error": "index.html not found in static/"}, status_code=404)
    return FileResponse(index_path)

@app.get("/health")
def health():
    return {"status": "ok"}

# ── Diagnostic endpoint — open in browser to confirm DB + table state ─────────
@app.get("/debug")
def debug():
    """
    Returns DB connection status and table list.
    Hit http://localhost:8000/debug to verify your setup without touching the frontend.
    """
    result = {"db_connected": False, "tables": [], "error": None}
    try:
        with engine.connect() as conn:
            result["db_connected"] = True
            rows = conn.execute(
                text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
            ).fetchall()
            result["tables"] = [r[0] for r in rows]
    except Exception as e:
        result["error"] = str(e)
        result["traceback"] = traceback.format_exc()
    return result