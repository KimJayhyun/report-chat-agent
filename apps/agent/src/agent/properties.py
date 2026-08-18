import os

# docker-compose.yaml의 litellm 서비스를 가리킴. 실제 모델(LM Studio, 나중에 다른
# provider)은 litellm-config.yaml에서 바뀌므로, agent 코드는 이 프록시 하나만 보면 됨.
LITELLM_BASE_URL = os.environ.get("LITELLM_BASE_URL", "http://localhost:4000")
LITELLM_MASTER_KEY = os.environ.get("LITELLM_MASTER_KEY", "sk-litellm-dev")

# docker-compose.yaml의 postgres 서비스 계정과 맞춤.
POSTGRES_URL = os.environ.get(
    "POSTGRES_URL", "postgresql://agent:agent@localhost:5432/agent"
)
