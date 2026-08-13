from langchain_core.tools import tool
from pydantic import BaseModel, Field


class WriteDocumentArgs(BaseModel):
    """write_document tool의 파라미터. document/nodes.py 등에서 tool_call['args']를
    파싱할 때도 이 모델을 그대로 재사용한다 — 파라미터가 바뀌면 여기 한 곳만 고치면 됨.

    새 문서 작성과 기존 문서 수정 둘 다 이 하나의 tool로 처리한다 — 수정인지 여부는
    graph state의 document_draft(이전에 작성된 문서가 있는지)로 판단하므로, 이
    파라미터들은 두 경우 모두에 맞게 일반적으로 작성한다.
    """

    instruction: str = Field(
        description=(
            "새로 작성하는 경우 문서의 주제와 목적을, 기존 문서를 수정하는 경우 "
            "무엇을 어떻게 바꿀지를 한두 문장으로 요약."
        )
    )
    key_points: list[str] | None = Field(
        default=None,
        description=(
            "문서에 반드시 들어가야 하는 핵심 내용 목록 (선택). 사용자가 대화에서 "
            "명시적으로 언급한 사실·요구사항만 담고, 언급되지 않은 내용은 지어내지 않는다."
        ),
    )


@tool(args_schema=WriteDocumentArgs)
def write_document(instruction: str, key_points: list[str] | None = None):
    """사용자가 요청한 문서를 markdown 파일로 작성하거나, 이미 작성된 문서가 있으면
    지시에 따라 수정한다.

    Returns:
        생성/수정된 markdown 문서에 대한 결과 메시지.
    """
