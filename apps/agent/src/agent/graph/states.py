from typing import Annotated

from agent.graph.config import DocumentFormat
from langchain_core.messages import AnyMessage, ToolMessage
from langgraph.graph.message import add_messages
from typing_extensions import NotRequired, TypedDict


def keep_value(left, right):
    return left or right


class BaseState(TypedDict):
    query: Annotated[str, keep_value]
    messages: Annotated[list[AnyMessage], add_messages]

    document_format: Annotated[DocumentFormat | None, keep_value]


class MainState(BaseState):
    tool_calls: list[dict]  # tool_calls는 항상 존재해야 함
    tool_count: int = 0


class DocumentState(BaseState):
    tool_call: dict


class ToolErrorState(BaseState):
    error_message: ToolMessage
