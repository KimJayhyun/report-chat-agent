import psycopg
from agent.properties import POSTGRES_URL
from langchain_core.messages import AIMessage, HumanMessage

TITLE_MAX_LEN = 60


async def list_sessions() -> list[dict]:
    """체크포인트 테이블에서 대화(thread_id)별 최신 상태 한 줄씩만 뽑아 세션 목록을
    만든다. LangGraph의 checkpointer API에는 "모든 thread 나열"이 없어서 checkpoints
    테이블을 직접 읽는다 — checkpointer 전용 커넥션(단일 커넥션이라 진행 중인 대화의
    읽기/쓰기와 동시에 쓰면 위험)은 안 건드리고, 이 조회만을 위한 별도 커넥션을
    그때그때 열고 닫는다.

    thread_id별로 query 채널(첫 turn의 사용자 질문, keep_value 리듀서라 대화 내내
    안 바뀜)을 제목으로 쓴다 — 별도 제목 필드가 없어서 이게 제일 자연스러운 대체.
    """
    async with await psycopg.AsyncConnection.connect(POSTGRES_URL) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT DISTINCT ON (thread_id)
                    thread_id,
                    checkpoint->>'ts' AS updated_at,
                    checkpoint->'channel_values'->>'query' AS title
                FROM checkpoints
                WHERE checkpoint_ns = ''
                ORDER BY thread_id, checkpoint_id DESC
                """
            )
            rows = await cur.fetchall()

    sessions = [
        {
            "context_id": thread_id,
            "title": _truncate(title) if title else "(제목 없음)",
            "updated_at": updated_at,
        }
        for thread_id, updated_at, title in rows
    ]
    sessions.sort(key=lambda s: s["updated_at"] or "", reverse=True)
    return sessions


def _truncate(text: str) -> str:
    return text if len(text) <= TITLE_MAX_LEN else text[:TITLE_MAX_LEN] + "…"


async def get_session(graph, context_id: str) -> dict:
    """세션을 다시 열 때 프론트가 채팅창/문서초안을 복원할 수 있게 필요한 것만 추린다.
    messages 필터링은 executor.py가 실시간 스트리밍에서 채팅 말풍선에 올리는 것과
    맞춤 — HumanMessage/내용 있는 AIMessage만 남기고, ToolMessage나 tool_call만
    있고 내용은 없는 AIMessage는 뺀다."""
    config = {"configurable": {"thread_id": context_id}}
    snapshot = await graph.aget_state(config)

    messages = []
    for message in snapshot.values.get("messages", []):
        if isinstance(message, HumanMessage) and message.content:
            messages.append({"role": "user", "text": message.content})
        elif isinstance(message, AIMessage) and message.content:
            messages.append({"role": "agent", "text": message.content})

    return {
        "context_id": context_id,
        "messages": messages,
        "document_draft": snapshot.values.get("document_draft"),
    }
