from typing import Optional

from fastapi import APIRouter, Query
import pandas as pd
from sqlalchemy import text

from db_loader import engine
from services.anamoly_engine import detect_anomalies

router = APIRouter()


@router.get("/")
def get_anomalies(
    feeder: Optional[str] = Query(
        None, description="Feeder display name, e.g. '11KV TAMHANI FEEDER'. "
                           "Omit to check all feeders."
    )
):
    if feeder:
        query = """
        SELECT *
        FROM all_feeders
        WHERE feeder = :feeder
        ORDER BY time DESC
        LIMIT 5000
        """
        params = {"feeder": feeder}
    else:
        query = """
        SELECT *
        FROM all_feeders
        ORDER BY time DESC
        LIMIT 5000
        """
        params = {}

    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn, params=params)

    if df.empty:
        return []

    anomalies = detect_anomalies(df, feeder=feeder)

    return anomalies.tail(50).to_dict(orient="records")