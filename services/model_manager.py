import logging
from pathlib import Path
from threading import Lock
from typing import Optional

import joblib

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"

MODEL_FILENAME = "isolation_forest.pkl"
SCALER_FILENAME = "scaler.pkl"

_model_cache: dict[str, object] = {}
_scaler_cache: dict[str, object] = {}
_lock = Lock()
_warned: set[str] = set()


def _model_path(uid: str) -> Path:
    return MODELS_DIR / uid / MODEL_FILENAME


def _scaler_path(uid: str) -> Path:
    return MODELS_DIR / uid / SCALER_FILENAME


def load_model(uid: str) -> Optional[object]:
    """Lazily load the isolation-forest model for one feeder (uid).
    Returns None (never raises) if that feeder hasn't been trained yet,
    so callers can skip it instead of crashing."""
    with _lock:
        if uid in _model_cache:
            return _model_cache[uid]

    path = _model_path(uid)
    if not path.exists():
        if uid not in _warned:
            logger.warning("Anomaly model not found for feeder '%s' at %s", uid, path)
            _warned.add(uid)
        return None

    model = joblib.load(path)
    with _lock:
        _model_cache[uid] = model
    return model


def load_scaler(uid: str) -> Optional[object]:
    with _lock:
        if uid in _scaler_cache:
            return _scaler_cache[uid]

    path = _scaler_path(uid)
    if not path.exists():
        return None

    scaler = joblib.load(path)
    with _lock:
        _scaler_cache[uid] = scaler
    return scaler


def is_ready(uid: str) -> bool:
    return _model_path(uid).exists() and _scaler_path(uid).exists()


def available_feeders() -> list[str]:
    """uids that currently have a trained anomaly model on disk."""
    if not MODELS_DIR.exists():
        return []
    return sorted(
        d.name for d in MODELS_DIR.iterdir()
        if d.is_dir() and (d / MODEL_FILENAME).exists() and (d / SCALER_FILENAME).exists()
    )