from typing import Annotated

from agent.graph.config import DocumentFormat
from langchain_core.messages import AnyMessage, ToolMessage
from langgraph.graph.message import add_messages
from typing_extensions import NotRequired, TypedDict


def keep_value(left, right):
    """새 값이 비어있으면(falsy) 기존 값을 지키고, 아니면 새 값으로 덮어씀.
    한 번 정해지면 그 대화 내내 유지돼야 하는 필드(query, document_format)에 씀."""
    return left or right


def keep_latest_value(left, right):
    """항상 최신(right) 값을 우선하고, 새 값이 비어있을 때만 기존 값을 유지함.
    write_document가 실행될 때마다 갱신돼야 하는 document_draft처럼, 매번
    최신 상태로 덮어써야 하는 필드에 씀 — keep_value랑 우선순위가 반대."""
    return right or left


class BaseState(TypedDict):
    query: Annotated[str, keep_value]
    messages: Annotated[list[AnyMessage], add_messages]

    document_format: Annotated[DocumentFormat | None, keep_value]
    # write_document가 만든 최신 문서 본문. 다음 write_document 호출 때 "기존
    # 문서"로 프롬프트에 들어가서, tool을 다시 안 만들어도 수정 요청을 처리할 수
    # 있게 해줌 (create/edit 두 유스케이스를 이 필드 하나로 구분).
    document_draft: Annotated[str | None, keep_latest_value]


class MainState(BaseState):
    tool_calls: list[dict]  # tool_calls는 항상 존재해야 함
    tool_count: int = 0


class DocumentState(BaseState):
    tool_call: dict


class ToolErrorState(BaseState):
    error_message: ToolMessage
