from services.feature_engineering import add_features
from services.threshold_engine import get_thresholds
from services.duration_engine import calculate_duration


def compute_kpis(df):

    df = add_features(df)

    thresholds = get_thresholds(df)

    fvhi_mask = df["Vavg"] > thresholds["VHIGH"]
    fvli_mask = df["Vavg"] < thresholds["VLOW"]

    fchi_mask = df["Iavg"] > thresholds["IHIGH"]
    fcli_mask = df["Iavg"] < thresholds["ILOW"]

    # Map KPI names to the shape expected by the frontend (lowercase keys)
    results = {
        "fvhi_count": int(fvhi_mask.sum()),
        "fvli_count": int(fvli_mask.sum()),

        "fchi_count": int(fchi_mask.sum()),
        "fcli_count": int(fcli_mask.sum()),

        "fvhd_total": calculate_duration(fvhi_mask),
        "fvld_total": calculate_duration(fvli_mask),

        "fchd_total": calculate_duration(fchi_mask),
        "fcld_total": calculate_duration(fcli_mask),

        "avg_voltage": round(df["Vavg"].mean(), 2),
        "avg_current": round(df["Iavg"].mean(), 2),

        "max_voltage": round(df["Vavg"].max(), 2),
        "max_current": round(df["Iavg"].max(), 2),

        "total_records": len(df),
    }

    return results