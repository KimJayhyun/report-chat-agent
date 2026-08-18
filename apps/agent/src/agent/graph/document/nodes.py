from agent.graph.chains import llm_collections
from agent.graph.config import DEFAULT_MODEL, Chain, DocumentFormat, Tag
from agent.graph.states import DocumentState
from agent.graph.tools import WriteDocumentArgs
from agent.utils import say
from langchain_core.messages import AIMessage, ToolMessage

# document 서브그래프 프롬프트(prompts/write_document.py)의 {format_guide}에
# 꽂아넣는 텍스트. apps/web/scripts/generate-hwp-templates.mjs가 실제로 만드는
# 템플릿 구조와 맞춤 — 여기서 안내하는 섹션 구성이 그 템플릿과 어긋나면 나중에
# 문서 조립 단계에서 깨짐.
DOCUMENT_FORMAT_GUIDE = {
    DocumentFormat.PLANNING_REPORT: (
        '"기획보고서" 서식을 따른다. 아래 4개 섹션을 이 순서로, 각 섹션 제목과 '
        "본문을 포함해서 작성한다.\n\n"
        "1. 개요 — 보고서의 목적과 범위\n"
        "2. 추진 배경 — 관련 현황과 필요성\n"
        "3. 세부 계획 — 추진 일정과 담당 조직\n"
        "4. 기대 효과 — 기대되는 성과"
    ),
    DocumentFormat.PRESS_RELEASE: (
        '"보도자료" 서식을 따른다. 아래 구성 순서로 작성한다.\n\n'
        "- 헤드라인 — 핵심 내용을 담은 제목\n"
        "- 핵심 요약 — 한두 문장 요약\n"
        "- 본문 — 세부 내용 (필요하면 목록 활용)\n"
        '- 문의처 — "문의: 담당부서 (연락처)" 형식'
    ),
}

DEFAULT_DOCUMENT_FORMAT_GUIDE = (
    "특정 서식이 지정되지 않았다. 내용에 맞는 자유로운 구성으로, 필요하면 "
    "소제목으로 섹션을 나눠 작성한다."
)


def get_document_format_guide(document_format: DocumentFormat | None) -> str:
    if document_format is None:
        return DEFAULT_DOCUMENT_FORMAT_GUIDE
    return DOCUMENT_FORMAT_GUIDE.get(document_format, DEFAULT_DOCUMENT_FORMAT_GUIDE)


# create/edit 두 유스케이스를 tool 하나로 처리하기 위한 분기 텍스트. document_draft가
# 있으면(=예전에 write_document를 이미 돌린 적 있으면) "기존 문서" 섹션을 프롬프트에
# 끼워 넣어서 이번 호출을 "수정"으로 유도하고, 없으면 빈 문자열이라 프롬프트가
# 지금처럼 "새로 작성"으로만 읽힘.
def get_existing_document_section(document_draft: str | None) -> str:
    if not document_draft:
        return ""
    return (
        "## 0. 기존 문서 (수정 대상)\n\n"
        '아래는 현재까지 작성된 문서입니다. "지시"에 따라 이 문서를 수정하세요. '
        "지시와 무관한 내용은 원문 그대로 유지합니다.\n\n"
        f"{document_draft}\n\n"
        "---\n\n"
    )


async def main(state: DocumentState):
    say("write document nodes")
    messages = state.get("messages", [])
    document_format = state.get("document_format", None)
    document_draft = state.get("document_draft", None)

    tool_call = state.get("tool_call", {})
    args = WriteDocumentArgs(**tool_call.get("args", {}))
    model = state.get("model") or DEFAULT_MODEL

    key_points_text = (
        "\n".join(f"- {point}" for point in args.key_points)
        if args.key_points
        else "(제공된 핵심 내용 없음)"
    )

    chain = llm_collections.get_chain(Chain.WRITE_DOCUMENT, model)

    response: AIMessage = await chain.ainvoke(
        {
            "messages": messages,
            "format_guide": get_document_format_guide(document_format),
            "existing_document_section": get_existing_document_section(document_draft),
            "instruction": args.instruction,
            "key_points": key_points_text,
        },
        config={"tags": [Tag.WRITE_DOCUMENT]},
    )

    tool_message = ToolMessage(
        content=response.content, tool_call_id=tool_call.get("id")
    )

    return {"messages": tool_message, "document_draft": response.content}
