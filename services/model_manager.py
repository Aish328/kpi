import joblib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"


def load_model():
    return joblib.load(
        MODELS_DIR / "isolation_forest.pkl"
    )


def load_scaler():
    return joblib.load(
        MODELS_DIR / "scaler.pkl"
    )