from services.feature_engineering import add_features
from services.model_manager import load_model, load_scaler

FEATURES = [
    "Iavg",
    "Vavg",
    "active_load",
    "Iimbalance",
    "Vimbalance"
]

model = load_model()
scaler = load_scaler()


def detect_anomalies(df):

    df = add_features(df)

    X = df[FEATURES]

    X = X.dropna()

    X_scaled = scaler.transform(X)

    preds = model.predict(X_scaled)

    X["prediction"] = preds

    anomaly_rows = df.loc[X.index]

    anomaly_rows["prediction"] = preds

    anomalies = anomaly_rows[
        anomaly_rows["prediction"] == -1
    ]

    return anomalies