import os

import uvicorn

from agent.agent_card import build_agent_card
from agent.server import build_app


def main() -> None:
    host = os.environ.get("AGENT_HOST", "127.0.0.1")
    port = int(os.environ.get("AGENT_PORT", "9999"))

    agent_card = build_agent_card(url=f"http://{host}:{port}")
    app = build_app(agent_card)

    uvicorn.run(app, host=host, port=port)
