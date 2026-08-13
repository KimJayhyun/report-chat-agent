from enum import Enum

MAX_RETRY_TOOL_CALLS = 5


class Node(str, Enum):
    MAIN = "main"
    TOOL_ERROR_MESSAGE = "tool_error_message"

    CREATE_REPORT = "create_report"


class ReportNode(str, Enum):
    MAIN = "main"


class Model(str, Enum):
    GEMMA4_27B = "gemma4-27b-a4b-it"


class Chain(str, Enum):
    MAIN = "main"


class ReportFormat(str, Enum):
    """apps/web/src/lib/docFormats.tsx의 DOC_FORMATS id와 값을 맞춤."""

    PLANNING_REPORT = "planning-report"
    PRESS_RELEASE = "press-release"


class ToolError(str, Enum):
    MISSING = "missing"
    MAX_RETRY_EXCEEDED = "max_retry_exceeded"


TOOL_ERROR_MESSAGE = {
    ToolError.MISSING: (
        "{tool_name}은(는) 존재하지 않는 도구입니다. 도구 이름을 확인해주세요."
        "**다음 단계에 따라 응답하십시오:**:"
        "1. 제공된 Tool 중 대체 가능한 Tool이 있는지 확인한다."
        "2. 대체 가능한 Tool이 있다면, 해당 Tool을 사용하여 응답한다."
        "3. 대체 가능한 Tool이 없다면, 보유 지식으로 답한다."
    ),
    ToolError.MAX_RETRY_EXCEEDED: (
        "허용된 최대 재시도 횟수 5 회를 초과했습니다."
        "더 이상의 Tool 호출은 불가능합니다. 보유 지식으로 답하십시오."
    ),
}
