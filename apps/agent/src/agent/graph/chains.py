import httpx
from agent.graph import prompt_templates, tools
from agent.graph.config import Chain, DEFAULT_MODEL
from agent.properties import LITELLM_BASE_URL, LITELLM_MASTER_KEY
from langchain_openai import ChatOpenAI


class LLMCollections:
    """모델별 세부 설정(api_base, extra_body, stop 토큰 등)은 전부 litellm-config.yaml
    쪽 책임이라, 여기서 아는 건 "litellm proxy가 이 model 이름을 안다" 뿐이다 — 그래서
    모델을 미리 정해진 목록으로 두지 않고, 요청 시점에 받은 model 문자열로 그때그때
    ChatOpenAI를 만든다(모델당 한 번만 만들어서 재사용).
    """

    def __init__(self):
        self._llm_cache: dict[str, ChatOpenAI] = {}

    def _get_llm(self, model: str) -> ChatOpenAI:
        if model not in self._llm_cache:
            self._llm_cache[model] = _build_llm(model)
        return self._llm_cache[model]

    def get_chain(self, name: str, model: str = DEFAULT_MODEL, extra_tools: list[dict] | None = None):
        llm = self._get_llm(model)

        if name == Chain.MAIN:
            # extra_tools(MCP tool의 OpenAI function-calling 스키마)는 매 요청마다
            # litellm에서 새로 조회한 걸 그대로 받는다 — write_document처럼 캐싱하지
            # 않음, 그래야 UI에서 방금 등록한 MCP 서버도 다음 턴부터 바로 보임.
            return prompt_templates.main | llm.bind_tools(
                [tools.write_document, *(extra_tools or [])], tool_choice="auto"
            )
        if name == Chain.WRITE_DOCUMENT:
            return prompt_templates.write_document | llm

        raise ValueError(f"Chain '{name}' not found")


def _build_llm(model: str) -> ChatOpenAI:
    httpx_client = httpx.Client(verify=False)
    httpx_async_client = httpx.AsyncClient(verify=False)

    return ChatOpenAI(
        base_url=LITELLM_BASE_URL,
        model=model,
        streaming=True,
        api_key=LITELLM_MASTER_KEY,
        max_tokens=8192,
        http_client=httpx_client,
        http_async_client=httpx_async_client,
    )


llm_collections = LLMCollections()
