import pandas as pd
from sqlalchemy import create_engine
from config import DB_URI

# Create once
engine = create_engine(DB_URI)


def load_scada(table_name="scada_db"):
    return pd.read_sql(
        f"SELECT * FROM {table_name}",
        engine
    )