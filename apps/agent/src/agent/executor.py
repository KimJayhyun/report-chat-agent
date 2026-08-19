from typing import cast

from a2a.helpers import (
    get_message_text,
    new_task_from_user_message,
    new_text_message,
    new_text_part,
)
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import TaskState
from agent.graph.config import DEFAULT_MODEL, Chain, Tag
from agent.graph.states import BaseState
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage


class ReportChatAgentExecutor(AgentExecutor):
    """Placeholder executor: echoes the user's message back.

    Replace the body of `execute` with the agent's real behavior.
    """

    def __init__(self) -> None:
        # 서버 기동 시점(lifespan)에 Postgres checkpointer까지 물려서 build_graph()로
        # 만들어진 뒤 set_graph()로 주입됨 — AsyncPostgresSaver 생성 자체가 비동기라
        # 이 생성자(동기)에서 바로 그래프를 만들 수 없어서 이렇게 나눔.
        self._graph = None

    def set_graph(self, graph) -> None:
        self._graph = graph

    @property
    def graph(self):
        return self._graph

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        if self._graph is None:
            raise RuntimeError("Graph is not initialized — set_graph()을 먼저 호출하세요.")

        task = context.current_task
        if task is None:
            task = new_task_from_user_message(context.message)
            await event_queue.enqueue_event(task)

        task_updater = TaskUpdater(
            event_queue=event_queue, task_id=task.id, context_id=task.context_id
        )

        query = get_message_text(context.message)

        # message.metadata는 google.protobuf.Struct라 .get()이 없어서 in으로 확인.
        incoming_metadata = context.message.metadata
        model = (
            incoming_metadata["model"]
            if incoming_metadata and "model" in incoming_metadata
            else DEFAULT_MODEL
        )

        state = BaseState(
            query=query, messages=[HumanMessage(content=query)], model=model
        )

        result = ""
        async for event in self._graph.astream(
            state,
            stream_mode=["messages", "values", "custom"],
            subgraphs=True,
            # thread_id로 A2A의 context_id를 그대로 씀 — 같은 대화(context_id)면
            # checkpointer가 이전 turn의 상태(messages, document_draft 등)를 이어붙여줘서
            # 멀티턴이 됨.
            config={"configurable": {"thread_id": task.context_id}},
        ):
            _namespace, kind, data = event

            if kind == "messages":
                chunk, metadata = data
                # no_stream 태그 확인
                if metadata.get("tags") and "no_stream" in metadata["tags"]:
                    """
                    {
                        'langgraph_step': 1,
                        'langgraph_node': 'plan',
                        'langgraph_triggers': ('branch:to:plan',),
                        'langgraph_path': ('__pregel_pull', 'plan'),
                        'langgraph_checkpoint_ns': 'plan:b4ca772a-97f5-ad89-2328-6b0bd49fa44a',
                        'checkpoint_ns': 'plan:b4ca772a-97f5-ad89-2328-6b0bd49fa44a',
                        'ls_provider': 'naver',
                        'ls_model_name': 'HCX-007',
                        'ls_model_type': 'chat',
                        'ls_temperature': None,
                        'ls_max_tokens': 2048,
                        'tags': ['no_stream']
                    }
                    """
                    continue
                elif (
                    chunk.response_metadata.get("tags")
                    and "no_stream" in chunk.response_metadata["tags"]
                ):
                    continue

                # 메시지 타입 확인
                if not (
                    isinstance(chunk, AIMessageChunk) or isinstance(chunk, AIMessage)
                ):
                    print("Unexpected chunk type:", type(chunk))
                    if isinstance(chunk, ToolMessage):
                        cast(ToolMessage, chunk)
                    continue

                # if "finish_reason" in chunk.response_metadata:
                #     is_last_chunk = True

                content = chunk.content

                tags = metadata.get("tags") or chunk.response_metadata.get("tags") or []
                message = new_text_message(content)

                if Tag.WRITE_DOCUMENT in tags:
                    # front가 이 tag로 "문서 작성 중" 청크를 구분해서 별도 탭에 렌더링함.
                    # 채팅 말풍선에 다시 노출되면 안 되니 result엔 안 더함.
                    message.metadata["tag"] = Tag.WRITE_DOCUMENT.value
                else:
                    result += content

                await task_updater.update_status(
                    state=TaskState.TASK_STATE_WORKING,
                    message=message,
                )

        await task_updater.update_status(
            state=TaskState.TASK_STATE_COMPLETED,
            message=new_text_message(result),
        )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError("Cancel is not supported.")
