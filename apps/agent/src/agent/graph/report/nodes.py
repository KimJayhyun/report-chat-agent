from agent.graph.chains import llm_collections
from agent.graph.config import Chain, ReportFormat
from agent.graph.states import ReportState
from agent.utils import say
from langchain_core.messages import AIMessage

# report 서브그래프 프롬프트(prompts/report.py)의 {format_guide}에 꽂아넣는 텍스트.
# apps/web/scripts/generate-hwp-templates.mjs가 실제로 만드는 템플릿 구조와 맞춤 —
# 여기서 안내하는 섹션 구성이 그 템플릿과 어긋나면 나중에 문서 조립 단계에서 깨짐.
REPORT_FORMAT_GUIDE = {
    ReportFormat.PLANNING_REPORT: (
        '"기획보고서" 서식을 따른다. 아래 4개 섹션을 이 순서로, 각 섹션 제목과 '
        "본문을 포함해서 작성한다.\n\n"
        "1. 개요 — 보고서의 목적과 범위\n"
        "2. 추진 배경 — 관련 현황과 필요성\n"
        "3. 세부 계획 — 추진 일정과 담당 조직\n"
        "4. 기대 효과 — 기대되는 성과"
    ),
    ReportFormat.PRESS_RELEASE: (
        '"보도자료" 서식을 따른다. 아래 구성 순서로 작성한다.\n\n'
        "- 헤드라인 — 핵심 내용을 담은 제목\n"
        "- 핵심 요약 — 한두 문장 요약\n"
        "- 본문 — 세부 내용 (필요하면 목록 활용)\n"
        '- 문의처 — "문의: 담당부서 (연락처)" 형식'
    ),
}

DEFAULT_REPORT_FORMAT_GUIDE = (
    "특정 서식이 지정되지 않았다. 내용에 맞는 자유로운 구성으로, 필요하면 "
    "소제목으로 섹션을 나눠 작성한다."
)


def get_report_format_guide(report_format: ReportFormat | None) -> str:
    if report_format is None:
        return DEFAULT_REPORT_FORMAT_GUIDE
    return REPORT_FORMAT_GUIDE.get(report_format, DEFAULT_REPORT_FORMAT_GUIDE)


async def main(state: ReportState):
    messages = state.get("messages", [])
    report_format = state.get("report_format", None)

    chain = llm_collections.get_chain(Chain.REPORT)

    response: AIMessage = await chain.ainvoke(
        {"messages": messages, "report_format": report_format}
    )

    return {"messages": response}
