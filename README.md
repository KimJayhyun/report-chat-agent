# report-chat-agent

Chat UI + Python agent(A2A protocol)를 하나의 모노레포로 구성하는 toy project.

## 구조

```
report-chat-agent/
├── pyproject.toml         # uv workspace root ([project] 없음, 코드 없음)
└── apps/
    └── agent/
        ├── pyproject.toml # 실제 파이썬 프로젝트 (a2a-sdk, uvicorn 등 의존성)
        └── src/agent/
            ├── __init__.py    # main() — 서버 진입점
            ├── __main__.py    # `python -m agent` 지원
            ├── agent_card.py  # A2A AgentCard 정의
            ├── executor.py    # 실제 agent 동작 로직 (AgentExecutor)
            └── server.py      # Starlette 앱 조립
```

루트 `pyproject.toml`은 `[tool.uv.workspace] members = ["apps/agent"]`만 가진 "우산" 역할이고, 실제 프로젝트는 `apps/agent`에 있음. 둘은 `.venv`/`uv.lock`을 공유함.

## 실행

```bash
uv run --project apps/agent agent
# 또는
uv run --project apps/agent python -m agent
```

서버는 기본으로 `http://127.0.0.1:9999`에서 뜨고, `AGENT_HOST`/`AGENT_PORT` 환경변수로 바꿀 수 있음.

## 의존성 추가/삭제

루트는 `[project]`가 없어서 대상을 항상 지정해야 함:

```bash
uv add --project apps/agent <package>
```

## 진입점 (`agent:main`)

`apps/agent/pyproject.toml`의 `[project.scripts] agent = "agent:main"`은 `from agent import main; main()`을 실행한다는 뜻. `agent`는 `agent/__init__.py`를 가리키고, 그 안의 `main()`이 agent_card/server를 조립해서 uvicorn을 구동함.
