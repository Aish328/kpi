from sqlalchemy import text
from database import engine


def save_health(
    feeder,
    score,
    status
):

    query = """

    INSERT INTO feeder_health(

        timestamp,
        feeder,
        health_score,
        status

    )

    VALUES(

        NOW(),
        :feeder,
        :score,
        :status

    )

    """

    with engine.begin() as conn:

        conn.execute(
            text(query),
            {

                "feeder": feeder,
                "score": score,
                "status": status

            }
        )