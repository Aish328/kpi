import pandas as pd
import joblib

from sqlalchemy import text
from services.database import engine

from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest

from services.feature_engineering import add_features


query = """
SELECT ir,
iy,
ib,
vry,
vyb,
vbr,
active_load
 FROM scada_db
    
"""

with engine.connect() as conn:
    df = pd.read_sql(text(query), conn)

# Add engineered features
df = add_features(df)
print(df.head())
FEATURES = [
    "Iavg",
    "Vavg",
    "Active Load",
    "Iimbalance",
    "Vimbalance"
]

X = df[FEATURES]
X.dropna(inplace=True)  # Drop rows with NaN values
# Scale
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Train model
model = IsolationForest(
    contamination=0.03,
    random_state=42
)

model.fit(X_scaled)

# Save
joblib.dump(
    model,
    "models/isolation_forest.pkl"
)

joblib.dump(
    scaler,
    "models/scaler.pkl"
)

print("Isolation Forest model saved.")