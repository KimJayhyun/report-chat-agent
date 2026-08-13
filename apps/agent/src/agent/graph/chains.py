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
            [tools.create_document], tool_choice="auto"
        )
        self._chains[Chain.CREATE_DOCUMENT] = (
            prompt_templates.create_document | gemma4_llm
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
