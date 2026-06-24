from services.feature_engineering import add_features
from services.threshold_engine import get_thresholds


def compute_health(df):

    df = add_features(df)

    th = get_thresholds(df)

    latest = df.iloc[-1]

    voltage_score = 100

    if latest["Vavg"] > th["VHIGH"]:
        voltage_score -= 20

    if latest["Vavg"] < th["VLOW"]:
        voltage_score -= 20

    current_score = 100

    if latest["Iavg"] > th["IHIGH"]:
        current_score -= 20

    if latest["Iavg"] < th["ILOW"]:
        current_score -= 20

    imbalance_score = max(
        0,
        100 - latest["Iimbalance"]
    )

    health_score = round(

        0.4 * voltage_score +
        0.4 * current_score +
        0.2 * imbalance_score,

        2
    )

    if health_score >= 90:
        status = "Healthy"

    elif health_score >= 75:
        status = "Warning"

    elif health_score >= 50:
        status = "Poor"

    else:
        status = "Critical"

    return {
        "health_score": health_score,
        "status": status
    }