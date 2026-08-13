from agent.graph import conditional_edges, nodes, report
from agent.graph.config import Node, ReportNode
from agent.graph.states import MainState, ReportState
from langchain_core.messages import AIMessageChunk, HumanMessage
from langgraph.graph import END, START, StateGraph


def report_subgraph():
    # 1. 서브 그래프 생성
    builder = StateGraph(ReportState)

    # 2. 서브 그래프 엮기
    builder.add_node(ReportNode.MAIN, report.main)

    builder.add_edge(START, ReportNode.MAIN)
    builder.add_edge(ReportNode.MAIN, END)

    return builder.compile()


# 3. 그래프 생성
builder = StateGraph(MainState)


# 4. 그래프 엮기
builder.add_node(Node.MAIN, nodes.main)
builder.add_node(Node.TOOL_ERROR_MESSAGE, nodes.tool_error_message)
builder.add_node(Node.CREATE_REPORT, report_subgraph())

builder.add_edge(START, Node.MAIN)
builder.add_conditional_edges(Node.MAIN, conditional_edges.route_by_tool_calls)

builder.add_edge(Node.TOOL_ERROR_MESSAGE, Node.MAIN)

builder.add_edge(Node.MAIN, END)

graph = builder.compile()
