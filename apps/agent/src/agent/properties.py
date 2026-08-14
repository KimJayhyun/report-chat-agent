import os

LM_STUDIO_BASE_URL = os.environ.get("LM_STUDIO_BASE_URL", "http://localhost:1234/v1")

# docker-compose.yaml의 postgres 서비스 계정과 맞춤.
POSTGRES_URL = os.environ.get(
    "POSTGRES_URL", "postgresql://agent:agent@localhost:5432/agent"
)
