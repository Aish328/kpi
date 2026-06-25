from fastapi import APIRouter
from typing import Optional

from services.data_loader import DataLoader

router = APIRouter()


@router.get("/")
def get_kpis(
    substation: Optional[str] = None,
    feeder: Optional[str] = None,
    limit: int = 96,
):
    df = DataLoader.get_all_data()
    df = DataLoader.filter_data(df, substation=substation, feeder=feeder)
    df = df.sort_values("datetime").tail(limit)
    if df.empty:
        return {
            "fvhi_count": 0,
            "fvli_count": 0,
            "fchi_count": 0,
            "fcli_count": 0,
            "fvhd_total": 0,
            "fvld_total": 0,
            "fchd_total": 0,
            "fcld_total": 0,
            "avg_voltage": 0,
            "avg_current": 0,
            "max_voltage": 0,
            "max_current": 0,
            "total_records": 0,
        }

    return {
        "fvhi_count": DataLoader.count_runs(df["fvhi"]) if "fvhi" in df.columns else 0,
        "fvli_count": DataLoader.count_runs(df["fvli"]) if "fvli" in df.columns else 0,
        "fchi_count": DataLoader.count_runs(df["fchi"]) if "fchi" in df.columns else 0,
        "fcli_count": DataLoader.count_runs(df["fcli"]) if "fcli" in df.columns else 0,
        "fvhd_total": int(df["fvhd"].sum()) if "fvhd" in df.columns else 0,
        "fvld_total": int(df["fvld"].sum()) if "fvld" in df.columns else 0,
        "fchd_total": int(df["fchd"].sum()) if "fchd" in df.columns else 0,
        "fcld_total": int(df["fcld"].sum()) if "fcld" in df.columns else 0,
        "avg_voltage": round(float(df["fvsm"].mean()), 2) if "fvsm" in df.columns else 0,
        "avg_current": round(float(df["fcsm"].mean()), 2) if "fcsm" in df.columns else 0,
        "max_voltage": round(float(df["fvsm"].max()), 2) if "fvsm" in df.columns else 0,
        "max_current": round(float(df["fcsm"].max()), 2) if "fcsm" in df.columns else 0,
        "total_records": len(df),
    }
