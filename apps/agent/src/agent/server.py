from contextlib import asynccontextmanager

import httpx
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCard
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from agent.executor import ReportChatAgentExecutor
from agent.graph.graph import build_graph
from agent.properties import LITELLM_BASE_URL, LITELLM_MASTER_KEY, POSTGRES_URL


async def list_models(request: Request) -> JSONResponse:
    """front의 모델 선택 UI가 쓰는 엔드포인트. litellm proxy의 /v1/models를 그대로
    전달만 함 — 어떤 모델이 선택 가능한지는 litellm-config.yaml이 유일한 출처라,
    agent는 여기서 아무 목록도 하드코딩하지 않는다."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{LITELLM_BASE_URL}/v1/models",
            headers={"Authorization": f"Bearer {LITELLM_MASTER_KEY}"},
        )
    return JSONResponse(res.json(), status_code=res.status_code)


def build_app(agent_card: AgentCard) -> Starlette:
    executor = ReportChatAgentExecutor()
    request_handler = DefaultRequestHandler(
        agent_executor=executor,
        task_store=InMemoryTaskStore(),
        agent_card=agent_card,
    )

    @asynccontextmanager
    async def lifespan(app: Starlette):
        # AsyncPostgresSaver 생성 + setup()(테이블 생성, idempotent)이 비동기라서
        # executor 생성 시점이 아니라 서버 기동 시점에 여기서 그래프를 완성해 주입한다.
        async with AsyncPostgresSaver.from_conn_string(POSTGRES_URL) as checkpointer:
            await checkpointer.setup()
            executor.set_graph(build_graph(checkpointer))
            yield

    routes = [
        *create_agent_card_routes(agent_card),
        *create_jsonrpc_routes(request_handler, "/"),
        Route("/models", list_models, methods=["GET"]),
    ]
    # Dev-only: allow the Vite dev server (different origin) to call this API directly.
    middleware = [
        Middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
            allow_methods=["*"],
            allow_headers=["*"],
        )
    ]
    return Starlette(routes=routes, middleware=middleware, lifespan=lifespan)
