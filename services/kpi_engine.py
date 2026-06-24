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

    results = {

        "FVHI": int(fvhi_mask.sum()),
        "FVLI": int(fvli_mask.sum()),

        "FCHI": int(fchi_mask.sum()),
        "FCLI": int(fcli_mask.sum()),

        "FVHD": calculate_duration(fvhi_mask),
        "FVLD": calculate_duration(fvli_mask),

        "FCHD": calculate_duration(fchi_mask),
        "FCLD": calculate_duration(fcli_mask),

        "FVSM": round(df["Vavg"].mean(),2),
        "FCSM": round(df["Iavg"].mean(),2),

        "avg_feeder_voltage":
        round(df["Vavg"].mean(),2),

        "avg_feeder_current":
        round(df["Iavg"].mean(),2),

        "max_voltage":
        round(df["Vavg"].max(),2),

        "max_current":
        round(df["Iavg"].max(),2),

        "total_records":
        len(df)
    }

    return results