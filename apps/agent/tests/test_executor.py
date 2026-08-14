import pytest
from a2a.server.context import ServerCallContext
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import Message, Part, Role, SendMessageRequest, TaskState
from agent.agent_card import build_agent_card
from agent.executor import ReportChatAgentExecutor
from agent.graph.graph import build_graph


@pytest.fixture
def handler() -> DefaultRequestHandler:
    """DefaultRequestHandler를 직접 씀 — HTTP 서버 없이 실제 서버가 쓰는 것과
    동일한 요청 처리 경로(RequestContext/EventQueue 생성 포함)를 그대로 재사용.
    """
    agent_card = build_agent_card(url="http://127.0.0.1:9999")
    executor = ReportChatAgentExecutor()
    # checkpointer 없이(None) 그래프를 붙임 — 이 테스트는 단발성 응답만 확인하면
    # 되고, Postgres까지 띄우게 하고 싶지 않아서.
    executor.set_graph(build_graph())
    return DefaultRequestHandler(
        agent_executor=executor,
        task_store=InMemoryTaskStore(),
        agent_card=agent_card,
    )


def _send_message_request(text: str) -> SendMessageRequest:
    message = Message(
        message_id="test-msg-1",
        role=Role.ROLE_USER,
        parts=[Part(text=text)],
    )
    return SendMessageRequest(message=message)


@pytest.mark.integration
@pytest.mark.anyio
async def test_execute_replies_to_a_prompt(handler: DefaultRequestHandler):
    """LM Studio가 로컬에서 모델을 로드한 채 떠 있어야 통과함.

    기본 `pytest` 실행에는 안 걸리게 `integration` 마커를 붙여둠 — 실행하려면
    `pytest -m integration`.
    """
    request = _send_message_request("너는 무슨 역할이야? 한 문장으로만 답해.")

    result = await handler.on_message_send(request, ServerCallContext())

    assert result.status.state == TaskState.TASK_STATE_COMPLETED
    assert result.status.message.parts[0].text
