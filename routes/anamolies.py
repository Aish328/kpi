from fastapi import APIRouter
import pandas as pd
from sqlalchemy import text

from db_loader import engine
from services.anamoly_engine import detect_anomalies

router = APIRouter()


@router.get("/")
def get_anomalies():

    query = """
    SELECT *
    FROM all_feeders
    ORDER BY time DESC
    LIMIT 5000
    """

    with engine.connect() as conn:
        df = pd.read_sql(
            text(query),
            conn
        )

    anomalies = detect_anomalies(df)

    return anomalies.tail(50).to_dict(
        orient="records"
    )