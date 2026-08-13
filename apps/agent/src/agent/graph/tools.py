from langchain_core.tools import tool
from pydantic import BaseModel, Field


class CreateDocumentArgs(BaseModel):
    """create_document tool의 파라미터. document/nodes.py 등에서 tool_call['args']를
    파싱할 때도 이 모델을 그대로 재사용한다 — 파라미터가 바뀌면 여기 한 곳만 고치면 됨.
    """

    topic: str = Field(description="문서의 주제와 목적을 한두 문장으로 요약.")
    key_points: list[str] | None = Field(
        default=None,
        description=(
            "문서에 반드시 들어가야 하는 핵심 내용 목록 (선택). 사용자가 대화에서 "
            "명시적으로 언급한 사실·요구사항만 담고, 언급되지 않은 내용은 지어내지 않는다."
        ),
    )


@tool(args_schema=CreateDocumentArgs)
def create_document(topic: str, key_points: list[str] | None = None):
    """사용자가 요청한 문서를 markdown 파일로 작성한다.

    Returns:
        생성된 markdown 문서에 대한 결과 메시지.
    """
