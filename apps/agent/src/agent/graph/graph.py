from agent.graph import conditional_edges, document, nodes
from agent.graph.config import DocumentNode, Node
from agent.graph.states import DocumentState, MainState
from langchain_core.messages import AIMessageChunk, HumanMessage
from langgraph.graph import END, START, StateGraph


def document_subgraph():
    # 1. 서브 그래프 생성
    builder = StateGraph(DocumentState)

    # 2. 서브 그래프 엮기
    builder.add_node(DocumentNode.MAIN, document.main)

    builder.add_edge(START, DocumentNode.MAIN)
    builder.add_edge(DocumentNode.MAIN, END)

    return builder.compile()


# 3. 그래프 생성
builder = StateGraph(MainState)


# 4. 그래프 엮기
builder.add_node(Node.MAIN, nodes.main)
builder.add_node(Node.TOOL_ERROR_MESSAGE, nodes.tool_error_message)
builder.add_node(Node.CREATE_DOCUMENT, document_subgraph())

builder.add_edge(START, Node.MAIN)
builder.add_conditional_edges(Node.MAIN, conditional_edges.route_by_tool_calls)

builder.add_edge(Node.CREATE_DOCUMENT, Node.MAIN)
builder.add_edge(Node.TOOL_ERROR_MESSAGE, Node.MAIN)

builder.add_edge(Node.MAIN, END)

graph = builder.compile()
