import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
DATA = Path(os.getenv("INCEPTION_DATA_DIR", str(ROOT / "data")))
DATA.mkdir(parents=True, exist_ok=True)


class OperationalPolicy(BaseModel):
    version: str = "2.0"
    horizon: int = Field(default=28, ge=7, le=28)
    context: int = Field(default=180, ge=28)
    donor_buffer_days: int = Field(default=1, ge=0)
    residual_life_days: int = Field(default=2, ge=1)
    planning_days: int = Field(default=28, ge=7, le=28)
    shortage_probability_limit: float = Field(default=0.05, ge=0, le=1)
    expected_unmet_pack_limit: float = Field(default=0.5, ge=0)
    monte_carlo_samples: int = Field(default=1000, ge=100)
    cusum_allowance: float = Field(default=0.5, gt=0)
    cusum_threshold: float = Field(default=4, gt=0)
    anomaly_score: float = Field(default=3, gt=0)
    anomaly_ratio: float = Field(default=2, gt=1)
    anomaly_absolute: int = Field(default=5, ge=1)
    cluster_km: float = Field(default=10, gt=0)
    zone_buffer_km: float = Field(default=2, gt=0)
    report_hours: int = Field(default=72, ge=1)
    max_rounds: int = Field(default=3, ge=1, le=10)


POLICY = OperationalPolicy().model_dump()
