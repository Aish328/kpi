from fastapi import APIRouter
import pandas as pd
from sqlalchemy import text

from services.database import engine
from services.health_engine import compute_health

router = APIRouter()


@router.get("/")
def get_health():

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

    return compute_health(df)