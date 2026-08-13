from langchain_core.tools import tool


@tool()
def create_report(topic: str, key_points: list[str] | None = None) -> str:
    """사용자가 요청한 보고서를 한글(HWP) 문서로 작성한다.

    Args:
        topic: 보고서의 주제와 목적을 한두 문장으로 요약.
        key_points: 보고서에 반드시 들어가야 하는 핵심 내용 목록 (선택).
            사용자가 대화에서 명시적으로 언급한 사실·요구사항만 담고, 언급되지
            않은 내용은 지어내지 않는다.

    Returns:
        생성된 한글(HWP) 문서에 대한 결과 메시지.
    """
