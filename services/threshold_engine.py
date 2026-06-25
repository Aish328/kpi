def get_thresholds(df):
    voltage_cols = [c for c in ["vry", "vyb", "vbr"] if c in df.columns]
    current_cols = [c for c in ["ir", "iy", "ib"] if c in df.columns]

    if "Vavg" in df.columns:
        vavg = df["Vavg"]
    elif voltage_cols:
        vavg = df[voltage_cols].mean(axis=1)
    else:
        raise KeyError("No voltage columns available for threshold calculation")

    if "Iavg" in df.columns:
        iavg = df["Iavg"]
    elif current_cols:
        iavg = df[current_cols].mean(axis=1)
    else:
        raise KeyError("No current columns available for threshold calculation")

    return {

        "VHIGH":
        vavg.quantile(.98),

        "VLOW":
        vavg.quantile(.10),

        "IHIGH":
        iavg.quantile(.95),

        "ILOW":
        iavg.quantile(.10)
    }