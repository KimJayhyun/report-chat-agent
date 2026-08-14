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


def build_graph(checkpointer=None):
    """checkpointer를 넘기면(AsyncPostgresSaver 등) 대화가 thread_id별로 저장되어
    멀티턴이 되고, 안 넘기면(None) 매 호출이 독립적인 단발성 그래프가 된다 — 테스트
    등 대화 지속이 필요 없는 곳에서 Postgres 없이도 쓸 수 있게 기본값을 None으로 둠.
    """
    builder = StateGraph(MainState)

    builder.add_node(Node.MAIN, nodes.main)
    builder.add_node(Node.TOOL_ERROR_MESSAGE, nodes.tool_error_message)
    builder.add_node(Node.WRITE_DOCUMENT, document_subgraph())

    builder.add_edge(START, Node.MAIN)
    builder.add_conditional_edges(Node.MAIN, conditional_edges.route_by_tool_calls)

    builder.add_edge(Node.WRITE_DOCUMENT, Node.MAIN)
    builder.add_edge(Node.TOOL_ERROR_MESSAGE, Node.MAIN)

    builder.add_edge(Node.MAIN, END)

    return builder.compile(checkpointer=checkpointer)
