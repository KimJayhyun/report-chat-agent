import uuid

import pytest
from agent.graph.graph import build_graph
from agent.properties import POSTGRES_URL
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver


@pytest.mark.integration
@pytest.mark.anyio
async def test_graph_persists_state_to_postgres_across_connections():
    """`docker compose up`으로 postgres가 떠 있어야 통과함 (LM Studio는 필요 없음).

    build_graph(checkpointer)로 만든 실제 그래프 인스턴스가 Postgres에 상태를 쓰고,
    완전히 새로운 커넥션(=서버 재시작/다른 요청이라고 가정)으로 만든 별개의 그래프
    인스턴스가 같은 thread_id로 그 상태를 읽어오는지 확인한다. aupdate_state로
    LLM 호출 없이 상태만 주입하므로 노드를 실제로 실행하지 않는다 — 여기서 보려는
    건 "그래프가 DB에 실제로 연결돼서 저장/조회하느냐"이지 그래프 로직 자체가 아님.

    기본 pytest 실행에는 안 걸리게 integration 마커 — 실행하려면 `pytest -m integration`.
    """
    thread_id = f"test-{uuid.uuid4()}"
    config = {"configurable": {"thread_id": thread_id}}

    async with AsyncPostgresSaver.from_conn_string(POSTGRES_URL) as checkpointer_a:
        await checkpointer_a.setup()
        graph_a = build_graph(checkpointer_a)
        await graph_a.aupdate_state(config, {"document_draft": "draft-v1"})
    # 여기서 커넥션이 완전히 닫힘 — 아래는 별개의 새 커넥션/그래프 인스턴스.

    async with AsyncPostgresSaver.from_conn_string(POSTGRES_URL) as checkpointer_b:
        graph_b = build_graph(checkpointer_b)
        snapshot = await graph_b.aget_state(config)

    assert snapshot.values.get("document_draft") == "draft-v1"
