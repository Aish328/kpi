import numpy as np

def add_features(df):

    df["Iavg"] = (
        df["ir"].astype(float) +
        df["iy"].astype(float) +
        df["ib"].astype(float)                  
    ) / 3

    df["Vavg"] = (
        df["vry"].astype(float) +
        df["vyb"].astype(float) +
        df["vbr"].astype(float)
    ) / 3

    df["Iimbalance"] = (
        np.maximum.reduce([
            abs(df["ir"].astype(float) - df["Iavg"]),
            abs(df["iy"].astype(float) - df["Iavg"]),
            abs(df["ib"].astype(float) - df["Iavg"])
        ])
        / df["Iavg"]
        * 100
    )
    df["Active Load"] = df["active_load"].astype(float)

    df["Vimbalance"] = (
        np.maximum.reduce([
            abs(df["vry"].astype(float) - df["Vavg"]),
            abs(df["vyb"].astype(float) - df["Vavg"]),
            abs(df["vbr"].astype(float) - df["Vavg"])
        ])
        / df["Vavg"]
        * 100
    )

    return df