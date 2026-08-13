import httpx
from agent.graph import prompt_templates, tools
from agent.graph.config import Chain, Model
from agent.properties import LM_STUDIO_BASE_URL
from langchain_openai import ChatOpenAI


class LLMCollections:
    def __init__(self):
        self._chains = {}

        llm_dict = _llm_factory(api_key="lm-studio")
        self.set_chains(llm_dict)

    def get_chain(self, name: str):
        if name not in self._chains:
            raise ValueError(f"Chain '{name}' not found")

        return self._chains.get(name)

    def set_chains(self, llm_dict):
        gemma4_llm = llm_dict.get(Model.GEMMA4_27B)

        self._chains[Chain.MAIN] = prompt_templates.main | gemma4_llm.bind_tools(
            [tools.write_document], tool_choice="auto"
        )
        # tags=[Chain.WRITE_DOCUMENT]를 붙여두면, graph.astream(stream_mode="messages")로
        # 나오는 청크의 metadata["tags"]에 이 값이 실려서 executor.py가 "이 청크는
        # 문서 작성 체인에서 나온 거다"를 구분할 수 있음 (기존 no_stream 태그랑 같은 방식).
        self._chains[Chain.WRITE_DOCUMENT] = (
            prompt_templates.write_document | gemma4_llm
        )


def _llm_factory(api_key: str):
    httpx_client = httpx.Client(verify=False)
    httpx_async_client = httpx.AsyncClient(verify=False)

    gemma4_llm = ChatOpenAI(
        base_url=LM_STUDIO_BASE_URL,
        model=Model.GEMMA4_27B,
        streaming=True,
        api_key=api_key,
        max_tokens=8192,
        http_client=httpx_client,
        http_async_client=httpx_async_client,
    )

    return {
        Model.GEMMA4_27B: gemma4_llm,
    }


llm_collections = LLMCollections()
