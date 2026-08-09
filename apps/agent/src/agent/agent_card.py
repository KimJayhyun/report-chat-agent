from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill


def build_agent_card(url: str) -> AgentCard:
    echo_skill = AgentSkill(
        id="echo",
        name="Echo",
        description="Echoes back whatever message it receives.",
        input_modes=["text/plain"],
        output_modes=["text/plain"],
        tags=["demo"],
        examples=["hi"],
    )

    return AgentCard(
        name="Report Chat Agent",
        description="Toy A2A agent for the report-chat-agent project.",
        version="0.0.1",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        supported_interfaces=[
            AgentInterface(
                protocol_binding="JSONRPC",
                url=url,
                protocol_version="1.0",
            )
        ],
        skills=[echo_skill],
    )
