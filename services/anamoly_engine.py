import logging

import pandas as pd

from services.feature_engineering import add_features
from services.model_manager import load_model, load_scaler

logger = logging.getLogger(__name__)

FEATURES = [
    "Iavg",
    "Vavg",
    "active_load",
    "Iimbalance",
    "Vimbalance",
]

# Maps the feeder display name stored in the DB -> the uid used as the
# models/<uid>/ folder name (same mapping used by the NHITS forecasters).
try:
    import config as cfg
    FEEDER_ID_MAP = cfg.FEEDER_ID_MAP
except Exception:
    logger.warning(
        "Could not import FEEDER_ID_MAP from config.py — falling back to "
        "using the raw feeder name as the model folder name."
    )
    FEEDER_ID_MAP = {}


def _resolve_feeder_col(df: pd.DataFrame) -> str:
    for candidate in ("feeder", "Feeder"):
        if candidate in df.columns:
            return candidate
    raise KeyError(
        "No feeder column found in query result "
        f"(expected 'feeder' or 'Feeder'); got columns: {list(df.columns)}"
    )


def _uid_for(feeder_name: str) -> str:
    return FEEDER_ID_MAP.get(feeder_name, feeder_name)


def _detect_for_one_feeder(df_feeder: pd.DataFrame, uid: str) -> pd.DataFrame:
    """Runs the isolation forest for a single feeder's rows.
    Returns an empty frame (not an error) if that feeder has no trained
    model yet, so one missing feeder never breaks the /anomalies endpoint."""
    model = load_model(uid)
    scaler = load_scaler(uid)

    if model is None or scaler is None:
        logger.warning("Skipping anomaly detection for '%s' — model not trained.", uid)
        return df_feeder.iloc[0:0]

    X = df_feeder[FEATURES].dropna()
    if X.empty:
        return df_feeder.iloc[0:0]

    X_scaled = scaler.transform(X)
    preds = model.predict(X_scaled)

    anomaly_rows = df_feeder.loc[X.index].copy()
    anomaly_rows["prediction"] = preds

    return anomaly_rows[anomaly_rows["prediction"] == -1]


def detect_anomalies(df: pd.DataFrame, feeder: str | None = None) -> pd.DataFrame:
    """
    Run anomaly detection using each feeder's own dedicated isolation-forest
    model.

    Parameters
    ----------
    df      : raw rows from `all_feeders` (must include a feeder column plus
              whatever add_features() needs).
    feeder  : optional feeder display name. If given, only that feeder's
              model is used (df is still filtered defensively in case the
              caller passed unfiltered rows).
    """
    df = add_features(df)
    feeder_col = _resolve_feeder_col(df)

    if feeder:
        df = df[df[feeder_col] == feeder]
        if df.empty:
            return df

    results = []
    for feeder_name, group in df.groupby(feeder_col):
        uid = _uid_for(feeder_name)
        results.append(_detect_for_one_feeder(group, uid))

    if not results:
        return df.iloc[0:0]

    return pd.concat(results, ignore_index=False).sort_index()