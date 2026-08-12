import pytest
from agent.graph.chains import LLMCollections
from agent.graph.config import Chain
from langchain_core.messages import HumanMessage
from langchain_core.runnables import Runnable


def test_set_chains_registers_the_main_chain():
    chains = LLMCollections()
    chain = chains.get_chain(Chain.MAIN)

    assert isinstance(chain, Runnable)


def test_get_chain_raises_for_unknown_name():
    chains = LLMCollections()

    with pytest.raises(ValueError):
        chains.get_chain("no-such-chain")


@pytest.mark.integration
@pytest.mark.anyio
async def test_main_chain_replies_to_a_prompt():
    """LM Studio가 로컬에서 해당 모델을 로드한 채 떠 있어야 통과함.

    기본 `pytest` 실행에는 안 걸리게 `integration` 마커를 붙여둠 — 실행하려면
    `pytest -m integration`.
    """
    chains = LLMCollections()
    chain = chains.get_chain(Chain.MAIN)

    response = await chain.ainvoke({"messages": [HumanMessage(content="Reply with exactly one word: pong")]})

    assert response.content
