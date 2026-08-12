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
from agent.graph.graph import graph
from agent.graph.states import BaseState
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage


class ReportChatAgentExecutor(AgentExecutor):
    """Placeholder executor: echoes the user's message back.

    Replace the body of `execute` with the agent's real behavior.
    """

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task = context.current_task
        if task is None:
            task = new_task_from_user_message(context.message)
            await event_queue.enqueue_event(task)

        task_updater = TaskUpdater(
            event_queue=event_queue, task_id=task.id, context_id=task.context_id
        )

        query = get_message_text(context.message)

        state = BaseState(query=query, messages=[HumanMessage(content=query)])

        result = ""
        async for event in graph.astream(
            state,
            stream_mode=["messages", "values", "custom"],
            config={},
        ):
            kind, data = event

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
                result += content
                await task_updater.update_status(
                    state=TaskState.TASK_STATE_WORKING,
                    message=new_text_message(content),
                )

        await task_updater.update_status(
            state=TaskState.TASK_STATE_COMPLETED,
            message=new_text_message(result),
        )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError("Cancel is not supported.")
