from agent.graph import tools
from agent.graph.config import MAX_RETRY_TOOL_CALLS, TOOL_ERROR_MESSAGE, Node, ToolError
from agent.graph.states import MainState
from langchain_core.messages import ToolMessage
from langgraph.constants import END
from langgraph.types import Send


def route_by_tool_calls(state: MainState):
    tool_calls = state.get("tool_calls", [])

    if not tool_calls:
        return END

    tool_count = state.get("tool_count", 0)
    mcp_tool_names = {tool["name"] for tool in state.get("mcp_tools", [])}

    next_nodes = []
    if tool_count < MAX_RETRY_TOOL_CALLS:
        # tool_calls = [
        #     {
        #         "id": "test",
        #         "name": "test_tool",
        #         "args": {
        #             "topic": "test_topic",
        #             "key_points": ["test_point1", "test_point2"],
        #         },
        #     }
        # ]
        for tool_call in tool_calls:
            tool_name = tool_call.get("name")
            rest_of_state = {
                k: v for k, v in state.items() if k not in ["tool_calls", "tool_count"]
            }

            if tool_name == tools.write_document.get_name():
                next_nodes.append(
                    Send(Node.WRITE_DOCUMENT, {"tool_call": tool_call} | rest_of_state)
                )
            elif tool_name in mcp_tool_names:
                next_nodes.append(
                    Send(Node.MCP_TOOL, {"tool_call": tool_call} | rest_of_state)
                )
            else:
                next_nodes.append(
                    Send(
                        Node.TOOL_ERROR_MESSAGE,
                        {
                            "error_message": ToolMessage(
                                content=TOOL_ERROR_MESSAGE[ToolError.MISSING].format(
                                    tool_name=tool_name
                                ),
                                tool_call_id=tool_call.get("id"),
                            )
                        },
                    )
                )

    else:
        for tool_call in tool_calls:
            next_nodes.append(
                Send(
                    Node.TOOL_ERROR_MESSAGE,
                    {
                        "error_message": ToolMessage(
                            content=TOOL_ERROR_MESSAGE[ToolError.MAX_RETRY_EXCEEDED],
                            tool_call_id=tool_call.get("id"),
                        )
                    },
                )
            )

    return next_nodes
