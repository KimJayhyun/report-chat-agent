from agent.graph.chains import llm_collections
from agent.graph.config import Chain
from agent.graph.states import BaseState


async def main(state: BaseState):
    messages = state.get("messages", [])
    query = state.get("query", "")

    chain = llm_collections.get_chain(Chain.MAIN)

    response = await chain.ainvoke({"messages": messages, "query": query})

    return {"messages": response}
