from agent.graph.chains import llm_collections
from agent.graph.config import Chain
from agent.graph.states import MainState, ToolErrorState
from agent.utils import say
from langchain_core.messages import AIMessage


async def main(state: MainState):
    messages = state.get("messages", [])
    query = state.get("query", "")
    tool_count = state.get("tool_count", 0)

    chain = llm_collections.get_chain(Chain.MAIN)

    response: AIMessage = await chain.ainvoke({"messages": messages, "query": query})

    if response.tool_calls:
        tool_calls = response.tool_calls

        return {
            "messages": response,
            "tool_calls": tool_calls,
            "tool_count": tool_count + 1,
        }
    else:
        say(response.content)

        return {"messages": response, "tool_calls": []}


async def tool_error_message(state: ToolErrorState):
    return {"messages": state.get("error_message")}
