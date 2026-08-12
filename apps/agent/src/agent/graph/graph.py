from agent.graph import nodes
from agent.graph.config import Node
from agent.graph.states import BaseState
from langchain_core.messages import AIMessageChunk, HumanMessage
from langgraph.graph import END, START, StateGraph

# 3. 그래프 생성
builder = StateGraph(BaseState)


# 4. 그래프 엮기
builder.add_node(Node.MAIN, nodes.main)

builder.add_edge(START, Node.MAIN)
builder.add_edge(Node.MAIN, END)


graph = builder.compile()
