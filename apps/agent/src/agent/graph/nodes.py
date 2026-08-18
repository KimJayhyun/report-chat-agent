from agent.graph.chains import llm_collections
from agent.graph.config import DEFAULT_MODEL, Chain
from agent.graph.mcp_tools import call_mcp_tool, list_mcp_tools, to_openai_tool_schema
from agent.graph.states import MainState, McpToolState, ToolErrorState
from agent.utils import say
from langchain_core.messages import AIMessage, ToolMessage


async def main(state: MainState):
    messages = state.get("messages", [])
    query = state.get("query", "")
    tool_count = state.get("tool_count", 0)
    model = state.get("model") or DEFAULT_MODEL

    # litellm UI/config에 등록된 MCP tool을 매 턴마다 새로 조회 — 방금 등록한
    # 서버도 agent 재시작 없이 바로 다음 메시지부터 쓸 수 있게. 조회 자체가
    # 실패해도(litellm 일시 장애 등) write_document는 계속 동작해야 하니 빈
    # 목록으로 대체하고 넘어간다.
    try:
        mcp_tools = await list_mcp_tools()
    except Exception:
        mcp_tools = []
    mcp_tool_schemas = [to_openai_tool_schema(tool) for tool in mcp_tools]

    chain = llm_collections.get_chain(Chain.MAIN, model, extra_tools=mcp_tool_schemas)

    response: AIMessage = await chain.ainvoke({"messages": messages, "query": query})

    if response.tool_calls:
        tool_calls = response.tool_calls

        return {
            "messages": response,
            "tool_calls": tool_calls,
            "tool_count": tool_count + 1,
            "mcp_tools": mcp_tools,
        }
    else:
        say(response.content)

        return {"messages": response, "tool_calls": [], "mcp_tools": mcp_tools}


async def mcp_tool(state: McpToolState):
    tool_call = state.get("tool_call", {})
    tool_name = tool_call.get("name")

    mcp_tools = state.get("mcp_tools", [])
    matched = next((tool for tool in mcp_tools if tool["name"] == tool_name), None)

    if matched is None:
        # MAIN이 이 tool_call을 만든 시점과 여기서 실행하는 시점 사이에 서버가
        # 삭제됐을 가능성 정도만 남음 — 정상 흐름이면 conditional_edges가 이미
        # mcp_tools 안에 있는 이름만 여기로 보내므로 거의 발생하지 않는다.
        content = f"MCP tool '{tool_name}'을(를) 더 이상 찾을 수 없습니다."
    else:
        content = await call_mcp_tool(
            matched["server_id"], tool_name, tool_call.get("args", {})
        )

    tool_message = ToolMessage(content=content, tool_call_id=tool_call.get("id"))
    return {"messages": tool_message}


async def tool_error_message(state: ToolErrorState):
    return {"messages": state.get("error_message")}
