def get_thresholds(df):

    return {

        "VHIGH":
        df["Vavg"].quantile(.95),

        "VLOW":
        df["Vavg"].quantile(.05),

        "IHIGH":
        df["Iavg"].quantile(.95),

        "ILOW":
        df["Iavg"].quantile(.05)
    }